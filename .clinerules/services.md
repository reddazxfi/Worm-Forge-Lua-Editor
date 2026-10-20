---
paths: ["src/services/**"]
---
# Services / core logic rules

- `parser.ts` is hand-written and heuristic. Before changing it, read the whole
  function you are touching. It is long, linear, and stateful via two stacks.
- The tokenizer lives in `lexer.ts` (`tokenize` + `Token`), split out of
  `parser.ts` with no behaviour change; `parser.ts` re-exports both so existing
  importers keep working. `scope.ts` imports `./lexer` directly, because the
  autocomplete path is synchronous and must not pull in the checker.
  `parser.ts` is NOT going away: the `App.tsx` symbol bootstrap
  (`parseAndValidate(INITIAL_TEMPLATE)`) is synchronous and cannot await Rust.
- The desync checks (`math.random`, unordered `pairs()`) are the product's main
  value. Never weaken or remove a warning to make a test pass.
- Unknown-method checks resolve receivers through `src/data/handleRegistry.ts` — the
  ONE canonical table, shared with `CodeEditor.tsx` autocomplete and with Rust via
  `scripts/genEngineData.ts`. Adding a receiver means editing `RECEIVER_REGISTRY` there
  (NOT a list inside `parser.ts`), then re-running `genEngineData.ts`. Each row keeps
  `prefixes` (autocomplete, lenient) separate from `diagnose` (checker, conservative).
- Known limitation: the tokenizer breaks on a number directly after a dot,
  e.g. `worm.1111`. If a user reports a crash, check for this pattern first.
- `modFolder.ts` is DESKTOP-ONLY: the Tauri dialog + plugin-fs, and nothing else.
  The browser File API, webkitdirectory and `/api/fs/*` paths were all removed
  (§28) because they could read a folder but could not write back to it. Do not
  reintroduce a fallback that saves somewhere other than the folder in use.
- Keep parsing and rendering separate. No React imports in this folder.
