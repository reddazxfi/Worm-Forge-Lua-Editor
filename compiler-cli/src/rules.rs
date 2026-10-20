//! What every rule id means, for `--list-rules` and `--explain`.
//!
//! WHY THIS TABLE IS HAND-WRITTEN AND STILL SAFE
//! ----------------------------------------------
//! A rule id is a string literal inside the checker, so nothing forces this file
//! to know about a new one. The summaries below could therefore rot silently --
//! a renamed rule would keep printing its old explanation.
//!
//! `tests/drift.rs` closes that hole: it reads the checker's own source and
//! fails if any rule id there is missing from [`RULES`], or if this table names
//! a rule the checker cannot produce. The table cannot outlive the checker.
//!
//! NO SEVERITY COLUMN, ON PURPOSE
//! ------------------------------
//! Severity is decided per finding inside the checker and is not uniform per
//! rule -- `handle-union` is always `info`, but `worm-api` can be reached at more
//! than one level depending on the receiver. Printing a single severity per rule
//! would be a guess wearing a table's clothes. `--list-rules` says nothing about
//! severity rather than something wrong.
//!
//! The rule ids are shared with the TypeScript parser and the app's console
//! filters, so they are strings like `lockstep-pairs`, not numbered codes.

/// A rule that did not come from the checker but from the file failing to
/// compile. Reported by this CLI and by the app's `lua-ast` parse-error path.
pub const RULE_LUA_AST: &str = "lua-ast";

/// One row of the rule table.
pub struct RuleInfo {
    pub id: &'static str,
    /// One line, plain language. What fires, not why the checker bothers.
    pub summary: &'static str,
    /// Which source file the id is written in. Used by the drift test to tell a
    /// rule it missed from a word in a sentence.
    pub origin: &'static str,
}

/// Every rule this tool can report, alphabetically.
pub const RULES: &[RuleInfo] = &[
    RuleInfo {
        id: "actor-api",
        summary: "`a:`/`actor:` calls a method that LuaActor does not have.",
        origin: "engine_data.rs",
    },
    RuleInfo {
        id: "handle-union",
        summary: "Receiver is a WorldHandle -- a union of mine, drum, oil, crate, grave and worm, told apart only at run time by `.kind`. Advisory: narrow it first.",
        origin: "checks.rs",
    },
    RuleInfo {
        id: "inventory-api",
        summary: "`inv:`/`store:`/`inventory:` calls a method that InventoryStore does not have.",
        origin: "engine_data.rs",
    },
    RuleInfo {
        id: "lockstep-pairs",
        summary: "`pairs()` iterates in hash order, and hash order differs per peer. Use a deterministic key order or `ipairs`.",
        origin: "checks.rs",
    },
    RuleInfo {
        id: "lockstep-rng",
        summary: "`math.random()`, `math.cos()`, `math.sin()`, `math.atan()` are not lockstep-safe: results can differ per machine and the match desyncs. Use the engine's `wa.random`, `wa.math.cos`, `wa.math.sin`, `wa.math.atan`.",
        origin: "checks.rs",
    },
    RuleInfo {
        id: RULE_LUA_AST,
        summary: "The file is not valid Lua 5.4 -- it does not compile. Nothing else is checked, because a file with no AST cannot be checked honestly.",
        origin: "this tool",
    },
    RuleInfo {
        id: "missile-api",
        summary: "`m:`/`missile:` uses a member that MissileEntity does not have. Note missiles expose properties, not methods.",
        origin: "engine_data.rs",
    },
    RuleInfo {
        id: "spec-key-typo",
        summary: "A weapon spec table key that is not in the spec key list. The weapon will load with that value ignored.",
        origin: "checks.rs",
    },
    RuleInfo {
        id: "undefined-global",
        summary: "Reads a global the host never injects. The engine only provides `wa` plus the Lua 5.4 library, so this reads as nil.",
        origin: "checks.rs",
    },
    RuleInfo {
        id: "unknown-method",
        summary: "A method the receiver's resolved class does not have. The backstop when no more specific API rule applies.",
        origin: "checks.rs",
    },
    RuleInfo {
        id: "wa-namespace-typo",
        summary: "A `wa.*` path that does not exist in the pinned engine version. Usually a misspelling.",
        origin: "checks.rs",
    },
    RuleInfo {
        id: "world-object-api",
        summary: "A world-object receiver (`mine:`, `drum:`, `crate:`, ...) used without a `.kind` test, so the member cannot be proven to exist.",
        origin: "engine_data.rs",
    },
    RuleInfo {
        id: "worm-api",
        summary: "`worm:` calls a method that WormEntity does not have.",
        origin: "engine_data.rs",
    },
    RuleInfo {
        id: "worm-msg-filter",
        summary: "Guidance on the worm message filter tables. Advisory -- the code runs as written.",
        origin: "checks.rs",
    },
    RuleInfo {
        id: "worm-state-typo",
        summary: "A worm state name the engine cannot label. An unconfirmed state in the table never justifies a finding on its own.",
        origin: "checks.rs",
    },
];

/// Look a rule up by id.
pub fn find(id: &str) -> Option<&'static RuleInfo> {
    RULES.iter().find(|r| r.id == id)
}