-- Highlander: the scheme's state.

local shared = require("lib/shared")
local POOLED = shared.POOLED

-- ----------------------------------------------------------------- state

local arsenal = wa.inventory.create({ id = "arsenal", slots = POOLED })
local dealt = {}
local dead_hands = {}
shared.revived_by_lightning = shared.revived_by_lightning or {}
local revived_by_lightning = shared.revived_by_lightning

shared.restore_lightning_inventory = function(worm)
  local hand = dead_hands[worm.id]
  if not hand then return end
  arsenal:clear(worm)
  for _, weapon in ipairs(hand) do arsenal:add(worm, weapon, 1) end
  dealt[worm.id] = true
  dead_hands[worm.id] = nil
end

local function describe(list)
  if not list or #list == 0 then
    return "(nothing)"
  end
  return table.concat(list, ", ")
end

shared.arsenal = arsenal
shared.dead_hands = dead_hands
shared.dealt = dealt
shared.describe = describe
shared.revived_by_lightning = revived_by_lightning
