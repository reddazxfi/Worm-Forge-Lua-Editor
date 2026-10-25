//!
//! Everything here runs on the full_moon AST, which is the entire reason for the
//! port. The TypeScript version was a tokeniser with a bracket stack, so every check
//! had to re-derive structure by hand -- which is exactly where the scope check went
//! wrong first time (3,884 false positives before frame-aware block tracking). Here
//! the structure is handed to us, so a check cannot confuse a statement for an
//! expression the way a token window inevitably does.
//!
//! Rule ids are shared with the TypeScript implementation on purpose, so console
//! filters keep working across the migration.
//!
//! full_moon 3.0 shapes that matter here, all verified against the vendored source
//! rather than assumed:
//!   - `Expression`, not `Expr`.
//!   - `Var::Name(TokenReference)` and `Var::Expression(Box<VarExpression>)`; there
//!     is no `Var::Reference`.
//!   - A binary operator is a *field* of `Expression::BinaryOperator`, not a node, so
//!     there is no `visit_bin_op` -- you see it in `visit_expression`.
//!   - `Node::start_position()` returns `Option<Position>`, not `Position`.
//!   - A dotted path is `Prefix` + a run of `Suffix::Index(Index::Dot)`, NOT a
//!     pre-split name. `Prefix::Name` holds only the first segment.
use std::collections::{HashMap, HashSet};

use full_moon::ast::{Expression, FunctionCall, Index, Prefix, Suffix, Var, VarExpression};
use full_moon::node::Node;
// `Visit` is the RECURSIVE walker; `Visitor` is the trait of per-node hooks. Both are
// needed and they are easy to confuse: `finder.visit_block(x)` calls an empty default,
// while `x.visit(&mut finder)` actually descends. See `collect_wa_in_block`.
use full_moon::visitors::{Visit, Visitor};

use crate::engine_data;
use crate::engine_data::SPEC_KEYS;
use crate::AstDiagnostic;

const SEVERITY_ERROR: &str = "error";
const SEVERITY_WARNING: &str = "warning";
/// Advisory only -- the code runs, it is just not deterministic.
///
/// `lockstep-pairs` is `info` on BOTH sides, deliberately and originally:
/// `parser.ts` has always used `'info'`, and `ConsoleOutput.tsx` has a dedicated
/// `Info (n)` filter precisely because "the desync advisories and the duck-typed
/// handle-union notices" live there. Rust had this as a WARNING, which meant the same
/// finding landed under a different console filter depending on which side won the
/// `mergeDiagnostics` dedup -- and `__sweep.ts` cannot see it, because the sweep
/// compares only the SET of rule ids per file and never looks at severity.
const SEVERITY_INFO: &str = "info";

const ENGINE_VERSION: &str = "0.9.11";

/// `wa.*` namespaces the engine installs only under a cargo feature, and so cannot
/// appear in `engine_data.rs`'s function list.
///
/// Kept as an explicit list rather than inferred, because "this verb is missing" is
/// not evidence of anything -- the table is generated from what the front end
/// documents. These two entries are read off the `#[cfg]` blocks in
/// `crates/lua-host/src/api.rs`; a test asserts `wa.audit` is still gated there, so
/// if the engine promotes it to a default-build API this becomes a stale entry
/// rather than a silent lie.
const DIAGNOSTICS_ONLY_NAMESPACE: &[&str] = &["audit"];

/// The checker. Findings are collected, not emitted inline, because the `wa.*` check
/// cannot decide anything until it knows which call sites were guarded -- and that is
/// only knowable from a parent node, which the visitor sees after the child.
#[derive(Default)]
pub struct Checker {
    pub diagnostics: Vec<AstDiagnostic>,
    wa_refs: Vec<WaRef>,
    guarded: HashSet<(usize, usize)>,
    /// Receivers narrowed by a `.kind` test SOMEWHERE in the file, collected by the
    /// `KindScan` pre-pass before this walk starts -- see `check_method_call`.
    duck_receivers: HashSet<String>,
    /// Accumulated `handle-union` notices, one per (receiver, method), emitted in
    /// `finish()` so a file with a dozen branches produces ONE notice.
    union_passes: Vec<UnionPass>,
    /// The user's own verbs from custom_verbs.cfg, as (class, member) pairs.
    /// A pair here is as real as an engine member: a custom method on the
    /// assumed handle silences the unknown-method warning the same way, and it
    /// joins the union owner list for `.kind`-narrowed receivers.
    custom_verbs: Vec<(String, String)>,
    /// Position ranges of render contexts (`wa.on.draw` callback bodies), as
    /// ((start_line, start_col), (end_line, end_col)). math `cos`/`sin`/`atan`
    /// inside them is presentation-only -- per-client drawing never desyncs a
    /// match -- so it stays silent there. Everywhere else it is an error.
    render_regions: Vec<(usize, usize, usize, usize)>,
    /// What `for _, v in <wa.X.all()>` binds, from the file-global `LoopTrace`. It
    /// beats the receiver NAME table, because the loop states what the value is and
    /// the name only suggests it. Defaulted rather than a `new` parameter so every
    /// existing call site keeps compiling and keeps meaning "no loops traced".
    loop_trace: LoopTrace,
}

/// How `handle-union` replaced `UNCHECKED_CLASSES`.
///
/// `WorldHandle` is a UNION: a mine, an oil drum, a crate, a grave and a worm are all
/// the same class, discriminated only at RUN time by `.kind` (see `kind_name`,
/// engine `actor.rs:1364`). Claiming a single member list here produced a FALSE ERROR
/// on working code in `highlander_code/rules.lua`, at two sites, on code that ships --
/// the worst failure this checker has: a red banner over a file that runs.
///
/// The first response was `UNCHECKED_CLASSES`: decline every union class wholesale.
/// Silent beats wrong, and a missed typo costs one bug while a false error costs the
/// user's trust in every other finding. That constant is now GONE, because silence had
/// become a gap of its own: parser.ts has always checked these receivers, so declining
/// meant Rust missed every `world-object-api` warning TS raises on a non-narrowed
/// receiver (a bare `obj:hurtt()`), plus the whole `handle-union` notice rule.
///
/// The ported flow in `check_method_call` mirrors parser.ts exactly:
///
/// 1. member found on the assumed class -> silent;
/// 2. receiver duck-typed by a `.kind` test somewhere in the file (`KindScan`) and
///    SOME handle class has the member -> one aggregated `handle-union` INFO notice;
/// 3. otherwise -> the ordinary unknown-method WARNING (severity stays the backstop).
///
/// Membership consults ALL members, properties included, because parser.ts does
/// (`members.some(name)`, no kind filter) and the difference is measurable: `m:id()` is
/// silent there -- `id` is a MissileEntity property and MissileEntity has no methods at
/// all -- and a ducked `obj:phase()` passes as a union notice because MissileEntity has
/// `phase`. Guessing differently would emit a different RULE ID than the baseline,
/// which `__sweep.ts` counts as drift in both directions.
impl Checker {
    /// `duck` is the file-global `.kind`-narrowed receiver set from `KindScan`.
    /// `custom` is the custom_verbs.cfg overlay, as (class, member) pairs.
    pub fn new(duck: HashSet<String>, custom: Vec<(String, String)>, render_regions: Vec<(usize, usize, usize, usize)>) -> Self {
        Self {
            duck_receivers: duck,
            custom_verbs: custom,
            render_regions,
            ..Self::default()
        }
    }

    /// One custom member lookup: (class, member) -> known, for the method
    /// check and the union owner list below. Linear is fine -- a cfg file
    /// holds dozens of rows, not thousands.
    fn custom_has(&self, class_name: &str, method: &str) -> bool {
        self.custom_verbs
            .iter()
            .any(|(c, m)| c == class_name && m == method)
    }

    fn add<N: Node>(&mut self, node: &N, severity: &str, rule: &str, message: String) {
        let (line, column) = pos(node);
        self.diagnostics
            .push(AstDiagnostic::finding(line, column, severity, rule, message));
    }

    /// `add` for a finding that carries a long explanation behind the short
    /// message. `detail: None` collapses to plain `add`, so the common case
    /// never pays for the field.
    fn add_with_detail<N: Node>(
        &mut self,
        node: &N,
        severity: &str,
        rule: &str,
        message: String,
        detail: Option<String>,
    ) {
        let (line, column) = pos(node);
        let diag = match detail {
            Some(d) => AstDiagnostic::finding_with_detail(line, column, severity, rule, message, d),
            None => AstDiagnostic::finding(line, column, severity, rule, message),
        };
        self.diagnostics.push(diag);
    }

fn check_method_call(&mut self, call: &FunctionCall) {
    // The receiver is whatever sits IMMEDIATELY before the colon, matching
    // parser.ts's token window (`tokens[idx - 1]` before the `:`).
    //
    // Taking the call PREFIX's first segment instead -- what this did until the
    // handle-union port -- read `M.sounds[1]:find("inflate")` in
    // `highlander_code/test_rules.lua` as a call on receiver `m`: NINE false
    // `missile-api` warnings where the real receiver is a STRING (string.find).
    // `UNCHECKED_CLASSES` had been masking exactly this bug for `m`/`missile`,
    // because MissileEntity was declined before the receiver ever mattered; the
    // port surfaced it. TS is silent there because the token before the colon is
    // `]`, not an identifier.
    let suffixes: Vec<&Suffix> = call.suffixes().collect();
    let Some(mc_idx) = method_call_index(&suffixes) else {
        return;
    };
    let Suffix::Call(full_moon::ast::Call::MethodCall(method_call)) = suffixes[mc_idx] else {
        return;
    };
    let Some(receiver_raw) = receiver_before_colon(call, &suffixes, mc_idx) else {
        return;
    };
    let receiver = receiver_raw.to_lowercase();
    // Resolution order, most accurate first. Mirrors parser.ts:
    //   1. the loop trace -- `for _, missile in ipairs(wa.missiles.all())` says what
    //      the value IS, which beats anything the name suggests;
    //   2. the receiver registry -- confident names only.
    // A wrong guess on the checker is a false error on valid code, so step 2 only
    // claims names it is sure about.
    let (class_name, rule) = match self.loop_trace.get(&receiver, pos(call)) {
        Some(class_name) => {
            let Some((_, _, rule, _)) = engine_data::RECEIVERS
                .iter()
                .find(|(_, class, _, _)| *class == class_name)
            else {
                return;
            };
            (class_name, *rule)
        }
        None => {
            let Some((_, class_name, rule, _)) = engine_data::RECEIVERS
                .iter()
                .find(|(prefix, _, _, _)| *prefix == receiver)
            else {
                return;
            };
            (*class_name, *rule)
        }
    };
    // Bound to a local because `trim()` borrows from the temporary `String` that
    // `text()` returns, and that temporary dies at the end of the statement.
    let raw_method = text(method_call.name());
    let method = raw_method.trim_start_matches(':').trim();
    // ALL members, properties included -- parser.ts tests `members.some(name)` with no
    // kind filter, and the difference is measurable: `m:id()` must stay silent.
    let Some((_, members)) = engine_data::HANDLE_ALL_MEMBERS
        .iter()
        .find(|(name, _)| *name == class_name)
    else {
        return;
    };
    if members.contains(&method) || self.custom_has(class_name, method) {
        return;
    }

    // The assumed handle alone does not have it. If a `.kind` test narrows this
    // receiver ANYWHERE in the file, the value is a runtime union: accept the call
    // when some handle class has the member -- or when the USER gave some class
    // the member -- and accumulate ONE info notice per
    // (receiver, method) -- parser.ts's `handle-union`. With no owner at all, fall
    // through to the warning below, as parser.ts does.
    if self.duck_receivers.contains(&receiver_raw) {
        let mut all_owners: Vec<String> = engine_data::HANDLE_ALL_MEMBERS
            .iter()
            .filter(|(_, ms)| ms.contains(&method))
            .map(|(name, _)| name.to_string())
            .collect();
        // A user-extended class is an owner exactly like an engine one, and
        // reads through the same notice text.
        for (c, _) in self.custom_verbs.iter().filter(|(_, m)| m == method) {
            if !all_owners.contains(c) {
                all_owners.push(c.clone());
            }
        }
        if !all_owners.is_empty() {
            // The NAME token's line, not the node's: they differ when a pack writes
            // `obj:` and the method name on the next line, and parser.ts's `right.line`
            // is the name's line.
            let line = pos(method_call.name()).0;
            let existing = self
                .union_passes
                .iter()
                .position(|u| u.receiver == receiver_raw && u.method == method);
            match existing {
                Some(idx) => self.union_passes[idx].lines.push(line),
                None => self.union_passes.push(UnionPass {
                    receiver: receiver_raw,
                    method: method.to_string(),
                    assumed_class: class_name.to_string(),
                    owners: all_owners,
                    lines: vec![line],
                }),
            }
            return;
        }
    }

    // Suggestions come from the METHODS-only table: offering a property name for a
    // method call would send the user from one runtime error to another.
    let methods = engine_data::HANDLE_CLASSES
        .iter()
        .find(|(name, _)| *name == class_name)
        .map(|(_, ms)| *ms)
        .unwrap_or(&[]);
    // Short `message` = the suggestion. Long `detail` = the reasoning and the
    // runtime cost. See `AstDiagnostic::detail` for why the two are split.
    let (message, detail) = match suggest(method, methods) {
        Some(near) => (
            format!("`{receiver}:{method}()` is not a {class_name} method. Did you mean `{receiver}:{near}()`?"),
            None,
        ),
        None => (
            format!("`{receiver}:{method}()` is not a {class_name} method."),
            Some(
                "At run time this raises \"attempt to call a nil value\", and `run_mods` \
                 aborts every mod in the folder when one errors."
                    .to_string(),
            ),
        ),
    };
    // WARNING, not error -- deliberately matching parser.ts's `pushUnknownMethod`, which
    // has always used 'warning' for exactly this finding.
    //
    // Three separate statements of the project's own intent agree:
    //   - parser.ts: "Deliberately a WARNING, never an error. A scope model is not a
    //     proof, and a false error on valid code is worse than a missed one."
    //   - handleRegistry.ts: "A wrong guess on the checker is a false ERROR on valid
    //     code, which is the disease this work exists to cure."
    //   - the definitions are pinned to a snapshot that demonstrably lags the
    //     engine: turn_retreat / turn_end / turn_cleanup are real hooks in
    //     api.rs:236-239 and were missing here, producing six false positives.
    //
    // So a method added by a newer engine, absent from our pinned data, would
    // otherwise raise a RED banner over a file that runs perfectly. This was the
    // only ERROR the checker emitted, which made it the only thing able to turn the
    // banner red on its own. The `.kind` union pass above is a real guard too, but a
    // missing member is the more likely failure, so severity is the backstop.
    //
    // The rule id comes from the REGISTRY, not a literal. parser.ts has always emitted
    // the per-row id (`worm-api`, `actor-api`, ...) via `expected.rule`, so a hardcoded
    // "unknown-method" here could never match it in `mergeDiagnostics`, which dedups on
    // (line, rule) -- the same finding would be listed twice, once per source.
    // Position parity, MEASURED: parser.ts reports a method warning at the first
    // letter of the method name (`obj:hurtt(10)` -> column 5). full_moon's MethodCall
    // starts at its `colon_token` (column 4), so the old `pos(method_call)` was one
    // column left of the baseline on EVERY method warning, the (line, column, rule)
    // dedup in mergeDiagnostics never matched, and desktop mode listed the same
    // warning TWICE. Point at the NAME token instead -- the same token `text()` reads
    // above. First caught by `a_union_receiver_without_a_kind_test_is_warned`, which
    // pins the TS column.
    let (line, column) = pos(method_call.name());
    let diag = match detail {
        Some(d) => AstDiagnostic::finding_with_detail(line, column, SEVERITY_WARNING, rule, message, d),
        None => AstDiagnostic::finding(line, column, SEVERITY_WARNING, rule, message),
    };
    self.diagnostics.push(diag);
}


    /// `wa.weapons.replace({ copy_fromm = "mine" })` -- a misspelled spec key.
    ///
    /// A table constructor carries a key the engine never reads, so the intended change
    /// is silently missing. Lua does not complain and neither does full_moon, which is
    /// exactly the class of bug this checker exists to find.
    ///
    /// WHY THIS IS MUCH SHORTER THAN THE TYPESCRIPT VERSION
    /// `parser.ts` needed a `blockDepth` sentinel, brace-depth counting, and a scan for
    /// the matching `)` before it could tell a real spec key from something inside a
    /// callback -- that heuristic cost two rounds of false positives (28 findings, 6 of
    /// them real bugs in the key data, the rest `local worm = ...` inside `on_fire`).
    ///
    /// On the AST none of that is necessary. A nested `patch = { ... }` is a DIFFERENT
    /// `TableConstructor` node, reached by a different visitor call, and `Field::NameKey`
    /// is the only shape that is a key at all -- `Field::NoKey` (positional) and
    /// `Field::ExpressionKey` (`[k] = v`) cannot be a typo of a named key. So the
    /// "directly inside the spec table" rule is structural rather than reconstructed.
    ///
    /// Warning, never error: SPEC_KEYS is hand-maintained and errs toward inclusion, so a
    /// key this build does not list may still be accepted by a newer engine.
    fn check_spec_table(&mut self, call: &FunctionCall) {
        let Some(segs) = dotted_path(call) else {
            return;
        };
        // Exactly `wa.weapons.replace` / `wa.weapons.register` -- the two calls that take
        // a spec table. Anything else with a table argument is the user's own business.
        if segs.len() != 3 || segs[0] != "wa" || segs[1] != "weapons" {
            return;
        }
        if segs[2] != "replace" && segs[2] != "register" {
            return;
        }

        // The spec table is the FIRST argument, and only if it is a table literal.
        // `wa.weapons.replace(some_var)` cannot be judged: the keys are not visible here.
        let table = call.suffixes().find_map(|s| match s {
            Suffix::Call(full_moon::ast::Call::AnonymousCall(args)) => match args.as_ref() {
                full_moon::ast::FunctionArgs::Parentheses { arguments, .. } => arguments
                    .iter()
                    .find_map(|e| match e {
                        Expression::TableConstructor(t) => Some(&**t),
                        _ => None,
                    }),
                _ => None,
            },
            _ => None,
        });
        let Some(table) = table else {
            return;
        };

        for field in table.fields() {
            // Only `key = value` is a spec key. `NameKey` is the ONLY variant carrying
            // a bare identifier, which is why this needs no further shape tests.
            let full_moon::ast::Field::NameKey { key, .. } = field else {
                continue;
            };
            let key_text = name_of(key);
            if key_text.is_empty() || spec_key_exists(&key_text) {
                continue;
            }
            let (message, detail) = match suggest_spec_key(&key_text) {
                Some(near) => (
                    format!(
                        "Unrecognized spec key \"{key_text}\" in wa.weapons.{}{{...}}. Did you mean \"{near}\"?",
                        segs[2]
                    ),
                    None,
                ),
                None => (
                    format!("Unrecognized spec key \"{key_text}\" in wa.weapons.{}{{...}}.", segs[2]),
                    Some("The engine ignores unknown keys, so this line has no effect.".to_string()),
                ),
            };
            self.add_with_detail(key, SEVERITY_WARNING, "spec-key-typo", message, detail);
        }
    }

    /// `worm:set_state("...")` -- the name must be one a script may ENTER.
    ///
    /// This replaces the old A5 `state-key-typo` check, which validated keys against
    /// `wa.game_state(id).states.KEY`. **`wa.game_state` does not exist**: zero hits
    /// across the engine's `crates/` tree, absent from the developer's own verb list
    /// (`wormforge-verbs.md`, fork main 2026-10-03), and the 63 keys were generated,
    /// not measured. So A5 was checking a fiction, and the list it enforced is gone.
    ///
    /// What replaces it is real and much smaller. `settable_worm_state()` in
    /// crates/lua-host/src/actor.rs accepts exactly SIX names for FIVE states:
    ///
    /// ```text
    /// worm:set_state: "x" is not a state a script may enter;
    /// valid: sliding, standing, bungee, tumbling, teleporting
    /// ```
    ///
    /// ("sinking" is the legacy alias of tumbling, so the engine accepts it too.)
    /// Anything else is a hard Lua error, and `run_mods` then aborts every mod in the
    /// folder -- the same consequence as the unknown-method check, hence WARNING and
    /// never error.
    ///
    /// A REAL state that is simply not settable -- `jetpacking`, which the engine
    /// pins as `None` in its own tests -- is still wrong here, so the check warns.
    /// Do not widen the list from `WORM_STATES`; that is the debug table.
    fn check_worm_state(&mut self, call: &FunctionCall) {
        let suffixes: Vec<&Suffix> = call.suffixes().collect();
        let Some(idx) = method_call_index(&suffixes) else {
            return;
        };
        let Suffix::Call(full_moon::ast::Call::MethodCall(method_call)) = suffixes[idx] else {
            return;
        };
        let raw_method = text(method_call.name());
        if raw_method.trim_start_matches(':').trim() != "set_state" {
            return;
        }
        // Same receiver rule as `check_method_call`: the token immediately before the
        // colon. A user's own table with a `set_state` method is not the engine's.
        let Some(receiver) = receiver_before_colon(call, &suffixes, idx) else {
            return;
        };
        let is_worm = engine_data::RECEIVERS
            .iter()
            .any(|(prefix, class, _, _)| *prefix == receiver && *class == "WormEntity");
        if !is_worm {
            return;
        }
        let Some(first) = first_argument(method_call) else {
            return;
        };
        // A computed name (`worm:set_state(config.state)`) cannot be judged -- the
        // same reason `cfg:whatever()` is left alone.
        let Some(name) = first.text() else {
            return;
        };
        if settable_worm_state(&name) {
            return;
        }
        let names: Vec<&str> = engine_data::WORM_SETTABLE_STATES
            .iter()
            .map(|(n, _)| *n)
            .collect();
        // Two different mistakes, and the message should not blur them. A state the
        // engine really has is a different error from a typo -- and the `confirmed`
        // flag is what keeps a `?`-marked label from being called "real".
        let is_real_state = engine_data::WORM_STATES
            .iter()
            .any(|(n, _, confirmed)| *n == name && *confirmed);
        // The consequence ("aborts every mod in the folder") is identical in every arm,
        // so it is stated ONCE in the detail instead of being repeated four times.
        // The valid-name list also moves to the detail: it is needed to fix the
        // typo, but only after you have decided the name really is wrong, and it
        // is long enough to wrap off a 1366-wide row.
        let message = if is_real_state {
            format!("`{name}` is a real worm state, but a script may not ENTER it.")
        } else {
            match suggest(&name, &names) {
                Some(near) => {
                    format!("`{name}` is not a state a script may enter. Did you mean `{near}`?")
                }
                None => format!("`{name}` is not a state a script may enter."),
            }
        };
        let detail = if is_real_state {
            format!(
                "The engine raises a Lua error here, and `run_mods` then aborts every mod in the folder. Settable states: {}.",
                names.join(", ")
            )
        } else {
            format!(
                "This raises a Lua error at run time, and `run_mods` then aborts every mod in the folder. Valid names: {}.",
                names.join(", ")
            )
        };
        // Anchored on the STRING, so the parenthesised and parentheseless spellings of the
        // same call produce the same column -- see `FirstArg::anchor`.
        let (line, column) = first.anchor();
        self.diagnostics.push(AstDiagnostic::finding_with_detail(
            line,
            column,
            SEVERITY_WARNING,
            "worm-state-typo",
            message,
            detail,
        ));
    }

    /// Emits the `wa.*` findings that survived the capability-check guard.
    fn finish(mut self) -> Vec<AstDiagnostic> {
        let namespaces = namespaces();
        for call in std::mem::take(&mut self.wa_refs) {
            if self.guarded.contains(&(call.line, call.column)) {
                continue;
            }
            // Judge at most the first TWO segments -- never fewer than one. `wa.weapons.repalce`
            // is a typo we can see; `wa.weapons.replace` is not, and anything deeper is the
            // caller's own choice of sub-table.
            //
            // The count is `min(2)`, not `2`. `segs` here has `wa` already stripped, so a
            // two-segment PATH like `wa.randomm` arrives as a ONE-element list. Indexing
            // `[..2]` unconditionally panicked on exactly those; slicing is guarded
            // instead. This is the same shape as the `wa-save` one-segment path.
            //
            // An INDEXED path is truncated at its call boundary FIRST, because segments
            // after a call are field access on the result rather than namespace. Without
            // that, `wa.game_state(1).states.AIR_TIME` would be reported as a missing
            // `wa.game_state.states`, which is not a call anyone could have written.
            let segs: &[String] = match call.boundary {
                Some(bound) if bound > 0 && bound < call.segs.len() => &call.segs[..bound],
                _ => &call.segs[..],
            };
            if segs.is_empty() {
                continue;
            }
            // A user-registered wa.* verb is just as real to this checker as an
            // engine function. The verb overlay is already sent over IPC for the
            // method checks; use it here too so the same registration also silences
            // the wa-namespace check (and supports paths deeper than two segments).
            if self.custom_verbs.iter().any(|(class, member)| {
                (class == "wa" || class.starts_with("wa."))
                    && segs.len() == class.split('.').count()
                    && segs[..segs.len() - 1].join(".") == class.strip_prefix("wa.").unwrap_or("")
                    && segs.last().is_some_and(|leaf| leaf == member)
            }) {
                continue;
            }
            let taken = segs.len().min(2);
            let full = format!("wa.{}", segs[..taken].join("."));
            // Exact match OR a longer known function underneath it. A prefix test alone
            // is not enough: `wa.weapons` is not in the list but `wa.weapons.replace`
            // is, so accepting any `wa.weapons.*` would swallow the very typo we are
            // trying to catch.
            let dotted = format!("{full}.");
            if engine_data::WA_FUNCTIONS
                .iter()
                .any(|f| f.starts_with(&dotted) || *f == full)
            {
                continue;
            }
            let verb = &segs[0];
            // `wa.audit` is the ONE public namespace the engine installs behind a
            // cargo feature, so it can be named rather than guessed at.
            //
            // `crates/lua-host/src/api.rs:32`:
            //
            //     #[cfg(feature = "diagnostics")]
            //     if wa.get::<Value>("audit")...is_nil() { wa.set("audit", audit) }
            //
            // Nothing else in `api.rs` adds a public `wa.*` under a feature (the other
            // diagnostics block installs the internal `_debug_input` and
            // `_debug_worm_state` tables, both underscore-prefixed), so this list is
            // the whole of it and will not quietly grow.
            //
            // Calling this "not an engine API" is wrong twice over: the API is real,
            // and a user of `mods/tools` gets told they mistyped something they
            // spelled correctly. There is a SECOND gate on top -- `actor.rs:2854`,
            // "wa.audit requires debug_input = true", which the pack's own mod.toml
            // must declare -- and neither is visible from the Lua source alone.
            //
            // Still a warning, and still correct for a stock build: the call really
            // does raise "attempt to call a nil value" there. Only the explanation
            // changes.
            let (message, detail) = match DIAGNOSTICS_ONLY_NAMESPACE.iter().find(|ns| **ns == verb.as_str()) {
                Some(ns) => (
                    format!("{full} exists only in a build with the `diagnostics` feature."),
                    Some(format!(
                        "`wa.{ns}` is installed by crates/lua-host/src/api.rs under \
                         #[cfg(feature = \"diagnostics\")], so a stock WormForge has no such \
                         namespace and this call raises \"attempt to call a nil value\". \
                         It also needs `debug_input = true` in the calling pack's mod.toml \
                         (actor.rs:2854). `mods/tools` declares it; a pack you ship must too."
                    )),
                ),
                // A typo in the FUNCTION part must suggest a function. The
                // namespace table answers "wa.fog" for `wa.fog.visble`, and a
                // table cannot be called -- a wrong suggestion is worse than
                // none. A namespace suggestion is only for a mistyped NAMESPACE.
                None => match suggest_function(&segs[..taken]) {
                    Some(near) => (
                        format!("{full} is not an engine API. Did you mean {near}?"),
                        None,
                    ),
                    None if segs.len() == 1 || !namespaces.iter().any(|n| *n == verb) => {
                        match suggest(verb, &namespaces) {
                            Some(near) => (
                                format!("{full} is not an engine API. Did you mean wa.{near}?"),
                                None,
                            ),
                            None => (
                                format!("{full} is not an engine API."),
                                Some(format!(
                                    "`wa.{verb}` does not exist in WormForge {ENGINE_VERSION}."
                                )),
                            ),
                        }
                    }
                    None => (
                        format!("{full} is not an engine API."),
                        Some(format!("`wa.{verb}` does not exist in WormForge {ENGINE_VERSION}.")),
                    ),
                },
            };
            let diag = match detail {
                Some(d) => AstDiagnostic::finding_with_detail(
                    call.line,
                    call.column,
                    SEVERITY_WARNING,
                    "wa-namespace-typo",
                    message,
                    d,
                ),
                None => AstDiagnostic::finding(
                    call.line,
                    call.column,
                    SEVERITY_WARNING,
                    "wa-namespace-typo",
                    message,
                ),
            };
            self.diagnostics.push(diag);
        }
        // ---- handle-union: one notice per ducked (receiver, method) --------------
        //
        // Line = FIRST occurrence and column = 1, both for parity: `mergeDiagnostics`
        // dedups on (line, column, rule) and parser.ts emits these at exactly
        // (first line, 1). Any other position and the same notice is listed TWICE --
        // the duplicate-diagnostic failure that no gate in this repo can catch.
        for pass in std::mem::take(&mut self.union_passes) {
            let line = pass.lines.iter().copied().min().unwrap_or(0);
            let message = union_notice_message(&pass);
            self.diagnostics.push(AstDiagnostic::finding_with_detail(
                line,
                1,
                SEVERITY_INFO,
                "handle-union",
                message,
                union_notice_detail(&pass),
            ));
        }

        // Sorted so the console reads in file order. The visitor emits in tree order,
        // which for a file mixing statements and expressions is not the same thing.
        self.diagnostics.sort_by_key(|d| (d.line, d.column));
        self.diagnostics
    }
}

/// The handle-method check: `worm:hurtt()` against the receiver registry.
///
/// The receiver registry maps a local name to the engine class it holds, so
/// `worm:hurtt(...)` can be told apart from `obj:hurtt(...)` -- the first is a
/// guaranteed typo, the second is the user's own table and must be left alone.
///
/// The receiver list is deliberately narrow. A wrong guess produces a false ERROR on
/// valid code, and a false error costs more trust than a missed typo costs a bug --
/// see `handleRegistry.ts`, which the front end shares with autocomplete for exactly
/// this reason.
///
/// Runs off the SUFFIXES because `MethodCall` has no `prefix()`: in full_moon the
/// receiver is the call's prefix and the method is a suffix of that same node.
/// The dotted path of an INDEXED `wa.*` reference, e.g. `wa.game_state(1).states.X`.
///
/// This exists because `visit_function_call` cannot see those expressions at all.
/// `wa.game_state(1).states.AIR_TIME` parses as a single `Var`, and the `wa.game_state(1)`
/// inside it is the VarExpression's PREFIX, not a `FunctionCall` node -- measured with a
/// visitor probe, not assumed. So a call-only checker is structurally blind to every
/// `wa.*` path that is indexed rather than invoked, which is most of the state API.
///
/// Returns the path, how many leading segments sit BEFORE the first call, and whether a
/// call was seen at all. That last part is load-bearing, not incidental: parser.ts
/// anchors this rule on CALLS -- it flags `wa.zzz.yyy()` and `wa.zzz.yyy().x` but stays
/// silent on a bare `wa.zzz.yyy`. Verified on all three. Judging call-free paths here
/// would introduce drift the sweep would attribute to Rust.
///
/// `path_from_varexpression` already walks past calls, so the path itself is reused; the
/// boundary has to be counted separately because that walker discards suffix kinds.
fn indexed_wa_path(var: &Var) -> Option<(Vec<String>, usize, bool)> {
    let full_moon::ast::Var::Expression(ve) = var else {
        return None;
    };
    let path = path_from_varexpression(ve)?;

    // Count the path segments consumed before the first call. `Suffix::Call` adds
    // nothing to the path (`path_from_varexpression` skips it), so the count of segments
    // seen so far IS the index of the first post-call segment.
    let mut seen = 1; // the `wa` prefix itself
    let mut boundary: Option<usize> = None;
    if matches!(
        ve.prefix(),
        Prefix::Expression(e) if matches!(**e, Expression::FunctionCall(_))
    ) {
        // The call sits between `wa` and everything else: `wa.game_state(1).states.X`.
        // `path_from_expression` contributed `game_state` before the call suffix.
        seen += path_from_expression_prefix_len(ve);
        boundary = Some(seen);
    }
    for suffix in ve.suffixes() {
        match suffix {
            Suffix::Call(_) => {
                boundary.get_or_insert(seen);
            }
            Suffix::Index(_) => seen += 1,
            _ => {}
        }
    }
    Some((path, boundary.unwrap_or(seen), boundary.is_some()))
}

/// How many path segments the VarExpression's prefix contributes.
///
/// `wa.game_state(1)` -- a `FunctionCall` prefix -- contributes `game_state`, because
/// the call is part of the NAME `wa.game_state`, not an extra segment. Anything else
/// contributes nothing beyond the leading name.
fn path_from_expression_prefix_len(ve: &VarExpression) -> usize {
    match ve.prefix() {
        Prefix::Name(_) => 0,
        Prefix::Expression(e) => match &**e {
            Expression::FunctionCall(call) => match dotted_path(call) {
                // minus the leading `wa`, which `seen` already counted
                Some(segs) => segs.len().saturating_sub(1),
                None => 0,
            },
            _ => 0,
        },
        _ => 0,
    }
}

impl Visitor for Checker {
    fn visit_var(&mut self, var: &Var) {
        // `wa.*` paths that are indexed, never called. Queued on the same deferred path
        // as calls so the capability-check guard still applies to them.
        //
        // The position is `pos(var)`, which for a Var is its first token -- the same
        // anchor `collect_wa_positions` uses when guarding `if wa.x then ... end`, so the
        // two agree and a guarded probe stays silent.
        let Some((segs, boundary, saw_call)) = indexed_wa_path(var) else {
            return;
        };
        if !saw_call || segs.first().map(String::as_str) != Some("wa") || segs.len() < 2 {
            return;
        }
        let (line, column) = pos(var);
        self.wa_refs.push(WaRef {
            line,
            column,
            segs: segs[1..].to_vec(),
            // A call BOUNDS the path we are willing to name. For
            // `wa.game_state(1).states.AIR_TIME` the namespace is `wa.game_state`, and
            // `.states` / `.AIR_TIME` are plain field reads on the RESULT -- telling the
            // user `wa.game_state.states` does not exist would be nonsense, which is the
            // one thing a typo warning must never be.
            boundary: Some(boundary.saturating_sub(1)),
        });
    }
    fn visit_function_call(&mut self, call: &FunctionCall) {
        let Some(segs) = dotted_path(call) else {
            // Not a readable path, but a `worm:hurtt()` still needs checking, and its
            // receiver lives in the PREFIX of the same node. So the method check runs
            // off the suffixes rather than off a separate `visit_method_call`.
            self.check_method_call(call);
            return;
        };
        self.check_method_call(call);

        // ---- spec table keys: `wa.weapons.replace({ ... })` --------------------
        self.check_spec_table(call);

        // ---- worm_message filter advisory --------------------------------------
        self.check_worm_message_filter(call);

        // ---- desync checks: the whole point of the product -----------------
        if segs.len() >= 2 && segs[0] == "math" && segs[1] == "random" {
            self.add(
                call,
                SEVERITY_ERROR,
                "lockstep-rng",
                // The advice must name a function that EXISTS. It said
                // `wa.rng.random()`, which is not in WA_FUNCTIONS -- the real one is
                // `wa.random(min, max)`, and that is what parser.ts has always said.
                // Nothing caught it: the sweep compares rule ids, not wording, and
                // mergeDiagnostics gives TS priority, so the app displayed the good
                // text. It would only have surfaced on the day parser.ts is deleted.
                // `lockstep_advice_names_only_real_apis` is the guard that pins it.
                "math.random() is not lockstep-safe. It is seeded per-client, so each peer \
                 draws a different number and the match desyncs. Use wa.random(min, max) \
                 to draw from the shared lockstep RNG, or a counter seeded \
                 deterministically from the turn number."
                    .to_string(),
            );
        } else if segs.len() >= 2
            && segs[0] == "math"
            && (segs[1] == "cos" || segs[1] == "sin" || segs[1] == "atan")
        {
            // math.cos/sin/atan inside wa.on.draw is presentation-only: per-client
            // drawing never desyncs a match, so it is safe there. Everywhere else
            // (gameplay logic, helpers, ...) it is a real desync risk and stays an error.
            let (line, column) = pos(call);
            if !in_render_region(line, column, &self.render_regions) {
                self.add(
                    call,
                    SEVERITY_ERROR,
                    "lockstep-rng",
                    format!(
                        "math.{0}() is not lockstep-safe: the C library result can differ \
                         between machines and desync the match. Use wa.math.{0}(...) instead.",
                        segs[1]
                    ),
                );
            }
            // silent in render context: pure presentation, no desync risk
        } else if segs.len() == 1 && segs[0] == "pairs" {
            self.add(
                call,
                SEVERITY_INFO,
                "lockstep-pairs",
                "pairs() iterates in an unspecified order. Lua may hand back the keys in any \
                 sequence, so two peers can take different branches. Iterate a sorted key \
                 list, or use ipairs() over an array."
                    .to_string(),
            );
        }

        // ---- worm:set_state("name") -------------------------------------------
        self.check_worm_state(call);

        // ---- wa.* namespace: deferred until the guard is known ----------------
        //
        // The guard is TWO segments, and it used to be three. `wa.randomm(1, 10)` has two
        // and was never checked at all; `wa.random` IS in WA_FUNCTIONS, so the exact-match
        // arm in `finish` accepts the real one and rejects the typo. No false positive is
        // possible from lowering it.
        //
        // This covers CALLED paths only. INDEXED ones (`wa.game_state(1).states.AIR_TIME`)
        // are handled by `visit_var`, because they are a different AST shape entirely --
        // see that function for the probe that established it.
        if segs.len() >= 2 && segs[0] == "wa" {
            let (line, column) = pos(call.prefix());
            self.wa_refs.push(WaRef {
                line,
                column,
                segs: segs[1..].to_vec(),
                boundary: None,
            });
        }
    }

    fn visit_expression(&mut self, expr: &Expression) {
        // A binary operator is a FIELD of the node in full_moon 3.0, not a node of its
        // own -- there is no `visit_bin_op`. This is where `and`/`or` becomes visible.
        if let Expression::BinaryOperator { binop, lhs, rhs } = expr {
            if matches!(binop, full_moon::ast::BinOp::And(_) | full_moon::ast::BinOp::Or(_)) {
                let mut set = HashSet::new();
                collect_wa_positions(lhs, &mut set);
                collect_wa_positions(rhs, &mut set);
                self.guarded.extend(set);
            }
        }
    }

    fn visit_if(&mut self, if_stmt: &full_moon::ast::If) {
        // `if wa.x then wa.x() end`: the probe is guarded by the `if` and the call by
        // the `then`.
        //
        // The BODY is guarded only when the CONDITION actually references a `wa.*`
        // path. Guarding it unconditionally was over-broad: an unrelated condition
        // like `if near_enemy then wa.typo.thing() end` is a genuine typo, and
        // marking every `if` body as a probe silently suppressed it. The failure is
        // in the safe direction (a missed finding, never a false one), but it is a
        // real coverage gap and this is the fix.
        let mut condition = HashSet::new();
        collect_wa_positions(if_stmt.condition(), &mut condition);
        self.guarded.extend(condition.iter().copied());
        if condition.is_empty() {
            return;
        }

        // The `then` body is a separate node from the condition, and it is still
        // guarded -- that is the whole point of writing `if wa.x then`.
        let mut set = HashSet::new();
        collect_wa_in_block(if_stmt.block(), &mut set);
        self.guarded.extend(set);

        if let Some(block) = if_stmt.else_block() {
            let mut set = HashSet::new();
            collect_wa_in_block(block, &mut set);
            self.guarded.extend(set);
        }
    }
}

impl Checker {
    /// `wa.on.worm_message(fn)` -- advise naming the messages the handler wants.
    ///
    /// WA sends every worm several messages a frame and enters Lua for each one, so an
    /// unfiltered handler runs a few hundred times a second just to compare `msg`
    /// against one constant and return. Passing `{ msgs = { ... } }` lets the engine
    /// skip the dispatch entirely for everything else.
    ///
    /// `info`, like `lockstep-pairs`: the unfiltered code is CORRECT, it just pays for
    /// messages it ignores. This is not a correctness rule and must never grow teeth.
    ///
    /// It fires only when the change is provably behaviour-preserving:
    ///   - exactly one argument, so no filter is already present;
    ///   - an inline `function(...)` whose LAST parameter is named `msg` -- a named
    ///     callback has no body here to read, and another parameter shape is not
    ///     assumed to be this handler;
    ///   - EVERY read of `msg` in the body is a `msg == wa.msg.X` / `msg ~= wa.msg.X`
    ///     comparison.
    ///
    /// That last condition is the whole safety argument. If `msg` is logged, indexed,
    /// compared numerically or otherwise consumed, the handler wants a value the
    /// engine cannot be told to skip, and the check stays SILENT -- suggesting the
    /// filter there would change what the handler receives.
    ///
    /// WHY THIS IS SHORTER THAN THE TYPESCRIPT VERSION
    /// parser.ts had to find the end of the function body by counting `end`/`until` and
    /// check the parameter list for `msg` by scanning tokens. On the AST the body is a
    /// `Block` and the parameters are a slice, so both are structural. The one thing
    /// both sides do by hand is the `msg` scan, because "every read of a name" is not
    /// something the AST hands over -- hence `MsgScan` below.
    fn check_worm_message_filter(&mut self, call: &FunctionCall) {
        let Some(segs) = dotted_path(call) else {
            return;
        };
        if segs.len() != 3 || segs[0] != "wa" || segs[1] != "on" || segs[2] != "worm_message" {
            return;
        }
        // Only the parenthesised call form. `wa.on.worm_message "x"` passes a string,
        // not a handler, and there is nothing to advise about.
        let args = match call.suffixes().find_map(|s| match s {
            Suffix::Call(full_moon::ast::Call::AnonymousCall(args)) => Some(args.as_ref()),
            _ => None,
        }) {
            Some(args) => args,
            None => return,
        };
        let arguments = match args {
            full_moon::ast::FunctionArgs::Parentheses { arguments, .. } => arguments,
            _ => return,
        };
        // A second argument is the opts table, so the filter is already there.
        if arguments.len() != 1 {
            return;
        }
        let Some(function) = arguments.iter().find_map(|e| match e {
            Expression::Function(f) => Some(&**f),
            _ => None,
        }) else {
            // `wa.on.worm_message(handler)` -- a name, not a body. Nothing to read.
            return;
        };
        // The engine calls this handler `(worm, msg)`. Only that exact shape is judged,
        // so a differently-named parameter is never assumed to be the message.
        //
        // `parameters()` is on the BODY, not on `AnonymousFunction`: in full_moon
        // 3.0 the parens and the block are one `FunctionBody`, and an anonymous
        // function is just the `function` keyword plus that body.
        let body = function.body();
        let Some(last) = body.parameters().iter().last() else {
            return;
        };
        let full_moon::ast::Parameter::Name(name) = last else {
            return;
        };
        if name_of(&name) != "msg" {
            return;
        }

        let mut scan = MsgScan::default();
        body.visit(&mut scan);
        // The emptiness test is on `names`, NOT on `reads`: a read that is a `wa.msg`
        // comparison is recorded by name and never counted in `reads`, so a handler
        // whose every read is safe has `reads == 0` AND must still be advised.
        // Checking `reads` here silenced every finding the rule exists to make.
        if scan.unsafe_read || scan.names.is_empty() {
            return;
        }

        let list = scan
            .names
            .iter()
            .map(|n| format!("wa.msg.{n}"))
            .collect::<Vec<_>>()
            .join(", ");
        // The suggestion is the whole point and it is short. The 470-character
        // original explained why the change is behaviour-preserving INSIDE the
        // message, which on a 1366-wide console is ~60 wrapped lines for one
        // finding -- long enough to hide every other row in the list. All of that
        // reasoning is real and belongs to the user, so it moves to `detail`
        // behind the Info button rather than being deleted.
        let (message, detail) = (
            format!("Pass the messages up front: {{ msgs = {{ {list} }} }}"),
            "This handler enters Lua for every message WA sends each worm, then tests `msg` \
             itself. Every use of `msg` here is a comparison against wa.msg, so \
             `wa.on.worm_message(function(worm, msg) ... end, { msgs = { ... } })` runs the \
             same code on the same messages without the dispatch for the rest. Filtered and \
             unfiltered handlers run together in registration order, so this changes neither \
             what runs nor what gets eaten."
                .to_string(),
        );
        let (line, column) = pos(call.prefix());
        self.diagnostics.push(AstDiagnostic::finding_with_detail(
            line,
            column,
            SEVERITY_INFO,
            "worm-msg-filter",
            message,
            detail,
        ));
    }
}

/// Collects every READ of the name `msg` inside a `worm_message` handler body.
///
/// A read that turns out to be the left operand of a `==`/`~=` against `wa.msg.X` is
/// recorded by NAME instead, so the caller gets the message list for free.
///
/// The safety rule is a single flag rather than a count: one read that is not a
/// `wa.msg` comparison sets `unsafe_read` and silences the WHOLE handler, because
/// such a use means some branch wants a value a message filter cannot supply. That
/// asymmetry is deliberate -- a missed suggestion costs a little performance, a
/// wrong one changes what the handler receives.
#[derive(Default)]
struct MsgScan {
    /// Reads of `msg` that are NOT the left operand of a wa.msg comparison.
    reads: usize,
    unsafe_read: bool,
    names: Vec<String>,
    /// Source positions of the `msg` operands already accepted as safe comparisons.
    ///
    /// NECESSARY because the walk is PRE-ORDER and does not stop descending. Once the
    /// `msg == wa.msg.X` node has been recognised, the walker still visits its `msg`
    /// child as an ordinary `Expression::Var`, which without this set is counted a
    /// second time and flagged unsafe -- which silently silenced EVERY finding. The
    /// node is always visited before its children, so the set is already populated
    /// when the child is reached.
    safe: HashSet<(usize, usize)>,
}

impl Visitor for MsgScan {
    fn visit_expression(&mut self, expr: &Expression) {
        if let Expression::BinaryOperator { binop, lhs, rhs } = expr {
            // `TildeEqual` is `~=`. These are the only two operators a filter can
            // stand in for: `msg > 3` is a real read of a value, not a choice.
            if matches!(
                binop,
                full_moon::ast::BinOp::TwoEqual(_) | full_moon::ast::BinOp::TildeEqual(_)
            ) {
                let reads_msg = matches!(
                    lhs.as_ref(),
                    Expression::Var(Var::Name(n)) if name_of(n) == "msg"
                );
                if reads_msg {
                    if let Some(segs) = path_from_expression(rhs) {
                        // Exactly `wa.msg.X`. The `msg` in the middle is the constant
                        // table, not the parameter, and is never counted as a read --
                        // which is also why the reversed `wa.msg.X == msg` spelling is
                        // left alone rather than guessed at.
                        if segs.len() == 3 && segs[0] == "wa" && segs[1] == "msg" {
                            if !self.names.contains(&segs[2]) {
                                self.names.push(segs[2].clone());
                            }
                            self.safe.insert(pos(lhs.as_ref()));
                            return;
                        }
                    }
                    // `msg == something_else`: a comparison the engine cannot filter on.
                    self.reads += 1;
                    self.unsafe_read = true;
                    self.safe.insert(pos(lhs.as_ref()));
                    return;
                }
            }
        }
        // Any other appearance of the name is a read we cannot vouch for: `wa.log(msg)`,
        // `lookup[msg]`, `msg > 3`, `return msg`. Already-accepted operands are skipped.
        if let Expression::Var(Var::Name(n)) = expr {
            if name_of(n) == "msg" && !self.safe.contains(&pos(expr)) {
                self.reads += 1;
                self.unsafe_read = true;
            }
        }
    }
}

/// File-global scan for `.kind` tests: the duck-typing half of `handle-union`.
///
/// A PRE-pass over the whole tree, deliberately. parser.ts scans its token stream
/// BEFORE its main walk, so an `obj:hurt()` on line 1 is ducked by a `.kind` test on
/// line 3. Collecting these during the main walk instead would make the result depend
/// on visit order -- and every disagreement with the baseline is drift the sweep counts.
#[derive(Default)]
struct KindScan {
    duck: HashSet<String>,
}

impl Visitor for KindScan {
    fn visit_expression(&mut self, expr: &Expression) {
        // `x.kind == "worm"` / `x.kind ~= "worm"`. A binary operator is a FIELD of the
        // node in full_moon 3.0, so this is the only place the comparison is visible.
        let Expression::BinaryOperator { binop, lhs, .. } = expr else {
            return;
        };
        if !matches!(
            binop,
            full_moon::ast::BinOp::TwoEqual(_) | full_moon::ast::BinOp::TildeEqual(_)
        ) {
            return;
        }
        if let Some(receiver) = kind_test_receiver(lhs) {
            self.duck.insert(receiver);
        }
    }
}

/// File-global scan of `for _, v in <wa.X.all()>` loops: what handle class `v` holds
/// INSIDE that loop.
///
/// A PRE-pass for the same reason `KindScan` is one, and it fills the gap that let a
/// false `missile-api` through in BOTH engines. `px/weapons/electromagnet.lua:93`
/// loops the missiles array and calls a real method on each element:
///
/// ```ignore
/// for _, missile in ipairs(wa.missiles.all()) do
///   missile:impulse(dx, dy)
/// end
/// ```
///
/// `wa.missiles.all()` yields WorldHandle userdata -- `spawn.rs` binds it through
/// `bind_kind_list`, whose `all` calls `objects_table`, and `objects_table` fills the
/// array with `WorldHandle::new(id)`, which HAS `impulse` (`actor.rs` `add_methods`).
/// The MissileEntity table is a different value entirely: the plain table
/// `wa.on.missile_frame` hands a callback, properties only, no methods.
///
/// Both engines used to resolve the loop value by NAME, `missile` -> MissileEntity,
/// and warn on a real method call. The name is a convention; the loop is a fact, so
/// this trace is consulted FIRST and the registry second.
///
/// WHY THE TRACE IS SCOPED TO THE LOOP BODY, and this is not a detail
/// A file-global `name -> class` map leaks, and it leaked immediately.
/// `mods/tools/audit/audit.lua` has `for _, w in ipairs(wa.worms.all())` at lines
/// 107 and 112, and separately passes `w` as a CALLBACK PARAMETER to the audit
/// harness's own mock worm at line 265 (`w:input{...}`). A name-keyed map claims
/// that parameter as the loop's worm, `w` stops resolving by name (`w` is not a
/// confident registry prefix -- only `worm` is), and 46 false `worm-api` warnings
/// appear on a file that had none. The name-keyed map turns one loop into a claim
/// about the whole file, which is the same disease the registry's `diagnose` split
/// exists to prevent. Keying on the loop's own position range keeps the claim where
/// it is true.
///
/// Deliberately single-hop, matching parser.ts's `traceLoopTypes`: only a loop
/// DIRECTLY over a `wa.X.all()` call counts. Never a variable holding the array, never
/// a filtered or mapped copy -- that is where a plausible-looking guess starts
/// producing wrong warnings, which is worse than silence. A helper CALLED from inside
/// the loop with the loop value passed as an argument is not inside the loop either,
/// so it falls back to the name table: silence, not a wrong answer.
#[derive(Default)]
struct LoopTrace {
    /// One entry per traced loop, in source order.
    loops: Vec<LoopBinding>,
}

struct LoopBinding {
    /// Lowercased loop value name.
    var_name: String,
    /// Handle class the iterator yields.
    class_name: &'static str,
    /// The loop body, as (start_line, start_col, end_line, end_col).
    span: (usize, usize, usize, usize),
}

impl LoopTrace {
    /// The handle class a receiver name holds AT THIS POSITION, if a traced loop binds
    /// it there. Last match wins, so a nested loop over the same name is the one that
    /// answers -- the same "last one seen" rule parser.ts uses.
    fn get(&self, receiver: &str, at: (usize, usize)) -> Option<&'static str> {
        self.loops
            .iter()
            .rev()
            .find(|b| {
                b.var_name == receiver
                    && at >= (b.span.0, b.span.1)
                    && at <= (b.span.2, b.span.3)
            })
            .map(|b| b.class_name)
    }
}

impl Visitor for LoopTrace {
    fn visit_generic_for(&mut self, for_stmt: &full_moon::ast::GenericFor) {
        // `for k, v in ...`: the VALUE is the last name. `for _, v in ...` has two, so
        // this also covers the `_` form, and `_` itself is then skipped.
        let Some(value) = for_stmt.names().iter().last() else {
            return;
        };
        let var_name = value.token().to_string().to_lowercase();
        if var_name == "_" {
            return;
        }
        // The iterator expression, whether wrapped: `ipairs(wa.missiles.all())`,
        // `pairs(...)`, or the bare `wa.worms.all()`.
        let Some(expr) = for_stmt.expressions().iter().next() else {
            return;
        };
        let Some(path) = iterator_path(expr) else {
            return;
        };
        let Some((_, class_name)) = engine_data::LOOP_ELEMENT
            .iter()
            .find(|(iter, _)| *iter == path)
        else {
            return;
        };
        let Some(span) = body_range_like(for_stmt.block()) else {
            return;
        };
        self.loops.push(LoopBinding {
            var_name,
            class_name,
            span,
        });
    }
}

/// The dotted path of a for-in iterator, unwrapping one call layer.
///
/// `wa.missiles.all()` -> `wa.missiles.all`; `ipairs(wa.missiles.all())` -> the same.
/// Anything that is not a call naming such a path returns None, which is how
/// `for _, x in ipairs(t)` (t holding the array) is declined rather than guessed.
///
/// Only `ipairs`/`pairs` are unwrapped, mirroring parser.ts. A wrapper must account
/// for the WHOLE expression, so `ipairs(wa.missiles.all()).extra` is not read as a
/// loop over the array.
fn iterator_path(expr: &Expression) -> Option<String> {
    let Expression::FunctionCall(outer) = expr else {
        return None;
    };
    // The bare form first: the iterator call IS the thing we know. Note that
    // `dotted_path` returns `["ipairs"]` for `ipairs(...)` -- it stops at the call
    // suffix -- so a miss here is a wrapper to unwrap, not a decline.
    if let Some(path) = dotted_path(outer) {
        let joined = path.join(".");
        if engine_data::LOOP_ELEMENT.iter().any(|(iter, _)| *iter == joined) {
            return Some(joined);
        }
    }
    let callee = match outer.prefix() {
        Prefix::Name(name) => name_of(name).to_lowercase(),
        _ => return None,
    };
    if !matches!(callee.as_str(), "ipairs" | "pairs") {
        return None;
    }
    let args = outer.suffixes().find_map(|s| match s {
        Suffix::Call(full_moon::ast::Call::AnonymousCall(args)) => Some(args),
        _ => None,
    })?;
    let full_moon::ast::FunctionArgs::Parentheses { arguments, .. } = args.as_ref() else {
        return None;
    };
    let first = arguments.iter().next()?;
    let Expression::FunctionCall(inner) = first else {
        return None;
    };
    Some(dotted_path(inner)?.join("."))
}

/// The receiver of a `.kind` comparison, matching parser.ts's token pattern
/// `identifier . kind ==|~= ` exactly:
///
/// - a bare name plus DOT indices only. `f().kind` and `t[1].kind` are NOT ducked
///   there (the token before `.` is not an identifier), so a call or a bracket
///   rejects here too -- measured against the baseline.
/// - parens are NOT unwrapped: `(obj).kind == …` is not ducked by parser.ts either.
/// - for `base.obj.kind`, the segment immediately before `kind` is what ducks
///   (`obj`) -- also measured, not assumed.
fn kind_test_receiver(expr: &Expression) -> Option<String> {
    let Expression::Var(var) = expr else {
        return None;
    };
    let full_moon::ast::Var::Expression(ve) = var else {
        return None;
    };
    let Prefix::Name(name) = ve.prefix() else {
        return None;
    };
    let mut segs = vec![name_of(name)];
    for suffix in ve.suffixes() {
        match suffix {
            Suffix::Index(Index::Dot { name, .. }) => {
                segs.push(name_of(name).trim_start_matches(':').to_string());
            }
            // A call or a bracketed index means the shape is not `ident . kind`.
            _ => return None,
        }
    }
    if segs.len() < 2 || segs.last()?.as_str() != "kind" {
        return None;
    }
    // Raw spelling, case preserved: parser.ts keys its duck set on token values and
    // matches case-sensitively at the call site.
    Some(segs[segs.len() - 2].clone())
}

/// `wa.on.draw(function() ... end)` -- the function body is render context: drawing
/// is per-client presentation, so math `cos`/`sin`/`atan` there cannot desync a
/// match and must stay silent.
///
/// TWO THINGS THIS USED TO GET WRONG, both found by running it over the engine's
/// OWN packs (`wfcheck WormForge-main-source/mods`), which the engine's own rule
/// (`tools/check_sim_math.py`) passes clean:
///
///  1. It only knew `wa.on.draw`. `wa.on.hud` is the same kind of callback -- the
///     engine says so in its own words: "wa.random: not inside wa.on.draw or
///     wa.on.hud. They run at render time" (spawn.rs:642), and
///     docs/lua-pixel-units.md: "Draw/HUD callbacks may use CRT maths because their
///     results stay local."
///
///  2. It only knew the function LITERAL. A draw callback nearly always delegates:
///
/// ```ignore
/// local function sheet(path, x, y, angle)
///   local c, sn = math.cos(angle), math.sin(angle)
///   wa.draw.quad({ ... })
/// end
/// wa.on.draw(function() sheet("a", 1, 2, 3) end)
/// ```
///
/// `sheet` is presentation-only and calls CRT trig. The old code reported
/// `math.cos()` there as an ERROR on `px/lib/turret.lua:576` -- valid engine
/// code, flagged as a desync risk.
///
/// The rule this now implements is the engine's, not a guess at it. From
/// `tools/check_sim_math.py`: a scope is rendering if it is a function passed
/// directly to `wa.on.draw(`/`wa.on.hud(`, or is REFERENCED BY NAME from something
/// already rendering; closure, transitively. Everything else is simulation.
///
/// KNOWN LIMITATION, and it is the engine's limitation too, not a shortcut here:
/// "referenced by a render root" wins. A helper called from a draw callback AND
/// from `wa.on.hit` is treated as rendering, because the engine's reachability
/// does the same (`reachable(render_roots)` is computed before simulation). We
/// match the rule we are implementing rather than being stricter in one direction
/// only, which would make the two disagree on the same file.
#[derive(Default)]
struct RenderScan {
    /// Every function body in the file, in visit (pre-)order, so a child's index
    /// is always GREATER than its parent's.
    bodies: Vec<FunctionBodyInfo>,
    /// Declared function name (last dotted segment, lowercased) -> body indices
    /// declaring it. A name can be declared more than once; the engine keeps them
    /// all, and so does this. Filled by `resolve`, not by the visit hooks.
    owners: HashMap<String, Vec<usize>>,
    /// `(name, declaration range)` seen during the walk, resolved to body indices
    /// afterwards by `resolve`.
    pending: Vec<(String, (usize, usize, usize, usize))>,
    /// Body ranges handed straight to wa.on.draw/wa.on.hud, resolved to body
    /// indices afterwards by `resolve`.
    root_ranges: Vec<(usize, usize, usize, usize)>,
    /// Body indices that ARE render roots, filled by `resolve`.
    roots: Vec<usize>,
    /// `subtree_end[i]` -- the last index of the run of bodies nested inside body `i`.
    /// Filled by `resolve_subtrees`.
    subtree_end: Vec<usize>,
}

struct FunctionBodyInfo {
    range: (usize, usize, usize, usize),
    /// Lowercased identifier tokens with their positions, so a parent's reference
    /// set can exclude the ones that belong to a NESTED body (the engine assigns
    /// each identifier to the innermost scope, and so must we -- otherwise a name
    /// used only by a nested function would drag that function into render reach).
    ids: Vec<(usize, usize, String)>,
}

impl RenderScan {
    /// Pairs every named declaration with the body it owns, and every render call
    /// with the body it was handed.
    ///
    /// NEITHER can be done in the visit hook, because the walker is pre-order:
    /// `visit_local_function` and `visit_function_call` both fire BEFORE the body
    /// inside them has been pushed. Resolving there meant `self.bodies.len() - 1`
    /// pointed at the enclosing function -- or underflowed on the first function in
    /// the file -- and matching on the range found nothing, so `roots` came back
    /// EMPTY and every `wa.on.draw` body lost its mute. That is the worst possible
    /// direction for this bug: it does not crash, it silently makes the checker
    /// harsher, and 20 errors on the engine's own packs looks like a rule that got
    /// stricter rather than an analysis that got emptier.
    fn resolve(&mut self) {
        for (name, decl) in std::mem::take(&mut self.pending) {
            let Some(idx) = self.body_inside(decl) else {
                continue;
            };
            self.owners.entry(name).or_default().push(idx);
        }
        for range in std::mem::take(&mut self.root_ranges) {
            // Binary search for the same reason `body_inside` does: a pack can
            // register dozens of draw callbacks, and a linear scan per registration
            // is another N² on a large file.
            let at = (range.0, range.1);
            let idx = self
                .bodies
                .partition_point(|b| (b.range.0, b.range.1) < at);
            if self.bodies.get(idx).map(|b| b.range) == Some(range) {
                self.roots.push(idx);
            }
        }
        self.resolve_subtrees();
    }

    /// Records, for each body, the index where its NESTED bodies stop.
    ///
    /// This turns "which bodies are nested in me" from a scan into one number.
    /// Bodies are pushed in pre-order, so a body's descendants are a CONTIGUOUS
    /// index range starting right after it. The first version recomputed that scan
    /// inside `direct_refs`, which is called once per body the render closure
    /// reaches -- quadratic in the number of functions in the file.
    ///
    /// A stack does it in one pass, because a body's descendants end exactly where
    /// the next body that it does NOT contain begins.
    fn resolve_subtrees(&mut self) {
        let n = self.bodies.len();
        self.subtree_end = vec![n.saturating_sub(1); n];
        let mut stack: Vec<usize> = Vec::new();
        for i in 0..n {
            while let Some(&top) = stack.last() {
                if range_contains(self.bodies[top].range, self.bodies[i].range) {
                    break;
                }
                self.subtree_end[top] = i - 1;
                stack.pop();
            }
            stack.push(i);
        }
        // Whatever is still on the stack runs to the last body.
    }

    /// The shallowest body contained in `decl` -- the body a declaration owns.
    ///
    /// BINARY SEARCH. `bodies` is pushed in pre-order, so it is already sorted by
    /// start position, and the body a declaration owns is the FIRST body starting
    /// at or after the declaration's own start. Scanning for it instead was
    /// quadratic: once per declaration, over every body in the file.
    ///
    /// The containment assertion afterwards is the real check -- binary search alone
    /// would happily return the next sibling if a declaration had no body.
    fn body_inside(&self, decl: (usize, usize, usize, usize)) -> Option<usize> {
        let at = (decl.0, decl.1);
        let idx = self
            .bodies
            .partition_point(|b| (b.range.0, b.range.1) < at);
        let body = self.bodies.get(idx)?;
        range_contains(decl, body.range).then_some(idx)
    }

    /// The identifiers this body references DIRECTLY: its own tokens, minus any that
    /// sit inside a NESTED body. Nested bodies belong to their own scope, exactly as
    /// the engine assigns them -- otherwise a name used only by a nested function
    /// would drag that function into render reach from its parent.
    ///
    /// The nested set is the contiguous index range `idx+1 ..= subtree_end[idx]`, so
    /// this is O(subtree) rather than O(all remaining bodies). For the common shape
    /// -- sibling top-level functions, which is what a pack file mostly is -- the
    /// range is empty and this costs nothing.
    fn direct_refs(&self, idx: usize) -> Vec<String> {
        let nested_end = self.subtree_end.get(idx).copied().unwrap_or(idx);
        if nested_end <= idx {
            return self.bodies[idx]
                .ids
                .iter()
                .map(|(_, _, n)| n.clone())
                .collect();
        }
        let nested: Vec<&(usize, usize, usize, usize)> = self.bodies[idx + 1..=nested_end]
            .iter()
            .map(|b| &b.range)
            .collect();
        self.bodies[idx]
            .ids
            .iter()
            .filter(|(l, c, _)| {
                !nested
                    .iter()
                    .any(|r| (*l, *c) >= (r.0, r.1) && (*l, *c) <= (r.2, r.3))
            })
            .map(|(_, _, n)| n.clone())
            .collect()
    }

    /// Records a named declaration to be paired with its body by `resolve`.
    fn declare<N: Node>(&mut self, name: String, decl: &N) {
        let Some(range) = body_range_like(decl) else {
            return;
        };
        self.pending.push((name, range));
    }

    /// Render regions, as (start_line, start_col, end_line, end_col), MERGED and sorted.
///
/// The merge is exact rather than a shortcut: the question `in_render_region` asks
/// is "is this point inside ANY region", so the answer depends only on the UNION of
/// the ranges, and merging overlapping intervals produces that same union and
/// nothing else. Nesting -- a `wa.on.draw` body inside another, a helper inside a
/// callback -- collapses into one interval, which is exactly what a linear scan
/// would have concluded.
///
/// It also makes the test O(log n) instead of O(n), and fixes determinism: `found`
/// is a `HashSet`, so returning its contents directly would yield a different ORDER
/// on every process. That would not change any finding, but the CLI has a test
/// asserting two runs over the same tree produce identical bytes, and nothing should
/// make that incidental.
fn regions(&self) -> Vec<(usize, usize, usize, usize)> {
        let mut found: HashSet<usize> = self.roots.iter().copied().collect();
        let mut queue: Vec<usize> = self.roots.clone();
        while let Some(idx) = queue.pop() {
            for name in self.direct_refs(idx) {
                let Some(children) = self.owners.get(&name) else {
                    continue;
                };
                for &child in children {
                    if found.insert(child) {
                        queue.push(child);
                    }
                }
            }
        }
        let mut out: Vec<(usize, usize, usize, usize)> =
            found.into_iter().map(|i| self.bodies[i].range).collect();
        out.sort_unstable();
        merge_ranges(&mut out);
        out
    }
}

impl Visitor for RenderScan {
    fn visit_function_body(&mut self, body: &full_moon::ast::FunctionBody) {
        let Some(range) = body_range(body) else {
            return;
        };
        // `body.tokens()` is the body's OWN token stream. A nested function's tokens
        // are physically inside it, which is exactly why `direct_refs` subtracts
        // them again.
        //
        // `.rev()` IS LOAD-BEARING, and it is a full_moon 3.0 performance bug.
        // `Tokens::next()` does `self.items.remove(0)` -- removing the FIRST element
        // of a Vec -- so walking a body's tokens front-to-back is quadratic in the
        // token count. `Tokens::next_back()` does `self.items.pop()`, which is O(1).
        // Iterating the same tokens in reverse is therefore linear.
        //
        // Measured on a file whose draw callback holds 16,000 calls (160,000-odd
        // tokens in one body): `visit_function_body` took 2,377 ms forward and
        // 8 ms reversed. Nothing here needs the tokens in source order -- they are
        // collected into a set keyed by position.
        let ids = body
            .tokens()
            .rev()
            .filter_map(|t| match t.token().token_type() {
                full_moon::tokenizer::TokenType::Identifier { identifier } => {
                    let pos = t.token().start_position();
                    Some((pos.line(), pos.character(), identifier.to_string().to_lowercase()))
                }
                _ => None,
            })
            .collect();
        self.bodies.push(FunctionBodyInfo { range, ids });
    }

    fn visit_local_function(&mut self, decl: &full_moon::ast::LocalFunction) {
        // `token()` rather than `to_string()` on the TokenReference: a token carries
        // trivia on BOTH sides, so `to_string()` on an indented name yields
        // `"    sheet"` and never matches a reference. `text()` in this file documents
        // the same trap.
        let name = decl.name().token().to_string().to_lowercase();
        self.declare(name, decl);
    }

    fn visit_function_declaration(&mut self, decl: &full_moon::ast::FunctionDeclaration) {
        let name = last_segment(&decl.name().to_string()).to_lowercase();
        self.declare(name, decl);
    }

    fn visit_function_call(&mut self, call: &FunctionCall) {
        let Some(segs) = dotted_path(call) else {
            return;
        };
        if segs.len() != 3 || segs[0] != "wa" || segs[1] != "on" {
            return;
        }
        if segs[2] != "draw" && segs[2] != "hud" {
            return;
        }
        if let Some(range) = render_body_range(call) {
            self.root_ranges.push(range);
        }
    }
}

/// True when `inner` lies inside `outer`, both `(line, col)`-based and inclusive.
fn range_contains(outer: (usize, usize, usize, usize), inner: (usize, usize, usize, usize)) -> bool {
    (inner.0, inner.1) >= (outer.0, outer.1) && (inner.2, inner.3) <= (outer.2, outer.3)
}

/// `a.b.c` -> `c`, `a:b` -> `b`. Function names are recorded by their LAST segment so
/// `M.sheet` and a bare `sheet` are the same owner, which is what the engine's
/// `name.split('.').split(':')[-1]` does.
fn last_segment(name: &str) -> &str {
    name.rsplit(['.', ':']).next().unwrap_or(name)
}

/// The body range of a function, as (start_line, start_col, end_line, end_col).
fn body_range(body: &full_moon::ast::FunctionBody) -> Option<(usize, usize, usize, usize)> {
    body_range_like(body)
}

/// The same range for any node. `Node::range()` exists, but spelling it out here
/// keeps the one definition of "a range" in this file.
fn body_range_like<N: Node>(node: &N) -> Option<(usize, usize, usize, usize)> {
    let start = node.start_position()?;
    let end = node.end_position()?;
    Some((start.line(), start.character(), end.line(), end.character()))
}

/// The body range of the function passed to `wa.on.draw(...)` / `wa.on.hud(...)`, as
/// (start_line, start_col, end_line, end_col). Declined when the argument is not a
/// function literal (a named callback or a variable): we cannot see its body, so it
/// is conservatively NOT treated as render context. The engine's own checker declines
/// it the same way -- only a function IMMEDIATELY preceded by `wa.on.draw(` is a root.
fn render_body_range(call: &FunctionCall) -> Option<(usize, usize, usize, usize)> {
    let fun: &full_moon::ast::AnonymousFunction = call.suffixes().find_map(|s| match s {
        Suffix::Call(full_moon::ast::Call::AnonymousCall(args)) => match args.as_ref() {
            full_moon::ast::FunctionArgs::Parentheses { arguments, .. } => arguments
                .iter()
                .find_map(|e| match e {
                    Expression::Function(f) => Some(&**f),
                    _ => None,
                }),
            _ => None,
        },
        _ => None,
    })?;
    body_range(fun.body())
}

/// Collapses overlapping and touching ranges in place, leaving them sorted.
///
/// Input must already be sorted by start. Ends are INCLUSIVE, so `[a..c]` and
/// `[c..e]` share the point `c` and merge -- which is correct, because a token sits
/// at a point, never between two.
fn merge_ranges(ranges: &mut Vec<(usize, usize, usize, usize)>) {
    let mut write = 0usize;
    for read in 1..ranges.len() {
        let (sl, sc, el, ec) = ranges[read];
        let (psl, psc, pel, pec) = ranges[write];
        if (sl, sc) <= (pel, pec) {
            // Overlaps or touches the range we are building: extend it if it goes on.
            if (el, ec) > (pel, pec) {
                ranges[write] = (psl, psc, el, ec);
            }
        } else {
            write += 1;
            ranges[write] = (sl, sc, el, ec);
        }
    }
    ranges.truncate(write + 1);
}

/// True when `(line, column)` falls inside one of the recorded render regions.
///
/// The regions arrive MERGED and sorted (see `RenderScan::regions`), so this is a
/// binary search rather than a scan: find the last region starting at or before the
/// point, and ask whether it reaches it. Merging is what makes that sound -- with
/// overlapping regions the rightmost one starting early enough might not cover the
/// point while an earlier one did.
fn in_render_region(
    line: usize,
    column: usize,
    regions: &[(usize, usize, usize, usize)],
) -> bool {
    let at = (line, column);
    let idx = regions.partition_point(|r| (r.0, r.1) <= at);
    idx > 0 && at <= (regions[idx - 1].2, regions[idx - 1].3)
}

/// Runs every check over one parsed file.
///
/// Called only on a file that PARSED, deliberately. If full_moon reported syntax
/// errors the tree is partial, and every structural check below would be reasoning
/// about an AST that does not correspond to what the author wrote -- findings piled on
/// top of an error the user already has to fix, which is how a checker loses trust.
///
/// Deliberately `pub` in the private `checks` module: this is the backwards-compatible
/// entry point (`run_with_custom(ast, Vec::new())`), kept so the sweep harness, the
/// `rules == rules_with(&[])` assertion and any caller on an older EXE resolve to the
/// same output as `run_with_custom`. The compiler flags it dead because nothing in
/// this crate calls it anymore -- that is the contract, not a leftover to delete.
#[allow(dead_code)]
pub fn run(ast: &full_moon::ast::Ast) -> Vec<AstDiagnostic> {
    run_with_custom(ast, Vec::new())
}


/// Runs every check with the user's own verbs from custom_verbs.cfg, as
/// (class, member) pairs. `run()` above is this with an empty overlay, so the
/// sweep harness and every existing test keep calling what they always called
/// and see exactly what they always saw.
pub fn run_with_custom(
    ast: &full_moon::ast::Ast,
    custom: Vec<(String, String)>,
) -> Vec<AstDiagnostic> {
    // The duck set is collected FIRST, over the whole tree. parser.ts pre-scans its
    // token stream the same way, so a call on line 1 is ducked by a `.kind` test on
    // line 3 -- collecting during the main walk instead would make the result depend
    // on visit order, and every disagreement with the baseline is drift the sweep
    // counts.
    let mut scan = KindScan::default();
    scan.visit_ast(ast);
    // Render context is also file-global: `wa.on.draw` on line 1 mutes math inside a
    // callback on line 3, so collect render regions before the main walk too.
    let mut render = RenderScan::default();
    render.visit_ast(ast);
    render.resolve();
    // Loop trace is also file-global, and for the same reason: `wa.missiles.all()` on
    // line 90 resolves `missile` on line 95.
    let mut loop_trace = LoopTrace::default();
    loop_trace.visit_ast(ast);
    let mut checker = Checker::new(scan.duck, custom, render.regions());
    checker.loop_trace = loop_trace;
    checker.visit_ast(ast);
    checker.finish()
}
/// The string a node renders to, which for a token IS the token text.
///
/// This is why the checks work off `to_string()` rather than a token-type match:
/// `Index::Dot`'s name field already includes its leading `:`, so `worm:hurt`
/// renders as `":hurt"` and needs trimming before it can be compared to `"hurt"`.
fn text<N: Node + std::fmt::Display>(node: &N) -> String {
    node.to_string()
}

/// The bare text of a NAME token, with trivia excluded.
///
/// A token carries trivia on BOTH sides, and two separate traps here have each silently
/// disabled checks on real mod code:
///
///   - LEADING WHITESPACE: `text()` on the first name of an indented line yields
///     `"    wa"`, so every `segs[0] == "wa"` and every receiver lookup failed on any
///     statement that BEGINS with the receiver -- nearly all real mod code. `.trim()`
///     fixes this half, and the regression tests for it are the `indented_*` cases below.
///   - LEADING COMMENTS: `.trim()` does NOT fix this, because a comment is not
///     whitespace. A file that opens with a `--` block attaches that whole block to its
///     first real token, so that token renders as the comment. Reading the token type
///     instead cannot include trivia at all, because trivia is not part of the token.
///
/// The comment half was found while porting `undefined-global`: the pack sweep reported
/// findings whose "name" was a comment block, which is what led to this helper being
/// shared rather than `.trim()` being copied a second time.
fn name_of(name: &full_moon::tokenizer::TokenReference) -> String {
    use full_moon::tokenizer::TokenType;
    match name.token().token_type() {
        TokenType::Identifier { identifier } => identifier.to_string(),
        TokenType::Symbol { symbol } => symbol.to_string(),
        // A name position holding something else is not readable, and claiming
        // knowledge about it would be a guess.
        _ => String::new(),
    }
}

/// The name of a call's prefix, when it is a simple bare identifier.
///
/// A prefix can also be an arbitrary expression (`f().field`, `(a or b):x`), and there
/// is no single name to look up. Returning `None` declines the lookup rather than
/// inventing one -- the same reasoning as `dotted_path` returning `None`.
fn prefix_name(prefix: &Prefix) -> Option<String> {
    match prefix {
        Prefix::Name(name) => Some(name_of(name)),
        _ => None,
    }
}

/// Index of the first `receiver:method()` suffix, or None when the call is not one.
///
/// `MethodCall` has no `prefix()` in full_moon: the receiver is the call's prefix and
/// the method is a suffix of the same node, so a chained call carries both in one
/// suffix list (`f().worm:hurtt()` = prefix `f`, suffixes `[Call, Index, MethodCall]`).
fn method_call_index(suffixes: &[&Suffix]) -> Option<usize> {
    suffixes
        .iter()
        .position(|s| matches!(s, Suffix::Call(full_moon::ast::Call::MethodCall(_))))
}

/// The receiver: whatever sits IMMEDIATELY before the colon, matching parser.ts's
/// token window. The RAW spelling is returned -- the duck set is matched
/// case-sensitively, exactly as parser.ts builds it from token values, while the
/// registry lookup folds case.
///
/// The prefix is only the receiver when it sits directly before the colon. A
/// parenthesized expression (`(a or b):x()`) has `)` there and declines, and a `[...]`
/// index or an earlier call is not an identifier at all -- which is why
/// `M.sounds[1]:find("inflate")` is a call on a STRING and not on a handle named `m`.
fn receiver_before_colon(
    call: &FunctionCall,
    suffixes: &[&Suffix],
    mc_idx: usize,
) -> Option<String> {
    if mc_idx == 0 {
        return prefix_name(call.prefix());
    }
    match suffixes[mc_idx - 1] {
        Suffix::Index(Index::Dot { name, .. }) => Some(name_of(name)),
        _ => None,
    }
}

/// Where a call's first argument lives, which depends on whether the author wrote parens.
///
/// This is an enum rather than a single `&Expression` because the two spellings do not
/// produce the same node type: `f("x")` yields an `Expression::String`, while `f "x"`
/// yields `FunctionArgs::String`, which holds a bare `TokenReference`. There is no common
/// node to borrow, and forcing one (say, by re-parsing the token) would invent an AST
/// that does not exist.
enum FirstArg<'a> {
    /// `f("x")` -- a real `Expression`.
    Expr(&'a Expression),
    /// `f "x"` -- a bare string, held as the `TokenReference` that wraps the token.
    ///
    /// The `TokenReference` rather than the `Token` because only the wrapper implements
    /// `Node`, and the anchor has to be a node for `Checker::add` to position on it.
    Str(&'a full_moon::tokenizer::TokenReference),
}

impl FirstArg<'_> {
    /// The literal's text, or `None` if the argument is computed.
    fn text(&self) -> Option<String> {
        match self {
            FirstArg::Expr(e) => string_literal(e),
            FirstArg::Str(t) => unquote(t.token().token_type()),
        }
    }

    /// The (line, column) to anchor a diagnostic on.
    ///
    /// Returns a POSITION rather than a node, and that is deliberate. The two argument
    /// shapes are unrelated types -- `Expression` versus `TokenReference` -- with no
    /// common concrete node to borrow. Handing `Checker::add` a `&dyn Node` would work,
    /// but it forces `add` and `pos` to take `?Sized` bounds for one call site, which is
    /// a wider change than this feature deserves. Resolving the position here keeps
    /// `add`'s signature exactly as it was.
    ///
    /// Both spellings anchor on the string itself, so the column matches either way. That
    /// matters: if they differed, the (line, column, rule) dedup in `mergeDiagnostics`
    /// would treat the two spellings as unrelated findings and list a duplicate.
    fn anchor(&self) -> (usize, usize) {
        match self {
            FirstArg::Expr(e) => pos(*e),
            FirstArg::Str(t) => pos(*t),
        }
    }
}

/// The first argument of a call, whether or not the parens were written.
///
/// `Suffix::Call` wraps a `Call`, whose `MethodCall` holds `args: FunctionArgs`.
///
/// The `String` arm is `worm:set_state "sliding"` -- Lua allows a single call argument
/// to drop its parentheses, and this function USED to return `None` for it, so the whole
/// parentheseless spelling went unchecked. That is a silent hole, not a limitation of
/// the AST: the value is right there in `FunctionArgs::String`.
///
/// It matters because `worm:set_state "sliding"` is the shape a Lua author naturally
/// writes, so the typo this check exists to catch (`"slidng"`) was caught only when the
/// author happened to use parens.
fn first_argument(method_call: &full_moon::ast::MethodCall) -> Option<FirstArg<'_>> {
    match method_call.args() {
        full_moon::ast::FunctionArgs::Parentheses { arguments, .. } => {
            arguments.iter().next().map(FirstArg::Expr)
        }
        // The parentheseless form, which by definition carries exactly one argument, and
        // is always a string token -- `FunctionArgs::String` has no other payload.
        full_moon::ast::FunctionArgs::String(token) => Some(FirstArg::Str(token)),
        // `FunctionArgs` is `#[non_exhaustive]`; the `TableConstructor` arm and anything
        // added later are shapes this build cannot read, so declining to claim them is
        // the correct behaviour.
        _ => None,
    }
}

/// The text of a string literal, unquoted. None for anything computed.
///
/// Reading the token TYPE is what keeps a comment attached to it out of the value,
/// the same trap `name_of` exists for.
fn string_literal(expr: &Expression) -> Option<String> {
    let Expression::String(token) = expr else { return None };
    unquote(token.token_type())
}

/// The same unquoting, for a bare string TOKEN rather than an `Expression`.
///
/// Needed because `worm:set_state "sliding"` does not parse the `"sliding"` as an
/// `Expression` at all -- `FunctionArgs::String` holds a `TokenReference` directly, so
/// there is no `Expression` to hand to `string_literal`. Copying the unquote rules
/// instead of sharing them would let the two spellings drift, which is precisely the
/// class of bug that left the parentheseless form unchecked in the first place.
fn unquote(token_type: &full_moon::tokenizer::TokenType) -> Option<String> {
    use full_moon::tokenizer::TokenType;
    let TokenType::StringLiteral { literal, .. } = token_type else {
        return None;
    };
    let raw = literal.to_string();
    let unquoted = raw.trim_matches(|c| c == '"' || c == '\'');
    if unquoted.is_empty() {
        return None;
    }
    Some(
        unquoted
            .replace("\\\"", "\"")
            .replace("\\'", "'")
            .replace("\\\\", "\\"),
    )
}

/// Whether `worm:set_state` accepts this name.
///
/// GENERATED from `src/data/wormStates.ts`, which mirrors `settable_worm_state()` in
/// crates/lua-host/src/actor.rs. Deliberately NOT case-folded and NOT underscore-
/// folded: the engine matches the literal name, so `"Sliding"` fails there too and
/// must fail here rather than be excused.
fn settable_worm_state(name: &str) -> bool {
    engine_data::WORM_SETTABLE_STATES
        .iter()
        .any(|(n, _)| *n == name)
}

/// A `wa.*` path reference, whether it is called or merely assigned to.
struct WaRef {
    line: usize,
    column: usize,
    /// The full path, e.g. `["game_state", "states", "AIR_TIME"]`.
    segs: Vec<String>,
    /// For an INDEXED path (`visit_var`), how many of `segs` sit before the first call.
    /// Everything past that point is field access on the call's RESULT, not namespace, so
    /// `finish` truncates before naming it. `None` for call-sourced refs, which are
    /// already bounded by `dotted_path` (it breaks at the call).
    boundary: Option<usize>,
}

/// One `receiver:method()` that passed only because the receiver is duck-typed by a
/// `.kind` test -- the aggregation unit of `handle-union`.
///
/// Keyed by (receiver, method) in first-seen order and reported ONCE per key, exactly
/// like `unionPasses` in parser.ts: a file with a dozen branches produces one notice,
/// not a dozen findings.
struct UnionPass {
    receiver: String,
    method: String,
    /// What the receiver name ALONE suggests -- the registry's class.
    assumed_class: String,
    /// Handle classes that have the member, in the union table's order (which is the
    /// TypeScript `ALL_HANDLE_CLASSES` order, so `owners.join(" and ")` reads the same).
    /// Owned, not `&'static str`: user verbs from custom_verbs.cfg can join this
    /// list, and those names are read at runtime, not baked into the binary.
    owners: Vec<String>,
    /// Every call site's line. The notice reports the MINIMUM, which is what
    /// parser.ts `lines[0]` is: the first occurrence in file order.
    lines: Vec<usize>,
}

/// "3734", "3734 and 4209", "3734, 4209 and 4372" -- verbatim port of `formatLines`
/// in parser.ts, dedup and sort included, so the notice reads the same once
/// parser.ts is gone.
fn format_lines(lines: &[usize]) -> String {
    let mut sorted = lines.to_vec();
    sorted.sort_unstable();
    sorted.dedup();
    match sorted.len() {
        0 => String::new(),
        1 => sorted[0].to_string(),
        2 => format!("{} and {}", sorted[0], sorted[1]),
        _ => {
            let head: Vec<String> = sorted[..sorted.len() - 1]
                .iter()
                .map(usize::to_string)
                .collect();
            format!("{} and {}", head.join(", "), sorted[sorted.len() - 1])
        }
    }
}

/// The `handle-union` notice, word for word as parser.ts writes it.
///
/// `mergeDiagnostics` keeps the TS wording when both sides report the same
/// (line, column, rule), so today this text only shows when Rust runs alone. It still
/// has to match: the day parser.ts is deleted, a Rust-only run must say exactly what
/// the reviewed baseline said.
fn union_notice_message(pass: &UnionPass) -> String {
    format!(
        "Passed - lines {} call `{}:{}()`, which {} has but {} does not.",
        format_lines(&pass.lines),
        pass.receiver,
        pass.method,
        pass.owners.join(" and "),
        pass.assumed_class,
    )
}

/// The reasoning behind a `union_notice_message` line. Split out for the same
/// reason as `AstDiagnostic::detail`: the message says what PASSED, this says
/// why that is worth noticing at all and when it would stop being true.
fn union_notice_detail(pass: &UnionPass) -> String {
    format!(
        "`{}` -- what `{}` alone suggests -- does not have this method. `{}` is narrowed by a \
         `.kind` test, so it is a different handle in each branch. That is correct while every \
         branch is covered; a missing one only breaks in-game, when the engine runs this method \
         on the wrong handle.",
        pass.assumed_class, pass.receiver, pass.receiver,
    )
}

/// Walks an expression and records the position of every `wa.*` reference inside it.
///
/// This is the capability-check guard, and it is where having a real AST pays off.
///
/// `X and X()` is a VERSION PROBE, not a typo. The pack is asking "does this API
/// exist?" and handling both answers -- exactly what you write when you are unsure,
/// and the short-circuit is the entire point. `bee.lua:457` does this in the wild, in
/// code that works.
///
/// In a token window this needed a heuristic ("skip if the neighbour is and/or/if/
/// then") that was wrong twice -- once because it missed the call half of
/// `if wa.x then wa.x() end`, once because it did not handle nesting. Here the parent
/// node is simply handed to us: a call sitting anywhere under an `and` or an `or` is
/// guarded, and no amount of nesting changes that.
fn collect_wa_positions(expr: &Expression, out: &mut HashSet<(usize, usize)>) {
    match expr {
        Expression::FunctionCall(call) => {
            if let Some(segs) = dotted_path(call) {
                if segs.first().map(String::as_str) == Some("wa") {
                    out.insert(pos(call.prefix()));
                }
            }
            // Arguments too: `wa.weapons.replace(wa.foo.bar())` guards the inner call,
            // and a walk that stopped at the outer call would miss it. `Suffix::Call`
            // wraps a `Call`, whose `AnonymousCall` holds the arguments.
            for suffix in call.suffixes() {
                if let Suffix::Call(full_moon::ast::Call::AnonymousCall(args)) = suffix {
                    if let full_moon::ast::FunctionArgs::Parentheses { arguments, .. } =
                        args.as_ref()
                    {
                        for arg in arguments.iter() {
                            collect_wa_positions(arg, out);
                        }
                    }
                }
            }
        }
        Expression::BinaryOperator { lhs, rhs, .. } => {
            collect_wa_positions(lhs, out);
            collect_wa_positions(rhs, out);
        }
        Expression::Parentheses { expression, .. } => collect_wa_positions(expression, out),
        Expression::UnaryOperator { expression, .. } => collect_wa_positions(expression, out),
        Expression::Var(v) => {
            if let full_moon::ast::Var::Expression(ve) = v {
                if let Some(segs) = path_from_varexpression(ve.as_ref()) {
                    if segs.first().map(String::as_str) == Some("wa") {
                        out.insert(pos(v));
                    }
                }
            }
        }
        _ => {}
    }
}

/// Every `wa.*` reference inside a block, used to guard an `if`'s branches.
///
/// Statements are the reason a plain expression walk is not enough: in
/// `if wa.x then wa.y() end` the condition guards `wa.x`, but `wa.y()` sits in a
/// statement, guarded by the mere existence of the `then`.
fn collect_wa_in_block(block: &full_moon::ast::Block, out: &mut HashSet<(usize, usize)>) {
    struct Finder<'a>(&'a mut HashSet<(usize, usize)>);
    impl<'a> Visitor for Finder<'a> {
        fn visit_function_call(&mut self, call: &FunctionCall) {
            if let Some(segs) = dotted_path(call) {
                if segs.first().map(String::as_str) == Some("wa") {
                    self.0.insert(pos(call.prefix()));
                }
            }
        }
    }
    let mut finder = Finder(out);
    // `block.visit(&mut finder)` -- the `Visit` IMPL, which recurses.
    //
    // This used to say `finder.visit_block(block)`, which compiles, type-checks, and
    // silently collects NOTHING: `visit_block` on the `Visitor` TRAIT is the empty
    // default hook called at each node, not the recursive walker. Reaching children is
    // `Visit::visit`'s job, and it is a different method with a similar name.
    //
    // The bug was invisible because of a second one stacked on top of it: the `wa.*`
    // push only queued three-segment paths, and the only bodies this ever needed to
    // guard contained two-segment calls (`if wa.x then wa.x() end`), which were never
    // queued and so never needed guarding. Fixing the segment guard exposed this.
    // Lesson worth keeping: a walker that collects nothing and a walker that is handed
    // nothing look identical from outside. `an_if_body_is_guarded` now pins it.
    block.visit(&mut finder);
}

/// The dotted path behind a call's prefix, e.g. `["wa", "weapons", "replace"]`.
///
/// Returns `None` for anything dynamic -- `t[k].m()`, a literal, a parenthesised
/// expression -- because a path we cannot read statically is a path we must not claim
/// knowledge about. Guessing here is how a checker starts crying wolf.
pub fn dotted_path(call: &FunctionCall) -> Option<Vec<String>> {
    let mut segs = match call.prefix() {
        Prefix::Name(name) => vec![name_of(name)],
        Prefix::Expression(expr) => path_from_expression(expr)?,
        // `Prefix` is `#[non_exhaustive]`; an unknown shape is by definition one we
        // cannot read, so declining to claim it is the correct behaviour.
        _ => return None,
    };
    for suffix in call.suffixes() {
        match suffix {
            Suffix::Index(index) => match index {
                Index::Dot { name, .. } => {
                    segs.push(name_of(name).trim_start_matches(':').to_string())
                }
                Index::Brackets { expression, .. } => {
                    let literal = text(expression);
                    let trimmed = literal.trim_matches(['"', '\'']);
                    if trimmed.len() == literal.len() {
                        return None;
                    }
                    segs.push(trimmed.to_string());
                }
                _ => return None,
            },
            // A trailing call is the call itself, not part of the path.
            Suffix::Call(_) => break,
            _ => return None,
        }
    }
    Some(segs)
}

fn path_from_expression(expr: &Expression) -> Option<Vec<String>> {
    let var = match expr {
        Expression::Var(v) => v,
        _ => return None,
    };
    match var {
        full_moon::ast::Var::Name(name) => Some(
            name_of(name)
                .split('.')
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
                .collect(),
        ),
        full_moon::ast::Var::Expression(ve) => path_from_varexpression(ve.as_ref()),
        // `Var` is `#[non_exhaustive]`; an unreadable form yields no path.
        _ => None,
    }
}

fn path_from_varexpression(ve: &VarExpression) -> Option<Vec<String>> {
    let mut segs = match ve.prefix() {
        Prefix::Name(name) => vec![name_of(name)],
        Prefix::Expression(expr) => path_from_expression(expr)?,
        _ => return None,
    };
    for suffix in ve.suffixes() {
        match suffix {
            Suffix::Index(index) => match index {
                Index::Dot { name, .. } => {
                    // `.trim()` is REQUIRED, not cosmetic. The token for
                    // `.AIR_TIME ` carries its trailing whitespace, so without this the
                    // key arrives as "AIR_TIME " and every lookup misses -- a valid
                    // state would be reported as wrong, which is the worst failure
                    // mode this checker has.
                    segs.push(name_of(name).trim_start_matches(':').to_string())
                }
                _ => return None,
            },
            // Continue PAST a call rather than breaking, unlike `dotted_path`.
            //
            // The motivating case is the A5 assignment target:
            //   wa.game_state(1).states.AIR_TIME = 30
            // Here `wa.game_state(1)` is a call in the MIDDLE of the path, and the
            // interesting segments come after it. Breaking at the call yields
            // ["wa", "game_state"] and the check silently never fires -- which is
            // exactly how a check becomes dead code while still reading as tested.
            Suffix::Call(_) => continue,
            _ => return None,
        }
    }
    Some(segs)
}

/// Whether `key` names a real engine state, tolerating case and `_`.
///
/// The engine's table is SCREAMING_CASE, but packs are hand-written and
/// `states.air_time` is a silent nil rather than a syntax error -- exactly the kind of
/// Levenshtein with an early exit once every cell in a row already exceeds `max`.
/// The candidate lists are ~140 entries and this runs per candidate, so the band
/// matters; it also bounds the cost of an absurd input.
pub fn levenshtein(a: &str, b: &str, max: usize) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    if a.is_empty() {
        return b.len();
    }
    if b.is_empty() {
        return a.len();
    }
    if a.len().abs_diff(b.len()) > max {
        return max + 1;
    }

    let mut prev: Vec<usize> = (0..=b.len()).collect();
    let mut cur = vec![0usize; b.len() + 1];

    for (i, ca) in a.iter().enumerate() {
        cur[0] = i + 1;
        let mut row_best = cur[0];
        for (j, cb) in b.iter().enumerate() {
            let cost = usize::from(ca != cb);
            cur[j + 1] = (prev[j] + cost).min(prev[j + 1] + 1).min(cur[j] + 1);
            row_best = row_best.min(cur[j + 1]);
        }
        if row_best > max {
            return max + 1;
        }
        std::mem::swap(&mut prev, &mut cur);
    }
    prev[b.len()]
}

/// Whether `key` is a real `wa.weapons.replace` spec key.
///
/// Case-insensitive, matching `specKeys.ts`: packs write `COPY_FROM` as readily as
/// `copy_from`, and the engine reads it either way. A key that is real but missing from
/// the list produces a FALSE POSITIVE, which is why that list errs toward inclusion.
fn spec_key_exists(key: &str) -> bool {
    let want = key.to_lowercase();
    SPEC_KEYS.iter().any(|k| k.eq_ignore_ascii_case(&want))
}

/// Closest known spec key, if one is close enough to be worth suggesting.
///
/// The thresholds are copied from `suggestSpecKey` in `specKeys.ts` rather than reusing
/// `suggest()` above, because the two disagree deliberately. Spec keys are SHORT
/// (`copy_from`, `on_fire`), where one edit is almost always the whole story, so short
/// words tolerate only 1 while long ones take 3. The generic radius above is 1 for short
/// and 2 for long, which would refuse to suggest `copy_from` for `copy_form`.
///
/// Case-insensitive, to match how the engine reads the key.
fn suggest_spec_key(typo: &str) -> Option<&'static str> {
    let t = typo.to_lowercase();
    let mut best: Option<(usize, &'static str)> = None;
    for key in SPEC_KEYS {
        let d = levenshtein(&t, &key.to_lowercase(), 3);
        if best.map_or(true, |(bd, _)| d < bd) {
            best = Some((d, key));
        }
    }
    // Long words tolerate 2 edits, short ones only 1. Above that it is a guess, and a
    // wrong suggestion is worse than none -- it sends the reader chasing a key that does
    // not exist.
    let threshold = if t.len() <= 5 {
        1
    } else if t.len() <= 9 {
        2
    } else {
        3
    };
    best.filter(|(d, _)| *d <= threshold).map(|(_, k)| k)
}

/// Closest candidate to `word`, if one is within a plausible typo radius.
///
/// The radius scales with length because a 2-edit distance on a 4-character key
/// ("hop" -> "hp") is meaningless noise, while on a 20-character key it is usually a
/// real typo. One edit for short keys, two above eight characters.
pub fn suggest<'a>(word: &str, candidates: &[&'a str]) -> Option<&'a str> {
    let max = if word.len() <= 8 { 1 } else { 2 };
    let mut best: Option<(usize, &str)> = None;
    for c in candidates {
        let d = levenshtein(word, c, max);
        if d <= max && best.map_or(true, |(bd, _)| d < bd) {
            best = Some((d, c));
        }
    }
    best.map(|(_, c)| c)
}

/// Closest `wa.*` FUNCTION path for a mistyped call, compared on the leaf name.
///
/// `wa.fog.visble` must suggest `wa.fog.visible`, not `wa.fog`. The namespace is
/// a table and cannot be called, so suggesting it sends the reader somewhere that
/// will not run -- a wrong suggestion is worse than none.
///
/// The leaf comparison mirrors `suggestWaFunction` in src/data/specKeys.ts, which
/// is what the front end already shows: paths of different lengths are not
/// compared whole, so the namespace never has to match the word being corrected.
fn suggest_function(segs: &[String]) -> Option<String> {
    let (namespace, leaf) = match segs {
        [ns, leaf, ..] => (Some(ns.as_str()), leaf.as_str()),
        [leaf] => (None, leaf.as_str()),
        [] => return None,
    };
    // Short names get a looser radius than `suggest` uses: transpositions such as
    // "repalce" -> "replace" are two edits and the most common typo of all.
    let max = if leaf.len() <= 6 { 2 } else { 3 };
    let mut best: Option<(usize, String)> = None;
    for path in engine_data::WA_FUNCTIONS {
        let Some(rest) = path.strip_prefix("wa.") else {
            continue;
        };
        let candidate = match (namespace, rest.split_once('.')) {
            (Some(ns), Some((found_ns, found_leaf))) if found_ns == ns => found_leaf,
            (None, None) => rest,
            // A namespace typo means the caller wrote a different table name; the
            // leaf cannot be trusted to line up with the real namespace's leaves.
            _ => continue,
        };
        let d = levenshtein(leaf, candidate, max);
        if d <= max && best.as_ref().map_or(true, |(bd, _)| d < *bd) {
            best = Some((d, path.to_string()));
        }
    }
    best.map(|(_, path)| path)
}

/// The top-level `wa.*` namespaces, for "did you mean" on a misspelled verb.
/// Derived from the generated function list so it cannot drift out of date.
fn namespaces() -> Vec<&'static str> {
    let mut out: Vec<&'static str> = engine_data::WA_FUNCTIONS
        .iter()
        .filter_map(|f| f.strip_prefix("wa."))
        .filter_map(|rest| rest.split_once('.').map(|(ns, _)| ns))
        .collect();
    out.sort_unstable();
    out.dedup();
    out
}

/// `(line, column)` for a node, defaulting to the top-left.
///
/// `start_position` returns `None` for synthesised nodes, which has no meaningful
/// place to point a diagnostic at. Falling back to line 1 keeps the front end's
/// "click the finding" behaviour working instead of dropping the finding.
fn pos<N: Node>(node: &N) -> (usize, usize) {
    match node.start_position() {
        Some(p) => (p.line(), p.character()),
        None => (1, 1),
    }
}
#[cfg(test)]
mod tests {
    use super::*;

    /// Runs the checker over `src` and returns the rule ids it produced.
    fn rules(src: &str) -> Vec<String> {
        let ast = full_moon::parse(src).expect("test input must parse");
        run(&ast).into_iter().map(|d| d.rule).collect()
    }

    fn messages(src: &str, rule: &str) -> Vec<String> {
        let ast = full_moon::parse(src).expect("test input must parse");
        run(&ast)
            .into_iter()
            .filter(|d| d.rule == rule)
            .map(|d| d.message)
            .collect()
    }

    /// The `detail` half of a rule's findings, for the checks that pin which text
    /// is SHORT (the console row) and which is LONG (behind the Info button).
    ///
    /// Unwrap is safe here on purpose: a test that asks for the detail of a rule
    /// has already decided that rule has one, so a `None` is a failure and should
    /// panic with the source rather than silently compare against an empty list.
    fn details(src: &str, rule: &str) -> Vec<String> {
        let ast = full_moon::parse(src).expect("test input must parse");
        run(&ast)
            .into_iter()
            .filter(|d| d.rule == rule)
            .map(|d| d.detail.expect("this rule must carry a detail"))
            .collect()
    }

    /// Every finding, for the checks that pin severity and position rather than text.
    fn diagnostics(src: &str) -> Vec<AstDiagnostic> {
        let ast = full_moon::parse(src).expect("test input must parse");
        run(&ast)
    }

    // ---- desync checks ---------------------------------------------------

    #[test]
    fn math_random_is_an_error() {
        assert_eq!(rules("local x = math.random()"), vec!["lockstep-rng"]);
    }

    // math.cos/sin/atan inside `wa.on.draw` is presentation-only: per-client drawing
    // never desyncs a match, so it stays silent there.
    #[test]
    fn math_sin_in_render_is_silent() {
        let src = "wa.on.draw(function()\n  local x = math.sin(1)\nend)";
        assert!(rules(src).is_empty(), "got {:?}", rules(src));
    }

    #[test]
    fn math_atan_in_render_is_silent() {
        let src = "wa.on.draw(function()\n  local a = math.atan(1, 2)\nend)";
        assert!(rules(src).is_empty(), "got {:?}", rules(src));
    }

    /// Outside render context the same calls remain errors.
    #[test]
    fn math_cos_outside_render_is_an_error() {
        assert_eq!(rules("local x = math.cos(1)"), vec!["lockstep-rng"]);
    }

    /// A named callback's body is invisible to the checker, so it is NOT treated as
    /// render context and math there still errors (conservative: no false negatives).
    #[test]
    fn math_sin_in_named_callback_is_still_an_error() {
        let src = "local function handler()\n  local x = math.sin(1)\nend\nwa.on.draw(handler)";
        assert_eq!(rules(src), vec!["lockstep-rng"]);
    }

    // ---- render context: the rules the ENGINE states, not ones we invented ----
    //
    // Every test below is anchored to a line in the engine's own source or its own
    // checker. The engine's `tools/check_sim_math.py` reports `passed` over the
    // whole `mods/` tree, so any finding we raise there is ours, not the pack's.

    /// `wa.on.hud` is the same kind of callback as `wa.on.draw`.
    ///
    /// spawn.rs:642, in the engine's own words: "wa.random: not inside wa.on.draw or
    /// wa.on.hud. They run at render time." docs/lua-pixel-units.md:49: "Draw/HUD
    /// callbacks may use CRT maths because their results stay local." This used to
    /// be an error on valid engine code (`gif_donkey/lua.lua:140`).
    #[test]
    fn math_cos_in_a_hud_callback_is_silent() {
        let src = "wa.on.hud(function()\n  local x = math.cos(1)\nend)";
        assert!(rules(src).is_empty(), "got {:?}", rules(src));
    }

    /// A LOCAL HELPER called only from a draw callback is render context.
    ///
    /// This is the false positive that started all of it: `px/lib/turret.lua:573`
    /// declares `local function sheet(path, x, y, frame, angle, ...)` which rotates
    /// quad corners with `math.cos`/`math.sin` at line 576, and is called from the
    /// draw callback. The engine's checker passes the file; we called it a desync.
    #[test]
    fn a_local_helper_of_a_draw_callback_is_render_context() {
        let src = "local function sheet(angle)\n  return math.cos(angle), math.sin(angle)\nend\nwa.on.draw(function()\n  sheet(1)\nend)";
        assert!(rules(src).is_empty(), "got {:?}", rules(src));
    }

    /// The closure is transitive: helper -> helper -> trig.
    #[test]
    fn render_context_closes_transitively() {
        let src = "local function inner(a)\n  return math.atan(a, 1)\nend\nlocal function outer(a)\n  return inner(a)\nend\nwa.on.draw(function()\n  outer(1)\nend)";
        assert!(rules(src).is_empty(), "got {:?}", rules(src));
    }

    /// ...and it crosses an `if`/`for` boundary inside the callback.
    #[test]
    fn render_context_closes_through_a_loop() {
        let src = "local function helper(a)\n  return math.cos(a)\nend\nwa.on.draw(function()\n  for i = 1, 3 do\n    if i > 1 then helper(i) end\n  end\nend)";
        assert!(rules(src).is_empty(), "got {:?}", rules(src));
    }

    /// THE NEGATIVE HALF, and it matters more than the positives.
    ///
    /// Following helpers must not swallow helpers that live OUTSIDE render reach. If
    /// `helper` is only ever called from `wa.on.contact`, its trig is simulation and must
    /// still be an error -- otherwise the closure is a hole, not a rule.
    #[test]
    fn a_helper_only_called_from_simulation_is_still_an_error() {
        let src = "local function helper(a)\n  return math.cos(a)\nend\nwa.on.contact(function()\n  helper(1)\nend)";
        assert_eq!(rules(src), vec!["lockstep-rng"]);
    }

    /// A helper called from BOTH is rendering. This is the engine's behaviour too
    /// (`reachable(render_roots)` is computed before simulation), and we match it
    /// rather than being stricter in one direction only -- see RenderScan's note.
    #[test]
    fn a_helper_called_from_draw_and_simulation_is_render_context() {
        let src = "local function helper(a)\n  return math.cos(a)\nend\nwa.on.contact(function()\n  helper(1)\nend)\nwa.on.draw(function()\n  helper(1)\nend)";
        assert!(rules(src).is_empty(), "got {:?}", rules(src));
    }

    /// A name used ONLY by a nested function inside the draw body does not drag that
    /// nested function in by accident -- and the nested one is still render anyway
    /// because the body encloses it. This pins the subtraction in `direct_refs`:
    /// without it the reference set would be the union of every nested scope.
    #[test]
    fn a_nested_function_inside_a_draw_body_is_render_context() {
        let src = "wa.on.draw(function()\n  local function helper(a)\n    return math.sin(a)\n  end\n  helper(1)\nend)";
        assert!(rules(src).is_empty(), "got {:?}", rules(src));
    }

    /// `math.random` is never muted, even in the deepest render helper. The mute is
    /// specifically about trig whose result reaches drawing; a draw callback can still
    /// advance gameplay state, and the engine nils `math.random` in EVERY scope.
    #[test]
    fn math_random_in_a_render_helper_is_still_an_error() {
        let src = "local function helper()\n  return math.random(1, 6)\nend\nwa.on.draw(function()\n  helper()\nend)";
        assert_eq!(rules(src), vec!["lockstep-rng"]);
    }

    /// The render closure at scale.
    ///
    /// This is a CORRECTNESS test, not a timing one -- timing assertions flake on a
    /// loaded machine, and a guard that fails for the wrong reason gets deleted. What
    /// it pins is that thousands of helpers reached from one draw callback are ALL
    /// treated as render context, which is the shape that made the token walk
    /// quadratic (see the `.rev()` note in `RenderScan::visit_function_body`).
    ///
    /// Written with table methods rather than locals because Lua caps a function at
    /// 200 locals -- the first version of this test was itself rejected by the Lua
    /// compiler before a single check ran.
    #[test]
    fn the_render_closure_holds_for_thousands_of_helpers() {
        const N: usize = 3_000;
        let mut src = String::from("local M = {}\n");
        for i in 0..N {
            src.push_str(&format!("function M.h{i}(x) return math.cos(x) + {i} end\n"));
        }
        src.push_str("wa.on.draw(function() ");
        for i in 0..N {
            src.push_str(&format!("M.h{i}(1) "));
        }
        src.push_str("end)\n");
        assert!(
            rules(&src).is_empty(),
            "{} helpers reached from one draw callback should all be render context",
            N
        );
    }

    // ---- receiver resolution: `for _, v in <wa.X.all()>` beats the name --------
    //
    // `wa.missiles.all()` yields WorldHandle userdata, NOT the MissileEntity table:
    // `spawn.rs` binds it via `bind_kind_list` -> `objects_table` ->
    // `WorldHandle::new(id)`, and WorldHandle HAS `impulse` (`actor.rs`
    // `add_methods`). MissileEntity is the plain table `wa.on.missile_frame` hands a
    // callback -- properties, no methods. A receiver NAMED `missile` says nothing
    // about which one it is, which is why `px/weapons/electromagnet.lua:93` used to
    // draw a false `missile-api` in both engines.

    #[test]
    fn a_missiles_all_loop_value_is_a_world_handle() {
        let src = "for _, missile in ipairs(wa.missiles.all()) do missile:impulse(1, 2) end";
        assert!(rules(src).is_empty(), "got {:?}", rules(src));
    }

    /// The bare iterator, not wrapped in ipairs/pairs.
    #[test]
    fn a_bare_iterator_loop_value_is_a_world_handle() {
        let src = "for _, m in wa.missiles.all() do m:remove() end";
        assert!(rules(src).is_empty(), "got {:?}", rules(src));
    }

    /// The trace must not paper over a real typo, and it must not change the rule
    /// id: a misspelled WorldHandle method is `world-object-api`, not `missile-api`.
    #[test]
    fn a_misspelled_method_in_the_loop_keeps_its_rule_id() {
        let src = "for _, missile in ipairs(wa.missiles.all()) do missile:impulses(1, 2) end";
        assert_eq!(rules(src), vec!["world-object-api"]);
    }

    /// The other value entirely. The trace must not reach a `missile_frame` table.
    #[test]
    fn a_missile_frame_table_is_still_a_missile_entity() {
        let src = "wa.on.missile_frame(function(missile)\n  missile:impulses(1, 2)\nend)";
        assert_eq!(rules(src), vec!["missile-api"]);
    }

    /// THE LEAK THIS WAS MEASURED AGAINST, and the reason the trace is scoped.
    ///
    /// `mods/tools/audit/audit.lua` loops `for _, w in ipairs(wa.worms.all())` at
    /// lines 107/112 AND passes `w` as a callback parameter holding the harness's own
    /// mock worm at line 265 (`w:input{...}`). A file-global `name -> class` map
    /// claims that mock, `w` stops resolving by name -- `w` is not a confident
    /// registry prefix, only `worm` is -- and 46 false `worm-api` warnings appear.
    #[test]
    fn the_loop_binding_does_not_leak_past_the_loop_body() {
        let src = "for _, w in ipairs(wa.worms.all()) do\n  w:hurt(10)\nend\nlocal function setup(w)\n  w:input({ aim = 45 })\nend";
        assert!(rules(src).is_empty(), "got {:?}", rules(src));
    }

    /// Innermost wins, so this is a worm and `hurt` is a worm method.
    #[test]
    fn a_nested_loop_over_the_same_name_answers_for_the_inner_one() {
        let src = "for _, v in ipairs(wa.missiles.all()) do\n  for _, v in ipairs(wa.worms.all()) do\n    v:hurt(10)\n  end\nend";
        assert!(rules(src).is_empty(), "got {:?}", rules(src));
    }

    /// An iterator that is merely a variable is DECLINED, not guessed: we cannot see
    /// where `t` came from, so `m` falls back to the name table and warns. Silence
    /// would have been the wrong answer here -- a bare name really can be a missile.
    #[test]
    fn an_iterator_that_is_only_a_variable_is_declined() {
        let src = "local t = wa.missiles.all()\nfor _, m in ipairs(t) do m:impulse(1, 2) end";
        assert_eq!(rules(src), vec!["missile-api"]);
    }

    // ---- API 4 surface: exact snippets from SemanticChecksLua/semantic_all_rules.lua --
    //
    // Failsafe: these mirror the regression fixtures added to
    // SemanticChecksLua/semantic_all_rules.lua. If that file is edited, these tests keep
    // the should-give / shouldnt-give findings pinned.

    /// API 4 panel functions are real -- no wa-namespace-typo.
    #[test]
    fn api4_panel_functions_are_silent() {
        let src = "local function api4_panel_functions()\n  local layout = wa.panel.layout()\n  wa.panel.set_layout({ [\"px.ninja_star\"] = { row = \"F1\", column = 1 } })\nend";
        assert!(rules(src).is_empty(), "got {:?}", rules(src));
    }

    /// API 4 wa.weapons.data is real -- no wa-namespace-typo.
    #[test]
    fn api4_weapons_data_is_silent() {
        assert!(rules("local data = wa.weapons.data(\"stock.bazooka\")").is_empty());
    }

    /// API 4 wa.world.set_turn_clock is real -- no wa-namespace-typo.
    #[test]
    fn api4_world_set_turn_clock_is_silent() {
        assert!(rules("wa.world.set_turn_clock(1000)").is_empty());
    }

    /// API 4 wa.assets.load is real -- no wa-namespace-typo.
    #[test]
    fn api4_assets_load_is_silent() {
        assert!(rules(r#"wa.assets.load({ sprites = { "sprites/star.png" }, gpu_prefix = "sprites/" })"#).is_empty());
    }

    /// math.sin inside wa.on.draw is presentation-only -- silent.
    #[test]
    fn api4_math_sin_in_draw_is_silent() {
        let src = "wa.on.draw(function()\n  local x = math.sin(1)\nend)";
        assert!(rules(src).is_empty(), "got {:?}", rules(src));
    }

    /// math.atan inside wa.on.draw is presentation-only -- silent.
    #[test]
    fn api4_math_atan_in_draw_is_silent() {
        let src = "wa.on.draw(function()\n  local a = math.atan(1, 2)\nend)";
        assert!(rules(src).is_empty(), "got {:?}", rules(src));
    }

    /// math.cos outside render context is a desync error.
    #[test]
    fn api4_math_cos_outside_draw_is_error() {
        assert_eq!(rules("local x = math.cos(1)"), vec!["lockstep-rng"]);
    }

    /// wa.audit only exists in diagnostics builds, so it still typos on release.
    #[test]
    fn api4_audit_typos_on_release() {
        assert_eq!(rules("wa.audit.begin(7)"), vec!["wa-namespace-typo"]);
    }

    /// Whole-fixture failsafe: semantic_all_rules.lua must not flag real API 4 functions,
    /// must keep render-context scoping for math, and must keep wa.audit as a typo.
    #[test]
    fn semantic_all_rules_api4_surface_is_known() {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../SemanticChecksLua/semantic_all_rules.lua"
        );
        let src = std::fs::read_to_string(path).expect("read semantic_all_rules.lua");
        let ast = full_moon::parse(&src).expect("semantic_all_rules.lua must parse");
        let diags = run(&ast);

        // Real API 4 functions must not be reported as wa-namespace-typo.
        let typos: Vec<&str> = diags
            .iter()
            .filter(|d| d.rule == "wa-namespace-typo")
            .map(|d| d.message.as_str())
            .collect();
        for good in ["wa.panel.layout", "wa.panel.set_layout", "wa.weapons.data",
                     "wa.world.set_turn_clock", "wa.assets.load"] {
            assert!(
                !typos.iter().any(|m| m.contains(good)),
                "API 4 function {good} must not typo; typos were: {typos:?}",
            );
        }

        // wa.audit only exists in diagnostics builds, so it stays a typo on release.
        assert!(
            typos.iter().any(|m| m.contains("wa.audit")),
            "wa.audit must still typo on the release surface; typos were: {typos:?}",
        );

        // lockstep-rng fires for math.random (line 151) and math.cos outside render
        // (line 439), but NOT for math.sin/atan inside wa.on.draw.
        let rng: Vec<&AstDiagnostic> = diags.iter().filter(|d| d.rule == "lockstep-rng").collect();
        assert_eq!(
            rng.len(),
            2,
            "expected exactly 2 lockstep-rng errors (math.random + math.cos outside draw), got {rng:?}",
        );
    }

    #[test]
    fn lockstep_advice_names_only_real_apis() {
        // REGRESSION. The message said "Use wa.rng.random()", which is NOT in
        // WA_FUNCTIONS -- the real one is `wa.random(min, max)`, and that is what
        // parser.ts has always said. A fix that points at a function which does not
        // exist is worse than no fix: the user follows it and meets a second error.
        //
        // Nothing caught it. The sweep diffs rule IDS, never wording; and
        // mergeDiagnostics gives TS priority on a collision, so the app displayed the
        // GOOD text the whole time. It would only ever have surfaced on the day
        // parser.ts is deleted -- the worst possible time to discover it.
        //
        // Deliberately not a string comparison: this asserts the invariant "every
        // `wa.*` path the advice names exists in the generated API list", so the next
        // person to reword the message cannot reintroduce the bug, and the next
        // message that offers a replacement gets the same guard for free.
        let m = messages("local x = math.random()", "lockstep-rng");
        assert_eq!(m.len(), 1);
        let named: Vec<&str> = m[0]
            .split(|c: char| !(c.is_alphanumeric() || c == '_' || c == '.'))
            .filter(|t| t.starts_with("wa."))
            .collect();
        assert!(
            !named.is_empty(),
            "the message should name at least one replacement API, got: {}",
            m[0]
        );
        for path in named {
            assert!(
                engine_data::WA_FUNCTIONS.contains(&path),
                "the lockstep-rng message tells the user to use `{path}`, which is not in \
                 WA_FUNCTIONS. Advice must point at a function that exists."
            );
        }
    }

    #[test]
    fn pairs_is_flagged() {
        assert_eq!(rules("for k in pairs(t) do end"), vec!["lockstep-pairs"]);
    }

    #[test]
    fn ipairs_is_fine() {
        assert!(rules("for k in ipairs(t) do end").is_empty());
    }

    // ---- the capability-check guard --------------------------------------
    //
    // These are the cases the TypeScript version got wrong. They are the reason this
    // check exists, so they get the most tests.

    #[test]
    fn and_probe_then_call_is_silent() {
        assert!(rules("local o = wa.worms.active and wa.worms.active()").is_empty());
    }

    #[test]
    fn or_probe_then_call_is_silent() {
        assert!(rules("local o = wa.foo.bar or fallback").is_empty());
    }

    #[test]
    fn if_guard_is_silent() {
        // Both halves: the probe is guarded by `if`, the call by `then`.
        assert!(rules("if wa.some_new_api then wa.some_new_api() end").is_empty());
    }

    #[test]
    fn the_real_bee_lua_line_is_silent() {
        // Taken verbatim from mods/examples/bee.lua:457, which is real working code.
        let src = "local owner = opts.owner or (wa.worms.active and wa.worms.active()) \
                   or (wa.worms.all and wa.worms.all()[1])";
        assert!(rules(src).is_empty(), "got {:?}", rules(src));
    }

    /// Regression pin for a walker that silently collected nothing.
    ///
    /// `collect_wa_in_block` called `finder.visit_block(block)`, which is the `Visitor`
    /// TRAIT's empty default hook, not the recursive `Visit::visit`. It type-checked and
    /// returned an empty set, so every `if` body went unguarded. `if_guard_is_silent`
    /// did not catch it because the two-segment call it guards was never queued in the
    /// first place -- two bugs hiding each other. Lowering the segment guard exposed it.
    #[test]
    fn an_if_body_is_guarded() {
        // Three segments, so it is queued regardless of the segment guard, and it sits
        // in the BODY. If the block walker is dead this fires and the test fails.
        assert!(
            rules("if wa.weapons then wa.weapons.repalce({}) end").is_empty(),
            "an `if` body must inherit the condition's guard"
        );
    }

    #[test]
    fn nested_guard_is_silent() {
        assert!(rules("if wa.x and wa.y then wa.z() end").is_empty());
    }

    // ---- genuine typos MUST still fire -----------------------------------

    #[test]
    fn misspelled_verb_is_caught() {
        assert_eq!(rules("wa.weapons.repalce({})"), vec!["wa-namespace-typo"]);
    }

    // ---- two-segment calls: the `>= 3` guard that was hiding them -----------

    #[test]
    fn a_two_segment_typo_is_caught() {
        // `wa.randomm(1, 10)` has only two segments. The push guard said three, so this
        // was silently accepted and the user got a runtime "attempt to call a nil value"
        // instead of a typo warning. Probed against parser.ts: TS flags it, Rust did not.
        assert_eq!(rules("wa.randomm(1, 10)"), vec!["wa-namespace-typo"]);
    }

    #[test]
    fn the_real_two_segment_api_is_still_silent() {
        // The exact-match arm has to keep accepting this, or lowering the guard would
        // trade a false negative for a false positive on every real two-segment call.
        // `wa.random` is the function the lockstep-rng advice itself tells users to call,
        // so a warning here would contradict the product's own instruction.
        assert!(rules("wa.random(1, 10)").is_empty());
    }

    // ---- indexed paths: judged via the call nested inside the Var ------------

    #[test]
    fn an_indexed_wa_path_is_caught() {
        // The whole expression is a `Var`, so it never reaches `visit_function_call`.
        // The `wa.game_state(1)` call inside it does, and that is what gets judged.
        // `wa.game_state` is not in WA_FUNCTIONS -- see the §18 note: TS flags every
        // use of it, and that is correct, because the API does not exist.
        let found = rules("local t = wa.game_state(1).states.AIR_TIME");
        assert!(
            found.iter().any(|r| r == "wa-namespace-typo"),
            "indexed wa path must be flagged, got {:?}",
            found
        );
    }

    #[test]
    fn an_indexed_path_names_the_namespace_not_the_fields_after_the_call() {
        // The message must name `wa.game_state`, NOT `wa.game_state.states`. Everything
        // after a call is field access on the RESULT, so suggesting a "did you mean" for
        // it is meaningless -- `wa.game_state.states` is not a call anyone could write.
        // parser.ts stops its scan at the call and gets this right by construction.
        let m = messages(
            "local t = wa.game_state(1).states.AIR_TIME",
            "wa-namespace-typo",
        );
        assert_eq!(m.len(), 1, "expected exactly one finding, got {:?}", m);
        assert!(
            m[0].contains("wa.game_state ") || m[0].contains("`wa.game_state`"),
            "message must name wa.game_state, got {}",
            m[0]
        );
        assert!(
            !m[0].contains("wa.game_state.states"),
            "message must not name post-call fields, got {}",
            m[0]
        );
    }

    #[test]
    fn an_indexed_wa_path_after_a_call_is_caught() {
        // Same mechanism one call deeper: `wa.zzz.yyy()` is the inner call, `.x` is a
        // plain index on its result.
        let found = rules("local t = wa.zzz.yyy().x");
        assert!(
            found.iter().any(|r| r == "wa-namespace-typo"),
            "chained indexed wa path must be flagged, got {:?}",
            found
        );
    }

    #[test]
    fn a_pure_indexed_path_with_no_call_is_silent() {
        // The one deliberate limit, and it is inherited from parser.ts, not invented:
        // with no call anywhere in the expression there is nothing to anchor the check
        // on, and TS is silent here too. Verified by probe on both sides.
        assert!(rules("local t = wa.zzz.yyy").is_empty());
    }

    // ---- receiver / handle methods ---------------------------------------

    #[test]
    fn known_handle_method_is_silent() {
        assert!(rules("worm:hurt(10)").is_empty());
    }

    #[test]
    fn misspelled_handle_method_is_caught() {
        // The rule id is the REGISTRY's (`worm-api`), matching parser.ts, so the
        // (line, rule) dedup in mergeDiagnostics can see the two implementations agree.
        assert_eq!(rules("worm:hurtt(10)"), vec!["worm-api"]);
    }

    // ---- custom verbs (custom_verbs.cfg overlay) ---------------------------

    /// Like `rules()`, but through the overlay path -- the pairs a user's
    /// custom_verbs.cfg would send over IPC.
    fn rules_with(
        src: &str,
        custom: &[(&str, &str)],
    ) -> Vec<String> {
        let ast = full_moon::parse(src).expect("test input must parse");
        let pairs: Vec<(String, String)> = custom
            .iter()
            .map(|(c, m)| (c.to_string(), m.to_string()))
            .collect();
        run_with_custom(&ast, pairs)
            .into_iter()
            .map(|d| d.rule)
            .collect()
    }

    #[test]
    fn an_empty_overlay_is_exactly_run() {
        // The compatibility contract: `run()` IS `run_with_custom(vec![])`, so
        // old callers and the sweep see byte-identical output through either path.
        let src = "function M.onTick()\n  worm:hurtt(10)\nend";
        assert_eq!(rules(src), rules_with(src, &[]));
    }

    #[test]
    fn a_user_verb_silences_the_unknown_method_check() {
        // The dropped-verb bug's checker half: `WormEntity:grapple` registered in
        // custom_verbs.cfg must not be reported as unknown, and without the
        // overlay it must be -- same source, opposite verdict.
        let src = "function M.onTick()\n  worm:grapple(10)\nend";
        assert_eq!(rules(src), vec!["worm-api"]);
        assert!(rules_with(src, &[("WormEntity", "grapple")]).is_empty());
    }

    #[test]
    fn an_overlay_on_one_class_does_not_free_another() {
        // Membership is (class, member), not member alone: registering
        // `OtherClass:grapple` must not silence `worm:grapple`.
        let src = "function M.onTick()\n  worm:grapple(10)\nend";
        assert_eq!(
            rules_with(src, &[("OtherClass", "grapple")]),
            vec!["worm-api"]
        );
    }

    #[test]
    fn a_custom_owner_joins_the_union_notice() {
        // The `.kind`-union owner list merges engine + custom owners, so the
        // notice reads `WormEntity and GhostProxy` -- the same "and" phrasing
        // the engine-only case uses, just with one more name in it. `hurt` is
        // owned by WormEntity alone in the generated tables, so the custom row
        // is demonstrably what appends GhostProxy.
        let src = "if obj.kind == \"worm\" then\n  obj:hurt(10)\nend";
        let msgs = {
            let ast = full_moon::parse(src).expect("test input must parse");
            run_with_custom(&ast, vec![("GhostProxy".into(), "hurt".into())])
                .into_iter()
                .filter(|d| d.rule == "handle-union")
                .map(|d| d.message)
                .collect::<Vec<_>>()
        };
        assert_eq!(msgs.len(), 1, "expected one union notice, got {msgs:?}");
        assert!(
            msgs[0].contains("WormEntity and GhostProxy"),
            "custom owner missing from notice: {}",
            msgs[0]
        );
    }

    // ---- indentation -------------------------------------------------------
    //
    // A token carries its LEADING trivia, so the first name on an indented line arrives
    // as "    wa" / "  worm". Before `name_text` trimmed it, every check that compares
    // `segs[0]` or looks a receiver up by name went silently dead on any statement that
    // BEGAN with the receiver -- which is nearly all real mod code. The snippets above
    // never caught it because they all sit at column 0.

    #[test]
    fn a_trailing_comment_does_not_corrupt_a_set_state_name() {
        // REGRESSION, and now on the rule that actually matters. `name_of` replaced a
        // `.trim()`-based helper because a trailing `-- comment` is trivia and therefore
        // SURVIVES `.trim()`. The old code read `hurtt -- typo` as the method name; the
        // same trap on a set_state name would read `"sliding" -- release the worm` and
        // report a perfectly VALID state as wrong -- the worst direction for a checker.
        assert!(rules("function M.onTick()\n  worm:set_state(\"sliding\") -- release\nend").is_empty());
    }

    #[test]
    fn a_trailing_comment_does_not_corrupt_a_method_name() {
        // The same trap on the receiver/method path: `hurtt -- typo` must not be read as
        // a method called "hurtt -- typo", or the misspelling check dies on commented
        // code -- and commented code is most of a real pack.
        assert_eq!(
            rules("function M.onTick()\n  worm:hurtt(10) -- typo\nend"),
            vec!["worm-api"]
        );
    }

    #[test]
    fn a_valid_method_followed_by_a_comment_is_silent() {
        assert!(rules("function M.onTick()\n  worm:hurt(10) -- damage\nend").is_empty());
    }

    #[test]
    fn an_indented_wa_typo_is_caught() {
        assert_eq!(
            rules("function M.onTick()\n  wa.weapons.repalce({})\nend"),
            vec!["wa-namespace-typo"]
        );
    }

    #[test]
    fn indented_handle_method_is_caught() {
        assert_eq!(
            rules("function M.onTick()\n  worm:hurtt(10)\nend"),
            vec!["worm-api"]
        );
    }

    #[test]
    fn indented_bad_set_state_is_caught() {
        assert_eq!(
            rules("function M.onTick()\n  worm:set_state(\"slidng\")\nend"),
            vec!["worm-state-typo"]
        );
    }

    #[test]
    fn indented_valid_code_stays_silent() {
        // The other half of the guard: the trivia handling must not turn valid indented
        // code into a finding.
        assert!(rules(
            "function M.onTick()\n  worm:hurt(10)\n  worm:set_state(\"bungee\")\nend"
        )
        .is_empty());
    }

    #[test]
    fn a_space_before_the_call_paren_is_tolerated() {
        // `wa.weapons.replace ({})` is legal Lua; the dot name carries the space as
        // trailing trivia. Trimming both ends keeps it from reading as an unknown API.
        assert!(rules("wa.weapons.replace ({})").is_empty());
    }

    #[test]
    fn a_space_before_the_call_paren_still_catches_a_typo() {
        assert_eq!(rules("wa.weapons.repalce ({})"), vec!["wa-namespace-typo"]);
    }

    #[test]
    fn a_users_own_table_is_never_flagged() {
        // `cfg` is not a registered receiver, so `cfg:whatever()` is entirely the
        // user's business. Flagging this is the most damaging false positive
        // available: it would fire on every custom table in every pack.
        assert!(rules("cfg:whatever()").is_empty());
    }

    // ---- handle-union (the B2 port) --------------------------------------------
    //
    // EVERY expectation in this section was MEASURED against the TypeScript baseline
    // (`parseAndValidate` run directly), not inferred from reading parser.ts: the
    // sweep compares rule-id SETS only, so columns, severities and aggregation can
    // only be pinned by tests like these.

    /// Parse `src`, run the checker, and return the single finding's identity.
    fn only_finding(src: &str) -> (String, String, usize, usize) {
        let ast = full_moon::parse(src).expect("test input must parse");
        let ds = run(&ast);
        assert_eq!(ds.len(), 1, "expected exactly one finding in {src:?}, got {ds:?}");
        (ds[0].rule.clone(), ds[0].severity.clone(), ds[0].line, ds[0].column)
    }

    #[test]
    fn a_kind_narrowed_union_receiver_gets_one_info_notice() {
        // The port of `handle-union`. `obj` resolves to WorldHandle, `hurt` is a
        // WormEntity method, and a `.kind` test ducks the receiver: this is CORRECT
        // code, so the finding is an info notice at (first line, column 1) -- measured
        // as exactly that on the TS baseline. The pre-port version of this test
        // asserted SILENCE; that silence was UNCHECKED_CLASSES declining the class
        // wholesale, which also hid every world-object-api warning TS raises.
        assert_eq!(
            only_finding("if obj.kind == 'worm' then\n  obj:hurt(10)\nend"),
            ("handle-union".to_string(), "info".to_string(), 2, 1)
        );
    }

    #[test]
    fn union_notices_aggregate_into_one_finding_at_the_first_line() {
        // Two call sites, one notice -- the aggregation parser.ts `unionPasses`
        // performs -- reported at the FIRST site (measured line 2, column 1) with both
        // lines listed in the message.
        let src = "if obj.kind == \"worm\" then\n  obj:hurt(10)\nend\nfunction f()\n  obj:hurt(20)\nend";
        assert_eq!(
            only_finding(src),
            ("handle-union".to_string(), "info".to_string(), 2, 1)
        );
        let m = messages(src, "handle-union");
        assert_eq!(m.len(), 1);
        assert!(
            m[0].starts_with("Passed - lines 2 and 5 call `obj:hurt()`"),
            "got {}",
            m[0]
        );
    }

    #[test]
    fn the_kind_test_may_appear_after_the_call_it_ducks() {
        // parser.ts pre-scans tokens BEFORE its walk; `KindScan` mirrors that as a
        // pre-pass. Collecting during the main walk would make a call on line 1 wait
        // for a test on line 2 -- visit order, not file semantics. Measured: line 1,
        // column 1.
        assert_eq!(
            only_finding("local a = obj:hurt(10)\nif obj.kind == \"worm\" then end"),
            ("handle-union".to_string(), "info".to_string(), 1, 1)
        );
    }

    #[test]
    fn tilde_equals_narrows_just_like_double_equals() {
        assert_eq!(
            only_finding("if obj.kind ~= \"worm\" then\n  obj:hurt(10)\nend"),
            ("handle-union".to_string(), "info".to_string(), 2, 1)
        );
    }

    #[test]
    fn the_segment_immediately_before_kind_is_what_ducks() {
        // Measured: `base.obj.kind == "worm"` ducks `obj` -- the token immediately
        // before `.kind`, not `base` -- which is parser.ts's window pattern exactly.
        assert_eq!(
            only_finding("if base.obj.kind == \"worm\" then\n  obj:hurt(10)\nend"),
            ("handle-union".to_string(), "info".to_string(), 2, 1)
        );
    }

    #[test]
    fn ducking_one_receiver_leaves_the_others_fully_checked() {
        // The duck set is keyed by NAME: `obj` being narrowed says nothing about
        // `worm`, whose typo must still warn (measured as worm-api on the baseline).
        assert_eq!(
            rules("if obj.kind == \"worm\" then\nend\nworm:hurtt(1)"),
            vec!["worm-api"]
        );
    }

    #[test]
    fn a_union_receiver_without_a_kind_test_is_warned() {
        // Measured: the TS baseline raises world-object-api at line 1 column 5 for
        // this exact input. Rust used to stay silent here -- UNCHECKED_CLASSES -- which
        // was a genuine TS-only gap, not a safety feature.
        let ast = full_moon::parse("obj:hurtt(10)").expect("test input must parse");
        let ds = run(&ast);
        assert_eq!(ds.len(), 1, "got {ds:?}");
        assert_eq!(ds[0].rule, "world-object-api");
        assert_eq!(ds[0].severity, "warning");
        assert_eq!((ds[0].line, ds[0].column), (1, 5), "TS measures column 5");
    }

    #[test]
    fn a_ducked_receiver_with_no_owner_class_is_still_warned() {
        // Duck-typing buys "some handle has it", not immunity: no class owns
        // `hurrty`, so the warning stands (measured on the baseline).
        let ast =
            full_moon::parse("if obj.kind == \"worm\" then obj:hurrty(1) end").expect("must parse");
        let ds = run(&ast);
        assert_eq!(ds.len(), 1, "got {ds:?}");
        assert_eq!(ds[0].rule, "world-object-api");
        assert_eq!(ds[0].severity, "warning");
    }

    #[test]
    fn a_method_owned_by_a_different_handle_class_passes_the_union_check() {
        // `frame` is a LuaActor method; `obj` alone suggests WorldHandle. Accepting it
        // is the entire point of consulting ALL handle classes (measured notice).
        assert_eq!(
            only_finding("if obj.kind == \"x\" then\n  obj:frame(1)\nend"),
            ("handle-union".to_string(), "info".to_string(), 2, 1)
        );
    }

    #[test]
    fn a_property_owner_counts_like_any_other_owner() {
        // Measured: `phase` is a MissileEntity PROPERTY, and the baseline emits an info
        // notice for the ducked call. A methods-only owner table would find NO owner
        // and emit `world-object-api` instead -- a different rule id, which the sweep
        // counts as drift in both directions (missing handle-union, extra
        // world-object-api).
        assert_eq!(
            only_finding("if obj.kind == \"x\" then\n  obj:phase(1)\nend"),
            ("handle-union".to_string(), "info".to_string(), 2, 1)
        );
    }

    #[test]
    fn a_property_call_on_the_assumed_handle_is_silent() {
        // Measured: `m:id()` is silent on the baseline even though MissileEntity has an
        // EMPTY methods list -- `id` is its property, and parser.ts's membership test
        // does not filter by kind. A methods-only `hasIt` would warn missile-api here.
        assert!(rules("m:id()").is_empty());
    }

    #[test]
    fn an_indented_union_receiver_is_still_noticed() {
        // The leading-trivia trap: the `.kind` test and the call are the first tokens
        // on their lines, so every name read goes through `name_of`. Column 1 is the
        // notice position, NOT the indentation. Measured: line 3, column 1.
        assert_eq!(
            only_finding(
                "function M.onTick()\n  if obj.kind == \"worm\" then\n    obj:hurt(10)\n  end\nend"
            ),
            ("handle-union".to_string(), "info".to_string(), 3, 1)
        );
    }

    #[test]
    fn the_notice_wording_matches_the_typescript_baseline() {
        // mergeDiagnostics keeps the TS wording on (line, column, rule) collisions, so
        // this text only shows when Rust runs alone -- the day parser.ts is deleted a
        // Rust-only run must say exactly what the reviewed baseline said.
        let m = messages("if obj.kind == 'worm' then obj:hurt(10) end", "handle-union");
        assert_eq!(m.len(), 1);
        assert!(
            m[0].starts_with(
                "Passed - lines 1 call `obj:hurt()`, which WormEntity has but \
                 WorldHandle does not."
            ),
            "got {}",
            m[0]
        );
        // The half that used to make this row unreadable now lives in `detail`.
        // Pinned so a future edit cannot quietly move the reasoning back into
        // `message`, which is the thing §23 exists to prevent.
        let d = details("if obj.kind == 'worm' then obj:hurt(10) end", "handle-union");
        assert_eq!(d.len(), 1);
        assert!(
            d[0].contains("narrowed by a `.kind` test") && d[0].contains("WorldHandle"),
            "got {}",
            d[0]
        );
        // The reasoning half used to be the tail of `message`; it is now the
        // whole of `detail`, asserted above.
    }

    #[test]
    fn a_misspelled_handle_method_lands_on_the_method_name_not_the_colon() {
        // The same off-by-one as above, on the COMMON path: TS measured column 6 for
        // `worm:hurtt(1)` (the `h`), while the MethodCall node starts at its
        // `colon_token` in column 5. Emitting at the node position made every
        // `worm-api` warning miss the dedup key and desktop mode list it twice -- the
        // duplicate failure no gate can see.
        let ast = full_moon::parse("worm:hurtt(1)").expect("test input must parse");
        let ds = run(&ast);
        assert_eq!(ds.len(), 1, "got {ds:?}");
        assert_eq!(ds[0].rule, "worm-api");
        assert_eq!((ds[0].line, ds[0].column), (1, 6), "TS measures column 6");
    }

    #[test]
    fn a_bracketed_receiver_is_not_a_registered_receiver() {
        // REGRESSION, found by the sweep on the corpus: `prefix_name(call.prefix())`
        // took the FIRST segment of the path, so `M.sounds[1]:find("inflate")` in
        // highlander_code/test_rules.lua was read as a call on receiver `m` -- NINE
        // false `missile-api` warnings where the real receiver is a STRING
        // (string.find). The token before the colon is `]`, so parser.ts declines;
        // so must we. `UNCHECKED_CLASSES` used to mask exactly this for `m`.
        assert!(rules("local s = M.sounds[1]:find(\"inflate\")").is_empty());
        // A dot-name before the colon IS what parser.ts checks (`sounds` is not a
        // registered name -> silent), and a parenthesized prefix has `)` before the
        // colon -> silent. All three measured silent on the TS baseline.
        assert!(rules("M.sounds:find(\"x\")").is_empty());
        assert!(rules("(a or b):hurt(1)").is_empty());
    }

    #[test]
    fn the_receiver_before_the_colon_can_be_a_dot_name() {
        // The other half of the same rule, measured: for `f().worm:hurtt()` parser.ts
        // reads `worm` -- the token immediately before the colon -- and WARNS at
        // column 10, the method's first letter. Declining every receiver that is not
        // the call prefix would go silent here and lose a real typo.
        let ast = full_moon::parse("f().worm:hurtt()").expect("test input must parse");
        let ds = run(&ast);
        assert_eq!(ds.len(), 1, "got {ds:?}");
        assert_eq!(ds[0].rule, "worm-api");
        assert_eq!((ds[0].line, ds[0].column), (1, 10), "TS measures column 10");
    }

    #[test]
    fn a_missile_typo_still_warns_missile_api() {
        // The union path must not swallow genuine typos on the empty-methods class:
        // MissileEntity was the class UNCHECKED_CLASSES was pinned to, and `m:foo()`
        // has no owner anywhere (measured as missile-api on the baseline).
        assert_eq!(rules("m:foo()"), vec!["missile-api"]);
    }

    #[test]
    fn dot_call_on_a_handle_is_not_a_method_call() {
        assert!(rules("worm.hurt(10)").is_empty());
    }

    // ---- diagnostics are ordered ------------------------------------------

    #[test]
    fn misspelled_namespace_suggests_the_right_one() {
        let m = messages("wa.weapoons.replace({})", "wa-namespace-typo");
        assert_eq!(m.len(), 1);
        assert!(m[0].contains("wa.weapons"), "got {}", m[0]);
    }

    #[test]
    fn a_misspelled_function_suggests_the_function_not_its_namespace() {
        // 0.9.11's fog of war brought `wa.fog.*`. Before `suggest_function`, the
        // namespace table answered "Did you mean wa.fog?" -- a table nobody can
        // call, which is worse than saying nothing.
        let m = messages("wa.fog.visble(1, 2)", "wa-namespace-typo");
        assert_eq!(m.len(), 1);
        assert!(m[0].contains("wa.fog.visible"), "got {}", m[0]);
    }

    #[test]
    fn a_transposed_function_name_is_close_enough_to_suggest() {
        // "repalce" is two edits from "replace"; a one-edit radius would miss the
        // most common typo of all.
        let m = messages("wa.weapons.repalce({})", "wa-namespace-typo");
        assert!(m[0].contains("wa.weapons.replace"), "got {}", m[0]);
    }

    #[test]
    fn a_parentheseless_call_is_caught() {
        // `worm:set_state "slidng"` -- Lua lets a single call argument drop its parens,
        // and this is the spelling an author naturally reaches for. It produced ZERO
        // findings before this session: `first_argument` returned `None` for
        // `FunctionArgs::String` and the whole form went unchecked.
        let found = rules("local function f(worm) worm:set_state \"slidng\" end");
        assert_eq!(
            found.iter().filter(|r| *r == "worm-state-typo").count(),
            1,
            "parentheseless typo must be caught exactly once, got {:?}",
            found
        );
    }

    #[test]
    fn a_parentheseless_real_state_is_caught_with_the_right_message() {
        // Same shape, different failure: `jetpacking` is a REAL state that simply cannot
        // be entered. The parentheseless path must produce the same two-way distinction as
        // the parenthesised one, not a generic "unknown state".
        let m = messages(
            "local function f(worm) worm:set_state \"jetpacking\" end",
            "worm-state-typo",
        );
        assert_eq!(m.len(), 1, "got {:?}", m);
        assert!(m[0].contains("real worm state"), "got {}", m[0]);
    }

    #[test]
    fn a_parentheseless_valid_state_is_silent() {
        // The other direction: covering the parentheseless form must not make it noisy.
        // If unquoting or anchoring were wrong, a VALID name would be flagged here.
        let found = rules("local function f(worm) worm:set_state \"sliding\" end");
        assert!(
            !found.iter().any(|r| r == "worm-state-typo"),
            "a valid parentheseless state must be silent, got {:?}",
            found
        );
    }

    #[test]
    fn both_spellings_anchor_on_the_same_column() {
        // The parenthesised and parentheseless spellings are the same call written two
        // ways, so they must produce the same finding in the same place. If the columns
        // differed, the (line, column, rule) dedup in `mergeDiagnostics` would treat them
        // as unrelated and list one twice in the UI.
        let with = run(&full_moon::parse("worm:set_state(\"slidng\")").unwrap());
        let without = run(&full_moon::parse("worm:set_state \"slidng\"").unwrap());
        assert_eq!(with.len(), 1, "got {:?}", with);
        assert_eq!(without.len(), 1, "got {:?}", without);
        assert_eq!(
            (with[0].line, with[0].column),
            (without[0].line, without[0].column),
            "the two spellings must anchor identically: {:?} vs {:?}",
            with[0],
            without[0]
        );
    }

    #[test]
    fn a_computed_argument_is_not_a_parse_error_we_must_handle() {
        // `worm:set_state name` is not valid Lua AT ALL. Lua's `args` production is
        // `(explist)` | tableconstructor | String -- so a parentheseless call can only
        // ever carry a string or a table. full_moon rejects it outright ("expected
        // arguments after `:`").
        //
        // That is worth pinning because it BOUNDS what `first_argument` has to handle: the
        // three `FunctionArgs` variants ARE the three legal argument shapes. There is no
        // fourth "computed, parentheseless" case quietly going unchecked.
        assert!(
            full_moon::parse("local function f(worm, name) worm:set_state name end").is_err(),
            "if this ever parses, `first_argument` needs a computed-argument arm"
        );
    }

    #[test]
    fn a_parentheseless_table_argument_is_not_judged() {
        // `worm:set_state { ... }` is the other `FunctionArgs` shape. It is not a state
        // name, and the engine will reject it -- but not with a name this check can name,
        // so declining is correct.
        let found = rules("local function f(worm) worm:set_state { 1 } end");
        assert!(
            !found.iter().any(|r| r == "worm-state-typo"),
            "a table argument is not a state name, got {:?}",
            found
        );
    }

    // ---- inventory-api / world-object-api / missile-api ------------------------
    //
    // These three registry rows had NO live fixture. Not "no test found" -- no test at
    // all, and nothing in the corpus trips them either, so a regression in any of the
    // three would have been invisible to every gate. Added here with member names read
    // out of `HANDLE_ALL_MEMBERS` rather than invented, after `wa.msg` taught us that a
    // plausible-looking "known API" is worth nothing unless it is checked.
    //
    // Expected behaviour below is MEASURED against parser.ts, not assumed. All three
    // TS messages were captured first; see the probe notes in each test.

    /// Baseline (TS): `inv:gett(1)` → one `inventory-api`, `inv:get(1)` silent.
    #[test]
    fn a_misspelled_inventory_method_is_caught() {
        assert_eq!(
            only_finding("local function f(inv)\n  inv:get(1)\n  inv:gett(1)\nend"),
            // Column 7 is the METHOD NAME, not the receiver. That is the §16 decision:
            // full_moon's MethodCall starts at its colon, parser.ts reports at the first
            // letter of the name, and the difference is one column on EVERY method
            // warning -- which used to defeat the (line, column, rule) dedup.
            ("inventory-api".into(), "warning".into(), 3, 7)
        );
    }

    /// The class name must appear in the message, so a user knows which handle to fix.
    #[test]
    fn the_inventory_message_names_the_class() {
        let m = messages("local function f(inv) inv:gett(1) end", "inventory-api");
        assert_eq!(m.len(), 1, "got {:?}", m);
        assert!(m[0].contains("InventoryStore"), "got {}", m[0]);
    }

    /// Baseline (TS): `mine:armm(10)` → one `world-object-api`, `mine:arm(10)` silent.
    ///
    /// This is the non-narrowed form: `mine` has no `.kind` test, so the receiver's class
    /// is ASSUMED WorldHandle and checked directly. `UNCHECKED_CLASSES` used to decline
    /// this class wholesale, which is why this assertion once held for the wrong reason.
    #[test]
    fn a_misspelled_world_handle_method_is_caught() {
        assert_eq!(
            only_finding("local function f(mine)\n  mine:arm(10)\n  mine:armm(10)\nend"),
            // Column 8 is the METHOD NAME. `  mine:` is 7 characters, so the first letter
            // of `armm` is column 8. Not hardcoded as a magic 7.
            ("world-object-api".into(), "warning".into(), 3, 8)
        );
    }
        /// Every WorldHandle alias must behave identically. `obj`/`object` were the ones that
    /// mattered -- they are the most common receiver names in the real packs.
    #[test]
    fn every_world_handle_alias_is_checked() {
        for alias in ["mine", "drum", "oil", "oildrum", "crate", "grave", "obj", "object"] {
            let src = format!("local function f()\n  {alias}:armm(10)\nend");
            let (rule, ..) = only_finding(&src);
            assert_eq!(rule, "world-object-api", "alias {alias} was not checked");
        }
    }

    /// Baseline (TS): `missile:hurtt()` → one `missile-api`.
    ///
    /// MissileEntity is the class that produced NINE false positives once, when
    /// `M.sounds[1]:find("inflate")` in `test_rules.lua` was read as a call on receiver
    /// `m`. The real receiver there is a string. So the negative half matters as much as
    /// the positive: `missile-api` must not fire on a bracketed receiver.
    #[test]
    fn a_misspelled_missile_method_is_caught() {
        let (rule, severity, line, col) = only_finding(
            "local function f(missile)\n  missile:collision_mask()\n  missile:hurtt()\nend",
        );
        assert_eq!(rule, "missile-api");
        assert_eq!(severity, "warning");
        // Column 11: `  missile:` is 10 characters.
        assert_eq!((line, col), (3, 11));
    }

    /// The regression that `UNCHECKED_CLASSES` was masking. A BRACKETED receiver is not
    /// the variable, so `missile-api` must stay silent -- the token before the colon is
    /// `]`, not an identifier. Nine sites in `test_rules.lua` depend on this.
    #[test]
    fn a_bracketed_receiver_is_never_a_handle() {
        let src = "local function f(M)\n  M.sounds[1]:find(\"inflate\")\nend";
        assert!(
            rules(src).is_empty(),
            "a bracketed receiver is a field read, not a handle; got {:?}",
            rules(src)
        );
    }

    /// PROPERTIES are members too. `HANDLE_ALL_MEMBERS` exists precisely because
    /// parser.ts tests `members.some(name)` with no kind filter, so `m:id()` and
    /// `m:phase()` are legal reads on a missile and must not be reported.
    #[test]
    fn missile_properties_are_members_not_methods() {
        let src = "local function f(m)\n  m:id()\n  m:phase()\nend";
        assert!(
            rules(src).is_empty(),
            "missile properties must be accepted, got {:?}",
            rules(src)
        );
    }

    /// `m` is a MissileEntity alias, but `m:id()` above is silent -- because properties
    /// are members. This pins that the alias itself IS checked, using a method-shaped name
    /// that genuinely does not exist, so the silence above cannot be an unchecked-alias
    /// bug in disguise.
    #[test]
    fn the_m_alias_is_checked_for_methods() {
        let (rule, ..) = only_finding("local function f(m)\n  m:hurtt()\nend");
        assert_eq!(rule, "missile-api");
    }

    /// A user's own table must never be judged against a registry row. This is the most
    /// damaging false positive available -- it would fire on every custom table in every
    /// pack, and it is the failure mode `cfg:whatever()` already guards.
    #[test]
    fn an_unrelated_receiver_is_never_judged() {
        for src in ["local t = {}\nt:gett(1)", "local s = 'x'\ns:gett(1)"] {
            assert!(
                rules(src).is_empty(),
                "an unregistered receiver must be left alone: {src:?} -> {:?}",
                rules(src)
            );
        }
    }

    /// All three registry rows resolve to a class that actually has an all-members entry.
    /// Without this, a typo in the receiver table would make a rule silently dead rather
    /// than wrong -- the class would resolve to nothing and every call would pass.
    #[test]
    fn every_receiver_class_has_members() {
        for (prefix, class, rule, _) in engine_data::RECEIVERS {
            assert!(
                engine_data::HANDLE_ALL_MEMBERS.iter().any(|(c, _)| c == class),
                "receiver `{prefix}` claims class `{class}` for rule `{rule}`, \
                 which has no all-members entry -- every call on it would pass silently"
            );
        }
    }

    #[test]
    fn a_known_api_is_silent() {
        assert!(rules("wa.weapons.replace({})").is_empty());
        // This line USED to assert `wa.msg('hi')` was silent. It is not a real API:
        // the only one-segment verbs in WA_FUNCTIONS are `log`, `random` and `sorted`.
        // parser.ts flags `wa.msg` too, so Rust agreeing with it is the correct outcome,
        // and the assertion was pinning a falsehood. Verified against both sides.
        assert!(rules("wa.log('hi')").is_empty());
    }

    #[test]
    fn a_registered_namespaced_wa_verb_is_silent_but_other_leaf_is_not() {
        let custom = vec![("wa.one".to_string(), "two".to_string())];
        let parse_and_check = |source: &str| {
            let ast = full_moon::parse(source).expect("test input must parse");
            run_with_custom(&ast, custom.clone())
        };

        assert!(
            parse_and_check("wa.one.two()").iter().all(|d| d.rule != "wa-namespace-typo"),
            "a registered wa.one.two must not be diagnosed"
        );
        assert!(
            parse_and_check("wa.one.three()").iter().any(|d| d.rule == "wa-namespace-typo"),
            "registration must not silence a different member"
        );
    }

    // ---- worm:set_state ---------------------------------------------------
    //
    // The list is `settable_worm_state()` in crates/lua-host/src/actor.rs, verbatim.
    // It is much smaller than the state table and that is the point: five states, six
    // names, everything else a hard Lua error.

    #[test]
    fn every_settable_state_is_silent() {
        for name in ["standing", "sliding", "bungee", "tumbling", "sinking", "teleporting"] {
            assert!(
                rules(&format!("worm:set_state(\"{name}\")")).is_empty(),
                "`{name}` IS settable -- the engine accepts it"
            );
        }
    }

    #[test]
    fn a_state_that_is_not_settable_is_still_caught() {
        // `jetpacking` is a REAL state and the engine pins `settable_worm_state("jetpacking")
        // == None`. "It exists" is not the same as "a script may enter it".
        assert_eq!(
            rules("worm:set_state(\"jetpacking\")"),
            vec!["worm-state-typo"]
        );
        let m = messages("worm:set_state(\"jetpacking\")", "worm-state-typo");
        assert!(
            m[0].contains("is a real worm state, but a script may not ENTER it"),
            "got {}",
            m[0]
        );
    }

    #[test]
    fn a_misspelled_state_suggests_the_right_one() {
        // One substitution is inside the radius for an 8-character word, so this
        // really does exercise the suggestion rather than the fallback.
        assert_eq!(rules("worm:set_state(\"standin\")"), vec!["worm-state-typo"]);
        let m = messages("worm:set_state(\"standin\")", "worm-state-typo");
        assert!(
            m[0].contains("Did you mean `standing`"),
            "the suggestion must be in the MESSAGE, not the detail: got {}",
            m[0]
        );
    }

    #[test]
    fn a_transposed_state_gets_the_valid_names_not_a_guess() {
        // "standign" -> "standing" is a TRANSPOSITION, which plain Levenshtein
        // scores as 2 edits, and `suggest`'s radius for an 8-character word is 1.
        // So there is deliberately no suggestion here.
        //
        // This test used to pass for the wrong reason: the old no-suggestion
        // branch ended with the full `Valid names: ...` list, which happens to
        // contain "standing", so `contains("standing")` was satisfied by the
        // fallback text rather than by any suggestion. Moving that list into
        // `detail` (the list is long and only needed after the user has decided
        // the name really is wrong) exposed it. Pinned now so the vacuous pass
        // cannot come back.
        assert_eq!(rules("worm:set_state(\"standign\")"), vec!["worm-state-typo"]);
        let m = messages("worm:set_state(\"standign\")", "worm-state-typo");
        assert!(
            !m[0].contains("Did you mean"),
            "a transposition is outside the typo radius; a guess here would send \
             the user chasing nothing: got {}",
            m[0]
        );
        // The valid names must still be reachable -- in the detail now.
        let d = details("worm:set_state(\"standign\")", "worm-state-typo");
        assert_eq!(d.len(), 1);
        assert!(
            d[0].contains("standing") && d[0].contains("Valid names"),
            "the fallback list moved to detail, not away: got {}",
            d[0]
        );
    }

    #[test]
    fn an_invented_state_is_not_called_a_real_one() {
        let m = messages("worm:set_state(\"flyng\")", "worm-state-typo");
        assert!(
            !m[0].contains("is a real worm state"),
            "an invented name must not be described as real, got {}",
            m[0]
        );
    }

    #[test]
    fn the_legacy_alias_stays_settable() {
        // `sinking` is the OLD name of tumbling (0x7F) and the engine keeps it as an
        // alias until packs move off it. Dropping it would warn on working code.
        assert!(rules("worm:set_state(\"sinking\")").is_empty());
    }

    #[test]
    fn the_match_is_case_sensitive_like_the_engine() {
        // `settable_worm_state` matches the literal name, so "Sliding" fails there too.
        assert_eq!(rules("worm:set_state(\"Sliding\")"), vec!["worm-state-typo"]);
    }

    #[test]
    fn a_computed_state_name_is_left_alone() {
        // Nothing to judge -- the same reason `cfg:whatever()` is never flagged.
        assert!(rules("worm:set_state(config.state)").is_empty());
    }

    #[test]
    fn a_users_own_set_state_is_never_flagged() {
        // test_rules.lua defines `function Worm:set_state(state)` on its own mock and
        // overrides it on several helpers. `cfg:set_state("whatever")` is the author's
        // own business.
        assert!(rules("cfg:set_state(\"whatever\")").is_empty());
        assert!(rules("function Worm:set_state(state) self.state = state end").is_empty());
    }

    #[test]
    fn the_finding_points_at_the_name_not_the_call() {
        let ast = full_moon::parse("worm:set_state(\"flyng\")").expect("must parse");
        let ds = run(&ast);
        assert_eq!(ds.len(), 1, "got {ds:?}");
        assert_eq!(ds[0].rule, "worm-state-typo");
        assert_eq!((ds[0].line, ds[0].column), (1, 16), "the literal itself");
    }

    #[test]
    fn worm_states_survived_the_move_into_rust() {
        // The table moved from checks.rs into src/data/wormStates.ts and back out through
        // the generator -- a round trip through a file the Rust compiler never checks the
        // list against. Pin the count against the ENGINE's own `label()` in
        // crates/game/src/worm_state.rs.
        assert_eq!(
            engine_data::WORM_STATES.len(),
            28,
            "worm state count changed -- check src/data/wormStates.ts against worm_state.rs"
        );
    }

    #[test]
    fn the_settable_list_is_the_engines_and_nothing_more() {
        // Six names for five states. Widening this list is the one change that would make
        // the check wrong in the safe-looking direction, so it is pinned exactly --
        // including the legacy alias, and including what is NOT settable.
        assert_eq!(engine_data::WORM_SETTABLE_STATES.len(), 6);
        let names: Vec<&str> = engine_data::WORM_SETTABLE_STATES
            .iter()
            .map(|(n, _)| *n)
            .collect();
        assert_eq!(
            names,
            ["standing", "sliding", "bungee", "tumbling", "sinking", "teleporting"]
        );
        let by_name = |n: &str| {
            engine_data::WORM_SETTABLE_STATES
                .iter()
                .find(|(name, _)| *name == n)
                .map(|(_, id)| *id)
        };
        assert_eq!(by_name("sinking"), Some(0x7f), "the alias points at tumbling");
        assert_eq!(by_name("tumbling"), Some(0x7f));
        // The engine's own error message enumerates five:
        // "valid: sliding, standing, bungee, tumbling, teleporting".
        assert!(!names.contains(&"jetpacking"), "jetpacking is NOT settable");
        assert!(!names.contains(&"parachuting"), "parachuting is NOT settable");
    }

    #[test]
    fn worm_state_ids_match_the_engine() {
        // Spot-checked against crates/game/src/worm_state.rs `label()` and the named
        // constants in crates/game/src/offsets.rs.
        let id = |n: &str| {
            engine_data::WORM_STATES
                .iter()
                .find(|(name, _, _)| *name == n)
                .map(|(_, id, _)| *id)
        };
        assert_eq!(id("standing"), Some(0x65));
        assert_eq!(id("prefiring"), Some(0x69));
        assert_eq!(id("jetpacking"), Some(0x78));
        assert_eq!(id("bungee"), Some(0x7c));
        assert_eq!(id("parachuting"), Some(0x7d));
        assert_eq!(id("tumbling"), Some(0x7f));
    }

    #[test]
    fn uncertain_states_are_marked_unconfirmed() {
        // The engine marks these with `?`: one observation or one source only. They must
        // never be described to a user as "real", and must not justify a finding.
        for (name, _, confirmed) in engine_data::WORM_STATES {
            if matches!(
                *name,
                "rope_firing" | "torching" | "rope_rolling" | "roping" | "dying" | "drowning" | "dead"
            ) {
                assert!(
                    !confirmed,
                    "`{name}` is `?`-marked in the engine and must be unconfirmed here"
                );
            }
        }
    }

    // ---- Levenshtein ------------------------------------------------------

    #[test]
    fn levenshtein_basics() {
        assert_eq!(levenshtein("", "abc", 3), 3);
        assert_eq!(levenshtein("abc", "abc", 3), 0);
        assert_eq!(levenshtein("repalce", "replace", 2), 2);
        assert_eq!(levenshtein("abc", "xyz", 2), 3, "beyond max returns max+1");
    }

    #[test]
    fn suggest_respects_the_length_scaled_radius() {
        // One edit is always in range.
        assert_eq!(suggest("weapoms", &["weapons"]), Some("weapons"));
        // Two edits on a short key is noise, so it is refused.
        assert_eq!(suggest("wpm", &["weapons"]), None);
        // Two edits on a long key is usually a real typo, so it is offered.
        assert_eq!(
            suggest("accuracy_while_airbonre", &["accuracy_while_airborne"]),
            Some("accuracy_while_airborne")
        );
    }

    // ---- diagnostics are ordered ------------------------------------------

    #[test]
    fn diagnostics_come_back_in_file_order() {
        let src = "local a = math.random()\nlocal b = pairs(t)\n";
        let ast = full_moon::parse(src).unwrap();
        let found = run(&ast);
        assert!(
            found[0].line < found[1].line,
            "got lines {:?} and {:?}",
            found[0].line,
            found[1].line
        );
    }

    #[test]
    fn clean_file_produces_nothing() {
        assert!(rules("local function f(a) return a + 1 end\nreturn f(1)").is_empty());
    }
// ---- the `if` capability-guard boundary --------------------------------
    //
    // `visit_if` used to guard EVERY `if` body, which meant an unrelated condition
    // silently suppressed a genuine typo. The guard has to depend on the CONDITION
    // mentioning `wa.*`, not on the call merely living inside an `if`.

    #[test]
    fn unrelated_if_condition_does_not_suppress_typo() {
        let found = rules("function M.onTick()\n  if near_enemy then\n    wa.typo.thing()\n  end\nend");
        assert!(
            found.iter().any(|r| r.as_str() == "wa-namespace-typo"),
            "typo inside an unrelated `if` body must still be reported, got {:?}",
            found
        );
    }

    #[test]
    fn capability_probe_if_is_still_suppressed() {
        // The guard must not be narrowed into uselessness: `if wa.x then wa.x() end`
        // is a legitimate capability probe and has to stay clean.
        let found = rules("function M.onTick()\n  if wa.some_new_capability then\n    wa.some_new_capability()\n  end\nend");
        assert!(
            !found.iter().any(|r| r.as_str() == "wa-namespace-typo"),
            "a real capability probe must not be flagged, got {:?}",
            found
        );
    }

    // ---- generated reference data ------------------------------------------
    //
    // `engine_data.rs` is generated from the TypeScript tables by
    // `scripts/genEngineData.ts`. A duplicate is not hypothetical: `wa.on.death` and
    // `wa.on.contact` were each listed twice, so the API tree offered two identical
    // entries. These guard the properties that matter here; STALENESS is checked by the
    // generator itself (`--check`), because Rust cannot recompute a TypeScript hash.

    #[test]
    fn reference_data_has_no_duplicate_function_names() {
        let mut seen = HashSet::new();
        for f in engine_data::WA_FUNCTIONS {
            assert!(seen.insert(*f), "duplicate wa.* function in engine_data.rs: {f}");
        }
    }

    #[test]
    fn every_receiver_class_has_a_member_list() {
        for (prefix, class_name, _, _) in engine_data::RECEIVERS {
            assert!(
                engine_data::HANDLE_CLASSES.iter().any(|(c, _)| c == class_name),
                "receiver `{prefix}` names class `{class_name}`, absent from HANDLE_CLASSES"
            );
        }
    }

    #[test]
    fn receiver_prefixes_are_lowercase() {
        // `check_method_call` lowercases the receiver before the lookup, so an uppercase
        // prefix here would be silently unreachable -- a check that never fires.
        for (prefix, _, _, _) in engine_data::RECEIVERS {
            assert_eq!(
                *prefix,
                prefix.to_lowercase().as_str(),
                "receiver prefix must be lowercase: {prefix}"
            );
        }
    }

    // ---- the two lists that used to exist twice, once -------------------
    //
    // `KNOWN_GLOBALS` was hand-written in checks.rs AND as `LUA_GLOBALS` in parser.ts.
    // They had already drifted by nine names before this was noticed, and the drift was
    // invisible to `__sweep.ts`, which compares only the set of RULE IDS per file and
    // never looks at data tables. Both now come from one TypeScript source via
    // genEngineData.ts, so these tests defend the CONTENT that `--check` cannot: whether
    // the content is right in the first place.

    /// Names that were in the old hand-written list and must never come back.
    ///
    /// `unpack` and `bit32` were REMOVED from Lua -- 5.2 renamed `unpack` to
    /// `table.unpack` and dropped `bit32` outright, and this engine is Lua 5.4. `bit`
    /// and `jit` are LuaJIT-isms; the engine runs plain Lua 5.4 (mlua `lua54`).
    /// `game_state`, `run_once` and `printf` were listed as though the host injected
    /// them, and it does not: `game_state` and `run_once` have ZERO hits across the
    /// vendored `crates/` tree, and all seven `printf` hits are Windows CRT internals
    /// in `engine/src/crt.rs`. The only global the host injects is `wa`
    /// (crates/lua-host/src/api.rs:329).
    ///
    /// Each of these SUPPRESSES a real `undefined-global` finding if present, which is
    /// the direction that silently hides bugs rather than inventing them.
    const BOGUS_GLOBALS: &[&str] = &[
        "unpack", // Lua 5.1; table.unpack since 5.2
        "bit32",  // Lua 5.1 only
        "bit",    // LuaJIT
        "jit",    // LuaJIT
        "game_state",
        "run_once",
        "printf",
    ];

    #[test]
    fn known_globals_exclude_names_lua54_or_this_engine_does_not_provide() {
        for bogus in BOGUS_GLOBALS {
            assert!(
                !engine_data::KNOWN_GLOBALS.contains(bogus),
                "`{bogus}` is not a global this engine provides, but it is in \
                 KNOWN_GLOBALS. It suppresses a real undefined-global finding."
            );
        }
    }

    #[test]
    fn known_globals_still_cover_the_ones_a_pack_may_legitimately_read() {
        // The other half of the guard. Tightening the list is the dangerous direction:
        // a real global missing here becomes a FALSE POSITIVE on working code.
        for real in [
            "wa", "_G", "_ENV", "_VERSION", "math", "string", "table", "os", "io",
            "coroutine", "debug", "utf8", "arg", "package", "warn", "assert", "error",
            "ipairs", "next", "pairs", "pcall", "print", "select", "tonumber",
            "tostring", "type", "xpcall",
        ] {
            assert!(
                engine_data::KNOWN_GLOBALS.contains(&real),
                "`{real}` is a real Lua 5.4 global but is missing from KNOWN_GLOBALS, \
                 which would report working code as an undefined name."
            );
        }
    }

    #[test]
    fn known_globals_have_no_duplicates() {
        let mut seen = HashSet::new();
        for g in engine_data::KNOWN_GLOBALS {
            assert!(seen.insert(*g), "duplicate global in engine_data.rs: {g}");
        }
    }

    #[test]
    fn worm_states_have_no_duplicate_names_or_ids() {
        let mut names = HashSet::new();
        for (name, _, _) in engine_data::WORM_STATES {
            assert!(names.insert(*name), "duplicate worm state name: {name}");
        }
        // Ids are unique across the canonical table; the `sinking` ALIAS is only in
        // WORM_SETTABLE_STATES and deliberately shares tumbling's 0x7F.
        let mut ids = HashSet::new();
        for (name, id, _) in engine_data::WORM_STATES {
            assert!(ids.insert(*id), "two names share id 0x{id:X}: {name}");
        }
    }

    #[test]
    fn every_receiver_class_is_covered_by_the_union_table() {
        // Replaces `every_handle_class_is_checkable_or_explicitly_declined`, which
        // pinned the old UNCHECKED_CLASSES exemption. The exemption is GONE; the
        // invariant now is that nothing the registry resolves to is missing from the
        // all-members table the union check reads, and that the methods-only table
        // never claims a member the union table lacks (both come from the same
        // generator, but a truncated generation must not pass silently).
        for (_, class_name, _, _) in engine_data::RECEIVERS {
            assert!(
                engine_data::HANDLE_ALL_MEMBERS.iter().any(|(c, _)| c == class_name),
                "`{class_name}` resolves in RECEIVERS but has no all-members entry"
            );
        }
        for (name, methods) in engine_data::HANDLE_CLASSES {
            let methods: &[&str] = methods;
            let all = engine_data::HANDLE_ALL_MEMBERS
                .iter()
                .find(|(c, _)| c == name)
                .map(|(_, ms)| *ms)
                .unwrap_or(&[]);
            for m in methods {
                assert!(
                    all.contains(m),
                    "`{name}:{m}` is in HANDLE_CLASSES but missing from HANDLE_ALL_MEMBERS"
                );
            }
        }
    }

    #[test]
    fn missile_entity_has_no_methods_but_still_has_members() {
        // MissileEntity is the plain table `wa.on.missile_frame` passes
        // (handleRegistry.ts): properties, not methods. The methods-only table stays
        // empty for it on purpose; the ALL-members table is what keeps `m:id()` silent,
        // exactly as the TS baseline does. (The old test here pinned "empty AND
        // declined" -- the declined half of that pairing no longer exists.)
        let missile_methods = engine_data::HANDLE_CLASSES
            .iter()
            .find(|(c, _)| *c == "MissileEntity")
            .expect("MissileEntity must remain in the generated data")
            .1;
        assert!(missile_methods.is_empty());
        let (_, all) = engine_data::HANDLE_ALL_MEMBERS
            .iter()
            .find(|(c, _)| *c == "MissileEntity")
            .expect("MissileEntity must be in the union table");
        assert!(!all.is_empty());
        assert!(
            all.contains(&"id"),
            "`id` is a MissileEntity property and must stay in the union table"
        );
    }

    #[test]
    fn the_union_table_is_ordered_like_the_typescript_baseline() {
        // `owners.join(" and ")` reads in table order, and parser.ts iterates
        // ALL_HANDLE_CLASSES in this order. mergeDiagnostics hides a mismatch today
        // (TS wording wins every collision), but a Rust-only run must not read
        // differently from the reviewed baseline.
        let order: Vec<&str> = engine_data::HANDLE_ALL_MEMBERS
            .iter()
            .map(|(c, _)| *c)
            .collect();
        assert_eq!(
            order,
            [
                "WormEntity",
                "LuaActor",
                "WorldHandle",
                "MissileEntity",
                "InventoryStore",
                "LightHandle",
                "MagneticField",
            ]
        );
    }

    #[test]
    fn a_misspelled_spec_key_is_caught() {
        assert_eq!(
            rules("wa.weapons.replace({ copy_fromm = 'bazooka' })"),
            vec!["spec-key-typo"]
        );
    }

    #[test]
    fn a_misspelled_spec_key_is_caught_when_deeply_indented() {
        // Indented, inside a callback, with the typo on its own line -- the shape that
        // let the leading-trivia bug hide through B1's suite. Column-0 fixtures are not
        // enough; every new rule gets at least one of these.
        let src = "\
function M.onLoad()
  wa.on.turn_start(function()
    if true then
      wa.weapons.replace({
        copy_fromm = 'bazooka',
        name = 'Custom Bazooka',
      })
    end
  end)
end
";
        assert_eq!(rules(src), vec!["spec-key-typo"]);
    }

    #[test]
    fn a_valid_spec_table_is_silent() {
        assert!(rules(
            "wa.weapons.replace({\n  copy_from = 'bazooka',\n  name = 'Custom',\n  on_fire = function()\n    return true\n  end,\n})"
        )
        .is_empty());
    }

    #[test]
    fn keys_inside_a_nested_patch_table_are_not_spec_keys() {
        // The whole reason the TypeScript version needed a blockDepth sentinel. Here it
        // is structural: a nested `patch = {}` is a DIFFERENT TableConstructor, and its
        // keys are the patch's, not the spec's.
        assert!(rules(
            "wa.weapons.replace({\n  copy_from = 'bazooka',\n  patch = {\n    my_own_field = 1,\n    another = 2,\n  },\n})"
        )
        .is_empty());
    }

    #[test]
    fn a_local_inside_an_on_fire_callback_is_never_a_spec_key() {
        // This exact shape produced 22 of the 28 false positives in the TypeScript
        // version, because the callback body sits at the same brace depth as a real key.
        assert!(rules(
            "wa.weapons.replace({\n  on_fire = function(fire)\n    local worm = fire.worm\n    local dir = worm.pos\n    return dir\n  end,\n})"
        )
        .is_empty());
    }

    #[test]
    fn a_typos_key_does_not_stop_a_real_one_being_reported() {
        assert_eq!(
            rules("wa.weapons.replace({ copy_fromm = 'a', nam = 'b' })"),
            vec!["spec-key-typo", "spec-key-typo"]
        );
    }

    #[test]
    fn an_ordinary_table_elsewhere_is_never_checked() {
        // Only `wa.weapons.replace` / `register` take a spec table. Flagging a user's own
        // table would be the most damaging false positive available.
        assert!(rules("local cfg = { my_own_field = 1, another = 2 }").is_empty());
        assert!(rules("wa.inventory.create({ weapon = 'bazooka' })").is_empty());
    }

    #[test]
    fn a_spec_table_held_in_a_variable_is_not_judged() {
        // The keys are not visible in this expression, so claiming anything about them
        // would be a guess.
        assert!(rules("local spec = { copy_fromm = 'x' }\nwa.weapons.replace(spec)").is_empty());
    }

    #[test]
    fn both_replace_and_register_are_checked() {
        assert_eq!(
            rules("wa.weapons.register({ copy_fromm = 'x' })"),
            vec!["spec-key-typo"]
        );
    }
// ---- worm-msg-filter ----------------------------------------------------
    //
    // The advisory is only safe because it is SILENT wherever the change could alter
    // what a handler receives. These are the same fixtures as the TypeScript half in
    // `src/services/__tests__/luaCompiler.test.ts`, and both engines must agree on all
    // of them -- `__sweep.ts` counts any disagreement as drift.

    #[test]
    fn an_unfiltered_handler_that_only_compares_msg_is_advised() {
        assert_eq!(
            rules("wa.on.worm_message(function(worm, msg)\n  if msg == wa.msg.START_TURN then step() end\nend)"),
            vec!["worm-msg-filter"]
        );
    }

    #[test]
    fn the_advice_is_info_not_a_warning() {
        // `mergeDiagnostics` gives TypeScript priority, so a severity disagreement
        // would show the finding under whichever console filter the winning side used.
        let d = diagnostics("wa.on.worm_message(function(worm, msg)\n  if msg == wa.msg.HIT then step() end\nend)");
        let f = d.iter().find(|x| x.rule == "worm-msg-filter").unwrap();
        assert_eq!(f.severity, "info");
    }

    #[test]
    fn the_advice_lands_on_the_call_so_merge_dedup_matches() {
        // The dedup in mergeDiagnostics is on (line, column, rule). parser.ts emits at
        // the `wa` token, so this must too -- otherwise desktop mode lists it twice.
        let d = diagnostics("local x = 1\nwa.on.worm_message(function(worm, msg)\n  if msg == wa.msg.HIT then step() end\nend)");
        let f = d.iter().find(|x| x.rule == "worm-msg-filter").unwrap();
        assert_eq!((f.line, f.column), (2, 1));
    }

    #[test]
    fn the_not_equal_early_return_shape_is_advised() {
        assert_eq!(
            rules("wa.on.worm_message(function(worm, msg)\n  if msg ~= wa.msg.FRAME_FINISH then return end\n  step()\nend)"),
            vec!["worm-msg-filter"]
        );
    }

    #[test]
    fn every_compared_message_is_named_in_the_advice() {
        // Naming only the first would silently stop the second being delivered.
        let m = messages("wa.on.worm_message(function(worm, msg)\n  if msg == wa.msg.FRAME_FINISH then a() end\n  if msg == wa.msg.START_TURN then b() end\nend)", "worm-msg-filter");
        assert_eq!(m.len(), 1);
        assert!(m[0].contains("wa.msg.FRAME_FINISH"), "got {}", m[0]);
        assert!(m[0].contains("wa.msg.START_TURN"), "got {}", m[0]);
    }

    #[test]
    fn a_handler_that_already_filters_is_not_advised() {
        assert!(rules("wa.on.worm_message(function(worm, msg)\n  if msg == wa.msg.JUMP then return 'eat' end\nend, { msgs = { wa.msg.JUMP } })").is_empty());
    }

    #[test]
    fn a_second_argument_even_an_empty_one_counts_as_already_filtered() {
        assert!(rules("wa.on.worm_message(function(worm, msg)\n  if msg == wa.msg.HIT then step() end\nend, {})").is_empty());
    }

    #[test]
    fn msg_passed_to_a_function_is_not_advised() {
        // The case that makes the rule wrong if it ever gets loose: `wa.log(msg)` wants
        // the message's VALUE, so a filter that drops it changes what is printed.

        assert!(rules("wa.on.worm_message(function(worm, msg)\n  wa.log(msg)\nend)").is_empty());
    }

    #[test]
    fn msg_compared_numerically_is_not_advised() {
        assert!(rules("wa.on.worm_message(function(worm, msg)\n  if msg > 3 then step() end\nend)").is_empty());
    }

    #[test]
    fn msg_indexed_is_not_advised() {
        assert!(rules("wa.on.worm_message(function(worm, msg)\n  local t = lookup[msg]\nend)").is_empty());
    }

    #[test]
    fn msg_returned_is_not_advised() {
        assert!(rules("wa.on.worm_message(function(worm, msg)\n  return msg\nend)").is_empty());
    }
#[test]
    fn one_unsafe_use_silences_the_whole_handler() {
        // The OTHER branch may need a message this rule cannot see, so nothing about
        // this handler can be proved.
        assert!(rules("wa.on.worm_message(function(worm, msg)\n  if msg == wa.msg.FRAME_FINISH then step() end\n  wa.log(msg)\nend)").is_empty());
    }

    #[test]
    fn msg_compared_against_a_local_is_not_advised() {
        assert!(rules("local FRAME = 1\nwa.on.worm_message(function(worm, msg)\n  if msg == FRAME then step() end\nend)").is_empty());
    }

    #[test]
    fn a_named_callback_is_not_advised() {
        // A name, not a body. Reading it would mean reading the whole file.
        assert!(rules("local function handler(worm, msg)\n  if msg == wa.msg.JUMP then return 'eat' end\nend\nwa.on.worm_message(handler)").is_empty());
    }

    #[test]
    fn a_parameter_not_named_msg_is_not_advised() {
        assert!(rules("wa.on.worm_message(function(worm, m)\n  if m == wa.msg.JUMP then return 'eat' end\nend)").is_empty());
    }

    #[test]
    fn a_handler_that_never_reads_msg_is_not_advised() {
        // Nothing to name, and nothing to prove.
        assert!(rules("wa.on.worm_message(function(worm, msg)\n  step()\nend)").is_empty());
    }

    #[test]
    fn worm_message_read_rather_than_called_is_not_advised() {
        assert!(rules("local f = wa.on.worm_message").is_empty());
    }

    #[test]
    fn a_reversed_comparison_is_not_advised() {
        // `wa.msg.FRAME_FINISH == msg` is not the shape either engine looks for, and
        // guessing at it here would put the two sides of the sweep in disagreement.
        assert!(rules("wa.on.worm_message(function(worm, msg)\n  if wa.msg.HIT == msg then step() end\nend)").is_empty());
    }

    #[test]
    fn two_handlers_are_advised_separately() {
        let found = rules("wa.on.worm_message(function(worm, msg)\n  if msg == wa.msg.FRAME_FINISH then a() end\nend)\n\nwa.on.worm_message(function(worm, msg)\n  if msg == wa.msg.START_TURN then b() end\nend)");
        assert_eq!(found, vec!["worm-msg-filter", "worm-msg-filter"]);
    }

    #[test]
    fn a_nested_end_does_not_end_the_handler_early() {
        // On the AST this is structural, but the fixture pins the BEHAVIOUR rather than
        // the implementation: an inner `end` must not stop the walk.
        assert_eq!(
            rules("wa.on.worm_message(function(worm, msg)\n  if msg == wa.msg.START_TURN then\n    if worm.turn then step() end\n  end\nend)"),
            vec!["worm-msg-filter"]
        );
    }

    #[test]
    fn a_spec_key_suggests_the_right_one() {
        let m = messages("wa.weapons.replace({ copy_fromm = 'bazooka' })", "spec-key-typo");
        assert!(m[0].contains("copy_from"), "got {}", m[0]);
    }

    #[test]
    fn spec_keys_are_matched_case_insensitively() {
        // Packs write COPY_FROM as readily as copy_from, and the engine reads either.
        assert!(rules("wa.weapons.replace({ COPY_FROM = 'bazooka' })").is_empty());
    }

    #[test]
    fn spec_key_data_survived_the_move_into_the_generator() {
        assert_eq!(
            SPEC_KEYS.len(),
            49,
            "spec key count changed -- check src/data/specKeys.ts was not truncated"
        );
        for required in ["weapon", "copy_from", "patch", "on_fire", "sprite"] {
            assert!(
                SPEC_KEYS.contains(&required),
                "`{required}` must stay in SPEC_KEYS; its absence is a false positive"
            );
        }
    }

    // ---- severity must agree with the TypeScript baseline ----------------
    //
    // `__sweep.ts` diffs rule COVERAGE and nothing else, so a severity that disagrees
    // across the port is invisible to it. Not hypothetical: `lockstep-pairs` was
    // `warning` here and `info` in parser.ts, so the same finding landed under a
    // different console filter depending on which side won the mergeDiagnostics dedup.

    /// The severity each shared rule must carry on BOTH sides.
    ///
    /// A rule missing from this table has not been reconciled yet -- add it rather than
    /// letting the two implementations choose independently.
    const AGREED_SEVERITY: &[(&str, &str)] = &[
        ("lockstep-rng", SEVERITY_ERROR),
        ("lockstep-pairs", SEVERITY_INFO),
        ("wa-namespace-typo", SEVERITY_WARNING),
        ("worm-state-typo", SEVERITY_WARNING),
        ("worm-api", SEVERITY_WARNING),
        ("handle-union", SEVERITY_INFO),
        // Advisory, like `lockstep-pairs`: the unfiltered handler is CORRECT code that
        // pays for messages it ignores. `info` on both sides keeps it out of the way.
        ("worm-msg-filter", SEVERITY_INFO),
    ];

    /// A realistic, INDENTED, multi-statement pack callback.
    ///
    /// Every line sits inside nested blocks on purpose. A token carries its LEADING
    /// trivia, so the first name on an indented line arrives as `"    wa"` and every
    /// `segs[0] == "wa"` comparison silently fails -- which is exactly how
    /// `unknown-method`, `wa-namespace-typo` and A5 were all dead on real mod code
    /// while every column-0 unit test passed. Column-0 fixtures are what hid that bug,
    /// so these pins must not reintroduce the blind spot.
    ///
    /// Deliberately contains one of each agreed rule: a `math.random` call, a `pairs`
    /// loop, a misspelled `wa.weapons`, a misspelled worm state, a misspelled
    /// `worm:` method, a `.kind`-narrowed union call, and an unfiltered
    /// `wa.on.worm_message` -- all of them beginning a line, all of them indented.
    ///
    /// The `worm_message` handler is why `worm-msg-filter` needs a fixture here at all:
    /// it is the one agreed rule whose trigger is a nested callback, and a handler with
    /// no `msg` comparison is silent by design, so nothing else in this pack would have
    /// proved the check alive.
    const REALISTIC_PACK: &str = "\
local M = {}

function M.onTick()
  local worm = wa.worms.nearest(1)
  local total = 0
  for _, other in pairs(wa.worms.all()) do
    total = total + worm:health()
  end
  if total > 0 then
    worm:set_state('slidng')
  end
  if obj.kind == 'worm' then
    obj:hurt(10)
  end
  worm:hurtt(10)
  wa.weapons.repalce({ copy_fromm = 'bazooka' })
  local r = math.random()
  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FRAME_FINISH then total = total + 1 end
  end)
end

return M
";

    /// The distinct severities the checker emitted for `rule` over `REALISTIC_PACK`.
    fn severities_of(rule: &str) -> Vec<String> {
        let ast = full_moon::parse(REALISTIC_PACK).expect("fixture must parse");
        let mut out: Vec<String> = run(&ast)
            .into_iter()
            .filter(|d| d.rule == rule)
            .map(|d| d.severity)
            .collect();
        out.sort();
        out.dedup();
        out
    }

    #[test]
    fn every_agreed_rule_actually_fires_on_realistic_indented_lua() {
        // Stated FIRST on purpose. The severity test below compares against an
        // expectation, so if a check ever went dead on indented code -- exactly the
        // leading-trivia failure -- it would see an empty list and could still pass.
        // Asserting the finding exists closes that hole.
        for (rule, _) in AGREED_SEVERITY {
            assert!(
                !severities_of(rule).is_empty(),
                "rule `{rule}` produced NOTHING on realistic indented Lua. The check is \
                 dead, and that is the same shape as the leading-trivia bug."
            );
        }
    }

    #[test]
    fn shared_rules_agree_with_the_typescript_baseline_on_severity() {
        for (rule, expected) in AGREED_SEVERITY {
            assert_eq!(
                severities_of(rule),
                vec![expected.to_string()],
                "rule `{rule}` must be `{expected}` to match parser.ts. The sweep cannot \
                 see this: it compares rule ids only, never severity."
            );
        }
    }
}
