-- Project X's homing for scripted missiles (reddaz's HomeAfter): after a delay, every other frame the missile turns part way to a point.

local homing = {}

-- o = { x, y, speed, turn, delay, frames, sound, owner }: frames counts from now, the delay included.
function homing.new(o)
  return { tx = o.x, ty = o.y, speed = o.speed, turn = o.turn, wait = o.delay or 0,
    left = o.frames, sound = o.sound, owner = o.owner }
end

-- After WA moves the missile: the sound 3 frames before it homes, then a pull
-- towards the point at its homing speed every other frame.
function homing.step(m, h)
  if h.wait == 3 and h.sound and h.owner then wa.sound.play(h.owner, h.sound) end
  if not h.tx or h.left <= 0 then return end
  h.left = h.left - 1
  if h.wait > 0 then h.wait = h.wait - 1; return end
  h.wait = 1
  local dx, dy = h.tx - m.x, h.ty - m.y
  local dist = math.sqrt(dx * dx + dy * dy)
  if dist > 0 then dx, dy = dx / dist, dy / dist end
  m.vx = m.vx + (dx * h.speed - m.vx) * h.turn
  m.vy = m.vy + (dy * h.speed - m.vy) * h.turn
end

-- Before WA moves it: under 50 pixels from the point and slower than its homing
-- speed (by PX's |vx + vy|), it flies on at that speed. True when it did.
function homing.near(m, h)
  if not h.tx then return false end
  local dx, dy = h.tx - m.x, h.ty - m.y
  if dx * dx + dy * dy >= 50 * 50 or math.abs(m.vx + m.vy) >= h.speed then return false end
  local sp = math.sqrt(m.vx * m.vx + m.vy * m.vy)
  if sp > 0.001 then m.vx, m.vy = m.vx / sp * h.speed, m.vy / sp * h.speed end
  return true
end

return homing
