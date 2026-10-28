-- Electric Grenade: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  handling = {
    remember_selection = true,
    ends_turn = true,
  },
}

weapon.missile_sprite = { -- Electric Grenade (electric_grenade_anim: electric_grenade_bullet)
    sheet = "sprites/px_hold/electric_grenade.png", frames = 1,
    spin = true, -- its record's WAT_Rotation
    -- PX's record has sprite 0; the pack's stock grenade is only for the
    -- worm's throw sheet.
    hide = true,
  }

function weapon.definition()
  local shared = require("lib/shared")
  local sdk = require("wf-lib/holds")
  local PX_POSTURE, PX_HANDS = sdk.PX_POSTURE, sdk.PX_HANDS
  return require("lib/weapon").merge(weapon.record, {
    wep = "weps/earthquake.wep",
    panel_icon = "sprites/electric_grenade/icon.png",
    sprite = "grenade",
    worm_sprites = PX_POSTURE,
    sprites = { "sprites/px_hold/electric_grenade.png" },
    sounds = { "sounds/lightning/tazer_loop.wav" },
    params = { gpu_prefix = "sprites/px_hold/" },
    on_explode = function(ev) shared.electric_grenade_explode(ev) end,
    hold = { -- Electric Grenade (electric_grenade_anim)
        thrown = true,
        sheet = "sprites/px_hold/electric_grenade.png", hand_type = 1,
        hand_radius = 15, hand_scale = 0.8,
        weap_rotation = 0.5, weap_radius = 9,
        hand = PX_HANDS[1],
    },
  })
end

weapon.requires = { "weapons/sniper_rifle", "weapons/lightning_strike", "lib/electrical" }

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

  local function target_key(obj)
    return obj.kind .. ":" .. obj.id
  end

  local function find_target(key)
    local ball = key:match("^ball:(%d+)$")
    if ball then
      return shared.bowling_ball_target and shared.bowling_ball_target(tonumber(ball))
    end
    for _, obj in ipairs(electrical_targets(false)) do
      if target_key(obj) == key then return obj end
    end
  end

  local function closest_target(arc)
    local best, distance = nil, sq(200)
    local targets = wa.world.electrical_nearby
      and wa.world.electrical_nearby(arc.x, arc.y, 200, false) or electrical_targets(false)
    local function consider(obj)
      local key = target_key(obj)
      if not arc.ignore[key] and (obj.kind ~= "worm" or obj.hp > 0) then
        local dx, dy = obj.x - arc.x, obj.y - arc.y
        local d = dx * dx + dy * dy
        if d < distance then best, distance = obj, d end
      end
    end
    for _, obj in ipairs(targets) do consider(obj) end
    -- PX's Tazer takes Bowling Balls too.
    if shared.bowling_ball_targets then
      for _, obj in ipairs(shared.bowling_ball_targets()) do consider(obj) end
    end
    return best, distance
  end

  local function release_taze(key)
    local hold = tazed[key]
    if not hold then return end
    hold.count = hold.count - 1
    if hold.count > 0 then return end
    -- The worm the hold took, not a fresh lookup: an earlier zap may have
    -- killed it, and the worm lists leave dead worms out. Left held, a dead
    -- worm never comes to rest, so WA never runs its death and the turn,
    -- frozen by the hold, never ends.
    local worm = hold.worm
    -- Knocked flying meanwhile, the engine has already let it go.
    if worm.taken then worm:release(0, 0) end
    worm.body_visible = true
    tazed[key] = nil
  end

  -- The worm that last fired the Electric Grenade, as PX keeps it at the
  -- fire: the grenade's arc never zaps its thrower. The explosion's own
  -- worm (ev.worm) need not be the thrower.
  local thrower

  -- A tazed worm is the pack's (worm:take): the engine eats its moves and
  -- jumps; it cannot start a shot either.
  wa.on.worm_message(function(worm, msg)
    if msg ~= wa.msg.FIRE_WEAPON then return end
    if tazed[target_key(worm)] then return "eat" end
    if worm.weapon == "px.electric_grenade" then thrower = worm end
  end, { msgs = { wa.msg.FIRE_WEAPON } })

  local function zap_target(arc, pending)
    local obj = find_target(pending.key)
    release_taze(pending.key)
    if not obj then return end
    if obj.kind == "worm" then
      obj:hurt(24)
      obj.vx, obj.vy = pending.side * 1.2, -4
    elseif obj.kind == "mine" then
      obj:arm(400)
    elseif obj.kind == "crate" or obj.kind == "oil" then
      obj:hit(12, pending.side * 1.2, -4)
    elseif obj.kind == "ball" then
      shared.zap_bowling_ball(obj.id)
    end
  end

  -- The arc keeps every point it passed, from the grenade to where it ends,
  -- links included: the whole chain stays drawn until the arc dies.
  -- wa.draw.ribbon draws at most 256.
  local ARC_MAX_POINTS = 256
  local function add_point(arc)
    arc.points[#arc.points + 1] = { arc.x, arc.y }
    if #arc.points > ARC_MAX_POINTS then table.remove(arc.points, 1) end
  end

  local function progress_arc(arc)
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
  end

  shared.electric_grenade_explode = function(ev)
    -- `ev.life`: frames the arc searches, PX's TazerLifeTime (the drum's 30).
    local arc = { x = ev.x, y = ev.y, dx = 0, dy = -1, life = ev.life or 16, pause = 0,
      points = { { ev.x, ev.y } }, ignore = {}, pending = {}, explosion = 0,
      burst_x = ev.x, burst_y = ev.y, sound_age = 0 }
    if thrower then arc.ignore[target_key(thrower)] = true end
    if ev.worm then arc.ignore[target_key(ev.worm)] = true end
    arcs[#arcs + 1] = arc
    -- An explosion without a worm would leave the driver owned by the exploding
    -- grenade: the turn's worm owns it then, as every other effect's.
    local driver = effect_actor(ev.x, ev.y, ev.worm or current_worm(), function(a)
      arc.sound_age = arc.sound_age + 1
      if arc.life > 0 and arc.sound_age % 46 == 0 then
        wa.sound.play(a, "sounds/lightning/tazer_loop.wav")
      end
      progress_arc(arc)
      if arc.life <= 0 and #arc.points == 0 and #arc.pending == 0 then
        for i, held in ipairs(arcs) do
          if held == arc then table.remove(arcs, i); break end
        end
        a:despawn()
      end
    end)
    wa.sound.play(driver, "sounds/lightning/tazer_loop.wav")
  end

  c.find_target = find_target
end

return weapon
