-- Super Tele: a teleport that also works into solid land, cutting room to arrive.

local weapon = {}

weapon.record = {
  handling = {
    remember_selection = true,
    ends_turn = true,
  },
}

weapon.defaults = {
  after_use = "end",
  cursor_sprite = "wbrth1",
}

function weapon.definition()
  local shared = require("lib/shared")
  local fires = shared.fires
  return require("lib/weapon").merge(weapon.record, {
    wep = "weps/teleport.wep",
    panel_icon = "sprites/super_tele/icon.png",
    on_select = { cursor = true },
    on_click = function(ev) fires.super_tele_click(ev) end,
  })
end

function weapon.setup()
  local shared = require("lib/shared")
  local fires = shared.fires

  do
  fires.teleports = {} -- worm id -> frozen target and elapsed frames

  local function super_tele_arrive(worm, x, y)
    worm.x, worm.y = x, y
    for _, rise in ipairs({ 0, 10, 22 }) do
      wa.land.cut({ x = x, y = y - rise, shape = "circle", radius = 12 })
    end
  end

  local TELE_SOUND_PRIORITY = 3
  local SOUND_TELEPORT, SOUND_COMMUNICATOR, SOUND_WORM_POP = 67, 68, 54
  local PLACEMENT_POP_FRAMES = 21

  local function unplaced(worm) return worm.y == -10000 end

  local function skip_placement_windup(worm)
    if worm.weapon == "px.super_tele" and unplaced(worm) and worm.windup == nil then
      worm.windup = 0
    end
  end

  fires.super_tele_click = function(ev)
    local worm = ev.worm
    if worm.hp <= 0 then return end
    local y = ev.y
    if wa.world.cavern() and y < 19 then y = 19 end
    if unplaced(worm) then
      super_tele_arrive(worm, ev.x, y)
      worm:teleport_pose()
      wa.sound.play(worm, SOUND_COMMUNICATOR, TELE_SOUND_PRIORITY)
      fires.teleports[worm.id] = { placed = true, frames = 0 }
      return
    end
    fires.teleports[worm.id] = { x = ev.x, y = y, frames = 0, pending = true }
    wa.sound.play(worm, SOUND_COMMUNICATOR, TELE_SOUND_PRIORITY) -- PX's M_SETTARGET confirmation
  end

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FIRE_WEAPON then
      skip_placement_windup(worm)
      return
    end
    if worm.state == "prefiring" then skip_placement_windup(worm) end
    local tele = fires.teleports[worm.id]
    if not tele then return end
    if tele.placed then
      tele.frames = tele.frames + 1
      if tele.frames < PLACEMENT_POP_FRAMES then return end
      fires.teleports[worm.id] = nil
      if worm.hp > 0 then wa.sound.play(worm, SOUND_WORM_POP, TELE_SOUND_PRIORITY) end
      return
    end
    if worm.hp <= 0 then
      fires.teleports[worm.id] = nil
      return
    end
    if tele.pending then
      tele.pending = false
      worm:teleport_pose()
      wa.sound.play(worm, SOUND_TELEPORT, TELE_SOUND_PRIORITY) -- PX's teleport start
      return
    end
    tele.frames = tele.frames + 1
    if tele.frames < 50 then return end
    fires.teleports[worm.id] = nil
    super_tele_arrive(worm, tele.x, tele.y)
  end, { msgs = { wa.msg.FRAME_FINISH, wa.msg.FIRE_WEAPON } })
  end
end

return weapon
