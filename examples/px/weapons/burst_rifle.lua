-- Burst Rifle: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  gun = {
    bullets = 10,
    burst_size = 2,
    burst_spread_deg = 6,
    damage = 7,
    explosion = {
      bias = 15,
    },
    shot_interval_ms = 63,
    spread_deg = 6,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.minigun",
    name = "Burst Rifle",
    panel_icon = "sprites/burst_rifle/ico_burstr.png",
    worm_sprites = {
          weaponlnk = "sprites/burst_rifle/aim.png",
          weaponlnku = "sprites/burst_rifle/aimu.png",
          weaponlnkd = "sprites/burst_rifle/aimd.png",
          wthrow = "sprites/burst_rifle/draw.png",
          wthrowu = "sprites/burst_rifle/drawu.png",
          wthrowd = "sprites/burst_rifle/drawd.png",
          weaponfire = "sprites/burst_rifle/fire.png",
          weaponfireu = "sprites/burst_rifle/fireu.png",
          weaponfired = "sprites/burst_rifle/fired.png",
        },
  })
end

return weapon
