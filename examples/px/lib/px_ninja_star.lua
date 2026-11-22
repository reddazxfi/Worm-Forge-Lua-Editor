-- Ninja Star: Project X's thrown star, on WormForge.

local function placed(ctx)
  local informed = false
  if type(ctx.weapons) == "table" then
    informed = true
    if ctx.weapons[ctx.id] ~= nil then return true end
  end
  if type(ctx.placed) == "table" then
    informed = true
    for _, weapon in ipairs(ctx.placed) do
      if weapon == ctx.id or (type(weapon) == "table" and weapon.id == ctx.id) then return true end
    end
  end
  return not informed
end

local function trunc(n) return n < 0 and math.ceil(n) or math.floor(n) end

local on_missile = require("lib/on_missile")
local trail = require("lib/px_trail")

local function orientation(vx, vy)
  if vx == 0 then return vy > 0 and 16 or 0 end
  if vy == 0 then return vx > 0 and 8 or 24 end
  if vx > 0 and vy < 0 then return math.min(trunc(3 * vx / -vy), 7) end
  if vx > 0 then return math.min(trunc(8 + 3 * vy / vx), 15) end
  if vy > 0 then return math.min(trunc(16 + 3 * -vx / vy), 23) end
  return math.min(trunc(24 + 3 * -vy / -vx), 31)
end

local M = {}

function M.install(ctx)
  if not placed(ctx) then
    wa.log("Ninja Star: in no panel slot; nothing registered")
    return
  end

  local ART = "sprites/ninja_star/"
  local SND = "sounds/ninja_star/"

  trail.install()

  local DAMAGE    = 10 -- NinjaSDamage
  local HIT_R     = 20 -- the strict 20 px square around the impact
  local SELF_R    = 25 -- and the 25 px square for the worm whose turn it is
  local BURIED    = { soften = 3, blend = "mix" } -- as the Javelin's, tuned by eye there

  local TRAIL = { max = 7, every = 1, core_w = 4.0, glow_w = 7.0, r = 120, g = 120, b = 120 }

  local function current_worm()
    for _, w in ipairs(wa.worms.all()) do
      if w.turn then return w end
    end
  end

  local speed = {}
  on_missile(function(m)
    if m.weapon ~= "px.ninja_star" then return end
    speed[m.id] = { m.vx, m.vy }
    if m.phase == "pre" and not trail.has(m.id) then
      trail.add(m.id, current_worm(), TRAIL)
    end
  end, { weapons = { "px.ninja_star" } })

  local sb = require("lib/px_sprite_builder")
  sb.flight(ctx, {
    weapon = "px.ninja_star",
    sheet = ART .. "stamp.png",
    anim = "none",
    frame_fn = function(m) return orientation(m.vx, m.vy) end,
    z = wa.depth.OBJECTS - 1, -- as the helicopter's bullet, behind objects
    mirror = false,
  })

  local hold = {
    sheet = ART .. "hold.png",
    hand = sb.PX_HANDS[2], -- hand_type 2: the middle hand
    hand_radius = 17.0,
    hand_rotation = 1.0,
    hand_radial_rotation = 1.0,
    hand_scale = 1.0,
    weap_rotation = 1.0,
    weap_radius = 11.0,
    weap_radial_rotation = 1.0,
    frames = 1, -- one star, turned by the engine's hold to the aim
    thrown = true,
    keep_while_firing = false,
  }

  local function within(o, x, y, r)
    return o and math.abs(x - o.x) < r and math.abs(y - o.y) < r
  end

  local spec = {
    wep = "weps/ninja_star_wep.wep",
    panel_icon = ART .. "icon.png", -- PX's icon
    sprites = { ART .. "stamp.png", ART .. "hold.png", trail.BEAM, trail.GLOW },
    params = { gpu_prefix = "sprites/" },
    worm_sprites = sb.PX_POSTURE,
    hold = hold,
    sounds = { SND .. "ninjasimpact.wav" },
    on_explode = function(ev)
      local v = speed[ev.missile]
      if ev.missile then
        speed[ev.missile] = nil
        trail.drop(ev.missile)
      end
      local vx, vy = v and v[1] or 0, v and v[2] or 0
      local target
      for _, o in ipairs(wa.world.electrical_nearby(ev.x, ev.y, 29, false)) do
        if (o.kind == "worm" or o.kind == "mine" or o.kind == "crate" or o.kind == "oil")
          and within(o, ev.x, ev.y, HIT_R) then target = o break end
      end
      if not target then
        local active = current_worm()
        if within(active, ev.x, ev.y, SELF_R) then target = active end
      end
      if target then
        target.vx, target.vy = trunc(vx / 4), trunc(vy / 4)
        if target.kind == "worm" then target:hit(DAMAGE)
        else target:hit(DAMAGE, trunc(vx / 2), trunc(vy / 2), "bullet") end
        return
      end
      wa.land.stamp{ sprite = ART .. "stamp.png", frame = orientation(vx, vy),
        x = ev.x, y = ev.y, buried = BURIED }
      local shooter = current_worm()
      if shooter then wa.sound.play(shooter, SND .. "ninjasimpact.wav") end
    end,
  }
  spec.handling = { ends_turn = true }
  wa.weapons.replace(spec)
end

return M
