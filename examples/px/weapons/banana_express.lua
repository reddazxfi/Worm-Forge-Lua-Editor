-- Banana Express: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  handling = {
    remember_selection = false,
    retreat = 3000,
  },
  missile = {
    animation = 1,
    bounce = {
      bounciness = 60,
      hits = {
        arrows = true,
        canisters = true,
        crates = true,
        donor_cards = true,
        land = true,
        mines = true,
        objects = true,
        water = true,
        worms = true,
        worms_frozen = true,
      },
      sound = 111,
      terrain_keep_speed_pct = 100,
    },
    burst = "clusters",
    countdown = 3000,
    ends_on_contact = {},
    explode_on_space = true,
    explosion = {
      power = 70,
      push_pct = 80,
    },
    fuse = 10000,
    random_motion = 0,
    speed_pct = 100,
    sprite = 51,
    trail = {
      bubbles_per_second = 12.5,
      power = 0,
      speed = 100,
      sprite = 131,
    },
    wind_pct = 0,
  },
  clusters = {
    bit = {
      action = "bounce",
      animation = 1,
      bounce = {
        bounciness = 60,
        contact_sides = 8,
        hits = {
          arrows = true,
          canisters = true,
          crates = true,
          donor_cards = true,
          land = true,
          mines = true,
          objects = true,
          worms = true,
          worms_frozen = true,
        },
        sound = 111,
        terrain_keep_speed_pct = 100,
      },
      ends_on_contact = {
        crates = true,
        donor_cards = true,
        land = true,
        objects = true,
        water = true,
        worms = true,
        worms_frozen = true,
      },
      explosion = {
        power = 60,
        push_pct = 80,
      },
      fuse = 9000,
      gravity_pct = 100,
      speed_pct = 100,
      sprite = 51,
      sprite_count = 1,
      trail = {
        bubbles_per_second = 12.5,
        speed = 100,
        sprite = 131,
      },
    },
    count = 5,
    launch_power_pct = 45,
    power_variation_pct = 30,
    spread = 25,
  },
  strike = {
    munition_speed = 1.5,
    plane_sound = 52,
    spacing = 30,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.mb_bomb",
    name = "Banana Express",
    panel_icon = "sprites/banana_express/banana_express_ico.png",
    plane = "sprites/banana_express/plane.png",
  })
end

return weapon
