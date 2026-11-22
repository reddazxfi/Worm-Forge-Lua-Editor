-- Random Race: each round of turns races with one movement weapon, chosen at random.

local own_time = require("wf-lib/own_time")
local parkour = require("wf-lib/parkour")
local shared = require("lib/shared")

local race = {}

local ART = "sprites/random_race/"
local RACES = {
  { name = "rope", weapons = { "stock.ninja_rope" }, banner = ART .. "rope_race.png" },
  { name = "parkour", weapons = { "px.jump", "stock.low_gravity" }, banner = ART .. "park_race.png", parkour = true },
  { name = "wings", weapons = { "px.wings" }, banner = ART .. "wing_race.png" },
  { name = "portal", weapons = { "px.portal_gun" }, banner = ART .. "port_race.png" },
  { name = "helicopter", weapons = { "px.helicopter" }, banner = ART .. "heli_race.png" },
}
local TEAMS = 6
local WALL_JUMP = 6 -- WallJumpMultiplier
local AIR_STEP, AIR_LIMIT = 0.1, 3 -- pixels/frame
local AIR_STATES = { jumping = true, falling = true, tumbling = true, hit = true, blasted = true, drilling = true }
local BANNER_W, BANNER_H = 400, 200
local GROW, HOLD, FADE = 25, 190, 20 -- frames

function race.install(ctx)
  local draw = {}
  for _, r in ipairs(RACES) do
    local placed = true
    for _, id in ipairs(r.weapons) do placed = placed and ctx.weapons[id] ~= nil end
    if placed then draw[#draw + 1] = r end
  end
  if #draw == 0 then
    wa.log("Random Race: no race has all its weapons on the panel; off")
    return
  end
  local banners = {}
  for _, r in ipairs(draw) do banners[#banners + 1] = r.banner end
  wa.assets.load({ sprites = banners, gpu_prefix = ART })

  local current, left, shown_at = nil, 0, nil
  local turn_open, active = false, {}
  local movement = parkour.new({ wall_jump = WALL_JUMP, carry_speed = false })

  local function choose()
    current = draw[wa.random(1, #draw)]
    for team = 1, TEAMS do
      for _, r in ipairs(draw) do
        for _, id in ipairs(r.weapons) do
          wa.weapons.set_selectable({ weapon = id, team = team, selectable = r == current })
        end
      end
    end
    local teams = {}
    left = 0
    for _, w in ipairs(wa.worms.all()) do
      if w.hp > 0 and not teams[w.team] then
        teams[w.team] = true
        left = left + 1
      end
    end
    shown_at = wa.world.frame()
    wa.log(("Random Race: %s race for %d turns"):format(current.name, left))
  end

  wa.on.turn_start(function(ev)
    if not turn_open then
      turn_open = true
      if left <= 0 then choose() end
    end
    local worm = ev.worm
    if worm and current.parkour and not active[worm.id] then
      active[worm.id] = true
      if shared.swim_suit_on then shared.swim_suit_on(worm) end
    end
  end)

  wa.on.turn_end(function()
    if turn_open then left = left - 1 end
    turn_open, active = false, {}
  end)

  local function steer(worm)
    if not AIR_STATES[worm.state] then return end
    local k = worm.keys
    for _ = 1, own_time.frames(worm) do
      if k.up and worm.vy >= -AIR_LIMIT then worm.vy = worm.vy - AIR_STEP end
      if k.down and worm.vy <= AIR_LIMIT then worm.vy = worm.vy + AIR_STEP end
      if k.left and worm.vx >= -AIR_LIMIT then worm.vx = worm.vx - AIR_STEP end
      if k.right and worm.vx <= AIR_LIMIT then worm.vx = worm.vx + AIR_STEP end
    end
  end

  wa.on.worm_message(function(worm, msg)
    if not worm.turn or not active[worm.id] or worm.hp <= 0 then return end
    if msg == wa.msg.FRAME_FINISH then steer(worm) end
    local airborne = parkour.air_input(worm, msg)
    movement(worm, msg)
    if airborne then return "eat" end
  end, { msgs = { wa.msg.FRAME_FINISH, wa.msg.JUMP, wa.msg.JUMP_UP } })

  wa.on.hud(function()
    if not shown_at then return end
    local age = wa.world.frame() - shown_at
    if age < 0 or age >= HOLD + FADE then return end
    local alpha = age < GROW and (age + 1) / GROW or age < HOLD and 1 or 1 - (age - HOLD) / FADE
    local w, h = wa.hud.size()
    wa.hud.sprite({
      sprite = current.banner, x = (w - BANNER_W) // 2, y = h // 4 - BANNER_H // 2,
      color = math.floor(alpha * 255) * 0x1000000 + 0xFFFFFF,
    })
  end)
end

return race
