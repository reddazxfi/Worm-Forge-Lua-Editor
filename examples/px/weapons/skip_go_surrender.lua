-- Skip Go/Surrender: Space skips the turn; Ctrl + Space surrenders.

local weapon = {}

weapon.record = {}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.skip_go",
    name = "Skip Go/Surrender",
    panel_icon = "sprites/skip_go/icon.png",
    stock_fire_choice = { held = "ctrl", alternate = "stock.surrender" },
  })
end

function weapon.setup()
  require("lib/weapon_hint").hint("px.skip_go_surrender", function()
    return "Skip Go/Surrender\nSpace: skip go\nCtrl + Space: surrender"
  end)
end

return weapon
