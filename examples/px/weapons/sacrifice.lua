-- Sacrifice: trades 50 HP for five seconds of turn time per step, keeping one HP.

local weapon = {
  definition = {
    copy_from = "stock.double_turn_time",
    name = "Sacrifice",
    panel_icon = "sprites/sacrifice/sacrifice_ico.png",
    handling = {remember_selection=false,ends_turn=false,retreat=-1},
    utility = {effect="scripted"},
    sounds = {"sounds/sacrifice/sacrifice_sound.wav", "sounds/sacrifice/sacrifice_error.wav"},
  },
  requires = {"lib/turn_controls"},
}

function weapon.setup()
  local choice
  require("lib/turn_controls").register("px.sacrifice", {
    choose = function(worm, digit)
      if digit >= 1 and digit <= 5 then
        choice = digit
        wa.sound.play(worm, 106)
      end
    end,
    fire = function(worm)
      if not choice then
        wa.sound.play(worm, "sounds/sacrifice/sacrifice_error.wav")
        return "eat"
      end
      local requested = choice
      choice = nil
      local steps = math.min(requested, math.floor((worm.hp - 1) / 50))
      if steps < 1 or not worm:reduce_health(50 * steps) then
        wa.sound.play(worm, "sounds/sacrifice/sacrifice_error.wav")
        require("lib/weapon_hint").notice(worm, "Sacrifice: not enough HP")
        return
      end
      wa.world.set_turn_clock(math.min(3600000,wa.world.turn_clock() + 5000 * steps))
      wa.sound.play(worm, "sounds/sacrifice/sacrifice_sound.wav")
      if steps < requested then
        require("lib/weapon_hint").notice(worm, "Sacrifice: added as much time\nas your HP allows")
      end
    end,
    finish = function() choice = nil end,
    hint = function()
      return choice and string.format("Sacrifice: %d HP for %d seconds\nSpace: sacrifice", 50*choice, 5*choice)
        or "Sacrifice: 50 HP per 5 seconds\n1-5: how much, then Space"
    end,
  })
end
return weapon
