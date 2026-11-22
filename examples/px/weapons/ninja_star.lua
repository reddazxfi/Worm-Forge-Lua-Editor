-- Ninja Star: a thrown star that sticks in the land or bites what it hits for 10 damage.

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
