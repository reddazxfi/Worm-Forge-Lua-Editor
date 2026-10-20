//! `wfcheck` -- check WormForge Lua mods without the app and without the game.
//!
//! Argument parsing is hand written. A crate like `clap` would be the largest
//! dependency in a tool whose entire appeal is being one self-contained file a
//! friend can double-click, and the grammar here is fifteen flags.

use std::path::PathBuf;
use std::process::ExitCode;

use wfcheck::format::{self, Format, RenderOptions};
use wfcheck::walk::{self, WalkOptions};
use wfcheck::{check_file, check_source, rules, ENGINE_VERSION};

const EXIT_CLEAN: u8 = 0;
const EXIT_FINDINGS: u8 = 1;
const EXIT_USAGE: u8 = 2;
const EXIT_INTERNAL: u8 = 3;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();

    let options = match parse(&args) {
        Ok(Some(options)) => options,
        // `--help` and `--version` already printed what was asked for.
        Ok(None) => return ExitCode::from(EXIT_CLEAN),
        Err(message) => {
            eprintln!("wfcheck: {message}");
            eprintln!("Try `wfcheck --help`.");
            return ExitCode::from(EXIT_USAGE);
        }
    };

    // A panic anywhere below is a bug in this tool, not in the mod. Catch it so
    // a shared batch file gets an explanation instead of a Rust backtrace.
    match run(&options) {
        Ok(code) => ExitCode::from(code),
        Err(message) => {
            eprintln!("wfcheck: {message}");
            ExitCode::from(EXIT_INTERNAL)
        }
    }
}

struct Options {
    paths: Vec<PathBuf>,
    walk: WalkOptions,
    format: Format,
    color: bool,
    strict: bool,
    quiet: bool,
    summary: bool,
    show_skipped: bool,
    clear: bool,
    stdin: bool,
    filename: Option<String>,
    only: Vec<String>,
}

fn run(options: &Options) -> Result<u8, String> {
    if options.clear {
        format::prepare_terminal();
    }

    // One process, many files. Spawning a process per file would mean a fresh
    // compile-load cycle each, which is the difference between seconds and
    // minutes over a pack folder.
    let mut reports = Vec::new();
    let mut skipped: Vec<walk::Skipped> = Vec::new();

    if options.stdin {
        let name = options.filename.clone().unwrap_or_else(|| "<stdin>".to_string());
        let mut source = String::new();
        std::io::Read::read_to_string(&mut std::io::stdin(), &mut source)
            .map_err(|err| format!("could not read stdin: {err}"))?;
        reports.push(check_source(&source, &name));
    } else {
        let (files, walked) = walk::collect(&options.paths, &options.walk)?;
        skipped = walked;
        for file in &files {
            reports.push(check_file(file));
        }
    }

    // Applied after collecting, so `--only` works identically for one file and
    // for a folder. Applied before `fails_build`, so filtering out every error
    // also un-fails the build -- otherwise `--only lockstep-pairs` would always
    // exit 1 because of errors the user had chosen not to look at.
    if !options.only.is_empty() {
        for report in &mut reports {
            report
                .diagnostics
                .retain(|d| options.only.contains(&d.rule));
        }
    }

    let text = format::render(
        &reports,
        &skipped,
        &RenderOptions {
            format: options.format,
            color: options.color,
            summary: options.summary,
            show_skipped: options.show_skipped,
        },
    );
    if !options.quiet {
        print!("{text}");
    }

    if reports.iter().any(|r| r.fails_build(options.strict)) {
        Ok(EXIT_FINDINGS)
    } else {
        Ok(EXIT_CLEAN)
    }
}

const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Reads the next argument as a flag's value, advancing past it.
fn need(args: &[String], i: &mut usize, flag: &str) -> Result<String, String> {
    *i += 1;
    args.get(*i)
        .cloned()
        .ok_or_else(|| format!("`{flag}` needs a value"))
}

fn parse(args: &[String]) -> Result<Option<Options>, String> {
    let mut o = Options {
        paths: Vec::new(),
        walk: WalkOptions::default(),
        format: Format::Pretty,
        color: false,
        strict: false,
        quiet: false,
        summary: true,
        show_skipped: false,
        clear: false,
        stdin: false,
        filename: None,
        only: Vec::new(),
    };
    let mut color_mode = "auto".to_string();

    let mut i = 0usize;
    let mut only_paths = false;

    while i < args.len() {
        let arg = args[i].clone();

        // Everything after `--` is a path, so a folder called `-drafts` works.
        if only_paths {
            o.paths.push(PathBuf::from(&arg));
            i += 1;
            continue;
        }

        match arg.as_str() {
            "--" => only_paths = true,
            "-h" | "--help" => {
                print_help();
                return Ok(None);
            }
            "-V" | "--version" => {
                println!("wfcheck {VERSION} (pinned to WormForge {ENGINE_VERSION})");
                return Ok(None);
            }
            "--list-rules" => {
                print_rules();
                return Ok(None);
            }
            "--explain" => {
                let rule = need(args, &mut i, "--explain")?;
                explain(&rule)?;
                return Ok(None);
            }
            "--strict" => o.strict = true,
            "--quiet" => o.quiet = true,
            "--no-summary" => o.summary = false,
            "--show-skipped" => o.show_skipped = true,
            "--clear" => o.clear = true,
            "--stdin" => o.stdin = true,
            "--hidden" => o.walk.skip_hidden = false,
            "--follow-symlinks" => o.walk.follow_links = true,
            "--no-color" => color_mode = "never".to_string(),
            "--color" => color_mode = need(args, &mut i, "--color")?,
            "--filename" => o.filename = Some(need(args, &mut i, "--filename")?),
            "--only" => o.only.push(need(args, &mut i, "--only")?),
            "--exclude" => o.walk.excludes.push(need(args, &mut i, "--exclude")?),
            "--ext" => {
                let ext = need(args, &mut i, "--ext")?;
                o.walk.extensions.push(normalise_ext(&ext));
            }
            "--format" => {
                let name = need(args, &mut i, "--format")?;
                o.format = Format::parse(&name).ok_or_else(|| {
                    format!(
                        "unknown format `{name}` -- try pretty, json, gcc, msvc or github"
                    )
                })?;
            }
            other if other.starts_with('-') && other != "-" => {
                return Err(format!("unknown option `{other}`"));
            }
            _ => o.paths.push(PathBuf::from(&arg)),
        }
        i += 1;
    }

    if !matches!(color_mode.as_str(), "auto" | "always" | "never") {
        return Err(format!(
            "`--color` takes auto, always or never, not `{color_mode}`"
        ));
    }
    if !o.stdin && o.paths.is_empty() {
        // Checking the current directory is what someone who double-clicked the
        // batch file means.
        o.paths.push(PathBuf::from("."));
    }

    // Checked HERE, not inside the walk, so that a mistyped path is reported as
    // the usage error it is (exit 2) rather than as an internal failure (exit 3).
    // A CI job that cannot distinguish "you typed it wrong" from "the tool broke"
    // cannot decide whether to retry.
    for path in &o.paths {
        if !path.exists() {
            return Err(format!(
                "{}: no such file or folder",
                path.display()
            ));
        }
    }

    // An escape code inside a machine format is a bug that only shows up on
    // someone else's machine, so colour is not negotiable for those.
    o.color = o.format == Format::Pretty && format::resolve_color(&color_mode);
    Ok(Some(o))
}

/// `lua` and `.LUA` both mean `.lua`.
fn normalise_ext(ext: &str) -> String {
    let lower = ext.to_lowercase();
    if lower.starts_with('.') {
        lower
    } else {
        format!(".{lower}")
    }
}

/// Returns an error rather than printing, so an unknown rule exits 2 like every
/// other usage mistake instead of exiting 0 with a message on stderr.
fn explain(rule: &str) -> Result<(), String> {
    match rules::find(rule) {
        Some(info) => {
            println!("{}  [defined in {}]", info.id, info.origin);
            println!("{}", info.summary);
            println!();
            println!("Run `wfcheck --only {} <path>` to show only these.", info.id);
            Ok(())
        }
        None => Err(format!("no rule called `{rule}` -- try `wfcheck --list-rules`")),
    }
}

fn print_rules() {
    println!(
        "wfcheck {} -- rules, pinned to WormForge {ENGINE_VERSION}\n",
        VERSION
    );
    for info in rules::RULES {
        println!("  {}", info.id);
        println!("      {}", info.summary);
    }
    println!("\n`wfcheck --explain <rule>` explains one in full.");
}

fn print_help() {
    println!(
        r#"wfcheck {VERSION} -- WormForge Lua checker (engine {ENGINE_VERSION})

USAGE
    wfcheck [OPTIONS] [PATH]...
    wfcheck --stdin --filename rules.lua < rules.lua

    PATH may be a file or a folder; folders are walked recursively for .lua.
    With no PATH, the current directory is checked.

WHAT IT CHECKS
    1. The real Lua 5.4 compiler -- the same one the game uses. Nothing is
       ever executed, only compiled.
    2. Desync rules: math.random, math.cos/sin/atan, unordered pairs(), wa.* typos, worm state
       names, and the rest.
    3. Scope: names read that nothing ever binds, including a local declared in
       a sibling function.

OPTIONS
    --format <fmt>       pretty (default), json, gcc, msvc, github
    --strict             warnings fail the run too, not only errors
    --only <rule>        show only this rule; repeatable
    --explain <rule>     explain one rule in full
    --list-rules         print every rule and exit
    --ext <.lua>         file extension to check; repeatable (default .lua)
    --exclude <glob>     skip these; repeatable. * stops at /, ** does not
    --follow-symlinks    descend into directory symlinks (off by default)
    --hidden             also descend into dot-directories (off by default)
    --stdin              read one file from standard input
    --filename <name>    the name to report for --stdin
    --quiet              print nothing; report through the exit code only
    --no-summary         omit the totals line
    --show-skipped       list what was skipped, and why
    --color <mode>       auto (default), always, never
    --clear              clear the terminal first, for a double-clicked window
    --                   treat everything after this as a path
    -h, --help           this text
    -V, --version        version, and the engine version it is pinned to

EXIT CODES
    0  nothing worth blocking
    1  findings at or above the threshold
    2  bad flag, or a path that could not be read
    3  internal error

    Notes (info) never fail a run, at any setting. They are advice: the code
    runs, it is just not deterministic across peers.

EXAMPLES
    wfcheck mods\mymod
    wfcheck rules.lua --format json > report.json
    wfcheck mods --only lockstep-rng --only lockstep-pairs
    wfcheck mods --format github --strict .      (GitHub Actions)
"#
    );
}