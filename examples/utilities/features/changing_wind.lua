-- Changing wind, from Project X: during turns the wind moves to a new random strength every 10 to 20 seconds.

local GAP_MIN, GAP_MAX = 500, 1000 -- frames between changes
local EASE = 150 -- frames to reach the new wind
local STRENGTH = 0.3 -- the strongest new wind

local count, change_at, target = 0, nil, 0
local last_frame

wa.on.worm_message(function(worm)
  if not worm.turn then return end
  local frame = wa.world.frame()
  if frame == last_frame then return end
  last_frame = frame
  if count == 1 then change_at = wa.random(GAP_MIN, GAP_MAX) end
  if count == change_at then target = wa.random(-1000, 1000) / 1000 * STRENGTH end
  if change_at and count > change_at and count < change_at + EASE then
    local wind = wa.world.wind()
    wa.world.set_wind(wind - (wind - target) / (change_at + EASE - count))
  end
  if change_at and count >= change_at + EASE then count = 0 end
  count = count + 1
end, { msgs = { wa.msg.FRAME_FINISH } })
