-- Bunker Buster and Super Bunker Buster: a digging air strike.

local function placed(ctx)
  local informed = false
  if type(ctx.weapons) == "table" then
    informed = true
    if ctx.weapons[ctx.id] ~= nil then return true end
  end
  if type(ctx.placed) == "table" then
    informed = true
    for _, weapon in ipairs(ctx.placed) do
      if weapon == ctx.id or (type(weapon) == "table" and weapon.id == ctx.id) then return true end
    end
  end
  return not informed
end

local M = {}

function M.install(ctx)
  if not placed(ctx) then
    wa.log(("Bunker Buster: %s is in no panel slot; nothing registered"):format(ctx.id))
    return
  end

  local super_buster = ctx.id == "px.super_bunker_buster"
  local ART = "sprites/" .. (super_buster and "super_bunker_buster/" or "bunker_buster/")
  local SND = "sounds/bunker_buster/" -- both weapons' sounds, PX's two wavs
  local IMPACT_SOUND  = "bunkbustdrill_impact.wav"
  local LOOP_SOUNDS   = { "bunkbustdrill_loop1.wav", "bunkbustdrill_loop2.wav",
                          "bunkbustdrill_loop3.wav", "bunkbustdrill_loop4.wav",
                          "bunkbustdrill_loop5.wav" }
  local IMPACT_FRAMES = 88
  local LOOP_FRAMES   = 88
  local R          = 8
  local SKY        = -128 -- the drop height above the level
  local DIG_SPEED  = 1.15
  local MAGNET_SHARE, MAX_DRILL_FORCE, DIG_MAGNET_FACTOR = 0.4, 0.1, 3
  local DIG_FRAMES = super_buster and 450 or 300
  local MASK_EVERY = 3
  local EDGE       = 6 -- the two probe lines, within the tunnel's edge
  local LOOKAHEAD  = 13
  local ANIM_SPEED = 0.08 -- AnimSpeed over AnimCycleDuration 1.0
  local FRAMES     = 3 -- each sheet is a 3-frame strip
  local SINK, SUNK = 2, 200 -- sinking out of sight in the water
  local FIRE_MIN, FIRE_MAX = 4, 10 -- DrillFireMinDelta/MaxDelta
  local EXPL_DIST  = 40 -- ExplosionDistance
  local EXPL_DELTA = 8 -- ExplosionDeltaTime
  local NUM        = super_buster and 5 or 1 -- NumExplosions
  local BLAST      = super_buster and 80 or 100 -- ExplosionBlast
  local DAMAGE     = super_buster and 26 or 38 -- ExplosionDamage
  local FIRE       = { duration = 1000, up_power = 15, damage = 1 } -- CFireDesc
  local FIRE_TOSS  = { up_min = 100, up_max = 200, drift = 50 } -- hundredths

  local busters = {} -- body actor id -> state

  local function blast(m, x, y)
    local b = wa.actors.spawn({ sprite = ART .. "idle.png", x = x, y = y,
      owner = m.owner, on = function() end })
    b:gfx{ scale = 0 }
    b:explode({ damage = DAMAGE, id = BLAST, below = false })
    if not b.dead then b:remove() end
    if super_buster and m.owner then
      wa.fire.spawn({ owner = m.owner, x = x, y = y, count = 6,
        duration = FIRE.duration, up_power = FIRE.up_power, damage = FIRE.damage })
    end
  end

  local function direction(m, dx, dy)
    local length = math.sqrt(dx * dx + dy * dy)
    if length < 0.0001 then m.dir_x, m.dir_y = 0, 1
    else m.dir_x, m.dir_y = dx / length, dy / length end
  end

  local function remove(m)
    busters[m.body.id] = nil
    if not m.body.dead then m.body:remove() end
    if m.glow and not m.glow.dead then m.glow:remove() end
  end

  local function boom(m)
    if m.boom then return end
    m.boom, m.dig, m.vy, m.num, m.timer = true, false, 0, 0, 0
    m.body:gfx{ scale = 0 }
    if m.glow then m.glow:gfx{ scale = 0 } end
  end

  local function land_ahead(m, edge)
    local x = m.x + m.dir_x * R + m.dir_y * edge
    local y = m.y + m.dir_y * R - m.dir_x * edge
    return wa.land.trace(x, y, x + m.dir_x * LOOKAHEAD, y + m.dir_y * LOOKAHEAD) ~= nil
  end

  local function touched(x0, y0, x1, y1)
    local res = wa.world.trace({ x0 = x0, y0 = y0, x1 = x1, y1 = y1, radius = R,
      with = { "worms", "crates", "oil", "mines" } })
    return res and res.hit
  end

  local function frame_of(m)
    return function(a)
      if m.boom then
        if m.num >= NUM then remove(m) return end
        if m.timer <= 0 then
          local d = EXPL_DIST * m.num
          blast(m, m.x + m.dir_y * d, m.y - m.dir_x * d)
          if m.num > 0 then blast(m, m.x - m.dir_y * d, m.y + m.dir_x * d) end
          m.timer, m.num = EXPL_DELTA, m.num + 1
        end
        m.timer = m.timer - 1
        return
      end

      if m.y >= wa.world.water() then
        m.sunk = true
        m.y = m.y + SINK
        a.x, a.y = m.x, m.y
        a:gfx({ tint = 0x5A5AF0 })
        if m.y >= wa.world.water() + SUNK then remove(m) end
        return
      end

      local px, py = m.x, m.y
      local fx, fy, inside = wa.magnetism.sample(m.x, m.y, a)
      fx, fy = fx * MAGNET_SHARE, fy * MAGNET_SHARE
      if inside and fx == 0 then fx = 0.01 end
      if m.dig then
        local force = math.sqrt(fx * fx + fy * fy)
        if force > MAX_DRILL_FORCE then
          fx, fy = fx * MAX_DRILL_FORCE / force, fy * MAX_DRILL_FORCE / force
        end
        direction(m, 10 * m.dir_x + DIG_MAGNET_FACTOR * fx,
          10 * m.dir_y + DIG_MAGNET_FACTOR * fy)
        if not land_ahead(m, -EDGE) and not land_ahead(m, EDGE) then
          m.dig = false
          local speed = DIG_SPEED * (1 + 2 * (1 - m.dir_y)) -- PX's exit nudge
          m.vx, m.vy = m.dir_x * speed, m.dir_y * speed
        else
          m.vx, m.vy = m.dir_x * DIG_SPEED, m.dir_y * DIG_SPEED
          m.x, m.y = m.x + m.vx, m.y + m.vy
          m.dig_time = m.dig_time - 1 -- the drill's clock, ticking (see DIG_FRAMES)
          if m.dig_time <= 0 then boom(m) return end -- PX: out of fuel -> explode
          m.snd_timer = m.snd_timer - 1
          if m.snd_timer <= 0 then
            wa.sound.play(a, SND .. LOOP_SOUNDS[m.piece])
            m.piece = m.piece % #LOOP_SOUNDS + 1
            m.snd_timer = LOOP_FRAMES
          end
          if super_buster then
            if m.fire_timer <= 0 then
              local drift = wa.random(-FIRE_TOSS.drift, FIRE_TOSS.drift) / 100
              local up = wa.random(FIRE_TOSS.up_min, FIRE_TOSS.up_max) / 100
              wa.fire.spawn({ owner = m.owner, x = m.x - m.dir_x * R, y = m.y - m.dir_y * R, count = 1,
                vx = m.dir_y * drift - m.dir_x * up,
                vy = -m.dir_x * drift - m.dir_y * up,
                duration = FIRE.duration, up_power = FIRE.up_power, damage = FIRE.damage })
              m.fire_timer = wa.random(FIRE_MIN, FIRE_MAX)
            end
            m.fire_timer = m.fire_timer - 1
          end
        end
      else
        m.vx, m.vy = m.vx + fx, m.vy + wa.world.gravity() + fy
        direction(m, m.vx, m.vy)
        local nx, ny = m.x + m.vx, m.y + m.vy
        local tip_x, tip_y = m.dir_x * R, m.dir_y * R
        local hit = wa.land.trace(m.x + tip_x, m.y + tip_y, nx + tip_x, ny + tip_y)
        if hit then
          m.x, m.y = (hit.x or nx + tip_x) - tip_x, (hit.y or ny + tip_y) - tip_y
          m.dig, m.fire_timer = true, 0
          wa.sound.play(a, SND .. IMPACT_SOUND)
          m.piece, m.snd_timer = 1, IMPACT_FRAMES
        else
          m.x, m.y = nx, ny
        end
      end

      m.mask_timer = m.mask_timer - 1
      if m.mask_timer <= 0 then
        m.mask_timer = MASK_EVERY
        if wa.land.solid(m.x, m.y) or wa.land.solid(m.x + m.dir_x * R, m.y + m.dir_y * R) then
          wa.land.cut({ x = m.x, y = m.y, shape = "drill" }) -- PX's masks 1 and 13
        end
      end

      if (px ~= m.x or py ~= m.y) and touched(px, py, m.x, m.y) then boom(m) return end

      a.x, a.y = m.x, m.y
      local sheet = m.dig and (ART .. "digging.png") or (ART .. "idle.png")
      if sheet ~= m.sheet then
        a:look(sheet)
        m.sheet = sheet
      end
      m.anim = (m.anim + ANIM_SPEED) % 1.0 -- PX's AnimCycle
      a:frame(math.min(FRAMES - 1, math.floor(m.anim * FRAMES)))
      local angle = -math.deg(wa.math.atan(m.dir_x, m.dir_y)) -- PX's UpdateRotation
      a:gfx({ angle = angle, depth = wa.depth.OBJECTS + 2 }) -- PX's z 10.01, behind the worms
      if m.glow then
        m.glow.x, m.glow.y = m.x, m.y
        m.glow:gfx({ angle = angle, depth = wa.depth.OBJECTS + 1, blend = "add", tint = 0xFF4600 })
      end
    end
  end

  local function drop(worm, x, y)
    wa.sound.play(worm, SND .. "bunkbustfall.wav") -- PX's fall sound
    local m = { x = x, y = SKY, vx = 0, vy = 0, dir_x = 0, dir_y = 1,
      dig_time = DIG_FRAMES, dig = false, boom = false,
      num = 0, timer = 0, anim = 0, fire_timer = 0, sunk = false, owner = worm,
      mask_timer = 0, snd_timer = 0, piece = 1 } -- both timers fire on the first frame they can
    m.body = wa.actors.spawn({
      sprite = ART .. "idle.png", x = x, y = SKY, vx = 0, vy = 0,
      owner = worm, body = {},
      on = frame_of(m),
    })
    if super_buster then
      m.glow = wa.actors.spawn({ sprite = ART .. "glow.png", x = x, y = SKY,
        owner = worm, on = function() end })
    end
    busters[m.body.id] = m
    return m
  end

  local sprites = { ART .. "idle.png", ART .. "digging.png" }
  if super_buster then sprites[#sprites + 1] = ART .. "glow.png" end

  local spec = {
    wep = super_buster and "weps/super_bunker_buster.wep" or "weps/bunkerbuster_wep1.wep",
    panel_icon = ART .. "icon.png",
    sprites = sprites,
    params = { gpu_prefix = "sprites/" },
    sounds = { SND .. IMPACT_SOUND, SND .. LOOP_SOUNDS[1], SND .. LOOP_SOUNDS[2],
      SND .. LOOP_SOUNDS[3], SND .. LOOP_SOUNDS[4], SND .. LOOP_SOUNDS[5],
      SND .. "bunkbustfall.wav" },
    on_select = { cursor = true },
    on_click = function(ev)
      if wa.world.cavern() then
        wa.log("Bunker Buster: no drop on a cavern map")
        return
      end
      drop(ev.worm, ev.x, ev.y)
    end,
  }
  wa.weapons.replace(spec)
end

return M
