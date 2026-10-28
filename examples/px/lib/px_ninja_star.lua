-- Ninja Star -- Project X's thrown star, on WormForge API 4.
--
-- PX's source is `PX_pending/weapon_ninja_star/scripts/ninja_star_script.txt` (123
-- lines) and its record `weapons/Ninja Star_wep.wep` (a type-4 record, byte
-- `+0x0C` = 4 -- the Javelin's kind). PX's whole weapon is one override of
-- `CMissile::ExplodeAt` (`:19-60`) plus the routine that stamps the star into the
-- land (`:82-122`); the flight, the blast and the blast's own sound are the
-- record's and WA's. So this is the Highlander **Javelin**'s shape
-- (`highlander_0rang3_test/weapons/javelin.lua:10-66`, catalog entry
-- `:229-236` -- "stock flight, direct thrust or a permanent terrain stamp") with
-- PX's numbers.
--
-- What PX does at the impact, in its order:
--
--   * the first worm, mine, oil drum or crate within a **strict 20 px square**
--     of the impact (`:25-41`; `IsMaterial` objects only) -- `NinjaSDamage`
--     (`:62-80`) gives it **10** damage, knocks it to a quarter of the star's own
--     speed (`SpX/4`, `SpY/4`) and, through the same message, pushes it at half
--     the star's speed;
--   * failing that, the worm whose turn it is within a **strict 25 px square**
--     (`:43-51`) -- `GetCurrentWorm()` -- the same 10 damage;
--   * failing both, the star **stuck in the land** (`:53`), `SStickToLandscape`
--     (`:82-122`): one of 32 orientations chosen by PX's ratio bins (`:88-116`),
--     drawn *into* the terrain so it is part of the land, and PX's own impact
--     sound at the volume and pan its distance gives (`:54-56`);
--   * and in every case the stock explosion (`super`, `:59`), which WA has already
--     done by the time `on_explode` runs -- the port adds to the blast, never
--     replaces it.
--
-- Deliberate departures, all small:
--   * PX's baked aim art (`a - ninjas ( d|e|u ).png`, 32 directions each, 96
--     frames) is not shipped, and neither is the baked pick art (the `p -`
--     sheets, 30 more). The worm is drawn from the shared weapon-less library
--     (`lib/px_sprite_builder.lua`, `PX_POSTURE`) and the star from one sheet
--     (`sprites/ninja_star/hold/frame000.png`) that the engine turns and places,
--     exactly as PX's sprite builder drew the pair (`worms_anims_script.txt`).
--     The star's in-hand art exists nowhere else -- `ninjas.png` is the flight
--     needle -- so that one frame is lifted from PX's own baked art
--     (`porting-analysis/tools/build_hold_library.py`).
--   * the record's own references (`ninjas.png`, the `a -`/`p -` files) are PX's
--     file names; the bundle declares its own sheets under `sprites/ninja_star/`
--     and `panel_icon`, the way every port does (`REPORT.md` 2.4).
--
-- **The trail is an addition, not a port.** PX's star asks for no trail anywhere
-- (`ninja_star_script.txt` has no `SetTrail`; the Attack Helicopter's bullet is
-- the weapon that calls `SetTrail(12, 2, 0)`), so a ribbon of seven points, one
-- per game frame and thin, is a request on top of the port. It runs on the
-- workspace's `lib/px_trail.lua` (`lib/TRAIL.md`, and `REPORT.md` 11.9 maps that
-- module back to `px_effects.c`); the numbers chosen here are the request's, not
-- PX's (REPORT.md 19).
--
-- A component's file, and anything it requires, runs where `wa` does not exist
-- yet: this module is pure data at load and touches `wa` only in `install`.

-- Whether the profile placed this component on a panel slot: a component in no
-- slot must not register a weapon, or the match dies at turn start (REPORT.md
-- 11.13, verified in match). `ctx.placed` is the placed weapons in slot order,
-- each `{ id, position }` (`tools/audit/audit.lua:39-41`); `ctx.weapons` is the
-- same ids as keys (`highlander components/loader.lua:91`). With neither field
-- the weapon registers as before.
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

-- PX's trunc (`ninja_star_script.txt` uses integer division on fixed point;
-- `javelin.lua:21` has the same helper) -- toward zero, not down.
local function trunc(n) return n < 0 and math.ceil(n) or math.floor(n) end

-- PX's effect-manager trail as a module (`lib/px_trail.lua`, `lib/TRAIL.md`).
-- Requiring it is pure data: nothing in it touches `wa` until `install`, which
-- `M.install` calls further down.
local trail = require("lib/px_trail")

-- PX's 32 orientations, by ratio bins, not evenly spaced angles
-- (`:88-116`, identical arithmetic in `javelin.lua:22-30`).
local function orientation(vx, vy)
  if vx == 0 then return vy > 0 and 16 or 0 end
  if vy == 0 then return vx > 0 and 8 or 24 end
  if vx > 0 and vy < 0 then return math.min(trunc(3 * vx / -vy), 7) end
  if vx > 0 then return math.min(trunc(8 + 3 * vy / vx), 15) end
  if vy > 0 then return math.min(trunc(16 + 3 * -vx / vy), 23) end
  return math.min(trunc(24 + 3 * -vy / -vx), 31)
end

local M = {}

function M.install(ctx)
  if not placed(ctx) then
    wa.log("Ninja Star: in no panel slot; nothing registered")
    return
  end

  local ART = "sprites/ninja_star/"
  local SND = "sounds/ninja_star/"

  -- The module's own engine callbacks (`wa.on.missile_frame`, `wa.on.draw`),
  -- registered here because a component's file -- and anything it requires --
  -- runs where `wa` does not exist yet (TRAIL.md; REPORT.md 11.11).
  trail.install()

  -- PX's numbers.
  local DAMAGE    = 10    -- NinjaSDamage (:64-66)
  local HIT_R     = 20    -- the strict 20 px square around the impact (:34)
  local SELF_R    = 25    -- and the 25 px square for the worm whose turn it is (:45)
  local BURIED    = { soften = 3, blend = "mix" } -- as the Javelin's, tuned by eye there

  -- The trail's numbers, every one of them chosen (PX's star has no trail): seven
  -- points, a new one every game frame, and thin. The module's defaults are PX's
  -- *bullet's* -- twelve points, every two frames, `core_w` 8.0 and `glow_w` 13.0
  -- (`lib/px_trail.lua:33-34`) -- so this is half the width and a point a frame.
  -- The width pair and `max` are the knobs if it reads too fat or too long;
  -- `r`/`g`/`b` colour it (the module's white is a stand-in), and `depth` moves it
  -- against the star -- the module's default is `wa.depth.OBJECTS`, one step in
  -- front of the flight actor's `wa.depth.OBJECTS - 1` below.
  local TRAIL = { max = 7, every = 1, core_w = 4.0, glow_w = 7.0, r = 120, g = 120, b = 120 }

  -- PX's GetCurrentWorm() (`highlander lib/missile_sprites.lua:78-84`): the worm
  -- whose turn it is. It owns the star in flight, and it is the worm the star bites
  -- if it lands within 25 pixels of it.
  local function current_worm()
    for _, w in ipairs(wa.worms.all()) do
      if w.turn then return w end
    end
  end

  -- The star's speed at the impact. WA destroys the missile on the frame it hits,
  -- so its speed is gone by the time `on_explode` runs; the Javelin keeps it a
  -- frame ahead for the same reason (`javelin.lua:10-17`). Kept as a separate
  -- missile_frame handler alongside sb.flight's -- both fire for the same missile.
  -- The trail is attached here too: WA launches this record itself (the profile
  -- fires it), so there is no `wa.weapons.launch` return value to hand `trail.add`
  -- -- the first frame the missile exists is the start of its flight (TRAIL.md).
  local speed = {}
  wa.on.missile_frame(function(m)
    if m.weapon ~= "px.ninja_star" then return end
    speed[m.id] = { m.vx, m.vy }
    if m.phase == "pre" and not trail.has(m.id) then
      trail.add(m.id, current_worm(), TRAIL)
    end
  end)

  -- **The star in flight.** Drawn with px_sprite_builder's flight pattern
  -- (`lib/px_sprite_builder.lua`): `m.sprite = 0` hides WA's sprite (PX clears
  -- `ldata->anim.spriteIndex = 0`, `red_sprite_builder.txt:39`), and a follower
  -- actor draws PX's `ninjas.png` sheet -- one frame per star direction, the same
  -- sheet `SStickToLandscape` uses for the stamp (:88-116). No auto-turning
  -- (`anim = "none"`): the frame *is* the orientation, exactly as in PX.
  local sb = require("lib/px_sprite_builder")
  sb.flight(ctx, {
    weapon = "px.ninja_star",
    sheet = ART .. "stamp.png",
    anim = "none",
    frame_fn = function(m) return orientation(m.vx, m.vy) end,
    z = wa.depth.OBJECTS - 1, -- as the helicopter's bullet, behind objects
    mirror = false, -- direction is encoded in the frame, not by mirroring
  })

  -- **The worm's aim and pick art**, PX's sprite-builder split in two: the engine
  -- draws WA's worm from the shared library's weapon-less posture
  -- (`worm_sprites`, below), then draws the held star and its hand over it from
  -- `hold`. One star sheet (`sprites/ninja_star/hold/frame000.png`), turned and
  -- placed by the aim -- no 32-frame aim folders. The numbers follow PX's sprite
  -- builder (`worms_anims_script.txt`): the star sits `weap_radius` from the worm
  -- centre -- 11 px, read off PX's own baked art -- in the middle hand. A
  -- four-point star repeats four times a turn, so `weap_rotation` only chooses
  -- which point leads.
  local hold = {
    sheet = ART .. "hold.png",
    hand = sb.PX_HANDS[2], -- hand_type 2: the middle hand
    hand_radius = 17.0,
    hand_rotation = 1.0,
    hand_radial_rotation = 1.0,
    hand_scale = 1.0,
    weap_rotation = 1.0,
    weap_radius = 11.0,
    weap_radial_rotation = 1.0,
    frames = 1, -- one star, turned by the engine's hold to the aim
    thrown = true, -- a thrown star leaves the hand; no put-away animation
    -- The star leaves the hand on space. PX draws his own star through
    -- `sprite_curtis_457` (`ninja_star_script.txt:1`), a library that is not in
    -- the repo, so what it does in `WS_FIRED` is inferred; the other four
    -- weapons here name no firing sprite at all (`FSprite = 0`,
    -- `worms_anims_script.txt:101`, :263) and PX's own `else` sets `sprite = 0`
    -- (:419-422). ASSUMPTIONS A14.
    keep_while_firing = false,
  }

  -- PX tests a strict square (`x > trg->PosX-20 && x < trg->PosX+20`, :34); the
  -- query is a circle, so it is asked for a little more and the square is applied
  -- here (the Javelin's own note, `javelin.lua:39-40`).
  local function within(o, x, y, r)
    return o and math.abs(x - o.x) < r and math.abs(y - o.y) < r
  end

  -- The registration, in a local first so the `handling` line reads as the
  -- Highlander's claims do (`the weapon module's record.handling.ends_turn`).
  local spec = {
    -- The slot is the profile's. The record is PX's own for this weapon, whose
    -- flight is the whole of the weapon's physics: a type-4 record, the Javelin's
    -- kind, so the throw, the arc, the wind on it and the blast are WA's with
    -- PX's numbers.
    wep = "weps/ninja_star_wep.wep",
    panel_icon = ART .. "icon.png", -- PX's own (ninjas ( grid ).png)
    -- One directory of frameNNN.png per PX sprite, as cut_lab and stress do. The
    -- star's flight and terrain stamp share `stamp` (PX's `ninjas.png`, one frame
    -- per direction); `hold` is the single in-hand star the engine draws. The
    -- trail's two beams are shared with the Attack Helicopter bundle -- every
    -- bundle ships its own copy, they are PX's own PNGs (TRAIL.md).
    sprites = { ART .. "stamp.png", ART .. "hold.png", trail.BEAM, trail.GLOW },
    -- Route the sheets into the GPU atlas for `a:frame`/`a:gfx` on the flight
    -- actor (`weapons/attack_helicopter.lua:470`). `sprites/` rather than `ART`
    -- because a `wa.draw.ribbon` may only draw a GPU sheet, and the beams sit
    -- under `sprites/px_effects/`; every other sheet here starts with the same
    -- prefix and is unaffected.
    params = { gpu_prefix = "sprites/" },
    -- PX's sprite-builder split: WA's worm comes from the shared weapon-less
    -- library (`lib/px_sprite_builder.lua`, `PX_POSTURE`) and `hold` puts the one
    -- star PNG and the hand on top, turned and placed to the aim. Without
    -- `worm_sprites` the record's own sprite is PX-only, WA finds no sheet to
    -- draw the worm with, and the worm vanishes -- the bug this fixes.
    worm_sprites = sb.PX_POSTURE,
    hold = hold,
    sounds = { SND .. "ninjasimpact.wav" },
    -- Whether a weapon ends the turn is a profile's setting, and PX's records
    -- carry it off (`the weapon module's record.handling.ends_turn`), so a weapon built on one says so
    -- itself: the throw ends the turn, as WA's do (`the weapon module's record.handling.ends_turn`).
    -- `wfcheck`'s SPEC_KEYS has no `handling` and reads an unknown literal key as
    -- a no-op -- as it has no `missile`, where the pack's use and a match test
    -- outrank the definition (REPORT.md 4.1); a key on a local spec is how the
    -- pack sets it too.
    -- PX's ExplodeAt, at the impact of the stock blast.
    on_explode = function(ev)
      local v = speed[ev.missile]
      if ev.missile then
        speed[ev.missile] = nil
        -- The round is gone, so shed the ribbon from here rather than leave it to
        -- the module's couple of missing frames (TRAIL.md).
        trail.drop(ev.missile)
      end
      local vx, vy = v and v[1] or 0, v and v[2] or 0
      -- PX's scan (:25-41): the first eligible object in the square. The order is
      -- the engine's, as the Javelin keeps it (`javelin.lua:39-41`) -- PX stops at
      -- the first eligible object too, in `Env->Objs` order.
      local target
      for _, o in ipairs(wa.world.electrical_nearby(ev.x, ev.y, 29, false)) do
        if (o.kind == "worm" or o.kind == "mine" or o.kind == "crate" or o.kind == "oil")
          and within(o, ev.x, ev.y, HIT_R) then target = o break end
      end
      if not target then
        local active = current_worm()
        if within(active, ev.x, ev.y, SELF_R) then target = active end
      end
      if target then
        -- NinjaSDamage (:68-79): a quarter of the star's speed on the object, and
        -- half again through the damage message (which PX notes "doesnt work for
        -- some reason", :75 -- the Javelin passes it too, `javelin.lua:52`).
        target.vx, target.vy = trunc(vx / 4), trunc(vy / 4)
        if target.kind == "worm" then target:hurt(DAMAGE)
        else target:hit(DAMAGE, trunc(vx / 2), trunc(vy / 2), "projectile") end
        return
      end
      -- No worm and nothing to bite: the star sticks in the land. Centred on the
      -- impact, as PX's (`:122`, `x-30, y-(30+top)`), so half of it is in the
      -- ground and the engine's buried stamp fades that half into the earth
      -- instead of drawing it over the land -- the star looks stuck (the
      -- Javelin's note and its own `buried` values, `javelin.lua:55-61`).
      wa.land.stamp{ sprite = ART .. "stamp.png", frame = orientation(vx, vy),
        x = ev.x, y = ev.y, buried = BURIED }
      -- PX plays the impact unplaced, at the volume and pan its distance gives
      -- (`:54-56`); the API has neither, so it plays on the turn's worm (the
      -- Javelin's choice, `javelin.lua:63-65`).
      local shooter = current_worm()
      if shooter then wa.sound.play(shooter, SND .. "ninjasimpact.wav") end
    end,
  }
  spec.handling = { ends_turn = true }
  wa.weapons.replace(spec)
end

return M
