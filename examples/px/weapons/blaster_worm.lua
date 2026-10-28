-- Blaster Worm: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  fires = {
    launch_power_pct = "charged",
    subtype = 3,
  },
  handling = {
    remember_selection = true,
  },
  missile = {
    action = "none",
    animation = 2,
    burst = "clusters",
    explosion = {
      bias = 0,
      power = 50,
    },
    flight_sound = 157,
    fuse = 9000,
    launch_sound = 0,
    trail = {
      bubbles_per_second = 0.0,
      speed = 0,
    },
  },
  clusters = {
    bit = {
      action = "bounce",
      animation = 1,
      bounce = {
        bounciness = 60,
        hits = {
          arrows = true,
          crates = true,
          donor_cards = true,
          land = true,
          mines = true,
          objects = true,
          water = true,
          worms = true,
          worms_frozen = true,
        },
        max_bounces = 6,
        sound = 56,
        terrain_keep_speed_pct = 60,
      },
      flight_sound = 162,
      fuse = 7000,
      gravity_pct = 100,
      random_motion = 5,
      speed_pct = 99,
      sprite_count = 1,
      trail = {
        power = 28,
        speed = 125,
        sprite = 249,
      },
    },
    count = 1,
    launch_power_pct = 80,
    power_variation_pct = 80,
    spread = 100,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.homing_pigeon",
    name = "Blaster Worm",
    panel_icon = "sprites/blaster_worm/bworm_ico.png",
    sprite = "sprites/blaster_worm/flight.png",
    cluster = { sprite = "sprites/blaster_worm/cluster.png" },
    sprite_overrides = { wsvbu = "sprites/blaster_worm/cluster_trail.png" },
    -- 249
        worm_sprites = {
          weaponlnk = "sprites/blaster_worm/aim.png",
          weaponlnku = "sprites/blaster_worm/aimu.png",
          weaponlnkd = "sprites/blaster_worm/aimd.png",
          wthrow = "sprites/blaster_worm/draw.png",
          wthrowu = "sprites/blaster_worm/drawu.png",
          wthrowd = "sprites/blaster_worm/drawd.png",
        },
  })
end

return weapon
