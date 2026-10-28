-- PX's sprite builder: draw a missile from a follower actor, and share PX's
-- worm aim/pick posture and hands. Each bundle carries its own copy; `wa` is
-- touched only inside `sb.flight`.

local M = {}

-- ---------------------------------------------------------------------------
-- PX animation types (red_sprite_builder.txt:17-24).
-- ---------------------------------------------------------------------------
local ANIM_TYPE = {
  track = 2,
  rotation = 3,
  slow = 1,
  medium = 1,
  fast = 1,
  none = 5,
}
local ANIM_SPEED = { slow = 0.5, medium = 0.8, fast = 1.35 }

-- The worm whose turn it is -- PX's GetCurrentWorm().
local function current_worm()
  for _, w in ipairs(wa.worms.all()) do
    if w.turn then return w end
  end
end

local function sign(n) return n > 0 and 1 or (n < 0 and -1 or 0) end

-- ---------------------------------------------------------------------------
-- Cyclical animation frame (PX SetCustomAnim, red_sprite_builder.txt:51-57,
-- :83-85): phase += anim_speed * 30 / 1000 per frame, wraps at 0.99.
-- Returns frame index in [0, num_frames) and the updated phase.
-- ---------------------------------------------------------------------------
function M.cyclical_frame(phase, anim_speed, num_frames)
  if not phase then phase = 0.0 end
  local spd = (anim_speed or 1.0) * 30 / 1000
  phase = phase + spd
  if phase > 0.99 then phase = 0.0 end
  local frame = math.floor(phase * num_frames) % num_frames
  return frame, phase
end

-- Angle a round should point along its flight (PX :73, track type).
function M.track_angle(vx, vy)
  return -wa.math.atan(vx, vy) - math.pi
end

-- Speed-based rotation turn (PX :77, rotation type).
function M.rotation_turn(prev_rot, vx, vy, spin)
  return (prev_rot or 0) + (spin or 1.0) * 0.5 * (vx * 0.15 + math.abs(vy) * 0.01 * sign(vx))
end

-- Steady spin turn (PX :75, slow/medium/fast types).
function M.spin_turn(prev_rot, vx, anim_speed)
  return (prev_rot or 0) + (anim_speed or 0.5) * 0.5 * sign(vx)
end

-- ---------------------------------------------------------------------------
-- Missile flight drawing.
-- ---------------------------------------------------------------------------
function M.flight(ctx, opts)
  if not opts or not opts.weapon or not opts.sheet then
    wa.log("px_sprite_builder.flight: weapon and sheet are required")
    return
  end

  local anim_type = ANIM_TYPE[opts.anim or "none"]
  local spin = opts.spin or 1.0
  local cyclical = opts.cyclical or 0
  local anim_speed = opts.anim_speed or 1.0
  local z = opts.z or 5.0
  local scale = opts.scale or 1.0
  local mirror = opts.mirror ~= false
  local owner = opts.owner
  local frame_fn = opts.frame_fn
  local turn_fn = opts.turn_fn

  local follow = {}
  local spin_ang = {}
  local cycl_phase = {}

  local function gone(id)
    return function(b)
      local f = follow[id]
      if f and f.seen then f.seen = false return end
      follow[id] = nil
      spin_ang[id] = nil
      cycl_phase[id] = nil
      b:despawn()
    end
  end

  wa.on.missile_frame(function(m)
    if m.weapon ~= opts.weapon then return end
    if m.phase == "pre" then
      m.sprite = 0 -- hide WA's sprite; ours is drawn below
      return
    end
    local f = follow[m.id]
    if not f then
      f = { actor = wa.actors.spawn({
        sprite = opts.sheet, x = m.x, y = m.y,
        gravity = false, collide = false,
        owner = owner or current_worm(), on = gone(m.id),
      }) }
      follow[m.id] = f
    end
    f.seen = true
    local b = f.actor
    b.x, b.y, b.vx, b.vy = m.x, m.y, 0, 0

    local rot = 0
    if turn_fn then
      rot = turn_fn(m, spin_ang[m.id])
      spin_ang[m.id] = rot
    elseif anim_type == 2 then
      rot = M.track_angle(m.vx, m.vy)
    elseif anim_type == 3 then
      rot = M.rotation_turn(spin_ang[m.id], m.vx, m.vy, spin)
      spin_ang[m.id] = rot
    elseif anim_type == 1 then
      local spd = ANIM_SPEED[opts.anim] or 0.5
      rot = M.spin_turn(spin_ang[m.id], m.vx, spd)
      spin_ang[m.id] = rot
    end

    local frame = 0
    if frame_fn then
      frame = frame_fn(m)
    elseif cyclical and cyclical > 0 then
      frame, cycl_phase[m.id] = M.cyclical_frame(cycl_phase[m.id], anim_speed, cyclical)
    else
      cycl_phase[m.id] = nil
    end

    b.facing = mirror and (m.vx < 0 and -1 or 1) or 1
    b:frame(frame)
    b:gfx({ angle = math.deg(rot) % 360, depth = z, scale = scale })
  end)
end

-- ---------------------------------------------------------------------------
-- Shared worm posture and hands: one weapon PNG and two lines per weapon.
-- The engine draws the weapon-less worm (`worm_sprites`) and the hold; these
-- tables are PX's `CWormAnimParams` and hand art. See README.md.
-- ---------------------------------------------------------------------------
M.PX_POSTURE = {
  weaponlnk = "sprites/px_hold/aim", weaponlnku = "sprites/px_hold/aimu",
  weaponlnkd = "sprites/px_hold/aimd",
  wthrow = "sprites/px_hold/draw", wthrowu = "sprites/px_hold/drawu",
  wthrowd = "sprites/px_hold/drawd",
}

-- PX's three hands: 1 lower, 2 middle, 3 upper.
M.PX_HANDS = {
  "sprites/px_hold/hand_rad_lower", "sprites/px_hold/hand_rad",
  "sprites/px_hold/hand_rad_upper",
}

return M
