-- Pigeon Strike: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  handling = {
    retreat = 3000,
  },
  missile = {
    action = "homing",
    animation = 3,
    burst = "clusters",
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
      bias = 25,
      power = 55,
    },
    flight_sound = 65587,
    fuse = 12000,
    gravity_pct = 25,
    homing = {
      animation = 1,
      arm = 2400,
      kind = "lock",
      sprite = 175,
      time = 1000,
      trail = {
        bubbles_per_second = 12.5,
        power = 25,
        speed = 40,
        sprite = 134,
      },
    },
    random_motion = 180,
    speed_pct = 95,
    sprite = 175,
    trail = {
      power = 50,
      sprite = 0,
    },
    wind_pct = 0,
  },
  clusters = {
    bit = {
      action = "bounce",
      animation = 1,
      bounce = {
        bounciness = 20,
        contact_sides = 8,
        hits = {
          crates = true,
          donor_cards = true,
          land = true,
          objects = true,
          worms_frozen = true,
        },
        max_bounces = 1,
        terrain_keep_speed_pct = 20,
      },
      ends_on_contact = {
        crates = true,
        donor_cards = true,
        land = true,
        objects = true,
        worms_frozen = true,
      },
      fuse = 10000,
      gravity_pct = 45,
      random_motion = 60,
      speed_pct = 99,
      sprite = 134,
      sprite_count = 1,
      trail = {
        bubbles_per_second = 12.5,
      },
    },
    count = 18,
    launch_power_pct = 15,
    power_variation_pct = 30,
    spread = 20,
  },
  strike = {
    count = 3,
    munition_speed = 12.0,
    plane = 86,
    spacing = 45,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.mail_strike",
    name = "Pigeon Strike",
    panel_icon = "sprites/pigeon_strike/ico_pigeonst.png",
  })
end

return weapon
