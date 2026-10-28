-- Blast Zone: PX's zone launcher, the exploding half of the pair. This is the
-- entry point the component's install runs; the port itself is
-- lib/px_blast_zone.lua, which needs `wa` and so is loaded here rather than at
-- load (REPORT.md 11.11).

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
