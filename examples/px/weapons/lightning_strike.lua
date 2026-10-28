-- Lightning Strike: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  handling = {
    ends_turn = true,
  },
}

function weapon.definition()
  local shared = require("lib/shared")
  return require("lib/weapon").merge(weapon.record, {
    wep = "weps/napalm_strike.wep",
    panel_icon = "sprites/lightning/icon.png",
    -- With the Electric Grenade's arc and zap sheets: both weapons' effects
        -- are GPU sheets under this prefix.
        sprites = {
          "sprites/lightning/beam.png", "sprites/lightning/glow.png", "sprites/lightning/cloud.png",
          "sprites/electric_grenade/explosion.png", "sprites/electric_grenade/tazed1.png",
          "sprites/electric_grenade/tazed2.png",
        },
    sounds = { "sounds/lightning/thunder.wav", "sounds/lightning/hit.wav" },
    params = { gpu_prefix = "sprites/" },
    -- Click-only dispatch keeps the strike's cursor and turn handling.
        on_select = { cursor = true },
    -- The engine ends WA's prefire after a click-only fire. (A closure:
        -- lightning_click is defined further down.)
        on_click = function(ev) shared.lightning_click(ev) end,
  })
end

weapon.requires = { "weapons/sniper_rifle", "weapons/electric_grenade", "lib/electrical" }

function weapon.setup()
  local shared = require("lib/shared")
  local turret = require("lib/turret")
  local current_worm, held = shared.current_worm, shared.held
  local c = require("lib/electrical").context()
  local sq = c.sq
  local ELECTRIC_DEPTH = c.ELECTRIC_DEPTH
  local BEAM = c.BEAM
  local GLOW = c.GLOW
  local CLOUD = c.CLOUD
  local CLOUD_DEPTH = c.CLOUD_DEPTH
  local GRENADE_BURST = c.GRENADE_BURST
  local strikes = c.strikes
  local arcs = c.arcs
  local tazed = c.tazed
  local effect_actor = c.effect_actor
  local electrical_targets = c.electrical_targets
  local target_radius = c.target_radius
  local electrical_trace = c.electrical_trace
  local revived_by_lightning = shared.revived_by_lightning

  -- Half the width of the line along the beam that strikes what it touches:
  -- the drawn beam wavers about it, so anything whose body is within 4 pixels
  -- of the straight line from the beam's top to where it ends is struck too.
  local STRIKE_HALF_WIDTH = 4

  -- Whether `obj` is struck: on the beam's line, from its top to its end, or
  -- (when the beam hit something) about where it ended.
  local function struck(s, obj, length)
    local ox, oy = obj.x - s.sx, obj.y - s.sy
    local along = ox * s.dirx + oy * s.diry
    local across = math.abs(ox * s.diry - oy * s.dirx)
    if along >= 0 and along <= length and across <= STRIKE_HALF_WIDTH + target_radius(obj) then
      return true
    end
    if not s.hit then return false end
    local dx, dy = obj.x - s.ex, obj.y - s.ey
    local r = target_radius(obj) + 6
    return dx * dx + dy * dy <= r * r
  end

  local function strike_hit(s)
    if shared.zap_bowling_balls then shared.zap_bowling_balls(s.ex, s.ey) end
    if s.hit then turret.capture_hit(s.sentry, s.ex, s.ey, s.alliance) end
    local length = math.sqrt(sq(s.ex - s.sx) + sq(s.ey - s.sy))
    -- Everything the line and the end can reach, in WA's entity order: within
    -- half the line, its width and the largest body (9) of the middle.
    local targets = wa.world.electrical_nearby
      and wa.world.electrical_nearby((s.sx + s.ex) / 2, (s.sy + s.ey) / 2,
        math.ceil(length / 2) + STRIKE_HALF_WIDTH + 9 + 6, true)
      or electrical_targets(true)
    for _, obj in ipairs(targets) do
      if struck(s, obj, length) then
        if obj.kind == "worm" then
          if not revived_by_lightning[obj.id] then obj:heal(25) end
        elseif obj.kind == "grave" then
          if obj.worm_id ~= 0 then
            local id = obj.worm_id
            local worm = obj:revive(id, 10)
            if worm then
              revived_by_lightning[worm.id] = true
              if shared.restore_lightning_inventory then
                shared.restore_lightning_inventory(worm)
              end
            else
              -- Refused: a living worm holds its place (a Reinforcement takes a
              -- dead worm's), as when the team has eight. Reinforcement's error
              -- sound, from the grave: the strike's thrower may be gone by now.
              wa.sound.play(obj, "sounds/gravity_control/error.wav")
            end
          end
        elseif obj.kind == "mine" then
          obj:arm(obj.fuse < 0 and wa.random(1000, 5000) or obj.fuse)
        elseif obj.kind == "crate" or obj.kind == "oil" then
          obj:hit(100, 0, 0)
        end
      end
    end
  end

  -- PX's cloud: every second frame of the strike's life a puff of WA's large
  -- cloud, tinted a dark bluish grey, is thrown out from the top of the beam
  -- and slowed by the air; a core puff (100 frames, 1.2x to 0.6x) until the
  -- strike is spent, a surrounding one (140 frames, 1x to nothing) until the
  -- strike is gone. Each fades in from nothing. Also PX's sparks: while the
  -- beam holds, a glow thrown from where it hit, falling. Both are advanced
  -- here, once per game frame, from the strike's own generator, and only drawn
  -- below; nothing else reads them.
  local function strike_rand(s)
    s.seed = (s.seed * 1103515245 + 12345) % 0x80000000
    return s.seed / 0x80000000
  end

  local function strike_puff(s, life, drag, s0, s1)
    local xvel = strike_rand(s) * 2 - 1
    local yvel = 1 - xvel * xvel
    s.cloud[#s.cloud + 1] = { x = s.sx, y = s.sy, vx = 16 * xvel,
      vy = (strike_rand(s) * 9 - 8) * yvel, drag = drag, age = 0, life = life, s0 = s0, s1 = s1 }
  end

  local function strike_particles(s)
    if s.tail > 0 then
      s.cloud_timer = s.cloud_timer - 1
      if s.cloud_timer <= 0 then
        if s.life > 0 then strike_puff(s, 100, 0.3, 1.2, 0.6) end
        strike_puff(s, 140, 0.15, 1.0, 0.01)
        s.cloud_timer = 2
      end
      if s.delay == 0 and s.life > 0 and s.hit then
        local a = strike_rand(s) * 2 * math.pi
        local v = (1 + strike_rand(s) * 2)
        s.sparks[#s.sparks + 1] = { x = s.ex, y = s.ey, vx = wa.math.cos(a) * v, vy = wa.math.sin(a) * v, age = 0 }
      end
    end
    for i = #s.cloud, 1, -1 do
      local p = s.cloud[i]
      p.age = p.age + 1
      if p.age >= p.life then
        table.remove(s.cloud, i)
      else
        p.x, p.y = p.x + p.vx, p.y + p.vy
        p.vx, p.vy = p.vx * (1 - p.drag), p.vy * (1 - p.drag)
      end
    end
    for i = #s.sparks, 1, -1 do
      local p = s.sparks[i]
      p.age = p.age + 1
      if p.age >= 50 then
        table.remove(s.sparks, i)
      else
        p.x, p.y, p.vy = p.x + p.vx, p.y + p.vy, p.vy + 1 / 8
      end
    end
  end

  shared.lightning_click = function(ev)
    -- PX's direction: from the left unless the shot's x speed, which WA's
    -- arrow keys set, is negative (lightningstrike.txt: SpX < 0 -> -DirX).
    local dirx = 0.5 * ((ev.vx or 0) < 0 and -1 or 1)
    local diry = math.sqrt(3) / 2
    local sy = -270
    local sx = (ev.x - (ev.y - sy) * dirx / diry)
    local hit = electrical_trace(sx, sy, dirx, diry)
    local ex, ey = hit and hit.x or sx + (300 * dirx),
      hit and hit.y or sy + (300 * diry)
    -- A bowling ball on the way stops the beam, as PX's does.
    local bx, by = nil, nil
    if shared.bowling_ball_on_beam then
      local reach = math.sqrt(sq(ex - sx) + sq(ey - sy))
      bx, by = shared.bowling_ball_on_beam(sx, sy, dirx, diry, reach)
    end
    if bx then ex, ey, hit = bx, by, { x = bx, y = by } end
    -- With no stock hit, scripted sentries can still stop the full ray.
    local reach = hit and math.sqrt(sq(ex - sx) + sq(ey - sy)) or 10000
    local tx, ty, sentry = turret.on_beam(sx, sy, dirx, diry, reach)
    if tx then ex, ey, hit = tx, ty, { x = tx, y = ty } end
    local distance = math.sqrt(sq(ex - sx) + sq(ey - sy))
    if hit and distance > 300 then
      sx, sy = ex - (300 * dirx), ey - (300 * diry)
    end
    local s = { sx = sx, sy = sy, ex = ex, ey = ey, hit = hit, dirx = dirx, diry = diry,
      delay = 150, life = 16, tail = 60, owner = ev.worm, alliance = ev.worm.alliance,
      sentry = sentry, ticks = 0,
      seed = (ex // 1 * 7919 + ey // 1) % 0x80000000, cloud_timer = 0, cloud = {}, sparks = {} }
    strikes[#strikes + 1] = s
    wa.sound.play(ev.worm, "sounds/lightning/thunder.wav")
    effect_actor(ex, ey, ev.worm, function(a)
      s.ticks = s.ticks + 1
      strike_particles(s)
      if s.delay > 0 then
        s.delay = s.delay - 1
        if s.delay == 0 then wa.sound.play(a, "sounds/lightning/hit.wav") end
      elseif s.life > 0 then
        s.life = s.life - 1
        if s.life == 0 then strike_hit(s) end
      elseif s.tail > 0 then
        s.tail = s.tail - 1
      elseif #s.cloud == 0 and #s.sparks == 0 then
        for i, held in ipairs(strikes) do
          if held == s then table.remove(strikes, i); break end
        end
        a:despawn()
      end
    end)
  end
end

return weapon
