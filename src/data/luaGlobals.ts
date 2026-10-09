// Globals a WormForge mod may legitimately read.
//
// WHY THIS FILE IS THE ONLY COPY
// Both diagnostic implementations consult this list: the Rust checker
// (`checks.rs`, via `engine_data::KNOWN_GLOBALS`) and the TypeScript baseline
// (`parser.ts`). It used to be hand-written TWICE -- `LUA_GLOBALS` in parser.ts and
// `KNOWN_GLOBALS` in checks.rs -- and the two had already drifted by nine names
// before they were merged here. Two hand-kept copies of one list is exactly the
// failure `handleRegistry.ts` exists to prevent, so the list now lives here once and
// `scripts/genEngineData.ts` emits the Rust side from it.
//
// `genEngineData.ts --check` fails if the generated copy goes stale, so the two
// sides cannot silently diverge again.
//
// WHAT BELONGS HERE
// Deliberately generous: the `undefined-global` check only fires on a name that is
// read and never bound anywhere in the file, so a name listed here that turns out to
// be stripped by the engine sandbox is a separate check, not this one's business.
// That said, a name here that does NOT exist suppresses a REAL finding, so every
// entry has to be justifiable:
//
//   - `unpack` and `bit32` were REMOVED. Lua 5.2 renamed `unpack` to `table.unpack`
//     and dropped `bit32` entirely. This engine is Lua 5.4 (mlua `lua54` feature,
//     matching the game build), so neither exists.
//   - `jit` and `bit` are LuaJIT-isms. This engine runs plain Lua 5.4, not LuaJIT.
//   - `game_state`, `run_once` and `printf` were listed as though the engine injected
//     them. They do not: grepping the vendored engine for `game_state` and `run_once`
//     returns ZERO hits across `crates/`, and all seven `printf` hits are Windows CRT
//     internals in `engine/src/crt.rs`, unrelated to the Lua sandbox. The ONLY global
//     the host injects is `wa` (crates/lua-host/src/api.rs:329).
//
// `cargo test` in checks.rs pins every one of those exclusions, so they cannot be
// quietly reintroduced.

/** Lua 5.4 base library, plus the load-time helpers the sandbox nils out. */
export const LUA_GLOBALS: string[] = [
  // Lua base
  '_G', '_VERSION', '_ENV', 'assert', 'error', 'getmetatable', 'ipairs', 'next', 'pairs',
  'pcall', 'print', 'rawequal', 'rawget', 'rawlen', 'rawset', 'select', 'setmetatable',
  'tonumber', 'tostring', 'type', 'warn', 'xpcall',
  // Standard libraries
  'coroutine', 'debug', 'io', 'math', 'os', 'package', 'string', 'table', 'utf8', 'arg',
  // Load-time helpers the engine's sandbox nils out (sandbox.rs:11-27). Listed so that
  // reading one is not reported as a typo; USING one is a separate, real problem.
  'dofile', 'loadfile', 'load', 'require', 'collectgarbage',
  // WormForge
  'wa',
];

/** O(1) lookup for the checker. */
export const LUA_GLOBALS_SET: Set<string> = new Set(LUA_GLOBALS);