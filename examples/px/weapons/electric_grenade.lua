-- Electric Grenade: a grenade whose blast is followed by a chaining electric arc.

local weapon = {}

weapon.record = {
  handling = {
    remember_selection = true,
    ends_turn = true,
  },
}

weapon.missile_sprite = {
    sheet = "sprites/px_hold/electric_grenade.png", frames = 1,
    spin = true, -- its record's WAT_Rotation
    hide = true,
  }

function weapon.definition()
  local shared = require("lib/shared")
  local sdk = require("wf-lib/holds")
  local PX_POSTURE, PX_HANDS = sdk.PX_POSTURE, sdk.PX_HANDS
  return require("lib/weapon").merge(weapon.record, {
    wep = "weps/earthquake.wep",
    panel_icon = "sprites/electric_grenade/icon.png",
    hold_as = "stock.grenade",
    missile = { sprite = 0 }, -- WA draws no round; the art spec draws it
    worm_sprites = PX_POSTURE,
    sprites = { "sprites/px_hold/electric_grenade.png" },
    sounds = { "sounds/lightning/tazer_loop.wav" },
    params = { gpu_prefix = "sprites/px_hold/" },
    on_explode = function(ev) require("lib/electrical").context().grenade_arc(ev) end,
    hold = { -- Electric Grenade (electric_grenade_anim)
        thrown = true,
        sheet = "sprites/px_hold/electric_grenade.png", hand_type = 1,
        hand_radius = 15, hand_scale = 0.8,
        weap_rotation = 0.5, weap_radius = 9,
        hand = PX_HANDS[1],
    },
  })
end

weapon.requires = { "lib/electrical" }

function weapon.setup()
  local c = require("lib/electrical").context()
  local tazed = c.tazed

  wa.on.worm_message(function(worm, msg)
    if worm.weapon == "px.electric_grenade" and not tazed["worm:" .. worm.id] then
      c.thrower = worm
    end
  end, { msgs = { wa.msg.FIRE_WEAPON } })
end

return weapon
