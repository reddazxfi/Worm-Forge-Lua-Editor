-- Pogo Sheep: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  fires = {
    launch_power_pct = 6,
  },
  missile = {
    action = "bounce",
    animation = 2,
    bounce = {
      bounciness = 98,
      hits = {
        crates = true,
        donor_cards = true,
        land = true,
        mines = true,
        objects = true,
        water = true,
        worms = true,
        worms_frozen = true,
      },
      max_bounces = 50,
      sound = 111,
    },
    burst = "clusters",
    countdown = 0,
    explosion = {
      power = 65,
    },
    flight_sound = 50,
    gravity_pct = 70,
    impact_particles = true,
    random_motion = 8,
  },
  clusters = {
    bit = {
      action = "bounce",
      bounce = {
        bounciness = 10,
        hits = {
          land = true,
        },
        max_bounces = 10,
        terrain_keep_speed_pct = 10,
      },
      fuse = 2000,
      gravity_pct = 75,
      random_motion = 650,
      speed_pct = 65,
      sprite_count = 1,
      trail = {
        bubbles_per_second = 12.5,
        power = 1,
        speed = 20,
        sprite = 249,
      },
    },
    count = 48,
    launch_power_pct = 1,
    power_variation_pct = 30,
    spread = 45,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.sheep",
    name = "Pogo Sheep",
    panel_icon = "sprites/pogo_sheep/psheep_ico.png",
    sprite = "sprites/pogo_sheep/flight.png",
    cluster = { sprite = "sprites/pogo_sheep/cluster.png" },
  })
end

return weapon
