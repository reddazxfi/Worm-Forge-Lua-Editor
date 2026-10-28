-- PyroMan's turrets (Project X's p_turrets library: turretbase.txt's
-- CTurretBase), on lib/turret.lua's body: planted where the worm stands,
-- health, capture, its death blast. This is the brain and the look.
--
-- Each frame of a running turn clock, with ammo left, a turret picks a moving
-- enemy worm (each one in range with a 30% chance, from WA's RNG), waits 15
-- frames, then turns its head toward a lobbed shot: the speed that reaches the
-- worm in `flight` frames under gravity times `g_factor`. Aligned and
-- reloaded, it traces that arc with a 3-pixel circle against the land; when
-- blocked it keeps the worm (65%) with another flight time, or drops it.
-- Otherwise it fires its weapon's `shoot` at the solved speed plus a random
-- 0 to 63/96. Flight times cycle (+10, x1.1, back to 16 past 100); the time
-- between shots starts at `fire_rate_ms` (PX's 20 frames) and grows by
-- `fire_increase_pct` a shot (PX's x1.12), and ammo is per turn. Angles are PX's: radians
-- from straight up, toward the side it faces (`dir`).
--
-- Differences: PX's turret is an oil drum's shape dropped 50 pixels above
-- the worm; ours is planted as the sentries are, with the drum's radius-9
-- circle. PX darkens the whole head as health falls; ours also shows the
-- sentries' health digits.
local turret = require("lib/turret")
local mask = require("lib/sentry_mask")
local health_label = require("lib/sentry_health")

local pyro = {}

local ART = "sprites/pyro_turrets/"
local SND = "sounds/pyro_turrets/"
pyro.SHEET = ART .. "turrets.png"
pyro.AMMO_PETROL = ART .. "ammo_petrol.png"
pyro.AMMO_FLAME = ART .. "ammo_flame.png"
local AIM_SOUND, SETUP_SOUND = SND .. "turret_aim.wav", SND .. "turret_setup.wav"

-- pyr_turrets.png's frames (PX's index x 13), and the same frames mirrored
-- 14 on, for a head facing left (PX's flipped sprite).
pyro.FRAMES = {
  mine = { head = 0, base = 1 },
  petrol = { head = 2, base = 3 },
  ballista = { head = 4, base = 5 },
  flame = { head = 6, base = 8 },
}
local MIRROR, RETICLE = 14, 13

-- PX's turret centre (PosX, PosY) sits R above our bottom anchor.
local R = 9
local rows = {}
for dy = -2 * R, 0 do
  local d, half = dy + R, 0
  while (half + 1) * (half + 1) + d * d <= R * R do half = half + 1 end
  rows[#rows + 1] = { dy, -half, half }
end
pyro.feet = mask.build(rows, 2 * R, -R, R, 0)

-- PX's z planes: its weapon's sprite in front, then the head, then the base
-- and the aiming reticle, all in front of the worms (13).
local Z_AMMO, Z_HEAD, Z_BASE = 0xA0000, 0xB0000, 0xC0000

local FRAME_MS = 20 -- WA's 50 frames a second

-- PX tints by the team's colour, each channel at least 128: the sentries'
-- colours (red to cyan, worm.alliance + 1), so lifted.
local TINTS = { 0xFF8080, 0x8080FF, 0x80FF80, 0xE6E680, 0xE680E6, 0x80E6E6 }

local BASE = {
  tower_offset = 25,  -- pixels from the centre up to the head's pivot
  tower_len = 10,     -- from the pivot to the muzzle
  g_factor = 1,       -- the gravity its aim assumes
  thinking = 15,      -- frames between finding a worm and aiming
  min_px = 40, sensor_px = 350, lost_px = 450,
  speed = 0.08,       -- radians a frame the head turns
  fire_rate_ms = 400,     -- between its first two shots a turn (PX's 20 frames)
  fire_increase_pct = 12, -- how much longer each next wait is
  aim_sound_gap = 180,
  health = 50, explode_damage = 50,
}

local installed = false
function pyro.install()
  if installed then return end
  installed = true
  wa.assets.load({ sprites = { pyro.SHEET, pyro.AMMO_PETROL, pyro.AMMO_FLAME },
    sounds = { AIM_SOUND, SETUP_SOUND } })
end

local function centre(a) return a.x, a.y - R end

local function worm_by_id(id)
  for _, w in ipairs(wa.worms.all()) do
    if w.id == id then return w end
  end
end

-- PX's moving worm: walking, or any speed. A worm whose position changed
-- since the last frame walked.
local function note_motion(s)
  for _, w in ipairs(wa.worms.all()) do
    local p, x, y = s.seen[w.id], w.x, w.y
    local moving = w.vx ~= 0 or w.vy ~= 0
    if p then
      p.moving = moving or p.x ~= x or p.y ~= y
      p.x, p.y = x, y
    else
      s.seen[w.id] = { x = x, y = y, moving = moving }
    end
  end
end

-- CTurretBase::FindTarget: every living, moving enemy within range gets a 30%
-- chance; the last taken wins. An invisible one ends the search (PX's break).
local function find_target(t, a, s)
  local cx, cy = centre(a)
  local py = cy - t.tower_offset
  for _, w in ipairs(wa.worms.all()) do
    local seen = s.seen[w.id]
    if w.alliance ~= s.alliance and seen and seen.moving and w.hp > 0 then
      if w.visible == false then break end
      local dx, dy = w.x - cx, w.y - py
      local d = math.sqrt(dx * dx + dy * dy)
      if d >= t.min_px and d < t.sensor_px and wa.random(0, 99) < 30 then s.tid = w.id end
    end
  end
end

-- GetShootAngle: the start speed (rx, ry) that reaches the worm in `flight`
-- frames (Project X's SolveBallistic), its angle from up and its side.
local function solve(t, a, s, target)
  local cx, cy = centre(a)
  local tm = s.flight
  local rx = (target.x - cx) / tm
  local y = target.y - (cy - t.tower_offset)
  local g = wa.world.gravity() * t.g_factor
  local ry = (2 * y - g * tm * tm) / (2 * tm)
  if rx > 0 then
    s.want, s.dir = wa.math.atan(rx, -ry), 1
  else
    s.want, s.dir = wa.math.atan(-rx, -ry), -1
  end
  s.power = math.sqrt(rx * rx + ry * ry)
  s.lrx, s.lry = rx, ry
end

-- AimToEnemy: drop a worm beyond `lost_px`, else turn toward the shot; true
-- once aligned.
local function aim(t, a, s, target)
  local cx, cy = centre(a)
  local dx, dy = target.x - cx, target.y - cy
  local dist = math.sqrt(dx * dx + dy * dy)
  if dist > t.lost_px then s.tid = nil; return false end
  if t.aim_time then s.flight = t.aim_time(dist) end
  solve(t, a, s, target)
  if math.abs(s.want - s.ta) > t.speed * 2 then
    if s.want > s.ta then s.ta = s.ta + t.speed else s.ta = s.ta - t.speed end
    return false
  end
  s.ta = s.want
  return true
end

-- UpdateTime: the next flight time to try.
local function next_flight(s)
  s.flight = (s.flight + 10) * 1.1
  if s.flight > 100 then s.flight = 16 end
end

-- CheckTrace (Project X's BTrace): the arc from the pivot, a frame a step,
-- against the land only.
local function blocked(t, a, s)
  local x, y = centre(a)
  y = y - t.tower_offset
  local vx, vy = s.lrx, s.lry
  local g = wa.world.gravity() * t.g_factor
  for _ = 1, math.floor(s.flight - 1) do
    if wa.world.collides({ x = x, y = y, radius = 3, with = { "terrain" }, ignore = { a } }) then
      return true
    end
    x, y, vy = x + vx, y + vy, vy + g
  end
  return false
end

-- ShootAtEnemy's first test: nothing within 3 pixels of the muzzle.
function pyro.muzzle_clear(a, shot)
  return not wa.world.collides({ x = shot.x, y = shot.y, radius = 3,
    with = { "terrain", "worms", "mines", "crates", "oil", "graves" }, ignore = { a } })
end

-- Its launch speed: the solved one less 0.1, plus 0 to 63/96 from WA's RNG.
function pyro.force(s)
  return s.power - 0.1 + wa.random(0, 63) / 96
end

local function think(t, a, s)
  note_motion(s)
  if s.reload > 0 then s.reload = math.max(0, s.reload - FRAME_MS) end
  local target = s.tid and worm_by_id(s.tid)
  if s.tid and not target then s.tid = nil end
  -- The reticle glides toward the worm it fired at, 4 pixels a frame.
  if s.draw_aim and target then
    if s.aim_x < target.x then s.aim_x = s.aim_x + 4 elseif s.aim_x > target.x then s.aim_x = s.aim_x - 4 end
    if s.aim_y < target.y then s.aim_y = s.aim_y + 4 elseif s.aim_y > target.y then s.aim_y = s.aim_y - 4 end
  end
  -- PX's Root->IsTimerActive(): the turn clock is counting down.
  local clock = wa.world.turn_clock()
  local running = s.clock ~= nil and clock < s.clock
  s.clock = clock
  -- Captured (Lightning), it waits for the next turn, as the sentries do.
  if not running or s.ammo <= 0 or s.disabled then return end
  if s.aim_sound > 0 then s.aim_sound = s.aim_sound - 1 end
  if not target then
    find_target(t, a, s)
    s.wait = t.thinking
    return
  end
  if s.wait > 0 then s.wait = s.wait - 1; return end
  if not aim(t, a, s, target) or s.reload > 0 then return end
  if blocked(t, a, s) then
    if wa.random(0, 99) < 65 then
      next_flight(s)
      s.wait = 4
    else
      s.tid, s.wait = nil, 10
      return
    end
    s.reload = s.reload_time
    return
  end
  -- FillShootingInfo
  local sn, cs = wa.math.sin(s.ta), wa.math.cos(s.ta)
  local cx, cy = centre(a)
  local shot = { x = cx + sn * s.dir * t.tower_len, y = cy - t.tower_offset - cs * t.tower_len,
    dx = sn * s.dir, dy = -cs }
  next_flight(s)
  if t.shoot(t, a, s, shot) then
    s.draw_aim = true
    s.reload = s.reload_time
    -- PX's int(reloadTime * 1.12) frames: the increase in whole frames.
    s.reload_time = s.reload_time + s.reload_time * t.fire_increase_pct // 100 // FRAME_MS * FRAME_MS
    s.ammo = s.ammo - 1
    if s.aim_sound <= 0 then
      a:sound(AIM_SOUND)
      s.aim_sound = t.aim_sound_gap
    end
  else
    s.tid, s.wait = nil, 10
  end
end

-- Placed, it waits for the next turn: PX gives it ammo only as a turn begins.
local function init(t, a, s)
  local cx, cy = centre(a)
  s.ammo, s.ta, s.dir, s.want, s.power = 0, 1.57, 1, 1.57, 0
  s.reload, s.reload_time, s.flight, s.wait = 0, t.fire_rate_ms, 32, 0
  s.aim_sound, s.draw_aim, s.aim_x, s.aim_y = 0, false, cx, cy
  s.lrx, s.lry = 0, 0
end

local function turn_begin(t, s)
  s.draw_aim, s.aim_x, s.aim_y = false, s.x, s.y - R
  s.reload_time = t.fire_rate_ms
end

-- PX ignores hits from its own side's arrows (the Auto Ballista's). By
-- colour: its arrows are fired for a living member of the coalition.
local function ignore_hit(t, a, s, hit)
  if hit.kind ~= "hit" or hit.hit_kind ~= 9 then return false end
  for _, w in ipairs(wa.worms.all()) do
    if w.team == hit.team then return w.alliance == s.alliance end
  end
  return false
end

local CORNERS = { { -1, -1 }, { 1, -1 }, { 1, 1 }, { -1, 1 } }
local function quad(sheet, x, y, frame, rot, rgb, depth, size)
  local h = (size or 40) / 2
  local c, sn = wa.math.cos(rot), wa.math.sin(rot)
  local points = {}
  for i, p in ipairs(CORNERS) do
    points[i] = { x + h * (p[1] * c - p[2] * sn), y + h * (p[1] * sn + p[2] * c) }
  end
  wa.draw.quad({ sprite = sheet, points = points, frame = frame,
    color = 0xFF000000 | rgb, depth = depth, blend = "alpha" })
end

local function dim(rgb, k)
  local r, g, b = (rgb >> 16) & 0xFF, (rgb >> 8) & 0xFF, rgb & 0xFF
  return (math.floor(r * k) << 16) | (math.floor(g * k) << 8) | math.floor(b * k)
end

-- CTurretBase's M_DRAWQUEUE: the base and reticle in its colour, its weapon's
-- sprite and the head darker as its health falls.
local function draw(t, s)
  local cx, cy = s.x, s.y - R
  local rgb = TINTS[s.alliance + 1] or TINTS[1]
  quad(pyro.SHEET, cx, cy, t.frames.base, 0, rgb, Z_BASE)
  if s.draw_aim and s.tid then
    quad(pyro.SHEET, s.aim_x, s.aim_y, RETICLE, wa.world.frame() * 0.04, rgb, Z_BASE)
  end
  local head = dim(rgb, math.max(0, s.health) / s.max_health * 0.75 + 0.25)
  if t.ammo_sprite then quad(t.ammo_sprite, cx, cy, 0, 0, head, Z_AMMO, t.ammo_size) end
  local frame, rot = t.frames.head, s.ta - 1.5707
  if s.dir < 0 then frame, rot = frame + MIRROR, 1.5707 - s.ta end
  local py = cy - t.tower_offset
  quad(pyro.SHEET, cx, py, frame, rot, head, Z_HEAD)
  health_label.draw(s.health, s.max_health, cx, py - 10, Z_AMMO - 1)
end

-- A turret's component options: Health, Ammo per turn, Fire rate (ms) and
-- Fire increase (%), as `t` reads them at the next placing and the next turn.
function pyro.configure(t, ctx)
  t.health, t.ammo = ctx.option("health"), ctx.option("ammo")
  t.fire_rate_ms, t.fire_increase_pct = ctx.option("fire_rate"), ctx.option("fire_increase_pct")
end

-- `cfg`: `kind`, `weapon`, `frames` (pyro.FRAMES'), `shoot(t, a, s, shot)`
-- (fires once from shot.x/y along shot.dx/dy, the speed pyro.force's; false
-- leaves the worm), and PX's numbers over BASE. Returns lib/turret's `t`.
function pyro.new(cfg)
  pyro.install()
  local c = {}
  for k, v in pairs(BASE) do c[k] = v end
  for k, v in pairs(cfg) do c[k] = v end
  c.feet = pyro.feet
  c.muzzle_up, c.muzzle_out = R + c.tower_offset, c.tower_len
  c.capture_up, c.capture_radius = R + 4, 16
  c.boom_up = R
  c.boom = { damage = c.explode_damage, id = 100, below = false }
  c.disable_on_damage = false
  c.art = { mask = ART .. "mask.png" }
  c.sounds = { place = SETUP_SOUND }
  c.tints = TINTS
  c.think, c.draw, c.init, c.turn_begin, c.ignore_hit = think, draw, init, turn_begin, ignore_hit
  return turret.new(c)
end

return pyro
