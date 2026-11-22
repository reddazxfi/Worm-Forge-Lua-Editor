-- Bowling Ball: the worm sets a bowling ball down in front of it, to roll and crush what it hits.

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
