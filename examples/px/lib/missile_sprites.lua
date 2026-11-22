-- Highlander: PX's missile sprites.

local shared = require("lib/shared")
local HOLD_DEPTH = shared.HOLD_DEPTH
local frame_of = shared.frame_of
local next_phase = shared.next_phase

-- ------------------------------------ PX's missile sprites, at run time
local flying, current_worm
do

local PX_WEAP_SPRITES = shared.missile_sprites

flying = {} -- missile id -> { actor, phase, seen }
local matched = {}

local function follow_missile(id)
  return function(a)
    local f = flying[id]
    if f and f.seen then
      f.seen = false
      return
    end
    if f and f.actor == a then
      flying[id] = nil
      matched[id] = nil
    end
    a:remove()
  end
end

function current_worm()
  for _, w in ipairs(wa.worms.all()) do
    if w.turn then
      return w
    end
  end
end

local last_turn_id
wa.on.turn_start(function(event)
  last_turn_id = event.worm and event.worm.id
end)

local function sprite_owner()
  local turn = current_worm()
  if turn then return turn end
  if not last_turn_id then return nil end
  local any
  for _, w in ipairs(wa.worms.all()) do
    if w.id == last_turn_id then return w end
    any = any or w
  end
  return any
end

-- A weapon's missile_sprite is one spec, or a list of them told apart by
-- first_sprite: the WA sprite a missile draws on its first frame.
local function spec_for(m)
  local specs = shared.owns(m.weapon) and PX_WEAP_SPRITES[m.weapon]
  if not specs then return nil end
  if matched[m.id] then return matched[m.id] end
  if specs.sheet then specs = { specs } end
  for _, p in ipairs(specs) do
    if not p.first_sprite then return p end
    if m.phase == "pre" and m.sprite == p.first_sprite then
      matched[m.id] = p
      return p
    end
  end
end

wa.on.missile_frame(function(m)
  local p = spec_for(m)
  if p and p.hide and m.phase == "pre" and (flying[m.id] or sprite_owner()) then
    m.sprite = 0
  end
  p = m.phase == "post" and p
  if not p then
    return
  end
  local f = flying[m.id]
  if not f then
    local owner = sprite_owner()
    if not owner then
      return
    end
    f = { phase = 0, rot = 0 }
    f.actor = wa.actors.spawn({
      sprite = p.sheet, x = m.x, y = m.y, owner = owner, on = follow_missile(m.id),
    })
    flying[m.id] = f
  end
  f.seen = true
  local a = f.actor
  a.x, a.y, a.vx, a.vy = m.x, m.y, 0, 0
  a.facing = (m.vx < 0 and not p.upright) and -1 or 1
  if p.animate then
    f.phase = next_phase(f.phase, p.anim_speed)
    a:frame(frame_of(f.phase, p.frames))
  end
  local rot
  if p.upright then
    rot = 0
  elseif p.spin then
    local vx, vy = m.vx, m.vy
    local sign = vx > 0 and 1 or vx < 0 and -1 or 0
    f.rot = f.rot + (p.spin_speed or 0.5) * (vx * 0.15 + math.abs(vy * 0.01) * sign)
    rot = f.rot
  else
    rot = -wa.math.atan(m.vx, m.vy) - math.pi
  end
  local sunk = p.sink_tint ~= nil and m.y >= wa.world.water()
  if sunk ~= (f.sunk or false) then
    f.sunk = sunk
    a:gfx({ tint = sunk and p.sink_tint or 0xFFFFFF })
  end
  a:gfx({ angle = math.deg(rot) % 360, depth = HOLD_DEPTH, scale = p.scale })
end)
end

shared.current_worm = current_worm
