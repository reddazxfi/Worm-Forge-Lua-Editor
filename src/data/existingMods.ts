import { ModFolderInfo } from '../types/wormforge';

// GENERATED FILE -- do not edit by hand.
//
// Regenerate with:  npm run gen:corpus
// Source of truth:   examples/
// Built by:          scripts/__gen_corpus.ts
//
// The previous hand-maintained version had already drifted: it told users that
// require() was nil in the sandbox, which stopped being true once pack-scoped
// require landed (crates/lua-host/src/modules.rs, wired into lib.rs:90). Every
// file below is read straight out of the curated examples/ folder instead, so it
// cannot go stale without the change showing up in git.
//
// The set is curated: one pack per idea, not the engine's full example tree.
// Users who want breadth open the engine's real mods folder. `buildCorpus`
// throws if examples/ is missing or empty instead of silently writing a smaller
// corpus.
export const EXISTING_MODS: ModFolderInfo[] = [
  {
    id: 'example.agility',
    name: 'Agility',
    version: '1.1',
    author: 'Zed / 0rang3 (port by red)',
    category: 'utility',
    description: 'Worm manipulation: nudge worm.vx / worm.vy from the synchronized keys while airborne. Small enough to read in one sitting.',
    tags: ['example', 'worm', 'movement'],
    files: [
      {
        path: 'init.lua',
        name: 'init.lua',
        language: 'lua',
        content: `-- Agility (air control), ported from Zed's RPG Wars mod, edited by 0rang3.
--
-- 1:1 port now that vx/vy are directly writable during jump and other
-- airborne states. No workaround needed -- this just nudges worm.vx/vy
-- per frame, the same as the original SpX/SpY increments.
--
-- Notes:
--   * PX's \`GetCurrentWorm() == this\` is \`worm.turn\`.
--   * PX's ModulatedGravity == 1 is worm.gravity == 1 (a plain factor).
--   * State check uses worm.state_id against the hex values from the state
--     logger, not the string names, since that's the precise source here.
--   * Keys follow the synchronized turn-player input in networked matches.

local STEP      = 0.1   -- per-tick nudge, matches C's 0.1
local STEP_LOWG = 0.03   -- up-nudge when gravity < 1.0
local LIMIT     = 3                  -- matches C's SpX/SpY <= 3 cap

-- Allowed states, by worm.state_id, mirroring the C allowlist:
-- WS_JUMP, WS_SLIDING, WS_FLYING2, WS_POWERFLY, WS_DRILLING, WS_FLYING.
-- Only JUMP and DRILLING are a confident 1:1 match to the logger's names;
-- the rest are my best guess at which hex id corresponds to which C state.
-- Confirm with the state logger and correct any that are wrong.
local ALLOWED = {
  [0x6E] = true,  -- WS_DRILLING
  [0x73] = true,  -- WS_AFTERROPE
  [0x79] = true,  -- WS_JUMP
  --[0x7A] = true,  -- Landing Jump
  [0x7E] = true,  -- WS_JUMP
  [0x7F] = true,  -- WS_SLIDING
  [0x80] = true,  -- WS_FLYING
  [0x81] = true,  -- WS_POWERFLY
}

-- Runs once per worm per frame: the msgs filter makes the engine skip Lua
-- for every other message a worm gets (thousands a frame in a busy match).
wa.on.worm_message(function(worm)
  if not worm.turn then return end

  local state = worm.state_id
  if not state or not ALLOWED[state] then return end

  local k = worm.keys

  if k.up then
    local step = (worm.gravity or 1) == 1 and STEP or STEP_LOWG
    if worm.vy >= -LIMIT then worm.vy = worm.vy - step end
  end
  if k.down and worm.vy <= LIMIT then
    worm.vy = worm.vy + STEP
  end
  if k.left and worm.vx >= -LIMIT then
    worm.vx = worm.vx - STEP
  end
  if k.right and worm.vx <= LIMIT then
    worm.vx = worm.vx + STEP
  end
end, { msgs = { wa.msg.FRAME_FINISH } })
`
      }
    ],
  },
  {
    id: 'example.sentry_gun',
    name: 'Sentry Gun',
    version: '0.1.0',
    author: 'wkLua',
    category: 'weapons',
    replacesSlot: 'donkey',
    description: 'An object example: a placed sentry with its own state, target selection, aiming, firing and collision.',
    tags: ['example', 'weapon', 'object'],
    files: [
      {
        path: 'weapons.lua',
        name: 'weapons.lua',
        language: 'lua',
        content: `-- Sentry gun in the donkey slot, with stock mine placement on Space.
-- Baked sheets keep the base, firing barrel and housing in one draw, with
-- 120 angles per pose. a:frame() selects idle/firing without changing feet.
-- Angles: 0 down, 90 right, 180 up, 270 left.

local PX = 0x10000

local SENSOR_PX     = 360   -- detection radius
local AMMO          = 20    -- rounds per turn
local DAMAGE        = 2     -- per round
local SHOT_FRAMES   = 6     -- frames between rounds
local ACTIVATE      = 60    -- frames after acquiring before the first shot
local BEEP_FRAMES   = 60    -- minimum gap between alert beeps
local ROT_IDLE      = 0.5   -- degrees per frame while sweeping
local ROT_ACTIVE    = 1.5   -- PX tracking speed, degrees per frame
local SWEEP         = 10    -- PX idle sweep amplitude, degrees
local AIM_TOLERANCE = 1.5   -- PX fires only after rotation reaches the target
local HIT_PX        = 10    -- how near a ray passes a worm to count as a hit
local SELF_BLAST_PX = 24    -- never detonate a round closer than this
local REQUIRE_MOTION = true -- PX only acquires walking/jumping/moving worms

-- Rounds leave the muzzle, not the tripod. The anchor sits at the feet (the
-- sprite's bottom opaque row), so a near-horizontal ray traced from there hits
-- the ground the turret is standing on and every shot is cancelled as a
-- self-blast. These match the bake's pivot and bore offsets.
local SINK_PX     = 8      -- pixels the planted turret settles into the ground
local MUZZLE_UP   = 25     -- pixels from the anchor up to the turret pivot
local MUZZLE_OUT  = 11     -- pixels from the pivot along the bore

-- Barrel deviation, in tenths of a degree so the draw stays integer.
-- PX rolled this at random and kept every 5th round pin-point. This pack used
-- to walk a fixed eight-entry table instead, because math.random is nil in the
-- sandbox and there was nothing to replace it. wa.random() draws from WA's own
-- shared RNG -- both peers advance it in step and a replay reproduces it -- so
-- the original intent is available again, and a 20-round magazine no longer
-- cycles the same eight values two and a half times.
local SPREAD_TENTHS = 20 -- +-2.0 degrees

-- PX ejects its shell casing (sprite 115, WA's stock "uzicase") on every shot:
-- perpendicular to the barrel, kicked out to whichever side the turret is
-- currently facing, with a small random angle and speed, gravity, no bounce,
-- gone after 100 frames. tools/bake_sentry.py has no equivalent art, so
-- sprites/casing is the native uzicase.spr frames (WA's own Gfx0), extracted
-- and black-keyed exactly like the turret's own key_black() convention,
-- driven the same way every other multi-frame sheet in this pack is.
local CASING        = "sprites/casing"
local CASING_FRAMES = 16
local CASING_LIFE   = 100    -- PX SetLifeTime(100)
-- PX's RandomFloat(-0.3, 0.3) rad (~+-17 deg) and RandomFloat(2.0, 3.0)
-- speed, drawn now rather than approximated by a fixed table. Integer ranges:
-- degrees directly, speed in hundredths.
local CASING_JITTER_DEG = 17
local CASING_SPEED_MIN  = 200
local CASING_SPEED_MAX  = 300

local state = {}
-- Alliance currently taking its turn; that side's turrets hold fire.
-- Alliance, not team: it is WA's colour index (0 red .. 5 cyan), so it is
-- also what colours the turret, and allied teams share it -- a turret must
-- not fire on its owner's allies either.
local active_alliance = nil

local function pad2(i)
  return string.format("%02d", i)
end

-- Two sheets, drawn by the GPU renderer.
--
-- The palette bake needed 6 teams x 3 poses x 120 angles = 72 of the 223 WA
-- sprite slots every pack shares, purely because WA's blitter can neither
-- rotate nor tint. Both happen at draw time now, so the turret is:
--
--   turret_base   the tripod, upright, never rotates
--   turret_gun    housing + barrel, greyscale, 3 poses
--
-- Greyscale is deliberate: the team colour is a vertex tint, and keeping the
-- source art's own shading is what makes it read as tinted metal rather than
-- a flat colour.
local BASE  = "sprites/turret_base"
local GUN   = "sprites/turret_gun"
-- The muzzle flash is its own additive quad, never part of the gun sheet:
-- tint is per-quad, so the team colour would multiply the flame too and a
-- blue turret's muzzle would come out dark olive. PX drew it separately with
-- a white colour and q.blend = 1 for the same reason.
local FLARE = "sprites/turret_flare"

-- Occlusion band for the parts that sit above the landscape. Terrain's own
-- queue depth is 0x180000; anything below that ignores terrain and is
-- occluded only by the HUD.
local IN_FRONT_OF_TERRAIN = 0x10000

-- Tints for a greyscale housing, from PX's own render rather than its script.
-- Sampling its red housing gives G/R about 0.39 and B/R about 0.28; the
-- script's flat 0.15/0.65 reads far more saturated than PX actually looks.
-- PX multiplied through a doubling colour mod, which a vertex tint cannot
-- reproduce (it only ever scales down), so the dominant channel is pinned at
-- 255 and the minors carry those ratios.
local function tint(r, g, b)
  return r * 0x10000 + g * 0x100 + b
end
local TEAM_TINT = {
  tint(255, 100,  71),   -- 1 red
  tint( 71, 100, 255),   -- 2 blue
  tint( 71, 255, 100),   -- 3 green
  tint(230, 230,  71),   -- 4 yellow
  tint(230,  71, 230),   -- 5 magenta
  tint( 71, 230, 230),   -- 6 cyan
}

local IMPACT = "sprites/impact.png"

-- Pack sprites are installed at gfx init from this list only. A sprite missing
-- from it does not exist at runtime, whatever a:look() asks for later.
local SPRITES = { IMPACT, CASING, BASE, GUN, FLARE }

-- 0 = down, 90 = right: the source art faces right, and screen y grows down.
local function angle_to(ax, ay, tx, ty)
  local dx = (tx - ax) // PX
  local dy = (ty - ay) // PX
  local deg = math.deg(wa.math.atan(dx, dy))
  if deg < 0 then
    deg = deg + 360
  end
  return deg
end

local function turn_toward(cur, want, speed)
  local d = (want - cur + 540) % 360 - 180
  if d > speed then
    d = speed
  elseif d < -speed then
    d = -speed
  end
  return (cur + d) % 360
end

local function angle_gap(a, b)
  local d = (a - b + 540) % 360 - 180
  return d < 0 and -d or d
end

-- Nearest moving enemy worm with line of sight. Ties break on worm id so both
-- peers pick the same one.
-- True when this worm is a valid target right now: an enemy, in range, with a
-- clear line from the turret head. The head, not the anchor: the anchor is the
-- tripod feet on the ground, so a ray from there hits the terrain it stands on.
-- PX tested ObjState WS_WALKING/WS_JUMP before velocity, because WA walks a
-- worm by stepping its position with vx/vy still zero. Worm state is not in
-- the Lua surface, so motion is measured from frame to frame instead; testing
-- velocity alone never sees a walking worm at all.
local function note_motion(s, w)
  local p = s.seen[w.id]
  local m = (w.vx ~= 0 or w.vy ~= 0)
  if p then
    if p.x ~= w.x or p.y ~= w.y then
      m = true
    end
    p.x, p.y, p.moving = w.x, w.y, m
  else
    s.seen[w.id] = { x = w.x, y = w.y, moving = m }
  end
end

local function moving(s, w)
  local p = s.seen[w.id]
  return p ~= nil and p.moving
end

-- need_motion only on acquisition: PX requires movement to notice a worm, but
-- keeps an acquired target on line of sight alone, even if it stands still.
local function sees(a, s, w, need_motion)
  if w.alliance == s.alliance or w.visible == false then
    return false
  end
  if need_motion and REQUIRE_MOTION and not moving(s, w) then
    return false
  end
  local ex, ey = a.x, a.y - MUZZLE_UP * PX
  local dx = (w.x - ex) // PX
  local dy = (w.y - ey) // PX
  if dx * dx + dy * dy > SENSOR_PX * SENSOR_PX then
    return false
  end
  return not wa.land.trace(ex, ey, w.x, w.y)
end

local function acquire(a, s)
  local ex, ey = a.x, a.y - MUZZLE_UP * PX
  local best, best_d
  for _, w in ipairs(wa.worms.all()) do
    if sees(a, s, w, true) then
      local dx = (w.x - ex) // PX
      local dy = (w.y - ey) // PX
      local d = dx * dx + dy * dy
      if not best_d or d < best_d or (d == best_d and w.id < best.id) then
        best, best_d = w, d
      end
    end
  end
  return best
end

-- PX keeps the target it acquired until it loses sight of it, rather than
-- re-picking the nearest worm every frame. Re-picking swings the aim to a new
-- worm mid-track, which reopens the aim gap and interrupts firing.
local function held(a, s)
  if not s.tid then
    return nil
  end
  for _, w in ipairs(wa.worms.all()) do
    if w.id == s.tid then
      return sees(a, s, w, false) and w or nil
    end
  end
  return nil
end

local function impact(b)
  b:explode({ damage = DAMAGE, id = 101 })
  b:despawn()
end

local function start_firing(a, s)
  if s.firing then return end
  s.firing = true
  s.anim = 0
  -- PX zeroes ShootTimer the instant firing (re)starts, guaranteeing the
  -- first round of a burst fires this same tick rather than waiting out
  -- whatever cooldown happened to be left over from before.
  s.cooldown = 0
  s.fire_sound = 35
  a:sound("sounds/sentryfireloop.wav")
end

local function stop_firing(a, s)
  if not s.firing then return end
  s.firing = false
  s.anim = 0
  a:sound("sounds/sentryfireend.wav")
end

local function update_servo(a, s, rotating)
  if rotating then
    if not s.rotating then
      s.rotating = true
      s.servo_sound = 17
      a:sound("sounds/sentryservostart.wav")
    elseif s.servo_sound <= 0 then
      s.servo_sound = 47
      a:sound("sounds/sentryservoloop.wav")
    end
  elseif s.rotating then
    s.rotating = false
    s.servo_sound = 0
    a:sound("sounds/sentryservoend.wav")
  end
end

local function fire(a, s)
  s.shots = s.shots + 1
  local dev = 0
  if s.shots % 5 ~= 0 then
    dev = wa.random(-SPREAD_TENTHS, SPREAD_TENTHS) / 10
  end

  local rad = math.rad(s.angle + dev)
  local dx, dy = wa.math.sin(rad), wa.math.cos(rad)
  local mx = a.x + math.floor(dx * MUZZLE_OUT * PX)
  local my = a.y - MUZZLE_UP * PX + math.floor(dy * MUZZLE_OUT * PX)
  local reach = SENSOR_PX * PX
  local ex = mx + math.floor(dx * reach)
  local ey = my + math.floor(dy * reach)

  -- Shell ejection: perpendicular to the barrel, kicked to whichever side
  -- the turret currently faces (s.side, PX's TurretSide), a fixed pattern
  -- standing in for PX's random jitter and speed. Cosmetic, so it fires even
  -- on a shot the self-blast check below is about to cancel.
  local jitter = wa.random(-CASING_JITTER_DEG, CASING_JITTER_DEG)
  local eject_rad = rad + math.rad(90 * s.side + jitter)
  local edx, edy = wa.math.sin(eject_rad), wa.math.cos(eject_rad)
  local speed = wa.random(CASING_SPEED_MIN, CASING_SPEED_MAX) / 100
  wa.actors.spawn({
    sprite = CASING,
    x = a.x,
    y = a.y - MUZZLE_UP * PX,
    vx = math.floor(edx * speed * PX),
    vy = math.floor(edy * speed * PX),
    gravity = false,
    collide = false,
    owner = s.owner,
    kind = "casing",
    on = (function()
      local life = CASING_LIFE
      local spin = 0
      return function(c)
        life = life - 1
        if life <= 0 then
          c:despawn()
          return
        end
        c:gravity()
        c:move({ terrain = false, worms = false })
        spin = (spin + 1) % CASING_FRAMES
        c:frame(spin)
      end
    end)(),
  })

  -- Terrain stops the round; a worm standing in front of that stops it sooner.
  local hit = wa.land.trace(mx, my, ex, ey)
  local hx, hy = ex, ey
  if hit then
    hx, hy = hit.x, hit.y
  end
  local rx, ry = (hx - mx) // PX, (hy - my) // PX
  local hit_px = rx * rx + ry * ry
  for _, w in ipairs(wa.worms.all()) do
    if w.alliance ~= s.alliance and w.visible ~= false then
      local wx = (w.x - mx) // PX
      local wy = (w.y - my) // PX
      local along = wx * dx + wy * dy
      if along > 0 and along * along < hit_px then
        local off = wx * dy - wy * dx       -- perpendicular distance to the ray
        if off * off <= HIT_PX * HIT_PX then
          hx = mx + math.floor(dx * along * PX)
          hy = my + math.floor(dy * along * PX)
          hit_px = along * along
        end
      end
    end
  end

  if hit_px < SELF_BLAST_PX * SELF_BLAST_PX then
    return                       -- muzzle-adjacent: do not blast ourselves
  end

  wa.actors.spawn({
    sprite = IMPACT,
    x = hx,
    y = hy,
    vx = 0,
    vy = 0,
    gravity = false,
    collide = false,
    origin = "center",
    owner = s.owner,
    on = impact,
  })

  s.ammo = s.ammo - 1
  if s.ammo <= 0 then
    s.active = false
    stop_firing(a, s)
  end
end

local function think(a, s)
  -- A planted turret is immovable. Re-assert position and zero velocity every
  -- frame so nothing external can shift it: an explosion blast (its own shots
  -- included) or a sprite swap would otherwise accumulate into a launch.
  if s.px then
    a.x, a.y = s.px, s.py
  end
  a.vx, a.vy = 0, 0

  for _, w in ipairs(wa.worms.all()) do
    note_motion(s, w)
  end

  local target
  if s.active then
    target = held(a, s)
    if not target and not s.lost then
      target = acquire(a, s)
      if target then
        s.tid = target.id
      end
    end
  end
  local want

  if target then
    if not s.had_target then
      s.activate = ACTIVATE
      if s.beep <= 0 then
        a:sound("sounds/sentrybeeps2.wav")
        s.beep = BEEP_FRAMES
      end
    end
    s.had_target = true
    s.lost = false
    s.tx, s.ty = target.x, target.y
    want = angle_to(a.x, a.y - MUZZLE_UP * PX, target.x, target.y)
    s.angle = turn_toward(s.angle, want, ROT_ACTIVE)
  elseif s.had_target then
    -- PX stops firing at once, turns to the last visible point, then drops it.
    if not s.lost then stop_firing(a, s) end
    s.lost = true
    want = angle_to(a.x, a.y - MUZZLE_UP * PX, s.tx, s.ty)
    s.angle = turn_toward(s.angle, want, ROT_ACTIVE)
    if angle_gap(s.angle, want) <= AIM_TOLERANCE then
      s.had_target = false
      s.lost = false
      s.tid = nil
    end
  else
    s.had_target = false
    -- PX carries no timer here: it sweeps toward one extreme and reverses
    -- the instant the turret reaches it (turn_toward snaps exactly onto
    -- \`want\` on the step that closes the gap). A fixed-period timer instead
    -- left the turret motionless for most of each cycle once it arrived at
    -- the extreme early -- a hold phase PX's own idle does not have.
    want = s.idle + s.sweep_dir * SWEEP
    s.angle = turn_toward(s.angle, want, ROT_IDLE)
    if s.angle == want then
      s.sweep_dir = -s.sweep_dir
    end
  end

  -- PX: "turret rotated over itself, change the sentry's idle target angle
  -- so it faces the other way when it goes back to idle." Tracking a target
  -- can carry s.angle past the turret's own facing side; without this the
  -- turret would sweep all the way back to its spawn-time idle angle
  -- afterwards instead of idling on whichever side it now faces.
  if (180 - s.angle) * s.side < 0 then
    s.side = -s.side
    s.idle = 180 - 90 * s.side
  end

  if not s.active then
    want = s.idle - 45 * s.side
    s.angle = turn_toward(s.angle, want, ROT_IDLE)
    stop_firing(a, s)
  end

  if s.beep > 0 then s.beep = s.beep - 1 end
  if s.activate > 0 then s.activate = s.activate - 1 end
  if s.cooldown > 0 then s.cooldown = s.cooldown - 1 end
  if s.servo_sound > 0 then s.servo_sound = s.servo_sound - 1 end
  if s.fire_sound > 0 then s.fire_sound = s.fire_sound - 1 end

  local aligned = target and angle_gap(s.angle, want) <= AIM_TOLERANCE
  -- PX only starts the "long rotation" sound once the remaining turn is at
  -- least double the rotation speed (a 3 degree gap at ROT_ACTIVE): the
  -- StartRotatingSound()/StopRotatingSound() gate is \`speed >= 2*RotationSpeed\`,
  -- not "not yet aligned" -- aligned uses AIM_TOLERANCE for a different thing
  -- (whether to fire), and reusing it here started the servo too eagerly.
  local long_rotation = target ~= nil and angle_gap(s.angle, want) >= 2 * ROT_ACTIVE
  update_servo(a, s, long_rotation)

  -- PX latches into a firing state once the target is in its sights and keeps
  -- firing until it loses the target, runs dry or is disabled. Re-testing the
  -- aim gap per shot makes it stutter against a moving worm, because the gap
  -- oscillates around the tolerance while tracking.
  local hold_fire = (active_alliance == s.alliance)

  if target and not hold_fire and s.activate <= 0 and (s.firing or aligned) then
    start_firing(a, s)
    if s.fire_sound <= 0 then
      s.fire_sound = 35
      a:sound("sounds/sentryfireloop.wav")
    end
    if s.cooldown <= 0 then
      fire(a, s)
      s.cooldown = SHOT_FRAMES
    end
  elseif not target or hold_fire then
    stop_firing(a, s)
  end
end

-- The tripod is the actor itself; the gun is a child actor drawn above it.
--
-- Keeping the tripod as the main actor means every bit of the planting,
-- feet-platform and collision logic below is untouched by the renderer
-- change: it still lands, sinks and sits on exactly the footprint it always
-- did. The gun carries no physics at all -- it is positioned, rotated and
-- tinted purely for display.
local function sync(a, s)
  local gun = s.gun
  if not gun or gun.dead then
    return
  end
  -- The gun's pivot is the housing centre, which the bake put at the frame
  -- centre, so rotating the quad about its centre matches PX's AddSpriteEx.
  gun.x, gun.y = a.x, a.y - MUZZLE_UP * PX
  gun.vx, gun.vy = 0, 0

  local pose = s.firing and (1 + ((s.anim // 3) % 2)) or 0
  if pose ~= s.pose then
    gun:frame(pose)
    s.pose = pose
  end

  -- The flare rides the same pivot and aim as the gun. It is always present
  -- and simply selects an empty frame while idle: with premultiplied additive
  -- a fully transparent texel adds nothing, so there is no cost to leaving it
  -- in the batch.
  local flare = s.flare
  if flare and not flare.dead then
    flare.x, flare.y = gun.x, gun.y
    flare.vx, flare.vy = 0, 0
    local lit = (pose == 1) and 1 or 0
    if lit ~= s.lit then
      flare:frame(lit)
      s.lit = lit
    end
    flare:gfx({
      angle = (90 - s.angle) % 360,
      tint = 0xFFFFFF,
      blend = "add",
      depth = IN_FRONT_OF_TERRAIN,
    })
  end
  -- s.angle is 0 down / 90 right; the art faces right and the renderer takes
  -- clockwise screen degrees, so right (90) must map to 0.
  -- Normalised to 0..360 so a logged angle is always comparable; -180 and
  -- 180 are the same rotation but only one of them reads clearly.
  -- The tripod keeps the default depth and is occluded by terrain, so its
  -- sunk feet disappear into the ground. The gun sits in front of terrain:
  -- it is mounted above the landscape and should never be buried by it.
  --
  -- Neither is occluded by worms, which no single painter-order depth can
  -- express -- WA draws terrain behind worms, so "in front of worms and
  -- behind terrain" is an empty interval. The renderer's mask decides per
  -- pixel by source instead of inheriting one order.
  gun:gfx({
    angle = (90 - s.angle) % 360,
    tint = TEAM_TINT[s.alliance + 1] or TEAM_TINT[1],
    depth = IN_FRONT_OF_TERRAIN,
  })
end

local function brain(a, ev)
  local s = state[a.id]
  if not s then
    return
  end
  ev = ev or {}
  if (ev.damage or 0) > 0 then
    s.health = s.health - ev.damage
    s.active = false
    stop_firing(a, s)
    update_servo(a, s, false)
    if s.health <= 0 then
      if s.gun and not s.gun.dead then
        s.gun:despawn()
      end
      if s.flare and not s.flare.dead then
        s.flare:despawn()
      end
      state[a.id] = nil
      -- PX explodes at PosY-20 -- the turret's body, not its feet. explode()
      -- defaults to \`below\` the actor, which for a bottom-anchored sprite
      -- centres the blast underground instead of on the visible housing.
      a:explode({ damage = 50, id = 100, below = false })
      a:despawn()
      return
    end
  end
  if s.firing then s.anim = s.anim + 1 end

  if not s.planted then
    a:gravity()
    local hit = a:move({ terrain = true, worms = false })

    if hit.land then
      a.vx, a.vy = 0, 0
      s.planted = true
      s.px, s.py = a.x, a.y + SINK_PX * PX
      a:sound("sounds/sentryplace.wav")
      sync(a, s)
      return                     -- planted this tick: skip the drown check
    end

    a:advance()

    if a:in_water() then
      if s.gun and not s.gun.dead then
        s.gun:despawn()
      end
      if s.flare and not s.flare.dead then
        s.flare:despawn()
      end
      state[a.id] = nil
      a:despawn()
      return
    end
  else
    think(a, s)
  end

  sync(a, s)
end

-- Alliance order, matching TEAM_TINT.
local TEAM_NAMES = { "red", "blue", "green", "yellow", "magenta", "cyan" }

local function team_sheets(pose)
  local list = {}
  for i, team in ipairs(TEAM_NAMES) do
    list[i] = "sprites/teams/" .. team .. "/" .. pose
  end
  return list
end

-- Where the turret lands: slightly in front of the worm, not on it. A wall
-- that close leaves it at the worm, as before.
local FRONT_PX = 5

local function placement_x(worm, facing)
  local x = worm.x + facing * FRONT_PX * PX
  if wa.land.trace(worm.x, worm.y, x, worm.y) then
    return worm.x
  end
  return x
end

wa.weapons.replace({
  weapon = "donkey",
  copy_from = "mine",
  name = "Sentry Gun",
  -- PX's own icon, copied byte for byte so replays share its asset.
  panel_icon = "sprites/ico_sentrygun.png",
  is_weapon = true,
  -- One sheet per team colour, so the housing the worm carries is its team's
  -- colour like the planted turret. tools/bake_sentry_team_sprites.py bakes
  -- them from PX's grey sheets with TEAM_TINT. The grey sheets
  -- (sprites/equip*, sprites/unequip*) stay for a neutral sentry.
  worm_sprites = {
    weaponlnk = team_sheets("equip"), weaponlnku = team_sheets("equipu"),
    weaponlnkd = team_sheets("equipd"),
    wthrow = team_sheets("unequip"), wthrowu = team_sheets("unequipu"),
    wthrowd = team_sheets("unequipd"),
  },

  -- Single-frame sprites, not strips. sprite_columns defaults to 8, which
  -- would slice every one of them into eight slivers.
  -- Draw order comes from the render queue's per-command depth, where high is
  -- further back. Measured in a live match: soil 0x1b0000, terrain 0x180000,
  -- and the turret was landing at 0x50001 -- in front of everything. 0x190000
  -- sits between terrain and soil, so the turret is occluded by the landscape
  -- but still draws over the soil behind it.
  --
  -- depth_prefix keeps this to the turret sheets: the worm holding the gun is
  -- a separate sheet and belongs in front of terrain, where it already is.
  --
  -- (Display \`layer\` is palette-bound and is NOT the way to do this: installing
  -- against another layer's PaletteContext renders every colour wrong.)
  params = {
    sprite_columns = 1,
    -- equip/unequip above are one-shot animations played frame by frame, not
    -- aim-angle sheets like the web editor's aiming GIFs (the default).
    worm_sprites_animate = true,
    depth = 0x190000,
    depth_prefix = "sprites/turret_",
    -- The GPU renderer takes these sheets: packed into a texture atlas,
    -- drawn as rotated and tinted quads, occupying none of the 223 shared WA
    -- sprite slots and never touching the map palette.
    gpu_prefix = "sprites/turret_",
    -- NOT reserving palette slots. Twice now that has repainted the scene:
    -- PaletteContext's in_use flag does not mean "no pixels on screen carry
    -- this index", so writing a slot's RGB changes the colour of whatever
    -- already uses it -- terrain included. An index is global, so CPU palette
    -- mutation cannot be scoped to one pack. See the notes in sprite.rs.
  },
  sprites = SPRITES,
  sounds = {
    "sounds/sentryplace.wav", "sounds/sentrybeeps2.wav",
    "sounds/sentryfireloop.wav", "sounds/sentryfireend.wav",
    "sounds/sentryservostart.wav", "sounds/sentryservoloop.wav",
    "sounds/sentryservoend.wav",
  },

  -- Stock mine fire timing/ammo/retreat, but a Lua body instead of a MineEntity.
  on_fire = function(fire_ev)
    local worm = fire_ev.worm
    -- The owner's colour. Not worm.team: that is the team's slot in the
    -- roster, which matches its colour only in a default offline game --
    -- online, a blue team in slot 1 placed a red turret.
    local alliance = (worm and worm.alliance) or 0
    if alliance < 0 or alliance > 5 then
      alliance = 0
    end
    local facing = worm.facing
    local idle = facing < 0 and 270 or 90
    local x = placement_x(worm, facing)

    local body = wa.actors.spawn({
      sprite = BASE,
      x = x,
      y = worm.y,
      -- Small placement nudge, independent of aim or charged power.
      vx = (worm.vx // 2) + facing * 19661,
      vy = (worm.vy // 2) - 9830,
      loop = false,
      origin = "bottom",
      owner = worm,
      kind = "sentry",
      persist = true,
      on = brain,
    })

    state[body.id] = {
      alliance = alliance,
      owner = worm,
      planted = false,
      active = true,
      ammo = AMMO,
      health = 50,
      angle = idle,
      idle = idle,
      side = facing < 0 and -1 or 1,
      sweep_dir = 1,
      shots = 0,
      firing = false,
      anim = 0,
      rotating = false,
      servo_sound = 0,
      fire_sound = 0,
      beep = 0,
      activate = 0,
      cooldown = 0,
      had_target = false,
      lost = false,
      seen = {},
      pose = nil,
      lit = nil,
      gun = nil,
      flare = nil,
    }
    -- The gun and its muzzle flash ride along with no physics of their own:
    -- sync() places both every frame from the tripod's position.
    state[body.id].gun = wa.actors.spawn({
      sprite = GUN,
      x = x,
      y = worm.y - MUZZLE_UP * PX,
      vx = 0, vy = 0,
      gravity = false,
      collide = false,
      loop = false,
      origin = "center",
      owner = worm,
      kind = "sentry_gun",
      persist = true,
      on = function() end,
    })
    state[body.id].flare = wa.actors.spawn({
      sprite = FLARE,
      x = x,
      y = worm.y - MUZZLE_UP * PX,
      vx = 0, vy = 0,
      gravity = false,
      collide = false,
      loop = false,
      origin = "center",
      owner = worm,
      kind = "sentry_flare",
      persist = true,
      on = function() end,
    })
    sync(body, state[body.id])
  end,
})

-- Each turn reloads and reactivates every turret, as the original did.
-- \`pairs(state)\` is fine here because the body is order-independent: every
-- entry gets the same reset, none reads another. If this ever grows an early
-- \`return\` or a read of \`state\` inside the loop, switch to
-- \`ipairs(wa.sorted(state))\` -- string-keyed \`pairs()\` order differs per
-- process (Lua randomises its string-hash seed).
wa.on.worm_message(function(worm, msg)
  if msg ~= wa.msg.START_TURN then
    return
  end
  active_alliance = worm.alliance
  for _, s in pairs(state) do
    s.ammo = AMMO
    s.active = true
    s.had_target = false
    -- A new turn needs new movement. The target acquired last turn -- often
    -- while this turret held fire through its own side's turn -- is dropped,
    -- and so is the motion memory; otherwise the turret opened fire on a
    -- worm that had stood still since, the moment its teammate's turn began.
    s.tid = nil
    s.lost = false
    s.seen = {}
  end
end, { msgs = { wa.msg.START_TURN } })
`
      }
    ],
  },
  {
    id: 'example.bee',
    name: 'Spawn Bees',
    version: '0.8.0',
    author: 'reddaz',
    category: 'weapons',
    replacesSlot: 'skunk',
    description: 'A flying object: the replaced Skunk spawns a bee that steers, roams, picks targets and animates in flight.',
    tags: ['example', 'weapon', 'actor'],
    files: [
      {
        path: 'bee.lua',
        name: 'bee.lua',
        language: 'lua',
        content: `-- Keeper Bee Script with wa.on.worm_message FRAME_FINISH Spawner
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
  -- cadence the original's \`gframe % 10\` intended, just scoped correctly.
  s.ticks = (s.ticks or 0) + 1

  -- Threshold computed from THIS bee's own s.targetId, not a shared
  -- module-level variable other bees were racing to overwrite. Direction
  -- (tighter while chasing) kept as you had it -- worth double-checking
  -- that's the intent you want, since PX's own beeBonkReset went the other
  -- way (24 while a target is locked, vs 10 while roaming: "targets too
  -- close will never get exploded"). If clipping-while-chasing should be
  -- MORE tolerated rather than less, flip this to \`s.targetId and 24 or 10\`
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
}`
      }
    ],
  },
  {
    id: 'example.highlander_pure_lua',
    name: 'Highlander Rules',
    version: '0.1.0',
    author: 'wkLua',
    category: 'rules',
    description: 'A pure-Lua scheme: deal one weapon from each pool, track each worm\'s inventory, and take a killed worm\'s kit.',
    tags: ['example', 'rules', 'scheme'],
    files: [
      {
        path: 'rules.lua',
        name: 'rules.lua',
        language: 'lua',
        content: `-- Highlander, stock weapons only.
--
-- A port of the rules in Project X's \`scheme_hl_0rang3\` (Highlander 0rang3
-- 1.1), without its custom weapons. Every worm is dealt one weapon from each
-- of three pools at the start of the match. Only the worm whose turn it is
-- may use its weapons, one shot of each per turn. Kill a worm and you take
-- everything it carried.
--
-- The source (\`highlander.txt\`) does all of this with four calls:
-- SetWeaponEx(team, weapon, 1) to grant and SetWeaponEx(team, weapon, 0) to
-- take away. \`worm:ammo(name, { set = n })\` is the same absolute write. It has
-- to be absolute: a stock scheme gives some of these weapons infinite ammo,
-- and adding to infinite leaves it infinite.
--
-- Where this differs from the source, on purpose:
--
--   * No turn-end removal. PX removes a worm's weapons at M_TURNEND and again,
--     through CurW, at the next M_TURNBEGIN. The second alone is enough, so
--     this listens for one message instead of two.
--
--     START_TURN (0x34) reaches only the worm whose turn it is: WA's handler
--     marks the receiver turn-active and calls TeamArena::SetActiveWorm on it
--     unconditionally (OpenWA \`msg_start_turn\`), which would be nonsense sent
--     to every worm. So the worm it arrives on IS the active worm.
--
--   * Every pooled slot is zeroed for every team at each turn start, not
--     just the previous worm's. PX relied on its scheme having those slots at
--     zero. Here the scheme can say anything, so the pack enforces it itself.
--
--   * Wind Changer (x1) and Hot Air Balloon (x3) are PX weapons with no stock
--     equivalent, so nothing is granted in their place.
--
--   * The cavern rule bans strikes by NAME. PX did it by cutting the random
--     range short (RandomInt(0,20) instead of (0,28)), which only works
--     because its list happened to keep the strikes at the end.
--
-- Lockstep: every rule runs inside wa.on.worm_message, which is WA's own
-- simulation, and every random choice is wa.random(). Two peers, or a peer
-- and a replay, deal the same hands and make the same grants. Nothing here
-- reads local input or the clock.

-- ----------------------------------------------------------------- pools

-- Movement: exactly the seven the design names.
local MOVEMENT = {
  "ninja_rope", "girder", "girder_pack", "jet_pack", "low_gravity",
  "fast_walk", "parachute",
}

-- Second weapon: the F4 row, plus what is left of F7 once the girders have
-- gone to movement.
local SECOND = {
  "fire_punch", "dragon_ball", "kamikaze", "suicide_bomber", "prod",
  "blow_torch", "pneumatic_drill", "baseball_bat",
}

-- Offensive: every remaining weapon that does damage, super weapons included.
-- The non-attacks -- bungee, teleport, scales, select worm, freeze, the
-- utilities, skip go and surrender -- are not in any pool. Highlander never
-- touches them, so their ammo is whatever the scheme says.
local OFFENSIVE = {
  -- F1-F3
  "bazooka", "homing_missile", "mortar", "homing_pigeon", "sheep_launcher",
  "grenade", "cluster_bomb", "banana_bomb", "battle_axe", "earthquake",
  "shotgun", "handgun", "uzi", "minigun", "longbow",
  -- F5-F6
  "dynamite", "mine", "sheep", "super_sheep", "aqua_sheep", "mole_bomb",
  "air_strike", "napalm_strike", "mail_strike", "mine_strike", "mole_squadron",
  -- F9-F11
  "super_banana", "holy_grenade", "flame_thrower", "salvation_army", "mb_bomb",
  "petrol_bomb", "skunk", "ming_vase", "sheep_strike", "carpet_bomb",
  "mad_cow", "old_woman", "donkey", "nuclear_test", "armageddon",
  -- F12
  "magic_bullet",
}

-- Everything that arrives from the sky. PX keeps strikes out of caverns, where
-- they would hit the roof.
local CAVE_BANNED = {
  air_strike = true, napalm_strike = true, mail_strike = true,
  mine_strike = true, mole_squadron = true, sheep_strike = true,
  carpet_bomb = true, donkey = true, armageddon = true,
}

-- Every slot this pack owns, in a fixed order. Zeroing walks this list, so it
-- must not depend on pairs() order: Lua's string hashing is seeded per
-- process, and a different order on each peer is a different sequence of
-- writes.
local POOLED = {}
for _, pool in ipairs({ OFFENSIVE, SECOND, MOVEMENT }) do
  for _, name in ipairs(pool) do
    POOLED[#POOLED + 1] = name
  end
end

-- ----------------------------------------------------------------- state

-- Keyed by stable worm id (team * 16 + index), which is the same on every
-- peer and in a replay. Never by handle: a handle is an entity address, and a
-- dead worm's entity is freed while its id lives on in these tables.
local hands = {} -- [id] = { weapon names }, draw order first, then stolen
local dead = {} -- [id] = true once the worm has been seen at 0 hp
local active_id -- PX's CurW: the worm whose turn it is, or was

local function by_id(a, b)
  return a.id < b.id
end

-- The live worms, in id order. Called fresh every time rather than cached:
-- the list shrinks as worms die, and a cached handle to a freed worm would be
-- a read of freed memory.
local function worms()
  local list = wa.worms.all()
  table.sort(list, by_id)
  return list
end

local function find(id)
  for _, w in ipairs(worms()) do
    if w.id == id then
      return w
    end
  end
  return nil
end

local function describe(list)
  if not list or #list == 0 then
    return "(nothing)"
  end
  return table.concat(list, ", ")
end

-- ----------------------------------------------------------------- rules

local function draw(pool)
  return pool[wa.random(1, #pool)]
end

local function offensive_pool()
  if not wa.world.cavern() then
    return OFFENSIVE
  end
  local pool = {}
  for _, name in ipairs(OFFENSIVE) do
    if not CAVE_BANNED[name] then
      pool[#pool + 1] = name
    end
  end
  return pool
end

-- One from each pool, dealt to a worm on the first message it receives -- as
-- PX does on each worm's first M_FRAME. Dealing everyone at once on the very
-- first message would assume every worm already exists by then; this makes no
-- such assumption. Worms receive messages in WA's own entity order, which is
-- the same on every peer, so the draws still come out of WA's RNG in the same
-- sequence everywhere.
local function deal(worm)
  local cave = wa.world.cavern()
  hands[worm.id] = { draw(offensive_pool()), draw(SECOND), draw(MOVEMENT) }
  wa.log(string.format(
    "highlander: worm %d dealt %s (%s map)",
    worm.id, describe(hands[worm.id]), cave and "cavern" or "open"
  ))
end

local function set_all(worm, list, n)
  for _, name in ipairs(list) do
    worm:ammo(name, { set = n })
  end
end

-- Take every pooled weapon away from every team.
--
-- WA keeps ammo in separate physical rows (\`worm.ammo_group\`), which need not
-- match a team's visible coalition colour (\`worm.alliance\`).
-- Going through one worm of each team reaches every row without relying on
-- that mapping -- a row two allied teams share is simply written twice.
local function clear_pooled()
  local seen = {}
  for _, w in ipairs(worms()) do
    if not seen[w.team] then
      seen[w.team] = true
      set_all(w, POOLED, 0)
    end
  end
end

local function start_turn(worm)
  clear_pooled()
  active_id = worm.id
  set_all(worm, hands[worm.id] or {}, 1)
end

-- PX checks every worm on every frame for "0 hp and not yet marked dead".
local function check_death(worm)
  local id = worm.id
  if dead[id] or worm.hp > 0 then
    return
  end
  dead[id] = true
  local mine = hands[id] or {}

  if active_id == id then
    -- Died on its own turn: nothing to hand on, just take its weapons away.
    set_all(worm, mine, 0)
    wa.log(string.format("highlander: worm %d died on its own turn", id))
    return
  end

  -- Otherwise the worm whose turn it is gets everything -- whoever or
  -- whatever did the killing, friend or foe, exactly as in PX.
  if active_id == nil or dead[active_id] then
    return
  end
  local stealer = find(active_id)
  if not stealer then
    return
  end
  local theirs = hands[active_id]
  for _, name in ipairs(mine) do
    theirs[#theirs + 1] = name
  end
  -- Usable at once, this turn, not from the stealer's next turn.
  set_all(stealer, mine, 1)
  wa.log(string.format(
    "highlander: worm %d took %s from worm %d", active_id, describe(mine), id
  ))
end

wa.on.worm_message(function(worm, msg)
  if hands[worm.id] == nil then
    deal(worm)
  end
  if msg == wa.msg.START_TURN then
    start_turn(worm)
  elseif msg == wa.msg.FRAME_FINISH then
    check_death(worm)
  end
end)
`
      }
    ],
  },
  {
    id: 'example.swim_suit',
    name: 'Swim Suit',
    version: '0.1.0',
    author: 'StepS / PyroMan (Project X port)',
    category: 'utility',
    description: 'Worm manipulation: take a worm into water, swim under four-key control, dive, float and drown. Extracted from Project X.',
    tags: ['example', 'worm', 'water'],
    files: [
      {
        path: 'lib/shared.lua',
        name: 'lib/shared.lua',
        language: 'lua',
        content: `-- Highlander: what its modules share, one table per match.
-- Split from rules.lua by tools/split_highlander.py.
local shared = {}

return shared
`
      },
      {
        path: 'swim_suit.lua',
        name: 'swim_suit.lua',
        language: 'lua',
        content: `-- Highlander: Swim Suit. Split from rules.lua by tools/split_highlander.py.
local shared = require("lib/shared")
local current_worm = shared.current_worm
local held = shared.held
local trunc = shared.trunc

-- --------------------------------------------------------------- Swim Suit
do
--
-- PX's swimsuit_SCRIPT (StepS; swim sprites by Team17) with fastswim_SCRIPT
-- and swim_suit_diving_s (PyroMan), on WA's laser sight. Using it puts the
-- suit on (or, out of the water, takes it off): WA's laser sight never
-- switches on, as PX's FireFinal never calls super. A worm in the suit that
-- falls into the water splashes and swims instead of drowning: the pack takes
-- it (worm:take) and moves it by its own four keys (up to 2.5 pixels a frame
-- times the swim speed, gliding to a stop when they are let go), stopping at
-- land, turned by left and right unless Shift is held. Enter and weapons do
-- nothing while it swims (Fast Walk aside). Out of the water it is released
-- as from a jump. Too deep (180 pixels under the water, or the bottom of a
-- cavern), knocked flying, or still in the water when the turn ends, the
-- suit gives out and it drowns. Fast Walk switches the swim speed between 2
-- and 6 for the turn. Missiles in the water can hit a swimming worm: they
-- blow up on it (damage 100, blast 50).
--
-- A worm in the suit falling to the water dives (swim_suit_diving_s, by
-- PyroMan): where WA would take its control (falling at 8 pixels a frame,
-- WA's fall height, 0x50D370), the rest of its fall is traced frame by frame
-- at WA's gravity (wa.land.trace, worm:fits); if it ends in the water, the
-- pack takes the worm (worm:take) and carries it down that path to the
-- splash, so it reaches the water in control. PX's looked straight down and
-- held the worm in a state.
--
-- Drawn in the worm's place: the swim or, when still, the float animation,
-- and a bubble around the worm while it wears the suit.
--
-- Not ported: PX's ghost jet and battyswim interplay (other libraries), the
-- Ninja Rope workaround after leaving the water (the Jump is on the rope's
-- slot here), inverted controls, and the team message on putting it on.

local SWIM_CAP = 2.5          -- pixels a frame, times the swim speed
local SWIM_PUSH = 0.1
local SWIM_DRAG = 1.05
local SWIM_STILL = 0.05
local SWIM_FLOAT_STEP = 0.0099
local SWIM_DEPTH = 180        -- how far under the water the suit holds
local SWIM_SUIT_MASK = 134342 -- 0x20CC6: the worm's 0x420CC6 without SWIM_WATER
-- Bit 22 of a collision mask: WA's water acts on what has it (0x4FDE20), and
-- sinks or drowns it. The suit takes it off; a missile sinking in the water
-- has only it.
local SWIM_WATER = 0x400000
local SWIM_MISSILE_MASK = 0x40007C -- a missile in the water that hits worms
local SWIM_SPLASH = 57        -- WA's sound
local SWIM_BODY_DEPTH = wa.depth.FRONT
local SWIM_RING_DEPTH = wa.depth.FRONT + 1
-- Ring sheet is 50×50; wa.draw.quad corners are centred on the worm like a:gfx.
local SWIM_RING_HALF = 25
-- The land a swimmer stops at: its body, 4 pixels either side, 6 above and below.
local SWIM_HALF_W, SWIM_HALF_H = 4, 6

-- The dive: WA takes a falling worm's control at 8 pixels a frame; taken
-- a frame early.
local DIVE_SPEED = 8
local DIVE_FRAMES = 2000      -- the longest fall traced
-- WA's states for a worm falling under its own control: jumping, its fall,
-- falling (off a cliff, or let go).
local FALLING = { [0x79] = true, [0x7A] = true, [0x7E] = true }

local swim_speed = 2          -- fastswim: Fast Walk switches 2 and 6
local swim_in_game = false    -- SwimInGame: someone has worn the suit
local swimmers = {} -- worm id -> { suit, plopready, plopped, floating, plophase, flophase, fmult, keys, body, x, y, vx, vy, dive, dived }

local function swimmer_of(worm)
  local s = swimmers[worm.id]
  if not s then
    s = { suit = false, plopready = false, plopped = false, floating = false,
      plophase = 0, flophase = 0, fmult = 5, keys = {} }
    swimmers[worm.id] = s
  end
  return s
end

local function swim_drop_art(worm, s)
  if s.body then s.body:despawn(); s.body = nil end
  worm.body_visible = true
end

-- The suit comes off, the water's bit back in its mask. \`sink\`: it gave out
-- in the water, and the worm goes back to WA out of control, moving at
-- (vx, vy), for WA to drown.
local function suit_off(worm, s, sink, vx, vy)
  s.suit, s.plopready, s.plopped, s.floating = false, false, false, false
  swim_drop_art(worm, s)
  if sink then
    worm:release(vx, vy, { tumble = true })
  end
  worm.collision_mask = worm.collision_mask | SWIM_WATER
end

local function swim_blocked(x, y)
  return wa.land.solid(x - SWIM_HALF_W, y) or wa.land.solid(x + SWIM_HALF_W, y)
    or wa.land.solid(x, y - SWIM_HALF_H) or wa.land.solid(x, y + SWIM_HALF_H)
end

-- One step towards the cap on a held key, as PX's: while under it, a push;
-- past it, back to it.
local function swim_push(v, dir, cap)
  if dir > 0 then
    if v < cap then return v + SWIM_PUSH * swim_speed end
    return cap
  end
  if v > -cap then return v - SWIM_PUSH * swim_speed end
  return -cap
end

-- WA's states for a worm knocked flying: tumbling, hit, blasted.
local KNOCKED = { [0x7F] = true, [0x80] = true, [0x81] = true }

-- One frame of a dive: gravity and wind as WA scales them for the worm, then
-- the move, its centre traced through the land and the worm's shape tested
-- where it ends (WA's own test, worm:fits). Returns the new speed and
-- position, and whether land stops it, in which case the position is where
-- it still was.
local function dive_step(worm, x, y, vx, vy)
  vx = vx + wa.world.wind() * (worm.wind or 0)
  vy = vy + wa.world.gravity() * (worm.gravity or 1)
  local nx, ny = x + vx, y + vy
  if wa.land.trace(x, y, nx, ny) or not worm:fits(nx, ny) then
    return vx, vy, x, y, true
  end
  return vx, vy, nx, ny, false
end

-- Whether a fall from (x, y) at (vx, vy) reaches the water before land.
local function dives_into_water(worm, x, y, vx, vy, water)
  for _ = 1, DIVE_FRAMES do
    local blocked
    vx, vy, x, y, blocked = dive_step(worm, x, y, vx, vy)
    if blocked then return false end
    if y >= water then return true end
  end
  return false
end

local function swim_frame(worm)
  local s = swimmers[worm.id]
  if not s or not s.suit then
    return
  end
  local water = wa.world.water()
  local cap = SWIM_CAP * swim_speed
  if s.dive and not worm.taken then
    -- The engine let go mid-dive: the turn ended, or WA knocked it flying.
    s.dive = nil
  end
  if not FALLING[worm.state_id] and not s.dive then
    s.dived = false -- landed, or out of its fall: the next fall is looked at
  end
  if s.plopready and not s.dive and not s.dived and worm.turn and FALLING[worm.state_id]
    and worm.y < water
    and worm.vy + 2 * wa.world.gravity() * (worm.gravity or 1) >= DIVE_SPEED then
    -- About to lose control: one look at where the fall ends.
    s.dived = true
    if dives_into_water(worm, worm.x, worm.y, worm.vx, worm.vy, water) then
      s.dive = { x = worm.x, y = worm.y, vx = worm.vx, vy = worm.vy }
      worm:take{ turn = "run" }
    end
  end
  local dive_into
  if s.dive then
    local d = s.dive
    local blocked
    d.vx, d.vy, d.x, d.y, blocked = dive_step(worm, d.x, d.y, d.vx, d.vy)
    if blocked then
      -- Land where the trace found none (it changed): WA's again, as it flies.
      s.dive = nil
      worm.x, worm.y = d.x, d.y
      worm:release(d.vx, d.vy)
      return
    end
    worm:carry(d.x, d.y)
    if d.y < water then
      return
    end
    s.dive, dive_into = nil, d
  end
  if worm.y >= water and s.plopready and KNOCKED[worm.state_id] then
    -- Knocked flying into the water: no swim, the suit gives out, and with
    -- the water's bit back WA's water takes it. Held in WA's hit state
    -- without the bit, it never settled and the next turn never came.
    suit_off(worm, s, false)
    return
  end
  if dive_into or worm.y >= water and s.plopready and worm.state ~= "teleporting" then
    -- Into the water: where a dive reached it, at the dive's speed.
    local d = dive_into or worm
    wa.sound.play(worm, SWIM_SPLASH)
    s.plopready, s.plopped = false, true
    s.x, s.y = d.x, d.y
    s.vx, s.vy = math.min(d.vx, cap), math.min(d.vy, cap)
    -- Swimming, it fires nothing but Fast Walk (its swim speed); the suit's
    -- own use is this pack's hook.
    worm:take{ turn = "run", fire = { "stock.fast_walk" } }
    s.plophase = 0
  end
  if s.plopped and not worm.taken then
    -- The engine let go: the turn ended, or WA knocked it flying. Still in
    -- the water, the suit gives out.
    suit_off(worm, s, true, worm.vx, worm.vy)
    return
  end
  if s.plopped then
    local vx, vy = math.min(s.vx, cap), math.min(s.vy, cap)
    local held = s.keys
    local still = math.abs(vx) <= SWIM_STILL * swim_speed and math.abs(vy) <= SWIM_STILL * swim_speed
    if still and not (held.left or held.up or held.down or held.right) then
      -- Floating: the float animation, back and forth.
      s.floating = true
      s.flophase = s.flophase + SWIM_FLOAT_STEP * s.fmult
      if s.flophase >= 0.99 and s.fmult == 5 then
        s.flophase, s.fmult = 0.99, -5
      elseif s.flophase <= 0 and s.fmult == -5 then
        s.flophase, s.fmult = 0, 5
      end
    elseif vx ~= 0 and vy ~= 0 then
      -- Swimming: the stroke follows the faster of the two directions.
      s.floating = false
      if math.abs(vx) >= math.abs(vy) then
        s.plophase = s.plophase + SWIM_FLOAT_STEP * vx * worm.facing
      else
        s.plophase = s.plophase - SWIM_FLOAT_STEP * vy
      end
    elseif vx ~= 0 then
      s.floating = false
      s.plophase = s.plophase + SWIM_FLOAT_STEP * vx
    elseif vy ~= 0 then
      s.floating = false
      s.plophase = s.plophase - SWIM_FLOAT_STEP * vy
    end
    if s.plophase >= 1 or s.plophase <= -1 then
      s.plophase = 0
    end
    local k = worm.keys
    local up, down, left, right = k.up, k.down, k.left, k.right
    if up == down then vy = vy / SWIM_DRAG end
    if left == right then vx = vx / SWIM_DRAG end
    if up then vy = swim_push(vy, -1, cap) end
    if down then vy = swim_push(vy, 1, cap) end
    local shift = wa.world.keys().shift
    if left then
      if not shift then worm.facing = -1 end
      vx = swim_push(vx, -1, cap)
    end
    if right then
      if not shift then worm.facing = 1 end
      vx = swim_push(vx, 1, cap)
    end
    s.keys = { up = up, down = down, left = left, right = right }
    -- The engine clears the keys after this hook. Move, stopping at land
    -- on each axis (unless it is already in land, so it can swim free).
    local stuck = swim_blocked(s.x, s.y)
    local nx = s.x + vx
    if not stuck and swim_blocked(nx, s.y) then vx = 0 else s.x = nx end
    local ny = s.y + vy
    if not stuck and swim_blocked(s.x, ny) then vy = 0 else s.y = ny end
    s.vx, s.vy = vx, vy
    -- Out of the water: on through the air, as from a jump.
    if s.y < water then
      s.floating = false
      s.plopready, s.plopped = true, false
      -- Where the swim took it: its last pin is still under the surface.
      worm.x, worm.y = s.x, s.y
      worm:release(vx, vy)
    else
      worm:carry(s.x, s.y)
      -- Too deep: the suit gives out.
      local y, w = s.y, water
      local deep
      if not wa.world.cavern() then
        deep = y > w + SWIM_DEPTH
      elseif w > 610 then
        deep = y > w + SWIM_DEPTH
      else
        deep = y > 768
      end
      if deep then
        suit_off(worm, s, true, vx, vy)
        return
      end
    end
  end
  -- Between turns, a worm out of the water takes the suit off.
  if not current_worm() and worm.y < water then
    suit_off(worm, s, false)
    return
  end
  -- RenderWorm: in the water, the swim or float animation in the worm's
  -- place (its art faces left). The bubble is drawn at render time below.
  local function art(sheet)
    return wa.actors.spawn({
      sprite = sheet, x = worm.x, y = worm.y, gravity = false,
      collide = false, owner = worm, on = function() end,
    })
  end
  if s.plopped then
    local sheet = s.floating and "sprites/swim_suit/float.png" or "sprites/swim_suit/swim.png"
    if s.body and s.body_sheet ~= sheet then
      s.body:despawn()
      s.body = nil
    end
    s.body = s.body or art(sheet)
    s.body_sheet = sheet
    local phase = s.floating and s.flophase or s.plophase
    s.body.x, s.body.y, s.body.vx, s.body.vy = s.x, s.y, 0, 0
    s.body.facing = -worm.facing
    s.body:frame(math.floor((phase % 1) * 20) % 20)
    s.body:gfx({ depth = SWIM_BODY_DEPTH })
    worm.body_visible = false
  elseif s.body then
    s.body:despawn()
    s.body = nil
    worm.body_visible = true
  end
end

-- Bubble while the suit is worn: draw-only, from the live worm position each
-- rendered frame (keeps the subpixel fraction). A follower LuaActor + a:gfx was
-- pixel-snapped and could wobble when airborne.
if wa.on.draw then
  wa.on.draw(function()
    for _, worm in ipairs(wa.worms.all()) do
      local s = swimmers[worm.id]
      if s and s.suit then
        local x, y, h = worm.x, worm.y, SWIM_RING_HALF
        wa.draw.quad({
          points = {
            { x - h, y - h }, { x + h, y - h }, { x + h, y + h }, { x - h, y + h },
          },
          sprite = "sprites/swim_suit/ring.png",
          depth = SWIM_RING_DEPTH,
        })
      end
    end
  end)
end

wa.on.worm_message(function(worm, msg)
  if msg == wa.msg.FRAME_FINISH then
    swim_frame(worm)
  elseif msg == wa.msg.JUMP then
    -- M_ENTER: no jumping while it swims.
    local s = swimmers[worm.id]
    if s and s.plopped then
      return "eat"
    end
  elseif msg == wa.msg.FIRE_WEAPON then
    local s = swimmers[worm.id]
    if s and s.plopped and worm.weapon ~= "stock.fast_walk" then
      return "eat" -- no weapons while it swims
    end
    if worm.weapon == "stock.fast_walk" then
      swim_speed = swim_speed ~= 6 and 6 or 2
    elseif worm.weapon == "stock.laser_sight" then
      -- FireFinal(Swim Suit), in place of WA's laser sight. The PX bundle
      -- registers this as px.swim_suit; this standalone example replaces the
      -- stock laser sight instead, so the weapon id is the stock one.
      local s = swimmer_of(worm)
      if not s.suit then
        wa.sound.play(worm, "sounds/swim_suit/putting_on_ssuit.wav")
        s.suit, s.plopready = true, true
        swim_in_game = true
        worm.collision_mask = SWIM_SUIT_MASK
      elseif worm.y < wa.world.water() then
        suit_off(worm, s, false)
      end
      worm:ammo("stock.laser_sight", -1)
      return "eat"
    end
  end
end, { msgs = { wa.msg.FRAME_FINISH, wa.msg.JUMP, wa.msg.FIRE_WEAPON } })

-- fastswim: the swim speed is 2 again every turn.
wa.on.turn_start(function()
  swim_speed = 2
end)

-- A missile in the water hits worms too, once anyone has worn the suit.
wa.on.missile_frame(function(m)
  if swim_in_game and m.phase == "pre" and m.collision_mask == SWIM_WATER then
    m.collision_mask = SWIM_MISSILE_MASK
  end
end)

-- CMissile::Collide: such a missile blows up on a swimming worm, and is gone
-- (sent below the water, where WA frees it).
if wa.on.contact then
  wa.on.contact(function(worm, other)
    local s = swimmers[worm.id]
    if s and s.plopped and other.kind == "missile" then
      wa.actors.spawn({
        sprite = false, x = other.x, y = other.y, gravity = false, collide = false,
        owner = worm, explode = { damage = 100, id = 50, now = true },
      })
      other.y = wa.world.water() + 4096
    end
  end)
end
end
`
      }
    ],
  },
  {
    id: 'example.pooz',
    name: 'POOZ',
    version: '0.2.0',
    author: 'wkLua',
    category: 'weapons',
    description: 'A weapon-as-actor: selecting POOZ turns the worm into a controllable runner and drops it back out on a weapon switch.',
    tags: ['example', 'weapons'],
    files: [
      {
        path: 'weapons.lua',
        name: 'weapons.lua',
        language: 'lua',
        content: `-- Shotgun is only the panel slot. Selecting it turns the owner into the POOZ
-- runner (Lua actor). A/D move, W jumps (again in air for the flip), Shift sprints.
-- Switch weapon to drop out.
return {
  install = function()
    local HW = 6
    local BOX_H = 16
    local RUN = 1.5749969482421875
    local SPRINT = 2.274993896484375
    local AIR = 0.05999755859375
    local FRICTION = 0.024993896484375
    local SKID = 0.1100006103515625
    local ACCEL = 0.089996337890625
    local GRAV = 0.239990234375
    local MAX_FALL = 6.1999969482421875
    local JUMP = -5.5500030517578125
    local JUMP2 = -6.399993896484375
    local COYOTE = 6
    local JUMP_BUF = 7
    local SLOPE = 12
    local LAND_VY = 1.399993896484375

    local live = {}

    local function abs(v)
      if v < 0 then
        return -v
      end
      return v
    end

    local function sign(v)
      if v > 0 then
        return 1
      end
      if v < 0 then
        return -1
      end
      return 0
    end

    local function approach(v, target, rate)
      if v < target then
        v = v + rate
        if v > target then
          return target
        end
        return v
      end
      v = v - rate
      if v < target then
        return target
      end
      return v
    end

    local function friction(v, amount)
      if abs(v) <= amount then
        return 0
      end
      return v - sign(v) * amount
    end

    local function blocked(x, y)
      local l = x - HW
      local r = x + HW - 1
      local mid = y - BOX_H // 2
      local top = y - BOX_H
      return wa.land.solid(l, y)
        or wa.land.solid(r, y)
        or wa.land.solid(x, y)
        or wa.land.solid(l, mid)
        or wa.land.solid(r, mid)
        or wa.land.solid(l, top)
        or wa.land.solid(r, top)
        or wa.land.solid(x, top)
    end

    local function on_floor(x, y)
      local l = x - 2
      local r = x + 2
      return wa.land.solid(x, y + 1)
        or wa.land.solid(l, y + 1)
        or wa.land.solid(r, y + 1)
    end

    local function unstick(x, y)
      if not blocked(x, y) then
        return x, y
      end
      for up = 1, SLOPE do
        if not blocked(x, y - up) then
          return x, y - up
        end
      end
      return x, y
    end

    -- Glue to dirt within SLOPE pixels so gentle grades do not pop into air.
    local function snap_floor(x, y)
      if blocked(x, y) then
        return x, y, false
      end
      for d = 0, SLOPE do
        local ny = y + d
        if d > 0 and blocked(x, ny) then
          return x, ny - 1, true
        end
        if on_floor(x, ny) then
          return x, ny, true
        end
      end
      return x, y, false
    end

    -- PNG strips are 15fps. Ground clips step every other tick so Walk/Run/Land
    -- actually read. FrontFlip stays at 15fps (matches POOZ ~3 ticks/frame).
    local function set_clip(a, st, name)
      if st.anim ~= name then
        st.anim = name
        st.clock = 0
        a:look("sprites/" .. name)
        if name == "FrontFlip" then
          for _ = 1, 13 do
            a:advance()
          end
        end
        return
      end
      st.clock = st.clock + 1
      local slow = name == "Idle"
        or name == "Walk"
        or name == "Run"
        or name == "Sprint"
        or name == "Land"
      if slow and st.clock % 2 ~= 0 then
        return
      end
      a:advance()
    end

    local function restore(worm, a)
      live[worm.id] = nil
      if a then
        worm.x = a.x
        worm.y = a.y
      end
      worm.visible = true
      worm:drop()
    end

    local function brain(worm)
      local st = {
        anim = "Idle",
        clock = 0,
        jumps = 2,
        coyote = 0,
        jump_buf = 0,
        prev_jump = false,
        flipping = false,
        flip_clock = 0,
        land = 0,
        gait = 0,
        grounded = true,
      }
      return function(a)
        if worm.weapon ~= "pooz.runner" or a:in_water() then
          restore(worm, a)
          a:despawn()
          return
        end

        local k = wa.world.keys()
        if k.jump and not st.prev_jump then
          st.jump_buf = JUMP_BUF
        elseif st.jump_buf > 0 then
          st.jump_buf = st.jump_buf - 1
        end
        st.prev_jump = k.jump

        local left = k.left and not k.right
        local right = k.right and not k.left
        local vx = a.vx
        local vy = a.vy
        local x = a.x
        local y = a.y

        if st.grounded and vy >= 0 then
          st.coyote = COYOTE
          st.jumps = 2
          st.flipping = false
        elseif st.coyote > 0 then
          st.coyote = st.coyote - 1
        end

        if st.jump_buf > 0 and st.jumps > 0 then
          if st.jumps >= 2 then
            vy = JUMP
            st.grounded = false
            st.coyote = 0
            st.jump_buf = 0
            st.jumps = st.jumps - 1
            st.land = 0
            st.flipping = false
            set_clip(a, st, "JumpRise")
          elseif not st.grounded then
            vy = JUMP2
            st.grounded = false
            st.coyote = 0
            st.jump_buf = 0
            st.jumps = st.jumps - 1
            st.land = 0
            st.flipping = true
            st.flip_clock = 0
            set_clip(a, st, "FrontFlip")
          end
        end

        if left or right then
          local dir = right and 1 or -1
          a.facing = dir
          if st.grounded then
            local cap = k.shift and SPRINT or RUN
            if vx == 0 or sign(vx) == dir then
              if abs(vx) < cap then
                vx = approach(vx, dir * cap, ACCEL)
              else
                vx = friction(vx, 0.029998779296875)
              end
            else
              vx = friction(vx, SKID)
            end
          else
            local cap = RUN
            if abs(vx) > cap then
              cap = abs(vx)
            end
            local nxt = vx + dir * AIR
            if abs(nxt) <= cap or sign(nxt) ~= sign(vx) then
              vx = nxt
            end
          end
        elseif st.grounded then
          vx = friction(vx, FRICTION)
        end

        local was = st.grounded
        local fall = vy
        x, y = unstick(x, y)
        local glued = st.grounded or st.coyote > 0
        if glued and vy >= 0 then
          local ok
          x, y, ok = snap_floor(x, y)
          if ok then
            vy = 0
            st.grounded = true
          end
        end
        if st.grounded and vy >= 0 and on_floor(x, y) then
          vy = 0
        else
          vy = vy + GRAV
          if vy > MAX_FALL then
            vy = MAX_FALL
          end
        end

        st.grounded = false
        local dist = abs(vx)
        local steps = dist // 1
        if steps < 1 then
          steps = 1
        end
        local sx = vx / steps
        for _ = 1, steps do
          local nx = x + sx
          if not blocked(nx, y) then
            x = nx
          else
            local stepped = false
            for up = 1, SLOPE do
              if not blocked(nx, y - up) then
                x = nx
                y = y - up
                stepped = true
                break
              end
            end
            if not stepped then
              vx = 0
              break
            end
          end
        end

        if vy >= 0 and (was or st.coyote > 0) then
          local ok
          x, y, ok = snap_floor(x, y)
          if ok then
            vy = 0
            st.grounded = true
          end
        end

        if not st.grounded then
          dist = abs(vy)
          steps = dist // 1
          if steps < 1 then
            steps = 1
          end
          local sy = vy / steps
          for _ = 1, steps do
            local ny = y + sy
            if not blocked(x, ny) then
              y = ny
            elseif sy > 0 then
              vy = 0
              st.grounded = true
              break
            else
              vy = 0
              break
            end
          end
          if not st.grounded and vy >= 0 then
            local ok
            x, y, ok = snap_floor(x, y)
            if ok then
              vy = 0
              st.grounded = true
            else
              st.grounded = on_floor(x, y)
            end
          end
        end

        if st.grounded and not was and fall > LAND_VY then
          st.land = 16
        end
        if st.land > 0 then
          st.land = st.land - 1
        end

        a.x = x
        a.y = y
        a.vx = vx
        a.vy = vy
        worm:carry(x, y)

        local moving = abs(vx) > 0.350006103515625
        if not st.grounded then
          st.gait = 0
          if st.flipping or st.anim == "FrontFlip" then
            set_clip(a, st, "FrontFlip")
            st.flip_clock = st.flip_clock + 1
            if vy > 0 and st.flip_clock >= 24 then
              st.flipping = false
              set_clip(a, st, "JumpFall")
            end
          elseif vy < -0.8000030517578125 then
            set_clip(a, st, "JumpRise")
          elseif vy > 0.8000030517578125 then
            set_clip(a, st, "JumpFall")
          else
            set_clip(a, st, "JumpMid")
          end
        elseif st.land > 0 then
          st.gait = 0
          set_clip(a, st, "Land")
        elseif moving then
          local spd = abs(vx)
          if k.shift then
            st.gait = 32
            if spd > SPRINT - 0.350006103515625 then
              set_clip(a, st, "Sprint")
            else
              set_clip(a, st, "Run")
            end
          else
            st.gait = st.gait + 1
            if st.gait < 40 then
              set_clip(a, st, "Walk")
            else
              set_clip(a, st, "Run")
            end
          end
        else
          st.gait = 0
          set_clip(a, st, "Idle")
        end
      end
    end

    wa.weapons.replace({
      copy_from = "stock.shotgun",
      name = "POOZ",
      sprites = {
        "sprites/Idle",
        "sprites/Run",
        "sprites/Walk",
        "sprites/Sprint",
        "sprites/JumpRise",
        "sprites/JumpMid",
        "sprites/JumpFall",
        "sprites/FrontFlip",
        "sprites/Land",
      },
      on_select = function(sel)
        local worm = sel.worm
        if live[worm.id] then
          return
        end
        live[worm.id] = true
        worm.visible = false
        worm:carry(worm.x, worm.y)
        wa.actors.spawn({
          sprite = "sprites/Idle",
          origin = "bottom",
          x = worm.x,
          y = worm.y,
          vx = 0,
          vy = 0,
          gravity = false,
          collide = false,
          loop = false,
          owner = worm,
          on = brain(worm),
        })
      end,
    })
  end,
}
`
      }
    ],
  },
  {
    id: 'example.kill_the_king',
    name: 'Kill The King',
    version: '1.1.0',
    author: 'WormForge Porting Engine',
    category: 'gameplay',
    description: 'A complete game mode as a component pack: destroy the defenders\' king before the round timer expires.',
    tags: ['example', 'gameplay'],
    files: [
      {
        path: 'init.lua',
        name: 'init.lua',
        language: 'lua',
        content: `-- ============================================================================
-- WormForge WA 3.8.1 Port: KTK (Kill The King) Control Logic
-- Transpiled and hardened from Project X 3.6.31.0 CKtkControl
--
-- Security & Sandbox Compliance (sandbox.rs):
--  - INLINED CONFIG: No require("config") because require/dofile are nil in sandbox.
--  - STABLE FRAME GATE: Evaluates once per frame via worm.id <= lastWormId dispatch boundary.
--  - STRICT TEAM INDICES: 1-based team numbers (1: Red, 2: Blue, etc.) strictly compared.
--  - NO INSTANT LOSS: Safe solid pixel detection with fail-safe guard (disables if 0 pixels).
--  - SOUND CLAIMS: wa.sound.play safely called with worm handle (not numeric id) when claimed.
--  - WINNER TRACKING: Eliminates losing team via w:hurt(w.hp) in deterministic lockstep.
-- ============================================================================

-- IN-Game Replay breakst the mod, revives worms for some reason.

-- Inline configuration table (sandbox-compliant: do NOT use require/dofile)
return function()
  local CONFIG = {
    -- King Count: 1 or 2
    kingsCount = 1,

    -- Time for attack in milliseconds (300,000 ms = 5 minutes)
    timeForAttackMs = 300000,

    -- "AttackOnly" (decreases only on attacker turns)
    -- "DefendAndCompensate" (defenders turn adds +5ms per tick back to timer)
    timerType = "AttackOnly",

    -- Timer HUD caption
    timerCaption = "Remaining attack time:",

    -- Teams (1-based indices in WA: 1=Red, 2=Blue, 3=Green, 4=Yellow, 5=Purple, 6=Cyan)
    attackersTeam = 1, -- Red Team (Attackers)
    defendersTeam = 2, -- Blue Team (Defenders)

    -- Percentage of King solid pixels that must be destroyed to trigger King loss
    destructionPercentage = 75,

    -- Optimization: sample king bounding box every N frames (5 frames = 100ms)
    checkIntervalFrames = 5,

    -- King 1 Configuration (Pixel coordinates on the map)
    king1 = {
      name = "Blue King",
      x1 = 106,
      y1 = 829,
      width = 10,
      height = 10,
      destructionPercentage = 70,
    },

    -- King 2 Configuration (Used when kingsCount >= 2)
    king2 = {
      name = "Red King",
      x1 = 1420,
      y1 = 300,
      width = 10,
      height = 10,
      destructionPercentage = 70,
    },
  }

  local MS_PER_FRAME = 20 -- 50 fps lockstep (1000ms / 50 = 20ms per frame)

  -- State Variables (Pure functions of simulation frames)
  local initialized = false
  local matchOver = false
  local winningTeam = nil
  local winReason = ""

  local timerMs = CONFIG.timeForAttackMs or 300000
  local timerType = CONFIG.timerType or "AttackOnly"
  local attackersTeam = CONFIG.attackersTeam or 1
  local defendersTeam = CONFIG.defendersTeam or 2

  local kings = {}
  local kingsCount = CONFIG.kingsCount or 1

  -- Dispatch ordering tracking for once-per-frame gate
  local lastWormId = 999999
  local frameCheckCounter = 0

  -- ----------------------------------------------------------------------------
  -- Helper: Initialize King solid pixel area on round start
  -- ----------------------------------------------------------------------------
  local function init_king(cfg, id)
    if not cfg then return nil end

    local totalSolid = 0
    local x1 = cfg.x1
    local y1 = cfg.y1
    local x2 = cfg.x1 + cfg.width
    local y2 = cfg.y1 + cfg.height

    -- Scan rectangle for initial solid terrain pixels
    for x = x1, x2 do
      for y = y1, y2 do
        if wa.land.solid(x, y) then
          totalSolid = totalSolid + 1
        end
      end
    end

    -- Safe Guard against empty bounding boxes (e.g. map mismatch or bad coordinates):
    -- In PX, DrawKing painted terrain. If WormForge runs on an arbitrary map with 0 solid pixels,
    -- DO NOT fallback to width*height (which would cause an instant loss on first sample).
    -- Instead, log warning and disable win check for this king.
    local active = true
    if totalSolid == 0 then
      wa.log(string.format("[KTK WARNING] King %d box (%d,%d) has 0 solid pixels! Win check disabled to prevent instant loss.", id, x1, y1))
      active = false
    end

    local thresholdPercent = cfg.destructionPercentage or CONFIG.destructionPercentage or 75
    local destructionThreshold = math.floor(totalSolid * (1.0 - (thresholdPercent / 100.0)))

    return {
      id = id,
      name = cfg.name or ("King " .. id),
      active = active,
      x1 = x1,
      y1 = y1,
      x2 = x2,
      y2 = y2,
      width = cfg.width,
      height = cfg.height,
      totalArea = totalSolid,
      currentArea = totalSolid,
      threshold = destructionThreshold,
      percentThreshold = thresholdPercent,
      destroyed = false,
      currentPercentDestroyed = 0,
    }
  end

  -- ----------------------------------------------------------------------------
  -- Helper: Check remaining solid terrain pixels for an active King
  -- ----------------------------------------------------------------------------
  local function check_king_damage(king)
    if not king or not king.active or king.destroyed then
      return false
    end

    local count = 0
    for x = king.x1, king.x2 do
      for y = king.y1, king.y2 do
        if wa.land.solid(x, y) then
          count = count + 1
        end
      end
    end

    king.currentArea = count
    if king.totalArea > 0 then
      king.currentPercentDestroyed = math.floor(((king.totalArea - count) * 100) / king.totalArea)
    end

    if king.currentArea <= king.threshold then
      king.destroyed = true
      return true
    end

    return false
  end

  -- ----------------------------------------------------------------------------
  -- WIN CONDITION: For-loop setting opposing team worms HP to 0
  -- Red Team victory enforcement across all clients in deterministic lockstep
  -- ----------------------------------------------------------------------------
  local function eliminate_team(losingTeamIndex, winnerIndex, reason)
    if matchOver then return end
    matchOver = true
    winningTeam = winnerIndex
    winReason = reason

    wa.log(string.format("[KTK] Win Condition Triggered: %s. Eliminating Team %d (Team %d Wins)", reason, losingTeamIndex, winnerIndex))

    -- Iterate through all worms; set the losing team's HP to 0
    -- In WormForge, w:hurt(w.hp) issues standard MSG_HIT (0x4B), immediately
    -- eliminating the worm through WA's deterministic damage pipeline.
    local worms = wa.worms.all()
    for _, w in ipairs(worms) do
      if w.team == losingTeamIndex and w.hp > 0 then
        w:hurt(w.hp)
      end
    end
  end

  -- ----------------------------------------------------------------------------
  -- Format milliseconds to MM:SS
  -- ----------------------------------------------------------------------------
  local function format_time(ms)
    if ms < 0 then ms = 0 end
    local totalSeconds = math.floor(ms / 1000)
    local minutes = math.floor(totalSeconds / 60)
    local seconds = totalSeconds % 60
    return string.format("%02d:%02d", minutes, seconds)
  end

  -- ----------------------------------------------------------------------------
  -- Main Lockstep Simulation Hook (FRAME_FINISH)
  -- ----------------------------------------------------------------------------
  wa.on.worm_message(function(worm, msg)
    if msg ~= wa.msg.FRAME_FINISH then
      return
    end

    -- One-time match initialization
    if not initialized then
      initialized = true
      kings[1] = init_king(CONFIG.king1, 1)
      if kingsCount >= 2 and CONFIG.king2 then
        kings[2] = init_king(CONFIG.king2, 2)
      end
    end

    if matchOver then
      return
    end

    -- ONCE-PER-FRAME GATE:
    -- worm_message fires for EVERY worm each frame.
    -- Worm dispatch order is deterministic and monotonic. When current worm.id <= lastWormId,
    -- we have crossed into a new simulation frame.
    local isNewFrame = (worm.id <= lastWormId)
    lastWormId = worm.id

    -- Timer update only runs if this worm is the currently active turn worm
    if worm.turn then
      local curTeam = worm.team -- strictly 1-based team index

      if curTeam == attackersTeam then
        timerMs = timerMs - MS_PER_FRAME

        if timerMs <= 0 then
          timerMs = 0
          -- Attackers ran out of time -> Defenders (Red) Win!
          eliminate_team(attackersTeam, defendersTeam, "Attack Timer Expired")
          return
        end
      elseif timerType == "DefendAndCompensate" and curTeam == defendersTeam then
        timerMs = timerMs + 5
      end
    end

    -- Frame-boundary logic: King damage check
    if isNewFrame then
      frameCheckCounter = frameCheckCounter + 1
      if frameCheckCounter >= CONFIG.checkIntervalFrames then
        frameCheckCounter = 0

        for i = 1, kingsCount do
          local king = kings[i]
          if check_king_damage(king) then
            -- King destroyed -> Defenders lose, Attackers (Red) Win!
            eliminate_team(defendersTeam, attackersTeam, string.format("%s Destroyed", king.name))
            return
          end
        end
      end
    end
  end)

  -- ----------------------------------------------------------------------------
  -- Presentation HUD Overlay (wa.on.hud)
  -- ----------------------------------------------------------------------------
  wa.on.hud(function()
    if not initialized then return end

    -- Draw Attack Timer
    local timerStr = string.format("%s %s", CONFIG.timerCaption or "Remaining attack time:", format_time(timerMs))
    wa.hud.line(timerStr, 14, 40)

    -- Draw King HP status
    for i = 1, kingsCount do
      local king = kings[i]
      if king then
        local statusStr
        if not king.active then
          statusStr = string.format("%s: [No solid terrain pixels found - Disabled]", king.name)
        elseif king.destroyed then
          statusStr = string.format("%s: DESTROYED (0%%)", king.name)
        else
          local healthPercent = math.max(0, 100 - king.currentPercentDestroyed)
          statusStr = string.format("%s HP: %d%%", king.name, healthPercent)
        end
        wa.hud.line(statusStr, 14, 80 + (i - 1) * 16)
      end
    end

    if matchOver and winningTeam then
      local teamName = (winningTeam == 1) and "RED TEAM" or ("TEAM " .. winningTeam)
      wa.hud.line(string.format("=== %s WINS! (%s) ===", teamName, winReason), 14, 120)
    end
  end)
end
`
      }
    ],
  },
];
