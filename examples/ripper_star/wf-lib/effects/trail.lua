-- Project X's effect-manager trail: a short ribbon sampled in game frames and
-- drawn with `wa.draw.ribbon`. Consume with `require("wf-lib/effects/trail")`
-- and list `trail.BEAM`/`trail.GLOW` in the component's sprites.
-- See README.md for the sampling and width rules.

local trail = {}

-- PX bullet defaults; `add` copies them or takes the same names in `opts`.
trail.MAX, trail.EVERY, trail.VANISH = 12, 2, 2
trail.CORE_W, trail.GLOW_W = 8.0, 13.0
trail.R, trail.G, trail.B = 255, 255, 255
-- nil -> `wa.depth.OBJECTS`, resolved inside a game frame.
trail.DEPTH = nil
trail.BEAM = "wf-lib/effects/sprites/px_effects/beam.png"
trail.GLOW = "wf-lib/effects/sprites/px_effects/beam_glow.png"

local trails = {}
local live = {} -- round id -> trail while it is in the air
local driver, tick = nil, 0
-- Frames a live trail may go unsampled; 3 tolerates one skipped actor frame.
local STALE = 3

local function start_driver(t, owner)
  if driver then return end
  -- Hidden timer; `persist` keeps it alive through a blast so the shed never
  -- freezes. It exits when `trails` empties.
  driver = wa.actors.spawn({
    sprite = t.beam, visible = false, gravity = false, collide = false,
    persist = true, owner = owner,
    on = function(a)
      tick = tick + 1
      for i = #trails, 1, -1 do
        local v = trails[i]
        if v.live and tick - v.seen >= STALE then
          -- Its round stopped firing frames: hit, exploded or gone from the map.
          v.live = false
          live[v.id] = nil
        end
        if not v.live and tick % v.vanish == 0 then
          table.remove(v.pts, 1)
          if #v.pts == 0 then
            -- Remove the hole; the loop runs backwards so the shift is safe.
            table.remove(trails, i)
            live[v.id] = nil
          end
        end
      end
      if #trails == 0 then driver = nil; a:despawn() end
    end,
  })
end

-- Trail the round `id`; `opts` overrides any field above for this trail.
function trail.add(id, owner, opts)
  local t = {
    id = id, pts = {}, live = true, seen = tick,
    max = trail.MAX, every = trail.EVERY, vanish = trail.VANISH,
    core_w = trail.CORE_W, glow_w = trail.GLOW_W,
    r = trail.R, g = trail.G, b = trail.B,
    depth = trail.DEPTH, beam = trail.BEAM, glow = trail.GLOW,
  }
  -- Fixed key order; `pairs` would be unordered.
  for _, k in ipairs({
    "max", "every", "vanish", "core_w", "glow_w", "r", "g", "b", "depth", "beam", "glow",
  }) do
    if opts and opts[k] ~= nil then t[k] = opts[k] end
  end
  -- Resolve the depth default in a game frame, where `wa` exists.
  if t.depth == nil then t.depth = wa.depth.OBJECTS end
  trails[#trails + 1] = t
  live[id] = t
  start_driver(t, owner)
  return t
end

-- Is this round trailed? For attaching to rounds you did not launch yourself.
function trail.has(id)
  return live[id] ~= nil
end

-- The round is gone; start its fade now instead of waiting for STALE.
function trail.drop(id)
  local t = live[id]
  if t then
    t.live = false
    live[id] = nil
  end
end

-- PX's FillTrail for one round's frame; both missiles and actors call this.
function trail.sample(id, x, y, vx, vy)
  local t = live[id]
  if not t then return end
  t.seen = tick
  if tick % t.every ~= 0 then return end
  if math.abs(vx) < 0.15 and math.abs(vy) < 0.15 then return end
  local pts = t.pts
  local last = pts[#pts]
  if last
      and (last[1] - x) * (last[1] - x) + (last[2] - y) * (last[2] - y) <= 0.01 then
    return
  end
  pts[#pts + 1] = { x, y }
  if #pts > t.max then table.remove(pts, 1) end
end

local installed = false

-- Register callbacks from install(ctx); `wa` does not exist at require time.
function trail.install()
  if installed then return end
  installed = true

  -- Fill on the missile's frame; refresh `seen` on both phases so a live round
  -- is never mistaken for gone.
  wa.on.missile_frame(function(m)
    if m.phase ~= "post" then
      local t = live[m.id]
      if t then t.seen = tick end
      return
    end
    trail.sample(m.id, m.x, m.y, m.vx, m.vy)
  end)

  -- PX's DrawTrail. Reuse one ribbon spec: a table per draw made garbage.
  if wa.on.draw and wa.draw.ribbon then
    local RIBBON = { blend = "add", points = {} }
    local function pass(t, sprite, width)
      local pts, n = t.pts, #t.pts
      if n < 2 then return end -- `if (trailAmount < 2) return;` (:1300)
      RIBBON.sprite, RIBBON.depth = sprite, t.depth
      local rp = RIBBON.points
      for i = 1, n do
        -- PX's t: strength, texcoord and width in one number.
        local f = i / (n + 1)
        if f < 0.1 then f = 0.1 end
        local p = rp[i]
        if not p then p = {}; rp[i] = p end
        p.x, p.y, p.u, p.width = pts[i][1], pts[i][2], f, f * width
        p.color = (255 << 24) | (math.floor(t.r * f) << 16)
          | (math.floor(t.g * f) << 8) | math.floor(t.b * f)
      end
      for i = #rp, n + 1, -1 do rp[i] = nil end
      wa.draw.ribbon(RIBBON)
    end
    wa.on.draw(function()
      for _, t in ipairs(trails) do
        pass(t, t.beam, t.core_w)
        if t.glow_w > 0 then pass(t, t.glow, t.glow_w) end
      end
    end)
  end
end

return trail
