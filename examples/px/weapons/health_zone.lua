-- Health Zone: a thrown zone that heals the worm inside it or revives a grave; + heals, - damages.

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
