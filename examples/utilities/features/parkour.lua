-- Parkour, from Project X's script_parkour_no_slide (parkour.txt): the turn's
-- worm wall-jumps on Enter and bunny-hops on Backspace, both in the air.
--
-- Wall jump (Enter): jumping, sliding or tumbling with land within 20 pixels
-- to the right or left, the worm kicks off the nearer wall: up by 2 plus its
-- sideways speed, away by 3 plus that, facing away. Not again for 15 frames,
-- nor for 10 after a parachute.
-- Bunny hop (Backspace): jumping, sliding, tumbling, hit or blasted with land
-- within 30 pixels below, it hops: up by 3, and 2 more the way it faces. Not
-- for 25 frames after a jump is prepared.
--
-- Either leaves the worm in WA's jumping state, as PX's SetState(WS_JUMP):
-- WA's take-off (worm:jump) with PX's speed written over its own.

local WALL_JUMP = 2 -- PX's WallJumpMultiplier
local BHOP = 3 -- PX's BhopMultiplier
local WALL_REACH, FLOOR_REACH = 20, 30

local WALL_STATES = { jumping = true, sliding = true, tumbling = true }
local BHOP_STATES = { jumping = true, sliding = true, tumbling = true, hit = true, blasted = true }

local wall_delay, bhop_delay = {}, {} -- worm id -> frames left

local function jumping(worm, vx, vy)
  if worm.state ~= "jumping" then
    worm:jump()
  end
  worm.vx, worm.vy = vx, vy
end

-- How far the land is, tracing from the worm towards (dx, dy); nil for none.
local function land(worm, dx, dy)
  local hit = wa.land.trace(worm.x, worm.y, worm.x + dx, worm.y + dy)
  if hit and hit.hit then
    return math.abs(hit.x - worm.x) + math.abs(hit.y - worm.y)
  end
end

local function wall_jump(worm)
  if not WALL_STATES[worm.state] then return end
  local right, left = land(worm, WALL_REACH, 0), land(worm, -WALL_REACH, 0)
  if not right and not left then return end
  -- Away from the nearer wall; from the right one when both are as near.
  local side
  if right and left then
    side = right < left and -1 or 1
  else
    side = right and -1 or 1
  end
  local speed = math.abs(worm.vx)
  local vy = math.min(worm.vy, 0) - WALL_JUMP - speed
  local vx = (WALL_JUMP + 1 + speed) * side
  worm.facing = side
  jumping(worm, vx, vy)
end

local function bunny_hop(worm)
  if not BHOP_STATES[worm.state] then return end
  if not land(worm, 0, FLOOR_REACH) then return end
  local vy = math.min(worm.vy, 0) - BHOP
  local vx = worm.vx + (BHOP - 1) * worm.facing
  jumping(worm, vx, vy)
end

wa.on.worm_message(function(worm, msg)
  if not worm.turn then return end
  local id = worm.id
  if msg == wa.msg.FRAME_FINISH then
    if (wall_delay[id] or 0) >= 1 then wall_delay[id] = wall_delay[id] - 1 end
    if (bhop_delay[id] or 0) >= 1 then bhop_delay[id] = bhop_delay[id] - 1 end
    local state = worm.state
    if state == "jump_prepare" then bhop_delay[id] = 25 end
    if state == "parachuting" then wall_delay[id] = 10 end
  elseif msg == wa.msg.JUMP then -- Enter
    if (wall_delay[id] or 0) < 1 then
      wall_jump(worm)
      wall_delay[id] = 15
    end
  elseif msg == wa.msg.JUMP_UP then -- Backspace
    if (bhop_delay[id] or 0) == 0 then bunny_hop(worm) end
  end
end, { msgs = { wa.msg.FRAME_FINISH, wa.msg.JUMP, wa.msg.JUMP_UP } })
