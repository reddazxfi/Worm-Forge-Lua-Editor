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
- 🧩 **Example Mods & Templates** — Eight ready-to-fork packs, including Saw, Sentry Gun, Keeper Bee, Kill the King, and three Highlander variants. 🔫
- 🖥️ **Native Desktop App** — Powered by Tauri for a **lightweight**, **lightning-quick** Windows executable. No bloated Chromium bundle required! 🪶

---

## 🔍 How Checking Works — and Why It Matters

This is the part that separates a mod that loads from a mod that doesn't.

**On the desktop**, a check runs in two stages:

1. **The real compiler.** Your Lua is handed to the same Lua 5.4 front end the game engine uses. It parses the chunk and reports exactly what the engine would report — `'end' expected (to close 'function' at line 120)`, `no visible label 'nowhere' for <goto>`, malformed numbers, and so on. It **compiles without executing**, so nothing runs and no `wa.*` call is ever invoked. 🌟
2. **The built-in semantic pass.** The compiler only knows syntax. It cannot know that `worm:hurt` is a real verb, that `math.random` will desync, or that `obj` is really a worm wearing a WorldHandle costume. That pass catches those.

**In the browser** (or the dev server), stage 1 is skipped — there's no Rust runtime — and you get the built-in parser alone. The console **always labels which one ran**, so a clean pass from the real compiler never gets confused with a clean pass from the built-in one. Honesty, at scale. ✨

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
| 🖥️ Local Dev Server | Express (`/api/fs/*` folder access) |

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) 🟢
- [Rust](https://rustup.rs/) 🦀 (`winget install Rustlang.Rustup`)
- Visual Studio Build Tools with **Desktop development with C++** 🛠️ (Windows only)

### Run in the Browser
```bash
npm install --legacy-peer-deps
npm run dev
```
Then open **http://localhost:3000** and let the magic happen. 🪄

> Folder open/save works in the desktop app and in Chromium-based browsers (Chrome/Edge).
> The **real Lua compiler only exists in the desktop `.exe`** — the browser build has no Rust runtime.

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
│   ├── data/         # 📚 Engine definitions, templates, example mods
│   ├── services/     # ⚙️ parser, luaCompiler, mod folder access, config
│   └── types/        # 🧾 TypeScript types
├── src-tauri/        # 🦀 Desktop app shell + the compile_lua command
└── server.ts         # 🔌 Local dev server (health + /api/fs helpers)
```

---

## ⚠️ Known Limitations

- The built-in parser is still a **hand-written tokenizer**, not a real Lua parser. Despite the label, there is **no AST and no syntax tree** — it's a tokenizer plus two stacks. The real Lua 5.4 compiler in the desktop build is what makes syntax checking authoritative. 🤖
- **The real compiler is desktop-only.** In the browser you are on the built-in parser, and the console says so.
- The undefined-name check is **not scope-aware**: a name counts as defined if it's bound *anywhere* in the file, so a forward reference is never flagged.
- Missed members on a known handle are not caught — `wa.rndom(1)` (typo for `wa.random`) passes both stages, because `wa` and `w` are legitimately bound names.
- Unknown-method checks only cover a **fixed receiver list** (`a`, `actor`, `worm`, `m`, `missile`, `inv`/`store`/`inventory`, `mine`/`drum`/`oil`/`crate`/`grave`/`obj`/`object`). Receivers narrowed by a `.kind` test are treated as a runtime union and reported as a notice rather than a warning.
- The API sidebar and autocomplete follow engine **0.8.22** and may lag behind newer engine versions.
- Built with heavy AI assistance (vibecoded). Expect rough edges. 🤖

---

## 🤖 Contributing

Contributions are **warmly welcomed**! 💖 Feel free to open an issue or submit a pull request. Together, we can **forge** the future of Worms modding. 🔥

> ⚠️ Adding a WormForge verb? Add it to `src/data/wormforgeDefinitions.ts`. That one table feeds the docs pane, the autocomplete, **and** the unknown-method warnings — three consumers, zero duplication. 🔗

---

## 📜 License

MIT. See [LICENSE](LICENSE). ⚖️

Not affiliated with Team17 or Worms Armageddon. This is a third-party tool for the [WormForge](https://github.com/ropahektic/WormForge) modding engine, which is MIT-licensed and maintained separately.

<div align="center">

**Made with ❤️ and a *deep passion* for worms.** 🪱

</div>
