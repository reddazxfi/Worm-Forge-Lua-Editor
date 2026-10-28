-- Security Grenade: PX's grenade that bursts in a ring. This is the entry point
-- the component's install runs; the port itself is lib/px_security_grenade.lua,
-- which needs `wa` and so is loaded here rather than at load (REPORT.md 11.11).

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
