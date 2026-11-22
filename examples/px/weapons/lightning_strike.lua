-- Lightning Strike: a beam from the sky that heals worms, revives graves and arms mines.

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
