-- The map's bee swarm: an add-on, so the two settings the profile owns
-- (`spawn.bees.swarm`'s options) have a home. It seeds the map once, on the
-- first turn -- the API 2 script did it from a worm-message frame counter.
-- Its bees are rogue (`rogue = true`): they chase whichever worm is moving,
-- their owner's team included.

local bee = require("lib/bee")

return function(ctx)
  bee.install_swarm(ctx)
end
