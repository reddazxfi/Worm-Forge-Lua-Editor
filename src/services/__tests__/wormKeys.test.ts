// §36 -- `wa.world.keys()` reference. The old KeycodeModal claimed Virtual-Key
// codes and listed F1-F10 as readable, none of which was true.
//
// These tests assert the data against the ENGINE SOURCE, not against a copy of the
// expectations. That is the whole point: a hand-written table of what the engine
// returns is exactly the thing that goes stale. If the engine adds a key or renames
// a bit, this fails rather than quietly lying to the user again.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  WORM_KEYS,
  KEYS_NOT_AVAILABLE,
  fieldForEventCode,
  digitForEventCode,
  prettyKeyName,
} from '../../data/wormKeys';

const ROOT = resolve(__dirname, '../../../WormForge-main-source');
const SPAWN_RS = join(ROOT, 'crates/lua-host/src/spawn.rs');
const WORLD_RS = join(ROOT, 'crates/engine/src/world.rs');
const haveEngine = existsSync(SPAWN_RS) && existsSync(WORLD_RS);

/** The fields the Lua binding actually sets on the keys() table. */
function fieldsTheEngineSets(): string[] {
  const src = readFileSync(SPAWN_RS, 'utf8');
  const end = src.indexOf('world.set("keys"');
  // Slice from the `let keys = lua` that STARTS the closure, not from a fixed
  // distance back. A fixed window is how the first version of this pulled in the
  // preceding `view` closure and reported cx/cy/x/y/h/w as key fields.
  const start = src.lastIndexOf('let keys = lua', end);
  expect(start, 'spawn.rs no longer has a `let keys = lua` closure').toBeGreaterThan(-1);
  const body = src.slice(start, end);
  return [...body.matchAll(/t\.set\("(\w+)"/g)].map((m) => m[1]);
}

describe('wormKeys matches the engine', () => {
  it('lists exactly the fields wa.world.keys() sets, no more and no fewer', () => {
    if (!haveEngine) {
      console.warn('[wormKeys] engine source absent -- SKIPPED');
      return;
    }
    const engine = fieldsTheEngineSets().sort();
    const ours = WORM_KEYS.map((k) => k.field).sort();
    // The point of this test. The old table listed 22 rows; the engine has 9.
    expect(ours).toEqual(engine);
  });

  it('every physical key we advertise is one poll_keys() actually polls', () => {
    if (!haveEngine) return;
    const src = readFileSync(WORLD_RS, 'utf8');
    const start = src.indexOf('fn poll_keys()');
    const body = src.slice(start, start + 1200);
    // Every `key_down(0x..)` literal in the polling function.
    const polled = new Set(
      [...body.matchAll(/key_down\(0x([0-9A-Fa-f]+)\)/g)].map((m) => parseInt(m[1], 16)),
    );
    expect(polled.size).toBeGreaterThan(8);

    // The VK codes behind the keys we claim, so this fails if the engine re-maps.
    const VK = {
      left: [0x25, 0x41],
      right: [0x27, 0x44],
      up: [0x26],
      down: [0x28, 0x53],
      jump: [0x57],
      sprint: [0x10],
      q: [0x51],
      space: [0x20],
    } as Record<string, number[]>;

    for (const k of WORM_KEYS) {
      if (k.numeric) continue; // digit is handled by a loop, not a literal
      for (const vk of VK[k.field] ?? []) {
        expect(
          polled.has(vk),
          `${k.field}: engine no longer polls 0x${vk.toString(16)}`,
        ).toBe(true);
      }
    }
  });

  it('the bits we publish are the ones the engine documents', () => {
    if (!haveEngine) return;
    const src = readFileSync(WORLD_RS, 'utf8');
    // The engine states the layout in its own comment above `pub fn keys()`.
    const m = /Bits: (.+)/.exec(src);
    expect(m, 'engine no longer documents the bit layout').toBeTruthy();
    const documented = [...(m?.[1] ?? '').matchAll(/(\d+)\s+(left|right|up|down|W|sprint|Q|Space)/g)];
    const bits: Record<string, number> = {};
    for (const d of documented) bits[d[2].toLowerCase()] = Number(d[1]);
    expect(bits.left).toBe(1);
    expect(bits.right).toBe(2);
    expect(bits.up).toBe(4);
    expect(bits.down).toBe(8);
    expect(bits.w).toBe(16);
    expect(bits.sprint).toBe(32);
    expect(bits.q).toBe(64);
    expect(bits.space).toBe(128);
  });

  it('exactly one field is numeric, and it is digit', () => {
    // `digit` is a value in bits 8..11. Treating it as a boolean is the bug its
    // note warns about, and the snippet we insert has to agree with that.
    const numeric = WORM_KEYS.filter((k) => k.numeric).map((k) => k.field);
    expect(numeric).toEqual(['digit']);
    expect(WORM_KEYS.find((k) => k.field === 'digit')?.bit).toBeNull();
  });

  it('every boolean field has a unique non-zero bit', () => {
    const bits = WORM_KEYS.filter((k) => k.bit !== null).map((k) => k.bit);
    expect(new Set(bits).size).toBe(bits.length);
    expect(bits.every((b) => b !== null && b > 0)).toBe(true);
  });
});


describe('wormKeys never invents a binding', () => {
  it('every field the tester reports is a field we actually document', () => {
    const documented = new Set(WORM_KEYS.map((k) => k.field));
    for (const code of [
      'ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD', 'ArrowUp', 'ArrowDown', 'KeyS',
      'KeyW', 'ShiftLeft', 'ShiftRight', 'KeyQ', 'Space',
      ...Array.from({ length: 10 }, (_, i) => `Digit${i}`),
      ...Array.from({ length: 10 }, (_, i) => `Numpad${i}`),
    ]) {
      const field = fieldForEventCode(code);
      expect(field, code).not.toBeNull();
      expect(documented.has(field as string), code).toBe(true);
    }
  });

  it('reports null for keys the old table wrongly claimed were readable', () => {
    // F-keys, Enter, Backspace and Tab: all listed in the old reference, none of
    // them polled by the engine. The tester must NOT claim they do something.
    for (const code of [
      'F1', 'F2', 'F10', 'Enter', 'Backspace', 'Tab', 'Escape', 'KeyZ', 'KeyX',
    ]) {
      expect(fieldForEventCode(code), code).toBeNull();
    }
  });

  it('says out loud that the old F-keys are unavailable', () => {
    const text = KEYS_NOT_AVAILABLE.map((k) => k.keys).join(' ');
    expect(text).toContain('F1 - F10');
    expect(text).toContain('Enter');
    expect(text).toContain('Tab');
  });

  it('maps digits to their number, and only digits', () => {
    expect(digitForEventCode('Digit0')).toBe(0);
    expect(digitForEventCode('Digit7')).toBe(7);
    expect(digitForEventCode('Numpad3')).toBe(3);
    expect(digitForEventCode('KeyQ')).toBeNull();
    expect(digitForEventCode('ArrowLeft')).toBeNull();
  });

  it('labels keys for the UI', () => {
    expect(prettyKeyName('KeyQ')).toBe('Q');
    expect(prettyKeyName('Digit4')).toBe('4');
    expect(prettyKeyName('Numpad4')).toBe('Num 4');
    expect(prettyKeyName('ArrowLeft')).toBe('Left');
    expect(prettyKeyName('ShiftLeft')).toBe('Shift');
  });
});
