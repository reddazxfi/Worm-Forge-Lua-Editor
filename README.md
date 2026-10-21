

# 🪱⚡ WormForge Code Studio
> **Elevate your Worms Armageddon modding workflow with a seamless, robust, next-generation Lua development experience.** 🚀

WormForge Code Studio is a **powerful**, **blazing-fast**, and **thoughtfully crafted** code editor designed to **empower** modders to **unlock** the full potential of the WormForge scripting engine. Whether you're a seasoned modder or just getting started, our **cutting-edge** toolkit has you covered. ✨

---

📁[WormForge Repo](https://github.com/ropahektic/WormForge)

---

## 🌟 Key Features

- ✅ **Real Lua 5.4 Compiler (Desktop)** — The desktop app ships the *actual* Lua 5.4 build the game compiles your mods with — the same `mlua` front end as the engine's own `crates/lua-host`. "Does this load?" is now answered by the genuine article, not a lookalike. 🧠
- ⛓️ **Strict Parser** — Featuring rust::full_moon checks with TypeScript as a fall-back for extra reliability.
- 🛡️ **Lockstep Guardian™** — Proactively catches desync-prone patterns like `math.random` and unordered `pairs()` iteration, so your mods stay **deterministic** and your multiplayer matches stay **drama-free**. 🛡️
- 🎯 **Runtime-Fatal Name Detection** — Catches names that **compile fine but crash in-game**, before they cost you a whole match. See below. 🚨
- 📚 **Built-in Documentation Pane** — Explore engine functions, classes, enums, and constants without ever leaving your editor.
- ⚡ **WormForge Verb Autocomplete** — Type `worm:` or `wa.` and get the real member list, with signatures and documentation, straight from the engine definitions.
- 📂 **Open / Save Mod Folders** — Open a pack folder (`mod.toml` + Lua), edit its files in tabs, and save straight back to disk with Ctrl+S. 🗂️
- 🧠 **Scope-Aware Suggestions** — Autocomplete is ranked by *where you actually are*. A local declared two lines up always outranks the entire engine API, and a name from an unrelated function never shows up at all. 🎯
- 🧹 **Structure-Aware Format** — Re-indents Lua by blocks and brackets, not by regex guesswork. Strings and comments can't fool it, and it tells you when a chunk doesn't balance instead of silently mangling it. ✨
- 🧩 **Example Mods & Templates** — **7 focused packs** bundled in: Agility, Sentry Gun, Spawn Bees, Highlander Rules, Swim Suit, POOZ, and Kill The King. One clear idea per pack, not a copy of the engine's whole example tree. 🔫
- 🖥️ **Native Desktop App** — Powered by Tauri for a **lightweight**, **lightning-quick** Windows executable. No bloated Chromium bundle required! 🪶

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl` + `S` | Save the active file back to the mod folder |
| `Ctrl` + `Z` / `Ctrl` + `Y` | Undo / redo — history is per-file and survives tab switches |
| `Ctrl` + `F` | Find in file |
| `F3` | Jump to next match |
| `Tab` | Accept the autocomplete suggestion (Enter always inserts a newline) |
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

Because the compiler doesn't *run* your code, a chunk full of invented globals is perfectly valid Lua. Not anymore! Proper scoping now catches the following errors!

```lua
eaea:abstract(asynca)          -- compiles. dies instantly.
inventedclass:dothingy({})     -- compiles. dies instantly.
local e = awasd.ra             -- compiles. dies instantly.
```

That chunk loads fine and then crashes at `InitGraphic` — and because every mod shares one Lua state, **one bad mod takes every other mod down with it.** The editor flags every name that is read but never defined, so you find out here rather than in a match.

It also understands the Lua you'd actually write: callback parameters, `for` loop variables, method definitions (`function Worm:ammo(x)` binds `self` implicitly), table keys, and plain global assignment. Verified against the engine repo's example packs with **zero false positives**.

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

> 💡 **Rebuilding after a TypeScript-only change?** Use `npx tauri build` instead. It reuses the cached Rust codegen and is dramatically faster — `build-tauri.bat` wipes `node_modules` and `dist`, then installs exactly what `package-lock.json` pins. Use the full script when something is genuinely wedged.

---

## 📁 Project Structure

```
├── src/
│   ├── components/   # 🎨 UI components
│   ├── data/         # 📚 Engine definitions, templates, the generated example corpus
│   ├── services/     # ⚙️ lexer, parser/checker, formatter, luaCompiler, mod folder, config
│   └── types/        # 🧾 TypeScript types
├── examples/         # 🧩 7 curated example packs (source for src/data/existingMods.ts)
├── src-tauri/
│   ├── src/          # 🦀 Rust: full_moon semantic checker + the compile_lua command
│   └── capabilities/ # 🔐 Plugin permissions (fs, dialog)
├── scripts/          # 🧪 Engine-data generator + the Rust-vs-TS differential sweep
└── server.ts         # 🔌 Dev-only server (health + Vite middleware, loopback)
```

---

## ⚠️ Known Limitations

- The semantic checker has **two implementations** kept in step: a TypeScript one and a Rust `full_moon` one. A differential sweep runs both over the engine's whole mod corpus on demand; it currently reports **0 real drift**, and the handful of differences are adjudicated in the sweep script. 🧪
- Syntax checking is **not AST-based** on the TypeScript side. Despite the "AST Inspector" label in the UI, that layer is a hand-written tokenizer plus two stacks. The real Lua 5.4 compiler in the desktop build is what makes syntax checking authoritative. 🤖
- **The real compiler requires a current build.** An `.exe` predating the compiler silently falls back to the built-in parser, and the console says so.
- The undefined-name check is **scope-aware in the Rust checker** (and in autocomplete); the TypeScript fallback used outside the desktop app is a flat file-wide pass.
- Unknown-method checks only cover a **fixed receiver list** (`a`, `actor`, `worm`, `m`, `missile`, `inv`/`store`/`inventory`, `mine`/`drum`/`oil`/`crate`/`grave`/`obj`/`object`). Receivers narrowed by a `.kind` test are treated as a runtime union and reported as an `info` notice rather than a warning.
- The API sidebar and autocomplete follow engine **0.9.11** (Lua API 4.0) and may lag behind newer engine versions. Use the **+ Custom Verb** button to cover the gaps, or wait for updates. A registered verb feeds autocomplete **and** both checkers, so the same registration also silences the `wa-namespace-typo` warning. For a namespaced function such as `wa.one.two()`, choose **+ New Class**, enter `wa.one` as the namespace/class and `two` as the member — dots belong in the namespace field, not the member name. Verbs persist to `custom_verbs.cfg`.
- Built with heavy AI assistance (vibecoded). Expect rough edges. 🤖

---

## 🤖 Contributing

Contributions are **warmly welcomed**! 💖 Feel free to open an issue or submit a pull request. Together, we can **forge** the future of Worms modding. 🔥

> ⚠️ Adding a WormForge verb? Add it to `src/data/wormforgeDefinitions.ts`. That one table feeds the docs pane, the autocomplete, **and** the unknown-method warnings — three consumers, zero duplication. 🔗

---

## 🧪 Development

Six gates, and **`npm run lint` alone is not enough**:

| Command | Checks |
|---|---|
| `npm run lint` | TypeScript types (`tsc --noEmit`) |
| `npm test` | The vitest suite |
| `cd src-tauri; cargo test` | The Rust checker |
| `npx tsx scripts/__sweep.ts` | Rust vs TypeScript over the engine's mod corpus |
| `npx tsx scripts/genEngineData.ts --check` | The generated engine tables are current |
| `npx tsx scripts/genRecordFields.ts --check` | The generated record-field table is current |

The sweep and the two `--check` generators catch the failure mode no unit test can see: the two checker
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

[![128x128-2x.png](https://i.postimg.cc/vBfwbz62/128x128-2x.png)](https://postimg.cc/ZBbML6H6)

**Made with ❤️ and a *deep passion* for worms.** 🪱

</div>
