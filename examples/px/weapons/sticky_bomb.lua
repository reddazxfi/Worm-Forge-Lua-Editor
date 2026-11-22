-- Sticky Bomb: a grenade that sticks where it lands, then explodes.

local weapon = {}

weapon.record = {
  missile = {
    action = "none",
    burst = "clusters",
    countdown = 0,
    ends_on_contact = {
      arrows = true,
      canisters = true,
      crates = true,
      land = true,
      mines = true,
      objects = true,
      water = true,
      worms = true,
      worms_frozen = true,
    },
    explosion = {
      bias = 0,
      power = 0,
      push_pct = 0,
    },
    explosion_sound = {
      sound = 39,
    },
    fuse = 2000000,
    sprite = 0,
  },
  clusters = {
    bit = {
      action = "dig",
      animation = 1,
      countdown = 4000,
      dig = {
        dive_sprite = 467,
        sprite_1 = 467,
        sprite_2 = 467,
        sprite_3 = 467,
      },
      ends_on_contact = {
        water = true,
      },
      explosion = {
        power = 55,
        push_pct = 60,
      },
      explosion_sound = {
        enabled = true,
      },
      flight_sound = 56,
      fuse = 4000,
      gravity_pct = 100,
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

weapon.missile_sprite = {
    sheet = "sprites/sticky_bomb/bomb.png", frames = 1,
    spin = true, -- its record's WAT_Rotation
    first_sprite = 0, -- the bomb flies with no stock sprite; its bit keeps the cluster sheet
  }

function weapon.definition()
  local sdk = require("wf-lib/holds")
  local PX_POSTURE, PX_HANDS = sdk.PX_POSTURE, sdk.PX_HANDS
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.grenade",
    name = "Sticky Bomb",
    panel_icon = "sprites/sticky_bomb/sbico.png",
    hold_as = "stock.grenade",
    cluster_sprite = "sprites/sticky_bomb/bomb.png",
        sprite_overrides = {
          wsvclnku = "sprites/sticky_bomb/bomb.png", -- 467
        },
    worm_sprites = PX_POSTURE,
        sprites = { "sprites/px_hold/sticky_bomb.png", "sprites/sticky_bomb/bomb.png" },
    params = { gpu_prefix = "sprites/" },
    hold = { -- Sticky Bomb (sb_script)
        thrown = true,
        sheet = "sprites/px_hold/sticky_bomb.png", hand_type = 1, hand_radius = 24,
        hand_rotation = 1.0, hand_radial_rotation = 1.05, hand_scale = 0.8,
        weap_rotation = 0.5, weap_radial_rotation = 0.9, weap_radius = 10,
        hand = PX_HANDS[1],
    },
  })
end

return weapon
