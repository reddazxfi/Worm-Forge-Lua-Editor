//! Rendering a run.
//!
//! Five formats, chosen because five different things consume this tool's
//! output: a person at a terminal, a CI job, a GitHub pull request, and two
//! editors' error parsers. None of them are worth a dependency.
//!
//! Colour is decided once, here, and only ever for `pretty`. Every other format
//! must stay plain, because a colour escape inside a file path is a bug that
//! only shows up on someone else's machine.

use std::io::Write;

use crate::{AstDiagnostic, CheckReport, Severity, ENGINE_VERSION};

/// One machine or human per format.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Format {
    /// rustc-style, for a person.
    Pretty,
    /// One JSON object, for a script.
    Json,
    /// `path:line:col: severity: message [rule]` -- what gcc emits, what VS Code
    /// and Neovim both already know how to parse.
    Gcc,
    /// `path(line,col): severity rule: message` -- the other stock parser.
    Msvc,
    /// GitHub Actions workflow commands; annotates the diff and fails the job.
    Github,
}

impl Format {
    pub fn parse(name: &str) -> Option<Format> {
        match name {
            "pretty" => Some(Format::Pretty),
            "json" => Some(Format::Json),
            "gcc" => Some(Format::Gcc),
            "msvc" => Some(Format::Msvc),
            "github" => Some(Format::Github),
            _ => None,
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            Format::Pretty => "pretty",
            Format::Json => "json",
            Format::Gcc => "gcc",
            Format::Msvc => "msvc",
            Format::Github => "github",
        }
    }
}

/// Everything the renderers need beyond the results themselves.
pub struct RenderOptions {
    pub format: Format,
    pub color: bool,
    /// Print the one-line totals at the end. `--quiet` turns this off.
    pub summary: bool,
    /// Print the "could not read this" list.
    pub show_skipped: bool,
}

/// The totals, computed once so every format agrees on them.
pub struct Tally {
    pub files: usize,
    pub errors: usize,
    pub warnings: usize,
    pub infos: usize,
}

impl Tally {
    pub fn of(reports: &[CheckReport]) -> Tally {
        let mut tally = Tally { files: 0, errors: 0, warnings: 0, infos: 0 };
        for report in reports {
            if report.io_error.is_some() {
                tally.errors += 1;
                continue;
            }
            tally.files += 1;
            for d in report.as_diagnostics() {
                match d.severity.as_str() {
                    Severity::ERROR => tally.errors += 1,
                    Severity::WARNING => tally.warnings += 1,
                    _ => tally.infos += 1,
                }
            }
        }
        tally
    }

    pub fn total(&self) -> usize {
        self.errors + self.warnings + self.infos
    }
}

// ---- colour -------------------------------------------------------------

const RESET: &str = "\u{1b}[0m";
const DIM: &str = "\u{1b}[2m";
const RED: &str = "\u{1b}[1;31m";
const YELLOW: &str = "\u{1b}[1;33m";
const BLUE: &str = "\u{1b}[1;34m";

fn severity_color(severity: &str) -> &'static str {
    match severity {
        Severity::ERROR => RED,
        Severity::WARNING => YELLOW,
        _ => BLUE,
    }
}

/// Wraps `text` in `code`, or returns it untouched when colour is off.
///
/// The one rule every colour site goes through, so `--no-color` and `NO_COLOR`
/// cannot be forgotten in one place.
fn paint(enabled: bool, code: &str, text: &str) -> String {
    if enabled {
        format!("{code}{text}{RESET}")
    } else {
        text.to_string()
    }
}

/// Whether stdout is a terminal rather than a pipe or a file.
///
/// Decided by asking the OS, not by guessing from the format: `wfcheck ... >
/// log.txt` inside `check-mods.bat` must not write escape codes into the log.
///
/// No dependency: `GetConsoleMode` on Windows, `isatty` elsewhere.
pub fn stdout_is_terminal() -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::io::AsRawHandle;
        #[link(name = "kernel32")]
        extern "system" {
            fn GetConsoleMode(handle: *mut core::ffi::c_void, mode: *mut u32) -> i32;
        }
        let mut mode: u32 = 0;
        // STD_OUTPUT_HANDLE, so this also works before stdout is used for output.
        unsafe { GetConsoleMode(std::io::stdout().as_raw_handle(), &mut mode) != 0 }
    }
    #[cfg(not(windows))]
    {
        extern "C" {
            fn isatty(fd: i32) -> i32;
        }
        unsafe { isatty(1) == 1 }
    }
}

/// `auto` asks the OS, `always` and `never` do what they say.
pub fn resolve_color(mode: &str) -> bool {
    match mode {
        "always" => true,
        "never" => false,
        _ => std::env::var_os("NO_COLOR").is_none() && stdout_is_terminal(),
    }
}

/// Clears the scrollback of a shared console window, if we own one.
pub fn prepare_terminal() {
    #[cfg(windows)]
    if stdout_is_terminal() {
        // "\x1b[2J\x1b[3J\x1b[H" -- erase screen, erase scrollback, home cursor.
        // Without the 3J, a long run leaves the old output above the scrollback
        // where `cls` would have removed it.
        print!("\u{1b}[2J\u{1b}[3J\u{1b}[H");
        let _ = std::io::stdout().flush();
    }
}

/// Renders a whole run as one string.
///
/// Returns rather than prints, so the tests can assert on the bytes and so the
/// exit code can be decided without the output having been written yet.
pub fn render(
    reports: &[CheckReport],
    skipped: &[crate::walk::Skipped],
    options: &RenderOptions,
) -> String {
    let tally = Tally::of(reports);
    let mut out = String::new();

    match options.format {
        Format::Json => json(reports, &mut out),
        Format::Gcc => lines(reports, options, &mut out, |d, path| {
            format!(
                "{}:{}:{}: {}: {} [{}]\n",
                path,
                d.line,
                d.column,
                gcc_severity(&d.severity),
                d.message,
                d.rule
            )
        }),
        Format::Msvc => lines(reports, options, &mut out, |d, path| {
            format!(
                "{}({},{}): {} {}: {}\n",
                path,
                d.line,
                d.column,
                msvc_severity(&d.severity),
                d.rule,
                d.message
            )
        }),
        Format::Github => lines(reports, options, &mut out, |d, path| {
            format!(
                "::{} file={},line={},col={},title={}::{}\n",
                github_severity(&d.severity),
                path,
                d.line,
                d.column,
                d.rule,
                github_escape(&d.message)
            )
        }),
        Format::Pretty => pretty(reports, skipped, options, &tally, &mut out),
    }

    out
}

/// Shared shape for the three line-per-finding formats: every report, every
/// finding, then one optional summary. A compile failure is emitted as its
/// `lua-ast` diagnostic so no format needs a special case for it.
fn lines(
    reports: &[CheckReport],
    options: &RenderOptions,
    out: &mut String,
    line: impl Fn(&AstDiagnostic, &str) -> String,
) {
    for report in reports {
        if let Some(reason) = &report.io_error {
            out.push_str(&format!(
                "error: cannot read {}: {reason}\n",
                report.path.display()
            ));
            continue;
        }
        let path = report.chunk_name.clone();
        for d in report.as_diagnostics() {
            out.push_str(&line(&d, &path));
        }
    }
    if options.summary {
        out.push_str(&summary_line(&Tally::of(reports)));
    }
}

fn pretty(
    reports: &[CheckReport],
    skipped: &[crate::walk::Skipped],
    options: &RenderOptions,
    tally: &Tally,
    out: &mut String,
) {
    let color = options.color;
    for report in reports {
        if let Some(reason) = &report.io_error {
            out.push_str(&paint(
                color,
                RED,
                &format!("error: cannot read {}: {reason}", report.path.display()),
            ));
            out.push('\n');
            continue;
        }
        for d in report.as_diagnostics() {
            // The location is dimmed and the rule name coloured, rather than
            // painting the whole line, so the message stays the loudest thing.
            out.push_str(&paint(
                color,
                DIM,
                &format!("{}:{}:{}:", report.chunk_name, d.line, d.column),
            ));
            out.push(' ');
            out.push_str(&paint(
                color,
                severity_color(&d.severity),
                &format!("{}[{}]", d.severity, d.rule),
            ));
            out.push(' ');

            // The MESSAGE is wrapped too, not only the detail. `lockstep-rng`
            // and `undefined-global` both write paragraphs, and a single
            // 250-character line in a console is unreadable and defeats the
            // point of running a tool instead of reading the file by eye.
            for (i, line) in wrap(&d.message, 88).iter().enumerate() {
                if i > 0 {
                    out.push_str(&paint(color, DIM, "    "));
                }
                out.push_str(line);
                out.push('\n');
            }

            if let Some(detail) = &d.detail {
                for line in wrap(detail, 84) {
                    out.push_str(&paint(color, DIM, &format!("    = {line}\n")));
                }
            }
        }
    }

    if options.show_skipped && !skipped.is_empty() {
        out.push_str(&paint(
            color,
            DIM,
            &format!("\n{} path(s) skipped:\n", skipped.len()),
        ));
        for s in skipped {
            out.push_str(&paint(
                color,
                DIM,
                &format!("    {} -- {}\n", s.path.display(), s.reason),
            ));
        }
    }

    if options.summary {
        out.push_str(&summary_line(tally));
    }
}

fn summary_line(tally: &Tally) -> String {
    if tally.total() == 0 {
        return format!(
            "\nchecked {} file(s): no findings (WormForge {ENGINE_VERSION})\n",
            tally.files
        );
    }
    format!(
        "\nchecked {} file(s): {} error(s), {} warning(s), {} note(s) (WormForge {ENGINE_VERSION})\n",
        tally.files, tally.errors, tally.warnings, tally.infos
    )
}

/// gcc has no `info`. `note` is the level that means "not wrong, worth reading",
/// which is exactly what the advisory findings are.
fn gcc_severity(severity: &str) -> &str {
    match severity {
        Severity::ERROR => "error",
        Severity::WARNING => "warning",
        _ => "note",
    }
}

fn msvc_severity(severity: &str) -> &str {
    gcc_severity(severity)
}

fn github_severity(severity: &str) -> &str {
    match severity {
        Severity::ERROR => "error",
        Severity::WARNING => "warning",
        _ => "notice",
    }
}

/// GitHub workflow commands are comma-delimited, so a comma in a message ends
/// the field early and the rest lands in the wrong place. Percent-encode the
/// characters that would break it.
fn github_escape(message: &str) -> String {
    message
        .replace('%', "%25")
        .replace('\r', "%0D")
        .replace('\n', "%0A")
        .replace(',', "%2C")
}

#[derive(serde::Serialize)]
struct JsonFile {
    path: String,
    /// Set only when the file could not be read; `diagnostics` is empty then.
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    diagnostics: Vec<AstDiagnostic>,
}

#[derive(serde::Serialize)]
struct JsonRoot {
    engine: &'static str,
    files: Vec<JsonFile>,
}

/// JSON reuses `AstDiagnostic` directly rather than a parallel struct, so the
/// field names are the same ones `src/types/wormforge.ts` already parses.
///
/// The diagnostics are cloned because the report owns its findings and the
/// report outlives the serialisation. One clone per finding is cheaper than the
/// JSON string being written twice.
fn json(reports: &[CheckReport], out: &mut String) {
    let files: Vec<JsonFile> = reports
        .iter()
        .map(|report| JsonFile {
            path: report.chunk_name.clone(),
            error: report.io_error.clone(),
            diagnostics: report.as_diagnostics(),
        })
        .collect();
    let root = JsonRoot { engine: ENGINE_VERSION, files };
    match serde_json::to_string_pretty(&root) {
        Ok(text) => out.push_str(&text),
        Err(err) => out.push_str(&format!("{{\"error\":\"could not serialise: {err}\"}}")),
    }
    out.push('\n');
}

/// Greedy word wrap on character count, never mid-word, never dropping words.
fn wrap(text: &str, width: usize) -> Vec<String> {
    let mut out = Vec::new();
    let mut line = String::new();
    for word in text.split_whitespace() {
        if line.is_empty() {
            line.push_str(word);
        } else if line.chars().count() + 1 + word.chars().count() <= width {
            line.push(' ');
            line.push_str(word);
        } else {
            out.push(std::mem::take(&mut line));
            line.push_str(word);
        }
    }
    if !line.is_empty() {
        out.push(line);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::report::check_source;

    fn render_reports(lua: &str, format: Format) -> String {
        render(
            &[check_source(lua, "t.lua")],
            &[],
            &RenderOptions { format, color: false, summary: true, show_skipped: false },
        )
    }

    #[test]
    fn gcc_output_is_one_findable_line_per_finding() {
        let text = render_reports("local x = math.random()\n", Format::Gcc);
        assert!(text.starts_with("t.lua:1:11: error: "), "unparseable: {text:?}");
        assert!(text.contains("[lockstep-rng]"), "{text:?}");
    }

    #[test]
    fn gcc_maps_info_to_note_because_gcc_has_no_info() {
        let text = render_reports(
            "local t = {}\nfor k, v in pairs(t) do print(k, v) end\n",
            Format::Gcc,
        );
        assert!(text.contains(": note: "), "{text:?}");
    }

    #[test]
    fn msvc_output_uses_parentheses() {
        let text = render_reports("local x = math.random()\n", Format::Msvc);
        assert!(text.starts_with("t.lua(1,11): error lockstep-rng:"), "{text:?}");
    }

    #[test]
    fn a_clean_run_says_so_rather_than_printing_nothing() {
        let text = render_reports("local x = 1\n", Format::Pretty);
        assert!(text.contains("no findings"), "{text:?}");
    }

    #[test]
    fn a_syntax_error_reports_as_lua_ast_with_a_line() {
        let text = render_reports("function f()\n", Format::Gcc);
        assert!(text.starts_with("t.lua:2:1: error: "), "{text:?}");
        assert!(text.contains("[lua-ast]"), "{text:?}");
    }

    #[test]
    fn json_names_the_engine_and_round_trips() {
        let text = render_reports("local x = math.random()\n", Format::Json);
        let parsed: serde_json::Value = serde_json::from_str(&text).expect("valid JSON");
        assert_eq!(parsed["engine"], ENGINE_VERSION);
        assert_eq!(parsed["files"][0]["diagnostics"][0]["rule"], "lockstep-rng");
        assert_eq!(parsed["files"][0]["diagnostics"][0]["severity"], "error");
    }

    #[test]
    fn json_matches_the_shape_the_desktop_app_sends() {
        // The app serialises AstDiagnostic with camelCase and omits an absent
        // `detail` entirely. If either changed here the JSON would stop being
        // the same wire format, and a future GUI could not share this parser.
        let text = render_reports("local x = undefined_name\n", Format::Json);
        let parsed: serde_json::Value = serde_json::from_str(&text).unwrap();
        let d = &parsed["files"][0]["diagnostics"][0];
        assert!(d.get("line").is_some());
        assert!(d.get("detail").is_none(), "an absent detail must be omitted, not null: {d}");
    }

    #[test]
    fn github_output_encodes_commas_so_the_field_does_not_run_early() {
        // This message really does contain commas -- "Use wa.random(min, max)" --
        // which is exactly the case that truncates the field if left unescaped.
        let text = render_reports("local x = math.random()\n", Format::Github);
        let finding = text.lines().next().expect("a finding");
        assert!(finding.contains("%2C"), "a comma truncates the message: {finding:?}");
        assert!(finding.contains("min%2C max"), "{finding:?}");
        assert!(
            finding.contains("title=lockstep-rng"),
            "the rule must land in `title`, not in the message: {finding:?}"
        );
    }

    #[test]
    fn the_detail_is_shown_and_wrapped_in_pretty_output() {
        // `wa-namespace-typo` is one of the rules that carries a long-form
        // detail. `lockstep-rng` deliberately does not -- its message is already
        // the explanation -- so testing the detail on the wrong rule would pass
        // for the wrong reason.
        let text = render_reports("local x = wa.repalce(1)\n", Format::Pretty);
        assert!(text.contains("[wa-namespace-typo]"));
        assert!(text.contains("\n    = "), "detail was dropped: {text:?}");
        assert!(
            text.contains("does not exist in WormForge 0.9.11"),
            "wrong detail shown: {text:?}"
        );
        for line in text.lines().filter(|l| l.trim_start().starts_with("= ")) {
            assert!(line.chars().count() <= 92, "not wrapped: {line:?}");
        }
    }

    #[test]
    fn a_long_message_is_wrapped_too_not_just_the_detail() {
        let text = render_reports("local x = math.random()\n", Format::Pretty);
        for line in text.lines() {
            assert!(
                line.chars().count() <= 140,
                "a message ran off the edge of a terminal: {line:?}"
            );
        }
        assert!(text.contains("lockstep-safe"), "{text:?}");
    }

    #[test]
    fn colour_is_never_emitted_in_a_machine_format() {
        for format in [Format::Gcc, Format::Msvc, Format::Github, Format::Json] {
            let text = render_reports("local x = math.random()\n", format);
            assert!(!text.contains('\u{1b}'), "escape in {format:?}: {text:?}");
        }
    }

    #[test]
    fn wrapping_keeps_every_word() {
        let text = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu";
        let lines = wrap(text, 20);
        let rejoined: Vec<&str> = lines.iter().flat_map(|l| l.split(' ')).collect();
        assert_eq!(rejoined, text.split(' ').collect::<Vec<_>>());
        assert!(lines.len() > 1);
    }
}