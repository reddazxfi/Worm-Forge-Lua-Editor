-- Homing Cluster Bomb: click a target, then throw: a grenade whose blast throws five clustlets that home on the target.

local homing = require("lib/px_homing")
local weapon = {}

local ART = "sprites/homing_cluster/"
local CLUSTLET_SPRITE = 54 -- the stock cluster bit's, which the clustlets fly with

weapon.record = {
  missile = {
    sprite = 0, -- WA draws no round; the art spec draws it
    burst = "nothing",
    explosion = {
      bias = 0,
      power = 30,
      push_pct = 100,
    },
    trail = {
      bubbles_per_second = 0,
      speed = 0,
      sprite = 0,
    },
  },
}

-- PX's clustlet record: no action, it goes off on contact or after 6 seconds.
local CLUSTLET = {
  action = "none",
  sprite = CLUSTLET_SPRITE,
  animation = 2,
  countdown = 0,
  fuse = 6000,
  explode_on_space = false,
  speed_pct = 100,
  wind_pct = 0,
  gravity_pct = 100,
  explosion = { bias = 0, power = 20, push_pct = 100 },
  ends_on_contact = {
    crates = true,
    donor_cards = true,
    land = true,
    objects = true,
    worms = true,
    worms_frozen = true,
  },
}

-- PX's shootMoreMissiles: five clustlets 20 pixels above the blast, fanned over
-- 30 degrees about straight up at 10 pixels/frame, each nudged at random (the
-- middle one less sideways). After 40 frames, with sound 44 just before, they
-- home on the target at 10 for 180 frames, turning 0.15 of the way every other frame.
local CLUSTLETS, LIFT, FAN, SPEED = 5, 20, 30, 10
local MIDDLE = 3 -- the one PX nudges less
local HOME = { speed = 10, turn = 0.15, delay = 40, frames = 180, sound = 44 }

weapon.missile_sprite = {
  { sheet = ART .. "bomb.png", frames = 1, spin = true, hide = true, first_sprite = 0 },
  { sheet = ART .. "clustlet.png", frames = 1, hide = true, first_sprite = CLUSTLET_SPRITE },
}

local clustlets = {} -- missile id -> its homing state
local bursts = {}
local shooter, target
local launching = false -- a burst now is a clustlet's, bursting as WA builds it

local function on_explode(ev)
  local id = ev.missile
  if not id then return end
  if launching or clustlets[id] then
    clustlets[id] = nil
    return
  end
  bursts[#bursts + 1] = { x = ev.x, y = ev.y - LIFT }
end

local function nudge(lo, hi)
  return wa.random(math.floor(lo * 65536), math.floor(hi * 65536)) / 65536
end

function weapon.definition()
  local sdk = require("wf-lib/holds")
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.grenade",
    name = "Homing Cluster Bomb",
    click = "homing",
    panel_icon = ART .. "homing_cluster_ico.png",
    hold_as = "stock.grenade",
    on_explode = on_explode,
    worm_sprites = sdk.PX_POSTURE,
    sprites = { ART .. "bomb.png", ART .. "clustlet.png" },
    hold = {
      thrown = true,
      sheet = ART .. "bomb.png", hand_type = 1, hand_radius = 15, hand_scale = 0.8,
      weap_rotation = 0.5, weap_radius = 9,
      hand = sdk.PX_HANDS[1],
    },
  })
end

function weapon.setup()
  clustlets, bursts, shooter, target, launching = {}, {}, nil, nil, false

  wa.on.missile_frame(function(m)
    local h = m.phase == "post" and clustlets[m.id]
    if h then
      homing.step(m, h)
    elseif m.phase == "pre" and clustlets[m.id] then
      homing.near(m, clustlets[m.id])
    end
  end)

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FIRE_WEAPON and worm.weapon == "px.homing_cluster_bomb" then
      shooter = worm
      local t = worm.target
      target = t and { x = t.x, y = t.y } or nil
      return
    end
    if msg ~= wa.msg.FRAME_FINISH or #bursts == 0 then return end
    local owner = shooter or worm
    local list = bursts
    bursts = {}
    for _, p in ipairs(list) do
      for i = 1, CLUSTLETS do
        local deg = -90 - FAN / 2 + (i - 1) * FAN / (CLUSTLETS - 1)
        local rad = deg * math.pi / 180
        local vx, vy = SPEED * wa.math.cos(rad), SPEED * wa.math.sin(rad)
        if i == MIDDLE then
          vx, vy = vx + nudge(-0.3, 0.3), vy + nudge(-1.7, 1.7)
        else
          vx, vy = vx + nudge(-1.8, 1.8), vy + nudge(-1.7, 1.7)
        end
        launching = true
        local ok, id = pcall(wa.weapons.launch, {
          weapon = "px.homing_cluster_bomb", owner = owner, x = p.x, y = p.y, vx = vx, vy = vy,
          missile = CLUSTLET,
        })
        launching = false
        if ok and id then
          clustlets[id] = homing.new({ x = target and target.x, y = target and target.y,
            speed = HOME.speed, turn = HOME.turn, delay = HOME.delay, frames = HOME.frames,
            sound = HOME.sound, owner = owner })
        end
      end
    end
  end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })
end

return weapon
