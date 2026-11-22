-- Fire Jump: a fire punch that carries the worm high up, then forward.

local weapon = {}

weapon.record = {
  fire_punch = {
    damage = 45,
    knockback = 8,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.fire_punch",
    name = "Fire Jump",
    panel_icon = "sprites/fire_jump/fire_jump_ico.png",
  })
end

function weapon.setup()
  local own_time = require("wf-lib/own_time")
  local jumps = {} -- worm id -> frames since the punch
  local winding = {} -- worm id -> frames since fire was pressed
  local WIND_UP_MAX = 100
  local WIND_UP_STATES = {
    ready = true, charging = true, prefiring = true,
    firing = true, fired = true, punching = true,
  }

  local function fire_jump(worm, t)
    if t == 1 then
      worm.vy = -9
    elseif t == 30 then
      worm.vx = worm.facing * 4
    elseif t == 60 then
      worm.vy = worm.vy - 1
    end
    if t > 80 and t < 210 and worm.vy > 5 then
      worm.vy = 4
    end
  end

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FIRE_WEAPON then
      if worm.weapon == "px.fire_jump" and worm:ammo("px.fire_jump") ~= 0 then
        winding[worm.id] = 0
      end
      return
    end
    if msg ~= wa.msg.FRAME_FINISH then return end
    local id = worm.id
    if not (winding[id] or jumps[id]) then return end
    if not worm.turn or worm.hp <= 0 or worm.taken
        or (winding[id] and not WIND_UP_STATES[worm.state])
        or (jumps[id] and worm.state ~= "punching") then
      winding[id], jumps[id] = nil, nil
      return
    end
    local n = own_time.frames(worm)
    if winding[id] then
      if worm.state == "punching" and worm.vy < 0 then
        winding[id], jumps[id] = nil, 0
      else
        local w = winding[id] + n
        winding[id] = w < WIND_UP_MAX and w or nil
      end
    end
    for _ = 1, n do
      if not jumps[id] then break end
      local t = jumps[id] + 1
      fire_jump(worm, t)
      jumps[id] = t < 211 and t or nil
    end
  end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })
end

return weapon
