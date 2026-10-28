-- Thumper Nade: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  fires = {
    method = 3,
    subtype = 2,
    type = 1,
  },
  missile = {
    action = "bounce",
    alarm_worms = true,
    animation = 1,
    bounce = {
      bounciness = 60,
      contact_sides = 8,
      hits = {
        crates = true,
        donor_cards = true,
        graves = true,
        land = true,
        mines = true,
        missiles = true,
        objects = true,
        water = true,
        worms_acting = true,
        worms_frozen = true,
        worms_jumping = true,
        worms_normal = true,
      },
      max_bounces = 2,
      sound = 30,
      terrain_keep_speed_pct = 50,
    },
    burst = "clusters",
    collision_shape = 2,
    ends_on_contact = {
      water = true,
    },
    explosion = {
      bias = 10,
      power = 40,
      push_pct = 100,
    },
    fuse = 9000,
    gravity_pct = 120,
    speed_pct = 100,
    trail = {
      bubbles_per_second = 12.5,
      power = 40,
      speed = 150,
      sprite = 251,
    },
  },
  clusters = {
    bit = {
      action = "bounce",
      animation = 5,
      bounce = {
        hits = {
          crates = true,
          donor_cards = true,
          water = true,
          worms_frozen = true,
        },
        max_bounces = 3,
        sound = 113,
        terrain_keep_speed_pct = 100,
      },
      ends_on_contact = {
        arrows = true,
        donor_cards = true,
        land = true,
        objects = true,
        water = true,
        worms = true,
      },
      explosion = {
        power = 30,
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
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.battle_axe",
    name = "Thumper Nade",
    panel_icon = "sprites/thumper_nade/thumpern_ico.png",
    sprite = "sprites/thumper_nade/flight.png",
    cluster = { sprite = "sprites/thumper_nade/cluster.png" },
    sprite_overrides = {
          wsvg = "sprites/thumper_nade/trail.png",                                -- 251
          wsvgu = "sprites/thumper_nade/cluster_trail.png",                       -- 252
        },
    worm_sprites = {
          weaponlnk = "sprites/thumper_nade/aim.png",
          weaponlnku = "sprites/thumper_nade/aimu.png",
          weaponlnkd = "sprites/thumper_nade/aimd.png",
          wthrow = "sprites/thumper_nade/draw.png",
          wthrowu = "sprites/thumper_nade/drawu.png",
          wthrowd = "sprites/thumper_nade/drawd.png",
        },
  })
end

return weapon
