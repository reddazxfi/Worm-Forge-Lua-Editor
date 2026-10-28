-- Gravler: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  fires = {
    launch_power_pct = "charged",
    method = 3,
    subtype = 3,
    type = 1,
  },
  handling = {
    retreat = 3000,
  },
  missile = {
    action = "dig",
    animation = 2,
    burst = "nothing",
    dig = {
      dive_sprite = 245,
      sound = 65574,
      sprite_1 = 246,
      sprite_2 = 247,
      sprite_3 = 248,
    },
    ends_on_contact = {
      crates = true,
      donor_cards = true,
      objects = true,
      worms = true,
      worms_frozen = true,
    },
    explode_on_space = false,
    explosion = {
      power = 40,
      push_pct = 110,
    },
    flight_sound = 0,
    fuse = 20000,
    gravity_pct = 85,
    sprite = 245,
    trail = {
      speed = 0,
      sprite = 0,
    },
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.mole_bomb",
    name = "Gravler",
    panel_icon = "sprites/gravler/gravler_ico.png",
    sprite_overrides = {
          wsvr = "sprites/gravler/gravlerdive.png",                                -- 245
          wsvru = "sprites/gravler/gravlerdiga.png",                               -- 246
          wsvrd = "sprites/gravler/gravlerdigb.png",                               -- 247
          wsvb = "sprites/gravler/gravlerdigc.png",                                -- 248
        },
    worm_sprites = {
          weaponlnk = "sprites/gravler/aim.png",
          weaponlnku = "sprites/gravler/aimu.png",
          weaponlnkd = "sprites/gravler/aimd.png",
          wthrow = "sprites/gravler/draw.png",
          wthrowu = "sprites/gravler/drawu.png",
          wthrowd = "sprites/gravler/drawd.png",
        },
  })
end

return weapon
