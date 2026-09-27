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
    id: 'gameplay.highlander.verbs',
    name: 'Highlander (Verb-Based Pack)',
    version: '0.8.0',
    author: 'WormForge Team',
    category: 'gameplay',
    exclusiveGroup: 'highlander',
    isExclusiveWarning: 'Highlander ships as a verb-based pack and a pure-Lua reference; enable only one.',
    installed: true,
    enabled: true,
    replacesSlot: 'none (rules)',
    description: 'Highlander gameplay rules using WormForge 0.7.4 high-level verbs: no weapon-slot claim, deals/steals stock weapons on kills, cavern-aware subterranean fallback, and absolute ammo management.',
    declaredMethods: ['onTurnStart', 'onWormDeath', 'adaptForCavern'],
    declaredVariables: ['PX', 'inv', 'is_cavern', 'KILL_REWARD_WEAPONS'],
    customClasses: ['HighlanderRules'],
    hooks: ['wa.on.turn_start', 'wa.on.death', 'wa.cavern.is_cavern'],
    tags: ['0.7.1', 'gameplay', 'verbs', 'cavern', 'highlander'],
    files: [
      {
        path: 'highlander.lua',
        name: 'highlander.lua',
        language: 'lua',
        content: `-- Highlander (Verb-Based Pack)
-- WormForge 0.7.4 — Per-worm inventories & rule events
-- Rules:
-- 1. No weapon slot claim (pure rules mod, leaves weapon slots untouched).
-- 2. Deal/steal stock weapons on kills with conservative combat attribution.
-- 3. Cavern-aware: automatically adapts air strikes if enclosed subterranean roof is detected.
-- 4. Absolute ammo API avoids team ammo-row sync quirks.

local PX = 0x10000

local KILL_REWARD_WEAPONS = {
  "bazooka",
  "homing_missile",
  "shotgun",
  "fire_punch",
  "dynamite",
  "mine",
  "sheep"
}

-- Check map cavern state: if ceiling exists, open-sky weapons are replaced
local is_cavern = wa.cavern.is_cavern()
if is_cavern then
  wa.log("[Highlander] Enclosed cavern detected (ceiling at " .. tostring(wa.cavern.ceiling_y and (wa.cavern.ceiling_y // PX) or "unknown") .. "px). Open-sky air strikes disabled.")
end

-- Create virtual per-worm inventory store scoped to this pack
local inv = wa.inventory.create({
  id = "highlander_store",
  slots = KILL_REWARD_WEAPONS
})

-- On turn start: materialize active worm's personal arsenal
wa.on.turn_start(function(ev)
  local worm = ev.worm
  if not worm then return end

  -- Materialize this specific worm's personal inventory onto the alliance live row
  inv:apply(worm, { clear = false, each = 1 })
  wa.log("[Highlander] Turn started for Worm #" .. tostring(worm.id) .. " (Team " .. tostring(worm.team) .. ")")
end)

-- On death: conservative combat attribution on hurt/death
wa.on.death(function(ev)
  local victim = ev.victim
  local attacker = ev.attacker
  local weapon = ev.weapon or "unknown"

  if not victim then return end

  wa.log("[Highlander] Worm #" .. tostring(victim.id) .. " was slain by " .. (attacker and ("Worm #" .. tostring(attacker.id)) or "environment") .. " using " .. weapon)

  -- Steal stock weapons if killed by an opposing worm
  if attacker and attacker.team ~= victim.team then
    -- Transfer all virtual inventory from victim to killer
    inv:transfer(victim, attacker, { weapons = "all", mode = "move" })

    -- Give bonus kill reward stock weapon directly via Absolute Ammo API
    local reward = KILL_REWARD_WEAPONS[wa.random(1, #KILL_REWARD_WEAPONS)]
    if is_cavern and (reward == "air_strike" or reward == "napalm_strike") then
      reward = "dynamite" -- cavern-aware fallback
    end

    attacker:ammo_absolute(reward, (attacker:ammo(reward) or 0) + 1)
    wa.log("[Highlander] " .. tostring(attacker.id) .. " stole stock arsenal and received 1x " .. reward .. "!")
  end

  inv:clear(victim)
end)
`,
      },
      {
        path: 'mod.toml',
        name: 'mod.toml',
        language: 'toml',
        content: `id = "gameplay.highlander.verbs"
name = "Highlander (Verb-Based Pack)"
version = "0.7.1"
author = "WormForge Team"
category = "gameplay"
api_version = 1
entry = "highlander.lua"

[rules]
exclusive_group = "highlander"
no_slot_claim = true
cavern_aware = true
`,
      },
      {
        path: 'README.md',
        name: 'README.md',
        language: 'markdown',
        content: `# Highlander (Verb-Based Pack)
### WormForge 0.7.1 Engine Features:
- **No weapon-slot claim**: Modifies core match rules without replacing any stock weapon slot.
- **Deal/Steal Stock Weapons**: Slaying an enemy worm transfers their personal loadout and awards stock ammo.
- **Cavern-Aware**: Automatically checks \`wa.cavern.is_cavern()\` and swaps sky airstrikes for subterranean weapons.
- **Absolute Ammo API**: Uses \`worm:ammo_absolute()\` to avoid WA team-row desyncs.
- **Mutual Exclusivity**: Ships alongside the pure-Lua reference; enable only one pack at a time.
`,
      },
    ],
  },
  {
    id: 'gameplay.highlander.pure',
    name: 'Highlander (Pure Lua Reference)',
    version: '0.7.1',
    author: 'WormForge Team',
    category: 'gameplay',
    exclusiveGroup: 'highlander',
    isExclusiveWarning: 'Highlander ships as a verb-based pack and a pure-Lua reference; enable only one.',
    installed: true,
    enabled: false,
    replacesSlot: 'none (rules)',
    description: 'Pure Lua reference implementation of Highlander rules without high-level engine verbs: manual attribution tables, damage tracking, and direct ammo table manipulation.',
    declaredMethods: ['track_damage', 'award_spoils', 'check_cavern_roof'],
    declaredVariables: ['PX', 'last_hit', 'kill_loot', 'personal_stocks'],
    customClasses: ['PureHighlander'],
    hooks: ['wa.on.worm_message', 'wa.on.death', 'wa.worms.all'],
    tags: ['0.7.1', 'gameplay', 'pure-lua', 'reference', 'highlander'],
    files: [
      {
        path: 'highlander_pure.lua',
        name: 'highlander_pure.lua',
        language: 'lua',
        content: `-- Highlander (Pure Lua Reference)
-- Demonstrates manual implementation of Highlander mechanics without wa.inventory verbs.
-- Enable only one Highlander pack at a time!

local PX = 0x10000

local last_hit = {}       -- [victim_id] = { attacker = worm, frame = int, weapon = str }
local personal_stocks = {} -- [worm_id] = { ["bazooka"] = 2, ["shotgun"] = 3 }

local function check_cavern_roof()
  return wa.cavern.is_cavern() or (wa.cavern.ceiling_y ~= nil)
end

-- Conservative attribution tracking: record attacker when hit
wa.on.worm_message(function(worm, msg)
  if msg == wa.msg.START_TURN then
    -- Turn start for worm
    local stock = personal_stocks[worm.id]
    if stock then
      for wep, count in pairs(stock) do
        worm:ammo_absolute(wep, count)
      end
    end
  end
end)

-- Death hook with attribution
wa.on.death(function(ev)
  local victim = ev.victim
  local attacker = ev.attacker
  if not victim then return end

  if attacker and attacker.team ~= victim.team then
    -- Siphon victim's recorded ammo
    local v_stock = personal_stocks[victim.id] or {}
    local a_stock = personal_stocks[attacker.id] or {}

    for wep, count in pairs(v_stock) do
      a_stock[wep] = (a_stock[wep] or 0) + count
    end

    -- Bonus weapon
    local reward = check_cavern_roof() and "dynamite" or "homing_missile"
    a_stock[reward] = (a_stock[reward] or 0) + 1
    personal_stocks[attacker.id] = a_stock

    -- Update active attacker's live ammo immediately
    attacker:ammo_absolute(reward, a_stock[reward])
    wa.log("[Pure Highlander] Worm #" .. tostring(attacker.id) .. " claimed spoils from Worm #" .. tostring(victim.id))
  end

  personal_stocks[victim.id] = nil
end)
`,
      },
      {
        path: 'mod.toml',
        name: 'mod.toml',
        language: 'toml',
        content: `id = "gameplay.highlander.pure"
name = "Highlander (Pure Lua Reference)"
version = "0.7.1"
author = "WormForge Team"
category = "gameplay"
api_version = 1
entry = "highlander_pure.lua"

[rules]
exclusive_group = "highlander"
no_slot_claim = true
`,
      },
      {
        path: 'README.md',
        name: 'README.md',
        language: 'markdown',
        content: `# Highlander (Pure Lua Reference)
Manual table-based state tracking for Highlander gameplay. Reference implementation demonstrating low-level engine hooks without high-level store verbs.
`,
      },
    ],
  },
  {
    id: 'example.bee',
    name: 'Keeper Bee',
    version: '0.1.0',
    author: 'reddaz',
    category: 'weapons',
    installed: true,
    enabled: true,
    replacesSlot: 'skunk',
    description: 'Ported from the PX bee_script (CBee : CMine). Thrown like a grenade; spawns a persistent actor that roams near its landing point, homes onto the nearest visible moving enemy worm, and detonates on contact, death, or bonk limit. Includes spiral clearance and anti-stall.',
    declaredMethods: [
      'brain',
      'checkSpawnPoint',
      'isClearOfTerrain',
      'isThereLandThere',
      'findClosestEnemy',
      'pickRoamPoint',
      'randomizeSpeed',
      'detonate',
      'updateAnim',
      'steer',
      'playBuzz',
      'shouldStop'
    ],
    declaredVariables: [
      'PX',
      'SENSOR_RADIUS_PX',
      'CONTACT_RADIUS_PX',
      'CHASE_SPEED',
      'ROAM_SPEED',
      'BONK_LIMIT',
      'MAX_HP',
      'SPRITE',
      'state'
    ],
    customClasses: ['CBee', 'KeeperBee'],
    hooks: ['wa.weapons.replace', 'wa.actors.spawn', 'wa.land.solid', 'wa.land.trace', 'wa.sound.play'],
    tags: ['weapons', 'bee', 'homing', 'cbee', 'mine', 'px-port'],
    files: [
      {
        path: 'bee.lua',
        name: 'bee.lua',
        language: 'lua',
        content: `-- Keeper Bee, ported from the PX bee_script (CBee : CMine).
-- Thrown like a grenade; spawns a persistent actor that roams near its
-- landing point, homes onto the nearest visible enemy worm once it finds
-- one, and detonates on contact, on death, or after too many terrain bonks.
--
-- NOT PORTED (see chat for why): Flowers plugin, taze/CEffectManager
-- (supercharged state is scaffolded but never turned on), per-hit-type
-- damage, blast distance-falloff, the missile-that-becomes-a-bee variant,
-- sprite mirroring via renderFlags (using a.facing instead, unverified).
--
-- REDONE per request: PX's \`if (Dead || FreeMe || stopMe) return;\` guard,
-- repeated at the top of nearly every CBee method, is now one shouldStop(s)
-- called wherever that guard used to be inline.

local PX = 0x10000

local SENSOR_RADIUS_PX  = 235   -- sqrt(47900) from FindClosestEnemy, rounded
local CONTACT_RADIUS_PX = 26    -- distToTarg < 26 in the original -> detonate
local CHASE_SPEED       = (4.5) * PX     -- was 7*PX -- see "way too fast" note
local CHASE_STRENGTH    = 0.17       -- lower blend too, was snapping near-instantly
local CHASE_STEER_EVERY = 2          -- PX only re-steers every homingCD (2) frames, not every tick
local ROAM_SPEED        = (0.6) * PX  -- kept as ROAM_STRENGTH's pairing; RandomizeSpeed below now drives actual roam speed
local ROAM_SPEED_BASE   = 0.12        -- per-unit speed; RandomizeSpeed multiplies this
local ROAM_COOLDOWN_MIN = 10
local ROAM_COOLDOWN_MAX = 20
local ROT_SMOOTH_DEG    = 6           -- how fast s.rot chases s.desiredAngle per tick
local ROAM_STRENGTH     = 0.15
local ROAM_STEER_EVERY  = 2
local BONK_LIMIT        = 20   -- approximation of the \`bonk\` counter forcing a spin
local SPIN_FRAMES       = 20   -- spinframeLimit's RandomInt(37,53), fixed instead
local MAX_HP            = 25   -- HitPoints
local ROAM_RANGE_X      = 55   -- CalculatePlace's findDirX range
local ROAM_RANGE_Y      = 110
local ROAM_ARRIVE_PX    = 20   -- distToGoal < 20.0
local BEE_RADIUS_PX     = 9   -- CColMask(10,10, circle 10) -- see mask note below
local CORNER_BUFFER_PX  = 6   -- IsThereLandThere's \`b\` -- corner offset for the 5-line probe
local HOMING_MAX_DIST_PX = 470  -- distToTarg > 470 -> give up chase (AntiStall)
local HOMING_MAX_DURATION = 160 -- frames chasing before giving up regardless of distance
local ROAM_MAX_DIST_PX   = 420  -- distToSpawn > 420 -> give up chase, head home
local LOOKOUT_COOLDOWN_GIVEUP  = 150  -- frames before re-targeting after giving up on distance
local LOOKOUT_COOLDOWN_TIMEOUT = 200  -- frames before re-targeting after giving up on duration

local ROAM_FAIL_THRESHOLD  = 10   -- consecutive pickRoamPoint failures before shrinking the search
local ROAM_FAIL_SCALE      = 0.5  -- "reduced range (normal range / 2)" once past the threshold

local CLIP_FRAMES_LIMIT    = 20   -- consecutive frames embedded in terrain before giving up and despawning

local ROAM_SLOWDOWN_RADIUS_PX = 60    -- start easing speed down this far from the roam point
local ROAM_SLOWDOWN_MIN_FRAC  = 0.35  -- floor on that ease-in, so it never crawls the last stretch

local BEE_FRAME_COUNT = 4     -- frames in the flight strip
local BEE_FRAME_HOLD  = 5     -- ticks per frame at a standstill; flaps faster the harder it's moving
local BEE_FRAME_HOLD_MIN = 2  -- floor, so a fast chase doesn't flip frames into a blur

-- Sprite goes at mods/examples/keeper_bee/sprites/bee_flight.png -- a
-- horizontal strip of BEE_FRAME_COUNT equal-width frames (flap cycle),
-- GPU-rotated same as the saw. sprite_columns below tells the loader how to
-- slice the strip. gpu_prefix routes it to the atlas -- verify the exact
-- prefix/extension convention in-game before trusting this, we've been
-- burned by that twice already on the saw.
local SPRITE  = "sprites/bee_flight.png"

local state = {}   -- state[actor.id] = { ...all CBee fields that matter here... }

-- ---------------------------------------------------------------------
-- shouldStop(s): the one-liner these used to be everywhere.
-- ---------------------------------------------------------------------
local function shouldStop(s)
  return s.dead or s.freeMe or s.stopMe
end

-- ---------------------------------------------------------------------
-- isClearOfTerrain: samples a ring of points at radiusPx around (x,y),
-- plus the center itself. All must be non-solid for the spot to count as
-- clear -- this is the "does the whole disc fit" check checkSpawnPoint was
-- missing when it only tested the single center point.
-- ---------------------------------------------------------------------
local function isClearOfTerrain(x, y, radiusPx)
  if wa.land.solid(x, y) then
    return false
  end
  local probes = 8
  for i = 0, probes - 1 do
    local ang = (i / probes) * 2 * math.pi
    local px = x + math.floor(radiusPx * math.cos(ang)) * PX
    local py = y + math.floor(radiusPx * math.sin(ang)) * PX
    if wa.land.solid(px, py) then
      return false
    end
  end
  return true
end

-- ---------------------------------------------------------------------
-- Port of utils_red's CheckSpawnPoint. No wa.* equivalent exists, so this
-- is the actual spiral-search algorithm, translated: expand outward from
-- (x,y) in rings, and within each ring sweep degrees looking for a spot
-- that (a) is clear of terrain across the bee's own radius (isClearOfTerrain,
-- not just the center point) and (b) has clear line of sight to
-- (targetX,targetY).
-- ---------------------------------------------------------------------
local function checkSpawnPoint(x, y, targetX, targetY, maxRadiusPx, clearRadiusPx)
  maxRadiusPx = maxRadiusPx or (50 * PX)
  clearRadiusPx = clearRadiusPx or (BEE_RADIUS_PX + 1)
  local r = 0
  while r <= maxRadiusPx do
    local step
    if r == 0 then
      step = 360
    else
      step = math.max(15, math.floor(360 / ((r / PX) / 2)))
    end
    local deg = 0
    while deg < 360 do
      local rad = deg * math.pi / 180
      local tx = x + math.floor(r * math.cos(rad))
      local ty = y + math.floor(r * math.sin(rad))
      if isClearOfTerrain(tx, ty, clearRadiusPx) then
        local hit = wa.land.trace(tx, ty, targetX, targetY)
        if not hit or not hit.hit then
          return tx, ty
        end
      end
      deg = deg + step
    end
    r = r + 4 * PX   -- ring step; not shown in the source extract, picked to taste
  end
  return nil, nil
end

-- ---------------------------------------------------------------------
-- Steering: shared shape of HomeToTarget / HomeToPlace -- normalize the
-- direction to (tx,ty), build a desired velocity at \`speed\`, and blend the
-- actor's current velocity toward it by \`strength\` per tick rather than
-- snapping, so it turns instead of teleporting its heading.
-- ---------------------------------------------------------------------
local function steer(a, tx, ty, speed, strength)
  local dx, dy = tx - a.x, ty - a.y
  local dist = math.sqrt(dx * dx + dy * dy)
  if dist > 0 then
    dx, dy = dx / dist, dy / dist
  end
  local wantVx = math.floor(dx * speed)
  local wantVy = math.floor(dy * speed)
  a.vx = a.vx + math.floor((wantVx - a.vx) * strength)
  a.vy = a.vy + math.floor((wantVy - a.vy) * strength)
end

local function distPx(a, tx, ty)
  local dx, dy = (tx - a.x) // PX, (ty - a.y) // PX
  return math.sqrt(dx * dx + dy * dy)
end

-- ---------------------------------------------------------------------
-- Port of IsThereLandThere: instead of correcting embedding after the fact
-- every tick (the ring-probe this replaces), check BEFORE committing to a
-- point whether the straight path to it -- plus 4 corner-offset paths at
-- CORNER_BUFFER_PX, same shape the original used -- is actually clear. If
-- nothing ever gets steered toward a blocked path, there's much less need
-- to correct embedding every frame at all.
-- ---------------------------------------------------------------------
local function isThereLandThere(a, tx, ty)
  local b = CORNER_BUFFER_PX * PX
  local tyOff = ty - 3 * PX

  local function blocked(x0, y0, x1, y1)
    local hit = wa.land.trace(x0, y0, x1, y1)
    return hit and hit.hit
  end

  if blocked(a.x, a.y, tx, tyOff) then return true end
  if blocked(a.x - b, a.y - b, tx - b, tyOff - b) then return true end
  if blocked(a.x + b, a.y - b, tx + b, tyOff - b) then return true end
  if blocked(a.x - b, a.y + b, tx - b, tyOff + b) then return true end
  if blocked(a.x + b, a.y + b, tx + b, tyOff + b) then return true end
  return false
end

-- FindClosestEnemy, minus the flower/OwnerColor bookkeeping. Added: only
-- consider worms that are actually moving (w.vx/vy ~= 0), approximating the
-- original's \`if (ObjState != WS_WALKING) if (!IsMoving()) continue\` --
-- neither ObjState nor IsMoving() is exposed, vx/vy is what's available.
-- Also gated by lookoutCooldown, same as the original -- giving up a chase
-- (distance or duration timeout) shouldn't instantly re-acquire next tick.
local function findClosestEnemy(a, s)
  if (s.lookoutCooldown or 0) > 0 then
    return nil
  end
  local best, bestDist2
  for _, w in ipairs(wa.worms.all()) do
    local moving = w.vx ~= 0 or w.vy ~= 0
    if w.team ~= s.team and w.hp > 0 and moving then
      local dx = (w.x - a.x) // PX
      local dy = (w.y - a.y) // PX
      local d2 = dx * dx + dy * dy
      if d2 <= SENSOR_RADIUS_PX * SENSOR_RADIUS_PX and (not bestDist2 or d2 < bestDist2) then
        if not isThereLandThere(a, w.x, w.y) then
          best, bestDist2 = w, d2
        end
      end
    end
  end
  return best
end

-- Worms have no by-id lookup in the docs, so re-scan. Fine at this scale;
-- would need revisiting if a pack ever has many bees active simultaneously.
local function wormById(id)
  if not id then
    return nil
  end
  for _, w in ipairs(wa.worms.all()) do
    if w.id == id then
      return w
    end
  end
  return nil
end

local function randomizeSpeed()
  local randspeed = wa.random(1, 7)
  local finalspeed = (ROAM_SPEED_BASE * randspeed) * PX
  return finalspeed
end

local function tryFindPath(a, s, scale)
  local rangeX = math.floor(ROAM_RANGE_X * scale)
  local rangeY = math.floor(ROAM_RANGE_Y * scale)
  
  local fx = wa.random(-rangeX, rangeX) * PX
  local fy = wa.random(-rangeY, rangeY) * PX
  local tx, ty = s.startX - fx, s.startY - fy
  
  if not isThereLandThere(a, tx, ty) then
    return tx, ty
  end
  return nil, nil
end

local function pickRoamPoint(a, s)
  s.roamFailStreak = s.roamFailStreak or 0

  -- After ROAM_FAIL_THRESHOLD straight misses, the bee is boxed into some
  -- unknown/cramped pocket -- stop repeatedly asking for the same wide
  -- search and shrink both tries to half range instead.
  local shrink = s.roamFailStreak >= ROAM_FAIL_THRESHOLD
  local scale1 = shrink and (1.0 * ROAM_FAIL_SCALE) or 1.0
  local scale2 = shrink and (0.78 * ROAM_FAIL_SCALE) or 0.78

  -- Try 1: Primary wide range search (equivalent to CalculatePlace 2.5)
  local tx, ty = tryFindPath(a, s, scale1)
  if tx then
    s.arriveX, s.arriveY = tx, ty
    s.roamSpeed = randomizeSpeed()
    s.roamFailStreak = 0
    --s.seekCooldown = wa.random(30, 90)
    return true
  end

  -- Try 2: Tighter fallback search (equivalent to CalculatePlace 1.95)
  tx, ty = tryFindPath(a, s, scale2)
  if tx then
    s.arriveX, s.arriveY = tx, ty
    s.roamSpeed = randomizeSpeed()
    s.roamFailStreak = 0
    --s.seekCooldown = wa.random(25, 80)
    return true
  end

  -- Both attempts blocked by terrain
  s.roamFailStreak = s.roamFailStreak + 1
  return false
end

local function playBuzz(a)
  -- MakeSound's 4-variant random pick. Sound files not wired up yet --
  -- fill in bzz1..4.wav under sounds/ and list them below once you have them.
  local i = wa.random(1, 4)
  wa.sound.play(a, "sounds/bzz1.wav")
end

local function detonate(a, s)
  a:explode({ damage = s.supercharged and 55 or 40, id = 100 })
  state[a.id] = nil
  a:despawn()
end

-- Cycles the flight strip's BEE_FRAME_COUNT frames. Hold time shortens with
-- how fast the bee is actually moving (its own vx/vy, not a target speed),
-- clamped at BEE_FRAME_HOLD_MIN so a hard chase doesn't blur the flap into
-- a strobe. Purely presentational -- a:frame() never touches simulation
-- state -- so it's fine to just read a.vx/a.vy here.
local function updateAnim(a, s)
  local speedPx = (math.abs(a.vx) + math.abs(a.vy)) / PX
  local hold = math.max(BEE_FRAME_HOLD_MIN, BEE_FRAME_HOLD - math.floor(speedPx / 2))
  s.animTick = (s.animTick or 0) + 1
  if s.animTick >= hold then
    s.animTick = 0
    s.sprnum = (s.sprnum % BEE_FRAME_COUNT) + 1
    a:frame(s.sprnum - 1)
  end
end


-- ---------------------------------------------------------------------
-- Main brain. One function instead of Message()/BeeThink()/beeRoam()/etc
-- split across a dozen methods -- there's no \`super\` chain to interleave
-- with here, so there's nothing forcing that split the way PX's override
-- model does.
-- ---------------------------------------------------------------------
local function brain(a, ev)
  local s = state[a.id]
  if not s then
    return
  end
  ev = ev or {}

  -- Damage: flat, blast-only (see NOT PORTED). Also kicks off the death
  -- spin, same as TakeExplosionDamage's spin=true; spinN += 8.
  if (ev.damage or 0) > 0 then
    s.hp = s.hp - ev.damage
    s.spin = true
    s.spinN = (s.spinN or 0) + 8
    if s.hp <= 0 then
      s.dead = true
    end
  end

  if s.freeMe then
    state[a.id] = nil
    a:despawn()
    return
  end

  -- Dead and not yet spinning: start the wind-up instead of exploding
  -- instantly (FuckingDie is still reachable directly below on contact-kill
  -- or HP overkill, this branch is just the "died from attrition" path).
  if s.dead and not s.spin and not s.softSpin then
    s.spin = true
    s.spinN = 0
  end
  if s.spin or s.softSpin then
    if s.spinN == 0 then 
	   playBuzz(a)
	end 
    a.vx, a.vy = 0, 0
    s.rot = (s.rot + (s.dead and 9 or 7)) % 360
    a:angle(s.rot)
    s.spinN = s.spinN + 1
    if s.spinN >= SPIN_FRAMES then
      if s.dead then
        detonate(a, s)
        return
      end
      s.spin, s.softSpin, s.spinN = false, false, 0
    end
    return
  end
  if shouldStop(s) then
    a.vx, a.vy = 0, 0
    return
  end

  -- No gravity here: CBee inherits from CMine, whose own gravity factor is
  -- near-zero, and the original only ever moves itself via the roam/chase
  -- steering (SpX/SpY +=), not by falling and correcting. Calling
  -- a:gravity() here applied full WA gravity to something meant to fly
  -- weightlessly -- steer() at this blend strength can't fight that, so it
  -- just dropped straight down regardless of target. If a heavier, more
  -- insect-hover feel is wanted later, add a small explicit downward pull
  -- here rather than the stock a:gravity().
  local hit = a:move({ terrain = true, worms = false })

  if hit.terrain then
    s.bonk = (s.bonk or 0) + 1
    if s.bonk > BONK_LIMIT then
      --s.spin, s.targetId, s.spinN, s.bonk = true, nil, 0, 0
      s.spin, s.targetId, s.bonk = false, nil, 0
      -- This many bonks in a row means it's actually embedded, not just
      -- steered at a bad point -- isThereLandThere only checks a straight
      -- line to a candidate, it doesn't confirm the bee's own spot is
      -- clear. Run the same spiral search used at spawn (CheckSpawnPoint)
      -- to find genuinely clear ground near here and warp onto it, same as
      -- the original's re-embed correction, before picking a fresh roam
      -- point from that spot.
      local sx, sy = checkSpawnPoint(a.x, a.y, a.x, a.y, 50 * PX)
      if sx then
        a.x, a.y = sx, sy
        a.vx, a.vy = 0, 0
      end
      local hasRoam = pickRoamPoint(a,s) 
      if not hasRoam then
        pickRoamPoint(a,s)
      end
      return
    end
  elseif s.bonk and s.bonk > 0 and (a.id + 0) % 10 == 0 then
    s.bonk = s.bonk - 1   -- slow decay, port of \`if (gframe % 10 == 0) bonk--\`
  end

  -- Safeguard: CheckSpawnPoint above can still come up empty (maxRadiusPx
  -- exhausted with no clear ring found), leaving the bee genuinely stuck
  -- inside solid terrain with nothing in this file able to move it out.
  -- Count consecutive embedded frames regardless of how it got there, and
  -- despawn outright past CLIP_FRAMES_LIMIT rather than let it sit spinning
  -- its wheels (or the frame loop) inside the landscape forever.
  if wa.land.solid(a.x, a.y) then
    s.clipFrames = (s.clipFrames or 0) + 1
    if s.clipFrames > CLIP_FRAMES_LIMIT then
      state[a.id] = nil
      a:despawn()
      return
    end
  else
    s.clipFrames = 0
  end

  if a:in_water() then
    s.dead = true
    return
  end

  updateAnim(a, s)

  -- Facing. a.facing is the documented LuaActor field; whether the renderer
  -- actually mirrors art on it is unverified -- check in-game.
  -- Facing. a.facing is the documented LuaActor field; whether the renderer
  -- actually mirrors art on it is unverified -- check in-game.
  if a.vx ~= 0 then
    a.facing = a.vx > 0 and 1 or -1
  end

  if (s.lookoutCooldown or 0) > 0 then
    s.lookoutCooldown = s.lookoutCooldown - 1
  end

  -- Targeting: keep the current target if it's still alive/enemy, else
  -- rescan. Re-resolved by .id every tick per the stable-id rule -- never
  -- holding onto a WormHandle across frames.
  local target = wormById(s.targetId)
  if target and (target.hp <= 0 or target.team == s.team) then
    target = nil
    s.targetId = nil
  end
  if not target then
    target = findClosestEnemy(a, s)
    s.targetId = target and target.id or nil
  end

  if target then
    s.roamCooldown = 0   -- a target overrides any roam pause in progress

    -- AntiStall, ported: give up the chase if it's dragged the bee too far
    -- from its own spawn (regardless of target distance), or the target
    -- itself is now too far away, or it's been chasing too long without
    -- landing a hit -- outrunning it should actually work.
    if distPx(a, s.startX, s.startY) > ROAM_MAX_DIST_PX then
      s.targetId = nil
      s.homingDuration = 0
      s.lookoutCooldown = LOOKOUT_COOLDOWN_GIVEUP
      s.spin, s.spinN = true, 0
      return
    end

    local tdist = distPx(a, target.x, target.y)
    if tdist > HOMING_MAX_DIST_PX then
      s.targetId = nil
      s.homingDuration = 0
      s.lookoutCooldown = LOOKOUT_COOLDOWN_GIVEUP
      s.spin, s.spinN = true, 0
      return
    end

    s.homingDuration = (s.homingDuration or 0) + 1
    if s.homingDuration > HOMING_MAX_DURATION then
      s.targetId = nil
      s.homingDuration = 0
      s.lookoutCooldown = LOOKOUT_COOLDOWN_TIMEOUT
      s.spin, s.spinN = true, 0
      return
    end

    s.chaseCD = (s.chaseCD or 0) - 1
    if s.chaseCD <= 0 then
      steer(a, target.x, target.y, CHASE_SPEED, CHASE_STRENGTH)
      s.chaseCD = CHASE_STEER_EVERY
    end
    if tdist <= CONTACT_RADIUS_PX then
      s.dead = true
      detonate(a, s)
      return
    end
    if s.homingDuration % 12 == 0 then
      playBuzz(a)
    end

    -- Chasing: desiredAngle tracks velocity as before.
    local vxpx, vypx = a.vx / PX, a.vy / PX
    if vxpx ~= 0 or vypx ~= 0 then
      s.desiredAngle = math.deg(math.atan(vypx, math.abs(vxpx) + 0.001))
    end
  else
    s.homingDuration = 0

    if (s.roamCooldown or 0) > 0 then
      -- Just arrived somewhere: hover, angle relaxes flat instead of
      -- snapping (that's what s.desiredAngle/s.rot being separate buys us),
      -- and the velocity-based angle calc below is skipped entirely while
      -- this is active -- that's the "looks alive" bit.
      s.roamCooldown = s.roamCooldown - 1
      s.desiredAngle = 0
      a.vx = a.vx - math.floor(a.vx * 0.25)
      a.vy = a.vy - math.floor(a.vy * 0.25)
      if s.roamCooldown <= 0 then
        -- Cooldown just finished: line up the next point right now, rather
        -- than falling through to the arrival check below next tick, which
        -- would just see "still within ROAM_ARRIVE_PX of the old point" and
        -- re-arm the cooldown forever instead of ever moving again.
        pickRoamPoint(a, s)
      end
    elseif not s.arriveX then
      pickRoamPoint(a, s)
    elseif distPx(a, s.arriveX, s.arriveY) < ROAM_ARRIVE_PX then
      s.roamCooldown = wa.random(ROAM_COOLDOWN_MIN, ROAM_COOLDOWN_MAX)
    else
      s.roamCD = (s.roamCD or 0) - 1
      if s.roamCD <= 0 then
        local baseSpeed = s.roamSpeed or ROAM_SPEED
        local speed = baseSpeed
        -- Secondary distance check: start bleeding off speed on approach,
        -- well before ROAM_ARRIVE_PX, so the hand-off into the arrival
        -- hover-decay isn't a sudden full-speed-to-stop snap. Clamped at
        -- ROAM_SLOWDOWN_MIN_FRAC so the last stretch doesn't crawl.
        local dist = distPx(a, s.arriveX, s.arriveY)
        if dist < ROAM_SLOWDOWN_RADIUS_PX then
          local frac = dist / ROAM_SLOWDOWN_RADIUS_PX
          if frac < ROAM_SLOWDOWN_MIN_FRAC then
            frac = ROAM_SLOWDOWN_MIN_FRAC
          end
          speed = math.floor(baseSpeed * frac)
        end
        steer(a, s.arriveX, s.arriveY, speed, ROAM_STRENGTH)
        s.roamCD = ROAM_STEER_EVERY
      end
      local vxpx, vypx = a.vx / PX, a.vy / PX
      if vxpx ~= 0 or vypx ~= 0 then
        s.desiredAngle = math.deg(math.atan(vypx, math.abs(vxpx) + 0.001))
      end
    end
  end
  -- 
  -- Smooth s.rot toward s.desiredAngle every tick rather than snapping to
  -- it -- this is what makes the cooldown's flat desiredAngle actually
  -- visible as a slow relax instead of an instant pop back to level.
-- Smooth s.rot toward s.desiredAngle every tick
  local MAX_PITCH_DEG = 90 * 0.7 -- 63 degrees max pitch up/down (70% of 90°)
  s.desiredAngle = math.max(-MAX_PITCH_DEG, math.min(MAX_PITCH_DEG, s.desiredAngle or 0))

  if s.rot < s.desiredAngle then
    s.rot = math.min(s.rot + ROT_SMOOTH_DEG, s.desiredAngle)
  elseif s.rot > s.desiredAngle then
    s.rot = math.max(s.rot - ROT_SMOOTH_DEG, s.desiredAngle)
  end
  if a.facing < 0 then
    a:angle(-s.rot)
  else
    a:angle(s.rot)
  end
end

wa.weapons.replace({
  weapon    = "skunk",
  name      = "Keeper Bee",
  copy_from = "grenade",
  is_weapon = true,

  params  = { gpu_prefix = "sprites/bee_", sprite_columns = BEE_FRAME_COUNT },
  panel_icon = "sprites/beeico.png",
  sprites = { SPRITE },
   --sprite = "sprites/flight_muitb55w.png",
  -- worm_sprites draw truecolor (GPU atlas) by default; set
  -- params = { gpu_worm_sprites = false } to keep the 8-bit palette path.
  worm_sprites = {
    weaponlnk = "sprites/aim_p_muitb55w.gif",
    weaponlnku = "sprites/aim_u_muitb55w.gif",
    weaponlnkd = "sprites/aim_d_muitb55w.gif",
    wthrow = "sprites/draw_p_muitb55w.gif",
    wthrowu = "sprites/draw_u_muitb55w.gif",
    wthrowd = "sprites/draw_d_muitb55w.gif",
  }, 

  on_fire = function(fire)
    local worm = fire.worm
    local team = (worm and worm.team) or 1

    local sx, sy = checkSpawnPoint(fire.x, fire.y, fire.x, fire.y, 50 * PX)
    sx = sx or fire.x
    sy = sy or fire.y

    local body = wa.actors.spawn({
      sprite  = SPRITE,
      x       = sx,
      y       = sy,
      vx      = wa.random(-20, 20) * PX // 10,   -- RandomFloat(-2.0, 2.0), coarser
      vy      = wa.random(-60, -12) * PX // 10,  -- RandomFloat(-6.0, -1.2)
      origin  = "center",
      owner   = worm,
      kind    = "bee",
      persist = true,
      on      = brain,
    })

    state[body.id] = {
      team         = team,
      owner        = worm,
      hp           = MAX_HP,
      dead         = false,
      freeMe       = false,
      stopMe       = false,
      spin         = true,
      softSpin     = false,
      spinN        = 0,
      bonk         = 0,
      rot          = 0,
      supercharged = false,   -- scaffolded, never set true -- see NOT PORTED
      startX       = sx,
      startY       = sy,
      arriveX      = nil,
      arriveY      = nil,
      roamCooldown = 0,
      roamSpeed    = nil,
      desiredAngle = 0,
      targetId     = nil,
      sprnum       = 1,
      animTick     = 0,
      roamFailStreak = 0,
      clipFrames   = 0,
      homingDuration = 0,
      lookoutCooldown = 0,
    }
  end,
})
`,
      },
      {
        path: 'mod.toml',
        name: 'mod.toml',
        language: 'toml',
        content: `id = "example.bee"
name = "Keeper Bee"
version = "0.1.0"
author = "reddaz"
api_version = 1
entry = "bee.lua"

[weapons]
replace = ["skunk"]
copy_from = "grenade"
icon = "sprites/beeico.png"
`,
      },
      {
        path: 'README.md',
        name: 'README.md',
        language: 'markdown',
        content: `# Keeper Bee
Ported from the PX \`bee_script\` (\`CBee : CMine\`).

Thrown like a grenade; spawns a persistent actor that roams near its landing point, homes onto the nearest visible enemy worm once it finds one, and detonates on contact, on death, or after too many terrain bonks.

### Mechanics:
- **Spiral Terrain Probe (\`checkSpawnPoint\`)**: Expands in rings to verify non-solid landing space before spawning.
- **5-Line Terrain Clearance (\`isThereLandThere\`)**: Probes center line and 4 corner offsets before committing to a roam trajectory.
- **Anti-Stall System**: Abandons chase if target flees beyond 470px, if bee strays 420px from spawn, or if chase exceeds 160 frames.
- **Dynamic Flap Cycle**: 4-frame animation strip flaps faster under acceleration.
`,
      },
    ],
  },
  {
    id: 'gameplay.kill_the_king',
    name: 'Kill the King (KTK)',
    version: '0.7.1',
    author: 'Project X / WormForge',
    category: 'gameplay',
    installed: true,
    enabled: true,
    replacesSlot: 'none (rules)',
    description: 'Transpiled and hardened from Project X 3.6.31.0 CKtkControl. Strategic match format where territory King bounding boxes on the map are monitored. Features solid pixel destruction thresholds (70-75%), timed attack countdown (300s), HUD telemetry, and lockstep team elimination.',
    declaredMethods: ['init_king', 'check_king_damage', 'eliminate_team', 'format_time'],
    declaredVariables: ['CONFIG', 'PX', 'MS_PER_FRAME', 'kings', 'timerMs', 'attackersTeam', 'defendersTeam'],
    customClasses: ['CKtkControl', 'KTKMatch'],
    hooks: ['wa.on.worm_message', 'wa.on.hud', 'wa.land.solid', 'wa.worms.all'],
    tags: ['0.7.1', 'gameplay', 'rules', 'ktk', 'king', 'hud', 'px-port'],
    files: [
      {
        path: 'kill_the_king.lua',
        name: 'kill_the_king.lua',
        language: 'lua',
        content: `-- ============================================================================
-- WormForge WA 3.8.1 Port: KTK (Kill The King) Control Logic
-- Transpiled and hardened from Project X 3.6.31.0 CKtkControl
--
-- Security & Sandbox Compliance (sandbox.rs):
--  - INLINED CONFIG: No require("config") because require/dofile are nil in sandbox.
--  - STABLE FRAME GATE: Evaluates once per frame via worm.id <= lastWormId dispatch boundary.
--  - STRICT TEAM INDICES: 1-based team numbers (1: Red, 2: Blue, etc.) strictly compared.
--  - NO INSTANT LOSS: Safe solid pixel detection with fail-safe guard (disables if 0 pixels).
--  - SOUND CLAIMS: wa.sound.play safely called with worm handle (not numeric id) when claimed.
--  - WINNER TRACKING: Eliminates losing team via w:hurt(w.hp) in deterministic lockstep.
-- ============================================================================

-- IN-Game Replay breakst the mod, revives worms for some reason.

-- Inline configuration table (sandbox-compliant: do NOT use require/dofile)
local CONFIG = {
  -- King Count: 1 or 2
  kingsCount = 1,

  -- Time for attack in milliseconds (300,000 ms = 5 minutes)
  timeForAttackMs = 300000,

  -- "AttackOnly" (decreases only on attacker turns)
  -- "DefendAndCompensate" (defenders turn adds +5ms per tick back to timer)
  timerType = "AttackOnly",

  -- Timer HUD caption
  timerCaption = "Remaining attack time:",

  -- Teams (1-based indices in WA: 1=Red, 2=Blue, 3=Green, 4=Yellow, 5=Purple, 6=Cyan)
  attackersTeam = 1, -- Red Team (Attackers)
  defendersTeam = 2, -- Blue Team (Defenders)

  -- Percentage of King solid pixels that must be destroyed to trigger King loss
  destructionPercentage = 75,

  -- Optimization: sample king bounding box every N frames (5 frames = 100ms)
  checkIntervalFrames = 5,

  -- King 1 Configuration (Pixel coordinates on the map)
  king1 = {
    name = "Blue King",
    x1 = 106,
    y1 = 829,
    width = 10,
    height = 10,
    destructionPercentage = 70,
  },

  -- King 2 Configuration (Used when kingsCount >= 2)
  king2 = {
    name = "Red King",
    x1 = 1420,
    y1 = 300,
    width = 10,
    height = 10,
    destructionPercentage = 70,
  },
}

-- WA Fixed 16.16 shift (0x10000 = 1 pixel)
local PX = 0x10000
local MS_PER_FRAME = 20 -- 50 fps lockstep (1000ms / 50 = 20ms per frame)

-- State Variables (Pure functions of simulation frames)
local initialized = false
local matchOver = false
local winningTeam = nil
local winReason = ""

local timerMs = CONFIG.timeForAttackMs or 300000
local timerType = CONFIG.timerType or "AttackOnly"
local attackersTeam = CONFIG.attackersTeam or 1
local defendersTeam = CONFIG.defendersTeam or 2

local kings = {}
local kingsCount = CONFIG.kingsCount or 1

-- Dispatch ordering tracking for once-per-frame gate
local lastWormId = 999999
local frameCheckCounter = 0

-- ----------------------------------------------------------------------------
-- Helper: Initialize King solid pixel area on round start
-- ----------------------------------------------------------------------------
local function init_king(cfg, id)
  if not cfg then return nil end

  local totalSolid = 0
  local x1 = cfg.x1
  local y1 = cfg.y1
  local x2 = cfg.x1 + cfg.width
  local y2 = cfg.y1 + cfg.height

  -- Scan rectangle for initial solid terrain pixels
  for x = x1, x2 do
    for y = y1, y2 do
      if wa.land.solid(x * PX, y * PX) then
        totalSolid = totalSolid + 1
      end
    end
  end

  -- Safe Guard against empty bounding boxes (e.g. map mismatch or bad coordinates):
  -- In PX, DrawKing painted terrain. If WormForge runs on an arbitrary map with 0 solid pixels,
  -- DO NOT fallback to width*height (which would cause an instant loss on first sample).
  -- Instead, log warning and disable win check for this king.
  local active = true
  if totalSolid == 0 then
    wa.log(string.format("[KTK WARNING] King %d box (%d,%d) has 0 solid pixels! Win check disabled to prevent instant loss.", id, x1, y1))
    active = false
  end

  local thresholdPercent = cfg.destructionPercentage or CONFIG.destructionPercentage or 75
  local destructionThreshold = math.floor(totalSolid * (1.0 - (thresholdPercent / 100.0)))

  return {
    id = id,
    name = cfg.name or ("King " .. id),
    active = active,
    x1 = x1,
    y1 = y1,
    x2 = x2,
    y2 = y2,
    width = cfg.width,
    height = cfg.height,
    totalArea = totalSolid,
    currentArea = totalSolid,
    threshold = destructionThreshold,
    percentThreshold = thresholdPercent,
    destroyed = false,
    currentPercentDestroyed = 0,
  }
end

-- ----------------------------------------------------------------------------
-- Helper: Check remaining solid terrain pixels for an active King
-- ----------------------------------------------------------------------------
local function check_king_damage(king)
  if not king or not king.active or king.destroyed then
    return false
  end

  local count = 0
  for x = king.x1, king.x2 do
    for y = king.y1, king.y2 do
      if wa.land.solid(x * PX, y * PX) then
        count = count + 1
      end
    end
  end

  king.currentArea = count
  if king.totalArea > 0 then
    king.currentPercentDestroyed = math.floor(((king.totalArea - count) * 100) / king.totalArea)
  end

  if king.currentArea <= king.threshold then
    king.destroyed = true
    return true
  end

  return false
end

-- ----------------------------------------------------------------------------
-- WIN CONDITION: For-loop setting opposing team worms HP to 0
-- Red Team victory enforcement across all clients in deterministic lockstep
-- ----------------------------------------------------------------------------
local function eliminate_team(losingTeamIndex, winnerIndex, reason)
  if matchOver then return end
  matchOver = true
  winningTeam = winnerIndex
  winReason = reason

  wa.log(string.format("[KTK] Win Condition Triggered: %s. Eliminating Team %d (Team %d Wins)", reason, losingTeamIndex, winnerIndex))

  -- Iterate through all worms; set the losing team's HP to 0
  -- In WormForge, w:hurt(w.hp) issues standard MSG_HIT (0x4B), immediately
  -- eliminating the worm through WA's deterministic damage pipeline.
  local worms = wa.worms.all()
  for _, w in ipairs(worms) do
    if w.team == losingTeamIndex and w.hp > 0 then
      w:hurt(w.hp)
    end
  end
end

-- ----------------------------------------------------------------------------
-- Format milliseconds to MM:SS
-- ----------------------------------------------------------------------------
local function format_time(ms)
  if ms < 0 then ms = 0 end
  local totalSeconds = math.floor(ms / 1000)
  local minutes = math.floor(totalSeconds / 60)
  local seconds = totalSeconds % 60
  return string.format("%02d:%02d", minutes, seconds)
end

-- ----------------------------------------------------------------------------
-- Main Lockstep Simulation Hook (FRAME_FINISH)
-- ----------------------------------------------------------------------------
wa.on.worm_message(function(worm, msg)
  if msg ~= wa.msg.FRAME_FINISH then
    return
  end

  -- One-time match initialization
  if not initialized then
    initialized = true
    kings[1] = init_king(CONFIG.king1, 1)
    if kingsCount >= 2 and CONFIG.king2 then
      kings[2] = init_king(CONFIG.king2, 2)
    end
  end

  if matchOver then
    return
  end

  -- ONCE-PER-FRAME GATE:
  -- worm_message fires for EVERY worm each frame.
  -- Worm dispatch order is deterministic and monotonic. When current worm.id <= lastWormId,
  -- we have crossed into a new simulation frame.
  local isNewFrame = (worm.id <= lastWormId)
  lastWormId = worm.id

  -- Timer update only runs if this worm is the currently active turn worm
  if worm.turn then
    local curTeam = worm.team -- strictly 1-based team index

    if curTeam == attackersTeam then
      timerMs = timerMs - MS_PER_FRAME

      if timerMs <= 0 then
        timerMs = 0
        -- Attackers ran out of time -> Defenders (Red) Win!
        eliminate_team(attackersTeam, defendersTeam, "Attack Timer Expired")
        return
      end
    elseif timerType == "DefendAndCompensate" and curTeam == defendersTeam then
      timerMs = timerMs + 5
    end
  end

  -- Frame-boundary logic: King damage check
  if isNewFrame then
    frameCheckCounter = frameCheckCounter + 1
    if frameCheckCounter >= CONFIG.checkIntervalFrames then
      frameCheckCounter = 0

      for i = 1, kingsCount do
        local king = kings[i]
        if check_king_damage(king) then
          -- King destroyed -> Defenders lose, Attackers (Red) Win!
          eliminate_team(defendersTeam, attackersTeam, string.format("%s Destroyed", king.name))
          return
        end
      end
    end
  end
end)

-- ----------------------------------------------------------------------------
-- Presentation HUD Overlay (wa.on.hud)
-- ----------------------------------------------------------------------------
wa.on.hud(function()
  if not initialized then return end

  -- Draw Attack Timer
  local timerStr = string.format("%s %s", CONFIG.timerCaption or "Remaining attack time:", format_time(timerMs))
  wa.hud.line(timerStr, 14, 40)

  -- Draw King HP status
  for i = 1, kingsCount do
    local king = kings[i]
    if king then
      local statusStr
      if not king.active then
        statusStr = string.format("%s: [No solid terrain pixels found - Disabled]", king.name)
      elseif king.destroyed then
        statusStr = string.format("%s: DESTROYED (0%%)", king.name)
      else
        local healthPercent = math.max(0, 100 - king.currentPercentDestroyed)
        statusStr = string.format("%s HP: %d%%", king.name, healthPercent)
      end
      wa.hud.line(statusStr, 14, 80 + (i - 1) * 16)
    end
  end

  if matchOver and winningTeam then
    local teamName = (winningTeam == 1) and "RED TEAM" or ("TEAM " .. winningTeam)
    wa.hud.line(string.format("=== %s WINS! (%s) ===", teamName, winReason), 14, 120)
  end
end)
`,
      },
      {
        path: 'mod.toml',
        name: 'mod.toml',
        language: 'toml',
        content: `id = "gameplay.kill_the_king"
name = "Kill the King (KTK)"
version = "0.7.1"
author = "Project X / WormForge"
category = "gameplay"
api_version = 1
entry = "kill_the_king.lua"

[rules]
kings_count = 1
time_for_attack_ms = 300000
timer_type = "AttackOnly"
no_slot_claim = true
`,
      },
      {
        path: 'README.md',
        name: 'README.md',
        language: 'markdown',
        content: `# Kill the King (KTK) Control Logic
Transpiled and hardened from Project X 3.6.31.0 \`CKtkControl\`.

### Security & Sandbox Compliance:
- **Inlined Config**: No \`require("config")\` because \`require\`/\`dofile\` are nil in sandbox.
- **Stable Frame Gate**: Evaluates once per frame via \`worm.id <= lastWormId\` dispatch boundary.
- **Strict Team Indices**: 1-based team numbers (1: Red, 2: Blue, etc.) strictly compared.
- **No Instant Loss**: Safe solid pixel detection with fail-safe guard (disables if 0 pixels detected).
- **Presentation HUD**: \`wa.on.hud\` rendering attack countdown and King integrity status via \`wa.hud.line\`.
- **Lockstep Elimination**: Eliminates losing team via \`w:hurt(w.hp)\` in deterministic lockstep.
`,
      },
    ],
  },
  {
    id: 'gameplay.ex_turn_side',
    name: 'ExTurnSide',
    version: '0.7.1',
    author: 'WormForge Team',
    category: 'gameplay',
    installed: true,
    enabled: true,
    replacesSlot: 'none (rules)',
    description: 'Allows manual facing direction changes during rope swings and action states by listening to wa.world.keys() edge transitions on FRAME_FINISH.',
    declaredMethods: ['onWormMessage'],
    declaredVariables: ['prev_left', 'prev_right'],
    customClasses: ['ExTurnSide'],
    hooks: ['wa.on.worm_message', 'wa.world.keys'],
    tags: ['0.7.1', 'gameplay', 'movement', 'facing', 'rope'],
    files: [
      {
        path: 'ex_turn_side.lua',
        name: 'ex_turn_side.lua',
        language: 'lua',
        content: `
-- Allows manual facing direction changes during rope swings and action states.
local prev_left = false
local prev_right = false

wa.on.worm_message(function(worm, msg)
  if msg ~= wa.msg.FRAME_FINISH then return end
  if not worm.turn then return end

  local k = wa.world.keys()
  
  -- Left key pressed:
  if k.left and not prev_left then
    worm.facing = -1
  end
  
  -- Right key pressed: 
  if k.right and not prev_right then
    worm.facing = 1
  end
  
  prev_left = k.left
  prev_right = k.right
end)`,
      },
      {
        path: 'mod.toml',
        name: 'mod.toml',
        language: 'toml',
        content: `id = "gameplay.ex_turn_side"
name = "ExTurnSide"
version = "0.7.1"
author = "WormForge Team"
category = "gameplay"
api_version = 1
entry = "ex_turn_side.lua"

[rules]
facing_override = true
no_slot_claim = true
`,
      },
      {
        path: 'README.md',
        name: 'README.md',
        language: 'markdown',
        content: `# ExTurnSide
Allows manual facing direction changes during rope swings and action states.

Monitors \`wa.world.keys()\` on \`wa.msg.FRAME_FINISH\` during the active worm's turn:
- **Left key transition**: sets \`worm.facing = -1\`
- **Right key transition**: sets \`worm.facing = 1\`
`,
      },
    ],
  },
  {
    id: 'gameplay.highlander_full',
    name: 'Highlander (Full PX Scheme)',
    version: '0.7.1',
    author: 'Project X / WormForge',
    category: 'gameplay',
    exclusiveGroup: 'highlander',
    isExclusiveWarning: 'Highlander ships as a verb-based pack and a pure-Lua reference; enable only one.',
    installed: true,
    enabled: true,
    replacesSlot: 'none (rules / 55 pooled slots)',
    description: 'Complete port of Project X scheme_hl_0rang3 (Highlander 0rang3 1.1). Deals 1 weapon from each of 3 pools (Offensive 29, Second 19, Movement 7). Slay a worm to take its arsenal. Includes Helicopter flight physics, Sniper Rifle laser sight, run-time holds, Fire Jump, and virtual inventory.',
    declaredMethods: [
      'deal',
      'start_turn',
      'on_death',
      'follow_drill',
      'fire_jump',
      'laser_ray',
      'laser_length',
      'heli_frame',
      'heli_crash',
      'update_hold'
    ],
    declaredVariables: [
      'PX',
      'OFFENSIVE',
      'SECOND',
      'MOVEMENT',
      'POOLED',
      'PORTED',
      'PX_ART',
      'PX_HOLDS',
      'PX_POSTURE',
      'arsenal',
      'dealt',
      'helis'
    ],
    customClasses: ['HighlanderArsenal', 'HelicopterFlight', 'SniperLaser'],
    hooks: [
      'wa.weapons.replace',
      'wa.inventory.create',
      'wa.on.worm_message',
      'wa.on.turn_start',
      'wa.on.death',
      'wa.on.draw',
      'wa.on.missile_frame',
      'wa.on.contact',
      'wa.world.cavern'
    ],
    tags: ['0.7.1', 'gameplay', 'highlander', 'px-port', 'inventory', 'laser', 'helicopter'],
    files: [
      {
        path: 'highlander_full.lua',
        name: 'highlander_full.lua',
        language: 'lua',
        content: `-- Highlander, on Project X's weapon layout.
--
-- A port of Project X's \`scheme_hl_0rang3\` (Highlander 0rang3 1.1). Every
-- worm is dealt one weapon from each of three pools at the start of the match.
-- Only the worm whose turn it is may use its weapons, one shot of each per
-- turn. Kill a worm and you take everything it carried.
--
-- The scheme puts each of its weapons on one of WA's 71 stock slots: the
-- Baseball Bat on the girder's, the Cluster Bomb on the magic bullet's, and
-- so on. The pools below are PX's own lists, in PX's order, each weapon
-- written as the stock slot it takes. A weapon not ported yet leaves WA's
-- stock weapon on its slot, and that stands in for it.
--
-- The source (\`highlander.txt\`) does all of this with four calls:
-- SetWeaponEx(team, weapon, 1) to grant and SetWeaponEx(team, weapon, 0) to
-- take away. \`worm:ammo(name, { set = n })\` is the same absolute write. It has
-- to be absolute: a stock scheme gives some of these weapons infinite ammo,
-- and adding to infinite leaves it infinite.
--
-- Where this differs from the source, on purpose:
--
--   * No turn-end removal. PX removes a worm's weapons at M_TURNEND and again,
--     through CurW, at the next M_TURNBEGIN. The second alone is enough, so
--     this listens for one message instead of two.
--
--     START_TURN (0x34) reaches only the worm whose turn it is: WA's handler
--     marks the receiver turn-active and calls TeamArena::SetActiveWorm on it
--     unconditionally (OpenWA \`msg_start_turn\`), which would be nonsense sent
--     to every worm. So the worm it arrives on IS the active worm.
--
--   * Every pooled slot is zeroed for every team at each turn start, not
--     just the previous worm's. PX relied on its scheme having those slots at
--     zero. Here the scheme can say anything, so the pack enforces it itself.
--
--   * Wind Changer (x1) and Hot Air Balloon (x3) are not ported yet, so
--     nothing is granted in their place.
--
-- Lockstep: dealing, turn_start and death are all dispatched from WA's own
-- simulation messages, and every random choice is wa.random(). Two peers, or
-- a peer and a replay, deal the same hands and make the same grants. Nothing
-- here reads local input or the clock.

-- ---------------------------------------------------------------- weapons

-- PX's sprite builder, for the weapons below whose hold PX draws at run
-- time: the worm posture with no weapon in it, and its hands. The helper
-- further down draws the weapon and a hand over it.
local PX_POSTURE = {
  weaponlnk = "sprites/px_hold/aim", weaponlnku = "sprites/px_hold/aimu",
  weaponlnkd = "sprites/px_hold/aimd",
  wthrow = "sprites/px_hold/draw", wthrowu = "sprites/px_hold/drawu",
  wthrowd = "sprites/px_hold/drawd",
}
local PX_HANDS = {
  "sprites/px_hold/hand_rad_lower", "sprites/px_hold/hand_rad", "sprites/px_hold/hand_rad_upper",
}
-- Ported weapons. Each takes its scheme record, cut from the .pxs with
-- tools/px_scheme_weps.py: how it fires, and its PX name. Anything else in an
-- entry goes to wa.weapons.replace as it is.
--
-- WA's own weapons, as PX tuned them for this scheme. One moved off its own
-- stock slot borrows its own stock icon.
local PORTED = {
  { weapon = "dynamite" },
  { weapon = "blow_torch" },                                   -- BlowTorch
  { weapon = "flame_thrower" },
  { weapon = "girder", panel_icon = "baseball_bat" },          -- Baseball Bat
  { weapon = "girder_pack" },                                  -- 3 Girder Pack
  { weapon = "fast_walk" },
  { weapon = "crate_spy" },
  { weapon = "crate_shower" },
  { weapon = "magic_bullet", panel_icon = "cluster_bomb" },    -- Cluster Bomb
  { weapon = "invisibility", panel_icon = "teleport" },        -- Teleport
  { weapon = "damage_x2", panel_icon = "skunk" },              -- Skunk
  { weapon = "double_turn_time", panel_icon = "mole_bomb" },   -- Mole Bomb
}

-- PX weapons that need only PX's art: its icons, copied byte for byte so
-- replays share them, and its strips split into frame folders with
-- tools/px_split_strip.py. Where PX draws the worm's hold at run time with
-- its sprite builder (p_sprite_builder), so does the pack (PX_HOLDS below).
local PX_ART = {
  { -- Burning Sheep Launcher
    weapon = "sheep_launcher",
    panel_icon = "sprites/launchers/burning_sheep_launcher_ico.png",
  },
  { -- Cow Launcher
    weapon = "mad_cow",
    panel_icon = "sprites/launchers/cow_launcher_ico.png",
  },
  { -- Old Woman Launcher. Its record is PX's but for one field: +0x34,
    -- which picks a projectile's aim sheet in WA (0x51C060), is 3 (the
    -- bazooka hold, as the Cow Launcher's) where PX has 0. WA knows 1-12
    -- only and draws no worm at all for 0.
    weapon = "old_woman",
    panel_icon = "sprites/launchers/old_woman_launcher_ico.png",
  },
  { -- Pigeon Strike
    weapon = "mail_strike",
    panel_icon = "sprites/pigeon_strike/ico_pigeonst.png",
  },
  { -- Windy Cluster: the stock cluster bomb's body, PX's bits.
    weapon = "cluster_bomb",
    panel_icon = "sprites/windy_cluster/ico_windyc.png",
    cluster = { sprite = "sprites/windy_cluster/cluster" },
  },
  { -- Super Gravedigger, and the worm holding and taking it out.
    weapon = "banana_bomb",
    panel_icon = "sprites/super_gravedigger/sgrave_ico.png",
    sprite = "sprites/super_gravedigger/flight",
    cluster = { sprite = "sprites/super_gravedigger/cluster" },
    worm_sprites = {
      weaponlnk = "sprites/super_gravedigger/aim",
      weaponlnku = "sprites/super_gravedigger/aimu",
      weaponlnkd = "sprites/super_gravedigger/aimd",
      wthrow = "sprites/super_gravedigger/draw",
      wthrowu = "sprites/super_gravedigger/drawu",
      wthrowd = "sprites/super_gravedigger/drawd",
    },
  },
  -- The next three have trails PX draws by overriding stock sprites its
  -- records point at: the Salvation Army's wsv* frames, free here because
  -- the Ferret holds that slot. sprite_overrides does the same, for the
  -- whole match. The trail art is PX's sprite_curtis_<id> libraries'.
  { -- S.M.A.R.T Bomb: its bits home, and draw their own sprite doing so.
    weapon = "mortar",
    panel_icon = "sprites/smart_bomb/smart_ico.png",
    sprite = "sprites/smart_bomb/flight",
    cluster = {
      sprite = "sprites/smart_bomb/cluster",
      homing_sprite = "sprites/smart_bomb/cluster_homing",
    },
    sprite_overrides = { wsvbd = "sprites/smart_bomb/trail" },          -- 250
    worm_sprites = {
      weaponlnk = "sprites/smart_bomb/aim",
      weaponlnku = "sprites/smart_bomb/aimu",
      weaponlnkd = "sprites/smart_bomb/aimd",
      wthrow = "sprites/smart_bomb/draw",
      wthrowu = "sprites/smart_bomb/drawu",
      wthrowd = "sprites/smart_bomb/drawd",
    },
  },
  { -- Blaster Worm
    weapon = "homing_pigeon",
    panel_icon = "sprites/blaster_worm/bworm_ico.png",
    sprite = "sprites/blaster_worm/flight",
    cluster = { sprite = "sprites/blaster_worm/cluster" },
    sprite_overrides = { wsvbu = "sprites/blaster_worm/cluster_trail" }, -- 249
    worm_sprites = {
      weaponlnk = "sprites/blaster_worm/aim",
      weaponlnku = "sprites/blaster_worm/aimu",
      weaponlnkd = "sprites/blaster_worm/aimd",
      wthrow = "sprites/blaster_worm/draw",
      wthrowu = "sprites/blaster_worm/drawu",
      wthrowd = "sprites/blaster_worm/drawd",
    },
  },
  { -- Thumper Nade
    weapon = "battle_axe",
    panel_icon = "sprites/thumper_nade/thumpern_ico.png",
    sprite = "sprites/thumper_nade/flight",
    cluster = { sprite = "sprites/thumper_nade/cluster" },
    sprite_overrides = {
      wsvg = "sprites/thumper_nade/trail",                                -- 251
      wsvgu = "sprites/thumper_nade/cluster_trail",                       -- 252
    },
    worm_sprites = {
      weaponlnk = "sprites/thumper_nade/aim",
      weaponlnku = "sprites/thumper_nade/aimu",
      weaponlnkd = "sprites/thumper_nade/aimd",
      wthrow = "sprites/thumper_nade/draw",
      wthrowu = "sprites/thumper_nade/drawu",
      wthrowd = "sprites/thumper_nade/drawd",
    },
  },
  -- Strikes keep their bomb's art 0x14 further along than a projectile
  -- does; \`sprite\` and \`cluster.sprite\` follow it there.
  { -- Thumper Nade Strike: Thumper Nades from the sky, with the Thumper
    -- Nade's own trails (the overrides above).
    weapon = "carpet_bomb",
    panel_icon = "sprites/thumper_nade/thumpernst_ico.png",
    sprite = "sprites/thumper_nade/flight",
    cluster = { sprite = "sprites/thumper_nade/cluster" },
  },
  { -- Mortar Strike: stock mortar shells, PX's trails and bits.
    weapon = "air_strike",
    panel_icon = "sprites/mortar_strike/ico_mortarst.png",
    cluster = { sprite = "sprites/mortar_strike/cluster" },
    sprite_overrides = {
      wsvclnk = "sprites/mortar_strike/trail",                             -- 466
      wsvc = "sprites/mortar_strike/cluster_trail",                        -- 260
    },
  },
  { -- Gravler: a mole bomb whose records point its dive and dig frames at
    -- the Salvation Army's wsvr*/wsvb, which PX's script overrides.
    weapon = "mole_bomb",
    panel_icon = "sprites/gravler/gravler_ico.png",
    sprite_overrides = {
      wsvr = "sprites/gravler/gravlerdive",                                -- 245
      wsvru = "sprites/gravler/gravlerdiga",                               -- 246
      wsvrd = "sprites/gravler/gravlerdigb",                               -- 247
      wsvb = "sprites/gravler/gravlerdigc",                                -- 248
    },
    worm_sprites = {
      weaponlnk = "sprites/gravler/aim",
      weaponlnku = "sprites/gravler/aimu",
      weaponlnkd = "sprites/gravler/aimd",
      wthrow = "sprites/gravler/draw",
      wthrowu = "sprites/gravler/drawu",
      wthrowd = "sprites/gravler/drawd",
    },
  },
  { -- Gravler Strike: its record points at the same four frames, so the
    -- Gravler's overrides draw it.
    weapon = "mole_squadron",
    panel_icon = "sprites/gravler/gravlerst_ico.png",
  },
  { -- Ghost Sheep: the Aqua Sheep's own sprites, overridden.
    weapon = "aqua_sheep",
    panel_icon = "sprites/ghost_sheep/ghost_sheep_ico.png",
    sprite_overrides = {
      aquashp1 = "sprites/ghost_sheep/ghstshp1",                           -- 156
      aquashp2 = "sprites/ghost_sheep/ghstshp2",                           -- 157
    },
  },
  { -- Pogo Sheep. Its bits' trail is the Blaster Worm's (249, above).
    weapon = "sheep",
    panel_icon = "sprites/pogo_sheep/psheep_ico.png",
    sprite = "sprites/pogo_sheep/flight",
    cluster = { sprite = "sprites/pogo_sheep/cluster" },
  },
  { -- Banana Express: stock banana bombs from PX's banana plane. PX's
    -- record names its plane 704, an id PX adds past WA's sprites; \`plane\`
    -- gives the strike the sheet instead.
    weapon = "mb_bomb",
    panel_icon = "sprites/banana_express/banana_express_ico.png",
    plane = "sprites/banana_express/plane",
  },
  { -- Real Shotgun: PX's FireFinal fires the shotgun five times per shot,
    -- five pellets in one frame, each spread by WA's own hitscan cone.
    weapon = "shotgun",
    panel_icon = "sprites/real_shotgun/real_shotgun_ico.png",
    fire_repeat = 5,
  },
  { -- Hellish Hand-Grenade: the hellish_grenade example's art on the scheme's
    -- record, which leaves the flight sprite to the slot.
    weapon = "holy_grenade",
    panel_icon = "sprites/hellish/hhh_ico.png",
    sprite = "sprites/hellish/grenade",
    worm_sprites = {
      weaponlnk = "sprites/hellish/aim",
      weaponlnku = "sprites/hellish/aimu",
      weaponlnkd = "sprites/hellish/aimd",
      wthrow = "sprites/hellish/draw",
      wthrowu = "sprites/hellish/drawu",
      wthrowd = "sprites/hellish/drawd",
    },
  },
  { -- Remote Roller
    weapon = "skunk",
    panel_icon = "sprites/remote_roller/rroller_ico.png",
    sprite = "sprites/remote_roller/flight",
    worm_sprites = {
      weaponlnk = "sprites/remote_roller/aim",
      weaponlnku = "sprites/remote_roller/aimu",
      weaponlnkd = "sprites/remote_roller/aimd",
      wthrow = "sprites/remote_roller/draw",
      wthrowu = "sprites/remote_roller/drawu",
      wthrowd = "sprites/remote_roller/drawd",
    },
  },
  { -- Igniter: PX draws its bullet on the missile at run time; here it is the
    -- flight sprite.
    weapon = "homing_missile",
    panel_icon = "sprites/igniter/igniter_ico.png",
    sprite = "sprites/igniter/flight",
    worm_sprites = PX_POSTURE,
    sprites = { "sprites/px_hold/igniter", PX_HANDS[1], PX_HANDS[2], PX_HANDS[3] },
    params = { gpu_prefix = "sprites/px_hold/" },
  },
  { -- Sticky Bomb: PX's record leaves the bomb's sprite 0 and PX's script
    -- draws the bomb at run time. Here the bomb is the stock grenade sprite
    -- again -- a grenade-type slot picks the worm's throw sheet from it, and
    -- 0 has none -- which the override draws as PX's bomb. The bits too.
    weapon = "grenade",
    panel_icon = "sprites/sticky_bomb/sbico.png",
    sprite = "grenade",
    cluster = { sprite = "sprites/sticky_bomb/bomb" },
    -- Stuck, the bits draw with the frames at +0x178..+0x184, which the
    -- record points at the Salvation Army's 467; PX overrides that too.
    sprite_overrides = {
      grenade = "sprites/sticky_bomb/bomb",                                -- 50
      wsvclnku = "sprites/sticky_bomb/bomb",                               -- 467
    },
    worm_sprites = PX_POSTURE,
    sprites = { "sprites/px_hold/sticky_bomb", PX_HANDS[1], PX_HANDS[2], PX_HANDS[3] },
    params = { gpu_prefix = "sprites/px_hold/" },
  },
  { -- Fire Jump: a fire punch, then a jump and a glide (below).
    weapon = "fire_punch",
    panel_icon = "sprites/fire_jump/fire_jump_ico.png",
  },
  { -- Super Drill: WA's drill, cutting a second hole each frame (below).
    weapon = "pneumatic_drill",
    panel_icon = "sprites/super_drill/ico_superdrill.png",
  },
  { -- Shadow-Bolt: the record leaves the bolt's sprite 0, and PX draws the
    -- bolt at run time, animated and turned to its flight (PX_WEAP_SPRITES
    -- below), with its trail on stock 453 (sprite_curtis_453).
    weapon = "longbow",
    panel_icon = "sprites/shadow_bolt/ico_shadowb.png",
    worm_sprites = PX_POSTURE,
    sprite_overrides = { [453] = "sprites/shadow_bolt/trail" },
    sprites = { "sprites/px_hold/shadow_bolt", "sprites/shadow_bolt/bolt" },
    params = { gpu_prefix = "sprites/" },
  },
  { -- Helicopter: WA's jet pack, flown by PX's script (below).
    weapon = "jet_pack",
    panel_icon = "sprites/helicopter/heli_ico.png",
    sprites = { "sprites/helicopter/flying", "sprites/helicopter/jumpin" },
    params = { gpu_prefix = "sprites/helicopter/" },
  },
  { -- Sniper Rifle: the hold drawn at run time, PX's laser sight while aiming
    -- and its own shot (below).
    weapon = "handgun",
    panel_icon = "sprites/sniper_rifle/srico.png",
    worm_sprites = PX_POSTURE,
    sprites = { "sprites/px_hold/sniper_rifle", "sprites/sniper_rifle/laser" },
    params = { gpu_prefix = "sprites/" },
  },
  { -- Burst Rifle: the worm aiming it, taking it out and firing it.
    weapon = "minigun",
    panel_icon = "sprites/burst_rifle/ico_burstr.png",
    worm_sprites = {
      weaponlnk = "sprites/burst_rifle/aim",
      weaponlnku = "sprites/burst_rifle/aimu",
      weaponlnkd = "sprites/burst_rifle/aimd",
      wthrow = "sprites/burst_rifle/draw",
      wthrowu = "sprites/burst_rifle/drawu",
      wthrowd = "sprites/burst_rifle/drawd",
      weaponfire = "sprites/burst_rifle/fire",
      weaponfireu = "sprites/burst_rifle/fireu",
      weaponfired = "sprites/burst_rifle/fired",
    },
  },
}

for _, list in ipairs({ PORTED, PX_ART }) do
  for _, w in ipairs(list) do
    local spec = { wep = "weps/" .. w.weapon .. ".wep" }
    for key, value in pairs(w) do
      spec[key] = value
    end
    wa.weapons.replace(spec)
  end
end

-- The two with a script of their own. Both run from worm messages, which WA
-- sends in lockstep on every peer and in replays.

-- Super Drill (PX weapon_super_drill): WA keeps drilling as it always does,
-- and a hidden actor cuts a second hole at the worm each frame until WA's
-- drill stops. The same as the super_drill example.
local drills = {}

local function follow_drill(worm, id)
  local started, waiting = false, 0
  return function(a)
    if worm.drilling then
      started = true
      wa.land.cut({ x = worm.x, y = worm.y, shape = "drill" })
      return
    end
    -- WA enters its drilling state a few frames after the shot.
    if not started and waiting < 4 then
      waiting = waiting + 1
      return
    end
    drills[id] = nil
    a:despawn()
  end
end

-- Fire Jump (PX Fire_Jump_script): WA's fire punch, whose speed then follows
-- PX's timeline, counted in frames from the punch -- up at once, forward
-- after half a second, a little higher at one second, and from 80 frames a
-- fall cut back to 4 pixels a frame whenever it passes 5, until 210. PX
-- speeds are pixels per frame; WA's are 16.16. See
-- docs/px-reverse-engineering.md.
--
-- PX counts from FireFinal, which WA calls only once the punch's wind-up has
-- played, not when fire is pressed. FireFinal starts the punch at -6 pixels
-- a frame; the worm stood still until then. So the count starts on the
-- first frame after fire is pressed that the worm is rising.
--
-- WA keeps the worm in its punch state until it has stopped, so the punch
-- itself cuts the way up and burns worms on it, all jump long: PX adds no cut.
local PX = 0x10000
local jumps = {}   -- worm id -> frames since the punch
local winding = {} -- worm id -> frames since fire was pressed
-- A wind-up never takes this long; give up rather than fire late.
local WIND_UP_MAX = 100

local function fire_jump(worm, t)
  if t == 1 then
    worm.vy = -9 * PX
  elseif t == 30 then
    worm.vx = worm.facing * 4 * PX
  elseif t == 60 then
    worm.vy = worm.vy - PX
  end
  if t > 80 and t < 210 and worm.vy > 5 * PX then
    worm.vy = 4 * PX
  end
end

wa.on.worm_message(function(worm, msg)
  if msg == wa.msg.FIRE_WEAPON then
    if worm.weapon == "pneumatic_drill" and not drills[worm.id]
        and worm:ammo("pneumatic_drill") ~= 0 then
      local id = worm.id
      drills[id] = wa.actors.spawn({
        sprite = false, x = worm.x, y = worm.y,
        gravity = false, collide = false, owner = worm,
        on = follow_drill(worm, id),
      })
    elseif worm.weapon == "fire_punch" and worm:ammo("fire_punch") ~= 0 then
      winding[worm.id] = 0
    elseif worm.weapon == "handgun" and worm:ammo("handgun") ~= 0 then
      -- The Sniper Rifle's own shot, over WA's (PX's snipfiring).
      wa.sound.play(worm, "sounds/sniper_firing.wav")
    end
    -- Neither eats the shot: WA's drill and fire punch still run.
    return
  end
  if msg == wa.msg.FRAME_FINISH and winding[worm.id] then
    if worm.vy < 0 then
      winding[worm.id], jumps[worm.id] = nil, 0
    else
      local w = winding[worm.id] + 1
      winding[worm.id] = w < WIND_UP_MAX and w or nil
    end
  end
  if msg == wa.msg.FRAME_FINISH and jumps[worm.id] then
    local t = jumps[worm.id] + 1
    fire_jump(worm, t)
    jumps[worm.id] = t < 211 and t or nil
  end
end)

-- ------------------------------------------ PX's sprite builder, at run time
--
-- PX draws many weapons' holds at run time (p_sprite_builder, WormSprite).
-- Over a worm posture with no weapon in it -- def_shot_aim_*, the sheets
-- below -- it draws the weapon and a hand, each placed and turned from the
-- aim angle by the weapon's CWormAnimParams, and grows the weapon in over the
-- first 20 frames of aiming. This does the same with two actors per aiming
-- worm, from worm messages, so in lockstep.
--
-- It reads worm.aim (the aim WA draws, 0 straight down .. 1 straight up:
-- PX's FireAngle) and worm.aiming (WA draws the worm with its weapon out:
-- PX's WS_AIMING or WS_SETPOWER). On an engine without them it does
-- nothing.

-- In front of worms and terrain, as the sentry's gun.
local HOLD_DEPTH = 0x10000

-- WormSprite's grow-in, counter 0..20: to 2.7 * c/20 up to 9, then 0.025
-- smaller a frame, then 0.9, 0.95, and full size from 20.
local PICK = {}
do
  local s = 0
  for c = 0, 20 do
    if c >= 20 then s = 1
    elseif c > 17 then s = c / 20
    elseif c > 9 then s = s - 0.025
    else s = 2.7 * c / 20 end
    PICK[c] = s
  end
end

-- Slot -> the weapon's CWormAnimParams, as its PX script states them.
local PX_HOLDS = {
  grenade = { -- Sticky Bomb (sb_script)
    sheet = "sprites/px_hold/sticky_bomb", hand_type = 1, hand_radius = 24,
    hand_rotation = 1.0, hand_radial_rotation = 1.05, hand_scale = 0.8,
    weap_rotation = 0.5, weap_radial_rotation = 0.9, weap_radius = 10,
  },
  homing_missile = { -- Igniter (igniter_anim)
    sheet = "sprites/px_hold/igniter", hand_type = 2, hand_radius = -6.0,
    hand_rotation = 1.0, hand_radial_rotation = 0.9, hand_scale = 0.8,
    weap_rotation = 1.0, weap_radial_rotation = 0.0, weap_radius = 0.0,
  },
  handgun = { -- Sniper Rifle (sniper_rifle_script): its hand at scale 0
    sheet = "sprites/px_hold/sniper_rifle", draw_hand = false, hand_radius = -6.0,
    hand_rotation = 1.0, hand_radial_rotation = 0.9,
    weap_rotation = 1.0, weap_radial_rotation = 0.0, weap_radius = 0.1,
  },
  longbow = { -- Shadow-Bolt (shadow_bolt_script): no hand, the bolt animated
    sheet = "sprites/px_hold/shadow_bolt", draw_hand = false, hand_radius = 0.0,
    hand_rotation = 0.0, hand_radial_rotation = 0.0,
    weap_rotation = 1.0, weap_radial_rotation = 0.0, weap_radius = 3.5,
    animate = true, anim_speed = 1.30, frames = 6,
  },
}

-- WormSprite::CalculateFrame and WeapSprite::CalculateFrame: a phase from 0
-- to 1 through the sheet, anim_speed * 0.03 a frame, back to 0 past 0.99.
local function next_phase(phase, anim_speed)
  if phase > 0.99 then
    return 0
  end
  return phase + anim_speed * 30 / 1000
end

local function frame_of(phase, frames)
  return math.min(math.floor(phase * frames), frames - 1)
end

local held = {} -- worm id -> { slot, weapon, hand, counter, phase, aim }

local function drop_hold(id)
  local h = held[id]
  if h then
    h.weapon:despawn()
    if h.hand then
      h.hand:despawn()
    end
    held[id] = nil
  end
end

-- One sprite of the hold: centred at (dx, dy) pixels from the worm, turned
-- by \`angle\` radians, as PX computes them for a worm facing right; facing
-- left mirrors all three, as PX's left-facing formulas do.
local function place(a, worm, dx, dy, angle, scale)
  local f = worm.facing
  -- Positions are 16.16 integers.
  a.x = worm.x + math.floor(f * dx * 0x10000 + 0.5)
  a.y = worm.y + math.floor(dy * 0x10000 + 0.5)
  a.vx, a.vy = 0, 0
  a.facing = f
  a:gfx({ angle = math.deg(angle * f) % 360, scale = scale, depth = HOLD_DEPTH })
end

-- worm.aim, or nil on an engine without it: a worm has no such field there,
-- and reading one is an error rather than nil.
local function aim_of(worm)
  local ok, aim = pcall(function() return worm.aim end)
  return ok and aim or nil
end

-- WormSprite::CalculateAngle.
local function update_hold(worm)
  local p = PX_HOLDS[worm.weapon]
  local aim = p and aim_of(worm)
  if not aim or not worm.aiming then
    drop_hold(worm.id)
    return
  end
  local h = held[worm.id]
  if h and h.slot ~= worm.weapon then
    drop_hold(worm.id)
    h = nil
  end
  if not h then
    local function actor(sheet)
      return wa.actors.spawn({
        sprite = sheet, x = worm.x, y = worm.y, gravity = false,
        collide = false, owner = worm, on = function() end,
      })
    end
    h = { slot = worm.weapon, counter = 0, phase = 0, weapon = actor(p.sheet) }
    -- A weapon PX draws with no hand: draw_hand = false.
    if p.draw_hand ~= false then
      h.hand = actor(PX_HANDS[p.hand_type])
    end
    held[worm.id] = h
  end
  -- Kept for anything drawn with the hold (the Sniper Rifle's laser), so it
  -- turns with the weapon: worm.aim is WA's smoothed crosshair (+0x270),
  -- which WA also rewrites at render time, between sim frames.
  h.aim = aim
  local pi = math.pi
  local rot = (1 - aim) * pi
  local rot_w = rot + pi * p.weap_radial_rotation
  local rot_h = rot - pi * p.hand_radial_rotation
  local grow = PICK[h.counter]
  place(h.weapon, worm, math.sin(rot_w) * p.weap_radius, -math.cos(rot_w) * p.weap_radius,
    pi - pi * aim - pi * (1 - p.weap_rotation), grow)
  if p.animate then
    h.phase = next_phase(h.phase, p.anim_speed)
    h.weapon:frame(frame_of(h.phase, p.frames))
  end
  if h.hand then
    place(h.hand, worm, math.sin(rot_h) * p.hand_radius, -math.cos(rot_h) * p.hand_radius,
      rot + pi * p.hand_rotation, grow * p.hand_scale)
  end
  h.counter = math.min(h.counter + 1, 20)
end

wa.on.worm_message(function(worm, msg)
  if msg == wa.msg.FRAME_FINISH then
    update_hold(worm)
  end
end)

-- ------------------------------------------ the Sniper Rifle's laser sight
--
-- PX's LaserSight (weapon_gun_sniper_rifle_sb, on utility_laser_pointer's
-- laserray): while the current worm aims the rifle, a red ray from 12 pixels
-- out along the aim to the first thing in its way, drawn every rendered
-- frame as 100-pixel quads of laser.png, added to the scene, narrowing along
-- the ray, with a faint 7-pixel tip. It is drawing only: wa.on.draw, never
-- the simulation.

local LASER_LEN = 15000
local LASER_WIDTH = 2
local LASER_STEP = 5 -- PX's Trace tests every 5 pixels
-- PX starts the ray on the worm's centre line, but the rifle art's barrel
-- runs 2 pixels to its left (columns 26-29 of 60), so the ray ran that far
-- under the barrel. It starts on the barrel instead.
local LASER_BARREL = 2
local function argb(a, r, g, b)
  return ((a * 256 + r) * 256 + g) * 256 + b
end
local LASER_RED, LASER_START, LASER_TIP =
  argb(255, 255, 48, 48), argb(192, 255, 96, 96), argb(16, 255, 48, 48)
-- PX's Trace stops at anything its 2x2 mask touches. Terrain is traced
-- exactly; objects by these radii in pixels, an estimate of their masks.
local STOPPERS = { { wa.worms, 6 }, { wa.mines, 4 }, { wa.crates, 10 }, { wa.oil, 9 } }

local function laser_length(x, y, dx, dy, shooter)
  local P = 0x10000
  local len = LASER_LEN
  local hit = wa.land.trace(math.floor(x), math.floor(y),
    math.floor(x + dx * LASER_LEN * P), math.floor(y + dy * LASER_LEN * P))
  if hit then
    len = math.sqrt(((hit.x - x) / P) ^ 2 + ((hit.y - y) / P) ^ 2)
  end
  for _, s in ipairs(STOPPERS) do
    local list, r = s[1], s[2]
    if list and list.all then
      for _, o in ipairs(list.all()) do
        if o.id ~= shooter then
          local ox, oy = (o.x - x) / P, (o.y - y) / P
          local t = ox * dx + oy * dy
          if t > 0 and t < len and math.abs(ox * dy - oy * dx) < r then
            len = t
          end
        end
      end
    end
  end
  return math.floor(len / LASER_STEP) * LASER_STEP
end

-- laserray's MakeLaserRayF, point for point.
local function laser_ray(x, y, ang, len)
  local P = 0x10000
  local rdx, rdy = math.sin(ang - 1.57), -math.cos(ang - 1.57)
  local dx, dy = math.sin(ang), -math.cos(ang)
  local tx, ty = x, y
  local nparts = math.floor(len / 100)
  local w = (wa.draw.random() / 4 + 0.85) * LASER_WIDTH / 2
  local wdx, wdy = w * rdx * P, w * rdy * P
  local wscale = 1
  local lastl = len - nparts * 100
  local colors
  for i = 0, nparts do
    local l = i == nparts and lastl or 100
    if l <= 0 then break end
    local p0, p3 = { tx + wdx, ty + wdy }, { tx - wdx, ty - wdy }
    w = wscale * (wa.draw.random() / 3 + 0.82) * LASER_WIDTH
    wdx, wdy = w * rdx * P, w * rdy * P
    wscale = wscale - 0.75 / (nparts + 1)
    local ex, ey = tx + dx * l * P, ty + dy * l * P
    colors = { LASER_RED, LASER_RED, LASER_RED, LASER_RED }
    if i == 0 then
      colors[1], colors[4] = LASER_START, LASER_START
    end
    wa.draw.quad({
      points = { p0, { ex + wdx, ey + wdy }, { ex - wdx, ey - wdy }, p3 },
      colors = colors, sprite = "sprites/sniper_rifle/laser", blend = "add",
    })
    tx, ty = ex, ey
  end
  local ex, ey = tx + dx * 7 * P, ty + dy * 7 * P
  wa.draw.quad({
    points = { { tx + wdx, ty + wdy }, { ex + wdx, ey + wdy }, { ex - wdx, ey - wdy }, { tx - wdx, ty - wdy } },
    colors = { LASER_RED, LASER_TIP, LASER_TIP, LASER_RED },
    sprite = "sprites/sniper_rifle/laser", blend = "add",
  })
end

if wa.on.draw then
  wa.on.draw(function()
    for _, worm in ipairs(wa.worms.all()) do
      -- The aim the rifle was drawn with, so the ray leaves along it; there
      -- is a hold only while the worm aims the rifle.
      local h = worm.turn and held[worm.id]
      local aim = h and h.slot == "handgun" and h.aim
      if aim then
        local ang = (1 - aim) * 3.14159
        if worm.facing < 0 then
          ang = 6.28318 - ang
        end
        local P = 0x10000
        -- The art's left, turned with the aim and mirrored with the worm.
        local side = LASER_BARREL * worm.facing * P
        local x = worm.x + math.sin(ang) * 12 * P - math.cos(ang) * side
        local y = worm.y - math.cos(ang) * 12 * P - math.sin(ang) * side
        laser_ray(x, y, ang, laser_length(x, y, math.sin(ang), -math.cos(ang), worm.id))
      end
    end
  end)
end

-- ------------------------------------ PX's missile sprites, at run time
--
-- For some weapons PX draws the missile itself (p_sprite_builder,
-- WeapSprite) and leaves WA's sprite 0: a sprite that follows the missile,
-- turned to its flight, mirrored when it flies left, and, if \`animate\`,
-- stepped through its sheet as a hold is. Here it is a GPU actor per
-- missile, placed from wa.on.missile_frame after WA has moved the missile.
-- It reads m.weapon (the missile's slot); on an engine without it nothing
-- matches and nothing is drawn.

-- Slot -> the weapon's WeapSpriteParams, as its PX script states them.
local PX_WEAP_SPRITES = {
  longbow = { -- Shadow-Bolt
    sheet = "sprites/shadow_bolt/bolt", animate = true, anim_speed = 1.30, frames = 6,
  },
}

local flying = {} -- missile id -> { actor, phase, seen }

-- The actor goes when its missile stops reporting: WA has freed it.
local function follow_missile(id)
  return function(a)
    local f = flying[id]
    if f and f.seen then
      f.seen = false
      return
    end
    if f and f.actor == a then
      flying[id] = nil
    end
    a:despawn()
  end
end

wa.on.missile_frame(function(m)
  local p = m.phase == "post" and PX_WEAP_SPRITES[m.weapon]
  if not p then
    return
  end
  local f = flying[m.id]
  if not f then
    f = { phase = 0 }
    f.actor = wa.actors.spawn({
      sprite = p.sheet, x = m.x, y = m.y, gravity = false, collide = false,
      on = follow_missile(m.id),
    })
    flying[m.id] = f
  end
  f.seen = true
  local a = f.actor
  a.x, a.y, a.vx, a.vy = m.x, m.y, 0, 0
  a.facing = m.vx < 0 and -1 or 1
  if p.animate then
    f.phase = next_phase(f.phase, p.anim_speed)
    a:frame(frame_of(f.phase, p.frames))
  end
  -- WeapSprite::CalculateAngle, rotation 0.
  local rot = -math.atan(m.vx, m.vy) - math.pi
  a:gfx({ angle = math.deg(rot) % 360, depth = HOLD_DEPTH })
end)

-- -------------------------------------------------------------- Helicopter
--
-- PX's helicopter_user_script, on WA's jet pack. While the jet pack runs,
-- the script flies the worm itself from the worm's own move keys, which it
-- then consumes so WA's jet pack neither thrusts nor burns fuel: speed that
-- builds while a key is held and dies away when it is not, fuel that burns
-- with it (not during retreat), and a crash -- an explosion sized by the fuel
-- left and the speed -- when the fuel runs out, the worm reaches water, the
-- turn ends, or it hits something other than a mine faster than a pixel a
-- frame. The worm's body is hidden behind the helicopter, and behind PX's
-- climb-in animation while WA winds the jet pack up; its labels, the fuel
-- counter among them, stay, as with PX's RenderWorm override.
--
-- PX's speeds and factors are fixed point: 1.0 is 0x10000 here, and its
-- arithmetic truncates.

local HELI_FUEL = 100            -- FuelAmount
local HELI_REALISTIC = true      -- gravity and wind act on it, at 0.2
local HELI_EXPLODE_ON_TURN_END = true
local HELI_DEPTH = 0x10000       -- in front of worms and terrain
local FX = 0x10000

local helis = {} -- worm id -> { flying, launch, jumpin, jump_phase, frame, ticks, body, climb }

local function trunc(v)
  return v >= 0 and math.floor(v) or math.ceil(v)
end

local function heli_of(worm)
  local h = helis[worm.id]
  if not h then
    h = { flying = false, launch = false, jumpin = false, jump_phase = 0, frame = 0, ticks = 0 }
    helis[worm.id] = h
  end
  return h
end

local function heli_actor(worm, sheet)
  return wa.actors.spawn({
    sprite = sheet, x = worm.x, y = worm.y, gravity = false,
    collide = false, owner = worm, on = function() end,
  })
end

local function heli_drop_art(h, worm)
  if h.body then h.body:despawn(); h.body = nil end
  if h.climb then h.climb:despawn(); h.climb = nil end
  worm.body_visible = true
end

local HELI_OOPS = {
  [2] = "sounds/helicopter/oops1.wav", [4] = "sounds/helicopter/oops2.wav",
  [6] = "sounds/helicopter/huh.wav", [8] = "sounds/helicopter/poop.wav",
  [10] = "sounds/helicopter/idiot.wav",
}

-- DisableHeli: blow up, sized by the fuel left and the speed, and land.
local function heli_crash(worm, h, sx, sy, why)
  if not h.flying then
    return
  end
  wa.log(string.format("heli crash worm=%d why=%s vx=%.2f vy=%.2f fuel=%.2f", worm.id, why or "?",
    sx / FX, sy / FX, worm.fuel / FX)) -- DIAGNOSTIC (temporary)
  local speed = (math.abs(sy) + math.abs(sx)) / 2 / FX
  local size = trunc((worm.fuel / FX - 75) / 10 * speed)
  if size < 10 then size = 10 end
  -- The worm's own explosion: a spawn needs an owner, and outside a brain
  -- (from wa.on.contact) there is none to inherit.
  wa.actors.spawn({
    sprite = false, x = worm.x, y = worm.y, gravity = false, collide = false,
    owner = worm, explode = { damage = size * 2, id = size, now = true },
  })
  worm.gravity = FX
  worm.wind = 0
  local oops = HELI_OOPS[wa.random(1, 10)]
  if oops then wa.sound.play(worm, oops) end
  h.flying = false
  heli_drop_art(h, worm)
end

-- One of PX's key responses, towards \`dir\` (-1 up or left, 1 down or
-- right): a kick that fades as the speed that way reaches 10 pixels a frame.
-- PX: if (SpY > -1) SpY -= 0.2; if (SpY > -4) SpY -= 0.4; ... for up.
local function push(v, dir)
  local s = -dir * v
  if s > -1 * FX then s = s - 0.2 * FX end
  if s > -4 * FX then s = s - 0.4 * FX end
  if s > -8 * FX then s = s - 0.15 * FX end
  if s > -10 * FX then s = s - 0.05 * FX end
  return -dir * s
end

local function heli_frame(worm)
  local h = helis[worm.id]
  local state = worm.state
  -- WS_FIRED: WA winding up the Helicopter; PX shows its climb-in. This is
  -- also where it is armed: once it fires, WA may already have cleared the
  -- worm's selection (its last shot of the Helicopter), and PX decides at
  -- FireFinal, from the weapon actually fired.
  if worm.weapon == "jet_pack" and state == "prefiring" and not (h and h.flying) then
    h = heli_of(worm)
    h.jumpin, h.armed = true, true
    h.jump_phase = h.jump_phase + 0.047
  end
  -- FireFinal: the jet pack it wound up has started.
  if h and h.armed and state == "jetpacking" and not h.flying then
    worm.gravity = HELI_REALISTIC and trunc(0.2 * FX) or 0
    h.flying, h.launch, h.ticks, h.armed = true, true, 0, false
  elseif h and h.armed and not worm.turn then
    h.armed = false -- the turn ended before it fired
  end
  if not h then
    return
  end
  if h.flying then
    local vx, vy = worm.vx, worm.vy
    -- Rotor and radio, while it moves.
    if vx ~= 0 or vy ~= 0 then
      if h.ticks % 47 == 0 then wa.sound.play(worm, "sounds/helicopter/helicopterloop.wav") end
      local radio = wa.random(1, 200)
      if radio % 20 == 0 and radio <= 80 then
        wa.sound.play(worm, "sounds/helicopter/" .. (radio // 20) .. ".wav")
      end
    end
    h.ticks = h.ticks + 1
    if worm.y >= wa.world.water() then
      heli_crash(worm, h, vx, vy, "water")
      return
    end
    if h.launch then
      worm.fuel = HELI_FUEL * FX
      h.jump_phase, h.jumpin, h.launch = 0, false, false
      if HELI_REALISTIC then worm.wind = trunc(0.2 * FX) end
    end
    local k = worm.keys
    local up, down, left, right = k.up, k.down, k.left, k.right
    if not up and not down then vy = vy / 1.105 end
    if not left and not right then vx = vx / 1.105 end
    if up and down then vy = vy / 1.095 end
    if left and right then vx = vx / 1.095 end
    -- Diagonals: PX's lines damp each pair twice.
    for _, d in ipairs({ { up, right }, { up, left }, { down, right }, { down, left } }) do
      if d[1] and d[2] then
        vx, vy = vx * 0.99 * 0.99, vy * 0.99 * 0.99
      end
    end
    h.frame = (h.frame + 1) % 3
    local fuel = worm.fuel
    local burn = wa.world.retreat() == 0
    if burn then fuel = fuel - 0.020 * FX end
    local shift = wa.world.keys().sprint
    if up then
      if burn then fuel = fuel - 0.2 * FX end
      vy = push(vy, -1)
    end
    if down then
      if burn then fuel = fuel - 0.020 * FX end
      vy = push(vy, 1)
    end
    if left then
      if burn then fuel = fuel - 0.1 * FX end
      if not shift then worm.facing = -1 end
      vx = push(vx, -1)
    end
    if right then
      if burn then fuel = fuel - 0.1 * FX end
      if not shift then worm.facing = 1 end
      vx = push(vx, 1)
    end
    worm:clear_keys()
    worm.vx, worm.vy, worm.fuel = trunc(vx), trunc(vy), trunc(fuel)
    if worm.state ~= "jetpacking" then
      if worm.vy == 0 and state ~= "prefiring" and state ~= "teleporting" then
        worm:set_state("sliding")
      end
      worm.gravity, worm.wind = FX, 0
      h.flying = false
      heli_drop_art(h, worm)
      return
    elseif worm.fuel <= 0.1 * FX then
      heli_crash(worm, h, worm.vx, worm.vy, "fuel")
      return
    end
    if HELI_EXPLODE_ON_TURN_END and not worm.turn then
      heli_crash(worm, h, worm.vx, worm.vy, "turn end")
      return
    end
  end
  -- What PX draws in the worm's place.
  local f = worm.facing
  if h.flying then
    if h.climb then h.climb:despawn(); h.climb = nil end
    h.body = h.body or heli_actor(worm, "sprites/helicopter/flying")
    local a = h.body
    a.x, a.y, a.vx, a.vy, a.facing = worm.x, worm.y, 0, 0, f
    a:frame(h.frame)
    a:gfx({ angle = math.deg(math.sin(worm.vx / FX / 24)) % 360, depth = HELI_DEPTH })
    worm.body_visible = false
  elseif h.jumpin and state == "prefiring" then
    h.climb = h.climb or heli_actor(worm, "sprites/helicopter/jumpin")
    local a = h.climb
    a.x = worm.x + trunc((f > 0 and -11.5 or 12.5) * FX)
    a.y, a.vx, a.vy, a.facing = worm.y + FX, 0, 0, f
    a:frame(math.min(math.floor(h.jump_phase * 23), 22))
    a:gfx({ depth = HELI_DEPTH })
    worm.body_visible = false
  elseif h.body or h.climb then
    h.jumpin, h.jump_phase = false, 0
    heli_drop_art(h, worm)
  end
end

wa.on.worm_message(function(worm, msg)
  if msg == wa.msg.FRAME_FINISH then
    heli_frame(worm)
  end
end)

-- Collide: hitting anything but a mine faster than a pixel a frame crashes
-- it, the ground included -- a slow landing is PX's smooth landing -- judged
-- on the speed before WA exchanged velocities.
-- DIAGNOSTIC (temporary): every contact while flying is logged.
if wa.on.contact then
  wa.on.contact(function(worm, other, c)
    local h = helis[worm.id]
    if h and h.flying then
      wa.log(string.format("heli contact worm=%d kind=%s vx=%.2f vy=%.2f flags=%d",
        worm.id, tostring(other.kind), c.vx / FX, c.vy / FX, c.flags))
    end
    if h and h.flying and other.kind ~= "mine"
        and (math.abs(c.vx) > FX or math.abs(c.vy) > FX) then
      heli_crash(worm, h, c.vx, c.vy, "contact " .. tostring(other.kind))
    end
  end)
end

-- ----------------------------------------------------------------- pools

-- Offensive: PX's \`Weapons\`, 29 entries.
local OFFENSIVE = {
  "bazooka",          -- Double Bazooka
  "homing_missile",   -- Igniter
  "mortar",           -- S.M.A.R.T Bomb
  "homing_pigeon",    -- Blaster Worm
  "sheep_launcher",   -- Burning Sheep Launcher
  "grenade",          -- Sticky Bomb
  "cluster_bomb",     -- Windy Cluster
  "banana_bomb",      -- Super Gravedigger
  "battle_axe",       -- Thumper Nade
  "earthquake",       -- Electric Grenade
  "dynamite",         -- Dynamite
  "mine",             -- Nuke Rocket
  "sheep",            -- Pogo Sheep
  "aqua_sheep",       -- Ghost Sheep
  "super_banana",     -- Chilli Bomb
  "holy_grenade",     -- Hellish Hand-Grenade
  "petrol_bomb",      -- Valyrian Fire
  "skunk",            -- Remote Roller
  "ming_vase",        -- Priceless Ming Vase
  "mad_cow",          -- Cow Launcher
  "old_woman",        -- Old Woman Launcher
  -- Not dealt on cavern maps:
  "salvation_army",   -- Ferret
  "air_strike",       -- Mortar Strike
  "mail_strike",      -- Pigeon Strike
  "mine_strike",      -- Submarine Attack
  "mole_squadron",    -- Gravler Strike
  "mb_bomb",          -- Banana Express
  "sheep_strike",     -- Bowling Ball Strike
  "carpet_bomb",      -- Thumper Nade Strike
}

-- Second weapon: PX's \`NotWeapons\`, 19 entries.
local SECOND = {
  "fire_punch",         -- Fire Jump
  "dragon_ball",        -- Sentry Laser
  "kamikaze",           -- Sentry Gun
  "prod",               -- Javelin
  "girder",             -- Baseball Bat
  "baseball_bat",       -- Electromagnet
  "shotgun",            -- Real Shotgun
  "handgun",            -- Sniper Rifle
  "uzi",                -- Laser Gun
  "minigun",            -- Burst Rifle
  "longbow",            -- Shadow-Bolt
  "blow_torch",         -- BlowTorch
  "pneumatic_drill",    -- Super Drill
  "scales_of_justice",  -- Portal Gun
  "armageddon",         -- Ice Arrow
  "flame_thrower",      -- Flame Thrower
  -- Not dealt on cavern maps:
  "nuclear_test",       -- Reinforcement
  "donkey",             -- Crate Strike
  "napalm_strike",      -- Lightning Strike
}

-- Movement: PX's \`MoveWeapons\`, 7 entries, all dealt on every map.
local MOVEMENT = {
  "girder_pack",   -- 3 Girder Pack
  "ninja_rope",    -- Jump
  "parachute",     -- Hang-Glider
  "teleport",      -- Super Tele
  "jet_pack",      -- Helicopter
  "low_gravity",   -- Gravity Control
  "laser_sight",   -- Swim Suit
}

-- On cavern maps PX draws RandomInt(0,20) and RandomInt(0,15) instead of the
-- whole lists: the first 21 offensive and first 16 second weapons. What that
-- leaves out is what comes from the sky, plus the Ferret.
local CAVE_OFFENSIVE = 21
local CAVE_SECOND = 16

-- The slots Highlander never touches -- Kamikaze Rocket, Gravler, Hot Air
-- Balloon, Skip Go/Surrender, Wind Changer, Muahaha 3, Weapon Crate, Cluster
-- Bomb, Fast Walk, Teleport, Skunk, Crate Spy, Mole Bomb, Crate Shower -- keep
-- whatever ammo the scheme gives them.

-- Every slot this pack owns, in a fixed order. Zeroing walks this list, so it
-- must not depend on pairs() order: Lua's string hashing is seeded per
-- process, and a different order on each peer is a different sequence of
-- writes.
local POOLED = {}
for _, pool in ipairs({ OFFENSIVE, SECOND, MOVEMENT }) do
  for _, name in ipairs(pool) do
    POOLED[#POOLED + 1] = name
  end
end

-- ----------------------------------------------------------------- state

-- The engine store is keyed by stable worm id (team * 16 + index), never by
-- entity address. It is virtual: WA's physical ammo is still alliance-shared
-- and is materialized from one worm's inventory at turn start.
local arsenal = wa.inventory.create({ id = "arsenal", slots = POOLED })
local dealt = {}

local function describe(list)
  if not list or #list == 0 then
    return "(nothing)"
  end
  return table.concat(list, ", ")
end

-- ----------------------------------------------------------------- rules

local function first(pool, n)
  local out = {}
  for i = 1, n do
    out[i] = pool[i]
  end
  return out
end

-- One from each pool, dealt to a worm on the first message it receives -- as
-- PX does on each worm's first M_FRAME. Dealing everyone at once on the very
-- first message would assume every worm already exists by then; this makes no
-- such assumption. Worms receive messages in WA's own entity order, which is
-- the same on every peer, so the draws still come out of WA's RNG in the same
-- sequence everywhere.
local function deal(worm)
  local cave = wa.world.cavern()
  arsenal:deal(worm, cave and first(OFFENSIVE, CAVE_OFFENSIVE) or OFFENSIVE, 1)
  arsenal:deal(worm, cave and first(SECOND, CAVE_SECOND) or SECOND, 1)
  arsenal:deal(worm, MOVEMENT, 1)
  dealt[worm.id] = true
  wa.log(string.format(
    "highlander: worm %d dealt %s (%s map)",
    worm.id, describe(arsenal:list(worm)), cave and "cavern" or "open"
  ))
end

local function start_turn(worm)
  arsenal:apply(worm, { clear = true, each = 1 })
end

local function on_death(event)
  local victim = event.victim
  local active = event.active
  local mine = arsenal:list(victim)

  if active and active.id == victim.id then
    -- Died on its own turn: nothing to hand on, just take its weapons away.
    arsenal:clear(victim)
    arsenal:apply(victim, { clear = true, each = 1 })
    wa.log(string.format("highlander: worm %d died on its own turn", victim.id))
    return
  end

  -- Otherwise the worm whose turn it is gets everything -- whoever or
  -- whatever did the killing, friend or foe, exactly as in PX.
  if not active or active.hp <= 0 then
    return
  end
  arsenal:transfer(victim, active, { weapons = "all", mode = "move" })
  -- Usable at once, this turn, not from the stealer's next turn.
  arsenal:apply(active, { weapons = mine, each = 1 })
  wa.log(string.format(
    "highlander: worm %d took %s from worm %d",
    active.id, describe(mine), victim.id
  ))
end

wa.on.worm_message(function(worm, msg)
  if not dealt[worm.id] then
    deal(worm)
  end
end)

wa.on.turn_start(function(event)
  start_turn(event.worm)
end)

wa.on.death(on_death)
`,
      },
      {
        path: 'mod.toml',
        name: 'mod.toml',
        language: 'toml',
        content: `id = "gameplay.highlander_full"
name = "Highlander (Full PX Scheme)"
version = "0.7.1"
author = "Project X / WormForge"
category = "gameplay"
api_version = 1
entry = "highlander_full.lua"

[rules]
exclusive_group = "highlander"
scheme = "HL - 0rang3 - 1.1"
cavern_aware = true
lockstep = true
`,
      },
      {
        path: 'README.md',
        name: 'README.md',
        language: 'markdown',
        content: `# Highlander (inventory verbs)

This is the concise implementation built on \`wa.inventory\`,
\`wa.on.turn_start\`, and \`wa.on.death\`. The original hand-written bookkeeping
is preserved in \`highlander_pure_lua\` for comparison. Enable only one edition.

Project X's *Highlander 0rang3 1.1*: its rules, on its weapon layout. The
scheme puts each of its weapons on one of WA's stock slots, e.g. the Baseball
Bat on the girder's. The pools are PX's own lists, each weapon written as the
slot it takes.

Weapons are ported in batches. **A weapon not ported yet leaves WA's stock
weapon on its slot, and that stands in for it.** For example, the Ice Arrow's
slot still holds Armageddon, dealt as a second weapon.

## Rules

- At the start of the match, every worm is dealt **one weapon from each
  pool**.
- On a worm's turn it can use **exactly its own weapons, one shot of each**.
  Nobody else holds any pooled weapon, whatever the scheme says.
- Next turn it gets them back. Firing doesn't use a weapon up for good.
- **When a worm dies, the worm whose turn it is takes everything the dead
  worm carried**, and can use it that same turn. That includes friendly and
  accidental kills, as in PX. A worm that dies on its own turn simply loses its
  weapons.
- **On cavern maps, the Ferret and nothing that falls from the sky is
  dealt.**

| Pool | Weapons (stock slot) |
|---|---|
| Offensive (29) | Double Bazooka (bazooka), Igniter (homing missile), S.M.A.R.T Bomb (mortar), Blaster Worm (homing pigeon), Burning Sheep Launcher (sheep launcher), Sticky Bomb (grenade), Windy Cluster (cluster bomb), Super Gravedigger (banana bomb), Thumper Nade (battle axe), Electric Grenade (earthquake), Dynamite, Nuke Rocket (mine), Pogo Sheep (sheep), Ghost Sheep (aqua sheep), Chilli Bomb (super banana), Hellish Hand-Grenade (holy grenade), Valyrian Fire (petrol bomb), Remote Roller (skunk), Priceless Ming Vase (ming vase), Cow Launcher (mad cow), Old Woman Launcher (old woman), Ferret (salvation army), Mortar Strike (air strike), Pigeon Strike (mail strike), Submarine Attack (mine strike), Gravler Strike (mole squadron), Banana Express (mb bomb), Bowling Ball Strike (sheep strike), Thumper Nade Strike (carpet bomb) |
| Second (19) | Fire Jump (fire punch), Sentry Laser (dragon ball), Sentry Gun (kamikaze), Javelin (prod), Baseball Bat (girder), Electromagnet (baseball bat), Real Shotgun (shotgun), Sniper Rifle (handgun), Laser Gun (uzi), Burst Rifle (minigun), Shadow-Bolt (longbow), BlowTorch, Super Drill (pneumatic drill), Portal Gun (scales of justice), Ice Arrow (armageddon), Flame Thrower, Reinforcement (nuclear test), Crate Strike (donkey), Lightning Strike (napalm strike) |
| Movement (7) | 3 Girder Pack (girder pack), Jump (ninja rope), Hang-Glider (parachute), Super Tele (teleport), Helicopter (jet pack), Gravity Control (low gravity), Swim Suit (laser sight) |
| Not pooled (14) | Kamikaze Rocket (suicide bomber), Gravler (mole bomb), Hot Air Balloon (bungee), Skip Go/Surrender (skip go), Wind Changer (surrender), Muahaha 3 (select worm), Weapon Crate (freeze), Cluster Bomb (magic bullet), Fast Walk, Teleport (invisibility), Skunk (damage x2), Crate Spy, Mole Bomb (double turn time), Crate Shower |

Highlander never touches the **not pooled** slots. Their ammo is whatever
the scheme gives, so the scheme decides whether Teleport or Skip Go is always
available.

On cavern maps PX draws from the first 21 offensive and the first 16 second
weapons only. That leaves out the Ferret and the strikes, and Reinforcement,
Crate Strike and Lightning Strike.

## Ported weapons

Each takes its record from the scheme itself (\`weps/<slot>.wep\`), which
carries PX's tuning for this scheme and its name. They are cut from
\`HL - 0rang3 - 1.1.pxs\` with:

\`\`\`sh
python3 tools/px_scheme_weps.py "HL - 0rang3 - 1.1.pxs" mods/examples/highlander/weps <slot> ...
\`\`\`

### WA's own weapons

| Slot | Weapon | Notes |
|---|---|---|
| dynamite | Dynamite | |
| blow_torch | BlowTorch | |
| flame_thrower | Flame Thrower | |
| girder | Baseball Bat | stock bat icon |
| girder_pack | 3 Girder Pack | three girders, not five |
| fast_walk | Fast Walk | |
| crate_spy | Crate Spy | |
| crate_shower | Crate Shower | |
| magic_bullet | Cluster Bomb | stock cluster icon |
| invisibility | Teleport | stock teleport icon |
| damage_x2 | Skunk | stock skunk icon |
| double_turn_time | Mole Bomb | stock mole icon |

These are WA's own weapons. Moving one to another slot works only as far as
WA reads the weapon from its record rather than its slot number. Played in
game: the Baseball Bat on the girder slot aims and swings as the bat; the
Cluster Bomb, Skunk and Mole Bomb fire as their records say; 3 Girder Pack
places three; Dynamite still gives its retreat time. Open points:

- **Teleport on the invisibility slot:** WA disables Invisibility's slot in
  offline games, so the Teleport is unavailable offline. Not yet checked
  online.
- **The scheme's header fields** (the dwords before the fire type) do not
  match WA's stock values. For example, Dynamite's retreat time is 0, not 5 s,
  and the bat's first flag is 0 where WA's is 1. The whole record is imported,
  as PX writes it; neither weapon plays differently for it.

### PX weapons that need only PX's art

None of these has a script in PX. The icons are PX's files byte for byte,
so replays share them. The strips are split into frame folders with
\`tools/px_split_strip.py\`.

| Slot | Weapon | Art |
|---|---|---|
| sheep_launcher | Burning Sheep Launcher | icon |
| mad_cow | Cow Launcher | icon |
| old_woman | Old Woman Launcher | icon |
| mail_strike | Pigeon Strike | icon |
| cluster_bomb | Windy Cluster | icon, cluster bits |
| banana_bomb | Super Gravedigger | icon, flight and cluster sprites, the worm holding and taking it out (flat, up, down) |
| minigun | Burst Rifle | icon, the worm aiming it, taking it out and firing it (\`weaponfire*\`) |
| mortar | S.M.A.R.T Bomb | icon, flight and cluster sprites, the bits' own sprite while they home, trail, worm |
| homing_pigeon | Blaster Worm | icon, flight and cluster sprites, the bits' trail, worm |
| battle_axe | Thumper Nade | icon, flight and cluster sprites, both trails, worm |
| carpet_bomb | Thumper Nade Strike | icon, the Thumper Nade's flight and cluster sprites and trails |
| air_strike | Mortar Strike | icon, cluster sprite, both trails (stock mortar shells) |
| mole_bomb | Gravler | icon, dive and dig frames, worm |
| mole_squadron | Gravler Strike | icon (the Gravler's frames) |
| aqua_sheep | Ghost Sheep | icon, its two sprites |
| sheep | Pogo Sheep | icon, flight and cluster sprites (the Blaster Worm's bits' trail) |
| mb_bomb | Banana Express | icon, the banana plane (\`plane\`) |
| shotgun | Real Shotgun | icon; five pellets per shot (\`fire_repeat = 5\`) |

All eighteen were played in game.

**Trails.** PX draws the last three weapons' trails by overriding stock
sprites their records point at: the Salvation Army's \`wsv*\` frames (249-252),
free here because the Ferret holds that slot. The pack does the same with
\`sprite_overrides\`, for the whole match, using the trail art from PX's
\`sprite_curtis_<id>\` libraries. The Gravler (245-248), Ghost Sheep (156/157)
and Mortar Strike (260, 466) have their art on overridden stock sprites the
same way; PX's scripts for them do nothing else.

**Strikes** keep their bomb's art 0x14 further along than a projectile does
(+0x74 bomb, +0x7C trail, +0x138 bits, +0x140 bits' trail). The importer and
\`sprite\` / \`cluster.sprite\` follow them there. A strike's plane is at +0x38:
PX's record names the Banana Express's 704, an id PX adds past WA's last
sprite (696), so the importer keeps the slot's own plane there and the pack
gives it the banana plane with \`plane\`.

**The Real Shotgun** has no art of its own. PX's script calls the shotgun's
fire five times per shot; \`fire_repeat = 5\` does the same, five pellets in one
frame, each spread by WA's own hitscan cone.

**Old Woman Launcher's record differs from PX's in one field.** For a
projectile, +0x34 picks the worm's aim sheet (0x51C060). WA knows values 1 to
12 only, and for PX's 0 it draws no worm at all. The pack's copy has 3, the
bazooka hold, as the Cow Launcher's.

### PX weapons with a small script

| Slot | Weapon | Art | Script |
|---|---|---|---|
| holy_grenade | Hellish Hand-Grenade | icon, flight sprite, worm | none: PX draws its hold and grenade at run time, and the pack uses sheets |
| skunk | Remote Roller | icon, flight sprite, worm | none: the library's script is empty in the extract |
| homing_missile | Igniter | icon, flight sprite (PX's bullet) | the hold, drawn at run time |
| grenade | Sticky Bomb | icon, the bomb and its bits | the hold, drawn at run time |
| fire_punch | Fire Jump | icon | PX's jump timeline |
| pneumatic_drill | Super Drill | icon | a second hole each frame |
| longbow | Shadow-Bolt | icon, the hold, the bolt, its trail | the hold and the bolt drawn at run time |
| handgun | Sniper Rifle | icon, the hold, laser.png | the hold, the laser sight and its own shot sound |
| jet_pack | Helicopter | icon, the helicopter, the climb-in, sounds | PX's flight, fuel and crashes on WA's jet pack |

Played in game: the Fire Jump, the Sticky Bomb and Igniter holds, the
Shadow-Bolt, the Sniper Rifle and the Helicopter.

**Holds drawn at run time.** For some weapons PX draws the worm holding it
with its sprite builder, not from a sheet. It takes a posture with no weapon
in it, then draws the weapon and a hand over it, placed and turned from the
aim each frame, and grows the weapon in as aiming starts. The pack does the
same with two GPU actors per aiming worm, from each weapon's numbers in its
PX script (\`PX_HOLDS\` in \`rules.lua\`). This needs \`worm.aim\` and
\`worm.aiming\` (engine branch \`worm-aim-reads\`), and without them it does
nothing. For the weapon to draw in front of the worm, it also needs
\`gpu-depth-order\`.

**Sticky Bomb.** PX's record leaves the bomb's sprite 0. That gives a
grenade-type slot no throw sheet, so the pack keeps the stock grenade sprite
and overrides it with PX's bomb. Its bits, once stuck, draw with the
Salvation Army's frame 467, which PX overrides too; so does the pack.

**Fire Jump.** This is WA's fire punch, whose speed then follows PX's
timeline:

- up at 9 pixels a frame at once;
- forward at 4 after 30 frames;
- 1 more upward at 60 frames;
- until 210 frames, a fall faster than 5 goes back to 4.

PX counts from \`FireFinal\`, which WA calls after the punch's wind-up, so the
pack starts counting when the worm starts rising. WA keeps the worm in its
punch state until it stops, so the punch cuts terrain and burns worms all the
way up. The full analysis is in \`docs/px-reverse-engineering.md\`.

**Super Drill.** WA drills as usual, and a hidden actor cuts a second drill
hole at the worm each frame until WA's drill stops.

**Missiles drawn at run time.** For some weapons PX leaves WA's flight
sprite 0 and draws the missile itself (\`WeapSprite\`). The sprite is turned
to its flight, mirrored when it flies left, and can be animated. The pack
does the same with a GPU actor per missile, placed from
\`wa.on.missile_frame\`, and uses each weapon's numbers from its PX script
(\`PX_WEAP_SPRITES\` in \`rules.lua\`). It needs \`m.weapon\`, the missile's slot
(engine branch \`missile-weapon\`). The Shadow-Bolt's bolt is drawn this way,
its hold is animated, and its trail is stock sprite 453 with PX's shadow
trail, as \`sprite_curtis_453\` does.

**Sniper Rifle.** While the current worm aims it, PX's laser sight is drawn
every rendered frame from \`wa.on.draw\`, as \`wa.draw.quad\`s (engine branch
\`draw-quad\`), following PX's \`laserray\` point for point:

- 100-pixel additive quads of \`laser.png\` along the aim;
- narrowing along the ray, with PX's brighter start and faint 7-pixel tip.

It stops at terrain, traced exactly, and at worms, mines, crates and
barrels. PX stops it with a 2x2 collision mask, so the object radii here are
estimates. Two differences from PX:

- **The aim:** the ray uses the aim the rifle was drawn with, so the two
  always turn together. \`worm.aim\` is WA's smoothed crosshair, and WA
  rewrites it at render time (see \`docs/px-reverse-engineering.md\`).
- **The start:** the ray starts on the barrel, 2 pixels off the worm's
  centre line where PX starts it, because the art's barrel runs 2 pixels to
  one side.

The rifle fires with PX's own shot sound, \`sounds/sniper_firing.wav\`.

**Helicopter.** PX's \`helicopter_user_script\`, on WA's jet pack:

- **Arming:** the Helicopter is armed while WA winds the jet pack up and
  launches on the jet pack that follows, since WA may clear the worm's
  selection as it fires the team's last one. During the wind-up, PX's
  climb-in animation plays.
- **Flight:** the script flies the worm from the worm's own move keys
  (\`worm.keys\`) and consumes them (\`worm:clear_keys()\`), so WA's jet pack
  neither thrusts nor burns fuel. Speed builds while a key is held, towards
  10 pixels a frame, and dies away when it is not. Gravity and wind act at
  0.2, and Shift keeps the facing.
- **Fuel:** 100 (\`worm.fuel\`), burnt by flying and by each key, but not
  during retreat. WA's own fuel counter shows it, because only the worm's
  body is hidden (\`worm.body_visible\`), as PX's \`RenderWorm\` override does.
- **Crash:** when the fuel runs out, the worm reaches water, or it hits
  anything but a mine faster than a pixel a frame (\`wa.on.contact\`, judged
  on the speed before impact). The explosion is sized by the fuel left and
  the speed, followed by one of PX's "oops" lines. Touching the ground
  never crashes it (PX's smooth landing: the landscape is \`NullObj\`). When
  WA ends the jet pack at rest, the worm slides.

The engine pieces are on the \`worm-flight\` branch.

Flight, cluster and plane sprites take 20 of the 223 shared sprite slots. Worm
sheets and \`sprite_overrides\` (the trails and the Gravler's and Ghost Sheep's
frames) are drawn by the GPU renderer, in true colour, and take none.

## Playing it

1. Enable only this pack in the mod loader. Packs that replace a stock slot,
   such as \`sentry_gun\`, \`pooz\` or \`worm_toss\`, would put their weapon into the
   pool in place of the one there.
2. Any scheme works. The pooled slots are overwritten every turn, including
   ones the scheme has at infinite.
3. \`wkLua.log\` records every hand dealt, by slot, and every weapon taken:
   \`highlander: worm 16 took ... from worm 32\`.

## Differences from PX

These are deliberate, and each one is explained in \`rules.lua\`:

- Wind Changer and Hot Air Balloon are not ported yet, so nothing is granted
  in their place.
- There's no removal at turn end. The next turn start does the same job.
- Every pooled slot is zeroed at each turn start, not only the previous
  worm's. PX left that to its own scheme; here any scheme works.

## Lockstep

The pack uses lockstep \`worm_message\`, \`turn_start\`, and \`death\` events.
Every random choice is \`wa.random()\`, which draws from WA's shared RNG, and
hands are dealt in worm-message order. Two peers, or a replay, deal the same
hands. Nothing reads local input or the clock.

## Reusable engine features

- \`worm:ammo(name, { set = n })\`: an absolute ammo write, WormForge's
  version of PX's \`SetWeaponEx\`. The older \`worm:ammo(name, n)\` adds to
  the current ammo and never changes infinite.
- \`wa.inventory.create({ id, slots })\`: a pack-scoped, per-worm virtual
  inventory. Its \`deal\`, \`transfer\`, \`clear\`, and \`apply\` verbs are usable by
  class/loadout mods without copying Highlander's bookkeeping.
- \`wa.on.turn_start\`: the active worm as a first-class lockstep event.
- \`wa.on.death\`: one event per death with \`victim\`, current \`active\`, and
  optional proven \`attacker\`, \`attacker_team\`, \`weapon\`, \`slot\`, and damage
  \`kind\`. Highlander intentionally transfers to \`active\`, preserving PX rules.
- \`wa.on.hurt\` carries the same optional attribution fields, so a different
  pack can transfer on damage or only for a particular weapon.
- \`wa.world.cavern()\`: WA's own cavern flag (\`GameWorld+0x777C\`).
- A fix: granting ammo used to move the weapon into the F1 panel row. It now
  stays in its own row.
- A fix: ammo **writes** went to the wrong row. The engine read a team's
  alliance from a different field than WA's own \`GetAmmo\` does, so every
  team's writes landed in the first team's row. Only that team ever played by
  Highlander rules.

## Tests

\`\`\`sh
lua mods/examples/highlander/test_rules.lua     # from the repo root
\`\`\`

These run \`rules.lua\` against a mocked WA. Ammo is stored per alliance, and
the mock scheme has an infinite bazooka. Which row a team's writes land in is
the engine's job, and the mock can't test it. They cover:
- the ported slots, each from its own scheme record, with PX's art (39)
- the Fire Jump's timeline, counted from the punch, not the fire key
- the run-time holds: placed from the aim, mirrored, grown in, and dropped;
  animated, and with no hand
- the run-time missile sprites: one per missile, turned to its flight,
  animated, and only on its own weapon's missiles
- the laser sight: its start, colours, length (full, to terrain, to a worm),
  when it shows, and the shot sound
- the Helicopter: the climb-in, launch (including with the last shot),
  kicks, damping, fuel and retreat, crashes by contact and fuel, mines and
  the ground not crashing it, and the landing slide
- pool coverage (55 pooled slots, and the 15 others never touched)
- deterministic dealing, including worms that appear late
- cavern hands (PX's short ranges)
- per-turn ownership and taking weapons back
- a stolen hand usable the same turn and kept afterwards
- friendly kills
- no double transfer
- a worm dying on its own turn

The inventory/rule-event refactor is covered by this mock suite and still
needs an in-game validation after deploying the matching DLL and pack.
`,
      },
    ],
  },
];
