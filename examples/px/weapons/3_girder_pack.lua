-- 3 Girder Pack: places three girders in one go.

local weapon = {}

weapon.record = {
  handling = {
    remember_selection = true,
    shots = 3,
  },
}

weapon.defaults = {
  placement = "girder_pack",
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.girder_pack",
    name = "3 Girder Pack",
  })
end

return weapon
