-- +N Seconds. Keep the component ID utilities.plus_ten so existing profiles
-- retain the weapon; its amount and activation rules are now profile options.
local MAX_MS = 3600000

return {
  defaults = {
    ammo = { round_start = 0 },
    delay = 0,
    crate = { chance_pct = 40, type = "utility" },
    on_collect = "use",
    after_use = "continue",
  },
  install = function(ctx)
    local id = ctx.id
    local seconds = ctx.option("seconds")
    local bonus_mode = ctx.option("bonus_mode")
    local stacking = bonus_mode == "stack"
    local retreat_collect = ctx.option("retreat_collect")
    local automatic = ctx.data.on_collect ~= "keep"
    local used, pending, started = {}, nil, false

    local function add_time(worm, count, retreat)
      if count <= 0 or (not stacking and used[worm.ammo_group]) then return false end
      local current = retreat and wa.world.retreat() or wa.world.turn_clock()
      local ms = math.min(current + seconds * count * 1000, MAX_MS)
      if retreat then
        if not wa.world.set_retreat(ms) then return false end
      else
        wa.world.set_turn_clock(ms)
      end
      used[worm.ammo_group] = true
      return true
    end

    local function activate(worm, count, retreat)
      local held = worm:ammo(id)
      if held == 0 then return 0 end
      if not stacking then count = 1 end
      if held > 0 then count = math.min(count, held) end
      if not add_time(worm, count, retreat) then return 0 end
      if held > 0 then worm:ammo(id, -count) end
      return count
    end

    local function discard_pickup(worm, count)
      -- Only remove newly awarded surplus, never older or infinite stock.
      local held = worm:ammo(id)
      if count > 0 and held > 0 then worm:ammo(id, -math.min(count, held)) end
    end

    local function collect(worm, count, retreat)
      local activated = activate(worm, count, retreat)
      if bonus_mode == "once_discard" then discard_pickup(worm, count - activated) end
    end

    wa.weapons.replace({
      copy_from = "stock.double_turn_time",
      name = "+N Seconds",
      panel_icon = "sprites/plus_n.png",
      on_fire = function(fire)
        -- Native firing spends one unit. Refund it when stacking is off and
        -- this team has already received its bonus during the current turn.
        if not add_time(fire.worm, 1, wa.world.retreat() > 0) then
          if fire.worm:ammo(id) >= 0 then fire.worm:ammo(id, 1) end
        end
      end,
    })

    wa.on.turn_cleanup(function()
      used, pending, started = {}, nil, false
    end)
    if not automatic then return end -- Every pickup stays in inventory.

    wa.on.turn_start(function(ev)
      -- Native setup initializes the clock after StartTurn returns.
      if not started then pending = ev.worm.id end
    end)
    wa.on.worm_message(function(worm)
      if pending == worm.id and worm.turn then
        pending, started = nil, true
        local held = worm:ammo(id)
        -- Infinite stock activates once, never an unbounded stack.
        activate(worm, held > 0 and held or 1, false)
      end
    end, { msgs = { wa.msg.FRAME_FINISH } })
    wa.on.weapon_grant(function(ev)
      local collector
      for _, worm in ipairs(wa.worms.all()) do
        if worm.id == ev.worm_id then collector = worm; break end
      end
      if not collector then return end
      for _, item in ipairs(ev.items) do
        if item.weapon == id and item.amount > 0 then
          local retreat = wa.world.retreat() > 0
          if not retreat then
            collect(collector, item.amount, false)
          elseif retreat_collect == "activate" then
            collect(collector, item.amount, true)
          elseif retreat_collect == "nothing" then
            discard_pickup(collector, item.amount)
          end -- "keep": bank the award for the next turn's automatic use.
        end
      end
    end)
  end,
}
