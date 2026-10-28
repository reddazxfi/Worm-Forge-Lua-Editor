// Where a completion goes when it is accepted.
//
// WHY THIS IS ITS OWN FUNCTION
// The rule is simple but easy to get subtly wrong: replace only what the user
// is still typing. The old inline version replaced the word before the caret,
// which is right for `foo.ba` but wrong for a fully qualified suggestion:
//
//     typed:  wa.world          suggestion: wa.world.size
//     result: wa.wa.world.size  (the receiver was kept AND re-inserted)
//
// A `wa.` prefix therefore doubled every time Tab was pressed. Keeping the
// calculation pure means the cases -- dotted receivers, member access, the
// `->` and `:` repairs -- are pinned by tests instead of by memory.

export interface InsertionPlan {
  /** Where the replacement starts, as an offset within the current line. */
  start: number;
  /** The text to put there (not always the item's insertText). */
  text: string;
  /** How far from the end of `text` the caret should land. */
  cursorBack: number;
}

/**
 * Plans accepting `insertText` at `caretInLine` of `currentLine`.
 *
 * `currentLine` is the line WITHOUT its newline, `caretInLine` is the caret
 * offset inside it.
 */
export function planInsertion(
  currentLine: string,
  caretInLine: number,
  insertText: string,
  cursorBack = 0
): InsertionPlan {
  const beforeCaret = currentLine.slice(0, caretInLine);
  const partialWord = (beforeCaret.match(/[A-Za-z0-9_]*$/) ?? [''])[0];
  const wordStart = caretInLine - partialWord.length;

  // The receiver the caret is completing: `wa.` in `wa.world`, including the
  // separator. Only the identifier chain immediately before the caret counts --
  // `local x = wa.` must strip `wa.`, not the whole statement. Detected from
  // the typed line, not from the suggestion, so it is right even when the top
  // hit belongs to a different namespace.
  const receiver = currentLine.slice(0, wordStart);
  const memberCompletion = /[.:]\s*$/.test(receiver);
  const chain = receiver.match(
    /[A-Za-z_][A-Za-z0-9_]*(?:\s*\.\s*[A-Za-z_][A-Za-z0-9_]*)*\s*[.:]\s*$/
  );
  // Normalised so `wa . world .` compares like `wa.world.`.
  const typedReceiver = chain ? chain[0].replace(/\s+/g, '') : '';

  let start = wordStart;
  let text = insertText;

  // A suggestion that already contains the typed receiver must not repeat it.
  // `wa.world` + `wa.world.size` -> replace `world` with `world.size`.
  // `wa.`      + `wa.world.size` -> replace nothing with `world.size`.
  if (memberCompletion && typedReceiver.length > 0 && text.toLowerCase().startsWith(typedReceiver.toLowerCase())) {
    text = text.slice(typedReceiver.length);
    if (text.startsWith('.')) text = text.slice(1);
  }

  // `->` repair: the suggestion starts with the separator the user should have
  // typed, so swallow the whole `->` instead of leaving it behind.
  const arrowIdx = currentLine.lastIndexOf('->', caretInLine - 1);
  if (
    arrowIdx !== -1 &&
    caretInLine >= arrowIdx + 2 &&
    currentLine.slice(wordStart, caretInLine).trim() === '' &&
    (insertText.startsWith('.') || insertText.startsWith(':'))
  ) {
    start = arrowIdx;
  }
  // `a:` + `:gfx()` -> consume the typed colon, or the result is `a::gfx()`.
  // Guarded on a colon sitting EXACTLY where the partial word starts.
  else if (memberCompletion && insertText.startsWith(':')) {
    const colonIdx = wordStart - 1;
    if (currentLine[colonIdx] === ':') start = colonIdx;
  }

  return { start, text, cursorBack };
}

/**
 * Plans a require-path insertion inside the string the user is typing.
 *
 * The generic `planInsertion` replaces only the last `[A-Za-z0-9_]*`, which is
 * right for `wa.world` but wrong for `lib/ut`: inserting `lib/util` there gives
 * `lib/lib/util`. A require name is a whole path, so replace everything between
 * the opening quote and the caret with the suggestion. That also handles
 * `wf-lib/effects/tr` and `lib/foo-` without a second prefix.
 */
export function planRequireInsertion(
  currentLine: string,
  caretInLine: number,
  insertText: string
): InsertionPlan | null {
  const beforeCaret = currentLine.slice(0, caretInLine);
  const doubleQuote = beforeCaret.lastIndexOf('"');
  const singleQuote = beforeCaret.lastIndexOf("'");
  const quote = Math.max(doubleQuote, singleQuote);
  if (quote === -1) return null;
  return { start: quote + 1, text: insertText, cursorBack: 0 };
}
