-- Map bee swarm: seeds the map with rogue bees on the first turn, one per slice.

local bee = require("lib/bee")

return function(ctx)
  bee.install_swarm(ctx)
end
