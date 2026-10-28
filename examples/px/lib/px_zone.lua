-- px_zone.lua -- PX's turn-timed objects, shared by the zone launcher's weapons.
--
-- PX's `CHealthZone` and `CBlast`
-- (`PX_pending/weapon_zones/scripts/zone_launchers_script.txt:71-230` and
-- `:233-348`) are one machine with two payloads, and the Spot Hider's mask
-- (`:356-369`) is that machine's lifetime with no payload and no box at all.
-- Three things are shared:
--
--   * **turns.** The object lives `turns` turn-ends (`CHealthZone::Message`
--     `M_TURNEND` :170-174, `CBlast::Message` `M_TURNEND` :308) and is freed
--     when they run out (:187-194, :313-319).
--   * **inactivity.** Seven seconds after a turn ends the object stops acting,
--     and the next turn's start wakes it (:175-183, :219-228; and the
--     `CWZone::active` the blast zone reads at :330 and re-arms on at
--     :343-346). PX's note on his own clock: "as soon as fps = 50 (1 sec), 7
--     here = 7 secs" (:222).
--   * **a box.** One object inside it -- PX's `activator` -- is all the payload
--     ever sees (:121, :205-217; the blast zone's species list :334). The Spot
--     Hider has none: its mask is a bare `CAnimation` (:367).
--
-- A weapon hands in a spec and gets a placer back:
--
--   local zone = require("lib/px_zone")
--   local ZONES = zone.register({ name = "Health Zone", fps = 50, radius = 20,
--     half_height = 15, kinds = { worm = true, grave = true },
--     tick = function (z, obj) ... end, draw = function (z) ... end })
--   ZONES.place(x, y, { turns = 6, owner = worm })
--
-- The spec's fields are PX's:
--
--   name             for the log only.
--   fps              the clock that class ticks at: 50 for the health zone
--                    (:87), 5 for the blast zone (:248). Left out: nothing to
--                    watch (the Spot Hider).
--   radius,          the box: half width and half height (`CWZone(x, y, 40, 30,
--   half_height      ...)` :382 is 40x30, the blast zone's 45x45 :374).
--   kinds            which object kinds count (PX's `OC_*` list, :334).
--   one_shot         `CBlast`'s `worknow`: act once per waking (:328-346).
--   next_turn        begin spending turns after the next turn starts.
--   fade_frames      visual-only tail after expiry; payload stops immediately.
--   wakes(z, obj)    whether this activator acts at all -- the health zone's
--                    resting-only rule while `start_be_inactive` (:207-213).
--   frame(z)         every world frame, before the fps gate (an animation).
--   tick(z, obj)     the payload.
--   draw(z)          the object in the world.
--   place(x, y, state)  takes `turns`, `owner` and whatever the payload reads.
--
-- Not ported, and why:
--   * PX's `M_SKIPTURN` guard (`CHealthZone::Message:169`) -- the engine's turn
--     events carry no "this turn was skipped" (crates/lua-host/src/dispatch.rs:
--     614-628), so a skipped turn spends a turn here;
--   * `SearchForWeapZone(zone_name)` (:199, :325) -- PX's zones live in his
--     engine's zone table; here the tick owns the object and its `activator`
--     outright, so there is nothing to look up.
--
-- A component's file, and anything it requires, runs where `wa` does not exist
-- yet: this module is pure data at load and touches `wa` only in `register`.

local M = {}

-- Every live object, in the order they were placed: the ticks and the draws
-- walk it in that order, which is what keeps two peers in step.
local objects = {}
local hooks_registered = false

-- The world runs at 50 frames a second (REPORT.md 13), so counting frames gives
-- every class the same seven seconds. PX's own counter instead ticks that class's
-- clock (`inactive_timer > 7`, :222) -- 8 ticks, i.e. 8 s on the health zone's
-- 1 Hz clock -- and in `CBlast` the counter is never read at all: what re-arms
-- the blast is the `CWZone`'s own `active` flag (:343-346), whose body is not in
-- the script. One shared frame count is the closest reading of PX's own note,
-- "as soon as fps = 50 (1 sec), 7 here = 7 secs" (:222).
local FPS = 50
local INACTIVE_FRAMES = 7 * FPS

local function forget(o)
  if o.actor then o.actor:despawn() end
  for i, other in ipairs(objects) do
    if other == o then
      table.remove(objects, i)
      break
    end
  end
end

-- PX's `activator`: the one object the payload acts on -- the nearest of the
-- kinds this class watches inside its box, ties by id, so every peer picks the
-- same one (`AddHealth`/`DamageHealth` :121-165, the blast zone :330-341).
local function activator(o)
  local spec = o.spec
  local found, best
  for _, obj in ipairs(wa.world.electrical_nearby(o.x, o.y, spec.reach, true)) do
    if spec.kinds[obj.kind] then
      local dx, dy = (obj.x or o.x) - o.x, (obj.y or o.y) - o.y
      if math.abs(dx) <= spec.radius and math.abs(dy) <= spec.half_height then
        local d = dx * dx + dy * dy
        if not best or d < best or (d == best and obj.id < found.id) then
          found, best = obj, d
        end
      end
    end
  end
  return found
end

-- PX's per-object `M_FRAME` (:184-229, :310-347), run once a world frame by an
-- actor with no body.
local function tick(o)
  local spec = o.spec
  o.timer = o.timer + 1
  if spec.frame then spec.frame(o) end
  if o.turns <= 0 then
    o.fade = (o.fade or 0) + 1
    if o.fade >= (spec.fade_frames or 0) then forget(o) end
    return
  end
  if spec.fps and o.timer % spec.fps == 0 then
    if spec.one_shot then
      -- `CBlast`'s `worknow`: it booms, then waits to be re-armed (:328-346).
      -- PX's re-arm test is the `CWZone`'s own `active` flag, whose body is not
      -- in the script, and it may well go false and true again inside one turn
      -- (a worm stepping out of the box and back in); the port re-arms only
      -- while the object sleeps, so one boom a turn is the conservative reading
      -- of "it explodes when something comes in", and the one PX's own
      -- `start_be_inactive`/`active` pair is built for (ASSUMPTIONS A11).
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

-- PX's M_TURNEND (:170-174, :308): every turn ended spends one of every
-- object's turns, and starts its seven-second countdown.
local function spend_turn()
  for _, o in ipairs(objects) do
    if o.counting then o.turns = o.turns - 1 end
    o.start_be_inactive = true
    o.inactive = 0
  end
end

-- PX's M_TURNBEGIN (:175-183): a live object wakes for the new turn.
local function wake()
  for _, o in ipairs(objects) do
    o.counting = true
    o.active, o.start_be_inactive, o.inactive = true, false, 0
  end
end

-- One rotated square of a sheet, centred on (x, y): PX's `CAnimation` in the
-- world, drawn as the engine's quad. A quad is also the only way a pack draws a
-- sheet with an alpha of its own -- an actor's tint word spends its alpha byte
-- on the blend mode (crates/lua-host/src/actor.rs:173-186), while a quad's is
-- real alpha, premultiplied (`crates/engine/src/gpu.rs:699-710`).
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

-- One quad, reused: the engine copies the table on the call, so mutating it
-- between draws is what the dev's own packs do (`mods/px/weapons/
-- electromagnet.lua:319`, `bowling_ball.lua:550`).
M._quad = { frame = 0, points = { { 0, 0 }, { 0, 0 }, { 0, 0 }, { 0, 0 } } }

-- A weapon joins the shared machinery and gets its placer back.
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

  -- PX's `CMissile::ExplodeAt`'s branch for this weapon (:377-384, :370-376):
  -- the object is placed where the round stopped. `state` becomes the object
  -- itself -- the payload's own table, taken as it is rather than copied field by
  -- field, so nothing iterates a hash in an order two peers could disagree on.
  -- It carries `turns` (required) and `owner`, plus whatever `tick`, `frame` and
  -- `draw` read back out (the health zone's `healing`, the blast zone's `colour`
  -- and its animation phase).
  function class.place(x, y, state)
    local o = state or {}
    o.spec, o.x, o.y, o.timer = spec, x, y, 0
    o.active, o.start_be_inactive, o.inactive = true, false, 0
    o.counting = not spec.next_turn
    o.armed = spec.one_shot and true or false
    -- PX's objects are `CObject`s that live on M_FRAME (:167-230, :306-347):
    -- here that is an actor with a per-frame brain and no body -- brains run on
    -- the world's FRAME_FINISH, so the same frame on every peer
    -- (crates/lua-host/src/actor.rs).
    o.actor = wa.actors.spawn({
      sprite = false, x = x, y = y, gravity = false, collide = false,
      owner = o.owner, on = { frame = function() tick(o) end },
    })
    objects[#objects + 1] = o
    return o
  end

  return class
end

return M
