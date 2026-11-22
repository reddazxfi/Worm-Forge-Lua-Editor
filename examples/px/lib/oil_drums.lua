-- Project X's oil drums: every oil drum on the map is one of PX's kinds.

local M = {}

local SHEETS = "sprites/oil_drums/"
local function z(n) return math.floor(n * 0x10000) end

local SIZES = {
  drum = { 90, 20 },
  fallout = { 60, 32 }, petrol2 = { 50, 20 }, petrol3 = { 40, 20 }, clustlet = { 60, 6 },
  smklt50 = { 60, 28 }, smklt75 = { 90, 28 }, mineoff = { 60, 32 }, wteltlk = { 60, 10 },
  nuke_rocket_bullet = { 40, 1 }, magnetsparks = { 26, 10 },
}

local function phase(p) return p end
local function back(p) return -p end
local KINDS = {
  explosive = { scale = 1.2, extras = {
    { "fallout", 0, 0, 14, 0.8, 160, phase } } },
  napalm = { scale = 1.0, extras = {
    { "petrol3", 1, 2, 14, 1.0, 160, phase },
    { "petrol2", -1, -2, 15, 1.0, 160, back } } },
  nuke = { scale = 1.2, extras = {
    { "nuke_rocket_bullet", 0, 0, 14, 0.8, 170, function() return 0 end } } },
  cluster = { scale = 1.0, extras = {
    { "clustlet", 2, 6, 15, 1.15, 160, phase, nil, 1 },
    { "clustlet", -4, -2, 15, 1.05, 160, back, nil, -1 },
    { "clustlet", 4, -7, 15, 0.95, 160, phase, nil, 1 } } },
  icy = { scale = 1.0, extras = {
    { "smklt50", -2, -6, 15.0, 0.7, 160, function(a) return -a * 3 end, function(a) return a end },
    { "smklt50", -1, -2, 15.1, 0.9, 160, function(a) return -a * 3 end, function(a) return -a end },
    { "smklt50", 3, 4, 15.2, 1.1, 160, function(a) return -a * 3 end, function(a) return a end } } },
  electric = { scale = 1.0, extras = {
    { "magnetsparks", 2, 0, 14, 1.1, 255, function(_, sparks) return sparks end, function(a) return a * 0.5 end } } },
  mine = { scale = 1.1, extras = {
    { "mineoff", 1, 4, 14, 1.0, 160, phase },
    { "mineoff", -3, -4, 15, 0.9, 160, back } } },
  teleport = { scale = 1.0, extras = {
    { "wteltlk", 1, 0, 15, 0.6, 230, phase } } },
}
local BURST_SHEETS = { icy = { "smklt75" } }

local DEAL = { "explosive", "napalm", "nuke", "cluster", "icy", "electric", "mine" }

M.ARC = {
  sprites = {
    "wf-lib/px/sprites/lightning/beam.png", "wf-lib/px/sprites/lightning/glow.png", "wf-lib/px/sprites/lightning/cloud.png",
    "sprites/electric_grenade/explosion.png", "sprites/electric_grenade/tazed1.png",
    "sprites/electric_grenade/tazed2.png",
  },
  sounds = { "sounds/lightning/tazer_loop.wav" },
}

function M.sprites()
  local out = {}
  for kind, k in pairs(KINDS) do
    for i = 1, 4 do out[#out + 1] = SHEETS .. kind .. i .. ".png" end
    local seen = {}
    local names = {}
    for _, e in ipairs(k.extras) do names[#names + 1] = e[1] end
    for _, name in ipairs(BURST_SHEETS[kind] or {}) do names[#names + 1] = name end
    for _, name in ipairs(names) do
      if not seen[name] then
        seen[name] = true
        out[#out + 1] = SHEETS .. kind .. "_" .. name .. ".png"
      end
    end
  end
  table.sort(out)
  return out
end

local assets_loaded = false
function M.load_assets()
  if assets_loaded then return end
  assets_loaded = true
  local sprites = M.sprites()
  for _, path in ipairs(M.ARC.sprites) do sprites[#sprites + 1] = path end
  wa.assets.load({ sprites = sprites, sounds = M.ARC.sounds })
end

local installed, settings = false, { deal = false }

function M.install(opts)
  opts = opts or {}
  if opts.deal then settings.deal = true end
  if installed then return end
  installed = true
  local shared = require("lib/shared")
  local current_worm = shared.current_worm
  local kinds = {} -- drum id -> its kind
  local launched = {} -- drum id -> true: a Barrel Launcher's
  local particles = {} -- the icy drums' bursts, drawn only
  local seed = 1 -- their own generator: they never touch wa.random
  local last_frame

  local function deal()
    local pool = {}
    for _, kind in ipairs(DEAL) do pool[#pool + 1] = kind end
    if wa.world.cavern() then pool[#pool + 1] = "teleport" end
    return pool[wa.random(1, #pool)]
  end

  local function take(drum)
    if kinds[drum.id] then return kinds[drum.id] end
    if not settings.deal then return nil end
    local kind = deal()
    kinds[drum.id] = kind
    drum.visible = false
    return kind
  end

  local function rand()
    seed = (seed * 1103515245 + 12345) % 0x80000000
    return seed / 0x80000000
  end

  local function tick_particles()
    for i = #particles, 1, -1 do
      local p = particles[i]
      p.age = p.age + 1
      if p.age >= p.life then
        table.remove(particles, i)
      else
        p.vx = (p.vx + (rand() * 2 - 1) * 0.4) * 0.98
        p.vy = (p.vy + (rand() * 2 - 1) * 0.4) * 0.98
        p.x, p.y = p.x + p.vx, p.y + p.vy
      end
    end
  end

  wa.on.worm_message(function()
    local frame = wa.world.frame()
    if frame == last_frame then return end
    last_frame = frame
    if settings.deal then
      -- New drums get their kinds in id order; the sort waits for one.
      local all = wa.oil.all()
      for _, drum in ipairs(all) do
        if not kinds[drum.id] then
          table.sort(all, function(a, b) return a.id < b.id end)
          for _, d in ipairs(all) do take(d) end
          break
        end
      end
    end
    tick_particles()
  end, { msgs = { wa.msg.FRAME_FINISH } })

  local function between(lo, hi)
    return lo + wa.random(0, 65536) * (hi - lo) / 65536
  end

  shared.no_team_owner = function(x, y)
    return wa.actors.spawn({ owner = "none", sprite = false, x = x, y = y, on = function(a) a:remove() end })
  end

  local function owner_for(team)
    if team and team > 0 then
      local found
      for _, w in ipairs(wa.worms.all()) do
        if w.team == team and (not found or w.id < found.id) then found = w end
      end
      if found then return found end
    end
    return current_worm()
  end

  local function blast(owner, x, y, damage, kind)
    wa.actors.spawn({ sprite = false, x = x, y = y, owner = owner,
      explode = { damage = damage, id = kind or 100, now = true } })
  end

  local function fires(owner, x, y, count, duration, list)
    for _, f in ipairs(list) do
      wa.fire.spawn({ owner = owner, x = x, y = y + f[3], vx = f[1], vy = f[2],
        count = count, duration = duration, up_power = 100, damage = 17 })
    end
  end

  local BURST = {}

  BURST.explosive = function(ev, owner)
    fires(owner, ev.x, ev.y, 18, 6300, { { -3, -3, -1 }, { 3, -3, 1 }, { 0, -8, -2 } })
    blast(owner, ev.x, ev.y, 85)
  end

  BURST.napalm = function(ev, owner)
    fires(owner, ev.x, ev.y, 25, 8300, {
      { -8, -8, -1 }, { 8, -8, 1 }, { 0, -8, -2 }, { 4, -8, -2 }, { -4, -8, -2 }, { -4, -2, -2 }, { 4, -2, -2 } })
    blast(owner, ev.x, ev.y, 25)
  end

  BURST.nuke = function(ev, owner)
    blast(owner, ev.x, ev.y, 20, 80)
    local vy = between(-0.5, -2.5)
    local vx = between(-1.1, 1.1)
    shared.nuke_rocket_first(owner, ev.x, ev.y, vx, vy)
    vy = between(-2.4, -5.2)
    vx = between(-2.5, 2.5)
    shared.nuke_rocket_first(owner, ev.x, ev.y, vx, vy)
  end

  BURST.cluster = function(ev, owner)
    blast(owner, ev.x, ev.y, 10)
    wa.weapons.launch({ weapon = "stock.cluster_bomb", owner = owner, x = ev.x, y = ev.y,
      missile = { explosion = { power = 20, push_pct = 0, bias = 0 }, fuse = 0, countdown = 0,
        explode_on_space = false, burst = "clusters", wind_pct = 0 } })
  end

  BURST.icy = function(ev, owner)
    blast(owner, ev.x, ev.y, 10)
    seed = (math.floor(ev.x) * 7919 + math.floor(ev.y)) % 0x80000000
    for _ = 1, 400 do
      local a = rand() * 2 * math.pi
      local v = 1 + rand() * 2
      local s = 0.75 + rand() * 0.25
      particles[#particles + 1] = { x = ev.x, y = ev.y, vx = wa.math.cos(a) * v, vy = wa.math.sin(a) * v,
        age = 0, life = 70, size = s }
    end
    wa.sound.play(owner, 24)
    local cur = current_worm()
    local worms = wa.worms.all()
    table.sort(worms, function(a, b) return a.id < b.id end)
    for _, w in ipairs(worms) do
      local dx, dy = w.x - ev.x, w.y - ev.y
      if w.hp > 0 and dx * dx + dy * dy <= 150 * 150 then
        if shared.swim_suit_off then shared.swim_suit_off(w) end
        if cur and cur.id == w.id and w.state == "kamikaze" then
          local rocket = shared.kamikaze_rockets and shared.kamikaze_rockets[w.id]
          if rocket and rocket.vx then
            w:release(rocket.vx, rocket.vy)
          else
            w:release(w.vx, w.vy)
          end
          wa.land.cut({ x = w.x, y = w.y, shape = "circle", radius = 25 })
        end
        w:freeze()
      end
    end
  end

  BURST.electric = function(ev, owner)
    require("lib/electrical").context().grenade_arc({ x = ev.x, y = ev.y, worm = current_worm(), owner = owner, life = 30 })
    blast(owner, ev.x, ev.y, 10)
  end

  BURST.mine = function(ev, owner)
    local layer = wa.actors.spawn({ sprite = false, owner = owner, x = ev.x, y = ev.y, on = function(a) a:remove() end })
    for _ = 1, 7 do
      local vx = between(-7, 7)
      local vy = between(-7, -4)
      wa.mines.spawn({ owner = layer, x = ev.x, y = ev.y, vx = vx, vy = vy,
        fuse = 3000, arm = 3000, damage = 48, radius = 48 })
    end
    blast(owner, ev.x, ev.y, 10)
  end

  BURST.teleport = function(ev, owner)
    blast(owner, ev.x, ev.y, 10)
    local w = current_worm()
    if w then
      w.x, w.y = ev.x, ev.y - 6
      wa.sound.play(w, 68)
      wa.sound.play(w, 67)
    end
  end

  local LAUNCHED = {}

  LAUNCHED.napalm = function(ev, owner)
    fires(owner, ev.x, ev.y, 15, 8300, { { -8, -8, -1 }, { 8, -8, 1 }, { 0, -8, -2 } })
    blast(owner, ev.x, ev.y, 30)
  end

  LAUNCHED.mine = function(ev, owner)
    local layer = wa.actors.spawn({ sprite = false, owner = owner, x = ev.x, y = ev.y, on = function(a) a:remove() end })
    for _ = 1, 5 do
      local vx = between(-7, 7)
      local vy = between(-7, -4)
      wa.mines.spawn({ owner = layer, x = ev.x, y = ev.y, vx = vx, vy = vy,
        fuse = 3000, arm = 3000, damage = 40, radius = 48 })
    end
    blast(owner, ev.x, ev.y, 10)
  end

  M.launch = function(kind, x, y, vx, vy)
    assert(KINDS[kind], "oil drums: no kind " .. tostring(kind))
    local drum = wa.oil.spawn({ x = x, y = y, snap = false })
    if not drum then return nil end
    kinds[drum.id] = kind
    launched[drum.id] = true
    drum.visible = false
    drum.vx, drum.vy = vx, vy
    wa.log(("oil drums: launched drum %d is %s"):format(drum.id, kind))
    return drum
  end

  wa.on.oil_explode(function(ev)
    local kind = take(ev.drum)
    local burst = launched[ev.drum.id] and LAUNCHED[kind] or BURST[kind]
    if not burst then return end
    ev:replace()
    burst(ev, owner_for(ev.team) or shared.no_team_owner(ev.x, ev.y))
  end)

  -- One quad table, filled afresh for every quad: no garbage per frame.
  local CORNERS = { { -1, -1 }, { 1, -1 }, { 1, 1 }, { -1, 1 } }
  local POINTS = { { 0, 0 }, { 0, 0 }, { 0, 0 }, { 0, 0 } }
  local QUAD = { sprite = "", points = POINTS, frame = 0, color = 0, depth = 0, blend = "alpha" }
  local function quad(sheet, size, frames, x, y, p, angle, scale, alpha, depth, blend)
    local h = size * scale / 2
    if angle == 0 then
      POINTS[1][1], POINTS[1][2] = x - h, y - h
      POINTS[2][1], POINTS[2][2] = x + h, y - h
      POINTS[3][1], POINTS[3][2] = x + h, y + h
      POINTS[4][1], POINTS[4][2] = x - h, y + h
    else
      local c, s = math.cos(angle), math.sin(angle)
      for i, k in ipairs(CORNERS) do
        POINTS[i][1] = x + h * (k[1] * c - k[2] * s)
        POINTS[i][2] = y + h * (k[1] * s + k[2] * c)
      end
    end
    QUAD.sprite, QUAD.frame = sheet, math.floor((p % 1) * frames)
    QUAD.color, QUAD.depth, QUAD.blend = (alpha << 24) | 0xFFFFFF, depth, blend or "alpha"
    wa.draw.quad(QUAD)
  end

  if wa.on.draw and wa.draw.quad then
    -- Each kind's sheet names and depths, made once.
    local LOOKS = {}
    for kind, k in pairs(KINDS) do
      local look = { body = {}, extras = {} }
      for i = 1, 4 do look.body[i] = SHEETS .. kind .. i .. ".png" end
      for i, e in ipairs(k.extras) do
        look.extras[i] = { sheet = SHEETS .. kind .. "_" .. e[1] .. ".png", depth = z(e[4]) }
      end
      LOOKS[kind] = look
    end
    local BODY_DEPTH, SMOKE, SMOKE_DEPTH = z(16), SHEETS .. "icy_smklt75.png", z(14)
    local REACH = 80 -- pixels
    wa.on.draw(function()
      -- Only what the screen shows.
      local v = wa.world.view()
      if v.w <= 0 or v.h <= 0 then return end
      local zoom = v.zoom > 0 and v.zoom or 1
      local hw, hh = v.w / zoom / 2 + REACH, v.h / zoom / 2 + REACH
      local left, right, top, bottom = v.cx - hw, v.cx + hw, v.cy - hh, v.cy + hh
      local frame = wa.world.frame()
      local a = frame * 0.02
      local sparks = (frame * 0.01) % 1
      for _, drum in ipairs(wa.oil.all({ near = { v.cx, v.cy, math.sqrt(hw * hw + hh * hh) } })) do
        local kind = kinds[drum.id]
        local k = kind and KINDS[kind]
        if k then
          local x, y = drum.x, drum.y
          local look = LOOKS[kind]
          for i, e in ipairs(k.extras) do
            local size = SIZES[e[1]]
            local ex, ey = x + e[2], y + e[3]
            if e[9] then -- the cluster drum's bits circle as PX's
              ex = ex + math.cos(a * 3) * 2
              ey = ey + math.sin(e[9] * a * 3) * 2
            end
            local extra = look.extras[i]
            quad(extra.sheet, size[1], size[2], ex, ey,
              e[7](a, sparks), e[8] and e[8](a) or 0, e[5], e[6], extra.depth)
          end
          local dent = 0
          if drum.max_damage and drum.max_damage > 0 then
            dent = math.min(3, (drum.damage * 4) // drum.max_damage)
          end
          quad(look.body[dent + 1], 90, 20, x, y, a, 0, k.scale, 255, BODY_DEPTH)
        end
      end
      for _, p in ipairs(particles) do
        local px, py = p.x, p.y
        if px > left and px < right and py > top and py < bottom then
          local t = p.age / p.life
          local s = p.size - 0.4 * t
          quad(SMOKE, 90, 28, px, py, t, 0, s, math.floor(255 - 80 * t), SMOKE_DEPTH, "add")
        end
      end
    end)
  end
end

return M
