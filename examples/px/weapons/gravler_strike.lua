-- Gravler Strike: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  missile = {
    animation = 2,
    countdown = 3000,
    dig = {
      dive_sprite = 245,
      sprite_1 = 246,
      sprite_2 = 247,
      sprite_3 = 248,
    },
    ends_on_contact = {
      donor_cards = true,
      objects = true,
      worms = true,
    },
    explosion = {
      power = 37,
    },
    fuse = 5000,
    gravity_pct = 90,
    random_motion = 12,
    sprite = 245,
    trail = {
      power = 0,
      speed = 0,
      sprite = 0,
    },
  },
  strike = {
    count = 4,
    munition_speed = 1.1,
    spacing = 15,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.mole_squadron",
    name = "Gravler Strike",
    panel_icon = "sprites/gravler/gravlerst_ico.png",
    sprite_overrides = {
          wsvr = "sprites/gravler/gravlerdive.png",                                -- 245
          wsvru = "sprites/gravler/gravlerdiga.png",                               -- 246
          wsvrd = "sprites/gravler/gravlerdigb.png",                               -- 247
          wsvb = "sprites/gravler/gravlerdigc.png",                                -- 248
        },
  })
end

return weapon
