# Architecture — always loaded. Keep this file short; it is in context on every task.

## What this is
WormForge Code Studio: a Lua modding IDE for the WormForge engine (Worms Armageddon).
A DESKTOP-ONLY app (Tauri). `server.ts` exists purely so `tauri dev` has something
to serve during development; it is not a supported way to run the product.
Its whole purpose is catching desync-prone Lua before it reaches a multiplayer match.

## Stack
- React 19 + Tailwind CSS 4 + Vite 6
- Express 4 in `server.ts` — dev-only: `/api/health` + Vite middleware, bound to
  127.0.0.1. No filesystem endpoints (the unauthenticated `/api/fs/*` helpers were
  removed; see §28 of compacted-context.md)
- Tauri 2 / Rust for the desktop shell
- TypeScript throughout, checked by `tsc --noEmit` (the `lint` script) AND vitest
  (`npm test`, currently 181 tests) AND `cargo test` in `src-tauri` (316 tests).
  There is also a differential sweep (`npx tsx scripts/__sweep.ts`) and
  `npx tsx scripts/genEngineData.ts --check`. The authoritative gate list lives in
  `compacted-context.md` §0 — read it; do not assume `lint` is the only check.

## Layout
- `src/App.tsx` — root component. Owns ALL app state: files, tabs, active file,
  diagnostics, logs, modal visibility, pane sizes. This is the hub.
- `src/components/` — UI. `CodeEditor.tsx` is the big one (custom editor, no CodeMirror).
- `src/services/` — logic. `lexer.ts` is the hand-written tokenizer and `parser.ts`
  is the checker built on it (structural validation, desync checks, symbol
  extraction); `parser.ts` is still authoritative for scope analysis and stays
  permanently, because the synchronous autocomplete bootstrap in `App.tsx`
  cannot await Rust. A Rust `full_moon` checker
  (`src-tauri/src/checks.rs`, `scopes.rs`) is being migrated IN (see B2 in
  `compacted-context.md`). `luaCompiler.ts` drives the real Lua 5.4 compile,
  `modFolder.ts` is disk IO, and `config.ts` / `session.ts` / `diagnostics.ts` /
  `undoPolicy.ts` / `scope.ts` are the smaller pieces.
- `src/data/` — reference tables, mostly static and large. `wormforgeDefinitions.ts`,
  `luaGlobals.ts`, `wormStates.ts`, `specKeys.ts` are pure data; `handleRegistry.ts` is
  the one canonical receiver→class table (plus a small `traceLocalTypes` helper) shared
  by `parser.ts`, `CodeEditor.tsx` AND Rust via `scripts/genEngineData.ts`. Editing any of
  these tables means re-running `genEngineData.ts`.
- `src/types/wormforge.ts` — the shared type vocabulary.
- `src-tauri/` — Rust desktop shell.

## THE PARSER IS NOT AN AST
`services/lexer.ts` is the hand-written tokenizer (Step A split it out of
`parser.ts` verbatim; `parser.ts` re-exports `tokenize`/`Token` so existing
importers are unaffected). `parser.ts` adds a `bracketStack` and a
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
- All engine/API data is pinned to WormForge 0.9.11 and may lag the real engine.

## Before claiming a change works
Run the gates in `compacted-context.md` §0. Minimum: `npm run lint` (`tsc --noEmit`) and
`npm test` (vitest). Rust changes also need `cd src-tauri; cargo test`. Editing any
`src/data/*.ts` table needs `npx tsx scripts/genEngineData.ts` re-run (`--check` fails
otherwise); `parser.ts` changes need `npx tsx scripts/__sweep.ts`. `npx tauri build` is
the ONLY runtime check and needs the EXE closed — do not start it to "verify" a
TypeScript change. Install needs `npm install --legacy-peer-deps`.
> There IS a test framework (vitest) and there ARE other checks. Any file that says
> otherwise is stale — this line was wrong until 2026-10-04.
