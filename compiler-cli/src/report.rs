//! Checking one file, and turning a failure into a position a human can jump to.

use std::path::{Path, PathBuf};

use crate::{checks, scopes, AstDiagnostic, Severity};

/// Everything known about one file.
///
/// A file can fail in two unrelated ways, and they are kept apart on purpose:
///   - `io_error`: the bytes could not be read. Nothing was checked.
///   - `compile_error`: the bytes are not valid Lua. Nothing was checked.
///
/// Both cases carry an empty `diagnostics`. That is a deliberate policy, not an
/// omission -- the checker works on an AST, and there is no honest AST for a
/// file that did not parse. `checks.rs` makes the same argument about piling
/// findings on top of an error the author already has to fix. A file with a
/// syntax error gets ONE red line telling them where, and nothing else.
pub struct CheckReport {
    pub path: PathBuf,
    /// The name Lua was given, which is what appears in a compiler error.
    pub chunk_name: String,
    pub io_error: Option<String>,
    /// `(line, column, message)`, already pulled out of Lua's own message.
    pub compile_error: Option<(usize, usize, String)>,
    pub diagnostics: Vec<AstDiagnostic>,
}

impl CheckReport {
    /// True when this file should make a build fail.
    ///
    /// `strict` widens that from "something is broken" to "something is
    /// suspicious". `info` never counts, at either setting: a pack full of
    /// `lockstep-pairs` advice is still a pack worth sharing.
    pub fn fails_build(&self, strict: bool) -> bool {
        if self.io_error.is_some() || self.compile_error.is_some() {
            return true;
        }
        self.diagnostics.iter().any(|d| {
            if Severity::fails_build(&d.severity) {
                true
            } else {
                strict && d.severity == Severity::WARNING
            }
        })
    }

    /// How many findings there are, counting a compile failure as one.
    pub fn finding_count(&self) -> usize {
        self.diagnostics.len() + usize::from(self.compile_error.is_some())
    }

    /// Every finding as a diagnostic, so a caller can render one uniform list.
    ///
    /// The compile failure comes back as a `lua-ast` diagnostic so the formats
    /// and the exit code do not each need their own special case for it.
    pub fn as_diagnostics(&self) -> Vec<AstDiagnostic> {
        let mut all: Vec<AstDiagnostic> = match self.compile_error {
            Some((line, column, ref msg)) => {
                vec![AstDiagnostic::parse_error(line, column, msg.clone())]
            }
            None => Vec::new(),
        };
        all.extend(self.diagnostics.iter().cloned());
        all
    }
}

/// Compiles a Lua 5.4 chunk without running it.
///
/// Identical in shape to the app's `compile_lua` command, which calls the same
/// three lines. `into_function()` parses, resolves upvalues and emits bytecode
/// but never CALLS the chunk -- so nothing in the mod being checked can execute
/// here. That is why no sandbox is needed, and why this tool is safe to point at
/// a folder of files from strangers.
///
/// The failure string is Lua's own, e.g.
/// `syntax error: [string "rules.lua"]:3: 'end' expected (to close 'function' at line 1)`.
fn compile_chunk(src: &str, chunk_name: &str) -> Result<(), String> {
    let lua = mlua::Lua::new();
    lua.load(src)
        .set_name(chunk_name)
        .into_function()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// Pulls the position out of a Lua compiler message.
///
/// Lua reports `[string "name"]:LINE:` and no column, so the column is 1. The
/// alternative -- reporting the file with no line at all -- makes the finding
/// un-clickable, which defeats the point of running a tool instead of reading
/// the file by eye. Only the LAST `]:` shape is taken, because a file name is
/// allowed to contain one and the real delimiter is always the final one.
fn parse_lua_position(message: &str) -> (usize, usize) {
    let bytes = message.as_bytes();
    let mut line: Option<usize> = None;
    for i in 0..bytes.len() {
        if bytes[i] != b']' || i + 1 >= bytes.len() || bytes[i + 1] != b':' {
            continue;
        }
        let width = bytes[i + 2..]
            .iter()
            .take_while(|b| b.is_ascii_digit())
            .count();
        if width == 0 || i + 2 + width >= bytes.len() || bytes[i + 2 + width] != b':' {
            continue;
        }
        line = message[i + 2..i + 2 + width].parse::<usize>().ok();
    }
    (line.unwrap_or(1), 1)
}

/// Checks source text. Used by the CLI for `--stdin` and by every test here.
///
/// `chunk_name` is what appears in Lua's error messages, so pass the file name.
pub fn check_source(src: &str, chunk_name: &str) -> CheckReport {
    let mut report = CheckReport {
        path: PathBuf::from(chunk_name),
        chunk_name: chunk_name.to_string(),
        io_error: None,
        compile_error: None,
        diagnostics: Vec::new(),
    };

    // 1. The compiler is the authority. If it fails, stop.
    if let Err(message) = compile_chunk(src, chunk_name) {
        let (line, column) = parse_lua_position(&message);
        report.compile_error = Some((line, column, message));
        return report;
    }

    // 2. It compiled as Lua 5.4, so full_moon -- configured for the same
    //    version, deliberately -- should agree. If it does not, that is a bug
    //    worth reporting rather than swallowing. The shape here matches the
    //    app's `parse_lua_ast`, which reads the same `Vec<Error>`.
    let ast = match full_moon::parse(src) {
        Ok(ast) => ast,
        Err(errors) => {
            for error in &errors {
                let (start, _end) = error.range();
                report
                    .diagnostics
                    .push(AstDiagnostic::parse_error(
                        start.line(),
                        start.character(),
                        error.error_message().to_string(),
                    ));
            }
            // An empty error list would read as "clean", which is the one answer
            // that must never be wrong.
            if errors.is_empty() {
                report.diagnostics.push(AstDiagnostic::parse_error(
                    1,
                    1,
                    "the file could not be parsed, and the parser gave no reason".to_string(),
                ));
            }
            return report;
        }
    };

    // 3. Both checkers, on the same AST.
    report.diagnostics.extend(checks::run(&ast));
    report.diagnostics.extend(scopes::run(&ast));

    sort_and_dedup(&mut report.diagnostics);
    report
}

/// Orders findings the way a reader expects, and drops exact duplicates.
///
/// The dedup key is `(line, column, rule)` -- the same key the app's
/// `mergeDiagnostics` uses. Without it, the same finding raised by both the flat
/// pass and the scope pass would be printed twice and counted twice, and the
/// total would disagree with what the desktop app shows for the same file.
fn sort_and_dedup(diagnostics: &mut Vec<AstDiagnostic>) {
    diagnostics.sort_by(|a, b| {
        (a.line, a.column, a.rule.as_str()).cmp(&(b.line, b.column, b.rule.as_str()))
    });
    diagnostics.dedup_by(|a, b| a.line == b.line && a.column == b.column && a.rule == b.rule);
}

/// Checks one file on disk.
pub fn check_file(path: &Path) -> CheckReport {
    let chunk_name = path.to_string_lossy().to_string();

    let src = match std::fs::read_to_string(path) {
        Ok(src) => src,
        Err(err) => {
            return CheckReport {
                path: path.to_path_buf(),
                chunk_name,
                io_error: Some(err.to_string()),
                compile_error: None,
                diagnostics: Vec::new(),
            }
        }
    };

    let mut report = check_source(&src, &chunk_name);
    report.path = path.to_path_buf();
    report
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_clean_file_produces_nothing() {
        let r = check_source("local x = 1\nreturn x\n", "ok.lua");
        assert!(r.compile_error.is_none(), "unexpected compile error");
        assert!(r.diagnostics.is_empty(), "got {:?}", r.diagnostics);
        assert!(!r.fails_build(true));
    }

    #[test]
    fn a_syntax_error_is_reported_with_a_line_the_user_can_jump_to() {
        let r = check_source("function f()\n  return 1\n", "broken.lua");
        let (line, _, ref message) = r.compile_error.as_ref().expect("must not compile");
        assert_eq!(
            *line, 3,
            "Lua reports the missing `end` at the end of the chunk: {message}"
        );
        assert!(r.diagnostics.is_empty(), "no findings on top of a parse error");
        assert!(r.fails_build(false));
    }

    #[test]
    fn a_compile_error_suppresses_the_semantic_checks() {
        // This file ALSO reads an undefined global. It must still report one
        // thing, not two. A finding on a file with no AST would be invented.
        let r = check_source("function f()\n  return undefined_thing\n", "broken.lua");
        assert!(r.compile_error.is_some());
        assert!(
            r.diagnostics.is_empty(),
            "got {:?}",
            r.diagnostics
        );
    }

    #[test]
    fn desync_checks_still_run_once_the_file_compiles() {
        let r = check_source("local x = math.random()\n", "rng.lua");
        assert!(r.compile_error.is_none());
        assert_eq!(r.diagnostics[0].rule, "lockstep-rng");
        assert_eq!(r.diagnostics[0].severity, "error");
        assert!(r.fails_build(false), "an error must fail the build");
    }

    #[test]
    fn advisory_findings_never_fail_a_build() {
        let r = check_source(
            "local t = {}\nfor k, v in pairs(t) do print(k, v) end\n",
            "pairs.lua",
        );
        assert!(
            r.diagnostics.iter().any(|d| d.rule == "lockstep-pairs"),
            "expected the pairs advisory, got {:?}",
            r.diagnostics
        );
        assert!(!r.fails_build(false), "info is advice, not a failure");
        assert!(
            !r.fails_build(true),
            "`--strict` must not turn advice into a failure either"
        );
    }

    #[test]
    fn the_lua_position_parser_finds_the_line() {
        assert_eq!(
            parse_lua_position(
                "syntax error: [string \"rules.lua\"]:3: 'end' expected (to close 'function' at line 1)"
            ),
            (3, 1)
        );
        // No position in the message at all -- must not panic, must not guess 0.
        assert_eq!(parse_lua_position("memory allocation error"), (1, 1));
    }

    #[test]
    fn the_position_parser_survives_a_chunk_name_containing_the_delimiter() {
        // A file named `weird]:9:.lua` must not be read as line 9.
        assert_eq!(
            parse_lua_position("syntax error: [string \"weird]:9:.lua\"]:2: '=' expected"),
            (2, 1)
        );
    }

    #[test]
    fn duplicates_on_one_position_are_collapsed() {
        let mut ds = vec![
            AstDiagnostic::finding(1, 1, Severity::WARNING, "b-rule", "second".into()),
            AstDiagnostic::finding(1, 1, Severity::WARNING, "a-rule", "first".into()),
            AstDiagnostic::finding(1, 1, Severity::WARNING, "b-rule", "second".into()),
        ];
        sort_and_dedup(&mut ds);
        assert_eq!(ds.len(), 2, "{ds:?}");
        assert_eq!(ds[0].rule, "a-rule", "sorted by rule at a position");
    }
}