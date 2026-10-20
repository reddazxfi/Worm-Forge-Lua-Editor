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
  WORM_KEY_BINDINGS,
  KEYS_NOT_AVAILABLE,
  fieldForEventCode,
  digitForEventCode,
  prettyKeyName,
} from '../../data/wormKeys';

const ROOT = resolve(__dirname, '../../../WormForge-main-source');
const SPAWN_RS = join(ROOT, 'crates/lua-host/src/spawn.rs');
const WORLD_RS = join(ROOT, 'crates/engine/src/world.rs');
const SYNC_RS = join(ROOT, 'crates/game/src/sync_input.rs');
const haveEngine =
  existsSync(SPAWN_RS) && existsSync(WORLD_RS) && existsSync(SYNC_RS);

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
    // The point of this test. It has caught us twice: once for listing 22 rows
    // the engine never had, and once for listing 9 when API 4 made it 15.
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
    // `sprint` is here on purpose: it is the legacy alias, and it is still polled
    // through `shift`'s bit.
    const VK = {
      left: [0x25, 0x41],
      right: [0x27, 0x44],
      up: [0x26],
      down: [0x28, 0x53],
      jump: [0x57],
      sprint: [0x10],
      shift: [0x10],
      q: [0x51],
      space: [0x20],
      ctrl: [0x11],
      plus_key: [0xbb, 0x6b],
      minus_key: [0xbd, 0x6d],
      alt: [0x12],
      pause_key: [0x13],
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
    // The engine states the layout in its own comment above `pub fn keys()`. It
    // reads "1 left, 2 right, 4 up, 8 down, 16 W, 32 Shift, 64 Q, 128 Space,
    // 4096 Ctrl, 8192 the + key" -- note it says `Shift`, where the pre-0.9.1
    // comment said `sprint`. This regex once only accepted `sprint`, so the parse
    // silently yielded nothing for that row and `bits.sprint` came back undefined.
    // A regex that quietly stops matching is a test that quietly stops testing.
    const m = /Bits: (.+)/.exec(src);
    expect(m, 'engine no longer documents the bit layout').toBeTruthy();
    const documented = [
      ...(m?.[1] ?? '').matchAll(
        /(\d+)\s+(left|right|up|down|W|sprint|Shift|Q|Space|Ctrl)/g
      ),
    ];
    expect(documented.length, 'the engine bit-layout comment no longer parses').toBeGreaterThan(8);

    // The engine's spelling -> ours. W is the physical key behind `jump`.
    const FIELD_OF: Record<string, string> = { w: 'jump', shift: 'shift', sprint: 'sprint' };
    const bits: Record<string, number> = {};
    for (const d of documented) {
      const raw = d[2].toLowerCase();
      bits[FIELD_OF[raw] ?? raw] = Number(d[1]);
    }
    expect(bits.left).toBe(1);
    expect(bits.right).toBe(2);
    expect(bits.up).toBe(4);
    expect(bits.down).toBe(8);
    expect(bits.jump).toBe(16);
    expect(bits.shift).toBe(32);
    expect(bits.q).toBe(64);
    expect(bits.space).toBe(128);
    expect(bits.ctrl).toBe(4096);

    // Every bit the engine spells out must equal the bit WE publish, or the table
    // is lying about the engine in the one direction that silently desyncs a pack.
    for (const [field, bit] of Object.entries(bits)) {
      const ours = WORM_KEYS.find((k) => k.field === field);
      expect(ours, `engine documents "${field}" but we publish no such field`).toBeTruthy();
      expect(ours!.bit, `${field}: we publish bit ${ours!.bit}, engine says ${bit}`).toBe(bit);
    }
  });

  it('the six high bits come from the engine constants, not from our memory', () => {
    if (!haveEngine) return;
    const src = readFileSync(SYNC_RS, 'utf8');
    expect(existsSync(SYNC_RS), 'crates/game/src/sync_input.rs moved').toBe(true);
    // `pub const CTRL: u32 = 1 << 12;`
    const constant = (name: string): number => {
      const m = new RegExp(`pub const ${name}: u32 = 1 << (\\d+);`).exec(src);
      expect(m, `sync_input.rs no longer defines ${name}`).toBeTruthy();
      return 2 ** Number(m![1]);
    };
    const expected: Record<string, number> = {
      ctrl: constant('CTRL'),
      plus_key: constant('PLUS_KEY'),
      minus_key: constant('MINUS_KEY'),
      alt: constant('ALT'),
      pause_key: constant('PAUSE_KEY'),
    };
    for (const [field, bit] of Object.entries(expected)) {
      const ours = WORM_KEYS.find((k) => k.field === field);
      expect(ours, `we publish no "${field}" field`).toBeTruthy();
      expect(ours!.bit, `${field}: we publish ${ours!.bit}, engine constant says ${bit}`).toBe(bit);
    }

    // DIGIT_SHIFT is where `digit` sits. It is a 4-bit field, which is why
    // `digit` has no bit of its own and must stay `numeric`.
    const shift = /pub const DIGIT_SHIFT: u32 = (\d+);/.exec(src);
    expect(shift, 'sync_input.rs no longer defines DIGIT_SHIFT').toBeTruthy();
    expect(Number(shift![1]), 'digit moved out of bits 8..11').toBe(8);
  });

  it('sprint is declared an ALIAS of shift, not an independent bit', () => {
    // API 4 sets `shift` and `sprint` from the same bit 32 (spawn.rs: "The old
    // name of `shift`... it goes with the next api_version"). Publishing both as
    // independent rows with the same bit would break any "bits are unique"
    // invariant; dropping either would hide a field the engine really returns.
    // So the alias is data, and this asserts the alias is coherent.
    const aliases = WORM_KEYS.filter((k) => k.aliasOf);
    expect(aliases.map((k) => k.field)).toEqual(['sprint']);

    const target = WORM_KEYS.find((k) => k.field === 'shift');
    const alias = aliases[0];
    expect(target, 'the `shift` row this alias points at is missing').toBeTruthy();
    expect(alias.bit).toBe(target!.bit);
    expect(alias.keys).toEqual(target!.keys);
    expect(WORM_KEY_BINDINGS.map((k) => k.field)).toContain('shift');
    expect(WORM_KEY_BINDINGS.map((k) => k.field)).not.toContain('sprint');
  });

  it('exactly one field is numeric, and it is digit', () => {
    // `digit` is a value in bits 8..11. Treating it as a boolean is the bug its
    // note warns about, and the snippet we insert has to agree with that.
    const numeric = WORM_KEYS.filter((k) => k.numeric).map((k) => k.field);
    expect(numeric).toEqual(['digit']);
    expect(WORM_KEYS.find((k) => k.field === 'digit')?.bit).toBeNull();
  });

  it('every bit-owning field has a unique non-zero bit', () => {
    // Aliases are excluded because they deliberately SHARE a bit -- that is what
    // an alias is. `WORM_KEY_BINDINGS` is the alias-free view, and the alias
    // coherence is asserted separately above so nothing is lost by excluding it.
    const bits = WORM_KEY_BINDINGS.map((k) => k.bit);
    expect(new Set(bits).size).toBe(bits.length);
    expect(bits.every((b) => b !== null && b > 0)).toBe(true);
    // 15 fields total, minus `digit` (a value in bits 8..11, not a flag) and minus
    // `sprint` (an alias). The count is asserted so a row cannot be added without
    // someone deciding whether it owns a bit.
    expect(WORM_KEYS.length).toBe(15);
    expect(WORM_KEY_BINDINGS.length).toBe(13);
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
