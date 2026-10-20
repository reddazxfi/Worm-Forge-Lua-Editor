// The keys `wa.world.keys()` actually returns.
//
// WHY THIS FILE EXISTS, AND WHY IT IS NOT A "KEYCODE" TABLE
// The old KeycodeModal listed Windows Virtual-Key codes (VK_LEFT 0x25, etc.) and
// implied they were something a pack could use. They are not. WormForge has not
// mapped the keyboard to virtuals for Lua at all -- a pack never sees a keycode.
// What a pack gets is a plain table of booleans, and this file is exactly that.
//
// SOURCE OF TRUTH, read not guessed. Every row below is transcribed from the
// engine in this repo:
//   * `crates/lua-host/src/spawn.rs` L805-833 -- the Lua table `wa.world.keys()`
//     builds. That is the definitive list of what exists.
//   * `crates/engine/src/world.rs` `poll_keys()` L892-934 -- which PHYSICAL keys
//     set each bit. The only place the OS is polled.
//   * `crates/engine/src/world.rs` L812 -- the bit layout, in the engine's comment.
//   * `crates/game/src/sync_input.rs` L20-26 -- the high-bit constants (CTRL,
//     PLUS_KEY, MINUS_KEY, ALT, PAUSE_KEY) and DIGIT_SHIFT.
//
// If the engine changes, this file is wrong. That is the trade for having it in one
// place with the source line next to every claim, rather than scattered as UI copy.
// `wormKeys.test.ts` asserts every row against those four files, so it cannot rot
// quietly -- it did rot once, when API 4 added six fields and this table kept
// publishing nine.

export interface WormKeyBinding {
  /** The field name on the table `wa.world.keys()` returns. */
  field: string;
  /** What holding it does in game. User-facing, not a code. */
  action: string;
  /** Bit in the packed keys word. null for `digit`, which is not a flag. */
  bit: number | null;
  /**
   * Physical keys that set it, as the user presses them. These are what the old
   * table called "keycodes" -- they are only useful as a reference for which finger
   * to use, which is why the UI shows them as labels, not numbers.
   */
  keys: string[];
  /** True when the value is a number rather than a boolean. */
  numeric?: boolean;
  /**
   * Set when this row is a second name for another row's bit rather than a bit of
   * its own.
   *
   * API 4 renamed `shift` to `shift` and kept `sprint` reading the SAME bit 32, so
   * both fields are set from `m & 32` (spawn.rs L814-817: "The old name of
   * `shift`, kept so packs written for it still work; it goes with the next
   * api_version."). Two rows, one bit -- which is why this is data and not two
   * independent entries pretending to be independent.
   */
  aliasOf?: string;
  /** Anything a pack author gets wrong about this one. */
  note?: string;
}

/** The whole surface. Bit order, which is also roughly "how you play". */
export const WORM_KEYS: WormKeyBinding[] = [
  { field: 'left', action: 'Turn or move left', bit: 1, keys: ['Left Arrow', 'A'] },
  { field: 'right', action: 'Turn or move right', bit: 2, keys: ['Right Arrow', 'D'] },
  {
    field: 'up',
    action: 'Aim up',
    bit: 4,
    // Arrow only. There is no W/S alias for up/down -- W is jump and S is down, an
    // asymmetry worth stating because it is easy to assume otherwise.
    keys: ['Up Arrow'],
  },
  { field: 'down', action: 'Aim down', bit: 8, keys: ['Down Arrow', 'S'] },
  {
    field: 'jump',
    action: 'Jump / climb (POOZ)',
    bit: 16,
    keys: ['W'],
    note: 'W only -- no alias for this one.',
  },
  {
    field: 'shift',
    action: 'Sprint',
    bit: 32,
    keys: ['Shift'],
    note: 'The current name for bit 32. The old `sprint` still reads the same bit.',
  },
  {
    field: 'sprint',
    action: 'Sprint (legacy name)',
    bit: 32,
    keys: ['Shift'],
    aliasOf: 'shift',
    note:
      'Kept so packs written against the pre-0.9.1 name still work. The engine ' +
      'sets it from the same bit as `shift` and the source says it "goes with the ' +
      'next api_version" -- so write `shift` in new code.',
  },
  { field: 'q', action: 'Custom weapon / hotkey', bit: 64, keys: ['Q'] },
  {
    field: 'space',
    action: 'Charge and fire',
    bit: 128,
    keys: ['Space'],
    note: 'Held = charging the power bar; released = the shot fires.',
  },
  {
    field: 'ctrl',
    action: 'Ctrl (no behaviour bound yet)',
    bit: 4096,
    keys: ['Ctrl'],
    note:
      'The engine polls and forwards it, but nothing in Lua reads it, so it is ' +
      'reported for completeness rather than because a pack can act on it.',
  },
  {
    field: 'plus_key',
    action: 'Plus / add key',
    bit: 8192,
    keys: ['+', 'Numpad +'],
    note: 'Both the main-row plus and the keypad plus. No behaviour bound to it yet.',
  },
  {
    field: 'minus_key',
    action: 'Minus key',
    bit: 16384,
    keys: ['-', 'Numpad -'],
    note: 'Both the main-row minus and the keypad minus. No behaviour bound to it yet.',
  },
  {
    field: 'alt',
    action: 'Alt (no behaviour bound yet)',
    bit: 32768,
    keys: ['Alt'],
    note: 'Polled and forwarded like Ctrl; nothing in Lua reads it yet.',
  },
  {
    field: 'pause_key',
    action: 'Pause key',
    bit: 65536,
    keys: ['Pause'],
    note: 'The dedicated Pause key. Distinct from Escape, which is NOT polled.',
  },
  {
    field: 'digit',
    action: 'The number key being held',
    bit: null,
    numeric: true,
    keys: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    // Three things here are all easy to get wrong, and the old table got two of
    // them wrong by omission -- it listed F1-F10 instead, which do not exist.
    note:
      'A number 0-9, or nil when no digit is held. Top row or numpad; if several ' +
      'are held the lowest wins. This is a VALUE, not a boolean -- `if k.digit then` ' +
      'passes when it is 0, so test `k.digit ~= nil` or compare against a number.',
  },
];

/** Every field that owns a bit of its own -- i.e. excluding `numeric` and aliases. */
export const WORM_KEY_BINDINGS = WORM_KEYS.filter((k) => k.bit !== null && !k.aliasOf);

/**
 * Keys the old reference table listed that WormForge does NOT expose to Lua.
 *
 * Kept as data rather than a comment, so the UI can say so out loud. A reference
 * that silently omits what is unavailable is how a pack author spends an evening
 * writing `if k.f1 then` against a field that was never there.
 *
 * Verified against `poll_keys()`: it polls exactly the physical keys listed in
 * `WORM_KEYS` above, plus the digits. Nothing else is read from the keyboard --
 * notably NOT Escape, even though Pause now is.
 */
export const KEYS_NOT_AVAILABLE: { keys: string; actually: string }[] = [
  { keys: 'F1 - F10', actually: 'Weapon slots are not exposed through keys(). Use wa.msg or equip_weapon instead.' },
  { keys: 'Enter / Backspace', actually: 'Jump messaging is internal to WA. No key field reports these.' },
  { keys: 'Tab', actually: 'Worm selection is handled by WA itself.' },
  { keys: 'Escape', actually: 'Not polled. Only the dedicated Pause key is, and it arrives as `pause_key`.' },
  { keys: 'Mouse buttons', actually: 'Not keys. See wa.world.pointer() for x, y and down.' },
];

/**
 * Maps a browser key event to the field it would set, for the live tester.
 *
 * Keyed on the PHYSICAL keys in `WORM_KEYS`, so it cannot claim a binding the
 * engine does not have. A key that is not listed returns null and the tester says
 * so, rather than inventing a code for it.
 */
const EVENT_KEY_TO_FIELD: Record<string, string> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  KeyW: 'jump',
  ShiftLeft: 'shift',
  ShiftRight: 'shift',
  KeyQ: 'q',
  Space: 'space',
  // API 4 added these six fields. Shift maps to the CURRENT name (`shift`);
  // `sprint` is the pre-0.9.1 spelling kept in WORM_KEYS for the packs that still
  // read it, so the live tester highlights the row a new pack should write.
  ControlLeft: 'ctrl',
  ControlRight: 'ctrl',
  NumpadAdd: 'plus_key',
  Equal: 'plus_key',
  NumpadSubtract: 'minus_key',
  Minus: 'minus_key',
  AltLeft: 'alt',
  AltRight: 'alt',
  Pause: 'pause_key',
  Digit0: 'digit',
  Digit1: 'digit',
  Digit2: 'digit',
  Digit3: 'digit',
  Digit4: 'digit',
  Digit5: 'digit',
  Digit6: 'digit',
  Digit7: 'digit',
  Digit8: 'digit',
  Digit9: 'digit',
  Numpad0: 'digit',
  Numpad1: 'digit',
  Numpad2: 'digit',
  Numpad3: 'digit',
  Numpad4: 'digit',
  Numpad5: 'digit',
  Numpad6: 'digit',
  Numpad7: 'digit',
  Numpad8: 'digit',
  Numpad9: 'digit',
};

/** `KeyQ` -> `q`, `Digit3` -> `digit`, or null if the key is not one of ours. */
export function fieldForEventCode(code: string): string | null {
  return EVENT_KEY_TO_FIELD[code] ?? null;
}

/** What the pressed digit would read as, for the live preview. */
export function digitForEventCode(code: string): number | null {
  const m = /^(?:Digit|Numpad)(\d)$/.exec(code);
  return m ? Number(m[1]) : null;
}

/** A short label for a physical key, for the "press it" chips in the UI. */
export function prettyKeyName(code: string): string {
  return code
    .replace(/^Key/, '')
    .replace(/^Digit/, '')
    .replace(/^NumpadAdd$/, 'Num +')
    .replace(/^NumpadSubtract$/, 'Num -')
    .replace(/^Numpad/, 'Num ')
    .replace(/^Arrow/, '')
    .replace('ShiftLeft', 'Shift')
    .replace('ShiftRight', 'Shift')
    .replace('ControlLeft', 'Ctrl')
    .replace('ControlRight', 'Ctrl')
    .replace('AltLeft', 'Alt')
    .replace('AltRight', 'Alt');
}
