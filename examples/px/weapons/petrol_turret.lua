-- Petrol Turret: PyroMan's (Project X's p_turrets library: customturret.txt,
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
