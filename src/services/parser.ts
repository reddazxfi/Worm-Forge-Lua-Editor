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
        while (i < code.length && /[0-9a-fA-F_]/.test(code[i])) {
          num += code[i];
          i++;
          col++;
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
        if (left.value === 'a' || left.value === 'actor') {
          const actorClass = BUILTIN_CLASSES.find((c) => c.name === 'LuaActor')!;
          if (!actorClass.members.some((m) => m.name === method)) {
            const validMethods = actorClass.members.filter((m) => m.kind === 'method').map((m) => m.name).join(', ');
            diagnostics.push({
              line: right.line,
              column: right.column,
              message: `Unknown LuaActor method "${method}". Valid methods include: ${validMethods}`,
              severity: 'warning',
              rule: 'actor-api',
            });
          }
        } else if (left.value === 'worm') {
          const wormClass = BUILTIN_CLASSES.find((c) => c.name === 'WormEntity')!;
          if (!wormClass.members.some((m) => m.name === method)) {
            const validMethods = wormClass.members.filter((m) => m.kind === 'method').map((m) => m.name).join(', ');
            diagnostics.push({
              line: right.line,
              column: right.column,
              message: `Unknown WormHandle method "${method}". Valid methods include: ${validMethods}`,
              severity: 'warning',
              rule: 'worm-api',
            });
          }
        } else if (['inv', 'store', 'inventory'].includes(left.value)) {
          const invClass = BUILTIN_CLASSES.find((c) => c.name === 'InventoryStore');
          if (invClass && !invClass.members.some((m) => m.name === method)) {
            const validMethods = invClass.members.filter((m) => m.kind === 'method').map((m) => m.name).join(', ');
            diagnostics.push({
              line: right.line,
              column: right.column,
              message: `Unknown InventoryStore method "${method}". Valid methods include: ${validMethods}`,
              severity: 'warning',
              rule: 'inventory-api',
            });
          }
        } else if (['mine', 'drum', 'oil', 'oildrum', 'crate', 'grave', 'obj', 'object'].includes(left.value)) {
          const worldClass = BUILTIN_CLASSES.find((c) => c.name === 'WorldHandle');
          if (worldClass && !worldClass.members.some((m) => m.name === method)) {
            const validMethods = worldClass.members.filter((m) => m.kind === 'method').map((m) => m.name).join(', ');
            diagnostics.push({
              line: right.line,
              column: right.column,
              message: `Unknown WorldHandle method "${method}". Valid methods include: ${validMethods}`,
              severity: 'warning',
              rule: 'world-object-api',
            });
          }
        } else if (left.value === 'm' || left.value === 'missile') {
          const missileClass = BUILTIN_CLASSES.find((c) => c.name === 'MissileEntity');
          if (missileClass && !missileClass.members.some((m) => m.name === method)) {
            diagnostics.push({
              line: right.line,
              column: right.column,
              message: `Unknown MissileEntity method "${method}". In-flight missile tables provide properties: id, weapon, sprite, collision_mask, x, y, vx, vy, damp, wind_scale, gravity_scale`,
              severity: 'warning',
              rule: 'missile-api',
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
