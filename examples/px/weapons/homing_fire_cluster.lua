-- Homing Fire Cluster: a thrown grenade that homes on the clicked target and bursts into five fire clustlets.

local weapon = {}

local ART = "sprites/homing_fire_cluster/"
local CLUSTLET_SPRITE = 54 -- the stock cluster bit's, which the clustlets fly with
local CLUSTLETS = 5
local PUSH, DAMAGE = 50, 35 -- the extra blast of each clustlet

weapon.record = {
  missile = {
    sprite = 0, -- WA draws no round; the art spec draws it
    action = "homing",
    animation = 2,
    countdown = 0,
    fuse = 4000,
    burst = "nothing",
    ends_on_contact = {
      crates = true,
      donor_cards = true,
      land = true,
      objects = true,
      water = true,
      worms = true,
      worms_frozen = true,
    },
    explosion = {
      bias = 0,
      push_pct = 75,
    },
    homing = {
      animation = 0,
      arm = 500,
      kind = "lock",
      sprite = 135,
      time = 3000,
      trail = {
        power = 20,
        speed = 100,
        sprite = 116,
      },
    },
  },
}

-- What a clustlet changes in the grenade's record: it bounces as the stock
-- grenade does and bursts into fire after a second.
local CLUSTLET = {
  action = "bounce",
  sprite = CLUSTLET_SPRITE,
  fuse = 1000,
  countdown = 0,
  explosion = { power = 20, bias = 1 },
  trail = { sprite = 131, power = 20, speed = 100 },
  bounce = {
    hits = {
      crates = true,
      donor_cards = true,
      land = true,
      objects = true,
      water = true,
      worms_acting = true,
      worms_frozen = true,
      worms_jumping = true,
      worms_normal = true,
    },
    bounciness = 0,
    terrain_keep_speed_pct = 100,
    sound = 113,
    contact_sides = 8,
    extra_reverse_chance_pct = 0,
    explosion = { bias = 0, push_pct = 0, power = 0, variation = 0 },
    max_bounces = 0,
  },
  burst = "fire",
  fire = {
    spread_generations = 10,
    spread_delay_ms = 30,
    burn_time_ms = 1500,
    decay_mode = "instant",
  },
}

weapon.missile_sprite = {
  { sheet = ART .. "bullet.png", frames = 1, hide = true, first_sprite = 0 },
  { sheet = ART .. "clustlet.png", frames = 1, hide = true, first_sprite = CLUSTLET_SPRITE },
}

local clustlets = {}
local bursts = {}
local blasts = {}
local shooter

local function on_explode(ev)
  local id = ev.missile
  if not id then return end
  if clustlets[id] then
    clustlets[id] = nil
    blasts[#blasts + 1] = { x = ev.x, y = ev.y }
  else
    bursts[#bursts + 1] = { x = ev.x, y = ev.y }
  end
end

function weapon.definition()
  local sdk = require("wf-lib/holds")
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.grenade",
    name = "Homing Fire Cluster",
    panel_icon = ART .. "homing_fire_cluster_ico.png",
    hold_as = "stock.grenade",
    on_explode = on_explode,
    worm_sprites = sdk.PX_POSTURE,
    sprites = { ART .. "bullet.png", ART .. "clustlet.png" },
    params = { gpu_prefix = ART },
    hold = {
      thrown = true,
      sheet = ART .. "bullet.png", hand_type = 1, hand_radius = 17,
      hand_scale = 0.8, weap_rotation = -0.5, weap_radius = 9,
      hand = sdk.PX_HANDS[1],
    },
  })
end

function weapon.setup()
  clustlets, bursts, blasts, shooter = {}, {}, {}, nil

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FIRE_WEAPON and worm.weapon == "px.homing_fire_cluster" then
      shooter = worm
      return
    end
    if msg ~= wa.msg.FRAME_FINISH then return end
    local owner = shooter or worm
    for _, p in ipairs(bursts) do
      for _ = 1, CLUSTLETS do
        local vx = wa.random(-196608, 196608) / 65536
        local vy = wa.random(-655360, -458752) / 65536
        local id = wa.weapons.launch({
          weapon = "px.homing_fire_cluster", owner = owner, x = p.x, y = p.y, vx = vx, vy = vy,
          missile = CLUSTLET,
        })
        if id then clustlets[id] = true end
      end
    end
    bursts = {}
    for _, p in ipairs(blasts) do
      local a = wa.actors.spawn({ sprite = false, x = p.x, y = p.y,
        owner = owner, on = function() end })
      a:explode({ id = PUSH, damage = DAMAGE, below = false })
      a:remove()
    end
    blasts = {}
  end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })
end

return weapon
