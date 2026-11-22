-- Gatling Gun: a rapid-fire gun.

return {
  definition = {
    copy_from = "stock.minigun",
    name = "Gatling Gun",
    panel_icon = "sprites/gatling_gun/ico_gatlingg.png",
    fires = { subtype = 1 },
    handling = { remember_selection = false },
    gun = {
      bullets = 45,
      burst_size = 2,
      burst_spread_deg = 2,
      damage = 3,
      shot_interval_ms = 55,
      spread_deg = 19,
      explosion = { push_pct = 300, variation = 1 },
    },
    worm_sprites = {
      weaponlnk = "sprites/gatling_gun/agatlingp.png",
      weaponlnku = "sprites/gatling_gun/agatlingu.png",
      weaponlnkd = "sprites/gatling_gun/agatlingd.png",
      wthrow = "sprites/gatling_gun/pgatlingp.png",
      wthrowu = "sprites/gatling_gun/pgatlingu.png",
      wthrowd = "sprites/gatling_gun/pgatlingd.png",
      weaponfire = "sprites/gatling_gun/fgatlingp.png",
      weaponfireu = "sprites/gatling_gun/fgatlingu.png",
      weaponfired = "sprites/gatling_gun/fgatlingd.png",
    },
  },
}
