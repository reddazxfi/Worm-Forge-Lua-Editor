-- Sticky Bomb: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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

weapon.missile_sprite = { -- Sticky Bomb (sb_script: SBB, sb.png, on every missile it fires)
    sheet = "sprites/sticky_bomb/bomb.png", frames = 1,
    spin = true, -- its record's WAT_Rotation
    -- PX's record has sprite 0; the pack's stock grenade is only for the
    -- worm's throw sheet, as the Electric Grenade's.
    hide = true,
    -- Only the bomb thrown, which WA would draw as its grenade (stock 50):
    -- the bit it bursts into flies, and sticks, with the bomb as its own
    -- cluster sheet.
    first_sprite = 50,
  }

function weapon.definition()
  local sdk = require("wf-lib/holds")
  local PX_POSTURE, PX_HANDS = sdk.PX_POSTURE, sdk.PX_HANDS
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.grenade",
    name = "Sticky Bomb",
    panel_icon = "sprites/sticky_bomb/sbico.png",
    sprite = "grenade",
    cluster = { sprite = "sprites/sticky_bomb/bomb.png" },
    -- Stuck, the bits draw with the frames at +0x178..+0x184, which the
        -- record points at 467 (wsvclnku, a worm in a crowned cap that WA
        -- doesn't draw, as PX's other wsv* overrides); PX overrides that too.
        sprite_overrides = {
          wsvclnku = "sprites/sticky_bomb/bomb.png",                               -- 467
        },
    worm_sprites = PX_POSTURE,
    -- The hold, and the bomb drawn in flight: GPU sheets, both under the prefix.
        sprites = { "sprites/px_hold/sticky_bomb.png", "sprites/sticky_bomb/bomb.png" },
    params = { gpu_prefix = "sprites/" },
    hold = { -- Sticky Bomb (sb_script)
        -- Thrown: once fired it has left the worm's hands, and WA puts nothing
        -- away (as for its own grenades), so neither does the rule.
        thrown = true,
        sheet = "sprites/px_hold/sticky_bomb.png", hand_type = 1, hand_radius = 24,
        hand_rotation = 1.0, hand_radial_rotation = 1.05, hand_scale = 0.8,
        weap_rotation = 0.5, weap_radial_rotation = 0.9, weap_radius = 10,
        hand = PX_HANDS[1],
    },
  })
end

return weapon
