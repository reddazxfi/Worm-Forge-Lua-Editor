-- Visuals from weapon_zones, p_animation and pxparticles in the supplied
-- 28.09.2026 PX build. These particles are Lua drawing data, with a private
-- random stream: they neither consume WA's RNG nor create collision bodies.
-- Sprite Packs/Misc exports use palette index 0 for transparency. mcrate0
-- actually contains 61 frames (utils_pyroman's NUM_FRAMES table says 64).
local zone = require("lib/px_zone")
local M = { ROOT = "sprites/zone_fx/", FADE = 150 }
M.HEAL, M.DAMAGE, M.AIM_DAMAGE, M.GLOW = M.ROOT .. "mcrate0.png",
  M.ROOT .. "fallout.png", M.ROOT .. "wormhit2.png", M.ROOT .. "glow.png"
local particles, driver, installed, seed = {}, nil, false, 1729
local LIMIT = 256

local function random()
  seed = (seed * 16807) % 2147483647
  return seed / 2147483647
end

local function colour(alpha, value)
  local v = math.floor(value)
  return (math.floor(alpha) << 24) | (v << 16) | (v << 8) | v
end

-- CAnimation's speed is a normalized phase increment, speed / 1000 per
-- game frame, not frames per second. Its backwards flag plays out and back.
function M.frame(timer, speed, frames)
  local phase = (timer * speed / 1000) % 2
  if phase > 1 then phase = 2 - phase end
  return math.min(frames - 1, math.floor(phase * frames))
end

function M.opacity(z)
  return 1 - math.min(1, (z.fade or 0) / M.FADE)
end

function M.faded(colour_word, z)
  return (math.floor((colour_word >> 24) * M.opacity(z)) << 24) | (colour_word & 0xFFFFFF)
end

local function step()
  local wind, gravity = wa.world.wind(), wa.world.gravity()
  for i = #particles, 1, -1 do
    local p = particles[i]
    p.age = p.age + 1
    if p.age >= p.life then
      table.remove(particles, i)
    else
      p.x, p.y = p.x + p.vx, p.y + p.vy
      p.vx = p.vx / (1 + p.drag) + p.wind * wind
      p.vy = p.vy / (1 + p.drag) + p.gravity * gravity
    end
  end
end

local function emit(sheet, x, y, aim, glow, owner)
  if y >= wa.world.water() or #particles >= LIMIT then return end
  if not driver then
    -- Worm-message and missile callbacks do not inherit a spawn owner. Start
    -- the updater before adding any particles: a rejected spawn must not leave
    -- frozen quads that accumulate until LIMIT blocks later shots.
    if not owner then return end
    driver = wa.actors.spawn({ sprite = false, x = x, y = y, owner = owner,
      gravity = false, collide = false,
      on = function(a)
        step()
        if #particles == 0 then driver = nil; a:despawn() end
      end })
  end
  local speed, heading = -3 - random() * 4, random() * 2 * math.pi
  local damaging_aim = aim and sheet == M.AIM_DAMAGE
  particles[#particles + 1] = {
    sheet = sheet, x = x, y = y, age = 0,
    vx = glow and 0 or speed * wa.math.cos(heading),
    vy = glow and 0 or speed * wa.math.sin(heading),
    angle = random() * 2.31,
    life = glow and 10 or (aim and 20 or 40),
    drag = aim and 1 or (glow and 1 or 0.5),
    wind = (aim or glow) and 0 or 2, gravity = aim and -1.5 or 0,
    alpha = (aim or glow) and 150 or 255,
    end_alpha = aim and 30 or 50, brightness = aim and 160 or 120,
    size = glow and 0.3 or (aim and (damaging_aim and 0.75 or 0.5) or 1),
    end_size = glow and 0.15 or (aim and (damaging_aim and 0.3 or 0.2) or 0.3),
    frames = glow and 1 or (sheet == M.HEAL and 61 or (damaging_aim and 10 or 32)),
    pixels = glow and 128 or 60, anim = aim and 0.02 or 0.05,
  }
end

local function flight_owner()
  local worms = wa.worms.all()
  for _, worm in ipairs(worms) do
    if worm.turn then return worm end
  end
  -- Missiles may still fly during retreat, after the active-turn flag clears.
  -- This invisible updater only needs a live parent; it never deals damage.
  return worms[1]
end

function M.install()
  if installed then return end
  installed = true
  wa.assets.load({ sprites = { M.HEAL, M.DAMAGE, M.AIM_DAMAGE, M.GLOW }, gpu_prefix = M.ROOT })
  wa.on.draw(function()
    for _, p in ipairs(particles) do
      local t = p.age / p.life
      zone.mark(p.sheet, p.x, p.y, p.pixels * (p.size + (p.end_size - p.size) * t),
        p.angle, colour(p.alpha + (p.end_alpha - p.alpha) * t, p.brightness * (1 - t)),
        "add", wa.depth.EFFECTS, math.floor((p.age * p.anim % 1) * p.frames))
    end
  end)
end

-- utils_pyroman/trail_effects: animated stock sprite each frame, plus the
-- tazer's lightning glow (the same original sheet used by Portal Gun) every
-- other frame. No gameplay RNG is advanced by either effect.
function M.flight(weapon, healing)
  local count = 0
  wa.on.missile_frame(function(m)
    if m.weapon ~= weapon or m.phase ~= "post" then return end
    count = count + 1
    local owner = not driver and flight_owner() or nil
    emit(healing and healing() and M.HEAL or M.DAMAGE, m.x, m.y, false, false, owner)
    if count % 2 == 0 then emit(M.GLOW, m.x, m.y, false, true, owner) end
  end)
end

-- health_zone_anim::OverrideDefaultWeapAnims, only while aiming/charging.
function M.aim(worm, healing)
  local angle = worm.aim * math.pi * -worm.facing
  emit(healing and M.HEAL or M.AIM_DAMAGE,
    worm.x + wa.math.sin(angle) * 22, worm.y - wa.math.cos(angle) * 12, true, false, worm)
end

return M
