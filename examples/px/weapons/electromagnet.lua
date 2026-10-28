-- Electromagnet: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  handling = {
    remember_selection = true,
    ends_turn = true,
  },
}

function weapon.definition()
  local shared = require("lib/shared")
  local fires = shared.fires
  return require("lib/weapon").merge(weapon.record, {
    wep = "weps/baseball_bat.wep",
    -- PX's red icon is attract mode; ours, recoloured to the blue magnet's
        -- colours, repel (the HUD hook in electromagnet.lua shows the mode).
        panel_icon = "sprites/electromagnet/ico_magnet.png",
    panel_icons = { "sprites/electromagnet/ico_magnet_blue.png" },
    -- WA takes it out and puts it away with the Dynamite's draw (334-336);
        -- PX swaps in the magnet's (CSpriteAnim::SetAnimEx): blue repelling,
        -- red once + switched the worm to attracting (the engine reads + as the
        -- module does, and plays the take-out again in the new colour).
        worm_sprites = {
          wdynlnk = "sprites/electromagnet/wmag2lnk.png",
          wdynlnku = "sprites/electromagnet/wmag2lnku.png",
          wdynlnkd = "sprites/electromagnet/wmag2lnkd.png",
        },
    worm_sprites_toggle = { key = "plus_key", worm_sprites = {
          wdynlnk = "sprites/electromagnet/wmaglnk.png",
          wdynlnku = "sprites/electromagnet/wmaglnku.png",
          wdynlnkd = "sprites/electromagnet/wmaglnkd.png",
        } },
    sprites = {
          "sprites/electromagnet/magnet.png", "sprites/electromagnet/magnet2.png",
          "sprites/electromagnet/magnet_damaged.png", "sprites/electromagnet/magnet2_damaged.png",
          "sprites/electromagnet/ring_in.png", "sprites/electromagnet/ring_out.png",
          "sprites/electromagnet/magnetsparks.png",
        },
    params = { gpu_prefix = "sprites/electromagnet/" },
    on_fire = function(fire) fires.electromagnet(fire) end,
  })
end

function weapon.setup()
  -- Highlander's Electromagnet, on the Baseball Bat slot (PX weapon_magnet:
  -- magnet.txt's CMagnet). Placed, it stays: for four of its owner's turns
  -- its field pushes (repel) or pulls (attract) WA's own mines and missiles
  -- and opted-in actors across all packs; it triggers the mines it catches. The objects
  -- it moves stay WA's, so their own flight, collisions and fuses run. It is
  -- an object in the oil-drum layer: blasts, guns and fires hit it, and at
  -- 0 health it explodes.
  -- Squares by multiplication: `^` calls the C runtime's pow, whose last bit
  -- may differ between machines.
  local function sq(v) return v * v end

  local shared = require("lib/shared")
  local RANGE2 = 170 * 170           -- MaxRange
  local SYNC2 = RANGE2 // 4          -- MaxSyncRange: MaxRange * 0.25
  local TURNS, HEALTH, LOW_HEALTH = 4, 80, 30
  local BOOM = { id = 100, damage = 50, below = false } -- ExplosionBlast, ExplosionDamage
  -- Not PX's: PX explodes the missiles still in a field 300 frames after the
  -- turn ended, so none circles a magnet for ever. With no way to burst a
  -- stock missile from Lua, the field lets go of them instead, and each ends
  -- on its own fuse or impact. It lets go of the mines then too: a dud mine
  -- (the scheme's) never goes off, and held against a magnet it never comes
  -- to rest either, so WA would wait for it and the turn would never end.
  local RELEASE_AFTER = 300
  -- The grenades that go off only once they stop slow down in a field (PX
  -- damps its Hellish Hand-Grenade there by 0.985 a frame).
  local DAMPED = { ["px.hellish_hand_grenade"] = true }
  local DAMPING = 0.985
  -- Native mine motion, collision response and impact audio; Lua owns policy.
  local RADIUS = 8                   -- conservative planter clearance around the art
  local PLANTER_GRACE = 13           -- 250 ms rounded up at 50 simulation frames/s
  local SINK = (1 / 2)                -- in the water it sinks half a pixel a frame
  local SUNK = 200                -- and is gone this far below the surface
  local BODY = "sprites/electromagnet/"
  local magnets = {}
  local polarity = {} -- worm id -> +1 repel, -1 attract (PX's MagnetPolarity)
  local plus_held = {} -- worm id -> the synchronized + key last frame

  local function trunc(x) return x >= 0 and math.floor(x) or -math.floor(-x) end

  -- PX's TriggerMine: a random-fuse mine gets 1 to 5 seconds; an attracting
  -- magnet sets it close to the longest fuse among the mines it already holds,
  -- so they go off together. Then the mine is armed.
  local function trigger_mine(m, mine, mines)
    local fuse = mine.fuse
    if fuse < 0 then
      fuse = wa.random(1000, 4999)
      if m.pol < 0 then
        local longest = 1000
        for _, other in ipairs(mines) do
          if other.id ~= mine.id then
            local dx, dy = (other.x - m.x), (other.y - m.y)
            if dx * dx + dy * dy < SYNC2 then longest = math.max(longest, other.fuse) end
          end
        end
        if longest > 1000 then fuse = longest + wa.random(-200, 199) end
      end
    end
    mine:arm(fuse)
  end

  -- Force calculation and application belong to the match-wide field service.
  -- The weapon retains PX's mine arming/fuse policy, including its final pulse.
  local function trigger_mines(m)
    if not (m.ended_at and m.age - m.ended_at > RELEASE_AFTER) then
      local mines = wa.mines.all()
      for _, mine in ipairs(mines) do
        if m.field:contains(mine.x, mine.y) then
          trigger_mine(m, mine, mines)
        end
      end
    end
  end

  local function sprite(m)
    local name = m.pol < 0 and "magnet" or "magnet2"
    if m.health <= LOW_HEALTH then name = name .. "_damaged" end
    return BODY .. name .. ".png"
  end

  local function remove(m)
    m.alive = false
    m.field:remove()
    for i, other in ipairs(magnets) do
      if other == m then table.remove(magnets, i); break end
    end
  end

  local function discharge(m)
    if m.turns <= 0 then return end
    trigger_mines(m)
    m.field.enabled = false -- also wakes custom sleepers for one simulation step
    m.turns = 0
  end

  -- Placement correction only: use the inherited native shape to find a clear
  -- point below/along a ceiling. Subsequent motion belongs entirely to WA.
  local function clear_spawn(a)
    if a:fits(a.x, a.y) then return end
    for d = 1, 24 do
      for _, v in ipairs({ {0, 1}, {-1, 1}, {1, 1}, {-1, 0}, {1, 0}, {-1, -1}, {1, -1}, {0, -1} }) do
        local x, y = a.x + v[1] * d, a.y + v[2] * d
        if a:fits(x, y) then a:warp { x = x, y = y }; return end
      end
    end
  end

  -- The same conservative worm clearance used for placed sentry feet, expanded
  -- by the magnet's radius. Keep passage while either end of this move overlaps.
  local function overlaps_planter(x, y, worm)
    return x + RADIUS >= worm.x - 10 and x - RADIUS <= worm.x + 10
      and y + RADIUS >= worm.y - 20 and y - RADIUS <= worm.y + 6
  end

  local function planter_grace(m, a, previous_x, previous_y)
    if not m.planter then return end
    local planter
    for _, worm in ipairs(wa.worms.all()) do
      if worm.id == m.planter_id and worm.hp > 0 then planter = worm; break end
    end
    if not planter or (m.age >= PLANTER_GRACE
      and not overlaps_planter(previous_x, previous_y, planter)
      and not overlaps_planter(m.x, m.y, planter)) then
      a:collision_ignore(m.planter, false)
      m.planter, m.planter_id = nil, nil
    end
  end

  local function frame(m, a)
    m.age = m.age + 1
    local previous_x, previous_y = m.x, m.y
    if not m.sinking then m.x, m.y, m.vx, m.vy = a.x, a.y, a.vx, a.vy end
    if m.y >= wa.world.water() then
      -- In the water: it stops working and sinks out of sight.
      discharge(m)
      if not m.sinking then m.sinking = true; a.hits = {} end
      m.vx, m.vy, m.y = 0, 0, m.y + SINK
      a:warp { x = m.x, y = m.y, vx = 0, vy = 0 }
      if m.y >= wa.world.water() + SUNK then
        remove(m)
        a:despawn()
        return
      end
    end
    if m.health <= 0 then
      trigger_mines(m)
      remove(m)
      a.y = m.y - 20
      a:explode(BOOM)
      a:despawn()
      return
    end
    planter_grace(m, a, previous_x, previous_y)
    if m.turns > 0 then
      -- Settings enter the next step's snapshot. Releasing at age 300 means
      -- the first step without native force is 301, as in the original port.
      m.field.native = not (m.ended_at and m.age - m.ended_at >= RELEASE_AFTER)
      trigger_mines(m)
      m.spark = (m.spark + 0.02) % 1.4
    end
    -- PX's UpdateRotation: spun by its speed, at most half a radian a frame.
    local speed = math.sqrt(sq(m.vx) + sq(m.vy))
    m.angle = m.angle + (m.vx < 0 and -1 or 1) * math.min(0.5, 0.04 * speed)
    local s = sprite(m)
    if s ~= m.sprite then a:look(s); m.sprite = s end
    a:gfx({ angle = math.deg(m.angle + math.pi) % 360, depth = wa.depth.OBJECTS })
  end

  -- PX's TakeExplosionDamage (less the further off: dmg * (1 - (d * d) / (4 (dmg * dmg))))
  -- and TakeDamage (type 10, the Battle Axe's, takes that share of its health).
  local function hit(m, a, event)
    local damage = math.max(0, event.damage or 0)
    if event.kind == "blast" and damage > 0 then
      local dx, dy = (a.x - (event.x or a.x)), (a.y - (event.y or a.y))
      damage = trunc((1 - (dx * dx + dy * dy) / (damage * damage * 4)) * damage)
    elseif event.hit_kind == 10 then
      damage = trunc(m.health * damage / 100)
    end
    if damage > 0 then m.health = m.health - damage end
    local vx, vy = event.vx or 0, event.vy or 0
    if vx ~= 0 or vy ~= 0 then
      a:warp { x = a.x, y = a.y, vx = a.vx + vx, vy = a.vy + vy }
    end
  end

  -- CWorm::FireFinal's Electromagnet: dropped where it is fired (at the
  -- worm), nudged the way the worm faces (0.3) and up (0.15), in the worm's
  -- mode. A script firing it (wa.weapons.fire, the stress test) may choose
  -- the mode with `polarity` (1 repel, -1 attract).
  shared.fires.electromagnet = function(fire)
    local worm = fire.worm
    local pol = (fire.polarity == 1 or fire.polarity == -1) and fire.polarity or polarity[worm.id] or 1
    local m = { pol = pol, turns = TURNS, health = HEALTH, age = 0, angle = 0, spark = 0, alive = true,
      x = fire.x or worm.x, y = fire.y or worm.y,
      vx = worm.vx + (worm.facing < 0 and -1 or 1) * 0.3,
      vy = worm.vy - 0.15 }
    local a = wa.actors.spawn({
      sprite = BODY .. (pol < 0 and "magnet.png" or "magnet2.png"),
      x = m.x, y = m.y, vx = m.vx, vy = m.vy, owner = worm,
      drown = false, body = { physics = "mine" }, on = {
        frame = function(actor) frame(m, actor) end,
        hit = function(actor, event) hit(m, actor, event) end,
      },
    })
    m.a, m.team = a, worm.team
    if a:collision_ignore(worm, true) then m.planter, m.planter_id = worm, worm.id end
    clear_spawn(a)
    m.x, m.y = a.x, a.y
    m.field = wa.magnetism.field({ source = a, range = 170,
      strength = 14000, max_force = 12, softening = pol < 0 and 10 or 5,
      polarity = pol < 0 and "attract" or "repel" })
    m.sprite = sprite(m)
    magnets[#magnets + 1] = m
  end

  -- PX's OnTurnBegin: each start of its owner's team's turn uses one up; the
  -- last wakes and triggers what is in range.
  wa.on.turn_start(function(event)
    local team = event.worm and event.worm.team
    for _, m in ipairs(magnets) do
      m.ended_at = nil
      m.field.native = true
      if m.alive and m.team == team and m.turns > 0 then
        if m.turns == 1 then discharge(m) else m.turns = m.turns - 1 end
      end
    end
  end)

  wa.on.turn_end(function()
    for _, m in ipairs(magnets) do m.ended_at = m.age end
  end)

  -- The Hellish Hand-Grenade slows down in a live field.
  wa.on.missile_frame(function(missile)
    if missile.phase ~= "pre" or not DAMPED[missile.weapon] then return end
    for _, m in ipairs(magnets) do
      if m.field:contains(missile.x, missile.y) then
        missile.vx, missile.vy = missile.vx * DAMPING, missile.vy * DAMPING
        return
      end
    end
  end)

  -- PX switches with WA's bounce keys; here the synchronized + key toggles
  -- the turn's worm between repel and attract, kept per worm. The engine
  -- flips the worm's red/blue magnet by the same rule (worm_sprites_toggle in
  -- the claim), so the two stay in step.
  wa.on.worm_message(function(worm)
    local id = worm.id
    local pressed = worm.turn and worm.weapon == "px.electromagnet" and wa.world.keys().plus_key or false
    if pressed and not plus_held[id] then polarity[id] = -(polarity[id] or 1) end
    plus_held[id] = pressed
  end, { msgs = { wa.msg.FRAME_FINISH } })

  -- The panel's icon shows the turn worm's mode, as the magnet it drops will
  -- be: red attracting (icon 0, PX's), blue repelling (icon 1). Only the
  -- panel changes, so this runs in the HUD hook, every frame; showing the
  -- icon already shown does nothing.
  local icon_shown = true
  local function show_mode_icon(worm)
    if not (icon_shown and wa.weapons.panel_icon and shared.owns("px.electromagnet")) then return end
    local attract = worm and (polarity[worm.id] or 1) < 0
    local ok, err = pcall(wa.weapons.panel_icon, "px.electromagnet", attract and 0 or 1)
    if not ok then
      icon_shown = false -- no icons of ours on the slot: say so once, then leave it
      wa.log("electromagnet: mode icon: " .. tostring(err))
    end
  end

  if wa.on.hud then
    wa.on.hud(function()
      local worm = shared.current_worm()
      show_mode_icon(worm)
    end)
  end
  require("lib/weapon_hint").register("px.electromagnet", function(worm)
    return (polarity[worm.id] or 1) < 0 and "Electromagnet: ATTRACT mode (+ to repel)"
      or "Electromagnet: REPEL mode (+ to attract)"
  end)

  if wa.on.draw and wa.draw.quad then
    -- Refill one spec; the engine copies it before the next submission.
    local QUAD = { blend = "add", points = { {0, 0}, {0, 0}, {0, 0}, {0, 0} } }
    local RING_IN, RING_OUT, SPARKS = BODY .. "ring_in.png", BODY .. "ring_out.png", BODY .. "magnetsparks.png"
    local function square(sprite, frame, color, depth, x, y, h, angle)
      QUAD.sprite, QUAD.frame, QUAD.color, QUAD.depth = sprite, frame, color, depth
      local c, s = wa.math.cos(angle) * h, wa.math.sin(angle) * h
      local p = QUAD.points
      p[1][1], p[1][2] = x - c + s, y - s - c
      p[2][1], p[2][2] = x + c + s, y + s - c
      p[3][1], p[3][2] = x + c - s, y + s + c
      p[4][1], p[4][2] = x - c - s, y - s + c
      wa.draw.quad(QUAD)
    end
    wa.on.draw(function()
      for _, m in ipairs(magnets) do
        if m.alive and m.turns > 0 then
          local x, y = m.x, m.y
          local ring = m.pol < 0 and RING_IN or RING_OUT
          -- PX starts a ring every 65 frames, 5 to 120 pixels, 0.8 a frame:
          -- outwards repelling, inwards attracting, fading as it grows.
          for phase = 0, 2 do
            local t = (m.age - phase * 65) % 195
            local radius = m.pol < 0 and 120 - 0.8 * t or 5 + 0.8 * t
            if radius >= 5 and radius <= 120 then
              local alpha = math.max(0, math.min(255, math.floor((120 - radius) * 255 / 120)))
              square(ring, nil, (alpha << 24) | 0xFFFFFF, wa.depth.OBJECTS + 1, x, y, radius, 0)
            end
          end
          if m.spark <= 1 then
            square(SPARKS, math.min(9, math.floor(m.spark * 10)), nil, wa.depth.OBJECTS - 1, x, y, 13, m.angle)
          end
        end
      end
    end)
  end
end

return weapon
