-- Priceless Ming Vase: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.ming_vase",
    name = "Priceless Ming Vase",
  })
end

return weapon
