-- Ninja Star: PX's thrown star. This is the entry point the component's install
-- runs; the port itself is lib/px_ninja_star.lua, which needs `wa` and so is
-- loaded here rather than at load (REPORT.md 11.11).

local star = require("lib/px_ninja_star")

return {
  defaults = {
    ammo = { round_start = -1 },
    delay = 0,
  },
  install = function(ctx)
    star.install(ctx)
  end,
}
