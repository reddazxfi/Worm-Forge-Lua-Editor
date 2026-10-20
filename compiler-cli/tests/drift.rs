//! Guards this tool's own internal consistency.
//!
//! The checker files (`checks.rs`, `scopes.rs`, `engine_data.rs`) are VENDORED
//! copies of the app's sources -- byte-identical at copy time, owned by this
//! crate afterwards (see PROGRESS.md "Vendoring policy"). These tests pin:
//!
//!   1. The rule table in `src/rules.rs` vs the rule ids the vendored checker
//!      can emit -- in both directions.
//!   2. `ENGINE_VERSION` vs the vendored checker's `ENGINE_VERSION`.
//!   3. The JSON wire shape of our own `AstDiagnostic` (camelCase, omitted
//!      absent `detail`, all six fields) -- this is the contract a porting
//!      agent parses with `--format json`.
//!
//! The wire-shape test used to read the app's `src-tauri/src/main.rs` and
//! compare. It can't anymore: this folder must build with the app absent.
//! The shape is pinned against our own `diagnostic.rs` instead -- if someone
//! edits that struct, this fails loudly rather than shipping subtly different
//! JSON to every agent script parsing it.

use std::fs;

use wfcheck::rules::{self, RULE_LUA_AST};

const CHECKS: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/src/checks.rs");
const SCOPES: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/src/scopes.rs");
const ENGINE_DATA: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/src/engine_data.rs");
const DIAGNOSTIC: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/src/diagnostic.rs");

/// Hyphenated strings that appear in the checker's source but are NOT rule ids.
///
/// Empty today. It is here so that when someone writes a message containing a
/// hyphenated word, the failure reads "add it to this list, it is prose", not a
/// puzzle. Do not widen it to paper over a rule that is genuinely missing.
const NOT_RULE_IDS: &[&str] = &[];

/// Rule ids are lower-case words joined by single hyphens -- `lockstep-pairs`,
/// never `Lockstep_Pairs` and never `WFPairs`. Scanned rather than parsed,
/// because a rule id is only ever a string literal.
fn kebab_literals(source: &str) -> Vec<String> {
    let bytes = source.as_bytes();
    let mut found = Vec::new();
    let mut i = 0usize;

    while i < bytes.len() {
        if bytes[i] != b'"' {
            i += 1;
            continue;
        }
        let start = i + 1;
        let mut j = start;
        while j < bytes.len() && bytes[j] != b'"' {
            if bytes[j] == b'\\' {
                j += 1; // an escaped quote means this is not the end
            }
            j += 1;
        }
        if j >= bytes.len() {
            break; // unterminated literal, or a stray quote in a comment
        }
        let literal = &source[start..j];
        if is_rule_id(literal) && !NOT_RULE_IDS.contains(&literal) {
            found.push(literal.to_string());
        }
        i = j + 1;
    }
    found
}

fn is_rule_id(literal: &str) -> bool {
    if literal.len() < 4 {
        return false;
    }
    let mut parts = literal.split('-');
    let head = parts.next().unwrap_or_default();
    if head.is_empty() || !parts.clone().any(|_| true) {
        return false; // no hyphen at all, or an empty first part
    }
    literal
        .split('-')
        .all(|part| !part.is_empty() && part.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()))
}

fn read(path: &str) -> String {
    fs::read_to_string(path).unwrap_or_else(|e| panic!("could not read {path}: {e}"))
}

#[test]
fn every_rule_id_in_the_checker_is_explained_by_the_table() {
    let mut all = Vec::new();
    for path in [CHECKS, SCOPES, ENGINE_DATA] {
        all.extend(kebab_literals(&read(path)));
    }
    all.sort();
    all.dedup();

    assert!(
        !all.is_empty(),
        "the scan found nothing -- the rule-id pattern is probably wrong, which would \
         make this test pass for the wrong reason"
    );

    let missing: Vec<&String> = all.iter().filter(|id| rules::find(id).is_none()).collect();
    assert!(
        missing.is_empty(),
        "these rule ids are emitted by the checker but missing from src/rules.rs: {missing:?}\n\
         Add each to RULES, or add it to NOT_RULE_IDS if it is prose rather than a rule."
    );
}

#[test]
fn every_rule_in_the_table_can_actually_be_emitted() {
    let emitted: Vec<String> = kebab_literals(&read(ENGINE_DATA))
        .into_iter()
        .chain(kebab_literals(&read(CHECKS)))
        .chain(kebab_literals(&read(SCOPES)))
        .collect();

    for info in rules::RULES {
        if info.id == RULE_LUA_AST {
            continue; // raised by this crate, not by a checker file
        }
        assert!(
            emitted.contains(&info.id.to_string()),
            "the table explains `{}` but no checker file mentions it -- either the rule was \
             removed, or the table was never updated",
            info.id
        );
    }
}

#[test]
fn the_pinned_engine_version_agrees_with_the_checker() {
    let checks = read(CHECKS);
    let declared = checks
        .lines()
        .find_map(|line| line.trim().strip_prefix("const ENGINE_VERSION: &str = "))
        .map(|rest| {
            rest.trim_end_matches(';')
                .trim_end_matches('"')
                .trim_start_matches('"')
                .to_string()
        })
        .unwrap_or_else(|| {
            panic!(
                "could not find `const ENGINE_VERSION` in {CHECKS}. If it was renamed, \
                 update wfcheck::ENGINE_VERSION to match rather than deleting this test."
            )
        });
    assert_eq!(
        declared,
        wfcheck::ENGINE_VERSION,
        "the checker tells users 'does not exist in WormForge {declared}' while this tool \
         reports itself as {} -- one of the two version strings is stale.",
        wfcheck::ENGINE_VERSION
    );
}

#[test]
fn the_diagnostic_wire_shape_is_stable() {
    let diagnostic = read(DIAGNOSTIC);

    // `--format json` is the machine contract a porting agent parses. These
    // serde attributes are load-bearing, not cosmetic: camelCase field names
    // and an omitted-absent `detail` are what every consumer expects. If
    // either is edited here, this fails loudly rather than shipping subtly
    // different JSON to every script parsing it.
    assert!(
        diagnostic.contains("#[serde(rename_all = \"camelCase\")]"),
        "AstDiagnostic lost camelCase; JSON consumers would break"
    );
    assert!(
        diagnostic.contains("skip_serializing_if = \"Option::is_none\""),
        "AstDiagnostic no longer omits an absent `detail`"
    );
    for field in ["line", "column", "message", "severity", "rule", "detail"] {
        assert!(
            diagnostic.contains(field),
            "AstDiagnostic no longer has a `{field}` field"
        );
    }
}

/// The rule table is sorted, because `--list-rules` reads as a table and an
/// unsorted one makes a new rule look like it appeared in two places.
#[test]
fn the_rule_table_is_sorted_and_has_no_duplicates() {
    let ids: Vec<&str> = rules::RULES.iter().map(|r| r.id).collect();
    let mut sorted = ids.clone();
    sorted.sort_unstable();
    assert_eq!(ids, sorted, "RULES must be sorted by id");

    let mut unique = sorted;
    unique.dedup();
    assert_eq!(
        rules::RULES.len(),
        unique.len(),
        "duplicate rule id in RULES"
    );
}