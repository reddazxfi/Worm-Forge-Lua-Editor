// Lexical scope model for autocomplete ranking (Track A, item A4).
//
// WHY THIS FILE EXISTS
// The parser used to treat every `local` in a file as one flat bag of names. In
// rules.lua that is 272 distinct names, all undifferentiated, so the suggestion
// list was 330+ undifferentiated entries and a local from one function was
// indistinguishable from a local in an unrelated one. The concrete bug that
// produced: `t = r` inside an isolated function passed the undefined-name check
// because `local t` and `local r` happen to exist in OTHER functions.
//
// This module builds real scopes with real line ranges so the editor can answer
// "what is visible HERE?", ranked innermost-first. It is deliberately NOT the
// diagnostic half of A4: the scope-aware `undefined-global` check belongs in the
// Rust checker (B2), where full_moon hands us scopes for free. Writing it twice
// in two languages would mean maintaining the same subtle rules twice.
//
// Built on the hand-written tokenizer, which B2 deletes. That is intentional and
// bounded: the autocomplete half of A4 has no other home (CodeEditor and
// UpperCornerTree are synchronous, per-keystroke, and cannot go over IPC), and
// when Rust takes over the checker this file keeps serving the editor.
//
// The tokenizer itself moved to ./lexer so that the scope model has no reason to
// import the checker, only the token stream. parser.ts re-exports it for
// everything else, so this import is the one place that reaches past it.
import { tokenize, type Token } from './lexer';

export type BindingKind = 'param' | 'local' | 'loop' | 'localFunction' | 'global';

export interface ScopeBinding {
  name: string;
  /** Line the name becomes visible from. For a plain `local`, the line of the
   *  `local` keyword itself -- Lua binds declaration-point-forward, so a name
   *  used ABOVE its declaration is genuinely undefined and must not rank. */
  line: number;
  kind: BindingKind;
  /**
   * Set for `local function f`. Lua desugars it to `local f; f = function(...)`,
   * so `f` is in scope inside its OWN body. Without this every recursive helper
   * (`local function walk(n) ... walk(n-1) ... end`) would fail to see itself.
   */
  selfScopeId?: number;
}

export interface Scope {
  id: number;
  parent: number | null;
  kind: 'file' | 'function' | 'loop';
  /** Function name as written, for labelling the tree. */
  name?: string;
  startLine: number;
  /** Line of the matching `end`/`until`, or the last line of the file when the
   *  code is unbalanced. Autocomplete still has to work on a half-typed file. */
  endLine: number;
  bindings: ScopeBinding[];
}

export interface ScopeModel {
  scopes: Scope[];
  lastLine: number;
}
/**
 * Builds the scope tree.
 *
 * Unbalanced input is not an error here. Every push/pop below tolerates a missing
 * `end`, and any scope still open at EOF is closed at the last line, because the
 * editor calls this on every keystroke and half-written code is the normal case.
 */
export function buildScopes(code: string): ScopeModel {
  const tokens = meaningful(code);
  const lines = code.split('\n');

  const scopes: Scope[] = [
    { id: 0, parent: null, kind: 'file', name: '<file>', startLine: 1, endLine: lines.length, bindings: [] },
  ];
  const open: Scope[] = [scopes[0]];
  let nextId = 1;

  // Terminator (`end` / `until`) for every block currently open, innermost last.
  // Includes `if`/`while`/`do`/`repeat`, which get no Scope of their own but must
  // still be counted so their `end` does not close an enclosing function. See the
  // block-close branch below for why this cannot be a simple "pop on end".
  //
  // `null` marks a block with NO scope of its own (an `if`, say); a real block
  // stores its scope id. That distinction is the whole mechanism: closing an `if`
  // must discard a `null`, while closing a `function` must pop that Scope. Storing
  // only the terminator string could not tell the two apart, which is why the
  // first inner `if ... end` used to close the enclosing function.
  const pending: { terminator: string; scopeId: number | null }[] = [];

  // Token indices that are already bound as declarations by the `local`/`for`
  // branches. Needed because `local t = 1` contains BOTH a declaration and
  // something that looks exactly like a bare assignment -- without this, `t` gets
  // bound twice (once correctly as a local, once as a "global"), every local in
  // the file leaks into file scope, and the ranking this whole module exists for
  // collapses back to one flat bag of names.
  const declaredAt = new Set<number>();

  const current = (): Scope => open[open.length - 1];

  const push = (kind: 'function' | 'loop', name: string | undefined, line: number): Scope => {
    const s: Scope = { id: nextId++, parent: current().id, kind, name, startLine: line, endLine: lines.length, bindings: [] };
    scopes.push(s);
    open.push(s);
    return s;
  };

  // Reads the identifiers of the parameter list starting at the first `(` at or
  // after `from`, stopping at its matching `)`. Nested parens inside a default
  // value (`function f(a, b or (1))`) are handled by the depth counter.
  const paramNames = (from: number): string[] => {
    const out: string[] = [];
    let i = from;
    while (i < tokens.length && tokens[i].value !== '(') i++;
    if (i >= tokens.length) return out;
    let depth = 0;
    for (let p = i; p < tokens.length; p++) {
      const v = tokens[p].value;
      if (v === '(') { depth++; continue; }
      if (v === ')') { depth--; if (depth === 0) break; continue; }
      if (depth === 1 && tokens[p].type === 'identifier') out.push(v);
    }
    return out;
  };
for (let idx = 0; idx < tokens.length; idx++) {
    const t = tokens[idx];
    const prev = tokens[idx - 1];

    // ---- function ----------------------------------------------------------
    //
    // Handles BOTH forms, which is why this branch must not assume a name follows:
    //   `function f() end`      -- declaration, name binds in the enclosing scope
    //   `t.cb = function(x) end` -- anonymous callback, binds only its params
    //
    // The second form is the single most common way a WormForge pack declares a
    // callback (`fires.old_woman = function(fire) ... end`), and an earlier version
    // of this code treated every `function` as a named declaration. Its params
    // were then invisible inside their own body, which produced 1,158 false
    // positives across the 25 packs. Name is undefined for the anonymous form, so
    // the two binding paths below simply do not fire.
    if (t.type === 'keyword' && t.value === 'function') {
      const nameTok = tokens[idx + 1];
      const isLocalFn = prev?.value === 'local';
      const name = nameTok?.type === 'identifier' ? nameTok.value : undefined;

      // The ENCLOSING scope, captured BEFORE push() below moves `open` into the new
      // function. A `local function f` binds f in the scope that CONTAINS the
      // function, not inside it -- `current()` after the push returns the function
      // itself, which buried every local function inside its own body and left it
      // invisible to all following code (1,158 false positives across the packs).
      const enclosing = current();

      const scope = push('function', name, t.line);
      pending.push({ terminator: 'end', scopeId: scope.id });

      // `function Worm:ammo()` declares an implicit `self` that Lua binds
      // nowhere else. parser.ts already compensates for this in its undefined-name
      // scan; it is needed here too or `self` never ranks in a method body.
      if (tokens[idx + 2]?.value === ':') {
        scope.bindings.push({ name: 'self', line: t.line, kind: 'param' });
      }
      for (const p of paramNames(idx)) {
        scope.bindings.push({ name: p, line: t.line, kind: 'param' });
      }

      // The A4 carve-out. A `local function f` binds f in the ENCLOSING scope,
      // and Lua additionally makes it visible inside its own body, so record the
      // body scope against the name.
      if (isLocalFn && name) {
        enclosing.bindings.push({
          name,
          line: t.line,
          kind: 'localFunction',
          selfScopeId: scope.id,
        });
      } else if (!isLocalFn && name) {
        // `function f()` and `function Obj.m()` declare a GLOBAL (or a field on
        // the global `Obj`). Bind the root name in file scope so a later call to
        // `f()` resolves. Without this the scope-aware undefined-name check would
        // report every global function in a pack as undefined.
        //
        // Only the ROOT of a dotted name is bound: `function Obj.m()` defines the
        // global `Obj` plus a field `m` on it. Binding `m` as a global would be
        // wrong, and `Obj.m` is a field access, not a bare read.
        declaredAt.add(idx + 1);
        scopes[0].bindings.push({ name, line: t.line, kind: 'global' });
      }
      continue;
    }

    // ---- for loop ----------------------------------------------------------
    // `for k, v in pairs(t) do` -- the variables belong to the body, so they bind
    // in the loop scope rather than leaking into the enclosing function.
    if (t.type === 'keyword' && t.value === 'for') {
      const s = push('loop', undefined, t.line);
      pending.push({ terminator: 'end', scopeId: s.id });
      for (let p = idx + 1; p < tokens.length; p++) {
        const lt = tokens[p];
        if (lt.value === 'in' || lt.value === '=' || lt.value === 'do') break;
        if (lt.type === 'identifier') {
          s.bindings.push({ name: lt.value, line: t.line, kind: 'loop' });
          declaredAt.add(p);
        }
      }
      continue;
    }

    // ---- local -------------------------------------------------------------
    if (t.type === 'keyword' && t.value === 'local') {
      if (tokens[idx + 1]?.value === 'function') continue; // handled above

      // `local a, b = f(), g()` -- names bound at the `local`, values paired by
      // position, but names never borrow a value's type (see main.rs callee_of).
      let k = idx + 1;
      while (k < tokens.length && tokens[k].type === 'identifier') {
        current().bindings.push({ name: tokens[k].value, line: t.line, kind: 'local' });
        declaredAt.add(k);
        k++;
        if (tokens[k]?.value === ',') { k++; continue; }
        break;
      }
      continue;
    }

    // ---- bare assignment: a global ----------------------------------------
    // `x = 1` defines a global. `a.b = 1` does not bind `b` -- that is a table
    // field -- which is the same rule scanUndefinedGlobals uses.
    if (t.type === 'identifier' && tokens[idx + 1]?.value === '=' && prev?.value !== '.' && !declaredAt.has(idx)) {
      const owner = tokens[idx - 2];
      const isEnvTable = owner?.value === '_G' || owner?.value === '_ENV';
      if (prev?.value !== ':' && (prev?.value !== '.' || isEnvTable)) {
        scopes[0].bindings.push({ name: t.value, line: t.line, kind: 'global' });
      }
      continue;
    }

    // ---- block close -------------------------------------------------------
    //
    // `end` closes `function`, `for`, `if`, `while` and `do` alike. We push a
    // real scope only for `function` and `for`, so a plain "pop on every end"
    // would let the first inner `if ... end` steal the FUNCTION's closing brace:
    // `local function describe(worm)` covered lines 1-3 instead of 1-5, every
    // parameter went invisible past the first `if`, and the scope-aware
    // undefined-name check reported 3,884 false positives across the 25 packs.
    //
    // So the `if`/`while`/`do` keywords are counted here even though they get no
    // scope of their own. Every `end` consumes exactly one pending block, and the
    // scope stack is only popped when the block being closed is one we pushed.
    // Checking the kind alone is NOT enough: with `function > if > end`, the top
    // of the stack is still the function, so a kind test still popped it.
    if (t.type === 'keyword') {
      if (t.value === 'if' || t.value === 'while' || t.value === 'do' || t.value === 'repeat') {
        pending.push({ terminator: t.value === 'repeat' ? 'until' : 'end', scopeId: null });
        continue;
      }
      if (t.value === 'end' || t.value === 'until') {
        const frame = pending.pop();
        // Unbalanced input (a stray `end`) leaves nothing to close. Leave the
        // stack alone rather than corrupting every scope above it.
        if (!frame || frame.terminator !== t.value) continue;
        // Only a frame that OWNS a scope may pop one. This is the line that stops
        // an inner `if ... end` from closing the enclosing function.
        if (frame.scopeId !== null) {
          const s = scopes[frame.scopeId];
          s.endLine = t.line;
          // Drop the scope too, so `open` and `pending` cannot disagree.
          const at = open.findIndex((o) => o.id === frame.scopeId);
          if (at !== -1) open.splice(at, 1);
        }
      }
    }
  }

  // No EOF fixup needed: a scope's `endLine` is initialised to the last line, which
  // is exactly the "runs to EOF" default an unclosed scope wants. That asymmetry
  // is deliberate -- a scope that closes too early makes its names invisible and
  // produces false positives, while one that closes too late only over-reports.
  return { scopes, lastLine: lines.length };
}

// Meaningful = not whitespace, not comment. Matches what parser.ts walks.
const meaningful = (code: string): Token[] =>
  tokenize(code).tokens.filter((t) => t.type !== 'whitespace' && t.type !== 'comment');
/** True when `line` falls inside the given scope's range. */
const isInside = (model: ScopeModel, scopeId: number, line: number): boolean => {
  const s = model.scopes[scopeId];
  return !!s && line >= s.startLine && line <= s.endLine;
};

/** The innermost scope containing `line`, falling back to the file scope. */
export function scopeAt(model: ScopeModel, line: number): Scope {
  let best = model.scopes[0];
  for (const s of model.scopes) {
    if (line < s.startLine || line > s.endLine) continue;
    // Innermost wins: a nested scope always spans a subset of its parent's lines.
    if (s.startLine >= best.startLine && s.endLine <= best.endLine) best = s;
  }
  return best;
}

export interface VisibleName {
  name: string;
  kind: BindingKind;
  line: number;
  /** 0 = innermost scope at the cursor. Higher = further out. */
  rank: number;
  /** Label of the scope the name came from, for display. */
  scopeLabel: string;
}

/**
 * Names visible at `line`, innermost first, deduplicated by name.
 *
 * Dedupe keeps the INNERMOST binding: in Lua that is the one the runtime would
 * actually read, so it is the one that belongs at the top of the suggestion list.
 * This is what turns 58 entries called `s` into one.
 *
 * `dedupe` exists for the tree, which wants to SHOW a shadowed name rather than
 * hide it -- `local s` in three functions is three real declarations.
 */
export function visibleAt(model: ScopeModel, line: number, dedupe = true): VisibleName[] {
  const out: VisibleName[] = [];
  const seen = new Set<string>();

  // Walk from the cursor's scope outward. A child's id is always greater than its
  // parent's, but this follows the parent pointers, so it terminates at the file.
  let s: Scope | undefined = scopeAt(model, line);
  let rank = 0;
  while (s) {
    for (const b of s.bindings) {
      if (dedupe && seen.has(b.name)) continue;

      // Declaration-point-forward, EXCEPT for the `local function` carve-out,
      // which is legal inside its own body.
      const inOwnBody = b.selfScopeId !== undefined && isInside(model, b.selfScopeId, line);
      if (b.line > line && !inOwnBody) continue;

      seen.add(b.name);
      out.push({
        name: b.name,
        kind: b.kind,
        line: b.line,
        rank,
        scopeLabel: s.kind === 'file' ? '<file>' : s.name ?? `<${s.kind}>`,
      });
    }
    rank++;
    s = s.parent === null ? undefined : model.scopes[s.parent];
  }
  return out;
}