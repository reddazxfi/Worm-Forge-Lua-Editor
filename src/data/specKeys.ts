// Valid keys in a `wa.weapons.replace({ ... })` spec table, plus a
// "did you mean" suggester.
//
// WHY A SEPARATE LIST
// The keys are currently only documented as PROSE inside the
// `wa.weapons.replace` parameter description in wormforgeDefinitions.ts:522
// ("weapon, name, copy_from (or wep = ...), patch = {...}, sprite, ..."). That is
// unreadable to code, so there was no way to check a key against it. This module
// is the structured form of that sentence and is the single place to extend when
// the engine adds a key.
//
// Any key the engine accepts but that is missing here produces a FALSE POSITIVE,
// so this list errs toward INCLUSION. Unknown keys are reported as warnings, never
// errors -- see scanSpecKeyTypos in parser.ts.

/** Every spec key accepted by `wa.weapons.replace`. */
export const WEAPON_SPEC_KEYS: string[] = [
  // identity
  'weapon',
  'slot',
  'name',
  'copy_from',
  'wep',
  // presentation
  'sprite',
  'sprites',
  'worm_sprites',
  'panel_icon',
  'icon',
  'sprite_overrides',
  'cluster_sprite',
  'cluster_homing_sprite',
  'cluster_homing',
  // behaviour
  'is_weapon',
  'eat_fire',
  'fire_repeat',
  'params',
  'sounds',
  'plane',
  'mine',
  'patch',
  // hooks -- these are assigned FUNCTIONS, not table fields, but they are written
  // as keys inside the same spec table so they must be recognised as names.
  'on_select',
  'on_click',
  'on_fire',
  'on_explode',
  'on_proximity',
  'on_place',
  'on_land',
  'on_hit',
  'on_destroy',
  'persist',
  'retreat_time',
  'hud',
  // Lua API 4 (WormForge 0.9.1) claim fields. Verified against the engine:
  // `table_to_claim` in crates/lua-host/src/api.rs reads id/hold_as/
  // click_finish/stock_fire_choice/hold/panel_icons directly off the spec, and
  // `record_table::replace_writes` reads the record groups `fires`, `handling`,
  // `missile`, `clusters`, `mine`, `gun`, `strike`, `jet_pack`, `armageddon`
  // plus `raw`.
  //   - `mine` was already here; the rest were missing and produced
  //     spec-key-typo FALSE POSITIVES on valid API 4 code.
  //   - `actor` and `airborne` are GONE in 1.0: a claim's steps are functions
  //     that spawn with wa.actors.spawn, and a weapon's airborne setting is
  //     weapon data (`weapon.defaults = { airborne = true }`).
  //   - `patch` stays listed although the engine now rejects it loudly at
  //     install ("patch is gone (Lua API 4)"): it is a hard error with its own
  //     guidance, not a silently ignored key, so the generic "engine ignores
  //     unknown keys" message would be the wrong thing to show.
  //   - `worm_sprites_animate` is read from the NESTED `params` table
  //     (api.rs:2311), never directly off the spec, and spec-key-typo only
  //     checks direct keys -- so it stays out. `truecolor`, `gpu_worm_sprites`
  //     and `mole_dig_rotation` are gone in 1.0.
  // Overlay weapon (a stock slot's projectile replaced by a record of its own,
  // wa.weapons.launch builds the same shape). `projectile` is validated one
  // level deeper against PROJECTILE_SPEC_KEYS below.
  'projectile',
  // `click = "homing"`: the click marks the target and Space fires, whatever
  // the record. parse_click_kind (api.rs) is the only accepted value.
  'click',
  // The two flying sheep sheets, `{ first, second }` (api.rs).
  'sheep_sprites',
  'id',
  // `hold_as = "stock.<name>"`: the stock weapon whose held pose the worm
  // takes, for a record whose missile sprite hides its round.
  'hold_as',
  // Direct spec field read by `table_to_claim` (api.rs:2346). It is also
  // mirrored as `handling.available_in_caves` in the weapon record, but the
  // direct key is the one a `wa.weapons.replace{...}` table uses.
  'available_in_caves',
  'click_finish',
  'stock_fire_choice',
  'panel_icons',
  'hold',
  'ends_invisibility',
  'worm_sprites_toggle',
  'worm_sprites_team_tint',
  'fires',
  'handling',
  'missile',
  'clusters',
  'gun',
  'strike',
  'jet_pack',
  // The rest of record_table::GROUPS (record_table.rs:11). All 17 are writable
  // through wa.weapons.replace; the older list stopped at jet_pack and so
  // reported every utility/parachute/sheep/... group as a spec-key typo.
  'utility',
  'parachute',
  'sheep',
  'fire_punch',
  'drill',
  'arrow',
  'baseball_bat',
  'flame_thrower',
  'armageddon',
  'raw',
];

/**
 * The only keys `projectile = { ... }` accepts (api.rs, the `projectile`
 * branch of `table_to_claim`). Unlike an unknown top-level key, which WA
 * silently ignores, an unknown key here makes the install raise
 * "projectile: unsupported field".
 */
export const PROJECTILE_SPEC_KEYS: string[] = [
  'copy_from',
  'fires',
  'missile',
  'clusters',
  'sprite',
  'cluster_sprite',
  'params',
  'sprites',
];

/** Keyed for O(1) lookup. */
export const PROJECTILE_SPEC_KEY_SET: Set<string> = new Set(
  PROJECTILE_SPEC_KEYS.map((k) => k.toLowerCase())
);

/** Keyed for O(1) lookup; the array above stays for display/ordering. */
export const WEAPON_SPEC_KEY_SET: Set<string> = new Set(WEAPON_SPEC_KEYS.map((k) => k.toLowerCase()));

/**
 * Levenshtein distance, bailing out early once it exceeds `max`.
 *
 * Small and local on purpose: this runs per key per spec table, so a dependency
 * is not worth it, and the strings are 5-15 characters so the full DP is cheap.
 * The early exit keeps a completely unrelated word from costing O(n*m) for nothing.
 */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let prev = new Array<number>(b.length + 1);
  let cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    // Every cell in this row is already past `max`, so no future row can win.
    if (rowMin > max) return max + 1;
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

/**
 * Closest known key, or null when nothing is close enough.
 *
 * The threshold scales with the word so a short key needs an exact-ish match and
 * a long one tolerates more noise: `icons` vs `icon` is one edit and certain, but
 * one edit on a 15-character key is weak evidence.
 */
export function suggestSpecKey(typo: string, keys: string[] = WEAPON_SPEC_KEYS): string | null {
  const t = typo.toLowerCase();
  let best: string | null = null;
  let bestDist = Infinity;

  for (const key of keys) {
    const d = editDistance(t, key.toLowerCase(), 3);
    if (d < bestDist) {
      bestDist = d;
      best = key;
    }
  }

  // Long words tolerate 2 edits, short ones only 1. Above that it is a guess, and
  // a wrong suggestion is worse than none -- it sends the reader chasing a key
  // that does not exist.
  const threshold = t.length <= 5 ? 1 : t.length <= 9 ? 2 : 3;
  return bestDist <= threshold ? best : null;
}

/**
 * Closest `wa.*` function path, or null.
 *
 * Same distance rule as suggestSpecKey, matched on the FINAL dotted segment so
 * `wa.weapons.repalce` is compared against `repalce`-style leaf names rather than
 * against whole paths of different length.
 */
export function suggestWaFunction(typo: string, knownPaths: string[]): string | null {
  const t = typo.toLowerCase();
  let best: string | null = null;
  let bestDist = Infinity;

  for (const path of knownPaths) {
    const tail = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
    const d = editDistance(t, tail, 3);
    if (d < bestDist) {
      bestDist = d;
      best = path;
    }
  }

  const threshold = t.length <= 6 ? 2 : 3;
  return bestDist <= threshold ? best : null;
}