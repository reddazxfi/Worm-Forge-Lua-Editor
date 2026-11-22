-- Security Grenade: a grenade whose blast is ringed by eight more blasts, 60 pixels out.

local grenade = require("lib/px_security_grenade")

return {
  defaults = {
    ammo = { round_start = -1 },
    delay = 0,
  },
  install = function(ctx)
    grenade.install(ctx)
  end,
}
