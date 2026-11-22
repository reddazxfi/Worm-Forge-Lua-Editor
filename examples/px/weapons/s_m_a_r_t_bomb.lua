-- S.M.A.R.T Bomb: a mortar whose cluster bits home in on worms.

local weapon = {}

weapon.record = {
  fires = {
    launch_power_pct = "charged",
    subtype = 3,
  },
  missile = {
    ends_on_contact = {
      crates = true,
      donor_cards = true,
      land = true,
      missiles = true,
      objects = true,
      worms = true,
      worms_frozen = true,
    },
    gravity_pct = 125,
    trail = {
      power = 40,
      speed = 120,
      sprite = 250,
    },
  },
  clusters = {
    angle = 0,
    bit = {
      action = "homing",
      animation = 1,
      explosion = {
        power = 25,
        push_pct = 115,
      },
      flight_sound = 46,
      -- The Magic Bullet's homing (cluster_homing), with PX's red trail.
      homing = {
        trail = {
          sprite = 250,
        },
      },
      trail = {
        bubbles_per_second = 0.0,
        power = 2,
        speed = 600,
        sprite = 0,
      },
    },
    count = 7,
    launch_power_pct = 50,
    spread = 45,
  },
}

weapon.defaults = {
  aims_straight_up = false,
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.mortar",
    name = "S.M.A.R.T Bomb",
    panel_icon = "sprites/smart_bomb/smart_ico.png",
    sprite = "sprites/smart_bomb/flight.png",
    cluster_sprite = "sprites/smart_bomb/cluster.png",
    cluster_homing_sprite = "sprites/smart_bomb/cluster_homing.png",
    -- The bits home as WA's Magic Bullet does: around land.
    cluster_homing = "stock.magic_bullet",
    sprite_overrides = { wsvbd = "sprites/smart_bomb/trail.png" },
        worm_sprites = {
          weaponlnk = "sprites/smart_bomb/aim.png",
          weaponlnku = "sprites/smart_bomb/aimu.png",
          weaponlnkd = "sprites/smart_bomb/aimd.png",
          wthrow = "sprites/smart_bomb/draw.png",
          wthrowu = "sprites/smart_bomb/drawu.png",
          wthrowd = "sprites/smart_bomb/drawd.png",
        },
  })
end

return weapon
