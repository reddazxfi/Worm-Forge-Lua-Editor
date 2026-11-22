-- Anti Fall Damage: for the turn, a fast-flying worm lands on its feet, unhurt and in control.

local ID = "px.anti_fall_damage"
local SOUND = "sounds/anti_fall_damage/fall_protection.wav"
local FAST = 8 -- pixels/frame
-- WS_JUMP, WS_FLYING2, WS_SLIDING, WS_FLYING, WS_AFTERROPE and WS_POWERFLY.
local GUARDED = {
  jumping = true, jump_falling = true, falling = true, tumbling = true,
  hit = true, blasted = true, after_rope = true,
}

local automatic = false

local weapon = {
  defaults = { crate = { type = "utility" } },
  definition = {
    copy_from = "stock.double_turn_time",
    name = "Anti Fall Damage",
    panel_icon = "sprites/anti_fall_damage/anti_fd_ico.png",
    handling = { remember_selection = false, ends_turn = false, retreat = -1 },
    utility = { effect = "scripted" },
    sounds = { SOUND },
  },
  requires = { "lib/turn_controls" },
}

function weapon.setup()
  local on = {}
  local function switch(worm)
    on[worm.id] = not on[worm.id]
    if on[worm.id] then wa.sound.play(worm, SOUND) end
  end
  require("lib/turn_controls").register(ID, {
    fire = switch,
    finish = function() on = {} end,
    hint = function(worm)
      return "Anti Fall Damage: " .. (on[worm.id] and "ON" or "OFF") .. "\nSpace: on/off"
    end,
  })
  wa.on.turn_start(function(ev)
    local worm = ev.worm
    if automatic and worm and not on[worm.id] and worm:ammo(ID) ~= 0 then
      switch(worm)
      worm:ammo(ID, -1)
    end
  end)
  wa.on.worm_message(function(worm)
    if not worm.turn or not on[worm.id] or not GUARDED[worm.state] then return end
    if math.abs(worm.vx) > FAST or math.abs(worm.vy) > FAST then worm:set_state("standing") end
  end, { msgs = { wa.msg.FRAME_FINISH } })
end

function weapon.configure(ctx)
  automatic = ctx.data.auto_use == true
end

return weapon
