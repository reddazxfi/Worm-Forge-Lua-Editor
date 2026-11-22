-- Hellish Hand-Grenade: a holy hand grenade that bursts into spreading fire.

local weapon = {}

weapon.record = {
  missile = {
    bounce = {
      sound = 161,
    },
    burst = "fire",
    explosion = {
      power = 80,
      push_pct = 70,
    },
    explosion_sound = {
      sound = 154,
    },
    fire = {
      burn_time_ms = 1000,
      decay_mode = "at_turn_start",
      spread_delay_ms = 70,
      spread_generations = 75,
    },
    trail = {
      power = 20,
      sprite = 8,
    },
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.holy_grenade",
    name = "Hellish Hand-Grenade",
    panel_icon = "sprites/hellish/hhh_ico.png",
    sprite = "sprites/hellish/grenade.png",
    worm_sprites = {
          weaponlnk = "sprites/hellish/aim.png",
          weaponlnku = "sprites/hellish/aimu.png",
          weaponlnkd = "sprites/hellish/aimd.png",
          wthrow = "sprites/hellish/draw.png",
          wthrowu = "sprites/hellish/drawu.png",
          wthrowd = "sprites/hellish/drawd.png",
        },
  })
end

return weapon
