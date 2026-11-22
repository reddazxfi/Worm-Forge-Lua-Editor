-- Weapon Crate: places a weapon crate in front of the worm; one per team per round.

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
