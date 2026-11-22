-- Parachute weapons: WA's fire of a weapon whose record is a parachute, for the pack's next frame.

local parachute = {}
local fired = {}
local installed

function parachute.setup()
  if installed then return end
  installed = true
  wa.on.worm_message(function(worm)
    if worm.state == "parachuting" then fired[worm.id] = worm.weapon end
  end, { msgs = { wa.msg.WEAPON_RELEASED } })
end

-- At FRAME_FINISH: "open", or "landed" when WA's hard-landing open landed it before this frame; nil if not fired.
function parachute.fired(worm, id)
  if fired[worm.id] ~= id then return nil end
  fired[worm.id] = nil
  return worm.state == "parachuting" and "open" or "landed"
end

return parachute
