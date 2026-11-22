-- Super Drill: a pneumatic drill that cuts a hole twice as wide.

local weapon = {}

weapon.record = {
  drill = {
    duration_ms = 2000,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.pneumatic_drill",
    name = "Super Drill",
    panel_icon = "sprites/super_drill/ico_superdrill.png",
  })
end

function weapon.setup()
  local drills = {}

  local function follow_drill(worm, id)
    local started, waiting = false, 0
    return function(a)
      if worm.drilling then
        started = true
        wa.land.cut({ x = worm.x, y = worm.y, shape = "drill" })
        return
      end
      if not started and waiting < 4 then
        waiting = waiting + 1
        return
      end
      drills[id] = nil
      a:remove()
    end
  end

  wa.on.worm_message(function(worm, msg)
    if worm.weapon == "px.super_drill" and not drills[worm.id]
        and worm:ammo("px.super_drill") ~= 0 then
      local id = worm.id
      drills[id] = wa.actors.spawn({
        sprite = false, x = worm.x, y = worm.y,
        owner = worm,
        on = follow_drill(worm, id),
      })
    end
  end, { msgs = { wa.msg.FIRE_WEAPON } })
end

return weapon
