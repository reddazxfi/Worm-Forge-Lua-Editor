-- Project X's oil drums (script_other_drums: oildrums.txt, icybarrel_logic.txt):
-- every oil drum WA puts on the map is one of PX's kinds, drawn as that
-- kind and bursting into it.
--
-- PX overrides COilDrum's constructor (a kind from RandomInt(0, 8), 8 the
-- teleport drum on cavern maps), Render and Explosion. Here a drum gets its
-- kind on the first simulation frame it is seen, in uid order, from
-- wa.random, so every peer and replay deals the same kinds. WA stops
-- drawing it (drum.visible) and the pack draws it; wa.on.oil_explode stands
-- in for WA's blast with the kind's.
--
-- Not ported: the bee drum (Keeper Bees are not ported) and PX's plane crash
-- drum. The nuke drum needs the Nuke Rocket placed; without it, it is left
-- out of the deal. The icy drum's Kamikaze special case is not ported.
local M = {}

local SHEETS = "sprites/oil_drums/"
-- PX's z: lower nearer. The drum at 16, its extras in front of it.
local function z(n) return math.floor(n * 0x10000) end

-- name -> { frame size in pixels, frames }
local SIZES = {
  drum = { 90, 20 },
  fallout = { 60, 32 }, petrol2 = { 50, 20 }, petrol3 = { 40, 20 }, clustlet = { 60, 6 },
  smklt50 = { 60, 28 }, smklt75 = { 90, 28 }, mineoff = { 60, 32 }, wteltlk = { 60, 10 },
  nuke_rocket_bullet = { 40, 1 }, magnetsparks = { 26, 10 },
}

-- Each kind: its drum's scale, and its extras: (sheet, dx, dy, z, scale,
-- opacity, frame(a, sparks), angle(a)), `a` PX's animcycle (frame * 0.02).
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
-- Sheets a kind draws when it bursts: the icy drum's 400 specks (PX's
-- particle sprite 611), which show how far its freeze reaches.
local BURST_SHEETS = { icy = { "smklt75" } }

-- PX's deal, 0..6 in its order, then its cavern-only teleport drum.
local DEAL = { "explosive", "napalm", "nuke", "cluster", "icy", "electric", "mine" }

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

function M.install(opts)
  local shared = require("lib/shared")
  local current_worm = shared.current_worm
  local kinds = {}     -- drum uid -> its kind
  local particles = {} -- the icy drums' bursts, drawn only
  local seed = 1       -- their own generator: they never touch wa.random
  local last_frame

  local function deal()
    local pool = {}
    for _, kind in ipairs(DEAL) do
      if kind ~= "nuke" or opts.nuke then pool[#pool + 1] = kind end
    end
    if wa.world.cavern() then pool[#pool + 1] = "teleport" end
    return pool[wa.random(1, #pool)]
  end

  local function drums_in_order()
    local all = wa.oil.all()
    table.sort(all, function(a, b) return a.uid < b.uid end)
    return all
  end

  -- Each new drum its kind, WA's draw of it off.
  local function take(drum)
    if kinds[drum.uid] then return kinds[drum.uid] end
    local kind = deal()
    kinds[drum.uid] = kind
    drum.visible = false
    wa.log(("oil drums: drum %d is %s"):format(drum.uid, kind))
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
        -- SetMotionRandomness(0.4), SetAirResistance(0.02).
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
    for _, drum in ipairs(drums_in_order()) do take(drum) end
    tick_particles()
  end, { msgs = { wa.msg.FRAME_FINISH } })

  -- PX's RandomFloat(lo, hi), from WA's generator.
  local function between(lo, hi)
    return lo + wa.random(0, 65536) * (hi - lo) / 65536
  end

  -- A worm of the team whose shot set the drum off, as PX's blasts are its
  -- OwnerTeam's; else the turn's worm.
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

  -- PX's DoExplosion(x, y, kind, damage, 0, team).
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
    -- Two of the Nuke Rocket's first rockets; PX draws each's SpY first.
    local vy = between(-0.5, -2.5)
    local vx = between(-1.1, 1.1)
    shared.nuke_rocket_first(owner, ev.x, ev.y, vx, vy)
    vy = between(-2.4, -5.2)
    vx = between(-2.5, 2.5)
    shared.nuke_rocket_first(owner, ev.x, ev.y, vx, vy)
  end

  BURST.cluster = function(ev, owner)
    blast(owner, ev.x, ev.y, 10)
    -- The Cluster Bomb's, bursting into its clustlets at once.
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
    -- icybarrel_logic.txt: every worm within 150 pixels, alive and not
    -- sinking, dead or frozen already, frozen; a suited worm loses its suit.
    local worms = wa.worms.all()
    table.sort(worms, function(a, b) return a.id < b.id end)
    for _, w in ipairs(worms) do
      local dx, dy = w.x - ev.x, w.y - ev.y
      if w.hp > 0 and dx * dx + dy * dy <= 150 * 150 then
        if shared.swim_suit_off then shared.swim_suit_off(w) end
        w:freeze()
      end
    end
  end

  BURST.electric = function(ev, owner)
    -- PX's tazer shot, the Electric Grenade's, searching 30 frames; the turn's
    -- worm is not a target.
    shared.electric_grenade_explode({ x = ev.x, y = ev.y, worm = current_worm(), life = 30 })
    blast(owner, ev.x, ev.y, 10)
  end

  BURST.mine = function(ev, owner)
    -- Seven of WA's mines for no team (PX's SDesc.Team 0): laid by an actor.
    local layer = wa.actors.spawn({ sprite = false, gravity = false, collide = false,
      owner = owner, x = ev.x, y = ev.y, on = function(a) a:despawn() end })
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

  wa.on.oil_explode(function(ev)
    local kind = take(ev.drum)
    local burst = BURST[kind]
    if not burst then return end
    ev:replace()
    burst(ev, owner_for(ev.team))
  end)

  local CORNERS = { { -1, -1 }, { 1, -1 }, { 1, 1 }, { -1, 1 } }
  local function quad(sheet, size, frames, x, y, p, angle, scale, alpha, depth, blend)
    local h = size * scale / 2
    local c, s = math.cos(angle), math.sin(angle)
    local points = {}
    for i, k in ipairs(CORNERS) do
      points[i] = { x + h * (k[1] * c - k[2] * s), y + h * (k[1] * s + k[2] * c) }
    end
    local f = math.floor((p % 1) * frames)
    wa.draw.quad({ sprite = sheet, points = points, frame = f,
      color = (alpha << 24) | 0xFFFFFF, depth = depth, blend = blend or "alpha" })
  end

  if wa.on.draw and wa.draw.quad then
    wa.on.draw(function()
      local frame = wa.world.frame()
      local a = frame * 0.02
      local sparks = (frame * 0.01) % 1
      for _, drum in ipairs(wa.oil.all()) do
        local kind = kinds[drum.uid]
        local k = kind and KINDS[kind]
        if k then
          local x, y = drum.x, drum.y
          for _, e in ipairs(k.extras) do
            local size = SIZES[e[1]]
            local ex, ey = x + e[2], y + e[3]
            if e[9] then -- the cluster drum's bits circle as PX's
              ex = ex + math.cos(a * 3) * 2
              ey = ey + math.sin(e[9] * a * 3) * 2
            end
            quad(SHEETS .. kind .. "_" .. e[1] .. ".png", size[1], size[2], ex, ey,
              e[7](a, sparks), e[8] and e[8](a) or 0, e[5], e[6], z(e[4]))
          end
          -- WA's dent, as WA's own draw: 0..3 by the damage taken.
          local dent = 0
          if drum.max_damage and drum.max_damage > 0 then
            dent = math.min(3, (drum.damage * 4) // drum.max_damage)
          end
          quad(SHEETS .. kind .. (dent + 1) .. ".png", 90, 20, x, y, a, 0, k.scale, 255, z(16))
        end
      end
      for _, p in ipairs(particles) do
        local t = p.age / p.life
        local s = p.size - 0.4 * t
        quad(SHEETS .. "icy_smklt75.png", 90, 28, p.x, p.y, t, 0, s,
          math.floor(255 - 80 * t), z(14), "add")
      end
    end)
  end
end

return M
