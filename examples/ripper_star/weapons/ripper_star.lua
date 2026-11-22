-- Ripper Star: Project X's Ripper, firing our ninja stars in a flurry.

local seq = require("lib/fire_seq")
local sb = require("lib/px_sprite_builder")
local trail = require("wf-lib/effects/trail")
local hold_art = require("lib/px_hold_art")

local M = {}

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

local function orientation(vx, vy)
  if vx == 0 then return vy > 0 and 16 or 0 end
  if vy == 0 then return vx > 0 and 8 or 24 end
  if vx > 0 and vy < 0 then return math.min(trunc(3 * vx / -vy), 7) end
  if vx > 0 then return math.min(trunc(8 + 3 * vy / vx), 15) end
  if vy > 0 then return math.min(trunc(16 + 3 * -vx / vy), 23) end
  return math.min(trunc(24 + 3 * -vy / -vx), 31)
end

local function within(o, x, y, r)
  return o and math.abs(x - o.x) < r and math.abs(y - o.y) < r
end

function M.install(ctx)
  if not placed(ctx) then
    wa.log("Ripper Star: in no panel slot; nothing registered")
    return
  end

  local ART = "sprites/ripper_star/"
  local SND = "sounds/ripper_star/"
  local DAMAGE = 4
  local HIT_R = 20 -- the strict 20 px square
  local SELF_R = 25 -- and the 25 px square for the turn's worm
  local SHOTS = 15 -- RSShotsFired<=14
  local SHOT_DELAY = 4
  local SPEED = 45 -- the constant in PX's velocity
  local LOW_AIM = 0.165 -- the low-angle extra offset
  local BURIED = { soften = 3, blend = "mix" } -- as the ninja star's

  trail.install()

  local TRAIL = { max = 7, every = 1, core_w = 4.0, glow_w = 7.0, r = 120, g = 120, b = 120 }

  local function current_worm()
    for _, w in ipairs(wa.worms.all()) do
      if w.turn then return w end
    end
  end

  local speed = {}
  wa.on.missile_frame(function(m)
    if m.weapon ~= "px.ripper_star" then return end
    speed[m.id] = { m.vx, m.vy }
    if m.phase == "pre" and not trail.has(m.id) then
      trail.add(m.id, current_worm(), TRAIL)
    end
  end)

  sb.flight(ctx, {
    weapon = "px.ripper_star",
    sheet = ART .. "stamp",
    anim = "none",
    frame_fn = function(m) return orientation(m.vx, m.vy) end,
    z = wa.depth.OBJECTS - 1,
    mirror = false,
  })

  local hold = {
    weapon = "px.ripper_star",
    sheet = ART .. "hold",
    size = 90,
    keep_while_firing = false,
    weap_rotation = 1.0,
    weap_radial_rotation = 1.0,
    weap_radius = 0.0,
  }

  local spec = {
    wep = "weps/ripper_star_wep.wep",
    panel_icon = ART .. "icon.png",
    sprites = { ART .. "stamp", ART .. "hold", trail.BEAM, trail.GLOW },
    params = { gpu_prefix = "sprites/" },
    worm_sprites = sb.PX_POSTURE,
    hold = hold,
    sounds = { SND .. "impact.wav" },

    on_fire = function(ev)
      local w = ev.worm
      local ox = math.abs(ev.x - w.x)
      local oy = ev.y - w.y
      local function angle(i, ww)
        local n = i - 1
        local base = ww.aim
        if n & 2 ~= 0 then return base - 0.010 end
        if n & 3 ~= 0 then return base + 0.010 end
        return base
      end
      seq.fire_seq_mis({
        weapon = "px.ripper_star",
        cancel_weapon = "px.ripper_star",
        standoff = 12,
        owner = w,
        count = SHOTS,
        delay = SHOT_DELAY,
        x = function(i, ww)
          local low = ww.aim < LOW_AIM and 2.0 or 0
          return ww.x + ww.facing * (ox + low)
        end,
        y = function(i, ww)
          return ww.y + oy - 3.4 - (ww.aim < LOW_AIM and 3.1 or 0)
        end,
        vx = function(i, ww)
          local d = 0.5 - angle(i, ww)
          return ww.facing * (0.5 - math.sqrt(d * d)) * SPEED
        end,
        vy = function(i, ww)
          return SPEED * (0.5 - angle(i, ww))
        end,
      })
    end,

    on_explode = function(ev)
      local v = speed[ev.missile]
      if ev.missile then speed[ev.missile] = nil; trail.drop(ev.missile) end
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
        if target.kind == "worm" then
          target:hit{ amount = DAMAGE, vx = trunc(vx / 4), vy = trunc(vy / 4) }
        else
          target:hit(DAMAGE, trunc(vx / 2), trunc(vy / 2), "bullet")
        end
        return
      end

      wa.land.stamp{ sprite = ART .. "stamp", frame = orientation(vx, vy),
        x = ev.x, y = ev.y, buried = BURIED }
      local shooter = current_worm()
      if shooter then wa.sound.play(shooter, SND .. "impact.wav") end
    end,
  }
  spec.handling = { ends_turn = true }
  hold_art.add(hold)
  wa.weapons.replace(spec)
end

return M
