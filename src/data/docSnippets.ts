// Full documentation snippets taken from the engine's own shipped mods.
//
// WHY THIS FILE EXISTS
// The DocPane Insert button used to insert `example` verbatim. Many of those
// examples are one-line calls or contain `...`, which is a signature, not code
// a mod author can run. The entries here are complete functions or hook bodies
// copied from WormForgeNew/mods, with their source path, so Insert lands a
// useful block and the docs pane can say where it came from.
//
// Keep this data separate from wormforgeDefinitions.ts: the definition tables
// feed the checker and completion, while these strings are documentation only.

export interface DocSnippet {
  /** Complete Lua block to insert at the caret. */
  code: string;
  /** Engine mod this example came from. */
  source: string;
}

export const DOC_SNIPPETS: Record<string, DocSnippet> = {
  "InventoryStore": {
    source: "WormForgeNew/mods/px/scheme/highland_rules.lua",
    code: `local function deal(worm)
  local cave = wa.world.cavern()
  for _, name in ipairs({ "offensive", "second", "movement" }) do
    local pool = POOLS[cave and "cave_" .. name or name]
    -- A profile may leave a pool empty: nothing to deal from it.
    if #pool > 0 then
      arsenal:deal(worm, pool, 1)
    end
  end
  dealt[worm.id] = true
  wa.log(string.format(
    "highlander: worm %d dealt %s (%s map)",
    worm.id, describe(arsenal:list(worm)), cave and "cavern" or "open"
  ))
end`,
  },
  "InventoryStore:add": {
    source: "WormForgeNew/mods/px/scheme/state.lua",
    code: `shared.restore_lightning_inventory = function(worm)
  local hand = dead_hands[worm.id]
  if not hand then return end
  arsenal:clear(worm)
  for _, weapon in ipairs(hand) do arsenal:add(worm, weapon, 1) end
  dealt[worm.id] = true
  dead_hands[worm.id] = nil
end`,
  },
  "InventoryStore:apply": {
    source: "WormForgeNew/mods/px/scheme/highland_rules.lua",
    code: `local function on_death(event)
  local victim = event.victim
  local active = event.active
  revived_by_lightning[victim.id] = nil
  local mine = arsenal:list(victim)
  dead_hands[victim.id] = mine

  if active and active.id == victim.id then
    -- Died on its own turn: nothing to hand on, just take its weapons away.
    arsenal:clear(victim)
    arsenal:apply(victim, { clear = true, each = 1 })
    wa.log(string.format("highlander: worm %d died on its own turn", victim.id))
    return
  end

  -- Otherwise the worm whose turn it is gets everything -- whoever or
  -- whatever did the killing, friend or foe, exactly as in PX.
  if not active or active.hp <= 0 then
    return
  end
  arsenal:transfer(victim, active, {
    weapons = "all", mode = "move", x = victim.x, y = victim.y,
  })
  -- Usable at once, this turn, not from the stealer's next turn.
  arsenal:apply(active, { weapons = mine, each = 1 })
  wa.log(string.format(
    "highlander: worm %d took %s from worm %d",
    active.id, describe(mine), victim.id
  ))
end`,
  },
  "InventoryStore:clear": {
    source: "WormForgeNew/mods/px/scheme/state.lua",
    code: `shared.restore_lightning_inventory = function(worm)
  local hand = dead_hands[worm.id]
  if not hand then return end
  arsenal:clear(worm)
  for _, weapon in ipairs(hand) do arsenal:add(worm, weapon, 1) end
  dealt[worm.id] = true
  dead_hands[worm.id] = nil
end`,
  },
  "InventoryStore:deal": {
    source: "WormForgeNew/mods/px/scheme/highland_rules.lua",
    code: `local function deal(worm)
  local cave = wa.world.cavern()
  for _, name in ipairs({ "offensive", "second", "movement" }) do
    local pool = POOLS[cave and "cave_" .. name or name]
    -- A profile may leave a pool empty: nothing to deal from it.
    if #pool > 0 then
      arsenal:deal(worm, pool, 1)
    end
  end
  dealt[worm.id] = true
  wa.log(string.format(
    "highlander: worm %d dealt %s (%s map)",
    worm.id, describe(arsenal:list(worm)), cave and "cavern" or "open"
  ))
end`,
  },
  "InventoryStore:list": {
    source: "WormForgeNew/mods/px/scheme/highland_rules.lua",
    code: `local function deal(worm)
  local cave = wa.world.cavern()
  for _, name in ipairs({ "offensive", "second", "movement" }) do
    local pool = POOLS[cave and "cave_" .. name or name]
    -- A profile may leave a pool empty: nothing to deal from it.
    if #pool > 0 then
      arsenal:deal(worm, pool, 1)
    end
  end
  dealt[worm.id] = true
  wa.log(string.format(
    "highlander: worm %d dealt %s (%s map)",
    worm.id, describe(arsenal:list(worm)), cave and "cavern" or "open"
  ))
end`,
  },
  "InventoryStore:transfer": {
    source: "WormForgeNew/mods/px/scheme/highland_rules.lua",
    code: `local function on_death(event)
  local victim = event.victim
  local active = event.active
  revived_by_lightning[victim.id] = nil
  local mine = arsenal:list(victim)
  dead_hands[victim.id] = mine

  if active and active.id == victim.id then
    -- Died on its own turn: nothing to hand on, just take its weapons away.
    arsenal:clear(victim)
    arsenal:apply(victim, { clear = true, each = 1 })
    wa.log(string.format("highlander: worm %d died on its own turn", victim.id))
    return
  end

  -- Otherwise the worm whose turn it is gets everything -- whoever or
  -- whatever did the killing, friend or foe, exactly as in PX.
  if not active or active.hp <= 0 then
    return
  end
  arsenal:transfer(victim, active, {
    weapons = "all", mode = "move", x = victim.x, y = victim.y,
  })
  -- Usable at once, this turn, not from the stealer's next turn.
  arsenal:apply(active, { weapons = mine, each = 1 })
  wa.log(string.format(
    "highlander: worm %d took %s from worm %d",
    active.id, describe(mine), victim.id
  ))
end`,
  },
  "LuaActor": {
    source: "WormForgeNew/mods/examples/gif_donkey/lua.lua",
    code: `local function brain(a)
  local now = wa.world.frame()
  born[a.id] = born[a.id] or now
  if now - born[a.id] >= FUSE then
    go_off(a)
    return
  end
  a.vx = 0
  a:gravity()
  local hit = a:move({ terrain = true, worms = true })
  if hit.land then
    a:explode({ damage = 50, id = 100, at = "below" })
  end
  a.vx = 0
  a:advance()
  if a:in_water() then
    born[a.id] = nil
    a:despawn()
  end
end`,
  },
  "LuaActor:advance": {
    source: "WormForgeNew/mods/examples/gif_donkey/lua.lua",
    code: `local function brain(a)
  local now = wa.world.frame()
  born[a.id] = born[a.id] or now
  if now - born[a.id] >= FUSE then
    go_off(a)
    return
  end
  a.vx = 0
  a:gravity()
  local hit = a:move({ terrain = true, worms = true })
  if hit.land then
    a:explode({ damage = 50, id = 100, at = "below" })
  end
  a.vx = 0
  a:advance()
  if a:in_water() then
    born[a.id] = nil
    a:despawn()
  end
end`,
  },
  "LuaActor:angle": {
    source: "WormForgeNew/mods/user_mods/roaming_bees/lib/bee.lua",
    code: `local function brain(a, ev)
  local s = state[a.id]
  if not s then return end
  ev = ev or {}

  -- Damage/knockback is handled by the \`hit\` handler (\`hurt\`), not here.
  -- Calling takeHit again would double-apply damage and force a spin on
  -- blasts that hurt() deliberately left unspun.

  if s.freeMe then
    state[a.id] = nil
    a:despawn()
    return
  end

  if s.dead and not s.spin and not s.softSpin then
    s.spin = true
    s.spinN = 0
  end

  checkClipping(a, s)

  if s.spin or s.softSpin then
    if s.spinN == 0 then playBuzz(a) end
    --a.vx, a.vy = 0, 0
    s.rot = (s.rot + (s.dead and 9 or 7)) % 360
    a:angle(s.rot)
    s.spinN = s.spinN + 1
    if s.spinN >= SPIN_FRAMES then
      if s.dead then
        detonate(a, s)
        return
      end
      s.spin, s.softSpin, s.spinN = false, false, 0
    end
    return
  end

  if shouldStop(s) then
    a.vx, a.vy = 0, 0
    return
  end

  s.ticks = (s.ticks or 0) + 1

  if a:in_water() then
    s.dead = true; log("[BEE] dead: in water")
    return
  end

  updateAnim(a, s)

  if a.vx ~= 0 then
    a.facing = a.vx > 0 and 1 or -1
  end

  if (s.lookoutCooldown or 0) > 0 then
    s.lookoutCooldown = s.lookoutCooldown - 1
  end

  local target = wormById(s.targetId)

  if target and (target.hp <= 0 or (not s.rogue and target.team == s.team)) then
    target = nil
    s.targetId = nil
  end
  if not target then
    target = findClosestEnemy(a, s)
    s.targetId = target and target.id or nil
  end

  if target then
    s.roamCooldown = 0

    if distPx(a, s.startX, s.startY) > ROAM_MAX_DIST_PX then
      s.targetId = nil
      s.homingDuration = 0
      s.lookoutCooldown = LOOKOUT_COOLDOWN_GIVEUP
      s.spin, s.spinN = true, 0
      return
    end

    local tdist = distPx(a, target.x, target.y)
    if tdist > HOMING_MAX_DIST_PX then
      s.targetId = nil
      s.homingDuration = 0
      s.lookoutCooldown = LOOKOUT_COOLDOWN_GIVEUP
      s.spin, s.spinN = true, 0
      return
    end

    s.homingDuration = (s.homingDuration or 0) + 1
    if s.homingDuration > HOMING_MAX_DURATION then
      s.targetId = nil
      s.homingDuration = 0
      s.lookoutCooldown = LOOKOUT_COOLDOWN_TIMEOUT
      s.spin, s.spinN = true, 0
      return
    end

    s.chaseCD = (s.chaseCD or 0) - 1
    if s.chaseCD <= 0 then
      steer(a, target.x, target.y, CHASE_SPEED, CHASE_STRENGTH)
      s.chaseCD = CHASE_STEER_EVERY
    end

    if tdist <= CONTACT_RADIUS_PX then
      s.dead = true; log("[BEE] dead: reached target")
      detonate(a, s)
      return
    end

    if s.homingDuration % 15 == 0 then
      playBuzz(a)
    end

    local vxpx, vypx = a.vx, a.vy
    if vxpx ~= 0 or vypx ~= 0 then
      s.desiredAngle = deg(wa.math.atan(vypx, math.abs(vxpx) + 0.001))
    end
  else
    s.homingDuration = 0

    if (s.roamCooldown or 0) > 0 then
      s.roamCooldown = s.roamCooldown - 1
      s.desiredAngle = 0
      a.vx = a.vx * 0.75
      a.vy = a.vy * 0.75
      if s.roamCooldown <= 0 then
        pickRoamPoint(a, s)
      end
    elseif not s.arriveX then
      pickRoamPoint(a, s)
    elseif distPx(a, s.arriveX, s.arriveY) < ROAM_ARRIVE_PX then
      s.roamCooldown = rand(ROAM_COOLDOWN_MIN, ROAM_COOLDOWN_MAX)
    else
      s.roamCD = (s.roamCD or 0) - 1
      if s.roamCD <= 0 then
        local baseSpeed = s.roamSpeed or ROAM_SPEED
        local speed = baseSpeed
        local dist = distPx(a, s.arriveX, s.arriveY)
        if dist < ROAM_SLOWDOWN_RADIUS_PX then
          local frac = dist / ROAM_SLOWDOWN_RADIUS_PX
          if frac < ROAM_SLOWDOWN_MIN_FRAC then
            frac = ROAM_SLOWDOWN_MIN_FRAC
          end
          speed = baseSpeed * frac
        end
        steer(a, s.arriveX, s.arriveY, speed, ROAM_STRENGTH)
        s.roamCD = ROAM_STEER_EVERY
      end
      local vxpx, vypx = a.vx, a.vy
      if vxpx ~= 0 or vypx ~= 0 then
        s.desiredAngle = deg(wa.math.atan(vypx, math.abs(vxpx) + 0.001))
      end
    end
  end

  local MAX_PITCH_DEG = 90 * 0.7
  s.desiredAngle = math.max(-MAX_PITCH_DEG, math.min(MAX_PITCH_DEG, s.desiredAngle or 0))

  if s.rot < s.desiredAngle then
    s.rot = math.min(s.rot + ROT_SMOOTH_DEG, s.desiredAngle)
  elseif s.rot > s.desiredAngle then
    s.rot = math.max(s.rot - ROT_SMOOTH_DEG, s.desiredAngle)
  end

  if a.facing < 0 then
    a:angle(-s.rot)
  else
    a:angle(s.rot)
  end
end`,
  },
  "LuaActor:blend": {
    source: "WormForgeNew/mods/examples/tools/stress/stress.lua",
    code: `local function orb_brain(o)
  local spin = 0
  return function(a)
    a:gravity()
    local hit = a:move({ terrain = true, worms = true })
    if hit.terrain or hit.land or hit.worm then
      flashes[#flashes + 1] = { x = a.x, y = a.y, tint = o.tint, born = now }
      orbs[o.id] = nil
      a:explode({ damage = DAMAGE, id = BLAST })
      a:despawn()
      return
    end
    if now % TRAIL_EVERY == 0 then
      table.insert(o.trail, 1, { x = a.x, y = a.y })
      o.trail[TRAIL + 1] = nil
    end
    spin = (spin + 12) % 360
    local scale = o.style.scale or 1.0
    if o.style.pulse then
      scale = 1.0 + 0.6 * wa.math.sin(now / 6)
    end
    a:gfx({ angle = spin, tint = o.tint, blend = o.style.blend, scale = scale, depth = o.style.depth })
    a:advance()
    if a:in_water() then
      orbs[o.id] = nil
      a:despawn()
    end
  end
end`,
  },
  "LuaActor:collision_ignore": {
    source: "WormForgeNew/mods/px/weapons/electromagnet.lua",
    code: `shared.fires.electromagnet = function(fire)
  local worm = fire.worm
  local pol = (fire.polarity == 1 or fire.polarity == -1) and fire.polarity or polarity[worm.id] or 1
  local m = { pol = pol, turns = TURNS, health = HEALTH, age = 0, angle = 0, spark = 0, alive = true,
    x = fire.x or worm.x, y = fire.y or worm.y,
    vx = worm.vx + (worm.facing < 0 and -1 or 1) * 0.3,
    vy = worm.vy - 0.15 }
  local a = wa.actors.spawn({
    sprite = BODY .. (pol < 0 and "magnet.png" or "magnet2.png"),
    x = m.x, y = m.y, vx = m.vx, vy = m.vy, owner = worm,
    drown = false, body = { physics = "mine" }, on = {
      frame = function(actor) frame(m, actor) end,
      hit = function(actor, event) hit(m, actor, event) end,
    },
  })
  m.a, m.team = a, worm.team
  if a:collision_ignore(worm, true) then m.planter, m.planter_id = worm, worm.id end
  clear_spawn(a)
  m.x, m.y = a.x, a.y
  m.field = wa.magnetism.field({ source = a, range = 170,
    strength = 14000, max_force = 12, softening = pol < 0 and 10 or 5,
    polarity = pol < 0 and "attract" or "repel" })
  m.sprite = sprite(m)
  magnets[#magnets + 1] = m
end`,
  },
  "LuaActor:despawn": {
    source: "WormForgeNew/mods/examples/gif_donkey/lua.lua",
    code: `local function brain(a)
  local now = wa.world.frame()
  born[a.id] = born[a.id] or now
  if now - born[a.id] >= FUSE then
    go_off(a)
    return
  end
  a.vx = 0
  a:gravity()
  local hit = a:move({ terrain = true, worms = true })
  if hit.land then
    a:explode({ damage = 50, id = 100, at = "below" })
  end
  a.vx = 0
  a:advance()
  if a:in_water() then
    born[a.id] = nil
    a:despawn()
  end
end`,
  },
  "LuaActor:explode": {
    source: "WormForgeNew/mods/examples/gif_donkey/lua.lua",
    code: `local function brain(a)
  local now = wa.world.frame()
  born[a.id] = born[a.id] or now
  if now - born[a.id] >= FUSE then
    go_off(a)
    return
  end
  a.vx = 0
  a:gravity()
  local hit = a:move({ terrain = true, worms = true })
  if hit.land then
    a:explode({ damage = 50, id = 100, at = "below" })
  end
  a.vx = 0
  a:advance()
  if a:in_water() then
    born[a.id] = nil
    a:despawn()
  end
end`,
  },
  "LuaActor:fits": {
    source: "WormForgeNew/mods/px/lib/portals.lua",
    code: `function Network:move(body)
  local kind = body.kind or "worm"
  if kind == "worm" and (body.hp <= 0 or body.taken) then return false end
  local key = identity(body)
  local x, y, vx, vy = body.x, body.y, body.vx, body.vy
  local last = self.last_exit[key]
  if last then
    if inside(last, x, y) then return false end
    self.last_exit[key] = nil
  end
  local entry, exit, best
  for _, group in ipairs(wa.sorted(self.pairs)) do
    local pair = self.pairs[group]
    if pair.active and pair[1] and pair[2] then
      for colour = 1, 2 do
        local p = pair[colour]
        local t = crossing(p, x, y, vx, vy)
        if t and (not best or t < best) then entry, exit, best = p, pair[3-colour], t end
      end
    end
  end
  if not entry then return false end
  if best > 0 then
    local hit = wa.land.trace(x, y, x + vx * best, y + vy * best)
    if hit and hit.hit then return false end
  end
  local tx, ty = exit.exit_x, exit.exit_y
  if self.clearance then
    tx, ty = self.clearance(body, exit)
    if not tx then return false end
  elseif not body:fits(tx, ty, "terrain") then
    -- PX's emergency clearance. Do not transport into a still blocked exit.
    wa.land.cut({x = tx, y = ty, shape = "circle", radius = 15})
    if not body:fits(tx, ty, "terrain") then return false end
  end
  local nvx, nvy, facing = self.velocity(kind, entry.dir, exit.dir, vx, vy, body.facing)
  local spec = { x = tx, y = ty, vx = nvx, vy = nvy }
  if kind == "worm" then spec.facing = facing end
  if not body:warp(spec) then return false end
  self.last_exit[key] = exit
  if self.on_transport then self.on_transport(body, entry, exit) end
  return true
end`,
  },
  "LuaActor:frame": {
    source: "WormForgeNew/mods/examples/turret/weapons.lua",
    code: `local function spark_brain(a)
  local n = sparks[a.id] or 0
  a:frame(n)
  n = n + 1
  sparks[a.id] = n
  if n >= SPARK_LIFE then
    sparks[a.id] = nil
    a:despawn()
  end
end`,
  },
  "LuaActor:gfx": {
    source: "WormForgeNew/mods/examples/tools/stress/stress.lua",
    code: `local function orb_brain(o)
  local spin = 0
  return function(a)
    a:gravity()
    local hit = a:move({ terrain = true, worms = true })
    if hit.terrain or hit.land or hit.worm then
      flashes[#flashes + 1] = { x = a.x, y = a.y, tint = o.tint, born = now }
      orbs[o.id] = nil
      a:explode({ damage = DAMAGE, id = BLAST })
      a:despawn()
      return
    end
    if now % TRAIL_EVERY == 0 then
      table.insert(o.trail, 1, { x = a.x, y = a.y })
      o.trail[TRAIL + 1] = nil
    end
    spin = (spin + 12) % 360
    local scale = o.style.scale or 1.0
    if o.style.pulse then
      scale = 1.0 + 0.6 * wa.math.sin(now / 6)
    end
    a:gfx({ angle = spin, tint = o.tint, blend = o.style.blend, scale = scale, depth = o.style.depth })
    a:advance()
    if a:in_water() then
      orbs[o.id] = nil
      a:despawn()
    end
  end
end`,
  },
  "LuaActor:gravity": {
    source: "WormForgeNew/mods/examples/gif_donkey/lua.lua",
    code: `local function brain(a)
  local now = wa.world.frame()
  born[a.id] = born[a.id] or now
  if now - born[a.id] >= FUSE then
    go_off(a)
    return
  end
  a.vx = 0
  a:gravity()
  local hit = a:move({ terrain = true, worms = true })
  if hit.land then
    a:explode({ damage = 50, id = 100, at = "below" })
  end
  a.vx = 0
  a:advance()
  if a:in_water() then
    born[a.id] = nil
    a:despawn()
  end
end`,
  },
  "LuaActor:in_water": {
    source: "WormForgeNew/mods/examples/gif_donkey/lua.lua",
    code: `local function brain(a)
  local now = wa.world.frame()
  born[a.id] = born[a.id] or now
  if now - born[a.id] >= FUSE then
    go_off(a)
    return
  end
  a.vx = 0
  a:gravity()
  local hit = a:move({ terrain = true, worms = true })
  if hit.land then
    a:explode({ damage = 50, id = 100, at = "below" })
  end
  a.vx = 0
  a:advance()
  if a:in_water() then
    born[a.id] = nil
    a:despawn()
  end
end`,
  },
  "LuaActor:look": {
    source: "WormForgeNew/mods/examples/pooz/weapons.lua",
    code: `local function set_clip(a, st, name)
  if st.anim ~= name then
    st.anim = name
    st.clock = 0
    a:look("sprites/" .. name)
    if name == "FrontFlip" then
      for _ = 1, 13 do
        a:advance()
      end
    end
    return
  end
  st.clock = st.clock + 1
  local slow = name == "Idle"
    or name == "Walk"
    or name == "Run"
    or name == "Sprint"
    or name == "Land"
  if slow and st.clock % 2 ~= 0 then
    return
  end
  a:advance()
end`,
  },
  "LuaActor:move": {
    source: "WormForgeNew/mods/examples/gif_donkey/lua.lua",
    code: `local function brain(a)
  local now = wa.world.frame()
  born[a.id] = born[a.id] or now
  if now - born[a.id] >= FUSE then
    go_off(a)
    return
  end
  a.vx = 0
  a:gravity()
  local hit = a:move({ terrain = true, worms = true })
  if hit.land then
    a:explode({ damage = 50, id = 100, at = "below" })
  end
  a.vx = 0
  a:advance()
  if a:in_water() then
    born[a.id] = nil
    a:despawn()
  end
end`,
  },
  "LuaActor:on_feet": {
    source: "WormForgeNew/mods/examples/wormcraft/weapons.lua",
    code: `local function letter_brain(delay, last, origin, left, y, n, dest_x, dest_y, i)
  local t = 0
  local shown = false
  local falling = false
  local boom = false
  local word_done = 10 + (n - 1) * LETTER_WAIT + 20
  local fall_at = word_done + 4 + (i - 1) * 11 + ((i - 1) % 3) * 5
  local drop = 0.078125 + i * 0.0390625
  return function(a)
    t = t + 1
    if t < delay then
      a.x = dest_x
      a.y = -2048
      a.vx = 0
      a.vy = 0
      return
    end
    local age = t - delay
    if age == 0 then
      -- A warp, not a write: the drawn position doesn't glide from the
      -- hiding place above the map.
      a:warp({ x = dest_x, y = dest_y })
      if last then
        a:sound("sounds/emotional-damage.wav")
      end
    end
    if last and not shown and age == 20 then
      shown = true
      surround(origin, left, y, n)
    end
    if not falling then
      a.vx = 0
      if age < 16 then
        a.vy = -0.1875
      else
        a.vy = 0
      end
      a:move({ terrain = false, worms = false })
      a.vx = 0
      a.vy = 0
      if t >= fall_at then
        falling = true
        a.vy = drop
      end
      return
    end
    a:gravity()
    local hit = a:move({ terrain = true, worms = true })
    if not boom and (hit.land or a:on_feet()) then
      boom = true
      a:explode({ damage = 35, id = 100, at = "below" })
      a:despawn()
      return
    end
    if a:in_water() then
      a:despawn()
    end
  end
end`,
  },
  "LuaActor:scale": {
    source: "WormForgeNew/mods/px/lib/px_bunker.lua",
    code: `local function blast(m, x, y)
  local b = wa.actors.spawn({ sprite = ART .. "idle.png", x = x, y = y,
    gravity = false, collide = false, owner = m.owner, on = function() end })
  b:scale(0)
  b:explode({ damage = DAMAGE, id = BLAST, below = false })
  if not b.dead then b:despawn() end
  if super_buster and m.owner then
    wa.fire.spawn({ owner = m.owner, x = x, y = y, count = 6,
      duration = FIRE.duration, up_power = FIRE.up_power, damage = FIRE.damage })
  end
end`,
  },
  "LuaActor:sound": {
    source: "WormForgeNew/mods/examples/turret/weapons.lua",
    code: `local function start_firing(a, s)
  if s.firing then return end
  s.firing = true
  s.anim = 0
  s.fire_sound = 35
  a:sound("sounds/sentryfireloop.wav")
end`,
  },
  "LuaActor:tint": {
    source: "WormForgeNew/mods/examples/tools/stress/stress.lua",
    code: `local function orb_brain(o)
  local spin = 0
  return function(a)
    a:gravity()
    local hit = a:move({ terrain = true, worms = true })
    if hit.terrain or hit.land or hit.worm then
      flashes[#flashes + 1] = { x = a.x, y = a.y, tint = o.tint, born = now }
      orbs[o.id] = nil
      a:explode({ damage = DAMAGE, id = BLAST })
      a:despawn()
      return
    end
    if now % TRAIL_EVERY == 0 then
      table.insert(o.trail, 1, { x = a.x, y = a.y })
      o.trail[TRAIL + 1] = nil
    end
    spin = (spin + 12) % 360
    local scale = o.style.scale or 1.0
    if o.style.pulse then
      scale = 1.0 + 0.6 * wa.math.sin(now / 6)
    end
    a:gfx({ angle = spin, tint = o.tint, blend = o.style.blend, scale = scale, depth = o.style.depth })
    a:advance()
    if a:in_water() then
      orbs[o.id] = nil
      a:despawn()
    end
  end
end`,
  },
  "LuaActor:warp": {
    source: "WormForgeNew/mods/examples/wormcraft/weapons.lua",
    code: `local function letter_brain(delay, last, origin, left, y, n, dest_x, dest_y, i)
  local t = 0
  local shown = false
  local falling = false
  local boom = false
  local word_done = 10 + (n - 1) * LETTER_WAIT + 20
  local fall_at = word_done + 4 + (i - 1) * 11 + ((i - 1) % 3) * 5
  local drop = 0.078125 + i * 0.0390625
  return function(a)
    t = t + 1
    if t < delay then
      a.x = dest_x
      a.y = -2048
      a.vx = 0
      a.vy = 0
      return
    end
    local age = t - delay
    if age == 0 then
      -- A warp, not a write: the drawn position doesn't glide from the
      -- hiding place above the map.
      a:warp({ x = dest_x, y = dest_y })
      if last then
        a:sound("sounds/emotional-damage.wav")
      end
    end
    if last and not shown and age == 20 then
      shown = true
      surround(origin, left, y, n)
    end
    if not falling then
      a.vx = 0
      if age < 16 then
        a.vy = -0.1875
      else
        a.vy = 0
      end
      a:move({ terrain = false, worms = false })
      a.vx = 0
      a.vy = 0
      if t >= fall_at then
        falling = true
        a.vy = drop
      end
      return
    end
    a:gravity()
    local hit = a:move({ terrain = true, worms = true })
    if not boom and (hit.land or a:on_feet()) then
      boom = true
      a:explode({ damage = 35, id = 100, at = "below" })
      a:despawn()
      return
    end
    if a:in_water() then
      a:despawn()
    end
  end
end`,
  },
  "MagneticField": {
    source: "WormForgeNew/mods/px/weapons/electromagnet.lua",
    code: `local function remove(m)
  m.alive = false
  m.field:remove()
  for i, other in ipairs(magnets) do
    if other == m then table.remove(magnets, i); break end
  end
end`,
  },
  "MagneticField:contains": {
    source: "WormForgeNew/mods/px/weapons/electromagnet.lua",
    code: `wa.on.missile_frame(function(missile)
  if missile.phase ~= "pre" or not DAMPED[missile.weapon] then return end
  for _, m in ipairs(magnets) do
    if m.field:contains(missile.x, missile.y) then
      missile.vx, missile.vy = missile.vx * DAMPING, missile.vy * DAMPING
      return
    end
  end
end)`,
  },
  "MagneticField:remove": {
    source: "WormForgeNew/mods/px/weapons/electromagnet.lua",
    code: `local function remove(m)
  m.alive = false
  m.field:remove()
  for i, other in ipairs(magnets) do
    if other == m then table.remove(magnets, i); break end
  end
end`,
  },
  "MissileEntity": {
    source: "WormForgeNew/mods/px/lib/px_zone_fx.lua",
    code: `function M.flight(weapon, healing)
  local count = 0
  wa.on.missile_frame(function(m)
    if m.weapon ~= weapon or m.phase ~= "post" then return end
    count = count + 1
    local owner = not driver and flight_owner() or nil
    emit(healing and healing() and M.HEAL or M.DAMAGE, m.x, m.y, false, false, owner)
    if count % 2 == 0 then emit(M.GLOW, m.x, m.y, false, true, owner) end
  end)
end`,
  },
  "wa.on.body_move": {
    source: "WormForgeNew/mods/px/weapons/portal_gun.lua",
    code: `wa.on.body_move(function(body) if next(network.pairs) then network:move(body) end end,
  { kinds = { "worm", "missile", "mine", "crate", "oil", "grave", "arrow" } })`,
  },
  "wa.on.contact": {
    source: "WormForgeNew/mods/px/weapons/hang_glider.lua",
    code: `wa.on.contact(function(worm, other)
  local g = gliders[worm.id]
  if g and g.landing and other.kind == "land" and worm.y < wa.world.water() then
    local keys = worm.keys or {}
    if keys.left or keys.right then
      g.landing = nil
      glider_drop_art(worm, g)
    else
      glider_begin_pack(worm, g)
    end
  end
end)`,
  },
  "wa.on.death": {
    source: "WormForgeNew/mods/px/weapons/reinforcement.lua",
    code: `local function update_selectable()
  -- DLLs before 0.9.1 lack the verb: there it stays selectable, and refused.
  if not wa.weapons.set_selectable then return end
  local living = {}
  for _, w in ipairs(wa.worms.all()) do
    if w.hp > 0 then living[w.team] = (living[w.team] or 0) + 1 end
  end
  for team = 1, 6 do
    wa.weapons.set_selectable({ weapon = ID, team = team, selectable = (living[team] or 0) < FULL })
  end
end

wa.on.death(update_selectable)`,
  },
  "wa.on.draw": {
    source: "WormForgeNew/mods/px/scheme/specialists_rules.lua",
    code: `wa.on.draw(function()
  for _, worm in ipairs(wa.worms.all()) do
    local class = class_of(worm)
    if class and class.name == "Medic" and worm.hp > 0 then
      local x, y = worm.x, worm.y
      wa.draw.quad({ points = { {x-128,y-128}, {x+128,y-128}, {x+128,y+128}, {x-128,y+128} },
        sprite = GLOW, visibility = worm, frame = 0,
        color = COLOURS[worm.alliance + 1], additive = true, depth = wa.depth.EFFECTS })
    end
  end
end)`,
  },
  "wa.on.gravity_after": {
    source: "WormForge API example (no shipped mod uses this hook)",
    code: `wa.on.gravity_after(function(m)
  m.vx = m.vx * 2
end)`,
  },
  "wa.on.gravity_before": {
    source: "WormForge API example (no shipped mod uses this hook)",
    code: `wa.on.gravity_before(function(m)
  m.wind_scale = 0
end)`,
  },
  "wa.on.hud": {
    source: "WormForgeNew/mods/examples/tools/worm_state_logger.lua",
    code: `wa.on.hud(function()
  local line = "Worm state: ?"
  for _, worm in ipairs(wa.worms.all()) do
    if worm.turn then
      line = "Worm state: " .. (describe(worm) or "?")
      break
    end
  end
  wa.hud.line(line, 14, 10)
end)`,
  },
  "wa.on.hurt": {
    source: "WormForgeNew/mods/examples/tools/hello.lua",
    code: `wa.on.hurt(function(hit)
  if hit.phase == "post" and hit.lost > 0 then
    wa.log(hit.kind .. " -" .. tostring(hit.lost) .. " hp")
  end
end)`,
  },
  "wa.on.missile_frame": {
    source: "WormForgeNew/mods/px/lib/px_zone_fx.lua",
    code: `function M.flight(weapon, healing)
  local count = 0
  wa.on.missile_frame(function(m)
    if m.weapon ~= weapon or m.phase ~= "post" then return end
    count = count + 1
    local owner = not driver and flight_owner() or nil
    emit(healing and healing() and M.HEAL or M.DAMAGE, m.x, m.y, false, false, owner)
    if count % 2 == 0 then emit(M.GLOW, m.x, m.y, false, true, owner) end
  end)
end`,
  },
  "wa.on.oil_explode": {
    source: "WormForgeNew/mods/px/lib/oil_drums.lua",
    code: `wa.on.oil_explode(function(ev)
  local kind = take(ev.drum)
  local burst = launched[ev.drum.uid] and LAUNCHED[kind] or BURST[kind]
  if not burst then return end
  ev:replace()
  burst(ev, owner_for(ev.team))
end)`,
  },
  "wa.on.turn_cleanup": {
    source: "WormForgeNew/mods/examples/tools/hello.lua",
    code: `wa.on.turn_cleanup(function(event)
  wa.log("turn cleaned up for worm " .. tostring(event.worm.id))
end)`,
  },
  "wa.on.turn_end": {
    source: "WormForgeNew/mods/examples/tools/hello.lua",
    code: `wa.on.turn_end(function(event)
  wa.log("movement ends for worm " .. tostring(event.worm.id))
end)`,
  },
  "wa.on.turn_retreat": {
    source: "WormForgeNew/mods/examples/tools/hello.lua",
    code: `wa.on.turn_retreat(function(event)
  wa.log("retreat begins for worm " .. tostring(event.worm.id))
end)`,
  },
  "wa.on.turn_start": {
    source: "WormForgeNew/mods/examples/labs/shuffle_panel.lua",
    code: `wa.on.turn_start(function()
  local layout = wa.panel.layout()
  -- By id first: a table's order isn't the same on every machine, and the
  -- shuffle must be (wa.random is the game's own, the same everywhere).
  local ids = {}
  for id in pairs(layout) do ids[#ids + 1] = id end
  table.sort(ids)
  local places = {}
  for i, id in ipairs(ids) do places[i] = layout[id] end
  for i = #places, 2, -1 do
    local j = wa.random(i)
    places[i], places[j] = places[j], places[i]
  end
  local moves = {}
  for i, id in ipairs(ids) do moves[id] = places[i] end
  wa.panel.set_layout(moves)
end)`,
  },
  "wa.on.weapon_grant": {
    source: "WormForgeNew/mods/utilities/weapons/plus_n.lua",
    code: `wa.on.weapon_grant(function(ev)
  local collector
  for _, worm in ipairs(wa.worms.all()) do
    if worm.id == ev.worm_id then collector = worm; break end
  end
  if not collector then return end
  for _, item in ipairs(ev.items) do
    if item.weapon == id and item.amount > 0 then
      local retreat = wa.world.retreat() > 0
      if not retreat then
        collect(collector, item.amount, false)
      elseif retreat_collect == "activate" then
        collect(collector, item.amount, true)
      elseif retreat_collect == "nothing" then
        discard_pickup(collector, item.amount)
      end -- "keep": bank the award for the next turn's automatic use.
    end
  end
end)`,
  },
  "wa.on.worm_message": {
    source: "WormForgeNew/mods/examples/labs/q_bazooka.lua",
    code: `return function()
  local prev_q = {}

  wa.on.worm_message(function(worm, msg)
    if msg ~= wa.msg.FRAME_FINISH then
      return
    end
    if not worm.turn then
      prev_q[worm.id] = false
      return
    end
    local q = wa.world.keys().q
    if q and not prev_q[worm.id] then
      if worm.weapon ~= "stock.bazooka" then
        local ammo = worm:equip("stock.bazooka")
        wa.log("Q equip bazooka ammo=" .. tostring(ammo))
      end
    end
    prev_q[worm.id] = q
  end, { msgs = { wa.msg.FRAME_FINISH } })
end`,
  },
  "WorldHandle": {
    source: "WormForgeNew/mods/px/weapons/lightning_strike.lua",
    code: `local function strike_hit(s)
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
end`,
  },
  "WorldHandle:arm": {
    source: "WormForgeNew/mods/px/lib/px_blast_zone.lua",
    code: `local function boom(z, obj)
  local b = wa.actors.spawn({
    sprite = false, x = z.x, y = z.y, gravity = false, collide = false,
    owner = z.owner, on = function() end,
  })
  b:explode({ damage = DAMAGE, id = PUSH, below = false })
  if not b.dead then b:despawn() end
  -- PX then arms the mine that tripped the zone, rather than leaving it to be
  -- caught by the blast (:288-303): \`Active = 0\` and \`Prefuse <= 0\` are the
  -- engine's "not armed yet", which is \`fuse < 0\` here, and the random 1-5
  -- seconds are the dev's own \`TriggerMine\`
  -- (\`mods/px/weapons/electromagnet.lua:61-77\`).
  if obj.kind == "mine" then
    local fuse = obj.fuse
    if not fuse or fuse < 0 then fuse = wa.random(MINE_FUSE_MIN, MINE_FUSE_MAX) end
    obj:arm(fuse)
  end
end`,
  },
  "WorldHandle:fits": {
    source: "WormForgeNew/mods/px/lib/portals.lua",
    code: `function Network:move(body)
  local kind = body.kind or "worm"
  if kind == "worm" and (body.hp <= 0 or body.taken) then return false end
  local key = identity(body)
  local x, y, vx, vy = body.x, body.y, body.vx, body.vy
  local last = self.last_exit[key]
  if last then
    if inside(last, x, y) then return false end
    self.last_exit[key] = nil
  end
  local entry, exit, best
  for _, group in ipairs(wa.sorted(self.pairs)) do
    local pair = self.pairs[group]
    if pair.active and pair[1] and pair[2] then
      for colour = 1, 2 do
        local p = pair[colour]
        local t = crossing(p, x, y, vx, vy)
        if t and (not best or t < best) then entry, exit, best = p, pair[3-colour], t end
      end
    end
  end
  if not entry then return false end
  if best > 0 then
    local hit = wa.land.trace(x, y, x + vx * best, y + vy * best)
    if hit and hit.hit then return false end
  end
  local tx, ty = exit.exit_x, exit.exit_y
  if self.clearance then
    tx, ty = self.clearance(body, exit)
    if not tx then return false end
  elseif not body:fits(tx, ty, "terrain") then
    -- PX's emergency clearance. Do not transport into a still blocked exit.
    wa.land.cut({x = tx, y = ty, shape = "circle", radius = 15})
    if not body:fits(tx, ty, "terrain") then return false end
  end
  local nvx, nvy, facing = self.velocity(kind, entry.dir, exit.dir, vx, vy, body.facing)
  local spec = { x = tx, y = ty, vx = nvx, vy = nvy }
  if kind == "worm" then spec.facing = facing end
  if not body:warp(spec) then return false end
  self.last_exit[key] = exit
  if self.on_transport then self.on_transport(body, entry, exit) end
  return true
end`,
  },
  "WorldHandle:hit": {
    source: "WormForgeNew/mods/px/weapons/bowling_ball.lua",
    code: `local function hit(obj)
  if not overlaps(b, obj) then return end
  local damage = 0
  if obj.kind == "worm" then
    if obj.hp <= 0 or (recover[obj.id] or 0) > clock then return end
    damage = dmg
    recover[obj.id] = clock + RECOVER_FRAMES
  elseif obj.kind == "crate" or obj.kind == "oil" then
    damage = OBJECT_DAMAGE
  else
    damage = dmg
  end
  damage = trunc(damage)
  if damage <= 0 then return end
  local fx, fy = b.rvx, b.rvy
  local ax = math.abs(fx)
  local crushed = obj.kind == "worm" and CRUSHABLE[obj.state] and fy > FAST and ax / fy < 0.2
  if crushed then
    fx, fy = 0, 10
  else
    fy = fy < 0 and fy - ax or fy - 2 * ax
    fx, fy = fx * DAMAGE_FORCE, fy * DAMAGE_FORCE
  end
  if obj.kind == "worm" then
    obj:hurt({ amount = damage, vx = fx, vy = fy })
  else
    obj:hit(damage, fx, fy)
  end
  a:sound(crushed and SOUND_CRUSH or SOUND_HIT)
end`,
  },
  "WorldHandle:remove": {
    source: "WormForgeNew/mods/px/weapons/sentry_laser.lua",
    code: `local function fire(t, a, s, target)
  local ang = math.rad(s.angle)
  local x0, y0 = turret.muzzle(t, a, s.angle)
  local hx, hy = target.x, target.y
  local land = turret.trace(a, x0, y0, hx, hy)
  if land then hx, hy = land.x, land.y end
  local lx, ly = (hx - x0), (hy - y0)
  local length = math.sqrt(lx * lx + ly * ly)
  local dx, dy = 0, 0
  if length > 0 then dx, dy = lx / length, ly / length end

  local r = { x = x0, y = y0, hx = hx, hy = hy, life = RAY_LIFE, size = 1.0, fx = {},
    ang = ang, rgb = BEAM_RGB[s.alliance + 1] or { 125, 125, 125 },
    seed = (x0 // 1 * 7919 + y0 // 1) % 0x80000000 }
  rays[#rays + 1] = r
  a:sound("sounds/laser_gun/laser_start.wav")

  wa.land.cut({ x = hx, y = hy, shape = "circle", radius = HOLE })
  for _, obj in ipairs(touched(x0, y0, dx, dy, length, target.obj and target.obj.id)) do
    if obj.kind == "worm" then
      if obj.hp > 0 then obj:hurt(WORM_DAMAGE) end
    elseif obj.kind == "crate" or obj.kind == "oil" then
      obj:hit(OBJECT_DAMAGE, dx, dy)
    elseif obj.kind == "mine" and not s.armed[obj.id] then
      s.armed[obj.id] = true
      obj:arm(obj.fuse < 0 and wa.random(1000, 5000) or obj.fuse)
    end
    fx_hit_object(r, obj.x + (3 * dx), obj.y + (3 * dy))
  end

  -- A shot stopped by intervening terrain cannot destroy a target beyond it.
  if not land then
    if target.ball then
      shared.remove_bowling_ball(target.ball)
    elseif target.obj then
      target.obj:remove()
    end
    fx_disintegrate(r, target.x, target.y)
    a:sound(SND .. "sentrylaserdisin.wav")
    -- The target is gone: acquire the next one with its own beep and delay.
    s.tid, s.had_target = nil, false
  end
  ray_actor(r, a)

  t.stop_firing(a, s)
  s.recoil = RECOIL_FRAMES
  s.ammo = s.ammo - 1
  if s.ammo <= 0 then s.active = false end
end`,
  },
  "WorldHandle:revive": {
    source: "WormForgeNew/mods/px/weapons/lightning_strike.lua",
    code: `local function strike_hit(s)
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
end`,
  },
  "WorldHandle:warp": {
    source: "WormForgeNew/mods/px/lib/portals.lua",
    code: `function Network:move(body)
  local kind = body.kind or "worm"
  if kind == "worm" and (body.hp <= 0 or body.taken) then return false end
  local key = identity(body)
  local x, y, vx, vy = body.x, body.y, body.vx, body.vy
  local last = self.last_exit[key]
  if last then
    if inside(last, x, y) then return false end
    self.last_exit[key] = nil
  end
  local entry, exit, best
  for _, group in ipairs(wa.sorted(self.pairs)) do
    local pair = self.pairs[group]
    if pair.active and pair[1] and pair[2] then
      for colour = 1, 2 do
        local p = pair[colour]
        local t = crossing(p, x, y, vx, vy)
        if t and (not best or t < best) then entry, exit, best = p, pair[3-colour], t end
      end
    end
  end
  if not entry then return false end
  if best > 0 then
    local hit = wa.land.trace(x, y, x + vx * best, y + vy * best)
    if hit and hit.hit then return false end
  end
  local tx, ty = exit.exit_x, exit.exit_y
  if self.clearance then
    tx, ty = self.clearance(body, exit)
    if not tx then return false end
  elseif not body:fits(tx, ty, "terrain") then
    -- PX's emergency clearance. Do not transport into a still blocked exit.
    wa.land.cut({x = tx, y = ty, shape = "circle", radius = 15})
    if not body:fits(tx, ty, "terrain") then return false end
  end
  local nvx, nvy, facing = self.velocity(kind, entry.dir, exit.dir, vx, vy, body.facing)
  local spec = { x = tx, y = ty, vx = nvx, vy = nvy }
  if kind == "worm" then spec.facing = facing end
  if not body:warp(spec) then return false end
  self.last_exit[key] = exit
  if self.on_transport then self.on_transport(body, entry, exit) end
  return true
end`,
  },
  "WormEntity": {
    source: "WormForgeNew/mods/examples/labs/q_bazooka.lua",
    code: `local prev_q = {}

wa.on.worm_message(function(worm, msg)
  if msg ~= wa.msg.FRAME_FINISH then
    return
  end
  if not worm.turn then
    prev_q[worm.id] = false
    return
  end
  local q = wa.world.keys().q
  if q and not prev_q[worm.id] then
    if worm.weapon ~= "stock.bazooka" then
      local ammo = worm:equip("stock.bazooka")
      wa.log("Q equip bazooka ammo=" .. tostring(ammo))
    end
  end
  prev_q[worm.id] = q
end, { msgs = { wa.msg.FRAME_FINISH } })`,
  },
  "WormEntity:ammo": {
    source: "WormForgeNew/mods/examples/labs/hurt_lab.lua",
    code: `local TEN = "labs.hurt_lab"

wa.on.worm_message(function(worm, msg)
  if msg ~= wa.msg.FIRE_WEAPON then
    return
  end
  if worm.weapon ~= TEN then
    return
  end
  local ammo = worm:ammo(TEN)
  if ammo == 0 then
    return "eat"
  end
  if ammo > 0 then
    worm:ammo(TEN, -1)
  end
  for _, w in ipairs(wa.worms.all()) do
    if w.alliance ~= worm.alliance and w.hp > 0 then
      w:hurt(10)
    end
  end
  return "eat"
end, { msgs = { wa.msg.FIRE_WEAPON } })`,
  },
  "WormEntity:carry": {
    source: "WormForgeNew/mods/examples/labs/worm_toss.lua",
    code: `local function tick(a)
  local down = wa.world.pointer().down

  if held then
    hist[#hist + 1] = { x = a.x, y = a.y }
    if #hist > 4 then
      table.remove(hist, 1)
    end
    if not origin then
      origin = { px = a.x, py = a.y, wx = held.x, wy = held.y }
    end
    held:carry(origin.wx + (a.x - origin.px), origin.wy + (a.y - origin.py))
    if prev_down and not down then
      release()
    end
  elseif down and not prev_down then
    try_grab(a.x, a.y)
  end

  prev_down = down
end`,
  },
  "WormEntity:drop": {
    source: "WormForgeNew/mods/examples/pooz/weapons.lua",
    code: `local function restore(worm, a)
  live[worm.id] = nil
  if a then
    worm.x = a.x
    worm.y = a.y
  end
  worm.visible = true
  worm:drop()
end`,
  },
  "WormEntity:equip": {
    source: "WormForgeNew/mods/examples/labs/q_bazooka.lua",
    code: `local prev_q = {}

wa.on.worm_message(function(worm, msg)
  if msg ~= wa.msg.FRAME_FINISH then
    return
  end
  if not worm.turn then
    prev_q[worm.id] = false
    return
  end
  local q = wa.world.keys().q
  if q and not prev_q[worm.id] then
    if worm.weapon ~= "stock.bazooka" then
      local ammo = worm:equip("stock.bazooka")
      wa.log("Q equip bazooka ammo=" .. tostring(ammo))
    end
  end
  prev_q[worm.id] = q
end, { msgs = { wa.msg.FRAME_FINISH } })`,
  },
  "WormEntity:fits": {
    source: "WormForgeNew/mods/px/weapons/tele_arrow.lua",
    code: `local function teleport(event)
  local worm
  for _, w in ipairs(wa.worms.all()) do
    if w.turn and w.hp > 0 then worm = w; break end
  end
  if not worm then return end
  local x, y = event.x, event.y
  if worm:fits(x, y) then worm:warp({x=x,y=y}); return end
  -- Source scan: centre first, then eleven columns on each of eleven rows.
  -- Bound the search even when the entire destination is obstructed.
  x, y = math.floor(x), math.floor(y)
  for row = 0, 10 do
    for column = 0, 10 do
      local px, py = x - 4 + column, y - 4 + row
      if worm:fits(px, py) then worm:warp({x=px,y=py}); return end
    end
  end
end`,
  },
  "WormEntity:freeze": {
    source: "WormForgeNew/mods/px/weapons/ice_arrow.lua",
    code: `wa.on.worm_message(function(worm)
  if pending[worm.id] then
    pending[worm.id] = nil
    worm:freeze()
  end
end, { msgs = { wa.msg.FRAME_FINISH } })`,
  },
  "WormEntity:heal": {
    source: "WormForgeNew/mods/px/weapons/lightning_strike.lua",
    code: `local function strike_hit(s)
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
end`,
  },
  "WormEntity:commit_health": {
    source: "WormForgeNew/mods/utilities/features/live_hp.lua",
    code: `-- Live HP, originally by reddaz. Commit WA's pending health display directly;
-- native hit, movement, freeze and death handling retain their own states.
wa.on.hurt(function(hit)
  if hit.phase ~= "post" or hit.lost <= 0 then return end
  local worm = hit.worm
  -- Keep the active worm's normal health timing. A zero-HP victim can
  -- update its label now while WA still owns its later death sequence.
  if not worm.turn and worm.hp >= 0 then
    worm:commit_health()
  end
end)`,
  },
  "WormEntity:allow_death": {
    source: "WormForgeNew/mods/utilities/features/instant_death.lua",
    code: `-- Let each zero-HP victim die once its own movement settles, without waiting
-- for the battlefield. Frame polling also covers falls and direct HP writes.
-- WA owns the death animation, explosion and grave; repeat requests are inert.
wa.on.worm_message(function(worm)
  if not worm.turn and worm.hp == 0 then
    worm:allow_death()
  end
end, { msgs = { wa.msg.FRAME_FINISH } })`,
  },
  "WormEntity:hurt": {
    source: "WormForgeNew/mods/examples/labs/hurt_lab.lua",
    code: `local TEN = "labs.hurt_lab"

wa.on.worm_message(function(worm, msg)
  if msg ~= wa.msg.FIRE_WEAPON then
    return
  end
  if worm.weapon ~= TEN then
    return
  end
  local ammo = worm:ammo(TEN)
  if ammo == 0 then
    return "eat"
  end
  if ammo > 0 then
    worm:ammo(TEN, -1)
  end
  for _, w in ipairs(wa.worms.all()) do
    if w.alliance ~= worm.alliance and w.hp > 0 then
      w:hurt(10)
    end
  end
  return "eat"
end, { msgs = { wa.msg.FIRE_WEAPON } })`,
  },
  "WormEntity:jetpack_steer": {
    source: "WormForgeNew/mods/px/weapons/helicopter.lua",
    code: `local function heli_frame(worm)
  local h = helis[worm.id]
  local state = worm.state
  -- WS_FIRED: WA winding up the Helicopter; PX shows its climb-in. This is
  -- also where it is armed: once it fires, WA may already have cleared the
  -- worm's selection (its last shot of the Helicopter), and PX decides at
  -- FireFinal, from the weapon actually fired.
  if worm.weapon == "px.helicopter" and state == "prefiring" and not (h and h.flying) then
    h = heli_of(worm)
    h.jumpin, h.armed = true, true
    h.jump_phase = h.jump_phase + 0.047
  end
  -- FireFinal: the jet pack it wound up has started.
  if h and h.armed and state == "jetpacking" and not h.flying then
    -- The native record holds only a byte; worm.fuel is 16.16 and carries
    -- the full profile amount, once per launch, before this frame's burn.
    worm.fuel = shared.helicopter_fuel or 100
    worm.gravity = HELI_REALISTIC and 0.2 or 0
    worm:jetpack_steer(true)
    h.flying, h.launch, h.ticks, h.armed = true, true, 0, false
  elseif h and h.armed and not worm.turn then
    h.armed = false -- the turn ended before it fired
  end
  if not h then
    return
  end
  if h.flying then
    if state ~= "jetpacking" then
      -- WA owns the landing and its resulting state. Only remove our art
      -- and physics overrides when WA has ended the jet pack.
      worm:jetpack_steer(false)
      worm.gravity, worm.wind = 1, 0
      h.flying = false
      heli_drop_art(h, worm)
      return
    end
    local vx, vy = worm.vx, worm.vy
    -- Rotor and radio, while it moves.
    if vx ~= 0 or vy ~= 0 then
      if h.ticks % 47 == 0 then wa.sound.play(worm, "sounds/helicopter/helicopterloop.wav") end
      local radio = wa.random(1, 200)
      if radio % 20 == 0 and radio <= 80 then
        wa.sound.play(worm, "sounds/helicopter/" .. (radio // 20) .. ".wav")
      end
    end
    h.ticks = h.ticks + 1
    if worm.y >= wa.world.water() then
      heli_crash(worm, h, vx, vy)
      return
    end
    if h.launch then
      h.jump_phase, h.jumpin, h.launch = 0, false, false
      if HELI_REALISTIC then worm.wind = 0.2 end
    end
    local k = worm.keys
    local up, down, left, right = k.up, k.down, k.left, k.right
    if not up and not down then vy = vy / 1.105 end
    if not left and not right then vx = vx / 1.105 end
    if up and down then vy = vy / 1.095 end
    if left and right then vx = vx / 1.095 end
    -- Diagonals: PX's lines damp each pair twice.
    for _, d in ipairs({ { up, right }, { up, left }, { down, right }, { down, left } }) do
      if d[1] and d[2] then
        vx, vy = vx * 0.99 * 0.99, vy * 0.99 * 0.99
      end
    end
    h.frame = (h.frame + 1) % 3
    local fuel = worm.fuel
    local burn = wa.world.retreat() == 0
    if burn then fuel = fuel - 0.020 end
    local shift = wa.world.keys().shift
    if up then
      if burn then fuel = fuel - 0.2 end
      vy = push(vy, -1)
    end
    if down then
      if burn then fuel = fuel - 0.020 end
      vy = push(vy, 1)
    end
    if left then
      if burn then fuel = fuel - 0.1 end
      if not shift then worm.facing = -1 end
      vx = push(vx, -1)
    end
    if right then
      if burn then fuel = fuel - 0.1 end
      if not shift then worm.facing = 1 end
      vx = push(vx, 1)
    end
    worm.vx, worm.vy, worm.fuel = vx, vy, fuel
    if worm.fuel <= 0.1 then
      heli_crash(worm, h, worm.vx, worm.vy)
      return
    end
    if HELI_EXPLODE_ON_TURN_END and not worm.turn then
      heli_crash(worm, h, worm.vx, worm.vy)
      return
    end
  end
  -- What PX draws in the worm's place.
  local f = worm.facing
  if h.flying then
    if h.climb then h.climb:despawn(); h.climb = nil end
    h.body = h.body or heli_actor(worm, "sprites/helicopter/flying.png")
    local a = h.body
    a.x, a.y, a.vx, a.vy, a.facing = worm.x, worm.y, 0, 0, f
    a:frame(h.frame)
    a:gfx({ angle = math.deg(wa.math.sin(worm.vx / 24)) % 360, depth = HELI_DEPTH })
    worm.body_visible = false
  elseif h.jumpin and state == "prefiring" then
    h.climb = h.climb or heli_actor(worm, "sprites/helicopter/jumpin.png")
    local a = h.climb
    a.x = worm.x + (f > 0 and -11.5 or 12.5)
    a.y, a.vx, a.vy, a.facing = worm.y + 1, 0, 0, f
    a:frame(math.min(math.floor(h.jump_phase * 23), 22))
    a:gfx({ depth = HELI_DEPTH })
    worm.body_visible = false
  elseif h.body or h.climb then
    h.jumpin, h.jump_phase = false, 0
    heli_drop_art(h, worm)
  end
end`,
  },
  "WormEntity:jump": {
    source: "WormForgeNew/mods/px/weapons/double_jump.lua",
    code: `wa.on.worm_message(function(worm, msg)
  if msg == wa.msg.FRAME_FINISH then
    if on and not armed and worm.turn and GROUNDED[worm.state_id] then
      armed = true
    end
  elseif msg == wa.msg.FIRE_WEAPON then
    if worm.weapon ~= id then
      return
    end
    if on then
      on, armed = false, false
    else
      on, armed = true, true
      worm:ammo(id, -1)
    end
    require("lib/weapon_hint").notice(worm, on and "Double Jump: ON" or "Double Jump: OFF")
    return "eat"
  elseif msg == wa.msg.JUMP or msg == wa.msg.JUMP_UP then
    if not (armed and worm.turn and not worm.taken and in_jump(worm)) then
      return
    end
    armed = false
    -- WA's take-off, with the jump the worm last made.
    worm:jump()
    return "eat"
  end
end, { msgs = { wa.msg.FRAME_FINISH, wa.msg.FIRE_WEAPON, wa.msg.JUMP, wa.msg.JUMP_UP } })`,
  },
  "WormEntity:release": {
    source: "WormForgeNew/mods/px/weapons/hang_glider.lua",
    code: `local function glider_close(worm, g, landing, hard_landing)
  g.deployed = false
  -- A gentle landing can spend several frames falling under WA's control
  -- before WA stands the worm up. Keep the wing over its body until the
  -- pack-away takes its place, so it never flashes empty-handed. Only
  -- looks: if it fails, the worm still goes back to WA below.
  local looks, err = pcall(function()
    if landing then
      g.art = g.art or glider_art(worm, worm.x, worm.y, "sprites/hang_glider/glider.png")
      worm.body_visible = false
    else
      glider_drop_art(worm, g)
    end
    wa.sound.play(worm, "sounds/hang_glider/hangclose.wav")
  end)
  if not looks then
    wa.log("hang glider: closing without its art: " .. tostring(err))
  end
  g.landing = landing and GLIDER_PACK_WAIT or nil
  g.unstand = not (landing or hard_landing) and GLIDER_UNSTAND or nil
  if worm.taken then
    local vx, vy = g.sx, g.sy
    if hard_landing then
      worm:release(vx, vy, { suppress_auto_parachute = true })
    else
      worm:release(vx, vy)
    end
  end
end`,
  },
  "WormEntity:set_state": {
    source: "WormForgeNew/mods/user_mods/roaming_bees/semantic_all_rules.lua",
    code: `local function everySettableStateIsFine(worm)
  worm:set_state("standing")
  worm:set_state("sliding")
  worm:set_state("bungee")
  worm:set_state("tumbling")
  worm:set_state("sinking")   -- misrepresented, its actually tumbling, sinking is a worm drowning.
  worm:set_state("teleporting")
  -- EXPECT: 0 findings on both sides.
end`,
  },
  "WormEntity:take": {
    source: "WormForgeNew/mods/px/weapons/electric_grenade.lua",
    code: `local function progress_arc(arc)
  arc.explosion = arc.explosion + 1
  for i = #arc.pending, 1, -1 do
    local p = arc.pending[i]
    p.time = p.time - 1
    if p.time <= 0 then
      zap_target(arc, p)
      table.remove(arc.pending, i)
    end
  end
  if arc.pause > 0 then arc.pause = arc.pause - 1; return end
  if arc.life <= 0 then
    if #arc.points > 0 then table.remove(arc.points, 1) end
    return
  end
  arc.life = arc.life - 1
  local target, distance = closest_target(arc)
  if target then
    local dx, dy = target.x - arc.x, target.y - arc.y
    local d = math.sqrt(distance)
    if d <= 10 then
      local key = target_key(target)
      arc.ignore[key] = true
      arc.pending[#arc.pending + 1] = { key = key, side = dx < 0 and -1 or 1, time = 24 }
      if target.kind == "worm" then
        if tazed[key] then
          tazed[key].count = tazed[key].count + 1
        else
          tazed[key] = { x = target.x, y = target.y, count = 1, worm = target,
            sheet = wa.random(1, 2) == 1 and "sprites/electric_grenade/tazed1.png" or "sprites/electric_grenade/tazed2.png" }
        end
        target.body_visible = false
        -- Held where it stands, the turn stopped, until the zap.
        target:take{ turn = "freeze" }
      end
      arc.x, arc.y = target.x, target.y
      arc.life = 20
      arc.pause = 14
      add_point(arc)
      return
    end
    local pull = math.min(1, math.sqrt(10 / d))
    arc.dx = arc.dx + ((dx / d) - arc.dx) * pull
    arc.dy = arc.dy + ((dy / d) - arc.dy) * pull
  else
    arc.dx = arc.dx + wa.random(-100, 100) / 100
    arc.dy = arc.dy + wa.random(-100, 100) / 100
  end
  local norm = math.sqrt(arc.dx * arc.dx + arc.dy * arc.dy)
  if norm < 0.01 then arc.dx, arc.dy = 0, -1 else arc.dx, arc.dy = arc.dx / norm, arc.dy / norm end
  local nx, ny = arc.x + arc.dx * 20, arc.y + arc.dy * 20
  local land = wa.land.trace(arc.x, arc.y, nx, ny)
  if land then
    if land.starts_solid then arc.life = 0; return end
    -- Follow the tangent that moves closer to the target, as PX's arc does.
    local tx, ty = land.tx or 1, land.ty or 0
    if target then
      local a = sq(target.x - (land.x + tx * 10)) + sq(target.y - (land.y + ty * 10))
      local b = sq(target.x - (land.x - tx * 10)) + sq(target.y - (land.y - ty * 10))
      if b < a then tx, ty = -tx, -ty end
    end
    arc.dx, arc.dy = tx, ty
    arc.x, arc.y = land.x + (land.nx or 0) * 10 + tx * 10,
      land.y + (land.ny or -1) * 10 + ty * 10
  else
    arc.x, arc.y = arc.x + arc.dx * 10, arc.y + arc.dy * 10
  end
  add_point(arc)
end`,
  },
  "WormEntity:teleport_pose": {
    source: "WormForgeNew/mods/px/weapons/super_tele.lua",
    code: `fires.super_tele_click = function(ev)
  local worm = ev.worm
  if worm.hp <= 0 then return end
  local y = ev.y
  if wa.world.cavern() and y < 19 then y = 19 end
  local previous = fires.teleports[worm.id]
  if previous and previous.marker then previous.marker:despawn() end
  -- Waiting 50 frames there makes an unplaced worm fall and take damage
  -- before the arrival, so it is placed now. It sounds like WA's own
  -- placement.
  if unplaced(worm) then
    super_tele_arrive(worm, ev.x, y)
    worm:teleport_pose()
    wa.sound.play(worm, SOUND_COMMUNICATOR, TELE_SOUND_PRIORITY)
    fires.teleports[worm.id] = { placed = true, frames = 0 }
    return
  end
  -- FireWeapon clears WA's planted X for click-only weapons. Keep a fixed
  -- stock planted-X marker at the saved target until the worm arrives instead;
  -- the engine plays it once, as WA plays its own.
  local marker = wa.actors.spawn({
    owner = worm, x = ev.x, y = y, sprite = "markerr",
    gravity = false, collide = false, drown = false,
  })
  fires.teleports[worm.id] = { x = ev.x, y = y, frames = 0, pending = true, marker = marker }
  wa.sound.play(worm, SOUND_COMMUNICATOR, TELE_SOUND_PRIORITY) -- PX's M_SETTARGET confirmation
end`,
  },
  "WormEntity:warp": {
    source: "WormForgeNew/mods/px/weapons/tele_arrow.lua",
    code: `local function teleport(event)
  local worm
  for _, w in ipairs(wa.worms.all()) do
    if w.turn and w.hp > 0 then worm = w; break end
  end
  if not worm then return end
  local x, y = event.x, event.y
  if worm:fits(x, y) then worm:warp({x=x,y=y}); return end
  -- Source scan: centre first, then eleven columns on each of eleven rows.
  -- Bound the search even when the entire destination is obstructed.
  x, y = math.floor(x), math.floor(y)
  for row = 0, 10 do
    for column = 0, 10 do
      local px, py = x - 4 + column, y - 4 + row
      if worm:fits(px, py) then worm:warp({x=px,y=py}); return end
    end
  end
end`,
  },
};

export function docSnippetFor(key: string): DocSnippet | undefined {
  return DOC_SNIPPETS[key];
}
