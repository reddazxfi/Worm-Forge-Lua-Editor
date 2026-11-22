-- Kamikaze Rocket: Ctrl + Space turns the worm into a steerable rocket for four seconds.

local weapon = {}

weapon.record = {
  handling = {
    ends_turn = true,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    wep = "weps/suicide_bomber.wep",
    panel_icon = "sprites/kamikaze_rocket/icon.png",
        worm_sprites = {
          wkamlnk = "sprites/kamikaze_rocket/take_out.png", wkamlnku = "sprites/kamikaze_rocket/take_out.png",
          wkamlnkd = "sprites/kamikaze_rocket/take_out.png", wkamjmp = "sprites/kamikaze_rocket/launch.png",
        },
    sprites = { "sprites/kamikaze_rocket/fly.png" },
    params = { gpu_prefix = "sprites/kamikaze_rocket/" },
  })
end

function weapon.setup()
  local shared = require("lib/shared")
  local SPEED = 8 -- px a frame (kRocketSpeed)
  local TURN = 0.05 -- PX angle units (times pi) a frame
  local LIFE = 4000 -- ms, less 20 a frame: 200 frames
  local HOLE = 8 -- MakeHole each frame
  local BOOM = { damage = 30, id = 100 }
  local STALE = 200 -- other worms' frames without one of its own
  local FLY = "sprites/kamikaze_rocket/fly.png"
  local FLY_FRAMES, FLY_HALF_W, FLY_HALF_H = 5, 30, 40
  local DEPTH = wa.depth.FRONT

  local rockets = {} -- worm id -> its rocket
  local armed = {}

  local function launch(worm)
    rockets[worm.id] = {
      worm = worm,
      x = worm.x, y = worm.y, angle = worm.aim * worm.facing, life = LIFE, age = 0,
      facing = worm.facing, stale = 0,
    }
    worm.visible = false
  end

  local function finish(worm)
    rockets[worm.id] = nil
    worm.visible = true
  end

  local function fly(worm, r)
    local keys = wa.world.keys()
    if keys.left then r.angle = r.angle + TURN end
    if keys.right then r.angle = r.angle - TURN end
    local a = r.angle * math.pi
    r.vx, r.vy = SPEED * wa.math.sin(a), SPEED * wa.math.cos(a)
    r.x = r.x + r.vx
    r.y = r.y + r.vy
    worm.x, worm.y = r.x, r.y
    r.age = r.age + 1
    r.life = r.life - 20
    if r.life <= 0 then
      local boom = wa.actors.spawn({
        sprite = false, x = r.x, y = r.y, owner = worm,
        on = function() end,
      })
      boom:explode(BOOM)
      boom:remove()
      worm.x, worm.y = -2500, wa.world.water() + 1000
      r.done = true
      return
    end
    wa.land.cut({ x = r.x, y = r.y, shape = "circle", radius = HOLE })
  end

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FIRE_WEAPON then
      if worm.weapon ~= "px.kamikaze_rocket" then return end
      if not wa.world.keys().ctrl then
        require("lib/weapon_hint").notice(worm, "Hold Ctrl and press Space\nto use the Kamikaze Rocket.")
        return "eat"
      end
      armed[worm.id] = true
      return
    end
    for id, other in pairs(rockets) do
      if id ~= worm.id then
        other.stale = other.stale + 1
        if other.stale > STALE then rockets[id] = nil end
      end
    end
    local r = rockets[worm.id]
    if r then r.stale = 0 end
    if worm.state == "kamikaze" then
      if not r and armed[worm.id] then
        armed[worm.id] = nil
        launch(worm)
        r = rockets[worm.id]
      end
      if r and not r.done then fly(worm, r) end
    elseif r then
      finish(worm)
    end
  end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })

  wa.on.turn_start(function()
    armed = {}
  end)

  if wa.on.hud then
    wa.on.hud(function()
      for _, id in ipairs(wa.sorted(rockets)) do
        local r = rockets[id]
        if not r.done then
          wa.hud.line(string.format("Kamikaze Rocket: %.2f", math.max(0, r.life) / 1000))
        end
      end
    end)
  end

  if wa.on.draw and wa.draw.quad then
    local QUAD = { sprite = FLY, blend = "alpha", color = 0xFFFFFFFF, depth = DEPTH,
      points = { { 0, 0 }, { 0, 0 }, { 0, 0 }, { 0, 0 } } }
    local CORNERS = { { -1, -1 }, { 1, -1 }, { 1, 1 }, { -1, 1 } }
    wa.on.draw(function()
      for _, id in ipairs(wa.sorted(rockets)) do
        local r = rockets[id]
        if not r.done then
          QUAD.visibility = r.worm
          local t = -r.angle * math.pi
          local c, s = wa.math.cos(t), wa.math.sin(t)
          local flip = r.facing > 0 and -1 or 1
          QUAD.frame = (r.age // 10) % FLY_FRAMES
          for i, k in ipairs(CORNERS) do
            local dx, dy = k[1] * flip * FLY_HALF_W, k[2] * FLY_HALF_H
            QUAD.points[i][1] = r.x + (dx * c - dy * s)
            QUAD.points[i][2] = r.y + (dx * s + dy * c)
          end
          wa.draw.quad(QUAD)
        end
      end
    end)
  end

  shared.kamikaze_rockets = rockets -- for the Highlander mock
end

return weapon
