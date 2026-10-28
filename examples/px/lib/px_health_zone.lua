-- Health Zone -- Project X's zone launcher, ported to WormForge API 4.
--
-- PX's source is `PX_pending/weapon_zones/scripts/zone_launchers_script.txt`:
-- the `CHealthZone` class (:71-230), the missile's `ExplodeAt` that places the
-- zone (:377-384), and the in-match keys (:462-511). Its hold numbers are in
-- `scripts/health_zone_anim.txt` (:21-32), its record is
-- `weapons/health_zone_WEAP.wep`.
--
-- The weapon: WA's own standard missile (record `+0x30` fire type 1, `+0x38`
-- method 3, `+0x64` 2 -- track movement, a bazooka shell's flight) with PX's
-- `health_zone_bullet.png` drawn over it, which on impact leaves a zone. The
-- zone lasts `turns` turns and, once a second while it is active, acts on the
-- one object inside it:
--
--   * healing: configurable health to that worm, or a grave resurrected at 1 health
--     (`AddHealth`, :134-165);
--   * damaging: -1 health, never below 1 (`DamageHealth`, :118-132).
--
-- The other half of the zone's life -- its turns, its seven seconds of
-- inactivity after a turn ends, and the box it watches -- is PX's `CWZone` and
-- `CHealthZone` machinery, which the Security Grenade's sibling weapons share:
-- `lib/px_zone.lua`. The Blast Zone (`lib/px_blast_zone.lua`) and the Spot Hider
-- (`lib/px_spot_hider.lua`) are the same machine with other payloads.
--
-- The worm's aim art is the shared weapon-less library
-- (`lib/px_sprite_builder.lua`, `PX_POSTURE`) with PX's one held PNG over it,
-- exactly as `health_zone_anim.txt` states it (`hand_type` 3, the upper hand).
--
-- Art and particle parameters verified against weapon_zones.pxl, p_animation.pxl
-- and pxparticles.pxl in the 28.09.2026 PX build. Original stock strips are
-- bundled as GPU sheets; lib/px_zone_fx.lua reproduces the cosmetic particles.
-- Fuel and poison effects remain outside this visual/settings pass.
-- PX's stock animation is drawn in full colour, with its colour wash layered
-- using alpha (the quad API does not expose PX blend mode 6). Fade uses three
-- game seconds, as the source comment intends, instead of render-call counts.
--
-- A component's file, and anything it requires, runs where `wa` does not exist
-- yet: this module is pure data at load and touches `wa` only in `install`.

-- Whether the profile placed this component on a panel slot (REPORT.md 11.13):
-- a slot-less registration takes the match down at turn start.
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

  -- PX's numbers (`zone_launchers_script.txt`).
  local turns = ctx.option("turns")
  local healing_per_minute = ctx.option("healing_per_minute")
  local FPS = 50                    -- a tick a second, `fps = 50` (:87)
  local MIN_HP = 1                  -- `minHP`: a damaging zone never kills (:89)
  local RADIUS = 20                 -- `CWZone(x, y, 40, 30, ...)`: a 40x30 box (:382)
  local HALF_HEIGHT = 15
  local ROTATION = math.pi          -- `ZoneParams->rot = 180` (:103)
  local ZONE_SIZE = 60              -- scale 1 of the PX editor's padded 60px frame
  local ZONE_DEPTH = wa.depth.WORMS + 1 -- PX's `ZPlane = 16` (:106): behind worms

  local HEAL_TINT = 0x4164DC64   -- ARGB(65, 100, 220, 100), green (:111)
  local DAMAGE_TINT = 0x41D26464 -- ARGB(65, 210, 100, 100), red  (:112)

  -- Duration comes from the profile; +/- retain PX's mode controls.
  local healing = true
  local plus_held, minus_held

  -- The thrower, PX's `ClWT`/`ClWN` (:529-530): the flight actor's owner.
  local shooter

  -- PX's `AddHealth` (:134-165).
  local function add_health(z, obj)
    if obj.kind == "grave" then
      -- A grave with a bound worm comes back at 1 health (:143-146).
      if obj.worm_id ~= 0 then obj:revive(obj.worm_id, 1) end
    elseif obj.kind == "worm" then
      -- Keep the remainder in integer HP/min units: no fractional native HP,
      -- no floating-point drift, and no healing banked while the zone is empty.
      z.healing_credit = (z.healing_credit or 0) + healing_per_minute
      local amount = math.floor(z.healing_credit / 60)
      z.healing_credit = z.healing_credit % 60
      if amount > 0 then obj:heal(amount) end
    end
  end

  -- PX's `DamageHealth` (:118-132).
  local function damage_health(obj)
    if obj.kind == "worm" and obj.hp > MIN_HP then obj:hurt(1) end
  end

  -- Whether PX's `start_be_inactive` branch would act on this activator at all:
  -- only a resting one (:209, `SpX == 0 && SpY == 0`). A grave here never moves,
  -- so it always passes.
  local function resting(obj)
    if obj.kind == "grave" then return true end
    return (obj.vx or 0) == 0 and (obj.vy or 0) == 0
  end

  -- PX's `CHealthZone`, through the shared machine: a 40x30 box, a tick a
  -- second, healing or damaging the one object inside it (:118-229).
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

  -- +/- change mode; the component's duration is frozen with the profile.
  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FIRE_WEAPON then
      if worm.weapon == "px.health_zone" then shooter = worm end
      return
    end
    local keys = worm.turn and worm.weapon == "px.health_zone" and wa.world.keys() or nil
    if keys then
      if keys.plus_key and not plus_held then healing = true end
      if keys.minus_key and not minus_held then healing = false end
      if worm.aiming then fx.aim(worm, healing) end
    end
    -- Held past the weapon's deselect, re-select and press would read as no
    -- edge: the flags track the key even while another weapon is out.
    plus_held = keys ~= nil and keys.plus_key or false
    minus_held = keys ~= nil and keys.minus_key or false
  end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })

  require("lib/weapon_hint").register("px.health_zone", function()
    return (healing and "Health Zone: HEALING" or "Health Zone: DAMAGING")
      .. " for " .. turns .. " turns, " .. healing_per_minute .. " HP/min  (+ heals, - damages)"
  end)

  -- **The round in flight, drawn and turned by hand.** PX's `WeapSprite` with an
  -- empty `WeapSpriteParams` (`health_zone_anim.txt:37-47`) leaves WA's sprite 0
  -- and draws PX's `health_zone_bullet.png` on the missile, turned by the
  -- record's own animation type: `+0x64` is 2, the track-movement type, a
  -- bazooka shell facing its flight (`highlander_0rang3_test/lib/missile_sprites.lua:22-25`).
  fx.flight("px.health_zone", function() return healing end)
  sb.flight(ctx, {
    weapon = "px.health_zone",
    sheet = ART .. "bullet.png",
    anim = "track",
    z = wa.depth.OBJECTS - 1,
    mirror = true,
    owner = shooter,
  })

  -- **The worm's aim and pick art**, PX's sprite-builder split in two: the engine
  -- draws WA's worm from the shared library's weapon-less posture
  -- (`worm_sprites`, below), then draws the held vial and its hand over it from
  -- `hold`. The numbers are PX's own (`health_zone_anim.txt:24-30`):
  -- `hand_rotation` 0.5, `hand_radius` 4, `hand_radial_rotation` 0,
  -- `hand_type` 3 (the upper hand), `weap_radius` 0 (the vial at the worm's own
  -- centre), `hand_scale` 0.8; `weap_rotation` and `weap_radial_rotation` are left
  -- at PX's defaults, 1.0. One vial PNG, turned and placed by the aim.
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
    thrown = true, -- a thrown round leaves the hand; no put-away animation
    -- Gone on space, as PX's: no `FSprite` firing sprite, so his `sprite = 0`
    -- (`worms_anims_script.txt:263`, :419-422).
    keep_while_firing = false,
  }

  local spec = {
    -- The record is PX's own for this weapon, byte for byte: WA's standard
    -- missile with PX's icon, so the flight is WA's and only the zone is Lua's.
    wep = "weps/health_zone_wep.wep",
    panel_icon = ART .. "icon.png", -- PX's own (hz_ico.png)
    -- Stock WA art for the record itself. PX's record points its sprite at one of
    -- PX's own (id 100000+, which the engine resets); ours is never drawn --
    -- `sb.flight` hides it (`m.sprite = 0`, `lib/px_sprite_builder.lua:121`) and
    -- draws PX's own bullet instead -- but a record wants a sprite WA can
    -- resolve, and a missile is its own kind.
    sprite = "missile",
    worm_sprites = sb.PX_POSTURE,
    hold = hold,
    -- The flight and hold art; fx.install loads the shared zone/particle sheets.
    sprites = { ART .. "bullet.png" },
    params = { gpu_prefix = ART },
    -- PX's `ExplodeAt` (:377-384), after WA's own impact (there is no injury: the
    -- record's damage and blast are 0, its bombs are the zone).
    on_explode = function(ev)
      ZONES.place(ev.x, ev.y, { healing = healing, turns = turns, owner = shooter })
    end,
  }
  -- PX's records carry "ends the turn" off (`the weapon module's record.handling.ends_turn`), so a
  -- weapon built on one says so itself: the throw ends the turn, as WA's
  -- projectiles do.
  spec.handling = { ends_turn = true }
  wa.weapons.replace(spec)
end

return M
