-- Shared land-cursor lifetime. All actions run in synchronized simulation
-- callbacks; drawing and HUD callbacks never perform them.
local M = {}

function M.install(ctx, spec)
  local cursor, owner
  local function selected(worm)
    return worm and worm.turn and worm.hp > 0 and worm.weapon == ctx.id
  end
  local function stop()
    if spec.stop then spec.stop(cursor) end
    if cursor then cursor:despawn(); cursor = nil end
    owner = nil
  end
  local function start(worm, x, y)
    stop()
    if not worm or not worm.turn or worm.hp <= 0 then return end
    owner = worm
    cursor = wa.cursor.spawn{
      owner = worm, x = x, y = y,
      on = function(a)
        if not selected(worm) then stop(); return end
        if spec.frame then spec.frame(a, worm) end
      end,
    }
    if spec.start then spec.start(cursor, worm) end
  end

  wa.weapons.replace{
    copy_from = "stock.teleport",
    name = spec.name,
    panel_icon = spec.icon or "teleport",
    is_weapon = true,
    eat_fire = true,
    click_finish = false,
    handling = { ends_turn = false, remember_selection = true },
    on_select = {
      cursor = true,
      on = function(sel) start(sel.worm, sel.x, sel.y) end,
    },
    on_click = function(ev)
      if spec.click and cursor and selected(owner) and ev.worm.id == owner.id then
        spec.click(ev)
      end
    end,
  }
  wa.on.turn_start(function(ev)
    stop()
    if selected(ev.worm) then
      local p = wa.world.pointer()
      start(ev.worm, p.x, p.y)
    end
  end)
  wa.on.turn_end(stop)
end

-- Use native entity order to break ties, identically on every peer.
function M.nearest(objects, x, y, eligible)
  local best, best_d
  for _, obj in ipairs(objects) do
    if eligible(obj) then
      local dx, dy = obj.x - x, obj.y - y
      local d = dx * dx + dy * dy
      if d <= 24 * 24 and (not best_d or d < best_d) then
        best, best_d = obj, d
      end
    end
  end
  return best
end

return M
