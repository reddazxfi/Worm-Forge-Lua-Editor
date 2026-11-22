-- Class inventories, native cooldowns, Medic aura and the Soldier's zombie.

local data = require("scheme/specialists_data")
local zombie = require("scheme/specialists_zombie")
local rules = {}
local GLOW = "sprites/specialists/glow.png"
local COLOURS = { 0x50780000, 0x50000078, 0x50007800, 0x505A5A00, 0x505A005A, 0x50005A5A }

function rules.install(ctx)
  if ctx.selected("hl.rules") then error("Select either Specialists rules or Highlander rules.") end
  local placed = ctx.weapons
  local managed, seen = {}, {}
  for _, class in ipairs(data.classes) do
    for _, list in ipairs({ class.weapons, class.survivor }) do
      for _, id in ipairs(list) do
        if placed[id] and not seen[id] then
          managed[#managed + 1], seen[id] = id, true
        end
      end
    end
  end
  local initialized, temporary_locks, warned_extra = {}, {}, false
  local function class_of(worm) return data.classes[worm.id % 16] end
  local function initialize(worm)
    local class = class_of(worm)
    if not class then
      if not warned_extra then
        wa.log("Specialists: use five worms per team; additional worms have no class.")
        warned_extra = true
      end
      return nil
    end
    if worm.hp <= 0 then return class end
    if not initialized[worm.id] then
      initialized[worm.id] = true
      worm.name = class.name
      if worm.hp < class.hp then worm:heal(class.hp - worm.hp) end
    elseif worm.name ~= class.name and not zombie.is_zombie(worm) then
      worm.name = class.name
    end
    return class
  end
  local function survivors(worm)
    local count = 0
    for _, other in ipairs(wa.worms.all()) do
      if other.team == worm.team and other.hp > 0 and class_of(other) and not zombie.is_zombie(other) then
        count = count + 1
      end
    end
    return count
  end
  local function refresh(worm)
    local class = initialize(worm)
    if not class or worm.hp <= 0 then return end
    local allowed = {}
    for _, id in ipairs(class.weapons) do allowed[id] = true end
    if survivors(worm) == 1 then
      for _, id in ipairs(class.survivor) do allowed[id] = true end
    end
    for _, id in ipairs(managed) do
      worm:ammo(id, { set = allowed[id] and -1 or 0, keep_delay = true })
    end
  end
  wa.assets.load({ sprites = { GLOW }, gpu_prefix = "sprites/specialists/", wa_sprites = { "worm" } })
  zombie.install(function(worm) return worm.id % 16 == 1 end, data.classes[1].name)
  wa.on.turn_start(function(event) refresh(event.worm) end)
  wa.on.worm_message(function(worm, msg)
    initialize(worm)
    if msg == wa.msg.TURN_STARTED and worm.turn then
      local locks = temporary_locks[worm.ammo_group] or {}
      for _, id in ipairs(wa.sorted(locks)) do
        if worm:delay(id) == -1 then worm:delay(id, 0) end
      end
      temporary_locks[worm.ammo_group] = nil
      refresh(worm)
    elseif msg == wa.msg.WEAPON_RELEASED and worm.turn then
      local id = worm.weapon
      if id and placed[id] then
        local delay = data.delays[id]
        if delay then
          worm:delay(id, delay)
        elseif wa.weapons.data(id).handling.ends_turn then
          worm:delay(id, -1)
          local locks = temporary_locks[worm.ammo_group] or {}
          locks[id] = true
          temporary_locks[worm.ammo_group] = locks
        end
      end
      refresh(worm)
    elseif msg == wa.msg.FRAME_FINISH and worm.turn then
      if worm.state == "roping" and placed["stock.ninja_rope"] then
        worm:delay("stock.ninja_rope", 1)
      elseif worm.state == "parachuting" and placed["stock.parachute"] then
        worm:delay("stock.parachute", 0)
      end
      if worm.state == "prefiring" and worm.weapon == "px.jump" and placed["px.jump"] then
        worm:delay("px.jump", 1)
      end
    end
  end, { msgs = { wa.msg.FRAME_FINISH, wa.msg.TURN_STARTED, wa.msg.WEAPON_RELEASED } })
  wa.on.hurt(function(hit)
    local medic = hit.worm
    if hit.phase ~= "post" or hit.kind ~= "poison" or medic.hp <= 0 then return end
    local class = initialize(medic)
    if not class or class.name ~= "Medic" then return end
    for _, other in ipairs(wa.worms.all()) do
      local target_class = initialize(other)
      local dx, dy = other.x - medic.x, other.y - medic.y
      if target_class and other.id ~= medic.id and other.hp > 0
        and other.alliance == medic.alliance and dx * dx + dy * dy <= 10000
        and other.hp <= target_class.hp then other:heal(25) end
    end
  end)
  wa.on.draw(function()
    for _, worm in ipairs(wa.worms.all()) do
      local class = class_of(worm)
      if class and class.name == "Medic" and worm.hp > 0 then
        local x, y = worm.x, worm.y
        wa.draw.quad({ points = { {x-128,y-128}, {x+128,y-128}, {x+128,y+128}, {x-128,y+128} },
          sprite = GLOW, visibility = worm, frame = 0,
          color = COLOURS[worm.alliance + 1], additive = true, depth = wa.depth.EFFECTS })
      end
    end
  end)
end

return rules
