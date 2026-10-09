// Differential-sweep harness for scripts/__sweep.ts. DELETE both when parser.ts goes.
//
// This exists because `checks.rs` lives in a BINARY crate, so its tests cannot be
// driven from TypeScript. Rather than moving the checker into a library crate (a real
// refactor that deserves its own change), this binary re-exposes it as a batch
// operation over a JSON manifest.
//
// Why a batch at all: the sweep walks ~1500 real .lua files. One process per file
// would cost a full compile-load cycle each and take minutes; one process that parses
// the manifest once and loops takes seconds.
//
// Usage: cargo run --bin wasmforge-sweep -- <manifest.json>
//   manifest: a JSON array of absolute paths.
//   stdout:   a JSON object mapping each path to a FileReport:
//
//     { "rules":    [String],   // deduped rule ids -- the SET comparison gate
//       "findings": [Finding] } // (line, column, rule) deduped -- the COUNT comparison
//
// Both views are emitted because they answer different questions and neither subsumes the
// other. `rules` asks "is this rule covered on both sides"; `findings` asks "do the sides
// produce the same diagnostics a user would see". A set cannot represent a second false
// positive of a rule it already contains, so it cannot be made to answer the second.
#[path = "../checks.rs"]
mod checks;
#[path = "../scopes.rs"]
mod scopes;

// `checks.rs` refers to `crate::engine_data` and `crate::AstDiagnostic`, which resolve
// against the BINARY crate when it is included this way. These shims keep that one
// line in checks.rs from needing to know which crate it was compiled into -- otherwise
// `#[path]`-including it here and declaring `mod checks;` in main.rs would need
// different source, and the checker would exist twice.
mod engine_data {
    include!("../engine_data.rs");
}

use serde::Serialize;

/// Mirrors the binary crate's `AstDiagnostic`; see the note above.
#[derive(Serialize, Debug)]
struct AstDiagnostic {
    line: usize,
    column: usize,
    message: String,
    severity: String,
    rule: String,
    /// The expandable long-form text. The sweep never reads it -- `Finding` below
    /// deliberately drops the message too -- but `checks.rs` constructs diagnostics
    /// through `finding_with_detail`, so the field has to exist for it to compile.
    #[serde(skip_serializing_if = "Option::is_none")]
    detail: Option<String>,
}

impl AstDiagnostic {
    fn finding(
        line: usize,
        column: usize,
        severity: &str,
        rule: &str,
        message: String,
    ) -> Self {
        Self {
            line,
            column,
            message,
            severity: severity.to_string(),
            rule: rule.to_string(),
            detail: None,
        }
    }

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

/// One diagnostic, reduced to exactly what the cross-implementation comparison reads.
///
/// `message` is deliberately NOT here. Wording differs between the two implementations by
/// design and comparing it would produce noise that hides real positional drift. The
/// identity that matters is *where* and *what kind* of finding it is.
#[derive(Serialize, Debug, Clone)]
struct Finding {
    line: usize,
    column: usize,
    rule: String,
    /// Carried but not part of the identity key -- severity is compared as its own,
    /// separately-reported check, since `AGREED_SEVERITY` pins rule-level severity and a
    /// one-off disagreement at one site is worth seeing without failing every position.
    severity: String,
}

/// Both views of one file's findings. See the note at the top of the file.
#[derive(Serialize, Debug)]
struct FileReport {
    rules: Vec<String>,
    findings: Vec<Finding>,
}

use std::collections::BTreeMap;

// Optional second argument: dump every finding with line and message for one file.
// A rule name alone is not actionable -- "unknown-method" on a 3000-line pack is a
// needle; "L2500 worm:jetpack_steer is not a WormEntity method" is a fix.
fn verbose(one: &str) {
    let src = std::fs::read_to_string(one).expect("cannot read target");
    match full_moon::parse(&src) {
        Ok(ast) => {
            for d in checks::run(&ast).into_iter().chain(scopes::run(&ast)) {
                println!("L{}:{} [{}] {}", d.line, d.column, d.rule, d.message);
            }
        }
        Err(errors) => {
            for e in errors {
                let (start, _) = e.range();
                println!("PARSE ERROR L{}: {}", start.line(), e.error_message());
            }
        }
    }
}
fn main() {
    let manifest = std::env::args().nth(1).expect("usage: sweep <manifest.json> [file]");
    // Batch mode when given a manifest, single-file verbose when given a path.
    if manifest == "--verbose" {
        verbose(&std::env::args().nth(2).expect("usage: sweep --verbose <file>"));
        return;
    }
    let raw = std::fs::read_to_string(&manifest).expect("cannot read manifest");

    // Hand-rolled slice parse: the manifest is a flat array of quoted strings, and
    // pulling serde_json in for that would add a dependency to a file we delete.
    let mut files: Vec<&str> = Vec::new();
    let mut chars = raw.chars().peekable();
    let mut in_string = false;
    let mut current = String::new();
    while let Some(c) = chars.next() {
        if in_string {
            if c == '\\' {
                // Windows manifests from PowerShell contain backslash paths, so `\\`
                // and `\'` are escapes worth honouring.
                match chars.next() {
                    Some(next) => current.push(next),
                    None => break,
                }
            } else if c == '"' {
                in_string = false;
                files.push(Box::leak(current.clone().into_boxed_str()));
                current.clear();
            } else {
                current.push(c);
            }
        } else if c == '"' {
            in_string = true;
        }
    }

    let mut report: BTreeMap<String, FileReport> = BTreeMap::new();
    for path in files {
        let entry = match std::fs::read_to_string(path) {
            Ok(src) => match full_moon::parse(&src) {
                Ok(ast) => {
                    let ds: Vec<AstDiagnostic> = checks::run(&ast)
                        .into_iter()
                        .chain(scopes::run(&ast))
                        .collect();
                    // DEDUPED, and kept for the EXISTING set-comparison gate, which asks
                    // only "does this rule fire on either side". A pack with the same typo
                    // on nine lines must not read as nine findings to that gate.
                    let mut rules: Vec<String> = ds.iter().map(|d| d.rule.clone()).collect();
                    rules.sort();
                    rules.dedup();

                    // UNDEDUPED, with positions, for the count/position comparison. This
                    // is what the set view structurally cannot see: two DIFFERENT false
                    // positives of the same rule, or one extra and one missing finding,
                    // both of which vanish into a Set.
                    //
                    // Deduped on the exact key `mergeDiagnostics` uses,
                    // (line, column, rule), so this reports what the user would ACTUALLY
                    // see in the console rather than raw engine output. On this corpus that
                    // matters: parser.ts emits `undefined-global` twice at one position
                    // (a flat pass and a scope pass) and the merge collapses them.
                    let mut findings: Vec<Finding> = ds
                        .iter()
                        .map(|d| Finding {
                            line: d.line,
                            column: d.column,
                            rule: d.rule.clone(),
                            severity: d.severity.clone(),
                        })
                        .collect();
                    findings.sort_by(|a, b| {
                        (a.line, a.column, &a.rule).cmp(&(b.line, b.column, &b.rule))
                    });
                    findings.dedup_by(|a, b| {
                        (a.line, a.column, &a.rule) == (b.line, b.column, &b.rule)
                    });

                    FileReport { rules, findings }
                }
                // A file that does not parse has no AST to check. Report the parse
                // failure under the same `lua-ast` rule the Tauri command uses, so the
                // comparison stays apples-to-apples.
                Err(_) => FileReport {
                    rules: vec!["lua-ast".to_string()],
                    findings: vec![Finding {
                        line: 0,
                        column: 0,
                        rule: "lua-ast".to_string(),
                        severity: "error".to_string(),
                    }],
                },
            },
            Err(_) => continue,
        };
        report.insert(path.to_string(), entry);
    }

    println!("{}", serde_json::to_string(&report).expect("serialise"));
}
