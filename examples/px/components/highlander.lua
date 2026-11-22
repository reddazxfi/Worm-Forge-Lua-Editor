-- Highlander rules: each worm gets one weapon per pool and takes a killed worm's hand.

local shared = require("lib/shared")

local function pools_from(placed)
  local out = {
    offensive = {}, second = {}, movement = {},
    cave_offensive = {}, cave_second = {}, cave_movement = {},
  }
  for _, w in ipairs(placed) do
    local pool = w.options.pool
    if out[pool] then
      table.insert(out[pool], w.id)
      if w.options.cavern then
        table.insert(out["cave_" .. pool], w.id)
      end
    end
  end
  return out
end

return {
  install = function(ctx)
    require("components/loader").place(ctx)
    local pools = pools_from(ctx.placed)
    if #pools.offensive + #pools.second + #pools.movement == 0 then
      wa.log("highlander: no placed weapon is in a pool, so nothing is dealt")
      return
    end
    shared.pools = pools
    require("scheme/pools")
    require("scheme/state")
    require("scheme/highland_rules")
  end,
}
