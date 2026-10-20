---
paths: ["src-tauri/**"]
---
# Tauri / Rust rules

- `main.rs` is the entry point. Tauri 2, not Tauri 1 — the API differs.
- Native capabilities live in `capabilities/default.json`. The `fs` and `dialog`
  plugins are permission-gated there. Adding a filesystem or dialog call means
  adding the matching permission, or it silently fails at runtime.
- `Cargo.lock` is committed. Never hand-edit it, and never let a tool
  "clean up" lockfiles in this repo (see `architecture.md`).
- `tauri.conf.json` holds the window/bundle config; `base: './'` in
  `vite.config.ts` is what lets the built EXE load assets from disk.
- Building the EXE needs Visual Studio Build Tools with the C++ workload, and
  the first build takes several minutes. Do not start it to "verify a change" —
  verify TypeScript changes with `npm run lint` instead.
