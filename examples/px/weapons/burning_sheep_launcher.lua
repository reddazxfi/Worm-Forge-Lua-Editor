-- Burning Sheep Launcher: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  fires = {
    launch_power_pct = "charged",
    subtype = 3,
  },
  missile = {
    animation = 1,
    bounce = {
      bounciness = 50,
      explosion = {
        power = 50,
        push_pct = 100,
      },
      extra_reverse_chance_pct = 50,
      hits = {
        land = true,
        water = true,
        worms = true,
        worms_frozen = true,
      },
      max_bounces = 2,
      terrain_keep_speed_pct = 30,
    },
    burst = "fire",
    ends_on_contact = {},
    explode_on_space = false,
    explosion = {
      power = 50,
      push_pct = 100,
    },
    fire = {
      burn_time_ms = 4000,
      spread_delay_ms = 100,
      spread_generations = 20,
    },
    fuse = 9000,
    sprite = 64,
    trail = {
      bubbles_per_second = 0.0,
      power = 20,
      speed = 50,
    },
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.sheep_launcher",
    name = "Burning Sheep Launcher",
    panel_icon = "sprites/launchers/burning_sheep_launcher_ico.png",
  })
end

return weapon
