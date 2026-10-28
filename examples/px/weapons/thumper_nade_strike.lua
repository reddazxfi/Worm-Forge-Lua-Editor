-- Thumper Nade Strike: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  handling = {
    retreat = 3000,
  },
  missile = {
    animation = 1,
    bounce = {
      bounciness = 60,
      explosion = {
        power = 0,
        push_pct = 0,
      },
      extra_reverse_chance_pct = 0,
      hits = {
        arrows = true,
        crates = true,
        donor_cards = true,
        graves = true,
        land = true,
        mines = true,
        missiles = true,
        objects = true,
        water = true,
        worms = true,
        worms_frozen = true,
      },
      max_bounces = 2,
      sound = 30,
      terrain_keep_speed_pct = 50,
    },
    burst = "clusters",
    explosion = {
      bias = 10,
      power = 40,
    },
    gravity_pct = 120,
    random_motion = 10,
    trail = {
      power = 35,
      speed = 150,
      sprite = 251,
    },
  },
  clusters = {
    bit = {
      action = "bounce",
      animation = 5,
      ends_on_contact = {
        crates = true,
        donor_cards = true,
        land = true,
        objects = true,
        worms = true,
        worms_frozen = true,
      },
      explosion = {
        power = 25,
        push_pct = 100,
      },
      fuse = 9000,
      gravity_pct = 100,
      speed_pct = 100,
      sprite_count = 1,
      trail = {
        power = 40,
        speed = 120,
        sprite = 252,
      },
    },
    count = 6,
    launch_power_pct = 40,
    power_variation_pct = 30,
    spread = 45,
  },
  strike = {
    count = 3,
    plane = 87,
    spacing = 30,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.carpet_bomb",
    name = "Thumper Nade Strike",
    panel_icon = "sprites/thumper_nade/thumpernst_ico.png",
    sprite = "sprites/thumper_nade/flight.png",
    cluster = { sprite = "sprites/thumper_nade/cluster.png" },
  })
end

return weapon
