-- Old Woman Launcher: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  fires = {
    launch_power_pct = 50,
    method = 3,
    subtype = 3,
    type = 1,
  },
}

function weapon.definition()
  local shared = require("lib/shared")
  local fires = shared.fires
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.old_woman",
    name = "Old Woman Launcher",
    panel_icon = "sprites/launchers/old_woman_launcher_ico.png",
    on_fire = function(fire) fires.old_woman(fire) end,
  })
end

function weapon.setup()
  local fires = require("lib/shared").fires
  do
    -- reddaz's launch point search, playtested by him. A point is clear when
    -- it and 8 points on a 3-pixel circle around it are free of land, and the
    -- worm can see it (nothing between them, so never the far side of a thin
    -- wall the muzzle poked through). The muzzle is tried first, then rings
    -- every 4 pixels out to 40, at finer angles the wider the ring; failing
    -- all, she starts at the worm.
    local CLEAR = 3
    local REACH = 40
    local RING = 4

    local function clear(x, y)
      if wa.land.solid(x, y) then return false end
      for i = 0, 7 do
        local a = (i / 8) * 2 * math.pi
        if wa.land.solid(x + (CLEAR * wa.math.cos(a)), y + (CLEAR * wa.math.sin(a))) then
          return false
        end
      end
      return true
    end

    local function launch_point(x, y, w)
      local r = 0
      while r <= REACH do
        local step = (r == 0) and 360 or math.max(15, math.floor(360 / (r / 2)))
        local deg = 0
        while deg < 360 do
          local a = deg * math.pi / 180
          local tx, ty = x + (r * wa.math.cos(a)), y + (r * wa.math.sin(a))
          if clear(tx, ty) then
            local hit = wa.land.trace(tx, ty, w.x, w.y)
            if not hit or not hit.hit then return tx, ty end
          end
          deg = deg + step
        end
        r = r + RING
      end
      return w.x, w.y
    end

    fires.old_woman = function(fire)
      local w = fire.worm
      local x, y = launch_point(fire.x, fire.y, w)
      wa.weapons.launch({ weapon = "px.old_woman_launcher", owner = w,
        x = x, y = y, vx = fire.vx, vy = fire.vy, missile = { fuse = 5000 } })
    end
  end
end

return weapon
