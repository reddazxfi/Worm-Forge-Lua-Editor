-- Digging Cluster Bomb: a grenade that digs through land and bursts into five digging clustlets, each bursting into fire.

local weapon = {}

local ART = "sprites/digging_cluster/"
local GRENADE_SPRITE = 50 -- the stock grenade sprite, which the bomb shows while it digs
local CLUSTLET_SPRITE = 54 -- the stock cluster bit's, which the clustlets fly with
local DIG_SOUND = 65574 -- the Mole Bomb's digging sound

weapon.record = {
  missile = {
    sprite = 0, -- WA draws no round; the art spec draws it
    action = "dig",
    animation = 2,
    burst = "nothing",
    -- WA draws these while it digs; the pack's art covers them.
    dig = {
      sound = DIG_SOUND,
      dive_sprite = GRENADE_SPRITE,
      sprite_1 = GRENADE_SPRITE,
      sprite_2 = GRENADE_SPRITE,
      sprite_3 = GRENADE_SPRITE,
    },
    ends_on_contact = {
      crates = true,
      donor_cards = true,
      objects = true,
      worms_normal = true,
    },
    explosion = {
      bias = 0,
      power = 20,
      push_pct = 20,
    },
  },
}

-- What a clustlet changes in the grenade's record: it digs on and bursts
-- into fire after two and a half seconds.
local CLUSTLET = {
  sprite = CLUSTLET_SPRITE,
  fuse = 2500,
  countdown = 0,
  explosion = { bias = 1 },
  trail = { sprite = 131, power = 20, speed = 100 },
  dig = {
    sound = DIG_SOUND,
    dive_sprite = CLUSTLET_SPRITE,
    sprite_1 = CLUSTLET_SPRITE,
    sprite_2 = CLUSTLET_SPRITE,
    sprite_3 = CLUSTLET_SPRITE,
  },
  burst = "fire",
  fire = {
    spread_generations = 10,
    spread_delay_ms = 30,
    burn_time_ms = 1500,
    decay_mode = "instant",
  },
}

-- PX's five clustlet speeds, in pixels/frame: up, up-right, up-left, down-right, down-left.
local SPEEDS = { { 0, -10 }, { 5, -6 }, { -5, -6 }, { 6, 4 }, { -6, 6 } }

weapon.missile_sprite = {
  { sheet = ART .. "bullet.png", frames = 1, hide = true, first_sprite = 0 },
  -- PX draws each clustlet as the bomb itself.
  { sheet = ART .. "bullet.png", frames = 1, hide = true, first_sprite = CLUSTLET_SPRITE },
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
    name = "Digging Cluster Bomb",
    panel_icon = ART .. "digging_cluster_ico.png",
    hold_as = "stock.grenade",
    on_explode = on_explode,
    worm_sprites = sdk.PX_POSTURE,
    sprites = { ART .. "bullet.png" },
    hold = {
      thrown = true,
      sheet = ART .. "bullet.png", hand_type = 1, hand_radius = 18,
      weap_rotation = 0.5, weap_radius = 9,
      hand = sdk.PX_HANDS[1],
    },
  })
end

function weapon.setup()
  clustlets, bursts, shooter = {}, {}, nil

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FIRE_WEAPON and worm.weapon == "px.digging_cluster_bomb" then
      shooter = worm
      return
    end
    if msg ~= wa.msg.FRAME_FINISH or #bursts == 0 then return end
    local owner = shooter or worm
    for _, p in ipairs(bursts) do
      for _, v in ipairs(SPEEDS) do
        local id = wa.weapons.launch({
          weapon = "px.digging_cluster_bomb", owner = owner, x = p.x, y = p.y, vx = v[1], vy = v[2],
          missile = CLUSTLET,
        })
        if id then clustlets[id] = true end
      end
    end
    bursts = {}
  end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })
end

return weapon
