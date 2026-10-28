-- Wind Changer: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  fires = {
    subtype = 19,
  },
  handling = {
    retreat = 0,
  },
  utility = {
    effect = "scripted",
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.surrender",
    name = "Wind Changer",
    panel_icon = "sprites/wind_changer/ico_windchanger.png",
    sounds = {
          "sounds/wind_changer/breeze.wav", "sounds/wind_changer/calm_wind.wav",
          "sounds/wind_changer/strong_wind.wav",
        },
  })
end

weapon.requires = { "weapons/helicopter", "weapons/gravity_control", "lib/turn_controls" }

function weapon.setup()
  -- PX's force steps, applied toward the firing worm's facing.
  local WIND_STEP = 0.0317
  local wind_force = 0
  require("lib/turn_controls").register("px.wind_changer", {
    choose = function(worm, digit)
      wind_force = digit
      wa.sound.play(worm, 107)
    end,
    fire = function(worm)
      local f = wind_force
      wa.sound.play(worm, f == 0 and "sounds/wind_changer/breeze.wav"
        or f < 6 and "sounds/wind_changer/calm_wind.wav" or "sounds/wind_changer/strong_wind.wav")
      wa.world.set_wind((f * WIND_STEP) * worm.facing)
    end,
    hint = function()
      return string.format("Wind Changer: force %d (keys 0-9), then Space", wind_force)
    end,
  })
end

return weapon
