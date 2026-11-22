-- ExTurnSide, by reddaz: left and right turn the worm during jumps and flights.

local prev_left = false
local prev_right = false

-- While the cursor is up for a girder or a strike, left and right aim it.
local AIMS_THE_CLICK = { girder = true, strike = true }

wa.on.worm_message(function(worm)
  if not worm.turn then return end
  if worm.state == "roping" then return end
  if worm.state == "kamikaze" then return end

  local k = wa.world.keys()

  if k.shift then return end

  local left = k.left and not prev_left
  local right = k.right and not prev_right
  prev_left = k.left
  prev_right = k.right
  if not (left or right) or AIMS_THE_CLICK[worm.click] then return end

  if left then
    worm.facing = -1
  end

  if right then
    worm.facing = 1
  end
end, { msgs = { wa.msg.FRAME_FINISH } })
