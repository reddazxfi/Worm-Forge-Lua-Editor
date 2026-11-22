-- Sentry Gun: a turret that fires at moving enemy worms within 360 pixels.

local weapon = {}

weapon.record = {}

function weapon.definition()
  local shared = require("lib/shared")
  local fires = shared.fires
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.mine",
    name = "Sentry Gun",
    panel_icon = "sprites/sentry_gun/icon.png",
    is_weapon = true,
        worm_sprites = {
          weaponlnk = "sprites/sentry_gun/equip.png", weaponlnku = "sprites/sentry_gun/equipu.png",
          weaponlnkd = "sprites/sentry_gun/equipd.png",
          wthrow = "sprites/sentry_gun/unequip.png", wthrowu = "sprites/sentry_gun/unequipu.png",
          wthrowd = "sprites/sentry_gun/unequipd.png",
        },
    worm_sprites_team_tint = {
          worm_sprites = {
            weaponlnk = "sprites/sentry_gun/equip_housing.png", weaponlnku = "sprites/sentry_gun/equipu_housing.png",
            weaponlnkd = "sprites/sentry_gun/equipd_housing.png",
            wthrow = "sprites/sentry_gun/unequip_housing.png", wthrowu = "sprites/sentry_gun/unequipu_housing.png",
            wthrowd = "sprites/sentry_gun/unequipd_housing.png",
          },
          colours = { 0xFF6447, 0x4764FF, 0x47FF64, 0xE6E647, 0xE647E6, 0x47E6E6 },
        },
    sprites = {
          "sprites/sentry_gun/impact.png", "sprites/sentry_gun/casing.png", "sprites/sentry_gun/turret_base.png",
          "sprites/sentry_gun/turret_head.png", "sprites/sentry_gun/turret_flare.png", "sprites/sentry_gun/turret_light.png",
        },
    sounds = {
          "sounds/sentry_gun/sentryplace.wav", "sounds/sentry_gun/sentrybeeps2.wav",
          "sounds/sentry_gun/sentryfireloop.wav", "sounds/sentry_gun/sentryfireend.wav",
          "sounds/sentry_gun/sentryservostart.wav", "sounds/sentry_gun/sentryservoloop.wav",
          "sounds/sentry_gun/sentryservoend.wav",
        },
    params = {
          sprite_columns = 1,
          worm_sprites_animate = true,
          depth = wa.depth.BEHIND_TERRAIN,
          depth_prefix = "sprites/sentry_gun/turret_",
          gpu_prefix = "sprites/sentry_gun/turret_",
        },
    on_fire = function(fire) fires.sentry_gun(fire) end,
  })
end

function weapon.setup()
  local shared = require("lib/shared")
  local turret = require("lib/turret")
  local ART = "sprites/sentry_gun/"
  local SND = "sounds/sentry_gun/"
  local MUZZLE_OUT = 11 -- pixels from the pivot along the bore
  local SPREAD_TENTHS = 20 -- +-2.0 degrees
  local CASING = ART .. "casing.png"
  local CASING_FRAMES, CASING_LIFE = 16, 100
  local CASING_JITTER_DEG = 17 -- PX's RandomFloat(-0.3, 0.3) rad
  local CASING_SPEED_MIN, CASING_SPEED_MAX = 200, 300 -- PX's 2.0 to 3.0, hundredths

  local TEAM_TINT = { 0xFF6447, 0x4764FF, 0x47FF64, 0xE6E647, 0xE647E6, 0x47E6E6 }
  shared.sentry_team_tint = TEAM_TINT

  local function casing(t, a, s, rad)
    local jitter = wa.random(-CASING_JITTER_DEG, CASING_JITTER_DEG)
    local eject = rad + math.rad(90 * s.side + jitter)
    local speed = wa.random(CASING_SPEED_MIN, CASING_SPEED_MAX) / 100
    local life, spin = CASING_LIFE, 0
    wa.actors.spawn({
      sprite = CASING, x = a.x, y = a.y - t.muzzle_up,
      vx = (wa.math.sin(eject) * speed), vy = (wa.math.cos(eject) * speed),
      owner = t.owner(a, s),
      on = function(c)
        life = life - 1
        if life <= 0 then c:remove(); return end
        c.vy = c.vy + wa.world.gravity()
        c:move({ terrain = false, worms = false })
        spin = (spin + 1) % CASING_FRAMES
        c:frame(spin)
      end,
    })
  end

  local function fire(t, a, s)
    local owner = t.owner(a, s)
    if owner == a then t.stop_firing(a, s); return end
    s.shots = s.shots + 1
    local dev = 0
    if s.shots % 5 ~= 0 then dev = wa.random(-SPREAD_TENTHS, SPREAD_TENTHS) / 10 end
    local rad = math.rad(s.angle + dev)
    local dx, dy = wa.math.sin(rad), wa.math.cos(rad)
    local mx, my = turret.muzzle(t, a, s.angle)
    casing(t, a, s, rad)
    wa.weapons.fire_bullet {
      weapon = "stock.uzi", owner = owner,
      x = mx, y = my, dx = dx, dy = dy,
      damage = t.damage, push_pct = t.push_pct, ignore = { a },
    }
    s.ammo = s.ammo - 1
    if s.ammo <= 0 then
      s.active = false
      t.stop_firing(a, s)
    end
  end

  local gun = turret.new({
    kind = "sentry", weapon = "px.sentry_gun",
    tazer = "stun", -- the Tazer's arc stuns it (PxSentryGun::Stun)
    damage = 2, push_pct = 100,
    muzzle_out = MUZZLE_OUT,
    art = { base = ART .. "turret_base.png", mask = ART .. "turret_mask.png", gun = ART .. "turret_head.png", turns = 256, gun_size = 52, flare = ART .. "turret_flare.png", light = ART .. "turret_light.png" },
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
end

function weapon.configure(ctx)
  local gun = require("lib/shared").sentry_gun
  gun.health = ctx.option("health")
  gun.ammo = ctx.option("ammo")
  gun.damage = ctx.option("damage")
  gun.push_pct = ctx.option("push_pct")
end

return weapon
