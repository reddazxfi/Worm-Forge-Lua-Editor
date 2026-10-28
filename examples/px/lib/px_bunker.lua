-- Bunker Buster / Super Bunker Buster -- Worms Reloaded's air-strike drill,
-- rebuilt for WormForge API 4. PX's own version is
-- PX_pending/bunker_buster/scripts/bunkerbuster.txt; every number below cites
-- a line of it.
--
-- PX: an air strike (`CWorm::FireFinal`, :631-653) whose bomb is a mine-bodied
-- object, `PxBunkerBuster : CMine` (:106), dropped by a plane standing still
-- (`BombSpX/SpY = 0`, :637-638). The body falls on WA's gravity
-- (`GravityFactor = 1`, :255). Touching land switches it to drilling
-- (`Collide` -> `StartDigging`, :305-318): gravity off (:238), a direction and
-- a speed per frame (`SpX = DirX * DrillSpeed`, :497-498), terrain cut with
-- WA's own drill masks (`ApplyMask(1, ...)` at the body and `ApplyMask(13, ...)`
-- at two side offsets, :508-510), fuel spent per pixel drilled (:516), and
-- WA's own drill hole as it goes -- the pneumatic drill's mask, by PX's own
-- comment (:496). Out of land ahead it falls again (:530-537); out of fuel it
-- blows up (:523-527), as it does on touching anything that is not land
-- (:320-323, its `ColGroupDigging`, :185-196).
--
-- The port keeps its playtested drill speed and time budget, with PX's magnetic
-- response restored through the shared wa.magnetism service:
--
--   * the fall: WA's gravity from above the level, at the click's x --
--     PX's plane drop, minus the plane;
--   * the drill: a fixed-speed step along its direction. PX's global field
--     contributes at 0.4 strength (:427), capped to 0.1 while drilling (:204,
--     :442-446), then blended as normalize(10 * direction + 3 * force)
--     (:128, :449-452). The force changes heading, never drill speed;
--   * the hole: `wa.land.cut{ shape = "drill" }`, WA's own drill mask, which is
--     the shape PX's masks 1 and 13 make (super_drill.lua:17, cut_lab.lua:12).
--     PX cuts only while drilling (:508-510); the port cuts every 10 frames
--     whatever the body is doing, so a buster that has fallen into a wall gets
--     its hole cut for it instead of sitting there (seen stuck in match);
--   * the "limited distance": PX's `DrillFuelAmount = 880` (:124) spent per pixel
--     (:516). The port keeps its existing 300/450 drilling-frame budgets,
--     so the clock ticks only while the drill is going:
--     it pauses when the buster falls and carries on when it hits again, and is never
--     refreshed by a penetration (which is what let it dig without end);
--   * leaving the land: PX probes 10 px ahead of the body with its collision
--     mask (:530) and falls when there is no land there. The port runs a line
--     at each edge of the body instead (the request's "line check on both
--     edges"), and keeps drilling while either edge still has land;
--   * the detonation: fuel out (:523-527), or touching a worm, crate, oil drum
--     or mine (:320-323). WR's list is worm, crate and barrel; mines are PX's
--     own addition to it;
--   * the blast: the plain buster one, the super five, stepped 8 frames apart
--     along the line across the drill (`ExplosionDistance = 40`,
--     `ExplosionDeltaTime = 8`, :138-139, :393-416). Blast and damage are PX's
--     (:148-149, :159-160). The five blasts are WR's "horizontal flare that
--     cuts sideways through the terrain", made of blasts;
--   * the super's fire: PX's `CFireDesc` (:31-36) -- a one-flame fire every
--     4..10 frames while drilling (:472-494), and a six-flame fire at each
--     blast (:330-339).
--
-- What the API cannot carry (presentation only; REPORT.md 9.3):
--   * the drilling flames' full throw. PX throws each up the shaft at 5..15 a
--     frame within 45 degrees of the drill (:480-486); the port tosses it
--     gently (FIRE_TOSS), from just above the body, into the open shaft. Left
--     at the body with `wa.fire.spawn`'s default fall, flames lay against the
--     land being drilled, and one caught on the shaft's wall over nothing held
--     a turn forever (the engine now puts such a flame out);
--   * the smoke and dust particles (:555-606);
--   * a sound that can be **stopped**. `wa.sound.play` and `a:sound` can neither
--     loop nor stop, and PX's drill wav (20.95 s -- an impact, then a long drill, with
--     no loop point in it) played once left the drilling going long after the buster
--     was gone -- in match, through every later shot. The port cuts that wav into an
--     impact piece and five loop pieces of 105 whole frames
--     (`porting-analysis/tools/split_wav.py`), plays the impact on **every** entry
--     into the land and the loop pieces in order while drilling, and stops playing
--     when the digging stops. The Attack Helicopter's rotor is the same idea with one
--     piece (`weapons/attack_helicopter.lua:71,410`);
--   * the `space` early detonation (:655-676) -- no such key is exposed;
--
-- Girders: the trace has no girder kind, so a girder in the path is simply
-- passed through -- which is WR's "burrows through terrain and girders".
--
-- A component's file, and anything it requires, runs where `wa` does not exist
-- yet: this module is pure data at load and touches `wa` only in `install`.
--
-- The two weapons are independent: each has its own component, record, sprites,
-- sounds and numbers, and a component that is in **no** panel slot registers
-- nothing (`placed` below), so either can be placed on its own -- and one of the
-- two unplaced does not take the match down with it.

-- Whether the profile placed this component on a panel slot.
--
-- A component that is in **no** slot must not register a weapon: the engine
-- builds one for every registration, and a slot-less weapon takes the match
-- down at turn start ("converting Lua nil to table" -- the panel cell it looks
-- up is nil). With two weapons in one bundle that is the difference between
-- placing either alone and a hard crash, so this asks first.
--
-- The placed set is the loader's own: `ctx.placed`, the placed weapons in slot
-- order, each `{ id, position }` (`tools/audit/audit.lua:39-41`,
-- `highlander components/highlander.lua:16-17`), and `ctx.weapons`, the same
-- ids as keys (`highlander components/loader.lua:91`). Either listing this
-- component is enough; only when a field is there and neither lists it is the
-- component in no slot. A context with neither field registers as before, so
-- nothing is lost if the fields move.
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
  -- In no slot: no weapon, no art, no sound. The other component of the bundle
  -- is unaffected -- each carries its own record, sprites and sounds, and reads
  -- nothing the other leaves behind.
  if not placed(ctx) then
    wa.log(("Bunker Buster: %s is in no panel slot; nothing registered"):format(ctx.id))
    return
  end

  -- Which of the two this component is. Both share this file and this one entry
  -- point; their record, art, numbers and fire are each their own.
  local super_buster = ctx.id == "px.super_bunker_buster"
  local ART = "sprites/" .. (super_buster and "super_bunker_buster/" or "bunker_buster/")
  local SND = "sounds/bunker_buster/" -- both weapons' sounds, PX's two wavs

  -- PX's drill sound, cut in six (REPORT.md 11.14, `porting-analysis/tools/split_wav.py`).
  -- PX plays one 20.95 s wav -- an impact, then a long drill with no loop point in it -- and
  -- re-plays it every 15 s while digging (`:240`, `:609-624`); `a:sound` can neither loop nor
  -- stop a sound, so playing it once ran the drilling on long after the buster was gone, and
  -- through every later shot.
  --
  -- The pieces are cut for the game's own frame rate, which is **50 fps** -- not 60, which cost
  -- this weapon one round of "the sound cuts, every time": PX's helicopter rotor, the one loop
  -- that has always been inaudible, is 0.9155 s of audio re-triggered every 47 frames
  -- (`weapons/attack_helicopter.lua:71,410`), which is 0.94 s at 50 fps (24 ms short of the
  -- audio, inaudible) and 0.78 s at 60 fps (the audio cut by 132 ms a cycle). A piece cut for the
  -- wrong rate is cut short by that rate's error on every cycle, which is exactly what was heard.
  --
  -- The wav's own period is 1.75 s, and at 50 fps the nearest whole frame count is 88 (1.76 s,
  -- 10 ms over the period, so five pieces wrap within 50 ms of phase). So the first 10.56 s cuts
  -- into an **impact** piece and five loop pieces of 88 frames each, at exact frame boundaries
  -- with no snapping: played in order they are the original sample for sample.
  local IMPACT_SOUND  = "bunkbustdrill_impact.wav"
  local LOOP_SOUNDS   = { "bunkbustdrill_loop1.wav", "bunkbustdrill_loop2.wav",
                          "bunkbustdrill_loop3.wav", "bunkbustdrill_loop4.wav",
                          "bunkbustdrill_loop5.wav" }
  local IMPACT_FRAMES = 88 -- the impact piece's own length, and the wait before the loop
  local LOOP_FRAMES   = 88 -- every loop piece is the same 1.76 s, so the same wait

  -- PX's numbers, by line in bunkerbuster.txt.
  local R          = 8      -- the collision circle, CColMask(8, 8, MakeCircleMask(8)) (:38)
  local SKY        = -128   -- the drop height above the level (PX's PlaneAppearYOffset; bowling_ball.lua:16)
  -- The port's existing playtested speed. PX randomizes 0.5..2.0 every few
  -- frames (:463-467); magnetic steering changes direction, not this speed.
  local DIG_SPEED  = 1.15
  local MAGNET_SHARE, MAX_DRILL_FORCE, DIG_MAGNET_FACTOR = 0.4, 0.1, 3
  -- PX's "limited distance" is a fuel amount (`:124`, spent per pixel at `:516`); the port counts
  -- **frames of drilling** instead, using its existing 300/450-frame clocks. Each ticks
  -- only while the body is actually drilling, so it pauses when the buster falls (past a girder,
  -- out of a cave roof) and carries on when it hits again, instead of starting over. It is not
  -- refreshed on a penetration, which is what let a buster dig without end.
  local DIG_FRAMES = super_buster and 450 or 300
  -- The drill mask, cut every MASK_EVERY frames whether the body is drilling or still falling.
  -- PX cuts only while drilling (:508-510); cutting on the way down as well means the body can
  -- never come to rest inside land with no hole to move in -- a buster that fell into a wall was
  -- seen stuck, because the drill starts only when the tip's line finds land (:317). While
  -- drilling, cuts are DIG_SPEED * MASK_EVERY = 15 px apart, which the drill cut spans.
  local MASK_EVERY = 3
  local EDGE       = 6      -- the two probe lines, within the tunnel's edge
  local LOOKAHEAD  = 13     -- PX probes 10 px ahead of the body (:530)
  local ANIM_SPEED = 0.08   -- AnimSpeed (:136) over AnimCycleDuration 1.0 (:172)
  local FRAMES     = 3      -- each sheet is a 3-frame strip (LoadSprite(f, 3, 0), :42-51)
  local SINK, SUNK = 2, 200 -- sinking out of sight in the water (electromagnet.lua:184-188)
  local FIRE_MIN, FIRE_MAX = 4, 10    -- DrillFireMinDelta/MaxDelta (:163-164)
  local EXPL_DIST  = 40     -- ExplosionDistance (:139)
  local EXPL_DELTA = 8      -- ExplosionDeltaTime (:138)
  local NUM        = super_buster and 5 or 1    -- NumExplosions (:147, :158)
  local BLAST      = super_buster and 80 or 100 -- ExplosionBlast (:148, :159)
  local DAMAGE     = super_buster and 26 or 38  -- ExplosionDamage (:149, :160)
  local FIRE       = { duration = 1000, up_power = 15, damage = 1 } -- CFireDesc (:33-35)
  -- The drilling flame's toss, pixels a frame: up 1..2, drifting at most 0.5
  -- either way. PX's own throw (5..15, :480-486) is far stronger.
  local FIRE_TOSS  = { up_min = 100, up_max = 200, drift = 50 } -- hundredths
  
  local busters = {} -- body actor id -> state

  -- PX's DoExplosion (:326-340): a real WA blast at the point, and for the super
  -- a six-flame fire there. `id` is PX's `ExplosionBlast`, as the Highlander's
  -- Electromagnet reads it (weapons/electromagnet.lua:198, `BOOM`).
  --
  -- One throwaway actor per blast: `a:explode` is the actor's own explosion and
  -- may take it with it (the Attack Helicopter guards its companions on
  -- `a.dead`, weapons/attack_helicopter.lua:181), so a five-blast sequence
  -- cannot come out of one actor.
  local function blast(m, x, y)
    local b = wa.actors.spawn({ sprite = ART .. "idle.png", x = x, y = y,
      gravity = false, collide = false, owner = m.owner, on = function() end })
    b:scale(0)
    b:explode({ damage = DAMAGE, id = BLAST, below = false })
    if not b.dead then b:despawn() end
    if super_buster and m.owner then
      wa.fire.spawn({ owner = m.owner, x = x, y = y, count = 6,
        duration = FIRE.duration, up_power = FIRE.up_power, damage = FIRE.damage })
    end
  end

  -- PX's SetDirection (:287-301), including its zero-speed fallback.
  local function direction(m, dx, dy)
    local length = math.sqrt(dx * dx + dy * dy)
    if length < 0.0001 then m.dir_x, m.dir_y = 0, 1
    else m.dir_x, m.dir_y = dx / length, dy / length end
  end

  local function remove(m)
    busters[m.body.id] = nil
    if not m.body.dead then m.body:despawn() end
    if m.glow and not m.glow.dead then m.glow:despawn() end
  end

  -- PX's Explode (:270-285): the drill stops, then the blasts come out over the
  -- following frames (:393-416). PX draws nothing once Dead (:347), so the body
  -- art goes.
  local function boom(m)
    if m.boom then return end
    m.boom, m.dig, m.vy, m.num, m.timer = true, false, 0, 0, 0
    m.body:scale(0)
    if m.glow then m.glow:scale(0) end
  end

  -- Where the drill probes: a line at one edge of the body, from its tip
  -- LOOKAHEAD down (PX's FindInMask probe, :530).
  local function land_ahead(m, edge)
    local x = m.x + m.dir_x * R + m.dir_y * edge
    local y = m.y + m.dir_y * R - m.dir_x * edge
    return wa.land.trace(x, y, x + m.dir_x * LOOKAHEAD, y + m.dir_y * LOOKAHEAD) ~= nil
  end

  -- PX's Collide on anything that is not land (:320-323): its `ColGroupDigging`
  -- is worms, crates, oil drums and mines (:185-196). The body's own circle,
  -- swept along the step, so a fast fall cannot step over a worm.
  local function touched(x0, y0, x1, y1)
    local res = wa.world.trace({ x0 = x0, y0 = y0, x1 = x1, y1 = y1, radius = R,
      with = { "worms", "crates", "oil", "mines" } })
    return res and res.hit
  end

  local function frame_of(m)
    return function(a)
      -- ------------------------------------------------------------- blasts
      if m.boom then
        if m.num >= NUM then remove(m) return end
        if m.timer <= 0 then
          local d = EXPL_DIST * m.num
          -- PX's flare stays perpendicular to the steered drill (:406-409).
          blast(m, m.x + m.dir_y * d, m.y - m.dir_x * d)
          if m.num > 0 then blast(m, m.x - m.dir_y * d, m.y + m.dir_x * d) end
          m.timer, m.num = EXPL_DELTA, m.num + 1
        end
        m.timer = m.timer - 1
        return
      end

      -- -------------------------------------------------------------- water
      -- PX's mine sinks and tints blue (:349-351); nothing left to drill for.
      if m.y >= wa.world.water() then
        m.sunk = true
        m.y = m.y + SINK
        a.x, a.y = m.x, m.y
        a:gfx({ tint = 0x5A5AF0 }) -- PX's sink tint, RGB(90, 90, 240) (:349-351)
        if m.y >= wa.world.water() + SUNK then remove(m) end
        return
      end

      -- ------------------------------------------------------ drill or fall
      local px, py = m.x, m.y
      local fx, fy, inside = wa.magnetism.sample(m.x, m.y, a)
      fx, fy = fx * MAGNET_SHARE, fy * MAGNET_SHARE
      -- PX's small sideways tie-breaker in a live field (:429-431).
      if inside and fx == 0 then fx = 0.01 end
      if m.dig then
        local force = math.sqrt(fx * fx + fy * fy)
        if force > MAX_DRILL_FORCE then
          fx, fy = fx * MAX_DRILL_FORCE / force, fy * MAX_DRILL_FORCE / force
        end
        direction(m, 10 * m.dir_x + DIG_MAGNET_FACTOR * fx,
          10 * m.dir_y + DIG_MAGNET_FACTOR * fy)
        if not land_ahead(m, -EDGE) and not land_ahead(m, EDGE) then
          -- No land ahead at either edge: fall again (PX's StopDigging, :530-537).
          m.dig = false
          local speed = DIG_SPEED * (1 + 2 * (1 - m.dir_y)) -- PX's exit nudge
          m.vx, m.vy = m.dir_x * speed, m.dir_y * speed
        else
          m.vx, m.vy = m.dir_x * DIG_SPEED, m.dir_y * DIG_SPEED
          m.x, m.y = m.x + m.vx, m.y + m.vy
          m.dig_time = m.dig_time - 1                  -- the drill's clock, ticking (see DIG_FRAMES)
          if m.dig_time <= 0 then boom(m) return end   -- PX: out of fuel -> explode (:523-527)
          -- PX's StartDigging sound (:240), in the two halves the wav is made of: the loop
          -- piece under the drill, one piece per LOOP_FRAMES so the audio is continuous
          -- through a drill and nothing is heard to stop when it ends.
          m.snd_timer = m.snd_timer - 1
          if m.snd_timer <= 0 then
            a:sound(SND .. LOOP_SOUNDS[m.piece])
            m.piece = m.piece % #LOOP_SOUNDS + 1
            m.snd_timer = LOOP_FRAMES
          end
          if super_buster then
            if m.fire_timer <= 0 then
              local drift = wa.random(-FIRE_TOSS.drift, FIRE_TOSS.drift) / 100
              local up = wa.random(FIRE_TOSS.up_min, FIRE_TOSS.up_max) / 100
              wa.fire.spawn({ owner = m.owner, x = m.x - m.dir_x * R, y = m.y - m.dir_y * R, count = 1,
                vx = m.dir_y * drift - m.dir_x * up,
                vy = -m.dir_x * drift - m.dir_y * up,
                duration = FIRE.duration, up_power = FIRE.up_power, damage = FIRE.damage })
              m.fire_timer = wa.random(FIRE_MIN, FIRE_MAX)
            end
            m.fire_timer = m.fire_timer - 1
          end
        end
      else
        -- Falling: WA's gravity while the land is clear (PX's GravityFactor 1,
        -- :255). The tip's own path is the line traced, so a step of any size
        -- meets the first land it crosses. PX's Collide -> StartDigging (:317).
        m.vx, m.vy = m.vx + fx, m.vy + wa.world.gravity() + fy
        direction(m, m.vx, m.vy)
        local nx, ny = m.x + m.vx, m.y + m.vy
        local tip_x, tip_y = m.dir_x * R, m.dir_y * R
        local hit = wa.land.trace(m.x + tip_x, m.y + tip_y, nx + tip_x, ny + tip_y)
        if hit then
          m.x, m.y = (hit.x or nx + tip_x) - tip_x, (hit.y or ny + tip_y) - tip_y
          m.dig, m.fire_timer = true, 0
          -- PX's StartDigging sound (:240) is the wav's own impact, and it plays on
          -- **every** entry into the land: the first drop, and each time a drill that ran out
          -- of land (a girder, a cave roof) fell and struck something again. The loop then
          -- starts again at its first piece, so the drill's own audio picks up where it left.
          a:sound(SND .. IMPACT_SOUND)
          m.piece, m.snd_timer = 1, IMPACT_FRAMES
        else
          m.x, m.y = nx, ny
        end
      end

      -- The drill mask, on every MASK_EVERY frames and whether or not the body is drilling
      -- (see the constant). Only where there is land to cut: the body, or the tip -- a tip
      -- inside land with the body still above it is the falling case, and cutting there opens
      -- the hole before the body is in, which is what it is for.
      m.mask_timer = m.mask_timer - 1
      if m.mask_timer <= 0 then
        m.mask_timer = MASK_EVERY
        if wa.land.solid(m.x, m.y) or wa.land.solid(m.x + m.dir_x * R, m.y + m.dir_y * R) then
          wa.land.cut({ x = m.x, y = m.y, shape = "drill" }) -- PX's masks 1 and 13 (:508-510)
        end
      end

      -- Anything else it touched on the way blows it up (PX :320-323).
      if (px ~= m.x or py ~= m.y) and touched(px, py, m.x, m.y) then boom(m) return end

      -- ------------------------------------------------------------- drawing
      a.x, a.y = m.x, m.y
      local sheet = m.dig and (ART .. "digging.png") or (ART .. "idle.png")
      if sheet ~= m.sheet then
        a:look(sheet)
        m.sheet = sheet
      end
      m.anim = (m.anim + ANIM_SPEED) % 1.0 -- PX's AnimCycle (:423-424)
      a:frame(math.min(FRAMES - 1, math.floor(m.anim * FRAMES)))
      local angle = -math.deg(wa.math.atan(m.dir_x, m.dir_y)) -- PX's UpdateRotation
      a:gfx({ angle = angle, depth = wa.depth.OBJECTS + 2 }) -- PX's z 10.01, behind the worms
      if m.glow then
        -- PX's glow (SpriteGlow, :378-385): PX's z 10, in front of the body,
        -- additive, tinted RGB(255, 70, 0).
        m.glow.x, m.glow.y = m.x, m.y
        m.glow:gfx({ angle = angle, depth = wa.depth.OBJECTS + 1, blend = "add", tint = 0xFF4600 })
      end
    end
  end

  -- PX's plane drop, less the plane: one buster at the click's x, standing
  -- still above the level, on WA's gravity.
  local function drop(worm, x, y)
    wa.sound.play(worm, SND .. "bunkbustfall.wav") -- PX's fall sound (:202)
    local m = { x = x, y = SKY, vx = 0, vy = 0, dir_x = 0, dir_y = 1,
      dig_time = DIG_FRAMES, dig = false, boom = false,
      num = 0, timer = 0, anim = 0, fire_timer = 0, sunk = false, owner = worm,
      mask_timer = 0, snd_timer = 0, piece = 1 } -- both timers fire on the first frame they can
    m.body = wa.actors.spawn({
      sprite = ART .. "idle.png", x = x, y = SKY, vx = 0, vy = 0,
      gravity = false, collide = false, owner = worm, as_object = true,
      on = frame_of(m),
    })
    if super_buster then
      m.glow = wa.actors.spawn({ sprite = ART .. "glow.png", x = x, y = SKY,
        gravity = false, collide = false, owner = worm, on = function() end })
    end
    busters[m.body.id] = m
    return m
  end

  local sprites = { ART .. "idle.png", ART .. "digging.png" }
  if super_buster then sprites[#sprites + 1] = ART .. "glow.png" end

  -- The registration. Built in a local first: the `handling` line below then
  -- reads as the Highlander's own claims do (`the weapon module's record.handling.ends_turn`).
  local spec = {
    -- The slot is the profile's. The record is PX's own for this weapon (name
    -- "Bunker Buster", a native air-strike record): as the Lightning Strike does
    -- with PX's `napalm_strike.wep` (weapons/lightning_strike.lua), the click-only
    -- shape below means the worm never fires the record and the engine runs no
    -- stock plane from it. One record per slot, as PX's own pack does
    -- (`weps/<slot>.wep`), so neither weapon needs the other placed: the Super
    -- gets its own copy of the record, because PX's own super record
    -- (`super_bunkerbuster_wep_broken.wep`) is broken.
    wep = super_buster and "weps/super_bunker_buster.wep" or "weps/bunkerbuster_wep1.wep",
    panel_icon = ART .. "icon.png", -- PX's own icon (ico_bunkerbuster.png / ico_superbunkerbuster.png)
    -- One vertical PNG strip per PX sprite; playback is declared in mod.toml.
    sprites = sprites,
    params = { gpu_prefix = "sprites/" },
    -- The bundle's sounds, by path: this list is the declaration, the way `sprites` is
    -- (the drill was silent until it named the loop pieces -- a wav that is not named here
    -- does not play, and a name here that is not in the bundle does not load). The impact
    -- first, then the loop in order: `LOOP_SOUNDS` as the table spells them.
    sounds = { SND .. IMPACT_SOUND, SND .. LOOP_SOUNDS[1], SND .. LOOP_SOUNDS[2],
      SND .. LOOP_SOUNDS[3], SND .. LOOP_SOUNDS[4], SND .. LOOP_SOUNDS[5],
      SND .. "bunkbustfall.wav" },
    -- Click-only dispatch keeps the strike's cursor and turn handling, exactly
    -- as the Lightning Strike: `on_select.cursor` overrides the record's own
    -- aim mode, and there is no `on_fire` and no `eat_fire` -- an eat would
    -- also swallow the turn end (REPORT.md 11.7).
    on_select = { cursor = true },
    on_click = function(ev)
      -- WR's Bunker Buster is unavailable on cave maps: there is no sky to drop
      -- from. The shot is already spent; nothing falls.
      if wa.world.cavern() then
        wa.log("Bunker Buster: no drop on a cavern map")
        return
      end
      drop(ev.worm, ev.x, ev.y)
    end,
  }
  wa.weapons.replace(spec)
end

return M
