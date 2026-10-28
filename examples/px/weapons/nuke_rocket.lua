-- Nuke Rocket: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  fires = {
    launch_power_pct = 5,
    method = 2,
  },
  missile = {
    action = "bounce",
    alarm_worms = true,
    animation = 2,
    bounce = {
      bounciness = 30,
      contact_sides = 8,
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
      sound = 113,
    },
    collision_shape = 2,
    ends_on_contact = {},
    explosion = {
      power = 0,
      push_pct = 70,
    },
    flight_sound = 65602,
    fuse = 3000,
    gravity_pct = 100,
    speed_pct = 100,
    trail = {
      bubbles_per_second = 12.5,
      speed = 100,
      sprite = 131,
    },
  },
  clusters = {
    bit = {
      action = "bounce",
      animation = 1,
      bounce = {
        bounciness = 1,
        contact_sides = 8,
      },
      ends_on_contact = {
        crates = true,
        donor_cards = true,
        land = true,
        mines = true,
        objects = true,
        water = true,
        worms = true,
        worms_frozen = true,
      },
      explosion = {
        power = 20,
        push_pct = 25,
      },
      fuse = 7770,
      gravity_pct = 100,
      speed_pct = 100,
      sprite = 54,
      sprite_count = 1,
      trail = {
        bubbles_per_second = 12.5,
        speed = 100,
        sprite = 131,
      },
    },
    count = 5,
    spread = 30,
  },
}

function weapon.definition()
  local shared = require("lib/shared")
  local sdk = require("wf-lib/holds")
  local PX_POSTURE, PX_HANDS = sdk.PX_POSTURE, sdk.PX_HANDS
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.mine",
    name = "Nuke Rocket",
    panel_icon = "sprites/nuke_rocket/nuke_rocket_ico.png",
    sprite = "sprites/nuke_rocket/nuke_rocket_bullet.png",
    on_explode = function(ev) shared.nuke_rocket_explode(ev) end,
    -- The engine draws its PX sprite-builder hold from PX_HOLDS:
        -- the record's own sprite is PX-only, which left WA no sheet to draw
        -- the worm with.
        worm_sprites = PX_POSTURE,
    sprites = {
          "sprites/px_hold/nuke_rocket.png",
        },
    sounds = { "sounds/nuke_rocket_launch.wav" },
    params = { gpu_prefix = "sprites/px_hold/" },
    hold = { -- Nuke Rocket (nuke_rocket_anim): held at a fixed angle, not
        -- the aim's (dont_rotate_with_angle), and placed, so never put away.
        thrown = true,
        sheet = "sprites/px_hold/nuke_rocket.png", hand_type = 2, hand_radius = 13.0,
        hand_rotation = -0.6, hand_radial_rotation = -0.95, hand_scale = 1.0,
        weap_rotation = 0.45, weap_radial_rotation = 1.0, weap_radius = 8.5,
        static = { weap = -0.1, hand = 0.4 }, -- ang_if_static, hand_ang_if_static
        hand = PX_HANDS[2],
    },
  })
end

function weapon.setup()
  local shared = require("lib/shared")

  -- ------------------------------------------------------------ Nuke Rocket
  do
  --
  -- PX's nuke_rocket_script, on the mine slot. The scheme's record is a
  -- placed weapon that WA fires as a missile (fire type 2, method 2:
  -- CreateWeaponProjectile), and it already has every value PX's FireFinal
  -- gives its first rocket (a 3 s fuse, damage 0, bias 50, push 70, sound
  -- 66). So WA's own shot is PX's first rocket: it fuses on the ground,
  -- hissing (sound 66 every 10 frames). When it explodes, a nuke climbs out
  -- of it: a real WA missile of the same slot (wa.weapons.launch, as PX's
  -- MakeNuke creates a CMissile), silent, with a 1.6 s fuse, bursting into
  -- the record's clustlets. For 53 frames it climbs, randomly and jittering
  -- sideways, and carries worms and missiles within 17 pixels along; then
  -- it brakes. Its explosion adds PX's two 40/40 blasts and sounds 85, 70.
  -- PX's build of 28.09.2026 gives the nuke reddaz's bounce physics, with
  -- restitution 0.11; here it keeps 11% of its speed when it hits terrain
  -- (the record's terrain friction, 0 on WA's Mine record: it stopped dead).
  -- The fusing rocket keeps the record's 0 and stays where it lands.
  --
  -- Not ported: PX's particle trails, and carrying mines, crates, oil drums
  -- and bowling balls (their speed is not writable from Lua).
  local NR_HISS = 66    -- the fusing rocket's hiss, every 10 frames
  local NR_CLIMB = 53   -- frames the nuke climbs (PX: "1.1-1.2 second")
  local NR_CARRY = 17   -- pixels: what the climbing nuke carries along
  local NUKE = { fuse = 1600, sound = 0, burst = "clusters", terrain_keep_speed_pct = 11,
    clusters = { launch_power_pct = 33, power_variation_pct = 33 } }
  local NUKE_BLAST = { damage = 40, id = 40 } -- PX's DoExplosion(x, y, 40, 40), twice

  local nr_first = {}    -- missile id -> frames: a first rocket, fusing
  local nr_speed = {}    -- missile id -> { vx, vy } at its last frame
  local nr_nuke = {}     -- missile id -> frames flown: a nuke
  local nr_climbing = {} -- nuke id -> { x, y, vx, vy }, while it climbs
  local nr_pending = {}  -- nukes to launch once the rocket's blast is over
  local nr_shooter       -- the worm that fired (PX's ClWT / ClWN)
  local nr_owner = {}    -- missile id -> its worm, for a rocket nobody fired (an oil drum's)
  local nr_expect        -- fired: the next mine-slot missile is the rocket

  local function near(ax, ay, bx, by)
    local r = NR_CARRY
    return math.abs(ax - bx) < r and math.abs(ay - by) < r
  end

  wa.on.missile_frame(function(m)
    local t = nr_nuke[m.id]
    if t ~= nil then
      -- Before WA moves it, as PX's M_FRAME runs before super.
      if m.phase ~= "pre" then
        return
      end
      -- Retain the original lottery and RNG draw count; convert its speed to pixels.
      if t < NR_CLIMB then
        m.vy = m.vy - wa.random(19661, 52429) / 65536 -- 0.3 to 0.8 a frame
        if t % 2 == 1 then
          m.vx = m.vx + wa.random(-19661, 19661) / 65536 -- up to 0.3 either way
        end
        nr_climbing[m.id] = { x = m.x, y = m.y, vx = m.vx, vy = m.vy }
        for _, w in ipairs(wa.worms.all()) do
          if near(w.x, w.y, m.x, m.y) then
            w.vx, w.vy = m.vx, m.vy
          end
        end
      else
        nr_climbing[m.id] = nil
        if m.vy < 0 then
          m.vy = m.vy + 0.1999969482421875 -- 0.2: slows the climb without faking gravity
        end
      end
      nr_nuke[m.id] = t + 1
      return
    end
    -- The rocket is the missile WA fires after the fire key. Later ones of
    -- the slot (the nuke's cluster bits) are no rockets.
    if nr_first[m.id] == nil and nr_expect and m.weapon == "px.nuke_rocket" then
      nr_first[m.id], nr_expect = 0, false
    end
    if nr_first[m.id] ~= nil then
      if m.phase == "post" then
        nr_speed[m.id] = { m.vx, m.vy }
        local n = (nr_first[m.id] or 0) + 1
        nr_first[m.id] = n
        local owner = nr_owner[m.id] or nr_shooter
        if n % 10 == 0 and owner then
          wa.sound.play(owner, NR_HISS)
        end
      end
      return
    end
    -- Any other missile a climbing nuke passes is carried along.
    if m.phase == "pre" then
      for _, c in pairs(nr_climbing) do
        if near(m.x, m.y, c.x, c.y) then
          m.vx, m.vy = c.vx, c.vy
        end
      end
    end
  end)

  -- PX's nuke oil drum (oildrums.txt): a first rocket, as the weapon's own
  -- shot but fired for `owner` from (x, y), climbing into a nuke when its
  -- fuse runs out. The weapon's record is PX's first rocket. Its id, nil
  -- when WA made none.
  shared.nuke_rocket_first = function(owner, x, y, vx, vy)
    local id = wa.weapons.launch({ weapon = "px.nuke_rocket", owner = owner, x = x, y = y, vx = vx, vy = vy })
    if id then
      nr_first[id], nr_owner[id] = 0, owner
    end
    return id
  end

  shared.nuke_rocket_explode = function(ev)
    local id = ev.missile
    if not id then
      return
    end
    if nr_nuke[id] then
      nr_nuke[id], nr_climbing[id] = nil, nil
      local owner = nr_owner[id] or nr_shooter
      nr_owner[id] = nil
      if owner then
        wa.sound.play(owner, 85)
        wa.sound.play(owner, 70) -- "louder please :D"
        for _ = 1, 2 do
          wa.actors.spawn({
            sprite = false, x = ev.x, y = ev.y, owner = owner,
            explode = { damage = NUKE_BLAST.damage, id = NUKE_BLAST.id, now = true },
          })
        end
      end
      return
    end
    if nr_first[id] then
      local speed = nr_speed[id] or { 0, 0 }
      nr_first[id], nr_speed[id] = nil, nil
      local owner = nr_owner[id] or nr_shooter
      nr_owner[id] = nil
      if owner then
        wa.sound.play(owner, "sounds/nuke_rocket_launch.wav")
      end
      -- Launched after the blast, as PX's comes after super.
      nr_pending[#nr_pending + 1] = { x = ev.x, y = ev.y, vx = speed[1], vy = speed[2], owner = owner }
    end
  end

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FIRE_WEAPON and worm.weapon == "px.nuke_rocket" then
      nr_shooter, nr_expect = worm, true
    elseif msg == wa.msg.FRAME_FINISH and #nr_pending > 0 then
      for _, p in ipairs(nr_pending) do
        local owner = p.owner or nr_shooter or worm
        local id = wa.weapons.launch({
          weapon = "px.nuke_rocket", owner = owner, x = p.x, y = p.y, vx = p.vx, vy = p.vy,
          missile = {
            fuse = NUKE.fuse, flight_sound = NUKE.sound, burst = NUKE.burst,
            bounce = { terrain_keep_speed_pct = NUKE.terrain_keep_speed_pct },
          },
          -- The first rocket has no payload; only this stage ejects clusters.
          clusters = NUKE.clusters,
        })
        nr_nuke[id] = 0
        nr_owner[id] = owner
      end
      nr_pending = {}
    end
  end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })
  end
end

return weapon
