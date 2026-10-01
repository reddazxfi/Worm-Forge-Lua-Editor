---
paths: ["src/services/**"]
---
# Services / core logic rules

- `parser.ts` is hand-written and heuristic. Before changing it, read the whole
  function you are touching. It is long, linear, and stateful via two stacks.
- The desync checks (`math.random`, unordered `pairs()`) are the product's main
  value. Never weaken or remove a warning to make a test pass.
- Unknown-method checks only cover a hardcoded receiver list (`a`, `actor`,
  `worm`, `world`, `missile`, `inventory`). Adding a receiver means updating
  that list too.
- Known limitation: the tokenizer breaks on a number directly after a dot,
  e.g. `worm.1111`. If a user reports a crash, check for this pattern first.
- `modFolder.ts` decides between the Tauri plugin, the `/api/fs/*` Express
  endpoint, and the browser File API. Guard all three paths when editing.
- Keep parsing and rendering separate. No React imports in this folder.
