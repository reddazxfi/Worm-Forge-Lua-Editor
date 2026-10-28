-- Shared target queries and beam rendering for the electrical weapons.
-- Each weapon owns its simulation callbacks; this module owns their renderer.
local electrical = {}
local context, installed
function electrical.context()
  if context then return context end
  local function sq(v) return v * v end
  local shared = require("lib/shared")
  local ELECTRIC_DEPTH = wa.depth.BEHIND_TERRAIN
  local BEAM = "sprites/lightning/beam.png"
  local GLOW = "sprites/lightning/glow.png"
  local CLOUD = "sprites/lightning/cloud.png"
  local CLOUD_DEPTH = ELECTRIC_DEPTH - 0x1000
  local GRENADE_BURST = "sprites/electric_grenade/explosion.png"
  local strikes, arcs, tazed = {}, {}, {}
  shared.revived_by_lightning = shared.revived_by_lightning or {}
  local function effect_actor(x, y, owner, frame)
    return wa.actors.spawn({
      sprite = GLOW, visible = false, gravity = false, collide = false,
      owner = owner, x = x, y = y, on = frame,
    })
  end

  local function electrical_targets(graves)
    local out = {}
    for _, group in ipairs({ wa.worms, wa.mines, wa.crates, wa.oil }) do
      for _, obj in ipairs(group.all()) do out[#out + 1] = obj end
    end
    if graves and wa.graves then
      for _, obj in ipairs(wa.graves.all()) do out[#out + 1] = obj end
    end
    return out
  end

  local function target_radius(obj)
    if obj.kind == "worm" then return 6 end
    if obj.kind == "grave" then return 8 end
    if obj.kind == "mine" then return 5 end
    return 9
  end

  -- A ray against terrain and the objects PX's collision mask names. Projection
  -- and the chosen endpoint both use world pixels.
  -- Equal-distance objects retain the engine's entity traversal order.
  local function electrical_trace(x0, y0, dx, dy)
    local far = 10000
    if wa.world.electrical_trace then
      return wa.world.electrical_trace(x0, y0,
        (x0 + dx * far), (y0 + dy * far))
    end
    local land = wa.land.trace(x0, y0,
      (x0 + dx * far), (y0 + dy * far))
    local best = land and math.sqrt(sq(land.x - x0) + sq(land.y - y0)) or far
    local hit = land and { x = land.x, y = land.y, obj = nil } or nil
    for _, obj in ipairs(electrical_targets(true)) do
      local ox, oy = (obj.x - x0), (obj.y - y0)
      local along = ox * dx + oy * dy
      local across = math.abs(ox * dy - oy * dx)
      if along > 0 and along < best and across <= target_radius(obj) then
        best = along
        hit = { x = obj.x, y = obj.y, obj = obj }
      end
    end
    return hit
  end
  context = { sq = sq, ELECTRIC_DEPTH = ELECTRIC_DEPTH, BEAM = BEAM, GLOW = GLOW, CLOUD = CLOUD, CLOUD_DEPTH = CLOUD_DEPTH, GRENADE_BURST = GRENADE_BURST, strikes = strikes, arcs = arcs, tazed = tazed, effect_actor = effect_actor, electrical_targets = electrical_targets, target_radius = target_radius, electrical_trace = electrical_trace }
  return context
end

function electrical.setup()
  if installed then return end
  installed = true
  local c = electrical.context()
  local sq = c.sq
  local ELECTRIC_DEPTH = c.ELECTRIC_DEPTH
  local BEAM = c.BEAM
  local GLOW = c.GLOW
  local CLOUD = c.CLOUD
  local CLOUD_DEPTH = c.CLOUD_DEPTH
  local GRENADE_BURST = c.GRENADE_BURST
  local strikes = c.strikes
  local arcs = c.arcs
  local tazed = c.tazed
  local effect_actor = c.effect_actor
  local electrical_targets = c.electrical_targets
  local target_radius = c.target_radius
  local electrical_trace = c.electrical_trace
  local find_target = c.find_target
  if wa.on.draw and wa.draw.ribbon then
    -- Resolve the pack namespace once for the many glow/beam submissions.
    local beam_sprite = wa.sprites.key(BEAM)
    local glow_sprite = wa.sprites.key(GLOW)
    local cloud_sprite = wa.sprites.key(CLOUD)
    local burst_sprite = wa.sprites.key(GRENADE_BURST)
    local function colour(a, r, g, b)
      return (math.floor(a) << 24) | (r << 16) | (g << 8) | b
    end
    -- wa.draw.quad and wa.draw.ribbon copy their table before returning, so
    -- one spec is refilled for every quad and every ribbon. A frame with
    -- dozens of arcs draws about a thousand glows: new tables for each made
    -- enough garbage to run Lua's GC inside the draw on most frames.
    local QUAD = { points = { {0, 0}, {0, 0}, {0, 0}, {0, 0} } }
    -- An axis-aligned square of half size hw by hh around x, y.
    local function square(sprite, frame, blend, color, depth, x, y, hw, hh)
      QUAD.sprite, QUAD.frame, QUAD.blend, QUAD.color, QUAD.depth = sprite, frame, blend, color, depth
      local p = QUAD.points
      p[1][1], p[1][2] = x - hw, y - hh
      p[2][1], p[2][2] = x + hw, y - hh
      p[3][1], p[3][2] = x + hw, y + hh
      p[4][1], p[4][2] = x - hw, y + hh
      wa.draw.quad(QUAD)
    end
    local function glow(x, y, size, color)
      local h = size / 2
      square(glow_sprite, 0, "add", color, ELECTRIC_DEPTH, x, y, h, h)
    end
    -- One ribbon's points, refilled: point(i, ...) sets the i-th, ribbon(n)
    -- draws the first n.
    local RIBBON = { sprite = beam_sprite, blend = "add", depth = ELECTRIC_DEPTH, points = {} }
    -- Keep shortened ribbons' point tables: the next arc may be longer again.
    local POINTS = {}
    local function point(i, x, y, width, u, color)
      local p = POINTS[i]
      if not p then p = {}; POINTS[i] = p end
      RIBBON.points[i] = p
      p.x, p.y, p.width, p.u, p.color = x, y, width, u, color
    end
    local function ribbon(n)
      local pts = RIBBON.points
      for i = #pts, n + 1, -1 do pts[i] = nil end
      wa.draw.ribbon(RIBBON)
    end
    -- PX's lightningstrike RenderLightning. Its shape is fractal noise, made
    -- afresh each game frame while the beam holds: each point is the middle of
    -- its two neighbours plus a random nudge, halving the span each pass. A
    -- look, so from wa.draw.random, never WA's generator.
    local LR, LG, LB = 120, 140, 255
    local function lerp(t, a, b) return a + (b - a) * t end
    local function noise_span(noise, off, divs, scale, first, last)
      for i = 0, divs - 1 do noise[off + i] = 0 end
      noise[off], noise[off + divs - 1] = first, last
      local k = divs
      local l = k >> 1
      while l > 0 do
        for i = l, divs - 1 - l, k do
          noise[off + i] = (noise[off + i - l] + noise[off + i + l]) * 0.5 + (wa.draw.random() * 2 - 1) * scale
        end
        k = l
        l = k >> 1
      end
    end
    -- The main beam's 9 points, and 6 branches of 9 at random points on it.
    local function new_shape(s)
      s.noise, s.attach = s.noise or {}, s.attach or {}
      for i = 1, 8 do s.attach[i] = nil end
      noise_span(s.noise, 0, 9, 1.0, 0, 0)
      for _ = 1, 6 do s.attach[1 + math.floor(wa.draw.random() * 8)] = true end
      for i = 0, 5 do
        local off = 2 + wa.draw.random() * 4
        if wa.draw.random() < 0.5 then off = -off end
        noise_span(s.noise, 9 + 9 * i, 9, 0.5, 0, off)
      end
      s.ground = 0.5 + wa.draw.random() * 0.3
      s.shape_tick = s.ticks
    end
    -- PX's RenderBeam: one textured strip through the noise, `width` (a half
    -- width, as PX's) tapering to `endwidth`, and a glow at every point fading
    -- towards the end.
    local function beam(noise, off, divs, width, endwidth, scale, x1, y1, x2, y2, glowalpha)
      if divs < 2 then return end
      local dx, dy = (x2 - x1), (y2 - y1)
      local dd = math.sqrt(dx * dx + dy * dy)
      if dd <= 0 then return end
      dx, dy = dx / dd, dy / dd
      local d = divs - 1
      for i = 0, divs - 1 do
        local f = i / d
        local n = noise[off + i] or 0
        local x = lerp(f, x1, x2) + scale * dy * n
        local y = lerp(f, y1, y2) - scale * dx * n
        point(i + 1, x, y, 2 * lerp(f, width, endwidth), f, colour(255, LR, LG, LB))
        local a = 255 * glowalpha * (1 - f)
        if a >= 1 then glow(x, y, 64, colour(a, LR, LG, LB)) end
      end
      ribbon(divs)
    end
    local function draw_strike(s)
      -- The cloud, dark and alpha-blended over the sky.
      for _, p in ipairs(s.cloud) do
        local t = p.age / p.life
        local size = lerp(t, p.s0, p.s1)
        square(cloud_sprite, 0, "alpha", colour(255 * t, 45, 40, 60), CLOUD_DEPTH, p.x, p.y, 64 * size, 40 * size)
      end
      for _, p in ipairs(s.sparks) do
        local t = p.age / 50
        glow(p.x, p.y, 13 * (1 - t) + 1, colour(255, LR, LG, LB))
      end
      if s.life <= 0 or s.delay >= 8 then return end
      if not s.noise or (s.delay == 0 and s.shape_tick ~= s.ticks) then new_shape(s) end
      -- Before it lands the beam grows down from the cloud over 8 frames.
      local divs, ex, ey = 9, s.ex, s.ey
      if s.delay > 0 then
        local fr = (8 - s.delay) / 8
        divs = math.floor(9 * fr)
        ex, ey = lerp(fr, s.sx, s.ex), lerp(fr, s.sy, s.ey)
      end
      beam(s.noise, 0, divs, 35, 3, 15, s.sx, s.sy, ex, ey, 1.0)
      local sub, d = 0, divs - 1
      for i = 0, divs - 1 do
        if s.attach[i] and d > 0 then
          local f = i / d
          local x = lerp(f, s.sx, ex) + 10 * s.diry * s.noise[i]
          local y = lerp(f, s.sy, ey) - 10 * s.dirx * s.noise[i]
          beam(s.noise, 9 + 9 * sub, 9, lerp(f, 10, 1), 0.1, 15 * (1 - f), x, y,
            x + s.dirx * 100 * (1 - f), y + s.diry * 100 * (1 - f), 0.5 * (1 - f))
          sub = sub + 1
        end
      end
      glow(s.sx + 10 * s.dirx, s.sy + 10 * s.diry, 230, colour(255, LR, LG, LB))
      if s.delay == 0 and s.hit then glow(s.ex, s.ey, 128 * s.ground, colour(255, LR, LG, LB)) end
    end
    wa.on.draw(function()
      for _, s in ipairs(strikes) do
        draw_strike(s)
      end
      for _, arc in ipairs(arcs) do
        if arc.explosion < 10 then
          local h = 75
          square(burst_sprite, arc.explosion, "add", 0x551E14EB, ELECTRIC_DEPTH, arc.burst_x, arc.burst_y, h, h)
        end
        if #arc.points >= 2 then
          -- PX's CTazerShot: one strip through the arc's points, thickest in
          -- the middle (9, a half width, as PX's), wobbling up to 10 px across
          -- its path by fractal noise made afresh each game frame, a glow at
          -- every point and a big one at the tip; all fading as the arc dies.
          if arc.shape_tick ~= arc.sound_age then
            -- One noise value per point; PX's fractal noise needs a power of
            -- two plus one values.
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
      -- PX's CTazerDamage glow on a linked Bowling Ball until it is zapped.
      for _, arc in ipairs(arcs) do
        for _, p in ipairs(arc.pending) do
          if p.key:sub(1, 5) == "ball:" then
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
          -- PX's tazed worm: a glow 0.4 to 0.7 of the sheet, flickering.
          glow(x, y, 128 * (0.4 + 0.3 * wa.draw.random()), colour(255, 80, 100, 255))
        end
      end
    end)
  end
end
return electrical
