-- Ferret: a ferret that walks the land's outline and explodes on a worm, a drum or the water.

local weapon = {}

weapon.record = {
  handling = {
    remember_selection = true,
    ends_turn = true,
  },
}

function weapon.definition()
  local shared = require("lib/shared")
  local fires = shared.fires
  local sdk = require("wf-lib/holds")
  local PX_POSTURE, PX_HANDS = sdk.PX_POSTURE, sdk.PX_HANDS
  return require("lib/weapon").merge(weapon.record, {
    wep = "weps/salvation_army.wep",
    panel_icon = "sprites/ferret/icon.png",
    worm_sprites = {
      weaponlnk = sdk.PX_LEVEL.weaponlnk, weaponlnku = sdk.PX_LEVEL.weaponlnku,
      weaponlnkd = sdk.PX_LEVEL.weaponlnkd,
      wthrow = PX_POSTURE.wthrow, wthrowu = PX_POSTURE.wthrowu, wthrowd = PX_POSTURE.wthrowd,
    },
    sprites = { "sprites/ferret/walk.png" },
    sounds = { "sounds/ferret/walk.wav" },
    params = { gpu_prefix = "sprites/ferret/" },
    on_fire = function(fire) fires.ferret(fire) end,
    hold = {
        thrown = true,
        sheet = "sprites/ferret/hold.png", hand_type = 2, hand_radius = -8.0,
        hand_rotation = 0.0, hand_radial_rotation = -0.13, hand_scale = 1.0,
        weap_rotation = 0.5, weap_radial_rotation = 0.22, weap_radius = -9.0,
        static = { weap = 0.0, hand = 0.45 }, -- ang_if_static, hand_ang_if_static
        hand = PX_HANDS[2],
    },
  })
end

function weapon.setup()
  local shared = require("lib/shared")
  local fires = shared.fires

  local STEP = 3 -- frt_maxdist
  local MAX_FAILS = 4 -- frt_maxfails
  local MAX_OPS = 12 -- frt_maxoper
  local GRACE = 60 -- frt_framesdam
  local TURN_EVERY = 6 -- frt_pixrotat: steps between turns of the sprite
  local MAX_ALIVE = 10 -- frt_maxfrtalw
  local FUSE = 15 * 50
  local LIFT = 13
  local WORM_REACH_X, WORM_REACH_UP, WORM_REACH_DOWN = 8, 12, 9
  local MINE_REACH_X, MINE_REACH_Y = 7, 5
  local PROBE = 3
  local SCALE = 0.95 -- frt_sprscale
  local DEPTH = wa.depth.OBJECTS -- in front of the terrain, as the Bowling Ball
  local WALK = "sprites/ferret/walk.png"
  local FRAMES = 10
  local SOUND = "sounds/ferret/walk.wav"
  local BOOM = { damage = 50, id = 100, below = false }
  local BIAS = 100
  local DROP = BIAS * BOOM.damage // 200
  local WORM_UP, MINE_UP = -5, -7

  local UP, RIGHT, DOWN, LEFT = 1, 2, 4, 8
  local MOVES = {
    [DOWN] = { [LEFT] = { 1, 0, RIGHT }, [RIGHT] = { -1, 0, LEFT } },
    [UP] = { [LEFT] = { -1, 0, LEFT }, [RIGHT] = { 1, 0, RIGHT } },
    [LEFT] = { [LEFT] = { 0, 1, DOWN }, [RIGHT] = { 0, -1, UP } },
    [RIGHT] = { [LEFT] = { 0, -1, UP }, [RIGHT] = { 0, 1, DOWN } },
  }

  local alive = {} -- the Ferrets walking, oldest first
  local MAX_RISE = 64

  local function land_at(f, x, y)
    return not f.a:fits(x, y)
  end

  local function rise_clear(f)
    for _ = 1, MAX_RISE do
      if not land_at(f, f.x, f.y) then return end
      f.y = f.y - 1
    end
  end

  local function move(f, dir)
    local m = MOVES[f.looking][dir]
    f.ax, f.ay, f.looking = f.ax + m[1] * STEP, f.ay + m[2] * STEP, m[3]
  end

  local function trace(f)
    f.ax, f.ay = f.px, f.py
    f.looking = f.looking_bk
    while true do
      if f.ops <= 0 then
        f.tracing, f.walking, f.fails, f.ops = false, true, 0, MAX_OPS
        return
      end
      if f.fails >= MAX_FAILS then
        f.tracing, f.walking, f.boom, f.fails, f.why = false, false, true, 0, "a dead end"
        return
      end
      if land_at(f, f.ax, f.ay) then
        f.fails = 0
        if f.ax ~= f.px or f.ay ~= f.py then
          f.looking_bk = f.looking
          f.px, f.py = f.ax, f.ay
          f.outline[#f.outline + 1] = { f.ax, f.ay }
        end
        move(f, f.side < 0 and RIGHT or LEFT)
      else
        f.fails = f.fails + 1
        move(f, f.side < 0 and LEFT or RIGHT)
      end
      f.ops = f.ops - 1
    end
  end

  local function body(f, x, y)
    return x + (f.ux * LIFT), y + (f.uy * LIFT)
  end

  local function touching(x, y)
    local near = { near = { x, y, WORM_REACH_UP + 1 } }
    for _, w in ipairs(wa.worms.all(near)) do
      local dx, dy = (x - w.x), (y - w.y)
      if w.hp > 0 and math.abs(dx) < WORM_REACH_X and dy > -WORM_REACH_UP and dy < WORM_REACH_DOWN then
        return w, "worm"
      end
    end
    for _, m in ipairs(wa.mines.all(near)) do
      if math.abs(x - m.x) < MINE_REACH_X and math.abs(y - m.y) < MINE_REACH_Y then return m, "mine" end
    end
    local _, obj = wa.world.collides({ x = x, y = y, radius = PROBE, with = { "oil" } })
    if obj then return obj, "oil" end
  end

  local function interact(f, x, y)
    local obj, kind = touching(x, y)
    if kind == "worm" then
      local current = shared.current_worm()
      if f.grace > 0 and current and current.id == obj.id then return end
      obj.vx, obj.vy = f.side, WORM_UP
      f.boom, f.walking, f.tracing, f.why = true, false, false, "a worm"
    elseif kind == "oil" then
      f.boom, f.walking, f.tracing, f.why = true, false, false, "an oil drum"
    elseif kind == "mine" then
      obj.vx, obj.vy = f.side, MINE_UP
    end
    if shared.kick_bowling_balls then
      shared.kick_bowling_balls(x, y, PROBE, f.side, MINE_UP)
    end
  end

  local function turn(f, x, y)
    f.steps = f.steps + 1
    if f.steps % TURN_EVERY ~= 0 then return end
    local dx, dy = (x - f.rx), (y - f.ry)
    local len = math.sqrt(dx * dx + dy * dy)
    if len > 0 then
      f.ux, f.uy = f.side * dy / len, -f.side * dx / len
    end
    f.angle = wa.math.atan(dx, -dy) - math.pi / 2 * f.side
    f.rx, f.ry = x, y
  end

  local function walk(f)
    local p = f.outline[f.next]
    if not p then
      f.walking, f.tracing = false, true
      f.outline, f.next = {}, 1
      f.x, f.y = f.lx, f.ly
      return false
    end
    f.next = f.next + 1
    f.x, f.y = p[1], p[2]
    interact(f, f.x, f.y)
    turn(f, f.x, f.y)
    f.lx, f.ly = f.x, f.y
    return true
  end

  local function fly(f)
    f.vy = f.vy + wa.world.gravity()
    local n = math.min(64, math.max(math.abs(f.vx), math.abs(f.vy)) // 1 + 1)
    local sx, sy = f.vx / n, f.vy / n
    for _ = 1, n do
      if land_at(f, f.x + sx, f.y + sy) then
        f.vx, f.vy = 0, 0
        return
      end
      f.x, f.y = f.x + sx, f.y + sy
    end
  end

  local function try_plant(f, a)
    local x, y = f.x, f.y + STEP
    if land_at(f, x, y) then
      f.planted, f.tracing = true, true
      f.px, f.py, f.ax, f.ay, f.lx, f.ly, f.rx, f.ry = x, y, x, y, x, y, x, y
      wa.sound.play(a, SOUND)
    end
    interact(f, f.x, f.y)
  end

  local function forget(f)
    for i, other in ipairs(alive) do
      if other == f then table.remove(alive, i); return end
    end
  end

  local function explode(f, a)
    wa.log(string.format("Ferret explodes on %s at (%d, %d), %d frames after it was placed",
      f.why or "?", f.x // 1, f.y // 1, f.age))
    f.dead = true
    forget(f)
    a.x, a.y = f.x, f.y + DROP
    a:explode(BOOM)
    if a.id ~= 0 then a:remove() end
  end

  local function frame(f, a)
    if f.dead then return end
    f.age = f.age + 1
    if f.gone then
      f.dead = true
      a:remove()
      return
    end
    if not f.planted then
      fly(f)
      try_plant(f, a)
    end
    if f.y >= wa.world.water() - STEP then f.boom, f.why = true, f.why or "the water" end
    if f.age >= FUSE then f.boom, f.why = true, f.why or "its 15 s fuse" end
    if f.boom then
      explode(f, a)
      return
    end
    if f.tracing then trace(f) end
    if f.walking and walk(f) then walk(f) end
    f.grace = f.grace - 1
    local bx, by = f.x, f.y
    if f.planted then bx, by = body(f, f.x, f.y) end
    a.x, a.y, a.vx, a.vy = bx, by, 0, 0
    a:frame((f.steps // 2) % FRAMES)
    a:gfx({ angle = math.deg(f.angle) % 360, depth = DEPTH, scale = SCALE })
  end

  fires.ferret = function(fire)
    local worm = fire.worm
    while #alive >= MAX_ALIVE do
      local oldest = table.remove(alive, 1)
      oldest.gone = true
    end
    local f = {
      x = fire.x, y = fire.y, vx = fire.vx, vy = fire.vy, ux = 0, uy = -1,
      side = (worm.facing or 1) < 0 and -1 or 1,
      looking = DOWN, looking_bk = DOWN, ops = MAX_OPS, fails = 0,
      outline = {}, next = 1, steps = 0, angle = 0, grace = GRACE, age = 0,
      planted = false, tracing = false, walking = false, boom = false,
    }
    alive[#alive + 1] = f
    local a = wa.actors.spawn({
      sprite = WALK, x = f.x, y = f.y, owner = worm,
      body = { shape = "missile", layer = "missile" }, on = function(actor) frame(f, actor) end,
    })
    f.a = a
    rise_clear(f)
    a.facing = f.side
    a:frame(0)
  end

  shared.ferrets = alive
end

return weapon
