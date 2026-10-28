-- Draw a held weapon during WA's repeated-fire frames (0x6A/0x6B). The engine
-- draws the aiming and put-away frames; from the second shot of a held burst
-- `h.firing` is false, so this fills those two frames at full size.
-- Presentation only: reads worm state and enqueues a quad.

local M = {}

-- Raw WA states; `worm.state` is nil for some of them.
local FIRING = {
  [0x6A] = true, -- firing
  [0x6B] = true, -- fired
}

-- `worm_hold::DEPTH`: the engine's one front band (`worm_hold.rs:18`).
local DEPTH = 0x10000

local draws = {}
local hooked = false

-- One quad spec, refilled per draw: no table in the render callback.
local QUAD = { depth = DEPTH, points = { {}, {}, {}, {} } }

-- `render::Sprite::emit`'s rotation: angle in radians, clockwise, y down.
local function corner(t, cx, cy, cos, sin, lx, ly)
  t.x = cx + lx * cos - ly * sin
  t.y = cy + lx * sin + ly * cos
end

-- Read aim and facing live: the player can adjust them mid-burst.
local function enqueue(art, w)
  local pi = math.pi
  local facing = w.facing < 0 and -1 or 1
  local aim = w.aim

  local rot = (1.0 - aim) * pi
  local rot_w = rot + pi * art.weap_radial_rotation
  local cx = w.x + facing * wa.math.sin(rot_w) * art.weap_radius
  local cy = w.y - wa.math.cos(rot_w) * art.weap_radius
  local angle = (pi - pi * aim - pi * (1.0 - art.weap_rotation)) * facing
  local cos, sin = wa.math.cos(angle), wa.math.sin(angle)

  local half = art.size * 0.5
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
  QUAD.sprite = art.sheet
  wa.draw.quad(QUAD)
end

local function hook()
  hooked = true
  wa.on.draw(function()
    for i = 1, #draws do
      local art = draws[i]
      for _, w in ipairs(wa.worms.all()) do
        -- `draw_holds` skips dead, hidden and body-hidden worms
        -- (`worm_hold.rs:309-315`); `visible`/`body_visible` are the same two
        -- hide flags (`crates/lua-host/src/actor.rs:1523-1541`).
        local st = w.state_id
        if w.hp and w.hp > 0 and w.visible and w.body_visible
            and w.weapon == art.weapon and st and FIRING[st] then
          enqueue(art, w)
        end
      end
    end
  end)
end

-- `art` is the same table the weapon also passes as `spec.hold`: `weapon` (the
-- id WA's `worm.weapon` reports), `sheet`, `size` (the cell, 90 for PX's gun
-- cells), and the engine's `weap_radius`/`weap_rotation`/`weap_radial_rotation`.
-- The engine ignores the two presentation-only keys (`weapon`, `size`).
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
