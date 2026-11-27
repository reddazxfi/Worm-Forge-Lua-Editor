-- Security Grenade: Project X's grenade that bursts in a ring, on WormBench.

local function placed(ctx)
  local informed = false
  if type(ctx.weapons) == "table" then
    informed = true
    if ctx.weapons[ctx.id] ~= nil then return true end
  end
  if type(ctx.placed) == "table" then
    informed = true
    for _, weapon in ipairs(ctx.placed) do
      if weapon == ctx.id or (type(weapon) == "table" and weapon.id == ctx.id) then return true end
    end
  end
  return not informed
end

local M = {}

function M.install(ctx)
  if not placed(ctx) then
    wa.log("Security Grenade: in no panel slot; nothing registered")
    return
  end

  local ART = "sprites/security_grenade/"

  local PUSH, DAMAGE = 50, 25 -- DoExplosion's push and damage
  local RADIUS = 60
  local RING = { { 0, -RADIUS }, { RADIUS * 2 / 3, -RADIUS * 2 / 3 }, { RADIUS, 0 },
                 { RADIUS * 2 / 3, RADIUS * 2 / 3 }, { 0, RADIUS },
                 { -RADIUS * 2 / 3, RADIUS * 2 / 3 }, { -RADIUS, 0 },
                 { -RADIUS * 2 / 3, -RADIUS * 2 / 3 } }

  local shooter
  local pending = {}

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FIRE_WEAPON and worm.weapon == "px.security_grenade" then
      shooter = worm
    elseif msg == wa.msg.FRAME_FINISH and #pending > 0 then
      for _, p in ipairs(pending) do
        for _, off in ipairs(RING) do
          local a = wa.actors.spawn({ sprite = false, x = p.x + off[1], y = p.y + off[2],
            owner = shooter, on = function() end })
          a:explode({ id = PUSH, damage = DAMAGE, below = false })
          a:remove()
        end
      end
      pending = {}
    end
  end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })

  local sb = require("lib/px_sprite_builder")
  sb.flight(ctx, {
    weapon = "px.security_grenade",
    sheet = ART .. "bullet.png",
    anim = "rotation",
    spin = 1.0, -- PX's customSpeed for the speed-following type
    z = wa.depth.OBJECTS - 1,
    mirror = true,
    owner = shooter,
  })

  local hold = {
    sheet = ART .. "bullet.png",
    hand = sb.PX_HANDS[1], -- hand_type 1: the lower hand
    hand_radius = 17.0,
    hand_rotation = 1.0,
    hand_radial_rotation = 1.0,
    hand_scale = 0.8,
    weap_rotation = 0.5,
    weap_radius = 9.0,
    weap_radial_rotation = 1.0,
    frames = 1,
    thrown = true,
    keep_while_firing = false,
  }

  local spec = {
    wep = "weps/security_grenade_wep.wep",
    panel_icon = ART .. "icon.png", -- PX's security_nade_ico.png
    hold_as = "stock.grenade",
    missile = { sprite = 0 }, -- WA draws no round; the art spec draws it
    worm_sprites = sb.PX_POSTURE,
    hold = hold,
    sprites = { ART .. "bullet.png" },
    params = { gpu_prefix = ART },
    on_explode = function(ev)
      pending[#pending + 1] = { x = ev.x, y = ev.y }
    end,
  }
  wa.weapons.replace(spec)
end

return M
