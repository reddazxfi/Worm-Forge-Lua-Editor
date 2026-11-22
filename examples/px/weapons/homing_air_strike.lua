-- Homing Air Strike: click a target; a jet drops five homing missiles that steer for it.

local ART = "sprites/homing_air_strike/"

return {
  defaults = {
    ammo = { round_start = -1 }, -- infinite, so it can be tested at once
    delay = 0,
  },
  install = function()
    wa.weapons.replace({
      wep = "weps/hairstrike_WEAP.wep",
      panel_icon = ART .. "ico_hairstrike.png", -- PX's icon
      sprite = ART .. "flight.png",
      handling = { ends_turn = true },
    })
  end,
}
