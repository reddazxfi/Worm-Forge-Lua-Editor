-- Skip Go/Surrender: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.skip_go",
    name = "Skip Go/Surrender",
    panel_icon = "sprites/skip_go/icon.png",
    stock_fire_choice = { held = "ctrl", alternate = "stock.surrender" },
  })
end

return weapon
