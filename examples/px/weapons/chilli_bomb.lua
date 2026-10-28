-- Chilli Bomb: record, art and behaviour.
local holds = require("wf-lib/holds")
local weapon = {}

local children = {} -- Missile IDs: these explode without launching more children.
local pending = {} -- Parent explosion positions, processed after the blast.
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

-- Thrown parent only. Its explosion launches the five CHILDREN below in Lua.
weapon.definition = {
  copy_from = "stock.super_banana",
  name = "Chilli Bomb",
  panel_icon = "sprites/chilli_bomb/chilli_ico.png",
  sprite = "banana",
  on_explode = on_explode,
  handling = {
    retreat = 3000,
  },
  missile = {
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

-- Scripted children are missiles of this weapon, not native cluster bits.
-- They inherit the parent's flight physics, then use these stage settings.
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
      decay_mode = "resting",
    },
    sprite = 0, -- Only the chilli's custom art is drawn.
  },
}

weapon.missile_sprite = { -- Chilli Bomb (chilli_bomb_anim) and the five it bursts into
  sheet = "sprites/px_hold/chilli_bomb.png", frames = 1,
  spin = true, -- its record's WAT_Rotation
  -- WA's own sprite 0, as PX's record has it: nothing under the chilli.
  hide = true,
}

function weapon.setup()
  --
  -- PX's pyro_grenades_script (PyroMan), on WA's super banana. When a Chilli
  -- Bomb explodes, five more Chillis burst out of it, straight up with a
  -- random spread (PX's ShotClustlets): real WA missiles of the same slot,
  -- each with damage 30, an 8 s fuse, no countdown, the fire key setting it
  -- off, and a burst of fire where it ends. The five do not burst again: a
  -- missile PX's script makes has no weapon of its own (weap), so its
  -- ExplodeAt skips the Chilli's branch.
  --
  -- Not ported: PX's particle trail and the sparks while aiming
  -- (pxparticles), and the smoke trail's power of 20 on the five. PX also
  -- writes the five's changes into the weapon's own launch data, so every
  -- later Chilli Bomb flies with them; the port changes the five only.

  children, pending, shooter = {}, {}, nil

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FIRE_WEAPON and worm.weapon == "px.chilli_bomb" then
      shooter = worm
    elseif msg == wa.msg.FRAME_FINISH and #pending > 0 then
      -- After the blast, as the Double Bazooka's second shell.
      local owner = shooter or worm
      for _, p in ipairs(pending) do
        for _ = 1, CHILDREN.count do
          -- RandomFloat(3, -3), then RandomFloat(-7, -10).
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
