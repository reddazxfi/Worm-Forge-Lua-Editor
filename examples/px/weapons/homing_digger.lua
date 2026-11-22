-- Homing Digger: click a target, then throw: a rocket that bursts on contact into a digger that homes on the target through the land.

local on_missile = require("lib/on_missile")
local homing = require("lib/px_homing")
local weapon = {}

local ART = "sprites/homing_digger/"
local SHEET = ART .. "digger.png"

-- The rocket goes off on contact with no blast; its burst is the digger.
weapon.record = {
  missile = {
    sprite = 0, -- WA draws no round; the art spec draws it
    animation = 2,
    burst = "nothing",
    countdown = 0, -- no timer: it goes off on contact, or after PX's default 5 seconds
    fuse = 5000,
    impact_particles = false,
    bounce = {
      bounciness = 70,
      contact_sides = 0,
      max_bounces = 3,
      sound = 0,
      terrain_keep_speed_pct = 120,
      hits = {
        water = true,
        worms_frozen = true,
      },
    },
    ends_on_contact = {
      crates = true,
      donor_cards = true,
      land = true,
      objects = true,
      worms = true,
    },
    explosion = {
      bias = 0,
      power = 0,
      push_pct = 0,
    },
    trail = {
      bubbles_per_second = 0,
      speed = 0,
      sprite = 0,
    },
  },
}

-- What the digger changes in the rocket's record: it goes through land, Space
-- sets it off, and it blasts 50 after five seconds.
local DIGGER = {
  action = "dig",
  countdown = 0,
  fuse = 5000,
  explode_on_space = true,
  explosion = { power = 50, push_pct = 100 },
  ends_on_contact = {
    crates = true,
    donor_cards = true,
    mines = true,
    objects = true,
    worms_frozen = true,
    worms_jumping = true,
    worms_normal = true,
    worms_roping = true,
  },
  dig = { sound = 0, dive_sprite = 50, sprite_1 = 50, sprite_2 = 50, sprite_3 = 50 },
}

-- PX's digger, in pixels/frame: it homes at 13, slows to 3.5 in land, where it
-- drills an 8-pixel hole a frame, and speeds back up by 0.23 a frame to 14 in
-- the air. Every other frame it turns half way towards the target, for 300 frames.
local THROW = 3 -- the rocket's last speed, times this, starts the digger
local HOME_SPEED, DIG_SPEED, AIR_SPEED, AIR_GAIN = 13, 3.5, 14, 0.23
local TURN, HOME_FRAMES = 0.5, 300
local DRILL_RADIUS, DRILL_PROBE = 8, 5
local SOUND_BURST, SOUND_DRILL, SOUND_BLAST = 44, 85, 59
local DRILL_SOUND_FRAMES = 4

weapon.missile_sprite = {
  sheet = SHEET, frames = 1, hide = true, scale = 1.2,
}

local diggers = {} -- missile id -> its homing state
local last = {} -- rocket id -> its last speed over 1 pixel/frame
local pending = {} -- diggers to launch once the rocket's burst is over
local blasts = {} -- where diggers went off: fire to start
local shooter, target
local launching = false -- a burst now is a digger's, bursting as WA builds it

local function on_explode(ev)
  local id = ev.missile
  if not id then return end
  if launching or diggers[id] then
    diggers[id] = nil
    blasts[#blasts + 1] = { x = ev.x, y = ev.y }
    return
  end
  local v = last[id] or { ev.vx or 0, ev.vy or 0 }
  last[id] = nil
  pending[#pending + 1] = { x = ev.x, y = ev.y, vx = v[1] * THROW, vy = v[2] * THROW }
end

local function in_land(m)
  return wa.world.collides({ x = m.x, y = m.y, radius = DRILL_PROBE, with = { "terrain" } })
end

-- Before WA moves it: drill, and set its speed.
local function drill(m, d) -- d: homing's state, plus drill_wait
  if d.drill_wait > 0 then d.drill_wait = d.drill_wait - 1 end
  if in_land(m) then
    d.speed = DIG_SPEED
    if d.drill_wait == 0 then
      if d.owner then wa.sound.play(d.owner, SOUND_DRILL) end
      d.drill_wait = DRILL_SOUND_FRAMES
    end
    wa.land.cut({ x = m.x, y = m.y, shape = "circle", radius = DRILL_RADIUS })
  elseif d.speed < AIR_SPEED then
    d.speed = d.speed + AIR_GAIN
  end
  if homing.near(m, d) then d.drill_wait = 1 end
end

function weapon.definition()
  local sdk = require("wf-lib/holds")
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.grenade",
    name = "Homing Digger",
    click = "homing",
    panel_icon = ART .. "homing_digger_ico.png",
    hold_as = "stock.grenade",
    on_explode = on_explode,
    worm_sprites = sdk.PX_POSTURE,
    sprites = { SHEET },
    hold = {
      thrown = true,
      sheet = SHEET, hand_type = 1, hand_radius = 17, hand_scale = 1,
      weap_rotation = 0.9, weap_radius = 8,
      hand = sdk.PX_HANDS[1],
    },
  })
end

function weapon.setup()
  diggers, last, pending, blasts, shooter, target, launching = {}, {}, {}, {}, nil, nil, false

  on_missile(function(m)
    if m.weapon ~= "px.homing_digger" then return end
    local d = diggers[m.id]
    if not d then
      if m.phase == "post" and math.abs(m.vx) + math.abs(m.vy) > 1 then last[m.id] = { m.vx, m.vy } end
      return
    end
    if m.phase == "pre" then drill(m, d) else homing.step(m, d) end
  end, { weapons = { "px.homing_digger" } })

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FIRE_WEAPON and worm.weapon == "px.homing_digger" then
      shooter = worm
      local t = worm.target
      target = t and { x = t.x, y = t.y } or nil
      return
    end
    if msg ~= wa.msg.FRAME_FINISH then return end
    local owner = shooter or worm
    if #pending > 0 then
      local list = pending
      pending = {}
      for _, p in ipairs(list) do
        if owner then wa.sound.play(owner, SOUND_BURST) end
        launching = true
        local ok, id = pcall(wa.weapons.launch, {
          weapon = "px.homing_digger", owner = owner, x = p.x, y = p.y, vx = p.vx, vy = p.vy,
          missile = DIGGER,
        })
        launching = false
        if ok and id then
          local d = homing.new({ x = target and target.x, y = target and target.y,
            speed = HOME_SPEED, turn = TURN, frames = HOME_FRAMES, owner = owner })
          d.drill_wait = 0
          diggers[id] = d
        end
      end
    end
    if #blasts > 0 then
      for _, b in ipairs(blasts) do
        wa.fire.spawn({ owner = owner, x = b.x, y = b.y, vx = 0, vy = -8, count = 40,
          duration = 4000, up_power = 100, damage = 5 })
        if owner then wa.sound.play(owner, SOUND_BLAST) end
      end
      blasts = {}
    end
  end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })
end

return weapon
