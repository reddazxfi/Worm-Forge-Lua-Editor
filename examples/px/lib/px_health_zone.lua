-- Health Zone: Project X's zone launcher, ported to WormBench.

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

local M = {}

function M.install(ctx)
  if not placed(ctx) then
    wa.log("Health Zone: in no panel slot; nothing registered")
    return
  end

  local ART = "sprites/health_zone/"
  local sb = require("lib/px_sprite_builder")
  local zone = require("lib/px_zone")
  local fx = require("lib/px_zone_fx")
  fx.install()

  local turns = ctx.option("turns")
  local healing_per_minute = ctx.option("healing_per_minute")
  local FPS = 50 -- a tick a second, `fps = 50`
  local MIN_HP = 1 -- `minHP`: a damaging zone never kills
  local RADIUS = 20 -- `CWZone(x, y, 40, 30, ...)`: a 40x30 box
  local HALF_HEIGHT = 15
  local ROTATION = 0
  local ZONE_SIZE = 60 -- scale 1 of the PX editor's padded 60px frame
  local ZONE_DEPTH = wa.depth.WORMS + 1 -- PX's `ZPlane = 16`: behind worms

  local HEAL_TINT = 0x4164DC64 -- ARGB, green
  local DAMAGE_TINT = 0x41D26464 -- ARGB, red

  local healing = true
  local plus_held = {}

  local shooter

  local function add_health(z, obj)
    if obj.kind == "grave" then
      if obj.worm_id ~= 0 then obj:revive(obj.worm_id, 1) end
    elseif obj.kind == "worm" then
      z.healing_credit = (z.healing_credit or 0) + healing_per_minute
      local amount = math.floor(z.healing_credit / 60)
      z.healing_credit = z.healing_credit % 60
      if amount > 0 then obj:heal(amount) end
    end
  end

  -- Not worm:hit: a hit on the turn's worm starts WA's damage pause, and a
  -- tick every second restarts it before it ends, so the turn never resumes.
  local function damage_health(obj)
    if obj.kind == "worm" and obj.hp > MIN_HP then obj:reduce_health(1) end
  end

  local function resting(obj)
    if obj.kind == "grave" then return true end
    return (obj.vx or 0) == 0 and (obj.vy or 0) == 0
  end

  local ZONES = zone.register({
    name = "Health Zone",
    fps = FPS,
    next_turn = true,
    fade_frames = fx.FADE,
    radius = RADIUS,
    half_height = HALF_HEIGHT,
    kinds = { worm = true, grave = true },
    wakes = function(z, obj) return not z.start_be_inactive or resting(obj) end,
    tick = function(z, obj)
      if z.healing then add_health(z, obj) else damage_health(obj) end
    end,
    draw = function(z)
      local sheet, frames = z.healing and fx.HEAL or fx.DAMAGE, z.healing and 61 or 32
      local frame = fx.frame(z.timer, 20, frames)
      zone.mark(sheet, z.x, z.y, ZONE_SIZE, ROTATION,
        fx.faded(0xFFFFFFFF, z), "alpha", ZONE_DEPTH, frame)
      zone.mark(sheet, z.x, z.y, ZONE_SIZE, ROTATION,
        fx.faded(z.healing and HEAL_TINT or DAMAGE_TINT, z), "alpha", ZONE_DEPTH, frame)
    end,
  })

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FIRE_WEAPON then
      if worm.weapon == "px.health_zone" then shooter = worm end
      return
    end
    local keys = worm.turn and worm.weapon == "px.health_zone" and wa.world.keys() or nil
    if keys then
      if keys.plus_key and not plus_held[worm.id] then
        healing = not healing
        fx.clear_aim()
      end
      if worm.aiming then fx.aim(worm, healing) end
    end
    plus_held[worm.id] = keys ~= nil and keys.plus_key or false
  end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })

  require("lib/weapon_hint").register("px.health_zone", function()
    return (healing and "Health Zone: HEALING" or "Health Zone: DAMAGING")
      .. " for " .. turns .. " turns\n" .. healing_per_minute .. " HP a minute\n+ switches"
  end)

  fx.flight("px.health_zone", function() return healing end)
  sb.flight(ctx, {
    weapon = "px.health_zone",
    sheet = ART .. "bullet.png",
    anim = "track",
    z = wa.depth.OBJECTS - 1,
    mirror = true,
    owner = shooter,
  })

  local hold = {
    sheet = ART .. "hold.png",
    hand = sb.PX_HANDS[3], -- hand_type 3: the upper hand
    hand_radius = 4.0,
    hand_rotation = 0.5,
    hand_radial_rotation = 0.0,
    hand_scale = 0.8,
    weap_radius = 0.0,
    weap_rotation = 1.0,
    weap_radial_rotation = 1.0,
    frames = 1, -- one vial, turned by the engine's hold to the aim
    thrown = true,
    keep_while_firing = false,
  }

  local spec = {
    wep = "weps/health_zone_wep.wep",
    panel_icon = ART .. "icon.png", -- PX's hz_ico.png
    missile = { sprite = 0 }, -- WA draws no round; the art spec draws it
    worm_sprites = sb.PX_POSTURE,
    hold = hold,
    sprites = { ART .. "bullet.png" },
    params = { gpu_prefix = ART },
    on_explode = function(ev)
      ZONES.place(ev.x, ev.y, { healing = healing, turns = turns, owner = shooter })
    end,
  }
  spec.handling = { ends_turn = true }
  wa.weapons.replace(spec)
end

return M
