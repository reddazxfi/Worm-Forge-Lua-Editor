// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use full_moon::ast::{self, LastStmt};
use full_moon::node::Node;
use full_moon::visitors::Visitor;
use serde::Serialize;

mod checks;
mod engine_data;
mod scopes;

/// Compiles a Lua 5.4 chunk without running it.
///
/// This is the same front end the game uses. The engine's `sandbox::run_script`
/// (crates/lua-host/src/sandbox.rs:41) is `lua.load(src).set_name(x).exec()`.
/// We stop one step earlier at `into_function()`, which parses, resolves
/// upvalues and emits bytecode but never calls the chunk -- so the engine's
/// `strip_unsafe` sandbox is not needed, because nothing executes.
///
/// `async` so the compile runs off the UI thread; a sync command would block it
/// on every check. `mlua::Lua` is not `Send`, but it is created and dropped
/// inside one non-await scope, so the future stays `Send`.
///
/// On failure the error string is Lua's own, e.g.
/// `syntax error: [string "rules.lua"]:3: 'end' expected (to close 'function' at line 1)`.
/// Note the `[string ".."]` wrapper: mlua's set_name does not strip it, and
/// src/services/luaCompiler.ts parses against exactly this shape.
#[tauri::command]
async fn compile_lua(source: String, chunk_name: String) -> Result<(), String> {
    let lua = mlua::Lua::new();
    lua.load(&source)
        .set_name(&chunk_name)
        .into_function()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// One diagnostic from full_moon, flattened for the wire.
///
/// Also carries B2's semantic-check findings, which share the shape so the front
/// end has ONE diagnostic list rather than two. `severity` is "error" for a parse
/// failure and whatever the check decided for a semantic finding; `rule` is the
/// stable id the console filters on.
#[derive(Serialize)]
#[derive(Debug)]
#[serde(rename_all = "camelCase")]
struct AstDiagnostic {
    line: usize,
    column: usize,
    message: String,
    severity: String,
    rule: String,
    /// The long-form explanation, for the console's expandable row.
    ///
    /// `message` is the short, actionable half -- what to do. This is the reasoning:
    /// why the engine behaves this way, what it costs at runtime. `worm-msg-filter`
    /// ran to ~470 characters in `message`, which is ~60 wrapped lines on a 1366-wide
    /// display and buried every other row. Optional and usually absent.
    ///
    /// `skip_serializing_if` keeps the key off the wire entirely when there is no
    /// detail, so the front end's `detail?: string` stays honestly optional instead
    /// of receiving a null on the ~90% of findings that have nothing to expand.
    #[serde(skip_serializing_if = "Option::is_none")]
    detail: Option<String>,
}

impl AstDiagnostic {
    fn parse_error(line: usize, column: usize, message: String) -> Self {
        Self {
            line,
            column,
            message,
            severity: "error".to_string(),
            rule: "lua-ast".to_string(),
            detail: None,
        }
    }

    fn finding(line: usize, column: usize, severity: &str, rule: &str, message: String) -> Self {
        Self {
            line,
            column,
            message,
            severity: severity.to_string(),
            rule: rule.to_string(),
            detail: None,
        }
    }

    /// A finding whose `message` is the short action and whose `detail` is the
    /// reasoning. Same shape as `finding`; only the console's expanded row differs.
    fn finding_with_detail(
        line: usize,
        column: usize,
        severity: &str,
        rule: &str,
        message: String,
        detail: String,
    ) -> Self {
        Self {
            line,
            column,
            message,
            severity: severity.to_string(),
            rule: rule.to_string(),
            detail: Some(detail),
        }
    }
}

/// A `local X = <call>` binding, or a `function f() ... return <call> end`.
/// `call` is the dotted callee as written (`wa.worms.nearest`), or None when the
/// right-hand side is not a plain call we can name.
#[derive(Serialize)]
struct AstBinding {
    name: String,
    line: usize,
    call: Option<String>,
}

/// One parameter of a user-defined function.
///
/// `type` is a reserved word in Rust, hence `r#type`. Serde emits it as `type`,
/// which is what `ParameterDef` in types/wormforge.ts expects.
///
/// Clone is needed because a function's parameters are also copied into the
/// custom-class member discovered from `function O.m(...)`.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AstParameter {
    name: String,
    r#type: String,
}

/// A function the USER wrote. Mirrors `FunctionDef` in types/wormforge.ts.
///
/// Only extracted symbols cross the wire. The engine's own API table
/// (BUILTIN_FUNCTIONS) stays in TypeScript and is merged on the front end, so
/// moving definitions to Rust stays a separate, optional step.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AstFunction {
    name: String,
    parameters: Vec<AstParameter>,
    description: String,
    /// "global" for `function f()` / `function O.m()`, "module" for `local function`.
    scope: String,
}

/// A variable the USER wrote. Mirrors `VariableDef`.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AstVariable {
    name: String,
    r#type: String,
    description: String,
    /// "module" for `local`, "global" for a bare `x = 1`.
    scope: String,
}

/// A member seen on a user-defined table. Mirrors `ClassMemberDef`.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AstMember {
    name: String,
    /// "method" or "property", matching `ClassMemberDef.kind`.
    kind: String,
    parameters: Vec<AstParameter>,
    description: String,
    example: String,
}

/// A table the USER works with, discovered from `a.b` / `a:b` usage.
/// Mirrors `ClassDef`. Always `is_custom: true` -- these are inferred from usage,
/// never declared.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AstClass {
    name: String,
    description: String,
    members: Vec<AstMember>,
    is_custom: bool,
}

/// Everything phase 1 needs from a real parse. Deliberately a summary, not the
/// AST itself: serializing the whole tree would ship every token to the front
/// end to answer two questions (does it parse, which names bind to which call).
///
/// Now also carries the EXTRACTED symbol tree, which is what B1 is: the front end
/// can now take symbols straight from a real parse instead of from the
/// hand-written tokenizer. `enums` is absent on purpose -- they are static data,
/// never parsed, so they stay in TypeScript.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AstReport {
    ok: bool,
    diagnostics: Vec<AstDiagnostic>,
    locals: Vec<AstBinding>,
    functions: Vec<AstBinding>,
    /// User-declared functions as `FunctionDef` shapes, for the API tree. Kept
    /// apart from `functions` above, which is BINDINGS (name + returned callee,
    /// used by the receiver trace) rather than a symbol-tree entry.
    functions_decl: Vec<AstFunction>,
    variables: Vec<AstVariable>,
    classes: Vec<AstClass>,
    /// Every `a.b` / `a:b` member name seen, for the API tree's "custom verbs".
    custom_verbs: Vec<String>,
}

#[derive(Default)]
struct BindingVisitor {
    locals: Vec<AstBinding>,
    functions: Vec<AstBinding>,
    /// B1: the extracted symbol tree. `functions_decl` is separate from
    /// `functions` because the two answer different questions -- `functions` is
    /// bindings (name + what it returns, for the receiver trace), this is the
    /// symbol tree the API pane renders.
    functions_decl: Vec<AstFunction>,
    variables: Vec<AstVariable>,
    classes: Vec<AstClass>,
    custom_verbs: Vec<String>,
}

impl BindingVisitor {
    /// Records `receiver.member` discovered from real usage.
    ///
    /// This is the token-parser's "custom class" feature, but derived from the AST
    /// instead of from adjacent token values. `seen` is the member's own name, so
    /// a member is only appended once per class; `custom_verbs` is a flat list of
    /// every member name seen anywhere, which is what the API tree shows.
    fn note_member(
        &mut self,
        receiver: &str,
        member: &str,
        is_method: bool,
        params: Vec<AstParameter>,
        line: usize,
    ) {
        let example = if is_method {
            format!("{receiver}:{member}({})", param_names(&params))
        } else {
            format!("{receiver}.{member}")
        };

        self.custom_verbs.push(member.to_string());

        let cls = match self.classes.iter_mut().find(|c| c.name == receiver) {
            Some(c) => c,
            None => {
                self.classes.push(AstClass {
                    name: receiver.to_string(),
                    description: format!(
                        "Custom class identified via Lua syntax ({receiver}{}{member}) at line {line}",
                        if is_method { ":" } else { "." }
                    ),
                    members: Vec::new(),
                    is_custom: true,
                });
                self.classes.last_mut().expect("just pushed")
            }
        };

        if cls.members.iter().any(|m| m.name == member) {
            return;
        }
        cls.members.push(AstMember {
            name: member.to_string(),
            kind: if is_method { "method" } else { "property" }.to_string(),
            parameters: params,
            description: format!(
                "Custom {} invoked on {receiver}",
                if is_method { "method" } else { "property" }
            ),
            example,
        });
    }
}

/// Parameter names joined for an `example` string.
fn param_names(params: &[AstParameter]) -> String {
    params.iter().map(|p| p.name.clone()).collect::<Vec<_>>().join(", ")
}

/// Extracts a function's parameter list.
///
/// full_moon 3 models `Parameter` as an ENUM, not a struct:
/// `Parameter::Name(TokenReference)` for `a` and `Parameter::Ellipsis(..)` for
/// `...`. There is no per-parameter type -- Lua has none, and full_moon keeps any
/// annotations in a separate `type_specifiers()` list on the FunctionBody. Every
/// parameter therefore reports `any`, which is honest rather than invented; the
/// token parser did the same thing by defaulting unrecognised types to `any`.
fn parameters_of(body: &ast::FunctionBody) -> Vec<AstParameter> {
    body.parameters()
        .iter()
        .filter_map(|p| match p {
            ast::Parameter::Name(t) => Some(AstParameter {
                name: t.token().to_string(),
                r#type: "any".to_string(),
            }),
            ast::Parameter::Ellipsis(t) => Some(AstParameter {
                name: t.token().to_string(),
                r#type: "vararg".to_string(),
            }),
            // `Parameter` is `#[non_exhaustive]`; a future variant must not break
            // the build, it just is not reported.
            _ => None,
        })
        .collect()
}

impl Visitor for BindingVisitor {
    fn visit_local_assignment(&mut self, node: &ast::LocalAssignment) {
        let line = node.start_position().map(|p| p.line()).unwrap_or(0);
        // `local a, b = f(), g()` pairs names with expressions by position. When
        // there are more names than values the extras have no initializer
        // (`local a, b = f()`), so they are recorded with call: None rather than
        // inheriting f()'s type.
        let names: Vec<String> = node.names().iter().map(|n| n.token().to_string()).collect();
        let exprs: Vec<&ast::Expression> = node.expressions().iter().collect();
        for (i, name) in names.iter().enumerate() {
            let call = exprs.get(i).and_then(|e| callee_of(e));

            // B1: a `local` is also a VariableDef. Deduplicated BY NAME, which is
            // what App.tsx does when it merges the tree anyway (`seenVars`), so
            // doing it here keeps the payload small -- `local t` in twenty
            // functions is one entry on screen, not twenty.
            if !self.variables.iter().any(|v| v.name == *name) {
                self.variables.push(AstVariable {
                    name: name.clone(),
                    r#type: "local".to_string(),
                    description: format!("Local variable declared at line {line}"),
                    scope: "module".to_string(),
                });
            }

            self.locals.push(AstBinding {
                name: name.clone(),
                line,
                call,
            });
        }
    }

    /// Handles both sides of an assignment.
    ///
    /// `x = 1` is a global VARIABLE. `a.b = v` is a member of `a` -- and
    /// `obj.kind = "worm"` is the single most common way a pack labels a handle,
    /// never appearing as a call. Without this branch `obj` never becomes a class
    /// at all and the docs pane shows nothing for it.
    ///
    /// `t[k] = v` is an index store with no name to key on, so it is skipped.
    fn visit_assignment(&mut self, node: &ast::Assignment) {
        let line = node.start_position().map(|p| p.line()).unwrap_or(0);

        for var in node.variables() {
            match var {
                ast::Var::Name(name) => {
                    let n = name.token().to_string();
                    if !self.variables.iter().any(|v| v.name == n && v.scope == "global") {
                        self.variables.push(AstVariable {
                            name: n,
                            r#type: "global".to_string(),
                            description: format!("Global variable assigned at line {line}"),
                            scope: "global".to_string(),
                        });
                    }
                }
                // `a.b = v` -- a member of `a`. `a.b.c = v` records only `b` against
                // `a`, for the same reason `a.b.c()` does: `c` belongs to `a.b`.
                // `Var::Expression` wraps a `VarExpression`, not an `Expression`,
                // so the root/suffixes come off that type directly.
                ast::Var::Expression(expr) => {
                    // VarExpression::prefix() is an `ast::Prefix`, so the root name
                    // is behind a second match rather than being a Var directly.
                    let ast::Prefix::Name(root) = expr.prefix() else { continue };
                    let Some(suffix) = expr.suffixes().next() else { continue };
                    if let ast::Suffix::Index(ast::Index::Dot { name, .. }) = suffix {
                        self.note_member(
                            &root.token().to_string(),
                            &name.token().to_string(),
                            false,
                            Vec::new(),
                            line,
                        );
                    }
                }
                // `Var` is #[non_exhaustive]; a future variant is simply not reported.
                _ => {}
            }
        }
    }

    /// Discovers `a.b(...)` / `a:b(...)` from real usage.
    ///
    /// This is the token parser's "custom class" feature, derived from the tree
    /// instead of from adjacent token values. Two things it gets right that the
    /// token walk could not: a `.` inside a string or comment no longer invents a
    /// class, and `a\n  .b(...)` split across lines is still found.
    ///
    /// Only the FIRST suffix is recorded. In `a.b.c(...)`, `c` is a member of
    /// whatever `a.b` is -- not of `a` -- so reporting it against `a` would invent
    /// a member that does not exist.
    fn visit_function_call(&mut self, node: &ast::FunctionCall) {
        let line = node.start_position().map(|p| p.line()).unwrap_or(0);

        // Rooted at a call result (`f().x`) there is no name to key a class on.
        let ast::Prefix::Name(root) = node.prefix() else {
            return;
        };
        let receiver = root.token().to_string();

        // `suffixes()` returns an ITERATOR in full_moon 3, not a slice.
        let Some(first) = node.suffixes().next() else {
            return;
        };

        // Argument text for the example signature. `FunctionArgs` is a
        // #[non_exhaustive] enum with named fields -- there is no `.arguments()`
        // accessor, so the variant is matched directly. `call "str"` and
        // `call {...}` have no parenthesised list and yield nothing.
        let args: &ast::FunctionArgs = match first {
            ast::Suffix::Call(ast::Call::AnonymousCall(a)) => a,
            ast::Suffix::Call(ast::Call::MethodCall(m)) => m.args(),
            // `a.b(...)` -- no arguments to read, but the member still exists.
            ast::Suffix::Index(ast::Index::Dot { .. }) => {
                let (member, is_method) = match first {
                    ast::Suffix::Index(ast::Index::Dot { name, .. }) => {
                        (name.token().to_string(), false)
                    }
                    _ => unreachable!(),
                };
                self.note_member(&receiver, &member, is_method, Vec::new(), line);
                return;
            }
            _ => return,
        };
        let args_text: Vec<String> = match args {
            ast::FunctionArgs::Parentheses { arguments, .. } => {
                arguments.iter().map(|e| e.to_string()).collect()
            }
            _ => Vec::new(),
        };

        let (member, is_method) = match first {
            ast::Suffix::Index(ast::Index::Dot { name, .. }) => (name.token().to_string(), false),
            ast::Suffix::Call(ast::Call::MethodCall(m)) => (m.name().token().to_string(), true),
            _ => return,
        };

        let params: Vec<AstParameter> = args_text
            .iter()
            .map(|a| AstParameter {
                name: a.clone(),
                r#type: "any".to_string(),
            })
            .collect();

        self.note_member(&receiver, &member, is_method, params, line);
    }

    /// `function f()` / `function O.m()` -- a global (or a field on a global).
    fn visit_function_declaration(&mut self, node: &ast::FunctionDeclaration) {
        let line = node.start_position().map(|p| p.line()).unwrap_or(0);
        let params = parameters_of(node.body());
        let name = node.name().to_string();
        // `function O.m()` and `function O:m()` both declare a member on the global
        // `O`, so O becomes a custom class carrying it -- the same thing the
        // token parser did from adjacent `.`/`:` tokens. Both separators are
        // accepted because full_moon renders the method form with a colon.
        if let Some((recv, member)) = name.split_once('.') {
            self.note_member(recv, member, true, params.clone(), line);
        } else if let Some((recv, member)) = name.split_once(':') {
            self.note_member(recv, member, true, params.clone(), line);
        }

        self.functions.push(AstBinding {
            name: name.clone(),
            line,
            call: first_callee(node.body().block().last_stmt()),
        });
        self.functions_decl.push(AstFunction {
            description: format!("Function defined at line {line}"),
            parameters: params,
            name,
            scope: "global".to_string(),
        });
    }

    /// `local function f()` -- module scope.
    fn visit_local_function(&mut self, node: &ast::LocalFunction) {
        let line = node.start_position().map(|p| p.line()).unwrap_or(0);
        let params = parameters_of(node.body());
        let name = node.name().to_string();

        self.functions.push(AstBinding {
            name: name.clone(),
            line,
            call: first_callee(node.body().block().last_stmt()),
        });
        self.functions_decl.push(AstFunction {
            description: format!("Local function defined in script at line {line}"),
            parameters: params,
            name,
            scope: "module".to_string(),
        });
    }
}

/// A function's type is the type of what it returns, so only a single return
/// value is usable here. `return a, b` (a target plus its distance, as the user
/// pack does) is not a handle and is skipped.
fn first_callee(last: Option<&LastStmt>) -> Option<String> {
    match last {
        Some(LastStmt::Return(r)) => match r.returns().iter().collect::<Vec<_>>()[..] {
            [only] => callee_of(only),
            _ => None,
        },
        _ => None,
    }
}

/// The dotted callee of a call expression, e.g. `wa.worms.nearest(a)` ->
/// `wa.worms.nearest`. None for anything else, including method calls
/// (`a:despawn()`), index calls (`t.f()`) and wrapped expressions
/// (`not wa.land.solid(x, y)`).
///
/// Staying this strict is the point. The hand-written regex this replaces
/// scanned a fixed text window and happily typed `trunc` as
/// `wa.actors.spawn`; declining to name a callee we cannot see exactly is what
/// keeps a wrong type out of the suggestions.
fn callee_of(expr: &ast::Expression) -> Option<String> {
    let ast::Expression::FunctionCall(call) = expr else {
        return None;
    };
    let ast::Prefix::Name(root) = call.prefix() else {
        return None;
    };

    let mut parts = vec![root.token().to_string()];
    for suffix in call.suffixes() {
        match suffix {
            // The `(...)` of the call we are naming. `Call` is an enum: a method
            // call means the receiver is not a global path, so there is nothing
            // to resolve against the engine tables.
            ast::Suffix::Call(ast::Call::AnonymousCall(_)) => {}
            ast::Suffix::Call(ast::Call::MethodCall(_)) => return None,
            // `.name` extends the dotted path.
            ast::Suffix::Index(ast::Index::Dot { name, .. }) => {
                parts.push(name.token().to_string());
            }
            _ => return None,
        }
    }

    // Engine calls are at most `wa.a.b.c`. Anything deeper is a lookup chain on
    // some unknown table, and naming it would invent a type. A bare single
    // identifier is a local, which the caller's own binding already covers.
    if parts.len() > 4 || parts.len() < 2 {
        return None;
    }
    Some(parts.join("."))
}

/// One user-registered verb from custom_verbs.cfg, as it crosses IPC: the
/// (class, member) pair is all checks.rs needs to stay silent. Descriptions do
/// not cross -- they already live in the front end's overlay for suggestions
/// and docs.
#[derive(serde::Deserialize)]
struct CustomVerbPair(String, String);

/// Parses with full_moon and reports bindings plus any syntax errors.
///
/// `custom` is the custom_verbs.cfg overlay, OPTIONAL so an old front end --
/// or the sweep harness, which calls `checks::run` directly and never this
/// command -- keeps invoking with just `{ source }`. Missing means "no custom
/// verbs known", never an error: an old EXE with a new UI degrades to the
/// pinned engine data, which is exactly what it always did.
#[tauri::command]
async fn parse_lua_ast(source: String, custom: Option<Vec<CustomVerbPair>>) -> Result<AstReport, String> {
    // Unpack the overlay up front: each IPC pair becomes the (class, member)
    // `run_with_custom` matches against. Garbage cannot arrive here -- the
    // front end sanitizes every row before it is ever stored -- but an empty
    // or half pair still degrades to "unknown" rather than a panic.
    let custom_verbs: Vec<(String, String)> = custom
        .unwrap_or_default()
        .into_iter()
        .filter(|CustomVerbPair(c, m)| !c.is_empty() && !m.is_empty())
        .map(|CustomVerbPair(c, m)| (c, m))
        .collect();
    // Phase 1 of the AST migration. The front end keeps using the hand-written
    // parser for everything else; this exists so the two can be compared on the
    // same input before the built-in one is replaced.
    //
    // A failed parse is a normal result here, not an Err: the syntax errors ARE
    // the answer, and App.tsx renders them as diagnostics.
    match full_moon::parse(&source) {
        Ok(ast) => {
            let mut visitor = BindingVisitor::default();
            visitor.visit_ast(&ast);
            // custom_verbs is a flat list of every member name seen and can
            // contain repeats (`worm:hurt` many times over). Deduped here rather
            // than in the front end because the payload is per-check and the tree
            // pane only ever shows each name once.
            let mut verbs: Vec<String> = visitor.custom_verbs;
            verbs.sort();
            verbs.dedup();
            let mut diagnostics = checks::run_with_custom(&ast, custom_verbs);
                diagnostics.extend(scopes::run(&ast));
                Ok(AstReport {
                ok: true,
                // B2: semantic checks now run here, in Rust, on the same walk as
                // symbol extraction. They are only meaningful on a file that
                // PARSED -- `checks::run` documents why.
                //
                // `scopes::run` is separate because it is a DIFFERENT kind of check:
                // it needs the scope stack, not the receiver/method data, and keeping
                // it out of `checks.rs` stops that stack from tangling with the
                // deferred findings `checks.rs` collects.
                diagnostics,
                locals: visitor.locals,
                functions: visitor.functions,
                variables: visitor.variables,
                classes: visitor.classes,
                functions_decl: visitor.functions_decl,
                custom_verbs: verbs,
            })
        }
        Err(errors) => Ok(AstReport {
            ok: false,
            diagnostics: errors
                .iter()
                .map(|e| {
                    let (start, _end) = e.range();
                    AstDiagnostic::parse_error(
                        start.line(),
                        start.character(),
                        e.error_message().to_string(),
                    )
                })
                .collect(),
            // No usable tree when the parse failed.
            locals: Vec::new(),
            functions: Vec::new(),
            variables: Vec::new(),
            classes: Vec::new(),
            functions_decl: Vec::new(),
            custom_verbs: Vec::new(),
        }),
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![compile_lua, parse_lua_ast])
        .run(tauri::generate_context!())
        .expect("error while running WormForge Editor");
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Runs the real visitor over a real parse, the same path the command uses.
    fn extract(src: &str) -> (BindingVisitor, bool) {
        match full_moon::parse(src) {
            Ok(ast) => {
                let mut v = BindingVisitor::default();
                v.visit_ast(&ast);
                (v, true)
            }
            Err(_) => (BindingVisitor::default(), false),
        }
    }

    fn has(vars: &[AstVariable], name: &str) -> bool {
        vars.iter().any(|v| v.name == name)
    }

    #[test]
    fn extracts_locals_and_globals() {
        let (v, ok) = extract(
            "local t = 1\nlocal r = 2\nCounter = 0\nlocal function f() return t end\n",
        );
        assert!(ok);
        assert!(has(&v.variables, "t"), "local t missing");
        assert!(has(&v.variables, "r"), "local r missing");
        assert!(has(&v.variables, "Counter"), "global Counter missing");
    }

    #[test]
    fn local_function_is_a_function_not_a_variable() {
        let (v, _) = extract("local function walk(n) return walk(n) end\n");
        assert_eq!(v.functions_decl.len(), 1);
        assert_eq!(v.functions_decl[0].name, "walk");
        assert_eq!(v.functions_decl[0].scope, "module");
        assert_eq!(v.functions_decl[0].parameters.len(), 1);
        assert_eq!(v.functions_decl[0].parameters[0].name, "n");
    }

    #[test]
    fn global_function_has_global_scope() {
        let (v, _) = extract("function Worm:ammo(q) return q end\n");
        let f = v
            .functions_decl
            .iter()
            .find(|f| f.name == "Worm:ammo")
            .expect("Worm:ammo not extracted");
        assert_eq!(f.scope, "global");
        assert_eq!(f.parameters[0].name, "q");
    }

    /// A `function O.m()` must ALSO appear as a custom class member, which is how
    /// `worm:hurt` reaches the WormEntity entry in the docs pane.
    #[test]
    fn dotted_function_creates_a_class_member() {
        let (v, _) = extract("function Worm:ammo(q) return q end\n");
        let cls = v.classes.iter().find(|c| c.name == "Worm").expect("no Worm class");
        assert!(cls.members.iter().any(|m| m.name == "ammo"));
        assert!(v.custom_verbs.contains(&"ammo".to_string()));
    }

    #[test]
    fn method_call_creates_a_class_member() {
        let (v, _) = extract("wa.on.hurt(function(w, e) w:hurt(1) end)\n");
        assert!(
            v.classes.iter().any(|c| c.name == "w" && c.members.iter().any(|m| m.name == "hurt")),
            "w:hurt() not captured"
        );
        assert!(v.custom_verbs.contains(&"hurt".to_string()));
    }

    /// Only the FIRST suffix belongs to the root: in `a.b.c()` the member `c`
    /// belongs to `a.b`, not to `a`. Reporting it against `a` would invent a
    /// member that does not exist.
    #[test]
    fn chained_call_does_not_invent_a_member_on_the_root() {
        let (v, _) = extract("a.b.c()\n");
        let a = v.classes.iter().find(|c| c.name == "a").expect("no a class");
        assert!(!a.members.iter().any(|m| m.name == "c"), "c wrongly attributed to a");
        assert!(a.members.iter().any(|m| m.name == "b"), "b should belong to a");
    }

    /// A `.` inside a string must not create a class. The token parser could not
    /// tell the difference; this is one of the real wins of moving to the tree.
    #[test]
    fn dot_inside_a_string_is_ignored() {
        let (v, _) = extract("local s = \"obj.kind is a thing\"\n");
        assert!(
            !v.classes.iter().any(|c| c.name == "obj"),
            "a string produced a phantom class"
        );
    }

    #[test]
    fn member_dedup_keeps_one_entry() {
        let (v, _) = extract("w:hurt(1)\nw:hurt(2)\nw:hurt(3)\n");
        let cls = v.classes.iter().find(|c| c.name == "w").expect("no w class");
        assert_eq!(cls.members.iter().filter(|m| m.name == "hurt").count(), 1);
    }

    #[test]
    fn a_failed_parse_yields_no_symbols() {
        let (v, ok) = extract("local x = \nfunction broken(");
        assert!(!ok, "this source is genuinely invalid");
        assert!(v.variables.is_empty());
        assert!(v.classes.is_empty());
    }

    /// The regression corpus, in miniature: the shapes rules.lua actually uses.
    #[test]
    fn handles_a_realistic_wormforge_callback() {
        let (v, ok) = extract(
            r#"
wa.on.hurt = function(worm, ev)
  local a = worm.armor
  local b = worm.health
  if a < b then
    worm:hurt(a)
    obj.kind = "worm"
    for i = 1, 10 do
      wa.log(i)
    end
  end
  return worm
end
"#,
        );
        assert!(ok);
        assert!(has(&v.variables, "a"));
        assert!(has(&v.variables, "b"));
        assert!(v.classes.iter().any(|c| c.name == "worm"));
        assert!(v.classes.iter().any(|c| c.name == "obj"));
    }
}
