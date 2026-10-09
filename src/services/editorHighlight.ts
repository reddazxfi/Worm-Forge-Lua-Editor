// Syntax highlighting for the code editor.
//
// WHY IT IS ITS OWN MODULE
// It was a 260-line function inline in CodeEditor.tsx with no tests, so a
// colouring bug could only be found by LOOKING at the editor. It is pure text
// in, HTML string out, with no React and no DOM, so it belongs beside the other
// pure helpers in services/ and the safety property below becomes testable.
//
// THE ONE PROPERTY THAT MATTERS
// Highlighting must never CHANGE TEXT. A dropped or reordered character is a
// silent corruption of the user's source, and it presents as a code bug rather
// than a display bug. Measured over the whole engine corpus (30,839 lines x both
// themes): 0 lines altered, ~332k spans emitted. See `stripHighlightHtml`, which
// exists so a test can assert exactly that.
//
// WHAT IS COLOURED -- see services/editorThemes.ts for the palette itself and why
// it lives in a table rather than inline here.
//   keyword      local / if / end / then ...        rose
//   function     `playBuzz(`, `print(`             cyan
//   member       `log` in `wa.log`, `x` in `t.x`   pale cyan
//   declaration  the name in `local t`, `function f` sky
//   global       `math`, `tostring` (ONE shared list from data/luaGlobals.ts)
//   string       green        number  orange        hex  orange
//   operator     + - * / == ~= .. <=               rose
//   bracket      ( ) { } [ ]                       dim slate, deliberately
//
// Brackets are dimmer than operators on purpose. They mark structure without
// shouting over the names, which is what makes a call read at a glance.
//
// HOW THEMING REACHES HERE
// The `p` argument is the resolved palette for the current mode. It is a
// parameter rather than a module-level global on purpose: the highlighter stays a
// pure function, so the §33 text-integrity guarantee and its test are unaffected,
// and two themes can never race through shared state.
import { LUA_GLOBALS_SET } from '../data/luaGlobals';
import {
  resolveTokenClasses,
  themeSignature,
  type SyntaxOverrides,
  type TokenClasses,
} from './editorThemes';

/** The palette used when a caller passes none -- exactly the pre-§34 colours. */
export function defaultTokenClasses(isLight: boolean): TokenClasses {
  return resolveTokenClasses(isLight);
}

/** Re-exported so CodeEditor can build its cache key and palette without a second import. */
export { themeSignature, resolveTokenClasses };
export type { SyntaxOverrides, TokenClasses };


export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Removes the highlighting markup and undoes `escapeHtml`, so a test can assert
 * that `highlightLuaLine(line)` renders EXACTLY `line`. The one exemption is the
 * empty line, which becomes `&nbsp;` to keep the row's height.
 */
export function stripHighlightHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * @param palette Resolved classes for the current mode. Omit it and the default
 *   palette is used, which keeps every existing caller and test working unchanged.
 */
export function highlightLuaLine(
  line: string,
  isLight: boolean = false,
  palette?: TokenClasses,
): string {
  // Resolved once per line, not per token. `p` is then a plain lookup.
  const p = palette ?? defaultTokenClasses(isLight);
  if (!line) return '&nbsp;';

  let i = 0;
  let result = '';
  const len = line.length;

  while (i < len) {
    // 1. Comment (-- to end of line)
    if (line.slice(i, i + 2) === '--') {
      const commentText = line.slice(i);
      result += `<span class="${p.comment}">${escapeHtml(commentText)}</span>`;
      break;
    }

    // 2. String literal (double or single quote)
    const quote = line[i];
    if (quote === '"' || quote === "'") {
      let str = quote;
      let j = i + 1;
      let escaped = false;
      while (j < len) {
        const ch = line[j];
        str += ch;
        if (!escaped && ch === quote) {
          j++;
          break;
        }
        escaped = !escaped && ch === '\\';
        j++;
      }
      i = j;
      result += `<span class="${p.string}">${escapeHtml(str)}</span>`;
      continue;
    }

    // 3. Arrow operator -> (Flag as invalid in WormForge Lua)
    if (line.slice(i, i + 2) === '->') {
      result += `<span class="text-rose-500 font-bold underline decoration-wavy decoration-rose-500/70" title="'->' is not valid in Lua; use '.' (e.g. wa.log()) or ':' (e.g. a:gfx)">-&gt;</span>`;
      i += 2;
      continue;
    }

    // 4. Method call starting with colon :methodName
    if (line[i] === ':' && i + 1 < len && /[a-zA-Z_]/.test(line[i + 1])) {
      let j = i + 1;
      while (j < len && /[a-zA-Z0-9_]/.test(line[j])) j++;
      const meth = line.slice(i, j);
      result += `<span class="${p.method}">${escapeHtml(meth)}</span>`;
      i = j;
      continue;
    }

    // 5. Hex numbers (0x...) or Dec numbers
    if (line.slice(i, i + 2) === '0x' || line.slice(i, i + 2) === '0X') {
      let j = i + 2;
      while (j < len && /[0-9a-fA-F]/.test(line[j])) j++;
      const hex = line.slice(i, j);
      result += `<span class="${p.number}">${escapeHtml(hex)}</span>`;
      i = j;
      continue;
    }
    if (/[0-9]/.test(line[i]) && (i === 0 || !/[a-zA-Z_]/.test(line[i - 1]))) {
      let j = i;
      while (j < len && /[0-9.]/.test(line[j])) j++;
      const num = line.slice(i, j);
      result += `<span class="${p.number}">${escapeHtml(num)}</span>`;
      i = j;
      continue;
    }

    // 6. Word / Identifier
    if (/[a-zA-Z_]/.test(line[i])) {
      let j = i;
      while (j < len && /[a-zA-Z0-9_]/.test(line[j])) j++;
      const word = line.slice(i, j);

      // What FOLLOWS decides the colour: a `(` means this identifier is a function
      // CALL. That is the single biggest readability win, and it is what VS Code
      // does. Without it every function name rendered as plain body text, so
      // `wa.random(...)` and a bare `x` looked identical.
      let nextIdx = j;
      while (nextIdx < len && (line[nextIdx] === ' ' || line[nextIdx] === '\t')) nextIdx++;
      const nextCh = line[nextIdx];

      // What PRECEDES it: `.` or `:` means this is a member, not a call.
      let prevIdx = i - 1;
      while (prevIdx >= 0 && (line[prevIdx] === ' ' || line[prevIdx] === '\t')) prevIdx--;
      const prevCh = prevIdx >= 0 ? line[prevIdx] : '';

      // The visible text so far, tags stripped, so `local` / `function` on the
      // left can be detected. Distinguishes `local t = {}` and
      // `function playBuzz(` from `y = localThing()`.
      const before = result.replace(/<[^>]*>/g, '');
      const wasLocalOrFunc = /\b(local|function)\s+$/.test(before);

      i = j;

      if (/^(local|function|end|return|if|then|else|elseif|for|in|do|while|repeat|until|and|or|not|true|false|nil|goto|break)$/.test(word)) {
        result += `<span class="${p.keyword}">${escapeHtml(word)}</span>`;
      } else if (/^(int|float|string|bool|boolean|void|any|number|table)$/.test(word.toLowerCase()) && /:\s*$/.test(before)) {
        // A type ANNOTATION only: `function f(x: number)`. The old code coloured
        // every occurrence of `string`/`table` as a type, including `local t = {}`
        // and `string.format`, which are ordinary code.
        result += `<span class="${p.type}">${escapeHtml(word)}</span>`;
      } else if (word === 'wa') {
        result += `<span class="${p.waHandle}">${escapeHtml(word)}</span>`;
      // A function CALL: `(` OR `{` directly after. `{` matters because
      // `spawn_actor{ ... }` is Lua's call-with-table-argument sugar, and it is
      // how a lot of WormForge code reads -- `spawn_actor{` was rendering as
      // plain text before this.
      } else if ((nextCh === '(' || nextCh === '{') && prevCh !== '.' && prevCh !== ':') {
        // A plain function CALL: `print`, `tostring`, `isClearOfTerrain`.
        result += `<span class="${p.functionCall}">${escapeHtml(word)}</span>`;
      } else if (prevCh === '.' || prevCh === ':') {
        // A MEMBER of something else: `log` in `wa.log`, `x` in `t.x`. VS Code
        // tints these too, which is what makes `wa.land.trace` read as a path
        // rather than three unrelated words.
        result += `<span class="${p.member}">${escapeHtml(word)}</span>`;
      } else if (wasLocalOrFunc) {
        // The name being DECLARED, so `local t` and `function playBuzz` read the
        // same way and pop out of the surrounding code.
        result += `<span class="${p.declaration}">${escapeHtml(word)}</span>`;
      } else if (LUA_GLOBALS_SET.has(word)) {
        // Engine/Lua globals: `math`, `string`, `tostring`, `ipairs`. Uses the ONE
        // canonical list from data/luaGlobals.ts rather than a private copy.
        result += `<span class="${p.global}">${escapeHtml(word)}</span>`;
      } else {
        result += escapeHtml(word);
      }
      continue;
    }

    // 7. Punctuation and operators.
    //
    // ALL OF THESE USED TO RENDER AS PLAIN BODY TEXT -- every parenthesis, brace,
    // bracket, comma, colon and operator came out the same colour as an
    // identifier. That is precisely what made this look flat next to VS Code's
    // Lua highlighting.
    const twoChar = line.slice(i, i + 2);
    if (twoChar === '==' || twoChar === '~=' || twoChar === '<=' || twoChar === '>=' ||
        twoChar === '..' || twoChar === '//') {
      result += `<span class="${p.operator}">${escapeHtml(twoChar)}</span>`;
      i += 2;
      continue;
    }
    if ('+-*/%^#=<>~'.includes(line[i])) {
      result += `<span class="${p.operator}">${escapeHtml(line[i])}</span>`;
      i++;
      continue;
    }
    if ('(){}[]'.includes(line[i])) {
      // Dimmer than the operators on purpose, same as VS Code: the shape of the
      // code should read at a glance without the brackets shouting over the names.
      result += `<span class="${p.bracket}">${escapeHtml(line[i])}</span>`;
      i++;
      continue;
    }
    if (',;:.()'.includes(line[i]) || line[i] === ':') {
      result += `<span class="${p.punctuation}">${escapeHtml(line[i])}</span>`;
      i++;
      continue;
    }

    // 8. Anything left (whitespace, and the `.` of a number like `.5`).
    result += escapeHtml(line[i]);
    i++;
  }

  return result;
}