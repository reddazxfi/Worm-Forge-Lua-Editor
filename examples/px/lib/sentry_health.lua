-- Small 5x7 digits on a transparent sheet. Rendering only: no actors, health
-- writes or shared RNG. Both sentry types share one GPU sheet for the match.
local M = { SHEET = "sprites/sentry_ui/digits.png" }
local installed = false
local WIDTH, HEIGHT, ADVANCE = 5, 7, 6

function M.install()
  if installed then return end
  installed = true
  wa.assets.load({ sprites = { M.SHEET }, gpu_prefix = "sprites/sentry_ui/" })
end

local function colour(health, maximum)
  local ratio = math.max(0, math.min(1, health / maximum))
  local low, high, t
  if ratio <= 0.5 then
    low, high, t = { 240, 80, 64 }, { 240, 216, 80 }, ratio * 2
  else
    low, high, t = { 240, 216, 80 }, { 80, 240, 96 }, (ratio - 0.5) * 2
  end
  local r = math.floor(low[1] + (high[1] - low[1]) * t)
  local g = math.floor(low[2] + (high[2] - low[2]) * t)
  local b = math.floor(low[3] + (high[3] - low[3]) * t)
  return 0xB0000000 | (r << 16) | (g << 8) | b
end

local function digit(frame, x, y, tint, depth)
  wa.draw.quad({ sprite = M.SHEET, frame = frame, color = tint, depth = depth, blend = "alpha",
    points = { {x, y}, {x + WIDTH, y}, {x + WIDTH, y + HEIGHT}, {x, y + HEIGHT} } })
end

-- `bottom` includes the one-pixel soft shadow; the caller chooses a fixed
-- height relative to the body. Snap the tiny glyphs to whole world pixels
-- so subpixel placement does not soften their strokes.
function M.draw(health, maximum, x, bottom, depth)
  local text = tostring(math.max(0, math.ceil(health)))
  local left = math.floor(x - (#text * ADVANCE - 1) / 2 + 0.5)
  local top = math.floor(bottom - HEIGHT - 1)
  local tint = colour(health, maximum)
  for i = 1, #text do
    local frame, dx = tonumber(text:sub(i, i)), left + (i - 1) * ADVANCE
    digit(frame, dx + 1, top + 1, 0x60000000, depth)
    digit(frame, dx, top, tint, depth)
  end
end

return M
