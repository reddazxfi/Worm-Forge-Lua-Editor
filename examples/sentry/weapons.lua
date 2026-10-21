-- Sentry gun in the donkey slot, with stock mine placement on Space.
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
    -- `want` on the step that closes the gap). A fixed-period timer instead
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
  -- StartRotatingSound()/StopRotatingSound() gate is `speed >= 2*RotationSpeed`,
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
      -- defaults to `below` the actor, which for a bottom-anchored sprite
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
  -- (Display `layer` is palette-bound and is NOT the way to do this: installing
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
-- `pairs(state)` is fine here because the body is order-independent: every
-- entry gets the same reset, none reads another. If this ever grows an early
-- `return` or a read of `state` inside the loop, switch to
-- `ipairs(wa.sorted(state))` -- string-keyed `pairs()` order differs per
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
