-- Keeper Bee: reddaz's bee launcher. This is the entry point the component's
-- install runs; the port itself is lib/bee.lua, which needs `wa` and so is
-- loaded here rather than at load.

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
