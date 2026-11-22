-- px_zone.lua: PX's turn-timed objects, shared by the zone launcher's weapons.

local M = {}

local objects = {}
local hooks_registered = false

local FPS = 50
local INACTIVE_FRAMES = 7 * FPS

local CRATE_RADIUS = 9

local function forget(o)
  if o.actor then o.actor:remove() end
  for i, other in ipairs(objects) do
    if other == o then
      table.remove(objects, i)
      break
    end
  end
end

local RANK = { worm = 1, grave = 2 }
local function stable(obj)
  if obj.kind == "worm" then return obj.id end
  if obj.kind == "grave" then return obj.worm_id end
  return 0
end
local function before(a, b)
  local ra, rb = RANK[a.kind] or 3, RANK[b.kind] or 3
  if ra ~= rb then return ra < rb end
  local sa, sb = stable(a), stable(b)
  if sa ~= sb then return sa < sb end
  return a.id < b.id
end

local function activator(o)
  local spec = o.spec
  local found, best
  for _, obj in ipairs(wa.world.electrical_nearby(o.x, o.y, spec.reach, true)) do
    if spec.kinds[obj.kind] then
      local dx, dy = (obj.x or o.x) - o.x, (obj.y or o.y) - o.y
      if math.abs(dx) <= spec.radius and math.abs(dy) <= spec.half_height then
        local d = dx * dx + dy * dy
        if not best or d < best or (d == best and before(obj, found)) then
          found, best = obj, d
        end
      end
    end
  end
  return found
end

local CRATE = { kind = "crate" }
local function crates(o)
  local spec = o.spec
  local rx, ry = spec.radius + CRATE_RADIUS, spec.half_height + CRATE_RADIUS
  local near = { near = { o.x, o.y, math.max(rx, ry) * 1.5 } }
  for _, crate in ipairs(wa.crates.all(near)) do
    local key = crate.id
    if not o.crates_hit[key]
        and math.abs(crate.x - o.x) <= rx and math.abs(crate.y - o.y) <= ry then
      o.crates_hit[key] = true
      crate:hit(spec.every_crate, 0, 0)
      spec.tick(o, CRATE)
      if o.active then o.armed = false end
      return
    end
  end
end

local function tick(o)
  local spec = o.spec
  o.timer = o.timer + 1
  if spec.frame then spec.frame(o) end
  if o.turns <= 0 then
    o.fade = (o.fade or 0) + 1
    if o.fade >= (spec.fade_frames or 0) then forget(o) end
    return
  end
  if spec.every_crate then crates(o) end
  if spec.fps and o.timer % spec.fps == 0 then
    if spec.one_shot then
      if not o.active then
        o.armed = true
      elseif o.armed then
        local obj = activator(o)
        if obj and spec.wakes(o, obj) then
          spec.tick(o, obj)
          o.armed = false
        end
      end
    elseif o.active then
      local obj = activator(o)
      if obj and spec.wakes(o, obj) then spec.tick(o, obj) end
    end
  end
  if o.start_be_inactive then
    o.inactive = o.inactive + 1
    if o.inactive > INACTIVE_FRAMES then
      o.active, o.start_be_inactive, o.inactive = false, false, 0
    end
  end
end

local function spend_turn()
  for _, o in ipairs(objects) do
    if o.counting then o.turns = o.turns - 1 end
    o.start_be_inactive = true
    o.inactive = 0
  end
end

local function wake()
  for _, o in ipairs(objects) do
    o.counting = true
    o.active, o.start_be_inactive, o.inactive = true, false, 0
  end
end

function M.mark(sheet, x, y, size, angle, colour, blend, depth, frame)
  local half = size / 2
  local c, s = wa.math.cos(angle) * half, wa.math.sin(angle) * half
  local p = M._quad.points
  p[1][1], p[1][2] = x - c + s, y - s - c
  p[2][1], p[2][2] = x + c + s, y + s - c
  p[3][1], p[3][2] = x + c - s, y + s + c
  p[4][1], p[4][2] = x - c - s, y - s + c
  M._quad.sprite, M._quad.frame = sheet, frame
  M._quad.color, M._quad.blend, M._quad.depth = colour, blend, depth
  wa.draw.quad(M._quad)
end

M._quad = { frame = 0, points = { { 0, 0 }, { 0, 0 }, { 0, 0 }, { 0, 0 } } }

function M.register(spec)
  if not hooks_registered then
    hooks_registered = true
    wa.on.turn_end(spend_turn)
    wa.on.turn_start(wake)
    if wa.on.draw and wa.draw.quad then
      wa.on.draw(function()
        for _, o in ipairs(objects) do
          if o.spec.draw and (o.turns > 0 or o.spec.fade_frames) then o.spec.draw(o) end
        end
      end)
    end
  end
  if spec.radius and not spec.reach then
    spec.reach = math.max(spec.radius, spec.half_height or spec.radius)
  end
  if not spec.wakes then spec.wakes = function() return true end end

  local class = {}

  function class.place(x, y, state)
    local o = state or {}
    o.spec, o.x, o.y, o.timer = spec, x, y, 0
    o.active, o.start_be_inactive, o.inactive = true, false, 0
    o.counting = not spec.next_turn
    o.armed = spec.one_shot and true or false
    o.crates_hit = {}
    o.actor = wa.actors.spawn({
      sprite = false, x = x, y = y,
      owner = o.owner, on = { frame = function() tick(o) end },
    })
    objects[#objects + 1] = o
    return o
  end

  return class
end

return M
