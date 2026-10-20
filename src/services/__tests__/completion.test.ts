import { describe, it, expect } from 'vitest';
import { planInsertion } from '../completion';

/** Apply a plan to the line, as the editor would. */
function applied(line: string, caret: number, insertText: string): string {
  const plan = planInsertion(line, caret, insertText);
  return line.slice(0, plan.start) + plan.text + line.slice(caret);
}

describe('planInsertion: dotted receivers', () => {
  it('does not repeat an already-typed receiver (the wa.wa.world bug)', () => {
    expect(applied('wa.world', 8, 'wa.world.size')).toBe('wa.world.size');
  });

  it('completes after a trailing dot without a doubled dot', () => {
    expect(applied('wa.', 3, 'wa.world.size')).toBe('wa.world.size');
  });

  it('completes a partial middle segment', () => {
    expect(applied('wa.wea', 6, 'wa.weapons.launch(spec)')).toBe('wa.weapons.launch(spec)');
  });

  it('completes the last segment of a deeper path', () => {
    expect(applied('wa.world.si', 11, 'wa.world.size')).toBe('wa.world.size');
  });

  it('keeps the item as-is when it is just a member name', () => {
    expect(applied('obj.', 4, 'size')).toBe('obj.size');
    expect(applied('worm:hu', 7, 'hurt')).toBe('worm:hurt');
  });

  it('is case-insensitive about the receiver check only', () => {
    expect(applied('Wa.world', 8, 'wa.world.size')).toBe('Wa.world.size');
  });

  it('leaves an unrelated receiver alone', () => {
    expect(applied('foo.ba', 6, 'bar')).toBe('foo.bar');
  });

  it('works after leading indentation', () => {
    expect(applied('    wa.world', 12, 'wa.world.size')).toBe('    wa.world.size');
  });
});

describe('planInsertion: separator repairs', () => {
  it('swallows -> and inserts the dot', () => {
    const plan = planInsertion('wa->', 4, '.');
    expect(plan.start).toBe(2);
    expect(plan.text).toBe('.');
  });

  it('swallows -> and inserts a method', () => {
    const plan = planInsertion('a->', 3, ':gfx()');
    expect(plan.start).toBe(1);
    expect(plan.text).toBe(':gfx()');
  });

  it('consumes a typed colon when the suggestion begins with one', () => {
    expect(applied('a:', 2, ':gfx()')).toBe('a:gfx()');
  });

  it('does not consume a colon elsewhere on the line', () => {
    expect(applied('local x = 1; a:', 15, ':gfx()')).toBe('local x = 1; a:gfx()');
  });
});

describe('planInsertion: plain identifiers', () => {
  it('replaces the partial word only', () => {
    const plan = planInsertion('drum', 4, 'drumroll');
    expect(plan.start).toBe(0);
    expect(plan.text).toBe('drumroll');
  });

  it('keeps text after the caret untouched', () => {
    const plan = planInsertion('drum = 1', 4, 'drumroll');
    expect(plan.start).toBe(0);
    expect(plan.text).toBe('drumroll');
    // The caller appends line.slice(caret), so ` = 1` survives; assert the
    // caret math instead: start + text length is the new caret.
    expect(plan.start + plan.text.length).toBe(8);
  });

  it('carries the nested-table caret offset', () => {
    const plan = planInsertion('  mis', 5, 'missile = {  }', 2);
    expect(plan.start).toBe(2);
    expect(plan.text).toBe('missile = {  }');
    expect(plan.cursorBack).toBe(2);
  });
});
