-- PX's effect-manager trail: one ribbon per round, sampled in game frames.

local trail = {}

trail.MAX, trail.EVERY, trail.VANISH = 12, 2, 2
trail.CORE_W, trail.GLOW_W = 8.0, 13.0
trail.R, trail.G, trail.B = 255, 255, 255
trail.DEPTH = nil
trail.BEAM = "sprites/px_effects/beam.png"
trail.GLOW = "sprites/px_effects/beam_glow.png"

local trails = {}
local keys = {}
local live = {}
local driver, tick = nil, 0
local STALE = 2

local function start_driver(t, owner)
  if driver then return end
  driver = wa.actors.spawn({
    sprite = t.beam, visible = false, owner = owner,
    on = function(a)
      tick = tick + 1
      for i = #trails, 1, -1 do
        local v = trails[i]
        if v.live and tick - v.seen >= STALE then
          v.live = false
          live[v.id] = nil
          if v.kept then v.kept:finish() end
        end
        if v.kept and not v.live then
          table.remove(trails, i)
        elseif not v.live and tick % v.vanish == 0 then
          table.remove(v.pts, 1)
          if #v.pts == 0 then
            table.remove(trails, i)
            live[v.id] = nil
          end
        end
      end
      if #trails == 0 then driver = nil; a:remove() end
    end,
  })
end

function trail.add(id, owner, opts)
  local t = {
    id = id, pts = {}, live = true, seen = tick,
    max = trail.MAX, every = trail.EVERY, vanish = trail.VANISH,
    core_w = trail.CORE_W, glow_w = trail.GLOW_W,
    r = trail.R, g = trail.G, b = trail.B,
    depth = trail.DEPTH, beam = trail.BEAM, glow = trail.GLOW,
  }
  for _, k in ipairs({
    "max", "every", "vanish", "core_w", "glow_w", "r", "g", "b", "depth", "beam", "glow",
  }) do
    if opts and opts[k] ~= nil then t[k] = opts[k] end
  end
  if t.depth == nil then t.depth = wa.depth.OBJECTS end
  if wa.draw.trail then
    local glow = t.glow_w > 0
    t.kept = wa.draw.trail({
      sprite = keys[t.beam] or t.beam, width = t.core_w,
      glow = glow and (keys[t.glow] or t.glow) or nil, glow_width = glow and t.glow_w or nil,
      color = (255 << 24) | (math.floor(t.r) << 16) | (math.floor(t.g) << 8) | math.floor(t.b),
      max = t.max, shed = t.vanish, floor = 0.1, blend = "add", depth = t.depth,
    })
  end
  trails[#trails + 1] = t
  live[id] = t
  start_driver(t, owner)
  return t
end

function trail.has(id)
  return live[id] ~= nil
end

function trail.drop(id)
  local t = live[id]
  if t then
    t.live = false
    live[id] = nil
    if t.kept then t.kept:finish() end
  end
end

local installed = false

function trail.install()
  if installed then return end
  installed = true
  keys[trail.BEAM] = wa.sprites.key(trail.BEAM)
  keys[trail.GLOW] = wa.sprites.key(trail.GLOW)

  wa.on.missile_frame(function(m)
    local t = live[m.id]
    if not t then return end
    t.seen = tick
    if m.phase ~= "post" then return end
    if tick % t.every ~= 0 then return end
    if math.abs(m.vx) < 0.15 and math.abs(m.vy) < 0.15 then return end
    local pts = t.pts
    local last = pts[#pts]
    if last
        and (last[1] - m.x) * (last[1] - m.x) + (last[2] - m.y) * (last[2] - m.y) <= 0.01 then
      return
    end
    pts[#pts + 1] = { m.x, m.y }
    if #pts > t.max then table.remove(pts, 1) end
    if t.kept then t.kept:push(m.x, m.y) end
  end)

  if wa.on.draw and wa.draw.ribbon and not wa.draw.trail then
    local RIBBON = { blend = "add", points = {} }
    local ramps = {} -- "r,g,b" -> n -> { f = {...}, color = {...} }
    local function ramp(t, n)
      local by_n = t.ramps
      if not by_n then
        local key = t.r .. "," .. t.g .. "," .. t.b
        by_n = ramps[key]
        if not by_n then by_n = {}; ramps[key] = by_n end
        t.ramps = by_n
      end
      local r = by_n[n]
      if r then return r end
      r = { f = {}, color = {} }
      for i = 1, n do
        local f = i / (n + 1)
        if f < 0.1 then f = 0.1 end
        r.f[i] = f
        r.color[i] = (255 << 24) | (math.floor(t.r * f) << 16)
          | (math.floor(t.g * f) << 8) | math.floor(t.b * f)
      end
      by_n[n] = r
      return r
    end
    local function draw(t)
      local pts, n = t.pts, #t.pts
      if n < 2 then return end -- `if (trailAmount < 2) return;`
      local r = ramp(t, n)
      local fs, colors = r.f, r.color
      local rp = RIBBON.points
      local width = t.core_w
      for i = 1, n do
        local p = rp[i]
        if not p then p = {}; rp[i] = p end
        local pt, f = pts[i], fs[i]
        p.x, p.y, p.u, p.width, p.color = pt[1], pt[2], f, f * width, colors[i]
      end
      for i = #rp, n + 1, -1 do rp[i] = nil end
      RIBBON.sprite, RIBBON.depth = keys[t.beam] or t.beam, t.depth
      wa.draw.ribbon(RIBBON)
      if t.glow_w > 0 then
        width = t.glow_w
        for i = 1, n do rp[i].width = fs[i] * width end
        RIBBON.sprite = keys[t.glow] or t.glow
        wa.draw.ribbon(RIBBON)
      end
    end
    wa.on.draw(function()
      for _, t in ipairs(trails) do draw(t) end
    end)
  end
end

return trail
