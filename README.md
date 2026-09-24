# 🪱⚡ WormForge Code Studio

> **Elevate your Worms Armageddon modding workflow with a seamless, robust, next-generation Lua development experience.** 🚀

WormForge Code Studio is a **powerful**, **blazing-fast**, and **thoughtfully crafted** code editor designed to **empower** modders to **unlock** the full potential of the WormForge scripting engine. Whether you're a seasoned modder or just getting started, our **cutting-edge** toolkit has you covered. ✨

---

📁[WormForge Repo](https://github.com/ropahektic/WormForge)

---

## 🌟 Key Features

- 🧠 **Intelligent Lua Editor** — A custom-built tokenizer and parser delivers real-time syntax diagnostics as you type.
- 🔒 **Lockstep Guardian™** — Proactively catches desync-prone patterns like `math.random` and unordered `pairs()` iteration, so your mods stay **deterministic** and your multiplayer matches stay **drama-free**. 🛡️
- 📚 **Built-in Documentation Pane** — Explore engine functions, classes, enums, and constants without ever leaving your editor.
- 📂 **Open / Save Mod Folders** — Open a pack folder (`mod.toml` + Lua), edit its files in tabs, and save straight back to disk with Ctrl+S. 🗂️
- 🧩 **Example Mods & Templates** — Load the Saw and Sentry Gun examples to get started fast. 🔫
- 🤝 **Real-Time Collaboration** — Code together with your fellow modders via WebSockets, complete with live cursors and a chat drawer. 💬
- 🖥️ **Native Desktop App** — Powered by Tauri for a **lightweight**, **lightning-quick** Windows executable. No bloated Chromium bundle required! 🪶

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| 🎨 Frontend | React 19 + Tailwind CSS 4 |
| ⚡ Bundler | Vite |
| 🔌 Collab Server | Express + `ws` |
| 🦀 Desktop Shell | Tauri 2 (Rust) |
| 📝 Language | TypeScript |

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

### Build the Windows `.exe`
```bat
build-tauri.bat
```
Your shiny new executable will be waiting at:
```
src-tauri\target\release\wormforge-code-editor.exe
```
🎉 *(The first build compiles Rust crates and may take several minutes. Grab a coffee!)* ☕

---

## 🤝 Collaboration Setup

The desktop app runs in **local-only mode** by default. To unlock **seamless** multi-user collaboration, host `server.ts` somewhere and set:

```env
VITE_COLLAB_URL="wss://your-host.example.com/ws"
```

before building. 🌐

---

## 📁 Project Structure

```
├── src/
│   ├── components/   # 🎨 UI components
│   ├── data/         # 📚 Engine definitions, templates, example mods
│   ├── services/     # ⚙️ Parser, collaboration, mod folder access
│   └── types/        # 🧾 TypeScript types
├── src-tauri/        # 🦀 Desktop app shell
└── server.ts         # 🔌 Collaboration server
```

---

## ⚠️ Known Limitations

- Built with heavy AI assistance (vibecoded). Expect rough edges.
- The API sidebar and autocomplete follow engine 0.7.2 and may lag behind newer engine versions.
- Parser safeguards are limited: unknown-method checks only cover common receivers (`a`, `actor`, `worm`).
- The desktop build has no bundled collaboration server; set `VITE_COLLAB_URL` to use one.

---

## 🤖 Contributing

Contributions are **warmly welcomed**! 💖 Feel free to open an issue or submit a pull request. Together, we can **forge** the future of Worms modding. 🔥

---

## 📜 License

MIT. See [LICENSE](LICENSE). ⚖️

Not affiliated with Team17 or Worms Armageddon. This is a third-party tool for the [WormForge](https://github.com/ropahektic/WormForge) modding engine, which is MIT-licensed and maintained separately.

<div align="center">

**Made with ❤️ and a *deep passion* for worms.** 🪱

</div>
