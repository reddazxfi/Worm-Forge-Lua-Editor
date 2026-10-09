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

import {
  SyntaxDiagnostic,
  SyntaxSeverity,
  ParsedSymbolTree,
  FunctionDef,
  VariableDef,
  ClassDef,
  EnumDef,
} from '../types/wormforge';
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
 * Real AST parsing, Track B phase 1.
 *
 * The built-in parser in parser.ts is a hand-written tokenizer with two stacks.
 * It is the reason receiver types are guessed from NAME SHAPES (`self`, `obj`)
 * rather than read off the code: a regex cannot tell where a function body
 * ends, so it cannot tell what a function returns.
 *
 * `parse_lua_ast` is a real parser (full_moon, the same Lua 5.4 dialect mlua
 * compiles in compile_lua) run in Rust. It returns which names bind to which
 * call, so `local t = find_target()` can be typed from what find_target
 * actually returns.
 *
 * Phase 1 does NOT replace anything. parser.ts still runs and still produces
 * the diagnostics; this exists so the two can be compared on the same input
 * before the hand-written one is switched off.
 */

/** A `local X = <call>` or `function f() ... return <call> end` binding. */
export interface AstBinding {
  name: string;
  line: number;
  /** Dotted callee as written, or null when it is not a plain named call. */
  call: string | null;
}

/**
 * The EXTRACTED symbol tree from a real parse (B1).
 *
 * These are the symbols the USER wrote. The engine's own API tables
 * (`BUILTIN_FUNCTIONS`, `BUILTIN_CLASSES`, ...) stay in TypeScript and are merged
 * on the front end, exactly as `parseAndValidate` used to do. That keeps
 * "definitions to Rust" a separate, optional step rather than a prerequisite.
 *
 * `enums` is absent for the same reason -- enumerations are static data, never
 * parsed, so there is nothing for the parser to extract.
 */
export interface ExtractedSymbols {
  functions: FunctionDef[];
  variables: VariableDef[];
  classes: ClassDef[];
  customVerbs: string[];
}

export interface AstReport {
  /** False when full_moon rejected the chunk. `diagnostics` then holds why. */
  ok: boolean;
  diagnostics: SyntaxDiagnostic[];
  locals: AstBinding[];
  functions: AstBinding[];
  /** B1: user-declared functions, as `FunctionDef` shapes. */
  functionsDecl: FunctionDef[];
  /** B1: `local` and global variables, as `VariableDef` shapes. */
  variables: VariableDef[];
  /** B1: tables inferred from `a.b` / `a:b` usage, as `ClassDef` shapes. */
  classes: ClassDef[];
  /** B1: every member name seen, deduped, for the API tree's "custom verbs". */
  customVerbs: string[];
}

export interface AstOutcome {
  /** True when a real parse ran. False means fall back to the built-in parser. */
  available: boolean;
  report?: AstReport;
  reason?: string;
}

const RULE = 'lua-ast';

/**
 * The severities the console understands. `parse_lua_ast` sends `severity` as a plain
 * string over IPC, and TS cannot check a value that arrives from JSON, so it is
 * validated here rather than asserted.
 */
const SEVERITIES: readonly SyntaxSeverity[] = ['error', 'warning', 'info'];

const asSeverity = (value: unknown): SyntaxSeverity =>
  SEVERITIES.includes(value as SyntaxSeverity) ? (value as SyntaxSeverity) : 'error';

/**
 * Parses with full_moon over IPC. Never throws: a caller that cannot reach the
 * command must fall back to parser.ts, and an exception here would take the
 * syntax check down with it.
 *
 * `custom` is the custom_verbs.cfg overlay as (class, member) pairs --
 * verbsForRust() output. Optional: omitted (browser, or a caller with no verbs)
 * sends nothing and Rust reads it as `None`, which is exactly "no custom
 * verbs". An OLD exe receiving the extra arg ignores it (serde default), so
 * new front end + old exe also degrades to "no custom verbs" rather than an
 * invoke error.
 */
export async function parseWithAst(
  source: string,
  custom?: [string, string][]
): Promise<AstOutcome> {
  if (!isDesktop()) {
    return { available: false, reason: 'no Rust runtime (this is not the desktop app)' };
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const report = (await invoke('parse_lua_ast', {
      source,
      ...(custom && custom.length > 0 ? { custom } : {}),
    })) as AstReport;

    return {
      available: true,
      report: {
        ok: report.ok,
        // full_moon's own wording, kept verbatim: it is better than anything
        // reworded here, and `rule` is what the console filters on.
        //
        // Severity and rule are PASSED THROUGH from Rust, not restated. They used to be
        // hardcoded to 'error'/'lua-ast', which was correct when the only diagnostics
        // here were parse failures -- but B2 put the semantic checks on the same field,
        // and flattening them silently promoted every Rust WARNING (wa-namespace-typo,
        // unknown-method) to an error, turning the banner red on code that runs, and
        // broke the (line, rule) dedup in mergeDiagnostics so each finding was listed
        // twice. Rust already decides both; only the shape is validated here.
        diagnostics: (report.diagnostics ?? []).map((d) => ({
          line: d.line,
          column: d.column,
          message: d.message,
          // `detail` is the expandable long form. Spread conditionally rather
          // than always assigned: an older Rust build (or the browser path)
          // omits the key entirely, and writing `detail: undefined` explicitly
          // would create the property on every finding, making `"detail" in d`
          // true for findings that have nothing to expand.
          ...(d.detail ? { detail: d.detail } : {}),
          severity: asSeverity(d.severity),
          rule: d.rule || RULE,
        })),
        locals: report.locals ?? [],
        functions: report.functions ?? [],
        functionsDecl: report.functionsDecl ?? [],
        variables: report.variables ?? [],
        classes: report.classes ?? [],
        customVerbs: report.customVerbs ?? [],
      },
    };
  } catch (err) {
    const raw = typeof err === 'string' ? err : String((err as any)?.message ?? err);
    return { available: false, reason: raw.trim() || 'the command returned no error message' };
  }
}



/**
 * Merges the extracted symbols from a real parse with the engine's static tables
 * into the `ParsedSymbolTree` the UI consumes.
 *
 * This is the seam that makes B1 complete without B3. Rust sends only what it
 * parsed -- the user's own functions, variables and inferred tables -- and the
 * engine API tables are merged here, exactly where `parseAndValidate` used to do
 * it. Moving `BUILTIN_*` into Rust becomes an optional later step that changes
 * this one function, rather than a prerequisite for it.
 *
 * Dedup order matches the old parser: engine entries first, extracted entries
 * only when they add a name. An extracted `wa` therefore never shadows a real
 * engine definition.
 */
export function mergeExtractedSymbols(
  report: AstReport,
  engine: { functions: FunctionDef[]; variables: VariableDef[]; classes: ClassDef[] },
  enums: EnumDef[]
): ParsedSymbolTree {
  const functions: FunctionDef[] = [];
  const seenFuncs = new Set<string>();
  for (const f of engine.functions) {
    if (!seenFuncs.has(f.name)) {
      seenFuncs.add(f.name);
      functions.push(f);
    }
  }
  for (const f of report.functionsDecl ?? []) {
    if (!seenFuncs.has(f.name)) {
      seenFuncs.add(f.name);
      functions.push(f);
    }
  }

  const variables: VariableDef[] = [];
  const seenVars = new Set<string>();
  for (const v of engine.variables) {
    if (!seenVars.has(v.name)) {
      seenVars.add(v.name);
      variables.push(v);
    }
  }
  for (const v of report.variables ?? []) {
    if (!seenVars.has(v.name)) {
      seenVars.add(v.name);
      variables.push(v);
    }
  }

  // Classes MERGE rather than dedupe: an extracted table contributes members to an
  // existing engine class of the same name, which is what makes `worm:something`
  // show up on the real WormEntity in the docs pane.
  const classes: ClassDef[] = engine.classes.map((c) => ({ ...c, members: [...c.members] }));
  for (const c of report.classes ?? []) {
    const existing = classes.find((e) => e.name === c.name);
    if (existing) {
      for (const m of c.members) {
        if (!existing.members.some((em) => em.name === m.name)) existing.members.push(m);
      }
    } else {
      classes.push(c);
    }
  }

  return {
    functions,
    variables,
    classes,
    enums,
    customVerbs: report.customVerbs ?? [],
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
    return { ok: false, engine: 'builtin', reason: 'no Rust runtime (this is not the desktop app)' };
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