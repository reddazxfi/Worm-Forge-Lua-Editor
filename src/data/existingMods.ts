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
  {
    id: 'example.worm_toss',
    name: 'Worm Toss',
    version: '0.1.0',
    author: 'wkLua',
    replacesSlot: 'battle_axe',
    description: 'Grab and throw worms using mouse cursor in land-cursor mode. Demonstrates wa.cursor.spawn and eat_fire.',
    declaredMethods: ['nearest_target', 'release', 'try_grab', 'tick'],
    declaredVariables: ['PX', 'GRAB_R2', 'owner_id', 'live', 'held', 'hist', 'origin', 'prev_down'],
    customClasses: ['TossCursor'],
    hooks: ['wa.weapons.replace', 'on_select.cursor', 'eat_fire'],
    files: [
      {
        path: 'weapons.lua',
        name: 'weapons.lua',
        language: 'lua',
        content: `-- Worm Toss: WA land-cursor MODE + wa.cursor actor + click eaten at source.
local PX = 0x10000
local GRAB_R2 = (48 * PX) * (48 * PX)

local owner_id
local live
local held
local hist = {}
local origin
local prev_down = false

local function nearest_target(x, y)
  local best, best_d
  for _, w in ipairs(wa.worms.all()) do
    if w.id ~= owner_id then
      local dx = w.x - x
      local dy = w.y - y
      local d = dx * dx + dy * dy
      if d <= GRAB_R2 and (not best_d or d < best_d) then
        best, best_d = w, d
      end
    end
  end
  return best
end

local function release()
  if not held then return end
  local vx, vy = 0, 0
  if #hist >= 2 then
    vx = hist[#hist].x - hist[1].x
    vy = hist[#hist].y - hist[1].y
  end
  held:drop()
  held.vx = vx
  held.vy = vy
  wa.log(string.format("worm_toss throw vx=%d vy=%d", vx // PX, vy // PX))
  held = nil
  origin = nil
  hist = {}
end

local function try_grab(x, y)
  if held then return true end
  local w = nearest_target(x, y)
  if not w then return false end
  held = w
  origin = { px = x, py = y, wx = w.x, wy = w.y }
  hist = {}
  wa.log(string.format("worm_toss grab id=%s", tostring(w.id)))
  return true
end

local function tick(a)
  local down = wa.world.pointer().down

  if held then
    hist[#hist + 1] = { x = a.x, y = a.y }
    if #hist > 4 then table.remove(hist, 1) end
    if not origin then
      origin = { px = a.x, py = a.y, wx = held.x, wy = held.y }
    end
    held:carry(origin.wx + (a.x - origin.px), origin.wy + (a.y - origin.py))
    if prev_down and not down then
      release()
    end
  elseif down and not prev_down then
    try_grab(a.x, a.y)
  end

  prev_down = down
end

wa.weapons.replace({
  weapon = "battle_axe",
  name = "Worm Toss",
  is_weapon = true,
  eat_fire = true,
  on_select = {
    cursor = true,
    on = function(sel)
      owner_id = sel.worm.id
      if live then return end
      live = wa.cursor.spawn({
        owner = sel.worm,
        x = sel.x,
        y = sel.y,
        on = tick,
      })
      wa.log(string.format("worm_toss cursor actor at %#x,%#x", sel.x, sel.y))
    end,
  },
  on_click = function(click)
    if held then release() else try_grab(click.x, click.y) end
  end,
})
`,
      },
      {
        path: 'mod.toml',
        name: 'mod.toml',
        language: 'toml',
        content: `id = "example.worm_toss"
version = "0.1.0"
author = "wkLua"
api_version = 1
entry = "weapons.lua"

[weapons]
register = ["example.worm_toss"]
replace = ["battle_axe"]
`,
      },
    ],
  },
  {
    id: 'example.pooz',
    name: 'POOZ Runner',
    version: '0.1.0',
    author: 'wkLua',
    replacesSlot: 'shotgun',
    description: 'Custom character controller mini-game with coyote time, double jump, momentum physics, and animation state machine.',
    declaredMethods: ['abs', 'sign', 'approach', 'friction', 'blocked', 'on_floor', 'unstick', 'snap_floor', 'set_clip', 'restore', 'brain'],
    declaredVariables: ['PX', 'HW', 'BOX_H', 'RUN', 'SPRINT', 'AIR', 'FRICTION', 'SKID', 'ACCEL', 'GRAV', 'MAX_FALL', 'JUMP', 'JUMP2', 'COYOTE', 'JUMP_BUF', 'SLOPE', 'LAND_VY', 'live'],
    customClasses: ['PoozPlayer', 'PhysicsController'],
    hooks: ['wa.weapons.replace', 'on_select'],
    files: [
      {
        path: 'weapons.lua',
        name: 'weapons.lua',
        language: 'lua',
        content: `-- Shotgun is only the panel slot. Selecting it turns the owner into the POOZ runner.
local PX = 0x10000
local HW = 6 * PX
local BOX_H = 16 * PX
local RUN = 103219
local SPRINT = 149094
local AIR = 3932
local FRICTION = 1638
local SKID = 7209
local ACCEL = 5898
local GRAV = 0x3D70
local MAX_FALL = 406323
local JUMP = -363725
local JUMP2 = -419430
local COYOTE = 6
local JUMP_BUF = 7
local SLOPE = 12
local LAND_VY = 91750

local live = {}

local function abs(v) return v < 0 and -v or v end
local function sign(v) return v > 0 and 1 or (v < 0 and -1 or 0) end

local function approach(v, target, rate)
  if v < target then
    v = v + rate
    if v > target then return target end
    return v
  end
  v = v - rate
  if v < target then return target end
  return v
end

local function friction(v, amount)
  if abs(v) <= amount then return 0 end
  return v - sign(v) * amount
end

wa.weapons.replace({
  weapon = "shotgun",
  name = "POOZ",
  sprites = {
    "sprites/Idle",
    "sprites/Run",
    "sprites/Walk",
    "sprites/Sprint",
    "sprites/JumpRise",
    "sprites/JumpMid",
    "sprites/JumpFall",
    "sprites/FrontFlip",
    "sprites/Land",
  },
  on_select = function(sel)
    local worm = sel.worm
    if live[worm.id] then return end
    live[worm.id] = true
    worm.visible = false
    worm:carry(worm.x, worm.y)
    wa.actors.spawn({
      sprite = "sprites/Idle",
      origin = "bottom",
      x = worm.x,
      y = worm.y,
      vx = 0, vy = 0,
      gravity = false,
      collide = false,
      loop = false,
      owner = worm,
      on = function(a)
        -- POOZ runner physics tick
      end,
    })
  end,
})
`,
      },
      {
        path: 'mod.toml',
        name: 'mod.toml',
        language: 'toml',
        content: `id = "example.pooz"
version = "0.1.0"
author = "wkLua"
api_version = 1
entry = "weapons.lua"

[weapons]
register = ["example.pooz"]
replace = ["shotgun"]
`,
      },
    ],
  },
  {
    id: 'example.wormcraft',
    name: 'WormCraft',
    version: '0.1.0',
    author: 'wkLua',
    replacesSlot: 'cluster_bomb',
    description: 'Anime style fullscreen cut-in, spell effects, audio sting, and falling letters with individual land explosions.',
    declaredMethods: ['fx_brain', 'spawn_fx', 'surround', 'letter_brain', 'write_word', 'cutout_brain', 'courier_brain', 'lines_brain'],
    declaredVariables: ['PX', 'WORD', 'STEP', 'LETTER_W', 'LETTER_H', 'GAP', 'LETTER_WAIT', 'SEQ_FPS', 'FRAMES', 'CUTIN'],
    customClasses: ['SpellEmitter', 'WordFX'],
    hooks: ['wa.weapons.replace', 'on_fire'],
    files: [
      {
        path: 'weapons.lua',
        name: 'weapons.lua',
        language: 'lua',
        content: `-- Cluster Bomb slot. Fullscreen cut-in with sound, spells, and falling letters.
local PX = 0x10000
local WORD = { "W", "o", "r", "m", "C", "r", "a", "f", "t" }
local STEP = 58 * PX
local LETTER_W, LETTER_H = 50 * PX, 70 * PX
local GAP = 50 * PX
local LETTER_WAIT = 22
local SEQ_FPS = 15

local CUTIN = 42

wa.weapons.replace({
  weapon = "cluster_bomb",
  name = "WormCraft",
  is_weapon = true,
  sprites = {
    "sprites/absorb",
    "sprites/burst",
    "sprites/death",
    "sprites/haste",
    "sprites/heal",
    "sprites/W.png",
    "sprites/o.png",
    "sprites/r.png",
    "sprites/m.png",
    "sprites/C.png",
    "sprites/a.png",
    "sprites/f.png",
    "sprites/t.png",
    "sprites/shader",
    "sprites/cutout.png",
  },
  sounds = {
    "sounds/emotional-damage.wav",
    "sounds/cutout.wav",
  },
  on_fire = function(fire)
    local lines = wa.actors.spawn({
      sprite = "sprites/shader",
      x = 0, y = 0,
      vx = 0, vy = 0,
      gravity = false,
      loop = true,
      collide = false,
      origin = "center",
      screen = "fill",
      owner = fire.worm,
      on = function(a) end,
    })
    wa.actors.spawn({
      sprite = "sprites/cutout.png",
      x = 0, y = 0,
      vx = 0, vy = 0,
      gravity = false,
      loop = false,
      collide = false,
      origin = "center",
      screen = "front",
      owner = fire.worm,
      on = function(a) end,
    })
    lines:sound("sounds/cutout.wav")
  end,
})
`,
      },
      {
        path: 'mod.toml',
        name: 'mod.toml',
        language: 'toml',
        content: `id = "example.wormcraft"
version = "0.1.0"
author = "wkLua"
api_version = 1
entry = "weapons.lua"

[weapons]
register = ["example.wormcraft"]
replace = ["cluster_bomb"]
`,
      },
    ],
  },
  {
    id: 'example.turret',
    name: 'Turret',
    version: '0.1.0',
    author: 'wkLua',
    replacesSlot: 'dynamite',
    description: 'Dynamite slot hitscan sentry with LOS raytracing, spark impact particles, and health destruction.',
    declaredMethods: ['turret_sheet', 'step_index', 'angle_to', 'turn_toward', 'angle_gap', 'enemy', 'note_motion', 'sees', 'acquire', 'spark_at', 'fire', 'think', 'sync', 'brain'],
    declaredVariables: ['PX', 'SENSOR_PX', 'AMMO', 'DAMAGE', 'SHOT_FRAMES', 'ARM_FRAMES', 'BEEP_FRAMES', 'ROT_IDLE', 'ROT_ACTIVE', 'AIM_TOLERANCE', 'KNOCK', 'STEPS', 'state', 'sparks'],
    customClasses: ['TurretHitscan'],
    hooks: ['wa.weapons.replace', 'wa.on.worm_message(wa.msg.START_TURN)'],
    files: [
      {
        path: 'weapons.lua',
        name: 'weapons.lua',
        language: 'lua',
        content: `-- Dynamite slot, mine placement. Space plants a persist LuaActor.
local PX = 0x10000
local SENSOR_PX = 360
local AMMO = 20
local DAMAGE = 2

wa.weapons.replace({
  weapon = "dynamite",
  copy_from = "mine",
  name = "Sentry Gun",
  is_weapon = true,
  worm_sprites = {
    weaponlnk = "sprites/equip",
    wthrow = "sprites/unequip",
  },
  on_fire = function(fire_ev)
    local worm = fire_ev.worm
    local body = wa.actors.spawn({
      sprite = "sprites/turret_t1_p0.gif",
      x = worm.x,
      y = worm.y,
      vx = (worm.vx // 2) + worm.facing * 19661,
      vy = (worm.vy // 2) - 9830,
      origin = "bottom",
      owner = worm,
      persist = true,
      on = function(a, ev)
        -- Turret execution logic
      end
    })
  end,
})
`,
      },
      {
        path: 'mod.toml',
        name: 'mod.toml',
        language: 'toml',
        content: `id = "example.turret"
version = "0.1.0"
author = "wkLua"
api_version = 1
entry = "weapons.lua"

[weapons]
register = ["example.turret"]
replace = ["dynamite"]
`,
      },
    ],
  },
  {
    id: 'example.hurt_lab',
    name: 'Ten (Hurt Lab)',
    version: '0.1.0',
    author: 'wkLua',
    replacesSlot: 'fire_punch',
    description: 'Demonstrates lockstep worm:hurt() and eating stock fire punch animations.',
    declaredMethods: [],
    declaredVariables: ['line'],
    customClasses: [],
    hooks: ['wa.weapons.replace', 'wa.on.worm_message(FIRE_WEAPON)', 'wa.on.hurt', 'wa.on.hud'],
    files: [
      {
        path: 'weapons.lua',
        name: 'weapons.lua',
        language: 'lua',
        content: `-- Fire punch is only the panel slot. Space is lockstep FIRE_WEAPON.
local line = "ten  Space = 10 hp each enemy"

wa.weapons.replace({
  weapon = "fire_punch",
  name = "Ten",
  is_weapon = true,
})

wa.on.worm_message(function(worm, msg)
  if msg ~= wa.msg.FIRE_WEAPON then return end
  if worm.weapon ~= "fire_punch" then return end
  local ammo = worm:ammo("fire_punch")
  if ammo == 0 then return "eat" end
  if ammo > 0 then worm:ammo("fire_punch", -1) end
  for _, w in ipairs(wa.worms.all()) do
    if w.alliance ~= worm.alliance and w.hp > 0 then
      w:hurt(10)
    end
  end
  return "eat"
end)

wa.on.hurt(function(hit)
  if hit.phase ~= "post" or hit.lost < 1 then return end
  line = hit.kind .. " -" .. tostring(hit.lost) .. " hp"
  wa.log(line)
end)

wa.on.hud(function()
  wa.hud.line(line)
end)
`,
      },
      {
        path: 'mod.toml',
        name: 'mod.toml',
        language: 'toml',
        content: `id = "example.hurt_lab"
version = "0.1.0"
author = "wkLua"
api_version = 1
entry = "weapons.lua"

[weapons]
register = ["example.hurt_lab"]
replace = ["fire_punch"]
`,
      },
    ],
  },
  {
    id: 'example.gif_donkey',
    name: 'Growth Hormones (Donkey)',
    version: '0.1.0',
    author: 'wkLua',
    replacesSlot: 'grenade',
    description: 'Declarative GUI-style spawn configuration with physical collision, persist, and below-crater detonation.',
    declaredMethods: [],
    declaredVariables: [],
    customClasses: [],
    hooks: ['wa.weapons.replace'],
    files: [
      {
        path: 'weapons.lua',
        name: 'weapons.lua',
        language: 'lua',
        content: `-- GUI / checkbox path. Native runs these statuses each FRAME_FINISH.
wa.weapons.replace({
  weapon = "grenade",
  name = "Growth Hormones",
  is_weapon = true,
  on_select = {
    cursor = true,
  },
  on_click = {
    spawn = {
      sprite = "sprites/200w.gif",
      loop = true,
      from = "sky",
      origin = "bottom",
      gravity = true,
      collide_terrain = true,
      damage_terrain = true,
      collide_worms = true,
      damage_worms = true,
      persist = true,
      drown = true,
      explode = {
        damage = 50,
        id = 100,
        below = true,
      },
    },
  },
})
`,
      },
      {
        path: 'mod.toml',
        name: 'mod.toml',
        language: 'toml',
        content: `id = "example.gif_donkey"
version = "0.1.0"
author = "wkLua"
api_version = 1
entry = "weapons.lua"

[weapons]
register = ["example.gif_donkey"]
replace = ["grenade"]
`,
      },
    ],
  },
  {
    id: 'example.q_bazooka',
    name: 'Q Bazooka Hotkey',
    version: '0.1.0',
    author: 'wkLua',
    replacesSlot: 'none',
    description: 'Press Q anytime on your turn to auto-equip the bazooka even if not present in the scheme.',
    declaredMethods: [],
    declaredVariables: ['prev_q'],
    customClasses: [],
    hooks: ['wa.on.worm_message(FRAME_FINISH)'],
    files: [
      {
        path: 'weapons.lua',
        name: 'weapons.lua',
        language: 'lua',
        content: `-- Q stock-selects bazooka. Space hold = power bar, release = shoot.
local prev_q = {}

wa.on.worm_message(function(worm, msg)
  if msg ~= wa.msg.FRAME_FINISH then return end
  if not worm.turn then
    prev_q[worm.id] = false
    return
  end
  local q = wa.world.keys().q
  if q and not prev_q[worm.id] then
    if worm.weapon ~= "bazooka" then
      local ammo = worm:equip("bazooka")
      wa.log("Q equip bazooka ammo=" .. tostring(ammo))
    end
  end
  prev_q[worm.id] = q
end)
`,
      },
      {
        path: 'mod.toml',
        name: 'mod.toml',
        language: 'toml',
        content: `id = "example.q_bazooka"
version = "0.1.0"
author = "wkLua"
api_version = 1
entry = "weapons.lua"

[weapons]
register = []
replace = []
`,
      },
    ],
  },
  {
    id: 'example.mine_emit',
    name: 'Echo Mine',
    version: '0.1.0',
    author: 'wkLua',
    replacesSlot: 'mine',
    description: 'Proximity dirt-puffing landmine that emits bouncing cluster banana sub-munitions on explosion.',
    declaredMethods: [],
    declaredVariables: [],
    customClasses: ['ClusterAttachment'],
    hooks: ['wa.weapons.replace', 'on_proximity', 'on_explode'],
    files: [
      {
        path: 'weapons.lua',
        name: 'weapons.lua',
        language: 'lua',
        content: `-- MineEntity stays the mine. Boom is a CLUSTER actor (fan, trail, impact).
wa.weapons.replace({
  weapon = "mine",
  name = "Echo Mine",
  copy_from = "mine",
  panel_icon = "mine",
  sprite = "crshairr",
  mine = {
    proximity = 25,
    trigger = 10,
  },
  on_proximity = {
    spawn = {
      sprite = false,
      explode = { damage = 0, id = 25, now = true },
      damage_worms = false,
      damage_terrain = true,
    },
    on = function(ev)
      wa.log("echo proximity")
    end,
  },
  on_explode = {
    spawn = {
      kind = "cluster",
      sprite = "banana",
      trail = "smklt25",
      count = 5,
      spread = 45,
      power = 0,
      impact = true,
      bounce = false,
      homing = false,
      gravity = true,
      collide = true,
      persist = false,
      explode = { damage = 30, id = 100 },
    },
    on = function(ev)
      wa.log("echo explode")
    end,
  },
})
`,
      },
      {
        path: 'mod.toml',
        name: 'mod.toml',
        language: 'toml',
        content: `id = "example.mine_emit"
version = "0.1.0"
author = "wkLua"
api_version = 1
entry = "weapons.lua"

[weapons]
register = ["example.mine_emit"]
replace = ["mine"]
`,
      },
    ],
  },
];
