import { ModFolderInfo } from '../types/wormforge';

export const EXISTING_MODS: ModFolderInfo[] = [
  {
    id: 'example.saw',
    name: 'Saw (Proximity)',
    version: '0.1.0',
    author: 'reddaz',
    replacesSlot: 'mortar',
    description: 'Placed proximity saw weapon with radial knockback physics, damage over time cooldown, and continuous GIF animation cycle.',
    declaredMethods: [
      'think',
      'brain'
    ],
    declaredVariables: [
      'PX',
      'RADIUS_PX',
      'DAMAGE_PER_HIT',
      'HIT_COOLDOWN',
      'SINK_PX',
      'MAX_HP',
      'SPAWN_OFFSET_PX',
      'PUSH_SPEED_PX',
      'PUSH_UP_PX',
      'SPRITE',
      'state'
    ],
    customClasses: ['SawActor', 'RadialPush'],
    hooks: ['wa.weapons.replace'],
    files: [
      {
        path: 'saw.lua',
        name: 'saw.lua',
        language: 'lua',
        content: `-- Minimal saw. Placed like a mine (copy_from = "mine" keeps stock placement
-- physics/arming), then sits still and hurts any enemy worm that gets close.
--
-- Deliberately NOT doing yet:
--   * no sounds
--   * no spin/rotation animation -- single static sprite frame
--
-- Radial push IS implemented: worm.vx/vy are directly writable (confirmed by
-- worm_toss's held.vx = vx), so knockback here is a straight position-only
-- nudge away from the saw's center, same math as do_custom_explosion's
-- pushForce in the PX scripts -- no incoming-velocity read required.

local PX = 0x10000

local RADIUS_PX      = 33   -- Real Image Pixel Count / 2.1. how close a worm has to be to get hit
local DAMAGE_PER_HIT = 12
local HIT_COOLDOWN   = 4    -- frames before the same worm can be hit again
local SINK_PX        = 4    -- settle depth once planted, same idea as sentry's SINK_PX
local MAX_HP         = 60
local SPAWN_OFFSET_PX = 20  -- clear the owner worm's own collision mask before frame 0

-- Radial push, no incoming velocity needed -- same shape as do_custom_explosion's
-- pushForce = (dmg/5) * (pushPower/100) in the PX scripts: direction is just
-- (target.pos - source.pos) normalized, scaled by a flat speed. Confirmed
-- worm.vx/vy are writable directly (worm_toss does held.vx = vx), so this is
-- an additive nudge onto whatever velocity the worm already has, not an
-- overwrite -- overwriting is only correct when you're doing a full
-- reflection against incoming speed (ApplySawKnockback's job, not this one).
local PUSH_SPEED_PX = 8     -- horizontal/radial push speed added per hit
local PUSH_UP_PX    = 5     -- small upward bias so a flush hit isn't pure sideways

-- Put the sprite here:
--   mods/examples/saw/sprites/saw.png
-- Single frame is fine for now (sprite_columns = 1 below). When you're
-- ready for a spin/GIF, either drop a multi-frame strip and bump
-- sprite_columns, or a folder of frame*.png like copy_frames() does in
-- pack_sprites.py, and drive it with a:frame(i) once you add that.
-- GIF is natively supported -- reference it directly with the extension
local SPRITE = "sprites/saw70.gif"

local state = {}   -- state[actor.id] = { team, owner, planted, hp, px, py, cooldown }

local function think(a, s)
  -- Planted saw never moves. Re-assert position every frame so an explosion's
  -- own push (or anything else) can't nudge it, same reasoning as the
  -- sentry's think().
  a.x, a.y = s.px, s.py
  a.vx, a.vy = 0, 0

  for _, w in ipairs(wa.worms.all()) do
    if w.team ~= s.team and w.hp > 0 then
      local dx = (w.x - a.x) // PX
      local dy = (w.y - a.y) // PX
      if dx * dx + dy * dy <= RADIUS_PX * RADIUS_PX then
        local cd = s.cooldown[w.id] or 0
        if cd <= 0 then
          w:hurt(DAMAGE_PER_HIT)

          local dist = math.sqrt(dx * dx + dy * dy)
          if dist > 0 then
            local nx, ny = dx / dist, dy / dist
            w.vx = w.vx + math.floor(nx * PUSH_SPEED_PX * PX)
            w.vy = w.vy + math.floor(ny * PUSH_SPEED_PX * PX) - PUSH_UP_PX * PX
          else
            -- worm is dead-center on the saw (dist == 0): no direction to
            -- push along, so just pop it straight up rather than skip the
            -- knockback entirely.
            w.vy = w.vy - PUSH_UP_PX * PX
          end

          s.cooldown[w.id] = HIT_COOLDOWN
        end
      end
    end
  end

  for id, cd in pairs(s.cooldown) do
    if cd > 0 then
      s.cooldown[id] = cd - 1
    end
  end
end

local function brain(a, ev)
  local s = state[a.id]
  if not s then
    return
  end
  ev = ev or {}

  if (ev.damage or 0) > 0 then
    s.hp = s.hp - ev.damage
    if s.hp <= 0 then
      state[a.id] = nil
      a:explode({ damage = 30, id = 100 })
      a:despawn()
      return
    end
  end

  if not s.planted then
    a:gravity()
    local hit = a:move({ terrain = true, worms = false })
    if hit.land then
      a.vx, a.vy = 0, 0
      s.planted = true
      s.px, s.py = a.x, a.y + SINK_PX * PX
      return
    end
    a:advance()
    if a:in_water() then
      state[a.id] = nil
      a:despawn()
      return
    end
  else
    think(a, s)
  end
end

-- weapon = "mine" would NOT work here: a mine-slot weapon's stock fire path
-- goes through FireWeapon__CreateMine (fire_type 2 / method 2), which never
-- touches FireWeapon__CreateWeaponProjectile -- the function on_fire actually
-- hooks. On a mine slot you'd get a real MineEntity and on_fire is dead code
-- (this is what "just launches a normal mine" was). Overlaying "bazooka"
-- instead routes through the projectile path, so on_fire fires for real.
--
-- copy_from = "mine" is deliberately NOT used: it carries over mine's own
-- retreat_time (near-zero, since placing a mine ends control almost
-- immediately), and something on the native side was enforcing that against
-- the LuaActor body regardless of persist = true -- confirmed by removing
-- copy_from, which fixed the one-frame-then-gone symptom. If mine-like ammo
-- or stats are wanted later, set them individually rather than copy_from.
wa.weapons.replace({
  weapon    = "mortar",
  name      = "Saw",
  is_weapon = true,

  sprites = { SPRITE },

  on_fire = function(fire)
    local worm = fire.worm
    local team = (worm and worm.team) or 1
    -- facing: -1 left, +1 right (worm.facing, per the docs; fall back to the
    -- throw's own vx sign if a worm handle isn't present for some reason).
    local facing = (worm and worm.facing) or (fire.vx < 0 and -1 or 1)

    -- Position offset, not a velocity nudge: this has to be clear of the
    -- worm's own collision mask on frame 0, before a:move() ever runs, or
    -- the spawn gets rejected/freed the instant it's created -- which reads
    -- as "renders one frame then disappears." A velocity-only nudge (what
    -- the sentry does) still leaves it overlapping on that first tick.
    local spawn_x = fire.x + facing * SPAWN_OFFSET_PX * PX
    local spawn_y = fire.y

    local body = wa.actors.spawn({
      sprite  = SPRITE,
      x       = spawn_x,
      y       = spawn_y,
      vx      = fire.vx * 0.6,
      vy      = fire.vy * 0.6,
      loop    = true,   -- keep the GIF cycling continuously, it's persistent, not a one-shot fx
      origin  = "center",
      owner   = worm,
      kind    = "saw",
      persist = true,
      on      = brain,
    })

    state[body.id] = {
      team     = team,
      owner    = worm,
      planted  = false,
      hp       = MAX_HP,
      cooldown = {},
    }
  end,
})
`,
      },
      {
        path: 'mod.toml',
        name: 'mod.toml',
        language: 'toml',
        content: `id = "example.saw"
version = "0.1.0"
author = "LucianoWorms"
api_version = 1
entry = "saw.lua"

[weapons]
register = ["example.saw"]
replace = ["mortar"]
`,
      },
      {
        path: 'README.md',
        name: 'README.md',
        language: 'markdown',
        content: `# Saw Mod
Placed proximity saw weapon with radial knockback physics and dynamic damage ticks.`,
      },
    ],
  },
  {
    id: 'example.sentry_gun',
    name: 'Sentry Gun',
    version: '0.1.0',
    author: 'wkLua',
    replacesSlot: 'bazooka',
    description: 'Autonomous sentry gun with rotating housing, motion detection, ammo limit, sound effects, and shell casing ejection.',
    declaredMethods: [
      'angle_to',
      'turn_toward',
      'angle_gap',
      'note_motion',
      'moving',
      'sees',
      'acquire',
      'held',
      'start_firing',
      'stop_firing',
      'update_servo',
      'fire',
      'think',
      'sync',
      'brain'
    ],
    declaredVariables: [
      'PX',
      'SENSOR_PX',
      'AMMO',
      'DAMAGE',
      'SHOT_FRAMES',
      'ACTIVATE',
      'BEEP_FRAMES',
      'ROT_IDLE',
      'ROT_ACTIVE',
      'SWEEP',
      'AIM_TOLERANCE',
      'HIT_PX',
      'SELF_BLAST_PX',
      'REQUIRE_MOTION',
      'SINK_PX',
      'MUZZLE_UP',
      'MUZZLE_OUT',
      'SPREAD_TENTHS',
      'CASING',
      'CASING_FRAMES',
      'CASING_LIFE',
      'BASE',
      'GUN',
      'FLARE',
      'TEAM_TINT',
      'state',
      'active_team'
    ],
    customClasses: ['SentryGun', 'TurretTarget'],
    hooks: ['wa.weapons.replace', 'wa.on.worm_message(wa.msg.START_TURN)'],
    files: [
      {
        path: 'weapons.lua',
        name: 'weapons.lua',
        language: 'lua',
        content: `-- Sentry gun in the bazooka slot, with stock mine placement on Space.
-- Baked sheets keep the base, firing barrel and housing in one draw, with
-- 120 angles per pose. a:frame() selects idle/firing without changing feet.
-- Angles: 0 down, 90 right, 180 up, 270 left.

local PX = 0x10000

local SENSOR_PX     = 360   -- detection radius
local AMMO          = 20    -- rounds per turn
local DAMAGE        = 2     -- per round
local SHOT_FRAMES   = 6     -- frames between rounds
local ACTIVATE      = 60    -- frames after acquiring before the first shot
local BEEP_FRAMES   = 60    -- minimum gap between alert beeps
local ROT_IDLE      = 0.5   -- degrees per frame while sweeping
local ROT_ACTIVE    = 1.5   -- PX tracking speed, degrees per frame
local SWEEP         = 10    -- PX idle sweep amplitude, degrees
local AIM_TOLERANCE = 1.5   -- PX fires only after rotation reaches the target
local HIT_PX        = 10    -- how near a ray passes a worm to count as a hit
local SELF_BLAST_PX = 24    -- never detonate a round closer than this
local REQUIRE_MOTION = true -- PX only acquires walking/jumping/moving worms

local SINK_PX     = 8      -- pixels the planted turret settles into the ground
local MUZZLE_UP   = 25     -- pixels from the anchor up to the turret pivot
local MUZZLE_OUT  = 11     -- pixels from the pivot along the bore

local SPREAD_TENTHS = 20 -- +-2.0 degrees
local CASING        = "sprites/casing"
local CASING_FRAMES = 16
local CASING_LIFE   = 100

local state = {}
local active_team = nil

local BASE  = "sprites/turret_base"
local GUN   = "sprites/turret_gun"
local FLARE = "sprites/turret_flare"
local IMPACT = "sprites/impact.png"

local IN_FRONT_OF_TERRAIN = 0x10000

local function tint(r, g, b)
  return r * 0x10000 + g * 0x100 + b
end

local TEAM_TINT = {
  tint(255, 100,  71),   -- 1 red
  tint( 71, 100, 255),   -- 2 blue
  tint( 71, 255, 100),   -- 3 green
  tint(230, 230,  71),   -- 4 yellow
  tint(230,  71, 230),   -- 5 magenta
  tint( 71, 230, 230),   -- 6 cyan
}

local function angle_to(ax, ay, tx, ty)
  local dx = (tx - ax) // PX
  local dy = (ty - ay) // PX
  local deg = math.deg(math.atan(dx, dy))
  if deg < 0 then deg = deg + 360 end
  return deg
end

local function turn_toward(cur, want, speed)
  local d = (want - cur + 540) % 360 - 180
  if d > speed then d = speed
  elseif d < -speed then d = -speed end
  return (cur + d) % 360
end

local function angle_gap(a, b)
  local d = (a - b + 540) % 360 - 180
  return d < 0 and -d or d
end

local function note_motion(s, w)
  local p = s.seen[w.id]
  local m = (w.vx ~= 0 or w.vy ~= 0)
  if p then
    if p.x ~= w.x or p.y ~= w.y then m = true end
    p.x, p.y, p.moving = w.x, w.y, m
  else
    s.seen[w.id] = { x = w.x, y = w.y, moving = m }
  end
end

local function moving(s, w)
  local p = s.seen[w.id]
  return p ~= nil and p.moving
end

local function sees(a, s, w, need_motion)
  if w.team == s.team or w.visible == false then return false end
  if need_motion and REQUIRE_MOTION and not moving(s, w) then return false end
  local ex, ey = a.x, a.y - MUZZLE_UP * PX
  local dx = (w.x - ex) // PX
  local dy = (w.y - ey) // PX
  if dx * dx + dy * dy > SENSOR_PX * SENSOR_PX then return false end
  return not wa.land.trace(ex, ey, w.x, w.y)
end

local function acquire(a, s)
  local ex, ey = a.x, a.y - MUZZLE_UP * PX
  local best, best_d
  for _, w in ipairs(wa.worms.all()) do
    if sees(a, s, w, true) then
      local dx = (w.x - ex) // PX
      local dy = (w.y - ey) // PX
      local d = dx * dx + dy * dy
      if not best_d or d < best_d or (d == best_d and w.id < best.id) then
        best, best_d = w, d
      end
    end
  end
  return best
end

local function fire(a, s)
  s.shots = s.shots + 1
  local dev = wa.random(-SPREAD_TENTHS, SPREAD_TENTHS) / 10
  local rad = math.rad(s.angle + dev)
  local dx, dy = math.sin(rad), math.cos(rad)
  local mx = a.x + math.floor(dx * MUZZLE_OUT * PX)
  local my = a.y - MUZZLE_UP * PX + math.floor(dy * MUZZLE_OUT * PX)
  local ex = mx + math.floor(dx * SENSOR_PX * PX)
  local ey = my + math.floor(dy * SENSOR_PX * PX)

  local hit = wa.land.trace(mx, my, ex, ey)
  local hx, hy = ex, ey
  if hit then hx, hy = hit.x, hit.y end

  wa.actors.spawn({
    sprite = IMPACT,
    x = hx,
    y = hy,
    vx = 0, vy = 0,
    gravity = false,
    collide = false,
    origin = "center",
    owner = s.owner,
    on = function(b)
      b:explode({ damage = DAMAGE, id = 101 })
      b:despawn()
    end,
  })

  s.ammo = s.ammo - 1
  if s.ammo <= 0 then
    s.active = false
  end
end

wa.weapons.replace({
  weapon = "bazooka",
  copy_from = "mine",
  name = "Sentry Gun",
  is_weapon = true,
  worm_sprites = {
    weaponlnk = "sprites/equip",
    wthrow = "sprites/unequip",
  },
  params = {
    sprite_columns = 1,
    worm_sprites_animate = true,
    depth = 0x190000,
    gpu_prefix = "sprites/turret_",
  },
  on_fire = function(fire_ev)
    local worm = fire_ev.worm
    local team = (worm and worm.team) or 1
    local facing = worm.facing
    local idle = facing < 0 and 270 or 90

    local body = wa.actors.spawn({
      sprite = BASE,
      x = worm.x,
      y = worm.y,
      vx = (worm.vx // 2) + facing * 19661,
      vy = (worm.vy // 2) - 9830,
      loop = false,
      origin = "bottom",
      owner = worm,
      kind = "sentry",
      persist = true,
      on = function(a, ev)
        -- Sentry loop update
      end,
    })
  end,
})

wa.on.worm_message(function(worm, msg)
  if msg == wa.msg.START_TURN then
    active_team = worm.team
    for _, s in pairs(state) do
      s.ammo = AMMO
      s.active = true
    end
  end
end)
`,
      },
      {
        path: 'mod.toml',
        name: 'mod.toml',
        language: 'toml',
        content: `id = "example.sentry_gun"
version = "0.1.0"
author = "wkLua"
api_version = 1
entry = "weapons.lua"

[weapons]
register = ["example.sentry_gun"]
replace = ["bazooka"]
`,
      },
      {
        path: 'README.md',
        name: 'README.md',
        language: 'markdown',
        content: `# Sentry Gun Mod
Autonomous deployable sentry turret with real-time target tracking and custom graphics.`,
      },
    ],
  },
];
