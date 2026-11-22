-- Hang-Glider: a parachute that flies as a glider, steered with the arrow keys.

local weapon = {}

weapon.record = {
  handling = {
    remember_selection = true,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.parachute",
    name = "Hang-Glider",
    panel_icon = "sprites/hang_glider/ico_glider.png",
    sprites = { "sprites/hang_glider/glider.png", "sprites/hang_glider/pack.png" },
    sounds = { "sounds/hang_glider/hangopen.wav", "sounds/hang_glider/hangclose.wav" },
    params = {
      gpu_prefix = "sprites/hang_glider/",
      worm_art = { "sprites/hang_glider/glider.png", "sprites/hang_glider/pack.png" },
    },
  })
end

function weapon.setup()
  local shared = require("lib/shared")
  local own_time = require("wf-lib/own_time")
  local parachute = require("lib/parachute")
  parachute.setup()
  local STOPPERS = { { wa.worms, 6 }, { wa.mines, 4 }, { wa.crates, 10 }, { wa.oil, 9 } }
  shared.balloons = shared.balloons or {}
  local balloons = shared.balloons

  do

    local GLIDER_GRAVITY = 0.75 -- GliderGravityFactor
    local GLIDER_WIND = 3.0 -- GliderWindFactor
    local GLIDER_FRICTION = 0.25 -- GliderFriction
    local GLIDER_TURN = 0.06 -- GliderMaxAngularVelocity
    local GLIDER_TURN_SPEED = 20.0 -- GliderMaxTurningSpeed
    local GLIDER_ANIM = 0.04 -- GliderAnimSpeed
    local GLIDER_LERP = 0.03 -- GliderRotationLerp
    local GLIDER_PUSH = 0.02 -- GliderMoveAcceleration
    local GLIDER_MAX_ANGLE = 1.5 -- about 86 degrees either way
    local GLIDER_DEPTH = wa.depth.FRONT -- in front of worms and terrain
    local GLIDER_PACK_FRAMES, GLIDER_PACK_FPS = 6, 24
    local GLIDER_PACK_WAIT = 50
    local GLIDER_SET_DOWN_SPEED = 7
    local GLIDER_PI = 3.141593

    local gliders = {}
    local equipped_before = {}

    local function glider_of(worm)
      local g = gliders[worm.id]
      if not g then
        g = { enabled = false, deployed = false, ang = 0, target = 0, cycle = 0, sx = 0, sy = 0 }
        gliders[worm.id] = g
      end
      return g
    end

    local function normalize_angle(a)
      while a > GLIDER_PI do a = a - 6.283186 end
      while a <= -GLIDER_PI do a = a + 6.283186 end
      return a
    end

    local function lerp_angle(c, a, b)
      a = normalize_angle(a)
      b = a + normalize_angle(b - a)
      return normalize_angle(a + (b - a) * c)
    end

    local function glider_art(worm, x, y, sheet)
      local a = wa.actors.spawn({
        sprite = sheet, x = x, y = y, owner = worm, visibility = worm, on = function() end,
      })
      a:gfx({ glow_of = worm, follow = worm })
      return a
    end

    local function glider_drop_art(worm, g)
      if g.art then g.art:remove(); g.art = nil end
      if g.pack then g.pack:remove(); g.pack = nil end
      g.pack_x, g.pack_y = nil, nil
      worm.body_visible = true
    end

    local function glider_begin_pack(worm, g)
      g.landing = nil
      if g.art then g.art:remove(); g.art = nil end
      g.pack, g.pack_t = glider_art(worm, worm.x, worm.y, "sprites/hang_glider/pack.png"), 0
      g.pack_x, g.pack_y = worm.x, worm.y
      g.pack.facing = -worm.facing
      g.pack:frame(0)
      g.pack:gfx({ depth = GLIDER_DEPTH })
      worm.body_visible = false
    end

    local function glider_blocked(worm, x, y, sx, sy)
      local x1, y1 = x + (1.1 * sx), y + (1.1 * sy)
      local n = math.max(1, math.ceil(math.sqrt(sx * sx + sy * sy) * 1.1 / 2))
      for i = 1, n do
        if not worm:fits(x + (x1 - x) * i / n, y + (y1 - y) * i / n) then
          return true
        end
      end
      local len = math.sqrt(sx * sx + sy * sy) * 1.1
      if len == 0 then
        return false
      end
      local dx, dy = sx * 1.1 / len, sy * 1.1 / len
      for _, s in ipairs(STOPPERS) do
        local list, r = s[1], s[2]
        if list and list.all then
          for _, o in ipairs(list.all()) do
            if o.id ~= worm.id then
              local ox, oy = (o.x - x), (o.y - y)
              local t = ox * dx + oy * dy
              if t > 0 and t < len and math.abs(ox * dy - oy * dx) < r then
                return true
              end
            end
          end
        end
      end
      return false
    end

    local function glider_keys(worm, g)
      local k = worm.keys
      local speed = math.sqrt(g.sx * g.sx + g.sy * g.sy) / GLIDER_TURN_SPEED
      if k.up then
        g.ang = math.max(g.ang - GLIDER_TURN * math.min(speed, 1), -GLIDER_MAX_ANGLE)
      end
      if k.down then
        g.ang = math.min(g.ang + GLIDER_TURN * math.max(math.min(speed, 1), 0.5), GLIDER_MAX_ANGLE)
      end
      if k.left then g.sx = g.sx - GLIDER_PUSH end
      if k.right then g.sx = g.sx + GLIDER_PUSH end
    end

    local function glider_think(worm, g)
      local f = worm.facing
      local ang = f < 0 and g.ang or GLIDER_PI - g.ang
      local fwd_x, fwd_y = -wa.math.cos(ang), wa.math.sin(ang)
      local up_x, up_y
      if f < 0 then up_x, up_y = -fwd_y, fwd_x else up_x, up_y = fwd_y, -fwd_x end
      local sx, sy = g.sx, g.sy
      sy = sy + wa.world.gravity() * GLIDER_GRAVITY
      local wind = up_x * wa.world.wind() * GLIDER_WIND
      sx, sy = sx + wind * up_x, sy + wind * up_y
      local up_vel = sx * up_x + sy * up_y
      sx, sy = sx - up_x * up_vel * GLIDER_FRICTION, sy - up_y * up_vel * GLIDER_FRICTION
      local target = f < 0 and wa.math.atan(sy, -sx) or wa.math.atan(sy, sx)
      target = normalize_angle(target)
      g.target = math.max(-GLIDER_MAX_ANGLE, math.min(GLIDER_MAX_ANGLE, target))
      g.ang = lerp_angle(GLIDER_LERP, g.ang, g.target)
      g.cycle = math.min(g.cycle + GLIDER_ANIM, 1)
      g.sx, g.sy = sx, sy
    end

    local GLIDER_UNSTAND = 3

    local function glider_close(worm, g, landing)
      g.deployed = false
      local looks, err = pcall(function()
        if landing then
          g.art = g.art or glider_art(worm, worm.x, worm.y, "sprites/hang_glider/glider.png")
          worm.body_visible = false
        else
          glider_drop_art(worm, g)
        end
        wa.sound.play(worm, "sounds/hang_glider/hangclose.wav")
      end)
      if not looks then
        wa.log("hang glider: closing without its art: " .. tostring(err))
      end
      g.landing = landing and GLIDER_PACK_WAIT or nil
      g.unstand = not landing and GLIDER_UNSTAND or nil
      if worm.taken then
        worm:release(g.sx, g.sy)
      end
    end

    local function glider_frame(worm)
      local state = worm.state
      local opened = parachute.fired(worm, "px.hang_glider")
      if state ~= "parachuting" then equipped_before[worm.id] = worm.weapon end
      local equipped = equipped_before[worm.id]
      local b = balloons[worm.id]
      if b and b.active then
        local g = gliders[worm.id]
        if g then g.enabled = false end
        return
      end
      local g = gliders[worm.id]
      if opened == "landed" and not (g and g.deployed) then
        g = g or glider_of(worm)
        if g.pack then g.pack:remove(); g.pack = nil end
        glider_begin_pack(worm, g)
        wa.sound.play(worm, "sounds/hang_glider/hangclose.wav")
        worm:release(0, 0)
        return
      end
      if not g then
        if (state == "parachuting" and equipped ~= "px.hang_glider")
            or (state ~= "parachuting" and worm.weapon ~= "px.hang_glider") then
          return
        end
        g = glider_of(worm)
      end
      if g.deployed then
        if not worm.taken then
          glider_close(worm, g, false)
          return
        end
        for i = 1, own_time.frames(worm) do
          glider_keys(worm, g)
          glider_think(worm, g)
          if glider_blocked(worm, g.x, g.y, g.sx, g.sy) then
            local below = g.sy > 0 and not worm:fits(g.x, g.y + (1.1 * g.sy + 4))
            if below then g.sy = math.min(g.sy, GLIDER_SET_DOWN_SPEED) end
            if i > 1 then worm.x, worm.y = g.x, g.y end
            glider_close(worm, g, below)
            return
          end
          local x, y = g.x + g.sx, g.y + g.sy
          if y >= wa.world.water() then
            if i > 1 then worm.x, worm.y = g.x, g.y end
            glider_close(worm, g, false)
            return
          end
          g.x, g.y = x, y
        end
        local x, y = g.x, g.y
        worm:carry(x, y)
        local f = worm.facing
        g.art = g.art or glider_art(worm, x, y, "sprites/hang_glider/glider.png")
        local a = g.art
        a.x, a.y, a.vx, a.vy, a.facing = x, y, 0, 0, -f
        a:frame(math.min(math.floor(g.cycle * 10), 9))
        a:gfx({ angle = math.deg(f * g.ang) % 360, depth = GLIDER_DEPTH })
        worm.body_visible = false
        return
      end
      if state ~= "parachuting" then
        g.enabled = worm.weapon == "px.hang_glider"
        if g.unstand then
          if state == "standing" then
            worm:release(0, 0)
            g.unstand = nil
          else
            g.unstand = g.unstand > 1 and g.unstand - 1 or nil
          end
        end
        if g.landing then
          if state == "standing" and worm.y < wa.world.water() then
            glider_begin_pack(worm, g)
          elseif worm.y >= wa.world.water() or state == "tumbling" then
            g.landing = nil
            glider_drop_art(worm, g)
          else
            g.landing = g.landing > 1 and g.landing - 1 or nil
            if g.landing and g.art then
              g.art.x, g.art.y, g.art.vx, g.art.vy = worm.x, worm.y, 0, 0
              g.art.facing = -worm.facing
              worm.body_visible = false
            else
              glider_drop_art(worm, g)
            end
          end
        end
        if g.pack then
          local frame = g.pack_t * GLIDER_PACK_FPS // 50
          local keys = worm.keys or {}
          local moving = keys.left or keys.right or state == "walking"
            or state == "jump_prepare" or state == "jumping"
            or math.abs(worm.x - g.pack_x) > 1
          local landing_state = state == "standing" or state == "falling"
            or state == "jump_falling" or state == "falling"
          if frame >= GLIDER_PACK_FRAMES or moving or not landing_state
              or worm.y >= wa.world.water() then
            glider_drop_art(worm, g)
          else
            g.pack.x, g.pack.y, g.pack.vx, g.pack.vy = worm.x, worm.y, 0, 0
            g.pack.facing = -worm.facing -- its art faces left, as WA's worms do
            g.pack:frame(frame)
            g.pack:gfx({ depth = GLIDER_DEPTH })
            worm.body_visible = false
            g.pack_t = g.pack_t + own_time.frames(worm)
          end
        end
        g.sx, g.sy = worm.vx, worm.vy
        return
      end
      g.enabled = equipped == "px.hang_glider"
      if not g.enabled or g.deployed or state ~= "parachuting" then
        return -- a plain parachute, or the balloon
      end
      g.deployed, g.ang, g.target, g.cycle, g.landing, g.unstand = true, 0, 0, 0, nil, nil
      g.x, g.y = worm.x, worm.y
      if g.pack then g.pack:remove(); g.pack = nil end
      worm:take{ turn = "run", fire = true }
      wa.sound.play(worm, "sounds/hang_glider/hangopen.wav")
      return glider_frame(worm)
    end

    if wa.world.gravity and wa.world.wind then
      if wa.on.contact then
        wa.on.contact(function(worm, other)
          local g = gliders[worm.id]
          if g and g.landing and other.kind == "land" and worm.y < wa.world.water() then
            local keys = worm.keys or {}
            if keys.left or keys.right then
              g.landing = nil
              glider_drop_art(worm, g)
            else
              glider_begin_pack(worm, g)
            end
          end
        end)
      end
      wa.on.worm_message(function(worm, msg)
        if msg == wa.msg.FRAME_FINISH then
          glider_frame(worm)
          return
        end
        local g = gliders[worm.id]
        if g and g.pack and (msg == wa.msg.JUMP or msg == wa.msg.JUMP_UP) then
          glider_drop_art(worm, g)
          return
        end
        if not (g and g.deployed) then
          return
        end
        if msg == wa.msg.JUMP then
          glider_close(worm, g, false)
          return "eat"
        end
        if msg == wa.msg.FIRE_WEAPON and worm.weapon == "px.super_drill" then
          wa.sound.play(worm, 120) -- WA's can't-fire
          return "eat"
        end
      end, { msgs = { wa.msg.FRAME_FINISH, wa.msg.JUMP, wa.msg.JUMP_UP, wa.msg.FIRE_WEAPON } })
    end
  end
end

return weapon
