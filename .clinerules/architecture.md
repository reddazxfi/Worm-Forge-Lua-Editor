# Architecture — always loaded. Keep this file short; it is in context on every task.

## What this is
WormForge Code Studio: a Lua modding IDE for the WormForge engine (Worms Armageddon).
A desktop app (Tauri) that also runs as a local web app (Express + Vite).
Its whole purpose is catching desync-prone Lua before it reaches a multiplayer match.

## Stack
- React 19 + Tailwind CSS 4 + Vite 6
- Express 4 in `server.ts` (dev server + `/api/fs/*` helpers, 10MB JSON limit)
- Tauri 2 / Rust for the desktop shell
- TypeScript throughout. No test framework, no linter beyond `tsc --noEmit`.

## Layout
- `src/App.tsx` — root component. Owns ALL app state: files, tabs, active file,
  diagnostics, logs, modal visibility, pane sizes. This is the hub.
- `src/components/` — UI. `CodeEditor.tsx` is the big one (custom editor, no CodeMirror).
- `src/services/` — logic. `parser.ts` is the important one.
- `src/data/` — STATIC reference tables, no logic. Large. Treated as read-only.
- `src/types/wormforge.ts` — the shared type vocabulary.
- `src-tauri/` — Rust desktop shell.

## THE PARSER IS NOT AN AST
`services/parser.ts` is a hand-written tokenizer plus a `bracketStack` and a
`blockStack` for structural validation. It builds NO syntax tree.
Despite the README saying "AST Inspector" and the app saying "Lockstep AST
engine", there is no tree, no AVL balancing, and no traversal.
- `tokenize(code)` -> tokens + diagnostics
- `parseAndValidate(code)` -> { symbols, diagnostics }

Do not "optimize" or "fix" tree balancing; there is no tree.
Symbol extraction is heuristic and `README.md` already admits it will not
properly detect errors and crashes on patterns like `worm.1111`.

## Two lockfiles, deliberately
`package-lock.json` and `bun.lock` both exist. `bun.lock` is a leftover from the
original AI Studio (Bun) environment. `build-tauri.bat` deletes
`package-lock.json` and reinstalls on every build, so neither is authoritative.
Do not "clean up" one without asking.

## Conventions
- Tailwind utility classes inline. No CSS modules, no styled-components.
  Dark mode is a conditional ternary on `isLight`, e.g.
  `isLight ? 'bg-white border-slate-300' : 'bg-[#171b21] border-[#242b35]'`
- Dark theme hex values: bg `#0e1115`/`#171b21`/`#16191f`, borders `#242b35`,
  text `#cfdbe8`, accent amber-500.
- Errors are swallowed with bare `catch {}` around localStorage. That is
  intentional, because a full disk must not crash the editor. Match it.
- All engine/API data is pinned to WormForge 0.8.12 and may lag the real engine.

## Before claiming a change works
Run `npm run lint` (this is `tsc --noEmit`; there is no other check).
Install needs `npm install --legacy-peer-deps`.
