-- Reinforcement: click to add a new worm to the team, with 200 health.

local weapon = {}

weapon.record = {
  handling = {
    remember_selection = true,
    ends_turn = true,
  },
}

local COLLECT = "soundbank/Kamikaze/Collect"

local ERROR = "sounds/gravity_control/error.wav"

function weapon.definition()
  local shared = require("lib/shared")
  local fires = shared.fires
  return require("lib/weapon").merge(weapon.record, {
    wep = "weps/nuclear_test.wep",
    panel_icon = "sprites/reinforcement/icon.png",
    sounds = { COLLECT, ERROR },
    on_select = { cursor = true },
    on_click = function(ev) fires.reinforcement(ev) end,
  })
end

function weapon.setup()
  local shared = require("lib/shared")
  local NAME, HEALTH = "Reinforcement", 200
  local STAND = 12

  local function ground(x)
    local size = wa.world.size()
    local y = 0
    while y < size.h and wa.land.solid(x, y) do y = y + 1 end
    while y < size.h and not wa.land.solid(x, y) do y = y + 1 end
    if y >= size.h then return nil end
    return y
  end

  local DROP_Y = -200
  local SETTLE, AT_REST = 5, 0.1
  local ID = "px.reinforcement"
  local FULL = 8

  local function update_selectable()
    if not wa.weapons.set_selectable then return end
    local living = {}
    for _, w in ipairs(wa.worms.all()) do
      if w.hp > 0 then living[w.team] = (living[w.team] or 0) + 1 end
    end
    for team = 1, 6 do
      wa.weapons.set_selectable({ weapon = ID, team = team, selectable = (living[team] or 0) < FULL })
    end
  end

  wa.on.turn_start(update_selectable)
  wa.on.death(update_selectable)

  local dropping = {}

  wa.on.worm_message(function(w)
    local frames = dropping[w.id]
    if not frames then return end
    if w.state ~= "jetpacking" then
      dropping[w.id] = nil
      w.selectable = true
    elseif frames >= SETTLE and w.vy < AT_REST and not w:fits(w.x, w.y + 1) then
      dropping[w.id] = nil
      w:release(0, 0)
      w.selectable = true
    else
      dropping[w.id] = frames + 1
    end
  end, { msgs = { wa.msg.FRAME_FINISH } })

  shared.fires.reinforcement = function(ev)
    local worm = ev.worm
    local x = ev.x // 1
    local y = ground(x)
    local at = y and (y - STAND) or wa.world.water() - STAND
    local ok, spawned = pcall(wa.worms.spawn, { team = worm.team, x = x, y = DROP_Y, name = NAME, health = HEALTH })
    if not ok then
      wa.log("Reinforcement: " .. tostring(spawned))
      wa.sound.play(worm, ERROR)
    else
      wa.sound.play(worm, COLLECT)
      local flying, on = pcall(spawned.use, spawned, "stock.jet_pack")
      if flying and on then
        spawned.selectable = false
        dropping[spawned.id] = 0
      else
        spawned.x, spawned.y = x, at
      end
      if shared.fresh_hand then
        shared.fresh_hand(spawned)
      end
      update_selectable()
    end
  end
end

return weapon
