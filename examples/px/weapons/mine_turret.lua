-- Mine Turret: PyroMan's (Project X's p_turrets library: mineturret.txt). A
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
