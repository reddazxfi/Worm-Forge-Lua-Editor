//!
//! The scope-aware `undefined-global` check.
//!
//! WHY THIS EXISTS
//! A name read but never bound anywhere compiles fine -- `into_function()` does not run
//! the chunk -- and then dies at runtime, and because `run_mods` aborts every mod in the
//! folder on the first error, one bad mod takes all of them down. This is the check that
//! catches it.
//!
//! It is also the headline case the port exists for: `t = r` inside an isolated function
//! used to PASS, because `local t` and `local r` happen to be declared in two other
//! functions. The flat pass accepts that on purpose (it does not model scope); this one
//! does not.
//!
//! WHY IT IS SAFER HERE THAN IN TYPESCRIPT
//! The TypeScript version walks a hand-written token stream and has to work out, for each
//! identifier, whether it is a read, a binding, a table key or a field name. Getting that
//! wrong produced 3,884 false positives across the pack corpus before it was fixed.
//!
//! On the full_moon AST almost all of that work is done by the parser. `local x`,
//! a function parameter, a `for k, v in` variable and a `{ key = value }` table key are
//! ALL `TokenReference`s or wrapped nodes -- none of them is ever a `Var`. So the things
//! that reach `visit_var` as a bare `Var::Name` are a genuine read, or the target of a
//! bare assignment (`x = 1`), which this module excludes by binding it as a global.
//!
//! The root of a DOTTED path (`cfg.speed`, `bit32.band`) is also a `Var::Name` and is
//! checked, which matches `parser.ts`. That is only safe because the root resolves
//! through the scope chain like anything else: `cfg` bound as a local or a parameter is
//! silent, and only a root that really is unbound is reported.
//!
//! What is deliberately NOT checked is the CALLEE of a dotted call, because that is
//! already covered by the same `Var::Name` walk. The one shape that needed its own hook
//! is a BARE callee -- `load_config()` -- which is a `Prefix::Name` and never a `Var` at
//! all. Missing it would have missed the single most valuable case this rule has.
//!
//! SCOPES
//! One scope per `function` and one per `for`, matching `services/scope.ts` exactly --
//! which scopes `if`/`while`/`do`/`repeat` as NOT introducing one. That is coarser than
//! Lua, and deliberately so: a `local` inside an `if` body is treated as belonging to the
//! enclosing function. Erring toward more scope can only ADD findings, and a false
//! warning on a pack that ships is the failure mode this whole checker exists to avoid.

use std::collections::HashSet;

use full_moon::ast::{
    Assignment, Ast, Expression, FunctionBody, FunctionDeclaration, GenericFor, LocalAssignment,
    LocalFunction, NumericFor, Var,
};
use full_moon::node::Node;
use full_moon::visitors::Visitor;

use crate::engine_data::KNOWN_GLOBALS;
use crate::AstDiagnostic;

/// Never an ERROR. A scope model is not a proof, and a false error on valid code costs
/// the user their trust in every other finding -- the same reasoning that keeps
/// `unknown-method` a warning in `check_method_call`.
const SEVERITY: &str = "warning";

/// Severity for a read the author has already nil-guarded with `or`.
///
/// INFO, not silence and not a warning. The finding is kept because the read is
/// genuinely of an undefined global and a pack author deserves to know -- it is
/// almost always a host-injected name (the engine's own `cargo test` harnesses
/// inject `HIGHLANDER_ROOT`, `HIGHLANDER_BASELINE` and `HIGHLANDER_CLAIMING` into
/// `mods/px`, and nothing injects them at runtime), so it is worth saying out loud.
/// Downgrading keeps it out of the Warn filter, where the unguarded case belongs:
/// "my pack stops loading" and "this is a nil-guarded host global" are not the same
/// alarm, and putting them at the same level teaches people to ignore the first.
const SEVERITY_NIL_GUARDED: &str = "info";

const RULE: &str = "undefined-global";

/// One lexical scope: its parent and the names bound directly inside it.
struct Scope {
    parent: Option<usize>,
    /// `(name, line the name becomes visible)`. Lua binds declaration-point-FORWARD,
    /// so a name is invisible to code above its own `local`.
    bindings: Vec<(String, usize)>,
}

/// A name read in a value position.
struct Read {
    name: String,
    line: usize,
    column: usize,
    /// The innermost scope the read occurred in.
    scope: usize,
}

#[derive(Default)]
struct Finder {
    scopes: Vec<Scope>,
    /// Innermost last. `scopes[0]` is the file scope, which is where globals live.
    stack: Vec<usize>,
    reads: Vec<Read>,
    /// Positions of reads that are the left operand of an `or`. See `visit_expression`.
    nil_guarded: HashSet<(usize, usize)>,
    /// Set by a `function M:m()` declaration; the implicit `self` belongs to the
    /// `FunctionBody` that follows. Lua binds `self` nowhere else.
    self_pending: bool,
}
impl Finder {
    fn new() -> Self {
        Self {
            scopes: vec![Scope {
                parent: None,
                bindings: Vec::new(),
            }],
            stack: vec![0],
            ..Default::default()
        }
    }

    fn current(&self) -> usize {
        *self.stack.last().unwrap_or(&0)
    }

    /// Binds in the innermost scope. This is how `local` and parameters work.
    fn bind_local(&mut self, name: &str, line: usize) {
        let here = self.current();
        self.scopes[here].bindings.push((name.to_string(), line));
    }

    /// Binds a GLOBAL, which is visible from everywhere -- including from inside a
    /// function defined before the assignment. `x = 1`, `function f()`, and the root of
    /// `function Obj.m()` all land here.
    fn bind_global(&mut self, name: &str, line: usize) {
        self.scopes[0].bindings.push((name.to_string(), line));
    }

    fn push_scope(&mut self) {
        let parent = self.current();
        self.scopes.push(Scope {
            parent: Some(parent),
            bindings: Vec::new(),
        });
        self.stack.push(self.scopes.len() - 1);
    }

    fn pop_scope(&mut self) {
        // Never pop the file scope. A malformed or synthesised tree can produce an exit
        // without a matching entry, and an underflow here would panic the whole command.
        if self.stack.len() > 1 {
            self.stack.pop();
        }
    }

    fn note_read(&mut self, name: &str, line: usize, column: usize) {
        self.reads.push(Read {
            name: name.to_string(),
            line,
            column,
            scope: self.current(),
        });
    }

    /// Walks outward from the read's own scope looking for a binding declared at or
    /// before it. The walk follows parent pointers, not an index range, so it terminates
    /// at the file scope and does not depend on scopes being popped in any order.
    fn is_visible(&self, name: &str, line: usize, scope: usize) -> bool {
        let mut cur = Some(scope);
        while let Some(id) = cur {
            let s = &self.scopes[id];
            if s.bindings.iter().any(|(n, l)| n == name && *l <= line) {
                return true;
            }
            cur = s.parent;
        }
        false
    }
}

/// The bare text of a name token, with trivia excluded.
///
/// `to_string()` on a `TokenReference` renders leading AND trailing trivia, and BOTH
/// halves have silently disabled checks on real mod code:
///
///   - LEADING WHITESPACE: the first name on an indented line renders as `"    wa"`.
///   - LEADING COMMENTS: worse, and invisible to `.trim()`. perf.lua opens with a
///     nine-line `--` block, so the first real token -- the `wa` of line 10 -- rendered
///     as that entire comment block, and the first "name" read in the file was
///     `"-- WormForge's FPS counter and profiler, on this machine."`. The pack sweep
///     reported 16 of 32 files with findings whose name was a COMMENT.
///
/// `.trim()` fixes the whitespace half and NOT the comment half, because a comment is
/// not whitespace. Reading the token type is exact rather than heuristic: trivia is not
/// part of the token, so it cannot leak in from either direction.
fn name_of(name: &full_moon::tokenizer::TokenReference) -> String {
    use full_moon::tokenizer::TokenType;
    match name.token().token_type() {
        TokenType::Identifier { identifier } => identifier.to_string(),
        TokenType::Symbol { symbol } => symbol.to_string(),
        // A name position holding anything else is not something this check can read,
        // and claiming knowledge about it would be a guess.
        _ => String::new(),
    }
}

fn pos<N: Node>(node: &N) -> (usize, usize) {
    match node.start_position() {
        Some(p) => (p.line(), p.character()),
        None => (1, 1),
    }
}
impl Visitor for Finder {
    /// `local x = 1`, `local a, b = f()`. The names are `TokenReference`s, so they never
    /// reach `visit_var` and cannot be mistaken for reads -- only the binding matters.
    fn visit_local_assignment(&mut self, node: &LocalAssignment) {
        let line = pos(node).0;
        for name in node.names() {
            let n = name_of(name);
            if !n.is_empty() {
                self.bind_local(&n, line);
            }
        }
    }

    /// `local function f()`. Binding the name in the ENCLOSING scope before the body is
    /// walked is what makes recursion work: Lua desugars this to `local f; f = function`,
    /// so `f` IS in scope inside its own body, and since the enclosing scope is still on
    /// the stack that falls out for free. Binding it to the file scope instead (as a
    /// plain `function f` does) would make every recursive helper report itself.
    ///
    /// `LocalFunction` does NOT contain a `FunctionDeclaration` -- it holds its own
    /// `name` and `body` fields -- so nothing is emitted for the shared declaration hook
    /// here. An earlier version used a "the next declaration is local" flag, which
    /// therefore never cleared and silently rebound every LATER `function Foo.bar()` as
    /// a local. The recursive-helper test caught it; `local_function_pending` is gone.
    fn visit_local_function(&mut self, node: &LocalFunction) {
        let n = name_of(node.name());
        if n.is_empty() {
            return;
        }
        self.bind_local(&n, pos(node).0);
    }

    /// `function f()`, `function Obj.m()`, `function Obj:m()`. Only the ROOT of a dotted
    /// name binds a global: `function Obj.m()` defines the global `Obj` and a field `m`
    /// on it, and binding `m` as a global would invent a name that does not exist.
    fn visit_function_declaration(&mut self, node: &FunctionDeclaration) {
        let line = pos(node).0;
        let name = node.name();
        // The method form `function Obj:m()` binds an implicit `self`.
        self.self_pending = name.method_colon().is_some();
        let root = name.names().iter().next().map(name_of).unwrap_or_default();
        if root.is_empty() {
            return;
        }
        self.bind_global(&root, line);
    }

    /// Opens the function scope and binds its parameters. Covers the anonymous callback
    /// form too (`on_fire = function(fire) ... end`), which is the most common way a
    /// WormForge pack declares one.
    fn visit_function_body(&mut self, node: &FunctionBody) {
        self.push_scope();
        let line = pos(node).0;
        if self.self_pending {
            self.self_pending = false;
            self.bind_local("self", line);
        }
        for param in node.parameters() {
            if let full_moon::ast::Parameter::Name(name) = param {
                let n = name_of(name);
                if !n.is_empty() {
                    self.bind_local(&n, line);
                }
            }
        }
    }

    fn visit_function_body_end(&mut self, _node: &FunctionBody) {
        self.pop_scope();
    }

    /// `for i = 1, 10 do`. The loop variable belongs to the body.
    fn visit_numeric_for(&mut self, node: &NumericFor) {
        self.push_scope();
        let line = pos(node).0;
        let n = name_of(node.index_variable());
        if !n.is_empty() {
            self.bind_local(&n, line);
        }
    }

    fn visit_numeric_for_end(&mut self, _node: &NumericFor) {
        self.pop_scope();
    }

    /// `for k, v in pairs(t) do`.
    fn visit_generic_for(&mut self, node: &GenericFor) {
        self.push_scope();
        let line = pos(node).0;
        for name in node.names() {
            let n = name_of(name);
            if !n.is_empty() {
                self.bind_local(&n, line);
            }
        }
    }

    fn visit_generic_for_end(&mut self, _node: &GenericFor) {
        self.pop_scope();
    }

    /// `x = 1` defines a GLOBAL. This is the one place an assignment target is a bare
    /// name rather than a field, so it is both a binding and -- unlike every other
    /// assignment shape -- something a naive walk would report as an undefined read.
    fn visit_assignment(&mut self, node: &Assignment) {
        let line = pos(node).0;
        for var in node.variables() {
            // `a.b = 1` is a field write on `a`, not a binding of `b`. Its root is a
            // `Var::Expression`, which this module does not examine at all.
            if let Var::Name(name) = var {
                let n = name_of(name);
                if !n.is_empty() {
                    self.bind_global(&n, line);
                }
            }
        }
    }

    fn visit_var(&mut self, var: &Var) {
        // A dotted or indexed path (`obj.kind`, `t[k]`) is a `Var::Expression`. Only a
        // bare name reaches here, and a bare name is the only shape this check claims
        // knowledge about.
        let full_moon::ast::Var::Name(name) = var else {
            return;
        };
        let n = name_of(name);
        if n.is_empty() {
            return;
        }
        // `x` in `x = 1` is an assignment target, not an undefined name. It was already
        // recorded as a global binding by `visit_assignment`, and `is_visible` will find
        // it in the file scope, so it needs no exclusion of its own.
        let (line, column) = pos(var);
        self.note_read(&n, line, column);
    }

    /// The CALLEE of a call. Without this the check misses the most valuable case there
    /// is -- calling a function that does not exist -- because a bare callee is a
    /// `Prefix::Name`, never a `Var`. An early version had no such hook and passed every
    /// test while silently missing `load_config()` entirely.
    ///
    /// `Prefix::Name` is also how `obj:hurt()` spells its receiver, but a receiver is
    /// almost always a parameter or a local, so it resolves through the scope chain and
    /// stays quiet. A root that really is unbound is exactly the nil call this rule
    /// exists to catch.
    ///
    /// A DOTTED callee (`bit32.band`, `cfg.load`) is a `Prefix::Expression` and is not
    /// reached here -- but its root is still checked, because it arrives as its own
    /// `Var::Name` child and `visit_var` sees it. Measured, not assumed: an earlier
    /// version of this comment claimed dotted roots were never examined, and
    /// `a_dotted_callee_is_not_reported...` failed because it was wrong.
    fn visit_function_call(&mut self, call: &full_moon::ast::FunctionCall) {
        let full_moon::ast::Prefix::Name(name) = call.prefix() else {
            return;
        };
        let n = name_of(name);
        if n.is_empty() {
            return;
        }
        let (line, column) = pos(name);
        self.note_read(&n, line, column);
    }

    /// Record every `X or Y` left operand as NIL-GUARDED.
    ///
    /// `local root = HIGHLANDER_ROOT or "mods/px/"` is the standard Lua way of
    /// saying "this may be nil, and here is what to use when it is". The read is
    /// real and it does evaluate to nil -- but the author has already handled that
    /// case, so warning at the same level as an unguarded read tells them their pack
    /// will stop loading when the very next token is the thing preventing it.
    ///
    /// Only the direct left operand of `or` counts. `X and Y or Z` guards with
    /// `and`, not `or`, and `f() or g()` has no name to record; both are left to
    /// warn, which is the conservative direction.
    fn visit_expression(&mut self, expr: &Expression) {
        // The operator is a FIELD of `Expression::BinaryOperator` in full_moon 3.0, not
        // a node of its own -- so this match arm is the only place `or` is visible.
        if let Expression::BinaryOperator {
            binop: full_moon::ast::BinOp::Or(_),
            lhs,
            ..
        } = expr
        {
            self.nil_guarded.insert(pos(lhs));
        }
    }
}
/// Runs the check over one parsed file.
///
/// Only called on a file that PARSED -- the same rule every other check here follows.
pub fn run(ast: &Ast) -> Vec<AstDiagnostic> {
    let mut finder = Finder::new();
    finder.visit_ast(ast);

    let mut out: Vec<AstDiagnostic> = Vec::new();
    let mut seen: HashSet<(usize, usize)> = HashSet::new();
    for read in &finder.reads {
        if KNOWN_GLOBALS.contains(&read.name.as_str()) {
            continue;
        }
        if finder.is_visible(&read.name, read.line, read.scope) {
            continue;
        }
        // The same name can be reached more than once through the tree; one finding per
        // position is what the console and the sweep both expect.
        if !seen.insert((read.line, read.column)) {
            continue;
        }
        let nil_guarded = finder.nil_guarded.contains(&(read.line, read.column));
        out.push(AstDiagnostic::finding(
            read.line,
            read.column,
            if nil_guarded { SEVERITY_NIL_GUARDED } else { SEVERITY },
            RULE,
            if nil_guarded {
                format!(
                    "Undefined name \"{}\" reads nil here, but the `or` fallback handles it. \
                     Nothing here defines it, and nothing injects it at runtime either -- \
                     the engine's own `cargo test` harnesses set a few names like this for \
                     `mods/px`, which is why the pack reads them defensively.",
                    read.name
                )
            } else {
                format!(
                    "Undefined name \"{}\" in this scope: nothing visible here defines it. \
                     Another function in this file may declare a \"{}\", but a local does not \
                     cross into this function -- at runtime this reads nil, or stops every \
                     mod loading.",
                    read.name, read.name
                )
            },
        ));
    }
    out.sort_by_key(|d| (d.line, d.column));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `X or default` -- the standard Lua "this may be nil" idiom.
    fn severities(src: &str) -> Vec<(String, String)> {
        let ast = full_moon::parse(src).expect("fixture must parse");
        run(&ast)
            .into_iter()
            .map(|d| (d.rule.as_str().to_string(), d.severity.to_string()))
            .collect()
    }

    #[test]
    fn a_nil_guarded_read_is_info_not_a_warning() {
        // `mods/px/rules.lua:15` and its siblings: the engine's own `cargo test`
        // harnesses inject HIGHLANDER_ROOT (crates/lua-host/src/lib.rs:3650) and
        // nothing injects it at runtime, so the pack reads it defensively. Warning
        // here says "your pack stops loading" one token before the `or` that prevents
        // exactly that.
        let out = severities("local root = HIGHLANDER_ROOT or \"mods/px/\"\n");
        assert_eq!(out, vec![(RULE.to_string(), SEVERITY_NIL_GUARDED.to_string())]);
    }

    #[test]
    fn an_unguarded_read_is_still_a_warning() {
        // The change must not have cost the rule anything: the same name in an
        // unguarded position is still the loud one.
        let out = severities("print(HIGHLANDER_ROOT)\n");
        assert_eq!(out, vec![(RULE.to_string(), SEVERITY.to_string())]);
    }

    #[test]
    fn and_binds_tighter_than_or_so_the_or_still_covers_it() {
        // `MISSING and 1 or 2` parses as `(MISSING and 1) or 2`, because `and` binds
        // tighter than `or` in Lua. MISSING is nil, so that whole expression yields 2
        // and never trips. It IS nil-guarded, and the position recorded is the start of
        // the `and` -- which is where MISSING sits.
        let out = severities("local v = MISSING and 1 or 2\n");
        assert_eq!(out, vec![(RULE.to_string(), SEVERITY_NIL_GUARDED.to_string())]);
    }

    #[test]
    fn and_with_no_or_is_not_a_guard() {
        // The control for the test above: remove the `or` and the read is genuinely
        // unguarded again.
        let out = severities("local v = MISSING and 1\n");
        assert_eq!(out, vec![(RULE.to_string(), SEVERITY.to_string())]);
    }

    #[test]
    fn only_the_left_operand_of_or_is_guarded() {
        let out = severities("local v = 1 or MISSING\n");
        assert_eq!(out, vec![(RULE.to_string(), SEVERITY.to_string())]);
    }

    #[test]
    fn a_field_access_is_not_a_read_at_all() {
        assert!(severities("local v = t.missing or 1\n").is_empty());
    }

    #[test]
    fn a_guarded_read_still_reports_the_name_and_stays_the_same_rule() {
        let ast = full_moon::parse("local root = HIGHLANDER_ROOT or \"x\"\n").unwrap();
        let d = &run(&ast)[0];
        assert_eq!(d.rule.as_str(), RULE);
        assert!(d.message.contains("HIGHLANDER_ROOT"), "got {:?}", d.message);
        assert!(
            d.message.contains("fallback handles it"),
            "the guarded wording must say so, got {:?}",
            d.message
        );
        assert!(
            !d.message.contains("stops every mod loading"),
            "that half was never true for a guarded read: {:?}",
            d.message
        );
    }

    /// The first word of each message, which is the offending name.
    fn names(src: &str) -> Vec<String> {
        let ast = full_moon::parse(src).expect("test input must parse");
        run(&ast)
            .into_iter()
            .map(|d| d.message.split('"').nth(1).unwrap_or_default().to_string())
            .collect()
    }

    fn is_clean(src: &str) -> bool {
        let ast = full_moon::parse(src).expect("test input must parse");
        let found: Vec<String> = run(&ast).into_iter().map(|d| d.message).collect();
        assert!(found.is_empty(), "expected no findings, got {found:?}");
        true
    }

    // ---- the headline case ------------------------------------------------
    //
    // `local t` and `local r` exist, but in two OTHER functions. A local does not cross
    // into a function, so this reads nil at run time. The flat pass accepts it on
    // purpose; this is the check that catches it.

    #[test]
    fn a_local_from_another_function_is_not_visible() {
        let src = "\
local function a()
  local t = 1
  return t
end

local function b()
  local r = 2
  return r
end

function M.onTick()
  print(t, r)
end
";
        // `print` itself is a real Lua global, so it is never reported.
        assert_eq!(names(src), vec!["t", "r"]);
    }

    #[test]
    fn an_assignment_to_an_unbound_name_is_a_global_write_not_a_read() {
        // `t = r` does NOT report `t`: assigning to an undeclared name CREATES a global,
        // which is what Lua does, so `t` is defined by that statement. Only the
        // right-hand side is an undefined read. parser.ts agrees -- its pass 2 skips
        // any identifier followed by `=`.
        let src = "\
function M.onTick()
  t = r
end
";
        assert_eq!(names(src), vec!["r"]);
    }

    #[test]
    fn the_same_name_in_the_same_function_is_fine() {
        assert!(is_clean("\
function M.onTick()
  local t = 1
  local r = 2
  t = r
end
"));
    }

    // ---- indented, nested, realistic --------------------------------------
    //
    // Every fixture below sits inside nested blocks on purpose. A token carries its
    // LEADING trivia, so the first name on an indented line arrives as `"    wa"` and
    // every name comparison silently fails -- that is exactly how `unknown-method`,
    // `wa-namespace-typo` and A5 were all dead on real mod code while every column-0
    // unit test passed. Column-0 fixtures are what hid that bug, so they are not enough.

    #[test]
    fn parameters_are_visible_deep_inside_a_nested_callback() {
        assert!(is_clean("\
wa.on.hurt(function(worm, ev)
  if ev ~= nil then
    for _, other in wa.worms.all() do
      local distance = worm.pos:distance(other.pos)
      if distance < 100 then
        worm:hurt(10)
      end
    end
  end
end)
"));
    }

    #[test]
    fn an_unbound_name_inside_a_nested_callback_is_caught() {
        let src = "\
function M.onTick()
  local cfg = load_config()
  for _, w in wa.worms.all() do
    if w.alive then
      print(cfg.name)
    end
  end
end
";
        assert_eq!(names(src), vec!["load_config"]);
    }

    #[test]
    fn loop_variables_do_not_leak_out_of_the_loop() {
        let src = "\
function M.onTick()
  for k, v in pairs(tally) do
    print(k, v)
  end
  return k
end
";
        // `tally` is unbound too, and `k` is genuinely out of scope after the loop.
        assert_eq!(names(src), vec!["tally", "k"]);
    }
#[test]
    fn a_local_inside_an_if_body_is_still_visible_after_it() {
        // Deliberately LOOSE, and deliberately so: `if` bodies do not open a scope in
        // this model, matching services/scope.ts. Being coarse here can only ever
        // reduce findings, which is the safe direction -- a false warning on a pack
        // that ships is the failure mode this checker exists to avoid.
        assert!(is_clean("\
function M.onTick(worm)
  if worm then
    local scratch = 1
  end
  return scratch
end
"));
    }

    // ---- forms that must NOT be reported ---------------------------------

    #[test]
    fn a_recursive_local_function_sees_itself() {
        // `local function walk` binds `walk` in the ENCLOSING scope, and Lua makes it
        // visible inside its own body. Binding it to the file scope instead (as a plain
        // `function walk` does) would make every recursive helper report itself.
        assert!(is_clean("\
local function walk(n)
  if n > 0 then
    return walk(n - 1)
  end
  return 0
end

return walk(3)
"));
    }

    #[test]
    fn a_dotted_function_declaration_binds_only_its_root() {
        assert!(is_clean("\
local M = {}

function M.onTick()
  M.done = true
end

function M.helper()
  return M.done
end

return M
"));
    }

    #[test]
    fn a_method_declaration_binds_self() {
        // `self` is bound nowhere else in Lua; without this every `function Obj:m()`
        // body would report its own receiver.
        assert!(is_clean("\
function Obj:ammo(n)
  return n
end

return Obj
"));
    }

    #[test]
    fn table_keys_are_not_reads() {
        // `{ copy_fromm = 'bazooka' }` -- the key is a field name, not a variable. Table
        // constructor keys are `TokenReference`s in full_moon, so they never reach
        // `visit_var`, but the behaviour is pinned because it is load-bearing.
        assert!(is_clean("\
wa.weapons.replace({
  copy_fromm = 'bazooka',
  on_fire = function()
    return true
  end,
})
"));
    }

    #[test]
    fn field_reads_and_writes_are_not_global_reads() {
        // `obj:hurt()` and `M.cache[obj.id] = true` are a `Var::Expression` in full_moon,
        // so the root of a dotted path is never examined. That is the quiet direction on
        // purpose: a table built in one file and read in another is not an undefined
        // global, and flagging it would be a false positive on legitimate packs.
        assert!(is_clean("\
function M.onTick(obj)
  obj:hurt(10)
  M.cache = {}
  M.cache[obj.id] = true
  return M.cache
end
"));
    }

    #[test]
    fn globals_the_engine_injects_are_never_reported() {
        // `wa` is the only global the host actually sets (crates/lua-host/src/api.rs).
        assert!(is_clean("\
function M.onTick()
  local gs = wa.game_state(1)
  gs.states.AIR_TIME = 30
  math.max(1, 2)
  table.insert(M.list, 1)
  print(tostring(#M.list))
end
"));
    }

    #[test]
    fn calling_a_function_lua54_removed_is_reported() {
        // `unpack` was renamed to `table.unpack` in Lua 5.2 and this engine is 5.4, so
        // `unpack(...)` is a nil call at run time. A KNOWN_GLOBALS that still listed it
        // would silence a real crash.
        //
        // `bit32.band` is deliberately NOT expected here. It is a DOTTED callee, and
        // dotted roots are skipped on purpose -- see `visit_function_call`. The
        // asymmetry is the point: a bare callee is checked, a field lookup is not.
        let src = "\
function M.onTick()
  local y = unpack({1, 2})
  return y
end
";
        assert_eq!(names(src), vec!["unpack"]);
    }

    #[test]
    fn a_dotted_callees_unknown_root_is_reported() {
        // The root of a dotted path is a `Var::Name` child, so it IS checked. An earlier
        // version of this file asserted the opposite and failed -- the comment claiming
        // field roots were never examined was wrong. `parser.ts` checks them too, so this
        // is parity rather than a new warning.
        let src = "\
function M.onTick()
  local y = bit32.band(1, 2)
  return y
end
";
        assert_eq!(names(src), vec!["bit32"]);
    }

    #[test]
    fn a_dotted_callee_on_a_bound_root_is_silent() {
        // The half of that boundary that keeps it safe: as long as the root resolves,
        // nothing is reported however deep the path goes.
        let src = "\
function M.onTick(cfg)
  local y = cfg.math.band(1, 2)
  return y
end
";
        assert_eq!(names(src), Vec::<String>::new());
    }

    #[test]
    fn a_global_assigned_later_in_the_file_is_still_a_global() {
        // `x = 1` anywhere binds a GLOBAL, visible everywhere after it -- including from
        // inside a function defined earlier in the file, which is how packs write.
        assert!(is_clean("\
function M.onTick()
  tally = tally + 1
end

tally = 0
"));
    }

    #[test]
    fn a_name_used_before_its_local_is_reported() {
        // Lua binds declaration-point-FORWARD. This is a genuine nil read.
        let src = "\
function M.onTick()
  print(later)
  local later = 1
  return later
end
";
        assert_eq!(names(src), vec!["later"]);
    }

    #[test]
    fn a_clean_pack_produces_nothing() {
        assert!(is_clean("\
local M = {}

function M.onTick()
  local worm = wa.worms.nearest(1)
  if not worm then return end
  local arsenal = wa.inventory.create({ weapon = 'bazooka' })
  arsenal:set(worm, 'ammo', 5)
end

return M
"));
    }

    #[test]
    fn a_leading_comment_block_is_not_part_of_the_first_name() {
        // REGRESSION, and the single biggest source of noise this check produced: the
        // pack sweep reported 16 of 32 files with findings whose "name" was a COMMENT.
        //
        // perf.lua opens with a nine-line `--` block, and the first real token is the
        // `wa` of line 10. A token carries its LEADING trivia, so that token rendered as
        // the entire comment block, and the first name read in the file was
        // `"-- WormForge's FPS counter and profiler, on this machine."`.
        //
        // `.trim()` cannot fix this: a comment is not whitespace. That is the whole
        // reason `name_of` reads the token type instead of trimming the rendering.
        let src = "\
-- WormForge's FPS counter and profiler, on this machine.
--
-- counter: one line at the top right: the live frame rate, the average over
--   the last 2 s, and the longest frame in the last 5 s, in ms.
-- profile: every 10 s, a \"perf:\" line in wkLua.log with each part of a
--   rendered frame: its average and worst ms per frame, its share of the
--   frame, and how often it ran.
--
-- Presentation only: no timing reaches the game, so it is safe online.
wa.perf.enable({ counter = true, profile = true })
";
        assert_eq!(names(src), Vec::<String>::new());
    }

    #[test]
    fn a_trailing_comment_is_not_part_of_a_name() {
        // The mirror image, pinned because the two halves of the trivia problem are
        // independent and either one alone silently disables the check.
        let src = "\
function M.onTick()
  local dx = 1 -- perpendicular distance to the ray
  local dy = 2 --[[ block ]]
  return dx + dy
end
";
        assert_eq!(names(src), Vec::<String>::new());
    }

    #[test]
    fn a_comment_after_a_state_key_does_not_break_the_a5_check() {
        // The same trivia trap one file over, in checks.rs. Kept here because the two
        // bugs are the same bug, and this is the shape a pack actually writes.
        let src = "\
function M.onTick()
  local dx = 1 -- perpendicular distance
  wa.game_state(1).states.AIR_TIME = 30
end
";
        assert_eq!(names(src), Vec::<String>::new());
    }

    #[test]
    fn a_table_key_does_not_bind_a_variable() {
        // VERIFIED TRUE POSITIVE on the user's own bee.lua:
        //
        //   startX      = opts.x,   -- line 491, a table KEY
        //   lastSafeX   = startX,   -- line 495, a bare READ
        //
        // `startX` is never bound anywhere in the corpus, so line 495 reads nil.
        // `parser.ts` misses this because its flat pass treats ANY identifier followed
        // by `=` as a binding, and a table key looks exactly like that. A table
        // constructor key is a `TokenReference` in full_moon and never a `Var`, so the
        // correct binding does not happen here -- which is why Rust catches it and the
        // TypeScript baseline does not.
        let src = "\
function M.onTick(opts)
  local bee = {
    startX = opts.x,
    lastSafeX = startX,
  }
  return bee
end
";
        assert_eq!(names(src), vec!["startX"]);
    }

    #[test]
    fn a_table_key_on_a_bound_name_is_still_silent() {
        // The other half: keys are not reads, so `wa.weapons.replace{...}` and every
        // config table in every pack stays clean.
        let src = "\
function M.onTick(opts)
  local startX = opts.x
  local bee = {
    startX = startX,
    lastSafeX = startX,
  }
  return bee
end
";
        assert_eq!(names(src), Vec::<String>::new());
    }
}