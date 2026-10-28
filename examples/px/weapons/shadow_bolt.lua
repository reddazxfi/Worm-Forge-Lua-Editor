-- Shadow-Bolt: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  fires = {
    method = 3,
    subtype = 2,
  },
  missile = {
    action = "bounce",
    animation = 2,
    bounce = {
      bounciness = 80,
      hits = {
        water = true,
        worms_frozen = true,
      },
      max_bounces = 10,
      sound = 83,
      terrain_keep_speed_pct = 80,
    },
    collision_shape = 3,
    ends_on_contact = {
      crates = true,
      donor_cards = true,
      mines = true,
      objects = true,
      water = true,
      worms = true,
    },
    explosion = {
      bias = 8,
      power = 28,
      push_pct = 250,
    },
    flight_sound = 122,
    fuse = 10000,
    gravity_pct = 110,
    impact_particles = true,
    speed_pct = 100,
    trail = {
      bubbles_per_second = 12.5,
      power = 40,
      speed = 180,
      sprite = 453,
    },
  },
}

weapon.missile_sprite = { -- Shadow-Bolt
    sheet = "sprites/shadow_bolt/bolt.png", animate = true, anim_speed = 1.30, frames = 6,
  }

function weapon.definition()
  local shared = require("lib/shared")
  local fires = shared.fires
  local sdk = require("wf-lib/holds")
  local PX_POSTURE = sdk.PX_POSTURE
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.longbow",
    name = "Shadow-Bolt",
    panel_icon = "sprites/shadow_bolt/ico_shadowb.png",
    worm_sprites = PX_POSTURE,
    sprite_overrides = { [453] = "sprites/shadow_bolt/trail.png" },
    sprites = { "sprites/px_hold/shadow_bolt.png", "sprites/shadow_bolt/bolt.png" },
    params = { gpu_prefix = "sprites/" },
    hold = { -- Shadow-Bolt (shadow_bolt_script): no hand, the bolt animated
        -- The crossbow stays up through the shot: it has no firing poses of
        -- its own, so WA fires it in the aim posture. Not PX's.
        keep_while_firing = true,
        sheet = "sprites/px_hold/shadow_bolt.png", draw_hand = false, hand_radius = 0.0,
        hand_rotation = 0.0, hand_radial_rotation = 0.0,
        weap_rotation = 1.0, weap_radial_rotation = 0.0, weap_radius = 3.5,
        animate = true, anim_speed = 1.30, frames = 6,
      },
  })
end

return weapon
