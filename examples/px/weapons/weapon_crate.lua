-- Weapon Crate: record, art and behaviour.
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
  -- "Weapon Crate", by Steps and rafa``2, animations by 0rang3), on the Freeze
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
