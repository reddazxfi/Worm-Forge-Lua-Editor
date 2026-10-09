# 🪱⚡ WormForge Code Studio

> **Elevate your Worms Armageddon modding workflow with a seamless, robust, next-generation Lua development experience.** 🚀

WormForge Code Studio is a **powerful**, **blazing-fast**, and **thoughtfully crafted** code editor designed to **empower** modders to **unlock** the full potential of the WormForge scripting engine. Whether you're a seasoned modder or just getting started, our **cutting-edge** toolkit has you covered. ✨

---

📁[WormForge Repo](https://github.com/ropahektic/WormForge)

---

## 🌟 Key Features

- ✅ **Real Lua 5.4 Compiler (Desktop)** — The desktop app ships the *actual* Lua 5.4 build the game compiles your mods with — the same `mlua` front end as the engine's own `crates/lua-host`. "Does this load?" is now answered by the genuine article, not a lookalike. 🧠
- 🛡️ **Lockstep Guardian™** — Proactively catches desync-prone patterns like `math.random` and unordered `pairs()` iteration, so your mods stay **deterministic** and your multiplayer matches stay **drama-free**. 🛡️
- 🎯 **Runtime-Fatal Name Detection** — Catches names that **compile fine but crash in-game**, before they cost you a whole match. See below. 🚨
- 📚 **Built-in Documentation Pane** — Explore engine functions, classes, enums, and constants without ever leaving your editor.
- ⚡ **WormForge Verb Autocomplete** — Type `worm:` or `wa.` and get the real member list, with signatures and documentation, straight from the engine definitions.
- 📂 **Open / Save Mod Folders** — Open a pack folder (`mod.toml` + Lua), edit its files in tabs, and save straight back to disk with Ctrl+S. 🗂️
- 🧠 **Scope-Aware Suggestions** — Autocomplete is ranked by *where you actually are*. A local declared two lines up always outranks the entire engine API, and a name from an unrelated function never shows up at all. 🎯
- 🧹 **Structure-Aware Format** — Re-indents Lua by blocks and brackets, not by regex guesswork. Strings and comments can't fool it, and it tells you when a chunk doesn't balance instead of silently mangling it. ✨
- 🧩 **Example Mods & Templates** — **29 real packs** bundled in, including Sentry Gun, Keeper Bee, Kill The King, Wormcraft, Live HP, and Highlander variants. 🔫
- 🖥️ **Native Desktop App** — Powered by Tauri for a **lightweight**, **lightning-quick** Windows executable. No bloated Chromium bundle required! 🪶

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl` + `S` | Save the active file back to the mod folder |
| `Ctrl` + `Z` / `Ctrl` + `Y` | Undo / redo — history is per-file and survives tab switches |
| `Ctrl` + `F` | Find in file |
| `F3` | Jump to next match |
| `Tab` / `Enter` | Accept the autocomplete suggestion |
| `Esc` | Dismiss the autocomplete popup |

---

## 🔍 How Checking Works — and Why It Matters

This is the part that separates a mod that loads from a mod that doesn't.

**On the desktop**, a check runs in two stages:

1. **The real compiler.** Your Lua is handed to the same Lua 5.4 front end the game engine uses. It parses the chunk and reports exactly what the engine would report — `'end' expected (to close 'function' at line 120)`, `no visible label 'nowhere' for <goto>`, malformed numbers, and so on. It **compiles without executing**, so nothing runs and no `wa.*` call is ever invoked. 🌟
2. **The semantic pass.** The compiler only knows syntax. It cannot know that `worm:hurt` is a real verb, that `math.random` will desync, or that `obj` is really a worm wearing a WorldHandle costume. That pass catches those.

**If the real compiler can't be reached** — an older `.exe` that predates it, say — stage 1 is skipped and you get the built-in parser alone. The console **always labels which one ran**, so a clean pass from the real compiler never gets confused with a clean pass from the built-in one. Honesty, at scale. ✨

### 🚦 Reading the Console

Findings come in **three** severities, and they are not interchangeable:

| Severity | Meaning | What it looks like |
|---|---|---|
| 🔴 **Error** | It will not load. | Red gutter dot, red line tint |
| 🟠 **Warning** | It loads, then misbehaves mid-match. | Amber gutter dot, amber line tint |
| 🔵 **Info** | An **advisory**. The code is correct as written. | Light blue gutter dot, nothing else |

`info` is the desync advice, the duck-typed-handle notices, and the
`worm-msg-filter` optimisation. These **will not break your match**, so they're
deliberately quiet — a light blue dot, no underline, no line tint. It gets its
own `Info (n)` filter pill so it never buries the warnings you actually need.

**Click any diagnostic row** to jump to the line *and* expand the full
explanation of why it was flagged. 🎯

### 🚨 Runtime-Fatal Name Detection

Because the compiler doesn't *run* your code, a chunk full of invented globals is perfectly valid Lua:

```lua
eaea:abstract(asynca)          -- compiles. dies instantly.
inventedclass:dothingy({})     -- compiles. dies instantly.
local e = awasd.ra             -- compiles. dies instantly.
```

That chunk loads fine and then crashes at `InitGraphic` — and because every mod shares one Lua state, **one bad mod takes every other mod down with it.** The editor flags every name that is read but never defined, so you find out here rather than in a match.

It also understands the Lua you'd actually write: callback parameters, `for` loop variables, method definitions (`function Worm:ammo(x)` binds `self` implicitly), table keys, and plain global assignment. Verified against all 25 Lua files in the engine repo's example packs with **zero false positives**.

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| 🎨 Frontend | React 19 + Tailwind CSS 4 |
| ⚡ Bundler | Vite 6 |
| 🦀 Desktop Shell | Tauri 2 (Rust) |
| 🧠 Lua Compiler | `mlua` 0.10 — Lua 5.4, vendored (identical to the engine's build) |
| 📝 Language | TypeScript |
| 🖥️ Local Dev Server | Express — `/api/health` + Vite middleware only, loopback-bound. Serves `npx tauri dev`; not a way to run the app. |

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) 🟢
- [Rust](https://rustup.rs/) 🦀 (`winget install Rustlang.Rustup`)
- Visual Studio Build Tools with **Desktop development with C++** 🛠️ (Windows only)

### Run in Development
```bash
npm install --legacy-peer-deps
npx tauri dev
```
That starts the local server and opens the desktop window. The dev server exists to
serve the window during development; **it is not a supported way to run the app.** 🪄

> **This is a desktop-only tool.** Folder open/save, the real Lua compiler, the mods
> list and Create Mod all need the desktop app — the browser build of the frontend is
> not a supported target. There are no filesystem endpoints on the dev server.

### Build the Windows `.exe`
```bat
build-tauri.bat
```
Your shiny new executable will be waiting at:
```
src-tauri\target\release\wormforge-code-editor.exe
```
🎉 *(The first build compiles Rust crates **and** the vendored Lua 5.4 C sources, and may take several minutes. Grab a coffee!)* ☕

> 💡 **Rebuilding after a TypeScript-only change?** Use `npx tauri build` instead. It reuses the cached Rust codegen and is dramatically faster — `build-tauri.bat` wipes `node_modules`, `package-lock.json`, and `dist` before starting. Use the full script when something is genuinely wedged.

---

## 📁 Project Structure

```
├── src/
│   ├── components/   # 🎨 UI components
│   ├── data/         # 📚 Engine definitions, templates, the 29 example mods
│   ├── services/     # ⚙️ lexer, parser/checker, formatter, luaCompiler, mod folder, config
│   └── types/        # 🧾 TypeScript types
├── src-tauri/
│   ├── src/          # 🦀 Rust: full_moon semantic checker + the compile_lua command
│   └── capabilities/ # 🔐 Plugin permissions (fs, dialog)
├── scripts/          # 🧪 Engine-data generator + the Rust-vs-TS differential sweep
├── server.ts         # 🔌 Dev-only server (health + Vite middleware, loopback)
└── compacted-context.md  # 🗒️ Engineering log: what was tried, measured, and why
```

---

## ⚠️ Known Limitations

- The semantic checker has **two implementations** kept in step: a TypeScript one and a Rust `full_moon` one. A differential sweep runs both over the engine's whole mod corpus on demand; it currently reports **0 real drift**, plus 4 findings where Rust is deliberately and adjudicated-correctly ahead. 🧪
- Syntax checking is **not AST-based** on the TypeScript side. Despite the "AST Inspector" label in the UI, that layer is a hand-written tokenizer plus two stacks. The real Lua 5.4 compiler in the desktop build is what makes syntax checking authoritative. 🤖
- **The real compiler requires a current build.** An `.exe` predating the compiler silently falls back to the built-in parser, and the console says so.
- One known tokenizer limitation: a **number directly after a dot** (`worm.1111`) breaks tokenizing. If something odd happens there, check that shape first.
- The undefined-name check is **not scope-aware**: a name counts as defined if it's bound *anywhere* in the file, so a forward reference is never flagged. (The *autocomplete* is scope-aware — see Key Features.)
- Missed members on a known handle are not caught — `wa.rndom(1)` (typo for `wa.random`) passes both stages, because `wa` and `w` are legitimately bound names.
- Unknown-method checks only cover a **fixed receiver list** (`a`, `actor`, `worm`, `m`, `missile`, `inv`/`store`/`inventory`, `mine`/`drum`/`oil`/`crate`/`grave`/`obj`/`object`). Receivers narrowed by a `.kind` test are treated as a runtime union and reported as an `info` notice rather than a warning.
- The API sidebar and autocomplete follow engine **0.8.22** and may lag behind newer engine versions.
- Built with heavy AI assistance (vibecoded). Expect rough edges. 🤖

---

## 🤖 Contributing

Contributions are **warmly welcomed**! 💖 Feel free to open an issue or submit a pull request. Together, we can **forge** the future of Worms modding. 🔥

> ⚠️ Adding a WormForge verb? Add it to `src/data/wormforgeDefinitions.ts`. That one table feeds the docs pane, the autocomplete, **and** the unknown-method warnings — three consumers, zero duplication. 🔗

---

## 🧪 Development

Five gates, and **`npm run lint` alone is not enough**:

| Command | Checks |
|---|---|
| `npm run lint` | TypeScript types (`tsc --noEmit`) |
| `npm test` | The vitest suite |
| `cd src-tauri; cargo test` | The Rust checker |
| `npx tsx scripts/__sweep.ts` | Rust vs TypeScript over the engine's mod corpus |
| `npx tsx scripts/genEngineData.ts --check` | The generated engine tables are current |

The last two catch the failure mode no unit test can see: the two checker
implementations silently drifting apart, or a hand-edited data table falling out
of sync with its generated Rust copy. 🧪

> 💡 After a TypeScript-only change, `npx tauri build` is the only real runtime
> check — and it fails with *Access is denied* if the `.exe` is already running.
> Ask the user to close the app; don't kill the process.

---

## 📜 License

MIT. See [LICENSE](LICENSE). ⚖️

Not affiliated with Team17 or Worms Armageddon. This is a third-party tool for the [WormForge](https://github.com/ropahektic/WormForge) modding engine, which is MIT-licensed and maintained separately.

<div align="center">

**Made with ❤️ and a *deep passion* for worms.** 🪱

</div>
