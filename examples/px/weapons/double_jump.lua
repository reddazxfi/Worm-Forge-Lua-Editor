-- Double Jump: Project X's utility_doublejump (doublejump.txt), the
-- component's entry point. Its record is PX's (weps/double_jump.wep); the
-- engine gives it a slot of its own. `require` runs where `wa` does not exist
-- yet, so everything that needs `wa` happens in install.
--
-- Using it switches a second jump on for the turn; using it again switches it
-- off. While it is on, the turn's worm in the air from a jump (WA's own, or
-- the Jump's launch) jumps once more on Enter or Backspace, and may again
-- once it is standing. The turn over, it is off.
--
-- PX sets the worm back to WA's jump preparation (WS_JUMPPREPARE) in the
-- air; as its animation has already played through, WA takes off at once
-- (0x515EF0) with the jump the worm last made, as its keys left it: forward
-- after forward, a backflip after a backflip. worm:jump() is that take-off:
-- WA's jump, its animation and the team's speech, with no state of the
-- pack's.
--
-- Differences: PX spends the utility each time it is used, off as well as
-- on; here only switching it on does. PX's record is WA's Low Gravity's
-- switch and its FireFinal runs it, so PX's also turned Low Gravity on; here
-- the pack's own fire takes its place, and the record switches nothing on.
-- PX's jump fizzled (the worm just fell) when the key came while the jump's
-- own animation was still playing; this one always jumps. PX shows "Double
-- Jump: ON" / "OFF" once; here the HUD says it while it is on. Not ported:
-- PX's AutoDoubleJump script, which switches it on at every turn's start.

-- WA's states for a worm in the air from a jump: jumping, coming down.
local JUMPING = { [0x79] = true, [0x7A] = true }
-- Falling under its own control: where the Jump's launch leaves the worm.
local FALLING = 0x7E
-- Standing, walking, the turn's worm ready: back on the ground.
local GROUNDED = { [0x65] = true, [0x66] = true, [0x67] = true }

local function install(ctx)
  local id = ctx.id
  wa.weapons.replace({
    wep = "weps/double_jump.wep",
    panel_icon = "sprites/double_jump/icon.png",
    -- A utility: using it leaves the turn going, as PX's record has it.
  })

  local on, armed = false, false

  -- In the air from a jump: WA's, or the Jump's (PX's Jlaunch).
  local function in_jump(worm)
    local s = worm.state_id
    return JUMPING[s] or (s == FALLING and worm.weapon == "px.jump")
  end

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FRAME_FINISH then
      if on and not armed and worm.turn and GROUNDED[worm.state_id] then
        armed = true
      end
    elseif msg == wa.msg.FIRE_WEAPON then
      if worm.weapon ~= id then
        return
      end
      if on then
        on, armed = false, false
      else
        on, armed = true, true
        worm:ammo(id, -1)
      end
      wa.hud.message_top(on and "Double Jump: ON" or "Double Jump: OFF",
        {to = "coalition", alliance = worm.alliance})
      return "eat"
    elseif msg == wa.msg.JUMP or msg == wa.msg.JUMP_UP then
      if not (armed and worm.turn and not worm.taken and in_jump(worm)) then
        return
      end
      armed = false
      -- WA's take-off, with the jump the worm last made.
      worm:jump()
      return "eat"
    end
  end, { msgs = { wa.msg.FRAME_FINISH, wa.msg.FIRE_WEAPON, wa.msg.JUMP, wa.msg.JUMP_UP } })

  -- PX's: no worm's turn, no double jump.
  wa.on.turn_start(function()
    on, armed = false, false
  end)

end

return { install = install }
