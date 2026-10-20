//! The diagnostic type, shared with the desktop app.
//!
//! This is a MIRROR of the struct the app defines at `src-tauri/src/main.rs:48`,
//! because the app's copy lives in a binary crate and cannot be imported. It is
//! duplicated rather than moved deliberately: the instruction for this crate is
//! to leave the app untouched, so the checker below is included by path instead
//! of the app being refactored to export it.
//!
//! WHAT WOULD SILENTLY BREAK IF THESE TWO DRIFT APART
//! ----------------------------------------------------
//! The serde attributes. The app sends this struct over the Tauri IPC bridge and
//! `src/types/wormforge.ts` reads it, so `camelCase` and the skipped `detail`
//! key are load-bearing for the app, not cosmetic. Changing either here does
//! nothing to the app, which is exactly why the drift guard in `tests/drift.rs`
//! exists.
//!
//! `checks.rs` and `scopes.rs` never construct this with a struct literal -- they
//! go through the three constructors below -- so adding or removing a field will
//! fail to compile rather than silently default. That is the property to keep.

use serde::Serialize;

/// One finding, flattened for every consumer.
///
/// `severity` is one of `error`, `warning`, `info` -- THREE levels, not two.
/// `info` is advisory: the code runs, it is just not deterministic. It is never
/// escalated, and nothing here should collapse it into `warning`.
#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AstDiagnostic {
    /// 1-based. A file that does not parse has no real position, and reports 1.
    pub line: usize,
    /// 1-based.
    pub column: usize,
    /// The short, actionable half -- what to do.
    pub message: String,
    pub severity: String,
    /// The stable rule id. This is what `--explain` takes and what the exit-code
    /// filters match on. Deliberately NOT a number: these ids are shared with the
    /// TypeScript parser and the app's console filters.
    pub rule: String,
    /// The long-form reasoning: why the engine behaves this way and what it costs
    /// at run time. Absent on most findings.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl AstDiagnostic {
    /// A file that does not parse or does not compile.
    pub fn parse_error(line: usize, column: usize, message: String) -> Self {
        Self {
            line,
            column,
            message,
            severity: Severity::ERROR.to_string(),
            rule: crate::rules::RULE_LUA_AST.to_string(),
            detail: None,
        }
    }

    /// A finding with no long-form explanation.
    pub fn finding(line: usize, column: usize, severity: &str, rule: &str, message: String) -> Self {
        Self {
            line,
            column,
            message,
            severity: severity.to_string(),
            rule: rule.to_string(),
            detail: None,
        }
    }

    /// A finding whose `message` is the action and whose `detail` is the
    /// reasoning. Only the long-form presentation differs.
    pub fn finding_with_detail(
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

/// The three severity levels, as the strings the app and the sweep already use.
pub struct Severity;

impl Severity {
    /// Breaks the match, or is certainly a bug.
    pub const ERROR: &'static str = "error";
    /// Very likely a bug. Never escalated automatically.
    pub const WARNING: &'static str = "warning";
    /// Advisory. The code runs; it is just not deterministic.
    pub const INFO: &'static str = "info";

    /// True for anything that should fail a build.
    ///
    /// `info` deliberately returns false. A pack full of `lockstep-pairs` advice
    /// is not a pack that should be blocked from being shared.
    pub fn fails_build(severity: &str) -> bool {
        severity == Severity::ERROR
    }
}