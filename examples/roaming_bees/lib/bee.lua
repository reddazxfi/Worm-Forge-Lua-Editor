-- Keeper Bee: PX's bee AI, shared by the launcher and the map swarm.
-- API 4 uses wa.math, integer wa.random, turn-start spawning and a real body
-- moved by WA (`on.bump`). See logging_problems.md for the port notes.

local M = {}

-- Verbose spawn logging; the swarm's summary line is always logged.
M.DEBUG = false

-- The bundle's own files, named once.
M.SPRITE = "sprites/bee_flight.png"
-- Engine collision mask; `on.bump` needs the body to carry `hits`.
M.BODY_MASK = "sprites/bee/bee_mask.png"
M.SOUNDS = {
  "sounds/bzz1.wav",
  "sounds/bzz2.wav",
  "sounds/bzz3.wav",
  "sounds/bzz4.wav",
}

-- WA's aim and throw slots, as the original's `worm_sprites`.
M.WORM_SPRITES = {
  weaponlnk = "sprites/aim_p_muitb55w.gif",
  weaponlnku = "sprites/aim_u_muitb55w.gif",
  weaponlnkd = "sprites/aim_d_muitb55w.gif",
  wthrow = "sprites/draw_p_muitb55w.gif",
  wthrowu = "sprites/draw_u_muitb55w.gif",
  wthrowd = "sprites/draw_d_muitb55w.gif",
}

-------------------------------------------------------------------------------
-- Map Auto-Spawn Configuration (:4-8)
-------------------------------------------------------------------------------
local BEE_SPAWN_QUANTITY  = 22
local BEE_SPAWN_TRIES_PER_SLICE = 999
local SPAWN_TOP_MARGIN_PX = 100  -- don't probe within this far of the map's ceiling
local swarmPlanted        = false

-- Bee AI Constants (:11-46)
local SENSOR_RADIUS_PX  = 235
local CONTACT_RADIUS_PX = 26
local CHASE_SPEED       = (3.5)
local CHASE_STRENGTH    = 0.14
local CHASE_STEER_EVERY = 1
local ROAM_SPEED        = (0.6)
local ROAM_SPEED_BASE   = 0.12
local ROAM_COOLDOWN_MIN = 10
local ROAM_COOLDOWN_MAX = 20
local ROT_SMOOTH_DEG    = 4
local ROAM_STRENGTH     = 0.12
local ROAM_STEER_EVERY  = 1
local BONK_LIMIT        = 4
local SPIN_FRAMES       = 20
local MAX_HP            = 25
local ROAM_RANGE_X      = 55
local ROAM_RANGE_Y      = 110
local ROAM_ARRIVE_PX    = 20
local BEE_RADIUS_PX     = 4
local CORNER_BUFFER_PX  = 2
local HOMING_MAX_DIST_PX = 470
local HOMING_MAX_DURATION = 160
local ROAM_MAX_DIST_PX   = 420
local LOOKOUT_COOLDOWN_GIVEUP  = 150
local LOOKOUT_COOLDOWN_TIMEOUT = 200

local ROAM_FAIL_THRESHOLD  = 10
local ROAM_FAIL_SCALE      = 0.5
local CLIP_FRAMES_LIMIT    = 6   -- frames with the centre inside land before it is pulled out
local UNBURY_MAX_RADIUS_PX = 150  -- how far out the search for a free spot goes

-- Only spawn where this disc is free; raise it if bees still touch terrain.
local SPAWN_CLEAR_RADIUS_PX = 7
-- WA's move replaces the second step `a:move` added; 1.0 = PX's speeds.
local SPEED_SCALE = 2.0
-- Frames to ignore worms after a land bump, so the bee does not re-pick it.
local BUMP_LOOKOUT_FRAMES = 45

local ROAM_SLOWDOWN_RADIUS_PX = 60
local ROAM_SLOWDOWN_MIN_FRAC  = 0.35

local BEE_FRAME_COUNT = 4
local BEE_FRAME_HOLD  = 5
local BEE_FRAME_HOLD_MIN = 2

local state = {}

local function log(msg)
  if M.DEBUG then wa.log(msg) end
end

-- `wa.math.atan` returns radians, the original wanted degrees (:426, :461).
local function deg(rad)
  return rad * (180 / math.pi)
end

-- `wa.random` takes whole numbers; the original's ranges are fractional.
local function rand(lo, hi)
  return wa.random(math.floor(lo), math.floor(hi))
end

local function shouldStop(s)
  return s.dead or s.freeMe or s.stopMe
end

-- A damaged bee spins; when the spin runs out it detonates.
local function takeHit(a, s, damage, spin)
  if (damage or 0) <= 0 then return end
  s.hp = s.hp - damage
  if spin ~= false then
    s.spin = true
    s.spinN = (s.spinN or 0) + 8
  end
  if s.hp <= 0 then s.dead = true; log("[BEE] dead: hp<=0 (damage)") end
end

local function playBuzz(target)
  if not target or #M.SOUNDS == 0 then return end
  local snd = M.SOUNDS[rand(1, #M.SOUNDS)]
  wa.sound.play(target, snd)
end

local function isClearOfTerrain(x, y, radiusPx)
  local r = math.max(math.floor(radiusPx or 0), SPAWN_CLEAR_RADIUS_PX)
  local cx, cy = math.floor(x), math.floor(y)
  local r2 = r * r
  for dy = -r, r do
    for dx = -r, r do
      if dx * dx + dy * dy <= r2 and wa.land.solid(cx + dx, cy + dy) then
        return false
      end
    end
  end
  return true
end

-- ported from PX utils_Red (:76-111)
-- `strict`: nothing found means nil, not the target (which may be inside land).
local function checkSpawnPoint(obj, x, y, targetX, targetY, maxRadius, clearRadius, strict)
  maxRadius = maxRadius or 50
  clearRadius = clearRadius or (BEE_RADIUS_PX + 1)
  local worm = wa.worms.nearest(obj)
  -- Only a worm handle answers `:fits`.
  if obj and obj.kind ~= "worm" then obj = worm end

  local r = 0
  while r <= maxRadius do
    local step = (r == 0) and 360 or math.max(15, math.floor(360 / (r / 2) + 0.5))
    local angdeg = 0
    while angdeg < 360 do
      local rad = angdeg * math.pi / 180
      local tx = x + math.floor(r * wa.math.cos(rad))
      local ty = y + math.floor(r * wa.math.sin(rad))
      local fitsHere = false
      if obj and type(obj.fits) == "function" and obj.kind == "worm" then
        fitsHere = obj:fits(tx, ty)
      else
        fitsHere = true
      end
      -- The bee's own disc must fit, and the target must be visible.
      if fitsHere then fitsHere = isClearOfTerrain(tx, ty, clearRadius) end
      if fitsHere then
        local hit = wa.land.trace(tx, ty, targetX, targetY)
        if not hit or not hit.hit then
          return tx, ty
        end
      end
      angdeg = angdeg + step
    end
    r = r + 4 -- Step outward cleanly in native units
  end
  if strict then return nil, nil end
  return targetX, targetY
end

-- Sampled disc test: centre, half-radius ring, full-radius ring.
local function roomClear(x, y, r)
  if wa.land.solid(x, y) then return false end
  for i = 0, 15 do
    local ang = i * math.pi / 8
    local c, sn = wa.math.cos(ang), wa.math.sin(ang)
    if wa.land.solid(math.floor(x + c * r + 0.5), math.floor(y + sn * r + 0.5)) then return false end
    if i % 2 == 0 and wa.land.solid(math.floor(x + c * r * 0.5 + 0.5), math.floor(y + sn * r * 0.5 + 0.5)) then return false end
  end
  return true
end

-- A bee in a slit needs at least one open direction; probe eight.
local ESCAPE_TRACE_PX = 18
local function hasEscapeRoom(x, y)
  local blockedN = 0
  for i = 0, 7 do
    local ang = i * math.pi / 4
    local hit = wa.land.trace(x, y, math.floor(x + wa.math.cos(ang) * ESCAPE_TRACE_PX + 0.5),
                                    math.floor(y + wa.math.sin(ang) * ESCAPE_TRACE_PX + 0.5))
    if hit and hit.hit then blockedN = blockedN + 1 end
  end
  return blockedN <= 1
end

local function checkSpawnPointNoLOS(worm, x, y, maxRadiusPx, clearRadiusPx)
  maxRadiusPx = maxRadiusPx or 50
  clearRadiusPx = math.max(clearRadiusPx or 0, SPAWN_CLEAR_RADIUS_PX)
  local r = 0
  while r <= maxRadiusPx do
    local step = (r == 0) and 360 or math.max(15, (360 / (r / 2)))
    local angdeg = 0
    while angdeg < 360 do
      local rad = angdeg * math.pi / 180
      local tx = math.floor(x + r * wa.math.cos(rad) + 0.5)
      local ty = math.floor(y + r * wa.math.sin(rad) + 0.5)
      if roomClear(tx, ty, clearRadiusPx)
         and isClearOfTerrain(tx, ty, BEE_RADIUS_PX + 1)
         and hasEscapeRoom(tx, ty)
         and (not worm or worm:fits(tx, ty)) then
        return tx, ty
      end
      angdeg = angdeg + step
    end
    r = r + 3
  end
  return nil, nil
end
-- Keep fractional velocities: flooring them biased the steering to zero.
local function steer(a, tx, ty, speed, strength)
  speed = speed * SPEED_SCALE
  local dx, dy = tx - a.x, ty - a.y
  local dist = math.sqrt(dx * dx + dy * dy)
  if dist > 0 then dx, dy = dx / dist, dy / dist end
  local wantVx = dx * speed
  local wantVy = dy * speed
  a.vx = a.vx + (wantVx - a.vx) * strength
  a.vy = a.vy + (wantVy - a.vy) * strength
end

local function distPx(a, tx, ty)
  local dx, dy = (tx - a.x), (ty - a.y)
  return math.sqrt(dx * dx + dy * dy)
end

local function isThereLandThere(a, tx, ty)
  local hit = wa.land.trace(a.x, a.y, tx, ty)
  return hit and hit.hit
end

-- One target pass per frame for every bee: cache worms, test distance before
-- tracing, as PX's AssignCurseHomingTargets does.
local SENSOR_RADIUS_SQ = SENSOR_RADIUS_PX * SENSOR_RADIUS_PX
local targetFrame = nil
local wormsById = {}

local function closestEnemy(a, s, worms)
  local best, bestDist2
  for i = 1, #worms do
    local w = worms[i]
    if s.rogue or w.team ~= s.team then
      local dx, dy = w.x - a.x, w.y - a.y
      local d2 = dx * dx + dy * dy
      if d2 <= SENSOR_RADIUS_SQ and (not bestDist2 or d2 < bestDist2) then
        if not isThereLandThere(a, w.x, w.y) then
          best, bestDist2 = w, d2
        end
      end
    end
  end
  return best
end

local function refreshTargets()
  local frame = wa.world.frame() or 0
  if targetFrame == frame then return end
  targetFrame = frame

  local worms = wa.worms.all()
  local moving = {}
  wormsById = {}
  for i = 1, #worms do
    local w = worms[i]
    wormsById[w.id] = w
    -- Walking worms may report no velocity, so also check the label.
    local walking = (w.vx ~= 0 or w.vy ~= 0 or w.state_label == "walking")
      and (w.state ~= "standing" and w.state_label ~= "standing")
    if w.hp > 0 and walking then moving[#moving + 1] = w end
  end

  -- One loop for every live actor; only bees have a state entry.
  for _, a in ipairs(wa.actors.all()) do
    local s = state[a.id]
    if s and not s.dead and not s.freeMe and not s.stopMe
        and not s.spin and not s.softSpin then
      if (s.lookoutCooldown or 0) > 0 then
        s.lookoutCooldown = s.lookoutCooldown - 1
      end
      local target = s.targetId and wormsById[s.targetId]
      if target and (target.hp <= 0 or (not s.rogue and target.team == s.team)) then
        target = nil
        s.targetId = nil
      end
      if not target and (s.lookoutCooldown or 0) <= 0 then
        target = closestEnemy(a, s, moving)
        s.targetId = target and target.id or nil
      end
    end
  end
end

local function wormById(id)
  if not id then return nil end
  return wormsById[id]
end

local function randomizeSpeed()
  local randspeed = wa.random(1, 7)
  return (ROAM_SPEED_BASE * randspeed)
end

local function tryFindPath(a, s, scale)
  local rangeX = (ROAM_RANGE_X * scale)
  local rangeY = (ROAM_RANGE_Y * scale)

  local fx = rand(-rangeX, rangeX)
  local fy = rand(-rangeY, rangeY)
  local tx, ty = s.startX - fx, s.startY - fy

  if not isThereLandThere(a, tx, ty) then
    return tx, ty
  end
  return nil, nil
end

local function pickRoamPoint(a, s)
  s.roamFailStreak = s.roamFailStreak or 0
  local shrink = s.roamFailStreak >= ROAM_FAIL_THRESHOLD
  local scale1 = shrink and (1.0 * ROAM_FAIL_SCALE) or 1.0
  local scale2 = shrink and (0.78 * ROAM_FAIL_SCALE) or 0.78

  local tx, ty = tryFindPath(a, s, scale1)
  if tx then
    s.arriveX, s.arriveY = tx, ty
    s.roamSpeed = randomizeSpeed()
    s.roamFailStreak = 0
    return true
  end

  tx, ty = tryFindPath(a, s, scale2)
  if tx then
    s.arriveX, s.arriveY = tx, ty
    s.roamSpeed = randomizeSpeed()
    s.roamFailStreak = 0
    return true
  end

  s.roamFailStreak = s.roamFailStreak + 1
  return false
end

local function detonate(a, s)
  a:explode({ damage = s.supercharged and 55 or 40, id = 100 })
  state[a.id] = nil
  a:despawn()
end

local function updateAnim(a, s)
  local speedPx = (math.abs(a.vx) + math.abs(a.vy))
  local hold = math.max(BEE_FRAME_HOLD_MIN, BEE_FRAME_HOLD - (speedPx / 2))
  s.animTick = (s.animTick or 0) + 1
  if s.animTick >= hold then
    s.animTick = 0
    s.sprnum = (s.sprnum % BEE_FRAME_COUNT) + 1
    a:frame(s.sprnum - 1)
  end
end

-- Centre plus four points: a cheap "not buried" test.
local function cheapClear(x, y)
  if wa.land.solid(x, y) then return false end
  return not (wa.land.solid(x - 3, y) or wa.land.solid(x + 3, y)
    or wa.land.solid(x, y - 3) or wa.land.solid(x, y + 3))
end

-- Nearest free disc, walking rings outward; no line of sight.
local function findFreeSpot(x, y, maxRadius)
  local r = 0
  while r <= maxRadius do
    local step = (r == 0) and 360 or math.max(15, math.floor(360 / (r / 2) + 0.5))
    local angdeg = 0
    while angdeg < 360 do
      local rad = angdeg * math.pi / 180
      local tx = x + math.floor(r * wa.math.cos(rad))
      local ty = y + math.floor(r * wa.math.sin(rad))
      if cheapClear(tx, ty) and isClearOfTerrain(tx, ty, BEE_RADIUS_PX + 1) then
        return tx, ty
      end
      angdeg = angdeg + step
    end
    r = r + 3
  end
  return nil, nil
end

-- Pull a buried bee out; WA cannot bump a body it cannot move.
local function unbury(a, s)
  local tx, ty = findFreeSpot(a.x, a.y, UNBURY_MAX_RADIUS_PX)
  if not tx then tx, ty = s.lastSafeX, s.lastSafeY end
  a.x, a.y = tx, ty
  a.vx, a.vy = 0, 0
  s.clipFrames, s.bonk, s.targetId, s.arriveX = 0, 0, nil, nil 
  s.desiredAngle = 0
  s.roamCooldown = rand(ROAM_COOLDOWN_MIN, ROAM_COOLDOWN_MAX)
  s.lastSafeX, s.lastSafeY = tx, ty
  log("[BEE] unburied to " .. tostring(tx) .. "," .. tostring(ty))
end

-- Keep the last safe spot, decay bonks, and unbury a stuck bee.
local function checkClipping(a, s)
  if s.bonk == 0 and s.clipFrames < 1 and cheapClear(a.x, a.y) then
    s.lastSafeX, s.lastSafeY = a.x, a.y
  end
  if s.bonk > 0 and (s.ticks or 0) % 10 == 0 then
    s.bonk = s.bonk - 1
  end

  if wa.land.solid(a.x, a.y) then
    s.clipFrames = (s.clipFrames or 0) + 1
    if s.clipFrames > CLIP_FRAMES_LIMIT then
      unbury(a, s)
      return
    end
  else
    s.clipFrames = 0
  end
end

-------------------------------------------------------------------------------
-- Bee Actor Brain (:303-480)
-------------------------------------------------------------------------------
local function brain(a, ev)
  local s = state[a.id]
  if not s then return end
  ev = ev or {}

  -- Damage/knockback is in `hurt`; do not double-apply it here.
  if s.freeMe then
    state[a.id] = nil
    a:despawn()
    return
  end

  if s.dead and not s.spin and not s.softSpin then
    s.spin = true
    s.spinN = 0
  end

  checkClipping(a, s)
  refreshTargets()

  if s.spin or s.softSpin then
    if s.spinN == 0 then playBuzz(a) end
    s.rot = (s.rot + (s.dead and 9 or 7)) % 360
    a:angle(s.rot)
    s.spinN = s.spinN + 1
    if s.spinN >= SPIN_FRAMES then
      if s.dead then
        detonate(a, s)
        return
      end
      s.spin, s.softSpin, s.spinN = false, false, 0
    end
    return
  end

  if shouldStop(s) then
    a.vx, a.vy = 0, 0
    return
  end

  s.ticks = (s.ticks or 0) + 1

  if a:in_water() then
    s.dead = true; log("[BEE] dead: in water")
    return
  end

  updateAnim(a, s)

  if a.vx ~= 0 then
    a.facing = a.vx > 0 and 1 or -1
  end

  local target = wormById(s.targetId)

  if target and (target.hp <= 0 or (not s.rogue and target.team == s.team)) then
    target = nil
    s.targetId = nil
  end

  if target then
    s.roamCooldown = 0

    if distPx(a, s.startX, s.startY) > ROAM_MAX_DIST_PX then
      s.targetId = nil
      s.homingDuration = 0
      s.lookoutCooldown = LOOKOUT_COOLDOWN_GIVEUP
      s.spin, s.spinN = true, 0
      return
    end

    local tdist = distPx(a, target.x, target.y)
    if tdist > HOMING_MAX_DIST_PX then
      s.targetId = nil
      s.homingDuration = 0
      s.lookoutCooldown = LOOKOUT_COOLDOWN_GIVEUP
      s.spin, s.spinN = true, 0
      return
    end

    s.homingDuration = (s.homingDuration or 0) + 1
    if s.homingDuration > HOMING_MAX_DURATION then
      s.targetId = nil
      s.homingDuration = 0
      s.lookoutCooldown = LOOKOUT_COOLDOWN_TIMEOUT
      s.spin, s.spinN = true, 0
      return
    end

    s.chaseCD = (s.chaseCD or 0) - 1
    if s.chaseCD <= 0 then
      steer(a, target.x, target.y, CHASE_SPEED, CHASE_STRENGTH)
      s.chaseCD = CHASE_STEER_EVERY
    end

    if tdist <= CONTACT_RADIUS_PX then
      s.dead = true; log("[BEE] dead: reached target")
      detonate(a, s)
      return
    end

    if s.homingDuration % 15 == 0 then
      playBuzz(a)
    end

    local vxpx, vypx = a.vx, a.vy
    if vxpx ~= 0 or vypx ~= 0 then
      s.desiredAngle = deg(wa.math.atan(vypx, math.abs(vxpx) + 0.001))
    end
  else
    s.homingDuration = 0

    if (s.roamCooldown or 0) > 0 then
      s.roamCooldown = s.roamCooldown - 1
      s.desiredAngle = 0
      a.vx = a.vx * 0.75
      a.vy = a.vy * 0.75
      if s.roamCooldown <= 0 then
        pickRoamPoint(a, s)
      end
    elseif not s.arriveX then
      pickRoamPoint(a, s)
    elseif distPx(a, s.arriveX, s.arriveY) < ROAM_ARRIVE_PX then
      s.roamCooldown = rand(ROAM_COOLDOWN_MIN, ROAM_COOLDOWN_MAX)
    else
      s.roamCD = (s.roamCD or 0) - 1
      if s.roamCD <= 0 then
        local baseSpeed = s.roamSpeed or ROAM_SPEED
        local speed = baseSpeed
        local dist = distPx(a, s.arriveX, s.arriveY)
        if dist < ROAM_SLOWDOWN_RADIUS_PX then
          local frac = dist / ROAM_SLOWDOWN_RADIUS_PX
          if frac < ROAM_SLOWDOWN_MIN_FRAC then
            frac = ROAM_SLOWDOWN_MIN_FRAC
          end
          speed = baseSpeed * frac
        end
        steer(a, s.arriveX, s.arriveY, speed, ROAM_STRENGTH)
        s.roamCD = ROAM_STEER_EVERY
      end
      local vxpx, vypx = a.vx, a.vy
      if vxpx ~= 0 or vypx ~= 0 then
        s.desiredAngle = deg(wa.math.atan(vypx, math.abs(vxpx) + 0.001))
      end
    end
  end

  local MAX_PITCH_DEG = 90 * 0.7
  s.desiredAngle = math.max(-MAX_PITCH_DEG, math.min(MAX_PITCH_DEG, s.desiredAngle or 0))

  if s.rot < s.desiredAngle then
    s.rot = math.min(s.rot + ROT_SMOOTH_DEG, s.desiredAngle)
  elseif s.rot > s.desiredAngle then
    s.rot = math.max(s.rot - ROT_SMOOTH_DEG, s.desiredAngle)
  end

  if a.facing < 0 then
    a:angle(-s.rot)
  else
    a:angle(s.rot)
  end
end

-- A `hit` brain makes WA hand over the blast's knock instead of pushing the
-- body; apply both, as PX did.
local function hurt(a, ev)
  local s = state[a.id]
  if not s then return end
  -- Blasts knock back without spinning; gun/fire hits tumble.
  ev = ev or {}
  takeHit(a, s, ev.damage, ev.kind ~= "blast")
  a.vx = a.vx + (ev.vx or 0) * 1.5
  a.vy = a.vy + (ev.vy or 0) * 1.5
end

-- Only a living enemy worm sets a bee off.
local function isEnemyWorm(s, other)
  if type(other) ~= "userdata" then return false end
  if other.kind ~= "worm" then return false end
  if not other.hp or other.hp <= 0 then return false end
  return s.rogue or other.team ~= s.team
end

local function onContact(a, ev)
  local s = state[a.id]
  if not s or s.dead then return end
  local other = ev and ev.other
  if isEnemyWorm(s, other) then
    log("[BEE] detonate: enemy worm contact id=" .. tostring(a.id))
    detonate(a, s)
  end
end

-- WA's sweep stopped on something; its stop/bounce is already in vx/vy.
local function bump(a, ev)
  local s = state[a.id]
  if not s or s.dead then return end
  s.bonk = s.bonk + 1
  local limit = s.targetId and 1 or BONK_LIMIT
  if s.bonk > limit then
    s.spin, s.bonk = false, 0
    if s.targetId then
      s.targetId = nil
      s.lookoutCooldown = BUMP_LOOKOUT_FRAMES
    end
    s.arriveX = nil   -- a fresh roam point on the next frame
  end
end

-------------------------------------------------------------------------------
-- The Actor Spawner (:485-543)
-------------------------------------------------------------------------------
function M.spawn_actor(opts)
  opts = opts or {}
  local owner = opts.owner or (wa.worms.all and wa.worms.all()[1])

  log("[ACTOR SPAWN] Attempting spawn at X=" .. tostring(opts.x) .. " Y=" .. tostring(opts.y))
  if not owner then return nil end
  local body = wa.actors.spawn({
    sprite  = opts.sprite or M.SPRITE,
    x       = opts.x,
    y       = opts.y,
    vx      = rand(-4, 4) * SPEED_SCALE,
    vy      = rand(-6, -3) * SPEED_SCALE,
    origin  = opts.origin or "center",
    owner   = owner,
    persist = opts.persist ~= false,
    -- WA moves this body and reports land bumps; only fire and blasts hurt it.
    body    = { shape = M.BODY_MASK, hits = { land = true, worms = true },
                hit_by = { fire = true, blasts = true } },
    -- frame: per-frame brain; hit: blasts; contact: worm touch; bump: land.
    on      = { frame = opts.brain or brain, hit = hurt, contact = onContact, bump = bump },
  })

  if body then
    log("[ACTOR SPAWN] Successfully spawned actor ID=" .. tostring(body.id) ..
        " (Rogue=" .. tostring(opts.rogue or false) .. ")")
    state[body.id] = {
      rogue           = opts.rogue or false,
      team            = opts.team or (owner and owner.team) or -1,
      owner           = owner,
      hp              = opts.hp or MAX_HP,
      dead            = false,
      freeMe          = false,
      stopMe          = false,
      spin            = false,
      softSpin        = false,
      spinN           = -10,
      bonk            = 0,
      bonkhome        = 0,   -- set by the original, read by nothing
      rot             = 0,
      supercharged    = false,
      startX          = opts.x,
      startY          = opts.y,
      arriveX         = opts.x,
      arriveY         = opts.y,
      lastSafeX       = opts.x,
      lastSafeY       = opts.y,
      roamCooldown    = 0,
      roamSpeed       = nil,
      desiredAngle    = 0,
      targetId        = nil,
      sprnum          = 1,
      animTick        = 0,
      roamFailStreak  = 0,
      clipFrames      = 0,
      homingDuration  = 0,
      lookoutCooldown = 0,
      ambientBuzzCD   = rand(30, 60),   -- set by the original, read by nothing
    }
  else
    log("[ACTOR SPAWN ERROR] wa.actors.spawn returned nil!")
  end
  return body
end

-------------------------------------------------------------------------------
-- Slice-Based Random Map Spawner (:548-598)
-------------------------------------------------------------------------------
-- Returns how many bees it placed. `quantity` is the profile's option.
function M.spawn_map_bees(quantity, ownerWorm)
  quantity = math.max(1, math.floor(quantity or BEE_SPAWN_QUANTITY))
  if not ownerWorm then
    wa.log("[BEE SPAWN] no worm to seed from")
    return 0
  end

  local size = wa.world.size()
  local levelSX = math.floor(size.w)
  -- The original used the map height as the water line (:553); API 4 knows the
  -- real one (`wa.world.water()`), and falls back to the height on a map with
  -- no water.
  local waterY = math.floor(wa.world.water())
  if waterY <= 0 then waterY = math.floor(size.h) end
  local sliceWidth = math.floor(levelSX / quantity)
  local planted = 0

  log("[BEE SPAWN] Starting slice spawner. Quantity=" .. tostring(quantity) ..
      " MapWidth=" .. tostring(levelSX) .. " WaterY=" .. tostring(waterY) ..
      " SliceWidth=" .. tostring(sliceWidth))

  for currentSlice = 0, quantity - 1 do
    local sliceAttempts = 0
    local spawnedInSlice = false

    local sliceStart = currentSlice * sliceWidth
    local sliceEnd = sliceStart + sliceWidth

    if sliceStart < 30 then sliceStart = 30 end
    if sliceEnd > levelSX - (30) then sliceEnd = levelSX - (30) end
    -- A map narrower than the bee count wants leaves the last slices empty;
    -- `wa.random` refuses an empty range (`spawn.rs` "random_fn"), so they
    -- probe one column at the edge instead.
    if sliceEnd < sliceStart then sliceEnd = sliceStart end

    while sliceAttempts < BEE_SPAWN_TRIES_PER_SLICE and not spawnedInSlice do
      sliceAttempts = sliceAttempts + 1

      local tryX = rand(sliceStart, sliceEnd)
      local tryY = rand(SPAWN_TOP_MARGIN_PX, math.max(SPAWN_TOP_MARGIN_PX + 1, (waterY) - 100))
      local traceEndY = waterY - (70)

      local hit = wa.land.trace(tryX, tryY, tryX, traceEndY)

      if hit and hit.hit and isClearOfTerrain(hit.x, hit.y - 8, 4) and ownerWorm:fits(hit.x, hit.y - 8) then
        local spawnX = hit.x
        local spawnY = hit.y - 8

        spawnX, spawnY = checkSpawnPointNoLOS(ownerWorm, spawnX, spawnY, 130, 14)
        if spawnX ~= nil then
          M.spawn_actor({
            x     = spawnX,
            y     = spawnY,
            owner = ownerWorm,
            rogue = true,
          })
          spawnedInSlice = true
          planted = planted + 1
          log("[BEE SPAWN] Slice #" .. tostring(currentSlice) .. " SUCCESS on attempt #" .. tostring(sliceAttempts))
        end
      end
    end

    if not spawnedInSlice then
      log("[BEE SPAWN] Slice #" .. tostring(currentSlice) .. " FAILED to find valid terrain clearance!")
    end
  end

  wa.log(("[BEE SPAWN] %d/%d map bees placed"):format(planted, quantity))
  return planted
end

-- The original's name, for a script that calls it (the API 2 file returned it).
M.spawnRandomBees = M.spawn_map_bees

-------------------------------------------------------------------------------
-- The weapon component (API 2's registration, :603-639)
-------------------------------------------------------------------------------
function M.install_weapon(ctx)
  wa.weapons.replace({
    -- The `may be wrong weapon = "px.kbee"` note (:604) meant the key `weapon`,
    -- which names a *placed* weapon a replace aims at (`api.rs:1096-1103`).
    -- API 4 does not need it: a component replaces the slot its own profile put
    -- it on, and a name here would have to be a component id, not `px.kbee`.
    name      = "Keeper Bee",
    -- WA's Bazooka: it aims with the reticle, and `on_fire` replaces the shell
    -- with the bee (`crates/engine/src/actor.rs` "try_lua_projectile" -- an
    -- `on_fire` callback eats the stock projectile).
    copy_from = "stock.bazooka",
    -- The icon the original wanted (`:607`, `:612`): PX's own 32x32 PNG
    -- (`sprites/beeico.png`). A `.png` is the loader's picture and the panel
    -- icon both (`api.rs` "table_to_claim").
    panel_icon = "sprites/beeico.png",
    is_weapon = true,
    -- The flight sheet: `bee_flight.png` is 32x128, four 32x32 frames stacked,
    -- which the loader slices on its own (`gfx::load_strip_bytes`, the
    -- `h > w` branch); `a:frame(0..3)` walks them. The original asked for
    -- `sprite_columns = BEE_FRAME_COUNT` (:611), which the row slice ignores.
    sprites   = { M.SPRITE },
    -- PX's six worm poses, WA's own slot names (`:615-622`).
    worm_sprites = M.WORM_SPRITES,
    -- `sprites/`, not the original's `sprites/bee_` (:611): the aim and throw
    -- GIFs live beside the flight sheet and must route into the atlas with it
    -- (`apply.rs` matches the prefix), and PX's own bundles do the same.
    params    = { gpu_prefix = "sprites/" },
    sounds    = M.SOUNDS,
    on_fire = function(fire)
      local worm = fire.worm
      playBuzz(worm)

      local sx, sy = checkSpawnPoint(worm, fire.x, fire.y, fire.x, fire.y, 80, 7, true)
      if not sx then
        -- No clear room near the muzzle: the firing worm's own spot is free.
        sx, sy = worm.x, worm.y - 8
      end

      M.spawn_actor({
        x     = sx,
        y     = sy,
        owner = worm,
        rogue = false,
      })
    end,
  })
end

-------------------------------------------------------------------------------
-- The swarm component (API 2's worm-message hook, :644-657)
-------------------------------------------------------------------------------
function M.install_swarm(ctx)
  -- The add-on has no panel slot, so it loads its own copy of the sheet and
  -- the buzzes (`wa.assets.load`, `api.rs`).
  wa.assets.load({ sprites = { M.SPRITE }, sounds = M.SOUNDS, gpu_prefix = "sprites/" })

  local on = ctx.option("spawn_map_bees")
  local amount = ctx.option("bee_amount")
  wa.log(("Keeper Bee swarm: %s, %d bees"):format(on and "on" or "off", amount))
  if not on then return end

  -- API 4 has no round-start hook (`dispatch.rs` "turn_event"), so the swarm
  -- seeds on the first turn of the match -- what the original's once-only
  -- `spawnedMapBees` (:7, :647) did -- and asks again on a later turn if the
  -- map gave it nowhere to stand.
  wa.on.turn_start(function(ev)
    if swarmPlanted then return end
    if M.spawn_map_bees(amount, ev.worm) > 0 then swarmPlanted = true end
  end)
end

return M
