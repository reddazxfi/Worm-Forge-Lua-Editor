-- Security Grenade -- Project X's grenade that bursts in a ring, on WormForge
-- API 4.
--
-- PX's source is `PX_pending/weapon_grenade_security/scripts/security_grenade_script.txt`
-- (151 lines) and its record `weapons/security_grenade_WEAP.wep` (byte `+0x0C` = 2,
-- a grenade record). It is a stock grenade otherwise: the throw, the arc and the
-- stock blast are WA's, and the whole of PX's weapon is what happens **after**
-- the blast. The worm's aim art is the shared weapon-less library
-- (`lib/px_sprite_builder.lua`, `PX_POSTURE`) with one held-grenade PNG over it,
-- the way PX's sprite builder drew it (`security_grenade_spb.txt`).
--
-- `CMissile::ExplodeAt` (`:52-115`) does, after `super` -- WA's own grenade blast,
-- which has already happened by the time `on_explode` runs -- eight more
-- explosions, each `DoExplosion(x, y, push = 50, damage = 25, 0, ClWT)` (`:60-67`),
-- on a ring of radius 60 around the impact: four on the axes at 60, four on the
-- diagonals at `radius * 2/3 = 40`. `ClWT` is the thrower's team, saved at
-- `FireFinal` (`:136-142`), so the ring belongs to the worm that threw it.
--
-- Not ported, and why:
--   * the flight trail (`do_sprite_trail_effects(54, ...)`, `:128-131`, every frame
--     while it flies) -- there is no particle API (REPORT.md 6 #1);
--   * the **Ninja Bomb**, the other weapon in PX's package (`:69-114`): on
--     detonation it fires **21 arrows** over four rings (`:81-113`, damage 15). The
--     only way to make one here is a record that flies WA's own arrow
--     (`Root->GetObject(25, 0)`) and `wa.weapons.launch`es it twenty-one times,
--     which needs a placed weapon on the scheme (REPORT.md 11.8) -- its own port,
--     and a good one next.
--
-- A component's file, and anything it requires, runs where `wa` does not exist
-- yet: this module is pure data at load and touches `wa` only in `install`.

-- Whether the profile placed this component on a panel slot (REPORT.md 11.13,
-- verified in match): a slot-less registration takes the match down at turn start.
-- `ctx.placed` is the placed weapons in slot order, each `{ id, position }`
-- (`tools/audit/audit.lua:39-41`); `ctx.weapons` is the same ids as keys
-- (`highlander components/loader.lua:91`).
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

  -- PX's numbers.
  local PUSH, DAMAGE = 50, 25 -- DoExplosion's push and damage (:58)
  -- The ring (:60-67): four on the axes at `radius`, four on the diagonals at
  -- `radius * 2/3`, going round clockwise from the top.
  local RADIUS = 60
  local RING = { { 0, -RADIUS }, { RADIUS * 2 / 3, -RADIUS * 2 / 3 }, { RADIUS, 0 },
                 { RADIUS * 2 / 3, RADIUS * 2 / 3 }, { 0, RADIUS },
                 { -RADIUS * 2 / 3, RADIUS * 2 / 3 }, { -RADIUS, 0 },
                 { -RADIUS * 2 / 3, -RADIUS * 2 / 3 } }

  -- PX's ClWT / CLWN (`:140-142`), so the ring is the thrower's.
  local shooter
  -- Where the stock blast landed, until the frame is over: PX's ring goes after
  -- `super`, so it must go after WA's blast, not inside it.
  local pending = {}

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FIRE_WEAPON and worm.weapon == "px.security_grenade" then
      shooter = worm
    elseif msg == wa.msg.FRAME_FINISH and #pending > 0 then
      for _, p in ipairs(pending) do
        for _, off in ipairs(RING) do
          -- One invisible throwaway actor per blast, the Attack Helicopter's and the
          -- Bunker Buster's shape: `a:explode` is the actor's own explosion and may
          -- take it with it, so a burst cannot come out of one actor.
          local a = wa.actors.spawn({ sprite = false, x = p.x + off[1], y = p.y + off[2],
            gravity = false, collide = false, owner = shooter, on = function() end })
          a:explode({ id = PUSH, damage = DAMAGE, below = false })
          a:despawn()
        end
      end
      pending = {}
    end
  end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })

  -- **The round in flight, drawn and turned by hand.** Drawn with px_sprite_builder's
  -- flight pattern (`lib/px_sprite_builder.lua`): `m.sprite = 0` hides WA's sprite
  -- (PX clears `ldata->anim.spriteIndex = 0`, `red_sprite_builder.txt:39`), and a
  -- follower actor draws PX's `security_grenade_bullet.png` sheet, turned with the
  -- grenade's animation type -- `customType = 3`, `WAT_Rotation` / `WAT_HSpeed`,
  -- which spins with speed (`red_sprite_builder.txt:17,22,77`) and mirrors when flying
  -- left (`:90`). See px_sprite_builder.lua for the full animation-type table.
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

  -- **The worm's aim and pick art**, PX's sprite-builder split in two: the engine
  -- draws WA's worm from the shared library's weapon-less posture
  -- (`worm_sprites`, below), then draws the held grenade and its hand over it
  -- from `hold`. The numbers are PX's own, from the weapon's sprite script
  -- (`security_grenade_spb.txt`): `hand_radius` 17, `weap_rotation` 0.5,
  -- `weap_radius` 9, `hand_type` 1 (the lower hand) and `hand_scale` 0.8, with
  -- `hand_rotation` / `hand_radial_rotation` / `weap_radial_rotation` left at
  -- PX's defaults, 1.0. One grenade PNG, turned and placed by the aim -- no
  -- 32-frame aim folders.
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
    frames = 1, -- one grenade, turned by the engine's hold to the aim
    thrown = true, -- a thrown grenade leaves the hand; no put-away animation
    -- Gone on space, as PX's: no `FSprite` firing sprite, so his `sprite = 0`
    -- (`worms_anims_script.txt:263`, :419-422).
    keep_while_firing = false,
  }

  -- The registration, in a local first so the `handling` line reads as the
  -- Highlander's claims do (`the weapon module's record.handling.ends_turn`).
  local spec = {
    -- The slot is the profile's. The record is PX's own for this weapon: WA's
    -- grenade record with PX's icon and bullet sprite, so the throw and the stock
    -- blast are WA's and only the ring is Lua's.
    wep = "weps/security_grenade_wep.wep",
    panel_icon = ART .. "icon.png", -- PX's own (security_nade_ico.png)
    -- Stock WA grenade art for the record itself. PX's bullet sprite is never
    -- drawn by WA -- `m.sprite = 0` above hides it, and sb.flight draws PX's own
    -- bullet -- but a record still wants a sprite WA can resolve, and the grenade
    -- is the record's own kind.
    sprite = "grenade",
    -- PX's sprite-builder split: WA's worm comes from the shared weapon-less
    -- library (`lib/px_sprite_builder.lua`, `PX_POSTURE`) and `hold` puts the one
    -- grenade PNG and the hand on top, turned and placed to the aim. Without
    -- `worm_sprites` the worm falls back to the stock grenade hold art, which is
    -- all this used to get.
    worm_sprites = sb.PX_POSTURE,
    hold = hold,
    -- Route the sheet into the GPU atlas for the flight actor
    -- (`weapons/attack_helicopter.lua:470`). The record's own flight art is never
    -- drawn -- `m.sprite = 0` above hides it, and sb.flight draws PX's own bullet.
    -- The same sheet is the hold's weapon PNG.
    sprites = { ART .. "bullet.png" },
    params = { gpu_prefix = ART },
    -- No sounds of its own: PX's package has none, and the stock grenade's blast is
    -- WA's.
    -- PX's ExplodeAt: remember where the stock blast landed; the ring follows on
    -- the frame's end, after it.
    on_explode = function(ev)
      pending[#pending + 1] = { x = ev.x, y = ev.y }
    end,
  }
  wa.weapons.replace(spec)
end

return M
