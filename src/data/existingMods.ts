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
        content: `-- Highlander's rules, the hl.rules add-on: each worm is dealt one weapon
-- from each pool, may use each once a turn, and takes everything a worm it
-- kills carried (scheme/pools, scheme/state, scheme/highland_rules), wherever the
-- profile put the weapons. It installs before the weapons (before_weapons),
-- so its hooks run first.
--
-- The pools are the placed weapons' settings for this add-on ("Highlander
-- pool", "Dealt on cavern maps"): a PX weapon suggests its PX pool in
-- mod.toml, and a profile may set any weapon's, a stock one's too.
--
-- What PX gives outside the deal -- the Hot Air Balloons refilled to 3 and
-- the Wind Changer to 1 each turn, one Weapon Crate a round -- is weapon data
-- in the Highlander profile, which the loader shows and a player may change.
local shared = require("lib/shared")

-- ctx.placed is in slot order, the same on every peer: the pools keep it.
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
        content: `-- ============================================================================
-- WormForge WA 3.8.1 Port: KTK (Kill The King) Control Logic
-- Transpiled and hardened from Project X 3.6.31.0 CKtkControl
--
-- Security & Sandbox Compliance (sandbox.rs):
--  - INLINED CONFIG: No require("config") because require/dofile are nil in sandbox.
--  - STABLE FRAME GATE: Evaluates once per frame via worm.id <= lastWormId dispatch boundary.
--  - STRICT TEAM INDICES: 1-based team numbers (1: Red, 2: Blue, etc.) strictly compared.
--  - NO INSTANT LOSS: Safe solid pixel detection with fail-safe guard (disables if 0 pixels).
--  - SOUND CLAIMS: wa.sound.play safely called with worm handle (not numeric id) when claimed.
--  - WINNER TRACKING: Eliminates losing team via w:hurt(w.hp) in deterministic lockstep.
-- ============================================================================

-- IN-Game Replay breakst the mod, revives worms for some reason.

-- Inline configuration table (sandbox-compliant: do NOT use require/dofile)
return function()
  local CONFIG = {
    -- King Count: 1 or 2
    kingsCount = 1,

    -- Time for attack in milliseconds (300,000 ms = 5 minutes)
    timeForAttackMs = 300000,

    -- "AttackOnly" (decreases only on attacker turns)
    -- "DefendAndCompensate" (defenders turn adds +5ms per tick back to timer)
    timerType = "AttackOnly",

    -- Timer HUD caption
    timerCaption = "Remaining attack time:",

    -- Teams (1-based indices in WA: 1=Red, 2=Blue, 3=Green, 4=Yellow, 5=Purple, 6=Cyan)
    attackersTeam = 1, -- Red Team (Attackers)
    defendersTeam = 2, -- Blue Team (Defenders)

    -- Percentage of King solid pixels that must be destroyed to trigger King loss
    destructionPercentage = 75,

    -- Optimization: sample king bounding box every N frames (5 frames = 100ms)
    checkIntervalFrames = 5,

    -- King 1 Configuration (Pixel coordinates on the map)
    king1 = {
      name = "Blue King",
      x1 = 106,
      y1 = 829,
      width = 10,
      height = 10,
      destructionPercentage = 70,
    },

    -- King 2 Configuration (Used when kingsCount >= 2)
    king2 = {
      name = "Red King",
      x1 = 1420,
      y1 = 300,
      width = 10,
      height = 10,
      destructionPercentage = 70,
    },
  }

  local MS_PER_FRAME = 20 -- 50 fps lockstep (1000ms / 50 = 20ms per frame)

  -- State Variables (Pure functions of simulation frames)
  local initialized = false
  local matchOver = false
  local winningTeam = nil
  local winReason = ""

  local timerMs = CONFIG.timeForAttackMs or 300000
  local timerType = CONFIG.timerType or "AttackOnly"
  local attackersTeam = CONFIG.attackersTeam or 1
  local defendersTeam = CONFIG.defendersTeam or 2

  local kings = {}
  local kingsCount = CONFIG.kingsCount or 1

  -- Dispatch ordering tracking for once-per-frame gate
  local lastWormId = 999999
  local frameCheckCounter = 0

  -- ----------------------------------------------------------------------------
  -- Helper: Initialize King solid pixel area on round start
  -- ----------------------------------------------------------------------------
  local function init_king(cfg, id)
    if not cfg then return nil end

    local totalSolid = 0
    local x1 = cfg.x1
    local y1 = cfg.y1
    local x2 = cfg.x1 + cfg.width
    local y2 = cfg.y1 + cfg.height

    -- Scan rectangle for initial solid terrain pixels
    for x = x1, x2 do
      for y = y1, y2 do
        if wa.land.solid(x, y) then
          totalSolid = totalSolid + 1
        end
      end
    end

    -- Safe Guard against empty bounding boxes (e.g. map mismatch or bad coordinates):
    -- In PX, DrawKing painted terrain. If WormForge runs on an arbitrary map with 0 solid pixels,
    -- DO NOT fallback to width*height (which would cause an instant loss on first sample).
    -- Instead, log warning and disable win check for this king.
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

  -- ----------------------------------------------------------------------------
  -- Helper: Check remaining solid terrain pixels for an active King
  -- ----------------------------------------------------------------------------
  local function check_king_damage(king)
    if not king or not king.active or king.destroyed then
      return false
    end

    local count = 0
    for x = king.x1, king.x2 do
      for y = king.y1, king.y2 do
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

  -- ----------------------------------------------------------------------------
  -- WIN CONDITION: For-loop setting opposing team worms HP to 0
  -- Red Team victory enforcement across all clients in deterministic lockstep
  -- ----------------------------------------------------------------------------
  local function eliminate_team(losingTeamIndex, winnerIndex, reason)
    if matchOver then return end
    matchOver = true
    winningTeam = winnerIndex
    winReason = reason

    wa.log(string.format("[KTK] Win Condition Triggered: %s. Eliminating Team %d (Team %d Wins)", reason, losingTeamIndex, winnerIndex))

    -- Iterate through all worms; set the losing team's HP to 0
    -- In WormForge, w:hurt(w.hp) issues standard MSG_HIT (0x4B), immediately
    -- eliminating the worm through WA's deterministic damage pipeline.
    local worms = wa.worms.all()
    for _, w in ipairs(worms) do
      if w.team == losingTeamIndex and w.hp > 0 then
        w:hurt(w.hp)
      end
    end
  end

  -- ----------------------------------------------------------------------------
  -- Format milliseconds to MM:SS
  -- ----------------------------------------------------------------------------
  local function format_time(ms)
    if ms < 0 then ms = 0 end
    local totalSeconds = math.floor(ms / 1000)
    local minutes = math.floor(totalSeconds / 60)
    local seconds = totalSeconds % 60
    return string.format("%02d:%02d", minutes, seconds)
  end

  -- ----------------------------------------------------------------------------
  -- Main Lockstep Simulation Hook (FRAME_FINISH)
  -- ----------------------------------------------------------------------------
  wa.on.worm_message(function(worm, msg)
    if msg ~= wa.msg.FRAME_FINISH then
      return
    end

    -- One-time match initialization
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

    -- ONCE-PER-FRAME GATE:
    -- worm_message fires for EVERY worm each frame.
    -- Worm dispatch order is deterministic and monotonic. When current worm.id <= lastWormId,
    -- we have crossed into a new simulation frame.
    local isNewFrame = (worm.id <= lastWormId)
    lastWormId = worm.id

    -- Timer update only runs if this worm is the currently active turn worm
    if worm.turn then
      local curTeam = worm.team -- strictly 1-based team index

      if curTeam == attackersTeam then
        timerMs = timerMs - MS_PER_FRAME

        if timerMs <= 0 then
          timerMs = 0
          -- Attackers ran out of time -> Defenders (Red) Win!
          eliminate_team(attackersTeam, defendersTeam, "Attack Timer Expired")
          return
        end
      elseif timerType == "DefendAndCompensate" and curTeam == defendersTeam then
        timerMs = timerMs + 5
      end
    end

    -- Frame-boundary logic: King damage check
    if isNewFrame then
      frameCheckCounter = frameCheckCounter + 1
      if frameCheckCounter >= CONFIG.checkIntervalFrames then
        frameCheckCounter = 0

        for i = 1, kingsCount do
          local king = kings[i]
          if check_king_damage(king) then
            -- King destroyed -> Defenders lose, Attackers (Red) Win!
            eliminate_team(defendersTeam, attackersTeam, string.format("%s Destroyed", king.name))
            return
          end
        end
      end
    end
  end)

  -- ----------------------------------------------------------------------------
  -- Presentation HUD Overlay (wa.on.hud)
  -- ----------------------------------------------------------------------------
  wa.on.hud(function()
    if not initialized then return end

    -- Draw Attack Timer
    local timerStr = string.format("%s %s", CONFIG.timerCaption or "Remaining attack time:", format_time(timerMs))
    wa.hud.line(timerStr, 14, 40)

    -- Draw King HP status
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
        wa.hud.line(statusStr, 14, 80 + (i - 1) * 16)
      end
    end

    if matchOver and winningTeam then
      local teamName = (winningTeam == 1) and "RED TEAM" or ("TEAM " .. winningTeam)
      wa.hud.line(string.format("=== %s WINS! (%s) ===", teamName, winReason), 14, 120)
    end
  end)
end
`
      },
      {
        path: 'components/loader.lua',
        name: 'components/loader.lua',
        language: 'lua',
        content: `-- Set up the selected weapons and their dependencies once, in the established
-- hook order. Modules keep pure declarations separate from runtime setup.
local shared = require("lib/shared")
local index = require("weapons/index")
local loader = {}
local loaded, placed_ids = false, nil
-- Modules an add-on needs set up whether or not their weapon is placed.
local also = {}

-- An add-on that installs before the weapons (before_weapons) asks for a
-- module's setup here, before anything loads.
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
  "weapons/nuke_rocket",
  "weapons/helicopter",
  "weapons/hot_air_balloon",
  "weapons/hang_glider",
  "weapons/swim_suit",
  "weapons/wind_changer",
  "weapons/gravity_control",
  "lib/turn_controls",
  "weapons/jump",
  "weapons/laser_gun",
  "weapons/super_tele",
  "weapons/electric_grenade",
  "weapons/lightning_strike",
  "lib/electrical",
  "weapons/javelin",
  "weapons/ice_arrow",
  "weapons/valyrian_fire",
  "weapons/reinforcement",
  "weapons/bowling_ball",
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
  -- Require only pure declarations here. No hooks run until ORDER below.
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
  -- Common rendering hooks still install even for a record-only weapon.
  for _, path in ipairs({ "lib/holds", "weapons/old_woman_launcher", "lib/anim", "lib/missile_sprites" }) do
    -- These libraries have runtime side effects; load them only in ORDER.
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
  -- Copy declarations before applying this profile's component options.
  -- Existing modules may still build their declaration in a function.
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
        content: `-- Project X's oil drums, the px.oil_drums add-on: every oil drum on the map
-- is one of PX's kinds (lib/oil_drums). It installs before the weapons
-- (before_weapons) so the Electric Grenade's arc, which the electric drum
-- fires, is set up whether or not the grenade is placed.
local ARC = {
  sprites = {
    "sprites/lightning/beam.png", "sprites/lightning/glow.png", "sprites/lightning/cloud.png",
    "sprites/electric_grenade/explosion.png", "sprites/electric_grenade/tazed1.png",
    "sprites/electric_grenade/tazed2.png",
  },
  sounds = { "sounds/lightning/tazer_loop.wav" },
}

return {
  install = function(ctx)
    local loader = require("components/loader")
    loader.also("weapons/electric_grenade")
    -- PX's icy drum takes a Swim Suit off: only a placed one can be on.
    loader.load(loader.place(ctx))
    local drums = require("lib/oil_drums")
    local sprites = drums.sprites()
    for _, s in ipairs(ARC.sprites) do sprites[#sprites + 1] = s end
    wa.assets.load({ sprites = sprites, sounds = ARC.sounds })
    -- The nuke drum fires the Nuke Rocket's rockets, which only a placed
    -- Nuke Rocket launches.
    drums.install({ nuke = ctx.weapons["px.nuke_rocket"] ~= nil })
  end,
}
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
        content: `-- Highlander: sprite animation helpers. Split from rules.lua by tools/split_highlander.py.
local shared = require("lib/shared")

-- PX's missile sprite animations share these two helpers. Holds are drawn
-- by the engine from each replace claim's hold table above.
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
        path: 'lib/electrical.lua',
        name: 'lib/electrical.lua',
        language: 'lua',
        content: `-- Shared target queries and beam rendering for the electrical weapons.
-- Each weapon owns its simulation callbacks; this module owns their renderer.
local electrical = {}
local context, installed
function electrical.context()
  if context then return context end
  local function sq(v) return v * v end
  local shared = require("lib/shared")
  local ELECTRIC_DEPTH = wa.depth.BEHIND_TERRAIN
  local BEAM = "sprites/lightning/beam.png"
  local GLOW = "sprites/lightning/glow.png"
  local CLOUD = "sprites/lightning/cloud.png"
  local CLOUD_DEPTH = ELECTRIC_DEPTH - 0x1000
  local GRENADE_BURST = "sprites/electric_grenade/explosion.png"
  local strikes, arcs, tazed = {}, {}, {}
  shared.revived_by_lightning = shared.revived_by_lightning or {}
  local function effect_actor(x, y, owner, frame)
    return wa.actors.spawn({
      sprite = GLOW, visible = false, gravity = false, collide = false,
      owner = owner, x = x, y = y, on = frame,
    })
  end

  local function electrical_targets(graves)
    local out = {}
    for _, group in ipairs({ wa.worms, wa.mines, wa.crates, wa.oil }) do
      for _, obj in ipairs(group.all()) do out[#out + 1] = obj end
    end
    if graves and wa.graves then
      for _, obj in ipairs(wa.graves.all()) do out[#out + 1] = obj end
    end
    return out
  end

  local function target_radius(obj)
    if obj.kind == "worm" then return 6 end
    if obj.kind == "grave" then return 8 end
    if obj.kind == "mine" then return 5 end
    return 9
  end

  -- A ray against terrain and the objects PX's collision mask names. Projection
  -- and the chosen endpoint both use world pixels.
  -- Equal-distance objects retain the engine's entity traversal order.
  local function electrical_trace(x0, y0, dx, dy)
    local far = 10000
    if wa.world.electrical_trace then
      return wa.world.electrical_trace(x0, y0,
        (x0 + dx * far), (y0 + dy * far))
    end
    local land = wa.land.trace(x0, y0,
      (x0 + dx * far), (y0 + dy * far))
    local best = land and math.sqrt(sq(land.x - x0) + sq(land.y - y0)) or far
    local hit = land and { x = land.x, y = land.y, obj = nil } or nil
    for _, obj in ipairs(electrical_targets(true)) do
      local ox, oy = (obj.x - x0), (obj.y - y0)
      local along = ox * dx + oy * dy
      local across = math.abs(ox * dy - oy * dx)
      if along > 0 and along < best and across <= target_radius(obj) then
        best = along
        hit = { x = obj.x, y = obj.y, obj = obj }
      end
    end
    return hit
  end
  context = { sq = sq, ELECTRIC_DEPTH = ELECTRIC_DEPTH, BEAM = BEAM, GLOW = GLOW, CLOUD = CLOUD, CLOUD_DEPTH = CLOUD_DEPTH, GRENADE_BURST = GRENADE_BURST, strikes = strikes, arcs = arcs, tazed = tazed, effect_actor = effect_actor, electrical_targets = electrical_targets, target_radius = target_radius, electrical_trace = electrical_trace }
  return context
end

function electrical.setup()
  if installed then return end
  installed = true
  local c = electrical.context()
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
  local find_target = c.find_target
  if wa.on.draw and wa.draw.ribbon then
    -- Resolve the pack namespace once for the many glow/beam submissions.
    local beam_sprite = wa.sprites.key(BEAM)
    local glow_sprite = wa.sprites.key(GLOW)
    local cloud_sprite = wa.sprites.key(CLOUD)
    local burst_sprite = wa.sprites.key(GRENADE_BURST)
    local function colour(a, r, g, b)
      return (math.floor(a) << 24) | (r << 16) | (g << 8) | b
    end
    -- wa.draw.quad and wa.draw.ribbon copy their table before returning, so
    -- one spec is refilled for every quad and every ribbon. A frame with
    -- dozens of arcs draws about a thousand glows: new tables for each made
    -- enough garbage to run Lua's GC inside the draw on most frames.
    local QUAD = { points = { {0, 0}, {0, 0}, {0, 0}, {0, 0} } }
    -- An axis-aligned square of half size hw by hh around x, y.
    local function square(sprite, frame, blend, color, depth, x, y, hw, hh)
      QUAD.sprite, QUAD.frame, QUAD.blend, QUAD.color, QUAD.depth = sprite, frame, blend, color, depth
      local p = QUAD.points
      p[1][1], p[1][2] = x - hw, y - hh
      p[2][1], p[2][2] = x + hw, y - hh
      p[3][1], p[3][2] = x + hw, y + hh
      p[4][1], p[4][2] = x - hw, y + hh
      wa.draw.quad(QUAD)
    end
    local function glow(x, y, size, color)
      local h = size / 2
      square(glow_sprite, 0, "add", color, ELECTRIC_DEPTH, x, y, h, h)
    end
    -- One ribbon's points, refilled: point(i, ...) sets the i-th, ribbon(n)
    -- draws the first n.
    local RIBBON = { sprite = beam_sprite, blend = "add", depth = ELECTRIC_DEPTH, points = {} }
    -- Keep shortened ribbons' point tables: the next arc may be longer again.
    local POINTS = {}
    local function point(i, x, y, width, u, color)
      local p = POINTS[i]
      if not p then p = {}; POINTS[i] = p end
      RIBBON.points[i] = p
      p.x, p.y, p.width, p.u, p.color = x, y, width, u, color
    end
    local function ribbon(n)
      local pts = RIBBON.points
      for i = #pts, n + 1, -1 do pts[i] = nil end
      wa.draw.ribbon(RIBBON)
    end
    -- PX's lightningstrike RenderLightning. Its shape is fractal noise, made
    -- afresh each game frame while the beam holds: each point is the middle of
    -- its two neighbours plus a random nudge, halving the span each pass. A
    -- look, so from wa.draw.random, never WA's generator.
    local LR, LG, LB = 120, 140, 255
    local function lerp(t, a, b) return a + (b - a) * t end
    local function noise_span(noise, off, divs, scale, first, last)
      for i = 0, divs - 1 do noise[off + i] = 0 end
      noise[off], noise[off + divs - 1] = first, last
      local k = divs
      local l = k >> 1
      while l > 0 do
        for i = l, divs - 1 - l, k do
          noise[off + i] = (noise[off + i - l] + noise[off + i + l]) * 0.5 + (wa.draw.random() * 2 - 1) * scale
        end
        k = l
        l = k >> 1
      end
    end
    -- The main beam's 9 points, and 6 branches of 9 at random points on it.
    local function new_shape(s)
      s.noise, s.attach = s.noise or {}, s.attach or {}
      for i = 1, 8 do s.attach[i] = nil end
      noise_span(s.noise, 0, 9, 1.0, 0, 0)
      for _ = 1, 6 do s.attach[1 + math.floor(wa.draw.random() * 8)] = true end
      for i = 0, 5 do
        local off = 2 + wa.draw.random() * 4
        if wa.draw.random() < 0.5 then off = -off end
        noise_span(s.noise, 9 + 9 * i, 9, 0.5, 0, off)
      end
      s.ground = 0.5 + wa.draw.random() * 0.3
      s.shape_tick = s.ticks
    end
    -- PX's RenderBeam: one textured strip through the noise, \`width\` (a half
    -- width, as PX's) tapering to \`endwidth\`, and a glow at every point fading
    -- towards the end.
    local function beam(noise, off, divs, width, endwidth, scale, x1, y1, x2, y2, glowalpha)
      if divs < 2 then return end
      local dx, dy = (x2 - x1), (y2 - y1)
      local dd = math.sqrt(dx * dx + dy * dy)
      if dd <= 0 then return end
      dx, dy = dx / dd, dy / dd
      local d = divs - 1
      for i = 0, divs - 1 do
        local f = i / d
        local n = noise[off + i] or 0
        local x = lerp(f, x1, x2) + scale * dy * n
        local y = lerp(f, y1, y2) - scale * dx * n
        point(i + 1, x, y, 2 * lerp(f, width, endwidth), f, colour(255, LR, LG, LB))
        local a = 255 * glowalpha * (1 - f)
        if a >= 1 then glow(x, y, 64, colour(a, LR, LG, LB)) end
      end
      ribbon(divs)
    end
    local function draw_strike(s)
      -- The cloud, dark and alpha-blended over the sky.
      for _, p in ipairs(s.cloud) do
        local t = p.age / p.life
        local size = lerp(t, p.s0, p.s1)
        square(cloud_sprite, 0, "alpha", colour(255 * t, 45, 40, 60), CLOUD_DEPTH, p.x, p.y, 64 * size, 40 * size)
      end
      for _, p in ipairs(s.sparks) do
        local t = p.age / 50
        glow(p.x, p.y, 13 * (1 - t) + 1, colour(255, LR, LG, LB))
      end
      if s.life <= 0 or s.delay >= 8 then return end
      if not s.noise or (s.delay == 0 and s.shape_tick ~= s.ticks) then new_shape(s) end
      -- Before it lands the beam grows down from the cloud over 8 frames.
      local divs, ex, ey = 9, s.ex, s.ey
      if s.delay > 0 then
        local fr = (8 - s.delay) / 8
        divs = math.floor(9 * fr)
        ex, ey = lerp(fr, s.sx, s.ex), lerp(fr, s.sy, s.ey)
      end
      beam(s.noise, 0, divs, 35, 3, 15, s.sx, s.sy, ex, ey, 1.0)
      local sub, d = 0, divs - 1
      for i = 0, divs - 1 do
        if s.attach[i] and d > 0 then
          local f = i / d
          local x = lerp(f, s.sx, ex) + 10 * s.diry * s.noise[i]
          local y = lerp(f, s.sy, ey) - 10 * s.dirx * s.noise[i]
          beam(s.noise, 9 + 9 * sub, 9, lerp(f, 10, 1), 0.1, 15 * (1 - f), x, y,
            x + s.dirx * 100 * (1 - f), y + s.diry * 100 * (1 - f), 0.5 * (1 - f))
          sub = sub + 1
        end
      end
      glow(s.sx + 10 * s.dirx, s.sy + 10 * s.diry, 230, colour(255, LR, LG, LB))
      if s.delay == 0 and s.hit then glow(s.ex, s.ey, 128 * s.ground, colour(255, LR, LG, LB)) end
    end
    wa.on.draw(function()
      for _, s in ipairs(strikes) do
        draw_strike(s)
      end
      for _, arc in ipairs(arcs) do
        if arc.explosion < 10 then
          local h = 75
          square(burst_sprite, arc.explosion, "add", 0x551E14EB, ELECTRIC_DEPTH, arc.burst_x, arc.burst_y, h, h)
        end
        if #arc.points >= 2 then
          -- PX's CTazerShot: one strip through the arc's points, thickest in
          -- the middle (9, a half width, as PX's), wobbling up to 10 px across
          -- its path by fractal noise made afresh each game frame, a glow at
          -- every point and a big one at the tip; all fading as the arc dies.
          if arc.shape_tick ~= arc.sound_age then
            -- One noise value per point; PX's fractal noise needs a power of
            -- two plus one values.
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
      -- PX's CTazerDamage glow on a linked Bowling Ball until it is zapped.
      for _, arc in ipairs(arcs) do
        for _, p in ipairs(arc.pending) do
          if p.key:sub(1, 5) == "ball:" then
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
          -- PX's tazed worm: a glow 0.4 to 0.7 of the sheet, flickering.
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
        content: `-- Common PX posture/hand sheets. Individual holds live in weapons/<weapon>.lua.
local sdk = require("wf-lib/holds")
local shared = require("lib/shared")
shared.PX_POSTURE, shared.PX_HANDS = sdk.PX_POSTURE, sdk.PX_HANDS
`
      },
      {
        path: 'lib/laser.lua',
        name: 'lib/laser.lua',
        language: 'lua',
        content: `-- Highlander: what Project X's two lasers share (weapon_gun_lasergun's
-- CLaserRay, which weapon_sentry_laser's CLaserRayS copies): their art, PX's
-- glow particles (PxParticle) and how both are drawn. A ray \`r\` carries its
-- own particles in \`r.fx\` and its own random sequence in \`r.seed\`, so the
-- effects come out the same on every machine.
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

-- A PX particle: moved, pulled and slowed each game frame, drawn additive.
-- { x, y (pixels), vx, vy (pixels/frame), life, drag, grav, jitter, s0, s1 (sizes, 1 = 32
-- px), c0, c1 ({ r, g, b } at birth and death), alpha (255) }.
function laser.particle(r, p)
  p.age, p.vx, p.vy = 0, p.vx or 0, p.vy or 0
  r.fx[#r.fx + 1] = p
end

-- One game frame of the ray's particles.
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

-- An ARGB word from an alpha and { r, g, b }.
function laser.argb(a, rgb)
  return (math.floor(math.max(0, math.min(255, a))) << 24)
    | (math.floor(rgb[1]) << 16) | (math.floor(rgb[2]) << 8) | math.floor(rgb[3])
end

-- The glow sprite, \`px\` across, centred on (x, y).
function laser.glow(x, y, px, color)
  local h = px / 2
  wa.draw.quad({ sprite = laser.GLOW, blend = "add", color = color, depth = laser.DEPTH,
    points = { { x - h, y - h }, { x + h, y - h }, { x + h, y + h }, { x - h, y + h } } })
end

-- The ray's particles, each fading from its birth size and colour to its
-- death ones.
function laser.draw_particles(r)
  for _, p in ipairs(r.fx) do
    local t = p.age / p.life
    local c = { p.c0[1] + (p.c1[1] - p.c0[1]) * t, p.c0[2] + (p.c1[2] - p.c0[2]) * t,
      p.c0[3] + (p.c1[3] - p.c0[3]) * t }
    laser.glow(p.x, p.y, 32 * (p.s0 + (p.s1 - p.s0) * t), laser.argb(p.alpha or 255, c))
  end
end

-- The beam: a strip of the beam texture \`width\` px wide from (x0, y0) to
-- (x1, y1).
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
        content: `-- Highlander: PX's missile sprites. Split from rules.lua by tools/split_highlander.py.
local shared = require("lib/shared")
local HOLD_DEPTH = shared.HOLD_DEPTH
local frame_of = shared.frame_of
local next_phase = shared.next_phase

-- ------------------------------------ PX's missile sprites, at run time
-- Shared with later sections; the rest of this section is local to it.
local flying, current_worm
do
--
-- For some weapons PX draws the missile itself (p_sprite_builder,
-- WeapSprite) and leaves WA's sprite 0: a sprite that follows the missile,
-- turned to its flight, mirrored when it flies left, and, if \`animate\`,
-- stepped through its sheet as a hold is. Here it is a GPU actor per
-- missile, placed from wa.on.missile_frame after WA has moved the missile.
-- It reads m.weapon (the missile's slot); on an engine without it nothing
-- matches and nothing is drawn. With \`hide\`, WA draws nothing for the
-- missile (m.sprite = 0), as PX's sprite 0 does; its record keeps its
-- sprite, which a thrown weapon's worm posture is picked by.
--
-- How it turns follows the record's animation type (the entry's +0x64,
-- PX's launchdata.anim.type): 2, WAT_TrackMovement, faces its flight
-- (WeapSprite type 2, as a bazooka shell); 1, WAT_Rotation, spins with its
-- speed (type 3, as a grenade), which \`spin\` asks for.

-- Slot -> the weapon's WeapSpriteParams, as its PX script states them.
local PX_WEAP_SPRITES = shared.missile_sprites

flying = {} -- missile id -> { actor, phase, seen }
-- Missiles of a \`first_sprite\` weapon that showed it when first seen:
-- missile id -> true. Hidden, their sprite reads 0 from then on.
local matched = {}

-- The actor goes when its missile stops reporting: WA has freed it.
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
    a:despawn()
  end
end

-- The worm whose turn it is: WeapSprite's owner (GetCurrentWorm()). A
-- missile frame gives no spawn owner of its own.
function current_worm()
  for _, w in ipairs(wa.worms.all()) do
    if w.turn then
      return w
    end
  end
end

-- A missile can outlive the turn it was fired in: a Chilli's five burst
-- after a blast that hurt the thrower, which ends WA's turn. With no worm
-- holding the turn, the last turn's worm owns the sprite, or it would not
-- be drawn at all while WA still flies the missile. That worm may have
-- died since, and WA frees a dead worm: it is kept by id and looked up
-- among the living, and if it is gone any living worm owns the sprite.
-- Left undrawn instead, the missile would show WA's own sprite, which
-- another weapon may have taken over.
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

wa.on.missile_frame(function(m)
  local p = shared.owns(m.weapon) and PX_WEAP_SPRITES[m.weapon]
  if p and p.first_sprite and not matched[m.id] then
    if m.phase == "pre" and m.sprite == p.first_sprite then
      matched[m.id] = true
    else
      p = nil
    end
  end
  -- WA's sprite is hidden only where PX's is drawn in its place: with no
  -- owner for ours, WA's stays.
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
      sprite = p.sheet, x = m.x, y = m.y, gravity = false, collide = false,
      owner = owner, on = follow_missile(m.id),
    })
    flying[m.id] = f
  end
  f.seen = true
  local a = f.actor
  a.x, a.y, a.vx, a.vy = m.x, m.y, 0, 0
  a.facing = m.vx < 0 and -1 or 1
  if p.animate then
    f.phase = next_phase(f.phase, p.anim_speed)
    a:frame(frame_of(f.phase, p.frames))
  end
  local rot
  if p.spin then
    -- WeapSprite type 3: speed * (vx * 0.15 + |vy| * 0.01, towards vx) a
    -- frame, in pixels a frame and radians; WeapSprite's speed is 0.5
    -- unless the weapon's script sets it.
    local vx, vy = m.vx, m.vy
    local sign = vx > 0 and 1 or vx < 0 and -1 or 0
    f.rot = f.rot + (p.spin_speed or 0.5) * (vx * 0.15 + math.abs(vy * 0.01) * sign)
    rot = f.rot
  else
    -- WeapSprite::CalculateAngle, rotation 0.
    rot = -wa.math.atan(m.vx, m.vy) - math.pi
  end
  a:gfx({ angle = math.deg(rot) % 360, depth = HOLD_DEPTH })
end)
end

shared.current_worm = current_worm
`
      },
      {
        path: 'lib/oil_drums.lua',
        name: 'lib/oil_drums.lua',
        language: 'lua',
        content: `-- Project X's oil drums (script_other_drums: oildrums.txt, icybarrel_logic.txt):
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
-- opacity, frame(a, sparks), angle(a)), \`a\` PX's animcycle (frame * 0.02).
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
`
      },
      {
        path: 'lib/portals.lua',
        name: 'lib/portals.lua',
        language: 'lua',
        content: `-- Reusable portal pairs. The gun supplies placement/controls/art; a pair
-- owns traversal, return suppression, clearance and its velocity strategy.
local default_velocity = require("lib/portal_velocity")
local Network = {}
Network.__index = Network
local OFFSET = { {0,1}, {-1,1}, {-1,0}, {-1,-1}, {0,-1}, {1,-1}, {1,0}, {1,1} }
local function trunc(x) return x >= 0 and math.floor(x) or -math.floor(-x) end

-- PX's GetHitAngle: eight surface directions, using the outward normal.
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
-- Centre crossing, extended to a swept segment for shots faster than the
-- opening. Called before WA collides, so a missile survives the entry wall.
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
  return kind .. ":" .. tostring((kind == "worm" or kind == "actor") and body.id or body.uid)
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
  -- PX's exclusion uses the impact point and the other rect plus 10px.
  if other and math.abs(x - other.x) < other.w / 2 + 10
    and math.abs(y - other.y) < other.h / 2 + 10 then return nil end
  local fresh = pair[colour] == nil
  local p = pair[colour] or {}
  p.group, p.colour, p.team_colour = group, colour, team_colour
  p.x, p.y = x + OFFSET[dir][1] * self.offset, y + OFFSET[dir][2] * self.offset
  p.draw_x, p.draw_y, p.dir, p.nx, p.ny = x, y, dir, nx, ny
  p.w, p.h = self.width, self.height
  -- PX's final constructor else puts straight exits at the centre. Its
  -- diagonals use the inner x edge and one/ two thirds down the rectangle.
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
end
Network.direction, Network.inside, Network.crossing = direction, inside, crossing
return Network
`
      },
      {
        path: 'lib/portal_effects.lua',
        name: 'lib/portal_effects.lua',
        language: 'lua',
        content: `-- PX p_portalgun2 DoTrailEffects/DoSpark/DoFlash and p_portal2
-- DoPortalEffects/DoTeleportationEffects, using the existing GPU draw API.
-- This local random stream drives looks only, never WA's gameplay RNG.
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
  -- Twelve endpoints emit at most 180 ambient particles at once. Bound
  -- bursts too, so repeated transport cannot accumulate an unbounded list.
  if #self.particles >= 1024 then return end
  local angle, speed = self:random(0, TAU), self:random(spec.speed[1], spec.speed[2])
  self.particles[#self.particles+1] = {
    x = x, y = y, vx = wa.math.cos(angle)*speed, vy = wa.math.sin(angle)*speed,
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
  -- PX's ExplodeAt emits 7 + 10 sparks; a rejected portal adds 30.
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
        path: 'lib/px_blast_zone.lua',
        name: 'lib/px_blast_zone.lua',
        language: 'lua',
        content: `-- Blast Zone -- Project X's zone launcher, ported to WormForge API 4.
--
-- PX's source is \`PX_pending/weapon_zones/scripts/zone_launchers_script.txt\`:
-- the \`CBlast\` class (:233-348), the missile's \`ExplodeAt\` that places the zone
-- (:370-376), \`CWorm::FireFinal\` that saves the thrower's team (:519-526) and
-- the in-match keys (:424-459). Its hold numbers are in
-- \`scripts/blast_zone_anim.txt\` (:19-31), its record is
-- \`weapons/blast_zone_WEAP.wep\`.
--
-- The weapon is the Health Zone's round: the same WA standard missile (PX's two
-- records differ in two fields only -- \`handling.remember_selection\` and the name -- both fire
-- type 1, method 3, animation 2: a tracking bazooka shell) with PX's
-- \`blast_zone_bullet.png\` drawn over it. On impact it leaves a 45x45 zone
-- (:374) that, once every five frames while it is awake, explodes once if
-- anything is inside it (:328-341):
--
--   * 30 push and 30 damage -- PX's \`DoExplosion(x, y, PushPower, Damage, 0,
--     Team)\` (\`Boom\` :285-287, the numbers from \`ExplodeAt\` :375). Firing it at
--     your own feet is the mistake PX built it for: the thrower is inside the
--     box, so it goes off on the thrower;
--   * a mine that triggered the boom is armed with a random 1-5 second fuse
--     instead of merely being caught (:288-303).
--
-- It booms, then waits to be re-armed: PX sets \`worknow = false\` and re-arms on
-- \`blast_zone->active == false\` (:328-346), the \`CWZone\`'s own flag -- a class
-- that is not in the repo, and one that may well go false and true again inside
-- one turn. The port re-arms while the object sleeps, so at most one boom a turn
-- (ASSUMPTIONS A11). It lives 1..5 turns, set with the 1..5 keys (:429-459). The
-- shared machine is \`lib/px_zone.lua\`.
--
-- Its three rotated explosions are the engine's quads, additively blended, with
-- PX's own team colour (:263-274) -- the one place in this bundle where the
-- colour comes from PX's table rather than from a tint of ours. The slot in that
-- table is the thrower's **colour index**, \`worm.alliance\` (0 red to 5 cyan,
-- \`crates/lua-host/src/api.rs:1105\`); the engine will not hand Lua a team's RGB
-- -- it exposes the slot the match drew the worm in -- so PX's six default
-- values are used for it, and they are the six WA ships with.
--
-- Art/timing verified against weapon_zones.pxl, p_animation.pxl and
-- pxparticles.pxl in the 28.09.2026 PX build. Trails and animation use the
-- existing drawing API; lib/px_zone_fx.lua keeps cosmetic RNG separate.
-- Visual expiry fades for three game seconds, independent of render rate.
--
-- A component's file, and anything it requires, runs where \`wa\` does not exist
-- yet: this module is pure data at load and touches \`wa\` only in \`install\`.

-- Whether the profile placed this component on a panel slot (REPORT.md 11.13):
-- a slot-less registration takes the match down at turn start.
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

  -- PX's numbers (\`zone_launchers_script.txt\`).
  local TURNS_MIN, TURNS_MAX = 2, 6 -- the 1..5 keys give 2..6 turns (:429-459)
  local TURNS_DEFAULT = 3           -- \`BlastTurns = 3\` (:35)
  local FPS = 5                     -- \`fps = 5\` (:248): a tick every 0.1 s
  local RADIUS = 22.5               -- \`CWZone(x, y, 45, 45, ...)\` (:374)
  local PUSH, DAMAGE = 30, 30       -- \`CBlast(number, x, y, 30, 30, ...)\` (:375)
  -- \`RandomInt(1000, 5000)\` (:297) -- PX's fuse is in milliseconds, and so is
  -- \`arm\`'s (\`crates/lua-host/src/actor.rs:1959\`, \`fuse_ms\`). The dev's own
  -- retelling of this line stops one short of five seconds
  -- (\`mods/px/weapons/electromagnet.lua:64\`, \`wa.random(1000, 4999)\`); followed
  -- here, because a millisecond is not observable and his is the working one.
  local MINE_FUSE_MIN, MINE_FUSE_MAX = 1000, 4999

  -- The explosion, PX's \`pyroman_explosion\` (\`bz_exp.png\`, 10 frames of 150x150)
  -- at \`scale = 0.5\` (:260): 75 pixels, drawn three times, once per rotation
  -- (:259, :279, :281).
  local EXP_FRAMES = 10
  local EXP_SPEED = 35 -- normalized phase increment = speed/1000 per frame
  local EXP_SIZE = 75
  local ROTATIONS = { math.pi / 2, math.pi / 4, -math.pi / 4 }
  -- PX's \`ZoneParams->ZPlane\` is set once, by the health zone (:106), and his
  -- \`CBlast\` reuses the same \`ZoneParams\` without touching it (:252-277): the
  -- explosion is drawn on the zone's plane, behind the worms.
  local EXP_DEPTH = wa.depth.WORMS + 1

  -- PX's team colours for the explosion (:263-274), red to cyan. Team 0 and
  -- anything past 6 (impossible in WA, whose teams are 1..6) take red. The slot
  -- is the drawing worm's **colour index** -- \`worm.alliance\`, 0 red to 5 cyan
  -- (\`crates/lua-host/src/api.rs:1105\`, read from the team record's colour byte at
  -- \`crates/lua-host/src/actor.rs:1581-1584\`) -- not its team number, so a scheme
  -- that gave team 2 the red colour still gets PX's red. With WA's default
  -- colours the two numberings agree, which is why PX's table reads as teams.
  local TEAM_COLOURS = {
    [1] = 0x55D21400, [2] = 0x550014DC, [3] = 0x5500DC00,
    [4] = 0x55FADC00, [5] = 0x55DC00DC, [6] = 0x5500E6E6,
  }

  -- PX's module state: \`BlastTurns\` (:12, :35). The keys below change it for the
  -- rest of the match, as PX's do.
  local turns = TURNS_DEFAULT
  local digit_held

  -- The thrower, PX's \`ClWT\`/\`ClWN\` (:521-522): the flight actor's owner, and
  -- the team the explosion is drawn in.
  local shooter

  -- **PX's \`CBlast::Boom\` (:285-303).** \`a:explode\` is the engine's own
  -- CreateExplosion -- a real crater, push and damage -- and \`id\` is PX's push,
  -- as the Bunker Buster and the Attack Helicopter read it. One throwaway actor
  -- per blast, because an explosion may take its actor with it
  -- (\`crates/lua-host/src/actor.rs\`, "actor:explode"; the same shape as
  -- \`mods/px/lib/px_bunker.lua:198-203\`).
  local function boom(z, obj)
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
  end

  -- PX's \`backwards = true\`, \`loop = true\` at \`speed = 35\` (:254-257): his ten
  -- frames run out and back, for as long as the zone lives. Stepped here, once
  -- a world frame, rather than in the draw, so the frame is the same on every
  -- peer and in a replay whatever the renderer is doing.
  local function animate(z)
    z.frame = fx.frame(z.timer, EXP_SPEED, EXP_FRAMES)
  end

  -- PX's \`CBlast\`, through the shared machine: a 45x45 box, a tick every 0.1 s,
  -- one explosion per waking, and the species list from :334.
  local EXP_SHEET = ART .. "exp.png"
  local ZONES = zone.register({
    name = "Blast Zone",
    fps = FPS,
    radius = RADIUS,
    half_height = RADIUS,
    kinds = { worm = true, oil = true, mine = true, crate = true, arrow = true, missile = true },
    one_shot = true,
    fade_frames = fx.FADE,
    frame = animate,
    tick = boom,
    draw = function(z)
      local colour = fx.faded(TEAM_COLOURS[(z.colour or 0) + 1] or TEAM_COLOURS[1], z)
      for _, angle in ipairs(ROTATIONS) do
        -- CAnimation emits floor(150/15 * 35/100) = three additive copies.
        for _ = 1, 3 do
          zone.mark(EXP_SHEET, z.x, z.y, EXP_SIZE, angle, colour, "add", EXP_DEPTH, z.frame)
        end
      end
    end,
  })

  -- PX's in-match keys (:424-459): 1..5 set the turns, to 2..6. PX gates each
  -- behind two presses (\`SH_pressing\`, :428); here one press acts, on the key's
  -- edge, which is what PX's gate stands in for, as in the Health Zone.
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
    -- Report the duration the zone actually receives.
    return "Blast Zone: explodes for " .. turns .. " turns  (1-5 turns)"
  end)

  -- **The round in flight, drawn and turned by hand.** PX's \`WeapSprite\` with an
  -- empty \`WeapSpriteParams\` (\`blast_zone_anim.txt:36-49\`) leaves WA's sprite 0
  -- and draws PX's \`blast_zone_bullet.png\` on the missile, turned by the
  -- record's own animation type: \`+0x64\` is 2, the track-movement type, a
  -- bazooka shell facing its flight (\`highlander_0rang3_test/lib/missile_sprites.lua:22-25\`).
  fx.flight("px.blast_zone")
  sb.flight(ctx, {
    weapon = "px.blast_zone",
    sheet = ART .. "bullet.png",
    anim = "track",
    z = wa.depth.OBJECTS - 1,
    mirror = true,
    owner = shooter,
  })

  -- **The worm's aim and pick art**, PX's sprite-builder split in two, with
  -- PX's own hold numbers (\`blast_zone_anim.txt:19-31\`): \`hand_type\` 3 (the
  -- upper hand), \`hand_rotation\` 0.5, \`hand_radius\` 4, \`hand_radial_rotation\` 0,
  -- \`hand_scale\` 0.8. He leaves \`weap_radius\`, \`weap_rotation\` and
  -- \`weap_radial_rotation\` at \`CWormAnimParams\`' defaults -- 1.0 each
  -- (\`worms_anims_script.txt:80-90\`) -- which is what the HoldSpec defaults are
  -- too, so only the four he set are named here.
  local hold = {
    sheet = ART .. "hold.png",
    hand = sb.PX_HANDS[3], -- hand_type 3: the upper hand
    hand_radius = 4.0,
    hand_rotation = 0.5,
    hand_radial_rotation = 0.0,
    hand_scale = 0.8,
    frames = 1, -- one bomb, turned by the engine's hold to the aim
    thrown = true,
    -- Gone on space, as PX's: no \`FSprite\` firing sprite, so his \`sprite = 0\`
    -- (\`worms_anims_script.txt:263\`, :419-422).
    keep_while_firing = false,
  }

  local spec = {
    -- PX's own record for this weapon, byte for byte: the same bazooka missile
    -- the Health Zone carries.
    wep = "weps/blast_zone_wep.wep",
    panel_icon = ART .. "icon.png", -- PX's own (bz_ico.png)
    sprite = "missile",
    worm_sprites = sb.PX_POSTURE,
    hold = hold,
    -- The flight sheet for the flight actor, the explosion strip for the zone's
    -- three quads. The hold sheet comes in through \`hold\` itself.
    sprites = { ART .. "bullet.png", ART .. "exp.png" },
    params = { gpu_prefix = ART },
    -- PX's \`ExplodeAt\` (:370-376), after WA's own impact -- and the record has
    -- nothing of its own: explosion power 0, as the Health Zone's.
    on_explode = function(ev)
      ZONES.place(ev.x, ev.y, {
        turns = turns, owner = shooter,
        -- \`worm.alliance\` is the colour index (0 red to 5 cyan), taken now so
        -- the draw never reads a worm that has since died.
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
        content: `-- Bunker Buster / Super Bunker Buster -- Worms Reloaded's air-strike drill,
-- rebuilt for WormForge API 4. PX's own version is
-- PX_pending/bunker_buster/scripts/bunkerbuster.txt; every number below cites
-- a line of it.
--
-- PX: an air strike (\`CWorm::FireFinal\`, :631-653) whose bomb is a mine-bodied
-- object, \`PxBunkerBuster : CMine\` (:106), dropped by a plane standing still
-- (\`BombSpX/SpY = 0\`, :637-638). The body falls on WA's gravity
-- (\`GravityFactor = 1\`, :255). Touching land switches it to drilling
-- (\`Collide\` -> \`StartDigging\`, :305-318): gravity off (:238), a direction and
-- a speed per frame (\`SpX = DirX * DrillSpeed\`, :497-498), terrain cut with
-- WA's own drill masks (\`ApplyMask(1, ...)\` at the body and \`ApplyMask(13, ...)\`
-- at two side offsets, :508-510), fuel spent per pixel drilled (:516), and
-- WA's own drill hole as it goes -- the pneumatic drill's mask, by PX's own
-- comment (:496). Out of land ahead it falls again (:530-537); out of fuel it
-- blows up (:523-527), as it does on touching anything that is not land
-- (:320-323, its \`ColGroupDigging\`, :185-196).
--
-- The port keeps its playtested drill speed and time budget, with PX's magnetic
-- response restored through the shared wa.magnetism service:
--
--   * the fall: WA's gravity from above the level, at the click's x --
--     PX's plane drop, minus the plane;
--   * the drill: a fixed-speed step along its direction. PX's global field
--     contributes at 0.4 strength (:427), capped to 0.1 while drilling (:204,
--     :442-446), then blended as normalize(10 * direction + 3 * force)
--     (:128, :449-452). The force changes heading, never drill speed;
--   * the hole: \`wa.land.cut{ shape = "drill" }\`, WA's own drill mask, which is
--     the shape PX's masks 1 and 13 make (super_drill.lua:17, cut_lab.lua:12).
--     PX cuts only while drilling (:508-510); the port cuts every 10 frames
--     whatever the body is doing, so a buster that has fallen into a wall gets
--     its hole cut for it instead of sitting there (seen stuck in match);
--   * the "limited distance": PX's \`DrillFuelAmount = 880\` (:124) spent per pixel
--     (:516). The port keeps its existing 300/450 drilling-frame budgets,
--     so the clock ticks only while the drill is going:
--     it pauses when the buster falls and carries on when it hits again, and is never
--     refreshed by a penetration (which is what let it dig without end);
--   * leaving the land: PX probes 10 px ahead of the body with its collision
--     mask (:530) and falls when there is no land there. The port runs a line
--     at each edge of the body instead (the request's "line check on both
--     edges"), and keeps drilling while either edge still has land;
--   * the detonation: fuel out (:523-527), or touching a worm, crate, oil drum
--     or mine (:320-323). WR's list is worm, crate and barrel; mines are PX's
--     own addition to it;
--   * the blast: the plain buster one, the super five, stepped 8 frames apart
--     along the line across the drill (\`ExplosionDistance = 40\`,
--     \`ExplosionDeltaTime = 8\`, :138-139, :393-416). Blast and damage are PX's
--     (:148-149, :159-160). The five blasts are WR's "horizontal flare that
--     cuts sideways through the terrain", made of blasts;
--   * the super's fire: PX's \`CFireDesc\` (:31-36) -- a one-flame fire every
--     4..10 frames while drilling (:472-494), and a six-flame fire at each
--     blast (:330-339).
--
-- What the API cannot carry (presentation only; REPORT.md 9.3):
--   * the drilling flames' full throw. PX throws each up the shaft at 5..15 a
--     frame within 45 degrees of the drill (:480-486); the port tosses it
--     gently (FIRE_TOSS), from just above the body, into the open shaft. Left
--     at the body with \`wa.fire.spawn\`'s default fall, flames lay against the
--     land being drilled, and one caught on the shaft's wall over nothing held
--     a turn forever (the engine now puts such a flame out);
--   * the smoke and dust particles (:555-606);
--   * a sound that can be **stopped**. \`wa.sound.play\` and \`a:sound\` can neither
--     loop nor stop, and PX's drill wav (20.95 s -- an impact, then a long drill, with
--     no loop point in it) played once left the drilling going long after the buster
--     was gone -- in match, through every later shot. The port cuts that wav into an
--     impact piece and five loop pieces of 105 whole frames
--     (\`porting-analysis/tools/split_wav.py\`), plays the impact on **every** entry
--     into the land and the loop pieces in order while drilling, and stops playing
--     when the digging stops. The Attack Helicopter's rotor is the same idea with one
--     piece (\`weapons/attack_helicopter.lua:71,410\`);
--   * the \`space\` early detonation (:655-676) -- no such key is exposed;
--
-- Girders: the trace has no girder kind, so a girder in the path is simply
-- passed through -- which is WR's "burrows through terrain and girders".
--
-- A component's file, and anything it requires, runs where \`wa\` does not exist
-- yet: this module is pure data at load and touches \`wa\` only in \`install\`.
--
-- The two weapons are independent: each has its own component, record, sprites,
-- sounds and numbers, and a component that is in **no** panel slot registers
-- nothing (\`placed\` below), so either can be placed on its own -- and one of the
-- two unplaced does not take the match down with it.

-- Whether the profile placed this component on a panel slot.
--
-- A component that is in **no** slot must not register a weapon: the engine
-- builds one for every registration, and a slot-less weapon takes the match
-- down at turn start ("converting Lua nil to table" -- the panel cell it looks
-- up is nil). With two weapons in one bundle that is the difference between
-- placing either alone and a hard crash, so this asks first.
--
-- The placed set is the loader's own: \`ctx.placed\`, the placed weapons in slot
-- order, each \`{ id, position }\` (\`tools/audit/audit.lua:39-41\`,
-- \`highlander components/highlander.lua:16-17\`), and \`ctx.weapons\`, the same
-- ids as keys (\`highlander components/loader.lua:91\`). Either listing this
-- component is enough; only when a field is there and neither lists it is the
-- component in no slot. A context with neither field registers as before, so
-- nothing is lost if the fields move.
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
  -- In no slot: no weapon, no art, no sound. The other component of the bundle
  -- is unaffected -- each carries its own record, sprites and sounds, and reads
  -- nothing the other leaves behind.
  if not placed(ctx) then
    wa.log(("Bunker Buster: %s is in no panel slot; nothing registered"):format(ctx.id))
    return
  end

  -- Which of the two this component is. Both share this file and this one entry
  -- point; their record, art, numbers and fire are each their own.
  local super_buster = ctx.id == "px.super_bunker_buster"
  local ART = "sprites/" .. (super_buster and "super_bunker_buster/" or "bunker_buster/")
  local SND = "sounds/bunker_buster/" -- both weapons' sounds, PX's two wavs

  -- PX's drill sound, cut in six (REPORT.md 11.14, \`porting-analysis/tools/split_wav.py\`).
  -- PX plays one 20.95 s wav -- an impact, then a long drill with no loop point in it -- and
  -- re-plays it every 15 s while digging (\`:240\`, \`:609-624\`); \`a:sound\` can neither loop nor
  -- stop a sound, so playing it once ran the drilling on long after the buster was gone, and
  -- through every later shot.
  --
  -- The pieces are cut for the game's own frame rate, which is **50 fps** -- not 60, which cost
  -- this weapon one round of "the sound cuts, every time": PX's helicopter rotor, the one loop
  -- that has always been inaudible, is 0.9155 s of audio re-triggered every 47 frames
  -- (\`weapons/attack_helicopter.lua:71,410\`), which is 0.94 s at 50 fps (24 ms short of the
  -- audio, inaudible) and 0.78 s at 60 fps (the audio cut by 132 ms a cycle). A piece cut for the
  -- wrong rate is cut short by that rate's error on every cycle, which is exactly what was heard.
  --
  -- The wav's own period is 1.75 s, and at 50 fps the nearest whole frame count is 88 (1.76 s,
  -- 10 ms over the period, so five pieces wrap within 50 ms of phase). So the first 10.56 s cuts
  -- into an **impact** piece and five loop pieces of 88 frames each, at exact frame boundaries
  -- with no snapping: played in order they are the original sample for sample.
  local IMPACT_SOUND  = "bunkbustdrill_impact.wav"
  local LOOP_SOUNDS   = { "bunkbustdrill_loop1.wav", "bunkbustdrill_loop2.wav",
                          "bunkbustdrill_loop3.wav", "bunkbustdrill_loop4.wav",
                          "bunkbustdrill_loop5.wav" }
  local IMPACT_FRAMES = 88 -- the impact piece's own length, and the wait before the loop
  local LOOP_FRAMES   = 88 -- every loop piece is the same 1.76 s, so the same wait

  -- PX's numbers, by line in bunkerbuster.txt.
  local R          = 8      -- the collision circle, CColMask(8, 8, MakeCircleMask(8)) (:38)
  local SKY        = -128   -- the drop height above the level (PX's PlaneAppearYOffset; bowling_ball.lua:16)
  -- The port's existing playtested speed. PX randomizes 0.5..2.0 every few
  -- frames (:463-467); magnetic steering changes direction, not this speed.
  local DIG_SPEED  = 1.15
  local MAGNET_SHARE, MAX_DRILL_FORCE, DIG_MAGNET_FACTOR = 0.4, 0.1, 3
  -- PX's "limited distance" is a fuel amount (\`:124\`, spent per pixel at \`:516\`); the port counts
  -- **frames of drilling** instead, using its existing 300/450-frame clocks. Each ticks
  -- only while the body is actually drilling, so it pauses when the buster falls (past a girder,
  -- out of a cave roof) and carries on when it hits again, instead of starting over. It is not
  -- refreshed on a penetration, which is what let a buster dig without end.
  local DIG_FRAMES = super_buster and 450 or 300
  -- The drill mask, cut every MASK_EVERY frames whether the body is drilling or still falling.
  -- PX cuts only while drilling (:508-510); cutting on the way down as well means the body can
  -- never come to rest inside land with no hole to move in -- a buster that fell into a wall was
  -- seen stuck, because the drill starts only when the tip's line finds land (:317). While
  -- drilling, cuts are DIG_SPEED * MASK_EVERY = 15 px apart, which the drill cut spans.
  local MASK_EVERY = 3
  local EDGE       = 6      -- the two probe lines, within the tunnel's edge
  local LOOKAHEAD  = 13     -- PX probes 10 px ahead of the body (:530)
  local ANIM_SPEED = 0.08   -- AnimSpeed (:136) over AnimCycleDuration 1.0 (:172)
  local FRAMES     = 3      -- each sheet is a 3-frame strip (LoadSprite(f, 3, 0), :42-51)
  local SINK, SUNK = 2, 200 -- sinking out of sight in the water (electromagnet.lua:184-188)
  local FIRE_MIN, FIRE_MAX = 4, 10    -- DrillFireMinDelta/MaxDelta (:163-164)
  local EXPL_DIST  = 40     -- ExplosionDistance (:139)
  local EXPL_DELTA = 8      -- ExplosionDeltaTime (:138)
  local NUM        = super_buster and 5 or 1    -- NumExplosions (:147, :158)
  local BLAST      = super_buster and 80 or 100 -- ExplosionBlast (:148, :159)
  local DAMAGE     = super_buster and 26 or 38  -- ExplosionDamage (:149, :160)
  local FIRE       = { duration = 1000, up_power = 15, damage = 1 } -- CFireDesc (:33-35)
  -- The drilling flame's toss, pixels a frame: up 1..2, drifting at most 0.5
  -- either way. PX's own throw (5..15, :480-486) is far stronger.
  local FIRE_TOSS  = { up_min = 100, up_max = 200, drift = 50 } -- hundredths
  
  local busters = {} -- body actor id -> state

  -- PX's DoExplosion (:326-340): a real WA blast at the point, and for the super
  -- a six-flame fire there. \`id\` is PX's \`ExplosionBlast\`, as the Highlander's
  -- Electromagnet reads it (weapons/electromagnet.lua:198, \`BOOM\`).
  --
  -- One throwaway actor per blast: \`a:explode\` is the actor's own explosion and
  -- may take it with it (the Attack Helicopter guards its companions on
  -- \`a.dead\`, weapons/attack_helicopter.lua:181), so a five-blast sequence
  -- cannot come out of one actor.
  local function blast(m, x, y)
    local b = wa.actors.spawn({ sprite = ART .. "idle.png", x = x, y = y,
      gravity = false, collide = false, owner = m.owner, on = function() end })
    b:scale(0)
    b:explode({ damage = DAMAGE, id = BLAST, below = false })
    if not b.dead then b:despawn() end
    if super_buster and m.owner then
      wa.fire.spawn({ owner = m.owner, x = x, y = y, count = 6,
        duration = FIRE.duration, up_power = FIRE.up_power, damage = FIRE.damage })
    end
  end

  -- PX's SetDirection (:287-301), including its zero-speed fallback.
  local function direction(m, dx, dy)
    local length = math.sqrt(dx * dx + dy * dy)
    if length < 0.0001 then m.dir_x, m.dir_y = 0, 1
    else m.dir_x, m.dir_y = dx / length, dy / length end
  end

  local function remove(m)
    busters[m.body.id] = nil
    if not m.body.dead then m.body:despawn() end
    if m.glow and not m.glow.dead then m.glow:despawn() end
  end

  -- PX's Explode (:270-285): the drill stops, then the blasts come out over the
  -- following frames (:393-416). PX draws nothing once Dead (:347), so the body
  -- art goes.
  local function boom(m)
    if m.boom then return end
    m.boom, m.dig, m.vy, m.num, m.timer = true, false, 0, 0, 0
    m.body:scale(0)
    if m.glow then m.glow:scale(0) end
  end

  -- Where the drill probes: a line at one edge of the body, from its tip
  -- LOOKAHEAD down (PX's FindInMask probe, :530).
  local function land_ahead(m, edge)
    local x = m.x + m.dir_x * R + m.dir_y * edge
    local y = m.y + m.dir_y * R - m.dir_x * edge
    return wa.land.trace(x, y, x + m.dir_x * LOOKAHEAD, y + m.dir_y * LOOKAHEAD) ~= nil
  end

  -- PX's Collide on anything that is not land (:320-323): its \`ColGroupDigging\`
  -- is worms, crates, oil drums and mines (:185-196). The body's own circle,
  -- swept along the step, so a fast fall cannot step over a worm.
  local function touched(x0, y0, x1, y1)
    local res = wa.world.trace({ x0 = x0, y0 = y0, x1 = x1, y1 = y1, radius = R,
      with = { "worms", "crates", "oil", "mines" } })
    return res and res.hit
  end

  local function frame_of(m)
    return function(a)
      -- ------------------------------------------------------------- blasts
      if m.boom then
        if m.num >= NUM then remove(m) return end
        if m.timer <= 0 then
          local d = EXPL_DIST * m.num
          -- PX's flare stays perpendicular to the steered drill (:406-409).
          blast(m, m.x + m.dir_y * d, m.y - m.dir_x * d)
          if m.num > 0 then blast(m, m.x - m.dir_y * d, m.y + m.dir_x * d) end
          m.timer, m.num = EXPL_DELTA, m.num + 1
        end
        m.timer = m.timer - 1
        return
      end

      -- -------------------------------------------------------------- water
      -- PX's mine sinks and tints blue (:349-351); nothing left to drill for.
      if m.y >= wa.world.water() then
        m.sunk = true
        m.y = m.y + SINK
        a.x, a.y = m.x, m.y
        a:gfx({ tint = 0x5A5AF0 }) -- PX's sink tint, RGB(90, 90, 240) (:349-351)
        if m.y >= wa.world.water() + SUNK then remove(m) end
        return
      end

      -- ------------------------------------------------------ drill or fall
      local px, py = m.x, m.y
      local fx, fy, inside = wa.magnetism.sample(m.x, m.y, a)
      fx, fy = fx * MAGNET_SHARE, fy * MAGNET_SHARE
      -- PX's small sideways tie-breaker in a live field (:429-431).
      if inside and fx == 0 then fx = 0.01 end
      if m.dig then
        local force = math.sqrt(fx * fx + fy * fy)
        if force > MAX_DRILL_FORCE then
          fx, fy = fx * MAX_DRILL_FORCE / force, fy * MAX_DRILL_FORCE / force
        end
        direction(m, 10 * m.dir_x + DIG_MAGNET_FACTOR * fx,
          10 * m.dir_y + DIG_MAGNET_FACTOR * fy)
        if not land_ahead(m, -EDGE) and not land_ahead(m, EDGE) then
          -- No land ahead at either edge: fall again (PX's StopDigging, :530-537).
          m.dig = false
          local speed = DIG_SPEED * (1 + 2 * (1 - m.dir_y)) -- PX's exit nudge
          m.vx, m.vy = m.dir_x * speed, m.dir_y * speed
        else
          m.vx, m.vy = m.dir_x * DIG_SPEED, m.dir_y * DIG_SPEED
          m.x, m.y = m.x + m.vx, m.y + m.vy
          m.dig_time = m.dig_time - 1                  -- the drill's clock, ticking (see DIG_FRAMES)
          if m.dig_time <= 0 then boom(m) return end   -- PX: out of fuel -> explode (:523-527)
          -- PX's StartDigging sound (:240), in the two halves the wav is made of: the loop
          -- piece under the drill, one piece per LOOP_FRAMES so the audio is continuous
          -- through a drill and nothing is heard to stop when it ends.
          m.snd_timer = m.snd_timer - 1
          if m.snd_timer <= 0 then
            a:sound(SND .. LOOP_SOUNDS[m.piece])
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
        -- Falling: WA's gravity while the land is clear (PX's GravityFactor 1,
        -- :255). The tip's own path is the line traced, so a step of any size
        -- meets the first land it crosses. PX's Collide -> StartDigging (:317).
        m.vx, m.vy = m.vx + fx, m.vy + wa.world.gravity() + fy
        direction(m, m.vx, m.vy)
        local nx, ny = m.x + m.vx, m.y + m.vy
        local tip_x, tip_y = m.dir_x * R, m.dir_y * R
        local hit = wa.land.trace(m.x + tip_x, m.y + tip_y, nx + tip_x, ny + tip_y)
        if hit then
          m.x, m.y = (hit.x or nx + tip_x) - tip_x, (hit.y or ny + tip_y) - tip_y
          m.dig, m.fire_timer = true, 0
          -- PX's StartDigging sound (:240) is the wav's own impact, and it plays on
          -- **every** entry into the land: the first drop, and each time a drill that ran out
          -- of land (a girder, a cave roof) fell and struck something again. The loop then
          -- starts again at its first piece, so the drill's own audio picks up where it left.
          a:sound(SND .. IMPACT_SOUND)
          m.piece, m.snd_timer = 1, IMPACT_FRAMES
        else
          m.x, m.y = nx, ny
        end
      end

      -- The drill mask, on every MASK_EVERY frames and whether or not the body is drilling
      -- (see the constant). Only where there is land to cut: the body, or the tip -- a tip
      -- inside land with the body still above it is the falling case, and cutting there opens
      -- the hole before the body is in, which is what it is for.
      m.mask_timer = m.mask_timer - 1
      if m.mask_timer <= 0 then
        m.mask_timer = MASK_EVERY
        if wa.land.solid(m.x, m.y) or wa.land.solid(m.x + m.dir_x * R, m.y + m.dir_y * R) then
          wa.land.cut({ x = m.x, y = m.y, shape = "drill" }) -- PX's masks 1 and 13 (:508-510)
        end
      end

      -- Anything else it touched on the way blows it up (PX :320-323).
      if (px ~= m.x or py ~= m.y) and touched(px, py, m.x, m.y) then boom(m) return end

      -- ------------------------------------------------------------- drawing
      a.x, a.y = m.x, m.y
      local sheet = m.dig and (ART .. "digging.png") or (ART .. "idle.png")
      if sheet ~= m.sheet then
        a:look(sheet)
        m.sheet = sheet
      end
      m.anim = (m.anim + ANIM_SPEED) % 1.0 -- PX's AnimCycle (:423-424)
      a:frame(math.min(FRAMES - 1, math.floor(m.anim * FRAMES)))
      local angle = -math.deg(wa.math.atan(m.dir_x, m.dir_y)) -- PX's UpdateRotation
      a:gfx({ angle = angle, depth = wa.depth.OBJECTS + 2 }) -- PX's z 10.01, behind the worms
      if m.glow then
        -- PX's glow (SpriteGlow, :378-385): PX's z 10, in front of the body,
        -- additive, tinted RGB(255, 70, 0).
        m.glow.x, m.glow.y = m.x, m.y
        m.glow:gfx({ angle = angle, depth = wa.depth.OBJECTS + 1, blend = "add", tint = 0xFF4600 })
      end
    end
  end

  -- PX's plane drop, less the plane: one buster at the click's x, standing
  -- still above the level, on WA's gravity.
  local function drop(worm, x, y)
    wa.sound.play(worm, SND .. "bunkbustfall.wav") -- PX's fall sound (:202)
    local m = { x = x, y = SKY, vx = 0, vy = 0, dir_x = 0, dir_y = 1,
      dig_time = DIG_FRAMES, dig = false, boom = false,
      num = 0, timer = 0, anim = 0, fire_timer = 0, sunk = false, owner = worm,
      mask_timer = 0, snd_timer = 0, piece = 1 } -- both timers fire on the first frame they can
    m.body = wa.actors.spawn({
      sprite = ART .. "idle.png", x = x, y = SKY, vx = 0, vy = 0,
      gravity = false, collide = false, owner = worm, as_object = true,
      on = frame_of(m),
    })
    if super_buster then
      m.glow = wa.actors.spawn({ sprite = ART .. "glow.png", x = x, y = SKY,
        gravity = false, collide = false, owner = worm, on = function() end })
    end
    busters[m.body.id] = m
    return m
  end

  local sprites = { ART .. "idle.png", ART .. "digging.png" }
  if super_buster then sprites[#sprites + 1] = ART .. "glow.png" end

  -- The registration. Built in a local first: the \`handling\` line below then
  -- reads as the Highlander's own claims do (\`the weapon module's record.handling.ends_turn\`).
  local spec = {
    -- The slot is the profile's. The record is PX's own for this weapon (name
    -- "Bunker Buster", a native air-strike record): as the Lightning Strike does
    -- with PX's \`napalm_strike.wep\` (weapons/lightning_strike.lua), the click-only
    -- shape below means the worm never fires the record and the engine runs no
    -- stock plane from it. One record per slot, as PX's own pack does
    -- (\`weps/<slot>.wep\`), so neither weapon needs the other placed: the Super
    -- gets its own copy of the record, because PX's own super record
    -- (\`super_bunkerbuster_wep_broken.wep\`) is broken.
    wep = super_buster and "weps/super_bunker_buster.wep" or "weps/bunkerbuster_wep1.wep",
    panel_icon = ART .. "icon.png", -- PX's own icon (ico_bunkerbuster.png / ico_superbunkerbuster.png)
    -- One vertical PNG strip per PX sprite; playback is declared in mod.toml.
    sprites = sprites,
    params = { gpu_prefix = "sprites/" },
    -- The bundle's sounds, by path: this list is the declaration, the way \`sprites\` is
    -- (the drill was silent until it named the loop pieces -- a wav that is not named here
    -- does not play, and a name here that is not in the bundle does not load). The impact
    -- first, then the loop in order: \`LOOP_SOUNDS\` as the table spells them.
    sounds = { SND .. IMPACT_SOUND, SND .. LOOP_SOUNDS[1], SND .. LOOP_SOUNDS[2],
      SND .. LOOP_SOUNDS[3], SND .. LOOP_SOUNDS[4], SND .. LOOP_SOUNDS[5],
      SND .. "bunkbustfall.wav" },
    -- Click-only dispatch keeps the strike's cursor and turn handling, exactly
    -- as the Lightning Strike: \`on_select.cursor\` overrides the record's own
    -- aim mode, and there is no \`on_fire\` and no \`eat_fire\` -- an eat would
    -- also swallow the turn end (REPORT.md 11.7).
    on_select = { cursor = true },
    on_click = function(ev)
      -- WR's Bunker Buster is unavailable on cave maps: there is no sky to drop
      -- from. The shot is already spent; nothing falls.
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
        content: `-- Health Zone -- Project X's zone launcher, ported to WormForge API 4.
--
-- PX's source is \`PX_pending/weapon_zones/scripts/zone_launchers_script.txt\`:
-- the \`CHealthZone\` class (:71-230), the missile's \`ExplodeAt\` that places the
-- zone (:377-384), and the in-match keys (:462-511). Its hold numbers are in
-- \`scripts/health_zone_anim.txt\` (:21-32), its record is
-- \`weapons/health_zone_WEAP.wep\`.
--
-- The weapon: WA's own standard missile (record \`+0x30\` fire type 1, \`+0x38\`
-- method 3, \`+0x64\` 2 -- track movement, a bazooka shell's flight) with PX's
-- \`health_zone_bullet.png\` drawn over it, which on impact leaves a zone. The
-- zone lasts \`turns\` turns and, once a second while it is active, acts on the
-- one object inside it:
--
--   * healing: configurable health to that worm, or a grave resurrected at 1 health
--     (\`AddHealth\`, :134-165);
--   * damaging: -1 health, never below 1 (\`DamageHealth\`, :118-132).
--
-- The other half of the zone's life -- its turns, its seven seconds of
-- inactivity after a turn ends, and the box it watches -- is PX's \`CWZone\` and
-- \`CHealthZone\` machinery, which the Security Grenade's sibling weapons share:
-- \`lib/px_zone.lua\`. The Blast Zone (\`lib/px_blast_zone.lua\`) and the Spot Hider
-- (\`lib/px_spot_hider.lua\`) are the same machine with other payloads.
--
-- The worm's aim art is the shared weapon-less library
-- (\`lib/px_sprite_builder.lua\`, \`PX_POSTURE\`) with PX's one held PNG over it,
-- exactly as \`health_zone_anim.txt\` states it (\`hand_type\` 3, the upper hand).
--
-- Art and particle parameters verified against weapon_zones.pxl, p_animation.pxl
-- and pxparticles.pxl in the 28.09.2026 PX build. Original stock strips are
-- bundled as GPU sheets; lib/px_zone_fx.lua reproduces the cosmetic particles.
-- Fuel and poison effects remain outside this visual/settings pass.
-- PX's stock animation is drawn in full colour, with its colour wash layered
-- using alpha (the quad API does not expose PX blend mode 6). Fade uses three
-- game seconds, as the source comment intends, instead of render-call counts.
--
-- A component's file, and anything it requires, runs where \`wa\` does not exist
-- yet: this module is pure data at load and touches \`wa\` only in \`install\`.

-- Whether the profile placed this component on a panel slot (REPORT.md 11.13):
-- a slot-less registration takes the match down at turn start.
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

  -- PX's numbers (\`zone_launchers_script.txt\`).
  local turns = ctx.option("turns")
  local healing_per_minute = ctx.option("healing_per_minute")
  local FPS = 50                    -- a tick a second, \`fps = 50\` (:87)
  local MIN_HP = 1                  -- \`minHP\`: a damaging zone never kills (:89)
  local RADIUS = 20                 -- \`CWZone(x, y, 40, 30, ...)\`: a 40x30 box (:382)
  local HALF_HEIGHT = 15
  local ROTATION = math.pi          -- \`ZoneParams->rot = 180\` (:103)
  local ZONE_SIZE = 60              -- scale 1 of the PX editor's padded 60px frame
  local ZONE_DEPTH = wa.depth.WORMS + 1 -- PX's \`ZPlane = 16\` (:106): behind worms

  local HEAL_TINT = 0x4164DC64   -- ARGB(65, 100, 220, 100), green (:111)
  local DAMAGE_TINT = 0x41D26464 -- ARGB(65, 210, 100, 100), red  (:112)

  -- Duration comes from the profile; +/- retain PX's mode controls.
  local healing = true
  local plus_held, minus_held

  -- The thrower, PX's \`ClWT\`/\`ClWN\` (:529-530): the flight actor's owner.
  local shooter

  -- PX's \`AddHealth\` (:134-165).
  local function add_health(z, obj)
    if obj.kind == "grave" then
      -- A grave with a bound worm comes back at 1 health (:143-146).
      if obj.worm_id ~= 0 then obj:revive(obj.worm_id, 1) end
    elseif obj.kind == "worm" then
      -- Keep the remainder in integer HP/min units: no fractional native HP,
      -- no floating-point drift, and no healing banked while the zone is empty.
      z.healing_credit = (z.healing_credit or 0) + healing_per_minute
      local amount = math.floor(z.healing_credit / 60)
      z.healing_credit = z.healing_credit % 60
      if amount > 0 then obj:heal(amount) end
    end
  end

  -- PX's \`DamageHealth\` (:118-132).
  local function damage_health(obj)
    if obj.kind == "worm" and obj.hp > MIN_HP then obj:hurt(1) end
  end

  -- Whether PX's \`start_be_inactive\` branch would act on this activator at all:
  -- only a resting one (:209, \`SpX == 0 && SpY == 0\`). A grave here never moves,
  -- so it always passes.
  local function resting(obj)
    if obj.kind == "grave" then return true end
    return (obj.vx or 0) == 0 and (obj.vy or 0) == 0
  end

  -- PX's \`CHealthZone\`, through the shared machine: a 40x30 box, a tick a
  -- second, healing or damaging the one object inside it (:118-229).
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

  -- +/- change mode; the component's duration is frozen with the profile.
  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FIRE_WEAPON then
      if worm.weapon == "px.health_zone" then shooter = worm end
      return
    end
    local keys = worm.turn and worm.weapon == "px.health_zone" and wa.world.keys() or nil
    if keys then
      if keys.plus_key and not plus_held then healing = true end
      if keys.minus_key and not minus_held then healing = false end
      if worm.aiming then fx.aim(worm, healing) end
    end
    -- Held past the weapon's deselect, re-select and press would read as no
    -- edge: the flags track the key even while another weapon is out.
    plus_held = keys ~= nil and keys.plus_key or false
    minus_held = keys ~= nil and keys.minus_key or false
  end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })

  require("lib/weapon_hint").register("px.health_zone", function()
    return (healing and "Health Zone: HEALING" or "Health Zone: DAMAGING")
      .. " for " .. turns .. " turns, " .. healing_per_minute .. " HP/min  (+ heals, - damages)"
  end)

  -- **The round in flight, drawn and turned by hand.** PX's \`WeapSprite\` with an
  -- empty \`WeapSpriteParams\` (\`health_zone_anim.txt:37-47\`) leaves WA's sprite 0
  -- and draws PX's \`health_zone_bullet.png\` on the missile, turned by the
  -- record's own animation type: \`+0x64\` is 2, the track-movement type, a
  -- bazooka shell facing its flight (\`highlander_0rang3_test/lib/missile_sprites.lua:22-25\`).
  fx.flight("px.health_zone", function() return healing end)
  sb.flight(ctx, {
    weapon = "px.health_zone",
    sheet = ART .. "bullet.png",
    anim = "track",
    z = wa.depth.OBJECTS - 1,
    mirror = true,
    owner = shooter,
  })

  -- **The worm's aim and pick art**, PX's sprite-builder split in two: the engine
  -- draws WA's worm from the shared library's weapon-less posture
  -- (\`worm_sprites\`, below), then draws the held vial and its hand over it from
  -- \`hold\`. The numbers are PX's own (\`health_zone_anim.txt:24-30\`):
  -- \`hand_rotation\` 0.5, \`hand_radius\` 4, \`hand_radial_rotation\` 0,
  -- \`hand_type\` 3 (the upper hand), \`weap_radius\` 0 (the vial at the worm's own
  -- centre), \`hand_scale\` 0.8; \`weap_rotation\` and \`weap_radial_rotation\` are left
  -- at PX's defaults, 1.0. One vial PNG, turned and placed by the aim.
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
    thrown = true, -- a thrown round leaves the hand; no put-away animation
    -- Gone on space, as PX's: no \`FSprite\` firing sprite, so his \`sprite = 0\`
    -- (\`worms_anims_script.txt:263\`, :419-422).
    keep_while_firing = false,
  }

  local spec = {
    -- The record is PX's own for this weapon, byte for byte: WA's standard
    -- missile with PX's icon, so the flight is WA's and only the zone is Lua's.
    wep = "weps/health_zone_wep.wep",
    panel_icon = ART .. "icon.png", -- PX's own (hz_ico.png)
    -- Stock WA art for the record itself. PX's record points its sprite at one of
    -- PX's own (id 100000+, which the engine resets); ours is never drawn --
    -- \`sb.flight\` hides it (\`m.sprite = 0\`, \`lib/px_sprite_builder.lua:121\`) and
    -- draws PX's own bullet instead -- but a record wants a sprite WA can
    -- resolve, and a missile is its own kind.
    sprite = "missile",
    worm_sprites = sb.PX_POSTURE,
    hold = hold,
    -- The flight and hold art; fx.install loads the shared zone/particle sheets.
    sprites = { ART .. "bullet.png" },
    params = { gpu_prefix = ART },
    -- PX's \`ExplodeAt\` (:377-384), after WA's own impact (there is no injury: the
    -- record's damage and blast are 0, its bombs are the zone).
    on_explode = function(ev)
      ZONES.place(ev.x, ev.y, { healing = healing, turns = turns, owner = shooter })
    end,
  }
  -- PX's records carry "ends the turn" off (\`the weapon module's record.handling.ends_turn\`), so a
  -- weapon built on one says so itself: the throw ends the turn, as WA's
  -- projectiles do.
  spec.handling = { ends_turn = true }
  wa.weapons.replace(spec)
end

return M
`
      },
      {
        path: 'lib/px_ninja_star.lua',
        name: 'lib/px_ninja_star.lua',
        language: 'lua',
        content: `-- Ninja Star -- Project X's thrown star, on WormForge API 4.
--
-- PX's source is \`PX_pending/weapon_ninja_star/scripts/ninja_star_script.txt\` (123
-- lines) and its record \`weapons/Ninja Star_wep.wep\` (a type-4 record, byte
-- \`+0x0C\` = 4 -- the Javelin's kind). PX's whole weapon is one override of
-- \`CMissile::ExplodeAt\` (\`:19-60\`) plus the routine that stamps the star into the
-- land (\`:82-122\`); the flight, the blast and the blast's own sound are the
-- record's and WA's. So this is the Highlander **Javelin**'s shape
-- (\`highlander_0rang3_test/weapons/javelin.lua:10-66\`, catalog entry
-- \`:229-236\` -- "stock flight, direct thrust or a permanent terrain stamp") with
-- PX's numbers.
--
-- What PX does at the impact, in its order:
--
--   * the first worm, mine, oil drum or crate within a **strict 20 px square**
--     of the impact (\`:25-41\`; \`IsMaterial\` objects only) -- \`NinjaSDamage\`
--     (\`:62-80\`) gives it **10** damage, knocks it to a quarter of the star's own
--     speed (\`SpX/4\`, \`SpY/4\`) and, through the same message, pushes it at half
--     the star's speed;
--   * failing that, the worm whose turn it is within a **strict 25 px square**
--     (\`:43-51\`) -- \`GetCurrentWorm()\` -- the same 10 damage;
--   * failing both, the star **stuck in the land** (\`:53\`), \`SStickToLandscape\`
--     (\`:82-122\`): one of 32 orientations chosen by PX's ratio bins (\`:88-116\`),
--     drawn *into* the terrain so it is part of the land, and PX's own impact
--     sound at the volume and pan its distance gives (\`:54-56\`);
--   * and in every case the stock explosion (\`super\`, \`:59\`), which WA has already
--     done by the time \`on_explode\` runs -- the port adds to the blast, never
--     replaces it.
--
-- Deliberate departures, all small:
--   * PX's baked aim art (\`a - ninjas ( d|e|u ).png\`, 32 directions each, 96
--     frames) is not shipped, and neither is the baked pick art (the \`p -\`
--     sheets, 30 more). The worm is drawn from the shared weapon-less library
--     (\`lib/px_sprite_builder.lua\`, \`PX_POSTURE\`) and the star from one sheet
--     (\`sprites/ninja_star/hold/frame000.png\`) that the engine turns and places,
--     exactly as PX's sprite builder drew the pair (\`worms_anims_script.txt\`).
--     The star's in-hand art exists nowhere else -- \`ninjas.png\` is the flight
--     needle -- so that one frame is lifted from PX's own baked art
--     (\`porting-analysis/tools/build_hold_library.py\`).
--   * the record's own references (\`ninjas.png\`, the \`a -\`/\`p -\` files) are PX's
--     file names; the bundle declares its own sheets under \`sprites/ninja_star/\`
--     and \`panel_icon\`, the way every port does (\`REPORT.md\` 2.4).
--
-- **The trail is an addition, not a port.** PX's star asks for no trail anywhere
-- (\`ninja_star_script.txt\` has no \`SetTrail\`; the Attack Helicopter's bullet is
-- the weapon that calls \`SetTrail(12, 2, 0)\`), so a ribbon of seven points, one
-- per game frame and thin, is a request on top of the port. It runs on the
-- workspace's \`lib/px_trail.lua\` (\`lib/TRAIL.md\`, and \`REPORT.md\` 11.9 maps that
-- module back to \`px_effects.c\`); the numbers chosen here are the request's, not
-- PX's (REPORT.md 19).
--
-- A component's file, and anything it requires, runs where \`wa\` does not exist
-- yet: this module is pure data at load and touches \`wa\` only in \`install\`.

-- Whether the profile placed this component on a panel slot: a component in no
-- slot must not register a weapon, or the match dies at turn start (REPORT.md
-- 11.13, verified in match). \`ctx.placed\` is the placed weapons in slot order,
-- each \`{ id, position }\` (\`tools/audit/audit.lua:39-41\`); \`ctx.weapons\` is the
-- same ids as keys (\`highlander components/loader.lua:91\`). With neither field
-- the weapon registers as before.
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

-- PX's trunc (\`ninja_star_script.txt\` uses integer division on fixed point;
-- \`javelin.lua:21\` has the same helper) -- toward zero, not down.
local function trunc(n) return n < 0 and math.ceil(n) or math.floor(n) end

-- PX's effect-manager trail as a module (\`lib/px_trail.lua\`, \`lib/TRAIL.md\`).
-- Requiring it is pure data: nothing in it touches \`wa\` until \`install\`, which
-- \`M.install\` calls further down.
local trail = require("lib/px_trail")

-- PX's 32 orientations, by ratio bins, not evenly spaced angles
-- (\`:88-116\`, identical arithmetic in \`javelin.lua:22-30\`).
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

  -- The module's own engine callbacks (\`wa.on.missile_frame\`, \`wa.on.draw\`),
  -- registered here because a component's file -- and anything it requires --
  -- runs where \`wa\` does not exist yet (TRAIL.md; REPORT.md 11.11).
  trail.install()

  -- PX's numbers.
  local DAMAGE    = 10    -- NinjaSDamage (:64-66)
  local HIT_R     = 20    -- the strict 20 px square around the impact (:34)
  local SELF_R    = 25    -- and the 25 px square for the worm whose turn it is (:45)
  local BURIED    = { soften = 3, blend = "mix" } -- as the Javelin's, tuned by eye there

  -- The trail's numbers, every one of them chosen (PX's star has no trail): seven
  -- points, a new one every game frame, and thin. The module's defaults are PX's
  -- *bullet's* -- twelve points, every two frames, \`core_w\` 8.0 and \`glow_w\` 13.0
  -- (\`lib/px_trail.lua:33-34\`) -- so this is half the width and a point a frame.
  -- The width pair and \`max\` are the knobs if it reads too fat or too long;
  -- \`r\`/\`g\`/\`b\` colour it (the module's white is a stand-in), and \`depth\` moves it
  -- against the star -- the module's default is \`wa.depth.OBJECTS\`, one step in
  -- front of the flight actor's \`wa.depth.OBJECTS - 1\` below.
  local TRAIL = { max = 7, every = 1, core_w = 4.0, glow_w = 7.0, r = 120, g = 120, b = 120 }

  -- PX's GetCurrentWorm() (\`highlander lib/missile_sprites.lua:78-84\`): the worm
  -- whose turn it is. It owns the star in flight, and it is the worm the star bites
  -- if it lands within 25 pixels of it.
  local function current_worm()
    for _, w in ipairs(wa.worms.all()) do
      if w.turn then return w end
    end
  end

  -- The star's speed at the impact. WA destroys the missile on the frame it hits,
  -- so its speed is gone by the time \`on_explode\` runs; the Javelin keeps it a
  -- frame ahead for the same reason (\`javelin.lua:10-17\`). Kept as a separate
  -- missile_frame handler alongside sb.flight's -- both fire for the same missile.
  -- The trail is attached here too: WA launches this record itself (the profile
  -- fires it), so there is no \`wa.weapons.launch\` return value to hand \`trail.add\`
  -- -- the first frame the missile exists is the start of its flight (TRAIL.md).
  local speed = {}
  wa.on.missile_frame(function(m)
    if m.weapon ~= "px.ninja_star" then return end
    speed[m.id] = { m.vx, m.vy }
    if m.phase == "pre" and not trail.has(m.id) then
      trail.add(m.id, current_worm(), TRAIL)
    end
  end)

  -- **The star in flight.** Drawn with px_sprite_builder's flight pattern
  -- (\`lib/px_sprite_builder.lua\`): \`m.sprite = 0\` hides WA's sprite (PX clears
  -- \`ldata->anim.spriteIndex = 0\`, \`red_sprite_builder.txt:39\`), and a follower
  -- actor draws PX's \`ninjas.png\` sheet -- one frame per star direction, the same
  -- sheet \`SStickToLandscape\` uses for the stamp (:88-116). No auto-turning
  -- (\`anim = "none"\`): the frame *is* the orientation, exactly as in PX.
  local sb = require("lib/px_sprite_builder")
  sb.flight(ctx, {
    weapon = "px.ninja_star",
    sheet = ART .. "stamp.png",
    anim = "none",
    frame_fn = function(m) return orientation(m.vx, m.vy) end,
    z = wa.depth.OBJECTS - 1, -- as the helicopter's bullet, behind objects
    mirror = false, -- direction is encoded in the frame, not by mirroring
  })

  -- **The worm's aim and pick art**, PX's sprite-builder split in two: the engine
  -- draws WA's worm from the shared library's weapon-less posture
  -- (\`worm_sprites\`, below), then draws the held star and its hand over it from
  -- \`hold\`. One star sheet (\`sprites/ninja_star/hold/frame000.png\`), turned and
  -- placed by the aim -- no 32-frame aim folders. The numbers follow PX's sprite
  -- builder (\`worms_anims_script.txt\`): the star sits \`weap_radius\` from the worm
  -- centre -- 11 px, read off PX's own baked art -- in the middle hand. A
  -- four-point star repeats four times a turn, so \`weap_rotation\` only chooses
  -- which point leads.
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
    thrown = true, -- a thrown star leaves the hand; no put-away animation
    -- The star leaves the hand on space. PX draws his own star through
    -- \`sprite_curtis_457\` (\`ninja_star_script.txt:1\`), a library that is not in
    -- the repo, so what it does in \`WS_FIRED\` is inferred; the other four
    -- weapons here name no firing sprite at all (\`FSprite = 0\`,
    -- \`worms_anims_script.txt:101\`, :263) and PX's own \`else\` sets \`sprite = 0\`
    -- (:419-422). ASSUMPTIONS A14.
    keep_while_firing = false,
  }

  -- PX tests a strict square (\`x > trg->PosX-20 && x < trg->PosX+20\`, :34); the
  -- query is a circle, so it is asked for a little more and the square is applied
  -- here (the Javelin's own note, \`javelin.lua:39-40\`).
  local function within(o, x, y, r)
    return o and math.abs(x - o.x) < r and math.abs(y - o.y) < r
  end

  -- The registration, in a local first so the \`handling\` line reads as the
  -- Highlander's claims do (\`the weapon module's record.handling.ends_turn\`).
  local spec = {
    -- The slot is the profile's. The record is PX's own for this weapon, whose
    -- flight is the whole of the weapon's physics: a type-4 record, the Javelin's
    -- kind, so the throw, the arc, the wind on it and the blast are WA's with
    -- PX's numbers.
    wep = "weps/ninja_star_wep.wep",
    panel_icon = ART .. "icon.png", -- PX's own (ninjas ( grid ).png)
    -- One directory of frameNNN.png per PX sprite, as cut_lab and stress do. The
    -- star's flight and terrain stamp share \`stamp\` (PX's \`ninjas.png\`, one frame
    -- per direction); \`hold\` is the single in-hand star the engine draws. The
    -- trail's two beams are shared with the Attack Helicopter bundle -- every
    -- bundle ships its own copy, they are PX's own PNGs (TRAIL.md).
    sprites = { ART .. "stamp.png", ART .. "hold.png", trail.BEAM, trail.GLOW },
    -- Route the sheets into the GPU atlas for \`a:frame\`/\`a:gfx\` on the flight
    -- actor (\`weapons/attack_helicopter.lua:470\`). \`sprites/\` rather than \`ART\`
    -- because a \`wa.draw.ribbon\` may only draw a GPU sheet, and the beams sit
    -- under \`sprites/px_effects/\`; every other sheet here starts with the same
    -- prefix and is unaffected.
    params = { gpu_prefix = "sprites/" },
    -- PX's sprite-builder split: WA's worm comes from the shared weapon-less
    -- library (\`lib/px_sprite_builder.lua\`, \`PX_POSTURE\`) and \`hold\` puts the one
    -- star PNG and the hand on top, turned and placed to the aim. Without
    -- \`worm_sprites\` the record's own sprite is PX-only, WA finds no sheet to
    -- draw the worm with, and the worm vanishes -- the bug this fixes.
    worm_sprites = sb.PX_POSTURE,
    hold = hold,
    sounds = { SND .. "ninjasimpact.wav" },
    -- Whether a weapon ends the turn is a profile's setting, and PX's records
    -- carry it off (\`the weapon module's record.handling.ends_turn\`), so a weapon built on one says so
    -- itself: the throw ends the turn, as WA's do (\`the weapon module's record.handling.ends_turn\`).
    -- \`wfcheck\`'s SPEC_KEYS has no \`handling\` and reads an unknown literal key as
    -- a no-op -- as it has no \`missile\`, where the pack's use and a match test
    -- outrank the definition (REPORT.md 4.1); a key on a local spec is how the
    -- pack sets it too.
    -- PX's ExplodeAt, at the impact of the stock blast.
    on_explode = function(ev)
      local v = speed[ev.missile]
      if ev.missile then
        speed[ev.missile] = nil
        -- The round is gone, so shed the ribbon from here rather than leave it to
        -- the module's couple of missing frames (TRAIL.md).
        trail.drop(ev.missile)
      end
      local vx, vy = v and v[1] or 0, v and v[2] or 0
      -- PX's scan (:25-41): the first eligible object in the square. The order is
      -- the engine's, as the Javelin keeps it (\`javelin.lua:39-41\`) -- PX stops at
      -- the first eligible object too, in \`Env->Objs\` order.
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
        -- NinjaSDamage (:68-79): a quarter of the star's speed on the object, and
        -- half again through the damage message (which PX notes "doesnt work for
        -- some reason", :75 -- the Javelin passes it too, \`javelin.lua:52\`).
        target.vx, target.vy = trunc(vx / 4), trunc(vy / 4)
        if target.kind == "worm" then target:hurt(DAMAGE)
        else target:hit(DAMAGE, trunc(vx / 2), trunc(vy / 2), "projectile") end
        return
      end
      -- No worm and nothing to bite: the star sticks in the land. Centred on the
      -- impact, as PX's (\`:122\`, \`x-30, y-(30+top)\`), so half of it is in the
      -- ground and the engine's buried stamp fades that half into the earth
      -- instead of drawing it over the land -- the star looks stuck (the
      -- Javelin's note and its own \`buried\` values, \`javelin.lua:55-61\`).
      wa.land.stamp{ sprite = ART .. "stamp.png", frame = orientation(vx, vy),
        x = ev.x, y = ev.y, buried = BURIED }
      -- PX plays the impact unplaced, at the volume and pan its distance gives
      -- (\`:54-56\`); the API has neither, so it plays on the turn's worm (the
      -- Javelin's choice, \`javelin.lua:63-65\`).
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
        content: `-- Security Grenade -- Project X's grenade that bursts in a ring, on WormForge
-- API 4.
--
-- PX's source is \`PX_pending/weapon_grenade_security/scripts/security_grenade_script.txt\`
-- (151 lines) and its record \`weapons/security_grenade_WEAP.wep\` (byte \`+0x0C\` = 2,
-- a grenade record). It is a stock grenade otherwise: the throw, the arc and the
-- stock blast are WA's, and the whole of PX's weapon is what happens **after**
-- the blast. The worm's aim art is the shared weapon-less library
-- (\`lib/px_sprite_builder.lua\`, \`PX_POSTURE\`) with one held-grenade PNG over it,
-- the way PX's sprite builder drew it (\`security_grenade_spb.txt\`).
--
-- \`CMissile::ExplodeAt\` (\`:52-115\`) does, after \`super\` -- WA's own grenade blast,
-- which has already happened by the time \`on_explode\` runs -- eight more
-- explosions, each \`DoExplosion(x, y, push = 50, damage = 25, 0, ClWT)\` (\`:60-67\`),
-- on a ring of radius 60 around the impact: four on the axes at 60, four on the
-- diagonals at \`radius * 2/3 = 40\`. \`ClWT\` is the thrower's team, saved at
-- \`FireFinal\` (\`:136-142\`), so the ring belongs to the worm that threw it.
--
-- Not ported, and why:
--   * the flight trail (\`do_sprite_trail_effects(54, ...)\`, \`:128-131\`, every frame
--     while it flies) -- there is no particle API (REPORT.md 6 #1);
--   * the **Ninja Bomb**, the other weapon in PX's package (\`:69-114\`): on
--     detonation it fires **21 arrows** over four rings (\`:81-113\`, damage 15). The
--     only way to make one here is a record that flies WA's own arrow
--     (\`Root->GetObject(25, 0)\`) and \`wa.weapons.launch\`es it twenty-one times,
--     which needs a placed weapon on the scheme (REPORT.md 11.8) -- its own port,
--     and a good one next.
--
-- A component's file, and anything it requires, runs where \`wa\` does not exist
-- yet: this module is pure data at load and touches \`wa\` only in \`install\`.

-- Whether the profile placed this component on a panel slot (REPORT.md 11.13,
-- verified in match): a slot-less registration takes the match down at turn start.
-- \`ctx.placed\` is the placed weapons in slot order, each \`{ id, position }\`
-- (\`tools/audit/audit.lua:39-41\`); \`ctx.weapons\` is the same ids as keys
-- (\`highlander components/loader.lua:91\`).
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

  -- PX's numbers.
  local PUSH, DAMAGE = 50, 25 -- DoExplosion's push and damage (:58)
  -- The ring (:60-67): four on the axes at \`radius\`, four on the diagonals at
  -- \`radius * 2/3\`, going round clockwise from the top.
  local RADIUS = 60
  local RING = { { 0, -RADIUS }, { RADIUS * 2 / 3, -RADIUS * 2 / 3 }, { RADIUS, 0 },
                 { RADIUS * 2 / 3, RADIUS * 2 / 3 }, { 0, RADIUS },
                 { -RADIUS * 2 / 3, RADIUS * 2 / 3 }, { -RADIUS, 0 },
                 { -RADIUS * 2 / 3, -RADIUS * 2 / 3 } }

  -- PX's ClWT / CLWN (\`:140-142\`), so the ring is the thrower's.
  local shooter
  -- Where the stock blast landed, until the frame is over: PX's ring goes after
  -- \`super\`, so it must go after WA's blast, not inside it.
  local pending = {}

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FIRE_WEAPON and worm.weapon == "px.security_grenade" then
      shooter = worm
    elseif msg == wa.msg.FRAME_FINISH and #pending > 0 then
      for _, p in ipairs(pending) do
        for _, off in ipairs(RING) do
          -- One invisible throwaway actor per blast, the Attack Helicopter's and the
          -- Bunker Buster's shape: \`a:explode\` is the actor's own explosion and may
          -- take it with it, so a burst cannot come out of one actor.
          local a = wa.actors.spawn({ sprite = false, x = p.x + off[1], y = p.y + off[2],
            gravity = false, collide = false, owner = shooter, on = function() end })
          a:explode({ id = PUSH, damage = DAMAGE, below = false })
          a:despawn()
        end
      end
      pending = {}
    end
  end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })

  -- **The round in flight, drawn and turned by hand.** Drawn with px_sprite_builder's
  -- flight pattern (\`lib/px_sprite_builder.lua\`): \`m.sprite = 0\` hides WA's sprite
  -- (PX clears \`ldata->anim.spriteIndex = 0\`, \`red_sprite_builder.txt:39\`), and a
  -- follower actor draws PX's \`security_grenade_bullet.png\` sheet, turned with the
  -- grenade's animation type -- \`customType = 3\`, \`WAT_Rotation\` / \`WAT_HSpeed\`,
  -- which spins with speed (\`red_sprite_builder.txt:17,22,77\`) and mirrors when flying
  -- left (\`:90\`). See px_sprite_builder.lua for the full animation-type table.
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

  -- **The worm's aim and pick art**, PX's sprite-builder split in two: the engine
  -- draws WA's worm from the shared library's weapon-less posture
  -- (\`worm_sprites\`, below), then draws the held grenade and its hand over it
  -- from \`hold\`. The numbers are PX's own, from the weapon's sprite script
  -- (\`security_grenade_spb.txt\`): \`hand_radius\` 17, \`weap_rotation\` 0.5,
  -- \`weap_radius\` 9, \`hand_type\` 1 (the lower hand) and \`hand_scale\` 0.8, with
  -- \`hand_rotation\` / \`hand_radial_rotation\` / \`weap_radial_rotation\` left at
  -- PX's defaults, 1.0. One grenade PNG, turned and placed by the aim -- no
  -- 32-frame aim folders.
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
    frames = 1, -- one grenade, turned by the engine's hold to the aim
    thrown = true, -- a thrown grenade leaves the hand; no put-away animation
    -- Gone on space, as PX's: no \`FSprite\` firing sprite, so his \`sprite = 0\`
    -- (\`worms_anims_script.txt:263\`, :419-422).
    keep_while_firing = false,
  }

  -- The registration, in a local first so the \`handling\` line reads as the
  -- Highlander's claims do (\`the weapon module's record.handling.ends_turn\`).
  local spec = {
    -- The slot is the profile's. The record is PX's own for this weapon: WA's
    -- grenade record with PX's icon and bullet sprite, so the throw and the stock
    -- blast are WA's and only the ring is Lua's.
    wep = "weps/security_grenade_wep.wep",
    panel_icon = ART .. "icon.png", -- PX's own (security_nade_ico.png)
    -- Stock WA grenade art for the record itself. PX's bullet sprite is never
    -- drawn by WA -- \`m.sprite = 0\` above hides it, and sb.flight draws PX's own
    -- bullet -- but a record still wants a sprite WA can resolve, and the grenade
    -- is the record's own kind.
    sprite = "grenade",
    -- PX's sprite-builder split: WA's worm comes from the shared weapon-less
    -- library (\`lib/px_sprite_builder.lua\`, \`PX_POSTURE\`) and \`hold\` puts the one
    -- grenade PNG and the hand on top, turned and placed to the aim. Without
    -- \`worm_sprites\` the worm falls back to the stock grenade hold art, which is
    -- all this used to get.
    worm_sprites = sb.PX_POSTURE,
    hold = hold,
    -- Route the sheet into the GPU atlas for the flight actor
    -- (\`weapons/attack_helicopter.lua:470\`). The record's own flight art is never
    -- drawn -- \`m.sprite = 0\` above hides it, and sb.flight draws PX's own bullet.
    -- The same sheet is the hold's weapon PNG.
    sprites = { ART .. "bullet.png" },
    params = { gpu_prefix = ART },
    -- No sounds of its own: PX's package has none, and the stock grenade's blast is
    -- WA's.
    -- PX's ExplodeAt: remember where the stock blast landed; the ring follows on
    -- the frame's end, after it.
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
        content: `-- Project X's effect-manager trail (wklua_and_px/utils/px_effects.c), as a
-- module: one trail per round, sampled in game frames and drawn with the
-- engine's textured beams (\`wa.draw.ribbon\`). It is what PX's bullet sets with
-- \`linkedEffect1->SetTrail(12, 2, 0)\`; TRAIL.md is how to bolt it onto a
-- weapon, and REPORT.md 11.9 is the line-by-line mapping back to px_effects.c.
--
--   * At most \`max\` points (PX's \`trailMaxL\`, :264), one appended every \`every\`
--     game frames while the round moves (PX's \`treshold\`, :266; sampled at
--     :579-582, made at :1210-1233), the oldest dropped past the cap
--     (\`DetractTrail\`, :1229-1232 and :1235-1248). No point while the round is
--     at rest (:1215), nor one within 0.01 of the point before it (:1223).
--   * \`DrawTrail\` (:1298-1380) draws two textured beams: a sharp core
--     (\`tazer_lightningBeamSprite\`) and, wider, a soft glow (\`beam_glowSprite\`;
--     it runs because \`shouldBeamGlow\` defaults true, :92). Point i of n has
--     t = (i+1)/(n+1) floored at 0.1 -- type 0, the third \`SetTrail\` argument,
--     is neither the wavy nor the mid-thick-edge-thin profile (:1311-1323) --
--     and that t is the point's texcoord, its colour scale, and, through the
--     width, how thick it draws.
--   * PX's widths are half widths (\`TexturedBeamPoint\` lays the section out at
--     +-dx; \`textured_beam(draw_quad).PXC:35-47\`), and \`wa.draw.ribbon\` wants
--     the full one, so \`core_w\` and \`glow_w\` are already doubled (PX's
--     rayThickness 4.0 and rayGlowThick 6.5, :149-150).
--   * The effect outlives its round: with the link gone \`IsTargetMoving()\` is
--     true again (:560), so the shed that is left is the vanish -- one point
--     every \`vanish\` game frames, from the oldest end (:583-587, and
--     trailVanishSpd is 2, :169).

local trail = {}

-- The defaults are PX's bullet's. \`add\` copies them, so change these once, or
-- pass the same names in \`opts\` for one trail. \`beam\` and \`glow\` must also be
-- in the component's \`sprites\` list (the paths are bundle-relative).
trail.MAX, trail.EVERY, trail.VANISH = 12, 2, 2
trail.CORE_W, trail.GLOW_W = 8.0, 13.0
-- The effect's colour is its CEffectManager constructor's r, g, b, which PX's
-- bullet script does not show: white is a neutral stand-in.
trail.R, trail.G, trail.B = 255, 255, 255
-- nil means \`wa.depth.OBJECTS\`, which only exists inside install(ctx): the engine
-- refuses \`wa\` while it is loading a component's file and everything it requires
-- ("a component's file only returns its data; use wa in install(ctx)").
trail.DEPTH = nil
trail.BEAM = "sprites/px_effects/beam.png"
trail.GLOW = "sprites/px_effects/beam_glow.png"

-- Every trail drawn: the live rounds, and the ones outliving them.
local trails = {}
-- Missile id -> its trail, while the round is in the air.
local live = {}
-- One hidden actor, while there is a trail to sample or to shed. It ticks the
-- game frames, so nothing here depends on the render rate.
local driver, tick = nil, 0
-- Game frames a live trail may go unsampled before its round counts as gone.
-- A missile fires a frame callback every game frame while it exists, so one
-- frame of slack is enough; two leaves room for callback order.
local STALE = 2

local function start_driver(t, owner)
  if driver then return end
  -- The sprite is never seen; it just has to be one the bundle declares.
  driver = wa.actors.spawn({
    sprite = t.beam, visible = false, gravity = false, collide = false, owner = owner,
    on = function(a)
      tick = tick + 1
      for i = #trails, 1, -1 do
        local v = trails[i]
        if v.live and tick - v.seen >= STALE then
          -- Its round stopped firing frames: hit, exploded or gone from the map.
          v.live = false
          live[v.id] = nil
        end
        if not v.live and tick % v.vanish == 0 then
          table.remove(v.pts, 1)
          if #v.pts == 0 then
            -- \`table.remove\`, not \`trails[i] = nil\`: a hole anywhere before the
            -- end makes \`#trails\` unspecified and stops the draw's \`ipairs\` at
            -- the hole, which reads as "no trail is drawn any more" for every
            -- round, live ones included. The loop runs backwards so shifting the
            -- tail down cannot skip an element.
            table.remove(trails, i)
            live[v.id] = nil
          end
        end
      end
      if #trails == 0 then driver = nil; a:despawn() end
    end,
  })
end

-- Trail the round \`id\`, owned by \`owner\` (a worm or a team, as \`wa.actors.spawn\`
-- wants). \`opts\` overrides any of the fields above for this trail alone.
function trail.add(id, owner, opts)
  local t = {
    id = id, pts = {}, live = true, seen = tick,
    max = trail.MAX, every = trail.EVERY, vanish = trail.VANISH,
    core_w = trail.CORE_W, glow_w = trail.GLOW_W,
    r = trail.R, g = trail.G, b = trail.B,
    depth = trail.DEPTH, beam = trail.BEAM, glow = trail.GLOW,
  }
  -- Every field \`opts\` may override, one at a time: a \`pairs\` loop would read in
  -- an unspecified order (wfcheck's lockstep note), even though copying values
  -- cannot depend on it.
  for _, k in ipairs({
    "max", "every", "vanish", "core_w", "glow_w", "r", "g", "b", "depth", "beam", "glow",
  }) do
    if opts and opts[k] ~= nil then t[k] = opts[k] end
  end
  -- \`trail.DEPTH\` cannot be read at load time (see trail.DEPTH above), so the
  -- default is resolved here, in a game frame, where \`wa\` does exist.
  if t.depth == nil then t.depth = wa.depth.OBJECTS end
  trails[#trails + 1] = t
  live[id] = t
  start_driver(t, owner)
  return t
end

-- Is this round trailed? For attaching to rounds you did not launch yourself.
function trail.has(id)
  return live[id] ~= nil
end

-- The round is gone: stop sampling it and let its trail be shed. Optional -- the
-- driver notices a round that stopped firing frames within STALE game frames --
-- but this starts the fade at once.
function trail.drop(id)
  local t = live[id]
  if t then
    t.live = false
    live[id] = nil
  end
end

local installed = false

-- Register the engine callbacks. Call this from your component's install(ctx):
-- a component's file, and anything it requires, only returns data -- \`wa\` does
-- not exist yet, which is why nothing above this line touches it, and why
-- \`trail.DEPTH\` waits for \`add\` to resolve it.
function trail.install()
  if installed then return end
  installed = true

  -- PX's FillTrail (:1210-1233), on the missile's own game frame.
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
  end)

  -- PX's DrawTrail (:1298-1380), from the render callback. \`wa.draw.ribbon\`
  -- copies its table, so one spec is refilled for every pass of every trail, as
  -- the packs do (electrical.lua:409-440): a table per draw made enough garbage
  -- for a collection inside the draw.
  if wa.on.draw and wa.draw.ribbon then
    local RIBBON = { blend = "add", points = {} }
    local function pass(t, sprite, width)
      local pts, n = t.pts, #t.pts
      if n < 2 then return end -- \`if (trailAmount < 2) return;\` (:1300)
      RIBBON.sprite, RIBBON.depth = sprite, t.depth
      local rp = RIBBON.points
      for i = 1, n do
        -- PX's t (a 0-based i over n, plus one) floored at 0.1: strength,
        -- texcoord and width in one number.
        local f = i / (n + 1)
        if f < 0.1 then f = 0.1 end
        local p = rp[i]
        if not p then p = {}; rp[i] = p end
        p.x, p.y, p.u, p.width = pts[i][1], pts[i][2], f, f * width
        p.color = (255 << 24) | (math.floor(t.r * f) << 16)
          | (math.floor(t.g * f) << 8) | math.floor(t.b * f)
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
      },
      {
        path: 'lib/px_zone.lua',
        name: 'lib/px_zone.lua',
        language: 'lua',
        content: `-- px_zone.lua -- PX's turn-timed objects, shared by the zone launcher's weapons.
--
-- PX's \`CHealthZone\` and \`CBlast\`
-- (\`PX_pending/weapon_zones/scripts/zone_launchers_script.txt:71-230\` and
-- \`:233-348\`) are one machine with two payloads, and the Spot Hider's mask
-- (\`:356-369\`) is that machine's lifetime with no payload and no box at all.
-- Three things are shared:
--
--   * **turns.** The object lives \`turns\` turn-ends (\`CHealthZone::Message\`
--     \`M_TURNEND\` :170-174, \`CBlast::Message\` \`M_TURNEND\` :308) and is freed
--     when they run out (:187-194, :313-319).
--   * **inactivity.** Seven seconds after a turn ends the object stops acting,
--     and the next turn's start wakes it (:175-183, :219-228; and the
--     \`CWZone::active\` the blast zone reads at :330 and re-arms on at
--     :343-346). PX's note on his own clock: "as soon as fps = 50 (1 sec), 7
--     here = 7 secs" (:222).
--   * **a box.** One object inside it -- PX's \`activator\` -- is all the payload
--     ever sees (:121, :205-217; the blast zone's species list :334). The Spot
--     Hider has none: its mask is a bare \`CAnimation\` (:367).
--
-- A weapon hands in a spec and gets a placer back:
--
--   local zone = require("lib/px_zone")
--   local ZONES = zone.register({ name = "Health Zone", fps = 50, radius = 20,
--     half_height = 15, kinds = { worm = true, grave = true },
--     tick = function (z, obj) ... end, draw = function (z) ... end })
--   ZONES.place(x, y, { turns = 6, owner = worm })
--
-- The spec's fields are PX's:
--
--   name             for the log only.
--   fps              the clock that class ticks at: 50 for the health zone
--                    (:87), 5 for the blast zone (:248). Left out: nothing to
--                    watch (the Spot Hider).
--   radius,          the box: half width and half height (\`CWZone(x, y, 40, 30,
--   half_height      ...)\` :382 is 40x30, the blast zone's 45x45 :374).
--   kinds            which object kinds count (PX's \`OC_*\` list, :334).
--   one_shot         \`CBlast\`'s \`worknow\`: act once per waking (:328-346).
--   next_turn        begin spending turns after the next turn starts.
--   fade_frames      visual-only tail after expiry; payload stops immediately.
--   wakes(z, obj)    whether this activator acts at all -- the health zone's
--                    resting-only rule while \`start_be_inactive\` (:207-213).
--   frame(z)         every world frame, before the fps gate (an animation).
--   tick(z, obj)     the payload.
--   draw(z)          the object in the world.
--   place(x, y, state)  takes \`turns\`, \`owner\` and whatever the payload reads.
--
-- Not ported, and why:
--   * PX's \`M_SKIPTURN\` guard (\`CHealthZone::Message:169\`) -- the engine's turn
--     events carry no "this turn was skipped" (crates/lua-host/src/dispatch.rs:
--     614-628), so a skipped turn spends a turn here;
--   * \`SearchForWeapZone(zone_name)\` (:199, :325) -- PX's zones live in his
--     engine's zone table; here the tick owns the object and its \`activator\`
--     outright, so there is nothing to look up.
--
-- A component's file, and anything it requires, runs where \`wa\` does not exist
-- yet: this module is pure data at load and touches \`wa\` only in \`register\`.

local M = {}

-- Every live object, in the order they were placed: the ticks and the draws
-- walk it in that order, which is what keeps two peers in step.
local objects = {}
local hooks_registered = false

-- The world runs at 50 frames a second (REPORT.md 13), so counting frames gives
-- every class the same seven seconds. PX's own counter instead ticks that class's
-- clock (\`inactive_timer > 7\`, :222) -- 8 ticks, i.e. 8 s on the health zone's
-- 1 Hz clock -- and in \`CBlast\` the counter is never read at all: what re-arms
-- the blast is the \`CWZone\`'s own \`active\` flag (:343-346), whose body is not in
-- the script. One shared frame count is the closest reading of PX's own note,
-- "as soon as fps = 50 (1 sec), 7 here = 7 secs" (:222).
local FPS = 50
local INACTIVE_FRAMES = 7 * FPS

local function forget(o)
  if o.actor then o.actor:despawn() end
  for i, other in ipairs(objects) do
    if other == o then
      table.remove(objects, i)
      break
    end
  end
end

-- PX's \`activator\`: the one object the payload acts on -- the nearest of the
-- kinds this class watches inside its box, ties by id, so every peer picks the
-- same one (\`AddHealth\`/\`DamageHealth\` :121-165, the blast zone :330-341).
local function activator(o)
  local spec = o.spec
  local found, best
  for _, obj in ipairs(wa.world.electrical_nearby(o.x, o.y, spec.reach, true)) do
    if spec.kinds[obj.kind] then
      local dx, dy = (obj.x or o.x) - o.x, (obj.y or o.y) - o.y
      if math.abs(dx) <= spec.radius and math.abs(dy) <= spec.half_height then
        local d = dx * dx + dy * dy
        if not best or d < best or (d == best and obj.id < found.id) then
          found, best = obj, d
        end
      end
    end
  end
  return found
end

-- PX's per-object \`M_FRAME\` (:184-229, :310-347), run once a world frame by an
-- actor with no body.
local function tick(o)
  local spec = o.spec
  o.timer = o.timer + 1
  if spec.frame then spec.frame(o) end
  if o.turns <= 0 then
    o.fade = (o.fade or 0) + 1
    if o.fade >= (spec.fade_frames or 0) then forget(o) end
    return
  end
  if spec.fps and o.timer % spec.fps == 0 then
    if spec.one_shot then
      -- \`CBlast\`'s \`worknow\`: it booms, then waits to be re-armed (:328-346).
      -- PX's re-arm test is the \`CWZone\`'s own \`active\` flag, whose body is not
      -- in the script, and it may well go false and true again inside one turn
      -- (a worm stepping out of the box and back in); the port re-arms only
      -- while the object sleeps, so one boom a turn is the conservative reading
      -- of "it explodes when something comes in", and the one PX's own
      -- \`start_be_inactive\`/\`active\` pair is built for (ASSUMPTIONS A11).
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

-- PX's M_TURNEND (:170-174, :308): every turn ended spends one of every
-- object's turns, and starts its seven-second countdown.
local function spend_turn()
  for _, o in ipairs(objects) do
    if o.counting then o.turns = o.turns - 1 end
    o.start_be_inactive = true
    o.inactive = 0
  end
end

-- PX's M_TURNBEGIN (:175-183): a live object wakes for the new turn.
local function wake()
  for _, o in ipairs(objects) do
    o.counting = true
    o.active, o.start_be_inactive, o.inactive = true, false, 0
  end
end

-- One rotated square of a sheet, centred on (x, y): PX's \`CAnimation\` in the
-- world, drawn as the engine's quad. A quad is also the only way a pack draws a
-- sheet with an alpha of its own -- an actor's tint word spends its alpha byte
-- on the blend mode (crates/lua-host/src/actor.rs:173-186), while a quad's is
-- real alpha, premultiplied (\`crates/engine/src/gpu.rs:699-710\`).
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

-- One quad, reused: the engine copies the table on the call, so mutating it
-- between draws is what the dev's own packs do (\`mods/px/weapons/
-- electromagnet.lua:319\`, \`bowling_ball.lua:550\`).
M._quad = { frame = 0, points = { { 0, 0 }, { 0, 0 }, { 0, 0 }, { 0, 0 } } }

-- A weapon joins the shared machinery and gets its placer back.
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

  -- PX's \`CMissile::ExplodeAt\`'s branch for this weapon (:377-384, :370-376):
  -- the object is placed where the round stopped. \`state\` becomes the object
  -- itself -- the payload's own table, taken as it is rather than copied field by
  -- field, so nothing iterates a hash in an order two peers could disagree on.
  -- It carries \`turns\` (required) and \`owner\`, plus whatever \`tick\`, \`frame\` and
  -- \`draw\` read back out (the health zone's \`healing\`, the blast zone's \`colour\`
  -- and its animation phase).
  function class.place(x, y, state)
    local o = state or {}
    o.spec, o.x, o.y, o.timer = spec, x, y, 0
    o.active, o.start_be_inactive, o.inactive = true, false, 0
    o.counting = not spec.next_turn
    o.armed = spec.one_shot and true or false
    -- PX's objects are \`CObject\`s that live on M_FRAME (:167-230, :306-347):
    -- here that is an actor with a per-frame brain and no body -- brains run on
    -- the world's FRAME_FINISH, so the same frame on every peer
    -- (crates/lua-host/src/actor.rs).
    o.actor = wa.actors.spawn({
      sprite = false, x = x, y = y, gravity = false, collide = false,
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
        content: `-- Visuals from weapon_zones, p_animation and pxparticles in the supplied
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
`
      },
      {
        path: 'lib/pyro_turret.lua',
        name: 'lib/pyro_turret.lua',
        language: 'lua',
        content: `-- PyroMan's turrets (Project X's p_turrets library: turretbase.txt's
-- CTurretBase), on lib/turret.lua's body: planted where the worm stands,
-- health, capture, its death blast. This is the brain and the look.
--
-- Each frame of a running turn clock, with ammo left, a turret picks a moving
-- enemy worm (each one in range with a 30% chance, from WA's RNG), waits 15
-- frames, then turns its head toward a lobbed shot: the speed that reaches the
-- worm in \`flight\` frames under gravity times \`g_factor\`. Aligned and
-- reloaded, it traces that arc with a 3-pixel circle against the land; when
-- blocked it keeps the worm (65%) with another flight time, or drops it.
-- Otherwise it fires its weapon's \`shoot\` at the solved speed plus a random
-- 0 to 63/96. Flight times cycle (+10, x1.1, back to 16 past 100); the time
-- between shots starts at \`fire_rate_ms\` (PX's 20 frames) and grows by
-- \`fire_increase_pct\` a shot (PX's x1.12), and ammo is per turn. Angles are PX's: radians
-- from straight up, toward the side it faces (\`dir\`).
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

-- GetShootAngle: the start speed (rx, ry) that reaches the worm in \`flight\`
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

-- AimToEnemy: drop a worm beyond \`lost_px\`, else turn toward the shot; true
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
-- Fire increase (%), as \`t\` reads them at the next placing and the next turn.
function pyro.configure(t, ctx)
  t.health, t.ammo = ctx.option("health"), ctx.option("ammo")
  t.fire_rate_ms, t.fire_increase_pct = ctx.option("fire_rate"), ctx.option("fire_increase_pct")
end

-- \`cfg\`: \`kind\`, \`weapon\`, \`frames\` (pyro.FRAMES'), \`shoot(t, a, s, shot)\`
-- (fires once from shot.x/y along shot.dx/dy, the speed pyro.force's; false
-- leaves the worm), and PX's numbers over BASE. Returns lib/turret's \`t\`.
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
`
      },
      {
        path: 'lib/sentry_health.lua',
        name: 'lib/sentry_health.lua',
        language: 'lua',
        content: `-- Small 5x7 digits on a transparent sheet. Rendering only: no actors, health
-- writes or shared RNG. Both sentry types share one GPU sheet for the match.
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

-- \`bottom\` includes the one-pixel soft shadow; the caller chooses a fixed
-- height relative to the body. Snap the tiny glyphs to whole world pixels
-- so subpixel placement does not soften their strokes.
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
-- Rows relative to the mask's bottom anchor (source x=31, y=41).
-- These runs also describe turret_mask.png; the original base art is untouched.
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
-- A turret's footprint from its rows, contiguous from -top through zero:
-- \`{ dy, x0, x1 [, x0, x1 ...] }\` relative to the bottom anchor. \`burial\`
-- is how far its art reaches below that anchor, into the land.
local function build(rows, top, left, right, burial)
  local mask = { rows = rows, top = top, left = left, right = right, burial = burial }

  -- Constant-time membership in the exact authored row runs.
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

  -- \`other_mask\`, the other turret's footprint, is this one's by default.
  function mask.intersects(x, y, other_x, other_y, other_mask)
    other_mask = other_mask or mask
    x, y, other_x, other_y = math.floor(x), math.floor(y), math.floor(other_x), math.floor(other_y)
    if x + mask.right < other_x + other_mask.left or x + mask.left > other_x + other_mask.right
      or y < other_y - other_mask.top or y - mask.top > other_y then return false end
    for _, row in ipairs(rows) do
      -- Rows are contiguous from -top through zero: only one can share this y.
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
    -- Test each worm once against the authored runs, rather than reading native
    -- userdata properties again for every pixel. Burial never exempts a worm.
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
-- Split from rules.lua by tools/split_highlander.py.
local shared = {}

return shared
`
      },
      {
        path: 'lib/turn_controls.lua',
        name: 'lib/turn_controls.lua',
        language: 'lua',
        content: `-- Shared digit input and event dispatch. Weapons provide their own actions.
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
        content: `-- Highlander: Project X's sentry turrets (weapon_sentry_gun's PxSentryGun,
-- weapon_sentry_laser's PxSentryLaser), the part they share: a body dropped
-- where the worm stands, with passage for the planter until clear, a head that sweeps,
-- picks the nearest moving enemy in sight beyond its barrel sweep, turns and fires, reloads
-- each turn, and is disabled for the turn by positive damage and explodes at 0
-- health. What it aims at and what it fires are the weapon's: \`targets\` (by
-- default the worms) and \`fire(t, a, s, target)\`. Another turret keeps the
-- body (planting, passage, health, capture, the death blast) and brings its
-- own brain and look: \`think\`, \`draw\`, \`feet\` and the hooks below (PyroMan's,
-- lib/pyro_turret.lua).
--
-- From the standalone sentry_gun port (mods/examples/sentry_gun_old), with
-- its numbers as the defaults. Angles: 0 down, 90 right, 180 up, 270 left.
local turret = {}
local turrets = {}
local feet = require("lib/sentry_mask")
local health_label = require("lib/sentry_health")

-- Scripted bodies are not in the stock electrical target list. Include
-- their whole body circle in Lightning's existing beam selection in Lua.
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

-- PX's Javelin includes sentries in its strict impact square. The stock
-- electrical list excludes Lua actors, so add them through this registry.
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

function turret.projectile_hit(entry, damage, vx, vy, uid)
  if entry and entry.t.state[entry.body.id] == entry.s then
    entry.t.projectile_hit(entry.body, entry.s, damage, vx, vy, uid)
    return true
  end
  return false
end

local DEFAULTS = {
  sensor_px = 360,      -- detection radius
  ammo = 20,            -- rounds per turn
  shot_frames = 6,      -- frames between rounds
  activate = 60,        -- frames after acquiring before the first shot
  beep_frames = 60,     -- minimum gap between alert beeps
  rot_idle = 0.5,       -- degrees per frame while sweeping
  rot_active = 1.5,     -- PX tracking speed, degrees per frame
  sweep = 10,           -- PX idle sweep amplitude, degrees
  aim_tolerance = 1.5,  -- PX fires only after rotation reaches the target
  require_motion = true, -- PX only acquires walking/jumping/moving worms
  settle_px = 4,        -- mask may overlap real terrain by this depth (placing, sliding)
  sink_px = 0,          -- how deep the mask's feet rest in the land once planted
  foot_offsets = { -6, 7 }, -- support beside the buried mask, never inside it
  top_px = feet.top,         -- top of the feet/hub silhouette above its anchor
  capture_radius = 24, -- Lightning's circle around the body
  capture_up = 16 - feet.burial,
  muzzle_up = 25 - feet.burial,       -- pixels from the anchor up to the turret pivot
  sight_grace_px = 4, -- terrain grace beyond the barrel tip's circular sweep
  placement_reach = 64, -- bounded clear-space search around the planting worm
  health = 50,
  slide_friction = 0.20, -- pixels/frame lost on supported ground
  contact_worm = 0.5,    -- fraction of incoming worm velocity transferred
  contact_projectile = 0.25, -- PX Javelin transfers a quarter of its velocity
  boom = { damage = 50, id = 100, below = false },
  boom_up = 20 - feet.burial, -- pixels from the anchor up to the death blast
  disable_on_damage = true, -- positive damage disables the sentry for the turn
  hit_by = "all",       -- what hits it once planted (\`body.hit_by\`)
  -- and while its planter passes: no worm contact
  passage_hit_by = { arrows = true, melee = true, fire = true, dragon_ball = true, blasts = true },
  -- Occlusion band for the head: in front of terrain (0x180000), so the
  -- landscape never buries it.
  head_depth = wa.depth.FRONT,
}

-- 0 = down, 90 = right: the art faces right, and screen y grows down.
-- wa.math: an aim reaches the simulation (what the turret sees and hits), so
-- it must come out the same on every machine.
function turret.angle_to(ax, ay, tx, ty)
  local dx = (tx - ax) // 1
  local dy = (ty - ay) // 1
  local deg = math.deg(wa.math.atan(dx, dy))
  if deg < 0 then deg = deg + 360 end
  return deg
end

-- The same physical barrel tip is used for firing and its terrain gate.
function turret.muzzle(t, a, angle)
  local rad = math.rad(angle)
  return a.x + wa.math.sin(rad) * t.muzzle_out,
    a.y - t.muzzle_up + wa.math.cos(rad) * t.muzzle_out
end

-- Terrain probes leave out this turret's stamped feet, but real terrain
-- and overlapping actors still block. Starting inside either must block too:
-- world.trace otherwise describes the exit from an initial overlap.
function turret.trace(a, x0, y0, x1, y1)
  local hit = wa.world.trace { x0 = x0, y0 = y0, x1 = x1, y1 = y1,
    radius = 0, with = { "terrain" }, ignore = { a } }
  if hit and hit.starts_solid then return { hit = true, x = x0, y = y0 } end
  if hit and hit.hit then return hit end
end

-- Ignore nearby terrain for sight only, inside the circle swept by every
-- possible muzzle position plus padding. Beyond it, even an initially solid
-- ray must block. Firing still checks the actual tip and uses the full terrain.
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

-- A turret without one of the sounds (the laser has no firing loop) skips it.
local function play(a, sound)
  if sound then a:sound(sound) end
end

local function angle_gap(a, b)
  local d = (a - b + 540) % 360 - 180
  return d < 0 and -d or d
end

-- \`cfg\`: the weapon's numbers (over DEFAULTS), \`art\` { base, gun, flare,
-- barrel }, \`sounds\` { place, beep, fire_loop, fire_end, servo_start,
-- servo_loop, servo_end }, \`tints\` (team colours, red to cyan, 0xRRGGBB),
-- \`kind\`, \`fire(t, a, s, target)\`, which shoots once (a, the body; s, its
-- state), and optionally \`targets(t, a, s)\`, what it can aim at: a list of
-- { key, x, y, alliance, moving }, in an order the same on every machine.
-- Returns \`t\`, whose \`place(fire_ev)\` drops a turret for the firing worm.
--
-- A turret with its own brain passes \`think(t, a, s)\` (each planted frame,
-- instead of the sentry's sweep, aim and fire), \`draw(t, s)\` (each rendered
-- frame, instead of the sentry's sheets), \`feet\` (its footprint, from
-- lib/sentry_mask's \`build\`), and as it needs them \`init(t, a, s)\` (once
-- placed), \`turn_begin(t, s)\` (after each turn's reload) and
-- \`ignore_hit(t, a, s, hit)\` (true: the hit does nothing).
--
-- The head: \`gun\`, team-tinted, its frames the firing poses; with a
-- \`barrel\`, the barrel is its own untinted layer behind it, its frames the
-- poses, and the gun's two frames are its art and its mirror image, for a
-- turret that has turned to face left (PX draws it flipped).
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

  -- The Sentry Gun's targets: the worms, keyed by worm id; moving by
  -- note_motion.
  local function worm_targets(_, _, s)
    local out = {}
    for _, w in ipairs(wa.worms.all()) do
      if w.visible ~= false then
      local p = s.seen[w.id]
        out[#out + 1] = { key = w.id, x = w.x, y = w.y, alliance = w.alliance, moving = p and p.moving, obj = w }
    end
    end
    return out
  end
  local targets = cfg.targets or worm_targets

  -- Movement is needed to notice a target; a held target may stop moving.
  -- Nearby terrain has grace around the complete barrel sweep; normal sight
  -- blocking applies beyond it. Firing also checks the current barrel tip.
  local function can_track(a, s, c, need_motion)
    if c.alliance == s.alliance then return false end
    if need_motion and t.require_motion and not c.moving then return false end
    local ex, ey = a.x, a.y - t.muzzle_up
    local dx, dy = (c.x - ex) // 1, (c.y - ey) // 1
    if dx * dx + dy * dy > t.sensor_px * t.sensor_px then return false end
    return turret.sight(t, a, c.x, c.y)
  end

  -- The nearest moving enemy in sight; ties to the first listed, the same
  -- everywhere.
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

  -- Keep the target while it remains eligible, in range and in sight.
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
    -- PX zeroes ShootTimer as firing (re)starts: the first round goes now.
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
      -- PX stops firing at once, turns to the last place it saw it, then
      -- drops it.
      if not s.lost then t.stop_firing(a, s) end
      s.lost = true
      want = turret.angle_to(hx, hy, s.tx, s.ty)
      s.angle = turn_toward(s.angle, want, t.rot_active)
      if angle_gap(s.angle, want) <= t.aim_tolerance then
        s.had_target, s.lost, s.tid = false, false, nil
      end
    else
      -- PX sweeps to one side and turns back the moment it gets there.
      s.had_target = false
      want = s.idle + s.sweep_dir * t.sweep
      s.angle = turn_toward(s.angle, want, t.rot_idle)
      if s.angle == want then s.sweep_dir = -s.sweep_dir end
    end

    -- PX: turned over itself, it idles facing the other way.
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
    -- PX's long-rotation sound: a turn left of at least twice its speed.
    update_servo(a, s, target ~= nil and angle_gap(s.angle, want) >= 2 * t.rot_active)

    -- Enemy movement can trigger a shot on any turn, including the planter's.
    -- Firing stays latched until the target is lost, ammo runs out or damage
    -- disables the sentry.
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

  -- Coalition owns the sentry. A living member is only WA's required
  -- spawn/shot parent, chosen in stable worm-id order; it is not the owner.
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
      -- The blast's stock parent must come from the owning colour too.
      -- This instant, invisible emission has no collision or lasting body.
      local owner = t.owner(a, s)
      if owner ~= a then
        local e = wa.actors.spawn({ sprite = false, owner = owner,
          x = a.x, y = a.y - t.boom_up, gravity = false, collide = false,
          explode = { damage = t.boom.damage, id = t.boom.id, now = true } })
        e:despawn()
      else
        a:explode(t.boom)
      end
    end
    a:despawn()
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
    -- Wake WA's settled body as well as changing its momentum.
    a:warp { x = a.x, y = a.y, vx = s.vx, vy = s.vy }
    if vy < 0 then s.planted = false end
    if vx ~= 0 or vy ~= 0 then t.stop_firing(a, s) end
  end

  local function touched(a, ev)
    local s = state[a.id]
    if not s or not ev.other then return end
    local uid = ev.other.uid
    if uid and s.script_hits[uid] then s.script_hits[uid] = nil; return end
    if ev.other.kind == "worm" and s.phase ~= 3 then return end
    -- Sentries used to meet through their fixed terrain footprints. Keep
    -- them as supports rather than adding projectile momentum to a stack.
    if ev.other.kind == "actor" then
      for _, other_t in ipairs(turrets) do
        if other_t.state[ev.other.id] then return end
      end
    end
    local fraction = ev.other.kind == "worm" and t.contact_worm or t.contact_projectile
    t.push(a, s, (ev.vx or 0) * fraction, (ev.vy or 0) * fraction)
  end

  function t.projectile_hit(a, s, damage, vx, vy, uid)
    if uid then s.script_hits[uid] = wa.world.frame() end
    hit(a, { damage = damage, vx = vx, vy = vy })
  end

  -- WA moves the sprite-shaped body before FRAME_FINISH. Lua owns only
  -- planting policy and sliding friction, never a second physics step.
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
      wa.log(string.format("Sentry planted %s id=%d mask=(%.2f,%.2f) art_feet=%.2f support_y=%.2f overlap=%d",
        t.kind, a.id, s.x, s.y, s.y + feet.burial, s.y - t.sink_px + 1, t.sink_px))
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
    -- Damage is consumed only by on.hit; the legacy frame damage accumulator
    -- may describe the same blast and must not deduct health twice.
    s.tick = s.tick + 1
    local frame = wa.world.frame()
    for uid, at in pairs(s.script_hits) do
      if at < frame - 1 then s.script_hits[uid] = nil end
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
      -- Keep passage until both the previous and current footprints are
      -- clear, including a fast fall past the planter in this tick.
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

  -- Fixed height with the in-game-tuned offset. Following the idle sweep's
  -- changing top made tiny digits shimmer.
  local label_clearance = t.art.barrel and 26 or 25

  -- One gameplay actor; its head, barrel, flare and added LED are draw calls.
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
    sheet(t.art.gun, x, y, look, angle, t.tints[s.alliance + 1] or t.tints[1], t.head_depth)
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
    disable(a, s)
    return true
  end

  -- Prefer the worm's position, then deterministic 4px rings if blocked.
  -- The planter can walk out; every other worm keeps its body clearance.
  local function placement(worm, facing)
    local wx, wy, planter_id = worm.x, worm.y, worm.id
    local x, y = wx, wy - feet.burial
    -- Nothing moves during this callback. Snapshot native handles once and
    -- share terrain reads across the overlapping candidates in this search.
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

  -- Drop a turret for the firing worm, its owner's colour (not worm.team,
  -- its roster slot: online a blue team in slot 1 placed a red turret).
  function t.place(fire_ev)
    local worm = fire_ev.worm
    local alliance = worm.alliance or 0
    if alliance < 0 or alliance > 5 then alliance = 0 end
    local facing = worm.facing
    local idle = facing < 0 and 270 or 90
    local x, y = placement(worm, facing)
    if not x then
      -- The native placed shot consumes one charge; retain it on failure.
      local ammo = worm:ammo(t.weapon)
      if ammo >= 0 then worm:ammo(t.weapon, { set = ammo + 1 }) end
      wa.log("Sentry: no clear placement within " .. t.placement_reach .. "px; charge refunded")
      return nil
    end
    local body = wa.actors.spawn({
      sprite = false, x = x, y = y,
      vx = 0, vy = 0,
      loop = false, origin = "bottom", owner = worm, kind = t.kind, persist = true,
      gravity = true, drown = false,
      body = { shape = t.art.mask, hits = { land = true, objects = true },
        -- Planter passage narrows body collisions, never explosion damage.
        hit_by = { fire = true, dragon_ball = true, blasts = true } },
      on = { frame = brain, hit = hit, contact = touched },
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

  -- A planter cannot carry partial immunity into a later turn, even
  -- when the sentry is still falling.
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

  -- Each turn reloads and reactivates every turret, and forgets what moved
  -- and what it aimed at. Order-independent: each entry gets the same reset.
  wa.on.worm_message(function(_, msg)
    if msg ~= wa.msg.START_TURN then return end
    for id, s in pairs(state) do
      if s.body.id ~= id then state[id] = nil else
        s.ammo, s.active, s.disabled, s.had_target, s.tid, s.lost, s.seen = t.ammo, true, false, false, nil, false, {}
        if t.turn_begin then t.turn_begin(t, s) end
      end
    end
  end, { msgs = { wa.msg.START_TURN } })

  t.state = state -- for the Highlander mock
  turrets[#turrets + 1] = t
  return t
end

return turret
`
      },
      {
        path: 'lib/weapon.lua',
        name: 'lib/weapon.lua',
        language: 'lua',
        content: `-- Shared claim mechanics. Settings and callbacks belong to each weapon module.
local shared = require("lib/shared")
local owned = {}
shared.owns = function(id) return id ~= nil and owned[id] == true end
local weapon = {}

-- Always return fresh nested tables: configuration must not mutate defaults.
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
        content: `-- Selection and mode hints use WA's native banner, once per change.
local hints = {}
local readers = {}
local installed, shown, pending
-- WA's SelectWeapon message; observe it so reselecting the same weapon
-- restores its hint too. It is followed by WA's own selection banner.
local SELECT_WEAPON = 51

function hints.register(id, text)
  readers[id] = text
  if installed then return end
  installed = true
  local function reset() shown, pending = nil, nil end
  wa.on.turn_start(reset)
  wa.on.turn_end(reset)
  wa.on.worm_message(function(worm, msg)
    if not worm.turn then return end
    if msg == SELECT_WEAPON then reset(); return end
    local reader = readers[worm.weapon]
    local text = reader and reader(worm)
    if not text or worm.hp <= 0 then reset(); return end
    local key = worm.id .. ":" .. worm.weapon .. ":" .. text
    if shown == key then pending = nil; return end
    -- Let every weapon's input callback finish before announcing its value.
    -- Two matching simulation frames also leave WA's selection banner behind.
    if pending ~= key then pending = key; return end
    wa.hud.message_top(text, {to = "coalition", alliance = worm.alliance})
    shown, pending = key, nil
  end, {msgs = {SELECT_WEAPON, wa.msg.FRAME_FINISH}})
end

return hints
`
      },
      {
        path: 'scheme/highland_rules.lua',
        name: 'scheme/highland_rules.lua',
        language: 'lua',
        content: `-- Highlander gameplay: deal hands, refresh turn ammo, and transfer loot on death.
--
-- A port of Project X's \`scheme_hl_0rang3\` (Highlander 0rang3 1.1).
-- The source (\`highlander.txt\`) does all of this with four calls:
-- SetWeaponEx(team, weapon, 1) to grant and SetWeaponEx(team, weapon, 0) to
-- take away. \`worm:ammo(name, { set = n })\` is the same absolute write. It has
-- to be absolute: a stock scheme gives some of these weapons infinite ammo,
-- and adding to infinite leaves it infinite.
--
-- Where this differs from the source, on purpose:
--
--   * No turn-end removal. PX removes a worm's weapons at M_TURNEND and again,
--     through CurW, at the next M_TURNBEGIN. The second alone is enough, so
--     this listens for one message instead of two.
--
--     START_TURN (0x34) reaches only the worm whose turn it is: WA's handler
--     marks the receiver turn-active and calls TeamArena::SetActiveWorm on it
--     unconditionally (OpenWA \`msg_start_turn\`), which would be nonsense sent
--     to every worm. So the worm it arrives on IS the active worm.
--
--   * Every pooled slot is zeroed for every team at each turn start, not
--     just the previous worm's. PX relied on its scheme having those slots at
--     zero. Here the scheme can say anything, so the pack enforces it itself.
--
--   * PX's GiveWeapons also sets the Hot Air Balloon to 3 and the Wind
--     Changer to 1 each turn. The Highlander scheme gives them as weapon data
--     (profiles/Highlander.toml), so this file alone doesn't.
--
-- Lockstep: dealing, turn_start and death are all dispatched from WA's own
-- simulation messages, and every random choice is wa.random(). Two peers, or
-- a peer and a replay, deal the same hands and make the same grants. Nothing
-- here reads local input or the clock.
local shared = require("lib/shared")
local POOLS = shared.POOLS
local arsenal = shared.arsenal
local dead_hands = shared.dead_hands
local dealt = shared.dealt
local describe = shared.describe
local revived_by_lightning = shared.revived_by_lightning

-- ----------------------------------------------------------------- rules

-- One from each pool, dealt to a worm on the first message it receives -- as
-- PX does on each worm's first M_FRAME. Dealing everyone at once on the very
-- first message would assume every worm already exists by then; this makes no
-- such assumption. Worms receive messages in WA's own entity order, which is
-- the same on every peer, so the draws still come out of WA's RNG in the same
-- sequence everywhere.
local function deal(worm)
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
end

-- The hand, one use of each, for the turn. PX's GiveWeapons (the Hot Air
-- Balloons and the Wind Changer) is weapon data in the Highlander profile:
-- the engine gives it.
local function start_turn(worm)
  arsenal:apply(worm, { clear = true, each = 1 })
end

local function on_death(event)
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
end

wa.on.worm_message(function(worm, msg)
  if not dealt[worm.id] then
    deal(worm)
  end
end, { msgs = { wa.msg.FRAME_FINISH, wa.msg.START_TURN } })

-- A worm that comes in a dead worm's place (the Reinforcement) is a new
-- worm: a fresh hand, dealt at its first message as every worm's is, not
-- what the dead one held or left behind.
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
        content: `-- Highlander: the weapon pools. Each worm is dealt one weapon from each.
--
-- The pools are each placed weapon's settings under the hl.rules add-on
-- ("Highlander pool", "Dealt on cavern maps"), which components/highlander.lua
-- reads into shared.pools, by weapon id, before this loads. A PX weapon
-- suggests its PX pool in mod.toml.
local shared = require("lib/shared")

local pools = assert(shared.pools, "scheme/pools: components/highlander.lua sets the pools")

-- Every pooled weapon, in a fixed order. Zeroing walks this list, so it must
-- not depend on pairs() order: Lua's string hashing is seeded per process,
-- and a different order on each peer is a different sequence of writes.
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
        path: 'scheme/state.lua',
        name: 'scheme/state.lua',
        language: 'lua',
        content: `-- Highlander: the scheme's state. Split from rules.lua by tools/split_highlander.py.
local shared = require("lib/shared")
local POOLED = shared.POOLED

-- ----------------------------------------------------------------- state

-- The engine store is keyed by stable worm id (team * 16 + index), never by
-- entity address. It is virtual: WA's physical ammo is still alliance-shared
-- and is materialized from one worm's inventory at turn start.
local arsenal = wa.inventory.create({ id = "arsenal", slots = POOLED })
local dealt = {}
local dead_hands = {}
shared.revived_by_lightning = shared.revived_by_lightning or {}
local revived_by_lightning = shared.revived_by_lightning

-- The current Highlander port moves a dead worm's hand to the active worm.
-- A grave revived by Lightning also gets that original hand back. This is a
-- copy: the active worm keeps the weapons it already stole.
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
        content: `-- 3 Girder Pack: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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
        path: 'weapons/attack_helicopter.lua',
        name: 'weapons/attack_helicopter.lua',
        language: 'lua',
        content: `-- Attack Helicopter -- Project X's "COLADOR AEREO" (PX_pending/attack_helicopter.txt).
-- Ported by hand to WormForge API 4, as a weapon component.
--
-- PX: a custom missile body (\`heliShoot : CMissile\`, :3) fired from
-- \`CWorm::FireFinal\` when the fired weapon is named "COLADOR AEREO" (:423-494).
-- It is an air strike: WA shows its cursor, the click gives the target
-- (\`Desc->AddX/AddY\`, :427-428), and the body then enters from off the map
-- (\`Y=-288\`, \`X=-500\`/\`LevelSX+500\`, :434-445), hovers toward the target
-- (\`SpX=±15\`), fires 17 homing bullets (\`bulletCount\`, :31; 4-frame cadence,
-- :264-271), and finally leaves or blows up over water (:214-239).
--
-- Here the body is a Lua actor we move ourselves (\`wa.actors.spawn\`, the
-- Electromagnet pattern), the bullets are real WA missiles (\`wa.weapons.launch\`)
-- of the slot's **own record** -- PX's \`weps/bullet_wep.wep\`, which the same
-- click weapon carries: a weapon a worm never fires, only \`shoot\` launches it --
-- turned onto the target in \`wa.on.missile_frame\` (the Double Bazooka pattern),
-- and the blast-damage absorption (\`TakeExplosionDamage\`, :175-191) is the
-- actor's \`hit\` event. The strike itself is the Lightning Strike's shape
-- (Highlander weapons/lightning_strike.lua): a click-only strike --
-- \`on_select = { cursor = true }\` keeps WA's cursor and turn handling, and
-- \`on_click(ev)\` gets the coordinate and \`ev.worm\`. The side it enters from is
-- the worm's facing, as PX's own strike reads it (\`ev.worm.facing\`,
-- wklua_and_px/electrical.lua:157); the Highlander port's \`ev.vx\` guess
-- (weapons/electrical.lua:174, weapons/bowling_ball.lua:533) is not PX's. No
-- \`on_fire\` and no \`eat_fire\`: a real strike needs neither.
--
-- Art is one vertical PNG strip per PX sprite: \`empty\` (2 rotor frames),
-- \`aim\` (32), \`gun\` (2: idle, firing) and
-- \`casing\` (16, the shell), plus \`bullet.png\` for the bullets. The rotated
-- draws need the sheets in the GPU atlas (\`params.gpu_prefix\`).
--
-- What the API cannot carry (presentation/feel, none a blocker -- REPORT.md 9.3):
-- sound volume/pan and the rotor loop rate (\`wa.sound.play\` has neither), the
-- \`CSmoker\` on impact, and the \`CFire\` fan's directional velocity (the three
-- fires are placed apart instead). PX's \`CColMask(15,15,MakeCircleMask(15))\`
-- circle is dropped on purpose: an actor only takes \`mask = true\`, a square.
--
-- The rounds trail: PX's effect-manager trail, as a module (lib/px_trail.lua).
-- REPORT.md 11.9 maps it back to px_effects.c, and TRAIL.md is how to put it on
-- another weapon. The module is required at load, but is pure data until
-- trail.install() -- a component's file, and anything it requires, runs where
-- \`wa\` does not exist yet.
local trail = require("lib/px_trail")

return {
  defaults = {
    ammo = { round_start = -1 },
    delay = 0,
  },
  install = function(ctx)
    trail.install() -- the module's wa.on.missile_frame/wa.on.draw, now that wa is here
    -- --------------------------------------------------------------- tuning
    -- PX's own numbers, in pixels (PX is 16.16 fixed point, so "SpX = 15.0" is 15).
    local BULLETS        = ctx.option("bullets") -- PX bulletCount (:31), default 17
    local ENTER_Y        = -288    -- spawn height, above the map (:434)
    local SIDE           = 500     -- spawn offset past the map edge (:437,439)
    local HOVER          = 15      -- entry/hover speed (:443,445)
    local SHOOT_RANGE    = 450     -- begin firing within this of the target (:249)
    local COOLDOWN_START = 40      -- wind-up before the first shot (:252)
    local COOLDOWN_SHOT  = 4       -- frames between shots (:270)
    local BULLET_SPEED   = 35      -- homeToPlace speed (:387, "35.0")
    local BULLET_FRAMES  = 3       -- homeToPlace runs this long (:384)
    local BULLET_FUSE    = 3000    -- timeBeforeExplosion (:304)
    local MUZZLE         = 22      -- barrel length: the gun sheet's tip above its centre
    local BLAST_DAMAGE   = 80      -- Weap->launch.explosion.damage (:477)
    local BLAST_KIND     = 100     -- big blast (PX's pushPower 120 has no field here)
    local DEAD_DAMAGE    = 25      -- TakeExplosionDamage -> Collide above this (:190)
    local DRIFT          = 0.984   -- SpX damping while shooting (:263)
    local LEAVE          = 1.082    -- SpX growth after the magazine (:281)
    local TURN           = 0.75    -- gunAngle interpolation (:83)
    local ROTOR_TICKS    = 47      -- heli2Wav loop period (:229-233)
    local HALF_PI        = math.pi / 2
    -- The shell eject (:369-379): the same PxParticle(115) the sentry port runs
    -- as its casing (weapons/sentry_gun.lua:16-49) -- 16 frames, life 100,
    -- jitter +-0.3 rad, speed 2.0-3.0, gravity, no bounce.
    local CASING_FRAMES  = 16
    local CASING_LIFE    = 100     -- p->SetLifeTime(100) (:371)
    local CASING_JITTER  = 17      -- RandomFloat(-0.3, 0.3) rad (:372), in degrees
    local CASING_SPEED_MIN, CASING_SPEED_MAX = 200, 300 -- 2.0 .. 3.0 (:373), hundredths
    -- Mirror of the aiming worm and the gun, against the body's. PX's flags
    -- (:130-140): the body mirrors when flying left, the worm when flying right
    -- (the opposite \`wormTurnflag\`), the gun like the body. Seen in game with
    -- this art the worm and gun both came out on the wrong side, so both are
    -- flipped. The mirror flips the art ONLY: \`a:gfx\` takes the angle as given
    -- and does not reflect it (see \`place\`), so the angles are PX's raw ones and
    -- carry no mirror factor.
    local FLIP_AIM, FLIP_GUN = true, true

    local ART = "sprites/attack_helicopter/"
    local BULLET = "sprites/bullet.png" -- the redWeapSheet bullet PX draws itself (:364)
    local SND = "sounds/attack_helicopter/"

    local helis = {}   -- body actor id -> helicopter state
    local shots = {}   -- bullet missile id -> { x, y, frames } the homing target


    -- Round toward zero, as PX's fixed-point arithmetic does.
    local function trunc(n) return n < 0 and math.ceil(n) or math.floor(n) end

    local frame, hit -- forward declarations (the actor callbacks, defined below)

    -- PX's UpdateRotation (:69-91): the gun angle eases toward the straight-line
    -- angle to the target, and drives the aiming worm's 32-frame pose.
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

    -- PX's UpdateHelicopterRotation (:93-125): the body leans into its motion.
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

    -- PX's Draw (:127-173): three sprites -- the body (2 frames), the aiming
    -- worm (32 frames) and the gun (2 frames: idle, firing). A lower depth is
    -- nearer, so the gun goes on top: gun (PX z 4.9) in front of the worm (5.1)
    -- in front of the body (10.01).
    local function place(h)
      local a, aim, gun = h.body, h.aim, h.gun_actor
      local right = h.dir >= 0
      -- PX mirrors its art with \`turnflag\` (:127-140); our sheets are the
      -- mirror of PX's sprite bank, so the flags invert. \`facing\` flips the art
      -- only: \`a:gfx\` takes the angle as given and does NOT reflect it for a
      -- mirrored actor (the Highlander missile follow sprite relies on the same,
      -- lib/missile_sprites.lua:140,158), so every part is drawn at PX's raw
      -- angle -- only the art's own mirror carries the flip. The gun's absolute
      -- bearing is negated (PX's clockwise \`HALF_PI + final\` reads the other way
      -- here); the body/worm lean is the signed \`heliRotation\` and keeps its sign.
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

      local final = right and h.gun or (math.pi - h.gun) -- (:161-165) mirror left
      gun.x, gun.y, gun.facing = gx, h.y + 12, gface
      -- The gun sheet is a 2-frame trim of PX's multiplex: frame 0 idle, 1 firing.
      gun:frame(h.firing and 1 or 0)
      -- PX draws the gun at \`HALF_PI + finalRenderAngle\` (:170); the art's own
      -- mirror is the only flip.
      gun:gfx({ angle = -math.deg(HALF_PI + final) % 360, depth = wa.depth.OBJECTS })
    end

    -- Clear every actor of a helicopter and forget it. The companions go first:
    -- despawning an already-exploded body can throw, and a skipped companion
    -- would strand a gun sprite on the map -- the "cursor" that would not leave.
    local function despawn(a)
      if a and not a.dead then a:despawn() end
    end
    local function drop(h)
      helis[h.body.id] = nil
      despawn(h.aim)
      despawn(h.gun_actor)
      despawn(h.body)
    end

    -- PX's ExplodeAt (:392-421) plus the missile's own blast: three fanned fires,
    -- then the 80-damage explosion. (The fan's SpX/SpY cannot be carried; the
    -- three fires are placed apart instead.)
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

    -- PX's shell eject (:369-379): a casing thrown sideways off the barrel, with
    -- a little random angle and speed, gravity and no bounce, gone after 100
    -- frames. The sentry port's \`casing()\` (weapons/sentry_gun.lua:16-49) is the
    -- same PxParticle(115); its sprite is WA's uzicase sheet.
    local function eject(h)
      local ang = h.gun + HALF_PI + math.rad(wa.random(-CASING_JITTER, CASING_JITTER))
      local speed = wa.random(CASING_SPEED_MIN, CASING_SPEED_MAX) / 100
      local life, spin = CASING_LIFE, 0
      wa.actors.spawn({
        sprite = ART .. "casing.png", x = h.x, y = h.y + 10, -- PX: PosX, PosY + 10 (:369)
        vx = wa.math.cos(ang) * speed, vy = wa.math.sin(ang) * speed,
        gravity = false, collide = false, owner = h.owner, kind = "casing",
        on = function(c)
          life = life - 1
          if life <= 0 then c:despawn(); return end
          c:gravity()
          c:move({ terrain = false, worms = false })
          spin = (spin + 1) % CASING_FRAMES
          c:frame(spin)
        end,
      })
    end

    -- PX's target selection in shootBullet (the FindWormInBox / FindShootableInBox
    -- calls, with IsInBox strict on all four sides). Each Find picks uniformly at
    -- random among its matches (PX's reservoir sampling), so the draws come from
    -- wa.random in a fixed object order: worms, mines, crates, oil.
    local function in_box(o, l, r, t, b)
      return o.x > l and o.x < r and o.y > t and o.y < b
    end

    -- FindWormInBox(l, r, t, b, true): living worms, the firing worm excluded.
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

    -- FindShootableInBox: worms, mines, crates and oil drums. No exclusion of the
    -- firing worm here -- the caller compares, as PX does. (Dead worms are
    -- skipped, which PX's version does not bother with.)
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

    -- TraceLine(this, PosX, PosY, o->PosX, o->PosY, CMASK_TERRAIN): clear when
    -- nothing of the terrain is hit. Traced from the helicopter's centre.
    local function clear(h, o)
      return wa.land.trace(math.floor(h.x), math.floor(h.y),
        math.floor(o.x), math.floor(o.y)) == nil
    end

    -- Where a bullet is aimed: a visible worm near the click, else a visible
    -- shootable near it, else one underneath the flight path, else the click.
    local function pick_target(h)
      local tx, ty = h.tx, h.ty
      local function is_cur(o) return o.kind == "worm" and o.id == h.owner.id end

      local worm = find_worm(h, tx - 130, tx + 130, ty - 70, ty + 80)
      if worm and clear(h, worm) then
        return worm.x, worm.y
      end
      -- Fallback: the worm was missing or covered (the find has no trace in it).
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
      return tx, ty -- PX: shoots at the click itself (sometimes "kinda fun")
    end

    -- PX's shootBullet (:288-380): pick a shooting sound, launch a real missile
    -- at the muzzle and remember the target so wa.on.missile_frame can home it.
    local function shoot(h)
      wa.sound.play(h.owner, SND .. "hks" .. wa.random(1, 3) .. ".wav")
      h.firing = true
      -- PX spawns each round at PosX + spriteXOffset + 10, PosY + spriteYOffset
      -- + 20 (:310-311), a fixed offset from the gun's anchor -- that reads as a
      -- nudge off the hull, not the barrel. Fire from the muzzle instead: the
      -- gun's anchor plus the barrel length turned by the gun's drawn angle. The
      -- hull carries no collision mask (we did not add PX's), so nothing blocks
      -- the round at the tip.
      local right = h.dir >= 0
      local gx = h.x + (right and 5 or -5) -- the gun's anchor x (:136, :150)
      local final = right and h.gun or (math.pi - h.gun)
      local ang = -(HALF_PI + final)          -- the gun's drawn angle, radians
      local gface = right and 1 or -1         -- the gun's own mirror
      local lx, ly = gface * 1, -MUZZLE        -- tip in the sheet, from its centre
      -- Turn that offset by the same angle the gun is drawn at (\`place\` passes
      -- \`deg(ang)\` to a:gfx), in the engine's own sense: a local (x, y) lands at
      -- (x*cos - y*sin, x*sin + y*cos), y down on screen. The turret proves it
      -- (\`lib/turret.lua:109-113\` against its drawn \`90 - angle\` at \`:590\`): its
      -- muzzle offset is the aim direction, and no art orientation satisfies that
      -- unless the engine turns a:gfx's angle this way. Both sines had the other
      -- sign here, so the tip was turned by \`-ang\` -- a lateral error of
      -- \`2 * sin(ang) * MUZZLE\` that vanishes when the gun points straight down
      -- (ang = 180 deg, sin = 0), which is exactly how it read in game.
      local cos, sin = wa.math.cos(ang), wa.math.sin(ang)
      local sx = gx + cos * lx - sin * ly
      local sy = (h.y + 12) + sin * lx + cos * ly
      -- The round: PX's runtime values ride as \`missile\` overrides on a weapon
      -- that is already on the scheme (\`stock.bazooka\`, as PX sets \`damage\` 13
      -- and \`timeBeforeExplosion\` 3000 at :298, :304). WA's own trail is off
      -- (\`trail = { sprite = 0 }\`) because the trail drawn is PX's
      -- (lib/px_trail.lua); gravity and wind are off because PX zeroes its
      -- bullet's \`GravityFactor\` for the whole flight (:386, "Stable
      -- direction"), so the bullet flies the straight line PX aims along and
      -- nothing has to be compensated for. The \`missile\` keys are the \`.wep\`
      -- field names (\`docs/weapon-records.md\`), which is why \`gravity_pct\` and
      -- \`wind_pct\` take (verified in match, REPORT.md 11.8).
      -- A \`missile\` override on PX's own bullet record crashed WA on launch
      -- (Access Violation, null read; REPORT.md 11.8), so what the slot builds
      -- on is not what is launched.
      local id = wa.weapons.launch({
        weapon = "stock.bazooka", owner = h.owner, x = sx, y = sy, vx = 0, vy = 0,
        missile = { trail = { sprite = 0 }, explosion = { power = 13 }, fuse = BULLET_FUSE,
          gravity_pct = 0, wind_pct = 0 },
      })
      if id then
        -- PX aims each bullet at the picked target, +-1 random on its x (:362).
        local tx, ty = pick_target(h)
        shots[id] = { x = tx + wa.random(-1, 1), y = ty, frames = BULLET_FRAMES,
          owner = h.owner }
        trail.add(id, h.owner,  {every = 1, g = 30, b = 10}) -- the round's trail, drawn by lib/px_trail.lua
      end
      eject(h) -- (:369) the casing, after the shot
    end

    -- PX's heliShoot::Message M_FRAME (:203-284).
    frame = function(a)
      local h = helis[a.id]
      if not h then return end
      local w = wa.world.size().w

      -- Gone off the map either side (:214-217): just leave.
      if (h.vx >= 0 and h.x >= w + SIDE + 50) or (h.vx < 0 and h.x < -(SIDE + 50)) then
        drop(h)
        return
      end
      -- Magazine spent, over water and on the map (:234-239): blow up.
      if h.done and h.y >= wa.world.water() and h.x < w + 300 and h.x > -300 then
        boom(h)
        return
      end

      update_rot(h)

      -- Acquire and begin firing within 450 px (:243-256).
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
        h.vx = h.dir * 0.15 -- (:261)
      end
      if h.shooting then h.vx = h.vx * DRIFT end -- (:263)

      h.firing = false
      if h.shooting and h.cooldown == 0 then
        update_aim(h, false)
        shoot(h)
        h.shots = h.shots + 1
        h.cooldown = COOLDOWN_SHOT
      elseif h.shooting and h.cooldown > 0 then
        update_aim(h, false)
        h.cooldown = h.cooldown - 1
      end
      if h.shots >= BULLETS and not h.shooting then
        h.done = true
        if math.abs(h.vx) < HOVER then h.vx = h.vx * LEAVE end -- (:281)
      end

      h.x = h.x + h.vx
      h.frame = (h.frame + 1) % 2
      h.ticks = h.ticks + 1
      if h.ticks % ROTOR_TICKS == 0 then wa.sound.play(h.owner, SND .. "loop.wav") end
      place(h)
    end

    -- PX's TakeExplosionDamage (:175-191): less the further off, and it only
    -- throws the helicopter if the leftover is over 25.
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

    -- The strike: the click gives the target and the side. PX enters from the
    -- side the shot aimed at (\`Desc->SpX\`, :436-445).
    local function fire(worm, x, y)
      if not worm or not x or not y then return end
      local w = wa.world.size().w
      -- PX enters from the side the aim points (\`Desc->SpX <= 0\`, :436-445); the
      -- click's facing sign is that aim (\`ev.worm.facing\`).
      local from_left = (worm.facing or 1) <= 0
      local h = {
        owner = worm, tx = x, ty = y,
        dir = from_left and 1 or -1,          -- the direction it drifts
        x = from_left and -SIDE or (w + SIDE),
        y = ENTER_Y,
        vx = (from_left and 1 or -1) * HOVER,
        shots = 0, cooldown = 0, shooting = false, done = false, firing = false,
        gun = -math.pi, worm_frame = 0, rot = 0, frame = 0, ticks = 0,
      }
      h.body = wa.actors.spawn({
        sprite = ART .. "empty.png", x = h.x, y = h.y, vx = 0, vy = 0,
        gravity = false, collide = true, owner = worm, as_object = true, mask = true,
        on = { frame = frame, hit = hit },
      })
      h.aim = wa.actors.spawn({ sprite = ART .. "aim.png", x = h.x, y = h.y,
        gravity = false, collide = false, owner = worm, on = function() end })
      h.gun_actor = wa.actors.spawn({ sprite = ART .. "gun.png", x = h.x, y = h.y,
        gravity = false, collide = false, owner = worm, on = function() end })
      helis[h.body.id] = h
    end

    wa.log(("Attack Helicopter at %s %d"):format(ctx.position.row, ctx.position.column))

    wa.weapons.replace({
      -- This slot also launches the helicopter's bullets, so its bullet
      -- record must stay intact; the strike itself needs an open-sky map.
      available_in_caves = false,
      -- The slot is the profile's (\`F6 2\`); a component names no \`weapon\`, only
      -- the record it builds on. The record is PX's **bullet** (\`bullet_wep.wep\`,
      -- name "bullet"; damage 13 at +0x54, fuse 3000 at +0x20, a type-3 cursor
      -- record): one slot carries both the click weapon and the round \`shoot\`
      -- launches, because a manual launch fires the slot's own record
      -- (REPORT.md 11.8). \`heliWeap.wep\` is no longer used.
      wep = "weps/bullet_wep.wep",
      panel_icon = "sprites/helishootico.png", -- PX's own icon (helishootico.png)
      -- One vertical strip per PX sprite, with animation in mod.toml.
      sprites = { ART .. "empty.png", ART .. "aim.png", ART .. "gun.png", ART .. "casing.png", BULLET,
        trail.BEAM, trail.GLOW },
      params = { gpu_prefix = "sprites/" }, -- route the sheets into the GPU atlas for a:gfx
      sounds = { SND .. "hks1.wav", SND .. "hks2.wav", SND .. "hks3.wav", SND .. "loop.wav" },
      -- Click-only dispatch keeps the strike's cursor and turn handling, exactly
      -- as the Lightning Strike / Reinforcement (weapons/reinforcement.lua,
      -- :319-337): the worm never fires the record, and the click only picks the
      -- target. \`on_select.cursor\` overrides the record's own aim mode, so the
      -- cursor does not depend on the record being a strike. No on_fire, no
      -- eat_fire -- an eat would also swallow the turn end (REPORT.md 11.7). The
      -- panel name comes from the component (mod.toml).
      on_select = { cursor = true },
      on_click = function(ev) fire(ev.worm, ev.x, ev.y) end,
    })

    -- PX's homeToPlace (:382-390): for its first frames each bullet turns hard
    -- onto the point it was aimed at, then flies straight (WA flies it on). PX
    -- runs it before super, so it is the frame's "pre" phase.
    --
    -- PX also draws each bullet itself (redWeapSheet, :364) with WA's own
    -- sprite left at 0 (:301), turned to its flight (WAT_TrackMovement, :303):
    -- the Highlander missile-sprite pattern (lib/missile_sprites.lua:112-159)
    -- hides WA's sprite and follows the missile with a GPU actor.
    local follow = {} -- missile id -> { actor, seen }
    local function gone(id)
      return function(b)
        local f = follow[id]
        if f and f.seen then f.seen = false; return end
        -- The round is gone -- the same test that drops its sprite. Its trail
        -- stays behind: lib/px_trail.lua sheds it and draws it.
        trail.drop(id)
        follow[id] = nil
        shots[id] = nil
        b:despawn()
      end
    end
    wa.on.missile_frame(function(m)
      local s = shots[m.id]
      if not s then return end
      if m.phase == "pre" then
        m.sprite = 0 -- WA draws nothing for it; ours is drawn below
        if s.frames <= 0 then return end
        s.frames = s.frames - 1
        -- PX's homeToPlace (:382-390), aiming flat at the target at PX's own
        -- 35.0 -- which is exact, because the round has neither gravity nor wind
        -- (\`missile = { gravity_pct = 0, wind_pct = 0 }\` above, PX's own
        -- \`GravityFactor = 0\`, :386). A weapon that has to keep gravity aims
        -- with PX's SolveBallistic instead: TRAIL.md.
        local dx, dy = s.x - m.x, s.y - m.y
        local len = math.sqrt(dx * dx + dy * dy)
        if len > 0 then
          m.vx, m.vy = dx / len * BULLET_SPEED, dy / len * BULLET_SPEED
        end
        return
      end
      local f = follow[m.id]
      if not f then
        f = { actor = wa.actors.spawn({
          sprite = BULLET, x = m.x, y = m.y, gravity = false, collide = false,
          owner = s.owner, on = gone(m.id),
        }) }
        follow[m.id] = f
      end
      f.seen = true
      local b = f.actor
      b.x, b.y, b.vx, b.vy = m.x, m.y, 0, 0
      b.facing = m.vx < 0 and -1 or 1
      -- WeapSprite::CalculateAngle, WAT_TrackMovement (rotation 0).
      local rot = -wa.math.atan(m.vx, m.vy) - math.pi
      b:gfx({ angle = math.deg(rot) % 360, depth = wa.depth.OBJECTS - 1 })
    end)
  end,
}
`
      },
      {
        path: 'weapons/auto_ballista.lua',
        name: 'weapons/auto_ballista.lua',
        language: 'lua',
        content: `-- Auto Ballista: PyroMan's (Project X's p_turrets library: arrowturret.txt).
-- A turret (lib/pyro_turret.lua) that shoots WA's own arrows, the Longbow's,
-- at moving enemies, eight a turn, damage 10, a quarter of WA's gravity on
-- them, so nearly straight: its aim allows a frame per 10 pixels. Arrows
-- pass through it, and its own side's never hurt it.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {}

function weapon.definition()
  local fires = require("lib/shared").fires
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.mine",
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
    -- nil when WA makes none (its object pool full): PX fires on regardless.
    wa.arrows.spawn({ owner = t.owner(a, s), x = shot.x, y = shot.y,
      vx = shot.dx * force, vy = shot.dy * force, damage = 10, gravity_pct = 25 })
    return true
  end

  local t = pyro.new({
    kind = "auto_ballista", weapon = "px.auto_ballista", frames = pyro.FRAMES.ballista,
    ammo = 8, tower_len = 16, g_factor = 0.25,
    aim_time = function(dist) return dist / 10 + 1 end, -- "500 pixels per sec"
    -- PX's ColGroup without its arrows flag: arrows fly through it.
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
        content: `-- Banana Express: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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
        path: 'weapons/blaster_worm.lua',
        name: 'weapons/blaster_worm.lua',
        language: 'lua',
        content: `-- Blaster Worm: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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
    cluster = { sprite = "sprites/blaster_worm/cluster.png" },
    sprite_overrides = { wsvbu = "sprites/blaster_worm/cluster_trail.png" },
    -- 249
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
        content: `-- Blast Zone: PX's zone launcher, the exploding half of the pair. This is the
-- entry point the component's install runs; the port itself is
-- lib/px_blast_zone.lua, which needs \`wa\` and so is loaded here rather than at
-- load (REPORT.md 11.11).

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
        content: `-- Bowling Ball Strike: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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

function weapon.setup()
  -- Highlander: Bowling Ball Strike (PX weapon_bowlingball: bbstrike.txt and
  -- bowlingball.txt's CBowlingBall).
  local shared = require("lib/shared")
  local fires = shared.fires

  -- The strike: PX's plane (pxairstrike's PxAirstrike) drops three balls 48
  -- pixels apart from 128 above the map, moving 5 a frame the way it flies:
  -- the way WA's strike arrow points, the sign of the shot's x speed (ev.vx),
  -- from the left unless the arrow keys turned it. As PX's plane drops them
  -- early by how far they drift on the way down (its SpeedCompensation), the
  -- drop line is set back by the middle ball's own drift down to the click, so
  -- it lands on the click. The plane is WA's air strike jet with its sound: it
  -- comes in from 16 pixels off the map's edge, 48 pixels a frame (a ball's
  -- spacing each frame, PX's FramesBetweenBombs of 1), so that it is over a
  -- drop point every frame it is over the drops, drops a ball there and goes
  -- on until it is 16 pixels past the far edge.
  local STRIKE_BALLS = 3
  local STRIKE_SPACING = 48
  local STRIKE_SPEED = 5
  local STRIKE_Y = -128         -- PX's PlaneAppearYOffset
  local PLANE = "airjetb"       -- WA's air strike jet, sprite 86 (PxAirstrikeParams' Sprite)
  local PLANE_SOUND = 52        -- WA's air strike sound (its Sound)
  local PLANE_EDGE = 16         -- PX's PlaneAppearXOffset

  -- PX's CBowlingBall numbers.
  local RADIUS = 16             -- MakeCircleMask(16): the ball's art is 32 across
  local BOUNCE, FRICTION = 0.03, 0.02
  local INERTIA_X, INERTIA_Y = 0.8, 0.4
  local LOW_SPEED = 4.0         -- below this for LOW_FRAMES frames: "low speed"
  local LOW_FRAMES = 100
  local LOW_BOUNCE, LOW_FRICTION = 0.03, 0.03
  local LOW_INERTIA_X, LOW_INERTIA_Y = 0.0, 0.0
  local SLEEP_DISTANCE = 2      -- moved less than this over SLEEP_PERIOD frames: asleep
  local SLEEP_PERIOD = 80
  local SUPPORT = 2             -- asleep, what holds it is within this below it
  local FAST = 4.0              -- MinDamageSpeed: faster, it rolls through worms and hurts
  local SPIN_X, SPIN_Y, MAX_SPIN = 0.06, 0.02, 0.6
  local SHEET = "sprites/bowling_ball/ball.png"

  -- PX's damage (ProcessBallOnOtherCollision): faster than FAST, whatever the
  -- ball overlaps takes 5 at that speed up to 60 at 15 and more; crates and oil
  -- drums 100. A worm then takes nothing more for 12 frames (PX's
  -- DamageRecoverTime). Balls push each other apart (ProcessBallOnBallCollision)
  -- by 0.6 * sqrt(speed), of which the pushed ball keeps 0.7 (GunForceMultiplier).
  local MAX_DAMAGE_SPEED = 15.0
  local MIN_DAMAGE, MAX_DAMAGE = 5.0, 60.0
  local OBJECT_DAMAGE = 100
  local DAMAGE_FORCE = 0.7      -- DamageForceMultiplier
  local RECOVER_FRAMES = 12
  local PUSH_SPEED = 4.0        -- MinPushSpeed
  local PUSH_FORCE, PUSH_KEEP = 0.6, 0.7
  local SOUND_CRUSH, SOUND_HIT = 33, 101
  -- A ball counts as hitting what it touches: PX traces it with a smaller
  -- mask than the 16-pixel circle it hits with, so it overlaps a drum or
  -- crate it stops against; ours traces with the circle, which stops it a
  -- touch away from them.
  local TOUCH = 2

  -- PX's Zap(0), the Lightning Strike's "overcharge": the ball wakes and is
  -- thrown up, 5 to 10 a frame within 0.1 of straight up, and is electrified
  -- for good (PX never counts its ZapTurnsRemaining down): awake and not slow,
  -- its friction is negative, so it speeds up along what it rolls on. PX's
  -- strike reaches it within its 12-pixel hit circle of the ball's 16.
  -- What WA hits the ball with. It is in WA's object layer (\`as_object\`), as
  -- PX's ball is in the oil drums' (SetLayerOverride(LAYER_OILDRUM)), so WA's
  -- fires, guns and blasts reach it. As PX's Message: any hit wakes it, a
  -- blast's push is taken whole (ExplosionForceMultiplier) and any other's,
  -- a fire's among them, at 0.7 (GunForceMultiplier).
  local BLAST_FORCE, GUN_FORCE = 1.0, 0.7
  local ZAPPED_FRICTION = -0.05
  local ZAP_REACH = 12

  -- PX's electrified look (CBowlingBall::Render and UpdateZPlane), PX's own
  -- art: its lightning glow, 0.3 to 0.4 of its 128 pixels across, added three
  -- times in RGB(80, 110, 128); its 10-frame spark, turning with the ball,
  -- played over 50 frames then paused 20 (SparkCycle, 0.02 a frame to 1.4);
  -- and while awake a glow left behind every frame, 30 frames fading to
  -- black, 0.3 to 0.5 across, drifting up to 0.3 a frame. Drawn where the
  -- ball's sprite is: the glows behind the ball (a halo; PX draws them over
  -- it, which washes the ball out to white), the spark in front. Our own on
  -- top of PX's: the ball itself turns electric blue, darkened (its sprite's
  -- tint) and given a blue sheen that follows its shading (sheen.png, the
  -- ball in grey, added in front of it).
  local GLOW_SHEET = "sprites/bowling_ball/glow.png"
  local SPARK_SHEET = "sprites/bowling_ball/spark.png"
  local SHEEN_SHEET = "sprites/bowling_ball/sheen.png"
  local ZAPPED_TINT = 0x405980  -- the ball's colours times (0.25, 0.35, 0.5)
  local SHEEN_COLOR = 0xFF3C96FF -- RGB(60, 150, 255), added
  local GLOW_SIZE = 128
  local SPARK_SIZE, SPARK_FRAMES = 60, 10
  local SPARK_SPEED, SPARK_CYCLE = 0.02, 1.4
  local ZAP_R, ZAP_G, ZAP_B = 80, 110, 128
  local TRAIL_LIFE = 30
  -- The ball is drawn this far below where its circle is, in pixels: at the
  -- circle's own place it looked to float over the ground. In front of the
  -- terrain (actors are behind it by default), behind the worms (0xD0000).
  local SPRITE_DROP = 4
  local LIFT = 0.5           -- half a pixel
  local BALL_DEPTH = wa.depth.OBJECTS
  local GLOW_DEPTH, SHEEN_DEPTH, SPARK_DEPTH = BALL_DEPTH + 1, BALL_DEPTH - 1, BALL_DEPTH - 2
  -- ball flung that far off the map (it flies on, WA drawing its arrow at the
  -- edge) is gone once its next move would leave that range.
  local EDGE = 32000

  -- What the ball rolls on: PX's DefaultColGroup, and without worms when fast
  -- (NoWormsColGroup).
  local SOLID = { "terrain", "worms", "crates", "oil" }
  local SOLID_FAST = { "terrain", "crates", "oil" }

  local function trunc(v) return v >= 0 and math.floor(v) or -math.floor(-v) end

  -- The circles PX's masks give what the ball can hit (as wa.world.trace's).
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

  -- PX's Wake: moving again, its timers restarted.
  local function wake(b)
    if not b.asleep and not b.low then return end
    b.asleep, b.low = false, false
    b.low_timer, b.sleep_timer = 200, 200
    b.rec_x, b.rec_y = b.x, b.y
  end

  -- PX's UpdateRotation: spin from the ball's real motion, towards it.
  local function spin(b)
    local rot = math.min(MAX_SPIN, SPIN_X * math.abs(b.rvx) + SPIN_Y * math.abs(b.rvy))
    if b.rvx < 0 then rot = -rot end
    b.rot = b.rot + rot
    while b.rot > math.pi do b.rot = b.rot - 2 * math.pi end
    while b.rot <= -math.pi do b.rot = b.rot + 2 * math.pi end
  end

  -- PX's PhysicsThink, a frame: the move traced with the ball's circle, a hit
  -- turned into bounce along the surface's normal and friction along it, then
  -- PX's inertia (a share of the speed's last change again), the low-speed
  -- state and sleep. The ball's place is b.x, b.y; the actor only draws it.
  -- Returns the speed the frame started with, which the hits below go by.
  local function think(b)
    if b.asleep then
      -- No real speed asleep, as PX's: it stops turning too.
      b.x, b.y = b.sleep_x, b.sleep_y
      b.rvx, b.rvy = 0, 0
      -- Ours, not PX's: a ball asleep on what has gone (a worm that walked
      -- off, an oil drum that blew, land dug away) wakes and falls, where PX's
      -- would hang there until something hit it.
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
      -- Eight moves backwards may not fit where one forward does: no trace.
      if math.abs(sx + k * dx) > EDGE or math.abs(sy + k * dy) > EDGE then return nil end
      return wa.world.trace({
        x0 = sx, y0 = sy, x1 = sx + k * dx, y1 = sy + k * dy, radius = radius or RADIUS, with = group,
      })
    end
    local res = trace_from(x, y, 1, with)
    if res and res.starts_solid then
      -- Started inside something. As PX's: a worm (one that flew or walked
      -- into the ball) is no reason, so the move is tried again without
      -- worms; still inside, it carries on from where the path comes free, or
      -- backs out along the move eight times its length and comes forward
      -- from there, with the ball's circle, then with a single point (PX's
      -- MASK_PIXEL); only then is it stuck, and sleeps where it is. Trying
      -- again with worms left a ball a worm hit mid-air asleep in the air.
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
      -- Rest half a pixel off the surface, as PX's ball does (it stops a
      -- step short, up to a pixel): touching it, a ball gliding along would
      -- hit it at once every frame and stand still at speed.
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
    -- Slow for long enough: low speed, no inertia, so it settles.
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

  -- Frames counted by the oldest ball still rolling: the worms' 12-frame
  -- recovery needs a clock, and only balls hit.
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

  -- PX's ProcessBallOnBallCollision: every other ball this one overlaps is
  -- pushed away from it, and wakes.
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

  -- A standing worm hit from above, straight down, is crushed (PX's
  -- "crushable" states, the ones a worm stands in).
  local CRUSHABLE = { standing = true, firing = true, fired = true, prefiring = true }

  -- PX's ProcessBallOnOtherCollision: the hit's damage from the ball's speed,
  -- and its push from how the ball really moved this frame.
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
        obj:hurt({ amount = damage, vx = fx, vy = fy })
      else
        obj:hit(damage, fx, fy)
      end
      a:sound(crushed and SOUND_CRUSH or SOUND_HIT)
    end
    for _, group in ipairs({ wa.worms, wa.mines, wa.crates, wa.oil }) do
      for _, obj in ipairs(group.all() or {}) do hit(obj) end
    end
  end

  -- The balls by id, in id order: whatever draws from WA's RNG for them does
  -- so in the same order on every machine.
  local function balls_in_order()
    local ids = {}
    for id in pairs(shared.bowling_balls) do ids[#ids + 1] = id end
    table.sort(ids)
    return ids
  end

  -- PX's Zap: Zap(0) electrifies (mul 1), Zap(1), for a ball already
  -- electrified, throws it at 0.8 and changes nothing else.
  local function zap(b, mul)
    if not b.zapped then b.spark, b.trail, b.seed = 0, {}, b.trail_seed end
    b.zapped = true
    wake(b)
    local ang = (wa.random(0, 2000) - 1000) / 10000
    local speed = (5 + wa.random(0, 1000) / 200) * (mul or 1)
    -- sin and cos by their series: |ang| <= 0.1, so exact to 1e-7, and no
    -- trig in the simulation.
    local a2 = ang * ang
    b.vx = (ang - ang * a2 / 6) * speed
    b.vy = -(1 - a2 / 2 + a2 * a2 / 24) * speed
  end

  -- The Lightning Strike: every ball within reach of where it hit.
  -- PX's Ferret flicks a ball as it flicks a mine (the ball is one): a ball
  -- whose circle touches the Ferret's, radius \`reach\` at (x, y), wakes and is
  -- thrown at (vx, vy), pixels a frame. Balls in id order.
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

  -- The Electric Grenade's arc (PX's Tazer, whose targets include the ball):
  -- the balls as targets, at the middle of the drawn ball, in id order.
  local function as_target(id, b)
    return { kind = "ball", id = id, x = b.x, y = b.y + SPRITE_DROP,
      alliance = b.alliance, moving = b.vx ~= 0 or b.vy ~= 0 }
  end

  -- The Sentry Laser's disintegration (PX: Sleep, then Free): gone at once,
  -- its actor at its next frame.
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

  -- The arc's zap (PX's CTazerDamage::Zap): Zap(0) the first time, Zap(1)
  -- once electrified. No damage, no push besides.
  shared.zap_bowling_ball = function(id)
    local b = shared.bowling_balls[id]
    if b then zap(b, b.zapped and 0.8 or 1) end
  end

  -- Where a beam from (x0, y0) along the unit (dx, dy), at most len pixels,
  -- first meets a ball's circle (PX's ball is an oil drum to the strike's
  -- trace), or nil.
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

  -- The electrified look, a game frame on: the spark's cycle, and the trail
  -- left behind, from the ball's own generator (looks only: nothing reads it,
  -- and WA's RNG is not drawn).
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

  local function spawn_ball(owner, x, y, vx, vy)
    local b = {
      x = x, y = y, vx = vx, vy = vy, lvx = vx, lvy = vy, rvx = 0, rvy = 0, lx = x, ly = y,
      rot = 0, low = false, low_timer = 200, sleep_timer = 200, rec_x = x, rec_y = y,
      asleep = false, alliance = owner and owner.alliance,
    }
    local a = wa.actors.spawn({
      sprite = SHEET, x = x, y = y + SPRITE_DROP, gravity = false, collide = false, owner = owner,
      as_object = true,
      on = {
        hit = function(_, hit) take_hit(b, hit) end,
        frame = function(a)
          if b.gone then
            a:despawn()
            return
          end
          if b.y >= wa.world.water() then
            shared.bowling_balls[a.id] = nil
            a:despawn()
            return
          end
          -- Custom movement samples the same global field as native bodies.
          -- A ball gets PX's quarter share; stationary fields leave sleepers
          -- alone, while moving/discharging sources wake them.
          local fx, fy, _, waking = wa.magnetism.sample(b.x, b.y, a)
          if waking then wake(b) end
          if not b.asleep then
            b.vx, b.vy = b.vx + fx * 0.25, b.vy + fy * 0.25
          end
          tick(a.id)
          if b.zapped then electrified_frame(b) end
          spin(b)
          -- Before its Lua terrain sweep, using the actual ball centre and
          -- velocity rather than the display actor's deliberately zero speed.
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
            a:despawn()
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
    return a, b
  end
  shared.spawn_bowling_ball = spawn_ball

  -- How far a ball dropped at y0 moving vx drifts sideways before its centre
  -- falls to y1: think's flight through the air, gravity and PX's inertia,
  -- frame by frame (no trig, the same on every machine).
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
    -- Where the balls drop, in the order the plane passes over them.
    local drops = {}
    for i = 1, STRIKE_BALLS do
      drops[i] = ev.x - back + (i - (STRIKE_BALLS + 1) / 2) * STRIKE_SPACING * dir
    end
    -- How many of its frames before it is over the first: it starts that many
    -- spacings back, off the map's edge.
    local width = wa.world.size().w
    local lead = 0
    while (dir > 0 and drops[1] - lead * STRIKE_SPACING > -PLANE_EDGE)
      or (dir < 0 and drops[1] + lead * STRIKE_SPACING < width + PLANE_EDGE) do
      lead = lead + 1
    end
    local x0 = drops[1] - lead * STRIKE_SPACING * dir
    local step = 0
    local plane = wa.actors.spawn({
      sprite = PLANE, x = x0, y = y0, gravity = false, collide = false, owner = ev.worm,
      on = function(a)
        local k = step - lead + 1
        if k >= 1 and k <= STRIKE_BALLS then
          spawn_ball(ev.worm, drops[k], y0, STRIKE_SPEED * dir, 0)
        end
        step = step + 1
        a.x, a.y, a.vx, a.vy = x0 + step * STRIKE_SPACING * dir, y0, 0, 0
        if (dir > 0 and a.x > width + PLANE_EDGE) or (dir < 0 and a.x < -PLANE_EDGE) then
          a:despawn()
        end
      end,
    })
    -- The jet's art faces left; flying right, it is drawn mirrored.
    plane.facing = -dir
    wa.sound.play(plane, PLANE_SOUND)
  end

  if wa.on.draw and wa.draw.quad then
    -- Resolve the pack namespace once, rather than on every submission.
    local glow_sheet = wa.sprites.key(GLOW_SHEET)
    local spark_sheet = wa.sprites.key(SPARK_SHEET)
    local sheen_sheet = wa.sprites.key(SHEEN_SHEET)
    -- One spec refilled for every quad (the engine copies it).
    local QUAD = { points = { { 0, 0 }, { 0, 0 }, { 0, 0 }, { 0, 0 } } }
    local function quad(sheet, frame, color, depth, x, y, half, c, s)
      QUAD.sprite, QUAD.frame, QUAD.blend, QUAD.color, QUAD.depth = sheet, frame, "add", color, depth
      local p = QUAD.points
      if not c then
        -- Unrotated: the corners are half either way.
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

  -- Live adapter identities for the portal return-cache cleanup.
  shared.portal_bowling_balls = function()
    local out = {}
    for _, id in ipairs(balls_in_order()) do out[#out + 1] = { id = id } end
    return out
  end
end

return weapon
`
      },
      {
        path: 'weapons/bunker_buster.lua',
        name: 'weapons/bunker_buster.lua',
        language: 'lua',
        content: `-- Bunker Buster / Super Bunker Buster -- the component's entry point.
--
-- Both components in mod.toml point at this file; the module reads \`ctx.id\` to
-- tell them apart. \`require\` runs where \`wa\` does not exist yet, so the module
-- is pure data at load and does its \`wa\` work inside install (the same rule
-- lib/px_trail.lua follows).
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
        content: `-- Burning Sheep Launcher: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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
        content: `-- Burst Rifle: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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
        content: `-- Chilli Bomb: record, art and behaviour.
local holds = require("wf-lib/holds")
local weapon = {}

local children = {} -- Missile IDs: these explode without launching more children.
local pending = {} -- Parent explosion positions, processed after the blast.
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

-- Thrown parent only. Its explosion launches the five CHILDREN below in Lua.
weapon.definition = {
  copy_from = "stock.super_banana",
  name = "Chilli Bomb",
  panel_icon = "sprites/chilli_bomb/chilli_ico.png",
  sprite = "banana",
  on_explode = on_explode,
  handling = {
    retreat = 3000,
  },
  missile = {
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

-- Scripted children are missiles of this weapon, not native cluster bits.
-- They inherit the parent's flight physics, then use these stage settings.
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
      decay_mode = "resting",
    },
    sprite = 0, -- Only the chilli's custom art is drawn.
  },
}

weapon.missile_sprite = { -- Chilli Bomb (chilli_bomb_anim) and the five it bursts into
  sheet = "sprites/px_hold/chilli_bomb.png", frames = 1,
  spin = true, -- its record's WAT_Rotation
  -- WA's own sprite 0, as PX's record has it: nothing under the chilli.
  hide = true,
}

function weapon.setup()
  --
  -- PX's pyro_grenades_script (PyroMan), on WA's super banana. When a Chilli
  -- Bomb explodes, five more Chillis burst out of it, straight up with a
  -- random spread (PX's ShotClustlets): real WA missiles of the same slot,
  -- each with damage 30, an 8 s fuse, no countdown, the fire key setting it
  -- off, and a burst of fire where it ends. The five do not burst again: a
  -- missile PX's script makes has no weapon of its own (weap), so its
  -- ExplodeAt skips the Chilli's branch.
  --
  -- Not ported: PX's particle trail and the sparks while aiming
  -- (pxparticles), and the smoke trail's power of 20 on the five. PX also
  -- writes the five's changes into the weapon's own launch data, so every
  -- later Chilli Bomb flies with them; the port changes the five only.

  children, pending, shooter = {}, {}, nil

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FIRE_WEAPON and worm.weapon == "px.chilli_bomb" then
      shooter = worm
    elseif msg == wa.msg.FRAME_FINISH and #pending > 0 then
      -- After the blast, as the Double Bazooka's second shell.
      local owner = shooter or worm
      for _, p in ipairs(pending) do
        for _ = 1, CHILDREN.count do
          -- RandomFloat(3, -3), then RandomFloat(-7, -10).
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
        content: `-- Cow Launcher: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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

return weapon
`
      },
      {
        path: 'weapons/crate_strike.lua',
        name: 'weapons/crate_strike.lua',
        language: 'lua',
        content: `-- Crate Strike: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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
  -- Highlander: Crate Strike (PX utility_all_crates: allcrates_script.txt).
  local shared = require("lib/shared")
  local fires = shared.fires

  -- PX drops three crates on parachutes from 50 pixels above the map: at the
  -- click's x, 50 to its left and 50 to its right. Each is a weapon, utility
  -- or health crate, drawn in that order from WA's RNG, as PX's RandomInt(1,
  -- 3); WA picks what is inside (PX's WCT_RANDOM). A health crate gives 20 to
  -- 40, 40 to 60 or 60 to 80, by its place.
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
      -- A match whose crates hold no weapon (or no utility) refuses that
      -- kind; a health crate drops in its place.
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
        path: 'weapons/double_bazooka.lua',
        name: 'weapons/double_bazooka.lua',
        language: 'lua',
        content: `-- Double Bazooka: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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

  -- ---------------------------------------------------------- Double Bazooka
  do
  --
  -- PX's double_bazooka_script. A Double Bazooka shell does not end at the
  -- first thing it hits: WA's explosion goes off, a 50-pixel hole is cut
  -- (GG->land->MakeHole(50), WA's landscape "apply explosion", as
  -- wa.land.cut), and a second shell carries on from there at the first one's
  -- speed, a real WA missile of the same slot (new CMissile with the weapon's
  -- launch data), so WA flies it with wind and its smoke trail. PX changes
  -- three things for it: damage 40, sprite 54 and a 5 s fuse. The port takes
  -- the damage and fuse; 54 is a cluster bit (clustlet) in WA 3.8.1, so the
  -- second shell keeps the record's bazooka shell (48, missile), as the first
  -- does. Its own explosion ends it.
  --
  -- Not ported: PX's particle trail on top of WA's (pxparticles), and a plain
  -- 50/35 blast PX makes when a second shell explodes before its first frame.

  local DB_SECOND = { damage = 40, fuse = 5000 }
  local DB_HOLE = 50

  local db_speed = {}   -- missile id -> { vx, vy } at its last frame
  local db_second = {}  -- missile id -> true: a second shell, which ends it
  local db_pending = {} -- second shells to launch once the blast is over
  local db_shooter      -- the worm that fired it (PX's ClWT / ClWN)

  wa.on.missile_frame(function(m)
    if m.weapon == "px.double_bazooka" and m.phase == "post" then
      db_speed[m.id] = { m.vx, m.vy }
    end
  end)

  shared.double_bazooka_explode = function(ev)
    local id = ev.missile
    if not id then
      return
    end
    local speed = db_speed[id]
    db_speed[id] = nil
    if db_second[id] then
      db_second[id] = nil
      return
    end
    if not speed then
      return
    end
    wa.land.cut({ x = ev.x, y = ev.y, shape = "circle", radius = DB_HOLE })
    -- Launched after the blast, as PX's comes after super: WA's explosion
    -- would otherwise push it.
    db_pending[#db_pending + 1] = { x = ev.x, y = ev.y, vx = speed[1], vy = speed[2] }
  end

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FIRE_WEAPON and worm.weapon == "px.double_bazooka" then
      db_shooter = worm
    elseif msg == wa.msg.FRAME_FINISH and #db_pending > 0 then
      -- The first worm's frame after the blast; every worm gets one.
      local owner = db_shooter or worm
      for _, p in ipairs(db_pending) do
        local id = wa.weapons.launch({
          weapon = "px.double_bazooka", owner = owner, x = p.x, y = p.y, vx = p.vx, vy = p.vy,
          missile = { explosion = { power = DB_SECOND.damage }, fuse = DB_SECOND.fuse },
        })
        db_second[id] = true
      end
      db_pending = {}
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
        content: `-- Double Jump: Project X's utility_doublejump (doublejump.txt), the
-- component's entry point. Its record is PX's (weps/double_jump.wep); the
-- engine gives it a slot of its own. \`require\` runs where \`wa\` does not exist
-- yet, so everything that needs \`wa\` happens in install.
--
-- Using it switches a second jump on for the turn; using it again switches it
-- off. While it is on, the turn's worm in the air from a jump (WA's own, or
-- the Jump's launch) jumps once more on Enter or Backspace, and may again
-- once it is standing. The turn over, it is off.
--
-- PX sets the worm back to WA's jump preparation (WS_JUMPPREPARE) in the
-- air; as its animation has already played through, WA takes off at once
-- (0x515EF0) with the jump the worm last made, as its keys left it: forward
-- after forward, a backflip after a backflip. worm:jump() is that take-off:
-- WA's jump, its animation and the team's speech, with no state of the
-- pack's.
--
-- Differences: PX spends the utility each time it is used, off as well as
-- on; here only switching it on does. PX's record is WA's Low Gravity's
-- switch and its FireFinal runs it, so PX's also turned Low Gravity on; here
-- the pack's own fire takes its place, and the record switches nothing on.
-- PX's jump fizzled (the worm just fell) when the key came while the jump's
-- own animation was still playing; this one always jumps. PX shows "Double
-- Jump: ON" / "OFF" once; here the HUD says it while it is on. Not ported:
-- PX's AutoDoubleJump script, which switches it on at every turn's start.

-- WA's states for a worm in the air from a jump: jumping, coming down.
local JUMPING = { [0x79] = true, [0x7A] = true }
-- Falling under its own control: where the Jump's launch leaves the worm.
local FALLING = 0x7E
-- Standing, walking, the turn's worm ready: back on the ground.
local GROUNDED = { [0x65] = true, [0x66] = true, [0x67] = true }

local function install(ctx)
  local id = ctx.id
  wa.weapons.replace({
    wep = "weps/double_jump.wep",
    panel_icon = "sprites/double_jump/icon.png",
    -- A utility: using it leaves the turn going, as PX's record has it.
  })

  local on, armed = false, false

  -- In the air from a jump: WA's, or the Jump's (PX's Jlaunch).
  local function in_jump(worm)
    local s = worm.state_id
    return JUMPING[s] or (s == FALLING and worm.weapon == "px.jump")
  end

  wa.on.worm_message(function(worm, msg)
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
      wa.hud.message_top(on and "Double Jump: ON" or "Double Jump: OFF",
        {to = "coalition", alliance = worm.alliance})
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
  end, { msgs = { wa.msg.FRAME_FINISH, wa.msg.FIRE_WEAPON, wa.msg.JUMP, wa.msg.JUMP_UP } })

  -- PX's: no worm's turn, no double jump.
  wa.on.turn_start(function()
    on, armed = false, false
  end)

end

return { install = install }
`
      },
      {
        path: 'weapons/electric_grenade.lua',
        name: 'weapons/electric_grenade.lua',
        language: 'lua',
        content: `-- Electric Grenade: record, art and behaviour.
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
    -- \`ev.life\`: frames the arc searches, PX's TazerLifeTime (the drum's 30).
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
`
      },
      {
        path: 'weapons/electromagnet.lua',
        name: 'weapons/electromagnet.lua',
        language: 'lua',
        content: `-- Electromagnet: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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
    -- PX's red icon is attract mode; ours, recoloured to the blue magnet's
        -- colours, repel (the HUD hook in electromagnet.lua shows the mode).
        panel_icon = "sprites/electromagnet/ico_magnet.png",
    panel_icons = { "sprites/electromagnet/ico_magnet_blue.png" },
    -- WA takes it out and puts it away with the Dynamite's draw (334-336);
        -- PX swaps in the magnet's (CSpriteAnim::SetAnimEx): blue repelling,
        -- red once + switched the worm to attracting (the engine reads + as the
        -- module does, and plays the take-out again in the new colour).
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
  -- Highlander's Electromagnet, on the Baseball Bat slot (PX weapon_magnet:
  -- magnet.txt's CMagnet). Placed, it stays: for four of its owner's turns
  -- its field pushes (repel) or pulls (attract) WA's own mines and missiles
  -- and opted-in actors across all packs; it triggers the mines it catches. The objects
  -- it moves stay WA's, so their own flight, collisions and fuses run. It is
  -- an object in the oil-drum layer: blasts, guns and fires hit it, and at
  -- 0 health it explodes.
  -- Squares by multiplication: \`^\` calls the C runtime's pow, whose last bit
  -- may differ between machines.
  local function sq(v) return v * v end

  local shared = require("lib/shared")
  local RANGE2 = 170 * 170           -- MaxRange
  local SYNC2 = RANGE2 // 4          -- MaxSyncRange: MaxRange * 0.25
  local TURNS, HEALTH, LOW_HEALTH = 4, 80, 30
  local BOOM = { id = 100, damage = 50, below = false } -- ExplosionBlast, ExplosionDamage
  -- Not PX's: PX explodes the missiles still in a field 300 frames after the
  -- turn ended, so none circles a magnet for ever. With no way to burst a
  -- stock missile from Lua, the field lets go of them instead, and each ends
  -- on its own fuse or impact. It lets go of the mines then too: a dud mine
  -- (the scheme's) never goes off, and held against a magnet it never comes
  -- to rest either, so WA would wait for it and the turn would never end.
  local RELEASE_AFTER = 300
  -- The grenades that go off only once they stop slow down in a field (PX
  -- damps its Hellish Hand-Grenade there by 0.985 a frame).
  local DAMPED = { ["px.hellish_hand_grenade"] = true }
  local DAMPING = 0.985
  -- Native mine motion, collision response and impact audio; Lua owns policy.
  local RADIUS = 8                   -- conservative planter clearance around the art
  local PLANTER_GRACE = 13           -- 250 ms rounded up at 50 simulation frames/s
  local SINK = (1 / 2)                -- in the water it sinks half a pixel a frame
  local SUNK = 200                -- and is gone this far below the surface
  local BODY = "sprites/electromagnet/"
  local magnets = {}
  local polarity = {} -- worm id -> +1 repel, -1 attract (PX's MagnetPolarity)
  local plus_held = {} -- worm id -> the synchronized + key last frame

  local function trunc(x) return x >= 0 and math.floor(x) or -math.floor(-x) end

  -- PX's TriggerMine: a random-fuse mine gets 1 to 5 seconds; an attracting
  -- magnet sets it close to the longest fuse among the mines it already holds,
  -- so they go off together. Then the mine is armed.
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

  -- Force calculation and application belong to the match-wide field service.
  -- The weapon retains PX's mine arming/fuse policy, including its final pulse.
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

  -- Placement correction only: use the inherited native shape to find a clear
  -- point below/along a ceiling. Subsequent motion belongs entirely to WA.
  local function clear_spawn(a)
    if a:fits(a.x, a.y) then return end
    for d = 1, 24 do
      for _, v in ipairs({ {0, 1}, {-1, 1}, {1, 1}, {-1, 0}, {1, 0}, {-1, -1}, {1, -1}, {0, -1} }) do
        local x, y = a.x + v[1] * d, a.y + v[2] * d
        if a:fits(x, y) then a:warp { x = x, y = y }; return end
      end
    end
  end

  -- The same conservative worm clearance used for placed sentry feet, expanded
  -- by the magnet's radius. Keep passage while either end of this move overlaps.
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
      -- In the water: it stops working and sinks out of sight.
      discharge(m)
      if not m.sinking then m.sinking = true; a.hits = {} end
      m.vx, m.vy, m.y = 0, 0, m.y + SINK
      a:warp { x = m.x, y = m.y, vx = 0, vy = 0 }
      if m.y >= wa.world.water() + SUNK then
        remove(m)
        a:despawn()
        return
      end
    end
    if m.health <= 0 then
      trigger_mines(m)
      remove(m)
      a.y = m.y - 20
      a:explode(BOOM)
      a:despawn()
      return
    end
    planter_grace(m, a, previous_x, previous_y)
    if m.turns > 0 then
      -- Settings enter the next step's snapshot. Releasing at age 300 means
      -- the first step without native force is 301, as in the original port.
      m.field.native = not (m.ended_at and m.age - m.ended_at >= RELEASE_AFTER)
      trigger_mines(m)
      m.spark = (m.spark + 0.02) % 1.4
    end
    -- PX's UpdateRotation: spun by its speed, at most half a radian a frame.
    local speed = math.sqrt(sq(m.vx) + sq(m.vy))
    m.angle = m.angle + (m.vx < 0 and -1 or 1) * math.min(0.5, 0.04 * speed)
    local s = sprite(m)
    if s ~= m.sprite then a:look(s); m.sprite = s end
    a:gfx({ angle = math.deg(m.angle + math.pi) % 360, depth = wa.depth.OBJECTS })
  end

  -- PX's TakeExplosionDamage (less the further off: dmg * (1 - (d * d) / (4 (dmg * dmg))))
  -- and TakeDamage (type 10, the Battle Axe's, takes that share of its health).
  local function hit(m, a, event)
    local damage = math.max(0, event.damage or 0)
    if event.kind == "blast" and damage > 0 then
      local dx, dy = (a.x - (event.x or a.x)), (a.y - (event.y or a.y))
      damage = trunc((1 - (dx * dx + dy * dy) / (damage * damage * 4)) * damage)
    elseif event.hit_kind == 10 then
      damage = trunc(m.health * damage / 100)
    end
    if damage > 0 then m.health = m.health - damage end
    local vx, vy = event.vx or 0, event.vy or 0
    if vx ~= 0 or vy ~= 0 then
      a:warp { x = a.x, y = a.y, vx = a.vx + vx, vy = a.vy + vy }
    end
  end

  -- CWorm::FireFinal's Electromagnet: dropped where it is fired (at the
  -- worm), nudged the way the worm faces (0.3) and up (0.15), in the worm's
  -- mode. A script firing it (wa.weapons.fire, the stress test) may choose
  -- the mode with \`polarity\` (1 repel, -1 attract).
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
  end

  -- PX's OnTurnBegin: each start of its owner's team's turn uses one up; the
  -- last wakes and triggers what is in range.
  wa.on.turn_start(function(event)
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
    for _, m in ipairs(magnets) do m.ended_at = m.age end
  end)

  -- The Hellish Hand-Grenade slows down in a live field.
  wa.on.missile_frame(function(missile)
    if missile.phase ~= "pre" or not DAMPED[missile.weapon] then return end
    for _, m in ipairs(magnets) do
      if m.field:contains(missile.x, missile.y) then
        missile.vx, missile.vy = missile.vx * DAMPING, missile.vy * DAMPING
        return
      end
    end
  end)

  -- PX switches with WA's bounce keys; here the synchronized + key toggles
  -- the turn's worm between repel and attract, kept per worm. The engine
  -- flips the worm's red/blue magnet by the same rule (worm_sprites_toggle in
  -- the claim), so the two stay in step.
  wa.on.worm_message(function(worm)
    local id = worm.id
    local pressed = worm.turn and worm.weapon == "px.electromagnet" and wa.world.keys().plus_key or false
    if pressed and not plus_held[id] then polarity[id] = -(polarity[id] or 1) end
    plus_held[id] = pressed
  end, { msgs = { wa.msg.FRAME_FINISH } })

  -- The panel's icon shows the turn worm's mode, as the magnet it drops will
  -- be: red attracting (icon 0, PX's), blue repelling (icon 1). Only the
  -- panel changes, so this runs in the HUD hook, every frame; showing the
  -- icon already shown does nothing.
  local icon_shown = true
  local function show_mode_icon(worm)
    if not (icon_shown and wa.weapons.panel_icon and shared.owns("px.electromagnet")) then return end
    local attract = worm and (polarity[worm.id] or 1) < 0
    local ok, err = pcall(wa.weapons.panel_icon, "px.electromagnet", attract and 0 or 1)
    if not ok then
      icon_shown = false -- no icons of ours on the slot: say so once, then leave it
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
    return (polarity[worm.id] or 1) < 0 and "Electromagnet: ATTRACT mode (+ to repel)"
      or "Electromagnet: REPEL mode (+ to attract)"
  end)

  if wa.on.draw and wa.draw.quad then
    -- Refill one spec; the engine copies it before the next submission.
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
        if m.alive and m.turns > 0 then
          local x, y = m.x, m.y
          local ring = m.pol < 0 and RING_IN or RING_OUT
          -- PX starts a ring every 65 frames, 5 to 120 pixels, 0.8 a frame:
          -- outwards repelling, inwards attracting, fading as it grows.
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
        content: `-- Ferret: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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
    worm_sprites = PX_POSTURE,
    sprites = { "sprites/ferret/walk.png" },
    sounds = { "sounds/ferret/walk.wav" },
    params = { gpu_prefix = "sprites/ferret/" },
    on_fire = function(fire) fires.ferret(fire) end,
    hold = { -- Ferret (ferret_s's WormSprite): held still, not at the
        -- aim's angle (dont_rotate_with_angle), and thrown.
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
  -- Highlander: Ferret (PX weapon_ferrets: ferret_s.txt, rafa\`\`2's CFerret).
  local shared = require("lib/shared")
  local fires = shared.fires

  -- Thrown, a Ferret falls until the land is 3 pixels under it, then follows
  -- the terrain's outline and never falls off it: PX's square contour tracing,
  -- 3-pixel steps, up to 12 traced a frame and 2 walked. It explodes on a worm
  -- (the turn's worm is spared for its first 60 frames), on an oil drum, at the
  -- water, or when its trace finds no land 4 steps running. It flicks mines
  -- and Bowling Balls up (PX's ball is a mine) and walks on. At most 10 walk:
  -- a new one makes the oldest vanish. PX's IsMoving says no, so WA doesn't
  -- wait for a Ferret, and Ferrets walk on through later turns.
  local STEP = 3           -- frt_maxdist
  local MAX_FAILS = 4         -- frt_maxfails
  local MAX_OPS = 12          -- frt_maxoper
  local GRACE = 60            -- frt_framesdam
  local TURN_EVERY = 6        -- frt_pixrotat: steps between turns of the sprite
  local MAX_ALIVE = 10        -- frt_maxfrtalw
  -- Not PX's: a Ferret goes off by itself 15 seconds after it was placed,
  -- if nothing set it off before (750 of WA's 50 frames a second).
  local FUSE = 15 * 50
  -- It touches the land with WA's missile shape, the Skunk's (shape =
  -- "missile", a:fits). PX draws its 64-pixel frame centred with the feet 16
  -- below the centre: the body is drawn this far from the traced point, away
  -- from the land, so the feet meet it.
  local LIFT = 13
  -- What it runs into is its body: 8 pixels about the body's centre.
  local BODY = 8
  local SCALE = 0.95          -- frt_sprscale
  local DEPTH = wa.depth.OBJECTS       -- in front of the terrain, as the Bowling Ball
  local WALK = "sprites/ferret/walk.png"
  local FRAMES = 10
  local SOUND = "sounds/ferret/walk.wav"
  -- The scheme record's explosion (ExplodeAt): damage 100, blast 50.
  local BOOM = { damage = 100, id = 50 }
  -- A worm it runs into is thrown first (SpX = TurnSide, SpY = -5), a mine or a
  -- ball flicked (SpX = TurnSide, SpY = -7).
  local WORM_UP, MINE_UP = -5, -7

  local UP, RIGHT, DOWN, LEFT = 1, 2, 4, 8
  -- frt_moveto: from where it looks, a turn left or right is a step and a new
  -- direction to look in.
  local MOVES = {
    [DOWN] = { [LEFT] = { 1, 0, RIGHT }, [RIGHT] = { -1, 0, LEFT } },
    [UP] = { [LEFT] = { -1, 0, LEFT }, [RIGHT] = { 1, 0, RIGHT } },
    [LEFT] = { [LEFT] = { 0, 1, DOWN }, [RIGHT] = { 0, -1, UP } },
    [RIGHT] = { [LEFT] = { 0, -1, UP }, [RIGHT] = { 0, 1, DOWN } },
  }

  local alive = {} -- the Ferrets walking, oldest first
  -- WA places a Ferret at its worm, where its circle overlaps the ground:
  -- traced from inside the land, it would turn on the spot for ever. It rises
  -- until its circle is clear of the land, at most this far, and walks from
  -- the surface.
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

  -- frt_square_tracing: from the last outline point, turn towards the land
  -- while there is land, away from it while there is none, adding each new
  -- land point to the outline to walk.
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

  -- Its body's centre, LIFT from the traced point along the land's normal.
  local function body(f, x, y)
    return x + (f.ux * LIFT), y + (f.uy * LIFT)
  end

  -- frt_checkinteract, at a point of its way: what its body touches.
  local function interact(f, x, y)
    x, y = body(f, x, y)
    local _, obj = wa.world.collides({ x = x, y = y, radius = BODY, with = { "worms", "mines", "oil" } })
    if obj then
      if obj.kind == "worm" then
        local current = shared.current_worm()
        if f.grace > 0 and current and current.id == obj.id then return end
        obj.vx, obj.vy = f.side, WORM_UP
        f.boom, f.walking, f.tracing, f.why = true, false, false, "a worm"
      elseif obj.kind == "oil" then
        f.boom, f.walking, f.tracing, f.why = true, false, false, "an oil drum"
      elseif obj.kind == "mine" then
        obj.vx, obj.vy = f.side, MINE_UP
      end
    end
    if shared.kick_bowling_balls then
      shared.kick_bowling_balls(x, y, BODY, f.side, MINE_UP)
    end
  end

  -- frt_calc_rotation: every few steps, the Ferret turns to the way walked
  -- since its last turn, its up the land's normal (from the steps, one square
  -- root: the same on every machine; the angle is only drawn).
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

  -- frt_perform_trace: one step along the outline; at its end, trace on.
  local function walk(f)
    if f.boom then return false end
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

  -- Before it lands, it falls (or flies as thrown), a pixel at a time, and
  -- stops where its shape would touch the land.
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

  -- frt_firstcollision: land 3 pixels under it plants it, and its outline
  -- starts there.
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
    a:explode(BOOM)
    if a.id ~= 0 then a:despawn() end
  end

  local function frame(f, a)
    if f.dead then return end
    f.age = f.age + 1
    if f.gone then
      f.dead = true
      a:despawn()
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
    if f.boom then
      explode(f, a)
      return
    end
    f.grace = f.grace - 1
    local bx, by = f.x, f.y
    if f.planted then bx, by = body(f, f.x, f.y) end
    a.x, a.y, a.vx, a.vy = bx, by, 0, 0
    a:frame((f.steps // 2) % FRAMES)
    a:gfx({ angle = math.deg(f.angle) % 360, depth = DEPTH, scale = SCALE })
  end

  fires.ferret = function(fire)
    local worm = fire.worm
    -- PX lets at most 10 walk: the oldest goes, without a bang.
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
      sprite = WALK, x = f.x, y = f.y, gravity = false, collide = false, owner = worm,
      shape = "missile", on = function(actor) frame(f, actor) end,
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
        path: 'weapons/fire_jump.lua',
        name: 'weapons/fire_jump.lua',
        language: 'lua',
        content: `-- Fire Jump: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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

weapon.requires = { "weapons/super_drill" }

function weapon.setup()
  local shared = require("lib/shared")
  local drills = shared.drills
  local follow_drill = shared.follow_drill

  -- Fire Jump (PX Fire_Jump_script): WA's fire punch, whose speed then follows
  -- PX's timeline, counted in frames from the punch -- up at once, forward
  -- after half a second, a little higher at one second, and from 80 frames a
  -- fall cut back to 4 pixels a frame whenever it passes 5, until 210. PX
  -- speeds are pixels per frame; WA's are 16.16. See
  -- docs/px-reverse-engineering.md.
  --
  -- PX counts from FireFinal, which WA calls only once the punch's wind-up has
  -- played, not when fire is pressed. FireFinal starts the punch at -6 pixels
  -- a frame; the worm stood still until then. So the count starts on the
  -- first frame after fire is pressed that the worm is rising.
  --
  -- WA keeps the worm in its punch state until it has stopped, so the punch
  -- itself cuts the way up and burns worms on it, all jump long: PX adds no cut.
  local jumps = {}   -- worm id -> frames since the punch
  local winding = {} -- worm id -> frames since fire was pressed
  -- A wind-up never takes this long; give up rather than fire late.
  local WIND_UP_MAX = 100
  -- Ready/charging, the firing sequence, then the native punch. A hit, fall,
  -- freeze or other loss of control must not become a delayed Fire Jump.
  local WIND_UP_STATES = {
    [0x67] = true, [0x68] = true, [0x69] = true,
    [0x6A] = true, [0x6B] = true, [0x6C] = true,
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
      if worm.weapon == "px.super_drill" and not drills[worm.id]
          and worm:ammo("px.super_drill") ~= 0 then
        local id = worm.id
        drills[id] = wa.actors.spawn({
          sprite = false, x = worm.x, y = worm.y,
          gravity = false, collide = false, owner = worm,
          on = follow_drill(worm, id),
        })
      elseif worm.weapon == "px.fire_jump" and worm:ammo("px.fire_jump") ~= 0 then
        winding[worm.id] = 0
      elseif worm.weapon == "px.sniper_rifle" and worm:ammo("px.sniper_rifle") ~= 0 then
        -- The Sniper Rifle's own shot, over WA's (PX's snipfiring).
        wa.sound.play(worm, "sounds/sniper_firing.wav")
      end
      -- Neither eats the shot: WA's drill and fire punch still run.
      return
    end
    if msg ~= wa.msg.FRAME_FINISH then return end
    local id = worm.id
    if not (winding[id] or jumps[id]) then return end
    -- Once WA ends the punch, its collisions and knockback own the speed.
    -- Forget the timeline permanently; regaining control cannot resume it.
    if not worm.turn or worm.hp <= 0 or worm.taken
        or (winding[id] and not WIND_UP_STATES[worm.state_id])
        or (jumps[id] and worm.state ~= "punching") then
      winding[id], jumps[id] = nil, nil
      return
    end
    if winding[id] then
      if worm.state == "punching" and worm.vy < 0 then
        winding[id], jumps[id] = nil, 0
      else
        local w = winding[id] + 1
        winding[id] = w < WIND_UP_MAX and w or nil
      end
    end
    if jumps[id] then
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
        content: `-- Flame Turret: PyroMan's (Project X's p_turrets library: customturret.txt,
-- weapon type 13). A turret (lib/pyro_turret.lua) that lobs WA's own fires
-- at moving enemies, 18 a turn: PX's CFireDesc, a fire that does not spread,
-- burns 1.5 seconds and hits for 5 (admg 25 / 5; WA's petrol hits for 1).
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {}

function weapon.definition()
  local fires = require("lib/shared").fires
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.mine",
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
    -- PX's FDesc: Count 0, Duration 1500, UpPower 1, Damage FNum - 1 (FNum
    -- unset: -1, so it never spreads), UnkB admg / 5 (desc +0x18, the
    -- damage of each of its hits: our damage_scale over WA's 1).
    wa.fire.spawn({ owner = t.owner(a, s), x = shot.x, y = shot.y,
      vx = shot.dx * force, vy = shot.dy * force,
      count = 0, duration = 1500, up_power = 1, damage = -1, damage_scale = 5 })
    a:sound(FLAME_SOUND)
    return true
  end

  local t = pyro.new({
    kind = "flame_turret", weapon = "px.flame_turret", frames = pyro.FRAMES.flame,
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
        path: 'weapons/ghost_sheep.lua',
        name: 'weapons/ghost_sheep.lua',
        language: 'lua',
        content: `-- Ghost Sheep: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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
        path: 'weapons/gravity_control.lua',
        name: 'weapons/gravity_control.lua',
        language: 'lua',
        content: `-- Gravity Control: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  handling = {
    retreat = -1,
  },
  utility = {
    effect = "scripted",
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.low_gravity",
    name = "Gravity Control",
    panel_icon = "sprites/gravity_control/gravity_control_ico.png",
    sounds = { "sounds/gravity_control/activate.wav", "sounds/gravity_control/error.wav" },
  })
end

weapon.requires = { "weapons/helicopter", "weapons/wind_changer", "lib/turn_controls" }

function weapon.setup()
  local GRAVITY_FACTORS = { 0.3, 0.5, 1.0, 1.7, 2.4 }
  local GRAVITY_NAMES = { "Very Low Gravity", "Low Gravity", "Normal Gravity", "High Gravity", "Very High Gravity" }

  local gravity_choice          -- TransformedGravity's index, until fired
  local gravity_initial         -- InitialGravity: the match's
  local gravity_factor          -- ModulatedGravity while Gravity Control is on
  local SETTLE_LIMIT = 500      -- frames (10 s) the turn clock may stand still
  local clock_seen = {}         -- worm id -> { clock, frames }: each worm counts the frames itself

  local function gravity_back()
    gravity_factor, clock_seen = nil, {}
    wa.world.set_gravity(gravity_initial)
  end

  -- Every worm sees each frame once, so the first to count SETTLE_LIMIT frames
  -- with the clock where it was marks 10 s, whichever worms are still alive.
  local function watch_clock(worm)
    if not gravity_factor then
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

  -- Reset at turn end; delaying until the next turn can softlock settling.
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
      if gravity_factor then gravity_back() end
      gravity_choice = nil
    end,
    hint = function()
      return "Gravity Control: " .. (gravity_choice and GRAVITY_NAMES[gravity_choice]
        or "choose 1-5") .. ", then Space"
    end,
  })
end

return weapon
`
      },
      {
        path: 'weapons/gravler.lua',
        name: 'weapons/gravler.lua',
        language: 'lua',
        content: `-- Gravler: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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
          wsvr = "sprites/gravler/gravlerdive.png",                                -- 245
          wsvru = "sprites/gravler/gravlerdiga.png",                               -- 246
          wsvrd = "sprites/gravler/gravlerdigb.png",                               -- 247
          wsvb = "sprites/gravler/gravlerdigc.png",                                -- 248
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

return weapon
`
      },
      {
        path: 'weapons/gravler_strike.lua',
        name: 'weapons/gravler_strike.lua',
        language: 'lua',
        content: `-- Gravler Strike: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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
          wsvr = "sprites/gravler/gravlerdive.png",                                -- 245
          wsvru = "sprites/gravler/gravlerdiga.png",                               -- 246
          wsvrd = "sprites/gravler/gravlerdigb.png",                               -- 247
          wsvb = "sprites/gravler/gravlerdigc.png",                                -- 248
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
        content: `-- Hang-Glider: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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
    params = { gpu_prefix = "sprites/hang_glider/" },
  })
end

weapon.requires = { "weapons/helicopter", "weapons/sniper_rifle" }

function weapon.setup()
  local shared = require("lib/shared")
  local STOPPERS = shared.STOPPERS
  local balloons = shared.balloons
  local trunc = shared.trunc

  -- ------------------------------------------------------------- Hang-Glider
  do
    --
    -- PX's paratest (utility_hangglider_render). A worm that opens WA's
    -- parachute with the Hang-Glider flies PX's glider instead: the pack takes
    -- it (worm:take) and moves it with the glider's physics: gravity at 0.75,
    -- the wind blowing along the wing's up side (x3), the speed across the wing
    -- damped, and the nose turning towards the flight path. Up and down turn the
    -- nose, faster the faster it flies; left and right nudge it. Just before it
    -- would run into something (PX's WS_AFTERROPE), on the jump key, in water,
    -- or when the turn ends, it gives the worm back to WA, falling on with the
    -- glider's speed; WA lands it. While it glides, the worm's body is hidden
    -- behind the glider art, which carries the worm; brought down onto land,
    -- the glider's own pack-away plays once WA has the worm standing (PX swaps
    -- sheet 289, wparbak, for it).
    --
    -- PX's speeds and angles are pixels per frame and radians; WA's gravity,
    -- wind and worm speeds use pixel units.

    local GLIDER_GRAVITY = 0.75           -- GliderGravityFactor
    local GLIDER_WIND = 3.0               -- GliderWindFactor
    local GLIDER_FRICTION = 0.25          -- GliderFriction
    local GLIDER_TURN = 0.06              -- GliderMaxAngularVelocity
    local GLIDER_TURN_SPEED = 20.0        -- GliderMaxTurningSpeed
    local GLIDER_ANIM = 0.04              -- GliderAnimSpeed
    local GLIDER_LERP = 0.03              -- GliderRotationLerp
    local GLIDER_PUSH = 0.02              -- GliderMoveAcceleration
    local GLIDER_MAX_ANGLE = 1.5          -- about 86 degrees either way
    local GLIDER_DEPTH = wa.depth.FRONT          -- in front of worms and terrain
    -- wgldbak: 6 frames, loaded at 24 frames a second; WA runs 50.
    local GLIDER_PACK_FRAMES, GLIDER_PACK_FPS = 6, 24
    -- How long after coming down onto land WA may take to stand the worm up for
    -- the pack-away (frames).
    local GLIDER_PACK_WAIT = 50
    -- WA's fall damage begins at 8 pixels/frame of downward impact speed. Its
    -- fixed-point formula includes one 16.16 unit of bias.
    local GLIDER_SAFE_LANDING_SPEED = 8 - 1 / 65536
    local GLIDER_PI = 3.141593

    local gliders = {} -- worm id -> { enabled, deployed, x, y, ang, target, cycle, sx, sy, art, pack, pack_t, landing }
    -- worm id -> its weapon as of its last frame not under a parachute. The
    -- glider's own: the balloon's module, which keeps the same, is loaded only
    -- when the balloon is placed.
    local equipped_before = {}

    local function glider_of(worm)
      local g = gliders[worm.id]
      if not g then
        g = { enabled = false, deployed = false, ang = 0, target = 0, cycle = 0, sx = 0, sy = 0 }
        gliders[worm.id] = g
      end
      return g
    end

    -- utils' NormalizeAngle and LerpAngle.
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
      return wa.actors.spawn({
        sprite = sheet, x = x, y = y, gravity = false,
        collide = false, owner = worm, visibility = worm, on = function() end,
      })
    end

    local function glider_drop_art(worm, g)
      if g.art then g.art:despawn(); g.art = nil end
      if g.pack then g.pack:despawn(); g.pack = nil end
      g.pack_x, g.pack_y = nil, nil
      worm.body_visible = true
    end

    local function glider_begin_pack(worm, g)
      g.landing = nil
      if g.art then g.art:despawn(); g.art = nil end
      g.pack, g.pack_t = glider_art(worm, worm.x, worm.y, "sprites/hang_glider/pack.png"), 0
      g.pack_x, g.pack_y = worm.x, worm.y
      g.pack.facing = -worm.facing
      g.pack:frame(0)
      g.pack:gfx({ depth = GLIDER_DEPTH })
      worm.body_visible = false
    end

    -- TraceMask from (x, y) to where it is heading: anything the worm would
    -- touch there by WA's own test of its shape (worm:fits, every 2 pixels),
    -- and anything else in the way by the Sniper Rifle's estimate of its mask.
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

    -- CWormGlider::Move: up and down turn the nose, left and right push.
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

    -- CWormGlider::Think's physics, once deployed: the new speed.
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
      -- The nose turns towards the flight path, never straight up or down.
      local target = f < 0 and wa.math.atan(sy, -sx) or wa.math.atan(sy, sx)
      target = normalize_angle(target)
      g.target = math.max(-GLIDER_MAX_ANGLE, math.min(GLIDER_MAX_ANGLE, target))
      g.ang = lerp_angle(GLIDER_LERP, g.ang, g.target)
      g.cycle = math.min(g.cycle + GLIDER_ANIM, 1)
      g.sx, g.sy = sx, sy
    end

    -- How many frames after a crash the worm is watched: WA may stand it up
    -- where it hit, as it does a balloon popped against a ceiling.
    local GLIDER_UNSTAND = 3

    -- The glide ends: the worm back to WA, falling on with the glider's speed.
    -- \`landing\`: a gentle landing, so the pack-away plays once WA has the worm
    -- standing. A hard landing gives WA the glider's full speed in its
    -- falling state and lets WA decide whether it causes fall damage and loss
    -- of control. Suppress automatic parachute firing only until WA handles
    -- this impact; otherwise it immediately reopens and slows the worm.
    -- Only a collision
    -- elsewhere needs the short guard against WA standing it up in mid-air.
    local function glider_close(worm, g, landing, hard_landing)
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
    end

    local function glider_frame(worm)
      local state = worm.state
      if state ~= "parachuting" then equipped_before[worm.id] = worm.weapon end
      local equipped = equipped_before[worm.id]
      local b = balloons[worm.id]
      if b and b.active then
        local g = gliders[worm.id]
        if g then g.enabled = false end
        return
      end
      -- A glider may have auto-opened and cleared its selected slot before its
      -- first frame. The slot equipped before opening is authoritative.
      local g = gliders[worm.id]
      if not g then
        if (state == "parachuting" and equipped ~= "px.hang_glider")
            or (state ~= "parachuting" and worm.weapon ~= "px.hang_glider") then
          return
        end
        g = glider_of(worm)
      end
      if g.deployed then
        -- The engine let go: the turn ended, or WA knocked the worm flying.
        if not worm.taken then
          glider_close(worm, g, false)
          return
        end
        glider_keys(worm, g)
        glider_think(worm, g)
        if glider_blocked(worm, g.x, g.y, g.sx, g.sy) then
          -- Onto land below it: WA handles the impact with the glider's full
          -- speed. Only a fall below its damage threshold gets the pack-away.
          local below = g.sy > 0 and not worm:fits(g.x, g.y + (1.1 * g.sy + 4))
          local hard_landing = below and g.sy >= GLIDER_SAFE_LANDING_SPEED
          glider_close(worm, g, below and not hard_landing, hard_landing)
          return
        end
        local x, y = g.x + g.sx, g.y + g.sy
        if y >= wa.world.water() then
          glider_close(worm, g, false)
          return
        end
        g.x, g.y = x, y
        worm:carry(x, y)
        -- CWormGlider::Render, in the worm's place.
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
        -- Which parachute the worm opens next: PX checks the weapon only while
        -- the worm is not already under one.
        g.enabled = worm.weapon == "px.hang_glider"
        if g.unstand then
          if state == "standing" then
            worm:release(0, 0)
            g.unstand = nil
          else
            g.unstand = g.unstand > 1 and g.unstand - 1 or nil
          end
        end
        -- A land contact starts the pack-away in that frame. Standing is a
        -- fallback if WA did not report a contact; it may arrive 12 frames later.
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
          local landing_state = state == "standing" or state == "sliding"
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
            g.pack_t = g.pack_t + 1
          end
        end
        -- Its speed carries over into the glide.
        g.sx, g.sy = worm.vx, worm.vy
        return
      end
      g.enabled = equipped == "px.hang_glider"
      if not g.enabled or g.deployed or state ~= "parachuting" then
        return -- a plain parachute, or the balloon
      end
      -- WA has opened its parachute: the pack takes the worm and glides.
      g.deployed, g.ang, g.target, g.cycle, g.landing, g.unstand = true, 0, 0, 0, nil, nil
      g.x, g.y = worm.x, worm.y
      if g.pack then g.pack:despawn(); g.pack = nil end
      -- On the glider the worm fires what WA lets it fire mid-air.
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
          -- The jump key closes WA's parachute: here it lets go of the glider.
          glider_close(worm, g, false)
          return "eat"
        end
      end, { msgs = { wa.msg.FRAME_FINISH, wa.msg.JUMP, wa.msg.JUMP_UP } })
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
        content: `-- Health Zone: PX's zone launcher. This is the entry point the component's
-- install runs; the port itself is lib/px_health_zone.lua, which needs \`wa\` and
-- so is loaded here rather than at load (REPORT.md 11.11).

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
        content: `-- Helicopter: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  handling = {
    retreat = -1,
  },
  jet_pack = {
    fuel = 100,
  },
}

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
    params = { gpu_prefix = "sprites/helicopter/" },
  })
end

function weapon.setup()
  local shared = require("lib/shared")

  -- -------------------------------------------------------------- Helicopter
  -- Shared with later sections; the rest of this section is local to it.
  local trunc
  do
  --
  -- PX's helicopter_user_script, on WA's jet pack. While the jet pack runs,
  -- the script flies the worm itself from the worm's own move keys. The engine
  -- consumes them after this callback, so WA neither thrusts nor burns fuel.
  -- Speed builds while a key is held and dies away when it is not; fuel burns
  -- with it (not during retreat), and a crash -- an explosion sized by the fuel
  -- left and the speed -- when the fuel runs out, the worm reaches water, the
  -- turn ends, or it hits something other than a mine faster than a pixel a
  -- frame, the ground included: landing slower than that is PX's smooth
  -- landing. The worm's body is hidden behind the helicopter, and behind PX's
  -- climb-in animation while WA winds the jet pack up; its labels, the fuel
  -- counter among them, stay, as with PX's RenderWorm override.
  --
  -- Speeds and factors use Lua floats; the engine rounds writes to WA fields.

  -- Its fuel, PX's FuelAmount, is its record's (\`jet_pack.fuel\`, in
  -- this module's record): WA gives it the worm when the jet pack starts.
  local HELI_REALISTIC = true      -- gravity and wind act on it, at 0.2
  local HELI_EXPLODE_ON_TURN_END = true
  local HELI_DEPTH = wa.depth.FRONT       -- in front of worms and terrain

  local helis = {} -- worm id -> { flying, launch, jumpin, jump_phase, frame, ticks, body, climb }

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
    return wa.actors.spawn({
      sprite = sheet, x = worm.x, y = worm.y, gravity = false,
      collide = false, owner = worm, visibility = worm, on = function() end,
    })
  end

  local function heli_drop_art(h, worm)
    if h.body then h.body:despawn(); h.body = nil end
    if h.climb then h.climb:despawn(); h.climb = nil end
    worm.body_visible = true
  end

  local HELI_OOPS = {
    [2] = "sounds/helicopter/oops1.wav", [4] = "sounds/helicopter/oops2.wav",
    [6] = "sounds/helicopter/huh.wav", [8] = "sounds/helicopter/poop.wav",
    [10] = "sounds/helicopter/idiot.wav",
  }

  -- DisableHeli: blow up, sized by the fuel left and the speed, and land.
  local function heli_crash(worm, h, sx, sy)
    if not h.flying then
      return
    end
    local speed = (math.abs(sy) + math.abs(sx)) / 2
    local size = trunc((worm.fuel - 75) / 10 * speed)
    if size < 10 then size = 10 end
    -- The worm's own explosion: a spawn needs an owner, and outside a brain
    -- (from wa.on.contact) there is none to inherit.
    wa.actors.spawn({
      sprite = false, x = worm.x, y = worm.y, gravity = false, collide = false,
      owner = worm, explode = { damage = size * 2, id = size, now = true },
    })
    worm.gravity = 1
    worm.wind = 0
    local oops = HELI_OOPS[wa.random(1, 10)]
    if oops then wa.sound.play(worm, oops) end
    h.flying = false
    heli_drop_art(h, worm)
  end

  -- One of PX's key responses, towards \`dir\` (-1 up or left, 1 down or
  -- right): a kick that fades as the speed that way reaches 10 pixels a frame.
  -- PX: if (SpY > -1) SpY -= 0.2; if (SpY > -4) SpY -= 0.4; ... for up.
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
  end

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FRAME_FINISH then
      heli_frame(worm)
    end
  end, { msgs = { wa.msg.FRAME_FINISH } })

  -- Collide: hitting anything but a mine faster than a pixel a frame crashes
  -- it, the ground included -- a slow landing is PX's smooth landing -- judged
  -- on the speed before WA exchanged velocities.
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

  -- Shared by the balloon and glider handlers to recognize the equipped weapon.
  local balloons = {}

  shared.balloons = balloons
  shared.trunc = trunc
end

function weapon.configure(ctx, spec)
  local fuel = ctx.option("fuel")
  require("lib/shared").helicopter_fuel = fuel
  -- Native fuel is one byte; Lua initializes the full configured amount.
  spec.jet_pack.fuel = math.min(fuel, 255)
end

return weapon
`
      },
      {
        path: 'weapons/hellish_hand_grenade.lua',
        name: 'weapons/hellish_hand_grenade.lua',
        language: 'lua',
        content: `-- Hellish Hand-Grenade: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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
      decay_mode = "on_hit",
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
        content: `-- Homing Air Strike: Worms 2's, as Project X carries it. A record weapon:
-- PX's library has no script for it, only the record and its art.
--
-- The record is PX's own (\`hairstrike_WEAP.wep\`, the same in its library and
-- in both schemes that carry it): WA's Air Strike with homing missiles, five
-- of them, a weaker blast each (18 to WA's 30), arming 250 ms after the drop
-- and steering for 3.5 seconds.
--
-- The missiles' art is the KAOS scheme's \`hairmsl.png\` (PX's Rubber Mole
-- scheme keeps WA's airmisl). PX lays its 32 frames left to right, pointing
-- right and turning anticlockwise; \`flight.png\` is the same frames top to
-- bottom in airmisl's order, pointing up and turning clockwise. The record's
-- homing frame (+0xC0) names the bomb's sprite, so the engine moves it to
-- the pack sheet too: the missiles keep their art while they home.

local ART = "sprites/homing_air_strike/"

return {
  defaults = {
    ammo = { round_start = -1 }, -- infinite, so it can be tested at once
    delay = 0,
  },
  install = function()
    wa.weapons.replace({
      wep = "weps/hairstrike_WEAP.wep",
      panel_icon = ART .. "ico_hairstrike.png", -- PX's own
      sprite = ART .. "flight.png",
      -- PX's records carry ends-the-turn off, and it is a profile's
      -- setting: a weapon built on one says so itself, as WA's strikes do.
      handling = { ends_turn = true },
    })
  end,
}
`
      },
      {
        path: 'weapons/hot_air_balloon.lua',
        name: 'weapons/hot_air_balloon.lua',
        language: 'lua',
        content: `-- Hot Air Balloon: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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
    -- A pack WAV plays only once an entry registers it.
        sounds = {
          "sounds/balloon/inflate1.wav", "sounds/balloon/inflate2.wav", "sounds/balloon/inflate3.wav",
          "sounds/balloon/pop1.wav", "sounds/balloon/pop2.wav", "sounds/balloon/pop3.wav",
          "sounds/balloon/pop4.wav",
        },
    params = { gpu_prefix = "sprites/balloon/" },
  })
end

weapon.requires = { "weapons/helicopter" }

function weapon.setup()
  local shared = require("lib/shared")
  local balloons = shared.balloons

  -- --------------------------------------------------------- Hot Air Balloon
  do
    --
    -- PX's balloon_s (r2_balloon by rafa''2, modified by 0rang3). PX flies it on
    -- WA's parachute with the worm's gravity turned upside down; here the pack
    -- flies it (worm:take) with WA's own parachute physics, upside down. WA 3.8.1,
    -- per frame (0x4FCB30): the speed gains gravity times the worm's gravity
    -- factor and, unless the worm is against land beside it, the wind times its
    -- wind factor; then both speeds are damped. Its parachute (SetState 0x7D at
    -- 0x50EBE2 and 0x50EC57) damps them to 0.8 and takes the wind factor from the
    -- weapon record's +0x38 in percent: the patched bungee's fire_method, 100.
    -- So it rises at up to four times gravity and drifts with four times the
    -- wind. The arrow keys push it as they push WA's parachute (0x513EB0, run
    -- before that step): half of gravity a frame each way held (through the
    -- worm's +0x44 push, divided by its mass, 1.0), opposite keys cancelling. It pops -- the worm given back to WA, falling -- on touching land,
    -- in water, on the jump key (which closes WA's parachute), and when the
    -- turn ends. The worm's body is hidden behind the balloon, drawn in its
    -- team's colour, and the worm in its basket, as PX's RenderWorm override.
    --
    -- It still opens as WA's parachute (the patched bungee, by hand or
    -- automatically); the pack takes the worm on the first frame of it.

    local BALLOON_DAMP = 0.79998779296875       -- WA's parachute damping, 0.8
    local BALLOON_WIND = 100          -- the patched bungee's fire_method, in percent
    local BALLOON_DEPTH = wa.depth.FRONT + 1     -- behind the basket, in front of worms
    local BASKET_DEPTH = wa.depth.FRONT
    -- PX's GetTeamColorRGB, by WA's colour index (worm.alliance, 0 red .. 5 cyan).
    -- PX adds it to its dark grey balloon (SetColorMod mode 8); the GPU tint
    -- multiplies, so the pack's balloon art is PX's lightened to white, and the
    -- team colour shows at full strength.
    local TEAM_RGB = { 0xFF8080, 0x0096FF, 0x00D000, 0xFFFF40, 0xE800E8, 0x50FFFF }

    -- Also records the weapon equipped before WA changes the visible slot while
    -- opening a parachute, for both the balloon and glider handlers.
    -- worm id -> { active, x, y, vx, vy, ticks, equipped_weapon, balloon, basket }

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


    -- How many frames after popping against land the worm is watched: WA may
    -- stand it up there, in mid-air under a ceiling.
    local BALLOON_UNSTAND = 3

    -- StopBalloon: a pop, and the worm back to WA, falling with its speed.
    -- Against land it keeps no upward speed, and for a few frames, if WA has
    -- stood it up, it is released again, falling: PX's balloon does the same
    -- (WS_IDLE -> WS_SLIDING) when WA's parachute closes against the land.
    -- \`why\` goes to the log with each pop, so a report of a balloon that
    -- would not pop can be traced to what ended it.
    local function balloon_stop(worm, b, why, against_land)
      if not b.active then
        return
      end
      wa.log(string.format(
        "highlander: balloon of worm %d popped after %d frames: %s (turn clock %d ms)",
        worm.id, b.ticks, why, wa.world.turn_clock()
      ))
      b.active, b.ticks = false, 0
      if b.balloon then b.balloon:despawn(); b.balloon = nil end
      if b.basket then b.basket:despawn(); b.basket = nil end
      worm.body_visible = true
      balloon_sound(worm, "pop", 4)
      local vy = against_land and math.max(b.vy, 0) or b.vy
      if worm.taken then
        worm:release(b.vx, vy)
      end
      b.unstand = against_land and BALLOON_UNSTAND or nil
    end

    local function balloon_draw(worm, b)
      -- DrawBalloonWorm: the balloon above, in the team's colour, and the worm
      -- in its basket, whose art faces left.
      local f = worm.facing
      local function art(sheet)
        return wa.actors.spawn({
          sprite = sheet, x = b.x, y = b.y, gravity = false,
          collide = false, owner = worm, visibility = worm, on = function() end,
        })
      end
      b.balloon = b.balloon or art("sprites/balloon/balloon.png")
      b.basket = b.basket or art("sprites/balloon/basket.png")
      local x = b.x + 6 * f
      b.balloon.x, b.balloon.y, b.balloon.vx, b.balloon.vy = x, b.y - 43, 0, 0
      -- Manifest ping-pong expands the 16/17 source frames to 30/32.
      -- Walk those sequences over PX's original 200/80-tick periods.
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
      -- WA may change the selected slot to Parachute (or none) as Bungee fires.
      -- The weapon equipped before that transition identifies the auto trigger;
      -- an unrelated parachute opening must not become a Hot Air Balloon.
      local equipped = b.equipped_weapon
      if not b.active and state == "parachuting" and not b.was_parachuting
          and equipped == "px.hot_air_balloon" then
        b.active, b.ticks = true, 0
        b.x, b.y, b.vx, b.vy = worm.x, worm.y, worm.vx, worm.vy
        -- Under the balloon the worm fires what WA lets it fire mid-air.
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
      -- The engine let go: the turn ended, or WA knocked the worm flying.
      if not worm.taken then
        balloon_stop(worm, b, "the engine let go (turn over or knocked flying)")
        return
      end
      local vx, vy = b.vx, b.vy
      -- The arrow keys, as WA's parachute takes them (0x514AC0, 0x513EB0).
      local k = worm.keys or {}
      local left, right, up, down = k.left, k.right, k.up, k.down
      if left and right then left, right = false, false end
      if up and down then up, down = false, false end
      local g = wa.world.gravity()
      local push = g / 2
      vx = vx + (right and push or 0) - (left and push or 0)
      vy = vy + (down and push or 0) - (up and push or 0)
      -- WA's parachute physics, gravity upside down (0x4FCB30).
      vy = vy - g * worm.gravity
      local side = wa.world.wind() >= 0 and 1 or -1
      if worm:fits(b.x + side, b.y) then
        vx = vx + wa.world.wind() * (BALLOON_WIND / 100)
      end
      vx, vy = vx * BALLOON_DAMP, vy * BALLOON_DAMP
      b.vx, b.vy = vx, vy
      local x, y = b.x + vx, b.y + vy
      -- It pops on touching land, as WA's parachute closes there: where WA's
      -- own test says the worm would touch it, so it never sits inside it.
      if not worm:fits(x, y) then
        balloon_stop(worm, b, "touched land", true)
        return
      end
      if y >= wa.world.water() then
        balloon_stop(worm, b, "reached the water")
        return
      end
      b.x, b.y = x, y
      worm:carry(x, y)
      b.ticks = b.ticks + 1
      balloon_draw(worm, b)
    end

    -- WA's key messages, named for the log. In flight WA sends jump for Space
    -- and fire for Enter.
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
        -- The jump key closes WA's parachute: here it pops the balloon.
        -- In flight WA sends it for Space.
        balloon_stop(worm, b, "jump key (Space in flight)")
        return "eat"
      end
    end, { msgs = { wa.msg.FRAME_FINISH, wa.msg.JUMP, wa.msg.JUMP_UP, wa.msg.FIRE_WEAPON, wa.msg.RELEASE_WEAPON } })

    -- M_TURNBEGIN: any balloon still up pops.
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
        content: `-- Ice Arrow: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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
    -- WA's Longbow sheets, bow and cap in ice blue
    -- (tools/bake_ice_arrow_sprites.py); WA still animates them.
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
  -- Ice Arrow: let WA's ArrowEntity apply the bow hit and its momentum, then
  -- freeze the worm on its next frame. PX's CWorm::Message defers SetState in
  -- exactly this way, so the hit's native state setup runs first.
  local shared = require("lib/shared")
  local pending = {} -- stable worm id -> freeze on that worm's next frame

  wa.on.hurt(function(hit)
    if hit.phase == "post" and hit.source_weapon == "px.ice_arrow"
      and hit.kind == "hit" then
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
        content: `-- Igniter: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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
      decay_mode = "on_hit",
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
        -- Up through the shot too: it has no firing poses of its own, so WA
        -- fires it in the aim posture, empty-handed without the hold. Not PX's.
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
        content: `-- Weapon IDs and their owning modules. No weapon settings or match state.
return {
  ["px.3_girder_pack"] = "weapons/3_girder_pack",
  ["px.auto_ballista"] = "weapons/auto_ballista",
  ["px.banana_express"] = "weapons/banana_express",
  ["px.blaster_worm"] = "weapons/blaster_worm",
  ["px.blowtorch"] = "weapons/blowtorch",
  ["px.bowling_ball_strike"] = "weapons/bowling_ball",
  ["px.burning_sheep_launcher"] = "weapons/burning_sheep_launcher",
  ["px.burst_rifle"] = "weapons/burst_rifle",
  ["px.chilli_bomb"] = "weapons/chilli_bomb",
  ["px.cluster_bomb"] = "weapons/cluster_bomb",
  ["px.cow_launcher"] = "weapons/cow_launcher",
  ["px.crate_strike"] = "weapons/crate_strike",
  ["px.double_bazooka"] = "weapons/double_bazooka",
  ["px.electric_grenade"] = "weapons/electric_grenade",
  ["px.electromagnet"] = "weapons/electromagnet",
  ["px.ferret"] = "weapons/ferret",
  ["px.fire_jump"] = "weapons/fire_jump",
  ["px.flame_turret"] = "weapons/flame_turret",
  ["px.ghost_sheep"] = "weapons/ghost_sheep",
  ["px.gravity_control"] = "weapons/gravity_control",
  ["px.gravler"] = "weapons/gravler",
  ["px.gravler_strike"] = "weapons/gravler_strike",
  ["px.hang_glider"] = "weapons/hang_glider",
  ["px.helicopter"] = "weapons/helicopter",
  ["px.hellish_hand_grenade"] = "weapons/hellish_hand_grenade",
  ["px.hot_air_balloon"] = "weapons/hot_air_balloon",
  ["px.ice_arrow"] = "weapons/ice_arrow",
  ["px.igniter"] = "weapons/igniter",
  ["px.javelin"] = "weapons/javelin",
  ["px.jump"] = "weapons/jump",
  ["px.kamikaze_rocket"] = "weapons/kamikaze_rocket",
  ["px.laser_gun"] = "weapons/laser_gun",
  ["px.lightning_strike"] = "weapons/lightning_strike",
  ["px.mine_turret"] = "weapons/mine_turret",
  ["px.mole_bomb"] = "weapons/mole_bomb",
  ["px.mortar_strike"] = "weapons/mortar_strike",
  ["px.nuke_rocket"] = "weapons/nuke_rocket",
  ["px.old_woman_launcher"] = "weapons/old_woman_launcher",
  ["px.petrol_turret"] = "weapons/petrol_turret",
  ["px.pigeon_strike"] = "weapons/pigeon_strike",
  ["px.pogo_sheep"] = "weapons/pogo_sheep",
  ["px.portal_gun"] = "weapons/portal_gun",
  ["px.priceless_ming_vase"] = "weapons/priceless_ming_vase",
  ["px.real_shotgun"] = "weapons/real_shotgun",
  ["px.reinforcement"] = "weapons/reinforcement",
  ["px.remote_roller"] = "weapons/remote_roller",
  ["px.s_m_a_r_t_bomb"] = "weapons/s_m_a_r_t_bomb",
  ["px.sentry_gun"] = "weapons/sentry_gun",
  ["px.sentry_laser"] = "weapons/sentry_laser",
  ["px.shadow_bolt"] = "weapons/shadow_bolt",
  ["px.skip_go_surrender"] = "weapons/skip_go_surrender",
  ["px.skunk"] = "weapons/skunk",
  ["px.sniper_rifle"] = "weapons/sniper_rifle",
  ["px.sticky_bomb"] = "weapons/sticky_bomb",
  ["px.submarine_attack"] = "weapons/submarine_attack",
  ["px.super_drill"] = "weapons/super_drill",
  ["px.super_gravedigger"] = "weapons/super_gravedigger",
  ["px.super_tele"] = "weapons/super_tele",
  ["px.swim_suit"] = "weapons/swim_suit",
  ["px.thumper_nade"] = "weapons/thumper_nade",
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
        content: `-- Javelin: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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
    sprite = "missile",
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

weapon.requires = { "weapons/helicopter" }

function weapon.setup()
  local shared = require("lib/shared")
  local current_worm = shared.current_worm
  local fires = shared.fires
  local trunc = shared.trunc
  local turrets = require("lib/turret")

  -- ---------------------------------------------------------------- Javelin

  do
    local speed = {}
    local launching
    fires.javelin_launch = function(ev)
      -- A point-blank missile can explode inside launch(), before either
      -- its returned ID or its first frame exists. Keep this shot's speed
      -- and thrower available throughout that synchronous impact callback.
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
    -- Pre keeps the incoming speed even when this frame's stock collision
    -- destroys the missile. Post keeps acceleration for the following frame.
    wa.on.missile_frame(function(m)
      if m.weapon == "px.javelin" then
        local flight = speed[m.id]
        if not flight then
          local shooter = current_worm()
          flight = { shooter = shooter and shooter.id }
          speed[m.id] = flight
        end
        flight[1], flight[2], flight.uid = m.vx, m.vy, m.uid
      end
    end)

    -- How the part of the stamp inside the land fades: over 3 pixels from the
    -- spear's outline, its colour mixed with the earth's. Tuned by eye in game.
    local JAVELIN_BURIED = { soften = 3, blend = "mix" }

    local function trunc(n) return n < 0 and math.ceil(n) or math.floor(n) end
    local function orientation(vx, vy)
      if vx == 0 then return vy > 0 and 16 or 0 end
      if vy == 0 then return vx > 0 and 8 or 24 end
      -- PX uses ratio bins, not evenly spaced atan2 angles.
      if vx > 0 and vy < 0 then return math.min(trunc(3 * vx / -vy), 7) end
      if vx > 0 then return math.min(trunc(8 + 3 * vy / vx), 15) end
      if vy > 0 then return math.min(trunc(16 + 3 * -vx / vy), 23) end
      return math.min(trunc(24 + 3 * -vy / -vx), 31)
    end
    local function within(o, x, y, r)
      return o and math.abs(x - o.x) < r and math.abs(y - o.y) < r
    end
    fires.javelin = function(ev)
      local v = (ev.missile and speed[ev.missile]) or launching
      if ev.missile then speed[ev.missile] = nil end
      if v then v.exploded = true end
      local vx, vy = v and v[1] or 0, v and v[2] or 0
      local active = current_worm()
      local shooter_id = v and v.shooter or (active and active.id)
      local target
      -- Keep PX's strict impact square and traversal order, excluding the
      -- thrower even when another handle represents that same worm. Capture
      -- its identity in flight so a control/turn change cannot reassign it.
      for _, o in ipairs(wa.world.electrical_nearby(ev.x, ev.y, 29, false)) do
        if (o.kind == "worm" or o.kind == "mine" or o.kind == "crate" or o.kind == "oil")
          and (o.kind ~= "worm" or o.id ~= shooter_id)
          and within(o, ev.x, ev.y, 20) then target = o; break end
      end
      if not target then
        local sentry = turrets.projectile_target(ev.x, ev.y)
        if sentry and turrets.projectile_hit(sentry, 20, vx / 4, vy / 4, v and v.uid) then return end
      end
      if target then
        target.vx, target.vy = vx / 4, vy / 4
        if target.kind == "worm" then target:hurt(20)
        else target:hit(20, vx / 2, vy / 2, "projectile") end
        return
      end
      -- Centred on the impact, as PX's, so its front half lies in the land:
      -- that half fades into the earth (the engine's buried stamp) instead of
      -- being drawn over it, and the javelin looks stuck.
      wa.land.stamp{
        sprite = "sprites/javelin/stamp.png", frame = orientation(vx, vy), x = ev.x, y = ev.y,
        buried = JAVELIN_BURIED,
      }
      -- PX plays it unplaced. On the turn's worm: an explosion's ev.worm is the
      -- missile's owner, which need not be a worm and has no sound of its own.
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
        content: `-- Jump: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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

  -- ------------------------------------------------------------------ Jump
  do
  --
  -- PX's jumpscript (utility_jump). Its record throws like a grenade, but
  -- nothing leaves the worm: FireFinal gives the worm the shot's own speed --
  -- the aim and the charge -- and plays the team's "Jump" line. The worm keeps
  -- its aim posture, eyes on the crosshair, until it jumps.
  --
  -- Differences: PX shows WA's wjump while the charge builds
  -- (SetAnimEx(269, FirePower)), which looks ahead rather than along the aim;
  -- it also mutes the worm's "Fire!" and "Watch this" lines while the Jump is
  -- selected, and stops a fuse and bounce being chosen for it.

  -- The first team's "Jump1" speech: WA loads each team's 54 lines in turn
  -- after its own sounds, so a worm's is 54 on per team (PX's PlaySoundBank(150)).
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
        content: `-- Kamikaze Rocket: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  handling = {
    ends_turn = true,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    wep = "weps/suicide_bomber.wep",
    panel_icon = "sprites/kamikaze_rocket/icon.png",
    -- The Kamikaze's take-out (its last frame the hold) and launch, PX's.
        worm_sprites = {
          wkamlnk = "sprites/kamikaze_rocket/take_out.png", wkamlnku = "sprites/kamikaze_rocket/take_out.png",
          wkamlnkd = "sprites/kamikaze_rocket/take_out.png", wkamjmp = "sprites/kamikaze_rocket/launch.png",
        },
    sprites = { "sprites/kamikaze_rocket/fly.png" },
    params = { gpu_prefix = "sprites/kamikaze_rocket/" },
  })
end

function weapon.setup()
  -- Highlander: Kamikaze Rocket (PX weapon_kamikaze_rocket: KamikazeRocket.txt,
  -- by Pablo, updated by rafa\`\`2), on the Suicide Bomber slot as PX's
  -- Highlander scheme has it. Its record is WA's Kamikaze's: WA's own
  -- Kamikaze flies the worm, digs its way and hits the worms it passes. As PX
  -- does, the pack sets where the worm is before each of WA's frames: a rocket
  -- at 8 px a frame from the worm along its aim, turned 9 degrees a frame by
  -- left and right, digging, for 4 seconds; then it blows up (damage 30,
  -- blast 100) and the worm goes into the water. Fired only with Ctrl held
  -- (Ctrl + Space); without, nothing is used.
  local shared = require("lib/shared")
  local SPEED = 8             -- px a frame (kRocketSpeed)
  local TURN = 0.05           -- PX angle units (times pi) a frame
  local LIFE = 4000           -- ms, less 20 a frame: 200 frames
  local HOLE = 8              -- MakeHole(8) each frame
  local BOOM = { damage = 30, id = 100 }
  local STALE = 200           -- other worms' frames without one of its own
  local FLY = "sprites/kamikaze_rocket/fly.png"
  local FLY_FRAMES, FLY_HALF_W, FLY_HALF_H = 5, 30, 40
  local DEPTH = wa.depth.FRONT

  local rockets = {} -- worm id -> its rocket
  local armed = {}   -- worm id -> fired with Ctrl, its flight not yet begun

  -- PX's FireFinal: from the worm, at its aim (FireAngle, 0 down to 1 up)
  -- on its side.
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

  -- One of WA's frames, before WA's Kamikaze runs it.
  local function fly(worm, r)
    local keys = wa.world.keys()
    if keys.left then r.angle = r.angle + TURN end
    if keys.right then r.angle = r.angle - TURN end
    local a = r.angle * math.pi
    r.x = r.x + (SPEED * wa.math.sin(a))
    r.y = r.y + (SPEED * wa.math.cos(a))
    worm.x, worm.y = r.x, r.y
    r.age = r.age + 1
    r.life = r.life - 20
    if r.life <= 0 then
      -- The blast, then the worm out of the map into the water, where WA's
      -- Kamikaze ends it (0x85, drowning).
      local boom = wa.actors.spawn({
        sprite = false, x = r.x, y = r.y, gravity = false, collide = false, owner = worm,
        on = function() end,
      })
      boom:explode(BOOM)
      boom:despawn()
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
        wa.hud.message_top("Hold Ctrl and press Space to use the Kamikaze Rocket.",
          {to = "coalition", alliance = worm.alliance})
        return "eat"
      end
      armed[worm.id] = true
      return
    end
    -- FRAME_FINISH
    -- Leaving the map sideways, WA's Kamikaze blows the worm up and frees it:
    -- its frames stop, so its rocket goes once the other worms have had a few.
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

  -- A worm armed but never flying (its fire cancelled) is not armed next turn.
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

  -- The rocket, drawn as PX's: its art faces down, turned to its heading and
  -- mirrored for a worm facing right.
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
        content: `-- Laser Gun: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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
  -- Squares by multiplication: \`^\` calls the C runtime's pow, whose last bit
  -- may differ between machines.
  local function sq(v) return v * v end

  local shared = require("lib/shared")
  local laser = require("lib/laser")
  local fires = shared.fires

  -- ------------------------------------------------------------- Laser Gun
  --
  -- PX's lasergun (CLaserRay). The record is an uzi firing one bullet; PX
  -- fires none (FireFinal without super), and each frame sets the worm's shot
  -- counters to 0 of 1, so WA keeps the worm in its repeat-fire state, aim
  -- live, while a beam burns for 5 s (250 frames) from the worm along its aim.
  -- Every fourth frame the beam traces: to the first land, 2048 px at most,
  -- cutting 4 px holes there (along the cut when the aim held still); and
  -- every worm, mine, crate and oil drum within 5 px of it takes fire damage:
  -- a worm 2, then 1 once it has taken 10, and no more after 45 from this beam;
  -- an oil drum 4, a crate 1. Drawn: a red strip, its width pulsing from 1.0
  -- to 0.5, and glows at the muzzle and where it hits; red sparks from the
  -- muzzle, glows rising from the cut, yellow sparks where it touches things.
  --
  -- Here the engine hands each of WA's shots to on_fire and skips WA's bullet
  -- (a gun slot with an on_fire), and the pack holds worm.shots_fired and
  -- worm.shots_to_fire as PX does.
  --
  -- Differences: a mine the beam touches is armed on its fuse, once, rather
  -- than sent PX's gun damage (object:hit takes crates and oil drums); the
  -- beam's loop sound is played again every 51 frames, not looped.

  -- Its own block: the file is at Lua's 200 locals for one chunk.
  do
    local LASER_LIFE = 250
    local LASER_REACH = 2048
    local LASER_LOOP_FRAMES = 51 -- laser_loop.wav is 1.02 s
    -- States a worm is not firing in: the beam stops (PX keeps it only in
    -- repeat fire, firing, aiming and fired).
    local LASER_STOPS = { standing = true, sliding = true, jetpacking = true, parachuting = true,
      bungee = true, tumbling = true, teleporting = true, drilling = true, punching = true }
    local lasers = {} -- worm id -> the beam

    local laser_between, laser_particle = laser.between, laser.particle

    -- UpdatePosDir: the beam's direction from the worm's aim (0 down, 1 up)
    -- and side; it starts at the worm and draws from 24 px out.
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

    -- PerformTrace with damage: the cut, then everything touching the beam.
    local function laser_trace(r, w)
      local x1 = r.x + (LASER_REACH * r.dx)
      local y1 = r.y + (LASER_REACH * r.dy)
      local land = wa.land.trace(r.x, r.y, x1, y1)
      local hx, hy = land and land.x or x1, land and land.y or y1
      if land then
        if r.hit and r.dx == r.last_dx and r.dy == r.last_dy then
          -- The aim held: a clean cut from the last hit to this one.
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
              if amount > 0 then obj:hurt(amount) end
              r.taken[key] = taken + amount
            end
          elseif obj.kind == "oil" or obj.kind == "crate" then
            obj:hit(obj.kind == "oil" and 4 or 1, r.dx, r.dy)
          elseif obj.kind == "mine" and not r.armed[key] then
            r.armed[key] = true
            obj:arm(obj.fuse < 0 and wa.random(1000, 5000) or obj.fuse)
          end
          -- FX_HitObject: a yellow flash and two sparks.
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
        -- WA ends the repeat fire, as when its shots run out.
        w.shots_fired = w.shots_to_fire
        wa.sound.play(w, "sounds/laser_gun/laser_end.wav")
      end
    end

    fires.laser = function(fire)
      local w = fire.worm
      -- Each of WA's shots comes here; one beam per worm, as PX's LaserRayObj.
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
        sprite = false, x = w.x, y = w.y, gravity = false, collide = false, owner = w,
        on = function(a)
          r.life = r.life - 1
          laser.step(r)
          if r.dead then
            if r.life <= -10 and #r.fx == 0 then
              lasers[r.worm_id] = nil
              a:despawn()
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
        content: `-- Lightning Strike: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  handling = {
    ends_turn = true,
  },
}

function weapon.definition()
  local shared = require("lib/shared")
  return require("lib/weapon").merge(weapon.record, {
    wep = "weps/napalm_strike.wep",
    panel_icon = "sprites/lightning/icon.png",
    -- With the Electric Grenade's arc and zap sheets: both weapons' effects
        -- are GPU sheets under this prefix.
        sprites = {
          "sprites/lightning/beam.png", "sprites/lightning/glow.png", "sprites/lightning/cloud.png",
          "sprites/electric_grenade/explosion.png", "sprites/electric_grenade/tazed1.png",
          "sprites/electric_grenade/tazed2.png",
        },
    sounds = { "sounds/lightning/thunder.wav", "sounds/lightning/hit.wav" },
    params = { gpu_prefix = "sprites/" },
    -- Click-only dispatch keeps the strike's cursor and turn handling.
        on_select = { cursor = true },
    -- The engine ends WA's prefire after a click-only fire. (A closure:
        -- lightning_click is defined further down.)
        on_click = function(ev) shared.lightning_click(ev) end,
  })
end

weapon.requires = { "weapons/sniper_rifle", "weapons/electric_grenade", "lib/electrical" }

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

  -- Half the width of the line along the beam that strikes what it touches:
  -- the drawn beam wavers about it, so anything whose body is within 4 pixels
  -- of the straight line from the beam's top to where it ends is struck too.
  local STRIKE_HALF_WIDTH = 4

  -- Whether \`obj\` is struck: on the beam's line, from its top to its end, or
  -- (when the beam hit something) about where it ended.
  local function struck(s, obj, length)
    local ox, oy = obj.x - s.sx, obj.y - s.sy
    local along = ox * s.dirx + oy * s.diry
    local across = math.abs(ox * s.diry - oy * s.dirx)
    if along >= 0 and along <= length and across <= STRIKE_HALF_WIDTH + target_radius(obj) then
      return true
    end
    if not s.hit then return false end
    local dx, dy = obj.x - s.ex, obj.y - s.ey
    local r = target_radius(obj) + 6
    return dx * dx + dy * dy <= r * r
  end

  local function strike_hit(s)
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
  end

  -- PX's cloud: every second frame of the strike's life a puff of WA's large
  -- cloud, tinted a dark bluish grey, is thrown out from the top of the beam
  -- and slowed by the air; a core puff (100 frames, 1.2x to 0.6x) until the
  -- strike is spent, a surrounding one (140 frames, 1x to nothing) until the
  -- strike is gone. Each fades in from nothing. Also PX's sparks: while the
  -- beam holds, a glow thrown from where it hit, falling. Both are advanced
  -- here, once per game frame, from the strike's own generator, and only drawn
  -- below; nothing else reads them.
  local function strike_rand(s)
    s.seed = (s.seed * 1103515245 + 12345) % 0x80000000
    return s.seed / 0x80000000
  end

  local function strike_puff(s, life, drag, s0, s1)
    local xvel = strike_rand(s) * 2 - 1
    local yvel = 1 - xvel * xvel
    s.cloud[#s.cloud + 1] = { x = s.sx, y = s.sy, vx = 16 * xvel,
      vy = (strike_rand(s) * 9 - 8) * yvel, drag = drag, age = 0, life = life, s0 = s0, s1 = s1 }
  end

  local function strike_particles(s)
    if s.tail > 0 then
      s.cloud_timer = s.cloud_timer - 1
      if s.cloud_timer <= 0 then
        if s.life > 0 then strike_puff(s, 100, 0.3, 1.2, 0.6) end
        strike_puff(s, 140, 0.15, 1.0, 0.01)
        s.cloud_timer = 2
      end
      if s.delay == 0 and s.life > 0 and s.hit then
        local a = strike_rand(s) * 2 * math.pi
        local v = (1 + strike_rand(s) * 2)
        s.sparks[#s.sparks + 1] = { x = s.ex, y = s.ey, vx = wa.math.cos(a) * v, vy = wa.math.sin(a) * v, age = 0 }
      end
    end
    for i = #s.cloud, 1, -1 do
      local p = s.cloud[i]
      p.age = p.age + 1
      if p.age >= p.life then
        table.remove(s.cloud, i)
      else
        p.x, p.y = p.x + p.vx, p.y + p.vy
        p.vx, p.vy = p.vx * (1 - p.drag), p.vy * (1 - p.drag)
      end
    end
    for i = #s.sparks, 1, -1 do
      local p = s.sparks[i]
      p.age = p.age + 1
      if p.age >= 50 then
        table.remove(s.sparks, i)
      else
        p.x, p.y, p.vy = p.x + p.vx, p.y + p.vy, p.vy + 1 / 8
      end
    end
  end

  shared.lightning_click = function(ev)
    -- PX's direction: from the left unless the shot's x speed, which WA's
    -- arrow keys set, is negative (lightningstrike.txt: SpX < 0 -> -DirX).
    local dirx = 0.5 * ((ev.vx or 0) < 0 and -1 or 1)
    local diry = math.sqrt(3) / 2
    local sy = -270
    local sx = (ev.x - (ev.y - sy) * dirx / diry)
    local hit = electrical_trace(sx, sy, dirx, diry)
    local ex, ey = hit and hit.x or sx + (300 * dirx),
      hit and hit.y or sy + (300 * diry)
    -- A bowling ball on the way stops the beam, as PX's does.
    local bx, by = nil, nil
    if shared.bowling_ball_on_beam then
      local reach = math.sqrt(sq(ex - sx) + sq(ey - sy))
      bx, by = shared.bowling_ball_on_beam(sx, sy, dirx, diry, reach)
    end
    if bx then ex, ey, hit = bx, by, { x = bx, y = by } end
    -- With no stock hit, scripted sentries can still stop the full ray.
    local reach = hit and math.sqrt(sq(ex - sx) + sq(ey - sy)) or 10000
    local tx, ty, sentry = turret.on_beam(sx, sy, dirx, diry, reach)
    if tx then ex, ey, hit = tx, ty, { x = tx, y = ty } end
    local distance = math.sqrt(sq(ex - sx) + sq(ey - sy))
    if hit and distance > 300 then
      sx, sy = ex - (300 * dirx), ey - (300 * diry)
    end
    local s = { sx = sx, sy = sy, ex = ex, ey = ey, hit = hit, dirx = dirx, diry = diry,
      delay = 150, life = 16, tail = 60, owner = ev.worm, alliance = ev.worm.alliance,
      sentry = sentry, ticks = 0,
      seed = (ex // 1 * 7919 + ey // 1) % 0x80000000, cloud_timer = 0, cloud = {}, sparks = {} }
    strikes[#strikes + 1] = s
    wa.sound.play(ev.worm, "sounds/lightning/thunder.wav")
    effect_actor(ex, ey, ev.worm, function(a)
      s.ticks = s.ticks + 1
      strike_particles(s)
      if s.delay > 0 then
        s.delay = s.delay - 1
        if s.delay == 0 then wa.sound.play(a, "sounds/lightning/hit.wav") end
      elseif s.life > 0 then
        s.life = s.life - 1
        if s.life == 0 then strike_hit(s) end
      elseif s.tail > 0 then
        s.tail = s.tail - 1
      elseif #s.cloud == 0 and #s.sparks == 0 then
        for i, held in ipairs(strikes) do
          if held == s then table.remove(strikes, i); break end
        end
        a:despawn()
      end
    end)
  end
end

return weapon
`
      },
      {
        path: 'weapons/mine_turret.lua',
        name: 'weapons/mine_turret.lua',
        language: 'lua',
        content: `-- Mine Turret: PyroMan's (Project X's p_turrets library: mineturret.txt). A
-- turret (lib/pyro_turret.lua) that lobs WA's own mines at moving enemies,
-- six a turn: armed at once, a 400 ms fuse, damage 50, trigger radius 48,
-- and WA may roll a dud, as PX's CMineParams have it.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {}

function weapon.definition()
  local fires = require("lib/shared").fires
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.mine",
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
        content: `-- Mortar Strike: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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
    cluster = { sprite = "sprites/mortar_strike/cluster.png" },
    sprite_overrides = {
          wsvclnk = "sprites/mortar_strike/trail.png",                             -- 466
          wsvc = "sprites/mortar_strike/cluster_trail.png",                        -- 260
        },
  })
end

return weapon
`
      },
      {
        path: 'weapons/ninja_star.lua',
        name: 'weapons/ninja_star.lua',
        language: 'lua',
        content: `-- Ninja Star: PX's thrown star. This is the entry point the component's install
-- runs; the port itself is lib/px_ninja_star.lua, which needs \`wa\` and so is
-- loaded here rather than at load (REPORT.md 11.11).

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
        content: `-- Nuke Rocket: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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
    -- The engine draws its PX sprite-builder hold from PX_HOLDS:
        -- the record's own sprite is PX-only, which left WA no sheet to draw
        -- the worm with.
        worm_sprites = PX_POSTURE,
    sprites = {
          "sprites/px_hold/nuke_rocket.png",
        },
    sounds = { "sounds/nuke_rocket_launch.wav" },
    params = { gpu_prefix = "sprites/px_hold/" },
    hold = { -- Nuke Rocket (nuke_rocket_anim): held at a fixed angle, not
        -- the aim's (dont_rotate_with_angle), and placed, so never put away.
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

  -- ------------------------------------------------------------ Nuke Rocket
  do
  --
  -- PX's nuke_rocket_script, on the mine slot. The scheme's record is a
  -- placed weapon that WA fires as a missile (fire type 2, method 2:
  -- CreateWeaponProjectile), and it already has every value PX's FireFinal
  -- gives its first rocket (a 3 s fuse, damage 0, bias 50, push 70, sound
  -- 66). So WA's own shot is PX's first rocket: it fuses on the ground,
  -- hissing (sound 66 every 10 frames). When it explodes, a nuke climbs out
  -- of it: a real WA missile of the same slot (wa.weapons.launch, as PX's
  -- MakeNuke creates a CMissile), silent, with a 1.6 s fuse, bursting into
  -- the record's clustlets. For 53 frames it climbs, randomly and jittering
  -- sideways, and carries worms and missiles within 17 pixels along; then
  -- it brakes. Its explosion adds PX's two 40/40 blasts and sounds 85, 70.
  -- PX's build of 28.09.2026 gives the nuke reddaz's bounce physics, with
  -- restitution 0.11; here it keeps 11% of its speed when it hits terrain
  -- (the record's terrain friction, 0 on WA's Mine record: it stopped dead).
  -- The fusing rocket keeps the record's 0 and stays where it lands.
  --
  -- Not ported: PX's particle trails, and carrying mines, crates, oil drums
  -- and bowling balls (their speed is not writable from Lua).
  local NR_HISS = 66    -- the fusing rocket's hiss, every 10 frames
  local NR_CLIMB = 53   -- frames the nuke climbs (PX: "1.1-1.2 second")
  local NR_CARRY = 17   -- pixels: what the climbing nuke carries along
  local NUKE = { fuse = 1600, sound = 0, burst = "clusters", terrain_keep_speed_pct = 11,
    clusters = { launch_power_pct = 33, power_variation_pct = 33 } }
  local NUKE_BLAST = { damage = 40, id = 40 } -- PX's DoExplosion(x, y, 40, 40), twice

  local nr_first = {}    -- missile id -> frames: a first rocket, fusing
  local nr_speed = {}    -- missile id -> { vx, vy } at its last frame
  local nr_nuke = {}     -- missile id -> frames flown: a nuke
  local nr_climbing = {} -- nuke id -> { x, y, vx, vy }, while it climbs
  local nr_pending = {}  -- nukes to launch once the rocket's blast is over
  local nr_shooter       -- the worm that fired (PX's ClWT / ClWN)
  local nr_owner = {}    -- missile id -> its worm, for a rocket nobody fired (an oil drum's)
  local nr_expect        -- fired: the next mine-slot missile is the rocket

  local function near(ax, ay, bx, by)
    local r = NR_CARRY
    return math.abs(ax - bx) < r and math.abs(ay - by) < r
  end

  wa.on.missile_frame(function(m)
    local t = nr_nuke[m.id]
    if t ~= nil then
      -- Before WA moves it, as PX's M_FRAME runs before super.
      if m.phase ~= "pre" then
        return
      end
      -- Retain the original lottery and RNG draw count; convert its speed to pixels.
      if t < NR_CLIMB then
        m.vy = m.vy - wa.random(19661, 52429) / 65536 -- 0.3 to 0.8 a frame
        if t % 2 == 1 then
          m.vx = m.vx + wa.random(-19661, 19661) / 65536 -- up to 0.3 either way
        end
        nr_climbing[m.id] = { x = m.x, y = m.y, vx = m.vx, vy = m.vy }
        for _, w in ipairs(wa.worms.all()) do
          if near(w.x, w.y, m.x, m.y) then
            w.vx, w.vy = m.vx, m.vy
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
    -- The rocket is the missile WA fires after the fire key. Later ones of
    -- the slot (the nuke's cluster bits) are no rockets.
    if nr_first[m.id] == nil and nr_expect and m.weapon == "px.nuke_rocket" then
      nr_first[m.id], nr_expect = 0, false
    end
    if nr_first[m.id] ~= nil then
      if m.phase == "post" then
        nr_speed[m.id] = { m.vx, m.vy }
        local n = (nr_first[m.id] or 0) + 1
        nr_first[m.id] = n
        local owner = nr_owner[m.id] or nr_shooter
        if n % 10 == 0 and owner then
          wa.sound.play(owner, NR_HISS)
        end
      end
      return
    end
    -- Any other missile a climbing nuke passes is carried along.
    if m.phase == "pre" then
      for _, c in pairs(nr_climbing) do
        if near(m.x, m.y, c.x, c.y) then
          m.vx, m.vy = c.vx, c.vy
        end
      end
    end
  end)

  -- PX's nuke oil drum (oildrums.txt): a first rocket, as the weapon's own
  -- shot but fired for \`owner\` from (x, y), climbing into a nuke when its
  -- fuse runs out. The weapon's record is PX's first rocket. Its id, nil
  -- when WA made none.
  shared.nuke_rocket_first = function(owner, x, y, vx, vy)
    local id = wa.weapons.launch({ weapon = "px.nuke_rocket", owner = owner, x = x, y = y, vx = vx, vy = vy })
    if id then
      nr_first[id], nr_owner[id] = 0, owner
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
      local owner = nr_owner[id] or nr_shooter
      nr_owner[id] = nil
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
      local owner = nr_owner[id] or nr_shooter
      nr_owner[id] = nil
      if owner then
        wa.sound.play(owner, "sounds/nuke_rocket_launch.wav")
      end
      -- Launched after the blast, as PX's comes after super.
      nr_pending[#nr_pending + 1] = { x = ev.x, y = ev.y, vx = speed[1], vy = speed[2], owner = owner }
    end
  end

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FIRE_WEAPON and worm.weapon == "px.nuke_rocket" then
      nr_shooter, nr_expect = worm, true
    elseif msg == wa.msg.FRAME_FINISH and #nr_pending > 0 then
      for _, p in ipairs(nr_pending) do
        local owner = p.owner or nr_shooter or worm
        local id = wa.weapons.launch({
          weapon = "px.nuke_rocket", owner = owner, x = p.x, y = p.y, vx = p.vx, vy = p.vy,
          missile = {
            fuse = NUKE.fuse, flight_sound = NUKE.sound, burst = NUKE.burst,
            bounce = { terrain_keep_speed_pct = NUKE.terrain_keep_speed_pct },
          },
          -- The first rocket has no payload; only this stage ejects clusters.
          clusters = NUKE.clusters,
        })
        nr_nuke[id] = 0
        nr_owner[id] = owner
      end
      nr_pending = {}
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
        content: `-- Old Woman Launcher: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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
    -- reddaz's launch point search, playtested by him. A point is clear when
    -- it and 8 points on a 3-pixel circle around it are free of land, and the
    -- worm can see it (nothing between them, so never the far side of a thin
    -- wall the muzzle poked through). The muzzle is tried first, then rings
    -- every 4 pixels out to 40, at finer angles the wider the ring; failing
    -- all, she starts at the worm.
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

return weapon
`
      },
      {
        path: 'weapons/petrol_turret.lua',
        name: 'weapons/petrol_turret.lua',
        language: 'lua',
        content: `-- Petrol Turret: PyroMan's (Project X's p_turrets library: customturret.txt,
-- weapon type 15). A turret (lib/pyro_turret.lua) that lobs WA's own Petrol
-- Bombs at moving enemies, six a turn, their blast 15.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {}

function weapon.definition()
  local fires = require("lib/shared").fires
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.mine",
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
    -- WA's missile needs a worm to fire for: a living member of its colour.
    local owner = t.owner(a, s)
    if owner == a then return false end
    a:sound(LAUNCH_SOUND)
    wa.weapons.launch({ weapon = "stock.petrol_bomb", owner = owner,
      x = shot.x, y = shot.y, vx = shot.dx * force, vy = shot.dy * force,
      missile = { explosion = { power = DAMAGE } } })
    return true
  end

  local t = pyro.new({
    kind = "petrol_turret", weapon = "px.petrol_turret", frames = pyro.FRAMES.petrol,
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
        content: `-- Pigeon Strike: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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
        path: 'weapons/pogo_sheep.lua',
        name: 'weapons/pogo_sheep.lua',
        language: 'lua',
        content: `-- Pogo Sheep: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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
    cluster = { sprite = "sprites/pogo_sheep/cluster.png" },
  })
end

return weapon
`
      },
      {
        path: 'weapons/portal_gun.lua',
        name: 'weapons/portal_gun.lua',
        language: 'lua',
        content: `-- Portal Gun: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  fires = {
    subtype = 3,
  },
  handling = {
    ends_turn = false,
  },
}

function weapon.definition()
  local shared = require("lib/shared")
  local fires = shared.fires
  return require("lib/weapon").merge(weapon.record, {
    wep = "weps/scales_of_justice.wep",
    panel_icon = "sprites/portal_gun/icon.png",
    -- the bazooka's hold
        airborne = true,
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
  -- PX p_portalgun2: a pair per team, orange (-) and blue (+). Ctrl/Alt
  -- chooses the other colour for one shot. Pause toggles the team's pair.
  -- The transport rules are reusable Lua; WA keeps the transported bodies.
  local shared = require("lib/shared")
  local Portals = require("lib/portals")
  local Effects = require("lib/portal_effects")
  -- The Portal Gun, by its id.
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
    -- Bounded return cache, without userdata or freed native pointers.
    if network.age % 150 == 0 then
      local alive = {}
      for _, worm in ipairs(wa.worms.all()) do alive["worm:" .. worm.id] = true end
      for _, list in ipairs({wa.missiles, wa.mines, wa.crates, wa.oil, wa.graves, wa.arrows}) do
        for _, body in ipairs(list.all()) do alive[body.kind .. ":" .. body.uid] = true end
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
      owner = worm, gravity = false, collide = false, on = { frame = tick } })
    ticker:scale(0)
  end

  -- PX's CheckWall: at least one of its four diagonal traces touches land.
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
    -- Each two successful placements use one ammo. Misses are refunded, as
    -- PX's FireFinal/TakeOffPortalWeap; attribute delayed hits to their shooter.
    if half_used[b.worm_id] then
      half_used[b.worm_id] = nil
      local worm = shooter(b)
      if worm then worm:ammo(ID, -1) end
    else half_used[b.worm_id] = true end
    return true
  end
  local function remove(b)
    bolts[b.id] = nil
    b.a:despawn()
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
    -- Native ground fire consumes ammo after this callback; airborne fire
    -- dispatches Lua alone and therefore needs no refund.
    if not fire.airborne then worm:ammo(ID, 1) end
    local a = wa.actors.spawn({ sprite = ART .. "portal_ball.png", x = b.x, y = b.y,
      owner = worm, gravity = false, collide = false, on = { frame = function() bolt_frame(b) end } })
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
    -- Jumping and falling it fires through on_fire (the claim's airborne =
    -- true, the profile's "Fires jumping, falling" setting).
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
      .. " (- orange, + blue; Ctrl/Alt other colour; Pause toggle)"
  end)

  if wa.on.draw then
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
            -- PX's CAnimation draws the endpoint independently of CPortal's
            -- linked/active state. Its alpha=50 is a percentage and draws the
            -- image repeatedly, not a byte alpha that makes singles disappear.
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
      if worm and worm.weapon == ID and worm.aiming then
        local keys = wa.world.keys()
        local colour = chosen[worm.team] or 1
        if keys.ctrl or keys.alt then colour = 3 - colour end
        quad("portal_gun_glow.png", worm.x, worm.y, 80, 80,
          worm.facing * (0.5 - worm.aim) * math.pi, (100 << 24) | (colours[colour] & 0xFFFFFF), "add", 0x000CFFFF)
      end
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
        content: `-- Real Shotgun: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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
        content: `-- Reinforcement: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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
    wep = "weps/nuclear_test.wep",
    panel_icon = "sprites/reinforcement/icon.png",
    on_select = { cursor = true },
    on_click = function(ev) fires.reinforcement(ev) end,
  })
end

function weapon.setup()
  -- Highlander: Reinforcement (PX utility_reinforcement: reinforcement_SCRIPT.txt).
  local shared = require("lib/shared")
  -- "Reinforcement", 200).
  local NAME, HEALTH = "Reinforcement", 200
  -- Its centre this far above the land it stands on: WA's standing worm
  -- settles the rest itself.
  local STAND = 12

  -- The ground under x (pixels): the first land below open air from the top
  -- (on a cavern, the roof's underside is not ground). Nil over the water.
  local function ground(x)
    local size = wa.world.size()
    local y = 0
    while y < size.h and wa.land.solid(x, y) do y = y + 1 end
    while y < size.h and not wa.land.solid(x, y) do y = y + 1 end
    if y >= size.h then return nil end
    return y
  end

  -- A click places it: PX drops the worm at the click's x from 200 pixels
  -- above the map on a jet pack with no fuel, and stands it up once it has
  -- landed. Here it stands on the ground under the click straight away, so
  -- it takes no fall damage either. Over the water it drops in at the
  -- surface, as PX's falls in. It takes a dead worm's place, as PX's does;
  -- with 8 living worms the team is full (PX: "Too many worms (8) in your
  -- team!").
  -- It can't be used while the team has eight living worms, so it can't be
  -- picked then either: greyed on the panel and skipped by the F-keys
  -- (wa.weapons.set_selectable), rather than picked to be refused. Checked as
  -- each turn starts, when a worm dies and after a worm is placed.
  local ID = "px.reinforcement"
  local FULL = 8

  local function update_selectable()
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

  wa.on.turn_start(update_selectable)
  wa.on.death(update_selectable)

  shared.fires.reinforcement = function(ev)
    local worm = ev.worm
    local x = ev.x // 1
    local y = ground(x)
    local at = y and (y - STAND) or wa.world.water() - STAND
    local ok, spawned = pcall(wa.worms.spawn, { team = worm.team, x = x, y = at, name = NAME, health = HEALTH })
    if not ok then
      wa.log("Reinforcement: " .. tostring(spawned))
      wa.sound.play(worm, "sounds/gravity_control/error.wav")
    else
      if shared.fresh_hand then
        -- Highlander's rules: dealt a fresh hand, as a new worm.
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
        content: `-- Remote Roller: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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

return weapon
`
      },
      {
        path: 'weapons/security_grenade.lua',
        name: 'weapons/security_grenade.lua',
        language: 'lua',
        content: `-- Security Grenade: PX's grenade that bursts in a ring. This is the entry point
-- the component's install runs; the port itself is lib/px_security_grenade.lua,
-- which needs \`wa\` and so is loaded here rather than at load (REPORT.md 11.11).

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
        content: `-- Sentry Gun: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {}

function weapon.definition()
  local shared = require("lib/shared")
  local fires = shared.fires
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.mine",
    name = "Sentry Gun",
    panel_icon = "sprites/sentry_gun/icon.png",
    is_weapon = true,
    -- PX's take-out and placing, grey; the housing in them coloured per team
        -- at draw time (one sheet and its housing for six colours).
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
          "sprites/sentry_gun/turret_gun.png", "sprites/sentry_gun/turret_flare.png", "sprites/sentry_gun/turret_light.png",
        },
    sounds = {
          "sounds/sentry_gun/sentryplace.wav", "sounds/sentry_gun/sentrybeeps2.wav",
          "sounds/sentry_gun/sentryfireloop.wav", "sounds/sentry_gun/sentryfireend.wav",
          "sounds/sentry_gun/sentryservostart.wav", "sounds/sentry_gun/sentryservoloop.wav",
          "sounds/sentry_gun/sentryservoend.wav",
        },
    params = {
          sprite_columns = 1,
          -- The take-out and placing play frame by frame, not as aim sheets.
          worm_sprites_animate = true,
          -- The turret between terrain (0x180000) and soil (0x1B0000): the
          -- real landscape can occlude its feet. The worm's sheets stay in front.
          depth = wa.depth.BEHIND_TERRAIN,
          depth_prefix = "sprites/sentry_gun/turret_",
          gpu_prefix = "sprites/sentry_gun/turret_",
        },
    on_fire = function(fire) fires.sentry_gun(fire) end,
  })
end

function weapon.setup()
  -- Highlander: Sentry Gun (PX weapon_sentry_gun: sentrygun.txt's PxSentryGun),
  -- on the Kamikaze slot as PX's Highlander scheme has it. The turret itself
  -- (placing, planting, aiming, reloading, damage) is lib/turret.lua; this is
  -- what it fires: stock Uzi rounds with PX's damage and spread, ejecting
  -- casings. Ported from the standalone sentry_gun pack
  -- (mods/examples/sentry_gun_old).
  local shared = require("lib/shared")
  local turret = require("lib/turret")
  local ART = "sprites/sentry_gun/"
  local SND = "sounds/sentry_gun/"
  local MUZZLE_OUT = 11      -- pixels from the pivot along the bore
  -- PX rolls a barrel deviation for each round and keeps every 5th one
  -- pin-point: tenths of a degree, from WA's shared RNG.
  local SPREAD_TENTHS = 20   -- +-2.0 degrees
  -- PX ejects a shell casing (WA's "uzicase" frames) on every shot, sideways
  -- from the barrel to the side the turret faces, with a little random angle
  -- and speed, gravity and no bounce, gone after 100 frames.
  local CASING = ART .. "casing.png"
  local CASING_FRAMES, CASING_LIFE = 16, 100
  local CASING_JITTER_DEG = 17                  -- PX's RandomFloat(-0.3, 0.3) rad
  local CASING_SPEED_MIN, CASING_SPEED_MAX = 200, 300 -- PX's 2.0 to 3.0, hundredths

  -- Tints for the grey head, from PX's own render (G/R about 0.39 and B/R
  -- about 0.28 on its red housing), the dominant channel pinned at 255: a
  -- vertex tint only scales down. Red to cyan, as worm.alliance + 1. The same
  -- colours tint the housing the worm carries (worm_sprites_team_tint).
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
      gravity = false, collide = false, owner = t.owner(a, s), kind = "casing",
      on = function(c)
        life = life - 1
        if life <= 0 then c:despawn(); return end
        c:gravity()
        c:move({ terrain = false, worms = false })
        spin = (spin + 1) % CASING_FRAMES
        c:frame(spin)
      end,
    })
  end

  -- WA traces and handles each impact exactly as a stock Uzi round, including
  -- directional push and its small hit graphics. Ignore only the emitting
  -- sentry's body/feet during tracing. WA handles intervening worms/objects,
  -- friendly fire and nearby hits; no synthetic explosions or impact actors.
  local function fire(t, a, s)
    local owner = t.owner(a, s)
    -- The native gun needs a living worm parent. An eliminated coalition's
    -- sentry retains its colour/ammo, and can fire again after capture/revival.
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
    damage = 2, push_pct = 100,
    muzzle_out = MUZZLE_OUT,
    art = { base = ART .. "turret_base.png", mask = ART .. "turret_mask.png", gun = ART .. "turret_gun.png", flare = ART .. "turret_flare.png", light = ART .. "turret_light.png" },
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
        content: `-- Sentry Laser: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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
    -- The body coloured per team, as on the planted turret; its barrel stays grey.
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
          "sprites/sentry_laser/turret_base.png", "sprites/sentry_laser/turret_body.png",
          "sprites/sentry_laser/turret_barrel.png", "sprites/sentry_laser/turret_light.png",
          -- The Laser Gun's beam (lib/laser.lua), its own here: a match
          -- without the Laser Gun would not have it.
          "sprites/laser_gun/laser_beam.png", "sprites/laser_gun/laser_glow.png",
        },
    sounds = {
          "sounds/sentry_laser/sentrylaserplace.wav", "sounds/sentry_laser/sentrylaserbeep.wav",
          "sounds/sentry_laser/sentrylaserstart.wav", "sounds/sentry_laser/sentrylaserloop.wav",
          "sounds/sentry_laser/sentrylaserend.wav", "sounds/sentry_laser/sentrylaserdisin.wav",
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
  -- Highlander: Sentry Laser (PX weapon_sentry_laser: SentryLaser.txt's
  -- PxSentryLaser and CLaserRayS, by rafa\`\`2), on the Dragon Ball slot as
  -- PX's Highlander scheme has it. Projectile defence: the turret of
  -- lib/turret.lua, aimed not at worms but at the nearest moving missile, mine
  -- or Bowling Ball of another colour within 300 px, in sight beyond its barrel-sweep grace area. Each of
  -- its 4 shots a turn is a short laser in its owner's colour that
  -- disintegrates the target (gone, no explosion) and burns what is in
  -- between: worms 10, crates and oil drums 20, a mine armed, a 4 px hole
  -- where it stops. It fires on any colour's turn.
  --
  -- Differences: WA's arrows (PX also shot them) are not listed to Lua, so it
  -- ignores them; a mine the beam crosses is armed on its fuse, as the Laser
  -- Gun's beam does, rather than sent PX's gun damage.
  local shared = require("lib/shared")
  local turret = require("lib/turret")
  local laser = require("lib/laser")
  local ART = "sprites/sentry_laser/"
  local SND = "sounds/sentry_laser/"
  local RAY_LIFE = 10          -- CLaserRayS LifeTime: frames the beam shows
  -- PX's ray starts at the barrel's centre (BarrelOffsetX 17, scaled 0.8) and
  -- 6 px on.
  local MUZZLE_OUT = 17 * 0.8 + 6
  -- PX rocks the barrel (2 px either way) while it fires; here for this long
  -- after each shot.
  local RECOIL_FRAMES = 12
  local HOLE = 4               -- MakeHole(4) where the beam stops
  local WORM_DAMAGE, OBJECT_DAMAGE = 10, 20
  -- The circles the beam touches things within (as the Laser Gun's).
  local RADIUS = { worm = 6, mine = 5, crate = 9, oil = 9 }

  -- The body's tint (as the Sentry Gun's housing, red to cyan) and the beam's
  -- colour, PX's pure team colours.
  local TEAM_TINT = shared.sentry_team_tint or { 0xFF6447, 0x4764FF, 0x47FF64, 0xE6E647, 0xE647E6, 0x47E6E6 }
  local BEAM_RGB = {
    { 255, 0, 0 }, { 0, 0, 255 }, { 0, 255, 0 }, { 255, 255, 0 }, { 255, 0, 255 }, { 0, 255, 255 },
  }

  local rays = {} -- every ray still showing, in the order fired

  -- What it shoots at: WA's missiles and mines (their team's colour), then the
  -- Bowling Balls, each in its list's order, which every machine shares.
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

  -- Everything the beam from (x0, y0) along (dx, dy), \`length\` px, touches:
  -- worms, mines, crates and oil drums, in that order.
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

  -- FX_HitObject: a yellow flash and three sparks.
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

  -- PX's Disintegrate: bursts at the muzzle and where the target was.
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
    -- FX_HitTerrain
    laser.particle(r, { x = x, y = y, life = 40, drag = 0.2, grav = -0.4, jitter = 0.6,
      s0 = laser.between(r, 0.6, 0.9), s1 = 0.01, c0 = c, c1 = c })
    laser.particle(r, { x = x, y = y, life = 50, drag = 0, grav = 0, s0 = 0.6, s1 = 0.1,
      c0 = c, c1 = { c[1] * 0.3, c[2] * 0.3, c[3] * 0.3 } })
  end

  -- The ray shows for RAY_LIFE frames and its particles live on after it.
  local function ray_actor(r, body)
    wa.actors.spawn({
      sprite = false, x = r.x, y = r.y, gravity = false, collide = false, owner = body,
      on = function(a)
        laser.step(r)
        r.life = r.life - 1
        r.size = r.size - 0.07
        if r.size < 0.5 then r.size = 1.0 end
        if r.life == 0 then a:sound("sounds/laser_gun/laser_end.wav") end
        if r.life <= 0 and #r.fx == 0 then
          for i, other in ipairs(rays) do
            if other == r then table.remove(rays, i) break end
          end
          a:despawn()
        end
      end,
    })
  end

  -- One shot (CLaserRayS): from the muzzle to the target, or to the land or
  -- object before it; burns what is in between, cuts a hole where it stops,
  -- and disintegrates the target.
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
  end

  local sentry = turret.new({
    kind = "sentry_laser", weapon = "px.sentry_laser",
    muzzle_out = MUZZLE_OUT,
    sensor_px = 300, ammo = 4, shot_frames = 6, activate = 20, beep_frames = 20,
    rot_active = 5.0, aim_tolerance = 5.0, health = 35,
    art = { base = ART .. "turret_base.png", mask = ART .. "turret_mask.png", gun = ART .. "turret_body.png", barrel = ART .. "turret_barrel.png", light = ART .. "turret_light.png" },
    sounds = {
      place = SND .. "sentrylaserplace.wav", beep = SND .. "sentrylaserbeep.wav",
      servo_start = SND .. "sentrylaserstart.wav", servo_loop = SND .. "sentrylaserloop.wav",
      servo_end = SND .. "sentrylaserend.wav",
    },
    tints = TEAM_TINT,
    targets = targets,
    fire = fire,
  })

  -- A mine the beam has armed stays armed: once per turret, not per shot.
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
        content: `-- Shadow-Bolt: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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
    hold = { -- Shadow-Bolt (shadow_bolt_script): no hand, the bolt animated
        -- The crossbow stays up through the shot: it has no firing poses of
        -- its own, so WA fires it in the aim posture. Not PX's.
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
        content: `-- Skip Go/Surrender: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.skip_go",
    name = "Skip Go/Surrender",
    panel_icon = "sprites/skip_go/icon.png",
    stock_fire_choice = { held = "ctrl", alternate = "stock.surrender" },
  })
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
        path: 'weapons/sniper_rifle.lua',
        name: 'weapons/sniper_rifle.lua',
        language: 'lua',
        content: `-- Sniper Rifle: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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
    hold = { -- Sniper Rifle (sniper_rifle_script): its hand at scale 0
        -- Up through each shot, with its laser, over the snipefire poses (the
        -- worm lit by the muzzle), so it does not flicker between the three.
        -- Not PX's: PX hides it until the worm aims again.
        keep_while_firing = true,
        put_away = true,
        -- A muzzle flash on each shot. Not PX's: its rifle and snipefire poses
        -- have none. The sentry gun's flare, smaller, at the barrel's tip (30
        -- pixels out, on the barrel 2 to the side, as the laser leaves it).
        flash = { sheet = "sprites/sniper_rifle/flash.png", out = 30, side = 2, scale = 0.45, frames = 3 },
        sheet = "sprites/px_hold/sniper_rifle.png", draw_hand = false, hand_radius = -6.0,
        hand_rotation = 1.0, hand_radial_rotation = 0.9,
        weap_rotation = 1.0, weap_radial_rotation = 0.0, weap_radius = 0.1,
      },
  })
end

function weapon.setup()
  local shared = require("lib/shared")

  -- The Sniper Rifle's sight remains a draw callback. Keep only its last aim
  -- through its firing poses; the rifle and flash themselves are engine draws.
  local held = {}
  wa.on.worm_message(function(worm, msg)
    local h = held[worm.id]
    if msg == wa.msg.FIRE_WEAPON and h then h.firing = true end
    if msg ~= wa.msg.FRAME_FINISH then return end
    if worm.weapon == "px.sniper_rifle" and worm.aiming and shared.owns("px.sniper_rifle") then
      held[worm.id] = { weapon = "px.sniper_rifle", aim = worm.aim }
    elseif not (h and h.firing and worm.weapon == "px.sniper_rifle"
        and (worm.state == "firing" or worm.state == "fired")) then
      held[worm.id] = nil
    end
  end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })

  -- ------------------------------------------ the Sniper Rifle's laser sight
  -- Shared with later sections; the rest of this section is local to it.
  local STOPPERS
  do
  --
  -- PX's LaserSight (weapon_gun_sniper_rifle_sb, on utility_laser_pointer's
  -- laserray): while the current worm aims the rifle, a red ray from 12 pixels
  -- out along the aim to the first thing in its way, drawn every rendered
  -- frame as 100-pixel quads of laser.png, added to the scene, narrowing along
  -- the ray, with a faint 7-pixel tip. It is drawing only: wa.on.draw, never
  -- the simulation.

  local LASER_LEN = 15000
  local LASER_WIDTH = 2
  local LASER_STEP = 5 -- PX's Trace tests every 5 pixels
  -- PX starts the ray on the worm's centre line, but the rifle art's barrel
  -- runs 2 pixels to its left (columns 26-29 of 60), so the ray ran that far
  -- under the barrel. It starts on the barrel instead.
  local LASER_BARREL = 2
  local function argb(a, r, g, b)
    return ((a * 256 + r) * 256 + g) * 256 + b
  end
  local LASER_RED, LASER_START, LASER_TIP =
    argb(255, 255, 48, 48), argb(192, 255, 96, 96), argb(16, 255, 48, 48)
  -- PX's Trace stops at anything its 2x2 mask touches. Terrain is traced
  -- exactly; objects by these radii in pixels, an estimate of their masks.
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

  -- laserray's MakeLaserRayF, point for point.
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
        -- The aim the rifle was drawn with, so the ray leaves along it; while
        -- the worm aims or fires the rifle, not while it puts it away.
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

  shared.STOPPERS = STOPPERS
  shared.held = held
end

return weapon
`
      },
      {
        path: 'weapons/sticky_bomb.lua',
        name: 'weapons/sticky_bomb.lua',
        language: 'lua',
        content: `-- Sticky Bomb: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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

weapon.missile_sprite = { -- Sticky Bomb (sb_script: SBB, sb.png, on every missile it fires)
    sheet = "sprites/sticky_bomb/bomb.png", frames = 1,
    spin = true, -- its record's WAT_Rotation
    -- PX's record has sprite 0; the pack's stock grenade is only for the
    -- worm's throw sheet, as the Electric Grenade's.
    hide = true,
    -- Only the bomb thrown, which WA would draw as its grenade (stock 50):
    -- the bit it bursts into flies, and sticks, with the bomb as its own
    -- cluster sheet.
    first_sprite = 50,
  }

function weapon.definition()
  local sdk = require("wf-lib/holds")
  local PX_POSTURE, PX_HANDS = sdk.PX_POSTURE, sdk.PX_HANDS
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.grenade",
    name = "Sticky Bomb",
    panel_icon = "sprites/sticky_bomb/sbico.png",
    sprite = "grenade",
    cluster = { sprite = "sprites/sticky_bomb/bomb.png" },
    -- Stuck, the bits draw with the frames at +0x178..+0x184, which the
        -- record points at 467 (wsvclnku, a worm in a crowned cap that WA
        -- doesn't draw, as PX's other wsv* overrides); PX overrides that too.
        sprite_overrides = {
          wsvclnku = "sprites/sticky_bomb/bomb.png",                               -- 467
        },
    worm_sprites = PX_POSTURE,
    -- The hold, and the bomb drawn in flight: GPU sheets, both under the prefix.
        sprites = { "sprites/px_hold/sticky_bomb.png", "sprites/sticky_bomb/bomb.png" },
    params = { gpu_prefix = "sprites/" },
    hold = { -- Sticky Bomb (sb_script)
        -- Thrown: once fired it has left the worm's hands, and WA puts nothing
        -- away (as for its own grenades), so neither does the rule.
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
        content: `-- Submarine Attack: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  handling = {
    ends_turn = true,
  },
}

-- PX draws the team's aiming cursor upside down and 20 pixels lower while
-- the weapon is selected (CDDQueue::AddSprite on sprites 32..37).
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
    -- Click-only dispatch keeps the strike's cursor, its arrow keys'
    -- direction and its turn handling.
    on_select = { cursor = true },
    on_click = function(ev) shared.submarine_click(ev) end,
  })
end

function weapon.setup()
  -- Highlander: Submarine Attack (PX weapon_substrike: substrike_s.txt, by
  -- rafa\`\`2, on PX's PxAirstrike: pxairstrike/airstrikebase.txt).
  --
  -- A submarine rises out of the deep under the click and, after 120 frames,
  -- fires twenty missiles up out of the water at it, one every three frames.
  -- PX builds it on its airstrike: an invisible plane flies across the map at
  -- the water line, 10 pixels a frame, and the bombs fall due as it passes the
  -- click; the strike is over when the plane leaves the map. So is the
  -- submarine, which fades out from 70 frames into the attack.
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
  -- PX's z 2.0: in front of the water, which the submarine rises through.
  local DEPTH = 0x20000
  -- SetColorMod(ARGB(255 - fade, 60, 60, 220), 6): modulation x2 under alpha.
  -- A quad modulates once, so the colour is doubled here (blue tops out).
  local TINT = 0x7878FF

  -- CSubMissile: PX's own missile, WA's air-strike missile with these values.
  -- Fired as WA's Bazooka, whose missile WA builds as PX's CMissile does; the
  -- Submarine Attack's own record is a strike, which builds none.
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
    -- explosion.flags 2+4+8+16+32+64+2048+4096+131072+4194304
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

  -- PxAirstrike's constructor: where the invisible plane starts, and how many
  -- bomb slots it is from the first bomb (bombs fall while 0 < drop <= 20).
  local function plane_start(s, water, width)
    local x = s.tx
    -- Its speed compensation, by how far under the plane (the water) the
    -- click is; always 0 for a click above the water.
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

  -- SubStrike::DropBomb.
  local function drop_bomb(s, a)
    local x = s.tx - 15 * s.dir + sign(wa.random(-10, 10)) * wa.random(0, 15)
    wa.weapons.launch({
      weapon = "stock.bazooka", owner = s.owner, x = x, y = wa.world.water() - 2,
      vx = BOMB_VX * s.dir, vy = BOMB_VY, missile = BOMB,
    })
    wa.sound.play(a, BOMB_SOUND)
  end

  -- PxAirstrike::Message, M_FRAME. False once the plane has left the map.
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

  -- SubStrike::Message, M_FRAME, and the submarine's rise from its
  -- M_DRAWQUEUE (PX moves it there, from the frame count alone).
  local function sub_frame(s, a)
    s.tick = s.tick + 1
    if s.before <= 0 then
      if not plane_frame(s, a) then
        subs[s.id] = nil
        a:despawn()
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
    -- From the left unless the strike's x speed, which WA's arrow keys set,
    -- is negative (PxAirstrike: Direction = Desc->SpX).
    local dir = (ev.vx or 0) < 0 and -1 or 1
    local s = { tx = ev.x, ty = ev.y, dir = dir, owner = ev.worm, water = water,
      tick = 0, before = BEFORE_ATTACK, after = AFTER_ATTACK, fade = 0 }
    s.x0, s.y0 = ev.x - 125 * dir, water + 220
    s.x, s.y = s.x0, s.y0
    plane_start(s, water, wa.world.size().w)
    local a = wa.actors.spawn({
      sprite = false, gravity = false, collide = false,
      owner = ev.worm, x = ev.x, y = ev.y, on = function(a) sub_frame(s, a) end,
    })
    s.id = a.id
    subs[s.id] = s
    wa.sound.play(a, SUB_SOUND)
  end

  local CORNERS = { { -1, -1 }, { 1, -1 }, { 1, 1 }, { -1, 1 } }
  -- AddSpriteEx(2.0, x, y, sprite, tick * 0.025, 0.75 * pi/4 * dir, 1.0):
  -- the sheet mirrored for a strike from the right (+0x40000), tilted toward
  -- where it is going, its 6 frames once every 40 frames.
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
        content: `-- Super Drill: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  drill = {
    duration_ms = 2000,
  },
}

weapon.defaults = {
  mid_air = false,
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.pneumatic_drill",
    name = "Super Drill",
    panel_icon = "sprites/super_drill/ico_superdrill.png",
  })
end

function weapon.setup()
  local shared = require("lib/shared")

  -- The two with a script of their own. Both run from worm messages, which WA
  -- sends in lockstep on every peer and in replays.

  -- Super Drill (PX weapon_super_drill): WA keeps drilling as it always does,
  -- and a hidden actor cuts a second hole at the worm each frame until WA's
  -- drill stops. The same as the super_drill example.
  local drills = {}

  local function follow_drill(worm, id)
    local started, waiting = false, 0
    return function(a)
      if worm.drilling then
        started = true
        wa.land.cut({ x = worm.x, y = worm.y, shape = "drill" })
        return
      end
      -- WA enters its drilling state a few frames after the shot.
      if not started and waiting < 4 then
        waiting = waiting + 1
        return
      end
      drills[id] = nil
      a:despawn()
    end
  end

  shared.drills = drills
  shared.follow_drill = follow_drill
end

return weapon
`
      },
      {
        path: 'weapons/super_gravedigger.lua',
        name: 'weapons/super_gravedigger.lua',
        language: 'lua',
        content: `-- Super Gravedigger: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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
    cluster = { sprite = "sprites/super_gravedigger/cluster.png" },
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
        content: `-- Super Tele: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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

  -- --------------------------------------------------------------- Super Tele
  do
  -- PX's FireFinal arms the teleport, the next M_FRAME starts its pose and
  -- sound, and M_FRAME moves the worm 50 frames after that. Keep the click
  -- from WA's fire context: the live pointer
  -- may have moved by the time the worm arrives. Mask 4 is approximated by
  -- three overlapping round cuts, centred where PX places them.
  fires.teleports = {} -- worm id -> frozen target and elapsed frames

  local function super_tele_arrive(worm, x, y)
    worm.x, worm.y = x, y
    for _, rise in ipairs({ 0, 10, 22 }) do
      wa.land.cut({ x = x, y = y - rise, shape = "circle", radius = 12 })
    end
  end

  -- WA's sound slots and the priority its teleport plays them at.
  local TELE_SOUND_PRIORITY = 3
  local SOUND_TELEPORT, SOUND_COMMUNICATOR, SOUND_WORM_POP = 67, 68, 54
  -- WA's manual placement plays Communicator at the click and WormPop when
  -- the worm appears, this many frames later.
  local PLACEMENT_POP_FRAMES = 21

  -- During manual placement WA keeps unplaced worms at (960, -10000).
  local function unplaced(worm) return worm.y == -10000 end

  -- WA's own teleport places a worm at the click, with no wind-up. Super
  -- Tele's record is a click weapon, which winds up first: for an unplaced
  -- worm the wind-up is skipped, so the click places it at once. On the fire
  -- message, before WA starts the wind-up; at the frame's end as a fallback.
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
      tele.marker:despawn()
      fires.teleports[worm.id] = nil
      return
    end
    if tele.pending then
      tele.pending = false
      -- WA's teleport setup clears its activity flag. Do this after the
      -- Lua-handled FireWeapon return restores that flag, as PX's M_FRAME does.
      worm:teleport_pose()
      wa.sound.play(worm, SOUND_TELEPORT, TELE_SOUND_PRIORITY) -- PX's teleport start
      return
    end
    tele.frames = tele.frames + 1
    if tele.frames < 50 then return end
    tele.marker:despawn()
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
        content: `-- Swim Suit: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {}

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

weapon.requires = { "weapons/helicopter", "weapons/sniper_rifle" }

function weapon.setup()
  local shared = require("lib/shared")
  local current_worm = shared.current_worm
  local held = shared.held
  local trunc = shared.trunc

  -- --------------------------------------------------------------- Swim Suit
  do
  --
  -- PX's swimsuit_SCRIPT (StepS; swim sprites by Team17) with fastswim_SCRIPT
  -- and swim_suit_diving_s (PyroMan), on WA's laser sight. Using it puts the
  -- suit on (or, out of the water, takes it off): WA's laser sight never
  -- switches on, as PX's FireFinal never calls super. A worm in the suit that
  -- falls into the water splashes and swims instead of drowning: the pack takes
  -- it (worm:take) and moves it by its own four keys (up to 2.5 pixels a frame
  -- times the swim speed, gliding to a stop when they are let go), stopping at
  -- land, turned by left and right unless Shift is held. Enter and weapons do
  -- nothing while it swims (Fast Walk aside). Out of the water it is released
  -- as from a jump. Too deep (180 pixels under the water, or the bottom of a
  -- cavern), knocked flying, or still in the water when the turn ends, the
  -- suit gives out and it drowns. Fast Walk switches the swim speed between 2
  -- and 6 for the turn. Missiles in the water can hit a swimming worm: they
  -- blow up on it (damage 100, blast 50).
  --
  -- A worm in the suit falling to the water dives (swim_suit_diving_s, by
  -- PyroMan): where WA would take its control (falling at 8 pixels a frame,
  -- WA's fall height, 0x50D370), the rest of its fall is traced frame by frame
  -- at WA's gravity (wa.land.trace, worm:fits); if it ends in the water, the
  -- pack takes the worm (worm:take) and carries it down that path to the
  -- splash, so it reaches the water in control. PX's looked straight down and
  -- held the worm in a state.
  --
  -- Drawn in the worm's place: the swim or, when still, the float animation,
  -- and a bubble around the worm while it wears the suit.
  --
  -- Not ported: PX's ghost jet and battyswim interplay (other libraries), the
  -- Ninja Rope workaround after leaving the water (the Jump is on the rope's
  -- slot here), inverted controls, and the team message on putting it on.

  local SWIM_CAP = 2.5          -- pixels a frame, times the swim speed
  local SWIM_PUSH = 0.1
  local SWIM_DRAG = 1.05
  local SWIM_STILL = 0.05
  local SWIM_FLOAT_STEP = 0.0099
  local SWIM_DEPTH = 180        -- how far under the water the suit holds
  local SWIM_SUIT_MASK = 134342 -- 0x20CC6: the worm's 0x420CC6 without SWIM_WATER
  -- Bit 22 of a collision mask: WA's water acts on what has it (0x4FDE20), and
  -- sinks or drowns it. The suit takes it off; a missile sinking in the water
  -- has only it.
  local SWIM_WATER = 0x400000
  local SWIM_MISSILE_MASK = 0x40007C -- a missile in the water that hits worms
  local SWIM_SPLASH = 57        -- WA's sound
  local SWIM_BODY_DEPTH = wa.depth.FRONT
  local SWIM_RING_DEPTH = wa.depth.FRONT + 1
  -- Ring sheet is 50×50; wa.draw.quad corners are centred on the worm like a:gfx.
  local SWIM_RING_HALF = 25
  -- The land a swimmer stops at: its body, 4 pixels either side, 6 above and below.
  local SWIM_HALF_W, SWIM_HALF_H = 4, 6

  -- The dive: WA takes a falling worm's control at 8 pixels a frame; taken
  -- a frame early.
  local DIVE_SPEED = 8
  local DIVE_FRAMES = 2000      -- the longest fall traced
  -- WA's states for a worm falling under its own control: jumping, its fall,
  -- falling (off a cliff, or let go).
  local FALLING = { [0x79] = true, [0x7A] = true, [0x7E] = true }

  local swim_speed = 2          -- fastswim: Fast Walk switches 2 and 6
  local swim_in_game = false    -- SwimInGame: someone has worn the suit
  local swimmers = {} -- worm id -> { suit, plopready, plopped, floating, plophase, flophase, fmult, keys, body, x, y, vx, vy, dive, dived }

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
    if s.body then s.body:despawn(); s.body = nil end
    worm.body_visible = true
  end

  -- The suit comes off, the water's bit back in its mask. \`sink\`: it gave out
  -- in the water, and the worm goes back to WA out of control, moving at
  -- (vx, vy), for WA to drown.
  local function suit_off(worm, s, sink, vx, vy)
    s.suit, s.plopready, s.plopped, s.floating = false, false, false, false
    swim_drop_art(worm, s)
    if sink then
      worm:release(vx, vy, { tumble = true })
    end
    worm.collision_mask = worm.collision_mask | SWIM_WATER
  end

  -- PX's icy oil drum takes a suited worm's Swim Suit off before it freezes
  -- it (icybarrel_logic.txt fires the Swim Suit, which toggles it).
  shared.swim_suit_off = function(worm)
    local s = swimmers[worm.id]
    if s and s.suit then suit_off(worm, s, false) end
  end

  local function swim_blocked(x, y)
    return wa.land.solid(x - SWIM_HALF_W, y) or wa.land.solid(x + SWIM_HALF_W, y)
      or wa.land.solid(x, y - SWIM_HALF_H) or wa.land.solid(x, y + SWIM_HALF_H)
  end

  -- One step towards the cap on a held key, as PX's: while under it, a push;
  -- past it, back to it.
  local function swim_push(v, dir, cap)
    if dir > 0 then
      if v < cap then return v + SWIM_PUSH * swim_speed end
      return cap
    end
    if v > -cap then return v - SWIM_PUSH * swim_speed end
    return -cap
  end

  -- WA's states for a worm knocked flying: tumbling, hit, blasted.
  local KNOCKED = { [0x7F] = true, [0x80] = true, [0x81] = true }

  -- One frame of a dive: gravity and wind as WA scales them for the worm, then
  -- the move, its centre traced through the land and the worm's shape tested
  -- where it ends (WA's own test, worm:fits). Returns the new speed and
  -- position, and whether land stops it, in which case the position is where
  -- it still was.
  local function dive_step(worm, x, y, vx, vy)
    vx = vx + wa.world.wind() * (worm.wind or 0)
    vy = vy + wa.world.gravity() * (worm.gravity or 1)
    local nx, ny = x + vx, y + vy
    if wa.land.trace(x, y, nx, ny) or not worm:fits(nx, ny) then
      return vx, vy, x, y, true
    end
    return vx, vy, nx, ny, false
  end

  -- Whether a fall from (x, y) at (vx, vy) reaches the water before land.
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
      -- The engine let go mid-dive: the turn ended, or WA knocked it flying.
      s.dive = nil
    end
    if not FALLING[worm.state_id] and not s.dive then
      s.dived = false -- landed, or out of its fall: the next fall is looked at
    end
    if s.plopready and not s.dive and not s.dived and worm.turn and FALLING[worm.state_id]
      and worm.y < water
      and worm.vy + 2 * wa.world.gravity() * (worm.gravity or 1) >= DIVE_SPEED then
      -- About to lose control: one look at where the fall ends.
      s.dived = true
      if dives_into_water(worm, worm.x, worm.y, worm.vx, worm.vy, water) then
        s.dive = { x = worm.x, y = worm.y, vx = worm.vx, vy = worm.vy }
        worm:take{ turn = "run" }
      end
    end
    local dive_into
    if s.dive then
      local d = s.dive
      local blocked
      d.vx, d.vy, d.x, d.y, blocked = dive_step(worm, d.x, d.y, d.vx, d.vy)
      if blocked then
        -- Land where the trace found none (it changed): WA's again, as it flies.
        s.dive = nil
        worm.x, worm.y = d.x, d.y
        worm:release(d.vx, d.vy)
        return
      end
      worm:carry(d.x, d.y)
      if d.y < water then
        return
      end
      s.dive, dive_into = nil, d
    end
    if worm.y >= water and s.plopready and KNOCKED[worm.state_id] then
      -- Knocked flying into the water: no swim, the suit gives out, and with
      -- the water's bit back WA's water takes it. Held in WA's hit state
      -- without the bit, it never settled and the next turn never came.
      suit_off(worm, s, false)
      return
    end
    if dive_into or worm.y >= water and s.plopready and worm.state ~= "teleporting" then
      -- Into the water: where a dive reached it, at the dive's speed.
      local d = dive_into or worm
      wa.sound.play(worm, SWIM_SPLASH)
      s.plopready, s.plopped = false, true
      s.x, s.y = d.x, d.y
      s.vx, s.vy = math.min(d.vx, cap), math.min(d.vy, cap)
      -- Swimming, it fires nothing but Fast Walk (its swim speed); the suit's
      -- own use is this pack's hook.
      worm:take{ turn = "run", fire = { "stock.fast_walk" } }
      s.plophase = 0
    end
    if s.plopped and not worm.taken then
      -- The engine let go: the turn ended, or WA knocked it flying. Still in
      -- the water, the suit gives out.
      suit_off(worm, s, true, worm.vx, worm.vy)
      return
    end
    if s.plopped then
      local vx, vy = math.min(s.vx, cap), math.min(s.vy, cap)
      local held = s.keys
      local still = math.abs(vx) <= SWIM_STILL * swim_speed and math.abs(vy) <= SWIM_STILL * swim_speed
      if still and not (held.left or held.up or held.down or held.right) then
        -- Floating: the float animation, back and forth.
        s.floating = true
        s.flophase = s.flophase + SWIM_FLOAT_STEP * s.fmult
        if s.flophase >= 0.99 and s.fmult == 5 then
          s.flophase, s.fmult = 0.99, -5
        elseif s.flophase <= 0 and s.fmult == -5 then
          s.flophase, s.fmult = 0, 5
        end
      elseif vx ~= 0 and vy ~= 0 then
        -- Swimming: the stroke follows the faster of the two directions.
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
      -- The engine clears the keys after this hook. Move, stopping at land
      -- on each axis (unless it is already in land, so it can swim free).
      local stuck = swim_blocked(s.x, s.y)
      local nx = s.x + vx
      if not stuck and swim_blocked(nx, s.y) then vx = 0 else s.x = nx end
      local ny = s.y + vy
      if not stuck and swim_blocked(s.x, ny) then vy = 0 else s.y = ny end
      s.vx, s.vy = vx, vy
      -- Out of the water: on through the air, as from a jump.
      if s.y < water then
        s.floating = false
        s.plopready, s.plopped = true, false
        -- Where the swim took it: its last pin is still under the surface.
        worm.x, worm.y = s.x, s.y
        worm:release(vx, vy)
      else
        worm:carry(s.x, s.y)
        -- Too deep: the suit gives out.
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
          suit_off(worm, s, true, vx, vy)
          return
        end
      end
    end
    -- Between turns, a worm out of the water takes the suit off.
    if not current_worm() and worm.y < water then
      suit_off(worm, s, false)
      return
    end
    -- RenderWorm: in the water, the swim or float animation in the worm's
    -- place (its art faces left). The bubble is drawn at render time below.
    local function art(sheet)
      return wa.actors.spawn({
        sprite = sheet, x = worm.x, y = worm.y, gravity = false,
        collide = false, owner = worm, visibility = worm, on = function() end,
      })
    end
    if s.plopped then
      local sheet = s.floating and "sprites/swim_suit/float.png" or "sprites/swim_suit/swim.png"
      if s.body and s.body_sheet ~= sheet then
        s.body:despawn()
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
      s.body:despawn()
      s.body = nil
      worm.body_visible = true
    end
  end

  -- Bubble while the suit is worn: draw-only, from the live worm position each
  -- rendered frame (keeps the subpixel fraction). A follower LuaActor + a:gfx was
  -- pixel-snapped and could wobble when airborne.
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
      swim_frame(worm)
    elseif msg == wa.msg.JUMP then
      -- M_ENTER: no jumping while it swims.
      local s = swimmers[worm.id]
      if s and s.plopped then
        return "eat"
      end
    elseif msg == wa.msg.FIRE_WEAPON then
      local s = swimmers[worm.id]
      if s and s.plopped and worm.weapon ~= "stock.fast_walk" then
        return "eat" -- no weapons while it swims
      end
      if worm.weapon == "stock.fast_walk" then
        swim_speed = swim_speed ~= 6 and 6 or 2
      elseif worm.weapon == "px.swim_suit" then
        -- FireFinal(Swim Suit), in place of WA's laser sight.
        local s = swimmer_of(worm)
        if not s.suit then
          wa.sound.play(worm, "sounds/swim_suit/putting_on_ssuit.wav")
          s.suit, s.plopready = true, true
          swim_in_game = true
          worm.collision_mask = SWIM_SUIT_MASK
        elseif worm.y < wa.world.water() then
          suit_off(worm, s, false)
        end
        worm:ammo("px.swim_suit", -1)
        return "eat"
      end
    end
  end, { msgs = { wa.msg.FRAME_FINISH, wa.msg.JUMP, wa.msg.FIRE_WEAPON } })

  -- fastswim: the swim speed is 2 again every turn.
  wa.on.turn_start(function()
    swim_speed = 2
  end)

  -- A missile in the water hits worms too, once anyone has worn the suit.
  wa.on.missile_frame(function(m)
    if swim_in_game and m.phase == "pre" and m.collision_mask == SWIM_WATER then
      m.collision_mask = SWIM_MISSILE_MASK
    end
  end)

  -- CMissile::Collide: such a missile blows up on a swimming worm, and is gone
  -- (sent below the water, where WA frees it).
  if wa.on.contact then
    wa.on.contact(function(worm, other)
      local s = swimmers[worm.id]
      if s and s.plopped and other.kind == "missile" then
        wa.actors.spawn({
          sprite = false, x = other.x, y = other.y, gravity = false, collide = false,
          owner = worm, explode = { damage = 100, id = 50, now = true },
        })
        other.y = wa.world.water() + 4096
      end
    end)
  end
  end
end

return weapon
`
      },
      {
        path: 'weapons/s_m_a_r_t_bomb.lua',
        name: 'weapons/s_m_a_r_t_bomb.lua',
        language: 'lua',
        content: `-- S.M.A.R.T Bomb: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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
      homing = {
        animation = 1,
        arm = 1100,
        kind = "lock",
        time = 1200,
        trail = {
          power = 6,
          speed = 500,
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
    cluster = {
          sprite = "sprites/smart_bomb/cluster.png",
          homing_sprite = "sprites/smart_bomb/cluster_homing.png",
        },
    sprite_overrides = { wsvbd = "sprites/smart_bomb/trail.png" },
    -- 250
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
        path: 'weapons/thumper_nade.lua',
        name: 'weapons/thumper_nade.lua',
        language: 'lua',
        content: `-- Thumper Nade: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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
    cluster = { sprite = "sprites/thumper_nade/cluster.png" },
    sprite_overrides = {
          wsvg = "sprites/thumper_nade/trail.png",                                -- 251
          wsvgu = "sprites/thumper_nade/cluster_trail.png",                       -- 252
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
        content: `-- Thumper Nade Strike: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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
    cluster = { sprite = "sprites/thumper_nade/cluster.png" },
  })
end

return weapon
`
      },
      {
        path: 'weapons/valyrian_fire.lua',
        name: 'weapons/valyrian_fire.lua',
        language: 'lua',
        content: `-- Valyrian Fire: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  handling = {
    remember_selection = true,
    ends_turn = true,
  },
}

weapon.missile_sprite = { -- Valyrian Fire: its bottle, spun at PX's 0.35 (WeapSprite speed)
    sheet = "sprites/px_hold/valyrian_fire.png", frames = 1,
    spin = true, spin_speed = 0.35,
    hide = true, -- PX's record has sprite 0; the stock bottle is the throw sheet's
  }

function weapon.definition()
  local shared = require("lib/shared")
  local fires = shared.fires
  local sdk = require("wf-lib/holds")
  local PX_POSTURE, PX_HANDS = sdk.PX_POSTURE, sdk.PX_HANDS
  return require("lib/weapon").merge(weapon.record, {
    wep = "weps/petrol_bomb.wep",
    panel_icon = "sprites/valyrian_fire/icon.png",
    sprite = "petrolbm",
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
  -- Highlander: Valyrian Fire (PX weapon_valyrianfire, rafa\`\`2's valyrianfire_s).
  local shared = require("lib/shared")
  local fires = shared.fires

  -- PX's FireFinal: from a worm in the water nothing is thrown and the bottle
  -- goes back into the team's ammo; otherwise the bottle starts 15 pixels
  -- further along the aim. WA's own projectile from there, so WA flies, burns
  -- and explodes it as its Petrol Bomb.
  local THROW_OUT = 15

  fires.valyrian_fire = function(fire)
    local w = fire.worm
    if w.y >= wa.world.water() then
      -- Set, as the pack always writes ammo; infinite (-1) stays infinite.
      local n = w:ammo("px.valyrian_fire")
      if n >= 0 then w:ammo("px.valyrian_fire", { set = n + 1 }) end
      return
    end
    -- Along the aim, which is the throw's direction. Not PX's cos and sin of
    -- the aim angle: the start is simulation, and only sqrt is exact on
    -- every machine.
    local x, y = fire.x, fire.y
    local speed = math.sqrt(fire.vx * fire.vx + fire.vy * fire.vy)
    if speed > 0 then
      x = x + (THROW_OUT * fire.vx / speed)
      y = y + (THROW_OUT * fire.vy / speed)
    end
    wa.weapons.launch({ weapon = "px.valyrian_fire", owner = w, x = x, y = y, vx = fire.vx, vy = fire.vy })
  end

  -- PX's ExplodeAt: 51 fires on a 3-pixel ring at the impact, besides WA's own
  -- explosion (the record starts no fire of its own: its detonation is 0). Each
  -- with PX's CFireDesc: count 0, duration 6000, no upward power, damage 0,
  -- owned by the team of the worm whose turn it is. PX's worm handler makes
  -- their hits 25% more damaging and knocks twice as hard (its M_GUNEXP,
  -- WA's 0x4B from the fire): the engine scales them as it spawns them. PX
  -- draws them green, SetColorMod(RGB(75, 225, 75)): \`tint\`, on the GPU.
  --
  -- PX places them at x +- 3 cos(360 - 7.2 i), y - 3 sin(360 - 7.2 i), the sign
  -- of x alternating. Simulation, so not computed here: the offsets below are
  -- that formula's, 16.16, worked out once (cos and sin need not agree to the
  -- bit between machines; integers do).
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
        content: `-- Weapon Crate: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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
    wep = "weps/freeze.wep",
    panel_icon = "sprites/weapon_crate/icon.png",
    -- PX's take-out (picking the crate up) and its hold.
        worm_sprites = {
          weaponlnk = "sprites/weapon_crate/take_out.png", weaponlnku = "sprites/weapon_crate/take_outu.png",
          weaponlnkd = "sprites/weapon_crate/take_outd.png",
          wthrow = "sprites/weapon_crate/put_away.png", wthrowu = "sprites/weapon_crate/put_awayu.png",
          wthrowd = "sprites/weapon_crate/put_awayd.png",
        },
    params = { worm_sprites_animate = true },
    on_fire = function(fire) fires.weapon_crate(fire) end,
  })
end

function weapon.setup()
  -- Highlander: Weapon Crate (PX utility_all_crates: allcrates_script.txt's
  -- "Weapon Crate", by Steps and rafa\`\`2, animations by 0rang3), on the Freeze
  -- slot as PX's Highlander scheme has it. Its record is PX's: placed as WA
  -- places a mine (its take-out, placing and ammo), and the turn goes on. What
  -- it places is one of WA's weapon crates, its contents WA's pick, teleported
  -- in 40 px in front of the worm, for the worm to go and collect. Every worm
  -- gets one each turn (scheme/highland_rules.lua).
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
        content: `-- Windy Cluster: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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
    cluster = { sprite = "sprites/windy_cluster/cluster.png" },
  })
end

return weapon
`
      },
      {
        path: 'weapons/wind_changer.lua',
        name: 'weapons/wind_changer.lua',
        language: 'lua',
        content: `-- Wind Changer: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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

weapon.requires = { "weapons/helicopter", "weapons/gravity_control", "lib/turn_controls" }

function weapon.setup()
  -- PX's force steps, applied toward the firing worm's facing.
  local WIND_STEP = 0.0317
  local wind_force = 0
  require("lib/turn_controls").register("px.wind_changer", {
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
    hint = function()
      return string.format("Wind Changer: force %d (keys 0-9), then Space", wind_force)
    end,
  })
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
        content: `-- From the Agility pack 1.1 (Zed / 0rang3, port by red), as it was.
-- Agility (air control), ported from Zed's RPG Wars mod, edited by 0rang3.
--
-- 1:1 port now that vx/vy are directly writable during jump and other
-- airborne states. No workaround needed -- this just nudges worm.vx/vy
-- per frame, the same as the original SpX/SpY increments.
--
-- Notes:
--   * PX's \`GetCurrentWorm() == this\` is \`worm.turn\`.
--   * PX's ModulatedGravity == 1 is worm.gravity == 1 (a plain factor).
--   * State check uses worm.state_id against the hex values from the state
--     logger, not the string names, since that's the precise source here.
--   * Keys follow the synchronized turn-player input in networked matches.

local STEP      = 0.1   -- per-tick nudge, matches C's 0.1
local STEP_LOWG = 0.03   -- up-nudge when gravity < 1.0
local LIMIT     = 3                  -- matches C's SpX/SpY <= 3 cap

-- Allowed states, by worm.state_id, mirroring the C allowlist:
-- WS_JUMP, WS_SLIDING, WS_FLYING2, WS_POWERFLY, WS_DRILLING, WS_FLYING.
-- Only JUMP and DRILLING are a confident 1:1 match to the logger's names;
-- the rest are my best guess at which hex id corresponds to which C state.
-- Confirm with the state logger and correct any that are wrong.
local ALLOWED = {
  [0x6E] = true,  -- WS_DRILLING      
  [0x73] = true,  -- WS_AFTERROPE     
  [0x79] = true,  -- WS_JUMP      
  --[0x7A] = true,  -- Landing Jump     
  [0x7E] = true,  -- WS_JUMP   
  [0x7F] = true,  -- WS_SLIDING
  [0x80] = true,  -- WS_FLYING
  [0x81] = true,  -- WS_POWERFLY
}

-- Runs once per worm per frame: the msgs filter makes the engine skip Lua
-- for every other message a worm gets (thousands a frame in a busy match).
wa.on.worm_message(function(worm)
  if not worm.turn then return end

  local state = worm.state_id
  if not state or not ALLOWED[state] then return end

  local k = worm.keys

  if k.up then
    local step = (worm.gravity or 1) == 1 and STEP or STEP_LOWG
    if worm.vy >= -LIMIT then worm.vy = worm.vy - step end
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
end, { msgs = { wa.msg.FRAME_FINISH } })
`
      },
      {
        path: 'features/collect_viewer.lua',
        name: 'features/collect_viewer.lua',
        language: 'lua',
        content: `-- A presentation-only inventory acquisition viewer. No actors or physics.
local CONFIG = {
  debug = true,          -- targeted grant/preview/visibility diagnostics in wkLua.log
  size = 24,             -- bounding square, world pixels; aspect preserved
  rise = 48,             -- world pixels over one lifetime
  amplitude = 6,         -- horizontal sine amplitude, world pixels
  spacing = 28,          -- centres in a simultaneous grant's grid
  columns = 4,
  lifetime = 2,          -- simulation seconds, paused with the game
  fade = 1.5,            -- final seconds fade linearly; lifetime - fade is opaque
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
        -- Opaque until the final fade seconds, then linearly to zero.
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
        path: 'features/damage_numbers.lua',
        name: 'features/damage_numbers.lua',
        language: 'lua',
        content: `-- Floating damage and heal numbers, Worms Reloaded type shyt.
-- This script only reads DMG Done and draws it on screen.

local GLYPH_H = 12
-- 1 point -> 0.70, 80+ -> 1.20.
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
-- alternate: flip per worm; random: local LCG below.
local SIDE_MODES = { alternate = true, facing = true, random = true }

local ORANGE = { 255, 160, 32 }
local RED = { 255, 48, 16 }
local HEAL = { 80, 255, 112 }

-- Cropped widths; every glyph is GLYPH_H tall.
local WIDTH = {
  [0] = 11, [1] = 10, [2] = 11, [3] = 12, [4] = 12,
  [5] = 11, [6] = 12, [7] = 11, [8] = 11, [9] = 12,
}
-- 6px glyph + 1 blank column; a 6x12 image loads as two 6x6 frames.
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

-- wa.draw.quad copies its table, so one spec can be reused.
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

  -- Local LCG: a cosmetic roll must not advance WA's shared RNG.
  local function next_rng()
    rng = (rng * 1103515245 + 12345) % 0x80000000
    return rng
  end

  local function side_for(worm, damage)
    local facing = (worm.facing and worm.facing < 0) and -1 or 1
    -- Heals don't use up an alternate turn or a random draw.
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

  -- Diff at frame finish; a 1-point drop is held so Live HP's pulse nets out.
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
            -- Pulse healed it back.
            pending_one[worm.id] = nil
            diff = 0
          else
            -- Real hit after all.
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
      -- A revive starts fresh, so it isn't printed as one big heal.
      last_hp[worm.id] = hp > 0 and hp or nil
    end
  end

  wa.on.worm_message(function(worm)
    if spawned then return end
    spawned = true
    wa.actors.spawn({
      sprite = false, x = 0, y = 0, gravity = false, collide = false,
      owner = worm,
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
        content: `-- ExTurnSide, by red: left and right turn the worm during rope swings
-- and other actions. From red's ExTurnSide pack 1.0.1, as it was.

-- Allows manual facing direction changes during rope swings and action states.
local prev_left = false
local prev_right = false

-- Once per worm per frame: the msgs filter skips Lua for every other message.
wa.on.worm_message(function(worm)
  if not worm.turn then return end

  local k = wa.world.keys()
  
  -- Left key pressed:
  if k.left and not prev_left then
    worm.facing = -1
  end
  
  -- Right key pressed: 
  if k.right and not prev_right then
    worm.facing = 1
  end
  
  prev_left = k.left
  prev_right = k.right
end, { msgs = { wa.msg.FRAME_FINISH } })`
      },
      {
        path: 'features/fog.lua',
        name: 'features/fog.lua',
        language: 'lua',
        content: `-- Selected profile options are the fog scheme; unselected, nothing runs.
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
  "explosion_circle",
  "crate_circle",
  "spectator_mode",
  "placement_vision",
  "fog_floor"
}

return function(ctx)
  local scheme = {}
  for _, key in ipairs(KEYS) do scheme[key] = ctx.option(key) end
  wa.fog.set(scheme)
  wa.fog.enable(true)
end
`
      },
      {
        path: 'features/instant_death.lua',
        name: 'features/instant_death.lua',
        language: 'lua',
        content: `-- Let each zero-HP victim die once its own movement settles, without waiting
-- for the battlefield. Frame polling also covers falls and direct HP writes.
-- WA owns the death animation, explosion and grave; repeat requests are inert.
wa.on.worm_message(function(worm)
  if not worm.turn and worm.hp == 0 then
    worm:allow_death()
  end
end, { msgs = { wa.msg.FRAME_FINISH } })
`
      },
      {
        path: 'features/live_hp.lua',
        name: 'features/live_hp.lua',
        language: 'lua',
        content: `-- Live HP, originally by reddaz. Commit WA's pending health display directly;
-- native hit, movement, freeze and death handling retain their own states.
wa.on.hurt(function(hit)
  if hit.phase ~= "post" or hit.lost <= 0 then return end
  local worm = hit.worm
  -- Keep the active worm's normal health timing. A zero-HP victim can
  -- update its label now while WA still owns its later death sequence.
  if not worm.turn and worm.hp >= 0 then
    worm:commit_health()
  end
end)
`
      },
      {
        path: 'features/parkour.lua',
        name: 'features/parkour.lua',
        language: 'lua',
        content: `-- Parkour, from Project X's script_parkour_no_slide (parkour.txt): the turn's
-- worm wall-jumps on Enter and bunny-hops on Backspace, both in the air.
--
-- Wall jump (Enter): jumping, sliding or tumbling with land within 20 pixels
-- to the right or left, the worm kicks off the nearer wall: up by 2 plus its
-- sideways speed, away by 3 plus that, facing away. Not again for 15 frames,
-- nor for 10 after a parachute.
-- Bunny hop (Backspace): jumping, sliding, tumbling, hit or blasted with land
-- within 30 pixels below, it hops: up by 3, and 2 more the way it faces. Not
-- for 25 frames after a jump is prepared.
--
-- Either leaves the worm in WA's jumping state, as PX's SetState(WS_JUMP):
-- WA's take-off (worm:jump) with PX's speed written over its own.

local WALL_JUMP = 2 -- PX's WallJumpMultiplier
local BHOP = 3 -- PX's BhopMultiplier
local WALL_REACH, FLOOR_REACH = 20, 30

local WALL_STATES = { jumping = true, sliding = true, tumbling = true }
local BHOP_STATES = { jumping = true, sliding = true, tumbling = true, hit = true, blasted = true }

local wall_delay, bhop_delay = {}, {} -- worm id -> frames left

local function jumping(worm, vx, vy)
  if worm.state ~= "jumping" then
    worm:jump()
  end
  worm.vx, worm.vy = vx, vy
end

-- How far the land is, tracing from the worm towards (dx, dy); nil for none.
local function land(worm, dx, dy)
  local hit = wa.land.trace(worm.x, worm.y, worm.x + dx, worm.y + dy)
  if hit and hit.hit then
    return math.abs(hit.x - worm.x) + math.abs(hit.y - worm.y)
  end
end

local function wall_jump(worm)
  if not WALL_STATES[worm.state] then return end
  local right, left = land(worm, WALL_REACH, 0), land(worm, -WALL_REACH, 0)
  if not right and not left then return end
  -- Away from the nearer wall; from the right one when both are as near.
  local side
  if right and left then
    side = right < left and -1 or 1
  else
    side = right and -1 or 1
  end
  local speed = math.abs(worm.vx)
  local vy = math.min(worm.vy, 0) - WALL_JUMP - speed
  local vx = (WALL_JUMP + 1 + speed) * side
  worm.facing = side
  jumping(worm, vx, vy)
end

local function bunny_hop(worm)
  if not BHOP_STATES[worm.state] then return end
  if not land(worm, 0, FLOOR_REACH) then return end
  local vy = math.min(worm.vy, 0) - BHOP
  local vx = worm.vx + (BHOP - 1) * worm.facing
  jumping(worm, vx, vy)
end

wa.on.worm_message(function(worm, msg)
  if not worm.turn then return end
  local id = worm.id
  if msg == wa.msg.FRAME_FINISH then
    if (wall_delay[id] or 0) >= 1 then wall_delay[id] = wall_delay[id] - 1 end
    if (bhop_delay[id] or 0) >= 1 then bhop_delay[id] = bhop_delay[id] - 1 end
    local state = worm.state
    if state == "jump_prepare" then bhop_delay[id] = 25 end
    if state == "parachuting" then wall_delay[id] = 10 end
  elseif msg == wa.msg.JUMP then -- Enter
    if (wall_delay[id] or 0) < 1 then
      wall_jump(worm)
      wall_delay[id] = 15
    end
  elseif msg == wa.msg.JUMP_UP then -- Backspace
    if (bhop_delay[id] or 0) == 0 then bunny_hop(worm) end
  end
end, { msgs = { wa.msg.FRAME_FINISH, wa.msg.JUMP, wa.msg.JUMP_UP } })
`
      },
      {
        path: 'features/utilities.lua',
        name: 'features/utilities.lua',
        language: 'lua',
        content: `-- The utilities feature: match settings the lobby scheme doesn't have, and
-- some players' favourite packs as switches. Every setting is an option of
-- this one component, read once at install.

-- The packs, by option: each module installs its hooks when loaded, so only
-- a switched-on one is loaded.
local PACKS = {
  { "ex_turn_side", "features/ex_turn_side" },
  { "agility", "features/agility" },
  { "parkour", "features/parkour" },
  { "live_hp", "features/live_hp" },
  { "instant_death", "features/instant_death" },
  { "collect_viewer", "features/collect_viewer" },
}

return function(ctx)
  local heal = ctx.option("heal_per_turn")
  if heal > 0 then
    wa.on.turn_start(function(ev) ev.worm:heal(heal) end)
  end

  local on = {}
  for _, pack in ipairs(PACKS) do
    if ctx.option(pack[1]) then
      require(pack[2])
      on[#on + 1] = pack[1]
    end
  end
  
  if ctx.option("damage_numbers") then
    require("features/damage_numbers")({
      side = ctx.option("damage_numbers_side"),
    })
    on[#on + 1] = "damage_numbers"
  end

  wa.log(("heal %d, packs %s"):format(
    heal, #on > 0 and table.concat(on, " ") or "none"))
end
`
      },
      {
        path: 'lib/cursor.lua',
        name: 'lib/cursor.lua',
        language: 'lua',
        content: `-- Shared land-cursor lifetime. All actions run in synchronized simulation
-- callbacks; drawing and HUD callbacks never perform them.
local M = {}

function M.install(ctx, spec)
  local cursor, owner
  local function selected(worm)
    return worm and worm.turn and worm.hp > 0 and worm.weapon == ctx.id
  end
  local function stop()
    if spec.stop then spec.stop(cursor) end
    if cursor then cursor:despawn(); cursor = nil end
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

-- Use native entity order to break ties, identically on every peer.
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
        path: 'weapons/cursor.lua',
        name: 'weapons/cursor.lua',
        language: 'lua',
        content: `local cursor = require("lib/cursor")
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
    local hint_dirty = false
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
        -- Round 50 ms up to 3 simulation frames. Also require releasing
        -- any click held while selecting the weapon or entering Fire mode.
        next_fire, ready_at, waiting_release = 0, wa.world.frame() + 3, true
      end
      hint_dirty = true
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
        hint_dirty = false
      end,
      frame = function(a, worm)
        local plus = wa.world.keys().plus_key or false
        if plus and not plus_held then
          mode = mode % #MODES + 1
          remembered[worm.id] = mode
          apply(a)
        end
        plus_held = plus
        if hint_dirty then
          wa.hud.message_top(("Cursor: %s | %s | + next mode"):format(MODES[mode].name, MODES[mode].hint),
            {to = "coalition", alliance = worm.alliance})
          hint_dirty = false
        end
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
          if worm then worm:hurt(10) end
        end
      end,
    })
    -- WA's SelectWeapon message also fires when reselecting the same mode.
    wa.on.worm_message(function(worm)
      if worm.turn and worm.weapon == ctx.id then hint_dirty = true end
    end, {msgs = {51}})
  end,
}
`
      },
      {
        path: 'weapons/plus_n.lua',
        name: 'weapons/plus_n.lua',
        language: 'lua',
        content: `-- +N Seconds. Keep the component ID utilities.plus_ten so existing profiles
-- retain the weapon; its amount and activation rules are now profile options.
local MAX_MS = 3600000

return {
  defaults = {
    ammo = { round_start = 0 },
    delay = 0,
    crate = { chance_pct = 40, type = "utility" },
    on_collect = "use",
    after_use = "continue",
  },
  install = function(ctx)
    local id = ctx.id
    local seconds = ctx.option("seconds")
    local bonus_mode = ctx.option("bonus_mode")
    local stacking = bonus_mode == "stack"
    local retreat_collect = ctx.option("retreat_collect")
    local automatic = ctx.data.on_collect ~= "keep"
    local used, pending, started = {}, nil, false

    local function add_time(worm, count, retreat)
      if count <= 0 or (not stacking and used[worm.ammo_group]) then return false end
      local current = retreat and wa.world.retreat() or wa.world.turn_clock()
      local ms = math.min(current + seconds * count * 1000, MAX_MS)
      if retreat then
        if not wa.world.set_retreat(ms) then return false end
      else
        wa.world.set_turn_clock(ms)
      end
      used[worm.ammo_group] = true
      return true
    end

    local function activate(worm, count, retreat)
      local held = worm:ammo(id)
      if held == 0 then return 0 end
      if not stacking then count = 1 end
      if held > 0 then count = math.min(count, held) end
      if not add_time(worm, count, retreat) then return 0 end
      if held > 0 then worm:ammo(id, -count) end
      return count
    end

    local function discard_pickup(worm, count)
      -- Only remove newly awarded surplus, never older or infinite stock.
      local held = worm:ammo(id)
      if count > 0 and held > 0 then worm:ammo(id, -math.min(count, held)) end
    end

    local function collect(worm, count, retreat)
      local activated = activate(worm, count, retreat)
      if bonus_mode == "once_discard" then discard_pickup(worm, count - activated) end
    end

    wa.weapons.replace({
      copy_from = "stock.double_turn_time",
      name = "+N Seconds",
      panel_icon = "sprites/plus_n.png",
      on_fire = function(fire)
        -- Native firing spends one unit. Refund it when stacking is off and
        -- this team has already received its bonus during the current turn.
        if not add_time(fire.worm, 1, wa.world.retreat() > 0) then
          if fire.worm:ammo(id) >= 0 then fire.worm:ammo(id, 1) end
        end
      end,
    })

    wa.on.turn_cleanup(function()
      used, pending, started = {}, nil, false
    end)
    if not automatic then return end -- Every pickup stays in inventory.

    wa.on.turn_start(function(ev)
      -- Native setup initializes the clock after StartTurn returns.
      if not started then pending = ev.worm.id end
    end)
    wa.on.worm_message(function(worm)
      if pending == worm.id and worm.turn then
        pending, started = nil, true
        local held = worm:ammo(id)
        -- Infinite stock activates once, never an unbounded stack.
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
    version: '0.18.0',
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
    version: '0.18.0',
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
    version: '0.18.0',
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
    version: '1.0.2',
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
        content: `-- The map's bee swarm: an add-on, so the two settings the profile owns
-- (\`spawn.bees.swarm\`'s options) have a home. It seeds the map once, on the
-- first turn -- the API 2 script did it from a worm-message frame counter.
-- Its bees are rogue (\`rogue = true\`): they chase whichever worm is moving,
-- their owner's team included.

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
-- API 4 uses wa.math, integer wa.random, turn-start spawning and a real body
-- moved by WA (\`on.bump\`). See logging_problems.md for the port notes.

local M = {}

-- Verbose spawn logging; the swarm's summary line is always logged.
M.DEBUG = false

-- The bundle's own files, named once.
M.SPRITE = "sprites/bee_flight.png"
-- Engine collision mask; \`on.bump\` needs the body to carry \`hits\`.
M.BODY_MASK = "sprites/bee/bee_mask.png"
M.SOUNDS = {
  "sounds/bzz1.wav",
  "sounds/bzz2.wav",
  "sounds/bzz3.wav",
  "sounds/bzz4.wav",
}

-- WA's aim and throw slots, as the original's \`worm_sprites\`.
M.WORM_SPRITES = {
  weaponlnk = "sprites/aim_p_muitb55w.gif",
  weaponlnku = "sprites/aim_u_muitb55w.gif",
  weaponlnkd = "sprites/aim_d_muitb55w.gif",
  wthrow = "sprites/draw_p_muitb55w.gif",
  wthrowu = "sprites/draw_u_muitb55w.gif",
  wthrowd = "sprites/draw_d_muitb55w.gif",
}

-------------------------------------------------------------------------------
-- Map Auto-Spawn Configuration (:4-8)
-------------------------------------------------------------------------------
local BEE_SPAWN_QUANTITY  = 22
local BEE_SPAWN_TRIES_PER_SLICE = 999
local SPAWN_TOP_MARGIN_PX = 100  -- don't probe within this far of the map's ceiling
local swarmPlanted        = false

-- Bee AI Constants (:11-46)
local SENSOR_RADIUS_PX  = 235
local CONTACT_RADIUS_PX = 26
local CHASE_SPEED       = (3.5)
local CHASE_STRENGTH    = 0.14
local CHASE_STEER_EVERY = 1
local ROAM_SPEED        = (0.6)
local ROAM_SPEED_BASE   = 0.12
local ROAM_COOLDOWN_MIN = 10
local ROAM_COOLDOWN_MAX = 20
local ROT_SMOOTH_DEG    = 4
local ROAM_STRENGTH     = 0.12
local ROAM_STEER_EVERY  = 1
local BONK_LIMIT        = 4
local SPIN_FRAMES       = 20
local MAX_HP            = 25
local ROAM_RANGE_X      = 55
local ROAM_RANGE_Y      = 110
local ROAM_ARRIVE_PX    = 20
local BEE_RADIUS_PX     = 4
local CORNER_BUFFER_PX  = 2
local HOMING_MAX_DIST_PX = 470
local HOMING_MAX_DURATION = 160
local ROAM_MAX_DIST_PX   = 420
local LOOKOUT_COOLDOWN_GIVEUP  = 150
local LOOKOUT_COOLDOWN_TIMEOUT = 200

local ROAM_FAIL_THRESHOLD  = 10
local ROAM_FAIL_SCALE      = 0.5
local CLIP_FRAMES_LIMIT    = 6   -- frames with the centre inside land before it is pulled out
local UNBURY_MAX_RADIUS_PX = 150  -- how far out the search for a free spot goes

-- Only spawn where this disc is free; raise it if bees still touch terrain.
local SPAWN_CLEAR_RADIUS_PX = 7
-- WA's move replaces the second step \`a:move\` added; 1.0 = PX's speeds.
local SPEED_SCALE = 2.0
-- Frames to ignore worms after a land bump, so the bee does not re-pick it.
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

-- \`wa.math.atan\` returns radians, the original wanted degrees (:426, :461).
local function deg(rad)
  return rad * (180 / math.pi)
end

-- \`wa.random\` takes whole numbers; the original's ranges are fractional.
local function rand(lo, hi)
  return wa.random(math.floor(lo), math.floor(hi))
end

local function shouldStop(s)
  return s.dead or s.freeMe or s.stopMe
end

-- A damaged bee spins; when the spin runs out it detonates.
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

-- ported from PX utils_Red (:76-111)
-- \`strict\`: nothing found means nil, not the target (which may be inside land).
local function checkSpawnPoint(obj, x, y, targetX, targetY, maxRadius, clearRadius, strict)
  maxRadius = maxRadius or 50
  clearRadius = clearRadius or (BEE_RADIUS_PX + 1)
  local worm = wa.worms.nearest(obj)
  -- Only a worm handle answers \`:fits\`.
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
      -- The bee's own disc must fit, and the target must be visible.
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

-- Sampled disc test: centre, half-radius ring, full-radius ring.
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

-- A bee in a slit needs at least one open direction; probe eight.
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
-- Keep fractional velocities: flooring them biased the steering to zero.
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

-- One target pass per frame for every bee: cache worms, test distance before
-- tracing, as PX's AssignCurseHomingTargets does.
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

local function refreshTargets()
  local frame = wa.world.frame() or 0
  if targetFrame == frame then return end
  targetFrame = frame

  local worms = wa.worms.all()
  local moving = {}
  wormsById = {}
  for i = 1, #worms do
    local w = worms[i]
    wormsById[w.id] = w
    -- Walking worms may report no velocity, so also check the label.
    local walking = (w.vx ~= 0 or w.vy ~= 0 or w.state_label == "walking")
      and (w.state ~= "standing" and w.state_label ~= "standing")
    if w.hp > 0 and walking then moving[#moving + 1] = w end
  end

  -- One loop for every live actor; only bees have a state entry.
  for _, a in ipairs(wa.actors.all()) do
    local s = state[a.id]
    if s and not s.dead and not s.freeMe and not s.stopMe
        and not s.spin and not s.softSpin then
      if (s.lookoutCooldown or 0) > 0 then
        s.lookoutCooldown = s.lookoutCooldown - 1
      end
      local target = s.targetId and wormsById[s.targetId]
      if target and (target.hp <= 0 or (not s.rogue and target.team == s.team)) then
        target = nil
        s.targetId = nil
      end
      if not target and (s.lookoutCooldown or 0) <= 0 then
        target = closestEnemy(a, s, moving)
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

local function detonate(a, s)
  a:explode({ damage = s.supercharged and 55 or 40, id = 100 })
  state[a.id] = nil
  a:despawn()
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

-- Centre plus four points: a cheap "not buried" test.
local function cheapClear(x, y)
  if wa.land.solid(x, y) then return false end
  return not (wa.land.solid(x - 3, y) or wa.land.solid(x + 3, y)
    or wa.land.solid(x, y - 3) or wa.land.solid(x, y + 3))
end

-- Nearest free disc, walking rings outward; no line of sight.
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

-- Pull a buried bee out; WA cannot bump a body it cannot move.
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

-- Keep the last safe spot, decay bonks, and unbury a stuck bee.
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

-------------------------------------------------------------------------------
-- Bee Actor Brain (:303-480)
-------------------------------------------------------------------------------
local function brain(a, ev)
  local s = state[a.id]
  if not s then return end
  ev = ev or {}

  -- Damage/knockback is in \`hurt\`; do not double-apply it here.
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
  refreshTargets()

  if s.spin or s.softSpin then
    if s.spinN == 0 then playBuzz(a) end
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

  local target = wormById(s.targetId)

  if target and (target.hp <= 0 or (not s.rogue and target.team == s.team)) then
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
end

-- A \`hit\` brain makes WA hand over the blast's knock instead of pushing the
-- body; apply both, as PX did.
local function hurt(a, ev)
  local s = state[a.id]
  if not s then return end
  -- Blasts knock back without spinning; gun/fire hits tumble.
  ev = ev or {}
  takeHit(a, s, ev.damage, ev.kind ~= "blast")
  a.vx = a.vx + (ev.vx or 0) * 1.5
  a.vy = a.vy + (ev.vy or 0) * 1.5
end

-- Only a living enemy worm sets a bee off.
local function isEnemyWorm(s, other)
  if type(other) ~= "userdata" then return false end
  if other.kind ~= "worm" then return false end
  if not other.hp or other.hp <= 0 then return false end
  return s.rogue or other.team ~= s.team
end

local function onContact(a, ev)
  local s = state[a.id]
  if not s or s.dead then return end
  local other = ev and ev.other
  if isEnemyWorm(s, other) then
    log("[BEE] detonate: enemy worm contact id=" .. tostring(a.id))
    detonate(a, s)
  end
end

-- WA's sweep stopped on something; its stop/bounce is already in vx/vy.
local function bump(a, ev)
  local s = state[a.id]
  if not s or s.dead then return end
  s.bonk = s.bonk + 1
  local limit = s.targetId and 1 or BONK_LIMIT
  if s.bonk > limit then
    s.spin, s.bonk = false, 0
    if s.targetId then
      s.targetId = nil
      s.lookoutCooldown = BUMP_LOOKOUT_FRAMES
    end
    s.arriveX = nil   -- a fresh roam point on the next frame
  end
end

-------------------------------------------------------------------------------
-- The Actor Spawner (:485-543)
-------------------------------------------------------------------------------
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
    -- WA moves this body and reports land bumps; only fire and blasts hurt it.
    body    = { shape = M.BODY_MASK, hits = { land = true, worms = true },
                hit_by = { fire = true, blasts = true } },
    -- frame: per-frame brain; hit: blasts; contact: worm touch; bump: land.
    on      = { frame = opts.brain or brain, hit = hurt, contact = onContact, bump = bump },
  })

  if body then
    log("[ACTOR SPAWN] Successfully spawned actor ID=" .. tostring(body.id) ..
        " (Rogue=" .. tostring(opts.rogue or false) .. ")")
    state[body.id] = {
      rogue           = opts.rogue or false,
      team            = opts.team or (owner and owner.team) or -1,
      owner           = owner,
      hp              = opts.hp or MAX_HP,
      dead            = false,
      freeMe          = false,
      stopMe          = false,
      spin            = false,
      softSpin        = false,
      spinN           = -10,
      bonk            = 0,
      bonkhome        = 0,   -- set by the original, read by nothing
      rot             = 0,
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
      ambientBuzzCD   = rand(30, 60),   -- set by the original, read by nothing
    }
  else
    log("[ACTOR SPAWN ERROR] wa.actors.spawn returned nil!")
  end
  return body
end

-------------------------------------------------------------------------------
-- Slice-Based Random Map Spawner (:548-598)
-------------------------------------------------------------------------------
-- Returns how many bees it placed. \`quantity\` is the profile's option.
function M.spawn_map_bees(quantity, ownerWorm)
  quantity = math.max(1, math.floor(quantity or BEE_SPAWN_QUANTITY))
  if not ownerWorm then
    wa.log("[BEE SPAWN] no worm to seed from")
    return 0
  end

  local size = wa.world.size()
  local levelSX = math.floor(size.w)
  -- The original used the map height as the water line (:553); API 4 knows the
  -- real one (\`wa.world.water()\`), and falls back to the height on a map with
  -- no water.
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
    -- A map narrower than the bee count wants leaves the last slices empty;
    -- \`wa.random\` refuses an empty range (\`spawn.rs\` "random_fn"), so they
    -- probe one column at the edge instead.
    if sliceEnd < sliceStart then sliceEnd = sliceStart end

    while sliceAttempts < BEE_SPAWN_TRIES_PER_SLICE and not spawnedInSlice do
      sliceAttempts = sliceAttempts + 1

      local tryX = rand(sliceStart, sliceEnd)
      local tryY = rand(SPAWN_TOP_MARGIN_PX, math.max(SPAWN_TOP_MARGIN_PX + 1, (waterY) - 100))
      local traceEndY = waterY - (70)

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

-- The original's name, for a script that calls it (the API 2 file returned it).
M.spawnRandomBees = M.spawn_map_bees

-------------------------------------------------------------------------------
-- The weapon component (API 2's registration, :603-639)
-------------------------------------------------------------------------------
function M.install_weapon(ctx)
  wa.weapons.replace({
    -- The \`may be wrong weapon = "px.kbee"\` note (:604) meant the key \`weapon\`,
    -- which names a *placed* weapon a replace aims at (\`api.rs:1096-1103\`).
    -- API 4 does not need it: a component replaces the slot its own profile put
    -- it on, and a name here would have to be a component id, not \`px.kbee\`.
    name      = "Keeper Bee",
    -- WA's Bazooka: it aims with the reticle, and \`on_fire\` replaces the shell
    -- with the bee (\`crates/engine/src/actor.rs\` "try_lua_projectile" -- an
    -- \`on_fire\` callback eats the stock projectile).
    copy_from = "stock.bazooka",
    -- The icon the original wanted (\`:607\`, \`:612\`): PX's own 32x32 PNG
    -- (\`sprites/beeico.png\`). A \`.png\` is the loader's picture and the panel
    -- icon both (\`api.rs\` "table_to_claim").
    panel_icon = "sprites/beeico.png",
    is_weapon = true,
    -- The flight sheet: \`bee_flight.png\` is 32x128, four 32x32 frames stacked,
    -- which the loader slices on its own (\`gfx::load_strip_bytes\`, the
    -- \`h > w\` branch); \`a:frame(0..3)\` walks them. The original asked for
    -- \`sprite_columns = BEE_FRAME_COUNT\` (:611), which the row slice ignores.
    sprites   = { M.SPRITE },
    -- PX's six worm poses, WA's own slot names (\`:615-622\`).
    worm_sprites = M.WORM_SPRITES,
    -- \`sprites/\`, not the original's \`sprites/bee_\` (:611): the aim and throw
    -- GIFs live beside the flight sheet and must route into the atlas with it
    -- (\`apply.rs\` matches the prefix), and PX's own bundles do the same.
    params    = { gpu_prefix = "sprites/" },
    sounds    = M.SOUNDS,
    on_fire = function(fire)
      local worm = fire.worm
      playBuzz(worm)

      local sx, sy = checkSpawnPoint(worm, fire.x, fire.y, fire.x, fire.y, 80, 7, true)
      if not sx then
        -- No clear room near the muzzle: the firing worm's own spot is free.
        sx, sy = worm.x, worm.y - 8
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

-------------------------------------------------------------------------------
-- The swarm component (API 2's worm-message hook, :644-657)
-------------------------------------------------------------------------------
function M.install_swarm(ctx)
  -- The add-on has no panel slot, so it loads its own copy of the sheet and
  -- the buzzes (\`wa.assets.load\`, \`api.rs\`).
  wa.assets.load({ sprites = { M.SPRITE }, sounds = M.SOUNDS, gpu_prefix = "sprites/" })

  local on = ctx.option("spawn_map_bees")
  local amount = ctx.option("bee_amount")
  wa.log(("Keeper Bee swarm: %s, %d bees"):format(on and "on" or "off", amount))
  if not on then return end

  -- API 4 has no round-start hook (\`dispatch.rs\` "turn_event"), so the swarm
  -- seeds on the first turn of the match -- what the original's once-only
  -- \`spawnedMapBees\` (:7, :647) did -- and asks again on a later turn if the
  -- map gave it nowhere to stand.
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
        content: `-- Keeper Bee: reddaz's bee launcher. This is the entry point the component's
-- install runs; the port itself is lib/bee.lua, which needs \`wa\` and so is
-- loaded here rather than at load.

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
        content: `-- Shotgun is only the panel slot. Selecting it turns the owner into the POOZ
-- runner (Lua actor). A/D move, W jumps (again in air for the flip), Shift sprints.
-- Switch weapon to drop out.
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

    -- Glue to dirt within SLOPE pixels so gentle grades do not pop into air.
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

    -- PNG strips are 15fps. Ground clips step every other tick so Walk/Run/Land
    -- actually read. FrontFlip stays at 15fps (matches POOZ ~3 ticks/frame).
    local function set_clip(a, st, name)
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
    end

    local function restore(worm, a)
      live[worm.id] = nil
      if a then
        worm.x = a.x
        worm.y = a.y
      end
      worm.visible = true
      worm:drop()
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
          a:despawn()
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
        worm:carry(worm.x, worm.y)
        wa.actors.spawn({
          sprite = "sprites/Idle",
          origin = "bottom",
          x = worm.x,
          y = worm.y,
          vx = 0,
          vy = 0,
          gravity = false,
          collide = false,
          loop = false,
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
    version: '1.3.1',
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
-- Fires the first shot from \`on_fire\`; a hidden timer fires the rest \`delay\`
-- frames apart and holds WA's shot counters so the worm stays in its firing
-- state. The counters are written only from the timer, never from \`on_fire\`.
-- A cancel or interruption ends WA's repeat fire and settles \`on_done\`.
-- See README.md for the API and the rejected alternatives.

local M = {}

-- Sequencer keys; everything else is passed to spawn/launch.
local CONTROL = {
  count = true, delay = true, spread = true, on_shot = true, on_done = true,
  standoff = true, cancel_weapon = true,
}

local function is_control(k) return CONTROL[k] == true end

-- Copy the shot spec without the sequencer's keys.
local function shot_spec(t)
  local out = {}
  for k, v in next, t do
    if not is_control(k) then out[k] = v end
  end
  return out
end

-- A number, or a function of (shot number, worm). \`i\` is 1-based.
local function value(v, i, w, fallback)
  if type(v) == "function" then return v(i, w) end
  if v == nil then return fallback end
  return v
end

-- \`wa.random\` takes integer bounds; scale the spread to thousandths first.
local function jitter(amount)
  if not amount or amount <= 0 then return 0 end
  local n = math.floor(amount * 1000 + 0.5)
  if n < 1 then return 0 end
  return wa.random(-n, n) / 1000
end

-- Resolve one shot's position and velocity: the velocity first (so a standoff
-- can be taken along it), then the position, then the spread.
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
  -- Start the shot clear of the firing worm, along its own velocity.
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

-- Bursts mid-flight, already settled, and told to stop. The timer settles
-- \`on_done\` outside WA's fire call.
local running = {}
local settled = {}
local cancelled = {}

-- Frames to swallow WA's queued re-fire after the last shot.
local DRAIN = 10

-- WA states a worm is not firing in. Raw values: \`worm.state\` returns nil for
-- walking and the hit/blast states. The firing states 0x67-0x6B are absent.
local NOT_FIRING = {
  [0x65] = true, -- standing
  [0x66] = true, -- walking
  [0x6C] = true, -- punching
  [0x6E] = true, -- drilling
  [0x6F] = true, -- teleporting
  [0x70] = true, -- rope_firing?
  [0x71] = true, -- torching?
  [0x73] = true, -- rope_rolling?
  [0x76] = true, -- getting_up
  [0x77] = true, -- jump_prepare
  [0x78] = true, -- jetpacking
  [0x79] = true, -- jumping
  [0x7A] = true, -- jump_falling
  [0x7B] = true, -- roping?
  [0x7C] = true, -- bungee
  [0x7D] = true, -- parachuting
  [0x7E] = true, -- falling / sliding
  [0x7F] = true, -- tumbling
  [0x80] = true, -- hit
  [0x81] = true, -- blasted
  [0x82] = true, -- dying?
  [0x85] = true, -- drowning?
  [0x86] = true, -- frozen
  [0x87] = true, -- dead?
}

-- \`fire(i)\` launches one shot; \`weapon\` is the id the worm must still hold.
local function run(owner, count, delay, fire, weapon, on_done)
  if not owner or count < 1 then return nil end

  local id = owner.id
  -- WA's own re-fire of a burst already in flight; it owns every shot.
  if id ~= nil and running[id] then return nil end

  local function alive()
    return owner.hp and owner.hp > 0
  end

  if not alive() then return nil end

  -- End WA's repeat fire, as when its shots run out.
  local function end_fire()
    if owner.shots_to_fire then owner.shots_fired = owner.shots_to_fire end
  end
  -- Keep the worm in its firing state for the whole burst.
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
  -- Shots left, including one launched in the same tick as a cancel.
  local left = count - 1
  -- Every end -- last shot, cancel, interruption -- settles \`on_done\` here.
  local function settle()
    if id ~= nil then settled[id] = true end
    end_fire()
    if on_done then on_done(owner, count - left) end
    release()
  end
  local function frame_delay(i)
    return math.max(1, math.floor(value(delay, i, owner, 1)))
  end
  -- Stop if the worm died, lost the turn or weapon, or left its firing state.
  local function interrupted()
    return cancelled[id] == true
      or not alive() or not owner.turn
      or weapon == nil
      or (weapon ~= nil and owner.weapon ~= weapon)
      or NOT_FIRING[owner.state_id] == true
  end

  if id ~= nil then running[id] = true end
  fire(1)
  if count == 1 then
    -- One shot is WA's own; nothing was held, and there is nothing to end.
    release()
    return nil
  end
  -- Do not hold the counters here: on_fire for a projectile runs inside WA's
  -- own fire loop. The timer holds them a frame later.

  local wait = frame_delay(2)
  local drain = 0
  local ticker
  ticker = wa.actors.spawn({
    -- Bodiless timer. \`persist\` survives a nearby blast so the state check,
    -- not the actor's death, ends the burst.
    sprite = false, x = owner.x, y = owner.y,
    gravity = false, collide = false, persist = true, drown = false,
    owner = owner,
    on = function(a)
      -- A frame clock only; the safe place to hold the worm's counters.
      a.vx, a.vy = 0, 0
      if drain > 0 then
        -- Swallow WA's queued re-fire.
        drain = drain - 1
        if drain <= 0 then
          release()
          a:despawn()
        end
        return
      end
      -- The worm's state ends the burst; always release the counters.
      if interrupted() then
        settle()
        a:despawn()
        return
      end
      wait = wait - 1
      if wait > 0 then hold() return end
      if left > 0 then
        left = left - 1
        local n = count - left
        fire(n)
        if cancelled[id] then
          -- The shot itself cancelled; settle after WA's fire call returns.
          settle()
          a:despawn()
          return
        end
        if left > 0 then
          wait = frame_delay(n + 1)
          hold()
        else
          -- The last shot has left: let WA finish the shot and retreat.
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

-- Stop the burst for \`owner\` and end WA's counters now. The timer settles
-- \`on_done\` on its next tick. False if there is nothing left to settle.
function M.cancel(owner)
  local id = owner and owner.id
  if id == nil or not running[id] then return false end
  cancelled[id] = true
  if owner.shots_to_fire then owner.shots_fired = owner.shots_to_fire end
  return settled[id] ~= true
end

-- Fire \`opts.count\` actors, \`opts.delay\` frames apart; other keys are spawn.
function M.fire_sequential_actor(opts)
  if type(opts) ~= "table" then return nil end
  local count = opts.count or 1
  local delay = opts.delay or 1
  local owner = opts.owner
  if type(owner) ~= "table" and type(owner) ~= "userdata" then
    -- A plain table would read hp/x/y but spawn refuses it.
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

-- Fire \`params.count\` real WA missiles, \`params.delay\` frames apart.
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
      -- A full object pool raises; do not kill the timer's brain over it.
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
        content: `-- Draw a held weapon during WA's repeated-fire frames (0x6A/0x6B). The engine
-- draws the aiming and put-away frames; from the second shot of a held burst
-- \`h.firing\` is false, so this fills those two frames at full size.
-- Presentation only: reads worm state and enqueues a quad.

local M = {}

-- Raw WA states; \`worm.state\` is nil for some of them.
local FIRING = {
  [0x6A] = true, -- firing
  [0x6B] = true, -- fired
}

-- \`worm_hold::DEPTH\`: the engine's one front band (\`worm_hold.rs:18\`).
local DEPTH = 0x10000

local draws = {}
local hooked = false

-- One quad spec, refilled per draw: no table in the render callback.
local QUAD = { depth = DEPTH, points = { {}, {}, {}, {} } }

-- \`render::Sprite::emit\`'s rotation: angle in radians, clockwise, y down.
local function corner(t, cx, cy, cos, sin, lx, ly)
  t.x = cx + lx * cos - ly * sin
  t.y = cy + lx * sin + ly * cos
end

-- Read aim and facing live: the player can adjust them mid-burst.
local function enqueue(art, w)
  local pi = math.pi
  local facing = w.facing < 0 and -1 or 1
  local aim = w.aim

  local rot = (1.0 - aim) * pi
  local rot_w = rot + pi * art.weap_radial_rotation
  local cx = w.x + facing * wa.math.sin(rot_w) * art.weap_radius
  local cy = w.y - wa.math.cos(rot_w) * art.weap_radius
  local angle = (pi - pi * aim - pi * (1.0 - art.weap_rotation)) * facing
  local cos, sin = wa.math.cos(angle), wa.math.sin(angle)

  local half = art.size * 0.5
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
  QUAD.sprite = art.sheet
  wa.draw.quad(QUAD)
end

local function hook()
  hooked = true
  wa.on.draw(function()
    for i = 1, #draws do
      local art = draws[i]
      for _, w in ipairs(wa.worms.all()) do
        -- \`draw_holds\` skips dead, hidden and body-hidden worms
        -- (\`worm_hold.rs:309-315\`); \`visible\`/\`body_visible\` are the same two
        -- hide flags (\`crates/lua-host/src/actor.rs:1523-1541\`).
        local st = w.state_id
        if w.hp and w.hp > 0 and w.visible and w.body_visible
            and w.weapon == art.weapon and st and FIRING[st] then
          enqueue(art, w)
        end
      end
    end
  end)
end

-- \`art\` is the same table the weapon also passes as \`spec.hold\`: \`weapon\` (the
-- id WA's \`worm.weapon\` reports), \`sheet\`, \`size\` (the cell, 90 for PX's gun
-- cells), and the engine's \`weap_radius\`/\`weap_rotation\`/\`weap_radial_rotation\`.
-- The engine ignores the two presentation-only keys (\`weapon\`, \`size\`).
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
        content: `-- PX's sprite builder: draw a missile from a follower actor, and share PX's
-- worm aim/pick posture and hands. Each bundle carries its own copy; \`wa\` is
-- touched only inside \`sb.flight\`.

local M = {}

-- ---------------------------------------------------------------------------
-- PX animation types (red_sprite_builder.txt:17-24).
-- ---------------------------------------------------------------------------
local ANIM_TYPE = {
  track = 2,
  rotation = 3,
  slow = 1,
  medium = 1,
  fast = 1,
  none = 5,
}
local ANIM_SPEED = { slow = 0.5, medium = 0.8, fast = 1.35 }

-- The worm whose turn it is -- PX's GetCurrentWorm().
local function current_worm()
  for _, w in ipairs(wa.worms.all()) do
    if w.turn then return w end
  end
end

local function sign(n) return n > 0 and 1 or (n < 0 and -1 or 0) end

-- ---------------------------------------------------------------------------
-- Cyclical animation frame (PX SetCustomAnim, red_sprite_builder.txt:51-57,
-- :83-85): phase += anim_speed * 30 / 1000 per frame, wraps at 0.99.
-- Returns frame index in [0, num_frames) and the updated phase.
-- ---------------------------------------------------------------------------
function M.cyclical_frame(phase, anim_speed, num_frames)
  if not phase then phase = 0.0 end
  local spd = (anim_speed or 1.0) * 30 / 1000
  phase = phase + spd
  if phase > 0.99 then phase = 0.0 end
  local frame = math.floor(phase * num_frames) % num_frames
  return frame, phase
end

-- Angle a round should point along its flight (PX :73, track type).
function M.track_angle(vx, vy)
  return -wa.math.atan(vx, vy) - math.pi
end

-- Speed-based rotation turn (PX :77, rotation type).
function M.rotation_turn(prev_rot, vx, vy, spin)
  return (prev_rot or 0) + (spin or 1.0) * 0.5 * (vx * 0.15 + math.abs(vy) * 0.01 * sign(vx))
end

-- Steady spin turn (PX :75, slow/medium/fast types).
function M.spin_turn(prev_rot, vx, anim_speed)
  return (prev_rot or 0) + (anim_speed or 0.5) * 0.5 * sign(vx)
end

-- ---------------------------------------------------------------------------
-- Missile flight drawing.
-- ---------------------------------------------------------------------------
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
      b:despawn()
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
        gravity = false, collide = false,
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

-- ---------------------------------------------------------------------------
-- Shared worm posture and hands: one weapon PNG and two lines per weapon.
-- The engine draws the weapon-less worm (\`worm_sprites\`) and the hold; these
-- tables are PX's \`CWormAnimParams\` and hand art. See README.md.
-- ---------------------------------------------------------------------------
M.PX_POSTURE = {
  weaponlnk = "sprites/px_hold/aim", weaponlnku = "sprites/px_hold/aimu",
  weaponlnkd = "sprites/px_hold/aimd",
  wthrow = "sprites/px_hold/draw", wthrowu = "sprites/px_hold/drawu",
  wthrowd = "sprites/px_hold/drawd",
}

-- PX's three hands: 1 lower, 2 middle, 3 upper.
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
        content: `-- Ripper Star: PX's fifteen-shuriken burst, using the ninja star art.
-- Each shot reads the worm's live aim; impacts do 4 damage in a 20 px square,
-- or stick in the land. The hold is PX's Ripper gun. See README.md for the
-- source offsets and the standoff/hit departures.

local seq = require("lib/fire_seq")
local sb = require("lib/px_sprite_builder")
local trail = require("wf-lib/effects/trail")
local hold_art = require("lib/px_hold_art")

local M = {}

-- A component in no panel slot registers nothing.
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

-- PX's trunc (integer division on fixed point, toward zero).
local function trunc(n) return n < 0 and math.ceil(n) or math.floor(n) end

-- PX's 32 orientations by ratio bins.
local function orientation(vx, vy)
  if vx == 0 then return vy > 0 and 16 or 0 end
  if vy == 0 then return vx > 0 and 8 or 24 end
  if vx > 0 and vy < 0 then return math.min(trunc(3 * vx / -vy), 7) end
  if vx > 0 then return math.min(trunc(8 + 3 * vy / vx), 15) end
  if vy > 0 then return math.min(trunc(16 + 3 * -vx / vy), 23) end
  return math.min(trunc(24 + 3 * -vy / -vx), 31)
end

-- PX's strict square; the query is a circle, so apply the square here.
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
  local HIT_R = 20      -- strict square
  local SELF_R = 25     -- the turn's worm
  local SHOTS = 15
  local SHOT_DELAY = 4  -- WA's fire interval for this record
  local SPEED = 45
  local LOW_AIM = 0.165
  local BURIED = { soften = 3, blend = "mix" } -- as the ninja star's

  -- Register callbacks from install: \`wa\` does not exist at require time.
  trail.install()

  -- The ninja star's grey ribbon, reused so the burst reads as the same star.
  local TRAIL = { max = 7, every = 1, core_w = 4.0, glow_w = 7.0, r = 120, g = 120, b = 120 }

  local function current_worm()
    for _, w in ipairs(wa.worms.all()) do
      if w.turn then return w end
    end
  end

  -- WA destroys the missile on impact, so keep the last velocity for the hit
  -- and the stick orientation.
  local speed = {}
  wa.on.missile_frame(function(m)
    if m.weapon ~= "px.ripper_star" then return end
    speed[m.id] = { m.vx, m.vy }
    if m.phase == "pre" and not trail.has(m.id) then
      trail.add(m.id, current_worm(), TRAIL)
    end
  end)

  -- Hide WA's missile and draw the 32-orientation star.
  sb.flight(ctx, {
    weapon = "px.ripper_star",
    sheet = ART .. "stamp",
    anim = "none",
    frame_fn = function(m) return orientation(m.vx, m.vy) end,
    z = wa.depth.OBJECTS - 1,
    mirror = false,
  })

  -- PX's Ripper gun, arms baked into the 90x90 cell. The engine draws the
  -- aiming frames; \`px_hold_art\` covers the two firing frames it drops.
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

    -- Read the aim on every shot: PX rebuilds it each FireFinal, and the
    -- up/down keys move it through the burst.
    on_fire = function(ev)
      local w = ev.worm
      -- Keep WA's muzzle distance, but re-apply it with the current facing:
      -- PX does that on every shot, and a script can turn the worm mid-burst.
      local ox = math.abs(ev.x - w.x)
      local oy = ev.y - w.y
      local function angle(i, ww)
        local n = i - 1 -- PX's shot counter is 0-based
        local base = ww.aim
        if n & 2 ~= 0 then return base - 0.010 end
        if n & 3 ~= 0 then return base + 0.010 end
        return base
      end
      seq.fire_seq_mis({
        weapon = "px.ripper_star",
        cancel_weapon = "px.ripper_star",
        -- The muzzle is inside the worm's collision circle; start clear of it.
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

    -- PX's impact, after the record's own (zero) blast.
    on_explode = function(ev)
      local v = speed[ev.missile]
      if ev.missile then speed[ev.missile] = nil; trail.drop(ev.missile) end
      local vx, vy = v and v[1] or 0, v and v[2] or 0

      -- The first eligible object in the square, in the engine's order.
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
          -- PX's damage and quarter-speed shove; WA commits the health on land.
          target:hurt{ amount = DAMAGE, vx = trunc(vx / 4), vy = trunc(vy / 4) }
        else
          -- Crates and oil drums take half the star's speed as force.
          target:hit(DAMAGE, trunc(vx / 2), trunc(vy / 2), "projectile")
        end
        return
      end

      -- No target: stick the star in the land and play PX's impact sound.
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
        content: `-- Project X's effect-manager trail: a short ribbon sampled in game frames and
-- drawn with \`wa.draw.ribbon\`. Consume with \`require("wf-lib/effects/trail")\`
-- and list \`trail.BEAM\`/\`trail.GLOW\` in the component's sprites.
-- See README.md for the sampling and width rules.

local trail = {}

-- PX bullet defaults; \`add\` copies them or takes the same names in \`opts\`.
trail.MAX, trail.EVERY, trail.VANISH = 12, 2, 2
trail.CORE_W, trail.GLOW_W = 8.0, 13.0
trail.R, trail.G, trail.B = 255, 255, 255
-- nil -> \`wa.depth.OBJECTS\`, resolved inside a game frame.
trail.DEPTH = nil
trail.BEAM = "wf-lib/effects/sprites/px_effects/beam.png"
trail.GLOW = "wf-lib/effects/sprites/px_effects/beam_glow.png"

local trails = {}
local live = {} -- round id -> trail while it is in the air
local driver, tick = nil, 0
-- Frames a live trail may go unsampled; 3 tolerates one skipped actor frame.
local STALE = 3

local function start_driver(t, owner)
  if driver then return end
  -- Hidden timer; \`persist\` keeps it alive through a blast so the shed never
  -- freezes. It exits when \`trails\` empties.
  driver = wa.actors.spawn({
    sprite = t.beam, visible = false, gravity = false, collide = false,
    persist = true, owner = owner,
    on = function(a)
      tick = tick + 1
      for i = #trails, 1, -1 do
        local v = trails[i]
        if v.live and tick - v.seen >= STALE then
          -- Its round stopped firing frames: hit, exploded or gone from the map.
          v.live = false
          live[v.id] = nil
        end
        if not v.live and tick % v.vanish == 0 then
          table.remove(v.pts, 1)
          if #v.pts == 0 then
            -- Remove the hole; the loop runs backwards so the shift is safe.
            table.remove(trails, i)
            live[v.id] = nil
          end
        end
      end
      if #trails == 0 then driver = nil; a:despawn() end
    end,
  })
end

-- Trail the round \`id\`; \`opts\` overrides any field above for this trail.
function trail.add(id, owner, opts)
  local t = {
    id = id, pts = {}, live = true, seen = tick,
    max = trail.MAX, every = trail.EVERY, vanish = trail.VANISH,
    core_w = trail.CORE_W, glow_w = trail.GLOW_W,
    r = trail.R, g = trail.G, b = trail.B,
    depth = trail.DEPTH, beam = trail.BEAM, glow = trail.GLOW,
  }
  -- Fixed key order; \`pairs\` would be unordered.
  for _, k in ipairs({
    "max", "every", "vanish", "core_w", "glow_w", "r", "g", "b", "depth", "beam", "glow",
  }) do
    if opts and opts[k] ~= nil then t[k] = opts[k] end
  end
  -- Resolve the depth default in a game frame, where \`wa\` exists.
  if t.depth == nil then t.depth = wa.depth.OBJECTS end
  trails[#trails + 1] = t
  live[id] = t
  start_driver(t, owner)
  return t
end

-- Is this round trailed? For attaching to rounds you did not launch yourself.
function trail.has(id)
  return live[id] ~= nil
end

-- The round is gone; start its fade now instead of waiting for STALE.
function trail.drop(id)
  local t = live[id]
  if t then
    t.live = false
    live[id] = nil
  end
end

-- PX's FillTrail for one round's frame; both missiles and actors call this.
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

-- Register callbacks from install(ctx); \`wa\` does not exist at require time.
function trail.install()
  if installed then return end
  installed = true

  -- Fill on the missile's frame; refresh \`seen\` on both phases so a live round
  -- is never mistaken for gone.
  wa.on.missile_frame(function(m)
    if m.phase ~= "post" then
      local t = live[m.id]
      if t then t.seen = tick end
      return
    end
    trail.sample(m.id, m.x, m.y, m.vx, m.vy)
  end)

  -- PX's DrawTrail. Reuse one ribbon spec: a table per draw made garbage.
  if wa.on.draw and wa.draw.ribbon then
    local RIBBON = { blend = "add", points = {} }
    local function pass(t, sprite, width)
      local pts, n = t.pts, #t.pts
      if n < 2 then return end -- \`if (trailAmount < 2) return;\` (:1300)
      RIBBON.sprite, RIBBON.depth = sprite, t.depth
      local rp = RIBBON.points
      for i = 1, n do
        -- PX's t: strength, texcoord and width in one number.
        local f = i / (n + 1)
        if f < 0.1 then f = 0.1 end
        local p = rp[i]
        if not p then p = {}; rp[i] = p end
        p.x, p.y, p.u, p.width = pts[i][1], pts[i][2], f, f * width
        p.color = (255 << 24) | (math.floor(t.r * f) << 16)
          | (math.floor(t.g * f) << 8) | math.floor(t.b * f)
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
    version: '0.18.0',
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
    version: '0.6.0',
    author: 'WormForge',
    category: 'utility',
    primaryFile: 'features/agility.lua',
    workspacePrefix: 'utilities',
    description: 'Modern component version: the agility switch in Core Utilities. Arrow keys nudge worm.vx / worm.vy while airborne; features/utilities.lua loads features/agility.lua when the profile turns it on.',
    tags: ['example', 'worm', 'movement', 'modern'],
    files: UTILITY_FILES,
  },
];
