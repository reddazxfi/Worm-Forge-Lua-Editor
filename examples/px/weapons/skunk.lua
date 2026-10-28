-- Skunk: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  fires = {
    creates_projectile = true,
    launch_power_pct = 5,
    method = 2,
    subtype = 0,
    type = 2,
  },
  handling = {
    remember_selection = true,
    ends_turn = true,
    shots = 0,
  },
  missile = {
    action = "roam",
    animation = 6,
    burst = "clusters",
    collision_shape = 2,
    explode_on_space = true,
    explosion = {
      push_pct = 100,
    },
    flight_sound = 65578,
    gravity_pct = 100,
    roam = {
      flight_hits = {
        crates = true,
        donor_cards = true,
        land = true,
        objects = true,
        water = true,
        worms = true,
        worms_frozen = true,
      },
      hits = {
        crates = true,
        donor_cards = true,
        land = true,
        objects = true,
        water = true,
        worms = true,
        worms_frozen = true,
      },
      jump = {
        angle_deg = 15,
        sound = 43,
        speed = 7.2,
      },
      step_height = 4,
      terrain_offset = -4,
      walk_speed = 2.0,
    },
    speed_pct = 100,
    sprite = 173,
    trail = {
      bubbles_per_second = 12.5,
      speed = 100,
      sprite = 131,
    },
  },
  clusters = {
    bit = {
      action = "roam",
      animation = 6,
      countdown = 5000,
      explode_on_space = true,
      explosion = {
        power = 30,
        push_pct = 100,
      },
      flight_sound = 65577,
      fuse = 10000,
      gravity_pct = 100,
      roam = {
        gas = {
          animal_sprite = 174,
          poison_power = 15,
          start_delay_ms = 1,
        },
        hits = {
          crates = true,
          donor_cards = true,
          land = true,
          objects = true,
          water = true,
          worms = true,
          worms_frozen = true,
        },
        jump = {
          angle_deg = 15,
          sound = 43,
          speed = 7.2,
        },
        step_height = 4,
        terrain_offset = -4,
        walk_speed = 2.0,
      },
      speed_pct = 100,
      sprite = 173,
      sprite_count = 1,
      trail = {
        bubbles_per_second = 12.5,
        speed = 100,
        sprite = 131,
      },
    },
    count = 1,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.damage_x2",
    name = "Skunk",
    panel_icon = "skunk",
  })
end

return weapon
