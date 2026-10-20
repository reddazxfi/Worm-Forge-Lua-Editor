// The structured tables an API call accepts, as documentation AND as autocomplete
// data: what you may write inside `wa.weapons.launch{ ... }`, `missile = { ... }`,
// `wa.actors.spawn{ ... }`, and the weapon-spec groups of `wa.weapons.replace`.
//
// WHY THIS FILE EXISTS
// The Enumerations list answers "what values does this name take". It cannot
// answer "what keys does this TABLE take", which is the question `wa.weapons.launch`
// and `wa.actors.spawn` actually raise: the arguments are nested records, not
// parameters. This is that answer, kept beside the enums so one search finds both.
//
// WHERE THE DATA COMES FROM
//   * Weapon record fields (`missile.*`, `clusters.*`, `fires.*`, `handling.*`,
//     `mine.*`, `gun.*`, `strike.*`, `jet_pack.*`): generated into
//     `recordFields.ts` from crates/weapons/src/record.rs, via the JSON that crate
//     publishes for its own web editor. Nothing here is transcribed by hand.
//   * `wa.weapons.launch` top level: `launch_args()` in
//     crates/lua-host/src/api.rs -- including the API 4 keys it now REJECTS and
//     the `missile.*` path each one moved to.
//   * `wa.actors.spawn`: `parse_spawn()` / `runtime_spawn()` in
//     crates/lua-host/src/spawn.rs.
//   * `a.light` / `wa.fog.light` / `wa.fog.set`: the 0.9.11 release verb list
//     (`spec/verbs 9.11 api 4.0.txt`). The vendored engine snapshot predates fog,
//     so those three are marked as list-sourced rather than source-verified.
//
// WHAT THIS FILE IS NOT
// It is not a validator. The checker owns the rules it can prove; a table key
// missing here must never become an error in the editor. Autocomplete only ever
// OFFERS these names.
//
// Descriptions are short and deliberately conservative. Where the engine's own
// table gives no prose (most leaves), the note says what the field is for without
// inventing a range or a unit the source does not state.

import { RECORD_ACTIONS, RECORD_FIELDS, type RecordFieldRow } from './recordFields';

export type FieldKind =
  | 'int'
  | 'bool'
  | 'sprite'
  | 'string'
  | 'number'
  | 'enum'
  | 'table'
  | 'handle'
  | 'function'
  | 'any';

export interface TableField {
  /** The key as written in Lua, e.g. `explosion` or `trace_pct`. */
  name: string;
  kind: FieldKind;
  /** Display type when `kind` alone is not the whole story. */
  type?: string;
  description?: string;
  /** Accepted names, for enum-ish fields (record enums and named strings). */
  values?: [string, number | string][];
  children?: TableField[];
  /** Weapon-record families this field exists in. */
  families?: string[];
  /** Missile action that must be set for the field to apply (`bounce`, `homing`). */
  action?: string;
  /** Engine record offset, shown as provenance on record leaves. */
  offset?: number;
  /** The engine rejects the call without it. */
  required?: boolean;
  /** Removed in API 4: what to write instead. */
  gone?: string;
}

export interface TableDoc {
  /** Marker for the doc pane and the tree; the shape is not a class or an enum. */
  tableDoc: true;
  /** The call or record this documents; also what autocomplete matches. */
  id: string;
  title: string;
  summary: string;
  /** Every spelling that takes this shape. */
  usedBy: string[];
  /** Where the shape was read from, with the file. */
  source: string;
  fields: TableField[];
  /** A ready-to-insert snippet, when one can be written honestly. */
  example?: string;
  /** A caveat the card shows under the summary. */
  note?: string;
}

// ---------------------------------------------------------------------------
// Weapon records
// ---------------------------------------------------------------------------

/** Short notes for record leaves, keyed by the path BELOW its group. */
const RECORD_NOTES: Record<string, string> = {
  aims: 'The weapon takes aim before firing.',
  creates_projectile: 'Firing creates a projectile object rather than a hitscan.',
  type: 'WA fire type (+0x30). With `method` it selects the record family.',
  subtype: 'WA fire subtype (+0x34); picks the worm aim sheet among other things.',
  method: 'WA fire method (+0x38): 2 hitscan, 3 projectile, and so on.',
  shots: 'Shots per turn.',
  ends_turn: 'The shot ends the turn.',
  retreat: 'Retreat time after firing, in ms.',
  plane: "Strike plane's stock sprite (name or id).",
  count: 'How many munitions the strike drops.',
  spacing: 'Horizontal spacing between munitions, in px.',
  munition: 'What a strike drops.',
  proximity: 'Detection radius, in px.',
  arm: 'Arm delay, in ms.',
  detects: 'Detection flags.',
  fuse: 'Fuse time, in ms.',
  'explosion.bias': 'Downward pixel offset of the blast.',
  'explosion.push_pct': 'Push force, as a percentage.',
  'explosion.power': 'Blast power (the damage it deals).',
  'explosion.variation': 'Random variation applied to the blast.',
  bullets: 'Bullets fired per shot.',
  damage: 'Damage per bullet.',
  collides: 'Body collision flags.',
  sprite: 'Flight sprite: a stock sprite name or id.',
  animation: 'Flight animation rate.',
  'trail.sprite': 'Smoke trail sprite. 0 leaves no trail.',
  'trail.power': 'Trail emission strength.',
  'trail.speed': 'Trail emission speed.',
  speed_pct: "Speed as a percentage of the slot's own.",
  wind_pct: 'How strongly wind pushes the body, in percent.',
  random_motion: 'Random sideways jitter while flying.',
  gravity_pct: 'Gravity applied to the body, in percent.',
  countdown: 'Countdown before the fuse starts, in ms.',
  flight_sound: 'Stock sound id played during flight.',
  'explosion_sound.enabled': 'Play a sound when it explodes.',
  'explosion_sound.sound': 'Stock sound id for the explosion.',
  'explosion_sound.before': 'Delay before the explosion sound, in ms.',
  explode_on_space: 'The fire key sets it off in mid-flight.',
  action: 'What the body does; decides which of the +0xA8 fields apply.',
  burst: 'What the body bursts into where it ends.',
  angle: 'Launch angle of the cluster fan.',
  spread: 'Spread of the cluster fan, in degrees.',
  'bit.sprite_count': 'How many distinct bit sprites the fan uses.',
  'bit.explosion.power': 'Blast power of each cluster bit.',
  'bit.explosion.bias': 'Downward pixel offset of each bit blast.',
  'bit.explosion.push_pct': 'Push force of each bit blast, in percent.',
  'bit.explosion.variation': 'Random variation of each bit blast.',
  'bit.trail.sprite': 'Smoke trail sprite for each bit.',
  'bit.trail.power': 'Trail strength for each bit.',
  'bit.trail.speed': 'Trail speed for each bit.',
  'bit.speed_pct': 'Bit speed, as a percentage.',
  'bit.wind_pct': 'How strongly wind pushes each bit, in percent.',
  'bit.gravity_pct': 'Gravity on each bit, in percent.',
  'bit.fuse': 'Fuse time of each bit, in ms.',
  'bit.countdown': 'Countdown before each bit fuse starts, in ms.',
  'bit.flight_sound': 'Stock sound id for each bit in flight.',
  'bit.explode_on_space': 'The fire key sets each bit off.',
  'bit.burst': 'What each bit bursts into.',
};

const GROUP_NOTES: Record<string, string> = {
  fires: 'Fire type and method: which family of record WA builds.',
  handling: 'Turn handling: shots, retreat and whether the shot ends the turn.',
  missile: 'The missile body: blast, art, trail, physics, action and burst.',
  clusters: 'The cluster fan a missile bursts into, including each bit.',
  mine: 'The mine record: proximity, arming and its blast.',
  gun: 'The hitscan gun record: bullets and damage.',
  strike: 'The strike record: plane, munitions and spacing.',
  jet_pack: 'The jet pack record: fuel.',
};

/** The group names `record_table::GROUPS` accepts (record_table.rs:11). */
export const RECORD_GROUPS = [
  'fires',
  'handling',
  'missile',
  'clusters',
  'mine',
  'gun',
  'strike',
  'jet_pack',
] as const;

function noteFor(group: string, relative: string): string | undefined {
  // `clusters.bit.*` reuses the missile body's notes on purpose: it IS the same
  // body, at a different offset.
  const normalized = relative
    .replace(/^bit\./, '')
    .replace(/^homing\.(sprite|animation|trail\.sprite|trail\.power|trail\.speed)$/, '$1');
  return RECORD_NOTES[relative] ?? RECORD_NOTES[normalized];
}

/** Nested fields for one record group, e.g. everything under `missile.`. */
function recordTree(prefix: string): TableField[] {
  const root: TableField[] = [];
  const byPath = new Map<string, TableField>();

  for (const row of RECORD_FIELDS as RecordFieldRow[]) {
    if (!row.path.startsWith(`${prefix}.`)) continue;
    const relative = row.path.slice(prefix.length + 1).split('.');
    let scope = root;
    let key = '';

    relative.forEach((part, i) => {
      key = key ? `${key}.${part}` : part;
      const isLeaf = i === relative.length - 1;
      let node = byPath.get(key);
      if (!node) {
        node = { name: part, kind: isLeaf ? row.kind : 'table' };
        if (!isLeaf) node.children = [];
        byPath.set(key, node);
        scope.push(node);
      }
      if (isLeaf) {
        node.kind = row.kind;
        node.values = row.values;
        node.families = row.families;
        node.action = row.action === null ? undefined : RECORD_ACTIONS[row.action];
        node.offset = row.off;
        node.description = noteFor(prefix, key);
      } else {
        scope = node.children!;
        // A parent inherits the union of its children's families, which is what
        // "does this group apply to my weapon" asks.
        node.families = Array.from(new Set([...(node.families ?? []), ...row.families]));
      }
    });
  }

  return root;
}

/** The top-level record groups, for `wa.weapons.replace` / `wa.weapons.data`. */
function recordGroups(): TableField[] {
  return RECORD_GROUPS.map((group) => {
    const children = recordTree(group);
    return {
      name: group,
      kind: 'table' as const,
      description: GROUP_NOTES[group],
      children,
      families: children.length > 0 ? children[0].families : undefined,
    };
  });
}

/** `Family::name()` in crates/weapons/src/record.rs, what `fires.as` reports. */
const RECORD_FAMILIES = ['none', 'missile', 'gun', 'arrow', 'spray', 'mine', 'strike', 'special'] as const;

/**
 * The groups `wa.weapons.data` returns. `to_table` adds one field that is not in
 * the field table and cannot be written: `fires.as`, the family the fire type
 * and method select. It belongs in the read-back doc only -- offering it in
 * `replace` would suggest a write the engine ignores.
 */
function dataGroups(): TableField[] {
  const groups = recordGroups();
  const fires = groups.find((g) => g.name === 'fires');
  if (fires?.children) {
    fires.children = [
      {
        name: 'as',
        kind: 'enum',
        type: 'family',
        values: RECORD_FAMILIES.map((f) => [f, f] as [string, string]),
        description:
          'Read-only: the family the fire type and method select. The engine writes it; a spec cannot set it.',
      },
      ...fires.children,
    ];
  }
  return groups;
}

// ---------------------------------------------------------------------------
// The docs
// ---------------------------------------------------------------------------

/**
 * Top-level claim keys of a weapon spec, from `table_to_claim()` (api.rs) and the
 * `specKeys.ts` list. These are the keys OUTSIDE the record groups.
 *
 * `patch` is deliberately absent: API 4 rejects it with "patch is gone", and
 * offering it in autocomplete would be advice the engine refuses.
 */
const WEAPON_CLAIM_FIELDS: TableField[] = [
  { name: 'id', kind: 'string', description: 'The weapon id claimed, e.g. "px.javelin".' },
  { name: 'name', kind: 'string', description: 'Display name shown on the panel.' },
  { name: 'copy_from', kind: 'string', type: 'weapon id', description: 'Start from another record: a placed weapon or stock.<name>. Mutually exclusive with `wep`.' },
  { name: 'wep', kind: 'string', type: 'pack path', description: 'A Project X .wep file to take the firing from. Its weapon name is the default. Mutually exclusive with `copy_from`.' },
  { name: 'actor', kind: 'string', description: 'An actor type this weapon spawns, instead of a straight missile.' },
  { name: 'panel_icon', kind: 'sprite', description: "The weapon's panel icon: a .png path or a stock icon name." },
  { name: 'icon', kind: 'sprite', description: 'Alias of `panel_icon`.' },
  { name: 'panel_icons', kind: 'table', type: 'stock icon names', description: 'Extra panel icons for the variant slots.' },
  { name: 'is_weapon', kind: 'bool', description: 'Default true. False makes it a non-weapon claim.' },
  { name: 'eat_fire', kind: 'bool', description: 'Default false. The claim consumes the fire key itself.' },
  { name: 'click_finish', kind: 'bool', description: 'Default true. A click finishes the shot immediately.' },
  { name: 'fire_repeat', kind: 'int', description: '1 to 20 shots at once. Default 1.' },
  {
    name: 'stock_fire_choice',
    kind: 'table',
    description: 'Hold Ctrl to fire an alternate weapon while this slot is selected.',
    children: [
      { name: 'held', kind: 'enum', type: '"ctrl"', values: [['ctrl', 'ctrl']], required: true, description: 'The only accepted value.' },
      { name: 'alternate', kind: 'string', type: 'weapon id', required: true, description: 'The weapon fired while the key is held.' },
    ],
  },
  { name: 'sprites', kind: 'table', type: 'pack paths', description: 'Pack sprite sheets the weapon installs, as pack-relative .png paths.' },
  { name: 'sounds', kind: 'table', type: 'pack paths', description: 'Pack WAV files the weapon installs, as pack-relative paths.' },
  { name: 'worm_sprites', kind: 'table', description: 'Worm pose art: `pow = "sprites/equip"`, or one sheet per team colour.' },
  {
    name: 'worm_sprites_toggle',
    kind: 'table',
    description: "Sheets drawn instead while the worm's + key toggle is on (Project X's Electromagnet).",
    children: [
      { name: 'key', kind: 'enum', type: '"plus_key"', values: [['plus_key', 'plus_key']], required: true, description: 'The only accepted value.' },
      { name: 'worm_sprites', kind: 'table', description: 'Pose = path, in the shape `worm_sprites` takes.' },
    ],
  },
  {
    name: 'worm_sprites_team_tint',
    kind: 'table',
    description: "One overlay per pose, multiplied by the drawing worm's team colour, instead of six tinted sheets.",
    children: [
      { name: 'worm_sprites', kind: 'table', description: 'One overlay path per pose. No team list: one overlay stands for all six.' },
      { name: 'colours', kind: 'table', description: 'The six team colours, red to cyan, the overlay is multiplied by.' },
    ],
  },
  { name: 'mole_dig_rotation', kind: 'table', description: 'Sprite replacements for the mole strike: moledive, moledig1, moledig2, moledig3, mole.' },
  { name: 'sprite_overrides', kind: 'table', description: 'Sprite sheet replacements keyed by stock sprite name.' },
  {
    name: 'hold',
    kind: 'table',
    description: 'Held-weapon art and its geometry.',
    children: [
      { name: 'sheet', kind: 'sprite', required: true, description: 'Hold sprite sheet.' },
      { name: 'hand', kind: 'sprite', description: 'Hand sprite.' },
      { name: 'flash', kind: 'table', type: '{ sheet, out, side, scale, frames }', description: 'Muzzle flash.' },
      { name: 'static', kind: 'table', type: '{ weap, hand }', description: 'Fixed hold angles instead of the animated ones.' },
      { name: 'frames', kind: 'int', description: 'Frames in the hold animation. Default 1.' },
      { name: 'anim_speed', kind: 'number', description: 'Hold animation speed. Default 1.' },
      { name: 'hand_scale', kind: 'number', description: 'Hand scale. Default 1.' },
      { name: 'hand_rotation', kind: 'number', description: 'Hand rotation. Default 1.' },
      { name: 'weap_scale', kind: 'number', description: 'Weapon scale. Default 1.' },
      { name: 'weap_rotation', kind: 'number', description: 'Weapon rotation. Default 1.' },
    ],
  },
  { name: 'on_click', kind: 'function', type: 'function | { spawn = ... }', description: 'Click handler. A table with `spawn` spawns an actor instead of running Lua.' },
  { name: 'params', kind: 'table', description: 'Legacy flat params. Most keys are gone in Lua API 4 (damage, bounce_pct, ...); name the record fields instead.' },
  { name: 'raw', kind: 'table', type: '[offset] = int', description: 'Raw dword writes by entry offset, e.g. `[0x50] = 7`. Checked against the field table.' },
];

const LAUNCH_GONE: TableField[] = [
  { name: 'damage', kind: 'int', gone: 'missile.explosion.power' },
  { name: 'sprite', kind: 'sprite', gone: 'missile.sprite' },
  { name: 'fuse', kind: 'int', gone: 'missile.fuse' },
  { name: 'sound', kind: 'int', gone: 'missile.flight_sound' },
  { name: 'explode_into', kind: 'string', gone: 'missile.burst' },
  { name: 'countdown', kind: 'int', gone: 'missile.countdown' },
  { name: 'explode_on_space', kind: 'bool', gone: 'missile.explode_on_space' },
  { name: 'terrain_keep_pct', kind: 'int', gone: 'missile.bounce.terrain_keep_pct' },
];

const LAUNCH: TableDoc = {
  tableDoc: true,
  id: 'wa.weapons.launch',
  title: 'Weapon launch',
  summary:
    "Fires a real WA missile from a weapon slot's record. The shot is native: lockstep, wind, trail and collision stay WA's.",
  usedBy: ['wa.weapons.launch'],
  source: 'crates/lua-host/src/api.rs `launch_args()` + record_table.rs `launch_writes()`',
  note:
    'Only `missile` and `clusters` reach the record. The old flat keys are rejected in Lua API 4, and the engine names the nested path to use instead.',
  example: `local id = wa.weapons.launch({
  weapon = "stock.bazooka",
  owner = worm,
  x = worm.x,
  y = worm.y - 16,
  vx = 0,
  vy = 0,
  missile = {
    explosion = { power = 50 },
    fuse = 5000,
    trail = { sprite = 0 },
  },
})`,
  fields: [
    { name: 'weapon', kind: 'string', type: 'weapon id', required: true, description: 'A placed weapon (px.javelin) or stock.<name>. The shot copies that record.' },
    { name: 'owner', kind: 'handle', type: 'worm handle', required: true, description: 'The worm the shot is fired for. Zero means the engine refuses the call.' },
    { name: 'x', kind: 'number', type: 'px', required: true, description: 'Spawn point X.' },
    { name: 'y', kind: 'number', type: 'px', required: true, description: 'Spawn point Y.' },
    { name: 'vx', kind: 'number', type: 'px/frame', description: 'Initial horizontal speed. Default 0.' },
    { name: 'vy', kind: 'number', type: 'px/frame', description: 'Initial vertical speed. Default 0.' },
    { name: 'missile', kind: 'table', description: 'The shot body: blast, art, trail, physics, action and burst.', children: recordTree('missile') },
    { name: 'clusters', kind: 'table', description: 'The cluster fan, if the body bursts into clusters.', children: recordTree('clusters') },
    ...LAUNCH_GONE,
  ],
};

const WEAPON_SPEC: TableDoc = {
  tableDoc: true,
  id: 'wa.weapons.replace',
  title: 'Weapon spec (replace / register)',
  summary:
    'The table `wa.weapons.replace` rewrites a placed weapon with, and `wa.weapons.register` builds a new one from. Claim keys sit at the top; the record groups hold the weapon data.',
  usedBy: ['wa.weapons.replace', 'wa.weapons.register'],
  source: 'crates/lua-host/src/api.rs `table_to_claim()` + crates/weapons/src/record.rs',
  note:
    '`wa.weapons.replace` names no slot: it claims the weapon its component installs for. `wa.weapons.register` takes the same table and additionally needs `based_on` (the stock slot it occupies).',
  example: `wa.weapons.replace({
  copy_from = "bazooka",
  name = "Heavy Bazooka",
  missile = {
    explosion = { power = 80, push_pct = 60 },
    gravity_pct = 90,
  },
})`,
  fields: [...WEAPON_CLAIM_FIELDS, ...recordGroups()],
};

const WEAPON_DATA: TableDoc = {
  tableDoc: true,
  id: 'wa.weapons.data',
  title: 'Weapon record (as read back)',
  summary:
    'What `wa.weapons.data(id)` returns: the named fields of a weapon record, grouped the same way the spec writes them. `fires.as` names the family.',
  usedBy: ['wa.weapons.data'],
  source: 'crates/lua-host/src/record_table.rs `to_table()` + crates/weapons/src/record.rs',
  note: 'Read-only. The same groups are writable through wa.weapons.replace; a field that needs an action (bounce, homing) only appears when the record has that action.',
  fields: dataGroups(),
};

const SPAWN: TableDoc = {
  tableDoc: true,
  id: 'wa.actors.spawn',
  title: 'Actor spawn',
  summary:
    "Spawns a native LuaActor. The same spec table is reused by `cluster`, `on_explode` and an actor's own `on_fire` child spawns.",
  usedBy: ['wa.actors.spawn', 'cluster', 'on_explode'],
  source: 'crates/lua-host/src/spawn.rs `parse_spawn()` + `runtime_spawn()`',
  example: `local a = wa.actors.spawn({
  sprite = "sprites/blade.png",
  x = 100,
  y = 200,
  origin = "center",
  gravity = false,
  owner = worm,
})`,
  fields: [
    { name: 'x', kind: 'number', type: 'px', description: 'Spawn X. Inherited from the parent actor for a nested spawn.' },
    { name: 'y', kind: 'number', type: 'px', description: 'Spawn Y.' },
    { name: 'vx', kind: 'number', type: 'px/frame', description: 'Initial horizontal speed. Default 0.' },
    { name: 'vy', kind: 'number', type: 'px/frame', description: 'Initial vertical speed. Default 0.' },
    { name: 'owner', kind: 'handle', type: 'worm or actor handle', description: 'The worm or actor that owns it. Defaults to the inherited owner, then the spawning worm.' },
    { name: 'sprite', kind: 'sprite', type: 'name | false | true', description: 'Sprite sheet. false makes it invisible; true keeps the inherited sheet.' },
    { name: 'frame', kind: 'int', description: 'Starting animation frame.' },
    { name: 'from', kind: 'enum', type: '"sky" | "cursor" | "owner"', values: [['sky', 'sky'], ['cursor', 'cursor'], ['owner', 'owner']], description: 'Where it appears. Default "sky"; a nested spawn defaults to the cursor.' },
    { name: 'origin', kind: 'enum', type: '"center" | "bottom"', values: [['center', 'center'], ['bottom', 'bottom']], description: 'What the sprite position means. Default "center".' },
    { name: 'shape', kind: 'enum', type: '"worm" | "missile"', values: [['worm', 'worm'], ['missile', 'missile']], description: 'Collision shape. Default "worm".' },
    { name: 'screen', kind: 'enum', type: '"fill" | "front" | "world"', values: [['fill', 'fill'], ['front', 'front'], ['world', 'world']], description: 'Screen-space drawing. Default "world"; `true` means "front".' },
    { name: 'visible', kind: 'bool', description: 'Default true.' },
    { name: 'gravity', kind: 'bool', description: 'Apply gravity. Defaults to on for an automatic, visible actor.' },
    { name: 'loop', kind: 'bool', description: 'Loop the animation. Defaults to on for an automatic, visible actor.' },
    { name: 'collide', kind: 'bool', description: 'Umbrella for the three collide flags.' },
    { name: 'collide_terrain', kind: 'bool', description: 'Default: the `collide` value.' },
    { name: 'collide_worms', kind: 'bool', description: 'Default: the `collide` value.' },
    { name: 'damage_terrain', kind: 'bool', description: 'Its explosion damages terrain. Defaults to on when `explode` is set.' },
    { name: 'damage_worms', kind: 'bool', description: 'Its explosion damages worms. Defaults to on when `explode` is set.' },
    { name: 'persist', kind: 'bool', description: 'Survives its explosion. Defaults on for an automatic, visible actor with `explode`.' },
    { name: 'drown', kind: 'bool', description: 'Drowns in water. Defaults to on for an automatic, visible actor.' },
    { name: 'as_object', kind: 'bool', description: 'Register as a world object rather than a plain actor. Default false.' },
    { name: 'mask', kind: 'bool', description: 'Use a collision mask. Default false; the mask_* flags default to it.' },
    { name: 'mask_worms', kind: 'bool', description: 'Default: the `mask` value.' },
    { name: 'mask_land', kind: 'bool', description: 'Default: the `mask` value.' },
    { name: 'mask_weapons', kind: 'bool', description: 'Default: the `mask` value.' },
    { name: 'mask_actors', kind: 'bool', description: 'Default: the `mask` value.' },
    { name: 'cursor', kind: 'bool', description: 'Follow the cursor. Default false.' },
    { name: 'on', kind: 'function', type: 'function | { frame, land, hit, contact }', description: 'The brain. A function is its frame callback; a table may name frame, land, hit and contact separately.' },
    {
      name: 'explode',
      kind: 'table',
      type: 'bool | table',
      description: 'Explode where it dies. `true` uses the defaults; a table overrides them.',
      children: [
        { name: 'damage', kind: 'int', description: 'Damage. Default 50.' },
        { name: 'id', kind: 'int', description: 'Explosion id. Default 100.' },
        { name: 'below', kind: 'bool', description: 'Place the blast slightly below. Default true.' },
        { name: 'now', kind: 'bool', description: 'Explode immediately. Default false.' },
      ],
    },
    {
      name: 'cluster',
      kind: 'table',
      type: 'bool | table',
      description: 'Burst into cluster bits where it ends. `true` uses a bouquet default; a table may name the fields itself.',
      children: [
        { name: 'count', kind: 'int', description: 'Bits to release. Clamped to 1..16.' },
        { name: 'spread', kind: 'int', type: 'degrees', description: 'Fan spread. 45 when a named cluster leaves it 0.' },
        { name: 'power', kind: 'number', type: 'px/frame', description: 'Ejection impulse.' },
        { name: 'bounce', kind: 'number', type: 'bool | percent', description: 'Bounciness; `true` is 100%.' },
        { name: 'bounces', kind: 'int', description: 'Bounces before it stops.' },
        { name: 'fuse', kind: 'int', type: 'ms', description: 'Fuse time. `fuse_ms` is accepted as the same field.' },
        { name: 'proximity', kind: 'int', type: 'px', description: 'Proximity trigger radius.' },
        { name: 'homing', kind: 'enum', type: 'bool | "off" | "aim" | "worm"', values: [['off', 'off'], ['aim', 'aim'], ['worm', 'worm']], description: 'Cluster homing mode; `lock` is accepted as a name for aim.' },
        { name: 'impact', kind: 'bool', description: 'Burst on impact.' },
        { name: 'trail', kind: 'sprite', type: 'sprite name | bool', description: 'Trail sprite. `true` uses the stock smoke trail.' },
        { name: 'sprite', kind: 'sprite', description: 'Bit sprite.' },
      ],
    },
    {
      name: 'on_explode',
      kind: 'table',
      type: 'actor spawn table',
      description: 'A nested actor spawned where it explodes. The inner `spawn` table, when present, is the spawn spec.',
    },
  ],
};

const LIGHT_SPEC: TableDoc = {
  tableDoc: true,
  id: 'a.light',
  title: 'Fog light',
  summary:
    'The light an actor carries, and the same spec for a free light from `wa.fog.light`. Presentation only: it never reaches the simulation.',
  usedBy: ['a.light', 'wa.fog.light'],
  source: '0.9.11 release verb list (`spec/verbs 9.11 api 4.0.txt`); the vendored engine snapshot predates fog',
  note:
    "`a.light` also takes a kind name on its own (`a.light = \"projectile\"`) or `false` to turn the light off; `wa.fog.light` always takes the table. Widths, radii and cone geometry are validated by the engine; `wa.fog.defaults()` is the authoritative list of every setting.",
  fields: [
    { name: 'kind', kind: 'enum', type: '"worm" | "animal" | "projectile" | "crate" | string', values: [['worm', 'worm'], ['animal', 'animal'], ['projectile', 'projectile'], ['crate', 'crate']], description: "A preset. A visible world actor starts with its profile's projectile light; an invisible, cursor or screen-space actor starts with none." },
    { name: 'mode', kind: 'enum', type: '"light" | "dark" | "shadow"', values: [['light', 'light'], ['dark', 'dark'], ['shadow', 'shadow']], description: 'light (default) shows; dark shades what its cast sees; shadow shades what is hidden from it within reach. Darkness wins over light.' },
    { name: 'circle', kind: 'table', description: 'The lit circle. Omitted geometry comes from the light kind.' },
    { name: 'cone', kind: 'table', description: 'The cone of a directional light. Omitted geometry comes from the kind.', children: [
      { name: 'length', kind: 'number', description: 'Cone length.' },
      { name: 'width', kind: 'number', description: 'Cone width.' },
      { name: 'toward', kind: 'enum', type: 'velocity | angle | facing | degrees', values: [['velocity', 'velocity'], ['angle', 'angle'], ['facing', 'facing'], ['degrees', 'degrees']], description: 'Which direction the cone points. Default velocity; a free light needs numeric degrees, since it has no heading.' },
    ] },
    { name: 'shadow_cast', kind: 'bool', description: 'The light casts shadows. Defaults from the kind.' },
    { name: 'seen_by', kind: 'enum', type: '"owner" | "everyone"', values: [['owner', 'owner'], ['everyone', 'everyone']], description: "Who sees it. Default owner: the owning worm's side, per view_ownership (public without an owner)." },
    { name: 'discover', kind: 'bool', description: 'Record terrain memory where it shines. Requires seen_by = owner; dark and shadow never record it.' },
    { name: 'strength', kind: 'int', type: '0..255', description: 'Strength of a dark or shadow light.' },
    // Free-light extras (wa.fog.light).
    { name: 'x', kind: 'number', type: 'px', description: 'Free light only: X.' },
    { name: 'y', kind: 'number', type: 'px', description: 'Free light only: Y.' },
    { name: 'owner', kind: 'handle', type: 'worm', description: 'Free light only: the worm it is seen by. Default: everyone.' },
    { name: 'fade', kind: 'int', type: 'ms', description: "Free light only: the circle closes like a blast's, then the light is removed." },
  ],
};

const FOG_SETTINGS: TableDoc = {
  tableDoc: true,
  id: 'wa.fog.set',
  title: 'Fog settings',
  summary: 'Replaces the live fog settings, starting from the current ones.',
  usedBy: ['wa.fog.set'],
  source: '0.9.11 release verb list (`spec/verbs 9.11 api 4.0.txt`)',
  note:
    'The release list names these keys and then "..."; `wa.fog.defaults()` returns every setting with its default, which is the only complete list. A bad key or value raises and leaves the fog unchanged.',
  fields: [
    { name: 'circle_radius', kind: 'number', type: 'px', description: 'Radius of the lit circle.' },
    { name: 'cone_width', kind: 'number', type: 'degrees', description: 'Width of a directional cone.' },
    { name: 'cone_length', kind: 'number', type: 'px', description: 'Length of a directional cone.' },
    { name: 'shadow_cast', kind: 'bool', description: 'Lights cast shadows.' },
    { name: 'discover', kind: 'bool', description: 'Lights record terrain memory.' },
    { name: 'view_ownership', kind: 'enum', type: 'fog ownership mode', description: 'Whether each side sees its own lights or everyone does.' },
    { name: 'fog_floor', kind: 'int', type: 'percent', description: 'Lowest brightness anywhere. 100 is a fully lit map and turns terrain memory off.' },
  ],
};

const FIRE_BULLET: TableDoc = {
  tableDoc: true,
  id: 'wa.weapons.fire_bullet',
  title: 'Hitscan round',
  summary: "Fires one native hitscan round from a point, as WA's shotgun, handgun, uzi or minigun.",
  usedBy: ['wa.weapons.fire_bullet'],
  source: 'crates/lua-host/src/api.rs (wa.weapons.fire_bullet)',
  fields: [
    { name: 'weapon', kind: 'string', type: 'stock.<name>', required: true, description: 'The template: stock.shotgun, stock.handgun, stock.uzi or stock.minigun.' },
    { name: 'owner', kind: 'handle', type: 'worm', required: true, description: 'The firing worm. It must be alive.' },
    { name: 'x', kind: 'int', type: 'px', required: true, description: 'Round start X.' },
    { name: 'y', kind: 'int', type: 'px', required: true, description: 'Round start Y.' },
    { name: 'dx', kind: 'number', description: 'Direction X.' },
    { name: 'dy', kind: 'number', description: 'Direction Y.' },
    { name: 'damage', kind: 'int', description: 'Damage of the round.' },
    { name: 'ignore', kind: 'handle', type: 'entity', description: 'An entity the round passes through.' },
  ],
};

const ASSETS_LOAD: TableDoc = {
  tableDoc: true,
  id: 'wa.assets.load',
  title: 'Component assets',
  summary: "Loads a component's own sprites and sounds from its install.",
  usedBy: ['wa.assets.load'],
  source: 'crates/lua-host/src/api.rs:312 (wa.assets.load)',
  fields: [
    { name: 'sprites', kind: 'table', type: 'string[]', description: 'Pack-relative sprite paths.' },
    { name: 'sounds', kind: 'table', type: 'string[]', description: 'Pack-relative sound paths.' },
    { name: 'gpu_prefix', kind: 'string', description: 'Prefix stripped when the sheets are uploaded, e.g. "sprites/".' },
  ],
};

/** Every documented table shape, in the order the tree shows them. */
export const TABLE_DOCS: TableDoc[] = [
  LAUNCH,
  WEAPON_SPEC,
  WEAPON_DATA,
  SPAWN,
  LIGHT_SPEC,
  FOG_SETTINGS,
  FIRE_BULLET,
  ASSETS_LOAD,
];

const BY_ID = new Map(TABLE_DOCS.map((d) => [d.id, d]));

export function findTableDoc(id: string): TableDoc | undefined {
  return BY_ID.get(id);
}

/** The doc for a call written in source, e.g. `wa.weapons.launch`. */
export function tableDocForCallee(callee: string): TableDoc | undefined {
  return BY_ID.get(callee) ?? TABLE_DOCS.find((d) => d.usedBy.includes(callee));
}

/** Every field in a doc, flattened, for the tree's search box. */
export function fieldPaths(fields: TableField[], prefix = ''): string[] {
  const out: string[] = [];
  for (const f of fields) {
    const path = prefix ? `${prefix}.${f.name}` : f.name;
    out.push(path);
    if (f.children) out.push(...fieldPaths(f.children, path));
  }
  return out;
}

/** The field at a path inside a doc, leaf or table, or null. */
export function fieldAt(doc: TableDoc, path: string[]): TableField | null {
  let current: TableField | undefined;
  let scope = doc.fields;
  for (const part of path) {
    current = scope.find((f) => f.name === part);
    if (!current) return null;
    scope = current.children ?? [];
  }
  return current ?? null;
}

/**
 * The keys valid inside the table at `path`, or null when `path` names no
 * table. A leaf has no keys, so it answers null rather than [].
 */
export function fieldsAtPath(doc: TableDoc, path: string[]): TableField[] | null {
  if (path.length === 0) return doc.fields;
  return fieldAt(doc, path)?.children ?? null;
}
