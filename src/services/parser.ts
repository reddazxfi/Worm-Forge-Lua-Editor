import {
  SyntaxDiagnostic,
  VariableDef,
  FunctionDef,
  ClassDef,
  ParsedSymbolTree,
} from '../types/wormforge';
import { BUILTIN_CLASSES, BUILTIN_ENUMERATIONS, BUILTIN_FUNCTIONS, BUILTIN_VARIABLES } from '../data/wormforgeDefinitions';

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

    // Numbers (hex: 0x10000, 0x1A, floats: 3.14, ints: 42)
    if (/\d/.test(char) || (char === '.' && /\d/.test(code[i + 1] || ''))) {
      const start = i;
      const startCol = col;
      let num = '';
      if (char === '0' && (code[i + 1] === 'x' || code[i + 1] === 'X')) {
        num += code.slice(i, i + 2);
        i += 2;
        col += 2;
        while (i < code.length && /[0-9a-fA-F_]/.test(code[i])) {
          num += code[i];
          i++;
          col++;
        }
      } else {
        let hasDot = char === '.';
        while (i < code.length && (/[\d_]/.test(code[i]) || (!hasDot && code[i] === '.' && code[i + 1] !== '.'))) {
          if (code[i] === '.') hasDot = true;
          num += code[i];
          i++;
          col++;
        }
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

    // Fallback unknown
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
  diagnostics: SyntaxDiagnostic[];
  symbols: ParsedSymbolTree;
} {
  const { tokens, diagnostics } = tokenize(code);
  const meaningfulTokens = tokens.filter(
    (t) => t.type !== 'whitespace' && t.type !== 'comment'
  );

  // Bracket and Block Balance Checking
  const bracketStack: { char: string; token: Token }[] = [];
  interface BlockStackItem {
    keyword: string;
    token: Token;
    waitingForDo?: boolean;
  }
  const blockStack: BlockStackItem[] = [];

  for (let idx = 0; idx < meaningfulTokens.length; idx++) {
    const t = meaningfulTokens[idx];

    // Brackets
    if (['(', '{', '['].includes(t.value)) {
      bracketStack.push({ char: t.value, token: t });
    } else if ([')', '}', ']'].includes(t.value)) {
      const match = bracketStack.pop();
      const expectedPair: Record<string, string> = { ')': '(', '}': '{', ']': '[' };
      if (!match) {
        diagnostics.push({
          line: t.line,
          column: t.column,
          message: `Unexpected closing bracket "${t.value}" with no matching open bracket`,
          severity: 'error',
        });
      } else if (match.char !== expectedPair[t.value]) {
        diagnostics.push({
          line: t.line,
          column: t.column,
          message: `Mismatched bracket: expected closing for "${match.char}" (line ${match.token.line}), but found "${t.value}"`,
          severity: 'error',
        });
      }
    }

    // Blocks
    if (t.type === 'keyword') {
      if (t.value === 'for' || t.value === 'while') {
        blockStack.push({ keyword: t.value, token: t, waitingForDo: true });
      } else if (t.value === 'do') {
        const top = blockStack[blockStack.length - 1];
        if (top && top.waitingForDo) {
          top.waitingForDo = false;
        } else {
          // Standalone `do ... end` block
          blockStack.push({ keyword: 'do', token: t, waitingForDo: false });
        }
      } else if (t.value === 'function' || t.value === 'if') {
        blockStack.push({ keyword: t.value, token: t, waitingForDo: false });
      } else if (t.value === 'repeat') {
        blockStack.push({ keyword: 'repeat', token: t, waitingForDo: false });
      } else if (t.value === 'end') {
        const match = blockStack.pop();
        if (!match) {
          diagnostics.push({
            line: t.line,
            column: t.column,
            message: 'Unexpected "end" with no matching block opener (function, if, do, while, for)',
            severity: 'error',
          });
        } else if (match.keyword === 'repeat') {
          diagnostics.push({
            line: t.line,
            column: t.column,
            message: '"repeat" block must be closed with "until", not "end"',
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
        // Collect multiple locals like: local a, b, c
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

    // Arrow Operator Check: '->' is NOT valid Lua in WormForge (only used in PX internal notes)
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
    if ((t.value === '.' || t.value === ':') && idx > 0 && idx + 1 < meaningfulTokens.length) {
      const leftTok = meaningfulTokens[idx - 1];
      const rightTok = meaningfulTokens[idx + 1];

      if (leftTok && leftTok.type === 'identifier' && rightTok && rightTok.type === 'identifier') {
        const className = leftTok.value;
        const memberName = rightTok.value;
        const isColon = t.value === ':';

        // Check if this is a custom class (like customClass or user-defined class)
        if (className === 'customClass' || extractedClasses.some((c) => c.name === className)) {
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
              example: `${className}${t.value}${memberName}(${params.map((p) => p.name).join(', ')})`,
              isCustom: true,
            });
          }
        }
      }
    }

    // WormForge Method invocation check: e.g. a:move, worm:hurt, a:explode
    if (t.value === ':') {
      const left = meaningfulTokens[idx - 1];
      const right = meaningfulTokens[idx + 1];
      if (left && right && right.type === 'identifier') {
        const method = right.value;
        if (left.value === 'a' || left.value === 'actor') {
          const actorClass = BUILTIN_CLASSES.find((c) => c.name === 'LuaActor')!;
          if (!actorClass.members.some((m) => m.name === method)) {
            diagnostics.push({
              line: right.line,
              column: right.column,
              message: `Unknown LuaActor method "${method}". Valid methods include: move, gravity, advance, look, frame, explode, despawn, gfx, angle, scale, tint, blend, sound, in_water, on_feet`,
              severity: 'warning',
              rule: 'actor-api',
            });
          }
        } else if (left.value === 'worm') {
          const wormClass = BUILTIN_CLASSES.find((c) => c.name === 'WormEntity')!;
          if (!wormClass.members.some((m) => m.name === method)) {
            diagnostics.push({
              line: right.line,
              column: right.column,
              message: `Unknown WormEntity method "${method}". Valid methods: carry, drop, equip, ammo, hurt`,
              severity: 'warning',
              rule: 'worm-api',
            });
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

  // Combine built-in classes with user-defined extracted classes without mutating builtins
  const classes: ClassDef[] = BUILTIN_CLASSES.map((c) => ({
    ...c,
    members: [...c.members],
  }));

  for (const c of extractedClasses) {
    const existing = classes.find((ec) => ec.name === c.name);
    if (existing) {
      // Merge members
      for (const m of c.members) {
        if (!existing.members.some((em) => em.name === m.name)) {
          existing.members.push(m);
        }
      }
    } else {
      classes.push(c);
    }
  }

  // Deduplicate variables by name so builtins and locals do not collide
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

  // Deduplicate functions by name
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
    diagnostics,
    symbols: {
      variables,
      functions,
      classes,
      enums: BUILTIN_ENUMERATIONS,
      customVerbs: Array.from(customVerbs),
    },
  };
}

function extractParams(tokens: Token[], startIndex: number): any[] {
  const params: any[] = [];
  if (tokens[startIndex]?.value !== '(') return params;
  let idx = startIndex + 1;
  while (idx < tokens.length && tokens[idx].value !== ')') {
    if (tokens[idx].type === 'identifier') {
      params.push({ name: tokens[idx].value, type: 'any' });
    }
    idx++;
  }
  return params;
}

// Handles typed parameter lists like (int 1, string 2, float 3) or (string name, int count)
function extractTypedParams(tokens: Token[], startIndex: number): any[] {
  const params: any[] = [];
  let idx = startIndex;
  while (idx < tokens.length && tokens[idx].value !== ')') {
    const t = tokens[idx];
    if (t.type === 'type' || TYPE_KEYWORDS.has(t.value.toLowerCase())) {
      const paramType = t.value;
      const next = tokens[idx + 1];
      if (next && next.value !== ',' && next.value !== ')') {
        params.push({
          name: next.value,
          type: paramType,
        });
        idx += 2;
        continue;
      }
    } else if (t.type === 'identifier' || t.type === 'number' || t.type === 'string') {
      params.push({
        name: t.value,
        type: t.type === 'number' ? 'int' : t.type === 'string' ? 'string' : 'any',
      });
    }
    idx++;
  }
  return params;
}
