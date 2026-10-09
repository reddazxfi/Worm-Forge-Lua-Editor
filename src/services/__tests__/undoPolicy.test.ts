// Tests for the undo coalescing policy.
//
// WHY THIS FILE EXISTS
// Ctrl+Z silently did nothing while typing, and nothing in the repo failed: the decision
// was an inline expression in `CodeEditor.tsx`, one `&&` where the logic needs an `||`.
// A single character could satisfy neither half, so it was folded into the entry holding
// the text you had BEFORE you started typing, destroying it. The stack never grew past
// one entry and `performUndo` returns early when `undo.length <= 1`.
//
// Deletes still worked, because a selection delete changes the length by more than
// `BIG_CHANGE` and took the other branch. Undo that works for one kind of edit and does
// nothing for another is the worst shape for a bug: the user cannot tell it is broken,
// they just conclude the editor lost their work.
//
// These simulate the STACK, not just the predicate, because the predicate alone cannot
// show the bug -- the damage is that the previous entry gets overwritten.
import { describe, it, expect } from 'vitest';
import {
  startsNewUndoEntry,
  isWordBoundary,
  BURST_MS,
  BIG_CHANGE,
} from '../undoPolicy';

interface Snapshot {
  code: string;
}

interface Change {
  code: string;
  caret: number;
  timeSinceLastEdit: number;
}

/**
 * Replays `handleTextareaChange`'s history bookkeeping exactly: push when the policy
 * says so, otherwise overwrite the top entry in place.
 */
function simulate(initial: string, changes: Change[]): { undo: Snapshot[] } {
  const undo: Snapshot[] = [{ code: initial }];

  for (const change of changes) {
    const last = undo[undo.length - 1];
    const newEntry = startsNewUndoEntry({
      hasSnapshot: !!last,
      timeSinceLastEdit: change.timeSinceLastEdit,
      atWordBoundary: isWordBoundary(change.code, change.caret),
      lengthDelta: change.code.length - (last?.code.length ?? 0),
    });

    if (newEntry) {
      undo.push({ code: change.code });
    } else {
      last.code = change.code;
    }
  }
  return { undo };
}

describe('startsNewUndoEntry', () => {
  const base = {
    hasSnapshot: true,
    timeSinceLastEdit: 0,
    atWordBoundary: false,
    lengthDelta: 1,
  };

  it('always pushes the very first edit', () => {
    expect(startsNewUndoEntry({ ...base, hasSnapshot: false })).toBe(true);
  });

  it('pushes after a pause', () => {
    // The single character typed after thinking for a moment. This is the case that
    // broke: under the old `&&` it needed a word boundary TOO, so it was not a new
    // entry and the pre-typing text was overwritten.
    expect(startsNewUndoEntry({ ...base, timeSinceLastEdit: 2000 })).toBe(true);
  });

  it('pushes on a word boundary even without a pause', () => {
    expect(startsNewUndoEntry({ ...base, atWordBoundary: true })).toBe(true);
  });

  it('pushes a paste or bulk delete', () => {
    expect(startsNewUndoEntry({ ...base, lengthDelta: BIG_CHANGE + 1 })).toBe(true);
    expect(startsNewUndoEntry({ ...base, lengthDelta: -(BIG_CHANGE + 1) })).toBe(true);
  });

  it('folds a fast continuation of the same burst', () => {
    // The one case that must NOT push, or typing would fill the history with one entry
    // per character and evict real states through the 250 cap.
    expect(startsNewUndoEntry(base)).toBe(false);
  });

  it('treats exactly BURST_MS as still the same burst', () => {
    expect(startsNewUndoEntry({ ...base, timeSinceLastEdit: BURST_MS })).toBe(false);
  });
});
// __APPEND__

describe('typing is undoable', () => {
  it('a character typed after a pause leaves the previous text in the history', () => {
    const { undo } = simulate('local x = 1', [
      { code: 'local x = 1a', caret: 11, timeSinceLastEdit: 2000 },
    ]);
    expect(undo.map((s) => s.code)).toEqual(['local x = 1', 'local x = 1a']);
  });

  it('a run of characters collapses to one entry, with the start preserved', () => {
    const { undo } = simulate('', [
      { code: 'a', caret: 1, timeSinceLastEdit: 2000 }, // pause -> new entry
      { code: 'ab', caret: 2, timeSinceLastEdit: 80 }, // same burst -> folded
      { code: 'abc', caret: 3, timeSinceLastEdit: 80 }, // same burst -> folded
    ]);
    expect(undo.map((s) => s.code)).toEqual(['', 'abc']);
  });

  it('a second burst after another pause is its own undo step', () => {
    const { undo } = simulate('', [
      { code: 'a', caret: 1, timeSinceLastEdit: 2000 },
      { code: 'ab', caret: 2, timeSinceLastEdit: 100 },
      { code: 'ab c', caret: 4, timeSinceLastEdit: 2000 },
    ]);
    expect(undo.map((s) => s.code)).toEqual(['', 'ab', 'ab c']);
  });

  it('word boundaries give word-granularity undo', () => {
    // Unwinding this stack removes 'b', then the space, then 'a' -- one character per
    // step WITHIN a word, and a boundary closes the entry so the space gets its own.
    const { undo } = simulate('', [
      { code: 'a', caret: 1, timeSinceLastEdit: 2000 }, // pause -> new entry
      { code: 'a ', caret: 2, timeSinceLastEdit: 90 }, // typed a space -> new entry
      { code: 'a b', caret: 3, timeSinceLastEdit: 90 }, // same word -> folded
    ]);
    expect(undo.map((s) => s.code)).toEqual(['', 'a', 'a b']);
  });

  it('a typed space closes the current entry rather than extending it', () => {
    // Without this, typing "hello world" would end with a single entry and Ctrl+Z would
    // wipe the whole line instead of the word.
    const { undo } = simulate('', [
      { code: 'hello', caret: 5, timeSinceLastEdit: 2000 },
      { code: 'hello ', caret: 6, timeSinceLastEdit: 60 },
    ]);
    expect(undo.map((s) => s.code)).toEqual(['', 'hello', 'hello ']);
  });

  it('typing never leaves the history with a single entry', () => {
    // The regression itself, as a property rather than one case: if any ordinary typing
    // run left the stack at length 1, undo would be a no-op.
    const { undo } = simulate('local M = {}', [
      { code: 'local M = {a', caret: 11, timeSinceLastEdit: 2000 },
      { code: 'local M = {ab', caret: 12, timeSinceLastEdit: 70 },
      { code: 'local M = {abc', caret: 13, timeSinceLastEdit: 70 },
    ]);
    expect(undo.length).toBeGreaterThan(1);
    expect(undo[0].code).toBe('local M = {}');
  });

  it('still undoes a bulk delete', () => {
    const { undo } = simulate('a'.repeat(40), [{ code: '', caret: 0, timeSinceLastEdit: 50 }]);
    expect(undo.map((s) => s.code)).toEqual(['a'.repeat(40), '']);
  });
});

describe('isWordBoundary', () => {
  it('detects the character after the caret', () => {
    expect(isWordBoundary('a b', 1)).toBe(true);
    expect(isWordBoundary('ab c', 2)).toBe(true);
  });

  it('is false before an ordinary character', () => {
    expect(isWordBoundary('abc', 0)).toBe(false);
  });

  it('treats a newline and a tab as boundaries', () => {
    expect(isWordBoundary('a\nb', 1)).toBe(true);
    expect(isWordBoundary('a\tb', 1)).toBe(true);
  });

  it('is false at the end of the document', () => {
    expect(isWordBoundary('abc', 3)).toBe(false);
  });

  it('agrees with the full-string regex it replaces', () => {
    // Pinned so the optimisation cannot silently change behaviour. The old form was
    // `/\s$/.test(newCode)`, which anchors to the LAST character of the document; the
    // replacement reads the character at the caret. They agree when the caret is at
    // the end, which is why this is stated explicitly.
    for (const doc of ['', 'a', 'a ', 'a\n', '  ']) {
      expect(isWordBoundary(doc, doc.length)).toBe(/\s$/.test(doc));
    }
  });
});