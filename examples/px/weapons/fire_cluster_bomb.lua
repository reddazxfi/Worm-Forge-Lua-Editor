-- Fire Cluster Bomb: a grenade that bursts into five clustlets, each bursting into fire.

local weapon = {}

local ART = "sprites/fire_cluster/"
local CLUSTLET_SPRITE = 54 -- the stock cluster bit's, which the clustlets fly with
local CLUSTLETS = 5

weapon.record = {
  missile = {
    sprite = 0, -- WA draws no round; the art spec draws it
    burst = "nothing",
    impact_particles = false,
    bounce = {
      hits = {
        crates = true,
        donor_cards = true,
        land = true,
        objects = true,
        water = true,
        worms = true,
        worms_frozen = true,
      },
    },
    explosion = {
      bias = 0,
      power = 20,
      push_pct = 20,
    },
  },
}

-- What a clustlet changes in the grenade's record: it bursts into fire after a second.
local CLUSTLET = {
  sprite = CLUSTLET_SPRITE,
  fuse = 1000,
  countdown = 0,
  explosion = { bias = 1 },
  trail = { sprite = 131, power = 20, speed = 100 },
  burst = "fire",
  fire = {
    spread_generations = 10,
    spread_delay_ms = 30,
    burn_time_ms = 1500,
    decay_mode = "instant",
  },
}

weapon.missile_sprite = {
  { sheet = ART .. "bullet.png", frames = 1, spin = true, hide = true, first_sprite = 0 },
  { sheet = ART .. "clustlet.png", frames = 1, spin = true, hide = true,
    first_sprite = CLUSTLET_SPRITE },
}

local clustlets = {}
local bursts = {}
local shooter

local function on_explode(ev)
  local id = ev.missile
  if not id then return end
  if clustlets[id] then
    clustlets[id] = nil
  else
    bursts[#bursts + 1] = { x = ev.x, y = ev.y }
  end
end

function weapon.definition()
  local sdk = require("wf-lib/holds")
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.grenade",
    name = "Fire Cluster Bomb",
    panel_icon = ART .. "fire_cluster_ico.png",
    hold_as = "stock.grenade",
    on_explode = on_explode,
    worm_sprites = sdk.PX_POSTURE,
    sprites = { ART .. "bullet.png", ART .. "clustlet.png" },
    hold = {
      thrown = true,
      sheet = ART .. "bullet.png", hand_type = 1, hand_radius = 16,
      weap_rotation = 0.5, weap_radius = 9,
      hand = sdk.PX_HANDS[1],
    },
  })
end

function weapon.setup()
  clustlets, bursts, shooter = {}, {}, nil

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FIRE_WEAPON and worm.weapon == "px.fire_cluster_bomb" then
      shooter = worm
      return
    end
    if msg ~= wa.msg.FRAME_FINISH or #bursts == 0 then return end
    local owner = shooter or worm
    for _, p in ipairs(bursts) do
      for _ = 1, CLUSTLETS do
        local vx = wa.random(-196608, 196608) / 65536
        local vy = wa.random(-655360, -458752) / 65536
        local id = wa.weapons.launch({
          weapon = "px.fire_cluster_bomb", owner = owner, x = p.x, y = p.y, vx = vx, vy = vy,
          missile = CLUSTLET,
        })
        if id then clustlets[id] = true end
      end
    end
    bursts = {}
  end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })
end

return weapon
