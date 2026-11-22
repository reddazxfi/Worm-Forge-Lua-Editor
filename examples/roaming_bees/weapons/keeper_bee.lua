-- Keeper Bee: fires a bee that hunts the worm whose turn it is, stings it, lifts it and bursts.

local bee = require("lib/bee")

return {
  defaults = {
    ammo = { round_start = -1 },
    delay = 0,
  },
  install = function(ctx)
    bee.install_weapon(ctx)
  end,
}
