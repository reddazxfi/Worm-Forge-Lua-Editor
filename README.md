# <img src="public/wormbench-luna.png" width="38" height="38" align="absmiddle" alt="WormBench Luna" /> WormBench Luna

Lua editor and static checker for [WormBench](https://github.com/EdLud/WormBench) mods (Worms Armageddon).

> **New to WormBench modding?** Start with [MODDING.md](MODDING.md). It walks through the mod, component, profile, and `install(ctx)` layout the loader reads.
>
> **Upgrading an API 4 mod?** See [API-5-CHANGES.md](API-5-CHANGES.md) for the 1.0 / API 5 migration list: renamed and removed verbs, new fields, and current generated counts.

## Features

- **Real Lua 5.4 compiler (desktop):** Ships the same `mlua` Lua 5.4 front end as the engine's `crates/lua-host`, so syntax checks match what the game loads.
- **Rust semantic checker:** Runs `full_moon` AST checks on desktop, with a TypeScript fallback in the web build.
- **Desync checks:** Flags lockstep hazards like `math.random` and unordered `pairs()` iteration.
- **Undefined-name checks:** Catches misspelled or undefined globals and fields that compile fine in Lua but crash in-game.
- **Built-in API reference:** Browse engine functions, classes, enums, tables, and constants inside the editor.
- **WormBench autocomplete:** Typing `worm:` or `wa.` lists real engine members with signatures and docs.
- **Scope-aware suggestions:** Ranks autocomplete by scope, so nearby locals outrank engine globals and out-of-scope locals stay hidden.
- **Mod folder editing:** Open a mod folder (`mod.toml` + Lua), edit files in tabs, and save to disk with `Ctrl+S`.
- **Structure-aware formatter:** Re-indents Lua by blocks and brackets while ignoring strings and comments, and reports unbalanced chunks instead of rewriting them.
- **Example mods and templates:** Includes 8 entry points (Agility, Sentry Gun, Keeper Bee, Highlander Rules, Swim Suit, POOZ, Kill The King, and Ripper Star). The `px` entries share the current `px.ports` source so the require graph stays intact.
- **Parameterized Create Mod:** Prompts for behavior switches or weapon values, writes Lua under `code/`, and creates a profile under `profiles/` with those defaults. The loader shows the same fields, and `ctx.option("key")` reads them in Lua.
- **Native desktop app:** Built with Tauri 2 on Windows without bundling Chromium.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl` + `S` | Save the active file to the mod folder |
| `Ctrl` + `Z` / `Ctrl` + `Y` | Undo / redo (history is per-file and survives tab switches) |
| `Ctrl` + `F` | Find in file |
| `F3` | Jump to next match |
| `Tab` | Accept the autocomplete suggestion (`Enter` always inserts a newline) |
| `Esc` | Dismiss the autocomplete popup |

## How Checking Works

On the desktop, a check runs in two stages:

1. **The Lua 5.4 compiler.** Your code goes through the same Lua 5.4 front end the engine uses. It parses the chunk and reports the same syntax errors (`'end' expected (to close 'function' at line 120)`, `no visible label 'nowhere' for <goto>`, malformed numbers). It compiles without executing, so no `wa.*` call runs.
2. **The semantic pass.** The compiler only checks syntax. The semantic pass checks that `worm:hit` is a real verb, flags `math.random` desync risks, and tracks handle types.

If the desktop compiler isn't available (for example, in the web build or an older `.exe`), stage 1 is skipped and only the built-in TypeScript checker runs. The console labels which checker ran.

### Reading the Console

Findings use three severities:

| Severity | Meaning | Appearance |
|---|---|---|
| **Error** | Won't load. | Red gutter dot, red line tint |
| **Warning** | Loads, then misbehaves mid-match. | Amber gutter dot, amber line tint |
| **Info** | Advisory; the code is valid as written. | Light blue gutter dot only |

`Info` covers desync advice, duck-typed handle notices, and the `worm-msg-filter` suggestion. It has its own `Info (n)` filter pill so it doesn't bury warnings.

Click any diagnostic row to jump to the line and expand its full explanation.

### Undefined-Name Detection

Because the compiler doesn't execute your code, invented globals are valid Lua syntax:

```lua
eaea:abstract(asynca)          -- compiles, crashes in-game
inventedclass:dothingy({})     -- compiles, crashes in-game
local e = awasd.ra             -- compiles, crashes in-game
```

A chunk like that loads and then crashes at `InitGraphic`. Because all mods share one Lua state, one bad mod brings down the rest. The editor flags any name that is read without being defined.

It recognizes callback parameters, `for` loop variables, method definitions (`function Worm:ammo(x)` binds `self`), table keys, and global assignments.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Tailwind CSS 4 |
| Bundler | Vite 6 |
| Desktop shell | Tauri 2 (Rust) |
| Lua compiler | `mlua` 0.10 (Lua 5.4, vendored to match the engine build) |
| Language | TypeScript |
| Local dev server | Express (`/api/health` + Vite middleware only, loopback-bound; serves `npx tauri dev`) |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/)
- [Rust](https://rustup.rs/) (`winget install Rustlang.Rustup`)
- Visual Studio Build Tools with **Desktop development with C++** (Windows only)

### Run in Development

```bash
npm install --legacy-peer-deps
npx tauri dev
```

This starts the local dev server and opens the desktop window. The dev server only exists to serve the window during development; it isn't a supported way to run the app.

> **The desktop app is the supported target.** Folder open/save, the Lua 5.4 compiler, the mods list, and Create Mod all require Tauri. The static web build is for browsing and editing single files, and the dev server has no filesystem endpoints.

### Web Build (GitHub Pages)

`.github/workflows/deploy-pages.yml` builds the Vite frontend and deploys `dist` to GitHub Pages on every push to `main`. Enable **Settings -> Pages -> Source: GitHub Actions** once in the repository; the site is then published at:

```text
https://<owner>.github.io/WormBench-Lua-Editor/
```

The web build includes the editor, the API sidebar, and single-file checking. It doesn't include the Rust Lua compiler, folder open/save, the mods list, or Create Mod.

### New Mod Layout

Create Mod writes a mod in the same layout the loader installs:

```text
my_mod/
  mod.toml                  # one component + [[components.options]]
  code/mod.lua              # feature: install(ctx); weapon: { defaults, install }
  profiles/My Mod.toml      # selects the component and stores the chosen values
```

Feature mods default to boolean options, which the loader shows as checkboxes. Weapon mods default to numeric options for values like `ctx.option("bullets")`, and their starter profile places the weapon on F1 with a small stock kit.

Read [MODDING.md](MODDING.md) for the full guide to `return`, `ctx`, `defaults`, profiles, and custom behavior.

### Build the Windows `.exe`

```bat
build-tauri.bat
```

Output path:

```text
src-tauri\target\release\wormbench-code-editor.exe
```

The first build compiles Rust crates and the vendored Lua 5.4 C sources, which takes several minutes.

> **Rebuilding after a TypeScript-only change?** Run `npx tauri build` instead. It reuses the cached Rust build and finishes much faster. `build-tauri.bat` wipes `node_modules` and `dist` and reinstalls from `package-lock.json`; use it for a clean rebuild.

## Project Structure

```text
├── src/
│   ├── components/   # UI components
│   ├── data/         # Engine definitions, templates, generated example corpus
│   ├── services/     # Lexer, parser/checker, formatter, luaCompiler, mod folder, config
│   └── types/        # TypeScript types
├── examples/         # 8 curated entry points (px, utilities, pooz, bees, ripper)
├── API-5-CHANGES.md  # API 4 -> API 5 migration reference
├── src-tauri/
│   ├── src/          # Rust full_moon semantic checker and compile_lua command
│   └── capabilities/ # Plugin permissions (fs, dialog)
├── scripts/          # Engine-data generator and Rust-vs-TS differential sweep
└── server.ts         # Dev-only server (health + Vite middleware, loopback)
```

## Known Limitations

- The semantic checker has two implementations kept in sync: TypeScript and Rust (`full_moon`). A differential sweep runs both over the engine mod corpus on demand; it currently reports 0 real drift, and known differences are listed in the sweep script.
- Syntax checking isn't AST-based on the TypeScript side. Despite the "AST Inspector" label in the UI, that layer is a hand-written tokenizer and two stacks. The Lua 5.4 compiler in the desktop build is the authoritative syntax check.
- The Lua 5.4 compiler requires a current build. An older `.exe` falls back to the built-in parser and reports that in the console.
- Undefined-name checking is scope-aware in the Rust checker and in autocomplete; the TypeScript fallback used in the web build is a flat file-wide pass.
- Unknown-method checks only cover a fixed receiver list (`a`, `actor`, `worm`, `m`, `missile`, `inv`/`store`/`inventory`, `mine`/`drum`/`oil`/`crate`/`grave`/`obj`/`object`). Receivers narrowed by a `.kind` test are treated as a runtime union and reported as `Info` rather than a warning.
- The API sidebar and autocomplete target engine 1.0 (Lua API 5.0) and may lag behind newer engine versions. Use **+ Custom Verb** to add missing verbs; registered verbs feed autocomplete and both checkers, silencing `wa-namespace-typo` warnings. For a namespaced function like `wa.one.two()`, choose **+ New Class**, enter `wa.one` as the namespace/class and `two` as the member (dots belong in the namespace field, not the member name). Custom verbs persist to `custom_verbs.cfg`.
- Built with heavy AI assistance; expect rough edges.

## Contributing

Issues and pull requests are welcome.

> Adding a WormBench verb? Add it to `src/data/wormbenchDefinitions.ts`. That table feeds the docs pane, autocomplete, and unknown-method warnings.

## Development

Six checks are required (`npm run lint` alone isn't enough):

| Command | Checks |
|---|---|
| `npm run lint` | TypeScript types (`tsc --noEmit`) |
| `npm test` | Vitest suite |
| `cd src-tauri; cargo test` | Rust checker |
| `npx tsx scripts/__sweep.ts` | Rust vs TypeScript over the engine mod corpus |
| `npx tsx scripts/genEngineData.ts --check` | Generated engine tables are current |
| `npx tsx scripts/genRecordFields.ts --check` | Generated record-field table is current |

The sweep and the two `--check` scripts catch drift between the two checker implementations or between hand-edited TypeScript tables and their generated Rust copies.

> After a TypeScript-only change, `npx tauri build` is the real runtime check, and it fails with *Access is denied* if the `.exe` is already running. Close the app first.

## License

MIT. See [LICENSE](LICENSE).

Not affiliated with Team17 or Worms Armageddon. This is a third-party tool for the [WormBench](https://github.com/EdLud/WormBench) modding engine, which is MIT-licensed and maintained separately.

<div align="center">

[![128x128-2x.png](https://i.postimg.cc/vBfwbz62/128x128-2x.png)](https://postimg.cc/ZBbML6H6)

</div>
