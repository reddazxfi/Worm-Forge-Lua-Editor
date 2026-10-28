import {
  FunctionDef,
  VariableDef,
  EnumDef,
  ClassDef,
} from '../types/wormforge';
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
    description: 'Actor management subsystem for spawning, queries, and iteration.',
    scope: 'global',
    example: 'wa.actors.spawn({ sprite = "sprites/blade.png" })',
  },
  {
    name: 'wa.cursor',
    type: 'table',
    description: 'Synchronized land-cursor actor spawning subsystem.',
    scope: 'global',
    example: 'wa.cursor.spawn({ owner = worm, on = function(c, ev) ... end })',
  },
  {
    name: 'wa.worms',
    type: 'table',
    description: 'Worm interaction subsystem for querying and manipulating active worms.',
    scope: 'global',
    example: 'local nearest = wa.worms.nearest(a)',
  },
  {
    name: 'wa.weapons',
    type: 'table',
    description: 'Weapon table registration, slot overlay, dynamic retargeting, and missile launch subsystem.',
    scope: 'global',
    example: 'wa.weapons.replace({ weapon = "bazooka", name = "Heavy Bazooka" })',
  },
  {
    name: 'wa.inventory',
    type: 'table',
    description: 'Personal per-worm virtual arsenals and multi-worm deal/transfer stores.',
    scope: 'global',
    example: 'local store = wa.inventory.create({ id = "my_shop", slots = { "bazooka", "grenade" } })',
  },
  {
    name: 'wa.land',
    type: 'table',
    description: 'Landscape pixel-mask raycasting, solid checking, digging, and shape cutting.',
    scope: 'global',
    example: 'local hit = wa.land.trace(x0, y0, x1, y1)',
  },
  {
    name: 'wa.sprites',
    type: 'table',
    description: 'Pack sprite key generator for namespaced sprite asset lookup.',
    scope: 'global',
    example: 'local key = wa.sprites.key("sprites/saw.png")',
  },
  {
    name: 'wa.sound',
    type: 'table',
    description: 'Sound playback subsystem for spatial WAV effects and stock voices.',
    scope: 'global',
    example: 'wa.sound.play(worm, "sounds/boom.wav")',
  },
  {
    name: 'wa.draw',
    type: 'table',
    description: 'Direct3D 9 GPU world-space quad/ribbon drawing methods inside wa.on.draw.',
    scope: 'global',
    example: 'wa.draw.quad({ points = { ... }, blend = "add" })',
  },
  {
    name: 'wa.hud',
    type: 'table',
    description: 'HUD text lines, top-centre banners, and WA-styled text windows for presentation overlays.',
    scope: 'global',
    example: 'wa.hud.message_top("WormForge Active", { to = "all" })',
  },
  {
    name: 'wa.fire',
    type: 'table',
    description: 'Subsystem for spawning WA fire entities directly (the burning flame a Petrol Bomb lays).',
    scope: 'global',
    example: 'wa.fire.spawn({ owner = worm, x = w.x, y = w.y })',
  },
  {
    name: 'wa.perf',
    type: 'table',
    description: 'In-game performance profiling and FPS counter controls.',
    scope: 'global',
    example: 'wa.perf.enable({ counter = true, profile = true })',
  },
  {
    name: 'wa.on',
    type: 'table',
    description: 'Engine event bus for simulation hooks (hurt, missile_frame, turn_start, death, contact, etc.).',
    scope: 'global',
    example: 'wa.on.hurt(function(hit) ... end)',
  },
  {
    name: 'wa.crates',
    type: 'table',
    description: 'Crate entity management subsystem for queries and iteration.',
    scope: 'global',
    example: 'local crates = wa.crates.all()',
  },
  {
    name: 'wa.mines',
    type: 'table',
    description: 'Landmine entity management subsystem for spawning, queries, and iteration.',
    scope: 'global',
    example: 'local mine = wa.mines.spawn({ owner = worm, x = worm.x, y = worm.y })',
  },
  {
    name: 'wa.arrows',
    type: 'table',
    description: 'Arrow entity management subsystem for spawning, queries, and iteration.',
    scope: 'global',
    example: 'local arrow = wa.arrows.spawn({ owner = worm, x = worm.x, y = worm.y })',
  },
  {
    name: 'wa.missiles',
    type: 'table',
    description: 'Active projectile query subsystem.',
    scope: 'global',
    example: 'local missiles = wa.missiles.all()',
  },
  {
    name: 'wa.oil',
    type: 'table',
    description: 'Oil drum and barrel entity subsystem for spawning, queries, and iteration.',
    scope: 'global',
    example: 'local drum = wa.oil.spawn({ x = worm.x, y = worm.y })',
  },
  {
    name: 'wa.magnetism',
    type: 'table',
    description: 'Match-wide magnetic fields shared by every pack, plus a sample query for custom movement.',
    scope: 'global',
    example: 'local field = wa.magnetism.field({ source = magnet, range = 170 })',
  },
  {
    name: 'wa.graves',
    type: 'table',
    description: 'Gravestone entity subsystem for queries and resurrection logic.',
    scope: 'global',
    example: 'local graves = wa.graves.all()',
  },
  {
    name: 'wa.math',
    type: 'table',
    description: 'Deterministic trig (sin, cos, atan) that returns the same bits on every machine. The lockstep-safe replacement for math.sin / math.cos / math.atan (Lua API 4, 0.9.1).',
    scope: 'global',
    example: 'local dx = wa.math.cos(angle)',
  },
  {
    name: 'wa.panel',
    type: 'table',
    description: "Weapon panel layout: read each placed weapon's position and move them mid-round (simulation only).",
    scope: 'global',
    example: 'local layout = wa.panel.layout()',
  },
  {
    name: 'wa.assets',
    type: 'table',
    description: "Loads a component's own sprites and sounds while it installs (Lua API 4, 0.9.1).",
    scope: 'global',
    example: 'wa.assets.load({ sprites = { "sprites/star.png" }, gpu_prefix = "sprites/" })',
  },
  {
    name: 'wa.depth',
    type: 'table',
    description: 'Named draw depths; lower is nearer. Plain numbers, so wa.depth.OBJECTS - 1 sits just in front.',
    scope: 'global',
    example: 'wa.draw.quad({ points = pts, depth = wa.depth.OBJECTS })',
  },
  {
    name: 'wa.world.sky',
    type: 'number (-208)',
    description: "The height WA drops things from, in px: the engine converts its native -0x00D00000 through units.rs once, so Lua reads -208, not -13631488.",
    scope: 'global',
    example: 'a.y = wa.world.sky',
  },
  {
    name: 'wa.msg',
    type: 'table',
    description: 'Lockstep simulation and entity lifecycle message IDs table.',
    scope: 'global',
    example: 'if msg == wa.msg.FRAME_FINISH then ... end',
  },
  {
    name: 'wa.msg.FRAME_FINISH',
    type: 'int (2)',
    description: 'Per-frame simulation tick message executed on lockstep advance.',
    scope: 'global',
    example: 'if msg == wa.msg.FRAME_FINISH then ... end',
  },
  {
    name: 'wa.msg.EXPLOSION',
    type: 'int (28)',
    description: 'Blast damage and crater explosion event.',
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
    description: 'Turn begins for worm/team (0x34).',
    scope: 'global',
    example: 'if msg == wa.msg.START_TURN then ... end',
  },
  {
    name: 'wa.msg.TURN_STARTED',
    type: 'int (56)',
    description: 'A real team-turn start after the worm gains control (0x38); START_TURN also runs when Tab selects another worm.',
    scope: 'global',
    example: 'if msg == wa.msg.TURN_STARTED then ... end',
  },
  {
    name: 'wa.msg.WEAPON_RELEASED',
    type: 'int (73)',
    description: "WA's native launch notification (0x49), before an ordinary shot's final fire; not an after-fire hook for every weapon.",
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
    description: 'Special impact / direct damage message (0x4B).',
    scope: 'global',
    example: 'if msg == wa.msg.HIT then hit.amount = 10 end',
  },
  {
    name: 'wa.msg.IMPACT',
    type: 'int (118)',
    description: 'Physical contact impact collision without direct health subtraction (0x76).',
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
      { name: 'TURN_STARTED', value: 56, description: 'A real team-turn start after the worm gains control (0x38).' },
      { name: 'WEAPON_RELEASED', value: 73, description: "WA's native launch notification (0x49), before an ordinary shot's final fire." },
      { name: 'NONLETHAL', value: 59, description: 'Damage that floors at 1 HP (0x3B)' },
      { name: 'POISON', value: 62, description: 'Poison damage tick (0x3E)' },
      { name: 'HIT', value: 75, description: 'Special impact direct damage (0x4B)' },
      { name: 'IMPACT', value: 118, description: 'Impact collision without health loss (0x76)' },
    ],
  },
  {
    name: 'wa.depth',
    description:
      'Named draw depths, from api.rs:529 (lower draws nearer). Plain numbers, so `wa.depth.OBJECTS - 1` sits just in front of objects.',
    values: [
      { name: 'FRONT', value: 65536, description: '0x10000 -- nearest layer, in front of everything.' },
      { name: 'EFFECTS', value: 786432, description: '0xC0000 -- transient effects.' },
      { name: 'WORMS', value: 851968, description: '0xD0000 -- worms.' },
      { name: 'OBJECTS', value: 917504, description: '0xE0000 -- objects and actors.' },
      { name: 'TERRAIN', value: 1572864, description: '0x180000 -- the terrain picture.' },
      { name: 'BEHIND_TERRAIN', value: 1638400, description: '0x190000 -- furthest layer, behind the terrain.' },
    ],
  },
  {
    name: 'WorldHandle.kind',
    description:
      'What `handle.kind` returns. This is the ONLY discriminator on WorldHandle -- a mine, an oil drum, a crate and a grave are the same class, separated at RUN time by this string, never by a per-kind class. Compare it rather than testing the handle against a class constant. Generated from the engine\'s `kind_name` (crates/lua-host/src/actor.rs:1436).',
    values: [
      { name: 'none', value: 'none', description: 'The null handle (0). Reading .kind on a nil-in-waiting handle yields this.' },
      { name: 'mine', value: 'mine', description: 'CLASS_MINE -- a proximity mine.' },
      { name: 'missile', value: 'missile', description: 'CLASS_MISSILE -- a projectile in flight.' },
      { name: 'crate', value: 'crate', description: 'CLASS_CRATE -- a supply crate.' },
      { name: 'worm', value: 'worm', description: 'CLASS_WORM -- a live worm.' },
      { name: 'oil', value: 'oil', description: 'CLASS_OIL -- an oil drum.' },
      { name: 'grave', value: 'grave', description: 'CLASS_GRAVE -- a grave.' },
      { name: 'land', value: 'land', description: 'CLASS_LAND -- terrain, not a destructible object.' },
      { name: 'object', value: 'object', description: 'The engine\'s catch-all: any class the match above does not name.' },
    ],
  },
  {
    name: 'WormEntity.state_label',
    description:
      'What `worm.state_label` returns: the engine\'s 28-name DEBUG label table, generated from `label()` in crates/game/src/worm_state.rs. It is a SUPERSET of neither `worm.state` (READABLE_WORM_STATES, 26 names) nor `worm:set_state(...)` (SETTABLE_WORM_STATES, 6 names). Do not use it to validate a set_state argument -- only the settable list may be enforced. Derived from WORM_STATES so it cannot drift from the engine table.',
    values: WORM_STATES.map((s) => ({
      name: s.name,
      value: s.name,
      description: s.confirmed
        ? `WA 3.8.1 state 0x${s.id.toString(16).toUpperCase()}.`
        : `WA 3.8.1 state 0x${s.id.toString(16).toUpperCase()}. The engine marks this one with a "?" -- a single observation, so verify before building on it.`,
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
        description: 'Bundle-local module name, or a wf-lib/... export name',
      },
    ],
    returnType: 'any',
    description:
      'Loads a module from this bundle (`require("lib/util")` -> `lib/util.lua`) or a shared export declared by this bundle or a direct dependency (`require("wf-lib/effects/trail")`). The engine caches the module return value per consuming bundle and reports cycles. `wa` is restricted while a component and its modules load.',
    example: 'local util = require("lib/util")',
    scope: 'global',
  },
  {
    name: 'wa.log',
    parameters: [{ name: 'message', type: 'string', description: 'Log message to output to console and wkLua.log' }],
    returnType: 'void',
    description: 'Prints a message directly to WormForge native logger and console output.',
    example: 'wa.log("Mod loaded successfully!")',
  },
  {
    name: 'wa.random',
    parameters: [
      { name: 'min', type: 'int', optional: true, description: 'Inclusive lower bound, or upper bound when single argument' },
      { name: 'max', type: 'int', optional: true, description: 'Inclusive upper bound' },
    ],
    returnType: 'int',
    description: 'Draws a deterministic pseudo-random integer advancing WA\'s single shared LCG (GameWorld+0x45EC). Essential for lockstep multiplayer sync. math.random is forbidden.',
    example: 'local roll = wa.random(1, 6)',
  },
  {
    name: 'wa.sorted',
    parameters: [{ name: 'tbl', type: 'table', description: 'Key-value table to sort' }],
    returnType: 'table',
    description: 'Returns a deterministically sorted array of keys or items to prevent desyncs from Lua 5.4 randomized string hash seeds.',
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
    description: 'Returns camera centre in the world and viewport size, both in px: `{ cx, cy, w, h }`.',
    example: 'local v = wa.world.view()',
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
    description: "The synced keys: `{ left, right, up, down, jump, shift, q, space, ctrl, plus_key, minus_key, alt, pause_key, digit }` (sprint is shift's old name).",
    example: 'local k = wa.world.keys()\nif k.q then ... end',
  },
  {
    name: 'wa.world.cavern',
    parameters: [],
    returnType: 'bool',
    description: 'Returns true if current map is an enclosed cavern with an indestructible ceiling.',
    example: 'if wa.world.cavern() then ... end',
  },
  {
    name: 'wa.world.water',
    parameters: [],
    returnType: 'int',
    description: 'Returns the water height in px.',
    example: 'local water_y = wa.world.water()',
  },
  {
    name: 'wa.world.networked',
    parameters: [],
    returnType: 'bool',
    description: 'Returns true if game is currently in an online multiplayer lockstep match.',
    example: 'if wa.world.networked() then wa.log("Online match active") end',
  },
  {
    name: 'wa.world.retreat',
    parameters: [],
    returnType: 'int',
    description: 'Returns retreat timer countdown in milliseconds (0 before retreat starts). Pairs with wa.world.set_retreat().',
    example: 'local ms = wa.world.retreat()',
  },
  {
    name: 'wa.world.set_retreat',
    parameters: [
      { name: 'ms', type: 'int', description: 'Retreat time left in whole milliseconds (0..3600000); 0 ends the retreat' },
    ],
    returnType: 'bool',
    description: 'Changes a running retreat and returns whether it applied (simulation callback only). Outside a retreat, or after one has ended, it is a no-op returning false.',
    example: 'if wa.world.set_retreat(5000) then wa.log("retreat extended") end',
  },
  {
    // From the developer's own verb list (wormforge-verbs.md, fork main
    // 2026-10-03): "wa.world.turn_clock(), retreat() -- turn time and retreat
    // time left, in ms". Its neighbour was already here; this one was missing,
    // and both engines flagged it as a typo.
    name: 'wa.world.turn_clock',
    parameters: [],
    returnType: 'int',
    description: 'Returns turn timer countdown in milliseconds (0 before the turn starts).',
    example: 'local ms = wa.world.turn_clock()',
  },
  {
    name: 'wa.world.gravity',
    parameters: [],
    returnType: 'int',
    description: 'Returns WA\'s base landscape gravity in px/frame² before per-object scaling factors.',
    example: 'local g = wa.world.gravity()',
  },
  {
    name: 'wa.world.wind',
    parameters: [],
    returnType: 'int',
    description: 'Returns WA\'s live turn wind force in px/frame² before per-object aerodynamic factors.',
    example: 'local wind = wa.world.wind()',
  },
  {
    name: 'wa.world.set_gravity',
    parameters: [{ name: 'v', type: 'number', description: 'Gravity in px/frame²' }],
    returnType: 'void',
    description: 'Sets match gravity in px/frame² (simulation callback only).',
    example: 'local g = wa.world.gravity()\nwa.world.set_gravity(g * 1.5)',
  },
  {
    name: 'wa.world.set_wind',
    parameters: [{ name: 'v', type: 'number', description: 'Wind force in px/frame²' }],
    returnType: 'void',
    description: 'Sets match wind force in px/frame² (simulation callback only).',
    example: 'local w = wa.world.wind()\nwa.world.set_wind(w * 0.5)',
  },
  {
    name: 'wa.world.electrical_nearby',
    parameters: [
      { name: 'x', type: 'number', description: 'Source X in px' },
      { name: 'y', type: 'number', description: 'Source Y in px' },
      { name: 'radius_px', type: 'int', description: 'Detection radius in pixels (1..1000)' },
      { name: 'include_graves', type: 'bool', description: 'Whether to include gravestones' },
    ],
    returnType: 'table',
    description: 'Finds all nearby electrical targets (worms, mines, crates, oil drums, graves) within radius.',
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
    description: 'Raycasts along beam path against terrain and electrical targets. Returns `{ x, y, obj }` on hit or nil.',
    example: 'local hit = wa.world.electrical_trace(x0, y0, x1, y1)',
  },
  {
    name: 'wa.magnetism.field',
    parameters: [
      { name: 'spec', type: 'table', description: '{ source = actor, [range = 170], [strength = 14000], [max_force = 12], [softening = 5], [polarity = "repel"], [enabled = true], [native = true] } -- source is required and must be a live Lua actor; range in px; at most 256 fields per match' },
    ],
    returnType: 'MagneticField',
    description: "Registers a match-wide magnetic field on an actor; fields sum across packs from one simulation-step snapshot and disappear with their source. Actors opt in with magnetic = 1. Simulation callbacks only.",
    example: 'local field = wa.magnetism.field({ source = magnet_actor, range = 170, polarity = "repel" })',
  },
  {
    name: 'wa.magnetism.sample',
    parameters: [
      { name: 'x', type: 'number', description: 'Sample X in px' },
      { name: 'y', type: 'number', description: 'Sample Y in px' },
      { name: 'actor', type: 'LuaActor', optional: true, description: 'The actor whose movement the sample drives; excluded from its own fields and usable only in a simulation callback' },
    ],
    returnType: 'number, number, bool, bool',
    description: "The fields' force at a point, for custom movement; with an actor, as that actor feels it. Point-only sampling is read-only, so HUD/draw may call it; tracked sampling with an actor needs a simulation callback. The four results are fx, fy, inside and waking.",
    example: 'local fx, fy, inside, waking = wa.magnetism.sample(x, y, actor)',
  },
  {
    name: 'wa.land.solid',
    parameters: [
      { name: 'x', type: 'number', description: 'X coordinate in px' },
      { name: 'y', type: 'number', description: 'Y coordinate in px' },
    ],
    returnType: 'bool',
    description: 'Tests if a world coordinate is solid terrain dirt in the collision walk mask.',
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
    description: 'Bresenham hitscan raycast across landscape collision mask. Returns `{ x, y, hit = true, starts_solid = bool, nx, ny, tx, ty }` on hit or nil.',
    example: 'local hit = wa.land.trace(a.x, a.y, target.x, target.y)',
  },
  // `wa.land.dig` is GONE in WormForge 0.9.1: the engine nils it on purpose
  // (crates/lua-host/src/lib.rs:1279 -- "dig is cut's circle now"), and no file
  // in the new mods tree calls it. wa.land.cut{ shape = "circle" } replaced it.
  {
    name: 'wa.land.cut',
    parameters: [
      { name: 'spec', type: 'table', description: '{ x = int, y = int, shape = "circle" | "drill" | "torch", radius = int (1..200), facing = -1 | 1, angle = number (-1..1) } -- x/y in px' },
    ],
    returnType: 'void',
    description: "Cuts the land: a round hole (radius 1..200), WA's drill shape, or its blowtorch tunnel (facing ±1, angle −1..1) (simulation callback only). This replaced the removed wa.land.dig.",
    example: 'wa.land.cut({ x = worm.x, y = worm.y, shape = "circle", radius = 24 })',
  },
  {
    name: 'wa.land.stamp',
    parameters: [
      { name: 'spec', type: 'table', description: '{ sprite = string, frame = int, x = int, y = int }' },
    ],
    returnType: 'void',
    description: 'Stamps a pack sprite sheet frame into landscape terrain collision and picture (simulation callback only).',
    example: 'wa.land.stamp({ sprite = "sprites/javelin_stamp.png", frame = 0, x = worm.x, y = worm.y })',
  },
  {
    name: 'wa.worms.all',
    parameters: [{ name: 'from', type: 'entity', optional: true, description: 'Optional entity starting point' }],
    returnType: 'table',
    description: 'Returns array of all active worms across all teams in reproducible walk order.',
    example: 'for _, w in ipairs(wa.worms.all()) do ... end',
  },
  {
    name: 'wa.worms.nearest',
    parameters: [{ name: 'from', type: 'entity', description: 'Source worm, actor, or world object' }],
    returnType: 'WormHandle | nil',
    description: 'Finds nearest worm to the specified entity coordinates.',
    example: 'local target = wa.worms.nearest(a)',
  },
  {
    name: 'wa.crates.all',
    parameters: [{ name: 'from', type: 'entity', optional: true, description: 'Optional search origin' }],
    returnType: 'table',
    description: 'Returns array of all active crate objects (WorldHandle) in the world.',
    example: 'for _, crate in ipairs(wa.crates.all()) do ... end',
  },
  {
    name: 'wa.mines.all',
    parameters: [{ name: 'from', type: 'entity', optional: true, description: 'Optional search origin' }],
    returnType: 'table',
    description: 'Returns array of all active landmine objects (WorldHandle) in the world.',
    example: 'for _, mine in ipairs(wa.mines.all()) do\n  mine:arm(1000)\nend',
  },
  {
    name: 'wa.mines.spawn',
    parameters: [
      { name: 'spec', type: 'table', description: '{ owner = <worm|actor>, x = number, y = number, [vx], [vy], [fuse], [arm], [damage], [radius], [dud_proof] } -- x/y in px and required; speeds in px/frame; fuse/arm in ms; radius in px. Defaults: fuse 400, arm 0, damage 50, radius 48, dud_proof false' },
    ],
    returnType: 'WorldHandle',
    description: "Builds one of WA's mines, as Project X's new CMine: WA flies, arms, triggers and explodes it as its own. A worm owner's team lays it; an actor's mine is the map's. Simulation callbacks only.",
    example: 'local mine = wa.mines.spawn({ owner = worm, x = worm.x, y = worm.y, fuse = 400, damage = 50 })',
  },
  {
    name: 'wa.missiles.all',
    parameters: [{ name: 'from', type: 'entity', optional: true, description: 'Optional search origin' }],
    returnType: 'table',
    description: 'Returns array of all active in-flight missile objects (WorldHandle) in the world.',
    example: 'for _, m in ipairs(wa.missiles.all()) do ... end',
  },
  {
    name: 'wa.oil.all',
    parameters: [{ name: 'from', type: 'entity', optional: true, description: 'Optional search origin' }],
    returnType: 'table',
    description: 'Returns array of all active oil drum / barrel objects (WorldHandle) in the world.',
    example: 'for _, drum in ipairs(wa.oil.all()) do\n  drum:hit(50, 0, 0)\nend',
  },
  {
    name: 'wa.oil.spawn',
    parameters: [
      { name: 'spec', type: 'table', description: '{ x = number, y = number, snap = true } -- x/y in px and required. snap drops it until it lands; snap = false starts it where it is put' },
    ],
    returnType: 'WorldHandle',
    description: "Builds one of WA's oil drums, as the level's hazardous objects are made. Simulation callbacks only.",
    example: 'local drum = wa.oil.spawn({ x = worm.x, y = worm.y, snap = true })',
  },
  {
    name: 'wa.graves.all',
    parameters: [{ name: 'from', type: 'entity', optional: true, description: 'Optional search origin' }],
    returnType: 'table',
    description: 'Returns array of all active gravestone objects (WorldHandle) in the world.',
    example: 'for _, grave in ipairs(wa.graves.all()) do ... end',
  },
  {
    name: 'wa.actors.spawn',
    parameters: [
      { name: 'spec', type: 'table', description: 'Spawn configuration: sprite, x, y, vx, vy, gravity, loop, collide, collide_terrain, collide_worms, damage_terrain, damage_worms, persist, drown, mask, mask_worms, mask_land, mask_weapons, mask_actors, cursor, origin = "center"|"bottom", from = "sky"|"cursor"|"owner", owner, magnetic, explode, on_explode, cluster, screen, on' }
    ],
    returnType: 'ActorHandle',
    description: 'Spawns a native LuaActor into the world. Returns the spawned ActorHandle.',
    example: `local a = wa.actors.spawn({
  sprite = "sprites/blade.png",
  origin = "center",
  gravity = false,
  owner = worm,
  on = function(a, ev)
    a:move({ terrain = true })
  end,
})`,
  },
  {
    name: 'wa.actors.all',
    parameters: [],
    returnType: 'table',
    description: 'Returns array of all currently active LuaActors in spawn order.',
    example: 'for _, a in ipairs(wa.actors.all()) do ... end',
  },
  {
    name: 'wa.actors.kind',
    parameters: [{ name: 'name', type: 'string', description: 'Kind name' }],
    returnType: 'string',
    description: 'Returns namespaced actor kind identifier `mod_id.name`.',
    example: 'local kind = wa.actors.kind("sentry")',
  },
  {
    name: 'wa.cursor.spawn',
    parameters: [
      { name: 'spec', type: 'table', description: '{ owner = worm, on = function(c, ev) ... end, sprite = "cursor", [x], [y] }' }
    ],
    returnType: 'ActorHandle',
    description: 'Spawns a synchronized ACTOR_FLAG_CURSOR actor that automatically follows world pointer coordinates and plays cursor ease-in.',
    example: 'wa.cursor.spawn({ owner = worm, on = function(c, ev) ... end })',
  },
  {
    name: 'wa.weapons.replace',
    parameters: [
      { name: 'spec', type: 'table', description: 'The claim (id, name, copy_from, panel_icon, icon, actor, is_weapon, eat_fire, click_finish, fire_repeat, …), plus the record groups fires, handling, missile, clusters, mine, gun, strike, jet_pack and raw. Every key is listed under Tables → wa.weapons.replace.' }
    ],
    returnType: 'void',
    description: "In a weapon component's install: claims the weapon's own slot and gives it this record, art and behaviour. It names no slot. `patch` and the old flat damage/blast keys are hard errors in Lua API 4 -- name the record fields instead.",
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
    name: 'wa.weapons.register',
    parameters: [{ name: 'spec', type: 'table', description: '{ id, based_on, name, [panel_icon], ... }' }],
    returnType: 'void',
    description: 'Registers a named weapon that maps onto a stock based_on slot.',
    example: `wa.weapons.register({
  id = "my_pack.super_missile",
  based_on = "bazooka",
  name = "Super Missile",
})`,
  },
  {
    name: 'wa.weapons.retarget',
    parameters: [{ name: 'spec', type: 'table', description: '{ weapon = "bazooka", sprite = "banana", [cluster = "clustlet"] }' }],
    returnType: 'void',
    description: 'Swaps a weapon slot\'s in-flight body graphic dynamically after the weapon table is live.',
    example: 'wa.weapons.retarget({ weapon = "bazooka", sprite = "banana" })',
  },
  {
    name: 'wa.weapons.launch',
    parameters: [
      {
        name: 'spec',
        type: 'table',
        description:
          '{ weapon = "stock.bazooka", owner = worm, x = x, y = y, vx = vx, vy = vy, missile = { explosion = { power = 50 }, fuse = 5000, trail = { sprite = 0 }, ... }, clusters = { ... } }. The flat damage/sprite/fuse/sound/explode_into/countdown/explode_on_space keys were removed in Lua API 4 and are errors; every key is under Tables → wa.weapons.launch.',
      },
    ],
    returnType: 'int',
    description:
      "Spawns an authentic engine MissileEntity directly from a weapon slot's fire parameters. Lockstep, wind, trail, and collision stay native WA. Returns the spawned missile ID.",
    example: `local id = wa.weapons.launch({
  weapon = "stock.bazooka", owner = worm, x = worm.x, y = worm.y - 16, vx = 5, vy = -8,
  missile = { explosion = { power = 60 }, fuse = 5000, trail = { sprite = 0 } },
})`,
  },
  {
    name: 'wa.weapons.fire',
    parameters: [{ name: 'spec', type: 'table', description: '{ weapon = string, worm, x = number, y = number, vx = number, vy = number, ... } -- px positions, px/frame speeds; extra fields reach the on_fire handler' }],
    returnType: 'void',
    description: "Runs whichever pack's on_fire claims that slot, from a script; extra fields reach the handler. Only that pack's handler runs (sim callback only).",
    example: 'wa.weapons.fire({ weapon = "baseball_bat", worm = worm, x = worm.x, y = worm.y })',
  },
  {
    name: 'wa.weapons.click',
    parameters: [{ name: 'spec', type: 'table', description: '{ weapon = string, worm, x = number, y = number, vx = number, vy = number } -- px positions, px/frame speeds' }],
    returnType: 'void',
    description: "Runs whichever pack's on_click claims that slot, from a script. Only that pack's handler runs (sim callback only).",
    example: 'wa.weapons.click({ weapon = "sheep_strike", worm = worm, x = worm.x, y = worm.y, vx = 5 })',
  },
  {
    name: 'wa.weapons.notify_grant',
    parameters: [{ name: 'spec', type: 'table', description: '{ worm, items = { { weapon = string, amount = int }, ... }, x = number, y = number } -- x/y optional, px' }],
    returnType: 'void',
    description: 'Reports weapons a script granted directly, as a weapon_grant event. Never changes ammo (sim callback only).',
    example: 'wa.weapons.notify_grant({ worm = worm, items = { { weapon = "grenade", amount = 2 } } })',
  },
  {
    name: 'wa.sprites.key',
    parameters: [{ name: 'relative', type: 'string', description: 'Pack-relative sprite path' }],
    returnType: 'string',
    description: 'Returns namespaced sprite key (`mod_id:path`) for use with a:look or spawn.sprite.',
    example: 'a:look(wa.sprites.key("sprites/saw.png"))',
  },
  {
    name: 'wa.sound.play',
    parameters: [
      { name: 'target', type: 'entity', description: 'WormHandle, ActorHandle, or WorldHandle' },
      { name: 'id', type: 'int | string', description: 'Stock sound ID or pack WAV path' },
      { name: 'flags', type: 'int', optional: true, description: 'Playback flags (default 8)' },
    ],
    returnType: 'void',
    description: 'Plays a spatial sound effect located at the target entity position.',
    example: 'wa.sound.play(worm, "sounds/shoot.wav")',
  },
  {
    name: 'wa.draw.quad',
    parameters: [
      { name: 'spec', type: 'table', description: '{ points = { {x, y}, {x, y}, {x, y}, {x, y} }, color = 0xAARRGGBB | colors = { c1, c2, c3, c4 }, sprite = "name", [frame = int], [blend = "alpha"|"add"], [depth = int] }' }
    ],
    returnType: 'void',
    description: 'Issues world-space GPU quad each rendered frame inside wa.on.draw.',
    example: 'wa.draw.quad({ points = { {x1, y1}, {x2, y2}, {x3, y3}, {x4, y4} }, sprite = "laser", blend = "add" })',
  },
  {
    name: 'wa.draw.ribbon',
    parameters: [
      { name: 'spec', type: 'table', description: '{ points = { { x, y, width, color, u }, ... }, sprite = "name", [frame = int], [blend = "alpha"|"add"], [depth = int] }' }
    ],
    returnType: 'void',
    description: 'Draws a continuous textured GPU ribbon with smooth miter joints inside wa.on.draw.',
    example: 'wa.draw.ribbon({ points = beam_points, sprite = "beam.png", blend = "add" })',
  },
  {
    name: 'wa.draw.random',
    parameters: [],
    returnType: 'float',
    description: 'Generates a client-local pseudo-random float in range [0.0, 1.0) for visual jitter inside wa.on.draw. Does NOT advance WA lockstep RNG.',
    example: 'local jitter = (wa.draw.random() - 0.5) * 4',
  },
  {
    name: 'wa.hud.line',
    parameters: [
      { name: 'text', type: 'string', description: 'Text string to display' },
      { name: 'x', type: 'int', optional: true, description: 'Screen X offset (default 14)' },
      { name: 'y', type: 'int', optional: true, description: 'Screen Y offset (default auto-stacked)' },
    ],
    returnType: 'void',
    description: 'Pushes a text line onto the HUD overlay during wa.on.hud callback.',
    example: 'wa.hud.line("Score: " .. score, 14, 30)',
  },
  {
    name: 'wa.hud.message_top',
    parameters: [
      { name: 'text', type: 'string', description: 'One line of at most 127 bytes' },
      { name: 'opts', type: 'table', optional: true, description: '{ to = "all" | "active" | "coalition", alliance = int }' },
    ],
    returnType: 'void',
    description: 'WA\'s top-centre banner, as selecting a weapon shows it: one line of at most 127 bytes. to is "all" (default), "active" (the player whose turn it is) or "coalition" (the active team\'s, or alliance 0-5). Call from simulation events.',
    example: 'wa.hud.message_top("WormForge", { to = "all" })',
  },
  {
    name: 'wa.hud.window',
    parameters: [
      { name: 'spec', type: 'table', description: '{ text | lines, x, y, align, font, color, border, max_width, to, alliance, over_panel }' },
    ],
    returnType: 'WindowHandle',
    description: 'A text window in WA\'s own fonts and box style, sized to its text, open until closed or the match ends; returns a handle. text takes \\n line breaks; lines = { "a", { "b", color = "yellow" } } colours lines. font: small, standard (the round timer\'s) or medium. color and border: white, grey, red, blue, green, yellow, purple, cyan; border "none". max_width wraps at spaces. align names the box\'s and the screen\'s point x, y offset it from (top_left ... bottom_right, center). to / alliance as message_top, taken when given. Fades out while the weapon panel is open unless over_panel = true. Drawn over WA\'s HUD on the GPU layer (Direct3D 9 shader). At most 32 open.',
    example: 'local window = wa.hud.window({ text = "Turn 3", x = 10, y = 10, align = "top_left" })',
  },
  {
    name: 'wa.fire.spawn',
    parameters: [
      { name: 'spec', type: 'table', description: '{ owner = <worm|actor>, x = number, y = number, [vx], [vy], [count], [duration], [up_power], [damage], [damage_scale], [knock_scale], [tint = 0xRRGGBB] } -- x/y in px and required; duration in ms; up_power a native integer; damage_scale/knock_scale factors; the rest default to WA' }
    ],
    returnType: 'void',
    description: "Spawns one of WA's fire entities, as a Petrol Bomb does. Valid only inside a simulation callback, and owner must resolve to a worm or actor.",
    example: 'wa.fire.spawn({ owner = worm, x = target.x, y = target.y, damage = 20 })',
  },
  {
    name: 'wa.perf.enable',
    parameters: [
      { name: 'opts', type: 'table', optional: true, description: '{ counter = bool, profile = bool }' }
    ],
    returnType: 'void',
    description: 'Enables the in-game FPS counter and section profiler in wkLua.log.',
    example: 'wa.perf.enable({ counter = true, profile = true })',
  },
  {
    name: 'wa.inventory.create',
    parameters: [
      { name: 'spec', type: 'table', description: '{ id = "store_id", slots = { "bazooka", "grenade", ... } }' }
    ],
    returnType: 'InventoryStore',
    description: 'Creates a pack-scoped virtual inventory store keyed by stable worm IDs for classes, drafting, and Highlander steal-on-kill rules.',
    example: 'local inv = wa.inventory.create({ id = "loot", slots = { "bazooka", "grenade" } })',
  },
  {
    name: 'wa.on.turn_retreat',
    parameters: [{ name: 'callback', type: 'function', description: 'function(worm) - worm is the active worm when it retreats' }],
    returnType: 'void',
    description: 'Hook fired when the active worm retreats, ending its turn early.',
    example: 'wa.on.turn_retreat(function(worm)\n  -- worm used its retreat\nend)',
  },
  {
    name: 'wa.on.turn_end',
    parameters: [{ name: 'callback', type: 'function', description: 'function(worm) - worm is the active worm at end of turn' }],
    returnType: 'void',
    description: 'Hook fired when a turn ends, after the worm finishes its move.',
    example: 'wa.on.turn_end(function(worm)\n  -- turn is over\nend)',
  },
  {
    name: 'wa.on.turn_cleanup',
    parameters: [{ name: 'callback', type: 'function', description: 'function(worm) - worm is the active worm during turn cleanup' }],
    returnType: 'void',
    description: 'Hook fired during turn cleanup, after turn_end, for final per-turn bookkeeping.',
    example: 'wa.on.turn_cleanup(function(worm)\n  -- safe to reset per-turn state\nend)',
  },
  {
    name: 'wa.on.gravity_before',
    parameters: [{ name: 'callback', type: 'function', description: 'function(m) - m is motion table, modify damp, wind_scale, gravity_scale' }],
    returnType: 'void',
    description: 'Hook executed immediately before projectile gravity, wind, and damping calculation.',
    example: 'wa.on.gravity_before(function(m)\n  m.wind_scale = 0\nend)',
  },
  {
    name: 'wa.on.gravity_after',
    parameters: [{ name: 'callback', type: 'function', description: 'function(m) - m is motion table, modify vx, vy, x, y' }],
    returnType: 'void',
    description: 'Hook executed immediately after projectile gravity calculation to adjust velocity or position.',
    example: 'wa.on.gravity_after(function(m)\n  m.vx = m.vx * 2\nend)',
  },
  {
    name: 'wa.on.missile_frame',
    parameters: [{ name: 'callback', type: 'function', description: 'function(m) - m has id, weapon, sprite, collision_mask, msg, phase; x/y in px, vx/vy in px/frame, damp/wind_scale/gravity_scale as factors (1.0 = normal)' }],
    returnType: 'void',
    description: 'Ticked every frame for active in-flight projectiles. Inspects physics and writing m.sprite to dynamically swap or hide flight graphics (e.g. m.sprite = 0).',
    example: 'wa.on.missile_frame(function(m)\n  if m.weapon == "chilli_bomb" then m.sprite = 0 end\nend)',
  },
  {
    name: 'wa.on.worm_message',
    parameters: [
      { name: 'callback', type: 'function', description: 'function(worm, msg) - return "eat" to swallow message' },
      { name: 'opts', type: 'table', optional: true, description: '{ msgs = { wa.msg.FRAME_FINISH, wa.msg.JUMP } } - only enter Lua for these messages' },
    ],
    returnType: 'void',
    description: 'Intercepts worm lockstep messages (such as jump, start_turn). Return "eat" to swallow. Pass `opts.msgs` to name the messages you want: WA sends every worm several messages a frame and enters Lua for each one, so a handler that checks `msg` itself still pays for every message it ignores. Filtered and unfiltered handlers run together in registration order, so filtering changes neither the order anything runs in nor what gets eaten.',
    example: 'wa.on.worm_message(function(worm, msg)\n  if msg == wa.msg.JUMP then return "eat" end\nend, { msgs = { wa.msg.JUMP } })',
  },
  {
    name: 'wa.on.hurt',
    parameters: [{ name: 'callback', type: 'function', description: 'function(hit) - hit has worm, attacker, attacker_team, by, weapon, slot, kind, amount, lost, hp, phase' }],
    returnType: 'void',
    description: 'Intercepts damage calculation. In "pre" phase, return "eat" to negate hit entirely or modify hit.amount.',
    example: 'wa.on.hurt(function(hit)\n  if hit.phase == "pre" and hit.kind == "blast" then return "eat" end\nend)',
  },
  {
    name: 'wa.on.turn_start',
    parameters: [{ name: 'callback', type: 'function', description: 'function(event) - event.worm is the active WormHandle' }],
    returnType: 'void',
    description: 'Receives the active worm directly when a turn begins from WA lockstep START_TURN message.',
    example: 'wa.on.turn_start(function(event)\n  wa.log("Turn started for " .. tostring(event.worm.id))\nend)',
  },
  {
    name: 'wa.on.death',
    parameters: [{ name: 'callback', type: 'function', description: 'function(event) - event.victim, event.attacker, event.attacker_team, event.weapon, event.kind' }],
    returnType: 'void',
    description: 'Emits exactly once per worm death with victim, active worm, attacker, weapon, and combat attribution.',
    example: 'wa.on.death(function(event)\n  if event.attacker then wa.log("Worm killed by attacker " .. tostring(event.attacker.id)) end\nend)',
  },
  {
    name: 'wa.on.hud',
    parameters: [{ name: 'callback', type: 'function', description: 'function() called once per rendered frame for HUD overlay' }],
    returnType: 'void',
    description: 'Runs during HUD rendering pass to output text via wa.hud.line.',
    example: 'wa.on.hud(function()\n  wa.hud.line("Game Active", 14, 20)\nend)',
  },
  {
    name: 'wa.on.draw',
    parameters: [{ name: 'callback', type: 'function', description: 'function() called once per rendered frame after simulation' }],
    returnType: 'void',
    description: 'Runs once per Present to draw world-space GPU quads (wa.draw.quad, wa.draw.ribbon). wa.random is forbidden inside this callback.',
    example: 'wa.on.draw(function()\n  wa.draw.quad({ points = { ... }, blend = "add" })\nend)',
  },
  {
    name: 'wa.on.oil_explode',
    parameters: [{ name: 'callback', type: 'function', description: 'function(ev) - ev.drum is the WorldHandle, ev.x and ev.y are px, ev.team is the team whose shot set it off (0 none), and ev:replace() stands in for WA\'s blast, fires and sound' }],
    returnType: 'void',
    description: "When WA is about to blow up an oil drum, in the simulation. ev:replace() stands in for WA's blast, fires and sound, as Project X's COilDrum::Explosion; WA frees the drum either way.",
    example: 'wa.on.oil_explode(function(ev)\n  if ev.team == 3 then ev:replace() end\nend)',
  },
  {
    name: 'wa.on.contact',
    parameters: [{ name: 'callback', type: 'function', description: 'function(worm, other, c) - c.vx and c.vy are px/frame pre-impact speeds' }],
    returnType: 'void',
    description: 'Fires on worm↔entity contact after simulation frame. c.vx and c.vy contain pre-impact velocity (px/frame), c.flags holds WA contact bits.',
    example: 'wa.on.contact(function(worm, other, c)\n  wa.log("Contact with speed " .. tostring(c.vx))\nend)',
  },
  {
    name: 'wa.on.weapon_grant',
    parameters: [{ name: 'callback', type: 'function', description: 'function(event) - event.source, event.worm_id, event.alliance (nil if unavailable), event.frame, event.x, event.y (px), event.items = { { weapon, amount }, ... }' }],
    returnType: 'void',
    description: 'Fires when weapons are granted (e.g. a crate pickup). Carries the grant frame and origin so a viewer can animate it.',
    example: 'wa.on.weapon_grant(function(event)\n  for _, item in ipairs(event.items) do wa.log(item.weapon) end\nend)',
  },
  {
    name: 'wa.weapons.visual',
    parameters: [{ name: 'weapon', type: 'string', description: 'Weapon name' }],
    returnType: 'table | nil',
    description: 'Returns presentation art for a weapon: { sprite, frame, kind, width, height }, or nil.',
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
    description: 'True if the alliance belongs to the local player. Presentation only.',
    example: 'if wa.world.is_local_alliance(p.alliance) then ... end',
  },
  {
    name: 'wa.world.trace',
    parameters: [{ name: 'spec', type: 'table', description: '{ x0, y0, x1, y1, radius, with = { ... } }' }],
    returnType: 'table | nil',
    description: 'Sweeps a circle from one point to the other against WA\'s own collision bitmap. Returns nil on a clear path, else the hit table (hit, x, y, nx, ny, tx, ty, obj, starts_solid, left_x, left_y).',
    example: 'wa.world.trace({ x0 = x0, y0 = y0, x1 = x1, y1 = y1, radius = 16 })',
  },
  {
    name: 'wa.crates.spawn',
    parameters: [{ name: 'spec', type: 'table', description: '{ x, y, kind = "weapon"|"utility"|"health", health, drop = "chute"|"teleport" }' }],
    returnType: 'WorldHandle | nil',
    description: 'Spawns a crate (sim callback only). kind selects the contents; health is 1 for health crates. Returns the crate, or nil on error.',
    example: 'local c = wa.crates.spawn({ x = w.x, y = w.y, kind = "weapon", health = 25, drop = "teleport" })',
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
    description: 'Deterministic arctangent, in radians. Use instead of math.atan.',
    example: 'local ang = wa.math.atan(dy, dx)',
  },

  {
    name: 'wa.world.collides',
    parameters: [{ name: 'spec', type: 'table', description: '{ x, y, radius, with = { "terrain", "worms", "mines", "crates", "oil" } }' }],
    returnType: 'bool, table | nil',
    description: 'Tests a circle against terrain and/or world objects. Returns whether it collides, plus the first object hit.',
    example: 'local hit, obj = wa.world.collides({ x = a.x, y = a.y, radius = 8, with = { "worms" } })',
  },
  {
    name: 'wa.on.body_move',
    parameters: [
      { name: 'callback', type: 'function', description: 'function(body) - called as bodies move' },
      { name: 'opts', type: 'table', optional: true, description: '{ kinds = { "worm", "missile", "mine", "crate", "oil", "grave", "arrow" } }' },
    ],
    returnType: 'void',
    description: 'Hook fired when a body moves. Pass opts.kinds to receive only some body kinds.',
    example: 'wa.on.body_move(function(body) ... end, { kinds = { "worm" } })',
  },
  {
    name: 'wa.worms.spawn',
    parameters: [{ name: 'spec', type: 'table', description: '{ team, x, y, name, health }' }],
    returnType: 'WormHandle',
    description: 'Spawns a new worm for a team (sim callback only).',
    example: 'wa.worms.spawn({ team = worm.team, x = x, y = y, name = "Reinforcement", health = 200 })',
  },
  {
    name: 'wa.arrows.all',
    parameters: [{ name: 'from', type: 'entity', optional: true, description: 'Optional search origin' }],
    returnType: 'table',
    description: 'Returns all active arrow objects (WorldHandle).',
    example: 'for _, ar in ipairs(wa.arrows.all()) do ... end',
  },
  {
    name: 'wa.arrows.spawn',
    parameters: [
      { name: 'spec', type: 'table', description: '{ owner = <worm|actor>, x = number, y = number, [vx], [vy], [damage], [gravity_pct] } -- x/y in px and required; speeds in px/frame; damage defaults to 10; gravity_pct defaults to 100' },
    ],
    returnType: 'WorldHandle | nil',
    description: "Builds one of WA's arrows, as Project X's new CArrow; nil when WA makes none (its object pool full, or inside land). Simulation callbacks only.",
    example: 'local arrow = wa.arrows.spawn({ owner = worm, x = worm.x, y = worm.y, vx = 4, vy = -3 })',
  },

  // ---- Lua API 4 additions (WormForge 0.9.1/0.9.11, Lua/verbs 9.11 api 4.0.txt) --
  // Every entry below was verified against crates/lua-host before being added --
  // the wa-namespace-typo check warns on anything missing here, so a gap is a
  // FALSE POSITIVE on valid API 4 code.
  {
    name: 'wa.assets.load',
    parameters: [
      { name: 'spec', type: 'table', description: '{ sprites = { "sprites/star.png", ... }, sounds = { "sounds/boom.wav", ... }, gpu_prefix = "sprites/" }' },
    ],
    returnType: 'void',
    description: "Loads a component's own sprites and sounds on no weapon, from its install: how an add-on draws and plays its own art. Error outside an install (api.rs:312).",
    example: 'wa.assets.load({ sprites = { "sprites/star.png" }, gpu_prefix = "sprites/" })',
  },
  {
    name: 'wa.panel.layout',
    parameters: [],
    returnType: 'table',
    description: "Each placed weapon's panel position by id: rows F1..F12 and utility, columns 1..10.",
    example: 'local layout = wa.panel.layout()\nwa.log(layout["stock.uzi"].row)',
  },
  {
    name: 'wa.panel.set_layout',
    parameters: [{ name: 'spec', type: 'table', description: '{ ["<weapon id>"] = { row = "F3", column = 3 }, ... }' }],
    returnType: 'void',
    description: 'Moves placed weapons on the panel mid-round (simulation only). Only where a weapon shows changes: F-keys and clicks follow at once.',
    example: 'wa.panel.set_layout({ ["px.javelin"] = { row = "F3", column = 3 } })',
  },
  {
    name: 'wa.weapons.data',
    parameters: [{ name: 'weapon', type: 'string', description: "Weapon id: a placed weapon (px.javelin) or stock.<name>" }],
    returnType: 'table',
    description: "A weapon's record as the claim's named tables, with fires.as naming its family: a placed weapon's as this round has it, WA's untouched one for a stock.<name> not on the panel.",
    example: 'local data = wa.weapons.data("stock.bazooka")',
  },
  {
    name: 'wa.weapons.fire_bullet',
    parameters: [
      { name: 'spec', type: 'table', description: '{ weapon = "stock.shotgun", owner = worm, x = int, y = int, dx = number, dy = number, damage = int, ignore = entity } -- x/y in px; owner must be a living worm' },
    ],
    returnType: 'void',
    description: "Fires one native hitscan round from a point, as WA's shotgun, handgun, uzi or minigun (weapon = stock.<name>, a template). Simulation callbacks only.",
    example: 'wa.weapons.fire_bullet({ weapon = "stock.shotgun", owner = worm, x = worm.x, y = worm.y, dx = 1, dy = 0, damage = 25 })',
  },
  {
    name: 'wa.weapons.panel_icon',
    parameters: [
      { name: 'weapon', type: 'string', description: 'Weapon id' },
      { name: 'n', type: 'int', description: "0 = the weapon's panel_icon, 1 and on = panel_icons[n]" },
    ],
    returnType: 'void',
    description: "Shows icon n in the weapon's panel tile. Only the panel changes, so any callback may call it.",
    example: 'wa.weapons.panel_icon("px.javelin", 1)',
  },
  {
    // Documented in the 0.9.1 release verb list ("Since 0.9.1") but not present
    // in the vendored WormForge-main source snapshot yet (grep: zero hits). Added
    // anyway: the namespace check only warns, so listing it costs a missed
    // finding, while NOT listing it would flag working code -- and a false
    // positive on valid code is the worse error.
    name: 'wa.weapons.hold_sheet',
    parameters: [
      { name: 'weapon', type: 'string', description: 'Weapon id' },
      { name: 'n', type: 'int', description: "0 = the hold's sheet, 1 and on = hold.sheets[n]" },
    ],
    returnType: 'void',
    description: "Draws held sheet n over the worm's aim pose: 0 the hold's sheet, 1 and on its hold.sheets (same frames and placement). Draw only, per weapon, so any callback may call it; as Project X swaps a WormSprite's sprite (the Gravity Gun's claws opening).",
    example: 'wa.weapons.hold_sheet("px.gravity_gun", 1)',
  },
  {
    name: 'wa.weapons.set_selectable',
    parameters: [
      { name: 'spec', type: 'table', description: '{ weapon = string, team = int (1..6), selectable = bool }' },
    ],
    returnType: 'void',
    description: 'Whether a team (1 to 6) may select a placed weapon for now: one it may not is greyed on the panel, can\'t be picked and is skipped by the F-keys until it may again. Every round starts with all selectable. Simulation callbacks only.',
    example: 'wa.weapons.set_selectable({ weapon = "px.javelin", team = 2, selectable = false })',
  },
  {
    name: 'wa.world.set_turn_clock',
    parameters: [{ name: 'ms', type: 'int', description: 'Turn clock remaining in milliseconds (the engine rejects values below 1)' }],
    returnType: 'void',
    description: 'Sets the turn clock (simulation callback only); pairs with wa.world.turn_clock() and wa.world.retreat().',
    example: 'wa.world.set_turn_clock(45000)',
  },

  // ---- Lua API 4 additions in WormForge 0.9.11 (fog of war) -------------------
  // Source: the 0.9.11 release verb list (`spec/verbs 9.11 api 4.0.txt`, updated
  // 2026-10-19). The vendored WormForge-main snapshot is still 0.9.1 and has no
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
    description: 'Replaces the live fog settings, starting from the current ones. Every key is validated first; a bad key or value raises an error naming its range and leaves the fog unchanged. fog_floor = 100 (a fully lit map) turns terrain memory off.',
    example: 'wa.fog.set({ circle_radius = 120, fog_floor = 40 })',
  },
  {
    name: 'wa.fog.get',
    parameters: [{ name: 'name', type: 'string', description: 'Fog setting name, e.g. "circle_radius"' }],
    returnType: 'any',
    description: "A fog setting's current value, or nil for an unknown name.",
    example: 'local radius = wa.fog.get("circle_radius")',
  },
  {
    name: 'wa.fog.defaults',
    parameters: [],
    returnType: 'table',
    description: "Every fog setting's default, as { name = value }.",
    example: 'local defaults = wa.fog.defaults()',
  },
  {
    name: 'wa.fog.enable',
    parameters: [{ name: 'on', type: 'bool', description: 'true turns the fog on, false off' }],
    returnType: 'void',
    description: 'Turns the fog on or off for the match. Only for packs that declare [fog] in mod.toml.',
    example: 'wa.fog.enable(true)',
  },
  {
    name: 'wa.fog.enabled',
    parameters: [],
    returnType: 'bool',
    description: 'Whether the fog is on.',
    example: 'if wa.fog.enabled() then ... end',
  },
  {
    name: 'wa.fog.visible',
    parameters: [
      { name: 'x', type: 'number', description: 'X in px' },
      { name: 'y', type: 'number', description: 'Y in px' },
    ],
    returnType: 'number',
    description: "This machine's brightness at a point, 0..255, including the floor and shade. Draw and HUD callbacks only: local visibility must never steer the simulation.",
    example: 'local brightness = wa.fog.visible(worm.x, worm.y)',
  },
  {
    name: 'wa.fog.light',
    parameters: [
      { name: 'spec', type: 'table', description: '{ x, y, kind, mode, circle, cone = { length, width, toward }, shadow_cast, seen_by, owner, discover, strength, fade }' },
    ],
    returnType: 'LightHandle',
    description: "A light without an actor, returning a handle. Same keys as a.light, plus a place, an optional owner worm and fade (milliseconds: the circle closes like a blast's, then the light is removed). Seen by everyone unless owner is given. Its cone needs numeric toward degrees, since it has no heading. At most 64 free lights.",
    example: 'local light = wa.fog.light({ x = 100, y = 200, kind = "projectile" })',
  },

];

export const BUILTIN_CLASSES: ClassDef[] = [
  {
    name: 'LuaActor',
    description: 'Custom game entity with physics, animation, collision, and brain logic (ActorHandle).',
    syntaxExample: 'local a = wa.actors.spawn({...})\na:gravity()\na:move({ terrain = true })',
    members: [
      { name: 'id', kind: 'property', returnType: 'int', description: 'Deterministic spawn sequence number' },
      { name: 'kind', kind: 'property', returnType: 'string', description: 'Always "actor"' },
      { name: 'x', kind: 'variable', returnType: 'number', description: 'Position X in px' },
      { name: 'y', kind: 'variable', returnType: 'number', description: 'Position Y in px' },
      { name: 'vx', kind: 'variable', returnType: 'number', description: 'Velocity X in px/frame' },
      { name: 'vy', kind: 'variable', returnType: 'number', description: 'Velocity Y in px/frame' },
      { name: 'facing', kind: 'variable', returnType: 'int', description: 'Facing direction: -1 (left) or 1 (right) (writable)' },
      // `a:dig` is GONE in 0.9.1: no `dig` method exists anywhere in lua-host
      // (grep: zero hits) and no file in the new mods tree calls it -- the
      // engine's own note says "dig is cut's circle now". Suggesting it would
      // offer a method that reads as nil at run time.
      { name: 'collision_ignore', kind: 'method', parameters: [{ name: 'worm', type: 'WormHandle', description: 'Worm to pass through' }, { name: 'on', type: 'bool', description: 'true = ignore that worm' }], returnType: 'bool', description: "Lets one worm pass through the actor's body and mask (sim callback only). Returns whether it could be set.", example: 'a:collision_ignore(worm, true)' },
      { name: 'cut', kind: 'method', parameters: [{ name: 'spec', type: 'table', description: '{ shape = "circle" | "drill" | "torch", radius = int, facing = -1|1, angle = number } -- px at the actor' }], returnType: 'void', description: 'Cuts the terrain where it is: wa.land.cut at the actor (sim callback only).', example: 'a:cut({ shape = "circle", radius = 20 })' },
      { name: 'explode', kind: 'method', parameters: [{ name: 'opts', type: 'table', optional: true, description: '{ damage = int, id = int, below = bool, at = "below" }' }], returnType: 'void', description: 'Detonates an explosion at actor coordinates.', example: 'a:explode({ damage = 40, id = 50 })' },
      { name: 'despawn', kind: 'method', parameters: [], returnType: 'void', description: 'Destroys this actor and frees native resources.', example: 'a:despawn()' },
      { name: 'in_water', kind: 'method', parameters: [], returnType: 'bool', description: 'Tests if actor coordinates are submerged below water level.', example: 'if a:in_water() then a:despawn() end' },
      { name: 'on_feet', kind: 'method', parameters: [], returnType: 'bool', description: 'Tests if actor is currently resting on solid ground.', example: 'if a:on_feet() then ... end' },
      { name: 'gravity', kind: 'method', parameters: [], returnType: 'void', description: 'Applies world gravity to vy.', example: 'a:gravity()' },
      { name: 'move', kind: 'method', parameters: [{ name: 'opts', type: 'table', optional: true, description: '{ terrain = bool, worms = bool, collide_terrain = bool, collide_worms = bool }' }], returnType: 'table', description: 'Integrates velocity with terrain collision. Returns { terrain = bool, worm = bool, land = bool, left_ground = bool }.', example: 'local hit = a:move({ terrain = true })' },
      { name: 'advance', kind: 'method', parameters: [], returnType: 'void', description: 'Advances animation frame sequence.', example: 'a:advance()' },
      { name: 'gfx', kind: 'method', parameters: [{ name: 'spec', type: 'table', description: '{ angle = float, scale = float, tint = int, blend = "normal"|"add", depth = int }' }], returnType: 'void', description: 'Configures GPU atlas rendering parameters.', example: 'a:gfx({ angle = 45, tint = 0xFF8000, blend = "add" })' },
      { name: 'angle', kind: 'method', parameters: [{ name: 'deg', type: 'float', description: 'Rotation in degrees' }], returnType: 'void', description: 'Sets hardware rotation angle.', example: 'a:angle(90)' },
      { name: 'scale', kind: 'method', parameters: [{ name: 'factor', type: 'float', description: 'Scale factor (1.0 = native)' }], returnType: 'void', description: 'Sets vertex scale factor.', example: 'a:scale(1.5)' },
      { name: 'tint', kind: 'method', parameters: [{ name: 'rgb', type: 'int', description: '0x00RRGGBB tint color' }], returnType: 'void', description: 'Applies vertex tinting.', example: 'a:tint(0xFF0000)' },
      { name: 'blend', kind: 'method', parameters: [{ name: 'mode', type: 'string', description: '"normal" | "alpha" | "add" | "additive"' }], returnType: 'void', description: 'Sets blending mode.', example: 'a:blend("add")' },
      { name: 'frame', kind: 'method', parameters: [{ name: 'index', type: 'int', description: '0-based frame index' }], returnType: 'void', description: 'Sets the active animation frame.', example: 'a:frame(3)' },
      { name: 'look', kind: 'method', parameters: [{ name: 'spriteKey', type: 'string', description: 'Sprite key or pack relative path' }], returnType: 'void', description: 'Swaps current sprite graphic and resets phase.', example: 'a:look("sprites/flare.png")' },
      { name: 'spawn', kind: 'method', parameters: [{ name: 'spec', type: 'table', description: 'Child spawn spec table' }], returnType: 'ActorHandle', description: 'Spawns a child actor relative to this actor coordinates.', example: 'a:spawn({ x = a.x, y = a.y })' },
      { name: 'sound', kind: 'method', parameters: [{ name: 'slot', type: 'int | string', description: 'WAV relative path or stock sound ID' }, { name: 'flags', type: 'int', optional: true, description: 'Flags (default 8)' }], returnType: 'void', description: 'Plays spatial sound effect.', example: 'a:sound("sounds/shot.wav")' },
      { name: 'warp', kind: 'method', parameters: [{ name: 'spec', type: 'table', description: '{ x = number, y = number, vx = number, vy = number, facing = -1|1 } -- px positions, px/frame speeds; x/y required, speeds/facing optional' }], returnType: 'void', description: 'Atomically moves a live actor and wakes it (sim callback only). Omitted speeds retain momentum; facing is supported.', example: 'a:warp{ x = 100, y = 200 }' },
      { name: 'fits', kind: 'method', parameters: [{ name: 'x', type: 'number', description: 'Target X in px' }, { name: 'y', type: 'number', description: 'Target Y in px' }, { name: 'mode', type: 'string', optional: true, description: '"terrain" to test land only, else the actor\'s own collision mask' }], returnType: 'bool', description: "WA's collision test of the actor's shape at a place. A read, so safe outside a simulation callback.", example: 'if a:fits(x, y, "terrain") then a:warp{ x = x, y = y } end' },
      // Magnetism. A finite multiplier; 0 opts out.
      { name: 'magnetic', kind: 'variable', returnType: 'number', description: 'Automatic magnetic response multiplier, 0..1000 (default 0; simulation callback only). Fields are summed in creation order and applied before movement.', example: 'a.magnetic = 0.25' },
      // Fog of war (0.9.11). Presentation only, so it is safe in any callback.
      { name: 'light', kind: 'variable', returnType: 'string | false | table', description: "The actor's fog-of-war light. A visible world actor has its profile's projectile light by default; invisible (sprite = false), cursor and screen-space actors have none until given one. A preset string (worm, animal, projectile, crate) uses that kind's profile settings; false removes the light; a table replaces the whole spec, and omitted geometry and shadow_cast come from its kind. mode is light (default), dark (shades what its cast sees) or shadow (shades what is hidden from it within reach); darkness wins over light. cone.toward is velocity (default), angle (the a:gfx rotation), facing or degrees. seen_by is owner (default: the owning worm's side, per view_ownership; public without an owning worm) or everyone. discover = true requires seen_by = owner; dark and shadow never record terrain memory. strength (0..255) is for dark and shadow only. Presentation only: any callback may set it. Reading returns the spec table, or false.", example: 'a.light = "projectile"\na.light = { kind = "dark", circle = { radius = 120 } }' },
    ],
  },
  {
    name: 'WormEntity',
    description: 'Stock Worms Armageddon player worm entity (WormHandle) with real engine properties and methods.',
    syntaxExample: 'worm:equip("bazooka")\nworm:hurt(25)\nworm:heal(50)\nworm:carry(x, y)',
    members: [
      { name: 'id', kind: 'property', returnType: 'int', description: 'Stable worm ID (team * 16 + index)' },
      { name: 'x', kind: 'variable', returnType: 'number', description: 'Position X in px' },
      { name: 'y', kind: 'variable', returnType: 'number', description: 'Position Y in px' },
      { name: 'vx', kind: 'variable', returnType: 'number', description: 'Horizontal velocity in px/frame' },
      { name: 'vy', kind: 'variable', returnType: 'number', description: 'Vertical velocity in px/frame' },
      { name: 'facing', kind: 'variable', returnType: 'int', description: 'Facing direction: -1 (left) or 1 (right) (writable)' },
      { name: 'shots_fired', kind: 'variable', returnType: 'int', description: 'Shots fired this turn for repeat-fire weapons (sim callback only)' },
      { name: 'shots_to_fire', kind: 'variable', returnType: 'int', description: 'Shots to fire this turn for repeat-fire weapons (sim callback only)' },
      { name: 'fuel', kind: 'variable', returnType: 'number', description: 'Jet pack fuel (0 is unlimited, writable)' },
      { name: 'gravity', kind: 'variable', returnType: 'number', description: 'Gravity scale factor (1.0 = normal, writable)' },
      { name: 'wind', kind: 'variable', returnType: 'number', description: 'Wind scale factor (1.0 = normal, writable)' },
      { name: 'collision_mask', kind: 'variable', returnType: 'int', description: 'Collision layer bitmask (bit 22 is landscape/water, writable)' },
      { name: 'keys', kind: 'property', returnType: 'table', description: 'Worm\'s own movement requests: { up, down, left, right }' },
      // The eighteen names `worm.state` can actually return, from
      // `worm_state_name()` in crates/lua-host/src/actor.rs. Anything else reads
      // as nil -- the lua-host does not guess. The old list here was partly
      // invented: it missed firing/fired/tumbling and advertised "sinking",
      // which is a set_state alias and never a value read back.
      { name: 'state', kind: 'property', returnType: 'string | nil', description: 'State name: "standing" | "walking" | "ready" | "charging" | "prefiring" | "firing" | "fired" | "punching" | "drilling" | "teleporting" | "jetpacking" | "parachuting" | "sliding" | "roping" | "bungee" | "tumbling" | "frozen" | "kamikaze" | "jump_prepare" | "jumping" | "jump_falling" | "blasted" | "hit" | "dying" | "drowning" | "dead" | nil' },
      { name: 'state_id', kind: 'property', returnType: 'int', description: 'Raw u32 state number' },
      { name: 'state_label', kind: 'property', returnType: 'string | nil', description: 'Debug label for the raw state, including states worm.state does not name (e.g. "walking", "getting_up"). See data/wormStates.ts.' },
      { name: 'state_address', kind: 'property', returnType: 'int', description: 'Pointer to worm state field in memory' },
      { name: 'team', kind: 'property', returnType: 'int', description: 'Team number (1 to 6)' },
      { name: 'slot', kind: 'property', returnType: 'int', description: 'Selected weapon slot index (1 to 70)' },
      { name: 'weapon', kind: 'property', returnType: 'string | nil', description: 'Stock weapon name e.g. "bazooka"' },
      { name: 'aim', kind: 'property', returnType: 'float', description: 'Aim sweep fraction (0.0 straight down -> 0.5 level -> 1.0 straight up)' },
      { name: 'aiming', kind: 'property', returnType: 'bool', description: 'True while standing with weapon or charging' },
      { name: 'drilling', kind: 'property', returnType: 'bool', description: 'True while actively drilling' },
      { name: 'kind', kind: 'property', returnType: 'string', description: 'Always "worm"' },
      { name: 'visible', kind: 'variable', returnType: 'bool', description: 'Overall worm visibility (read/write)' },
      { name: 'body_visible', kind: 'variable', returnType: 'bool', description: 'Body sprite visibility only (labels, name, health, cursor stay visible)' },
      { name: 'invisibility', kind: 'variable', returnType: 'bool', description: "WA's Invisibility for this worm alone, as its team's would give it: hidden and not followed where WA wouldn't show an invisible team, ghosted where it would; a weapon that ends Invisibility ends it; writes from simulation callbacks.", example: 'worm.invisibility = true' },
      { name: 'turn', kind: 'property', returnType: 'bool', description: 'True if currently this worm\'s turn' },
      { name: 'hp', kind: 'property', returnType: 'int', description: 'Hit points / health points' },
      { name: 'alliance', kind: 'property', returnType: 'int', description: 'Team alliance / color index (0 red .. 5 cyan)' },
      { name: 'windup', kind: 'variable', returnType: 'int', description: 'Wind-up frames counted by the engine instead of WA; 0 skips it, nil hands it back to WA (writable, sim callback only)' },
      { name: 'ammo_group', kind: 'property', returnType: 'int', description: 'Separate physical ammo row index; may differ from the visible alliance colour (read only)' },
      { name: 'taken', kind: 'property', returnType: 'bool', description: 'True while the engine still holds this worm for the pack after worm:take (read only)' },
      // Exactly the six names `settable_worm_state()` accepts (crates/lua-host).
      // Five states, because "sinking" is the legacy alias of tumbling. A real
      // state that is not settable -- "jetpacking", say -- is REJECTED by the
      // engine here, so it must not be advertised as settable.
      { name: 'set_state', kind: 'method', parameters: [{ name: 'name', type: 'string', description: '"standing" | "sliding" | "bungee" | "tumbling" | "sinking" (legacy alias of tumbling) | "teleporting"' }], returnType: 'void', description: 'Transitions worm into action state through WA SetState (sim callback only). Any other name is a hard Lua error, and run_mods then aborts every mod in the folder. Debug only: needs debug_worm_state = true in mod.toml.', example: 'worm:set_state("sliding")' },
      { name: 'clear_keys', kind: 'method', parameters: [], returnType: 'void', description: 'Consumes and clears movement keys this frame (sim callback only).', example: 'worm:clear_keys()' },
      { name: 'carry', kind: 'method', parameters: [{ name: 'x', type: 'number', description: 'Target X in px' }, { name: 'y', type: 'number', description: 'Target Y in px' }], returnType: 'void', description: 'Latches worm to coordinates and freezes turn timer.', example: 'worm:carry(target.x, target.y)' },
      // 0.9.11. WA's own jump take-off, without inventing a velocity.
      { name: 'jump', kind: 'method', parameters: [{ name: 'kind', type: 'string', optional: true, description: '"forward" | "back" | "up" | "backflip"; no argument repeats its last jump' }], returnType: 'void', description: "WA's own jump take-off from wherever the worm is; no argument repeats its last jump.", example: 'worm:jump("backflip")' },
      { name: 'freeze', kind: 'method', parameters: [], returnType: 'void', description: 'Freezes the worm in place.', example: 'worm:freeze()' },
      { name: 'drop', kind: 'method', parameters: [], returnType: 'void', description: 'Releases carried worm into sliding/airborne physics state.', example: 'worm:drop()' },
      { name: 'take', kind: 'method', parameters: [{ name: 'opts', type: 'table', optional: true, description: '{ hide = bool, turn = "run" | "freeze" }' }], returnType: 'void', description: 'Takes ownership of a worm until worm:release or the end of the turn. It stays where it is until you move it with worm:carry(x, y); the engine consumes its move keys and jumps and turns its water off, so a vehicle may hold it in water. hide hides it as worm.visible = false; turn = "freeze" holds the turn timer as worm:carry does (sim callback only).', example: 'worm:take{ hide = false, turn = "freeze" }' },
      { name: 'release', kind: 'method', parameters: [{ name: 'vx', type: 'int', optional: true, description: 'Release velocity X in px/frame' }, { name: 'vy', type: 'int', optional: true, description: 'Release velocity Y in px/frame' }, { name: 'opts', type: 'table', optional: true, description: '{ tumble = bool, suppress_auto_parachute = bool }' }], returnType: 'void', description: 'Gives a taken worm back to the engine moving at (vx, vy). It is shown again and let go, then falls under engine control as from a closed parachute. tumble = true puts it out of control as after a hit, and in water the engine drowns it (sim callback only).', example: 'worm:release(0, 2, { tumble = true })' },
      { name: 'fits', kind: 'method', parameters: [{ name: 'x', type: 'number', description: 'Target X in px' }, { name: 'y', type: 'number', description: 'Target Y in px' }], returnType: 'bool', description: 'Whether the worm would touch nothing at (x, y), by the engine\'s own collision test and the worm\'s own shape. A read, so it is safe outside a simulation callback.', example: 'if worm:fits(x, y) then worm:carry(x, y) end' },
      { name: 'jetpack_steer', kind: 'method', parameters: [{ name: 'on', type: 'bool', optional: true, description: 'Steer the jet pack (default true)' }], returnType: 'void', description: 'While the engine\'s jet pack runs you steer it, and the engine neither thrusts nor burns fuel from the keys. It keeps its collisions, fuel HUD and landing. The claim lapses when the jet pack ends (sim callback only).', example: 'worm:jetpack_steer(true)' },
      { name: 'equip', kind: 'method', parameters: [{ name: 'weaponName', type: 'string', description: 'Stock weapon slot name' }], returnType: 'int', description: 'Arms this worm with weapon and selects slot. Returns remaining ammo.', example: 'worm:equip("bazooka")' },
      { name: 'ammo', kind: 'method', parameters: [{ name: 'weaponName', type: 'string', description: 'Weapon name' }, { name: 'change', type: 'int | table', optional: true, description: 'Delta to add, or { set = count } (-1 is infinite)' }], returnType: 'int', description: 'Reads or modifies team ammo for this weapon. Returns ammo.', example: 'worm:ammo("bazooka", { set = 3 })' },
      { name: 'hurt', kind: 'method', parameters: [{ name: 'arg', type: 'int | table', description: 'Damage amount or { amount = int }' }], returnType: 'void', description: 'Deals direct special impact damage without impulse knockback.', example: 'worm:hurt(20)' },
      { name: 'heal', kind: 'method', parameters: [{ name: 'amount', type: 'int', description: 'HP to restore' }], returnType: 'int', description: 'Restores worm hit points (sim callback only). Returns new HP.', example: 'worm:heal(25)' },
      // Health-timing verbs used by Core Utilities. Worm-only and simulation-only,
      // like `teleport_pose`; no debug opt-in. See WormForgeNew actor.rs.
      { name: 'commit_health', kind: 'method', parameters: [], returnType: 'bool', description: "Commits only this worm's pending health display through WA message 0x44. The damage WA still owes stays owed, so a zero-HP worm is not left standing at 0; no synthetic hit or turn-wide death runs. Worm-only, simulation callback only. Returns whether the engine performed it.", example: 'worm:commit_health()' },
      { name: 'show_health', kind: 'method', parameters: [], returnType: 'bool', description: "Moves only this worm's health label down to its current HP while leaving WA's pending damage owed. The label updates without killing a zero-HP worm early. Worm-only, simulation callback only. Returns whether the engine performed it.", example: 'worm:show_health()' },
      { name: 'allow_death', kind: 'method', parameters: [], returnType: 'bool', description: "Gives only this zero-HP worm WA's ordinary death permission (message 0x40). WA's frame handler still applies its movement and landing checks and starts the death animation; no SetState, damage or broadcast. Worm-only, simulation callback only. Returns whether the engine performed it.", example: 'if not worm.turn and worm.hp == 0 then worm:allow_death() end' },
      { name: 'die', kind: 'method', parameters: [], returnType: 'bool', description: "Starts a zero-HP worm's death now, even in flight. False for a worm with health, already dying, waiting to be placed, or in the Kamikaze/Suicide Bomber flight. Worm-only, simulation callback only. Returns whether the engine performed it.", example: 'worm:die()' },
      { name: 'warp', kind: 'method', parameters: [{ name: 'spec', type: 'table', description: '{ x = number, y = number, vx = number, vy = number, facing = -1|1 } -- px positions, px/frame speeds; x/y required, speeds/facing optional' }], returnType: 'void', description: 'Atomically moves a live worm and wakes it (sim callback only). Omitted speeds retain momentum; facing is supported.', example: 'worm:warp{ x = 100, y = 200 }' },
      { name: 'air_fire', kind: 'method', parameters: [{ name: 'on', type: 'bool', optional: true, description: 'Allow the selected pack fire to trigger in mid-air (default true)' }], returnType: 'void', description: 'Lets a pack weapon fire in mid-air, on synchronized fire-key edges (sim callback only).', example: 'worm:air_fire(true)' },
      // Worm-only and needs NO debug opt-in, unlike worm:set_state: the engine
      // exposes it on worms but not on actors (lua-host lib.rs:832-848).
      { name: 'teleport_pose', kind: 'method', parameters: [], returnType: 'bool', description: 'Shifts the worm into the teleport pose in place, without moving it (sim callback only). Returns whether the engine performed it.', example: 'if worm:teleport_pose() then ... end' },
    ],
  },
  {
    name: 'WorldHandle',
    description: 'Stock world object handle for crates, mines, missiles, oil drums, and gravestones.',
    syntaxExample: 'mine:arm(2000)\ndrum:hit(50, 0, 0)\ngrave:revive(worm_id, 100)',
    members: [
      { name: 'id', kind: 'property', returnType: 'int', description: 'Unique object entity handle' },
      { name: 'kind', kind: 'property', returnType: 'string', description: '"mine" | "missile" | "crate" | "worm" | "oil" | "grave" | "land" | "object"' },
      { name: 'uid', kind: 'property', returnType: 'int', description: 'Per-world construction number, unaffected by the allocator (read only)' },
      { name: 'team', kind: 'property', returnType: 'int', description: 'Owning team number (1 to 6), 0 for none (read only)' },
      { name: 'alliance', kind: 'property', returnType: 'int', description: 'Visible coalition colour of the owning team, as worm.alliance; nil without a team (read only)' },
      { name: 'worm_id', kind: 'property', returnType: 'int', description: 'For gravestones: stable worm ID of the deceased worm' },
      { name: 'fuse', kind: 'property', returnType: 'int', description: 'For mines: remaining fuse countdown in milliseconds' },
      { name: 'damage', kind: 'property', returnType: 'int | nil', description: "For oil drums: WA's damage count; nil for anything else (read only)." },
      { name: 'max_damage', kind: 'property', returnType: 'int | nil', description: "For oil drums: the damage at which the drum goes off (WA's 50); nil for anything else (read only)." },
      { name: 'visible', kind: 'variable', returnType: 'bool | nil', description: 'For oil drums: whether WA draws it. false lets a pack draw its own drum; only the draw changes, not the drum itself. nil for anything else; writable from any callback.' },
      { name: 'x', kind: 'variable', returnType: 'number', description: 'Position X in px' },
      { name: 'y', kind: 'variable', returnType: 'number', description: 'Position Y in px' },
      { name: 'vx', kind: 'variable', returnType: 'number', description: 'Horizontal velocity in px/frame' },
      { name: 'vy', kind: 'variable', returnType: 'number', description: 'Vertical velocity in px/frame' },
      { name: 'impulse', kind: 'method', parameters: [{ name: 'pushx', type: 'int', description: 'Horizontal push in px/frame' }, { name: 'pushy', type: 'number', description: 'Vertical push in px/frame' }], returnType: 'void', description: 'Pushes a mine or missile (sim callback only). Parameters inferred from magnet usage.', example: 'mine:impulse(pushx, pushy)' },
      { name: 'arm', kind: 'method', parameters: [{ name: 'fuse_ms', type: 'int', description: 'Fuse countdown duration in ms' }], returnType: 'bool', description: 'Arms settled stock mine (sim callback only).', example: 'mine:arm(1500)' },
      { name: 'hit', kind: 'method', parameters: [{ name: 'damage', type: 'int', description: 'Damage amount' }, { name: 'vx', type: 'int', description: 'Velocity X' }, { name: 'vy', type: 'int', description: 'Velocity Y' }, { name: 'kind', type: 'string', optional: true, description: '"direct" | "projectile"' }], returnType: 'bool', description: 'Deals impact damage to mine, crate, or oil drum (sim callback only).', example: 'drum:hit(50, 0, 0)' },
      { name: 'revive', kind: 'method', parameters: [{ name: 'worm_id', type: 'int', description: 'Stable worm ID' }, { name: 'health', type: 'int', description: 'Initial HP' }], returnType: 'WormHandle | nil', description: 'Revives dead worm from gravestone, removing the grave (sim callback only).', example: 'grave:revive(worm.id, 100)' },
      { name: 'warp', kind: 'method', parameters: [{ name: 'spec', type: 'table', description: '{ x = number, y = number, vx = number, vy = number } -- px positions, px/frame speeds; x/y required, speeds optional (no facing on objects)' }], returnType: 'void', description: 'Atomically moves a live object and wakes it (sim callback only). Omitted speeds retain momentum.', example: 'object:warp{ x = 100, y = 200 }' },
      { name: 'fits', kind: 'method', parameters: [{ name: 'x', type: 'number', description: 'Target X in px' }, { name: 'y', type: 'number', description: 'Target Y in px' }, { name: 'mode', type: 'string', optional: true, description: '"terrain" to test land only, else the object\'s own collision mask' }], returnType: 'bool', description: "WA's collision test of the object's shape at a place. A read, so safe outside a simulation callback.", example: 'if object:fits(x, y) then object:warp{ x = x, y = y } end' },
      { name: 'remove', kind: 'method', parameters: [], returnType: 'bool', description: 'Frees a missile, arrow, mine or oil drum without a blast: a drum goes with no fires and no wa.on.oil_explode. Returns whether it did. Simulation callbacks only.', example: 'object:remove()' },
    ],
  },
  {
    // 0.9.11. A hand-built light handle, not a world object: it has its own
    // three methods and nothing else. Presentation only.
    name: 'LightHandle',
    description: 'Free fog-of-war light created by wa.fog.light (WormForge 0.9.11).',
    syntaxExample: 'local light = wa.fog.light({ x = 100, y = 200 })\nlight:move(120, 210)\nlight:remove()',
    members: [
      { name: 'move', kind: 'method', parameters: [{ name: 'x', type: 'number', description: 'Target X in px' }, { name: 'y', type: 'number', description: 'Target Y in px' }], returnType: 'void', description: 'Moves a free light.', example: 'light:move(120, 210)' },
      { name: 'set', kind: 'method', parameters: [{ name: 'spec', type: 'table', description: '{ circle, mode, fade, ... }' }], returnType: 'void', description: "Changes a free light's settings; omitted keys keep their values. A new fade restarts its fade.", example: 'light:set({ mode = "dark", fade = 500 })' },
      { name: 'remove', kind: 'method', parameters: [], returnType: 'void', description: 'Removes a free light.', example: 'light:remove()' },
    ],
  },
  {
    // Match-wide magnetic field handle (0.9.11). The engine calls it
    // FieldHandle; the editor class is named for the API that returns it.
    name: 'MagneticField',
    description: 'A match-wide magnetic field registered by wa.magnetism.field.',
    syntaxExample: 'local field = wa.magnetism.field({ source = magnet })\nfield.polarity = "attract"\nfield:remove()',
    members: [
      { name: 'range', kind: 'variable', returnType: 'number', description: 'Range in px, 0..32767.' },
      { name: 'strength', kind: 'variable', returnType: 'number', description: 'Inverse-square falloff coefficient, 0..1e12.' },
      { name: 'max_force', kind: 'variable', returnType: 'number', description: 'Maximum contribution before direction attenuation, 0..1000 px/frame per step.' },
      { name: 'softening', kind: 'variable', returnType: 'number', description: 'Positive central softening distance in px, 1/65536..32767.' },
      { name: 'polarity', kind: 'variable', returnType: 'string', description: '"attract" or "repel".' },
      { name: 'enabled', kind: 'variable', returnType: 'bool', description: 'Whether this field contributes. Reads false after removal.' },
      { name: 'native', kind: 'variable', returnType: 'bool', description: 'Whether the field also affects WA\'s native mines and missiles.' },
      { name: 'remove', kind: 'method', parameters: [], returnType: 'bool', description: 'Removes the field: true once, then false (simulation callback only).' },
      { name: 'contains', kind: 'method', parameters: [{ name: 'x', type: 'number', description: 'X in px' }, { name: 'y', type: 'number', description: 'Y in px' }], returnType: 'bool', description: "Whether a point is inside this field's current snapshot." },
    ],
  },
  {
    name: 'WindowHandle',
    description: 'A HUD text window created by wa.hud.window; open until closed or the match ends.',
    syntaxExample: 'local window = wa.hud.window({ text = "Turn 3", x = 10, y = 10 })\nwindow:set({ text = "Turn 4" })\nwindow:close()',
    members: [
      { name: 'set', kind: 'method', parameters: [{ name: 'spec', type: 'table', description: '{ text, x, y, color, ... }' }], returnType: 'bool', description: 'Changes a window; omitted keys keep their values. False once it is closed.', example: 'window:set({ text = "Turn 4" })' },
      { name: 'close', kind: 'method', parameters: [], returnType: 'bool', description: 'Closes a window; false if it already was.', example: 'window:close()' },
      { name: 'is_open', kind: 'method', parameters: [], returnType: 'bool', description: 'Whether the window is still open: the same on every machine.', example: 'if window:is_open() then ... end' },
    ],
  },
  {
    name: 'InventoryStore',
    description: 'Pack-scoped virtual inventory store created via wa.inventory.create.',
    syntaxExample: 'local inv = wa.inventory.create({ id = "loot", slots = { "bazooka", "grenade" } })\ninv:add(worm, "bazooka", 1)\ninv:apply(worm, { each = 1 })',
    members: [
      { name: 'id', kind: 'property', returnType: 'string', description: 'Inventory store identifier' },
      { name: 'owner', kind: 'property', returnType: 'string', description: 'Owning mod ID' },
      { name: 'get', kind: 'method', parameters: [{ name: 'worm', type: 'WormHandle', description: 'Worm' }, { name: 'name', type: 'string', description: 'Weapon name' }], returnType: 'int', description: 'Reads worm count for weapon in this store.', example: 'local count = inv:get(worm, "bazooka")' },
      { name: 'set', kind: 'method', parameters: [{ name: 'worm', type: 'WormHandle', description: 'Worm' }, { name: 'name', type: 'string', description: 'Weapon name' }, { name: 'amount', type: 'int', description: 'Amount to set' }], returnType: 'int', description: 'Sets worm count for weapon in this store.', example: 'inv:set(worm, "bazooka", 2)' },
      { name: 'add', kind: 'method', parameters: [{ name: 'worm', type: 'WormHandle', description: 'Worm' }, { name: 'name', type: 'string', description: 'Weapon name' }, { name: 'amount', type: 'int', optional: true, description: 'Amount to add (default 1)' }], returnType: 'int', description: 'Adds to worm weapon count.', example: 'inv:add(worm, "grenade", 1)' },
      { name: 'remove', kind: 'method', parameters: [{ name: 'worm', type: 'WormHandle', description: 'Worm' }, { name: 'name', type: 'string', description: 'Weapon name' }, { name: 'amount', type: 'int', optional: true, description: 'Amount to remove (default 1)' }], returnType: 'int', description: 'Removes from worm weapon count.', example: 'inv:remove(worm, "grenade", 1)' },
      { name: 'clear', kind: 'method', parameters: [{ name: 'worm', type: 'WormHandle', description: 'Worm' }, { name: 'weapons', type: 'string | table', optional: true, description: '"all", weapon name, or array of names' }], returnType: 'void', description: 'Clears worm store contents.', example: 'inv:clear(worm)' },
      { name: 'list', kind: 'method', parameters: [{ name: 'worm', type: 'WormHandle', description: 'Worm' }], returnType: 'table', description: 'Returns array of weapon names owned by worm in this store.', example: 'local weapons = inv:list(worm)' },
      { name: 'deal', kind: 'method', parameters: [{ name: 'worm', type: 'WormHandle', description: 'Worm' }, { name: 'pool', type: 'table', description: 'Array of weapon names' }, { name: 'count', type: 'int', optional: true, description: 'Number to deal (default 1)' }], returnType: 'table', description: 'Deterministically deals weapons from pool using wa.random.', example: 'local dealt = inv:deal(worm, { "bazooka", "grenade" }, 2)' },
      { name: 'transfer', kind: 'method', parameters: [{ name: 'from', type: 'WormHandle', description: 'Source worm' }, { name: 'to', type: 'WormHandle', description: 'Destination worm' }, { name: 'opts', type: 'table', optional: true, description: '{ weapons = "all"|string|table, amount = int, mode = "move"|"copy" }' }], returnType: 'table', description: 'Transfers weapons between two worms.', example: 'inv:transfer(killer, victim, { mode = "move" })' },
      { name: 'apply', kind: 'method', parameters: [{ name: 'worm', type: 'WormHandle', description: 'Worm' }, { name: 'opts', type: 'table', optional: true, description: '{ clear = bool, each = int, weapons = "all"|string|table }' }], returnType: 'void', description: 'Materializes virtual inventory store onto real WA team ammo row.', example: 'inv:apply(worm, { clear = true, each = 1 })' },
    ],
  },
  {
    name: 'MissileEntity',
    description: 'Motion data table passed to wa.on.missile_frame, gravity_before, and gravity_after hooks.',
    syntaxExample: 'wa.on.missile_frame(function(m)\n  if m.weapon == "chilli_bomb" then m.sprite = 0 end\nend)',
    members: [
      { name: 'id', kind: 'property', returnType: 'int', description: 'Unique lockstep missile instance ID' },
      { name: 'class_type', kind: 'property', returnType: 'int', description: 'Engine class type' },
      { name: 'damp', kind: 'variable', returnType: 'number', description: 'Damping factor (1.0 = normal, read/write)' },
      { name: 'wind_scale', kind: 'variable', returnType: 'number', description: 'Wind influence factor (1.0 = normal, read/write)' },
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
      { name: 'weapon', kind: 'property', returnType: 'string | nil', description: 'Firing weapon slot name e.g. "bazooka"' },
      { name: 'sprite', kind: 'variable', returnType: 'int', description: 'Active blit sprite ID. Writable! Set to 0 to hide stock flight sprite.' },
      { name: 'collision_mask', kind: 'variable', returnType: 'int', description: 'Layer collision bitmask (read/write)' },
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
  detonation: { name: 'Detonation Behavior', category: 'Explosion', description: 'Action triggered on detonation (0 standard, 1 clusters, 2 fire)' },

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
  cluster_count: { name: 'Cluster Count', category: 'Cluster', description: 'Number of cluster bits released' },
  cluster_speed: { name: 'Cluster Speed', category: 'Cluster', description: 'Initial velocity of ejected cluster bits' },
  cluster_power: { name: 'Cluster Launch Power', category: 'Cluster', description: 'Cluster bit ejection impulse' },
  cluster_angle: { name: 'Cluster Angle', category: 'Cluster', description: 'Center launch angle of cluster fan' },
  cluster_spread: { name: 'Cluster Spread', category: 'Cluster', description: 'Spread angle of cluster fan' },
  c_damage: { name: 'Cluster Damage', category: 'Cluster', description: 'Damage per cluster bit' },
  c_blast: { name: 'Cluster Blast Radius', category: 'Cluster', description: 'Explosion radius of cluster bits', unit: 'px' },
  c_sprite: { name: 'Cluster Sprite ID', category: 'Cluster', description: 'Sprite asset ID for cluster bit' },
  c_sprite_count: { name: 'Cluster Sprite Count', category: 'Cluster', description: 'Number of distinct bit sprites' },
  c_bounce_pct: { name: 'Cluster Bounce %', category: 'Cluster', description: 'Bounciness factor of cluster bits', unit: '%' },
  c_gravity_pct: { name: 'Cluster Gravity %', category: 'Cluster', description: 'Gravity scale on cluster bits', unit: '%' },
  c_wind_pct: { name: 'Cluster Wind %', category: 'Cluster', description: 'Wind influence on cluster bits', unit: '%' },
  c_fuse: { name: 'Cluster Fuse', category: 'Cluster', description: 'Fuse countdown for cluster bits', unit: 'ms' },

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
