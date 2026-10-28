-- Cluster Bomb: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  fires = {
    launch_power_pct = "charged",
    subtype = 2,
  },
  handling = {
    remember_selection = true,
  },
  missile = {
    action = "bounce",
    alarm_worms = true,
    bounce = {
      bounciness = 0,
      contact_sides = 8,
      explosion = {
        bias = 0,
        power = 0,
        push_pct = 0,
        variation = 0,
      },
      extra_reverse_chance_pct = 0,
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
    burst = "clusters",
    countdown = 5000,
    ends_on_contact = {},
    explosion = {
      power = 20,
      push_pct = 0,
    },
    flight_sound = 0,
    fuse = 0,
    sprite = 53,
    trail = {
      sprite = 131,
    },
  },
  clusters = {
    bit = {
      action = "bounce",
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
      ends_on_contact = {
        crates = true,
        donor_cards = true,
        land = true,
        objects = true,
        worms = true,
        worms_frozen = true,
      },
      explosion = {
        power = 20,
        push_pct = 100,
      },
      fuse = 9000,
      gravity_pct = 100,
      speed_pct = 100,
      sprite = 54,
      sprite_count = 1,
      trail = {
        bubbles_per_second = 12.5,
        power = 20,
        speed = 100,
        sprite = 131,
      },
    },
    count = 5,
    launch_power_pct = 30,
    power_variation_pct = 30,
    spread = 45,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.magic_bullet",
    name = "Cluster Bomb",
    panel_icon = "cluster_bomb",
  })
end

return weapon
