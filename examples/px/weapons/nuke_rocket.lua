-- Nuke Rocket: a placed rocket that fuses, then launches a nuke that bursts into clusters.

local weapon = {}

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
        worm_sprites = {
          weaponlnk = sdk.PX_LEVEL.weaponlnk, weaponlnku = sdk.PX_LEVEL.weaponlnku,
          weaponlnkd = sdk.PX_LEVEL.weaponlnkd,
          wthrow = PX_POSTURE.wthrow, wthrowu = PX_POSTURE.wthrowu, wthrowd = PX_POSTURE.wthrowd,
        },
    sprites = {
          "sprites/px_hold/nuke_rocket.png",
        },
    sounds = { "sounds/nuke_rocket_launch.wav" },
    params = { gpu_prefix = "sprites/px_hold/" },
    hold = {
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
  local own_time = require("wf-lib/own_time")

  do
  local NR_HISS = 66 -- the fusing rocket's hiss, every 10 frames
  local NR_CLIMB = 53 -- frames the nuke climbs (PX: "1.1-1.2 second")
  local NR_CARRY = 17 -- pixels: what the climbing nuke carries along
  local NUKE = { fuse = 1600, sound = 0, burst = "clusters", terrain_keep_speed_pct = 11,
    clusters = { launch_power_pct = 33, power_variation_pct = 33 } }
  local NUKE_BLAST = { damage = 40, id = 40 } -- PX's DoExplosion(x, y, 40, 40), twice

  local nr_first = {} -- missile id -> frames: a first rocket, fusing
  local nr_speed = {} -- missile id -> { vx, vy } at its last frame
  local nr_nuke = {} -- missile id -> frames flown: a nuke
  local nr_climbing = {} -- nuke id -> { x, y, vx, vy }, while it climbs
  local nr_pending = {} -- nukes to launch once the rocket's blast is over
  local nr_shooter_id -- the id of the worm that fired (PX's ClWT / ClWN)
  local nr_owner = {}
  local nr_expect -- fired: the next mine-slot missile is the rocket

  local NO_TEAM = 0

  local function keep(owner)
    return owner.kind == "worm" and owner.id or NO_TEAM
  end

  local function near(ax, ay, bx, by)
    local r = NR_CARRY
    return math.abs(ax - bx) < r and math.abs(ay - by) < r
  end

  local function owner_of(id)
    if id == NO_TEAM then return nil end
    local turn, any
    for _, w in ipairs(wa.worms.all()) do
      if w.id == id then return w end
      if w.turn then turn = w end
      any = any or w
    end
    return turn or any
  end

  local function owner_at(id, x, y)
    if id == NO_TEAM then return shared.no_team_owner(x, y) end
    return owner_of(id)
  end

  wa.on.missile_frame(function(m)
    local t = nr_nuke[m.id]
    if t ~= nil then
      if m.phase ~= "pre" then
        return
      end
      if t < NR_CLIMB then
        m.vy = m.vy - wa.random(19661, 52429) / 65536 -- 0.3 to 0.8 a frame
        if t % 2 == 1 then
          m.vx = m.vx + wa.random(-19661, 19661) / 65536 -- up to 0.3 either way
        end
        nr_climbing[m.id] = { x = m.x, y = m.y, vx = m.vx, vy = m.vy }
        for _, w in ipairs(wa.worms.all()) do
          if near(w.x, w.y, m.x, m.y) then
            local k = own_time.scale(w)
            if k <= 0 then k = 1 end
            w.vx, w.vy = m.vx / k, m.vy / k
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
    if nr_first[m.id] == nil and nr_expect and m.weapon == "px.nuke_rocket" then
      nr_first[m.id], nr_expect = 0, false
    end
    if nr_first[m.id] ~= nil then
      if m.phase == "post" then
        nr_speed[m.id] = { m.vx, m.vy }
        local n = (nr_first[m.id] or 0) + 1
        nr_first[m.id] = n
        local id = nr_owner[m.id] or nr_shooter_id
        if n % 10 == 0 and id and id ~= NO_TEAM then
          wa.sound.play(owner_of(id), NR_HISS)
        end
      end
      return
    end
    if m.phase == "pre" then
      for _, c in pairs(nr_climbing) do
        if near(m.x, m.y, c.x, c.y) then
          m.vx, m.vy = c.vx, c.vy
        end
      end
    end
  end)

  shared.nuke_rocket_first = function(owner, x, y, vx, vy)
    local id = wa.weapons.launch({ weapon = "px.nuke_rocket", owner = owner, x = x, y = y, vx = vx, vy = vy })
    if id then
      nr_first[id], nr_owner[id] = 0, keep(owner)
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
      local owner_id = nr_owner[id] or nr_shooter_id
      nr_owner[id] = nil
      local owner = owner_id and owner_at(owner_id, ev.x, ev.y)
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
      local owner_id = nr_owner[id] or nr_shooter_id
      nr_owner[id] = nil
      if owner_id and owner_id ~= NO_TEAM then
        wa.sound.play(owner_of(owner_id), "sounds/nuke_rocket_launch.wav")
      end
      nr_pending[#nr_pending + 1] = { x = ev.x, y = ev.y, vx = speed[1], vy = speed[2], owner = owner_id }
    end
  end

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FIRE_WEAPON and worm.weapon == "px.nuke_rocket" then
      nr_shooter_id, nr_expect = worm.id, true
    elseif msg == wa.msg.FRAME_FINISH and #nr_pending > 0 then
      local pending = nr_pending
      nr_pending = {}
      for _, p in ipairs(pending) do
        local owner = owner_at(p.owner or nr_shooter_id, p.x, p.y) or worm
        local id = wa.weapons.launch({
          weapon = "px.nuke_rocket", owner = owner, x = p.x, y = p.y, vx = p.vx, vy = p.vy,
          missile = {
            fuse = NUKE.fuse, flight_sound = NUKE.sound, burst = NUKE.burst,
            bounce = { terrain_keep_speed_pct = NUKE.terrain_keep_speed_pct },
          },
          clusters = NUKE.clusters,
        })
        if id then
          nr_nuke[id] = 0
          nr_owner[id] = keep(owner)
        end
      end
    end
  end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })
  end
end

return weapon
