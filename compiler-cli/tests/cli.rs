//! End-to-end tests: run the real binary, assert on its bytes and its exit code.
//!
//! These exist because the exit code is the contract. A tool that finds problems
//! and returns 0 is worse than no tool -- a CI job goes green over a mod that
//! desyncs, and nobody notices until a match does. So the codes are pinned here
//! rather than trusted from reading the source.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

/// Cargo builds the binary for us and tells us where it is.
const EXE: &str = env!("CARGO_BIN_EXE_wfcheck");

struct Output {
    code: i32,
    stdout: String,
    stderr: String,
}

fn run(args: &[&str]) -> Output {
    let out = Command::new(EXE)
        .args(args)
        .stdin(Stdio::null())
        .output()
        .expect("the binary should run");
    Output {
        code: out.status.code().expect("exit code"),
        stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
    }
}

fn run_stdin(args: &[&str], input: &str) -> Output {
    use std::io::Write;
    let mut child = Command::new(EXE)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("the binary should start");
    child
        .stdin
        .as_mut()
        .expect("stdin was piped")
        .write_all(input.as_bytes())
        .expect("write stdin");
    let out = child.wait_with_output().expect("the binary should finish");
    Output {
        code: out.status.code().expect("exit code"),
        stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
    }
}

fn write_temp(name: &str, contents: &str) -> PathBuf {
    let dir = std::env::temp_dir().join("wfcheck-it");
    std::fs::create_dir_all(&dir).expect("temp dir");
    let path = dir.join(name);
    std::fs::write(&path, contents).expect("write fixture");
    path
}

/// A fresh directory each time, so a test cannot pass on a leftover file.
fn fresh_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(name);
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("make tree");
    dir
}

fn s(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

const CLEAN: &str = "local function onInit()\n  wa.worms.nearest()\nend\n";
const DESYNC: &str = "local x = math.random()\n";
const BROKEN: &str = "function f()\n  return 1\n";
const PAIRS: &str = "local t = {}\nfor k, v in pairs(t) do print(k, v) end\n";
const TYPO: &str = "local x = wa.repalce(1)\n";

#[test]
fn a_clean_file_exits_zero() {
    let path = write_temp("clean.lua", CLEAN);
    let out = run(&[&s(&path), "--no-color"]);
    assert_eq!(out.code, 0, "stderr: {}", out.stderr);
    assert!(out.stdout.contains("no findings"), "{}", out.stdout);
}

#[test]
fn a_desync_error_exits_one() {
    let path = write_temp("desync.lua", DESYNC);
    let out = run(&[&s(&path), "--no-color"]);
    assert_eq!(out.code, 1, "a desync must fail the run");
    assert!(out.stdout.contains("lockstep-rng"), "{}", out.stdout);
}

#[test]
fn a_syntax_error_exits_one_and_names_the_line() {
    let path = write_temp("broken.lua", BROKEN);
    let out = run(&[&s(&path), "--no-color"]);
    assert_eq!(out.code, 1);
    // Lua reports the missing `end` at the end of the chunk, which is line 3.
    assert!(out.stdout.contains(":3:1:"), "{}", out.stdout);
    assert!(out.stdout.contains("lua-ast"), "{}", out.stdout);
}

#[test]
fn an_unknown_flag_exits_two_and_says_which() {
    let out = run(&["--nonsense"]);
    assert_eq!(out.code, 2, "a usage error is 2, not 1");
    assert!(out.stderr.contains("--nonsense"), "{}", out.stderr);
    assert!(out.stderr.contains("--help"), "{}", out.stderr);
}

#[test]
fn a_missing_path_exits_two() {
    let out = run(&["no/such/folder.lua"]);
    assert_eq!(out.code, 2, "stderr: {}", out.stderr);
}

#[test]
fn help_and_version_succeed_and_say_the_engine_version() {
    let help = run(&["--help"]);
    assert_eq!(help.code, 0);
    assert!(help.stdout.contains("wfcheck"), "{}", help.stdout);
    assert!(help.stdout.contains("0.9.11"), "{}", help.stdout);

    let version = run(&["--version"]);
    assert_eq!(version.code, 0);
    assert!(version.stdout.contains("0.9.11"), "{}", version.stdout);
}

#[test]
fn every_listed_rule_is_explained_and_every_rule_is_listed() {
    let list = run(&["--list-rules"]);
    assert_eq!(list.code, 0);
    for rule in wfcheck::rules::RULES {
        assert!(list.stdout.contains(rule.id), "--list-rules is missing {}", rule.id);
        let explained = run(&["--explain", rule.id]);
        assert_eq!(explained.code, 0, "--explain {} failed", rule.id);
        assert!(
            explained.stdout.contains(rule.summary),
            "--explain {} printed something else",
            rule.id
        );
    }
    let missing = run(&["--explain", "not-a-rule"]);
    assert_eq!(missing.code, 2, "an unknown rule is a usage error");
}

#[test]
fn quiet_prints_nothing_but_still_reports_through_the_exit_code() {
    let path = write_temp("quiet.lua", DESYNC);
    let out = run(&[&s(&path), "--quiet"]);
    assert_eq!(out.code, 1);
    assert_eq!(out.stdout, "", "--quiet must print nothing: {:?}", out.stdout);
}

#[test]
fn only_filters_the_findings_and_also_relaxes_the_exit_code() {
    let path = write_temp("only.lua", DESYNC);
    // Filtering to a rule that is NOT present removes everything, so the run
    // must pass. If it exited 1 the filter would be cosmetic only.
    let out = run(&[&s(&path), "--only", "worm-api", "--no-color"]);
    assert_eq!(out.code, 0, "a filtered-out error must not fail: {}", out.stdout);
    assert!(out.stdout.contains("no findings"), "{}", out.stdout);

    let kept = run(&[&s(&path), "--only", "lockstep-rng", "--no-color"]);
    assert_eq!(kept.code, 1);
    assert!(kept.stdout.contains("lockstep-rng"), "{}", kept.stdout);
}

#[test]
fn strict_widens_the_threshold_to_warnings() {
    let path = write_temp("warn.lua", TYPO);
    let relaxed = run(&[&s(&path), "--no-color"]);
    assert_eq!(relaxed.code, 0, "a warning alone must not fail: {}", relaxed.stdout);

    let strict = run(&[&s(&path), "--strict", "--no-color"]);
    assert_eq!(strict.code, 1, "--strict must fail on a warning");
}

#[test]
fn notes_never_fail_a_run_even_under_strict() {
    let path = write_temp("note.lua", PAIRS);
    let out = run(&[&s(&path), "--strict", "--no-color"]);
    assert_eq!(out.code, 0, "advice is not a failure: {}", out.stdout);
    assert!(out.stdout.contains("lockstep-pairs"), "{}", out.stdout);
}

#[test]
fn a_folder_is_walked_recursively_for_lua() {
    let dir = fresh_dir("wfcheck-it-walk");
    std::fs::create_dir_all(dir.join("deep/deeper")).unwrap();
    std::fs::write(dir.join("top.lua"), CLEAN).unwrap();
    std::fs::write(dir.join("deep/mid.lua"), DESYNC).unwrap();
    std::fs::write(dir.join("deep/deeper/leaf.lua"), DESYNC).unwrap();
    std::fs::write(dir.join("deep/notes.txt"), "math.random() in a text file").unwrap();

    let out = run(&[&s(&dir), "--no-color"]);
    assert_eq!(out.code, 1);
    assert!(out.stdout.contains("checked 3 file(s)"), "{}", out.stdout);
    assert!(
        !out.stdout.contains("notes.txt"),
        "a .txt must not be checked: {}",
        out.stdout
    );
}

#[test]
fn exclude_drops_matching_paths() {
    let dir = fresh_dir("wfcheck-it-exclude");
    std::fs::create_dir_all(dir.join("vendor")).unwrap();
    std::fs::write(dir.join("keep.lua"), DESYNC).unwrap();
    std::fs::write(dir.join("vendor/skip.lua"), DESYNC).unwrap();

    let out = run(&[&s(&dir), "--exclude", "vendor", "--no-color"]);
    assert!(out.stdout.contains("checked 1 file(s)"), "{}", out.stdout);
}

#[test]
fn stdin_checks_one_file_under_the_name_it_is_given() {
    let out = run_stdin(&["--stdin", "--filename", "rules.lua", "--no-color"], DESYNC);
    assert_eq!(out.code, 1);
    assert!(out.stdout.contains("rules.lua:"), "{}", out.stdout);
    assert!(out.stdout.contains("lockstep-rng"), "{}", out.stdout);
}

#[test]
fn json_output_is_parseable_and_never_coloured() {
    let path = write_temp("json.lua", DESYNC);
    let out = run(&[&s(&path), "--format", "json"]);
    assert_eq!(out.code, 1);
    assert!(!out.stdout.contains('\u{1b}'), "JSON must not be coloured");
    let parsed: serde_json::Value =
        serde_json::from_str(&out.stdout).unwrap_or_else(|e| panic!("{e}\n{}", out.stdout));
    assert_eq!(parsed["engine"], "0.9.11");
    assert_eq!(parsed["files"][0]["diagnostics"][0]["rule"], "lockstep-rng");
}

#[test]
fn colour_is_off_when_not_a_terminal_which_is_what_a_piped_run_gets() {
    // Every format except `pretty` is read by a program, so an escape code in
    // one of them ends up in somebody's log file. `--color always` must not
    // override that.
    let path = write_temp("colour.lua", DESYNC);
    for format in ["json", "gcc", "msvc", "github"] {
        let out = run(&[&s(&path), "--format", format, "--color", "always"]);
        assert!(
            !out.stdout.contains('\u{1b}'),
            "`--color always` must still not colour a {format} stream"
        );
    }
}

#[test]
fn gcc_output_is_one_line_per_finding_with_a_rule_tag() {
    let path = write_temp("gcc.lua", DESYNC);
    let out = run(&[&s(&path), "--format", "gcc", "--no-summary"]);
    let lines: Vec<&str> = out.stdout.lines().collect();
    assert_eq!(lines.len(), 1, "expected one finding line: {:?}", lines);
    assert!(lines[0].contains(": error: "), "{:?}", lines[0]);
    assert!(lines[0].ends_with("[lockstep-rng]"), "{:?}", lines[0]);
}

#[test]
fn two_runs_over_the_same_tree_produce_identical_bytes() {
    // The promise that makes the JSON diffable in CI, and that keeps a finding
    // from appearing to move between runs.
    let dir = fresh_dir("wfcheck-it-stable");
    std::fs::create_dir_all(dir.join("b")).unwrap();
    std::fs::create_dir_all(dir.join("a")).unwrap();
    for (folder, name) in [("a", "one"), ("a", "two"), ("b", "three")] {
        std::fs::write(dir.join(folder).join(format!("{name}.lua")), DESYNC).unwrap();
    }
    let first = run(&[&s(&dir), "--format", "json"]);
    let second = run(&[&s(&dir), "--format", "json"]);
    assert_eq!(first.stdout, second.stdout, "output is not deterministic");
    assert!(first.stdout.contains("one.lua"), "{}", first.stdout);
}