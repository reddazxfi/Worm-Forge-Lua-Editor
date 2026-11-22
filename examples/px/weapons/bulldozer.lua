-- Bulldozer: a walking digger that tunnels and shoves what it touches.

local on_missile = require("lib/on_missile")
local holds = require("wf-lib/holds")
local weapon = {}

weapon.definition = {
  wep = "weps/bulldozer.wep",
  name = "Bulldozer",
  panel_icon = "sprites/bulldozer/bdico.png",
  sprite = "sprites/bulldozer/bd.png",
  worm_sprites = {
    wthrow = holds.PX_POSTURE.wthrow, wthrowu = holds.PX_POSTURE.wthrowu,
    wthrowd = holds.PX_POSTURE.wthrowd,
    weaponlnk = holds.PX_LEVEL.weaponlnk, weaponlnku = holds.PX_LEVEL.weaponlnku,
    weaponlnkd = holds.PX_LEVEL.weaponlnkd,
  },
  hold = {
    sheet = "sprites/bulldozer/bd.png", frames = 20,
    hand = holds.PX_HANDS[1], hand_type = 1, hand_scale = 0.8,
    hand_radius = 28, hand_rotation = -1, hand_radial_rotation = 1.1,
    weap_radius = 16, weap_rotation = 0.3, weap_radial_rotation = 1.1,
    static = { weap = -0.2, hand = -0.5 },
  },
}

local HALF = 10
local RADIUS = { worm = 6, mine = 5, crate = 9, oil = 9 }
local FORCE = 0.6 * math.sqrt(15)

local function push_of(m, obj, r)
  local dx, dy = obj.x - m.x, obj.y - m.y
  local rx, ry = math.max(0, math.abs(dx) - HALF), math.max(0, math.abs(dy) - HALF)
  local d = math.sqrt(dx * dx + dy * dy)
  if rx * rx + ry * ry > r * r or d == 0 then return nil end
  return FORCE * dx / d, FORCE * dy / d
end

function weapon.setup()
  local current_worm = require("lib/shared").current_worm
  local newest = 0
  on_missile(function(m)
    if m.weapon ~= "px.bulldozer" or m.phase ~= "pre" then return end
    if m.id > newest then newest = m.id end
    if m.id == newest then
      wa.land.cut({ x = m.x, y = m.y - 8.7, shape = "circle", radius = HALF })
    end
    local turn = current_worm()
    for _, w in ipairs(wa.worms.all()) do
      if w.hp > 0 and not (turn and w.id == turn.id) then
        local vx, vy = push_of(m, w, RADIUS.worm)
        if vx then w:hit({ amount = 1, vx = vx, vy = vy }) end
      end
    end
    for _, kind in ipairs({ "mine", "crate", "oil" }) do
      local all = kind == "mine" and wa.mines.all() or kind == "crate" and wa.crates.all() or wa.oil.all()
      for _, o in ipairs(all) do
        local vx, vy = push_of(m, o, RADIUS[kind])
        if vx then o:hit(1, vx, vy) end
      end
    end
  end, { weapons = { "px.bulldozer" }, phase = "pre" })
end

return weapon
