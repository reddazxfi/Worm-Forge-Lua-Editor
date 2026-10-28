-- Flame Turret: PyroMan's (Project X's p_turrets library: customturret.txt,
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
