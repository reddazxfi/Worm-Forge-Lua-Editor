-- Ninja Bomb: a grenade that bursts into 21 arrows flying out in four rings, with no blast.

local holds = require("wf-lib/holds")
local weapon = {}

local ART = "sprites/ninja_bomb/"
local DAMAGE = 15 -- each arrow's

-- PX's arrows from the burst 5 pixels above where the bomb goes off: offset
-- x, y and speed vx, vy in pixels/frame. The two flying sideways have no gravity.
local ARROWS = {
  -- 25 pixels out
  { 0, -25, 2, -8 }, { -16, -16, -2, -8 }, { 16, -16, 8, -8 },
  { 25, 0, 16, 0, weightless = true }, { 16, 16, 8, 8 }, { 0, 25, 0, 8 },
  { -16, 16, -8, 8 }, { -25, 0, -16, 0, weightless = true }, { -16, -16, -8, -8 },
  -- 50 pixels out, flat
  { 33, -33, 16, -10 }, { 33, 33, 16, 10 }, { -33, 33, -16, 10 }, { -33, -33, -16, -10 },
  -- 75 pixels out, steep
  { 50, -50, 10, -16 }, { 50, 50, 10, 16 }, { -50, 50, -10, 16 }, { -50, -50, -10, -16 },
  -- 75 pixels out, flatter still
  { 50, -50, 16, -4 }, { 50, 50, 16, 4 }, { -50, 50, -16, 4 }, { -50, -50, -16, -4 },
}

local bursts = {}
local shooter

local function on_explode(ev)
  if ev.missile then bursts[#bursts + 1] = { x = ev.x, y = ev.y - 5 } end
end

weapon.definition = {
  copy_from = "stock.grenade",
  name = "Ninja Bomb",
  panel_icon = ART .. "ninja_bomb_ico.png",
  hold_as = "stock.grenade",
  on_explode = on_explode,
  missile = {
    sprite = 0, -- WA draws no round; the art spec draws it
    explosion = { power = 0 },
  },
  worm_sprites = holds.PX_POSTURE,
  sprites = { ART .. "bullet.png" },
  hold = {
    thrown = true,
    sheet = ART .. "bullet.png", hand_type = 1, hand_radius = 17, hand_scale = 0.8,
    weap_rotation = 0.5, weap_radius = 9,
    hand = holds.PX_HANDS[1],
  },
}

weapon.missile_sprite = {
  sheet = ART .. "bullet.png", frames = 1,
  spin = true, -- its record's WAT_Rotation
  hide = true,
}

function weapon.setup()
  bursts, shooter = {}, nil

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FIRE_WEAPON and worm.weapon == "px.ninja_bomb" then
      shooter = worm
      return
    end
    if msg ~= wa.msg.FRAME_FINISH or #bursts == 0 then return end
    local owner = shooter or worm
    for _, p in ipairs(bursts) do
      for _, a in ipairs(ARROWS) do
        wa.arrows.spawn({
          owner = owner, x = p.x + a[1], y = p.y + a[2], vx = a[3], vy = a[4],
          damage = DAMAGE, gravity_pct = a.weightless and 0 or 100,
        })
      end
    end
    bursts = {}
  end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })
end

return weapon
