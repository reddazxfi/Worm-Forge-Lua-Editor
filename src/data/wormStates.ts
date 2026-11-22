// WA 3.8.1 worm states -- taken from the ENGINE, not inferred.
//
// Three different tables exist in the engine, and confusing them is how fiction
// gets in:
//
//   WORM_STATES          `label()` in crates/game/src/worm_state.rs -- the full
//                        32-entry DEBUG table. A name the engine marks with `?`
//                        rests on one observation; its own doc says "check it
//                        before building on it". Packs cannot name most of these.
//   READABLE_WORM_STATES `worm_state_name()` in crates/lua-host/src/actor.rs --
//                        what `worm.state` can actually return. Thirty-one names.
//   SETTABLE_WORM_STATES `settable_worm_state()`, same file -- what
//                        `worm:set_state("...")` accepts. FIVE names.
//
// ONLY THE LAST TABLE MAY BE ENFORCED, and it is far smaller than it looks. The
// engine's own error message enumerates it:
//
//   worm:set_state: "x" is not a state a script may enter;
//   valid: falling, standing, bungee, tumbling, teleporting
//
// A name that is a REAL state but not settable is still rejected there -- the
// engine pins `settable_worm_state("jetpacking") == None` in its own tests. Do
// NOT widen this list from WORM_STATES.
//
// 1.0 renamed 0x7E from `sliding` to `falling`: the state is WA's falling-with-
// control one, and packs now test names. `sinking` was the old name of
// tumbling (0x7F), removed in 1.0.

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
  { name: 'kamikaze', id: 0x6d, confirmed: true },
  { name: 'drilling', id: 0x6e, confirmed: true },
  { name: 'teleporting', id: 0x6f, confirmed: true },
  { name: 'rope_firing', id: 0x70, confirmed: true },
  { name: 'torching', id: 0x71, confirmed: true },
  { name: 'after_rope', id: 0x73, confirmed: true },
  { name: 'getting_up', id: 0x76, confirmed: true },
  { name: 'jump_prepare', id: 0x77, confirmed: true },
  { name: 'jetpacking', id: 0x78, confirmed: true },
  { name: 'jumping', id: 0x79, confirmed: true },
  { name: 'jump_falling', id: 0x7a, confirmed: true },
  { name: 'roping', id: 0x7b, confirmed: true },
  { name: 'bungee', id: 0x7c, confirmed: true },
  { name: 'parachuting', id: 0x7d, confirmed: true },
  { name: 'falling', id: 0x7e, confirmed: true },
  { name: 'tumbling', id: 0x7f, confirmed: true },
  { name: 'hit', id: 0x80, confirmed: true },
  { name: 'blasted', id: 0x81, confirmed: true },
  { name: 'dying', id: 0x82, confirmed: true },
  { name: 'drowning', id: 0x85, confirmed: true },
  { name: 'frozen', id: 0x86, confirmed: true },
  { name: 'dead', id: 0x87, confirmed: true },
  { name: 'ledge', id: 0x88, confirmed: false },
  { name: 'skimming', id: 0x89, confirmed: true },
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
  'falling',
  'roping',
  'bungee',
  'tumbling',
  'frozen',
  'rope_firing',
  'torching',
  'after_rope',
  'getting_up',
  'skimming',
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
 * What `worm:set_state("...")` accepts. `sliding` became `falling` in 1.0, and
 * `sinking` was removed.
 */
export const SETTABLE_WORM_STATES: WormState[] = [
  { name: 'standing', id: 0x65, confirmed: true },
  { name: 'falling', id: 0x7e, confirmed: true },
  { name: 'bungee', id: 0x7c, confirmed: true },
  { name: 'tumbling', id: 0x7f, confirmed: true },
  { name: 'teleporting', id: 0x6f, confirmed: true },
];
