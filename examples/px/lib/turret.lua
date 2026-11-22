-- PX's sentry turrets, the shared part: planting, sweeping, aiming, firing, damage.

local turret = {}
local turrets = {}
local feet = require("lib/sentry_mask")
local health_label = require("lib/sentry_health")
local electrical = require("lib/electrical")

local function electrical_targets()
  local out = {}
  for _, t in ipairs(turrets) do
    for _, id in ipairs(wa.sorted(t.state)) do
      local s = t.state[id]
      if s.body.id == id then
        out[#out + 1] = { id = id, x = s.x, y = s.y - t.capture_up, radius = t.capture_radius, t = t, s = s }
      end
    end
  end
  return out
end

local stun_hook

local function register_electrical()
  if not stun_hook then
    stun_hook = true
    local turn_open = false
    wa.on.turn_end(function() turn_open = false end)
    wa.on.turn_start(function(event)
      if turn_open then return end
      turn_open = true
      local alliance = event and event.worm and event.worm.alliance
      for _, t in ipairs(turrets) do
        for _, id in ipairs(wa.sorted(t.state)) do
          local s = t.state[id]
          if s.body.id == id and s.stun then
            if s.stun <= 0 then
              s.stun = nil
              t.reload(s)
            elseif alliance == s.alliance then
              s.stun = s.stun - 1
            end
          end
        end
      end
    end)
  end
  electrical.register({
    kind = "turret",
    targets = electrical_targets,
    zap = function(obj, side)
      if obj.t.state[obj.id] == obj.s then obj.t.electric_zap(obj.s.body, obj.s, side) end
    end,
    strike = function(obj, alliance)
      if obj.t.state[obj.id] == obj.s then obj.t.capture(obj.s.body, obj.s, alliance) end
    end,
  })
end

function turret.on_beam(x0, y0, dx, dy, length)
  local best, entry
  for _, t in ipairs(turrets) do
    for _, id in ipairs(wa.sorted(t.state)) do
      local s = t.state[id]
      if s.body.id == id then
        local cx, cy = s.x - x0, s.y - t.capture_up - y0
        local along = cx * dx + cy * dy
        local miss = cx * cx + cy * cy - along * along
        if miss <= t.capture_radius * t.capture_radius then
          local at = along - math.sqrt(math.max(0, t.capture_radius * t.capture_radius - miss))
          if at > 0 and at < length and (not best or at < best) then
            best, entry = at, { t = t, s = s, body = s.body }
          end
        end
      end
    end
  end
  if best then return x0 + best * dx, y0 + best * dy, entry end
end

function turret.capture_hit(entry, x, y, alliance)
  if not entry or entry.t.state[entry.body.id] ~= entry.s then return false end
  local dx, dy = entry.s.x - x, entry.s.y - entry.t.capture_up - y
  if dx * dx + dy * dy > (entry.t.capture_radius + 6) * (entry.t.capture_radius + 6) then return false end
  return entry.t.capture(entry.body, entry.s, alliance)
end

function turret.projectile_target(x, y)
  for _, t in ipairs(turrets) do
    for _, id in ipairs(wa.sorted(t.state)) do
      local s = t.state[id]
      if s.body.id == id and math.abs(x - s.x) < 20
        and math.abs(y - (s.y - t.capture_up)) < 20 then
        return { t = t, s = s, body = s.body }
      end
    end
  end
end

function turret.projectile_hit(entry, damage, vx, vy, id)
  if entry and entry.t.state[entry.body.id] == entry.s then
    entry.t.projectile_hit(entry.body, entry.s, damage, vx, vy, id)
    return true
  end
  return false
end

local DEFAULTS = {
  sensor_px = 360, -- detection radius
  ammo = 20, -- rounds per turn
  shot_frames = 6, -- frames between rounds
  activate = 60, -- frames after acquiring before the first shot
  beep_frames = 60, -- minimum gap between alert beeps
  rot_idle = 0.5, -- degrees per frame while sweeping
  rot_active = 1.5, -- PX tracking speed, degrees per frame
  sweep = 10, -- PX idle sweep amplitude, degrees
  aim_tolerance = 1.5, -- PX fires only after rotation reaches the target
  require_motion = true, -- PX only acquires walking/jumping/moving worms
  settle_px = 4,
  sink_px = 0,
  foot_offsets = { -6, 7 }, -- support beside the buried mask, never inside it
  top_px = feet.top, -- top of the feet/hub silhouette above its anchor
  capture_radius = 24, -- Lightning's circle around the body
  capture_up = 16 - feet.burial,
  muzzle_up = 25 - feet.burial, -- pixels from the anchor up to the turret pivot
  sight_grace_px = 4,
  placement_reach = 64,
  health = 50,
  slide_friction = 0.20, -- pixels/frame lost on supported ground
  contact_worm = 0.5, -- fraction of incoming worm velocity transferred
  contact_projectile = 0.25, -- PX Javelin transfers a quarter of its velocity
  boom = { damage = 50, id = 100, below = false },
  boom_up = 20 - feet.burial, -- pixels from the anchor up to the death blast
  disable_on_damage = true, -- positive damage disables the sentry for the turn
  hit_by = "all", -- what hits it once planted (`body.hit_by`)
  passage_hit_by = { arrows = true, melee = true, fire = true, dragon_ball = true, blasts = true },
  head_depth = wa.depth.FRONT,
}

function turret.angle_to(ax, ay, tx, ty)
  local dx = (tx - ax) // 1
  local dy = (ty - ay) // 1
  local deg = math.deg(wa.math.atan(dx, dy))
  if deg < 0 then deg = deg + 360 end
  return deg
end

function turret.muzzle(t, a, angle)
  local rad = math.rad(angle)
  return a.x + wa.math.sin(rad) * t.muzzle_out,
    a.y - t.muzzle_up + wa.math.cos(rad) * t.muzzle_out
end

function turret.trace(a, x0, y0, x1, y1)
  local hit = wa.world.trace { x0 = x0, y0 = y0, x1 = x1, y1 = y1,
    radius = 0, with = { "terrain" }, ignore = { a } }
  if hit and hit.starts_solid then return { hit = true, x = x0, y = y0 } end
  if hit and hit.hit then return hit end
end

function turret.sight(t, a, tx, ty)
  local px, py = a.x, a.y - t.muzzle_up
  local dx, dy = tx - px, ty - py
  local radius = t.muzzle_out + t.sight_grace_px
  local distance2 = dx * dx + dy * dy
  if distance2 <= radius * radius then return true end
  local scale = radius / math.sqrt(distance2)
  return not turret.trace(a, px + dx * scale, py + dy * scale, tx, ty)
end

local function turn_toward(cur, want, speed)
  local d = (want - cur + 540) % 360 - 180
  if d > speed then d = speed elseif d < -speed then d = -speed end
  return (cur + d) % 360
end

local function play(a, sound)
  if sound then wa.sound.play(a, sound) end
end

local function angle_gap(a, b)
  local d = (a - b + 540) % 360 - 180
  return d < 0 and -d or d
end

function turret.new(cfg)
  health_label.install()
  local t = {}
  for k, v in pairs(DEFAULTS) do t[k] = v end
  for k, v in pairs(cfg) do t[k] = v end
  local feet = t.feet or feet
  t.feet = feet
  local state = {}

  local function note_motion(s, w)
    local p = s.seen[w.id]
    local m = (w.vx ~= 0 or w.vy ~= 0)
    if p then
      if p.x ~= w.x or p.y ~= w.y then m = true end
      p.x, p.y, p.moving = w.x, w.y, m
    else
      s.seen[w.id] = { x = w.x, y = w.y, moving = m }
    end
  end

  local function worm_targets(_, _, s)
    local out = {}
    for _, w in ipairs(wa.worms.all()) do
      if w.visible ~= false and w.state ~= "frozen" then
      local p = s.seen[w.id]
        out[#out + 1] = { key = w.id, x = w.x, y = w.y, alliance = w.alliance, moving = p and p.moving, obj = w }
    end
    end
    return out
  end
  local targets = cfg.targets or worm_targets

  local function can_track(a, s, c, need_motion)
    if c.alliance == s.alliance then return false end
    if need_motion and t.require_motion and not c.moving then return false end
    local ex, ey = a.x, a.y - t.muzzle_up
    local dx, dy = (c.x - ex) // 1, (c.y - ey) // 1
    if dx * dx + dy * dy > t.sensor_px * t.sensor_px then return false end
    return turret.sight(t, a, c.x, c.y)
  end

  local function acquire(a, s, list)
    local ex, ey = a.x, a.y - t.muzzle_up
    local best, best_d
    for _, c in ipairs(list) do
      if can_track(a, s, c, true) then
        local dx, dy = (c.x - ex) // 1, (c.y - ey) // 1
        local d = dx * dx + dy * dy
        if not best_d or d < best_d then best, best_d = c, d end
      end
    end
    return best
  end

  local function held(a, s, list)
    if s.tid == nil then return nil end
    for _, c in ipairs(list) do
      if c.key == s.tid then return can_track(a, s, c, false) and c or nil end
    end
    return nil
  end

  function t.start_firing(a, s)
    if s.firing then return end
    s.firing, s.anim = true, 0
    s.cooldown = 0
    s.fire_sound = 35
    play(a, t.sounds.fire_loop)
  end

  function t.stop_firing(a, s)
    if not s.firing then return end
    s.firing, s.anim = false, 0
    play(a, t.sounds.fire_end)
  end

  local function update_servo(a, s, rotating)
    if rotating then
      if not s.rotating then
        s.rotating, s.servo_sound = true, 17
        play(a, t.sounds.servo_start)
      elseif s.servo_sound <= 0 then
        s.servo_sound = 47
        play(a, t.sounds.servo_loop)
      end
    elseif s.rotating then
      s.rotating, s.servo_sound = false, 0
      play(a, t.sounds.servo_end)
    end
  end

  local function think(a, s)
    if not cfg.targets then
    for _, w in ipairs(wa.worms.all()) do note_motion(s, w) end
    end

    local target
    if s.active then
      local list = targets(t, a, s)
      target = held(a, s, list)
      if not target and not s.lost then
        target = acquire(a, s, list)
        if target then s.tid = target.key end
      end
    end
    local want
    local hx, hy = a.x, a.y - t.muzzle_up
    if target then
      if not s.had_target then
        s.activate = t.activate
        wa.log("Sentry acquired " .. t.kind .. " id=" .. a.id .. " target=" .. target.key
          .. " at=(" .. target.x .. "," .. target.y .. ")")
        if s.beep <= 0 then
          play(a, t.sounds.beep)
          s.beep = t.beep_frames
        end
      end
      s.had_target, s.lost = true, false
      s.tx, s.ty = target.x, target.y
      want = turret.angle_to(hx, hy, target.x, target.y)
      s.angle = turn_toward(s.angle, want, t.rot_active)
    elseif s.had_target then
      if not s.lost then t.stop_firing(a, s) end
      s.lost = true
      want = turret.angle_to(hx, hy, s.tx, s.ty)
      s.angle = turn_toward(s.angle, want, t.rot_active)
      if angle_gap(s.angle, want) <= t.aim_tolerance then
        s.had_target, s.lost, s.tid = false, false, nil
      end
    else
      s.had_target = false
      want = s.idle + s.sweep_dir * t.sweep
      s.angle = turn_toward(s.angle, want, t.rot_idle)
      if s.angle == want then s.sweep_dir = -s.sweep_dir end
    end

    if (180 - s.angle) * s.side < 0 then
      s.side = -s.side
      s.idle = 180 - 90 * s.side
    end

    if not s.active then
      want = s.idle - 45 * s.side
      s.angle = turn_toward(s.angle, want, t.rot_idle)
      t.stop_firing(a, s)
    end

    if s.beep > 0 then s.beep = s.beep - 1 end
    if s.activate > 0 then s.activate = s.activate - 1 end
    if s.cooldown > 0 then s.cooldown = s.cooldown - 1 end
    if s.servo_sound > 0 then s.servo_sound = s.servo_sound - 1 end
    if s.fire_sound > 0 then s.fire_sound = s.fire_sound - 1 end

    local aligned = target and angle_gap(s.angle, want) <= t.aim_tolerance
    update_servo(a, s, target ~= nil and angle_gap(s.angle, want) >= 2 * t.rot_active)

    local muzzle_clear = false
    if target and s.activate <= 0 and (s.firing or aligned) then
      local mx, my = turret.muzzle(t, a, s.angle)
      muzzle_clear = not turret.trace(a, mx, my, mx, my)
    end
    if muzzle_clear then
      t.start_firing(a, s)
      if s.fire_sound <= 0 then
        s.fire_sound = 35
        play(a, t.sounds.fire_loop)
      end
      if s.cooldown <= 0 then
        t.fire(t, a, s, target)
        s.cooldown = t.shot_frames
      end
    else
      t.stop_firing(a, s)
    end
  end

  function t.owner(a, s)
    local best
    for _, w in ipairs(wa.worms.all()) do
      if w.hp > 0 and w.alliance == s.alliance and (not best or w.id < best.id) then best = w end
    end
    return best or a
  end

  local function disable(a, s)
    s.disabled, s.active = true, false
    s.had_target, s.lost, s.tid = false, false, nil
    t.stop_firing(a, s)
    update_servo(a, s, false)
  end

  local function destroy(a, s, explode)
    state[a.id] = nil
    if explode then
      local owner = t.owner(a, s)
      if owner ~= a then
        local e = wa.actors.spawn({ sprite = false, owner = owner,
          x = a.x, y = a.y - t.boom_up, explode = { damage = t.boom.damage, id = t.boom.id, now = true } })
        e:remove()
      else
        a:explode(t.boom)
      end
    end
    a:remove()
  end

  local function hit(a, ev)
    local s = state[a.id]
    if not s then return end
    if t.ignore_hit and t.ignore_hit(t, a, s, ev) then return end
    local damage = math.max(0, ev.damage or 0)
    if damage > 0 then
      s.health = s.health - damage
      if t.disable_on_damage then disable(a, s) end
      if s.health <= 0 then destroy(a, s, true); return end
    end
    t.push(a, s, ev.vx or 0, ev.vy or 0)
  end

  function t.push(a, s, vx, vy)
    s.vx, s.vy = a.vx + vx, a.vy + vy
    a:warp { x = a.x, y = a.y, vx = s.vx, vy = s.vy }
    if vy < 0 then s.planted = false end
    if vx ~= 0 or vy ~= 0 then t.stop_firing(a, s) end
  end

  local function touched(a, ev)
    local s = state[a.id]
    if not s or not ev.other then return end
    local id = ev.other.id
    if id and s.script_hits[id] then s.script_hits[id] = nil; return end
    if ev.other.kind == "worm" and s.phase ~= 3 then return end
    if ev.other.kind == "actor" then
      for _, other_t in ipairs(turrets) do
        if other_t.state[ev.other.id] then return end
      end
    end
    local fraction = ev.other.kind == "worm" and t.contact_worm or t.contact_projectile
    t.push(a, s, (ev.vx or 0) * fraction, (ev.vy or 0) * fraction)
  end

  function t.projectile_hit(a, s, damage, vx, vy, id)
    if id then s.script_hits[id] = wa.world.frame() end
    hit(a, { damage = damage, vx = vx, vy = vy })
  end

  local function motion(a, s)
    s.x, s.y, s.vx, s.vy = a.x, a.y, a.vx, a.vy
    local planted = s.vy == 0 and a:on_feet()
    if s.planted and not planted then
      t.stop_firing(a, s)
      update_servo(a, s, false)
    end
    if planted and not s.planted then
      s.planted = true
      if not s.landed_once then
        s.landed_once = true
        s.phase = s.planter and 2 or 3
        a.hit_by = s.phase == 3 and t.hit_by or t.passage_hit_by
      end
      play(a, t.sounds.place)
    end
    s.planted = planted
    if s.planted then
      if math.abs(s.vx) <= t.slide_friction then s.vx = 0
      elseif s.vx > 0 then s.vx = s.vx - t.slide_friction
      else s.vx = s.vx + t.slide_friction end
      a.vx = s.vx
    end
    if a:in_water() then destroy(a, s, false); return false end
    return true
  end

  local brain_think = think
  if cfg.think then brain_think = function(a, s) cfg.think(t, a, s) end end

  local function brain(a)
    local s = state[a.id]
    if not s then return end
    s.tick = s.tick + 1
    local frame = wa.world.frame()
    for id, at in pairs(s.script_hits) do
      if at < frame - 1 then s.script_hits[id] = nil end
    end
    if s.recoil > 0 then s.recoil = s.recoil - 1 end
    if s.firing or s.recoil > 0 then s.anim = s.anim + 1 end
    local previous_x, previous_y = s.x, s.y
    if not motion(a, s) then return end
    if s.planter then
      local planter
      for _, w in ipairs(wa.worms.all()) do
        if w.id == s.planter_id and w.hp > 0 then planter = w; break end
      end
      if not planter or (not feet.overlaps_worm(s.x, s.y, planter)
        and not feet.overlaps_worm(previous_x, previous_y, planter)) then
        s.phase, a.hit_by = 3, t.hit_by
        wa.log(string.format("Sentry passage ended %s id=%d planter=%d (%s)",
          t.kind, a.id, s.planter_id, planter and "clear" or "gone"))
        s.planter, s.planter_id = nil, nil
      end
    end
    s.active = not s.disabled and s.ammo > 0
    if s.planted then brain_think(a, s) end
  end

  local function status(s)
    if s.ammo <= 0 then return 0x808080, true, "empty" end
    if not s.planted or not s.active then
      return 0x202020, false, "inactive"
    end
    if s.firing or s.had_target or s.lost or s.recoil > 0 then return 0xFF3030, true, "tracking" end
    return 0x30FF50, true, "ready"
  end
  t.status = status

  local label_clearance = t.art.barrel and 26 or 25

  local function sheet(path, x, y, frame, angle, rgb, depth, blend, size)
    local h = (size or 144) / 2
    local r = math.rad(angle)
    local c, sn = math.cos(r), math.sin(r)
    local points = {}
    for i, p in ipairs({ {-h,-h}, {h,-h}, {h,h}, {-h,h} }) do
      points[i] = { x + p[1] * c - p[2] * sn, y + p[1] * sn + p[2] * c }
    end
    wa.draw.quad({ sprite = path, points = points, frame = frame,
      color = 0xFF000000 | rgb, depth = depth, blend = blend or "alpha" })
  end
  local function draw_sentry(s)
    sheet(t.art.base, s.x + 1, s.y - 9, 0, 0, 0xFFFFFF, wa.depth.BEHIND_TERRAIN, "alpha", 64)
    local x, y, angle = s.x, s.y - t.muzzle_up, (90 - s.angle) % 360
    local pose = (s.firing or s.recoil > 0) and (1 + ((s.anim // 3) % 2)) or 0
    if t.art.barrel then sheet(t.art.barrel, x, y, pose, angle, 0xFFFFFF, t.head_depth + 1) end
    local look = t.art.barrel and (s.side < 0 and 1 or 0) or pose
    local tint = t.tints[s.alliance + 1] or t.tints[1]
    if t.art.turns then
      -- pre-turned head (tools/bake_turret_rotations.py): the nearest angle's frame, drawn upright;
      -- it is lit per angle, so a laser body needs no mirrored frame facing left
      local turn = math.floor(angle * t.art.turns / 360 + 0.5) % t.art.turns
      local row = t.art.barrel and 0 or pose
      sheet(t.art.gun, x, y, row * t.art.turns + turn, 0, tint, t.head_depth, nil, t.art.gun_size)
    else
      sheet(t.art.gun, x, y, look, angle, tint, t.head_depth)
    end
    if t.art.flare then
      sheet(t.art.flare, x, y, pose == 1 and 1 or 0, angle, 0xFFFFFF, t.head_depth, "add")
    end
    local rgb, flash = status(s)
    if flash and (s.tick % 30) >= 15 then rgb = (rgb & 0xFEFEFE) >> 1 end
    local r = math.rad(angle)
    local lx, ly = -7 * math.cos(r) + 3 * math.sin(r), -7 * math.sin(r) - 3 * math.cos(r)
    sheet(t.art.light, x + lx, y + ly - 4, 0, 0, rgb, t.head_depth - 1, "alpha", 5)
    health_label.draw(s.health, s.max_health, x,
      y - label_clearance + 20, t.head_depth - 2)
  end
  if wa.on.draw then
    wa.on.draw(function()
      for _, id in ipairs(wa.sorted(state)) do
        local s = state[id]
        if s.body.id == id then
          if cfg.draw then cfg.draw(t, s) else draw_sentry(s) end
        end
      end
    end)
  end

  function t.capture(a, s, alliance)
    if alliance < 0 or alliance > 5 then return false end
    s.alliance = alliance
    if not t.capture_keeps_firing then disable(a, s) end
    return true
  end

  function t.electric_zap(a, s, side)
    if t.tazer == "stun" then
      s.stun = 2
      disable(a, s)
    elseif t.tazer == "empty" then
      s.ammo = 0
    end
    hit(a, { damage = 12, vx = side * 1.2, vy = -4 })
  end

  local function placement(worm, facing)
    local wx, wy, planter_id = worm.x, worm.y, worm.id
    local x, y = wx, wy - feet.burial
    local worms, obstacles, land = {}, {}, {}
    for _, w in ipairs(wa.worms.all()) do
      local id, hp = w.id, w.hp
      if id ~= planter_id and hp > 0 then
        worms[#worms + 1] = { id = id, hp = hp, x = w.x, y = w.y }
      end
    end
    for _, other_t in ipairs(turrets) do
      for _, id in ipairs(wa.sorted(other_t.state)) do
        local other = other_t.state[id]
        if (other.landed_once or other.phase == 3) and other.body.id == id then
          obstacles[#obstacles + 1] = { x = other.body.x, y = other.body.y, feet = other_t.feet }
        end
      end
    end
    local function solid(px, py)
      local row = land[py]
      if not row then row = {}; land[py] = row end
      local value = row[px]
      if value == nil then value = wa.land.solid(px, py); row[px] = value end
      return value
    end
    for radius = 0, t.placement_reach, 4 do
      local step = radius == 0 and 360 or math.max(15, math.floor(360 / (radius / 2)))
      for deg = 0, 359, step do
        local angle = math.rad(deg)
        local tx = x + facing * radius * wa.math.cos(angle)
        local ty = y + radius * wa.math.sin(angle)
        local blocked = false
        for _, other in ipairs(obstacles) do
          if feet.intersects(tx, ty, other.x, other.y, other.feet) then blocked = true; break end
        end
        if not blocked and feet.clear(tx, ty, worms, planter_id, 0, solid) then
          local hit = wa.land.trace(wx, wy - 8, tx, ty - feet.top / 2)
          if not hit or not hit.hit then return tx, ty end
        end
      end
    end
  end

  function t.place(fire_ev)
    local worm = fire_ev.worm
    local alliance = worm.alliance or 0
    if alliance < 0 or alliance > 5 then alliance = 0 end
    local facing = worm.facing
    local idle = facing < 0 and 270 or 90
    local x, y = placement(worm, facing)
    if not x then
      local ammo = worm:ammo(t.weapon)
      if ammo >= 0 then worm:ammo(t.weapon, { set = ammo + 1 }) end
      wa.log("Sentry: no clear placement within " .. t.placement_reach .. "px; charge refunded")
      return nil
    end
    local body = wa.actors.spawn({
      sprite = false, x = x, y = y,
      vx = 0, vy = 0,
      origin = "bottom", owner = worm, persist = true,
      gravity = 1, body = { shape = t.art.mask, hits = { land = true, objects = true },
        hit_by = { fire = true, dragon_ball = true, blasts = true } },
      on = { frame = brain, hit = hit, touched = touched },
    })
    local s = {
      alliance = alliance, planted = false, active = true, disabled = false, ammo = t.ammo,
      x = x, y = y, vx = body.vx, vy = body.vy, tick = 0,
      script_hits = {}, health = t.health, max_health = t.health,
      angle = idle, idle = idle, side = facing < 0 and -1 or 1,
      sweep_dir = 1, shots = 0, firing = false, anim = 0, rotating = false,
      servo_sound = 0, fire_sound = 0, beep = 0, activate = 0, cooldown = 0,
      had_target = false, lost = false, seen = {}, recoil = 0,
      planter = worm, planter_id = worm.id,
      landed_once = false, phase = 1,
    }
    state[body.id] = s
    s.body = body
    if t.init then t.init(t, body, s) end
    wa.log(string.format("Sentry placed %s id=%d planter=%d at=(%.2f,%.2f) passage=on",
      t.kind, body.id, worm.id, x, y))
    return body, s
  end

  wa.on.turn_end(function(ev)
    local worm = ev.worm
    if not worm then return end
    for _, id in ipairs(wa.sorted(state)) do
      local s = state[id]
      if s.body.id == id and s.planter_id == worm.id then
        s.planter, s.planter_id = nil, nil
        s.phase, s.body.hit_by = 3, "all"
      end
    end
  end)

  local function reload(s)
    s.ammo, s.active, s.disabled, s.had_target, s.tid, s.lost, s.seen = t.ammo, true, false, false, nil, false, {}
    if t.turn_begin then t.turn_begin(t, s) end
  end

  wa.on.worm_message(function(_, msg)
    if msg ~= wa.msg.START_TURN then return end
    for id, s in pairs(state) do
      if s.body.id ~= id then state[id] = nil
      elseif s.stun then
        s.active, s.disabled, s.had_target, s.tid, s.lost, s.seen = false, true, false, nil, false, {}
      else
        reload(s)
      end
    end
  end, { msgs = { wa.msg.START_TURN } })

  t.reload = reload

  t.state = state -- for the Highlander mock
  turrets[#turrets + 1] = t
  register_electrical()
  return t
end

return turret
