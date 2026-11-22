-- Bunker Buster / Super Bunker Buster: the component's entry point.

local bunker = require("lib/px_bunker")

return {
  defaults = {
    ammo = { round_start = -1 }, -- infinite, so it can be tested at once
    delay = 0,
  },
  install = function(ctx) bunker.install(ctx) end,
}
