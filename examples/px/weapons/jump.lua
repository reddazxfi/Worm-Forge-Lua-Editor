-- Jump: the worm itself is launched along the aim with the shot's power.

local weapon = {}

weapon.record = {
  fires = {
    creates_projectile = true,
    method = 3,
    subtype = 2,
    type = 1,
  },
  handling = {
    retreat = 3000,
  },
  missile = {
    action = "bounce",
    alarm_worms = true,
    animation = 1,
    bounce = {
      contact_sides = 8,
      hits = {
        crates = true,
        donor_cards = true,
        land = true,
        objects = true,
        water = true,
        worms_acting = true,
        worms_frozen = true,
        worms_jumping = true,
        worms_normal = true,
      },
      sound = 113,
      terrain_keep_speed_pct = 100,
    },
    collision_shape = 2,
    countdown = 5000,
    explosion = {
      bias = 10,
      power = 50,
      push_pct = 100,
    },
    gravity_pct = 100,
    speed_pct = 100,
    sprite = 50,
    trail = {
      bubbles_per_second = 12.5,
      speed = 100,
      sprite = 131,
    },
  },
}

function weapon.definition()
  local shared = require("lib/shared")
  local fires = shared.fires
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.ninja_rope",
    name = "Jump",
    panel_icon = "sprites/jump/jumpic.png",
    worm_sprites = {
          weaponlnk = "sprites/jump/aim.png", weaponlnku = "sprites/jump/aimu.png",
          weaponlnkd = "sprites/jump/aimd.png",
        },
    on_fire = function(fire) fires.jump(fire) end,
  })
end

function weapon.setup()
  local shared = require("lib/shared")
  local fires = shared.fires

  do

  local JUMP_SPEECH, SPEECH_LINES = 150, 54

  fires.jump = function(fire)
    local worm = fire.worm
    worm:release(fire.vx, fire.vy)
    wa.sound.play(worm, JUMP_SPEECH + SPEECH_LINES * (worm.team - 1))
  end
  end
end

return weapon
