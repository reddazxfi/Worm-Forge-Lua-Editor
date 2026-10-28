-- Jump: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  fires = {
    creates_projectile = true,
    method = 3,
    subtype = 2,
    type = 1,
  },
  handling = {
    retreat = 3000,
  },
  missile = {
    action = "bounce",
    alarm_worms = true,
    animation = 1,
    bounce = {
      contact_sides = 8,
      hits = {
        crates = true,
        donor_cards = true,
        land = true,
        objects = true,
        water = true,
        worms_acting = true,
        worms_frozen = true,
        worms_jumping = true,
        worms_normal = true,
      },
      sound = 113,
      terrain_keep_speed_pct = 100,
    },
    collision_shape = 2,
    countdown = 5000,
    explosion = {
      bias = 10,
      power = 50,
      push_pct = 100,
    },
    gravity_pct = 100,
    speed_pct = 100,
    sprite = 50,
    trail = {
      bubbles_per_second = 12.5,
      speed = 100,
      sprite = 131,
    },
  },
}

function weapon.definition()
  local shared = require("lib/shared")
  local fires = shared.fires
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.ninja_rope",
    name = "Jump",
    panel_icon = "sprites/jump/jumpic.png",
    worm_sprites = {
          weaponlnk = "sprites/jump/aim.png", weaponlnku = "sprites/jump/aimu.png",
          weaponlnkd = "sprites/jump/aimd.png",
        },
    on_fire = function(fire) fires.jump(fire) end,
  })
end

function weapon.setup()
  local shared = require("lib/shared")
  local fires = shared.fires

  -- ------------------------------------------------------------------ Jump
  do
  --
  -- PX's jumpscript (utility_jump). Its record throws like a grenade, but
  -- nothing leaves the worm: FireFinal gives the worm the shot's own speed --
  -- the aim and the charge -- and plays the team's "Jump" line. The worm keeps
  -- its aim posture, eyes on the crosshair, until it jumps.
  --
  -- Differences: PX shows WA's wjump while the charge builds
  -- (SetAnimEx(269, FirePower)), which looks ahead rather than along the aim;
  -- it also mutes the worm's "Fire!" and "Watch this" lines while the Jump is
  -- selected, and stops a fuse and bounce being chosen for it.

  -- The first team's "Jump1" speech: WA loads each team's 54 lines in turn
  -- after its own sounds, so a worm's is 54 on per team (PX's PlaySoundBank(150)).
  local JUMP_SPEECH, SPEECH_LINES = 150, 54

  fires.jump = function(fire)
    local worm = fire.worm
    worm:release(fire.vx, fire.vy)
    wa.sound.play(worm, JUMP_SPEECH + SPEECH_LINES * (worm.team - 1))
  end
  end
end

return weapon
