//! Turning the paths a user typed into the list of files to check.
//!
//! Deliberately no dependency. A directory walk with extension filtering and
//! glob excludes is a hundred lines here, against a crate tree for a tool whose
//! whole point is being handed to other people as a single file.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

/// How to expand the paths given on the command line.
pub struct WalkOptions {
    /// File extensions to keep, lowercase and including the dot.
    pub extensions: Vec<String>,
    /// Glob patterns to skip. Matched against the full path AND the bare name,
    /// so `--exclude node_modules` works without the user writing `**\/*`.
    pub excludes: Vec<String>,
    /// Skip directories whose name starts with `.`, on by default: `.git` and
    /// friends hold no Lua and would only slow the walk down.
    pub skip_hidden: bool,
    /// Follow directory symlinks. Off by default: a self-referential link would
    /// otherwise walk forever.
    pub follow_links: bool,
}

impl Default for WalkOptions {
    fn default() -> Self {
        Self {
            extensions: vec![".lua".to_string()],
            excludes: Vec::new(),
            skip_hidden: true,
            follow_links: false,
        }
    }
}

/// One thing that stopped the walk, kept going, and will be reported at the end.
pub struct Skipped {
    pub path: PathBuf,
    pub reason: String,
}

/// Expands `paths` into a sorted, de-duplicated list of files.
///
/// A path naming a file is kept if it passes the filters; a path naming a
/// directory is walked. Output is sorted so two runs over the same tree produce
/// byte-identical results, which is what makes the JSON diffable in CI.
pub fn collect(
    paths: &[PathBuf],
    options: &WalkOptions,
) -> Result<(Vec<PathBuf>, Vec<Skipped>), String> {
    let mut files: BTreeSet<PathBuf> = BTreeSet::new();
    let mut skipped = Vec::new();
    // Canonical directories already entered, so a symlink cycle stops rather
    // than recursing until the stack runs out.
    let mut visited: BTreeSet<PathBuf> = BTreeSet::new();

    for root in paths {
        let meta = match std::fs::metadata(root) {
            Ok(meta) => meta,
            Err(err) => return Err(format!("{}: {err}", root.display())),
        };
        if meta.is_dir() {
            walk_dir(root, options, &mut files, &mut skipped, &mut visited, 0);
        } else if is_excluded(root, &options.excludes) {
            skipped.push(Skipped { path: root.clone(), reason: "excluded".into() });
        } else if !extension_ok(root, &options.extensions) {
            skipped.push(Skipped {
                path: root.clone(),
                reason: format!("not a {}", options.extensions.join(" or ")),
            });
        } else {
            files.insert(root.clone());
        }
    }

    Ok((files.into_iter().collect(), skipped))
}

/// Depth cap. A walk this deep is a mistake or an attack, not a mod pack.
const MAX_DEPTH: usize = 64;

fn walk_dir(
    dir: &Path,
    options: &WalkOptions,
    files: &mut BTreeSet<PathBuf>,
    skipped: &mut Vec<Skipped>,
    visited: &mut BTreeSet<PathBuf>,
    depth: usize,
) {
    if depth > MAX_DEPTH {
        skipped.push(Skipped {
            path: dir.to_path_buf(),
            reason: "deeper than 64 directories -- stopping here".into(),
        });
        return;
    }

    // canonicalize resolves symlinks, so this is where a cycle is caught.
    if let Ok(real) = dir.canonicalize() {
        if !visited.insert(real) {
            return;
        }
    }

    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(err) => {
            skipped.push(Skipped { path: dir.to_path_buf(), reason: err.to_string() });
            return;
        }
    };

    // Sorted so the output does not depend on the filesystem's own order.
    let mut paths: Vec<PathBuf> = entries.filter_map(|e| e.ok()).map(|e| e.path()).collect();
    paths.sort();

    for path in paths {
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        if options.skip_hidden && name.starts_with('.') {
            continue;
        }
        if is_excluded(&path, &options.excludes) {
            continue;
        }

        let meta = match std::fs::metadata(&path) {
            Ok(meta) => meta,
            Err(err) => {
                skipped.push(Skipped { path, reason: err.to_string() });
                continue;
            }
        };

        let is_link = path
            .symlink_metadata()
            .map(|m| m.file_type().is_symlink())
            .unwrap_or(false);

        if meta.is_dir() {
            if is_link && !options.follow_links {
                continue;
            }
            walk_dir(&path, options, files, skipped, visited, depth + 1);
        } else if meta.is_file() && extension_ok(&path, &options.extensions) {
            files.insert(path);
        }
    }
}

fn extension_ok(path: &Path, extensions: &[String]) -> bool {
    match path.extension() {
        Some(ext) => {
            let ext = format!(".{}", ext.to_string_lossy().to_lowercase());
            extensions.contains(&ext)
        }
        None => false,
    }
}

/// True when `path` matches any exclude pattern, as a full path or a bare name.
pub fn is_excluded(path: &Path, excludes: &[String]) -> bool {
    if excludes.is_empty() {
        return false;
    }
    let full = normalize(&path.to_string_lossy());
    let name = path
        .file_name()
        .map(|n| normalize(&n.to_string_lossy()))
        .unwrap_or_default();
    excludes
        .iter()
        .any(|pattern| glob_match(pattern, &full) || glob_match(pattern, &name))
}

/// Backslashes to forward slashes, so one pattern works on Windows and Unix.
fn normalize(path: &str) -> String {
    path.replace('\\', "/")
}

/// Matches a glob against a path. Supports `*`, `?` and `**`.
///
/// `**` matches any number of path segments, so `vendor/**` matches
/// `a/vendor/b.lua` and `**\/target/**` matches `x/y/target/z.lua`. `*` and `?`
/// stop at a `/`, which is what makes `vendor/*` mean "directly inside" rather
/// than "anywhere inside".
pub fn glob_match(pattern: &str, text: &str) -> bool {
    let pattern = normalize(pattern);
    let text = normalize(text);
    let pattern: Vec<&str> = pattern.split('/').collect();
    let text: Vec<&str> = text.split('/').collect();
    match_segments(&pattern, &text)
}

fn match_segments(pattern: &[&str], text: &[&str]) -> bool {
    match pattern.first() {
        None => text.is_empty(),
        Some(&"**") => {
            // `**` may swallow zero segments, or any number of them.
            for skip in 0..=text.len() {
                if match_segments(&pattern[1..], &text[skip..]) {
                    return true;
                }
            }
            false
        }
        Some(&segment) => match text.first() {
            None => false,
            Some(&name) => match_one(segment, name) && match_segments(&pattern[1..], &text[1..]),
        },
    }
}

/// One path segment, where `*` is any run and `?` is exactly one character.
fn match_one(pattern: &str, name: &str) -> bool {
    let p: Vec<char> = pattern.chars().collect();
    let n: Vec<char> = name.chars().collect();
    // Iterative, backtracking on the last `*` seen. Recursing per `*` blows the
    // stack on a long path.
    let (mut pi, mut ni) = (0usize, 0usize);
    let (mut star, mut mark) = (usize::MAX, 0usize);

    while ni < n.len() {
        if pi < p.len() && (p[pi] == '?' || p[pi] == n[ni]) {
            pi += 1;
            ni += 1;
        } else if pi < p.len() && p[pi] == '*' {
            star = pi;
            mark = ni;
            pi += 1;
        } else if star != usize::MAX {
            // Backtrack: let the last `*` swallow one more character.
            pi = star + 1;
            mark += 1;
            ni = mark;
        } else {
            return false;
        }
    }
    while pi < p.len() && p[pi] == '*' {
        pi += 1;
    }
    pi == p.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_plain_name_matches_itself() {
        assert!(glob_match("vendor", "vendor"));
        assert!(!glob_match("vendor", "vendored"));
    }

    #[test]
    fn star_stops_at_a_slash() {
        assert!(glob_match("vendor/*", "vendor/a.lua"));
        assert!(
            !glob_match("vendor/*", "vendor/deep/a.lua"),
            "`*` must not cross a directory boundary"
        );
    }

    #[test]
    fn double_star_crosses_directories() {
        assert!(glob_match("vendor/**", "vendor/a.lua"));
        assert!(glob_match("vendor/**", "vendor/deep/a.lua"));
        assert!(glob_match("**/target/**", "x/y/target/z.lua"));
        assert!(glob_match("**", "anything/at/all.lua"));
    }

    #[test]
    fn question_mark_is_exactly_one_character() {
        assert!(glob_match("a?.lua", "ab.lua"));
        assert!(!glob_match("a?.lua", "abc.lua"));
        assert!(!glob_match("a?.lua", "a.lua"));
    }

    #[test]
    fn backslashes_are_normalised() {
        assert!(glob_match("vendor/*.lua", "vendor\\a.lua"));
        assert!(glob_match("**/vendor/*.lua", "mods\\vendor\\a.lua"));
    }

    #[test]
    fn excludes_match_a_bare_name_as_well_as_a_path() {
        let excludes = vec!["node_modules".to_string()];
        assert!(is_excluded(Path::new("a/b/node_modules"), &excludes));
        assert!(!is_excluded(Path::new("a/b/mods"), &excludes));
    }

    #[test]
    fn no_excludes_excludes_nothing() {
        assert!(!is_excluded(Path::new("anything.lua"), &[]));
    }

    #[test]
    fn extensions_are_matched_case_insensitively() {
        assert!(extension_ok(Path::new("a.LUA"), &[".lua".to_string()]));
        assert!(!extension_ok(Path::new("a.txt"), &[".lua".to_string()]));
        assert!(!extension_ok(Path::new("noext"), &[".lua".to_string()]));
    }
}