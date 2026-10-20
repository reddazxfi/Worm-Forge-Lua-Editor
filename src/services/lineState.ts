// Is the caret inside a comment or a string?
//
// The autocomplete popup used to open on prose: `-- see wa.` or `print("wa.`
// offered the whole engine namespace while the user was writing text. Nothing
// in a comment is code, and the only completion that belongs inside a string is
// the enum-value branch, which runs before this guard and returns on its own.
//
// The input is the LINE UP TO THE CARET, not the whole line: that is exactly the
// state the caret is in. Cross-line long strings (`[[ ... ]]`) are not tracked --
// the caller only has one line, and the checker still sees the real chunk.

export interface LineState {
  inComment: boolean;
  inString: boolean;
}

export function lineStateBeforeCaret(line: string): LineState {
  let quote: string | null = null;
  let longString = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];

    if (longString) {
      if (c === ']' && line[i + 1] === ']') {
        longString = false;
        i++;
      }
      continue;
    }

    if (quote) {
      if (c === '\\') {
        i++;
        continue;
      }
      if (c === quote) quote = null;
      continue;
    }

    // `--` starts a comment only outside a string (the quote branch above has
    // already claimed those characters).
    if (c === '-' && line[i + 1] === '-') return { inComment: true, inString: false };
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === '[' && line[i + 1] === '[') {
      longString = true;
      i++;
    }
  }

  return { inComment: false, inString: quote !== null || longString };
}
