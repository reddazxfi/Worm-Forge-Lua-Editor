-- Where a teleporting shot puts the turn worm: on the spot where it went off, or
-- the first spot that fits in the 11 by 11 square from 4 pixels up and left of it.

local landing = {}

function landing.turn_worm()
  for _, w in ipairs(wa.worms.all()) do
    if w.turn and w.hp > 0 then return w end
  end
end

-- Moves the worm to (x, y) or the nearest spot PX's search finds; false when none fits.
function landing.warp(worm, x, y)
  if worm:fits(x, y) then worm:warp({ x = x, y = y }); return true end
  x, y = math.floor(x), math.floor(y)
  for row = 0, 10 do
    for column = 0, 10 do
      local px, py = x - 4 + column, y - 4 + row
      if worm:fits(px, py) then worm:warp({ x = px, y = py }); return true end
    end
  end
  return false
end

return landing
