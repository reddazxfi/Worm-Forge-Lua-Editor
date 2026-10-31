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
  ITERATOR_ELEMENT,
  LOOP_ITERATOR_WRAPPERS,
  resolveForCheck,
  rowForClass,
  traceLocalTypes,
  type HandleClassName,
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

    // Same `or` carve-out as the scoped pass below, and it has to be here too: both
    // passes fire at the same position, so if only one of them downgraded, which
    // version reached the console would depend on which won the merge.
    if (isNilGuarded(meaningful, i)) {
      out.push({
        line: t.line,
        column: t.column,
        message: `Undefined name "${t.value}" reads nil here, but the \`or\` fallback handles it.`,
        detail:
          `Nothing in this file defines it, and nothing injects it at runtime either -- the ` +
          `engine's own \`cargo test\` harnesses set a few names like this for \`mods/px\`.`,
        severity: 'info',
        rule: 'undefined-global',
      });
      continue;
    }

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

    // `X or default` is the standard Lua "this may be nil" idiom, and it is handled
    // as an INFO rather than a warning -- see the same carve-out in scopes.rs.
    if (isNilGuarded(meaningful, i)) {
      out.push({
        line: t.line,
        column: t.column,
        message: `Undefined name "${t.value}" reads nil here, but the \`or\` fallback handles it.`,
        detail:
          `Nothing here defines it, and nothing injects it at runtime either -- the engine's ` +
          `own \`cargo test\` harnesses set a few names like this for \`mods/px\`, which is why ` +
          `the pack reads them defensively.`,
        severity: 'info',
        rule: 'undefined-global',
      });
      continue;
    }

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
 * True when the identifier at `i` is the LEFT operand of an `or`.
 *
 * Mirrors scopes.rs, where the check is on `Expression::BinaryOperator` with
 * `BinOp::Or`. The token test is equivalent for the shape that matters and, unlike
 * building an expression tree, costs one comparison -- this file is a tokeniser with
 * a bracket stack, so anything needing structure is where its bugs live.
 *
 * `X and Y or Z` also lands here, and correctly: Lua binds `and` tighter than `or`,
 * so it parses as `(X and Y) or Z`, and a nil `X` is absorbed by the `or`.
 */
function isNilGuarded(meaningful: Token[], i: number): boolean {
  // The obvious `meaningful[i + 1] === 'or'` is WRONG for `X and Y or Z`, which is
  // the one case worth getting right. Lua binds `and` tighter than `or`, so that
  // parses as `(X and Y) or Z`: a nil X is absorbed by the `or`, and scopes.rs -- which
  // matches on `Expression::BinaryOperator { binop: BinOp::Or, lhs }` and compares
  // positions -- already reports it as guarded. A next-token-only test would call it a
  // warning here and drift from Rust on the same file.
  //
  // So: scan forward for the `or` that governs this identifier, stopping at anything
  // that ends the expression or starts a new one. `.` and `:` are load-bearing --
  // without them `t.missing or 1` would mark `t` guarded, which has nothing to do with
  // `missing` being a field read.
  const STOPS = new Set([
    ',', ';', '(', ')', '{', '}', '=', '.', ':',
    // Keywords that end the statement the identifier sits in.
    'local', 'return', 'then', 'do', 'end', 'if', 'else', 'elseif', 'while', 'until',
    'function', 'for', 'in', 'repeat', 'break', 'goto',
  ]);
  for (let k = i + 1; k < meaningful.length; k++) {
    const v = meaningful[k].value;
    if (v === 'or') return true;
    if (STOPS.has(v)) return false;
  }
  return false;
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
 * Warning, never error: BUILTIN_FUNCTIONS is pinned to WormForge 0.9.1 (API 4)
 * and may lag the engine, so a key this build does not know is SUSPICIOUS, not
 * wrong.
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

    // `wa.audit` is the ONE public namespace the engine installs behind a cargo
    // feature, so it can be named rather than guessed at -- and saying "unknown"
    // about a real API is wrong even when the build happens to lack it.
    //
    // crates/lua-host/src/api.rs:32:
    //
    //     #[cfg(feature = "diagnostics")]
    //     if wa.get::<Value>("audit")...is_nil() { wa.set("audit", audit) }
    //
    // Nothing else in api.rs adds a public `wa.*` under a feature (the other
    // diagnostics block installs `_debug_input` and `_debug_worm_state`, both
    // underscore-prefixed), so this is the whole of it. Still a WARNING, and still
    // correct for a stock build -- the call really does raise "attempt to call a
    // nil value" there. Only the explanation changes. Mirrors
    // DIAGNOSTICS_ONLY_NAMESPACE in checks.rs.
    const diagnosticsOnly = parts[1] === 'audit' && parts.length >= 2;

    out.push({
      line: t.line,
      column: t.column,
      message: diagnosticsOnly
        ? `"${path}" exists only in a build with the \`diagnostics\` feature.`
        : `Unknown wa.* function "${path}". ` +
          (namespaceKnown
            ? `"${namespace}" is a real namespace, but "${leaf}" is not a function in it.`
            : `"${parts.slice(1, -1).join('.')}" is not a known wa namespace either.`) +
          (suggestion ? ` Did you mean "${suggestion}"?` : ''),
      detail: diagnosticsOnly
        ? `\`wa.audit\` is installed by crates/lua-host/src/api.rs under ` +
          `#[cfg(feature = "diagnostics")], so a stock WormForge has no such namespace and ` +
          `this call raises "attempt to call a nil value". It also needs ` +
          `\`debug_input = true\` in the calling pack's mod.toml (actor.rs:2854). ` +
          `\`mods/tools\` declares it; a pack you ship must too.`
        : 'The call does nothing at runtime, so the code loads and the effect never happens.',
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


/**
 * A (startLine, startCol, endLine, endCol) span, both ends inclusive.
 * Same tuple the Rust checker uses for `render_regions`.
 */
type RenderRegion = [number, number, number, number];

/**
 * Body spans of every render context in the file: the function literals handed to
 * `wa.on.draw(...)` / `wa.on.hud(...)`, plus every function those reach BY NAME.
 *
 * `math.cos`/`sin`/`atan` inside one of those bodies is presentation-only --
 * per-client drawing never desyncs a match -- so lockstep-rng stays silent
 * there. Mirrors `RenderScan` in checks.rs, which mirrors the ENGINE's own rule
 * (`tools/check_sim_math.py`) rather than a guess at it.
 *
 * WHY THIS IS MORE THAN "the body of wa.on.draw(function() ... end)"
 * It used to be exactly that, and it produced two classes of false error on the
 * engine's own packs:
 *
 *   - `wa.on.hud` is the same kind of callback. spawn.rs:642: "wa.random: not
 *     inside wa.on.draw or wa.on.hud. They run at render time."
 *     docs/lua-pixel-units.md:49: "Draw/HUD callbacks may use CRT maths."
 *   - A draw callback nearly always DELEGATES. `px/lib/turret.lua:573` declares
 *     `local function sheet(...)` which rotates quad corners with `math.cos` and
 *     `math.sin` at line 576, and calls it from the draw callback. That is
 *     presentation. The engine's own checker passes the file; this one did not.
 *
 * So the rule is the engine's: a function is rendering if it is passed directly
 * to `wa.on.draw(`/`wa.on.hud(`, or is referenced by name from something already
 * rendering -- closed transitively. Everything else stays simulation.
 *
 * The conservative decline is kept and is also the engine's: only a FUNCTION
 * LITERAL argument is a root. `wa.on.draw(handler)` has an invisible body at the
 * call site, so its trig is not muted -- no false negatives.
 *
 * Block counting: Lua opens a block with `function`, `if`, `do` or `repeat`
 * (`do` also closes every `for`/`while` header, so those are not counted
 * separately) and closes it with `end` or `until`. `elseif`/`else` open nothing.
 */
function collectRenderRegions(meaningful: Token[]): RenderRegion[] {
  const isOpen = (v: string) => v === 'function' || v === 'if' || v === 'do' || v === 'repeat';
  const isClose = (v: string) => v === 'end' || v === 'until';

  /** One `function ... end`, located by token index rather than by position. */
  interface FnBody {
    /** Index of the `function` keyword. Nested functions sort after their parent. */
    fnKeyword: number;
    /** Index of the first token of the body (just past the parameter list). */
    start: number;
    /** Index of the `end` that closes it. */
    end: number;
    /** Last dotted segment of the declared name, lowercased. null when anonymous. */
    name: string | null;
  }

  const bodies: FnBody[] = [];

  for (let i = 0; i < meaningful.length; i++) {
    if (meaningful[i].value !== 'function') continue;

    // The name is whatever sits between `function` and the parameter list: `sheet`
    // in `local function sheet(`, `a.b.name` in `function a.b.name(`, `name` in
    // `function a.b:name(`. Anonymous functions have nothing there.
    let j = i + 1;
    const nameParts: string[] = [];
    while (
      j < meaningful.length &&
      meaningful[j].value !== '(' &&
      meaningful[j].value !== ')' &&
      meaningful[j].value !== 'end'
    ) {
      if (meaningful[j].type === 'identifier') nameParts.push(meaningful[j].value.toLowerCase());
      j++;
    }
    if (meaningful[j]?.value !== '(') continue; // not a function we can size

    // Skip the parameter list: the body starts at the token after its `)`.
    let p = 0;
    let bodyStart = -1;
    for (let k = j; k < meaningful.length; k++) {
      if (meaningful[k].value === '(') p++;
      else if (meaningful[k].value === ')') {
        p--;
        if (p === 0) {
          bodyStart = k + 1;
          break;
        }
      }
    }
    if (bodyStart < 0 || bodyStart >= meaningful.length) continue;

    // Walk to the `end` that closes THIS function.
    let depth = 1;
    let endIdx = -1;
    for (let k = i + 1; k < meaningful.length; k++) {
      const v = meaningful[k].value;
      if (isOpen(v)) depth++;
      else if (isClose(v)) {
        depth--;
        if (depth === 0) {
          endIdx = k;
          break;
        }
      }
    }
    if (endIdx < 0) continue; // unbalanced file: the syntax check reports it, not us

    bodies.push({
      fnKeyword: i,
      start: bodyStart,
      end: endIdx,
      name: nameParts.length ? nameParts[nameParts.length - 1] : null,
    });
  }

  // Roots: a function LITERAL handed straight to wa.on.draw / wa.on.hud.
  const RENDER_HOOKS = new Set(['draw', 'hud']);
  const roots = new Set<number>();
  for (let i = 0; i + 5 < meaningful.length; i++) {
    if (
      meaningful[i].value !== 'wa' ||
      meaningful[i + 1]?.value !== '.' ||
      meaningful[i + 2]?.value !== 'on' ||
      meaningful[i + 3]?.value !== '.' ||
      !RENDER_HOOKS.has(meaningful[i + 4]?.value ?? '')
    ) {
      continue;
    }
    let k = i + 5;
    if (meaningful[k]?.value === '(') k++;
    if (meaningful[k]?.value !== 'function') continue;
    const body = bodies.find((b) => b.fnKeyword === k);
    if (body) roots.add(bodies.indexOf(body));
  }

  // Closure: a body referenced by name from a rendering body renders too.
  // The reference set is the body's OWN identifiers -- identifiers inside a nested
  // function belong to that function's scope, exactly as the engine assigns them.
  const directRefs = (idx: number): string[] => {
    const me = bodies[idx];
    const refs: string[] = [];
    for (let k = me.start; k <= me.end; k++) {
      const insideNested = bodies.some(
        (b, j) =>
          j > idx && b.fnKeyword > me.fnKeyword && b.start <= k && k <= b.end
      );
      if (insideNested) continue;
      if (meaningful[k].type === 'identifier') refs.push(meaningful[k].value.toLowerCase());
    }
    return refs;
  };

  const queue = [...roots];
  while (queue.length) {
    const idx = queue.pop() as number;
    for (const name of directRefs(idx)) {
      bodies.forEach((b, j) => {
        if (b.name === name && !roots.has(j)) {
          roots.add(j);
          queue.push(j);
        }
      });
    }
  }

  return [...roots].map((idx) => {
    const start = meaningful[bodies[idx].start];
    const end = meaningful[bodies[idx].end];
    return [start.line, start.column, end.line, end.column] as RenderRegion;
  });
}

/** True when the token's position falls inside a recorded render body. */
function inRenderRegion(t: Token, regions: RenderRegion[]): boolean {
  return regions.some(([sl, sc, el, ec]) => {
    const afterStart = t.line > sl || (t.line === sl && t.column >= sc);
    const beforeEnd = t.line < el || (t.line === el && t.column <= ec);
    return afterStart && beforeEnd;
  });
}

/**
 * One `for _, v in <wa.X.all()>` loop, and what `v` holds INSIDE it.
 *
 * `wa.missiles.all()` yields WorldHandle userdata, not the MissileEntity table --
 * `spawn.rs` binds it through `bind_kind_list`, whose `all` calls `objects_table`,
 * and `objects_table` fills the array with `WorldHandle::new(id)`, which HAS
 * `impulse`. A receiver named `missile` says nothing about which of the two it is,
 * which is why `px/weapons/electromagnet.lua:95` used to draw a false `missile-api`.
 */
interface LoopBinding {
  /** Lowercased loop value name. */
  varName: string;
  className: HandleClassName;
  /** Token index range of the loop BODY, inclusive. */
  start: number;
  end: number;
}

const isBlockOpen = (v: string) => v === 'function' || v === 'if' || v === 'do' || v === 'repeat';
const isBlockClose = (v: string) => v === 'end' || v === 'until';

/**
 * Every `for _, v in <wa.X.all()>` loop in the file, with the span of its body.
 *
 * WHY THE SPAN IS PART OF THE ANSWER, and not an implementation detail: a flat
 * `name -> class` map makes a claim about the whole file out of one loop.
 * `mods/tools/audit/audit.lua` loops `for _, w in ipairs(wa.worms.all())` at lines
 * 107 and 112 and separately passes `w` as a callback parameter holding the audit
 * harness's own MOCK worm at line 265 (`w:input{...}`). A name-keyed map claims that
 * mock, `w` stops resolving by name -- `w` is not a confident registry prefix, only
 * `worm` is -- and 46 false `worm-api` warnings appear on a file that had none.
 *
 * Same one-hop honesty as the call-site trace: only a loop DIRECTLY over a `wa.X.all()`
 * call counts, never a variable holding the array (`for _, x in ipairs(t)`), never a
 * filtered or mapped copy. A helper CALLED from inside the loop with the loop value as
 * an argument is not inside the loop either, so it falls back to the name table:
 * silence rather than a wrong answer.
 */
function collectLoopBindings(meaningful: Token[]): LoopBinding[] {
  const out: LoopBinding[] = [];

  for (let i = 0; i < meaningful.length; i++) {
    if (meaningful[i].value !== 'for') continue;

    // `for k, v in ...`: the VALUE is the last name. `for _, v in ...` has two.
    const names: string[] = [];
    let j = i + 1;
    while (j < meaningful.length && meaningful[j].value !== 'in') {
      if (meaningful[j].type === 'identifier') names.push(meaningful[j].value.toLowerCase());
      j++;
    }
    if (meaningful[j]?.value !== 'in') continue;
    j++;

    // The iterator expression is everything up to this loop's `do`.
    const exprStart = j;
    while (j < meaningful.length && meaningful[j].value !== 'do') j++;
    if (meaningful[j]?.value !== 'do') continue;

    const path = pathOfIterator(meaningful, exprStart, j);
    const className = path ? ITERATOR_ELEMENT[path] : undefined;
    const varName = names[names.length - 1];

    // Walk to the `end` that closes THIS loop.
    let depth = 1;
    let end = -1;
    for (let k = j + 1; k < meaningful.length; k++) {
      const v = meaningful[k].value;
      if (isBlockOpen(v)) depth++;
      else if (isBlockClose(v)) {
        depth--;
        if (depth === 0) {
          end = k;
          break;
        }
      }
    }
    if (end >= 0 && className && varName && varName !== '_') {
      out.push({ varName, className, start: j, end });
    }
  }
  return out;
}

/**
 * The dotted path named by a for-in iterator, unwrapping call layers.
 *
 * `ipairs(wa.missiles.all())` -> `wa.missiles.all`; `wa.worms.all()` -> `wa.worms.all`.
 * Anything else returns null, which is how `for _, x in ipairs(t)` -- t merely holding
 * the array -- is declined instead of guessed at.
 */
function pathOfIterator(toks: Token[], lo: number, hi: number): string | null {
  // Peel one `ipairs(...)` / `pairs(...)` wrapper, if the expression is exactly one.
  const first = toks[lo];
  if (
    first?.type === 'identifier' &&
    LOOP_ITERATOR_WRAPPERS.includes(
      first.value.toLowerCase() as (typeof LOOP_ITERATOR_WRAPPERS)[number]
    ) &&
    toks[lo + 1]?.value === '('
  ) {
    let depth = 0;
    let close = -1;
    for (let k = lo + 1; k < hi; k++) {
      if (toks[k].value === '(') depth++;
      else if (toks[k].value === ')') {
        depth--;
        if (depth === 0) {
          close = k;
          break;
        }
      }
    }
    // The wrapper must account for the WHOLE expression. `ipairs(t).foo` is not a
    // loop over `wa.X.all()` and must not be read as one.
    if (close !== hi - 1) return null;
    return pathOfIterator(toks, lo + 2, hi - 1);
  }
  // What is left should be a dotted path with an optional empty argument list:
  // `wa.missiles.all ( )`.
  let end = hi;
  if (end - lo >= 2 && toks[end - 1].value === ')' && toks[end - 2].value === '(') end -= 2;
  return pathOfDottedPath(toks, lo, end);
}

/** `wa . missiles . all` -> `wa.missiles.all`. Anything with a call or index in it fails. */
function pathOfDottedPath(toks: Token[], lo: number, hi: number): string | null {
  if (lo >= hi || toks[lo].type !== 'identifier') return null;
  const parts = [toks[lo].value.toLowerCase()];
  let k = lo + 1;
  while (k < hi) {
    if (toks[k].value !== '.' || toks[k + 1]?.type !== 'identifier') return null;
    parts.push(toks[k + 1].value.toLowerCase());
    k += 2;
  }
  return parts.join('.');
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

  // Render context: bodies of `wa.on.draw(function() ... end)`. Collected once,
  // file-globally, exactly like RenderScan in src-tauri/src/checks.rs -- draw on
  // line 1 mutes math inside a callback on line 3.
  const renderRegions = collectRenderRegions(meaningfulTokens);

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

  // Resolution step 1b, and the one that was MISSING: a value bound by a
  // `for _, v in <wa.X.all()>` loop holds whatever that iterator yields. Scoped to
  // the loop body, so it answers for `missile:impulse()` on the line inside the
  // loop and for nothing else. See `collectLoopBindings`.
  const loopBindings = collectLoopBindings(meaningfulTokens);

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
        // `function worm:hurt(...)` is a method DEFINITION, not an invocation:
        // Rust's equivalent check runs on call expressions only, so definitions
        // are silent there. Match that -- the symbol extractor above still
        // records the member for autocomplete.
        const isDefinition = meaningfulTokens[idx - 2]?.value === 'function';
        // Resolution order, most accurate first:
        //   1. the loop trace -- `for _, missile in ipairs(wa.missiles.all())` states
        //      what the value IS, which beats anything the name suggests;
        //   1b. the traced call-site returnType (`local x = wa.worms.nearest(...)`)
        //   2. the name table -- confident names only, via resolveForCheck
        // then, if the receiver is .kind-narrowed, the duck-typed union above.
        // Autocomplete may guess loosely, but a wrong guess here is a false
        // error on valid code, so step 2 only claims names it is sure about.
        // Last loop wins, so a nested loop over the same name is the one that answers.
        const loopClass = loopBindings
          .filter((b) => b.varName === left.value.toLowerCase() && idx >= b.start && idx <= b.end)
          .pop()?.className;
        const tracedClass = loopClass ?? tracedTypes.get(left.value);
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
            if (!isDefinition && owners.length > 0) {
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
            } else if (!isDefinition) {
              pushUnknownMethod(expected, cls, method, right, diagnostics);
            }
          } else if (!isDefinition) {
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
      // The sandbox NILS these two, so the call raises at run time.
      { name: 'random', disabled: true, hint: 'Use "wa.random(min, max)" to draw from Worms Armageddon\'s shared lockstep RNG.' },
      { name: 'randomseed', disabled: true, hint: 'Use "wa.random(min, max)" to draw from Worms Armageddon\'s shared lockstep RNG.' },
      // These stay callable (sandbox.rs only nils random/randomseed). They are a
      // cross-machine determinism RISK, not a disabled API: warning, not error.
      { name: 'cos', disabled: false, hint: 'Use "wa.math.cos(...)" -- the engine\'s deterministic sine table -- instead.' },
      { name: 'sin', disabled: false, hint: 'Use "wa.math.sin(...)" -- the engine\'s deterministic sine table -- instead.' },
      { name: 'atan', disabled: false, hint: 'Use "wa.math.atan(y, x)" -- the engine\'s deterministic arctangent -- instead.' },
    ] as const;
    const afterDot = meaningfulTokens[idx - 1]?.value === '.';
    for (const b of bannedLockstep) {
      // Only a CALL can desync: `math.sin` read as a value (e.g. copied into a
      // mock table) executes nothing. Rust's check runs on call expressions
      // only (`dotted_path(call)`), so match it -- references stay silent.
      if (
        !afterDot &&
        t.value === 'math' &&
        meaningfulTokens[idx + 1]?.value === '.' &&
        meaningfulTokens[idx + 2]?.value === b.name &&
        meaningfulTokens[idx + 3]?.value === '('
      ) {
        // math.cos/sin/atan inside wa.on.draw is presentation-only: per-client
        // drawing never desyncs a match, so it is silent there. Everywhere else
        // (gameplay logic, helpers, ...) it stays an error. Mirrors the guard in
        // checks.rs so both engines report the same findings on the same file.
        // math.random/randomseed are deliberately NOT muted: the sandbox nils
        // them outright (sandbox.rs), so the call errors at run time in ANY
        // context, render or not.
        const isTrig = b.name === 'cos' || b.name === 'sin' || b.name === 'atan';
        if (isTrig && inRenderRegion(t, renderRegions)) continue;
        diagnostics.push({
          line: t.line,
          column: t.column,
          message: b.disabled
            ? `Lockstep Violation: "math.${b.name}" is disabled in WormForge to prevent desyncs. ${b.hint}`
            : `Lockstep Warning: "math.${b.name}" is not lockstep-safe: the C library result can differ between machines and desync the match. ${b.hint}`,
          // `math.random`/`randomseed` really are nil in the sandbox, so the
          // call raises. `math.cos`/`sin`/`atan` still run; they are a
          // determinism risk, and calling that an error on working code is
          // exactly the false positive this rule used to produce.
          severity: b.disabled ? 'error' : 'warning',
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
  //
  // These two passes fire at the SAME position with the same rule id, by design --
  // `mergeDiagnostics` (services/diagnostics.ts) is what collapses them into the
  // single console row the user sees, and luaCompiler.test.ts pins that it does.
  // Collapsing here as well would leave that guard with no precondition to assert,
  // and the dedupe would live in two places with two keys. Leave it where it is.
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
