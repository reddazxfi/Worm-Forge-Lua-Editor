-- Parkour: parkour for the turn: Enter kicks the worm off a wall, Backspace bunny-hops it.

local weapon = {
  definition = {
    copy_from = "stock.double_turn_time",
    name = "Parkour",
    panel_icon = "sprites/parkour/parkour_ico.png",
    handling = {remember_selection=false,ends_turn=false,retreat=3000},
    utility = {effect="scripted"},
    sounds = {"sounds/parkour/parkour_snd.wav"},
  },
  requires = {"lib/turn_controls"},
}

function weapon.setup()
  local enabled = {}
  local parkour = require("wf-lib/parkour")
  local movement = parkour.new()
  require("lib/turn_controls").register("px.parkour", {
    fire = function(worm)
      enabled[worm.id] = not enabled[worm.id]
      if enabled[worm.id] then wa.sound.play(worm, "sounds/parkour/parkour_snd.wav") end
    end,
    finish = function() enabled = {} end,
    hint = function(worm)
      return "Parkour: " .. (enabled[worm.id] and "ON" or "OFF") .. "\nSpace: on/off\nEnter: wall-jump\nBackspace: hop"
    end,
  })
  wa.on.worm_message(function(worm, msg)
    if not worm.turn or not enabled[worm.id] or worm.hp <= 0 then return end
    local airborne = parkour.air_input(worm, msg)
    movement(worm, msg)
    if airborne then return "eat" end
  end, {msgs={wa.msg.FRAME_FINISH,wa.msg.JUMP,wa.msg.JUMP_UP}})
end
return weapon
