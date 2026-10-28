-- Health Zone: PX's zone launcher. This is the entry point the component's
-- install runs; the port itself is lib/px_health_zone.lua, which needs `wa` and
-- so is loaded here rather than at load (REPORT.md 11.11).

local health_zone = require("lib/px_health_zone")

return {
  defaults = {
    ammo = { round_start = -1 },
    delay = 0,
  },
  install = function(ctx)
    health_zone.install(ctx)
  end,
}
