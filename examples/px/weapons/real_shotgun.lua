-- Real Shotgun: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  gun = {
    burst_spread_deg = 10,
    explosion = {
      push_pct = 150,
      variation = 75,
    },
    hits = {
      crates = true,
      donor_cards = true,
      land = true,
      mines = true,
      missiles = true,
      objects = true,
      water = true,
      worms = true,
      worms_frozen = true,
    },
    spread_deg = 10,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.shotgun",
    name = "Real Shotgun",
    panel_icon = "sprites/real_shotgun/real_shotgun_ico.png",
    fire_repeat = 5,
  })
end

return weapon
