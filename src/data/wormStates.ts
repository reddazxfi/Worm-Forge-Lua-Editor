// WA 3.8.1 worm states -- taken from the ENGINE, not inferred.
//
// Three different tables exist in the engine, and confusing them is how fiction
// gets in:
//
//   WORM_STATES          `label()` in crates/game/src/worm_state.rs -- the full
//                        27-entry DEBUG table. A name the engine marks with `?`
//                        rests on one observation; its own doc says "check it
//                        before building on it". Packs cannot name most of these.
//   READABLE_WORM_STATES `worm_state_name()` in crates/lua-host/src/actor.rs --
//                        what `worm.state` can actually return. Twenty-six names.
//   SETTABLE_WORM_STATES `settable_worm_state()`, same file -- what
//                        `worm:set_state("...")` accepts. FIVE states, SIX names,
//                        because "sinking" is a legacy alias of tumbling (0x7F).
//
// ONLY THE LAST TABLE MAY BE ENFORCED, and it is far smaller than it looks. The
// engine's own error message enumerates it:
//
//   worm:set_state: "x" is not a state a script may enter;
//   valid: sliding, standing, bungee, tumbling, teleporting
//
// A name that is a REAL state but not settable is still rejected there -- the
// engine pins `settable_worm_state("jetpacking") == None` in its own tests. Do
// NOT widen this list from WORM_STATES.
//
// NAME DISCREPANCY, preserved on purpose: 0x7E is "falling" in the game crate's
// debug table and "sliding" in the Lua host. Packs only ever see the Lua name, so
// `sliding` is what belongs in a set_state message.

export interface WormState {
  /** The name as the engine spells it, without a trailing `?`. */
  name: string;
  /** Raw WA 3.8.1 state id. */
  id: number;
  /**
   * False where the engine's own label carries a `?`: one observation or one
   * source only. Never grounds a finding -- a state we are unsure exists must
   * not turn into a warning on working code.
   */
  confirmed: boolean;
  /** True for the legacy alias `sinking`, which resolves to tumbling. */
  alias?: boolean;
}

/** Every state the engine can label, debug table included. */
export const WORM_STATES: WormState[] = [
  { name: 'standing', id: 0x65, confirmed: true },
  { name: 'walking', id: 0x66, confirmed: true },
  { name: 'ready', id: 0x67, confirmed: true },
  { name: 'charging', id: 0x68, confirmed: true },
  { name: 'prefiring', id: 0x69, confirmed: true },
  { name: 'firing', id: 0x6a, confirmed: true },
  { name: 'fired', id: 0x6b, confirmed: true },
  { name: 'punching', id: 0x6c, confirmed: true },
  { name: 'drilling', id: 0x6e, confirmed: true },
  { name: 'teleporting', id: 0x6f, confirmed: true },
  { name: 'rope_firing', id: 0x70, confirmed: false },
  { name: 'torching', id: 0x71, confirmed: false },
  { name: 'rope_rolling', id: 0x73, confirmed: false },
  { name: 'getting_up', id: 0x76, confirmed: true },
  { name: 'jump_prepare', id: 0x77, confirmed: true },
  { name: 'jetpacking', id: 0x78, confirmed: true },
  { name: 'jumping', id: 0x79, confirmed: true },
  { name: 'jump_falling', id: 0x7a, confirmed: true },
  { name: 'roping', id: 0x7b, confirmed: false },
  { name: 'bungee', id: 0x7c, confirmed: true },
  { name: 'parachuting', id: 0x7d, confirmed: true },
  { name: 'falling', id: 0x7e, confirmed: true },
  { name: 'tumbling', id: 0x7f, confirmed: true },
  { name: 'hit', id: 0x80, confirmed: true },
  { name: 'blasted', id: 0x81, confirmed: true },
  { name: 'dying', id: 0x82, confirmed: false },
  { name: 'drowning', id: 0x85, confirmed: false },
  { name: 'dead', id: 0x87, confirmed: false },
];

/**
 * What `worm.state` can return. Anything else reads as nil -- the lua-host does
 * not guess a name, and neither may the editor's documentation.
 */
export const READABLE_WORM_STATES: string[] = [
  'standing',
  'walking',
  'ready',
  'charging',
  'firing',
  'fired',
  'prefiring',
  'punching',
  'drilling',
  'kamikaze',
  'teleporting',
  'jetpacking',
  'parachuting',
  'sliding',
  'roping',
  'bungee',
  'tumbling',
  'frozen',
  'jump_prepare',
  'jumping',
  'jump_falling',
  'blasted',
  'hit',
  'dying',
  'drowning',
  'dead',
];

/**
 * What `worm:set_state("...")` accepts. `sinking` stays settable as the legacy
 * alias of tumbling until packs move off it.
 */
export const SETTABLE_WORM_STATES: WormState[] = [
  { name: 'standing', id: 0x65, confirmed: true },
  { name: 'sliding', id: 0x7e, confirmed: true },
  { name: 'bungee', id: 0x7c, confirmed: true },
  { name: 'tumbling', id: 0x7f, confirmed: true },
  { name: 'sinking', id: 0x7f, confirmed: true, alias: true },
  { name: 'teleporting', id: 0x6f, confirmed: true },
];