-- Auto Ballista: PyroMan's (Project X's p_turrets library: arrowturret.txt).
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
