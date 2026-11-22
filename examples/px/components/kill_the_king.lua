-- Kill the King: the attackers must destroy the defenders' king before the timer runs out.

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
