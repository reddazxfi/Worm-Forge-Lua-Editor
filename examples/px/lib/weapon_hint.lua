-- Selection and mode hints use WA's native banner, once per change.
local hints = {}
local readers = {}
local installed, shown, pending
-- WA's SelectWeapon message; observe it so reselecting the same weapon
-- restores its hint too. It is followed by WA's own selection banner.
local SELECT_WEAPON = 51

function hints.register(id, text)
  readers[id] = text
  if installed then return end
  installed = true
  local function reset() shown, pending = nil, nil end
  wa.on.turn_start(reset)
  wa.on.turn_end(reset)
  wa.on.worm_message(function(worm, msg)
    if not worm.turn then return end
    if msg == SELECT_WEAPON then reset(); return end
    local reader = readers[worm.weapon]
    local text = reader and reader(worm)
    if not text or worm.hp <= 0 then reset(); return end
    local key = worm.id .. ":" .. worm.weapon .. ":" .. text
    if shown == key then pending = nil; return end
    -- Let every weapon's input callback finish before announcing its value.
    -- Two matching simulation frames also leave WA's selection banner behind.
    if pending ~= key then pending = key; return end
    wa.hud.message_top(text, {to = "coalition", alliance = worm.alliance})
    shown, pending = key, nil
  end, {msgs = {SELECT_WEAPON, wa.msg.FRAME_FINISH}})
end

return hints
