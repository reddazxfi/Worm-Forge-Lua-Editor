import {
  SyntaxDiagnostic,
  VariableDef,
  FunctionDef,
  ClassDef,
  CustomVerb,
  ParsedSymbolTree,
} from '../types/wormforge';

export type { SyntaxDiagnostic, ParsedSymbolTree };
import {
  BUILTIN_CLASSES,
  BUILTIN_ENUMERATIONS,
  BUILTIN_FUNCTIONS,
  BUILTIN_VARIABLES,
} from '../data/wormforgeDefinitions';
import {
  ALL_HANDLE_CLASSES,
  customMembersFor,
  getClass,
  resolveForCheck,
  rowForClass,
  traceLocalTypes,
} from '../data/handleRegistry';
import { buildScopes, visibleAt } from './scope';
import {
  WEAPON_SPEC_KEY_SET,
  suggestSpecKey,
  suggestWaFunction,
} from '../data/specKeys';
import { LUA_GLOBALS_SET } from '../data/luaGlobals';
// The tokenizer now lives in ./lexer. Re-exported here so the existing importers
// of parser (scripts/__sweep.ts, the vitest suites) keep one path, and so the
// split is invisible to anything but the import graph.
import { tokenize, type Token } from './lexer';
export { tokenize };
export type { Token };

// Receivers the unknown-method check knows about, and the handle class each one
// is assumed to be. This is NOT defined here: services/parser.ts and
// components/CodeEditor.tsx must resolve receiver names through the single
// canonical registry in data/handleRegistry.ts, or the two lists drift.

/** "3734", "3734 and 4209", "3734, 4209 and 4372" */
function formatLines(lines: number[]): string {
  const sorted = Array.from(new Set(lines)).sort((a, b) => a - b);
  if (sorted.length === 1) return String(sorted[0]);
  if (sorted.length === 2) return `${sorted[0]} and ${sorted[1]}`;
  return `${sorted.slice(0, -1).join(', ')} and ${sorted[sorted.length - 1]}`;
}

// Globals a mod may legitimately read now live in src/data/luaGlobals.ts, which is
// ALSO the source the Rust checker's KNOWN_GLOBALS is generated from. They used to be
// a private `LUA_GLOBALS` const here and a hand-written `KNOWN_GLOBALS` in checks.rs,
// and the two had already drifted by nine names -- including `unpack` and `bit32`,
// which Lua 5.4 removed, and `game_state`/`run_once`/`printf`, which this engine never
// injects. One list, one source, and `genEngineData.ts --check` fails if the generated
// copy goes stale.

/**
 * Names that are read but never bound ANYWHERE in the file. The cheap,
 * deliberately-not-scope-aware version.
 *
 * `into_function()` compiles without running, so a chunk naming five invented
 * globals is a *compilable* chunk. It then dies at runtime, and because
 * `run_mods` (crates/lua-host/src/lib.rs:54) aborts the whole load on the first
 * error, one bad mod takes every other mod down with it. This is the check that
 * catches it before the match.
 *
 * This pass is deliberately NOT scope-aware: a name counts as bound if it is
 * declared or assigned ANYWHERE in the file, so a forward reference inside a
 * function is accepted. That is the cheap direction to be wrong in, and it is
 * why a local declared in one function used to silence a typo in another -- see
 * scanUndefinedNamesInScope() for the check that actually catches that.
 */
function scanUndefinedGlobals(meaningful: Token[]): SyntaxDiagnostic[] {
  const bound = new Set<string>();
  const out: SyntaxDiagnostic[] = [];

  // Pass 1: anything declared or assigned is a definition, not a typo.
  for (let i = 0; i < meaningful.length; i++) {
    const t = meaningful[i];

    if (t.type === 'keyword' && (t.value === 'local' || t.value === 'for')) {
      // `local a, b = ...`, `for a, b in ...`, `local function f`
      for (let k = i + 1; k < meaningful.length; k++) {
        const v = meaningful[k].value;
        if (meaningful[k].type !== 'identifier') break;
        bound.add(v);
        if (meaningful[k + 1]?.value === ',') {
          k++;
          continue;
        }
        break;
      }
    } else if (t.type === 'keyword' && t.value === 'function') {
      // `function f(...)`, `function a.b.c(...)`, or an anonymous callback
      // `function(...)`. Only the named forms bind a name here.
      const nameTok = meaningful[i + 1];
      if (nameTok?.type === 'identifier') bound.add(nameTok.value);
      // `function Worm:ammo(x)` -- the `:` form declares an implicit `self`
      // parameter, which Lua does not otherwise bind anywhere.
      if (meaningful[i + 2]?.value === ':') bound.add('self');

      // Parameters: every identifier up to the `)` that closes the first `(`.
      // Anonymous callbacks are the common WormForge style
      // (`wa.on.hurt(function(worm, ev) ... end)`), so this has to work when
      // `function` is immediately followed by `(`.
      for (let k = i + 1; k < meaningful.length; k++) {
        if (meaningful[k].value !== '(') continue;
        let depth = 0;
        for (let p = k; p < meaningful.length; p++) {
          const v = meaningful[p].value;
          if (v === '(') {
            depth++;
            continue;
          }
          if (v === ')') {
            depth--;
            if (depth === 0) break;
            continue;
          }
          if (depth === 1 && meaningful[p].type === 'identifier') {
            bound.add(meaningful[p].value);
          }
        }
        break;
      }
    } else if (t.type === 'identifier' && meaningful[i + 1]?.value === '=') {
      // Bare `x = ...` defines a global. Also `_G.x = ...`.
      if (meaningful[i - 1]?.value === '.') {
        const owner = meaningful[i - 2];
        if (owner?.type === 'identifier' && (owner.value === '_G' || owner.value === '_ENV')) {
          bound.add(t.value);
        }
      } else {
        bound.add(t.value);
      }
    }
  }

  // Pass 2: every identifier read in a value position that nothing defined.
  for (let i = 0; i < meaningful.length; i++) {
    const t = meaningful[i];
    if (t.type !== 'identifier') continue;
    if (bound.has(t.value) || LUA_GLOBALS_SET.has(t.value)) continue;

    // `a.b` / `a:b` -- `b` is a field, not a global.
    const prev = meaningful[i - 1]?.value;
    if (prev === '.' || prev === ':') continue;
    // `x = 1` and `{ key = 1 }` are bindings/keys, handled in pass 1.
    if (meaningful[i + 1]?.value === '=') continue;

    out.push({
      line: t.line,
      column: t.column,
      message: `Undefined name "${t.value}": nothing in this file defines it.`,
      detail:
        `This compiles, so the game will load it and then crash at runtime - and because every mod ` +
        `shares one Lua state, that stops all mods loading. If another mod is meant to set it, note ` +
        `the load order is not guaranteed.`,
      severity: 'warning',
      rule: 'undefined-global',
    });
  }

  return out;
}

/**
 * Names read at a line where they are NOT visible (Track A / A4).
 *
 * This is the check that catches the reported bug: `t = r` inside an isolated
 * function used to pass because `local t` and `local r` were declared in two
 * OTHER functions. scanUndefinedGlobals() accepts that on purpose, because it
 * does not model scope -- but this pass does, via services/scope.ts.
 *
 * Same `rule` id and the same wording as the flat pass, so:
 *   - the console's Warn filter catches both
 *   - the 25-pack regression compares like with like
 *
 * Deliberately a WARNING, never an error. A scope model built on a hand-written
 * tokenizer is not a proof, and a false error on valid code is worse than a
 * missed one: the engine compiles fine and runs fine, so nothing is broken until
 * a rare branch runs. Every finding here is "suspicious", not "wrong".
 *
 * Names reached through a field access (`x.foo`, `x:foo`) are skipped: `foo` is
 * a table key, not a global read. Same reasoning as the flat pass.
 */
function scanUndefinedNamesInScope(code: string, meaningful: Token[]): SyntaxDiagnostic[] {
  const model = buildScopes(code);
  const out: SyntaxDiagnostic[] = [];

  for (let i = 0; i < meaningful.length; i++) {
    const t = meaningful[i];
    if (t.type !== 'identifier') continue;
    if (LUA_GLOBALS_SET.has(t.value)) continue;

    // `a.b` / `a:b` -- `b` is a field, not a global.
    const prev = meaningful[i - 1]?.value;
    if (prev === '.' || prev === ':') continue;
    // Table constructor keys and `x = 1` are bindings, not reads.
    if (meaningful[i + 1]?.value === '=') continue;

    // `local`/`function`/`for` introduce the name at this point, so the token is a
    // binding rather than a read. Same rule the flat pass uses.
    const prevKw = meaningful[i - 1]?.value;
    if (prevKw === 'local' || prevKw === 'function' || prevKw === 'for') continue;

    const visible = visibleAt(model, t.line);
    if (visible.some((v) => v.name === t.value)) continue;

    out.push({
      line: t.line,
      column: t.column,
      message: `Undefined name "${t.value}" in this scope: nothing visible here defines it.`,
      detail:
        `Another function in this file may declare a "${t.value}", but a local does not cross ` +
        `into this function -- at runtime this reads nil, or stops every mod loading.`,
      severity: 'warning',
      rule: 'undefined-global',
    });
  }

  return out;
}

/**
 * `wa.weapons.repalce(...)` -- a real namespace with a misspelled leaf.
 *
 * The namespace is genuine and the function is not, so this compiles cleanly, does
 * nothing at runtime, and the weapon silently never applies. Neither the game
 * compiler nor the scope-aware name check can see it: `wa.weapons` is a real
 * table, so every name in the path resolves.
 *
 * Only CALLS are checked (`wa.a.b(...)`). A bare `wa.a.b` on the right of an
 * assignment is a field write, not a call, and is left to the member checks.
 *
 * Warning, never error: BUILTIN_FUNCTIONS is pinned to WormForge 0.8.22 and may
 * lag the engine, so a key this build does not know is SUSPICIOUS, not wrong.
 */
function scanWaNamespaceTypos(meaningful: Token[], userVerbs: CustomVerb[] = []): SyntaxDiagnostic[] {
  const known = new Set(BUILTIN_FUNCTIONS.map((f) => f.name));
  const knownPaths = BUILTIN_FUNCTIONS.map((f) => f.name);
  for (const verb of userVerbs) {
    if (verb.class === 'wa' || verb.class.startsWith('wa.')) {
      const path = `${verb.class}.${verb.name}`;
      known.add(path);
      knownPaths.push(path);
    }
  }
  const out: SyntaxDiagnostic[] = [];

  for (let i = 0; i < meaningful.length - 2; i++) {
    const t = meaningful[i];
    if (t.type !== 'identifier' || t.value !== 'wa') continue;
    if (meaningful[i + 1]?.value !== '.') continue;

    // Rebuild the dotted path `wa . x . y . z`.
    const parts: string[] = ['wa'];
    let k = i + 1;
    while (k < meaningful.length && meaningful[k].value === '.' && meaningful[k + 1]?.type === 'identifier') {
      parts.push(meaningful[k + 1].value);
      k += 2;
    }

    // Is this reference part of a short-circuit CAPABILITY CHECK?
    //
    //   wa.worms.active and wa.worms.active()
    //   wa.worms.all    and wa.worms.all()[1]
    //   if wa.some_api then wa.some_api() end
    //
    // These are the standard Lua idioms for "use this API if it exists", and
    // they are exactly what a pack writes to support more than one engine version.
    // Flagging them is WRONG: the code is correct, deliberate, and short-circuits
    // to a safe fallback instead of crashing.
    //
    // This exact line was found in the user's bee.lua and reported as a typo
    // before the guard existed. A reference that is TESTED before being CALLED is
    // a deliberate feature probe, not a mistake.
    const nextTok = meaningful[k]?.value;
    const prevTok = meaningful[i - 1]?.value;
    if (nextTok === 'and' || nextTok === 'or' || prevTok === 'and' || prevTok === 'or') {
      i = k - 1;
      continue;
    }
    // `if wa.some_api then wa.some_api() end`. The PROBE half is preceded by `if`
    // and ends at `then`; the CALL half sits immediately after `then`. Both must
    // be skipped -- catching only the first reported the second as a typo.
    if (prevTok === 'if' || prevTok === 'then') {
      i = k - 1;
      continue;
    }

    // Must be a call: `f(` immediately after the path, not `= `.
    if (nextTok !== '(') continue;

    const path = parts.join('.');
    if (known.has(path)) continue;

    // Is the NAMESPACE real? `wa.weapoons.repalce` has a bad namespace and is a
    // different (and louder) mistake; both are reported the same way here, but
    // the suggestion is only offered when the prefix is known-good.
    const namespace = parts.slice(0, -1).join('.');
    const namespaceKnown = knownPaths.some((p) => p.startsWith(namespace + '.'));
    const leaf = parts[parts.length - 1];

    const suggestion = namespaceKnown ? suggestWaFunction(leaf, knownPaths) : null;

    out.push({
      line: t.line,
      column: t.column,
      message:
        `Unknown wa.* function "${path}". ` +
        (namespaceKnown
          ? `"${namespace}" is a real namespace, but "${leaf}" is not a function in it.`
          : `"${parts.slice(1, -1).join('.')}" is not a known wa namespace either.`) +
        (suggestion ? ` Did you mean "${suggestion}"?` : ''),
      detail:
        'The call does nothing at runtime, so the code loads and the effect never happens.',
      severity: 'warning',
      rule: 'wa-namespace-typo',
    });

    // Continue PAST the path so `wa.a.b(...).c(...)` is not reported twice. The loop
    // increments `i` itself, so this sets it to the token BEFORE the call's `(`.
    i = k - 1;
  }

  return out;
}

/**
 * `wa.weapons.replace({ copy_fromm = "mine" })` -- a misspelled spec key.
 *
 * Lua does not complain: the table simply carries an extra key the engine never
 * reads, so the intended effect is silently missing. This is the same class of
 * bug as a misspelled `wa.*` function, in the place it actually bites.
 *
 * Only keys DIRECTLY inside the spec table are checked, not nested `patch = {...}`
 * contents, and never keys in an ordinary table elsewhere in the file.
 *
 * Warning, never error: WEAPON_SPEC_KEYS is hand-maintained and errs toward
 * inclusion, but the engine can still accept a key this build does not list.
 */
function scanSpecKeyTypos(meaningful: Token[]): SyntaxDiagnostic[] {
  const out: SyntaxDiagnostic[] = [];

  for (let i = 0; i < meaningful.length - 1; i++) {
    const t = meaningful[i];
    if (t.type !== 'identifier') continue;
    if (t.value !== 'wa') continue;
    // Require `wa.weapons.replace(` or `wa.weapons.register(` -- the two calls
    // that take a spec table.
    if (
      meaningful[i + 1]?.value !== '.' ||
      meaningful[i + 2]?.value !== 'weapons' ||
      meaningful[i + 3]?.value !== '.' ||
      meaningful[i + 4]?.type !== 'identifier'
    ) {
      continue;
    }
    const fn = meaningful[i + 4].value;
    if (fn !== 'replace' && fn !== 'register') continue;

    // Find the `(` then its matching `)`. Keys are `name =` at DEPTH 1 inside.
    let open = i + 5;
    while (open < meaningful.length && meaningful[open].value !== '(') open++;
    if (open >= meaningful.length) continue;

    // Walk the argument list looking for `key =` pairs that are DIRECTLY in the spec
    // table.
    //
    // Depth is counted over `{`/`}` ONLY, and a `function` keyword opens an
    // implicit block whose closing `end` is NOT a `}`. Counting only braces means
    // a `}` inside a nested table (`patch = { ... }`) correctly reads as deeper,
    // while an `if`/`for`/`function` body -- whose `end` has no brace at all --
    // leaves the depth unchanged, which is the point.
    //
    // That still is not enough on its own: inside `on_fire = function(fire)
    // ... end`, the body is at brace-depth 1, the same as a real spec key. So a
    // `function`/`if`/`for`/`while`/`do` in the value position pushes a SENTINEL
    // that only the matching `end` clears. Without it every `local worm = ...`
    // inside a callback was reported as an unrecognised spec key -- 28 false
    // positives across the example packs.
    let depth = 0;
    let blockDepth = 0;
    for (let j = open; j < meaningful.length; j++) {
      const tk = meaningful[j];
      const v = tk.value;

      if (tk.type === 'keyword') {
        // `end` closes one implicit block; `elseif`/`else` do not add one.
        if (v === 'end') {
          if (blockDepth > 0) blockDepth--;
          continue;
        }
        if (v === 'if' || v === 'for' || v === 'while' || v === 'do' || v === 'repeat' || v === 'function') {
          blockDepth++;
          continue;
        }
        continue; // local, return, nil, true, ... are not structure here
      }

      if (v === '{') {
        depth++;
        continue;
      }
      if (v === '}') {
        depth--;
        if (depth < 0) break; // malformed, do not run off the end
        continue;
      }
      // `)` back at brace-depth 0 ends the argument list.
      if (v === ')' && depth === 0) break;

      // Inside a callback body: everything here is ordinary Lua, not spec keys.
      if (blockDepth > 0) continue;
      // Directly in the spec table. Anything deeper is inside `patch = { ... }`.
      if (depth !== 1) continue;
      if (tk.type !== 'identifier') continue;
      if (meaningful[j + 1]?.value !== '=') continue;

      const key = meaningful[j].value;
      if (WEAPON_SPEC_KEY_SET.has(key.toLowerCase())) continue;

      const suggestion = suggestSpecKey(key);
      out.push({
        line: meaningful[j].line,
        column: meaningful[j].column,
        message:
          `Unrecognized spec key "${key}" in wa.weapons.${fn}{...}. ` +
          (suggestion ? `Did you mean "${suggestion}"?` : ''),
        detail: 'The engine ignores unknown keys, so this line has no effect.',
        severity: 'warning',
        rule: 'spec-key-typo',
      });
    }
  }

  return out;
}

/**
 * `wa.on.worm_message(fn)` -- a handler that could name the messages it wants.
 *
 * WA sends every worm several messages a frame and enters Lua for each one, so an
 * unfiltered handler runs a few hundred times per second just to compare `msg`
 * against one constant and return. The engine can skip that dispatch entirely if
 * the handler says up front which messages it cares about:
 *
 *   wa.on.worm_message(function(worm, msg)
 *     if msg == wa.msg.FRAME_FINISH then ... end
 *   end, { msgs = { wa.msg.FRAME_FINISH } })
 *
 * This is NOT a correctness check and is `info`, like `lockstep-pairs`: the
 * unfiltered code is correct, it is just paying for messages it ignores.
 *
 * It only fires when the change is PROVABLY behaviour-preserving, which needs all
 * three of:
 *
 *  - exactly one argument, so no filter is already there;
 *  - an inline `function(worm, msg)` -- a named callback is not read, so nothing
 *    can be said about it, and a differently-shaped parameter list is not assumed;
 *  - EVERY use of `msg` in the body is a `msg == wa.msg.X` / `msg ~= wa.msg.X`
 *    comparison. If `msg` is logged, indexed, compared numerically, or otherwise
 *    used, the handler is doing something the engine cannot be told to skip, and
 *    the check stays silent.
 *
 * With that last condition the handler already ignores every message it does not
 * name, so filtering can only remove work, never change a result. The reverse is
 * not true, which is the whole reason this is narrow.
 */
function scanWormMessageFilter(meaningful: Token[]): SyntaxDiagnostic[] {
  const out: SyntaxDiagnostic[] = [];
  const COMPARES = ['==', '~='];

  for (let i = 0; i < meaningful.length - 4; i++) {
    const t = meaningful[i];
    if (t.type !== 'identifier' || t.value !== 'wa') continue;
    if (
      meaningful[i + 1]?.value !== '.' ||
      meaningful[i + 2]?.value !== 'on' ||
      meaningful[i + 3]?.value !== '.' ||
      meaningful[i + 4]?.value !== 'worm_message'
    ) {
      continue;
    }
    // `(` right after the name, so this is a call and not a field read.
    if (meaningful[i + 5]?.value !== '(') continue;

    // The first argument must be an INLINE function. `wa.on.worm_message(handler)`
    // gives a name, not a body, and is left alone.
    let j = i + 6;
    if (meaningful[j]?.type !== 'keyword' || meaningful[j]?.value !== 'function') continue;

    // Parameter list. The last parameter must be named `msg`, which is the shape
    // the engine calls with; anything else is not assumed to be this handler.
    if (meaningful[j + 1]?.value !== '(') continue;
    j += 2;
    const params: string[] = [];
    while (j < meaningful.length && meaningful[j].value !== ')') {
      const p = meaningful[j];
      // `worm, msg` -- the separator is punctuation, not a parameter. Anything
      // else that is not a plain name (a default value, a `...`) is not assumed
      // to be this handler.
      if (p.value === ',') {
        j++;
        continue;
      }
      if (p.type !== 'identifier') {
        params.length = 0;
        break;
      }
      params.push(p.value);
      j++;
    }
    if (params.length === 0 || params[params.length - 1] !== 'msg') continue;
    j++; // step past the `)`

    // Find the `end` that closes this function.
    //
    // Three things about Lua block keywords matter here, and getting any one wrong
    // means the body never closes and the finding is silently lost:
    //
    //  - `repeat` is closed by `until`, not `end`.
    //  - `elseif` and `then` open nothing.
    //  - `for ... do` and `while ... do` are ONE block, but they are TWO keywords.
    //    Counting both opened the depth twice and closed it once, so a handler with
    //    a loop in it -- which is most of them -- never terminated and produced
    //    nothing. That was the whole of the Rust-vs-TypeScript drift on the corpus.
    //    A `do` therefore only opens a block when no `for`/`while` is waiting for one.
    let depth = 1;
    let pendingDo = false;
    const bodyStart = j;
    let bodyEnd = -1;
    for (; j < meaningful.length; j++) {
      const tk = meaningful[j];
      if (tk.type === 'keyword') {
        const v = tk.value;
        if (v === 'end' || v === 'until') {
          depth--;
          if (depth === 0) {
            bodyEnd = j;
            break;
          }
        } else if (v === 'for' || v === 'while') {
          depth++;
          pendingDo = true;
        } else if (v === 'do') {
          // The `do` of `for ... do` / `while ... do` closes the loop header rather
          // than opening a block of its own.
          if (pendingDo) pendingDo = false;
          else depth++;
        } else if (v === 'if' || v === 'repeat' || v === 'function') {
          depth++;
        }
      }
    }
    if (bodyEnd === -1) continue;

    // One argument only. A `,` here is an opts table -- the filter is already there.
    if (meaningful[bodyEnd + 1]?.value !== ')') continue;

    // Walk every `msg` in the body. Each one must sit directly against a
    // `==`/`~=` and be compared to `wa.msg.NAME`.
    const names: string[] = [];
    let unsafe = false;
    let uses = 0;
    for (let k = bodyStart; k < bodyEnd && !unsafe; k++) {
      if (meaningful[k].type !== 'identifier' || meaningful[k].value !== 'msg') continue;
      // `wa.msg.X` also contains the identifier `msg`; that is the constant's
      // table, not the parameter.
      if (meaningful[k - 1]?.value === '.' || meaningful[k + 1]?.value === '.') continue;
      uses++;

      const op = meaningful[k + 1];
      if (op?.type !== 'operator' || !COMPARES.includes(op.value)) {
        unsafe = true;
        break;
      }
      // `msg == wa.msg.NAME` -- NAME is six tokens along, not five: the `.` is
      // part of the path and must not be mistaken for the constant's name.
      const name = meaningful[k + 6];
      if (
        meaningful[k + 2]?.value !== 'wa' ||
        meaningful[k + 3]?.value !== '.' ||
        meaningful[k + 4]?.value !== 'msg' ||
        meaningful[k + 5]?.value !== '.' ||
        name?.type !== 'identifier'
      ) {
        unsafe = true;
        break;
      }
      if (!names.includes(name.value)) names.push(name.value);
    }

    // No `msg` use at all: there is nothing to name, and nothing to prove.
    if (unsafe || uses === 0) continue;

    const list = names.map((n) => `wa.msg.${n}`).join(', ');
    out.push({
      line: t.line,
      column: t.column,
      // The suggestion is the whole point and it is short. The ~470-character
      // original explained why the change is behaviour-preserving INSIDE the
      // message, which on a 1366-wide console is ~60 wrapped lines for one
      // finding -- long enough to hide every other row in the list. All of that
      // reasoning is real and belongs to the user, so it moves to `detail`
      // behind the Info button rather than being deleted. Mirrors the Rust side
      // in checks.rs, which the `starts_with`-style tests there also pin.
      message: `Pass the messages up front: { msgs = { ${list} } }`,
      detail:
        `This handler enters Lua for every message WA sends each worm, then tests \`msg\` itself. ` +
        `Every use of \`msg\` here is a comparison against wa.msg, so passing the messages up front -- ` +
        `\`wa.on.worm_message(function(worm, msg) ... end, { msgs = { ... } })\` -- runs the same code ` +
        `on the same messages without the dispatch for the rest. Filtered and unfiltered handlers run ` +
        `together in registration order, so this changes neither what runs nor what gets eaten.`,
      severity: 'info',
      rule: 'worm-msg-filter',
    });
  }

  return out;
}

/** The "Unknown <Handle> method" warning, shared by every registry row. */
function pushUnknownMethod(
  expected: { className: string; rule: string; note?: string },
  cls: ClassDef | undefined,
  method: string,
  at: Token,
  diagnostics: SyntaxDiagnostic[]
): void {
  if (!cls) return;
  const validMethods = cls.members
    .filter((m) => m.kind === 'method')
    .map((m) => m.name)
    .join(', ');
  // Short message = the error plus, when the registry supplies one, a targeted
  // hint. The full valid-method list moves to `detail`: it is what you need to
  // fix the typo, but only once you have decided the name really is wrong, and
  // it wraps off a 1366-wide console row. Mirrors checks.rs, which splits the
  // same two halves.
  diagnostics.push({
    line: at.line,
    column: at.column,
    message: `Unknown ${expected.className} method "${method}".`,
    detail: expected.note ? expected.note : `Valid methods include: ${validMethods}`,
    severity: 'warning',
    rule: expected.rule,
  });
}


export function parseAndValidate(
  code: string,
  userVerbs: CustomVerb[] = []
): {
  tokens: Token[];
  diagnostics: SyntaxDiagnostic[];
  symbols: ParsedSymbolTree;
} {
  const { tokens, diagnostics } = tokenize(code);
  const meaningfulTokens = tokens.filter((t) => t.type !== 'whitespace' && t.type !== 'comment');

  // Structural Syntax Checks: Bracket Balance and Block Structure
  const bracketStack: { char: string; token: Token }[] = [];
  const blockStack: { keyword: string; token: Token; waitingForDo?: boolean }[] = [];

  for (let idx = 0; idx < meaningfulTokens.length; idx++) {
    const t = meaningfulTokens[idx];

    // Bracket checks
    if (t.type === 'punctuation') {
      if (['(', '[', '{'].includes(t.value)) {
        bracketStack.push({ char: t.value, token: t });
      } else if ([')', ']', '}'].includes(t.value)) {
        const last = bracketStack.pop();
        const expected: { [key: string]: string } = { ')': '(', ']': '[', '}': '{' };
        if (!last || last.char !== expected[t.value]) {
          diagnostics.push({
            line: t.line,
            column: t.column,
            message: `Mismatched closing bracket "${t.value}"`,
            severity: 'error',
          });
        }
      }
    }

    // Block checks
    if (t.type === 'keyword') {
      if (['function', 'if', 'repeat'].includes(t.value)) {
        blockStack.push({ keyword: t.value, token: t });
      } else if (['for', 'while'].includes(t.value)) {
        blockStack.push({ keyword: t.value, token: t, waitingForDo: true });
      } else if (t.value === 'do') {
        const top = blockStack[blockStack.length - 1];
        if (top && top.waitingForDo) {
          top.waitingForDo = false;
        } else {
          blockStack.push({ keyword: 'do', token: t });
        }
      } else if (t.value === 'end') {
        const match = blockStack.pop();
        if (!match) {
          diagnostics.push({
            line: t.line,
            column: t.column,
            message: 'Extraneous "end" without matching block opening',
            severity: 'error',
          });
        } else if (match.keyword === 'repeat') {
          diagnostics.push({
            line: t.line,
            column: t.column,
            message: '"repeat" block must be terminated with "until", not "end"',
            severity: 'error',
          });
        } else if (match.waitingForDo) {
          diagnostics.push({
            line: match.token.line,
            column: match.token.column,
            message: `Missing "do" in "${match.keyword}" block before "end"`,
            severity: 'error',
          });
        }
      } else if (t.value === 'until') {
        const match = blockStack.pop();
        if (!match || match.keyword !== 'repeat') {
          diagnostics.push({
            line: t.line,
            column: t.column,
            message: 'Unexpected "until" without a preceding "repeat" block',
            severity: 'error',
          });
        }
      }
    }
  }

  // Check unclosed brackets
  while (bracketStack.length > 0) {
    const item = bracketStack.pop()!;
    diagnostics.push({
      line: item.token.line,
      column: item.token.column,
      message: `Unclosed bracket "${item.char}"`,
      severity: 'error',
    });
  }

  // Check unclosed blocks
  while (blockStack.length > 0) {
    const item = blockStack.pop()!;
    diagnostics.push({
      line: item.token.line,
      column: item.token.column,
      message: item.waitingForDo
        ? `Unclosed "${item.keyword}" block: missing matching "do" and "end"`
        : `Unclosed "${item.keyword}" block: missing matching "end"`,
      severity: 'error',
    });
  }

  // Symbol Extraction
  const extractedVariables: VariableDef[] = [];
  const extractedFunctions: FunctionDef[] = [];
  const extractedClasses: ClassDef[] = [];
  const extractedVerbNames: Set<string> = new Set();

  // Receivers narrowed by a `x.kind == "..."` test somewhere in the file are a
  // runtime union, not one fixed handle. Highlander does this with `obj`:
  //
  //   for _, obj in ipairs(wa.world.electrical_nearby(...)) do
  //     if obj.kind == "worm" then obj:hurt(1)
  //     elseif obj.kind == "mine" then obj:arm(fuse) end
  //
  // `obj` on its own only says WorldHandle, so the receiver check below would
  // call `hurt` unknown and warn - even though the `kind` guard is right there.
  // For those we accept a method any handle has, and report where we had to.
  const duckTypedReceivers = new Set<string>();
  for (let i = 1; i < meaningfulTokens.length - 2; i++) {
    if (meaningfulTokens[i].value !== '.') continue;
    const recv = meaningfulTokens[i - 1];
    const prop = meaningfulTokens[i + 1];
    const op = meaningfulTokens[i + 2];
    if (recv?.type !== 'identifier' || prop?.value !== 'kind') continue;
    if (op?.value !== '==' && op?.value !== '~=') continue;
    duckTypedReceivers.add(recv.value);
  }

  // Resolution step 1: locals whose value is a call to a function whose
  // declared returnType names a handle. Computed from the source once, before
  // the walk, so the receiver check below can ask it first and only fall back
  // to the name table when the code itself says nothing.
  const tracedTypes = traceLocalTypes(code);

  // One entry per `receiver:method()` that only passed because the receiver is
  // duck-typed. Reported together at the end, so a file with a dozen branches
  // produces one notice instead of a dozen warnings.
  const unionPasses: {
    receiver: string;
    method: string;
    assumedClass: string;
    owners: string[];
    lines: number[];
  }[] = [];

  for (let idx = 0; idx < meaningfulTokens.length; idx++) {
    const t = meaningfulTokens[idx];

    // Local variable or function: local x = ... or local function f(...)
    if (t.type === 'keyword' && t.value === 'local') {
      const next = meaningfulTokens[idx + 1];
      if (next && next.type === 'keyword' && next.value === 'function') {
        const funcNameTok = meaningfulTokens[idx + 2];
        if (funcNameTok && funcNameTok.type === 'identifier') {
          extractedFunctions.push({
            name: funcNameTok.value,
            parameters: extractParams(meaningfulTokens, idx + 3),
            description: `Local function defined in script at line ${funcNameTok.line}`,
            scope: 'module',
          } as any);
        }
      } else if (next && next.type === 'identifier') {
        let k = idx + 1;
        while (k < meaningfulTokens.length && meaningfulTokens[k].type === 'identifier') {
          const varName = meaningfulTokens[k].value;
          extractedVariables.push({
            name: varName,
            type: 'local',
            description: `Local variable declared at line ${meaningfulTokens[k].line}`,
            scope: 'module',
          });
          k++;
          if (meaningfulTokens[k]?.value === ',') {
            k++;
          } else {
            break;
          }
        }
      }
    }

    // Global / table function: function name(...) or function obj:method(...) or function obj.func(...)
    if (t.type === 'keyword' && t.value === 'function') {
      const prev = meaningfulTokens[idx - 1];
      if (!prev || prev.value !== 'local') {
        const next = meaningfulTokens[idx + 1];
        if (next && next.type === 'identifier') {
          let fullName = next.value;
          let k = idx + 2;
          let isMethod = false;
          while (
            k < meaningfulTokens.length &&
            (meaningfulTokens[k].value === '.' || meaningfulTokens[k].value === ':') &&
            meaningfulTokens[k + 1]?.type === 'identifier'
          ) {
            if (meaningfulTokens[k].value === ':') isMethod = true;
            fullName += meaningfulTokens[k].value + meaningfulTokens[k + 1].value;
            k += 2;
          }

          extractedFunctions.push({
            name: fullName,
            parameters: extractParams(meaningfulTokens, k),
            description: `Function defined at line ${next.line}${isMethod ? ' (method)' : ''}`,
            scope: 'global',
          } as any);
        }
      }
    }

    // Arrow Operator Check: '->' is NOT valid Lua in WormForge
    if (t.type === 'arrow' || t.value === '->') {
      const leftTok = meaningfulTokens[idx - 1];
      const rightTok = meaningfulTokens[idx + 1];
      const target = leftTok?.value || 'object';
      const member = rightTok?.value || 'member';

      diagnostics.push({
        line: t.line,
        column: t.column,
        message: `'->' is not a valid operator in WormForge Lua (it belongs to PX engine internals). Use '.' for functions/properties (${target}.${member}) or ':' for method calls (${target}:${member}()).`,
        severity: 'error',
        rule: 'invalid-arrow-operator',
      });
    }

    // Custom Class & Namespace Member extraction via '.' or ':'
    if (t.value === '.' || t.value === ':') {
      const leftTok = idx > 0 ? meaningfulTokens[idx - 1] : undefined;
      const rightTok = idx + 1 < meaningfulTokens.length ? meaningfulTokens[idx + 1] : undefined;

      // Incomplete trailing colon or dot
      if (!rightTok) {
        diagnostics.push({
          line: t.line,
          column: t.column,
          message: `Syntax Error: incomplete expression: expected member identifier after "${t.value}".`,
          severity: 'error',
          rule: 'incomplete-member-expression',
        });
      } else if (leftTok && leftTok.type === 'identifier' && rightTok.type !== 'identifier') {
        // Unexpected token after colon or dot (e.g. something:1 or something:1abc or something:"str")
        const isTableLikely = t.value === ':';
        const msg = isTableLikely
          ? `Syntax Error: unexpected ${rightTok.type} "${rightTok.value}" after ":". Method calls require an identifier (e.g. ${leftTok.value}:method()). If you intended a table field, use "=" instead of ":" in Lua (e.g. ${leftTok.value} = ${rightTok.value}).`
          : `Syntax Error: unexpected ${rightTok.type} "${rightTok.value}" after ".". Expected property or function identifier.`;

        diagnostics.push({
          line: rightTok.line,
          column: rightTok.column,
          message: msg,
          severity: 'error',
          rule: 'invalid-member-name',
        });
      } else if (leftTok && leftTok.type === 'identifier' && rightTok && rightTok.type === 'identifier') {
        const className = leftTok.value;
        const memberName = rightTok.value;
        const isColon = t.value === ':';

        extractedVerbNames.add(memberName);

        let params: any[] = [];
        const openParen = meaningfulTokens[idx + 2];
        if (openParen && openParen.value === '(') {
          params = extractTypedParams(meaningfulTokens, idx + 3);
        }

        let cls = extractedClasses.find((c) => c.name === className);
        if (!cls) {
          cls = {
            name: className,
            description: `Custom Class identified via Lua syntax (${className}${t.value}${memberName}) at line ${leftTok.line}`,
            isCustom: true,
            syntaxExample: `${className}${t.value}${memberName}(...)`,
            members: [],
          };
          extractedClasses.push(cls);
        }

        if (!cls.members.some((m) => m.name === memberName)) {
          cls.members.push({
            name: memberName,
            kind: isColon ? 'method' : (openParen?.value === '(' ? 'method' : 'property'),
            parameters: params,
            description: `Custom ${isColon ? 'method' : (openParen?.value === '(' ? 'function' : 'property')} invoked on ${className}`,
            example: `${className}${t.value}${memberName}(${params.map((p) => p?.name || '').join(', ')})`,
            isCustom: true,
          });
        }
      }
    }

    // WormForge Method invocation check: e.g. a:move, worm:hurt, a:explode
    if (t.value === ':') {
      const left = meaningfulTokens[idx - 1];
      const right = meaningfulTokens[idx + 1];
      if (left && right && right.type === 'identifier') {
        const method = right.value;
        // Resolution order, most accurate first:
        //   1. the traced call-site returnType (`local x = wa.worms.nearest(...)`)
        //   2. the name table -- confident names only, via resolveForCheck
        // then, if the receiver is .kind-narrowed, the duck-typed union above.
        // Autocomplete may guess loosely, but a wrong guess here is a false
        // error on valid code, so step 2 only claims names it is sure about.
        const tracedClass = tracedTypes.get(left.value);
        const expected = tracedClass
          ? rowForClass(tracedClass)
          : resolveForCheck(left.value);
        if (expected) {
          const cls = getClass(expected.className);
          // The user's own verbs are as real as engine members. This overlay
          // is why `worm:grapple()` is silent after registering
          // WormEntity:grapple -- `customVerbs` arrives per check from
          // custom_verbs.cfg, never from a global, so the browser path and the
          // desktop path read the same list.
          const customHit = customMembersFor(expected.className, userVerbs).includes(method);
          const hasIt = customHit || !!cls?.members.some((m) => m.name === method);

          if (hasIt) {
            // Fine on the assumed handle. Nothing to say.
          } else if (duckTypedReceivers.has(left.value)) {
            // The receiver is narrowed by a `.kind` test, so the assumed handle
            // is only one of several. Accept any handle that has the method --
            // or any class the user extended with it.
            // Widened to string[] on purpose: custom owner names appended
            // below are arbitrary identifiers, not HandleClassName members.
            const owners: string[] = ALL_HANDLE_CLASSES.filter(
              (name) =>
                getClass(name)?.members.some((m) => m.name === method) ||
                customMembersFor(name, userVerbs).includes(method)
            );
            // A user class that is NOT an engine class can own the method too
            // (GhostProxy:hurt in custom_verbs.cfg). checks.rs appends custom
            // owners after the engine ones, in overlay order, so both engines
            // read `WormEntity and GhostProxy`. Without this loop TS would
            // show a shorter owner list than Rust for the same file+cfg.
            for (const v of userVerbs) {
              if (v.name === method && !owners.includes(v.class)) owners.push(v.class);
            }
            if (owners.length > 0) {
              const key = `${left.value}:${method}`;
              const seen = unionPasses.find((u) => `${u.receiver}:${u.method}` === key);
              if (seen) {
                seen.lines.push(right.line);
              } else {
                unionPasses.push({
                  receiver: left.value,
                  method,
                  assumedClass: expected.className,
                  owners,
                  lines: [right.line],
                });
              }
            } else {
              pushUnknownMethod(expected, cls, method, right, diagnostics);
            }
          } else {
            pushUnknownMethod(expected, cls, method, right, diagnostics);
          }
        }
      }
    }

    // Check for banned lockstep patterns (e.g. math.random). These are the
    // Lua 5.4 standard library forms -- they are NOT the same as the engine's
    // wa.math.* forms, which the user replaces them with because the engine
    // forms are deterministic across every lockstep peer.
    const bannedLockstep = [
      { name: 'random', hint: 'Use "wa.random(min, max)" to draw from Worms Armageddon\'s shared lockstep RNG.' },
      { name: 'randomseed', hint: 'Use "wa.random(min, max)" to draw from Worms Armageddon\'s shared lockstep RNG.' },
      { name: 'cos', hint: 'Use "wa.math.cos(...)" -- the engine\'s deterministic sine table -- instead.' },
      { name: 'sin', hint: 'Use "wa.math.sin(...)" -- the engine\'s deterministic sine table -- instead.' },
      { name: 'atan', hint: 'Use "wa.math.atan(y, x)" -- the engine\'s deterministic arctangent -- instead.' },
    ] as const;
    const afterDot = meaningfulTokens[idx - 1]?.value === '.';
    for (const b of bannedLockstep) {
      if (!afterDot && t.value === 'math' && meaningfulTokens[idx + 1]?.value === '.' && meaningfulTokens[idx + 2]?.value === b.name) {
        diagnostics.push({
          line: t.line,
          column: t.column,
          message: `Lockstep Violation: "math.${b.name}" is disabled in WormForge to prevent desyncs. ${b.hint}`,
          severity: 'error',
          rule: 'lockstep-rng',
        });
      }
    }

    // Check for pairs() without wa.sorted() on string keys
    if (t.value === 'pairs' && meaningfulTokens[idx + 1]?.value === '(') {
      diagnostics.push({
        line: t.line,
        column: t.column,
        message: 'Determinism Warning: standard "pairs()" order varies across processes for string-keyed tables. Consider using "ipairs(wa.sorted(table))" if table iteration order affects simulation physics.',
        severity: 'info',
        rule: 'lockstep-pairs',
      });
    }
  }

  // Names that compile but die at runtime. See scanUndefinedGlobals for why
  // that is not caught by the game compiler.
  diagnostics.push(...scanUndefinedGlobals(meaningfulTokens));

  // The scope-aware pass on top. Strictly narrower than the one above: it reports
  // a subset of the same `rule`, so it can add findings but never contradict or
  // remove one. This is what catches a local leaking between functions.
  diagnostics.push(...scanUndefinedNamesInScope(code, meaningfulTokens));

  // Silent-failure checks: a typo here loads fine, runs fine, and simply does
  // nothing, which is the exact class of bug the compiler cannot catch.
  diagnostics.push(...scanWaNamespaceTypos(meaningfulTokens, userVerbs));
  diagnostics.push(...scanSpecKeyTypos(meaningfulTokens));
  diagnostics.push(...scanWormMessageFilter(meaningfulTokens));

  // One notice per duck-typed `receiver:method()` that the assumed handle alone
  // would have rejected. Severity `info`, not `warning`: the code is valid, and
  // the console's Errors/Warn filters plus the clear button keep it out of the way.
  for (const u of unionPasses) {
    diagnostics.push({
      line: u.lines[0],
      column: 1,
      message:
        `Passed - lines ${formatLines(u.lines)} call \`${u.receiver}:${u.method}()\`, which ` +
        `${u.owners.join(' and ')} has but ${u.assumedClass} does not.`,
      detail:
        `\`${u.assumedClass}\` -- what \`${u.receiver}\` alone suggests -- does not have this method. ` +
        `\`${u.receiver}\` is narrowed by a \`.kind\` test, so it is a different handle in each branch. ` +
        `That is correct while every branch is covered; a missing one only breaks in-game, when the ` +
        `engine runs this method on the wrong handle.`,
      severity: 'info',
      rule: 'handle-union',
    });
  }

  // Combine built-in classes with user-defined extracted classes without mutating builtins
  const classes: ClassDef[] = BUILTIN_CLASSES.map((c) => ({
    ...c,
    members: [...c.members],
  }));

  for (const c of extractedClasses) {
    const existing = classes.find((ec) => ec.name === c.name);
    if (existing) {
      for (const m of c.members) {
        if (!existing.members.some((em) => em.name === m.name)) {
          existing.members.push(m);
        }
      }
    } else {
      classes.push(c);
    }
  }

  // Deduplicate variables
  const variables: VariableDef[] = [];
  const seenVars = new Set<string>();
  for (const v of BUILTIN_VARIABLES) {
    if (!seenVars.has(v.name)) {
      seenVars.add(v.name);
      variables.push(v);
    }
  }
  for (const v of extractedVariables) {
    if (!seenVars.has(v.name)) {
      seenVars.add(v.name);
      variables.push(v);
    }
  }

  // Deduplicate functions
  const functions: FunctionDef[] = [];
  const seenFuncs = new Set<string>();
  for (const f of BUILTIN_FUNCTIONS) {
    if (!seenFuncs.has(f.name)) {
      seenFuncs.add(f.name);
      functions.push(f);
    }
  }
  for (const f of extractedFunctions) {
    if (!seenFuncs.has(f.name)) {
      seenFuncs.add(f.name);
      functions.push(f);
    }
  }

  return {
    tokens,
    diagnostics,
    symbols: {
      functions,
      variables,
      classes,
      enums: BUILTIN_ENUMERATIONS,
      customVerbs: Array.from(extractedVerbNames),
      diagnostics,
    },
  };
}

function extractParams(tokens: Token[], startIdx: number): any[] {
  const params: any[] = [];
  let i = startIdx;
  if (tokens[i]?.value === '(') i++;

  while (i < tokens.length && tokens[i]?.value !== ')') {
    const val = tokens[i]?.value;
    if (val === '\n' || val === ';' || val === 'end' || val === 'local' || val === 'function') break;
    if (tokens[i]?.type === 'identifier') {
      params.push({
        name: tokens[i].value,
        type: 'any',
      });
    }
    i++;
  }
  return params;
}

function extractTypedParams(tokens: Token[], startIdx: number): any[] {
  const params: any[] = [];
  let i = startIdx;
  while (i < tokens.length && tokens[i]?.value !== ')') {
    const val = tokens[i]?.value;
    if (val === '\n' || val === ';' || val === 'end' || val === 'local' || val === 'function') break;
    if (tokens[i]?.type === 'identifier') {
      const name = tokens[i].value;
      let type = 'any';
      if (tokens[i + 1]?.value === ':') {
        const typeTok = tokens[i + 2];
        if (typeTok && (typeTok.type === 'identifier' || typeTok.type === 'type')) {
          type = typeTok.value;
          i += 2;
        }
      }
      params.push({ name, type });
    }
    i++;
  }
  return params;
}
