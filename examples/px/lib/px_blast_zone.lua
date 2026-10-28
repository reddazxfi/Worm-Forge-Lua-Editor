-- Blast Zone -- Project X's zone launcher, ported to WormForge API 4.
--
-- PX's source is `PX_pending/weapon_zones/scripts/zone_launchers_script.txt`:
-- the `CBlast` class (:233-348), the missile's `ExplodeAt` that places the zone
-- (:370-376), `CWorm::FireFinal` that saves the thrower's team (:519-526) and
-- the in-match keys (:424-459). Its hold numbers are in
-- `scripts/blast_zone_anim.txt` (:19-31), its record is
-- `weapons/blast_zone_WEAP.wep`.
--
-- The weapon is the Health Zone's round: the same WA standard missile (PX's two
-- records differ in two fields only -- `handling.remember_selection` and the name -- both fire
-- type 1, method 3, animation 2: a tracking bazooka shell) with PX's
-- `blast_zone_bullet.png` drawn over it. On impact it leaves a 45x45 zone
-- (:374) that, once every five frames while it is awake, explodes once if
-- anything is inside it (:328-341):
--
--   * 30 push and 30 damage -- PX's `DoExplosion(x, y, PushPower, Damage, 0,
--     Team)` (`Boom` :285-287, the numbers from `ExplodeAt` :375). Firing it at
--     your own feet is the mistake PX built it for: the thrower is inside the
--     box, so it goes off on the thrower;
--   * a mine that triggered the boom is armed with a random 1-5 second fuse
--     instead of merely being caught (:288-303).
--
-- It booms, then waits to be re-armed: PX sets `worknow = false` and re-arms on
-- `blast_zone->active == false` (:328-346), the `CWZone`'s own flag -- a class
-- that is not in the repo, and one that may well go false and true again inside
-- one turn. The port re-arms while the object sleeps, so at most one boom a turn
-- (ASSUMPTIONS A11). It lives 1..5 turns, set with the 1..5 keys (:429-459). The
-- shared machine is `lib/px_zone.lua`.
--
-- Its three rotated explosions are the engine's quads, additively blended, with
-- PX's own team colour (:263-274) -- the one place in this bundle where the
-- colour comes from PX's table rather than from a tint of ours. The slot in that
-- table is the thrower's **colour index**, `worm.alliance` (0 red to 5 cyan,
-- `crates/lua-host/src/api.rs:1105`); the engine will not hand Lua a team's RGB
-- -- it exposes the slot the match drew the worm in -- so PX's six default
-- values are used for it, and they are the six WA ships with.
--
-- Art/timing verified against weapon_zones.pxl, p_animation.pxl and
-- pxparticles.pxl in the 28.09.2026 PX build. Trails and animation use the
-- existing drawing API; lib/px_zone_fx.lua keeps cosmetic RNG separate.
-- Visual expiry fades for three game seconds, independent of render rate.
--
-- A component's file, and anything it requires, runs where `wa` does not exist
-- yet: this module is pure data at load and touches `wa` only in `install`.

-- Whether the profile placed this component on a panel slot (REPORT.md 11.13):
-- a slot-less registration takes the match down at turn start.
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
    wa.log("Blast Zone: in no panel slot; nothing registered")
    return
  end

  local ART = "sprites/blast_zone/"
  local sb = require("lib/px_sprite_builder")
  local zone = require("lib/px_zone")
  local fx = require("lib/px_zone_fx")
  fx.install()

  -- PX's numbers (`zone_launchers_script.txt`).
  local TURNS_MIN, TURNS_MAX = 2, 6 -- the 1..5 keys give 2..6 turns (:429-459)
  local TURNS_DEFAULT = 3           -- `BlastTurns = 3` (:35)
  local FPS = 5                     -- `fps = 5` (:248): a tick every 0.1 s
  local RADIUS = 22.5               -- `CWZone(x, y, 45, 45, ...)` (:374)
  local PUSH, DAMAGE = 30, 30       -- `CBlast(number, x, y, 30, 30, ...)` (:375)
  -- `RandomInt(1000, 5000)` (:297) -- PX's fuse is in milliseconds, and so is
  -- `arm`'s (`crates/lua-host/src/actor.rs:1959`, `fuse_ms`). The dev's own
  -- retelling of this line stops one short of five seconds
  -- (`mods/px/weapons/electromagnet.lua:64`, `wa.random(1000, 4999)`); followed
  -- here, because a millisecond is not observable and his is the working one.
  local MINE_FUSE_MIN, MINE_FUSE_MAX = 1000, 4999

  -- The explosion, PX's `pyroman_explosion` (`bz_exp.png`, 10 frames of 150x150)
  -- at `scale = 0.5` (:260): 75 pixels, drawn three times, once per rotation
  -- (:259, :279, :281).
  local EXP_FRAMES = 10
  local EXP_SPEED = 35 -- normalized phase increment = speed/1000 per frame
  local EXP_SIZE = 75
  local ROTATIONS = { math.pi / 2, math.pi / 4, -math.pi / 4 }
  -- PX's `ZoneParams->ZPlane` is set once, by the health zone (:106), and his
  -- `CBlast` reuses the same `ZoneParams` without touching it (:252-277): the
  -- explosion is drawn on the zone's plane, behind the worms.
  local EXP_DEPTH = wa.depth.WORMS + 1

  -- PX's team colours for the explosion (:263-274), red to cyan. Team 0 and
  -- anything past 6 (impossible in WA, whose teams are 1..6) take red. The slot
  -- is the drawing worm's **colour index** -- `worm.alliance`, 0 red to 5 cyan
  -- (`crates/lua-host/src/api.rs:1105`, read from the team record's colour byte at
  -- `crates/lua-host/src/actor.rs:1581-1584`) -- not its team number, so a scheme
  -- that gave team 2 the red colour still gets PX's red. With WA's default
  -- colours the two numberings agree, which is why PX's table reads as teams.
  local TEAM_COLOURS = {
    [1] = 0x55D21400, [2] = 0x550014DC, [3] = 0x5500DC00,
    [4] = 0x55FADC00, [5] = 0x55DC00DC, [6] = 0x5500E6E6,
  }

  -- PX's module state: `BlastTurns` (:12, :35). The keys below change it for the
  -- rest of the match, as PX's do.
  local turns = TURNS_DEFAULT
  local digit_held

  -- The thrower, PX's `ClWT`/`ClWN` (:521-522): the flight actor's owner, and
  -- the team the explosion is drawn in.
  local shooter

  -- **PX's `CBlast::Boom` (:285-303).** `a:explode` is the engine's own
  -- CreateExplosion -- a real crater, push and damage -- and `id` is PX's push,
  -- as the Bunker Buster and the Attack Helicopter read it. One throwaway actor
  -- per blast, because an explosion may take its actor with it
  -- (`crates/lua-host/src/actor.rs`, "actor:explode"; the same shape as
  -- `mods/px/lib/px_bunker.lua:198-203`).
  local function boom(z, obj)
    local b = wa.actors.spawn({
      sprite = false, x = z.x, y = z.y, gravity = false, collide = false,
      owner = z.owner, on = function() end,
    })
    b:explode({ damage = DAMAGE, id = PUSH, below = false })
    if not b.dead then b:despawn() end
    -- PX then arms the mine that tripped the zone, rather than leaving it to be
    -- caught by the blast (:288-303): `Active = 0` and `Prefuse <= 0` are the
    -- engine's "not armed yet", which is `fuse < 0` here, and the random 1-5
    -- seconds are the dev's own `TriggerMine`
    -- (`mods/px/weapons/electromagnet.lua:61-77`).
    if obj.kind == "mine" then
      local fuse = obj.fuse
      if not fuse or fuse < 0 then fuse = wa.random(MINE_FUSE_MIN, MINE_FUSE_MAX) end
      obj:arm(fuse)
    end
  end

  -- PX's `backwards = true`, `loop = true` at `speed = 35` (:254-257): his ten
  -- frames run out and back, for as long as the zone lives. Stepped here, once
  -- a world frame, rather than in the draw, so the frame is the same on every
  -- peer and in a replay whatever the renderer is doing.
  local function animate(z)
    z.frame = fx.frame(z.timer, EXP_SPEED, EXP_FRAMES)
  end

  -- PX's `CBlast`, through the shared machine: a 45x45 box, a tick every 0.1 s,
  -- one explosion per waking, and the species list from :334.
  local EXP_SHEET = ART .. "exp.png"
  local ZONES = zone.register({
    name = "Blast Zone",
    fps = FPS,
    radius = RADIUS,
    half_height = RADIUS,
    kinds = { worm = true, oil = true, mine = true, crate = true, arrow = true, missile = true },
    one_shot = true,
    fade_frames = fx.FADE,
    frame = animate,
    tick = boom,
    draw = function(z)
      local colour = fx.faded(TEAM_COLOURS[(z.colour or 0) + 1] or TEAM_COLOURS[1], z)
      for _, angle in ipairs(ROTATIONS) do
        -- CAnimation emits floor(150/15 * 35/100) = three additive copies.
        for _ = 1, 3 do
          zone.mark(EXP_SHEET, z.x, z.y, EXP_SIZE, angle, colour, "add", EXP_DEPTH, z.frame)
        end
      end
    end,
  })

  -- PX's in-match keys (:424-459): 1..5 set the turns, to 2..6. PX gates each
  -- behind two presses (`SH_pressing`, :428); here one press acts, on the key's
  -- edge, which is what PX's gate stands in for, as in the Health Zone.
  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FIRE_WEAPON then
      if worm.weapon == "px.blast_zone" then shooter = worm end
      return
    end
    local keys = worm.turn and worm.weapon == "px.blast_zone" and wa.world.keys() or nil
    local digit = keys and keys.digit
    if digit and digit >= 1 and digit <= 5 and digit ~= digit_held then
      turns = math.min(TURNS_MAX, math.max(TURNS_MIN, digit + 1))
    end
    digit_held = digit
  end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })

  require("lib/weapon_hint").register("px.blast_zone", function()
    -- Report the duration the zone actually receives.
    return "Blast Zone: explodes for " .. turns .. " turns  (1-5 turns)"
  end)

  -- **The round in flight, drawn and turned by hand.** PX's `WeapSprite` with an
  -- empty `WeapSpriteParams` (`blast_zone_anim.txt:36-49`) leaves WA's sprite 0
  -- and draws PX's `blast_zone_bullet.png` on the missile, turned by the
  -- record's own animation type: `+0x64` is 2, the track-movement type, a
  -- bazooka shell facing its flight (`highlander_0rang3_test/lib/missile_sprites.lua:22-25`).
  fx.flight("px.blast_zone")
  sb.flight(ctx, {
    weapon = "px.blast_zone",
    sheet = ART .. "bullet.png",
    anim = "track",
    z = wa.depth.OBJECTS - 1,
    mirror = true,
    owner = shooter,
  })

  -- **The worm's aim and pick art**, PX's sprite-builder split in two, with
  -- PX's own hold numbers (`blast_zone_anim.txt:19-31`): `hand_type` 3 (the
  -- upper hand), `hand_rotation` 0.5, `hand_radius` 4, `hand_radial_rotation` 0,
  -- `hand_scale` 0.8. He leaves `weap_radius`, `weap_rotation` and
  -- `weap_radial_rotation` at `CWormAnimParams`' defaults -- 1.0 each
  -- (`worms_anims_script.txt:80-90`) -- which is what the HoldSpec defaults are
  -- too, so only the four he set are named here.
  local hold = {
    sheet = ART .. "hold.png",
    hand = sb.PX_HANDS[3], -- hand_type 3: the upper hand
    hand_radius = 4.0,
    hand_rotation = 0.5,
    hand_radial_rotation = 0.0,
    hand_scale = 0.8,
    frames = 1, -- one bomb, turned by the engine's hold to the aim
    thrown = true,
    -- Gone on space, as PX's: no `FSprite` firing sprite, so his `sprite = 0`
    -- (`worms_anims_script.txt:263`, :419-422).
    keep_while_firing = false,
  }

  local spec = {
    -- PX's own record for this weapon, byte for byte: the same bazooka missile
    -- the Health Zone carries.
    wep = "weps/blast_zone_wep.wep",
    panel_icon = ART .. "icon.png", -- PX's own (bz_ico.png)
    sprite = "missile",
    worm_sprites = sb.PX_POSTURE,
    hold = hold,
    -- The flight sheet for the flight actor, the explosion strip for the zone's
    -- three quads. The hold sheet comes in through `hold` itself.
    sprites = { ART .. "bullet.png", ART .. "exp.png" },
    params = { gpu_prefix = ART },
    -- PX's `ExplodeAt` (:370-376), after WA's own impact -- and the record has
    -- nothing of its own: explosion power 0, as the Health Zone's.
    on_explode = function(ev)
      ZONES.place(ev.x, ev.y, {
        turns = turns, owner = shooter,
        -- `worm.alliance` is the colour index (0 red to 5 cyan), taken now so
        -- the draw never reads a worm that has since died.
        colour = shooter and shooter.alliance or 0,
        frame = 0,
      })
    end,
  }
  spec.handling = { ends_turn = true }
  wa.weapons.replace(spec)
end

return M
