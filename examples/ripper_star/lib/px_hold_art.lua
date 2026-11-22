-- Draw a held weapon during WA's repeated-fire frames (firing, fired).

local M = {}

local FIRING = { firing = true, fired = true }

-- the engine's front band for held art
local DEPTH = 0x10000

local HAND_CELL = 60 -- pixels, the engine's hand cells

local draws = {}
local hooked = false

local QUAD = { depth = DEPTH, points = { {}, {}, {}, {} } }

local FLASH_FRAMES = 2 -- game frames a firing sheet shows after a shot
local shot_at = {} -- worm id -> frame of its last shot
local drawn_at = {} -- worm id -> frame its firing art was last drawn on

local function firing_now(art, w, now)
  -- `shots` comes from the weapon: a require here could be another instance.
  local f = shot_at[w.id]
  local g = art.shots and art.shots[w.id]
  if g and (not f or g > f) then f = g end
  if not f then return false end
  local seen = drawn_at[w.id]
  return now - f < FLASH_FRAMES or seen == nil or seen < f -- a skipped draw still flashes
end

-- Mark a shot for a weapon that fires without fire_seq.
function M.shot(w)
  if w and w.id then shot_at[w.id] = wa.world.frame() end
end

-- Radians, clockwise, y down.
local function corner(t, cx, cy, cos, sin, lx, ly)
  t.x = cx + lx * cos - ly * sin
  t.y = cy + lx * sin + ly * cos
end

local function quad(sheet, cx, cy, angle, half, facing, frame)
  local cos, sin = wa.math.cos(angle), wa.math.sin(angle)
  local pts = QUAD.points
  if facing < 0 then
    corner(pts[1], cx, cy, cos, sin, half, -half) -- texture top-left on the right
    corner(pts[2], cx, cy, cos, sin, -half, -half)
    corner(pts[3], cx, cy, cos, sin, -half, half)
    corner(pts[4], cx, cy, cos, sin, half, half)
  else
    corner(pts[1], cx, cy, cos, sin, -half, -half)
    corner(pts[2], cx, cy, cos, sin, half, -half)
    corner(pts[3], cx, cy, cos, sin, half, half)
    corner(pts[4], cx, cy, cos, sin, -half, half)
  end
  QUAD.sprite = sheet
  QUAD.frame = frame or 0
  wa.draw.quad(QUAD)
end

-- The engine's hold phase, anim_speed * 0.03 per frame, on the world clock.
local function gun_frame(art)
  local frames = art.frames or 1
  if frames <= 1 then return 0 end
  local now = wa.world.frame() or 0
  local phase = now * (art.anim_speed or 1) * 0.03
  return math.floor((phase % 1) * frames) % frames
end

local function enqueue(art, w)
  local pi = math.pi
  local facing = w.facing < 0 and -1 or 1
  local aim = w.aim

  local rot = (1.0 - aim) * pi
  local rot_w = rot + pi * art.weap_radial_rotation
  local cx = w.x + facing * wa.math.sin(rot_w) * art.weap_radius
  local cy = w.y - wa.math.cos(rot_w) * art.weap_radius
  local angle = (pi - pi * aim - pi * (1.0 - art.weap_rotation)) * facing
  quad(art.sheet, cx, cy, angle, art.size * 0.5, facing, gun_frame(art))

  -- The hand goes on after the gun so it covers the grip.
  if art.hand and art.draw_hand ~= false then
    local hand_radius = art.hand_radius or 0
    if hand_radius ~= 0 then
      local rot_h = rot - pi * (art.hand_radial_rotation or 1)
      local hx = w.x + facing * wa.math.sin(rot_h) * hand_radius
      local hy = w.y - wa.math.cos(rot_h) * hand_radius
      local hand_angle = (rot + pi * (art.hand_rotation or 1)) * facing
      local size = (art.hand_size or HAND_CELL) * (art.hand_scale or 1)
      quad(art.hand, hx, hy, hand_angle, size * 0.5, facing, 0)
    end
  end
end

local function hook()
  hooked = true
  wa.on.draw(function()
    local now = wa.world.frame() or 0
    local worms = wa.worms.all()
    for j = 1, #worms do
      local w = worms[j]
      local st = w.state
      if st and FIRING[st] and w.hp and w.hp > 0 and w.visible and w.body_visible then
        local weapon = w.weapon
        if weapon ~= nil then
          -- A `flash` entry is PX's OnFiringAnim(isFiring) sheet.
          for i = 1, #draws do
            local art = draws[i]
            if art.weapon == weapon and (not art.flash or firing_now(art, w, now)) then
              enqueue(art, w)
            end
          end
          drawn_at[w.id] = now
        end
      end
    end
  end)
end

-- `art` is the weapon's `spec.hold` table; README.md lists the extra keys.
function M.add(art)
  if type(art) ~= "table" or not art.sheet or not art.weapon then
    wa.log("px_hold_art: a hold needs a sheet and a weapon id")
    return
  end
  if not (wa.on and wa.on.draw and wa.draw and wa.draw.quad) then
    wa.log("px_hold_art: this build has no wa.on.draw/wa.draw.quad")
    return
  end
  art.size = art.size or 90.0
  art.weap_radius = art.weap_radius or 0.0
  art.weap_rotation = art.weap_rotation or 1.0
  art.weap_radial_rotation = art.weap_radial_rotation or 1.0
  draws[#draws + 1] = art
  if not hooked then hook() end
end

return M
