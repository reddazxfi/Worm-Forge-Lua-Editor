-- Helicopter: a jet pack flown as a helicopter: arrow keys steer, and a fast landing crashes it.

local weapon = {}

weapon.record = {
  handling = {
    retreat = -1,
  },
  jet_pack = {
    fuel = 100,
  },
}

weapon.defaults = { crate = { type = "utility" }, donor_card = true }

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.jet_pack",
    name = "Helicopter",
    panel_icon = "sprites/helicopter/heli_ico.png",
    sprites = { "sprites/helicopter/flying.png", "sprites/helicopter/jumpin.png" },
    sounds = {
          "sounds/helicopter/helicopterloop.wav",
          "sounds/helicopter/1.wav", "sounds/helicopter/2.wav", "sounds/helicopter/3.wav",
          "sounds/helicopter/4.wav",
          "sounds/helicopter/oops1.wav", "sounds/helicopter/oops2.wav", "sounds/helicopter/huh.wav",
          "sounds/helicopter/poop.wav", "sounds/helicopter/idiot.wav",
        },
    params = {
      gpu_prefix = "sprites/helicopter/",
      worm_art = { "sprites/helicopter/flying.png", "sprites/helicopter/jumpin.png" },
    },
  })
end

function weapon.setup()
  local shared = require("lib/shared")

  local trunc
  do
  local own_time = require("wf-lib/own_time")

  local HELI_REALISTIC = true -- gravity and wind act on it, at 0.2
  local HELI_EXPLODE_ON_TURN_END = true
  local HELI_DEPTH = wa.depth.FRONT -- in front of worms and terrain

  local helis = {}

  function trunc(v)
    return v >= 0 and math.floor(v) or math.ceil(v)
  end

  local function heli_of(worm)
    local h = helis[worm.id]
    if not h then
      h = { flying = false, launch = false, jumpin = false, jump_phase = 0, frame = 0, ticks = 0 }
      helis[worm.id] = h
    end
    return h
  end

  local function heli_actor(worm, sheet)
    local a = wa.actors.spawn({
      sprite = sheet, x = worm.x, y = worm.y, owner = worm, visibility = worm, on = function() end,
    })
    a:gfx({ glow_of = worm, follow = worm })
    return a
  end

  local function heli_drop_art(h, worm)
    if h.body then h.body:remove(); h.body = nil end
    if h.climb then h.climb:remove(); h.climb = nil end
    worm.body_visible = true
  end

  local HELI_OOPS = {
    [2] = "sounds/helicopter/oops1.wav", [4] = "sounds/helicopter/oops2.wav",
    [6] = "sounds/helicopter/huh.wav", [8] = "sounds/helicopter/poop.wav",
    [10] = "sounds/helicopter/idiot.wav",
  }

  local function heli_crash(worm, h, sx, sy)
    if not h.flying then
      return
    end
    local speed = (math.abs(sy) + math.abs(sx)) / 2
    local size = trunc((worm.fuel - 75) / 10 * speed)
    if size < 10 then size = 10 end
    wa.actors.spawn({
      sprite = false, x = worm.x, y = worm.y, owner = worm, explode = { damage = size * 2, id = size, now = true },
    })
    worm.gravity = 1
    worm.wind = 0
    local oops = HELI_OOPS[wa.random(1, 10)]
    if oops then wa.sound.play(worm, oops) end
    h.flying = false
    heli_drop_art(h, worm)
  end

  local function push(v, dir)
    local s = -dir * v
    if s > -1 then s = s - 0.2 end
    if s > -4 then s = s - 0.4 end
    if s > -8 then s = s - 0.15 end
    if s > -10 then s = s - 0.05 end
    return -dir * s
  end

  local function heli_frame(worm)
    local h = helis[worm.id]
    local state = worm.state
    if worm.weapon == "px.helicopter" and state == "prefiring" and not (h and h.flying) then
      h = heli_of(worm)
      h.jumpin, h.armed = true, true
      h.jump_phase = h.jump_phase + 0.047 * own_time.frames(worm)
    end
    if h and h.armed and state == "jetpacking" and not h.flying then
      local fuel = shared.helicopter_fuel or 100
      worm.fuel = fuel == 0 and 1 or fuel -- unlimited: held at 1
      worm.gravity = HELI_REALISTIC and 0.2 or 0
      worm:jetpack_steer(true)
      h.flying, h.launch, h.ticks, h.armed = true, true, 0, false
    elseif h and h.armed and not worm.turn then
      h.armed = false -- the turn ended before it fired
    end
    if not h then
      return
    end
    if h.flying and state ~= "jetpacking" then
      worm:jetpack_steer(false)
      worm.gravity, worm.wind = 1, 0
      h.flying = false
      if state ~= "standing" then
        heli_drop_art(h, worm)
        return
      end
      if h.body then h.body:remove(); h.body = nil end
      h.climb_out, h.jump_phase = true, 1
    end
    if h.flying then
      for i = 1, own_time.frames(worm) do
        local vx, vy = worm.vx, worm.vy
        if vx ~= 0 or vy ~= 0 then
          if h.ticks % 47 == 0 then wa.sound.play(worm, "sounds/helicopter/helicopterloop.wav") end
          local radio = wa.random(1, 200)
          if radio % 20 == 0 and radio <= 80 then
            wa.sound.play(worm, "sounds/helicopter/" .. (radio // 20) .. ".wav")
          end
        end
        h.ticks = h.ticks + 1
        if i == 1 and worm.y >= wa.world.water() then
          heli_crash(worm, h, vx, vy)
          return
        end
        if h.launch then
          h.jump_phase, h.jumpin, h.launch = 0, false, false
          if HELI_REALISTIC then worm.wind = 0.2 end
        end
        local k = worm.keys
        local up, down, left, right = k.up, k.down, k.left, k.right
        if not up and not down then vy = vy / 1.105 end
        if not left and not right then vx = vx / 1.105 end
        if up and down then vy = vy / 1.095 end
        if left and right then vx = vx / 1.095 end
        for _, d in ipairs({ { up, right }, { up, left }, { down, right }, { down, left } }) do
          if d[1] and d[2] then
            vx, vy = vx * 0.99 * 0.99, vy * 0.99 * 0.99
          end
        end
        h.frame = (h.frame + 1) % 3
        local fuel = worm.fuel
        local burn = wa.world.retreat() == 0 and shared.helicopter_fuel ~= 0
        if burn then fuel = fuel - 0.020 end
        local shift = wa.world.keys().shift
        if up then
          if burn then fuel = fuel - 0.2 end
          vy = push(vy, -1)
        end
        if down then
          if burn then fuel = fuel - 0.020 end
          vy = push(vy, 1)
        end
        if left then
          if burn then fuel = fuel - 0.1 end
          if not shift then worm.facing = -1 end
          vx = push(vx, -1)
        end
        if right then
          if burn then fuel = fuel - 0.1 end
          if not shift then worm.facing = 1 end
          vx = push(vx, 1)
        end
        worm.vx, worm.vy, worm.fuel = vx, vy, fuel
        if worm.fuel <= 0.1 then
          heli_crash(worm, h, worm.vx, worm.vy)
          return
        end
      end
      if HELI_EXPLODE_ON_TURN_END and not worm.turn then
        heli_crash(worm, h, worm.vx, worm.vy)
        return
      end
    end
    local f = worm.facing
    if h.flying then
      if h.climb then h.climb:remove(); h.climb = nil end
      h.body = h.body or heli_actor(worm, "sprites/helicopter/flying.png")
      local a = h.body
      a.x, a.y, a.vx, a.vy, a.facing = worm.x, worm.y, 0, 0, f
      a:frame(h.frame)
      a:gfx({ angle = math.deg(wa.math.sin(worm.vx / 24)) % 360, depth = HELI_DEPTH })
      worm.body_visible = false
    elseif (h.jumpin and state == "prefiring")
        or (h.climb_out and state == "standing" and h.jump_phase > 0) then
      if h.climb_out then h.jump_phase = h.jump_phase - 0.047 * own_time.frames(worm) end
      h.climb = h.climb or heli_actor(worm, "sprites/helicopter/jumpin.png")
      local a = h.climb
      a.x = worm.x + (f > 0 and -11.5 or 12.5)
      a.y, a.vx, a.vy, a.facing = worm.y + 1, 0, 0, f
      a:frame(math.max(0, math.min(math.floor(h.jump_phase * 23), 22)))
      a:gfx({ depth = HELI_DEPTH })
      worm.body_visible = false
    elseif h.body or h.climb then
      h.climb_out = false
      h.jumpin, h.jump_phase = false, 0
      heli_drop_art(h, worm)
    end
  end

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FRAME_FINISH then
      heli_frame(worm)
    end
  end, { msgs = { wa.msg.FRAME_FINISH } })

  if wa.on.contact then
    wa.on.contact(function(worm, other, c)
      local h = helis[worm.id]
      if h and h.flying and other.kind ~= "mine"
          and (math.abs(c.vx) > 1 or math.abs(c.vy) > 1) then
        heli_crash(worm, h, c.vx, c.vy)
      end
    end)
  end
  end
end

function weapon.configure(ctx, spec)
  local fuel = ctx.option("fuel")
  require("lib/shared").helicopter_fuel = fuel
  spec.jet_pack.fuel = math.min(fuel, 255)
end

return weapon
