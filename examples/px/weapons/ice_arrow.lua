-- Ice Arrow: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
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
    -- WA's Longbow sheets, bow and cap in ice blue
    -- (tools/bake_ice_arrow_sprites.py); WA still animates them.
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
  -- Ice Arrow: let WA's ArrowEntity apply the bow hit and its momentum, then
  -- freeze the worm on its next frame. PX's CWorm::Message defers SetState in
  -- exactly this way, so the hit's native state setup runs first.
  local shared = require("lib/shared")
  local pending = {} -- stable worm id -> freeze on that worm's next frame

  wa.on.hurt(function(hit)
    if hit.phase == "post" and hit.source_weapon == "px.ice_arrow"
      and hit.kind == "hit" then
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
