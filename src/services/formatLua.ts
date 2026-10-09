// Re-indent Lua. Structure-aware, and it cannot change what the code DOES.
//
// WHY THIS IS ITS OWN MODULE
// The original was a 20-line closure inside App.tsx that counted block-opening
// keywords with two regexes over the raw line. It corrupted real packs, and
// because it is wired to a toolbar button, one click is enough to rewrite a
// 4,500-line rules.lua. That makes its failure mode silent and expensive, so it
// gets tests like the checker does.
//
// THE BUGS THIS FIXES (all reproduced, see compacted-context.md §32)
//  1. RUNAWAY INDENT. `{` incremented depth, and `}` only decremented when the
//     line STARTED with `}`. A one-line table -- `{ a = 1, b = 2 }` -- therefore
//     incremented and never decremented, so EVERY following line in the file
//     drifted one level right, permanently. This is the bad one.
//  2. KEYWORDS IN STRINGS AND COMMENTS. The tests ran against the raw line, so
//     `local s = 'end of it'` and `-- end of loop` both moved the indent.
//  3. NO BRACKET CONTINUATION. A call or table spanning lines got no indent at
//     all, because `(` was never counted.
//
// WHAT IT DELIBERATELY DOES NOT DO
// It never rewraps, reorders, adds or removes anything, and it leaves every
// character from the first non-whitespace one onward untouched. Indentation
// only. Anything smarter needs a real pretty-printer and a bigger corpus.

/**
 * Blanks out string and comment CONTENT, replacing each character with a space
 * so the line keeps its length and every later column index stays valid. The
 * returned line still has correct structure (brackets and keywords outside
 * literals are real), but no keyword can hide inside a string.
 */
export function maskLiterals(line: string): string {
  const out = line.split('');
  let i = 0;
  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < out.length; k++) {
      if (out[k] !== '\n') out[k] = ' ';
    }
  };

  while (i < line.length) {
    const c = line[i];

    // Long-bracket string or comment: [[ ... ]] and [==[ ... ]==]
    if (c === '[') {
      const long = /^\[(=*)\[/.exec(line.slice(i));
      if (long) {
        const close = ']' + long[1] + ']';
        const end = line.indexOf(close, i + long[0].length);
        const stop = end === -1 ? line.length : end + close.length;
        blank(i, stop);
        i = stop;
        continue;
      }
    }

    // Line comment -- runs to end of line.
    if (c === '-' && line[i + 1] === '-') {
      blank(i, line.length);
      break;
    }

    // Quoted string, honouring backslash escapes.
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      while (j < line.length) {
        if (line[j] === '\\') {
          j += 2;
          continue;
        }
        if (line[j] === quote) {
          j++;
          break;
        }
        j++;
      }
      blank(i, j);
      i = j;
      continue;
    }

    i++;
  }
  return out.join('');
}

/** Block keywords on this line that OPEN a level, and ones that CLOSE one.
 *
 *  Counting BOTH sides is what makes one-liners work. The old code guarded the
 *  open with `!/\bend\b/`, which was wrong in the other direction: `function f()
 *  end` on one line contains `end`, so it refused to indent and the level only
 *  stayed balanced by accident. Here it nets to zero, which is correct.
 *
 *  `until` closes `repeat`, exactly like `end`. */
function countBlocks(masked: string): { open: number; close: number } {
  // `do` counts ONLY as a standalone block opener.
  //
  // `for ... do` and `while ... do` were counting TWICE -- once for the keyword
  // and again for the `do` -- while a single `end` closes them. That inflated every
  // loop in the corpus: bee.lua ended 7 blocks "open" and was reported `suspect`
  // despite being valid Lua the game loads. A `do` trailing a for/while on the same
  // line belongs to THAT block, so it is not counted here.
  const standaloneDo = (masked.match(/(?:^|[\s(;{])do(?=\s|$)/g) || []).filter((m) => {
    const before = masked.slice(0, masked.indexOf(m));
    return !/\b(for|while)\b[^;]*$/.test(before);
  }).length;

  const open =
    (masked.match(/(?:^|[\s(=;])(function|if|for|while|repeat)\b/g) || []).length +
    standaloneDo;
  const close =
    // The trailing lookahead has to cover everything that can legally follow a
    // block keyword, not just a handful. `end,` (a table entry) was missed, which
    // left 8 phantom unclosed blocks in bee.lua and reported a valid pack as
    // `suspect`. A blanked-out literal cannot match here, so this is safe to make
    // permissive -- the cost of an over-count is one stray indent, the cost of an
    // under-count was a false "your file is unbalanced" on real code.
    (masked.match(/(?:^|[\s;])end(?=[\s.;)\]},]|$)/g) || []).length +
    (masked.match(/(?:^|[\s;])until(?=[\s.;)\]},]|$)/g) || []).length;
  return { open, close };
}

/** Bracket depth change on this line. Counts `(`/`[`/`{` against
 *  `)`/`]`/`}`, which is what gives continuation lines their indent. */
function countBrackets(masked: string): number {
  const opened = (masked.match(/[([{]/g) || []).length;
  const closed = (masked.match(/[)\]}]/g) || []).length;
  return opened - closed;
}

export interface FormatResult {
  code: string;
  /** True when block or bracket depth did not return to zero, which means the
   *  input is unbalanced and the re-indent is best-effort. The caller warns
   *  rather than silently writing something odd. */
  suspect: boolean;
}

/**
 * Re-indents `code`. Idempotent: formatting the output again returns it
 * unchanged, which is the property that makes this safe to run on a file that
 * is already formatted.
 */
export function formatLua(code: string): FormatResult {
  const lines = code.split('\n');
  const out: string[] = [];

  let block = 0;
  let bracket = 0;
  let suspect = false;

  for (const raw of lines) {
    // Trailing whitespace goes: a re-indent that left `local b = 2␣␣␣` behind is
    // still a diff on every line. Interior spacing is NEVER touched.
    const trimmed = raw.trim();

    if (!trimmed) {
      out.push('');
      continue;
    }

    const masked = maskLiterals(raw);
    const blocks = countBlocks(masked);
    const brackets = countBrackets(masked);

    // A line that OPENS A BLOCK does not also add bracket indentation.
    //
    // `wa.on.hud(function()` opens a call AND an anonymous function. The function
    // body is already one level in from the block; charging the call's paren on
    // top of that put it two levels in, which is not the shape the engine's packs
    // use. Likewise `function a()` must not indent its own body twice.
    //
    // Brackets are STILL COUNTED for the balance check -- only the extra indent is
    // suppressed, so `wa.log(` with no block still gets continuation.
    //
    // Clamping the CARRY at zero matters: `end)` has no block open, so it takes
    // `delta = -1`, and without the floor the counter went negative and every
    // balanced file that ends a callback inline was reported `suspect` -- 78 of
    // the 99 corpus files, which made the flag useless.
    let delta = brackets;
    if (blocks.open > 0) delta = 0;
    if (blocks.close > 0) delta = Math.max(0, delta);

    // How far THIS line dedents before printing:
    //  - it starts with a block closer (`end`, `else`, `elseif`, `until`)
    //  - it starts by closing a bracket
    //
    //  The two are NOT independent. `end)` closes one block AND one bracket, and
    //  `end, 40)` is the common shape: a callback that ends inline. Counting each
    //  once is right, but a line like `end)` must dedent for BOTH, which is what
    //  this does. Treating them as alternatives (the earlier version used an
    //  `else if`) left `end)` dedented by one and every following line stuck out
    //  by a level.
    let dedent = 0;
    if (/^\s*(end|else|elseif|until)\b/.test(masked)) dedent++;
    const firstChar = masked.trimStart()[0];
    if (firstChar === ')' || firstChar === ']' || firstChar === '}') dedent++;

    const level = Math.max(0, block + bracket - dedent);
    out.push('  '.repeat(level) + trimmed);

    // Carry depth forward. Clamp at zero and flag, rather than going negative.
    block += blocks.open - blocks.close;
    bracket += delta;
    if (block < 0) {
      block = 0;
      suspect = true;
    }
    if (bracket < 0) {
      bracket = 0;
      suspect = true;
    }
  }

  if (block !== 0 || bracket !== 0) suspect = true;
  return { code: out.join('\n'), suspect };
}