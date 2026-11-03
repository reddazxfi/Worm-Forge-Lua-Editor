# `require` in WormForge API 4

`require` is **engine-provided** in API 4. It is not a `wf-lib` feature, and a
bundle does **not** need to live in `Mods/wf-lib` to use it.

The engine implementation is:

- `crates/lua-host/src/sandbox.rs` — removes the stock loader globals.
- `crates/lua-host/src/modules.rs` — installs the bundle-local `require`, shared
  exports and qualified assets.
- `crates/lua-host/src/bundles.rs` — builds the module catalogue for a selected
  profile and its dependency closure.
- `crates/weapons/src/libraries.rs` — discovers bundles, validates dependency
  closure, exports and asset namespaces.
- `crates/weapons/src/components.rs` — parses `mod.toml`, including
  `dependencies`, `[exports]` and `asset_namespace`.

## What the sandbox removes

These globals are set to `nil` before any bundle runs:

```text
io, os, debug, package,
dofile, loadfile, load, require,
collectgarbage, coroutine
```

`math.random` and `math.randomseed` are also removed. Use `wa.random` for
lockstep-safe randomness.

The engine then installs its own `require` into each bundle environment. There
is no `package.path`, no `dofile`, no `loadfile` and no filesystem API. A pack
therefore cannot load code from another folder, from the game directory or from
the network.

## Two kinds of import

### 1. Bundle-local module

```lua
local util = require("lib/util")
```

This resolves to:

```text
<this bundle>/lib/util.lua
```

It searches only the bundle that owns the calling file. Another bundle's
`lib/util.lua` is invisible, even if both bundles are installed and selected.

A component entry file is allowed to require modules from its own bundle. A
module may require other modules in its own bundle. A module may **not** require
the bundle's entry file; that is reported as an error.

### 2. Shared export

```lua
local trail = require("wf-lib/effects/trail")
```

The `wf-lib/` prefix is a hard-coded shared-import namespace. It does not mean
the provider folder is named `wf-lib`.

The provider declares the public name in its `mod.toml`:

```toml
[exports]
"wf-lib/effects/trail" = "libs/trail.lua"
```

The consumer declares the provider as a dependency:

```toml
dependencies = ["effects.sdk"]
```

The engine looks for the exact export name in:

1. the consumer itself, and
2. the consumer's **direct** `dependencies`.

It does **not** search every installed bundle, and it does not automatically
search transitive dependencies for module imports. If a consumer needs a
module, that provider should be a direct dependency.

Provider modules can require their own exports, because the provider itself is
included in the lookup.

Inside a shared module, relative imports resolve inside the **provider**, not
the consumer:

```lua
-- libs/px_effects.lua inside effects.sdk
local trail = require("wf-lib/effects/trail") -- provider's own export
local hat = require("lib/hat")                -- effects.sdk/lib/hat.lua
```

Its shared imports use the provider's direct dependencies. They do not inherit
the consumer's dependency list.

## Module-name grammar

A require name is **not** a filesystem path. It must follow these rules:

- 1 to 200 bytes.
- `/` separates folders.
- Each segment contains only ASCII letters, digits, `_` or `-`.
- No empty segment.
- No `.` or `..` segment.
- No extension.
- No backslash.
- No drive letter, leading slash or absolute path.

Valid:

```lua
require("lib/util")
require("lib/effects/spark")
require("wf-lib/effects/trail")
```

Invalid:

```lua
require("lib/util.lua")       -- extension
require("libs.trail")         -- dot, not a path separator
require("lib//util")          -- empty segment
require("./lib/util")         -- "." segment
require("../util")            -- ".." segment
require("lib\\util")          -- backslash
require("C:/mods/util")       -- drive
```

The engine maps a bundle-local name to `<name>.lua`. The same grammar applies to
the public name on the left side of `[exports]`. The right side is a
pack-relative Lua entry, not a require name.

Recommended style: lowercase names with `/` and `_`:

```text
lib/px_sprite_builder
libs/trail
wf-lib/effects/trail
```

Windows may hide case mistakes in the filesystem. Use one exact spelling in
code, exports and documentation. Export names are exact and case-sensitive in
the manifest lookup.

`require` loads Lua source only. It does not load `.toml`, `.json`, `.wep`,
images or sounds. Use the appropriate `wa` API for data and assets.

## What a module sees

A module runs once per match, in its own Lua environment:

- It reads the shared globals: `wa`, the standard Lua libraries, and globals set
  by the pack entry.
- Its global writes stay in the module. It does not leak new globals to the
  bundle.
- It gets its own `require`.
- `require` caches the module's return value. A module returning nothing is
  cached as `true`.
- The same cached value is returned to every caller that imports it through the
  same consuming bundle.
- A module that requires itself, directly or through another module, is an
  error naming the chain.

A component file and everything it requires run while `wa` is restricted. A
component file should return data; use `wa` in `install(ctx)` or in functions
called from an engine callback. This is why PX modules keep their load-time code
to constants and pure functions.

Shared module tables are **per consuming bundle**, not globally per game. If two
different bundles import `wf-lib/effects/trail`, each gets its own module
instance and its own private state. All weapons in one bundle share that
bundle's module instance.

During a match, modules are read from the synchronized pack copy. During replay,
they are read from the copy the replay carried, not from whatever is currently
installed.

## `mod.toml`: library manifest

A library bundle is a normal bundle with `format_version = 2` and one or more
exports. It may have no components.

```toml
id = "effects.sdk"
name = "Project X Effects SDK"
version = "0.1.0"
author = "reddaz"
api_version = 4
format_version = 2

asset_namespace = "wf-lib/effects"

[exports]
"wf-lib/effects/trail" = "libs/trail.lua"
"wf-lib/effects/px_effects" = "libs/px_effects.lua"
```

A bundle with **no components and no exports** is rejected:

```text
declares no components
```

If it has exports, it is a valid library even with no components.

`dependencies` is a list of **bundle ids**:

```toml
dependencies = ["effects.sdk"]
```

Rules:

- Every dependency id must be valid and must not be the bundle's own id.
- Duplicate dependency ids are rejected.
- A missing dependency is reported as `library dependency <id> is not installed`.
- Dependencies are transitive for selection and asset closure.
- Exports are looked up only in the owner plus its **direct** dependencies.
- Dependency ids are not folder names and not export names.

## Asset namespace

`asset_namespace` exposes files owned by a library to its dependents:

```toml
asset_namespace = "wf-lib/effects"
```

It must be exactly two segments:

```text
wf-lib/<name>
```

`<name>` follows the module-name grammar. The namespace is separate from module
exports; declaring one does not provide the other.

A consumer may then use qualified paths:

```lua
sprites = {
  "wf-lib/effects/sprites/px_effects/beam.png",
  "wf-lib/effects/sprites/px_effects/spark",
}
```

The engine resolves the path to the provider's folder. The path after the
namespace is provider-relative and follows the normal `inside_pack` safety
rules: no `..`, no absolute path, no drive, no symlink.

Sprite settings come from the provider's `[sprites."..."]` declarations, not
from the consumer's. A qualified file path can be used for pack file references
resolved by the engine: weapon `sprites`, `worm_sprites`, `hold.sheet`, sounds,
panel icons and similar `inside_pack` paths. It does not create a new module
name.

Asset namespaces are resolved from the selected dependency **closure**:

- A namespace is available to a consumer when its provider is in the closure.
- That includes transitive providers for assets.
- Duplicate namespaces in the closure are an error.
- A namespace from a bundle that is installed but outside the selected closure
  is not available.

Module exports are intentionally stricter: use a direct dependency for an
export you require.

## Discovery and folder layout

The engine scans:

```text
Mods/<bundle>/mod.toml
Mods/wf-lib/<bundle>/mod.toml
```

Only these locations are scanned. `wf-lib` is a managed catalogue container;
`Mods/wf-lib` itself is not recursively searched beyond its immediate children.
A top-level local bundle is treated the same as one under `wf-lib`.

Therefore both of these are valid for a local library:

```text
Mods/effects_sdk/mod.toml
Mods/wf-lib/effects_sdk/mod.toml
```

The folder name is only a folder name. Dependencies and exports use the bundle
`id`, so moving `effects_sdk` between those two locations does not break
`require("wf-lib/effects/trail")`.

For catalogue packaging, `wf-lib` is the convention because it is the reserved
library installation namespace. For local development, a top-level folder is
fine.

A bundle id must be installed exactly once:

```text
bundle <id> is installed more than once; keep one copy
```

Two folders with the same manifest `id` are a duplicate, even if their folder
names differ.

## Dependency closure

Selecting a profile selects some components. Those components belong to bundles.
The engine then adds each selected bundle's direct dependencies, then their
dependencies, and so on. That set is the closure.

The closure is used for:

- validating dependencies,
- module and asset lookup,
- freezing the files for online games,
- capturing files for replays.

A library with no components is never selected directly, but it is loaded when a
selected component depends on it.

An installed bundle that is neither selected nor in the closure is not available
to `require` or to qualified asset paths.

## Errors and diagnostics

Representative engine messages:

| Situation | Message |
| --- | --- |
| Invalid require name | `require("x"): use letters, digits, '_' and '-', with '/' between folders and no extension` |
| Empty path segment | `require("x"): empty path segment` |
| Missing local module | `require("lib/x") in <owner>: no lib/x.lua in the pack` |
| Module is a directory | `require("lib/x") in <owner>: lib/x.lua is not a file` |
| Path through symlink | `require("lib/x") in <owner>: lib/x.lua goes through a symlink` |
| Requiring the entry | `require("x"): <entry> is the pack's entry file` |
| Missing shared export | `<owner>: wf-lib/x is not exported by a declared dependency` |
| Two direct providers export the name | `ambiguous library export wf-lib/x` |
| No dependency manifest | `shared imports require a bundle manifest` |
| Require cycle | `require cycle in <owner>: a -> b -> a` |
| Missing dependency | `library dependency <id> is not installed` |
| Duplicate bundle id | `bundle <id> is installed more than once; keep one copy` |
| Duplicate export | `library export wf-lib/x is declared by both A and B` |
| Duplicate asset namespace | `asset namespace wf-lib/x is declared by both A and B` |
| Bad export declaration | `export "x": needs a wf-lib/name and a pack-relative Lua entry` |
| Bad asset namespace | `asset_namespace must be wf-lib/name` |
| Unknown asset namespace | `asset namespace wf-lib/x is not provided by a declared dependency` |
| Asset path escapes | `path must stay inside the pack` |

The exact wording may change between engine versions. The rules are the stable
part.

## Static analysis / compiler CLI rules

A checker or editor should model both resolution modes. It needs the selected
profile's dependency closure, not just a single file.

Suggested pass:

1. Walk `Mods/*/mod.toml` and `Mods/wf-lib/*/mod.toml`.
2. Parse each manifest into:
   - bundle `id`,
   - `dependencies`,
   - `exports` (public name → pack-relative `.lua` entry),
   - `asset_namespace`,
   - `[sprites]`.
3. Reject duplicate bundle ids.
4. Resolve the selected profile and compute the transitive dependency closure.
5. Build `id → bundle root` for the closure.
6. For every Lua file in a selected bundle:
   - Determine its owner bundle and its bundle-relative path.
   - Find every `require("...")` with a literal string.
   - For a name starting with `wf-lib/`, look only in the owner and its
     **direct** dependencies for an exact `[exports]` key.
   - For every other name, validate the grammar and resolve
     `<owner>/<name>.lua`.
   - Reject a module that points at the owner's own entry file.
   - Detect cycles through the resolved module graph.
   - Check that the resolved provider belongs to the closure.
7. For every qualified asset path beginning with `wf-lib/`:
   - Resolve only through the closure's asset namespaces.
   - Check the provider has that namespace.
   - Check the provider-relative path stays inside the provider.
8. Report unresolved/dynamic `require` calls separately. Dynamic names can still
   work in the engine if they follow the grammar, but a static checker cannot
   safely complete them.

Editor completions should offer:

- local module names by walking the current bundle;
- shared export names from the current bundle's direct dependencies;
- qualified asset paths from the closure's namespaces;
- the bundle id for `dependencies`, not the folder name.

The current `wfcheck` pass compiles Lua and checks lockstep/style rules. It does
not yet resolve `require` names or exports. The rules above are the engine
contract a resolution pass should follow.

## Common mistakes

**The provider is installed but not declared.**

```toml
# missing
dependencies = ["effects.sdk"]
```

Result: `wf-lib/effects/trail is not exported by a declared dependency`.

**The consumer imports a transitive dependency directly.**

If A depends on B, and B depends on C, A cannot `require("wf-lib/c/...")`
unless A also declares C. Either declare C directly or let B expose a wrapper.

**The export key does not match exactly.**

```toml
[exports]
"wf-lib/effects/trail" = "libs/trail.lua"
```

The consumer must use `wf-lib/effects/trail`, not `effects/trail`,
`wf-lib/trail` or `wf-lib/effects/trail.lua`.

**A dot is used as a path separator.**

`require("libs.trail")` is invalid. Lua module names in this engine use `/`.
The file is `libs/trail.lua`; the require name is `libs/trail`.

**The provider is outside the selected closure.**

Installing a bundle is not enough. It must be selected or pulled in by a
dependency.

**The module touches `wa` at load time.**

A module file is evaluated while the component is declaring itself. Do not call
`wa.weapons.replace`, `wa.actors.spawn`, `wa.on.*` or `wa.draw.*` at module load.
Return data and use `install(ctx)` or callbacks.

**A symlink is used to share a library.**

Symlinks are refused. A module must be a regular file that travelled with the
pack.

## Examples from this workspace

A top-level library bundle:

```text
Mods/effects_sdk/
  mod.toml
  libs/trail.lua
  libs/px_effects.lua
  sprites/px_effects/...
```

`effects_sdk/mod.toml`:

```toml
id = "effects.sdk"
api_version = 4
format_version = 2
asset_namespace = "wf-lib/effects"

[exports]
"wf-lib/effects/trail" = "libs/trail.lua"
"wf-lib/effects/px_effects" = "libs/px_effects.lua"

[sprites."sprites/px_effects/beam.png"]
[sprites."sprites/px_effects/beam_glow.png"]
[sprites."sprites/px_effects/spark"]
[sprites."sprites/px_effects/glow.png"]
[sprites."sprites/px_effects/cloud.png"]
```

A consumer:

```toml
id = "px.electric"
api_version = 4
format_version = 2
dependencies = ["effects.sdk"]
```

```lua
local fx = require("wf-lib/effects/px_effects")
local trail = require("wf-lib/effects/trail")

fx.install({ trail = true })

wa.weapons.replace({
  sprites = {
    fx.SPARK, fx.BLOB, fx.SMOKE,
    trail.BEAM, trail.GLOW,
  },
})
```

`px_effects` itself requires the SDK's own export:

```lua
local trail = require("wf-lib/effects/trail")
```

That works because the provider is included in its own lookup. It does not need
a dependency on itself.

## FAQ

**Is `require` official API 4?**

Yes. It is installed by the engine's Lua host. `wf-lib` is only one provider
bundle that uses `[exports]`; it is not the source of `require`.

**Do libraries have to be under `Mods/wf-lib`?**

No. `Mods/<bundle>` works. `wf-lib` is the catalogue-managed location and the
conventional place for shared libraries, but the `wf-lib/` prefix in a require
name is only a namespace.

**Can a bundle require another bundle without `dependencies`?**

No. Shared names must be exported by the owner or one of its direct dependencies.

**Can a library have no components?**

Yes, if it has at least one export. A manifest with no components and no exports
is rejected.

**Do all callers share one module instance?**

Within one consuming bundle, yes. Different consuming bundles get separate
instances. This keeps private state isolated per pack.

**Can a module return a table with mutable state?**

Yes, but every caller in that consuming bundle sees the same table. Keep match
state deterministic; do not use `pairs` for simulation order or `math.random`.

**Can a module use `package.loaded`?**

No. `package` is removed. The engine's `require` has its own per-bundle cache.
`package.loaded` in a Fengari harness is only a test convenience, not the game's
module system.

**Can a module require itself or the entry file?**

Self-require and cycles are errors. Requiring the component entry file is an
error.

**Can a module be a symlink?**

No. Symlinks are refused along the path.

**Can a qualified asset path be used outside sprites?**

It uses the engine's pack-file resolver. Sprite settings come from the provider
manifest; the same qualified provider path can be used for other pack files that
use that resolver. Keep sprite sheets listed in the component's `sprites` table
so the claim installs them.

**What happens online or in a replay?**

The selected dependency closure is frozen for the network game, and replays
carry the provider files. A replay does not depend on the currently installed
SDK version.

## Minimal checklist for a library author

- [ ] Give the bundle a stable `id`.
- [ ] Use `api_version = 4` and `format_version = 2`.
- [ ] Put module files in the bundle; do not rely on another bundle's local
      `lib/`.
- [ ] Declare every public module in `[exports]` with a `wf-lib/...` name.
- [ ] Declare `asset_namespace = "wf-lib/<name>"` if the library owns artwork.
- [ ] Declare the provider in the consumer's `dependencies`.
- [ ] Import modules by their exact exported names.
- [ ] List provider-owned sheets in the consumer's `sprites` table.
- [ ] Keep `wa` out of module load time.
- [ ] Test the selected profile, not only the bundle in isolation.

## Minimal checklist for a consumer

- [ ] Add `dependencies = ["<provider id>"]` for every shared export used.
- [ ] Use `require("wf-lib/<namespace>/<module>")`, not a filesystem path.
- [ ] Use `require("lib/<module>")` for local modules.
- [ ] Include provider-owned sprite/asset paths in the component's `sprites`
      table.
- [ ] Do not use `dofile`, `loadfile`, `load`, `package` or symlinks.
- [ ] Restart the game or reload the pack set after changing a library; module
      caches are per match.
