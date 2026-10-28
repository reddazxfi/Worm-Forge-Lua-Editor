-- Mortar Strike: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  missile = {
    burst = "clusters",
    ends_on_contact = {
      crates = true,
      donor_cards = true,
      land = true,
      objects = true,
      water = true,
      worms = true,
    },
    explosion = {
      bias = 0,
      push_pct = 100,
    },
    flight_sound = 75,
    fuse = 10000,
    gravity_pct = 70,
    random_motion = 10,
    sprite = 52,
    trail = {
      power = 20,
      speed = 260,
      sprite = 466,
    },
  },
  clusters = {
    angle = -1,
    bit = {
      action = "bounce",
      animation = 2,
      bounce = {
        bounciness = 50,
        hits = {
          water = true,
          worms_frozen = true,
        },
        max_bounces = 100,
        sound = 113,
        terrain_keep_speed_pct = 50,
      },
      ends_on_contact = {
        crates = true,
        donor_cards = true,
        land = true,
        objects = true,
        water = true,
        worms = true,
        worms_frozen = true,
      },
      explosion = {
        power = 15,
        push_pct = 100,
      },
      fuse = 10000,
      gravity_pct = 100,
      speed_pct = 100,
      sprite_count = 1,
      trail = {
        bubbles_per_second = 12.5,
        power = 15,
        speed = 160,
        sprite = 260,
      },
    },
    count = 5,
    launch_power_pct = 30,
    power_variation_pct = 30,
    spread = 40,
  },
  strike = {
    count = 4,
    plane = 86,
    spacing = 30,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.air_strike",
    name = "Mortar Strike",
    panel_icon = "sprites/mortar_strike/ico_mortarst.png",
    cluster = { sprite = "sprites/mortar_strike/cluster.png" },
    sprite_overrides = {
          wsvclnk = "sprites/mortar_strike/trail.png",                             -- 466
          wsvc = "sprites/mortar_strike/cluster_trail.png",                        -- 260
        },
  })
end

return weapon
