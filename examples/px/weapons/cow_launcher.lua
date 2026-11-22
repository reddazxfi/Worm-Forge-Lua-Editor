-- Cow Launcher: launches a mad cow; hold fire to charge.

local weapon = {}

weapon.record = {
  fires = {
    launch_power_pct = 50,
    method = 3,
    subtype = 3,
    type = 1,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.mad_cow",
    name = "Cow Launcher",
    panel_icon = "sprites/launchers/cow_launcher_ico.png",
  })
end

function weapon.configure(ctx, spec)
  if ctx.option("charged") then
    spec.fires.launch_power_pct = "charged"
  end
end

return weapon
