// The Lua tokenizer. Split out of parser.ts with no behaviour change.
//
// WHY THIS IS ITS OWN FILE
// Two consumers need a token stream and nothing else:
//   - scope.ts, which builds the lexical scopes behind the autocomplete, per
//     keystroke and SYNCHRONOUSLY (it cannot go over IPC to Rust, so it keeps
//     serving the editor after the checker moved to full_moon -- see the note in
//     scope.ts and B2 in compacted-context.md)
//   - parseAndValidate() in parser.ts, which is the fallback checker and the
//     synchronous symbol bootstrap
// Everything that REASONS about the tokens (the desync checks, the scope-aware
// undefined-name pass, symbol extraction) stays in parser.ts. Only the
// characters-to-tokens step lives here.
//
// KNOWN LIMITATION, unchanged by this move: the tokenizer breaks on a number
// directly after a dot, e.g. `worm.1111`. If a user reports a crash, check for
// that pattern first.

import type { SyntaxDiagnostic } from '../types/wormforge';

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
