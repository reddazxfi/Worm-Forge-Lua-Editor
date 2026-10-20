// Enums-tab data: class-qualified string enums round-trip into the symbol
// tree unchanged (parser.ts passes BUILTIN_ENUMERATIONS through), and the
// state_label table must stay generated from the engine's own WORM_STATES.
import { describe, it, expect } from 'vitest';
import { BUILTIN_ENUMERATIONS } from '../../data/wormforgeDefinitions';
import { WORM_STATES, READABLE_WORM_STATES, SETTABLE_WORM_STATES } from '../../data/wormStates';
import { parseAndValidate } from '../parser';

describe('builtin enumerations', () => {
  it('keeps wa.msg plus the two class-qualified string enums', () => {
    const names = BUILTIN_ENUMERATIONS.map((e) => e.name);
    expect(names).toEqual(['wa.msg', 'wa.depth', 'WorldHandle.kind', 'WormEntity.state_label']);
  });

  it('lists all 9 kind_name() values including the null handle', () => {
    const kind = BUILTIN_ENUMERATIONS.find((e) => e.name === 'WorldHandle.kind');
    expect(kind?.values.map((v) => v.name)).toEqual([
      'none', 'mine', 'missile', 'crate', 'worm', 'oil', 'grave', 'land', 'object',
    ]);
  });

  it('derives state_label from WORM_STATES so it cannot drift', () => {
    const label = BUILTIN_ENUMERATIONS.find((e) => e.name === 'WormEntity.state_label');
    expect(label?.values.map((v) => v.name)).toEqual(WORM_STATES.map((s) => s.name));
    expect(label?.values.length).toBe(28);
  });

  it('does not confuse state_label with readable/settable states', () => {
    // worm.state reads back 12 names; set_state accepts 6. state_label is the
    // 28-entry debug table — a superset of neither.
    expect(READABLE_WORM_STATES.length).toBe(12);
    expect(SETTABLE_WORM_STATES.length).toBe(6);
    expect(WORM_STATES.length).toBe(28);
  });

  it('exposes the enums through the parsed symbol tree', () => {
    const { symbols } = parseAndValidate('local x = 1');
    expect(symbols.enums.map((e) => e.name)).toContain('WorldHandle.kind');
    expect(symbols.enums.map((e) => e.name)).toContain('WormEntity.state_label');
  });
});
