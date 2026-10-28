-- Super Drill: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  drill = {
    duration_ms = 2000,
  },
}

weapon.defaults = {
  mid_air = false,
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.pneumatic_drill",
    name = "Super Drill",
    panel_icon = "sprites/super_drill/ico_superdrill.png",
  })
end

function weapon.setup()
  local shared = require("lib/shared")

  -- The two with a script of their own. Both run from worm messages, which WA
  -- sends in lockstep on every peer and in replays.

  -- Super Drill (PX weapon_super_drill): WA keeps drilling as it always does,
  -- and a hidden actor cuts a second hole at the worm each frame until WA's
  -- drill stops. The same as the super_drill example.
  local drills = {}

  local function follow_drill(worm, id)
    local started, waiting = false, 0
    return function(a)
      if worm.drilling then
        started = true
        wa.land.cut({ x = worm.x, y = worm.y, shape = "drill" })
        return
      end
      -- WA enters its drilling state a few frames after the shot.
      if not started and waiting < 4 then
        waiting = waiting + 1
        return
      end
      drills[id] = nil
      a:despawn()
    end
  end

  shared.drills = drills
  shared.follow_drill = follow_drill
end

return weapon
