-- Keeper Bee Script with wa.on.worm_message FRAME_FINISH Spawner
local PX = 0x10000

-- Map Auto-Spawn Configuration
local BEE_SPAWN_QUANTITY = 4
local SPAWN_TOP_MARGIN_PX = 100  -- don't probe within this far of the map's ceiling
local spawnedMapBees      = false
local gameFrame           = 0

-- Bee AI Constants
local SENSOR_RADIUS_PX  = 235
local CONTACT_RADIUS_PX = 26
local CHASE_SPEED       = (3.5) * PX
local CHASE_STRENGTH    = 0.17
local CHASE_STEER_EVERY = 2
local ROAM_SPEED        = (0.6) * PX
local ROAM_SPEED_BASE   = 0.12
local ROAM_COOLDOWN_MIN = 10
local ROAM_COOLDOWN_MAX = 20
local ROT_SMOOTH_DEG    = 4
local ROAM_STRENGTH     = 0.15
local ROAM_STEER_EVERY  = 2
local BONK_LIMIT        = 4
local SPIN_FRAMES       = 20
local MAX_HP            = 25
local ROAM_RANGE_X      = 55
local ROAM_RANGE_Y      = 110
local ROAM_ARRIVE_PX    = 20
local BEE_RADIUS_PX     = 9
local CORNER_BUFFER_PX  = 6
local HOMING_MAX_DIST_PX = 470
local HOMING_MAX_DURATION = 160
local ROAM_MAX_DIST_PX   = 420
local LOOKOUT_COOLDOWN_GIVEUP  = 150
local LOOKOUT_COOLDOWN_TIMEOUT = 200

local ROAM_FAIL_THRESHOLD  = 10
local ROAM_FAIL_SCALE      = 0.5
local CLIP_FRAMES_LIMIT    = 20

local ROAM_SLOWDOWN_RADIUS_PX = 60
local ROAM_SLOWDOWN_MIN_FRAC  = 0.35

local BEE_FRAME_COUNT = 4
local BEE_FRAME_HOLD  = 5
local BEE_FRAME_HOLD_MIN = 2

local SPRITE  = "sprites/bee_flight.png"
local beeSOUNDS = { "sounds/bzz1.wav", "sounds/bzz2.wav", "sounds/bzz3.wav", "sounds/bzz4.wav" }

local state = {}

local function shouldStop(s)
  return s.dead or s.freeMe or s.stopMe
end

local function playBuzz(target)
  if not target or #beeSOUNDS == 0 then return end
  local snd = beeSOUNDS[wa.random(1, #beeSOUNDS)]
  wa.sound.play(target, snd)
end

local function isClearOfTerrain(x, y, radiusPx)
  if wa.land.solid(x, y) then return false end
  local probes = 8
  for i = 0, probes - 1 do
    local ang = (i / probes) * 2 * math.pi
    local px = x + math.floor(radiusPx * wa.math.cos(ang)) * PX
    local py = y + math.floor(radiusPx * wa.math.sin(ang)) * PX
    if wa.land.solid(px, py) then return false end
  end
  return true
end

local function checkSpawnPoint(x, y, targetX, targetY, maxRadiusPx, clearRadiusPx)
  maxRadiusPx = maxRadiusPx or (50 * PX)
  clearRadiusPx = clearRadiusPx or (BEE_RADIUS_PX + 1)
  local r = 0
  while r <= maxRadiusPx do
    local step = (r == 0) and 360 or math.max(15, math.floor(360 / ((r / PX) / 2)))
    local deg = 0
    while deg < 360 do
      local rad = deg * math.pi / 180
      local tx = x + math.floor(r * wa.math.cos(rad))
      local ty = y + math.floor(r * wa.math.sin(rad))
      if isClearOfTerrain(tx, ty, clearRadiusPx) then
        local hit = wa.land.trace(tx, ty, targetX, targetY)
        if not hit or not hit.hit then return tx, ty end
      end
      deg = deg + step
    end
    r = r + 4 * PX
  end
  return targetX, targetY
end

local function steer(a, tx, ty, speed, strength)
  local dx, dy = tx - a.x, ty - a.y
  local dist = math.sqrt(dx * dx + dy * dy)
  if dist > 0 then dx, dy = dx / dist, dy / dist end
  local wantVx = math.floor(dx * speed)
  local wantVy = math.floor(dy * speed)
  a.vx = a.vx + math.floor((wantVx - a.vx) * strength)
  a.vy = a.vy + math.floor((wantVy - a.vy) * strength)
end

local function distPx(a, tx, ty)
  local dx, dy = (tx - a.x) // PX, (ty - a.y) // PX
  return math.sqrt(dx * dx + dy * dy)
end

local function isThereLandThere(a, tx, ty)
  local b = CORNER_BUFFER_PX * PX
  local tyOff = ty - 3 * PX

  local function blocked(x0, y0, x1, y1)
    local hit = wa.land.trace(x0, y0, x1, y1)
    return hit and hit.hit
  end

  if blocked(a.x, a.y, tx, tyOff) then return true end
  if blocked(a.x - b, a.y - b, tx - b, tyOff - b) then return true end
  if blocked(a.x + b, a.y - b, tx + b, tyOff - b) then return true end
  if blocked(a.x - b, a.y + b, tx - b, tyOff + b) then return true end
  if blocked(a.x + b, a.y + b, tx + b, tyOff + b) then return true end
  return false
end

local function findClosestEnemy(a, s)
  if (s.lookoutCooldown or 0) > 0 then return nil end
  local best, bestDist2
  for _, w in ipairs(wa.worms.all()) do
    local moving = w.vx ~= 0 or w.vy ~= 0
    local isEnemy = s.rogue or (w.team ~= s.team)
    if isEnemy and w.hp > 0 and moving then
      local dx = (w.x - a.x) // PX
      local dy = (w.y - a.y) // PX
      local d2 = dx * dx + dy * dy
      if d2 <= SENSOR_RADIUS_PX * SENSOR_RADIUS_PX and (not bestDist2 or d2 < bestDist2) then
        if not isThereLandThere(a, w.x, w.y) then
          best, bestDist2 = w, d2
        end
      end
    end
  end
  return best
end

local function wormById(id)
  if not id then return nil end
  for _, w in ipairs(wa.worms.all()) do
    if w.id == id then return w end
  end
  return nil
end

local function randomizeSpeed()
  local randspeed = wa.random(1, 7)
  return (ROAM_SPEED_BASE * randspeed) * PX
end

local function tryFindPath(a, s, scale)
  local rangeX = math.floor(ROAM_RANGE_X * scale)
  local rangeY = math.floor(ROAM_RANGE_Y * scale)

  local fx = wa.random(-rangeX, rangeX) * PX
  local fy = wa.random(-rangeY, rangeY) * PX
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
  local speedPx = (math.abs(a.vx) + math.abs(a.vy)) / PX
  local hold = math.max(BEE_FRAME_HOLD_MIN, BEE_FRAME_HOLD - math.floor(speedPx / 2))
  s.animTick = (s.animTick or 0) + 1
  if s.animTick >= hold then
    s.animTick = 0
    s.sprnum = (s.sprnum % BEE_FRAME_COUNT) + 1
    a:frame(s.sprnum - 1)
  end
end

--------------------------------------------------------------------------------
-- Bee Actor Brain
--------------------------------------------------------------------------------
local function brain(a, ev)
  local s = state[a.id]
  if not s then return end
  ev = ev or {}

  if (ev.damage or 0) > 0 then
    s.hp = s.hp - ev.damage
    s.spin = true
    s.spinN = (s.spinN or 0) + 8
    if s.hp <= 0 then s.dead = true end
  end

  if s.freeMe then
    state[a.id] = nil
    a:despawn()
    return
  end

  if s.dead and not s.spin and not s.softSpin then
    s.spin = true
    s.spinN = 0
  end

  if s.spin or s.softSpin then
    if s.spinN == 0 then playBuzz(a) end
    a.vx, a.vy = 0, 0
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

  local hit = a:move({ terrain = true, worms = false })

  -- Per-actor tick counter for bonk decay -- (a.id % 10) is constant for the
  -- actor's whole life (always true or always false), so it never actually
  -- decayed for most bees. This decays every 10 real frames per bee, same
  -- cadence the original's `gframe % 10` intended, just scoped correctly.
  s.ticks = (s.ticks or 0) + 1

  -- Threshold computed from THIS bee's own s.targetId, not a shared
  -- module-level variable other bees were racing to overwrite. Direction
  -- (tighter while chasing) kept as you had it -- worth double-checking
  -- that's the intent you want, since PX's own beeBonkReset went the other
  -- way (24 while a target is locked, vs 10 while roaming: "targets too
  -- close will never get exploded"). If clipping-while-chasing should be
  -- MORE tolerated rather than less, flip this to `s.targetId and 24 or 10`
  -- (adjusted to this port's SPIN_FRAMES scale) instead.
  local bonkLimit = s.targetId and 1 or BONK_LIMIT
  if s.bonk == 0 then
    s.lastSafeX, s.lastSafeY = a.x,a.y
  end
  if hit.terrain then
    s.bonk = (s.bonk or 0) + 1
    if s.bonk > bonkLimit then
      s.spin, s.bonk, s.targetId = false, 0, nil
      local sx, sy = checkSpawnPoint(a.x, a.y, a.x, a.y, 50 * PX)
      if sx then
        a.x, a.y = sx, sy
        a.vx, a.vy = 0, 0
      end
      if not pickRoamPoint(a, s) then
        pickRoamPoint(a, s)
      end
      return
    end
  elseif s.bonk and s.bonk > 0 and s.ticks % 10 == 0 then
    s.bonk = s.bonk - 1
  end

  if wa.land.solid(a.x, a.y) then
    s.clipFrames = (s.clipFrames or 0) + 1
    if s.clipFrames > CLIP_FRAMES_LIMIT then
      a.x, a.y = s.lastSafeX, s.lastSafeY
      --state[a.id] = nil
      --a:despawn()
      return
    end
  else
    s.clipFrames = 0
  end

  if a:in_water() then
    s.dead = true
    return
  end

  updateAnim(a, s)

  if a.vx ~= 0 then
    a.facing = a.vx > 0 and 1 or -1
  end

  if (s.lookoutCooldown or 0) > 0 then
    s.lookoutCooldown = s.lookoutCooldown - 1
  end

  local target = wormById(s.targetId)

  if target and (target.hp <= 0 or (not s.rogue and target.team == s.team)) then
    target = nil
    s.targetId = nil
  end
  if not target then
    target = findClosestEnemy(a, s)
    s.targetId = target and target.id or nil
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
      s.dead = true
      detonate(a, s)
      return
    end

    if s.homingDuration % 15 == 0 then
      playBuzz(a)
    end

    local vxpx, vypx = a.vx / PX, a.vy / PX
    if vxpx ~= 0 or vypx ~= 0 then
      s.desiredAngle = math.deg(wa.math.atan(vypx, math.abs(vxpx) + 0.001))
    end
  else
    s.homingDuration = 0

   -- s.ambientBuzzCD = (s.ambientBuzzCD or 60) - 1
   -- if s.ambientBuzzCD <= 0 then
  --    s.ambientBuzzCD = wa.random(50, 90)
  --    playBuzz(a)
  --  end

    if (s.roamCooldown or 0) > 0 then
      s.roamCooldown = s.roamCooldown - 1
      s.desiredAngle = 0
      a.vx = a.vx - math.floor(a.vx * 0.25)
      a.vy = a.vy - math.floor(a.vy * 0.25)
      if s.roamCooldown <= 0 then
        pickRoamPoint(a, s)
      end
    elseif not s.arriveX then
      pickRoamPoint(a, s)
    elseif distPx(a, s.arriveX, s.arriveY) < ROAM_ARRIVE_PX then
      s.roamCooldown = wa.random(ROAM_COOLDOWN_MIN, ROAM_COOLDOWN_MAX)
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
          speed = math.floor(baseSpeed * frac)
        end
        steer(a, s.arriveX, s.arriveY, speed, ROAM_STRENGTH)
        s.roamCD = ROAM_STEER_EVERY
      end
      local vxpx, vypx = a.vx / PX, a.vy / PX
      if vxpx ~= 0 or vypx ~= 0 then
        s.desiredAngle = math.deg(wa.math.atan(vypx, math.abs(vxpx) + 0.001))
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

--------------------------------------------------------------------------------
-- Generalized Actor Spawner
--------------------------------------------------------------------------------
local function spawn_actor(opts)
  opts = opts or {}
  local owner = opts.owner or (wa.worms.active and wa.worms.active()) or (wa.worms.all and wa.worms.all()[1])

  wa.log("[ACTOR SPAWN] Attempting spawn at X=" .. tostring(opts.x // PX) .. " Y=" .. tostring(opts.y // PX))

  local body = wa.actors.spawn({
    sprite  = opts.sprite or SPRITE,
    x       = opts.x,
    y       = opts.y,
    vx      = opts.vx or (wa.random(-20, 20) * PX // 10),
    vy      = opts.vy or (wa.random(-60, -12) * PX // 10),
    origin  = opts.origin or "center",
    owner   = owner,
    kind    = opts.kind or "bee",
    persist = opts.persist ~= false,
    on      = opts.brain or brain,
  })

  if body then
    wa.log("[ACTOR SPAWN] Successfully spawned actor ID=" .. tostring(body.id) .. " (Rogue=" .. tostring(opts.rogue or false) .. ")")
    state[body.id] = {
      rogue           = opts.rogue or false,
      team            = opts.team or (owner and owner.team) or -1,
      owner           = owner,
      hp              = opts.hp or MAX_HP,
      dead            = false,
      freeMe          = false,
      stopMe          = false,
      spin            = true,
      softSpin        = false,
      spinN           = 0,
      bonk            = 0,
      bonkhome        = 0,
      rot             = 0,
      supercharged    = false,
      startX          = opts.x,
      startY          = opts.y,
      arriveX         = nil,
      arriveY         = nil,
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
      ambientBuzzCD   = wa.random(30, 60),
    }
  else
    wa.log("[ACTOR SPAWN ERROR] wa.actors.spawn returned nil!")
  end
  return body
end

--------------------------------------------------------------------------------
-- Slice-Based Random Map Spawner
--------------------------------------------------------------------------------
local function spawnRandomBees(quantity, ownerWorm)
  quantity = quantity or BEE_SPAWN_QUANTITY

  -- Real map dimensions, not hardcoded 1920x1080 -- maps vary in size, and
  -- the old WATER_Y_PX=200 constant collapsed the vertical probe range to a
  -- fixed-point 30px sliver near the top of the map regardless of where
  -- terrain actually sits (wa.random(100,100) is not random at all).
  --
  -- NOTE: there's no documented wa.world.water()/wa.land.water-level call --
  -- the only confirmed wa.world fields are size/bounds/cavern/networked/
  -- keys/pointer/gravity/wind. Using map height as the scan floor instead;
  -- if there IS a water query hiding somewhere undocumented, swap it in
  -- here, since water level (not map bottom) is what actually matters for
  -- "don't spawn underwater."
  local size= wa.world.size()
  local levelSX = size.w* PX
  local waterY = size.h* PX
  local sliceWidth = levelSX // quantity

  wa.log("[BEE SPAWN] Starting slice spawner. Quantity=" .. tostring(quantity) .. " MapWidth=" .. tostring(size.width) .. " MapHeight=" .. tostring(size.height) .. " SliceWidth=" .. tostring(sliceWidth // PX))

  for currentSlice = 0, quantity - 1 do
    local sliceAttempts = 0
    local spawnedInSlice = false

    local sliceStart = currentSlice * sliceWidth
    local sliceEnd = sliceStart + sliceWidth

    if sliceStart < 30 * PX then sliceStart = 30 * PX end
    if sliceEnd > levelSX - (30 * PX) then sliceEnd = levelSX - (30 * PX) end

    while sliceAttempts < 10 and not spawnedInSlice do
      sliceAttempts = sliceAttempts + 1

      local tryX = wa.random(sliceStart // PX, sliceEnd // PX) * PX
      -- Scan almost the whole map height above water, not a fixed sliver --
      -- terrain can be anywhere between the ceiling margin and the water line.
      local tryY = wa.random(SPAWN_TOP_MARGIN_PX, math.max(SPAWN_TOP_MARGIN_PX + 1, (waterY // PX) - 100)) * PX
      local traceEndY = waterY - (70 * PX)

      local hit = wa.land.trace(tryX, tryY, tryX, traceEndY)

      if hit and hit.hit then
        local spawnX = hit.x
        local spawnY = hit.y - (15 * PX)

        if isClearOfTerrain(spawnX, spawnY, BEE_RADIUS_PX) then
          spawn_actor({
            x     = spawnX,
            y     = spawnY,
            owner = ownerWorm,
            rogue = true,
          })
          spawnedInSlice = true
          wa.log("[BEE SPAWN] Slice #" .. tostring(currentSlice) .. " SUCCESS on attempt #" .. tostring(sliceAttempts))
        end
      end
    end

    if not spawnedInSlice then
      wa.log("[BEE SPAWN] Slice #" .. tostring(currentSlice) .. " FAILED to find valid terrain clearance!")
    end
  end
end

--------------------------------------------------------------------------------
-- Weapon Registration
--------------------------------------------------------------------------------
wa.weapons.replace({
  weapon    = "skunk",
  name      = "Keeper Bee",
  copy_from = "grenade",
  is_weapon = true,

  sounds    = beeSOUNDS,
  params    = { gpu_prefix = "sprites/bee_", sprite_columns = BEE_FRAME_COUNT },
  panel_icon = "sprites/beeico.png",
  sprites   = { SPRITE },

  worm_sprites = {
    weaponlnk = "sprites/aim_p_muitb55w.gif",
    weaponlnku = "sprites/aim_u_muitb55w.gif",
    weaponlnkd = "sprites/aim_d_muitb55w.gif",
    wthrow = "sprites/draw_p_muitb55w.gif",
    wthrowu = "sprites/draw_u_muitb55w.gif",
    wthrowd = "sprites/draw_d_muitb55w.gif",
  },

  on_fire = function(fire)
    local worm = fire.worm
    playBuzz(worm or { x = fire.x, y = fire.y })

    local sx, sy = checkSpawnPoint(fire.x, fire.y, fire.x, fire.y, 50 * PX)
    sx = sx or fire.x
    sy = sy or fire.y

    spawn_actor({
      x     = sx,
      y     = sy,
      owner = worm,
      rogue = false,
    })
  end,
})

--------------------------------------------------------------------------------
-- Worm Message Callback Hook (Frame Finish)
--------------------------------------------------------------------------------
wa.on.worm_message(function(worm, msg)
  if msg ~= wa.msg.FRAME_FINISH then return end
  if worm.id ~= (1 * 16 + 1) then return end
  if spawnedMapBees then return end

  gameFrame = gameFrame + 1
  wa.log("[BEE HOOK] Received FRAME_FINISH on target worm. Frame count: " .. tostring(gameFrame))

  if gameFrame > 2 then
    wa.log("[BEE HOOK] Target tick reached! Spawning slice-based map bees...")
    spawnRandomBees(BEE_SPAWN_QUANTITY, worm)
    spawnedMapBees = true
  end
end)

return {
  spawnRandomBees = spawnRandomBees,
  spawn_actor     = spawn_actor,
}