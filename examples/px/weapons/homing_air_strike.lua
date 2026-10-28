-- Homing Air Strike: Worms 2's, as Project X carries it. A record weapon:
-- PX's library has no script for it, only the record and its art.
--
-- The record is PX's own (`hairstrike_WEAP.wep`, the same in its library and
-- in both schemes that carry it): WA's Air Strike with homing missiles, five
-- of them, a weaker blast each (18 to WA's 30), arming 250 ms after the drop
-- and steering for 3.5 seconds.
--
-- The missiles' art is the KAOS scheme's `hairmsl.png` (PX's Rubber Mole
-- scheme keeps WA's airmisl). PX lays its 32 frames left to right, pointing
-- right and turning anticlockwise; `flight.png` is the same frames top to
-- bottom in airmisl's order, pointing up and turning clockwise. The record's
-- homing frame (+0xC0) names the bomb's sprite, so the engine moves it to
-- the pack sheet too: the missiles keep their art while they home.

local ART = "sprites/homing_air_strike/"

return {
  defaults = {
    ammo = { round_start = -1 }, -- infinite, so it can be tested at once
    delay = 0,
  },
  install = function()
    wa.weapons.replace({
      wep = "weps/hairstrike_WEAP.wep",
      panel_icon = ART .. "ico_hairstrike.png", -- PX's own
      sprite = ART .. "flight.png",
      -- PX's records carry ends-the-turn off, and it is a profile's
      -- setting: a weapon built on one says so itself, as WA's strikes do.
      handling = { ends_turn = true },
    })
  end,
}
