-- Bowling Ball Strike: drops three bowling balls that roll and crush what they hit.

local weapon = {}

weapon.record = {
  handling = {
    ends_turn = true,
  },
}

function weapon.definition()
  local shared = require("lib/shared")
  local fires = shared.fires
  return require("lib/weapon").merge(weapon.record, {
    wep = "weps/sheep_strike.wep",
    panel_icon = "sprites/bowling_ball/strike_icon.png",
    sprites = { "sprites/bowling_ball/ball.png", "sprites/bowling_ball/glow.png", "sprites/bowling_ball/spark.png",
          "sprites/bowling_ball/sheen.png" },
    params = { gpu_prefix = "sprites/bowling_ball/" },
    on_select = { cursor = true },
    on_click = function(ev) fires.bowling_strike(ev) end,
  })
end

weapon.requires = { "lib/bowling_balls" }

function weapon.setup()
  local shared = require("lib/shared")
  local fires = shared.fires
  local balls = require("lib/bowling_balls")
  local RADIUS, INERTIA_Y = balls.RADIUS, balls.INERTIA_Y
  local spawn_ball = shared.spawn_bowling_ball

  local STRIKE_BALLS = 3
  local STRIKE_SPACING = 48
  local STRIKE_SPEED = 5
  local STRIKE_Y = -128 -- PX's PlaneAppearYOffset
  local PLANE = "airjetb"
  local PLANE_SOUND = 52 -- WA's air strike sound (its Sound)
  local PLANE_EDGE = 16 -- PX's PlaneAppearXOffset

  local function drift(y0, y1, vx)
    local g = wa.world.gravity()
    if g <= 0 then return 0 end
    local x, y, vy, lvy = 0, y0, 0, 0
    for _ = 1, 3000 do
      if y >= y1 then break end
      local vy2 = vy + g
      x, y = x + vx, y + vy2
      vy = vy2 + INERTIA_Y * (vy2 - lvy)
      lvy = vy
    end
    return x
  end

  fires.bowling_strike = function(ev)
    local dir = (ev.vx or 0) < 0 and -1 or 1
    local y0 = STRIKE_Y
    local back = drift(y0, ev.y - RADIUS, STRIKE_SPEED * dir)
    local drops = {}
    for i = 1, STRIKE_BALLS do
      drops[i] = ev.x - back + (i - (STRIKE_BALLS + 1) / 2) * STRIKE_SPACING * dir
    end
    local width = wa.world.size().w
    local lead = 0
    while (dir > 0 and drops[1] - lead * STRIKE_SPACING > -PLANE_EDGE)
      or (dir < 0 and drops[1] + lead * STRIKE_SPACING < width + PLANE_EDGE) do
      lead = lead + 1
    end
    local x0 = drops[1] - lead * STRIKE_SPACING * dir
    local step = 0
    local plane = wa.actors.spawn({
      sprite = PLANE, x = x0, y = y0, owner = ev.worm,
      on = function(a)
        local k = step - lead + 1
        if k >= 1 and k <= STRIKE_BALLS then
          spawn_ball(ev.worm, drops[k], y0, STRIKE_SPEED * dir, 0)
        end
        step = step + 1
        a.x, a.y, a.vx, a.vy = x0 + step * STRIKE_SPACING * dir, y0, 0, 0
        if (dir > 0 and a.x > width + PLANE_EDGE) or (dir < 0 and a.x < -PLANE_EDGE) then
          a:remove()
        end
      end,
    })
    plane.facing = -dir
    wa.sound.play(plane, PLANE_SOUND)
  end
end

return weapon
