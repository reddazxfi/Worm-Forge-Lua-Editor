-- Super Gravedigger: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  handling = {
    remember_selection = false,
  },
  missile = {
    action = "none",
    animation = 5,
    collision_shape = 3,
    countdown = 0,
    ends_on_contact = {
      crates = true,
      donor_cards = true,
      graves = true,
      land = true,
      objects = true,
      water = true,
      worms_jumping = true,
      worms_normal = true,
      worms_roping = true,
    },
    explosion = {
      bias = 75,
      power = 50,
    },
    flight_sound = 126,
    gravity_pct = 116,
    trail = {
      power = 100,
      speed = 145,
      sprite = 0,
    },
  },
  clusters = {
    bit = {
      animation = 5,
      bounce = {
        bounciness = 7,
        explosion = {
          power = 15,
        },
        max_bounces = 5,
        sound = 126,
        terrain_keep_speed_pct = 99,
      },
      ends_on_contact = {
        water = true,
      },
      explosion = {
        bias = 50,
        power = 18,
      },
      flight_sound = 126,
      fuse = 0,
      gravity_pct = 116,
      random_motion = 20,
      trail = {
        bubbles_per_second = 0.0,
        speed = 0,
        sprite = 0,
      },
    },
    launch_power_pct = 37,
    power_variation_pct = 35,
    spread = 45,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.banana_bomb",
    name = "Super Gravedigger",
    panel_icon = "sprites/super_gravedigger/sgrave_ico.png",
    sprite = "sprites/super_gravedigger/flight.png",
    cluster = { sprite = "sprites/super_gravedigger/cluster.png" },
    worm_sprites = {
          weaponlnk = "sprites/super_gravedigger/aim.png",
          weaponlnku = "sprites/super_gravedigger/aimu.png",
          weaponlnkd = "sprites/super_gravedigger/aimd.png",
          wthrow = "sprites/super_gravedigger/draw.png",
          wthrowu = "sprites/super_gravedigger/drawu.png",
          wthrowd = "sprites/super_gravedigger/drawd.png",
        },
  })
end

return weapon
