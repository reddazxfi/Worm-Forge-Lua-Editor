//! `wfcheck` -- the WormForge Lua checker as a library and a command line tool.
//!
//! It answers one question without needing the desktop app and without needing
//! the game running: **would this mod folder load, and would it desync?**
//!
//! It runs the same two front ends the game does:
//!   1. the real Lua 5.4 compiler (`mlua`, compiled but never executed), which
//!      is the authority on whether a file is valid Lua at all;
//!   2. the full_moon checker -- `checks.rs` for desync and API rules,
//!      `scopes.rs` for undefined names.
//!
//! WHY THE CHECKER SOURCE IS VENDORED RATHER THAN SHARED
//! ----------------------------------------------------
//! `checks.rs`, `scopes.rs` and `engine_data.rs` are byte-identical copies of
//! the desktop app's sources, taken at a point in time (see PROGRESS.md
//! "Vendoring policy"). A `#[path]` include would keep them live, but it would
//! also pin this folder next to the app forever -- this crate must build and
//! move on its own, so it owns its copies.
//!
//! The trade is real and worth stating plainly: **this crate's checker can go
//! stale when the app's moves on.** The vendoring policy in PROGRESS.md says
//! when and how to re-copy. The drift tests pin internal consistency (rule
//! table vs checker, version vs checker, wire shape), but only a re-copy keeps
//! the two projects in step.
//!
//! These two modules are the checker's contract with this crate:
//!   - `crate::AstDiagnostic`  (the finding type)
//!   - `crate::engine_data`   (the generated engine tables)
//!
//! Both are satisfied by re-exporting [`AstDiagnostic`] and including
//! `engine_data.rs` at the crate root.

mod diagnostic;
pub mod format;
pub mod report;
pub mod rules;
pub mod walk;

// The generated engine tables, consumed by the checker via `crate::engine_data`.
//
// VENDORED COPY of the app's `src-tauri/src/engine_data.rs` -- byte-identical at
// copy time. This crate must build and move on its own, so it owns its copy.
// When the app's checker changes, re-copy the three files (see
// `compiler-cli/PROGRESS.md` "Vendoring policy") rather than editing by hand.
pub mod engine_data;

// The checker itself. Its own tests come along with it, which is why this crate
// can report the checker still passing its own suite.
//
// VENDORED COPY of the app's `src-tauri/src/checks.rs` and `scopes.rs`.
pub mod checks;
pub mod scopes;

pub use diagnostic::{AstDiagnostic, Severity};
pub use report::{check_file, check_source, CheckReport};

/// The pinned WormForge version these tables and messages describe.
///
/// Duplicated as a literal rather than imported: the checker's copy
/// (`checks.rs:48`) is a private constant in a module we include, and there is
/// no way to reach it without editing the app. `tests/drift.rs` fails if the two
/// ever disagree, so this cannot rot unnoticed.
pub const ENGINE_VERSION: &str = "0.9.11";