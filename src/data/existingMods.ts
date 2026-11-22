import { ModFolderInfo } from '../types/wormforge';

// GENERATED FILE -- do not edit by hand.
//
// Regenerate with:  npm run gen:corpus
// Source of truth:   examples/
// Built by:          scripts/__gen_corpus.ts
//
// The previous hand-maintained version had already drifted: it told users that
// require() was nil in the sandbox, which stopped being true once pack-scoped
// require landed (crates/lua-host/src/modules.rs, wired into lib.rs:90). Every
// file below is read straight out of the curated examples/ folder instead, so it
// cannot go stale without the change showing up in git.
//
// The set is curated: modern component entry points, not the engine's full
// example tree. Users who want breadth open the engine's real mods folder.
// `buildCorpus` throws if examples/ is missing or empty instead of silently
// writing a smaller corpus.
const PX_FILES: ModFolderInfo['files'] = [
      {
        path: 'components/highlander.lua',
        name: 'components/highlander.lua',
        language: 'lua',
        content: `-- Highlander rules: each worm gets one weapon per pool and takes a killed worm's hand.

local shared = require("lib/shared")

local function pools_from(placed)
  local out = {
    offensive = {}, second = {}, movement = {},
    cave_offensive = {}, cave_second = {}, cave_movement = {},
  }
  for _, w in ipairs(placed) do
    local pool = w.options.pool
    if out[pool] then
      table.insert(out[pool], w.id)
      if w.options.cavern then
        table.insert(out["cave_" .. pool], w.id)
      end
    end
  end
  return out
end

return {
  install = function(ctx)
    require("components/loader").place(ctx)
    local pools = pools_from(ctx.placed)
    if #pools.offensive + #pools.second + #pools.movement == 0 then
      wa.log("highlander: no placed weapon is in a pool, so nothing is dealt")
      return
    end
    shared.pools = pools
    require("scheme/pools")
    require("scheme/state")
    require("scheme/highland_rules")
  end,
}
`
      },
      {
        path: 'components/kill_the_king.lua',
        name: 'components/kill_the_king.lua',
        language: 'lua',
        content: `-- Kill the King: the attackers must destroy the defenders' king before the timer runs out.

return function(ctx)
  local function option(key, fallback)
    if ctx and ctx.option then
      local value = ctx.option(key)
      if value ~= nil then return value end
    end
    return fallback
  end

  local TEAM = { red = 1, blue = 2, green = 3, yellow = 4, purple = 5, cyan = 6 }

  local KING_BOX_SIZE = 10
  local CHECK_INTERVAL_FRAMES = 5

  local CONFIG = {
    kingsCount = option("kings", "one") == "two" and 2 or 1,

    timeForAttackMs = (option("attack_time_seconds", 300) or 300) * 1000,

    timerType = option("timer_mode", "attack_only") == "defend_and_compensate"
      and "DefendAndCompensate" or "AttackOnly",

    timerCaption = "Remaining attack time:",

    attackersTeam = TEAM[option("attackers_team", "red")] or 1,
    defendersTeam = TEAM[option("defenders_team", "blue")] or 2,

    destructionPercentage = 75,

    king1 = {
      name = "Blue King",
      x1 = option("king1_x", 106) or 106,
      y1 = option("king1_y", 829) or 829,
      width = KING_BOX_SIZE,
      height = KING_BOX_SIZE,
      destructionPercentage = option("king1_destroy_percent", 70) or 70,
    },

    king2 = {
      name = "Red King",
      x1 = option("king2_x", 1420) or 1420,
      y1 = option("king2_y", 300) or 300,
      width = KING_BOX_SIZE,
      height = KING_BOX_SIZE,
      destructionPercentage = option("king2_destroy_percent", 70) or 70,
    },

    defenderGainMs = option("defender_gain_ms", 5) or 5,
    showTimer = option("show_timer", true),
    showKingHp = option("show_king_hp", true),
  }

  local MS_PER_FRAME = 20 -- 50 fps lockstep (1000ms / 50 = 20ms per frame)

  local initialized = false
  local matchOver = false
  local winningTeam = nil
  local winReason = ""

  local timerMs = CONFIG.timeForAttackMs or 300000
  local timerType = CONFIG.timerType or "AttackOnly"
  local attackersTeam = CONFIG.attackersTeam or 1
  local defendersTeam = CONFIG.defendersTeam or 2
  local defenderGainMs = CONFIG.defenderGainMs or 5

  local kings = {}
  local kingsCount = CONFIG.kingsCount or 1

  local lastWormId = 999999
  local frameCheckCounter = 0

  local CLEAN_EDGE_FRACTION = 0.25 + 0.05
  local CLEAN_KINDS = { mine = true, oil = true, crate = true }
  local cleanerDone = false

  local function cleanable(obj)
    return obj and CLEAN_KINDS[obj.kind] == true
  end

  local function collect_edge_objects(size, x0, x1)
    local out, seen = {}, {}
    local function add(obj)
      if not cleanable(obj) then return end
      local key = obj.id
      if seen[key] then return end
      seen[key] = true
      local x = obj.x
      if x and x >= x0 and x < x1 then
        out[#out + 1] = obj
      end
    end

    if wa.world.electrical_nearby then
      local step = 1000
      for cx = x0, x1, step do
        for cy = 0, size.h, step do
          for _, obj in ipairs(wa.world.electrical_nearby(cx, cy, step, false)) do
            add(obj)
          end
        end
      end
    else
      for _, group in ipairs({ wa.mines, wa.crates, wa.oil }) do
        for _, obj in ipairs(group.all()) do add(obj) end
      end
    end
    return out
  end

  local function discard_edge_object(obj, size)
    if obj.remove then
      local ok, removed = pcall(obj.remove, obj)
      if ok and removed then return true end
    end
    local out_x = obj.x < size.w / 2 and -16 or (size.w + 16)
    return obj:warp{ x = out_x, y = obj.y }
  end

  local function clean_edge_slices()
    local size = wa.world.size()
    if not size or size.w <= 0 or size.h <= 0 then return false end

    local edge = math.floor(size.w * CLEAN_EDGE_FRACTION)
    if edge < 1 then edge = 1 end

    local cleaned = 0
    for _, zone in ipairs({ { 0, edge }, { size.w - edge, size.w } }) do
      for _, obj in ipairs(collect_edge_objects(size, zone[1], zone[2])) do
        local ok, removed = pcall(discard_edge_object, obj, size)
        if ok and removed then
          cleaned = cleaned + 1
        end
      end
    end

    if cleaned > 0 then
      wa.log(string.format("[KTK] Object cleaner cleared %d edge object(s)", cleaned))
    end
    return true
  end

  local function run_cleaner()
    if cleanerDone then return end
    local ok, result = pcall(clean_edge_slices)
    if not ok then
      cleanerDone = true
      wa.log("[KTK WARNING] Object cleaner failed: " .. tostring(result))
    elseif result then
      cleanerDone = true
    end
  end

  local function init_king(cfg, id)
    if not cfg then return nil end

    local totalSolid = 0
    local x1 = cfg.x1
    local y1 = cfg.y1
    local x2 = cfg.x1 + cfg.width
    local y2 = cfg.y1 + cfg.height

    for x = x1, x2 - 1 do
      for y = y1, y2 - 1 do
        if wa.land.solid(x, y) then
          totalSolid = totalSolid + 1
        end
      end
    end

    local active = true
    if totalSolid == 0 then
      wa.log(string.format("[KTK WARNING] King %d box (%d,%d) has 0 solid pixels! Win check disabled to prevent instant loss.", id, x1, y1))
      active = false
    end

    local thresholdPercent = cfg.destructionPercentage or CONFIG.destructionPercentage or 75
    local destructionThreshold = math.floor(totalSolid * (1.0 - (thresholdPercent / 100.0)))

    return {
      id = id,
      name = cfg.name or ("King " .. id),
      active = active,
      x1 = x1,
      y1 = y1,
      x2 = x2,
      y2 = y2,
      width = cfg.width,
      height = cfg.height,
      totalArea = totalSolid,
      currentArea = totalSolid,
      threshold = destructionThreshold,
      percentThreshold = thresholdPercent,
      destroyed = false,
      currentPercentDestroyed = 0,
    }
  end

  local function check_king_damage(king)
    if not king or not king.active or king.destroyed then
      return false
    end

    local count = 0
    for x = king.x1, king.x2 - 1 do
      for y = king.y1, king.y2 - 1 do
        if wa.land.solid(x, y) then
          count = count + 1
        end
      end
    end

    king.currentArea = count
    if king.totalArea > 0 then
      king.currentPercentDestroyed = math.floor(((king.totalArea - count) * 100) / king.totalArea)
    end

    if king.currentArea <= king.threshold then
      king.destroyed = true
      return true
    end

    return false
  end

  local function eliminate_team(losingTeamIndex, winnerIndex, reason)
    if matchOver then return end
    matchOver = true
    winningTeam = winnerIndex
    winReason = reason

    wa.log(string.format("[KTK] Win Condition Triggered: %s. Eliminating Team %d (Team %d Wins)", reason, losingTeamIndex, winnerIndex))

    if wa.teams then
      wa.teams.surrender(losingTeamIndex)
      return
    end
    -- DLLs before wa.teams: no surrender, so the team's worms die.
    local worms = wa.worms.all()
    for _, w in ipairs(worms) do
      if w.team == losingTeamIndex and w.hp > 0 then
        w:hit(w.hp)
      end
    end
  end

  local function format_time(ms)
    if ms < 0 then ms = 0 end
    local totalSeconds = math.floor(ms / 1000)
    local minutes = math.floor(totalSeconds / 60)
    local seconds = totalSeconds % 60
    return string.format("%02d:%02d", minutes, seconds)
  end

  wa.on.worm_message(function(worm)
    run_cleaner()

    if not initialized then
      initialized = true
      kings[1] = init_king(CONFIG.king1, 1)
      if kingsCount >= 2 and CONFIG.king2 then
        kings[2] = init_king(CONFIG.king2, 2)
      end
    end

    if matchOver then
      return
    end

    local isNewFrame = (worm.id <= lastWormId)
    lastWormId = worm.id

    if worm.turn then
      local curTeam = worm.team -- strictly 1-based team index

      if curTeam == attackersTeam then
        timerMs = timerMs - MS_PER_FRAME

        if timerMs <= 0 then
          timerMs = 0
          eliminate_team(attackersTeam, defendersTeam, "Attack Timer Expired")
          return
        end
      elseif timerType == "DefendAndCompensate" and curTeam == defendersTeam then
        timerMs = timerMs + defenderGainMs
      end
    end

    if isNewFrame then
      frameCheckCounter = frameCheckCounter + 1
      if frameCheckCounter >= CHECK_INTERVAL_FRAMES then
        frameCheckCounter = 0

        for i = 1, kingsCount do
          local king = kings[i]
          if check_king_damage(king) then
            eliminate_team(defendersTeam, attackersTeam, string.format("%s Destroyed", king.name))
            return
          end
        end
      end
    end
  end, { msgs = { wa.msg.FRAME_FINISH } })

  wa.on.hud(function()
    if not initialized then return end

    if CONFIG.showTimer then
      local timerStr = string.format("%s %s", CONFIG.timerCaption or "Remaining attack time:", format_time(timerMs))
      wa.hud.line(timerStr)
    end

    if CONFIG.showKingHp then
      for i = 1, kingsCount do
        local king = kings[i]
        if king then
          local statusStr
          if not king.active then
            statusStr = string.format("%s: [No solid terrain pixels found - Disabled]", king.name)
          elseif king.destroyed then
            statusStr = string.format("%s: DESTROYED (0%%)", king.name)
          else
            local healthPercent = math.max(0, 100 - king.currentPercentDestroyed)
            statusStr = string.format("%s HP: %d%%", king.name, healthPercent)
          end
          wa.hud.line(statusStr)
        end
      end
    end

    if matchOver and winningTeam then
      local teamName = (winningTeam == 1) and "RED TEAM" or ("TEAM " .. winningTeam)
      wa.hud.line(string.format("=== %s WINS! (%s) ===", teamName, winReason))
    end
  end)
end
`
      },
      {
        path: 'components/loader.lua',
        name: 'components/loader.lua',
        language: 'lua',
        content: `-- Set up the selected weapons and their dependencies once, in the established hook order.

local shared = require("lib/shared")
local index = require("weapons/index")
local loader = {}
local loaded, placed_ids = false, nil
local also = {}

function loader.also(path)
  assert(not loaded, "loader.also(" .. path .. "): the modules are already set up")
  also[#also + 1] = path
end

local ORDER = {
  "lib/holds",
  "weapons/old_woman_launcher",
  "weapons/super_drill",
  "weapons/fire_jump",
  "lib/anim",
  "weapons/sniper_rifle",
  "lib/missile_sprites",
  "weapons/double_bazooka",
  "weapons/chilli_bomb",
  "weapons/homing_fire_cluster",
  "weapons/fire_cluster_bomb",
  "weapons/digging_cluster_bomb",
  "weapons/homing_digger",
  "weapons/homing_cluster_bomb",
  "weapons/ninja_bomb",
  "weapons/nuke_rocket",
  "weapons/helicopter",
  "weapons/hot_air_balloon",
  "weapons/hang_glider",
  "weapons/wings",
  "weapons/swim_suit",
  "weapons/wind_changer",
  "weapons/gravity_control",
  "weapons/sacrifice",
  "weapons/parkour",
  "weapons/anti_fall_damage",
  "weapons/platform",
  "weapons/toxic_grenade",
  "weapons/bulldozer",
  "weapons/trampoline",
  "weapons/mine_launcher",
  "weapons/gravity_gun",
  "weapons/personal_invisibility",
  "weapons/small_worm",
  "lib/turn_controls",
  "weapons/jump",
  "weapons/thrown_dynamite",
  "weapons/tnt",
  "weapons/laser_gun",
  "weapons/super_tele",
  "weapons/electric_grenade",
  "weapons/barrel_launcher",
  "weapons/lightning_strike",
  "weapons/tazer",
  "weapons/skip_go_surrender",
  "weapons/drilling_crew",
  "lib/electrical",
  "weapons/javelin",
  "weapons/girder_launcher",
  "weapons/ice_arrow",
  "weapons/valyrian_fire",
  "weapons/reinforcement",
  "lib/bowling_balls",
  "weapons/bowling_ball",
  "weapons/bowling_ball_single",
  "weapons/ferret",
  "weapons/electromagnet",
  "weapons/crate_strike",
  "weapons/submarine_attack",
  "weapons/sentry_gun",
  "weapons/sentry_laser",
  "weapons/petrol_turret",
  "weapons/flame_turret",
  "weapons/mine_turret",
  "weapons/auto_ballista",
  "weapons/kamikaze_rocket",
  "weapons/weapon_crate",
  "weapons/portal_gun",
}

function loader.place(ctx)
  if placed_ids then return placed_ids end
  local ids = {}
  for id in pairs(ctx.weapons) do ids[#ids + 1] = id end
  table.sort(ids)
  placed_ids = ids
  return ids
end

function loader.load(ids)
  if loaded then return end
  loaded = true
  require("lib/weapon")
  shared.fires = {}
  shared.missile_sprites = {}
  local want = {}
  for id, path in pairs(index) do
    local definition = require(path)
    if definition.missile_sprite then shared.missile_sprites[id] = definition.missile_sprite end
  end
  local function need(path)
    if want[path] then return end
    want[path] = true
    local module = require(path)
    if type(module) == "table" then
      for _, dependency in ipairs(module.requires or {}) do need(dependency) end
    end
  end
  for _, path in ipairs({ "lib/holds", "weapons/old_woman_launcher", "lib/anim", "lib/missile_sprites" }) do
    want[path] = true
  end
  for _, id in ipairs(ids) do
    if index[id] then need(index[id]) end
  end
  for _, path in ipairs(also) do need(path) end
  for _, path in ipairs(ORDER) do
    if want[path] then
      local module = require(path)
      if type(module) == "table" and module.setup then module.setup() end
    end
  end
end

function loader.install(ctx)
  loader.load(loader.place(ctx))
  local path = index[ctx.id]
  if not path then error(ctx.id .. ": not a Highlander weapon") end
  local weapon = require(path)
  local declaration = weapon.definition
  if type(declaration) == "function" then declaration = declaration() end
  local spec = require("lib/weapon").merge(declaration, {})
  if weapon.configure then weapon.configure(ctx, spec) end
  require("lib/weapon").claim(ctx.id, spec)
end
return loader
`
      },
      {
        path: 'components/oil_drums.lua',
        name: 'components/oil_drums.lua',
        language: 'lua',
        content: `-- Project X oil drums: Project X's special oil drums: skunk, cluster, icy and electric.

return {
  install = function(ctx)
    local loader = require("components/loader")
    loader.also("lib/electrical")
    loader.also("weapons/nuke_rocket")
    loader.load(loader.place(ctx))
    local drums = require("lib/oil_drums")
    drums.load_assets()
    drums.install({ deal = true })
  end,
}
`
      },
      {
        path: 'components/random_race.lua',
        name: 'components/random_race.lua',
        language: 'lua',
        content: `-- Random Race: each round of turns races with one movement weapon, chosen at random.

return { install = function(ctx) require("scheme/random_race").install(ctx) end }
`
      },
      {
        path: 'components/specialists.lua',
        name: 'components/specialists.lua',
        language: 'lua',
        content: `-- Specialists rules: five worm classes, cooldowns, the Medic aura and the Soldier's zombie.

return { install = function(ctx) require("scheme/specialists_rules").install(ctx) end }
`
      },
      {
        path: 'components/weapon.lua',
        name: 'components/weapon.lua',
        language: 'lua',
        content: `-- Common component entry; each weapon owns its declaration and runtime code.

return {
  defaults = function(id)
    local path = require("weapons/index")[id]
    return path and require(path).defaults
  end,
  install = function(ctx) require("components/loader").install(ctx) end,
}
`
      },
      {
        path: 'lib/anim.lua',
        name: 'lib/anim.lua',
        language: 'lua',
        content: `-- Highlander: sprite animation helpers.

local shared = require("lib/shared")

local HOLD_DEPTH = wa.depth.FRONT
local function next_phase(phase, anim_speed)
  if phase > 0.99 then return 0 end
  return phase + anim_speed * 30 / 1000
end
local function frame_of(phase, frames)
  return math.min(math.floor(phase * frames), frames - 1)
end

shared.HOLD_DEPTH = HOLD_DEPTH
shared.frame_of = frame_of
shared.next_phase = next_phase
`
      },
      {
        path: 'lib/bowling_balls.lua',
        name: 'lib/bowling_balls.lua',
        language: 'lua',
        content: `-- Bowling balls: rolling and crushing on PX's physics, for the Bowling Ball and its strike.

local balls = {}

balls.RADIUS = 16 -- MakeCircleMask: the ball's art is 32 across
balls.INERTIA_X, balls.INERTIA_Y = 0.8, 0.4

function balls.setup()
  local shared = require("lib/shared")

  local RADIUS = balls.RADIUS
  local BOUNCE, FRICTION = 0.03, 0.02
  local INERTIA_X, INERTIA_Y = balls.INERTIA_X, balls.INERTIA_Y
  local LOW_SPEED = 4.0 -- below this for LOW_FRAMES frames: "low speed"
  local LOW_FRAMES = 100
  local LOW_BOUNCE, LOW_FRICTION = 0.03, 0.03
  local LOW_INERTIA_X, LOW_INERTIA_Y = 0.0, 0.0
  local SLEEP_DISTANCE = 2
  local SLEEP_PERIOD = 80
  local SUPPORT = 2 -- asleep, what holds it is within this below it
  local FAST = 4.0
  local SPIN_X, SPIN_Y, MAX_SPIN = 0.06, 0.02, 0.6
  local SHEET = "sprites/bowling_ball/ball.png"

  local MAX_DAMAGE_SPEED = 15.0
  local MIN_DAMAGE, MAX_DAMAGE = 5.0, 60.0
  local OBJECT_DAMAGE = 100
  local DAMAGE_FORCE = 0.7 -- DamageForceMultiplier
  local RECOVER_FRAMES = 12
  local PUSH_SPEED = 4.0 -- MinPushSpeed
  local PUSH_FORCE, PUSH_KEEP = 0.6, 0.7
  local SOUND_CRUSH, SOUND_HIT = 33, 101
  local TOUCH = 2

  local BLAST_FORCE, GUN_FORCE = 1.0, 0.7
  local ZAPPED_FRICTION = -0.05
  local ZAP_REACH = 12

  local GLOW_SHEET = "sprites/bowling_ball/glow.png"
  local SPARK_SHEET = "sprites/bowling_ball/spark.png"
  local SHEEN_SHEET = "sprites/bowling_ball/sheen.png"
  local ZAPPED_TINT = 0x405980 -- the ball's colours times (0.25, 0.35, 0.5)
  local SHEEN_COLOR = 0xFF3C96FF -- RGB, added
  local GLOW_SIZE = 128
  local SPARK_SIZE, SPARK_FRAMES = 60, 10
  local SPARK_SPEED, SPARK_CYCLE = 0.02, 1.4
  local ZAP_R, ZAP_G, ZAP_B = 80, 110, 128
  local TRAIL_LIFE = 30
  local SPRITE_DROP = 4
  local LIFT = 0.5 -- half a pixel
  local BALL_DEPTH = wa.depth.OBJECTS
  local GLOW_DEPTH, SHEEN_DEPTH, SPARK_DEPTH = BALL_DEPTH + 1, BALL_DEPTH - 1, BALL_DEPTH - 2
  local EDGE = 32000
  -- In the water it sinks as a missile does, Valyrian Fire's among them (WA's
  -- sea step, 0x4FDE20): no gravity, its speed kept at 0.8 (+0x54, 0xCCCC) and
  -- 0.3 down added each frame, so it slows to 1.5 a frame.
  local SEA_DRAG, SEA_SINK = 0.8, 0.3
  local SUNK = 200 -- and is gone this far below the surface
  local SINK_TINT = 0xA0B4FF -- Valyrian Fire's: cooler and darker below the water
  local SOUND_SPLASH = 57 -- WA's Splash, as it falls in

  local SOLID = { "terrain", "worms", "crates", "oil" }
  local SOLID_FAST = { "terrain", "crates", "oil" }

  local function trunc(v) return v >= 0 and math.floor(v) or -math.floor(-v) end

  local function target_radius(obj)
    if obj.kind == "worm" then return 6 end
    if obj.kind == "mine" then return 5 end
    return 9
  end

  local function sleep(b)
    if b.asleep then return end
    b.asleep, b.low = true, false
    b.sleep_x, b.sleep_y = b.x, b.y
    b.vx, b.vy, b.lvx, b.lvy = 0, 0, 0, 0
    b.rvx, b.rvy = 0, 0
  end

  local function wake(b)
    if not b.asleep and not b.low then return end
    b.asleep, b.low = false, false
    b.low_timer, b.sleep_timer = 200, 200
    b.rec_x, b.rec_y = b.x, b.y
  end

  local function spin(b)
    local rot = math.min(MAX_SPIN, SPIN_X * math.abs(b.rvx) + SPIN_Y * math.abs(b.rvy))
    if b.rvx < 0 then rot = -rot end
    b.rot = b.rot + rot
    while b.rot > math.pi do b.rot = b.rot - 2 * math.pi end
    while b.rot <= -math.pi do b.rot = b.rot + 2 * math.pi end
  end

  local function think(b)
    if b.asleep then
      b.x, b.y = b.sleep_x, b.sleep_y
      b.rvx, b.rvy = 0, 0
      local below = wa.world.trace({
        x0 = b.x, y0 = b.y, x1 = b.x, y1 = b.y + SUPPORT, radius = RADIUS, with = SOLID,
      })
      if not (below and (below.hit or below.starts_solid)) then wake(b) end
      return 0
    end
    local speed = math.sqrt(b.rvx * b.rvx + b.rvy * b.rvy)
    local vx2, vy2 = b.vx, b.vy + wa.world.gravity()
    local bounce, friction, ix, iy = BOUNCE, FRICTION, INERTIA_X, INERTIA_Y
    if b.low then
      bounce, friction, ix, iy = LOW_BOUNCE, LOW_FRICTION, LOW_INERTIA_X, LOW_INERTIA_Y
    elseif b.zapped then
      friction = ZAPPED_FRICTION
    end
    if vx2 == 0 and vy2 == 0 then vy2 = b.vy + 0.1 end
    local with = speed > FAST and SOLID_FAST or SOLID
    local x, y = b.x, b.y
    local dx, dy = vx2, vy2
    if math.abs(x + dx) > EDGE or math.abs(y + dy) > EDGE then
      b.gone = true
      return 0
    end
    local function trace_from(sx, sy, k, group, radius)
      if math.abs(sx + k * dx) > EDGE or math.abs(sy + k * dy) > EDGE then return nil end
      return wa.world.trace({
        x0 = sx, y0 = sy, x1 = sx + k * dx, y1 = sy + k * dy, radius = radius or RADIUS, with = group,
      })
    end
    local res = trace_from(x, y, 1, with)
    if res and res.starts_solid then
      res = trace_from(x, y, 1, SOLID_FAST)
      if res and res.starts_solid then
        if not res.left_x then
          res = trace_from(x, y, -8, SOLID_FAST)
          if not (res and res.left_x) then
            res = trace_from(x, y, -8, SOLID_FAST, 0)
            if not (res and res.left_x) then
              sleep(b)
              return 0
            end
          end
        end
        x, y = res.left_x, res.left_y
        res = trace_from(x, y, 1, SOLID_FAST)
      end
    end
    if res and res.hit then
      local spt = vx2 * res.tx + vy2 * res.ty
      local spn = vx2 * res.nx + vy2 * res.ny
      b.vx = vx2 - spn * res.nx * (bounce + 1) - spt * res.tx * friction
      b.vy = vy2 - spn * res.ny * (bounce + 1) - spt * res.ty * friction
      x, y = res.x, res.y
      local lx, ly = x + res.nx * LIFT, y + res.ny * LIFT
      local lift = wa.world.trace({ x0 = x, y0 = y, x1 = lx, y1 = ly, radius = RADIUS, with = with })
      if not (lift and (lift.hit or lift.starts_solid)) then x, y = lx, ly end
    else
      b.vx, b.vy = vx2, vy2
      x, y = x + vx2, y + vy2
    end
    b.vx = b.vx + ix * (b.vx - b.lvx)
    b.vy = b.vy + iy * (b.vy - b.lvy)
    b.lvx, b.lvy = b.vx, b.vy
    b.rvx, b.rvy = (x - b.lx), (y - b.ly)
    b.lx, b.ly = x, y
    b.x, b.y = x, y
    if speed < LOW_SPEED then
      b.low_timer = b.low_timer - 1
      if b.low_timer <= 0 then b.low, b.low_timer = true, LOW_FRAMES end
    else
      b.low, b.low_timer = false, LOW_FRAMES
    end
    b.sleep_timer = b.sleep_timer - 1
    if b.sleep_timer <= 0 then
      local dx, dy = (x - b.rec_x), (y - b.rec_y)
      if math.sqrt(dx * dx + dy * dy) < SLEEP_DISTANCE then sleep(b) end
      b.sleep_timer, b.rec_x, b.rec_y = SLEEP_PERIOD, x, y
    end
    return speed
  end

  shared.bowling_balls = {} -- actor id -> ball

  local clock, clock_ball = 0, nil
  local recover = {} -- worm id -> clock at which it can be hurt again

  local function tick(id)
    if clock_ball == nil or not shared.bowling_balls[clock_ball] then clock_ball = id end
    if clock_ball == id then clock = clock + 1 end
  end

  local function overlaps(b, obj)
    local dx, dy = (obj.x - b.x), (obj.y - b.y)
    local r = RADIUS + target_radius(obj) + TOUCH
    return dx * dx + dy * dy <= r * r
  end

  local function push_balls(id, b, speed)
    local push = PUSH_FORCE * math.sqrt(speed)
    for other_id, o in pairs(shared.bowling_balls) do
      if other_id ~= id then
        local dx, dy = (o.x - b.x), (o.y - b.y)
        local d2 = dx * dx + dy * dy
        if d2 > 0 and d2 <= (2 * RADIUS) * (2 * RADIUS) then
          local d = math.sqrt(d2)
          wake(o)
          o.vx = o.vx + PUSH_KEEP * push * dx / d
          o.vy = o.vy + PUSH_KEEP * push * dy / d
        end
      end
    end
  end

  local CRUSHABLE = { standing = true, firing = true, fired = true, prefiring = true }

  local function hit_others(a, b, speed)
    local dmg = MIN_DAMAGE + (MAX_DAMAGE - MIN_DAMAGE)
      * (math.min(speed, MAX_DAMAGE_SPEED) - FAST) / (MAX_DAMAGE_SPEED - FAST)
    local function hit(obj)
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
        obj:hit({ amount = damage, vx = fx, vy = fy })
      else
        obj:hit(damage, fx, fy)
      end
      wa.sound.play(a, crushed and SOUND_CRUSH or SOUND_HIT)
    end
    for _, group in ipairs({ wa.worms, wa.mines, wa.crates, wa.oil }) do
      for _, obj in ipairs(group.all() or {}) do hit(obj) end
    end
  end

  local function balls_in_order()
    local ids = {}
    for id in pairs(shared.bowling_balls) do ids[#ids + 1] = id end
    table.sort(ids)
    return ids
  end

  local function zap(b, mul)
    if not b.zapped then b.spark, b.trail, b.seed = 0, {}, b.trail_seed end
    b.zapped = true
    wake(b)
    local ang = (wa.random(0, 2000) - 1000) / 10000
    local speed = (5 + wa.random(0, 1000) / 200) * (mul or 1)
    local a2 = ang * ang
    b.vx = (ang - ang * a2 / 6) * speed
    b.vy = -(1 - a2 / 2 + a2 * a2 / 24) * speed
  end

  shared.kick_bowling_balls = function(x, y, reach, vx, vy)
    local r = reach + RADIUS
    for _, id in ipairs(balls_in_order()) do
      local b = shared.bowling_balls[id]
      local dx, dy = (b.x - x), (b.y - y)
      if dx * dx + dy * dy <= r * r then
        wake(b)
        b.vx, b.vy = vx, vy
      end
    end
  end

  shared.zap_bowling_balls = function(x, y)
    local reach = (ZAP_REACH + RADIUS) * (ZAP_REACH + RADIUS)
    for _, id in ipairs(balls_in_order()) do
      local b = shared.bowling_balls[id]
      local dx, dy = (b.x - x), (b.y - y)
      if dx * dx + dy * dy <= reach then zap(b) end
    end
  end

  local function as_target(id, b)
    return { kind = "ball", id = id, x = b.x, y = b.y + SPRITE_DROP,
      alliance = b.alliance, moving = b.vx ~= 0 or b.vy ~= 0 }
  end

  shared.remove_bowling_ball = function(id)
    local b = shared.bowling_balls[id]
    if not b then return end
    sleep(b)
    b.gone = true
    shared.bowling_balls[id] = nil
  end

  shared.bowling_ball_targets = function()
    local out = {}
    for _, id in ipairs(balls_in_order()) do out[#out + 1] = as_target(id, shared.bowling_balls[id]) end
    return out
  end

  shared.bowling_ball_target = function(id)
    local b = shared.bowling_balls[id]
    return b and as_target(id, b)
  end

  shared.zap_bowling_ball = function(id)
    local b = shared.bowling_balls[id]
    if b then zap(b, b.zapped and 0.8 or 1) end
  end

  shared.bowling_ball_on_beam = function(x0, y0, dx, dy, len)
    local best
    for _, id in ipairs(balls_in_order()) do
      local b = shared.bowling_balls[id]
      local cx, cy = (b.x - x0), (b.y - y0)
      local along = cx * dx + cy * dy
      local miss = cx * cx + cy * cy - along * along
      if miss <= RADIUS * RADIUS then
        local t = along - math.sqrt(RADIUS * RADIUS - miss)
        if t > 0 and t < len and (not best or t < best) then best = t end
      end
    end
    if best then return x0 + (best * dx), y0 + (best * dy) end
  end

  local function electrified_frame(b)
    b.spark = b.spark + SPARK_SPEED
    if b.spark > SPARK_CYCLE then b.spark = b.spark - SPARK_CYCLE end
    for i = #b.trail, 1, -1 do
      local p = b.trail[i]
      p.age = p.age + 1
      if p.age >= TRAIL_LIFE then
        table.remove(b.trail, i)
      else
        p.x, p.y = p.x + p.vx, p.y + p.vy
      end
    end
    if not b.asleep then
      b.seed = (b.seed * 1103515245 + 12345) % 0x80000000
      local a = b.seed / 0x80000000 * 2 * math.pi
      b.seed = (b.seed * 1103515245 + 12345) % 0x80000000
      local v = b.seed / 0x80000000 * 0.3
      b.trail[#b.trail + 1] = { x = b.x, y = b.y, vx = wa.math.cos(a) * v, vy = wa.math.sin(a) * v, age = 0 }
    end
  end

  local function take_hit(b, hit)
    wake(b)
    local k = hit.kind == "blast" and BLAST_FORCE or GUN_FORCE
    b.vx = b.vx + k * hit.vx
    b.vy = b.vy + k * hit.vy
  end

  -- Sinking, it hits nothing and nothing finds it: it leaves the ball list.
  local function sink(a, b)
    if not b.sinking then
      b.sinking, b.asleep, b.low = true, false, false
      shared.bowling_balls[a.id] = nil
      wa.sound.play(a, SOUND_SPLASH)
    end
    b.vx, b.vy = b.vx * SEA_DRAG, b.vy * SEA_DRAG + SEA_SINK
    b.rvx, b.rvy = b.vx, b.vy
    b.x, b.y = b.x + b.vx, b.y + b.vy
    if b.y >= wa.world.water() + SUNK then
      a:remove()
      return
    end
    spin(b)
    a.x, a.y, a.vx, a.vy = b.x, b.y + SPRITE_DROP, 0, 0
    a:gfx({ angle = math.deg(b.rot) % 360, depth = BALL_DEPTH, tint = SINK_TINT })
  end

  -- spare: frames for which the ball can't hurt its owner.
  local function spawn_ball(owner, x, y, vx, vy, spare)
    local b = {
      x = x, y = y, vx = vx, vy = vy, lvx = vx, lvy = vy, rvx = 0, rvy = 0, lx = x, ly = y,
      rot = 0, low = false, low_timer = 200, sleep_timer = 200, rec_x = x, rec_y = y,
      asleep = false, alliance = owner and owner.alliance,
    }
    local a = wa.actors.spawn({
      sprite = SHEET, x = x, y = y + SPRITE_DROP, owner = owner, body = {},
      on = {
        hit = function(_, hit) take_hit(b, hit) end,
        frame = function(a)
          if b.gone then
            a:remove()
            return
          end
          if b.sinking or b.y >= wa.world.water() then
            sink(a, b)
            return
          end
          local fx, fy, _, waking = wa.magnetism.sample(b.x, b.y, a)
          if waking then wake(b) end
          if not b.asleep then
            b.vx, b.vy = b.vx + fx * 0.25, b.vy + fy * 0.25
          end
          tick(a.id)
          if b.zapped then electrified_frame(b) end
          spin(b)
          if shared.portals and next(shared.portals.pairs) then
            local proxy = {
              id = a.id, kind = "actor", x = b.x, y = b.y,
              vx = b.vx, vy = b.vy,
              fits = function(_, x, y)
                return not wa.world.collides({ x = x, y = y, radius = RADIUS, with = {"terrain"} })
              end,
              warp = function(_, spec)
                b.x, b.y, b.vx, b.vy = spec.x, spec.y, spec.vx, spec.vy
                wake(b)
                b.lvx, b.lvy, b.rvx, b.rvy = b.vx, b.vy, b.vx, b.vy
                a:warp({ x = b.x, y = b.y + SPRITE_DROP, vx = 0, vy = 0 })
                return true
              end,
            }
            shared.portals:move(proxy)
          end
          local speed = think(b)
          if b.gone then
            shared.bowling_balls[a.id] = nil
            a:remove()
            return
          end
          if speed > PUSH_SPEED then push_balls(a.id, b, speed) end
          if speed > FAST then hit_others(a, b, speed) end
          a.x, a.y, a.vx, a.vy = b.x, b.y + SPRITE_DROP, 0, 0
          a:gfx({ angle = math.deg(b.rot) % 360, depth = BALL_DEPTH, tint = b.zapped and ZAPPED_TINT or 0xFFFFFF })
        end,
      },
    })
    shared.bowling_balls[a.id] = b
    b.trail_seed = a.id * 7919 % 0x80000000
    if spare and owner then recover[owner.id] = clock + spare end
    return a, b
  end
  shared.spawn_bowling_ball = spawn_ball

  -- The first height from y up, within a ball's width, where a ball at x is
  -- clear of the land; y itself if the land fills all of it.
  shared.bowling_ball_clear_y = function(x, y)
    for up = 0, 2 * RADIUS do
      if not wa.world.collides({ x = x, y = y - up, radius = RADIUS, with = { "terrain" } }) then
        return y - up
      end
    end
    return y
  end

  if wa.on.draw and wa.draw.quad then
    local glow_sheet = wa.sprites.key(GLOW_SHEET)
    local spark_sheet = wa.sprites.key(SPARK_SHEET)
    local sheen_sheet = wa.sprites.key(SHEEN_SHEET)
    local QUAD = { points = { { 0, 0 }, { 0, 0 }, { 0, 0 }, { 0, 0 } } }
    local function quad(sheet, frame, color, depth, x, y, half, c, s)
      QUAD.sprite, QUAD.frame, QUAD.blend, QUAD.color, QUAD.depth = sheet, frame, "add", color, depth
      local p = QUAD.points
      if not c then
        p[1][1], p[1][2] = x - half, y - half
        p[2][1], p[2][2] = x + half, y - half
        p[3][1], p[3][2] = x + half, y + half
        p[4][1], p[4][2] = x - half, y + half
      else
        p[1][1], p[1][2] = x + ((-c + s) * half), y + ((-s - c) * half)
        p[2][1], p[2][2] = x + (( c + s) * half), y + (( s - c) * half)
        p[3][1], p[3][2] = x + (( c - s) * half), y + (( s + c) * half)
        p[4][1], p[4][2] = x + ((-c - s) * half), y + ((-s + c) * half)
      end
      wa.draw.quad(QUAD)
    end
    local function zap_color(k)
      return 0xFF000000 | (math.floor(ZAP_R * k) << 16) | (math.floor(ZAP_G * k) << 8) | math.floor(ZAP_B * k)
    end
    local FULL = zap_color(1)
    local DRAW_IDS = {}
    wa.on.draw(function()
      local n = 0
      for id in pairs(shared.bowling_balls) do n = n + 1; DRAW_IDS[n] = id end
      for i = #DRAW_IDS, n + 1, -1 do DRAW_IDS[i] = nil end
      table.sort(DRAW_IDS)
      for _, id in ipairs(DRAW_IDS) do
        local b = shared.bowling_balls[id]
        if b.zapped then
          local drop = SPRITE_DROP
          for _, t in ipairs(b.trail) do
            local k = t.age / TRAIL_LIFE
            quad(glow_sheet, 0, zap_color(1 - k), GLOW_DEPTH, t.x, t.y + drop, (0.3 + 0.2 * k) * GLOW_SIZE / 2)
          end
          local x, y = b.x, b.y + drop
          local glow = (0.3 + 0.1 * wa.draw.random()) * GLOW_SIZE / 2
          for _ = 1, 3 do quad(glow_sheet, 0, FULL, GLOW_DEPTH, x, y, glow) end
          local c, s = wa.math.cos(b.rot), wa.math.sin(b.rot)
          quad(sheen_sheet, 0, SHEEN_COLOR, SHEEN_DEPTH, x, y, SPARK_SIZE / 2, c, s)
          if b.spark <= 1 then
            local frame = math.min(SPARK_FRAMES - 1, math.floor(b.spark * SPARK_FRAMES))
            quad(spark_sheet, frame, 0xFFFFFFFF, SPARK_DEPTH, x, y, SPARK_SIZE / 2, c, s)
          end
        end
      end
    end)
  end

  shared.portal_bowling_balls = function()
    local out = {}
    for _, id in ipairs(balls_in_order()) do out[#out + 1] = { id = id } end
    return out
  end
end

return balls
`
      },
      {
        path: 'lib/electrical.lua',
        name: 'lib/electrical.lua',
        language: 'lua',
        content: `-- Shared target queries, the Tazer's arc and its drawing for the electrical
-- weapons. The Lightning Strike's bolt, cloud and trace are wf.sdk's
-- (wf-lib/lightning), which the arcs draw with too.

local electrical = {}
local context, installed

local providers, order = {}, {}
function electrical.register(provider)
  if not providers[provider.kind] then order[#order + 1] = provider.kind end
  providers[provider.kind] = provider
end

function electrical.special_targets()
  local out = {}
  for _, kind in ipairs(order) do
    local provider = providers[kind]
    for _, obj in ipairs(provider.targets()) do
      obj.kind, obj.provider = kind, provider
      out[#out + 1] = obj
    end
  end
  return out
end

function electrical.special(key)
  local kind, id = key:match("^([^:]+):(.+)$")
  if not (kind and providers[kind]) then return nil end
  for _, obj in ipairs(providers[kind].targets()) do
    if tostring(obj.id) == id then
      obj.kind, obj.provider = kind, providers[kind]
      return obj
    end
  end
end

function electrical.special_on_beam(x0, y0, dx, dy, length)
  local best, hit
  for _, obj in ipairs(electrical.special_targets()) do
    local cx, cy = obj.x - x0, obj.y - y0
    local along = cx * dx + cy * dy
    local miss = cx * cx + cy * cy - along * along
    local r = obj.radius or 9
    if miss <= r * r then
      local at = along - math.sqrt(math.max(0, r * r - miss))
      if at > 0 and at < length and (not best or at < best) then best, hit = at, obj end
    end
  end
  if best then return x0 + best * dx, y0 + best * dy, hit end
end
function electrical.context()
  if context then return context end
  local function sq(v) return v * v end
  local shared = require("lib/shared")
  local L = require("wf-lib/lightning")
  local ELECTRIC_DEPTH = L.depth()
  local BEAM, GLOW = L.BEAM, L.GLOW
  local GRENADE_BURST = "sprites/electric_grenade/explosion.png"
  local arcs, tazed = {}, {}
  shared.revived_by_lightning = shared.revived_by_lightning or {}
  local effect_actor = L.effect_actor
  local electrical_targets = L.targets
  local target_radius = L.target_radius
  local electrical_trace = L.trace
  local function target_key(obj)
    return obj.kind .. ":" .. obj.id
  end

  local function find_target(key)
    local ball = key:match("^ball:(%d+)$")
    if ball then
      return shared.bowling_ball_target and shared.bowling_ball_target(tonumber(ball))
    end
    local special = electrical.special(key)
    if special then return special end
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
    if shared.bowling_ball_targets then
      for _, obj in ipairs(shared.bowling_ball_targets()) do consider(obj) end
    end
    for _, obj in ipairs(electrical.special_targets()) do consider(obj) end
    return best, distance
  end

  local function release_taze(key)
    local hold = tazed[key]
    if not hold then return end
    hold.count = hold.count - 1
    if hold.count > 0 then return end
    local worm = hold.worm
    if worm.taken then worm:release(0, 0) end
    worm.body_visible = true
    tazed[key] = nil
  end

  local function zap_target(arc, pending)
    local obj = find_target(pending.key)
    release_taze(pending.key)
    if not obj then return end
    if obj.kind == "worm" then
      obj:hit({ amount = 24, kind = "taze" })
      obj.vx, obj.vy = pending.side * 1.2, -4
    elseif obj.kind == "mine" then
      obj:arm(400)
    elseif obj.kind == "crate" or obj.kind == "oil" then
      obj:hit(12, pending.side * 1.2, -4, "taze")
    elseif obj.kind == "ball" then
      shared.zap_bowling_ball(obj.id)
    elseif obj.provider then
      obj.provider.zap(obj, pending.side)
    end
  end

  local ARC_MAX_POINTS = 256
  local function add_point(arc)
    arc.points[#arc.points + 1] = { arc.x, arc.y }
    if #arc.points > ARC_MAX_POINTS then table.remove(arc.points, 1) end
  end

  local LINK_DISTANCE = 10 / 0.81

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
      if d <= LINK_DISTANCE then
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

  local function start_arc(ev)
    local arc = { x = ev.x, y = ev.y, dx = ev.dx or 0, dy = ev.dy or -1, life = ev.life or 16, pause = 0,
      points = { { ev.x, ev.y } }, ignore = {}, pending = {}, explosion = 0,
      burst_x = ev.x, burst_y = ev.y, sound_age = 0, burst = ev.burst ~= false }
    for _,obj in ipairs(ev.ignore or {}) do arc.ignore[target_key(obj)] = true end
    arcs[#arcs + 1] = arc
    local driver = effect_actor(ev.x, ev.y, ev.worm or shared.current_worm() or ev.owner, function(a)
      arc.sound_age = arc.sound_age + 1
      if arc.life > 0 and arc.sound_age % 46 == 0 then
        wa.sound.play(a, "sounds/lightning/tazer_loop.wav")
      end
      progress_arc(arc)
      if arc.life <= 0 and #arc.points == 0 and #arc.pending == 0 then
        for i, held in ipairs(arcs) do
          if held == arc then table.remove(arcs, i); break end
        end
        a:remove()
      end
    end)
    wa.sound.play(driver, "sounds/lightning/tazer_loop.wav")
  end

  local function grenade_arc(ev)
    local ignore = {}
    if context.thrower then ignore[#ignore+1] = context.thrower end
    if ev.worm then ignore[#ignore+1] = ev.worm end
    return start_arc({x=ev.x,y=ev.y,worm=ev.worm,owner=ev.owner,life=ev.life,ignore=ignore})
  end

  context = { sq = sq, ELECTRIC_DEPTH = ELECTRIC_DEPTH, BEAM = BEAM, GLOW = GLOW, GRENADE_BURST = GRENADE_BURST, arcs = arcs, tazed = tazed, effect_actor = effect_actor, electrical_targets = electrical_targets, target_radius = target_radius, electrical_trace = electrical_trace, target_key = target_key, find_target = find_target, start_arc = start_arc, grenade_arc = grenade_arc }
  return context
end

function electrical.setup()
  if installed then return end
  installed = true
  local c = electrical.context()
  local GRENADE_BURST = c.GRENADE_BURST
  local ELECTRIC_DEPTH = c.ELECTRIC_DEPTH
  local arcs = c.arcs
  local tazed = c.tazed
  local find_target = c.find_target
  wa.on.worm_message(function(worm, msg)
    if tazed[c.target_key(worm)] then return "eat" end
  end, { msgs = { wa.msg.FIRE_WEAPON } })
  if wa.on.draw and wa.draw.ribbon then
    local g = require("wf-lib/lightning").gfx()
    local colour, square, glow, point, ribbon, noise_span =
      g.colour, g.square, g.glow, g.point, g.ribbon, g.noise_span
    local burst_sprite = wa.sprites.key(GRENADE_BURST)
    wa.on.draw(function()
      for _, arc in ipairs(arcs) do
        if arc.burst ~= false and arc.explosion < 10 then
          local h = 75
          square(burst_sprite, arc.explosion, "add", 0x551E14EB, ELECTRIC_DEPTH, arc.burst_x, arc.burst_y, h, h)
        end
        if #arc.points >= 2 then
          if arc.shape_tick ~= arc.sound_age then
            local divs = 33
            while divs < #arc.points do divs = 2 * divs - 1 end
            arc.noise = arc.noise or {}
            noise_span(arc.noise, 0, divs, 1.0, 0, 0)
            arc.shape_tick = arc.sound_age
          end
          local num = #arc.points - 1
          local fade = math.min(1, arc.life / 6)
          for i = 0, num do
            local t = i / num
            local x, y = arc.points[i + 1][1], arc.points[i + 1][2]
            if i > 0 and i < num then
              local px, py = arc.points[i][1], arc.points[i][2]
              local nx, ny = (y - py), (px - x)
              local d = math.sqrt(nx * nx + ny * ny)
              if d > 0 then
                local n = 10 * (arc.noise[i - 1] or 0) / d
                x, y = x + n * nx, y + n * ny
              end
            end
            local f = math.min(1, 4 * t * (1 - t) + 0.1)
            local f2 = f * fade
            local c = colour(255, math.floor(80 * f2), math.floor(100 * f2), math.floor(255 * f2))
            point(i + 1, x, y, 2 * 9 * f, t, c)
            glow(x, y, i == num - 1 and 115 or 38, c)
          end
          ribbon(num + 1)
        end
      end
      for _, arc in ipairs(arcs) do
        for _, p in ipairs(arc.pending) do
          if p.key:sub(1, 5) == "ball:" or electrical.special(p.key) then
            local ball = find_target(p.key)
            if ball then glow(ball.x, ball.y, 128 * (0.4 + 0.3 * wa.draw.random()), colour(255, 80, 100, 255)) end
          end
        end
      end
      for key, hold in pairs(tazed) do
        local worm = find_target(key)
        if worm then
          local x, y = worm.x, worm.y
          local h = 30
          square(hold.sheet, math.floor(wa.draw.random() * 4), "alpha", 0xFFFFFFFF, ELECTRIC_DEPTH, x, y, h, h)
          glow(x, y, 128 * (0.4 + 0.3 * wa.draw.random()), colour(255, 80, 100, 255))
        end
      end
    end)
  end
end
return electrical
`
      },
      {
        path: 'lib/holds.lua',
        name: 'lib/holds.lua',
        language: 'lua',
        content: `-- Common PX posture/hand sheets.

local sdk = require("wf-lib/holds")
local shared = require("lib/shared")
shared.PX_POSTURE, shared.PX_HANDS = sdk.PX_POSTURE, sdk.PX_HANDS
`
      },
      {
        path: 'lib/laser.lua',
        name: 'lib/laser.lua',
        language: 'lua',
        content: `-- What PX's two lasers share: their art, glow particles and drawing.

local laser = {}

laser.GLOW = "sprites/laser_gun/laser_glow.png"
laser.BEAM = "sprites/laser_gun/laser_beam.png"
laser.DEPTH = wa.depth.FRONT

function laser.rand(r)
  r.seed = (r.seed * 1103515245 + 12345) % 0x80000000
  return r.seed / 0x80000000
end

function laser.between(r, lo, hi)
  return lo + (hi - lo) * laser.rand(r)
end

function laser.particle(r, p)
  p.age, p.vx, p.vy = 0, p.vx or 0, p.vy or 0
  r.fx[#r.fx + 1] = p
end

function laser.step(r)
  for i = #r.fx, 1, -1 do
    local p = r.fx[i]
    p.age = p.age + 1
    if p.age >= p.life then
      table.remove(r.fx, i)
    else
      if p.jitter then
        p.vx = p.vx + (laser.between(r, -p.jitter, p.jitter))
      end
      p.vy = p.vy + (p.grav / 10)
      p.vx, p.vy = p.vx * (1 - p.drag), p.vy * (1 - p.drag)
      p.x, p.y = p.x + p.vx, p.y + p.vy
    end
  end
end

function laser.argb(a, rgb)
  return (math.floor(math.max(0, math.min(255, a))) << 24)
    | (math.floor(rgb[1]) << 16) | (math.floor(rgb[2]) << 8) | math.floor(rgb[3])
end

function laser.glow(x, y, px, color)
  local h = px / 2
  wa.draw.quad({ sprite = laser.GLOW, blend = "add", color = color, depth = laser.DEPTH,
    points = { { x - h, y - h }, { x + h, y - h }, { x + h, y + h }, { x - h, y + h } } })
end

function laser.draw_particles(r)
  for _, p in ipairs(r.fx) do
    local t = p.age / p.life
    local c = { p.c0[1] + (p.c1[1] - p.c0[1]) * t, p.c0[2] + (p.c1[2] - p.c0[2]) * t,
      p.c0[3] + (p.c1[3] - p.c0[3]) * t }
    laser.glow(p.x, p.y, 32 * (p.s0 + (p.s1 - p.s0) * t), laser.argb(p.alpha or 255, c))
  end
end

function laser.beam(x0, y0, x1, y1, width, color)
  wa.draw.ribbon({ sprite = laser.BEAM, blend = "add", depth = laser.DEPTH, points = {
    { x = x0, y = y0, width = width, u = 0, color = color },
    { x = x1, y = y1, width = width, u = 1, color = color },
  } })
end

return laser
`
      },
      {
        path: 'lib/missile_sprites.lua',
        name: 'lib/missile_sprites.lua',
        language: 'lua',
        content: `-- Highlander: PX's missile sprites.

local shared = require("lib/shared")
local HOLD_DEPTH = shared.HOLD_DEPTH
local frame_of = shared.frame_of
local next_phase = shared.next_phase

-- ------------------------------------ PX's missile sprites, at run time
local flying, current_worm
do

local PX_WEAP_SPRITES = shared.missile_sprites

flying = {} -- missile id -> { actor, phase, seen }
local matched = {}

local function follow_missile(id)
  return function(a)
    local f = flying[id]
    if f and f.seen then
      f.seen = false
      return
    end
    if f and f.actor == a then
      flying[id] = nil
      matched[id] = nil
    end
    a:remove()
  end
end

function current_worm()
  for _, w in ipairs(wa.worms.all()) do
    if w.turn then
      return w
    end
  end
end

local last_turn_id
wa.on.turn_start(function(event)
  last_turn_id = event.worm and event.worm.id
end)

local function sprite_owner()
  local turn = current_worm()
  if turn then return turn end
  if not last_turn_id then return nil end
  local any
  for _, w in ipairs(wa.worms.all()) do
    if w.id == last_turn_id then return w end
    any = any or w
  end
  return any
end

-- A weapon's missile_sprite is one spec, or a list of them told apart by
-- first_sprite: the WA sprite a missile draws on its first frame.
local function spec_for(m)
  local specs = shared.owns(m.weapon) and PX_WEAP_SPRITES[m.weapon]
  if not specs then return nil end
  if matched[m.id] then return matched[m.id] end
  if specs.sheet then specs = { specs } end
  for _, p in ipairs(specs) do
    if not p.first_sprite then return p end
    if m.phase == "pre" and m.sprite == p.first_sprite then
      matched[m.id] = p
      return p
    end
  end
end

wa.on.missile_frame(function(m)
  local p = spec_for(m)
  if p and p.hide and m.phase == "pre" and (flying[m.id] or sprite_owner()) then
    m.sprite = 0
  end
  p = m.phase == "post" and p
  if not p then
    return
  end
  local f = flying[m.id]
  if not f then
    local owner = sprite_owner()
    if not owner then
      return
    end
    f = { phase = 0, rot = 0 }
    f.actor = wa.actors.spawn({
      sprite = p.sheet, x = m.x, y = m.y, owner = owner, on = follow_missile(m.id),
    })
    flying[m.id] = f
  end
  f.seen = true
  local a = f.actor
  a.x, a.y, a.vx, a.vy = m.x, m.y, 0, 0
  a.facing = (m.vx < 0 and not p.upright) and -1 or 1
  if p.animate then
    f.phase = next_phase(f.phase, p.anim_speed)
    a:frame(frame_of(f.phase, p.frames))
  end
  local rot
  if p.upright then
    rot = 0
  elseif p.spin then
    local vx, vy = m.vx, m.vy
    local sign = vx > 0 and 1 or vx < 0 and -1 or 0
    f.rot = f.rot + (p.spin_speed or 0.5) * (vx * 0.15 + math.abs(vy * 0.01) * sign)
    rot = f.rot
  else
    rot = -wa.math.atan(m.vx, m.vy) - math.pi
  end
  local sunk = p.sink_tint ~= nil and m.y >= wa.world.water()
  if sunk ~= (f.sunk or false) then
    f.sunk = sunk
    a:gfx({ tint = sunk and p.sink_tint or 0xFFFFFF })
  end
  a:gfx({ angle = math.deg(rot) % 360, depth = HOLD_DEPTH, scale = p.scale })
end)
end

shared.current_worm = current_worm
`
      },
      {
        path: 'lib/oil_drums.lua',
        name: 'lib/oil_drums.lua',
        language: 'lua',
        content: `-- Project X's oil drums: every oil drum on the map is one of PX's kinds.

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
`
      },
      {
        path: 'lib/on_missile.lua',
        name: 'lib/on_missile.lua',
        language: 'lua',
        content: `-- On missile: wa.on.missile_frame for some weapons or one phase; a DLL without the options runs it for every missile.
return function(handler, filter)
  if not pcall(wa.on.missile_frame, handler, filter) then wa.on.missile_frame(handler) end
end
`
      },
      {
        path: 'lib/parachute.lua',
        name: 'lib/parachute.lua',
        language: 'lua',
        content: `-- Parachute weapons: WA's fire of a weapon whose record is a parachute, for the pack's next frame.

local parachute = {}
local fired = {}
local installed

function parachute.setup()
  if installed then return end
  installed = true
  wa.on.worm_message(function(worm)
    if worm.state == "parachuting" then fired[worm.id] = worm.weapon end
  end, { msgs = { wa.msg.WEAPON_RELEASED } })
end

-- At FRAME_FINISH: "open", or "landed" when WA's hard-landing open landed it before this frame; nil if not fired.
function parachute.fired(worm, id)
  if fired[worm.id] ~= id then return nil end
  fired[worm.id] = nil
  return worm.state == "parachuting" and "open" or "landed"
end

return parachute
`
      },
      {
        path: 'lib/portals.lua',
        name: 'lib/portals.lua',
        language: 'lua',
        content: `-- Reusable portal pairs.

local default_velocity = require("lib/portal_velocity")
local Network = {}
Network.__index = Network
local OFFSET = { {0,1}, {-1,1}, {-1,0}, {-1,-1}, {0,-1}, {1,-1}, {1,0}, {1,1} }
local function trunc(x) return x >= 0 and math.floor(x) or -math.floor(-x) end

local function direction(nx, ny)
  if ny >= 0.95 then return 1 end
  if nx < 0 and ny > 0.25 and ny < 0.97 then return 2 end
  if nx <= -0.90 then return 3 end
  if nx < 0 and ny < -0.20 and ny > -0.97 then return 4 end
  if ny <= -0.97 then return 5 end
  if nx > 0 and ny < -0.20 and ny > -0.97 then return 6 end
  if nx >= 0.97 then return 7 end
  if nx > 0 and ny > 0.25 and ny < 0.97 then return 8 end
end
local function inside(p, x, y)
  return x > p.x - p.w / 2 and x < p.x + p.w / 2
     and y > p.y - p.h / 2 and y < p.y + p.h / 2
end
local function crossing(p, x, y, vx, vy)
  if inside(p, x, y) then return 0 end
  local lo, hi = 0, 1
  for _, axis in ipairs({ {x, vx, p.x, p.w}, {y, vy, p.y, p.h} }) do
    local a, v, centre, size = table.unpack(axis)
    local left, right = centre - size / 2, centre + size / 2
    if v == 0 then
      if a <= left or a >= right then return nil end
    else
      local t0, t1 = (left - a) / v, (right - a) / v
      if t0 > t1 then t0, t1 = t1, t0 end
      lo, hi = math.max(lo, t0), math.min(hi, t1)
      if lo >= hi then return nil end
    end
  end
  return lo < 1 and lo or nil
end
local function identity(body)
  local kind = body.kind or "worm"
  return kind .. ":" .. tostring(body.id)
end

function Network.new(options)
  options = options or {}
  return setmetatable({ pairs = {}, last_exit = {}, age = 0,
    width = (options.width or 40), height = (options.height or 50),
    offset = (options.offset or 10),
    velocity = options.velocity or default_velocity,
    clearance = options.clearance,
    on_transport = options.on_transport,
    grace = options.grace or 150,
  }, Network)
end

function Network:place(group, colour, x, y, nx, ny, team_colour)
  local dir = direction(nx, ny)
  if not dir then return nil end
  assert(colour == 1 or colour == 2)
  local pair = self.pairs[group] or { active = true }
  local other = pair[3 - colour]
  if other and math.abs(x - other.x) < other.w / 2 + 10
    and math.abs(y - other.y) < other.h / 2 + 10 then return nil end
  local fresh = pair[colour] == nil
  local p = pair[colour] or {}
  p.group, p.colour, p.team_colour = group, colour, team_colour
  p.x, p.y = x + OFFSET[dir][1] * self.offset, y + OFFSET[dir][2] * self.offset
  p.draw_x, p.draw_y, p.dir, p.nx, p.ny = x, y, dir, nx, ny
  p.w, p.h = self.width, self.height
  p.exit_x, p.exit_y = p.x, p.y
  if dir == 2 or dir == 4 or dir == 6 or dir == 8 then
    p.exit_x = p.x + OFFSET[dir][1] * (p.w / 2 - 5)
    p.exit_y = trunc(p.y + OFFSET[dir][2] * p.h / 6)
  end
  pair[colour] = p
  self.pairs[group] = pair
  return p, fresh
end

function Network:active(group, on)
  local pair = self.pairs[group]
  if pair then pair.active = on ~= false end
end
function Network:turn_start()
  for _, group in ipairs(wa.sorted(self.pairs)) do
    local pair = self.pairs[group]
    pair.active, pair.ended_at = true, nil
  end
end
function Network:turn_end()
  for _, group in ipairs(wa.sorted(self.pairs)) do
    local pair = self.pairs[group]
    pair.ended_at = self.age
    if self.grace == 0 then pair.active = false end
  end
end
function Network:tick()
  self.age = self.age + 1
  for _, group in ipairs(wa.sorted(self.pairs)) do
    local pair = self.pairs[group]
    if pair.ended_at and self.age - pair.ended_at > self.grace then pair.active = false end
  end
end
function Network:move(body)
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
end
Network.direction, Network.inside, Network.crossing = direction, inside, crossing
return Network
`
      },
      {
        path: 'lib/portal_effects.lua',
        name: 'lib/portal_effects.lua',
        language: 'lua',
        content: `-- The Portal Gun's effects: trails, sparks, flashes and teleport bursts, from PX.

local Effects = {}
Effects.__index = Effects
local TAU = 2 * math.pi
local function trunc(x) return x >= 0 and math.floor(x) or -math.floor(-x) end
local function palette(colour, shift)
  if colour == 1 then return {255,255-shift,0}, {255,80-shift,0} end
  return {0,120-shift,255}, {0,80-shift,255}
end

function Effects.new()
  return setmetatable({ particles = {}, seed = 0x504F5254 }, Effects)
end
function Effects:random(lo, hi)
  local s = self.seed
  s = (s ~ (s << 13)) & 0xFFFFFFFF
  s = (s ~ (s >> 17)) & 0xFFFFFFFF
  s = (s ~ (s << 5)) & 0xFFFFFFFF
  self.seed = s
  return lo + (hi-lo) * (s / 0x100000000)
end
function Effects:particle(x, y, spec)
  if #self.particles >= 1024 then return end
  local angle, speed = self:random(0, TAU), self:random(spec.speed[1], spec.speed[2])
  self.particles[#self.particles+1] = {
    x = x, y = y, vx = wa.math.cos(angle)*speed + (spec.vx or 0),
    vy = wa.math.sin(angle)*speed + (spec.vy or 0),
    age = 0, life = spec.life, sprite = spec.sprite or "lightning_glow.png",
    pixels = spec.pixels or 128, size = spec.size, end_size = spec.end_size or 0.01,
    start = spec.start, finish = spec.finish, alpha = spec.alpha or 255,
    resistance = 1/(1+(spec.resistance or 0)), gravity = spec.gravity or 0,
    randomness = spec.randomness or 0, angle = spec.angle or 0, spin = spec.spin or 0,
  }
end
function Effects:ambient(p)
  local first, last = palette(p.colour, math.floor(self:random(0, 51)))
  self:particle(p.x, p.y, { life=15, speed={2.5,4}, resistance=0.5, gravity=-0.5,
    randomness=1, size=self:random(0.1,0.4), start=first, finish=last,
    angle=p.colour==1 and 12 or 0.9, spin=p.colour==1 and 50 or 10 })
end
function Effects:transport(p)
  for _=1,5 do
    local first, last = palette(p.colour, math.floor(self:random(0, 51)))
    self:particle(p.x, p.y, { life=40, speed={3.5,8}, resistance=0.5, gravity=-0.5,
      randomness=3, size=self:random(0.3,1), start=first, finish=last })
  end
end
function Effects:impact(x, y, failed)
  for _=1,(failed and 47 or 17) do
    local shift = math.floor(self:random(0,51))
    self:particle(x, y, { sprite="portal_glow.png", pixels=32, life=40,
      speed={1.5,3.8}, resistance=0.05, gravity=1, randomness=0.2,
      size=self:random(0.2,0.4), start={255,255-shift,0}, finish={255,80-shift,0},
      angle=1.23, spin=25 })
  end
  local shift = math.floor(self:random(0,51))
  self:particle(x, y, { life=3, speed={0,0}, alpha=150, randomness=0.2,
    size=self:random(2,3.2), end_size=0.11,
    start={255,255-shift,255}, finish={200,225-shift,125} })
end
function Effects:trail(x, y, colour)
  local first = colour==1 and {45,10,4} or {4,10,45}
  local last = colour==1 and {45,25,4} or {4,25,45}
  self:particle(x, y, { life=15, speed={0,0}, size=0.5, end_size=0.35,
    start=first, finish={0,0,0} })
  self:particle(x, y, { life=40, speed={0,0.8}, size=0.3, end_size=0.35,
    start=last, finish={0,0,0} })
end
function Effects:muzzle(x, y, colour, dx, dy)
  local first, last = palette(colour, math.floor(self:random(0, 51)))
  local push = self:random(0.4, 1.2)
  self:particle(x, y, { sprite="portal_glow.png", pixels=32, life=14,
    speed={0.1,0.5}, vx=dx*push, vy=dy*push, resistance=0.12, gravity=-0.05,
    randomness=0.2, size=self:random(0.12,0.22), end_size=0.02,
    start=first, finish=last })
  self:particle(x, y, { life=2, speed={0,0}, alpha=170,
    size=self:random(0.16,0.22), end_size=0.14, start=first, finish=last })
end
function Effects:tick(gravity)
  for i=#self.particles,1,-1 do
    local p = self.particles[i]
    p.age = p.age+1
    if p.age >= p.life then table.remove(self.particles,i)
    else
      p.angle = (p.angle+p.spin+math.pi) % TAU-math.pi
      p.x, p.y = p.x+p.vx, p.y+p.vy
      p.vx, p.vy = p.vx*p.resistance, p.vy*p.resistance+p.gravity*gravity
      if p.randomness > 0 then
        local angle, speed = self:random(0,TAU), self:random(0,p.randomness)
        p.vx, p.vy = p.vx+wa.math.cos(angle)*speed, p.vy+wa.math.sin(angle)*speed
      end
    end
  end
end
function Effects:draw(quad)
  for _, p in ipairs(self.particles) do
    local t = p.age/p.life
    local rgb = {}
    for i=1,3 do rgb[i]=trunc(p.start[i]+t*(p.finish[i]-p.start[i])) end
    local size = p.pixels*(p.size+t*(p.end_size-p.size))
    local colour = (p.alpha << 24) | (rgb[1] << 16) | (rgb[2] << 8) | rgb[3]
    quad(p.sprite, p.x, p.y, size, size, p.angle, colour, "add", wa.depth.EFFECTS - 1)
  end
end
return Effects
`
      },
      {
        path: 'lib/portal_velocity.lua',
        name: 'lib/portal_velocity.lua',
        language: 'lua',
        content: `-- PX p_portal2 CPortal::TeleportObject, worm and other-object rules.

local rules = { worm = {}, object = {} }
rules.worm[1] = {
  [1] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY
    if vy < 0 then vy = -vy end
    if vy < 2 then vy = 2 end
    return vx, vy, face
  end,
  [2] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = -memY / 2
    vy = -memY / 2 - memX
    if vx > 0 then vx = -vx end
    if vy < 0 then vy = -vy end
    if vx > -2 and vx < 2 then vx = -2 end
    if face > 0 then face = -face end
    return vx, vy, face
  end,
  [3] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = memY
    vy = -memX
    if vx > 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = -2 end
    if vy > 0 then vy = -vy end
    if face > 0 then face = -face end
    return vx, vy, face
  end,
  [4] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = memY / 2
    vy = memY / 2 - memX
    if vx > 0 then vx = -vx end
    if vy > 0 then vy = -vy end
    if vx > -2 and vx < 2 then vx = -2 end
    if face > 0 then face = -face end
    return vx, vy, face
  end,
  [5] = function(vx, vy, face)
    local memX, memY = vx, vy
    if vy > 0 then vy = -vy end
    return vx, vy, face
  end,
  [6] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = -memY / 2
    vy = memY / 2 - memX
    if vx < 0 then vx = -vx end
    if vy > 0 then vy = -vy end
    if vx > -2 and vx < 2 then vx = 2 end
    if face < 0 then face = -face end
    return vx, vy, face
  end,
  [7] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = -memY
    vy = -memX
    if vx < 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = 2 end
    if vy > 0 then vy = -vy end
    if face < 0 then face = -face end
    return vx, vy, face
  end,
  [8] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = -memY / 2
    vy = -memX - memY / 2
    if vx < 0 then vx = -vx end
    if vy < 0 then vy = -vy end
    if vx > -2 and vx < 2 then vx = 2 end
    if face < 0 then face = -face end
    return vx, vy, face
  end,
}
rules.worm[2] = {
  [1] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY / 2 - memX
    vx = memY / 2 + memX
    if vy < 0 then vy = -vy end
    if face > 0 then face = -face end
    return vx, vy, face
  end,
  [2] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY
    vx = -memX
    if vy < 0 then vy = -vy end
    if vx > 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = -2 end
    if face > 0 then face = -face end
    return vx, vy, face
  end,
  [3] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY / 2 - memX
    vx = -memY / 2
    if vx > 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = -2 end
    if vy > 0 then vy = -vy end
    if face > 0 then face = -face end
    return vx, vy, face
  end,
  [4] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = -memX
    vy = memY
    if vy > 0 then vy = -vy end
    if vx > 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = -2 end
    if face > 0 then face = -face end
    return vx, vy, face
  end,
  [5] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = memY / 2 - memX
    vx = -memY / 2 + memX
    if vy > 0 then vy = -vy end
    if face > 0 then face = -face end
    return vx, vy, face
  end,
  [6] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = memX
    vy = memY
    if vy > 0 then vy = -vy end
    if vx < 0 then vx = -vx end
    if face < 0 then face = -face end
    return vx, vy, face
  end,
  [7] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = memY / 2 + memX
    vx = memY / 2
    if vx < 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = 2 end
    if vy > 0 then vy = -vy end
    if face < 0 then face = -face end
    return vx, vy, face
  end,
  [8] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY
    vx = memX
    if vy < 0 then vy = -vy end
    if vx < 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = 2 end
    if face < 0 then face = -face end
    return vx, vy, face
  end,
}
rules.worm[3] = {
  [1] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = memY
    vy = memX
    if vy < -2 then
      vy = -vy
    else
      if vy < 2 then
        vy = 2
      end
    end
    return vx, vy, face
  end,
  [2] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = -memX / 2
    vy = -memY + memX / 2
    if vx > 0 then vx = -vx end
    if vy < 0 then vy = -vy end
    if face > 0 then face = -face end
    return vx, vy, face
  end,
  [3] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = -memX
    if vx > 2 then vx = -vx end
    if vx > -2 and vx < 2 then vx = -2 end
    if face > 0 then face = -face end
    return vx, vy, face
  end,
  [4] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = -memX / 2 + memY
    vy = -memX
    if vx > 0 then vx = -vx end
    if vy > 0 then vy = -vy end
    if face > 0 then face = -face end
    return vx, vy, face
  end,
  [5] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = memY
    vy = memX
    if vy > 2 then
      vy = -vy
    else
      if vy > -2 then
        vx = -2
      end
    end
    return vx, vy, face
  end,
  [6] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = -memX / 2
    vy = -memY - memX / 2
    if vx < 0 then vx = -vx end
    if vy > 0 then vy = -vy end
    if vx > -2 and vx < 2 then vx = 2 end
    if face < 0 then face = -face end
    return vx, vy, face
  end,
  [7] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = memX
    if vx < 2 then vx = -vx end
    if vx > -2 and vx < 2 then vx = 2 end
    if vy > 0 then vy = -vy end
    if face < 0 then face = -face end
    return vx, vy, face
  end,
  [8] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = memX / 2
    vy = memY + memX / 2
    if vx < 0 then vx = -vx end
    if vy < 0 then vy = -vy end
    if vx > -2 and vx < 2 then vx = 2 end
    if face < 0 then face = -face end
    return vx, vy, face
  end,
}
rules.worm[4] = {
  [1] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = memY / 2 - memX
    vx = memY / 2 + memX
    if vy < 0 then vy = -vy end
    if face > 0 then face = -face end
    return vx, vy, face
  end,
  [2] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = -memX
    if vy < 0 then vy = -vy end
    if vx > 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = -2 end
    if face > 0 then face = -face end
    return vx, vy, face
  end,
  [3] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY / 2 - memX
    vx = -memY / 2
    if vx > 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = -2 end
    if vy > 0 then vy = -vy end
    if face > 0 then face = -face end
    return vx, vy, face
  end,
  [4] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY
    vx = -memX
    if vy > 0 then vy = -vy end
    if vx > 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = -2 end
    if face > 0 then face = -face end
    return vx, vy, face
  end,
  [5] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY / 2 - memX
    vx = -memY / 2 + memX
    if vy > 0 then vy = -vy end
    if face > 0 then face = -face end
    return vx, vy, face
  end,
  [6] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY
    if vy > 0 then vy = -vy end
    if vx < 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = 2 end
    if face < 0 then face = -face end
    return vx, vy, face
  end,
  [7] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY / 2 + memX
    vx = memY / 2
    if vx < 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = 2 end
    if vy > 0 then vy = -vy end
    if face < 0 then face = -face end
    return vx, vy, face
  end,
  [8] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = memX
    vy = memY
    if vy < 0 then vy = -vy end
    if vx < 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = 2 end
    if face < 0 then face = -face end
    return vx, vy, face
  end,
}
rules.worm[5] = {
  [1] = function(vx, vy, face)
    local memX, memY = vx, vy
    if vy < 0 then vy = -vy end
    return vx, vy, face
  end,
  [2] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = -memX + memY / 2
    vy = memY / 2
    if vx > 0 then vx = -vx end
    if vx > -2 then vx = -2 end
    if vy < 0 then vy = -vy end
    if vy > 0 and vy < 2 then vy = 2 end
    if face > 0 then face = -face end
    return vx, vy, face
  end,
  [3] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = -memY
    vy = -memX
    if vx > 0 then vx = -vx end
    if vx > -2 then vx = -2 end
    if vx > -2 and vx < 2 then vx = -2 end
    if vy > 0 then vy = -vy end
    if face > 0 then face = -face end
    return vx, vy, face
  end,
  [4] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = -memX + memY / 2
    vy = memY / 2
    if vx > 0 then vx = -vx end
    if vx > -2 then vx = -2 end
    if vy > 0 then vy = -vy end
    if vy > -2 and vy < 2 then vy = -2 end
    if face > 0 then face = -face end
    return vx, vy, face
  end,
  [5] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY
    if vy > 0 then vy = -vy end
    if vy > -2 and vy < 0 then vy = -2 end
    return vx, vy, face
  end,
  [6] = function(vx, vy, face)
    local memX, memY = vx, vy
    if memX < 0 then memX = -memX end
    vx = memY / 2
    vy = memY / 2 + memX
    if vx < 0 then vx = -vx end
    if vx < 2 then vx = 2 end
    if vy > 0 then vy = -vy end
    if vy > -2 and vy < 2 then vy = -2 end
    if vx > -2 and vx < 2 then vx = 2 end
    if face < 0 then face = -face end
    return vx, vy, face
  end,
  [7] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = -memY
    vy = -memX
    if vx < 0 then vx = -vx end
    if vx < 2 and vx > 0 then vx = 2 end
    if vy < 2 and vy > 0 then vy = 2 end
    if vx > -2 and vx < 2 then vx = 2 end
    if vy > 0 then vy = -vy end
    if face < 0 then face = -face end
    return vx, vy, face
  end,
  [8] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = -memX - memY / 2
    vy = -memY / 2
    if vx < 0 then vx = -vx end
    if vx < 2 then vx = 2 end
    if vy < 0 then vy = -vy end
    if vy < 2 and vy > 0 then vy = 2 end
    if vx > -2 and vx < 2 then vx = 2 end
    if face < 0 then face = -face end
    return vx, vy, face
  end,
}
rules.worm[6] = {
  [1] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = memY / 2 + memX
    vx = memY / 2 + memX
    if vy < 0 then vy = -vy end
    if face > 0 then face = -face end
    return vx, vy, face
  end,
  [2] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = -memX
    vy = memY
    if vx > 0 then vx = -vx end
    if vy < 0 then vy = -vy end
    if vx > -2 and vx < 2 then vx = -2 end
    if face > 0 then face = -face end
    return vx, vy, face
  end,
  [3] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY / 2 + memX
    vx = -memY / 2
    if vx > 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = -2 end
    if vy > 0 then vy = -vy end
    if face > 0 then face = -face end
    return vx, vy, face
  end,
  [4] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY
    if vx > 0 then vx = -vx end
    if vy > 0 then vy = -vy end
    if vx > -2 and vx < 2 then vx = -2 end
    if face > 0 then face = -face end
    return vx, vy, face
  end,
  [5] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY / 2 + memX
    vx = -memY / 2 + memX
    if vy > 0 then vy = -vy end
    if face > 0 then face = -face end
    return vx, vy, face
  end,
  [6] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY
    vx = -memX
    if vx < 0 then vx = -vx end
    if vy > 0 then vy = -vy end
    if vx > -2 and vx < 2 then vx = 2 end
    if face < 0 then face = -face end
    return vx, vy, face
  end,
  [7] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY / 2 - memX
    vx = memY / 2
    if vx < 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = 2 end
    if vy > 0 then vy = -vy end
    if face < 0 then face = -face end
    return vx, vy, face
  end,
  [8] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = -memX
    if vx < 0 then vx = -vx end
    if vy < 0 then vy = -vy end
    if vx > -2 and vx < 2 then vx = 2 end
    if face < 0 then face = -face end
    return vx, vy, face
  end,
}
rules.worm[7] = {
  [1] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = memY
    vy = memX
    if vy < 0 then vy = -vy end
    return vx, vy, face
  end,
  [2] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = memX / 2
    vy = memY + memX / 2
    if vx > 0 then vx = -vx end
    if vy < 0 then vy = -vy end
    if face > 0 then face = -face end
    return vx, vy, face
  end,
  [3] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = memX
    if vx > 2 then vx = -vx end
    if vx > -2 and vx < 2 then vx = -2 end
    if vy > 0 then vy = -vy end
    if face > 0 then face = -face end
    return vx, vy, face
  end,
  [4] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = memX / 2
    vy = -memY + memX / 2
    if vx > 0 then vx = -vx end
    if vy > 0 then vy = -vy end
    if face > 0 then face = -face end
    return vx, vy, face
  end,
  [5] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = memY
    vy = memX
    if vy > 0 then vy = -vy end
    return vx, vy, face
  end,
  [6] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = memX / 2
    vy = -memY - memX / 2
    if vx < 0 then vx = -vx end
    if vy > 0 then vy = -vy end
    if vx > -2 and vx < 2 then vx = 2 end
    if face < 0 then face = -face end
    return vx, vy, face
  end,
  [7] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = memX
    if vx < 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = 2 end
    if vy > 0 then vy = -vy end
    if face < 0 then face = -face end
    return vx, vy, face
  end,
  [8] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = -memX / 2
    vy = memY - memX / 2
    if vx < 0 then vx = -vx end
    if vy < 0 then vy = -vy end
    if vx > -2 and vx < 2 then vx = 2 end
    if face < 0 then face = -face end
    return vx, vy, face
  end,
}
rules.worm[8] = {
  [1] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY / 2 + memX
    vx = memY / 2 + memX
    if vy < 0 then vy = -vy end
    if face > 0 then face = -face end
    return vx, vy, face
  end,
  [2] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY
    vx = memX
    if vy < 0 then vy = -vy end
    if vx > 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = -2 end
    if face > 0 then face = -face end
    return vx, vy, face
  end,
  [3] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY / 2 + memX
    vx = -memY / 2
    if vx > 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = -2 end
    if vy > 0 then vy = -vy end
    if face > 0 then face = -face end
    return vx, vy, face
  end,
  [4] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = memX
    vy = memY
    if vy > 0 then vy = -vy end
    if vx > 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = -2 end
    if face > 0 then face = -face end
    return vx, vy, face
  end,
  [5] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = memY / 2 + memX
    vx = -memY / 2 + memX
    if vy > 0 then vy = -vy end
    if face > 0 then face = -face end
    return vx, vy, face
  end,
  [6] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = -memX
    vy = memY
    if vy > 0 then vy = -vy end
    if vx < 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = 2 end
    if face < 0 then face = -face end
    return vx, vy, face
  end,
  [7] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = memY / 2 - memX
    vx = memY / 2
    if vx < 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = 2 end
    if vy > 0 then vy = -vy end
    if face < 0 then face = -face end
    return vx, vy, face
  end,
  [8] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY
    vx = -memX
    if vy < 0 then vy = -vy end
    if vx < 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = 2 end
    if face < 0 then face = -face end
    return vx, vy, face
  end,
}
rules.object[1] = {
  [1] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY
    if vy < 0 then vy = -vy end
    if vy < 2 then vy = 2 end
    return vx, vy, face
  end,
  [2] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = -memY / 2
    vy = -memY / 2 - memX
    if vx > 0 then vx = -vx end
    if vy < 0 then vy = -vy end
    if vx > -2 and vx < 2 then vx = -2 end
    return vx, vy, face
  end,
  [3] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = memY
    vy = -memX
    if vx > 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = -2 end
    if vy > 0 then vy = -vy end
    return vx, vy, face
  end,
  [4] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = memY / 2
    vy = memY / 2 - memX
    if vx > 0 then vx = -vx end
    if vy > 0 then vy = -vy end
    if vx > -2 and vx < 2 then vx = -2 end
    return vx, vy, face
  end,
  [5] = function(vx, vy, face)
    local memX, memY = vx, vy
    if vy > 0 then vy = -vy end
    if vy > -2 and vy < 0 then vy = -2 end
    return vx, vy, face
  end,
  [6] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = -memY / 2
    vy = memY / 2 - memX
    if vx < 0 then vx = -vx end
    if vy > 0 then vy = -vy end
    if vx > -2 and vx < 2 then vx = 2 end
    return vx, vy, face
  end,
  [7] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = -memY
    vy = -memX
    if vx < 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = 2 end
    if vy > 0 then vy = -vy end
    return vx, vy, face
  end,
  [8] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = -memY / 2
    vy = -memX - memY / 2
    if vx < 0 then vx = -vx end
    if vy < 0 then vy = -vy end
    if vx > -2 and vx < 2 then vx = 2 end
    return vx, vy, face
  end,
}
rules.object[2] = {
  [1] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY / 2 - memX
    vx = memY / 2 + memX
    if vy < 0 then vy = -vy end
    return vx, vy, face
  end,
  [2] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY
    vx = -memX
    if vy < 0 then vy = -vy end
    if vx > 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = -2 end
    return vx, vy, face
  end,
  [3] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY / 2 - memX
    vx = -memY / 2
    if vx > 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = -2 end
    if vy > 0 then vy = -vy end
    return vx, vy, face
  end,
  [4] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = -memX
    vy = memY
    if vy > 0 then vy = -vy end
    if vx > 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = -2 end
    return vx, vy, face
  end,
  [5] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = memY / 2 - memX
    vx = -memY / 2 + memX
    if vy > 0 then vy = -vy end
    return vx, vy, face
  end,
  [6] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = memX
    vy = memY
    if vy > 0 then vy = -vy end
    if vx < 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = 2 end
    return vx, vy, face
  end,
  [7] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = memY / 2 + memX
    vx = memY / 2
    if vx < 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = 2 end
    if vy > 0 then vy = -vy end
    return vx, vy, face
  end,
  [8] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY
    vx = memX
    if vy < 0 then vy = -vy end
    if vx < 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = 2 end
    return vx, vy, face
  end,
}
rules.object[3] = {
  [1] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = memY
    vy = memX
    if vy < -2 then
      vy = -vy
    else
      if vy < 2 then
        vy = 2
      end
    end
    return vx, vy, face
  end,
  [2] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = -memX / 2
    vy = -memY + memX / 2
    if vx > 0 then vx = -vx end
    if vy < 0 then vy = -vy end
    if vx > -2 and vx < 2 then vx = -2 end
    return vx, vy, face
  end,
  [3] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = -memX
    if vx > 2 then vx = -vx end
    if vx > -2 and vx < 2 then vx = -2 end
    if vy > 0 then vy = -vy end
    return vx, vy, face
  end,
  [4] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = -memX / 2 + memY
    vy = -memX / 2
    if vx > 0 then vy = -vy end
    if vy > 0 then vy = -vy end
    if vx > -2 and vx < 2 then vx = -2 end
    return vx, vy, face
  end,
  [5] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = memY
    vy = memX
    if vy > 2 then
      vy = -vy
    else
      if vy > -2 then
        vx = -2
      end
    end
    return vx, vy, face
  end,
  [6] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = -memX / 2
    vy = -memY - memX / 2
    if vx < 0 then vx = -vx end
    if vy > 0 then vy = -vy end
    if vx > -2 and vx < 2 then vx = 2 end
    return vx, vy, face
  end,
  [7] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = memX
    if vx < 2 then vx = -vx end
    if vx > -2 and vx < 2 then vx = 2 end
    if vy > 0 then vy = -vy end
    return vx, vy, face
  end,
  [8] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = memX / 2
    vy = memY + memX / 2
    if vx < 0 then vx = -vx end
    if vy < 0 then vy = -vy end
    if vx > -2 and vx < 2 then vx = 2 end
    return vx, vy, face
  end,
}
rules.object[4] = {
  [1] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = memY / 2 - memX
    vx = memY / 2 + memX
    if vy < 0 then vy = -vy end
    return vx, vy, face
  end,
  [2] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = -memX
    if vy < 0 then vy = -vy end
    if vx > 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = -2 end
    return vx, vy, face
  end,
  [3] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY / 2 - memX
    vx = -memY / 2
    if vx > 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = -2 end
    if vy > 0 then vy = -vy end
    return vx, vy, face
  end,
  [4] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY
    vx = -memX
    if vx > 0 then vx = -vx end
    if vy > 0 then vy = -vy end
    if vx > -2 and vx < 2 then vx = 2 end
    return vx, vy, face
  end,
  [5] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY / 2 - memX
    vx = -memY / 2 + memX
    if vy > 0 then vy = -vy end
    return vx, vy, face
  end,
  [6] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY
    if vy > 0 then vy = -vy end
    if vx < 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = 2 end
    return vx, vy, face
  end,
  [7] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY / 2 + memX
    vx = memY / 2
    if vx < 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = 2 end
    if vy > 0 then vy = -vy end
    return vx, vy, face
  end,
  [8] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = memX
    vy = memY
    if vy < 0 then vy = -vy end
    if vx < 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = 2 end
    return vx, vy, face
  end,
}
rules.object[5] = {
  [1] = function(vx, vy, face)
    local memX, memY = vx, vy
    if vy < 0 then vy = -vy end
    return vx, vy, face
  end,
  [2] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = -memX + memY / 2
    vy = memY / 2
    if vx > 0 then vx = -vx end
    if vx > -2 then vx = -2 end
    if vx > -2 and vx < 2 then vx = -2 end
    if vy < 0 then vy = -vy end
    if vy > 0 and vy < 2 then vy = 2 end
    return vx, vy, face
  end,
  [3] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = -memY
    vy = -memX
    if vx > 0 then vx = -vx end
    if vx > -2 then vx = -2 end
    if vy > -2 and vy < 0 then vy = -2 end
    if vy > 0 then vy = -vy end
    return vx, vy, face
  end,
  [4] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = -memX + memY / 2
    vy = memY / 2
    if vx > 0 then vx = -vx end
    if vx > -2 then vx = -2 end
    if vx > -2 and vx < 2 then vx = -2 end
    if vy > 0 then vy = -vy end
    if vy > -2 and vy < 0 then vy = -2 end
    return vx, vy, face
  end,
  [5] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY
    if vy > 0 then vy = -vy end
    if vy > -2 and vy < 0 then vy = -2 end
    return vx, vy, face
  end,
  [6] = function(vx, vy, face)
    local memX, memY = vx, vy
    if memX < 0 then memX = -memX end
    vx = memY / 2
    vy = memY / 2 + memX
    if vx < 0 then vx = -vx end
    if vy > 0 then vy = -vy end
    if vy > -2 and vy < 2 then vy = -2 end
    if vx > -2 and vx < 2 then vx = 2 end
    return vx, vy, face
  end,
  [7] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = -memY
    vy = -memX
    if vx < 0 then vx = -vx end
    if vx < 2 then vx = 2 end
    if vy < 2 and vy > 0 then vy = 2 end
    if vx > -2 and vx < 2 then vx = 2 end
    if vy > 0 then vy = -vy end
    return vx, vy, face
  end,
  [8] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = -memX - memY / 2
    vy = -memY / 2
    if vx < 0 then vx = -vx end
    if vx < 2 then vx = 2 end
    if vy < 0 then vy = -vy end
    if vy < 2 and vy > 0 then vy = 2 end
    if vx > -2 and vx < 2 then vx = 2 end
    return vx, vy, face
  end,
}
rules.object[6] = {
  [1] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = memY / 2 + memX
    vx = memY / 2 + memX
    if vy < 0 then vy = -vy end
    return vx, vy, face
  end,
  [2] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = -memX
    vy = memY
    if vx > 0 then vx = -vx end
    if vy < 0 then vy = -vy end
    if vx > -2 and vx < 2 then vx = -2 end
    return vx, vy, face
  end,
  [3] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY / 2 + memX
    vx = -memY / 2
    if vx > 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = -2 end
    if vy > 0 then vy = -vy end
    return vx, vy, face
  end,
  [4] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY
    if vx > 0 then vx = -vx end
    if vy > 0 then vy = -vy end
    if vx > -2 and vx < 2 then vx = -2 end
    return vx, vy, face
  end,
  [5] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY / 2 + memX
    vx = -memY / 2 + memX
    if vy > 0 then vy = -vy end
    return vx, vy, face
  end,
  [6] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY
    vx = -memX
    if vx < 0 then vx = -vx end
    if vy > 0 then vy = -vy end
    if vx > -2 and vx < 2 then vx = 2 end
    return vx, vy, face
  end,
  [7] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY / 2 - memX
    vx = memY / 2
    if vx < 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = 2 end
    if vy > 0 then vy = -vy end
    return vx, vy, face
  end,
  [8] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = -memX
    if vx < 0 then vx = -vx end
    if vy < 0 then vy = -vy end
    if vx > -2 and vx < 2 then vx = 2 end
    return vx, vy, face
  end,
}
rules.object[7] = {
  [1] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = memY
    vy = memX
    if vy < 0 then vy = -vy end
    return vx, vy, face
  end,
  [2] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = memX / 2
    vy = memY + memX / 2
    if vx > 0 then vy = -vy end
    if vy < 0 then vy = -vy end
    if vx > -2 and vx < 2 then vx = -2 end
    return vx, vy, face
  end,
  [3] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = memX
    if vx > 2 then vx = -vx end
    if vx > -2 and vx < 2 then vx = -2 end
    if vy > 0 then vy = -vy end
    return vx, vy, face
  end,
  [4] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = memX / 2
    vy = -memY - memX / 2
    if vx > 0 then vy = -vy end
    if vy > 0 then vy = -vy end
    if vx > -2 and vx < 2 then vx = -2 end
    return vx, vy, face
  end,
  [5] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = memY
    vy = memX
    if vy > 0 then vy = -vy end
    return vx, vy, face
  end,
  [6] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = -memX / 2
    vy = -memY - memX / 2
    if vx < 0 then vy = -vy end
    if vy > 0 then vy = -vy end
    if vx > -2 and vx < 2 then vx = 2 end
    return vx, vy, face
  end,
  [7] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = memX
    if vx < 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = 2 end
    if vy > 0 then vy = -vy end
    return vx, vy, face
  end,
  [8] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = -memX / 2
    vy = memY - memX / 2
    if vx < 0 then vy = -vy end
    if vy < 0 then vy = -vy end
    if vx > -2 and vx < 2 then vx = 2 end
    return vx, vy, face
  end,
}
rules.object[8] = {
  [1] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY / 2 + memX
    vx = memY / 2 + memX
    if vy < 0 then vy = -vy end
    return vx, vy, face
  end,
  [2] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY
    vx = memX
    if vy < 0 then vy = -vy end
    if vx > 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = -2 end
    return vx, vy, face
  end,
  [3] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY / 2 + memX
    vx = -memY / 2
    if vx > 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = -2 end
    if vy > 0 then vy = -vy end
    return vx, vy, face
  end,
  [4] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = memX
    vy = memY
    if vy > 0 then vy = -vy end
    if vx > 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = -2 end
    return vx, vy, face
  end,
  [5] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = memY / 2 + memX
    vx = -memY / 2 + memX
    if vy > 0 then vy = -vy end
    return vx, vy, face
  end,
  [6] = function(vx, vy, face)
    local memX, memY = vx, vy
    vx = -memX
    vy = memY
    if vy > 0 then vy = -vy end
    if vx < 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = 2 end
    return vx, vy, face
  end,
  [7] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = memY / 2 - memX
    vx = memY / 2
    if vx < 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = 2 end
    if vy > 0 then vy = -vy end
    return vx, vy, face
  end,
  [8] = function(vx, vy, face)
    local memX, memY = vx, vy
    vy = -memY
    vx = -memX
    if vy < 0 then vy = -vy end
    if vx < 0 then vx = -vx end
    if vx > -2 and vx < 2 then vx = 2 end
    return vx, vy, face
  end,
}
return function(kind, entry, exit, vx, vy, facing)
  local f = assert(rules[kind == "worm" and "worm" or "object"][entry][exit])
  local x, y, face = f(vx, vy, facing or 1)
  return x, y, face
end
`
      },
      {
        path: 'lib/px_blast_zone.lua',
        name: 'lib/px_blast_zone.lua',
        language: 'lua',
        content: `-- Blast Zone: Project X's zone launcher, ported to WormForge.

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
    wa.log("Blast Zone: in no panel slot; nothing registered")
    return
  end

  local ART = "sprites/blast_zone/"
  local sb = require("lib/px_sprite_builder")
  local zone = require("lib/px_zone")
  local fx = require("lib/px_zone_fx")
  fx.install()

  local TURNS_MIN, TURNS_MAX = 2, 6 -- the 1..5 keys give 2..6 turns
  local TURNS_DEFAULT = 3 -- \`BlastTurns = 3\`
  local FPS = 5 -- \`fps = 5\`: a tick every 0.1 s
  local RADIUS = 22.5 -- \`CWZone(x, y, 45, 45, ...)\`
  local PUSH, DAMAGE = 30, 30 -- \`CBlast(number, x, y, 30, 30, ...)\`
  local MINE_FUSE_MIN, MINE_FUSE_MAX = 1000, 4999

  local EXP_FRAMES = 10
  local EXP_SPEED = 35 -- normalized phase increment = speed/1000 per frame
  local EXP_SIZE = 75
  local ROTATIONS = { math.pi / 2, math.pi / 4, -math.pi / 4 }
  local EXP_DEPTH = wa.depth.WORMS + 1

  local TEAM_COLOURS = {
    [1] = 0x55D21400, [2] = 0x550014DC, [3] = 0x5500DC00,
    [4] = 0x55FADC00, [5] = 0x55DC00DC, [6] = 0x5500E6E6,
  }

  local turns = TURNS_DEFAULT
  local digit_held

  local shooter

  local function boom(z, obj)
    local b = wa.actors.spawn({
      sprite = false, x = z.x, y = z.y, owner = z.owner, on = function() end,
    })
    b:explode({ damage = DAMAGE, id = PUSH, below = false })
    if not b.dead then b:remove() end
    if obj.kind == "mine" then
      local fuse = obj.fuse
      if not fuse or fuse < 0 then fuse = wa.random(MINE_FUSE_MIN, MINE_FUSE_MAX) end
      obj:arm(fuse)
    end
  end

  local function animate(z)
    z.frame = fx.frame(z.timer, EXP_SPEED, EXP_FRAMES)
  end

  local EXP_SHEET = ART .. "exp.png"
  local ZONES = zone.register({
    name = "Blast Zone",
    fps = FPS,
    radius = RADIUS,
    half_height = RADIUS,
    kinds = { worm = true, oil = true, mine = true, crate = true, arrow = true, missile = true },
    one_shot = true,
    every_crate = DAMAGE,
    fade_frames = fx.FADE,
    frame = animate,
    tick = boom,
    draw = function(z)
      local colour = fx.faded(TEAM_COLOURS[(z.colour or 0) + 1] or TEAM_COLOURS[1], z)
      for _, angle in ipairs(ROTATIONS) do
        for _ = 1, 3 do
          zone.mark(EXP_SHEET, z.x, z.y, EXP_SIZE, angle, colour, "add", EXP_DEPTH, z.frame)
        end
      end
    end,
  })

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FIRE_WEAPON then
      if worm.weapon == "px.blast_zone" then shooter = worm end
      return
    end
    local keys = worm.turn and worm.weapon == "px.blast_zone" and wa.world.keys() or nil
    local digit = keys and keys.digit
    if digit and digit >= 1 and digit <= 5 and digit ~= digit_held then
      turns = math.min(TURNS_MAX, math.max(TURNS_MIN, digit + 1))
    end
    digit_held = digit
  end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })

  require("lib/weapon_hint").register("px.blast_zone", function()
    return "Blast Zone: explodes for " .. turns .. " turns\\n1-5: turns"
  end)

  fx.flight("px.blast_zone")
  sb.flight(ctx, {
    weapon = "px.blast_zone",
    sheet = ART .. "bullet.png",
    anim = "track",
    z = wa.depth.OBJECTS - 1,
    mirror = true,
    owner = shooter,
  })

  local hold = {
    sheet = ART .. "hold.png",
    hand = sb.PX_HANDS[3], -- hand_type 3: the upper hand
    hand_radius = 4.0,
    hand_rotation = 0.5,
    hand_radial_rotation = 0.0,
    hand_scale = 0.8,
    frames = 1, -- one bomb, turned by the engine's hold to the aim
    thrown = true,
    keep_while_firing = false,
  }

  local spec = {
    wep = "weps/blast_zone_wep.wep",
    panel_icon = ART .. "icon.png", -- PX's bz_ico.png
    missile = { sprite = 0 }, -- WA draws no round; the art spec draws it
    worm_sprites = sb.PX_POSTURE,
    hold = hold,
    sprites = { ART .. "bullet.png", ART .. "exp.png" },
    params = { gpu_prefix = ART },
    on_explode = function(ev)
      ZONES.place(ev.x, ev.y, {
        turns = turns, owner = shooter,
        colour = shooter and shooter.alliance or 0,
        frame = 0,
      })
    end,
  }
  spec.handling = { ends_turn = true }
  wa.weapons.replace(spec)
end

return M
`
      },
      {
        path: 'lib/px_bunker.lua',
        name: 'lib/px_bunker.lua',
        language: 'lua',
        content: `-- Bunker Buster and Super Bunker Buster: a digging air strike.

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
`
      },
      {
        path: 'lib/px_health_zone.lua',
        name: 'lib/px_health_zone.lua',
        language: 'lua',
        content: `-- Health Zone: Project X's zone launcher, ported to WormForge.

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
    wa.log("Health Zone: in no panel slot; nothing registered")
    return
  end

  local ART = "sprites/health_zone/"
  local sb = require("lib/px_sprite_builder")
  local zone = require("lib/px_zone")
  local fx = require("lib/px_zone_fx")
  fx.install()

  local turns = ctx.option("turns")
  local healing_per_minute = ctx.option("healing_per_minute")
  local FPS = 50 -- a tick a second, \`fps = 50\`
  local MIN_HP = 1 -- \`minHP\`: a damaging zone never kills
  local RADIUS = 20 -- \`CWZone(x, y, 40, 30, ...)\`: a 40x30 box
  local HALF_HEIGHT = 15
  local ROTATION = 0
  local ZONE_SIZE = 60 -- scale 1 of the PX editor's padded 60px frame
  local ZONE_DEPTH = wa.depth.WORMS + 1 -- PX's \`ZPlane = 16\`: behind worms

  local HEAL_TINT = 0x4164DC64 -- ARGB, green
  local DAMAGE_TINT = 0x41D26464 -- ARGB, red

  local healing = true
  local plus_held = {}

  local shooter

  local function add_health(z, obj)
    if obj.kind == "grave" then
      if obj.worm_id ~= 0 then obj:revive(obj.worm_id, 1) end
    elseif obj.kind == "worm" then
      z.healing_credit = (z.healing_credit or 0) + healing_per_minute
      local amount = math.floor(z.healing_credit / 60)
      z.healing_credit = z.healing_credit % 60
      if amount > 0 then obj:heal(amount) end
    end
  end

  -- Not worm:hit: a hit on the turn's worm starts WA's damage pause, and a
  -- tick every second restarts it before it ends, so the turn never resumes.
  local function damage_health(obj)
    if obj.kind == "worm" and obj.hp > MIN_HP then obj:reduce_health(1) end
  end

  local function resting(obj)
    if obj.kind == "grave" then return true end
    return (obj.vx or 0) == 0 and (obj.vy or 0) == 0
  end

  local ZONES = zone.register({
    name = "Health Zone",
    fps = FPS,
    next_turn = true,
    fade_frames = fx.FADE,
    radius = RADIUS,
    half_height = HALF_HEIGHT,
    kinds = { worm = true, grave = true },
    wakes = function(z, obj) return not z.start_be_inactive or resting(obj) end,
    tick = function(z, obj)
      if z.healing then add_health(z, obj) else damage_health(obj) end
    end,
    draw = function(z)
      local sheet, frames = z.healing and fx.HEAL or fx.DAMAGE, z.healing and 61 or 32
      local frame = fx.frame(z.timer, 20, frames)
      zone.mark(sheet, z.x, z.y, ZONE_SIZE, ROTATION,
        fx.faded(0xFFFFFFFF, z), "alpha", ZONE_DEPTH, frame)
      zone.mark(sheet, z.x, z.y, ZONE_SIZE, ROTATION,
        fx.faded(z.healing and HEAL_TINT or DAMAGE_TINT, z), "alpha", ZONE_DEPTH, frame)
    end,
  })

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FIRE_WEAPON then
      if worm.weapon == "px.health_zone" then shooter = worm end
      return
    end
    local keys = worm.turn and worm.weapon == "px.health_zone" and wa.world.keys() or nil
    if keys then
      if keys.plus_key and not plus_held[worm.id] then
        healing = not healing
        fx.clear_aim()
      end
      if worm.aiming then fx.aim(worm, healing) end
    end
    plus_held[worm.id] = keys ~= nil and keys.plus_key or false
  end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })

  require("lib/weapon_hint").register("px.health_zone", function()
    return (healing and "Health Zone: HEALING" or "Health Zone: DAMAGING")
      .. " for " .. turns .. " turns\\n" .. healing_per_minute .. " HP a minute\\n+ switches"
  end)

  fx.flight("px.health_zone", function() return healing end)
  sb.flight(ctx, {
    weapon = "px.health_zone",
    sheet = ART .. "bullet.png",
    anim = "track",
    z = wa.depth.OBJECTS - 1,
    mirror = true,
    owner = shooter,
  })

  local hold = {
    sheet = ART .. "hold.png",
    hand = sb.PX_HANDS[3], -- hand_type 3: the upper hand
    hand_radius = 4.0,
    hand_rotation = 0.5,
    hand_radial_rotation = 0.0,
    hand_scale = 0.8,
    weap_radius = 0.0,
    weap_rotation = 1.0,
    weap_radial_rotation = 1.0,
    frames = 1, -- one vial, turned by the engine's hold to the aim
    thrown = true,
    keep_while_firing = false,
  }

  local spec = {
    wep = "weps/health_zone_wep.wep",
    panel_icon = ART .. "icon.png", -- PX's hz_ico.png
    missile = { sprite = 0 }, -- WA draws no round; the art spec draws it
    worm_sprites = sb.PX_POSTURE,
    hold = hold,
    sprites = { ART .. "bullet.png" },
    params = { gpu_prefix = ART },
    on_explode = function(ev)
      ZONES.place(ev.x, ev.y, { healing = healing, turns = turns, owner = shooter })
    end,
  }
  spec.handling = { ends_turn = true }
  wa.weapons.replace(spec)
end

return M
`
      },
      {
        path: 'lib/px_homing.lua',
        name: 'lib/px_homing.lua',
        language: 'lua',
        content: `-- Project X's homing for scripted missiles (reddaz's HomeAfter): after a delay, every other frame the missile turns part way to a point.

local homing = {}

-- o = { x, y, speed, turn, delay, frames, sound, owner }: frames counts from now, the delay included.
function homing.new(o)
  return { tx = o.x, ty = o.y, speed = o.speed, turn = o.turn, wait = o.delay or 0,
    left = o.frames, sound = o.sound, owner = o.owner }
end

-- After WA moves the missile: the sound 3 frames before it homes, then a pull
-- towards the point at its homing speed every other frame.
function homing.step(m, h)
  if h.wait == 3 and h.sound and h.owner then wa.sound.play(h.owner, h.sound) end
  if not h.tx or h.left <= 0 then return end
  h.left = h.left - 1
  if h.wait > 0 then h.wait = h.wait - 1; return end
  h.wait = 1
  local dx, dy = h.tx - m.x, h.ty - m.y
  local dist = math.sqrt(dx * dx + dy * dy)
  if dist > 0 then dx, dy = dx / dist, dy / dist end
  m.vx = m.vx + (dx * h.speed - m.vx) * h.turn
  m.vy = m.vy + (dy * h.speed - m.vy) * h.turn
end

-- Before WA moves it: under 50 pixels from the point and slower than its homing
-- speed (by PX's |vx + vy|), it flies on at that speed. True when it did.
function homing.near(m, h)
  if not h.tx then return false end
  local dx, dy = h.tx - m.x, h.ty - m.y
  if dx * dx + dy * dy >= 50 * 50 or math.abs(m.vx + m.vy) >= h.speed then return false end
  local sp = math.sqrt(m.vx * m.vx + m.vy * m.vy)
  if sp > 0.001 then m.vx, m.vy = m.vx / sp * h.speed, m.vy / sp * h.speed end
  return true
end

return homing
`
      },
      {
        path: 'lib/px_ninja_star.lua',
        name: 'lib/px_ninja_star.lua',
        language: 'lua',
        content: `-- Ninja Star: Project X's thrown star, on WormForge.

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

local function trunc(n) return n < 0 and math.ceil(n) or math.floor(n) end

local on_missile = require("lib/on_missile")
local trail = require("lib/px_trail")

local function orientation(vx, vy)
  if vx == 0 then return vy > 0 and 16 or 0 end
  if vy == 0 then return vx > 0 and 8 or 24 end
  if vx > 0 and vy < 0 then return math.min(trunc(3 * vx / -vy), 7) end
  if vx > 0 then return math.min(trunc(8 + 3 * vy / vx), 15) end
  if vy > 0 then return math.min(trunc(16 + 3 * -vx / vy), 23) end
  return math.min(trunc(24 + 3 * -vy / -vx), 31)
end

local M = {}

function M.install(ctx)
  if not placed(ctx) then
    wa.log("Ninja Star: in no panel slot; nothing registered")
    return
  end

  local ART = "sprites/ninja_star/"
  local SND = "sounds/ninja_star/"

  trail.install()

  local DAMAGE    = 10 -- NinjaSDamage
  local HIT_R     = 20 -- the strict 20 px square around the impact
  local SELF_R    = 25 -- and the 25 px square for the worm whose turn it is
  local BURIED    = { soften = 3, blend = "mix" } -- as the Javelin's, tuned by eye there

  local TRAIL = { max = 7, every = 1, core_w = 4.0, glow_w = 7.0, r = 120, g = 120, b = 120 }

  local function current_worm()
    for _, w in ipairs(wa.worms.all()) do
      if w.turn then return w end
    end
  end

  local speed = {}
  on_missile(function(m)
    if m.weapon ~= "px.ninja_star" then return end
    speed[m.id] = { m.vx, m.vy }
    if m.phase == "pre" and not trail.has(m.id) then
      trail.add(m.id, current_worm(), TRAIL)
    end
  end, { weapons = { "px.ninja_star" } })

  local sb = require("lib/px_sprite_builder")
  sb.flight(ctx, {
    weapon = "px.ninja_star",
    sheet = ART .. "stamp.png",
    anim = "none",
    frame_fn = function(m) return orientation(m.vx, m.vy) end,
    z = wa.depth.OBJECTS - 1, -- as the helicopter's bullet, behind objects
    mirror = false,
  })

  local hold = {
    sheet = ART .. "hold.png",
    hand = sb.PX_HANDS[2], -- hand_type 2: the middle hand
    hand_radius = 17.0,
    hand_rotation = 1.0,
    hand_radial_rotation = 1.0,
    hand_scale = 1.0,
    weap_rotation = 1.0,
    weap_radius = 11.0,
    weap_radial_rotation = 1.0,
    frames = 1, -- one star, turned by the engine's hold to the aim
    thrown = true,
    keep_while_firing = false,
  }

  local function within(o, x, y, r)
    return o and math.abs(x - o.x) < r and math.abs(y - o.y) < r
  end

  local spec = {
    wep = "weps/ninja_star_wep.wep",
    panel_icon = ART .. "icon.png", -- PX's icon
    sprites = { ART .. "stamp.png", ART .. "hold.png", trail.BEAM, trail.GLOW },
    params = { gpu_prefix = "sprites/" },
    worm_sprites = sb.PX_POSTURE,
    hold = hold,
    sounds = { SND .. "ninjasimpact.wav" },
    on_explode = function(ev)
      local v = speed[ev.missile]
      if ev.missile then
        speed[ev.missile] = nil
        trail.drop(ev.missile)
      end
      local vx, vy = v and v[1] or 0, v and v[2] or 0
      local target
      for _, o in ipairs(wa.world.electrical_nearby(ev.x, ev.y, 29, false)) do
        if (o.kind == "worm" or o.kind == "mine" or o.kind == "crate" or o.kind == "oil")
          and within(o, ev.x, ev.y, HIT_R) then target = o break end
      end
      if not target then
        local active = current_worm()
        if within(active, ev.x, ev.y, SELF_R) then target = active end
      end
      if target then
        target.vx, target.vy = trunc(vx / 4), trunc(vy / 4)
        if target.kind == "worm" then target:hit(DAMAGE)
        else target:hit(DAMAGE, trunc(vx / 2), trunc(vy / 2), "bullet") end
        return
      end
      wa.land.stamp{ sprite = ART .. "stamp.png", frame = orientation(vx, vy),
        x = ev.x, y = ev.y, buried = BURIED }
      local shooter = current_worm()
      if shooter then wa.sound.play(shooter, SND .. "ninjasimpact.wav") end
    end,
  }
  spec.handling = { ends_turn = true }
  wa.weapons.replace(spec)
end

return M
`
      },
      {
        path: 'lib/px_security_grenade.lua',
        name: 'lib/px_security_grenade.lua',
        language: 'lua',
        content: `-- Security Grenade: Project X's grenade that bursts in a ring, on WormForge.

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
    wa.log("Security Grenade: in no panel slot; nothing registered")
    return
  end

  local ART = "sprites/security_grenade/"

  local PUSH, DAMAGE = 50, 25 -- DoExplosion's push and damage
  local RADIUS = 60
  local RING = { { 0, -RADIUS }, { RADIUS * 2 / 3, -RADIUS * 2 / 3 }, { RADIUS, 0 },
                 { RADIUS * 2 / 3, RADIUS * 2 / 3 }, { 0, RADIUS },
                 { -RADIUS * 2 / 3, RADIUS * 2 / 3 }, { -RADIUS, 0 },
                 { -RADIUS * 2 / 3, -RADIUS * 2 / 3 } }

  local shooter
  local pending = {}

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FIRE_WEAPON and worm.weapon == "px.security_grenade" then
      shooter = worm
    elseif msg == wa.msg.FRAME_FINISH and #pending > 0 then
      for _, p in ipairs(pending) do
        for _, off in ipairs(RING) do
          local a = wa.actors.spawn({ sprite = false, x = p.x + off[1], y = p.y + off[2],
            owner = shooter, on = function() end })
          a:explode({ id = PUSH, damage = DAMAGE, below = false })
          a:remove()
        end
      end
      pending = {}
    end
  end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })

  local sb = require("lib/px_sprite_builder")
  sb.flight(ctx, {
    weapon = "px.security_grenade",
    sheet = ART .. "bullet.png",
    anim = "rotation",
    spin = 1.0, -- PX's customSpeed for the speed-following type
    z = wa.depth.OBJECTS - 1,
    mirror = true,
    owner = shooter,
  })

  local hold = {
    sheet = ART .. "bullet.png",
    hand = sb.PX_HANDS[1], -- hand_type 1: the lower hand
    hand_radius = 17.0,
    hand_rotation = 1.0,
    hand_radial_rotation = 1.0,
    hand_scale = 0.8,
    weap_rotation = 0.5,
    weap_radius = 9.0,
    weap_radial_rotation = 1.0,
    frames = 1,
    thrown = true,
    keep_while_firing = false,
  }

  local spec = {
    wep = "weps/security_grenade_wep.wep",
    panel_icon = ART .. "icon.png", -- PX's security_nade_ico.png
    hold_as = "stock.grenade",
    missile = { sprite = 0 }, -- WA draws no round; the art spec draws it
    worm_sprites = sb.PX_POSTURE,
    hold = hold,
    sprites = { ART .. "bullet.png" },
    params = { gpu_prefix = ART },
    on_explode = function(ev)
      pending[#pending + 1] = { x = ev.x, y = ev.y }
    end,
  }
  wa.weapons.replace(spec)
end

return M
`
      },
      {
        path: 'lib/px_spot_hider.lua',
        name: 'lib/px_spot_hider.lua',
        language: 'lua',
        content: `-- Spot Hider: Project X's zone launcher, ported to WormForge by reddaz.

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
    wa.log("Spot Hider: in no panel slot; nothing registered")
    return
  end

  local ART = "sprites/spot_hider/"
  local sb = require("lib/px_sprite_builder")
  local zone = require("lib/px_zone")

  local MASK_TURNS = 4 -- \`SpotHiderParams->turns = 4\`
  local MASK_SPRITE = 128 -- black_mask.png is a 128 pixel sprite
  local MASK_SCALE = 4 -- \`SH_scale = 4\`, \`scale = SH_scale\`
  local MASK_SIZE = MASK_SPRITE * MASK_SCALE
  local MASK_ALPHA = 100 -- \`ARGB\`: black at 100/255
  local MASK_DEPTH = wa.depth.EFFECTS -- \`ZPlane = 4.95\`, his nearest plane
  local FADE_FRAMES = 15 * 50 -- \`duration = 15\` seconds of 50 frames
  local MASK_SHEET = ART .. "mask.png"

  local PULSE_SHEET = ART .. "pulse.png"
  local PULSE_FRAMES = 10 -- \`LoadSprite(f, 10, 0)\`
  local PULSE_SPEED = 0.75 -- \`anim_speed = 0.75\`

  local option = function(key, default)
    local v = ctx.option and ctx.option(key)
    if v == nil then return default end
    return v
  end
  local shadow = option("look", "shadow") == "shadow"
  local enemies_only = option("hides_for", "everyone") == "enemies"
  local spread_frames = math.max(1, option("spread_seconds", 4) * 50)
  local OWN_SIDE = 128

  local function opacity(z)
    return 1 - math.min(1, (z.fade or 0) / FADE_FRAMES)
  end

  local REACH = option("radius", MASK_SIZE // 2)
  local INTO_TERRAIN = { depth = 8, falloff = 8 }
  local function shade(z)
    local circle = math.min(REACH, REACH * z.timer // spread_frames)
    local strength = math.floor(255 * opacity(z) + 0.5)
    if circle == z.circle and strength == z.strength then return end
    z.circle, z.strength = circle, strength
    z.actor.light = {
      mode = "dark", circle = circle, reach = REACH, cone = { length = 0 },
      shadow_cast = true, seen_by = "everyone", strength = strength,
      owner_strength = enemies_only and math.floor(OWN_SIDE * opacity(z) + 0.5) or nil,
      without_fog = true,
      into_terrain = INTO_TERRAIN,
      fill = true,
    }
  end

  local placed = {}
  if shadow then
    local HUD = { labels = true, arrow = true, weapon = true, aim = true }
    local BODY = { { 0, 0 }, { -5, 0 }, { 5, 0 }, { 0, -7 }, { 0, 7 } }
    local HALF = 128
    local hidden = {}
    wa.on.draw(function()
      for i = #placed, 1, -1 do
        if (placed[i].fade or 0) >= FADE_FRAMES then table.remove(placed, i) end
      end
      if #placed == 0 and next(hidden) == nil then return end
      local now = {}
      if #placed > 0 then
        for _, w in ipairs(wa.worms.all()) do
          for _, p in ipairs(BODY) do
            if wa.fog.shade(w.x + p[1], w.y + p[2]) > HALF then
              now[w.id] = w
              break
            end
          end
        end
      end
      for id, w in pairs(now) do
        if not hidden[id] then w.hide_hud = HUD end
      end
      for id, w in pairs(hidden) do
        if not now[id] then w.hide_hud = false end
      end
      hidden = now
    end)
  end

  local shooter
  wa.on.worm_message(function(worm)
    if worm.weapon == "px.spot_hider" then shooter = worm end
  end, { msgs = { wa.msg.FIRE_WEAPON } })

  local ZONES = zone.register({
    name = "Spot Hider",
    fade_frames = FADE_FRAMES,
    frame = shadow and shade or nil,
    draw = not shadow and function(z)
      local alpha = math.floor(MASK_ALPHA * opacity(z))
      zone.mark(MASK_SHEET, z.x, z.y, MASK_SIZE, 0,
        alpha << 24, "alpha", MASK_DEPTH, 0)
    end or nil,
  })

  sb.flight(ctx, {
    weapon = "px.spot_hider",
    sheet = PULSE_SHEET,
    anim = "track",
    cyclical = PULSE_FRAMES,
    anim_speed = PULSE_SPEED,
    z = wa.depth.OBJECTS - 1,
    mirror = true,
  })

  local hold = {
    sheet = PULSE_SHEET,
    hand = sb.PX_HANDS[1], -- hand_type 1: the lower hand
    hand_radius = 20.0,
    hand_rotation = 1.0,
    hand_radial_rotation = 1.0,
    hand_scale = 0.8,
    weap_radius = 10.0,
    weap_rotation = -3.0,
    weap_radial_rotation = 0.9,
    frames = 1,
    thrown = true,
    keep_while_firing = false,
  }

  local spec = {
    wep = "weps/spot_hider_wep.wep",
    panel_icon = ART .. "icon.png", -- PX's sh_ico.png
    missile = { sprite = 0 }, -- WA draws no round; the art spec draws it
    worm_sprites = sb.PX_POSTURE,
    hold = hold,
    sprites = shadow and { PULSE_SHEET } or { PULSE_SHEET, MASK_SHEET },
    params = { gpu_prefix = ART },
    on_explode = function(ev)
      local z = ZONES.place(ev.x, ev.y, { turns = MASK_TURNS, owner = shooter })
      if shadow then
        shade(z)
        placed[#placed + 1] = z
      end
    end,
  }
  spec.handling = { ends_turn = true }
  wa.weapons.replace(spec)
end

return M
`
      },
      {
        path: 'lib/px_sprite_builder.lua',
        name: 'lib/px_sprite_builder.lua',
        language: 'lua',
        content: `-- Public implementation is shared; Highlander state stays in lib/shared.

return require("wf-lib/px_sprite_builder")
`
      },
      {
        path: 'lib/px_trail.lua',
        name: 'lib/px_trail.lua',
        language: 'lua',
        content: `-- PX's effect-manager trail: one ribbon per round, sampled in game frames.

local trail = {}

trail.MAX, trail.EVERY, trail.VANISH = 12, 2, 2
trail.CORE_W, trail.GLOW_W = 8.0, 13.0
trail.R, trail.G, trail.B = 255, 255, 255
trail.DEPTH = nil
trail.BEAM = "sprites/px_effects/beam.png"
trail.GLOW = "sprites/px_effects/beam_glow.png"

local trails = {}
local keys = {}
local live = {}
local driver, tick = nil, 0
local STALE = 2

local function start_driver(t, owner)
  if driver then return end
  driver = wa.actors.spawn({
    sprite = t.beam, visible = false, owner = owner,
    on = function(a)
      tick = tick + 1
      for i = #trails, 1, -1 do
        local v = trails[i]
        if v.live and tick - v.seen >= STALE then
          v.live = false
          live[v.id] = nil
          if v.kept then v.kept:finish() end
        end
        if v.kept and not v.live then
          table.remove(trails, i)
        elseif not v.live and tick % v.vanish == 0 then
          table.remove(v.pts, 1)
          if #v.pts == 0 then
            table.remove(trails, i)
            live[v.id] = nil
          end
        end
      end
      if #trails == 0 then driver = nil; a:remove() end
    end,
  })
end

function trail.add(id, owner, opts)
  local t = {
    id = id, pts = {}, live = true, seen = tick,
    max = trail.MAX, every = trail.EVERY, vanish = trail.VANISH,
    core_w = trail.CORE_W, glow_w = trail.GLOW_W,
    r = trail.R, g = trail.G, b = trail.B,
    depth = trail.DEPTH, beam = trail.BEAM, glow = trail.GLOW,
  }
  for _, k in ipairs({
    "max", "every", "vanish", "core_w", "glow_w", "r", "g", "b", "depth", "beam", "glow",
  }) do
    if opts and opts[k] ~= nil then t[k] = opts[k] end
  end
  if t.depth == nil then t.depth = wa.depth.OBJECTS end
  if wa.draw.trail then
    local glow = t.glow_w > 0
    t.kept = wa.draw.trail({
      sprite = keys[t.beam] or t.beam, width = t.core_w,
      glow = glow and (keys[t.glow] or t.glow) or nil, glow_width = glow and t.glow_w or nil,
      color = (255 << 24) | (math.floor(t.r) << 16) | (math.floor(t.g) << 8) | math.floor(t.b),
      max = t.max, shed = t.vanish, floor = 0.1, blend = "add", depth = t.depth,
    })
  end
  trails[#trails + 1] = t
  live[id] = t
  start_driver(t, owner)
  return t
end

function trail.has(id)
  return live[id] ~= nil
end

function trail.drop(id)
  local t = live[id]
  if t then
    t.live = false
    live[id] = nil
    if t.kept then t.kept:finish() end
  end
end

local installed = false

function trail.install()
  if installed then return end
  installed = true
  keys[trail.BEAM] = wa.sprites.key(trail.BEAM)
  keys[trail.GLOW] = wa.sprites.key(trail.GLOW)

  wa.on.missile_frame(function(m)
    local t = live[m.id]
    if not t then return end
    t.seen = tick
    if m.phase ~= "post" then return end
    if tick % t.every ~= 0 then return end
    if math.abs(m.vx) < 0.15 and math.abs(m.vy) < 0.15 then return end
    local pts = t.pts
    local last = pts[#pts]
    if last
        and (last[1] - m.x) * (last[1] - m.x) + (last[2] - m.y) * (last[2] - m.y) <= 0.01 then
      return
    end
    pts[#pts + 1] = { m.x, m.y }
    if #pts > t.max then table.remove(pts, 1) end
    if t.kept then t.kept:push(m.x, m.y) end
  end)

  if wa.on.draw and wa.draw.ribbon and not wa.draw.trail then
    local RIBBON = { blend = "add", points = {} }
    local ramps = {} -- "r,g,b" -> n -> { f = {...}, color = {...} }
    local function ramp(t, n)
      local by_n = t.ramps
      if not by_n then
        local key = t.r .. "," .. t.g .. "," .. t.b
        by_n = ramps[key]
        if not by_n then by_n = {}; ramps[key] = by_n end
        t.ramps = by_n
      end
      local r = by_n[n]
      if r then return r end
      r = { f = {}, color = {} }
      for i = 1, n do
        local f = i / (n + 1)
        if f < 0.1 then f = 0.1 end
        r.f[i] = f
        r.color[i] = (255 << 24) | (math.floor(t.r * f) << 16)
          | (math.floor(t.g * f) << 8) | math.floor(t.b * f)
      end
      by_n[n] = r
      return r
    end
    local function draw(t)
      local pts, n = t.pts, #t.pts
      if n < 2 then return end -- \`if (trailAmount < 2) return;\`
      local r = ramp(t, n)
      local fs, colors = r.f, r.color
      local rp = RIBBON.points
      local width = t.core_w
      for i = 1, n do
        local p = rp[i]
        if not p then p = {}; rp[i] = p end
        local pt, f = pts[i], fs[i]
        p.x, p.y, p.u, p.width, p.color = pt[1], pt[2], f, f * width, colors[i]
      end
      for i = #rp, n + 1, -1 do rp[i] = nil end
      RIBBON.sprite, RIBBON.depth = keys[t.beam] or t.beam, t.depth
      wa.draw.ribbon(RIBBON)
      if t.glow_w > 0 then
        width = t.glow_w
        for i = 1, n do rp[i].width = fs[i] * width end
        RIBBON.sprite = keys[t.glow] or t.glow
        wa.draw.ribbon(RIBBON)
      end
    end
    wa.on.draw(function()
      for _, t in ipairs(trails) do draw(t) end
    end)
  end
end

return trail
`
      },
      {
        path: 'lib/px_zone.lua',
        name: 'lib/px_zone.lua',
        language: 'lua',
        content: `-- px_zone.lua: PX's turn-timed objects, shared by the zone launcher's weapons.

local M = {}

local objects = {}
local hooks_registered = false

local FPS = 50
local INACTIVE_FRAMES = 7 * FPS

local CRATE_RADIUS = 9

local function forget(o)
  if o.actor then o.actor:remove() end
  for i, other in ipairs(objects) do
    if other == o then
      table.remove(objects, i)
      break
    end
  end
end

local RANK = { worm = 1, grave = 2 }
local function stable(obj)
  if obj.kind == "worm" then return obj.id end
  if obj.kind == "grave" then return obj.worm_id end
  return 0
end
local function before(a, b)
  local ra, rb = RANK[a.kind] or 3, RANK[b.kind] or 3
  if ra ~= rb then return ra < rb end
  local sa, sb = stable(a), stable(b)
  if sa ~= sb then return sa < sb end
  return a.id < b.id
end

local function activator(o)
  local spec = o.spec
  local found, best
  for _, obj in ipairs(wa.world.electrical_nearby(o.x, o.y, spec.reach, true)) do
    if spec.kinds[obj.kind] then
      local dx, dy = (obj.x or o.x) - o.x, (obj.y or o.y) - o.y
      if math.abs(dx) <= spec.radius and math.abs(dy) <= spec.half_height then
        local d = dx * dx + dy * dy
        if not best or d < best or (d == best and before(obj, found)) then
          found, best = obj, d
        end
      end
    end
  end
  return found
end

local CRATE = { kind = "crate" }
local function crates(o)
  local spec = o.spec
  local rx, ry = spec.radius + CRATE_RADIUS, spec.half_height + CRATE_RADIUS
  local near = { near = { o.x, o.y, math.max(rx, ry) * 1.5 } }
  for _, crate in ipairs(wa.crates.all(near)) do
    local key = crate.id
    if not o.crates_hit[key]
        and math.abs(crate.x - o.x) <= rx and math.abs(crate.y - o.y) <= ry then
      o.crates_hit[key] = true
      crate:hit(spec.every_crate, 0, 0)
      spec.tick(o, CRATE)
      if o.active then o.armed = false end
      return
    end
  end
end

local function tick(o)
  local spec = o.spec
  o.timer = o.timer + 1
  if spec.frame then spec.frame(o) end
  if o.turns <= 0 then
    o.fade = (o.fade or 0) + 1
    if o.fade >= (spec.fade_frames or 0) then forget(o) end
    return
  end
  if spec.every_crate then crates(o) end
  if spec.fps and o.timer % spec.fps == 0 then
    if spec.one_shot then
      if not o.active then
        o.armed = true
      elseif o.armed then
        local obj = activator(o)
        if obj and spec.wakes(o, obj) then
          spec.tick(o, obj)
          o.armed = false
        end
      end
    elseif o.active then
      local obj = activator(o)
      if obj and spec.wakes(o, obj) then spec.tick(o, obj) end
    end
  end
  if o.start_be_inactive then
    o.inactive = o.inactive + 1
    if o.inactive > INACTIVE_FRAMES then
      o.active, o.start_be_inactive, o.inactive = false, false, 0
    end
  end
end

local function spend_turn()
  for _, o in ipairs(objects) do
    if o.counting then o.turns = o.turns - 1 end
    o.start_be_inactive = true
    o.inactive = 0
  end
end

local function wake()
  for _, o in ipairs(objects) do
    o.counting = true
    o.active, o.start_be_inactive, o.inactive = true, false, 0
  end
end

function M.mark(sheet, x, y, size, angle, colour, blend, depth, frame)
  local half = size / 2
  local c, s = wa.math.cos(angle) * half, wa.math.sin(angle) * half
  local p = M._quad.points
  p[1][1], p[1][2] = x - c + s, y - s - c
  p[2][1], p[2][2] = x + c + s, y + s - c
  p[3][1], p[3][2] = x + c - s, y + s + c
  p[4][1], p[4][2] = x - c - s, y - s + c
  M._quad.sprite, M._quad.frame = sheet, frame
  M._quad.color, M._quad.blend, M._quad.depth = colour, blend, depth
  wa.draw.quad(M._quad)
end

M._quad = { frame = 0, points = { { 0, 0 }, { 0, 0 }, { 0, 0 }, { 0, 0 } } }

function M.register(spec)
  if not hooks_registered then
    hooks_registered = true
    wa.on.turn_end(spend_turn)
    wa.on.turn_start(wake)
    if wa.on.draw and wa.draw.quad then
      wa.on.draw(function()
        for _, o in ipairs(objects) do
          if o.spec.draw and (o.turns > 0 or o.spec.fade_frames) then o.spec.draw(o) end
        end
      end)
    end
  end
  if spec.radius and not spec.reach then
    spec.reach = math.max(spec.radius, spec.half_height or spec.radius)
  end
  if not spec.wakes then spec.wakes = function() return true end end

  local class = {}

  function class.place(x, y, state)
    local o = state or {}
    o.spec, o.x, o.y, o.timer = spec, x, y, 0
    o.active, o.start_be_inactive, o.inactive = true, false, 0
    o.counting = not spec.next_turn
    o.armed = spec.one_shot and true or false
    o.crates_hit = {}
    o.actor = wa.actors.spawn({
      sprite = false, x = x, y = y,
      owner = o.owner, on = { frame = function() tick(o) end },
    })
    objects[#objects + 1] = o
    return o
  end

  return class
end

return M
`
      },
      {
        path: 'lib/px_zone_fx.lua',
        name: 'lib/px_zone_fx.lua',
        language: 'lua',
        content: `-- The zones' visuals, from PX's art and particles.

local on_missile = require("lib/on_missile")
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
    if not owner then return end
    driver = wa.actors.spawn({ sprite = false, x = x, y = y, owner = owner,
      on = function(a)
        step()
        if #particles == 0 then driver = nil; a:remove() end
      end })
  end
  local speed, heading = -3 - random() * 4, random() * 2 * math.pi
  local damaging_aim = aim and sheet == M.AIM_DAMAGE
  particles[#particles + 1] = {
    sheet = sheet, x = x, y = y, age = 0, aim = aim,
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

function M.flight(weapon, healing)
  local count = 0
  on_missile(function(m)
    if m.weapon ~= weapon or m.phase ~= "post" then return end
    count = count + 1
    local owner = not driver and flight_owner() or nil
    emit(healing and healing() and M.HEAL or M.DAMAGE, m.x, m.y, false, false, owner)
    if count % 2 == 0 then emit(M.GLOW, m.x, m.y, false, true, owner) end
  end, { weapons = { weapon }, phase = "post" })
end

function M.clear_aim()
  for i = #particles, 1, -1 do
    if particles[i].aim then table.remove(particles, i) end
  end
end

function M.aim(worm, healing)
  local angle = worm.aim * math.pi * -worm.facing
  emit(healing and M.HEAL or M.AIM_DAMAGE,
    worm.x + wa.math.sin(angle) * 22, worm.y - wa.math.cos(angle) * 12, true, false, worm)
end

return M
`
      },
      {
        path: 'lib/pyro_turret.lua',
        name: 'lib/pyro_turret.lua',
        language: 'lua',
        content: `-- PyroMan's turrets on lib/turret.lua's body: planting, health, capture, death blast.

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

pyro.FRAMES = {
  mine = { head = 0, base = 1 },
  petrol = { head = 2, base = 3 },
  ballista = { head = 4, base = 5 },
  flame = { head = 6, base = 8 },
}
local MIRROR, RETICLE = 14, 13

local R = 9
local rows = {}
for dy = -2 * R, 0 do
  local d, half = dy + R, 0
  while (half + 1) * (half + 1) + d * d <= R * R do half = half + 1 end
  rows[#rows + 1] = { dy, -half, half }
end
pyro.feet = mask.build(rows, 2 * R, -R, R, 0)

local Z_AMMO, Z_HEAD, Z_BASE = 0xA0000, 0xB0000, 0xC0000

local FRAME_MS = 20 -- WA's 50 frames a second

local TINTS = { 0xFF8080, 0x8080FF, 0x80FF80, 0xE6E680, 0xE680E6, 0x80E6E6 }

local BASE = {
  tower_offset = 25, -- pixels from the centre up to the head's pivot
  tower_len = 10, -- from the pivot to the muzzle
  g_factor = 1, -- the gravity its aim assumes
  thinking = 15, -- frames between finding a worm and aiming
  min_px = 40, sensor_px = 350, lost_px = 450,
  speed = 0.08, -- radians a frame the head turns
  fire_rate_ms = 400,
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

local function find_target(t, a, s)
  local cx, cy = centre(a)
  local py = cy - t.tower_offset
  for _, w in ipairs(wa.worms.all()) do
    local seen = s.seen[w.id]
    if w.alliance ~= s.alliance and seen and seen.moving and w.hp > 0 and w.state ~= "frozen" then
      if w.visible == false then break end
      local dx, dy = w.x - cx, w.y - py
      local d = math.sqrt(dx * dx + dy * dy)
      if d >= t.min_px and d < t.sensor_px and wa.random(0, 99) < 30 then s.tid = w.id end
    end
  end
end

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

local function next_flight(s)
  s.flight = (s.flight + 10) * 1.1
  if s.flight > 100 then s.flight = 16 end
end

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

function pyro.muzzle_clear(a, shot)
  return not wa.world.collides({ x = shot.x, y = shot.y, radius = 3,
    with = { "terrain", "worms", "mines", "crates", "oil", "graves" }, ignore = { a } })
end

function pyro.force(s)
  return s.power - 0.1 + wa.random(0, 63) / 96
end

local function think(t, a, s)
  note_motion(s)
  if s.reload > 0 then s.reload = math.max(0, s.reload - FRAME_MS) end
  local target = s.tid and worm_by_id(s.tid)
  if target and target.state == "frozen" then target = nil end
  if s.tid and not target then s.tid = nil end
  if s.draw_aim and target then
    if s.aim_x < target.x then s.aim_x = s.aim_x + 4 elseif s.aim_x > target.x then s.aim_x = s.aim_x - 4 end
    if s.aim_y < target.y then s.aim_y = s.aim_y + 4 elseif s.aim_y > target.y then s.aim_y = s.aim_y - 4 end
  end
  local clock = wa.world.turn_clock()
  local running = s.clock ~= nil and clock < s.clock
  s.clock = clock
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
  local sn, cs = wa.math.sin(s.ta), wa.math.cos(s.ta)
  local cx, cy = centre(a)
  local shot = { x = cx + sn * s.dir * t.tower_len, y = cy - t.tower_offset - cs * t.tower_len,
    dx = sn * s.dir, dy = -cs }
  next_flight(s)
  if t.shoot(t, a, s, shot) then
    s.draw_aim = true
    s.reload = s.reload_time
    s.reload_time = s.reload_time + s.reload_time * t.fire_increase_pct // 100 // FRAME_MS * FRAME_MS
    s.ammo = s.ammo - 1
    if s.aim_sound <= 0 then
      wa.sound.play(a, AIM_SOUND)
      s.aim_sound = t.aim_sound_gap
    end
  else
    s.tid, s.wait = nil, 10
  end
end

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

local function ignore_hit(t, a, s, hit)
  if hit.kind ~= "arrow" then return false end
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

function pyro.configure(t, ctx)
  t.health, t.ammo = ctx.option("health"), ctx.option("ammo")
  t.fire_rate_ms, t.fire_increase_pct = ctx.option("fire_rate"), ctx.option("fire_increase_pct")
end

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
  c.capture_keeps_firing = true
  c.art = { mask = ART .. "mask.png" }
  c.sounds = { place = SETUP_SOUND }
  c.tints = TINTS
  c.think, c.draw, c.init, c.turn_begin, c.ignore_hit = think, draw, init, turn_begin, ignore_hit
  return turret.new(c)
end

return pyro
`
      },
      {
        path: 'lib/sentry_health.lua',
        name: 'lib/sentry_health.lua',
        language: 'lua',
        content: `-- Small 5x7 digits on a transparent sheet.

local M = { SHEET = "sprites/sentry_ui/digits.png" }
local installed = false
local WIDTH, HEIGHT, ADVANCE = 5, 7, 6

function M.install()
  if installed then return end
  installed = true
  wa.assets.load({ sprites = { M.SHEET }, gpu_prefix = "sprites/sentry_ui/" })
end

local function colour(health, maximum)
  local ratio = math.max(0, math.min(1, health / maximum))
  local low, high, t
  if ratio <= 0.5 then
    low, high, t = { 240, 80, 64 }, { 240, 216, 80 }, ratio * 2
  else
    low, high, t = { 240, 216, 80 }, { 80, 240, 96 }, (ratio - 0.5) * 2
  end
  local r = math.floor(low[1] + (high[1] - low[1]) * t)
  local g = math.floor(low[2] + (high[2] - low[2]) * t)
  local b = math.floor(low[3] + (high[3] - low[3]) * t)
  return 0xB0000000 | (r << 16) | (g << 8) | b
end

local function digit(frame, x, y, tint, depth)
  wa.draw.quad({ sprite = M.SHEET, frame = frame, color = tint, depth = depth, blend = "alpha",
    points = { {x, y}, {x + WIDTH, y}, {x + WIDTH, y + HEIGHT}, {x, y + HEIGHT} } })
end

function M.draw(health, maximum, x, bottom, depth)
  local text = tostring(math.max(0, math.ceil(health)))
  local left = math.floor(x - (#text * ADVANCE - 1) / 2 + 0.5)
  local top = math.floor(bottom - HEIGHT - 1)
  local tint = colour(health, maximum)
  for i = 1, #text do
    local frame, dx = tonumber(text:sub(i, i)), left + (i - 1) * ADVANCE
    digit(frame, dx + 1, top + 1, 0x60000000, depth)
    digit(frame, dx, top, tint, depth)
  end
end

return M
`
      },
      {
        path: 'lib/sentry_mask.lua',
        name: 'lib/sentry_mask.lua',
        language: 'lua',
        content: `-- Collision silhouette above the eight buried pixels of PX's feet.

local rows = {
  { -22, -3, 4 },
  { -21, -4, 5 },
  { -20, -4, 5 },
  { -19, -5, 6 },
  { -18, -5, 6 },
  { -17, -6, 7 },
  { -16, -6, 7 },
  { -15, -9, 7 },
  { -14, -10, 7 },
  { -13, -11, 7 },
  { -12, -12, 7 },
  { -11, -13, -7, -5, 6 },
  { -10, -13, -9, -4, 5 },
  { -9, -12, -10, -2, 3 },
  { -8, -2, 3 },
  { -7, -2, 3 },
  { -6, -2, 3 },
  { -5, -2, 3 },
  { -4, -3, 4 },
  { -3, -3, 4 },
  { -2, -3, 4 },
  { -1, -4, 5 },
  { 0, -4, -1, 1, 5 },
}
local function build(rows, top, left, right, burial)
  local mask = { rows = rows, top = top, left = left, right = right, burial = burial }

  function mask.contains(x, y, px, py)
    local row = rows[py - y + mask.top + 1]
    if not row then return false end
    for i = 2, #row, 2 do
      if px >= x + row[i] and px <= x + row[i + 1] then return true end
    end
    return false
  end

  function mask.overlaps_worm(x, y, worm)
    x, y = math.floor(x), math.floor(y)
    local wx, wy = worm.x, worm.y
    if x + mask.right < wx - 10 or x + mask.left > wx + 10
      or y < wy - 20 or y - mask.top > wy + 6 then return false end
    for _, row in ipairs(rows) do
      local py = y + row[1]
      if py >= wy - 20 and py <= wy + 6 then
        for i = 2, #row, 2 do
          if x + row[i] <= wx + 10 and x + row[i + 1] >= wx - 10 then return true end
        end
      end
    end
    return false
  end

  function mask.intersects(x, y, other_x, other_y, other_mask)
    other_mask = other_mask or mask
    x, y, other_x, other_y = math.floor(x), math.floor(y), math.floor(other_x), math.floor(other_y)
    if x + mask.right < other_x + other_mask.left or x + mask.left > other_x + other_mask.right
      or y < other_y - other_mask.top or y - mask.top > other_y then return false end
    for _, row in ipairs(rows) do
      local other = other_mask.rows[y + row[1] - other_y + other_mask.top + 1]
      if other then
        for i = 2, #row, 2 do
          for j = 2, #other, 2 do
            if x + row[i] <= other_x + other[j + 1] and x + row[i + 1] >= other_x + other[j] then return true end
          end
        end
      end
    end
    return false
  end

  function mask.clear(x, y, worms, planter_id, burial, solid)
    x, y = math.floor(x), math.floor(y)
    burial = burial or 0
    solid = solid or wa.land.solid
    for _, w in ipairs(worms) do
      if w.id ~= planter_id and w.hp > 0 and mask.overlaps_worm(x, y, w) then return false end
    end
    for _, row in ipairs(rows) do
      if row[1] <= -burial then
        local py = y + row[1]
        for i = 2, #row, 2 do
          for px = x + row[i], x + row[i + 1] do
            if solid(px, py) then return false end
          end
        end
      end
    end
    return true
  end

  return mask
end

local mask = build(rows, 22, -13, 7, 8)
mask.build = build
return mask
`
      },
      {
        path: 'lib/shared.lua',
        name: 'lib/shared.lua',
        language: 'lua',
        content: `-- Highlander: what its modules share, one table per match.

local shared = {}

return shared
`
      },
      {
        path: 'lib/stuck_stamp.lua',
        name: 'lib/stuck_stamp.lua',
        language: 'lua',
        content: `-- Where a stamp stuck in the land may go without trapping a worm in new land.

local stuck_stamp = {}

local bars = {}
local function pixels(frame, bar, dx, dy)
  local key = frame .. ":" .. bar.half_length .. ":" .. bar.half_width
  local list = bars[key]
  if list then return list end
  list = {}
  local seen = {}
  for t2 = -2 * bar.half_length, 2 * bar.half_length do
    for s2 = -2 * bar.half_width, 2 * bar.half_width do
      local t, s = t2 / 2, s2 / 2
      local ox, oy = math.floor(dx * t - dy * s + 0.5), math.floor(dy * t + dx * s + 0.5)
      local k = ox * 1024 + oy
      if not seen[k] then
        seen[k] = true
        list[#list + 1] = { ox, oy }
      end
    end
  end
  bars[key] = list
  return list
end

local function holds(w, px, py, list, solid)
  local x0, x1 = math.floor(w.x) - 5, math.floor(w.x) + 5
  local y0, y1 = math.floor(w.y) - 10, math.floor(w.y) + 7
  for _, o in ipairs(list) do
    local x, y = px + o[1], py + o[2]
    if x >= x0 and x <= x1 and y >= y0 and y <= y1 and not solid(x, y) then return true end
  end
  return false
end

function stuck_stamp.place(x, y, frame, bar)
  local rad = math.rad(frame * 11.25)
  local dx, dy = wa.math.sin(rad), -wa.math.cos(rad)
  local list = pixels(frame, bar, dx, dy)
  local near = {}
  for _, w in ipairs(wa.worms.all()) do
    if w.hp > 0 and math.abs(w.x - x) < 80 and math.abs(w.y - y) < 80 then near[#near + 1] = w end
  end
  table.sort(near, function(p, q) return p.id < q.id end)
  local seen = {}
  local function solid(px, py)
    local k = px * 65536 + py
    local v = seen[k]
    if v == nil then v = wa.land.solid(px, py); seen[k] = v end
    return v
  end
  local held
  for d = 0, bar.half_length + 10 do
    local cx, cy = x + dx * d, y + dy * d
    local px, py = math.floor(cx), math.floor(cy)
    if d == 0 or solid(px + math.floor(dx * bar.half_length + 0.5), py + math.floor(dy * bar.half_length + 0.5)) then
      held = nil
      for _, w in ipairs(near) do
        if holds(w, px, py, list, solid) then held = w; break end
      end
      if not held then return cx, cy, d end
    end
  end
  return nil, held
end

return stuck_stamp
`
      },
      {
        path: 'lib/tele_landing.lua',
        name: 'lib/tele_landing.lua',
        language: 'lua',
        content: `-- Where a teleporting shot puts the turn worm: on the spot where it went off, or
-- the first spot that fits in the 11 by 11 square from 4 pixels up and left of it.

local landing = {}

function landing.turn_worm()
  for _, w in ipairs(wa.worms.all()) do
    if w.turn and w.hp > 0 then return w end
  end
end

-- Moves the worm to (x, y) or the nearest spot PX's search finds; false when none fits.
function landing.warp(worm, x, y)
  if worm:fits(x, y) then worm:warp({ x = x, y = y }); return true end
  x, y = math.floor(x), math.floor(y)
  for row = 0, 10 do
    for column = 0, 10 do
      local px, py = x - 4 + column, y - 4 + row
      if worm:fits(px, py) then worm:warp({ x = px, y = py }); return true end
    end
  end
  return false
end

return landing
`
      },
      {
        path: 'lib/turn_controls.lua',
        name: 'lib/turn_controls.lua',
        language: 'lua',
        content: `-- Shared digit input and event dispatch.

local controls = {}
local actions, order = {}, {}
local installed, last_digit
function controls.register(id, callbacks)
  assert(not actions[id], "duplicate turn control: " .. id)
  actions[id] = callbacks
  order[#order + 1] = callbacks
  if callbacks.hint then require("lib/weapon_hint").register(id, callbacks.hint) end
end
function controls.setup()
  if installed then return end
  installed = true
  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FRAME_FINISH then
      for _, callbacks in ipairs(order) do
        if callbacks.frame then callbacks.frame(worm) end
      end
      if not worm.turn then return end
      local digit = wa.world.keys().digit
      local pressed = digit ~= nil and digit ~= last_digit
      last_digit = digit
      if not pressed then return end
      local callbacks = actions[worm.weapon]
      if callbacks and callbacks.choose then callbacks.choose(worm, digit) end
    elseif msg == wa.msg.FIRE_WEAPON then
      local callbacks = actions[worm.weapon]
      if callbacks and callbacks.fire then return callbacks.fire(worm) end
    end
  end, { msgs = { wa.msg.FRAME_FINISH, wa.msg.FIRE_WEAPON } })
  wa.on.turn_end(function()
    for _, callbacks in ipairs(order) do
      if callbacks.finish then callbacks.finish() end
    end
  end)
end
return controls
`
      },
      {
        path: 'lib/turret.lua',
        name: 'lib/turret.lua',
        language: 'lua',
        content: `-- PX's sentry turrets, the shared part: planting, sweeping, aiming, firing, damage.

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
  hit_by = "all", -- what hits it once planted (\`body.hit_by\`)
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
`
      },
      {
        path: 'lib/weapon.lua',
        name: 'lib/weapon.lua',
        language: 'lua',
        content: `-- Shared claim mechanics.

local shared = require("lib/shared")
local owned = {}
shared.owns = function(id) return id ~= nil and owned[id] == true end
local weapon = {}

function weapon.merge(base, overrides)
  local out = {}
  for k, v in pairs(base or {}) do
    out[k] = type(v) == "table" and weapon.merge(v, {}) or v
  end
  for k, v in pairs(overrides or {}) do
    out[k] = type(v) == "table" and weapon.merge(out[k], v) or v
  end
  return out
end

function weapon.claim(id, spec)
  owned[id] = true
  wa.weapons.replace(spec)
end
return weapon
`
      },
      {
        path: 'lib/weapon_hint.lua',
        name: 'lib/weapon_hint.lua',
        language: 'lua',
        content: `-- Weapon hints and notices: the shared tooltip window (wf-lib/tooltip).

local tooltip = require("wf-lib/tooltip")
return { register = tooltip.hint, hint = tooltip.hint, notice = tooltip.notice }
`
      },
      {
        path: 'scheme/highland_rules.lua',
        name: 'scheme/highland_rules.lua',
        language: 'lua',
        content: `-- Highlander gameplay: deal hands, refresh turn ammo, and transfer loot on death.

local shared = require("lib/shared")
local POOLS = shared.POOLS
local arsenal = shared.arsenal
local dead_hands = shared.dead_hands
local dealt = shared.dealt
local describe = shared.describe
local revived_by_lightning = shared.revived_by_lightning

-- ----------------------------------------------------------------- rules

local function deal(worm)
  local cave = wa.world.cavern()
  for _, name in ipairs({ "offensive", "second", "movement" }) do
    local pool = POOLS[cave and "cave_" .. name or name]
    if #pool > 0 then
      arsenal:deal(worm, pool, 1)
    end
  end
  dealt[worm.id] = true
  wa.log(string.format(
    "highlander: worm %d dealt %s (%s map)",
    worm.id, describe(arsenal:list(worm)), cave and "cavern" or "open"
  ))
end

-- ---------------------------------------------------------------- crates

local POOLED = shared.POOLED
local is_pooled = {}
for _, id in ipairs(POOLED) do is_pooled[id] = true end
local crate_stock = {} -- [ammo_group][weapon] = copies

local function rows()
  local out, seen = {}, {}
  for _, live in ipairs(wa.worms.all()) do
    if not seen[live.ammo_group] then
      seen[live.ammo_group] = true
      out[#out + 1] = live
    end
  end
  return out
end

local function row_of(worm_id)
  local team_row
  for _, live in ipairs(wa.worms.all()) do
    if live.id == worm_id then return live.ammo_group end
    if team_row == nil and live.team == worm_id // 16 then team_row = live.ammo_group end
  end
  return team_row
end

local function count_crate_uses(live_rows, only)
  for _, live in ipairs(live_rows) do
    local stock = crate_stock[live.ammo_group]
    if stock then
      for _, name in ipairs(POOLED) do
        local s = stock[name]
        if s and (not only or only[name]) then
          local left = live:ammo(name)
          if left >= 0 and left < s then stock[name] = left > 0 and left or nil end
        end
      end
    end
  end
end

local function restore_crate_stock(live_rows, only)
  for _, live in ipairs(live_rows) do
    local stock = crate_stock[live.ammo_group]
    if stock then
      for _, name in ipairs(POOLED) do
        local s = stock[name]
        if s and (not only or only[name]) then
          local have = live:ammo(name)
          if have >= 0 then live:ammo(name, { set = have + s }) end
        end
      end
    end
  end
end

wa.on.weapon_grant(function(event)
  if event.source ~= "crate" then return end
  local row
  for _, item in ipairs(event.items) do
    if is_pooled[item.weapon] then
      row = row or row_of(event.worm_id)
      if row == nil then return end
      local stock = crate_stock[row] or {}
      crate_stock[row] = stock
      stock[item.weapon] = (stock[item.weapon] or 0) + item.amount
      wa.log(string.format(
        "highlander: worm %d's team keeps %d %s from a crate (%d in its stock)",
        event.worm_id, item.amount, item.weapon, stock[item.weapon]
      ))
    end
  end
end)

-- -------------------------------------------------------------- the turn

local function start_turn(worm)
  local live = rows()
  count_crate_uses(live)
  arsenal:apply(worm, { clear = true, each = 1 })
  restore_crate_stock(live)
end

local function on_death(event)
  local victim = event.victim
  local active = event.active
  revived_by_lightning[victim.id] = nil
  local mine = arsenal:list(victim)
  dead_hands[victim.id] = mine

  if active and active.id == victim.id then
    local live = rows()
    count_crate_uses(live)
    arsenal:clear(victim)
    arsenal:apply(victim, { clear = true, each = 1 })
    restore_crate_stock(live)
    wa.log(string.format("highlander: worm %d died on its own turn", victim.id))
    return
  end

  if not active or active.hp <= 0 then
    return
  end
  arsenal:transfer(victim, active, {
    weapons = "all", mode = "move", x = victim.x, y = victim.y,
  })
  local stolen = {}
  for _, name in ipairs(mine) do stolen[name] = true end
  count_crate_uses({ active }, stolen)
  arsenal:apply(active, { weapons = mine, each = 1 })
  restore_crate_stock({ active }, stolen)
  wa.log(string.format(
    "highlander: worm %d took %s from worm %d",
    active.id, describe(mine), victim.id
  ))
end

wa.on.worm_message(function(worm, msg)
  if not dealt[worm.id] then
    deal(worm)
  end
end, { msgs = { wa.msg.FRAME_FINISH, wa.msg.START_TURN } })

shared.fresh_hand = function(worm)
  arsenal:clear(worm)
  dealt[worm.id] = nil
  dead_hands[worm.id] = nil
  revived_by_lightning[worm.id] = nil
end

wa.on.turn_start(function(event)
  start_turn(event.worm)
end)

wa.on.death(on_death)

`
      },
      {
        path: 'scheme/pools.lua',
        name: 'scheme/pools.lua',
        language: 'lua',
        content: `-- Highlander: the weapon pools.

local shared = require("lib/shared")

local pools = assert(shared.pools, "scheme/pools: components/highlander.lua sets the pools")

local POOLED, seen = {}, {}
for _, name in ipairs({ "offensive", "second", "movement" }) do
  for _, id in ipairs(pools[name]) do
    if not seen[id] then
      seen[id] = true
      POOLED[#POOLED + 1] = id
    end
  end
end

shared.POOLS = pools
shared.POOLED = POOLED
`
      },
      {
        path: 'scheme/random_race.lua',
        name: 'scheme/random_race.lua',
        language: 'lua',
        content: `-- Random Race: each round of turns races with one movement weapon, chosen at random.

local own_time = require("wf-lib/own_time")
local parkour = require("wf-lib/parkour")
local shared = require("lib/shared")

local race = {}

local ART = "sprites/random_race/"
local RACES = {
  { name = "rope", weapons = { "stock.ninja_rope" }, banner = ART .. "rope_race.png" },
  { name = "parkour", weapons = { "px.jump", "stock.low_gravity" }, banner = ART .. "park_race.png", parkour = true },
  { name = "wings", weapons = { "px.wings" }, banner = ART .. "wing_race.png" },
  { name = "portal", weapons = { "px.portal_gun" }, banner = ART .. "port_race.png" },
  { name = "helicopter", weapons = { "px.helicopter" }, banner = ART .. "heli_race.png" },
}
local TEAMS = 6
local WALL_JUMP = 6 -- WallJumpMultiplier
local AIR_STEP, AIR_LIMIT = 0.1, 3 -- pixels/frame
local AIR_STATES = { jumping = true, falling = true, tumbling = true, hit = true, blasted = true, drilling = true }
local BANNER_W, BANNER_H = 400, 200
local GROW, HOLD, FADE = 25, 190, 20 -- frames

function race.install(ctx)
  local draw = {}
  for _, r in ipairs(RACES) do
    local placed = true
    for _, id in ipairs(r.weapons) do placed = placed and ctx.weapons[id] ~= nil end
    if placed then draw[#draw + 1] = r end
  end
  if #draw == 0 then
    wa.log("Random Race: no race has all its weapons on the panel; off")
    return
  end
  local banners = {}
  for _, r in ipairs(draw) do banners[#banners + 1] = r.banner end
  wa.assets.load({ sprites = banners, gpu_prefix = ART })

  local current, left, shown_at = nil, 0, nil
  local turn_open, active = false, {}
  local movement = parkour.new({ wall_jump = WALL_JUMP, carry_speed = false })

  local function choose()
    current = draw[wa.random(1, #draw)]
    for team = 1, TEAMS do
      for _, r in ipairs(draw) do
        for _, id in ipairs(r.weapons) do
          wa.weapons.set_selectable({ weapon = id, team = team, selectable = r == current })
        end
      end
    end
    local teams = {}
    left = 0
    for _, w in ipairs(wa.worms.all()) do
      if w.hp > 0 and not teams[w.team] then
        teams[w.team] = true
        left = left + 1
      end
    end
    shown_at = wa.world.frame()
    wa.log(("Random Race: %s race for %d turns"):format(current.name, left))
  end

  wa.on.turn_start(function(ev)
    if not turn_open then
      turn_open = true
      if left <= 0 then choose() end
    end
    local worm = ev.worm
    if worm and current.parkour and not active[worm.id] then
      active[worm.id] = true
      if shared.swim_suit_on then shared.swim_suit_on(worm) end
    end
  end)

  wa.on.turn_end(function()
    if turn_open then left = left - 1 end
    turn_open, active = false, {}
  end)

  local function steer(worm)
    if not AIR_STATES[worm.state] then return end
    local k = worm.keys
    for _ = 1, own_time.frames(worm) do
      if k.up and worm.vy >= -AIR_LIMIT then worm.vy = worm.vy - AIR_STEP end
      if k.down and worm.vy <= AIR_LIMIT then worm.vy = worm.vy + AIR_STEP end
      if k.left and worm.vx >= -AIR_LIMIT then worm.vx = worm.vx - AIR_STEP end
      if k.right and worm.vx <= AIR_LIMIT then worm.vx = worm.vx + AIR_STEP end
    end
  end

  wa.on.worm_message(function(worm, msg)
    if not worm.turn or not active[worm.id] or worm.hp <= 0 then return end
    if msg == wa.msg.FRAME_FINISH then steer(worm) end
    local airborne = parkour.air_input(worm, msg)
    movement(worm, msg)
    if airborne then return "eat" end
  end, { msgs = { wa.msg.FRAME_FINISH, wa.msg.JUMP, wa.msg.JUMP_UP } })

  wa.on.hud(function()
    if not shown_at then return end
    local age = wa.world.frame() - shown_at
    if age < 0 or age >= HOLD + FADE then return end
    local alpha = age < GROW and (age + 1) / GROW or age < HOLD and 1 or 1 - (age - HOLD) / FADE
    local w, h = wa.hud.size()
    wa.hud.sprite({
      sprite = current.banner, x = (w - BANNER_W) // 2, y = h // 4 - BANNER_H // 2,
      color = math.floor(alpha * 255) * 0x1000000 + 0xFFFFFF,
    })
  end)
end

return race
`
      },
      {
        path: 'scheme/specialists_data.lua',
        name: 'scheme/specialists_data.lua',
        language: 'lua',
        content: `-- Specialists 2.3 (five worms), 0rang3's September 2026 build.

return {
  classes = {
    { name = "Soldier", hp = 150,
      weapons = { "stock.bazooka", "stock.grenade", "px.mines_gun", "px.tnt", "px.chilli_bomb" },
      survivor = { "px.parkour" } },
    { name = "Gunner", hp = 175,
      weapons = { "px.gatling_gun", "stock.prod", "px.swim_suit", "px.sentry_gun", "px.platform" },
      survivor = { "stock.banana_bomb" } },
    { name = "Engineer", hp = 150,
      weapons = { "px.gravity_gun", "stock.blow_torch", "stock.girder", "px.sentry_laser", "stock.mine", "px.electromagnet" },
      survivor = { "px.tele_arrow", "px.remote_roller" } },
    { name = "Ninja", hp = 150,
      weapons = { "px.jump", "stock.fire_punch", "px.ninja_star", "stock.petrol_bomb", "stock.ninja_rope" },
      survivor = {} },
    { name = "Medic", hp = 300,
      weapons = { "stock.parachute", "px.real_shotgun", "stock.teleport" },
      survivor = { "stock.holy_grenade" } },
  },
  delays = {
    ["stock.bazooka"] = 1, ["stock.grenade"] = 1, ["px.mines_gun"] = 2,
    ["px.tnt"] = 2, ["px.chilli_bomb"] = 2, ["px.parkour"] = 1,
    ["px.gatling_gun"] = 1, ["stock.prod"] = 1, ["px.sentry_gun"] = 3,
    ["px.platform"] = 1, ["stock.banana_bomb"] = 1, ["stock.blow_torch"] = 1,
    ["stock.girder"] = 2, ["px.sentry_laser"] = 3, ["stock.mine"] = 2,
    ["px.electromagnet"] = 3, ["px.tele_arrow"] = 2, ["px.remote_roller"] = 1,
    ["stock.fire_punch"] = 1, ["px.ninja_star"] = 1, ["stock.petrol_bomb"] = 2,
    ["px.real_shotgun"] = 1, ["stock.teleport"] = 5, ["stock.holy_grenade"] = 1,
  },
}
`
      },
      {
        path: 'scheme/specialists_rules.lua',
        name: 'scheme/specialists_rules.lua',
        language: 'lua',
        content: `-- Class inventories, native cooldowns, Medic aura and the Soldier's zombie.

local data = require("scheme/specialists_data")
local zombie = require("scheme/specialists_zombie")
local rules = {}
local GLOW = "sprites/specialists/glow.png"
local COLOURS = { 0x50780000, 0x50000078, 0x50007800, 0x505A5A00, 0x505A005A, 0x50005A5A }

function rules.install(ctx)
  if ctx.selected("hl.rules") then error("Select either Specialists rules or Highlander rules.") end
  local placed = ctx.weapons
  local managed, seen = {}, {}
  for _, class in ipairs(data.classes) do
    for _, list in ipairs({ class.weapons, class.survivor }) do
      for _, id in ipairs(list) do
        if placed[id] and not seen[id] then
          managed[#managed + 1], seen[id] = id, true
        end
      end
    end
  end
  local initialized, temporary_locks, warned_extra = {}, {}, false
  local function class_of(worm) return data.classes[worm.id % 16] end
  local function initialize(worm)
    local class = class_of(worm)
    if not class then
      if not warned_extra then
        wa.log("Specialists: use five worms per team; additional worms have no class.")
        warned_extra = true
      end
      return nil
    end
    if worm.hp <= 0 then return class end
    if not initialized[worm.id] then
      initialized[worm.id] = true
      worm.name = class.name
      if worm.hp < class.hp then worm:heal(class.hp - worm.hp) end
    elseif worm.name ~= class.name and not zombie.is_zombie(worm) then
      worm.name = class.name
    end
    return class
  end
  local function survivors(worm)
    local count = 0
    for _, other in ipairs(wa.worms.all()) do
      if other.team == worm.team and other.hp > 0 and class_of(other) and not zombie.is_zombie(other) then
        count = count + 1
      end
    end
    return count
  end
  local function refresh(worm)
    local class = initialize(worm)
    if not class or worm.hp <= 0 then return end
    local allowed = {}
    for _, id in ipairs(class.weapons) do allowed[id] = true end
    if survivors(worm) == 1 then
      for _, id in ipairs(class.survivor) do allowed[id] = true end
    end
    for _, id in ipairs(managed) do
      worm:ammo(id, { set = allowed[id] and -1 or 0, keep_delay = true })
    end
  end
  wa.assets.load({ sprites = { GLOW }, gpu_prefix = "sprites/specialists/", wa_sprites = { "worm" } })
  zombie.install(function(worm) return worm.id % 16 == 1 end, data.classes[1].name)
  wa.on.turn_start(function(event) refresh(event.worm) end)
  wa.on.worm_message(function(worm, msg)
    initialize(worm)
    if msg == wa.msg.TURN_STARTED and worm.turn then
      local locks = temporary_locks[worm.ammo_group] or {}
      for _, id in ipairs(wa.sorted(locks)) do
        if worm:delay(id) == -1 then worm:delay(id, 0) end
      end
      temporary_locks[worm.ammo_group] = nil
      refresh(worm)
    elseif msg == wa.msg.WEAPON_RELEASED and worm.turn then
      local id = worm.weapon
      if id and placed[id] then
        local delay = data.delays[id]
        if delay then
          worm:delay(id, delay)
        elseif wa.weapons.data(id).handling.ends_turn then
          worm:delay(id, -1)
          local locks = temporary_locks[worm.ammo_group] or {}
          locks[id] = true
          temporary_locks[worm.ammo_group] = locks
        end
      end
      refresh(worm)
    elseif msg == wa.msg.FRAME_FINISH and worm.turn then
      if worm.state == "roping" and placed["stock.ninja_rope"] then
        worm:delay("stock.ninja_rope", 1)
      elseif worm.state == "parachuting" and placed["stock.parachute"] then
        worm:delay("stock.parachute", 0)
      end
      if worm.state == "prefiring" and worm.weapon == "px.jump" and placed["px.jump"] then
        worm:delay("px.jump", 1)
      end
    end
  end, { msgs = { wa.msg.FRAME_FINISH, wa.msg.TURN_STARTED, wa.msg.WEAPON_RELEASED } })
  wa.on.hurt(function(hit)
    local medic = hit.worm
    if hit.phase ~= "post" or hit.kind ~= "poison" or medic.hp <= 0 then return end
    local class = initialize(medic)
    if not class or class.name ~= "Medic" then return end
    for _, other in ipairs(wa.worms.all()) do
      local target_class = initialize(other)
      local dx, dy = other.x - medic.x, other.y - medic.y
      if target_class and other.id ~= medic.id and other.hp > 0
        and other.alliance == medic.alliance and dx * dx + dy * dy <= 10000
        and other.hp <= target_class.hp then other:heal(25) end
    end
  end)
  wa.on.draw(function()
    for _, worm in ipairs(wa.worms.all()) do
      local class = class_of(worm)
      if class and class.name == "Medic" and worm.hp > 0 then
        local x, y = worm.x, worm.y
        wa.draw.quad({ points = { {x-128,y-128}, {x+128,y-128}, {x+128,y+128}, {x-128,y+128} },
          sprite = GLOW, visibility = worm, frame = 0,
          color = COLOURS[worm.alliance + 1], additive = true, depth = wa.depth.EFFECTS })
      end
    end
  end)
end

return rules
`
      },
      {
        path: 'scheme/specialists_zombie.lua',
        name: 'scheme/specialists_zombie.lua',
        language: 'lua',
        content: `-- The Soldier's zombie: PX's random zombies, narrowed to the Soldier.

local zombie = {}

local HP = 100
local NAME = "Zombie"
local TINT = { color = 0x60FF60, light = 0.35, glow = 0.8 }
local ATTACK_COOLDOWN = 60
local LEAP_RANGE = 400
local PUNCH = "stock.fire_punch"

local CAN_PUNCH = { standing = true, walking = true, falling = true, jumping = true, jump_prepare = true }

function zombie.install(is_soldier, soldier_name)
  local shared = require("lib/shared")
  local zombies, spent = {}, {} -- by worm id; spent: may not turn again
  local turning = {} -- a lethal hit was cut to 1 HP
  local attack_cd = {}
  local out = {} -- zombies of a team that is out
  local target -- the worm being played
  local last_frame, last_clock, running

  function zombie.is_zombie(worm) return zombies[worm.id] == true end

  local function alive(worm)
    return worm.hp > 0 and worm.state ~= "dying" and worm.state ~= "drowning" and worm.state ~= "dead"
  end

  local function turn(worm)
    zombies[worm.id], spent[worm.id], turning[worm.id] = true, true, nil
    if worm.hp <= 0 then
      worm:heal(HP, { from_zero = true })
    elseif worm.hp < HP then
      worm:heal(HP - worm.hp)
    end
    worm.selectable = false
    worm.tint = TINT
    worm.name = NAME
    wa.log("Specialists: worm " .. worm.id .. " comes back as a zombie")
  end

  shared.lightning_restores_worm = function(worm)
    if not zombies[worm.id] or out[worm.id] then return false end
    zombies[worm.id], spent[worm.id] = nil, nil
    worm.selectable = true
    worm.tint = nil
    worm.name = soldier_name
    wa.log("Specialists: Lightning restores worm " .. worm.id)
    return true
  end

  wa.on.hurt(function(hit)
    local worm = hit.worm
    if hit.phase ~= "pre" or not worm or zombies[worm.id] or spent[worm.id] then return end
    if not is_soldier(worm) or not alive(worm) then return end
    if hit.kind == "percent" or hit.kind == "poison" then return end
    local takes = hit.expected
    if takes == nil then
      if hit.kind == "blast" then return end
      takes = hit.amount
    end
    if takes and takes >= worm.hp then
      if hit.kind == "blast" then hit.damage = worm.hp - 1 else hit.amount = worm.hp - 1 end
      turning[worm.id] = true
    end
  end)

  wa.on.turn_start(function(event) target = event.worm; last_clock, running = nil, false end)
  wa.on.turn_end(function() target, last_clock, running = nil, nil, false end)

  local function team_out_check(worms)
    local humans, theirs = {}, {}
    for _, worm in ipairs(worms) do
      if alive(worm) then
        if zombies[worm.id] then
          theirs[#theirs + 1] = worm
        else
          humans[worm.team] = true
        end
      end
    end
    for _, worm in ipairs(theirs) do
      if not humans[worm.team] then
        worm:hit({ amount = worm.hp, react = false })
        if not out[worm.id] then
          wa.log("Specialists: team " .. worm.team .. " has only zombies left")
        end
        out[worm.id] = true
      end
    end
  end

  local function each_frame()
    for _, id in ipairs(wa.sorted(attack_cd)) do
      attack_cd[id] = attack_cd[id] > 1 and attack_cd[id] - 1 or nil
    end
    local clock = target and wa.world.turn_clock()
    running = clock ~= nil and last_clock ~= nil and clock < last_clock
    last_clock = clock
    team_out_check(wa.worms.all())
  end

  local function face(worm, x) worm.facing = worm.x < x and 1 or -1 end

  local function hand_over(worm)
    worm:input({ key = "tab" })
    if worm.turn then
      worm:clear_keys()
      if wa.world.turn_clock() > 0 then
        wa.world.set_turn_clock(0)
        wa.log("Specialists: worm " .. worm.id .. " turned on its own turn; no worm selection, the turn ends")
      end
    else
      wa.log("Specialists: worm " .. worm.id .. " turned on its own turn; the team's next worm takes it")
    end
  end

  local function leap(z, t)
    local dx, dy = t.x - z.x, t.y - z.y
    local l = math.sqrt(dx * dx + dy * dy)
    if l > LEAP_RANGE or wa.land.trace(z.x, z.y, t.x, t.y) then return end
    local frames = l / 10 + 1
    local g = wa.world.gravity() * t.gravity
    local rx = dx / frames
    local ry = (2 * dy - g * frames * frames) / (2 * frames)
    local power = math.sqrt(rx * rx + ry * ry)
    if power <= 0 then return end
    local force = power - 0.1 + wa.random(0, 63) / 96
    face(z, t.x)
    z:release(rx / power * force, ry / power * force)
  end

  local function act(z)
    local t = target
    if not running or not t or t.id == z.id or zombies[t.id] or not alive(t) then return end
    if t.invisibility then return end
    local x, y, tx, ty = z.x, z.y, t.x, t.y
    if x < tx + 150 and x > tx - 150 and y > ty - 90 and y < ty + 90 then
      if x <= tx + 20 and x >= tx - 20 and y > ty - 12 and y < ty + 100
        and not attack_cd[z.id] and CAN_PUNCH[z.state] then
        face(z, tx)
        attack_cd[z.id] = ATTACK_COOLDOWN
        z:use(PUNCH)
      end
      if x < tx + 20 and x > tx - 20 and y > ty - 12 and y < ty + 90 then return end
      if z.state == "standing" or z.state == "walking" then
        if x > tx then z:input({ key = "left" }) elseif x < tx then z:input({ key = "right" }) end
      end
    elseif z.state == "standing" then
      leap(z, t)
    end
  end

  wa.on.worm_message(function(worm)
    local frame = wa.world.frame()
    if frame ~= last_frame then
      last_frame = frame
      each_frame()
    end
    if zombies[worm.id] and worm.name ~= NAME and alive(worm) then
      zombies[worm.id], out[worm.id], attack_cd[worm.id] = nil, nil, nil
      wa.log("Specialists: worm " .. worm.id .. " comes back from its grave a Soldier")
    end
    if worm.state == "drowning" then spent[worm.id] = true end
    if not zombies[worm.id] then
      if is_soldier(worm) and not spent[worm.id] and worm.state ~= "drowning"
        and (turning[worm.id] or worm.hp <= 0) and worm.state ~= "dying" and worm.state ~= "dead" then
        turn(worm)
      end
      return
    end
    if worm.turn then hand_over(worm) end
    if out[worm.id] or not alive(worm) then return end
    act(worm)
  end, { msgs = { wa.msg.FRAME_FINISH } })
end

return zombie
`
      },
      {
        path: 'scheme/state.lua',
        name: 'scheme/state.lua',
        language: 'lua',
        content: `-- Highlander: the scheme's state.

local shared = require("lib/shared")
local POOLED = shared.POOLED

-- ----------------------------------------------------------------- state

local arsenal = wa.inventory.create({ id = "arsenal", slots = POOLED })
local dealt = {}
local dead_hands = {}
shared.revived_by_lightning = shared.revived_by_lightning or {}
local revived_by_lightning = shared.revived_by_lightning

shared.restore_lightning_inventory = function(worm)
  local hand = dead_hands[worm.id]
  if not hand then return end
  arsenal:clear(worm)
  for _, weapon in ipairs(hand) do arsenal:add(worm, weapon, 1) end
  dealt[worm.id] = true
  dead_hands[worm.id] = nil
end

local function describe(list)
  if not list or #list == 0 then
    return "(nothing)"
  end
  return table.concat(list, ", ")
end

shared.arsenal = arsenal
shared.dead_hands = dead_hands
shared.dealt = dealt
shared.describe = describe
shared.revived_by_lightning = revived_by_lightning
`
      },
      {
        path: 'weapons/3_girder_pack.lua',
        name: 'weapons/3_girder_pack.lua',
        language: 'lua',
        content: `-- 3 Girder Pack: places three girders in one go.

local weapon = {}

weapon.record = {
  handling = {
    remember_selection = true,
    shots = 3,
  },
}

weapon.defaults = {
  placement = "girder_pack",
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.girder_pack",
    name = "3 Girder Pack",
  })
end

return weapon
`
      },
      {
        path: 'weapons/anti_fall_damage.lua',
        name: 'weapons/anti_fall_damage.lua',
        language: 'lua',
        content: `-- Anti Fall Damage: for the turn, a fast-flying worm lands on its feet, unhurt and in control.

local ID = "px.anti_fall_damage"
local SOUND = "sounds/anti_fall_damage/fall_protection.wav"
local FAST = 8 -- pixels/frame
-- WS_JUMP, WS_FLYING2, WS_SLIDING, WS_FLYING, WS_AFTERROPE and WS_POWERFLY.
local GUARDED = {
  jumping = true, jump_falling = true, falling = true, tumbling = true,
  hit = true, blasted = true, after_rope = true,
}

local automatic = false

local weapon = {
  defaults = { crate = { type = "utility" } },
  definition = {
    copy_from = "stock.double_turn_time",
    name = "Anti Fall Damage",
    panel_icon = "sprites/anti_fall_damage/anti_fd_ico.png",
    handling = { remember_selection = false, ends_turn = false, retreat = -1 },
    utility = { effect = "scripted" },
    sounds = { SOUND },
  },
  requires = { "lib/turn_controls" },
}

function weapon.setup()
  local on = {}
  local function switch(worm)
    on[worm.id] = not on[worm.id]
    if on[worm.id] then wa.sound.play(worm, SOUND) end
  end
  require("lib/turn_controls").register(ID, {
    fire = switch,
    finish = function() on = {} end,
    hint = function(worm)
      return "Anti Fall Damage: " .. (on[worm.id] and "ON" or "OFF") .. "\\nSpace: on/off"
    end,
  })
  wa.on.turn_start(function(ev)
    local worm = ev.worm
    if automatic and worm and not on[worm.id] and worm:ammo(ID) ~= 0 then
      switch(worm)
      worm:ammo(ID, -1)
    end
  end)
  wa.on.worm_message(function(worm)
    if not worm.turn or not on[worm.id] or not GUARDED[worm.state] then return end
    if math.abs(worm.vx) > FAST or math.abs(worm.vy) > FAST then worm:set_state("standing") end
  end, { msgs = { wa.msg.FRAME_FINISH } })
end

function weapon.configure(ctx)
  automatic = ctx.data.auto_use == true
end

return weapon
`
      },
      {
        path: 'weapons/attack_helicopter.lua',
        name: 'weapons/attack_helicopter.lua',
        language: 'lua',
        content: `-- Attack Helicopter: click a target; a helicopter strafes in from off the map and guns it down.

local trail = require("lib/px_trail")

return {
  defaults = {
    ammo = { round_start = -1 },
    delay = 0,
  },
  install = function(ctx)
    trail.install()
    local BULLETS        = ctx.option("bullets") -- PX bulletCount, default 17
    local ENTER_Y        = -288 -- spawn height, above the map
    local SIDE           = 500 -- spawn offset past the map edge
    local HOVER          = 15 -- entry/hover speed
    local SHOOT_RANGE    = 450 -- begin firing within this of the target
    local COOLDOWN_START = 40 -- wind-up before the first shot
    local COOLDOWN_SHOT  = 4 -- frames between shots
    local BULLET_SPEED   = 35 -- homeToPlace speed (, "35.0")
    local BULLET_FRAMES  = 3 -- homeToPlace runs this long
    local BULLET_FUSE    = 3000 -- timeBeforeExplosion, the longest a round flies
    local EXIT_MARGIN    = 3 -- frames a round flies on past a side of the map
    local MUZZLE         = 22
    local BLAST_DAMAGE   = 80 -- Weap->launch.explosion.damage
    local BLAST_KIND     = 100 -- big blast (PX's pushPower 120 has no field here)
    local DEAD_DAMAGE    = 25 -- TakeExplosionDamage -> Collide above this
    local DRIFT          = 0.984 -- SpX damping while shooting
    local LEAVE          = 1.082 -- SpX growth after the magazine
    local TURN           = 0.75 -- gunAngle interpolation
    local ROTOR_TICKS    = 47 -- heli2Wav loop period
    local HALF_PI        = math.pi / 2
    local CASING_FRAMES  = 16
    local CASING_LIFE    = 100 -- p->SetLifeTime
    local CASING_JITTER  = 17 -- RandomFloat(-0.3, 0.3) rad, in degrees
    local CASING_SPEED_MIN, CASING_SPEED_MAX = 200, 300 -- 2.0 .. 3.0, hundredths
    local FLIP_AIM, FLIP_GUN = true, true

    local ART = "sprites/attack_helicopter/"
    local BULLET = "sprites/bullet.png" -- the redWeapSheet bullet PX draws itself
    local SND = "sounds/attack_helicopter/"

    local helis = {} -- body actor id -> helicopter state
    local shots = {}
    local shot_heard

    local function trunc(n) return n < 0 and math.ceil(n) or math.floor(n) end

    local frame, hit

    local function update_aim(h, spawned)
      local instant = wa.math.atan(h.ty - h.y, math.abs(h.tx - h.x)) -- atan2(dy, |dx|)
      if instant > HALF_PI then instant = HALF_PI end
      if instant < -math.pi then instant = -math.pi end
      if spawned then
        h.gun = instant
      else
        h.gun = h.gun + (instant - h.gun) * TURN
      end
      local n = (h.gun + math.pi) / (math.pi * 1.5) -- 0.0 to 1.0
      if n < 0 then n = 0 elseif n > 1 then n = 1 end
      h.worm_frame = math.floor((1 - n) * 31)
    end

    local function update_rot(h)
      local fast = h.vx < -14 or h.vx > 14
      local slow = h.vx > -14 and h.vx < 14
      if h.dir >= 0 then
        if fast and h.shots < BULLETS then
          h.rot = 0.3
        elseif slow and h.shots < BULLETS then
          if h.rot > -0.115 then h.rot = h.rot - 0.01 end
        elseif h.shots >= BULLETS then
          if h.rot < 0.3 then h.rot = h.rot + 0.01 end
        end
      else
        if fast and h.shots < BULLETS then
          h.rot = -0.3
        elseif slow and h.shots < BULLETS then
          if h.rot < 0.115 then h.rot = h.rot + 0.01 end
        elseif h.shots >= BULLETS then
          if h.rot > -0.3 then h.rot = h.rot - 0.01 end
        end
      end
    end

    local function place(h)
      local a, aim, gun = h.body, h.aim, h.gun_actor
      local right = h.dir >= 0
      local face = right and -1 or 1
      local aface = FLIP_AIM and -face or face -- the worm's own mirror
      local gface = FLIP_GUN and -face or face -- the gun's own mirror
      a.x, a.y, a.vx, a.vy, a.facing = h.x, h.y, 0, 0, face
      a:frame(h.frame)
      a:gfx({ angle = math.deg(h.rot) % 360, depth = wa.depth.OBJECTS + 2 })

      local gx = h.x + (right and 5 or -5)
      aim.x, aim.y, aim.facing = gx - 2, h.y + 6, aface
      aim:frame(h.worm_frame)
      aim:gfx({ angle = math.deg(h.rot * 0.9) % 360, depth = wa.depth.OBJECTS + 1 })

      local final = right and h.gun or (math.pi - h.gun) -- mirror left
      gun.x, gun.y, gun.facing = gx, h.y + 12, gface
      gun:frame(h.firing and 1 or 0)
      gun:gfx({ angle = -math.deg(HALF_PI + final) % 360, depth = wa.depth.OBJECTS })
    end

    local function despawn(a)
      if a and not a.dead then a:remove() end
    end
    local function drop(h)
      helis[h.body.id] = nil
      despawn(h.aim)
      despawn(h.gun_actor)
      despawn(h.body)
    end

    local function boom(h)
      if h.owner then
        for _, f in ipairs({ { -3, -1 }, { 3, 20 }, { 0, -3 } }) do
          wa.fire.spawn({
            owner = h.owner, x = h.x + f[1], y = h.y + f[2],
            count = 7, duration = 1500, up_power = 55, damage = 9,
          })
        end
      end
      h.body:explode({ damage = BLAST_DAMAGE, id = BLAST_KIND, below = false })
      drop(h)
    end

    local casings = {} -- in the order they left: { x, y, vx, vy, g, born }
    local function eject(h)
      local ang = h.gun + HALF_PI + math.rad(wa.random(-CASING_JITTER, CASING_JITTER))
      local speed = wa.random(CASING_SPEED_MIN, CASING_SPEED_MAX) / 100
      local now = wa.world.frame()
      while casings[1] and now - casings[1].born >= CASING_LIFE do table.remove(casings, 1) end
      casings[#casings + 1] = {
        x = h.x, y = h.y + 10, -- PX: PosX, PosY + 10
        vx = wa.math.cos(ang) * speed, vy = wa.math.sin(ang) * speed,
        g = wa.world.gravity(), born = now,
      }
    end

    local function in_box(o, l, r, t, b)
      return o.x > l and o.x < r and o.y > t and o.y < b
    end

    local function find_worm(h, l, r, t, b)
      local pick, count = nil, 0
      for _, w in ipairs(wa.worms.all()) do
        if w.hp > 0 and w.id ~= h.owner.id and in_box(w, l, r, t, b) then
          count = count + 1
          if wa.random(1, count) == 1 then pick = w end
        end
      end
      return pick
    end

    local function find_any(l, r, t, b)
      local pick, count = nil, 0
      for _, group in ipairs({ wa.worms, wa.mines, wa.crates, wa.oil }) do
        if group then
          for _, o in ipairs(group.all()) do
            if (o.kind ~= "worm" or o.hp > 0) and in_box(o, l, r, t, b) then
              count = count + 1
              if wa.random(1, count) == 1 then pick = o end
            end
          end
        end
      end
      return pick
    end

    local function clear(h, o)
      return wa.land.trace(math.floor(h.x), math.floor(h.y),
        math.floor(o.x), math.floor(o.y)) == nil
    end

    local function pick_target(h)
      local tx, ty = h.tx, h.ty
      local function is_cur(o) return o.kind == "worm" and o.id == h.owner.id end

      local worm = find_worm(h, tx - 130, tx + 130, ty - 70, ty + 80)
      if worm and clear(h, worm) then
        return worm.x, worm.y
      end
      local obj = find_any(tx - 130, tx + 130, ty - 50, ty + 70)
      local visible = obj and not is_cur(obj) and clear(h, obj)
      if not visible then
        if h.dir < 0 then -- PX regDir < 0: check underneath
          obj = find_any(h.x - 30, tx + 80, ty - 90, ty + 120)
        else
          obj = find_any(tx - 80, h.x + 30, ty - 90, ty + 120)
        end
        visible = obj and not is_cur(obj) and clear(h, obj)
      end
      if visible then
        return obj.x, obj.y
      end
      return tx, ty
    end

    local function fuse_ms(sx, sy, tx, ty)
      local dx, dy = tx - sx, ty - sy
      local len = math.sqrt(dx * dx + dy * dy)
      if len == 0 then return BULLET_FUSE end
      local vx = dx / len * BULLET_SPEED
      local w = wa.world.size().w
      local frames
      if vx < -0.01 then
        frames = sx / -vx
      elseif vx > 0.01 then
        frames = (w - sx) / vx
      else
        return BULLET_FUSE
      end
      frames = math.max(frames, 0) + EXIT_MARGIN
      return math.min(BULLET_FUSE, (math.floor(frames) + 1) * 20)
    end

    local function shoot(h)
      local right = h.dir >= 0
      local gx = h.x + (right and 5 or -5) -- the gun's anchor x
      local final = right and h.gun or (math.pi - h.gun)
      local ang = -(HALF_PI + final) -- the gun's drawn angle, radians
      local gface = right and 1 or -1 -- the gun's own mirror
      local lx, ly = gface * 1, -MUZZLE -- tip in the sheet, from its centre
      local cos, sin = wa.math.cos(ang), wa.math.sin(ang)
      local sx = gx + cos * lx - sin * ly
      local sy = (h.y + 12) + sin * lx + cos * ly
      local tx, ty = pick_target(h)
      tx = tx + wa.random(-1, 1)
      local ok, id = pcall(wa.weapons.launch, {
        weapon = "stock.bazooka", owner = h.owner, x = sx, y = sy, vx = 0, vy = 0,
        missile = { trail = { sprite = 0 }, explosion = { power = 13 },
          fuse = fuse_ms(sx, sy, tx, ty), gravity_pct = 0, wind_pct = 0 },
      })
      if not ok then
        if tostring(id):find("object pool is full", 1, true) then return false end
        error(id, 0)
      end
      if id then
        local now = wa.world.frame()
        for _, old in ipairs(wa.sorted(shots)) do
          local r = shots[old]
          if now - (r.seen or r.born) > 1 then
            trail.drop(old)
            shots[old] = nil
          end
        end
        shots[id] = { x = tx, y = ty, frames = BULLET_FRAMES, owner = h.owner, born = now }
        trail.add(id, h.owner,  {every = 1, g = 30, b = 10}) -- the round's trail, drawn by lib/px_trail.lua
      end
      h.firing = true
      local pick = wa.random(1, 3)
      local now = wa.world.frame()
      if not shot_heard or now - shot_heard >= COOLDOWN_SHOT then
        shot_heard = now
        wa.sound.play(h.owner, SND .. "hks" .. pick .. ".wav")
      end
      eject(h) -- the casing, after the shot
      return true
    end

    frame = function(a)
      local h = helis[a.id]
      if not h then return end
      local w = wa.world.size().w

      if (h.vx >= 0 and h.x >= w + SIDE + 50) or (h.vx < 0 and h.x < -(SIDE + 50)) then
        drop(h)
        return
      end
      if h.done and h.y >= wa.world.water() and h.x < w + 300 and h.x > -300 then
        boom(h)
        return
      end

      update_rot(h)

      if not h.shooting and h.shots < BULLETS then
        update_aim(h, false)
        if math.abs(h.x - h.tx) < SHOOT_RANGE then
          update_aim(h, true)
          h.cooldown = COOLDOWN_START
          h.shooting = true
        end
      end
      if h.shots >= BULLETS and h.shooting then
        h.shooting = false
        h.vx = h.dir * 0.15
      end
      if h.shooting then h.vx = h.vx * DRIFT end

      h.firing = false
      if h.shooting and h.cooldown == 0 then
        update_aim(h, false)
        if shoot(h) then h.shots = h.shots + 1 end
        h.cooldown = COOLDOWN_SHOT
      elseif h.shooting and h.cooldown > 0 then
        update_aim(h, false)
        h.cooldown = h.cooldown - 1
      end
      if h.shots >= BULLETS and not h.shooting then
        h.done = true
        if math.abs(h.vx) < HOVER then h.vx = h.vx * LEAVE end
      end

      h.x = h.x + h.vx
      h.frame = (h.frame + 1) % 2
      h.ticks = h.ticks + 1
      if h.ticks % ROTOR_TICKS == 0 then wa.sound.play(h.owner, SND .. "loop.wav") end
      place(h)
    end

    hit = function(a, event)
      local h = helis[a.id]
      if not h then return end
      local dmg = math.max(0, event.damage or 0)
      if event.kind == "blast" and dmg > 0 then
        local dx, dy = a.x - (event.x or a.x), a.y - (event.y or a.y)
        dmg = trunc((1 - (dx * dx + dy * dy) / (dmg * dmg * 4)) * dmg)
      end
      if dmg > DEAD_DAMAGE then boom(h) end
    end

    local function fire(worm, x, y)
      if not worm or not x or not y then return end
      local w = wa.world.size().w
      local from_left = (worm.facing or 1) <= 0
      local h = {
        owner = worm, tx = x, ty = y,
        dir = from_left and 1 or -1, -- the direction it drifts
        x = from_left and -SIDE or (w + SIDE),
        y = ENTER_Y,
        vx = (from_left and 1 or -1) * HOVER,
        shots = 0, cooldown = 0, shooting = false, done = false, firing = false,
        gun = -math.pi, worm_frame = 0, rot = 0, frame = 0, ticks = 0,
      }
      h.body = wa.actors.spawn({
        sprite = ART .. "empty.png", x = h.x, y = h.y, vx = 0, vy = 0,
        owner = worm, body = { hits = { land = true, worms = true } },
        on = { frame = frame, hit = hit },
      })
      h.aim = wa.actors.spawn({ sprite = ART .. "aim.png", x = h.x, y = h.y,
        owner = worm, on = function() end })
      h.gun_actor = wa.actors.spawn({ sprite = ART .. "gun.png", x = h.x, y = h.y,
        owner = worm, on = function() end })
      helis[h.body.id] = h
    end

    wa.weapons.replace({
      available_in_caves = false,
      wep = "weps/bullet_wep.wep",
      panel_icon = "sprites/helishootico.png", -- PX's icon
      sprites = { ART .. "empty.png", ART .. "aim.png", ART .. "gun.png", ART .. "casing.png", BULLET,
        trail.BEAM, trail.GLOW },
      params = { gpu_prefix = "sprites/" }, -- route the sheets into the GPU atlas for a:gfx
      sounds = { SND .. "hks1.wav", SND .. "hks2.wav", SND .. "hks3.wav", SND .. "loop.wav" },
      on_select = { cursor = true },
      on_click = function(ev) fire(ev.worm, ev.x, ev.y) end,
    })

    wa.on.missile_frame(function(m)
      local s = shots[m.id]
      if not s then return end
      if m.phase == "pre" then
        m.sprite = 0 -- WA draws nothing for it; ours is drawn below
        if s.frames <= 0 then return end
        s.frames = s.frames - 1
        local dx, dy = s.x - m.x, s.y - m.y
        local len = math.sqrt(dx * dx + dy * dy)
        if len > 0 then
          m.vx, m.vy = dx / len * BULLET_SPEED, dy / len * BULLET_SPEED
        end
        return
      end
      s.px, s.py = s.cx or m.x, s.cy or m.y
      s.cx, s.cy, s.vx, s.vy = m.x, m.y, m.vx, m.vy
      s.seen = wa.world.frame()
    end)

    local CORNERS = { { -1, -1 }, { 1, -1 }, { 1, 1 }, { -1, 1 } }
    local QUAD = { points = { {}, {}, {}, {} }, blend = "alpha" }
    local function put(sheet, frame, x, y, half, rot, flip, depth)
      local c, sn = math.cos(rot), math.sin(rot)
      QUAD.sprite, QUAD.frame, QUAD.depth = sheet, frame, depth
      for i, k in ipairs(CORNERS) do
        local dx, dy = k[1] * flip * half, k[2] * half
        QUAD.points[i][1] = x + (dx * c - dy * sn)
        QUAD.points[i][2] = y + (dx * sn + dy * c)
      end
      wa.draw.quad(QUAD)
    end
    local CASING = wa.sprites.key(ART .. "casing.png")
    local BULLET_SHEET = wa.sprites.key(BULLET)
    wa.on.draw(function()
      local now, f = wa.world.frame(), wa.draw.fraction()
      for _, c in ipairs(casings) do
        local age = now - c.born
        if age < CASING_LIFE then
          local t = age + f
          put(CASING, age % CASING_FRAMES, c.x + c.vx * t,
            c.y + c.vy * t + c.g * t * (t + 1) / 2, 30, 0, 1, wa.depth.BEHIND_TERRAIN)
        end
      end
      for _, id in ipairs(wa.sorted(shots)) do
        local r = shots[id]
        if r.seen and now - r.seen <= 1 then
          put(BULLET_SHEET, 0, r.cx + (r.cx - r.px) * f, r.cy + (r.cy - r.py) * f, 16,
            -math.atan(r.vx, r.vy) - math.pi, r.vx < 0 and -1 or 1, wa.depth.OBJECTS - 1)
        end
      end
    end)
  end,
}
`
      },
      {
        path: 'weapons/auto_ballista.lua',
        name: 'weapons/auto_ballista.lua',
        language: 'lua',
        content: `-- Auto Ballista: a turret that shoots arrows at moving enemies.

local weapon = {}

weapon.record = {}

function weapon.definition()
  local fires = require("lib/shared").fires
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.prod",
    name = "Auto Ballista",
    panel_icon = "sprites/pyro_turrets/ballista_icon.png",
    is_weapon = true,
    on_fire = function(fire) fires.auto_ballista(fire) end,
  })
end

function weapon.setup()
  local shared = require("lib/shared")
  local pyro = require("lib/pyro_turret")

  local function shoot(t, a, s, shot)
    if not pyro.muzzle_clear(a, shot) then return false end
    local force = pyro.force(s)
    wa.arrows.spawn({ owner = t.owner(a, s), x = shot.x, y = shot.y,
      vx = shot.dx * force, vy = shot.dy * force, damage = 10, gravity_pct = 25 })
    return true
  end

  local t = pyro.new({
    kind = "auto_ballista", weapon = "px.auto_ballista", frames = pyro.FRAMES.ballista,
    ammo = 8, tower_len = 16, g_factor = 0.25,
    aim_time = function(dist) return dist / 10 + 1 end, -- "500 pixels per sec"
    hit_by = { worms = true, missiles = true, mines = true, actors = true, bullets = true,
      melee = true, fire = true, dragon_ball = true, blasts = true },
    passage_hit_by = { melee = true, fire = true, dragon_ball = true, blasts = true },
    shoot = shoot,
  })
  shared.fires.auto_ballista = function(fire_ev) t.place(fire_ev) end
  shared.auto_ballista = t
end

function weapon.configure(ctx)
  require("lib/pyro_turret").configure(require("lib/shared").auto_ballista, ctx)
end

return weapon
`
      },
      {
        path: 'weapons/banana_express.lua',
        name: 'weapons/banana_express.lua',
        language: 'lua',
        content: `-- Banana Express: an MB Bomb strike flown by the banana plane.

local weapon = {}

weapon.record = {
  handling = {
    remember_selection = false,
    retreat = 3000,
  },
  missile = {
    animation = 1,
    bounce = {
      bounciness = 60,
      hits = {
        arrows = true,
        canisters = true,
        crates = true,
        donor_cards = true,
        land = true,
        mines = true,
        objects = true,
        water = true,
        worms = true,
        worms_frozen = true,
      },
      sound = 111,
      terrain_keep_speed_pct = 100,
    },
    burst = "clusters",
    countdown = 3000,
    ends_on_contact = {},
    explode_on_space = true,
    explosion = {
      power = 70,
      push_pct = 80,
    },
    fuse = 10000,
    random_motion = 0,
    speed_pct = 100,
    sprite = 51,
    trail = {
      bubbles_per_second = 12.5,
      power = 0,
      speed = 100,
      sprite = 131,
    },
    wind_pct = 0,
  },
  clusters = {
    bit = {
      action = "bounce",
      animation = 1,
      bounce = {
        bounciness = 60,
        contact_sides = 8,
        hits = {
          arrows = true,
          canisters = true,
          crates = true,
          donor_cards = true,
          land = true,
          mines = true,
          objects = true,
          worms = true,
          worms_frozen = true,
        },
        sound = 111,
        terrain_keep_speed_pct = 100,
      },
      ends_on_contact = {
        crates = true,
        donor_cards = true,
        land = true,
        objects = true,
        water = true,
        worms = true,
        worms_frozen = true,
      },
      explosion = {
        power = 60,
        push_pct = 80,
      },
      fuse = 9000,
      gravity_pct = 100,
      speed_pct = 100,
      sprite = 51,
      sprite_count = 1,
      trail = {
        bubbles_per_second = 12.5,
        speed = 100,
        sprite = 131,
      },
    },
    count = 5,
    launch_power_pct = 45,
    power_variation_pct = 30,
    spread = 25,
  },
  strike = {
    munition_speed = 1.5,
    plane_sound = 52,
    spacing = 30,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.mb_bomb",
    name = "Banana Express",
    panel_icon = "sprites/banana_express/banana_express_ico.png",
    plane = "sprites/banana_express/plane.png",
  })
end

return weapon
`
      },
      {
        path: 'weapons/barrel_launcher.lua',
        name: 'weapons/barrel_launcher.lua',
        language: 'lua',
        content: `-- Barrel Launcher: launches one of five special oil drums, chosen with keys 1-5.

local weapon = {}
local ID = "px.barrel_launcher"
local ART = "sprites/barrel_launcher/"
local TAZER = "sounds/barrel_launcher/tazsnd.wav"

local CHOICES = {
  { kind = "napalm", name = "Napalm Barrel", sound = 59 },
  { kind = "mine", name = "Mines Barrel", sound = 88 },
  { kind = "electric", name = "Electric Barrel", sound = TAZER },
  { kind = "icy", name = "Ice Barrel", sound = 24 },
  { kind = "teleport", name = "Teleport Barrel", sound = 67 },
}

weapon.requires = { "lib/electrical" }

local choice = 1

local function launch(fire)
  local worm = fire.worm
  if wa.world.collides({ x = fire.x, y = fire.y, radius = 9 }) then
    wa.sound.play(worm, 120)
    worm:ammo(ID, 1)
    require("lib/weapon_hint").notice(worm, "No space to launch!")
    return
  end
  require("lib/oil_drums").launch(CHOICES[choice].kind, fire.x, fire.y, fire.vx, fire.vy)
end

weapon.definition = {
  wep = "weps/barrel_launcher.wep",
  name = "Barrel Launcher",
  panel_icon = ART .. "bl_ico.png",
  worm_sprites = {
    weaponlnk = ART .. "aim.png", weaponlnku = ART .. "aimu.png", weaponlnkd = ART .. "aimd.png",
    wthrow = ART .. "draw.png", wthrowu = ART .. "drawu.png", wthrowd = ART .. "drawd.png",
  },
  sounds = { TAZER },
  on_fire = launch,
}

function weapon.setup()
  local drums = require("lib/oil_drums")
  drums.install({})
  drums.load_assets()
  wa.on.turn_start(function() choice = 1 end)
  wa.on.turn_end(function() choice = 1 end)
  local held = {}
  wa.on.worm_message(function(worm)
    local digit
    if worm.turn and worm.weapon == ID then digit = wa.world.keys().digit end
    local pressed = digit and digit >= 1 and digit <= #CHOICES and digit or nil
    if pressed and held[worm.id] ~= pressed then
      choice = pressed
      wa.sound.play(worm, CHOICES[pressed].sound)
    end
    held[worm.id] = pressed
  end, { msgs = { wa.msg.FRAME_FINISH } })
  require("lib/weapon_hint").hint(ID, function()
    return "Barrel Launcher: " .. CHOICES[choice].name .. "\\n1-" .. #CHOICES .. ": choose a barrel"
  end)
end

return weapon
`
      },
      {
        path: 'weapons/blaster_worm.lua',
        name: 'weapons/blaster_worm.lua',
        language: 'lua',
        content: `-- Blaster Worm: a homing pigeon that bursts into clusters.

local weapon = {}

weapon.record = {
  fires = {
    launch_power_pct = "charged",
    subtype = 3,
  },
  handling = {
    remember_selection = true,
  },
  missile = {
    action = "none",
    animation = 2,
    burst = "clusters",
    explosion = {
      bias = 0,
      power = 50,
    },
    flight_sound = 157,
    fuse = 9000,
    launch_sound = 0,
    trail = {
      bubbles_per_second = 0.0,
      speed = 0,
    },
  },
  clusters = {
    bit = {
      action = "bounce",
      animation = 1,
      bounce = {
        bounciness = 60,
        hits = {
          arrows = true,
          crates = true,
          donor_cards = true,
          land = true,
          mines = true,
          objects = true,
          water = true,
          worms = true,
          worms_frozen = true,
        },
        max_bounces = 6,
        sound = 56,
        terrain_keep_speed_pct = 60,
      },
      flight_sound = 162,
      fuse = 7000,
      gravity_pct = 100,
      random_motion = 5,
      speed_pct = 99,
      sprite_count = 1,
      trail = {
        power = 28,
        speed = 125,
        sprite = 249,
      },
    },
    count = 1,
    launch_power_pct = 80,
    power_variation_pct = 80,
    spread = 100,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.homing_pigeon",
    name = "Blaster Worm",
    panel_icon = "sprites/blaster_worm/bworm_ico.png",
    sprite = "sprites/blaster_worm/flight.png",
    cluster_sprite = "sprites/blaster_worm/cluster.png",
    sprite_overrides = { wsvbu = "sprites/blaster_worm/cluster_trail.png" },
        worm_sprites = {
          weaponlnk = "sprites/blaster_worm/aim.png",
          weaponlnku = "sprites/blaster_worm/aimu.png",
          weaponlnkd = "sprites/blaster_worm/aimd.png",
          wthrow = "sprites/blaster_worm/draw.png",
          wthrowu = "sprites/blaster_worm/drawu.png",
          wthrowd = "sprites/blaster_worm/drawd.png",
        },
  })
end

return weapon
`
      },
      {
        path: 'weapons/blast_zone.lua',
        name: 'weapons/blast_zone.lua',
        language: 'lua',
        content: `-- Blast Zone: a thrown zone that explodes whenever a worm or object is inside it.

local blast_zone = require("lib/px_blast_zone")

return {
  defaults = {
    ammo = { round_start = -1 },
    delay = 0,
  },
  install = function(ctx)
    blast_zone.install(ctx)
  end,
}
`
      },
      {
        path: 'weapons/blowtorch.lua',
        name: 'weapons/blowtorch.lua',
        language: 'lua',
        content: `-- BlowTorch: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.blow_torch",
    name = "BlowTorch",
  })
end

return weapon
`
      },
      {
        path: 'weapons/bowling_ball.lua',
        name: 'weapons/bowling_ball.lua',
        language: 'lua',
        content: `-- Bowling Ball Strike: drops three bowling balls that roll and crush what they hit.

local weapon = {}

weapon.record = {
  handling = {
    ends_turn = true,
  },
}

function weapon.definition()
  local shared = require("lib/shared")
  local fires = shared.fires
  return require("lib/weapon").merge(weapon.record, {
    wep = "weps/sheep_strike.wep",
    panel_icon = "sprites/bowling_ball/strike_icon.png",
    sprites = { "sprites/bowling_ball/ball.png", "sprites/bowling_ball/glow.png", "sprites/bowling_ball/spark.png",
          "sprites/bowling_ball/sheen.png" },
    params = { gpu_prefix = "sprites/bowling_ball/" },
    on_select = { cursor = true },
    on_click = function(ev) fires.bowling_strike(ev) end,
  })
end

weapon.requires = { "lib/bowling_balls" }

function weapon.setup()
  local shared = require("lib/shared")
  local fires = shared.fires
  local balls = require("lib/bowling_balls")
  local RADIUS, INERTIA_Y = balls.RADIUS, balls.INERTIA_Y
  local spawn_ball = shared.spawn_bowling_ball

  local STRIKE_BALLS = 3
  local STRIKE_SPACING = 48
  local STRIKE_SPEED = 5
  local STRIKE_Y = -128 -- PX's PlaneAppearYOffset
  local PLANE = "airjetb"
  local PLANE_SOUND = 52 -- WA's air strike sound (its Sound)
  local PLANE_EDGE = 16 -- PX's PlaneAppearXOffset

  local function drift(y0, y1, vx)
    local g = wa.world.gravity()
    if g <= 0 then return 0 end
    local x, y, vy, lvy = 0, y0, 0, 0
    for _ = 1, 3000 do
      if y >= y1 then break end
      local vy2 = vy + g
      x, y = x + vx, y + vy2
      vy = vy2 + INERTIA_Y * (vy2 - lvy)
      lvy = vy
    end
    return x
  end

  fires.bowling_strike = function(ev)
    local dir = (ev.vx or 0) < 0 and -1 or 1
    local y0 = STRIKE_Y
    local back = drift(y0, ev.y - RADIUS, STRIKE_SPEED * dir)
    local drops = {}
    for i = 1, STRIKE_BALLS do
      drops[i] = ev.x - back + (i - (STRIKE_BALLS + 1) / 2) * STRIKE_SPACING * dir
    end
    local width = wa.world.size().w
    local lead = 0
    while (dir > 0 and drops[1] - lead * STRIKE_SPACING > -PLANE_EDGE)
      or (dir < 0 and drops[1] + lead * STRIKE_SPACING < width + PLANE_EDGE) do
      lead = lead + 1
    end
    local x0 = drops[1] - lead * STRIKE_SPACING * dir
    local step = 0
    local plane = wa.actors.spawn({
      sprite = PLANE, x = x0, y = y0, owner = ev.worm,
      on = function(a)
        local k = step - lead + 1
        if k >= 1 and k <= STRIKE_BALLS then
          spawn_ball(ev.worm, drops[k], y0, STRIKE_SPEED * dir, 0)
        end
        step = step + 1
        a.x, a.y, a.vx, a.vy = x0 + step * STRIKE_SPACING * dir, y0, 0, 0
        if (dir > 0 and a.x > width + PLANE_EDGE) or (dir < 0 and a.x < -PLANE_EDGE) then
          a:remove()
        end
      end,
    })
    plane.facing = -dir
    wa.sound.play(plane, PLANE_SOUND)
  end
end

return weapon
`
      },
      {
        path: 'weapons/bowling_ball_single.lua',
        name: 'weapons/bowling_ball_single.lua',
        language: 'lua',
        content: `-- Bowling Ball: the worm sets a bowling ball down in front of it, to roll and crush what it hits.

local weapon = {}
local ART = "sprites/bowling_ball/"

-- The ball itself is lib/bowling_balls, shared with the strike.
weapon.requires = { "lib/bowling_balls" }

function weapon.definition()
  local shared = require("lib/shared")
  local fires = shared.fires
  return {
    -- PX's record: a placed weapon held as the Dynamite is (sprite 78),
    -- so the worm takes it out and puts it away on wdynlnk, here PX's sheets.
    wep = "weps/bowling_ball.wep",
    panel_icon = ART .. "icon.png",
    worm_sprites = {
      wdynlnk = ART .. "wbblnk.png", wdynlnku = ART .. "wbblnku.png", wdynlnkd = ART .. "wbblnkd.png",
    },
    sprites = { ART .. "ball.png", ART .. "glow.png", ART .. "spark.png", ART .. "sheen.png" },
    params = { gpu_prefix = ART },
    on_fire = function(fire) fires.bowling_ball(fire) end,
  }
end

function weapon.setup()
  local shared = require("lib/shared")

  -- PX's FireFinal: from the worm, half its speed, nudged forward and up.
  -- Our ball is a wider circle than PX's, so it starts lifted clear of the
  -- land under the worm rather than in it.
  local FORCE_X, FORCE_Y = 0.4, 0.8 -- BaseForceX, BaseForceY
  local SPARE = 50 -- the thrower's DamageRecoverTime: its own ball can't hurt it yet

  shared.fires.bowling_ball = function(fire)
    local w = fire.worm
    local y = shared.bowling_ball_clear_y(w.x, w.y)
    shared.spawn_bowling_ball(w, w.x, y, 0.5 * w.vx + w.facing * FORCE_X, 0.5 * w.vy - FORCE_Y, SPARE)
  end
end

return weapon
`
      },
      {
        path: 'weapons/buffalo_of_lies.lua',
        name: 'weapons/buffalo_of_lies.lua',
        language: 'lua',
        content: `-- Buffalo of Lies: a charging buffalo that explodes on impact, three per shot.

local sb = require("lib/px_sprite_builder")

local POSTURE = {
  weaponlnk = sb.PX_POSTURE.wthrow, weaponlnku = sb.PX_POSTURE.wthrowu,
  weaponlnkd = sb.PX_POSTURE.wthrowd,
  wthrow = sb.PX_POSTURE.wthrow, wthrowu = sb.PX_POSTURE.wthrowu,
  wthrowd = sb.PX_POSTURE.wthrowd,
}

local M = {}

local SHEET = "sprites/buffalo/buffalo.png"
local ICON = "sprites/buffalo/icon.png"
local SND = "sounds/buffalo/"

local BUFFALOS = 3
local START_FRAMES = 118 -- buffalostart.wav, 2.35 s at 50 fps
local WALK_FRAMES = 84 -- buffaloride.wav, 1.68 s
local RUN_PHASE = 0.032 -- PX: 0.001 * 20 * 1.6
local SINK_PHASE = 0.0145 -- PX: 0.001 * 20 * 0.725
local SINK_TURN = 0.05
local WALK_SPEED = 1.3 -- the record's roam.walk_speed
local RECOIL_FRAMES = 20 -- how long the backwards/up pop lasts
local GROUND_VY = 0.8 -- the roam sits still vertically when grounded
local STUCK_WINDOW = 10 -- frames compared to decide a buffalo has not moved
local STUCK_DIST2 = 1 -- squared pixels: less than this is "not moved"
local UNSTICK_TRIES = 3 -- nudges before it explodes anyway
local FACE_LOCK = 100 -- frames (2 s) a new buffalo keeps its sprite side
local FACE_FRAMES = 6 -- frames a new walking direction must hold
local HALF_PI = math.pi / 2

local info = {}
local shots = {}
local shot_seq = 0
local launching
local installed = false
local mode = "straight"

local function placed(ctx)
  local informed = false
  if type(ctx.weapons) == "table" then
    informed = true
    if ctx.weapons[ctx.id] ~= nil then return true end
  end
  if type(ctx.placed) == "table" then
    informed = true
    for _, weapon in ipairs(ctx.placed) do
      if weapon == ctx.id or (type(weapon) == "table" and weapon.id == ctx.id) then
        return true
      end
    end
  end
  return not informed
end

local function current_worm()
  for _, w in ipairs(wa.worms.all()) do
    if w.turn then return w end
  end
end

local function sign(n) return n > 0 and 1 or -1 end

local function isGrounded(m)
  if math.abs(m.vy) < GROUND_VY then return true end
  return wa.land.solid(m.x, m.y + 10)
end

local function wall_ahead(m, side)
  local x = m.x + side * 14
  return wa.land.solid(x, m.y) or wa.land.solid(x, m.y - 8)
end

local function gone(id)
  return function(a)
    local t = info[id]
    if t and t.seen then t.seen = false return end
    info[id] = nil
    a:remove()
  end
end

local function spawn(o)
  local previous = launching
  launching = { side = o.side, owner = o.owner, shot_id = o.shot_id,
    recoil_side = o.recoil_side, exploded = false }
  local ok, id = pcall(wa.weapons.launch, {
      weapon = o.weapon, owner = o.owner, x = o.x, y = o.y,
      vx = o.vx, vy = o.vy,
    })
  local context = launching
  launching = previous
  if not ok then
    wa.log("buffalo launch: " .. tostring(id))
    return nil, false
  end
  if not id or context.exploded then return nil, context.exploded end
  info[id] = { side = o.side, owner = o.owner, shot_id = o.shot_id,
    phase = 0, rot = 0, sinking = false, current = true, seen = false,
    recoil_frames = o.recoil_frames or 0, recoil_speed = o.recoil_speed,
    recoil_side = o.recoil_side, face = o.side,
    face_lock = o.face_lock or 0 }
  return id, false
end

function M.install(ctx)
  if installed or not placed(ctx) then return end
  installed = true
  mode = ctx.option("direction") or "straight"

  local function chain(t, x, y)
    local shot = shots[t.shot_id]
    if not shot or not t.current then return end
    local water = wa.world.water()
    if t.sinking or (water and y >= water + 15) then
      shots[shot.id] = nil
      return
    end
    if shot.spawned >= BUFFALOS then
      shots[shot.id] = nil
      return
    end
    local recoil_side = -t.side
    if mode == "opposite" then
      shot.side = -shot.side
    elseif mode == "random" then
      shot.side = shot.side * (wa.random(0, 1) == 0 and -1 or 1)
    end
    local s = wa.random(131072, 212992) / 65536
    shot.spawned = shot.spawned + 1
    local id, exploded = spawn({ weapon = ctx.id, owner = shot.owner,
        x = x, y = y, vx = shot.side * s, vy = -s, side = shot.side,
        recoil_frames = RECOIL_FRAMES, recoil_speed = s,
        recoil_side = recoil_side, shot_id = shot.id,
        face_lock = FACE_LOCK })
    if not id and not exploded then
      shot.spawned = shot.spawned - 1
      shots[shot.id] = nil
    end
  end

  local function on_fire(fire)
    local owner = fire.worm or current_worm()
    local vx, vy = fire.vx or 0, fire.vy or 0
    local side = (vx ~= 0 and sign(vx))
    or (owner and owner.facing) or 1
    shot_seq = shot_seq + 1
    local shot = { id = shot_seq, owner = owner, side = side, spawned = 1,
      age = 0, roar = wa.random(60, 80) }
    shots[shot.id] = shot
    wa.sound.play(owner, SND .. "start.wav")
    local id, exploded = spawn({ weapon = ctx.id, owner = owner,
        x = fire.x, y = fire.y, vx = vx * 0.25, vy = vy * 0.25, side = side,
        shot_id = shot.id })
    if not id and not exploded then shots[shot.id] = nil end
  end

  local function on_explode(ev)
    local t = ev.missile and info[ev.missile]
    local synchronous = false
    if not t and launching and not launching.exploded then
      launching.exploded = true
      synchronous = true
      t = { side = launching.side, owner = launching.owner,
        shot_id = launching.shot_id, current = true,
        recoil_side = launching.recoil_side }
    end
    if not t then return end
    if not synchronous then info[ev.missile] = nil end
    chain(t, ev.x, ev.y)
  end

  wa.on.missile_frame(function(m)
    local t = info[m.id]
    if not t then return end
    if m.phase == "pre" then
      m.sprite = 0
      if t.recoil_side then
        m.vx = t.recoil_side * t.recoil_speed
        if t.recoil_frames > 0 then t.recoil_frames = t.recoil_frames - 1 end
      end
      return
    end

    if t.recoil_side and t.recoil_frames == 0 and isGrounded(m) then
      t.recoil_side = nil
      m.vx = t.side * WALK_SPEED
    end

    t.face = t.face or t.side
    if t.face_lock and t.face_lock > 0 then
      t.face_lock = t.face_lock - 1
      t.face_n = 0
    elseif not t.recoil_side and not t.sinking and math.abs(m.vx) > 0.3 then
      local dir = m.vx > 0 and 1 or -1
      if dir == t.face then
        t.face_n = 0
      else
        t.face_n = (t.face_n or 0) + 1
        if t.face_n >= FACE_FRAMES then t.face, t.face_n = dir, 0 end
      end
    end

    local water = wa.world.water()
    if water and m.y > water + 15 then t.sinking = true end
    t.phase = t.phase + (t.sinking and SINK_PHASE or RUN_PHASE)
    if t.phase > 1.0 then t.phase = 0.0 end
    local frame = math.floor(t.phase * 20) % 20

    if t.sinking then
      t.rot = t.rot + SINK_TURN * -t.face
      if math.abs(t.rot) >= HALF_PI then t.rot = HALF_PI * -t.face end
      m.vx = 0
    end

    local shot = shots[t.shot_id]
    if t.current and shot then
      shot.age = shot.age + 1
      if shot.age == START_FRAMES then
        wa.sound.play(shot.owner, SND .. "ride.wav")
      elseif shot.age > START_FRAMES
        and (shot.age - START_FRAMES) % WALK_FRAMES == 0 then
        wa.sound.play(shot.owner, SND .. "ride.wav")
      end
      if shot.age % shot.roar == 0 and not t.sinking then
        shot.roar_alt = not shot.roar_alt
        wa.sound.play(shot.owner,
          SND .. (shot.roar_alt and "roar1.wav" or "roar2.wav"))
      end
    end

    if not t.actor then
      t.actor = wa.actors.spawn({ sprite = SHEET, x = m.x, y = m.y - 10,
          owner = t.owner or current_worm(), on = gone(m.id) })
    end

    local a = t.actor
    if a then
      a.x, a.y, a.vx, a.vy = m.x, m.y - 10, 0, 0
      a.facing = t.face
      a:frame(frame)
      a:gfx({ angle = math.deg(t.rot), depth = wa.depth.OBJECTS })
      t.seen = true
    end

    if t.sinking or t.recoil_frames > 0 or not isGrounded(m) then
      t.snap_age = 0
      return
    end
    if not t.snap_x then t.snap_x, t.snap_y, t.snap_age = m.x, m.y, 0 end
    t.snap_age = t.snap_age + 1
    if t.snap_age < STUCK_WINDOW then return end
    local dx, dy = m.x - t.snap_x, m.y - t.snap_y
    t.snap_x, t.snap_y, t.snap_age = m.x, m.y, 0
    if dx * dx + dy * dy >= STUCK_DIST2 then return end

    t.unstick = t.unstick or 0
    if not wall_ahead(m, t.face) and t.unstick < UNSTICK_TRIES then
      t.unstick = t.unstick + 1
      t.recoil_side = nil
      m.vx = t.face * WALK_SPEED
      m.vy = -1.5
      return
    end
    if a then a:explode({ damage = 50, id = 100, at = "below" }) end
    info[m.id] = nil
    chain(t, m.x, m.y)
    local ok, err = pcall(function() m:remove() end)
    if not ok then wa.log("buffalo remove: " .. tostring(err)) end
  end)

  wa.weapons.replace({
      wep = "weps/buffalo_w.wep",
      name = "Buffalo of Lies",
      sprites = { SHEET },
      panel_icon = ICON,
      worm_sprites = POSTURE,
      hold = {
        thrown = true, sheet = SHEET, frames = 1,
        hand = sb.PX_HANDS[1],
        hand_radius = -10.0,
        hand_rotation = 0.0,
        hand_radial_rotation = -0.13,
        hand_scale = 1.0,
        weap_radius = -18.0,
        weap_rotation = 0.5,
        weap_radial_rotation = 0.22,
        static = { weap = -0.075, hand = 0.45 },
        keep_while_firing = false,
      },
      sounds = { SND .. "start.wav", SND .. "ride.wav",
        SND .. "roar1.wav", SND .. "roar2.wav" },
      params = { gpu_prefix = "sprites/buffalo/", sprite_columns = 1 },
      handling = { retreat = 3000, ends_turn = true },
      missile = { sprite = 0, explosion = { power = 50 } }, -- WA draws no buffalo; the pack draws it
      on_fire = on_fire,
      on_explode = on_explode,
    })

  wa.on.worm_message(function(w)
    if w.turn then w.facing = w.facing end
  end, { msgs = { wa.msg.FRAME_FINISH } })
end

return M
`
      },
      {
        path: 'weapons/bulldozer.lua',
        name: 'weapons/bulldozer.lua',
        language: 'lua',
        content: `-- Bulldozer: a walking digger that tunnels and shoves what it touches.

local on_missile = require("lib/on_missile")
local holds = require("wf-lib/holds")
local weapon = {}

weapon.definition = {
  wep = "weps/bulldozer.wep",
  name = "Bulldozer",
  panel_icon = "sprites/bulldozer/bdico.png",
  sprite = "sprites/bulldozer/bd.png",
  worm_sprites = {
    wthrow = holds.PX_POSTURE.wthrow, wthrowu = holds.PX_POSTURE.wthrowu,
    wthrowd = holds.PX_POSTURE.wthrowd,
    weaponlnk = holds.PX_LEVEL.weaponlnk, weaponlnku = holds.PX_LEVEL.weaponlnku,
    weaponlnkd = holds.PX_LEVEL.weaponlnkd,
  },
  hold = {
    sheet = "sprites/bulldozer/bd.png", frames = 20,
    hand = holds.PX_HANDS[1], hand_type = 1, hand_scale = 0.8,
    hand_radius = 28, hand_rotation = -1, hand_radial_rotation = 1.1,
    weap_radius = 16, weap_rotation = 0.3, weap_radial_rotation = 1.1,
    static = { weap = -0.2, hand = -0.5 },
  },
}

local HALF = 10
local RADIUS = { worm = 6, mine = 5, crate = 9, oil = 9 }
local FORCE = 0.6 * math.sqrt(15)

local function push_of(m, obj, r)
  local dx, dy = obj.x - m.x, obj.y - m.y
  local rx, ry = math.max(0, math.abs(dx) - HALF), math.max(0, math.abs(dy) - HALF)
  local d = math.sqrt(dx * dx + dy * dy)
  if rx * rx + ry * ry > r * r or d == 0 then return nil end
  return FORCE * dx / d, FORCE * dy / d
end

function weapon.setup()
  local current_worm = require("lib/shared").current_worm
  local newest = 0
  on_missile(function(m)
    if m.weapon ~= "px.bulldozer" or m.phase ~= "pre" then return end
    if m.id > newest then newest = m.id end
    if m.id == newest then
      wa.land.cut({ x = m.x, y = m.y - 8.7, shape = "circle", radius = HALF })
    end
    local turn = current_worm()
    for _, w in ipairs(wa.worms.all()) do
      if w.hp > 0 and not (turn and w.id == turn.id) then
        local vx, vy = push_of(m, w, RADIUS.worm)
        if vx then w:hit({ amount = 1, vx = vx, vy = vy }) end
      end
    end
    for _, kind in ipairs({ "mine", "crate", "oil" }) do
      local all = kind == "mine" and wa.mines.all() or kind == "crate" and wa.crates.all() or wa.oil.all()
      for _, o in ipairs(all) do
        local vx, vy = push_of(m, o, RADIUS[kind])
        if vx then o:hit(1, vx, vy) end
      end
    end
  end, { weapons = { "px.bulldozer" }, phase = "pre" })
end

return weapon
`
      },
      {
        path: 'weapons/bunker_buster.lua',
        name: 'weapons/bunker_buster.lua',
        language: 'lua',
        content: `-- Bunker Buster / Super Bunker Buster: the component's entry point.

local bunker = require("lib/px_bunker")

return {
  defaults = {
    ammo = { round_start = -1 }, -- infinite, so it can be tested at once
    delay = 0,
  },
  install = function(ctx) bunker.install(ctx) end,
}
`
      },
      {
        path: 'weapons/burning_sheep_launcher.lua',
        name: 'weapons/burning_sheep_launcher.lua',
        language: 'lua',
        content: `-- Burning Sheep Launcher: launches a burning sheep.

local weapon = {}

weapon.record = {
  fires = {
    launch_power_pct = "charged",
    subtype = 3,
  },
  missile = {
    animation = 1,
    bounce = {
      bounciness = 50,
      explosion = {
        power = 50,
        push_pct = 100,
      },
      extra_reverse_chance_pct = 50,
      hits = {
        land = true,
        water = true,
        worms = true,
        worms_frozen = true,
        crates = true,
      },
      max_bounces = 2,
      terrain_keep_speed_pct = 30,
    },
    burst = "fire",
    ends_on_contact = {},
    explode_on_space = false,
    explosion = {
      power = 50,
      push_pct = 100,
    },
    fire = {
      burn_time_ms = 4000,
      spread_delay_ms = 100,
      spread_generations = 20,
    },
    fuse = 9000,
    sprite = 64,
    trail = {
      bubbles_per_second = 0.0,
      power = 20,
      speed = 50,
    },
  },
}

weapon.defaults = {
  collects_crates = false,
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.sheep_launcher",
    name = "Burning Sheep Launcher",
    panel_icon = "sprites/launchers/burning_sheep_launcher_ico.png",
  })
end

return weapon
`
      },
      {
        path: 'weapons/burst_rifle.lua',
        name: 'weapons/burst_rifle.lua',
        language: 'lua',
        content: `-- Burst Rifle: a minigun that fires in bursts.

local weapon = {}

weapon.record = {
  gun = {
    bullets = 10,
    burst_size = 2,
    burst_spread_deg = 6,
    damage = 7,
    explosion = {
      bias = 15,
    },
    shot_interval_ms = 63,
    spread_deg = 6,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.minigun",
    name = "Burst Rifle",
    panel_icon = "sprites/burst_rifle/ico_burstr.png",
    worm_sprites = {
          weaponlnk = "sprites/burst_rifle/aim.png",
          weaponlnku = "sprites/burst_rifle/aimu.png",
          weaponlnkd = "sprites/burst_rifle/aimd.png",
          wthrow = "sprites/burst_rifle/draw.png",
          wthrowu = "sprites/burst_rifle/drawu.png",
          wthrowd = "sprites/burst_rifle/drawd.png",
          weaponfire = "sprites/burst_rifle/fire.png",
          weaponfireu = "sprites/burst_rifle/fireu.png",
          weaponfired = "sprites/burst_rifle/fired.png",
        },
  })
end

return weapon
`
      },
      {
        path: 'weapons/chilli_bomb.lua',
        name: 'weapons/chilli_bomb.lua',
        language: 'lua',
        content: `-- Chilli Bomb: a super banana that bursts into five chillis, each bursting into fire.

local holds = require("wf-lib/holds")
local weapon = {}

local children = {}
local pending = {}
local shooter

local function on_explode(ev)
  local id = ev.missile
  if not id then return end
  if children[id] then
    children[id] = nil
    return
  end
  pending[#pending + 1] = { x = ev.x, y = ev.y }
end

weapon.definition = {
  copy_from = "stock.super_banana",
  name = "Chilli Bomb",
  panel_icon = "sprites/chilli_bomb/chilli_ico.png",
  hold_as = "stock.super_banana",
  on_explode = on_explode,
  handling = {
    retreat = 3000,
  },
  missile = {
    sprite = 0, -- WA draws no round; the art spec draws it
    alarm_worms = true,
    bounce = {
      hits = {
        crates = true,
        donor_cards = true,
        land = true,
        objects = true,
        water = true,
        worms_acting = true,
        worms_frozen = true,
        worms_jumping = true,
        worms_normal = true,
      },
    },
    burst = "nothing",
    countdown = 5000,
    explode_on_space = false, -- The parent uses its fuse; children enable Space.
    explosion = {
      power = 50,
      push_pct = 75,
    },
    fuse = 0,
  },
  worm_sprites = holds.PX_POSTURE,
  sprites = { "sprites/px_hold/chilli_bomb.png" },
  params = { gpu_prefix = "sprites/px_hold/" },
  hold = {
    thrown = true,
    sheet = "sprites/px_hold/chilli_bomb.png", hand_type = 1, hand_radius = 13,
    hand_scale = 0.8, weap_rotation = 0.5, weap_radius = 9,
    hand = holds.PX_HANDS[1],
  },
}

local CHILDREN = {
  count = 5,
  missile = {
    explosion = { power = 30 },
    fuse = 8000,
    countdown = 0,
    explode_on_space = true,
    burst = "fire",
    fire = {
      spread_delay_ms = 30,
      burn_time_ms = 1500,
      spread_generations = 10,
      decay_mode = "instant",
    },
    sprite = 0, -- Only the chilli's custom art is drawn.
  },
}

weapon.missile_sprite = {
  sheet = "sprites/px_hold/chilli_bomb.png", frames = 1,
  spin = true, -- its record's WAT_Rotation
  hide = true,
}

function weapon.setup()

  children, pending, shooter = {}, {}, nil

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FIRE_WEAPON and worm.weapon == "px.chilli_bomb" then
      shooter = worm
    elseif msg == wa.msg.FRAME_FINISH and #pending > 0 then
      local owner = shooter or worm
      for _, p in ipairs(pending) do
        for _ = 1, CHILDREN.count do
          local vx = wa.random(-196608, 196608) / 65536
          local vy = wa.random(-655360, -458752) / 65536
          local id = wa.weapons.launch({
            weapon = "px.chilli_bomb", owner = owner, x = p.x, y = p.y, vx = vx, vy = vy,
            missile = CHILDREN.missile,
          })
          children[id] = true
        end
      end
      pending = {}
    end
  end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })
end

return weapon
`
      },
      {
        path: 'weapons/cluster_bomb.lua',
        name: 'weapons/cluster_bomb.lua',
        language: 'lua',
        content: `-- Cluster Bomb: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  fires = {
    launch_power_pct = "charged",
    subtype = 2,
  },
  handling = {
    remember_selection = true,
  },
  missile = {
    action = "bounce",
    alarm_worms = true,
    bounce = {
      bounciness = 0,
      contact_sides = 8,
      explosion = {
        bias = 0,
        power = 0,
        push_pct = 0,
        variation = 0,
      },
      extra_reverse_chance_pct = 0,
      hits = {
        crates = true,
        donor_cards = true,
        land = true,
        objects = true,
        water = true,
        worms_acting = true,
        worms_frozen = true,
        worms_jumping = true,
        worms_normal = true,
      },
      sound = 113,
      terrain_keep_speed_pct = 100,
    },
    burst = "clusters",
    countdown = 5000,
    ends_on_contact = {},
    explosion = {
      power = 20,
      push_pct = 0,
    },
    flight_sound = 0,
    fuse = 0,
    sprite = 53,
    trail = {
      sprite = 131,
    },
  },
  clusters = {
    bit = {
      action = "bounce",
      animation = 1,
      bounce = {
        contact_sides = 8,
        hits = {
          crates = true,
          donor_cards = true,
          land = true,
          objects = true,
          water = true,
          worms_acting = true,
          worms_frozen = true,
          worms_jumping = true,
          worms_normal = true,
        },
        sound = 113,
        terrain_keep_speed_pct = 100,
      },
      ends_on_contact = {
        crates = true,
        donor_cards = true,
        land = true,
        objects = true,
        worms = true,
        worms_frozen = true,
      },
      explosion = {
        power = 20,
        push_pct = 100,
      },
      fuse = 9000,
      gravity_pct = 100,
      speed_pct = 100,
      sprite = 54,
      sprite_count = 1,
      trail = {
        bubbles_per_second = 12.5,
        power = 20,
        speed = 100,
        sprite = 131,
      },
    },
    count = 5,
    launch_power_pct = 30,
    power_variation_pct = 30,
    spread = 45,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.magic_bullet",
    name = "Cluster Bomb",
    panel_icon = "cluster_bomb",
  })
end

return weapon
`
      },
      {
        path: 'weapons/cow_launcher.lua',
        name: 'weapons/cow_launcher.lua',
        language: 'lua',
        content: `-- Cow Launcher: launches a mad cow; hold fire to charge.

local weapon = {}

weapon.record = {
  fires = {
    launch_power_pct = 50,
    method = 3,
    subtype = 3,
    type = 1,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.mad_cow",
    name = "Cow Launcher",
    panel_icon = "sprites/launchers/cow_launcher_ico.png",
  })
end

function weapon.configure(ctx, spec)
  if ctx.option("charged") then
    spec.fires.launch_power_pct = "charged"
  end
end

return weapon
`
      },
      {
        path: 'weapons/crate_strike.lua',
        name: 'weapons/crate_strike.lua',
        language: 'lua',
        content: `-- Crate Strike: drops three crates by parachute around the click.

local weapon = {}

weapon.record = {
  handling = {
    ends_turn = true,
  },
}

function weapon.definition()
  local shared = require("lib/shared")
  local fires = shared.fires
  return require("lib/weapon").merge(weapon.record, {
    wep = "weps/donkey.wep",
    panel_icon = "sprites/crate_strike/icon.png",
    on_select = { cursor = true },
    on_click = function(ev) fires.crate_strike(ev) end,
  })
end

function weapon.setup()
  local shared = require("lib/shared")
  local fires = shared.fires

  local KINDS = { "weapon", "utility", "health" }
  local DROPS = {
    { dx = 0, lo = 20, hi = 40 },
    { dx = -50, lo = 40, hi = 60 },
    { dx = 50, lo = 60, hi = 80 },
  }

  fires.crate_strike = function(ev)
    local x = ev.x
    for _, d in ipairs(DROPS) do
      local kind = KINDS[wa.random(1, 3)]
      local health = wa.random(d.lo, d.hi)
      local crate = { x = (x + d.dx), y = ev.sky, kind = kind, health = health, drop = "chute" }
      if not pcall(wa.crates.spawn, crate) then
        crate.kind = "health"
        wa.crates.spawn(crate)
      end
    end
  end
end

return weapon
`
      },
      {
        path: 'weapons/digging_cluster_bomb.lua',
        name: 'weapons/digging_cluster_bomb.lua',
        language: 'lua',
        content: `-- Digging Cluster Bomb: a grenade that digs through land and bursts into five digging clustlets, each bursting into fire.

local weapon = {}

local ART = "sprites/digging_cluster/"
local GRENADE_SPRITE = 50 -- the stock grenade sprite, which the bomb shows while it digs
local CLUSTLET_SPRITE = 54 -- the stock cluster bit's, which the clustlets fly with
local DIG_SOUND = 65574 -- the Mole Bomb's digging sound

weapon.record = {
  missile = {
    sprite = 0, -- WA draws no round; the art spec draws it
    action = "dig",
    animation = 2,
    burst = "nothing",
    -- WA draws these while it digs; the pack's art covers them.
    dig = {
      sound = DIG_SOUND,
      dive_sprite = GRENADE_SPRITE,
      sprite_1 = GRENADE_SPRITE,
      sprite_2 = GRENADE_SPRITE,
      sprite_3 = GRENADE_SPRITE,
    },
    ends_on_contact = {
      crates = true,
      donor_cards = true,
      objects = true,
      worms_normal = true,
    },
    explosion = {
      bias = 0,
      power = 20,
      push_pct = 20,
    },
  },
}

-- What a clustlet changes in the grenade's record: it digs on and bursts
-- into fire after two and a half seconds.
local CLUSTLET = {
  sprite = CLUSTLET_SPRITE,
  fuse = 2500,
  countdown = 0,
  explosion = { bias = 1 },
  trail = { sprite = 131, power = 20, speed = 100 },
  dig = {
    sound = DIG_SOUND,
    dive_sprite = CLUSTLET_SPRITE,
    sprite_1 = CLUSTLET_SPRITE,
    sprite_2 = CLUSTLET_SPRITE,
    sprite_3 = CLUSTLET_SPRITE,
  },
  burst = "fire",
  fire = {
    spread_generations = 10,
    spread_delay_ms = 30,
    burn_time_ms = 1500,
    decay_mode = "instant",
  },
}

-- PX's five clustlet speeds, in pixels/frame: up, up-right, up-left, down-right, down-left.
local SPEEDS = { { 0, -10 }, { 5, -6 }, { -5, -6 }, { 6, 4 }, { -6, 6 } }

weapon.missile_sprite = {
  { sheet = ART .. "bullet.png", frames = 1, hide = true, first_sprite = 0 },
  -- PX draws each clustlet as the bomb itself.
  { sheet = ART .. "bullet.png", frames = 1, hide = true, first_sprite = CLUSTLET_SPRITE },
}

local clustlets = {}
local bursts = {}
local shooter

local function on_explode(ev)
  local id = ev.missile
  if not id then return end
  if clustlets[id] then
    clustlets[id] = nil
  else
    bursts[#bursts + 1] = { x = ev.x, y = ev.y }
  end
end

function weapon.definition()
  local sdk = require("wf-lib/holds")
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.grenade",
    name = "Digging Cluster Bomb",
    panel_icon = ART .. "digging_cluster_ico.png",
    hold_as = "stock.grenade",
    on_explode = on_explode,
    worm_sprites = sdk.PX_POSTURE,
    sprites = { ART .. "bullet.png" },
    hold = {
      thrown = true,
      sheet = ART .. "bullet.png", hand_type = 1, hand_radius = 18,
      weap_rotation = 0.5, weap_radius = 9,
      hand = sdk.PX_HANDS[1],
    },
  })
end

function weapon.setup()
  clustlets, bursts, shooter = {}, {}, nil

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FIRE_WEAPON and worm.weapon == "px.digging_cluster_bomb" then
      shooter = worm
      return
    end
    if msg ~= wa.msg.FRAME_FINISH or #bursts == 0 then return end
    local owner = shooter or worm
    for _, p in ipairs(bursts) do
      for _, v in ipairs(SPEEDS) do
        local id = wa.weapons.launch({
          weapon = "px.digging_cluster_bomb", owner = owner, x = p.x, y = p.y, vx = v[1], vy = v[2],
          missile = CLUSTLET,
        })
        if id then clustlets[id] = true end
      end
    end
    bursts = {}
  end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })
end

return weapon
`
      },
      {
        path: 'weapons/double_bazooka.lua',
        name: 'weapons/double_bazooka.lua',
        language: 'lua',
        content: `-- Double Bazooka: a bazooka whose shell fires a second shell from where the first one explodes.

local weapon = {}

weapon.record = {
  missile = {
    bounce = {
      bounciness = 0,
    },
    explosion = {
      power = 20,
    },
    trail = {
      power = 20,
    },
  },
}

function weapon.definition()
  local shared = require("lib/shared")
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.bazooka",
    name = "Double Bazooka",
    panel_icon = "sprites/double_bazooka/double_bazooka_ico.png",
    on_explode = function(ev) shared.double_bazooka_explode(ev) end,
  })
end

function weapon.setup()
  local shared = require("lib/shared")

  do

  local DB_SECOND = { damage = 40, fuse = 5000 }
  local DB_HOLE = 50

  local db_second = {} -- missile id -> true: a second shell, which ends it
  local db_pending = {} -- second shells to launch once the blast is over
  local db_shooter -- the worm that fired it (PX's ClWT / ClWN)
  local db_launching = false -- a burst now is a second shell's, bursting as WA builds it

  shared.double_bazooka_explode = function(ev)
    local id = ev.missile
    if not id then
      return
    end
    if db_launching or db_second[id] then
      db_second[id] = nil
      return
    end
    wa.land.cut({ x = ev.x, y = ev.y, shape = "circle", radius = DB_HOLE })
    db_pending[#db_pending + 1] = { x = ev.x, y = ev.y, vx = ev.vx or 0, vy = ev.vy or 0 } -- point blank: its launch speed
  end

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FIRE_WEAPON and worm.weapon == "px.double_bazooka" then
      db_shooter = worm
    elseif msg == wa.msg.FRAME_FINISH and #db_pending > 0 then
      local owner = db_shooter or worm
      local pending = db_pending
      db_pending = {}
      db_launching = true
      for _, p in ipairs(pending) do
        local ok, id = pcall(wa.weapons.launch, {
          weapon = "px.double_bazooka", owner = owner, x = p.x, y = p.y, vx = p.vx, vy = p.vy,
          missile = { explosion = { power = DB_SECOND.damage }, fuse = DB_SECOND.fuse },
        })
        if ok and id then db_second[id] = true end
      end
      db_launching = false
    end
  end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })
  end
end

return weapon
`
      },
      {
        path: 'weapons/double_jump.lua',
        name: 'weapons/double_jump.lua',
        language: 'lua',
        content: `-- Double Jump: switched on for the turn, a worm in mid-jump jumps once more on Enter or Backspace.

local JUMPING = { jumping = true, jump_falling = true }
local GROUNDED = { standing = true, walking = true, ready = true }

local function install(ctx)
  local id = ctx.id
  wa.weapons.replace({
    wep = "weps/double_jump.wep",
    panel_icon = "sprites/double_jump/icon.png",
  })

  local on, armed = false, false

  local function in_jump(worm)
    local s = worm.state
    return JUMPING[s] or (s == "falling" and worm.weapon == "px.jump")
  end

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FRAME_FINISH then
      if on and not armed and worm.turn and GROUNDED[worm.state] then
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
      worm:jump()
      return "eat"
    end
  end, { msgs = { wa.msg.FRAME_FINISH, wa.msg.FIRE_WEAPON, wa.msg.JUMP, wa.msg.JUMP_UP } })

  wa.on.turn_start(function()
    on, armed = false, false
  end)

end

return { install = install }
`
      },
      {
        path: 'weapons/drilling_crew.lua',
        name: 'weapons/drilling_crew.lua',
        language: 'lua',
        content: `-- Drilling Crew: a roaming drill followed by a bouncing worker.

local on_missile = require("lib/on_missile")
local holds = require("wf-lib/holds")
local weapon = {}
weapon.definition = {
  copy_from="stock.bazooka",
  name="Drilling Crew",
  panel_icon="sprites/drilling_crew/ico_drillingc.png",
  sprite="sprites/drilling_crew/driller.png",
  cluster_sprite = "sprites/drilling_crew/drillerc.png",
  worm_sprites=holds.PX_POSTURE,
  sprites={"sprites/drilling_crew/trail.png"},
  params={sprite_columns=1,gpu_prefix="sprites/drilling_crew/trail"},
  hold={sheet="sprites/drilling_crew/driller.png",frames=8,animate=true,anim_speed=1.1,
    hand=holds.PX_HANDS[1],hand_type=1,hand_scale=1.2,hand_radius=-13.2,
    hand_rotation=0,hand_radial_rotation=0,weap_radial_rotation=0,
    weap_rotation=0.5,weap_radius=-11,static={weap=0,hand=0.4}},
    fires = {
      launch_power_pct = 5,
      method = 2,
      subtype = 1,
      type = 2,
    },
    handling = {
      remember_selection = false,
      ends_turn = false,
      retreat = 3000,
    },
    missile = {
      action = "roam",
      alarm_worms = true,
      animation = 6,
      burst = "clusters",
      flight_sound = 65620,
      fuse = 5000,
      gravity_pct = 65,
      impact_particles = true,
      random_motion = 10,
      speed_pct = 99,
      wind_pct = 0,
      ends_on_contact = {
        objects = true,
        water = true,
      },
      explosion = {
        bias = 20,
        power = 35,
        push_pct = 105,
      },
      explosion_sound = {
        before = 350,
        sound = 175,
      },
      roam = {
        step_height = -80,
        edge_jump = {
          angle_deg = 40,
          speed = 2.4,
        },
        flight_hits = {
          crates = true,
          donor_cards = true,
          objects = true,
          water = true,
        },
        hits = {
          crates = true,
          donor_cards = true,
          land = true,
          mines = true,
          missiles = true,
          water = true,
          worms = true,
          worms_frozen = true,
        },
        jump = {
          angle_deg = 40,
          speed = 2.4,
        },
      },
      trail = {
        power = 0,
        speed = 0,
        sprite = 0,
      },
    },
    clusters = {
      count = 1,
      launch_power_pct = 60,
      power_variation_pct = 100,
      spread = 45,
      bit = {
        action = "bounce",
        animation = 1,
        flight_sound = 161,
        fuse = 1500,
        gravity_pct = 150,
        impact_particles = false,
        random_motion = 10,
        speed_pct = 100,
        sprite_count = 1,
        bounce = {
          bounciness = 30,
          max_bounces = 200,
          sound = 108,
          terrain_keep_speed_pct = 101,
          hits = {
            crates = true,
            donor_cards = true,
            land = true,
            objects = true,
            water = true,
            worms_acting = true,
            worms_frozen = true,
            worms_normal = true,
          },
        },
        ends_on_contact = {
          water = true,
        },
        explosion_sound = {
          before = 1,
          enabled = true,
          sound = 115,
        },
        trail = {
          power = 0,
          speed = 125,
          sprite = 0,
        },
      },
    },
}

function weapon.setup()
  local parent_sprite
  local seen = {}
  on_missile(function(m)
    if m.weapon ~= "px.drilling_crew" then seen[m.id]=nil; return end
    if not parent_sprite then
      parent_sprite=wa.weapons.data("px.drilling_crew").missile.sprite
    end
    local parent=m.sprite==parent_sprite
    seen[m.id]={worker=not parent,frame=wa.world.frame()}
    if m.phase~="pre" or not parent then return end
    wa.land.cut{x=m.x,y=m.y-7,shape="circle",radius=7}
    for _,worm in ipairs(wa.worms.all()) do
      if not worm.turn and worm.hp>0 then
        local dx,dy=worm.x-m.x,worm.y-m.y
        local rx,ry=math.max(0,math.abs(dx)-10),math.max(0,math.abs(dy)-10)
        local d=math.sqrt(dx*dx+dy*dy)
        if rx*rx+ry*ry<=36 and d>0 then
          local force=0.6*math.sqrt(15)
          worm:hit{amount=0,vx=force*dx/d,vy=force*dy/d}
        end
      end
    end
  end, { weapons = { "px.drilling_crew" } })
  local particles, emit, previous = {}, {}, nil
  local LIFE, LIMIT = 20, 256
  wa.on.draw(function()
    local frame=wa.world.frame()
    local dt=previous and frame-previous or 1
    if dt<0 or dt>10 then particles,emit={},{};dt=1 end
    previous=frame
    if dt>0 then
      for i=#particles,1,-1 do
        local p=particles[i];p.age=p.age+dt
        if p.age>=LIFE then table.remove(particles,i)
        else p.x,p.y=p.x+p.vx*dt,p.y+p.vy*dt end
      end
      local live={}
      for _,body in ipairs(wa.missiles.all()) do
        local source=seen[body.id]
        if source and source.worker and frame>=source.frame and frame-source.frame<=2 and body.y<wa.world.water() then
          local key=body.id
          live[key]=true
          local n=(emit[key] or 0)+0.8*dt -- source trail power 20 / 25 each frame
          local count=math.floor(n);emit[key]=n-count
          for _=1,count do
            if #particles>=LIMIT then table.remove(particles,1) end
            particles[#particles+1]={x=body.x,y=body.y,age=0,
              vx=wa.draw.random()-0.5,vy=wa.draw.random()-0.5}
          end
        end
      end
      for key in pairs(emit) do if not live[key] then emit[key]=nil end end
      for id,source in pairs(seen) do if frame<source.frame or frame-source.frame>2 then seen[id]=nil end end
    end
    for _,p in ipairs(particles) do
      local half=30*(1-p.age/LIFE)
      wa.draw.quad{sprite="sprites/drilling_crew/trail.png",frame=math.min(8,math.floor(p.age*9/LIFE)),
        depth=wa.depth.OBJECTS,blend="alpha",color=0xFFFFFFFF,
        points={{p.x-half,p.y-half},{p.x+half,p.y-half},{p.x+half,p.y+half},{p.x-half,p.y+half}}}
    end
  end)
end
return weapon
`
      },
      {
        path: 'weapons/electric_grenade.lua',
        name: 'weapons/electric_grenade.lua',
        language: 'lua',
        content: `-- Electric Grenade: a grenade whose blast is followed by a chaining electric arc.

local weapon = {}

weapon.record = {
  handling = {
    remember_selection = true,
    ends_turn = true,
  },
}

weapon.missile_sprite = {
    sheet = "sprites/px_hold/electric_grenade.png", frames = 1,
    spin = true, -- its record's WAT_Rotation
    hide = true,
  }

function weapon.definition()
  local shared = require("lib/shared")
  local sdk = require("wf-lib/holds")
  local PX_POSTURE, PX_HANDS = sdk.PX_POSTURE, sdk.PX_HANDS
  return require("lib/weapon").merge(weapon.record, {
    wep = "weps/earthquake.wep",
    panel_icon = "sprites/electric_grenade/icon.png",
    hold_as = "stock.grenade",
    missile = { sprite = 0 }, -- WA draws no round; the art spec draws it
    worm_sprites = PX_POSTURE,
    sprites = { "sprites/px_hold/electric_grenade.png" },
    sounds = { "sounds/lightning/tazer_loop.wav" },
    params = { gpu_prefix = "sprites/px_hold/" },
    on_explode = function(ev) require("lib/electrical").context().grenade_arc(ev) end,
    hold = { -- Electric Grenade (electric_grenade_anim)
        thrown = true,
        sheet = "sprites/px_hold/electric_grenade.png", hand_type = 1,
        hand_radius = 15, hand_scale = 0.8,
        weap_rotation = 0.5, weap_radius = 9,
        hand = PX_HANDS[1],
    },
  })
end

weapon.requires = { "lib/electrical" }

function weapon.setup()
  local c = require("lib/electrical").context()
  local tazed = c.tazed

  wa.on.worm_message(function(worm, msg)
    if worm.weapon == "px.electric_grenade" and not tazed["worm:" .. worm.id] then
      c.thrower = worm
    end
  end, { msgs = { wa.msg.FIRE_WEAPON } })
end

return weapon
`
      },
      {
        path: 'weapons/electromagnet.lua',
        name: 'weapons/electromagnet.lua',
        language: 'lua',
        content: `-- Electromagnet: a placed magnet that pulls or pushes mines and missiles for four turns.

local on_missile = require("lib/on_missile")
local weapon = {}

-- What its field drags can't push it by running into it: stock mines and
-- missiles, the animals among them. Worms, blasts, guns, the Prod and the
-- Fire Punch push it as usual.
local PUSHED_BY = { mines = 0, missiles = 0 }

weapon.record = {
  handling = {
    remember_selection = true,
    ends_turn = true,
  },
}

function weapon.definition()
  local shared = require("lib/shared")
  local fires = shared.fires
  return require("lib/weapon").merge(weapon.record, {
    wep = "weps/baseball_bat.wep",
        panel_icon = "sprites/electromagnet/ico_magnet.png",
    panel_icons = { "sprites/electromagnet/ico_magnet_blue.png" },
        worm_sprites = {
          wdynlnk = "sprites/electromagnet/wmag2lnk.png",
          wdynlnku = "sprites/electromagnet/wmag2lnku.png",
          wdynlnkd = "sprites/electromagnet/wmag2lnkd.png",
        },
    worm_sprites_toggle = { key = "plus_key", worm_sprites = {
          wdynlnk = "sprites/electromagnet/wmaglnk.png",
          wdynlnku = "sprites/electromagnet/wmaglnku.png",
          wdynlnkd = "sprites/electromagnet/wmaglnkd.png",
        } },
    sprites = {
          "sprites/electromagnet/magnet.png", "sprites/electromagnet/magnet2.png",
          "sprites/electromagnet/magnet_damaged.png", "sprites/electromagnet/magnet2_damaged.png",
          "sprites/electromagnet/ring_in.png", "sprites/electromagnet/ring_out.png",
          "sprites/electromagnet/magnetsparks.png",
        },
    params = { gpu_prefix = "sprites/electromagnet/" },
    on_fire = function(fire) fires.electromagnet(fire) end,
  })
end

function weapon.setup()
  local function sq(v) return v * v end

  local shared = require("lib/shared")
  local RANGE2 = 170 * 170 -- MaxRange
  local SYNC2 = RANGE2 // 4 -- MaxSyncRange: MaxRange * 0.25
  local TURNS, HEALTH, LOW_HEALTH = 4, 80, 30
  local BOOM = { id = 100, damage = 50, below = false } -- ExplosionBlast, ExplosionDamage
  local RELEASE_AFTER = 300
  local DAMPED = { ["px.hellish_hand_grenade"] = true }
  local DAMPING = 0.985
  local RADIUS = 8 -- conservative planter clearance around the art
  local PLANTER_GRACE = 13 -- 250 ms rounded up at 50 simulation frames/s
  local SINK = (1 / 2) -- in the water it sinks half a pixel a frame
  local SUNK = 200 -- and is gone this far below the surface
  local BODY = "sprites/electromagnet/"
  local magnets = {}
  local polarity = {}
  local plus_held = {} -- worm id -> the synchronized + key last frame

  local function trunc(x) return x >= 0 and math.floor(x) or -math.floor(-x) end

  local function trigger_mine(m, mine, mines)
    local fuse = mine.fuse
    if fuse < 0 then
      fuse = wa.random(1000, 4999)
      if m.pol < 0 then
        local longest = 1000
        for _, other in ipairs(mines) do
          if other.id ~= mine.id then
            local dx, dy = (other.x - m.x), (other.y - m.y)
            if dx * dx + dy * dy < SYNC2 then longest = math.max(longest, other.fuse) end
          end
        end
        if longest > 1000 then fuse = longest + wa.random(-200, 199) end
      end
    end
    mine:arm(fuse)
  end

  local function trigger_mines(m)
    if not (m.ended_at and m.age - m.ended_at > RELEASE_AFTER) then
      local mines = wa.mines.all()
      for _, mine in ipairs(mines) do
        if m.field:contains(mine.x, mine.y) then
          trigger_mine(m, mine, mines)
        end
      end
    end
  end

  local function sprite(m)
    local name = m.pol < 0 and "magnet" or "magnet2"
    if m.health <= LOW_HEALTH then name = name .. "_damaged" end
    return BODY .. name .. ".png"
  end

  local function remove(m)
    m.alive = false
    m.field:remove()
    for i, other in ipairs(magnets) do
      if other == m then table.remove(magnets, i); break end
    end
  end

  local function discharge(m)
    if m.turns <= 0 then return end
    trigger_mines(m)
    m.field.enabled = false -- also wakes custom sleepers for one simulation step
    m.turns = 0
  end

  local function clear_spawn(a)
    if a:fits(a.x, a.y) then return end
    for d = 1, 24 do
      for _, v in ipairs({ {0, 1}, {-1, 1}, {1, 1}, {-1, 0}, {1, 0}, {-1, -1}, {1, -1}, {0, -1} }) do
        local x, y = a.x + v[1] * d, a.y + v[2] * d
        if a:fits(x, y) then a:warp { x = x, y = y }; return end
      end
    end
  end

  local function overlaps_planter(x, y, worm)
    return x + RADIUS >= worm.x - 10 and x - RADIUS <= worm.x + 10
      and y + RADIUS >= worm.y - 20 and y - RADIUS <= worm.y + 6
  end

  local function planter_grace(m, a, previous_x, previous_y)
    if not m.planter then return end
    local planter
    for _, worm in ipairs(wa.worms.all()) do
      if worm.id == m.planter_id and worm.hp > 0 then planter = worm; break end
    end
    if not planter or (m.age >= PLANTER_GRACE
      and not overlaps_planter(previous_x, previous_y, planter)
      and not overlaps_planter(m.x, m.y, planter)) then
      a:collision_ignore(m.planter, false)
      m.planter, m.planter_id = nil, nil
    end
  end

  local function frame(m, a)
    m.age = m.age + 1
    local previous_x, previous_y = m.x, m.y
    if not m.sinking then m.x, m.y, m.vx, m.vy = a.x, a.y, a.vx, a.vy end
    if m.y >= wa.world.water() then
      discharge(m)
      if not m.sinking then m.sinking = true; a.hits = {} end
      m.vx, m.vy, m.y = 0, 0, m.y + SINK
      a:warp { x = m.x, y = m.y, vx = 0, vy = 0 }
      if m.y >= wa.world.water() + SUNK then
        remove(m)
        a:remove()
        return
      end
    end
    if m.health <= 0 then
      trigger_mines(m)
      remove(m)
      a.y = m.y - 20
      a:explode(BOOM)
      a:remove()
      return
    end
    planter_grace(m, a, previous_x, previous_y)
    if m.turns > 0 then
      m.field.native = not (m.ended_at and m.age - m.ended_at >= RELEASE_AFTER)
      trigger_mines(m)
      m.spark = (m.spark + 0.02) % 1.4
    end
    local speed = math.sqrt(sq(m.vx) + sq(m.vy))
    m.angle = m.angle + (m.vx < 0 and -1 or 1) * math.min(0.5, 0.04 * speed)
    local s = sprite(m)
    if s ~= m.sprite then a:look(s); m.sprite = s end
    a:gfx({ angle = math.deg(m.angle + math.pi) % 360, depth = wa.depth.OBJECTS })
  end

  local function hit(m, a, event)
    local damage = math.max(0, event.damage or 0)
    if event.kind == "blast" and damage > 0 then
      local dx, dy = (a.x - (event.x or a.x)), (a.y - (event.y or a.y))
      damage = trunc((1 - (dx * dx + dy * dy) / (damage * damage * 4)) * damage)
    elseif event.kind == "percent" then
      damage = trunc(m.health * damage / 100)
    end
    if damage > 0 then m.health = m.health - damage end
    local vx, vy = event.vx or 0, event.vy or 0
    if vx ~= 0 or vy ~= 0 then
      a:warp { x = a.x, y = a.y, vx = a.vx + vx, vy = a.vy + vy }
    end
  end

  local function recharge(m)
    if not m.alive or m.sinking then return end
    if m.turns <= 0 then m.field.enabled = true end
    m.turns = TURNS
  end

  require("lib/electrical").register({
    kind = "magnet",
    targets = function()
      local out = {}
      for _, m in ipairs(magnets) do
        if m.alive and not m.sinking and m.a then
          out[#out + 1] = { id = m.a.id, x = m.x, y = m.y, radius = RADIUS, m = m }
        end
      end
      return out
    end,
    zap = function(obj, side)
      local m = obj.m
      if not m.alive then return end
      if m.turns <= 0 then recharge(m); return end
      m.health = 1
      hit(m, m.a, { damage = 12, vx = side * 1.2, vy = -4 })
    end,
    strike = function(obj) recharge(obj.m) end,
  })

  shared.fires.electromagnet = function(fire)
    local worm = fire.worm
    local pol = (fire.polarity == 1 or fire.polarity == -1) and fire.polarity or polarity[worm.id] or 1
    local m = { pol = pol, turns = TURNS, health = HEALTH, age = 0, angle = 0, spark = 0, alive = true,
      x = fire.x or worm.x, y = fire.y or worm.y,
      vx = worm.vx + (worm.facing < 0 and -1 or 1) * 0.3,
      vy = worm.vy - 0.15 }
    local a = wa.actors.spawn({
      sprite = BODY .. (pol < 0 and "magnet.png" or "magnet2.png"),
      x = m.x, y = m.y, vx = m.vx, vy = m.vy, owner = worm,
      body = { physics = "mine", pushed_by = PUSHED_BY }, on = {
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
  end

  local turn_open = false
  wa.on.turn_start(function(event)
    if turn_open then return end
    turn_open = true
    for i = #magnets, 1, -1 do
      if magnets[i].field.native == nil then remove(magnets[i]) end -- the engine freed it (far off the map)
    end
    local team = event.worm and event.worm.team
    for _, m in ipairs(magnets) do
      m.ended_at = nil
      m.field.native = true
      if m.alive and m.team == team and m.turns > 0 then
        if m.turns == 1 then discharge(m) else m.turns = m.turns - 1 end
      end
    end
  end)

  wa.on.turn_end(function()
    turn_open = false
    for _, m in ipairs(magnets) do m.ended_at = m.age end
  end)

  on_missile(function(missile)
    if missile.phase ~= "pre" or not DAMPED[missile.weapon] then return end
    for _, m in ipairs(magnets) do
      if m.field:contains(missile.x, missile.y) then
        missile.vx, missile.vy = missile.vx * DAMPING, missile.vy * DAMPING
        return
      end
    end
  end, { weapons = wa.sorted(DAMPED), phase = "pre" })

  wa.on.worm_message(function(worm)
    local id = worm.id
    local pressed = worm.turn and worm.weapon == "px.electromagnet" and wa.world.keys().plus_key or false
    if pressed and not plus_held[id] then polarity[id] = -(polarity[id] or 1) end
    plus_held[id] = pressed
  end, { msgs = { wa.msg.FRAME_FINISH } })

  local icon_shown = true
  local function show_mode_icon(worm)
    if not (icon_shown and wa.weapons.panel_icon and shared.owns("px.electromagnet")) then return end
    local attract = worm and (polarity[worm.id] or 1) < 0
    local ok, err = pcall(wa.weapons.panel_icon, "px.electromagnet", attract and 0 or 1)
    if not ok then
      icon_shown = false
      wa.log("electromagnet: mode icon: " .. tostring(err))
    end
  end

  if wa.on.hud then
    wa.on.hud(function()
      local worm = shared.current_worm()
      show_mode_icon(worm)
    end)
  end
  require("lib/weapon_hint").register("px.electromagnet", function(worm)
    return (polarity[worm.id] or 1) < 0 and "Electromagnet: ATTRACT\\n+ to repel"
      or "Electromagnet: REPEL\\n+ to attract"
  end)

  if wa.on.draw and wa.draw.quad then
    local health_label = require("lib/sentry_health")
    health_label.install()
    local QUAD = { blend = "add", points = { {0, 0}, {0, 0}, {0, 0}, {0, 0} } }
    local RING_IN, RING_OUT, SPARKS = BODY .. "ring_in.png", BODY .. "ring_out.png", BODY .. "magnetsparks.png"
    local function square(sprite, frame, color, depth, x, y, h, angle)
      QUAD.sprite, QUAD.frame, QUAD.color, QUAD.depth = sprite, frame, color, depth
      local c, s = wa.math.cos(angle) * h, wa.math.sin(angle) * h
      local p = QUAD.points
      p[1][1], p[1][2] = x - c + s, y - s - c
      p[2][1], p[2][2] = x + c + s, y + s - c
      p[3][1], p[3][2] = x + c - s, y + s + c
      p[4][1], p[4][2] = x - c - s, y - s + c
      wa.draw.quad(QUAD)
    end
    wa.on.draw(function()
      for _, m in ipairs(magnets) do
        if m.alive and not m.sinking then
          health_label.draw(m.health, HEALTH, m.x, m.y - 15, wa.depth.OBJECTS - 2)
        end
        if m.alive and m.turns > 0 then
          local x, y = m.x, m.y
          local ring = m.pol < 0 and RING_IN or RING_OUT
          for phase = 0, 2 do
            local t = (m.age - phase * 65) % 195
            local radius = m.pol < 0 and 120 - 0.8 * t or 5 + 0.8 * t
            if radius >= 5 and radius <= 120 then
              local alpha = math.max(0, math.min(255, math.floor((120 - radius) * 255 / 120)))
              square(ring, nil, (alpha << 24) | 0xFFFFFF, wa.depth.OBJECTS + 1, x, y, radius, 0)
            end
          end
          if m.spark <= 1 then
            square(SPARKS, math.min(9, math.floor(m.spark * 10)), nil, wa.depth.OBJECTS - 1, x, y, 13, m.angle)
          end
        end
      end
    end)
  end
end

return weapon
`
      },
      {
        path: 'weapons/ferret.lua',
        name: 'weapons/ferret.lua',
        language: 'lua',
        content: `-- Ferret: a ferret that walks the land's outline and explodes on a worm, a drum or the water.

local weapon = {}

weapon.record = {
  handling = {
    remember_selection = true,
    ends_turn = true,
  },
}

function weapon.definition()
  local shared = require("lib/shared")
  local fires = shared.fires
  local sdk = require("wf-lib/holds")
  local PX_POSTURE, PX_HANDS = sdk.PX_POSTURE, sdk.PX_HANDS
  return require("lib/weapon").merge(weapon.record, {
    wep = "weps/salvation_army.wep",
    panel_icon = "sprites/ferret/icon.png",
    worm_sprites = {
      weaponlnk = sdk.PX_LEVEL.weaponlnk, weaponlnku = sdk.PX_LEVEL.weaponlnku,
      weaponlnkd = sdk.PX_LEVEL.weaponlnkd,
      wthrow = PX_POSTURE.wthrow, wthrowu = PX_POSTURE.wthrowu, wthrowd = PX_POSTURE.wthrowd,
    },
    sprites = { "sprites/ferret/walk.png" },
    sounds = { "sounds/ferret/walk.wav" },
    params = { gpu_prefix = "sprites/ferret/" },
    on_fire = function(fire) fires.ferret(fire) end,
    hold = {
        thrown = true,
        sheet = "sprites/ferret/hold.png", hand_type = 2, hand_radius = -8.0,
        hand_rotation = 0.0, hand_radial_rotation = -0.13, hand_scale = 1.0,
        weap_rotation = 0.5, weap_radial_rotation = 0.22, weap_radius = -9.0,
        static = { weap = 0.0, hand = 0.45 }, -- ang_if_static, hand_ang_if_static
        hand = PX_HANDS[2],
    },
  })
end

function weapon.setup()
  local shared = require("lib/shared")
  local fires = shared.fires

  local STEP = 3 -- frt_maxdist
  local MAX_FAILS = 4 -- frt_maxfails
  local MAX_OPS = 12 -- frt_maxoper
  local GRACE = 60 -- frt_framesdam
  local TURN_EVERY = 6 -- frt_pixrotat: steps between turns of the sprite
  local MAX_ALIVE = 10 -- frt_maxfrtalw
  local FUSE = 15 * 50
  local LIFT = 13
  local WORM_REACH_X, WORM_REACH_UP, WORM_REACH_DOWN = 8, 12, 9
  local MINE_REACH_X, MINE_REACH_Y = 7, 5
  local PROBE = 3
  local SCALE = 0.95 -- frt_sprscale
  local DEPTH = wa.depth.OBJECTS -- in front of the terrain, as the Bowling Ball
  local WALK = "sprites/ferret/walk.png"
  local FRAMES = 10
  local SOUND = "sounds/ferret/walk.wav"
  local BOOM = { damage = 50, id = 100, below = false }
  local BIAS = 100
  local DROP = BIAS * BOOM.damage // 200
  local WORM_UP, MINE_UP = -5, -7

  local UP, RIGHT, DOWN, LEFT = 1, 2, 4, 8
  local MOVES = {
    [DOWN] = { [LEFT] = { 1, 0, RIGHT }, [RIGHT] = { -1, 0, LEFT } },
    [UP] = { [LEFT] = { -1, 0, LEFT }, [RIGHT] = { 1, 0, RIGHT } },
    [LEFT] = { [LEFT] = { 0, 1, DOWN }, [RIGHT] = { 0, -1, UP } },
    [RIGHT] = { [LEFT] = { 0, -1, UP }, [RIGHT] = { 0, 1, DOWN } },
  }

  local alive = {} -- the Ferrets walking, oldest first
  local MAX_RISE = 64

  local function land_at(f, x, y)
    return not f.a:fits(x, y)
  end

  local function rise_clear(f)
    for _ = 1, MAX_RISE do
      if not land_at(f, f.x, f.y) then return end
      f.y = f.y - 1
    end
  end

  local function move(f, dir)
    local m = MOVES[f.looking][dir]
    f.ax, f.ay, f.looking = f.ax + m[1] * STEP, f.ay + m[2] * STEP, m[3]
  end

  local function trace(f)
    f.ax, f.ay = f.px, f.py
    f.looking = f.looking_bk
    while true do
      if f.ops <= 0 then
        f.tracing, f.walking, f.fails, f.ops = false, true, 0, MAX_OPS
        return
      end
      if f.fails >= MAX_FAILS then
        f.tracing, f.walking, f.boom, f.fails, f.why = false, false, true, 0, "a dead end"
        return
      end
      if land_at(f, f.ax, f.ay) then
        f.fails = 0
        if f.ax ~= f.px or f.ay ~= f.py then
          f.looking_bk = f.looking
          f.px, f.py = f.ax, f.ay
          f.outline[#f.outline + 1] = { f.ax, f.ay }
        end
        move(f, f.side < 0 and RIGHT or LEFT)
      else
        f.fails = f.fails + 1
        move(f, f.side < 0 and LEFT or RIGHT)
      end
      f.ops = f.ops - 1
    end
  end

  local function body(f, x, y)
    return x + (f.ux * LIFT), y + (f.uy * LIFT)
  end

  local function touching(x, y)
    local near = { near = { x, y, WORM_REACH_UP + 1 } }
    for _, w in ipairs(wa.worms.all(near)) do
      local dx, dy = (x - w.x), (y - w.y)
      if w.hp > 0 and math.abs(dx) < WORM_REACH_X and dy > -WORM_REACH_UP and dy < WORM_REACH_DOWN then
        return w, "worm"
      end
    end
    for _, m in ipairs(wa.mines.all(near)) do
      if math.abs(x - m.x) < MINE_REACH_X and math.abs(y - m.y) < MINE_REACH_Y then return m, "mine" end
    end
    local _, obj = wa.world.collides({ x = x, y = y, radius = PROBE, with = { "oil" } })
    if obj then return obj, "oil" end
  end

  local function interact(f, x, y)
    local obj, kind = touching(x, y)
    if kind == "worm" then
      local current = shared.current_worm()
      if f.grace > 0 and current and current.id == obj.id then return end
      obj.vx, obj.vy = f.side, WORM_UP
      f.boom, f.walking, f.tracing, f.why = true, false, false, "a worm"
    elseif kind == "oil" then
      f.boom, f.walking, f.tracing, f.why = true, false, false, "an oil drum"
    elseif kind == "mine" then
      obj.vx, obj.vy = f.side, MINE_UP
    end
    if shared.kick_bowling_balls then
      shared.kick_bowling_balls(x, y, PROBE, f.side, MINE_UP)
    end
  end

  local function turn(f, x, y)
    f.steps = f.steps + 1
    if f.steps % TURN_EVERY ~= 0 then return end
    local dx, dy = (x - f.rx), (y - f.ry)
    local len = math.sqrt(dx * dx + dy * dy)
    if len > 0 then
      f.ux, f.uy = f.side * dy / len, -f.side * dx / len
    end
    f.angle = wa.math.atan(dx, -dy) - math.pi / 2 * f.side
    f.rx, f.ry = x, y
  end

  local function walk(f)
    local p = f.outline[f.next]
    if not p then
      f.walking, f.tracing = false, true
      f.outline, f.next = {}, 1
      f.x, f.y = f.lx, f.ly
      return false
    end
    f.next = f.next + 1
    f.x, f.y = p[1], p[2]
    interact(f, f.x, f.y)
    turn(f, f.x, f.y)
    f.lx, f.ly = f.x, f.y
    return true
  end

  local function fly(f)
    f.vy = f.vy + wa.world.gravity()
    local n = math.min(64, math.max(math.abs(f.vx), math.abs(f.vy)) // 1 + 1)
    local sx, sy = f.vx / n, f.vy / n
    for _ = 1, n do
      if land_at(f, f.x + sx, f.y + sy) then
        f.vx, f.vy = 0, 0
        return
      end
      f.x, f.y = f.x + sx, f.y + sy
    end
  end

  local function try_plant(f, a)
    local x, y = f.x, f.y + STEP
    if land_at(f, x, y) then
      f.planted, f.tracing = true, true
      f.px, f.py, f.ax, f.ay, f.lx, f.ly, f.rx, f.ry = x, y, x, y, x, y, x, y
      wa.sound.play(a, SOUND)
    end
    interact(f, f.x, f.y)
  end

  local function forget(f)
    for i, other in ipairs(alive) do
      if other == f then table.remove(alive, i); return end
    end
  end

  local function explode(f, a)
    wa.log(string.format("Ferret explodes on %s at (%d, %d), %d frames after it was placed",
      f.why or "?", f.x // 1, f.y // 1, f.age))
    f.dead = true
    forget(f)
    a.x, a.y = f.x, f.y + DROP
    a:explode(BOOM)
    if a.id ~= 0 then a:remove() end
  end

  local function frame(f, a)
    if f.dead then return end
    f.age = f.age + 1
    if f.gone then
      f.dead = true
      a:remove()
      return
    end
    if not f.planted then
      fly(f)
      try_plant(f, a)
    end
    if f.y >= wa.world.water() - STEP then f.boom, f.why = true, f.why or "the water" end
    if f.age >= FUSE then f.boom, f.why = true, f.why or "its 15 s fuse" end
    if f.boom then
      explode(f, a)
      return
    end
    if f.tracing then trace(f) end
    if f.walking and walk(f) then walk(f) end
    f.grace = f.grace - 1
    local bx, by = f.x, f.y
    if f.planted then bx, by = body(f, f.x, f.y) end
    a.x, a.y, a.vx, a.vy = bx, by, 0, 0
    a:frame((f.steps // 2) % FRAMES)
    a:gfx({ angle = math.deg(f.angle) % 360, depth = DEPTH, scale = SCALE })
  end

  fires.ferret = function(fire)
    local worm = fire.worm
    while #alive >= MAX_ALIVE do
      local oldest = table.remove(alive, 1)
      oldest.gone = true
    end
    local f = {
      x = fire.x, y = fire.y, vx = fire.vx, vy = fire.vy, ux = 0, uy = -1,
      side = (worm.facing or 1) < 0 and -1 or 1,
      looking = DOWN, looking_bk = DOWN, ops = MAX_OPS, fails = 0,
      outline = {}, next = 1, steps = 0, angle = 0, grace = GRACE, age = 0,
      planted = false, tracing = false, walking = false, boom = false,
    }
    alive[#alive + 1] = f
    local a = wa.actors.spawn({
      sprite = WALK, x = f.x, y = f.y, owner = worm,
      body = { shape = "missile", layer = "missile" }, on = function(actor) frame(f, actor) end,
    })
    f.a = a
    rise_clear(f)
    a.facing = f.side
    a:frame(0)
  end

  shared.ferrets = alive
end

return weapon
`
      },
      {
        path: 'weapons/fire_cluster_bomb.lua',
        name: 'weapons/fire_cluster_bomb.lua',
        language: 'lua',
        content: `-- Fire Cluster Bomb: a grenade that bursts into five clustlets, each bursting into fire.

local weapon = {}

local ART = "sprites/fire_cluster/"
local CLUSTLET_SPRITE = 54 -- the stock cluster bit's, which the clustlets fly with
local CLUSTLETS = 5

weapon.record = {
  missile = {
    sprite = 0, -- WA draws no round; the art spec draws it
    burst = "nothing",
    impact_particles = false,
    bounce = {
      hits = {
        crates = true,
        donor_cards = true,
        land = true,
        objects = true,
        water = true,
        worms = true,
        worms_frozen = true,
      },
    },
    explosion = {
      bias = 0,
      power = 20,
      push_pct = 20,
    },
  },
}

-- What a clustlet changes in the grenade's record: it bursts into fire after a second.
local CLUSTLET = {
  sprite = CLUSTLET_SPRITE,
  fuse = 1000,
  countdown = 0,
  explosion = { bias = 1 },
  trail = { sprite = 131, power = 20, speed = 100 },
  burst = "fire",
  fire = {
    spread_generations = 10,
    spread_delay_ms = 30,
    burn_time_ms = 1500,
    decay_mode = "instant",
  },
}

weapon.missile_sprite = {
  { sheet = ART .. "bullet.png", frames = 1, spin = true, hide = true, first_sprite = 0 },
  { sheet = ART .. "clustlet.png", frames = 1, spin = true, hide = true,
    first_sprite = CLUSTLET_SPRITE },
}

local clustlets = {}
local bursts = {}
local shooter

local function on_explode(ev)
  local id = ev.missile
  if not id then return end
  if clustlets[id] then
    clustlets[id] = nil
  else
    bursts[#bursts + 1] = { x = ev.x, y = ev.y }
  end
end

function weapon.definition()
  local sdk = require("wf-lib/holds")
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.grenade",
    name = "Fire Cluster Bomb",
    panel_icon = ART .. "fire_cluster_ico.png",
    hold_as = "stock.grenade",
    on_explode = on_explode,
    worm_sprites = sdk.PX_POSTURE,
    sprites = { ART .. "bullet.png", ART .. "clustlet.png" },
    hold = {
      thrown = true,
      sheet = ART .. "bullet.png", hand_type = 1, hand_radius = 16,
      weap_rotation = 0.5, weap_radius = 9,
      hand = sdk.PX_HANDS[1],
    },
  })
end

function weapon.setup()
  clustlets, bursts, shooter = {}, {}, nil

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FIRE_WEAPON and worm.weapon == "px.fire_cluster_bomb" then
      shooter = worm
      return
    end
    if msg ~= wa.msg.FRAME_FINISH or #bursts == 0 then return end
    local owner = shooter or worm
    for _, p in ipairs(bursts) do
      for _ = 1, CLUSTLETS do
        local vx = wa.random(-196608, 196608) / 65536
        local vy = wa.random(-655360, -458752) / 65536
        local id = wa.weapons.launch({
          weapon = "px.fire_cluster_bomb", owner = owner, x = p.x, y = p.y, vx = vx, vy = vy,
          missile = CLUSTLET,
        })
        if id then clustlets[id] = true end
      end
    end
    bursts = {}
  end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })
end

return weapon
`
      },
      {
        path: 'weapons/fire_jump.lua',
        name: 'weapons/fire_jump.lua',
        language: 'lua',
        content: `-- Fire Jump: a fire punch that carries the worm high up, then forward.

local weapon = {}

weapon.record = {
  fire_punch = {
    damage = 45,
    knockback = 8,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.fire_punch",
    name = "Fire Jump",
    panel_icon = "sprites/fire_jump/fire_jump_ico.png",
  })
end

function weapon.setup()
  local own_time = require("wf-lib/own_time")
  local jumps = {} -- worm id -> frames since the punch
  local winding = {} -- worm id -> frames since fire was pressed
  local WIND_UP_MAX = 100
  local WIND_UP_STATES = {
    ready = true, charging = true, prefiring = true,
    firing = true, fired = true, punching = true,
  }

  local function fire_jump(worm, t)
    if t == 1 then
      worm.vy = -9
    elseif t == 30 then
      worm.vx = worm.facing * 4
    elseif t == 60 then
      worm.vy = worm.vy - 1
    end
    if t > 80 and t < 210 and worm.vy > 5 then
      worm.vy = 4
    end
  end

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FIRE_WEAPON then
      if worm.weapon == "px.fire_jump" and worm:ammo("px.fire_jump") ~= 0 then
        winding[worm.id] = 0
      end
      return
    end
    if msg ~= wa.msg.FRAME_FINISH then return end
    local id = worm.id
    if not (winding[id] or jumps[id]) then return end
    if not worm.turn or worm.hp <= 0 or worm.taken
        or (winding[id] and not WIND_UP_STATES[worm.state])
        or (jumps[id] and worm.state ~= "punching") then
      winding[id], jumps[id] = nil, nil
      return
    end
    local n = own_time.frames(worm)
    if winding[id] then
      if worm.state == "punching" and worm.vy < 0 then
        winding[id], jumps[id] = nil, 0
      else
        local w = winding[id] + n
        winding[id] = w < WIND_UP_MAX and w or nil
      end
    end
    for _ = 1, n do
      if not jumps[id] then break end
      local t = jumps[id] + 1
      fire_jump(worm, t)
      jumps[id] = t < 211 and t or nil
    end
  end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })
end

return weapon
`
      },
      {
        path: 'weapons/flame_turret.lua',
        name: 'weapons/flame_turret.lua',
        language: 'lua',
        content: `-- Flame Turret: a turret that lobs fire at moving enemies, over the land in their way.

local weapon = {}

weapon.record = {}

function weapon.definition()
  local fires = require("lib/shared").fires
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.prod",
    name = "Flame Turret",
    panel_icon = "sprites/pyro_turrets/flame_icon.png",
    is_weapon = true,
    on_fire = function(fire) fires.flame_turret(fire) end,
  })
end

function weapon.setup()
  local shared = require("lib/shared")
  local pyro = require("lib/pyro_turret")
  local FLAME_SOUND = 22 -- WA's Flamethrower, as PX plays it

  local function shoot(t, a, s, shot)
    if not pyro.muzzle_clear(a, shot) then return false end
    local force = pyro.force(s) * 4 -- PX throws its fire four times as fast
    wa.fire.spawn({ owner = t.owner(a, s), x = shot.x, y = shot.y,
      vx = shot.dx * force, vy = shot.dy * force,
      count = 0, duration = 1500, up_power = 1, damage = -1, damage_scale = 5 })
    wa.sound.play(a, FLAME_SOUND)
    return true
  end

  local t = pyro.new({
    kind = "flame_turret", weapon = "px.flame_turret", frames = pyro.FRAMES.flame,
    tazer = "empty", -- a CCustomTurret: the Tazer's arc empties its ammo
    ammo = 18, tower_offset = 19, explode_damage = 45,
    ammo_sprite = pyro.AMMO_FLAME, ammo_size = 40, -- WA's petrol3, PX's sprNum 126
    shoot = shoot,
  })
  shared.fires.flame_turret = function(fire_ev) t.place(fire_ev) end
  shared.flame_turret = t
end

function weapon.configure(ctx)
  require("lib/pyro_turret").configure(require("lib/shared").flame_turret, ctx)
end

return weapon
`
      },
      {
        path: 'weapons/gatling_gun.lua',
        name: 'weapons/gatling_gun.lua',
        language: 'lua',
        content: `-- Gatling Gun: a rapid-fire gun.

return {
  definition = {
    copy_from = "stock.minigun",
    name = "Gatling Gun",
    panel_icon = "sprites/gatling_gun/ico_gatlingg.png",
    fires = { subtype = 1 },
    handling = { remember_selection = false },
    gun = {
      bullets = 45,
      burst_size = 2,
      burst_spread_deg = 2,
      damage = 3,
      shot_interval_ms = 55,
      spread_deg = 19,
      explosion = { push_pct = 300, variation = 1 },
    },
    worm_sprites = {
      weaponlnk = "sprites/gatling_gun/agatlingp.png",
      weaponlnku = "sprites/gatling_gun/agatlingu.png",
      weaponlnkd = "sprites/gatling_gun/agatlingd.png",
      wthrow = "sprites/gatling_gun/pgatlingp.png",
      wthrowu = "sprites/gatling_gun/pgatlingu.png",
      wthrowd = "sprites/gatling_gun/pgatlingd.png",
      weaponfire = "sprites/gatling_gun/fgatlingp.png",
      weaponfireu = "sprites/gatling_gun/fgatlingu.png",
      weaponfired = "sprites/gatling_gun/fgatlingd.png",
    },
  },
}
`
      },
      {
        path: 'weapons/ghost_sheep.lua',
        name: 'weapons/ghost_sheep.lua',
        language: 'lua',
        content: `-- Ghost Sheep: a super sheep that flies through the land for eight seconds, then explodes.

local weapon = {}

weapon.record = {
  handling = {
    retreat = 5000,
  },
  missile = {
    countdown = 8000,
    explosion = {
      power = 90,
    },
    fuse = 8000,
    roam = {
      flight_hits = {},
      hits = {
        crates = true,
        donor_cards = true,
        land = true,
        objects = true,
        worms = true,
        worms_frozen = true,
      },
    },
    trail = {
      bubbles_per_second = 12.5,
    },
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.aqua_sheep",
    name = "Ghost Sheep",
    panel_icon = "sprites/ghost_sheep/ghost_sheep_ico.png",
    sheep_sprites = { "sprites/ghost_sheep/ghstshp1.png", "sprites/ghost_sheep/ghstshp2.png" },
  })
end

return weapon
`
      },
      {
        path: 'weapons/girder_launcher.lua',
        name: 'weapons/girder_launcher.lua',
        language: 'lua',
        content: `-- Girder Launcher: fires four mini-girders that push what they strike or become terrain.

local on_missile = require("lib/on_missile")
local holds = require("wf-lib/holds")
local weapon = {}
local launch, impact
weapon.definition = {
  copy_from = "stock.bazooka",
  name = "Girder Launcher",
  panel_icon = "sprites/girder_launcher/ico_girderl.png",
  sprite = "bazooka",
  fires = {launch_power_pct=45},
  handling = {remember_selection=false,shots=4,ends_turn=false,retreat=3000},
  missile = {
    flight_sound=95,fuse=4200,gravity_pct=0,wind_pct=0,impact_particles=true,
    bounce = {
      bounciness=80,contact_sides=0,max_bounces=40,sound=110,terrain_keep_speed_pct=80,
      hits={crates=true,donor_cards=true,objects=true,water=true,worms_frozen=true},
    },
    ends_on_contact={land=true,mines=true,water=true,worms=true},
    explosion={power=0,push_pct=0},
    trail={power=25,speed=250,sprite="sprites/girder_launcher/trail.png"},
  },
  worm_sprites=holds.PX_POSTURE,
  sprites={"sprites/girder_launcher/mgirderspb.png","sprites/girder_launcher/mgirder.png",
    "sprites/girder_launcher/laser.png"},
  sounds={"sounds/girder_launcher/mgirder_impact.wav"},
  params={gpu_prefix="sprites/girder_launcher/"},
  hold={
    sheet="sprites/girder_launcher/spb_girderl.png",frames=8,draw_hand=false,
    animate=true,anim_speed=1,hand_radius=0,hand_rotation=0,hand_radial_rotation=0,
    weap_radial_rotation=1,weap_rotation=1,weap_radius=0,
  },
  on_fire=function(ev) launch(ev) end,
  on_explode=function(ev) impact(ev) end,
}
weapon.missile_sprite={sheet="sprites/girder_launcher/mgirderspb.png",hide=true,
  frames=8,animate=true,anim_speed=3}

local GIRDER = { half_length = 11, half_width = 4 }

local function pushed(x, y, shooter)
  for _, o in ipairs(wa.world.electrical_nearby(x, y, 29, false)) do
    if (o.kind == "worm" or o.kind == "mine" or o.kind == "crate" or o.kind == "oil")
      and not (o.kind == "worm" and o.id == shooter)
      and math.abs(o.x - x) < 20 and math.abs(o.y - y) < 20 then
      return o
    end
  end
end

function weapon.setup()
  local flights, launching = {}, nil
  local turrets = require("lib/turret")
  local stuck_stamp = require("lib/stuck_stamp")
  launch = function(ev)
    local flight={ev.vx,ev.vy,shooter=ev.worm.id}
    local previous=launching
    launching=flight
    local ok,id=pcall(wa.weapons.launch,{
      weapon="px.girder_launcher",owner=ev.worm,x=ev.x,y=ev.y,vx=ev.vx,vy=ev.vy,
    })
    launching=previous
    if not ok then error(id) end
    if id and not flight.exploded then flights[id]=flight end
  end
  on_missile(function(m)
    if m.weapon ~= "px.girder_launcher" then return end
    local flight=flights[m.id]
    if flight then flight[1],flight[2],flight.id=m.vx,m.vy,m.id end
  end, { weapons = { "px.girder_launcher" } })
  local function orientation(vx,vy)
    if vx==0 then return vy>0 and 16 or 0 end
    if vy==0 then return vx>0 and 8 or 24 end
    if vx>0 and vy<0 then return math.min(math.floor(3*vx/-vy),7) end
    if vx>0 then return math.min(math.floor(8+3*vy/vx),15) end
    if vy>0 then return math.min(math.floor(16+3*-vx/vy),23) end
    return math.min(math.floor(24+3*-vy/-vx),31)
  end
  impact = function(ev)
    local flight=(ev.missile and flights[ev.missile]) or launching
    if ev.missile then flights[ev.missile]=nil end
    if flight then flight.exploded=true end
    local vx,vy=flight and flight[1] or 0,flight and flight[2] or 0
    local o=pushed(ev.x,ev.y,flight and flight.shooter)
    if not o then
      local sentry=turrets.projectile_target(ev.x,ev.y)
      if sentry and turrets.projectile_hit(sentry,3,vx/4,vy/4,flight and flight.id) then return end
    end
    local frame=orientation(vx,vy)
    local x,y,deeper
    if not o then
      x,y,deeper=stuck_stamp.place(ev.x,ev.y,frame,GIRDER)
      if not x then
        o=y
        wa.log(string.format("Girder Launcher: no girder at (%.1f,%.1f) clears worm %d; it is hit",
          ev.x,ev.y,o.id))
      elseif deeper>0 then
        wa.log(string.format("Girder Launcher: laid %dpx deeper at (%.1f,%.1f) to clear the worms",deeper,ev.x,ev.y))
      end
    end
    if o then
      o.vx,o.vy=vx/4,vy/4
      if o.kind=="worm" then o:hit(3)
      else o:hit(3,vx/2,vy/2,"bullet") end
      return
    end
    wa.land.stamp{sprite="sprites/girder_launcher/mgirder.png",frame=frame,x=x,y=y}
    for _,worm in ipairs(wa.worms.all()) do
      if worm.turn then wa.sound.play(worm,"sounds/girder_launcher/mgirder_impact.wav"); break end
    end
  end
  wa.on.draw(function()
    for _,worm in ipairs(wa.worms.all()) do
      if worm.turn and worm.hp>0 and worm.aiming and worm.weapon=="px.girder_launcher" then
        local angle=(1-worm.aim)*math.pi
        if worm.facing<0 then angle=2*math.pi-angle end
        local dx,dy=math.sin(angle),-math.cos(angle)
        local x,y=worm.x+12*dx,worm.y+12*dy
        local x1,y1=x+15000*dx,y+15000*dy
        local hit=wa.world.trace{x0=x,y0=y,x1=x1,y1=y1,radius=1,with={"terrain"}}
        if hit and hit.hit then x1,y1=hit.x,hit.y end
        wa.draw.ribbon{sprite="sprites/girder_launcher/laser.png",visibility=worm,
          blend="add",depth=wa.depth.FRONT,points={
            {x=x,y=y,width=2,u=0,color=0xC0FF6060},
            {x=x1,y=y1,width=1,u=1,color=0xFFFF3030},
          }}
      end
    end
  end)
end
return weapon
`
      },
      {
        path: 'weapons/gravity_control.lua',
        name: 'weapons/gravity_control.lua',
        language: 'lua',
        content: `-- Gravity Control: 1 to 5 choose the gravity; firing holds it for the turn.

local weapon = {}

weapon.record = {
  handling = {
    retreat = -1,
  },
  utility = {
    effect = "scripted",
  },
}

weapon.defaults = { crate = { type = "utility" }, donor_card = true }

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.low_gravity",
    name = "Gravity Control",
    panel_icon = "sprites/gravity_control/gravity_control_ico.png",
    sounds = { "sounds/gravity_control/activate.wav", "sounds/gravity_control/error.wav" },
  })
end

weapon.requires = { "lib/turn_controls" }

function weapon.setup()
  local GRAVITY_FACTORS = { 0.3, 0.5, 1.0, 1.7, 2.4 }
  local GRAVITY_NAMES = { "Very Low Gravity", "Low Gravity", "Normal Gravity", "High Gravity", "Very High Gravity" }

  local gravity_choice -- TransformedGravity's index, until fired
  local gravity_initial -- InitialGravity: the match's
  local gravity_factor -- ModulatedGravity while Gravity Control is on
  local SETTLE_LIMIT = 500 -- frames (10 s) the turn clock may stand still
  local clock_seen = {}
  local retreating = false
  local settling = false -- the turn has ended with Gravity Control on
  local crate_floor = 0 -- the newest crate's id when the turn ended

  local function gravity_back()
    gravity_factor, clock_seen, settling = nil, {}, false
    wa.world.set_gravity(gravity_initial)
  end

  local function watch_clock(worm)
    if not gravity_factor or retreating then
      return
    end
    local clock = wa.world.turn_clock()
    local seen = clock_seen[worm.id]
    if not seen or seen.clock ~= clock then
      clock_seen[worm.id] = { clock = clock, frames = 0 }
      return
    end
    seen.frames = seen.frames + 1
    if seen.frames >= SETTLE_LIMIT then
      gravity_back()
    end
  end

  wa.on.turn_retreat(function() retreating = true end)

  wa.on.turn_start(function()
    if settling then gravity_back() end
  end)
  wa.on.body_move(function(crate)
    if settling and crate.id > crate_floor then gravity_back() end
  end, { kinds = { "crate" } })

  require("lib/turn_controls").register("px.gravity_control", {
    frame = function(worm)
      gravity_initial = gravity_initial or wa.world.gravity()
      watch_clock(worm)
    end,
    choose = function(worm, digit)
      if digit >= 1 and digit <= 5 then
        gravity_choice = digit
        wa.sound.play(worm, 92)
      end
    end,
    fire = function(worm)
      if not gravity_choice then
        wa.sound.play(worm, "sounds/gravity_control/error.wav")
        return "eat"
      end
      gravity_initial = gravity_initial or wa.world.gravity()
      gravity_factor, gravity_choice = GRAVITY_FACTORS[gravity_choice], nil
      clock_seen = {}
      wa.sound.play(worm, "sounds/gravity_control/activate.wav")
      wa.world.set_gravity(gravity_initial * gravity_factor)
    end,
    finish = function()
      retreating = false
      if gravity_factor and not settling then
        settling, clock_seen, crate_floor = true, {}, 0
        for _, crate in ipairs(wa.crates.all()) do
          crate_floor = math.max(crate_floor, crate.id)
        end
      end
      gravity_choice = nil
    end,
    hint = function()
      return "Gravity Control: " .. (gravity_choice and GRAVITY_NAMES[gravity_choice]
        or "choose one") .. "\\n1-5: gravity, then Space"
    end,
  })
end

return weapon
`
      },
      {
        path: 'weapons/gravity_gun.lua',
        name: 'weapons/gravity_gun.lua',
        language: 'lua',
        content: `-- Gravity Gun: pulls the object it aims at, holds it in front of the worm and throws it.

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
    return "Gravity Gun: " .. now .. "\\nSpace: grab\\nShift/Ctrl + Space: push"
  end)
end

return weapon
`
      },
      {
        path: 'weapons/gravler.lua',
        name: 'weapons/gravler.lua',
        language: 'lua',
        content: `-- Gravler: a mole that digs for a set time, then blows up.

local weapon = {}

weapon.record = {
  fires = {
    launch_power_pct = "charged",
    method = 3,
    subtype = 3,
    type = 1,
  },
  handling = {
    retreat = 3000,
  },
  missile = {
    action = "dig",
    animation = 2,
    burst = "nothing",
    dig = {
      dive_sprite = 245,
      sound = 65574,
      sprite_1 = 246,
      sprite_2 = 247,
      sprite_3 = 248,
    },
    ends_on_contact = {
      crates = true,
      donor_cards = true,
      objects = true,
      worms = true,
      worms_frozen = true,
    },
    explode_on_space = false,
    explosion = {
      power = 40,
      push_pct = 110,
    },
    flight_sound = 0,
    fuse = 20000,
    gravity_pct = 85,
    sprite = 245,
    trail = {
      speed = 0,
      sprite = 0,
    },
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.mole_bomb",
    name = "Gravler",
    panel_icon = "sprites/gravler/gravler_ico.png",
    sprite_overrides = {
          wsvr = "sprites/gravler/gravlerdive.png", -- 245
          wsvru = "sprites/gravler/gravlerdiga.png", -- 246
          wsvrd = "sprites/gravler/gravlerdigb.png", -- 247
          wsvb = "sprites/gravler/gravlerdigc.png", -- 248
        },
    worm_sprites = {
          weaponlnk = "sprites/gravler/aim.png",
          weaponlnku = "sprites/gravler/aimu.png",
          weaponlnkd = "sprites/gravler/aimd.png",
          wthrow = "sprites/gravler/draw.png",
          wthrowu = "sprites/gravler/drawu.png",
          wthrowd = "sprites/gravler/drawd.png",
        },
  })
end

function weapon.configure(ctx, spec)
  spec.missile.fuse = ctx.option("timer") * 1000
  spec.missile.explosion.power = ctx.option("blast_power")
end

return weapon
`
      },
      {
        path: 'weapons/gravler_strike.lua',
        name: 'weapons/gravler_strike.lua',
        language: 'lua',
        content: `-- Gravler Strike: a strike of Gravlers.

local weapon = {}

weapon.record = {
  missile = {
    animation = 2,
    countdown = 3000,
    dig = {
      dive_sprite = 245,
      sprite_1 = 246,
      sprite_2 = 247,
      sprite_3 = 248,
    },
    ends_on_contact = {
      donor_cards = true,
      objects = true,
      worms = true,
    },
    explosion = {
      power = 37,
    },
    fuse = 5000,
    gravity_pct = 90,
    random_motion = 12,
    sprite = 245,
    trail = {
      power = 0,
      speed = 0,
      sprite = 0,
    },
  },
  strike = {
    count = 4,
    munition_speed = 1.1,
    spacing = 15,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.mole_squadron",
    name = "Gravler Strike",
    panel_icon = "sprites/gravler/gravlerst_ico.png",
    sprite_overrides = {
          wsvr = "sprites/gravler/gravlerdive.png", -- 245
          wsvru = "sprites/gravler/gravlerdiga.png", -- 246
          wsvrd = "sprites/gravler/gravlerdigb.png", -- 247
          wsvb = "sprites/gravler/gravlerdigc.png", -- 248
        },
  })
end

return weapon
`
      },
      {
        path: 'weapons/hang_glider.lua',
        name: 'weapons/hang_glider.lua',
        language: 'lua',
        content: `-- Hang-Glider: a parachute that flies as a glider, steered with the arrow keys.

local weapon = {}

weapon.record = {
  handling = {
    remember_selection = true,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.parachute",
    name = "Hang-Glider",
    panel_icon = "sprites/hang_glider/ico_glider.png",
    sprites = { "sprites/hang_glider/glider.png", "sprites/hang_glider/pack.png" },
    sounds = { "sounds/hang_glider/hangopen.wav", "sounds/hang_glider/hangclose.wav" },
    params = {
      gpu_prefix = "sprites/hang_glider/",
      worm_art = { "sprites/hang_glider/glider.png", "sprites/hang_glider/pack.png" },
    },
  })
end

function weapon.setup()
  local shared = require("lib/shared")
  local own_time = require("wf-lib/own_time")
  local parachute = require("lib/parachute")
  parachute.setup()
  local STOPPERS = { { wa.worms, 6 }, { wa.mines, 4 }, { wa.crates, 10 }, { wa.oil, 9 } }
  shared.balloons = shared.balloons or {}
  local balloons = shared.balloons

  do

    local GLIDER_GRAVITY = 0.75 -- GliderGravityFactor
    local GLIDER_WIND = 3.0 -- GliderWindFactor
    local GLIDER_FRICTION = 0.25 -- GliderFriction
    local GLIDER_TURN = 0.06 -- GliderMaxAngularVelocity
    local GLIDER_TURN_SPEED = 20.0 -- GliderMaxTurningSpeed
    local GLIDER_ANIM = 0.04 -- GliderAnimSpeed
    local GLIDER_LERP = 0.03 -- GliderRotationLerp
    local GLIDER_PUSH = 0.02 -- GliderMoveAcceleration
    local GLIDER_MAX_ANGLE = 1.5 -- about 86 degrees either way
    local GLIDER_DEPTH = wa.depth.FRONT -- in front of worms and terrain
    local GLIDER_PACK_FRAMES, GLIDER_PACK_FPS = 6, 24
    local GLIDER_PACK_WAIT = 50
    local GLIDER_SET_DOWN_SPEED = 7
    local GLIDER_PI = 3.141593

    local gliders = {}
    local equipped_before = {}

    local function glider_of(worm)
      local g = gliders[worm.id]
      if not g then
        g = { enabled = false, deployed = false, ang = 0, target = 0, cycle = 0, sx = 0, sy = 0 }
        gliders[worm.id] = g
      end
      return g
    end

    local function normalize_angle(a)
      while a > GLIDER_PI do a = a - 6.283186 end
      while a <= -GLIDER_PI do a = a + 6.283186 end
      return a
    end

    local function lerp_angle(c, a, b)
      a = normalize_angle(a)
      b = a + normalize_angle(b - a)
      return normalize_angle(a + (b - a) * c)
    end

    local function glider_art(worm, x, y, sheet)
      local a = wa.actors.spawn({
        sprite = sheet, x = x, y = y, owner = worm, visibility = worm, on = function() end,
      })
      a:gfx({ glow_of = worm, follow = worm })
      return a
    end

    local function glider_drop_art(worm, g)
      if g.art then g.art:remove(); g.art = nil end
      if g.pack then g.pack:remove(); g.pack = nil end
      g.pack_x, g.pack_y = nil, nil
      worm.body_visible = true
    end

    local function glider_begin_pack(worm, g)
      g.landing = nil
      if g.art then g.art:remove(); g.art = nil end
      g.pack, g.pack_t = glider_art(worm, worm.x, worm.y, "sprites/hang_glider/pack.png"), 0
      g.pack_x, g.pack_y = worm.x, worm.y
      g.pack.facing = -worm.facing
      g.pack:frame(0)
      g.pack:gfx({ depth = GLIDER_DEPTH })
      worm.body_visible = false
    end

    local function glider_blocked(worm, x, y, sx, sy)
      local x1, y1 = x + (1.1 * sx), y + (1.1 * sy)
      local n = math.max(1, math.ceil(math.sqrt(sx * sx + sy * sy) * 1.1 / 2))
      for i = 1, n do
        if not worm:fits(x + (x1 - x) * i / n, y + (y1 - y) * i / n) then
          return true
        end
      end
      local len = math.sqrt(sx * sx + sy * sy) * 1.1
      if len == 0 then
        return false
      end
      local dx, dy = sx * 1.1 / len, sy * 1.1 / len
      for _, s in ipairs(STOPPERS) do
        local list, r = s[1], s[2]
        if list and list.all then
          for _, o in ipairs(list.all()) do
            if o.id ~= worm.id then
              local ox, oy = (o.x - x), (o.y - y)
              local t = ox * dx + oy * dy
              if t > 0 and t < len and math.abs(ox * dy - oy * dx) < r then
                return true
              end
            end
          end
        end
      end
      return false
    end

    local function glider_keys(worm, g)
      local k = worm.keys
      local speed = math.sqrt(g.sx * g.sx + g.sy * g.sy) / GLIDER_TURN_SPEED
      if k.up then
        g.ang = math.max(g.ang - GLIDER_TURN * math.min(speed, 1), -GLIDER_MAX_ANGLE)
      end
      if k.down then
        g.ang = math.min(g.ang + GLIDER_TURN * math.max(math.min(speed, 1), 0.5), GLIDER_MAX_ANGLE)
      end
      if k.left then g.sx = g.sx - GLIDER_PUSH end
      if k.right then g.sx = g.sx + GLIDER_PUSH end
    end

    local function glider_think(worm, g)
      local f = worm.facing
      local ang = f < 0 and g.ang or GLIDER_PI - g.ang
      local fwd_x, fwd_y = -wa.math.cos(ang), wa.math.sin(ang)
      local up_x, up_y
      if f < 0 then up_x, up_y = -fwd_y, fwd_x else up_x, up_y = fwd_y, -fwd_x end
      local sx, sy = g.sx, g.sy
      sy = sy + wa.world.gravity() * GLIDER_GRAVITY
      local wind = up_x * wa.world.wind() * GLIDER_WIND
      sx, sy = sx + wind * up_x, sy + wind * up_y
      local up_vel = sx * up_x + sy * up_y
      sx, sy = sx - up_x * up_vel * GLIDER_FRICTION, sy - up_y * up_vel * GLIDER_FRICTION
      local target = f < 0 and wa.math.atan(sy, -sx) or wa.math.atan(sy, sx)
      target = normalize_angle(target)
      g.target = math.max(-GLIDER_MAX_ANGLE, math.min(GLIDER_MAX_ANGLE, target))
      g.ang = lerp_angle(GLIDER_LERP, g.ang, g.target)
      g.cycle = math.min(g.cycle + GLIDER_ANIM, 1)
      g.sx, g.sy = sx, sy
    end

    local GLIDER_UNSTAND = 3

    local function glider_close(worm, g, landing)
      g.deployed = false
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
      g.unstand = not landing and GLIDER_UNSTAND or nil
      if worm.taken then
        worm:release(g.sx, g.sy)
      end
    end

    local function glider_frame(worm)
      local state = worm.state
      local opened = parachute.fired(worm, "px.hang_glider")
      if state ~= "parachuting" then equipped_before[worm.id] = worm.weapon end
      local equipped = equipped_before[worm.id]
      local b = balloons[worm.id]
      if b and b.active then
        local g = gliders[worm.id]
        if g then g.enabled = false end
        return
      end
      local g = gliders[worm.id]
      if opened == "landed" and not (g and g.deployed) then
        g = g or glider_of(worm)
        if g.pack then g.pack:remove(); g.pack = nil end
        glider_begin_pack(worm, g)
        wa.sound.play(worm, "sounds/hang_glider/hangclose.wav")
        worm:release(0, 0)
        return
      end
      if not g then
        if (state == "parachuting" and equipped ~= "px.hang_glider")
            or (state ~= "parachuting" and worm.weapon ~= "px.hang_glider") then
          return
        end
        g = glider_of(worm)
      end
      if g.deployed then
        if not worm.taken then
          glider_close(worm, g, false)
          return
        end
        for i = 1, own_time.frames(worm) do
          glider_keys(worm, g)
          glider_think(worm, g)
          if glider_blocked(worm, g.x, g.y, g.sx, g.sy) then
            local below = g.sy > 0 and not worm:fits(g.x, g.y + (1.1 * g.sy + 4))
            if below then g.sy = math.min(g.sy, GLIDER_SET_DOWN_SPEED) end
            if i > 1 then worm.x, worm.y = g.x, g.y end
            glider_close(worm, g, below)
            return
          end
          local x, y = g.x + g.sx, g.y + g.sy
          if y >= wa.world.water() then
            if i > 1 then worm.x, worm.y = g.x, g.y end
            glider_close(worm, g, false)
            return
          end
          g.x, g.y = x, y
        end
        local x, y = g.x, g.y
        worm:carry(x, y)
        local f = worm.facing
        g.art = g.art or glider_art(worm, x, y, "sprites/hang_glider/glider.png")
        local a = g.art
        a.x, a.y, a.vx, a.vy, a.facing = x, y, 0, 0, -f
        a:frame(math.min(math.floor(g.cycle * 10), 9))
        a:gfx({ angle = math.deg(f * g.ang) % 360, depth = GLIDER_DEPTH })
        worm.body_visible = false
        return
      end
      if state ~= "parachuting" then
        g.enabled = worm.weapon == "px.hang_glider"
        if g.unstand then
          if state == "standing" then
            worm:release(0, 0)
            g.unstand = nil
          else
            g.unstand = g.unstand > 1 and g.unstand - 1 or nil
          end
        end
        if g.landing then
          if state == "standing" and worm.y < wa.world.water() then
            glider_begin_pack(worm, g)
          elseif worm.y >= wa.world.water() or state == "tumbling" then
            g.landing = nil
            glider_drop_art(worm, g)
          else
            g.landing = g.landing > 1 and g.landing - 1 or nil
            if g.landing and g.art then
              g.art.x, g.art.y, g.art.vx, g.art.vy = worm.x, worm.y, 0, 0
              g.art.facing = -worm.facing
              worm.body_visible = false
            else
              glider_drop_art(worm, g)
            end
          end
        end
        if g.pack then
          local frame = g.pack_t * GLIDER_PACK_FPS // 50
          local keys = worm.keys or {}
          local moving = keys.left or keys.right or state == "walking"
            or state == "jump_prepare" or state == "jumping"
            or math.abs(worm.x - g.pack_x) > 1
          local landing_state = state == "standing" or state == "falling"
            or state == "jump_falling" or state == "falling"
          if frame >= GLIDER_PACK_FRAMES or moving or not landing_state
              or worm.y >= wa.world.water() then
            glider_drop_art(worm, g)
          else
            g.pack.x, g.pack.y, g.pack.vx, g.pack.vy = worm.x, worm.y, 0, 0
            g.pack.facing = -worm.facing -- its art faces left, as WA's worms do
            g.pack:frame(frame)
            g.pack:gfx({ depth = GLIDER_DEPTH })
            worm.body_visible = false
            g.pack_t = g.pack_t + own_time.frames(worm)
          end
        end
        g.sx, g.sy = worm.vx, worm.vy
        return
      end
      g.enabled = equipped == "px.hang_glider"
      if not g.enabled or g.deployed or state ~= "parachuting" then
        return -- a plain parachute, or the balloon
      end
      g.deployed, g.ang, g.target, g.cycle, g.landing, g.unstand = true, 0, 0, 0, nil, nil
      g.x, g.y = worm.x, worm.y
      if g.pack then g.pack:remove(); g.pack = nil end
      worm:take{ turn = "run", fire = true }
      wa.sound.play(worm, "sounds/hang_glider/hangopen.wav")
      return glider_frame(worm)
    end

    if wa.world.gravity and wa.world.wind then
      if wa.on.contact then
        wa.on.contact(function(worm, other)
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
        end)
      end
      wa.on.worm_message(function(worm, msg)
        if msg == wa.msg.FRAME_FINISH then
          glider_frame(worm)
          return
        end
        local g = gliders[worm.id]
        if g and g.pack and (msg == wa.msg.JUMP or msg == wa.msg.JUMP_UP) then
          glider_drop_art(worm, g)
          return
        end
        if not (g and g.deployed) then
          return
        end
        if msg == wa.msg.JUMP then
          glider_close(worm, g, false)
          return "eat"
        end
        if msg == wa.msg.FIRE_WEAPON and worm.weapon == "px.super_drill" then
          wa.sound.play(worm, 120) -- WA's can't-fire
          return "eat"
        end
      end, { msgs = { wa.msg.FRAME_FINISH, wa.msg.JUMP, wa.msg.JUMP_UP, wa.msg.FIRE_WEAPON } })
    end
  end
end

return weapon
`
      },
      {
        path: 'weapons/health_zone.lua',
        name: 'weapons/health_zone.lua',
        language: 'lua',
        content: `-- Health Zone: a thrown zone that heals the worm inside it or revives a grave; + heals, - damages.

local health_zone = require("lib/px_health_zone")

return {
  defaults = {
    ammo = { round_start = -1 },
    delay = 0,
  },
  install = function(ctx)
    health_zone.install(ctx)
  end,
}
`
      },
      {
        path: 'weapons/helicopter.lua',
        name: 'weapons/helicopter.lua',
        language: 'lua',
        content: `-- Helicopter: a jet pack flown as a helicopter: arrow keys steer, and a fast landing crashes it.

local weapon = {}

weapon.record = {
  handling = {
    retreat = -1,
  },
  jet_pack = {
    fuel = 100,
  },
}

weapon.defaults = { crate = { type = "utility" }, donor_card = true }

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.jet_pack",
    name = "Helicopter",
    panel_icon = "sprites/helicopter/heli_ico.png",
    sprites = { "sprites/helicopter/flying.png", "sprites/helicopter/jumpin.png" },
    sounds = {
          "sounds/helicopter/helicopterloop.wav",
          "sounds/helicopter/1.wav", "sounds/helicopter/2.wav", "sounds/helicopter/3.wav",
          "sounds/helicopter/4.wav",
          "sounds/helicopter/oops1.wav", "sounds/helicopter/oops2.wav", "sounds/helicopter/huh.wav",
          "sounds/helicopter/poop.wav", "sounds/helicopter/idiot.wav",
        },
    params = {
      gpu_prefix = "sprites/helicopter/",
      worm_art = { "sprites/helicopter/flying.png", "sprites/helicopter/jumpin.png" },
    },
  })
end

function weapon.setup()
  local shared = require("lib/shared")

  local trunc
  do
  local own_time = require("wf-lib/own_time")

  local HELI_REALISTIC = true -- gravity and wind act on it, at 0.2
  local HELI_EXPLODE_ON_TURN_END = true
  local HELI_DEPTH = wa.depth.FRONT -- in front of worms and terrain

  local helis = {}

  function trunc(v)
    return v >= 0 and math.floor(v) or math.ceil(v)
  end

  local function heli_of(worm)
    local h = helis[worm.id]
    if not h then
      h = { flying = false, launch = false, jumpin = false, jump_phase = 0, frame = 0, ticks = 0 }
      helis[worm.id] = h
    end
    return h
  end

  local function heli_actor(worm, sheet)
    local a = wa.actors.spawn({
      sprite = sheet, x = worm.x, y = worm.y, owner = worm, visibility = worm, on = function() end,
    })
    a:gfx({ glow_of = worm, follow = worm })
    return a
  end

  local function heli_drop_art(h, worm)
    if h.body then h.body:remove(); h.body = nil end
    if h.climb then h.climb:remove(); h.climb = nil end
    worm.body_visible = true
  end

  local HELI_OOPS = {
    [2] = "sounds/helicopter/oops1.wav", [4] = "sounds/helicopter/oops2.wav",
    [6] = "sounds/helicopter/huh.wav", [8] = "sounds/helicopter/poop.wav",
    [10] = "sounds/helicopter/idiot.wav",
  }

  local function heli_crash(worm, h, sx, sy)
    if not h.flying then
      return
    end
    local speed = (math.abs(sy) + math.abs(sx)) / 2
    local size = trunc((worm.fuel - 75) / 10 * speed)
    if size < 10 then size = 10 end
    wa.actors.spawn({
      sprite = false, x = worm.x, y = worm.y, owner = worm, explode = { damage = size * 2, id = size, now = true },
    })
    worm.gravity = 1
    worm.wind = 0
    local oops = HELI_OOPS[wa.random(1, 10)]
    if oops then wa.sound.play(worm, oops) end
    h.flying = false
    heli_drop_art(h, worm)
  end

  local function push(v, dir)
    local s = -dir * v
    if s > -1 then s = s - 0.2 end
    if s > -4 then s = s - 0.4 end
    if s > -8 then s = s - 0.15 end
    if s > -10 then s = s - 0.05 end
    return -dir * s
  end

  local function heli_frame(worm)
    local h = helis[worm.id]
    local state = worm.state
    if worm.weapon == "px.helicopter" and state == "prefiring" and not (h and h.flying) then
      h = heli_of(worm)
      h.jumpin, h.armed = true, true
      h.jump_phase = h.jump_phase + 0.047 * own_time.frames(worm)
    end
    if h and h.armed and state == "jetpacking" and not h.flying then
      local fuel = shared.helicopter_fuel or 100
      worm.fuel = fuel == 0 and 1 or fuel -- unlimited: held at 1
      worm.gravity = HELI_REALISTIC and 0.2 or 0
      worm:jetpack_steer(true)
      h.flying, h.launch, h.ticks, h.armed = true, true, 0, false
    elseif h and h.armed and not worm.turn then
      h.armed = false -- the turn ended before it fired
    end
    if not h then
      return
    end
    if h.flying and state ~= "jetpacking" then
      worm:jetpack_steer(false)
      worm.gravity, worm.wind = 1, 0
      h.flying = false
      if state ~= "standing" then
        heli_drop_art(h, worm)
        return
      end
      if h.body then h.body:remove(); h.body = nil end
      h.climb_out, h.jump_phase = true, 1
    end
    if h.flying then
      for i = 1, own_time.frames(worm) do
        local vx, vy = worm.vx, worm.vy
        if vx ~= 0 or vy ~= 0 then
          if h.ticks % 47 == 0 then wa.sound.play(worm, "sounds/helicopter/helicopterloop.wav") end
          local radio = wa.random(1, 200)
          if radio % 20 == 0 and radio <= 80 then
            wa.sound.play(worm, "sounds/helicopter/" .. (radio // 20) .. ".wav")
          end
        end
        h.ticks = h.ticks + 1
        if i == 1 and worm.y >= wa.world.water() then
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
        for _, d in ipairs({ { up, right }, { up, left }, { down, right }, { down, left } }) do
          if d[1] and d[2] then
            vx, vy = vx * 0.99 * 0.99, vy * 0.99 * 0.99
          end
        end
        h.frame = (h.frame + 1) % 3
        local fuel = worm.fuel
        local burn = wa.world.retreat() == 0 and shared.helicopter_fuel ~= 0
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
      end
      if HELI_EXPLODE_ON_TURN_END and not worm.turn then
        heli_crash(worm, h, worm.vx, worm.vy)
        return
      end
    end
    local f = worm.facing
    if h.flying then
      if h.climb then h.climb:remove(); h.climb = nil end
      h.body = h.body or heli_actor(worm, "sprites/helicopter/flying.png")
      local a = h.body
      a.x, a.y, a.vx, a.vy, a.facing = worm.x, worm.y, 0, 0, f
      a:frame(h.frame)
      a:gfx({ angle = math.deg(wa.math.sin(worm.vx / 24)) % 360, depth = HELI_DEPTH })
      worm.body_visible = false
    elseif (h.jumpin and state == "prefiring")
        or (h.climb_out and state == "standing" and h.jump_phase > 0) then
      if h.climb_out then h.jump_phase = h.jump_phase - 0.047 * own_time.frames(worm) end
      h.climb = h.climb or heli_actor(worm, "sprites/helicopter/jumpin.png")
      local a = h.climb
      a.x = worm.x + (f > 0 and -11.5 or 12.5)
      a.y, a.vx, a.vy, a.facing = worm.y + 1, 0, 0, f
      a:frame(math.max(0, math.min(math.floor(h.jump_phase * 23), 22)))
      a:gfx({ depth = HELI_DEPTH })
      worm.body_visible = false
    elseif h.body or h.climb then
      h.climb_out = false
      h.jumpin, h.jump_phase = false, 0
      heli_drop_art(h, worm)
    end
  end

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FRAME_FINISH then
      heli_frame(worm)
    end
  end, { msgs = { wa.msg.FRAME_FINISH } })

  if wa.on.contact then
    wa.on.contact(function(worm, other, c)
      local h = helis[worm.id]
      if h and h.flying and other.kind ~= "mine"
          and (math.abs(c.vx) > 1 or math.abs(c.vy) > 1) then
        heli_crash(worm, h, c.vx, c.vy)
      end
    end)
  end
  end
end

function weapon.configure(ctx, spec)
  local fuel = ctx.option("fuel")
  require("lib/shared").helicopter_fuel = fuel
  spec.jet_pack.fuel = math.min(fuel, 255)
end

return weapon
`
      },
      {
        path: 'weapons/hellish_hand_grenade.lua',
        name: 'weapons/hellish_hand_grenade.lua',
        language: 'lua',
        content: `-- Hellish Hand-Grenade: a holy hand grenade that bursts into spreading fire.

local weapon = {}

weapon.record = {
  missile = {
    bounce = {
      sound = 161,
    },
    burst = "fire",
    explosion = {
      power = 80,
      push_pct = 70,
    },
    explosion_sound = {
      sound = 154,
    },
    fire = {
      burn_time_ms = 1000,
      decay_mode = "at_turn_start",
      spread_delay_ms = 70,
      spread_generations = 75,
    },
    trail = {
      power = 20,
      sprite = 8,
    },
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.holy_grenade",
    name = "Hellish Hand-Grenade",
    panel_icon = "sprites/hellish/hhh_ico.png",
    sprite = "sprites/hellish/grenade.png",
    worm_sprites = {
          weaponlnk = "sprites/hellish/aim.png",
          weaponlnku = "sprites/hellish/aimu.png",
          weaponlnkd = "sprites/hellish/aimd.png",
          wthrow = "sprites/hellish/draw.png",
          wthrowu = "sprites/hellish/drawu.png",
          wthrowd = "sprites/hellish/drawd.png",
        },
  })
end

return weapon
`
      },
      {
        path: 'weapons/homing_air_strike.lua',
        name: 'weapons/homing_air_strike.lua',
        language: 'lua',
        content: `-- Homing Air Strike: click a target; a jet drops five homing missiles that steer for it.

local ART = "sprites/homing_air_strike/"

return {
  defaults = {
    ammo = { round_start = -1 }, -- infinite, so it can be tested at once
    delay = 0,
  },
  install = function()
    wa.weapons.replace({
      wep = "weps/hairstrike_WEAP.wep",
      panel_icon = ART .. "ico_hairstrike.png", -- PX's icon
      sprite = ART .. "flight.png",
      handling = { ends_turn = true },
    })
  end,
}
`
      },
      {
        path: 'weapons/homing_cluster_bomb.lua',
        name: 'weapons/homing_cluster_bomb.lua',
        language: 'lua',
        content: `-- Homing Cluster Bomb: click a target, then throw: a grenade whose blast throws five clustlets that home on the target.

local homing = require("lib/px_homing")
local weapon = {}

local ART = "sprites/homing_cluster/"
local CLUSTLET_SPRITE = 54 -- the stock cluster bit's, which the clustlets fly with

weapon.record = {
  missile = {
    sprite = 0, -- WA draws no round; the art spec draws it
    burst = "nothing",
    explosion = {
      bias = 0,
      power = 30,
      push_pct = 100,
    },
    trail = {
      bubbles_per_second = 0,
      speed = 0,
      sprite = 0,
    },
  },
}

-- PX's clustlet record: no action, it goes off on contact or after 6 seconds.
local CLUSTLET = {
  action = "none",
  sprite = CLUSTLET_SPRITE,
  animation = 2,
  countdown = 0,
  fuse = 6000,
  explode_on_space = false,
  speed_pct = 100,
  wind_pct = 0,
  gravity_pct = 100,
  explosion = { bias = 0, power = 20, push_pct = 100 },
  ends_on_contact = {
    crates = true,
    donor_cards = true,
    land = true,
    objects = true,
    worms = true,
    worms_frozen = true,
  },
}

-- PX's shootMoreMissiles: five clustlets 20 pixels above the blast, fanned over
-- 30 degrees about straight up at 10 pixels/frame, each nudged at random (the
-- middle one less sideways). After 40 frames, with sound 44 just before, they
-- home on the target at 10 for 180 frames, turning 0.15 of the way every other frame.
local CLUSTLETS, LIFT, FAN, SPEED = 5, 20, 30, 10
local MIDDLE = 3 -- the one PX nudges less
local HOME = { speed = 10, turn = 0.15, delay = 40, frames = 180, sound = 44 }

weapon.missile_sprite = {
  { sheet = ART .. "bomb.png", frames = 1, spin = true, hide = true, first_sprite = 0 },
  { sheet = ART .. "clustlet.png", frames = 1, hide = true, first_sprite = CLUSTLET_SPRITE },
}

local clustlets = {} -- missile id -> its homing state
local bursts = {}
local shooter, target
local launching = false -- a burst now is a clustlet's, bursting as WA builds it

local function on_explode(ev)
  local id = ev.missile
  if not id then return end
  if launching or clustlets[id] then
    clustlets[id] = nil
    return
  end
  bursts[#bursts + 1] = { x = ev.x, y = ev.y - LIFT }
end

local function nudge(lo, hi)
  return wa.random(math.floor(lo * 65536), math.floor(hi * 65536)) / 65536
end

function weapon.definition()
  local sdk = require("wf-lib/holds")
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.grenade",
    name = "Homing Cluster Bomb",
    click = "homing",
    panel_icon = ART .. "homing_cluster_ico.png",
    hold_as = "stock.grenade",
    on_explode = on_explode,
    worm_sprites = sdk.PX_POSTURE,
    sprites = { ART .. "bomb.png", ART .. "clustlet.png" },
    hold = {
      thrown = true,
      sheet = ART .. "bomb.png", hand_type = 1, hand_radius = 15, hand_scale = 0.8,
      weap_rotation = 0.5, weap_radius = 9,
      hand = sdk.PX_HANDS[1],
    },
  })
end

function weapon.setup()
  clustlets, bursts, shooter, target, launching = {}, {}, nil, nil, false

  wa.on.missile_frame(function(m)
    local h = m.phase == "post" and clustlets[m.id]
    if h then
      homing.step(m, h)
    elseif m.phase == "pre" and clustlets[m.id] then
      homing.near(m, clustlets[m.id])
    end
  end)

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FIRE_WEAPON and worm.weapon == "px.homing_cluster_bomb" then
      shooter = worm
      local t = worm.target
      target = t and { x = t.x, y = t.y } or nil
      return
    end
    if msg ~= wa.msg.FRAME_FINISH or #bursts == 0 then return end
    local owner = shooter or worm
    local list = bursts
    bursts = {}
    for _, p in ipairs(list) do
      for i = 1, CLUSTLETS do
        local deg = -90 - FAN / 2 + (i - 1) * FAN / (CLUSTLETS - 1)
        local rad = deg * math.pi / 180
        local vx, vy = SPEED * wa.math.cos(rad), SPEED * wa.math.sin(rad)
        if i == MIDDLE then
          vx, vy = vx + nudge(-0.3, 0.3), vy + nudge(-1.7, 1.7)
        else
          vx, vy = vx + nudge(-1.8, 1.8), vy + nudge(-1.7, 1.7)
        end
        launching = true
        local ok, id = pcall(wa.weapons.launch, {
          weapon = "px.homing_cluster_bomb", owner = owner, x = p.x, y = p.y, vx = vx, vy = vy,
          missile = CLUSTLET,
        })
        launching = false
        if ok and id then
          clustlets[id] = homing.new({ x = target and target.x, y = target and target.y,
            speed = HOME.speed, turn = HOME.turn, delay = HOME.delay, frames = HOME.frames,
            sound = HOME.sound, owner = owner })
        end
      end
    end
  end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })
end

return weapon
`
      },
      {
        path: 'weapons/homing_digger.lua',
        name: 'weapons/homing_digger.lua',
        language: 'lua',
        content: `-- Homing Digger: click a target, then throw: a rocket that bursts on contact into a digger that homes on the target through the land.

local on_missile = require("lib/on_missile")
local homing = require("lib/px_homing")
local weapon = {}

local ART = "sprites/homing_digger/"
local SHEET = ART .. "digger.png"

-- The rocket goes off on contact with no blast; its burst is the digger.
weapon.record = {
  missile = {
    sprite = 0, -- WA draws no round; the art spec draws it
    animation = 2,
    burst = "nothing",
    countdown = 0, -- no timer: it goes off on contact, or after PX's default 5 seconds
    fuse = 5000,
    impact_particles = false,
    bounce = {
      bounciness = 70,
      contact_sides = 0,
      max_bounces = 3,
      sound = 0,
      terrain_keep_speed_pct = 120,
      hits = {
        water = true,
        worms_frozen = true,
      },
    },
    ends_on_contact = {
      crates = true,
      donor_cards = true,
      land = true,
      objects = true,
      worms = true,
    },
    explosion = {
      bias = 0,
      power = 0,
      push_pct = 0,
    },
    trail = {
      bubbles_per_second = 0,
      speed = 0,
      sprite = 0,
    },
  },
}

-- What the digger changes in the rocket's record: it goes through land, Space
-- sets it off, and it blasts 50 after five seconds.
local DIGGER = {
  action = "dig",
  countdown = 0,
  fuse = 5000,
  explode_on_space = true,
  explosion = { power = 50, push_pct = 100 },
  ends_on_contact = {
    crates = true,
    donor_cards = true,
    mines = true,
    objects = true,
    worms_frozen = true,
    worms_jumping = true,
    worms_normal = true,
    worms_roping = true,
  },
  dig = { sound = 0, dive_sprite = 50, sprite_1 = 50, sprite_2 = 50, sprite_3 = 50 },
}

-- PX's digger, in pixels/frame: it homes at 13, slows to 3.5 in land, where it
-- drills an 8-pixel hole a frame, and speeds back up by 0.23 a frame to 14 in
-- the air. Every other frame it turns half way towards the target, for 300 frames.
local THROW = 3 -- the rocket's last speed, times this, starts the digger
local HOME_SPEED, DIG_SPEED, AIR_SPEED, AIR_GAIN = 13, 3.5, 14, 0.23
local TURN, HOME_FRAMES = 0.5, 300
local DRILL_RADIUS, DRILL_PROBE = 8, 5
local SOUND_BURST, SOUND_DRILL, SOUND_BLAST = 44, 85, 59
local DRILL_SOUND_FRAMES = 4

weapon.missile_sprite = {
  sheet = SHEET, frames = 1, hide = true, scale = 1.2,
}

local diggers = {} -- missile id -> its homing state
local last = {} -- rocket id -> its last speed over 1 pixel/frame
local pending = {} -- diggers to launch once the rocket's burst is over
local blasts = {} -- where diggers went off: fire to start
local shooter, target
local launching = false -- a burst now is a digger's, bursting as WA builds it

local function on_explode(ev)
  local id = ev.missile
  if not id then return end
  if launching or diggers[id] then
    diggers[id] = nil
    blasts[#blasts + 1] = { x = ev.x, y = ev.y }
    return
  end
  local v = last[id] or { ev.vx or 0, ev.vy or 0 }
  last[id] = nil
  pending[#pending + 1] = { x = ev.x, y = ev.y, vx = v[1] * THROW, vy = v[2] * THROW }
end

local function in_land(m)
  return wa.world.collides({ x = m.x, y = m.y, radius = DRILL_PROBE, with = { "terrain" } })
end

-- Before WA moves it: drill, and set its speed.
local function drill(m, d) -- d: homing's state, plus drill_wait
  if d.drill_wait > 0 then d.drill_wait = d.drill_wait - 1 end
  if in_land(m) then
    d.speed = DIG_SPEED
    if d.drill_wait == 0 then
      if d.owner then wa.sound.play(d.owner, SOUND_DRILL) end
      d.drill_wait = DRILL_SOUND_FRAMES
    end
    wa.land.cut({ x = m.x, y = m.y, shape = "circle", radius = DRILL_RADIUS })
  elseif d.speed < AIR_SPEED then
    d.speed = d.speed + AIR_GAIN
  end
  if homing.near(m, d) then d.drill_wait = 1 end
end

function weapon.definition()
  local sdk = require("wf-lib/holds")
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.grenade",
    name = "Homing Digger",
    click = "homing",
    panel_icon = ART .. "homing_digger_ico.png",
    hold_as = "stock.grenade",
    on_explode = on_explode,
    worm_sprites = sdk.PX_POSTURE,
    sprites = { SHEET },
    hold = {
      thrown = true,
      sheet = SHEET, hand_type = 1, hand_radius = 17, hand_scale = 1,
      weap_rotation = 0.9, weap_radius = 8,
      hand = sdk.PX_HANDS[1],
    },
  })
end

function weapon.setup()
  diggers, last, pending, blasts, shooter, target, launching = {}, {}, {}, {}, nil, nil, false

  on_missile(function(m)
    if m.weapon ~= "px.homing_digger" then return end
    local d = diggers[m.id]
    if not d then
      if m.phase == "post" and math.abs(m.vx) + math.abs(m.vy) > 1 then last[m.id] = { m.vx, m.vy } end
      return
    end
    if m.phase == "pre" then drill(m, d) else homing.step(m, d) end
  end, { weapons = { "px.homing_digger" } })

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FIRE_WEAPON and worm.weapon == "px.homing_digger" then
      shooter = worm
      local t = worm.target
      target = t and { x = t.x, y = t.y } or nil
      return
    end
    if msg ~= wa.msg.FRAME_FINISH then return end
    local owner = shooter or worm
    if #pending > 0 then
      local list = pending
      pending = {}
      for _, p in ipairs(list) do
        if owner then wa.sound.play(owner, SOUND_BURST) end
        launching = true
        local ok, id = pcall(wa.weapons.launch, {
          weapon = "px.homing_digger", owner = owner, x = p.x, y = p.y, vx = p.vx, vy = p.vy,
          missile = DIGGER,
        })
        launching = false
        if ok and id then
          local d = homing.new({ x = target and target.x, y = target and target.y,
            speed = HOME_SPEED, turn = TURN, frames = HOME_FRAMES, owner = owner })
          d.drill_wait = 0
          diggers[id] = d
        end
      end
    end
    if #blasts > 0 then
      for _, b in ipairs(blasts) do
        wa.fire.spawn({ owner = owner, x = b.x, y = b.y, vx = 0, vy = -8, count = 40,
          duration = 4000, up_power = 100, damage = 5 })
        if owner then wa.sound.play(owner, SOUND_BLAST) end
      end
      blasts = {}
    end
  end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })
end

return weapon
`
      },
      {
        path: 'weapons/homing_fire_cluster.lua',
        name: 'weapons/homing_fire_cluster.lua',
        language: 'lua',
        content: `-- Homing Fire Cluster: a thrown grenade that homes on the clicked target and bursts into five fire clustlets.

local weapon = {}

local ART = "sprites/homing_fire_cluster/"
local CLUSTLET_SPRITE = 54 -- the stock cluster bit's, which the clustlets fly with
local CLUSTLETS = 5
local PUSH, DAMAGE = 50, 35 -- the extra blast of each clustlet

weapon.record = {
  missile = {
    sprite = 0, -- WA draws no round; the art spec draws it
    action = "homing",
    animation = 2,
    countdown = 0,
    fuse = 4000,
    burst = "nothing",
    ends_on_contact = {
      crates = true,
      donor_cards = true,
      land = true,
      objects = true,
      water = true,
      worms = true,
      worms_frozen = true,
    },
    explosion = {
      bias = 0,
      push_pct = 75,
    },
    homing = {
      animation = 0,
      arm = 500,
      kind = "lock",
      sprite = 135,
      time = 3000,
      trail = {
        power = 20,
        speed = 100,
        sprite = 116,
      },
    },
  },
}

-- What a clustlet changes in the grenade's record: it bounces as the stock
-- grenade does and bursts into fire after a second.
local CLUSTLET = {
  action = "bounce",
  sprite = CLUSTLET_SPRITE,
  fuse = 1000,
  countdown = 0,
  explosion = { power = 20, bias = 1 },
  trail = { sprite = 131, power = 20, speed = 100 },
  bounce = {
    hits = {
      crates = true,
      donor_cards = true,
      land = true,
      objects = true,
      water = true,
      worms_acting = true,
      worms_frozen = true,
      worms_jumping = true,
      worms_normal = true,
    },
    bounciness = 0,
    terrain_keep_speed_pct = 100,
    sound = 113,
    contact_sides = 8,
    extra_reverse_chance_pct = 0,
    explosion = { bias = 0, push_pct = 0, power = 0, variation = 0 },
    max_bounces = 0,
  },
  burst = "fire",
  fire = {
    spread_generations = 10,
    spread_delay_ms = 30,
    burn_time_ms = 1500,
    decay_mode = "instant",
  },
}

weapon.missile_sprite = {
  { sheet = ART .. "bullet.png", frames = 1, hide = true, first_sprite = 0 },
  { sheet = ART .. "clustlet.png", frames = 1, hide = true, first_sprite = CLUSTLET_SPRITE },
}

local clustlets = {}
local bursts = {}
local blasts = {}
local shooter

local function on_explode(ev)
  local id = ev.missile
  if not id then return end
  if clustlets[id] then
    clustlets[id] = nil
    blasts[#blasts + 1] = { x = ev.x, y = ev.y }
  else
    bursts[#bursts + 1] = { x = ev.x, y = ev.y }
  end
end

function weapon.definition()
  local sdk = require("wf-lib/holds")
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.grenade",
    name = "Homing Fire Cluster",
    panel_icon = ART .. "homing_fire_cluster_ico.png",
    hold_as = "stock.grenade",
    on_explode = on_explode,
    worm_sprites = sdk.PX_POSTURE,
    sprites = { ART .. "bullet.png", ART .. "clustlet.png" },
    params = { gpu_prefix = ART },
    hold = {
      thrown = true,
      sheet = ART .. "bullet.png", hand_type = 1, hand_radius = 17,
      hand_scale = 0.8, weap_rotation = -0.5, weap_radius = 9,
      hand = sdk.PX_HANDS[1],
    },
  })
end

function weapon.setup()
  clustlets, bursts, blasts, shooter = {}, {}, {}, nil

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FIRE_WEAPON and worm.weapon == "px.homing_fire_cluster" then
      shooter = worm
      return
    end
    if msg ~= wa.msg.FRAME_FINISH then return end
    local owner = shooter or worm
    for _, p in ipairs(bursts) do
      for _ = 1, CLUSTLETS do
        local vx = wa.random(-196608, 196608) / 65536
        local vy = wa.random(-655360, -458752) / 65536
        local id = wa.weapons.launch({
          weapon = "px.homing_fire_cluster", owner = owner, x = p.x, y = p.y, vx = vx, vy = vy,
          missile = CLUSTLET,
        })
        if id then clustlets[id] = true end
      end
    end
    bursts = {}
    for _, p in ipairs(blasts) do
      local a = wa.actors.spawn({ sprite = false, x = p.x, y = p.y,
        owner = owner, on = function() end })
      a:explode({ id = PUSH, damage = DAMAGE, below = false })
      a:remove()
    end
    blasts = {}
  end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })
end

return weapon
`
      },
      {
        path: 'weapons/hot_air_balloon.lua',
        name: 'weapons/hot_air_balloon.lua',
        language: 'lua',
        content: `-- Hot Air Balloon: a balloon that carries the worm up and with the wind; Space pops it.

local weapon = {}

weapon.record = {
  fires = {
    subtype = 12,
  },
  handling = {
    retreat = -1,
  },
  parachute = {
    wind_pct = 100,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.bungee",
    name = "Hot Air Balloon",
    panel_icon = "sprites/balloon/balloon_icon.png",
    sprites = { "sprites/balloon/balloon.png", "sprites/balloon/basket.png" },
        sounds = {
          "sounds/balloon/inflate1.wav", "sounds/balloon/inflate2.wav", "sounds/balloon/inflate3.wav",
          "sounds/balloon/pop1.wav", "sounds/balloon/pop2.wav", "sounds/balloon/pop3.wav",
          "sounds/balloon/pop4.wav",
        },
    params = {
      gpu_prefix = "sprites/balloon/",
      worm_art = { "sprites/balloon/basket.png" },
    },
  })
end

function weapon.setup()
  local shared = require("lib/shared")
  local own_time = require("wf-lib/own_time")
  local parachute = require("lib/parachute")
  parachute.setup()
  shared.balloons = shared.balloons or {}
  local balloons = shared.balloons

  do

    local BALLOON_DAMP = 0.79998779296875 -- WA's parachute damping, 0.8
    local BALLOON_WIND = 100 -- the patched bungee's fire_method, in percent
    local BALLOON_DEPTH = wa.depth.FRONT + 1 -- behind the basket, in front of worms
    local BASKET_DEPTH = wa.depth.FRONT
    local TEAM_RGB = { 0xFF8080, 0x0096FF, 0x00D000, 0xFFFF40, 0xE800E8, 0x50FFFF }

    local function balloon_of(worm)
      local b = balloons[worm.id]
      if not b then
        b = { active = false, ticks = 0 }
        balloons[worm.id] = b
      end
      return b
    end

    local function balloon_sound(worm, name, n)
      wa.sound.play(worm, "sounds/balloon/" .. name .. wa.random(1, n) .. ".wav")
    end

    local BALLOON_UNSTAND = 3

    local function balloon_stop(worm, b, why, against_land)
      if not b.active then
        return
      end
      wa.log(string.format(
        "highlander: balloon of worm %d popped after %d frames: %s (turn clock %d ms)",
        worm.id, b.ticks, why, wa.world.turn_clock()
      ))
      b.active, b.ticks = false, 0
      if b.balloon then b.balloon:remove(); b.balloon = nil end
      if b.basket then b.basket:remove(); b.basket = nil end
      worm.body_visible = true
      balloon_sound(worm, "pop", 4)
      local vy = against_land and math.max(b.vy, 0) or b.vy
      if worm.taken then
        worm:release(b.vx, vy)
      end
      b.unstand = against_land and BALLOON_UNSTAND or nil
    end

    local function balloon_draw(worm, b)
      local f = worm.facing
      local function art(sheet)
        local a = wa.actors.spawn({
          sprite = sheet, x = b.x, y = b.y, owner = worm, visibility = worm, on = function() end,
        })
        a:gfx({ follow = worm })
        return a
      end
      b.balloon = b.balloon or art("sprites/balloon/balloon.png")
      if not b.basket then
        b.basket = art("sprites/balloon/basket.png")
        b.basket:gfx({ glow_of = worm })
      end
      local x = b.x + 6 * f
      b.balloon.x, b.balloon.y, b.balloon.vx, b.balloon.vy = x, b.y - 43, 0, 0
      b.balloon:frame((b.ticks % 200) * 30 // 200)
      b.balloon:gfx({ tint = 0xFF000000 | (TEAM_RGB[(worm.alliance or 0) + 1] or 0xFFFFFF),
        depth = BALLOON_DEPTH })
      b.basket.x, b.basket.y, b.basket.vx, b.basket.vy = x, b.y + 3, 0, 0
      b.basket.facing = -f
      b.basket:frame((b.ticks % 80) * 32 // 80)
      b.basket:gfx({ depth = BASKET_DEPTH })
      worm.body_visible = false
    end

    local function balloon_frame(worm)
      local b = balloon_of(worm)
      local state = worm.state
      local equipped = b.equipped_weapon
      local fired = parachute.fired(worm, "px.hot_air_balloon")
      if not b.active and (fired or state == "parachuting" and not b.was_parachuting
          and equipped == "px.hot_air_balloon") then
        b.active, b.ticks = true, 0
        b.x, b.y, b.vx, b.vy = worm.x, worm.y, worm.vx, worm.vy
        worm:take{ turn = "run", fire = true }
        balloon_sound(worm, "inflate", 3)
      end
      b.was_parachuting = state == "parachuting"
      if state ~= "parachuting" then b.equipped_weapon = worm.weapon end
      if b.unstand then
        if state == "standing" then
          worm:release(0, 0)
          b.unstand = nil
        else
          b.unstand = b.unstand > 1 and b.unstand - 1 or nil
        end
      end
      if not b.active then
        return
      end
      if not worm.taken then
        balloon_stop(worm, b, "the engine let go (turn over, knocked flying or teleporting)")
        return
      end
      if state ~= "parachuting" then
        balloon_stop(worm, b, "WA closed its parachute (" .. tostring(state) .. ")", true)
        return
      end
      local k = worm.keys or {}
      local left, right, up, down = k.left, k.right, k.up, k.down
      if left and right then left, right = false, false end
      if up and down then up, down = false, false end
      for i = 1, own_time.frames(worm) do
        local vx, vy = b.vx, b.vy
        local g = wa.world.gravity()
        local push = g / 2
        vx = vx + (right and push or 0) - (left and push or 0)
        vy = vy + (down and push or 0) - (up and push or 0)
        vy = vy - g * worm.gravity
        local side = wa.world.wind() >= 0 and 1 or -1
        if worm:fits(b.x + side, b.y) then
          vx = vx + wa.world.wind() * (BALLOON_WIND / 100)
        end
        vx, vy = vx * BALLOON_DAMP, vy * BALLOON_DAMP
        b.vx, b.vy = vx, vy
        local x, y = b.x + vx, b.y + vy
        if not worm:fits(x, y) then
          if vy > 0 and not worm:fits(b.x, y) then
            if i > 1 then worm.x, worm.y = b.x, b.y end
            balloon_stop(worm, b, "landed", true)
            return
          end
          if worm:fits(x, b.y) then
            y, vy = b.y, 0
          elseif worm:fits(b.x, y) then
            x, vx = b.x, 0
          else
            x, y, vx, vy = b.x, b.y, 0, 0
          end
          b.vx, b.vy = vx, vy
        end
        if y >= wa.world.water() then
          if i > 1 then worm.x, worm.y = b.x, b.y end
          balloon_stop(worm, b, "reached the water")
          return
        end
        b.x, b.y = x, y
        b.ticks = b.ticks + 1
      end
      worm:carry(b.x, b.y)
      balloon_draw(worm, b)
    end

    local BALLOON_KEY_MESSAGES = {
      [wa.msg.JUMP] = "jump", [wa.msg.JUMP_UP] = "backflip",
      [wa.msg.FIRE_WEAPON] = "fire", [wa.msg.RELEASE_WEAPON] = "release",
    }

    wa.on.worm_message(function(worm, msg)
      if msg == wa.msg.FRAME_FINISH then
        balloon_frame(worm)
        return
      end
      local b = balloons[worm.id]
      if not (b and b.active) then
        return
      end
      local key = BALLOON_KEY_MESSAGES[msg]
      if key then
        wa.log(string.format("highlander: balloon of worm %d got WA's %s message at flight frame %d",
          worm.id, key, b.ticks))
      end
      if msg == wa.msg.JUMP then
        balloon_stop(worm, b, "jump key (Space in flight)")
        return "eat"
      end
      if msg == wa.msg.FIRE_WEAPON and worm.weapon == "px.super_drill" then
        wa.sound.play(worm, 120) -- WA's can't-fire
        return "eat"
      end
    end, { msgs = { wa.msg.FRAME_FINISH, wa.msg.JUMP, wa.msg.JUMP_UP, wa.msg.FIRE_WEAPON, wa.msg.RELEASE_WEAPON } })

    wa.on.turn_start(function()
      for _, worm in ipairs(wa.worms.all()) do
        local b = balloons[worm.id]
        if b and b.active then
          balloon_stop(worm, b, "a new turn began")
        end
      end
    end)
  end
end

return weapon
`
      },
      {
        path: 'weapons/ice_arrow.lua',
        name: 'weapons/ice_arrow.lua',
        language: 'lua',
        content: `-- Ice Arrow: an arrow that freezes the worm it hits.

local weapon = {}

weapon.record = {
  handling = {
    remember_selection = true,
    ends_turn = true,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    wep = "weps/armageddon.wep",
    panel_icon = "sprites/ice_arrow/icon.png",
    worm_sprites = {
      wbowlnk = "sprites/ice_arrow/wbowlnk.png",
      wbowlnku = "sprites/ice_arrow/wbowlnku.png",
      wbowlnkd = "sprites/ice_arrow/wbowlnkd.png",
      wbowbk2 = "sprites/ice_arrow/wbowbk2.png",
      wbowbk2u = "sprites/ice_arrow/wbowbk2u.png",
      wbowbk2d = "sprites/ice_arrow/wbowbk2d.png",
      wbow = "sprites/ice_arrow/wbow.png",
      wbowu = "sprites/ice_arrow/wbowu.png",
      wbowd = "sprites/ice_arrow/wbowd.png",
      wbowp = "sprites/ice_arrow/wbowp.png",
      wbowpu = "sprites/ice_arrow/wbowpu.png",
      wbowpd = "sprites/ice_arrow/wbowpd.png",
      wbowf = "sprites/ice_arrow/wbowf.png",
      wbowfu = "sprites/ice_arrow/wbowfu.png",
      wbowfd = "sprites/ice_arrow/wbowfd.png",
    },
  })
end

function weapon.setup()
  local shared = require("lib/shared")
  local pending = {} -- stable worm id -> freeze on that worm's next frame

  wa.on.hurt(function(hit)
    if hit.phase == "post" and hit.source_weapon == "px.ice_arrow"
      and hit.kind == "arrow" then
      pending[hit.worm.id] = true
    end
  end)

  wa.on.worm_message(function(worm)
    if pending[worm.id] then
      pending[worm.id] = nil
      worm:freeze()
    end
  end, { msgs = { wa.msg.FRAME_FINISH } })
end

return weapon
`
      },
      {
        path: 'weapons/igniter.lua',
        name: 'weapons/igniter.lua',
        language: 'lua',
        content: `-- Igniter: a gun whose bullet bursts into fire where it hits.

local weapon = {}

weapon.record = {
  fires = {
    subtype = 3,
  },
  handling = {
    remember_selection = true,
  },
  missile = {
    action = "bounce",
    animation = 2,
    bounce = {
      bounciness = 1,
      contact_sides = 8,
      explosion = {
        bias = 0,
        power = 0,
        push_pct = 0,
        variation = 0,
      },
      extra_reverse_chance_pct = 0,
      hits = {
        water = true,
      },
      sound = 0,
      terrain_keep_speed_pct = 0,
    },
    burst = "fire",
    explosion = {
      bias = 0,
    },
    fire = {
      burn_time_ms = 1000,
      decay_mode = "at_turn_start",
      spread_delay_ms = 150,
      spread_generations = 75,
    },
    fuse = 9000,
    trail = {
      speed = 0,
    },
  },
}

weapon.missile_sprite = { -- Igniter (igniter_anim: igniter_bullet, 16 frames)
    sheet = "sprites/igniter/flight.png", animate = true, anim_speed = 1.0, frames = 16,
  }

function weapon.definition()
  local shared = require("lib/shared")
  local fires = shared.fires
  local sdk = require("wf-lib/holds")
  local PX_POSTURE, PX_HANDS = sdk.PX_POSTURE, sdk.PX_HANDS
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.homing_missile",
    name = "Igniter",
    panel_icon = "sprites/igniter/igniter_ico.png",
    worm_sprites = PX_POSTURE,
    sprites = {
          "sprites/px_hold/igniter.png", "sprites/igniter/flight.png",
        },
    params = { gpu_prefix = "sprites/" },
    hold = { -- Igniter (igniter_anim)
        keep_while_firing = true,
        sheet = "sprites/px_hold/igniter.png", hand_type = 2, hand_radius = -6.0,
        hand_rotation = 1.0, hand_radial_rotation = 0.9, hand_scale = 0.8,
        weap_rotation = 1.0, weap_radial_rotation = 0.0, weap_radius = 0.0,
        hand = PX_HANDS[2],
    },
  })
end

return weapon
`
      },
      {
        path: 'weapons/index.lua',
        name: 'weapons/index.lua',
        language: 'lua',
        content: `-- Weapon IDs and their owning modules.

return {
  ["px.3_girder_pack"] = "weapons/3_girder_pack",
  ["px.anti_fall_damage"] = "weapons/anti_fall_damage",
  ["px.auto_ballista"] = "weapons/auto_ballista",
  ["px.banana_express"] = "weapons/banana_express",
  ["px.blaster_worm"] = "weapons/blaster_worm",
  ["px.bowling_ball"] = "weapons/bowling_ball_single",
  ["px.bowling_ball_strike"] = "weapons/bowling_ball",
  ["px.burning_sheep_launcher"] = "weapons/burning_sheep_launcher",
  ["px.burst_rifle"] = "weapons/burst_rifle",
  ["px.chilli_bomb"] = "weapons/chilli_bomb",
  ["px.cow_launcher"] = "weapons/cow_launcher",
  ["px.crate_strike"] = "weapons/crate_strike",
  ["px.double_bazooka"] = "weapons/double_bazooka",
  ["px.electric_grenade"] = "weapons/electric_grenade",
  ["px.electromagnet"] = "weapons/electromagnet",
  ["px.ferret"] = "weapons/ferret",
  ["px.fire_jump"] = "weapons/fire_jump",
  ["px.flame_turret"] = "weapons/flame_turret",
  ["px.ghost_sheep"] = "weapons/ghost_sheep",
  ["px.girder_launcher"] = "weapons/girder_launcher",
  ["px.platform"] = "weapons/platform",
  ["px.parkour"] = "weapons/parkour",
  ["px.sacrifice"] = "weapons/sacrifice",
  ["px.drilling_crew"] = "weapons/drilling_crew",
  ["px.tazer"] = "weapons/tazer",
  ["px.gatling_gun"] = "weapons/gatling_gun",
  ["px.gravity_control"] = "weapons/gravity_control",
  ["px.gravler"] = "weapons/gravler",
  ["px.gravler_strike"] = "weapons/gravler_strike",
  ["px.hang_glider"] = "weapons/hang_glider",
  ["px.wings"] = "weapons/wings",
  ["px.helicopter"] = "weapons/helicopter",
  ["px.hellish_hand_grenade"] = "weapons/hellish_hand_grenade",
  ["px.hot_air_balloon"] = "weapons/hot_air_balloon",
  ["px.ice_arrow"] = "weapons/ice_arrow",
  ["px.homing_fire_cluster"] = "weapons/homing_fire_cluster",
  ["px.fire_cluster_bomb"] = "weapons/fire_cluster_bomb",
  ["px.digging_cluster_bomb"] = "weapons/digging_cluster_bomb",
  ["px.homing_digger"] = "weapons/homing_digger",
  ["px.homing_cluster_bomb"] = "weapons/homing_cluster_bomb",
  ["px.ninja_bomb"] = "weapons/ninja_bomb",
  ["px.telenade"] = "weapons/telenade",
  ["px.igniter"] = "weapons/igniter",
  ["px.javelin"] = "weapons/javelin",
  ["px.jump"] = "weapons/jump",
  ["px.kamikaze_rocket"] = "weapons/kamikaze_rocket",
  ["px.laser_gun"] = "weapons/laser_gun",
  ["px.lightning_strike"] = "weapons/lightning_strike",
  ["px.mines_gun"] = "weapons/mines_gun",
  ["px.mine_turret"] = "weapons/mine_turret",
  ["px.mortar_strike"] = "weapons/mortar_strike",
  ["px.nuke_rocket"] = "weapons/nuke_rocket",
  ["px.old_woman_launcher"] = "weapons/old_woman_launcher",
  ["px.petrol_turret"] = "weapons/petrol_turret",
  ["px.pigeon_strike"] = "weapons/pigeon_strike",
  ["px.pogo_sheep"] = "weapons/pogo_sheep",
  ["px.portal_gun"] = "weapons/portal_gun",
  ["px.real_shotgun"] = "weapons/real_shotgun",
  ["px.reinforcement"] = "weapons/reinforcement",
  ["px.remote_roller"] = "weapons/remote_roller",
  ["px.s_m_a_r_t_bomb"] = "weapons/s_m_a_r_t_bomb",
  ["px.sentry_gun"] = "weapons/sentry_gun",
  ["px.sentry_laser"] = "weapons/sentry_laser",
  ["px.shadow_bolt"] = "weapons/shadow_bolt",
  ["px.skip_go_surrender"] = "weapons/skip_go_surrender",
  ["px.sniper_rifle"] = "weapons/sniper_rifle",
  ["px.sticky_bomb"] = "weapons/sticky_bomb",
  ["px.submarine_attack"] = "weapons/submarine_attack",
  ["px.super_drill"] = "weapons/super_drill",
  ["px.super_gravedigger"] = "weapons/super_gravedigger",
  ["px.super_tele"] = "weapons/super_tele",
  ["px.swim_suit"] = "weapons/swim_suit",
  ["px.thumper_nade"] = "weapons/thumper_nade",
  ["px.toxic_grenade"] = "weapons/toxic_grenade",
  ["px.bulldozer"] = "weapons/bulldozer",
  ["px.barrel_launcher"] = "weapons/barrel_launcher",
  ["px.trampoline"] = "weapons/trampoline",
  ["px.mine_launcher"] = "weapons/mine_launcher",
  ["px.gravity_gun"] = "weapons/gravity_gun",
  ["px.personal_invisibility"] = "weapons/personal_invisibility",
  ["px.small_worm"] = "weapons/small_worm",
  ["px.thrown_dynamite"] = "weapons/thrown_dynamite",
  ["px.tnt"] = "weapons/tnt",
  ["px.tele_arrow"] = "weapons/tele_arrow",
  ["px.thumper_nade_strike"] = "weapons/thumper_nade_strike",
  ["px.valyrian_fire"] = "weapons/valyrian_fire",
  ["px.weapon_crate"] = "weapons/weapon_crate",
  ["px.wind_changer"] = "weapons/wind_changer",
  ["px.windy_cluster"] = "weapons/windy_cluster",
}
`
      },
      {
        path: 'weapons/javelin.lua',
        name: 'weapons/javelin.lua',
        language: 'lua',
        content: `-- Javelin: pierces the first worm or object it hits, or sticks in the land as terrain.

local on_missile = require("lib/on_missile")
local weapon = {}

weapon.record = {
  handling = {
    remember_selection = true,
    ends_turn = true,
  },
}

weapon.missile_sprite = {
    sheet = "sprites/javelin/flight.png", hide = true,
    animate = true, anim_speed = 1.90, frames = 12,
  }

function weapon.definition()
  local shared = require("lib/shared")
  local fires = shared.fires
  local sdk = require("wf-lib/holds")
  local PX_POSTURE = sdk.PX_POSTURE
  return require("lib/weapon").merge(weapon.record, {
    wep = "weps/prod.wep",
    panel_icon = "sprites/javelin/icon.png",
    missile = { sprite = 0 }, -- WA draws no round; the art spec draws it
    worm_sprites = PX_POSTURE,
    sprites = { "sprites/javelin/hold.png", "sprites/javelin/flight.png", "sprites/javelin/stamp.png" },
    sounds = { "sounds/javelin_impact.wav" },
    params = { gpu_prefix = "sprites/javelin/" },
    on_fire = function(ev) fires.javelin_launch(ev) end,
    on_explode = function(ev) fires.javelin(ev) end,
    hold = {
        thrown = true,
        sheet = "sprites/javelin/hold.png", draw_hand = false,
        hand_radius = 0, hand_rotation = 0, hand_radial_rotation = 0,
        weap_radial_rotation = 0, weap_rotation = 1, weap_radius = -11.8,
        animate = true, anim_speed = 1.25, frames = 12,
      },
  })
end

function weapon.setup()
  local shared = require("lib/shared")
  local current_worm = shared.current_worm
  local fires = shared.fires
  local turrets = require("lib/turret")
  local stuck_stamp = require("lib/stuck_stamp")

  do
    local speed = {}
    local launching
    fires.javelin_launch = function(ev)
      local flight = { ev.vx, ev.vy, shooter = ev.worm.id }
      local previous = launching
      launching = flight
      local ok, id = pcall(wa.weapons.launch, {
        weapon = "px.javelin", owner = ev.worm,
        x = ev.x, y = ev.y, vx = ev.vx, vy = ev.vy,
      })
      launching = previous
      if not ok then error(id) end
      if id and not flight.exploded then speed[id] = flight end
    end
    on_missile(function(m)
      if m.weapon == "px.javelin" then
        local flight = speed[m.id]
        if not flight then
          local shooter = current_worm()
          flight = { shooter = shooter and shooter.id }
          speed[m.id] = flight
        end
        flight[1], flight[2], flight.id = m.vx, m.vy, m.id
      end
    end, { weapons = { "px.javelin" } })

    local JAVELIN_BURIED = { soften = 3, blend = "mix" }

    local function trunc(n) return n < 0 and math.ceil(n) or math.floor(n) end
    local function orientation(vx, vy)
      if vx == 0 then return vy > 0 and 16 or 0 end
      if vy == 0 then return vx > 0 and 8 or 24 end
      if vx > 0 and vy < 0 then return math.min(trunc(3 * vx / -vy), 7) end
      if vx > 0 then return math.min(trunc(8 + 3 * vy / vx), 15) end
      if vy > 0 then return math.min(trunc(16 + 3 * -vx / vy), 23) end
      return math.min(trunc(24 + 3 * -vy / -vx), 31)
    end
    local function within(o, x, y, r)
      return o and math.abs(x - o.x) < r and math.abs(y - o.y) < r
    end

    local SPEAR = { half_length = 20, half_width = 4 }
    local CRATE_REACH = 24
    fires.javelin = function(ev)
      local v = (ev.missile and speed[ev.missile]) or launching
      if ev.missile then speed[ev.missile] = nil end
      if v then v.exploded = true end
      local vx, vy = v and v[1] or 0, v and v[2] or 0
      local active = current_worm()
      local shooter_id = v and v.shooter or (active and active.id)
      local target
      for _, o in ipairs(wa.world.electrical_nearby(ev.x, ev.y, 29, false)) do
        if (o.kind == "worm" or o.kind == "mine" or o.kind == "crate" or o.kind == "oil")
          and (o.kind ~= "worm" or o.id ~= shooter_id)
          and within(o, ev.x, ev.y, 20) then target = o; break end
      end
      if not target then
        for _, o in ipairs(wa.world.electrical_nearby(ev.x, ev.y, 29, false)) do
          if o.kind == "crate" and within(o, ev.x, ev.y, CRATE_REACH) then target = o; break end
        end
      end
      if not target then
        local sentry = turrets.projectile_target(ev.x, ev.y)
        if sentry and turrets.projectile_hit(sentry, 20, vx / 4, vy / 4, v and v.id) then return end
      end
      local frame = orientation(vx, vy)
      local sx, sy, deeper
      if not target then
        sx, sy, deeper = stuck_stamp.place(ev.x, ev.y, frame, SPEAR)
        if not sx then
          target = sy
          wa.log(string.format("Javelin: no stuck spear at (%.1f,%.1f) clears worm %d; it is hit",
            ev.x, ev.y, target.id))
        elseif deeper > 0 then
          wa.log(string.format("Javelin: stuck %dpx deeper at (%.1f,%.1f) to clear the worms", deeper, ev.x, ev.y))
        end
      end
      if target then
        target.vx, target.vy = vx / 4, vy / 4
        if target.kind == "worm" then target:hit(20)
        else target:hit(20, vx / 2, vy / 2, "bullet") end
        return
      end
      wa.land.stamp{
        sprite = "sprites/javelin/stamp.png", frame = frame, x = sx, y = sy,
        buried = JAVELIN_BURIED,
      }
      local shooter = current_worm()
      if shooter then wa.sound.play(shooter, "sounds/javelin_impact.wav") end
    end
  end
end

return weapon
`
      },
      {
        path: 'weapons/jump.lua',
        name: 'weapons/jump.lua',
        language: 'lua',
        content: `-- Jump: the worm itself is launched along the aim with the shot's power.

local weapon = {}

weapon.record = {
  fires = {
    creates_projectile = true,
    method = 3,
    subtype = 2,
    type = 1,
  },
  handling = {
    retreat = 3000,
  },
  missile = {
    action = "bounce",
    alarm_worms = true,
    animation = 1,
    bounce = {
      contact_sides = 8,
      hits = {
        crates = true,
        donor_cards = true,
        land = true,
        objects = true,
        water = true,
        worms_acting = true,
        worms_frozen = true,
        worms_jumping = true,
        worms_normal = true,
      },
      sound = 113,
      terrain_keep_speed_pct = 100,
    },
    collision_shape = 2,
    countdown = 5000,
    explosion = {
      bias = 10,
      power = 50,
      push_pct = 100,
    },
    gravity_pct = 100,
    speed_pct = 100,
    sprite = 50,
    trail = {
      bubbles_per_second = 12.5,
      speed = 100,
      sprite = 131,
    },
  },
}

function weapon.definition()
  local shared = require("lib/shared")
  local fires = shared.fires
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.ninja_rope",
    name = "Jump",
    panel_icon = "sprites/jump/jumpic.png",
    worm_sprites = {
          weaponlnk = "sprites/jump/aim.png", weaponlnku = "sprites/jump/aimu.png",
          weaponlnkd = "sprites/jump/aimd.png",
        },
    on_fire = function(fire) fires.jump(fire) end,
  })
end

function weapon.setup()
  local shared = require("lib/shared")
  local fires = shared.fires

  do

  local JUMP_SPEECH, SPEECH_LINES = 150, 54

  fires.jump = function(fire)
    local worm = fire.worm
    worm:release(fire.vx, fire.vy)
    wa.sound.play(worm, JUMP_SPEECH + SPEECH_LINES * (worm.team - 1))
  end
  end
end

return weapon
`
      },
      {
        path: 'weapons/kamikaze_rocket.lua',
        name: 'weapons/kamikaze_rocket.lua',
        language: 'lua',
        content: `-- Kamikaze Rocket: Ctrl + Space turns the worm into a steerable rocket for four seconds.

local weapon = {}

weapon.record = {
  handling = {
    ends_turn = true,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    wep = "weps/suicide_bomber.wep",
    panel_icon = "sprites/kamikaze_rocket/icon.png",
        worm_sprites = {
          wkamlnk = "sprites/kamikaze_rocket/take_out.png", wkamlnku = "sprites/kamikaze_rocket/take_out.png",
          wkamlnkd = "sprites/kamikaze_rocket/take_out.png", wkamjmp = "sprites/kamikaze_rocket/launch.png",
        },
    sprites = { "sprites/kamikaze_rocket/fly.png" },
    params = { gpu_prefix = "sprites/kamikaze_rocket/" },
  })
end

function weapon.setup()
  local shared = require("lib/shared")
  local SPEED = 8 -- px a frame (kRocketSpeed)
  local TURN = 0.05 -- PX angle units (times pi) a frame
  local LIFE = 4000 -- ms, less 20 a frame: 200 frames
  local HOLE = 8 -- MakeHole each frame
  local BOOM = { damage = 30, id = 100 }
  local STALE = 200 -- other worms' frames without one of its own
  local FLY = "sprites/kamikaze_rocket/fly.png"
  local FLY_FRAMES, FLY_HALF_W, FLY_HALF_H = 5, 30, 40
  local DEPTH = wa.depth.FRONT

  local rockets = {} -- worm id -> its rocket
  local armed = {}

  local function launch(worm)
    rockets[worm.id] = {
      worm = worm,
      x = worm.x, y = worm.y, angle = worm.aim * worm.facing, life = LIFE, age = 0,
      facing = worm.facing, stale = 0,
    }
    worm.visible = false
  end

  local function finish(worm)
    rockets[worm.id] = nil
    worm.visible = true
  end

  local function fly(worm, r)
    local keys = wa.world.keys()
    if keys.left then r.angle = r.angle + TURN end
    if keys.right then r.angle = r.angle - TURN end
    local a = r.angle * math.pi
    r.vx, r.vy = SPEED * wa.math.sin(a), SPEED * wa.math.cos(a)
    r.x = r.x + r.vx
    r.y = r.y + r.vy
    worm.x, worm.y = r.x, r.y
    r.age = r.age + 1
    r.life = r.life - 20
    if r.life <= 0 then
      local boom = wa.actors.spawn({
        sprite = false, x = r.x, y = r.y, owner = worm,
        on = function() end,
      })
      boom:explode(BOOM)
      boom:remove()
      worm.x, worm.y = -2500, wa.world.water() + 1000
      r.done = true
      return
    end
    wa.land.cut({ x = r.x, y = r.y, shape = "circle", radius = HOLE })
  end

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FIRE_WEAPON then
      if worm.weapon ~= "px.kamikaze_rocket" then return end
      if not wa.world.keys().ctrl then
        require("lib/weapon_hint").notice(worm, "Hold Ctrl and press Space\\nto use the Kamikaze Rocket.")
        return "eat"
      end
      armed[worm.id] = true
      return
    end
    for id, other in pairs(rockets) do
      if id ~= worm.id then
        other.stale = other.stale + 1
        if other.stale > STALE then rockets[id] = nil end
      end
    end
    local r = rockets[worm.id]
    if r then r.stale = 0 end
    if worm.state == "kamikaze" then
      if not r and armed[worm.id] then
        armed[worm.id] = nil
        launch(worm)
        r = rockets[worm.id]
      end
      if r and not r.done then fly(worm, r) end
    elseif r then
      finish(worm)
    end
  end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })

  wa.on.turn_start(function()
    armed = {}
  end)

  if wa.on.hud then
    wa.on.hud(function()
      for _, id in ipairs(wa.sorted(rockets)) do
        local r = rockets[id]
        if not r.done then
          wa.hud.line(string.format("Kamikaze Rocket: %.2f", math.max(0, r.life) / 1000))
        end
      end
    end)
  end

  if wa.on.draw and wa.draw.quad then
    local QUAD = { sprite = FLY, blend = "alpha", color = 0xFFFFFFFF, depth = DEPTH,
      points = { { 0, 0 }, { 0, 0 }, { 0, 0 }, { 0, 0 } } }
    local CORNERS = { { -1, -1 }, { 1, -1 }, { 1, 1 }, { -1, 1 } }
    wa.on.draw(function()
      for _, id in ipairs(wa.sorted(rockets)) do
        local r = rockets[id]
        if not r.done then
          QUAD.visibility = r.worm
          local t = -r.angle * math.pi
          local c, s = wa.math.cos(t), wa.math.sin(t)
          local flip = r.facing > 0 and -1 or 1
          QUAD.frame = (r.age // 10) % FLY_FRAMES
          for i, k in ipairs(CORNERS) do
            local dx, dy = k[1] * flip * FLY_HALF_W, k[2] * FLY_HALF_H
            QUAD.points[i][1] = r.x + (dx * c - dy * s)
            QUAD.points[i][2] = r.y + (dx * s + dy * c)
          end
          wa.draw.quad(QUAD)
        end
      end
    end)
  end

  shared.kamikaze_rockets = rockets -- for the Highlander mock
end

return weapon
`
      },
      {
        path: 'weapons/laser_gun.lua',
        name: 'weapons/laser_gun.lua',
        language: 'lua',
        content: `-- Laser Gun: fires a beam that burns and cuts along the aim for five seconds.

local weapon = {}

weapon.record = {
  handling = {
    remember_selection = true,
    ends_turn = true,
  },
}

function weapon.definition()
  local shared = require("lib/shared")
  local fires = shared.fires
  return require("lib/weapon").merge(weapon.record, {
    wep = "weps/uzi.wep",
    panel_icon = "sprites/laser_gun/ico_lasergun.png",
    worm_sprites = {
          weaponlnk = "sprites/laser_gun/aim.png", weaponlnku = "sprites/laser_gun/aimu.png",
          weaponlnkd = "sprites/laser_gun/aimd.png",
          wthrow = "sprites/laser_gun/draw.png", wthrowu = "sprites/laser_gun/drawu.png",
          wthrowd = "sprites/laser_gun/drawd.png",
        },
    sprites = { "sprites/laser_gun/laser_beam.png", "sprites/laser_gun/laser_glow.png" },
    sounds = {
          "sounds/laser_gun/laser_start.wav", "sounds/laser_gun/laser_loop.wav",
          "sounds/laser_gun/laser_end.wav",
        },
    params = { gpu_prefix = "sprites/laser_gun/" },
    on_fire = function(fire) fires.laser(fire) end,
  })
end

function weapon.setup()
  local function sq(v) return v * v end

  local shared = require("lib/shared")
  local laser = require("lib/laser")
  local fires = shared.fires

  do
    local LASER_LIFE = 250
    local LASER_REACH = 2048
    local LASER_LOOP_FRAMES = 51 -- laser_loop.wav is 1.02 s
    local LASER_STOPS = { standing = true, falling = true, jetpacking = true, parachuting = true,
      bungee = true, tumbling = true, teleporting = true, drilling = true, punching = true }
    local lasers = {} -- worm id -> the beam

    local laser_between, laser_particle = laser.between, laser.particle

    local function laser_aim(r, w)
      local ang = (1 - w.aim) * math.pi
      if w.facing < 0 then ang = 2 * math.pi - ang end
      r.dx, r.dy = wa.math.sin(ang), -wa.math.cos(ang)
      r.x = w.x + (2 * w.facing * r.dy - r.dx)
      r.y = w.y + (-2 - r.dy)
      r.gx = r.x + (24 * r.dx)
      r.gy = r.y + (24 * r.dy)
    end

    local function laser_sparks(r, n, v0, v1, s0, s1)
      local base = (1 - r.aim) * math.pi
      if r.facing < 0 then base = 2 * math.pi - base end
      for _ = 1, n do
        local ang = base + laser_between(r, -0.8, 0.8)
        local v = laser_between(r, v0, v1)
        local s = laser_between(r, s0, s1)
        laser_particle(r, { x = r.gx, y = r.gy, vx = v * wa.math.sin(ang),
          vy = -v * wa.math.cos(ang), life = 30, drag = 0.3, grav = 0.8,
          s0 = s, s1 = 0.01, c0 = { 255, 0, 0 }, c1 = { 80, 0, 0 } })
      end
    end

    local function laser_objects()
      local out = {}
      for _, group in ipairs({ wa.worms, wa.mines, wa.crates, wa.oil }) do
        if group then
          for _, obj in ipairs(group.all()) do out[#out + 1] = obj end
        end
      end
      return out
    end

    local LASER_RADIUS = { worm = 6, mine = 5, crate = 9, oil = 9 }

    local function laser_trace(r, w)
      local x1 = r.x + (LASER_REACH * r.dx)
      local y1 = r.y + (LASER_REACH * r.dy)
      local land = wa.land.trace(r.x, r.y, x1, y1)
      local hx, hy = land and land.x or x1, land and land.y or y1
      if land then
        if r.hit and r.dx == r.last_dx and r.dy == r.last_dy then
          local steps = math.max(1, math.floor(math.sqrt(sq(hx - r.hx) + sq(hy - r.hy)) / 2))
          for i = 0, steps do
            wa.land.cut({ x = r.hx + (hx - r.hx) * i / steps, y = r.hy + (hy - r.hy) * i / steps, shape = "circle", radius = 4 })
          end
        else
          wa.land.cut({ x = hx, y = hy, shape = "circle", radius = 4 })
        end
        local s = laser_between(r, 0.6, 0.9)
        laser_particle(r, { x = hx, y = hy, life = 60, drag = 0.2, grav = -0.4, jitter = 0.6,
          s0 = s, s1 = 0.01, c0 = { 255, 0, 0 }, c1 = { 255, 0, 0 } })
        laser_particle(r, { x = hx, y = hy, life = 80, drag = 0, grav = 0,
          s0 = 0.6, s1 = 0.1, c0 = { 200, 0, 0 }, c1 = { 0, 0, 0 } })
      end
      r.hx, r.hy, r.hit = hx, hy, land ~= nil
      local lx, ly = (hx - r.x), (hy - r.y)
      r.draw_beam = lx * lx + ly * ly > 24 * 24
      local length = math.sqrt(lx * lx + ly * ly)
      for _, obj in ipairs(laser_objects()) do
        local ox, oy = (obj.x - r.x), (obj.y - r.y)
        local along = ox * r.dx + oy * r.dy
        local across = math.abs(ox * r.dy - oy * r.dx)
        if along >= 0 and along <= length and across <= 5 + (LASER_RADIUS[obj.kind] or 6)
            and not (obj.kind == "worm" and obj.id == w.id) then
          local key = obj.kind .. ":" .. obj.id
          if obj.kind == "worm" then
            if obj.hp > 0 then
              local taken = r.taken[key] or 0
              local amount = taken >= 45 and 0 or taken >= 10 and 1 or 2
              obj:hit({ amount = amount, vx = r.dx, vy = r.dy })
              r.taken[key] = taken + amount
            end
          elseif obj.kind == "oil" or obj.kind == "crate" then
            obj:hit(obj.kind == "oil" and 4 or 1, r.dx, r.dy)
          elseif obj.kind == "mine" and not r.armed[key] then
            r.armed[key] = true
            obj:arm(obj.fuse < 0 and wa.random(1000, 5000) or obj.fuse)
          end
          local px, py = obj.x - (3 * r.dx), obj.y - (3 * r.dy)
          local tone = math.floor(laser_between(r, 0, 50))
          laser_particle(r, { x = px, y = py, life = 10, drag = 0, grav = 0,
            s0 = laser_between(r, 0.4, 0.8), s1 = 0.01, c0 = { 210, 210 - tone, 0 }, c1 = { 210, 50 - tone, 0 } })
          for _ = 1, 2 do
            local a, v = laser_between(r, 0, 2 * math.pi), laser_between(r, 0.5, 1.8)
            laser_particle(r, { x = px, y = py, vx = v * wa.math.cos(a), vy = v * wa.math.sin(a),
              life = 30, drag = 0.05, grav = 1, s0 = laser_between(r, 0.2, 0.4), s1 = 0.01,
              c0 = { 255, 255 - tone, 0 }, c1 = { 255, 80 - tone, 0 } })
          end
        end
      end
    end

    local function laser_stop(r, w)
      r.dead = true
      if w then
        w.shots_fired = w.shots_to_fire
        wa.sound.play(w, "sounds/laser_gun/laser_end.wav")
      end
    end

    fires.laser = function(fire)
      local w = fire.worm
      if lasers[w.id] then return end
      local r = { worm_id = w.id, life = LASER_LIFE, counter = 0, size = 1.0, first = true,
        taken = {}, armed = {}, fx = {}, seed = (w.x // 1 * 7919 + w.y // 1) % 0x80000000 }
      r.aim, r.facing = w.aim, w.facing
      laser_aim(r, w)
      r.hx, r.hy, r.last_dx, r.last_dy = r.x, r.y, r.dx, r.dy
      lasers[w.id] = r
      wa.sound.play(w, "sounds/laser_gun/laser_start.wav")
      wa.sound.play(w, "sounds/laser_gun/laser_loop.wav")
      wa.actors.spawn({
        sprite = false, x = w.x, y = w.y, owner = w,
        on = function(a)
          r.life = r.life - 1
          laser.step(r)
          if r.dead then
            if r.life <= -10 and #r.fx == 0 then
              lasers[r.worm_id] = nil
              a:remove()
            end
            return
          end
          if r.life <= 0 or w.hp <= 0 or not w.turn or w.weapon ~= "px.laser_gun" or LASER_STOPS[w.state or ""] then
            laser_stop(r, w.hp > 0 and w or nil)
            return
          end
          w.shots_fired, w.shots_to_fire = 0, 1
          r.size = r.size - 0.07
          if r.size < 0.5 then r.size = 1.0 end
          r.aim, r.facing = w.aim, w.facing
          laser_aim(r, w)
          if r.first then
            r.first = false
            laser_sparks(r, 8, 5, 9, 0.4, 0.7) -- FX_InitialBurst
          end
          if (LASER_LIFE - r.life) % LASER_LOOP_FRAMES == 0 then
            wa.sound.play(w, "sounds/laser_gun/laser_loop.wav")
          end
          if r.counter <= 0 then
            r.counter = 3
            laser_trace(r, w)
            laser_sparks(r, 1, 2, 5, 0.2, 0.5) -- FX_MuzzleSparks
          else
            r.counter = r.counter - 1
          end
          r.last_dx, r.last_dy = r.dx, r.dy
        end,
      })
    end

    if wa.on.draw and wa.draw.ribbon then
      wa.on.draw(function()
        for _, r in pairs(lasers) do
          laser.draw_particles(r)
          if not r.dead then
            local c = laser.argb(255, { 255, 0, 0 })
            laser.glow(r.gx, r.gy, 32 * 0.5 * r.size, c)
            if r.draw_beam then laser.beam(r.gx, r.gy, r.hx, r.hy, 2 * 8 * r.size, c) end
            if r.hit then laser.glow(r.hx, r.hy, 32 * 0.75 * r.size, c) end
          end
        end
      end)
    end
  end
end

return weapon
`
      },
      {
        path: 'weapons/lightning_strike.lua',
        name: 'weapons/lightning_strike.lua',
        language: 'lua',
        content: `-- Lightning Strike: a beam from the sky that heals worms, revives graves and arms mines.

local weapon = {}

weapon.record = {
  handling = {
    ends_turn = true,
  },
}

function weapon.definition()
  local shared = require("lib/shared")
  local L = require("wf-lib/lightning")
  return require("lib/weapon").merge(weapon.record, {
    wep = "weps/napalm_strike.wep",
    panel_icon = "sprites/lightning/icon.png",
        sprites = {
          L.BEAM, L.GLOW, L.CLOUD,
          "sprites/electric_grenade/explosion.png", "sprites/electric_grenade/tazed1.png",
          "sprites/electric_grenade/tazed2.png",
        },
    sounds = { L.THUNDER, L.HIT, "sounds/gravity_control/error.wav" },
    params = { gpu_prefix = "sprites/" },
        on_select = { cursor = true },
        on_click = function(ev) shared.lightning_click(ev) end,
  })
end

weapon.requires = { "lib/electrical" }

-- The strike itself is wf.sdk's (wf-lib/lightning); px's objects join in
-- through its hooks.
function weapon.setup()
  local shared = require("lib/shared")
  local electrical = require("lib/electrical")
  local L = require("wf-lib/lightning")
  shared.revived_by_lightning = shared.revived_by_lightning or {}
  local revived_by_lightning = shared.revived_by_lightning
  local function sq(v) return v * v end

  L.extend({
    -- A bowling ball, then a magnet or a sentry, stops the beam first.
    beam = function(sx, sy, dirx, diry, ex, ey, hit)
      local bx, by = nil, nil
      if shared.bowling_ball_on_beam then
        local reach = math.sqrt(sq(ex - sx) + sq(ey - sy))
        bx, by = shared.bowling_ball_on_beam(sx, sy, dirx, diry, reach)
      end
      if bx then ex, ey, hit = bx, by, { x = bx, y = by } end
      local reach = hit and math.sqrt(sq(ex - sx) + sq(ey - sy)) or 10000
      local tx, ty = electrical.special_on_beam(sx, sy, dirx, diry, reach)
      if tx then ex, ey, hit = tx, ty, { x = tx, y = ty } end
      return ex, ey, hit
    end,
    before_hit = function(s)
      if shared.zap_bowling_balls then shared.zap_bowling_balls(s.ex, s.ey) end
    end,
    -- A worm Lightning brought back, or one it restores instead, isn't healed.
    heals = function(worm)
      return not revived_by_lightning[worm.id]
        and not (shared.lightning_restores_worm and shared.lightning_restores_worm(worm))
    end,
    revived = function(worm)
      revived_by_lightning[worm.id] = true
      if shared.restore_lightning_inventory then
        shared.restore_lightning_inventory(worm)
      end
    end,
    after_hit = function(s, struck)
      for _, obj in ipairs(electrical.special_targets()) do
        if struck(obj) then obj.provider.strike(obj, s.alliance) end
      end
    end,
  })
  L.setup()

  shared.lightning_click = function(ev)
    L.strike({ x = ev.x, y = ev.y, side = (ev.vx or 0) < 0 and -1 or 1,
      owner = ev.worm, alliance = ev.worm.alliance, thunder_on = ev.worm,
      revive_health = weapon.revive_health, refused_sound = "sounds/gravity_control/error.wav" })
  end
end

weapon.revive_health = 10
function weapon.configure(ctx)
  weapon.revive_health = ctx.option("revive_health")
end

return weapon
`
      },
      {
        path: 'weapons/mines_gun.lua',
        name: 'weapons/mines_gun.lua',
        language: 'lua',
        content: `-- Mines Gun: launches six mines with delayed fuses.

return {
  definition = {
    copy_from = "stock.uzi",
    name = "Mines Gun",
    panel_icon = "sprites/mines_gun/icon.png",
    handling = {remember_selection=false,ends_turn=false,retreat=3000},
    gun = {bullets=6,shot_interval_ms=-2},
    on_fire = function(shot)
      wa.mines.spawn{
        owner=shot.worm,x=shot.x,y=shot.y,
        vx=shot.vx*12,vy=shot.vy*12,
        arm=3000,fuse=3000,damage=30,radius=50,
        triggered=true,terrain_keep_speed_pct=60,
      }
    end,
  },
}
`
      },
      {
        path: 'weapons/mine_launcher.lua',
        name: 'weapons/mine_launcher.lua',
        language: 'lua',
        content: `-- Mine Launcher: fires an instant, sticky or invisible mine, chosen with keys 1-3.

local weapon = {}
local ID = "px.mine_launcher"
local ART = "sprites/mine_launcher/"

local MODES = {
  { name = "Instant Mine, 0 SEC", arm = 400, fuse = 0, keep = 96 },
  { name = "Sticky Mine, 1.5 SEC", arm = 2000, fuse = 1500, sticky = true },
  { name = "Invisible Mine, 3 SEC", arm = 2000, fuse = 3000, keep = 96, hidden = true },
}
local SELECT_WEAPON = 51

local mode = 1
local sticky = {}

local function bump(mine, ev)
  local s = sticky[mine.id]
  if not s or s.released then return end
  if not s.stuck then
    mine.x, mine.y, mine.vx, mine.vy = ev.x, ev.y, 0, 0
    mine.gravity = 0
    wa.sound.play(mine, 107)
    wa.sound.play(mine, 56)
    s.stuck = true
  else
    mine.gravity = 1
    s.released = true
  end
end

local function launch(fire)
  local m = MODES[mode]
  local mine = wa.mines.spawn({
    owner = fire.worm, x = fire.worm.x, y = fire.worm.y, vx = fire.vx, vy = fire.vy,
    arm = m.arm, fuse = m.fuse, damage = 50, radius = 48,
    terrain_keep_speed_pct = m.keep,
    on_contact = m.sticky and bump or nil,
  })
  if not mine then return end
  if m.hidden then mine.visible = false end
  if m.sticky then sticky[mine.id] = { mine = mine } end
end

weapon.definition = {
  wep = "weps/mine_launcher.wep",
  name = "Mine Launcher",
  panel_icon = ART .. "minelauncher_ico.png",
  worm_sprites = {
    weaponlnk = ART .. "aim.png", weaponlnku = ART .. "aimu.png", weaponlnkd = ART .. "aimd.png",
    wthrow = ART .. "draw.png", wthrowu = ART .. "drawu.png", wthrowd = ART .. "drawd.png",
  },
  on_fire = launch,
}

function weapon.setup()
  wa.on.turn_start(function() mode = 1 end)
  wa.on.turn_end(function() mode = 1 end)
  local held, last = {}, nil
  wa.on.worm_message(function(worm, msg)
    if msg == SELECT_WEAPON then
      if worm.turn then mode = 1 end
      return
    end
    local frame = wa.world.frame()
    if frame ~= last then
      last = frame
      local live = {}
      for _, mine in ipairs(wa.mines.all()) do
        live[mine.id] = true
        local s = sticky[mine.id]
        if s and s.stuck and not s.released and (mine.vx ~= 0 or mine.vy ~= 0) then
          mine.gravity = 1
          s.released = true
        end
      end
      for id in pairs(sticky) do
        if not live[id] then sticky[id] = nil end
      end
    end
    local digit
    if worm.turn and worm.weapon == ID then digit = wa.world.keys().digit end
    local pressed = digit and digit >= 1 and digit <= #MODES and digit or nil
    if pressed and held[worm.id] ~= pressed then
      mode = pressed
      wa.sound.play(worm, 92)
    end
    held[worm.id] = pressed
  end, { msgs = { wa.msg.FRAME_FINISH, SELECT_WEAPON } })
  require("lib/weapon_hint").hint(ID, function()
    return "Mine Launcher: " .. MODES[mode].name .. "\\n1-" .. #MODES .. ": choose a mine"
  end)
end

return weapon
`
      },
      {
        path: 'weapons/mine_turret.lua',
        name: 'weapons/mine_turret.lua',
        language: 'lua',
        content: `-- Mine Turret: a turret that lobs armed mines at moving enemies, over the land in their way.

local weapon = {}

weapon.record = {}

function weapon.definition()
  local fires = require("lib/shared").fires
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.prod",
    name = "Mine Turret",
    panel_icon = "sprites/pyro_turrets/mine_icon.png",
    is_weapon = true,
    on_fire = function(fire) fires.mine_turret(fire) end,
  })
end

function weapon.setup()
  local shared = require("lib/shared")
  local pyro = require("lib/pyro_turret")

  local function shoot(t, a, s, shot)
    if not pyro.muzzle_clear(a, shot) then return false end
    local force = pyro.force(s)
    wa.mines.spawn({ owner = t.owner(a, s), x = shot.x, y = shot.y,
      vx = shot.dx * force, vy = shot.dy * force,
      fuse = 400, arm = 0, damage = 50, radius = 48 })
    return true
  end

  local t = pyro.new({
    kind = "mine_turret", weapon = "px.mine_turret", frames = pyro.FRAMES.mine,
    ammo = 6, shoot = shoot,
  })
  shared.fires.mine_turret = function(fire_ev) t.place(fire_ev) end
  shared.mine_turret = t
end

function weapon.configure(ctx)
  require("lib/pyro_turret").configure(require("lib/shared").mine_turret, ctx)
end

return weapon
`
      },
      {
        path: 'weapons/mole_bomb.lua',
        name: 'weapons/mole_bomb.lua',
        language: 'lua',
        content: `-- Mole Bomb: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  fires = {
    creates_projectile = true,
    launch_power_pct = 5,
    method = 2,
    subtype = 0,
    type = 2,
  },
  handling = {
    remember_selection = true,
    ends_turn = true,
    shots = 0,
  },
  missile = {
    action = "roam",
    animation = 6,
    burst = "clusters",
    collision_shape = 2,
    countdown = 5000,
    explode_on_space = true,
    explosion = {
      push_pct = 100,
    },
    flight_sound = 65575,
    fuse = 5000,
    gravity_pct = 100,
    roam = {
      flight_hits = {
        crates = true,
        donor_cards = true,
        land = true,
        objects = true,
        water = true,
        worms = true,
        worms_frozen = true,
      },
      hits = {
        crates = true,
        donor_cards = true,
        land = true,
        objects = true,
        water = true,
        worms = true,
        worms_frozen = true,
      },
      jump = {
        angle_deg = 15,
        sound = 40,
        speed = 4.5,
      },
      step_height = 8,
      terrain_offset = -4,
      walk_speed = 1.0,
    },
    speed_pct = 100,
    sprite = 166,
    trail = {
      bubbles_per_second = 12.5,
      speed = 100,
      sprite = 131,
    },
  },
  clusters = {
    bit = {
      action = "dig",
      animation = 6,
      countdown = 5000,
      dig = {
        dive_sprite = 158,
        sound = 65574,
        sprite_1 = 159,
        sprite_2 = 160,
        sprite_3 = 160,
      },
      ends_on_contact = {
        crates = true,
        donor_cards = true,
        objects = true,
        worms = true,
        worms_frozen = true,
      },
      explode_on_space = true,
      explosion = {
        power = 40,
        push_pct = 110,
      },
      fuse = 20000,
      gravity_pct = 100,
      speed_pct = 100,
      sprite = 152,
      sprite_count = 1,
      trail = {
        bubbles_per_second = 12.5,
        power = 50,
        speed = 50,
        sprite = 80,
      },
    },
    count = 1,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.double_turn_time",
    name = "Mole Bomb",
    panel_icon = "mole_bomb",
  })
end

return weapon
`
      },
      {
        path: 'weapons/mortar_strike.lua',
        name: 'weapons/mortar_strike.lua',
        language: 'lua',
        content: `-- Mortar Strike: an air strike that drops mortar shells.

local weapon = {}

weapon.record = {
  missile = {
    burst = "clusters",
    ends_on_contact = {
      crates = true,
      donor_cards = true,
      land = true,
      objects = true,
      water = true,
      worms = true,
    },
    explosion = {
      bias = 0,
      push_pct = 100,
    },
    flight_sound = 75,
    fuse = 10000,
    gravity_pct = 70,
    random_motion = 10,
    sprite = 52,
    trail = {
      power = 20,
      speed = 260,
      sprite = 466,
    },
  },
  clusters = {
    angle = -1,
    bit = {
      action = "bounce",
      animation = 2,
      bounce = {
        bounciness = 50,
        hits = {
          water = true,
          worms_frozen = true,
        },
        max_bounces = 100,
        sound = 113,
        terrain_keep_speed_pct = 50,
      },
      ends_on_contact = {
        crates = true,
        donor_cards = true,
        land = true,
        objects = true,
        water = true,
        worms = true,
        worms_frozen = true,
      },
      explosion = {
        power = 15,
        push_pct = 100,
      },
      fuse = 10000,
      gravity_pct = 100,
      speed_pct = 100,
      sprite_count = 1,
      trail = {
        bubbles_per_second = 12.5,
        power = 15,
        speed = 160,
        sprite = 260,
      },
    },
    count = 5,
    launch_power_pct = 30,
    power_variation_pct = 30,
    spread = 40,
  },
  strike = {
    count = 4,
    plane = 86,
    spacing = 30,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.air_strike",
    name = "Mortar Strike",
    panel_icon = "sprites/mortar_strike/ico_mortarst.png",
    cluster_sprite = "sprites/mortar_strike/cluster.png",
    sprite_overrides = {
          wsvclnk = "sprites/mortar_strike/trail.png", -- 466
          wsvc = "sprites/mortar_strike/cluster_trail.png", -- 260
        },
  })
end

return weapon
`
      },
      {
        path: 'weapons/ninja_bomb.lua',
        name: 'weapons/ninja_bomb.lua',
        language: 'lua',
        content: `-- Ninja Bomb: a grenade that bursts into 21 arrows flying out in four rings, with no blast.

local holds = require("wf-lib/holds")
local weapon = {}

local ART = "sprites/ninja_bomb/"
local DAMAGE = 15 -- each arrow's

-- PX's arrows from the burst 5 pixels above where the bomb goes off: offset
-- x, y and speed vx, vy in pixels/frame. The two flying sideways have no gravity.
local ARROWS = {
  -- 25 pixels out
  { 0, -25, 2, -8 }, { -16, -16, -2, -8 }, { 16, -16, 8, -8 },
  { 25, 0, 16, 0, weightless = true }, { 16, 16, 8, 8 }, { 0, 25, 0, 8 },
  { -16, 16, -8, 8 }, { -25, 0, -16, 0, weightless = true }, { -16, -16, -8, -8 },
  -- 50 pixels out, flat
  { 33, -33, 16, -10 }, { 33, 33, 16, 10 }, { -33, 33, -16, 10 }, { -33, -33, -16, -10 },
  -- 75 pixels out, steep
  { 50, -50, 10, -16 }, { 50, 50, 10, 16 }, { -50, 50, -10, 16 }, { -50, -50, -10, -16 },
  -- 75 pixels out, flatter still
  { 50, -50, 16, -4 }, { 50, 50, 16, 4 }, { -50, 50, -16, 4 }, { -50, -50, -16, -4 },
}

local bursts = {}
local shooter

local function on_explode(ev)
  if ev.missile then bursts[#bursts + 1] = { x = ev.x, y = ev.y - 5 } end
end

weapon.definition = {
  copy_from = "stock.grenade",
  name = "Ninja Bomb",
  panel_icon = ART .. "ninja_bomb_ico.png",
  hold_as = "stock.grenade",
  on_explode = on_explode,
  missile = {
    sprite = 0, -- WA draws no round; the art spec draws it
    explosion = { power = 0 },
  },
  worm_sprites = holds.PX_POSTURE,
  sprites = { ART .. "bullet.png" },
  hold = {
    thrown = true,
    sheet = ART .. "bullet.png", hand_type = 1, hand_radius = 17, hand_scale = 0.8,
    weap_rotation = 0.5, weap_radius = 9,
    hand = holds.PX_HANDS[1],
  },
}

weapon.missile_sprite = {
  sheet = ART .. "bullet.png", frames = 1,
  spin = true, -- its record's WAT_Rotation
  hide = true,
}

function weapon.setup()
  bursts, shooter = {}, nil

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FIRE_WEAPON and worm.weapon == "px.ninja_bomb" then
      shooter = worm
      return
    end
    if msg ~= wa.msg.FRAME_FINISH or #bursts == 0 then return end
    local owner = shooter or worm
    for _, p in ipairs(bursts) do
      for _, a in ipairs(ARROWS) do
        wa.arrows.spawn({
          owner = owner, x = p.x + a[1], y = p.y + a[2], vx = a[3], vy = a[4],
          damage = DAMAGE, gravity_pct = a.weightless and 0 or 100,
        })
      end
    end
    bursts = {}
  end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })
end

return weapon
`
      },
      {
        path: 'weapons/ninja_star.lua',
        name: 'weapons/ninja_star.lua',
        language: 'lua',
        content: `-- Ninja Star: a thrown star that sticks in the land or bites what it hits for 10 damage.

local star = require("lib/px_ninja_star")

return {
  defaults = {
    ammo = { round_start = -1 },
    delay = 0,
  },
  install = function(ctx)
    star.install(ctx)
  end,
}
`
      },
      {
        path: 'weapons/nuke_rocket.lua',
        name: 'weapons/nuke_rocket.lua',
        language: 'lua',
        content: `-- Nuke Rocket: a placed rocket that fuses, then launches a nuke that bursts into clusters.

local weapon = {}

weapon.record = {
  fires = {
    launch_power_pct = 5,
    method = 2,
  },
  missile = {
    action = "bounce",
    alarm_worms = true,
    animation = 2,
    bounce = {
      bounciness = 30,
      contact_sides = 8,
      hits = {
        crates = true,
        donor_cards = true,
        land = true,
        objects = true,
        water = true,
        worms_acting = true,
        worms_frozen = true,
        worms_jumping = true,
        worms_normal = true,
      },
      sound = 113,
    },
    collision_shape = 2,
    ends_on_contact = {},
    explosion = {
      power = 0,
      push_pct = 70,
    },
    flight_sound = 65602,
    fuse = 3000,
    gravity_pct = 100,
    speed_pct = 100,
    trail = {
      bubbles_per_second = 12.5,
      speed = 100,
      sprite = 131,
    },
  },
  clusters = {
    bit = {
      action = "bounce",
      animation = 1,
      bounce = {
        bounciness = 1,
        contact_sides = 8,
      },
      ends_on_contact = {
        crates = true,
        donor_cards = true,
        land = true,
        mines = true,
        objects = true,
        water = true,
        worms = true,
        worms_frozen = true,
      },
      explosion = {
        power = 20,
        push_pct = 25,
      },
      fuse = 7770,
      gravity_pct = 100,
      speed_pct = 100,
      sprite = 54,
      sprite_count = 1,
      trail = {
        bubbles_per_second = 12.5,
        speed = 100,
        sprite = 131,
      },
    },
    count = 5,
    spread = 30,
  },
}

function weapon.definition()
  local shared = require("lib/shared")
  local sdk = require("wf-lib/holds")
  local PX_POSTURE, PX_HANDS = sdk.PX_POSTURE, sdk.PX_HANDS
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.mine",
    name = "Nuke Rocket",
    panel_icon = "sprites/nuke_rocket/nuke_rocket_ico.png",
    sprite = "sprites/nuke_rocket/nuke_rocket_bullet.png",
    on_explode = function(ev) shared.nuke_rocket_explode(ev) end,
        worm_sprites = {
          weaponlnk = sdk.PX_LEVEL.weaponlnk, weaponlnku = sdk.PX_LEVEL.weaponlnku,
          weaponlnkd = sdk.PX_LEVEL.weaponlnkd,
          wthrow = PX_POSTURE.wthrow, wthrowu = PX_POSTURE.wthrowu, wthrowd = PX_POSTURE.wthrowd,
        },
    sprites = {
          "sprites/px_hold/nuke_rocket.png",
        },
    sounds = { "sounds/nuke_rocket_launch.wav" },
    params = { gpu_prefix = "sprites/px_hold/" },
    hold = {
        thrown = true,
        sheet = "sprites/px_hold/nuke_rocket.png", hand_type = 2, hand_radius = 13.0,
        hand_rotation = -0.6, hand_radial_rotation = -0.95, hand_scale = 1.0,
        weap_rotation = 0.45, weap_radial_rotation = 1.0, weap_radius = 8.5,
        static = { weap = -0.1, hand = 0.4 }, -- ang_if_static, hand_ang_if_static
        hand = PX_HANDS[2],
    },
  })
end

function weapon.setup()
  local shared = require("lib/shared")
  local own_time = require("wf-lib/own_time")

  do
  local NR_HISS = 66 -- the fusing rocket's hiss, every 10 frames
  local NR_CLIMB = 53 -- frames the nuke climbs (PX: "1.1-1.2 second")
  local NR_CARRY = 17 -- pixels: what the climbing nuke carries along
  local NUKE = { fuse = 1600, sound = 0, burst = "clusters", terrain_keep_speed_pct = 11,
    clusters = { launch_power_pct = 33, power_variation_pct = 33 } }
  local NUKE_BLAST = { damage = 40, id = 40 } -- PX's DoExplosion(x, y, 40, 40), twice

  local nr_first = {} -- missile id -> frames: a first rocket, fusing
  local nr_speed = {} -- missile id -> { vx, vy } at its last frame
  local nr_nuke = {} -- missile id -> frames flown: a nuke
  local nr_climbing = {} -- nuke id -> { x, y, vx, vy }, while it climbs
  local nr_pending = {} -- nukes to launch once the rocket's blast is over
  local nr_shooter_id -- the id of the worm that fired (PX's ClWT / ClWN)
  local nr_owner = {}
  local nr_expect -- fired: the next mine-slot missile is the rocket

  local NO_TEAM = 0

  local function keep(owner)
    return owner.kind == "worm" and owner.id or NO_TEAM
  end

  local function near(ax, ay, bx, by)
    local r = NR_CARRY
    return math.abs(ax - bx) < r and math.abs(ay - by) < r
  end

  local function owner_of(id)
    if id == NO_TEAM then return nil end
    local turn, any
    for _, w in ipairs(wa.worms.all()) do
      if w.id == id then return w end
      if w.turn then turn = w end
      any = any or w
    end
    return turn or any
  end

  local function owner_at(id, x, y)
    if id == NO_TEAM then return shared.no_team_owner(x, y) end
    return owner_of(id)
  end

  wa.on.missile_frame(function(m)
    local t = nr_nuke[m.id]
    if t ~= nil then
      if m.phase ~= "pre" then
        return
      end
      if t < NR_CLIMB then
        m.vy = m.vy - wa.random(19661, 52429) / 65536 -- 0.3 to 0.8 a frame
        if t % 2 == 1 then
          m.vx = m.vx + wa.random(-19661, 19661) / 65536 -- up to 0.3 either way
        end
        nr_climbing[m.id] = { x = m.x, y = m.y, vx = m.vx, vy = m.vy }
        for _, w in ipairs(wa.worms.all()) do
          if near(w.x, w.y, m.x, m.y) then
            local k = own_time.scale(w)
            if k <= 0 then k = 1 end
            w.vx, w.vy = m.vx / k, m.vy / k
          end
        end
      else
        nr_climbing[m.id] = nil
        if m.vy < 0 then
          m.vy = m.vy + 0.1999969482421875 -- 0.2: slows the climb without faking gravity
        end
      end
      nr_nuke[m.id] = t + 1
      return
    end
    if nr_first[m.id] == nil and nr_expect and m.weapon == "px.nuke_rocket" then
      nr_first[m.id], nr_expect = 0, false
    end
    if nr_first[m.id] ~= nil then
      if m.phase == "post" then
        nr_speed[m.id] = { m.vx, m.vy }
        local n = (nr_first[m.id] or 0) + 1
        nr_first[m.id] = n
        local id = nr_owner[m.id] or nr_shooter_id
        if n % 10 == 0 and id and id ~= NO_TEAM then
          wa.sound.play(owner_of(id), NR_HISS)
        end
      end
      return
    end
    if m.phase == "pre" then
      for _, c in pairs(nr_climbing) do
        if near(m.x, m.y, c.x, c.y) then
          m.vx, m.vy = c.vx, c.vy
        end
      end
    end
  end)

  shared.nuke_rocket_first = function(owner, x, y, vx, vy)
    local id = wa.weapons.launch({ weapon = "px.nuke_rocket", owner = owner, x = x, y = y, vx = vx, vy = vy })
    if id then
      nr_first[id], nr_owner[id] = 0, keep(owner)
    end
    return id
  end

  shared.nuke_rocket_explode = function(ev)
    local id = ev.missile
    if not id then
      return
    end
    if nr_nuke[id] then
      nr_nuke[id], nr_climbing[id] = nil, nil
      local owner_id = nr_owner[id] or nr_shooter_id
      nr_owner[id] = nil
      local owner = owner_id and owner_at(owner_id, ev.x, ev.y)
      if owner then
        wa.sound.play(owner, 85)
        wa.sound.play(owner, 70) -- "louder please :D"
        for _ = 1, 2 do
          wa.actors.spawn({
            sprite = false, x = ev.x, y = ev.y, owner = owner,
            explode = { damage = NUKE_BLAST.damage, id = NUKE_BLAST.id, now = true },
          })
        end
      end
      return
    end
    if nr_first[id] then
      local speed = nr_speed[id] or { 0, 0 }
      nr_first[id], nr_speed[id] = nil, nil
      local owner_id = nr_owner[id] or nr_shooter_id
      nr_owner[id] = nil
      if owner_id and owner_id ~= NO_TEAM then
        wa.sound.play(owner_of(owner_id), "sounds/nuke_rocket_launch.wav")
      end
      nr_pending[#nr_pending + 1] = { x = ev.x, y = ev.y, vx = speed[1], vy = speed[2], owner = owner_id }
    end
  end

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FIRE_WEAPON and worm.weapon == "px.nuke_rocket" then
      nr_shooter_id, nr_expect = worm.id, true
    elseif msg == wa.msg.FRAME_FINISH and #nr_pending > 0 then
      local pending = nr_pending
      nr_pending = {}
      for _, p in ipairs(pending) do
        local owner = owner_at(p.owner or nr_shooter_id, p.x, p.y) or worm
        local id = wa.weapons.launch({
          weapon = "px.nuke_rocket", owner = owner, x = p.x, y = p.y, vx = p.vx, vy = p.vy,
          missile = {
            fuse = NUKE.fuse, flight_sound = NUKE.sound, burst = NUKE.burst,
            bounce = { terrain_keep_speed_pct = NUKE.terrain_keep_speed_pct },
          },
          clusters = NUKE.clusters,
        })
        if id then
          nr_nuke[id] = 0
          nr_owner[id] = keep(owner)
        end
      end
    end
  end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })
  end
end

return weapon
`
      },
      {
        path: 'weapons/old_woman_launcher.lua',
        name: 'weapons/old_woman_launcher.lua',
        language: 'lua',
        content: `-- Old Woman Launcher: launches an Old Woman; hold fire to charge.

local weapon = {}

weapon.record = {
  fires = {
    launch_power_pct = 50,
    method = 3,
    subtype = 3,
    type = 1,
  },
}

function weapon.definition()
  local shared = require("lib/shared")
  local fires = shared.fires
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.old_woman",
    name = "Old Woman Launcher",
    panel_icon = "sprites/launchers/old_woman_launcher_ico.png",
    on_fire = function(fire) fires.old_woman(fire) end,
  })
end

function weapon.setup()
  local fires = require("lib/shared").fires
  do
    local CLEAR = 3
    local REACH = 40
    local RING = 4

    local function clear(x, y)
      if wa.land.solid(x, y) then return false end
      for i = 0, 7 do
        local a = (i / 8) * 2 * math.pi
        if wa.land.solid(x + (CLEAR * wa.math.cos(a)), y + (CLEAR * wa.math.sin(a))) then
          return false
        end
      end
      return true
    end

    local function launch_point(x, y, w)
      local r = 0
      while r <= REACH do
        local step = (r == 0) and 360 or math.max(15, math.floor(360 / (r / 2)))
        local deg = 0
        while deg < 360 do
          local a = deg * math.pi / 180
          local tx, ty = x + (r * wa.math.cos(a)), y + (r * wa.math.sin(a))
          if clear(tx, ty) then
            local hit = wa.land.trace(tx, ty, w.x, w.y)
            if not hit or not hit.hit then return tx, ty end
          end
          deg = deg + step
        end
        r = r + RING
      end
      return w.x, w.y
    end

    fires.old_woman = function(fire)
      local w = fire.worm
      local x, y = launch_point(fire.x, fire.y, w)
      wa.weapons.launch({ weapon = "px.old_woman_launcher", owner = w,
        x = x, y = y, vx = fire.vx, vy = fire.vy, missile = { fuse = 5000 } })
    end
  end
end

function weapon.configure(ctx, spec)
  if ctx.option("charged") then
    spec.fires.launch_power_pct = "charged"
  end
end

return weapon
`
      },
      {
        path: 'weapons/parkour.lua',
        name: 'weapons/parkour.lua',
        language: 'lua',
        content: `-- Parkour: parkour for the turn: Enter kicks the worm off a wall, Backspace bunny-hops it.

local weapon = {
  definition = {
    copy_from = "stock.double_turn_time",
    name = "Parkour",
    panel_icon = "sprites/parkour/parkour_ico.png",
    handling = {remember_selection=false,ends_turn=false,retreat=3000},
    utility = {effect="scripted"},
    sounds = {"sounds/parkour/parkour_snd.wav"},
  },
  requires = {"lib/turn_controls"},
}

function weapon.setup()
  local enabled = {}
  local parkour = require("wf-lib/parkour")
  local movement = parkour.new()
  require("lib/turn_controls").register("px.parkour", {
    fire = function(worm)
      enabled[worm.id] = not enabled[worm.id]
      if enabled[worm.id] then wa.sound.play(worm, "sounds/parkour/parkour_snd.wav") end
    end,
    finish = function() enabled = {} end,
    hint = function(worm)
      return "Parkour: " .. (enabled[worm.id] and "ON" or "OFF") .. "\\nSpace: on/off\\nEnter: wall-jump\\nBackspace: hop"
    end,
  })
  wa.on.worm_message(function(worm, msg)
    if not worm.turn or not enabled[worm.id] or worm.hp <= 0 then return end
    local airborne = parkour.air_input(worm, msg)
    movement(worm, msg)
    if airborne then return "eat" end
  end, {msgs={wa.msg.FRAME_FINISH,wa.msg.JUMP,wa.msg.JUMP_UP}})
end
return weapon
`
      },
      {
        path: 'weapons/personal_invisibility.lua',
        name: 'weapons/personal_invisibility.lua',
        language: 'lua',
        content: `-- Personal Invisibility: invisibility for one worm, for three turns or until it attacks.

local weapon = {}
local ID = "px.personal_invisibility"
local DING = "sounds/personal_invisibility/ding.wav"
local TURNS = 4

weapon.definition = {
  copy_from = "stock.double_turn_time",
  name = "Personal Invisibility",
  panel_icon = "sprites/personal_invisibility/ico_pinvisibility.png",
  handling = { remember_selection = false, ends_turn = false, retreat = -1 },
  utility = { effect = "scripted" },
  sounds = { DING },
}
weapon.requires = { "lib/turn_controls" }

function weapon.setup()
  local left = {}
  local last_turn
  require("lib/turn_controls").register(ID, {
    fire = function(worm)
      worm.invisibility = not worm.invisibility
      if worm.invisibility then
        require("lib/weapon_hint").notice(worm, "Invisible for " .. (TURNS - 1) .. " turns")
      end
      wa.sound.play(worm, DING)
    end,
  })
  wa.on.worm_message(function()
    local frame = wa.world.frame()
    if frame == last_turn then return end
    last_turn = frame
    for _, w in ipairs(wa.worms.all()) do
      if w.invisibility then
        left[w.id] = (left[w.id] or TURNS) - 1
        if left[w.id] <= 0 then
          left[w.id] = TURNS
          w.invisibility = false
          wa.sound.play(w, DING)
        end
      end
    end
  end, { msgs = { wa.msg.TURN_STARTED } })
end

return weapon
`
      },
      {
        path: 'weapons/petrol_turret.lua',
        name: 'weapons/petrol_turret.lua',
        language: 'lua',
        content: `-- Petrol Turret: a turret that lobs Petrol Bombs at moving enemies, over the land in their way.

local weapon = {}

weapon.record = {}

function weapon.definition()
  local fires = require("lib/shared").fires
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.prod",
    name = "Petrol Turret",
    panel_icon = "sprites/pyro_turrets/petrol_icon.png",
    is_weapon = true,
    on_fire = function(fire) fires.petrol_turret(fire) end,
  })
end

function weapon.setup()
  local shared = require("lib/shared")
  local pyro = require("lib/pyro_turret")
  local DAMAGE = 15 -- PX's admg: the bomb's launch.explosion.damage
  local LAUNCH_SOUND = 44 -- WA's sound PX plays with each

  local function shoot(t, a, s, shot)
    if not pyro.muzzle_clear(a, shot) then return false end
    local force = pyro.force(s)
    local owner = t.owner(a, s)
    if owner == a then return false end
    wa.sound.play(a, LAUNCH_SOUND)
    wa.weapons.launch({ weapon = "stock.petrol_bomb", owner = owner,
      x = shot.x, y = shot.y, vx = shot.dx * force, vy = shot.dy * force,
      missile = { explosion = { power = DAMAGE } } })
    return true
  end

  local t = pyro.new({
    kind = "petrol_turret", weapon = "px.petrol_turret", frames = pyro.FRAMES.petrol,
    tazer = "empty", -- a CCustomTurret: the Tazer's arc empties its ammo
    ammo = 6, tower_offset = 20,
    ammo_sprite = pyro.AMMO_PETROL, ammo_size = 60, -- WA's petrolbm, PX's sprNum 55
    shoot = shoot,
  })
  shared.fires.petrol_turret = function(fire_ev) t.place(fire_ev) end
  shared.petrol_turret = t
end

function weapon.configure(ctx)
  require("lib/pyro_turret").configure(require("lib/shared").petrol_turret, ctx)
end

return weapon
`
      },
      {
        path: 'weapons/pigeon_strike.lua',
        name: 'weapons/pigeon_strike.lua',
        language: 'lua',
        content: `-- Pigeon Strike: a mail strike whose pigeons home in on worms and burst into bouncing bits.

local weapon = {}

weapon.record = {
  handling = {
    retreat = 3000,
  },
  missile = {
    action = "homing",
    animation = 3,
    burst = "clusters",
    ends_on_contact = {
      crates = true,
      donor_cards = true,
      land = true,
      objects = true,
      water = true,
      worms = true,
      worms_frozen = true,
    },
    explosion = {
      bias = 25,
      power = 55,
    },
    flight_sound = 65587,
    fuse = 12000,
    gravity_pct = 25,
    homing = {
      animation = 1,
      arm = 2400,
      kind = "lock",
      sprite = 175,
      time = 1000,
      trail = {
        bubbles_per_second = 12.5,
        power = 25,
        speed = 40,
        sprite = 134,
      },
    },
    random_motion = 180,
    speed_pct = 95,
    sprite = 175,
    trail = {
      power = 50,
      sprite = 0,
    },
    wind_pct = 0,
  },
  clusters = {
    bit = {
      action = "bounce",
      animation = 1,
      bounce = {
        bounciness = 20,
        contact_sides = 8,
        hits = {
          crates = true,
          donor_cards = true,
          land = true,
          objects = true,
          worms_frozen = true,
        },
        max_bounces = 1,
        terrain_keep_speed_pct = 20,
      },
      ends_on_contact = {
        crates = true,
        donor_cards = true,
        land = true,
        objects = true,
        worms_frozen = true,
      },
      fuse = 10000,
      gravity_pct = 45,
      random_motion = 60,
      speed_pct = 99,
      sprite = 134,
      sprite_count = 1,
      trail = {
        bubbles_per_second = 12.5,
      },
    },
    count = 18,
    launch_power_pct = 15,
    power_variation_pct = 30,
    spread = 20,
  },
  strike = {
    count = 3,
    munition_speed = 12.0,
    plane = 86,
    spacing = 45,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.mail_strike",
    name = "Pigeon Strike",
    panel_icon = "sprites/pigeon_strike/ico_pigeonst.png",
  })
end

return weapon
`
      },
      {
        path: 'weapons/platform.lua',
        name: 'weapons/platform.lua',
        language: 'lua',
        content: `-- Platform: a fixed platform with 40 health.

local weapon = {}
local platforms = {}
local ART = "sprites/platform/"
local COLOURS = {0xFFFF0000,0xFF0000FF,0xFF00FF00,0xFFFFFF00,0xFFFF00FF,0xFF00FFFF}

local function place(shot)
  local x,y = shot.worm.x,shot.worm.y+17
  local s = {x=x,y=y,health=40,alive=true,colour=COLOURS[shot.worm.alliance+1]}
  local function hit(a,event)
    if not s.alive then return end
    local damage=math.max(0,event.damage or 0)
    if event.kind=="blast" then
      local power=event.power
      local dx,dy=event.x-s.x,event.y-s.y
      damage=power>0 and math.max(0,math.floor((1-(dx*dx+dy*dy)/(power*power*4))*power)) or 0
    end
    s.health = s.health-damage
    if s.health<=0 then
      s.alive=false
      a:explode{damage=10,id=100}
      a:remove()
    end
  end
  s.actor = wa.actors.spawn{
    sprite=false,owner=shot.worm,x=x,y=y,origin="center",persist=true,
    body={shape=ART.."body.png",hits={},hit_by="all"},
    on={frame=function(a)
      a.x,a.y,a.vx,a.vy=s.x,s.y,0,0
    end,hit=hit},
  }
  platforms[#platforms+1]=s
  wa.sound.play(s.actor, 112)
end

weapon.definition = {
  copy_from="stock.double_turn_time",name="Platform",
  panel_icon=ART.."platform_icon.png",
  utility={effect="scripted"},on_fire=place,
  sprites={ART.."platform_sprite.png",ART.."platform_broken.png"},
  params={gpu_prefix=ART},
}

function weapon.setup()
  wa.on.draw(function()
    for _,s in ipairs(platforms) do
      if s.alive and s.actor.id~=0 then
        local x,y=s.actor.x,s.actor.y
        wa.draw.quad{sprite=ART..(s.health>20 and "platform_sprite.png" or "platform_broken.png"),
          frame=0,color=s.colour,depth=wa.depth.TERRAIN-1,
          points={{x-70,y-10},{x+70,y-10},{x+70,y+10},{x-70,y+10}}}
      end
    end
  end)
end
return weapon
`
      },
      {
        path: 'weapons/pogo_sheep.lua',
        name: 'weapons/pogo_sheep.lua',
        language: 'lua',
        content: `-- Pogo Sheep: a sheep that bounces around the map like a pogo stick, then bursts into bouncing bits.

local weapon = {}

weapon.record = {
  fires = {
    launch_power_pct = 6,
  },
  missile = {
    action = "bounce",
    animation = 2,
    bounce = {
      bounciness = 98,
      hits = {
        crates = true,
        donor_cards = true,
        land = true,
        mines = true,
        objects = true,
        water = true,
        worms = true,
        worms_frozen = true,
      },
      max_bounces = 50,
      sound = 111,
    },
    burst = "clusters",
    countdown = 0,
    explosion = {
      power = 65,
    },
    flight_sound = 50,
    gravity_pct = 70,
    impact_particles = true,
    random_motion = 8,
  },
  clusters = {
    bit = {
      action = "bounce",
      bounce = {
        bounciness = 10,
        hits = {
          land = true,
        },
        max_bounces = 10,
        terrain_keep_speed_pct = 10,
      },
      fuse = 2000,
      gravity_pct = 75,
      random_motion = 650,
      speed_pct = 65,
      sprite_count = 1,
      trail = {
        bubbles_per_second = 12.5,
        power = 1,
        speed = 20,
        sprite = 249,
      },
    },
    count = 48,
    launch_power_pct = 1,
    power_variation_pct = 30,
    spread = 45,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.sheep",
    name = "Pogo Sheep",
    panel_icon = "sprites/pogo_sheep/psheep_ico.png",
    sprite = "sprites/pogo_sheep/flight.png",
    cluster_sprite = "sprites/pogo_sheep/cluster.png",
  })
end

return weapon
`
      },
      {
        path: 'weapons/portal_gun.lua',
        name: 'weapons/portal_gun.lua',
        language: 'lua',
        content: `-- Portal Gun: fires two portals; worms and objects pass from one to the other.

local weapon = {}

weapon.record = {
  fires = {
    subtype = 3,
  },
  handling = {
    ends_turn = false,
  },
}

weapon.defaults = {
  airborne = true,
}

function weapon.definition()
  local shared = require("lib/shared")
  local fires = shared.fires
  return require("lib/weapon").merge(weapon.record, {
    wep = "weps/scales_of_justice.wep",
    panel_icon = "sprites/portal_gun/icon.png",
    worm_sprites = {
          weaponlnk = "sprites/portal_gun/portal_gun_normal.png",
          weaponlnku = "sprites/portal_gun/portal_gun_up.png",
          weaponlnkd = "sprites/portal_gun/portal_gun_down.png",
          wthrow = "sprites/portal_gun/portal_gun_link_normal.png",
          wthrowu = "sprites/portal_gun/portal_gun_link_up.png",
          wthrowd = "sprites/portal_gun/portal_gun_link_down.png",
        },
    sprites = {
          "sprites/portal_gun/portal_ball.png", "sprites/portal_gun/portal_orange.png",
          "sprites/portal_gun/portal_blue.png", "sprites/portal_gun/portal_glow.png",
          "sprites/portal_gun/portal_gun_glow.png",
          "sprites/portal_gun/lightning_glow.png", "sprites/portal_gun/portal_black_mask.png",
        },
    sounds = { "sounds/portal_gun_shoot.wav", "sounds/portal_gun_hit.wav", "sounds/portal_gun_failhit.wav",
          "sounds/portal_active.wav", "sounds/portal_inactive.wav", "sounds/portal_teleport.wav" },
    params = { gpu_prefix = "sprites/portal_gun/" },
    on_fire = function(fire) fires.portal_gun(fire) end,
  })
end

function weapon.setup()
  local shared = require("lib/shared")
  local Portals = require("lib/portals")
  local Effects = require("lib/portal_effects")
  local ID, ART = "px.portal_gun", "sprites/portal_gun/"
  local SPEED = 35
  local chosen, held, half_used = {}, {}, {}
  local bolts, effects = {}, Effects.new()
  local ticker
  local colours = { 0xFFDF6400, 0xFF003FEF }
  local team_colours = { 0xD21400, 0x0014DC, 0x00DC00, 0xFADC00, 0xDC00DC, 0x00E6E6 }
  local function sound(name, worm) wa.sound.play(worm, "sounds/" .. name .. ".wav") end
  local network = Portals.new({ grace = 0, on_transport = function(body, entry)
    effects:transport(entry)
    if (body.kind or "worm") == "worm" then sound("portal_teleport", body) end
  end })
  shared.portals = network

  local function tick()
    network:tick()
    effects:tick(wa.world.gravity())
    for _, group in ipairs(wa.sorted(network.pairs)) do
      local pair = network.pairs[group]
      if pair.active and pair[1] and pair[2] and network.age % 500 ~= 0 then
        for colour = 1,2 do effects:ambient(pair[colour]) end
      end
    end
    if network.age % 150 == 0 then
      local alive = {}
      for _, worm in ipairs(wa.worms.all()) do alive["worm:" .. worm.id] = true end
      for _, list in ipairs({wa.missiles, wa.mines, wa.crates, wa.oil, wa.graves, wa.arrows}) do
        for _, body in ipairs(list.all()) do alive[body.id] = true end
      end
      if shared.portal_bowling_balls then
        for _, body in ipairs(shared.portal_bowling_balls()) do alive["actor:" .. body.id] = true end
      end
      for _, key in ipairs(wa.sorted(network.last_exit)) do
        if not alive[key] then network.last_exit[key] = nil end
      end
    end
  end
  local function ensure_ticker(worm)
    if ticker then return end
    ticker = wa.actors.spawn({ sprite = ART .. "portal_glow.png", x = 0, y = -1000,
      owner = worm, on = { frame = tick } })
    ticker:gfx{ scale = 0 }
  end

  local function supported(x, y)
    for _, d in ipairs({ {-15,-15}, {15,15}, {-15,15}, {15,-15} }) do
      local hit = wa.land.trace(x, y, x + d[1], y + d[2])
      if hit and hit.hit then return true end
    end
    return false
  end
  local function shooter(b)
    for _, w in ipairs(wa.worms.all()) do if w.id == b.worm_id then return w end end
  end
  local function place(b, hit)
    if hit.y >= wa.world.water() or not supported(hit.x, hit.y) then
      effects:impact(hit.x, hit.y, true)
      sound("portal_gun_failhit", shooter(b))
      return false
    end
    local p, fresh = network:place(b.team, b.colour, hit.x, hit.y, hit.nx, hit.ny, b.team_colour)
    if not p then effects:impact(hit.x, hit.y, true); sound("portal_gun_failhit", shooter(b)); return false end
    if fresh then chosen[b.team] = 3 - b.colour end
    sound("portal_gun_hit", shooter(b))
    effects:impact(hit.x, hit.y, false)
    if half_used[b.worm_id] then
      half_used[b.worm_id] = nil
      local worm = shooter(b)
      if worm then worm:ammo(ID, -1) end
    else half_used[b.worm_id] = true end
    return true
  end
  local function remove(b)
    bolts[b.id] = nil
    b.a:remove()
  end
  local function bolt_frame(b)
    b.age = b.age + 1
    local size = wa.world.size()
    if b.x < 0 or b.x > size.w or b.y < -size.h then b.vy = b.vy + wa.world.gravity() end
    local hit = wa.world.trace({ x0 = b.x, y0 = b.y, x1 = b.x + b.vx, y1 = b.y + b.vy,
      with = {"terrain"}, radius = 0 })
    if hit and hit.hit then
      place(b, hit)
      remove(b)
      return
    end
    b.x, b.y = b.x + b.vx, b.y + b.vy
    if b.y >= wa.world.water() or b.age > 600 or math.abs(b.x) > 32000 or math.abs(b.y) > 32000 then
      remove(b); return
    end
    b.a.x, b.a.y = b.x, b.y
    b.a:frame((b.age // 2) % 20)
    b.a:gfx({ scale = 0.12, tint = colours[b.colour] & 0xFFFFFF, depth = wa.depth.OBJECTS })
    effects:trail(b.x, b.y, b.colour)
  end
  local function air_aim(worm, keys)
    if (keys.left or keys.right) and keys.up then return 0.75 end
    if (keys.left or keys.right) and keys.down then return 0.175 end
    if keys.left or keys.right then return 0.5 end
    if keys.down then return 0 end
    if keys.up then return 1 end
    return worm.aim
  end
  shared.fires.portal_gun = function(fire)
    local worm, keys = fire.worm, wa.world.keys()
    ensure_ticker(worm)
    local colour = chosen[worm.team] or 1
    if keys.ctrl or keys.alt then colour = 3 - colour end
    local aim = fire.airborne and air_aim(worm, keys) or worm.aim
    local angle = (1 - aim) * math.pi
    local dx, dy = wa.math.sin(angle) * worm.facing, -wa.math.cos(angle)
    local power = fire.power or 1
    local b = { x = worm.x + dx, y = worm.y + dy,
      vx = (dx * SPEED * power), vy = (dy * SPEED * power),
      worm_id = worm.id, team = worm.team, team_colour = team_colours[worm.alliance + 1],
      colour = colour, age = 0 }
    if not fire.airborne then worm:ammo(ID, 1) end
    local a = wa.actors.spawn({ sprite = ART .. "portal_ball.png", x = b.x, y = b.y,
      owner = worm, on = { frame = function() bolt_frame(b) end } })
    b.a, b.id = a, a.id
    a:gfx({ scale = 0.12, tint = colours[colour] & 0xFFFFFF, depth = wa.depth.OBJECTS })
    bolts[b.id] = b
    sound("portal_gun_shoot", worm)
  end

  wa.on.body_move(function(body) if next(network.pairs) then network:move(body) end end,
    { kinds = { "worm", "missile", "mine", "crate", "oil", "grave", "arrow" } })
  wa.on.worm_message(function(worm)
    if not worm.turn then return end
    local keys, id, team = wa.world.keys(), worm.id, worm.team
    local old = held[id] or {}
    if keys.pause_key and not old.pause_key then
      local pair = network.pairs[team]
      if pair then
        network:active(team, not pair.active)
        sound(pair.active and "portal_active" or "portal_inactive", worm)
      end
    end
    if worm.weapon == ID then
      if keys.minus_key and not old.minus_key then chosen[team] = 1 end
      if keys.plus_key and not old.plus_key then chosen[team] = 2 end
    end
    held[id] = { portal = worm.weapon == ID, plus_key = keys.plus_key, minus_key = keys.minus_key, pause_key = keys.pause_key }
  end, { msgs = { wa.msg.FRAME_FINISH } })
  wa.on.turn_start(function() network:turn_start(); held = {} end)
  wa.on.turn_end(function() network:turn_end() end)

  require("lib/weapon_hint").register(ID, function(worm)
    return "Portal Gun: " .. ((chosen[worm.team] or 1) == 1 and "ORANGE" or "BLUE")
      .. "\\n- orange, + blue\\nCtrl/Alt: the other colour\\nPause: toggle"
  end)

  if wa.on.draw then
    local tip, tip_frame = Effects.new(), nil
    local function quad(sprite, x, y, w, h, angle, colour, blend, depth, frame)
      local c, s = wa.math.cos(angle or 0), wa.math.sin(angle or 0)
      local points = {}
      for _, v in ipairs({ {-w/2,-h/2}, {w/2,-h/2}, {w/2,h/2}, {-w/2,h/2} }) do
        points[#points + 1] = { x + (v[1]*c-v[2]*s), y + (v[1]*s+v[2]*c) }
      end
      wa.draw.quad({sprite = ART .. sprite, points = points, color = colour, blend = blend,
        depth = depth or wa.depth.OBJECTS, frame = frame or 0})
    end
    wa.on.draw(function()
      for _, group in ipairs(wa.sorted(network.pairs)) do
        local pair = network.pairs[group]
        for colour = 1, 2 do
          local p = pair[colour]
          if p then
            local angle = math.pi / 2 - wa.math.atan(p.nx, p.ny)
            quad(colour == 1 and "portal_orange.png" or "portal_blue.png", p.draw_x, p.draw_y,
              40, 100, angle, 0xFFFFFFFF, "add")
            quad("portal_black_mask.png", p.draw_x - (p.x-p.draw_x)*2, p.draw_y - (p.y-p.draw_y)*2,
              12.5, 12.5, 0, (135 << 24) | (p.team_colour or 0xFFFFFF), "alpha",
              wa.depth.OBJECTS - 1, (network.age // 50) % 2)
          end
        end
      end
      effects:draw(quad)
      local worm = shared.current_worm()
      local now = wa.world.frame()
      local step = now ~= tip_frame
      tip_frame = now
      if step then tip:tick(wa.world.gravity()) end
      if worm and worm.weapon == ID and worm.aiming then
        local keys = wa.world.keys()
        local colour = chosen[worm.team] or 1
        if keys.ctrl or keys.alt then colour = 3 - colour end
        local angle = (1 - worm.aim) * math.pi
        local dx, dy = math.sin(angle) * worm.facing, -math.cos(angle)
        quad("portal_gun_glow.png", worm.x + dx * 18, worm.y + dy * 18, 80, 80,
          math.atan(dy, dx), (100 << 24) | (colours[colour] & 0xFFFFFF), "add", 0x000CFFFF)
        if step then tip:muzzle(worm.x + dx * 20, worm.y + dy * 20, colour, dx, dy) end
      end
      tip:draw(quad)
    end)
  end
  shared.portal_air_aim = air_aim
end

return weapon
`
      },
      {
        path: 'weapons/priceless_ming_vase.lua',
        name: 'weapons/priceless_ming_vase.lua',
        language: 'lua',
        content: `-- Priceless Ming Vase: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.ming_vase",
    name = "Priceless Ming Vase",
  })
end

return weapon
`
      },
      {
        path: 'weapons/real_shotgun.lua',
        name: 'weapons/real_shotgun.lua',
        language: 'lua',
        content: `-- Real Shotgun: a shotgun that fires five pellets per shot.

local weapon = {}

weapon.record = {
  gun = {
    burst_spread_deg = 10,
    explosion = {
      push_pct = 150,
      variation = 75,
    },
    hits = {
      crates = true,
      donor_cards = true,
      land = true,
      mines = true,
      missiles = true,
      objects = true,
      water = true,
      worms = true,
      worms_frozen = true,
    },
    spread_deg = 10,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.shotgun",
    name = "Real Shotgun",
    panel_icon = "sprites/real_shotgun/real_shotgun_ico.png",
    fire_repeat = 5,
  })
end

return weapon
`
      },
      {
        path: 'weapons/reinforcement.lua',
        name: 'weapons/reinforcement.lua',
        language: 'lua',
        content: `-- Reinforcement: click to add a new worm to the team, with 200 health.

local weapon = {}

weapon.record = {
  handling = {
    remember_selection = true,
    ends_turn = true,
  },
}

local COLLECT = "soundbank/Kamikaze/Collect"

local ERROR = "sounds/gravity_control/error.wav"

function weapon.definition()
  local shared = require("lib/shared")
  local fires = shared.fires
  return require("lib/weapon").merge(weapon.record, {
    wep = "weps/nuclear_test.wep",
    panel_icon = "sprites/reinforcement/icon.png",
    sounds = { COLLECT, ERROR },
    on_select = { cursor = true },
    on_click = function(ev) fires.reinforcement(ev) end,
  })
end

function weapon.setup()
  local shared = require("lib/shared")
  local NAME, HEALTH = "Reinforcement", 200
  local STAND = 12

  local function ground(x)
    local size = wa.world.size()
    local y = 0
    while y < size.h and wa.land.solid(x, y) do y = y + 1 end
    while y < size.h and not wa.land.solid(x, y) do y = y + 1 end
    if y >= size.h then return nil end
    return y
  end

  local DROP_Y = -200
  local SETTLE, AT_REST = 5, 0.1
  local ID = "px.reinforcement"
  local FULL = 8

  local function update_selectable()
    if not wa.weapons.set_selectable then return end
    local living = {}
    for _, w in ipairs(wa.worms.all()) do
      if w.hp > 0 then living[w.team] = (living[w.team] or 0) + 1 end
    end
    for team = 1, 6 do
      wa.weapons.set_selectable({ weapon = ID, team = team, selectable = (living[team] or 0) < FULL })
    end
  end

  wa.on.turn_start(update_selectable)
  wa.on.death(update_selectable)

  local dropping = {}

  wa.on.worm_message(function(w)
    local frames = dropping[w.id]
    if not frames then return end
    if w.state ~= "jetpacking" then
      dropping[w.id] = nil
      w.selectable = true
    elseif frames >= SETTLE and w.vy < AT_REST and not w:fits(w.x, w.y + 1) then
      dropping[w.id] = nil
      w:release(0, 0)
      w.selectable = true
    else
      dropping[w.id] = frames + 1
    end
  end, { msgs = { wa.msg.FRAME_FINISH } })

  shared.fires.reinforcement = function(ev)
    local worm = ev.worm
    local x = ev.x // 1
    local y = ground(x)
    local at = y and (y - STAND) or wa.world.water() - STAND
    local ok, spawned = pcall(wa.worms.spawn, { team = worm.team, x = x, y = DROP_Y, name = NAME, health = HEALTH })
    if not ok then
      wa.log("Reinforcement: " .. tostring(spawned))
      wa.sound.play(worm, ERROR)
    else
      wa.sound.play(worm, COLLECT)
      local flying, on = pcall(spawned.use, spawned, "stock.jet_pack")
      if flying and on then
        spawned.selectable = false
        dropping[spawned.id] = 0
      else
        spawned.x, spawned.y = x, at
      end
      if shared.fresh_hand then
        shared.fresh_hand(spawned)
      end
      update_selectable()
    end
  end
end

return weapon
`
      },
      {
        path: 'weapons/remote_roller.lua',
        name: 'weapons/remote_roller.lua',
        language: 'lua',
        content: `-- Remote Roller: a roller dropped at the worm's feet with a push of its own.

local weapon = {}

weapon.record = {
  fires = {
    launch_power_pct = 15,
  },
  missile = {
    alarm_worms = true,
    burst = "nothing",
    countdown = 0,
    explosion = {
      bias = 10,
      power = 43,
      push_pct = 110,
    },
    flight_sound = 88,
    fuse = 15000,
    gravity_pct = 90,
    impact_particles = true,
    roam = {
      edge_jump = {
        angle_deg = 25,
        sound = 88,
        speed = 3.0,
      },
      flight_hits = {},
      hits = {
        arrows = true,
        crates = true,
        donor_cards = true,
        land = true,
        mines = true,
        objects = true,
        water = true,
        worms_acting = true,
        worms_frozen = true,
        worms_jumping = true,
        worms_normal = true,
      },
      jump = {
        angle_deg = 0,
        sound = 88,
        speed = 0.0,
      },
      step_height = 20,
      terrain_offset = -5,
      walk_speed = 2.2,
    },
    speed_pct = 101,
    trail = {
      power = 10,
      speed = 30,
      sprite = 80,
    },
  },
  clusters = {
    bit = {
      action = "none",
      animation = 0,
      countdown = 0,
      explode_on_space = false,
      explosion = {
        power = 0,
        push_pct = 0,
      },
      flight_sound = 0,
      fuse = 0,
      gravity_pct = 0,
      speed_pct = 0,
      sprite = 0,
      sprite_count = 0,
      trail = {
        bubbles_per_second = 0.0,
        speed = 0,
        sprite = 0,
      },
    },
    count = 0,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.skunk",
    name = "Remote Roller",
    panel_icon = "sprites/remote_roller/rroller_ico.png",
    sprite = "sprites/remote_roller/flight.png",
    worm_sprites = {
          weaponlnk = "sprites/remote_roller/aim.png",
          weaponlnku = "sprites/remote_roller/aimu.png",
          weaponlnkd = "sprites/remote_roller/aimd.png",
          wthrow = "sprites/remote_roller/draw.png",
          wthrowu = "sprites/remote_roller/drawu.png",
          wthrowd = "sprites/remote_roller/drawd.png",
        },
  })
end

function weapon.configure(ctx, spec)
  spec.fires.launch_power_pct = ctx.option("launch_power")
end

return weapon
`
      },
      {
        path: 'weapons/sacrifice.lua',
        name: 'weapons/sacrifice.lua',
        language: 'lua',
        content: `-- Sacrifice: trades 50 HP for five seconds of turn time per step, keeping one HP.

local weapon = {
  definition = {
    copy_from = "stock.double_turn_time",
    name = "Sacrifice",
    panel_icon = "sprites/sacrifice/sacrifice_ico.png",
    handling = {remember_selection=false,ends_turn=false,retreat=-1},
    utility = {effect="scripted"},
    sounds = {"sounds/sacrifice/sacrifice_sound.wav", "sounds/sacrifice/sacrifice_error.wav"},
  },
  requires = {"lib/turn_controls"},
}

function weapon.setup()
  local choice
  require("lib/turn_controls").register("px.sacrifice", {
    choose = function(worm, digit)
      if digit >= 1 and digit <= 5 then
        choice = digit
        wa.sound.play(worm, 106)
      end
    end,
    fire = function(worm)
      if not choice then
        wa.sound.play(worm, "sounds/sacrifice/sacrifice_error.wav")
        return "eat"
      end
      local requested = choice
      choice = nil
      local steps = math.min(requested, math.floor((worm.hp - 1) / 50))
      if steps < 1 or not worm:reduce_health(50 * steps) then
        wa.sound.play(worm, "sounds/sacrifice/sacrifice_error.wav")
        require("lib/weapon_hint").notice(worm, "Sacrifice: not enough HP")
        return
      end
      wa.world.set_turn_clock(math.min(3600000,wa.world.turn_clock() + 5000 * steps))
      wa.sound.play(worm, "sounds/sacrifice/sacrifice_sound.wav")
      if steps < requested then
        require("lib/weapon_hint").notice(worm, "Sacrifice: added as much time\\nas your HP allows")
      end
    end,
    finish = function() choice = nil end,
    hint = function()
      return choice and string.format("Sacrifice: %d HP for %d seconds\\nSpace: sacrifice", 50*choice, 5*choice)
        or "Sacrifice: 50 HP per 5 seconds\\n1-5: how much, then Space"
    end,
  })
end
return weapon
`
      },
      {
        path: 'weapons/security_grenade.lua',
        name: 'weapons/security_grenade.lua',
        language: 'lua',
        content: `-- Security Grenade: a grenade whose blast is ringed by eight more blasts, 60 pixels out.

local grenade = require("lib/px_security_grenade")

return {
  defaults = {
    ammo = { round_start = -1 },
    delay = 0,
  },
  install = function(ctx)
    grenade.install(ctx)
  end,
}
`
      },
      {
        path: 'weapons/sentry_gun.lua',
        name: 'weapons/sentry_gun.lua',
        language: 'lua',
        content: `-- Sentry Gun: a turret that fires at moving enemy worms within 360 pixels.

local weapon = {}

weapon.record = {}

function weapon.definition()
  local shared = require("lib/shared")
  local fires = shared.fires
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.mine",
    name = "Sentry Gun",
    panel_icon = "sprites/sentry_gun/icon.png",
    is_weapon = true,
        worm_sprites = {
          weaponlnk = "sprites/sentry_gun/equip.png", weaponlnku = "sprites/sentry_gun/equipu.png",
          weaponlnkd = "sprites/sentry_gun/equipd.png",
          wthrow = "sprites/sentry_gun/unequip.png", wthrowu = "sprites/sentry_gun/unequipu.png",
          wthrowd = "sprites/sentry_gun/unequipd.png",
        },
    worm_sprites_team_tint = {
          worm_sprites = {
            weaponlnk = "sprites/sentry_gun/equip_housing.png", weaponlnku = "sprites/sentry_gun/equipu_housing.png",
            weaponlnkd = "sprites/sentry_gun/equipd_housing.png",
            wthrow = "sprites/sentry_gun/unequip_housing.png", wthrowu = "sprites/sentry_gun/unequipu_housing.png",
            wthrowd = "sprites/sentry_gun/unequipd_housing.png",
          },
          colours = { 0xFF6447, 0x4764FF, 0x47FF64, 0xE6E647, 0xE647E6, 0x47E6E6 },
        },
    sprites = {
          "sprites/sentry_gun/impact.png", "sprites/sentry_gun/casing.png", "sprites/sentry_gun/turret_base.png",
          "sprites/sentry_gun/turret_head.png", "sprites/sentry_gun/turret_flare.png", "sprites/sentry_gun/turret_light.png",
        },
    sounds = {
          "sounds/sentry_gun/sentryplace.wav", "sounds/sentry_gun/sentrybeeps2.wav",
          "sounds/sentry_gun/sentryfireloop.wav", "sounds/sentry_gun/sentryfireend.wav",
          "sounds/sentry_gun/sentryservostart.wav", "sounds/sentry_gun/sentryservoloop.wav",
          "sounds/sentry_gun/sentryservoend.wav",
        },
    params = {
          sprite_columns = 1,
          worm_sprites_animate = true,
          depth = wa.depth.BEHIND_TERRAIN,
          depth_prefix = "sprites/sentry_gun/turret_",
          gpu_prefix = "sprites/sentry_gun/turret_",
        },
    on_fire = function(fire) fires.sentry_gun(fire) end,
  })
end

function weapon.setup()
  local shared = require("lib/shared")
  local turret = require("lib/turret")
  local ART = "sprites/sentry_gun/"
  local SND = "sounds/sentry_gun/"
  local MUZZLE_OUT = 11 -- pixels from the pivot along the bore
  local SPREAD_TENTHS = 20 -- +-2.0 degrees
  local CASING = ART .. "casing.png"
  local CASING_FRAMES, CASING_LIFE = 16, 100
  local CASING_JITTER_DEG = 17 -- PX's RandomFloat(-0.3, 0.3) rad
  local CASING_SPEED_MIN, CASING_SPEED_MAX = 200, 300 -- PX's 2.0 to 3.0, hundredths

  local TEAM_TINT = { 0xFF6447, 0x4764FF, 0x47FF64, 0xE6E647, 0xE647E6, 0x47E6E6 }
  shared.sentry_team_tint = TEAM_TINT

  local function casing(t, a, s, rad)
    local jitter = wa.random(-CASING_JITTER_DEG, CASING_JITTER_DEG)
    local eject = rad + math.rad(90 * s.side + jitter)
    local speed = wa.random(CASING_SPEED_MIN, CASING_SPEED_MAX) / 100
    local life, spin = CASING_LIFE, 0
    wa.actors.spawn({
      sprite = CASING, x = a.x, y = a.y - t.muzzle_up,
      vx = (wa.math.sin(eject) * speed), vy = (wa.math.cos(eject) * speed),
      owner = t.owner(a, s),
      on = function(c)
        life = life - 1
        if life <= 0 then c:remove(); return end
        c.vy = c.vy + wa.world.gravity()
        c:move({ terrain = false, worms = false })
        spin = (spin + 1) % CASING_FRAMES
        c:frame(spin)
      end,
    })
  end

  local function fire(t, a, s)
    local owner = t.owner(a, s)
    if owner == a then t.stop_firing(a, s); return end
    s.shots = s.shots + 1
    local dev = 0
    if s.shots % 5 ~= 0 then dev = wa.random(-SPREAD_TENTHS, SPREAD_TENTHS) / 10 end
    local rad = math.rad(s.angle + dev)
    local dx, dy = wa.math.sin(rad), wa.math.cos(rad)
    local mx, my = turret.muzzle(t, a, s.angle)
    casing(t, a, s, rad)
    wa.weapons.fire_bullet {
      weapon = "stock.uzi", owner = owner,
      x = mx, y = my, dx = dx, dy = dy,
      damage = t.damage, push_pct = t.push_pct, ignore = { a },
    }
    s.ammo = s.ammo - 1
    if s.ammo <= 0 then
      s.active = false
      t.stop_firing(a, s)
    end
  end

  local gun = turret.new({
    kind = "sentry", weapon = "px.sentry_gun",
    tazer = "stun", -- the Tazer's arc stuns it (PxSentryGun::Stun)
    damage = 2, push_pct = 100,
    muzzle_out = MUZZLE_OUT,
    art = { base = ART .. "turret_base.png", mask = ART .. "turret_mask.png", gun = ART .. "turret_head.png", turns = 256, gun_size = 52, flare = ART .. "turret_flare.png", light = ART .. "turret_light.png" },
    sounds = {
      place = SND .. "sentryplace.wav", beep = SND .. "sentrybeeps2.wav",
      fire_loop = SND .. "sentryfireloop.wav", fire_end = SND .. "sentryfireend.wav",
      servo_start = SND .. "sentryservostart.wav", servo_loop = SND .. "sentryservoloop.wav",
      servo_end = SND .. "sentryservoend.wav",
    },
    tints = TEAM_TINT,
    fire = fire,
  })

  shared.fires.sentry_gun = function(fire_ev) gun.place(fire_ev) end
  shared.sentry_gun = gun -- for the Highlander mock
end

function weapon.configure(ctx)
  local gun = require("lib/shared").sentry_gun
  gun.health = ctx.option("health")
  gun.ammo = ctx.option("ammo")
  gun.damage = ctx.option("damage")
  gun.push_pct = ctx.option("push_pct")
end

return weapon
`
      },
      {
        path: 'weapons/sentry_laser.lua',
        name: 'weapons/sentry_laser.lua',
        language: 'lua',
        content: `-- Sentry Laser: a turret that shoots down missiles, mines and bowling balls with a laser.

local weapon = {}

weapon.record = {}

function weapon.definition()
  local shared = require("lib/shared")
  local fires = shared.fires
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.mine",
    name = "Sentry Laser",
    panel_icon = "sprites/sentry_laser/icon.png",
    is_weapon = true,
    worm_sprites = {
          weaponlnk = "sprites/sentry_laser/equip.png", weaponlnku = "sprites/sentry_laser/equipu.png",
          weaponlnkd = "sprites/sentry_laser/equipd.png",
          wthrow = "sprites/sentry_laser/unequip.png", wthrowu = "sprites/sentry_laser/unequipu.png",
          wthrowd = "sprites/sentry_laser/unequipd.png",
        },
        worm_sprites_team_tint = {
          worm_sprites = {
            weaponlnk = "sprites/sentry_laser/equip_housing.png", weaponlnku = "sprites/sentry_laser/equipu_housing.png",
            weaponlnkd = "sprites/sentry_laser/equipd_housing.png",
            wthrow = "sprites/sentry_laser/unequip_housing.png", wthrowu = "sprites/sentry_laser/unequipu_housing.png",
            wthrowd = "sprites/sentry_laser/unequipd_housing.png",
          },
          colours = { 0xFF6447, 0x4764FF, 0x47FF64, 0xE6E647, 0xE647E6, 0x47E6E6 },
        },
    sprites = {
          "sprites/sentry_laser/turret_base.png", "sprites/sentry_laser/turret_head.png",
          "sprites/sentry_laser/turret_barrel.png", "sprites/sentry_laser/turret_light.png",
          "sprites/laser_gun/laser_beam.png", "sprites/laser_gun/laser_glow.png",
        },
    sounds = {
          "sounds/sentry_laser/sentrylaserplace.wav", "sounds/sentry_laser/sentrylaserbeep.wav",
          "sounds/sentry_laser/sentrylaserstart.wav", "sounds/sentry_laser/sentrylaserloop.wav",
          "sounds/sentry_laser/sentrylaserend.wav", "sounds/sentry_laser/sentrylaserdisin.wav",
          "sounds/laser_gun/laser_start.wav", "sounds/laser_gun/laser_end.wav",
        },
    params = {
          sprite_columns = 1,
          worm_sprites_animate = true,
          depth = wa.depth.BEHIND_TERRAIN,
          depth_prefix = "sprites/sentry_laser/turret_",
          gpu_prefix = "sprites/sentry_laser/turret_",
        },
    on_fire = function(fire) fires.sentry_laser(fire) end,
  })
end

function weapon.setup()
  local shared = require("lib/shared")
  local turret = require("lib/turret")
  local laser = require("lib/laser")
  local ART = "sprites/sentry_laser/"
  local SND = "sounds/sentry_laser/"
  local RAY_LIFE = 10 -- CLaserRayS LifeTime: frames the beam shows
  local MUZZLE_OUT = 17 * 0.8 + 6
  local RECOIL_FRAMES = 12
  local HOLE = 4 -- MakeHole where the beam stops
  local WORM_DAMAGE, OBJECT_DAMAGE = 10, 20
  local RADIUS = { worm = 6, mine = 5, crate = 9, oil = 9 }

  local TEAM_TINT = shared.sentry_team_tint or { 0xFF6447, 0x4764FF, 0x47FF64, 0xE6E647, 0xE647E6, 0x47E6E6 }
  local BEAM_RGB = {
    { 255, 0, 0 }, { 0, 0, 255 }, { 0, 255, 0 }, { 255, 255, 0 }, { 255, 0, 255 }, { 0, 255, 255 },
  }

  local rays = {} -- every ray still showing, in the order fired

  local function targets()
    local out = {}
    for _, group in ipairs({ wa.missiles, wa.mines }) do
      for _, o in ipairs(group.all()) do
        out[#out + 1] = { key = o.id, x = o.x, y = o.y, alliance = o.alliance,
          moving = o.vx ~= 0 or o.vy ~= 0, obj = o }
      end
    end
    if shared.bowling_ball_targets then
      for _, b in ipairs(shared.bowling_ball_targets()) do
        out[#out + 1] = { key = "ball:" .. b.id, x = b.x, y = b.y, alliance = b.alliance,
          moving = b.moving, ball = b.id }
      end
    end
    return out
  end

  local function touched(x0, y0, dx, dy, length, skip)
    local out = {}
    for _, group in ipairs({ wa.worms, wa.mines, wa.crates, wa.oil }) do
      for _, obj in ipairs(group.all()) do
        if obj.id ~= skip then
          local ox, oy = (obj.x - x0), (obj.y - y0)
          local along = ox * dx + oy * dy
          local across = math.abs(ox * dy - oy * dx)
          if along >= 0 and along <= length and across <= (RADIUS[obj.kind] or 6) then
            out[#out + 1] = obj
          end
        end
      end
    end
    return out
  end

  local function fx_hit_object(r, x, y)
    local tone = math.floor(laser.between(r, 0, 50))
    laser.particle(r, { x = x, y = y, life = 10, drag = 0, grav = 0,
      s0 = laser.between(r, 0.4, 0.8), s1 = 0.01, c0 = { 210, 210 - tone, 0 }, c1 = { 210, 50 - tone, 0 } })
    for _ = 1, 3 do
      local a, v = laser.between(r, 0, 2 * math.pi), laser.between(r, 0.5, 1.8)
      tone = math.floor(laser.between(r, 0, 50))
      laser.particle(r, { x = x, y = y, vx = v * wa.math.cos(a), vy = v * wa.math.sin(a),
        life = 50, drag = 0.05, grav = 1, jitter = 0.2, s0 = laser.between(r, 0.5, 0.7), s1 = 0.01,
        c0 = { 255, 255 - tone, 0 }, c1 = { 255, 80 - tone, 0 } })
    end
  end

  local function fx_disintegrate(r, x, y)
    local c, dim = r.rgb, { r.rgb[1] * 0.2, r.rgb[2] * 0.2, r.rgb[3] * 0.2 }
    for _ = 1, 5 do -- FX_InitialBurst
      local v = laser.between(r, 5, 8)
      local ang = r.ang + laser.between(r, -0.25, 0.25)
      laser.particle(r, { x = r.x, y = r.y, vx = -v * wa.math.sin(ang), vy = -v * wa.math.cos(ang),
        life = 40, drag = 0.1, grav = 0.4, jitter = 0.5, s0 = laser.between(r, 0.4, 0.7), s1 = 0.01,
        c0 = c, c1 = dim, alpha = 215 })
    end
    laser.particle(r, { x = r.x, y = r.y, life = 25, drag = 0, grav = 0, s0 = 0.6, s1 = 0.01,
      c0 = c, c1 = dim, alpha = 225 }) -- FX_BarrelFlash
    local tone = math.floor(laser.between(r, 0, 50))
    local v = laser.between(r, 2, 5)
    laser.particle(r, { x = r.x, y = r.y, vx = v * wa.math.sin(r.ang), vy = -v * wa.math.cos(r.ang),
      life = 30, drag = 0.3, grav = 0.8, jitter = 0.8, s0 = laser.between(r, 0.2, 0.5), s1 = 0.01,
      c0 = { 255, 255 - tone, 0 }, c1 = { 255, 80 - tone, 0 } }) -- FX_MuzzleSparks
    for i = 0, 3 do -- FX_Disintegrate
      local a = math.pi / 4 + math.pi / 2 * i
      laser.particle(r, { x = x, y = y, vx = 1.5 * wa.math.sin(a), vy = 1.5 * wa.math.cos(a),
        life = 60, drag = 0.05, grav = 0, s0 = 0.5, s1 = 0.01, c0 = c, c1 = dim })
    end
    fx_hit_object(r, x, y)
    laser.particle(r, { x = x, y = y, life = 40, drag = 0.2, grav = -0.4, jitter = 0.6,
      s0 = laser.between(r, 0.6, 0.9), s1 = 0.01, c0 = c, c1 = c })
    laser.particle(r, { x = x, y = y, life = 50, drag = 0, grav = 0, s0 = 0.6, s1 = 0.1,
      c0 = c, c1 = { c[1] * 0.3, c[2] * 0.3, c[3] * 0.3 } })
  end

  local function ray_actor(r, body)
    wa.actors.spawn({
      sprite = false, x = r.x, y = r.y, owner = body,
      on = function(a)
        laser.step(r)
        r.life = r.life - 1
        r.size = r.size - 0.07
        if r.size < 0.5 then r.size = 1.0 end
        if r.life == 0 then wa.sound.play(a, "sounds/laser_gun/laser_end.wav") end
        if r.life <= 0 and #r.fx == 0 then
          for i, other in ipairs(rays) do
            if other == r then table.remove(rays, i) break end
          end
          a:remove()
        end
      end,
    })
  end

  local function fire(t, a, s, target)
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
    wa.sound.play(a, "sounds/laser_gun/laser_start.wav")

    wa.land.cut({ x = hx, y = hy, shape = "circle", radius = HOLE })
    for _, obj in ipairs(touched(x0, y0, dx, dy, length, target.obj and target.obj.id)) do
      if obj.kind == "worm" then
        if obj.hp > 0 then obj:hit(WORM_DAMAGE) end
      elseif obj.kind == "crate" or obj.kind == "oil" then
        obj:hit(OBJECT_DAMAGE, dx, dy)
      elseif obj.kind == "mine" and not s.armed[obj.id] then
        s.armed[obj.id] = true
        obj:arm(obj.fuse < 0 and wa.random(1000, 5000) or obj.fuse)
      end
      fx_hit_object(r, obj.x + (3 * dx), obj.y + (3 * dy))
    end

    if not land then
      if target.ball then
        shared.remove_bowling_ball(target.ball)
      elseif target.obj then
        target.obj:remove()
      end
      fx_disintegrate(r, target.x, target.y)
      wa.sound.play(a, SND .. "sentrylaserdisin.wav")
      s.tid, s.had_target = nil, false
    end
    ray_actor(r, a)

    t.stop_firing(a, s)
    s.recoil = RECOIL_FRAMES
    s.ammo = s.ammo - 1
    if s.ammo <= 0 then s.active = false end
  end

  local sentry = turret.new({
    kind = "sentry_laser", weapon = "px.sentry_laser",
    tazer = "stun", -- the Tazer's arc stuns it (PxSentryLaser::Stun)
    muzzle_out = MUZZLE_OUT,
    sensor_px = 300, ammo = 4, shot_frames = 6, activate = 20, beep_frames = 20,
    rot_active = 5.0, aim_tolerance = 5.0, health = 35,
    art = { base = ART .. "turret_base.png", mask = ART .. "turret_mask.png", gun = ART .. "turret_head.png", turns = 256, gun_size = 36, barrel = ART .. "turret_barrel.png", light = ART .. "turret_light.png" },
    sounds = {
      place = SND .. "sentrylaserplace.wav", beep = SND .. "sentrylaserbeep.wav",
      servo_start = SND .. "sentrylaserstart.wav", servo_loop = SND .. "sentrylaserloop.wav",
      servo_end = SND .. "sentrylaserend.wav",
    },
    tints = TEAM_TINT,
    targets = targets,
    fire = fire,
  })

  local place = sentry.place
  sentry.place = function(fire_ev)
    local body, s = place(fire_ev)
    if s then s.armed = {} end
    return body, s
  end

  shared.fires.sentry_laser = function(fire_ev) sentry.place(fire_ev) end
  shared.sentry_laser = sentry -- for the Highlander mock

  if wa.on.draw and wa.draw.ribbon then
    wa.on.draw(function()
      for _, r in ipairs(rays) do
        laser.draw_particles(r)
        if r.life > 0 then
          local c = laser.argb(255, r.rgb)
          laser.beam(r.x, r.y, r.hx, r.hy, 2 * 4 * r.size, c)
          laser.glow(r.hx, r.hy, 32 * 0.4 * r.size, c)
        end
      end
    end)
  end
end

function weapon.configure(ctx)
  require("lib/shared").sentry_laser.health = ctx.option("health")
end

return weapon
`
      },
      {
        path: 'weapons/shadow_bolt.lua',
        name: 'weapons/shadow_bolt.lua',
        language: 'lua',
        content: `-- Shadow-Bolt: a crossbow that fires a shadow bolt.

local weapon = {}

weapon.record = {
  fires = {
    method = 3,
    subtype = 2,
  },
  missile = {
    action = "bounce",
    animation = 2,
    bounce = {
      bounciness = 80,
      hits = {
        water = true,
        worms_frozen = true,
      },
      max_bounces = 10,
      sound = 83,
      terrain_keep_speed_pct = 80,
    },
    collision_shape = 3,
    ends_on_contact = {
      crates = true,
      donor_cards = true,
      mines = true,
      objects = true,
      water = true,
      worms = true,
    },
    explosion = {
      bias = 8,
      power = 28,
      push_pct = 250,
    },
    flight_sound = 122,
    fuse = 10000,
    gravity_pct = 110,
    impact_particles = true,
    speed_pct = 100,
    trail = {
      bubbles_per_second = 12.5,
      power = 40,
      speed = 180,
      sprite = 453,
    },
  },
}

weapon.missile_sprite = { -- Shadow-Bolt
    sheet = "sprites/shadow_bolt/bolt.png", animate = true, anim_speed = 1.30, frames = 6,
  }

function weapon.definition()
  local shared = require("lib/shared")
  local fires = shared.fires
  local sdk = require("wf-lib/holds")
  local PX_POSTURE = sdk.PX_POSTURE
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.longbow",
    name = "Shadow-Bolt",
    panel_icon = "sprites/shadow_bolt/ico_shadowb.png",
    worm_sprites = PX_POSTURE,
    sprite_overrides = { [453] = "sprites/shadow_bolt/trail.png" },
    sprites = { "sprites/px_hold/shadow_bolt.png", "sprites/shadow_bolt/bolt.png" },
    params = { gpu_prefix = "sprites/" },
    hold = {
        keep_while_firing = true,
        sheet = "sprites/px_hold/shadow_bolt.png", draw_hand = false, hand_radius = 0.0,
        hand_rotation = 0.0, hand_radial_rotation = 0.0,
        weap_rotation = 1.0, weap_radial_rotation = 0.0, weap_radius = 3.5,
        animate = true, anim_speed = 1.30, frames = 6,
      },
  })
end

return weapon
`
      },
      {
        path: 'weapons/skip_go_surrender.lua',
        name: 'weapons/skip_go_surrender.lua',
        language: 'lua',
        content: `-- Skip Go/Surrender: Space skips the turn; Ctrl + Space surrenders.

local weapon = {}

weapon.record = {}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.skip_go",
    name = "Skip Go/Surrender",
    panel_icon = "sprites/skip_go/icon.png",
    stock_fire_choice = { held = "ctrl", alternate = "stock.surrender" },
  })
end

function weapon.setup()
  require("lib/weapon_hint").hint("px.skip_go_surrender", function()
    return "Skip Go/Surrender\\nSpace: skip go\\nCtrl + Space: surrender"
  end)
end

return weapon
`
      },
      {
        path: 'weapons/skunk.lua',
        name: 'weapons/skunk.lua',
        language: 'lua',
        content: `-- Skunk: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  fires = {
    creates_projectile = true,
    launch_power_pct = 5,
    method = 2,
    subtype = 0,
    type = 2,
  },
  handling = {
    remember_selection = true,
    ends_turn = true,
    shots = 0,
  },
  missile = {
    action = "roam",
    animation = 6,
    burst = "clusters",
    collision_shape = 2,
    explode_on_space = true,
    explosion = {
      push_pct = 100,
    },
    flight_sound = 65578,
    gravity_pct = 100,
    roam = {
      flight_hits = {
        crates = true,
        donor_cards = true,
        land = true,
        objects = true,
        water = true,
        worms = true,
        worms_frozen = true,
      },
      hits = {
        crates = true,
        donor_cards = true,
        land = true,
        objects = true,
        water = true,
        worms = true,
        worms_frozen = true,
      },
      jump = {
        angle_deg = 15,
        sound = 43,
        speed = 7.2,
      },
      step_height = 4,
      terrain_offset = -4,
      walk_speed = 2.0,
    },
    speed_pct = 100,
    sprite = 173,
    trail = {
      bubbles_per_second = 12.5,
      speed = 100,
      sprite = 131,
    },
  },
  clusters = {
    bit = {
      action = "roam",
      animation = 6,
      countdown = 5000,
      explode_on_space = true,
      explosion = {
        power = 30,
        push_pct = 100,
      },
      flight_sound = 65577,
      fuse = 10000,
      gravity_pct = 100,
      roam = {
        gas = {
          animal_sprite = 174,
          poison_power = 15,
          start_delay_ms = 1,
        },
        hits = {
          crates = true,
          donor_cards = true,
          land = true,
          objects = true,
          water = true,
          worms = true,
          worms_frozen = true,
        },
        jump = {
          angle_deg = 15,
          sound = 43,
          speed = 7.2,
        },
        step_height = 4,
        terrain_offset = -4,
        walk_speed = 2.0,
      },
      speed_pct = 100,
      sprite = 173,
      sprite_count = 1,
      trail = {
        bubbles_per_second = 12.5,
        speed = 100,
        sprite = 131,
      },
    },
    count = 1,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.damage_x2",
    name = "Skunk",
    panel_icon = "skunk",
  })
end

return weapon
`
      },
      {
        path: 'weapons/small_worm.lua',
        name: 'weapons/small_worm.lua',
        language: 'lua',
        content: `-- Small Worm: the worm takes a mine's shape, lighter gravity and more mass until the turn is over.

local weapon = {}
local ID = "px.small_worm"
local BODY = { scale = 0.85, y = -2 }
local GRAVITY, MASS = 0.75, 1.5

weapon.definition = {
  copy_from = "stock.double_turn_time",
  name = "Small Worm",
  panel_icon = "sprites/small_worm/small_ico.png",
  handling = { remember_selection = false, ends_turn = false, retreat = -1 },
  utility = { effect = "scripted" },
}
weapon.requires = { "lib/turn_controls" }

function weapon.setup()
  local small = {}

  local function activate(worm)
    small[worm.id] = { ending = false }
    worm.y = worm.y - 5
    worm.shape = "mine"
    worm.gravity = worm.gravity * GRAVITY
    worm.mass = worm.mass * MASS
    worm.body_scale = BODY
    require("lib/weapon_hint").notice(worm, "Small worm mode: ON")
  end

  local function deactivate(worm)
    small[worm.id] = nil
    worm.shape = "worm"
    worm.y = worm.y - 9
    worm.vx, worm.vy = 0, 0
    if not worm:fits(worm.x, worm.y) then
      local x, y = worm.x, worm.y
      for _, h in ipairs({ { 0, -4, 5 }, { -6, 4, 4 }, { 6, 4, 4 }, { -6, 0, 4 }, { 6, 0, 4 }, { 0, -1, 4 } }) do
        wa.land.cut({ x = x + h[1], y = y + h[2], shape = "circle", radius = h[3] })
      end
    end
    worm.gravity = worm.gravity / GRAVITY
    worm.mass = worm.mass / MASS
    worm.body_scale = nil
    require("lib/weapon_hint").notice(worm, "Small worm mode: OFF")
  end

  require("lib/turn_controls").register(ID, {
    fire = function(worm)
      if worm.vx ~= 0 or worm.vy ~= 0 then return "eat" end
      if small[worm.id] then deactivate(worm) else activate(worm) end
    end,
  })
  wa.on.turn_end(function()
    for _, s in pairs(small) do s.ending = true end
  end)
  wa.on.worm_message(function(worm)
    local s = small[worm.id]
    if s and s.ending and worm.state == "standing" then deactivate(worm) end
  end, { msgs = { wa.msg.FRAME_FINISH } })
end

return weapon
`
      },
      {
        path: 'weapons/sniper_rifle.lua',
        name: 'weapons/sniper_rifle.lua',
        language: 'lua',
        content: `-- Sniper Rifle: a rifle with a laser sight: one precise shot.

local weapon = {}

weapon.record = {
  handling = {
    shots = 3,
  },
  gun = {
    bullets = 1,
    damage = 18,
    explosion = {
      push_pct = 100,
      variation = 50,
    },
    hits = {
      arrows = true,
      crates = true,
      donor_cards = true,
      land = true,
      mines = true,
      objects = true,
      water = true,
      worms = true,
      worms_frozen = true,
    },
    impact_effect = 7,
    shot_interval_ms = 1000,
    spread_deg = 0,
  },
}

function weapon.definition()
  local sdk = require("wf-lib/holds")
  local PX_POSTURE = sdk.PX_POSTURE
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.handgun",
    name = "Sniper Rifle",
    panel_icon = "sprites/sniper_rifle/srico.png",
    worm_sprites = {
          weaponlnk = PX_POSTURE.weaponlnk, weaponlnku = PX_POSTURE.weaponlnku,
          weaponlnkd = PX_POSTURE.weaponlnkd,
          wthrow = PX_POSTURE.wthrow, wthrowu = PX_POSTURE.wthrowu, wthrowd = PX_POSTURE.wthrowd,
          weaponfire = "sprites/sniper_rifle/fire.png", weaponfireu = "sprites/sniper_rifle/fireu.png",
          weaponfired = "sprites/sniper_rifle/fired.png",
        },
    sprites = {
          "sprites/px_hold/sniper_rifle.png", "sprites/sniper_rifle/laser.png", "sprites/sniper_rifle/flash.png",
        },
    sounds = { "sounds/sniper_firing.wav" },
    params = { gpu_prefix = "sprites/" },
    hold = {
        keep_while_firing = true,
        put_away = true,
        flash = { sheet = "sprites/sniper_rifle/flash.png", out = 30, side = 2, scale = 0.45, frames = 3 },
        sheet = "sprites/px_hold/sniper_rifle.png", draw_hand = false, hand_radius = -6.0,
        hand_rotation = 1.0, hand_radial_rotation = 0.9,
        weap_rotation = 1.0, weap_radial_rotation = 0.0, weap_radius = 0.1,
      },
  })
end

function weapon.setup()
  local shared = require("lib/shared")

  local held = {}
  wa.on.worm_message(function(worm, msg)
    local h = held[worm.id]
    if msg == wa.msg.FIRE_WEAPON and h then h.firing = true end
    if msg == wa.msg.FIRE_WEAPON and worm.weapon == "px.sniper_rifle"
        and worm:ammo("px.sniper_rifle") ~= 0 then
      wa.sound.play(worm, "sounds/sniper_firing.wav")
    end
    if msg ~= wa.msg.FRAME_FINISH then return end
    if worm.weapon == "px.sniper_rifle" and worm.aiming and shared.owns("px.sniper_rifle") then
      held[worm.id] = { weapon = "px.sniper_rifle", aim = worm.aim }
    elseif not (h and h.firing and worm.weapon == "px.sniper_rifle"
        and (worm.state == "firing" or worm.state == "fired")) then
      held[worm.id] = nil
    end
  end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })

  local STOPPERS
  do

  local LASER_LEN = 15000
  local LASER_WIDTH = 2
  local LASER_STEP = 5 -- PX's Trace tests every 5 pixels
  local LASER_BARREL = 2
  local function argb(a, r, g, b)
    return ((a * 256 + r) * 256 + g) * 256 + b
  end
  local LASER_RED, LASER_START, LASER_TIP =
    argb(255, 255, 48, 48), argb(192, 255, 96, 96), argb(16, 255, 48, 48)
  STOPPERS = { { wa.worms, 6 }, { wa.mines, 4 }, { wa.crates, 10 }, { wa.oil, 9 } }

  local function laser_length(x, y, dx, dy, shooter)
    local len = LASER_LEN
    local hit = wa.land.trace(x, y,
      (x + dx * LASER_LEN), (y + dy * LASER_LEN))
    if hit then
      len = math.sqrt(((hit.x - x) * (hit.x - x)) + ((hit.y - y) * (hit.y - y)))
    end
    for _, s in ipairs(STOPPERS) do
      local list, r = s[1], s[2]
      if list and list.all then
        for _, o in ipairs(list.all()) do
          if o.id ~= shooter then
            local ox, oy = (o.x - x), (o.y - y)
            local t = ox * dx + oy * dy
            if t > 0 and t < len and math.abs(ox * dy - oy * dx) < r then
              len = t
            end
          end
        end
      end
    end
    return math.floor(len / LASER_STEP) * LASER_STEP
  end

  local function laser_ray(x, y, ang, len, worm)
    local rdx, rdy = wa.math.sin(ang - 1.57), -wa.math.cos(ang - 1.57)
    local dx, dy = wa.math.sin(ang), -wa.math.cos(ang)
    local tx, ty = x, y
    local nparts = math.floor(len / 100)
    local w = (wa.draw.random() / 4 + 0.85) * LASER_WIDTH / 2
    local wdx, wdy = w * rdx, w * rdy
    local wscale = 1
    local lastl = len - nparts * 100
    local colors
    for i = 0, nparts do
      local l = i == nparts and lastl or 100
      if l <= 0 then break end
      local p0, p3 = { tx + wdx, ty + wdy }, { tx - wdx, ty - wdy }
      w = wscale * (wa.draw.random() / 3 + 0.82) * LASER_WIDTH
      wdx, wdy = w * rdx, w * rdy
      wscale = wscale - 0.75 / (nparts + 1)
      local ex, ey = tx + dx * l, ty + dy * l
      colors = { LASER_RED, LASER_RED, LASER_RED, LASER_RED }
      if i == 0 then
        colors[1], colors[4] = LASER_START, LASER_START
      end
      wa.draw.quad({
        points = { p0, { ex + wdx, ey + wdy }, { ex - wdx, ey - wdy }, p3 },
        colors = colors, sprite = "sprites/sniper_rifle/laser.png", blend = "add", visibility = worm,
      })
      tx, ty = ex, ey
    end
    local ex, ey = tx + dx * 7, ty + dy * 7
    wa.draw.quad({
      points = { { tx + wdx, ty + wdy }, { ex + wdx, ey + wdy }, { ex - wdx, ey - wdy }, { tx - wdx, ty - wdy } },
      colors = { LASER_RED, LASER_TIP, LASER_TIP, LASER_RED },
      sprite = "sprites/sniper_rifle/laser.png", blend = "add", visibility = worm,
    })
  end

  if wa.on.draw then
    wa.on.draw(function()
      for _, worm in ipairs(wa.worms.all()) do
        local h = worm.turn and held[worm.id]
        local aim = h and h.weapon == "px.sniper_rifle" and h.aim
        if aim then
          local ang = (1 - aim) * 3.14159
          if worm.facing < 0 then
            ang = 6.28318 - ang
          end
          local side = LASER_BARREL * worm.facing
          local x = worm.x + wa.math.sin(ang) * 12 - wa.math.cos(ang) * side
          local y = worm.y - wa.math.cos(ang) * 12 - wa.math.sin(ang) * side
          laser_ray(x, y, ang, laser_length(x, y, wa.math.sin(ang), -wa.math.cos(ang), worm.id), worm)
        end
      end
    end)
  end
  end

end

return weapon
`
      },
      {
        path: 'weapons/spot_hider.lua',
        name: 'weapons/spot_hider.lua',
        language: 'lua',
        content: `-- Spot Hider: a thrown zone that hides the spot it lands on in darkness for four turns.

local spot_hider = require("lib/px_spot_hider")

return {
  defaults = {
    ammo = { round_start = -1 },
    delay = 0,
  },
  install = function(ctx)
    spot_hider.install(ctx)
  end,
}
`
      },
      {
        path: 'weapons/sticky_bomb.lua',
        name: 'weapons/sticky_bomb.lua',
        language: 'lua',
        content: `-- Sticky Bomb: a grenade that sticks where it lands, then explodes.

local weapon = {}

weapon.record = {
  missile = {
    action = "none",
    burst = "clusters",
    countdown = 0,
    ends_on_contact = {
      arrows = true,
      canisters = true,
      crates = true,
      land = true,
      mines = true,
      objects = true,
      water = true,
      worms = true,
      worms_frozen = true,
    },
    explosion = {
      bias = 0,
      power = 0,
      push_pct = 0,
    },
    explosion_sound = {
      sound = 39,
    },
    fuse = 2000000,
    sprite = 0,
  },
  clusters = {
    bit = {
      action = "dig",
      animation = 1,
      countdown = 4000,
      dig = {
        dive_sprite = 467,
        sprite_1 = 467,
        sprite_2 = 467,
        sprite_3 = 467,
      },
      ends_on_contact = {
        water = true,
      },
      explosion = {
        power = 55,
        push_pct = 60,
      },
      explosion_sound = {
        enabled = true,
      },
      flight_sound = 56,
      fuse = 4000,
      gravity_pct = 100,
      sprite_count = 1,
      trail = {
        bubbles_per_second = 12.5,
        power = 50,
        speed = 50,
        sprite = 80,
      },
    },
    count = 1,
  },
}

weapon.missile_sprite = {
    sheet = "sprites/sticky_bomb/bomb.png", frames = 1,
    spin = true, -- its record's WAT_Rotation
    first_sprite = 0, -- the bomb flies with no stock sprite; its bit keeps the cluster sheet
  }

function weapon.definition()
  local sdk = require("wf-lib/holds")
  local PX_POSTURE, PX_HANDS = sdk.PX_POSTURE, sdk.PX_HANDS
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.grenade",
    name = "Sticky Bomb",
    panel_icon = "sprites/sticky_bomb/sbico.png",
    hold_as = "stock.grenade",
    cluster_sprite = "sprites/sticky_bomb/bomb.png",
        sprite_overrides = {
          wsvclnku = "sprites/sticky_bomb/bomb.png", -- 467
        },
    worm_sprites = PX_POSTURE,
        sprites = { "sprites/px_hold/sticky_bomb.png", "sprites/sticky_bomb/bomb.png" },
    params = { gpu_prefix = "sprites/" },
    hold = { -- Sticky Bomb (sb_script)
        thrown = true,
        sheet = "sprites/px_hold/sticky_bomb.png", hand_type = 1, hand_radius = 24,
        hand_rotation = 1.0, hand_radial_rotation = 1.05, hand_scale = 0.8,
        weap_rotation = 0.5, weap_radial_rotation = 0.9, weap_radius = 10,
        hand = PX_HANDS[1],
    },
  })
end

return weapon
`
      },
      {
        path: 'weapons/submarine_attack.lua',
        name: 'weapons/submarine_attack.lua',
        language: 'lua',
        content: `-- Submarine Attack: a submarine rises under the click and fires twenty missiles up.

local weapon = {}

weapon.record = {
  handling = {
    ends_turn = true,
  },
}

weapon.defaults = {
  cursor = { flip = true, dy = 20 },
}

local SHEET = "sprites/submarine_attack/submarine.png"
local SUB_SOUND = "sounds/submarine_attack/substrike.wav"
local BOMB_SOUND = "sounds/submarine_attack/substrikem.wav"

function weapon.definition()
  local shared = require("lib/shared")
  return require("lib/weapon").merge(weapon.record, {
    wep = "weps/mine_strike.wep",
    panel_icon = "sprites/submarine_attack/icon.png",
    sprites = { SHEET },
    sounds = { SUB_SOUND, BOMB_SOUND },
    on_select = { cursor = true },
    on_click = function(ev) shared.submarine_click(ev) end,
  })
end

function weapon.setup()
  local shared = require("lib/shared")

  local NUM_BOMBS = 20
  local BOMB_DISTANCE = 30
  local FRAMES_BETWEEN = 3
  local PLANE_SPEED = BOMB_DISTANCE // FRAMES_BETWEEN
  local APPEAR_X = 16 -- PxAirstrikeParams.PlaneAppearXOffset
  local BOMB_VX, BOMB_VY = 10, -15 -- BombSpX = 10 * the strike's +-1, BombSpY
  local BEFORE_ATTACK, AFTER_ATTACK = 120, 70
  local SIZE = 104
  local FRAMES = 6
  local DEPTH = 0x20000
  local TINT = 0x7878FF

  local BOMB = {
    sprite = "airmisl", -- 60
    trail = { sprite = "hexhaust", power = 10, speed = 125 }, -- 131
    explosion = { power = 20, push_pct = 100, bias = 15, variation = 0 },
    gravity_pct = 100,
    wind_pct = 0,
    random_motion = 25,
    speed_pct = 100,
    fuse = 10000,
    countdown = 0,
    explode_on_space = false,
    flight_sound = 0, -- substrikem.wav instead
    ends_on_contact = {
      land = true, worms = true, worms_frozen = true, crates = true,
      donor_cards = true, objects = true, water = true,
    },
  }

  local subs = {}

  local function sign(n)
    if n > 0 then return 1 elseif n < 0 then return -1 end
    return 0
  end

  local function plane_start(s, water, width)
    local x = s.tx
    local below = math.max(0, s.ty - water) // 1
    x = x - 3.0 * BOMB_VX * math.sqrt(below)
    local drop = NUM_BOMBS // 2
    x = x - s.dir * BOMB_DISTANCE / 2
    while drop > -10 and ((s.dir == 1 and x > -APPEAR_X) or (s.dir == -1 and x < width + APPEAR_X)) do
      x = x - s.dir * FRAMES_BETWEEN * BOMB_DISTANCE
      drop = drop - 1
    end
    s.plane_x, s.drop, s.counter = x, drop, 0
  end

  local MAX_BACK = 250
  local APEX_MARGIN = 0.75 -- reach the click by 3/4 of the arc's height
  local function aim(s, water)
    local h = math.max(0, (water - 2) - s.ty)
    local g = wa.world.gravity() * BOMB.gravity_pct / 100
    local vy = -BOMB_VY
    if 2 * g * h > APEX_MARGIN * vy * vy then vy = math.sqrt(2 * g * h / APEX_MARGIN) end
    local t = 2 * h / (vy + math.sqrt(math.max(0, vy * vy - 2 * g * h)))
    local vx, back = BOMB_VX, BOMB_VX * t
    if back > MAX_BACK then vx, back = MAX_BACK / t, MAX_BACK end
    s.bomb_vx, s.bomb_vy, s.back = vx, -vy, back
  end

  local function drop_bomb(s, a)
    local x = s.tx - s.back * s.dir + sign(wa.random(-10, 10)) * wa.random(0, 15)
    wa.weapons.launch({
      weapon = "stock.bazooka", owner = s.owner, x = x, y = wa.world.water() - 2,
      vx = s.bomb_vx * s.dir, vy = s.bomb_vy, missile = BOMB,
    })
    wa.sound.play(a, BOMB_SOUND)
  end

  local function plane_frame(s, a)
    s.counter = s.counter + 1
    if s.counter >= FRAMES_BETWEEN then
      s.counter = 0
      if s.drop > 0 and s.drop <= NUM_BOMBS then drop_bomb(s, a) end
      s.drop = s.drop + 1
    end
    s.plane_x = s.plane_x + s.dir * PLANE_SPEED
    local width = wa.world.size().w
    return not ((s.dir > 0 and s.plane_x > width + APPEAR_X)
      or (s.dir < 0 and s.plane_x < -APPEAR_X))
  end

  local function sub_frame(s, a)
    s.tick = s.tick + 1
    if s.before <= 0 then
      if not plane_frame(s, a) then
        subs[s.id] = nil
        a:remove()
        return
      end
      s.after = s.after - 1
      if s.after <= 0 then s.fade = math.min(255, s.fade + 2) end
    end
    s.before = s.before - 1
    if s.y >= s.water + 40 then
      s.x = s.x0 + s.tick * 0.6 * s.dir
      s.y = s.y0 - 15.0 * math.sqrt(s.tick * 1.25)
    end
  end

  shared.submarine_click = function(ev)
    local water = wa.world.water()
    local dir = (ev.vx or 0) < 0 and -1 or 1
    local s = { tx = ev.x, ty = ev.y, dir = dir, owner = ev.worm, water = water,
      tick = 0, before = BEFORE_ATTACK, after = AFTER_ATTACK, fade = 0 }
    aim(s, water)
    s.x0, s.y0 = ev.x - (110 + s.back) * dir, water + 220
    s.x, s.y = s.x0, s.y0
    plane_start(s, water, wa.world.size().w)
    local a = wa.actors.spawn({
      sprite = false, owner = ev.worm, x = ev.x, y = ev.y, on = function(a) sub_frame(s, a) end,
    })
    s.id = a.id
    subs[s.id] = s
    wa.sound.play(a, SUB_SOUND)
  end

  local CORNERS = { { -1, -1 }, { 1, -1 }, { 1, 1 }, { -1, 1 } }
  local ROT = math.pi / 4 * 0.75
  if wa.on.draw and wa.draw.quad then
    wa.on.draw(function()
      for _, s in pairs(subs) do
        local rot = ROT * s.dir
        local c, sn = math.cos(rot), math.sin(rot)
        local h = SIZE / 2
        local points = {}
        for i, p in ipairs(CORNERS) do
          local px, py = p[1] * s.dir, p[2]
          points[i] = { s.x + h * (px * c - py * sn), s.y + h * (px * sn + py * c) }
        end
        local phase = (s.tick * 0.025) % 1
        wa.draw.quad({ sprite = SHEET, points = points, frame = math.floor(phase * FRAMES),
          color = ((255 - s.fade) << 24) | TINT, depth = DEPTH, blend = "alpha" })
      end
    end)
  end
end

return weapon
`
      },
      {
        path: 'weapons/super_drill.lua',
        name: 'weapons/super_drill.lua',
        language: 'lua',
        content: `-- Super Drill: a pneumatic drill that cuts a hole twice as wide.

local weapon = {}

weapon.record = {
  drill = {
    duration_ms = 2000,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.pneumatic_drill",
    name = "Super Drill",
    panel_icon = "sprites/super_drill/ico_superdrill.png",
  })
end

function weapon.setup()
  local drills = {}

  local function follow_drill(worm, id)
    local started, waiting = false, 0
    return function(a)
      if worm.drilling then
        started = true
        wa.land.cut({ x = worm.x, y = worm.y, shape = "drill" })
        return
      end
      if not started and waiting < 4 then
        waiting = waiting + 1
        return
      end
      drills[id] = nil
      a:remove()
    end
  end

  wa.on.worm_message(function(worm, msg)
    if worm.weapon == "px.super_drill" and not drills[worm.id]
        and worm:ammo("px.super_drill") ~= 0 then
      local id = worm.id
      drills[id] = wa.actors.spawn({
        sprite = false, x = worm.x, y = worm.y,
        owner = worm,
        on = follow_drill(worm, id),
      })
    end
  end, { msgs = { wa.msg.FIRE_WEAPON } })
end

return weapon
`
      },
      {
        path: 'weapons/super_gravedigger.lua',
        name: 'weapons/super_gravedigger.lua',
        language: 'lua',
        content: `-- Super Gravedigger: a banana bomb whose bits skip along the ground before blowing up.

local weapon = {}

weapon.record = {
  handling = {
    remember_selection = false,
  },
  missile = {
    action = "none",
    animation = 5,
    collision_shape = 3,
    countdown = 0,
    ends_on_contact = {
      crates = true,
      donor_cards = true,
      graves = true,
      land = true,
      objects = true,
      water = true,
      worms_jumping = true,
      worms_normal = true,
      worms_roping = true,
    },
    explosion = {
      bias = 75,
      power = 50,
    },
    flight_sound = 126,
    gravity_pct = 116,
    trail = {
      power = 100,
      speed = 145,
      sprite = 0,
    },
  },
  clusters = {
    bit = {
      animation = 5,
      bounce = {
        bounciness = 7,
        explosion = {
          power = 15,
        },
        max_bounces = 5,
        sound = 126,
        terrain_keep_speed_pct = 99,
      },
      ends_on_contact = {
        water = true,
      },
      explosion = {
        bias = 50,
        power = 18,
      },
      flight_sound = 126,
      fuse = 0,
      gravity_pct = 116,
      random_motion = 20,
      trail = {
        bubbles_per_second = 0.0,
        speed = 0,
        sprite = 0,
      },
    },
    launch_power_pct = 37,
    power_variation_pct = 35,
    spread = 45,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.banana_bomb",
    name = "Super Gravedigger",
    panel_icon = "sprites/super_gravedigger/sgrave_ico.png",
    sprite = "sprites/super_gravedigger/flight.png",
    cluster_sprite = "sprites/super_gravedigger/cluster.png",
    worm_sprites = {
          weaponlnk = "sprites/super_gravedigger/aim.png",
          weaponlnku = "sprites/super_gravedigger/aimu.png",
          weaponlnkd = "sprites/super_gravedigger/aimd.png",
          wthrow = "sprites/super_gravedigger/draw.png",
          wthrowu = "sprites/super_gravedigger/drawu.png",
          wthrowd = "sprites/super_gravedigger/drawd.png",
        },
  })
end

return weapon
`
      },
      {
        path: 'weapons/super_tele.lua',
        name: 'weapons/super_tele.lua',
        language: 'lua',
        content: `-- Super Tele: a teleport that also works into solid land, cutting room to arrive.

local weapon = {}

weapon.record = {
  handling = {
    remember_selection = true,
    ends_turn = true,
  },
}

weapon.defaults = {
  after_use = "end",
  cursor_sprite = "wbrth1",
}

function weapon.definition()
  local shared = require("lib/shared")
  local fires = shared.fires
  return require("lib/weapon").merge(weapon.record, {
    wep = "weps/teleport.wep",
    panel_icon = "sprites/super_tele/icon.png",
    on_select = { cursor = true },
    on_click = function(ev) fires.super_tele_click(ev) end,
  })
end

function weapon.setup()
  local shared = require("lib/shared")
  local fires = shared.fires

  do
  fires.teleports = {} -- worm id -> frozen target and elapsed frames

  local function super_tele_arrive(worm, x, y)
    worm.x, worm.y = x, y
    for _, rise in ipairs({ 0, 10, 22 }) do
      wa.land.cut({ x = x, y = y - rise, shape = "circle", radius = 12 })
    end
  end

  local TELE_SOUND_PRIORITY = 3
  local SOUND_TELEPORT, SOUND_COMMUNICATOR, SOUND_WORM_POP = 67, 68, 54
  local PLACEMENT_POP_FRAMES = 21

  local function unplaced(worm) return worm.y == -10000 end

  local function skip_placement_windup(worm)
    if worm.weapon == "px.super_tele" and unplaced(worm) and worm.windup == nil then
      worm.windup = 0
    end
  end

  fires.super_tele_click = function(ev)
    local worm = ev.worm
    if worm.hp <= 0 then return end
    local y = ev.y
    if wa.world.cavern() and y < 19 then y = 19 end
    if unplaced(worm) then
      super_tele_arrive(worm, ev.x, y)
      worm:teleport_pose()
      wa.sound.play(worm, SOUND_COMMUNICATOR, TELE_SOUND_PRIORITY)
      fires.teleports[worm.id] = { placed = true, frames = 0 }
      return
    end
    fires.teleports[worm.id] = { x = ev.x, y = y, frames = 0, pending = true }
    wa.sound.play(worm, SOUND_COMMUNICATOR, TELE_SOUND_PRIORITY) -- PX's M_SETTARGET confirmation
  end

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FIRE_WEAPON then
      skip_placement_windup(worm)
      return
    end
    if worm.state == "prefiring" then skip_placement_windup(worm) end
    local tele = fires.teleports[worm.id]
    if not tele then return end
    if tele.placed then
      tele.frames = tele.frames + 1
      if tele.frames < PLACEMENT_POP_FRAMES then return end
      fires.teleports[worm.id] = nil
      if worm.hp > 0 then wa.sound.play(worm, SOUND_WORM_POP, TELE_SOUND_PRIORITY) end
      return
    end
    if worm.hp <= 0 then
      fires.teleports[worm.id] = nil
      return
    end
    if tele.pending then
      tele.pending = false
      worm:teleport_pose()
      wa.sound.play(worm, SOUND_TELEPORT, TELE_SOUND_PRIORITY) -- PX's teleport start
      return
    end
    tele.frames = tele.frames + 1
    if tele.frames < 50 then return end
    fires.teleports[worm.id] = nil
    super_tele_arrive(worm, tele.x, tele.y)
  end, { msgs = { wa.msg.FRAME_FINISH, wa.msg.FIRE_WEAPON } })
  end
end

return weapon
`
      },
      {
        path: 'weapons/swim_suit.lua',
        name: 'weapons/swim_suit.lua',
        language: 'lua',
        content: `-- Swim Suit: worn, a worm swims instead of drowning, steered with the arrow keys.

local on_missile = require("lib/on_missile")
local weapon = {}

weapon.record = {}

weapon.defaults = { auto_use = false, crate = { type = "utility" }, donor_card = true }

local automatic = false
local fast_walk_auto_use = false
local placed = {} -- every placed weapon's id, in slot order

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.laser_sight",
    name = "Swim Suit",
    panel_icon = "sprites/swim_suit/ico_swimsuit.png",
    sprites = { "sprites/swim_suit/swim.png", "sprites/swim_suit/float.png", "sprites/swim_suit/ring.png" },
    sounds = { "sounds/swim_suit/putting_on_ssuit.wav" },
    params = { gpu_prefix = "sprites/swim_suit/" },
  })
end

function weapon.setup()
  local shared = require("lib/shared")
  local own_time = require("wf-lib/own_time")
  local current_worm = shared.current_worm

  do

  local SWIM_CAP = 2.5 -- pixels a frame, times the swim speed
  local SWIM_PUSH = 0.1
  local SWIM_DRAG = 1.05
  local SWIM_STILL = 0.05
  local SWIM_KNOCK = 0.5 -- of WA's knock, a swimmer's push
  local SWIM_FLOAT_STEP = 0.0099
  local SWIM_DEPTH = 180 -- how far under the water the suit holds
  local SWIM_SUIT_MASK = 134342 -- 0x20CC6: the worm's 0x420CC6 without SWIM_WATER
  local SWIM_WATER = 0x400000
  local SWIM_MISSILE_MASK = 0x40007C -- a missile in the water that hits worms
  local SWIM_SPLASH = 57 -- WA's sound
  local SWIM_PLOP = 56
  local SWIM_BODY_DEPTH = wa.depth.FRONT
  local SWIM_RING_DEPTH = wa.depth.FRONT + 1
  local SWIM_RING_HALF = 25
  local SWIM_HALF_W, SWIM_HALF_H = 4, 6

  local DIVE_SPEED = 8
  local DIVE_FRAMES = 2000 -- the longest fall traced
  local FALLING = { jumping = true, jump_falling = true, falling = true }

  local swim_speed = 2 -- fastswim: Fast Walk switches 2 and 6
  local swim_in_game = false -- SwimInGame: someone has worn the suit
  local turn_over = false -- between WA's turn end and the next turn's start
  local pending = nil
  local swim_fire = nil
  local function clickable(id)
    local ok, data = pcall(wa.weapons.data, id)
    local f = ok and type(data) == "table" and data.fires or nil
    return f ~= nil and (f.as == "strike" or f.as == "special" and (f.subtype == 10 or f.subtype == 17))
  end
  local function fireable()
    if not swim_fire then
      swim_fire = { list = { "stock.fast_walk" }, set = { ["stock.fast_walk"] = true } }
      for _, id in ipairs(placed) do
        if not swim_fire.set[id] and clickable(id) then
          swim_fire.list[#swim_fire.list + 1] = id
          swim_fire.set[id] = true
        end
      end
    end
    return swim_fire
  end
  local function swim_take(worm)
    worm:take{ turn = "run", fire = fireable().list, fire_as = "bungee" }
  end

  local swimmers = {}

  local function swimmer_of(worm)
    local s = swimmers[worm.id]
    if not s then
      s = { suit = false, plopready = false, plopped = false, floating = false,
        plophase = 0, flophase = 0, fmult = 5, keys = {} }
      swimmers[worm.id] = s
    end
    return s
  end

  local function swim_drop_art(worm, s)
    if s.body then s.body:remove(); s.body = nil end
    worm.body_visible = true
  end

  local function suit_on(worm, s)
    wa.sound.play(worm, "sounds/swim_suit/putting_on_ssuit.wav")
    s.suit, s.plopready = true, true
    swim_in_game = true
    worm.collision_mask = SWIM_SUIT_MASK
  end

  local function suit_off(worm, s, sink, vx, vy)
    s.suit, s.plopready, s.plopped, s.floating = false, false, false, false
    swim_drop_art(worm, s)
    if sink then
      worm:release(vx, vy, { tumble = true })
    end
    worm.collision_mask = worm.collision_mask | SWIM_WATER
  end

  shared.swim_suit_on = function(worm)
    local s = swimmer_of(worm)
    if not s.suit then suit_on(worm, s) end
  end

  shared.swim_suit_off = function(worm)
    local s = swimmers[worm.id]
    if s and s.suit then suit_off(worm, s, false) end
  end

  local function swim_blocked(x, y)
    return wa.land.solid(x - SWIM_HALF_W, y) or wa.land.solid(x + SWIM_HALF_W, y)
      or wa.land.solid(x, y - SWIM_HALF_H) or wa.land.solid(x, y + SWIM_HALF_H)
  end

  -- Where a swimmer leaving the water at (x, y) comes out: there, or the
  -- nearest spot up to EXIT_REACH pixels away, above the water and reached in
  -- a straight line, where WA's worm shape is clear of land. swim_blocked looks
  -- at four points, so a slope can reach into the shape between them, and WA
  -- stands a worm released there inside the land. Nil when nothing is clear.
  local EXIT_REACH = 8
  local exit_offsets = {}
  for dy = -EXIT_REACH, EXIT_REACH do
    for dx = -EXIT_REACH, EXIT_REACH do
      local d = dx * dx + dy * dy
      if d > 0 and d <= EXIT_REACH * EXIT_REACH then
        exit_offsets[#exit_offsets + 1] = { dx = dx, dy = dy, d = d }
      end
    end
  end
  table.sort(exit_offsets, function(a, b)
    if a.d ~= b.d then return a.d < b.d end
    if a.dy ~= b.dy then return a.dy < b.dy end
    return a.dx < b.dx
  end)

  local function exit_spot(worm, x, y, water)
    if worm:fits(x, y, "terrain") then return x, y end
    local fx, fy = math.floor(x), math.floor(y)
    for _, o in ipairs(exit_offsets) do
      local nx, ny = fx + o.dx, fy + o.dy
      if ny < water and worm:fits(nx, ny, "terrain") and not wa.land.trace(x, y, nx, ny) then
        return nx, ny
      end
    end
  end

  local function swim_push(v, dir, cap)
    if dir > 0 then
      if v < cap then return v + SWIM_PUSH * swim_speed end
      return cap
    end
    if v > -cap then return v - SWIM_PUSH * swim_speed end
    return -cap
  end

  local KNOCKED = { tumbling = true, hit = true, blasted = true }

  local function dive_step(worm, x, y, vx, vy)
    vx = vx + wa.world.wind() * (worm.wind or 0)
    vy = vy + wa.world.gravity() * (worm.gravity or 1)
    local nx, ny = x + vx, y + vy
    if wa.land.trace(x, y, nx, ny) or not worm:fits(nx, ny) then
      return vx, vy, x, y, true
    end
    return vx, vy, nx, ny, false
  end

  local function dives_into_water(worm, x, y, vx, vy, water)
    for _ = 1, DIVE_FRAMES do
      local blocked
      vx, vy, x, y, blocked = dive_step(worm, x, y, vx, vy)
      if blocked then return false end
      if y >= water then return true end
    end
    return false
  end

  local function swim_frame(worm)
    local s = swimmers[worm.id]
    if not s or not s.suit then
      return
    end
    local water = wa.world.water()
    local cap = SWIM_CAP * swim_speed
    if s.dive and not worm.taken then
      s.dive = nil
    end
    if not FALLING[worm.state] and not s.dive then
      s.dived = false
    end
    if s.plopready and not s.dive and not s.dived and worm.turn and FALLING[worm.state]
      and worm.y < water
      and worm.vy + 2 * wa.world.gravity() * (worm.gravity or 1) >= DIVE_SPEED then
      s.dived = true
      if dives_into_water(worm, worm.x, worm.y, worm.vx, worm.vy, water) then
        s.dive = { x = worm.x, y = worm.y, vx = worm.vx, vy = worm.vy }
        worm:take{ turn = "run" }
      end
    end
    local dive_into
    if s.dive then
      local d = s.dive
      for _ = 1, own_time.frames(worm) do
        local blocked
        d.vx, d.vy, d.x, d.y, blocked = dive_step(worm, d.x, d.y, d.vx, d.vy)
        if blocked then
          s.dive = nil
          worm.x, worm.y = d.x, d.y
          worm:release(d.vx, d.vy)
          return
        end
        if d.y >= water then break end
      end
      worm:carry(d.x, d.y)
      if d.y < water then
        return
      end
      s.dive, dive_into = nil, d
    end
    if worm.y >= water and s.plopready and KNOCKED[worm.state] then
      suit_off(worm, s, false)
      return
    end
    if dive_into or worm.y >= water and s.plopready and worm.state ~= "teleporting" then
      local d = dive_into or worm
      wa.sound.play(worm, SWIM_SPLASH)
      s.plopready, s.plopped = false, true
      s.x, s.y = d.x, d.y
      s.vx, s.vy = math.min(d.vx, cap), math.min(d.vy, cap)
      s.px, s.py, s.knocked = 0, 0, false
      if worm.state == "roping" or worm.state == "bungee" then
        worm:release(s.vx, s.vy)
      end
      swim_take(worm)
      s.plophase = 0
    end
    if s.plopped and not worm.taken and KNOCKED[worm.state] and not turn_over then
      swim_take(worm)
      s.px = s.px + worm.vx * SWIM_KNOCK
      s.py = s.py + worm.vy * SWIM_KNOCK
      s.knocked = true
    elseif s.knocked and worm.taken then
      s.knocked = false
      if KNOCKED[worm.state] then
        worm:release(0, 0)
        swim_take(worm)
      end
    end
    if s.plopped and not worm.taken and worm.state == "teleporting" then
      s.floating = false
      s.plopready, s.plopped = true, false
      s.px, s.py, s.knocked = 0, 0, false
      swim_drop_art(worm, s)
      return
    end
    if s.plopped and not worm.taken then
      suit_off(worm, s, true, worm.vx, worm.vy)
      return
    end
    if s.plopped then
      local out
      for _ = 1, own_time.frames(worm) do
        local vx, vy = math.min(s.vx, cap), math.min(s.vy, cap)
        local held = s.keys
        local still = math.abs(vx) <= SWIM_STILL * swim_speed and math.abs(vy) <= SWIM_STILL * swim_speed
        if still and not (held.left or held.up or held.down or held.right) then
          s.floating = true
          s.flophase = s.flophase + SWIM_FLOAT_STEP * s.fmult
          if s.flophase >= 0.99 and s.fmult == 5 then
            s.flophase, s.fmult = 0.99, -5
          elseif s.flophase <= 0 and s.fmult == -5 then
            s.flophase, s.fmult = 0, 5
          end
        elseif vx ~= 0 and vy ~= 0 then
          s.floating = false
          if math.abs(vx) >= math.abs(vy) then
            s.plophase = s.plophase + SWIM_FLOAT_STEP * vx * worm.facing
          else
            s.plophase = s.plophase - SWIM_FLOAT_STEP * vy
          end
        elseif vx ~= 0 then
          s.floating = false
          s.plophase = s.plophase + SWIM_FLOAT_STEP * vx
        elseif vy ~= 0 then
          s.floating = false
          s.plophase = s.plophase - SWIM_FLOAT_STEP * vy
        end
        if s.plophase >= 1 or s.plophase <= -1 then
          s.plophase = 0
        end
        local k = worm.keys
        local up, down, left, right = k.up, k.down, k.left, k.right
        if up == down then vy = vy / SWIM_DRAG end
        if left == right then vx = vx / SWIM_DRAG end
        if up then vy = swim_push(vy, -1, cap) end
        if down then vy = swim_push(vy, 1, cap) end
        local shift = wa.world.keys().shift
        if left then
          if not shift then worm.facing = -1 end
          vx = swim_push(vx, -1, cap)
        end
        if right then
          if not shift then worm.facing = 1 end
          vx = swim_push(vx, 1, cap)
        end
        s.keys = { up = up, down = down, left = left, right = right }
        local px, py = s.px, s.py
        local stuck = swim_blocked(s.x, s.y)
        local nx = s.x + vx + px
        if not stuck and swim_blocked(nx, s.y) then vx, px = 0, 0 else s.x = nx end
        local ny = s.y + vy + py
        if not stuck and swim_blocked(s.x, ny) then vy, py = 0, 0 else s.y = ny end
        s.vx, s.vy = vx, vy
        s.px, s.py = px / SWIM_DRAG, py / SWIM_DRAG
        if math.abs(s.px) < SWIM_STILL then s.px = 0 end
        if math.abs(s.py) < SWIM_STILL then s.py = 0 end
        local ox, oy
        if s.y < water then
          ox, oy = exit_spot(worm, s.x, s.y, water)
          if not ox then
            -- Land over the worm here: it stays at the surface.
            s.y, s.vy, s.py = water, 0, 0
          end
        end
        if ox then
          -- Out in WA's fall state, as it swam: a fall back in dives again.
          s.floating, s.dived = false, false
          s.plopready, s.plopped = true, false
          s.px, s.py, s.knocked = 0, 0, false
          worm.x, worm.y = ox, oy
          worm:release(vx + px, vy + py)
          wa.sound.play(worm, SWIM_PLOP)
          out = true
          break
        end
      end
      if not out then
        worm:carry(s.x, s.y)
        local y, w = s.y, water
        local deep
        if not wa.world.cavern() then
          deep = y > w + SWIM_DEPTH
        elseif w > 610 then
          deep = y > w + SWIM_DEPTH
        else
          deep = y > 768
        end
        if deep then
          suit_off(worm, s, true, s.vx, s.vy)
          return
        end
      end
    end
    if not current_worm() and worm.y < water then
      suit_off(worm, s, false)
      return
    end
    local function art(sheet)
      local a = wa.actors.spawn({
        sprite = sheet, x = worm.x, y = worm.y, owner = worm, visibility = worm, on = function() end,
      })
      a:gfx({ follow = worm })
      return a
    end
    if s.plopped then
      local sheet = s.floating and "sprites/swim_suit/float.png" or "sprites/swim_suit/swim.png"
      if s.body and s.body_sheet ~= sheet then
        s.body:remove()
        s.body = nil
      end
      s.body = s.body or art(sheet)
      s.body_sheet = sheet
      local phase = s.floating and s.flophase or s.plophase
      s.body.x, s.body.y, s.body.vx, s.body.vy = s.x, s.y, 0, 0
      s.body.facing = -worm.facing
      s.body:frame(math.floor((phase % 1) * 20) % 20)
      s.body:gfx({ depth = SWIM_BODY_DEPTH })
      worm.body_visible = false
    elseif s.body then
      s.body:remove()
      s.body = nil
      worm.body_visible = true
    end
  end

  if wa.on.draw then
    wa.on.draw(function()
      for _, worm in ipairs(wa.worms.all()) do
        local s = swimmers[worm.id]
        if s and s.suit then
          local x, y, h = worm.x, worm.y, SWIM_RING_HALF
          wa.draw.quad({
            points = {
              { x - h, y - h }, { x + h, y - h }, { x + h, y + h }, { x - h, y + h },
            },
            sprite = "sprites/swim_suit/ring.png",
            visibility = worm,
            depth = SWIM_RING_DEPTH,
          })
        end
      end
    end)
  end

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FRAME_FINISH then
      if pending == worm.id and worm.turn then
        pending = nil
        local s = swimmer_of(worm)
        if not s.suit and worm:ammo("px.swim_suit") ~= 0 then
          suit_on(worm, s)
          worm:ammo("px.swim_suit", -1)
        end
      end
      swim_frame(worm)
    elseif msg == wa.msg.JUMP then
      local s = swimmers[worm.id]
      if s and s.plopped then
        return "eat"
      end
    elseif msg == wa.msg.FIRE_WEAPON then
      local s = swimmers[worm.id]
      if s and s.plopped and not fireable().set[worm.weapon] then
        return "eat" -- nothing else while it swims
      end
      if worm.weapon == "stock.fast_walk" then
        swim_speed = swim_speed ~= 6 and 6 or 2
      elseif worm.weapon == "px.swim_suit" then
        local s = swimmer_of(worm)
        if not s.suit then
          suit_on(worm, s)
        elseif worm.y < wa.world.water() then
          suit_off(worm, s, false)
        end
        worm:ammo("px.swim_suit", -1)
        return "eat"
      end
    end
  end, { msgs = { wa.msg.FRAME_FINISH, wa.msg.JUMP, wa.msg.FIRE_WEAPON } })

  wa.on.turn_start(function(ev)
    turn_over = false
    swim_speed = fast_walk_auto_use and 6 or 2
    if automatic and ev.worm then pending = ev.worm.id end
  end)

  wa.on.turn_end(function()
    turn_over = true
  end)

  on_missile(function(m)
    if swim_in_game and m.phase == "pre" and m.collision_mask == SWIM_WATER then
      m.collision_mask = SWIM_MISSILE_MASK
    end
  end, { phase = "pre" })

  if wa.on.contact then
    wa.on.contact(function(worm, other)
      local s = swimmers[worm.id]
      if s and s.plopped and other.kind == "missile" then
        wa.actors.spawn({
          sprite = false, x = other.x, y = other.y, owner = worm, explode = { damage = 100, id = 50, now = true },
        })
        other.y = wa.world.water() + 4096
      end
    end)
  end
  end
end

function weapon.configure(ctx)
  automatic = ctx.data.auto_use == true
  placed = {}
  for _, p in ipairs(ctx.placed or {}) do placed[#placed + 1] = p.id end
  local fast_walk = ctx.weapons["stock.fast_walk"]
  fast_walk_auto_use = fast_walk ~= nil and fast_walk.data.auto_use == true
end

return weapon
`
      },
      {
        path: 'weapons/s_m_a_r_t_bomb.lua',
        name: 'weapons/s_m_a_r_t_bomb.lua',
        language: 'lua',
        content: `-- S.M.A.R.T Bomb: a mortar whose cluster bits home in on worms.

local weapon = {}

weapon.record = {
  fires = {
    launch_power_pct = "charged",
    subtype = 3,
  },
  missile = {
    ends_on_contact = {
      crates = true,
      donor_cards = true,
      land = true,
      missiles = true,
      objects = true,
      worms = true,
      worms_frozen = true,
    },
    gravity_pct = 125,
    trail = {
      power = 40,
      speed = 120,
      sprite = 250,
    },
  },
  clusters = {
    angle = 0,
    bit = {
      action = "homing",
      animation = 1,
      explosion = {
        power = 25,
        push_pct = 115,
      },
      flight_sound = 46,
      -- The Magic Bullet's homing (cluster_homing), with PX's red trail.
      homing = {
        trail = {
          sprite = 250,
        },
      },
      trail = {
        bubbles_per_second = 0.0,
        power = 2,
        speed = 600,
        sprite = 0,
      },
    },
    count = 7,
    launch_power_pct = 50,
    spread = 45,
  },
}

weapon.defaults = {
  aims_straight_up = false,
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.mortar",
    name = "S.M.A.R.T Bomb",
    panel_icon = "sprites/smart_bomb/smart_ico.png",
    sprite = "sprites/smart_bomb/flight.png",
    cluster_sprite = "sprites/smart_bomb/cluster.png",
    cluster_homing_sprite = "sprites/smart_bomb/cluster_homing.png",
    -- The bits home as WA's Magic Bullet does: around land.
    cluster_homing = "stock.magic_bullet",
    sprite_overrides = { wsvbd = "sprites/smart_bomb/trail.png" },
        worm_sprites = {
          weaponlnk = "sprites/smart_bomb/aim.png",
          weaponlnku = "sprites/smart_bomb/aimu.png",
          weaponlnkd = "sprites/smart_bomb/aimd.png",
          wthrow = "sprites/smart_bomb/draw.png",
          wthrowu = "sprites/smart_bomb/drawu.png",
          wthrowd = "sprites/smart_bomb/drawd.png",
        },
  })
end

return weapon
`
      },
      {
        path: 'weapons/tazer.lua',
        name: 'weapons/tazer.lua',
        language: 'lua',
        content: `-- Tazer: a chain-lightning shot that arcs between worms; it doesn't end the turn.

local weapon = {}
weapon.definition = {
  copy_from="stock.handgun",
  name="Tazer",
  panel_icon="sprites/tazer/ico_tazer.png",
  fires={subtype=8},
  handling={remember_selection=false,ends_turn=false,retreat=3000},
  gun={bullets=1,impact_effect=3,shot_interval_ms=0,spread_deg=25,
    explosion={bias=20,push_pct=100}},
  worm_sprites={
    weaponlnk="sprites/tazer/wtazer.png",weaponlnku="sprites/tazer/wtazeru.png",
    weaponlnkd="sprites/tazer/wtazerd.png",wthrow="sprites/tazer/wtazlnk.png",
    wthrowu="sprites/tazer/wtazlnku.png",wthrowd="sprites/tazer/wtazlnkd.png",
    weaponfire="sprites/tazer/wtazer.png",weaponfireu="sprites/tazer/wtazeru.png",
    weaponfired="sprites/tazer/wtazerd.png",
  },
  sprites={"wf-lib/px/sprites/lightning/beam.png","wf-lib/px/sprites/lightning/glow.png","wf-lib/px/sprites/lightning/cloud.png",
    "sprites/electric_grenade/explosion.png","sprites/electric_grenade/tazed1.png",
    "sprites/electric_grenade/tazed2.png"},
  sounds={"sounds/lightning/tazer_loop.wav"},
  params={gpu_prefix="sprites/"},
  on_fire=function(ev)
    local worm=ev.worm
    local angle=(1-worm.aim)*math.pi
    if worm.facing<0 then angle=2*math.pi-angle end
    local dx,dy=wa.math.sin(angle),-wa.math.cos(angle)
    require("lib/electrical").context().start_arc{
      x=worm.x+4*dx,y=worm.y+4*dy,dx=dx,dy=dy,worm=worm,ignore={worm},burst=false,
    }
  end,
}
weapon.requires={"lib/electrical"}
return weapon
`
      },
      {
        path: 'weapons/telenade.lua',
        name: 'weapons/telenade.lua',
        language: 'lua',
        content: `-- TeleNade: a grenade that teleports the worm to where it goes off, with no blast.

local holds = require("wf-lib/holds")
local weapon = {}

local ART = "sprites/telenade/"
local SOUND_TELEPORT = 67

local function teleport(event)
  local landing = require("lib/tele_landing")
  local worm = landing.turn_worm()
  if not worm then return end
  wa.sound.play(worm, SOUND_TELEPORT)
  landing.warp(worm, event.x, event.y)
end

weapon.defaults = { ends_invisibility = false }

weapon.definition = {
  copy_from = "stock.grenade",
  name = "TeleNade",
  panel_icon = ART .. "ico_telenade.png",
  hold_as = "stock.grenade",
  on_explode = teleport,
  missile = {
    sprite = 0, -- WA draws no round; the art spec draws it
    explosion = { power = 0, push_pct = 0 },
  },
  worm_sprites = holds.PX_POSTURE,
  sprites = { ART .. "bullet.png" },
  hold = {
    thrown = true,
    sheet = ART .. "bullet.png", hand_type = 1, hand_radius = 20, hand_scale = 0.8,
    hand_rotation = 1, hand_radial_rotation = 1.05,
    weap_radial_rotation = 0.9, weap_rotation = 0.5, weap_radius = 10,
    hand = holds.PX_HANDS[1],
  },
}

weapon.missile_sprite = {
  sheet = ART .. "bullet.png", frames = 1,
  spin = true, -- its record's WAT_Rotation
  hide = true,
}

return weapon
`
      },
      {
        path: 'weapons/tele_arrow.lua',
        name: 'weapons/tele_arrow.lua',
        language: 'lua',
        content: `-- Tele Arrow: fires a bouncing projectile; Space detonates it and teleports the worm there.

local holds = require("wf-lib/holds")
local weapon = {}

local function teleport(event)
  local landing = require("lib/tele_landing")
  local worm = landing.turn_worm()
  if worm then landing.warp(worm, event.x, event.y) end
end

weapon.defaults = { ends_invisibility = false }

weapon.definition = {
  copy_from = "stock.bazooka",
  name = "Tele Arrow",
  panel_icon = "sprites/tele_arrow/ico_telea.png",
  sprite = "bazooka",
  on_explode = teleport,
  handling = { remember_selection = false },
  missile = {
    explode_on_space = true,
    flight_sound = 67,
    fuse = 10000,
    gravity_pct = 120,
    impact_particles = false,
    speed_pct = 99,
    wind_pct = 0,
    bounce = {
      bounciness = 75, max_bounces = 100, sound = 113,
      terrain_keep_speed_pct = 99,
      hits = {crates=true,donor_cards=true,land=true,objects=true,water=true,
        worms_frozen=true,worms_normal=true},
    },
    ends_on_contact = {},
    explosion = {power=0,push_pct=0,bias=9},
    trail = {power=20,speed=150,sprite="sprites/tele_arrow/trail.png"},
  },
  worm_sprites = holds.PX_POSTURE,
  sprites = {"sprites/tele_arrow/telea.png"},
  params = {gpu_prefix="sprites/tele_arrow/"},
  hold = {
    sheet="sprites/tele_arrow/spb_telea.png",frames=8,anim_speed=1.2,
    hand_radius=0,hand_rotation=0,hand_radial_rotation=0,
    weap_radial_rotation=0,weap_rotation=1,weap_radius=3.5,
  },
}
weapon.missile_sprite = {
  sheet="sprites/tele_arrow/telea.png",frames=8,
  animate=true,anim_speed=3,hide=true,
}
return weapon
`
      },
      {
        path: 'weapons/thrown_dynamite.lua',
        name: 'weapons/thrown_dynamite.lua',
        language: 'lua',
        content: `-- Thrown Dynamite: a charged throw of a heavier, low-bounce dynamite.

local holds = require("wf-lib/holds")
local weapon = {
  definition = {
    copy_from = "stock.grenade",
    name = "Thrown Dynamite",
    panel_icon = "sprites/thrown_dynamite/ico_tdynamite.png",
    hold_as = "stock.grenade",
    handling = { remember_selection = false },
    missile = {
      sprite = 0, -- WA draws no round; the art spec draws it
      animation = 0,
      countdown = 3000,
      flight_sound = 65602,
      fuse = 5000,
      gravity_pct = 125,
      bounce = { bounciness = 35, terrain_keep_speed_pct = 35 },
      ends_on_contact = { water = true },
      explosion = { bias = 50, power = 75 },
      explosion_sound = { before = 1, sound = 90 },
      trail = { power = 4, speed = 25, sprite = 130 },
    },
    worm_sprites = holds.PX_POSTURE,
    sprites = { "sprites/thrown_dynamite/tdynamite.png", "sprites/thrown_dynamite/spark.png" },
    params = { gpu_prefix = "sprites/thrown_dynamite/" },
    hold = {
      sheet = "sprites/thrown_dynamite/tdynamite.png", frames = 4,
      anim_speed = 1.7,
      hand = holds.PX_HANDS[1], hand_type = 1, hand_scale = 1.2,
      hand_radius = -9, hand_rotation = 0, hand_radial_rotation = 0,
      weap_radial_rotation = 0, weap_rotation = 0.5, weap_radius = -11.2,
      thrown = true,
    },
  },
  missile_sprite = {
    sheet = "sprites/thrown_dynamite/tdynamite.png", frames = 4,
    animate = true, anim_speed = 1.7, hide = true,
  },
}

function weapon.setup()
  local particles, driver, seed = {}, nil, 1733
  local function random()
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  end
  local function step(a)
    for i = #particles, 1, -1 do
      local p = particles[i]
      p.age = p.age + 1
      if p.age >= 55 then table.remove(particles, i)
      else
        p.x, p.y = p.x + p.vx, p.y + p.vy
        p.vx, p.vy = p.vx / 2, p.vy / 2 - 3 * wa.world.gravity()
      end
    end
    if #particles == 0 then driver = nil; a:remove() end
  end
  wa.on.worm_message(function(worm)
    if not worm.turn or worm.hp <= 0 or not worm.aiming or worm.weapon ~= "px.thrown_dynamite"
      or #particles >= 64 then return end
    local angle = worm.aim * math.pi * -worm.facing
    local x = worm.x + wa.math.sin(angle) * 13
    local y = worm.y - wa.math.cos(angle) * 23
    if y >= wa.world.water() then return end
    if not driver then
      driver = wa.actors.spawn{sprite=false,owner=worm,x=x,y=y,on=step}
    end
    local direction, speed = random() * math.pi * 2, 1 + random() * 4
    particles[#particles+1] = {x=x,y=y,age=0,
      vx=wa.math.cos(direction)*speed,vy=wa.math.sin(direction)*speed,owner=worm}
  end, {msgs={wa.msg.FRAME_FINISH}})
  wa.on.draw(function()
    for _, p in ipairs(particles) do
      local t = p.age / 55
      local half = 30 * (0.5 + (0.05 - 0.5) * t)
      local brightness = math.floor(160 * (1-t))
      wa.draw.quad{points={{p.x-half,p.y-half},{p.x+half,p.y-half},
        {p.x+half,p.y+half},{p.x-half,p.y+half}},
        sprite="sprites/thrown_dynamite/spark.png",frame=math.floor((p.age*0.015%1)*7),
        color=0xFF000000 | (brightness<<16) | (brightness<<8) | brightness,
        blend="add",depth=wa.depth.FRONT,visibility=p.owner}
    end
  end)
end

return weapon
`
      },
      {
        path: 'weapons/thumper_nade.lua',
        name: 'weapons/thumper_nade.lua',
        language: 'lua',
        content: `-- Thumper Nade: a heavy grenade that bounces twice, then bursts into clusters with a hard push.

local weapon = {}

weapon.record = {
  fires = {
    method = 3,
    subtype = 2,
    type = 1,
  },
  missile = {
    action = "bounce",
    alarm_worms = true,
    animation = 1,
    bounce = {
      bounciness = 60,
      contact_sides = 8,
      hits = {
        crates = true,
        donor_cards = true,
        graves = true,
        land = true,
        mines = true,
        missiles = true,
        objects = true,
        water = true,
        worms_acting = true,
        worms_frozen = true,
        worms_jumping = true,
        worms_normal = true,
      },
      max_bounces = 2,
      sound = 30,
      terrain_keep_speed_pct = 50,
    },
    burst = "clusters",
    collision_shape = 2,
    ends_on_contact = {
      water = true,
    },
    explosion = {
      bias = 10,
      power = 40,
      push_pct = 100,
    },
    fuse = 9000,
    gravity_pct = 120,
    speed_pct = 100,
    trail = {
      bubbles_per_second = 12.5,
      power = 40,
      speed = 150,
      sprite = 251,
    },
  },
  clusters = {
    bit = {
      action = "bounce",
      animation = 5,
      bounce = {
        hits = {
          crates = true,
          donor_cards = true,
          water = true,
          worms_frozen = true,
        },
        max_bounces = 3,
        sound = 113,
        terrain_keep_speed_pct = 100,
      },
      ends_on_contact = {
        arrows = true,
        donor_cards = true,
        land = true,
        objects = true,
        water = true,
        worms = true,
      },
      explosion = {
        power = 30,
        push_pct = 100,
      },
      fuse = 9000,
      gravity_pct = 100,
      speed_pct = 100,
      sprite_count = 1,
      trail = {
        power = 40,
        speed = 120,
        sprite = 252,
      },
    },
    count = 6,
    launch_power_pct = 40,
    power_variation_pct = 30,
    spread = 45,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.battle_axe",
    name = "Thumper Nade",
    panel_icon = "sprites/thumper_nade/thumpern_ico.png",
    sprite = "sprites/thumper_nade/flight.png",
    cluster_sprite = "sprites/thumper_nade/cluster.png",
    sprite_overrides = {
          wsvg = "sprites/thumper_nade/trail.png", -- 251
          wsvgu = "sprites/thumper_nade/cluster_trail.png", -- 252
        },
    worm_sprites = {
          weaponlnk = "sprites/thumper_nade/aim.png",
          weaponlnku = "sprites/thumper_nade/aimu.png",
          weaponlnkd = "sprites/thumper_nade/aimd.png",
          wthrow = "sprites/thumper_nade/draw.png",
          wthrowu = "sprites/thumper_nade/drawu.png",
          wthrowd = "sprites/thumper_nade/drawd.png",
        },
  })
end

return weapon
`
      },
      {
        path: 'weapons/thumper_nade_strike.lua',
        name: 'weapons/thumper_nade_strike.lua',
        language: 'lua',
        content: `-- Thumper Nade Strike: a carpet bomb of Thumper Nades.

local weapon = {}

weapon.record = {
  handling = {
    retreat = 3000,
  },
  missile = {
    animation = 1,
    bounce = {
      bounciness = 60,
      explosion = {
        power = 0,
        push_pct = 0,
      },
      extra_reverse_chance_pct = 0,
      hits = {
        arrows = true,
        crates = true,
        donor_cards = true,
        graves = true,
        land = true,
        mines = true,
        missiles = true,
        objects = true,
        water = true,
        worms = true,
        worms_frozen = true,
      },
      max_bounces = 2,
      sound = 30,
      terrain_keep_speed_pct = 50,
    },
    burst = "clusters",
    explosion = {
      bias = 10,
      power = 40,
    },
    gravity_pct = 120,
    random_motion = 10,
    trail = {
      power = 35,
      speed = 150,
      sprite = 251,
    },
  },
  clusters = {
    bit = {
      action = "bounce",
      animation = 5,
      ends_on_contact = {
        crates = true,
        donor_cards = true,
        land = true,
        objects = true,
        worms = true,
        worms_frozen = true,
      },
      explosion = {
        power = 25,
        push_pct = 100,
      },
      fuse = 9000,
      gravity_pct = 100,
      speed_pct = 100,
      sprite_count = 1,
      trail = {
        power = 40,
        speed = 120,
        sprite = 252,
      },
    },
    count = 6,
    launch_power_pct = 40,
    power_variation_pct = 30,
    spread = 45,
  },
  strike = {
    count = 3,
    plane = 87,
    spacing = 30,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.carpet_bomb",
    name = "Thumper Nade Strike",
    panel_icon = "sprites/thumper_nade/thumpernst_ico.png",
    sprite = "sprites/thumper_nade/flight.png",
    cluster_sprite = "sprites/thumper_nade/cluster.png",
  })
end

return weapon
`
      },
      {
        path: 'weapons/tnt.lua',
        name: 'weapons/tnt.lua',
        language: 'lua',
        content: `-- TNT: the Soldier's dynamite: a smaller blast that bursts into three more around it.

local on_missile = require("lib/on_missile")
local weapon = {}
local ART = "sprites/tnt/"

weapon.record = {
  fires = {
    launch_power_pct = 7,
  },
  handling = {
    remember_selection = false,
  },
  missile = {
    sprite = 0, -- WA draws no round; the art spec draws it
    burst = "clusters",
    explosion = {
      power = 50,
      push_pct = 70,
    },
  },
  clusters = {
    angle = -1,
    count = 3,
    launch_power_pct = 40,
    power_variation_pct = 60,
    spread = 360,
    bit = {
      action = "bounce",
      fuse = 75,
      gravity_pct = 100,
      impact_particles = false,
      speed_pct = 100,
      sprite_count = 1,
      bounce = {
        bounciness = 1,
        contact_sides = 8,
        hits = {
          water = true,
        },
      },
      ends_on_contact = {
        water = true,
      },
      explosion = {
        power = 30,
        push_pct = 40,
      },
    },
  },
}

weapon.missile_sprite = {
  sheet = ART .. "tnt.png", frames = 1, upright = true, hide = true,
}

function weapon.definition()
  local sdk = require("wf-lib/holds")
  local PX_POSTURE, PX_HANDS = sdk.PX_POSTURE, sdk.PX_HANDS
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.dynamite",
    hold_as = "stock.dynamite", -- the pose its wdynlnk sheets replace
    name = "TNT",
    panel_icon = ART .. "ico_tnt.png",
    worm_sprites = {
      wdynlnk = PX_POSTURE.wthrow, wdynlnku = PX_POSTURE.wthrowu, wdynlnkd = PX_POSTURE.wthrowd,
      weaponlnk = sdk.PX_LEVEL.weaponlnk, weaponlnku = sdk.PX_LEVEL.weaponlnku,
      weaponlnkd = sdk.PX_LEVEL.weaponlnkd,
    },
    sprites = { ART .. "tnt.png", ART .. "tnt_hold.png", ART .. "trail.png", ART .. "glow.png" },
    params = { gpu_prefix = ART },
    hold = {
      thrown = true,
      sheet = ART .. "tnt_hold.png", hand_type = 1, hand_radius = 12,
      hand_radial_rotation = -0.95, weap_rotation = 0.45, weap_radius = 12,
      static = { weap = -0.1, hand = 0.4 }, -- ang_if_static, hand_ang_if_static
      hand = PX_HANDS[1],
    },
  })
end

function weapon.setup()
  local shared = require("lib/shared")
  local TRAIL, GLOW, LIMIT = ART .. "trail.png", ART .. "glow.png", 256
  local particles, driver, seed, count = {}, nil, 1741, 0
  local function random()
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  end
  local function step(a)
    local wind = wa.world.wind()
    for i = #particles, 1, -1 do
      local p = particles[i]
      p.age = p.age + 1
      if p.age >= p.life then table.remove(particles, i)
      else
        p.x, p.y = p.x + p.vx, p.y + p.vy
        p.vx = p.vx / (1 + p.drag) + p.wind * wind
        p.vy = p.vy / (1 + p.drag)
      end
    end
    if #particles == 0 then driver = nil; a:remove() end
  end
  local function emit(x, y, glow)
    if y >= wa.world.water() or #particles >= LIMIT then return end
    if not driver then
      local owner = shared.current_worm() or wa.worms.all()[1]
      if not owner then return end
      driver = wa.actors.spawn{ sprite = false, owner = owner, x = x, y = y,
        on = step }
    end
    local speed, heading = -3 - random() * 4, random() * 2 * math.pi
    particles[#particles + 1] = glow
      and { sheet = GLOW, x = x, y = y, vx = 0, vy = 0, age = 0, life = 10, drag = 1, wind = 0,
        angle = 0, alpha = 150, end_alpha = 150, size = 0.3, end_size = 0.15, pixels = 128,
        frames = 1, anim = 0 }
      or { sheet = TRAIL, x = x, y = y, age = 0, life = 40, drag = 0.5, wind = 2,
        vx = speed * wa.math.cos(heading), vy = speed * wa.math.sin(heading),
        angle = random() * 2.31, alpha = 255, end_alpha = 50, size = 1, end_size = 0.3,
        pixels = 80, frames = 32, anim = 0.05 }
  end
  on_missile(function(m)
    if m.weapon ~= "px.tnt" or m.phase ~= "post" then return end
    count = count + 1
    emit(m.x, m.y - 20, false)
    if count % 2 == 0 then emit(m.x, m.y - 20, true) end
  end, { weapons = { "px.tnt" }, phase = "post" })
  local quad = { frame = 0, blend = "add", depth = wa.depth.EFFECTS,
    points = { { 0, 0 }, { 0, 0 }, { 0, 0 }, { 0, 0 } } }
  wa.on.draw(function()
    for _, p in ipairs(particles) do
      local t = p.age / p.life
      local half = p.pixels * (p.size + (p.end_size - p.size) * t) / 2
      local c, s = math.cos(p.angle) * half, math.sin(p.angle) * half
      local v = math.floor(120 * (1 - t))
      local pt = quad.points
      pt[1][1], pt[1][2] = p.x - c + s, p.y - s - c
      pt[2][1], pt[2][2] = p.x + c + s, p.y + s - c
      pt[3][1], pt[3][2] = p.x + c - s, p.y + s + c
      pt[4][1], pt[4][2] = p.x - c - s, p.y - s + c
      quad.sprite, quad.frame = p.sheet, math.floor((p.age * p.anim % 1) * p.frames)
      quad.color = (math.floor(p.alpha + (p.end_alpha - p.alpha) * t) << 24) | (v << 16) | (v << 8) | v
      wa.draw.quad(quad)
    end
  end)
end

return weapon
`
      },
      {
        path: 'weapons/toxic_grenade.lua',
        name: 'weapons/toxic_grenade.lua',
        language: 'lua',
        content: `-- Toxic Grenade: a grenade that releases a lingering poison cloud.

local holds = require("wf-lib/holds")
local weapon = {}
local clouds = {}
local ART = "sprites/toxic_grenade/"
local SMOKE = ART.."smoke.png"
local FINISH_TURN = 55
local poison = 2
local pending_end
local abs = math.abs

local function finish_candidate(worms,confirmed)
  local ending=pending_end
  pending_end=nil
  if not ending then return end
  if not confirmed then
    for _,w in ipairs(worms) do if w.turn then return end end
  end
  for _,s in ipairs(ending) do s.turns=s.turns-1 end
end
local looks = setmetatable({}, {__mode="k"})

local function random_signed()
  return wa.random(-10000,10000)/10000
end

local function puff(x,y)
  return {x=x,y=y,age=0,life=240+40*random_signed(),
    vx=3*random_signed(),vy=3*random_signed()}
end

local wx,wy,ww,wn={}, {}, {}, nil
local function gather(worms)
  wn=0
  for _,w in ipairs(worms) do
    if w.hp>0 then wn=wn+1;wx[wn],wy[wn],ww[wn]=w.x,w.y,w end
  end
end

local function move(p,worms,random,solid)
  local x,y,vx,vy=p.x,p.y,p.vx,p.vy
  local age=p.age+1
  p.age=age
  for _=1,128 do
    if not solid(x+vx,y+vy) then break end
    if random(0,1)==0 then
      vx=vy*-0.94;vy=vx*0.94
    else
      vx=vy*0.94;vy=vx*-0.94
    end
    if abs(vx)<0.1 and abs(vy)<0.1 then break end
  end
  if age%8==0 then
    if not wn then gather(worms) end
    for k=1,wn do
      if abs(wx[k]-x)<20 and abs(wy[k]-y)<20 then ww[k]:poison(poison) end
    end
  end
  p.x,p.y=x+vx,y+vy
  p.vx=vx*0.995+0.05*(random(-10000,10000)/10000)
  p.vy=(vy-0.02)*0.995+0.05*(random(-10000,10000)/10000)
end

local function detonate(event)
  local owner
  for _,w in ipairs(wa.worms.all()) do
    owner=owner or w
    if event.worm and w.id==event.worm.id then owner=w;break end
  end
  if not owner then return end
  local s={x=event.x,y=event.y,age=0,turns=4,puffs={}}
  local function step(a)
    local worms=wa.worms.all()
    finish_candidate(worms,false)
    local puffs,random,solid=s.puffs,wa.random,wa.land.solid
    local n,kept=#puffs,0
    wn=nil
    for i=1,n do
      local p=puffs[i]
      move(p,worms,random,solid)
      if p.age<=p.life then kept=kept+1;puffs[kept]=p end
    end
    for i=kept+1,n do puffs[i]=nil end
    if s.turns>=0 then
      if s.age%8==0 then
        for _=1,6 do puffs[#puffs+1]=puff(s.x,s.y) end
      end
      s.age=s.age+1
    elseif #puffs==0 then
      for i,c in ipairs(clouds) do if c==s then table.remove(clouds,i);break end end
      a:remove()
    end
  end
  s.actor=wa.actors.spawn{sprite=false,owner=owner,x=s.x,y=s.y,persist=true,light=false,on=step}
  clouds[#clouds+1]=s
end

weapon.definition = {
  copy_from="stock.grenade",name="Toxic Grenade",
  panel_icon=ART.."img_toxicgren.png",sprite="grenade",
  handling={remember_selection=false},
  missile={explosion={power=0,push_pct=0},burst="nothing"},on_explode=detonate,
  worm_sprites=holds.PX_POSTURE,
  sprites={ART.."poisongren.png",ART.."smoke.png"},params={gpu_prefix=ART},
  hold={sheet=ART.."poisongren.png",frames=1,hand_radius=18,hand_rotation=1,
    hand_radial_rotation=1.05,weap_radial_rotation=0.9,weap_rotation=0.5,
    weap_radius=10,hand_type=1,hand_scale=0.8,thrown=true},
}
weapon.missile_sprite={sheet=ART.."poisongren.png",frames=1,hide=true}

function weapon.configure(ctx)
  poison = ctx.option("poison") or 2
end

function weapon.setup()
  wa.on.worm_message(function(_,msg)
    if msg==wa.msg.TURN_STARTED then
      finish_candidate({},true)
    elseif not pending_end then
      pending_end={}
      for _,s in ipairs(clouds) do pending_end[#pending_end+1]=s end
    end
  end,{msgs={FINISH_TURN,wa.msg.TURN_STARTED}})
  local MAX=4096*9
  local buf={}
  local batch={sprite=SMOKE,frame=0,depth=0,quads=buf,count=0}
  local c1,c2,c3,c4={0,0},{0,0},{0,0},{0,0}
  local q={sprite=SMOKE,frame=0,color=0,depth=0,points={c1,c2,c3,c4}}
  wa.on.draw(function()
    if not clouds[1] then return end
    local quads,quad,cos,sin,floor=wa.draw.quads,wa.draw.quad,math.cos,math.sin,math.floor
    batch.depth=wa.depth.OBJECTS
    q.depth=batch.depth
    local n=0
    for _,s in ipairs(clouds) do
      if s.actor.id~=0 then
        local puffs=s.puffs
        for i=1,#puffs do
          local p=puffs[i]
          local v=looks[p]
          if not v then
            v={rotation=wa.draw.random()*6,size=0.75+0.1*(wa.draw.random()*2-1)}
            looks[p]=v
          end
          local age,size=p.age,v.size
          local t=age/p.life
          if t>1 then t=1 end
          local half=16*(size+(1.75-size)*t)
          local angle=v.rotation+age*0.05
          local c,sn=cos(angle)*half,sin(angle)*half
          local x,y=p.x,p.y
          local color=floor(255-220*t)*0x1000000+0x80DC80
          if quads then
            buf[n+1],buf[n+2],buf[n+3],buf[n+4]=x-c+sn,y-sn-c,x+c+sn,y+sn-c
            buf[n+5],buf[n+6],buf[n+7],buf[n+8]=x+c-sn,y+sn+c,x-c-sn,y-sn+c
            buf[n+9]=color
            n=n+9
            if n==MAX then batch.count=4096;quads(batch);n=0 end
          else
            c1[1],c1[2]=x-c+sn,y-sn-c
            c2[1],c2[2]=x+c+sn,y+sn-c
            c3[1],c3[2]=x+c-sn,y+sn+c
            c4[1],c4[2]=x-c-sn,y-sn+c
            q.color=color
            quad(q)
          end
        end
      end
    end
    if n>0 then batch.count=n//9;quads(batch) end
  end)
end
return weapon
`
      },
      {
        path: 'weapons/trampoline.lua',
        name: 'weapons/trampoline.lua',
        language: 'lua',
        content: `-- Trampoline: a thrown, breakable trampoline that throws worms, missiles and mines back up.

local weapon = {}
local ART = "sprites/trampoline/"
local SND = "sounds/trampoline/"
local trampolines = {}

local BOUNCE = 7 -- TrampBounce: up speed, plus 1 or 2 by turns
local ACROSS = 3 -- TrampSpX: speed across, toward its far side
local HEALTH = 40
local BREAK_BLAST = 10 -- ExpDamage
local TIRES_AFTER = 250 -- inactive_timer_limit: frames after a turn ends
local LOOP_WINDOW = 125 -- loop_timer_limit
local LOOP_JUMPS = 10 -- loop_jumps_limit: off past twice this
local HALF = 6

local STAYS = { standing = true, walking = true, ready = true, charging = true,
  prefiring = true, firing = true, fired = true, punching = true, drilling = true,
  teleporting = true, roping = true, bungee = true }

local function damage(s, a, amount)
  if not s.alive or amount <= 0 then return end
  s.health = s.health - amount
  if s.health <= 0 then
    s.alive = false
    a:explode({ damage = BREAK_BLAST, id = 100 })
    a:remove()
  end
end

local function place(fire)
  local worm = fire.worm
  local side = worm.facing > 0 and 1 or -1
  local s = { alive = true, health = HEALTH, active = true, tired = true,
    tiring = false, tire_timer = 0, looping = false, loop_timer = 0, loop_jumps = 0,
    lift = 0, jumped = -1 }
  local current_worm = require("lib/shared").current_worm

  local function frame(a)
    if not s.alive then return end
    if current_worm() and s.tired then s.active = true
    elseif not s.tired then s.active = false end
    if s.tiring then
      s.tire_timer = s.tire_timer + 1
      if s.tire_timer > TIRES_AFTER then
        s.active, s.tire_timer, s.tiring = false, 0, false
      end
    end
    if s.looping then
      s.loop_timer = s.loop_timer + 1
      if s.loop_jumps > LOOP_JUMPS * 2 then
        s.tired, s.looping = false, false
      end
      if s.loop_timer > LOOP_WINDOW then
        s.loop_jumps, s.looping = 0, false
      end
    end
  end

  local function contact(a, ev)
    local other = ev.other
    if not s.alive or type(other) ~= "userdata" and type(other) ~= "table" then return end
    local kind = other.kind
    if kind ~= "worm" and kind ~= "missile" and kind ~= "mine" then return end
    if kind == "worm" then
      local state = other.state
      if state == "standing" or state == "walking" or state == "ready" then
        s.tired, s.loop_jumps, s.loop_timer = true, 0, 0
      end
      if STAYS[state] then return end
    end
    s.looping, s.loop_jumps, s.loop_timer = true, s.loop_jumps + 1, 0
    s.jumped = wa.world.frame()
    wa.sound.play(a, SND .. (wa.random(1, 2) == 1 and "bananaimpact.wav" or "wormspring.wav"))
    s.lift = s.lift % 2 + 1
    if s.active then
      other.vy = -(BOUNCE + s.lift)
      other.vx = other.x <= a.x and ACROSS or -ACROSS
    else
      other.vy = 0
    end
  end

  local function hit(a, ev)
    if ev.kind == "blast" then
      local power = ev.power
      local dx, dy = ev.x - a.x, ev.y - (a.y - HALF)
      if power > 0 then
        damage(s, a, math.floor((1 - (dx * dx + dy * dy) / (power * power * 4)) * power))
      end
    else
      damage(s, a, math.max(0, ev.damage or 0))
    end
  end

  s.actor = wa.actors.spawn({
    sprite = false, owner = worm, x = worm.x + 3 * side, y = worm.y - 12 + HALF,
    vx = 2 * side, vy = -3, origin = "center", persist = true, gravity = 1, drown = true,
    body = { shape = ART .. "body.png", hits = { land = true }, hit_by = "all" },
    on = { frame = frame, touched = contact, hit = hit },
  })
  trampolines[#trampolines + 1] = s
end

weapon.defaults = { ends_invisibility = false }

weapon.definition = {
  wep = "weps/trampoline.wep",
  name = "Trampoline",
  panel_icon = ART .. "tramp_ico.png",
  worm_sprites = {
    weaponlnk = ART .. "hold.png", weaponlnku = ART .. "holdu.png", weaponlnkd = ART .. "holdd.png",
    wthrow = ART .. "pick.png", wthrowu = ART .. "picku.png", wthrowd = ART .. "pickd.png",
  },
  sprites = { ART .. "tramp.png", ART .. "jumptramp.png" },
  sounds = { SND .. "bananaimpact.wav", SND .. "wormspring.wav" },
  params = { gpu_prefix = ART },
  on_fire = place,
}

function weapon.setup()
  wa.on.turn_end(function()
    for _, s in ipairs(trampolines) do s.tiring = true end
  end)
  wa.on.turn_start(function()
    for i = #trampolines, 1, -1 do
      local s = trampolines[i]
      if s.alive then s.tiring, s.tire_timer, s.active = false, 0, true
      else table.remove(trampolines, i) end
    end
  end)
  wa.on.draw(function()
    local now = wa.world.frame()
    for _, s in ipairs(trampolines) do
      if s.alive and s.actor.id ~= 0 then
        local sheet = now <= s.jumped and "jumptramp.png" or "tramp.png"
        local x, y = s.actor.x, s.actor.y - HALF + 4
        wa.draw.quad({ sprite = ART .. sheet, frame = 0, depth = wa.depth.OBJECTS,
          points = { { x - 35, y - 16 }, { x + 35, y - 16 }, { x + 35, y + 16 }, { x - 35, y + 16 } } })
      end
    end
  end)
end

return weapon
`
      },
      {
        path: 'weapons/valyrian_fire.lua',
        name: 'weapons/valyrian_fire.lua',
        language: 'lua',
        content: `-- Valyrian Fire: a petrol bomb whose green fire burns hotter and throws further.

local weapon = {}

weapon.record = {
  handling = {
    remember_selection = true,
    ends_turn = true,
  },
  missile = {
    sprite = 0, -- WA draws no round; the art spec draws it
    ends_on_contact = {
      land = true, worms = true, worms_frozen = true, crates = true,
      donor_cards = true, objects = true, water = true,
    },
  },
}

weapon.missile_sprite = {
    sheet = "sprites/px_hold/valyrian_fire.png", frames = 1,
    spin = true, spin_speed = 0.35,
    hide = true,
    sink_tint = 0xA0B4FF, -- cooler and darker below the water
  }

function weapon.definition()
  local shared = require("lib/shared")
  local fires = shared.fires
  local sdk = require("wf-lib/holds")
  local PX_POSTURE, PX_HANDS = sdk.PX_POSTURE, sdk.PX_HANDS
  return require("lib/weapon").merge(weapon.record, {
    wep = "weps/petrol_bomb.wep",
    panel_icon = "sprites/valyrian_fire/icon.png",
    hold_as = "stock.petrol_bomb",
    worm_sprites = PX_POSTURE,
    sprites = { "sprites/px_hold/valyrian_fire.png" },
    params = { gpu_prefix = "sprites/px_hold/" },
    on_fire = function(fire) fires.valyrian_fire(fire) end,
    on_explode = function(ev) fires.valyrian_burst(ev) end,
    hold = { -- Valyrian Fire (valyrianfire_s)
        thrown = true,
        sheet = "sprites/px_hold/valyrian_fire.png", hand_type = 1, hand_radius = -6.0,
        hand_rotation = 0.0, hand_radial_rotation = 0.0, hand_scale = 1.0,
        weap_rotation = 0.35, weap_radial_rotation = 0.0, weap_radius = -8.0,
        hand = PX_HANDS[1],
    },
  })
end

function weapon.setup()
  local shared = require("lib/shared")
  local fires = shared.fires

  local THROW_OUT = 15

  fires.valyrian_fire = function(fire)
    local w = fire.worm
    if w.y >= wa.world.water() then
      local n = w:ammo("px.valyrian_fire")
      if n >= 0 then w:ammo("px.valyrian_fire", { set = n + 1 }) end
      return
    end
    local x, y = fire.x, fire.y
    local speed = math.sqrt(fire.vx * fire.vx + fire.vy * fire.vy)
    if speed > 0 then
      x = x + (THROW_OUT * fire.vx / speed)
      y = y + (THROW_OUT * fire.vy / speed)
    end
    wa.weapons.launch({ weapon = "px.valyrian_fire", owner = w, x = x, y = y, vx = fire.vx, vy = fire.vy })
  end

  local RING_DX = {
      -0.85107421875, -1.7654266357421875, 2.99908447265625, -1.8835601806640625, -0.7073516845703125, 2.7441864013671875, -2.6315155029296875, 0.45758056640625, 2.0747833251953125, -2.981964111328125,
      1.5533905029296875, 1.091949462890625, -2.8819732666015625, 2.41455078125, -0.055816650390625, -2.3466339111328125, 2.910980224609375, -1.195159912109375, -1.4568328857421875, 2.967681884765625,
      -2.153961181640625, -0.346954345703125, 2.5760955810546875, -2.787384033203125, 0.8153228759765625, 1.795379638671875, -2.9997711181640625, 1.8544464111328125, 0.7434539794921875, -2.7590179443359375,
      2.6134490966796875, -0.4207611083984375, -2.10150146484375, 2.9776611328125, -1.5214385986328125, -1.12652587890625, 2.89208984375, -2.39227294921875, 0.0186004638671875, 2.3696441650390625,
      -2.9017486572265625, 1.1609344482421875, 1.4892425537109375, -2.972900390625, 2.1278839111328125, 0.3838958740234375, -2.594970703125, 2.7734222412109375, -0.779449462890625, -1.8250579833984375,
      3.0,
  }
  local RING_DY = {
      -2.8767547607421875, -2.425537109375, -0.0744171142578125, 2.3350067138671875, 2.9154205322265625, 1.212188720703125, -1.4405364990234375, -2.96490478515625, -2.1668701171875, 0.3284759521484375,
      2.5665130615234375, 2.794219970703125, 0.833221435546875, -1.7804412841796875, -2.999481201171875, -1.8690338134765625, 0.7254180908203125, 2.7516632080078125, 2.622528076171875, 0.439178466796875,
      -2.0881805419921875, -2.9798736572265625, -1.537445068359375, 1.1092681884765625, 2.8870849609375, 2.4034576416015625, 0.0372161865234375, -2.358184814453125, -2.9064178466796875, -1.178070068359375,
      1.4730682373046875, 2.9703521728515625, 2.140960693359375, -0.3654327392578125, -2.5855865478515625, -2.78045654296875, -0.7974090576171875, 1.8102569580078125, 2.99993896484375, 1.83978271484375,
      -0.761474609375, -2.766265869140625, -2.6042633056640625, -0.40234375, 2.1147308349609375, 2.975341796875, 1.50537109375, -1.1437530517578125, -2.89697265625, -2.3809967041015625,
      0.0,
  }
  local VALYRIAN_FIRE = {
    count = 0, duration = 6000, up_power = 0, damage = 0, damage_scale = 1.25, knock_scale = 2,
    tint = 0x4BE14B,
  }

  fires.valyrian_burst = function(ev)
    local owner = shared.current_worm() or ev.worm
    if not owner then return end
    for i = 1, #RING_DX do
      wa.fire.spawn({
        owner = owner, x = ev.x + RING_DX[i], y = ev.y + RING_DY[i],
        count = VALYRIAN_FIRE.count, duration = VALYRIAN_FIRE.duration,
        up_power = VALYRIAN_FIRE.up_power, damage = VALYRIAN_FIRE.damage,
        damage_scale = VALYRIAN_FIRE.damage_scale, knock_scale = VALYRIAN_FIRE.knock_scale,
        tint = VALYRIAN_FIRE.tint,
      })
    end
  end
end

return weapon
`
      },
      {
        path: 'weapons/weapon_crate.lua',
        name: 'weapons/weapon_crate.lua',
        language: 'lua',
        content: `-- Weapon Crate: places a weapon crate in front of the worm; one per team per round.

local weapon = {}

weapon.record = {
  handling = {
    remember_selection = true,
    ends_turn = true,
  },
}

weapon.defaults = { ends_invisibility = false }

function weapon.definition()
  local shared = require("lib/shared")
  local fires = shared.fires
  return require("lib/weapon").merge(weapon.record, {
    wep = "weps/freeze.wep",
    panel_icon = "sprites/weapon_crate/icon.png",
        worm_sprites = {
          weaponlnk = "sprites/weapon_crate/take_out.png", weaponlnku = "sprites/weapon_crate/take_outu.png",
          weaponlnkd = "sprites/weapon_crate/take_outd.png",
          wthrow = "sprites/weapon_crate/put_away.png", wthrowu = "sprites/weapon_crate/put_awayu.png",
          wthrowd = "sprites/weapon_crate/put_awayd.png",
          wdynlnk = "sprites/weapon_crate/take_out.png", wdynlnku = "sprites/weapon_crate/take_outu.png",
          wdynlnkd = "sprites/weapon_crate/take_outd.png",
        },
    params = { worm_sprites_animate = true },
    on_fire = function(fire) fires.weapon_crate(fire) end,
  })
end

function weapon.setup()
  local shared = require("lib/shared")
  local AHEAD = 40 -- px in front of the worm

  shared.fires.weapon_crate = function(fire)
    local worm = fire.worm
    wa.crates.spawn({ x = worm.x + worm.facing * AHEAD, y = worm.y, kind = "weapon", drop = "teleport" })
  end
end

return weapon
`
      },
      {
        path: 'weapons/windy_cluster.lua',
        name: 'weapons/windy_cluster.lua',
        language: 'lua',
        content: `-- Windy Cluster: a cluster bomb whose bits are carried by the wind.

local weapon = {}

weapon.record = {
  missile = {
    alarm_worms = false,
    wind_pct = 48,
  },
  clusters = {
    bit = {
      trail = {
        speed = 200,
        sprite = 615,
      },
      wind_pct = 50,
    },
    count = 8,
    launch_power_pct = 35,
    power_variation_pct = 25,
    spread = 40,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.cluster_bomb",
    name = "Windy Cluster",
    panel_icon = "sprites/windy_cluster/ico_windyc.png",
    cluster_sprite = "sprites/windy_cluster/cluster.png",
  })
end

return weapon
`
      },
      {
        path: 'weapons/wind_changer.lua',
        name: 'weapons/wind_changer.lua',
        language: 'lua',
        content: `-- Wind Changer: 0 to 9 choose the force; firing sets the wind toward where the worm faces.

local weapon = {}

weapon.record = {
  fires = {
    subtype = 19,
  },
  handling = {
    retreat = 0,
  },
  utility = {
    effect = "scripted",
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.surrender",
    name = "Wind Changer",
    panel_icon = "sprites/wind_changer/ico_windchanger.png",
    sounds = {
          "sounds/wind_changer/breeze.wav", "sounds/wind_changer/calm_wind.wav",
          "sounds/wind_changer/strong_wind.wav",
        },
  })
end

weapon.requires = { "lib/turn_controls" }

function weapon.setup()
  local WIND_STEP = 0.0317
  local wind_force = 0
  require("lib/turn_controls").register("px.wind_changer", {
    frame = function(worm)
      if worm.turn and worm.weapon ~= "px.wind_changer" then wind_force = 0 end
    end,
    choose = function(worm, digit)
      wind_force = digit
      wa.sound.play(worm, 107)
    end,
    fire = function(worm)
      local f = wind_force
      wa.sound.play(worm, f == 0 and "sounds/wind_changer/breeze.wav"
        or f < 6 and "sounds/wind_changer/calm_wind.wav" or "sounds/wind_changer/strong_wind.wav")
      wa.world.set_wind((f * WIND_STEP) * worm.facing)
    end,
    finish = function() wind_force = 0 end,
    hint = function()
      return string.format("Wind Changer: force %d\\n0-9: force, then Space", wind_force)
    end,
  })
end

return weapon
`
      },
      {
        path: 'weapons/wings.lua',
        name: 'weapons/wings.lua',
        language: 'lua',
        content: `-- Wings: WA's parachute without gravity or wind, flown with the arrow keys.

local weapon = {}

weapon.definition = {
  wep = "weps/wings.wep",
  name = "Wings",
  panel_icon = "sprites/wings/icon.png",
  sprites = { "sprites/wings/fly.png", "sprites/wings/fold.png" },
  sounds = { "sounds/wings/flap.wav" },
  params = {
    gpu_prefix = "sprites/wings/",
    worm_art = { "sprites/wings/fly.png", "sprites/wings/fold.png" },
  },
}

function weapon.setup()
  local own_time = require("wf-lib/own_time")
  local parachute = require("lib/parachute")
  parachute.setup()

  local ID = "px.wings"
  local DEPTH = wa.depth.WORMS
  local FLY_FRAMES, FLY_FPS = 10, 40
  local FOLD_FRAMES, FOLD_FPS = 6, 24
  local LANDING = { jump_falling = true, standing = true }
  local flights = {}

  local function art(worm, sheet)
    local a = wa.actors.spawn({
      sprite = sheet, x = worm.x, y = worm.y, owner = worm, visibility = worm, on = function() end,
    })
    a:gfx({ glow_of = worm, follow = worm, depth = DEPTH })
    return a
  end

  local function drop_art(worm, w)
    if w.fly then w.fly:remove(); w.fly = nil end
    if w.fold then w.fold:remove(); w.fold = nil end
    worm.body_visible = true
  end

  local function begin_fold(worm, w)
    drop_art(worm, w)
    w.fold, w.fold_t, w.fold_x = art(worm, "sprites/wings/fold.png"), 0, worm.x
    w.fold.facing = -worm.facing -- its art faces left, as WA's worms do
    w.fold:frame(0)
    worm.body_visible = false
  end

  local function give_gravity_back(worm, w)
    if w.gravity then worm.gravity, w.gravity = w.gravity, nil end
  end

  local function wings_frame(worm)
    local opened = parachute.fired(worm, ID)
    local w = flights[worm.id]
    if not (opened or w) then
      return
    end
    if not w then
      w = {}
      flights[worm.id] = w
    end
    local state = worm.state
    if opened == "open" and not w.flying then
      drop_art(worm, w)
      w.flying, w.gravity, w.fly_t = true, worm.gravity, 0
      worm.gravity = 0
      wa.sound.play(worm, "sounds/wings/flap.wav")
      w.fly = art(worm, "sprites/wings/fly.png")
    elseif opened == "landed" then
      wa.sound.play(worm, "sounds/wings/flap.wav")
      begin_fold(worm, w)
    end
    if w.flying then
      if state == "parachuting" then
        local keys = worm.keys or {}
        if keys.right then worm.facing = 1 elseif keys.left then worm.facing = -1 end
        w.fly.x, w.fly.y, w.fly.vx, w.fly.vy = worm.x, worm.y, 0, 0
        w.fly.facing = -worm.facing
        w.fly:frame(w.fly_t * FLY_FPS // 50 % FLY_FRAMES)
        w.fly_t = w.fly_t + own_time.frames(worm)
        worm.body_visible = false
        return
      end
      w.flying = false
      give_gravity_back(worm, w)
      if LANDING[state] then begin_fold(worm, w) else drop_art(worm, w) end
    end
    if w.fold then
      local frame = w.fold_t * FOLD_FPS // 50
      local moving = state == "walking" or state == "jump_prepare" or state == "jumping"
        or math.abs(worm.x - w.fold_x) > 1
      if moving or not LANDING[state] or (frame >= FOLD_FRAMES and state ~= "jump_falling") then
        drop_art(worm, w)
      else
        w.fold.x, w.fold.y, w.fold.vx, w.fold.vy = worm.x, worm.y, 0, 0
        w.fold.facing = -worm.facing
        w.fold:frame(math.min(frame, FOLD_FRAMES - 1))
        worm.body_visible = false
        w.fold_t = w.fold_t + own_time.frames(worm)
      end
    end
  end

  wa.on.worm_message(function(worm)
    wings_frame(worm)
  end, { msgs = { wa.msg.FRAME_FINISH } })

  -- Out of the player's hands, the worm comes down under WA's parachute.
  wa.on.turn_end(function()
    for _, worm in ipairs(wa.worms.all()) do
      local w = flights[worm.id]
      if w then give_gravity_back(worm, w) end
    end
  end)
end

return weapon
`
      }
];

const UTILITY_FILES: ModFolderInfo['files'] = [
      {
        path: 'features/agility.lua',
        name: 'features/agility.lua',
        language: 'lua',
        content: `-- From the Agility pack 1.1 (Zed / 0rang3, port by reddaz), as it was.

local own_time = require("wf-lib/own_time")

local STEP      = 0.1 -- per-tick nudge, matches C's 0.1
local STEP_LOWG = 0.03 -- up-nudge while the world's gravity is changed
local LIMIT     = 3 -- matches C's SpX/SpY <= 3 cap

local ALLOWED = {
  drilling = true, -- WS_DRILLING
  after_rope = true, -- WS_AFTERROPE
  jumping = true, -- WS_JUMP
  falling = true, -- WS_JUMP
  tumbling = true, -- WS_SLIDING
  hit = true, -- WS_FLYING
  blasted = true, -- WS_POWERFLY
}

local match_gravity -- the world's gravity at the match's first frame

wa.on.worm_message(function(worm)
  match_gravity = match_gravity or wa.world.gravity()
  if not worm.turn then return end

  local state = worm.state
  if not state or not ALLOWED[state] then return end

  local k = worm.keys
  local up_step = wa.world.gravity() == match_gravity and STEP or STEP_LOWG

  for _ = 1, own_time.frames(worm) do
    if k.up and worm.vy >= -LIMIT then
      worm.vy = worm.vy - up_step
    end
    if k.down and worm.vy <= LIMIT then
      worm.vy = worm.vy + STEP
    end
    if k.left and worm.vx >= -LIMIT then
      worm.vx = worm.vx - STEP
    end
    if k.right and worm.vx <= LIMIT then
      worm.vx = worm.vx + STEP
    end
  end
end, { msgs = { wa.msg.FRAME_FINISH } })
`
      },
      {
        path: 'features/changing_wind.lua',
        name: 'features/changing_wind.lua',
        language: 'lua',
        content: `-- Changing wind, from Project X: during turns the wind moves to a new random strength every 10 to 20 seconds.

local GAP_MIN, GAP_MAX = 500, 1000 -- frames between changes
local EASE = 150 -- frames to reach the new wind
local STRENGTH = 0.3 -- the strongest new wind

local count, change_at, target = 0, nil, 0
local last_frame

wa.on.worm_message(function(worm)
  if not worm.turn then return end
  local frame = wa.world.frame()
  if frame == last_frame then return end
  last_frame = frame
  if count == 1 then change_at = wa.random(GAP_MIN, GAP_MAX) end
  if count == change_at then target = wa.random(-1000, 1000) / 1000 * STRENGTH end
  if change_at and count > change_at and count < change_at + EASE then
    local wind = wa.world.wind()
    wa.world.set_wind(wind - (wind - target) / (change_at + EASE - count))
  end
  if change_at and count >= change_at + EASE then count = 0 end
  count = count + 1
end, { msgs = { wa.msg.FRAME_FINISH } })
`
      },
      {
        path: 'features/collect_viewer.lua',
        name: 'features/collect_viewer.lua',
        language: 'lua',
        content: `-- A presentation-only inventory acquisition viewer.

local CONFIG = {
  debug = false,
  size = 24, -- bounding square, world pixels; aspect preserved
  rise = 48, -- world pixels over one lifetime
  amplitude = 6, -- horizontal sine amplitude, world pixels
  spacing = 28, -- centres in a simultaneous grant's grid
  columns = 4,
  lifetime = 2, -- simulation seconds, paused with the game
  fade = 1.5,
}
local FPS, TAU = 50, 2 * math.pi
local popups = {}
local sequence = 0
local visuals = {}
local draw_started = false
local function trace(message)
  if CONFIG.debug then wa.log("collect_viewer: " .. message) end
end
trace("loaded; size=" .. CONFIG.size .. " lifetime=" .. CONFIG.lifetime .. " fade=" .. CONFIG.fade)
local function art(weapon)
  if visuals[weapon] then return visuals[weapon] end
  local v = wa.weapons.visual(weapon)
  if v then visuals[weapon] = v end
  return v
end
wa.on.weapon_grant(function(event)
  trace(string.format("grant source=%s worm=%s coalition=%s frame=%s origin=(%s,%s) items=%d",
    tostring(event.source), tostring(event.worm_id), tostring(event.alliance), tostring(event.frame),
    tostring(event.x), tostring(event.y), #event.items))
  if event.alliance == nil then trace("grant skipped: active coalition unavailable"); return end
  local copies = {}
  for _, item in ipairs(event.items) do
    local v = art(item.weapon)
    trace(string.format("preview weapon=%s amount=%s sprite=%s kind=%s size=%s x %s",
      item.weapon, tostring(item.amount), v and v.sprite or "MISSING", v and v.kind or "?",
      v and tostring(v.width) or "?", v and tostring(v.height) or "?"))
    if v then
      for _ = 1, item.amount do copies[#copies + 1] = v end
    end
  end
  local columns = math.min(CONFIG.columns, #copies)
  if columns == 0 then trace("grant skipped: no drawable previews"); return end
  trace("spawn copies=" .. #copies)
  local rows = math.ceil(#copies / columns)
  for n, v in ipairs(copies) do
    local row = math.floor((n - 1) / columns)
    local row_count = math.min(columns, #copies - row * columns)
    local column = (n - 1) % columns
    sequence = sequence + 1
    local scale = CONFIG.size / math.max(v.width, v.height)
    popups[#popups + 1] = {
      x = event.x + (column - (row_count - 1) / 2) * CONFIG.spacing,
      y = event.y + (row - (rows - 1) / 2) * CONFIG.spacing,
      born = event.frame, alliance = event.alliance,
      phase = (sequence % 4) * TAU / 4,
      w = v.width * scale, h = v.height * scale, art = v,
    }
  end
end)
wa.on.draw(function()
  local frame = wa.world.frame()
  if not draw_started then trace("first draw frame=" .. tostring(frame)); draw_started = true end
  if frame == nil then return end
  local live, visibility = {}, {}
  for _, p in ipairs(popups) do
    local age = frame - p.born
    if age >= 0 and age < CONFIG.lifetime * FPS then
      live[#live + 1] = p
      if visibility[p.alliance] == nil then
        visibility[p.alliance] = wa.world.is_local_alliance(p.alliance)
      end
      if p.last_visible ~= visibility[p.alliance] then
        trace(string.format("popup sprite=%s coalition=%s age=%s visible=%s", p.art.sprite,
          tostring(p.alliance), tostring(age), tostring(visibility[p.alliance])))
        p.last_visible = visibility[p.alliance]
      end
      if visibility[p.alliance] then
        local u = age / (CONFIG.lifetime * FPS)
        local x = p.x + CONFIG.amplitude * (math.sin(TAU * u + p.phase) - math.sin(p.phase))
        local y = p.y - CONFIG.rise * u
        local remaining = CONFIG.lifetime - age / FPS
        local alpha = CONFIG.fade > 0
          and math.floor(255 * math.min(1, remaining / CONFIG.fade) + 0.5) or 255
        local left, right = (x - p.w / 2), (x + p.w / 2)
        local top, bottom = (y - p.h / 2), (y + p.h / 2)
        wa.draw.quad({
          points = {{left, top}, {right, top}, {right, bottom}, {left, bottom}},
          sprite = p.art.sprite, frame = p.art.frame,
          color = alpha * 0x1000000 + 0xffffff, blend = "alpha", depth = wa.depth.FRONT,
        })
      end
    else
      trace("popup expired sprite=" .. p.art.sprite .. " age=" .. age)
    end
  end
  popups = live
end)
`
      },
      {
        path: 'features/crate_pop.lua',
        name: 'features/crate_pop.lua',
        language: 'lua',
        content: `-- Crate pop: crates from the turn drop and Crate Shower pop in, each at a
-- random height within the range, with the pop at a random pitch.

return function(ctx)
  if not wa.crates.set_drop then
    wa.log("Crate pop needs a newer WormForge: crates arrive as normal")
    return
  end
  local low, high = ctx.option("height_min"), ctx.option("height_max")
  wa.crates.set_drop("pop", {
    pitch = ctx.option("pitch"),
    height = { min = math.min(low, high), max = math.max(low, high) },
  })
end
`
      },
      {
        path: 'features/damage_numbers.lua',
        name: 'features/damage_numbers.lua',
        language: 'lua',
        content: `-- Floating damage and heal numbers, Worms Reloaded type shyt.

local GLYPH_H = 12
local MIN_SCALE = 0.80
local MAX_SCALE = 1.22
local MAX_SCALE_DAMAGE = 80
local GLYPH_GAP = 1.0
local DAMAGE_LIFE = 80
local DAMAGE_FADE = 24
local HEAL_LIFE = 64
local HEAL_FADE = 28
local DAMAGE_VY = -2.45
local DAMAGE_GRAVITY = 0.15
local SIDE_VX = 0.55
local HEAL_VY = -0.42
local HEAL_SIDE_VX = 0.18
local RED_AT = 40
local START_ABOVE = 18
local START_SIDE = 6
local SIDE_MODES = { alternate = true, facing = true, random = true }

local ORANGE = { 255, 160, 32 }
local RED = { 255, 48, 16 }
local HEAL = { 80, 255, 112 }

local WIDTH = {
  [0] = 11, [1] = 10, [2] = 11, [3] = 12, [4] = 12,
  [5] = 11, [6] = 12, [7] = 11, [8] = 11, [9] = 12,
}
local BANG_WIDTH = 7

local SPRITE = {
  [0] = "sprites/damage_numbers/d0.png",
  [1] = "sprites/damage_numbers/d1.png",
  [2] = "sprites/damage_numbers/d2.png",
  [3] = "sprites/damage_numbers/d3.png",
  [4] = "sprites/damage_numbers/d4.png",
  [5] = "sprites/damage_numbers/d5.png",
  [6] = "sprites/damage_numbers/d6.png",
  [7] = "sprites/damage_numbers/d7.png",
  [8] = "sprites/damage_numbers/d8.png",
  [9] = "sprites/damage_numbers/d9.png",
  bang = "sprites/damage_numbers/bang.png",
}
local SPRITE_PATHS = {
  SPRITE[0], SPRITE[1], SPRITE[2], SPRITE[3], SPRITE[4], SPRITE[5],
  SPRITE[6], SPRITE[7], SPRITE[8], SPRITE[9], SPRITE.bang,
}

local function rgb(r, g, b)
  return (r << 16) | (g << 8) | b
end

local ORANGE_RGB = rgb(ORANGE[1], ORANGE[2], ORANGE[3])
local RED_RGB = rgb(RED[1], RED[2], RED[3])
local HEAL_RGB = rgb(HEAL[1], HEAL[2], HEAL[3])

local function amount_scale(amount)
  local t = (amount - 1) / (MAX_SCALE_DAMAGE - 1)
  if t < 0 then t = 0 elseif t > 1 then t = 1 end
  return MIN_SCALE + (MAX_SCALE - MIN_SCALE) * t
end

local function damage_rgb(damage)
  local t = (damage - 5) / (RED_AT - 5)
  if t < 0 then t = 0 elseif t > 1 then t = 1 end
  return rgb(
    math.floor(ORANGE[1] + (RED[1] - ORANGE[1]) * t + 0.5),
    math.floor(ORANGE[2] + (RED[2] - ORANGE[2]) * t + 0.5),
    math.floor(ORANGE[3] + (RED[3] - ORANGE[3]) * t + 0.5))
end

local function text_glyphs(amount, kind, art)
  local text = tostring(amount)
  if kind == "damage" then
    if amount >= 75 then
      text = text .. "!!"
    elseif amount >= 55 then
      text = text .. "!"
    end
  end
  local glyphs = {}
  for i = 1, #text do
    local byte = text:byte(i)
    if byte == 33 then
      glyphs[#glyphs + 1] = art.bang
    else
      glyphs[#glyphs + 1] = art[byte - 48]
    end
  end
  return glyphs
end

local QUAD = {
  points = { { 0, 0 }, { 0, 0 }, { 0, 0 }, { 0, 0 } },
  sprite = "", color = 0xFFFFFFFF, blend = "alpha", depth = wa.depth.FRONT,
}

local function draw_glyphs(glyphs, x, y, scale, alpha, colour)
  local width = -GLYPH_GAP
  for i = 1, #glyphs do
    width = width + glyphs[i].w + GLYPH_GAP
  end
  width = width * scale
  local left = x - width / 2
  local top = y - GLYPH_H * scale / 2
  local bottom = top + GLYPH_H * scale
  local points = QUAD.points
  for i = 1, #glyphs do
    local glyph = glyphs[i]
    local right = left + glyph.w * scale
    points[1][1], points[1][2] = left, top
    points[2][1], points[2][2] = right, top
    points[3][1], points[3][2] = right, bottom
    points[4][1], points[4][2] = left, bottom
    QUAD.sprite = glyph.sprite
    QUAD.color = (alpha << 24) | colour
    wa.draw.quad(QUAD)
    left = right + GLYPH_GAP * scale
  end
end

local function pop_scale(age, base)
  if age >= 4 then
    return base
  end
  local grow = base * (0.7 + 0.3 * age / 4)
  return grow < MIN_SCALE and MIN_SCALE or grow
end

local function draw_popup(popup, age)
  local damage = popup.kind == "damage"
  local life = damage and DAMAGE_LIFE or HEAL_LIFE
  local fade = damage and DAMAGE_FADE or HEAL_FADE
  local remaining = life - age
  local alpha = 255
  if remaining < fade then
    alpha = math.floor(255 * remaining / fade + 0.5)
    if alpha < 0 then alpha = 0 end
  end
  local x = popup.x + popup.vx * age
  local y
  if damage then
    y = popup.y + popup.vy * age + 0.5 * DAMAGE_GRAVITY * age * age
  else
    y = popup.y + popup.vy * age
  end
  draw_glyphs(popup.glyphs, x, y, pop_scale(age, popup.scale), alpha, popup.colour)
end

return function(cfg)
  local side_mode = cfg and cfg.side or "alternate"
  if not SIDE_MODES[side_mode] then
    side_mode = "alternate"
  end

  local art = {}
  for digit = 0, 9 do
    art[digit] = { sprite = wa.sprites.key(SPRITE[digit]), w = WIDTH[digit] }
  end
  art.bang = { sprite = wa.sprites.key(SPRITE.bang), w = BANG_WIDTH }

  wa.assets.load({
    sprites = SPRITE_PATHS,
    gpu_prefix = "sprites/damage_numbers/",
  })

  local last_hp = {}
  local pending_one = {}
  local last_side = {}
  local popups = {}
  local spawned = false
  local rng = 0x9E3779B9

  local function next_rng()
    rng = (rng * 1103515245 + 12345) % 0x80000000
    return rng
  end

  local function side_for(worm, damage)
    local facing = (worm.facing and worm.facing < 0) and -1 or 1
    if not damage or side_mode == "facing" then
      return facing
    end
    if side_mode == "random" then
      next_rng()
      return (rng % 2 == 0) and -1 or 1
    end
    local last = last_side[worm.id]
    local side = last and -last or facing
    last_side[worm.id] = side
    return side
  end

  local function add_popup(kind, amount, subject, frame)
    local damage = kind == "damage"
    local side = side_for(subject, damage)
    popups[#popups + 1] = {
      kind = kind,
      born = frame,
      x = subject.x + side * START_SIDE,
      y = subject.y - START_ABOVE,
      vx = side * (damage and SIDE_VX or HEAL_SIDE_VX),
      vy = damage and DAMAGE_VY or HEAL_VY,
      glyphs = text_glyphs(amount, kind, art),
      scale = amount_scale(amount),
      colour = damage and damage_rgb(amount) or HEAL_RGB,
    }
  end

  local function observe()
    local frame = wa.world.frame()
    if not frame then return end
    for _, worm in ipairs(wa.worms.all()) do
      local hp = worm.hp
      local last = last_hp[worm.id]
      if last ~= nil then
        local diff = hp - last
        local held = pending_one[worm.id]
        if held then
          if diff == 1 then
            pending_one[worm.id] = nil
            diff = 0
          else
            add_popup("damage", 1, held, frame)
            pending_one[worm.id] = nil
          end
        end
        if diff < 0 then
          local amount = -diff
          if amount == 1 and hp > 0 then
            pending_one[worm.id] = {
              id = worm.id, x = worm.x, y = worm.y, facing = worm.facing,
            }
          else
            add_popup("damage", amount, worm, frame)
          end
        elseif diff > 0 then
          add_popup("heal", diff, worm, frame)
        end
      end
      last_hp[worm.id] = hp > 0 and hp or nil
    end
  end

  wa.on.worm_message(function(worm)
    if spawned then return end
    spawned = true
    wa.actors.spawn({
      sprite = false, x = 0, y = 0, owner = worm,
      on = observe,
    })
  end, { msgs = { wa.msg.FRAME_FINISH } })

  wa.on.draw(function()
    local frame = wa.world.frame()
    if not frame then return end
    local live = {}
    for i = 1, #popups do
      local popup = popups[i]
      local age = frame - popup.born
      local life = popup.kind == "damage" and DAMAGE_LIFE or HEAL_LIFE
      if age >= 0 and age < life then
        live[#live + 1] = popup
        draw_popup(popup, age)
      end
    end
    popups = live
  end)

  wa.log("damage numbers: side " .. side_mode)
end
`
      },
      {
        path: 'features/ex_turn_side.lua',
        name: 'features/ex_turn_side.lua',
        language: 'lua',
        content: `-- ExTurnSide, by reddaz: left and right turn the worm during jumps and flights.

local prev_left = false
local prev_right = false

-- While the cursor is up for a girder or a strike, left and right aim it.
local AIMS_THE_CLICK = { girder = true, strike = true }

wa.on.worm_message(function(worm)
  if not worm.turn then return end
  if worm.state == "roping" then return end
  if worm.state == "kamikaze" then return end

  local k = wa.world.keys()

  if k.shift then return end

  local left = k.left and not prev_left
  local right = k.right and not prev_right
  prev_left = k.left
  prev_right = k.right
  if not (left or right) or AIMS_THE_CLICK[worm.click] then return end

  if left then
    worm.facing = -1
  end

  if right then
    worm.facing = 1
  end
end, { msgs = { wa.msg.FRAME_FINISH } })
`
      },
      {
        path: 'features/fast_aim.lua',
        name: 'features/fast_aim.lua',
        language: 'lua',
        content: `-- Fast aim, from Project X: with Shift held, the aim keys move at another speed.

local own_time = require("wf-lib/own_time")

local STEP = 180 / 128 -- WA's aim step, degrees a frame (exact in binary)

return function(pct)
  local state = {}
  local supported -- this DLL has worm.aim_target

  wa.on.worm_message(function(worm)
    if not worm.turn then return end
    if supported == nil then
      local ok, v = pcall(function() return worm.aim_target end)
      supported = ok and type(v) == "number"
      if not supported then
        wa.log("fast aim: this WormForge has no worm.aim_target; fast aim is off")
      end
    end
    if not supported then return end

    local id = worm.id
    if not worm.aiming or not wa.world.keys().shift then
      state[id] = nil
      return
    end

    local t = worm.aim_target
    local scale = own_time.scale(worm)
    local s = state[id]
    if not s then
      state[id] = { last = t, dir = 0, acc = 0, scale = scale }
      return
    end

    local d = t - s.last
    local most = math.ceil(math.max(scale, s.scale))
    s.scale = scale
    local n = math.abs(d) / STEP
    if d == 0 or n ~= math.floor(n) or n > most then
      s.last, s.acc = t, 0
      if d ~= 0 then s.dir = 0 end
      return
    end
    local dir = d > 0 and STEP or -STEP
    if dir ~= s.dir then
      s.last, s.dir, s.acc = t, dir, 0
      return
    end

    s.acc = s.acc + pct * n
    local steps = s.acc // 100
    s.acc = s.acc % 100
    local want = math.max(-90, math.min(90, t + (steps - n) * dir))
    if want ~= t then worm:input{ aim = want } end
    s.last = want
  end, { msgs = { wa.msg.FRAME_FINISH } })
end
`
      },
      {
        path: 'features/fog.lua',
        name: 'features/fog.lua',
        language: 'lua',
        content: `-- Fog of war: select this add-on in a profile to play with fog.

local KEYS = {
  "circle_radius",
  "cone_width",
  "cone_length",
  "shadow_cast",
  "discover",
  "view_ownership",
  "animal_circle_radius",
  "animal_cone_length",
  "animal_cone_width",
  "proj_circle",
  "proj_cone_length",
  "proj_cone_width",
  "proj_shadow_cast",
  "proj_ownership",
  "explosion_circle",
  "explosion_ownership",
  "explosion_shadow_cast",
  "crate_circle",
  "crate_shadow_cast",
  "spectator_mode",
  "placement_vision",
  "fog_floor",
  "hide_enemy_hud"
}

return function(ctx)
  local scheme = {}
  for _, key in ipairs(KEYS) do scheme[key] = ctx.option(key) end
  wa.fog.set(scheme)
  wa.fog.enable(true)
  local camera = ctx.option("camera_follow")
  if camera == "all but enemies" then
    wa.camera.follow("owned")
  elseif camera == "only my side" then
    wa.camera.follow("owned", { public = false })
  end
end
`
      },
      {
        path: 'features/instant_death.lua',
        name: 'features/instant_death.lua',
        language: 'lua',
        content: `-- Let each zero-HP victim die without waiting for the battlefield.

return function(mode)
  local in_flight = mode == "in_flight"
  wa.on.worm_message(function(worm)
    if not worm.turn and worm.hp == 0 then
      if not (in_flight and worm:die()) then
        worm:die{ settled = true }
      end
    end
  end, { msgs = { wa.msg.FRAME_FINISH } })
end
`
      },
      {
        path: 'features/kill_counter.lua',
        name: 'features/kill_counter.lua',
        language: 'lua',
        content: `-- Kill counter, from Project X: a badge behind each worm counts its kills.

local BADGE_BEHIND = 15
local BADGE_ABOVE = 10
local BADGE_SIZE = 50 * 0.75

local SPARKS = 25
local SPARK_LIFE = 40 -- frames
local SPARK_SPEED = { 1.5, 3.8 } -- pixels/frame, in a random direction
local SPARK_GRAVITY = 0.25 * 0.24 -- GravityFactor(0.25) of WA's gravity
local SPARK_DRAG = 0.05 -- SetAirResistance: speed lost a frame
local SPARK_JITTER = 0.2 -- SetMotionRandomness
local SPARK_SIZE = { 0.2, 0.4 } -- of the 128-pixel glow, shrinking to 0.005
local SPARK_GLOW = 128
local SPARK_ALPHA = 180

local SPRITE_DIR = "sprites/kill_counter/"
local NAMES = { "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "kill_glow" }

local paths = {}
for i, name in ipairs(NAMES) do paths[i] = SPRITE_DIR .. name .. ".png" end
wa.assets.load({ sprites = paths })
local badge = {}
for n = 1, 10 do badge[n] = wa.sprites.key(paths[n]) end
local glow = wa.sprites.key(paths[11])

local kills = {} -- [worm id] = count
local bursts = {} -- { x, y, born, sparks }
local shooter -- PX's ShootingOne: the last worm whose turn it was

wa.on.turn_start(function(event)
  if event.worm then shooter = event.worm.id end
end)

local function find(id)
  for _, worm in ipairs(wa.worms.all()) do
    if worm.id == id then return worm end
  end
end

wa.on.death(function(event)
  local victim = event.victim
  local carried = kills[victim.id] or 0
  kills[victim.id] = nil
  local killer = event.active
  if killer == nil and shooter then killer = find(shooter) end
  if killer == nil or killer.id == victim.id then return end
  kills[killer.id] = (kills[killer.id] or 0) + 1 + carried
  bursts[#bursts + 1] = { x = killer.x, y = killer.y, born = wa.world.frame() }
  wa.log(string.format("kill counter: worm %d killed worm %d, now %d",
    killer.id, victim.id, kills[killer.id]))
end)

local function lerp(a, b, t) return a + (b - a) * t end

local function launch(burst)
  local sparks = {}
  for i = 1, SPARKS do
    local angle = wa.draw.random() * 2 * math.pi
    local speed = lerp(SPARK_SPEED[1], SPARK_SPEED[2], wa.draw.random())
    local red = math.floor(wa.draw.random() * 51)
    sparks[i] = {
      x = burst.x, y = burst.y,
      vx = math.cos(angle) * speed, vy = math.sin(angle) * speed,
      size = lerp(SPARK_SIZE[1], SPARK_SIZE[2], wa.draw.random()),
      green = { 255 - red, 80 - red },
    }
  end
  burst.sparks, burst.age = sparks, 0
end

local function step(s)
  s.vx = (s.vx + (wa.draw.random() - 0.5) * SPARK_JITTER) * (1 - SPARK_DRAG)
  s.vy = (s.vy + SPARK_GRAVITY + (wa.draw.random() - 0.5) * SPARK_JITTER) * (1 - SPARK_DRAG)
  s.x, s.y = s.x + s.vx, s.y + s.vy
end

local QUAD = {
  points = { { 0, 0 }, { 0, 0 }, { 0, 0 }, { 0, 0 } },
  sprite = "", color = 0xFFFFFFFF, blend = "alpha", depth = wa.depth.FRONT,
}

local function square(x, y, size)
  local h = size / 2
  local p = QUAD.points
  p[1][1], p[1][2] = x - h, y - h
  p[2][1], p[2][2] = x + h, y - h
  p[3][1], p[3][2] = x + h, y + h
  p[4][1], p[4][2] = x - h, y + h
end

local function draw_bursts(frame, fraction)
  local live = {}
  QUAD.sprite, QUAD.blend, QUAD.visibility = glow, "add", nil
  for _, burst in ipairs(bursts) do
    local age = frame - burst.born
    if age >= 0 and age < SPARK_LIFE then
      live[#live + 1] = burst
      if not burst.sparks then launch(burst) end
      while burst.age < age do
        for _, s in ipairs(burst.sparks) do step(s) end
        burst.age = burst.age + 1
      end
      local t = (age + fraction) / SPARK_LIFE
      for _, s in ipairs(burst.sparks) do
        local green = math.floor(lerp(s.green[1], s.green[2], t))
        if green < 0 then green = 0 end
        QUAD.color = (SPARK_ALPHA << 24) | (255 << 16) | (green << 8)
        square(s.x + s.vx * fraction, s.y + s.vy * fraction,
          lerp(s.size, 0.005, t) * SPARK_GLOW)
        wa.draw.quad(QUAD)
      end
    end
  end
  bursts = live
end

wa.on.draw(function()
  local frame = wa.world.frame()
  if frame == nil then return end
  if #bursts > 0 then draw_bursts(frame, wa.draw.fraction()) end

  QUAD.blend, QUAD.color = "alpha", 0xFFFFFFFF
  for _, worm in ipairs(wa.worms.all()) do
    local n = kills[worm.id]
    if n and worm.visible ~= false then
      local side = (worm.facing and worm.facing < 0) and -1 or 1
      QUAD.sprite = badge[n > 9 and 10 or n]
      QUAD.visibility = worm
      square(worm.x - BADGE_BEHIND * side, worm.y - BADGE_ABOVE, BADGE_SIZE)
      wa.draw.quad(QUAD)
    end
  end
  QUAD.visibility = nil
end)
`
      },
      {
        path: 'features/live_hp.lua',
        name: 'features/live_hp.lua',
        language: 'lua',
        content: `-- Live HP, originally by reddaz.

local function can_show(worm)
  local ok, show = pcall(function() return worm.show_health end)
  return ok and show ~= nil
end

wa.on.hurt(function(hit)
  if hit.phase ~= "post" or hit.lost <= 0 then return end
  local worm = hit.worm
  if worm.turn or worm.hp < 0 then return end
  if worm.hp == 0 and can_show(worm) then
    worm:show_health()
  else
    worm:commit_health()
  end
end)
`
      },
      {
        path: 'features/panel_highlight.lua',
        name: 'features/panel_highlight.lua',
        language: 'lua',
        content: `-- Panel highlight: a green square round each weapon on the panel that doesn't
-- end the turn, and a key above the panel, both fading in as it opens.

local GREEN = 0x40E040
local FADE = 0.25 -- seconds
local LINE = 2 -- outline thickness, pixels
local KEY = 12 -- the key's square, pixels
local KEY_TEXT = " = sdet"

local continues = {} -- [weapon id] = true when using it doesn't end the turn

local function keeps_turn(id)
  local known = continues[id]
  if known == nil then
    local ok, data = pcall(wa.weapons.data, id)
    if not (ok and data and data.handling) then return false end
    local ends = data.handling.ends_turn
    known = ends == false or ends == 0
    continues[id] = known
  end
  return known
end

local function outline(x, y, size, color)
  wa.hud.rect{ x = x, y = y, w = size, h = LINE, color = color }
  wa.hud.rect{ x = x, y = y + size - LINE, w = size, h = LINE, color = color }
  wa.hud.rect{ x = x, y = y + LINE, w = LINE, h = size - 2 * LINE, color = color }
  wa.hud.rect{ x = x + size - LINE, y = y + LINE, w = LINE, h = size - 2 * LINE, color = color }
end

return function()
  if not wa.panel.stock then
    wa.log("panel highlight: this WormForge has no wa.panel.stock; off")
    return
  end
  wa.on.hud(function()
    local panel = wa.panel.stock()
    if not panel then return end
    local alpha = math.min(1, panel.opened / FADE)
    local color = math.floor(alpha * 255) * 0x1000000 + GREEN
    local left
    for _, cell in ipairs(panel.cells) do
      if not left or cell.x < left then left = cell.x end
      if keeps_turn(cell.weapon) then
        outline(cell.x - LINE, cell.y - LINE, cell.size + 2 * LINE, color)
      end
    end
    if not left then return end
    local top = panel.y - KEY - 6
    outline(left - LINE, top, KEY, color)
    wa.hud.text{ text = KEY_TEXT, x = left - LINE + KEY + 2, y = top, alpha = alpha }
  end)
end
`
      },
      {
        path: 'features/parkour.lua',
        name: 'features/parkour.lua',
        language: 'lua',
        content: `-- The global option reuses the same movement controller as the PX utility.

wa.on.worm_message(require("wf-lib/parkour").new(), {
  msgs = {wa.msg.FRAME_FINISH,wa.msg.JUMP,wa.msg.JUMP_UP},
})
`
      },
      {
        path: 'features/rope_counter.lua',
        name: 'features/rope_counter.lua',
        language: 'lua',
        content: `-- Rope counter, from Project X: how often each team has attached the Ninja Rope, above the turn timer.

local COLOURS = { "red", "blue", "green", "yellow", "purple", "cyan" }
local LEFT, BOTTOM, LINE = 6, 92, 20 -- pixels: the timer boxes sit 6 in, their top 74 above the bottom

local shots, states = {}, {} -- by team, by worm id

wa.on.worm_message(function(worm)
  local was = states[worm.id]
  states[worm.id] = worm.state
  if worm.turn and worm.state == "roping" and was ~= "roping" then
    shots[worm.team] = (shots[worm.team] or 0) + 1
  end
end, { msgs = { wa.msg.FRAME_FINISH } })

wa.on.hud(function()
  local names, colours = {}, {}
  for _, w in ipairs(wa.worms.all()) do
    if w.hp > 0 and not names[w.team] then
      names[w.team], colours[w.team] = w.name, COLOURS[w.alliance + 1]
    end
  end
  local _, h = wa.hud.size()
  local y = h - BOTTOM
  for team = 6, 1, -1 do
    if names[team] then
      wa.hud.text({ text = ("%s rope shots: %03d"):format(names[team], shots[team] or 0),
        x = LEFT, y = y, color = colours[team] })
      y = y - LINE
    end
  end
end)
`
      },
      {
        path: 'features/utilities.lua',
        name: 'features/utilities.lua',
        language: 'lua',
        content: `-- Utilities: a collection of features that could fit a diverse set of schemes

local PACKS = {
  { "ex_turn_side", "features/ex_turn_side" },
  { "agility", "features/agility" },
  { "parkour", "features/parkour" },
  { "live_hp", "features/live_hp" },
  { "instant_death", "features/instant_death", choice = true },
  { "collect_viewer", "features/collect_viewer" },
  { "kill_counter", "features/kill_counter" },
  { "panel_highlight", "features/panel_highlight", call = true },
  { "rope_counter", "features/rope_counter" },
  { "changing_wind", "features/changing_wind" },
}

return function(ctx)
  local heal = ctx.option("heal_per_turn")
  if heal > 0 then
    local healed = false
    wa.on.turn_start(function(ev)
      if healed then return end
      healed = true
      ev.worm:heal(heal)
    end)
    wa.on.turn_end(function() healed = false end)
  end

  local on = {}
  for _, pack in ipairs(PACKS) do
    local value = ctx.option(pack[1])
    if value and value ~= "off" then
      local pack_module = require(pack[2])
      if pack.choice then pack_module(value) end
      if pack.call then pack_module() end
      on[#on + 1] = pack[1]
    end
  end
  
  if ctx.option("fast_aim") then
    require("features/fast_aim")(ctx.option("fast_aim_speed"))
    on[#on + 1] = "fast_aim"
  end

  if ctx.option("damage_numbers") then
    require("features/damage_numbers")({
      side = ctx.option("damage_numbers_side"),
    })
    on[#on + 1] = "damage_numbers"
  end

  if ctx.option("fps_counter") and wa.hud.fps_counter then
    wa.hud.fps_counter()
    on[#on + 1] = "fps_counter"
  end

  if ctx.option("disable_zoom") and wa.view.disable_zoom then
    wa.view.disable_zoom()
    on[#on + 1] = "disable_zoom"
  end

  wa.log(("heal %d, packs %s"):format(
    heal, #on > 0 and table.concat(on, " ") or "none"))
end
`
      },
      {
        path: 'features/worm_glow.lua',
        name: 'features/worm_glow.lua',
        language: 'lua',
        content: `-- Worm glow: a soft glow round every worm.

return function(ctx)
  local pad = ctx.option("pad")
  wa.assets.load({
    wa_sprites = { "worm" },
    worm_glow = {
      radius = ctx.option("radius"),
      pad = pad > 0 and pad or nil,
      gain = ctx.option("gain") / 100,
    },
  })
  local colour = ctx.option("red") * 65536 + ctx.option("green") * 256 + ctx.option("blue")
  local tint = { color = 0xFFFFFF, glow = ctx.option("strength") / 100, glow_color = colour }
  wa.on.draw(function()
    for _, worm in ipairs(wa.worms.all()) do
      if worm.tint == nil then worm.tint = tint end
    end
  end)
end
`
      },
      {
        path: 'lib/cursor.lua',
        name: 'lib/cursor.lua',
        language: 'lua',
        content: `-- Shared land-cursor lifetime.

local M = {}

function M.install(ctx, spec)
  local cursor, owner
  local function selected(worm)
    return worm and worm.turn and worm.hp > 0 and worm.weapon == ctx.id
  end
  local function stop()
    if spec.stop then spec.stop(cursor) end
    if cursor then cursor:remove(); cursor = nil end
    owner = nil
  end
  local function start(worm, x, y)
    stop()
    if not worm or not worm.turn or worm.hp <= 0 then return end
    owner = worm
    cursor = wa.cursor.spawn{
      owner = worm, x = x, y = y,
      on = function(a)
        if not selected(worm) then stop(); return end
        if spec.frame then spec.frame(a, worm) end
      end,
    }
    if spec.start then spec.start(cursor, worm) end
  end

  wa.weapons.replace{
    copy_from = "stock.teleport",
    name = spec.name,
    panel_icon = spec.icon or "teleport",
    is_weapon = true,
    eat_fire = true,
    click_finish = false,
    handling = { ends_turn = false, remember_selection = true },
    on_select = {
      cursor = true,
      on = function(sel) start(sel.worm, sel.x, sel.y) end,
    },
    on_click = function(ev)
      if spec.click and cursor and selected(owner) and ev.worm.id == owner.id then
        spec.click(ev)
      end
    end,
  }
  wa.on.turn_start(function(ev)
    stop()
    if selected(ev.worm) then
      local p = wa.world.pointer()
      start(ev.worm, p.x, p.y)
    end
  end)
  wa.on.turn_end(stop)
end

function M.nearest(objects, x, y, eligible)
  local best, best_d
  for _, obj in ipairs(objects) do
    if eligible(obj) then
      local dx, dy = obj.x - x, obj.y - y
      local d = dx * dx + dy * dy
      if d <= 24 * 24 and (not best_d or d < best_d) then
        best, best_d = obj, d
      end
    end
  end
  return best
end

return M
`
      },
      {
        path: 'weapons/bullet_time.lua',
        name: 'weapons/bullet_time.lua',
        language: 'lua',
        content: `-- Bullet Time: slows down everything except the active worm (including the turn timer)

local tooltip = require("wf-lib/tooltip")

local RAMP = 2 -- seconds to ease in, and to ease out
local TINT = 0x2060FF -- the screen's tint at full slow motion
local TINT_ALPHA = 0x48
local TINT_SPRITE = "sprites/bullet_time_tint.png"
local MARGIN = 8192 -- pixels of tint past the map's edges
local WAVELENGTH = 64 -- the ripple's, in pixels

return {
  defaults = {
    ammo = { round_start = 0 },
    delay = 0,
    crate = { type = "utility" },
    after_use = "continue",
  },
  install = function(ctx)
    local id = ctx.id
    local world = ctx.option("world_speed") / 100
    local worm_speed = ctx.option("worm_speed") / 100
    local total = ctx.option("seconds")
    local ramp = math.min(RAMP, total / 2)
    local music = wa.music and wa.music.set_pitch
    local tab = ctx.option("tab") and wa.world.worm_selecting ~= nil
    local tray = tab and wa.hud and wa.hud.tray
    local cells = {} -- team -> its tray entry

    wa.assets.load({ sprites = { TINT_SPRITE } })
    local tint = wa.sprites.key(TINT_SPRITE)

    local t -- real seconds since it was fired; nil while off
    local speed = 1
    local slowed -- the worm on its own time
    local ripple -- the live ripple's handle
    local leaving -- the ease out has started

    -- One depth for all three: the speed (and so the pitch of the sounds and
    -- music) is world ^ depth, so the pitch falls the same number of
    -- semitones each second, in step with the tint and the ripple's fade.
    local function depth(at)
      if at < ramp then return at / ramp end
      if at > total - ramp then return math.max(0, (total - at) / ramp) end
      return 1
    end

    -- A ripple over one ramp, fading as the tint grows or shrinks; one crest
    -- passes a point for each semitone the pitch moves.
    local semitones = 12 * math.log(1 / world, 2)
    local function ring(worm)
      if not (wa.view and wa.view.ripple) then return end
      if ripple then ripple:stop() end
      ripple = wa.view.ripple{
        x = worm.x,
        y = worm.y,
        amplitude = 10,
        wavelength = WAVELENGTH,
        speed = math.max(1, WAVELENGTH * semitones / ramp),
        duration_ms = ramp * 1000,
        falloff = 120,
      }
    end

    local function cell(worm)
      if not tray then return nil end
      local e = cells[worm.team]
      if e and e:is_open() then return e end
      if worm:ammo(id) == 0 then return nil end
      e = tray.add{ weapon = id, team = worm.team, key = "Tab" }
      cells[worm.team] = e
      return e
    end

    local function apply()
      speed = world ^ depth(t)
      wa.world.set_speed(speed)
      if music then music(speed) end
      if slowed then slowed.time_scale = math.min(worm_speed / speed, 8) end
      local e = slowed and cells[slowed.team]
      if e then e:set{ lit = true, progress = 1 - t / total } end
    end

    local function hand_to(worm)
      if slowed and slowed.id ~= worm.id then slowed.time_scale = 1 end
      slowed = worm
      apply()
    end

    local function start(worm)
      t, leaving = 0, false
      cell(worm)
      hand_to(worm)
      ring(worm)
    end

    local function stop()
      if not t then return end
      t, speed = nil, 1
      if ripple then ripple:stop() end
      ripple = nil
      if slowed then
        slowed.time_scale = 1
        local e = cells[slowed.team]
        if e then e:set{ lit = false, progress = false } end
      end
      slowed = nil
      wa.world.set_speed(1)
      if music then music(1) end
    end

    wa.weapons.replace({
      copy_from = "stock.double_turn_time",
      name = "Bullet Time",
      panel_icon = "sprites/bullet_time.png",
      on_fire = function(fire)
        if t or not wa.world.set_speed then
          if not wa.world.set_speed then
            wa.log("bullet time: this WormForge has no wa.world.set_speed")
          end
          if fire.worm:ammo(id) >= 0 then fire.worm:ammo(id, 1) end
          return
        end
        start(fire.worm)
      end,
    })

    local tab_held = false
    local retreating = false
    if tab then
      wa.on.worm_message(function(worm)
        if not worm.turn then return end
        cell(worm)
        local held = wa.world.keys().tab
        local pressed = held and not tab_held
        tab_held = held
        if not pressed or t or retreating then return end
        if wa.world.worm_selecting() then return end
        if worm:ammo(id) == 0 or worm:delay(id) ~= 0 then return end
        worm:ammo(id, -1)
        start(worm)
      end, { msgs = { wa.msg.FRAME_FINISH } })
    end

    wa.on.worm_message(function(worm)
      if not t or not worm.turn then return end
      t = t + 1 / (50 * speed)
      if t >= total then
        stop()
      else
        if not leaving and t > total - ramp then
          leaving = true
          ring(worm)
        end
        apply()
        tooltip.notice(worm, string.format("Bullet Time: %.1f s", total - t), 0.1)
      end
    end, { msgs = { wa.msg.FRAME_FINISH } })

    wa.on.turn_start(function(ev)
      retreating = false
      if t and ev.worm then hand_to(ev.worm) end
    end)
    wa.on.turn_retreat(function() retreating = true end)
    wa.on.turn_end(stop)
    wa.on.turn_cleanup(stop)

    local QUAD = {
      points = { { 0, 0 }, { 0, 0 }, { 0, 0 }, { 0, 0 } },
      sprite = tint, color = 0, blend = "alpha", depth = wa.depth.FRONT - 1,
    }
    wa.on.draw(function()
      if not t then return end
      local k = depth(math.min(t + wa.draw.fraction() / (50 * speed), total))
      local alpha = math.floor(TINT_ALPHA * k + 0.5)
      if alpha <= 0 then return end
      local size = wa.world.size()
      local x0, y0, x1, y1 = -MARGIN, -MARGIN, size.w + MARGIN, size.h + MARGIN
      local p = QUAD.points
      p[1][1], p[1][2] = x0, y0
      p[2][1], p[2][2] = x1, y0
      p[3][1], p[3][2] = x1, y1
      p[4][1], p[4][2] = x0, y1
      QUAD.color = (alpha << 24) | TINT
      wa.draw.quad(QUAD)
    end)
  end,
}
`
      },
      {
        path: 'weapons/cursor.lua',
        name: 'weapons/cursor.lua',
        language: 'lua',
        content: `-- Cursor: Press + to cycle through Light, Magnet attract, Magnet repel, Revive, Freeze, Fire and Hurt.

local cursor = require("lib/cursor")
local tooltip = require("wf-lib/tooltip")
local MODES = {
  { name = "Light", hint = "terrain-blocked light" },
  { name = "Magnet attract", hint = "300 px range" },
  { name = "Magnet repel", hint = "300 px range" },
  { name = "Revive", hint = "click a gravestone" },
  { name = "Freeze", hint = "click a worm" },
  { name = "Fire", hint = "hold left mouse for rainbow fire" },
  { name = "Hurt", hint = "click a worm: 10 HP damage" },
}
local RAINBOW = { 0xFF2A2A, 0xFF8C1A, 0xFFE81A, 0x3CFF4A, 0x2E8CFF, 0x8A3CFF, 0xFF3CD2 }

return {
  defaults = { ammo = { round_start = -1 }, delay = 0 },
  install = function(ctx)
    local field
    local remembered = {} -- Stable worm IDs; each worm keeps its own mode.
    local mode, plus_held = 1, false
    local next_fire, colour, ready_at, waiting_release = 0, 0, 0, true

    local function clear(a)
      if field then field:remove(); field = nil end
      if a then a.light = false end
    end
    local function apply(a)
      clear(a)
      if mode == 1 then
        a.light = {
          mode = "light", circle = 300, cone = { length = 0 },
          shadow_cast = true, seen_by = "owner", discover = false,
        }
      elseif mode == 2 or mode == 3 then
        field = wa.magnetism.field{
          source = a, range = 300, strength = 14000, max_force = 12,
          polarity = mode == 2 and "attract" or "repel",
          softening = mode == 2 and 10 or 5,
        }
      elseif mode == 6 then
        next_fire, ready_at, waiting_release = 0, wa.world.frame() + 3, true
      end
    end

    cursor.install(ctx, {
      name = "Cursor",
      icon = "sprites/cursor.png",
      start = function(a, worm)
        mode = remembered[worm.id] or 1
        plus_held = wa.world.keys().plus_key or false
        apply(a)
      end,
      stop = function(a)
        clear(a)
      end,
      frame = function(a, worm)
        local plus = wa.world.keys().plus_key or false
        if plus and not plus_held then
          mode = mode % #MODES + 1
          remembered[worm.id] = mode
          apply(a)
        end
        plus_held = plus
        if mode ~= 6 then return end
        if not wa.world.pointer().down then
          next_fire, waiting_release = 0, false
          return
        end
        local now = wa.world.frame()
        if waiting_release or now < ready_at or now < next_fire then return end
        next_fire = now + 2 -- 25 flames/second, independent of rendering.
        colour = colour % #RAINBOW + 1
        wa.fire.spawn{
          owner = worm, x = a.x, y = a.y - 6,
          vx = (colour - 4) * 0.25, vy = -1.5,
          count = 0, duration = 4000, up_power = 100,
          damage = 0, tint = RAINBOW[colour],
        }
      end,
      click = function(ev)
        if mode == 4 then
          local grave = cursor.nearest(wa.graves.all(), ev.x, ev.y, function(g)
            return g.worm_id ~= 0
          end)
          if grave then grave:revive(grave.worm_id, 100) end
        elseif mode == 5 then
          local worm = cursor.nearest(wa.worms.all(), ev.x, ev.y, function(w)
            return w.hp > 0
          end)
          if worm then worm:freeze() end
        elseif mode == 7 then
          local worm = cursor.nearest(wa.worms.all(), ev.x, ev.y, function(w)
            return w.hp > 0
          end)
          if worm then worm:hit(10) end
        end
      end,
    })
    tooltip.hint(ctx.id, function(worm)
      local m = MODES[remembered[worm.id] or 1]
      return "Cursor: " .. m.name .. "\\n" .. m.hint .. "\\n+ next mode"
    end)
  end,
}
`
      },
      {
        path: 'weapons/plus_n.lua',
        name: 'weapons/plus_n.lua',
        language: 'lua',
        content: `-- +N Seconds: adds N seconds to the turn of the collecting / activating player

local MAX_MS = 3600000

return {
  defaults = {
    ammo = { round_start = 0 },
    delay = 0,
    crate = { chance_pct = 40, type = "utility" },
    auto_use = true,
    after_use = "continue",
    uses_per_turn = 1,
    extra_pickups = "discard",
    retreat_collect = "activate",
  },
  install = function(ctx)
    local id = ctx.id
    local seconds = ctx.option("seconds")
    local data = ctx.data
    local limit = data.uses_per_turn == "unlimited" and math.huge or (data.uses_per_turn or 1)
    local discard = (data.extra_pickups or "discard") == "discard"
    local retreat_collect = data.retreat_collect or "activate"
    local automatic = data.auto_use ~= false
    local placing = wa.world.placing or function() return false end
    local used, pending, started = {}, nil, false

    local function add_time(worm, count, retreat)
      count = math.min(count, limit - (used[worm.ammo_group] or 0))
      if count <= 0 then return 0 end
      local current = retreat and wa.world.retreat() or wa.world.turn_clock()
      local ms = math.min(current + seconds * count * 1000, MAX_MS)
      if retreat then
        if not wa.world.set_retreat(ms) then return 0 end
      else
        wa.world.set_turn_clock(ms)
      end
      used[worm.ammo_group] = (used[worm.ammo_group] or 0) + count
      return count
    end

    local function activate(worm, count, retreat)
      local held = worm:ammo(id)
      if held == 0 then return 0 end
      if held > 0 then count = math.min(count, held) end
      local added = add_time(worm, count, retreat)
      if added > 0 and held > 0 then worm:ammo(id, -added) end
      return added
    end

    local function discard_pickup(worm, count)
      local held = worm:ammo(id)
      if count > 0 and held > 0 then worm:ammo(id, -math.min(count, held)) end
    end

    local function collect(worm, count, retreat)
      local activated = activate(worm, count, retreat)
      if discard then discard_pickup(worm, count - activated) end
    end

    wa.weapons.replace({
      copy_from = "stock.double_turn_time",
      name = "+N Seconds",
      panel_icon = "sprites/plus_n.png",
      on_fire = function(fire)
        if add_time(fire.worm, 1, wa.world.retreat() > 0) == 0 then
          if fire.worm:ammo(id) >= 0 then fire.worm:ammo(id, 1) end
        end
      end,
    })

    wa.on.turn_cleanup(function()
      used, pending, started = {}, nil, false
    end)
    if not automatic then return end -- Every pickup stays in inventory.

    wa.on.turn_start(function(ev)
      if not started then pending = ev.worm.id end
    end)
    wa.on.worm_message(function(worm)
      if pending == worm.id and worm.turn and not placing() then
        pending, started = nil, true
        local held = worm:ammo(id)
        activate(worm, held > 0 and held or 1, false)
      end
    end, { msgs = { wa.msg.FRAME_FINISH } })
    wa.on.weapon_grant(function(ev)
      local collector
      for _, worm in ipairs(wa.worms.all()) do
        if worm.id == ev.worm_id then collector = worm; break end
      end
      if not collector then return end
      for _, item in ipairs(ev.items) do
        if item.weapon == id and item.amount > 0 and not placing() then
          local retreat = wa.world.retreat() > 0
          if not retreat then
            collect(collector, item.amount, false)
          elseif retreat_collect == "activate" then
            collect(collector, item.amount, true)
          elseif retreat_collect == "discard" then
            discard_pickup(collector, item.amount)
          end
        end
      end
    end)
  end,
}
`
      }
];

export const EXISTING_MODS: ModFolderInfo[] = [
  {
    id: 'px.highlander',
    name: 'Highlander (PX)',
    version: '0.20.86',
    author: 'Project X authors',
    category: 'rules',
    primaryFile: 'components/highlander.lua',
    workspacePrefix: 'px',
    description: 'Modern PX component: hl.rules. The full px.ports bundle loads so the weapon index and scheme modules are visible; this entry opens components/highlander.lua.',
    tags: ['example', 'rules', 'scheme', 'modern'],
    files: PX_FILES,
  },
  {
    id: 'px.ktk',
    name: 'Kill The King (PX)',
    version: '0.20.86',
    author: 'Project X authors',
    category: 'gameplay',
    primaryFile: 'components/kill_the_king.lua',
    workspacePrefix: 'px',
    description: 'Modern PX component: ktk.control. The full px.ports bundle loads so the feature and its dependencies are visible; this entry opens components/kill_the_king.lua.',
    tags: ['example', 'gameplay', 'modern'],
    files: PX_FILES,
  },
  {
    id: 'px.sentry',
    name: 'Sentry Gun (PX)',
    version: '0.20.86',
    author: 'Project X authors',
    category: 'weapons',
    primaryFile: 'weapons/sentry_gun.lua',
    workspacePrefix: 'px',
    description: 'Modern PX component: px.sentry_gun. The full px.ports bundle loads so its require graph is visible; this entry opens weapons/sentry_gun.lua.',
    tags: ['example', 'weapon', 'object', 'modern'],
    files: PX_FILES,
  },
  {
    id: 'spawn.bees',
    name: 'Keeper Bee',
    version: '1.2.1',
    author: 'reddaz',
    category: 'weapons',
    primaryFile: 'weapons/keeper_bee.lua',
    workspacePrefix: 'roaming_bees',
    description: 'Modern component bundle: the Keeper Bee launcher and the map swarm share lib/bee.lua through require. Replaces the old Spawn Bees script.',
    tags: ['example', 'weapon', 'actor', 'modern'],
    files: [
      {
        path: 'features/bee_swarm.lua',
        name: 'features/bee_swarm.lua',
        language: 'lua',
        content: `-- Map bee swarm: seeds the map with rogue bees on the first turn, one per slice.

local bee = require("lib/bee")

return function(ctx)
  bee.install_swarm(ctx)
end
`
      },
      {
        path: 'lib/bee.lua',
        name: 'lib/bee.lua',
        language: 'lua',
        content: `-- Keeper Bee: PX's bee AI, shared by the launcher and the map swarm.

local M = {}

M.DEBUG = false

M.SPRITE = "sprites/bee_flight.png"
M.BODY_MASK = "sprites/bee/bee_mask.png"
M.SOUNDS = {
  "sounds/bzz1.wav",
  "sounds/bzz2.wav",
  "sounds/bzz3.wav",
  "sounds/bzz4.wav",
}
M.HAT = "sprites/gray_hat.png"

M.WORM_SPRITES = {
  weaponlnk = "sprites/aim_p_muitb55w.gif",
  weaponlnku = "sprites/aim_u_muitb55w.gif",
  weaponlnkd = "sprites/aim_d_muitb55w.gif",
  wthrow = "sprites/draw_p_muitb55w.gif",
  wthrowu = "sprites/draw_u_muitb55w.gif",
  wthrowd = "sprites/draw_d_muitb55w.gif",
}

local BEE_SPAWN_QUANTITY  = 4
local BEE_SPAWN_TRIES_PER_SLICE = 250
local SPAWN_TOP_MARGIN_PX = 100 -- don't probe within this far of the map's ceiling
local swarmPlanted        = false

local SENSOR_RADIUS_PX  = 235
local CONTACT_RADIUS_PX = 34
local CHASE_SPEED       = (3.7)
local CHASE_STRENGTH    = 0.14
local CHASE_STEER_EVERY = 1
local ROAM_SPEED        = (0.6)
local ROAM_SPEED_BASE   = 0.12
local ROAM_COOLDOWN_MIN = 10
local ROAM_COOLDOWN_MAX = 32
local ROT_SMOOTH_DEG    = 4
local ROAM_STRENGTH     = 0.10
local ROAM_STEER_EVERY  = 1
local BONK_LIMIT        = 4
local SPIN_FRAMES       = 20
local MAX_HP            = 25
local ROAM_RANGE_X      = 55
local ROAM_RANGE_Y      = 110
local ROAM_ARRIVE_PX    = 20
local BEE_RADIUS_PX     = 4
local CORNER_BUFFER_PX  = 2
local HOMING_MAX_DIST_PX = 440
local HOMING_MAX_DURATION = 150
local ROAM_MAX_DIST_PX   = 410
local LOOKOUT_COOLDOWN_GIVEUP  = 150
local LOOKOUT_COOLDOWN_TIMEOUT = 200

local ROAM_FAIL_THRESHOLD  = 10
local ROAM_FAIL_SCALE      = 0.5
local CLIP_FRAMES_LIMIT    = 6
local UNBURY_MAX_RADIUS_PX = 150 -- how far out the search for a free spot goes

local SPAWN_CLEAR_RADIUS_PX = 7
local SPEED_SCALE = 2.0
local BUMP_LOOKOUT_FRAMES = 45

local ROAM_SLOWDOWN_RADIUS_PX = 60
local ROAM_SLOWDOWN_MIN_FRAC  = 0.35

local BEE_FRAME_COUNT = 4
local BEE_FRAME_HOLD  = 5
local BEE_FRAME_HOLD_MIN = 2

local state = {}

local function log(msg)
  if M.DEBUG then wa.log(msg) end
end

local function deg(rad)
  return rad * (180 / math.pi)
end

local function rand(lo, hi)
  return wa.random(math.floor(lo), math.floor(hi))
end

local function shouldStop(s)
  return s.dead or s.freeMe or s.stopMe
end

local function takeHit(a, s, damage, spin)
  if (damage or 0) <= 0 then return end
  s.hp = s.hp - damage
  if spin ~= false then
    s.spin = true
    s.spinN = (s.spinN or 0) + 8
  end
  if s.hp <= 0 then s.dead = true; log("[BEE] dead: hp<=0 (damage)") end
end

local function playBuzz(target)
  if not target or #M.SOUNDS == 0 then return end
  local snd = M.SOUNDS[rand(1, #M.SOUNDS)]
  wa.sound.play(target, snd)
end

local function isClearOfTerrain(x, y, radiusPx)
  local r = math.max(math.floor(radiusPx or 0), SPAWN_CLEAR_RADIUS_PX)
  local cx, cy = math.floor(x), math.floor(y)
  local r2 = r * r
  for dy = -r, r do
    for dx = -r, r do
      if dx * dx + dy * dy <= r2 and wa.land.solid(cx + dx, cy + dy) then
        return false
      end
    end
  end
  return true
end

local function checkSpawnPoint(obj, x, y, targetX, targetY, maxRadius, clearRadius, strict)
  maxRadius = maxRadius or 50
  clearRadius = clearRadius or (BEE_RADIUS_PX + 1)
  local worm = wa.worms.nearest(obj)
  if obj and obj.kind ~= "worm" then obj = worm end

  local r = 0
  while r <= maxRadius do
    local step = (r == 0) and 360 or math.max(15, math.floor(360 / (r / 2) + 0.5))
    local angdeg = 0
    while angdeg < 360 do
      local rad = angdeg * math.pi / 180
      local tx = x + math.floor(r * wa.math.cos(rad))
      local ty = y + math.floor(r * wa.math.sin(rad))
      local fitsHere = false
      if obj and type(obj.fits) == "function" and obj.kind == "worm" then
        fitsHere = obj:fits(tx, ty)
      else
        fitsHere = true
      end
      if fitsHere then fitsHere = isClearOfTerrain(tx, ty, clearRadius) end
      if fitsHere then
        local hit = wa.land.trace(tx, ty, targetX, targetY)
        if not hit or not hit.hit then
          return tx, ty
        end
      end
      angdeg = angdeg + step
    end
    r = r + 4 -- Step outward cleanly in native units
  end
  if strict then return nil, nil end
  return targetX, targetY
end

local function roomClear(x, y, r)
  if wa.land.solid(x, y) then return false end
  for i = 0, 15 do
    local ang = i * math.pi / 8
    local c, sn = wa.math.cos(ang), wa.math.sin(ang)
    if wa.land.solid(math.floor(x + c * r + 0.5), math.floor(y + sn * r + 0.5)) then return false end
    if i % 2 == 0 and wa.land.solid(math.floor(x + c * r * 0.5 + 0.5), math.floor(y + sn * r * 0.5 + 0.5)) then return false end
  end
  return true
end

local ESCAPE_TRACE_PX = 18
local function hasEscapeRoom(x, y)
  local blockedN = 0
  for i = 0, 7 do
    local ang = i * math.pi / 4
    local hit = wa.land.trace(x, y, math.floor(x + wa.math.cos(ang) * ESCAPE_TRACE_PX + 0.5),
                                    math.floor(y + wa.math.sin(ang) * ESCAPE_TRACE_PX + 0.5))
    if hit and hit.hit then blockedN = blockedN + 1 end
  end
  return blockedN <= 1
end

local function checkSpawnPointNoLOS(worm, x, y, maxRadiusPx, clearRadiusPx)
  maxRadiusPx = maxRadiusPx or 50
  clearRadiusPx = math.max(clearRadiusPx or 0, SPAWN_CLEAR_RADIUS_PX)
  local r = 0
  while r <= maxRadiusPx do
    local step = (r == 0) and 360 or math.max(15, (360 / (r / 2)))
    local angdeg = 0
    while angdeg < 360 do
      local rad = angdeg * math.pi / 180
      local tx = math.floor(x + r * wa.math.cos(rad) + 0.5)
      local ty = math.floor(y + r * wa.math.sin(rad) + 0.5)
      if roomClear(tx, ty, clearRadiusPx)
         and isClearOfTerrain(tx, ty, BEE_RADIUS_PX + 1)
         and hasEscapeRoom(tx, ty)
         and (not worm or worm:fits(tx, ty)) then
        return tx, ty
      end
      angdeg = angdeg + step
    end
    r = r + 3
  end
  return nil, nil
end
local function steer(a, tx, ty, speed, strength)
  speed = speed * SPEED_SCALE
  local dx, dy = tx - a.x, ty - a.y
  local dist = math.sqrt(dx * dx + dy * dy)
  if dist > 0 then dx, dy = dx / dist, dy / dist end
  local wantVx = dx * speed
  local wantVy = dy * speed
  a.vx = a.vx + (wantVx - a.vx) * strength
  a.vy = a.vy + (wantVy - a.vy) * strength
end

local function distPx(a, tx, ty)
  local dx, dy = (tx - a.x), (ty - a.y)
  return math.sqrt(dx * dx + dy * dy)
end

local function isThereLandThere(a, tx, ty)
  local hit = wa.land.trace(a.x, a.y, tx, ty)
  return hit and hit.hit
end

local SENSOR_RADIUS_SQ = SENSOR_RADIUS_PX * SENSOR_RADIUS_PX
local targetFrame = nil
local wormsById = {}

local function closestEnemy(a, s, worms)
  local best, bestDist2
  for i = 1, #worms do
    local w = worms[i]
    if s.rogue or w.team ~= s.team then
      local dx, dy = w.x - a.x, w.y - a.y
      local d2 = dx * dx + dy * dy
      if d2 <= SENSOR_RADIUS_SQ and (not bestDist2 or d2 < bestDist2) then
        if not isThereLandThere(a, w.x, w.y) then
          best, bestDist2 = w, d2
        end
      end
    end
  end
  return best
end

local KNOCKED = {
  blasted = true, tumbling = true,
  jumping = true,
  parachuting = true,
}

local function refreshTargets()
  local frame = wa.world.frame() or 0
  if targetFrame == frame then return end
  targetFrame = frame
 
  local worms = wa.worms.all()
  local candidates = {}
  local targetable = {}
  wormsById = {}
  for i = 1, #worms do
    local w = worms[i]
    wormsById[w.id] = w
    local knocked = KNOCKED[w.state or ""] or false
    local moving = w.vx ~= 0 or w.vy ~= 0 or w.state == "walking" or knocked
    if w.hp > 0 and not w.taken and moving then
      candidates[#candidates + 1] = w
      targetable[w.id] = true
    end
  end

  for _, a in ipairs(wa.actors.all()) do
    local s = state[a.id]
    if s and not s.dead and not s.freeMe and not s.stopMe
        and not s.spin and not s.softSpin then
      if (s.lookoutCooldown or 0) > 0 then
        s.lookoutCooldown = s.lookoutCooldown - 1
      end
      local target = s.targetId and wormsById[s.targetId]
      if target and (target.hp <= 0 or target.taken
          or (not s.rogue and target.team == s.team)) then
        target = nil
        s.targetId = nil
      end
      if not target and (s.lookoutCooldown or 0) <= 0 then
        target = closestEnemy(a, s, candidates)
        s.targetId = target and target.id or nil
      end
    end
  end
end

local function wormById(id)
  if not id then return nil end
  return wormsById[id]
end

local function randomizeSpeed()
  local randspeed = wa.random(1, 7)
  return (ROAM_SPEED_BASE * randspeed)
end

local function tryFindPath(a, s, scale)
  local rangeX = (ROAM_RANGE_X * scale)
  local rangeY = (ROAM_RANGE_Y * scale)

  local fx = rand(-rangeX, rangeX)
  local fy = rand(-rangeY, rangeY)
  local tx, ty = s.startX - fx, s.startY - fy
  
  local waterY = math.floor(wa.world.water())
  if ty > waterY - 14 then ty  = waterY -15 end
  if not isThereLandThere(a, tx, ty) then
    return tx, ty
  end
  return nil, nil
end

local function pickRoamPoint(a, s)
  s.roamFailStreak = s.roamFailStreak or 0
  local shrink = s.roamFailStreak >= ROAM_FAIL_THRESHOLD
  local scale1 = shrink and (1.0 * ROAM_FAIL_SCALE) or 1.0
  local scale2 = shrink and (0.78 * ROAM_FAIL_SCALE) or 0.78

  local tx, ty = tryFindPath(a, s, scale1)
  if tx then
    s.arriveX, s.arriveY = tx, ty
    s.roamSpeed = randomizeSpeed()
    s.roamFailStreak = 0
    return true
  end

  tx, ty = tryFindPath(a, s, scale2)
  if tx then
    s.arriveX, s.arriveY = tx, ty
    s.roamSpeed = randomizeSpeed()
    s.roamFailStreak = 0
    return true
  end

  s.roamFailStreak = s.roamFailStreak + 1
  return false
end

local function letGo(s, vx, vy)
  local st = s.sting
  s.sting = nil
  if st and st.worm and st.worm.taken then
    if st.worm.state == "frozen" then
      st.worm:release(vx or 0, vy or -2.9, { tumble = false})
      st.worm:freeze()
    else
      st.worm:release(vx or 0, vy or -4, { tumble = true})
    end
  end
end

local function detonate(a, s)
  letGo(s, a.vx, a.vy)
  wa.sound.play(a,54)
  a:explode({ damage = s.supercharged and 55 or 40, id = 100 })
  state[a.id] = nil
  a:remove()
end

local STING_MIN    = 39
local STING_FRAMES = STING_MIN + 20
local STING_LIFT_PX = 3.0
local STING_GAP_PX = 18 -- worm above the stinger
local STING_DRIFT_PX = 37 -- total sideways drift, random each sting
local STING_ANGLE = 90 -- head down, tail (the sting) up at the worm

local function startSting(a, s, worm)
  if not worm or worm.hp <= 0 then return false end
  if not worm:take({ turn = "run" }) then return false end
  wa.sound.play(worm,87)
  wa.sound.play(worm,33)
  local facing = a.facing < 0 and -1 or 1
  local angle = STING_ANGLE * facing
  s.sting = {
    worm = worm,
    ticks = 0,
    angle = angle,
    vx = rand(-STING_DRIFT_PX, STING_DRIFT_PX) / STING_FRAMES,
  }
  s.targetId = nil
  s.homingDuration = 0
  s.rot, s.gfxAngle = angle, angle
  a:gfx{ angle = angle }
  a.vx, a.vy = s.sting.vx, -STING_LIFT_PX
  worm:carry(a.x, a.y - STING_GAP_PX)
  return true
end

local STING_RESCUE_PX = 24
local STING_GAPS = { STING_GAP_PX, 12, 6, 0 }

local function stingSpot(a, worm)
  for i = 1, #STING_GAPS do
    local y = a.y - STING_GAPS[i]
    if worm:fits(a.x, y) then return a.x, y end
  end
  return nil, nil
end

local function stingTick(a, s)
  local st = s.sting
  local w = st.worm
  st.ticks = st.ticks + 1

  if not w or not w.taken or w.hp <= 0 or st.ticks >= STING_FRAMES then
    letGo(s, a.vx, a.vy)
    detonate(a, s)
    return
  end
 
  a.vx, a.vy = st.vx, -STING_LIFT_PX
  a:gfx{ angle = st.angle }
  s.gfxAngle = st.angle
 
  local cx, cy = stingSpot(a, w)
  if not cx then
    cx, cy = checkSpawnPointNoLOS(w, a.x, a.y - STING_GAP_PX, STING_RESCUE_PX, 10)
  end
  if not cx or not w:carry(cx, cy) then
    letGo(s, a.vx, a.vy)
    detonate(a, s)
  end
end

local function updateAnim(a, s)
  local speedPx = (math.abs(a.vx) + math.abs(a.vy))
  local hold = math.max(BEE_FRAME_HOLD_MIN, BEE_FRAME_HOLD - (speedPx / 2))
  s.animTick = (s.animTick or 0) + 1
  if s.animTick >= hold then
    s.animTick = 0
    s.sprnum = (s.sprnum % BEE_FRAME_COUNT) + 1
    a:frame(s.sprnum - 1)
  end
end

local function cheapClear(x, y)
  if wa.land.solid(x, y) then return false end
  return not (wa.land.solid(x - 3, y) or wa.land.solid(x + 3, y)
    or wa.land.solid(x, y - 3) or wa.land.solid(x, y + 3))
end

local function findFreeSpot(x, y, maxRadius)
  local r = 0
  while r <= maxRadius do
    local step = (r == 0) and 360 or math.max(15, math.floor(360 / (r / 2) + 0.5))
    local angdeg = 0
    while angdeg < 360 do
      local rad = angdeg * math.pi / 180
      local tx = x + math.floor(r * wa.math.cos(rad))
      local ty = y + math.floor(r * wa.math.sin(rad))
      if cheapClear(tx, ty) and isClearOfTerrain(tx, ty, BEE_RADIUS_PX + 1) then
        return tx, ty
      end
      angdeg = angdeg + step
    end
    r = r + 3
  end
  return nil, nil
end

local function unbury(a, s)
  local tx, ty = findFreeSpot(a.x, a.y, UNBURY_MAX_RADIUS_PX)
  if not tx then tx, ty = s.lastSafeX, s.lastSafeY end
  a.x, a.y = tx, ty
  a.vx, a.vy = 0, 0
  s.clipFrames, s.bonk, s.targetId, s.arriveX = 0, 0, nil, nil 
  s.desiredAngle = 0
  s.roamCooldown = rand(ROAM_COOLDOWN_MIN, ROAM_COOLDOWN_MAX)
  s.lastSafeX, s.lastSafeY = tx, ty
  log("[BEE] unburied to " .. tostring(tx) .. "," .. tostring(ty))
end

local function checkClipping(a, s)
  if s.bonk == 0 and s.clipFrames < 1 and cheapClear(a.x, a.y) then
    s.lastSafeX, s.lastSafeY = a.x, a.y
  end
  if s.bonk > 0 and (s.ticks or 0) % 10 == 0 then
    s.bonk = s.bonk - 1
  end

  if wa.land.solid(a.x, a.y) then
    s.clipFrames = (s.clipFrames or 0) + 1
    if s.clipFrames > CLIP_FRAMES_LIMIT then
      unbury(a, s)
      return
    end
  else
    s.clipFrames = 0
  end
end

local TEAM_COLOUR = {
  [0] = 0xFFFF7066, -- red
  [1] = 0xFF4D6AFF, -- blue
  [2] = 0xFF7CF78C, -- green
  [3] = 0xFFFFF7AB, -- yellow
  [4] = 0xFFAF83E6, -- purple
  [5] = 0xFF47FFFF, -- cyan
}

local HAT_HALF_W, HAT_HALF_H = 20, 16
local HAT_DEPTH = 0x18FFFF
local function hatY(s)
  return (s.sprnum == 1) and -1 or 0
end

local HAT = { blend = "alpha", depth = HAT_DEPTH, points = { {}, {}, {}, {} } }
local hatHooked = false

local HAT_STOP_DIFF = 4
local HAT_REGROW_FRAMES = 130
local HAT_DROP_FRAMES = 110
local hatDrops = {}

local function hatCorner(t, cx, cy, cos, sin, lx, ly)
  t.x = cx + lx * cos - ly * sin
  t.y = cy + lx * sin + ly * cos
end

local function drawHats()
  for _, a in ipairs(wa.actors.all()) do
    local s = state[a.id]
    if s and not s.rogue and (s.hatLost or 0) <= 0 then
      local cx, cy = a.x, a.y + hatY(s)
      local rad = (s.gfxAngle or 0) * (math.pi / 180)
      local cos, sin = wa.math.cos(rad), wa.math.sin(rad)
      local p = HAT.points
      if a.facing < 0 then
        hatCorner(p[1], cx, cy, cos, sin, HAT_HALF_W, -HAT_HALF_H)
        hatCorner(p[2], cx, cy, cos, sin, -HAT_HALF_W, -HAT_HALF_H)
        hatCorner(p[3], cx, cy, cos, sin, -HAT_HALF_W, HAT_HALF_H)
        hatCorner(p[4], cx, cy, cos, sin, HAT_HALF_W, HAT_HALF_H)
      else
        hatCorner(p[1], cx, cy, cos, sin, -HAT_HALF_W, -HAT_HALF_H)
        hatCorner(p[2], cx, cy, cos, sin, HAT_HALF_W, -HAT_HALF_H)
        hatCorner(p[3], cx, cy, cos, sin, HAT_HALF_W, HAT_HALF_H)
        hatCorner(p[4], cx, cy, cos, sin, -HAT_HALF_W, HAT_HALF_H)
      end
      HAT.sprite = M.HAT
      HAT.color = TEAM_COLOUR[s.colour] or 0xFFFFFFFF
      wa.draw.quad(HAT)
    end
  end
end

local function hatDropTick(h)
  local d = hatDrops[h.id]
  if not d then return end
  d.age = d.age + 1
  d.rot = d.rot + d.spin
  h:gfx{ angle = d.rot }
  if d.age >= HAT_DROP_FRAMES or h:in_water() then
    hatDrops[h.id] = nil
    h:remove()
  end
end

local function speedPx(a)
  return math.abs(a.vx) + math.abs(a.vy)
end

local function dropHat(a, s)
  s.hatLost = HAT_REGROW_FRAMES
  local h = wa.actors.spawn({
    sprite = M.HAT,
    x = a.x,
    y = a.y + hatY(s),
    vx = a.vx * 0.4 + rand(-2, 2),
    vy = a.vy * 0.4 - rand(2, 4),
    origin = "center",
    owner = s.owner,
    body = { shape = M.HAT, hits = { land = true }, hit_by = {} },
    gravity = 1,
    drown = true,
    on = { frame = hatDropTick },
  })
  if not h then return end
  h:gfx{ angle = s.gfxAngle or 0 }
  h.facing = a.facing
  h:gfx{ depth = HAT_DEPTH }
  local colour = TEAM_COLOUR[s.colour]
  if colour then h:gfx{ tint = colour & 0x00FFFFFF } end
  hatDrops[h.id] = {
    rot = s.gfxAngle or 0,
    spin = rand(5, 9) * (a.facing < 0 and -1 or 1),
    age = 0,
  }
end

local function updateHat(a, s)
  if (s.hatLost or 0) > 0 then s.hatLost = s.hatLost - 1 end
  local speed = speedPx(a)
  if not s.rogue and not s.dead and not s.spin and not s.softSpin
      and (s.hatLost or 0) <= 0 and s.wasChasing
      and speed < (s.lastSpeed or speed) - HAT_STOP_DIFF then
    dropHat(a, s)
  end
  s.lastSpeed = speed
  s.wasChasing = s.targetId ~= nil
end

local function installHat()
  if hatHooked then return end
  if not (wa.on and wa.on.draw and wa.draw and wa.draw.quad) then
    wa.log("Keeper Bee: this build has no wa.on.draw/wa.draw.quad")
    return
  end
  hatHooked = true
  wa.on.draw(drawHats)
end

local function brain(a, ev)
  local s = state[a.id]
  if not s then return end
  ev = ev or {}

  if s.freeMe then
    letGo(s, 0, 0)
    state[a.id] = nil
    a:remove()
    return
  end

  if s.dead and not s.spin and not s.softSpin then
    if s.sting then letGo(s, 0, 0) end
    s.spin = true
    s.spinN = 0
  end

  updateHat(a, s)

  if a:in_water() then
    a.vx = 0 a.vy = 1.5 s.desiredAngle = math.PI / 4
    if s.sting then letGo(s, 0, 0) end
    dropHat(a, s)
    updateAnim(a, s)
    return
  end

  checkClipping(a, s)
  refreshTargets()

  if s.sting then
    stingTick(a, s)
    return
  end

  if s.spin or s.softSpin then
    if s.spinN == 0 then playBuzz(a) end
    s.rot = (s.rot + (s.dead and 9 or 7)) % 360
    a:gfx{ angle = s.rot }
    s.gfxAngle = s.rot
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

  updateAnim(a, s)

  if a.vx ~= 0 then
    a.facing = a.vx > 0 and 1 or -1
  end

  local target = wormById(s.targetId)

  if target and (target.hp <= 0 or target.taken
      or (not s.rogue and target.team == s.team)) then
    target = nil
    s.targetId = nil
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
      if startSting(a, s, target) then return end
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
    s.gfxAngle = -s.rot
  else
    s.gfxAngle = s.rot
  end
  a:gfx{ angle = s.gfxAngle }
end

local function hurt(a, ev)
  local s = state[a.id]
  if not s then return end
  ev = ev or {}
  takeHit(a, s, ev.damage, ev.kind ~= "blast")
  a.vx = a.vx + (ev.vx or 0) * 1.5
  a.vy = a.vy + (ev.vy or 0) * 1.5
end

local function isEnemyWorm(s, other)
  if type(other) ~= "userdata" then return false end
  if other.kind ~= "worm" then return false end
  if not other.hp or other.hp <= 0 then return false end
  return s.rogue or other.team ~= s.team
end

local function onContact(a, ev)
  local s = state[a.id]
  if not s or s.dead or s.sting then return end
  local other = ev and ev.other
  if isEnemyWorm(s, other) then
    if not s.spin and not s.softSpin and startSting(a, s, other) then
      log("[BEE] sting: enemy worm contact id=" .. tostring(a.id))
    else
      log("[BEE] detonate: enemy worm contact id=" .. tostring(a.id))
      detonate(a, s)
    end
  end
end

local function bump(a, ev)
  local s = state[a.id]
  if not s or s.dead then return end
  s.bonk = s.bonk + 1
  local limit = BONK_LIMIT
  if s.bonk > limit then
    s.spin, s.bonk = false, 0
    s.arriveX = nil -- a fresh roam point on the next frame
  end
end

function M.spawn_actor(opts)
  opts = opts or {}
  local owner = opts.owner or (wa.worms.all and wa.worms.all()[1])

  log("[ACTOR SPAWN] Attempting spawn at X=" .. tostring(opts.x) .. " Y=" .. tostring(opts.y))
  if not owner then return nil end
  local body = wa.actors.spawn({
    sprite  = opts.sprite or M.SPRITE,
    x       = opts.x,
    y       = opts.y,
    vx      = rand(-4, 4) * SPEED_SCALE,
    vy      = rand(-6, -3) * SPEED_SCALE,
    origin  = opts.origin or "center",
    owner   = owner,
    persist = opts.persist ~= false,
    body    = { shape = M.BODY_MASK, hits = { land = true, worms = true },
                hit_by = { fire = true, blasts = true } },
    on      = { frame = opts.brain or brain, hit = hurt, touched = onContact, contact = bump },
  })

  if body then
    log("[ACTOR SPAWN] Successfully spawned actor ID=" .. tostring(body.id) ..
        " (Rogue=" .. tostring(opts.rogue or false) .. ")")
    state[body.id] = {
      rogue           = opts.rogue or false,
      team            = opts.team or (owner and owner.team) or -1,
      colour          = opts.colour
        or (owner and owner.kind == "worm" and owner.alliance) or nil,
      owner           = owner,
      hp              = opts.hp or MAX_HP,
      dead            = false,
      freeMe          = false,
      stopMe          = false,
      spin            = false,
      softSpin        = false,
      spinN           = -10,
      bonk            = 0,
      bonkhome        = 0, -- set by the original, read by nothing
      rot             = 0,
      gfxAngle        = 0, -- last angle handed to \`a:angle\`, for the hat
      hatLost         = 0, -- frames until the hat grows back
      lastSpeed       = 0,
      wasChasing      = false,
      supercharged    = false,
      startX          = opts.x,
      startY          = opts.y,
      arriveX         = opts.x,
      arriveY         = opts.y,
      lastSafeX       = opts.x,
      lastSafeY       = opts.y,
      roamCooldown    = 0,
      roamSpeed       = nil,
      desiredAngle    = 0,
      targetId        = nil,
      sprnum          = 1,
      animTick        = 0,
      roamFailStreak  = 0,
      clipFrames      = 0,
      homingDuration  = 0,
      lookoutCooldown = 0,
      ambientBuzzCD   = rand(30, 60), -- set by the original, read by nothing
    }
  else
    log("[ACTOR SPAWN ERROR] wa.actors.spawn returned nil!")
  end
  return body
end

function M.spawn_map_bees(quantity, ownerWorm)
  quantity = math.max(1, math.floor(quantity or BEE_SPAWN_QUANTITY))
  if not ownerWorm then
    wa.log("[BEE SPAWN] no worm to seed from")
    return 0
  end

  local size = wa.world.size()
  local levelSX = math.floor(size.w)
  local waterY = math.floor(wa.world.water())
  if waterY <= 0 then waterY = math.floor(size.h) end
  local sliceWidth = math.floor(levelSX / quantity)
  local planted = 0

  log("[BEE SPAWN] Starting slice spawner. Quantity=" .. tostring(quantity) ..
      " MapWidth=" .. tostring(levelSX) .. " WaterY=" .. tostring(waterY) ..
      " SliceWidth=" .. tostring(sliceWidth))

  for currentSlice = 0, quantity - 1 do
    local sliceAttempts = 0
    local spawnedInSlice = false

    local sliceStart = currentSlice * sliceWidth
    local sliceEnd = sliceStart + sliceWidth

    if sliceStart < 30 then sliceStart = 30 end
    if sliceEnd > levelSX - (30) then sliceEnd = levelSX - (30) end
    if sliceEnd < sliceStart then sliceEnd = sliceStart end

    while sliceAttempts < BEE_SPAWN_TRIES_PER_SLICE and not spawnedInSlice do
      sliceAttempts = sliceAttempts + 1

      local tryX = rand(sliceStart, sliceEnd)
      local tryY = rand(SPAWN_TOP_MARGIN_PX, math.max(SPAWN_TOP_MARGIN_PX + 1, (waterY) - 100))
      local traceEndY = waterY - (90)

      local hit = wa.land.trace(tryX, tryY, tryX, traceEndY)

      if hit and hit.hit and isClearOfTerrain(hit.x, hit.y - 8, 4) and ownerWorm:fits(hit.x, hit.y - 8) then
        local spawnX = hit.x
        local spawnY = hit.y - 8

        spawnX, spawnY = checkSpawnPointNoLOS(ownerWorm, spawnX, spawnY, 130, 14)
        if spawnX ~= nil then
          M.spawn_actor({
            x     = spawnX,
            y     = spawnY,
            owner = ownerWorm,
            rogue = true,
          })
          spawnedInSlice = true
          planted = planted + 1
          log("[BEE SPAWN] Slice #" .. tostring(currentSlice) .. " SUCCESS on attempt #" .. tostring(sliceAttempts))
        end
      end
    end

    if not spawnedInSlice then
      log("[BEE SPAWN] Slice #" .. tostring(currentSlice) .. " FAILED to find valid terrain clearance!")
    end
  end

  wa.log(("[BEE SPAWN] %d/%d map bees placed"):format(planted, quantity))
  return planted
end

M.spawnRandomBees = M.spawn_map_bees

function M.install_weapon(ctx)
  wa.assets.load({ sprites = { M.HAT }, gpu_prefix = "sprites/" })
  installHat()
  wa.weapons.replace({
    name      = "Keeper Bee",
    copy_from = "stock.bazooka",
    panel_icon = "sprites/beeico.png",
    is_weapon = true,
    sprites   = { M.SPRITE },
    worm_sprites = M.WORM_SPRITES,
    params    = { gpu_prefix = "sprites/" },
    sounds    = M.SOUNDS,
    on_fire = function(fire)
      local worm = fire.worm
      playBuzz(worm)

      local sx, sy = checkSpawnPoint(worm, fire.x, fire.y, worm.x, worm.y, 95, 14, true)
      if not sx then
        sx, sy = worm.x, worm.y - 5
      end

      M.spawn_actor({
        x     = sx,
        y     = sy,
        owner = worm,
        rogue = false,
      })
    end,
  })
end

function M.install_swarm(ctx)
  wa.assets.load({ sprites = { M.SPRITE, M.HAT }, sounds = M.SOUNDS,
                   gpu_prefix = "sprites/" })
  installHat()

  local on = ctx.option("spawn_map_bees")
  local amount = ctx.option("bee_amount")
  wa.log(("Keeper Bee swarm: %s, %d bees"):format(on and "on" or "off", amount))
  if not on then return end

  wa.on.turn_start(function(ev)
    if swarmPlanted then return end
    if M.spawn_map_bees(amount, ev.worm) > 0 then swarmPlanted = true end
  end)
end

return M
`
      },
      {
        path: 'weapons/keeper_bee.lua',
        name: 'weapons/keeper_bee.lua',
        language: 'lua',
        content: `-- Keeper Bee: fires a bee that hunts the worm whose turn it is, stings it, lifts it and bursts.

local bee = require("lib/bee")

return {
  defaults = {
    ammo = { round_start = -1 },
    delay = 0,
  },
  install = function(ctx)
    bee.install_weapon(ctx)
  end,
}
`
      }
    ],
  },
  {
    id: 'example.pooz',
    name: 'POOZ',
    version: '0.2.1',
    author: 'wkLua',
    category: 'weapons',
    primaryFile: 'weapons.lua',
    workspacePrefix: 'pooz',
    description: 'Modern component bundle: selecting POOZ turns the worm into a controllable runner and drops it back out on a weapon switch.',
    tags: ['example', 'weapon', 'actor', 'modern'],
    files: [
      {
        path: 'weapons.lua',
        name: 'weapons.lua',
        language: 'lua',
        content: `-- Shotgun is only the panel slot.

return {
  install = function()
    local HW = 6
    local BOX_H = 16
    local RUN = 1.5749969482421875
    local SPRINT = 2.274993896484375
    local AIR = 0.05999755859375
    local FRICTION = 0.024993896484375
    local SKID = 0.1100006103515625
    local ACCEL = 0.089996337890625
    local GRAV = 0.239990234375
    local MAX_FALL = 6.1999969482421875
    local JUMP = -5.5500030517578125
    local JUMP2 = -6.399993896484375
    local COYOTE = 6
    local JUMP_BUF = 7
    local SLOPE = 12
    local LAND_VY = 1.399993896484375

    local live = {}

    local function abs(v)
      if v < 0 then
        return -v
      end
      return v
    end

    local function sign(v)
      if v > 0 then
        return 1
      end
      if v < 0 then
        return -1
      end
      return 0
    end

    local function approach(v, target, rate)
      if v < target then
        v = v + rate
        if v > target then
          return target
        end
        return v
      end
      v = v - rate
      if v < target then
        return target
      end
      return v
    end

    local function friction(v, amount)
      if abs(v) <= amount then
        return 0
      end
      return v - sign(v) * amount
    end

    local function blocked(x, y)
      local l = x - HW
      local r = x + HW - 1
      local mid = y - BOX_H // 2
      local top = y - BOX_H
      return wa.land.solid(l, y)
        or wa.land.solid(r, y)
        or wa.land.solid(x, y)
        or wa.land.solid(l, mid)
        or wa.land.solid(r, mid)
        or wa.land.solid(l, top)
        or wa.land.solid(r, top)
        or wa.land.solid(x, top)
    end

    local function on_floor(x, y)
      local l = x - 2
      local r = x + 2
      return wa.land.solid(x, y + 1)
        or wa.land.solid(l, y + 1)
        or wa.land.solid(r, y + 1)
    end

    local function unstick(x, y)
      if not blocked(x, y) then
        return x, y
      end
      for up = 1, SLOPE do
        if not blocked(x, y - up) then
          return x, y - up
        end
      end
      return x, y
    end

    local function snap_floor(x, y)
      if blocked(x, y) then
        return x, y, false
      end
      for d = 0, SLOPE do
        local ny = y + d
        if d > 0 and blocked(x, ny) then
          return x, ny - 1, true
        end
        if on_floor(x, ny) then
          return x, ny, true
        end
      end
      return x, y, false
    end

    local function set_clip(a, st, name)
      if st.anim ~= name then
        st.anim = name
        st.clock = 0
        a:look("sprites/" .. name)
        st.frame = name == "FrontFlip" and 13 or 0
        a:frame(st.frame)
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
      st.frame = st.frame + 1
      a:frame(st.frame)
    end

    local function restore(worm, a)
      live[worm.id] = nil
      if a then
        worm.x = a.x
        worm.y = a.y
      end
      worm.visible = true
      worm:release(0, 0)
    end

    local function brain(worm)
      local st = {
        anim = "Idle",
        clock = 0,
        jumps = 2,
        coyote = 0,
        jump_buf = 0,
        prev_jump = false,
        flipping = false,
        flip_clock = 0,
        land = 0,
        gait = 0,
        grounded = true,
      }
      return function(a)
        if worm.weapon ~= "pooz.runner" or a:in_water() then
          restore(worm, a)
          a:remove()
          return
        end

        local k = wa.world.keys()
        if k.jump and not st.prev_jump then
          st.jump_buf = JUMP_BUF
        elseif st.jump_buf > 0 then
          st.jump_buf = st.jump_buf - 1
        end
        st.prev_jump = k.jump

        local left = k.left and not k.right
        local right = k.right and not k.left
        local vx = a.vx
        local vy = a.vy
        local x = a.x
        local y = a.y

        if st.grounded and vy >= 0 then
          st.coyote = COYOTE
          st.jumps = 2
          st.flipping = false
        elseif st.coyote > 0 then
          st.coyote = st.coyote - 1
        end

        if st.jump_buf > 0 and st.jumps > 0 then
          if st.jumps >= 2 then
            vy = JUMP
            st.grounded = false
            st.coyote = 0
            st.jump_buf = 0
            st.jumps = st.jumps - 1
            st.land = 0
            st.flipping = false
            set_clip(a, st, "JumpRise")
          elseif not st.grounded then
            vy = JUMP2
            st.grounded = false
            st.coyote = 0
            st.jump_buf = 0
            st.jumps = st.jumps - 1
            st.land = 0
            st.flipping = true
            st.flip_clock = 0
            set_clip(a, st, "FrontFlip")
          end
        end

        if left or right then
          local dir = right and 1 or -1
          a.facing = dir
          if st.grounded then
            local cap = k.shift and SPRINT or RUN
            if vx == 0 or sign(vx) == dir then
              if abs(vx) < cap then
                vx = approach(vx, dir * cap, ACCEL)
              else
                vx = friction(vx, 0.029998779296875)
              end
            else
              vx = friction(vx, SKID)
            end
          else
            local cap = RUN
            if abs(vx) > cap then
              cap = abs(vx)
            end
            local nxt = vx + dir * AIR
            if abs(nxt) <= cap or sign(nxt) ~= sign(vx) then
              vx = nxt
            end
          end
        elseif st.grounded then
          vx = friction(vx, FRICTION)
        end

        local was = st.grounded
        local fall = vy
        x, y = unstick(x, y)
        local glued = st.grounded or st.coyote > 0
        if glued and vy >= 0 then
          local ok
          x, y, ok = snap_floor(x, y)
          if ok then
            vy = 0
            st.grounded = true
          end
        end
        if st.grounded and vy >= 0 and on_floor(x, y) then
          vy = 0
        else
          vy = vy + GRAV
          if vy > MAX_FALL then
            vy = MAX_FALL
          end
        end

        st.grounded = false
        local dist = abs(vx)
        local steps = dist // 1
        if steps < 1 then
          steps = 1
        end
        local sx = vx / steps
        for _ = 1, steps do
          local nx = x + sx
          if not blocked(nx, y) then
            x = nx
          else
            local stepped = false
            for up = 1, SLOPE do
              if not blocked(nx, y - up) then
                x = nx
                y = y - up
                stepped = true
                break
              end
            end
            if not stepped then
              vx = 0
              break
            end
          end
        end

        if vy >= 0 and (was or st.coyote > 0) then
          local ok
          x, y, ok = snap_floor(x, y)
          if ok then
            vy = 0
            st.grounded = true
          end
        end

        if not st.grounded then
          dist = abs(vy)
          steps = dist // 1
          if steps < 1 then
            steps = 1
          end
          local sy = vy / steps
          for _ = 1, steps do
            local ny = y + sy
            if not blocked(x, ny) then
              y = ny
            elseif sy > 0 then
              vy = 0
              st.grounded = true
              break
            else
              vy = 0
              break
            end
          end
          if not st.grounded and vy >= 0 then
            local ok
            x, y, ok = snap_floor(x, y)
            if ok then
              vy = 0
              st.grounded = true
            else
              st.grounded = on_floor(x, y)
            end
          end
        end

        if st.grounded and not was and fall > LAND_VY then
          st.land = 16
        end
        if st.land > 0 then
          st.land = st.land - 1
        end

        a.x = x
        a.y = y
        a.vx = vx
        a.vy = vy
        worm:carry(x, y)

        local moving = abs(vx) > 0.350006103515625
        if not st.grounded then
          st.gait = 0
          if st.flipping or st.anim == "FrontFlip" then
            set_clip(a, st, "FrontFlip")
            st.flip_clock = st.flip_clock + 1
            if vy > 0 and st.flip_clock >= 24 then
              st.flipping = false
              set_clip(a, st, "JumpFall")
            end
          elseif vy < -0.8000030517578125 then
            set_clip(a, st, "JumpRise")
          elseif vy > 0.8000030517578125 then
            set_clip(a, st, "JumpFall")
          else
            set_clip(a, st, "JumpMid")
          end
        elseif st.land > 0 then
          st.gait = 0
          set_clip(a, st, "Land")
        elseif moving then
          local spd = abs(vx)
          if k.shift then
            st.gait = 32
            if spd > SPRINT - 0.350006103515625 then
              set_clip(a, st, "Sprint")
            else
              set_clip(a, st, "Run")
            end
          else
            st.gait = st.gait + 1
            if st.gait < 40 then
              set_clip(a, st, "Walk")
            else
              set_clip(a, st, "Run")
            end
          end
        else
          st.gait = 0
          set_clip(a, st, "Idle")
        end
      end
    end

    wa.weapons.replace({
      copy_from = "stock.shotgun",
      name = "POOZ",
      sprites = {
        "sprites/Idle",
        "sprites/Run",
        "sprites/Walk",
        "sprites/Sprint",
        "sprites/JumpRise",
        "sprites/JumpMid",
        "sprites/JumpFall",
        "sprites/FrontFlip",
        "sprites/Land",
      },
      on_select = function(sel)
        local worm = sel.worm
        if live[worm.id] then
          return
        end
        live[worm.id] = true
        worm.visible = false
        worm:take{ turn = "freeze" }
        wa.actors.spawn({
          sprite = "sprites/Idle",
          origin = "bottom",
          x = worm.x,
          y = worm.y,
          vx = 0,
          vy = 0,
          owner = worm,
          on = brain(worm),
        })
      end,
    })
  end,
}
`
      }
    ],
  },
  {
    id: 'example.ripper_star',
    name: 'Ripper Star',
    version: '1.3.7',
    author: 'reddaz',
    category: 'weapons',
    primaryFile: 'weapons/ripper_star.lua',
    workspacePrefix: 'ripper_star',
    description: 'A missile example from px_fire_seq: fifteen shurikens on the worm\'s live aim, with require("lib/fire_seq") and require("wf-lib/effects/trail") visible.',
    tags: ['example', 'weapon', 'missile', 'require', 'modern'],
    files: [
      {
        path: 'lib/fire_seq.lua',
        name: 'lib/fire_seq.lua',
        language: 'lua',
        content: `-- fire_seq.lua: the sequential-firing base.

local M = {}

local CONTROL = {
  count = true, delay = true, spread = true, on_shot = true, on_done = true,
  standoff = true, cancel_weapon = true,
}

local function is_control(k) return CONTROL[k] == true end

local function shot_spec(t)
  local out = {}
  for k, v in next, t do
    if not is_control(k) then out[k] = v end
  end
  return out
end

local function value(v, i, w, fallback)
  if type(v) == "function" then return v(i, w) end
  if v == nil then return fallback end
  return v
end

local function jitter(amount)
  if not amount or amount <= 0 then return 0 end
  local n = math.floor(amount * 1000 + 0.5)
  if n < 1 then return 0 end
  return wa.random(-n, n) / 1000
end

local function resolve(spec, t, i, w)
  spec.vx = value(t.vx, i, w, 0)
  spec.vy = value(t.vy, i, w, 0)
  local spread = t.spread
  if spread then
    spec.vx = spec.vx + jitter(spread.x)
    spec.vy = spec.vy + jitter(spread.y)
  end
  spec.x = value(t.x, i, w, w and w.x or 0)
  spec.y = value(t.y, i, w, w and w.y or 0)
  local so = t.standoff
  if so and so > 0 then
    local d = math.sqrt(spec.vx * spec.vx + spec.vy * spec.vy)
    if d > 0 then
      spec.x = spec.x + (spec.vx / d) * so
      spec.y = spec.y + (spec.vy / d) * so
    end
  end
  return spec
end

local running = {}
local settled = {}
local cancelled = {}

M.shot_at = {} -- worm id -> frame of its last shot, for px_hold_art's \`shots\`

local DRAIN = 10

-- A worm in any of these isn't firing (WA's names, \`worm.state\`).
local NOT_FIRING = {
  standing = true, walking = true, punching = true, drilling = true,
  teleporting = true, rope_firing = true, torching = true, after_rope = true,
  getting_up = true, jump_prepare = true, jetpacking = true, jumping = true,
  jump_falling = true, roping = true, bungee = true, parachuting = true,
  falling = true, tumbling = true, hit = true, blasted = true, dying = true,
  drowning = true, frozen = true, dead = true,
}

local function run(owner, count, delay, fire, weapon, on_done)
  if not owner or count < 1 then return nil end

  local id = owner.id
  if id ~= nil and running[id] then return nil end

  local function alive()
    return owner.hp and owner.hp > 0
  end

  if not alive() then return nil end

  local function end_fire()
    if owner.shots_to_fire then owner.shots_fired = owner.shots_to_fire end
  end
  local function hold()
    owner.shots_fired, owner.shots_to_fire = 0, 1
  end
  local function release()
    if id ~= nil then
      running[id] = nil
      settled[id] = nil
      cancelled[id] = nil
    end
  end
  -- Never cleared: px_hold_art ignores a mark older than two frames.
  local function mark()
    if id ~= nil then M.shot_at[id] = wa.world.frame() end
  end
  local left = count - 1
  local function settle()
    if id ~= nil then settled[id] = true end
    end_fire()
    if on_done then on_done(owner, count - left) end
    release()
  end
  local function frame_delay(i)
    return math.max(1, math.floor(value(delay, i, owner, 1)))
  end
  local function interrupted()
    return cancelled[id] == true
      or not alive() or not owner.turn
      or weapon == nil
      or (weapon ~= nil and owner.weapon ~= weapon)
      or NOT_FIRING[owner.state] == true
  end

  if id ~= nil then running[id] = true end
  mark()
  fire(1)
  if count == 1 then
    release()
    return nil
  end

  local wait = frame_delay(2)
  local drain = 0
  local ticker
  ticker = wa.actors.spawn({
    sprite = false, x = owner.x, y = owner.y,
    persist = true, owner = owner,
    on = function(a)
      a.vx, a.vy = 0, 0
      if drain > 0 then
        drain = drain - 1
        if drain <= 0 then
          release()
          a:remove()
        end
        return
      end
      if interrupted() then
        settle()
        a:remove()
        return
      end
      wait = wait - 1
      if wait > 0 then hold() return end
      if left > 0 then
        left = left - 1
        local n = count - left
        mark()
        fire(n)
        if cancelled[id] then
          settle()
          a:remove()
          return
        end
        if left > 0 then
          wait = frame_delay(n + 1)
          hold()
        else
          if id ~= nil then settled[id] = true end
          end_fire()
          if on_done then on_done(owner, count) end
          drain = DRAIN
        end
      end
    end,
  })
  return ticker
end

function M.cancel(owner)
  local id = owner and owner.id
  if id == nil or not running[id] then return false end
  cancelled[id] = true
  if owner.shots_to_fire then owner.shots_fired = owner.shots_to_fire end
  return settled[id] ~= true
end

function M.fire_sequential_actor(opts)
  if type(opts) ~= "table" then return nil end
  local count = opts.count or 1
  local delay = opts.delay or 1
  local owner = opts.owner
  if type(owner) ~= "table" and type(owner) ~= "userdata" then
    wa.log("fire_sequential_actor: owner must be the firing worm")
  end
  local on_shot = opts.on_shot
  local function fire(i)
    if on_shot then on_shot(i, owner) end
    local spec = resolve(shot_spec(opts), opts, i, owner)
    if spec.owner == nil then spec.owner = owner end
    wa.actors.spawn(spec)
  end
  return run(owner, count, delay, fire, opts.cancel_weapon, opts.on_done)
end

function M.fire_seq_mis(params)
  if type(params) ~= "table" or not params.weapon then
    wa.log("fire_seq_mis: params.weapon is required")
    return nil
  end
  local count = params.count or 1
  local delay = params.delay or 1
  local owner = params.owner
  local on_shot = params.on_shot
  local failed = false
  local function fire(i)
    if on_shot then on_shot(i, owner) end
    local spec = resolve(shot_spec(params), params, i, owner)
    if spec.owner == nil then spec.owner = owner end
    local ok, err = pcall(wa.weapons.launch, spec)
    if not ok and not failed then
      failed = true
      wa.log("fire_seq_mis: launch failed: " .. tostring(err))
    end
  end
  return run(owner, count, delay, fire, params.cancel_weapon or params.weapon,
    params.on_done)
end

return M
`
      },
      {
        path: 'lib/px_hold_art.lua',
        name: 'lib/px_hold_art.lua',
        language: 'lua',
        content: `-- Draw a held weapon during WA's repeated-fire frames (firing, fired).

local M = {}

local FIRING = { firing = true, fired = true }

-- the engine's front band for held art
local DEPTH = 0x10000

local HAND_CELL = 60 -- pixels, the engine's hand cells

local draws = {}
local hooked = false

local QUAD = { depth = DEPTH, points = { {}, {}, {}, {} } }

local FLASH_FRAMES = 2 -- game frames a firing sheet shows after a shot
local shot_at = {} -- worm id -> frame of its last shot
local drawn_at = {} -- worm id -> frame its firing art was last drawn on

local function firing_now(art, w, now)
  -- \`shots\` comes from the weapon: a require here could be another instance.
  local f = shot_at[w.id]
  local g = art.shots and art.shots[w.id]
  if g and (not f or g > f) then f = g end
  if not f then return false end
  local seen = drawn_at[w.id]
  return now - f < FLASH_FRAMES or seen == nil or seen < f -- a skipped draw still flashes
end

-- Mark a shot for a weapon that fires without fire_seq.
function M.shot(w)
  if w and w.id then shot_at[w.id] = wa.world.frame() end
end

-- Radians, clockwise, y down.
local function corner(t, cx, cy, cos, sin, lx, ly)
  t.x = cx + lx * cos - ly * sin
  t.y = cy + lx * sin + ly * cos
end

local function quad(sheet, cx, cy, angle, half, facing, frame)
  local cos, sin = wa.math.cos(angle), wa.math.sin(angle)
  local pts = QUAD.points
  if facing < 0 then
    corner(pts[1], cx, cy, cos, sin, half, -half) -- texture top-left on the right
    corner(pts[2], cx, cy, cos, sin, -half, -half)
    corner(pts[3], cx, cy, cos, sin, -half, half)
    corner(pts[4], cx, cy, cos, sin, half, half)
  else
    corner(pts[1], cx, cy, cos, sin, -half, -half)
    corner(pts[2], cx, cy, cos, sin, half, -half)
    corner(pts[3], cx, cy, cos, sin, half, half)
    corner(pts[4], cx, cy, cos, sin, -half, half)
  end
  QUAD.sprite = sheet
  QUAD.frame = frame or 0
  wa.draw.quad(QUAD)
end

-- The engine's hold phase, anim_speed * 0.03 per frame, on the world clock.
local function gun_frame(art)
  local frames = art.frames or 1
  if frames <= 1 then return 0 end
  local now = wa.world.frame() or 0
  local phase = now * (art.anim_speed or 1) * 0.03
  return math.floor((phase % 1) * frames) % frames
end

local function enqueue(art, w)
  local pi = math.pi
  local facing = w.facing < 0 and -1 or 1
  local aim = w.aim

  local rot = (1.0 - aim) * pi
  local rot_w = rot + pi * art.weap_radial_rotation
  local cx = w.x + facing * wa.math.sin(rot_w) * art.weap_radius
  local cy = w.y - wa.math.cos(rot_w) * art.weap_radius
  local angle = (pi - pi * aim - pi * (1.0 - art.weap_rotation)) * facing
  quad(art.sheet, cx, cy, angle, art.size * 0.5, facing, gun_frame(art))

  -- The hand goes on after the gun so it covers the grip.
  if art.hand and art.draw_hand ~= false then
    local hand_radius = art.hand_radius or 0
    if hand_radius ~= 0 then
      local rot_h = rot - pi * (art.hand_radial_rotation or 1)
      local hx = w.x + facing * wa.math.sin(rot_h) * hand_radius
      local hy = w.y - wa.math.cos(rot_h) * hand_radius
      local hand_angle = (rot + pi * (art.hand_rotation or 1)) * facing
      local size = (art.hand_size or HAND_CELL) * (art.hand_scale or 1)
      quad(art.hand, hx, hy, hand_angle, size * 0.5, facing, 0)
    end
  end
end

local function hook()
  hooked = true
  wa.on.draw(function()
    local now = wa.world.frame() or 0
    local worms = wa.worms.all()
    for j = 1, #worms do
      local w = worms[j]
      local st = w.state
      if st and FIRING[st] and w.hp and w.hp > 0 and w.visible and w.body_visible then
        local weapon = w.weapon
        if weapon ~= nil then
          -- A \`flash\` entry is PX's OnFiringAnim(isFiring) sheet.
          for i = 1, #draws do
            local art = draws[i]
            if art.weapon == weapon and (not art.flash or firing_now(art, w, now)) then
              enqueue(art, w)
            end
          end
          drawn_at[w.id] = now
        end
      end
    end
  end)
end

-- \`art\` is the weapon's \`spec.hold\` table; README.md lists the extra keys.
function M.add(art)
  if type(art) ~= "table" or not art.sheet or not art.weapon then
    wa.log("px_hold_art: a hold needs a sheet and a weapon id")
    return
  end
  if not (wa.on and wa.on.draw and wa.draw and wa.draw.quad) then
    wa.log("px_hold_art: this build has no wa.on.draw/wa.draw.quad")
    return
  end
  art.size = art.size or 90.0
  art.weap_radius = art.weap_radius or 0.0
  art.weap_rotation = art.weap_rotation or 1.0
  art.weap_radial_rotation = art.weap_radial_rotation or 1.0
  draws[#draws + 1] = art
  if not hooked then hook() end
end

return M
`
      },
      {
        path: 'lib/px_sprite_builder.lua',
        name: 'lib/px_sprite_builder.lua',
        language: 'lua',
        content: `-- PX's sprite builder: missiles drawn by a follower actor, and PX's aim posture and hands.

local M = {}

local ANIM_TYPE = {
  track = 2,
  rotation = 3,
  slow = 1,
  medium = 1,
  fast = 1,
  none = 5,
}
local ANIM_SPEED = { slow = 0.5, medium = 0.8, fast = 1.35 }

local function current_worm()
  for _, w in ipairs(wa.worms.all()) do
    if w.turn then return w end
  end
end

local function sign(n) return n > 0 and 1 or (n < 0 and -1 or 0) end

function M.cyclical_frame(phase, anim_speed, num_frames)
  if not phase then phase = 0.0 end
  local spd = (anim_speed or 1.0) * 30 / 1000
  phase = phase + spd
  if phase > 0.99 then phase = 0.0 end
  local frame = math.floor(phase * num_frames) % num_frames
  return frame, phase
end

function M.track_angle(vx, vy)
  return -wa.math.atan(vx, vy) - math.pi
end

function M.rotation_turn(prev_rot, vx, vy, spin)
  return (prev_rot or 0) + (spin or 1.0) * 0.5 * (vx * 0.15 + math.abs(vy) * 0.01 * sign(vx))
end

function M.spin_turn(prev_rot, vx, anim_speed)
  return (prev_rot or 0) + (anim_speed or 0.5) * 0.5 * sign(vx)
end

function M.flight(ctx, opts)
  if not opts or not opts.weapon or not opts.sheet then
    wa.log("px_sprite_builder.flight: weapon and sheet are required")
    return
  end

  local anim_type = ANIM_TYPE[opts.anim or "none"]
  local spin = opts.spin or 1.0
  local cyclical = opts.cyclical or 0
  local anim_speed = opts.anim_speed or 1.0
  local z = opts.z or 5.0
  local scale = opts.scale or 1.0
  local mirror = opts.mirror ~= false
  local owner = opts.owner
  local frame_fn = opts.frame_fn
  local turn_fn = opts.turn_fn

  local follow = {}
  local spin_ang = {}
  local cycl_phase = {}

  local function gone(id)
    return function(b)
      local f = follow[id]
      if f and f.seen then f.seen = false return end
      follow[id] = nil
      spin_ang[id] = nil
      cycl_phase[id] = nil
      b:remove()
    end
  end

  wa.on.missile_frame(function(m)
    if m.weapon ~= opts.weapon then return end
    if m.phase == "pre" then
      m.sprite = 0 -- hide WA's sprite; ours is drawn below
      return
    end
    local f = follow[m.id]
    if not f then
      f = { actor = wa.actors.spawn({
        sprite = opts.sheet, x = m.x, y = m.y,
        owner = owner or current_worm(), on = gone(m.id),
      }) }
      follow[m.id] = f
    end
    f.seen = true
    local b = f.actor
    b.x, b.y, b.vx, b.vy = m.x, m.y, 0, 0

    local rot = 0
    if turn_fn then
      rot = turn_fn(m, spin_ang[m.id])
      spin_ang[m.id] = rot
    elseif anim_type == 2 then
      rot = M.track_angle(m.vx, m.vy)
    elseif anim_type == 3 then
      rot = M.rotation_turn(spin_ang[m.id], m.vx, m.vy, spin)
      spin_ang[m.id] = rot
    elseif anim_type == 1 then
      local spd = ANIM_SPEED[opts.anim] or 0.5
      rot = M.spin_turn(spin_ang[m.id], m.vx, spd)
      spin_ang[m.id] = rot
    end

    local frame = 0
    if frame_fn then
      frame = frame_fn(m)
    elseif cyclical and cyclical > 0 then
      frame, cycl_phase[m.id] = M.cyclical_frame(cycl_phase[m.id], anim_speed, cyclical)
    else
      cycl_phase[m.id] = nil
    end

    b.facing = mirror and (m.vx < 0 and -1 or 1) or 1
    b:frame(frame)
    b:gfx({ angle = math.deg(rot) % 360, depth = z, scale = scale })
  end)
end

M.PX_POSTURE = {
  weaponlnk = "sprites/px_hold/aim", weaponlnku = "sprites/px_hold/aimu",
  weaponlnkd = "sprites/px_hold/aimd",
  wthrow = "sprites/px_hold/draw", wthrowu = "sprites/px_hold/drawu",
  wthrowd = "sprites/px_hold/drawd",
}

M.PX_HANDS = {
  "sprites/px_hold/hand_rad_lower", "sprites/px_hold/hand_rad",
  "sprites/px_hold/hand_rad_upper",
}

return M
`
      },
      {
        path: 'weapons/ripper_star.lua',
        name: 'weapons/ripper_star.lua',
        language: 'lua',
        content: `-- Ripper Star: Project X's Ripper, firing our ninja stars in a flurry.

local seq = require("lib/fire_seq")
local sb = require("lib/px_sprite_builder")
local trail = require("wf-lib/effects/trail")
local hold_art = require("lib/px_hold_art")

local M = {}

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

local function trunc(n) return n < 0 and math.ceil(n) or math.floor(n) end

local function orientation(vx, vy)
  if vx == 0 then return vy > 0 and 16 or 0 end
  if vy == 0 then return vx > 0 and 8 or 24 end
  if vx > 0 and vy < 0 then return math.min(trunc(3 * vx / -vy), 7) end
  if vx > 0 then return math.min(trunc(8 + 3 * vy / vx), 15) end
  if vy > 0 then return math.min(trunc(16 + 3 * -vx / vy), 23) end
  return math.min(trunc(24 + 3 * -vy / -vx), 31)
end

local function within(o, x, y, r)
  return o and math.abs(x - o.x) < r and math.abs(y - o.y) < r
end

function M.install(ctx)
  if not placed(ctx) then
    wa.log("Ripper Star: in no panel slot; nothing registered")
    return
  end

  local ART = "sprites/ripper_star/"
  local SND = "sounds/ripper_star/"
  local DAMAGE = 4
  local HIT_R = 20 -- the strict 20 px square
  local SELF_R = 25 -- and the 25 px square for the turn's worm
  local SHOTS = 15 -- RSShotsFired<=14
  local SHOT_DELAY = 4
  local SPEED = 45 -- the constant in PX's velocity
  local LOW_AIM = 0.165 -- the low-angle extra offset
  local BURIED = { soften = 3, blend = "mix" } -- as the ninja star's

  trail.install()

  local TRAIL = { max = 7, every = 1, core_w = 4.0, glow_w = 7.0, r = 120, g = 120, b = 120 }

  local function current_worm()
    for _, w in ipairs(wa.worms.all()) do
      if w.turn then return w end
    end
  end

  local speed = {}
  wa.on.missile_frame(function(m)
    if m.weapon ~= "px.ripper_star" then return end
    speed[m.id] = { m.vx, m.vy }
    if m.phase == "pre" and not trail.has(m.id) then
      trail.add(m.id, current_worm(), TRAIL)
    end
  end)

  sb.flight(ctx, {
    weapon = "px.ripper_star",
    sheet = ART .. "stamp",
    anim = "none",
    frame_fn = function(m) return orientation(m.vx, m.vy) end,
    z = wa.depth.OBJECTS - 1,
    mirror = false,
  })

  local hold = {
    weapon = "px.ripper_star",
    sheet = ART .. "hold",
    size = 90,
    keep_while_firing = false,
    weap_rotation = 1.0,
    weap_radial_rotation = 1.0,
    weap_radius = 0.0,
  }

  local spec = {
    wep = "weps/ripper_star_wep.wep",
    panel_icon = ART .. "icon.png",
    sprites = { ART .. "stamp", ART .. "hold", trail.BEAM, trail.GLOW },
    params = { gpu_prefix = "sprites/" },
    worm_sprites = sb.PX_POSTURE,
    hold = hold,
    sounds = { SND .. "impact.wav" },

    on_fire = function(ev)
      local w = ev.worm
      local ox = math.abs(ev.x - w.x)
      local oy = ev.y - w.y
      local function angle(i, ww)
        local n = i - 1
        local base = ww.aim
        if n & 2 ~= 0 then return base - 0.010 end
        if n & 3 ~= 0 then return base + 0.010 end
        return base
      end
      seq.fire_seq_mis({
        weapon = "px.ripper_star",
        cancel_weapon = "px.ripper_star",
        standoff = 12,
        owner = w,
        count = SHOTS,
        delay = SHOT_DELAY,
        x = function(i, ww)
          local low = ww.aim < LOW_AIM and 2.0 or 0
          return ww.x + ww.facing * (ox + low)
        end,
        y = function(i, ww)
          return ww.y + oy - 3.4 - (ww.aim < LOW_AIM and 3.1 or 0)
        end,
        vx = function(i, ww)
          local d = 0.5 - angle(i, ww)
          return ww.facing * (0.5 - math.sqrt(d * d)) * SPEED
        end,
        vy = function(i, ww)
          return SPEED * (0.5 - angle(i, ww))
        end,
      })
    end,

    on_explode = function(ev)
      local v = speed[ev.missile]
      if ev.missile then speed[ev.missile] = nil; trail.drop(ev.missile) end
      local vx, vy = v and v[1] or 0, v and v[2] or 0

      local target
      for _, o in ipairs(wa.world.electrical_nearby(ev.x, ev.y, 29, false)) do
        if (o.kind == "worm" or o.kind == "mine" or o.kind == "crate" or o.kind == "oil")
          and within(o, ev.x, ev.y, HIT_R) then target = o break end
      end
      if not target then
        local active = current_worm()
        if within(active, ev.x, ev.y, SELF_R) then target = active end
      end
      if target then
        if target.kind == "worm" then
          target:hit{ amount = DAMAGE, vx = trunc(vx / 4), vy = trunc(vy / 4) }
        else
          target:hit(DAMAGE, trunc(vx / 2), trunc(vy / 2), "bullet")
        end
        return
      end

      wa.land.stamp{ sprite = ART .. "stamp", frame = orientation(vx, vy),
        x = ev.x, y = ev.y, buried = BURIED }
      local shooter = current_worm()
      if shooter then wa.sound.play(shooter, SND .. "impact.wav") end
    end,
  }
  spec.handling = { ends_turn = true }
  hold_art.add(hold)
  wa.weapons.replace(spec)
end

return M
`
      },
      {
        path: 'wf-lib/effects/trail.lua',
        name: 'wf-lib/effects/trail.lua',
        language: 'lua',
        content: `-- PX's effect-manager trail: a ribbon sampled in game frames, drawn with wa.draw.ribbon.

local trail = {}

trail.MAX, trail.EVERY, trail.VANISH = 12, 2, 2
trail.CORE_W, trail.GLOW_W = 8.0, 13.0
-- Lateral jitter in pixels and PX's hue cycle for the additive pass.
trail.NOISE, trail.RAINBOW = 0.0, false
trail.R, trail.G, trail.B = 255, 255, 255
trail.DEPTH = nil
trail.BEAM = "wf-lib/effects/sprites/px_effects/beam.png"
trail.GLOW = "wf-lib/effects/sprites/px_effects/beam_glow.png"

local trails = {}
local live = {} -- round id -> trail while it is in the air
local driver, tick = nil, 0
local STALE = 3
-- Fixed unit noise: the same wobble on every peer.
local NOISE = {}
for i = 1, 257 do
  local h = (i * 1103515245 + 12345) % 2147483648
  NOISE[i] = (h / 1073741824) - 1
end

local function rainbow_of(v)
  if v == true then return { speed = 0.012, offset = 0 } end
  if type(v) == "table" then return v end
  return nil
end

-- PX's HueToRGBLocal on WA's sine table.
local function hue_hex(hue, f)
  hue = hue - math.floor(hue)
  local rad = hue * 6.2831853
  local r = 180 + 75 * wa.math.sin(rad)
  local g = 180 + 75 * wa.math.sin(rad + 2.0943951)
  local b = 180 + 75 * wa.math.sin(rad + 4.1887902)
  r, g, b = math.floor(r * f), math.floor(g * f), math.floor(b * f)
  if r < 0 then r = 0 elseif r > 255 then r = 255 end
  if g < 0 then g = 0 elseif g > 255 then g = 255 end
  if b < 0 then b = 0 elseif b > 255 then b = 255 end
  return (255 << 24) | (r << 16) | (g << 8) | b
end

local function current_worm()
  local first
  for _, w in ipairs(wa.worms.all()) do
    if w.turn then return w end
    if not first and w.hp > 0 then first = w end
  end
  return first
end

local function usable(owner)
  return owner ~= nil and (owner.id or 0) ~= 0
end

local function start_driver(t, owner)
  if driver then return true end
  driver = wa.actors.spawn({
    sprite = t.beam, visible = false, persist = true, owner = owner,
    on = function(a)
      tick = tick + 1
      for i = #trails, 1, -1 do
        local v = trails[i]
        if v.live and tick - v.seen >= STALE then
          v.live = false
          live[v.id] = nil
        end
        if not v.live and tick % v.vanish == 0 then
          table.remove(v.pts, 1)
          if #v.pts == 0 then
            table.remove(trails, i)
            live[v.id] = nil
          end
        end
      end
      if #trails == 0 then driver = nil; a:remove() end
    end,
  })
  return driver ~= nil
end

function trail.add(id, owner, opts)
  if not usable(owner) then owner = current_worm() end
  if not usable(owner) then return nil end
  local t = {
    id = id, pts = {}, live = true, seen = tick,
    max = trail.MAX, every = trail.EVERY, vanish = trail.VANISH,
    core_w = trail.CORE_W, glow_w = trail.GLOW_W,
    noise = trail.NOISE, rainbow = trail.RAINBOW,
    r = trail.R, g = trail.G, b = trail.B,
    depth = trail.DEPTH, beam = trail.BEAM, glow = trail.GLOW,
  }
  for _, k in ipairs({
    "max", "every", "vanish", "core_w", "glow_w", "noise", "rainbow",
    "r", "g", "b", "depth", "beam", "glow",
  }) do
    if opts and opts[k] ~= nil then t[k] = opts[k] end
  end
  t.rainbow = rainbow_of(t.rainbow)
  if t.depth == nil then t.depth = wa.depth.OBJECTS end
  if not start_driver(t, owner) then return nil end
  trails[#trails + 1] = t
  live[id] = t
  return t
end

function trail.has(id)
  return live[id] ~= nil
end

function trail.drop(id)
  local t = live[id]
  if t then
    t.live = false
    live[id] = nil
  end
end

function trail.sample(id, x, y, vx, vy)
  local t = live[id]
  if not t then return end
  t.seen = tick
  if tick % t.every ~= 0 then return end
  if math.abs(vx) < 0.15 and math.abs(vy) < 0.15 then return end
  local pts = t.pts
  local last = pts[#pts]
  if last
      and (last[1] - x) * (last[1] - x) + (last[2] - y) * (last[2] - y) <= 0.01 then
    return
  end
  pts[#pts + 1] = { x, y }
  if #pts > t.max then table.remove(pts, 1) end
end

local installed = false

function trail.install()
  if installed then return end
  installed = true

  wa.on.missile_frame(function(m)
    if m.phase ~= "post" then
      local t = live[m.id]
      if t then t.seen = tick end
      return
    end
    trail.sample(m.id, m.x, m.y, m.vx, m.vy)
  end)

  if wa.on.draw and wa.draw.ribbon then
    local RIBBON = { blend = "add", points = {} }
    local function pass(t, sprite, width)
      local pts, n = t.pts, #t.pts
      if n < 2 then return end -- \`if (trailAmount < 2) return;\`
      RIBBON.sprite, RIBBON.depth = sprite, t.depth
      local rp = RIBBON.points
      for i = 1, n do
        local f = i / (n + 1)
        if f < 0.1 then f = 0.1 end
        local p = rp[i]
        if not p then p = {}; rp[i] = p end
        local x, y = pts[i][1], pts[i][2]
        if t.noise > 0 then
          -- Perpendicular to the local tangent, as PX jitters a reach arc.
          local a = pts[i - 1] or pts[i]
          local b = pts[i + 1] or pts[i]
          local dx, dy = b[1] - a[1], b[2] - a[2]
          local len = math.sqrt(dx * dx + dy * dy)
          if len > 0.0001 then
            local j = NOISE[((i - 1) % 256) + 1] * t.noise
            x, y = x - dy / len * j, y + dx / len * j
          end
        end
        p.x, p.y, p.u, p.width = x, y, f, f * width
        if t.rainbow then
          -- Hue runs along the ribbon and with the clock.
          p.color = hue_hex(tick * t.rainbow.speed + f * 0.35
            + (t.rainbow.offset or 0), f)
        else
          p.color = (255 << 24) | (math.floor(t.r * f) << 16)
            | (math.floor(t.g * f) << 8) | math.floor(t.b * f)
        end
      end
      for i = #rp, n + 1, -1 do rp[i] = nil end
      wa.draw.ribbon(RIBBON)
    end
    wa.on.draw(function()
      for _, t in ipairs(trails) do
        pass(t, t.beam, t.core_w)
        if t.glow_w > 0 then pass(t, t.glow, t.glow_w) end
      end
    end)
  end
end

return trail
`
      }
    ],
  },
  {
    id: 'px.swim',
    name: 'Swim Suit (PX)',
    version: '0.20.86',
    author: 'Project X authors',
    category: 'utility',
    primaryFile: 'weapons/swim_suit.lua',
    workspacePrefix: 'px',
    description: 'Modern PX component: px.swim_suit. The full px.ports bundle loads so its lib/shared and weapon dependencies are visible; this entry opens weapons/swim_suit.lua.',
    tags: ['example', 'worm', 'water', 'modern'],
    files: PX_FILES,
  },
  {
    id: 'utilities.agility',
    name: 'Agility (Core Utilities)',
    version: '0.21.0',
    author: 'WormForge',
    category: 'utility',
    primaryFile: 'features/agility.lua',
    workspacePrefix: 'utilities',
    description: 'Modern component version: the agility switch in Core Utilities. Arrow keys nudge worm.vx / worm.vy while airborne; features/utilities.lua loads features/agility.lua when the profile turns it on.',
    tags: ['example', 'worm', 'movement', 'modern'],
    files: UTILITY_FILES,
  },
];
