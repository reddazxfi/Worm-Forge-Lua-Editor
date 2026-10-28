-- Javelin: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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
    sprite = "missile",
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

weapon.requires = { "weapons/helicopter" }

function weapon.setup()
  local shared = require("lib/shared")
  local current_worm = shared.current_worm
  local fires = shared.fires
  local trunc = shared.trunc
  local turrets = require("lib/turret")

  -- ---------------------------------------------------------------- Javelin

  do
    local speed = {}
    local launching
    fires.javelin_launch = function(ev)
      -- A point-blank missile can explode inside launch(), before either
      -- its returned ID or its first frame exists. Keep this shot's speed
      -- and thrower available throughout that synchronous impact callback.
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
    -- Pre keeps the incoming speed even when this frame's stock collision
    -- destroys the missile. Post keeps acceleration for the following frame.
    wa.on.missile_frame(function(m)
      if m.weapon == "px.javelin" then
        local flight = speed[m.id]
        if not flight then
          local shooter = current_worm()
          flight = { shooter = shooter and shooter.id }
          speed[m.id] = flight
        end
        flight[1], flight[2], flight.uid = m.vx, m.vy, m.uid
      end
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
      return o and math.abs(x - o.x) < r and math.abs(y - o.y) < r
    end
    fires.javelin = function(ev)
      local v = (ev.missile and speed[ev.missile]) or launching
      if ev.missile then speed[ev.missile] = nil end
      if v then v.exploded = true end
      local vx, vy = v and v[1] or 0, v and v[2] or 0
      local active = current_worm()
      local shooter_id = v and v.shooter or (active and active.id)
      local target
      -- Keep PX's strict impact square and traversal order, excluding the
      -- thrower even when another handle represents that same worm. Capture
      -- its identity in flight so a control/turn change cannot reassign it.
      for _, o in ipairs(wa.world.electrical_nearby(ev.x, ev.y, 29, false)) do
        if (o.kind == "worm" or o.kind == "mine" or o.kind == "crate" or o.kind == "oil")
          and (o.kind ~= "worm" or o.id ~= shooter_id)
          and within(o, ev.x, ev.y, 20) then target = o; break end
      end
      if not target then
        local sentry = turrets.projectile_target(ev.x, ev.y)
        if sentry and turrets.projectile_hit(sentry, 20, vx / 4, vy / 4, v and v.uid) then return end
      end
      if target then
        target.vx, target.vy = vx / 4, vy / 4
        if target.kind == "worm" then target:hurt(20)
        else target:hit(20, vx / 2, vy / 2, "projectile") end
        return
      end
      -- Centred on the impact, as PX's, so its front half lies in the land:
      -- that half fades into the earth (the engine's buried stamp) instead of
      -- being drawn over it, and the javelin looks stuck.
      wa.land.stamp{
        sprite = "sprites/javelin/stamp.png", frame = orientation(vx, vy), x = ev.x, y = ev.y,
        buried = JAVELIN_BURIED,
      }
      -- PX plays it unplaced. On the turn's worm: an explosion's ev.worm is the
      -- missile's owner, which need not be a worm and has no sound of its own.
      local shooter = current_worm()
      if shooter then wa.sound.play(shooter, "sounds/javelin_impact.wav") end
    end
  end
end

return weapon
