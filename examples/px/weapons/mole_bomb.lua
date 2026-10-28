-- Mole Bomb: record, art and behaviour.
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
    countdown = 5000,
    explode_on_space = true,
    explosion = {
      push_pct = 100,
    },
    flight_sound = 65575,
    fuse = 5000,
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
        sound = 40,
        speed = 4.5,
      },
      step_height = 8,
      terrain_offset = -4,
      walk_speed = 1.0,
    },
    speed_pct = 100,
    sprite = 166,
    trail = {
      bubbles_per_second = 12.5,
      speed = 100,
      sprite = 131,
    },
  },
  clusters = {
    bit = {
      action = "dig",
      animation = 6,
      countdown = 5000,
      dig = {
        dive_sprite = 158,
        sound = 65574,
        sprite_1 = 159,
        sprite_2 = 160,
        sprite_3 = 160,
      },
      ends_on_contact = {
        crates = true,
        donor_cards = true,
        objects = true,
        worms = true,
        worms_frozen = true,
      },
      explode_on_space = true,
      explosion = {
        power = 40,
        push_pct = 110,
      },
      fuse = 20000,
      gravity_pct = 100,
      speed_pct = 100,
      sprite = 152,
      sprite_count = 1,
      trail = {
        bubbles_per_second = 12.5,
        power = 50,
        speed = 50,
        sprite = 80,
      },
    },
    count = 1,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.double_turn_time",
    name = "Mole Bomb",
    panel_icon = "mole_bomb",
  })
end

return weapon
