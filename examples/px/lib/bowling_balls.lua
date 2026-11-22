-- Bowling balls: rolling and crushing on PX's physics, for the Bowling Ball and its strike.

local balls = {}

balls.RADIUS = 16 -- MakeCircleMask: the ball's art is 32 across
balls.INERTIA_X, balls.INERTIA_Y = 0.8, 0.4

function balls.setup()
  local shared = require("lib/shared")

  local RADIUS = balls.RADIUS
  local BOUNCE, FRICTION = 0.03, 0.02
  local INERTIA_X, INERTIA_Y = balls.INERTIA_X, balls.INERTIA_Y
  local LOW_SPEED = 4.0 -- below this for LOW_FRAMES frames: "low speed"
  local LOW_FRAMES = 100
  local LOW_BOUNCE, LOW_FRICTION = 0.03, 0.03
  local LOW_INERTIA_X, LOW_INERTIA_Y = 0.0, 0.0
  local SLEEP_DISTANCE = 2
  local SLEEP_PERIOD = 80
  local SUPPORT = 2 -- asleep, what holds it is within this below it
  local FAST = 4.0
  local SPIN_X, SPIN_Y, MAX_SPIN = 0.06, 0.02, 0.6
  local SHEET = "sprites/bowling_ball/ball.png"

  local MAX_DAMAGE_SPEED = 15.0
  local MIN_DAMAGE, MAX_DAMAGE = 5.0, 60.0
  local OBJECT_DAMAGE = 100
  local DAMAGE_FORCE = 0.7 -- DamageForceMultiplier
  local RECOVER_FRAMES = 12
  local PUSH_SPEED = 4.0 -- MinPushSpeed
  local PUSH_FORCE, PUSH_KEEP = 0.6, 0.7
  local SOUND_CRUSH, SOUND_HIT = 33, 101
  local TOUCH = 2

  local BLAST_FORCE, GUN_FORCE = 1.0, 0.7
  local ZAPPED_FRICTION = -0.05
  local ZAP_REACH = 12

  local GLOW_SHEET = "sprites/bowling_ball/glow.png"
  local SPARK_SHEET = "sprites/bowling_ball/spark.png"
  local SHEEN_SHEET = "sprites/bowling_ball/sheen.png"
  local ZAPPED_TINT = 0x405980 -- the ball's colours times (0.25, 0.35, 0.5)
  local SHEEN_COLOR = 0xFF3C96FF -- RGB, added
  local GLOW_SIZE = 128
  local SPARK_SIZE, SPARK_FRAMES = 60, 10
  local SPARK_SPEED, SPARK_CYCLE = 0.02, 1.4
  local ZAP_R, ZAP_G, ZAP_B = 80, 110, 128
  local TRAIL_LIFE = 30
  local SPRITE_DROP = 4
  local LIFT = 0.5 -- half a pixel
  local BALL_DEPTH = wa.depth.OBJECTS
  local GLOW_DEPTH, SHEEN_DEPTH, SPARK_DEPTH = BALL_DEPTH + 1, BALL_DEPTH - 1, BALL_DEPTH - 2
  local EDGE = 32000
  -- In the water it sinks as a missile does, Valyrian Fire's among them (WA's
  -- sea step, 0x4FDE20): no gravity, its speed kept at 0.8 (+0x54, 0xCCCC) and
  -- 0.3 down added each frame, so it slows to 1.5 a frame.
  local SEA_DRAG, SEA_SINK = 0.8, 0.3
  local SUNK = 200 -- and is gone this far below the surface
  local SINK_TINT = 0xA0B4FF -- Valyrian Fire's: cooler and darker below the water
  local SOUND_SPLASH = 57 -- WA's Splash, as it falls in

  local SOLID = { "terrain", "worms", "crates", "oil" }
  local SOLID_FAST = { "terrain", "crates", "oil" }

  local function trunc(v) return v >= 0 and math.floor(v) or -math.floor(-v) end

  local function target_radius(obj)
    if obj.kind == "worm" then return 6 end
    if obj.kind == "mine" then return 5 end
    return 9
  end

  local function sleep(b)
    if b.asleep then return end
    b.asleep, b.low = true, false
    b.sleep_x, b.sleep_y = b.x, b.y
    b.vx, b.vy, b.lvx, b.lvy = 0, 0, 0, 0
    b.rvx, b.rvy = 0, 0
  end

  local function wake(b)
    if not b.asleep and not b.low then return end
    b.asleep, b.low = false, false
    b.low_timer, b.sleep_timer = 200, 200
    b.rec_x, b.rec_y = b.x, b.y
  end

  local function spin(b)
    local rot = math.min(MAX_SPIN, SPIN_X * math.abs(b.rvx) + SPIN_Y * math.abs(b.rvy))
    if b.rvx < 0 then rot = -rot end
    b.rot = b.rot + rot
    while b.rot > math.pi do b.rot = b.rot - 2 * math.pi end
    while b.rot <= -math.pi do b.rot = b.rot + 2 * math.pi end
  end

  local function think(b)
    if b.asleep then
      b.x, b.y = b.sleep_x, b.sleep_y
      b.rvx, b.rvy = 0, 0
      local below = wa.world.trace({
        x0 = b.x, y0 = b.y, x1 = b.x, y1 = b.y + SUPPORT, radius = RADIUS, with = SOLID,
      })
      if not (below and (below.hit or below.starts_solid)) then wake(b) end
      return 0
    end
    local speed = math.sqrt(b.rvx * b.rvx + b.rvy * b.rvy)
    local vx2, vy2 = b.vx, b.vy + wa.world.gravity()
    local bounce, friction, ix, iy = BOUNCE, FRICTION, INERTIA_X, INERTIA_Y
    if b.low then
      bounce, friction, ix, iy = LOW_BOUNCE, LOW_FRICTION, LOW_INERTIA_X, LOW_INERTIA_Y
    elseif b.zapped then
      friction = ZAPPED_FRICTION
    end
    if vx2 == 0 and vy2 == 0 then vy2 = b.vy + 0.1 end
    local with = speed > FAST and SOLID_FAST or SOLID
    local x, y = b.x, b.y
    local dx, dy = vx2, vy2
    if math.abs(x + dx) > EDGE or math.abs(y + dy) > EDGE then
      b.gone = true
      return 0
    end
    local function trace_from(sx, sy, k, group, radius)
      if math.abs(sx + k * dx) > EDGE or math.abs(sy + k * dy) > EDGE then return nil end
      return wa.world.trace({
        x0 = sx, y0 = sy, x1 = sx + k * dx, y1 = sy + k * dy, radius = radius or RADIUS, with = group,
      })
    end
    local res = trace_from(x, y, 1, with)
    if res and res.starts_solid then
      res = trace_from(x, y, 1, SOLID_FAST)
      if res and res.starts_solid then
        if not res.left_x then
          res = trace_from(x, y, -8, SOLID_FAST)
          if not (res and res.left_x) then
            res = trace_from(x, y, -8, SOLID_FAST, 0)
            if not (res and res.left_x) then
              sleep(b)
              return 0
            end
          end
        end
        x, y = res.left_x, res.left_y
        res = trace_from(x, y, 1, SOLID_FAST)
      end
    end
    if res and res.hit then
      local spt = vx2 * res.tx + vy2 * res.ty
      local spn = vx2 * res.nx + vy2 * res.ny
      b.vx = vx2 - spn * res.nx * (bounce + 1) - spt * res.tx * friction
      b.vy = vy2 - spn * res.ny * (bounce + 1) - spt * res.ty * friction
      x, y = res.x, res.y
      local lx, ly = x + res.nx * LIFT, y + res.ny * LIFT
      local lift = wa.world.trace({ x0 = x, y0 = y, x1 = lx, y1 = ly, radius = RADIUS, with = with })
      if not (lift and (lift.hit or lift.starts_solid)) then x, y = lx, ly end
    else
      b.vx, b.vy = vx2, vy2
      x, y = x + vx2, y + vy2
    end
    b.vx = b.vx + ix * (b.vx - b.lvx)
    b.vy = b.vy + iy * (b.vy - b.lvy)
    b.lvx, b.lvy = b.vx, b.vy
    b.rvx, b.rvy = (x - b.lx), (y - b.ly)
    b.lx, b.ly = x, y
    b.x, b.y = x, y
    if speed < LOW_SPEED then
      b.low_timer = b.low_timer - 1
      if b.low_timer <= 0 then b.low, b.low_timer = true, LOW_FRAMES end
    else
      b.low, b.low_timer = false, LOW_FRAMES
    end
    b.sleep_timer = b.sleep_timer - 1
    if b.sleep_timer <= 0 then
      local dx, dy = (x - b.rec_x), (y - b.rec_y)
      if math.sqrt(dx * dx + dy * dy) < SLEEP_DISTANCE then sleep(b) end
      b.sleep_timer, b.rec_x, b.rec_y = SLEEP_PERIOD, x, y
    end
    return speed
  end

  shared.bowling_balls = {} -- actor id -> ball

  local clock, clock_ball = 0, nil
  local recover = {} -- worm id -> clock at which it can be hurt again

  local function tick(id)
    if clock_ball == nil or not shared.bowling_balls[clock_ball] then clock_ball = id end
    if clock_ball == id then clock = clock + 1 end
  end

  local function overlaps(b, obj)
    local dx, dy = (obj.x - b.x), (obj.y - b.y)
    local r = RADIUS + target_radius(obj) + TOUCH
    return dx * dx + dy * dy <= r * r
  end

  local function push_balls(id, b, speed)
    local push = PUSH_FORCE * math.sqrt(speed)
    for other_id, o in pairs(shared.bowling_balls) do
      if other_id ~= id then
        local dx, dy = (o.x - b.x), (o.y - b.y)
        local d2 = dx * dx + dy * dy
        if d2 > 0 and d2 <= (2 * RADIUS) * (2 * RADIUS) then
          local d = math.sqrt(d2)
          wake(o)
          o.vx = o.vx + PUSH_KEEP * push * dx / d
          o.vy = o.vy + PUSH_KEEP * push * dy / d
        end
      end
    end
  end

  local CRUSHABLE = { standing = true, firing = true, fired = true, prefiring = true }

  local function hit_others(a, b, speed)
    local dmg = MIN_DAMAGE + (MAX_DAMAGE - MIN_DAMAGE)
      * (math.min(speed, MAX_DAMAGE_SPEED) - FAST) / (MAX_DAMAGE_SPEED - FAST)
    local function hit(obj)
      if not overlaps(b, obj) then return end
      local damage = 0
      if obj.kind == "worm" then
        if obj.hp <= 0 or (recover[obj.id] or 0) > clock then return end
        damage = dmg
        recover[obj.id] = clock + RECOVER_FRAMES
      elseif obj.kind == "crate" or obj.kind == "oil" then
        damage = OBJECT_DAMAGE
      else
        damage = dmg
      end
      damage = trunc(damage)
      if damage <= 0 then return end
      local fx, fy = b.rvx, b.rvy
      local ax = math.abs(fx)
      local crushed = obj.kind == "worm" and CRUSHABLE[obj.state] and fy > FAST and ax / fy < 0.2
      if crushed then
        fx, fy = 0, 10
      else
        fy = fy < 0 and fy - ax or fy - 2 * ax
        fx, fy = fx * DAMAGE_FORCE, fy * DAMAGE_FORCE
      end
      if obj.kind == "worm" then
        obj:hit({ amount = damage, vx = fx, vy = fy })
      else
        obj:hit(damage, fx, fy)
      end
      wa.sound.play(a, crushed and SOUND_CRUSH or SOUND_HIT)
    end
    for _, group in ipairs({ wa.worms, wa.mines, wa.crates, wa.oil }) do
      for _, obj in ipairs(group.all() or {}) do hit(obj) end
    end
  end

  local function balls_in_order()
    local ids = {}
    for id in pairs(shared.bowling_balls) do ids[#ids + 1] = id end
    table.sort(ids)
    return ids
  end

  local function zap(b, mul)
    if not b.zapped then b.spark, b.trail, b.seed = 0, {}, b.trail_seed end
    b.zapped = true
    wake(b)
    local ang = (wa.random(0, 2000) - 1000) / 10000
    local speed = (5 + wa.random(0, 1000) / 200) * (mul or 1)
    local a2 = ang * ang
    b.vx = (ang - ang * a2 / 6) * speed
    b.vy = -(1 - a2 / 2 + a2 * a2 / 24) * speed
  end

  shared.kick_bowling_balls = function(x, y, reach, vx, vy)
    local r = reach + RADIUS
    for _, id in ipairs(balls_in_order()) do
      local b = shared.bowling_balls[id]
      local dx, dy = (b.x - x), (b.y - y)
      if dx * dx + dy * dy <= r * r then
        wake(b)
        b.vx, b.vy = vx, vy
      end
    end
  end

  shared.zap_bowling_balls = function(x, y)
    local reach = (ZAP_REACH + RADIUS) * (ZAP_REACH + RADIUS)
    for _, id in ipairs(balls_in_order()) do
      local b = shared.bowling_balls[id]
      local dx, dy = (b.x - x), (b.y - y)
      if dx * dx + dy * dy <= reach then zap(b) end
    end
  end

  local function as_target(id, b)
    return { kind = "ball", id = id, x = b.x, y = b.y + SPRITE_DROP,
      alliance = b.alliance, moving = b.vx ~= 0 or b.vy ~= 0 }
  end

  shared.remove_bowling_ball = function(id)
    local b = shared.bowling_balls[id]
    if not b then return end
    sleep(b)
    b.gone = true
    shared.bowling_balls[id] = nil
  end

  shared.bowling_ball_targets = function()
    local out = {}
    for _, id in ipairs(balls_in_order()) do out[#out + 1] = as_target(id, shared.bowling_balls[id]) end
    return out
  end

  shared.bowling_ball_target = function(id)
    local b = shared.bowling_balls[id]
    return b and as_target(id, b)
  end

  shared.zap_bowling_ball = function(id)
    local b = shared.bowling_balls[id]
    if b then zap(b, b.zapped and 0.8 or 1) end
  end

  shared.bowling_ball_on_beam = function(x0, y0, dx, dy, len)
    local best
    for _, id in ipairs(balls_in_order()) do
      local b = shared.bowling_balls[id]
      local cx, cy = (b.x - x0), (b.y - y0)
      local along = cx * dx + cy * dy
      local miss = cx * cx + cy * cy - along * along
      if miss <= RADIUS * RADIUS then
        local t = along - math.sqrt(RADIUS * RADIUS - miss)
        if t > 0 and t < len and (not best or t < best) then best = t end
      end
    end
    if best then return x0 + (best * dx), y0 + (best * dy) end
  end

  local function electrified_frame(b)
    b.spark = b.spark + SPARK_SPEED
    if b.spark > SPARK_CYCLE then b.spark = b.spark - SPARK_CYCLE end
    for i = #b.trail, 1, -1 do
      local p = b.trail[i]
      p.age = p.age + 1
      if p.age >= TRAIL_LIFE then
        table.remove(b.trail, i)
      else
        p.x, p.y = p.x + p.vx, p.y + p.vy
      end
    end
    if not b.asleep then
      b.seed = (b.seed * 1103515245 + 12345) % 0x80000000
      local a = b.seed / 0x80000000 * 2 * math.pi
      b.seed = (b.seed * 1103515245 + 12345) % 0x80000000
      local v = b.seed / 0x80000000 * 0.3
      b.trail[#b.trail + 1] = { x = b.x, y = b.y, vx = wa.math.cos(a) * v, vy = wa.math.sin(a) * v, age = 0 }
    end
  end

  local function take_hit(b, hit)
    wake(b)
    local k = hit.kind == "blast" and BLAST_FORCE or GUN_FORCE
    b.vx = b.vx + k * hit.vx
    b.vy = b.vy + k * hit.vy
  end

  -- Sinking, it hits nothing and nothing finds it: it leaves the ball list.
  local function sink(a, b)
    if not b.sinking then
      b.sinking, b.asleep, b.low = true, false, false
      shared.bowling_balls[a.id] = nil
      wa.sound.play(a, SOUND_SPLASH)
    end
    b.vx, b.vy = b.vx * SEA_DRAG, b.vy * SEA_DRAG + SEA_SINK
    b.rvx, b.rvy = b.vx, b.vy
    b.x, b.y = b.x + b.vx, b.y + b.vy
    if b.y >= wa.world.water() + SUNK then
      a:remove()
      return
    end
    spin(b)
    a.x, a.y, a.vx, a.vy = b.x, b.y + SPRITE_DROP, 0, 0
    a:gfx({ angle = math.deg(b.rot) % 360, depth = BALL_DEPTH, tint = SINK_TINT })
  end

  -- spare: frames for which the ball can't hurt its owner.
  local function spawn_ball(owner, x, y, vx, vy, spare)
    local b = {
      x = x, y = y, vx = vx, vy = vy, lvx = vx, lvy = vy, rvx = 0, rvy = 0, lx = x, ly = y,
      rot = 0, low = false, low_timer = 200, sleep_timer = 200, rec_x = x, rec_y = y,
      asleep = false, alliance = owner and owner.alliance,
    }
    local a = wa.actors.spawn({
      sprite = SHEET, x = x, y = y + SPRITE_DROP, owner = owner, body = {},
      on = {
        hit = function(_, hit) take_hit(b, hit) end,
        frame = function(a)
          if b.gone then
            a:remove()
            return
          end
          if b.sinking or b.y >= wa.world.water() then
            sink(a, b)
            return
          end
          local fx, fy, _, waking = wa.magnetism.sample(b.x, b.y, a)
          if waking then wake(b) end
          if not b.asleep then
            b.vx, b.vy = b.vx + fx * 0.25, b.vy + fy * 0.25
          end
          tick(a.id)
          if b.zapped then electrified_frame(b) end
          spin(b)
          if shared.portals and next(shared.portals.pairs) then
            local proxy = {
              id = a.id, kind = "actor", x = b.x, y = b.y,
              vx = b.vx, vy = b.vy,
              fits = function(_, x, y)
                return not wa.world.collides({ x = x, y = y, radius = RADIUS, with = {"terrain"} })
              end,
              warp = function(_, spec)
                b.x, b.y, b.vx, b.vy = spec.x, spec.y, spec.vx, spec.vy
                wake(b)
                b.lvx, b.lvy, b.rvx, b.rvy = b.vx, b.vy, b.vx, b.vy
                a:warp({ x = b.x, y = b.y + SPRITE_DROP, vx = 0, vy = 0 })
                return true
              end,
            }
            shared.portals:move(proxy)
          end
          local speed = think(b)
          if b.gone then
            shared.bowling_balls[a.id] = nil
            a:remove()
            return
          end
          if speed > PUSH_SPEED then push_balls(a.id, b, speed) end
          if speed > FAST then hit_others(a, b, speed) end
          a.x, a.y, a.vx, a.vy = b.x, b.y + SPRITE_DROP, 0, 0
          a:gfx({ angle = math.deg(b.rot) % 360, depth = BALL_DEPTH, tint = b.zapped and ZAPPED_TINT or 0xFFFFFF })
        end,
      },
    })
    shared.bowling_balls[a.id] = b
    b.trail_seed = a.id * 7919 % 0x80000000
    if spare and owner then recover[owner.id] = clock + spare end
    return a, b
  end
  shared.spawn_bowling_ball = spawn_ball

  -- The first height from y up, within a ball's width, where a ball at x is
  -- clear of the land; y itself if the land fills all of it.
  shared.bowling_ball_clear_y = function(x, y)
    for up = 0, 2 * RADIUS do
      if not wa.world.collides({ x = x, y = y - up, radius = RADIUS, with = { "terrain" } }) then
        return y - up
      end
    end
    return y
  end

  if wa.on.draw and wa.draw.quad then
    local glow_sheet = wa.sprites.key(GLOW_SHEET)
    local spark_sheet = wa.sprites.key(SPARK_SHEET)
    local sheen_sheet = wa.sprites.key(SHEEN_SHEET)
    local QUAD = { points = { { 0, 0 }, { 0, 0 }, { 0, 0 }, { 0, 0 } } }
    local function quad(sheet, frame, color, depth, x, y, half, c, s)
      QUAD.sprite, QUAD.frame, QUAD.blend, QUAD.color, QUAD.depth = sheet, frame, "add", color, depth
      local p = QUAD.points
      if not c then
        p[1][1], p[1][2] = x - half, y - half
        p[2][1], p[2][2] = x + half, y - half
        p[3][1], p[3][2] = x + half, y + half
        p[4][1], p[4][2] = x - half, y + half
      else
        p[1][1], p[1][2] = x + ((-c + s) * half), y + ((-s - c) * half)
        p[2][1], p[2][2] = x + (( c + s) * half), y + (( s - c) * half)
        p[3][1], p[3][2] = x + (( c - s) * half), y + (( s + c) * half)
        p[4][1], p[4][2] = x + ((-c - s) * half), y + ((-s + c) * half)
      end
      wa.draw.quad(QUAD)
    end
    local function zap_color(k)
      return 0xFF000000 | (math.floor(ZAP_R * k) << 16) | (math.floor(ZAP_G * k) << 8) | math.floor(ZAP_B * k)
    end
    local FULL = zap_color(1)
    local DRAW_IDS = {}
    wa.on.draw(function()
      local n = 0
      for id in pairs(shared.bowling_balls) do n = n + 1; DRAW_IDS[n] = id end
      for i = #DRAW_IDS, n + 1, -1 do DRAW_IDS[i] = nil end
      table.sort(DRAW_IDS)
      for _, id in ipairs(DRAW_IDS) do
        local b = shared.bowling_balls[id]
        if b.zapped then
          local drop = SPRITE_DROP
          for _, t in ipairs(b.trail) do
            local k = t.age / TRAIL_LIFE
            quad(glow_sheet, 0, zap_color(1 - k), GLOW_DEPTH, t.x, t.y + drop, (0.3 + 0.2 * k) * GLOW_SIZE / 2)
          end
          local x, y = b.x, b.y + drop
          local glow = (0.3 + 0.1 * wa.draw.random()) * GLOW_SIZE / 2
          for _ = 1, 3 do quad(glow_sheet, 0, FULL, GLOW_DEPTH, x, y, glow) end
          local c, s = wa.math.cos(b.rot), wa.math.sin(b.rot)
          quad(sheen_sheet, 0, SHEEN_COLOR, SHEEN_DEPTH, x, y, SPARK_SIZE / 2, c, s)
          if b.spark <= 1 then
            local frame = math.min(SPARK_FRAMES - 1, math.floor(b.spark * SPARK_FRAMES))
            quad(spark_sheet, frame, 0xFFFFFFFF, SPARK_DEPTH, x, y, SPARK_SIZE / 2, c, s)
          end
        end
      end
    end)
  end

  shared.portal_bowling_balls = function()
    local out = {}
    for _, id in ipairs(balls_in_order()) do out[#out + 1] = { id = id } end
    return out
  end
end

return balls
