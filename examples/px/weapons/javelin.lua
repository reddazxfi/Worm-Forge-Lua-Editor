-- Javelin: pierces the first worm or object it hits, or sticks in the land as terrain.

local on_missile = require("lib/on_missile")
local weapon = {}

weapon.record = {
  handling = {
    remember_selection = true,
    ends_turn = true,
  },
}

weapon.missile_sprite = {
    sheet = "sprites/javelin/flight.png", hide = true,
    animate = true, anim_speed = 1.90, frames = 12,
  }

function weapon.definition()
  local shared = require("lib/shared")
  local fires = shared.fires
  local sdk = require("wf-lib/holds")
  local PX_POSTURE = sdk.PX_POSTURE
  return require("lib/weapon").merge(weapon.record, {
    wep = "weps/prod.wep",
    panel_icon = "sprites/javelin/icon.png",
    missile = { sprite = 0 }, -- WA draws no round; the art spec draws it
    worm_sprites = PX_POSTURE,
    sprites = { "sprites/javelin/hold.png", "sprites/javelin/flight.png", "sprites/javelin/stamp.png" },
    sounds = { "sounds/javelin_impact.wav" },
    params = { gpu_prefix = "sprites/javelin/" },
    on_fire = function(ev) fires.javelin_launch(ev) end,
    on_explode = function(ev) fires.javelin(ev) end,
    hold = {
        thrown = true,
        sheet = "sprites/javelin/hold.png", draw_hand = false,
        hand_radius = 0, hand_rotation = 0, hand_radial_rotation = 0,
        weap_radial_rotation = 0, weap_rotation = 1, weap_radius = -11.8,
        animate = true, anim_speed = 1.25, frames = 12,
      },
  })
end

function weapon.setup()
  local shared = require("lib/shared")
  local current_worm = shared.current_worm
  local fires = shared.fires
  local turrets = require("lib/turret")
  local stuck_stamp = require("lib/stuck_stamp")

  do
    local speed = {}
    local launching
    fires.javelin_launch = function(ev)
      local flight = { ev.vx, ev.vy, shooter = ev.worm.id }
      local previous = launching
      launching = flight
      local ok, id = pcall(wa.weapons.launch, {
        weapon = "px.javelin", owner = ev.worm,
        x = ev.x, y = ev.y, vx = ev.vx, vy = ev.vy,
      })
      launching = previous
      if not ok then error(id) end
      if id and not flight.exploded then speed[id] = flight end
    end
    on_missile(function(m)
      if m.weapon == "px.javelin" then
        local flight = speed[m.id]
        if not flight then
          local shooter = current_worm()
          flight = { shooter = shooter and shooter.id }
          speed[m.id] = flight
        end
        flight[1], flight[2], flight.id = m.vx, m.vy, m.id
      end
    end, { weapons = { "px.javelin" } })

    local JAVELIN_BURIED = { soften = 3, blend = "mix" }

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

    local SPEAR = { half_length = 20, half_width = 4 }
    local CRATE_REACH = 24
    fires.javelin = function(ev)
      local v = (ev.missile and speed[ev.missile]) or launching
      if ev.missile then speed[ev.missile] = nil end
      if v then v.exploded = true end
      local vx, vy = v and v[1] or 0, v and v[2] or 0
      local active = current_worm()
      local shooter_id = v and v.shooter or (active and active.id)
      local target
      for _, o in ipairs(wa.world.electrical_nearby(ev.x, ev.y, 29, false)) do
        if (o.kind == "worm" or o.kind == "mine" or o.kind == "crate" or o.kind == "oil")
          and (o.kind ~= "worm" or o.id ~= shooter_id)
          and within(o, ev.x, ev.y, 20) then target = o; break end
      end
      if not target then
        for _, o in ipairs(wa.world.electrical_nearby(ev.x, ev.y, 29, false)) do
          if o.kind == "crate" and within(o, ev.x, ev.y, CRATE_REACH) then target = o; break end
        end
      end
      if not target then
        local sentry = turrets.projectile_target(ev.x, ev.y)
        if sentry and turrets.projectile_hit(sentry, 20, vx / 4, vy / 4, v and v.id) then return end
      end
      local frame = orientation(vx, vy)
      local sx, sy, deeper
      if not target then
        sx, sy, deeper = stuck_stamp.place(ev.x, ev.y, frame, SPEAR)
        if not sx then
          target = sy
          wa.log(string.format("Javelin: no stuck spear at (%.1f,%.1f) clears worm %d; it is hit",
            ev.x, ev.y, target.id))
        elseif deeper > 0 then
          wa.log(string.format("Javelin: stuck %dpx deeper at (%.1f,%.1f) to clear the worms", deeper, ev.x, ev.y))
        end
      end
      if target then
        target.vx, target.vy = vx / 4, vy / 4
        if target.kind == "worm" then target:hit(20)
        else target:hit(20, vx / 2, vy / 2, "bullet") end
        return
      end
      wa.land.stamp{
        sprite = "sprites/javelin/stamp.png", frame = frame, x = sx, y = sy,
        buried = JAVELIN_BURIED,
      }
      local shooter = current_worm()
      if shooter then wa.sound.play(shooter, "sounds/javelin_impact.wav") end
    end
  end
end

return weapon
