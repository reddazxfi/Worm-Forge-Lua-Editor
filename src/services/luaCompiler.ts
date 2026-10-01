// Compile a Lua 5.4 chunk with the same mlua build the game uses.
//
// Desktop only: the command is `compile_lua` in src-tauri/src/main.rs, which
// calls Chunk::into_function() -- the game compiles mods in
// crates/lua-host/src/sandbox.rs:41 with the very same front end.
//
// The browser and the Express dev server have no Rust, so there the built-in
// parser in parser.ts is all there is. App.tsx labels which one ran, because a
// clean pass from the game compiler and a clean pass from the built-in parser
// are not the same claim.

import { SyntaxDiagnostic } from '../types/wormforge';
import { isDesktop } from './modFolder';

export type CheckEngine = 'game-compiler' | 'builtin';

/**
 * Deliberately a flat shape rather than a discriminated union: the only consumer
 * is App.tsx, and `engine` + `ok` + an optional `diagnostic` reads more plainly
 * than three union members you have to narrow.
 */
export interface CompileOutcome {
  /** Which checker produced this result. */
  engine: CheckEngine;
  /** False means the chunk was rejected (game compiler) or not checked at all. */
  ok: boolean;
  /** Set when the game compiler rejected the chunk. */
  diagnostic?: SyntaxDiagnostic;
  /** Set when the game compiler could not be reached. */
  reason?: string;
}

export const isBrowser = (): boolean => !isDesktop();

// mlua 0.10's Display for SyntaxError is "syntax error: {message}"
// (mlua-0.10.5/src/error.rs:217), and Lua renders a string chunk as
// [string "name"]. Verified output of `cargo run` against mlua 0.10.5:
//
//   syntax error: [string "rules.lua"]:2: 'end' expected (to close 'function' at line 1) near <eof>
//
// Note set_name does NOT strip the [string ".."] wrapper, so the parser has to
// expect it. Nothing is anchored past the chunk name on purpose: the message
// body can contain its own ":<line>:" (e.g. inside a `near '...'` chunk dump).
const LUA_PREFIX = /^\s*syntax error:\s*/i;
const LUA_STRING_CHUNK = /\[string "[^"]*"\]:(\d+):\s*([\s\S]*)/;
const LUA_BARE_CHUNK = /^[^:[\]]+:(\d+):\s*([\s\S]*)/;

/**
 * Turns Lua's own error text into a diagnostic, or null if this does not look
 * like a Lua syntax error at all (in which case the command probably failed to
 * run, and the caller should fall back rather than blame the user's code).
 */
export function parseLuaError(raw: string): SyntaxDiagnostic | null {
  const body = raw.replace(LUA_PREFIX, '');
  const m = LUA_STRING_CHUNK.exec(body) ?? LUA_BARE_CHUNK.exec(body);
  if (!m) return null;

  const line = Number(m[1]);
  if (!Number.isFinite(line) || line < 1) return null;

  return {
    line,
    // Lua reports no column, so point at the start of the offending line.
    column: 1,
    message: `Lua 5.4: ${m[2].replace(/\s*near\s.*$/, '').trim()}`,
    severity: 'error',
    rule: 'lua-compile',
  };
}

/**
 * Compiles `source` with the game's own Lua 5.4. Only call this on desktop.
 */
export async function compileWithEngine(
  source: string,
  chunkName: string
): Promise<CompileOutcome> {
  if (!isDesktop()) {
    return { ok: false, engine: 'builtin', reason: 'browser mode: no Rust runtime' };
  }

  let thrown: unknown;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('compile_lua', { source, chunkName });
    return { ok: true, engine: 'game-compiler' };
  } catch (err) {
    thrown = err;
  }

  const raw = typeof thrown === 'string' ? thrown : String((thrown as any)?.message ?? thrown);

  const diagnostic = parseLuaError(raw);
  if (diagnostic) {
    return { ok: false, engine: 'game-compiler', diagnostic };
  }

  // The command itself failed, so we learned nothing about the code. Say why,
  // rather than silently pretending the built-in parser is the game compiler.
  // `reason` is always populated: an empty one is what produced the useless
  // "unavailable (unknown reason)" line before.
  return {
    ok: false,
    engine: 'builtin',
    reason: raw.trim() || 'the command returned no error message',
  };
}