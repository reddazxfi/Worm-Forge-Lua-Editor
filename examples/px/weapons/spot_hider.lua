-- Spot Hider: a thrown zone that hides the spot it lands on in darkness for four turns.

local spot_hider = require("lib/px_spot_hider")

return {
  defaults = {
    ammo = { round_start = -1 },
    delay = 0,
  },
  install = function(ctx)
    spot_hider.install(ctx)
  end,
}
