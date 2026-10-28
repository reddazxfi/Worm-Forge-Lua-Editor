-- fire_seq.lua: the sequential-firing base.
-- Fires the first shot from `on_fire`; a hidden timer fires the rest `delay`
-- frames apart and holds WA's shot counters so the worm stays in its firing
-- state. The counters are written only from the timer, never from `on_fire`.
-- A cancel or interruption ends WA's repeat fire and settles `on_done`.
-- See README.md for the API and the rejected alternatives.

local M = {}

-- Sequencer keys; everything else is passed to spawn/launch.
local CONTROL = {
  count = true, delay = true, spread = true, on_shot = true, on_done = true,
  standoff = true, cancel_weapon = true,
}

local function is_control(k) return CONTROL[k] == true end

-- Copy the shot spec without the sequencer's keys.
local function shot_spec(t)
  local out = {}
  for k, v in next, t do
    if not is_control(k) then out[k] = v end
  end
  return out
end

-- A number, or a function of (shot number, worm). `i` is 1-based.
local function value(v, i, w, fallback)
  if type(v) == "function" then return v(i, w) end
  if v == nil then return fallback end
  return v
end

-- `wa.random` takes integer bounds; scale the spread to thousandths first.
local function jitter(amount)
  if not amount or amount <= 0 then return 0 end
  local n = math.floor(amount * 1000 + 0.5)
  if n < 1 then return 0 end
  return wa.random(-n, n) / 1000
end

-- Resolve one shot's position and velocity: the velocity first (so a standoff
-- can be taken along it), then the position, then the spread.
local function resolve(spec, t, i, w)
  spec.vx = value(t.vx, i, w, 0)
  spec.vy = value(t.vy, i, w, 0)
  local spread = t.spread
  if spread then
    spec.vx = spec.vx + jitter(spread.x)
    spec.vy = spec.vy + jitter(spread.y)
  end
  spec.x = value(t.x, i, w, w and w.x or 0)
  spec.y = value(t.y, i, w, w and w.y or 0)
  -- Start the shot clear of the firing worm, along its own velocity.
  local so = t.standoff
  if so and so > 0 then
    local d = math.sqrt(spec.vx * spec.vx + spec.vy * spec.vy)
    if d > 0 then
      spec.x = spec.x + (spec.vx / d) * so
      spec.y = spec.y + (spec.vy / d) * so
    end
  end
  return spec
end

-- Bursts mid-flight, already settled, and told to stop. The timer settles
-- `on_done` outside WA's fire call.
local running = {}
local settled = {}
local cancelled = {}

-- Frames to swallow WA's queued re-fire after the last shot.
local DRAIN = 10

-- WA states a worm is not firing in. Raw values: `worm.state` returns nil for
-- walking and the hit/blast states. The firing states 0x67-0x6B are absent.
local NOT_FIRING = {
  [0x65] = true, -- standing
  [0x66] = true, -- walking
  [0x6C] = true, -- punching
  [0x6E] = true, -- drilling
  [0x6F] = true, -- teleporting
  [0x70] = true, -- rope_firing?
  [0x71] = true, -- torching?
  [0x73] = true, -- rope_rolling?
  [0x76] = true, -- getting_up
  [0x77] = true, -- jump_prepare
  [0x78] = true, -- jetpacking
  [0x79] = true, -- jumping
  [0x7A] = true, -- jump_falling
  [0x7B] = true, -- roping?
  [0x7C] = true, -- bungee
  [0x7D] = true, -- parachuting
  [0x7E] = true, -- falling / sliding
  [0x7F] = true, -- tumbling
  [0x80] = true, -- hit
  [0x81] = true, -- blasted
  [0x82] = true, -- dying?
  [0x85] = true, -- drowning?
  [0x86] = true, -- frozen
  [0x87] = true, -- dead?
}

-- `fire(i)` launches one shot; `weapon` is the id the worm must still hold.
local function run(owner, count, delay, fire, weapon, on_done)
  if not owner or count < 1 then return nil end

  local id = owner.id
  -- WA's own re-fire of a burst already in flight; it owns every shot.
  if id ~= nil and running[id] then return nil end

  local function alive()
    return owner.hp and owner.hp > 0
  end

  if not alive() then return nil end

  -- End WA's repeat fire, as when its shots run out.
  local function end_fire()
    if owner.shots_to_fire then owner.shots_fired = owner.shots_to_fire end
  end
  -- Keep the worm in its firing state for the whole burst.
  local function hold()
    owner.shots_fired, owner.shots_to_fire = 0, 1
  end
  local function release()
    if id ~= nil then
      running[id] = nil
      settled[id] = nil
      cancelled[id] = nil
    end
  end
  -- Shots left, including one launched in the same tick as a cancel.
  local left = count - 1
  -- Every end -- last shot, cancel, interruption -- settles `on_done` here.
  local function settle()
    if id ~= nil then settled[id] = true end
    end_fire()
    if on_done then on_done(owner, count - left) end
    release()
  end
  local function frame_delay(i)
    return math.max(1, math.floor(value(delay, i, owner, 1)))
  end
  -- Stop if the worm died, lost the turn or weapon, or left its firing state.
  local function interrupted()
    return cancelled[id] == true
      or not alive() or not owner.turn
      or weapon == nil
      or (weapon ~= nil and owner.weapon ~= weapon)
      or NOT_FIRING[owner.state_id] == true
  end

  if id ~= nil then running[id] = true end
  fire(1)
  if count == 1 then
    -- One shot is WA's own; nothing was held, and there is nothing to end.
    release()
    return nil
  end
  -- Do not hold the counters here: on_fire for a projectile runs inside WA's
  -- own fire loop. The timer holds them a frame later.

  local wait = frame_delay(2)
  local drain = 0
  local ticker
  ticker = wa.actors.spawn({
    -- Bodiless timer. `persist` survives a nearby blast so the state check,
    -- not the actor's death, ends the burst.
    sprite = false, x = owner.x, y = owner.y,
    gravity = false, collide = false, persist = true, drown = false,
    owner = owner,
    on = function(a)
      -- A frame clock only; the safe place to hold the worm's counters.
      a.vx, a.vy = 0, 0
      if drain > 0 then
        -- Swallow WA's queued re-fire.
        drain = drain - 1
        if drain <= 0 then
          release()
          a:despawn()
        end
        return
      end
      -- The worm's state ends the burst; always release the counters.
      if interrupted() then
        settle()
        a:despawn()
        return
      end
      wait = wait - 1
      if wait > 0 then hold() return end
      if left > 0 then
        left = left - 1
        local n = count - left
        fire(n)
        if cancelled[id] then
          -- The shot itself cancelled; settle after WA's fire call returns.
          settle()
          a:despawn()
          return
        end
        if left > 0 then
          wait = frame_delay(n + 1)
          hold()
        else
          -- The last shot has left: let WA finish the shot and retreat.
          if id ~= nil then settled[id] = true end
          end_fire()
          if on_done then on_done(owner, count) end
          drain = DRAIN
        end
      end
    end,
  })
  return ticker
end

-- Stop the burst for `owner` and end WA's counters now. The timer settles
-- `on_done` on its next tick. False if there is nothing left to settle.
function M.cancel(owner)
  local id = owner and owner.id
  if id == nil or not running[id] then return false end
  cancelled[id] = true
  if owner.shots_to_fire then owner.shots_fired = owner.shots_to_fire end
  return settled[id] ~= true
end

-- Fire `opts.count` actors, `opts.delay` frames apart; other keys are spawn.
function M.fire_sequential_actor(opts)
  if type(opts) ~= "table" then return nil end
  local count = opts.count or 1
  local delay = opts.delay or 1
  local owner = opts.owner
  if type(owner) ~= "table" and type(owner) ~= "userdata" then
    -- A plain table would read hp/x/y but spawn refuses it.
    wa.log("fire_sequential_actor: owner must be the firing worm")
  end
  local on_shot = opts.on_shot
  local function fire(i)
    if on_shot then on_shot(i, owner) end
    local spec = resolve(shot_spec(opts), opts, i, owner)
    if spec.owner == nil then spec.owner = owner end
    wa.actors.spawn(spec)
  end
  return run(owner, count, delay, fire, opts.cancel_weapon, opts.on_done)
end

-- Fire `params.count` real WA missiles, `params.delay` frames apart.
function M.fire_seq_mis(params)
  if type(params) ~= "table" or not params.weapon then
    wa.log("fire_seq_mis: params.weapon is required")
    return nil
  end
  local count = params.count or 1
  local delay = params.delay or 1
  local owner = params.owner
  local on_shot = params.on_shot
  local failed = false
  local function fire(i)
    if on_shot then on_shot(i, owner) end
    local spec = resolve(shot_spec(params), params, i, owner)
    if spec.owner == nil then spec.owner = owner end
    local ok, err = pcall(wa.weapons.launch, spec)
    if not ok and not failed then
      -- A full object pool raises; do not kill the timer's brain over it.
      failed = true
      wa.log("fire_seq_mis: launch failed: " .. tostring(err))
    end
  end
  return run(owner, count, delay, fire, params.cancel_weapon or params.weapon,
    params.on_done)
end

return M
