-- Shared target queries, the Tazer's arc and its drawing for the electrical
-- weapons. The Lightning Strike's bolt, cloud and trace are wf.sdk's
-- (wf-lib/lightning), which the arcs draw with too.

local electrical = {}
local context, installed

local providers, order = {}, {}
function electrical.register(provider)
  if not providers[provider.kind] then order[#order + 1] = provider.kind end
  providers[provider.kind] = provider
end

function electrical.special_targets()
  local out = {}
  for _, kind in ipairs(order) do
    local provider = providers[kind]
    for _, obj in ipairs(provider.targets()) do
      obj.kind, obj.provider = kind, provider
      out[#out + 1] = obj
    end
  end
  return out
end

function electrical.special(key)
  local kind, id = key:match("^([^:]+):(.+)$")
  if not (kind and providers[kind]) then return nil end
  for _, obj in ipairs(providers[kind].targets()) do
    if tostring(obj.id) == id then
      obj.kind, obj.provider = kind, providers[kind]
      return obj
    end
  end
end

function electrical.special_on_beam(x0, y0, dx, dy, length)
  local best, hit
  for _, obj in ipairs(electrical.special_targets()) do
    local cx, cy = obj.x - x0, obj.y - y0
    local along = cx * dx + cy * dy
    local miss = cx * cx + cy * cy - along * along
    local r = obj.radius or 9
    if miss <= r * r then
      local at = along - math.sqrt(math.max(0, r * r - miss))
      if at > 0 and at < length and (not best or at < best) then best, hit = at, obj end
    end
  end
  if best then return x0 + best * dx, y0 + best * dy, hit end
end
function electrical.context()
  if context then return context end
  local function sq(v) return v * v end
  local shared = require("lib/shared")
  local L = require("wf-lib/lightning")
  local ELECTRIC_DEPTH = L.depth()
  local BEAM, GLOW = L.BEAM, L.GLOW
  local GRENADE_BURST = "sprites/electric_grenade/explosion.png"
  local arcs, tazed = {}, {}
  shared.revived_by_lightning = shared.revived_by_lightning or {}
  local effect_actor = L.effect_actor
  local electrical_targets = L.targets
  local target_radius = L.target_radius
  local electrical_trace = L.trace
  local function target_key(obj)
    return obj.kind .. ":" .. obj.id
  end

  local function find_target(key)
    local ball = key:match("^ball:(%d+)$")
    if ball then
      return shared.bowling_ball_target and shared.bowling_ball_target(tonumber(ball))
    end
    local special = electrical.special(key)
    if special then return special end
    for _, obj in ipairs(electrical_targets(false)) do
      if target_key(obj) == key then return obj end
    end
  end

  local function closest_target(arc)
    local best, distance = nil, sq(200)
    local targets = wa.world.electrical_nearby
      and wa.world.electrical_nearby(arc.x, arc.y, 200, false) or electrical_targets(false)
    local function consider(obj)
      local key = target_key(obj)
      if not arc.ignore[key] and (obj.kind ~= "worm" or obj.hp > 0) then
        local dx, dy = obj.x - arc.x, obj.y - arc.y
        local d = dx * dx + dy * dy
        if d < distance then best, distance = obj, d end
      end
    end
    for _, obj in ipairs(targets) do consider(obj) end
    if shared.bowling_ball_targets then
      for _, obj in ipairs(shared.bowling_ball_targets()) do consider(obj) end
    end
    for _, obj in ipairs(electrical.special_targets()) do consider(obj) end
    return best, distance
  end

  local function release_taze(key)
    local hold = tazed[key]
    if not hold then return end
    hold.count = hold.count - 1
    if hold.count > 0 then return end
    local worm = hold.worm
    if worm.taken then worm:release(0, 0) end
    worm.body_visible = true
    tazed[key] = nil
  end

  local function zap_target(arc, pending)
    local obj = find_target(pending.key)
    release_taze(pending.key)
    if not obj then return end
    if obj.kind == "worm" then
      obj:hit({ amount = 24, kind = "taze" })
      obj.vx, obj.vy = pending.side * 1.2, -4
    elseif obj.kind == "mine" then
      obj:arm(400)
    elseif obj.kind == "crate" or obj.kind == "oil" then
      obj:hit(12, pending.side * 1.2, -4, "taze")
    elseif obj.kind == "ball" then
      shared.zap_bowling_ball(obj.id)
    elseif obj.provider then
      obj.provider.zap(obj, pending.side)
    end
  end

  local ARC_MAX_POINTS = 256
  local function add_point(arc)
    arc.points[#arc.points + 1] = { arc.x, arc.y }
    if #arc.points > ARC_MAX_POINTS then table.remove(arc.points, 1) end
  end

  local LINK_DISTANCE = 10 / 0.81

  local function progress_arc(arc)
    arc.explosion = arc.explosion + 1
    for i = #arc.pending, 1, -1 do
      local p = arc.pending[i]
      p.time = p.time - 1
      if p.time <= 0 then
        zap_target(arc, p)
        table.remove(arc.pending, i)
      end
    end
    if arc.pause > 0 then arc.pause = arc.pause - 1; return end
    if arc.life <= 0 then
      if #arc.points > 0 then table.remove(arc.points, 1) end
      return
    end
    arc.life = arc.life - 1
    local target, distance = closest_target(arc)
    if target then
      local dx, dy = target.x - arc.x, target.y - arc.y
      local d = math.sqrt(distance)
      if d <= LINK_DISTANCE then
        local key = target_key(target)
        arc.ignore[key] = true
        arc.pending[#arc.pending + 1] = { key = key, side = dx < 0 and -1 or 1, time = 24 }
        if target.kind == "worm" then
          if tazed[key] then
            tazed[key].count = tazed[key].count + 1
          else
            tazed[key] = { x = target.x, y = target.y, count = 1, worm = target,
              sheet = wa.random(1, 2) == 1 and "sprites/electric_grenade/tazed1.png" or "sprites/electric_grenade/tazed2.png" }
          end
          target.body_visible = false
          target:take{ turn = "freeze" }
        end
        arc.x, arc.y = target.x, target.y
        arc.life = 20
        arc.pause = 14
        add_point(arc)
        return
      end
      local pull = math.min(1, math.sqrt(10 / d))
      arc.dx = arc.dx + ((dx / d) - arc.dx) * pull
      arc.dy = arc.dy + ((dy / d) - arc.dy) * pull
    else
      arc.dx = arc.dx + wa.random(-100, 100) / 100
      arc.dy = arc.dy + wa.random(-100, 100) / 100
    end
    local norm = math.sqrt(arc.dx * arc.dx + arc.dy * arc.dy)
    if norm < 0.01 then arc.dx, arc.dy = 0, -1 else arc.dx, arc.dy = arc.dx / norm, arc.dy / norm end
    local nx, ny = arc.x + arc.dx * 20, arc.y + arc.dy * 20
    local land = wa.land.trace(arc.x, arc.y, nx, ny)
    if land then
      if land.starts_solid then arc.life = 0; return end
      local tx, ty = land.tx or 1, land.ty or 0
      if target then
        local a = sq(target.x - (land.x + tx * 10)) + sq(target.y - (land.y + ty * 10))
        local b = sq(target.x - (land.x - tx * 10)) + sq(target.y - (land.y - ty * 10))
        if b < a then tx, ty = -tx, -ty end
      end
      arc.dx, arc.dy = tx, ty
      arc.x, arc.y = land.x + (land.nx or 0) * 10 + tx * 10,
        land.y + (land.ny or -1) * 10 + ty * 10
    else
      arc.x, arc.y = arc.x + arc.dx * 10, arc.y + arc.dy * 10
    end
    add_point(arc)
  end

  local function start_arc(ev)
    local arc = { x = ev.x, y = ev.y, dx = ev.dx or 0, dy = ev.dy or -1, life = ev.life or 16, pause = 0,
      points = { { ev.x, ev.y } }, ignore = {}, pending = {}, explosion = 0,
      burst_x = ev.x, burst_y = ev.y, sound_age = 0, burst = ev.burst ~= false }
    for _,obj in ipairs(ev.ignore or {}) do arc.ignore[target_key(obj)] = true end
    arcs[#arcs + 1] = arc
    local driver = effect_actor(ev.x, ev.y, ev.worm or shared.current_worm() or ev.owner, function(a)
      arc.sound_age = arc.sound_age + 1
      if arc.life > 0 and arc.sound_age % 46 == 0 then
        wa.sound.play(a, "sounds/lightning/tazer_loop.wav")
      end
      progress_arc(arc)
      if arc.life <= 0 and #arc.points == 0 and #arc.pending == 0 then
        for i, held in ipairs(arcs) do
          if held == arc then table.remove(arcs, i); break end
        end
        a:remove()
      end
    end)
    wa.sound.play(driver, "sounds/lightning/tazer_loop.wav")
  end

  local function grenade_arc(ev)
    local ignore = {}
    if context.thrower then ignore[#ignore+1] = context.thrower end
    if ev.worm then ignore[#ignore+1] = ev.worm end
    return start_arc({x=ev.x,y=ev.y,worm=ev.worm,owner=ev.owner,life=ev.life,ignore=ignore})
  end

  context = { sq = sq, ELECTRIC_DEPTH = ELECTRIC_DEPTH, BEAM = BEAM, GLOW = GLOW, GRENADE_BURST = GRENADE_BURST, arcs = arcs, tazed = tazed, effect_actor = effect_actor, electrical_targets = electrical_targets, target_radius = target_radius, electrical_trace = electrical_trace, target_key = target_key, find_target = find_target, start_arc = start_arc, grenade_arc = grenade_arc }
  return context
end

function electrical.setup()
  if installed then return end
  installed = true
  local c = electrical.context()
  local GRENADE_BURST = c.GRENADE_BURST
  local ELECTRIC_DEPTH = c.ELECTRIC_DEPTH
  local arcs = c.arcs
  local tazed = c.tazed
  local find_target = c.find_target
  wa.on.worm_message(function(worm, msg)
    if tazed[c.target_key(worm)] then return "eat" end
  end, { msgs = { wa.msg.FIRE_WEAPON } })
  if wa.on.draw and wa.draw.ribbon then
    local g = require("wf-lib/lightning").gfx()
    local colour, square, glow, point, ribbon, noise_span =
      g.colour, g.square, g.glow, g.point, g.ribbon, g.noise_span
    local burst_sprite = wa.sprites.key(GRENADE_BURST)
    wa.on.draw(function()
      for _, arc in ipairs(arcs) do
        if arc.burst ~= false and arc.explosion < 10 then
          local h = 75
          square(burst_sprite, arc.explosion, "add", 0x551E14EB, ELECTRIC_DEPTH, arc.burst_x, arc.burst_y, h, h)
        end
        if #arc.points >= 2 then
          if arc.shape_tick ~= arc.sound_age then
            local divs = 33
            while divs < #arc.points do divs = 2 * divs - 1 end
            arc.noise = arc.noise or {}
            noise_span(arc.noise, 0, divs, 1.0, 0, 0)
            arc.shape_tick = arc.sound_age
          end
          local num = #arc.points - 1
          local fade = math.min(1, arc.life / 6)
          for i = 0, num do
            local t = i / num
            local x, y = arc.points[i + 1][1], arc.points[i + 1][2]
            if i > 0 and i < num then
              local px, py = arc.points[i][1], arc.points[i][2]
              local nx, ny = (y - py), (px - x)
              local d = math.sqrt(nx * nx + ny * ny)
              if d > 0 then
                local n = 10 * (arc.noise[i - 1] or 0) / d
                x, y = x + n * nx, y + n * ny
              end
            end
            local f = math.min(1, 4 * t * (1 - t) + 0.1)
            local f2 = f * fade
            local c = colour(255, math.floor(80 * f2), math.floor(100 * f2), math.floor(255 * f2))
            point(i + 1, x, y, 2 * 9 * f, t, c)
            glow(x, y, i == num - 1 and 115 or 38, c)
          end
          ribbon(num + 1)
        end
      end
      for _, arc in ipairs(arcs) do
        for _, p in ipairs(arc.pending) do
          if p.key:sub(1, 5) == "ball:" or electrical.special(p.key) then
            local ball = find_target(p.key)
            if ball then glow(ball.x, ball.y, 128 * (0.4 + 0.3 * wa.draw.random()), colour(255, 80, 100, 255)) end
          end
        end
      end
      for key, hold in pairs(tazed) do
        local worm = find_target(key)
        if worm then
          local x, y = worm.x, worm.y
          local h = 30
          square(hold.sheet, math.floor(wa.draw.random() * 4), "alpha", 0xFFFFFFFF, ELECTRIC_DEPTH, x, y, h, h)
          glow(x, y, 128 * (0.4 + 0.3 * wa.draw.random()), colour(255, 80, 100, 255))
        end
      end
    end)
  end
end
return electrical
