-- Igniter: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  fires = {
    subtype = 3,
  },
  handling = {
    remember_selection = true,
  },
  missile = {
    action = "bounce",
    animation = 2,
    bounce = {
      bounciness = 1,
      contact_sides = 8,
      explosion = {
        bias = 0,
        power = 0,
        push_pct = 0,
        variation = 0,
      },
      extra_reverse_chance_pct = 0,
      hits = {
        water = true,
      },
      sound = 0,
      terrain_keep_speed_pct = 0,
    },
    burst = "fire",
    explosion = {
      bias = 0,
    },
    fire = {
      burn_time_ms = 1000,
      decay_mode = "on_hit",
      spread_delay_ms = 150,
      spread_generations = 75,
    },
    fuse = 9000,
    trail = {
      speed = 0,
    },
  },
}

weapon.missile_sprite = { -- Igniter (igniter_anim: igniter_bullet, 16 frames)
    sheet = "sprites/igniter/flight.png", animate = true, anim_speed = 1.0, frames = 16,
  }

function weapon.definition()
  local shared = require("lib/shared")
  local fires = shared.fires
  local sdk = require("wf-lib/holds")
  local PX_POSTURE, PX_HANDS = sdk.PX_POSTURE, sdk.PX_HANDS
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.homing_missile",
    name = "Igniter",
    panel_icon = "sprites/igniter/igniter_ico.png",
    worm_sprites = PX_POSTURE,
    sprites = {
          "sprites/px_hold/igniter.png", "sprites/igniter/flight.png",
        },
    params = { gpu_prefix = "sprites/" },
    hold = { -- Igniter (igniter_anim)
        -- Up through the shot too: it has no firing poses of its own, so WA
        -- fires it in the aim posture, empty-handed without the hold. Not PX's.
        keep_while_firing = true,
        sheet = "sprites/px_hold/igniter.png", hand_type = 2, hand_radius = -6.0,
        hand_rotation = 1.0, hand_radial_rotation = 0.9, hand_scale = 0.8,
        weap_rotation = 1.0, weap_radial_rotation = 0.0, weap_radius = 0.0,
        hand = PX_HANDS[2],
    },
  })
end

return weapon
