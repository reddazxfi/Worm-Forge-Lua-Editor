import {
  SyntaxDiagnostic,
  VariableDef,
  FunctionDef,
  ClassDef,
  ParsedSymbolTree,
} from '../types/wormforge';

export type { SyntaxDiagnostic, ParsedSymbolTree };
import {
  BUILTIN_CLASSES,
  BUILTIN_ENUMERATIONS,
  BUILTIN_FUNCTIONS,
  BUILTIN_VARIABLES,
} from '../data/wormforgeDefinitions';

export interface Token {
  type:
    | 'keyword'
    | 'identifier'
    | 'operator'
    | 'arrow'
    | 'type'
    | 'string'
    | 'number'
    | 'comment'
    | 'punctuation'
    | 'whitespace'
    | 'unknown';
  value: string;
  line: number;
  column: number;
  start: number;
  end: number;
}

const LUA_KEYWORDS = new Set([
  'and',
  'break',
  'do',
  'else',
  'elseif',
  'end',
  'false',
  'for',
  'function',
  'goto',
  'if',
  'in',
  'local',
  'nil',
  'not',
  'or',
  'repeat',
  'return',
  'then',
  'true',
  'until',
  'while',
  'require',
]);

const TYPE_KEYWORDS = new Set([
  'int',
  'float',
  'string',
  'bool',
  'boolean',
  'table',
  'void',
  'any',
  'number',
]);

// The receivers the unknown-method check knows about, and the handle class each
// one is assumed to be. Adding a receiver means adding a row here. This is
// data rather than an if/else chain so the duck-typed path below can walk it.
const RECEIVER_CLASSES: {
  names: string[];
  className: string;
  rule: string;
  note?: string;
}[] = [
  { names: ['a', 'actor'], className: 'LuaActor', rule: 'actor-api' },
  { names: ['worm'], className: 'WormEntity', rule: 'worm-api' },
  { names: ['inv', 'store', 'inventory'], className: 'InventoryStore', rule: 'inventory-api' },
  {
    names: ['mine', 'drum', 'oil', 'oildrum', 'crate', 'grave', 'obj', 'object'],
    className: 'WorldHandle',
    rule: 'world-object-api',
  },
  {
    names: ['m', 'missile'],
    className: 'MissileEntity',
    rule: 'missile-api',
    note: 'In-flight missile tables provide properties: id, weapon, sprite, collision_mask, x, y, vx, vy, damp, wind_scale, gravity_scale',
  },
];

// Every handle a `.kind`-narrowed receiver could turn out to be at runtime.
const HANDLE_CLASS_NAMES = [
  'WormEntity',
  'WorldHandle',
  'LuaActor',
  'MissileEntity',
  'InventoryStore',
];

/** "3734", "3734 and 4209", "3734, 4209 and 4372" */
function formatLines(lines: number[]): string {
  const sorted = Array.from(new Set(lines)).sort((a, b) => a - b);
  if (sorted.length === 1) return String(sorted[0]);
  if (sorted.length === 2) return `${sorted[0]} and ${sorted[1]}`;
  return `${sorted.slice(0, -1).join(', ')} and ${sorted[sorted.length - 1]}`;
}

/**
 * Length of a Lua binary exponent sitting at `i` (the `e`/`p`), or 0 if what
 * follows is not a well-formed one. Returning 0 is what keeps genuinely broken
 * input loud: `1e` and `0x1p` stay unconsumed, so the malformed-number check
 * downstream still reports them instead of silently accepting them.
 */
function matchBinaryExponent(code: string, i: number): number {
  let j = i + 1;
  if (code[j] === '+' || code[j] === '-') j++;
  const digitsStart = j;
  while (j < code.length && /\d/.test(code[j])) j++;
  return j > digitsStart ? j - i : 0;
}

// Globals a mod may legitimately read. Lua 5.4's standard library, plus the
// sandbox survivors and WormForge's own `wa` dispatcher. Deliberately generous:
// the check below only fires on names that are never bound anywhere in the file,
// so a name on this list that turns out to be stripped by the engine sandbox
// (io/os/debug/package/dofile/load/require/collectgarbage/coroutine) is a
// separate check, not this one.
const LUA_GLOBALS = new Set([
  // Lua base
  '_G', '_ENV', 'assert', 'error', 'getmetatable', 'ipairs', 'next', 'pairs',
  'pcall', 'print', 'rawequal', 'rawget', 'rawlen', 'rawset', 'select',
  'setmetatable', 'tonumber', 'tostring', 'type', 'warn', 'xpcall',
  // Standard libraries
  'coroutine', 'debug', 'io', 'math', 'os', 'package', 'string', 'table',
  'utf8', 'bit32', 'arg',
  // Load-time helpers the engine's sandbox nils out. Listed so that reading one
  // is not reported as a typo; using one is a separate (real) problem.
  'dofile', 'loadfile', 'load', 'require', 'collectgarbage',
  // WormForge
  'wa',
]);

/**
 * Names that are read but never bound anywhere in the file.
 *
 * `into_function()` compiles without running, so a chunk naming five invented
 * globals is a *compilable* chunk. It then dies at runtime, and because
 * `run_mods` (crates/lua-host/src/lib.rs:54) aborts the whole load on the first
 * error, one bad mod takes every other mod down with it. This is the check that
 * catches it before the match.
 *
 * Deliberately not scope-aware: a name is "bound" if it is assigned or declared
 * *anywhere*, so a forward reference inside a function still counts. That is the
 * cheap direction to be wrong in, and the 25 real packs under mods/examples are
 * the regression test.
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
    if (bound.has(t.value) || LUA_GLOBALS.has(t.value)) continue;

    // `a.b` / `a:b` -- `b` is a field, not a global.
    const prev = meaningful[i - 1]?.value;
    if (prev === '.' || prev === ':') continue;
    // `x = 1` and `{ key = 1 }` are bindings/keys, handled in pass 1.
    if (meaningful[i + 1]?.value === '=') continue;

    out.push({
      line: t.line,
      column: t.column,
      message:
        `Undefined name "${t.value}": nothing in this file defines it. ` +
        `This compiles, so the game will load it and then crash at runtime - ` +
        `and because every mod shares one Lua state, that stops all mods loading. ` +
        `If another mod is meant to set it, note the load order is not guaranteed.`,
      severity: 'warning',
      rule: 'undefined-global',
    });
  }

  return out;
}

/** The "Unknown <Handle> method" warning, shared by every receiver row. */
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
  const tail = expected.note ? expected.note : `Valid methods include: ${validMethods}`;
  diagnostics.push({
    line: at.line,
    column: at.column,
    message: `Unknown ${expected.className} method "${method}". ${tail}`,
    severity: 'warning',
    rule: expected.rule,
  });
}

export function tokenize(code: string): { tokens: Token[]; diagnostics: SyntaxDiagnostic[] } {
  const tokens: Token[] = [];
  const diagnostics: SyntaxDiagnostic[] = [];
  let i = 0;
  let line = 1;
  let col = 1;

  while (i < code.length) {
    const char = code[i];

    // Newlines
    if (char === '\n') {
      tokens.push({
        type: 'whitespace',
        value: '\n',
        line,
        column: col,
        start: i,
        end: i + 1,
      });
      i++;
      line++;
      col = 1;
      continue;
    }

    // Standard whitespace
    if (/\s/.test(char)) {
      const start = i;
      const startCol = col;
      let val = '';
      while (i < code.length && /\s/.test(code[i]) && code[i] !== '\n') {
        val += code[i];
        i++;
        col++;
      }
      tokens.push({
        type: 'whitespace',
        value: val,
        line,
        column: startCol,
        start,
        end: i,
      });
      continue;
    }

    // Comments (-- or --[[ ... ]])
    if (char === '-' && code[i + 1] === '-') {
      const start = i;
      const startCol = col;
      if (code.slice(i, i + 4) === '--[[') {
        const endIdx = code.indexOf(']]', i + 4);
        if (endIdx === -1) {
          diagnostics.push({
            line,
            column: startCol,
            message: 'Unterminated multi-line comment: missing matching "]]"',
            severity: 'error',
          });
          const val = code.slice(i);
          tokens.push({
            type: 'comment',
            value: val,
            line,
            column: startCol,
            start,
            end: code.length,
          });
          break;
        } else {
          const val = code.slice(i, endIdx + 2);
          const lines = val.split('\n');
          tokens.push({
            type: 'comment',
            value: val,
            line,
            column: startCol,
            start,
            end: endIdx + 2,
          });
          i = endIdx + 2;
          if (lines.length > 1) {
            line += lines.length - 1;
            col = lines[lines.length - 1].length + 1;
          } else {
            col += val.length;
          }
          continue;
        }
      } else {
        // Single line comment
        let nextNewline = code.indexOf('\n', i);
        if (nextNewline === -1) nextNewline = code.length;
        const val = code.slice(i, nextNewline);
        tokens.push({
          type: 'comment',
          value: val,
          line,
          column: startCol,
          start,
          end: nextNewline,
        });
        col += val.length;
        i = nextNewline;
        continue;
      }
    }

    // Strings: single, double quote, or multi-line [[ ... ]]
    if (char === '"' || char === "'") {
      const quote = char;
      const start = i;
      const startCol = col;
      i++;
      col++;
      let escaped = false;
      let strVal = quote;
      let closed = false;

      while (i < code.length) {
        const c = code[i];
        strVal += c;
        if (c === '\n' && !escaped) {
          diagnostics.push({
            line,
            column: startCol,
            message: `Unterminated string literal: newline before closing ${quote}`,
            severity: 'error',
          });
          break;
        }
        if (escaped) {
          escaped = false;
        } else if (c === '\\') {
          escaped = true;
        } else if (c === quote) {
          closed = true;
          i++;
          col++;
          break;
        }
        i++;
        col++;
      }

      if (!closed && i >= code.length) {
        diagnostics.push({
          line,
          column: startCol,
          message: `Unterminated string literal: missing closing ${quote}`,
          severity: 'error',
        });
      }

      tokens.push({
        type: 'string',
        value: strVal,
        line,
        column: startCol,
        start,
        end: i,
      });
      continue;
    }

    // Multiline string [[ ... ]]
    if (char === '[' && code[i + 1] === '[') {
      const start = i;
      const startCol = col;
      const endIdx = code.indexOf(']]', i + 2);
      if (endIdx === -1) {
        diagnostics.push({
          line,
          column: startCol,
          message: 'Unterminated multi-line string literal [[ ... ]]',
          severity: 'error',
        });
        tokens.push({
          type: 'string',
          value: code.slice(i),
          line,
          column: startCol,
          start,
          end: code.length,
        });
        break;
      } else {
        const val = code.slice(i, endIdx + 2);
        const lines = val.split('\n');
        tokens.push({
          type: 'string',
          value: val,
          line,
          column: startCol,
          start,
          end: endIdx + 2,
        });
        i = endIdx + 2;
        if (lines.length > 1) {
          line += lines.length - 1;
          col = lines[lines.length - 1].length + 1;
        } else {
          col += val.length;
        }
        continue;
      }
    }

    // Arrow Operator: -> (Invalid in Lua / WormForge; flag with error diagnostic)
    if (char === '-' && code[i + 1] === '>') {
      tokens.push({
        type: 'arrow',
        value: '->',
        line,
        column: col,
        start: i,
        end: i + 2,
      });
      i += 2;
      col += 2;
      continue;
    }

    // Numbers (hex: 0x10000, 0x1A, floats: 3.14, .5, ints: 42)
    if (/\d/.test(char) || (char === '.' && /\d/.test(code[i + 1] || ''))) {
      const start = i;
      const startCol = col;
      let num = '';
      if (char === '0' && (code[i + 1] === 'x' || code[i + 1] === 'X')) {
        num += code.slice(i, i + 2);
        i += 2;
        col += 2;
        let hasDot = false;
        while (i < code.length) {
          const c = code[i];
          if (/[0-9a-fA-F_]/.test(c)) {
            num += c;
            i++;
            col++;
          } else if (c === '.' && !hasDot) {
            // Hex float fraction: 0x1.8p3
            hasDot = true;
            num += c;
            i++;
            col++;
          } else {
            break;
          }
        }
        // Hex float exponent: 0x1p4, 0x1.8p-3
        if (i < code.length && (code[i] === 'p' || code[i] === 'P')) {
          const len = matchBinaryExponent(code, i);
          if (len > 0) {
            num += code.slice(i, i + len);
            col += len;
            i += len;
          }
        }
      } else {
        let hasDot = false;
        while (i < code.length) {
          const c = code[i];
          if (/[\d_]/.test(c)) {
            num += c;
            i++;
            col++;
          } else if (c === '.' && !hasDot && code[i + 1] !== '.') {
            hasDot = true;
            num += c;
            i++;
            col++;
          } else {
            break;
          }
        }
        // Decimal exponent: 1e-6, 2.5E+3. Without this the scanner stops at the
        // `e` and the malformed-number check below reports valid Lua like
        // `< 1e-6` as an error, which the game compiler never does.
        if (i < code.length && (code[i] === 'e' || code[i] === 'E')) {
          const len = matchBinaryExponent(code, i);
          if (len > 0) {
            num += code.slice(i, i + len);
            col += len;
            i += len;
          }
        }
      }

      // Safeguard: Ensure i always advances
      if (i === start) {
        num = char;
        i++;
        col++;
      }

      // If a number is immediately followed by identifier characters without a separator (e.g. 1abc or 0x1G)
      if (i < code.length && /[a-zA-Z_]/.test(code[i])) {
        let suffix = '';
        while (i < code.length && /[a-zA-Z0-9_]/.test(code[i])) {
          suffix += code[i];
          i++;
          col++;
        }
        const fullMalformed = num + suffix;
        diagnostics.push({
          line,
          column: startCol,
          message: `Syntax Error: malformed number or identifier starting with digit "${fullMalformed}". Identifiers in Lua cannot start with a number.`,
          severity: 'error',
          rule: 'malformed-number-identifier',
        });
        tokens.push({
          type: 'unknown',
          value: fullMalformed,
          line,
          column: startCol,
          start,
          end: i,
        });
        continue;
      }

      tokens.push({
        type: 'number',
        value: num,
        line,
        column: startCol,
        start,
        end: i,
      });
      continue;
    }

    // Identifiers and Keywords
    if (/[a-zA-Z_]/.test(char)) {
      const start = i;
      const startCol = col;
      let id = '';
      while (i < code.length && /[a-zA-Z0-9_]/.test(code[i])) {
        id += code[i];
        i++;
        col++;
      }

      let type: Token['type'] = 'identifier';
      if (LUA_KEYWORDS.has(id)) {
        type = 'keyword';
      } else if (TYPE_KEYWORDS.has(id.toLowerCase())) {
        type = 'type';
      }

      tokens.push({
        type,
        value: id,
        line,
        column: startCol,
        start,
        end: i,
      });
      continue;
    }

    // Multi-character operators
    const twoChars = code.slice(i, i + 2);
    if (['==', '~=', '<=', '>=', '//', '..'].includes(twoChars)) {
      tokens.push({
        type: 'operator',
        value: twoChars,
        line,
        column: col,
        start: i,
        end: i + 2,
      });
      i += 2;
      col += 2;
      continue;
    }

    // Punctuation and Single-character operators
    if ('{}[](),;:.:'.includes(char)) {
      tokens.push({
        type: 'punctuation',
        value: char,
        line,
        column: col,
        start: i,
        end: i + 1,
      });
      i++;
      col++;
      continue;
    }

    if ('+-*/%^#=<>~'.includes(char)) {
      tokens.push({
        type: 'operator',
        value: char,
        line,
        column: col,
        start: i,
        end: i + 1,
      });
      i++;
      col++;
      continue;
    }

    // Unknown single character fallback
    tokens.push({
      type: 'unknown',
      value: char,
      line,
      column: col,
      start: i,
      end: i + 1,
    });
    i++;
    col++;
  }

  return { tokens, diagnostics };
}

export function parseAndValidate(code: string): {
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
  const customVerbs: Set<string> = new Set();

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

        customVerbs.add(memberName);

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
        const expected = RECEIVER_CLASSES.find((r) => r.names.includes(left.value));
        if (expected) {
          const cls = BUILTIN_CLASSES.find((c) => c.name === expected.className);
          const hasIt = !!cls?.members.some((m) => m.name === method);

          if (hasIt) {
            // Fine on the assumed handle. Nothing to say.
          } else if (duckTypedReceivers.has(left.value)) {
            // The receiver is narrowed by a `.kind` test, so the assumed handle
            // is only one of several. Accept any handle that has the method.
            const owners = HANDLE_CLASS_NAMES.filter((name) =>
              BUILTIN_CLASSES.find((c) => c.name === name)?.members.some((m) => m.name === method)
            );
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

    // Check for banned lockstep patterns (e.g. math.random)
    if (t.value === 'math' && meaningfulTokens[idx + 1]?.value === '.' && meaningfulTokens[idx + 2]?.value === 'random') {
      diagnostics.push({
        line: t.line,
        column: t.column,
        message: 'Lockstep Violation: "math.random" is disabled in WormForge to prevent desyncs. Use "wa.random(min, max)" to draw from Worms Armageddon\'s shared lockstep RNG.',
        severity: 'error',
        rule: 'lockstep-rng',
      });
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

  // One notice per duck-typed `receiver:method()` that the assumed handle alone
  // would have rejected. Severity `info`, not `warning`: the code is valid, and
  // the console's Errors/Warn filters plus the clear button keep it out of the way.
  for (const u of unionPasses) {
    diagnostics.push({
      line: u.lines[0],
      column: 1,
      message:
        `Passed - Notice: lines ${formatLines(u.lines)} call \`${u.receiver}:${u.method}()\`, which ` +
        `${u.owners.join(' and ')} has but ${u.assumedClass} (what \`${u.receiver}\` alone suggests) does not. ` +
        `\`${u.receiver}\` is narrowed by a \`.kind\` test, so it is a different handle in each branch. ` +
        `That is correct while every branch is covered - a missing one only breaks in-game, when the engine ` +
        `runs this method on the wrong handle.`,
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
      customVerbs: Array.from(customVerbs),
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
