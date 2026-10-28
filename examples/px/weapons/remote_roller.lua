-- Remote Roller: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  fires = {
    launch_power_pct = 15,
  },
  missile = {
    alarm_worms = true,
    burst = "nothing",
    countdown = 0,
    explosion = {
      bias = 10,
      power = 43,
      push_pct = 110,
    },
    flight_sound = 88,
    fuse = 15000,
    gravity_pct = 90,
    impact_particles = true,
    roam = {
      edge_jump = {
        angle_deg = 25,
        sound = 88,
        speed = 3.0,
      },
      flight_hits = {},
      hits = {
        arrows = true,
        crates = true,
        donor_cards = true,
        land = true,
        mines = true,
        objects = true,
        water = true,
        worms_acting = true,
        worms_frozen = true,
        worms_jumping = true,
        worms_normal = true,
      },
      jump = {
        angle_deg = 0,
        sound = 88,
        speed = 0.0,
      },
      step_height = 20,
      terrain_offset = -5,
      walk_speed = 2.2,
    },
    speed_pct = 101,
    trail = {
      power = 10,
      speed = 30,
      sprite = 80,
    },
  },
  clusters = {
    bit = {
      action = "none",
      animation = 0,
      countdown = 0,
      explode_on_space = false,
      explosion = {
        power = 0,
        push_pct = 0,
      },
      flight_sound = 0,
      fuse = 0,
      gravity_pct = 0,
      speed_pct = 0,
      sprite = 0,
      sprite_count = 0,
      trail = {
        bubbles_per_second = 0.0,
        speed = 0,
        sprite = 0,
      },
    },
    count = 0,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.skunk",
    name = "Remote Roller",
    panel_icon = "sprites/remote_roller/rroller_ico.png",
    sprite = "sprites/remote_roller/flight.png",
    worm_sprites = {
          weaponlnk = "sprites/remote_roller/aim.png",
          weaponlnku = "sprites/remote_roller/aimu.png",
          weaponlnkd = "sprites/remote_roller/aimd.png",
          wthrow = "sprites/remote_roller/draw.png",
          wthrowu = "sprites/remote_roller/drawu.png",
          wthrowd = "sprites/remote_roller/drawd.png",
        },
  })
end

return weapon
