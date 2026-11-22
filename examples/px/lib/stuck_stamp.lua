-- Where a stamp stuck in the land may go without trapping a worm in new land.

local stuck_stamp = {}

local bars = {}
local function pixels(frame, bar, dx, dy)
  local key = frame .. ":" .. bar.half_length .. ":" .. bar.half_width
  local list = bars[key]
  if list then return list end
  list = {}
  local seen = {}
  for t2 = -2 * bar.half_length, 2 * bar.half_length do
    for s2 = -2 * bar.half_width, 2 * bar.half_width do
      local t, s = t2 / 2, s2 / 2
      local ox, oy = math.floor(dx * t - dy * s + 0.5), math.floor(dy * t + dx * s + 0.5)
      local k = ox * 1024 + oy
      if not seen[k] then
        seen[k] = true
        list[#list + 1] = { ox, oy }
      end
    end
  end
  bars[key] = list
  return list
end

local function holds(w, px, py, list, solid)
  local x0, x1 = math.floor(w.x) - 5, math.floor(w.x) + 5
  local y0, y1 = math.floor(w.y) - 10, math.floor(w.y) + 7
  for _, o in ipairs(list) do
    local x, y = px + o[1], py + o[2]
    if x >= x0 and x <= x1 and y >= y0 and y <= y1 and not solid(x, y) then return true end
  end
  return false
end

function stuck_stamp.place(x, y, frame, bar)
  local rad = math.rad(frame * 11.25)
  local dx, dy = wa.math.sin(rad), -wa.math.cos(rad)
  local list = pixels(frame, bar, dx, dy)
  local near = {}
  for _, w in ipairs(wa.worms.all()) do
    if w.hp > 0 and math.abs(w.x - x) < 80 and math.abs(w.y - y) < 80 then near[#near + 1] = w end
  end
  table.sort(near, function(p, q) return p.id < q.id end)
  local seen = {}
  local function solid(px, py)
    local k = px * 65536 + py
    local v = seen[k]
    if v == nil then v = wa.land.solid(px, py); seen[k] = v end
    return v
  end
  local held
  for d = 0, bar.half_length + 10 do
    local cx, cy = x + dx * d, y + dy * d
    local px, py = math.floor(cx), math.floor(cy)
    if d == 0 or solid(px + math.floor(dx * bar.half_length + 0.5), py + math.floor(dy * bar.half_length + 0.5)) then
      held = nil
      for _, w in ipairs(near) do
        if holds(w, px, py, list, solid) then held = w; break end
      end
      if not held then return cx, cy, d end
    end
  end
  return nil, held
end

return stuck_stamp
