-- Panel highlight: a green square round each weapon on the panel that doesn't
-- end the turn, and a key above the panel, both fading in as it opens.

local GREEN = 0x40E040
local FADE = 0.25 -- seconds
local LINE = 2 -- outline thickness, pixels
local KEY = 12 -- the key's square, pixels
local KEY_TEXT = " = sdet"

local continues = {} -- [weapon id] = true when using it doesn't end the turn

local function keeps_turn(id)
  local known = continues[id]
  if known == nil then
    local ok, data = pcall(wa.weapons.data, id)
    if not (ok and data and data.handling) then return false end
    local ends = data.handling.ends_turn
    known = ends == false or ends == 0
    continues[id] = known
  end
  return known
end

local function outline(x, y, size, color)
  wa.hud.rect{ x = x, y = y, w = size, h = LINE, color = color }
  wa.hud.rect{ x = x, y = y + size - LINE, w = size, h = LINE, color = color }
  wa.hud.rect{ x = x, y = y + LINE, w = LINE, h = size - 2 * LINE, color = color }
  wa.hud.rect{ x = x + size - LINE, y = y + LINE, w = LINE, h = size - 2 * LINE, color = color }
end

return function()
  if not wa.panel.stock then
    wa.log("panel highlight: this WormForge has no wa.panel.stock; off")
    return
  end
  wa.on.hud(function()
    local panel = wa.panel.stock()
    if not panel then return end
    local alpha = math.min(1, panel.opened / FADE)
    local color = math.floor(alpha * 255) * 0x1000000 + GREEN
    local left
    for _, cell in ipairs(panel.cells) do
      if not left or cell.x < left then left = cell.x end
      if keeps_turn(cell.weapon) then
        outline(cell.x - LINE, cell.y - LINE, cell.size + 2 * LINE, color)
      end
    end
    if not left then return end
    local top = panel.y - KEY - 6
    outline(left - LINE, top, KEY, color)
    wa.hud.text{ text = KEY_TEXT, x = left - LINE + KEY + 2, y = top, alpha = alpha }
  end)
end
