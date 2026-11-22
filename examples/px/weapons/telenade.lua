-- TeleNade: a grenade that teleports the worm to where it goes off, with no blast.

local holds = require("wf-lib/holds")
local weapon = {}

local ART = "sprites/telenade/"
local SOUND_TELEPORT = 67

local function teleport(event)
  local landing = require("lib/tele_landing")
  local worm = landing.turn_worm()
  if not worm then return end
  wa.sound.play(worm, SOUND_TELEPORT)
  landing.warp(worm, event.x, event.y)
end

weapon.defaults = { ends_invisibility = false }

weapon.definition = {
  copy_from = "stock.grenade",
  name = "TeleNade",
  panel_icon = ART .. "ico_telenade.png",
  hold_as = "stock.grenade",
  on_explode = teleport,
  missile = {
    sprite = 0, -- WA draws no round; the art spec draws it
    explosion = { power = 0, push_pct = 0 },
  },
  worm_sprites = holds.PX_POSTURE,
  sprites = { ART .. "bullet.png" },
  hold = {
    thrown = true,
    sheet = ART .. "bullet.png", hand_type = 1, hand_radius = 20, hand_scale = 0.8,
    hand_rotation = 1, hand_radial_rotation = 1.05,
    weap_radial_rotation = 0.9, weap_rotation = 0.5, weap_radius = 10,
    hand = holds.PX_HANDS[1],
  },
}

weapon.missile_sprite = {
  sheet = ART .. "bullet.png", frames = 1,
  spin = true, -- its record's WAT_Rotation
  hide = true,
}

return weapon
