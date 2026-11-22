-- Small Worm: the worm takes a mine's shape, lighter gravity and more mass until the turn is over.

local weapon = {}
local ID = "px.small_worm"
local BODY = { scale = 0.85, y = -2 }
local GRAVITY, MASS = 0.75, 1.5

weapon.definition = {
  copy_from = "stock.double_turn_time",
  name = "Small Worm",
  panel_icon = "sprites/small_worm/small_ico.png",
  handling = { remember_selection = false, ends_turn = false, retreat = -1 },
  utility = { effect = "scripted" },
}
weapon.requires = { "lib/turn_controls" }

function weapon.setup()
  local small = {}

  local function activate(worm)
    small[worm.id] = { ending = false }
    worm.y = worm.y - 5
    worm.shape = "mine"
    worm.gravity = worm.gravity * GRAVITY
    worm.mass = worm.mass * MASS
    worm.body_scale = BODY
    require("lib/weapon_hint").notice(worm, "Small worm mode: ON")
  end

  local function deactivate(worm)
    small[worm.id] = nil
    worm.shape = "worm"
    worm.y = worm.y - 9
    worm.vx, worm.vy = 0, 0
    if not worm:fits(worm.x, worm.y) then
      local x, y = worm.x, worm.y
      for _, h in ipairs({ { 0, -4, 5 }, { -6, 4, 4 }, { 6, 4, 4 }, { -6, 0, 4 }, { 6, 0, 4 }, { 0, -1, 4 } }) do
        wa.land.cut({ x = x + h[1], y = y + h[2], shape = "circle", radius = h[3] })
      end
    end
    worm.gravity = worm.gravity / GRAVITY
    worm.mass = worm.mass / MASS
    worm.body_scale = nil
    require("lib/weapon_hint").notice(worm, "Small worm mode: OFF")
  end

  require("lib/turn_controls").register(ID, {
    fire = function(worm)
      if worm.vx ~= 0 or worm.vy ~= 0 then return "eat" end
      if small[worm.id] then deactivate(worm) else activate(worm) end
    end,
  })
  wa.on.turn_end(function()
    for _, s in pairs(small) do s.ending = true end
  end)
  wa.on.worm_message(function(worm)
    local s = small[worm.id]
    if s and s.ending and worm.state == "standing" then deactivate(worm) end
  end, { msgs = { wa.msg.FRAME_FINISH } })
end

return weapon
