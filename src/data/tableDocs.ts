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
  aims: 'Weapon takes aim before firing.',
  creates_projectile: 'Firing creates a projectile rather than a hitscan.',
  type: 'WA fire type (+0x30). Selects the record family with `method`.',
  subtype: 'WA fire subtype (+0x34); selects the worm aim sheet and related behavior.',
  method: 'WA fire method (+0x38): 2 hitscan, 3 projectile, and so on.',
  shots: 'Shots per turn.',
  ends_turn: 'Firing ends the turn.',
  retreat: 'Retreat time after firing, in ms.',
  plane: 'Stock sprite name or ID for the strike plane.',
  count: 'Number of munitions dropped by the strike.',
  spacing: 'Horizontal spacing between munitions, in px.',
  munition: 'Munition type dropped by the strike.',
  proximity: 'Detection radius, in px.',
  arm: 'Arm delay, in ms.',
  detects: 'Detection flags.',
  fuse: 'Fuse time, in ms.',
  'explosion.bias': 'Downward pixel offset of the blast.',
  'explosion.push_pct': 'Push force, in percent.',
  'explosion.power': 'Blast power (damage dealt).',
  'explosion.variation': 'Random variation applied to the blast.',
  bullets: 'Bullets fired per shot.',
  damage: 'Damage per bullet.',
  collides: 'Body collision flags.',
  sprite: 'Flight sprite: stock sprite name or ID.',
  animation: 'Flight animation rate.',
  'trail.sprite': 'Smoke trail sprite (0 disables the trail).',
  'trail.power': 'Trail emission strength.',
  'trail.speed': 'Trail emission speed.',
  speed_pct: 'Speed as a percentage of the slot default.',
  wind_pct: 'Wind influence on the body, in percent.',
  random_motion: 'Random sideways jitter during flight.',
  gravity_pct: 'Gravity applied to the body, in percent.',
  countdown: 'Countdown before the fuse starts, in ms.',
  flight_sound: 'Stock sound ID played during flight.',
  'explosion_sound.enabled': 'Play a sound on explosion.',
  'explosion_sound.sound': 'Stock sound ID for the explosion.',
  'explosion_sound.before': 'Delay before the explosion sound, in ms.',
  explode_on_space: 'Pressing Space explodes it in mid-flight.',
  action: 'Body behavior; determines which +0xA8 fields apply.',
  burst: 'What the body bursts into when it ends.',
  angle: 'Launch angle of the cluster fan.',
  spread: 'Spread of the cluster fan, in degrees.',
  'bit.sprite_count': 'Number of distinct cluster sprites in the fan.',
  'bit.explosion.power': 'Blast power of each cluster.',
  'bit.explosion.bias': 'Downward pixel offset of each cluster blast.',
  'bit.explosion.push_pct': 'Push force of each cluster blast, in percent.',
  'bit.explosion.variation': 'Random variation of each cluster blast.',
  'bit.trail.sprite': 'Smoke trail sprite for each cluster.',
  'bit.trail.power': 'Trail strength for each cluster.',
  'bit.trail.speed': 'Trail speed for each cluster.',
  'bit.speed_pct': 'Cluster speed, in percent.',
  'bit.wind_pct': 'Wind influence on each cluster, in percent.',
  'bit.gravity_pct': 'Gravity on each cluster, in percent.',
  'bit.fuse': 'Fuse time of each cluster, in ms.',
  'bit.countdown': 'Countdown before each cluster fuse starts, in ms.',
  'bit.flight_sound': 'Stock sound ID for each cluster in flight.',
  'bit.explode_on_space': 'Pressing Space explodes each cluster.',
  'bit.burst': 'What each cluster bursts into.',
};

const GROUP_NOTES: Record<string, string> = {
  fires: 'Fire type and method: selects the weapon record family.',
  handling: 'Turn handling: shots, retreat, and whether firing ends the turn.',
  missile: 'Missile body: blast, art, trail, physics, action, and burst.',
  clusters: 'Cluster fan a missile bursts into, including per-cluster settings.',
  mine: 'Mine record: proximity, arming, and blast.',
  gun: 'Hitscan gun record: bullets and damage.',
  strike: 'Strike record: plane, munitions, and spacing.',
  jet_pack: 'Jet pack record: fuel.',
  utility: 'Native turn utility effect: low gravity, fast walk, laser sight, invisibility, damage x2, crate spy, double turn time, or crate shower.',
  parachute: 'Parachute record: wind response.',
  sheep: 'Roaming sheep record: flight sprites and sounds.',
  fire_punch: 'Fire Punch record: damage and knockback.',
  drill: 'Drill record: duration.',
  arrow: 'Arrow record: damage.',
  baseball_bat: 'Baseball Bat record: damage and knockback scale.',
  flame_thrower: 'Flame Thrower record: flames, spread generations, and burn.',
  armageddon: 'Armageddon meteors: missile body offset 4 bytes early; applies when fires.subtype = 24.',
};

/**
 * The group names `record_table::GROUPS` accepts (record_table.rs:11). All 17
 * are writable through `wa.weapons.replace`; the older list stopped at
 * `jet_pack`, which made every special group a false `spec-key-typo`.
 */
export const RECORD_GROUPS = [
  'fires',
  'handling',
  'missile',
  'clusters',
  'mine',
  'gun',
  'strike',
  'jet_pack',
  'utility',
  'parachute',
  'sheep',
  'fire_punch',
  'drill',
  'arrow',
  'baseball_bat',
  'flame_thrower',
  'armageddon',
] as const;

function noteFor(group: string, relative: string): string | undefined {
  // `clusters.bit.*` reuses the missile body's notes on purpose: it IS the same
  // body, at a different offset.
  const normalized = relative
    .replace(/^bit\./, '')
    .replace(/^meteor\./, '')
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
          'Read-only: family selected by fire type and method. Can\'t be set in a spec.',
      },
      ...fires.children,
    ];
  }
  return [
    {
      name: 'ends_invisibility',
      kind: 'bool',
      description:
        'Whether using this weapon ends team and per-worm Invisibility. Defaults to WA behavior (weapons that create projectiles end it; rope, Girder, Teleport, Prod, Freeze, Jet Pack, and utilities don\'t).',
    },
    ...groups,
  ];
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
  { name: 'id', kind: 'string', description: 'Weapon ID being claimed, like "px.javelin".' },
  { name: 'name', kind: 'string', description: 'Display name shown on the panel.' },
  { name: 'copy_from', kind: 'string', type: 'weapon id', description: 'Base record to copy from (placed weapon or `stock.<name>`). Mutually exclusive with `wep`.' },
  { name: 'wep', kind: 'string', type: 'mod path', description: 'Project X `.wep` file to import firing data from. Uses its weapon name by default. Mutually exclusive with `copy_from`.' },
  { name: 'hold_as', kind: 'string', type: 'stock weapon id', description: 'Stock weapon (`stock.<name>`) whose held pose the worm uses when the missile sprite is hidden. Special weapons don\'t provide a pose.' },
  { name: 'panel_icon', kind: 'sprite', description: 'Panel icon: `.png` path or stock icon name.' },
  { name: 'icon', kind: 'sprite', description: 'Alias of `panel_icon`.' },
  { name: 'panel_icons', kind: 'table', type: 'stock icon names', description: 'Extra panel icons for variant states.' },
  { name: 'is_weapon', kind: 'bool', description: 'Default true. Set false for a non-weapon claim.' },
  { name: 'collects_crates', kind: 'bool', description: 'Default true. Set false so missiles pass through crates instead of collecting them for the firing team.' },
  { name: 'ends_invisibility', kind: 'bool', description: 'Whether using this weapon ends team and per-worm Invisibility. Defaults to WA behavior (weapons that create projectiles end it; rope, Girder, Teleport, Prod, Freeze, Jet Pack, and utilities don\'t).' },
  { name: 'eat_fire', kind: 'bool', description: 'Default false. Consumes the fire key in the Lua handler.' },
  { name: 'click_finish', kind: 'bool', description: 'Default true. A click finishes the shot immediately.' },
  {
    name: 'click',
    kind: 'enum',
    type: '"homing"',
    values: [['homing', 'homing']],
    description:
      '`"homing"`: shows the target cursor on selection, marks the target on click, and fires on Space. `on_fire` receives `target = { x, y }`. Mutually exclusive with `eat_fire`, `on_click`, and `on_select.cursor`.',
  },
  { name: 'fire_repeat', kind: 'int', description: '1 to 20 shots at once. Default 1.' },
  {
    name: 'stock_fire_choice',
    kind: 'table',
    description: 'Hold Ctrl to fire an alternate weapon while this slot is selected.',
    children: [
      { name: 'held', kind: 'enum', type: '"ctrl"', values: [['ctrl', 'ctrl']], required: true, description: 'Only accepted value.' },
      { name: 'alternate', kind: 'string', type: 'weapon id', required: true, description: 'Weapon fired while Ctrl is held.' },
    ],
  },
  { name: 'sprites', kind: 'table', type: 'mod paths', description: 'Mod-relative `.png` sprite sheets installed by this weapon.' },
  { name: 'sounds', kind: 'table', type: 'mod paths', description: 'Mod-relative WAV files installed by this weapon.' },
  { name: 'worm_sprites', kind: 'table', description: 'Worm pose art: `pow = "sprites/equip"`, or one sheet per team colour.' },
  {
    name: 'worm_sprites_toggle',
    kind: 'table',
    description: 'Alternate worm pose sheets shown while the `+` key toggle is active.',
    children: [
      { name: 'key', kind: 'enum', type: '"plus_key"', values: [['plus_key', 'plus_key']], required: true, description: 'Only accepted value.' },
      { name: 'worm_sprites', kind: 'table', description: 'Pose-to-path table in the same format as `worm_sprites`.' },
    ],
  },
  {
    name: 'worm_sprites_team_tint',
    kind: 'table',
    description: 'One overlay per pose tinted by the worm\'s team colour instead of six separate sheets.',
    children: [
      { name: 'worm_sprites', kind: 'table', description: 'One overlay path per pose (reused across all six teams).' },
      { name: 'colours', kind: 'table', description: 'Six team colours (red to cyan) used to tint the overlay.' },
    ],
  },
  { name: 'cluster_sprite', kind: 'sprite', description: 'Mod sprite sheet for clusters in a replace/overlay weapon. Uses a WA sprite slot.' },
  { name: 'cluster_homing_sprite', kind: 'sprite', description: 'Mod sprite sheet drawn while a homing cluster is homing. Uses a WA sprite slot.' },
  {
    name: 'cluster_homing',
    kind: 'enum',
    type: '"stock.homing_missile" | "stock.homing_pigeon" | "stock.magic_bullet"',
    values: [['stock.homing_missile', 'stock.homing_missile'], ['stock.homing_pigeon', 'stock.homing_pigeon'], ['stock.magic_bullet', 'stock.magic_bullet']],
    description: 'Makes clusters home like the named stock weapon, applying its homing setup before record fields adjust it.',
  },
  { name: 'sprite_overrides', kind: 'table', description: 'Sprite sheet replacements keyed by stock sprite name.' },
  {
    name: 'hold',
    kind: 'table',
    description: 'Held-weapon art and geometry.',
    children: [
      { name: 'sheet', kind: 'sprite', required: true, description: 'Hold sprite sheet.' },
      { name: 'sheets', kind: 'table', type: 'mod paths', description: 'Extra hold sheets bundled with the weapon.' },
      { name: 'hand', kind: 'sprite', description: 'Hand sprite.' },
      { name: 'flash', kind: 'table', type: '{ sheet, out, side, scale, frames }', description: 'Muzzle flash.' },
      { name: 'static', kind: 'table', type: '{ weap, hand }', description: 'Fixed hold angles instead of animated ones.' },
      { name: 'frames', kind: 'int', description: 'Frames in the hold animation. Default 1.' },
      { name: 'anim_speed', kind: 'number', description: 'Hold animation speed. Default 1.' },
      { name: 'hand_scale', kind: 'number', description: 'Hand scale. Default 1.' },
      { name: 'hand_rotation', kind: 'number', description: 'Hand rotation. Default 1.' },
      { name: 'hand_radius', kind: 'number', description: 'Hand orbit radius. Default 1.' },
      { name: 'hand_radial_rotation', kind: 'number', description: 'Hand rotation while orbiting. Default 1.' },
      { name: 'draw_hand', kind: 'bool', description: 'Default true. Set false to load the hand sheet without drawing it.' },
      { name: 'weap_scale', kind: 'number', description: 'Weapon scale. Default 1.' },
      { name: 'weap_rotation', kind: 'number', description: 'Weapon rotation. Default 1.' },
      { name: 'weap_radius', kind: 'number', description: 'Weapon orbit radius. Default 1.' },
      { name: 'weap_radial_rotation', kind: 'number', description: 'Weapon rotation while orbiting. Default 1.' },
      { name: 'keep_while_firing', kind: 'bool', description: 'Keep held art visible while firing.' },
      { name: 'thrown', kind: 'bool', description: 'Weapon is thrown rather than held.' },
      { name: 'put_away', kind: 'bool', description: 'Draw the put-away pose.' },
    ],
  },
  { name: 'on_click', kind: 'function', type: 'function | { on = function }', description: 'Click handler function (or `{ on = function }`); spawn actors inside it with `wa.actors.spawn`.' },
  { name: 'params', kind: 'table', description: 'Drawing parameters for the weapon.', children: [
    { name: 'layer', kind: 'int', description: 'Draw layer.' },
    { name: 'depth', kind: 'int', description: 'Draw depth.' },
    { name: 'depth_prefix', kind: 'string', description: 'Depth prefix.' },
    { name: 'gpu_prefix', kind: 'string', description: 'Prefix for GPU sheet names.' },
    { name: 'truecolor_prefix', kind: 'string', description: 'Prefix for true-colour sheet names.' },
    { name: 'reserve_prefix', kind: 'string', description: 'Prefix for reserved sprite names.' },
    { name: 'worm_art', kind: 'table', type: 'mod paths', description: 'Sprites drawn in place of the worm.' },
    { name: 'worm_sprites_animate', kind: 'bool', description: 'Animate worm-pose sheets.' },
  ] },
  {
    name: 'projectile',
    kind: 'table',
    description:
      'Overlay weapon: replaces a stock slot projectile with a custom record built by `wa.weapons.launch`. Only these eight keys are accepted.',
    children: [
      { name: 'copy_from', kind: 'string', type: 'weapon id', description: 'Base stock missile weapon (required).' },
      { name: 'fires', kind: 'table', description: 'Overlay fire type and method.', children: recordTree('fires') },
      { name: 'missile', kind: 'table', description: 'Overlay missile body.', children: recordTree('missile') },
      { name: 'clusters', kind: 'table', description: 'Overlay cluster fan.', children: recordTree('clusters') },
      { name: 'sprite', kind: 'sprite', description: 'Mod-relative flight sprite sheet.' },
      { name: 'cluster_sprite', kind: 'sprite', description: 'Mod-relative cluster sprite sheet. Uses a WA sprite slot.' },
      { name: 'params', kind: 'table', description: 'Flat drawing params (sprite_columns, layer, depth, ...).' },
      { name: 'sprites', kind: 'table', type: 'mod paths', description: 'Extra sheets installed by the overlay.' },
    ],
  },
  {
    name: 'sheep_sprites',
    kind: 'table',
    type: 'two mod paths',
    description:
      'Two flying-sheep sheets `{ first, second }` as mod-relative `.png` paths. Use `sheep.flight_1` / `sheep.flight_2` for stock sprites.',
  },
  { name: 'raw', kind: 'table', type: '[offset] = int', description: 'Raw dword writes by record offset, like `[0x50] = 7`. Checked against the field table.' },
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
    'Launches a native WA missile from a weapon record with native lockstep, wind, trail, and collision.',
  usedBy: ['wa.weapons.launch'],
  source: 'crates/lua-host/src/api.rs `launch_args()` + record_table.rs `launch_writes()`',
  note:
    'Pass record overrides under `missile` and `clusters`. Flat keys like `damage` or `fuse` are rejected.',
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
    { name: 'weapon', kind: 'string', type: 'weapon id', required: true, description: 'Placed weapon ID (`px.javelin`) or `stock.<name>` to copy the record from.' },
    { name: 'owner', kind: 'handle', type: 'worm handle', required: true, description: 'Firing worm (required; 0 is rejected).' },
    { name: 'x', kind: 'number', type: 'px', required: true, description: 'Spawn point X.' },
    { name: 'y', kind: 'number', type: 'px', required: true, description: 'Spawn point Y.' },
    { name: 'vx', kind: 'number', type: 'px/frame', description: 'Initial horizontal speed. Default 0.' },
    { name: 'vy', kind: 'number', type: 'px/frame', description: 'Initial vertical speed. Default 0.' },
    { name: 'missile', kind: 'table', description: 'Missile body: blast, art, trail, physics, action, and burst.', children: recordTree('missile') },
    { name: 'clusters', kind: 'table', description: 'Cluster fan when the body bursts into clusters.', children: recordTree('clusters') },
    ...LAUNCH_GONE,
  ],
};

const WEAPON_SPEC: TableDoc = {
  tableDoc: true,
  id: 'wa.weapons.replace',
  title: 'Weapon spec (replace)',
  summary:
    'Table passed to `wa.weapons.replace`. Claim keys sit at the top level; record groups hold the weapon data.',
  usedBy: ['wa.weapons.replace'],
  source: 'crates/lua-host/src/api.rs `table_to_claim()` + crates/weapons/src/record.rs',
  note:
    '`wa.weapons.replace` claims the slot assigned to this weapon component; don\'t pass a slot index.',
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
    'Table returned by `wa.weapons.data(id)`: named weapon record fields grouped the same way as `wa.weapons.replace`, plus read-only `fires.as`.',
  usedBy: ['wa.weapons.data'],
  source: 'crates/lua-host/src/record_table.rs `to_table()` + crates/weapons/src/record.rs',
  note: 'Read-only. Action-specific fields (`bounce`, `homing`) only appear when the record uses that action.',
  fields: dataGroups(),
};

const SPAWN: TableDoc = {
  tableDoc: true,
  id: 'wa.actors.spawn',
  title: 'Actor spawn',
  summary:
    'Spawns a native LuaActor with only the behaviors specified in this table. Pass `owner = parent` to spawn a child actor.',
  usedBy: ['wa.actors.spawn'],
  source: 'crates/lua-host/src/spawn.rs `parse_spawn()` + `runtime_spawn()`',
  note: 'All collision settings live under `body`. Top-level collision keys (`kind`, `from`, `on_explode`, `collide*`, `mask*`, `shape`, `as_object`, `solid`) error.',
  example: `local a = wa.actors.spawn({
  sprite = "sprites/blade.png",
  x = 100,
  y = 200,
  origin = "center",
  gravity = 1,
  owner = worm,
  body = { shape = "worm", hits = { land = true }, hit_by = "all" },
})`,
  fields: [
    { name: 'x', kind: 'number', type: 'px', description: 'Spawn X.' },
    { name: 'y', kind: 'number', type: 'px', description: 'Spawn Y.' },
    { name: 'vx', kind: 'number', type: 'px/frame', description: 'Initial horizontal speed. Default 0.' },
    { name: 'vy', kind: 'number', type: 'px/frame', description: 'Initial vertical speed. Default 0.' },
    { name: 'owner', kind: 'handle', type: 'worm or actor handle', description: 'Owning worm or actor. Defaults to the callback worm or actor (`"none"` for neutral; required when the callback has neither).' },
    { name: 'sprite', kind: 'sprite', type: 'name | false | true', description: 'Sprite sheet. `false` hides it; `true` keeps the inherited sheet.' },
    { name: 'visibility', kind: 'handle', type: 'worm', description: 'Draw the actor only where that worm is visible.' },
    { name: 'frame', kind: 'int', description: 'Starting animation frame.' },
    { name: 'origin', kind: 'enum', type: '"center" | "bottom"', values: [['center', 'center'], ['bottom', 'bottom']], description: 'Sprite anchor point. Default "center".' },
    {
      name: 'body',
      kind: 'table',
      description: 'Collision body: shape, outgoing movement, incoming attackers, push response, collision layer, and stamped mask. Without `body`, nothing collides with or hits the actor.',
      children: [
        { name: 'physics', kind: 'enum', type: '"mine"', values: [['mine', 'mine']], description: 'Uses stock mine physics (defaults `gravity = 1` and `persist = true`).' },
        { name: 'shape', kind: 'enum', type: '"worm" | "missile" | "sprite" | mod path', values: [['worm', 'worm'], ['missile', 'missile'], ['sprite', 'sprite']], description: 'Collision outline. Default `"worm"`, or `"missile"` with `physics = "mine"`. An image path works with `sprite = false` without using a sprite slot.' },
        { name: 'hits', kind: 'table', description: 'Outgoing movement layers: `land`, `worms`, `mines`, `crates`, `objects`, `missiles`. Defaults to `{}`.', children: [
          { name: 'land', kind: 'bool' },
          { name: 'worms', kind: 'bool' },
          { name: 'mines', kind: 'bool' },
          { name: 'crates', kind: 'bool' },
          { name: 'objects', kind: 'bool' },
          { name: 'missiles', kind: 'bool' },
        ] },
        { name: 'hit_by', kind: 'any', type: 'string | table', description: '"all" or { worms, missiles, arrows, mines, actors, bullets, melee, fire, dragon_ball, blasts }. Defaults to "all".' },
        { name: 'pushed_by', kind: 'table', description: 'Knockback scale (0..1) per attacker category: `worms`, `missiles`, `arrows`, `mines`, `actors`. Omitted entries use 1.' },
        { name: 'layer', kind: 'enum', type: '"object" | "missile"', values: [['object', 'object'], ['missile', 'missile']], description: 'Collision layer: `"object"` (layer 17: oil-drum layer) or `"missile"` (layer 15). Default `"object"`.' },
        { name: 'mask', kind: 'any', type: 'true | table', description: 'Stamps the opaque outline into the collision grid each frame (`true` for all, or `{ worms, land, weapons, actors, rope }`). Default false.' },
      ],
    },
    { name: 'visible', kind: 'bool', description: 'Default true.' },
    { name: 'gravity', kind: 'number', type: 'factor', description: 'Gravity scale factor (`1` normal, `0` none). Default 0.' },
    { name: 'magnetic', kind: 'number', type: '0..1000', description: 'Automatic magnetic response multiplier. Default 0 (opted out); fields sum in creation order before movement.' },
    { name: 'grab', kind: 'any', type: 'true | false | "worm" | "projectile"', description: 'How pickup tools treat this actor: `true` (object, default), `false` (ignore), `"worm"` (represents owner), or `"projectile"` (in flight).' },
    { name: 'loop', kind: 'bool', description: 'Loop the animation. Default false.' },
    { name: 'damage_terrain', kind: 'bool', description: 'Explosion damages terrain. Defaults to true when `explode` is set.' },
    { name: 'damage_worms', kind: 'bool', description: 'Explosion damages worms. Defaults to true when `explode` is set.' },
    { name: 'persist', kind: 'bool', description: 'Survives its explosion. Default false.' },
    { name: 'drown', kind: 'bool', description: 'Drowns in water. Default false.' },
    { name: 'cursor', kind: 'bool', description: 'Follow the world cursor. Default false.' },
    { name: 'on', kind: 'function', type: 'function | { frame, land, hit, touched, contact }', description: 'Event callbacks. A bare function is the `frame` handler; a table sets `frame`, `land`, `hit`, `touched` (something ran into this actor), and `contact` (this actor ran into something). After `a:sleep`, `frame` receives `ev.slept`.' },
    {
      name: 'explode',
      kind: 'table',
      type: 'bool | table',
      description: 'Explode on removal. `true` uses defaults; a table overrides them.',
      children: [
        { name: 'damage', kind: 'int', description: 'Damage. Default 50.' },
        { name: 'id', kind: 'int', description: 'Explosion ID. Default 100.' },
        { name: 'below', kind: 'bool', description: 'Place the blast 1 px lower. Default true.' },
        { name: 'now', kind: 'bool', description: 'Explode immediately. Default false.' },
      ],
    },
  ],
};

const LIGHT_SPEC: TableDoc = {
  tableDoc: true,
  id: 'a.light',
  title: 'Fog light',
  summary:
    'Light spec for `a.light` and `wa.fog.light`. Presentation only; never affects simulation.',
  usedBy: ['a.light', 'wa.fog.light'],
  source: '0.9.11 release verb list (`spec/verbs 9.11 api 4.0.txt`)',
  note:
    '`a.light` also accepts a preset string (`"projectile"`) or `false` to disable; `wa.fog.light` requires a table. Call `wa.fog.defaults()` for all defaults.',
  fields: [
    { name: 'kind', kind: 'enum', type: '"worm" | "animal" | "projectile" | "crate" | string', values: [['worm', 'worm'], ['animal', 'animal'], ['projectile', 'projectile'], ['crate', 'crate']], description: 'Light preset. Visible world actors default to the profile projectile light; invisible, cursor, and screen-space actors start with none.' },
    { name: 'mode', kind: 'enum', type: '"light" | "dark" | "shadow"', values: [['light', 'light'], ['dark', 'dark'], ['shadow', 'shadow']], description: '`light` (default) lights the area; `dark` shades what its cast sees; `shadow` shades what is occluded within reach. Darkness overrides light.' },
    { name: 'circle', kind: 'int', type: '0..700 px', description: 'Lit circle radius. Omitted geometry defaults from `kind`.' },
    { name: 'cone', kind: 'table', description: 'Directional light cone. Omitted geometry defaults from `kind`.', children: [
      { name: 'length', kind: 'number', description: 'Cone length.' },
      { name: 'width', kind: 'number', description: 'Cone width.' },
      { name: 'toward', kind: 'enum', type: 'velocity | angle | facing | degrees', values: [['velocity', 'velocity'], ['angle', 'angle'], ['facing', 'facing'], ['degrees', 'degrees']], description: 'Cone direction. Default `velocity`; free lights require numeric degrees.' },
    ] },
    { name: 'shadow_cast', kind: 'bool', description: 'Whether the light casts shadows. Defaults from `kind`.' },
    { name: 'seen_by', kind: 'enum', type: '"owner" | "everyone"', values: [['owner', 'owner'], ['everyone', 'everyone']], description: 'Who sees the light. Default `owner` (owning worm\'s side per `view_ownership`, or everyone if unowned).' },
    { name: 'discover', kind: 'bool', description: 'Record terrain memory where lit. Requires `seen_by = "owner"`; dark and shadow lights never record memory.' },
    { name: 'strength', kind: 'int', type: '0..255', description: 'Strength of a dark or shadow light.' },
    { name: 'owner_strength', kind: 'int', type: '0..255', description: 'Strength seen by the owner\'s side (dark and shadow only).' },
    { name: 'reach', kind: 'int', type: '0..700 px', description: 'Maximum cast reach. `circle` (<= `reach`) sets how far darkness spreads inside it.' },
    { name: 'without_fog', kind: 'bool', description: 'Dark and shadow only: draw even when fog is disabled.' },
    { name: 'into_terrain', kind: 'table', type: '{ depth, falloff }', description: 'Dark only: extends darkness `depth` px into reached terrain, fading over `falloff` px (0..32 each).' },
    { name: 'fill', kind: 'table', type: 'true | { flow = px }', description: 'Fill the whole circle, or flow out up to 2x reach instead of a hard edge.' },
    // Free-light extras (wa.fog.light).
    { name: 'x', kind: 'number', type: 'px', description: 'Free light only: X.' },
    { name: 'y', kind: 'number', type: 'px', description: 'Free light only: Y.' },
    { name: 'owner', kind: 'handle', type: 'worm', description: 'Free light only: owning worm for visibility. Default: everyone.' },
    { name: 'fade', kind: 'int', type: 'ms', description: 'Free light only: duration before the circle closes and the light is removed.' },
  ],
};

const FOG_SETTINGS: TableDoc = {
  tableDoc: true,
  id: 'wa.fog.set',
  title: 'Fog settings',
  summary: 'Updates live fog settings starting from current values.',
  usedBy: ['wa.fog.set'],
  source: '0.9.11 release verb list (`spec/verbs 9.11 api 4.0.txt`)',
  note:
    'Call `wa.fog.defaults()` for the full list of settings and defaults. Invalid keys or values error without changing the fog.',
  fields: [
    { name: 'circle_radius', kind: 'number', type: 'px', description: 'Radius of the lit circle.' },
    { name: 'cone_width', kind: 'number', type: 'degrees', description: 'Width of a directional cone.' },
    { name: 'cone_length', kind: 'number', type: 'px', description: 'Length of a directional cone.' },
    { name: 'shadow_cast', kind: 'bool', description: 'Lights cast shadows.' },
    { name: 'discover', kind: 'bool', description: 'Lights record terrain memory.' },
    { name: 'view_ownership', kind: 'enum', type: 'fog ownership mode', description: 'Whether each side sees only its own lights or everyone\'s.' },
    { name: 'fog_floor', kind: 'int', type: 'percent', description: 'Minimum brightness everywhere. 100 fully lights the map and disables terrain memory.' },
  ],
};

const BRUSH_SPEC: TableDoc = {
  tableDoc: true,
  id: 'wa.draw.brush',
  title: 'Draw brush',
  summary:
    'Pre-configured sprite brush so `brush:box`, `brush:boxes`, and `brush:quads` don\'t allocate per-frame tables.',
  usedBy: ['wa.draw.brush'],
  source: 'crates/lua-host/src/brush.rs (wa.draw.brush)',
  note:
    'Pass `visibility` to `brush:box`, `brush:boxes`, or `brush:quads`. `sprite` is required. Draw methods work inside `wa.on.draw` only.',
  example: `local glow = wa.draw.brush({
  sprite = "sprites/Glow.png",
  blend = "add",
})

wa.on.draw(function()
  glow:box(x, y, 24, 24, angle)
end)`,
  fields: [
    { name: 'sprite', kind: 'sprite', required: true, description: 'Sprite sheet to draw (mod paths resolve against the creating mod).' },
    { name: 'frame', kind: 'int', description: 'Default frame for every draw. Default 0.' },
    { name: 'blend', kind: 'enum', type: 'blend mode', values: [['alpha', 'alpha'], ['add', 'add']], description: 'Alpha (default) or additive.' },
    { name: 'depth', kind: 'int', description: 'Draw depth (like `wa.draw.quad`). Defaults to the GPU objects band.' },
    { name: 'color', kind: 'int', type: '0xAARRGGBB', description: 'Tint for all four corners. Default 0xFFFFFFFF.' },
    { name: 'colors', kind: 'table', type: '{ c1, c2, c3, c4 }', description: 'Per-corner tint; overrides `color`.' },
    { name: 'uv', kind: 'table', type: '{ u0, v0, u1, v1 }', description: 'Frame sub-rectangle (0..1 each). Defaults to the full frame.' },
  ],
};

const FIRE_BULLET: TableDoc = {
  tableDoc: true,
  id: 'wa.weapons.fire_bullet',
  title: 'Hitscan round',
  summary: 'Fires a native hitscan bullet using a stock gun template.',
  usedBy: ['wa.weapons.fire_bullet'],
  source: 'crates/lua-host/src/api.rs (wa.weapons.fire_bullet)',
  fields: [
    { name: 'weapon', kind: 'string', type: 'stock.<name>', required: true, description: 'Template: `stock.shotgun`, `stock.handgun`, `stock.uzi`, or `stock.minigun`.' },
    { name: 'owner', kind: 'handle', type: 'worm', required: true, description: 'Firing worm (must be alive).' },
    { name: 'x', kind: 'int', type: 'px', required: true, description: 'Start X.' },
    { name: 'y', kind: 'int', type: 'px', required: true, description: 'Start Y.' },
    { name: 'dx', kind: 'number', description: 'Direction X.' },
    { name: 'dy', kind: 'number', description: 'Direction Y.' },
    { name: 'damage', kind: 'int', description: 'Bullet damage.' },
    { name: 'ignore', kind: 'handle', type: 'entity', description: 'Entity the bullet passes through.' },
  ],
};

const ASSETS_LOAD: TableDoc = {
  tableDoc: true,
  id: 'wa.assets.load',
  title: 'Component assets',
  summary: 'Loads sprites and sounds for a component during `install`.',
  usedBy: ['wa.assets.load'],
  source: 'crates/lua-host/src/api.rs (wa.assets.load)',
  fields: [
    { name: 'sprites', kind: 'table', type: 'string[]', description: 'Mod-relative sprite paths.' },
    { name: 'sounds', kind: 'table', type: 'string[]', description: 'Mod-relative WAV paths, or `soundbank/<Bank>/<Line>` for stock soundbank lines. Only declared lines are loaded.' },
    { name: 'gpu_prefix', kind: 'string', description: 'Prefix stripped when uploading sheets, like `"sprites/"`.' },
    { name: 'wa_sprites', kind: 'table', type: 'string[]', description: 'Stock sprites to copy into the match atlas by Gfx.dir name (`wbrth1`) or group (`worm`) for full-colour drawing.' },
    {
      name: 'worm_glow',
      kind: 'any',
      type: 'true | { radius, pad, gain }',
      description: 'Match-wide worm glow shape (also applied to placed weapon worm sheets).',
      children: [
        { name: 'radius', kind: 'int', type: 'px', description: 'Blur radius (uses default if omitted).' },
        { name: 'pad', kind: 'int', type: 'px', description: 'Padding around the blur (defaults from `radius`).' },
        { name: 'gain', kind: 'number', description: 'Glow intensity (uses default if omitted).' },
      ],
    },
  ],
};

const HUD_WINDOW: TableDoc = {
  tableDoc: true,
  id: 'wa.hud.window',
  title: 'HUD window',
  summary:
    'WA-styled text window sized to its content and open until closed or match end.',
  usedBy: ['wa.hud.window'],
  source: 'WormBench verb reference',
  note:
    'Max 32 open. Fades out while the weapon panel is open unless `over_panel = true`.',
  example: `local window = wa.hud.window({
  text = "Turn 3",
  x = 10,
  y = 10,
  align = "top_left",
  font = "standard",
  color = "yellow",
  max_width = 240,
})
window:set({ text = "Turn 4" })
window:close()`,
  fields: [
    { name: 'text', kind: 'string', description: 'Window text (`\\n` for line breaks). Use `text` or `lines`.' },
    { name: 'lines', kind: 'table', type: '{ string | { text, color } }[]', description: 'Line entries, optionally with per-line `color`. Use `text` or `lines`.' },
    { name: 'x', kind: 'number', type: 'px', description: 'Horizontal offset from the `align` anchor. Default 0.' },
    { name: 'y', kind: 'number', type: 'px', description: 'Vertical offset from the `align` anchor. Default 0.' },
    {
      name: 'align',
      kind: 'enum',
      type: 'screen anchor',
      values: [
        ['top_left', 'top_left'], ['top', 'top'], ['top_right', 'top_right'],
        ['left', 'left'], ['center', 'center'], ['right', 'right'],
        ['bottom_left', 'bottom_left'], ['bottom', 'bottom'], ['bottom_right', 'bottom_right'],
      ],
      description: 'Screen and box anchor point that `x` and `y` offset from.',
    },
    { name: 'font', kind: 'enum', type: 'font', values: [['small', 'small'], ['standard', 'standard'], ['medium', 'medium']], description: 'WA font: `small`, `standard` (round timer font), or `medium`.' },
    { name: 'color', kind: 'enum', type: 'colour', values: [['white', 'white'], ['grey', 'grey'], ['red', 'red'], ['blue', 'blue'], ['green', 'green'], ['yellow', 'yellow'], ['purple', 'purple'], ['cyan', 'cyan']], description: 'Text colour.' },
    { name: 'border', kind: 'enum', type: 'colour | none', values: [['white', 'white'], ['grey', 'grey'], ['red', 'red'], ['blue', 'blue'], ['green', 'green'], ['yellow', 'yellow'], ['purple', 'purple'], ['cyan', 'cyan'], ['none', 'none']], description: 'Box border colour, or `none`.' },
    { name: 'max_width', kind: 'int', type: 'px', description: 'Word-wrap width in px.' },
    { name: 'to', kind: 'enum', type: 'audience', values: [['all', 'all'], ['active', 'active'], ['coalition', 'coalition']], description: 'Audience: everyone, active player, or active coalition.' },
    { name: 'alliance', kind: 'int', type: '0..5', description: 'Coalition index when `to = "coalition"` (0 red .. 5 cyan).' },
    { name: 'over_panel', kind: 'bool', description: 'Keep drawing while the weapon panel is open.' },
  ],
};

/** Every documented table shape, in the order the tree shows them. */
export const TABLE_DOCS: TableDoc[] = [
  LAUNCH,
  WEAPON_SPEC,
  WEAPON_DATA,
  SPAWN,
  LIGHT_SPEC,
  BRUSH_SPEC,
  FOG_SETTINGS,
  HUD_WINDOW,
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
