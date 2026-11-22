-- Ice Arrow: an arrow that freezes the worm it hits.

local weapon = {}

weapon.record = {
  handling = {
    remember_selection = true,
    ends_turn = true,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    wep = "weps/armageddon.wep",
    panel_icon = "sprites/ice_arrow/icon.png",
    worm_sprites = {
      wbowlnk = "sprites/ice_arrow/wbowlnk.png",
      wbowlnku = "sprites/ice_arrow/wbowlnku.png",
      wbowlnkd = "sprites/ice_arrow/wbowlnkd.png",
      wbowbk2 = "sprites/ice_arrow/wbowbk2.png",
      wbowbk2u = "sprites/ice_arrow/wbowbk2u.png",
      wbowbk2d = "sprites/ice_arrow/wbowbk2d.png",
      wbow = "sprites/ice_arrow/wbow.png",
      wbowu = "sprites/ice_arrow/wbowu.png",
      wbowd = "sprites/ice_arrow/wbowd.png",
      wbowp = "sprites/ice_arrow/wbowp.png",
      wbowpu = "sprites/ice_arrow/wbowpu.png",
      wbowpd = "sprites/ice_arrow/wbowpd.png",
      wbowf = "sprites/ice_arrow/wbowf.png",
      wbowfu = "sprites/ice_arrow/wbowfu.png",
      wbowfd = "sprites/ice_arrow/wbowfd.png",
    },
  })
end

function weapon.setup()
  local shared = require("lib/shared")
  local pending = {} -- stable worm id -> freeze on that worm's next frame

  wa.on.hurt(function(hit)
    if hit.phase == "post" and hit.source_weapon == "px.ice_arrow"
      and hit.kind == "arrow" then
      pending[hit.worm.id] = true
    end
  end)

  wa.on.worm_message(function(worm)
    if pending[worm.id] then
      pending[worm.id] = nil
      worm:freeze()
    end
  end, { msgs = { wa.msg.FRAME_FINISH } })
end

return weapon
