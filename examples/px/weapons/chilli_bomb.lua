-- Chilli Bomb: a super banana that bursts into five chillis, each bursting into fire.

local holds = require("wf-lib/holds")
local weapon = {}

local children = {}
local pending = {}
local shooter

local function on_explode(ev)
  local id = ev.missile
  if not id then return end
  if children[id] then
    children[id] = nil
    return
  end
  pending[#pending + 1] = { x = ev.x, y = ev.y }
end

weapon.definition = {
  copy_from = "stock.super_banana",
  name = "Chilli Bomb",
  panel_icon = "sprites/chilli_bomb/chilli_ico.png",
  hold_as = "stock.super_banana",
  on_explode = on_explode,
  handling = {
    retreat = 3000,
  },
  missile = {
    sprite = 0, -- WA draws no round; the art spec draws it
    alarm_worms = true,
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
    },
    burst = "nothing",
    countdown = 5000,
    explode_on_space = false, -- The parent uses its fuse; children enable Space.
    explosion = {
      power = 50,
      push_pct = 75,
    },
    fuse = 0,
  },
  worm_sprites = holds.PX_POSTURE,
  sprites = { "sprites/px_hold/chilli_bomb.png" },
  params = { gpu_prefix = "sprites/px_hold/" },
  hold = {
    thrown = true,
    sheet = "sprites/px_hold/chilli_bomb.png", hand_type = 1, hand_radius = 13,
    hand_scale = 0.8, weap_rotation = 0.5, weap_radius = 9,
    hand = holds.PX_HANDS[1],
  },
}

local CHILDREN = {
  count = 5,
  missile = {
    explosion = { power = 30 },
    fuse = 8000,
    countdown = 0,
    explode_on_space = true,
    burst = "fire",
    fire = {
      spread_delay_ms = 30,
      burn_time_ms = 1500,
      spread_generations = 10,
      decay_mode = "instant",
    },
    sprite = 0, -- Only the chilli's custom art is drawn.
  },
}

weapon.missile_sprite = {
  sheet = "sprites/px_hold/chilli_bomb.png", frames = 1,
  spin = true, -- its record's WAT_Rotation
  hide = true,
}

function weapon.setup()

  children, pending, shooter = {}, {}, nil

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FIRE_WEAPON and worm.weapon == "px.chilli_bomb" then
      shooter = worm
    elseif msg == wa.msg.FRAME_FINISH and #pending > 0 then
      local owner = shooter or worm
      for _, p in ipairs(pending) do
        for _ = 1, CHILDREN.count do
          local vx = wa.random(-196608, 196608) / 65536
          local vy = wa.random(-655360, -458752) / 65536
          local id = wa.weapons.launch({
            weapon = "px.chilli_bomb", owner = owner, x = p.x, y = p.y, vx = vx, vy = vy,
            missile = CHILDREN.missile,
          })
          children[id] = true
        end
      end
      pending = {}
    end
  end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })
end

return weapon
