import { ModFolderInfo } from '../types/wormforge';

// GENERATED FILE -- do not edit by hand.
//
// Regenerate with:  npm run gen:corpus
// Source of truth:   WormForge-main-source/mods/examples/  and
//                    WormForge-main-source/highlander_code/
// Built by:          scripts/__gen_corpus.ts
//
// The previous hand-maintained version had already drifted: it told users that
// require() was nil in the sandbox, which stopped being true once pack-scoped
// require landed (crates/lua-host/src/modules.rs, wired into lib.rs:90). Every
// file below is read straight out of the engine checkout instead, so it cannot
// go stale without the change showing up in git.
export const EXISTING_MODS: ModFolderInfo[] = [
  {
    id: 'example.hello',
    name: 'Hello (minimal pack)',
    version: '0.1.0',
    author: 'wkLua',
    category: 'utility',
    description: 'The smallest pack that does something: one wa.on.hurt handler plus the three turn-phase hooks. Read this one first.',
    tags: ['example', 'utility'],
    files: [
      {
        path: 'init.lua',
        name: 'init.lua',
        language: 'lua',
        content: `wa.log("hello from example.hello")

-- Hurt is lockstep: blast / hit / percent / nonlethal / poison both peers already run.
wa.on.hurt(function(hit)
  if hit.phase == "post" and hit.lost > 0 then
    wa.log(hit.kind .. " -" .. tostring(hit.lost) .. " hp")
  end
end)

-- Turn phases arrive in this order. With zero retreat they may share a frame.
wa.on.turn_retreat(function(event)
  wa.log("retreat begins for worm " .. tostring(event.worm.id))
end)
wa.on.turn_end(function(event)
  wa.log("movement ends for worm " .. tostring(event.worm.id))
end)
wa.on.turn_cleanup(function(event)
  wa.log("turn cleaned up for worm " .. tostring(event.worm.id))
end)
`
      }
    ],
  },
  {
    id: 'example.componentdemo',
    name: 'Component Demo',
    version: '0.1.0',
    author: 'wkLua',
    category: 'utility',
    description: 'A component pack: a scheme component overriding placed weapons, feature components returning install functions, and the weapons the scheme places. This is the shape bundles.rs drives.',
    tags: ['example', 'utility', 'components'],
    files: [
      {
        path: 'features/turn_note.lua',
        name: 'features/turn_note.lua',
        language: 'lua',
        content: `-- A feature component: its install function, given its options.
return function(ctx)
  if not ctx.option("show") then
    return
  end
  wa.on.hud(function()
    wa.hud.line("component demo: Big Bazooka on F1", 14, 40)
  end)
end
`
      },
      {
        path: 'scheme.lua',
        name: 'scheme.lua',
        language: 'lua',
        content: `-- A scheme component: overrides for the weapons its preset places, and its
-- round rules. Only the fields it sets change; the rest stay the weapon's.
return {
  weapons = {
    ["demo.big_bazooka"] = { delay = 1 },
  },
  install = function(ctx)
    for id, w in pairs(ctx.weapons) do
      wa.log(("scheme places %s on %s"):format(id, w.stock_slot))
    end
  end,
}
`
      },
      {
        path: 'weapons/big_bazooka.lua',
        name: 'weapons/big_bazooka.lua',
        language: 'lua',
        content: `-- A weapon component: its data, and what it does once placed. \`wa\` is only
-- available inside install; this file itself just returns the table.
return {
  defaults = {
    ammo = { round_start = -1 },
    delay = 0,
  },
  install = function(ctx)
    -- ctx.data is these defaults with the scheme's overrides laid over them.
    wa.log(("Big Bazooka on %s at %s %d: round_start %d, delay %d"):format(
      ctx.stock_slot, ctx.position.row, ctx.position.column, ctx.data.ammo.round_start, ctx.data.delay))
    wa.weapons.replace({ weapon = ctx.stock_slot, copy_from = "bazooka", name = "Big Bazooka", params = { damage = 80 } })
  end,
}
`
      },
      {
        path: 'weapons/big_mortar.lua',
        name: 'weapons/big_mortar.lua',
        language: 'lua',
        content: `-- A second weapon, outside the scheme's preset: the Profile tab adds it, and
-- it can swap places with Big Bazooka. It fires as a mortar wherever it sits.
return {
  defaults = {
    ammo = { round_start = 3 },
  },
  install = function(ctx)
    wa.log(("Big Mortar on %s at %s %d"):format(ctx.stock_slot, ctx.position.row, ctx.position.column))
    wa.weapons.replace({ weapon = ctx.stock_slot, copy_from = "mortar", name = "Big Mortar", params = { damage = 70 } })
  end,
}
`
      }
    ],
  },
  {
    id: 'example.highlander',
    name: 'Highlander (module pack)',
    version: '0.8.0',
    author: 'wkLua',
    category: 'rules',
    description: 'Highlander split across modules. rules.lua is only require() calls; the logic lives in lib/, scheme/ and weapons/. Pack-scoped require is functional upstream but still in beta, so do not treat the layout as settled.',
    tags: ['example', 'rules', 'require', 'modules'],
    files: [
      {
        path: 'lib/anim.lua',
        name: 'lib/anim.lua',
        language: 'lua',
        content: `-- Highlander: sprite animation helpers. Split from rules.lua by tools/split_highlander.py.
local shared = require("lib/shared")

-- PX's missile sprite animations share these two helpers. Holds are drawn
-- by the engine from each replace claim's hold table above.
local HOLD_DEPTH = 0x10000
local function next_phase(phase, anim_speed)
  if phase > 0.99 then return 0 end
  return phase + anim_speed * 30 / 1000
end
local function frame_of(phase, frames)
  return math.min(math.floor(phase * frames), frames - 1)
end

shared.HOLD_DEPTH = HOLD_DEPTH
shared.frame_of = frame_of
shared.next_phase = next_phase
`
      },
      {
        path: 'lib/holds.lua',
        name: 'lib/holds.lua',
        language: 'lua',
        content: `-- Highlander: the weapon holds the engine draws. Split from rules.lua by tools/split_highlander.py.
local shared = require("lib/shared")

-- ---------------------------------------------------------------- weapons

-- PX's sprite builder, for the weapons below whose hold PX draws at run
-- time: the worm posture with no weapon in it, and its hands. The engine
-- draws the weapon and optional hand from the hold claim below.
local PX_POSTURE = {
  weaponlnk = "sprites/px_hold/aim", weaponlnku = "sprites/px_hold/aimu",
  weaponlnkd = "sprites/px_hold/aimd",
  wthrow = "sprites/px_hold/draw", wthrowu = "sprites/px_hold/drawu",
  wthrowd = "sprites/px_hold/drawd",
}
local PX_HANDS = {
  "sprites/px_hold/hand_rad_lower", "sprites/px_hold/hand_rad", "sprites/px_hold/hand_rad_upper",
}
local PX_HOLDS = {
  prod = {
    keep_while_firing = true,
    sheet = "sprites/javelin/hold", draw_hand = false,
    hand_radius = 0, hand_rotation = 0, hand_radial_rotation = 0,
    weap_radial_rotation = 0, weap_rotation = 1, weap_radius = -11.8,
    animate = true, anim_speed = 1.25, frames = 12,
  },
  earthquake = { -- Electric Grenade (electric_grenade_anim)
    thrown = true,
    sheet = "sprites/px_hold/electric_grenade.png", hand_type = 1,
    hand_radius = 15, hand_scale = 0.8,
    weap_rotation = 0.5, weap_radius = 9,
  },
  grenade = { -- Sticky Bomb (sb_script)
    -- Thrown: once fired it has left the worm's hands, and WA puts nothing
    -- away (as for its own grenades), so neither does the rule.
    thrown = true,
    sheet = "sprites/px_hold/sticky_bomb", hand_type = 1, hand_radius = 24,
    hand_rotation = 1.0, hand_radial_rotation = 1.05, hand_scale = 0.8,
    weap_rotation = 0.5, weap_radial_rotation = 0.9, weap_radius = 10,
  },
  petrol_bomb = { -- Valyrian Fire (valyrianfire_s)
    thrown = true,
    sheet = "sprites/px_hold/valyrian_fire.png", hand_type = 1, hand_radius = -6.0,
    hand_rotation = 0.0, hand_radial_rotation = 0.0, hand_scale = 1.0,
    weap_rotation = 0.35, weap_radial_rotation = 0.0, weap_radius = -8.0,
  },
  super_banana = { -- Chilli Bomb (chilli_bomb_anim)
    thrown = true,
    sheet = "sprites/px_hold/chilli_bomb", hand_type = 1, hand_radius = 13,
    hand_scale = 0.8, weap_rotation = 0.5, weap_radius = 9,
  },
  homing_missile = { -- Igniter (igniter_anim)
    -- Up through the shot too: it has no firing poses of its own, so WA
    -- fires it in the aim posture, empty-handed without the hold. Not PX's.
    keep_while_firing = true,
    sheet = "sprites/px_hold/igniter", hand_type = 2, hand_radius = -6.0,
    hand_rotation = 1.0, hand_radial_rotation = 0.9, hand_scale = 0.8,
    weap_rotation = 1.0, weap_radial_rotation = 0.0, weap_radius = 0.0,
  },
  salvation_army = { -- Ferret (ferret_s's WormSprite): held still, not at the
    -- aim's angle (dont_rotate_with_angle), and thrown.
    thrown = true,
    sheet = "sprites/ferret/hold.png", hand_type = 2, hand_radius = -8.0,
    hand_rotation = 0.0, hand_radial_rotation = -0.13, hand_scale = 1.0,
    weap_rotation = 0.5, weap_radial_rotation = 0.22, weap_radius = -9.0,
    static = { weap = 0.0, hand = 0.45 }, -- ang_if_static, hand_ang_if_static
  },
  mine = { -- Nuke Rocket (nuke_rocket_anim): held at a fixed angle, not
    -- the aim's (dont_rotate_with_angle), and placed, so never put away.
    thrown = true,
    sheet = "sprites/px_hold/nuke_rocket", hand_type = 2, hand_radius = 13.0,
    hand_rotation = -0.6, hand_radial_rotation = -0.95, hand_scale = 1.0,
    weap_rotation = 0.45, weap_radial_rotation = 1.0, weap_radius = 8.5,
    static = { weap = -0.1, hand = 0.4 }, -- ang_if_static, hand_ang_if_static
  },
  handgun = { -- Sniper Rifle (sniper_rifle_script): its hand at scale 0
    -- Up through each shot, with its laser, over the snipefire poses (the
    -- worm lit by the muzzle), so it does not flicker between the three.
    -- Not PX's: PX hides it until the worm aims again.
    keep_while_firing = true,
    -- A muzzle flash on each shot. Not PX's: its rifle and snipefire poses
    -- have none. The sentry gun's flare, smaller, at the barrel's tip (30
    -- pixels out, on the barrel 2 to the side, as the laser leaves it).
    flash = { sheet = "sprites/sniper_rifle/flash", out = 30, side = 2, scale = 0.45, frames = 3 },
    sheet = "sprites/px_hold/sniper_rifle", draw_hand = false, hand_radius = -6.0,
    hand_rotation = 1.0, hand_radial_rotation = 0.9,
    weap_rotation = 1.0, weap_radial_rotation = 0.0, weap_radius = 0.1,
  },
  longbow = { -- Shadow-Bolt (shadow_bolt_script): no hand, the bolt animated
    -- The crossbow stays up through the shot: it has no firing poses of
    -- its own, so WA fires it in the aim posture. Not PX's.
    keep_while_firing = true,
    sheet = "sprites/px_hold/shadow_bolt", draw_hand = false, hand_radius = 0.0,
    hand_rotation = 0.0, hand_radial_rotation = 0.0,
    weap_rotation = 1.0, weap_radial_rotation = 0.0, weap_radius = 3.5,
    animate = true, anim_speed = 1.30, frames = 6,
  },
}

-- Each replace claim carries its own hold data. The engine draws it and
-- handles walking/aim/firing; no simulation actors are created for it.
for _, p in pairs(PX_HOLDS) do
  if p.draw_hand ~= false then p.hand = PX_HANDS[p.hand_type or 2] end
end

shared.PX_HOLDS = PX_HOLDS
shared.PX_POSTURE = PX_POSTURE
`
      },
      {
        path: 'lib/laser.lua',
        name: 'lib/laser.lua',
        language: 'lua',
        content: `-- Highlander: what Project X's two lasers share (weapon_gun_lasergun's
-- CLaserRay, which weapon_sentry_laser's CLaserRayS copies): their art, PX's
-- glow particles (PxParticle) and how both are drawn. A ray \`r\` carries its
-- own particles in \`r.fx\` and its own random sequence in \`r.seed\`, so the
-- effects come out the same on every machine.
local laser = {}

laser.FX = 0x10000
laser.GLOW = "sprites/laser_gun/laser_glow.png"
laser.BEAM = "sprites/laser_gun/laser_beam.png"
laser.DEPTH = 0x10000

function laser.rand(r)
  r.seed = (r.seed * 1103515245 + 12345) % 0x80000000
  return r.seed / 0x80000000
end

function laser.between(r, lo, hi)
  return lo + (hi - lo) * laser.rand(r)
end

-- A PX particle: moved, pulled and slowed each game frame, drawn additive.
-- { x, y, vx, vy (16.16), life, drag, grav, jitter, s0, s1 (sizes, 1 = 32
-- px), c0, c1 ({ r, g, b } at birth and death), alpha (255) }.
function laser.particle(r, p)
  p.age, p.vx, p.vy = 0, p.vx or 0, p.vy or 0
  r.fx[#r.fx + 1] = p
end

-- One game frame of the ray's particles.
function laser.step(r)
  for i = #r.fx, 1, -1 do
    local p = r.fx[i]
    p.age = p.age + 1
    if p.age >= p.life then
      table.remove(r.fx, i)
    else
      if p.jitter then
        p.vx = p.vx + math.floor(laser.between(r, -p.jitter, p.jitter) * laser.FX)
      end
      p.vy = p.vy + math.floor(p.grav * laser.FX / 10)
      p.vx, p.vy = math.floor(p.vx * (1 - p.drag)), math.floor(p.vy * (1 - p.drag))
      p.x, p.y = p.x + p.vx, p.y + p.vy
    end
  end
end

-- An ARGB word from an alpha and { r, g, b }.
function laser.argb(a, rgb)
  return (math.floor(math.max(0, math.min(255, a))) << 24)
    | (math.floor(rgb[1]) << 16) | (math.floor(rgb[2]) << 8) | math.floor(rgb[3])
end

-- The glow sprite, \`px\` across, centred on (x, y).
function laser.glow(x, y, px, color)
  local h = px * laser.FX / 2
  wa.draw.quad({ sprite = laser.GLOW, blend = "add", color = color, depth = laser.DEPTH,
    points = { { x - h, y - h }, { x + h, y - h }, { x + h, y + h }, { x - h, y + h } } })
end

-- The ray's particles, each fading from its birth size and colour to its
-- death ones.
function laser.draw_particles(r)
  for _, p in ipairs(r.fx) do
    local t = p.age / p.life
    local c = { p.c0[1] + (p.c1[1] - p.c0[1]) * t, p.c0[2] + (p.c1[2] - p.c0[2]) * t,
      p.c0[3] + (p.c1[3] - p.c0[3]) * t }
    laser.glow(p.x, p.y, 32 * (p.s0 + (p.s1 - p.s0) * t), laser.argb(p.alpha or 255, c))
  end
end

-- The beam: a strip of the beam texture \`width\` px wide from (x0, y0) to
-- (x1, y1).
function laser.beam(x0, y0, x1, y1, width, color)
  wa.draw.ribbon({ sprite = laser.BEAM, blend = "add", depth = laser.DEPTH, points = {
    { x = x0, y = y0, width = width, u = 0, color = color },
    { x = x1, y = y1, width = width, u = 1, color = color },
  } })
end

return laser
`
      },
      {
        path: 'lib/missile_sprites.lua',
        name: 'lib/missile_sprites.lua',
        language: 'lua',
        content: `-- Highlander: PX's missile sprites. Split from rules.lua by tools/split_highlander.py.
local shared = require("lib/shared")
local HOLD_DEPTH = shared.HOLD_DEPTH
local frame_of = shared.frame_of
local next_phase = shared.next_phase

-- ------------------------------------ PX's missile sprites, at run time
-- Shared with later sections; the rest of this section is local to it.
local flying, current_worm
do
--
-- For some weapons PX draws the missile itself (p_sprite_builder,
-- WeapSprite) and leaves WA's sprite 0: a sprite that follows the missile,
-- turned to its flight, mirrored when it flies left, and, if \`animate\`,
-- stepped through its sheet as a hold is. Here it is a GPU actor per
-- missile, placed from wa.on.missile_frame after WA has moved the missile.
-- It reads m.weapon (the missile's slot); on an engine without it nothing
-- matches and nothing is drawn. With \`hide\`, WA draws nothing for the
-- missile (m.sprite = 0), as PX's sprite 0 does; its record keeps its
-- sprite, which a thrown weapon's worm posture is picked by.
--
-- How it turns follows the record's animation type (the entry's +0x64,
-- PX's launchdata.anim.type): 2, WAT_TrackMovement, faces its flight
-- (WeapSprite type 2, as a bazooka shell); 1, WAT_Rotation, spins with its
-- speed (type 3, as a grenade), which \`spin\` asks for.

-- Slot -> the weapon's WeapSpriteParams, as its PX script states them.
local PX_WEAP_SPRITES = {
  prod = {
    sheet = "sprites/javelin/flight", hide = true,
    animate = true, anim_speed = 1.90, frames = 12,
  },
  longbow = { -- Shadow-Bolt
    sheet = "sprites/shadow_bolt/bolt", animate = true, anim_speed = 1.30, frames = 6,
  },
  super_banana = { -- Chilli Bomb (chilli_bomb_anim) and the five it bursts into
    sheet = "sprites/px_hold/chilli_bomb", frames = 1,
    spin = true, -- its record's WAT_Rotation
    -- WA's own sprite 0, as PX's record has it: nothing under the chilli.
    hide = true,
  },
  homing_missile = { -- Igniter (igniter_anim: igniter_bullet, 16 frames)
    sheet = "sprites/igniter/flight", animate = true, anim_speed = 1.0, frames = 16,
  },
  petrol_bomb = { -- Valyrian Fire: its bottle, spun at PX's 0.35 (WeapSprite speed)
    sheet = "sprites/px_hold/valyrian_fire.png", frames = 1,
    spin = true, spin_speed = 0.35,
    hide = true, -- PX's record has sprite 0; the stock bottle is the throw sheet's
  },
  earthquake = { -- Electric Grenade (electric_grenade_anim: electric_grenade_bullet)
    sheet = "sprites/px_hold/electric_grenade.png", frames = 1,
    spin = true, -- its record's WAT_Rotation
    -- PX's record has sprite 0; the pack's stock grenade is only for the
    -- worm's throw sheet.
    hide = true,
  },
}

flying = {} -- missile id -> { actor, phase, seen }

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

-- The worm whose turn it is: WeapSprite's owner (GetCurrentWorm()). A
-- missile frame gives no spawn owner of its own.
function current_worm()
  for _, w in ipairs(wa.worms.all()) do
    if w.turn then
      return w
    end
  end
end

-- A missile can outlive the turn it was fired in: a Chilli's five burst
-- after a blast that hurt the thrower, which ends WA's turn. With no worm
-- holding the turn, the last turn's worm owns the sprite, or it would not
-- be drawn at all while WA still flies the missile. That worm may have
-- died since, and WA frees a dead worm: it is kept by id and looked up
-- among the living, and if it is gone any living worm owns the sprite.
-- Left undrawn instead, the missile would show WA's own sprite, which
-- another weapon may have taken over (the Electric Grenade's is the stock
-- grenade, which the Sticky Bomb redraws as its bomb).
local last_turn_id
wa.on.turn_start(function(event)
  last_turn_id = event.worm and event.worm.id
end)

local function sprite_owner()
  local turn = current_worm()
  if turn then return turn end
  if not last_turn_id then return nil end
  local any
  for _, w in ipairs(wa.worms.all()) do
    if w.id == last_turn_id then return w end
    any = any or w
  end
  return any
end

wa.on.missile_frame(function(m)
  local p = PX_WEAP_SPRITES[m.weapon]
  -- WA's sprite is hidden only where PX's is drawn in its place: with no
  -- owner for ours, WA's stays.
  if p and p.hide and m.phase == "pre" and (flying[m.id] or sprite_owner()) then
    m.sprite = 0
  end
  p = m.phase == "post" and p
  if not p then
    return
  end
  local f = flying[m.id]
  if not f then
    local owner = sprite_owner()
    if not owner then
      return
    end
    f = { phase = 0, rot = 0 }
    f.actor = wa.actors.spawn({
      sprite = p.sheet, x = m.x, y = m.y, gravity = false, collide = false,
      owner = owner, on = follow_missile(m.id),
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
  local rot
  if p.spin then
    -- WeapSprite type 3: speed * (vx * 0.15 + |vy| * 0.01, towards vx) a
    -- frame, in pixels a frame and radians; WeapSprite's speed is 0.5
    -- unless the weapon's script sets it.
    local vx, vy = m.vx / 0x10000, m.vy / 0x10000
    local sign = vx > 0 and 1 or vx < 0 and -1 or 0
    f.rot = f.rot + (p.spin_speed or 0.5) * (vx * 0.15 + math.abs(vy * 0.01) * sign)
    rot = f.rot
  else
    -- WeapSprite::CalculateAngle, rotation 0.
    rot = -math.atan(m.vx, m.vy) - math.pi
  end
  a:gfx({ angle = math.deg(rot) % 360, depth = HOLD_DEPTH })
end)
end

shared.current_worm = current_worm
`
      },
      {
        path: 'lib/portals.lua',
        name: 'lib/portals.lua',
        language: 'lua',
        content: `-- Reusable portal pairs. The gun supplies placement/controls/art; a pair
-- owns traversal, return suppression, clearance and its velocity strategy.
local default_velocity = require("lib/portal_velocity")
local P = 0x10000
local Network = {}
Network.__index = Network
local OFFSET = { {0,1}, {-1,1}, {-1,0}, {-1,-1}, {0,-1}, {1,-1}, {1,0}, {1,1} }
local function trunc(x) return x >= 0 and math.floor(x) or -math.floor(-x) end

-- PX's GetHitAngle: eight surface directions, using the outward normal.
local function direction(nx, ny)
  if ny >= 0.95 then return 1 end
  if nx < 0 and ny > 0.25 and ny < 0.97 then return 2 end
  if nx <= -0.90 then return 3 end
  if nx < 0 and ny < -0.20 and ny > -0.97 then return 4 end
  if ny <= -0.97 then return 5 end
  if nx > 0 and ny < -0.20 and ny > -0.97 then return 6 end
  if nx >= 0.97 then return 7 end
  if nx > 0 and ny > 0.25 and ny < 0.97 then return 8 end
end
local function inside(p, x, y)
  return x > p.x - p.w / 2 and x < p.x + p.w / 2
     and y > p.y - p.h / 2 and y < p.y + p.h / 2
end
-- Centre crossing, extended to a swept segment for shots faster than the
-- opening. Called before WA collides, so a missile survives the entry wall.
local function crossing(p, x, y, vx, vy)
  if inside(p, x, y) then return 0 end
  local lo, hi = 0, 1
  for _, axis in ipairs({ {x, vx, p.x, p.w}, {y, vy, p.y, p.h} }) do
    local a, v, centre, size = table.unpack(axis)
    local left, right = centre - size / 2, centre + size / 2
    if v == 0 then
      if a <= left or a >= right then return nil end
    else
      local t0, t1 = (left - a) / v, (right - a) / v
      if t0 > t1 then t0, t1 = t1, t0 end
      lo, hi = math.max(lo, t0), math.min(hi, t1)
      if lo >= hi then return nil end
    end
  end
  return lo < 1 and lo or nil
end
local function identity(body)
  local kind = body.kind or "worm"
  return kind .. ":" .. tostring((kind == "worm" or kind == "actor") and body.id or body.uid)
end

function Network.new(options)
  options = options or {}
  return setmetatable({ pairs = {}, last_exit = {}, age = 0,
    width = (options.width or 40) * P, height = (options.height or 50) * P,
    offset = (options.offset or 10) * P,
    velocity = options.velocity or default_velocity,
    clearance = options.clearance,
    on_transport = options.on_transport,
    grace = options.grace or 150,
  }, Network)
end

function Network:place(group, colour, x, y, nx, ny, team_colour)
  local dir = direction(nx, ny)
  if not dir then return nil end
  assert(colour == 1 or colour == 2)
  local pair = self.pairs[group] or { active = true }
  local other = pair[3 - colour]
  -- PX's exclusion uses the impact point and the other rect plus 10px.
  if other and math.abs(x - other.x) < other.w / 2 + 10 * P
    and math.abs(y - other.y) < other.h / 2 + 10 * P then return nil end
  local fresh = pair[colour] == nil
  local p = pair[colour] or {}
  p.group, p.colour, p.team_colour = group, colour, team_colour
  p.x, p.y = x + OFFSET[dir][1] * self.offset, y + OFFSET[dir][2] * self.offset
  p.draw_x, p.draw_y, p.dir, p.nx, p.ny = x, y, dir, nx, ny
  p.w, p.h = self.width, self.height
  -- PX's final constructor else puts straight exits at the centre. Its
  -- diagonals use the inner x edge and one/ two thirds down the rectangle.
  p.exit_x, p.exit_y = p.x, p.y
  if dir == 2 or dir == 4 or dir == 6 or dir == 8 then
    p.exit_x = p.x + OFFSET[dir][1] * (p.w / 2 - 5 * P)
    p.exit_y = trunc((p.y + OFFSET[dir][2] * p.h / 6) / P) * P
  end
  pair[colour] = p
  self.pairs[group] = pair
  return p, fresh
end

function Network:active(group, on)
  local pair = self.pairs[group]
  if pair then pair.active = on ~= false end
end
function Network:turn_start()
  for _, group in ipairs(wa.sorted(self.pairs)) do
    local pair = self.pairs[group]
    pair.active, pair.ended_at = true, nil
  end
end
function Network:turn_end()
  for _, group in ipairs(wa.sorted(self.pairs)) do
    local pair = self.pairs[group]
    pair.ended_at = self.age
    if self.grace == 0 then pair.active = false end
  end
end
function Network:tick()
  self.age = self.age + 1
  for _, group in ipairs(wa.sorted(self.pairs)) do
    local pair = self.pairs[group]
    if pair.ended_at and self.age - pair.ended_at > self.grace then pair.active = false end
  end
end
function Network:move(body)
  local kind = body.kind or "worm"
  if kind == "worm" and (body.hp <= 0 or body.taken) then return false end
  local key = identity(body)
  local x, y, vx, vy = body.x, body.y, body.vx, body.vy
  local last = self.last_exit[key]
  if last then
    if inside(last, x, y) then return false end
    self.last_exit[key] = nil
  end
  local entry, exit, best
  for _, group in ipairs(wa.sorted(self.pairs)) do
    local pair = self.pairs[group]
    if pair.active and pair[1] and pair[2] then
      for colour = 1, 2 do
        local p = pair[colour]
        local t = crossing(p, x, y, vx, vy)
        if t and (not best or t < best) then entry, exit, best = p, pair[3-colour], t end
      end
    end
  end
  if not entry then return false end
  if best > 0 then
    local hit = wa.land.trace(x, y, x + trunc(vx * best), y + trunc(vy * best))
    if hit and hit.hit then return false end
  end
  local tx, ty = exit.exit_x, exit.exit_y
  if self.clearance then
    tx, ty = self.clearance(body, exit)
    if not tx then return false end
  elseif not body:fits(tx, ty, "terrain") then
    -- PX's emergency clearance. Do not transport into a still blocked exit.
    wa.land.dig({x = tx, y = ty, radius = 15})
    if not body:fits(tx, ty, "terrain") then return false end
  end
  local nvx, nvy, facing = self.velocity(kind, entry.dir, exit.dir, vx, vy, body.facing)
  local spec = { x = tx, y = ty, vx = nvx, vy = nvy }
  if kind == "worm" then spec.facing = facing end
  if not body:warp(spec) then return false end
  self.last_exit[key] = exit
  if self.on_transport then self.on_transport(body, entry, exit) end
  return true
end
Network.direction, Network.inside, Network.crossing = direction, inside, crossing
return Network
`
      },
      {
        path: 'lib/portal_effects.lua',
        name: 'lib/portal_effects.lua',
        language: 'lua',
        content: `-- PX p_portalgun2 DoTrailEffects/DoSpark/DoFlash and p_portal2
-- DoPortalEffects/DoTeleportationEffects, using the existing GPU draw API.
-- This local random stream drives looks only, never WA's gameplay RNG.
local Effects = {}
Effects.__index = Effects
local P, TAU = 0x10000, 2 * math.pi
local function trunc(x) return x >= 0 and math.floor(x) or -math.floor(-x) end
local function palette(colour, shift)
  if colour == 1 then return {255,255-shift,0}, {255,80-shift,0} end
  return {0,120-shift,255}, {0,80-shift,255}
end

function Effects.new()
  return setmetatable({ particles = {}, seed = 0x504F5254 }, Effects)
end
function Effects:random(lo, hi)
  local s = self.seed
  s = (s ~ (s << 13)) & 0xFFFFFFFF
  s = (s ~ (s >> 17)) & 0xFFFFFFFF
  s = (s ~ (s << 5)) & 0xFFFFFFFF
  self.seed = s
  return lo + (hi-lo) * (s / 0x100000000)
end
function Effects:particle(x, y, spec)
  -- Twelve endpoints emit at most 180 ambient particles at once. Bound
  -- bursts too, so repeated transport cannot accumulate an unbounded list.
  if #self.particles >= 1024 then return end
  local angle, speed = self:random(0, TAU), self:random(spec.speed[1], spec.speed[2])
  self.particles[#self.particles+1] = {
    x = x/P, y = y/P, vx = math.cos(angle)*speed, vy = math.sin(angle)*speed,
    age = 0, life = spec.life, sprite = spec.sprite or "lightning_glow.png",
    pixels = spec.pixels or 128, size = spec.size, end_size = spec.end_size or 0.01,
    start = spec.start, finish = spec.finish, alpha = spec.alpha or 255,
    resistance = 1/(1+(spec.resistance or 0)), gravity = spec.gravity or 0,
    randomness = spec.randomness or 0, angle = spec.angle or 0, spin = spec.spin or 0,
  }
end
function Effects:ambient(p)
  local first, last = palette(p.colour, math.floor(self:random(0, 51)))
  self:particle(p.x, p.y, { life=15, speed={2.5,4}, resistance=0.5, gravity=-0.5,
    randomness=1, size=self:random(0.1,0.4), start=first, finish=last,
    angle=p.colour==1 and 12 or 0.9, spin=p.colour==1 and 50 or 10 })
end
function Effects:transport(p)
  for _=1,5 do
    local first, last = palette(p.colour, math.floor(self:random(0, 51)))
    self:particle(p.x, p.y, { life=40, speed={3.5,8}, resistance=0.5, gravity=-0.5,
      randomness=3, size=self:random(0.3,1), start=first, finish=last })
  end
end
function Effects:impact(x, y, failed)
  -- PX's ExplodeAt emits 7 + 10 sparks; a rejected portal adds 30.
  for _=1,(failed and 47 or 17) do
    local shift = math.floor(self:random(0,51))
    self:particle(x, y, { sprite="portal_glow.png", pixels=32, life=40,
      speed={1.5,3.8}, resistance=0.05, gravity=1, randomness=0.2,
      size=self:random(0.2,0.4), start={255,255-shift,0}, finish={255,80-shift,0},
      angle=1.23, spin=25 })
  end
  local shift = math.floor(self:random(0,51))
  self:particle(x, y, { life=3, speed={0,0}, alpha=150, randomness=0.2,
    size=self:random(2,3.2), end_size=0.11,
    start={255,255-shift,255}, finish={200,225-shift,125} })
end
function Effects:trail(x, y, colour)
  local first = colour==1 and {45,10,4} or {4,10,45}
  local last = colour==1 and {45,25,4} or {4,25,45}
  self:particle(x, y, { life=15, speed={0,0}, size=0.5, end_size=0.35,
    start=first, finish={0,0,0} })
  self:particle(x, y, { life=40, speed={0,0.8}, size=0.3, end_size=0.35,
    start=last, finish={0,0,0} })
end
function Effects:tick(gravity)
  for i=#self.particles,1,-1 do
    local p = self.particles[i]
    p.age = p.age+1
    if p.age >= p.life then table.remove(self.particles,i)
    else
      p.angle = (p.angle+p.spin+math.pi) % TAU-math.pi
      p.x, p.y = p.x+p.vx, p.y+p.vy
      p.vx, p.vy = p.vx*p.resistance, p.vy*p.resistance+p.gravity*gravity/P
      if p.randomness > 0 then
        local angle, speed = self:random(0,TAU), self:random(0,p.randomness)
        p.vx, p.vy = p.vx+math.cos(angle)*speed, p.vy+math.sin(angle)*speed
      end
    end
  end
end
function Effects:draw(quad)
  for _, p in ipairs(self.particles) do
    local t = p.age/p.life
    local rgb = {}
    for i=1,3 do rgb[i]=trunc(p.start[i]+t*(p.finish[i]-p.start[i])) end
    local size = p.pixels*(p.size+t*(p.end_size-p.size))
    local colour = (p.alpha << 24) | (rgb[1] << 16) | (rgb[2] << 8) | rgb[3]
    quad(p.sprite, trunc(p.x*P), trunc(p.y*P), size, size, p.angle, colour, "add", 0x000BFFFF)
  end
end
return Effects
`
      },
      {
        path: 'lib/shared.lua',
        name: 'lib/shared.lua',
        language: 'lua',
        content: `-- Highlander: what its modules share, one table per match.
-- Split from rules.lua by tools/split_highlander.py.
return {}
`
      },
      {
        path: 'lib/turret.lua',
        name: 'lib/turret.lua',
        language: 'lua',
        content: `-- Highlander: Project X's sentry turrets (weapon_sentry_gun's PxSentryGun,
-- weapon_sentry_laser's PxSentryLaser), the part they share: a body dropped
-- in front of the worm that falls and plants itself, a head that sweeps,
-- picks the nearest moving enemy it can see, turns to it and fires, reloads
-- each turn, and is disabled for the turn by a blast and explodes at 0
-- health. What it aims at and what it fires are the weapon's: \`targets\` (by
-- default the worms) and \`fire(t, a, s, target)\`.
--
-- From the standalone sentry_gun port (mods/examples/sentry_gun_old), with
-- its numbers as the defaults. Angles: 0 down, 90 right, 180 up, 270 left.
local P = 0x10000

local turret = {}

local DEFAULTS = {
  sensor_px = 360,      -- detection radius
  ammo = 20,            -- rounds per turn
  shot_frames = 6,      -- frames between rounds
  activate = 60,        -- frames after acquiring before the first shot
  beep_frames = 60,     -- minimum gap between alert beeps
  rot_idle = 0.5,       -- degrees per frame while sweeping
  rot_active = 1.5,     -- PX tracking speed, degrees per frame
  sweep = 10,           -- PX idle sweep amplitude, degrees
  aim_tolerance = 1.5,  -- PX fires only after rotation reaches the target
  require_motion = true, -- PX only acquires walking/jumping/moving worms
  hold_own_turn = true, -- the Sentry Gun holds fire on its colour's turns
  sink_px = 8,          -- pixels the planted turret settles into the ground
  muzzle_up = 25,       -- pixels from the anchor up to the turret pivot
  front_px = 5,         -- the body lands this far in front of the worm
  health = 50,
  boom = { damage = 50, id = 100, below = false },
  -- Occlusion band for the head: in front of terrain (0x180000), so the
  -- landscape never buries it.
  head_depth = 0x10000,
}

-- 0 = down, 90 = right: the art faces right, and screen y grows down.
-- wa.math: an aim reaches the simulation (what the turret sees and hits), so
-- it must come out the same on every machine.
function turret.angle_to(ax, ay, tx, ty)
  local dx = (tx - ax) // P
  local dy = (ty - ay) // P
  local deg = math.deg(wa.math.atan(dx, dy))
  if deg < 0 then deg = deg + 360 end
  return deg
end

local function turn_toward(cur, want, speed)
  local d = (want - cur + 540) % 360 - 180
  if d > speed then d = speed elseif d < -speed then d = -speed end
  return (cur + d) % 360
end

-- A turret without one of the sounds (the laser has no firing loop) skips it.
local function play(a, sound)
  if sound then a:sound(sound) end
end

local function angle_gap(a, b)
  local d = (a - b + 540) % 360 - 180
  return d < 0 and -d or d
end

-- \`cfg\`: the weapon's numbers (over DEFAULTS), \`art\` { base, gun, flare,
-- barrel }, \`sounds\` { place, beep, fire_loop, fire_end, servo_start,
-- servo_loop, servo_end }, \`tints\` (team colours, red to cyan, 0xRRGGBB),
-- \`kind\`, \`fire(t, a, s, target)\`, which shoots once (a, the body; s, its
-- state), and optionally \`targets(t, a, s)\`, what it can aim at: a list of
-- { key, x, y, alliance, moving }, in an order the same on every machine.
-- Returns \`t\`, whose \`place(fire_ev)\` drops a turret for the firing worm.
--
-- The head: \`gun\`, team-tinted, its frames the firing poses; with a
-- \`barrel\`, the barrel is its own untinted layer behind it, its frames the
-- poses, and the gun's two frames are its art and its mirror image, for a
-- turret that has turned to face left (PX draws it flipped).
function turret.new(cfg)
  local t = {}
  for k, v in pairs(DEFAULTS) do t[k] = v end
  for k, v in pairs(cfg) do t[k] = v end
  local state = {}
  -- The colour taking its turn: its turrets hold fire. Alliance, not team:
  -- it is WA's colour index (0 red .. 5 cyan), shared by allied teams.
  local active_alliance = nil

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

  -- The Sentry Gun's targets: the worms, keyed by worm id; moving by
  -- note_motion.
  local function worm_targets(_, _, s)
    local out = {}
    for _, w in ipairs(wa.worms.all()) do
      if w.visible ~= false then
      local p = s.seen[w.id]
        out[#out + 1] = { key = w.id, x = w.x, y = w.y, alliance = w.alliance, moving = p and p.moving, obj = w }
    end
    end
    return out
  end
  local targets = cfg.targets or worm_targets

  -- PX needs movement to notice a target, but keeps an acquired one on line
  -- of sight alone. Seen from the head, not the feet on the ground.
  local function sees(a, s, c, need_motion)
    if c.alliance == s.alliance then return false end
    if need_motion and t.require_motion and not c.moving then return false end
    local ex, ey = a.x, a.y - t.muzzle_up * P
    local dx, dy = (c.x - ex) // P, (c.y - ey) // P
    if dx * dx + dy * dy > t.sensor_px * t.sensor_px then return false end
    return not wa.land.trace(ex, ey, c.x, c.y)
  end

  -- The nearest moving enemy in sight; ties to the first listed, the same
  -- everywhere.
  local function acquire(a, s, list)
    local ex, ey = a.x, a.y - t.muzzle_up * P
    local best, best_d
    for _, c in ipairs(list) do
      if sees(a, s, c, true) then
        local dx, dy = (c.x - ex) // P, (c.y - ey) // P
        local d = dx * dx + dy * dy
        if not best_d or d < best_d then best, best_d = c, d end
      end
    end
    return best
  end

  -- PX keeps its target until it loses sight of it.
  local function held(a, s, list)
    if s.tid == nil then return nil end
    for _, c in ipairs(list) do
      if c.key == s.tid then return sees(a, s, c, false) and c or nil end
    end
    return nil
  end

  function t.start_firing(a, s)
    if s.firing then return end
    s.firing, s.anim = true, 0
    -- PX zeroes ShootTimer as firing (re)starts: the first round goes now.
    s.cooldown = 0
    s.fire_sound = 35
    play(a, t.sounds.fire_loop)
  end

  function t.stop_firing(a, s)
    if not s.firing then return end
    s.firing, s.anim = false, 0
    play(a, t.sounds.fire_end)
  end

  local function update_servo(a, s, rotating)
    if rotating then
      if not s.rotating then
        s.rotating, s.servo_sound = true, 17
        play(a, t.sounds.servo_start)
      elseif s.servo_sound <= 0 then
        s.servo_sound = 47
        play(a, t.sounds.servo_loop)
      end
    elseif s.rotating then
      s.rotating, s.servo_sound = false, 0
      play(a, t.sounds.servo_end)
    end
  end

  local function think(a, s)
    -- A planted turret is immovable: blasts would otherwise add up.
    if s.px then a.x, a.y = s.px, s.py end
    a.vx, a.vy = 0, 0
    if not cfg.targets then
    for _, w in ipairs(wa.worms.all()) do note_motion(s, w) end
    end

    local target
    if s.active then
      local list = targets(t, a, s)
      target = held(a, s, list)
      if not target and not s.lost then
        target = acquire(a, s, list)
        if target then s.tid = target.key end
      end
    end
    local want
    local hx, hy = a.x, a.y - t.muzzle_up * P
    if target then
      if not s.had_target then
        s.activate = t.activate
        if s.beep <= 0 then
          play(a, t.sounds.beep)
          s.beep = t.beep_frames
        end
      end
      s.had_target, s.lost = true, false
      s.tx, s.ty = target.x, target.y
      want = turret.angle_to(hx, hy, target.x, target.y)
      s.angle = turn_toward(s.angle, want, t.rot_active)
    elseif s.had_target then
      -- PX stops firing at once, turns to the last place it saw it, then
      -- drops it.
      if not s.lost then t.stop_firing(a, s) end
      s.lost = true
      want = turret.angle_to(hx, hy, s.tx, s.ty)
      s.angle = turn_toward(s.angle, want, t.rot_active)
      if angle_gap(s.angle, want) <= t.aim_tolerance then
        s.had_target, s.lost, s.tid = false, false, nil
      end
    else
      -- PX sweeps to one side and turns back the moment it gets there.
      s.had_target = false
      want = s.idle + s.sweep_dir * t.sweep
      s.angle = turn_toward(s.angle, want, t.rot_idle)
      if s.angle == want then s.sweep_dir = -s.sweep_dir end
    end

    -- PX: turned over itself, it idles facing the other way.
    if (180 - s.angle) * s.side < 0 then
      s.side = -s.side
      s.idle = 180 - 90 * s.side
    end

    if not s.active then
      want = s.idle - 45 * s.side
      s.angle = turn_toward(s.angle, want, t.rot_idle)
      t.stop_firing(a, s)
    end

    if s.beep > 0 then s.beep = s.beep - 1 end
    if s.activate > 0 then s.activate = s.activate - 1 end
    if s.cooldown > 0 then s.cooldown = s.cooldown - 1 end
    if s.servo_sound > 0 then s.servo_sound = s.servo_sound - 1 end
    if s.fire_sound > 0 then s.fire_sound = s.fire_sound - 1 end

    local aligned = target and angle_gap(s.angle, want) <= t.aim_tolerance
    -- PX's long-rotation sound: a turn left of at least twice its speed.
    update_servo(a, s, target ~= nil and angle_gap(s.angle, want) >= 2 * t.rot_active)

    -- PX latches firing once on target, until it loses it, runs dry or is
    -- disabled.
    local hold_fire = t.hold_own_turn and active_alliance == s.alliance
    if target and not hold_fire and s.activate <= 0 and (s.firing or aligned) then
      t.start_firing(a, s)
      if s.fire_sound <= 0 then
        s.fire_sound = 35
        play(a, t.sounds.fire_loop)
      end
      if s.cooldown <= 0 then
        t.fire(t, a, s, target)
        s.cooldown = t.shot_frames
      end
    elseif not target or hold_fire then
      t.stop_firing(a, s)
    end
  end

  -- The body is the actor; the head and its flare ride on it, drawn only.
  local function sync(a, s)
    local gun = s.gun
    if not gun or gun.dead then return end
    gun.x, gun.y, gun.vx, gun.vy = a.x, a.y - t.muzzle_up * P, 0, 0
    local pose = (s.firing or s.recoil > 0) and (1 + ((s.anim // 3) % 2)) or 0
    local barrel = s.barrel
    -- With a barrel layer, the gun's frames are its art and its mirror.
    local look = barrel and (s.side < 0 and 1 or 0) or pose
    if look ~= s.look then
      gun:frame(look)
      s.look = look
    end
    if barrel and not barrel.dead then
      barrel.x, barrel.y, barrel.vx, barrel.vy = gun.x, gun.y, 0, 0
      if pose ~= s.pose then barrel:frame(pose) end
      barrel:gfx({ angle = (90 - s.angle) % 360, tint = 0xFFFFFF, depth = t.head_depth + 1 })
    end
    s.pose = pose
    local flare = s.flare
    if flare and not flare.dead then
      flare.x, flare.y, flare.vx, flare.vy = gun.x, gun.y, 0, 0
      local lit = (pose == 1) and 1 or 0
      if lit ~= s.lit then
        flare:frame(lit)
        s.lit = lit
      end
      flare:gfx({ angle = (90 - s.angle) % 360, tint = 0xFFFFFF, blend = "add", depth = t.head_depth })
    end
    -- The head art faces right; the renderer takes clockwise screen degrees.
    gun:gfx({ angle = (90 - s.angle) % 360, tint = t.tints[s.alliance + 1] or t.tints[1], depth = t.head_depth })
  end

  local function remove(s)
    if s.gun and not s.gun.dead then s.gun:despawn() end
    if s.flare and not s.flare.dead then s.flare:despawn() end
    if s.barrel and not s.barrel.dead then s.barrel:despawn() end
  end

  local function brain(a, ev)
    local s = state[a.id]
    if not s then return end
    ev = ev or {}
    if (ev.damage or 0) > 0 then
      s.health = s.health - ev.damage
      s.active = false
      t.stop_firing(a, s)
      update_servo(a, s, false)
      if s.health <= 0 then
        remove(s)
        state[a.id] = nil
        -- PX explodes at PosY-20: the body, not the feet.
        a:explode(t.boom)
        a:despawn()
        return
      end
    end
    -- \`recoil\`: frames the firing pose lingers after a shot the weapon ended
    -- at once (the laser's).
    if s.recoil > 0 then s.recoil = s.recoil - 1 end
    if s.firing or s.recoil > 0 then s.anim = s.anim + 1 end

    if not s.planted then
      a:gravity()
      local hit = a:move({ terrain = true, worms = false })
      if hit.land then
        a.vx, a.vy = 0, 0
        s.planted = true
        s.px, s.py = a.x, a.y + t.sink_px * P
        play(a, t.sounds.place)
        sync(a, s)
        return
      end
      a:advance()
      if a:in_water() then
        remove(s)
        state[a.id] = nil
        a:despawn()
        return
      end
    else
      think(a, s)
    end
    sync(a, s)
  end

  -- Who owns what the turret fires: the worm that placed it, as WA lists it
  -- now, else the turret itself. The handle kept from the placing names WA's
  -- freed worm once that worm has died, and a spawn refuses such an owner.
  function t.owner(a, s)
    for _, w in ipairs(wa.worms.all()) do
      if w.id == s.owner_id then return w end
    end
    return a
  end

  -- Slightly in front of the worm, unless a wall is that close.
  local function placement_x(worm, facing)
    local x = worm.x + facing * t.front_px * P
    if wa.land.trace(worm.x, worm.y, x, worm.y) then return worm.x end
    return x
  end

  local function rider(sheet, x, y, worm, kind)
    return wa.actors.spawn({
      sprite = sheet, x = x, y = y, vx = 0, vy = 0, gravity = false, collide = false,
      loop = false, origin = "center", owner = worm, kind = kind, persist = true,
      on = function() end,
    })
  end

  -- Drop a turret for the firing worm, its owner's colour (not worm.team,
  -- its roster slot: online a blue team in slot 1 placed a red turret).
  function t.place(fire_ev)
    local worm = fire_ev.worm
    local alliance = worm.alliance or 0
    if alliance < 0 or alliance > 5 then alliance = 0 end
    local facing = worm.facing
    local idle = facing < 0 and 270 or 90
    local x = placement_x(worm, facing)
    local body = wa.actors.spawn({
      sprite = t.art.base, x = x, y = worm.y,
      -- A small nudge, whatever the aim or charge.
      vx = (worm.vx // 2) + facing * 19661, vy = (worm.vy // 2) - 9830,
      loop = false, origin = "bottom", owner = worm, kind = t.kind, persist = true, on = brain,
    })
    local s = {
      alliance = alliance, owner = worm, owner_id = worm.id, planted = false, active = true, ammo = t.ammo,
      health = t.health, angle = idle, idle = idle, side = facing < 0 and -1 or 1,
      sweep_dir = 1, shots = 0, firing = false, anim = 0, rotating = false,
      servo_sound = 0, fire_sound = 0, beep = 0, activate = 0, cooldown = 0,
      had_target = false, lost = false, seen = {}, recoil = 0,
    }
    state[body.id] = s
    s.gun = rider(t.art.gun, x, worm.y - t.muzzle_up * P, worm, t.kind .. "_head")
    if t.art.flare then s.flare = rider(t.art.flare, x, worm.y - t.muzzle_up * P, worm, t.kind .. "_flare") end
    if t.art.barrel then s.barrel = rider(t.art.barrel, x, worm.y - t.muzzle_up * P, worm, t.kind .. "_barrel") end
    sync(body, s)
    return body, s
  end

  -- Each turn reloads and reactivates every turret, and forgets what moved
  -- and what it aimed at. Order-independent: each entry gets the same reset.
  wa.on.worm_message(function(worm, msg)
    if msg ~= wa.msg.START_TURN then return end
    active_alliance = worm.alliance
    for _, s in pairs(state) do
      s.ammo, s.active, s.had_target, s.tid, s.lost, s.seen = t.ammo, true, false, nil, false, {}
    end
  end, { msgs = { wa.msg.START_TURN } })

  t.state = state -- for the Highlander mock
  return t
end

return turret
`
      },
      {
        path: 'rules.lua',
        name: 'rules.lua',
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
--   * PX's GiveWeapons also sets the Hot Air Balloon to 3 and the Wind
--     Changer to 1 each turn; so does start_turn.
--
-- Lockstep: dealing, turn_start and death are all dispatched from WA's own
-- simulation messages, and every random choice is wa.random(). Two peers, or
-- a peer and a replay, deal the same hands and make the same grants. Nothing
-- here reads local input or the clock.

-- The pack's code is split into modules, run in this order; together
-- they are the pack. tools/split_highlander.py made them from the
-- single rules.lua this file once was.
require("lib/holds")
require("weapons/catalog")
require("weapons/wep_data")
require("weapons/claims")
require("weapons/super_drill")
require("weapons/fire_jump")
require("lib/anim")
require("weapons/sniper_rifle")
require("lib/missile_sprites")
require("weapons/double_bazooka")
require("weapons/chilli_bomb")
require("weapons/nuke_rocket")
require("weapons/helicopter")
require("weapons/hot_air_balloon")
require("weapons/hang_glider")
require("weapons/swim_suit")
require("weapons/wind_gravity")
require("weapons/jump")
require("weapons/laser_gun")
require("scheme/pools")
require("scheme/state")
require("scheme/rules")
require("weapons/super_tele")
require("weapons/electrical")
require("weapons/javelin")
require("weapons/ice_arrow")
require("weapons/valyrian_fire")
require("weapons/reinforcement")
require("weapons/bowling_ball")
require("weapons/ferret")
require("weapons/electromagnet")
require("weapons/crate_strike")
require("weapons/sentry_gun")
require("weapons/sentry_laser")
require("weapons/kamikaze_rocket")
require("weapons/weapon_crate")
require("weapons/portal_gun")
`
      },
      {
        path: 'scheme/pools.lua',
        name: 'scheme/pools.lua',
        language: 'lua',
        content: `-- Highlander: the scheme's weapon pools. Split from rules.lua by tools/split_highlander.py.
local shared = require("lib/shared")

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

-- The slots Highlander never pools -- Kamikaze Rocket, Gravler, Hot Air
-- Balloon, Skip Go/Surrender, Wind Changer, Muahaha 3, Weapon Crate, Cluster
-- Bomb, Fast Walk, Teleport, Skunk, Crate Spy, Mole Bomb, Crate Shower -- keep
-- whatever ammo the scheme gives them, except the Hot Air Balloon, the Wind
-- Changer and the Weapon Crate, which start_turn sets to 3, 1 and 1.

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

shared.CAVE_OFFENSIVE = CAVE_OFFENSIVE
shared.CAVE_SECOND = CAVE_SECOND
shared.MOVEMENT = MOVEMENT
shared.OFFENSIVE = OFFENSIVE
shared.POOLED = POOLED
shared.SECOND = SECOND
`
      },
      {
        path: 'scheme/rules.lua',
        name: 'scheme/rules.lua',
        language: 'lua',
        content: `-- Highlander: the scheme's rules. Split from rules.lua by tools/split_highlander.py.
local shared = require("lib/shared")
local CAVE_OFFENSIVE = shared.CAVE_OFFENSIVE
local CAVE_SECOND = shared.CAVE_SECOND
local MOVEMENT = shared.MOVEMENT
local OFFENSIVE = shared.OFFENSIVE
local SECOND = shared.SECOND
local arsenal = shared.arsenal
local dead_hands = shared.dead_hands
local dealt = shared.dealt
local describe = shared.describe
local revived_by_lightning = shared.revived_by_lightning

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
  -- GiveWeapons: three Hot Air Balloons, a Wind Changer and a Weapon Crate
  -- for the turn, whatever is left.
  worm:ammo("bungee", { set = 3 })
  worm:ammo("surrender", { set = 1 })
  worm:ammo("freeze", { set = 1 })
end

local function on_death(event)
  local victim = event.victim
  local active = event.active
  revived_by_lightning[victim.id] = nil
  local mine = arsenal:list(victim)
  dead_hands[victim.id] = mine

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
  arsenal:transfer(victim, active, {
    weapons = "all", mode = "move", x = victim.x, y = victim.y,
  })
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
end, { msgs = { wa.msg.FRAME_FINISH, wa.msg.START_TURN } })

wa.on.turn_start(function(event)
  start_turn(event.worm)
end)

wa.on.death(on_death)

shared.first = first
`
      },
      {
        path: 'scheme/state.lua',
        name: 'scheme/state.lua',
        language: 'lua',
        content: `-- Highlander: the scheme's state. Split from rules.lua by tools/split_highlander.py.
local shared = require("lib/shared")
local POOLED = shared.POOLED

-- ----------------------------------------------------------------- state

-- The engine store is keyed by stable worm id (team * 16 + index), never by
-- entity address. It is virtual: WA's physical ammo is still alliance-shared
-- and is materialized from one worm's inventory at turn start.
local arsenal = wa.inventory.create({ id = "arsenal", slots = POOLED })
local dealt = {}
local dead_hands = {}
local revived_by_lightning = {}

-- The current Highlander port moves a dead worm's hand to the active worm.
-- A grave revived by Lightning also gets that original hand back. This is a
-- copy: the active worm keeps the weapons it already stole.
shared.restore_lightning_inventory = function(worm)
  local hand = dead_hands[worm.id]
  if not hand then return end
  arsenal:clear(worm)
  for _, weapon in ipairs(hand) do arsenal:add(worm, weapon, 1) end
  dealt[worm.id] = true
  dead_hands[worm.id] = nil
end

local function describe(list)
  if not list or #list == 0 then
    return "(nothing)"
  end
  return table.concat(list, ", ")
end

shared.arsenal = arsenal
shared.dead_hands = dead_hands
shared.dealt = dealt
shared.describe = describe
shared.revived_by_lightning = revived_by_lightning
`
      },
      {
        path: 'test_portals.lua',
        name: 'test_portals.lua',
        language: 'lua',
        content: `-- Focused Portal Gun simulation tests, from the repo root:
-- lua mods/examples/highlander/test_portals.lua
local root = HIGHLANDER_ROOT or "mods/examples/highlander/"
package.path = root .. "?.lua;" .. package.path
local P = 0x10000
local hooks, actors, keys, sounds, worms, draws = {}, {}, {}, {}, {}, {}
local cut, obstruction, solid_exit = 0, false, false
local next_hit
wa = {
  sorted = function(t) local a = {}; for k in pairs(t) do a[#a+1]=k end; table.sort(a); return a end,
  math = { sin = math.sin, cos = math.cos, atan = math.atan },
  world = { keys = function() return keys end, water = function() return 1000*P end,
    size = function() return {w=2000,h=1000} end, gravity = function() return P//8 end,
    trace = function() return next_hit end },
  land = { trace = function() return obstruction and {hit=true} or nil end,
    dig = function(s) assert(s.radius==15); cut=cut+1 end },
  worms = { all = function() return worms end },
  sound = { play = function(target, name)
    assert(target==nil or type(target)=="table")
    assert(type(name)=="string"); sounds[#sounds+1] = name
  end },
  actors = { spawn = function(spec)
    local a = { id = #actors+1, x = spec.x, y = spec.y, on = spec.on }
    function a:scale(v) self.scale_value=v end
    function a:gfx(v) self.gfx_value=v end
    function a:frame(v) self.frame_value=v end
    function a:despawn() self.dead=true end
    actors[#actors+1]=a; return a
  end },
  on = {}, msg = { FRAME_FINISH = 2 },
  draw = { quad = function(q)
    assert(#q.points==4)
    for _, p in ipairs(q.points) do assert(math.abs(p[1])<32000*P and math.abs(p[2])<32000*P) end
    draws[#draws+1]=q
  end },
}
for _, name in ipairs({ "missiles", "mines", "crates", "oil", "graves", "arrows" }) do wa[name]={all=function() return {} end} end
for _, name in ipairs({"body_move", "worm_message", "turn_start", "turn_end", "draw"}) do
  wa.on[name] = function(f, opts) hooks[name] = f; hooks[name .. "_opts"] = opts end
end
local function body(kind, uid, x, y, vx, vy)
  local b = { kind=kind, uid=uid, id=uid, x=x, y=y, vx=vx or 0, vy=vy or 0, facing=1, hp=100 }
  function b:fits(_, _, mode) assert(mode=="terrain"); return not solid_exit end
  function b:warp(s)
    self.warps=(self.warps or 0)+1
    self.x,self.y,self.vx,self.vy=s.x,s.y,s.vx or self.vx,s.vy or self.vy
    self.facing=s.facing or self.facing; return true
  end
  return b
end
local Portals = require("lib/portals")
local velocity = require("lib/portal_velocity")
local function pair(options)
  local n = Portals.new(options)
  assert(n:place(0,1,100*P,100*P,-1,0))
  assert(n:place(0,2,400*P,100*P,1,0))
  return n
end
local n = pair()
local worm = body("worm", 17,90*P,100*P,8*P,3*P)
assert(n:move(worm) and worm.x == 410*P and worm.vx == 8*P and worm.vy == -3*P)
assert(not n:move(worm), "return suppressed while still inside exit")
worm.x, worm.vx = 450*P, -10*P
assert(not n:move(worm))
worm.x=420*P
assert(n:move(worm) and worm.x==90*P, "return allowed once body leaves exit")
-- A different body's same raw address must not inherit the old exit lock.
local missile = body("missile", 101,90*P,100*P,8*P,3*P)
assert(n:move(missile))
local reuse = body("missile", 102,410*P,100*P,-8*P,0)
assert(n:move(reuse))
-- Native IDs are prefixed by kind, since worm ids and actor ids have their
-- own sequences. Dead and taken worms keep their WA handoff.
local other = body("worm",101,90*P,100*P,2*P,0); assert(n:move(other))
other.hp=0; other.x=90*P; assert(not n:move(other))
other.hp=100; other.taken=true; assert(not n:move(other))
local fast = body("arrow",303,20*P,100*P,150*P,0)
assert(pair():move(fast), "fast arrow intercepted before the wall")
obstruction=true; assert(not pair():move(body("missile",304,20*P,100*P,150*P,0)))
obstruction=false
solid_exit=true; assert(not pair():move(body("crate",305,90*P,100*P,0,0)) and cut==1)
solid_exit=false
local fit_calls=0
local clearing=body("oil",306,90*P,100*P,0,0)
function clearing:fits(_, _, mode) assert(mode=="terrain"); fit_calls=fit_calls+1; return fit_calls>1 end
assert(pair():move(clearing) and cut==2)
local old = n.pairs[0][1]
assert(n:place(0,1,200*P,100*P,-1,0)==old, "relocation retains endpoint identity")
assert(not n:place(0,1,400*P,100*P,-1,0), "overlapping partner rejected")
assert(n:place(1,1,200*P,300*P,-1,0) and not n.pairs[1][2], "pair belongs to its team")
n:active(0,false); assert(not n:move(body("mine",307,190*P,100*P,0,0)))
n:turn_start(); assert(n.pairs[0].active)
n:turn_end(); for _=1,150 do n:tick() end; assert(n.pairs[0].active)
n:tick(); assert(not n.pairs[0].active)
local immediate=pair({grace=0}); immediate:turn_end()
assert(not immediate.pairs[0].active, "zero grace disables transport at retreat end")
-- PX distinguishes the worm's and an object's right->right exit. Its
-- diagonal rules combine momentum; this is not a simple vector rotation.
local x,y,f=velocity("worm",3,3,8*P,3*P,1); assert(x==-8*P and y==3*P and f==-1)
x,y=velocity("missile",3,3,8*P,3*P,1); assert(x==-8*P and y==-3*P)
x,y,f=velocity("worm",3,2,8*P,3*P,1); assert(x==-4*P and y==P and f==-1)
x,y=velocity("worm",3,3,0,0,1); assert(x==-2*P)
for entry=1,8 do for exit=1,8 do for _, kind in ipairs({"worm","missile"}) do
  for _, speed in ipairs({{0,0},{8,3},{-7,-11},{1,-1},{40,40}}) do
    x,y,f=velocity(kind,entry,exit,speed[1]*P,speed[2]*P,-1)
    assert(math.type(x)=="integer" and math.type(y)=="integer" and (f==1 or f==-1))
  end
end end end
assert(Portals.direction(0,1)==1 and Portals.direction(-1,0)==3 and Portals.direction(0,-1)==5)
assert(Portals.direction(1,0)==7 and Portals.direction(-.7,.7)==2 and Portals.direction(.7,-.7)==6)
local strategy_calls=0
local custom=pair({velocity=function() strategy_calls=strategy_calls+1; return 3,4,1 end,
  clearance=function() return 600*P,200*P end})
local custom_body=body("actor",909,90*P,100*P,0,0)
assert(custom:move(custom_body) and strategy_calls==1 and custom_body.x==600*P and custom_body.vx==3)

-- Gun: Space while airborne uses PX's direction keys at full power,
-- retains worm momentum, and captures owner/team/colour per bolt.
local shared=require("lib/shared"); shared.fires={}; shared.current_worm=function() return worms[1] end
require("weapons/portal_gun")
worm=body("worm",17,100*P,100*P,4*P,-6*P)
worm.team,worm.alliance,worm.weapon,worm.turn,worm.aim=0,0,"scales_of_justice",true,.5
worm.stock=3
function worm:ammo(_,delta) if delta then self.stock=self.stock+delta end; return self.stock end
function worm:air_fire(on) self.air_enabled=on~=false; return true end
worms={worm}
for _, entry in ipairs({{{up=true,left=true},.75},{{down=true,right=true},.175},{{up=true},1},{{down=true},0},{{left=true},.5},{{},.5}}) do
  keys=entry[1]
  local aim=shared.portal_air_aim(worm,keys); assert(aim==entry[2])
  shared.fires.portal_gun({worm=worm,airborne=true})
  assert(worm.vx==4*P and worm.vy==-6*P and worm.stock==3)
end
keys={plus_key=true}; hooks.worm_message(worm); assert(worm.air_enabled)
shared.fires.portal_gun({worm=worm,airborne=true})
local a=actors[#actors]
-- Replace the trace with a supported terrain hit. The first successful
-- blue placement auto-selects orange, without consuming half a pair's ammo.
next_hit={hit=true,x=300*P,y=100*P,nx=-1,ny=0}; obstruction=true
a.on.frame(a); assert(a.dead and shared.portals.pairs[0][2] and worm.stock==3)
local function endpoint(sprite)
  for _, q in ipairs(draws) do if q.sprite=="sprites/portal_gun/"..sprite then return q end end
end
draws={}; hooks.draw()
local single=assert(endpoint("portal_blue.png"), "first endpoint drawn before its partner exists")
assert(single.color==0xFFFFFFFF and single.blend=="add", "single endpoint stays bright")
assert(endpoint("portal_black_mask"), "PX's team marker is drawn")
assert(endpoint("lightning_glow.png"), "PX's impact flash replaces the placeholder halo")
hooks.turn_end(); assert(not shared.portals.pairs[0].active)
worm.turn=false; draws={}; hooks.draw()
assert(endpoint("portal_blue.png").color==single.color, "inactive endpoint keeps its appearance between turns")
assert(not shared.portals:move(body("arrow",999,290*P,100*P,2*P,0)))
worm.turn=true; hooks.turn_start(); assert(shared.portals.pairs[0].active)
keys={ctrl=true}
shared.fires.portal_gun({worm=worm,airborne=true}); a=actors[#actors]
next_hit={hit=true,x=600*P,y=100*P,nx=1,ny=0}; a.on.frame(a)
assert(worm.stock==2 and shared.portals.pairs[0][2].draw_x==600*P, "one-shot Ctrl inversion and pair ammo")
-- Ground charge uses normalized native power; native ammo use is refunded.
keys={}; obstruction=false; next_hit=nil
shared.fires.portal_gun({worm=worm,power=.25}); a=actors[#actors]; worm.stock=worm.stock-1
local before=a.x; a.on.frame(a); assert(math.abs(a.x-before-35*.25*P)<2 and worm.stock==2)
keys={pause_key=true}; hooks.worm_message(worm); assert(not shared.portals.pairs[0].active)
hooks.worm_message(worm); assert(not shared.portals.pairs[0].active, "Pause is an edge")
keys={}; hooks.worm_message(worm); keys={pause_key=true}; hooks.worm_message(worm)
assert(shared.portals.pairs[0].active)
-- Complete the pair: ambience runs only while transport is active; endpoint
-- art is always submitted. Particle lifetimes/motion stay in Lua looks.
shared.portals:place(0,1,300*P,100*P,-1,0)
actors[1].on.frame(actors[1])
draws={}; hooks.draw()
assert(endpoint("portal_orange.png") and endpoint("portal_blue.png"))
local Effects=require("lib/portal_effects")
local fx=Effects.new(); fx:ambient(shared.portals.pairs[0][1]); assert(#fx.particles==1)
assert(fx.particles[1].life==15 and fx.particles[1].gravity==-0.5)
fx:transport(shared.portals.pairs[0][1]); assert(#fx.particles==6)
fx:trail(100*P,100*P,2); assert(#fx.particles==8)
fx:impact(100*P,100*P,false); assert(#fx.particles==26)
for _=1,40 do fx:tick(P//8) end
assert(#fx.particles==0, "PX effects expire instead of accumulating")
assert(#hooks.body_move_opts.kinds==7, "bolts and magnets excluded from transport")
print("Portal Gun: placement, controls, air aim, transport, visibility across turns and PX effects passed")
`
      },
      {
        path: 'weapons/bowling_ball.lua',
        name: 'weapons/bowling_ball.lua',
        language: 'lua',
        content: `-- Highlander: Bowling Ball Strike (PX weapon_bowlingball: bbstrike.txt and
-- bowlingball.txt's CBowlingBall).
local shared = require("lib/shared")
local fires = shared.fires

-- The strike: PX's plane drops three balls 48 pixels apart from 128 above
-- the map, moving 5 a frame the way it flies. Here they drop together, the
-- way WA's strike arrow points: the sign of the shot's x speed (ev.vx), which
-- PX's PxAirstrike reads, from the left unless the arrow keys turned it. As
-- PX's plane drops them early by how far they drift on the way down (its
-- SpeedCompensation), the drop line is set back by the middle ball's own
-- drift down to the click, so it lands on the click. PX's plane is not drawn.
local STRIKE_BALLS = 3
local STRIKE_SPACING = 48
local STRIKE_SPEED = 5
local STRIKE_Y = -128         -- PX's PlaneAppearYOffset

-- PX's CBowlingBall numbers.
local RADIUS = 16             -- MakeCircleMask(16): the ball's art is 32 across
local BOUNCE, FRICTION = 0.03, 0.02
local INERTIA_X, INERTIA_Y = 0.8, 0.4
local LOW_SPEED = 4.0         -- below this for LOW_FRAMES frames: "low speed"
local LOW_FRAMES = 100
local LOW_BOUNCE, LOW_FRICTION = 0.03, 0.03
local LOW_INERTIA_X, LOW_INERTIA_Y = 0.0, 0.0
local SLEEP_DISTANCE = 2      -- moved less than this over SLEEP_PERIOD frames: asleep
local SLEEP_PERIOD = 80
local FAST = 4.0              -- MinDamageSpeed: faster, it rolls through worms and hurts
local SPIN_X, SPIN_Y, MAX_SPIN = 0.06, 0.02, 0.6
local SHEET = "sprites/bowling_ball/ball.png"

-- PX's damage (ProcessBallOnOtherCollision): faster than FAST, whatever the
-- ball overlaps takes 5 at that speed up to 60 at 15 and more; crates and oil
-- drums 100. A worm then takes nothing more for 12 frames (PX's
-- DamageRecoverTime). Balls push each other apart (ProcessBallOnBallCollision)
-- by 0.6 * sqrt(speed), of which the pushed ball keeps 0.7 (GunForceMultiplier).
local MAX_DAMAGE_SPEED = 15.0
local MIN_DAMAGE, MAX_DAMAGE = 5.0, 60.0
local OBJECT_DAMAGE = 100
local DAMAGE_FORCE = 0.7      -- DamageForceMultiplier
local RECOVER_FRAMES = 12
local PUSH_SPEED = 4.0        -- MinPushSpeed
local PUSH_FORCE, PUSH_KEEP = 0.6, 0.7
local SOUND_CRUSH, SOUND_HIT = 33, 101
-- A ball counts as hitting what it touches: PX traces it with a smaller
-- mask than the 16-pixel circle it hits with, so it overlaps a drum or
-- crate it stops against; ours traces with the circle, which stops it a
-- touch away from them.
local TOUCH = 2

-- PX's Zap(0), the Lightning Strike's "overcharge": the ball wakes and is
-- thrown up, 5 to 10 a frame within 0.1 of straight up, and is electrified
-- for good (PX never counts its ZapTurnsRemaining down): awake and not slow,
-- its friction is negative, so it speeds up along what it rolls on. PX's
-- strike reaches it within its 12-pixel hit circle of the ball's 16.
-- What WA hits the ball with. It is in WA's object layer (\`as_object\`), as
-- PX's ball is in the oil drums' (SetLayerOverride(LAYER_OILDRUM)), so WA's
-- fires, guns and blasts reach it. As PX's Message: any hit wakes it, a
-- blast's push is taken whole (ExplosionForceMultiplier) and any other's,
-- a fire's among them, at 0.7 (GunForceMultiplier).
local BLAST_FORCE, GUN_FORCE = 1.0, 0.7
local ZAPPED_FRICTION = -0.05
local ZAP_REACH = 12

-- PX's electrified look (CBowlingBall::Render and UpdateZPlane), PX's own
-- art: its lightning glow, 0.3 to 0.4 of its 128 pixels across, added three
-- times in RGB(80, 110, 128); its 10-frame spark, turning with the ball,
-- played over 50 frames then paused 20 (SparkCycle, 0.02 a frame to 1.4);
-- and while awake a glow left behind every frame, 30 frames fading to
-- black, 0.3 to 0.5 across, drifting up to 0.3 a frame. Drawn where the
-- ball's sprite is: the glows behind the ball (a halo; PX draws them over
-- it, which washes the ball out to white), the spark in front. Our own on
-- top of PX's: the ball itself turns electric blue, darkened (its sprite's
-- tint) and given a blue sheen that follows its shading (sheen.png, the
-- ball in grey, added in front of it).
local GLOW_SHEET = "sprites/bowling_ball/glow.png"
local SPARK_SHEET = "sprites/bowling_ball/spark.png"
local SHEEN_SHEET = "sprites/bowling_ball/sheen.png"
local ZAPPED_TINT = 0x405980  -- the ball's colours times (0.25, 0.35, 0.5)
local SHEEN_COLOR = 0xFF3C96FF -- RGB(60, 150, 255), added
local GLOW_SIZE = 128
local SPARK_SIZE, SPARK_FRAMES = 60, 10
local SPARK_SPEED, SPARK_CYCLE = 0.02, 1.4
local ZAP_R, ZAP_G, ZAP_B = 80, 110, 128
local TRAIL_LIFE = 30
-- The ball is drawn this far below where its circle is, in pixels: at the
-- circle's own place it looked to float over the ground. In front of the
-- terrain (actors are behind it by default), behind the worms (0xD0000).
local SPRITE_DROP = 4
local LIFT = 0x8000           -- half a pixel, 16.16
local BALL_DEPTH = 0x000E0000
local GLOW_DEPTH, SHEEN_DEPTH, SPARK_DEPTH = BALL_DEPTH + 1, BALL_DEPTH - 1, BALL_DEPTH - 2
local P = 0x10000
-- WA keeps positions in 16.16, so it can place nothing past +-32767 px; a
-- ball flung that far off the map (it flies on, WA drawing its arrow at the
-- edge) is gone once its next move would leave that range.
local EDGE = 32000 * P

-- What the ball rolls on: PX's DefaultColGroup, and without worms when fast
-- (NoWormsColGroup).
local SOLID = { "terrain", "worms", "crates", "oil" }
local SOLID_FAST = { "terrain", "crates", "oil" }

local function trunc(v) return v >= 0 and math.floor(v) or -math.floor(-v) end

-- The circles PX's masks give what the ball can hit (as wa.world.trace's).
local function target_radius(obj)
  if obj.kind == "worm" then return 6 end
  if obj.kind == "mine" then return 5 end
  return 9
end

local function sleep(b)
  if b.asleep then return end
  b.asleep, b.low = true, false
  b.sleep_x, b.sleep_y = b.x, b.y
  b.vx, b.vy, b.lvx, b.lvy = 0, 0, 0, 0
  b.rvx, b.rvy = 0, 0
end

-- PX's Wake: moving again, its timers restarted.
local function wake(b)
  if not b.asleep and not b.low then return end
  b.asleep, b.low = false, false
  b.low_timer, b.sleep_timer = 200, 200
  b.rec_x, b.rec_y = b.x, b.y
end

-- PX's UpdateRotation: spin from the ball's real motion, towards it.
local function spin(b)
  local rot = math.min(MAX_SPIN, SPIN_X * math.abs(b.rvx) + SPIN_Y * math.abs(b.rvy))
  if b.rvx < 0 then rot = -rot end
  b.rot = b.rot + rot
  while b.rot > math.pi do b.rot = b.rot - 2 * math.pi end
  while b.rot <= -math.pi do b.rot = b.rot + 2 * math.pi end
end

-- PX's PhysicsThink, a frame: the move traced with the ball's circle, a hit
-- turned into bounce along the surface's normal and friction along it, then
-- PX's inertia (a share of the speed's last change again), the low-speed
-- state and sleep. The ball's place is b.x, b.y; the actor only draws it.
-- Returns the speed the frame started with, which the hits below go by.
local function think(b)
  if b.asleep then
    -- No real speed asleep, as PX's: it stops turning too.
    b.x, b.y = b.sleep_x, b.sleep_y
    b.rvx, b.rvy = 0, 0
    return 0
  end
  local speed = math.sqrt(b.rvx * b.rvx + b.rvy * b.rvy)
  local vx2, vy2 = b.vx, b.vy + wa.world.gravity() / P
  local bounce, friction, ix, iy = BOUNCE, FRICTION, INERTIA_X, INERTIA_Y
  if b.low then
    bounce, friction, ix, iy = LOW_BOUNCE, LOW_FRICTION, LOW_INERTIA_X, LOW_INERTIA_Y
  elseif b.zapped then
    friction = ZAPPED_FRICTION
  end
  if vx2 == 0 and vy2 == 0 then vy2 = b.vy + 0.1 end
  local with = speed > FAST and SOLID_FAST or SOLID
  local x, y = b.x, b.y
  local dx, dy = trunc(vx2 * P), trunc(vy2 * P)
  if math.abs(x + dx) > EDGE or math.abs(y + dy) > EDGE then
    b.gone = true
    return 0
  end
  local function trace_from(sx, sy, k)
    -- Eight moves backwards may not fit where one forward does: no trace.
    if math.abs(sx + k * dx) > EDGE or math.abs(sy + k * dy) > EDGE then return nil end
    return wa.world.trace({
      x0 = sx, y0 = sy, x1 = sx + k * dx, y1 = sy + k * dy, radius = RADIUS, with = with,
    })
  end
  local res = trace_from(x, y, 1)
  if res and res.starts_solid then
    -- Stuck in something (another ball can push it in): carry on from where
    -- the path comes free; else, as PX's unblocking, back out along the move
    -- eight times its length and come forward from there; else sleep where
    -- it is, as PX does.
    if not res.left_x then
      res = trace_from(x, y, -8)
      if not (res and res.left_x) then
        sleep(b)
        return 0
      end
    end
    x, y = res.left_x, res.left_y
    res = trace_from(x, y, 1)
  end
  if res and res.hit then
    local spt = vx2 * res.tx + vy2 * res.ty
    local spn = vx2 * res.nx + vy2 * res.ny
    b.vx = vx2 - spn * res.nx * (bounce + 1) - spt * res.tx * friction
    b.vy = vy2 - spn * res.ny * (bounce + 1) - spt * res.ty * friction
    x, y = res.x, res.y
    -- Rest half a pixel off the surface, as PX's ball does (it stops a
    -- step short, up to a pixel): touching it, a ball gliding along would
    -- hit it at once every frame and stand still at speed.
    local lx, ly = x + trunc(res.nx * LIFT), y + trunc(res.ny * LIFT)
    local lift = wa.world.trace({ x0 = x, y0 = y, x1 = lx, y1 = ly, radius = RADIUS, with = with })
    if not (lift and (lift.hit or lift.starts_solid)) then x, y = lx, ly end
  else
    b.vx, b.vy = vx2, vy2
    x, y = x + trunc(vx2 * P), y + trunc(vy2 * P)
  end
  b.vx = b.vx + ix * (b.vx - b.lvx)
  b.vy = b.vy + iy * (b.vy - b.lvy)
  b.lvx, b.lvy = b.vx, b.vy
  b.rvx, b.rvy = (x - b.lx) / P, (y - b.ly) / P
  b.lx, b.ly = x, y
  b.x, b.y = x, y
  -- Slow for long enough: low speed, no inertia, so it settles.
  if speed < LOW_SPEED then
    b.low_timer = b.low_timer - 1
    if b.low_timer <= 0 then b.low, b.low_timer = true, LOW_FRAMES end
  else
    b.low, b.low_timer = false, LOW_FRAMES
  end
  b.sleep_timer = b.sleep_timer - 1
  if b.sleep_timer <= 0 then
    local dx, dy = (x - b.rec_x) / P, (y - b.rec_y) / P
    if math.sqrt(dx * dx + dy * dy) < SLEEP_DISTANCE then sleep(b) end
    b.sleep_timer, b.rec_x, b.rec_y = SLEEP_PERIOD, x, y
  end
  return speed
end

shared.bowling_balls = {} -- actor id -> ball

-- Frames counted by the oldest ball still rolling: the worms' 12-frame
-- recovery needs a clock, and only balls hit.
local clock, clock_ball = 0, nil
local recover = {} -- worm id -> clock at which it can be hurt again

local function tick(id)
  if clock_ball == nil or not shared.bowling_balls[clock_ball] then clock_ball = id end
  if clock_ball == id then clock = clock + 1 end
end

local function overlaps(b, obj)
  local dx, dy = (obj.x - b.x) / P, (obj.y - b.y) / P
  local r = RADIUS + target_radius(obj) + TOUCH
  return dx * dx + dy * dy <= r * r
end

-- PX's ProcessBallOnBallCollision: every other ball this one overlaps is
-- pushed away from it, and wakes.
local function push_balls(id, b, speed)
  local push = PUSH_FORCE * math.sqrt(speed)
  for other_id, o in pairs(shared.bowling_balls) do
    if other_id ~= id then
      local dx, dy = (o.x - b.x) / P, (o.y - b.y) / P
      local d2 = dx * dx + dy * dy
      if d2 > 0 and d2 <= (2 * RADIUS) * (2 * RADIUS) then
        local d = math.sqrt(d2)
        wake(o)
        o.vx = o.vx + PUSH_KEEP * push * dx / d
        o.vy = o.vy + PUSH_KEEP * push * dy / d
      end
    end
  end
end

-- A standing worm hit from above, straight down, is crushed (PX's
-- "crushable" states, the ones a worm stands in).
local CRUSHABLE = { standing = true, firing = true, fired = true, prefiring = true }

-- PX's ProcessBallOnOtherCollision: the hit's damage from the ball's speed,
-- and its push from how the ball really moved this frame.
local function hit_others(a, b, speed)
  local dmg = MIN_DAMAGE + (MAX_DAMAGE - MIN_DAMAGE)
    * (math.min(speed, MAX_DAMAGE_SPEED) - FAST) / (MAX_DAMAGE_SPEED - FAST)
  local function hit(obj)
    if not overlaps(b, obj) then return end
    local damage = 0
    if obj.kind == "worm" then
      if obj.hp <= 0 or (recover[obj.id] or 0) > clock then return end
      damage = dmg
      recover[obj.id] = clock + RECOVER_FRAMES
    elseif obj.kind == "crate" or obj.kind == "oil" then
      damage = OBJECT_DAMAGE
    else
      damage = dmg
    end
    damage = trunc(damage)
    if damage <= 0 then return end
    local fx, fy = b.rvx, b.rvy
    local ax = math.abs(fx)
    local crushed = obj.kind == "worm" and CRUSHABLE[obj.state] and fy > FAST and ax / fy < 0.2
    if crushed then
      fx, fy = 0, 10
    else
      fy = fy < 0 and fy - ax or fy - 2 * ax
      fx, fy = fx * DAMAGE_FORCE, fy * DAMAGE_FORCE
    end
    if obj.kind == "worm" then
      obj:hurt({ amount = damage, vx = trunc(fx * P), vy = trunc(fy * P) })
    else
      obj:hit(damage, trunc(fx * P), trunc(fy * P))
    end
    a:sound(crushed and SOUND_CRUSH or SOUND_HIT)
  end
  for _, group in ipairs({ wa.worms, wa.mines, wa.crates, wa.oil }) do
    for _, obj in ipairs(group.all() or {}) do hit(obj) end
  end
end

-- The balls by id, in id order: whatever draws from WA's RNG for them does
-- so in the same order on every machine.
local function balls_in_order()
  local ids = {}
  for id in pairs(shared.bowling_balls) do ids[#ids + 1] = id end
  table.sort(ids)
  return ids
end

-- PX's Zap: Zap(0) electrifies (mul 1), Zap(1), for a ball already
-- electrified, throws it at 0.8 and changes nothing else.
local function zap(b, mul)
  if not b.zapped then b.spark, b.trail, b.seed = 0, {}, b.trail_seed end
  b.zapped = true
  wake(b)
  local ang = (wa.random(0, 2000) - 1000) / 10000
  local speed = (5 + wa.random(0, 1000) / 200) * (mul or 1)
  -- sin and cos by their series: |ang| <= 0.1, so exact to 1e-7, and no
  -- trig in the simulation.
  local a2 = ang * ang
  b.vx = (ang - ang * a2 / 6) * speed
  b.vy = -(1 - a2 / 2 + a2 * a2 / 24) * speed
end

-- The Lightning Strike: every ball within reach of where it hit.
-- PX's Ferret flicks a ball as it flicks a mine (the ball is one): a ball
-- whose circle touches the Ferret's, radius \`reach\` at (x, y), wakes and is
-- thrown at (vx, vy), pixels a frame. Balls in id order.
shared.kick_bowling_balls = function(x, y, reach, vx, vy)
  local r = reach + RADIUS
  for _, id in ipairs(balls_in_order()) do
    local b = shared.bowling_balls[id]
    local dx, dy = (b.x - x) / P, (b.y - y) / P
    if dx * dx + dy * dy <= r * r then
      wake(b)
      b.vx, b.vy = vx, vy
    end
  end
end

-- PX's magnet (CMagnet::ApplyForce): a ball in its field gets its push
-- (16.16; the ball's speed is in pixels a frame). A sleeping ball is left
-- alone unless \`waking\` (the magnet moving, discharging or exploding).
shared.magnet_bowling_balls = function(force, waking)
  for _, id in ipairs(balls_in_order()) do
    local b = shared.bowling_balls[id]
    local dx, dy = force(b.x, b.y)
    if dx and (waking or not b.asleep) then
      if waking then wake(b) end
      b.vx = b.vx + dx / P
      b.vy = b.vy + dy / P
    end
  end
end

shared.zap_bowling_balls = function(x, y)
  local reach = (ZAP_REACH + RADIUS) * (ZAP_REACH + RADIUS)
  for _, id in ipairs(balls_in_order()) do
    local b = shared.bowling_balls[id]
    local dx, dy = (b.x - x) / P, (b.y - y) / P
    if dx * dx + dy * dy <= reach then zap(b) end
  end
end

-- The Electric Grenade's arc (PX's Tazer, whose targets include the ball):
-- the balls as targets, at the middle of the drawn ball, in id order.
local function as_target(id, b)
  return { kind = "ball", id = id, x = b.x, y = b.y + SPRITE_DROP * P,
    alliance = b.alliance, moving = b.vx ~= 0 or b.vy ~= 0 }
end

-- The Sentry Laser's disintegration (PX: Sleep, then Free): gone at once,
-- its actor at its next frame.
shared.remove_bowling_ball = function(id)
  local b = shared.bowling_balls[id]
  if not b then return end
  sleep(b)
  b.gone = true
  shared.bowling_balls[id] = nil
end

shared.bowling_ball_targets = function()
  local out = {}
  for _, id in ipairs(balls_in_order()) do out[#out + 1] = as_target(id, shared.bowling_balls[id]) end
  return out
end

shared.bowling_ball_target = function(id)
  local b = shared.bowling_balls[id]
  return b and as_target(id, b)
end

-- The arc's zap (PX's CTazerDamage::Zap): Zap(0) the first time, Zap(1)
-- once electrified. No damage, no push besides.
shared.zap_bowling_ball = function(id)
  local b = shared.bowling_balls[id]
  if b then zap(b, b.zapped and 0.8 or 1) end
end

-- Where a beam from (x0, y0) along the unit (dx, dy), at most len pixels,
-- first meets a ball's circle (PX's ball is an oil drum to the strike's
-- trace), or nil.
shared.bowling_ball_on_beam = function(x0, y0, dx, dy, len)
  local best
  for _, id in ipairs(balls_in_order()) do
    local b = shared.bowling_balls[id]
    local cx, cy = (b.x - x0) / P, (b.y - y0) / P
    local along = cx * dx + cy * dy
    local miss = cx * cx + cy * cy - along * along
    if miss <= RADIUS * RADIUS then
      local t = along - math.sqrt(RADIUS * RADIUS - miss)
      if t > 0 and t < len and (not best or t < best) then best = t end
    end
  end
  if best then return x0 + trunc(best * dx * P), y0 + trunc(best * dy * P) end
end

-- The electrified look, a game frame on: the spark's cycle, and the trail
-- left behind, from the ball's own generator (looks only: nothing reads it,
-- and WA's RNG is not drawn).
local function electrified_frame(b)
  b.spark = b.spark + SPARK_SPEED
  if b.spark > SPARK_CYCLE then b.spark = b.spark - SPARK_CYCLE end
  for i = #b.trail, 1, -1 do
    local p = b.trail[i]
    p.age = p.age + 1
    if p.age >= TRAIL_LIFE then
      table.remove(b.trail, i)
    else
      p.x, p.y = p.x + p.vx, p.y + p.vy
    end
  end
  if not b.asleep then
    b.seed = (b.seed * 1103515245 + 12345) % 0x80000000
    local a = b.seed / 0x80000000 * 2 * math.pi
    b.seed = (b.seed * 1103515245 + 12345) % 0x80000000
    local v = b.seed / 0x80000000 * 0.3 * P
    b.trail[#b.trail + 1] = { x = b.x, y = b.y, vx = math.cos(a) * v, vy = math.sin(a) * v, age = 0 }
  end
end

local function take_hit(b, hit)
  wake(b)
  local k = hit.kind == "blast" and BLAST_FORCE or GUN_FORCE
  b.vx = b.vx + k * hit.vx / P
  b.vy = b.vy + k * hit.vy / P
end

local function spawn_ball(owner, x, y, vx, vy)
  local b = {
    x = x, y = y, vx = vx, vy = vy, lvx = vx, lvy = vy, rvx = 0, rvy = 0, lx = x, ly = y,
    rot = 0, low = false, low_timer = 200, sleep_timer = 200, rec_x = x, rec_y = y,
    asleep = false, alliance = owner and owner.alliance,
  }
  local a = wa.actors.spawn({
    sprite = SHEET, x = x, y = y + SPRITE_DROP * P, gravity = false, collide = false, owner = owner,
    as_object = true,
    on = {
      hit = function(_, hit) take_hit(b, hit) end,
      frame = function(a)
        if b.gone then
          a:despawn()
          return
        end
        if b.y >= wa.world.water() then
          shared.bowling_balls[a.id] = nil
          a:despawn()
          return
        end
        tick(a.id)
        if b.zapped then electrified_frame(b) end
        spin(b)
        -- Before its Lua terrain sweep, using the actual ball centre and
        -- velocity rather than the display actor's deliberately zero speed.
        if shared.portals and next(shared.portals.pairs) then
          local proxy = {
            id = a.id, kind = "actor", x = b.x, y = b.y,
            vx = trunc(b.vx * P), vy = trunc(b.vy * P),
            fits = function(_, x, y)
              return not wa.world.collides({ x = x, y = y, radius = RADIUS, with = {"terrain"} })
            end,
            warp = function(_, spec)
              b.x, b.y, b.vx, b.vy = spec.x, spec.y, spec.vx / P, spec.vy / P
              wake(b)
              b.lvx, b.lvy, b.rvx, b.rvy = b.vx, b.vy, b.vx, b.vy
              a:warp({ x = b.x, y = b.y + SPRITE_DROP * P, vx = 0, vy = 0 })
              return true
            end,
          }
          shared.portals:move(proxy)
        end
        local speed = think(b)
        if b.gone then
          shared.bowling_balls[a.id] = nil
          a:despawn()
          return
        end
        if speed > PUSH_SPEED then push_balls(a.id, b, speed) end
        if speed > FAST then hit_others(a, b, speed) end
        a.x, a.y, a.vx, a.vy = b.x, b.y + SPRITE_DROP * P, 0, 0
        a:gfx({ angle = math.deg(b.rot) % 360, depth = BALL_DEPTH, tint = b.zapped and ZAPPED_TINT or 0xFFFFFF })
      end,
    },
  })
  shared.bowling_balls[a.id] = b
  b.trail_seed = a.id * 7919 % 0x80000000
  return a, b
end
shared.spawn_bowling_ball = spawn_ball

-- How far a ball dropped at y0 moving vx drifts sideways before its centre
-- falls to y1: think's flight through the air, gravity and PX's inertia,
-- frame by frame (no trig, the same on every machine).
local function drift(y0, y1, vx)
  local g = wa.world.gravity() / P
  if g <= 0 then return 0 end
  local x, y, vy, lvy = 0, y0, 0, 0
  for _ = 1, 3000 do
    if y >= y1 then break end
    local vy2 = vy + g
    x, y = x + trunc(vx * P), y + trunc(vy2 * P)
    vy = vy2 + INERTIA_Y * (vy2 - lvy)
    lvy = vy
  end
  return x
end

fires.bowling_strike = function(ev)
  local dir = (ev.vx or 0) < 0 and -1 or 1
  local y0 = STRIKE_Y * P
  local back = drift(y0, ev.y - RADIUS * P, STRIKE_SPEED * dir)
  for i = 1, STRIKE_BALLS do
    local offset = (i - (STRIKE_BALLS + 1) / 2) * STRIKE_SPACING
    spawn_ball(ev.worm, ev.x - back + math.floor(offset * P), y0, STRIKE_SPEED * dir, 0)
  end
end

if wa.on.draw and wa.draw.quad then
  -- One spec refilled for every quad (the engine copies it).
  local QUAD = { points = { { 0, 0 }, { 0, 0 }, { 0, 0 }, { 0, 0 } } }
  local function quad(sheet, frame, color, depth, x, y, half, rot)
    QUAD.sprite, QUAD.frame, QUAD.blend, QUAD.color, QUAD.depth = sheet, frame, "add", color, depth
    local c, s = math.cos(rot), math.sin(rot)
    local p = QUAD.points
    local function corner(i, dx, dy)
      p[i][1], p[i][2] = x + math.floor((dx * c - dy * s) * half), y + math.floor((dx * s + dy * c) * half)
    end
    corner(1, -1, -1)
    corner(2, 1, -1)
    corner(3, 1, 1)
    corner(4, -1, 1)
    wa.draw.quad(QUAD)
  end
  local function zap_color(k)
    return 0xFF000000 | (math.floor(ZAP_R * k) << 16) | (math.floor(ZAP_G * k) << 8) | math.floor(ZAP_B * k)
  end
  local FULL = zap_color(1)
  wa.on.draw(function()
    for _, id in ipairs(balls_in_order()) do
      local b = shared.bowling_balls[id]
      if b.zapped then
        local drop = SPRITE_DROP * P
        for _, t in ipairs(b.trail) do
          local k = t.age / TRAIL_LIFE
          quad(GLOW_SHEET, 0, zap_color(1 - k), GLOW_DEPTH, t.x, t.y + drop, (0.3 + 0.2 * k) * GLOW_SIZE / 2 * P, 0)
        end
        local x, y = b.x, b.y + drop
        local glow = (0.3 + 0.1 * wa.draw.random()) * GLOW_SIZE / 2 * P
        for _ = 1, 3 do quad(GLOW_SHEET, 0, FULL, GLOW_DEPTH, x, y, glow, 0) end
        quad(SHEEN_SHEET, 0, SHEEN_COLOR, SHEEN_DEPTH, x, y, SPARK_SIZE / 2 * P, b.rot)
        if b.spark <= 1 then
          local frame = math.min(SPARK_FRAMES - 1, math.floor(b.spark * SPARK_FRAMES))
          quad(SPARK_SHEET, frame, 0xFFFFFFFF, SPARK_DEPTH, x, y, SPARK_SIZE / 2 * P, b.rot)
        end
      end
    end
  end)
end

-- Live adapter identities for the portal return-cache cleanup.
shared.portal_bowling_balls = function()
  local out = {}
  for _, id in ipairs(balls_in_order()) do out[#out + 1] = { id = id } end
  return out
end
`
      },
      {
        path: 'weapons/catalog.lua',
        name: 'weapons/catalog.lua',
        language: 'lua',
        content: `-- Highlander: the claimed weapons and their art. Split from rules.lua by tools/split_highlander.py.
local shared = require("lib/shared")
local PX_POSTURE = shared.PX_POSTURE

-- Filled in by the Double Bazooka's and Nuke Rocket's sections further down.
-- Weapons' on_fire, filled in by their sections below (jump, laser); one
-- table, the file being at Lua's 200 locals for one chunk.
local fires = {}
-- Ported weapons. Each takes its scheme record, cut from the .pxs with
-- tools/px_scheme_weps.py: how it fires, and its PX name. Anything else in an
-- entry goes to wa.weapons.replace as it is.
--
-- WA's own weapons, as PX tuned them for this scheme. One moved off its own
-- stock slot borrows its own stock icon.
local PORTED = {
  { -- PX's Skip Go/Surrender: stock Skip Go, or stock Surrender with Ctrl.
    weapon = "skip_go", name = "Skip Go/Surrender",
    panel_icon = "sprites/skip_go/icon.png",
    stock_fire_choice = { held = "ctrl", alternate = "surrender" },
  },
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
  { weapon = "ming_vase" },                                    -- Priceless Ming Vase
}

-- PX weapons that need only PX's art: its icons, copied byte for byte so
-- replays share them, and its strips split into frame folders with
-- tools/px_split_strip.py. Where PX draws the worm's hold at run time with
-- its sprite builder (p_sprite_builder), so does the engine from PX_HOLDS.
local PX_ART = {
  { -- Ice Arrow: WA's own ArrowEntity supplies its flight and bow impact.
    -- The Highlander script freezes only a worm hit by this slot's arrow.
    weapon = "armageddon", wep = "weps/armageddon.wep",
    panel_icon = "sprites/ice_arrow/icon.png",
  },
  { -- Reinforcement: PX's new worm for the team (weapons/reinforcement.lua),
    -- on Nuclear Test's slot. Click-only, as the Super Tele.
    weapon = "nuclear_test", wep = "weps/nuclear_test.wep",
    panel_icon = "sprites/reinforcement/icon.png",
    on_select = { cursor = true },
    on_click = function(ev) fires.reinforcement(ev) end,
  },
  { -- Portal Gun: custom bolts and per-team pairs, on Scales of Justice.
    weapon = "scales_of_justice", wep = "weps/scales_of_justice.wep",
    panel_icon = "sprites/portal_gun/icon.png",
    -- The native shot remains usable while Lua accounts for pairs. PX's
    -- CanFire/state hacks are replaced by uses_turn=0 and worm:air_fire.
    patch = { uses_turn = 0, hold_pose = 3 },
    worm_sprites = {
      weaponlnk = "sprites/portal_gun/portal_gun_normal",
      weaponlnku = "sprites/portal_gun/portal_gun_up",
      weaponlnkd = "sprites/portal_gun/portal_gun_down",
      wthrow = "sprites/portal_gun/portal_gun_link_normal",
      wthrowu = "sprites/portal_gun/portal_gun_link_up",
      wthrowd = "sprites/portal_gun/portal_gun_link_down",
    },
    sprites = {
      "sprites/portal_gun/portal_ball", "sprites/portal_gun/portal_orange.png",
      "sprites/portal_gun/portal_blue.png", "sprites/portal_gun/portal_glow.png",
      "sprites/portal_gun/portal_gun_glow.png",
      "sprites/portal_gun/lightning_glow.png", "sprites/portal_gun/portal_black_mask",
    },
    sounds = { "sounds/portal_gun_shoot.wav", "sounds/portal_gun_hit.wav", "sounds/portal_gun_failhit.wav",
      "sounds/portal_active.wav", "sounds/portal_inactive.wav", "sounds/portal_teleport.wav" },
    params = { gpu_prefix = "sprites/portal_gun/" },
    on_fire = function(fire) fires.portal_gun(fire) end,
  },
  { -- Electromagnet: PX's placed, persistent field on the Baseball Bat slot.
    weapon = "baseball_bat", wep = "weps/baseball_bat.wep",
    panel_icon = "sprites/electromagnet/ico_magnet.png",
    -- WA takes it out and puts it away with the Dynamite's draw (334-336);
    -- PX swaps in the magnet's (CSpriteAnim::SetAnimEx): blue repelling,
    -- red once + switched the worm to attracting (the engine reads + as the
    -- module does, and plays the take-out again in the new colour).
    worm_sprites = {
      wdynlnk = "sprites/electromagnet/wmag2lnk",
      wdynlnku = "sprites/electromagnet/wmag2lnku",
      wdynlnkd = "sprites/electromagnet/wmag2lnkd",
    },
    worm_sprites_toggle = { key = "plus_key", worm_sprites = {
      wdynlnk = "sprites/electromagnet/wmaglnk",
      wdynlnku = "sprites/electromagnet/wmaglnku",
      wdynlnkd = "sprites/electromagnet/wmaglnkd",
    } },
    sprites = {
      "sprites/electromagnet/magnet.png", "sprites/electromagnet/magnet2.png",
      "sprites/electromagnet/magnet_damaged.png", "sprites/electromagnet/magnet2_damaged.png",
      "sprites/electromagnet/ring_in.png", "sprites/electromagnet/ring_out.png",
      "sprites/electromagnet/magnetsparks",
    },
    params = { gpu_prefix = "sprites/electromagnet/" },
    on_fire = function(fire) fires.electromagnet(fire) end,
  },
  { -- Sentry Gun: PX's turret (weapons/sentry_gun.lua, lib/turret.lua) on
    -- the Kamikaze slot, placed as WA places a mine: its timing, ammo and
    -- retreat, with the turret as a Lua body instead of a mine.
    weapon = "kamikaze", copy_from = "mine", name = "Sentry Gun",
    panel_icon = "sprites/sentry_gun/icon.png",
    is_weapon = true,
    -- PX's take-out and placing, grey; the housing in them coloured per team
    -- at draw time (one sheet and its housing for six colours).
    worm_sprites = {
      weaponlnk = "sprites/sentry_gun/equip", weaponlnku = "sprites/sentry_gun/equipu",
      weaponlnkd = "sprites/sentry_gun/equipd",
      wthrow = "sprites/sentry_gun/unequip", wthrowu = "sprites/sentry_gun/unequipu",
      wthrowd = "sprites/sentry_gun/unequipd",
    },
    worm_sprites_team_tint = {
      worm_sprites = {
        weaponlnk = "sprites/sentry_gun/equip_housing", weaponlnku = "sprites/sentry_gun/equipu_housing",
        weaponlnkd = "sprites/sentry_gun/equipd_housing",
        wthrow = "sprites/sentry_gun/unequip_housing", wthrowu = "sprites/sentry_gun/unequipu_housing",
        wthrowd = "sprites/sentry_gun/unequipd_housing",
      },
      colours = { 0xFF6447, 0x4764FF, 0x47FF64, 0xE6E647, 0xE647E6, 0x47E6E6 },
    },
    sprites = {
      "sprites/sentry_gun/impact.png", "sprites/sentry_gun/casing", "sprites/sentry_gun/turret_base",
      "sprites/sentry_gun/turret_gun", "sprites/sentry_gun/turret_flare",
    },
    sounds = {
      "sounds/sentry_gun/sentryplace.wav", "sounds/sentry_gun/sentrybeeps2.wav",
      "sounds/sentry_gun/sentryfireloop.wav", "sounds/sentry_gun/sentryfireend.wav",
      "sounds/sentry_gun/sentryservostart.wav", "sounds/sentry_gun/sentryservoloop.wav",
      "sounds/sentry_gun/sentryservoend.wav",
    },
    params = {
      sprite_columns = 1,
      -- The take-out and placing play frame by frame, not as aim sheets.
      worm_sprites_animate = true,
      -- The turret between terrain (0x180000) and soil (0x1B0000): the
      -- landscape hides its sunk feet. The worm's sheets stay in front.
      depth = 0x190000,
      depth_prefix = "sprites/sentry_gun/turret_",
      gpu_prefix = "sprites/sentry_gun/turret_",
    },
    on_fire = function(fire) fires.sentry_gun(fire) end,
  },
  { -- Sentry Laser: PX's projectile-defence turret (weapons/sentry_laser.lua,
    -- lib/turret.lua) on the Dragon Ball slot, placed as the Sentry Gun.
    weapon = "dragon_ball", copy_from = "mine", name = "Sentry Laser",
    panel_icon = "sprites/sentry_laser/icon.png",
    is_weapon = true,
    worm_sprites = {
      weaponlnk = "sprites/sentry_laser/equip", weaponlnku = "sprites/sentry_laser/equipu",
      weaponlnkd = "sprites/sentry_laser/equipd",
      wthrow = "sprites/sentry_laser/unequip", wthrowu = "sprites/sentry_laser/unequipu",
      wthrowd = "sprites/sentry_laser/unequipd",
    },
    -- The body coloured per team, as on the planted turret; its barrel stays grey.
    worm_sprites_team_tint = {
      worm_sprites = {
        weaponlnk = "sprites/sentry_laser/equip_housing", weaponlnku = "sprites/sentry_laser/equipu_housing",
        weaponlnkd = "sprites/sentry_laser/equipd_housing",
        wthrow = "sprites/sentry_laser/unequip_housing", wthrowu = "sprites/sentry_laser/unequipu_housing",
        wthrowd = "sprites/sentry_laser/unequipd_housing",
      },
      colours = { 0xFF6447, 0x4764FF, 0x47FF64, 0xE6E647, 0xE647E6, 0x47E6E6 },
    },
    sprites = {
      "sprites/sentry_laser/turret_base", "sprites/sentry_laser/turret_body",
      "sprites/sentry_laser/turret_barrel",
    },
    sounds = {
      "sounds/sentry_laser/sentrylaserplace.wav", "sounds/sentry_laser/sentrylaserbeep.wav",
      "sounds/sentry_laser/sentrylaserstart.wav", "sounds/sentry_laser/sentrylaserloop.wav",
      "sounds/sentry_laser/sentrylaserend.wav", "sounds/sentry_laser/sentrylaserdisin.wav",
    },
    params = {
      sprite_columns = 1,
      worm_sprites_animate = true,
      depth = 0x190000,
      depth_prefix = "sprites/sentry_laser/turret_",
      gpu_prefix = "sprites/sentry_laser/turret_",
    },
    on_fire = function(fire) fires.sentry_laser(fire) end,
  },
  { -- Kamikaze Rocket: PX's steered Kamikaze (weapons/kamikaze_rocket.lua) on
    -- the Suicide Bomber slot. Its record is WA's Kamikaze's, so WA flies,
    -- digs and hits as its own Kamikaze; the pack steers it.
    weapon = "suicide_bomber", wep = "weps/suicide_bomber.wep",
    panel_icon = "sprites/kamikaze_rocket/icon.png",
    -- The Kamikaze's take-out (its last frame the hold) and launch, PX's.
    worm_sprites = {
      wkamlnk = "sprites/kamikaze_rocket/take_out", wkamlnku = "sprites/kamikaze_rocket/take_out",
      wkamlnkd = "sprites/kamikaze_rocket/take_out", wkamjmp = "sprites/kamikaze_rocket/launch",
    },
    sprites = { "sprites/kamikaze_rocket/fly" },
    params = { gpu_prefix = "sprites/kamikaze_rocket/" },
  },
  { -- Weapon Crate: a weapon crate dropped in front of the worm
    -- (weapons/weapon_crate.lua) on the Freeze slot, placed as WA places a
    -- mine (PX's record), the crate instead of the mine.
    weapon = "freeze", wep = "weps/freeze.wep",
    panel_icon = "sprites/weapon_crate/icon.png",
    -- PX's take-out (picking the crate up) and its hold.
    worm_sprites = {
      weaponlnk = "sprites/weapon_crate/take_out", weaponlnku = "sprites/weapon_crate/take_outu",
      weaponlnkd = "sprites/weapon_crate/take_outd",
      wthrow = "sprites/weapon_crate/put_away", wthrowu = "sprites/weapon_crate/put_awayu",
      wthrowd = "sprites/weapon_crate/put_awayd",
    },
    params = { worm_sprites_animate = true },
    on_fire = function(fire) fires.weapon_crate(fire) end,
  },
  { -- Super Tele: the PX record is a type-3 cursor weapon on teleport's slot.
    weapon = "teleport",
    wep = "weps/teleport.wep",
    panel_icon = "sprites/super_tele/icon.png",
    on_select = { cursor = true },
    on_click = function(ev) fires.super_tele_click(ev) end,
  },
  { -- Javelin: stock flight, direct thrust or a permanent terrain stamp.
    weapon = "prod", wep = "weps/prod.wep",
    panel_icon = "sprites/javelin/icon.png",
    sprite = "missile", worm_sprites = PX_POSTURE,
    sprites = { "sprites/javelin/hold", "sprites/javelin/flight", "sprites/javelin/stamp" },
    sounds = { "sounds/javelin_impact.wav" },
    params = { gpu_prefix = "sprites/javelin/" },
    on_explode = function(ev) fires.javelin(ev) end,
  },
  { -- Laser Gun: a 5 s beam in place of the uzi's bullet (its section below).
    weapon = "uzi",
    wep = "weps/uzi.wep",
    panel_icon = "sprites/laser_gun/ico_lasergun.png",
    worm_sprites = {
      weaponlnk = "sprites/laser_gun/aim", weaponlnku = "sprites/laser_gun/aimu",
      weaponlnkd = "sprites/laser_gun/aimd",
      wthrow = "sprites/laser_gun/draw", wthrowu = "sprites/laser_gun/drawu",
      wthrowd = "sprites/laser_gun/drawd",
    },
    sprites = { "sprites/laser_gun/laser_beam.png", "sprites/laser_gun/laser_glow.png" },
    sounds = {
      "sounds/laser_gun/laser_start.wav", "sounds/laser_gun/laser_loop.wav",
      "sounds/laser_gun/laser_end.wav",
    },
    params = { gpu_prefix = "sprites/laser_gun/" },
    on_fire = function(fire) fires.laser(fire) end,
  },
  { -- Electric Grenade: stock flight and explosion, then PX's chaining arc.
    -- PX's record leaves the flight sprite 0 and PX draws the grenade at run
    -- time (electric_grenade_anim, PX_WEAP_SPRITES below). A grenade-type
    -- slot picks the worm's throw sheet from its flight sprite, and 0 has
    -- none, so the worm vanished: here the stock grenade, hidden in flight,
    -- as for the Sticky Bomb. The arc's sheets come with the Lightning
    -- Strike's (its entry below), this prefix being the hold's.
    weapon = "earthquake",
    wep = "weps/earthquake.wep",
    panel_icon = "sprites/electric_grenade/icon.png",
    sprite = "grenade",
    worm_sprites = PX_POSTURE,
    sprites = { "sprites/px_hold/electric_grenade.png" },
    sounds = { "sounds/lightning/tazer_loop.wav" },
    params = { gpu_prefix = "sprites/px_hold/" },
    on_explode = function(ev) shared.electric_grenade_explode(ev) end,
  },
  { -- Valyrian Fire (rafa\`\`2's valyrianfire_s): a Petrol Bomb with PX's
    -- bottle in the hand and spinning in flight (PX_WEAP_SPRITES), thrown
    -- 15 pixels further out. PX's record leaves the flight sprite 0, as the
    -- Electric Grenade's: here the stock bottle, for the worm's throw sheet,
    -- hidden in flight.
    weapon = "petrol_bomb",
    wep = "weps/petrol_bomb.wep",
    panel_icon = "sprites/valyrian_fire/icon.png",
    sprite = "petrolbm",
    worm_sprites = PX_POSTURE,
    sprites = { "sprites/px_hold/valyrian_fire.png" },
    params = { gpu_prefix = "sprites/px_hold/" },
    on_fire = function(fire) fires.valyrian_fire(fire) end,
    on_explode = function(ev) fires.valyrian_burst(ev) end,
  },
  { -- Bowling Ball Strike: PX's three rolling balls (weapons/bowling_ball.lua),
    -- not WA's sheep. Click-only, as the Lightning Strike: the engine ends
    -- WA's prefire after the click.
    weapon = "sheep_strike",
    wep = "weps/sheep_strike.wep",
    panel_icon = "sprites/bowling_ball/strike_icon.png",
    sprites = { "sprites/bowling_ball/ball.png", "sprites/bowling_ball/glow.png", "sprites/bowling_ball/spark.png",
      "sprites/bowling_ball/sheen.png" },
    params = { gpu_prefix = "sprites/bowling_ball/" },
    on_select = { cursor = true },
    on_click = function(ev) fires.bowling_strike(ev) end,
  },
  { -- Ferret: PX's terrain-walking ferret (weapons/ferret.lua), thrown in
    -- place of WA's Salvation Army.
    weapon = "salvation_army",
    wep = "weps/salvation_army.wep",
    panel_icon = "sprites/ferret/icon.png",
    worm_sprites = PX_POSTURE,
    sprites = { "sprites/ferret/walk" },
    sounds = { "sounds/ferret/walk.wav" },
    params = { gpu_prefix = "sprites/ferret/" },
    on_fire = function(fire) fires.ferret(fire) end,
  },
  { -- Crate Strike: PX's three parachute crates (weapons/crate_strike.lua),
    -- not WA's donkey. Click-only, as the Lightning Strike.
    weapon = "donkey",
    wep = "weps/donkey.wep",
    panel_icon = "sprites/crate_strike/icon.png",
    on_select = { cursor = true },
    on_click = function(ev) fires.crate_strike(ev) end,
  },
  { -- Lightning Strike: the PX strike is an effect, not WA's napalm plane.
    weapon = "napalm_strike",
    wep = "weps/napalm_strike.wep",
    panel_icon = "sprites/lightning/icon.png",
    -- With the Electric Grenade's arc and zap sheets: both weapons' effects
    -- are GPU sheets under this prefix.
    sprites = {
      "sprites/lightning/beam.png", "sprites/lightning/glow.png", "sprites/lightning/cloud.png",
      "sprites/electric_grenade/explosion", "sprites/electric_grenade/tazed1",
      "sprites/electric_grenade/tazed2",
    },
    sounds = { "sounds/lightning/thunder.wav", "sounds/lightning/hit.wav" },
    params = { gpu_prefix = "sprites/" },
    -- Click-only dispatch keeps the strike's cursor and turn handling.
    on_select = { cursor = true },
    -- The engine ends WA's prefire after a click-only fire. (A closure:
    -- lightning_click is defined further down.)
    on_click = function(ev) shared.lightning_click(ev) end,
  },
  { -- Double Bazooka: a second shell carries on from where the first
    -- explodes (its section below). Held as a plain bazooka: the pack's
    -- record has launcher 3 (wbaz) at +0x34 where the scheme's has 7, the
    -- homing missile's recoloured wbaz2 (Weapon__hold_sheet, 0x51C060).
    weapon = "bazooka",
    panel_icon = "sprites/double_bazooka/double_bazooka_ico.png",
    on_explode = function(ev) shared.double_bazooka_explode(ev) end,
  },
  { -- Nuke Rocket: a rocket fuses on the ground, then a nuke climbs out of
    -- it (its section below). PX draws both upright (a type 5 WeapSprite,
    -- mirrored flying left), as WA draws a flight sprite.
    weapon = "mine",
    panel_icon = "sprites/nuke_rocket/nuke_rocket_ico.png",
    sprite = "sprites/nuke_rocket/nuke_rocket_bullet.png",
    on_explode = function(ev) shared.nuke_rocket_explode(ev) end,
    -- The engine draws its PX sprite-builder hold from PX_HOLDS:
    -- the record's own sprite is PX-only, which left WA no sheet to draw
    -- the worm with.
    worm_sprites = PX_POSTURE,
    sprites = {
      "sprites/px_hold/nuke_rocket",
    },
    sounds = { "sounds/nuke_rocket_launch.wav" },
    params = { gpu_prefix = "sprites/px_hold/" },
  },
  { -- Burning Sheep Launcher
    weapon = "sheep_launcher",
    panel_icon = "sprites/launchers/burning_sheep_launcher_ico.png",
  },
  { -- Cow Launcher
    weapon = "mad_cow",
    panel_icon = "sprites/launchers/cow_launcher_ico.png",
  },
  { -- Old Woman Launcher: WA's animal launched from a clear muzzle point.
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
  { -- Igniter: PX sets the missile's own sprite to 0 and draws its bullet at
    -- run time, animated and turned to its flight (PX_WEAP_SPRITES below).
    -- WA still draws its homing missile's rocket under it for now.
    weapon = "homing_missile",
    panel_icon = "sprites/igniter/igniter_ico.png",
    worm_sprites = PX_POSTURE,
    sprites = {
      "sprites/px_hold/igniter", "sprites/igniter/flight",
    },
    params = { gpu_prefix = "sprites/" },
  },
  { -- Chilli Bomb: five more Chillis burst out of it, which burst into fire
    -- (its section below). PX's record has sprite 0 and PX draws the chilli
    -- at run time, turned to its flight (PX_WEAP_SPRITES below). A thrown
    -- weapon's worm posture is picked by its sprite, so the record keeps the
    -- banana, and each missile's own copy is set to 0 in flight instead.
    weapon = "super_banana",
    panel_icon = "sprites/chilli_bomb/chilli_ico.png",
    sprite = "banana",
    on_explode = function(ev) shared.chilli_bomb_explode(ev) end,
    worm_sprites = PX_POSTURE,
    sprites = { "sprites/px_hold/chilli_bomb" },
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
    sprites = { "sprites/px_hold/sticky_bomb" },
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
  { -- Hot Air Balloon: WA's parachute, carried up by PX's script (below).
    weapon = "bungee",
    panel_icon = "sprites/balloon/balloon_icon.png",
    sprites = { "sprites/balloon/balloon", "sprites/balloon/basket" },
    -- A pack WAV plays only once an entry registers it.
    sounds = {
      "sounds/balloon/inflate1.wav", "sounds/balloon/inflate2.wav", "sounds/balloon/inflate3.wav",
      "sounds/balloon/pop1.wav", "sounds/balloon/pop2.wav", "sounds/balloon/pop3.wav",
      "sounds/balloon/pop4.wav",
    },
    params = { gpu_prefix = "sprites/balloon/" },
  },
  { -- Hang-Glider: WA's parachute, flown as PX's glider (below).
    weapon = "parachute",
    panel_icon = "sprites/hang_glider/ico_glider.png",
    sprites = { "sprites/hang_glider/glider", "sprites/hang_glider/pack" },
    sounds = { "sounds/hang_glider/hangopen.wav", "sounds/hang_glider/hangclose.wav" },
    params = { gpu_prefix = "sprites/hang_glider/" },
  },
  { -- Swim Suit: on the laser sight's slot; worn, the worm swims (below).
    weapon = "laser_sight",
    panel_icon = "sprites/swim_suit/ico_swimsuit.png",
    sprites = { "sprites/swim_suit/swim", "sprites/swim_suit/float", "sprites/swim_suit/ring" },
    sounds = { "sounds/swim_suit/putting_on_ssuit.wav" },
    params = { gpu_prefix = "sprites/swim_suit/" },
  },
  { -- Jump: on the ninja rope's slot; the worm leaves with the shot (below).
    weapon = "ninja_rope",
    panel_icon = "sprites/jump/jumpic.png",
    worm_sprites = {
      weaponlnk = "sprites/jump/aim", weaponlnku = "sprites/jump/aimu",
      weaponlnkd = "sprites/jump/aimd",
    },
    on_fire = function(fire) fires.jump(fire) end,
  },
  { -- Wind Changer: on the surrender's slot; sets the wind (below).
    weapon = "surrender",
    panel_icon = "sprites/wind_changer/ico_windchanger.png",
    sounds = {
      "sounds/wind_changer/breeze.wav", "sounds/wind_changer/calm_wind.wav",
      "sounds/wind_changer/strong_wind.wav",
    },
  },
  { -- Gravity Control: on low gravity's slot; sets the gravity (below).
    weapon = "low_gravity",
    panel_icon = "sprites/gravity_control/gravity_control_ico.png",
    sounds = { "sounds/gravity_control/activate.wav", "sounds/gravity_control/error.wav" },
  },
  { -- Helicopter: WA's jet pack, flown by PX's script (below).
    weapon = "jet_pack",
    panel_icon = "sprites/helicopter/heli_ico.png",
    sprites = { "sprites/helicopter/flying", "sprites/helicopter/jumpin" },
    sounds = {
      "sounds/helicopter/helicopterloop.wav",
      "sounds/helicopter/1.wav", "sounds/helicopter/2.wav", "sounds/helicopter/3.wav",
      "sounds/helicopter/4.wav",
      "sounds/helicopter/oops1.wav", "sounds/helicopter/oops2.wav", "sounds/helicopter/huh.wav",
      "sounds/helicopter/poop.wav", "sounds/helicopter/idiot.wav",
    },
    params = { gpu_prefix = "sprites/helicopter/" },
  },
  { -- Sniper Rifle: the hold drawn at run time, PX's laser sight while aiming
    -- and its own shot (below). Firing, the worm takes the snipefire poses
    -- the scheme's record names (lit by the muzzle), not WA's handgun, and
    -- the hold and laser stay up over them (PX_HOLDS).
    weapon = "handgun",
    panel_icon = "sprites/sniper_rifle/srico.png",
    worm_sprites = {
      weaponlnk = PX_POSTURE.weaponlnk, weaponlnku = PX_POSTURE.weaponlnku,
      weaponlnkd = PX_POSTURE.weaponlnkd,
      wthrow = PX_POSTURE.wthrow, wthrowu = PX_POSTURE.wthrowu, wthrowd = PX_POSTURE.wthrowd,
      weaponfire = "sprites/sniper_rifle/fire", weaponfireu = "sprites/sniper_rifle/fireu",
      weaponfired = "sprites/sniper_rifle/fired",
    },
    sprites = {
      "sprites/px_hold/sniper_rifle", "sprites/sniper_rifle/laser", "sprites/sniper_rifle/flash",
    },
    sounds = { "sounds/sniper_firing.wav" },
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

shared.PORTED = PORTED
shared.PX_ART = PX_ART
shared.fires = fires
`
      },
      {
        path: 'weapons/chilli_bomb.lua',
        name: 'weapons/chilli_bomb.lua',
        language: 'lua',
        content: `-- Highlander: Chilli Bomb. Split from rules.lua by tools/split_highlander.py.
local shared = require("lib/shared")

-- ------------------------------------------------------------- Chilli Bomb
do
--
-- PX's pyro_grenades_script (PyroMan), on WA's super banana. When a Chilli
-- Bomb explodes, five more Chillis burst out of it, straight up with a
-- random spread (PX's ShotClustlets): real WA missiles of the same slot,
-- each with damage 30, an 8 s fuse, no countdown, the fire key setting it
-- off, and a burst of fire where it ends. The five do not burst again: a
-- missile PX's script makes has no weapon of its own (weap), so its
-- ExplodeAt skips the Chilli's branch.
--
-- Not ported: PX's particle trail and the sparks while aiming
-- (pxparticles), and the smoke trail's power of 20 on the five. PX also
-- writes the five's changes into the weapon's own launch data, so every
-- later Chilli Bomb flies with them; the port changes the five only.

local CHILLI_CHILD = { count = 5, damage = 30, fuse = 8000 }

local chilli_child = {}   -- missile id -> true: one of the five, which ends it
local chilli_pending = {} -- where the five burst out, once the blast is over
local chilli_shooter      -- the worm that threw it (PX's ClWT / ClWN)

shared.chilli_bomb_explode = function(ev)
  local id = ev.missile
  if not id then
    return
  end
  if chilli_child[id] then
    chilli_child[id] = nil
    return
  end
  chilli_pending[#chilli_pending + 1] = { x = ev.x, y = ev.y }
end

wa.on.worm_message(function(worm, msg)
  if msg == wa.msg.FIRE_WEAPON and worm.weapon == "super_banana" then
    chilli_shooter = worm
  elseif msg == wa.msg.FRAME_FINISH and #chilli_pending > 0 then
    -- After the blast, as the Double Bazooka's second shell.
    local P = 0x10000
    local owner = chilli_shooter or worm
    for _, p in ipairs(chilli_pending) do
      for _ = 1, CHILLI_CHILD.count do
        -- RandomFloat(3, -3), then RandomFloat(-7, -10).
        local vx = wa.random(-3 * P, 3 * P)
        local vy = wa.random(-10 * P, -7 * P)
        local id = wa.weapons.launch({
          weapon = "super_banana", owner = owner, x = p.x, y = p.y, vx = vx, vy = vy,
          damage = CHILLI_CHILD.damage, fuse = CHILLI_CHILD.fuse, countdown = 0,
          explode_on_space = true, explode_into = "fire",
          sprite = 0, -- PX leaves them WA's sprite 0; the chilli is drawn instead
        })
        chilli_child[id] = true
      end
    end
    chilli_pending = {}
  end
end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })
end
`
      },
      {
        path: 'weapons/claims.lua',
        name: 'weapons/claims.lua',
        language: 'lua',
        content: `-- Highlander: the slot claims. Split from rules.lua by tools/split_highlander.py.
local shared = require("lib/shared")
local PORTED = shared.PORTED
local PX_ART = shared.PX_ART
local PX_HOLDS = shared.PX_HOLDS
local WEP_NAME = shared.WEP_NAME
local WEP_PATCH = shared.WEP_PATCH
local fires = shared.fires

-- WA's muzzle can be inside a wall when a worm fires from beside it. A stock
-- Old Woman constructed there explodes before her first frame. Dispatch the
-- shot to Lua so she can be launched from a clear point the worm can see,
-- keeping WA's own Old Woman movement and five-second fuse.
local OLD_WOMAN_LAUNCHER_PATCH = {
  uses_turn = 0,
  subtype_param = 3, -- bazooka aim sheet, not the Sheep Launcher hold
  fire_type = 1,
  fire_method = 3, -- CreateWeaponProjectile, intercepted by on_fire
}

-- Our own changes over the generated record patches (tools/embed_weps.py),
-- kept here so WEP_PATCH can be generated again.
local PATCH_FIXES = {
  -- S.M.A.R.T Bomb: homing bits leave the bomb's red trail circles (stock 250,
  -- drawn as sprites/smart_bomb/trail), not WA's green gas cloud (608) the
  -- record named.
  mortar = { c_homing_sprite = 250 },
}

for _, list in ipairs({ PORTED, PX_ART }) do
  for _, w in ipairs(list) do
    -- copy_from + name + named patch (stock base); was weps/<slot>.wep
    local spec = w.wep and { wep = w.wep } or { copy_from = w.weapon, name = WEP_NAME[w.weapon] }
    if w.weapon == "old_woman" then
      spec.patch = OLD_WOMAN_LAUNCHER_PATCH
      spec.on_fire = function(fire) fires.old_woman(fire) end
    elseif not w.wep and WEP_PATCH[w.weapon] then
      spec.patch = WEP_PATCH[w.weapon]
    end
    if PATCH_FIXES[w.weapon] then
      local patch = {}
      for k, v in pairs(spec.patch or {}) do patch[k] = v end
      for k, v in pairs(PATCH_FIXES[w.weapon]) do patch[k] = v end
      spec.patch = patch
    end
    for key, value in pairs(w) do
      spec[key] = value
    end
    spec.hold = PX_HOLDS[w.weapon]
    wa.weapons.replace(spec)
  end
end

do
  -- reddaz's launch point search, playtested by him. A point is clear when
  -- it and 8 points on a 3-pixel circle around it are free of land, and the
  -- worm can see it (nothing between them, so never the far side of a thin
  -- wall the muzzle poked through). The muzzle is tried first, then rings
  -- every 4 pixels out to 40, at finer angles the wider the ring; failing
  -- all, she starts at the worm.
  local P = 0x10000
  local CLEAR = 3 * P
  local REACH = 40 * P
  local RING = 4 * P

  local function clear(x, y)
    if wa.land.solid(x, y) then return false end
    for i = 0, 7 do
      local a = (i / 8) * 2 * math.pi
      if wa.land.solid(x + math.floor(CLEAR * wa.math.cos(a)), y + math.floor(CLEAR * wa.math.sin(a))) then
        return false
      end
    end
    return true
  end

  local function launch_point(x, y, w)
    local r = 0
    while r <= REACH do
      local step = (r == 0) and 360 or math.max(15, math.floor(360 / ((r / P) / 2)))
      local deg = 0
      while deg < 360 do
        local a = deg * math.pi / 180
        local tx, ty = x + math.floor(r * wa.math.cos(a)), y + math.floor(r * wa.math.sin(a))
        if clear(tx, ty) then
          local hit = wa.land.trace(tx, ty, w.x, w.y)
          if not hit or not hit.hit then return tx, ty end
        end
        deg = deg + step
      end
      r = r + RING
    end
    return w.x, w.y
  end

  fires.old_woman = function(fire)
    local w = fire.worm
    local x, y = launch_point(fire.x, fire.y, w)
    wa.weapons.launch({ weapon = "old_woman", owner = w,
      x = x, y = y, vx = fire.vx, vy = fire.vy, fuse = 5000 })
  end
end
`
      },
      {
        path: 'weapons/crate_strike.lua',
        name: 'weapons/crate_strike.lua',
        language: 'lua',
        content: `-- Highlander: Crate Strike (PX utility_all_crates: allcrates_script.txt).
local shared = require("lib/shared")
local fires = shared.fires

-- PX drops three crates on parachutes from 50 pixels above the map: at the
-- click's x, 50 to its left and 50 to its right. Each is a weapon, utility
-- or health crate, drawn in that order from WA's RNG, as PX's RandomInt(1,
-- 3); WA picks what is inside (PX's WCT_RANDOM). A health crate gives 20 to
-- 40, 40 to 60 or 60 to 80, by its place. PX takes the click's whole pixel.
local P = 0x10000
local DROP_Y = -50 * P
local KINDS = { "weapon", "utility", "health" }
local DROPS = {
  { dx = 0, lo = 20, hi = 40 },
  { dx = -50, lo = 40, hi = 60 },
  { dx = 50, lo = 60, hi = 80 },
}

fires.crate_strike = function(ev)
  local x = ev.x // P
  for _, d in ipairs(DROPS) do
    local kind = KINDS[wa.random(1, 3)]
    local health = wa.random(d.lo, d.hi)
    local crate = { x = (x + d.dx) * P, y = DROP_Y, kind = kind, health = health, drop = "chute" }
    -- A match whose crates hold no weapon (or no utility) refuses that
    -- kind; a health crate drops in its place.
    if not pcall(wa.crates.spawn, crate) then
      crate.kind = "health"
      wa.crates.spawn(crate)
    end
  end
end
`
      },
      {
        path: 'weapons/double_bazooka.lua',
        name: 'weapons/double_bazooka.lua',
        language: 'lua',
        content: `-- Highlander: Double Bazooka. Split from rules.lua by tools/split_highlander.py.
local shared = require("lib/shared")

-- ---------------------------------------------------------- Double Bazooka
do
--
-- PX's double_bazooka_script. A Double Bazooka shell does not end at the
-- first thing it hits: WA's explosion goes off, a 50-pixel hole is cut
-- (GG->land->MakeHole(50), WA's landscape "apply explosion", as
-- wa.land.dig), and a second shell carries on from there at the first one's
-- speed, a real WA missile of the same slot (new CMissile with the weapon's
-- launch data), so WA flies it with wind and its smoke trail. PX changes
-- three things for it: damage 40, sprite 54 and a 5 s fuse. The port takes
-- the damage and fuse; 54 is a cluster bit (clustlet) in WA 3.8.1, so the
-- second shell keeps the record's bazooka shell (48, missile), as the first
-- does. Its own explosion ends it.
--
-- Not ported: PX's particle trail on top of WA's (pxparticles), and a plain
-- 50/35 blast PX makes when a second shell explodes before its first frame.

local DB_SECOND = { damage = 40, fuse = 5000 }
local DB_HOLE = 50

local db_speed = {}   -- missile id -> { vx, vy } at its last frame
local db_second = {}  -- missile id -> true: a second shell, which ends it
local db_pending = {} -- second shells to launch once the blast is over
local db_shooter      -- the worm that fired it (PX's ClWT / ClWN)

wa.on.missile_frame(function(m)
  if m.weapon == "bazooka" and m.phase == "post" then
    db_speed[m.id] = { m.vx, m.vy }
  end
end)

shared.double_bazooka_explode = function(ev)
  local id = ev.missile
  if not id then
    return
  end
  local speed = db_speed[id]
  db_speed[id] = nil
  if db_second[id] then
    db_second[id] = nil
    return
  end
  if not speed then
    return
  end
  wa.land.dig({ x = ev.x, y = ev.y, radius = DB_HOLE })
  -- Launched after the blast, as PX's comes after super: WA's explosion
  -- would otherwise push it.
  db_pending[#db_pending + 1] = { x = ev.x, y = ev.y, vx = speed[1], vy = speed[2] }
end

wa.on.worm_message(function(worm, msg)
  if msg == wa.msg.FIRE_WEAPON and worm.weapon == "bazooka" then
    db_shooter = worm
  elseif msg == wa.msg.FRAME_FINISH and #db_pending > 0 then
    -- The first worm's frame after the blast; every worm gets one.
    local owner = db_shooter or worm
    for _, p in ipairs(db_pending) do
      local id = wa.weapons.launch({
        weapon = "bazooka", owner = owner, x = p.x, y = p.y, vx = p.vx, vy = p.vy,
        damage = DB_SECOND.damage, fuse = DB_SECOND.fuse,
      })
      db_second[id] = true
    end
    db_pending = {}
  end
end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })
end
`
      },
      {
        path: 'weapons/electrical.lua',
        name: 'weapons/electrical.lua',
        language: 'lua',
        content: `-- Highlander: the electrical weapons. Split from rules.lua by tools/split_highlander.py.
local shared = require("lib/shared")
local current_worm = shared.current_worm
local first = shared.first
local held = shared.held
local revived_by_lightning = shared.revived_by_lightning

-- --------------------------------------------------------- electrical weapons
do
-- PX's lightningstrike.txt and tazer.txt share these target classes and beam
-- textures. Only gameplay advances in the actor brains. Drawing below may run
-- at any frame rate and consumes only wa.draw.random(), never WA's sim RNG.
local EP = 0x10000
local ELECTRIC_DEPTH = 0x00190000 -- behind WA terrain, in the GPU occlusion mask
local BEAM = "sprites/lightning/beam.png"
local GLOW = "sprites/lightning/glow.png"
local CLOUD = "sprites/lightning/cloud.png" -- a puff made for the pack, in place of WA's cloudl
local CLOUD_DEPTH = ELECTRIC_DEPTH - 0x1000  -- in front of the beam's top, behind the terrain
local GRENADE_BURST = "sprites/electric_grenade/explosion"
local strikes, arcs, tazed = {}, {}, {}

local function effect_actor(x, y, owner, frame)
  return wa.actors.spawn({
    sprite = GLOW, visible = false, gravity = false, collide = false,
    owner = owner, x = x, y = y, on = frame,
  })
end

local function electrical_targets(graves)
  local out = {}
  for _, group in ipairs({ wa.worms, wa.mines, wa.crates, wa.oil }) do
    for _, obj in ipairs(group.all()) do out[#out + 1] = obj end
  end
  if graves and wa.graves then
    for _, obj in ipairs(wa.graves.all()) do out[#out + 1] = obj end
  end
  return out
end

local function target_radius(obj)
  if obj.kind == "worm" then return 6 end
  if obj.kind == "grave" then return 8 end
  if obj.kind == "mine" then return 5 end
  return 9
end

-- A ray against terrain and the objects PX's collision mask names. Projection
-- is done in world pixels; the chosen endpoint is converted back to 16.16.
-- Equal-distance objects retain the engine's entity traversal order.
local function electrical_trace(x0, y0, dx, dy)
  local far = 10000
  if wa.world.electrical_trace then
    return wa.world.electrical_trace(math.floor(x0), math.floor(y0),
      math.floor(x0 + dx * far * EP), math.floor(y0 + dy * far * EP))
  end
  local land = wa.land.trace(math.floor(x0), math.floor(y0),
    math.floor(x0 + dx * far * EP), math.floor(y0 + dy * far * EP))
  local best = land and math.sqrt(((land.x - x0) / EP) ^ 2 + ((land.y - y0) / EP) ^ 2) or far
  local hit = land and { x = land.x, y = land.y, obj = nil } or nil
  for _, obj in ipairs(electrical_targets(true)) do
    local ox, oy = (obj.x - x0) / EP, (obj.y - y0) / EP
    local along = ox * dx + oy * dy
    local across = math.abs(ox * dy - oy * dx)
    if along > 0 and along < best and across <= target_radius(obj) then
      best = along
      hit = { x = obj.x, y = obj.y, obj = obj }
    end
  end
  return hit
end

local function strike_hit(s)
  if shared.zap_bowling_balls then shared.zap_bowling_balls(s.ex, s.ey) end
  if not s.hit then return end
  local radius2 = (6 * EP) ^ 2
  local targets = wa.world.electrical_nearby
    and wa.world.electrical_nearby(s.ex, s.ey, 24, true) or electrical_targets(true)
  for _, obj in ipairs(targets) do
    local dx, dy = obj.x - s.ex, obj.y - s.ey
    local r = (target_radius(obj) + 6) * EP
    if dx * dx + dy * dy <= math.max(radius2, r * r) then
      if obj.kind == "worm" then
        if not revived_by_lightning[obj.id] then obj:heal(25) end
      elseif obj.kind == "grave" then
        if obj.worm_id ~= 0 then
          local id = obj.worm_id
          local worm = obj:revive(id, 10)
          if worm then
            revived_by_lightning[worm.id] = true
            shared.restore_lightning_inventory(worm)
          end
        end
      elseif obj.kind == "mine" then
        obj:arm(obj.fuse < 0 and wa.random(1000, 5000) or obj.fuse)
      elseif obj.kind == "crate" or obj.kind == "oil" then
        obj:hit(100, 0, 0)
      end
    end
  end
end

-- PX's cloud: every second frame of the strike's life a puff of WA's large
-- cloud, tinted a dark bluish grey, is thrown out from the top of the beam
-- and slowed by the air; a core puff (100 frames, 1.2x to 0.6x) until the
-- strike is spent, a surrounding one (140 frames, 1x to nothing) until the
-- strike is gone. Each fades in from nothing. Also PX's sparks: while the
-- beam holds, a glow thrown from where it hit, falling. Both are advanced
-- here, once per game frame, from the strike's own generator, and only drawn
-- below; nothing else reads them.
local function strike_rand(s)
  s.seed = (s.seed * 1103515245 + 12345) % 0x80000000
  return s.seed / 0x80000000
end

local function strike_puff(s, life, drag, s0, s1)
  local xvel = strike_rand(s) * 2 - 1
  local yvel = 1 - xvel * xvel
  s.cloud[#s.cloud + 1] = { x = s.sx, y = s.sy, vx = 16 * xvel * EP,
    vy = (strike_rand(s) * 9 - 8) * yvel * EP, drag = drag, age = 0, life = life, s0 = s0, s1 = s1 }
end

local function strike_particles(s)
  if s.tail > 0 then
    s.cloud_timer = s.cloud_timer - 1
    if s.cloud_timer <= 0 then
      if s.life > 0 then strike_puff(s, 100, 0.3, 1.2, 0.6) end
      strike_puff(s, 140, 0.15, 1.0, 0.01)
      s.cloud_timer = 2
    end
    if s.delay == 0 and s.life > 0 and s.hit then
      local a = strike_rand(s) * 2 * math.pi
      local v = (1 + strike_rand(s) * 2) * EP
      s.sparks[#s.sparks + 1] = { x = s.ex, y = s.ey, vx = math.cos(a) * v, vy = math.sin(a) * v, age = 0 }
    end
  end
  for i = #s.cloud, 1, -1 do
    local p = s.cloud[i]
    p.age = p.age + 1
    if p.age >= p.life then
      table.remove(s.cloud, i)
    else
      p.x, p.y = p.x + p.vx, p.y + p.vy
      p.vx, p.vy = p.vx * (1 - p.drag), p.vy * (1 - p.drag)
    end
  end
  for i = #s.sparks, 1, -1 do
    local p = s.sparks[i]
    p.age = p.age + 1
    if p.age >= 50 then
      table.remove(s.sparks, i)
    else
      p.x, p.y, p.vy = p.x + p.vx, p.y + p.vy, p.vy + EP // 8
    end
  end
end

shared.lightning_click = function(ev)
  -- PX's direction: from the left unless the shot's x speed, which WA's
  -- arrow keys set, is negative (lightningstrike.txt: SpX < 0 -> -DirX).
  local dirx = 0.5 * ((ev.vx or 0) < 0 and -1 or 1)
  local diry = math.sqrt(3) / 2
  local sy = -270 * EP
  local sx = math.floor(ev.x - ((ev.y - sy) / EP) * dirx / diry * EP)
  local hit = electrical_trace(sx, sy, dirx, diry)
  local ex, ey = hit and hit.x or sx + math.floor(300 * dirx * EP),
    hit and hit.y or sy + math.floor(300 * diry * EP)
  -- A bowling ball on the way stops the beam, as PX's does.
  local bx, by = nil, nil
  if shared.bowling_ball_on_beam then
    local reach = math.sqrt(((ex - sx) / EP) ^ 2 + ((ey - sy) / EP) ^ 2)
    bx, by = shared.bowling_ball_on_beam(sx, sy, dirx, diry, reach)
  end
  if bx then ex, ey, hit = bx, by, { x = bx, y = by } end
  local distance = math.sqrt(((ex - sx) / EP) ^ 2 + ((ey - sy) / EP) ^ 2)
  if hit and distance > 300 then
    sx, sy = ex - math.floor(300 * dirx * EP), ey - math.floor(300 * diry * EP)
  end
  local s = { sx = sx, sy = sy, ex = ex, ey = ey, hit = hit, dirx = dirx, diry = diry,
    delay = 150, life = 16, tail = 60, owner = ev.worm, ticks = 0,
    seed = (ex // EP * 7919 + ey // EP) % 0x80000000, cloud_timer = 0, cloud = {}, sparks = {} }
  strikes[#strikes + 1] = s
  wa.sound.play(ev.worm, "sounds/lightning/thunder.wav")
  effect_actor(ex, ey, ev.worm, function(a)
    s.ticks = s.ticks + 1
    strike_particles(s)
    if s.delay > 0 then
      s.delay = s.delay - 1
      if s.delay == 0 then wa.sound.play(a, "sounds/lightning/hit.wav") end
    elseif s.life > 0 then
      s.life = s.life - 1
      if s.life == 0 then strike_hit(s) end
    elseif s.tail > 0 then
      s.tail = s.tail - 1
    elseif #s.cloud == 0 and #s.sparks == 0 then
      for i, held in ipairs(strikes) do
        if held == s then table.remove(strikes, i); break end
      end
      a:despawn()
    end
  end)
end

local function target_key(obj)
  return obj.kind .. ":" .. obj.id
end

local function find_target(key)
  local ball = key:match("^ball:(%d+)$")
  if ball then
    return shared.bowling_ball_target and shared.bowling_ball_target(tonumber(ball))
  end
  for _, obj in ipairs(electrical_targets(false)) do
    if target_key(obj) == key then return obj end
  end
end

local function closest_target(arc)
  local best, distance = nil, (200 * EP) ^ 2
  local targets = wa.world.electrical_nearby
    and wa.world.electrical_nearby(arc.x, arc.y, 200, false) or electrical_targets(false)
  local function consider(obj)
    local key = target_key(obj)
    if not arc.ignore[key] and (obj.kind ~= "worm" or obj.hp > 0) then
      local dx, dy = obj.x - arc.x, obj.y - arc.y
      local d = dx * dx + dy * dy
      if d < distance then best, distance = obj, d end
    end
  end
  for _, obj in ipairs(targets) do consider(obj) end
  -- PX's Tazer takes Bowling Balls too.
  if shared.bowling_ball_targets then
    for _, obj in ipairs(shared.bowling_ball_targets()) do consider(obj) end
  end
  return best, distance
end

local function release_taze(key)
  local hold = tazed[key]
  if not hold then return end
  hold.count = hold.count - 1
  if hold.count > 0 then return end
  -- The worm the hold took, not a fresh lookup: an earlier zap may have
  -- killed it, and the worm lists leave dead worms out. Left held, a dead
  -- worm never comes to rest, so WA never runs its death and the turn,
  -- frozen by the hold, never ends.
  local worm = hold.worm
  -- Knocked flying meanwhile, the engine has already let it go.
  if worm.taken then worm:release(0, 0) end
  worm.body_visible = true
  tazed[key] = nil
end

-- The worm that last fired the Electric Grenade, as PX keeps it at the
-- fire: the grenade's arc never zaps its thrower. The explosion's own
-- worm (ev.worm) need not be the thrower.
local thrower

-- A tazed worm is the pack's (worm:take): the engine eats its moves and
-- jumps; it cannot start a shot either.
wa.on.worm_message(function(worm, msg)
  if msg ~= wa.msg.FIRE_WEAPON then return end
  if tazed[target_key(worm)] then return "eat" end
  if worm.weapon == "earthquake" then thrower = worm end
end, { msgs = { wa.msg.FIRE_WEAPON } })

local function zap_target(arc, pending)
  local obj = find_target(pending.key)
  release_taze(pending.key)
  if not obj then return end
  if obj.kind == "worm" then
    obj:hurt(24)
    obj.vx, obj.vy = pending.side * 1.2 * EP, -4 * EP
  elseif obj.kind == "mine" then
    obj:arm(400)
  elseif obj.kind == "crate" or obj.kind == "oil" then
    obj:hit(12, pending.side * 1.2 * EP, -4 * EP)
  elseif obj.kind == "ball" then
    shared.zap_bowling_ball(obj.id)
  end
end

-- The arc keeps every point it passed, from the grenade to where it ends,
-- links included: the whole chain stays drawn until the arc dies.
-- wa.draw.ribbon draws at most 256.
local ARC_MAX_POINTS = 256
local function add_point(arc)
  arc.points[#arc.points + 1] = { arc.x, arc.y }
  if #arc.points > ARC_MAX_POINTS then table.remove(arc.points, 1) end
end

local function progress_arc(arc)
  arc.explosion = arc.explosion + 1
  for i = #arc.pending, 1, -1 do
    local p = arc.pending[i]
    p.time = p.time - 1
    if p.time <= 0 then
      zap_target(arc, p)
      table.remove(arc.pending, i)
    end
  end
  if arc.pause > 0 then arc.pause = arc.pause - 1; return end
  if arc.life <= 0 then
    if #arc.points > 0 then table.remove(arc.points, 1) end
    return
  end
  arc.life = arc.life - 1
  local target, distance = closest_target(arc)
  if target then
    local dx, dy = target.x - arc.x, target.y - arc.y
    local d = math.sqrt(distance)
    if d <= 10 * EP then
      local key = target_key(target)
      arc.ignore[key] = true
      arc.pending[#arc.pending + 1] = { key = key, side = dx < 0 and -1 or 1, time = 24 }
      if target.kind == "worm" then
        if tazed[key] then
          tazed[key].count = tazed[key].count + 1
        else
          tazed[key] = { x = target.x, y = target.y, count = 1, worm = target,
            sheet = wa.random(1, 2) == 1 and "sprites/electric_grenade/tazed1" or "sprites/electric_grenade/tazed2" }
        end
        target.body_visible = false
        -- Held where it stands, the turn stopped, until the zap.
        target:take{ turn = "freeze" }
      end
      arc.x, arc.y = target.x, target.y
      arc.life = 20
      arc.pause = 14
      add_point(arc)
      return
    end
    local pull = math.min(1, math.sqrt(10 * EP / d))
    arc.dx = arc.dx + ((dx / d) - arc.dx) * pull
    arc.dy = arc.dy + ((dy / d) - arc.dy) * pull
  else
    arc.dx = arc.dx + wa.random(-100, 100) / 100
    arc.dy = arc.dy + wa.random(-100, 100) / 100
  end
  local norm = math.sqrt(arc.dx * arc.dx + arc.dy * arc.dy)
  if norm < 0.01 then arc.dx, arc.dy = 0, -1 else arc.dx, arc.dy = arc.dx / norm, arc.dy / norm end
  local nx, ny = arc.x + arc.dx * 20 * EP, arc.y + arc.dy * 20 * EP
  local land = wa.land.trace(math.floor(arc.x), math.floor(arc.y), math.floor(nx), math.floor(ny))
  if land then
    if land.starts_solid then arc.life = 0; return end
    -- Follow the tangent that moves closer to the target, as PX's arc does.
    local tx, ty = land.tx or 1, land.ty or 0
    if target then
      local a = (target.x - (land.x + tx * 10 * EP)) ^ 2 + (target.y - (land.y + ty * 10 * EP)) ^ 2
      local b = (target.x - (land.x - tx * 10 * EP)) ^ 2 + (target.y - (land.y - ty * 10 * EP)) ^ 2
      if b < a then tx, ty = -tx, -ty end
    end
    arc.dx, arc.dy = tx, ty
    arc.x, arc.y = land.x + (land.nx or 0) * 10 * EP + tx * 10 * EP,
      land.y + (land.ny or -1) * 10 * EP + ty * 10 * EP
  else
    arc.x, arc.y = arc.x + arc.dx * 10 * EP, arc.y + arc.dy * 10 * EP
  end
  add_point(arc)
end

shared.electric_grenade_explode = function(ev)
  local arc = { x = ev.x, y = ev.y, dx = 0, dy = -1, life = 16, pause = 0,
    points = { { ev.x, ev.y } }, ignore = {}, pending = {}, explosion = 0,
    burst_x = ev.x, burst_y = ev.y, sound_age = 0 }
  if thrower then arc.ignore[target_key(thrower)] = true end
  if ev.worm then arc.ignore[target_key(ev.worm)] = true end
  arcs[#arcs + 1] = arc
  -- An explosion without a worm would leave the driver owned by the exploding
  -- grenade: the turn's worm owns it then, as every other effect's.
  local driver = effect_actor(ev.x, ev.y, ev.worm or current_worm(), function(a)
    arc.sound_age = arc.sound_age + 1
    if arc.life > 0 and arc.sound_age % 46 == 0 then
      wa.sound.play(a, "sounds/lightning/tazer_loop.wav")
    end
    progress_arc(arc)
    if arc.life <= 0 and #arc.points == 0 and #arc.pending == 0 then
      for i, held in ipairs(arcs) do
        if held == arc then table.remove(arcs, i); break end
      end
      a:despawn()
    end
  end)
  wa.sound.play(driver, "sounds/lightning/tazer_loop.wav")
end

if wa.on.draw and wa.draw.ribbon then
  local function colour(a, r, g, b)
    return (math.floor(a) << 24) | (r << 16) | (g << 8) | b
  end
  -- wa.draw.quad and wa.draw.ribbon copy their table before returning, so
  -- one spec is refilled for every quad and every ribbon. A frame with
  -- dozens of arcs draws about a thousand glows: new tables for each made
  -- enough garbage to run Lua's GC inside the draw on most frames.
  local QUAD = { points = { {0, 0}, {0, 0}, {0, 0}, {0, 0} } }
  -- An axis-aligned square of half size hw by hh around x, y.
  local function square(sprite, frame, blend, color, depth, x, y, hw, hh)
    QUAD.sprite, QUAD.frame, QUAD.blend, QUAD.color, QUAD.depth = sprite, frame, blend, color, depth
    local p = QUAD.points
    p[1][1], p[1][2] = x - hw, y - hh
    p[2][1], p[2][2] = x + hw, y - hh
    p[3][1], p[3][2] = x + hw, y + hh
    p[4][1], p[4][2] = x - hw, y + hh
    wa.draw.quad(QUAD)
  end
  local function glow(x, y, size, color)
    local h = size * EP / 2
    square(GLOW, 0, "add", color, ELECTRIC_DEPTH, x, y, h, h)
  end
  -- One ribbon's points, refilled: point(i, ...) sets the i-th, ribbon(n)
  -- draws the first n.
  local RIBBON = { sprite = BEAM, blend = "add", depth = ELECTRIC_DEPTH, points = {} }
  local function point(i, x, y, width, u, color)
    local p = RIBBON.points[i]
    if not p then p = {}; RIBBON.points[i] = p end
    p.x, p.y, p.width, p.u, p.color = x, y, width, u, color
  end
  local function ribbon(n)
    local pts = RIBBON.points
    for i = #pts, n + 1, -1 do pts[i] = nil end
    wa.draw.ribbon(RIBBON)
  end
  -- PX's lightningstrike RenderLightning. Its shape is fractal noise, made
  -- afresh each game frame while the beam holds: each point is the middle of
  -- its two neighbours plus a random nudge, halving the span each pass. A
  -- look, so from wa.draw.random, never WA's generator.
  local LR, LG, LB = 120, 140, 255
  local function lerp(t, a, b) return a + (b - a) * t end
  local function noise_span(noise, off, divs, scale, first, last)
    for i = 0, divs - 1 do noise[off + i] = 0 end
    noise[off], noise[off + divs - 1] = first, last
    local k = divs
    local l = k >> 1
    while l > 0 do
      for i = l, divs - 1 - l, k do
        noise[off + i] = (noise[off + i - l] + noise[off + i + l]) * 0.5 + (wa.draw.random() * 2 - 1) * scale
      end
      k = l
      l = k >> 1
    end
  end
  -- The main beam's 9 points, and 6 branches of 9 at random points on it.
  local function new_shape(s)
    s.noise, s.attach = {}, {}
    noise_span(s.noise, 0, 9, 1.0, 0, 0)
    for _ = 1, 6 do s.attach[1 + math.floor(wa.draw.random() * 8)] = true end
    for i = 0, 5 do
      local off = 2 + wa.draw.random() * 4
      if wa.draw.random() < 0.5 then off = -off end
      noise_span(s.noise, 9 + 9 * i, 9, 0.5, 0, off)
    end
    s.ground = 0.5 + wa.draw.random() * 0.3
    s.shape_tick = s.ticks
  end
  -- PX's RenderBeam: one textured strip through the noise, \`width\` (a half
  -- width, as PX's) tapering to \`endwidth\`, and a glow at every point fading
  -- towards the end.
  local function beam(noise, off, divs, width, endwidth, scale, x1, y1, x2, y2, glowalpha)
    if divs < 2 then return end
    local dx, dy = (x2 - x1) / EP, (y2 - y1) / EP
    local dd = math.sqrt(dx * dx + dy * dy)
    if dd <= 0 then return end
    dx, dy = dx / dd, dy / dd
    local d = divs - 1
    for i = 0, divs - 1 do
      local f = i / d
      local n = noise[off + i] or 0
      local x = lerp(f, x1, x2) + scale * dy * n * EP
      local y = lerp(f, y1, y2) - scale * dx * n * EP
      point(i + 1, x, y, 2 * lerp(f, width, endwidth), f, colour(255, LR, LG, LB))
      local a = 255 * glowalpha * (1 - f)
      if a >= 1 then glow(x, y, 64, colour(a, LR, LG, LB)) end
    end
    ribbon(divs)
  end
  local function draw_strike(s)
    -- The cloud, dark and alpha-blended over the sky.
    for _, p in ipairs(s.cloud) do
      local t = p.age / p.life
      local size = lerp(t, p.s0, p.s1)
      square(CLOUD, 0, "alpha", colour(255 * t, 45, 40, 60), CLOUD_DEPTH, p.x, p.y, 64 * size * EP, 40 * size * EP)
    end
    for _, p in ipairs(s.sparks) do
      local t = p.age / 50
      glow(p.x, p.y, 13 * (1 - t) + 1, colour(255, LR, LG, LB))
    end
    if s.life <= 0 or s.delay >= 8 then return end
    if not s.noise or (s.delay == 0 and s.shape_tick ~= s.ticks) then new_shape(s) end
    -- Before it lands the beam grows down from the cloud over 8 frames.
    local divs, ex, ey = 9, s.ex, s.ey
    if s.delay > 0 then
      local fr = (8 - s.delay) / 8
      divs = math.floor(9 * fr)
      ex, ey = lerp(fr, s.sx, s.ex), lerp(fr, s.sy, s.ey)
    end
    beam(s.noise, 0, divs, 35, 3, 15, s.sx, s.sy, ex, ey, 1.0)
    local sub, d = 0, divs - 1
    for i = 0, divs - 1 do
      if s.attach[i] and d > 0 then
        local f = i / d
        local x = lerp(f, s.sx, ex) + 10 * s.diry * s.noise[i] * EP
        local y = lerp(f, s.sy, ey) - 10 * s.dirx * s.noise[i] * EP
        beam(s.noise, 9 + 9 * sub, 9, lerp(f, 10, 1), 0.1, 15 * (1 - f), x, y,
          x + s.dirx * 100 * (1 - f) * EP, y + s.diry * 100 * (1 - f) * EP, 0.5 * (1 - f))
        sub = sub + 1
      end
    end
    glow(s.sx + 10 * s.dirx * EP, s.sy + 10 * s.diry * EP, 230, colour(255, LR, LG, LB))
    if s.delay == 0 and s.hit then glow(s.ex, s.ey, 128 * s.ground, colour(255, LR, LG, LB)) end
  end
  wa.on.draw(function()
    for _, s in ipairs(strikes) do
      draw_strike(s)
    end
    for _, arc in ipairs(arcs) do
      if arc.explosion < 10 then
        local h = 75 * EP
        square(GRENADE_BURST, arc.explosion, "add", 0x551E14EB, ELECTRIC_DEPTH, arc.burst_x, arc.burst_y, h, h)
      end
      if #arc.points >= 2 then
        -- PX's CTazerShot: one strip through the arc's points, thickest in
        -- the middle (9, a half width, as PX's), wobbling up to 10 px across
        -- its path by fractal noise made afresh each game frame, a glow at
        -- every point and a big one at the tip; all fading as the arc dies.
        if arc.shape_tick ~= arc.sound_age then
          -- One noise value per point; PX's fractal noise needs a power of
          -- two plus one values.
          local divs = 33
          while divs < #arc.points do divs = 2 * divs - 1 end
          arc.noise = arc.noise or {}
          noise_span(arc.noise, 0, divs, 1.0, 0, 0)
          arc.shape_tick = arc.sound_age
        end
        local num = #arc.points - 1
        local fade = math.min(1, arc.life / 6)
        for i = 0, num do
          local t = i / num
          local x, y = arc.points[i + 1][1], arc.points[i + 1][2]
          if i > 0 and i < num then
            local px, py = arc.points[i][1], arc.points[i][2]
            local nx, ny = (y - py) / EP, (px - x) / EP
            local d = math.sqrt(nx * nx + ny * ny)
            if d > 0 then
              local n = 10 * (arc.noise[i - 1] or 0) / d * EP
              x, y = x + n * nx, y + n * ny
            end
          end
          local f = math.min(1, 4 * t * (1 - t) + 0.1)
          local f2 = f * fade
          local c = colour(255, math.floor(80 * f2), math.floor(100 * f2), math.floor(255 * f2))
          point(i + 1, x, y, 2 * 9 * f, t, c)
          glow(x, y, i == num - 1 and 115 or 38, c)
        end
        ribbon(num + 1)
      end
    end
    -- PX's CTazerDamage glow on a linked Bowling Ball until it is zapped.
    for _, arc in ipairs(arcs) do
      for _, p in ipairs(arc.pending) do
        if p.key:sub(1, 5) == "ball:" then
          local ball = find_target(p.key)
          if ball then glow(ball.x, ball.y, 128 * (0.4 + 0.3 * wa.draw.random()), colour(255, 80, 100, 255)) end
        end
      end
    end
    for key, hold in pairs(tazed) do
      local worm = find_target(key)
      if worm then
        local x, y = worm.x, worm.y
        local h = 30 * EP
        square(hold.sheet, math.floor(wa.draw.random() * 4), "alpha", 0xFFFFFFFF, ELECTRIC_DEPTH, x, y, h, h)
        -- PX's tazed worm: a glow 0.4 to 0.7 of the sheet, flickering.
        glow(x, y, 128 * (0.4 + 0.3 * wa.draw.random()), colour(255, 80, 100, 255))
      end
    end
  end)
end
end
`
      },
      {
        path: 'weapons/electromagnet.lua',
        name: 'weapons/electromagnet.lua',
        language: 'lua',
        content: `-- Highlander's Electromagnet, on the Baseball Bat slot (PX weapon_magnet:
-- magnet.txt's CMagnet). Placed, it stays: for four of its owner's turns
-- its field pushes (repel) or pulls (attract) WA's own mines and missiles
-- and the Bowling Balls, and it triggers the mines it catches. The objects
-- it moves stay WA's, so their own flight, collisions and fuses run. It is
-- an object in the oil-drum layer: blasts, guns and fires hit it, and at
-- 0 health it explodes.
local shared = require("lib/shared")
local P = 0x10000
-- PX's parameters, squared where its InitializeParameters squares them.
local RANGE2 = 170 * 170           -- MaxRange
local SYNC2 = RANGE2 // 4          -- MaxSyncRange: MaxRange * 0.25
local FORCE, COEFFICIENT = 12, 14000
local ATTRACT_OFFSET, REPEL_OFFSET = 10 * 10, 5 * 5
local TURNS, HEALTH, LOW_HEALTH = 4, 80, 30
local BOOM = { id = 100, damage = 50, below = false } -- ExplosionBlast, ExplosionDamage
local BALL_SHARE = 0.25            -- a Bowling Ball gets a quarter of the force
-- Not PX's: PX explodes the missiles still in a field 300 frames after the
-- turn ended, so none circles a magnet for ever. With no way to burst a
-- stock missile from Lua, the field lets go of them instead, and each ends
-- on its own fuse or impact.
local RELEASE_AFTER = 300
-- The grenades that go off only once they stop slow down in a field (PX
-- damps its Hellish Hand-Grenade there by 0.985 a frame).
local DAMPED = { holy_grenade = true }
local DAMPING = 0.985
-- Its body: PX's magnet is a mine (CMine) and moves as one. Here it is a
-- circle traced against the land (the art is 26 pixels across), bouncing
-- a little and rubbing along what it lands on until it rests.
local RADIUS = 8
local BOUNCE, FRICTION = 0.3, 0.3
local REST = P // 8                -- slower on contact than 1/8 pixel a frame: at rest
local SINK = P // 2                -- in the water it sinks half a pixel a frame
local SUNK = 200 * P               -- and is gone this far below the surface
local BODY = "sprites/electromagnet/"
local magnets = {}
local polarity = {} -- worm id -> +1 repel, -1 attract (PX's MagnetPolarity)
local plus_held = {} -- worm id -> the synchronized + key last frame

local function trunc(x) return x >= 0 and math.floor(x) or -math.floor(-x) end

-- PX's CalculateMagneticForce at (x, y), 16.16: the push in 16.16 a frame,
-- or nil out of range or discharged. Distances in pixels, as PX's.
local function force(m, x, y, scale)
  if m.turns <= 0 or not m.alive then return nil end
  local dx, dy = (x - m.x) / P, (y - m.y) / P
  local r2 = dx * dx + dy * dy + (m.pol < 0 and ATTRACT_OFFSET or REPEL_OFFSET)
  if r2 > RANGE2 then return nil end
  local strength = math.min(FORCE, COEFFICIENT / r2) * (scale or 1) * m.pol
  local r = math.sqrt(r2)
  return trunc(dx / r * strength * P), trunc(dy / r * strength * P)
end

-- PX's TriggerMine: a random-fuse mine gets 1 to 5 seconds; an attracting
-- magnet sets it close to the longest fuse among the mines it already holds,
-- so they go off together. Then the mine is armed.
local function trigger_mine(m, mine, mines)
  local fuse = mine.fuse
  if fuse < 0 then
    fuse = wa.random(1000, 4999)
    if m.pol < 0 then
      local longest = 1000
      for _, other in ipairs(mines) do
        if other.id ~= mine.id then
          local dx, dy = (other.x - m.x) / P, (other.y - m.y) / P
          if dx * dx + dy * dy < SYNC2 then longest = math.max(longest, other.fuse) end
        end
      end
      if longest > 1000 then fuse = longest + wa.random(-200, 199) end
    end
  end
  mine:arm(fuse)
end

-- PX's DoMagneticField: \`scale\` 1 pushes, 0 only triggers mines and wakes
-- balls (a discharging or exploding magnet). A moving magnet wakes what it
-- reaches, as PX's.
local function field(m, scale, wake)
  wake = wake or m.vx ~= 0 or m.vy ~= 0
  local mines = wa.mines.all()
  for _, mine in ipairs(mines) do
    local dx, dy = force(m, mine.x, mine.y, scale)
    if dx then
      trigger_mine(m, mine, mines)
      if dx ~= 0 or dy ~= 0 then mine:impulse(dx, dy) end
    end
  end
  if not (m.ended_at and m.age - m.ended_at > RELEASE_AFTER) then
    for _, missile in ipairs(wa.missiles.all()) do
      local dx, dy = force(m, missile.x, missile.y, scale)
      if dx and (dx ~= 0 or dy ~= 0) then missile:impulse(dx, dy) end
    end
  end
  if shared.magnet_bowling_balls then
    shared.magnet_bowling_balls(function(x, y) return force(m, x, y, scale * BALL_SHARE) end, wake)
  end
end

local function sprite(m)
  local name = m.pol < 0 and "magnet" or "magnet2"
  if m.health <= LOW_HEALTH then name = name .. "_damaged" end
  return BODY .. name .. ".png"
end

local function remove(m)
  m.alive = false
  for i, other in ipairs(magnets) do
    if other == m then table.remove(magnets, i); break end
  end
end

local function discharge(m)
  if m.turns <= 0 then return end
  field(m, 0, true)
  m.turns = 0
end

-- One frame of the body: gravity, then the move traced against the land.
local function move(m)
  local vx, vy = m.vx, m.vy + wa.world.gravity()
  local function trace()
    return wa.world.trace({ x0 = m.x, y0 = m.y, x1 = m.x + vx, y1 = m.y + vy, radius = RADIUS })
  end
  local res = trace()
  if res and res.starts_solid then
    -- Inside the land (dropped in a tunnel, or the land moved): out where
    -- the path comes free, else a pixel up a frame until it does.
    if not res.left_x then
      m.y, m.vx, m.vy = m.y - P, 0, 0
      return
    end
    m.x, m.y = res.left_x, res.left_y
    res = trace()
  end
  if res and res.hit then
    local spn = vx * res.nx + vy * res.ny
    local spt = vx * res.tx + vy * res.ty
    vx = trunc(vx - spn * res.nx * (1 + BOUNCE) - spt * res.tx * FRICTION)
    vy = trunc(vy - spn * res.ny * (1 + BOUNCE) - spt * res.ty * FRICTION)
    if math.abs(vx) < REST and math.abs(vy) < REST then vx, vy = 0, 0 end
    m.x, m.y = res.x, res.y
  else
    m.x, m.y = m.x + vx, m.y + vy
  end
  m.vx, m.vy = vx, vy
end

local function frame(m, a)
  m.age = m.age + 1
  if m.y >= wa.world.water() then
    -- In the water: it stops working and sinks out of sight.
    discharge(m)
    m.vx, m.vy, m.y = 0, 0, m.y + SINK
    if m.y >= wa.world.water() + SUNK then
      remove(m)
      a:despawn()
      return
    end
  else
    move(m)
  end
  a.x, a.y, a.vx, a.vy = m.x, m.y, 0, 0
  if m.health <= 0 then
    field(m, 0, true)
    remove(m)
    a.y = m.y - 20 * P
    a:explode(BOOM)
    a:despawn()
    return
  end
  if m.turns > 0 then
    field(m, 1)
    m.spark = (m.spark + 0.02) % 1.4
  end
  -- PX's UpdateRotation: spun by its speed, at most half a radian a frame.
  local speed = math.sqrt((m.vx / P) ^ 2 + (m.vy / P) ^ 2)
  m.angle = m.angle + (m.vx < 0 and -1 or 1) * math.min(0.5, 0.04 * speed)
  local s = sprite(m)
  if s ~= m.sprite then a:look(s); m.sprite = s end
  a:gfx({ angle = math.deg(m.angle + math.pi) % 360, depth = 0x000E0000 })
end

-- PX's TakeExplosionDamage (less the further off: dmg * (1 - d^2 / (4 dmg^2)))
-- and TakeDamage (type 10, the Battle Axe's, takes that share of its health).
local function hit(m, a, event)
  local damage = math.max(0, event.damage or 0)
  if event.kind == "blast" and damage > 0 then
    local dx, dy = (a.x - (event.x or a.x)) / P, (a.y - (event.y or a.y)) / P
    damage = trunc((1 - (dx * dx + dy * dy) / (damage * damage * 4)) * damage)
  elseif event.hit_kind == 10 then
    damage = trunc(m.health * damage / 100)
  end
  if damage > 0 then m.health = m.health - damage end
  m.vx = m.vx + (event.vx or 0)
  m.vy = m.vy + (event.vy or 0)
end

-- CWorm::FireFinal's Electromagnet: dropped where it is fired (at the
-- worm), nudged the way the worm faces (0.3) and up (0.15), in the worm's
-- mode. A script firing it (wa.weapons.fire, the stress test) may choose
-- the mode with \`polarity\` (1 repel, -1 attract).
shared.fires.electromagnet = function(fire)
  local worm = fire.worm
  local pol = (fire.polarity == 1 or fire.polarity == -1) and fire.polarity or polarity[worm.id] or 1
  local m = { pol = pol, turns = TURNS, health = HEALTH, age = 0, angle = 0, spark = 0, alive = true,
    x = fire.x or worm.x, y = fire.y or worm.y,
    vx = worm.vx + (worm.facing < 0 and -1 or 1) * trunc(0.3 * P),
    vy = worm.vy - trunc(0.15 * P) }
  local a = wa.actors.spawn({
    sprite = BODY .. (pol < 0 and "magnet.png" or "magnet2.png"),
    x = m.x, y = m.y, gravity = false, collide = false, owner = worm,
    as_object = true, on = {
      frame = function(actor) frame(m, actor) end,
      hit = function(actor, event) hit(m, actor, event) end,
    },
  })
  m.a, m.team = a, worm.team
  m.sprite = sprite(m)
  magnets[#magnets + 1] = m
end

-- PX's OnTurnBegin: each start of its owner's team's turn uses one up; the
-- last wakes and triggers what is in range.
wa.on.turn_start(function(event)
  local team = event.worm and event.worm.team
  for _, m in ipairs(magnets) do
    m.ended_at = nil
    if m.alive and m.team == team and m.turns > 0 then
      if m.turns == 1 then discharge(m) else m.turns = m.turns - 1 end
    end
  end
end)

wa.on.turn_end(function()
  for _, m in ipairs(magnets) do m.ended_at = m.age end
end)

-- The Hellish Hand-Grenade slows down in a live field.
wa.on.missile_frame(function(missile)
  if missile.phase ~= "pre" or not DAMPED[missile.weapon] then return end
  for _, m in ipairs(magnets) do
    if force(m, missile.x, missile.y) then
      missile.vx, missile.vy = trunc(missile.vx * DAMPING), trunc(missile.vy * DAMPING)
      return
    end
  end
end)

-- PX switches with WA's bounce keys; here the synchronized + key toggles
-- the turn's worm between repel and attract, kept per worm. The engine
-- flips the worm's red/blue magnet by the same rule (worm_sprites_toggle in
-- the claim), so the two stay in step.
wa.on.worm_message(function(worm)
  local id = worm.id
  local pressed = worm.turn and worm.weapon == "baseball_bat" and wa.world.keys().plus_key or false
  if pressed and not plus_held[id] then polarity[id] = -(polarity[id] or 1) end
  plus_held[id] = pressed
end, { msgs = { wa.msg.FRAME_FINISH } })

if wa.on.hud then
  wa.on.hud(function()
    local worm = shared.current_worm()
    if worm and worm.weapon == "baseball_bat" then
      wa.hud.line((polarity[worm.id] or 1) < 0 and "Electromagnet: ATTRACT mode (+ to repel)"
        or "Electromagnet: REPEL mode (+ to attract)")
    end
  end)
end

if wa.on.draw and wa.draw.quad then
  local function square(x, y, h, angle)
    local c, s = math.cos(angle) * h, math.sin(angle) * h
    return { { x - c + s, y - s - c }, { x + c + s, y + s - c }, { x + c - s, y + s + c }, { x - c - s, y - s + c } }
  end
  wa.on.draw(function()
    for _, m in ipairs(magnets) do
      if m.alive and m.turns > 0 then
        local x, y = m.x, m.y
        local ring = m.pol < 0 and "ring_in.png" or "ring_out.png"
        -- PX starts a ring every 65 frames, 5 to 120 pixels, 0.8 a frame:
        -- outwards repelling, inwards attracting, fading as it grows.
        for phase = 0, 2 do
          local t = (m.age - phase * 65) % 195
          local radius = m.pol < 0 and 120 - 0.8 * t or 5 + 0.8 * t
          if radius >= 5 and radius <= 120 then
            local alpha = math.max(0, math.min(255, math.floor((120 - radius) * 255 / 120)))
            wa.draw.quad({ sprite = BODY .. ring, blend = "add", color = (alpha << 24) | 0xFFFFFF,
              depth = 0x000E0001, points = square(x, y, trunc(radius * P), 0) })
          end
        end
        if m.spark <= 1 then
          wa.draw.quad({ sprite = BODY .. "magnetsparks", frame = math.min(9, math.floor(m.spark * 10)),
            blend = "add", depth = 0x000DFFFF, points = square(x, y, 13 * P, m.angle) })
        end
      end
    end
  end)
end

shared.magnet_force = force -- for the Highlander mock
`
      },
      {
        path: 'weapons/ferret.lua',
        name: 'weapons/ferret.lua',
        language: 'lua',
        content: `-- Highlander: Ferret (PX weapon_ferrets: ferret_s.txt, rafa\`\`2's CFerret).
local shared = require("lib/shared")
local fires = shared.fires

-- Thrown, a Ferret falls until the land is 3 pixels under it, then follows
-- the terrain's outline and never falls off it: PX's square contour tracing,
-- 3-pixel steps, up to 12 traced a frame and 2 walked. It explodes on a worm
-- (the turn's worm is spared for its first 60 frames), on an oil drum, at the
-- water, or when its trace finds no land 4 steps running. It flicks mines
-- and Bowling Balls up (PX's ball is a mine) and walks on. At most 10 walk:
-- a new one makes the oldest vanish. PX's IsMoving says no, so WA doesn't
-- wait for a Ferret, and Ferrets walk on through later turns.
local P = 0x10000
local STEP = 3 * P          -- frt_maxdist
local MAX_FAILS = 4         -- frt_maxfails
local MAX_OPS = 12          -- frt_maxoper
local GRACE = 60            -- frt_framesdam
local TURN_EVERY = 6        -- frt_pixrotat: steps between turns of the sprite
local MAX_ALIVE = 10        -- frt_maxfrtalw
-- Not PX's: a Ferret goes off by itself 15 seconds after it was placed,
-- if nothing set it off before (750 of WA's 50 frames a second).
local FUSE = 15 * 50
-- It touches the land with WA's missile shape, the Skunk's (shape =
-- "missile", a:fits). PX draws its 64-pixel frame centred with the feet 16
-- below the centre: the body is drawn this far from the traced point, away
-- from the land, so the feet meet it.
local LIFT = 13
-- What it runs into is its body: 8 pixels about the body's centre.
local BODY = 8
local SCALE = 0.95          -- frt_sprscale
local DEPTH = 0xE0000       -- in front of the terrain, as the Bowling Ball
local WALK = "sprites/ferret/walk"
local FRAMES = 10
local SOUND = "sounds/ferret/walk.wav"
-- The scheme record's explosion (ExplodeAt): damage 100, blast 50.
local BOOM = { damage = 100, id = 50 }
-- A worm it runs into is thrown first (SpX = TurnSide, SpY = -5), a mine or a
-- ball flicked (SpX = TurnSide, SpY = -7).
local WORM_UP, MINE_UP = -5, -7

local UP, RIGHT, DOWN, LEFT = 1, 2, 4, 8
-- frt_moveto: from where it looks, a turn left or right is a step and a new
-- direction to look in.
local MOVES = {
  [DOWN] = { [LEFT] = { 1, 0, RIGHT }, [RIGHT] = { -1, 0, LEFT } },
  [UP] = { [LEFT] = { -1, 0, LEFT }, [RIGHT] = { 1, 0, RIGHT } },
  [LEFT] = { [LEFT] = { 0, 1, DOWN }, [RIGHT] = { 0, -1, UP } },
  [RIGHT] = { [LEFT] = { 0, -1, UP }, [RIGHT] = { 0, 1, DOWN } },
}

local alive = {} -- the Ferrets walking, oldest first
-- WA places a Ferret at its worm, where its circle overlaps the ground:
-- traced from inside the land, it would turn on the spot for ever. It rises
-- until its circle is clear of the land, at most this far, and walks from
-- the surface.
local MAX_RISE = 64

local function land_at(f, x, y)
  return not f.a:fits(x, y)
end

local function rise_clear(f)
  for _ = 1, MAX_RISE do
    if not land_at(f, f.x, f.y) then return end
    f.y = f.y - P
  end
end

local function move(f, dir)
  local m = MOVES[f.looking][dir]
  f.ax, f.ay, f.looking = f.ax + m[1] * STEP, f.ay + m[2] * STEP, m[3]
end

-- frt_square_tracing: from the last outline point, turn towards the land
-- while there is land, away from it while there is none, adding each new
-- land point to the outline to walk.
local function trace(f)
  f.ax, f.ay = f.px, f.py
  f.looking = f.looking_bk
  while true do
    if f.ops <= 0 then
      f.tracing, f.walking, f.fails, f.ops = false, true, 0, MAX_OPS
      return
    end
    if f.fails >= MAX_FAILS then
      f.tracing, f.walking, f.boom, f.fails, f.why = false, false, true, 0, "a dead end"
      return
    end
    if land_at(f, f.ax, f.ay) then
      f.fails = 0
      if f.ax ~= f.px or f.ay ~= f.py then
        f.looking_bk = f.looking
        f.px, f.py = f.ax, f.ay
        f.outline[#f.outline + 1] = { f.ax, f.ay }
      end
      move(f, f.side < 0 and RIGHT or LEFT)
    else
      f.fails = f.fails + 1
      move(f, f.side < 0 and LEFT or RIGHT)
    end
    f.ops = f.ops - 1
  end
end

-- Its body's centre, LIFT from the traced point along the land's normal.
local function body(f, x, y)
  return x + math.floor(f.ux * LIFT * P), y + math.floor(f.uy * LIFT * P)
end

-- frt_checkinteract, at a point of its way: what its body touches.
local function interact(f, x, y)
  x, y = body(f, x, y)
  local _, obj = wa.world.collides({ x = x, y = y, radius = BODY, with = { "worms", "mines", "oil" } })
  if obj then
    if obj.kind == "worm" then
      local current = shared.current_worm()
      if f.grace > 0 and current and current.id == obj.id then return end
      obj.vx, obj.vy = f.side * P, WORM_UP * P
      f.boom, f.walking, f.tracing, f.why = true, false, false, "a worm"
    elseif obj.kind == "oil" then
      f.boom, f.walking, f.tracing, f.why = true, false, false, "an oil drum"
    elseif obj.kind == "mine" then
      obj.vx, obj.vy = f.side * P, MINE_UP * P
    end
  end
  if shared.kick_bowling_balls then
    shared.kick_bowling_balls(x, y, BODY, f.side, MINE_UP)
  end
end

-- frt_calc_rotation: every few steps, the Ferret turns to the way walked
-- since its last turn, its up the land's normal (from the steps, one square
-- root: the same on every machine; the angle is only drawn).
local function turn(f, x, y)
  f.steps = f.steps + 1
  if f.steps % TURN_EVERY ~= 0 then return end
  local dx, dy = (x - f.rx) / P, (y - f.ry) / P
  local len = math.sqrt(dx * dx + dy * dy)
  if len > 0 then
    f.ux, f.uy = f.side * dy / len, -f.side * dx / len
  end
  f.angle = math.atan(dx, -dy) - math.pi / 2 * f.side
  f.rx, f.ry = x, y
end

-- frt_perform_trace: one step along the outline; at its end, trace on.
local function walk(f)
  if f.boom then return false end
  local p = f.outline[f.next]
  if not p then
    f.walking, f.tracing = false, true
    f.outline, f.next = {}, 1
    f.x, f.y = f.lx, f.ly
    return false
  end
  f.next = f.next + 1
  f.x, f.y = p[1], p[2]
  interact(f, f.x, f.y)
  turn(f, f.x, f.y)
  f.lx, f.ly = f.x, f.y
  return true
end

-- Before it lands, it falls (or flies as thrown), a pixel at a time, and
-- stops where its shape would touch the land.
local function fly(f)
  f.vy = f.vy + wa.world.gravity()
  local n = math.min(64, math.max(math.abs(f.vx), math.abs(f.vy)) // P + 1)
  local sx, sy = f.vx // n, f.vy // n
  for _ = 1, n do
    if land_at(f, f.x + sx, f.y + sy) then
      f.vx, f.vy = 0, 0
      return
    end
    f.x, f.y = f.x + sx, f.y + sy
  end
end

-- frt_firstcollision: land 3 pixels under it plants it, and its outline
-- starts there.
local function try_plant(f, a)
  local x, y = f.x, f.y + STEP
  if land_at(f, x, y) then
    f.planted, f.tracing = true, true
    f.px, f.py, f.ax, f.ay, f.lx, f.ly, f.rx, f.ry = x, y, x, y, x, y, x, y
    wa.sound.play(a, SOUND)
  end
  interact(f, f.x, f.y)
end

local function forget(f)
  for i, other in ipairs(alive) do
    if other == f then table.remove(alive, i); return end
  end
end

local function explode(f, a)
  wa.log(string.format("Ferret explodes on %s at (%d, %d), %d frames after it was placed",
    f.why or "?", f.x // P, f.y // P, f.age))
  f.dead = true
  forget(f)
  a:explode(BOOM)
  if a.id ~= 0 then a:despawn() end
end

local function frame(f, a)
  if f.dead then return end
  f.age = f.age + 1
  if f.gone then
    f.dead = true
    a:despawn()
    return
  end
  if not f.planted then
    fly(f)
    try_plant(f, a)
  end
  if f.y >= wa.world.water() - STEP then f.boom, f.why = true, f.why or "the water" end
  if f.age >= FUSE then f.boom, f.why = true, f.why or "its 15 s fuse" end
  if f.boom then
    explode(f, a)
    return
  end
  if f.tracing then trace(f) end
  if f.walking and walk(f) then walk(f) end
  if f.boom then
    explode(f, a)
    return
  end
  f.grace = f.grace - 1
  local bx, by = f.x, f.y
  if f.planted then bx, by = body(f, f.x, f.y) end
  a.x, a.y, a.vx, a.vy = bx, by, 0, 0
  a:frame((f.steps // 2) % FRAMES)
  a:gfx({ angle = math.deg(f.angle) % 360, depth = DEPTH, scale = SCALE })
end

fires.ferret = function(fire)
  local worm = fire.worm
  -- PX lets at most 10 walk: the oldest goes, without a bang.
  while #alive >= MAX_ALIVE do
    local oldest = table.remove(alive, 1)
    oldest.gone = true
  end
  local f = {
    x = fire.x, y = fire.y, vx = fire.vx, vy = fire.vy, ux = 0, uy = -1,
    side = (worm.facing or 1) < 0 and -1 or 1,
    looking = DOWN, looking_bk = DOWN, ops = MAX_OPS, fails = 0,
    outline = {}, next = 1, steps = 0, angle = 0, grace = GRACE, age = 0,
    planted = false, tracing = false, walking = false, boom = false,
  }
  alive[#alive + 1] = f
  local a = wa.actors.spawn({
    sprite = WALK, x = f.x, y = f.y, gravity = false, collide = false, owner = worm,
    shape = "missile", on = function(actor) frame(f, actor) end,
  })
  f.a = a
  rise_clear(f)
  a.facing = f.side
  a:frame(0)
end

shared.ferrets = alive
`
      },
      {
        path: 'weapons/fire_jump.lua',
        name: 'weapons/fire_jump.lua',
        language: 'lua',
        content: `-- Highlander: Fire Jump. Split from rules.lua by tools/split_highlander.py.
local shared = require("lib/shared")
local drills = shared.drills
local follow_drill = shared.follow_drill

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
end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })
`
      },
      {
        path: 'weapons/hang_glider.lua',
        name: 'weapons/hang_glider.lua',
        language: 'lua',
        content: `-- Highlander: Hang-Glider. Split from rules.lua by tools/split_highlander.py.
local shared = require("lib/shared")
local STOPPERS = shared.STOPPERS
local balloons = shared.balloons
local trunc = shared.trunc

-- ------------------------------------------------------------- Hang-Glider
do
  --
  -- PX's paratest (utility_hangglider_render). A worm that opens WA's
  -- parachute with the Hang-Glider flies PX's glider instead: the pack takes
  -- it (worm:take) and moves it with the glider's physics: gravity at 0.75,
  -- the wind blowing along the wing's up side (x3), the speed across the wing
  -- damped, and the nose turning towards the flight path. Up and down turn the
  -- nose, faster the faster it flies; left and right nudge it. Just before it
  -- would run into something (PX's WS_AFTERROPE), on the jump key, in water,
  -- or when the turn ends, it gives the worm back to WA, falling on with the
  -- glider's speed; WA lands it. While it glides, the worm's body is hidden
  -- behind the glider art, which carries the worm; brought down onto land,
  -- the glider's own pack-away plays once WA has the worm standing (PX swaps
  -- sheet 289, wparbak, for it).
  --
  -- PX's speeds and angles are pixels per frame and radians; WA's gravity,
  -- wind and worm speeds are 16.16.

  local GLIDER_GRAVITY = 0.75           -- GliderGravityFactor
  local GLIDER_WIND = 3.0               -- GliderWindFactor
  local GLIDER_FRICTION = 0.25          -- GliderFriction
  local GLIDER_TURN = 0.06              -- GliderMaxAngularVelocity
  local GLIDER_TURN_SPEED = 20.0        -- GliderMaxTurningSpeed
  local GLIDER_ANIM = 0.04              -- GliderAnimSpeed
  local GLIDER_LERP = 0.03              -- GliderRotationLerp
  local GLIDER_PUSH = 0.02              -- GliderMoveAcceleration
  local GLIDER_MAX_ANGLE = 1.5          -- about 86 degrees either way
  local GLIDER_DEPTH = 0x10000          -- in front of worms and terrain
  -- wgldbak: 6 frames, loaded at 24 frames a second; WA runs 50.
  local GLIDER_PACK_FRAMES, GLIDER_PACK_FPS = 6, 24
  -- How long after coming down onto land WA may take to stand the worm up for
  -- the pack-away (frames).
  local GLIDER_PACK_WAIT = 50
  -- WA's fall damage begins at 8 pixels/frame of downward impact speed. Its
  -- fixed-point formula includes one 16.16 unit of bias.
  local GLIDER_SAFE_LANDING_SPEED = 8 * 0x10000 - 1
  local GLIDER_PI = 3.141593

  local gliders = {} -- worm id -> { enabled, deployed, x, y, ang, target, cycle, sx, sy, art, pack, pack_t, landing }

  local function glider_of(worm)
    local g = gliders[worm.id]
    if not g then
      g = { enabled = false, deployed = false, ang = 0, target = 0, cycle = 0, sx = 0, sy = 0 }
      gliders[worm.id] = g
    end
    return g
  end

  -- utils' NormalizeAngle and LerpAngle.
  local function normalize_angle(a)
    while a > GLIDER_PI do a = a - 6.283186 end
    while a <= -GLIDER_PI do a = a + 6.283186 end
    return a
  end

  local function lerp_angle(c, a, b)
    a = normalize_angle(a)
    b = a + normalize_angle(b - a)
    return normalize_angle(a + (b - a) * c)
  end

  local function glider_art(worm, x, y, sheet)
    return wa.actors.spawn({
      sprite = sheet, x = x, y = y, gravity = false,
      collide = false, owner = worm, on = function() end,
    })
  end

  local function glider_drop_art(worm, g)
    if g.art then g.art:despawn(); g.art = nil end
    if g.pack then g.pack:despawn(); g.pack = nil end
    g.pack_x, g.pack_y = nil, nil
    worm.body_visible = true
  end

  local function glider_begin_pack(worm, g)
    g.landing = nil
    if g.art then g.art:despawn(); g.art = nil end
    g.pack, g.pack_t = glider_art(worm, worm.x, worm.y, "sprites/hang_glider/pack"), 0
    g.pack_x, g.pack_y = worm.x, worm.y
    g.pack.facing = -worm.facing
    g.pack:frame(0)
    g.pack:gfx({ depth = GLIDER_DEPTH })
    worm.body_visible = false
  end

  -- TraceMask from (x, y) to where it is heading: anything the worm would
  -- touch there by WA's own test of its shape (worm:fits, every 2 pixels),
  -- and anything else in the way by the Sniper Rifle's estimate of its mask.
  local function glider_blocked(worm, x, y, sx, sy)
    local P = 0x10000
    local x1, y1 = x + trunc(1.1 * sx * P), y + trunc(1.1 * sy * P)
    local n = math.max(1, math.ceil(math.sqrt(sx * sx + sy * sy) * 1.1 / 2))
    for i = 1, n do
      if not worm:fits(x + (x1 - x) * i // n, y + (y1 - y) * i // n) then
        return true
      end
    end
    local len = math.sqrt(sx * sx + sy * sy) * 1.1
    if len == 0 then
      return false
    end
    local dx, dy = sx * 1.1 / len, sy * 1.1 / len
    for _, s in ipairs(STOPPERS) do
      local list, r = s[1], s[2]
      if list and list.all then
        for _, o in ipairs(list.all()) do
          if o.id ~= worm.id then
            local ox, oy = (o.x - x) / P, (o.y - y) / P
            local t = ox * dx + oy * dy
            if t > 0 and t < len and math.abs(ox * dy - oy * dx) < r then
              return true
            end
          end
        end
      end
    end
    return false
  end

  -- CWormGlider::Move: up and down turn the nose, left and right push.
  local function glider_keys(worm, g)
    local k = worm.keys
    local speed = math.sqrt(g.sx * g.sx + g.sy * g.sy) / GLIDER_TURN_SPEED
    if k.up then
      g.ang = math.max(g.ang - GLIDER_TURN * math.min(speed, 1), -GLIDER_MAX_ANGLE)
    end
    if k.down then
      g.ang = math.min(g.ang + GLIDER_TURN * math.max(math.min(speed, 1), 0.5), GLIDER_MAX_ANGLE)
    end
    if k.left then g.sx = g.sx - GLIDER_PUSH end
    if k.right then g.sx = g.sx + GLIDER_PUSH end
  end

  -- CWormGlider::Think's physics, once deployed: the new speed.
  local function glider_think(worm, g)
    local P = 0x10000
    local f = worm.facing
    local ang = f < 0 and g.ang or GLIDER_PI - g.ang
    local fwd_x, fwd_y = -wa.math.cos(ang), wa.math.sin(ang)
    local up_x, up_y
    if f < 0 then up_x, up_y = -fwd_y, fwd_x else up_x, up_y = fwd_y, -fwd_x end
    local sx, sy = g.sx, g.sy
    sy = sy + wa.world.gravity() / P * GLIDER_GRAVITY
    local wind = up_x * wa.world.wind() / P * GLIDER_WIND
    sx, sy = sx + wind * up_x, sy + wind * up_y
    local up_vel = sx * up_x + sy * up_y
    sx, sy = sx - up_x * up_vel * GLIDER_FRICTION, sy - up_y * up_vel * GLIDER_FRICTION
    -- The nose turns towards the flight path, never straight up or down.
    local target = f < 0 and wa.math.atan(sy, -sx) or wa.math.atan(sy, sx)
    target = normalize_angle(target)
    g.target = math.max(-GLIDER_MAX_ANGLE, math.min(GLIDER_MAX_ANGLE, target))
    g.ang = lerp_angle(GLIDER_LERP, g.ang, g.target)
    g.cycle = math.min(g.cycle + GLIDER_ANIM, 1)
    g.sx, g.sy = sx, sy
  end

  -- How many frames after a crash the worm is watched: WA may stand it up
  -- where it hit, as it does a balloon popped against a ceiling.
  local GLIDER_UNSTAND = 3

  -- The glide ends: the worm back to WA, falling on with the glider's speed.
  -- \`landing\`: a gentle landing, so the pack-away plays once WA has the worm
  -- standing. A hard landing gives WA the glider's full speed in its
  -- falling state and lets WA decide whether it causes fall damage and loss
  -- of control. Suppress automatic parachute firing only until WA handles
  -- this impact; otherwise it immediately reopens and slows the worm.
  -- Only a collision
  -- elsewhere needs the short guard against WA standing it up in mid-air.
  local function glider_close(worm, g, landing, hard_landing)
    local P = 0x10000
    g.deployed = false
    -- A gentle landing can spend several frames falling under WA's control
    -- before WA stands the worm up. Keep the wing over its body until the
    -- pack-away takes its place, so it never flashes empty-handed.
    if landing then
      g.art = g.art or glider_art(worm, worm.x, worm.y, "sprites/hang_glider/glider")
      worm.body_visible = false
    else
      glider_drop_art(worm, g)
    end
    wa.sound.play(worm, "sounds/hang_glider/hangclose.wav")
    g.landing = landing and GLIDER_PACK_WAIT or nil
    g.unstand = not (landing or hard_landing) and GLIDER_UNSTAND or nil
    if worm.taken then
      local vx, vy = trunc(g.sx * P), trunc(g.sy * P)
      if hard_landing then
        worm:release(vx, vy, { suppress_auto_parachute = true })
      else
        worm:release(vx, vy)
      end
    end
  end

  local function glider_frame(worm)
    local state = worm.state
    local b = balloons[worm.id]
    local equipped = b and b.equipped_weapon
    if b and b.active then
      local g = gliders[worm.id]
      if g then g.enabled = false end
      return
    end
    -- A glider may have auto-opened and cleared its selected slot before its
    -- first frame. The slot equipped before opening is authoritative.
    local g = gliders[worm.id]
    if not g then
      if (state == "parachuting" and equipped ~= "parachute")
          or (state ~= "parachuting" and worm.weapon ~= "parachute") then
        return
      end
      g = glider_of(worm)
    end
    local P = 0x10000
    if g.deployed then
      -- The engine let go: the turn ended, or WA knocked the worm flying.
      if not worm.taken then
        glider_close(worm, g, false)
        return
      end
      glider_keys(worm, g)
      glider_think(worm, g)
      if glider_blocked(worm, g.x, g.y, g.sx, g.sy) then
        -- Onto land below it: WA handles the impact with the glider's full
        -- speed. Only a fall below its damage threshold gets the pack-away.
        local below = g.sy > 0 and not worm:fits(g.x, g.y + trunc((1.1 * g.sy + 4) * P))
        local hard_landing = below and trunc(g.sy * P) >= GLIDER_SAFE_LANDING_SPEED
        glider_close(worm, g, below and not hard_landing, hard_landing)
        return
      end
      local x, y = g.x + trunc(g.sx * P), g.y + trunc(g.sy * P)
      if y >= wa.world.water() then
        glider_close(worm, g, false)
        return
      end
      g.x, g.y = x, y
      worm:carry(x, y)
      -- CWormGlider::Render, in the worm's place.
      local f = worm.facing
      g.art = g.art or glider_art(worm, x, y, "sprites/hang_glider/glider")
      local a = g.art
      a.x, a.y, a.vx, a.vy, a.facing = x, y, 0, 0, -f
      a:frame(math.min(math.floor(g.cycle * 10), 9))
      a:gfx({ angle = math.deg(f * g.ang) % 360, depth = GLIDER_DEPTH })
      worm.body_visible = false
      return
    end
    if state ~= "parachuting" then
      -- Which parachute the worm opens next: PX checks the weapon only while
      -- the worm is not already under one.
      g.enabled = worm.weapon == "parachute"
      if g.unstand then
        if state == "standing" then
          worm:release(0, 0)
          g.unstand = nil
        else
          g.unstand = g.unstand > 1 and g.unstand - 1 or nil
        end
      end
      -- A land contact starts the pack-away in that frame. Standing is a
      -- fallback if WA did not report a contact; it may arrive 12 frames later.
      if g.landing then
        if state == "standing" and worm.y < wa.world.water() then
          glider_begin_pack(worm, g)
        elseif worm.y >= wa.world.water() or state == "tumbling" then
          g.landing = nil
          glider_drop_art(worm, g)
        else
          g.landing = g.landing > 1 and g.landing - 1 or nil
          if g.landing and g.art then
            g.art.x, g.art.y, g.art.vx, g.art.vy = worm.x, worm.y, 0, 0
            g.art.facing = -worm.facing
            worm.body_visible = false
          else
            glider_drop_art(worm, g)
          end
        end
      end
      if g.pack then
        local frame = g.pack_t * GLIDER_PACK_FPS // 50
        local keys = worm.keys or {}
        local moving = keys.left or keys.right or state == "walking"
          or state == "jump_prepare" or state == "jumping"
          or math.abs(worm.x - g.pack_x) > P
        local landing_state = state == "standing" or state == "sliding"
          or state == "jump_falling" or state == "falling"
        if frame >= GLIDER_PACK_FRAMES or moving or not landing_state
            or worm.y >= wa.world.water() then
          glider_drop_art(worm, g)
        else
          g.pack.x, g.pack.y, g.pack.vx, g.pack.vy = worm.x, worm.y, 0, 0
          g.pack.facing = -worm.facing -- its art faces left, as WA's worms do
          g.pack:frame(frame)
          g.pack:gfx({ depth = GLIDER_DEPTH })
          worm.body_visible = false
          g.pack_t = g.pack_t + 1
        end
      end
      -- Its speed carries over into the glide.
      g.sx, g.sy = worm.vx / P, worm.vy / P
      return
    end
    g.enabled = equipped == "parachute"
    if not g.enabled or g.deployed or state ~= "parachuting" then
      return -- a plain parachute, or the balloon
    end
    -- WA has opened its parachute: the pack takes the worm and glides.
    g.deployed, g.ang, g.target, g.cycle, g.landing, g.unstand = true, 0, 0, 0, nil, nil
    g.x, g.y = worm.x, worm.y
    if g.pack then g.pack:despawn(); g.pack = nil end
    worm:take{ turn = "run" }
    wa.sound.play(worm, "sounds/hang_glider/hangopen.wav")
    return glider_frame(worm)
  end

  if wa.world.gravity and wa.world.wind then
    if wa.on.contact then
      wa.on.contact(function(worm, other)
        local g = gliders[worm.id]
        if g and g.landing and other.kind == "land" and worm.y < wa.world.water() then
          local keys = worm.keys or {}
          if keys.left or keys.right then
            g.landing = nil
            glider_drop_art(worm, g)
          else
            glider_begin_pack(worm, g)
          end
        end
      end)
    end
    wa.on.worm_message(function(worm, msg)
      if msg == wa.msg.FRAME_FINISH then
        glider_frame(worm)
        return
      end
      local g = gliders[worm.id]
      if g and g.pack and (msg == wa.msg.JUMP or msg == wa.msg.JUMP_UP) then
        glider_drop_art(worm, g)
        return
      end
      if not (g and g.deployed) then
        return
      end
      if msg == wa.msg.JUMP then
        -- The jump key closes WA's parachute: here it lets go of the glider.
        glider_close(worm, g, false)
        return "eat"
      end
    end, { msgs = { wa.msg.FRAME_FINISH, wa.msg.JUMP, wa.msg.JUMP_UP } })
  end
end
`
      },
      {
        path: 'weapons/helicopter.lua',
        name: 'weapons/helicopter.lua',
        language: 'lua',
        content: `-- Highlander: Helicopter. Split from rules.lua by tools/split_highlander.py.
local shared = require("lib/shared")

-- -------------------------------------------------------------- Helicopter
-- Shared with later sections; the rest of this section is local to it.
local FX, trunc
do
--
-- PX's helicopter_user_script, on WA's jet pack. While the jet pack runs,
-- the script flies the worm itself from the worm's own move keys. The engine
-- consumes them after this callback, so WA neither thrusts nor burns fuel.
-- Speed builds while a key is held and dies away when it is not; fuel burns
-- with it (not during retreat), and a crash -- an explosion sized by the fuel
-- left and the speed -- when the fuel runs out, the worm reaches water, the
-- turn ends, or it hits something other than a mine faster than a pixel a
-- frame, the ground included: landing slower than that is PX's smooth
-- landing. The worm's body is hidden behind the helicopter, and behind PX's
-- climb-in animation while WA winds the jet pack up; its labels, the fuel
-- counter among them, stay, as with PX's RenderWorm override.
--
-- PX's speeds and factors are fixed point: 1.0 is 0x10000 here, and its
-- arithmetic truncates.

local HELI_FUEL = 100            -- FuelAmount
local HELI_REALISTIC = true      -- gravity and wind act on it, at 0.2
local HELI_EXPLODE_ON_TURN_END = true
local HELI_DEPTH = 0x10000       -- in front of worms and terrain
FX = 0x10000

local helis = {} -- worm id -> { flying, launch, jumpin, jump_phase, frame, ticks, body, climb }

function trunc(v)
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
local function heli_crash(worm, h, sx, sy)
  if not h.flying then
    return
  end
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
    worm:jetpack_steer(true)
    h.flying, h.launch, h.ticks, h.armed = true, true, 0, false
  elseif h and h.armed and not worm.turn then
    h.armed = false -- the turn ended before it fired
  end
  if not h then
    return
  end
  if h.flying then
    if state ~= "jetpacking" then
      -- WA owns the landing and its resulting state. Only remove our art
      -- and physics overrides when WA has ended the jet pack.
      worm:jetpack_steer(false)
      worm.gravity, worm.wind = FX, 0
      h.flying = false
      heli_drop_art(h, worm)
      return
    end
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
      heli_crash(worm, h, vx, vy)
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
    worm.vx, worm.vy, worm.fuel = trunc(vx), trunc(vy), trunc(fuel)
    if worm.fuel <= 0.1 * FX then
      heli_crash(worm, h, worm.vx, worm.vy)
      return
    end
    if HELI_EXPLODE_ON_TURN_END and not worm.turn then
      heli_crash(worm, h, worm.vx, worm.vy)
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
end, { msgs = { wa.msg.FRAME_FINISH } })

-- Collide: hitting anything but a mine faster than a pixel a frame crashes
-- it, the ground included -- a slow landing is PX's smooth landing -- judged
-- on the speed before WA exchanged velocities.
if wa.on.contact then
  wa.on.contact(function(worm, other, c)
    local h = helis[worm.id]
    if h and h.flying and other.kind ~= "mine"
        and (math.abs(c.vx) > FX or math.abs(c.vy) > FX) then
      heli_crash(worm, h, c.vx, c.vy)
    end
  end)
end
end

-- Shared by the balloon and glider handlers to recognize the equipped weapon.
local balloons = {}

shared.FX = FX
shared.balloons = balloons
shared.trunc = trunc
`
      },
      {
        path: 'weapons/hot_air_balloon.lua',
        name: 'weapons/hot_air_balloon.lua',
        language: 'lua',
        content: `-- Highlander: Hot Air Balloon. Split from rules.lua by tools/split_highlander.py.
local shared = require("lib/shared")
local FX = shared.FX
local balloons = shared.balloons

-- --------------------------------------------------------- Hot Air Balloon
do
  --
  -- PX's balloon_s (r2_balloon by rafa''2, modified by 0rang3). PX flies it on
  -- WA's parachute with the worm's gravity turned upside down; here the pack
  -- flies it (worm:take) with WA's own parachute physics, upside down. WA 3.8.1,
  -- per frame (0x4FCB30): the speed gains gravity times the worm's gravity
  -- factor and, unless the worm is against land beside it, the wind times its
  -- wind factor; then both speeds are damped. Its parachute (SetState 0x7D at
  -- 0x50EBE2 and 0x50EC57) damps them to 0.8 and takes the wind factor from the
  -- weapon record's +0x38 in percent: the patched bungee's fire_method, 100.
  -- So it rises at up to four times gravity and drifts with four times the
  -- wind. The arrow keys push it as they push WA's parachute (0x513EB0, run
  -- before that step): half of gravity a frame each way held (through the
  -- worm's +0x44 push, divided by its mass, 1.0), opposite keys cancelling. It pops -- the worm given back to WA, falling -- on touching land,
  -- in water, on the jump key (which closes WA's parachute), and when the
  -- turn ends. The worm's body is hidden behind the balloon, drawn in its
  -- team's colour, and the worm in its basket, as PX's RenderWorm override.
  --
  -- It still opens as WA's parachute (the patched bungee, by hand or
  -- automatically); the pack takes the worm on the first frame of it.

  local BALLOON_DAMP = 0xCCCC       -- WA's parachute damping, 0.8
  local BALLOON_WIND = 100          -- the patched bungee's fire_method, in percent
  local BALLOON_DEPTH = 0x10001     -- behind the basket, in front of worms
  local BASKET_DEPTH = 0x10000
  -- PX's GetTeamColorRGB, by WA's colour index (worm.alliance, 0 red .. 5 cyan).
  -- PX adds it to its dark grey balloon (SetColorMod mode 8); the GPU tint
  -- multiplies, so the pack's balloon art is PX's lightened to white, and the
  -- team colour shows at full strength.
  local TEAM_RGB = { 0xFF8080, 0x0096FF, 0x00D000, 0xFFFF40, 0xE800E8, 0x50FFFF }

  -- Also records the weapon equipped before WA changes the visible slot while
  -- opening a parachute, for both the balloon and glider handlers.
  -- worm id -> { active, x, y, vx, vy, ticks, equipped_weapon, balloon, basket }

  local function balloon_of(worm)
    local b = balloons[worm.id]
    if not b then
      b = { active = false, ticks = 0 }
      balloons[worm.id] = b
    end
    return b
  end

  local function balloon_sound(worm, name, n)
    wa.sound.play(worm, "sounds/balloon/" .. name .. wa.random(1, n) .. ".wav")
  end


  -- How many frames after popping against land the worm is watched: WA may
  -- stand it up there, in mid-air under a ceiling.
  local BALLOON_UNSTAND = 3

  -- StopBalloon: a pop, and the worm back to WA, falling with its speed.
  -- Against land it keeps no upward speed, and for a few frames, if WA has
  -- stood it up, it is released again, falling: PX's balloon does the same
  -- (WS_IDLE -> WS_SLIDING) when WA's parachute closes against the land.
  -- \`why\` goes to the log with each pop, so a report of a balloon that
  -- would not pop can be traced to what ended it.
  local function balloon_stop(worm, b, why, against_land)
    if not b.active then
      return
    end
    wa.log(string.format(
      "highlander: balloon of worm %d popped after %d frames: %s (turn clock %d ms)",
      worm.id, b.ticks, why, wa.world.turn_clock()
    ))
    b.active, b.ticks = false, 0
    if b.balloon then b.balloon:despawn(); b.balloon = nil end
    if b.basket then b.basket:despawn(); b.basket = nil end
    worm.body_visible = true
    balloon_sound(worm, "pop", 4)
    local vy = against_land and math.max(b.vy, 0) or b.vy
    if worm.taken then
      worm:release(b.vx, vy)
    end
    b.unstand = against_land and BALLOON_UNSTAND or nil
  end

  local function balloon_draw(worm, b)
    -- DrawBalloonWorm: the balloon above, in the team's colour, and the worm
    -- in its basket, whose art faces left.
    local f = worm.facing
    local function art(sheet)
      return wa.actors.spawn({
        sprite = sheet, x = b.x, y = b.y, gravity = false,
        collide = false, owner = worm, on = function() end,
      })
    end
    b.balloon = b.balloon or art("sprites/balloon/balloon")
    b.basket = b.basket or art("sprites/balloon/basket")
    local x = b.x + 6 * f * FX
    b.balloon.x, b.balloon.y, b.balloon.vx, b.balloon.vy = x, b.y - 43 * FX, 0, 0
    b.balloon:frame(math.min((b.ticks % 200) * 16 // 200, 15))
    b.balloon:gfx({ tint = 0xFF000000 | (TEAM_RGB[(worm.alliance or 0) + 1] or 0xFFFFFF),
      depth = BALLOON_DEPTH })
    b.basket.x, b.basket.y, b.basket.vx, b.basket.vy = x, b.y + 3 * FX, 0, 0
    b.basket.facing = -f
    b.basket:frame(math.min((b.ticks % 80) * 17 // 80, 16))
    b.basket:gfx({ depth = BASKET_DEPTH })
    worm.body_visible = false
  end

  local function balloon_frame(worm)
    local b = balloon_of(worm)
    local state = worm.state
    -- WA may change the selected slot to Parachute (or none) as Bungee fires.
    -- The weapon equipped before that transition identifies the auto trigger;
    -- an unrelated parachute opening must not become a Hot Air Balloon.
    local equipped = b.equipped_weapon
    if not b.active and state == "parachuting" and not b.was_parachuting
        and equipped == "bungee" then
      b.active, b.ticks = true, 0
      -- A key still held from the launch is not a press in flight.
      local held = wa.world.keys()
      b.held_keys = { space = held.space, jump = held.jump }
      b.x, b.y, b.vx, b.vy = worm.x, worm.y, worm.vx, worm.vy
      worm:take{ turn = "run" }
      balloon_sound(worm, "inflate", 3)
    end
    b.was_parachuting = state == "parachuting"
    if state ~= "parachuting" then b.equipped_weapon = worm.weapon end
    if b.unstand then
      if state == "standing" then
        worm:release(0, 0)
        b.unstand = nil
      else
        b.unstand = b.unstand > 1 and b.unstand - 1 or nil
      end
    end
    if not b.active then
      return
    end
    -- The engine let go: the turn ended, or WA knocked the worm flying.
    if not worm.taken then
      balloon_stop(worm, b, "the engine let go (turn over or knocked flying)")
      return
    end
    -- Log every press the synced keyboard state shows in flight, to trace
    -- a press that does not pop the balloon (see the key messages below).
    local pressed = wa.world.keys()
    for _, key in ipairs({ "space", "jump" }) do
      if pressed[key] and not b.held_keys[key] then
        wa.log(string.format("highlander: balloon of worm %d: %s pressed at flight frame %d",
          worm.id, key, b.ticks))
      end
      b.held_keys[key] = pressed[key]
    end
    local P = 0x10000
    local vx, vy = b.vx, b.vy
    -- The arrow keys, as WA's parachute takes them (0x514AC0, 0x513EB0).
    local k = worm.keys or {}
    local left, right, up, down = k.left, k.right, k.up, k.down
    if left and right then left, right = false, false end
    if up and down then up, down = false, false end
    local g = wa.world.gravity()
    local push = g >= 0 and g // 2 or -(-g // 2)
    vx = vx + (right and push or 0) - (left and push or 0)
    vy = vy + (down and push or 0) - (up and push or 0)
    -- WA's parachute physics, gravity upside down (0x4FCB30).
    vy = vy - g * worm.gravity // P
    local side = wa.world.wind() >= 0 and P or -P
    if worm:fits(b.x + side, b.y) then
      vx = vx + wa.world.wind() * (BALLOON_WIND * P // 100) // P
    end
    vx, vy = vx * BALLOON_DAMP // P, vy * BALLOON_DAMP // P
    b.vx, b.vy = vx, vy
    local x, y = b.x + vx, b.y + vy
    -- It pops on touching land, as WA's parachute closes there: where WA's
    -- own test says the worm would touch it, so it never sits inside it.
    if not worm:fits(x, y) then
      balloon_stop(worm, b, "touched land", true)
      return
    end
    if y >= wa.world.water() then
      balloon_stop(worm, b, "reached the water")
      return
    end
    b.x, b.y = x, y
    worm:carry(x, y)
    b.ticks = b.ticks + 1
    balloon_draw(worm, b)
  end

  -- WA's key messages, named for the log. In flight WA sends jump for Space
  -- and fire for Enter.
  local BALLOON_KEY_MESSAGES = {
    [wa.msg.JUMP] = "jump", [wa.msg.JUMP_UP] = "backflip",
    [wa.msg.FIRE_WEAPON] = "fire", [wa.msg.RELEASE_WEAPON] = "release",
  }

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FRAME_FINISH then
      balloon_frame(worm)
      return
    end
    local b = balloons[worm.id]
    if not (b and b.active) then
      return
    end
    local key = BALLOON_KEY_MESSAGES[msg]
    if key then
      wa.log(string.format("highlander: balloon of worm %d got WA's %s message at flight frame %d",
        worm.id, key, b.ticks))
    end
    if msg == wa.msg.JUMP then
      -- The jump key closes WA's parachute: here it pops the balloon.
      -- In flight WA sends it for Space.
      balloon_stop(worm, b, "jump key (Space in flight)")
      return "eat"
    end
  end, { msgs = { wa.msg.FRAME_FINISH, wa.msg.JUMP, wa.msg.JUMP_UP, wa.msg.FIRE_WEAPON, wa.msg.RELEASE_WEAPON } })

  -- M_TURNBEGIN: any balloon still up pops.
  wa.on.turn_start(function()
    for _, worm in ipairs(wa.worms.all()) do
      local b = balloons[worm.id]
      if b and b.active then
        balloon_stop(worm, b, "a new turn began")
      end
    end
  end)
end
`
      },
      {
        path: 'weapons/ice_arrow.lua',
        name: 'weapons/ice_arrow.lua',
        language: 'lua',
        content: `-- Ice Arrow: let WA's ArrowEntity apply the bow hit and its momentum, then
-- freeze the worm on its next frame. PX's CWorm::Message defers SetState in
-- exactly this way, so the hit's native state setup runs first.
local pending = {} -- stable worm id -> freeze on that worm's next frame

wa.on.hurt(function(hit)
  if hit.phase == "post" and hit.source_weapon == "armageddon"
    and hit.kind == "hit" then
    pending[hit.worm.id] = true
  end
end)

wa.on.worm_message(function(worm)
  if pending[worm.id] then
    pending[worm.id] = nil
    worm:freeze()
  end
end, { msgs = { wa.msg.FRAME_FINISH } })
`
      },
      {
        path: 'weapons/javelin.lua',
        name: 'weapons/javelin.lua',
        language: 'lua',
        content: `-- Highlander: Javelin. Split from rules.lua by tools/split_highlander.py.
local shared = require("lib/shared")
local current_worm = shared.current_worm
local fires = shared.fires
local trunc = shared.trunc

-- ---------------------------------------------------------------- Javelin

do
  local speed = {}
  -- Pre keeps the incoming speed even when this frame's stock collision
  -- destroys the missile. Post keeps acceleration for the following frame.
  wa.on.missile_frame(function(m)
    if m.weapon == "prod" then speed[m.id] = { m.vx, m.vy } end
  end)

  -- How the part of the stamp inside the land fades: over 3 pixels from the
  -- spear's outline, its colour mixed with the earth's. Tuned by eye in game.
  local JAVELIN_BURIED = { soften = 3, blend = "mix" }

  local function trunc(n) return n < 0 and math.ceil(n) or math.floor(n) end
  local function orientation(vx, vy)
    if vx == 0 then return vy > 0 and 16 or 0 end
    if vy == 0 then return vx > 0 and 8 or 24 end
    -- PX uses ratio bins, not evenly spaced atan2 angles.
    if vx > 0 and vy < 0 then return math.min(trunc(3 * vx / -vy), 7) end
    if vx > 0 then return math.min(trunc(8 + 3 * vy / vx), 15) end
    if vy > 0 then return math.min(trunc(16 + 3 * -vx / vy), 23) end
    return math.min(trunc(24 + 3 * -vy / -vx), 31)
  end
  local function within(o, x, y, r)
    return o and math.abs(x - o.x) < r * 0x10000 and math.abs(y - o.y) < r * 0x10000
  end
  fires.javelin = function(ev)
    local v = ev.missile and speed[ev.missile]
    if ev.missile then speed[ev.missile] = nil end
    local vx, vy = v and v[1] or 0, v and v[2] or 0
    local target
    -- The circle encloses PX's strict 20px square. Keep native traversal
    -- order, including the shooter; PX stops at the first eligible object.
    for _, o in ipairs(wa.world.electrical_nearby(ev.x, ev.y, 29, false)) do
      if (o.kind == "worm" or o.kind == "mine" or o.kind == "crate" or o.kind == "oil")
        and within(o, ev.x, ev.y, 20) then target = o; break end
    end
    if not target then
      local active = current_worm()
      if within(active, ev.x, ev.y, 25) then target = active end
    end
    if target then
      target.vx, target.vy = trunc(vx / 4), trunc(vy / 4)
      if target.kind == "worm" then target:hurt(20)
      else target:hit(20, trunc(vx / 2), trunc(vy / 2), "projectile") end
      return
    end
    -- Centred on the impact, as PX's, so its front half lies in the land:
    -- that half fades into the earth (the engine's buried stamp) instead of
    -- being drawn over it, and the javelin looks stuck.
    wa.land.stamp{
      sprite = "sprites/javelin/stamp", frame = orientation(vx, vy), x = ev.x, y = ev.y,
      buried = JAVELIN_BURIED,
    }
    -- PX plays it unplaced. On the turn's worm: an explosion's ev.worm is the
    -- missile's owner, which need not be a worm and has no sound of its own.
    local shooter = current_worm()
    if shooter then wa.sound.play(shooter, "sounds/javelin_impact.wav") end
  end
end
`
      },
      {
        path: 'weapons/jump.lua',
        name: 'weapons/jump.lua',
        language: 'lua',
        content: `-- Highlander: Jump. Split from rules.lua by tools/split_highlander.py.
local shared = require("lib/shared")
local fires = shared.fires

-- ------------------------------------------------------------------ Jump
do
--
-- PX's jumpscript (utility_jump). Its record throws like a grenade, but
-- nothing leaves the worm: FireFinal gives the worm the shot's own speed --
-- the aim and the charge -- and plays the team's "Jump" line. The worm keeps
-- its aim posture, eyes on the crosshair, until it jumps.
--
-- Differences: PX shows WA's wjump while the charge builds
-- (SetAnimEx(269, FirePower)), which looks ahead rather than along the aim;
-- it also mutes the worm's "Fire!" and "Watch this" lines while the Jump is
-- selected, and stops a fuse and bounce being chosen for it.

-- The first team's "Jump1" speech: WA loads each team's 54 lines in turn
-- after its own sounds, so a worm's is 54 on per team (PX's PlaySoundBank(150)).
local JUMP_SPEECH, SPEECH_LINES = 150, 54

fires.jump = function(fire)
  local worm = fire.worm
  worm:release(fire.vx, fire.vy)
  wa.sound.play(worm, JUMP_SPEECH + SPEECH_LINES * (worm.team - 1))
end
end
`
      },
      {
        path: 'weapons/kamikaze_rocket.lua',
        name: 'weapons/kamikaze_rocket.lua',
        language: 'lua',
        content: `-- Highlander: Kamikaze Rocket (PX weapon_kamikaze_rocket: KamikazeRocket.txt,
-- by Pablo, updated by rafa\`\`2), on the Suicide Bomber slot as PX's
-- Highlander scheme has it. Its record is WA's Kamikaze's: WA's own
-- Kamikaze flies the worm, digs its way and hits the worms it passes. As PX
-- does, the pack sets where the worm is before each of WA's frames: a rocket
-- at 8 px a frame from the worm along its aim, turned 9 degrees a frame by
-- left and right, digging, for 4 seconds; then it blows up (damage 30,
-- blast 100) and the worm goes into the water. Fired only with Ctrl held
-- (Ctrl + Space); without, nothing is used.
local shared = require("lib/shared")
local P = 0x10000

local SPEED = 8             -- px a frame (kRocketSpeed)
local TURN = 0.05           -- PX angle units (times pi) a frame
local LIFE = 4000           -- ms, less 20 a frame: 200 frames
local HOLE = 8              -- MakeHole(8) each frame
local BOOM = { damage = 30, id = 100 }
local HINT_FRAMES = 150
local STALE = 200           -- other worms' frames without one of its own
local FLY = "sprites/kamikaze_rocket/fly"
local FLY_FRAMES, FLY_HALF_W, FLY_HALF_H = 5, 30, 40
local DEPTH = 0x10000

local rockets = {} -- worm id -> its rocket
local armed = {}   -- worm id -> fired with Ctrl, its flight not yet begun
local hint = 0     -- frames left of the "hold Ctrl" line

-- PX's FireFinal: from the worm, at its aim (FireAngle, 0 down to 1 up)
-- on its side.
local function launch(worm)
  rockets[worm.id] = {
    x = worm.x, y = worm.y, angle = worm.aim * worm.facing, life = LIFE, age = 0,
    facing = worm.facing, stale = 0,
  }
  worm.visible = false
end

local function finish(worm)
  rockets[worm.id] = nil
  worm.visible = true
end

-- One of WA's frames, before WA's Kamikaze runs it.
local function fly(worm, r)
  local keys = wa.world.keys()
  if keys.left then r.angle = r.angle + TURN end
  if keys.right then r.angle = r.angle - TURN end
  local a = r.angle * math.pi
  r.x = r.x + math.floor(SPEED * wa.math.sin(a) * P)
  r.y = r.y + math.floor(SPEED * wa.math.cos(a) * P)
  worm.x, worm.y = r.x, r.y
  r.age = r.age + 1
  r.life = r.life - 20
  if r.life <= 0 then
    -- The blast, then the worm out of the map into the water, where WA's
    -- Kamikaze ends it (0x85, drowning).
    local boom = wa.actors.spawn({
      sprite = false, x = r.x, y = r.y, gravity = false, collide = false, owner = worm,
      on = function() end,
    })
    boom:explode(BOOM)
    boom:despawn()
    worm.x, worm.y = -2500 * P, wa.world.water() + 1000 * P
    r.done = true
    return
  end
  wa.land.dig({ x = r.x, y = r.y, radius = HOLE })
end

wa.on.worm_message(function(worm, msg)
  if msg == wa.msg.FIRE_WEAPON then
    if worm.weapon ~= "suicide_bomber" then return end
    if not wa.world.keys().ctrl then
      hint = HINT_FRAMES
      return "eat"
    end
    armed[worm.id] = true
    return
  end
  -- FRAME_FINISH
  if worm.turn and hint > 0 then hint = hint - 1 end
  -- Leaving the map sideways, WA's Kamikaze blows the worm up and frees it:
  -- its frames stop, so its rocket goes once the other worms have had a few.
  for id, other in pairs(rockets) do
    if id ~= worm.id then
      other.stale = other.stale + 1
      if other.stale > STALE then rockets[id] = nil end
    end
  end
  local r = rockets[worm.id]
  if r then r.stale = 0 end
  if worm.state == "kamikaze" then
    if not r and armed[worm.id] then
      armed[worm.id] = nil
      launch(worm)
      r = rockets[worm.id]
    end
    if r and not r.done then fly(worm, r) end
  elseif r then
    finish(worm)
  end
end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })

-- A worm armed but never flying (its fire cancelled) is not armed next turn.
wa.on.turn_start(function()
  armed = {}
end)

if wa.on.hud then
  wa.on.hud(function()
    for _, id in ipairs(wa.sorted(rockets)) do
      local r = rockets[id]
      if not r.done then
        wa.hud.line(string.format("Kamikaze Rocket: %.2f", math.max(0, r.life) / 1000))
      end
    end
    if hint > 0 then
      wa.hud.line("Hold Ctrl and press Space to use the Kamikaze Rocket.")
    end
  end)
end

-- The rocket, drawn as PX's: its art faces down, turned to its heading and
-- mirrored for a worm facing right.
if wa.on.draw and wa.draw.quad then
  local QUAD = { sprite = FLY, blend = "alpha", color = 0xFFFFFFFF, depth = DEPTH,
    points = { { 0, 0 }, { 0, 0 }, { 0, 0 }, { 0, 0 } } }
  local CORNERS = { { -1, -1 }, { 1, -1 }, { 1, 1 }, { -1, 1 } }
  wa.on.draw(function()
    for _, id in ipairs(wa.sorted(rockets)) do
      local r = rockets[id]
      if not r.done then
        local t = -r.angle * math.pi
        local c, s = math.cos(t), math.sin(t)
        local flip = r.facing > 0 and -1 or 1
        QUAD.frame = (r.age // 10) % FLY_FRAMES
        for i, k in ipairs(CORNERS) do
          local dx, dy = k[1] * flip * FLY_HALF_W * P, k[2] * FLY_HALF_H * P
          QUAD.points[i][1] = r.x + math.floor(dx * c - dy * s)
          QUAD.points[i][2] = r.y + math.floor(dx * s + dy * c)
        end
        wa.draw.quad(QUAD)
      end
    end
  end)
end

shared.kamikaze_rockets = rockets -- for the Highlander mock
`
      },
      {
        path: 'weapons/laser_gun.lua',
        name: 'weapons/laser_gun.lua',
        language: 'lua',
        content: `-- Highlander: Laser Gun. Split from rules.lua by tools/split_highlander.py.
local shared = require("lib/shared")
local laser = require("lib/laser")
local fires = shared.fires

-- ------------------------------------------------------------- Laser Gun
--
-- PX's lasergun (CLaserRay). The record is an uzi firing one bullet; PX
-- fires none (FireFinal without super), and each frame sets the worm's shot
-- counters to 0 of 1, so WA keeps the worm in its repeat-fire state, aim
-- live, while a beam burns for 5 s (250 frames) from the worm along its aim.
-- Every fourth frame the beam traces: to the first land, 2048 px at most,
-- cutting 4 px holes there (along the cut when the aim held still); and
-- every worm, mine, crate and oil drum within 5 px of it takes fire damage:
-- a worm 2, then 1 once it has taken 10, and no more after 45 from this beam;
-- an oil drum 4, a crate 1. Drawn: a red strip, its width pulsing from 1.0
-- to 0.5, and glows at the muzzle and where it hits; red sparks from the
-- muzzle, glows rising from the cut, yellow sparks where it touches things.
--
-- Here the engine hands each of WA's shots to on_fire and skips WA's bullet
-- (a gun slot with an on_fire), and the pack holds worm.shots_fired and
-- worm.shots_to_fire as PX does.
--
-- Differences: a mine the beam touches is armed on its fuse, once, rather
-- than sent PX's gun damage (object:hit takes crates and oil drums); the
-- beam's loop sound is played again every 51 frames, not looped.

-- Its own block: the file is at Lua's 200 locals for one chunk.
do
  local LASER_FX = laser.FX
  local LASER_LIFE = 250
  local LASER_REACH = 2048
  local LASER_LOOP_FRAMES = 51 -- laser_loop.wav is 1.02 s
  -- States a worm is not firing in: the beam stops (PX keeps it only in
  -- repeat fire, firing, aiming and fired).
  local LASER_STOPS = { standing = true, sliding = true, jetpacking = true, parachuting = true,
    bungee = true, tumbling = true, teleporting = true, drilling = true, punching = true }
  local lasers = {} -- worm id -> the beam

  local laser_between, laser_particle = laser.between, laser.particle

  -- UpdatePosDir: the beam's direction from the worm's aim (0 down, 1 up)
  -- and side; it starts at the worm and draws from 24 px out.
  local function laser_aim(r, w)
    local ang = (1 - w.aim) * math.pi
    if w.facing < 0 then ang = 2 * math.pi - ang end
    r.dx, r.dy = wa.math.sin(ang), -wa.math.cos(ang)
    r.x = w.x + math.floor((2 * w.facing * r.dy - r.dx) * LASER_FX)
    r.y = w.y + math.floor((-2 - r.dy) * LASER_FX)
    r.gx = r.x + math.floor(24 * r.dx * LASER_FX)
    r.gy = r.y + math.floor(24 * r.dy * LASER_FX)
  end

  local function laser_sparks(r, n, v0, v1, s0, s1)
    local base = (1 - r.aim) * math.pi
    if r.facing < 0 then base = 2 * math.pi - base end
    for _ = 1, n do
      local ang = base + laser_between(r, -0.8, 0.8)
      local v = laser_between(r, v0, v1)
      local s = laser_between(r, s0, s1)
      laser_particle(r, { x = r.gx, y = r.gy, vx = v * math.sin(ang) * LASER_FX,
        vy = -v * math.cos(ang) * LASER_FX, life = 30, drag = 0.3, grav = 0.8,
        s0 = s, s1 = 0.01, c0 = { 255, 0, 0 }, c1 = { 80, 0, 0 } })
    end
  end

  local function laser_objects()
    local out = {}
    for _, group in ipairs({ wa.worms, wa.mines, wa.crates, wa.oil }) do
      if group then
        for _, obj in ipairs(group.all()) do out[#out + 1] = obj end
      end
    end
    return out
  end

  local LASER_RADIUS = { worm = 6, mine = 5, crate = 9, oil = 9 }

  -- PerformTrace with damage: the cut, then everything touching the beam.
  local function laser_trace(r, w)
    local x1 = r.x + math.floor(LASER_REACH * r.dx * LASER_FX)
    local y1 = r.y + math.floor(LASER_REACH * r.dy * LASER_FX)
    local land = wa.land.trace(r.x, r.y, x1, y1)
    local hx, hy = land and land.x or x1, land and land.y or y1
    if land then
      if r.hit and r.dx == r.last_dx and r.dy == r.last_dy then
        -- The aim held: a clean cut from the last hit to this one.
        local steps = math.max(1, math.floor(math.sqrt(((hx - r.hx) / LASER_FX) ^ 2 + ((hy - r.hy) / LASER_FX) ^ 2) / 2))
        for i = 0, steps do
          wa.land.dig({ x = r.hx + (hx - r.hx) * i // steps, y = r.hy + (hy - r.hy) * i // steps, radius = 4 })
        end
      else
        wa.land.dig({ x = hx, y = hy, radius = 4 })
      end
      local s = laser_between(r, 0.6, 0.9)
      laser_particle(r, { x = hx, y = hy, life = 60, drag = 0.2, grav = -0.4, jitter = 0.6,
        s0 = s, s1 = 0.01, c0 = { 255, 0, 0 }, c1 = { 255, 0, 0 } })
      laser_particle(r, { x = hx, y = hy, life = 80, drag = 0, grav = 0,
        s0 = 0.6, s1 = 0.1, c0 = { 200, 0, 0 }, c1 = { 0, 0, 0 } })
    end
    r.hx, r.hy, r.hit = hx, hy, land ~= nil
    local lx, ly = (hx - r.x) / LASER_FX, (hy - r.y) / LASER_FX
    r.draw_beam = lx * lx + ly * ly > 24 * 24
    local length = math.sqrt(lx * lx + ly * ly)
    for _, obj in ipairs(laser_objects()) do
      local ox, oy = (obj.x - r.x) / LASER_FX, (obj.y - r.y) / LASER_FX
      local along = ox * r.dx + oy * r.dy
      local across = math.abs(ox * r.dy - oy * r.dx)
      if along >= 0 and along <= length and across <= 5 + (LASER_RADIUS[obj.kind] or 6)
          and not (obj.kind == "worm" and obj.id == w.id) then
        local key = obj.kind .. ":" .. obj.id
        if obj.kind == "worm" then
          if obj.hp > 0 then
            local taken = r.taken[key] or 0
            local amount = taken >= 45 and 0 or taken >= 10 and 1 or 2
            if amount > 0 then obj:hurt(amount) end
            r.taken[key] = taken + amount
          end
        elseif obj.kind == "oil" or obj.kind == "crate" then
          obj:hit(obj.kind == "oil" and 4 or 1, math.floor(r.dx * LASER_FX), math.floor(r.dy * LASER_FX))
        elseif obj.kind == "mine" and not r.armed[key] then
          r.armed[key] = true
          obj:arm(obj.fuse < 0 and wa.random(1000, 5000) or obj.fuse)
        end
        -- FX_HitObject: a yellow flash and two sparks.
        local px, py = obj.x - math.floor(3 * r.dx * LASER_FX), obj.y - math.floor(3 * r.dy * LASER_FX)
        local tone = math.floor(laser_between(r, 0, 50))
        laser_particle(r, { x = px, y = py, life = 10, drag = 0, grav = 0,
          s0 = laser_between(r, 0.4, 0.8), s1 = 0.01, c0 = { 210, 210 - tone, 0 }, c1 = { 210, 50 - tone, 0 } })
        for _ = 1, 2 do
          local a, v = laser_between(r, 0, 2 * math.pi), laser_between(r, 0.5, 1.8)
          laser_particle(r, { x = px, y = py, vx = v * math.cos(a) * LASER_FX, vy = v * math.sin(a) * LASER_FX,
            life = 30, drag = 0.05, grav = 1, s0 = laser_between(r, 0.2, 0.4), s1 = 0.01,
            c0 = { 255, 255 - tone, 0 }, c1 = { 255, 80 - tone, 0 } })
        end
      end
    end
  end

  local function laser_stop(r, w)
    r.dead = true
    if w then
      -- WA ends the repeat fire, as when its shots run out.
      w.shots_fired = w.shots_to_fire
      wa.sound.play(w, "sounds/laser_gun/laser_end.wav")
    end
  end

  fires.laser = function(fire)
    local w = fire.worm
    -- Each of WA's shots comes here; one beam per worm, as PX's LaserRayObj.
    if lasers[w.id] then return end
    local r = { worm_id = w.id, life = LASER_LIFE, counter = 0, size = 1.0, first = true,
      taken = {}, armed = {}, fx = {}, seed = (w.x // LASER_FX * 7919 + w.y // LASER_FX) % 0x80000000 }
    r.aim, r.facing = w.aim, w.facing
    laser_aim(r, w)
    r.hx, r.hy, r.last_dx, r.last_dy = r.x, r.y, r.dx, r.dy
    lasers[w.id] = r
    wa.sound.play(w, "sounds/laser_gun/laser_start.wav")
    wa.sound.play(w, "sounds/laser_gun/laser_loop.wav")
    wa.actors.spawn({
      sprite = false, x = w.x, y = w.y, gravity = false, collide = false, owner = w,
      on = function(a)
        r.life = r.life - 1
        laser.step(r)
        if r.dead then
          if r.life <= -10 and #r.fx == 0 then
            lasers[r.worm_id] = nil
            a:despawn()
          end
          return
        end
        if r.life <= 0 or w.hp <= 0 or not w.turn or w.weapon ~= "uzi" or LASER_STOPS[w.state or ""] then
          laser_stop(r, w.hp > 0 and w or nil)
          return
        end
        w.shots_fired, w.shots_to_fire = 0, 1
        r.size = r.size - 0.07
        if r.size < 0.5 then r.size = 1.0 end
        r.aim, r.facing = w.aim, w.facing
        laser_aim(r, w)
        if r.first then
          r.first = false
          laser_sparks(r, 8, 5, 9, 0.4, 0.7) -- FX_InitialBurst
        end
        if (LASER_LIFE - r.life) % LASER_LOOP_FRAMES == 0 then
          wa.sound.play(w, "sounds/laser_gun/laser_loop.wav")
        end
        if r.counter <= 0 then
          r.counter = 3
          laser_trace(r, w)
          laser_sparks(r, 1, 2, 5, 0.2, 0.5) -- FX_MuzzleSparks
        else
          r.counter = r.counter - 1
        end
        r.last_dx, r.last_dy = r.dx, r.dy
      end,
    })
  end

  if wa.on.draw and wa.draw.ribbon then
    wa.on.draw(function()
      for _, r in pairs(lasers) do
        laser.draw_particles(r)
        if not r.dead then
          local c = laser.argb(255, { 255, 0, 0 })
          laser.glow(r.gx, r.gy, 32 * 0.5 * r.size, c)
          if r.draw_beam then laser.beam(r.gx, r.gy, r.hx, r.hy, 2 * 8 * r.size, c) end
          if r.hit then laser.glow(r.hx, r.hy, 32 * 0.75 * r.size, c) end
        end
      end
    end)
  end
end
`
      },
      {
        path: 'weapons/nuke_rocket.lua',
        name: 'weapons/nuke_rocket.lua',
        language: 'lua',
        content: `-- Highlander: Nuke Rocket. Split from rules.lua by tools/split_highlander.py.
local shared = require("lib/shared")

-- ------------------------------------------------------------ Nuke Rocket
do
--
-- PX's nuke_rocket_script, on the mine slot. The scheme's record is a
-- placed weapon that WA fires as a missile (fire type 2, method 2:
-- CreateWeaponProjectile), and it already has every value PX's FireFinal
-- gives its first rocket (a 3 s fuse, damage 0, bias 50, push 70, sound
-- 66). So WA's own shot is PX's first rocket: it fuses on the ground,
-- hissing (sound 66 every 10 frames). When it explodes, a nuke climbs out
-- of it: a real WA missile of the same slot (wa.weapons.launch, as PX's
-- MakeNuke creates a CMissile), silent, with a 1.6 s fuse, bursting into
-- the record's clustlets. For 53 frames it climbs, randomly and jittering
-- sideways, and carries worms and missiles within 17 pixels along; then
-- it brakes. Its explosion adds PX's two 40/40 blasts and sounds 85, 70.
--
-- Not ported: PX's particle trails, and carrying mines, crates, oil drums
-- and bowling balls (their speed is not writable from Lua).

local P16 = 0x10000
local NR_HISS = 66    -- the fusing rocket's hiss, every 10 frames
local NR_CLIMB = 53   -- frames the nuke climbs (PX: "1.1-1.2 second")
local NR_CARRY = 17   -- pixels: what the climbing nuke carries along
local NUKE = { fuse = 1600, sound = 0, explode_into = "clustlets" }
local NUKE_BLAST = { damage = 40, id = 40 } -- PX's DoExplosion(x, y, 40, 40), twice

local nr_first = {}    -- missile id -> frames: a first rocket, fusing
local nr_speed = {}    -- missile id -> { vx, vy } at its last frame
local nr_nuke = {}     -- missile id -> frames flown: a nuke
local nr_climbing = {} -- nuke id -> { x, y, vx, vy }, while it climbs
local nr_pending = {}  -- nukes to launch once the rocket's blast is over
local nr_shooter       -- the worm that fired (PX's ClWT / ClWN)
local nr_expect        -- fired: the next mine-slot missile is the rocket

local function near(ax, ay, bx, by)
  local r = NR_CARRY * P16
  return math.abs(ax - bx) < r and math.abs(ay - by) < r
end

wa.on.missile_frame(function(m)
  local t = nr_nuke[m.id]
  if t ~= nil then
    -- Before WA moves it, as PX's M_FRAME runs before super.
    if m.phase ~= "pre" then
      return
    end
    if t < NR_CLIMB then
      m.vy = m.vy - wa.random(19661, 52429) -- 0.3 to 0.8 a frame
      if t % 2 == 1 then
        m.vx = m.vx + wa.random(-19661, 19661) -- up to 0.3 either way
      end
      nr_climbing[m.id] = { x = m.x, y = m.y, vx = m.vx, vy = m.vy }
      for _, w in ipairs(wa.worms.all()) do
        if near(w.x, w.y, m.x, m.y) then
          w.vx, w.vy = m.vx, m.vy
        end
      end
    else
      nr_climbing[m.id] = nil
      if m.vy < 0 then
        m.vy = m.vy + 13107 -- 0.2: slows the climb without faking gravity
      end
    end
    nr_nuke[m.id] = t + 1
    return
  end
  -- The rocket is the missile WA fires after the fire key. Later ones of
  -- the slot (the nuke's cluster bits) are no rockets.
  if nr_first[m.id] == nil and nr_expect and m.weapon == "mine" then
    nr_first[m.id], nr_expect = 0, false
  end
  if nr_first[m.id] ~= nil then
    if m.phase == "post" then
      nr_speed[m.id] = { m.vx, m.vy }
      local n = (nr_first[m.id] or 0) + 1
      nr_first[m.id] = n
      if n % 10 == 0 and nr_shooter then
        wa.sound.play(nr_shooter, NR_HISS)
      end
    end
    return
  end
  -- Any other missile a climbing nuke passes is carried along.
  if m.phase == "pre" then
    for _, c in pairs(nr_climbing) do
      if near(m.x, m.y, c.x, c.y) then
        m.vx, m.vy = c.vx, c.vy
      end
    end
  end
end)

shared.nuke_rocket_explode = function(ev)
  local id = ev.missile
  if not id then
    return
  end
  if nr_nuke[id] then
    nr_nuke[id], nr_climbing[id] = nil, nil
    local owner = nr_shooter
    if owner then
      wa.sound.play(owner, 85)
      wa.sound.play(owner, 70) -- "louder please :D"
      for _ = 1, 2 do
        wa.actors.spawn({
          sprite = false, x = ev.x, y = ev.y, owner = owner,
          explode = { damage = NUKE_BLAST.damage, id = NUKE_BLAST.id, now = true },
        })
      end
    end
    return
  end
  if nr_first[id] then
    local speed = nr_speed[id] or { 0, 0 }
    nr_first[id], nr_speed[id] = nil, nil
    if nr_shooter then
      wa.sound.play(nr_shooter, "sounds/nuke_rocket_launch.wav")
    end
    -- Launched after the blast, as PX's comes after super.
    nr_pending[#nr_pending + 1] = { x = ev.x, y = ev.y, vx = speed[1], vy = speed[2] }
  end
end

wa.on.worm_message(function(worm, msg)
  if msg == wa.msg.FIRE_WEAPON and worm.weapon == "mine" then
    nr_shooter, nr_expect = worm, true
  elseif msg == wa.msg.FRAME_FINISH and #nr_pending > 0 then
    local owner = nr_shooter or worm
    for _, p in ipairs(nr_pending) do
      local id = wa.weapons.launch({
        weapon = "mine", owner = owner, x = p.x, y = p.y, vx = p.vx, vy = p.vy,
        fuse = NUKE.fuse, sound = NUKE.sound, explode_into = NUKE.explode_into,
      })
      nr_nuke[id] = 0
    end
    nr_pending = {}
  end
end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })
end
`
      },
      {
        path: 'weapons/portal_gun.lua',
        name: 'weapons/portal_gun.lua',
        language: 'lua',
        content: `-- PX p_portalgun2: a pair per team, orange (-) and blue (+). Ctrl/Alt
-- chooses the other colour for one shot. Pause toggles the team's pair.
-- The transport rules are reusable Lua; WA keeps the transported bodies.
local shared = require("lib/shared")
local Portals = require("lib/portals")
local Effects = require("lib/portal_effects")
local P, SLOT, ART = 0x10000, "scales_of_justice", "sprites/portal_gun/"
local SPEED = 35
local chosen, held, half_used = {}, {}, {}
local bolts, effects = {}, Effects.new()
local ticker
local colours = { 0xFFDF6400, 0xFF003FEF }
local team_colours = { 0xD21400, 0x0014DC, 0x00DC00, 0xFADC00, 0xDC00DC, 0x00E6E6 }
local function trunc(x) return x >= 0 and math.floor(x) or -math.floor(-x) end
local function sound(name, worm) wa.sound.play(worm, "sounds/" .. name .. ".wav") end
local network = Portals.new({ grace = 0, on_transport = function(body, entry)
  effects:transport(entry)
  if (body.kind or "worm") == "worm" then sound("portal_teleport", body) end
end })
shared.portals = network

local function tick()
  network:tick()
  effects:tick(wa.world.gravity())
  for _, group in ipairs(wa.sorted(network.pairs)) do
    local pair = network.pairs[group]
    if pair.active and pair[1] and pair[2] and network.age % 500 ~= 0 then
      for colour = 1,2 do effects:ambient(pair[colour]) end
    end
  end
  -- Bounded return cache, without userdata or freed native pointers.
  if network.age % 150 == 0 then
    local alive = {}
    for _, worm in ipairs(wa.worms.all()) do alive["worm:" .. worm.id] = true end
    for _, list in ipairs({wa.missiles, wa.mines, wa.crates, wa.oil, wa.graves, wa.arrows}) do
      for _, body in ipairs(list.all()) do alive[body.kind .. ":" .. body.uid] = true end
    end
    if shared.portal_bowling_balls then
      for _, body in ipairs(shared.portal_bowling_balls()) do alive["actor:" .. body.id] = true end
    end
    for _, key in ipairs(wa.sorted(network.last_exit)) do
      if not alive[key] then network.last_exit[key] = nil end
    end
  end
end
local function ensure_ticker(worm)
  if ticker then return end
  ticker = wa.actors.spawn({ sprite = ART .. "portal_glow.png", x = 0, y = -1000 * P,
    owner = worm, gravity = false, collide = false, on = { frame = tick } })
  ticker:scale(0)
end

-- PX's CheckWall: at least one of its four diagonal traces touches land.
local function supported(x, y)
  for _, d in ipairs({ {-15,-15}, {15,15}, {-15,15}, {15,-15} }) do
    local hit = wa.land.trace(x, y, x + d[1] * P, y + d[2] * P)
    if hit and hit.hit then return true end
  end
  return false
end
local function shooter(b)
  for _, w in ipairs(wa.worms.all()) do if w.id == b.worm_id then return w end end
end
local function place(b, hit)
  if hit.y >= wa.world.water() or not supported(hit.x, hit.y) then
    effects:impact(hit.x, hit.y, true)
    sound("portal_gun_failhit", shooter(b))
    return false
  end
  local p, fresh = network:place(b.team, b.colour, hit.x, hit.y, hit.nx, hit.ny, b.team_colour)
  if not p then effects:impact(hit.x, hit.y, true); sound("portal_gun_failhit", shooter(b)); return false end
  if fresh then chosen[b.team] = 3 - b.colour end
  sound("portal_gun_hit", shooter(b))
  effects:impact(hit.x, hit.y, false)
  -- Each two successful placements use one ammo. Misses are refunded, as
  -- PX's FireFinal/TakeOffPortalWeap; attribute delayed hits to their shooter.
  if half_used[b.worm_id] then
    half_used[b.worm_id] = nil
    local worm = shooter(b)
    if worm then worm:ammo(SLOT, -1) end
  else half_used[b.worm_id] = true end
  return true
end
local function remove(b)
  bolts[b.id] = nil
  b.a:despawn()
end
local function bolt_frame(b)
  b.age = b.age + 1
  local size = wa.world.size()
  if b.x < 0 or b.x > size.w * P or b.y < -size.h * P then b.vy = b.vy + wa.world.gravity() end
  local hit = wa.world.trace({ x0 = b.x, y0 = b.y, x1 = b.x + b.vx, y1 = b.y + b.vy,
    with = {"terrain"}, radius = 0 })
  if hit and hit.hit then
    place(b, hit)
    remove(b)
    return
  end
  b.x, b.y = b.x + b.vx, b.y + b.vy
  if b.y >= wa.world.water() or b.age > 600 or math.abs(b.x) > 32000 * P or math.abs(b.y) > 32000 * P then
    remove(b); return
  end
  b.a.x, b.a.y = b.x, b.y
  b.a:frame((b.age // 2) % 20)
  b.a:gfx({ scale = 0.12, tint = colours[b.colour] & 0xFFFFFF, depth = 0x000E0000 })
  effects:trail(b.x, b.y, b.colour)
end
local function air_aim(worm, keys)
  if (keys.left or keys.right) and keys.up then return 0.75 end
  if (keys.left or keys.right) and keys.down then return 0.175 end
  if keys.left or keys.right then return 0.5 end
  if keys.down then return 0 end
  if keys.up then return 1 end
  return worm.aim
end
shared.fires.portal_gun = function(fire)
  local worm, keys = fire.worm, wa.world.keys()
  ensure_ticker(worm)
  local colour = chosen[worm.team] or 1
  if keys.ctrl or keys.alt then colour = 3 - colour end
  local aim = fire.airborne and air_aim(worm, keys) or worm.aim
  local angle = (1 - aim) * math.pi
  local dx, dy = wa.math.sin(angle) * worm.facing, -wa.math.cos(angle)
  local power = fire.power or 1
  local b = { x = worm.x + trunc(dx * P), y = worm.y + trunc(dy * P),
    vx = trunc(dx * SPEED * power * P), vy = trunc(dy * SPEED * power * P),
    worm_id = worm.id, team = worm.team, team_colour = team_colours[worm.alliance + 1],
    colour = colour, age = 0 }
  -- Native ground fire consumes ammo after this callback; airborne fire
  -- dispatches Lua alone and therefore needs no refund.
  if not fire.airborne then worm:ammo(SLOT, 1) end
  local a = wa.actors.spawn({ sprite = ART .. "portal_ball", x = b.x, y = b.y,
    owner = worm, gravity = false, collide = false, on = { frame = function() bolt_frame(b) end } })
  b.a, b.id = a, a.id
  a:gfx({ scale = 0.12, tint = colours[colour] & 0xFFFFFF, depth = 0x000E0000 })
  bolts[b.id] = b
  sound("portal_gun_shoot", worm)
end

wa.on.body_move(function(body) if next(network.pairs) then network:move(body) end end,
  { kinds = { "worm", "missile", "mine", "crate", "oil", "grave", "arrow" } })
wa.on.worm_message(function(worm)
  if not worm.turn then return end
  local keys, id, team = wa.world.keys(), worm.id, worm.team
  local old = held[id] or {}
  if keys.pause_key and not old.pause_key then
    local pair = network.pairs[team]
    if pair then
      network:active(team, not pair.active)
      sound(pair.active and "portal_active" or "portal_inactive", worm)
    end
  end
  if worm.weapon == SLOT then
    worm:air_fire()
    if keys.minus_key and not old.minus_key then chosen[team] = 1 end
    if keys.plus_key and not old.plus_key then chosen[team] = 2 end
  elseif old.portal then worm:air_fire(false) end
  held[id] = { portal = worm.weapon == SLOT, plus_key = keys.plus_key, minus_key = keys.minus_key, pause_key = keys.pause_key }
end, { msgs = { wa.msg.FRAME_FINISH } })
wa.on.turn_start(function() network:turn_start(); held = {} end)
wa.on.turn_end(function() network:turn_end() end)

if wa.on.hud then wa.on.hud(function()
  local worm = shared.current_worm()
  if worm and worm.weapon == SLOT then
    wa.hud.line("Portal Gun: " .. ((chosen[worm.team] or 1) == 1 and "ORANGE" or "BLUE")
      .. " (- orange, + blue; Ctrl/Alt other colour; Pause toggle)")
  end
end) end

if wa.on.draw then
  local function quad(sprite, x, y, w, h, angle, colour, blend, depth, frame)
    local c, s = math.cos(angle or 0), math.sin(angle or 0)
    local points = {}
    for _, v in ipairs({ {-w/2,-h/2}, {w/2,-h/2}, {w/2,h/2}, {-w/2,h/2} }) do
      points[#points + 1] = { x + trunc((v[1]*c-v[2]*s)*P), y + trunc((v[1]*s+v[2]*c)*P) }
    end
    wa.draw.quad({sprite = ART .. sprite, points = points, color = colour, blend = blend,
      depth = depth or 0x000E0000, frame = frame or 0})
  end
  wa.on.draw(function()
    for _, group in ipairs(wa.sorted(network.pairs)) do
      local pair = network.pairs[group]
      for colour = 1, 2 do
        local p = pair[colour]
        if p then
          -- PX's CAnimation draws the endpoint independently of CPortal's
          -- linked/active state. Its alpha=50 is a percentage and draws the
          -- image repeatedly, not a byte alpha that makes singles disappear.
          local angle = math.pi / 2 - math.atan(p.nx, p.ny)
          quad(colour == 1 and "portal_orange.png" or "portal_blue.png", p.draw_x, p.draw_y,
            40, 100, angle, 0xFFFFFFFF, "add")
          quad("portal_black_mask", p.draw_x - (p.x-p.draw_x)*2, p.draw_y - (p.y-p.draw_y)*2,
            12.5, 12.5, 0, (135 << 24) | (p.team_colour or 0xFFFFFF), "alpha",
            0x000DFFFF, (network.age // 50) % 2)
        end
      end
    end
    effects:draw(quad)
    local worm = shared.current_worm()
    if worm and worm.weapon == SLOT and worm.aiming then
      local keys = wa.world.keys()
      local colour = chosen[worm.team] or 1
      if keys.ctrl or keys.alt then colour = 3 - colour end
      quad("portal_gun_glow.png", worm.x, worm.y, 80, 80,
        worm.facing * (0.5 - worm.aim) * math.pi, (100 << 24) | (colours[colour] & 0xFFFFFF), "add", 0x000CFFFF)
    end
  end)
end
shared.portal_air_aim = air_aim
`
      },
      {
        path: 'weapons/reinforcement.lua',
        name: 'weapons/reinforcement.lua',
        language: 'lua',
        content: `-- Highlander: Reinforcement (PX utility_reinforcement: reinforcement_SCRIPT.txt).
local shared = require("lib/shared")
local P = 0x10000
-- PX's new worm: RessurectWormEx(GetFreeWormIndex(team), team, 0, 0,
-- "Reinforcement", 200).
local NAME, HEALTH = "Reinforcement", 200
-- Its centre this far above the land it stands on: WA's standing worm
-- settles the rest itself.
local STAND = 12

-- The ground under x (pixels): the first land below open air from the top
-- (on a cavern, the roof's underside is not ground). Nil over the water.
local function ground(x)
  local size = wa.world.size()
  local y = 0
  while y < size.h and wa.land.solid(x * P, y * P) do y = y + 1 end
  while y < size.h and not wa.land.solid(x * P, y * P) do y = y + 1 end
  if y >= size.h then return nil end
  return y
end

-- A click places it: PX drops the worm at the click's x from 200 pixels
-- above the map on a jet pack with no fuel, and stands it up once it has
-- landed. Here it stands on the ground under the click straight away, so
-- it takes no fall damage either. Over the water it drops in at the
-- surface, as PX's falls in. With 8 worms the team is full (PX: "Too many
-- worms (8) in your team!").
shared.fires.reinforcement = function(ev)
  local worm = ev.worm
  local x = ev.x // P
  local y = ground(x)
  local at = y and (y - STAND) * P or wa.world.water() - STAND * P
  local ok, err = pcall(wa.worms.spawn, { team = worm.team, x = x * P, y = at, name = NAME, health = HEALTH })
  if not ok then
    wa.log("Reinforcement: " .. tostring(err))
    wa.sound.play(worm, "sounds/gravity_control/error.wav")
  end
end
`
      },
      {
        path: 'weapons/sentry_gun.lua',
        name: 'weapons/sentry_gun.lua',
        language: 'lua',
        content: `-- Highlander: Sentry Gun (PX weapon_sentry_gun: sentrygun.txt's PxSentryGun),
-- on the Kamikaze slot as PX's Highlander scheme has it. The turret itself
-- (placing, planting, aiming, reloading, damage) is lib/turret.lua; this is
-- what it fires: rounds with PX's spread, ejecting casings, bursting where
-- they hit. Ported from the standalone sentry_gun pack
-- (mods/examples/sentry_gun_old).
local shared = require("lib/shared")
local turret = require("lib/turret")
local P = 0x10000

local ART = "sprites/sentry_gun/"
local SND = "sounds/sentry_gun/"
local DAMAGE = 2           -- per round
local HIT_PX = 10          -- how near a round passes a worm to hit it
local SELF_BLAST_PX = 24   -- never burst a round closer than this
local MUZZLE_OUT = 11      -- pixels from the pivot along the bore
-- PX rolls a barrel deviation for each round and keeps every 5th one
-- pin-point: tenths of a degree, from WA's shared RNG.
local SPREAD_TENTHS = 20   -- +-2.0 degrees
-- PX ejects a shell casing (WA's "uzicase" frames) on every shot, sideways
-- from the barrel to the side the turret faces, with a little random angle
-- and speed, gravity and no bounce, gone after 100 frames.
local CASING = ART .. "casing"
local CASING_FRAMES, CASING_LIFE = 16, 100
local CASING_JITTER_DEG = 17                  -- PX's RandomFloat(-0.3, 0.3) rad
local CASING_SPEED_MIN, CASING_SPEED_MAX = 200, 300 -- PX's 2.0 to 3.0, hundredths
local IMPACT = ART .. "impact.png"

-- Tints for the grey head, from PX's own render (G/R about 0.39 and B/R
-- about 0.28 on its red housing), the dominant channel pinned at 255: a
-- vertex tint only scales down. Red to cyan, as worm.alliance + 1. The same
-- colours tint the housing the worm carries (worm_sprites_team_tint).
local TEAM_TINT = { 0xFF6447, 0x4764FF, 0x47FF64, 0xE6E647, 0xE647E6, 0x47E6E6 }
shared.sentry_team_tint = TEAM_TINT

local function impact(b)
  b:explode({ damage = DAMAGE, id = 101 })
  b:despawn()
end

local function casing(t, a, s, rad)
  local jitter = wa.random(-CASING_JITTER_DEG, CASING_JITTER_DEG)
  local eject = rad + math.rad(90 * s.side + jitter)
  local speed = wa.random(CASING_SPEED_MIN, CASING_SPEED_MAX) / 100
  local life, spin = CASING_LIFE, 0
  wa.actors.spawn({
    sprite = CASING, x = a.x, y = a.y - t.muzzle_up * P,
    vx = math.floor(wa.math.sin(eject) * speed * P), vy = math.floor(wa.math.cos(eject) * speed * P),
    gravity = false, collide = false, owner = t.owner(a, s), kind = "casing",
    on = function(c)
      life = life - 1
      if life <= 0 then c:despawn(); return end
      c:gravity()
      c:move({ terrain = false, worms = false })
      spin = (spin + 1) % CASING_FRAMES
      c:frame(spin)
    end,
  })
end

-- One round along the barrel: the land stops it, a worm in front of that
-- sooner. wa.math, since where a round hits is the simulation's.
local function fire(t, a, s)
  s.shots = s.shots + 1
  local dev = 0
  if s.shots % 5 ~= 0 then dev = wa.random(-SPREAD_TENTHS, SPREAD_TENTHS) / 10 end
  local rad = math.rad(s.angle + dev)
  local dx, dy = wa.math.sin(rad), wa.math.cos(rad)
  local mx = a.x + math.floor(dx * MUZZLE_OUT * P)
  local my = a.y - t.muzzle_up * P + math.floor(dy * MUZZLE_OUT * P)
  local reach = t.sensor_px * P
  local ex, ey = mx + math.floor(dx * reach), my + math.floor(dy * reach)
  -- Cosmetic, so even a round the self-blast check cancels ejects one.
  casing(t, a, s, rad)
  local hit = wa.land.trace(mx, my, ex, ey)
  local hx, hy = ex, ey
  if hit then hx, hy = hit.x, hit.y end
  local rx, ry = (hx - mx) // P, (hy - my) // P
  local hit_px = rx * rx + ry * ry
  for _, w in ipairs(wa.worms.all()) do
    if w.alliance ~= s.alliance and w.visible ~= false then
      local wx, wy = (w.x - mx) // P, (w.y - my) // P
      local along = wx * dx + wy * dy
      if along > 0 and along * along < hit_px then
        local off = wx * dy - wy * dx -- its distance from the round's line
        if off * off <= HIT_PX * HIT_PX then
          hx, hy = mx + math.floor(dx * along * P), my + math.floor(dy * along * P)
          hit_px = along * along
        end
      end
    end
  end
  if hit_px < SELF_BLAST_PX * SELF_BLAST_PX then return end
  wa.actors.spawn({
    sprite = IMPACT, x = hx, y = hy, vx = 0, vy = 0, gravity = false, collide = false,
    origin = "center", owner = t.owner(a, s), on = impact,
  })
  s.ammo = s.ammo - 1
  if s.ammo <= 0 then
    s.active = false
    t.stop_firing(a, s)
  end
end

local gun = turret.new({
  kind = "sentry",
  art = { base = ART .. "turret_base", gun = ART .. "turret_gun", flare = ART .. "turret_flare" },
  sounds = {
    place = SND .. "sentryplace.wav", beep = SND .. "sentrybeeps2.wav",
    fire_loop = SND .. "sentryfireloop.wav", fire_end = SND .. "sentryfireend.wav",
    servo_start = SND .. "sentryservostart.wav", servo_loop = SND .. "sentryservoloop.wav",
    servo_end = SND .. "sentryservoend.wav",
  },
  tints = TEAM_TINT,
  fire = fire,
})

shared.fires.sentry_gun = function(fire_ev) gun.place(fire_ev) end
shared.sentry_gun = gun -- for the Highlander mock
`
      },
      {
        path: 'weapons/sentry_laser.lua',
        name: 'weapons/sentry_laser.lua',
        language: 'lua',
        content: `-- Highlander: Sentry Laser (PX weapon_sentry_laser: SentryLaser.txt's
-- PxSentryLaser and CLaserRayS, by rafa\`\`2), on the Dragon Ball slot as
-- PX's Highlander scheme has it. Projectile defence: the turret of
-- lib/turret.lua, aimed not at worms but at the nearest moving missile, mine
-- or Bowling Ball of another colour within 300 px that it can see. Each of
-- its 4 shots a turn is a short laser in its owner's colour that
-- disintegrates the target (gone, no explosion) and burns what is in
-- between: worms 10, crates and oil drums 20, a mine armed, a 4 px hole
-- where it stops. It fires on any colour's turn.
--
-- Differences: WA's arrows (PX also shot them) are not listed to Lua, so it
-- ignores them; a mine the beam crosses is armed on its fuse, as the Laser
-- Gun's beam does, rather than sent PX's gun damage.
local shared = require("lib/shared")
local turret = require("lib/turret")
local laser = require("lib/laser")
local P = 0x10000

local ART = "sprites/sentry_laser/"
local SND = "sounds/sentry_laser/"
local RAY_LIFE = 10          -- CLaserRayS LifeTime: frames the beam shows
-- PX's ray starts at the barrel's centre (BarrelOffsetX 17, scaled 0.8) and
-- 6 px on.
local MUZZLE_OUT = 17 * 0.8 + 6
-- PX rocks the barrel (2 px either way) while it fires; here for this long
-- after each shot.
local RECOIL_FRAMES = 12
local HOLE = 4               -- MakeHole(4) where the beam stops
local WORM_DAMAGE, OBJECT_DAMAGE = 10, 20
-- The circles the beam touches things within (as the Laser Gun's).
local RADIUS = { worm = 6, mine = 5, crate = 9, oil = 9 }

-- The body's tint (as the Sentry Gun's housing, red to cyan) and the beam's
-- colour, PX's pure team colours.
local TEAM_TINT = shared.sentry_team_tint or { 0xFF6447, 0x4764FF, 0x47FF64, 0xE6E647, 0xE647E6, 0x47E6E6 }
local BEAM_RGB = {
  { 255, 0, 0 }, { 0, 0, 255 }, { 0, 255, 0 }, { 255, 255, 0 }, { 255, 0, 255 }, { 0, 255, 255 },
}

local rays = {} -- every ray still showing, in the order fired

-- What it shoots at: WA's missiles and mines (their team's colour), then the
-- Bowling Balls, each in its list's order, which every machine shares.
local function targets()
  local out = {}
  for _, group in ipairs({ wa.missiles, wa.mines }) do
    for _, o in ipairs(group.all()) do
      out[#out + 1] = { key = o.id, x = o.x, y = o.y, alliance = o.alliance,
        moving = o.vx ~= 0 or o.vy ~= 0, obj = o }
    end
  end
  if shared.bowling_ball_targets then
    for _, b in ipairs(shared.bowling_ball_targets()) do
      out[#out + 1] = { key = "ball:" .. b.id, x = b.x, y = b.y, alliance = b.alliance,
        moving = b.moving, ball = b.id }
    end
  end
  return out
end

-- Everything the beam from (x0, y0) along (dx, dy), \`length\` px, touches:
-- worms, mines, crates and oil drums, in that order.
local function touched(x0, y0, dx, dy, length, skip)
  local out = {}
  for _, group in ipairs({ wa.worms, wa.mines, wa.crates, wa.oil }) do
    for _, obj in ipairs(group.all()) do
      if obj.id ~= skip then
        local ox, oy = (obj.x - x0) / P, (obj.y - y0) / P
        local along = ox * dx + oy * dy
        local across = math.abs(ox * dy - oy * dx)
        if along >= 0 and along <= length and across <= (RADIUS[obj.kind] or 6) then
          out[#out + 1] = obj
        end
      end
    end
  end
  return out
end

-- FX_HitObject: a yellow flash and three sparks.
local function fx_hit_object(r, x, y)
  local tone = math.floor(laser.between(r, 0, 50))
  laser.particle(r, { x = x, y = y, life = 10, drag = 0, grav = 0,
    s0 = laser.between(r, 0.4, 0.8), s1 = 0.01, c0 = { 210, 210 - tone, 0 }, c1 = { 210, 50 - tone, 0 } })
  for _ = 1, 3 do
    local a, v = laser.between(r, 0, 2 * math.pi), laser.between(r, 0.5, 1.8)
    tone = math.floor(laser.between(r, 0, 50))
    laser.particle(r, { x = x, y = y, vx = v * math.cos(a) * P, vy = v * math.sin(a) * P,
      life = 50, drag = 0.05, grav = 1, jitter = 0.2, s0 = laser.between(r, 0.5, 0.7), s1 = 0.01,
      c0 = { 255, 255 - tone, 0 }, c1 = { 255, 80 - tone, 0 } })
  end
end

-- PX's Disintegrate: bursts at the muzzle and where the target was.
local function fx_disintegrate(r, x, y)
  local c, dim = r.rgb, { r.rgb[1] * 0.2, r.rgb[2] * 0.2, r.rgb[3] * 0.2 }
  for _ = 1, 5 do -- FX_InitialBurst
    local v = laser.between(r, 5, 8)
    local ang = r.ang + laser.between(r, -0.25, 0.25)
    laser.particle(r, { x = r.x, y = r.y, vx = -v * math.sin(ang) * P, vy = -v * math.cos(ang) * P,
      life = 40, drag = 0.1, grav = 0.4, jitter = 0.5, s0 = laser.between(r, 0.4, 0.7), s1 = 0.01,
      c0 = c, c1 = dim, alpha = 215 })
  end
  laser.particle(r, { x = r.x, y = r.y, life = 25, drag = 0, grav = 0, s0 = 0.6, s1 = 0.01,
    c0 = c, c1 = dim, alpha = 225 }) -- FX_BarrelFlash
  local tone = math.floor(laser.between(r, 0, 50))
  local v = laser.between(r, 2, 5)
  laser.particle(r, { x = r.x, y = r.y, vx = v * math.sin(r.ang) * P, vy = -v * math.cos(r.ang) * P,
    life = 30, drag = 0.3, grav = 0.8, jitter = 0.8, s0 = laser.between(r, 0.2, 0.5), s1 = 0.01,
    c0 = { 255, 255 - tone, 0 }, c1 = { 255, 80 - tone, 0 } }) -- FX_MuzzleSparks
  for i = 0, 3 do -- FX_Disintegrate
    local a = math.pi / 4 + math.pi / 2 * i
    laser.particle(r, { x = x, y = y, vx = 1.5 * math.sin(a) * P, vy = 1.5 * math.cos(a) * P,
      life = 60, drag = 0.05, grav = 0, s0 = 0.5, s1 = 0.01, c0 = c, c1 = dim })
  end
  fx_hit_object(r, x, y)
  -- FX_HitTerrain
  laser.particle(r, { x = x, y = y, life = 40, drag = 0.2, grav = -0.4, jitter = 0.6,
    s0 = laser.between(r, 0.6, 0.9), s1 = 0.01, c0 = c, c1 = c })
  laser.particle(r, { x = x, y = y, life = 50, drag = 0, grav = 0, s0 = 0.6, s1 = 0.1,
    c0 = c, c1 = { c[1] * 0.3, c[2] * 0.3, c[3] * 0.3 } })
end

-- The ray shows for RAY_LIFE frames and its particles live on after it.
local function ray_actor(r, body)
  wa.actors.spawn({
    sprite = false, x = r.x, y = r.y, gravity = false, collide = false, owner = body,
    on = function(a)
      laser.step(r)
      r.life = r.life - 1
      r.size = r.size - 0.07
      if r.size < 0.5 then r.size = 1.0 end
      if r.life == 0 then a:sound("sounds/laser_gun/laser_end.wav") end
      if r.life <= 0 and #r.fx == 0 then
        for i, other in ipairs(rays) do
          if other == r then table.remove(rays, i) break end
        end
        a:despawn()
      end
    end,
  })
end

-- One shot (CLaserRayS): from the muzzle to the target, or to the land or
-- object before it; burns what is in between, cuts a hole where it stops,
-- and disintegrates the target.
local function fire(t, a, s, target)
  local ang = math.rad(s.angle)
  local px, py = a.x, a.y - t.muzzle_up * P
  local x0 = px + math.floor(wa.math.sin(ang) * MUZZLE_OUT * P)
  local y0 = py + math.floor(wa.math.cos(ang) * MUZZLE_OUT * P)
  local hx, hy = target.x, target.y
  local land = wa.land.trace(x0, y0, hx, hy)
  if land then hx, hy = land.x, land.y end
  local lx, ly = (hx - x0) / P, (hy - y0) / P
  local length = math.sqrt(lx * lx + ly * ly)
  local dx, dy = 0, 0
  if length > 0 then dx, dy = lx / length, ly / length end

  local r = { x = x0, y = y0, hx = hx, hy = hy, life = RAY_LIFE, size = 1.0, fx = {},
    ang = ang, rgb = BEAM_RGB[s.alliance + 1] or { 125, 125, 125 },
    seed = (x0 // P * 7919 + y0 // P) % 0x80000000 }
  rays[#rays + 1] = r
  a:sound("sounds/laser_gun/laser_start.wav")

  wa.land.dig({ x = hx, y = hy, radius = HOLE })
  for _, obj in ipairs(touched(x0, y0, dx, dy, length, target.obj and target.obj.id)) do
    if obj.kind == "worm" then
      if obj.hp > 0 then obj:hurt(WORM_DAMAGE) end
    elseif obj.kind == "crate" or obj.kind == "oil" then
      obj:hit(OBJECT_DAMAGE, math.floor(dx * P), math.floor(dy * P))
    elseif obj.kind == "mine" and not s.armed[obj.id] then
      s.armed[obj.id] = true
      obj:arm(obj.fuse < 0 and wa.random(1000, 5000) or obj.fuse)
    end
    fx_hit_object(r, obj.x + math.floor(3 * dx * P), obj.y + math.floor(3 * dy * P))
  end

  -- Disintegrate: the target goes without bursting.
  if target.ball then
    shared.remove_bowling_ball(target.ball)
  elseif target.obj then
    target.obj:remove()
  end
  fx_disintegrate(r, target.x, target.y)
  a:sound(SND .. "sentrylaserdisin.wav")
  ray_actor(r, a)

  -- The target is gone: the turret takes the next one as a new one (a beep,
  -- then its delay).
  s.tid, s.had_target = nil, false
  t.stop_firing(a, s)
  s.recoil = RECOIL_FRAMES
  s.ammo = s.ammo - 1
  if s.ammo <= 0 then s.active = false end
end

local sentry = turret.new({
  kind = "sentry_laser",
  sensor_px = 300, ammo = 4, shot_frames = 6, activate = 20, beep_frames = 20,
  rot_active = 5.0, aim_tolerance = 5.0, health = 35, hold_own_turn = false,
  art = { base = ART .. "turret_base", gun = ART .. "turret_body", barrel = ART .. "turret_barrel" },
  sounds = {
    place = SND .. "sentrylaserplace.wav", beep = SND .. "sentrylaserbeep.wav",
    servo_start = SND .. "sentrylaserstart.wav", servo_loop = SND .. "sentrylaserloop.wav",
    servo_end = SND .. "sentrylaserend.wav",
  },
  tints = TEAM_TINT,
  targets = targets,
  fire = fire,
})

-- A mine the beam has armed stays armed: once per turret, not per shot.
local place = sentry.place
sentry.place = function(fire_ev)
  local body, s = place(fire_ev)
  s.armed = {}
  return body, s
end

shared.fires.sentry_laser = function(fire_ev) sentry.place(fire_ev) end
shared.sentry_laser = sentry -- for the Highlander mock

if wa.on.draw and wa.draw.ribbon then
  wa.on.draw(function()
    for _, r in ipairs(rays) do
      laser.draw_particles(r)
      if r.life > 0 then
        local c = laser.argb(255, r.rgb)
        laser.beam(r.x, r.y, r.hx, r.hy, 2 * 4 * r.size, c)
        laser.glow(r.hx, r.hy, 32 * 0.4 * r.size, c)
      end
    end
  end)
end
`
      },
      {
        path: 'weapons/sniper_rifle.lua',
        name: 'weapons/sniper_rifle.lua',
        language: 'lua',
        content: `-- Highlander: the Sniper Rifle's laser sight. Split from rules.lua by tools/split_highlander.py.
local shared = require("lib/shared")

-- The Sniper Rifle's sight remains a draw callback. Keep only its last aim
-- through its firing poses; the rifle and flash themselves are engine draws.
local held = {}
wa.on.worm_message(function(worm, msg)
  local h = held[worm.id]
  if msg == wa.msg.FIRE_WEAPON and h then h.firing = true end
  if msg ~= wa.msg.FRAME_FINISH then return end
  if worm.weapon == "handgun" and worm.aiming then
    held[worm.id] = { slot = "handgun", aim = worm.aim }
  elseif not (h and h.firing and worm.weapon == "handgun"
      and (worm.state == "firing" or worm.state == "fired")) then
    held[worm.id] = nil
  end
end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })

-- ------------------------------------------ the Sniper Rifle's laser sight
-- Shared with later sections; the rest of this section is local to it.
local STOPPERS
do
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
STOPPERS = { { wa.worms, 6 }, { wa.mines, 4 }, { wa.crates, 10 }, { wa.oil, 9 } }

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
      -- The aim the rifle was drawn with, so the ray leaves along it; while
      -- the worm aims or fires the rifle, not while it puts it away.
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
end

shared.STOPPERS = STOPPERS
shared.held = held
`
      },
      {
        path: 'weapons/super_drill.lua',
        name: 'weapons/super_drill.lua',
        language: 'lua',
        content: `-- Highlander: Super Drill. Split from rules.lua by tools/split_highlander.py.
local shared = require("lib/shared")

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

shared.drills = drills
shared.follow_drill = follow_drill
`
      },
      {
        path: 'weapons/super_tele.lua',
        name: 'weapons/super_tele.lua',
        language: 'lua',
        content: `-- Highlander: Super Tele. Split from rules.lua by tools/split_highlander.py.
local shared = require("lib/shared")
local fires = shared.fires

-- --------------------------------------------------------------- Super Tele
do
-- PX's FireFinal arms the teleport, the next M_FRAME starts its pose and
-- sound, and M_FRAME moves the worm 50 frames after that. Keep the click
-- from WA's fire context: the live pointer
-- may have moved by the time the worm arrives. Mask 4 is approximated by
-- three overlapping round cuts, centred where PX places them.
fires.teleports = {} -- worm id -> frozen target and elapsed frames

local function super_tele_arrive(worm, x, y)
  worm.x, worm.y = x, y
  for _, rise in ipairs({ 0, 10, 22 }) do
    wa.land.dig({ x = x, y = y - rise * 0x10000, radius = 12 })
  end
end

-- WA's sound slots and the priority its teleport plays them at.
local TELE_SOUND_PRIORITY = 3
local SOUND_TELEPORT, SOUND_COMMUNICATOR, SOUND_WORM_POP = 67, 68, 54
-- WA's manual placement plays Communicator at the click and WormPop when
-- the worm appears, this many frames later.
local PLACEMENT_POP_FRAMES = 21

-- During manual placement WA keeps unplaced worms at (960, -10000).
local function unplaced(worm) return worm.y == -10000 * 0x10000 end

-- WA's own teleport places a worm at the click, with no wind-up. Super
-- Tele's record is a click weapon, which winds up first: for an unplaced
-- worm the wind-up is skipped, so the click places it at once. On the fire
-- message, before WA starts the wind-up; at the frame's end as a fallback.
local function skip_placement_windup(worm)
  if worm.weapon == "teleport" and unplaced(worm) and worm.windup == nil then
    worm.windup = 0
  end
end

fires.super_tele_click = function(ev)
  local worm = ev.worm
  if worm.hp <= 0 then return end
  local y = ev.y
  if wa.world.cavern() and y < 19 * 0x10000 then y = 19 * 0x10000 end
  local previous = fires.teleports[worm.id]
  if previous and previous.marker then previous.marker:despawn() end
  -- Waiting 50 frames there makes an unplaced worm fall and take damage
  -- before the arrival, so it is placed now. It sounds like WA's own
  -- placement.
  if unplaced(worm) then
    super_tele_arrive(worm, ev.x, y)
    worm:set_state("teleporting")
    wa.sound.play(worm, SOUND_COMMUNICATOR, TELE_SOUND_PRIORITY)
    fires.teleports[worm.id] = { placed = true, frames = 0 }
    return
  end
  -- FireWeapon clears WA's planted X for click-only weapons. Keep a fixed
  -- stock planted-X marker at the saved target until the worm arrives instead;
  -- the engine plays it once, as WA plays its own.
  local marker = wa.actors.spawn({
    owner = worm, x = ev.x, y = y, sprite = "markerr",
    gravity = false, collide = false, drown = false,
  })
  fires.teleports[worm.id] = { x = ev.x, y = y, frames = 0, pending = true, marker = marker }
  wa.sound.play(worm, SOUND_COMMUNICATOR, TELE_SOUND_PRIORITY) -- PX's M_SETTARGET confirmation
end

wa.on.worm_message(function(worm, msg)
  if msg == wa.msg.FIRE_WEAPON then
    skip_placement_windup(worm)
    return
  end
  if worm.state == "prefiring" then skip_placement_windup(worm) end
  local tele = fires.teleports[worm.id]
  if not tele then return end
  if tele.placed then
    tele.frames = tele.frames + 1
    if tele.frames < PLACEMENT_POP_FRAMES then return end
    fires.teleports[worm.id] = nil
    if worm.hp > 0 then wa.sound.play(worm, SOUND_WORM_POP, TELE_SOUND_PRIORITY) end
    return
  end
  if worm.hp <= 0 then
    tele.marker:despawn()
    fires.teleports[worm.id] = nil
    return
  end
  if tele.pending then
    tele.pending = false
    -- WA's teleport setup clears its activity flag. Do this after the
    -- Lua-handled FireWeapon return restores that flag, as PX's M_FRAME does.
    worm:set_state("teleporting")
    wa.sound.play(worm, SOUND_TELEPORT, TELE_SOUND_PRIORITY) -- PX's teleport start
    return
  end
  tele.frames = tele.frames + 1
  if tele.frames < 50 then return end
  tele.marker:despawn()
  fires.teleports[worm.id] = nil
  super_tele_arrive(worm, tele.x, tele.y)
end, { msgs = { wa.msg.FRAME_FINISH, wa.msg.FIRE_WEAPON } })
end
`
      },
      {
        path: 'weapons/swim_suit.lua',
        name: 'weapons/swim_suit.lua',
        language: 'lua',
        content: `-- Highlander: Swim Suit. Split from rules.lua by tools/split_highlander.py.
local shared = require("lib/shared")
local current_worm = shared.current_worm
local held = shared.held
local trunc = shared.trunc

-- --------------------------------------------------------------- Swim Suit
do
--
-- PX's swimsuit_SCRIPT (StepS; swim sprites by Team17) with fastswim_SCRIPT
-- and swim_suit_diving_s (PyroMan), on WA's laser sight. Using it puts the
-- suit on (or, out of the water, takes it off): WA's laser sight never
-- switches on, as PX's FireFinal never calls super. A worm in the suit that
-- falls into the water splashes and swims instead of drowning: the pack takes
-- it (worm:take) and moves it by its own four keys (up to 2.5 pixels a frame
-- times the swim speed, gliding to a stop when they are let go), stopping at
-- land, turned by left and right unless Shift is held. Enter and weapons do
-- nothing while it swims (Fast Walk aside). Out of the water it is released
-- as from a jump. Too deep (180 pixels under the water, or the bottom of a
-- cavern), knocked flying, or still in the water when the turn ends, the
-- suit gives out and it drowns. Fast Walk switches the swim speed between 2
-- and 6 for the turn. Missiles in the water can hit a swimming worm: they
-- blow up on it (damage 100, blast 50).
--
-- Drawn in the worm's place: the swim or, when still, the float animation,
-- and a bubble around the worm while it wears the suit.
--
-- Not ported: PX's ghost jet and battyswim interplay (other libraries), the
-- Ninja Rope workaround after leaving the water (the Jump is on the rope's
-- slot here), inverted controls, and the team message on putting it on.

local SWIM_CAP = 2.5          -- pixels a frame, times the swim speed
local SWIM_PUSH = 0.1
local SWIM_DRAG = 1.05
local SWIM_STILL = 0.05
local SWIM_FLOAT_STEP = 0.0099
local SWIM_DEPTH = 180        -- how far under the water the suit holds
local SWIM_SUIT_MASK = 134342 -- 0x20CC6: the worm's 0x420CC6 without SWIM_WATER
-- Bit 22 of a collision mask: WA's water acts on what has it (0x4FDE20), and
-- sinks or drowns it. The suit takes it off; a missile sinking in the water
-- has only it.
local SWIM_WATER = 0x400000
local SWIM_MISSILE_MASK = 0x40007C -- a missile in the water that hits worms
local SWIM_SPLASH = 57        -- WA's sound
local SWIM_BODY_DEPTH = 0x10000
local SWIM_RING_DEPTH = 0x10001
-- Ring sheet is 50×50; wa.draw.quad corners are centred on the worm like a:gfx.
local SWIM_RING_HALF = 25 * 0x10000
-- The land a swimmer stops at: its body, 4 pixels either side, 6 above and below.
local SWIM_HALF_W, SWIM_HALF_H = 4 * 0x10000, 6 * 0x10000

local swim_speed = 2          -- fastswim: Fast Walk switches 2 and 6
local swim_in_game = false    -- SwimInGame: someone has worn the suit
local swimmers = {} -- worm id -> { suit, plopready, plopped, floating, plophase, flophase, fmult, keys, body, x, y, vx, vy }

local function swimmer_of(worm)
  local s = swimmers[worm.id]
  if not s then
    s = { suit = false, plopready = false, plopped = false, floating = false,
      plophase = 0, flophase = 0, fmult = 5, keys = {} }
    swimmers[worm.id] = s
  end
  return s
end

local function swim_drop_art(worm, s)
  if s.body then s.body:despawn(); s.body = nil end
  worm.body_visible = true
end

-- The suit comes off, the water's bit back in its mask. \`sink\`: it gave out
-- in the water, and the worm goes back to WA out of control, moving at
-- (vx, vy), for WA to drown.
local function suit_off(worm, s, sink, vx, vy)
  s.suit, s.plopready, s.plopped, s.floating = false, false, false, false
  swim_drop_art(worm, s)
  if sink then
    worm:release(vx, vy, { tumble = true })
  end
  worm.collision_mask = worm.collision_mask | SWIM_WATER
end

local function swim_blocked(x, y)
  return wa.land.solid(x - SWIM_HALF_W, y) or wa.land.solid(x + SWIM_HALF_W, y)
    or wa.land.solid(x, y - SWIM_HALF_H) or wa.land.solid(x, y + SWIM_HALF_H)
end

-- One step towards the cap on a held key, as PX's: while under it, a push;
-- past it, back to it.
local function swim_push(v, dir, cap)
  if dir > 0 then
    if v < cap then return v + SWIM_PUSH * swim_speed end
    return cap
  end
  if v > -cap then return v - SWIM_PUSH * swim_speed end
  return -cap
end

local function swim_frame(worm)
  local s = swimmers[worm.id]
  if not s or not s.suit then
    return
  end
  local P = 0x10000
  local water = wa.world.water()
  local cap = SWIM_CAP * swim_speed
  if worm.y >= water and s.plopready and worm.state ~= "teleporting" then
    wa.sound.play(worm, SWIM_SPLASH)
    s.plopready, s.plopped = false, true
    s.x, s.y = worm.x, worm.y
    s.vx, s.vy = math.min(worm.vx / P, cap), math.min(worm.vy / P, cap)
    worm:take{ turn = "run" }
    s.plophase = 0
  end
  if s.plopped and not worm.taken then
    -- The engine let go: the turn ended, or WA knocked it flying. Still in
    -- the water, the suit gives out.
    suit_off(worm, s, true, worm.vx, worm.vy)
    return
  end
  if s.plopped then
    local vx, vy = math.min(s.vx, cap), math.min(s.vy, cap)
    local held = s.keys
    local still = math.abs(vx) <= SWIM_STILL * swim_speed and math.abs(vy) <= SWIM_STILL * swim_speed
    if still and not (held.left or held.up or held.down or held.right) then
      -- Floating: the float animation, back and forth.
      s.floating = true
      s.flophase = s.flophase + SWIM_FLOAT_STEP * s.fmult
      if s.flophase >= 0.99 and s.fmult == 5 then
        s.flophase, s.fmult = 0.99, -5
      elseif s.flophase <= 0 and s.fmult == -5 then
        s.flophase, s.fmult = 0, 5
      end
    elseif vx ~= 0 and vy ~= 0 then
      -- Swimming: the stroke follows the faster of the two directions.
      s.floating = false
      if math.abs(vx) >= math.abs(vy) then
        s.plophase = s.plophase + SWIM_FLOAT_STEP * vx * worm.facing
      else
        s.plophase = s.plophase - SWIM_FLOAT_STEP * vy
      end
    elseif vx ~= 0 then
      s.floating = false
      s.plophase = s.plophase + SWIM_FLOAT_STEP * vx
    elseif vy ~= 0 then
      s.floating = false
      s.plophase = s.plophase - SWIM_FLOAT_STEP * vy
    end
    if s.plophase >= 1 or s.plophase <= -1 then
      s.plophase = 0
    end
    local k = worm.keys
    local up, down, left, right = k.up, k.down, k.left, k.right
    if up == down then vy = vy / SWIM_DRAG end
    if left == right then vx = vx / SWIM_DRAG end
    if up then vy = swim_push(vy, -1, cap) end
    if down then vy = swim_push(vy, 1, cap) end
    local shift = wa.world.keys().sprint
    if left then
      if not shift then worm.facing = -1 end
      vx = swim_push(vx, -1, cap)
    end
    if right then
      if not shift then worm.facing = 1 end
      vx = swim_push(vx, 1, cap)
    end
    s.keys = { up = up, down = down, left = left, right = right }
    -- The engine clears the keys after this hook. Move, stopping at land
    -- on each axis (unless it is already in land, so it can swim free).
    local stuck = swim_blocked(s.x, s.y)
    local nx = s.x + trunc(vx * P)
    if not stuck and swim_blocked(nx, s.y) then vx = 0 else s.x = nx end
    local ny = s.y + trunc(vy * P)
    if not stuck and swim_blocked(s.x, ny) then vy = 0 else s.y = ny end
    s.vx, s.vy = vx, vy
    -- Out of the water: on through the air, as from a jump.
    if s.y < water then
      s.floating = false
      s.plopready, s.plopped = true, false
      -- Where the swim took it: its last pin is still under the surface.
      worm.x, worm.y = s.x, s.y
      worm:release(trunc(vx * P), trunc(vy * P))
    else
      worm:carry(s.x, s.y)
      -- Too deep: the suit gives out.
      local y, w = s.y / P, water / P
      local deep
      if not wa.world.cavern() then
        deep = y > w + SWIM_DEPTH
      elseif w > 610 then
        deep = y > w + SWIM_DEPTH
      else
        deep = y > 768
      end
      if deep then
        suit_off(worm, s, true, trunc(vx * P), trunc(vy * P))
        return
      end
    end
  end
  -- Between turns, a worm out of the water takes the suit off.
  if not current_worm() and worm.y < water then
    suit_off(worm, s, false)
    return
  end
  -- RenderWorm: in the water, the swim or float animation in the worm's
  -- place (its art faces left). The bubble is drawn at render time below.
  local function art(sheet)
    return wa.actors.spawn({
      sprite = sheet, x = worm.x, y = worm.y, gravity = false,
      collide = false, owner = worm, on = function() end,
    })
  end
  if s.plopped then
    local sheet = s.floating and "sprites/swim_suit/float" or "sprites/swim_suit/swim"
    if s.body and s.body_sheet ~= sheet then
      s.body:despawn()
      s.body = nil
    end
    s.body = s.body or art(sheet)
    s.body_sheet = sheet
    local phase = s.floating and s.flophase or s.plophase
    s.body.x, s.body.y, s.body.vx, s.body.vy = s.x, s.y, 0, 0
    s.body.facing = -worm.facing
    s.body:frame(math.floor((phase % 1) * 20) % 20)
    s.body:gfx({ depth = SWIM_BODY_DEPTH })
    worm.body_visible = false
  elseif s.body then
    s.body:despawn()
    s.body = nil
    worm.body_visible = true
  end
end

-- Bubble while the suit is worn: draw-only, from the live worm position each
-- rendered frame (keeps the 16.16 fraction). A follower LuaActor + a:gfx was
-- pixel-snapped and could wobble when airborne.
if wa.on.draw then
  wa.on.draw(function()
    for _, worm in ipairs(wa.worms.all()) do
      local s = swimmers[worm.id]
      if s and s.suit then
        local x, y, h = worm.x, worm.y, SWIM_RING_HALF
        wa.draw.quad({
          points = {
            { x - h, y - h }, { x + h, y - h }, { x + h, y + h }, { x - h, y + h },
          },
          sprite = "sprites/swim_suit/ring",
          depth = SWIM_RING_DEPTH,
        })
      end
    end
  end)
end

wa.on.worm_message(function(worm, msg)
  if msg == wa.msg.FRAME_FINISH then
    swim_frame(worm)
  elseif msg == wa.msg.JUMP then
    -- M_ENTER: no jumping while it swims.
    local s = swimmers[worm.id]
    if s and s.plopped then
      return "eat"
    end
  elseif msg == wa.msg.FIRE_WEAPON then
    local s = swimmers[worm.id]
    if s and s.plopped and worm.weapon ~= "fast_walk" then
      return "eat" -- no weapons while it swims
    end
    if worm.weapon == "fast_walk" then
      swim_speed = swim_speed ~= 6 and 6 or 2
    elseif worm.weapon == "laser_sight" then
      -- FireFinal(Swim Suit), in place of WA's laser sight.
      local s = swimmer_of(worm)
      if not s.suit then
        wa.sound.play(worm, "sounds/swim_suit/putting_on_ssuit.wav")
        s.suit, s.plopready = true, true
        swim_in_game = true
        worm.collision_mask = SWIM_SUIT_MASK
      elseif worm.y < wa.world.water() then
        suit_off(worm, s, false)
      end
      worm:ammo("laser_sight", -1)
      return "eat"
    end
  end
end, { msgs = { wa.msg.FRAME_FINISH, wa.msg.JUMP, wa.msg.FIRE_WEAPON } })

-- fastswim: the swim speed is 2 again every turn.
wa.on.turn_start(function()
  swim_speed = 2
end)

-- A missile in the water hits worms too, once anyone has worn the suit.
wa.on.missile_frame(function(m)
  if swim_in_game and m.phase == "pre" and m.collision_mask == SWIM_WATER then
    m.collision_mask = SWIM_MISSILE_MASK
  end
end)

-- CMissile::Collide: such a missile blows up on a swimming worm, and is gone
-- (sent below the water, where WA frees it).
if wa.on.contact then
  wa.on.contact(function(worm, other)
    local s = swimmers[worm.id]
    if s and s.plopped and other.kind == "missile" then
      wa.actors.spawn({
        sprite = false, x = other.x, y = other.y, gravity = false, collide = false,
        owner = worm, explode = { damage = 100, id = 50, now = true },
      })
      other.y = wa.world.water() + 0x10000 * 4096
    end
  end)
end
end
`
      },
      {
        path: 'weapons/valyrian_fire.lua',
        name: 'weapons/valyrian_fire.lua',
        language: 'lua',
        content: `-- Highlander: Valyrian Fire (PX weapon_valyrianfire, rafa\`\`2's valyrianfire_s).
local shared = require("lib/shared")
local fires = shared.fires

-- PX's FireFinal: from a worm in the water nothing is thrown and the bottle
-- goes back into the team's ammo; otherwise the bottle starts 15 pixels
-- further along the aim. WA's own projectile from there, so WA flies, burns
-- and explodes it as its Petrol Bomb.
local THROW_OUT = 15

fires.valyrian_fire = function(fire)
  local w = fire.worm
  if w.y >= wa.world.water() then
    -- Set, as the pack always writes ammo; infinite (-1) stays infinite.
    local n = w:ammo("petrol_bomb")
    if n >= 0 then w:ammo("petrol_bomb", { set = n + 1 }) end
    return
  end
  -- Along the aim, which is the throw's direction. Not PX's cos and sin of
  -- the aim angle: the start is simulation, and only sqrt is exact on
  -- every machine.
  local x, y = fire.x, fire.y
  local speed = math.sqrt(fire.vx * fire.vx + fire.vy * fire.vy)
  if speed > 0 then
    x = x + math.floor(THROW_OUT * 0x10000 * fire.vx / speed)
    y = y + math.floor(THROW_OUT * 0x10000 * fire.vy / speed)
  end
  wa.weapons.launch({ weapon = "petrol_bomb", owner = w, x = x, y = y, vx = fire.vx, vy = fire.vy })
end

-- PX's ExplodeAt: 51 fires on a 3-pixel ring at the impact, besides WA's own
-- explosion (the record starts no fire of its own: its detonation is 0). Each
-- with PX's CFireDesc: count 0, duration 6000, no upward power, damage 0,
-- owned by the team of the worm whose turn it is. PX's worm handler makes
-- their hits 25% more damaging and knocks twice as hard (its M_GUNEXP,
-- WA's 0x4B from the fire): the engine scales them as it spawns them. PX
-- draws them green, SetColorMod(RGB(75, 225, 75)): \`tint\`, on the GPU.
--
-- PX places them at x +- 3 cos(360 - 7.2 i), y - 3 sin(360 - 7.2 i), the sign
-- of x alternating. Simulation, so not computed here: the offsets below are
-- that formula's, 16.16, worked out once (cos and sin need not agree to the
-- bit between machines; integers do).
local RING_DX = {
    -55776, -115699, 196548, -123441, -46357, 179843, -172459, 29988, 135973, -195426,
    101803, 71562, -188873, 158240, -3658, -153789, 190774, -78326, -95475, 194490,
    -141162, -22738, 168827, -182674, 53433, 117662, -196593, 121533, 48723, -180815,
    171275, -27575, -137724, 195144, -99709, -73828, 189536, -156780, 1219, 155297,
    -190169, 76083, 97599, -194832, 139453, 25159, -170064, 181759, -51082, -119607,
    196608,
}
local RING_DY = {
    -188531, -158960, -4877, 153027, 191065, 79442, -94407, -194308, -142008, 21527,
    168199, 183122, 54606, -116683, -196574, -122489, 47541, 180333, 171870, 28782,
    -136851, -195289, -100758, 72697, 189208, 157513, 2439, -154546, -190475, -77206,
    96539, 194665, 140310, -23949, -169449, -182220, -52259, 118637, 196604, 120572,
    -49904, -181290, -170673, -26368, 138591, 194992, 98656, -74957, -189856, -156041,
    0,
}
local VALYRIAN_FIRE = {
  count = 0, duration = 6000, up_power = 0, damage = 0, damage_scale = 1.25, knock_scale = 2,
  tint = 0x4BE14B,
}

fires.valyrian_burst = function(ev)
  local owner = shared.current_worm() or ev.worm
  if not owner then return end
  for i = 1, #RING_DX do
    wa.fire.spawn({
      owner = owner, x = ev.x + RING_DX[i], y = ev.y + RING_DY[i],
      count = VALYRIAN_FIRE.count, duration = VALYRIAN_FIRE.duration,
      up_power = VALYRIAN_FIRE.up_power, damage = VALYRIAN_FIRE.damage,
      damage_scale = VALYRIAN_FIRE.damage_scale, knock_scale = VALYRIAN_FIRE.knock_scale,
      tint = VALYRIAN_FIRE.tint,
    })
  end
end
`
      },
      {
        path: 'weapons/weapon_crate.lua',
        name: 'weapons/weapon_crate.lua',
        language: 'lua',
        content: `-- Highlander: Weapon Crate (PX utility_all_crates: allcrates_script.txt's
-- "Weapon Crate", by Steps and rafa\`\`2, animations by 0rang3), on the Freeze
-- slot as PX's Highlander scheme has it. Its record is PX's: placed as WA
-- places a mine (its take-out, placing and ammo), and the turn goes on. What
-- it places is one of WA's weapon crates, its contents WA's pick, teleported
-- in 40 px in front of the worm, for the worm to go and collect. Every worm
-- gets one each turn (scheme/rules.lua).
local shared = require("lib/shared")
local P = 0x10000

local AHEAD = 40 -- px in front of the worm

shared.fires.weapon_crate = function(fire)
  local worm = fire.worm
  wa.crates.spawn({ x = worm.x + worm.facing * AHEAD * P, y = worm.y, kind = "weapon", drop = "teleport" })
end
`
      },
      {
        path: 'weapons/wind_gravity.lua',
        name: 'weapons/wind_gravity.lua',
        language: 'lua',
        content: `-- Highlander: Wind Changer, Gravity Control. Split from rules.lua by tools/split_highlander.py.
local shared = require("lib/shared")
local FX = shared.FX
local current_worm = shared.current_worm
local trunc = shared.trunc

-- ---------------------------------------------- Wind Changer, Gravity Control
do
--
-- PX's wind_changer_script (ravander, improved by 0rang3) and
-- gravity_control_script (DabbyB, edited by 0rang3). Both records are one of
-- WA's turn utilities (subtype 19) with an index WA does not use (8), so WA
-- fires them as a utility that does nothing, spending the shot as usual, and
-- the script does the work.
--
-- Wind Changer, on the surrender's slot: while it is selected, 0..9 choose
-- the force; firing it sets the wind to force x 0.0317 towards where the
-- worm faces, through WA's own wind change, so the clouds and the wind bar
-- follow. Gravity Control, on low gravity's slot: 1..5 choose 0.3, 0.5, 1,
-- 1.7 or 2.4 times the match's gravity; firing it holds WA's gravity there
-- until the turn ends, or until the turn clock has stood still for 10 s (PX's
-- rule). Fired with nothing chosen it does not fire (PX gives the shot back).
--
-- The clock stands still while WA waits for everything to settle after a
-- shot, about 2.4 s, so shots land under the chosen gravity. Some things
-- never settle under a strong gravity: a grave vibrated in place for good at
-- 2.4x, WA waited for it, and the turn never went on. After 10 s the gravity
-- goes back and they come to rest.
--
-- Differences: a HUD line says which keys to press and what is chosen, in
-- place of PX's team messages.

local WIND_STEP = 0.0317       -- wind per point of force (PX's), a turn's wind is up to about 0.29
local GRAVITY_FACTORS = { 0.3, 0.5, 1.0, 1.7, 2.4 }
local GRAVITY_NAMES = { "Very Low Gravity", "Low Gravity", "Normal Gravity", "High Gravity", "Very High Gravity" }

local wind_force = 0          -- wf
local gravity_choice          -- TransformedGravity's index, until fired
local gravity_initial         -- InitialGravity: the match's
local gravity_factor          -- ModulatedGravity while Gravity Control is on
local SETTLE_LIMIT = 500      -- frames (10 s) the turn clock may stand still
local clock_seen = {}         -- worm id -> { clock, frames }: each worm counts the frames itself
local last_digit              -- KeyPressedNow: a digit counts when it goes down

local function gravity_back()
  gravity_factor, clock_seen = nil, {}
  wa.world.set_gravity(gravity_initial)
end

-- Every worm sees each frame once, so the first to count SETTLE_LIMIT frames
-- with the clock where it was marks 10 s, whichever worms are still alive.
local function watch_clock(worm)
  if not gravity_factor then
    return
  end
  local clock = wa.world.turn_clock()
  local seen = clock_seen[worm.id]
  if not seen or seen.clock ~= clock then
    clock_seen[worm.id] = { clock = clock, frames = 0 }
    return
  end
  seen.frames = seen.frames + 1
  if seen.frames >= SETTLE_LIMIT then
    gravity_back()
  end
end

local function world_physics_frame(worm)
  gravity_initial = gravity_initial or wa.world.gravity()
  watch_clock(worm)
  if not worm.turn then
    return
  end
  local digit = wa.world.keys().digit
  local pressed = digit ~= nil and digit ~= last_digit
  last_digit = digit
  if not pressed then
    return
  end
  if worm.weapon == "surrender" then
    wind_force = digit
    wa.sound.play(worm, 107)
  elseif worm.weapon == "low_gravity" and digit >= 1 and digit <= 5 then
    gravity_choice = digit
    wa.sound.play(worm, 92)
  end
end

wa.on.worm_message(function(worm, msg)
  if msg == wa.msg.FRAME_FINISH then
    world_physics_frame(worm)
  elseif msg == wa.msg.FIRE_WEAPON and worm.weapon == "surrender" then
    -- FireFinal(Wind Changer): breeze for none, a calm wind up to 5, strong
    -- above; towards where the worm faces.
    local f = wind_force
    wa.sound.play(worm, f == 0 and "sounds/wind_changer/breeze.wav"
      or f < 6 and "sounds/wind_changer/calm_wind.wav" or "sounds/wind_changer/strong_wind.wav")
    wa.world.set_wind(trunc(f * WIND_STEP * FX) * worm.facing)
  elseif msg == wa.msg.FIRE_WEAPON and worm.weapon == "low_gravity" then
    if not gravity_choice then
      wa.sound.play(worm, "sounds/gravity_control/error.wav")
      return "eat"
    end
    gravity_initial = gravity_initial or wa.world.gravity()
    gravity_factor, gravity_choice = GRAVITY_FACTORS[gravity_choice], nil
    clock_seen = {}
    wa.sound.play(worm, "sounds/gravity_control/activate.wav")
    wa.world.set_gravity(trunc(gravity_initial * gravity_factor))
  end
end, { msgs = { wa.msg.FRAME_FINISH, wa.msg.FIRE_WEAPON } })

-- Reset when this turn ends; doing it at the next turn start can softlock.
wa.on.turn_end(function()
  if gravity_factor then
    gravity_back()
  end
  gravity_choice = nil
end)

if wa.on.hud then
  wa.on.hud(function()
    local worm = current_worm()
    if not worm then
      return
    end
    if worm.weapon == "surrender" then
      wa.hud.line(string.format("Wind Changer: force %d (keys 0-9), then Space", wind_force))
    elseif worm.weapon == "low_gravity" then
      wa.hud.line("Gravity Control: " .. (gravity_choice and GRAVITY_NAMES[gravity_choice]
        or "choose 1-5") .. ", then Space")
    end
  end)
end
end
`
      }
    ],
  },
  {
    id: 'example.highlanderpurelua',
    name: 'Highlander (single file)',
    version: '0.1.0',
    author: 'wkLua',
    category: 'rules',
    description: 'The same rules as the module pack in one rules.lua with no require. Use this when you want the behaviour without the module layout.',
    tags: ['example', 'rules'],
    files: [
      {
        path: 'rules.lua',
        name: 'rules.lua',
        language: 'lua',
        content: `-- Highlander, stock weapons only.
--
-- A port of the rules in Project X's \`scheme_hl_0rang3\` (Highlander 0rang3
-- 1.1), without its custom weapons. Every worm is dealt one weapon from each
-- of three pools at the start of the match. Only the worm whose turn it is
-- may use its weapons, one shot of each per turn. Kill a worm and you take
-- everything it carried.
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
--   * Wind Changer (x1) and Hot Air Balloon (x3) are PX weapons with no stock
--     equivalent, so nothing is granted in their place.
--
--   * The cavern rule bans strikes by NAME. PX did it by cutting the random
--     range short (RandomInt(0,20) instead of (0,28)), which only works
--     because its list happened to keep the strikes at the end.
--
-- Lockstep: every rule runs inside wa.on.worm_message, which is WA's own
-- simulation, and every random choice is wa.random(). Two peers, or a peer
-- and a replay, deal the same hands and make the same grants. Nothing here
-- reads local input or the clock.

-- ----------------------------------------------------------------- pools

-- Movement: exactly the seven the design names.
local MOVEMENT = {
  "ninja_rope", "girder", "girder_pack", "jet_pack", "low_gravity",
  "fast_walk", "parachute",
}

-- Second weapon: the F4 row, plus what is left of F7 once the girders have
-- gone to movement.
local SECOND = {
  "fire_punch", "dragon_ball", "kamikaze", "suicide_bomber", "prod",
  "blow_torch", "pneumatic_drill", "baseball_bat",
}

-- Offensive: every remaining weapon that does damage, super weapons included.
-- The non-attacks -- bungee, teleport, scales, select worm, freeze, the
-- utilities, skip go and surrender -- are not in any pool. Highlander never
-- touches them, so their ammo is whatever the scheme says.
local OFFENSIVE = {
  -- F1-F3
  "bazooka", "homing_missile", "mortar", "homing_pigeon", "sheep_launcher",
  "grenade", "cluster_bomb", "banana_bomb", "battle_axe", "earthquake",
  "shotgun", "handgun", "uzi", "minigun", "longbow",
  -- F5-F6
  "dynamite", "mine", "sheep", "super_sheep", "aqua_sheep", "mole_bomb",
  "air_strike", "napalm_strike", "mail_strike", "mine_strike", "mole_squadron",
  -- F9-F11
  "super_banana", "holy_grenade", "flame_thrower", "salvation_army", "mb_bomb",
  "petrol_bomb", "skunk", "ming_vase", "sheep_strike", "carpet_bomb",
  "mad_cow", "old_woman", "donkey", "nuclear_test", "armageddon",
  -- F12
  "magic_bullet",
}

-- Everything that arrives from the sky. PX keeps strikes out of caverns, where
-- they would hit the roof.
local CAVE_BANNED = {
  air_strike = true, napalm_strike = true, mail_strike = true,
  mine_strike = true, mole_squadron = true, sheep_strike = true,
  carpet_bomb = true, donkey = true, armageddon = true,
}

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

-- Keyed by stable worm id (team * 16 + index), which is the same on every
-- peer and in a replay. Never by handle: a handle is an entity address, and a
-- dead worm's entity is freed while its id lives on in these tables.
local hands = {} -- [id] = { weapon names }, draw order first, then stolen
local dead = {} -- [id] = true once the worm has been seen at 0 hp
local active_id -- PX's CurW: the worm whose turn it is, or was

local function by_id(a, b)
  return a.id < b.id
end

-- The live worms, in id order. Called fresh every time rather than cached:
-- the list shrinks as worms die, and a cached handle to a freed worm would be
-- a read of freed memory.
local function worms()
  local list = wa.worms.all()
  table.sort(list, by_id)
  return list
end

local function find(id)
  for _, w in ipairs(worms()) do
    if w.id == id then
      return w
    end
  end
  return nil
end

local function describe(list)
  if not list or #list == 0 then
    return "(nothing)"
  end
  return table.concat(list, ", ")
end

-- ----------------------------------------------------------------- rules

local function draw(pool)
  return pool[wa.random(1, #pool)]
end

local function offensive_pool()
  if not wa.world.cavern() then
    return OFFENSIVE
  end
  local pool = {}
  for _, name in ipairs(OFFENSIVE) do
    if not CAVE_BANNED[name] then
      pool[#pool + 1] = name
    end
  end
  return pool
end

-- One from each pool, dealt to a worm on the first message it receives -- as
-- PX does on each worm's first M_FRAME. Dealing everyone at once on the very
-- first message would assume every worm already exists by then; this makes no
-- such assumption. Worms receive messages in WA's own entity order, which is
-- the same on every peer, so the draws still come out of WA's RNG in the same
-- sequence everywhere.
local function deal(worm)
  local cave = wa.world.cavern()
  hands[worm.id] = { draw(offensive_pool()), draw(SECOND), draw(MOVEMENT) }
  wa.log(string.format(
    "highlander: worm %d dealt %s (%s map)",
    worm.id, describe(hands[worm.id]), cave and "cavern" or "open"
  ))
end

local function set_all(worm, list, n)
  for _, name in ipairs(list) do
    worm:ammo(name, { set = n })
  end
end

-- Take every pooled weapon away from every team.
--
-- WA keeps ammo in separate physical rows (\`worm.ammo_group\`), which need not
-- match a team's visible coalition colour (\`worm.alliance\`).
-- Going through one worm of each team reaches every row without relying on
-- that mapping -- a row two allied teams share is simply written twice.
local function clear_pooled()
  local seen = {}
  for _, w in ipairs(worms()) do
    if not seen[w.team] then
      seen[w.team] = true
      set_all(w, POOLED, 0)
    end
  end
end

local function start_turn(worm)
  clear_pooled()
  active_id = worm.id
  set_all(worm, hands[worm.id] or {}, 1)
end

-- PX checks every worm on every frame for "0 hp and not yet marked dead".
local function check_death(worm)
  local id = worm.id
  if dead[id] or worm.hp > 0 then
    return
  end
  dead[id] = true
  local mine = hands[id] or {}

  if active_id == id then
    -- Died on its own turn: nothing to hand on, just take its weapons away.
    set_all(worm, mine, 0)
    wa.log(string.format("highlander: worm %d died on its own turn", id))
    return
  end

  -- Otherwise the worm whose turn it is gets everything -- whoever or
  -- whatever did the killing, friend or foe, exactly as in PX.
  if active_id == nil or dead[active_id] then
    return
  end
  local stealer = find(active_id)
  if not stealer then
    return
  end
  local theirs = hands[active_id]
  for _, name in ipairs(mine) do
    theirs[#theirs + 1] = name
  end
  -- Usable at once, this turn, not from the stealer's next turn.
  set_all(stealer, mine, 1)
  wa.log(string.format(
    "highlander: worm %d took %s from worm %d", active_id, describe(mine), id
  ))
end

wa.on.worm_message(function(worm, msg)
  if hands[worm.id] == nil then
    deal(worm)
  end
  if msg == wa.msg.START_TURN then
    start_turn(worm)
  elseif msg == wa.msg.FRAME_FINISH then
    check_death(worm)
  end
end)
`
      },
      {
        path: 'test_rules.lua',
        name: 'test_rules.lua',
        language: 'lua',
        content: `-- Drives mods/examples/highlander_pure_lua/rules.lua against a mocked WA.
--
--   lua mods/examples/highlander_pure_lua/test_rules.lua   (from the repo root)
--
-- The pack is data, not a crate, so this is not part of \`cargo test\`. Ammo
-- is modelled per ammo group, as WA stores it, and \`{ set = n }\` is
-- absolute, infinite included, as the engine implements it. Which row a team
-- writes to is the engine's job (\`world::ammo_row\`), not the pack's, so it is
-- not something this mock can test.

local STOCK = {
  "none", "bazooka", "homing_missile", "mortar", "homing_pigeon",
  "sheep_launcher", "grenade", "cluster_bomb", "banana_bomb", "battle_axe",
  "earthquake", "shotgun", "handgun", "uzi", "minigun", "longbow",
  "fire_punch", "dragon_ball", "kamikaze", "suicide_bomber", "prod",
  "dynamite", "mine", "sheep", "super_sheep", "aqua_sheep", "mole_bomb",
  "air_strike", "napalm_strike", "mail_strike", "mine_strike",
  "mole_squadron", "blow_torch", "pneumatic_drill", "girder",
  "baseball_bat", "girder_pack", "ninja_rope", "bungee", "parachute",
  "teleport", "scales_of_justice", "super_banana", "holy_grenade",
  "flame_thrower", "salvation_army", "mb_bomb", "petrol_bomb", "skunk",
  "ming_vase", "sheep_strike", "carpet_bomb", "mad_cow", "old_woman",
  "donkey", "nuclear_test", "armageddon", "skip_go", "surrender",
  "select_worm", "freeze", "magic_bullet", "jet_pack", "low_gravity",
  "fast_walk", "laser_sight", "invisibility", "damage_x2", "crate_spy",
  "double_turn_time", "crate_shower",
}
local IS_STOCK = {}
for _, n in ipairs(STOCK) do
  IS_STOCK[n] = true
end

local MOVEMENT = {
  ninja_rope = 1, girder = 1, girder_pack = 1, jet_pack = 1,
  low_gravity = 1, fast_walk = 1, parachute = 1,
}
local SECOND = {
  fire_punch = 1, dragon_ball = 1, kamikaze = 1, suicide_bomber = 1,
  prod = 1, blow_torch = 1, pneumatic_drill = 1, baseball_bat = 1,
}
local SCHEME_OWNED = {
  bungee = 1, teleport = 1, scales_of_justice = 1, skip_go = 1,
  surrender = 1, select_worm = 1, freeze = 1, laser_sight = 1,
  invisibility = 1, damage_x2 = 1, crate_spy = 1, double_turn_time = 1,
  crate_shower = 1,
}
local STRIKES = {
  air_strike = 1, napalm_strike = 1, mail_strike = 1, mine_strike = 1,
  mole_squadron = 1, sheep_strike = 1, carpet_bomb = 1, donkey = 1,
  armageddon = 1,
}

-- ------------------------------------------------------------ mocked WA

local M, ammo, worms, cavern, rng, logs

local Worm = {}
Worm.__index = Worm
function Worm:ammo(name, change)
  assert(IS_STOCK[name], "pack asked for a weapon that does not exist: " .. tostring(name))
  local store = ammo[self.ammo_group]
  if change == nil then
    return store[name] or 0
  end
  assert(type(change) == "table" and change.set, "rules must only ever SET ammo")
  store[name] = change.set
  return change.set
end

local function new_match(opts)
  opts = opts or {}
  M, logs = {}, {}
  cavern = opts.cavern or false
  rng = 12345
  ammo = {}
  worms = {}
  -- Two teams of two, each its own alliance: team 1 is alliance 0, team 2 is 1.
  for team = 1, 2 do
    ammo[team - 1] = {}
    for index = 0, 1 do
      worms[#worms + 1] = setmetatable({
        id = team * 16 + index, team = team, alliance = team - 1,
        ammo_group = team - 1, hp = 100,
      }, Worm)
    end
  end
  -- A stock-like scheme: infinite bazooka, a few counted weapons, a utility.
  for a = 0, 1 do
    ammo[a].bazooka = -1
    ammo[a].grenade = 5
    ammo[a].teleport = 2
    ammo[a].skip_go = -1
  end
  wa = {
    log = function(s) logs[#logs + 1] = s end,
    hud = { line = function() end },
    msg = { FRAME_FINISH = 2, START_TURN = 0x34 },
    world = { cavern = function() return cavern end },
    -- A fixed LCG: the pack must not care which numbers, only that it draws
    -- through here.
    random = function(lo, hi)
      rng = (rng * 1103515245 + 12345) % 2147483648
      return lo + rng % (hi - lo + 1)
    end,
    worms = {
      all = function()
        local live = {}
        -- Deliberately NOT in id order: the pack must sort for itself.
        for i = #worms, 1, -1 do
          live[#live + 1] = worms[i]
        end
        return live
      end,
    },
    on = {
      worm_message = function(f) M.message = f end,
      hud = function(f) M.hud = f end,
    },
  }
  dofile("mods/examples/highlander_pure_lua/rules.lua")
end

local function worm(id)
  for _, w in ipairs(worms) do
    if w.id == id then
      return w
    end
  end
end

local function frame()
  for _, w in ipairs(worms) do
    M.message(w, 2)
  end
end

local function turn(id)
  M.message(worm(id), 0x34)
end

local function kill(id)
  worm(id).hp = 0
  frame()
end

local function remove(id)
  for i, w in ipairs(worms) do
    if w.id == id then
      table.remove(worms, i)
      return
    end
  end
end

-- What the pack dealt, read back out of its own log lines.
local function hand(id)
  for _, line in ipairs(logs) do
    local who, list = line:match("^highlander: worm (%d+) dealt (.-) %(")
    if tonumber(who) == id then
      local out = {}
      for name in list:gmatch("[^, ]+") do
        out[#out + 1] = name
      end
      return out
    end
  end
end

local fails = 0
local function check(name, cond, detail)
  print(("  %s %s%s"):format(cond and "ok  " or "FAIL", name, detail and ("   [" .. detail .. "]") or ""))
  if not cond then
    fails = fails + 1
  end
end

local function usable(alliance)
  local out = {}
  for name, n in pairs(ammo[alliance]) do
    if n ~= 0 and not SCHEME_OWNED[name] then
      out[#out + 1] = name
    end
  end
  table.sort(out)
  return out
end

local function sorted(list)
  local c = {}
  for i, v in ipairs(list) do
    c[i] = v
  end
  table.sort(c)
  return c
end

local function same(a, b)
  return table.concat(sorted(a), ",") == table.concat(sorted(b), ",")
end

-- ------------------------------------------------------------ tests

print("pools: every stock slot is in exactly one place")
do
  new_match()
  turn(16)
  -- Every slot the pack zeroed is a pooled slot; every other slot it never touched.
  local pooled = {}
  for _, alliance in ipairs({ 0, 1 }) do
    for name in pairs(ammo[alliance]) do
      if not SCHEME_OWNED[name] then
        pooled[name] = true
      end
    end
  end
  local n, bad = 0, {}
  for name in pairs(pooled) do
    n = n + 1
    if not IS_STOCK[name] then
      bad[#bad + 1] = name
    end
  end
  check("57 pooled slots", n == 57, tostring(n))
  check("all pooled names are stock", #bad == 0, table.concat(bad, ","))
  local untouched = true
  for name in pairs(SCHEME_OWNED) do
    if pooled[name] then
      untouched = false
    end
  end
  check("scheme-owned slots are never pooled", untouched)
  check("teleport ammo left to the scheme", ammo[0].teleport == 2 and ammo[1].teleport == 2)
  check("skip go left to the scheme", ammo[0].skip_go == -1)
end

print("deal: one from each pool, per worm")
do
  new_match()
  frame()
  local ok = true
  for _, id in ipairs({ 16, 17, 32, 33 }) do
    local h = hand(id)
    if not h or #h ~= 3 or SECOND[h[1]] or MOVEMENT[h[1]] or SCHEME_OWNED[h[1]]
        or not SECOND[h[2]] or not MOVEMENT[h[3]] then
      ok = false
    end
  end
  check("every worm gets offensive, second, movement", ok)
end

print("deal: deterministic, each worm dealt on its own first message")
do
  new_match()
  frame()
  local first = { hand(16), hand(17), hand(32), hand(33) }
  new_match()
  frame()
  local again = { hand(16), hand(17), hand(32), hand(33) }
  local same_hands = true
  for i = 1, 4 do
    if table.concat(first[i], ",") ~= table.concat(again[i], ",") then
      same_hands = false
    end
  end
  check("same RNG, same hands", same_hands)
  local order = {}
  for _, line in ipairs(logs) do
    local who = line:match("^highlander: worm (%d+) dealt")
    if who then
      order[#order + 1] = who
    end
  end
  check("dealt in message order", table.concat(order, ",") == "16,17,32,33", table.concat(order, ","))
end

print("deal: a worm that first speaks late still gets a hand")
do
  new_match()
  -- Only worm 16 exists when the first message arrives.
  local later = {}
  for i = #worms, 2, -1 do
    table.insert(later, 1, table.remove(worms, i))
  end
  frame()
  for _, w in ipairs(later) do
    worms[#worms + 1] = w
  end
  frame()
  local ok = true
  for _, id in ipairs({ 16, 17, 32, 33 }) do
    if not hand(id) or #hand(id) ~= 3 then
      ok = false
    end
  end
  check("all four dealt", ok)
end

print("cavern: no strikes are dealt")
do
  local struck = false
  for seed = 1, 40 do
    new_match({ cavern = true })
    rng = seed * 7919
    frame()
    for _, id in ipairs({ 16, 17, 32, 33 }) do
      if STRIKES[hand(id)[1]] then
        struck = true
      end
    end
  end
  check("160 cavern hands, no strike", not struck)
  local seen = false
  for seed = 1, 40 do
    new_match()
    rng = seed * 7919
    frame()
    for _, id in ipairs({ 16, 17, 32, 33 }) do
      if STRIKES[hand(id)[1]] then
        seen = true
      end
    end
  end
  check("...while open maps do deal them", seen)
end

print("turn: only the active worm's hand is usable, one of each")
do
  new_match()
  frame()
  turn(16)
  check("team 1 holds exactly worm 16's hand", same(usable(0), hand(16)),
    table.concat(usable(0), ","))
  local ones = true
  for _, name in ipairs(hand(16)) do
    if ammo[0][name] ~= 1 then
      ones = false
    end
  end
  check("each at exactly 1", ones)
  check("the other team holds nothing", #usable(1) == 0, table.concat(usable(1), ","))
  check("the scheme's infinite bazooka is gone unless dealt",
    ammo[1].bazooka == 0)
end

print("turn: the previous worm's hand is taken back")
do
  new_match()
  frame()
  turn(16)
  turn(32)
  check("team 1 holds nothing", #usable(0) == 0, table.concat(usable(0), ","))
  check("team 2 holds worm 32's hand", same(usable(1), hand(32)))
end

print("turn: a teammate's hand is not usable on your turn")
do
  new_match()
  frame()
  turn(17)
  check("team 1 holds worm 17's hand, not 16's", same(usable(0), hand(17)))
end

print("death: the active worm takes the dead worm's hand, at once")
do
  new_match()
  frame()
  turn(16)
  local victim = hand(32)
  kill(32)
  local expect = {}
  for _, n in ipairs(hand(16)) do expect[#expect + 1] = n end
  for _, n in ipairs(victim) do expect[#expect + 1] = n end
  -- Duplicates collapse in ammo (both are just "1"), so compare as sets.
  local want = {}
  for _, n in ipairs(expect) do want[n] = true end
  local got = {}
  for _, n in ipairs(usable(0)) do got[n] = true end
  local ok = true
  for n in pairs(want) do if not got[n] then ok = false end end
  for n in pairs(got) do if not want[n] then ok = false end end
  check("stolen weapons usable this turn", ok, table.concat(usable(0), ","))
  -- The dead worm's entity goes away; its id must be all the pack needs.
  remove(32)
  turn(33)
  turn(16)
  local ok2 = true
  for n in pairs(want) do if ammo[0][n] ~= 1 then ok2 = false end end
  check("and kept on the stealer's next turn", ok2)
end

print("death: a friendly kill still transfers, as in PX")
do
  new_match()
  frame()
  turn(16)
  kill(17)
  local has = {}
  for _, n in ipairs(usable(0)) do has[n] = true end
  local ok = true
  for _, n in ipairs(hand(17)) do if not has[n] then ok = false end end
  check("teammate's hand goes to the active worm", ok)
end

print("death: one death, one transfer")
do
  new_match()
  frame()
  turn(16)
  kill(32)
  local n = 0
  for _, line in ipairs(logs) do
    if line:find("took") then n = n + 1 end
  end
  frame()
  frame()
  local m = 0
  for _, line in ipairs(logs) do
    if line:find("took") then m = m + 1 end
  end
  check("no second transfer on later frames", n == 1 and m == 1, n .. " then " .. m)
end

print("death: the active worm dying on its own turn loses its hand, gives nothing")
do
  new_match()
  frame()
  turn(16)
  kill(16)
  check("team 1 holds nothing", #usable(0) == 0, table.concat(usable(0), ","))
  local took = false
  for _, line in ipairs(logs) do
    if line:find("took") then took = true end
  end
  check("no transfer", not took)
end

print("death: a worm that dies after its stealer died gives nothing")
do
  new_match()
  frame()
  turn(16)
  kill(16)
  kill(32)
  local took = false
  for _, line in ipairs(logs) do
    if line:find("took") then took = true end
  end
  check("no transfer to a dead worm", not took)
end

print("")
if fails == 0 then
  print("ALL PASS")
else
  print(("%d FAILED"):format(fails))
  os.exit(1)
end
`
      }
    ],
  },
  {
    id: 'example.wormcraft',
    name: 'Wormcraft',
    version: '0.1.0',
    author: 'wkLua',
    category: 'weapons',
    replacesSlot: 'cluster_bomb',
    description: 'Engine example pack: wormcraft. Embedded verbatim from WormForge-main-source/mods/examples/wormcraft.',
    tags: ['example', 'weapons'],
    files: [
      {
        path: 'weapons.lua',
        name: 'weapons.lua',
        language: 'lua',
        content: `-- Cluster Bomb slot. Aiming keeps the stock cluster sprite / worm.
-- Shot: fullscreen cut-in, courier flies, then WormCraft is spelled letter by letter.

local PX = 0x10000
local WORD = { "W", "o", "r", "m", "C", "r", "a", "f", "t" }
local STEP = 58 * PX
local LETTER_W, LETTER_H = 50 * PX, 70 * PX
local GAP = 50 * PX
local LETTER_WAIT = 22
local SEQ_FPS = 15
local FRAMES = {
  ["sprites/absorb"] = 31,
  ["sprites/burst"] = 18,
  ["sprites/death"] = 50,
  ["sprites/haste"] = 29,
  ["sprites/heal"] = 16,
}

local function fx_brain(sprite)
  local frames = FRAMES[sprite] or 1
  local need = frames * 50 // SEQ_FPS
  if need < 1 then
    need = 1
  end
  local t = 0
  return function(a)
    a.vx = 0
    a.vy = 0
    t = t + 1
    a:advance()
    if t >= need then
      a:despawn()
    end
  end
end

local function spawn_fx(sprite, x, y, owner)
  wa.actors.spawn({
    sprite = sprite,
    x = x,
    y = y,
    vx = 0,
    vy = 0,
    gravity = false,
    loop = false,
    collide = false,
    origin = "center",
    owner = owner,
    on = fx_brain(sprite),
  })
end

local function surround(origin, left, y, n)
  local right = left + (n - 1) * STEP
  local mid = origin.x
  local owner = origin.owner
  local side = LETTER_W // 2 + GAP
  local up = LETTER_H // 2 + GAP
  spawn_fx("sprites/death", left - side, y, owner)
  spawn_fx("sprites/death", right + side, y, owner)
  spawn_fx("sprites/haste", mid, y - up, owner)
  spawn_fx("sprites/heal", mid, y + up, owner)
  spawn_fx("sprites/absorb", mid, y - up - GAP, owner)
  spawn_fx("sprites/burst", left - side, y - up, owner)
  spawn_fx("sprites/burst", right + side, y - up, owner)
end

local function letter_brain(delay, last, origin, left, y, n, dest_x, dest_y, i)
  local t = 0
  local shown = false
  local falling = false
  local boom = false
  local word_done = 10 + (n - 1) * LETTER_WAIT + 20
  local fall_at = word_done + 4 + (i - 1) * 11 + ((i - 1) % 3) * 5
  local drop = 0x1400 + i * 0x0A00
  return function(a)
    t = t + 1
    if t < delay then
      a.x = dest_x
      a.y = -0x8000000
      a.vx = 0
      a.vy = 0
      return
    end
    local age = t - delay
    if age == 0 then
      a.x = dest_x
      a.y = dest_y
      if last then
        a:sound("sounds/emotional-damage.wav")
      end
    end
    if last and not shown and age == 20 then
      shown = true
      surround(origin, left, y, n)
    end
    if not falling then
      a.vx = 0
      if age < 16 then
        a.vy = -0x3000
      else
        a.vy = 0
      end
      a:move({ terrain = false, worms = false })
      a.vx = 0
      a.vy = 0
      if t >= fall_at then
        falling = true
        a.vy = drop
      end
      return
    end
    a:gravity()
    local hit = a:move({ terrain = true, worms = true })
    if not boom and (hit.land or a:on_feet()) then
      boom = true
      a:explode({ damage = 35, id = 100, at = "below" })
      a:despawn()
      return
    end
    if a:in_water() then
      a:despawn()
    end
  end
end

local function write_word(origin)
  local n = #WORD
  local left = origin.x - (n - 1) * STEP // 2
  local y = origin.y - 36 * PX
  local feet_y = y + LETTER_H // 2
  for i, ch in ipairs(WORD) do
    local dest_x = left + (i - 1) * STEP
    wa.actors.spawn({
      sprite = "sprites/" .. ch .. ".png",
      x = dest_x,
      y = -0x8000000,
      vx = 0,
      vy = 0,
      gravity = false,
      loop = false,
      collide = false,
      origin = "bottom",
      owner = origin.owner,
      on = letter_brain(10 + (i - 1) * LETTER_WAIT, i == n, origin, left, y, n, dest_x, feet_y, i),
    })
  end
end

local CUTIN = 42

local function cutout_brain()
  local t = 0
  return function(a)
    t = t + 1
    a.vx = 0
    a.vy = 0
    if t >= CUTIN then
      a:despawn()
    end
  end
end

local function courier_brain()
  local t = 0
  return function(a)
    t = t + 1
    a:gravity()
    local hit = a:move({ terrain = true, worms = true })
    a:advance()
    if hit.land or hit.worm or t >= 30 then
      write_word(a)
      a:despawn()
    end
  end
end

local function lines_brain(fire)
  local t = 0
  local fired = false
  return function(a)
    t = t + 1
    a.vx = 0
    a.vy = 0
    a:advance()
    if t >= CUTIN and not fired then
      fired = true
      wa.actors.spawn({
        sprite = "sprites/absorb",
        x = fire.x,
        y = fire.y,
        vx = fire.vx,
        vy = fire.vy,
        origin = "center",
        owner = fire.worm,
        on = courier_brain(),
      })
      a:despawn()
    end
  end
end

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
      x = 0,
      y = 0,
      vx = 0,
      vy = 0,
      gravity = false,
      loop = true,
      collide = false,
      origin = "center",
      screen = "fill",
      owner = fire.worm,
      on = lines_brain(fire),
    })
    wa.actors.spawn({
      sprite = "sprites/cutout.png",
      x = 0,
      y = 0,
      vx = 0,
      vy = 0,
      gravity = false,
      loop = false,
      collide = false,
      origin = "center",
      screen = "front",
      owner = fire.worm,
      on = cutout_brain(),
    })
    lines:sound("sounds/cutout.wav")
  end,
})
`
      }
    ],
  },
  {
    id: 'example.turret',
    name: 'Turret',
    version: '0.1.0',
    author: 'wkLua',
    category: 'weapons',
    replacesSlot: 'dynamite',
    description: 'Engine example pack: turret. Embedded verbatim from WormForge-main-source/mods/examples/turret.',
    tags: ['example', 'weapons'],
    files: [
      {
        path: 'weapons.lua',
        name: 'weapons.lua',
        language: 'lua',
        content: `-- Dynamite slot, mine placement. Space plants a persist LuaActor.
-- LOS with wa.land.trace, hitscan with worm:hurt. No stock blast.

local PX = 0x10000

local SENSOR_PX    = 360
local AMMO         = 20
local DAMAGE       = 2
local SHOT_FRAMES  = 6
local ARM_FRAMES   = 30
local BEEP_FRAMES  = 60
local ROT_IDLE     = 3
local ROT_ACTIVE   = 8
local AIM_TOLERANCE = 1.5
local HIT_PX       = 10
local KNOCK        = 0x1C000
local STEPS        = 120
local SINK_PX      = 8
local MUZZLE_UP    = 25
local MUZZLE_OUT   = 11
local SPARK_LIFE   = 10

local SPREAD = { 0.0, 1.5, -1.0, 2.0, -2.0, 1.0, -1.5, 0.5 }

local state = {}
local sparks = {}

local function turret_sheet(team, pose)
  return "sprites/turret_t" .. team .. "_p" .. pose .. ".gif"
end

local IMPACT = "sprites/uzihit.png"

local SPRITES = { IMPACT }
for t = 1, 6 do
  for pose = 0, 2 do
    SPRITES[#SPRITES + 1] = turret_sheet(t, pose)
  end
end

local function step_index(angle, steps)
  return math.floor((angle % 360) / (360 / steps) + 0.5) % steps
end

-- 0 = down, 90 = right: source art faces right, screen y grows down.
local function angle_to(ax, ay, tx, ty)
  local dx = (tx - ax) // PX
  local dy = (ty - ay) // PX
  local deg = math.deg(math.atan(dx, dy))
  if deg < 0 then
    deg = deg + 360
  end
  return deg
end

local function turn_toward(cur, want, speed)
  local d = (want - cur + 540) % 360 - 180
  if d > speed then
    d = speed
  elseif d < -speed then
    d = -speed
  end
  return (cur + d) % 360
end

local function angle_gap(a, b)
  local d = (a - b + 540) % 360 - 180
  return d < 0 and -d or d
end

local function enemy(s, w)
  if not w or w.hp <= 0 or w.visible == false then
    return false
  end
  return w.alliance ~= s.alliance
end

-- WA walks by stepping position with vx/vy still 0, so motion is last-tick pos.
local function note_motion(s, w)
  local p = s.seen[w.id]
  if p then
    p.moving = (p.x ~= w.x or p.y ~= w.y or w.vx ~= 0 or w.vy ~= 0)
    p.x, p.y = w.x, w.y
  else
    s.seen[w.id] = { x = w.x, y = w.y, moving = (w.vx ~= 0 or w.vy ~= 0) }
  end
end

local function moving(s, w)
  local p = s.seen[w.id]
  return p ~= nil and p.moving
end

local function sees(a, s, w)
  if not enemy(s, w) or not moving(s, w) then
    return false
  end
  local ex, ey = a.x, a.y - MUZZLE_UP * PX
  local dx = (w.x - ex) // PX
  local dy = (w.y - ey) // PX
  if dx * dx + dy * dy > SENSOR_PX * SENSOR_PX then
    return false
  end
  return not wa.land.trace(ex, ey, w.x, w.y)
end

local function acquire(a, s)
  local ex, ey = a.x, a.y - MUZZLE_UP * PX
  local best, best_d
  for _, w in ipairs(wa.worms.all()) do
    if sees(a, s, w) then
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

local function held(a, s)
  if not s.tid then
    return nil
  end
  for _, w in ipairs(wa.worms.all()) do
    if w.id == s.tid then
      return sees(a, s, w) and w or nil
    end
  end
  return nil
end

local function spark_brain(a)
  local n = sparks[a.id] or 0
  a:frame(n)
  n = n + 1
  sparks[a.id] = n
  if n >= SPARK_LIFE then
    sparks[a.id] = nil
    a:despawn()
  end
end

local function spark_at(x, y)
  wa.actors.spawn({
    sprite = IMPACT,
    x = x,
    y = y,
    vx = 0,
    vy = 0,
    gravity = false,
    collide = false,
    drown = false,
    loop = false,
    origin = "center",
    on = spark_brain,
  })
end

local function start_firing(a, s)
  if s.firing then return end
  s.firing = true
  s.anim = 0
  s.fire_sound = 35
  a:sound("sounds/sentryfireloop.wav")
end

local function stop_firing(a, s)
  if not s.firing then return end
  s.firing = false
  s.anim = 0
  a:sound("sounds/sentryfireend.wav")
end

local function fire(a, s)
  s.shots = s.shots + 1
  local dev = 0
  if s.shots % 5 ~= 0 then
    dev = SPREAD[(s.shots % #SPREAD) + 1]
  end

  local rad = math.rad(s.angle + dev)
  local dx, dy = math.sin(rad), math.cos(rad)
  local mx = a.x + math.floor(dx * MUZZLE_OUT * PX)
  local my = a.y - MUZZLE_UP * PX + math.floor(dy * MUZZLE_OUT * PX)
  local reach = SENSOR_PX * PX
  local ex = mx + math.floor(dx * reach)
  local ey = my + math.floor(dy * reach)

  local hit = wa.land.trace(mx, my, ex, ey)
  local hx, hy = ex, ey
  if hit then
    hx, hy = hit.x, hit.y
  end
  local rx, ry = (hx - mx) // PX, (hy - my) // PX
  local hit_px = rx * rx + ry * ry
  local victim
  for _, w in ipairs(wa.worms.all()) do
    if enemy(s, w) then
      local wx = (w.x - mx) // PX
      local wy = (w.y - my) // PX
      local along = wx * dx + wy * dy
      if along > 0 and along * along < hit_px then
        local off = wx * dy - wy * dx
        if off * off <= HIT_PX * HIT_PX then
          hx = mx + math.floor(dx * along * PX)
          hy = my + math.floor(dy * along * PX)
          hit_px = along * along
          victim = w
        end
      end
    end
  end

  if victim then
    victim:hurt(DAMAGE)
    victim.vx = victim.vx + math.floor(dx * KNOCK)
    victim.vy = victim.vy + math.floor(dy * KNOCK)
  end
  spark_at(hx, hy)

  s.ammo = s.ammo - 1
end

local function think(a, s)
  if s.px then
    a.x, a.y = s.px, s.py
  end
  a.vx, a.vy = 0, 0

  for _, w in ipairs(wa.worms.all()) do
    note_motion(s, w)
  end

  local can_shoot = s.arm <= 0 and s.ammo > 0
  local target
  if can_shoot then
    target = held(a, s)
    if not target then
      target = acquire(a, s)
      s.tid = target and target.id or nil
    end
  end

  local want
  if target then
    if not s.had_target then
      if s.beep <= 0 then
        a:sound("sounds/sentrybeeps2.wav")
        s.beep = BEEP_FRAMES
      end
    end
    s.had_target = true
    want = angle_to(a.x, a.y - MUZZLE_UP * PX, target.x, target.y)
    s.angle = turn_toward(s.angle, want, ROT_ACTIVE)
  else
    s.had_target = false
    s.tid = nil
    s.angle = (s.angle + ROT_IDLE) % 360
  end

  if s.beep > 0 then s.beep = s.beep - 1 end
  if s.arm > 0 then s.arm = s.arm - 1 end
  if s.cooldown > 0 then s.cooldown = s.cooldown - 1 end
  if s.fire_sound > 0 then s.fire_sound = s.fire_sound - 1 end

  local aligned = target and angle_gap(s.angle, want) <= AIM_TOLERANCE
  if target and aligned then
    start_firing(a, s)
    if s.fire_sound <= 0 then
      s.fire_sound = 35
      a:sound("sounds/sentryfireloop.wav")
    end
    if s.cooldown <= 0 then
      fire(a, s)
      s.cooldown = SHOT_FRAMES
    end
  else
    stop_firing(a, s)
  end
end

local function sync(a, s)
  local pose = s.firing and (1 + ((s.anim // 3) % 2)) or 0
  local step = step_index(s.angle, STEPS)
  if pose ~= s.pose then
    a:look(turret_sheet(s.team, pose))
    s.pose = pose
    s.at = nil
  end
  if step ~= s.at then
    a:frame(step)
    s.at = step
  end
end

local function brain(a, ev)
  local s = state[a.id]
  if not s then
    return
  end
  ev = ev or {}
  if (ev.damage or 0) > 0 then
    s.health = s.health - ev.damage
    if s.health <= 0 then
      state[a.id] = nil
      a:despawn()
      return
    end
  end
  s.frames = s.frames + 1
  if s.firing then s.anim = s.anim + 1 end

  if not s.planted then
    a:gravity()
    local hit = a:move({ terrain = true, worms = false })

    if hit.land then
      a.vx, a.vy = 0, 0
      s.planted = true
      s.px, s.py = a.x, a.y + SINK_PX * PX
      s.arm = ARM_FRAMES
      a:sound("sounds/sentryplace.wav")
      sync(a, s)
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

  sync(a, s)
end

wa.weapons.replace({
  weapon = "dynamite",
  copy_from = "mine",
  name = "Sentry Gun",
  is_weapon = true,
  worm_sprites = {
    weaponlnk = "sprites/equip", weaponlnku = "sprites/equipu", weaponlnkd = "sprites/equipd",
    wthrow = "sprites/unequip", wthrowu = "sprites/unequipu", wthrowd = "sprites/unequipd",
  },
  params = {
    sprite_columns = 1,
  },
  sprites = SPRITES,
  sounds = {
    "sounds/sentryplace.wav", "sounds/sentrybeeps2.wav",
    "sounds/sentryfireloop.wav", "sounds/sentryfireend.wav",
  },
  on_fire = function(fire_ev)
    local worm = fire_ev.worm
    local team = (worm and worm.team) or 1
    if team < 1 or team > 6 then
      team = 1
    end
    local facing = worm.facing
    local idle = facing < 0 and 270 or 90

    local body = wa.actors.spawn({
      sprite = turret_sheet(team, 0),
      x = worm.x,
      y = worm.y,
      vx = (worm.vx // 2) + facing * 19661,
      vy = (worm.vy // 2) - 9830,
      loop = false,
      origin = "bottom",
      owner = worm,
      kind = "sentry",
      persist = true,
      on = brain,
    })

    state[body.id] = {
      team = team,
      alliance = worm.alliance,
      owner_id = worm.id,
      planted = false,
      ammo = AMMO,
      health = 50,
      angle = idle,
      idle = idle,
      frames = 0,
      shots = 0,
      firing = false,
      anim = 0,
      fire_sound = 0,
      beep = 0,
      arm = 0,
      cooldown = 0,
      had_target = false,
      seen = {},
    }
    sync(body, state[body.id])
  end,
})

wa.on.worm_message(function(worm, msg)
  if msg ~= wa.msg.START_TURN then
    return
  end
  for _, s in pairs(state) do
    if s.owner_id == worm.id then
      s.ammo = AMMO
    end
  end
end, { msgs = { wa.msg.START_TURN } })
`
      }
    ],
  },
  {
    id: 'example.wormtoss',
    name: 'Worm Toss',
    version: '0.1.0',
    author: 'wkLua',
    category: 'weapons',
    replacesSlot: 'battle_axe',
    description: 'Engine example pack: worm_toss. Embedded verbatim from WormForge-main-source/mods/examples/worm_toss.',
    tags: ['example', 'weapons'],
    files: [
      {
        path: 'weapons.lua',
        name: 'weapons.lua',
        language: 'lua',
        content: `-- Worm Toss: WA land-cursor MODE + wa.cursor actor + click eaten at source.
--
-- on_select.cursor = true -> WA enters land-cursor mode: the mouse moves the
--                   world cursor (World+0x7380/84), NOT the camera. Camera
--                   scrolls only at the screen edge. Any map point reachable.
-- eat_fire = true -> Rust eats the lockstep click (TeamEntity msg 0x32) for
--                   this slot: no X marker, no launch anim, no turn end, and
--                   the cursor keeps moving. WA's own cursor draw is skipped.
-- wa.cursor.spawn -> the only cursor on screen: a Lua actor wearing the stock
--                   team-colour cursor (what Teleport shows), snapped to
--                   wa.world.pointer() natively every frame before \`on\` runs.
--                   Grab/drag/throw use the actor position.

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
  if not held then
    return
  end
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
  if held then
    return true
  end
  local w = nearest_target(x, y)
  if not w then
    return false
  end
  held = w
  origin = { px = x, py = y, wx = w.x, wy = w.y }
  hist = {}
  wa.log(string.format("worm_toss grab id=%s", tostring(w.id)))
  return true
end

-- a.x / a.y are already on the pointer (cursor actor); only the button is read.
local function tick(a)
  local down = wa.world.pointer().down

  if held then
    hist[#hist + 1] = { x = a.x, y = a.y }
    if #hist > 4 then
      table.remove(hist, 1)
    end
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
    -- Land-cursor MODE: mouse moves the world cursor, not the camera.
    cursor = true,
    on = function(sel)
      owner_id = sel.worm.id
      if live then
        return
      end
      -- WA parked the land cursor on the worm at select; sel.x/y is that.
      live = wa.cursor.spawn({
        owner = sel.worm,
        x = sel.x,
        y = sel.y,
        on = tick,
      })
      wa.log(string.format("worm_toss cursor actor at %#x,%#x", sel.x, sel.y))
    end,
  },
  -- Lockstep click (eaten in Rust). Grab if free, throw if holding.
  on_click = function(click)
    if held then
      release()
    else
      try_grab(click.x, click.y)
    end
  end,
})
`
      }
    ],
  },
  {
    id: 'example.pooz',
    name: 'Pooz',
    version: '0.1.0',
    author: 'wkLua',
    category: 'weapons',
    replacesSlot: 'shotgun',
    description: 'Engine example pack: pooz. Embedded verbatim from WormForge-main-source/mods/examples/pooz.',
    tags: ['example', 'weapons'],
    files: [
      {
        path: 'weapons.lua',
        name: 'weapons.lua',
        language: 'lua',
        content: `-- Shotgun is only the panel slot. Selecting it turns the owner into the POOZ
-- runner (Lua actor). A/D move, W jumps (again in air for the flip), Shift sprints.
-- Switch weapon to drop out.

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

local function abs(v)
  if v < 0 then
    return -v
  end
  return v
end

local function sign(v)
  if v > 0 then
    return 1
  end
  if v < 0 then
    return -1
  end
  return 0
end

local function approach(v, target, rate)
  if v < target then
    v = v + rate
    if v > target then
      return target
    end
    return v
  end
  v = v - rate
  if v < target then
    return target
  end
  return v
end

local function friction(v, amount)
  if abs(v) <= amount then
    return 0
  end
  return v - sign(v) * amount
end

local function blocked(x, y)
  local l = x - HW
  local r = x + HW - PX
  local mid = y - BOX_H // 2
  local top = y - BOX_H
  return wa.land.solid(l, y)
    or wa.land.solid(r, y)
    or wa.land.solid(x, y)
    or wa.land.solid(l, mid)
    or wa.land.solid(r, mid)
    or wa.land.solid(l, top)
    or wa.land.solid(r, top)
    or wa.land.solid(x, top)
end

local function on_floor(x, y)
  local l = x - 2 * PX
  local r = x + 2 * PX
  return wa.land.solid(x, y + PX)
    or wa.land.solid(l, y + PX)
    or wa.land.solid(r, y + PX)
end

local function unstick(x, y)
  if not blocked(x, y) then
    return x, y
  end
  for up = 1, SLOPE do
    if not blocked(x, y - up * PX) then
      return x, y - up * PX
    end
  end
  return x, y
end

-- Glue to dirt within SLOPE pixels so gentle grades do not pop into air.
local function snap_floor(x, y)
  if blocked(x, y) then
    return x, y, false
  end
  for d = 0, SLOPE do
    local ny = y + d * PX
    if d > 0 and blocked(x, ny) then
      return x, ny - PX, true
    end
    if on_floor(x, ny) then
      return x, ny, true
    end
  end
  return x, y, false
end

-- PNG strips are 15fps. Ground clips step every other tick so Walk/Run/Land
-- actually read. FrontFlip stays at 15fps (matches POOZ ~3 ticks/frame).
local function set_clip(a, st, name)
  if st.anim ~= name then
    st.anim = name
    st.clock = 0
    a:look("sprites/" .. name)
    if name == "FrontFlip" then
      for _ = 1, 13 do
        a:advance()
      end
    end
    return
  end
  st.clock = st.clock + 1
  local slow = name == "Idle"
    or name == "Walk"
    or name == "Run"
    or name == "Sprint"
    or name == "Land"
  if slow and st.clock % 2 ~= 0 then
    return
  end
  a:advance()
end

local function restore(worm, a)
  live[worm.id] = nil
  if a then
    worm.x = a.x
    worm.y = a.y
  end
  worm.visible = true
  worm:drop()
end

local function brain(worm)
  local st = {
    anim = "Idle",
    clock = 0,
    jumps = 2,
    coyote = 0,
    jump_buf = 0,
    prev_jump = false,
    flipping = false,
    flip_clock = 0,
    land = 0,
    gait = 0,
    grounded = true,
  }
  return function(a)
    if worm.weapon ~= "shotgun" or a:in_water() then
      restore(worm, a)
      a:despawn()
      return
    end

    local k = wa.world.keys()
    if k.jump and not st.prev_jump then
      st.jump_buf = JUMP_BUF
    elseif st.jump_buf > 0 then
      st.jump_buf = st.jump_buf - 1
    end
    st.prev_jump = k.jump

    local left = k.left and not k.right
    local right = k.right and not k.left
    local vx = a.vx
    local vy = a.vy
    local x = a.x
    local y = a.y

    if st.grounded and vy >= 0 then
      st.coyote = COYOTE
      st.jumps = 2
      st.flipping = false
    elseif st.coyote > 0 then
      st.coyote = st.coyote - 1
    end

    if st.jump_buf > 0 and st.jumps > 0 then
      if st.jumps >= 2 then
        vy = JUMP
        st.grounded = false
        st.coyote = 0
        st.jump_buf = 0
        st.jumps = st.jumps - 1
        st.land = 0
        st.flipping = false
        set_clip(a, st, "JumpRise")
      elseif not st.grounded then
        vy = JUMP2
        st.grounded = false
        st.coyote = 0
        st.jump_buf = 0
        st.jumps = st.jumps - 1
        st.land = 0
        st.flipping = true
        st.flip_clock = 0
        set_clip(a, st, "FrontFlip")
      end
    end

    if left or right then
      local dir = right and 1 or -1
      a.facing = dir
      if st.grounded then
        local cap = k.sprint and SPRINT or RUN
        if vx == 0 or sign(vx) == dir then
          if abs(vx) < cap then
            vx = approach(vx, dir * cap, ACCEL)
          else
            vx = friction(vx, 1966)
          end
        else
          vx = friction(vx, SKID)
        end
      else
        local cap = RUN
        if abs(vx) > cap then
          cap = abs(vx)
        end
        local nxt = vx + dir * AIR
        if abs(nxt) <= cap or sign(nxt) ~= sign(vx) then
          vx = nxt
        end
      end
    elseif st.grounded then
      vx = friction(vx, FRICTION)
    end

    local was = st.grounded
    local fall = vy
    x, y = unstick(x, y)
    local glued = st.grounded or st.coyote > 0
    if glued and vy >= 0 then
      local ok
      x, y, ok = snap_floor(x, y)
      if ok then
        vy = 0
        st.grounded = true
      end
    end
    if st.grounded and vy >= 0 and on_floor(x, y) then
      vy = 0
    else
      vy = vy + GRAV
      if vy > MAX_FALL then
        vy = MAX_FALL
      end
    end

    st.grounded = false
    local dist = abs(vx)
    local steps = dist // PX
    if steps < 1 then
      steps = 1
    end
    local sx = vx // steps
    for _ = 1, steps do
      local nx = x + sx
      if not blocked(nx, y) then
        x = nx
      else
        local stepped = false
        for up = 1, SLOPE do
          if not blocked(nx, y - up * PX) then
            x = nx
            y = y - up * PX
            stepped = true
            break
          end
        end
        if not stepped then
          vx = 0
          break
        end
      end
    end

    if vy >= 0 and (was or st.coyote > 0) then
      local ok
      x, y, ok = snap_floor(x, y)
      if ok then
        vy = 0
        st.grounded = true
      end
    end

    if not st.grounded then
      dist = abs(vy)
      steps = dist // PX
      if steps < 1 then
        steps = 1
      end
      local sy = vy // steps
      for _ = 1, steps do
        local ny = y + sy
        if not blocked(x, ny) then
          y = ny
        elseif sy > 0 then
          vy = 0
          st.grounded = true
          break
        else
          vy = 0
          break
        end
      end
      if not st.grounded and vy >= 0 then
        local ok
        x, y, ok = snap_floor(x, y)
        if ok then
          vy = 0
          st.grounded = true
        else
          st.grounded = on_floor(x, y)
        end
      end
    end

    if st.grounded and not was and fall > LAND_VY then
      st.land = 16
    end
    if st.land > 0 then
      st.land = st.land - 1
    end

    a.x = x
    a.y = y
    a.vx = vx
    a.vy = vy
    worm:carry(x, y)

    local moving = abs(vx) > 22938
    if not st.grounded then
      st.gait = 0
      if st.flipping or st.anim == "FrontFlip" then
        set_clip(a, st, "FrontFlip")
        st.flip_clock = st.flip_clock + 1
        if vy > 0 and st.flip_clock >= 24 then
          st.flipping = false
          set_clip(a, st, "JumpFall")
        end
      elseif vy < -52429 then
        set_clip(a, st, "JumpRise")
      elseif vy > 52429 then
        set_clip(a, st, "JumpFall")
      else
        set_clip(a, st, "JumpMid")
      end
    elseif st.land > 0 then
      st.gait = 0
      set_clip(a, st, "Land")
    elseif moving then
      local spd = abs(vx)
      if k.sprint then
        st.gait = 32
        if spd > SPRINT - 22938 then
          set_clip(a, st, "Sprint")
        else
          set_clip(a, st, "Run")
        end
      else
        st.gait = st.gait + 1
        if st.gait < 40 then
          set_clip(a, st, "Walk")
        else
          set_clip(a, st, "Run")
        end
      end
    else
      st.gait = 0
      set_clip(a, st, "Idle")
    end
  end
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
    if live[worm.id] then
      return
    end
    live[worm.id] = true
    worm.visible = false
    worm:carry(worm.x, worm.y)
    wa.actors.spawn({
      sprite = "sprites/Idle",
      origin = "bottom",
      x = worm.x,
      y = worm.y,
      vx = 0,
      vy = 0,
      gravity = false,
      collide = false,
      loop = false,
      owner = worm,
      on = brain(worm),
    })
  end,
})
`
      }
    ],
  },
  {
    id: 'example.killtheking',
    name: 'Kill The King',
    version: '1.0.0',
    author: 'WormForge Porting Engine',
    category: 'gameplay',
    description: 'Engine example pack: KillTheKing. Embedded verbatim from WormForge-main-source/mods/examples/KillTheKing.',
    tags: ['example', 'gameplay'],
    files: [
      {
        path: 'init.lua',
        name: 'init.lua',
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
`
      }
    ],
  },
  {
    id: 'example.wormstatelogger',
    name: 'Worm State Logger',
    version: '0.2.0',
    author: 'WormForge',
    category: 'utility',
    description: 'Prints worm:set_state transitions. Small and readable; a good first template for the state API.',
    tags: ['example', 'utility'],
    files: [
      {
        path: 'init.lua',
        name: 'init.lua',
        language: 'lua',
        content: `-- Show one live state line for the active worm, and log transitions to file.
--
-- A debugging pack: it only reads. \`worm.state_id\` is WA's raw state number
-- and \`worm.state_label\` its name from the engine's one state table
-- (crates/game/src/worm_state.rs, which lists the evidence for each and
-- marks a provisional name with \`?\`). Name a state there, not here.
local last = {}

local function describe(worm)
  local state = worm.state_id
  if state == nil then return nil end
  return string.format("W%d 0x%02X %s", worm.id, state, worm.state_label or "?")
end

wa.log("worm_state_logger: enabled (HUD and wkLua.log)")

wa.on.worm_message(function(worm, msg)
  local state = worm.state_id
  if state == nil then return end

  local id = worm.id
  if last[id] == state then return end
  last[id] = state

  wa.log(string.format("worm_state: worm=%d state=0x%02X name=%s msg=0x%02X",
    id, state, worm.state_label or "?", msg))
end)

wa.on.hud(function()
  local line = "Worm state: ?"
  for _, worm in ipairs(wa.worms.all()) do
    if worm.turn then
      line = "Worm state: " .. (describe(worm) or "?")
      break
    end
  end
  wa.hud.line(line, 14, 10)
end)
`
      }
    ],
  },
  {
    id: 'example.utilities',
    name: 'Utilities',
    version: '0.1.0',
    author: 'wkLua',
    category: 'utility',
    description: 'Engine example pack: utilities. Embedded verbatim from WormForge-main-source/mods/examples/utilities.',
    tags: ['example', 'utility'],
    files: [
      {
        path: 'features/utilities.lua',
        name: 'features/utilities.lua',
        language: 'lua',
        content: `-- The utilities feature: match settings the lobby scheme doesn't have. Every
-- setting is an option of this one component, read once at install.
return function(ctx)
  local gravity_pct = ctx.option("gravity_pct")
  local wind = ctx.option("wind")
  local heal = ctx.option("heal_per_turn")
  local infinite = {}
  for _, weapon in ipairs({ "jet_pack", "parachute", "ninja_rope" }) do
    if ctx.option("infinite_" .. weapon) then
      infinite[#infinite + 1] = weapon
    end
  end

  -- The scheme's gravity, read at the first turn: scaling it again each turn
  -- would compound.
  local scheme_gravity
  -- WA sends a turn's start before it rolls that turn's wind (0x55C0CB, then
  -- 0x55C16C), so wind set at turn_start would be rolled over. It is set at
  -- the next frame instead, after WA's roll.
  local wind_due = false

  wa.on.turn_start(function(ev)
    if gravity_pct ~= 100 then
      scheme_gravity = scheme_gravity or wa.world.gravity()
      wa.world.set_gravity(scheme_gravity * gravity_pct // 100)
    end
    if heal > 0 then
      ev.worm:heal(heal)
    end
    for _, weapon in ipairs(infinite) do
      ev.worm:ammo(weapon, { set = -1 })
    end
    wind_due = wind ~= "scheme"
  end)

  if wind ~= "scheme" then
    wa.on.worm_message(function(_, msg)
      if wind_due and msg == wa.msg.FRAME_FINISH then
        wind_due = false
        wa.world.set_wind(wind == "none" and 0 or wa.world.wind() // 2)
      end
    end)
  end

  wa.log(("gravity %d%%, wind %s, heal %d, infinite %s"):format(
    gravity_pct, wind, heal, #infinite > 0 and table.concat(infinite, " ") or "none"))
end
`
      }
    ],
  },
  {
    id: 'example.gifdonkeylua',
    name: 'GIF Donkey (Lua)',
    version: '0.1.0',
    author: 'wkLua',
    category: 'weapons',
    replacesSlot: 'grenade',
    description: 'Engine example pack: gif_donkey_lua. Embedded verbatim from WormForge-main-source/mods/examples/gif_donkey_lua.',
    tags: ['example', 'weapons'],
    files: [
      {
        path: 'weapons.lua',
        name: 'weapons.lua',
        language: 'lua',
        content: `-- Verbose Lua path. Same weapon as gif_donkey, no status flags.
-- Click and tick are both Lua. Native only runs the verbs you call.
-- Disable Mods/gif_donkey if both are present (same grenade slot).
--
-- Land/explode use the GIF's bottom opaque row as the platform (stock donkey
-- collides on the horizontal rectangle in gfx.dir masks.bmp, not the sprite).
-- a:explode is stock CreateExplosion; bounce is that impulse. Do not zero vy.
-- a.vx = 0 is this weapon's policy: no sideways speed from radial blasts.

local function brain(a)
  a.vx = 0
  a:gravity()
  local hit = a:move({ terrain = true, worms = true })
  if hit.land then
    a:explode({ damage = 50, id = 100, at = "below" })
  end
  a.vx = 0
  a:advance()
  if a:in_water() then
    a:despawn()
  end
end

wa.weapons.replace({
  weapon = "grenade",
  name = "Growth Hormones",
  is_weapon = true,
  sprite = "sprites/200w.gif",

  on_select = {
    cursor = true,
  },

  on_click = function(click)
    wa.actors.spawn({
      sprite = "sprites/200w.gif",
      x = click.x,
      y = click.sky,
      origin = "bottom",
      owner = click.worm,
      on = brain,
    })
  end,
})
`
      }
    ],
  },
  {
    id: 'example.hellishgrenade',
    name: 'Hellish Grenade',
    version: '0.1.0',
    author: 'wkLua',
    category: 'weapons',
    replacesSlot: 'holy_grenade',
    description: 'Engine example pack: hellish_grenade. Embedded verbatim from WormForge-main-source/mods/examples/hellish_grenade.',
    tags: ['example', 'weapons'],
    files: [
      {
        path: 'weapons.lua',
        name: 'weapons.lua',
        language: 'lua',
        content: `-- Project X's Hellish Hand-Grenade, on the Holy Hand Grenade's slot.
--
-- How it fires: copy_from the stock Holy Hand Grenade, then named patch for
-- the PX hellish.wep diffs (web editor style). Against stock it has a weaker
-- blast (70 damage, 80 power, not 100/100), bursts into fire on detonation
-- as the Petrol Bomb does, and the rest -- fixed 3 s fuse, bounce, gravity,
-- spin -- stays the Holy Grenade's.
--
-- PX's script only draws it: the worm holds the horned grenade, and the
-- thrown grenade spins with it.
--
-- The art is PX's pre-baked set from weapon_hellish_hand_grenade, split from
-- its vertical strips into frame folders:
--   aim, aimu, aimd     the worm holding it, 32 aim angles, flat/up/down
--   draw, drawu, drawd  the worm taking it out, 10 frames, flat/up/down
--   grenade             the thrown grenade, 32 spin frames
-- The icon is PX's hhh_ico.png byte for byte, so replays share its asset.
wa.weapons.replace({
  weapon = "holy_grenade",
  copy_from = "holy_grenade",
  name = "Hellish Hand-Grenade",
  patch = {
    damage = 70,
    blast = 80,
    glow_sprite = 154,
    homing_sprite = 161,
    detonation = 2,
    cluster_count = 150,
    cluster_speed = 70,
    cluster_power = 1000,
    cluster_angle = 1,
  },
  panel_icon = "sprites/hhh_ico.png",
  sprite = "sprites/grenade",
  worm_sprites = {
    weaponlnk = "sprites/aim", weaponlnku = "sprites/aimu", weaponlnkd = "sprites/aimd",
    wthrow = "sprites/draw", wthrowu = "sprites/drawu", wthrowd = "sprites/drawd",
  },
})
`
      }
    ],
  },
  {
    id: 'example.mineemit',
    name: 'Mine Emit',
    version: '0.1.0',
    author: 'wkLua',
    category: 'weapons',
    replacesSlot: 'mine',
    description: 'Engine example pack: mine_emit. Embedded verbatim from WormForge-main-source/mods/examples/mine_emit.',
    tags: ['example', 'weapons'],
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
`
      }
    ],
  },
  {
    id: 'example.qbazooka',
    name: 'Q Bazooka',
    version: '0.1.0',
    author: 'wkLua',
    category: 'weapons',
    description: 'Engine example pack: q_bazooka. Embedded verbatim from WormForge-main-source/mods/examples/q_bazooka.',
    tags: ['example', 'weapons'],
    files: [
      {
        path: 'weapons.lua',
        name: 'weapons.lua',
        language: 'lua',
        content: `-- Q stock-selects bazooka. Space hold = power bar, release = shoot (native StartFiring / ReleaseWeapon).

local prev_q = {}

wa.on.worm_message(function(worm, msg)
  if msg ~= wa.msg.FRAME_FINISH then
    return
  end
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
end, { msgs = { wa.msg.FRAME_FINISH } })
`
      }
    ],
  },
  {
    id: 'example.superdrill',
    name: 'Super Drill',
    version: '0.1.0',
    author: 'wkLua',
    category: 'weapons',
    replacesSlot: 'pneumatic_drill',
    description: 'Engine example pack: super_drill. Embedded verbatim from WormForge-main-source/mods/examples/super_drill.',
    tags: ['example', 'weapons'],
    files: [
      {
        path: 'weapons.lua',
        name: 'weapons.lua',
        language: 'lua',
        content: `-- PX Super Drill keeps WA's normal drilling state and adds a second cut at
-- the worm's position each frame. See PX weapon_super_drill.pxl.

local watching = {}
local START_GRACE = 4

local function follow_stock_drill(worm, id)
  local started = false
  local waiting = 0
  return function(a)
    if worm.drilling then
      started = true
      wa.land.cut({ x = worm.x, y = worm.y, shape = "drill" })
      return
    end
    if not started and waiting < START_GRACE then
      waiting = waiting + 1
      return
    end
    watching[id] = nil
    a:despawn()
  end
end

wa.weapons.replace({
  weapon = "pneumatic_drill",
  name = "Super Drill",
  copy_from = "pneumatic_drill",
  is_weapon = true,
})

wa.on.worm_message(function(worm, msg)
  if msg ~= wa.msg.FIRE_WEAPON or worm.weapon ~= "pneumatic_drill" then
    return
  end
  -- Stock fire still owns ammo, movement, sound, animation and random cuts.
  if worm:ammo("pneumatic_drill") == 0 or watching[worm.id] then
    return
  end
  local id = worm.id
  watching[id] = wa.actors.spawn({
    sprite = false,
    x = worm.x,
    y = worm.y,
    gravity = false,
    collide = false,
    owner = worm,
    on = follow_stock_drill(worm, id),
  })
  -- Do not eat FIRE_WEAPON: WA must enter its normal drilling state.
end, { msgs = { wa.msg.FIRE_WEAPON } })
`
      }
    ],
  },
  {
    id: 'example.randomsprites',
    name: 'Random Sprites',
    version: '0.1.4',
    author: 'wkLua',
    category: 'visual',
    description: 'Engine example pack: random_sprites. Embedded verbatim from WormForge-main-source/mods/examples/random_sprites.',
    tags: ['example', 'visual'],
    files: [
      {
        path: 'weapons.lua',
        name: 'weapons.lua',
        language: 'lua',
        content: `-- Chaos skin: retarget stock body / cluster sprites across claimed slots.
-- No worm_sprites / aim poses. Multi-sheet leftovers stay stock on purpose.
--
-- Shuffle runs on the first worm_message (same window Highlander deals), via
-- wa.random on the live match RNG — not at InitGraphic.
--
-- Flight rewrite only touches banks that already had a sprite (plus primary
-- render/weapon). Empty sheep/HM mode-switch banks stay 0 so behaviour is
-- unchanged; only the look changes.

local POOL = {
  "missile", "mortar", "grenade", "banana", "hgrenade", "cluster", "clustlet",
  "petrolbm", "mbbomb", "arrow", "bullet", "dynamite", "mineon", "mineoff",
  "sheepwlk", "sheepfal", "sheepbrn", "sheeplau", "spsheep1", "spsheep2",
  "aquashp1", "aquashp2", "cowwalk", "cowjump", "skunk1", "skunk2", "sally",
  "donkey", "pigeonr0", "hmissil1", "hmissil2", "molewalk", "moledig1",
  "drill", "fireball", "phone", "cdrom", "tamborin", "meteor", "carpet1",
  "airmisl", "letter1", "oildrum", "targets", "donor",
}

local CLUSTER = {
  cluster_bomb = true,
  banana_bomb = true,
  super_banana = true,
  ming_vase = true,
  mortar = true,
}

local WEAPONS = {
  "bazooka", "homing_missile", "mortar", "homing_pigeon", "sheep_launcher",
  "grenade", "cluster_bomb", "banana_bomb", "dynamite", "mine", "sheep",
  "super_sheep", "aqua_sheep", "mole_bomb", "holy_grenade", "petrol_bomb",
  "mb_bomb", "skunk", "ming_vase", "mad_cow", "old_woman", "donkey",
  "super_banana", "salvation_army", "magic_bullet", "longbow",
}

for _, weapon in ipairs(WEAPONS) do
  wa.weapons.replace({ weapon = weapon })
end

local function pick()
  return POOL[wa.random(1, #POOL)]
end

local shuffled = false
local function reshuffle()
  if shuffled then
    return
  end
  shuffled = true
  for _, weapon in ipairs(WEAPONS) do
    local body = pick()
    local spec = { weapon = weapon, sprite = body }
    if CLUSTER[weapon] then
      spec.cluster = pick()
    end
    wa.weapons.retarget(spec)
    local bit = spec.cluster and (" cluster=" .. spec.cluster) or ""
    wa.log(string.format("random_sprites %s -> %s%s", weapon, body, bit))
  end
  wa.log(string.format("random_sprites reshuffled %d slots via wa.random", #WEAPONS))
end

wa.on.worm_message(function()
  reshuffle()
end)
`
      }
    ],
  },
  {
    id: 'example.panelicon',
    name: 'Panel Icon',
    version: '0.1.0',
    author: 'wkLua',
    category: 'hud',
    replacesSlot: 'holy_grenade',
    description: 'Engine example pack: panel_icon. Embedded verbatim from WormForge-main-source/mods/examples/panel_icon.',
    tags: ['example', 'hud'],
    files: [
      {
        path: 'weapons.lua',
        name: 'weapons.lua',
        language: 'lua',
        content: `-- A custom icon in the stock weapon panel.
--
-- \`panel_icon\` takes a pack PNG. A full 32x32 icon image -- every Project X
-- weapon icon is one -- is used as is: the panel shows its 24x24 centre, as it
-- does for WA's own icons. A smaller PNG is centred in that window instead.
-- Colours are matched to the ones WA's own icons use, and the greyed-out
-- frame is derived the way theirs is, so it looks native in both states.
--
-- This icon is PX's Hellish Hand Grenade, copied byte for byte, so replays
-- refer to it in the .WFAssets collection instead of embedding it.
wa.weapons.replace({
  weapon = "holy_grenade",
  name = "Hellish Hand Grenade",
  panel_icon = "sprites/hhh_ico.png",
})
`
      }
    ],
  },
  {
    id: 'example.hurtlab',
    name: 'Hurt Lab',
    version: '0.1.0',
    author: 'wkLua',
    category: 'weapons',
    replacesSlot: 'fire_punch',
    description: 'Engine example pack: hurt_lab. Embedded verbatim from WormForge-main-source/mods/examples/hurt_lab.',
    tags: ['example', 'weapons'],
    files: [
      {
        path: 'weapons.lua',
        name: 'weapons.lua',
        language: 'lua',
        content: `-- Fire punch is only the panel slot. Space is lockstep FIRE_WEAPON.
-- "Eat" stops the firepunch stock attack and animation to happen to be able to make your custom firepath timing.
-- First Eat stops the firepunch attack from happening even when you have 0 firepunch ammo, this is because you could still use this weapon with 0 firepunch in scheme and we want it to still work.

local line = "ten  Space = 10 hp each enemy"

wa.weapons.replace({
  weapon = "fire_punch",
  name = "Ten",
  is_weapon = true,
})

wa.on.worm_message(function(worm, msg)
  if msg ~= wa.msg.FIRE_WEAPON then
    return
  end
  if worm.weapon ~= "fire_punch" then
    return
  end
  local ammo = worm:ammo("fire_punch")
  if ammo == 0 then
    return "eat"
  end
  if ammo > 0 then
    worm:ammo("fire_punch", -1)
  end
  for _, w in ipairs(wa.worms.all()) do
    if w.alliance ~= worm.alliance and w.hp > 0 then
      w:hurt(10)
    end
  end
  return "eat"
end, { msgs = { wa.msg.FIRE_WEAPON } })

wa.on.hurt(function(hit)
  if hit.phase ~= "post" or hit.lost < 1 then
    return
  end
  line = hit.kind .. " -" .. tostring(hit.lost) .. " hp"
  wa.log(line)
end)

wa.on.hud(function()
  wa.hud.line(line)
end)
`
      }
    ],
  },
  {
    id: 'example.gravlerstrike',
    name: 'Gravler Strike',
    version: '0.1.0',
    author: 'wkLua',
    category: 'weapons',
    replacesSlot: 'donkey',
    description: 'Engine example pack: gravler_strike. Embedded verbatim from WormForge-main-source/mods/examples/gravler_strike.',
    tags: ['example', 'weapons'],
    files: [
      {
        path: 'weapons.lua',
        name: 'weapons.lua',
        language: 'lua',
        content: `-- PX's script replaces these four stock mole digging sprites. WA still owns
-- the mole strike's movement, terrain cuts, sounds, damage and stop conditions.
-- PX's Gravler has no underwater art, so a gravler that dives into water sinks
-- as its dive frame under PX's sinking tint (no \`mole\` key needed here).
wa.weapons.replace({
  weapon = "donkey",
  name = "Gravler Strike",
  copy_from = "mole_squadron",
  panel_icon = "mole_squadron",
  mole_dig_rotation = {
    moledive = "sprites/gravlerdive.png",
    moledig1 = "sprites/gravlerdiga.png",
    moledig2 = "sprites/gravlerdigb.png",
    moledig3 = "sprites/gravlerdigc.png",
  },
  is_weapon = true,
})
`
      }
    ],
  },
];
