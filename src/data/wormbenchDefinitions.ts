import {
  FunctionDef,
  VariableDef,
  EnumDef,
  ClassDef,
} from '../types/wormbench';
import { WORM_STATES } from './wormStates';

export const BUILTIN_VARIABLES: VariableDef[] = [
  {
    name: 'wa.world',
    type: 'table',
    description: 'World state, time, physics queries, and dimensions.',
    scope: 'global',
    example: 'local sz = wa.world.size()',
  },
  {
    name: 'wa.actors',
    type: 'table',
    description: 'Actor spawning, queries, and iteration.',
    scope: 'global',
    example: 'wa.actors.spawn({ sprite = "sprites/blade.png" })',
  },
  {
    name: 'wa.cursor',
    type: 'table',
    description: 'Synchronized land-cursor actor spawning.',
    scope: 'global',
    example: 'wa.cursor.spawn({ owner = worm, on = function(c, ev) ... end })',
  },
  {
    name: 'wa.worms',
    type: 'table',
    description: 'Worm queries and spawning.',
    scope: 'global',
    example: 'local nearest = wa.worms.nearest(a)',
  },
  {
    name: 'wa.weapons',
    type: 'table',
    description: 'Weapon registration, slot overrides, runtime retargeting, and missile launches.',
    scope: 'global',
    example: 'wa.weapons.replace({ weapon = "bazooka", name = "Heavy Bazooka" })',
  },
  {
    name: 'wa.inventory',
    type: 'table',
    description: 'Per-worm virtual inventories and deal/transfer stores.',
    scope: 'global',
    example: 'local store = wa.inventory.create({ id = "my_shop", slots = { "bazooka", "grenade" } })',
  },
  {
    name: 'wa.land',
    type: 'table',
    description: 'Terrain raycasting, solid checks, cutting, and stamping.',
    scope: 'global',
    example: 'local hit = wa.land.trace(x0, y0, x1, y1)',
  },
  {
    name: 'wa.sprites',
    type: 'table',
    description: 'Namespaced sprite key lookup for mod assets.',
    scope: 'global',
    example: 'local key = wa.sprites.key("sprites/saw.png")',
  },
  {
    name: 'wa.sound',
    type: 'table',
    description: 'Sound playback: spatial WAV effects, stock voices, and global ambient sounds.',
    scope: 'global',
    example: 'wa.sound.play(worm, "sounds/boom.wav")',
  },
  {
    name: 'wa.draw',
    type: 'table',
    description: 'Direct3D 9 world-space quads, brushes, ribbons, trails, and weather layers inside wa.on.draw.',
    scope: 'global',
    example: 'wa.draw.quad({ points = { ... }, blend = "add" })',
  },
  {
    name: 'wa.hud',
    type: 'table',
    description: 'HUD text lines, top-centre banners, FPS counter, weapon tray, screen-space drawing, and WA-styled text windows.',
    scope: 'global',
    example: 'wa.hud.message_top("WormBench Active", { to = "all" })',
  },
  {
    name: 'wa.fire',
    type: 'table',
    description: 'Spawns and pushes WA fire entities (Petrol Bomb flames).',
    scope: 'global',
    example: 'wa.fire.spawn({ owner = worm, x = w.x, y = w.y })',
  },
  {
    name: 'wa.perf',
    type: 'table',
    description: 'In-game profiler logging controls (diagnostics builds only).',
    scope: 'global',
    example: 'wa.perf.enable({ profile = true })',
  },
  {
    name: 'wa.on',
    type: 'table',
    description: 'Engine event hooks (hurt, missile_frame, turn_start, death, contact, and more).',
    scope: 'global',
    example: 'wa.on.hurt(function(hit) ... end)',
  },
  {
    name: 'wa.crates',
    type: 'table',
    description: 'Crate spawning, queries, drop style, and round crate odds and shares.',
    scope: 'global',
    example: 'local crates = wa.crates.all()',
  },
  {
    name: 'wa.teams',
    type: 'table',
    description: 'Team surrender action and state.',
    scope: 'global',
    example: 'if not wa.teams.surrendered(2) then wa.teams.surrender(2) end',
  },
  {
    name: 'wa.mines',
    type: 'table',
    description: 'Landmine spawning and queries.',
    scope: 'global',
    example: 'local mine = wa.mines.spawn({ owner = worm, x = worm.x, y = worm.y })',
  },
  {
    name: 'wa.arrows',
    type: 'table',
    description: 'Arrow spawning and queries.',
    scope: 'global',
    example: 'local arrow = wa.arrows.spawn({ owner = worm, x = worm.x, y = worm.y })',
  },
  {
    name: 'wa.missiles',
    type: 'table',
    description: 'Active projectile queries.',
    scope: 'global',
    example: 'local missiles = wa.missiles.all()',
  },
  {
    name: 'wa.oil',
    type: 'table',
    description: 'Oil drum spawning and queries.',
    scope: 'global',
    example: 'local drum = wa.oil.spawn({ x = worm.x, y = worm.y })',
  },
  {
    name: 'wa.magnetism',
    type: 'table',
    description: 'Match-wide magnetic fields shared across all mods, on an actor or at a point, plus force sampling.',
    scope: 'global',
    example: 'local field = wa.magnetism.field({ source = magnet, range = 170 })',
  },
  {
    name: 'wa.graves',
    type: 'table',
    description: 'Gravestone queries and resurrection.',
    scope: 'global',
    example: 'local graves = wa.graves.all()',
  },
  {
    name: 'wa.math',
    type: 'table',
    description: 'Deterministic trig (sin, cos, atan) for lockstep-safe math.',
    scope: 'global',
    example: 'local dx = wa.math.cos(angle)',
  },
  {
    name: 'wa.panel',
    type: 'table',
    description: 'Weapon panel layout, custom replacement panels, mouse input, and stock panel geometry.',
    scope: 'global',
    example: 'local layout = wa.panel.layout()',
  },
  {
    name: 'wa.assets',
    type: 'table',
    description: 'Loads sprites and sounds for a component during install.',
    scope: 'global',
    example: 'wa.assets.load({ sprites = { "sprites/star.png" }, gpu_prefix = "sprites/" })',
  },
  {
    name: 'wa.camera',
    type: 'table',
    description: 'Automatic camera follow rules and per-frame look requests. Presentation only; the simulation never reads it.',
    scope: 'global',
    example: 'wa.camera.follow("owned")',
  },
  {
    name: 'wa.music',
    type: 'table',
    description: 'Soundtrack pitch and tempo controls. Presentation only; write-only.',
    scope: 'global',
    example: 'wa.music.set_pitch(0.5)',
  },
  {
    name: 'wa.view',
    type: 'table',
    description: 'Per-machine screen effects: world-space ripples and disabling zoom. Presentation only.',
    scope: 'global',
    example: 'local r = wa.view.ripple({ x = 100, y = 200 })',
  },
  {
    name: 'wa.hud.tray',
    type: 'table',
    description: 'HUD weapon tray at the top right. Call wa.hud.tray.add to show a weapon or short label.',
    scope: 'global',
    example: 'local entry = wa.hud.tray.add({ weapon = "px.javelin", team = 1 })',
  },
  {
    name: 'wa.hud.utilities',
    type: 'table',
    description: 'Stock utility tray above the wind bar. Call wa.hud.utilities.add to show a weapon icon.',
    scope: 'global',
    example: 'local entry = wa.hud.utilities.add({ weapon = "stock.low_gravity", team = 1 })',
  },
  {
    name: 'wa.fog',
    type: 'table',
    description: 'Fog of war settings, visibility queries, and free lights. Writing requires [fog] in mod.toml; any mod can read.',
    scope: 'global',
    example: 'wa.fog.visible(x, y)',
  },
  {
    name: 'wa.depth',
    type: 'table',
    description: 'Named draw depths (lower is nearer). Plain numbers, so wa.depth.OBJECTS - 1 draws just in front of objects.',
    scope: 'global',
    example: 'wa.draw.quad({ points = pts, depth = wa.depth.OBJECTS })',
  },
  {
    name: 'wa.msg',
    type: 'table',
    description: 'Lockstep simulation and entity lifecycle message IDs.',
    scope: 'global',
    example: 'if msg == wa.msg.FRAME_FINISH then ... end',
  },
  {
    name: 'wa.msg.FRAME_FINISH',
    type: 'int (2)',
    description: 'Per-frame simulation tick message (0x02).',
    scope: 'global',
    example: 'if msg == wa.msg.FRAME_FINISH then ... end',
  },
  {
    name: 'wa.msg.EXPLOSION',
    type: 'int (28)',
    description: 'Blast damage and crater explosion event (0x1C).',
    scope: 'global',
    example: 'if msg == wa.msg.EXPLOSION then return "eat" end',
  },
  {
    name: 'wa.msg.JUMP',
    type: 'int (36)',
    description: 'Forward jump message (Enter key / 0x24).',
    scope: 'global',
    example: 'if msg == wa.msg.JUMP then return "eat" end',
  },
  {
    name: 'wa.msg.JUMP_UP',
    type: 'int (37)',
    description: 'Vertical backflip jump message (Backspace key / 0x25).',
    scope: 'global',
    example: 'if msg == wa.msg.JUMP_UP then return "eat" end',
  },
  {
    name: 'wa.msg.FIRE_WEAPON',
    type: 'int (38)',
    description: 'Space down / charge begin message (0x26).',
    scope: 'global',
    example: 'if msg == wa.msg.FIRE_WEAPON then ... end',
  },
  {
    name: 'wa.msg.RELEASE_WEAPON',
    type: 'int (39)',
    description: 'Space up / weapon release message (0x27).',
    scope: 'global',
    example: 'if msg == wa.msg.RELEASE_WEAPON then ... end',
  },
  {
    name: 'wa.msg.START_TURN',
    type: 'int (52)',
    description: 'Turn start message (0x34); also runs when Tab selects another worm.',
    scope: 'global',
    example: 'if msg == wa.msg.START_TURN then ... end',
  },
  {
    name: 'wa.msg.TURN_STARTED',
    type: 'int (56)',
    description: 'Team-turn start after the worm gains control (0x38). Unlike START_TURN, Tab worm selection doesn\'t fire it.',
    scope: 'global',
    example: 'if msg == wa.msg.TURN_STARTED then ... end',
  },
  {
    name: 'wa.msg.WEAPON_RELEASED',
    type: 'int (73)',
    description: 'Native launch notification (0x49), fired before an ordinary shot finishes; not an after-fire hook for every weapon.',
    scope: 'global',
    example: 'if msg == wa.msg.WEAPON_RELEASED then ... end',
  },
  {
    name: 'wa.msg.NONLETHAL',
    type: 'int (59)',
    description: 'Damage that floors at 1 HP (0x3B).',
    scope: 'global',
    example: 'if msg == wa.msg.NONLETHAL then ... end',
  },
  {
    name: 'wa.msg.POISON',
    type: 'int (62)',
    description: 'Poison damage tick (0x3E).',
    scope: 'global',
    example: 'if msg == wa.msg.POISON then ... end',
  },
  {
    name: 'wa.msg.HIT',
    type: 'int (75)',
    description: 'Impact or direct damage message (0x4B).',
    scope: 'global',
    example: 'if msg == wa.msg.HIT then hit.amount = 10 end',
  },
  {
    name: 'wa.msg.IMPACT',
    type: 'int (118)',
    description: 'Physical collision without health subtraction (0x76).',
    scope: 'global',
    example: 'if msg == wa.msg.IMPACT then ... end',
  },
];

export const BUILTIN_ENUMERATIONS: EnumDef[] = [
  {
    name: 'wa.msg',
    description: 'Lockstep simulation and entity lifecycle message IDs.',
    values: [
      { name: 'FRAME_FINISH', value: 2, description: 'Per-frame simulation tick (0x02)' },
      { name: 'EXPLOSION', value: 28, description: 'Explosion blast damage event (0x1C)' },
      { name: 'JUMP', value: 36, description: 'Forward jump (Enter key / 0x24)' },
      { name: 'JUMP_UP', value: 37, description: 'Backflip jump (Backspace key / 0x25)' },
      { name: 'FIRE_WEAPON', value: 38, description: 'Space down / charge begin (0x26)' },
      { name: 'RELEASE_WEAPON', value: 39, description: 'Space up / weapon release (0x27)' },
      { name: 'START_TURN', value: 52, description: 'Turn start message (0x34); also runs when Tab selects another worm.' },
      { name: 'TURN_STARTED', value: 56, description: 'Team-turn start after the worm gains control (0x38).' },
      { name: 'WEAPON_RELEASED', value: 73, description: 'Native launch notification (0x49), before an ordinary shot finishes.' },
      { name: 'NONLETHAL', value: 59, description: 'Damage that floors at 1 HP (0x3B)' },
      { name: 'POISON', value: 62, description: 'Poison damage tick (0x3E)' },
      { name: 'HIT', value: 75, description: 'Impact or direct damage (0x4B)' },
      { name: 'IMPACT', value: 118, description: 'Impact collision without health loss (0x76)' },
    ],
  },
  {
    name: 'wa.depth',
    description:
      'Named draw depths (lower draws nearer). Plain numbers, so `wa.depth.OBJECTS - 1` draws just in front of objects.',
    values: [
      { name: 'FRONT', value: 65536, description: '0x10000: nearest layer, in front of everything.' },
      { name: 'EFFECTS', value: 786432, description: '0xC0000: transient effects.' },
      { name: 'WORMS', value: 851968, description: '0xD0000: worms.' },
      { name: 'OBJECTS', value: 917504, description: '0xE0000: objects and actors.' },
      { name: 'TERRAIN', value: 1572864, description: '0x180000: terrain layer.' },
      { name: 'BEHIND_TERRAIN', value: 1638400, description: '0x190000: furthest layer, behind the terrain.' },
    ],
  },
  {
    name: 'WorldHandle.kind',
    description:
      'Values returned by `handle.kind`. Mines, oil drums, crates, and graves all share WorldHandle and are distinguished at runtime by this string.',
    values: [
      { name: 'none', value: 'none', description: 'Null handle (0) or freed object.' },
      { name: 'mine', value: 'mine', description: 'Proximity mine.' },
      { name: 'missile', value: 'missile', description: 'Projectile in flight.' },
      { name: 'crate', value: 'crate', description: 'Supply crate.' },
      { name: 'worm', value: 'worm', description: 'Live worm.' },
      { name: 'oil', value: 'oil', description: 'Oil drum.' },
      { name: 'grave', value: 'grave', description: 'Gravestone.' },
      { name: 'arrow', value: 'arrow', description: 'Arrow in flight.' },
      { name: 'land', value: 'land', description: 'Terrain, not a destructible object.' },
      { name: 'object', value: 'object', description: 'Catch-all for any other world object.' },
    ],
  },
  {
    name: 'WormEntity.state_label',
    description:
      'Debug labels returned by `worm.state_label` (32 entries). Don\'t use this list to validate `worm:set_state(...)`, which only accepts the 5 settable states.',
    values: WORM_STATES.map((s) => ({
      name: s.name,
      value: s.name,
      description: s.confirmed
        ? `WA 3.8.1 state 0x${s.id.toString(16).toUpperCase()}.`
        : `WA 3.8.1 state 0x${s.id.toString(16).toUpperCase()} (unconfirmed; verify before relying on it).`,
    })),
  },
];

export const BUILTIN_FUNCTIONS: FunctionDef[] = [
  {
    name: 'require',
    namespace: 'global',
    parameters: [
      {
        name: 'name',
        type: 'string',
        description: 'Mod-local module name, or a wf-lib/... export name',
      },
    ],
    returnType: 'any',
    description:
      'Loads a module from this mod (`require("lib/util")` -> `lib/util.lua`) or a shared export from a direct dependency (`require("wf-lib/effects/trail")`). Cached per consuming mod; circular requires error. `wa` is restricted while a component and its modules load.',
    example: 'local util = require("lib/util")',
    scope: 'global',
  },
  {
    name: 'wa.log',
    parameters: [{ name: 'message', type: 'string', description: 'Message to write to the console and wkLua.log' }],
    returnType: 'void',
    description: 'Writes a message to the WormBench logger and console.',
    example: 'wa.log("Mod loaded")',
  },
  {
    name: 'wa.random',
    parameters: [
      { name: 'min', type: 'int', optional: true, description: 'Inclusive lower bound, or upper bound when one argument is passed' },
      { name: 'max', type: 'int', optional: true, description: 'Inclusive upper bound' },
    ],
    returnType: 'int',
    description: 'Returns a deterministic pseudo-random integer using WA\'s shared RNG. Use this instead of math.random for lockstep multiplayer.',
    example: 'local roll = wa.random(1, 6)',
  },
  {
    name: 'wa.sorted',
    parameters: [{ name: 'tbl', type: 'table', description: 'Key-value table to sort' }],
    returnType: 'table',
    description: 'Returns a deterministically sorted array of keys so iteration order matches across peers.',
    example: 'for _, k in ipairs(wa.sorted(tbl)) do ... end',
  },
  {
    name: 'wa.world.size',
    parameters: [],
    returnType: 'table',
    description: 'Returns landscape dimensions: `{ w = width_px, h = height_px }`.',
    example: 'local sz = wa.world.size()\nwa.log("Map width: " .. sz.w)',
  },
  {
    name: 'wa.world.view',
    parameters: [],
    returnType: 'table',
    description: 'Returns camera centre, screen size, and local zoom: `{ cx, cy, w, h, zoom }` (1 = unzoomed; visible world area is w/zoom by h/zoom). Zoom differs per player, so use it for drawing only. Inside `wa.on.draw` or `wa.on.hud` only.',
    example: 'local v = wa.world.view()',
  },
  {
    name: 'wa.world.sky',
    parameters: [],
    returnType: 'number',
    description: 'Returns the sky drop height in px (-208). Safe in any callback.',
    example: 'a.y = wa.world.sky()',
  },
  {
    name: 'wa.world.pointer',
    parameters: [],
    returnType: 'table',
    description: 'Returns the synchronized world pointer in px: `{ x, y, down }`.',
    example: 'local p = wa.world.pointer()\nif p.down then ... end',
  },
  {
    name: 'wa.world.keys',
    parameters: [],
    returnType: 'table',
    description: 'Returns the synchronized key state: `{ left, right, up, down, jump, shift, q, space, ctrl, plus_key, minus_key, alt, pause_key, tab, digit }`. All keys read false while chat or the Esc menu is open, or when WA doesn\'t have focus.',
    example: 'local k = wa.world.keys()\nif k.q then ... end',
  },
  {
    name: 'wa.world.cavern',
    parameters: [],
    returnType: 'bool',
    description: 'Returns true if the current map is a cavern with an indestructible ceiling.',
    example: 'if wa.world.cavern() then ... end',
  },
  {
    name: 'wa.world.water',
    parameters: [],
    returnType: 'int',
    description: 'Returns the water level in px.',
    example: 'local water_y = wa.world.water()',
  },
  {
    name: 'wa.world.networked',
    parameters: [],
    returnType: 'bool',
    description: 'Returns true during an online multiplayer match.',
    example: 'if wa.world.networked() then wa.log("Online match active") end',
  },
  {
    name: 'wa.world.retreat',
    parameters: [],
    returnType: 'int',
    description: 'Returns retreat timer remaining in ms (0 before retreat starts). Pairs with wa.world.set_retreat().',
    example: 'local ms = wa.world.retreat()',
  },
  {
    name: 'wa.world.set_retreat',
    parameters: [
      { name: 'ms', type: 'int', description: 'Retreat time left in whole ms (0..3600000); 0 ends the retreat' },
    ],
    returnType: 'bool',
    description: 'Changes a running retreat timer and returns whether it applied (simulation callbacks only). Returns false outside a retreat.',
    example: 'if wa.world.set_retreat(5000) then wa.log("retreat extended") end',
  },
  {
    // From the developer's own verb list (wormbench-verbs.md, fork main
    // 2026-10-03): "wa.world.turn_clock(), retreat() -- turn time and retreat
    // time left, in ms". Its neighbour was already here; this one was missing,
    // and both engines flagged it as a typo.
    name: 'wa.world.turn_clock',
    parameters: [],
    returnType: 'int',
    description: 'Returns turn timer remaining in ms (0 before the turn starts).',
    example: 'local ms = wa.world.turn_clock()',
  },
  {
    name: 'wa.world.gravity',
    parameters: [],
    returnType: 'int',
    description: 'Returns base landscape gravity in px/frame² before per-object scaling.',
    example: 'local g = wa.world.gravity()',
  },
  {
    name: 'wa.world.wind',
    parameters: [],
    returnType: 'int',
    description: 'Returns current turn wind force in px/frame² before per-object scaling.',
    example: 'local wind = wa.world.wind()',
  },
  {
    name: 'wa.world.set_gravity',
    parameters: [{ name: 'v', type: 'number', description: 'Gravity in px/frame²' }],
    returnType: 'void',
    description: 'Sets match gravity in px/frame² (simulation callbacks only).',
    example: 'local g = wa.world.gravity()\nwa.world.set_gravity(g * 1.5)',
  },
  {
    name: 'wa.world.set_wind',
    parameters: [{ name: 'v', type: 'number', description: 'Wind force in px/frame²' }],
    returnType: 'void',
    description: 'Sets match wind force in px/frame² (simulation callbacks only).',
    example: 'local w = wa.world.wind()\nwa.world.set_wind(w * 0.5)',
  },
  {
    name: 'wa.world.electrical_nearby',
    parameters: [
      { name: 'x', type: 'number', description: 'Source X in px' },
      { name: 'y', type: 'number', description: 'Source Y in px' },
      { name: 'radius_px', type: 'int', description: 'Detection radius in px (1..1000)' },
      { name: 'include_graves', type: 'bool', description: 'Whether to include gravestones' },
    ],
    returnType: 'table',
    description: 'Finds nearby electrical targets (worms, mines, crates, oil drums, graves) within radius.',
    example: 'local targets = wa.world.electrical_nearby(worm.x, worm.y, 100, true)',
  },
  {
    name: 'wa.world.electrical_trace',
    parameters: [
      { name: 'x0', type: 'number', description: 'Start X in px' },
      { name: 'y0', type: 'number', description: 'Start Y in px' },
      { name: 'x1', type: 'number', description: 'End X in px' },
      { name: 'y1', type: 'number', description: 'End Y in px' },
    ],
    returnType: 'table | nil',
    description: 'Raycasts along a beam against terrain and electrical targets. Returns `{ x, y, obj }` on hit, or nil.',
    example: 'local hit = wa.world.electrical_trace(x0, y0, x1, y1)',
  },
  {
    name: 'wa.magnetism.field',
    parameters: [
      { name: 'spec', type: 'table', description: '{ source = actor } for a field on a live actor, or { x = px, y = px } for a point field; [range = 170], [strength = 14000], [max_force = 12], [softening = 5], [polarity = "repel"], [enabled = true], [native = true] (max 256 per match)' },
    ],
    returnType: 'MagneticField',
    description: 'Registers a match-wide magnetic field on an actor or at a point. Fields sum across all mods and disappear when their source does. Actors opt in with `magnetic = 1`. A point field stays put until `field:move(x, y)`, `field:remove()`, or match end; a source field follows its actor and can\'t be moved. Simulation callbacks only.',
    example: 'local field = wa.magnetism.field({ source = magnet_actor, range = 170, polarity = "repel" })',
  },
  {
    name: 'wa.magnetism.sample',
    parameters: [
      { name: 'x', type: 'number', description: 'Sample X in px' },
      { name: 'y', type: 'number', description: 'Sample Y in px' },
      { name: 'actor', type: 'LuaActor', optional: true, description: 'Actor to sample for; excludes its own fields (simulation callbacks only)' },
    ],
    returnType: 'number, number, bool, bool',
    description: 'Samples combined magnetic force at (x, y) and returns `fx, fy, inside, waking`. Point-only sampling works in HUD/draw callbacks; passing an actor requires a simulation callback.',
    example: 'local fx, fy, inside, waking = wa.magnetism.sample(x, y, actor)',
  },
  {
    name: 'wa.land.solid',
    parameters: [
      { name: 'x', type: 'number', description: 'X coordinate in px' },
      { name: 'y', type: 'number', description: 'Y coordinate in px' },
    ],
    returnType: 'bool',
    description: 'Returns true if (x, y) is solid terrain in the collision mask.',
    example: 'if wa.land.solid(a.x, a.y + 16) then ... end',
  },
  {
    name: 'wa.land.trace',
    parameters: [
      { name: 'x0', type: 'number', description: 'Start X in px' },
      { name: 'y0', type: 'number', description: 'Start Y in px' },
      { name: 'x1', type: 'number', description: 'End X in px' },
      { name: 'y1', type: 'number', description: 'End Y in px' },
    ],
    returnType: 'table | nil',
    description: 'Hitscan raycast across the terrain collision mask. Returns `{ x, y, hit = true, starts_solid = bool, nx, ny, tx, ty }` on hit, or nil.',
    example: 'local hit = wa.land.trace(a.x, a.y, target.x, target.y)',
  },
  // `wa.land.dig` is GONE in WormBench 0.9.1: the engine nils it on purpose
  // (crates/lua-host/src/lib.rs:1279 -- "dig is cut's circle now"), and no file
  // in the new mods tree calls it. wa.land.cut{ shape = "circle" } replaced it.
  {
    name: 'wa.land.cut',
    parameters: [
      { name: 'spec', type: 'table', description: '{ x = int, y = int, shape = "circle" | "drill" | "torch" | "sprite", radius = int (1..200), facing = -1 | 1, angle = number (-1..1), sprite = string, frame = int } (x/y in px; sprite cuts opaque pixels)' },
    ],
    returnType: 'void',
    description: 'Cuts terrain in a circle (radius 1..200), drill shape, blowtorch tunnel (facing ±1, angle -1..1), or sprite mask. Simulation callbacks only.',
    example: 'wa.land.cut({ x = worm.x, y = worm.y, shape = "circle", radius = 24 })',
  },
  {
    name: 'wa.land.stamp',
    parameters: [
      { name: 'spec', type: 'table', description: '{ sprite = string, frame = int, x = int, y = int, buried = { soften = 1..32, blend = "dither" | "mix" }, true_colour = bool | { blend = 0..1 } }' },
    ],
    returnType: 'void',
    description: 'Stamps a mod sprite frame into terrain collision and graphics (simulation callbacks only).',
    example: 'wa.land.stamp({ sprite = "sprites/javelin_stamp.png", frame = 0, x = worm.x, y = worm.y })',
  },
  {
    name: 'wa.worms.all',
    parameters: [{ name: 'args', type: 'table | entity', optional: true, description: '{ near = { x, y, r }, from = entity } (near filters by distance in px; from walks from that entity; a bare entity is treated as from)' }],
    returnType: 'table',
    description: 'Returns all worms in the match. Pass `near` to filter to worms within `r` px of `(x, y)` in the same order.',
    example: 'for _, w in ipairs(wa.worms.all()) do ... end',
  },
  {
    name: 'wa.worms.nearest',
    parameters: [{ name: 'from', type: 'entity', description: 'Source worm, actor, or world object' }],
    returnType: 'WormHandle | nil',
    description: 'Returns the nearest worm to the given entity.',
    example: 'local target = wa.worms.nearest(a)',
  },
  {
    name: 'wa.crates.all',
    parameters: [{ name: 'args', type: 'table | entity', optional: true, description: '{ near = { x, y, r }, from = entity } (near filters by distance in px; from walks from that entity; a bare entity is treated as from)' }],
    returnType: 'table',
    description: 'Returns all active crate objects (WorldHandle) in the world.',
    example: 'for _, crate in ipairs(wa.crates.all()) do ... end',
  },
  {
    name: 'wa.mines.all',
    parameters: [{ name: 'args', type: 'table | entity', optional: true, description: '{ near = { x, y, r }, from = entity } (near filters by distance in px; from walks from that entity; a bare entity is treated as from)' }],
    returnType: 'table',
    description: 'Returns all active landmine objects (WorldHandle) in the world.',
    example: 'for _, mine in ipairs(wa.mines.all()) do\n  mine:arm(1000)\nend',
  },
  {
    name: 'wa.mines.spawn',
    parameters: [
      { name: 'spec', type: 'table', description: '{ owner = <worm|actor|"none">, x, y, vx, vy, fuse, arm, damage, radius, dud_proof, triggered, terrain_keep_speed_pct, on_contact } (x/y in px, speeds in px/frame, fuse/arm in ms, radius in px, terrain_keep_speed_pct 0..1000; owner = "none" spawns a neutral map mine)' },
    ],
    returnType: 'WorldHandle',
    description: 'Spawns a stock mine that WA flies, arms, triggers, and explodes. A worm owner assigns its team; an actor or `owner = "none"` creates a neutral map mine whose blasts credit no team. Simulation callbacks only.',
    example: 'local mine = wa.mines.spawn({ owner = worm, x = worm.x, y = worm.y, fuse = 400, damage = 50 })',
  },
  {
    name: 'wa.missiles.all',
    parameters: [{ name: 'args', type: 'table | entity', optional: true, description: '{ near = { x, y, r }, from = entity } (near filters by distance in px; from walks from that entity; a bare entity is treated as from)' }],
    returnType: 'table',
    description: 'Returns all active in-flight missile objects (WorldHandle) in the world.',
    example: 'for _, m in ipairs(wa.missiles.all()) do ... end',
  },
  {
    name: 'wa.oil.all',
    parameters: [{ name: 'args', type: 'table | entity', optional: true, description: '{ near = { x, y, r }, from = entity } (near filters by distance in px; from walks from that entity; a bare entity is treated as from)' }],
    returnType: 'table',
    description: 'Returns all active oil drum objects (WorldHandle) in the world.',
    example: 'for _, drum in ipairs(wa.oil.all()) do\n  drum:hit(50, 0, 0)\nend',
  },
  {
    name: 'wa.oil.spawn',
    parameters: [
      { name: 'spec', type: 'table', description: '{ x = number, y = number, snap = true } (x/y in px, required; snap drops it onto terrain, false spawns at exact coordinates)' },
    ],
    returnType: 'WorldHandle',
    description: 'Spawns a stock oil drum. Simulation callbacks only.',
    example: 'local drum = wa.oil.spawn({ x = worm.x, y = worm.y, snap = true })',
  },
  {
    name: 'wa.graves.all',
    parameters: [{ name: 'args', type: 'table | entity', optional: true, description: '{ near = { x, y, r }, from = entity } (near filters by distance in px; from walks from that entity; a bare entity is treated as from)' }],
    returnType: 'table',
    description: 'Returns all active gravestone objects (WorldHandle) in the world.',
    example: 'for _, grave in ipairs(wa.graves.all()) do ... end',
  },
  {
    name: 'wa.actors.spawn',
    parameters: [
      { name: 'spec', type: 'table', description: 'Spawn table: body = { physics, shape, hits, hit_by, pushed_by, layer, mask }, sprite, x, y, vx, vy, origin, owner, gravity, damage_terrain, damage_worms, drown, persist, visible, loop, magnetic, cursor, explode, on = { frame, land, hit, touched, contact }' }
    ],
    returnType: 'ActorHandle',
    description: 'Spawns a native WA actor with only the behaviors specified in the spawn table. `body` sets shape, outgoing movement, incoming attackers, push response, collision layer, and stamped mask. `owner` defaults to the callback worm or actor (`"none"` for neutral). `grab` (`true`, `false`, `"worm"`, or `"projectile"`) controls pickup tools. After `a:sleep`, the next frame event includes `ev.slept`. Simulation callbacks only.',
    example: `local a = wa.actors.spawn({
  sprite = "sprites/blade.png",
  origin = "center",
  gravity = 1,
  owner = worm,
  body = { shape = "worm", hits = { land = true }, hit_by = "all" },
  on = function(a, ev)
    a:move({ terrain = true })
  end,
})`,
  },
  {
    name: 'wa.actors.all',
    parameters: [{ name: 'args', type: 'table', optional: true, description: '{ near = { x, y, r } } (filters to actors within r px of (x, y); doesn\'t accept from)' }],
    returnType: 'table',
    description: 'Returns all live actors. Pass `near` to filter to actors within `r` px of `(x, y)` in the same order.',
    example: 'for _, a in ipairs(wa.actors.all()) do ... end',
  },
  {
    name: 'wa.cursor.spawn',
    parameters: [
      { name: 'spec', type: 'table', description: '{ owner = worm, on = function(c, ev) ... end, sprite = "cursor", [x], [y] }' }
    ],
    returnType: 'ActorHandle',
    description: 'Spawns a synchronized cursor actor that follows world pointer coordinates with cursor ease-in.',
    example: 'wa.cursor.spawn({ owner = worm, on = function(c, ev) ... end })',
  },
  {
    name: 'wa.weapons.replace',
    parameters: [
      { name: 'spec', type: 'table', description: 'Weapon claim (id, name, copy_from, panel_icon, icon, hold_as, is_weapon, eat_fire, click_finish, fire_repeat, …) and record groups (fires, handling, missile, clusters, mine, gun, strike, jet_pack, raw). See Tables -> wa.weapons.replace.' }
    ],
    returnType: 'void',
    description: 'Claims the weapon component\'s assigned slot during `install` and configures its record, art, and behavior. Don\'t specify a slot; use the nested record groups instead of flat fields.',
    example: `wa.weapons.replace({
  copy_from = "bazooka",
  name = "Heavy Bazooka",
  missile = {
    explosion = { power = 80, push_pct = 60 },
  },
  panel_icon = "bazooka",
})`,
  },
  {
    name: 'wa.weapons.retarget',
    parameters: [{ name: 'spec', type: 'table', description: '{ weapon, sprite, cluster_sprite } (WA sprite names)' }],
    returnType: 'void',
    description: 'Swaps the flight sprite and cluster sprite of a placed weapon at runtime.',
    example: 'wa.weapons.retarget({ weapon = "bazooka", sprite = "banana" })',
  },
  {
    name: 'wa.weapons.launch',
    parameters: [
      {
        name: 'spec',
        type: 'table',
        description:
          '{ weapon = "stock.bazooka", owner = worm, x = x, y = y, vx = vx, vy = vy, missile = { explosion = { power = 50 }, fuse = 5000, trail = { sprite = 0 }, ... }, clusters = { ... } }. See Tables -> wa.weapons.launch.',
      },
    ],
    returnType: 'int',
    description:
      'Launches a native WA projectile using a weapon slot\'s fire parameters (native wind, trail, and collision). Returns the spawned missile ID.',
    example: `local id = wa.weapons.launch({
  weapon = "stock.bazooka", owner = worm, x = worm.x, y = worm.y - 16, vx = 5, vy = -8,
  missile = { explosion = { power = 60 }, fuse = 5000, trail = { sprite = 0 } },
})`,
  },
  {
    name: 'wa.weapons.fire',
    parameters: [{ name: 'spec', type: 'table', description: '{ weapon = string, worm, x = number, y = number, vx = number, vy = number, ... } (px positions, px/frame speeds; extra fields are passed to on_fire)' }],
    returnType: 'void',
    description: 'Calls a placed weapon\'s `on_fire` handler by ID without wind-up or ammo cost. Extra fields are forwarded to the handler. Simulation callbacks only.',
    example: 'wa.weapons.fire({ weapon = "baseball_bat", worm = worm, x = worm.x, y = worm.y })',
  },
  {
    name: 'wa.weapons.click',
    parameters: [{ name: 'spec', type: 'table', description: '{ weapon = string, worm, x = number, y = number, vx = number, vy = number } (px positions, px/frame speeds)' }],
    returnType: 'void',
    description: 'Calls a placed weapon\'s `on_click` handler by ID. Simulation callbacks only.',
    example: 'wa.weapons.click({ weapon = "sheep_strike", worm = worm, x = worm.x, y = worm.y, vx = 5 })',
  },
  {
    name: 'wa.weapons.notify_grant',
    parameters: [{ name: 'spec', type: 'table', description: '{ worm, items = { { weapon = string, amount = int }, ... }, x = number, y = number } (x/y optional, px)' }],
    returnType: 'void',
    description: 'Emits a `weapon_grant` event for weapons granted by script without changing ammo (simulation callbacks only).',
    example: 'wa.weapons.notify_grant({ worm = worm, items = { { weapon = "grenade", amount = 2 } } })',
  },
  {
    name: 'wa.sprites.key',
    parameters: [{ name: 'relative', type: 'string', description: 'Mod-relative sprite path' }],
    returnType: 'string',
    description: 'Returns a namespaced sprite key (`mod_id:path`) for `a:look` or `spawn.sprite`.',
    example: 'a:look(wa.sprites.key("sprites/saw.png"))',
  },
  {
    name: 'wa.sound.play',
    parameters: [
      { name: 'target', type: 'entity', description: 'WormHandle, ActorHandle, or WorldHandle' },
      { name: 'id', type: 'int | string', description: 'Stock sound ID, mod WAV path, or soundbank/<Bank>/<Line>' },
      { name: 'opts', type: 'int | table', optional: true, description: 'Playback flags (default 8), or { flags, pitch } (pitch -24..24 semitones, stock sounds only)' },
    ],
    returnType: 'void',
    description: 'Plays a sound at a worm, actor, or object. Accepts a mod WAV path, a stock sound ID, or a declared `soundbank/<Bank>/<Line>`. Stock sounds support `{ pitch = semitones }` (-24..24); mod WAVs don\'t.',
    example: 'wa.sound.play(worm, "soundbank/Kamikaze/Collect")',
  },
  {
    name: 'wa.sound.ambient',
    parameters: [
      { name: 'spec', type: 'table', description: '{ path, volume = 1, fade_ms = 0, loop = true } (mod WAV path; volume 0..1; fade_ms 0..60000)' },
    ],
    returnType: 'AmbientHandle',
    description: 'Plays a global mod WAV with no position, pan, or distance attenuation. Loops by default and fades in over `fade_ms`. Max 8 at once (a 9th stops the oldest); stops at match end. Presentation only; safe in any callback.',
    example: 'local h = wa.sound.ambient({ path = "sounds/rain.wav", volume = 0.6 })',
  },
  {
    name: 'wa.draw.quad',
    parameters: [
      { name: 'spec', type: 'table', description: '{ points = { {x, y}, {x, y}, {x, y}, {x, y} }, color = 0xAARRGGBB | colors = { c1, c2, c3, c4 }, sprite = "name", frame = int, blend = "alpha"|"add", depth = int, uv = { u0, v0, u1, v1 }, visibility = worm }' }
    ],
    returnType: 'void',
    description: 'Draws a world-space GPU quad inside `wa.on.draw`.',
    example: 'wa.draw.quad({ points = { {x1, y1}, {x2, y2}, {x3, y3}, {x4, y4} }, sprite = "laser", blend = "add" })',
  },
  {
    name: 'wa.draw.ribbon',
    parameters: [
      { name: 'spec', type: 'table', description: '{ points = { { x, y, width, color, u }, ... }, sprite = "name", frame = int, blend = "alpha"|"add", depth = int, visibility = worm }' }
    ],
    returnType: 'void',
    description: 'Draws a continuous textured GPU ribbon with miter joints inside `wa.on.draw`.',
    example: 'wa.draw.ribbon({ points = beam_points, sprite = "beam.png", blend = "add" })',
  },
  {
    name: 'wa.draw.random',
    parameters: [],
    returnType: 'float',
    description: 'Returns a client-local random float in `[0.0, 1.0)` for visual effects inside `wa.on.draw`. Doesn\'t advance the lockstep RNG.',
    example: 'local jitter = (wa.draw.random() - 0.5) * 4',
  },
  {
    name: 'wa.draw.fraction',
    parameters: [],
    returnType: 'float',
    description: 'Returns the render interpolation fraction (0..1) past the last simulation frame. Inside `wa.on.draw` only. Use it to interpolate custom-tracked bodies between simulation ticks.',
    example: 'local t = wa.draw.fraction()\nlocal x = c.x + c.vx * t',
  },
  {
    name: 'wa.draw.tiles',
    parameters: [
      { name: 'spec', type: 'table', description: '{ sprite, frame, thin, depth, blend, size, x, y, slant, color, view, from, fade, to } (size >= 1 px; view is a world rect; frame -1 skips drawing)' }
    ],
    returnType: 'void',
    description: 'Draws a slanted grid of square tiles (`size` px wide) across `view`, anchored at `(x, y)` with `slant` px horizontal shift per vertical px. One tile in `thin` shows `frame - 1`. Clips to `[from, to]` and fades in over `fade` px below `from`. Inside `wa.on.draw` only.',
    example: 'wa.draw.tiles({ sprite = "sprites/rain", size = 8, x = 0, y = -40, slant = 2, view = view })',
  },
  {
    name: 'wa.draw.flakes',
    parameters: [
      { name: 'spec', type: 'table', description: '{ sprite, frames = { a, b }, depth, blend, cell, size, sway, alpha, x, y, drift, fall, classes = { factors }, seed, keep, now, view, from, fade } (cell/size in px; alpha 0..255; keep out of 65536)' }
    ],
    returnType: 'void',
    description: 'Draws deterministic scattered flakes over `view`, with one grid layer per factor in `classes` (`cell` px per cell). A cell spawns a flake when its hash is under `keep` (out of 65536), using the hash for offset, sway, size, alpha, and frame choice. Fades in over `fade` px below `from`. Inside `wa.on.draw` only.',
    example: 'wa.draw.flakes({ sprite = "sprites/snow", frames = { 0, 1 }, cell = 24, size = 3, view = view })',
  },
  {
    name: 'wa.draw.puffs',
    parameters: [
      { name: 'spec', type: 'table', description: '{ sprite, frame, depth, blend, y, rows, spacing, gap, drift, now, color, alpha, view } (spacing >= 1 px; alpha 0..1)' }
    ],
    returnType: 'void',
    description: 'Draws a band of cloud puffs across `view`: `rows` rows spaced `gap` px apart from `y`, with puffs `spacing` px apart along each row, tinted by `color` (`0xRRGGBB`) up to `alpha`. Inside `wa.on.draw` only.',
    example: 'wa.draw.puffs({ sprite = "sprites/cloud", rows = 3, y = 20, spacing = 120, gap = 40, view = view })',
  },
  {
    name: 'wa.hud.line',
    parameters: [
      { name: 'text', type: 'string', description: 'Text up to 1023 bytes; `\\n` starts a new line, and long lines wrap at spaces' },
      { name: 'opts', type: 'table', optional: true, description: '{ font = "standard", color = "white" } (font: small, standard, medium; color: white, grey, red, blue, green, yellow, purple, cyan)' },
    ],
    returnType: 'void',
    description: 'Writes a stacked HUD line on the top-left of the screen (below the chat bar). Inside `wa.on.hud` only; presentation only, requires Direct3D 9.',
    example: 'wa.hud.line("Score: " .. score, { font = "medium", color = "yellow" })',
  },
  {
    name: 'wa.hud.size',
    parameters: [],
    returnType: 'int, int',
    description: 'Returns screen width and height in px (`0, 0` before the first frame). Inside `wa.on.hud` or `wa.on.draw` only.',
    example: 'local w, h = wa.hud.size()',
  },
  {
    name: 'wa.hud.key',
    parameters: [{ name: 'name', type: 'string', description: 'Letter a..z, digit 0..9, shift, ctrl, alt, or tab' }],
    returnType: 'bool',
    description: 'Returns whether the key is held on the local keyboard. Not synchronized; use for local display only. Returns false while chat or the Esc menu is open, or when WA doesn\'t have focus. Inside `wa.on.hud` only.',
    example: 'local held = wa.hud.key("t")',
  },
  {
    name: 'wa.hud.sprite',
    parameters: [
      { name: 'spec', type: 'table', description: '{ sprite, frame = 0, x, y, part = { x, y, w, h }, color = 0xFFFFFFFF } (screen px; part clips from the frame top-left)' }
    ],
    returnType: 'void',
    description: 'Draws a GPU sprite frame at 1:1 on the screen with its top-left at `(x, y)`, optionally clipped to `part`. Inside `wa.on.hud` only (max 4096 HUD draws per frame across all mods).',
    example: 'wa.hud.sprite({ sprite = "sprites/icon", x = 8, y = 8 })',
  },
  {
    name: 'wa.hud.rect',
    parameters: [
      { name: 'spec', type: 'table', description: '{ x, y, w, h, color = 0xFFFFFFFF } (screen px)' }
    ],
    returnType: 'void',
    description: 'Draws a filled screen-space rectangle. Inside `wa.on.hud` only.',
    example: 'wa.hud.rect({ x = 0, y = 0, w = 120, h = 24, color = 0x80000000 })',
  },
  {
    name: 'wa.hud.text',
    parameters: [
      { name: 'spec', type: 'table', description: '{ text, x, y, font = "standard", color = "white", align = "left" } (max 255 bytes; `\\n` starts a new line; font: small, standard, medium; align: left, center, right)' }
    ],
    returnType: 'void',
    description: 'Draws screen-space text in a WA font. `x` is the left, center, or right edge based on `align`, and `y` is the top. Inside `wa.on.hud` only.',
    example: 'wa.hud.text({ text = "Turn 3", x = 8, y = 8, font = "medium" })',
  },
  {
    name: 'wa.hud.message_top',
    parameters: [
      { name: 'text', type: 'string', description: 'One line, max 127 bytes' },
      { name: 'opts', type: 'table', optional: true, description: '{ to = "all" | "active" | "coalition", alliance = int }' },
    ],
    returnType: 'void',
    description: 'Shows the top-centre banner (max 127 bytes). `to` is `"all"` (default), `"active"` (active player), or `"coalition"` (active team or `alliance` 0..5). Call from simulation events.',
    example: 'wa.hud.message_top("WormBench", { to = "all" })',
  },
  {
    name: 'wa.hud.window',
    parameters: [
      { name: 'spec', type: 'table', description: '{ text | lines, x, y, align, font, color, border, max_width, to, alliance, over_panel }' },
    ],
    returnType: 'WindowHandle',
    description: 'Opens a WA-styled text window sized to its content until closed or match end. Supports `text` (with `\\n`) or `lines = { "a", { "b", color = "yellow" } }`, `font` (`small`, `standard`, `medium`), `color`/`border` (or `"none"`), `max_width` word wrap, `align` (`top_left`..`bottom_right`, `center`), and `to`/`alliance`. Fades out while the weapon panel is open unless `over_panel = true`. Requires Direct3D 9 shaders; max 32 open.',
    example: 'local window = wa.hud.window({ text = "Turn 3", x = 10, y = 10, align = "top_left" })',
  },
  {
    name: 'wa.camera.follow',
    parameters: [
      { name: 'rule', type: 'string', optional: true, description: '"all" (stock behavior) or "owned" (ignore requests from sides this viewer doesn\'t own)' },
      { name: 'opts', type: 'table', optional: true, description: '{ public = bool } (with "owned", also ignore neutral requests when public = false)' },
    ],
    returnType: 'string, bool',
    description: 'Sets or reads the automatic camera follow rule. With no arguments, returns the current rule and whether neutral objects still move the camera. Presentation only; safe in any callback.',
    example: 'wa.camera.follow("owned", { public = false })',
  },
  {
    name: 'wa.camera.look',
    parameters: [
      { name: 'x', type: 'number', description: 'World X in px' },
      { name: 'y', type: 'number', description: 'World Y in px' },
      { name: 'opts', type: 'table', optional: true, description: '{ priority = 0..13, fixed = bool, owner = <worm|actor|object> }' },
    ],
    returnType: 'void',
    description: 'Requests the camera at `(x, y)` for the current frame. Call every frame to hold focus. `fixed = true` locks to the point; `owner` tags the request for `wa.camera.follow`. Simulation callbacks only.',
    example: 'wa.camera.look(target.x, target.y, { priority = 2, owner = worm })',
  },
  {
    name: 'wa.fire.spawn',
    parameters: [
      { name: 'spec', type: 'table', description: '{ owner = <worm|actor>, x = number, y = number, [vx], [vy], [count], [duration], [up_power], [damage], [damage_scale], [knock_scale], [tint = 0xRRGGBB] } (x/y in px, required; duration in ms; up_power native int; omitted fields use WA defaults)' }
    ],
    returnType: 'void',
    description: 'Spawns stock fire entities (like Petrol Bomb flames). `owner` must be a worm or actor. Simulation callbacks only.',
    example: 'wa.fire.spawn({ owner = worm, x = target.x, y = target.y, damage = 20 })',
  },
  {
    name: 'wa.fire.repel',
    parameters: [
      { name: 'spec', type: 'table', description: '{ x, y, radius, power } (x/y and radius in px, radius 1..8192, power 0..1000; all fields required)' },
    ],
    returnType: 'int',
    description: 'Pushes active WA flames within a circle using WA\'s flame blast response without creating a blast, sound, crater, or damage. Returns the number of flames affected. Simulation callbacks only.',
    example: 'local moved = wa.fire.repel({ x = x, y = y, radius = 80, power = 40 })',
  },
  {
    name: 'wa.perf.enable',
    parameters: [
      { name: 'opts', type: 'table', optional: true, description: '{ profile = bool, packs = bool, spikes = bool, natives = bool, every = 1..60 } (every is seconds between reports)' }
    ],
    returnType: 'void',
    description: 'Enables profiler reports in `wkLua.log` (diagnostics builds only).',
    example: 'wa.perf.enable({ profile = true })',
  },
  {
    name: 'wa.inventory.create',
    parameters: [
      { name: 'spec', type: 'table', description: '{ id = "store_id", slots = { "bazooka", "grenade", ... } }' }
    ],
    returnType: 'InventoryStore',
    description: 'Creates a mod-scoped virtual inventory store keyed by worm ID for classes, drafting, and Highlander rules.',
    example: 'local inv = wa.inventory.create({ id = "loot", slots = { "bazooka", "grenade" } })',
  },
  {
    name: 'wa.on.skim',
    parameters: [{ name: 'callback', type: 'function', description: 'function(event) - event.worm is the worm that skimmed across water' }],
    returnType: 'void',
    description: 'Fires when a worm skims across water.',
    example: 'wa.on.skim(function(event)\n  wa.log(event.worm.id)\nend)',
  },
  {
    name: 'wa.on.frame',
    parameters: [{ name: 'callback', type: 'function', description: 'function() - runs once per simulation frame after WA updates' }],
    returnType: 'void',
    description: 'Runs once per simulation frame after all bodies and actors update. Takes no arguments; use `wa.world.frame()` for the frame count. Has no implicit owner, so spawns must set `owner` (`"none"` for neutral).',
    example: 'wa.on.frame(function()\n  wa.log("frame " .. wa.world.frame())\nend)',
  },
  {
    name: 'wa.on.turn_retreat',
    parameters: [{ name: 'callback', type: 'function', description: 'function(event) - event.worm / event.active is the active worm, or {} if gone' }],
    returnType: 'void',
    description: 'Fires when the active worm starts retreating.',
    example: 'wa.on.turn_retreat(function(event)\n  -- event.worm used its retreat\nend)',
  },
  {
    name: 'wa.on.turn_end',
    parameters: [{ name: 'callback', type: 'function', description: 'function(event) - event.worm / event.active is the active worm, or {} if gone' }],
    returnType: 'void',
    description: 'Fires on the frame a turn ends (after retreat), before WA waits for objects to settle. Also fires if the active worm is already gone. Switching worms with Tab or Select Worm doesn\'t fire it.',
    example: 'wa.on.turn_end(function(event)\n  if event.worm then -- turn is over\n  end\nend)',
  },
  {
    name: 'wa.on.turn_cleanup',
    parameters: [{ name: 'callback', type: 'function', description: 'function(event) - event.worm / event.active is the active worm during cleanup' }],
    returnType: 'void',
    description: 'Fires during turn cleanup after `turn_end` for end-of-turn bookkeeping.',
    example: 'wa.on.turn_cleanup(function(event)\n  -- safe to reset per-turn state\nend)',
  },
  {
    name: 'wa.on.missile_frame',
    parameters: [
      { name: 'callback', type: 'function', description: 'function(m) - m has id, weapon, sprite, collision_mask, msg, phase; x/y in px, vx/vy in px/frame, damp/wind_scale/gravity_scale (1.0 = normal)' },
      { name: 'opts', type: 'table', optional: true, description: '{ weapons = { weapon ids }, phase = "pre" | "post" } (filter by weapon ID and/or phase)' },
    ],
    returnType: 'void',
    description: 'Runs every frame for active projectiles. Lets you read/write physics or change `m.sprite` (`0` hides it). Pass `opts` to skip Lua calls for other missiles. `m.id` is unique and consistent across peers; `m.weapon` is the firing weapon ID.',
    example: 'wa.on.missile_frame(function(m)\n  if m.weapon == "chilli_bomb" then m.sprite = 0 end\nend, { weapons = { "px.chilli_bomb" }, phase = "post" })',
  },
  {
    name: 'wa.on.worm_message',
    parameters: [
      { name: 'callback', type: 'function', description: 'function(worm, msg) - return "eat" to swallow the message' },
      { name: 'opts', type: 'table', optional: true, description: '{ msgs = { wa.msg.FRAME_FINISH, wa.msg.JUMP } } (only enter Lua for listed messages)' },
    ],
    returnType: 'void',
    description: 'Intercepts worm lockstep messages. Return `"eat"` to swallow a message. Pass `opts.msgs` to filter before entering Lua, avoiding per-frame overhead on ignored messages. Filtered and unfiltered handlers still run in registration order.',
    example: 'wa.on.worm_message(function(worm, msg)\n  if msg == wa.msg.JUMP then return "eat" end\nend, { msgs = { wa.msg.JUMP } })',
  },
  {
    name: 'wa.on.hurt',
    parameters: [{ name: 'callback', type: 'function', description: 'function(hit) - hit has worm, attacker, attacker_team, by, weapon, source_weapon, slot, kind, amount, lost, hp, phase, power, damage, expected, x, y, vx, vy' }],
    returnType: 'void',
    description: 'Fires on every damage message reaching a worm (`hit.kind` is `"blast"`, a hit kind, `"nonlethal"`, or `"poison"`). Runs in `"pre"` (can edit `amount`/`damage` or return `"eat"`) and `"post"` (with `hit.lost`). For blasts, editing `amount` changes power for this worm; setting `damage` in `"pre"` overrides health loss while keeping stock knockback. `hit.expected` is WA\'s predicted damage.',
    example: 'wa.on.hurt(function(hit)\n  if hit.phase == "pre" and hit.kind == "blast" then return "eat" end\nend)',
  },
  {
    name: 'wa.on.turn_start',
    parameters: [{ name: 'callback', type: 'function', description: 'function(event) - event.worm is the active WormHandle' }],
    returnType: 'void',
    description: 'Fires with the active worm when a turn starts (`START_TURN`).',
    example: 'wa.on.turn_start(function(event)\n  wa.log("Turn started for " .. tostring(event.worm.id))\nend)',
  },
  {
    name: 'wa.on.death',
    parameters: [{ name: 'callback', type: 'function', description: 'function(event) - event.victim, event.attacker, event.attacker_team, event.weapon, event.kind' }],
    returnType: 'void',
    description: 'Fires once per worm death with victim, attacker, team, weapon, and damage kind.',
    example: 'wa.on.death(function(event)\n  if event.attacker then wa.log("Worm killed by attacker " .. tostring(event.attacker.id)) end\nend)',
  },
  {
    name: 'wa.on.hud',
    parameters: [{ name: 'callback', type: 'function', description: 'function() called once per rendered frame for HUD drawing' }],
    returnType: 'void',
    description: 'Runs once per rendered frame during the HUD pass for `wa.hud.*` drawing.',
    example: 'wa.on.hud(function()\n  wa.hud.line("Game Active", { font = "medium" })\nend)',
  },
  {
    name: 'wa.on.draw',
    parameters: [{ name: 'callback', type: 'function', description: 'function() called once per rendered frame after simulation' }],
    returnType: 'void',
    description: 'Runs once per rendered frame to draw world-space GPU quads, brushes, ribbons, trails, and weather layers. `wa.random` is forbidden here.',
    example: 'wa.on.draw(function()\n  wa.draw.quad({ points = { ... }, blend = "add" })\nend)',
  },
  {
    name: 'wa.on.oil_explode',
    parameters: [{ name: 'callback', type: 'function', description: 'function(ev) - ev.drum is the WorldHandle, ev.x/ev.y in px, ev.team is the triggering team (0 = none), ev:replace() skips stock blast, fire, and sound' }],
    returnType: 'void',
    description: 'Fires in the simulation when an oil drum is about to explode. Call `ev:replace()` to suppress the stock blast, flames, and sound; WA still frees the drum.',
    example: 'wa.on.oil_explode(function(ev)\n  if ev.team == 3 then ev:replace() end\nend)',
  },
  {
    name: 'wa.on.arrow_land',
    parameters: [{ name: 'callback', type: 'function', description: 'function(ev) - ev.arrow is the WorldHandle, ev.x/ev.y in px, ev.frame is the sprite 46 frame stamped, ev.weapon is the weapon ID (nil for wa.arrows.spawn)' }],
    returnType: 'void',
    description: 'Fires in the simulation right after WA stamps a landed arrow into terrain, before freeing the arrow.',
    example: 'wa.on.arrow_land(function(ev)\n  wa.log("arrow at " .. ev.x .. ", " .. ev.y)\nend)',
  },
  {
    name: 'wa.on.contact',
    parameters: [{ name: 'callback', type: 'function', description: 'function(worm, other, c) - c.vx and c.vy are px/frame pre-impact speeds' }],
    returnType: 'void',
    description: 'Fires on worm-entity contact after a simulation frame. `c.vx`/`c.vy` hold pre-impact velocity (px/frame) and `c.flags` holds WA contact bits.',
    example: 'wa.on.contact(function(worm, other, c)\n  wa.log("Contact with speed " .. tostring(c.vx))\nend)',
  },
  {
    name: 'wa.on.weapon_grant',
    parameters: [{ name: 'callback', type: 'function', description: 'function(event) - event.source, event.worm_id, event.alliance (nil if unavailable), event.frame, event.x, event.y (px), event.items = { { weapon, amount }, ... }' }],
    returnType: 'void',
    description: 'Fires when weapons are granted (like a crate pickup), carrying the frame and position.',
    example: 'wa.on.weapon_grant(function(event)\n  for _, item in ipairs(event.items) do wa.log(item.weapon) end\nend)',
  },
  {
    name: 'wa.weapons.visual',
    parameters: [{ name: 'weapon', type: 'string', description: 'Weapon name' }],
    returnType: 'table | nil',
    description: 'Returns presentation art for a weapon: `{ sprite, frame, kind, width, height }`, or nil.',
    example: 'local v = wa.weapons.visual("bazooka")',
  },
  {
    name: 'wa.world.frame',
    parameters: [],
    returnType: 'int | nil',
    description: 'Returns the current simulation frame number (50 per second), or nil when unavailable.',
    example: 'local frame = wa.world.frame()',
  },
  {
    name: 'wa.world.is_local_alliance',
    parameters: [{ name: 'alliance', type: 'int', description: 'Alliance / coalition number' }],
    returnType: 'bool',
    description: 'Returns true if the alliance belongs to the local player. Presentation only.',
    example: 'if wa.world.is_local_alliance(p.alliance) then ... end',
  },
  {
    name: 'wa.world.trace',
    parameters: [{ name: 'spec', type: 'table', description: '{ x0, y0, x1, y1, radius, with = { "terrain", "worms", "crates", "oil", "mines", "graves", "actors", "missiles" }, ignore = <entity>, grab = { "object", "worm", "projectile" } } (with defaults to terrain; grab filters actors)' }],
    returnType: 'table | nil',
    description: 'Sweeps a circle from `(x0, y0)` to `(x1, y1)` against the collision bitmap. `with` selects target types (default terrain), and `grab` filters actors. Returns nil on a clear path, or `{ hit, x, y, nx, ny, tx, ty, obj, starts_solid, left_x, left_y }`.',
    example: 'wa.world.trace({ x0 = x0, y0 = y0, x1 = x1, y1 = y1, radius = 16 })',
  },
  {
    name: 'wa.crates.spawn',
    parameters: [{ name: 'spec', type: 'table', description: '{ x, y, kind = "weapon"|"utility"|"health", health, drop = "chute"|"teleport"|"none", contents = "<weapon id>", amount } (amount -1 infinite to 99)' }],
    returnType: 'WorldHandle | nil',
    description: 'Spawns a stock weapon, utility, or health crate dropped by chute, teleport, or immediately (`"none"`). Weapon and utility crates draw from the match crate deck unless `contents` is set. Simulation callbacks only. Returns the crate, or nil on error.',
    example: 'local c = wa.crates.spawn({ x = w.x, y = w.y, kind = "weapon", drop = "teleport" })',
  },
  {
    name: 'wa.crates.set_drop',
    parameters: [
      { name: 'how', type: 'string | bool', description: '"pop", or false for stock drops' },
      { name: 'spec', type: 'table', optional: true, description: '{ pitch = 0..12, height = 0..100 | { min = 0..100, max = 0..100 } } (semitones and px above terrain; both default to 0)' },
    ],
    returnType: 'void',
    description: 'Switches turn-drop and Crate Shower crates to pop in with a puff and CratePop sound instead of parachuting or teleporting. `height` sets drop height above terrain; `pitch` randomizes sound pitch up to ±semitones. Call `set_drop(false)` to restore stock drops (resets each round). Install or simulation callbacks only; doesn\'t affect `wa.crates.spawn` or donor cards.',
    example: 'wa.crates.set_drop("pop", { pitch = 3, height = { min = 30, max = 50 } })',
  },
  {
    name: 'wa.crates.odds',
    parameters: [],
    returnType: 'table',
    description: 'Returns turn-drop chances in percent: `{ weapon, health, utility, none }`. Safe in any callback.',
    example: 'local odds = wa.crates.odds()',
  },
  {
    name: 'wa.crates.set_odds',
    parameters: [{ name: 'spec', type: 'table', description: '{ weapon, health, utility } (whole %, sum <= 100; omitted kinds are 0, remainder is no crate)' }],
    returnType: 'void',
    description: 'Rebuilds the 100-entry turn crate deck for the rest of the round. Simulation callbacks only.',
    example: 'wa.crates.set_odds({ weapon = 60, health = 25, utility = 15 })',
  },
  {
    name: 'wa.crates.shares',
    parameters: [],
    returnType: 'table',
    description: 'Returns crate weapon percentages grouped by kind (`weapon`, `super`, `utility`). Safe in any callback.',
    example: 'local shares = wa.crates.shares()',
  },
  {
    name: 'wa.crates.set_shares',
    parameters: [{ name: 'spec', type: 'table', description: '{ ["<weapon id>"] = pct } (pct 0..100, or false to restore round-start weighting)' }],
    returnType: 'void',
    description: 'Sets crate percentage shares for weapons (like profile `crate_pct`); remaining weapons split the rest by their round-start weights. Applies to spawned, mystery, and Crate Shower crates for the rest of the round. Simulation callbacks only.',
    example: 'wa.crates.set_shares({ ["px.javelin"] = 40, ["stock.bazooka"] = false })',
  },
  {
    name: 'wa.teams.surrender',
    parameters: [{ name: 'team', type: 'int', description: 'Team number 1 to 6 (worm.team)' }],
    returnType: 'bool',
    description: 'Surrenders a team on its turn or off-turn. Simulation callbacks only. Returns whether it applied.',
    example: 'wa.teams.surrender(2)',
  },
  {
    name: 'wa.teams.surrendered',
    parameters: [{ name: 'team', type: 'int', description: 'Team number 1 to 6 (worm.team)' }],
    returnType: 'bool | nil',
    description: 'Returns whether a team has surrendered, or nil outside a match. Safe in any callback.',
    example: 'if wa.teams.surrendered(2) then return end',
  },
  {
    name: 'wa.math.cos',
    parameters: [{ name: 'angle', type: 'float', description: 'Angle in radians' }],
    returnType: 'float',
    description: 'Deterministic cosine. Use instead of math.cos, which can differ between machines and desync.',
    example: 'local dx = wa.math.cos(angle)',
  },
  {
    name: 'wa.math.sin',
    parameters: [{ name: 'angle', type: 'float', description: 'Angle in radians' }],
    returnType: 'float',
    description: 'Deterministic sine. Use instead of math.sin.',
    example: 'local dy = wa.math.sin(angle)',
  },
  {
    name: 'wa.math.atan',
    parameters: [
      { name: 'y', type: 'float', description: 'Y component' },
      { name: 'x', type: 'float', description: 'X component' },
    ],
    returnType: 'float',
    description: 'Deterministic arctangent in radians. Use instead of math.atan.',
    example: 'local ang = wa.math.atan(dy, dx)',
  },

  {
    name: 'wa.world.collides',
    parameters: [{ name: 'spec', type: 'table', description: '{ x, y, radius, with = { "terrain", "worms", "mines", "crates", "oil", "graves", "actors", "missiles" }, ignore = <entity>, grab = { "object", "worm", "projectile" } } (grab filters actors)' }],
    returnType: 'bool, table | nil',
    description: 'Tests whether a circle at `(x, y)` overlaps anything. Returns `hit, first_object`.',
    example: 'local hit, obj = wa.world.collides({ x = a.x, y = a.y, radius = 8, with = { "worms" } })',
  },
  {
    name: 'wa.world.blast',
    parameters: [
      { name: 'spec', type: 'table', description: '{ x, y, owner = <worm|actor>, damage = 90, radius = 184, push_pct = 60, terrain_radius = 90, kind } (distances in px; damage 0..10000, radius 1..8192, push_pct 0..1000, terrain_radius 0..200)' },
    ],
    returnType: 'void',
    description: 'Deals radial blast damage with linear falloff from body centres and cuts a terrain crater. Simulation callbacks only.',
    example: 'wa.world.blast({ x = x, y = y, owner = worm, damage = 60, radius = 120 })',
  },
  {
    name: 'wa.world.explode',
    parameters: [
      { name: 'spec', type: 'table', description: '{ x, y, owner = <worm|actor|"none">, damage = 50, id = 100, below = true } (x/y in px, required; damage/id 0..10000; below shifts 1 px down)' },
    ],
    returnType: 'void',
    description: 'Triggers a stock explosion (sprite, sound, crater, and hits) at `(x, y)`. `owner` defaults to the callback worm or actor (`"none"` for neutral). Simulation callbacks only.',
    example: 'wa.world.explode({ x = 400, y = 300, owner = "none", damage = 45 })',
  },
  {
    name: 'wa.on.body_move',
    parameters: [
      { name: 'callback', type: 'function', description: 'function(body) - called as bodies move' },
      { name: 'opts', type: 'table', optional: true, description: '{ kinds = { "worm", "missile", "mine", "crate", "oil", "grave", "arrow" } }' },
    ],
    returnType: 'void',
    description: 'Fires when a body moves. Pass `opts.kinds` to filter by body kind.',
    example: 'wa.on.body_move(function(body) ... end, { kinds = { "worm" } })',
  },
  {
    name: 'wa.worms.spawn',
    parameters: [{ name: 'spec', type: 'table', description: '{ team, x, y, name, health }' }],
    returnType: 'WormHandle',
    description: 'Spawns a worm on a team, reusing a dead worm slot first. A worm that died this turn holds its slot until WA tallies turn damage, so a full team is refused until then. Simulation callbacks only.',
    example: 'wa.worms.spawn({ team = worm.team, x = x, y = y, name = "Reinforcement", health = 200 })',
  },
  {
    name: 'wa.arrows.all',
    parameters: [{ name: 'args', type: 'table | entity', optional: true, description: '{ near = { x, y, r }, from = entity } (near filters by distance in px; from walks from that entity; a bare entity is treated as from)' }],
    returnType: 'table',
    description: 'Returns all live arrows. Pass `near` to filter to arrows within `r` px of `(x, y)` in the same order.',
    example: 'for _, ar in ipairs(wa.arrows.all()) do ... end',
  },
  {
    name: 'wa.arrows.spawn',
    parameters: [
      { name: 'spec', type: 'table', description: '{ owner = <worm|actor>, x = number, y = number, [vx], [vy], [damage], [gravity_pct] } (x/y in px, required; speeds in px/frame; damage default 10; gravity_pct default 100)' },
    ],
    returnType: 'WorldHandle | nil',
    description: 'Spawns a stock arrow, or returns nil if the object pool is full or the point is inside terrain. Simulation callbacks only.',
    example: 'local arrow = wa.arrows.spawn({ owner = worm, x = worm.x, y = worm.y, vx = 4, vy = -3 })',
  },

  // ---- Lua API 4 additions (WormBench 0.9.1/0.9.11, Lua/verbs 9.11 api 4.0.txt) --
  // Every entry below was verified against crates/lua-host before being added --
  // the wa-namespace-typo check warns on anything missing here, so a gap is a
  // FALSE POSITIVE on valid API 4 code.
  {
    name: 'wa.assets.load',
    parameters: [
      { name: 'spec', type: 'table', description: '{ sprites = { "sprites/star.png", ... }, sounds = { "sounds/boom.wav", ... }, gpu_prefix = "sprites/", wa_sprites = { "wbrth1", "worm" }, worm_glow = true | { radius = 1..16, pad = 0..40, gain = 0.1..8 } } (wa_sprites lists stock Gfx.dir names or "worm")' },
    ],
    returnType: 'void',
    description: 'Loads sprites and sounds for a component during `install`. `wa_sprites` copies stock sprites in full colour for `worm.tint`; `worm_glow` sets the match worm-glow shape. Errors outside `install`.',
    example: 'wa.assets.load({ sprites = { "sprites/star.png" }, gpu_prefix = "sprites/" })',
  },
  {
    name: 'wa.panel.layout',
    parameters: [],
    returnType: 'table',
    description: 'Returns each placed weapon\'s panel position by ID: rows `F1`..`F12` and `utility`, columns `1`..`10`.',
    example: 'local layout = wa.panel.layout()\nwa.log(layout["stock.uzi"].row)',
  },
  {
    name: 'wa.panel.set_layout',
    parameters: [{ name: 'spec', type: 'table', description: '{ ["<weapon id>"] = { row = "F3", column = 3 }, ... }' }],
    returnType: 'void',
    description: 'Moves placed weapons on the panel mid-round (simulation callbacks only). F-keys and clicks update immediately.',
    example: 'wa.panel.set_layout({ ["px.javelin"] = { row = "F3", column = 3 } })',
  },
  {
    name: 'wa.panel.replace',
    parameters: [],
    returnType: 'bool',
    description: 'Keeps the stock weapon panel closed for the rest of the match so a mod can draw a custom panel in `wa.on.hud` and handle right-click. Safe in any callback. Returns false if the build or renderer can\'t replace the panel; don\'t branch simulation logic on the result.',
    example: 'wa.panel.replace()',
  },
  {
    name: 'wa.panel.mouse',
    parameters: [],
    returnType: 'table',
    description: 'Returns the local screen cursor and clicks since the last HUD frame: `{ x, y, left, right }`. Inside `wa.on.hud` only.',
    example: 'local m = wa.panel.mouse()',
  },
  {
    name: 'wa.panel.capture',
    parameters: [],
    returnType: 'void',
    description: 'Captures mouse input for the custom panel until the next HUD frame. Requires `wa.panel.replace()`. Inside `wa.on.hud` only.',
    example: 'wa.panel.capture()',
  },
  {
    name: 'wa.panel.select',
    parameters: [{ name: 'weapon', type: 'string', description: 'Placed weapon ID' }],
    returnType: 'bool',
    description: 'Selects a weapon for the local active team. Requires `wa.panel.replace()`. Inside `wa.on.hud` only. Returns whether the selection succeeded.',
    example: 'wa.panel.select("px.javelin")',
  },
  {
    name: 'wa.panel.close',
    parameters: [],
    returnType: 'bool',
    description: 'Closes the stock weapon panel on this machine with its slide animation (local only). Returns false if unavailable in this build. Inside `wa.on.hud` only.',
    example: 'local closed = wa.panel.close()',
  },
  {
    name: 'wa.panel.stock',
    parameters: [],
    returnType: 'table | nil',
    description: 'Returns the stock weapon panel geometry on screen this HUD frame (`{ x, y, w, h, open, opened, cells }` in screen px, where each cell is `{ weapon, x, y, size = 24 }`), or nil while closed. Inside `wa.on.hud` only; presentation only.',
    example: 'local panel = wa.panel.stock()\nfor _, cell in ipairs(panel and panel.cells or {}) do ... end',
  },
  {
    name: 'wa.weapons.data',
    parameters: [{ name: 'weapon', type: 'string', description: 'Placed weapon ID (px.javelin) or stock.<name>' }],
    returnType: 'table',
    description: 'Returns a weapon\'s record as named tables (with `fires.as` naming its family): the live round record for a placed weapon, or the stock record for an unplaced `stock.<name>`.',
    example: 'local data = wa.weapons.data("stock.bazooka")',
  },
  {
    name: 'wa.weapons.fire_bullet',
    parameters: [
      { name: 'spec', type: 'table', description: '{ weapon = "stock.shotgun", owner = worm, x = int, y = int, dx = number, dy = number, damage = int, push_pct = int, ignore = { entity, ... } } (x/y in px; dx/dy direction; ignore skips listed bodies; owner must be a live worm)' },
    ],
    returnType: 'void',
    description: 'Fires a native hitscan bullet using a stock weapon template (`stock.shotgun`, `stock.handgun`, `stock.uzi`, `stock.minigun`). Simulation callbacks only.',
    example: 'wa.weapons.fire_bullet({ weapon = "stock.shotgun", owner = worm, x = worm.x, y = worm.y, dx = 1, dy = 0, damage = 25 })',
  },
  {
    name: 'wa.weapons.panel_icon',
    parameters: [
      { name: 'weapon', type: 'string', description: 'Weapon ID' },
      { name: 'n', type: 'int', description: '0 for panel_icon, 1+ for panel_icons[n]' },
    ],
    returnType: 'void',
    description: 'Switches the icon shown on a weapon panel tile. Presentation only; safe in any callback.',
    example: 'wa.weapons.panel_icon("px.javelin", 1)',
  },
  {
    // Documented in the 0.9.1 release verb list ("Since 0.9.1") but not present
    // in the vendored WormBench-main source snapshot yet (grep: zero hits). Added
    // anyway: the namespace check only warns, so listing it costs a missed
    // finding, while NOT listing it would flag working code -- and a false
    // positive on valid code is the worse error.
    name: 'wa.weapons.hold_sheet',
    parameters: [
      { name: 'weapon', type: 'string', description: 'Weapon ID' },
      { name: 'n', type: 'int', description: '0 for hold.sheet, 1+ for hold.sheets[n]' },
    ],
    returnType: 'void',
    description: 'Switches the held sprite sheet drawn over the worm aim pose (`0` for `hold.sheet`, `1+` for `hold.sheets`). Draw only; safe in any callback.',
    example: 'wa.weapons.hold_sheet("px.gravity_gun", 1)',
  },
  {
    name: 'wa.weapons.set_selectable',
    parameters: [
      { name: 'spec', type: 'table', description: '{ weapon = string, team = int (1..6), selectable = bool }' },
    ],
    returnType: 'void',
    description: 'Enables or disables selecting a placed weapon for a team (1..6). Disabled weapons are greyed out on the panel and skipped by F-keys. Resets to selectable each round. Simulation callbacks only.',
    example: 'wa.weapons.set_selectable({ weapon = "px.javelin", team = 2, selectable = false })',
  },
  {
    name: 'wa.world.set_turn_clock',
    parameters: [{ name: 'ms', type: 'int', description: 'Turn clock remaining in ms (must be >= 1)' }],
    returnType: 'void',
    description: 'Sets the turn clock remaining in ms (simulation callbacks only). Pairs with `wa.world.turn_clock()` and `wa.world.retreat()`.',
    example: 'wa.world.set_turn_clock(45000)',
  },

  // ---- Lua API 4 additions in WormBench 0.9.11 (fog of war) -------------------
  // Source: the 0.9.11 release verb list (`spec/verbs 9.11 api 4.0.txt`, updated
  // 2026-10-19). The vendored WormBench-main snapshot is still 0.9.1 and has no
  // `Fog` in crates/lua-host, so these cannot be re-verified against it -- same
  // situation as wa.weapons.set_selectable above. Listed anyway because the
  // namespace check only WARNS: a missing name means a false positive on working
  // 0.9.11 code, which is the worse error of the two.
  //
  // Fog is PRESENTATION ONLY (the section lead says so, and wa.fog.visible's
  // description repeats it for its own case): its results never reach the
  // simulation. That is why nothing here is treated as a lockstep hazard.
  {
    name: 'wa.fog.set',
    parameters: [
      { name: 'spec', type: 'table', description: '{ circle_radius, cone_width, cone_length, shadow_cast, discover, view_ownership, fog_floor, ... }' },
    ],
    returnType: 'void',
    description: 'Updates live fog settings. All keys are validated before applying; an invalid key or range errors without changing the fog. Setting `fog_floor = 100` disables terrain memory.',
    example: 'wa.fog.set({ circle_radius = 120, fog_floor = 40 })',
  },
  {
    name: 'wa.fog.get',
    parameters: [{ name: 'name', type: 'string', description: 'Fog setting name, like "circle_radius"' }],
    returnType: 'any',
    description: 'Returns the current value of a fog setting, or nil if unknown.',
    example: 'local radius = wa.fog.get("circle_radius")',
  },
  {
    name: 'wa.fog.defaults',
    parameters: [],
    returnType: 'table',
    description: 'Returns default values for all fog settings as `{ name = value }`.',
    example: 'local defaults = wa.fog.defaults()',
  },
  {
    name: 'wa.fog.enable',
    parameters: [{ name: 'on', type: 'bool', description: 'true turns fog on, false turns it off' }],
    returnType: 'void',
    description: 'Turns fog of war on or off for the match. Requires `[fog]` in `mod.toml`.',
    example: 'wa.fog.enable(true)',
  },
  {
    name: 'wa.fog.enabled',
    parameters: [],
    returnType: 'bool',
    description: 'Returns whether fog of war is currently enabled.',
    example: 'if wa.fog.enabled() then ... end',
  },
  {
    name: 'wa.fog.visible',
    parameters: [
      { name: 'x', type: 'number', description: 'X in px' },
      { name: 'y', type: 'number', description: 'Y in px' },
    ],
    returnType: 'number',
    description: 'Returns local brightness at `(x, y)` (0..255), including floor and shade. Draw and HUD callbacks only.',
    example: 'local brightness = wa.fog.visible(worm.x, worm.y)',
  },
  {
    name: 'wa.fog.light',
    parameters: [
      { name: 'spec', type: 'table', description: '{ x, y, kind, mode, circle, cone = { length, width, toward }, shadow_cast, seen_by, owner, discover, strength, fade }' },
    ],
    returnType: 'LightHandle',
    description: 'Creates a standalone fog light at `(x, y)`. Accepts the same keys as `a.light`, plus optional `owner` worm and `fade` (ms before closing and removing). Visible to everyone unless `owner` is set. Cone lights require numeric `toward` degrees. Max 64 free lights.',
    example: 'local light = wa.fog.light({ x = 100, y = 200, kind = "projectile" })',
  },

  // ---- 0.9.9 verbs.md (updated 2026-11-01) ---------------------------------
  // These names are in the shipped verb list but were missing from the editor
  // tables, so valid calls were reported as `wa-namespace-typo` false positives.
  {
    name: 'wa.world.speed',
    parameters: [],
    returnType: 'number',
    description: 'Returns the match speed multiplier relative to scheme speed (`1/16`..`16`; `0.5` is half speed). Reflects what mods set, not local replay-viewer speed keys.',
    example: 'local speed = wa.world.speed()',
  },
  {
    name: 'wa.world.set_speed',
    parameters: [{ name: 'factor', type: 'number', description: 'Speed factor, 1/16..16 (1 is normal scheme speed)' }],
    returnType: 'void',
    description: 'Sets match playback speed. Stock sounds pitch with it; mod WAVs don\'t. Only changes real-time frame duration, never simulation results, so it stays lockstep-safe. Simulation callbacks only; resets to 1 each round.',
    example: 'wa.world.set_speed(0.5)',
  },
  {
    name: 'wa.world.placing',
    parameters: [],
    returnType: 'bool',
    description: 'Returns true during manual worm placement, before instant-use utilities activate. Read-only.',
    example: 'if wa.world.placing() then return end',
  },
  {
    name: 'wa.world.worm_selecting',
    parameters: [],
    returnType: 'bool',
    description: 'Returns true while Tab switches worms (worm select phase, or all turn under worm select always). Outside this state, mods can use Tab freely.',
    example: 'if wa.world.worm_selecting() then ... end',
  },
  {
    name: 'wa.draw.brush',
    parameters: [
      { name: 'spec', type: 'table', description: '{ sprite = "name", frame = 0, blend = "alpha"|"add", depth = int, color = 0xAARRGGBB | colors = { c1, c2, c3, c4 }, uv = { u0, v0, u1, v1 } } (sprite required; pass visibility to brush:box)' },
    ],
    returnType: 'BrushHandle',
    description: 'Pre-configures a sprite sheet for batched drawing (`b:box`, `b:boxes`, `b:quads`) without allocating per-frame tables. `sprite` is required; `blend` is `"alpha"` or `"add"`; `color` sets one tint or `colors` sets four corners; `uv` sets frame sub-rect (0..1).',
    example: 'local b = wa.draw.brush({ sprite = "sprites/Glow.png", blend = "add" })\nwa.on.draw(function()\n  b:box(x, y, 8, 6, angle)\nend)',
  },
  {
    name: 'wa.draw.trail',
    parameters: [
      { name: 'spec', type: 'table', description: '{ sprite, frame, width, glow, glow_width, color, max = 12, shed = 2, floor = 0.1, blend, depth, visibility = worm }' },
    ],
    returnType: 'TrailHandle',
    description: 'Creates a persistent ribbon drawn every frame and fed points from any callback. Point `i` of `n` (oldest first) scales width, U, and colour by `max(i / (n + 1), floor)`; `glow` adds a wider glow pass. After `finish()`, sheds the oldest point every `shed` game frames.',
    example: 'local t = wa.draw.trail({ sprite = "spark", width = 8 })\nt:push(x, y)\nt:finish()',
  },
  {
    name: 'wa.hud.fps_counter',
    parameters: [],
    returnType: 'void',
    description: 'Enables the top-right FPS counter for the match. Works in all builds; Lua can\'t read the rate back.',
    example: 'wa.hud.fps_counter()',
  },
  {
    name: 'wa.hud.tray.add',
    parameters: [
      { name: 'spec', type: 'table', description: '{ weapon | text, team, key, to, lit, progress, greyed } (text 1..4 bytes instead of weapon; key up to 8 bytes; to = "coalition" | "active" | "all"; progress 0..1)' },
    ],
    returnType: 'HudTrayEntry',
    description: 'Adds a weapon or short label to the top-right HUD tray using weapon-panel styling (icon, ammo, delay). Adding an existing entry returns it. Weapon entries drop when ammo hits 0 unless `lit = true`; text entries stay until removed. Max 32.',
    example: 'local entry = wa.hud.tray.add({ weapon = "px.javelin", team = 1, key = "JAV" })',
  },
  {
    name: 'wa.hud.utilities.add',
    parameters: [
      { name: 'spec', type: 'table', description: '{ weapon, worm | team } (placed or stock weapon ID; pass worm or team, not both)' },
    ],
    returnType: 'HudUtilityEntry',
    description: 'Adds a weapon icon to the stock utility tray above the wind bar. Worm entries show on that worm\'s turn and drop on death; team entries show on that team\'s turn. Adding a duplicate returns the existing entry. Max 32 across all mods.',
    example: 'local entry = wa.hud.utilities.add({ weapon = "stock.low_gravity", team = 1 })',
  },
  {
    name: 'wa.music.set_pitch',
    parameters: [{ name: 'factor', type: 'number', description: 'Pitch/tempo multiplier, 1/16..2 (0.5 is an octave lower and half speed)' }],
    returnType: 'void',
    description: 'Scales soundtrack pitch and tempo together across tracks until changed again (resets to 1 each match). Presentation only; safe in any callback.',
    example: 'wa.music.set_pitch(0.5)',
  },
  {
    name: 'wa.view.ripple',
    parameters: [
      { name: 'spec', type: 'table', description: '{ x, y, amplitude = 6, wavelength = 48, speed = 200, duration_ms = 600, falloff = wavelength } (amplitude 0..64 px, wavelength 8..4096 px)' },
    ],
    returnType: 'RippleHandle',
    description: 'Starts a world-space screen ripple from `(x, y)` affecting terrain, water, worms, objects, actors, names, and crosshair (not the HUD). Presentation only; safe in any callback. Max 32 active (a 33rd ends the oldest). Requires Direct3D 9 shaders.',
    example: 'local r = wa.view.ripple({ x = 100, y = 200, amplitude = 8 })',
  },
  {
    name: 'wa.view.disable_zoom',
    parameters: [],
    returnType: 'void',
    description: 'Locks the view at 1x zoom for all players, disabling mouse-wheel and middle-click zoom. Safe in any callback; resets each match.',
    example: 'wa.view.disable_zoom()',
  },
  {
    name: 'wa.fog.shade',
    parameters: [
      { name: 'x', type: 'number', description: 'X in px' },
      { name: 'y', type: 'number', description: 'Y in px' },
    ],
    returnType: 'number',
    description: 'Returns local darkness at `(x, y)` (0..255) from dark and shadow lights, with or without fog enabled. Draw and HUD callbacks only.',
    example: 'local darkness = wa.fog.shade(worm.x, worm.y)',
  },

];

export const BUILTIN_CLASSES: ClassDef[] = [
  {
    name: 'LuaActor',
    description: 'Custom entity with optional physics, animation, collision, and event callbacks (ActorHandle).',
    syntaxExample: 'local a = wa.actors.spawn({...})\na.gravity = 1\na:move({ terrain = true })',
    members: [
      { name: 'id', kind: 'property', returnType: 'int', description: 'Unique body ID shared with objects and missiles (starts at 0x100, separate from worm IDs). Consistent across peers and never reused.' },
      { name: 'kind', kind: 'property', returnType: 'string', description: 'Always `"actor"`. Track custom actor types in your own Lua tables keyed by `a.id`.' },
      { name: 'alive', kind: 'property', returnType: 'bool', description: 'True while the actor is alive (read-only); false after removal, explosion, or drowning.' },
      { name: 'grab', kind: 'variable', returnType: 'bool | string | nil', description: 'How pickup tools treat this actor: `true` (object, default), `false` (ignore), `"worm"` (represents owner), or `"projectile"` (in flight); `nil` resets to `true`. Writable in any callback.' },
      { name: 'x', kind: 'variable', returnType: 'number', description: 'Position X in px' },
      { name: 'y', kind: 'variable', returnType: 'number', description: 'Position Y in px' },
      { name: 'vx', kind: 'variable', returnType: 'number', description: 'Velocity X in px/frame' },
      { name: 'vy', kind: 'variable', returnType: 'number', description: 'Velocity Y in px/frame' },
      { name: 'facing', kind: 'variable', returnType: 'int', description: 'Facing direction: -1 (left) or 1 (right) (writable)' },
      { name: 'gravity', kind: 'variable', returnType: 'number', description: 'Gravity scale factor (1 = normal, 0 = none). Nonzero values let WA move the actor. Writes require simulation callbacks.', example: 'a.gravity = 0.5' },
      { name: 'visible', kind: 'variable', returnType: 'bool', description: 'Whether this machine draws the actor. Presentation only; physics and collisions still run.', example: 'a.visible = false' },
      { name: 'camera', kind: 'variable', returnType: 'nil | bool | int', description: 'Per-frame camera request: `nil` or `false` disables it; `0..13` requests the camera at that priority (filtered by `wa.camera.follow` using owner side). Safe in any callback.' },
      // `a:dig` is GONE in 0.9.1: no `dig` method exists anywhere in lua-host
      // (grep: zero hits) and no file in the new mods tree calls it -- the
      // engine's own note says "dig is cut's circle now". Suggesting it would
      // offer a method that reads as nil at run time.
      { name: 'collision_ignore', kind: 'method', parameters: [{ name: 'worm', type: 'WormHandle', description: 'Worm to pass through' }, { name: 'on', type: 'bool', description: 'true = ignore that worm' }], returnType: 'bool', description: 'Lets one worm pass through the actor body and mask (simulation callbacks only). Returns whether it applied.', example: 'a:collision_ignore(worm, true)' },
      { name: 'explode', kind: 'method', parameters: [{ name: 'opts', type: 'table', optional: true, description: '{ damage = int, id = int, below = bool, at = "below" }' }], returnType: 'void', description: 'Triggers an explosion at the actor coordinates.', example: 'a:explode({ damage = 40, id = 50 })' },
      { name: 'hit', kind: 'method', parameters: [{ name: 'damage', type: 'int', description: 'Damage, 0..10000' }, { name: 'vx', type: 'number', optional: true, description: 'Push X in px/frame' }, { name: 'vy', type: 'number', optional: true, description: 'Push Y in px/frame' }, { name: 'kind', type: 'string', optional: true, description: 'Hit kind (defaults to prod)' }], returnType: 'bool', description: 'Sends a WA hit through the actor handler (filtered by `body.hit_by`, handled by `on.hit` or default push). Returns false if the actor is gone or ignores the hit. Simulation callbacks only.', example: 'a:hit(25, 2, -1, "bullet")' },
      { name: 'remove', kind: 'method', parameters: [], returnType: 'void', description: 'Removes this actor and frees its native resources (simulation callbacks only).', example: 'a:remove()' },
      { name: 'in_water', kind: 'method', parameters: [], returnType: 'bool', description: 'Returns true if the actor is below water level.', example: 'if a:in_water() then a:remove() end' },
      { name: 'on_feet', kind: 'method', parameters: [], returnType: 'bool', description: 'Returns true if the actor is resting on solid ground.', example: 'if a:on_feet() then ... end' },
      { name: 'sleep', kind: 'method', parameters: [{ name: 'frames', type: 'int', description: 'Frame calls to skip (0..3000); 0 wakes it' }, { name: 'opts', type: 'table', optional: true, description: '{ near = px } (1..32767: wake when a living worm enters range)' }], returnType: 'void', description: 'Skips the actor\'s next `frame` callbacks while WA still moves it and runs other handlers. Wakes early on landing, leaving ground, water, damage, hits, blasts, touch, warp, or a worm within `near` (not `on.contact`). The waking frame call receives `ev.slept`. Simulation callbacks only.', example: 'a:sleep(250, { near = 96 })' },
      { name: 'move', kind: 'method', parameters: [{ name: 'opts', type: 'table', optional: true, description: '{ terrain = bool, worms = bool }' }], returnType: 'table', description: 'Adds velocity to position once and checks ground below: `{ terrain, land, left_ground }`. Doesn\'t sweep, stop at terrain, bounce, or trigger contact events. Simulation callbacks only.', example: 'local hit = a:move({ terrain = true })' },
      { name: 'gfx', kind: 'method', parameters: [{ name: 'spec', type: 'table', description: '{ angle, scale, tint, depth, glow_of, follow } (glow_of = worm shares that worm\'s glow; follow = worm interpolates with that worm)' }], returnType: 'void', description: 'Sets actor draw fields (`angle`, `scale`, `tint`, `depth`, `glow_of`, `follow`). `glow_of = worm` draws the worm glow behind this actor (`false` clears it); `follow = worm` interpolates movement with that worm between frames. Drawing only.', example: 'a:gfx({ angle = 45, tint = 0xFF8000, glow_of = worm })' },
      { name: 'frame', kind: 'method', parameters: [{ name: 'index', type: 'int', description: '0-based frame index' }], returnType: 'void', description: 'Sets the active animation frame (simulation callbacks only).', example: 'a:frame(3)' },
      { name: 'look', kind: 'method', parameters: [{ name: 'spriteKey', type: 'string', description: 'Sprite key or mod-relative path' }], returnType: 'void', description: 'Swaps the actor sprite and resets animation phase (simulation callbacks only).', example: 'a:look("sprites/flare.png")' },
      { name: 'warp', kind: 'method', parameters: [{ name: 'spec', type: 'table', description: '{ x = number, y = number, vx = number, vy = number, facing = -1|1 } (x/y in px, required; speeds in px/frame and facing optional)' }], returnType: 'void', description: 'Moves a live actor immediately and wakes it (simulation callbacks only). Omitted speeds keep current velocity.', example: 'a:warp{ x = 100, y = 200 }' },
      { name: 'fits', kind: 'method', parameters: [{ name: 'x', type: 'number', description: 'Target X in px' }, { name: 'y', type: 'number', description: 'Target Y in px' }, { name: 'mode', type: 'string', optional: true, description: '"terrain" to test land only, else the actor collision mask' }], returnType: 'bool', description: 'Tests whether the actor shape fits at `(x, y)` without colliding. Safe in any callback.', example: 'if a:fits(x, y, "terrain") then a:warp{ x = x, y = y } end' },
      // Magnetism. A finite multiplier; 0 opts out.
      { name: 'magnetic', kind: 'variable', returnType: 'number', description: 'Automatic magnetic response multiplier, 0..1000 (default 0; simulation callbacks only). Fields sum in creation order before movement.', example: 'a.magnetic = 0.25' },
      { name: 'hits', kind: 'variable', returnType: 'table', description: 'Outgoing movement layers: `{ land, worms, mines, crates, objects, missiles }`. Reads return booleans; writes require simulation callbacks.' },
      { name: 'hit_by', kind: 'variable', returnType: 'string | table', description: 'Incoming damage categories: `"all"` or `{ worms, missiles, arrows, mines, actors, bullets, melee, fire, dragon_ball, blasts }`. Writes require simulation callbacks.' },
      { name: 'owner', kind: 'property', returnType: 'WormEntity | nil', description: 'Owning worm, if any (read-only).' },
      // Fog of war (0.9.11). Presentation only, so it is safe in any callback.
      { name: 'light', kind: 'variable', returnType: 'string | false | table', description: 'Fog-of-war light for this actor. Visible world actors default to the profile projectile light; invisible, cursor, and screen-space actors start with none. Accepts a preset (`"worm"`, `"animal"`, `"projectile"`, `"crate"`), `false` to disable, or a spec table (`mode` = `"light"`/`"dark"`/`"shadow"`, `circle`, `fill`, `cone`, `seen_by`, `discover`, `strength` 0..255). Presentation only; safe in any callback.', example: 'a.light = "projectile"\na.light = { mode = "dark", circle = 120 }' },
    ],
  },
  {
    name: 'WormEntity',
    description: 'Player worm handle (WormHandle) with engine properties and methods.',
    syntaxExample: 'worm:equip("bazooka")\nworm:hit(25)\nworm:heal(50)\nworm:carry(x, y)',
    members: [
      { name: 'id', kind: 'property', returnType: 'int', description: 'Stable worm ID (team * 16 + index)' },
      { name: 'x', kind: 'variable', returnType: 'number', description: 'Position X in px' },
      { name: 'y', kind: 'variable', returnType: 'number', description: 'Position Y in px' },
      { name: 'vx', kind: 'variable', returnType: 'number', description: 'Horizontal velocity in px/frame' },
      { name: 'vy', kind: 'variable', returnType: 'number', description: 'Vertical velocity in px/frame' },
      { name: 'facing', kind: 'variable', returnType: 'int', description: 'Facing direction: -1 (left) or 1 (right) (writable)' },
      { name: 'shots_fired', kind: 'variable', returnType: 'int', description: 'Shots fired this turn for repeat-fire weapons (simulation callbacks only)' },
      { name: 'shots_to_fire', kind: 'variable', returnType: 'int', description: 'Shots to fire this turn for repeat-fire weapons (simulation callbacks only)' },
      { name: 'shots', kind: 'variable', returnType: 'int', description: 'Shots per use for the selected weapon, 1..127 (writable in simulation callbacks for this selection).' },
      { name: 'shots_used', kind: 'property', returnType: 'int', description: 'Number of shots fired in the current use (read-only).' },
      { name: 'fuel', kind: 'variable', returnType: 'number', description: 'Jet pack fuel (0 is unlimited, writable)' },
      { name: 'gravity', kind: 'variable', returnType: 'number', description: 'Gravity scale factor (1.0 = normal, writable)' },
      { name: 'wind', kind: 'variable', returnType: 'number', description: 'Wind scale factor (1.0 = normal, writable)' },
      { name: 'mass', kind: 'variable', returnType: 'number', description: 'Mass factor dividing incoming knockback and scaling body collisions (writable in simulation callbacks).' },
      { name: 'collision_mask', kind: 'variable', returnType: 'int', description: 'Collision layer bitmask (bit 22 is landscape/water, writable)' },
      { name: 'shape', kind: 'variable', returnType: 'string | nil', description: 'Collision shape: `"worm"` (9x16) or `"mine"` (7x5), or nil for others. Writes update shape and mask together (simulation callbacks only).' },
      { name: 'keys', kind: 'property', returnType: 'table', description: 'Worm movement inputs: `{ up, down, left, right }`' },
      // The eighteen names `worm.state` can actually return, from
      // `worm_state_name()` in crates/lua-host/src/actor.rs. Anything else reads
      // as nil -- the lua-host does not guess. The old list here was partly
      // invented: it missed firing/fired/tumbling and advertised "sinking",
      // which is a set_state alias and never a value read back.
      { name: 'state', kind: 'property', returnType: 'string | nil', description: 'State name: "standing" | "walking" | "ready" | "charging" | "prefiring" | "firing" | "fired" | "punching" | "drilling" | "kamikaze" | "teleporting" | "rope_firing" | "torching" | "after_rope" | "getting_up" | "jetpacking" | "parachuting" | "falling" | "roping" | "bungee" | "tumbling" | "frozen" | "jump_prepare" | "jumping" | "jump_falling" | "blasted" | "hit" | "skimming" | "dying" | "drowning" | "dead" | nil' },
      { name: 'state_id', kind: 'property', returnType: 'int', description: 'Raw u32 state number (diagnostics builds only; mods should read `worm.state`).' },
      { name: 'state_label', kind: 'property', returnType: 'string | nil', description: 'Debug label for the raw state, including states `worm.state` doesn\'t name (like `"ledge?"`). Diagnostics builds only; for logs, not game logic.' },
      { name: 'team', kind: 'property', returnType: 'int', description: 'Team number (1 to 6)' },
      { name: 'slot', kind: 'property', returnType: 'int', description: 'Selected weapon slot index (1 to 70)' },
      { name: 'weapon', kind: 'property', returnType: 'string | nil', description: 'Stock weapon name, like "bazooka"' },
      { name: 'aim', kind: 'property', returnType: 'float', description: 'Aim sweep fraction (0.0 straight down -> 0.5 level -> 1.0 straight up)' },
      { name: 'aiming', kind: 'property', returnType: 'bool', description: 'True while standing with a weapon or charging' },
      { name: 'drilling', kind: 'property', returnType: 'bool', description: 'True while drilling' },
      { name: 'kind', kind: 'property', returnType: 'string', description: 'Always `"worm"`' },
      { name: 'visible', kind: 'variable', returnType: 'bool', description: 'Overall worm visibility (read/write)' },
      { name: 'body_visible', kind: 'variable', returnType: 'bool', description: 'Body sprite visibility only (name, health, and cursor stay visible)' },
      { name: 'invisibility', kind: 'variable', returnType: 'bool', description: 'Applies Invisibility to this worm alone (hidden from enemies, ghosted for allies; cleared by weapons that end Invisibility). Writes require simulation callbacks.', example: 'worm.invisibility = true' },
      { name: 'turn', kind: 'property', returnType: 'bool', description: 'True if this is the active worm' },
      { name: 'hp', kind: 'property', returnType: 'int', description: 'Health points' },
      { name: 'alliance', kind: 'property', returnType: 'int', description: 'Team alliance / color index (0 red .. 5 cyan)' },
      { name: 'windup', kind: 'variable', returnType: 'int', description: 'Engine-counted wind-up frames (0 skips it, nil restores stock behavior; writable in simulation callbacks)' },
      { name: 'ammo_group', kind: 'property', returnType: 'int', description: 'Physical ammo row index; may differ from visible alliance colour (read-only)' },
      { name: 'taken', kind: 'property', returnType: 'bool', description: 'True while held by a mod via `worm:take` (read-only)' },
      { name: 'name', kind: 'variable', returnType: 'string', description: 'Worm name. Writes keep the first 16 printable ASCII bytes and update the label (simulation callbacks only).', example: 'worm.name = "Reinforcement"' },
      { name: 'camera', kind: 'variable', returnType: 'nil | bool | int', description: 'Camera request override: `nil` uses stock behavior, `false` disables camera requests, `0..13` requests at that priority. `wa.camera.follow` still applies. Safe in any callback.' },
      { name: 'aim_target', kind: 'property', returnType: 'number', description: 'Target aim angle in degrees (`-90` down to `90` up, `0` level, relative to facing).' },
      { name: 'click', kind: 'property', returnType: 'string | nil', description: 'Active cursor mode on the active worm (`"girder"`, `"strike"`, `"teleport"`, or `"homing"`), or nil when no cursor is active.' },
      { name: 'target', kind: 'property', returnType: 'table | nil', description: 'Last clicked target point `{ x, y }` in px, or nil before any click.' },
      { name: 'selectable', kind: 'variable', returnType: 'bool', description: 'When false, turn rotation and Tab skip this worm while it stays alive on the map. Resets to true each round. Writes require simulation callbacks.' },
      { name: 'tint', kind: 'variable', returnType: 'number | table | nil', description: 'Body tint: `0xRRGGBB`, `{ color, blend = "multiply" | "smooth_add", light = 0..1, glow = 0..1, glow_color }`, or `nil`. Drawing only; requires Direct3D 9 shaders.' },
      { name: 'body_scale', kind: 'variable', returnType: 'number | table | nil', description: 'Scales the drawn worm body around its anchor with optional vertical offset `y` px: `0.85`, `{ scale = 0.85, y = -5 }`, or `nil` for normal size. Drawing only.' },
      { name: 'hide_hud', kind: 'variable', returnType: 'bool | table', description: 'Hides worm HUD elements while keeping the body drawn: `true`, `false`, or `{ labels, arrow, weapon, aim, from = "everyone" | "enemies" }`. Drawing only; local per machine.' },
      { name: 'time_scale', kind: 'variable', returnType: 'number', description: 'Worm simulation steps per world frame (`0..8`; fractional values carry over, `1` is normal, `0` pauses the worm). Simulation callbacks only.' },
      // Exactly the five names `settable_worm_state()` accepts (crates/lua-host);
      // "sinking" is gone. A state that is not settable -- "jetpacking", say --
      // is REJECTED by the engine, so it must not be advertised as settable.
      { name: 'set_state', kind: 'method', parameters: [{ name: 'name', type: 'string', description: '"standing" | "falling" | "bungee" | "tumbling" | "teleporting"' }], returnType: 'void', description: 'Transitions the worm into one of the five settable states via WA\'s SetState. Any other name errors; dying worms are unchanged. Simulation callbacks only.', example: 'worm:set_state("falling")' },
      { name: 'clear_keys', kind: 'method', parameters: [], returnType: 'void', description: 'Consumes and clears movement keys for this frame (simulation callbacks only).', example: 'worm:clear_keys()' },
      { name: 'carry', kind: 'method', parameters: [{ name: 'x', type: 'number', description: 'Target X in px' }, { name: 'y', type: 'number', description: 'Target Y in px' }], returnType: 'void', description: 'Moves the worm to `(x, y)` and freezes the turn timer.', example: 'worm:carry(target.x, target.y)' },
      // 0.9.11. WA's own jump take-off, without inventing a velocity.
      { name: 'jump', kind: 'method', parameters: [{ name: 'kind', type: 'string', optional: true, description: '"forward" | "back" | "up" | "backflip"; omitting repeats the last jump' }], returnType: 'void', description: 'Triggers a stock jump take-off from the worm\'s current position; omitting `kind` repeats the last jump.', example: 'worm:jump("backflip")' },
      { name: 'freeze', kind: 'method', parameters: [], returnType: 'void', description: 'Freezes the worm in place.', example: 'worm:freeze()' },
      { name: 'take', kind: 'method', parameters: [{ name: 'opts', type: 'table', optional: true, description: '{ turn = "run" | "freeze", fire = "nothing" | true | { weapon ids }, fire_as = "bungee" }' }], returnType: 'bool', description: 'Hands control of the worm to the mod so it stays where you place it. Returns false for dying, drowning, or dead worms. `fire` allows `"nothing"` (default), `true` (all), or a weapon ID list; `fire_as = "bungee"` lets strikes, Teleport, and Girder fire while held. Use `worm.visible` / `worm.body_visible` to hide it.', example: 'worm:take{ fire = true }' },
      { name: 'release', kind: 'method', parameters: [{ name: 'vx', type: 'int', optional: true, description: 'Release velocity X in px/frame' }, { name: 'vy', type: 'int', optional: true, description: 'Release velocity Y in px/frame' }, { name: 'opts', type: 'table', optional: true, description: '{ tumble = bool }' }], returnType: 'bool', description: 'Returns a taken worm to WA physics (or launches an untaken worm), optionally tumbling. Returns false for dying, drowning, or dead worms (0-HP worms not yet dying still launch). Call `worm:release(0, 0)` to drop in place.', example: 'worm:release(0, 2, { tumble = true })' },
      { name: 'fits', kind: 'method', parameters: [{ name: 'x', type: 'number', description: 'Target X in px' }, { name: 'y', type: 'number', description: 'Target Y in px' }], returnType: 'bool', description: 'Tests whether the worm fits at `(x, y)` without colliding. Safe in any callback.', example: 'if worm:fits(x, y) then worm:carry(x, y) end' },
      { name: 'jetpack_steer', kind: 'method', parameters: [{ name: 'on', type: 'bool', optional: true, description: 'Take over jet pack steering (default true)' }], returnType: 'void', description: 'Takes over jet pack steering while keeping stock collisions, fuel HUD, and landing. Resets when the jet pack ends (simulation callbacks only).', example: 'worm:jetpack_steer(true)' },
      { name: 'equip', kind: 'method', parameters: [{ name: 'weaponName', type: 'string', description: 'Placed weapon ID (px.javelin) or stock slot name' }], returnType: 'int', description: 'Selects a placed weapon by ID. If the team has 0 ammo, grants one temporary shot reclaimed at turn end if unused. Returns ammo held, or 0 if WA refuses selection.', example: 'worm:equip("px.javelin")' },
      { name: 'use', kind: 'method', parameters: [{ name: 'weaponName', type: 'string', description: 'Placed weapon ID or stock.<name>' }], returnType: 'bool', description: 'Triggers a weapon action (Fire Punch or Jet Pack family) immediately without ammo, delay, or turn impact. Returns false for dying worms, busy worms, or the active worm. Simulation callbacks only.', example: 'worm:use("stock.fire_punch")' },
      { name: 'ammo', kind: 'method', parameters: [{ name: 'weaponName', type: 'string', description: 'Weapon name' }, { name: 'change', type: 'int | table', optional: true, description: 'Delta to add, or { set = count, keep_delay = bool } (-1 is infinite)' }], returnType: 'int', description: 'Reads, adds, or sets team ammo for a placed weapon by ID. `keep_delay = true` preserves weapon delay. Returns current ammo.', example: 'worm:ammo("bazooka", { set = 3 })' },
      { name: 'delay', kind: 'method', parameters: [{ name: 'weaponName', type: 'string', description: 'Placed weapon ID, like "px.javelin"' }, { name: 'turns', type: 'int | nil', optional: true, description: 'New delay in turns; omit to read' }], returnType: 'int', description: 'Reads or sets team delay in turns for a placed weapon. Writing requires a simulation callback and a live worm. Returns the active delay.', example: 'worm:delay("px.javelin", 2)' },
      { name: 'input', kind: 'method', parameters: [{ name: 'spec', type: 'table', description: '{ fire = "press"|"release", aim = -90..90, fuse = 1..5, bounce = "min"|"max", click = { x, y }, key = "left"|"right"|"up"|"down"|"face_left"|"face_right"|"jump"|"backflip"|"special"|"tab" }' }], returnType: 'void', description: 'Sends stock input messages to a worm (`fire`, `aim` in degrees -90..90, `fuse` 1..5, `bounce`, `click`, or a single-frame `key`). Works on inactive worms too without steering released weapons. Simulation callbacks only.', example: 'worm:input({ fire = "press", aim = 30 })' },
      { name: 'poison', kind: 'method', parameters: [{ name: 'amount', type: 'int', description: 'Poison damage, 1..1000' }], returnType: 'bool', description: 'Poisons the worm through WA, crediting the current spawn owner. Simulation callbacks only. Returns whether it applied.', example: 'worm:poison(20)' },
      { name: 'reduce_health', kind: 'method', parameters: [{ name: 'amount', type: 'int', description: 'Damage to take, 0..10000' }], returnType: 'bool', description: 'Reduces worm health through WA\'s damage path without a synthetic hit or knockback. Simulation callbacks only. Returns whether it applied.', example: 'worm:reduce_health(15)' },
      { name: 'hit', kind: 'method', parameters: [{ name: 'arg', type: 'int | table', description: 'Damage amount, or { amount = int, vx, vy, react = bool, kind } (vx/vy knockback in px/frame; react = false skips hit reaction)' }], returnType: 'void', description: 'Damages the worm with optional knockback. `react = false` applies damage without flinch, push, or fall damage. `kind` defaults to prod.', example: 'worm:hit{ amount = 20, vx = 2, vy = -1 }' },
      { name: 'heal', kind: 'method', parameters: [{ name: 'amount', type: 'int', description: 'HP to restore' }, { name: 'opts', type: 'table', optional: true, description: '{ from_zero = bool } (revive a 0-HP worm not yet dying)' }], returnType: 'int', description: 'Adds health and returns the new HP. Refuses 0-HP worms unless `from_zero = true` and death hasn\'t started.', example: 'worm:heal(25, { from_zero = true })' },
      // Health-timing verbs used by Core Utilities. Worm-only and simulation-only,
      // like `teleport_pose`. See WormBench actor.rs.
      { name: 'commit_health', kind: 'method', parameters: [], returnType: 'bool', description: 'Commits this worm\'s pending health display (message 0x44) while leaving WA\'s pending damage owed, without a synthetic hit or turn-wide death. Worm-only, simulation callbacks only. Returns whether it applied.', example: 'worm:commit_health()' },
      { name: 'show_health', kind: 'method', parameters: [], returnType: 'bool', description: 'Updates this worm\'s health label to its current HP while leaving pending damage owed so a 0-HP worm isn\'t killed early. Worm-only, simulation callbacks only. Returns whether it applied.', example: 'worm:show_health()' },
      { name: 'die', kind: 'method', parameters: [{ name: 'opts', type: 'table', optional: true, description: '{ settled = true } (start death once the worm stops moving instead of immediately)' }], returnType: 'bool', description: 'Starts death for a 0-HP worm immediately, even in flight. With `{ settled = true }`, grants death permission (0x40) so it dies once it settles without waiting for the battlefield. Returns false if the worm has HP, is already dying, is unplaced, or is in Kamikaze/Suicide Bomber flight. Worm-only, simulation callbacks only.', example: 'if not worm.turn and worm.hp == 0 then worm:die{ settled = true } end' },
      { name: 'warp', kind: 'method', parameters: [{ name: 'spec', type: 'table', description: '{ x = number, y = number, vx = number, vy = number, facing = -1|1 } (x/y in px, required; speeds in px/frame and facing optional)' }], returnType: 'void', description: 'Moves a live worm immediately and wakes it (simulation callbacks only). Omitted speeds keep current velocity.', example: 'worm:warp{ x = 100, y = 200 }' },
      // Worm-only: the engine exposes it on worms but not on actors
      // (lua-host lib.rs:832-848).
      { name: 'teleport_pose', kind: 'method', parameters: [], returnType: 'bool', description: 'Puts the worm into the teleport pose in place without moving it (simulation callbacks only). Returns whether it applied.', example: 'if worm:teleport_pose() then ... end' },
    ],
  },
  {
    name: 'WorldHandle',
    description: 'World object handle for crates, mines, missiles, oil drums, arrows, and gravestones.',
    syntaxExample: 'mine:arm(2000)\ndrum:hit(50, 0, 0)\ngrave:revive(worm_id, 100)',
    members: [
      { name: 'id', kind: 'property', returnType: 'int', description: 'Unique body ID shared with actors and missiles (starts at 0x100, separate from worm IDs). Consistent across peers and never reused.' },
      { name: 'kind', kind: 'property', returnType: 'string', description: '"mine" | "missile" | "crate" | "worm" | "oil" | "grave" | "arrow" | "land" | "object"' },
      { name: 'alive', kind: 'property', returnType: 'bool', description: 'True while the object is alive (read-only); false once freed (its `kind` becomes `"none"`).' },
      { name: 'team', kind: 'property', returnType: 'int', description: 'Owning team number (1 to 6), 0 for none (read-only)' },
      { name: 'alliance', kind: 'property', returnType: 'int', description: 'Visible coalition colour of the owning team (like `worm.alliance`), or nil if unowned (read-only)' },
      { name: 'worm_id', kind: 'property', returnType: 'int', description: 'For gravestones: stable worm ID of the deceased worm' },
      { name: 'fuse', kind: 'variable', returnType: 'int', description: 'For mines: fuse countdown in ms. Writable in simulation callbacks (`-1` for random fuse on trigger, or `0..10000` ms).' },
      { name: 'damage', kind: 'property', returnType: 'int | nil', description: 'For oil drums: accumulated damage, or nil for other objects (read-only).' },
      { name: 'max_damage', kind: 'property', returnType: 'int | nil', description: 'For oil drums: damage threshold before exploding (50), or nil for other objects (read-only).' },
      { name: 'visible', kind: 'variable', returnType: 'bool | nil', description: 'For oil drums, mines, and arrows: whether WA draws it (`false` lets a mod draw its own while physics still run). Nil for other objects; writable in any callback.' },
      { name: 'frame', kind: 'property', returnType: 'int | nil', description: 'For arrows: sprite 46 frame stamped into terrain (0..31), or nil for other objects (read-only).' },
      { name: 'weapon', kind: 'property', returnType: 'string | nil', description: 'For arrows: firing weapon ID, or nil for `wa.arrows.spawn` and other objects (read-only).' },
      { name: 'gravity', kind: 'variable', returnType: 'number | nil', description: 'Gravity scale factor (`1` normal, `0` none) on mines, crates, oil drums, missiles, arrows, and graves; nil on other objects. Writes require simulation callbacks.' },
      { name: 'camera', kind: 'variable', returnType: 'nil | bool | int', description: 'Camera request override: `nil` uses stock behavior, `false` disables camera requests, `0..13` requests at that priority. `wa.camera.follow` still applies. Safe in any callback.' },
      { name: 'x', kind: 'variable', returnType: 'number', description: 'Position X in px' },
      { name: 'y', kind: 'variable', returnType: 'number', description: 'Position Y in px' },
      { name: 'vx', kind: 'variable', returnType: 'number', description: 'Horizontal velocity in px/frame' },
      { name: 'vy', kind: 'variable', returnType: 'number', description: 'Vertical velocity in px/frame' },
      { name: 'impulse', kind: 'method', parameters: [{ name: 'pushx', type: 'int', description: 'Horizontal push in px/frame' }, { name: 'pushy', type: 'number', description: 'Vertical push in px/frame' }], returnType: 'void', description: 'Applies a velocity push to a mine or missile (simulation callbacks only).', example: 'mine:impulse(pushx, pushy)' },
      { name: 'arm', kind: 'method', parameters: [{ name: 'fuse_ms', type: 'int', description: 'Fuse countdown duration in ms' }], returnType: 'bool', description: 'Arms a settled stock mine (simulation callbacks only).', example: 'mine:arm(1500)' },
      { name: 'hit', kind: 'method', parameters: [{ name: 'damage', type: 'int', description: 'Damage amount' }, { name: 'vx', type: 'int', description: 'Velocity X' }, { name: 'vy', type: 'int', description: 'Velocity Y' }, { name: 'kind', type: 'string', optional: true, description: 'Hit kind (defaults to prod)' }], returnType: 'bool', description: 'Sends a WA hit to a mine, crate, or oil drum (returns false for other objects). Oil drums accumulate `"fire"` damage and explode immediately on other kinds; crates explode on any hit; mines take the push. Simulation callbacks only.', example: 'drum:hit(50, 0, 0)' },
      { name: 'revive', kind: 'method', parameters: [{ name: 'worm_id', type: 'int', description: 'Stable worm ID' }, { name: 'health', type: 'int', description: 'Initial HP' }], returnType: 'WormHandle | nil', description: 'Revives a dead worm from its gravestone and removes the grave (simulation callbacks only).', example: 'grave:revive(worm.id, 100)' },
      { name: 'warp', kind: 'method', parameters: [{ name: 'spec', type: 'table', description: '{ x = number, y = number, vx = number, vy = number } (x/y in px, required; speeds in px/frame optional)' }], returnType: 'void', description: 'Moves a live object immediately and wakes it (simulation callbacks only). Omitted speeds keep current velocity.', example: 'object:warp{ x = 100, y = 200 }' },
      { name: 'fits', kind: 'method', parameters: [{ name: 'x', type: 'number', description: 'Target X in px' }, { name: 'y', type: 'number', description: 'Target Y in px' }, { name: 'mode', type: 'string', optional: true, description: '"terrain" to test land only, else the object collision mask' }], returnType: 'bool', description: 'Tests whether the object shape fits at `(x, y)` without colliding. Safe in any callback.', example: 'if object:fits(x, y) then object:warp{ x = x, y = y } end' },
      { name: 'remove', kind: 'method', parameters: [], returnType: 'bool', description: 'Frees a missile, arrow, mine, or oil drum without exploding (oil drums leave no flames and don\'t fire `wa.on.oil_explode`). Simulation callbacks only.', example: 'object:remove()' },
    ],
  },
  {
    // 0.9.11. A hand-built light handle, not a world object: it has its own
    // three methods and nothing else. Presentation only.
    name: 'LightHandle',
    description: 'Standalone fog-of-war light created by `wa.fog.light`.',
    syntaxExample: 'local light = wa.fog.light({ x = 100, y = 200 })\nlight:move(120, 210)\nlight:remove()',
    members: [
      { name: 'move', kind: 'method', parameters: [{ name: 'x', type: 'number', description: 'Target X in px' }, { name: 'y', type: 'number', description: 'Target Y in px' }], returnType: 'void', description: 'Moves a free light.', example: 'light:move(120, 210)' },
      { name: 'set', kind: 'method', parameters: [{ name: 'spec', type: 'table', description: '{ circle, mode, fade, ... }' }], returnType: 'void', description: 'Updates free light settings; omitted keys stay unchanged. Passing a new `fade` restarts the fade.', example: 'light:set({ mode = "dark", fade = 500 })' },
      { name: 'remove', kind: 'method', parameters: [], returnType: 'void', description: 'Removes a free light.', example: 'light:remove()' },
    ],
  },
  {
    // Match-wide magnetic field handle (0.9.11). The engine calls it
    // FieldHandle; the editor class is named for the API that returns it.
    name: 'MagneticField',
    description: 'Match-wide magnetic field created by `wa.magnetism.field`.',
    syntaxExample: 'local field = wa.magnetism.field({ source = magnet })\nfield.polarity = "attract"\nfield:remove()',
    members: [
      { name: 'range', kind: 'variable', returnType: 'number', description: 'Range in px, 0..32767.' },
      { name: 'strength', kind: 'variable', returnType: 'number', description: 'Inverse-square falloff coefficient, 0..1e12.' },
      { name: 'max_force', kind: 'variable', returnType: 'number', description: 'Maximum force before direction attenuation, 0..1000 px/frame per step.' },
      { name: 'softening', kind: 'variable', returnType: 'number', description: 'Central softening distance in px, 1/65536..32767.' },
      { name: 'polarity', kind: 'variable', returnType: 'string', description: '"attract" or "repel".' },
      { name: 'enabled', kind: 'variable', returnType: 'bool', description: 'Whether this field is active. Reads false after removal.' },
      { name: 'native', kind: 'variable', returnType: 'bool', description: 'Whether the field also affects stock mines and missiles.' },
      { name: 'remove', kind: 'method', parameters: [], returnType: 'bool', description: 'Removes the field (returns true once, then false). Simulation callbacks only.' },
      { name: 'move', kind: 'method', parameters: [{ name: 'x', type: 'number', description: 'Target X in px' }, { name: 'y', type: 'number', description: 'Target Y in px' }], returnType: 'void', description: 'Moves a point field to `(x, y)` from the next simulation step. Source fields follow their actor and can\'t be moved; removed fields error. Simulation callbacks only.', example: 'field:move(420, 300)' },
      { name: 'contains', kind: 'method', parameters: [{ name: 'x', type: 'number', description: 'X in px' }, { name: 'y', type: 'number', description: 'Y in px' }], returnType: 'bool', description: 'Returns whether `(x, y)` is inside the field snapshot.' },
    ],
  },
  {
    name: 'WindowHandle',
    description: 'HUD text window created by `wa.hud.window`; stays open until closed or match end.',
    syntaxExample: 'local window = wa.hud.window({ text = "Turn 3", x = 10, y = 10 })\nwindow:set({ text = "Turn 4" })\nwindow:close()',
    members: [
      { name: 'set', kind: 'method', parameters: [{ name: 'spec', type: 'table', description: '{ text, x, y, color, ... }' }], returnType: 'bool', description: 'Updates window properties; omitted keys stay unchanged. Returns false once closed.', example: 'window:set({ text = "Turn 4" })' },
      { name: 'close', kind: 'method', parameters: [], returnType: 'bool', description: 'Closes the window; returns false if already closed.', example: 'window:close()' },
      { name: 'is_open', kind: 'method', parameters: [], returnType: 'bool', description: 'Returns whether the window is still open (consistent across peers).', example: 'if window:is_open() then ... end' },
    ],
  },
  {
    name: 'InventoryStore',
    description: 'Mod-scoped virtual inventory store created by `wa.inventory.create`.',
    syntaxExample: 'local inv = wa.inventory.create({ id = "loot", slots = { "bazooka", "grenade" } })\ninv:add(worm, "bazooka", 1)\ninv:apply(worm, { each = 1 })',
    members: [
      { name: 'id', kind: 'property', returnType: 'string', description: 'Inventory store ID' },
      { name: 'owner', kind: 'property', returnType: 'string', description: 'Owning mod ID' },
      { name: 'get', kind: 'method', parameters: [{ name: 'worm', type: 'WormHandle', description: 'Worm' }, { name: 'name', type: 'string', description: 'Weapon name' }], returnType: 'int', description: 'Returns the worm\'s count for a weapon in this store.', example: 'local count = inv:get(worm, "bazooka")' },
      { name: 'set', kind: 'method', parameters: [{ name: 'worm', type: 'WormHandle', description: 'Worm' }, { name: 'name', type: 'string', description: 'Weapon name' }, { name: 'amount', type: 'int', description: 'Amount to set' }], returnType: 'int', description: 'Sets the worm\'s count for a weapon in this store.', example: 'inv:set(worm, "bazooka", 2)' },
      { name: 'add', kind: 'method', parameters: [{ name: 'worm', type: 'WormHandle', description: 'Worm' }, { name: 'name', type: 'string', description: 'Weapon name' }, { name: 'amount', type: 'int', optional: true, description: 'Amount to add (default 1)' }], returnType: 'int', description: 'Adds to a worm\'s weapon count.', example: 'inv:add(worm, "grenade", 1)' },
      { name: 'remove', kind: 'method', parameters: [{ name: 'worm', type: 'WormHandle', description: 'Worm' }, { name: 'name', type: 'string', description: 'Weapon name' }, { name: 'amount', type: 'int', optional: true, description: 'Amount to remove (default 1)' }], returnType: 'int', description: 'Removes from a worm\'s weapon count.', example: 'inv:remove(worm, "grenade", 1)' },
      { name: 'clear', kind: 'method', parameters: [{ name: 'worm', type: 'WormHandle', description: 'Worm' }, { name: 'weapons', type: 'string | table', optional: true, description: '"all", weapon name, or array of names' }], returnType: 'void', description: 'Clears a worm\'s store contents.', example: 'inv:clear(worm)' },
      { name: 'list', kind: 'method', parameters: [{ name: 'worm', type: 'WormHandle', description: 'Worm' }], returnType: 'table', description: 'Returns an array of weapon names held by the worm in this store.', example: 'local weapons = inv:list(worm)' },
      { name: 'deal', kind: 'method', parameters: [{ name: 'worm', type: 'WormHandle', description: 'Worm' }, { name: 'pool', type: 'table', description: 'Array of weapon names' }, { name: 'count', type: 'int', optional: true, description: 'Number to deal (default 1)' }], returnType: 'table', description: 'Deterministically deals weapons from `pool` using `wa.random`.', example: 'local dealt = inv:deal(worm, { "bazooka", "grenade" }, 2)' },
      { name: 'transfer', kind: 'method', parameters: [{ name: 'from', type: 'WormHandle', description: 'Source worm' }, { name: 'to', type: 'WormHandle', description: 'Destination worm' }, { name: 'opts', type: 'table', optional: true, description: '{ weapons = "all"|string|table, amount = int, mode = "move"|"copy" }' }], returnType: 'table', description: 'Transfers weapons between two worms.', example: 'inv:transfer(killer, victim, { mode = "move" })' },
      { name: 'apply', kind: 'method', parameters: [{ name: 'worm', type: 'WormHandle', description: 'Worm' }, { name: 'opts', type: 'table', optional: true, description: '{ clear = bool, each = int, weapons = "all"|string|table }' }], returnType: 'void', description: 'Applies virtual inventory contents onto the real WA team ammo row.', example: 'inv:apply(worm, { clear = true, each = 1 })' },
    ],
  },
  {
    name: 'MissileEntity',
    description: 'Projectile table passed to `wa.on.missile_frame` callbacks.',
    syntaxExample: 'wa.on.missile_frame(function(m)\n  if m.weapon == "chilli_bomb" then m.sprite = 0 end\nend)',
    members: [
      { name: 'id', kind: 'property', returnType: 'int', description: 'Unique body ID shared with actors and objects; consistent across hooks and never reused within a match.' },
      { name: 'class_type', kind: 'property', returnType: 'int', description: 'Engine class type' },
      { name: 'damp', kind: 'variable', returnType: 'number', description: 'Damping factor (1.0 = normal, read/write)' },
      { name: 'wind_scale', kind: 'variable', returnType: 'number', description: 'Wind scale factor (1.0 = normal, read/write)' },
      { name: 'gravity_scale', kind: 'variable', returnType: 'number', description: 'Gravity scale factor (1.0 = normal, read/write)' },
      { name: 'moved', kind: 'variable', returnType: 'int', description: 'Entity moved flag' },
      { name: 'x', kind: 'variable', returnType: 'number', description: 'Position X in px (read/write)' },
      { name: 'y', kind: 'variable', returnType: 'number', description: 'Position Y in px (read/write)' },
      { name: 'vx', kind: 'variable', returnType: 'number', description: 'Velocity X in px/frame (read/write)' },
      { name: 'vy', kind: 'variable', returnType: 'number', description: 'Velocity Y in px/frame (read/write)' },
      { name: 'cm_gravity', kind: 'property', returnType: 'int', description: 'CollisionManager base gravity (read-only)' },
      { name: 'cm_wind', kind: 'property', returnType: 'int', description: 'CollisionManager base wind (read-only)' },
      { name: 'msg', kind: 'property', returnType: 'int', description: 'Message type in missile_frame' },
      { name: 'phase', kind: 'property', returnType: 'string', description: '"pre" or "post" in missile_frame' },
      { name: 'weapon', kind: 'property', returnType: 'string | nil', description: 'Firing weapon ID, like "bazooka"' },
      { name: 'sprite', kind: 'variable', returnType: 'int', description: 'Flight sprite ID (writable; set to 0 to hide the stock flight sprite).' },
      { name: 'collision_mask', kind: 'variable', returnType: 'int', description: 'Layer collision bitmask (read/write)' },
    ],
  },
  {
    name: 'HudTrayEntry',
    description: 'HUD weapon-tray entry returned by `wa.hud.tray.add`.',
    syntaxExample: 'local entry = wa.hud.tray.add({ weapon = "px.javelin", team = 1 })\nentry:set({ lit = true, progress = 0.5 })\nentry:remove()',
    members: [
      { name: 'set', kind: 'method', parameters: [{ name: 'spec', type: 'table', description: '{ key, lit, progress, greyed } (lit draws a yellow border and keeps the entry; progress 0..1 draws a bottom bar; greyed dims the cell)' }], returnType: 'void', description: 'Updates fields on this tray entry.', example: 'entry:set({ lit = true, progress = 0.5 })' },
      { name: 'remove', kind: 'method', parameters: [], returnType: 'void', description: 'Removes the tray entry.', example: 'entry:remove()' },
      { name: 'is_open', kind: 'method', parameters: [], returnType: 'bool', description: 'Returns whether the entry is still in the tray.', example: 'if entry:is_open() then ... end' },
    ],
  },
  {
    name: 'HudUtilityEntry',
    description: 'Utility-tray entry returned by `wa.hud.utilities.add`.',
    syntaxExample: 'local entry = wa.hud.utilities.add({ weapon = "stock.low_gravity", team = 1 })\nentry:remove()',
    members: [
      { name: 'remove', kind: 'method', parameters: [], returnType: 'bool', description: 'Removes the entry; returns true if it was present.', example: 'entry:remove()' },
      { name: 'is_open', kind: 'method', parameters: [], returnType: 'bool', description: 'Returns whether the entry is still in the tray (consistent across peers).', example: 'if entry:is_open() then ... end' },
    ],
  },
  {
    name: 'TrailHandle',
    description: 'Persistent ribbon returned by `wa.draw.trail`.',
    syntaxExample: 'local t = wa.draw.trail({ sprite = "spark", width = 8 })\nt:push(x, y)\nt:finish()',
    members: [
      { name: 'push', kind: 'method', parameters: [{ name: 'x', type: 'number', description: 'X in px' }, { name: 'y', type: 'number', description: 'Y in px' }], returnType: 'void', description: 'Appends one point to the trail. Safe in any callback.', example: 't:push(x, y)' },
      { name: 'finish', kind: 'method', parameters: [], returnType: 'void', description: 'Stops accepting new points and sheds the oldest point every `shed` game frames.', example: 't:finish()' },
      { name: 'remove', kind: 'method', parameters: [], returnType: 'void', description: 'Removes the trail immediately.', example: 't:remove()' },
      { name: 'points', kind: 'property', returnType: 'table', description: 'Live trail points, oldest first.' },
    ],
  },
  {
    name: 'BrushHandle',
    description: 'Pre-configured sprite brush returned by `wa.draw.brush`.',
    syntaxExample: 'local b = wa.draw.brush({ sprite = "sprites/Glow.png" })\nwa.on.draw(function()\n  b:box(100, 200, 8, 6)\nend)',
    members: [
      { name: 'box', kind: 'method', parameters: [{ name: 'x', type: 'number', description: 'Centre X in px' }, { name: 'y', type: 'number', description: 'Centre Y in px' }, { name: 'w', type: 'number', description: 'Width in px' }, { name: 'h', type: 'number', description: 'Height in px' }, { name: 'angle', type: 'number', optional: true, description: 'Radians around centre (positive turns clockwise; default 0)' }, { name: 'frame', type: 'int', optional: true, description: 'Frame override for this box' }, { name: 'color', type: 'int', optional: true, description: '0xAARRGGBB colour override for this box' }, { name: 'visibility', type: 'entity', optional: true, description: 'Worm: draw only where that worm is visible' }], returnType: 'void', description: 'Draws a `w` x `h` box centred on `(x, y)`, rotated by `angle` radians using brush defaults. Inside `wa.on.draw` only.', example: 'b:box(x, y, 8, 6, angle)' },
      { name: 'boxes', kind: 'method', parameters: [{ name: 'list', type: 'table', description: 'Flat array: x, y, w, h, angle, frame, color (7 numbers per box)' }, { name: 'count', type: 'int', optional: true, description: 'Boxes to draw (defaults to #list // 7, max 4096)' }, { name: 'visibility', type: 'entity', optional: true, description: 'Worm: draw only where that worm is visible' }], returnType: 'void', description: 'Draws `count` boxes in one call from a flat list of 7 numbers per box (`x, y, w, h, angle, frame, color`). Max 4096. Inside `wa.on.draw` only.', example: 'b:boxes(list, #list // 7)' },
      { name: 'quads', kind: 'method', parameters: [{ name: 'list', type: 'table', description: 'Flat array: x1, y1, x2, y2, x3, y3, x4, y4, frame, color (10 numbers per quad)' }, { name: 'count', type: 'int', optional: true, description: 'Quads to draw (defaults to #list // 10, max 4096)' }, { name: 'visibility', type: 'entity', optional: true, description: 'Worm: draw only where that worm is visible' }], returnType: 'void', description: 'Draws `count` quads in one call from a flat list of 10 numbers per quad (`x1..y4, frame, color`). Max 4096. Inside `wa.on.draw` only.', example: 'b:quads(list, #list // 10)' },
    ],
  },
  {
    name: 'RippleHandle',
    description: 'Screen ripple returned by `wa.view.ripple`.',
    syntaxExample: 'local r = wa.view.ripple({ x = 100, y = 200 })\nr:stop()',
    members: [
      { name: 'stop', kind: 'method', parameters: [], returnType: 'void', description: 'Stops the ripple early.', example: 'r:stop()' },
    ],
  },
  {
    name: 'AmbientHandle',
    description: 'Global ambient sound returned by `wa.sound.ambient`.',
    syntaxExample: 'local rain = wa.sound.ambient({ path = "sounds/rain.wav", volume = 0.6 })\\nrain:stop({ fade_ms = 1500 })',
    members: [
      { name: 'set', kind: 'method', parameters: [{ name: 'spec', type: 'table', description: '{ volume = 1, fade_ms = 0 } (volume 0..1; fade_ms 0..60000)' }], returnType: 'void', description: 'Fades the ambient sound to `volume` over `fade_ms`; omitting `volume` does nothing. Presentation only; safe in any callback.', example: 'rain:set({ volume = 0.3, fade_ms = 800 })' },
      { name: 'stop', kind: 'method', parameters: [{ name: 'spec', type: 'table', optional: true, description: '{ fade_ms = 0 } (0..60000)' }], returnType: 'void', description: 'Fades out and stops the ambient sound (or stops immediately without `fade_ms`). Presentation only; safe in any callback.', example: 'rain:stop({ fade_ms = 1500 })' },
    ],
  },
];

export interface WeaponPropertyInfo {
  name: string;
  category: string;
  description: string;
  unit?: string;
  type?: 'dword' | 'float' | 'int';
}

export const WA_WEAPON_TABLE: Record<string, WeaponPropertyInfo> = {
  // Fire Mode
  fire_type: { name: 'Fire Type', category: 'Fire Mode', description: 'Fire type (1 projectile/hitscan, 2 placed, 3 strike, 4 special)' },
  subtype_param: { name: 'Subtype Parameter', category: 'Fire Mode', description: 'Special subtype parameter' },
  hold_pose: { name: 'Hold Pose', category: 'Fire Mode', description: 'Weapon holding pose override' },
  fire_method: { name: 'Fire Method', category: 'Fire Mode', description: 'Fire method (2 hitscan, 3 projectile, etc.)' },
  plane_sprite: { name: 'Plane Sprite', category: 'Fire Mode', description: 'Strike plane sprite ID' },

  // Handling
  requires_aiming: { name: 'Requires Aiming', category: 'Handling', description: 'Needs aiming crosshair (0 = off, 1 = on)' },
  shots: { name: 'Shots per Turn', category: 'Handling', description: 'Number of shots per turn' },
  uses_turn: { name: 'Uses Turn', category: 'Handling', description: 'Counts as a turn (0 = off, 1 = on)' },
  retreat: { name: 'Retreat Time', category: 'Handling', description: 'Retreat time duration', unit: 'ms' },
  creates_projectile: { name: 'Creates Projectile', category: 'Handling', description: 'Creates a projectile object (0 = off, 1 = on)' },
  power_pct: { name: 'Power / Crate Weight %', category: 'Handling', description: 'Power / crate weight percentage', unit: '%' },
  weight2: { name: 'Secondary Weight', category: 'Handling', description: 'Secondary weight property' },

  // Flight
  pellets: { name: 'Pellets per Shot', category: 'Flight', description: 'Pellets fired per shot' },
  spread: { name: 'Pellet Spread', category: 'Flight', description: 'Pellet spread distribution' },
  grenade_style: { name: 'Grenade Style', category: 'Flight', description: 'Player fuse and bouncing behavior' },
  collision_radius: { name: 'Collision Radius', category: 'Flight', description: 'Flight collision radius' },
  sprite: { name: 'Flight Sprite ID', category: 'Flight', description: 'Flight sprite asset identifier' },
  impact: { name: 'Impact Behavior', category: 'Flight', description: 'Behavior upon touching land' },
  flight_flags: { name: 'Flight Flags', category: 'Flight', description: 'Bitfield flags controlling flight properties' },
  trail: { name: 'Trail Effect ID', category: 'Flight', description: 'Particle trail effect identifier' },
  gravity_pct: { name: 'Gravity %', category: 'Flight', description: 'Gravity force scale percentage', unit: '%' },
  wind_pct: { name: 'Wind %', category: 'Flight', description: 'Wind influence scale percentage', unit: '%' },
  bounce_pct: { name: 'Bounce %', category: 'Flight', description: 'Bounciness factor percentage', unit: '%' },
  bounce_extra: { name: 'Bounce Extra', category: 'Flight', description: 'Extra bounce multiplier' },
  friction_pct: { name: 'Friction %', category: 'Flight', description: 'Friction percentage on surface', unit: '%' },
  alt_sprite: { name: 'Alt Sprite Flag', category: 'Flight', description: 'Alt sprite toggle' },
  glow_enable: { name: 'Glow Enable', category: 'Flight', description: 'Glow visual effect status' },
  glow_sprite: { name: 'Glow Sprite ID', category: 'Flight', description: 'Glow visual sprite identifier' },
  glow_time: { name: 'Glow Time', category: 'Flight', description: 'Glow effect duration', unit: 'ms' },
  space_control: { name: 'Space Key Control', category: 'Flight', description: 'Space key mid-flight control' },
  missile_type: { name: 'Body Type', category: 'Flight', description: 'Missile/body movement classification (1 homing, 2 standard, 3 sheep, 5 cluster)' },
  render_size: { name: 'Render Size', category: 'Flight', description: 'Render scale dimension' },

  // Explosion
  bias: { name: 'Explosion Bias', category: 'Explosion', description: 'Explosion downward pixel offset', unit: 'px' },
  damage: { name: 'Damage', category: 'Explosion', description: 'Base explosion damage' },
  blast: { name: 'Blast Radius', category: 'Explosion', description: 'Blast destruction radius', unit: 'px' },
  fuse_default: { name: 'Default Fuse', category: 'Explosion', description: 'Default fuse timer setting', unit: 'ms' },
  fuse: { name: 'Fuse / Lifetime', category: 'Explosion', description: 'Maximum lifetime / fuse duration', unit: 'ms' },
  detonation: { name: 'Explosion Behavior', category: 'Explosion', description: 'Action triggered on explosion (0 standard, 1 clusters, 2 fire)' },

  // Homing
  burn_sprite: { name: 'Burn / Alt Sprite ID', category: 'Homing', description: 'Burn trail or alt sprite identifier' },
  homing_strength: { name: 'Homing Strength', category: 'Homing', description: 'Homing force intensity' },
  homing_sprite: { name: 'Homing Sprite / Target', category: 'Homing', description: 'Homing target sprite parameter' },
  homing_turn: { name: 'Homing Turn Rate', category: 'Homing', description: 'Homing turning agility' },
  homing_accel: { name: 'Homing Acceleration', category: 'Homing', description: 'Homing acceleration rate' },
  homing_speed: { name: 'Homing Speed', category: 'Homing', description: 'Homing maximum velocity' },
  homing_kind: { name: 'Homing Kind', category: 'Homing', description: 'Homing targeting mode' },
  homing_arm: { name: 'Homing Arm Delay', category: 'Homing', description: 'Delay before homing activates', unit: 'ms' },
  homing_time: { name: 'Homing Search Duration', category: 'Homing', description: 'Search duration before dropping homing', unit: 'ms' },

  // Cluster
  cluster_count: { name: 'Cluster Count', category: 'Cluster', description: 'Number of clusters released' },
  cluster_speed: { name: 'Cluster Speed', category: 'Cluster', description: 'Initial velocity of ejected clusters' },
  cluster_power: { name: 'Cluster Launch Power', category: 'Cluster', description: 'Cluster ejection impulse' },
  cluster_angle: { name: 'Cluster Angle', category: 'Cluster', description: 'Center launch angle of cluster fan' },
  cluster_spread: { name: 'Cluster Spread', category: 'Cluster', description: 'Spread angle of cluster fan' },
  c_damage: { name: 'Cluster Damage', category: 'Cluster', description: 'Damage per cluster' },
  c_blast: { name: 'Cluster Blast Radius', category: 'Cluster', description: 'Explosion radius of clusters', unit: 'px' },
  c_sprite: { name: 'Cluster Sprite ID', category: 'Cluster', description: 'Sprite asset ID for clusters' },
  c_sprite_count: { name: 'Cluster Sprite Count', category: 'Cluster', description: 'Number of distinct cluster sprites' },
  c_bounce_pct: { name: 'Cluster Bounce %', category: 'Cluster', description: 'Bounciness factor of clusters', unit: '%' },
  c_gravity_pct: { name: 'Cluster Gravity %', category: 'Cluster', description: 'Gravity scale on clusters', unit: '%' },
  c_wind_pct: { name: 'Cluster Wind %', category: 'Cluster', description: 'Wind influence on clusters', unit: '%' },
  c_fuse: { name: 'Cluster Fuse', category: 'Cluster', description: 'Fuse countdown for clusters', unit: 'ms' },

  // Hitscan
  h_shots: { name: 'Hitscan Shots', category: 'Hitscan', description: 'Number of hitscan bullets' },
  h_spread: { name: 'Hitscan Spread', category: 'Hitscan', description: 'Angular spread of hitscan pellets' },
  h_damage: { name: 'Hitscan Damage', category: 'Hitscan', description: 'Damage per hitscan pellet' },
  h_range_px: { name: 'Hitscan Range (px)', category: 'Hitscan', description: 'Maximum detection distance in pixels', unit: 'px' },

  // Mine
  m_proximity: { name: 'Mine Proximity Radius', category: 'Mine', description: 'Detection trigger radius in pixels', unit: 'px' },
  m_fuse: { name: 'Mine Arm Delay', category: 'Mine', description: 'Arm delay before becoming active', unit: 'ms' },
  m_trigger: { name: 'Mine Trigger Fuse', category: 'Mine', description: 'Countdown after detection before blast', unit: 'ms' },
  m_damage: { name: 'Mine Damage', category: 'Mine', description: 'Mine explosion damage' },
  m_blast: { name: 'Mine Blast Radius', category: 'Mine', description: 'Mine crater destruction radius', unit: 'px' },

  // Strike Header
  k_count: { name: 'Strike Munition Count', category: 'Strike Header', description: 'Number of bombs dropped by plane' },
  k_spacing: { name: 'Strike Spacing', category: 'Strike Header', description: 'Horizontal drop spacing between munitions' },
};
