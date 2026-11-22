-- Attack Helicopter: click a target; a helicopter strafes in from off the map and guns it down.

local trail = require("lib/px_trail")

return {
  defaults = {
    ammo = { round_start = -1 },
    delay = 0,
  },
  install = function(ctx)
    trail.install()
    local BULLETS        = ctx.option("bullets") -- PX bulletCount, default 17
    local ENTER_Y        = -288 -- spawn height, above the map
    local SIDE           = 500 -- spawn offset past the map edge
    local HOVER          = 15 -- entry/hover speed
    local SHOOT_RANGE    = 450 -- begin firing within this of the target
    local COOLDOWN_START = 40 -- wind-up before the first shot
    local COOLDOWN_SHOT  = 4 -- frames between shots
    local BULLET_SPEED   = 35 -- homeToPlace speed (, "35.0")
    local BULLET_FRAMES  = 3 -- homeToPlace runs this long
    local BULLET_FUSE    = 3000 -- timeBeforeExplosion, the longest a round flies
    local EXIT_MARGIN    = 3 -- frames a round flies on past a side of the map
    local MUZZLE         = 22
    local BLAST_DAMAGE   = 80 -- Weap->launch.explosion.damage
    local BLAST_KIND     = 100 -- big blast (PX's pushPower 120 has no field here)
    local DEAD_DAMAGE    = 25 -- TakeExplosionDamage -> Collide above this
    local DRIFT          = 0.984 -- SpX damping while shooting
    local LEAVE          = 1.082 -- SpX growth after the magazine
    local TURN           = 0.75 -- gunAngle interpolation
    local ROTOR_TICKS    = 47 -- heli2Wav loop period
    local HALF_PI        = math.pi / 2
    local CASING_FRAMES  = 16
    local CASING_LIFE    = 100 -- p->SetLifeTime
    local CASING_JITTER  = 17 -- RandomFloat(-0.3, 0.3) rad, in degrees
    local CASING_SPEED_MIN, CASING_SPEED_MAX = 200, 300 -- 2.0 .. 3.0, hundredths
    local FLIP_AIM, FLIP_GUN = true, true

    local ART = "sprites/attack_helicopter/"
    local BULLET = "sprites/bullet.png" -- the redWeapSheet bullet PX draws itself
    local SND = "sounds/attack_helicopter/"

    local helis = {} -- body actor id -> helicopter state
    local shots = {}
    local shot_heard

    local function trunc(n) return n < 0 and math.ceil(n) or math.floor(n) end

    local frame, hit

    local function update_aim(h, spawned)
      local instant = wa.math.atan(h.ty - h.y, math.abs(h.tx - h.x)) -- atan2(dy, |dx|)
      if instant > HALF_PI then instant = HALF_PI end
      if instant < -math.pi then instant = -math.pi end
      if spawned then
        h.gun = instant
      else
        h.gun = h.gun + (instant - h.gun) * TURN
      end
      local n = (h.gun + math.pi) / (math.pi * 1.5) -- 0.0 to 1.0
      if n < 0 then n = 0 elseif n > 1 then n = 1 end
      h.worm_frame = math.floor((1 - n) * 31)
    end

    local function update_rot(h)
      local fast = h.vx < -14 or h.vx > 14
      local slow = h.vx > -14 and h.vx < 14
      if h.dir >= 0 then
        if fast and h.shots < BULLETS then
          h.rot = 0.3
        elseif slow and h.shots < BULLETS then
          if h.rot > -0.115 then h.rot = h.rot - 0.01 end
        elseif h.shots >= BULLETS then
          if h.rot < 0.3 then h.rot = h.rot + 0.01 end
        end
      else
        if fast and h.shots < BULLETS then
          h.rot = -0.3
        elseif slow and h.shots < BULLETS then
          if h.rot < 0.115 then h.rot = h.rot + 0.01 end
        elseif h.shots >= BULLETS then
          if h.rot > -0.3 then h.rot = h.rot - 0.01 end
        end
      end
    end

    local function place(h)
      local a, aim, gun = h.body, h.aim, h.gun_actor
      local right = h.dir >= 0
      local face = right and -1 or 1
      local aface = FLIP_AIM and -face or face -- the worm's own mirror
      local gface = FLIP_GUN and -face or face -- the gun's own mirror
      a.x, a.y, a.vx, a.vy, a.facing = h.x, h.y, 0, 0, face
      a:frame(h.frame)
      a:gfx({ angle = math.deg(h.rot) % 360, depth = wa.depth.OBJECTS + 2 })

      local gx = h.x + (right and 5 or -5)
      aim.x, aim.y, aim.facing = gx - 2, h.y + 6, aface
      aim:frame(h.worm_frame)
      aim:gfx({ angle = math.deg(h.rot * 0.9) % 360, depth = wa.depth.OBJECTS + 1 })

      local final = right and h.gun or (math.pi - h.gun) -- mirror left
      gun.x, gun.y, gun.facing = gx, h.y + 12, gface
      gun:frame(h.firing and 1 or 0)
      gun:gfx({ angle = -math.deg(HALF_PI + final) % 360, depth = wa.depth.OBJECTS })
    end

    local function despawn(a)
      if a and not a.dead then a:remove() end
    end
    local function drop(h)
      helis[h.body.id] = nil
      despawn(h.aim)
      despawn(h.gun_actor)
      despawn(h.body)
    end

    local function boom(h)
      if h.owner then
        for _, f in ipairs({ { -3, -1 }, { 3, 20 }, { 0, -3 } }) do
          wa.fire.spawn({
            owner = h.owner, x = h.x + f[1], y = h.y + f[2],
            count = 7, duration = 1500, up_power = 55, damage = 9,
          })
        end
      end
      h.body:explode({ damage = BLAST_DAMAGE, id = BLAST_KIND, below = false })
      drop(h)
    end

    local casings = {} -- in the order they left: { x, y, vx, vy, g, born }
    local function eject(h)
      local ang = h.gun + HALF_PI + math.rad(wa.random(-CASING_JITTER, CASING_JITTER))
      local speed = wa.random(CASING_SPEED_MIN, CASING_SPEED_MAX) / 100
      local now = wa.world.frame()
      while casings[1] and now - casings[1].born >= CASING_LIFE do table.remove(casings, 1) end
      casings[#casings + 1] = {
        x = h.x, y = h.y + 10, -- PX: PosX, PosY + 10
        vx = wa.math.cos(ang) * speed, vy = wa.math.sin(ang) * speed,
        g = wa.world.gravity(), born = now,
      }
    end

    local function in_box(o, l, r, t, b)
      return o.x > l and o.x < r and o.y > t and o.y < b
    end

    local function find_worm(h, l, r, t, b)
      local pick, count = nil, 0
      for _, w in ipairs(wa.worms.all()) do
        if w.hp > 0 and w.id ~= h.owner.id and in_box(w, l, r, t, b) then
          count = count + 1
          if wa.random(1, count) == 1 then pick = w end
        end
      end
      return pick
    end

    local function find_any(l, r, t, b)
      local pick, count = nil, 0
      for _, group in ipairs({ wa.worms, wa.mines, wa.crates, wa.oil }) do
        if group then
          for _, o in ipairs(group.all()) do
            if (o.kind ~= "worm" or o.hp > 0) and in_box(o, l, r, t, b) then
              count = count + 1
              if wa.random(1, count) == 1 then pick = o end
            end
          end
        end
      end
      return pick
    end

    local function clear(h, o)
      return wa.land.trace(math.floor(h.x), math.floor(h.y),
        math.floor(o.x), math.floor(o.y)) == nil
    end

    local function pick_target(h)
      local tx, ty = h.tx, h.ty
      local function is_cur(o) return o.kind == "worm" and o.id == h.owner.id end

      local worm = find_worm(h, tx - 130, tx + 130, ty - 70, ty + 80)
      if worm and clear(h, worm) then
        return worm.x, worm.y
      end
      local obj = find_any(tx - 130, tx + 130, ty - 50, ty + 70)
      local visible = obj and not is_cur(obj) and clear(h, obj)
      if not visible then
        if h.dir < 0 then -- PX regDir < 0: check underneath
          obj = find_any(h.x - 30, tx + 80, ty - 90, ty + 120)
        else
          obj = find_any(tx - 80, h.x + 30, ty - 90, ty + 120)
        end
        visible = obj and not is_cur(obj) and clear(h, obj)
      end
      if visible then
        return obj.x, obj.y
      end
      return tx, ty
    end

    local function fuse_ms(sx, sy, tx, ty)
      local dx, dy = tx - sx, ty - sy
      local len = math.sqrt(dx * dx + dy * dy)
      if len == 0 then return BULLET_FUSE end
      local vx = dx / len * BULLET_SPEED
      local w = wa.world.size().w
      local frames
      if vx < -0.01 then
        frames = sx / -vx
      elseif vx > 0.01 then
        frames = (w - sx) / vx
      else
        return BULLET_FUSE
      end
      frames = math.max(frames, 0) + EXIT_MARGIN
      return math.min(BULLET_FUSE, (math.floor(frames) + 1) * 20)
    end

    local function shoot(h)
      local right = h.dir >= 0
      local gx = h.x + (right and 5 or -5) -- the gun's anchor x
      local final = right and h.gun or (math.pi - h.gun)
      local ang = -(HALF_PI + final) -- the gun's drawn angle, radians
      local gface = right and 1 or -1 -- the gun's own mirror
      local lx, ly = gface * 1, -MUZZLE -- tip in the sheet, from its centre
      local cos, sin = wa.math.cos(ang), wa.math.sin(ang)
      local sx = gx + cos * lx - sin * ly
      local sy = (h.y + 12) + sin * lx + cos * ly
      local tx, ty = pick_target(h)
      tx = tx + wa.random(-1, 1)
      local ok, id = pcall(wa.weapons.launch, {
        weapon = "stock.bazooka", owner = h.owner, x = sx, y = sy, vx = 0, vy = 0,
        missile = { trail = { sprite = 0 }, explosion = { power = 13 },
          fuse = fuse_ms(sx, sy, tx, ty), gravity_pct = 0, wind_pct = 0 },
      })
      if not ok then
        if tostring(id):find("object pool is full", 1, true) then return false end
        error(id, 0)
      end
      if id then
        local now = wa.world.frame()
        for _, old in ipairs(wa.sorted(shots)) do
          local r = shots[old]
          if now - (r.seen or r.born) > 1 then
            trail.drop(old)
            shots[old] = nil
          end
        end
        shots[id] = { x = tx, y = ty, frames = BULLET_FRAMES, owner = h.owner, born = now }
        trail.add(id, h.owner,  {every = 1, g = 30, b = 10}) -- the round's trail, drawn by lib/px_trail.lua
      end
      h.firing = true
      local pick = wa.random(1, 3)
      local now = wa.world.frame()
      if not shot_heard or now - shot_heard >= COOLDOWN_SHOT then
        shot_heard = now
        wa.sound.play(h.owner, SND .. "hks" .. pick .. ".wav")
      end
      eject(h) -- the casing, after the shot
      return true
    end

    frame = function(a)
      local h = helis[a.id]
      if not h then return end
      local w = wa.world.size().w

      if (h.vx >= 0 and h.x >= w + SIDE + 50) or (h.vx < 0 and h.x < -(SIDE + 50)) then
        drop(h)
        return
      end
      if h.done and h.y >= wa.world.water() and h.x < w + 300 and h.x > -300 then
        boom(h)
        return
      end

      update_rot(h)

      if not h.shooting and h.shots < BULLETS then
        update_aim(h, false)
        if math.abs(h.x - h.tx) < SHOOT_RANGE then
          update_aim(h, true)
          h.cooldown = COOLDOWN_START
          h.shooting = true
        end
      end
      if h.shots >= BULLETS and h.shooting then
        h.shooting = false
        h.vx = h.dir * 0.15
      end
      if h.shooting then h.vx = h.vx * DRIFT end

      h.firing = false
      if h.shooting and h.cooldown == 0 then
        update_aim(h, false)
        if shoot(h) then h.shots = h.shots + 1 end
        h.cooldown = COOLDOWN_SHOT
      elseif h.shooting and h.cooldown > 0 then
        update_aim(h, false)
        h.cooldown = h.cooldown - 1
      end
      if h.shots >= BULLETS and not h.shooting then
        h.done = true
        if math.abs(h.vx) < HOVER then h.vx = h.vx * LEAVE end
      end

      h.x = h.x + h.vx
      h.frame = (h.frame + 1) % 2
      h.ticks = h.ticks + 1
      if h.ticks % ROTOR_TICKS == 0 then wa.sound.play(h.owner, SND .. "loop.wav") end
      place(h)
    end

    hit = function(a, event)
      local h = helis[a.id]
      if not h then return end
      local dmg = math.max(0, event.damage or 0)
      if event.kind == "blast" and dmg > 0 then
        local dx, dy = a.x - (event.x or a.x), a.y - (event.y or a.y)
        dmg = trunc((1 - (dx * dx + dy * dy) / (dmg * dmg * 4)) * dmg)
      end
      if dmg > DEAD_DAMAGE then boom(h) end
    end

    local function fire(worm, x, y)
      if not worm or not x or not y then return end
      local w = wa.world.size().w
      local from_left = (worm.facing or 1) <= 0
      local h = {
        owner = worm, tx = x, ty = y,
        dir = from_left and 1 or -1, -- the direction it drifts
        x = from_left and -SIDE or (w + SIDE),
        y = ENTER_Y,
        vx = (from_left and 1 or -1) * HOVER,
        shots = 0, cooldown = 0, shooting = false, done = false, firing = false,
        gun = -math.pi, worm_frame = 0, rot = 0, frame = 0, ticks = 0,
      }
      h.body = wa.actors.spawn({
        sprite = ART .. "empty.png", x = h.x, y = h.y, vx = 0, vy = 0,
        owner = worm, body = { hits = { land = true, worms = true } },
        on = { frame = frame, hit = hit },
      })
      h.aim = wa.actors.spawn({ sprite = ART .. "aim.png", x = h.x, y = h.y,
        owner = worm, on = function() end })
      h.gun_actor = wa.actors.spawn({ sprite = ART .. "gun.png", x = h.x, y = h.y,
        owner = worm, on = function() end })
      helis[h.body.id] = h
    end

    wa.weapons.replace({
      available_in_caves = false,
      wep = "weps/bullet_wep.wep",
      panel_icon = "sprites/helishootico.png", -- PX's icon
      sprites = { ART .. "empty.png", ART .. "aim.png", ART .. "gun.png", ART .. "casing.png", BULLET,
        trail.BEAM, trail.GLOW },
      params = { gpu_prefix = "sprites/" }, -- route the sheets into the GPU atlas for a:gfx
      sounds = { SND .. "hks1.wav", SND .. "hks2.wav", SND .. "hks3.wav", SND .. "loop.wav" },
      on_select = { cursor = true },
      on_click = function(ev) fire(ev.worm, ev.x, ev.y) end,
    })

    wa.on.missile_frame(function(m)
      local s = shots[m.id]
      if not s then return end
      if m.phase == "pre" then
        m.sprite = 0 -- WA draws nothing for it; ours is drawn below
        if s.frames <= 0 then return end
        s.frames = s.frames - 1
        local dx, dy = s.x - m.x, s.y - m.y
        local len = math.sqrt(dx * dx + dy * dy)
        if len > 0 then
          m.vx, m.vy = dx / len * BULLET_SPEED, dy / len * BULLET_SPEED
        end
        return
      end
      s.px, s.py = s.cx or m.x, s.cy or m.y
      s.cx, s.cy, s.vx, s.vy = m.x, m.y, m.vx, m.vy
      s.seen = wa.world.frame()
    end)

    local CORNERS = { { -1, -1 }, { 1, -1 }, { 1, 1 }, { -1, 1 } }
    local QUAD = { points = { {}, {}, {}, {} }, blend = "alpha" }
    local function put(sheet, frame, x, y, half, rot, flip, depth)
      local c, sn = math.cos(rot), math.sin(rot)
      QUAD.sprite, QUAD.frame, QUAD.depth = sheet, frame, depth
      for i, k in ipairs(CORNERS) do
        local dx, dy = k[1] * flip * half, k[2] * half
        QUAD.points[i][1] = x + (dx * c - dy * sn)
        QUAD.points[i][2] = y + (dx * sn + dy * c)
      end
      wa.draw.quad(QUAD)
    end
    local CASING = wa.sprites.key(ART .. "casing.png")
    local BULLET_SHEET = wa.sprites.key(BULLET)
    wa.on.draw(function()
      local now, f = wa.world.frame(), wa.draw.fraction()
      for _, c in ipairs(casings) do
        local age = now - c.born
        if age < CASING_LIFE then
          local t = age + f
          put(CASING, age % CASING_FRAMES, c.x + c.vx * t,
            c.y + c.vy * t + c.g * t * (t + 1) / 2, 30, 0, 1, wa.depth.BEHIND_TERRAIN)
        end
      end
      for _, id in ipairs(wa.sorted(shots)) do
        local r = shots[id]
        if r.seen and now - r.seen <= 1 then
          put(BULLET_SHEET, 0, r.cx + (r.cx - r.px) * f, r.cy + (r.cy - r.py) * f, 16,
            -math.atan(r.vx, r.vy) - math.pi, r.vx < 0 and -1 or 1, wa.depth.OBJECTS - 1)
        end
      end
    end)
  end,
}
