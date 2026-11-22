-- Highlander: the weapon pools.

local shared = require("lib/shared")

local pools = assert(shared.pools, "scheme/pools: components/highlander.lua sets the pools")

local POOLED, seen = {}, {}
for _, name in ipairs({ "offensive", "second", "movement" }) do
  for _, id in ipairs(pools[name]) do
    if not seen[id] then
      seen[id] = true
      POOLED[#POOLED + 1] = id
    end
  end
end

shared.POOLS = pools
shared.POOLED = POOLED
