-- Highlander gameplay: deal hands, refresh turn ammo, and transfer loot on death.

local shared = require("lib/shared")
local POOLS = shared.POOLS
local arsenal = shared.arsenal
local dead_hands = shared.dead_hands
local dealt = shared.dealt
local describe = shared.describe
local revived_by_lightning = shared.revived_by_lightning

-- ----------------------------------------------------------------- rules

local function deal(worm)
  local cave = wa.world.cavern()
  for _, name in ipairs({ "offensive", "second", "movement" }) do
    local pool = POOLS[cave and "cave_" .. name or name]
    if #pool > 0 then
      arsenal:deal(worm, pool, 1)
    end
  end
  dealt[worm.id] = true
  wa.log(string.format(
    "highlander: worm %d dealt %s (%s map)",
    worm.id, describe(arsenal:list(worm)), cave and "cavern" or "open"
  ))
end

-- ---------------------------------------------------------------- crates

local POOLED = shared.POOLED
local is_pooled = {}
for _, id in ipairs(POOLED) do is_pooled[id] = true end
local crate_stock = {} -- [ammo_group][weapon] = copies

local function rows()
  local out, seen = {}, {}
  for _, live in ipairs(wa.worms.all()) do
    if not seen[live.ammo_group] then
      seen[live.ammo_group] = true
      out[#out + 1] = live
    end
  end
  return out
end

local function row_of(worm_id)
  local team_row
  for _, live in ipairs(wa.worms.all()) do
    if live.id == worm_id then return live.ammo_group end
    if team_row == nil and live.team == worm_id // 16 then team_row = live.ammo_group end
  end
  return team_row
end

local function count_crate_uses(live_rows, only)
  for _, live in ipairs(live_rows) do
    local stock = crate_stock[live.ammo_group]
    if stock then
      for _, name in ipairs(POOLED) do
        local s = stock[name]
        if s and (not only or only[name]) then
          local left = live:ammo(name)
          if left >= 0 and left < s then stock[name] = left > 0 and left or nil end
        end
      end
    end
  end
end

local function restore_crate_stock(live_rows, only)
  for _, live in ipairs(live_rows) do
    local stock = crate_stock[live.ammo_group]
    if stock then
      for _, name in ipairs(POOLED) do
        local s = stock[name]
        if s and (not only or only[name]) then
          local have = live:ammo(name)
          if have >= 0 then live:ammo(name, { set = have + s }) end
        end
      end
    end
  end
end

wa.on.weapon_grant(function(event)
  if event.source ~= "crate" then return end
  local row
  for _, item in ipairs(event.items) do
    if is_pooled[item.weapon] then
      row = row or row_of(event.worm_id)
      if row == nil then return end
      local stock = crate_stock[row] or {}
      crate_stock[row] = stock
      stock[item.weapon] = (stock[item.weapon] or 0) + item.amount
      wa.log(string.format(
        "highlander: worm %d's team keeps %d %s from a crate (%d in its stock)",
        event.worm_id, item.amount, item.weapon, stock[item.weapon]
      ))
    end
  end
end)

-- -------------------------------------------------------------- the turn

local function start_turn(worm)
  local live = rows()
  count_crate_uses(live)
  arsenal:apply(worm, { clear = true, each = 1 })
  restore_crate_stock(live)
end

local function on_death(event)
  local victim = event.victim
  local active = event.active
  revived_by_lightning[victim.id] = nil
  local mine = arsenal:list(victim)
  dead_hands[victim.id] = mine

  if active and active.id == victim.id then
    local live = rows()
    count_crate_uses(live)
    arsenal:clear(victim)
    arsenal:apply(victim, { clear = true, each = 1 })
    restore_crate_stock(live)
    wa.log(string.format("highlander: worm %d died on its own turn", victim.id))
    return
  end

  if not active or active.hp <= 0 then
    return
  end
  arsenal:transfer(victim, active, {
    weapons = "all", mode = "move", x = victim.x, y = victim.y,
  })
  local stolen = {}
  for _, name in ipairs(mine) do stolen[name] = true end
  count_crate_uses({ active }, stolen)
  arsenal:apply(active, { weapons = mine, each = 1 })
  restore_crate_stock({ active }, stolen)
  wa.log(string.format(
    "highlander: worm %d took %s from worm %d",
    active.id, describe(mine), victim.id
  ))
end

wa.on.worm_message(function(worm, msg)
  if not dealt[worm.id] then
    deal(worm)
  end
end, { msgs = { wa.msg.FRAME_FINISH, wa.msg.START_TURN } })

shared.fresh_hand = function(worm)
  arsenal:clear(worm)
  dealt[worm.id] = nil
  dead_hands[worm.id] = nil
  revived_by_lightning[worm.id] = nil
end

wa.on.turn_start(function(event)
  start_turn(event.worm)
end)

wa.on.death(on_death)

