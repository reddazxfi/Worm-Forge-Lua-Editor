-- Gravity Gun: pulls the object it aims at, holds it in front of the worm and throws it.

local holds = require("wf-lib/holds")
local weapon = {}
local ID = "px.gravity_gun"
local ART = "sprites/gravity_gun/"
local SND = "sounds/gravity_gun/"

local STOP_RADIUS = 40 -- gg_stop_radius: where it holds things
local PUSH = 8.5 -- gg_push_powa: a throw's speed
local SUCK = 5.0 -- gg_suck_speed
local UNHOLD = 75 -- gg_unhold_timer: frames stuck before it lets go
local REACH = 250 -- gg_throw_distance
local COOLDOWN = 15 -- gg_canfire_timer: frames after a throw or drop
local WALL_PUSH = 5.0 -- gg_wall_push_miltiplier
local RADIUS = { worm = 6, mine = 5, crate = 9, oil = 9, grave = 8 }
local TARGETS = { "terrain", "worms", "mines", "crates", "oil", "graves" }
local grabs = TARGETS
local grab_worms = "all"

local states = {} -- worm id -> its gun
local claws = 0 -- the held art shown: 0 closed, 1 open
local effects = {}

local function sound(worm, name) wa.sound.play(worm, SND .. name .. ".wav") end

local function between(lo, hi) return lo + wa.random(0, 65536) * (hi - lo) / 65536 end

local function aim_dir(worm)
  local ang = (1 - worm.aim) * math.pi
  if worm.facing < 0 then ang = 2 * math.pi - ang end
  return wa.math.sin(ang), -wa.math.cos(ang)
end

local function trace(worm, distance)
  local dx, dy = aim_dir(worm)
  local ignore = { worm }
  if grab_worms == "own" then
    for _, w in ipairs(wa.worms.all()) do
      if w.alliance ~= worm.alliance then ignore[#ignore + 1] = w end
    end
  end
  return wa.world.trace({ x0 = worm.x, y0 = worm.y, x1 = worm.x + dx * distance,
    y1 = worm.y + dy * distance, radius = 0, with = grabs, ignore = ignore })
end

local function radius(obj) return RADIUS[obj.kind] or 6 end

local function exists(obj)
  if obj.kind == "worm" then
    for _, w in ipairs(wa.worms.all()) do if w.id == obj.id then return w.hp > 0 end end
    return false
  end
  local list = obj.kind == "mine" and wa.mines.all() or obj.kind == "crate" and wa.crates.all()
    or obj.kind == "oil" and wa.oil.all() or obj.kind == "grave" and wa.graves.all() or {}
  for _, o in ipairs(list) do if o.id == obj.id then return true end end
  return false
end

local function free_at(obj, x, y, terrain_only)
  return not wa.world.collides({ x = x, y = y, radius = radius(obj),
    with = terrain_only and { "terrain" } or TARGETS, ignore = { obj } })
end

local function state(worm)
  local s = states[worm.id]
  if not s then
    s = { cooldown = COOLDOWN, timer = UNHOLD, stop = STOP_RADIUS, ungg = 2,
      probe_sound = true, pickup_sound = true, loop = 4 }
    states[worm.id] = s
  end
  return s
end

local function disable(s)
  s.used, s.holder, s.hold, s.ghost, s.just_opened, s.held = false, false, false, false, false, nil
end

local function reset_cooldown(s) if s.cooldown == COOLDOWN then s.cooldown = 0 end end

local EFFECTS_LIMIT = 256
local function effect(kind, x, y, a, b, c)
  if #effects >= EFFECTS_LIMIT then return end
  effects[#effects + 1] = { kind = kind, x = x, y = y, a = a, b = b, c = c }
end

local function suck(worm, s)
  local hit = trace(worm, REACH * 3)
  if not hit or not hit.obj then return end
  local obj = hit.obj
  local dx, dy = aim_dir(worm)
  local before_x, before_y = obj.x - obj.vx, obj.y - obj.vy
  local r = radius(obj)
  local ox, oy = worm.x - hit.x, worm.y - hit.y
  local dist = math.sqrt(ox * ox + oy * oy)
  if dist <= STOP_RADIUS + 0.5 then
    s.pickup_sound, s.holder, s.hold, s.used = true, true, true, false
    s.held, s.just_opened = obj, true
  else
    local near = dist <= REACH / 2
    if free_at(obj, hit.x + dx * r, hit.y, true) then
      obj.x, obj.y = hit.x + dx * r, hit.y + dy * r
    end
    local speed = near and SUCK * 2.5 or SUCK
    obj.vx, obj.vy = -dx * speed, -dy * speed
    if near and s.pickup_sound then
      sound(worm, "gg_pickup")
      s.pickup_sound = false
    elseif not near then
      s.pickup_sound = true
    end
    s.holder = near
  end
  if obj.x == before_x and obj.y == before_y then
    obj.vy = obj.vy + between(-5, 0)
    obj.vx = obj.vx + between(-5, 5)
  end
end

local function hold(worm, s, obj)
  if not exists(obj) then
    disable(s)
    s.ghost, s.used_gg = false, false
    return
  end
  local last_x, last_y, last_side = s.ax, s.ay, s.side
  local dx, dy = aim_dir(worm)
  s.ax, s.ay, s.side = dx, dy, worm.facing > 0 and 1 or -1
  local work = true
  if last_side and last_side ~= s.side then
    work = math.abs(dx - last_x) < 0.3 and math.abs(dy - last_y) < 0.3
  end
  if not s.work2 then s.stop = STOP_RADIUS end
  local tx, ty = worm.x + dx * s.stop, worm.y + dy * s.stop
  if worm.aiming then effect("light", worm.x + dx * 25, worm.y + dy * 25, 0.7, 2, 240) end
  effect("light", obj.x, obj.y, 0.7, 2, 240)
  if not work then
    effect("spark", obj.x, obj.y, 10)
    disable(s)
    s.ghost, s.used_gg = false, false
    sound(worm, "gg_small_zap2")
    return
  end
  if not free_at(obj, tx, ty) then
    s.work2 = true
    s.timer = s.timer - 1
    if s.timer <= 0 then
      disable(s)
      s.ghost, s.used_gg, s.work2 = false, false, false
    else
      s.stop = s.stop > 6 and s.stop - 3 or STOP_RADIUS
      if s.timer % 5 == 0 then
        effect("spark", obj.x, obj.y, 2)
        sound(worm, "gg_small_zap2")
      end
    end
    return
  end
  if s.stop ~= STOP_RADIUS and free_at(obj, worm.x + dx * STOP_RADIUS, worm.y + dy * STOP_RADIUS) then
    s.stop, s.work2 = STOP_RADIUS, false
  end
  local ex, ey = obj.x - tx, obj.y - ty
  if s.stop + 15 - math.sqrt(ex * ex + ey * ey) > 0 then
    s.timer = UNHOLD
    obj.x, obj.y, obj.vx, obj.vy = tx, ty, 0, 0
  end
end

local function div(a, b)
  local q = a // b
  if q < 0 and q * b ~= a then q = q + 1 end
  return q
end

local E = { [1] = 2.718281828459045, [0] = 1.0, [-1] = 0.36787944117144233 }
local function worms_multi()
  local n = #wa.worms.all()
  local deg = math.max(-1, math.min(1, div(24 - n, 24)))
  local k = n > 24 and 1.375 - div(n, 64) or 1.0
  return E[deg] + (k - div(48 - n, 48)) * 4
end

local function throw(worm, s)
  local dx, dy = aim_dir(worm)
  local hit = trace(worm, REACH)
  if not (hit and hit.hit) then
    sound(worm, "gg_dryfire")
    return
  end
  local ox, oy = worm.x - hit.x, worm.y - hit.y
  local dist = math.sqrt(ox * ox + oy * oy)
  sound(worm, "gg_dryfire")
  if hit.obj then
    worm:ammo(ID, -1)
    hit.obj.vx, hit.obj.vy = dx * PUSH, dy * PUSH
    effect("trail", worm.x, worm.y, dx, dy, dist)
    sound(worm, "gg_throw")
  else
    local push = worms_multi() * 0.1 * WALL_PUSH
    worm.vx, worm.vy = worm.vx - dx * push, worm.vy - dy * push
    effect("trail", worm.x, worm.y, dx, dy, dist)
    sound(worm, "gg_throw")
  end
end

local function probe(worm, s)
  local hit = trace(worm, REACH * 3)
  if hit and hit.obj then
    s.holder = true
    if s.probe_sound then
      sound(worm, "gg_possible_hit")
      s.probe_sound = false
    end
  else
    s.holder, s.probe_sound = false, true
  end
end

local function engaged(worm)
  return worm.state == "roping" or worm.state == "jetpacking"
end

local function fire(ev)
  local worm = ev.worm
  if engaged(worm) then return end
  local s = state(worm)
  worm:ammo(ID, 1) -- the shot itself is free
  s.used, s.used_gg = true, true
  local keys = wa.world.keys()
  if not keys.shift and not keys.ctrl then sound(worm, "gg_claws") end
end

weapon.definition = {
  wep = "weps/gravity_gun.wep",
  name = "Gravity Gun",
  panel_icon = ART .. "gravity_gun_ico.png",
  worm_sprites = holds.PX_POSTURE,
  hold = {
    sheet = ART .. "gravity_gun_aiming.png", frames = 1,
    sheets = { ART .. "gravity_gun_aiming2.png" },
    hand = holds.PX_HANDS[1], hand_type = 1, hand_scale = 0.8,
    hand_radius = -6, hand_rotation = 0.5, hand_radial_rotation = 0.9,
    weap_radius = 0, weap_rotation = 0.5, weap_radial_rotation = 0,
  },
  sprites = { ART .. "gravity_gun_aiming2_ghost.png", ART .. "portal_gun_glow.png",
    ART .. "lightning_glow.png", ART .. "gg_beam1.png" },
  sounds = { SND .. "gg_claws.wav", SND .. "gg_drop.wav", SND .. "gg_dryfire.wav",
    SND .. "gg_hold_loop.wav", SND .. "gg_pickup.wav", SND .. "gg_possible_hit.wav",
    SND .. "gg_small_zap2.wav", SND .. "gg_throw.wav" },
  params = { gpu_prefix = ART },
  on_fire = fire,
}

local function frame(worm)
  local s = state(worm)
  local keys = wa.world.keys()
  local space_now = keys.space and not s.space
  local shift_now = (keys.shift or keys.ctrl) and not s.shift
  s.space, s.shift = keys.space, keys.shift or keys.ctrl
  if worm.weapon == ID then
    if s.cooldown < COOLDOWN then
      s.cooldown = s.cooldown + 1
      return
    end
    if space_now and (keys.shift or keys.ctrl) and not engaged(worm) then
      throw(worm, s)
      disable(s)
      reset_cooldown(s)
      return
    end
    s.ungg, s.ghost = 2, false
    local dx, dy = aim_dir(worm)
    if keys.space and worm.aiming then effect("light", worm.x + dx * 25, worm.y + dy * 25, 0.35, 2, 240) end
    if s.holder and worm.aiming and wa.world.frame() % 10 == 0 then
      effect("grav", worm.x + dx * 25, worm.y + dy * 25, 1)
    end
    if worm.aiming then probe(worm, s) end
    local open = s.holder and worm.aiming and 1 or 0
    if open ~= claws then
      claws = open
      wa.weapons.hold_sheet(ID, open)
    end
    if s.hold then
      if s.held then
        hold(worm, s, s.held)
        if s.loop == 4 then sound(worm, "gg_hold_loop") end
        s.loop = s.loop > -1 and s.loop - 1 or 4
        if not worm.aiming then s.ghost = true end
      else
        disable(s)
      end
      if space_now then
        if keys.shift or keys.ctrl then sound(worm, "gg_drop") end
        disable(s)
        reset_cooldown(s)
      end
    elseif s.used then
      if keys.space then
        if shift_now then
          throw(worm, s)
          disable(s)
          reset_cooldown(s)
        elseif not keys.shift and not keys.ctrl then
          suck(worm, s)
        end
      else
        s.used = false
      end
    end
  elseif s.used_gg then
    if s.hp and worm.hp < s.hp then
      s.used_gg = false
      disable(s)
    elseif s.hold then
      local obj = s.held
      if obj and (obj.kind ~= "worm" or s.just_opened) then
        hold(worm, s, obj)
        s.ghost, s.just_opened = s.hold, false
      else
        s.used_gg = false
        disable(s)
      end
    elseif s.ungg == 0 then
      disable(s)
      s.ungg = 2
    else
      s.ungg = s.ungg - 1
    end
  end
  s.hp = worm.hp
end

local particles, previous = {}, nil

local function add_light(x, y, size, life, alpha)
  particles[#particles + 1] = { sheet = "lightning_glow.png", px = 128, x = x, y = y, vx = 0, vy = 0,
    g = 0, life = life, age = 0, size = size, end_size = 0.1, alpha = alpha, end_alpha = 0,
    color = { 240, 240, 0 }, end_color = { 220, 160 - wa.draw.random() * 50, 30 } }
end

local function spawn_particles(e)
  local r = wa.draw.random
  if e.kind == "light" then
    add_light(e.x, e.y, e.a, e.b, e.c)
  elseif e.kind == "spark" or e.kind == "grav" then
    local spark = e.kind == "spark"
    for _ = 1, e.a do
      local a, v = r() * 2 * math.pi, spark and 1.5 + r() * 2.3 or 1 + r() * 1.8
      local s = spark and 0.3 + r() * 0.3 or 0.5 + r() * 0.4
      local d = r() * 50
      particles[#particles + 1] = { sheet = "portal_gun_glow.png", px = 80, x = e.x, y = e.y,
        vx = math.cos(a) * v, vy = math.sin(a) * v, g = spark and 0.08 or 0.024,
        life = spark and 40 or 20, age = 0, size = s, end_size = spark and 0.01 or 0.05,
        alpha = 255, end_alpha = 255,
        color = spark and { 255, 255 - d, 0 } or { 240, 220 - d, 0 },
        end_color = spark and { 255, 80 - d, 0 } or { 200, 80 - d, 30 } }
    end
  elseif e.kind == "trail" then
    local n = math.max(2, math.floor(math.abs(e.c / 10)))
    for i = 1, n do
      local px, py = e.x + e.a * i * 10, e.y + e.b * i * 10
      if i % 2 == 0 then
        add_light(px + (r() * 40 - 20) * math.abs(e.a), py + (r() * 40 - 20) * math.abs(e.b),
          0.3 + r() * 0.2, 40, math.floor(255 - 200 * i / n))
      end
      add_light(px, py, 0.1, 40, math.floor(255 - 255 * i / n))
    end
  end
end

local function render_gun()
  local now = wa.world.frame()
  local dt = previous and now - previous or 0
  if dt < 0 or dt > 10 then particles, dt = {}, 0 end
  previous = now
  for _, e in ipairs(effects) do spawn_particles(e) end
  effects = {}
  for i = #particles, 1, -1 do
    local p = particles[i]
    p.age = p.age + dt
    if p.age >= p.life then
      table.remove(particles, i)
    else
      for _ = 1, dt do
        p.vx, p.vy = p.vx * 0.95, p.vy * 0.95 + p.g
        p.x, p.y = p.x + p.vx, p.y + p.vy
      end
    end
  end
  for _, p in ipairs(particles) do
    local t = p.age / p.life
    local half = p.px * (p.size + (p.end_size - p.size) * t) / 2
    local alpha = math.floor(p.alpha + (p.end_alpha - p.alpha) * t)
    local c = {}
    for k = 1, 3 do c[k] = math.floor(p.color[k] + (p.end_color[k] - p.color[k]) * t) end
    wa.draw.quad({ sprite = ART .. p.sheet, frame = 0, blend = "add", depth = wa.depth.EFFECTS,
      color = (alpha << 24) | (c[1] << 16) | (c[2] << 8) | c[3],
      points = { { p.x - half, p.y - half }, { p.x + half, p.y - half },
        { p.x + half, p.y + half }, { p.x - half, p.y + half } } })
  end
  for _, w in ipairs(wa.worms.all()) do
    local s = states[w.id]
    if s and s.ghost and s.ax then
      local ang = math.atan(s.ay, s.ax)
      local c, sn = math.cos(ang) * 35, math.sin(ang) * 35
      local flip = w.facing < 0 and -1 or 1
      local function at(u, v) v = v * flip; return { w.x + u * c - v * sn, w.y + u * sn + v * c } end
      wa.draw.quad({ sprite = ART .. "gravity_gun_aiming2_ghost.png", frame = 0, depth = wa.depth.WORMS - 1,
        points = { at(-1, -1), at(1, -1), at(1, 1), at(-1, 1) } })
    end
  end
end

function weapon.configure(ctx)
  grab_worms = ctx.option("grab_worms")
  grabs = { "terrain" }
  if grab_worms ~= "off" then grabs[#grabs + 1] = "worms" end
  for _, kind in ipairs({ { "mines", "grab_mines" }, { "crates", "grab_crates" },
      { "oil", "grab_oil_drums" }, { "graves", "grab_graves" } }) do
    if ctx.option(kind[2]) then grabs[#grabs + 1] = kind[1] end
  end
end

function weapon.setup()
  wa.on.worm_message(function(worm)
    if worm.turn then frame(worm) end
  end, { msgs = { wa.msg.FRAME_FINISH } })
  wa.on.turn_end(function()
    for _, s in pairs(states) do
      s.used_gg = false
      disable(s)
    end
  end)
  wa.on.draw(function() render_gun() end)
  require("lib/weapon_hint").hint(ID, function(worm)
    local s = states[worm.id]
    local now = s and s.hold and s.held and "holding" or s and s.used and "armed" or "ready"
    return "Gravity Gun: " .. now .. "\nSpace: grab\nShift/Ctrl + Space: push"
  end)
end

return weapon
