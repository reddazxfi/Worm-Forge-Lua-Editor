// When does a keystroke start a NEW undo entry, rather than being folded into the
// entry being typed?
//
// WHY THIS IS A SEPARATE FILE
// It was inlined in `CodeEditor.tsx` with an `&&` where the logic needs an `||`, and
// the result was that Ctrl+Z did nothing at all while typing: a single character could
// satisfy neither half of the `&&`, so it fell through to the "fold into the current
// entry" branch, which OVERWRITES the entry holding the text before you started typing.
// The stack never grew past one entry, and `performUndo` returns immediately when
// `undo.length <= 1`.
//
// The tell was that DELETES still undid correctly: a selection delete changes the
// length by more than `BIG_CHANGE`, so it took the other branch and pushed a real
// entry. Undo that works for one kind of edit and silently does nothing for another is
// the worst shape a bug can have, and nothing failed -- there was no test.
//
// WHY IT IS PURE
// No React, no DOM. The whole decision is four inputs and a boolean, so it can be
// tested directly instead of inferred from a keystroke the user has to reproduce.

/** A pause longer than this starts a new entry, so undo works at word granularity. */
export const BURST_MS = 600;

/**
 * A single change this large is a paste or a selection delete, never typing.
 *
 * Typing must never reach this: coalescing a paste one character at a time would fill
 * the history with useless entries and push real ones out of the 250 cap.
 */
export const BIG_CHANGE = 15;

export interface UndoBurstInput {
  /** False when the history has no entry yet -- the very first edit always pushes. */
  hasSnapshot: boolean;
  /** Milliseconds since the previous accepted change. */
  timeSinceLastEdit: number;
  /**
   * True when the caret landed on a whitespace/newline boundary.
   *
   * This is the natural unit of typing, so it gets its own undo step. Note it is
   * derived from the character AFTER the caret, which is why it is passed in rather
   * than recomputed here.
   */
  atWordBoundary: boolean;
  /** Signed size change of this edit. */
  lengthDelta: number;
}

export function startsNewUndoEntry({
  hasSnapshot,
  timeSinceLastEdit,
  atWordBoundary,
  lengthDelta,
}: UndoBurstInput): boolean {
  // No history yet, or the caret paused, or a word was completed, or this is a
  // paste/bulk delete. Anything else is another character of the same burst and gets
  // folded into the entry currently being typed.
  return (
    !hasSnapshot ||
    timeSinceLastEdit > BURST_MS ||
    atWordBoundary ||
    Math.abs(lengthDelta) > BIG_CHANGE
  );
}

/**
 * Whether the character immediately after the caret is whitespace.
 *
 * Replaces `/\s$/.test(newCode)`, which scanned the WHOLE document on every keystroke.
 * On the 168 KB `rules.lua` that is a full pass per character typed; this reads one
 * character instead. The two are equivalent -- `$` anchors to the last character --
 * and the trailing `|| endsWith('\n')` it replaced was already covered, since `\n` is
 * whitespace.
 */
export function isWordBoundary(code: string, caret: number): boolean {
  // BOTH sides matter, and getting this wrong is subtle. Checking only the character
  // AHEAD misses the common case: after typing a space the caret sits PAST it, so the
  // space is `caret - 1`, not `caret`, and the boundary goes unseen. Checking only
  // BEHIND misses moving onto an existing space. A boundary is whitespace on either
  // side of the caret.
  const before = caret > 0 ? code[caret - 1] : '';
  const after = caret < code.length ? code[caret] : '';
  return isSpace(before) || isSpace(after);
}

function isSpace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}