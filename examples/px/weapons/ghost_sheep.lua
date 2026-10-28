-- Ghost Sheep: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  handling = {
    retreat = 5000,
  },
  missile = {
    countdown = 8000,
    explosion = {
      power = 90,
    },
    fuse = 8000,
    roam = {
      flight_hits = {},
      hits = {
        crates = true,
        donor_cards = true,
        land = true,
        objects = true,
        worms = true,
        worms_frozen = true,
      },
    },
    trail = {
      bubbles_per_second = 12.5,
    },
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.aqua_sheep",
    name = "Ghost Sheep",
    panel_icon = "sprites/ghost_sheep/ghost_sheep_ico.png",
    sheep_sprites = { "sprites/ghost_sheep/ghstshp1.png", "sprites/ghost_sheep/ghstshp2.png" },
  })
end

return weapon
