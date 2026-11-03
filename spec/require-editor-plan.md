# Require support in the WormForge editor

Status: implemented in the desktop app (Phases A-D). The resolver lives in
`src-tauri/src/mod_requires.rs`, the command is `check_mod_modules`, and the
front end calls it only from SYNTAX CHECK. Compiler-CLI parity (Phase E) remains
a separate decision.

Goal: the editor understands engine-provided `require` exactly as the engine
does, but only pays for a whole-mod analysis when the user presses
**SYNTAX CHECK**. Tab switches, startup, formatting, snippets, custom-verb edits
and completion must stay single-file work.

Recommended shape in one sentence: **one Rust batch command, invoked only by
SYNTAX CHECK, that parses the open pack plus its dependency closure with
`toml` + full_moon + mlua, caches each file by exact source text, rebuilds the
per-consumer require graph cheaply on every click, and returns file-qualified
diagnostics and completion metadata.**

This document records the verified engine behaviour, the current editor gaps,
the recommended architecture, the failure cases that need tests, and the
decisions still to make. It exists so a later session can continue without
re-reading the engine.

---

## 1. Verified engine contract

Sources checked directly, not just the prose spec:

- `WormForgeNew/crates/lua-host/src/sandbox.rs`
- `WormForgeNew/crates/lua-host/src/modules.rs`
- `WormForgeNew/crates/lua-host/src/bundles.rs`
- `WormForgeNew/crates/weapons/src/libraries.rs`
- `WormForgeNew/crates/weapons/src/components.rs`
- `spec/require.md` (the workspace copy)

The prose spec is broadly accurate. The points that matter for an editor are:

### 1.1 Discovery

`libraries::pack_dirs()` is the only discovery rule:

- Top-level folders under `Mods/` are packs.
- Folders whose name starts with `_` or `.` are ignored.
- A folder named `wf-lib` (case-insensitive) **without its own `mod.toml`** is
  a shelf: its immediate children are packs, and it is not searched more deeply.
- A folder named `wf-lib` **with its own `mod.toml`** is an ordinary single
  pack, not a shelf.
- Only immediate children of the shelf are considered. No recursive scanning.
- `Mods/wf-lib` itself is not a bundle.

`modules::catalogue()` then keeps only manifests where
`declares_components()` is true. That helper is `format_version >= 2`; a v1
pack is not in the catalogue. A v2 bundle with exports and no components is a
valid library.

The editor's resolver should validate the fields that affect `require`
(duplicate ids, dependency ids, export keys/paths, namespaces, format version),
but it should not claim to be the full manifest authority. The game's
`parse_bundle()` rejects many unrelated fields; duplicating every component
option rule here would be a second implementation that drifts. If the resolver
cannot parse the TOML or a require-relevant field is malformed, report it; let
`wfcheck`/the game own the rest.

### 1.2 Manifest fields that matter

`BundleManifest` is parsed with `toml` and rejects unknown fields
(`deny_unknown_fields`). Relevant fields:

- `id`
- `version`, `name`, `author`
- `api_version` (currently 4)
- `format_version` (currently 2)
- `components[]` with `id`, `type`, `entry`
- `dependencies: Vec<String>` (bundle **ids**, not folders)
- `exports: map<public name, pack-relative .lua entry>`
- `asset_namespace: Option<String>`
- `sprites`, other fields irrelevant to `require`

Validation in `parse_bundle()` includes:

- empty id rejected;
- `stock` id reserved;
- `api_version != 4` rejected;
- `format_version != 2` rejected;
- no components **and** no exports rejected (`declares no components`);
- dependency id must be a valid bundle id, not self, no duplicates;
- export name must start with `wf-lib/` and satisfy the module grammar;
- export path must be a pack-relative `.lua` entry;
- namespace must be exactly `wf-lib/<name>`;
- every component has an id and a pack-relative `.lua` entry (needed to choose
  graph roots even if the editor does not duplicate the full component schema).

### 1.3 Dependency closure

`libraries::closure(manifests, seeds)`:

- indexes all manifests by id and **errors on any duplicate id**, even one
  outside the selected closure;
- follows dependencies transitively;
- errors on a missing dependency and on a dependency cycle;
- after the walk, errors if two bundles in the closure declare the same export
  name or the same asset namespace.

The selected profile determines the seeds. For an editor focused on one pack,
the current bundle id is enough as the seed: its dependency closure is exactly
what can satisfy its imports. A library with no components still works as a
seed when the user opens that library directly.

### 1.4 Local modules

For `require("lib/util")`:

```text
<owner bundle root>/lib/util.lua
```

- The owner is the bundle that owns the calling file.
- Other bundles' local `lib/` files are invisible.
- A local module may require other local modules.
- Local require works for v1 packs as well, because `folder_env()` is used with
  an empty catalogue. Shared `wf-lib/...` imports require a v2 manifest.

**Spec correction: the entry-file rule is version-specific.** The prose spec
says a module may not require the bundle's entry file. In the current engine
that is only implemented by `run_entry()`, the v1 path, which passes
`Some(entry)` as `forbidden`. A v2 component is declared through
`bundle_env_libraries()` -> `environment(..., entry=None, ...)`, so `forbidden`
is `None`. Therefore:

- v1 top-level entry requiring itself -> the explicit
  `require("x"): <entry> is the pack's entry file` error;
- v2 component entry requiring itself -> a **require cycle**, because the
  outer `require(module)` has already pushed the loading key;
- v2 component A can require component B's entry. It is loaded and cached; when
  B is later declared, `require` returns the same table. That is poor style but
  it is not an engine error;
- a helper can require an entry that is already cached, but requiring the
  entry while it is still loading is a cycle.

A static checker must not invent a stricter "entry file" rule for v2. Model the
version, the loading stack, and the cache exactly.

Module grammar (`module_path()`):

- 1..200 bytes;
- `/`-separated;
- each segment is ASCII letters, digits, `_` or `-`;
- no empty segment, no `.`/`..`, no backslash, no extension, no drive letter.

`read_module()` then:

- walks each path component and refuses a symlink;
- requires a regular file;
- reads UTF-8 text (invalid UTF-8 is an error).

A static checker must use the real filesystem for this, not a lowercased
in-memory index. On Windows the engine's `std::fs::metadata` is case-insensitive,
so `require("lib/util")` can load `Lib/Util.lua`; on a case-sensitive filesystem
it cannot. Mirror the host OS rather than forcing one spelling. Export keys
remain exact and case-sensitive. For unsaved overlay files, try the exact
normalized path first, then a case-insensitive fallback on Windows, and keep the
path spelling the user actually has in the buffer for display.

### 1.5 Shared exports

For `require("wf-lib/effects/trail")`:

- The name starts with the literal `wf-lib/`.
- The engine looks for the **exact, case-sensitive** key in:
  1. the owner bundle itself, then
  2. each of the owner's **direct** dependencies.
- It does not search transitive dependencies at import time.
- If more than one of those exports the same name, it errors
  `ambiguous library export ...`.
- If none does, it errors
  `<owner>: <name> is not exported by a declared dependency`.
- If the owner has no v2 manifest, it errors
  `shared imports require a bundle manifest`.
- Inside a shared module, `require` belongs to the **provider**, not the
  consumer. Relative imports resolve inside the provider, and shared imports use
  the provider's direct dependencies.
- A provider can require its own export because the provider is included in the
  lookup.
- Export values are pack-relative entries and are loaded without a module name
  lookup; the engine uses the value directly, then applies `read_module()`.

### 1.6 Caching and cycles

- A module runs once per match per consuming bundle, and its return value is
  cached. `nil` is cached as `true`.
- Different consuming bundles get separate module instances.
- The loader detects a cycle only when the same `(provider, relative)` key is
  already in its loading stack. It reports the chain.
- Module files are read lazily when first required, not at catalogue build time.

### 1.7 What is removed

Before any pack runs, the sandbox removes `io`, `os`, `debug`, `package`,
`dofile`, `loadfile`, `load`, `require`, `collectgarbage`, `coroutine`, and
`math.random`/`math.randomseed`. The engine then installs its own `require`.
The editor's existing `KNOWN_GLOBALS` already includes `require`, so it does not
produce an undefined-global warning today; that is not an implementation of
require.

### 1.8 Important editor consequence

The engine's `catalogue()` only includes v2 manifests. A dynamic require, an
indirect require (`local r = require; r(...)`), or a **shared** require from a
v1 pack cannot be resolved statically. Local requires in a v1 pack can still be
resolved from its root. Unresolvable cases must be reported separately, not
guessed.

---

## 2. Current editor architecture and gaps

- `src/services/modFolder.ts` opens exactly one mod folder. `loadDesktopPath()`
  reads only text files, with size/count caps, into a `files` map.
- `src/App.tsx` runs `runSyntaxCheck()` for the active file:
  - on startup,
  - on tab activation (`activateFile`),
  - when `customVerbs` changes,
  - after formatting,
  - after snippet insertion,
  - and from the **SYNTAX CHECK** button.
  It is not called on every keystroke.
- `src/services/luaCompiler.ts` invokes `compile_lua` (mlua, Lua 5.4) and
  `parse_lua_ast` (full_moon + `checks.rs` + `scopes.rs`) per file over IPC.
- `parse_lua_ast` has no knowledge of a bundle, manifest, sibling pack, or file
  path. It returns diagnostics without a file field.
- `src/services/parser.ts` and `src/checks.rs` know that `require` is a Lua
  global, but neither resolves it.
- `src/services/workspaceTree.ts` explicitly does not resolve require; it only
  lists entries and helper files.
- `src/services/modFolder.ts` `parseModManifest()` is a best-effort,
  line-oriented reader for navigation metadata only. It does not read
  `dependencies`, `exports`, or `asset_namespace`, and must not become the
  authoritative resolver.
- `src/data/wormforgeDefinitions.ts` has no `require` function definition, and
  `CodeEditor.tsx` has no completion branch for `require("...")`.
- The mods list already discovers sibling mods, including `wf-lib` shelf
  children, but only keeps id/author/components/profiles for tiles. No Lua from
  siblings is loaded.
- The editor is desktop-only for any filesystem work; the browser build has no
  Tauri runtime.

### 2.1 What "full-mod check" should mean

Recommended: the open bundle plus its dependency closure. Not every installed
mod. Checking unrelated packs would produce noise and would not reflect the
engine's selected-closure rule. If the user opens a library bundle directly,
use that library id as the seed.

---

## 3. Recommended architecture

### 3.1 One batch Rust command, one explicit trigger

Add a single Tauri command, e.g. `check_mod_modules` (final name TBD), that does
the whole full-mod analysis in Rust. Call it **only** from the SYNTAX CHECK
button.

Do not build the resolver in TypeScript:

- full_moon already gives exact literal/string/dynamic distinctions and scope;
- `toml` gives engine-equivalent manifest parsing;
- the filesystem is needed for symlinks, case behavior, and sibling bundles;
- the work must run off the UI thread;
- the existing checker lives in Rust.

`parse_lua_ast` stays the fast single-file path. It is not extended to carry
bundle context.

### 3.2 Inputs

The frontend sends:

```ts
interface ModCheckRequest {
  requestId: number;          // newest-wins / cancellation
  root: string;               // opened mod folder
  modsRoot?: string;          // derived or configured Mods folder
  customVerbs: [string, string][];
  activeFile?: string;
  /** Current bundle text files, especially .lua and mod.toml.
      These are the editor buffers, so unsaved edits are checked. */
  files: { path: string; text: string }[];
}
```

The command should:

1. Derive the Mods root from `root` when possible:
   - if the parent is a `wf-lib` shelf, use the grandparent;
   - otherwise use the parent;
   - use the supplied `modsRoot` only when `root` is inside it.
   If no Mods root can be derived, still check the current bundle's local
   modules and report that shared dependencies could not be located. Do not
   invent missing-export errors from an unknown root.
2. Build an overlay map from `files` for the current bundle. The overlay is
   authoritative for the opened pack, including unsaved new files. Everything
   else is read from disk.
3. Read `.lua` files from the current bundle from the overlay first, then disk
   for files the overlay did not contain (e.g. the app's size cap skipped a
   huge file). Only `.lua` and `mod.toml` matter here.
4. Discover sibling bundles exactly like `pack_dirs()`.
5. Parse manifests with `toml`; keep `format_version`, `id`, `dependencies`,
   `exports`, `asset_namespace`, `components`, and the manifest text for
   line/column reporting.
6. Validate duplicate ids, dependency closure, export/namespace collisions.
7. Parse Lua with full_moon and compile with mlua where needed.
8. Resolve the graph and return diagnostics + metadata.

### 3.3 Outputs

Do not reuse `AstDiagnostic` for file identity; it has no file field and is
shared with the CLI. Return a wrapper:

```ts
interface ModCheckReport {
  ok: boolean;
  /** false when the command was superseded by a newer request */
  cancelled?: boolean;
  checkedRoot: string;
  modsRoot: string | null;
  currentBundle: string | null;
  diagnostics: FileDiagnostic[];
  /** All current-bundle files that were parsed, for stale detection. */
  fingerprints: { path: string; hash: string; length: number }[];
  graph: {
    nodes: number;
    edges: number;
    localModules: string[];
    /** Names visible to the CURRENT bundle: owner + its direct dependencies. */
    sharedExports: { name: string; provider: string; path: string }[];
    dependencyIds: string[];
    dynamicRequires: number;
    unresolved: number;
  };
  /** Symbols for the active file, same shape as AstReport. */
  activeSymbols?: ExtractedSymbols;
}

interface FileDiagnostic {
  file: string;           // current-bundle relative path, or bundle/path
  bundle?: string;        // undefined/current id for the open pack
  dependency?: boolean;   // true when not part of the open pack
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'info';
  rule: string;
  message: string;
  detail?: string;
}
```

The frontend maps `FileDiagnostic` into `SyntaxDiagnostic` with a new optional
`file` field. The dedup key in `services/diagnostics.ts` becomes
`file|line|column|rule`, not `line|column|rule`.

### 3.4 Caching

Cache parsing, not the final graph.

- **Lua extraction cache** keyed by exact source text (plus length/hash for
  lookup; store the source and compare on hit so a collision cannot return
  wrong data). Entry stores:
  - mlua compile result (ok or position/message),
  - full_moon syntax result,
  - literal `require` calls with positions.
  This layer does not depend on custom verbs or bundle context.
- **Analysis cache** for current-bundle files, keyed by source plus a
  custom-verb overlay signature. It stores semantic diagnostics and extracted
  symbols. A changed overlay misses this cache and re-parses; the extraction
  cache above still avoids re-reading the file. This keeps the common case
  (same code, same verbs, press check again) free of parsing.
- **Manifest cache** keyed by exact manifest text. TOML parsing is cheap but
  this still avoids repeated work.
- **No disk-listing cache across checks.** On a button click, re-read
  `mod.toml` files from discovered sibling folders. This makes a newly added
  dependency or an edited sibling manifest show up immediately. Only the
  expensive Lua parse is cached.
- **Graph is rebuilt every full check** from cached per-file analyses. It is
  linear and cheap, and cannot go stale independently of the files.
- Bound the cache (e.g. 128 files / 64 MB, LRU). Keep the active bundle first.
- Invalidate by content, never by path+mtime alone. mtime can be identical on
  coarse filesystems, and the editor's unsaved buffer has no mtime.

### 3.5 Threading and cancellation

- Command is `async` and runs the blocking work inside
  `tauri::async_runtime::spawn_blocking`.
- Keep an `AtomicU64 CURRENT_REQUEST`. On entry, `fetch_max(requestId)`. Before
  parsing each file and before resolving, compare the current value; if a newer
  request exists, return `cancelled: true` without producing a result.
- The frontend already has `checkSeqRef`; use the same monotonic id for full
  checks and keep the existing stale-result guard.
- Also capture a `filesRevision` counter at request time. If the user edits any
  file before the result arrives, either discard the result or mark it stale
  and do not paint its findings as current. A full result computed from a
  different buffer must never silently replace the current file's diagnostics.
- Disable/spin the SYNTAX CHECK button while a full check is running, and ignore
  a second click without incrementing the sequence again.

---

## 4. Resolution algorithm

### 4.1 Catalog

Model a bundle as:

```rust
struct Bundle {
    id: String,
    root: PathBuf,
    folder: String,
    manifest: Option<Manifest>, // None for a v1/legacy pack
    components: Vec<Component>,
    dependencies: Vec<String>,
    exports: BTreeMap<String, String>,
    asset_namespace: Option<String>,
}
```

Build:

1. Discover pack dirs.
2. Read `mod.toml` for each.
3. If `format_version >= 2`, parse with `toml` and validate.
4. If `format_version < 2`, keep as a legacy bundle with no exports/deps. A v1
   pack is **not** part of the module catalogue and must not participate in id
   duplicate detection or dependency resolution; it only gets local-module
   resolution through its own root.
5. Insert v2 bundles into `BTreeMap<id, Bundle>` and record duplicates. A
   duplicate is an engine error even if the duplicate is outside the current
   closure.
6. Compute `closure(current_id)` using the same algorithm as
   `libraries::closure`.
7. Build `id -> bundle` only for closure members; keep the current bundle even
   if it is legacy.

### 4.2 Lua extraction

Use a full_moon visitor that:

- finds calls whose callee is the global name `require`;
- respects lexical shadowing (`local require = ...` suppresses);
- records only the call if its single argument is a string literal, including
  parentheseless `require "x"` and long-string `require [[x]]`;
- decodes Lua string escapes to the actual runtime string;
- records calls with a non-literal argument as `dynamic` with line/column;
- does not treat `obj.require(...)` or `obj:require(...)` as global require;
- does not treat comments as calls (AST makes this free).

This is preferable to regex because it fixes escaped strings, long strings,
shadowing, and method calls in one place.

### 4.3 Graph keys

Resolution depends on the consuming bundle because shared exports use that
bundle's direct dependencies. Use a node key equivalent to the engine's cache
key:

```text
(consumer bundle id, provider bundle id, provider-relative path)
```

For a module loaded by bundle A, each edge is resolved relative to A's manifest.
When A imports a shared module from B, B's own relative/shared requires use B's
manifest. This is not a global graph; it is a per-consumer graph.

### 4.4 Resolve one edge

For a call in file `F` owned by bundle `O` with name `N`:

1. Validate `N` with the exact module grammar. On failure, error at the call
   site with the engine's wording.
2. If `N` starts with `wf-lib/`:
   - if `O` has no v2 manifest -> error `shared imports require a bundle manifest`;
   - scan `O` itself then `O`'s direct dependencies for an exact export key;
   - if zero -> error `... is not exported by a declared dependency`;
   - if two or more -> error `ambiguous library export ...`;
   - provider = matching bundle, relative = export value (must be a valid
     pack-relative `.lua` entry).
3. Else local:
   - provider = `O`;
   - relative = `N + ".lua"`.
4. If this is the **v1** entry and the provider/relative matches it, error
   `require("N"): <relative> is the pack's entry file`. For v2 there is no
   forbidden entry; the loading-stack rule in step 7 is what catches a
   self-require.
5. Read the provider-relative file. On failure, emit the engine-shaped error:
   - no file, not a file, symlink, invalid UTF-8.
6. For a shared provider, use the provider's dependencies for that module's
   subsequent shared imports; use the provider's root for its relative imports.
7. Detect cycles by keeping a loading stack of `(provider, relative)` keys.
8. Missing dependency in the closure is reported at manifest level, not at
   every call site.

### 4.5 Which files to analyze

Recommended policy:

- **Current bundle:** parse every `.lua` file for syntax/semantic diagnostics,
  because the user asked for full-mod parsing. Resolve literal require calls in
  every file too.
- **Dependency closure:** parse only modules actually reached from the current
  bundle's component entries (plus the active file if it is not reachable).
  Do not run the semantic/desync checker over dependency code; report only
  syntax errors and require/manifest errors there. This avoids flooding the
  console with unrelated findings from an official library.
- **Active file:** always analyze it even if it is not a component entry, so a
  user editing a helper gets feedback. If it is not reachable, the console can
  add an info line saying so.
- **Component entries:** use each declared component entry as a graph root. This
  mirrors what the engine actually loads when the profile selects those
  components. A cycle or missing require in a helper that no entry reaches is
  still visible because the helper itself is parsed, but is not treated as a
  fatal load error unless it is the active file or reachable.

Severity follows reachability: an unresolved require on a reachable entry or
the active file is an **error**; the same finding in an unreachable helper is a
**warning** with a short note that the engine only hits it if that file is
required. This keeps the console honest without hiding latent broken helpers.

This policy is a decision to confirm (see section 10).

### 4.6 Dynamic and indirect calls

- Literal string -> resolve as above.
- Non-literal -> `require-dynamic` **info**, not error. The engine may accept it
  at runtime if the resulting string follows the grammar.
- `local r = require; r("x")` or passing `require` around -> cannot be resolved;
  report once as info (`require-indirect`) or leave silent. Do not guess.
- A shadowed `require` -> no finding.

### 4.7 Asset namespaces

`asset_namespace` is not part of `require`, but the same catalog already knows
it. Two options:

- Phase 1: return namespace metadata for completion only, validate nothing.
- Phase 2: validate qualified `wf-lib/...` strings in known engine fields
  (`sprites`, `worm_sprites`, `hold.sheet`, sounds, panel icons, etc.) against
  the closure's namespaces.

Recommendation: do not mix this into the first require pass. The string-to-field
mapping is a separate, riskier piece of analysis. Return the namespaces in the
graph summary now so completion can offer them safely.

### 4.8 Rule ids

Use stable rule ids so the console filters and tests can target them. Proposed:

| Rule | Meaning |
| --- | --- |
| `require-invalid-name` | name fails the engine grammar |
| `require-missing-local` | no `<name>.lua` in the owner |
| `require-not-file` | path resolves to a directory or non-file |
| `require-symlink` | path goes through a symlink |
| `require-entry` | v1 entry-file self-import |
| `require-missing-export` | no matching export in owner/direct deps |
| `require-no-manifest` | shared import from a pack with no v2 manifest |
| `require-ambiguous-export` | two direct providers export the name |
| `require-cycle` | cyclic loading chain |
| `require-dynamic` | non-literal argument; cannot be verified |
| `require-indirect` | `require` aliased/passed around; cannot be verified |
| `bundle-invalid-toml` | manifest does not parse |
| `bundle-invalid-dependency` | dependency id malformed/self/duplicate |
| `bundle-missing-dependency` | dependency id not installed |
| `bundle-dependency-cycle` | dependency graph cycle |
| `bundle-duplicate-id` | two installed bundles share an id |
| `bundle-duplicate-export` | closure has two providers for one export |
| `bundle-duplicate-namespace` | closure has two asset namespaces |
| `bundle-invalid-export` | export key/path does not match the grammar |
| `bundle-invalid-namespace` | namespace is not `wf-lib/<name>` |

Dynamic and indirect findings are **info** by default. A finding in an
unreachable current-bundle helper is **warning**; reachable/active findings are
**error**. Manifest findings are errors.

### 4.9 Line/column reporting

- Full_moon gives exact call positions.
- `toml` 0.8 exposes spans on parse errors; use them. For semantic manifest
  errors (duplicate id, bad dependency), keep the manifest text and either use
  `toml::Spanned` or a small field-locator to point at the key. If a precise
  line is impossible, line 1 is acceptable but must be documented.
- File-level manifest findings should name the manifest path in the message.

---

## 5. UI integration

### 5.1 Split the check paths

In `src/App.tsx`:

- Keep the current `runSyntaxCheck` logic as **`runFileCheck`** (single active
  file, `compileWithEngine` + `parseWithAst`).
- Add **`runFullModCheck`** used only by the SYNTAX CHECK button.
- `activateFile`, the `customVerbs` effect, startup, formatting and snippet
  insertion call `runFileCheck`.
- The button calls `runFullModCheck` when desktop + a mod folder is open;
  otherwise it falls back to `runFileCheck` and logs why the module graph was
  not checked.
- Keep the visible label **SYNTAX CHECK** for continuity, but set a tooltip such
  as "Check the active file and resolve this mod's require graph". When no mod
  folder is open, the tooltip should say it is a file check only.
- A full check must not be triggered by:
  - typing,
  - tab switches,
  - completion,
  - formatting,
  - snippets,
  - custom verb changes,
  - save,
  - scrolling.
  The current code already does not parse on every keystroke; preserve that.

### 5.2 State

```ts
interface FullCheckState {
  report: ModCheckReport;
  snapshot: Map<string, string>; // file path -> content hash at check time
  stale: boolean;
}
```

- On edit, compare changed paths against the snapshot and mark `stale`; do not
  silently present old cross-file findings as current.
- On tab switch, if the full check is fresh, show that file's findings from the
  full report. If stale, run `runFileCheck` for the active file and show the
  fresh single-file findings; keep the old graph findings visibly marked stale
  until the next SYNTAX CHECK.
- A full report is a first-class **Mod check** view. Clicking a diagnostic from
  that list switches files but keeps the mod-wide list; an ordinary tab click
  returns to the **File check** view. Do not let `activateFile`'s usual
  single-file check silently replace a fresh full report.
- If a full check is superseded, discard its result (existing `checkSeqRef`
  pattern).

### 5.3 Diagnostics list

- Add `file?: string` and maybe `dependency?: boolean` to
  `SyntaxDiagnostic`.
- Update `mergeDiagnostics`' dedup key to include `file`.
- `ConsoleOutput` shows `path:line:column` when `file` differs from the active
  file.
- The editor gutter must only receive diagnostics for `activeFile`; the console
  receives the mod-wide list. Derive `activeDiagnostics` in App rather than
  passing the whole full report to `CodeEditor`, or a line-12 error in another
  file will paint line 12 of the current file.
- `onSelectDiagnostic`:
  - current-bundle file -> `activateFile(file)` then jump;
  - dependency file -> do not silently jump into the wrong file; log that it
    belongs to another bundle, or (later) offer to open that bundle.
- The verdict banner should say **full mod check** vs **file check** so a clean
  file cannot be mistaken for a clean mod. Add a `checkScope: 'file' | 'mod'`
  state alongside `checkEngine`.
- Log a summary:
  `[Mod Check]: N files parsed, M modules, X shared exports; 0 errors`.
- If the command is unavailable (browser, old exe), keep the current per-file
  result and add an info diagnostic/log telling the user to rebuild the EXE.

### 5.4 Completion

- Add a `require` entry to `BUILTIN_FUNCTIONS` with docs and an example, **but
  guard the `wa.` member branch**. That branch currently assumes every entry is
  `wa.*` and strips the prefix; a bare `require` entry would otherwise appear as
  `wa.require`. Either add a `fn.name.startsWith('wa.')` guard there or keep a
  separate globals list.
- Add a `require("...")` / `require '...'` completion branch in
  `CodeEditor.tsx`, before the "prose inside a string" bailout.
- Local module names:
  - derived from the current `files` map (cheap, no disk);
  - strip `.lua`, normalize slashes;
  - exclude the active file's own module name;
  - sort and dedupe.
- **Module-name insertion is not the generic word insertion.** A module name
  contains `/` and may contain `-`, while `planInsertion()` only replaces
  `[A-Za-z0-9_]*` before the caret. Add a dedicated plan that replaces from the
  start of the current path segment (the character after the last `/`) with the
  remaining path. Test at least:
  - typed `lib/ut` + `lib/util` -> `lib/util`;
  - typed `lib/ef` + `lib/effects/trail` -> `lib/effects/trail`;
  - typed `lib/foo-` + `lib/foo-bar` -> `lib/foo-bar`;
  - typed `wf-lib/effects/tr` + `wf-lib/effects/trail` -> the same.
  A naive full-name insertion doubles the prefix.
- Shared exports:
  - only from the last successful full-check report (or a dedicated manifest
    cache populated by that check);
  - never scan sibling mods on a keystroke;
  - if no full check has run, offer local names only rather than stale guesses.
- Dependency ids in `mod.toml`:
  - offer ids only when a catalog is already cached from a full check;
  - otherwise leave the normal TOML editing alone.
- Completion must not trigger `runFullModCheck`.

### 5.5 Docs pane

- Add `require` documentation: local vs shared, grammar, dependency directness,
  provider context, cycle/entry errors, and the fact that `wa` is unavailable
  while a component file and its modules load.
- Do not add an asset-path check in the docs until that behavior is implemented.

---

## 6. Performance targets and guardrails

- The single-file path must stay as fast as today; no sibling reads, no TOML,
  no module graph.
- The full path may take longer, but must:
  - run off the UI thread;
  - report progress/cancel cleanly when superseded;
  - parse only text files, not images/sounds;
  - parse only `.lua` in the current bundle and reached `.lua` in dependencies;
  - reuse unchanged files from the source cache.
- Warm full check target: graph assembly over an already-parsed `red_saw` /
  `px_electric` closure in well under a second. Cold check is dominated by
  full_moon/mlua on the current pack.
- Never use `cargo clippy --fix`; never weaken desync checks to make this pass.
- Do not add a full-mod scan to boot. A large pack must still open at the same
  speed as today.

---

## 7. Reliability matrix

These are the required behaviours. Most should be Rust unit tests over a
temporary Mods tree, mirroring the engine's own tests.

### Discovery / manifests

1. `Mods/a/mod.toml` and `Mods/wf-lib/a/mod.toml` are both discovered.
2. `_off`, `.off`, `Mods/wf-lib/_off`, and nested folders are ignored.
3. A `wf-lib` folder with its own `mod.toml` is a single pack, not a shelf.
4. Duplicate bundle ids are rejected, including across local and wf-lib.
5. Missing dependency is rejected.
6. Dependency cycle is rejected.
7. Duplicate export name in the closure is rejected.
8. Duplicate asset namespace in the closure is rejected.
9. Invalid dependency id/export key/entry is rejected.
10. A v1 pack still allows local require but shared require gives
    `shared imports require a bundle manifest`.

### Names and files

11. `require("lib/util")` finds `lib/util.lua`.
12. Invalid names are rejected: extension, dot, empty segment, `.`, `..`,
    backslash, drive letter, leading slash, >200 bytes, spaces.
13. Missing module, directory instead of file, symlink path, and invalid UTF-8
    produce the engine-shaped error.
14. A v1 top-level entry requiring itself reports the explicit entry-file
    error.
15. A v2 component requiring its own entry reports a cycle, not the v1 entry
    error. A v2 component may require a different component's entry and get the
    same cached table when that component is declared later.
16. Long-string and parentheseless require forms work.
17. Escaped strings decode before resolution.
18. `require` in a comment is ignored.
19. `obj.require("x")` and `obj:require("x")` are not treated as global require.
20. `local require = ...` shadows the engine require and suppresses findings.
21. Dynamic argument yields info, not an error.
22. `local r = require; r("x")` is reported as indirect/unresolved, not guessed.

### Shared exports

23. Owner export resolves.
24. Direct dependency export resolves.
25. Transitive-only export fails with the direct-dependency message.
26. Missing export fails.
27. Two direct providers exporting the same name fail as ambiguous.
28. Provider's relative import resolves in the provider, not the consumer.
29. Provider's shared import uses the provider's dependencies, not the consumer's.
30. Provider can require its own export.
31. Export key case matters; a case mismatch fails.
32. Export path is read as a pack-relative `.lua` file, not through module-name
    grammar lookups.

### Graph / cycle

33. Direct self-cycle reports a chain.
34. Two-module cycle reports a chain.
35. A repeated import (diamond) is not a cycle.
36. Same module in two consuming bundles is two nodes/instances, not one cache
    entry.
37. The same provider module reached through different consumers resolves
    relative imports correctly.
38. A cycle only reachable from an unused helper is classified according to the
    chosen policy (documented; see section 10).

### Editor integration

39. Startup/tab switch/format/snippet/verb change never invokes the full command.
40. SYNTAX CHECK invokes it exactly once per press.
41. A second press while running cancels the first or is ignored.
42. A result arriving after a newer check is discarded.
43. Unsaved buffer text is what gets checked, not stale disk text.
44. A no-op save does not change results; a changed save does.
45. Full-check diagnostics from another current-bundle file activate that file
    on click.
46. Dependency diagnostics do not jump into the wrong file.
47. Full-check diagnostics are marked stale after an edit; the next full check
    clears it.
48. Merged diagnostics dedup by file as well as line/column/rule.
49. Completion offers local modules from `files`.
50. Completion offers shared exports only after a full check or a
    current-manifest export cache exists.
51. Completion never scans sibling packs on a keystroke.
52. Require completion replaces the current path segment, not just the last
    identifier: `lib/ef` -> `lib/effects/trail`, `lib/foo-` -> `lib/foo-bar`,
    and `wf-lib/effects/tr` -> `wf-lib/effects/trail` all produce one prefix.

### Corpus

53. `px_electric`, `red_saw`, and `effects_sdk` resolve cleanly, including:
    - `red_saw` -> `effects.sdk`, `px.electric`, `wf.sdk`;
    - `px_electric` -> `effects.sdk`;
    - provider-relative imports inside `effects_sdk`.
54. Add a deliberately broken copy for each error class and assert the message.
55. Run the same fixtures through the compiler CLI if the shared resolver is
    added there.

---

## 8. Phased implementation

### Phase A - Rust resolver core (no UI)

- Add `toml = "0.8"` to `src-tauri/Cargo.toml` (matching the engine's minor).
- Add `src-tauri/src/mod_requires.rs` (name TBD) with:
  - module grammar;
  - manifest structs and validation;
  - `pack_dirs`-equivalent discovery;
  - closure;
  - full_moon require visitor;
  - resolver + cycle detection;
  - tests from section 7.
- Do not touch `checks.rs`/`scopes.rs` except to expose helpers if absolutely
  necessary. Keep them vendored and hash-identical to the CLI copies.

### Phase B - Batch command and cache

- Add `check_mod_modules`/`check_mod` command in `main.rs`.
- Add source/manifest caches and request cancellation.
- Run with `spawn_blocking`.
- Reuse one `mlua::Lua` instance for all compiles in the batch. `compile_lua`
  creates a Lua per file because it is a one-file command; a full check should
  not pay that setup cost for every file. Keep the Lua inside the blocking
  closure so the future stays `Send`.
- Return `ModCheckReport`.
- Add an integration test that builds a temporary Mods tree and checks the
  serializable result.
- Keep `parse_lua_ast` and `compile_lua` unchanged for the single-file path.

### Phase C - App wiring

- Split `runSyntaxCheck` into `runFileCheck` + `runFullModCheck`.
- Button calls the full path; all other triggers stay single-file.
- Add `file` to `SyntaxDiagnostic`; update merge/dedup, console rows, and
  navigation.
- Add `checkScope` state and logs.
- Stale-snapshot handling.
- Browser/old-exe fallback.

### Phase D - Completion and docs

- Add `require` to engine definitions.
- Add the string completion branch for local modules and cached shared exports.
- Add docs pane content.
- Update `spec/require.md` or this plan with the editor's actual policy.

### Phase E - Compiler CLI parity (recommended, separate decision)

- Add the same `mod_requires.rs` to `compiler-cli` as a vendored copy, or make
  the resolver a small shared module with a documented copy policy.
- Teach `wfcheck` to detect a pack folder with `mod.toml`, derive its Mods root,
  and resolve the current pack + closure. Keep `--stdin` and single-file checks
  unchanged.
- Add `--mods-root` / `--no-require` flags only if the automatic detection is
  ambiguous.
- Copy regenerated files to the external `D:\PXPortingModsToWF\compiler-cli`
  only after confirming which tree is canonical.

### Phase F - Release validation

- `npx tsc --noEmit`
- `npm test`
- `npm run build`
- app `cargo check` / `cargo test`
- CLI `cargo test`
- `wfcheck --strict` on the three require packs
- Desktop smoke test against `D:\Worms Armageddon\WormForge\Mods`
- Rebuild the portable EXE (the existing one is stale for new capabilities)
- In-game load of the selected profile

---

## 9. File-by-file impact (expected)

- `src-tauri/Cargo.toml` - add `toml`.
- `src-tauri/src/main.rs` - new command registration.
- `src-tauri/src/mod_requires.rs` (new) - resolver, cache, tests.
- `src/services/luaCompiler.ts` - new `checkModModules()` client; types.
- `src/types/wormforge.ts` - optional `file`/`dependency` on
  `SyntaxDiagnostic`.
- `src/services/diagnostics.ts` - file-aware dedup key.
- `src/App.tsx` - split check paths, button state, full report state, stale
  handling, navigation.
- `src/components/ConsoleOutput.tsx` - file labels and check-scope wording.
- `src/components/CodeEditor.tsx` - require string completion.
- `src/data/wormforgeDefinitions.ts` - `require` docs/completion.
- `src/services/workspaceTree.ts` - comments/possible future graph display; do
  not make it depend on disk.
- `compiler-cli/src/mod_requires.rs` (new, if Phase E) + `Cargo.toml` + `lib.rs`
  + `bin/wfcheck.rs` + tests.
- `spec/require-editor-plan.md` - this document.

---

## 10. Decisions taken for this implementation

1. **Full-check diagnostics scope.** Every current-bundle Lua file is parsed
   and gets syntax/semantic/desync findings; every literal require in the
   current bundle is resolved. Dependency modules are parsed only when reached,
   and only for syntax/manifest/require findings (no desync/style noise).
2. **Unreachable helpers.** Parsed, and their own requires resolved, but their
   findings are warnings. Component entries, the v1 entry and the active file
   are reachable and produce errors.
3. **Asset namespaces.** Returned in the graph summary for completion; not yet
   validated against qualified asset paths.
4. **Compiler CLI.** Not part of this patch. The app path is proven by the Rust
   tests; `wfcheck` can adopt the same module later.
5. **Dependency file navigation.** Dependency diagnostics show
   `bundle/path:line:column` and log that the file belongs to another installed
   bundle instead of jumping into the open mod.

The resolver also caches nothing across checks yet. Parsing is keyed by source
content in the plan, but the first implementation rebuilds the graph on every
SYNTAX CHECK; that is linear over the closure and keeps unsaved buffers
authoritative. A content cache can be added without changing the UI contract.
