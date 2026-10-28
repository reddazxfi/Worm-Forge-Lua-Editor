-- Fire Jump: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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

weapon.requires = { "weapons/super_drill" }

function weapon.setup()
  local shared = require("lib/shared")
  local drills = shared.drills
  local follow_drill = shared.follow_drill

  -- Fire Jump (PX Fire_Jump_script): WA's fire punch, whose speed then follows
  -- PX's timeline, counted in frames from the punch -- up at once, forward
  -- after half a second, a little higher at one second, and from 80 frames a
  -- fall cut back to 4 pixels a frame whenever it passes 5, until 210. PX
  -- speeds are pixels per frame; WA's are 16.16. See
  -- docs/px-reverse-engineering.md.
  --
  -- PX counts from FireFinal, which WA calls only once the punch's wind-up has
  -- played, not when fire is pressed. FireFinal starts the punch at -6 pixels
  -- a frame; the worm stood still until then. So the count starts on the
  -- first frame after fire is pressed that the worm is rising.
  --
  -- WA keeps the worm in its punch state until it has stopped, so the punch
  -- itself cuts the way up and burns worms on it, all jump long: PX adds no cut.
  local jumps = {}   -- worm id -> frames since the punch
  local winding = {} -- worm id -> frames since fire was pressed
  -- A wind-up never takes this long; give up rather than fire late.
  local WIND_UP_MAX = 100
  -- Ready/charging, the firing sequence, then the native punch. A hit, fall,
  -- freeze or other loss of control must not become a delayed Fire Jump.
  local WIND_UP_STATES = {
    [0x67] = true, [0x68] = true, [0x69] = true,
    [0x6A] = true, [0x6B] = true, [0x6C] = true,
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
      if worm.weapon == "px.super_drill" and not drills[worm.id]
          and worm:ammo("px.super_drill") ~= 0 then
        local id = worm.id
        drills[id] = wa.actors.spawn({
          sprite = false, x = worm.x, y = worm.y,
          gravity = false, collide = false, owner = worm,
          on = follow_drill(worm, id),
        })
      elseif worm.weapon == "px.fire_jump" and worm:ammo("px.fire_jump") ~= 0 then
        winding[worm.id] = 0
      elseif worm.weapon == "px.sniper_rifle" and worm:ammo("px.sniper_rifle") ~= 0 then
        -- The Sniper Rifle's own shot, over WA's (PX's snipfiring).
        wa.sound.play(worm, "sounds/sniper_firing.wav")
      end
      -- Neither eats the shot: WA's drill and fire punch still run.
      return
    end
    if msg ~= wa.msg.FRAME_FINISH then return end
    local id = worm.id
    if not (winding[id] or jumps[id]) then return end
    -- Once WA ends the punch, its collisions and knockback own the speed.
    -- Forget the timeline permanently; regaining control cannot resume it.
    if not worm.turn or worm.hp <= 0 or worm.taken
        or (winding[id] and not WIND_UP_STATES[worm.state_id])
        or (jumps[id] and worm.state ~= "punching") then
      winding[id], jumps[id] = nil, nil
      return
    end
    if winding[id] then
      if worm.state == "punching" and worm.vy < 0 then
        winding[id], jumps[id] = nil, 0
      else
        local w = winding[id] + 1
        winding[id] = w < WIND_UP_MAX and w or nil
      end
    end
    if jumps[id] then
      local t = jumps[id] + 1
      fire_jump(worm, t)
      jumps[id] = t < 211 and t or nil
    end
  end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })
end

return weapon
