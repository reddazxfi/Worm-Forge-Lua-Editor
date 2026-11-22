-- Flame Turret: a turret that lobs fire at moving enemies, over the land in their way.

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
