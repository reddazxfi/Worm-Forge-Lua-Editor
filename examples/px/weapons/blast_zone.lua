-- Blast Zone: a thrown zone that explodes whenever a worm or object is inside it.

local blast_zone = require("lib/px_blast_zone")

return {
  defaults = {
    ammo = { round_start = -1 },
    delay = 0,
  },
  install = function(ctx)
    blast_zone.install(ctx)
  end,
}
