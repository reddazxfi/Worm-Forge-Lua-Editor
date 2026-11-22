-- Tele Arrow: fires a bouncing projectile; Space detonates it and teleports the worm there.

local holds = require("wf-lib/holds")
local weapon = {}

local function teleport(event)
  local landing = require("lib/tele_landing")
  local worm = landing.turn_worm()
  if worm then landing.warp(worm, event.x, event.y) end
end

weapon.defaults = { ends_invisibility = false }

weapon.definition = {
  copy_from = "stock.bazooka",
  name = "Tele Arrow",
  panel_icon = "sprites/tele_arrow/ico_telea.png",
  sprite = "bazooka",
  on_explode = teleport,
  handling = { remember_selection = false },
  missile = {
    explode_on_space = true,
    flight_sound = 67,
    fuse = 10000,
    gravity_pct = 120,
    impact_particles = false,
    speed_pct = 99,
    wind_pct = 0,
    bounce = {
      bounciness = 75, max_bounces = 100, sound = 113,
      terrain_keep_speed_pct = 99,
      hits = {crates=true,donor_cards=true,land=true,objects=true,water=true,
        worms_frozen=true,worms_normal=true},
    },
    ends_on_contact = {},
    explosion = {power=0,push_pct=0,bias=9},
    trail = {power=20,speed=150,sprite="sprites/tele_arrow/trail.png"},
  },
  worm_sprites = holds.PX_POSTURE,
  sprites = {"sprites/tele_arrow/telea.png"},
  params = {gpu_prefix="sprites/tele_arrow/"},
  hold = {
    sheet="sprites/tele_arrow/spb_telea.png",frames=8,anim_speed=1.2,
    hand_radius=0,hand_rotation=0,hand_radial_rotation=0,
    weap_radial_rotation=0,weap_rotation=1,weap_radius=3.5,
  },
}
weapon.missile_sprite = {
  sheet="sprites/tele_arrow/telea.png",frames=8,
  animate=true,anim_speed=3,hide=true,
}
return weapon
