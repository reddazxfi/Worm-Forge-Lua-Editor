-- Swim Suit: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.laser_sight",
    name = "Swim Suit",
    panel_icon = "sprites/swim_suit/ico_swimsuit.png",
    sprites = { "sprites/swim_suit/swim.png", "sprites/swim_suit/float.png", "sprites/swim_suit/ring.png" },
    sounds = { "sounds/swim_suit/putting_on_ssuit.wav" },
    params = { gpu_prefix = "sprites/swim_suit/" },
  })
end

weapon.requires = { "weapons/helicopter", "weapons/sniper_rifle" }

function weapon.setup()
  local shared = require("lib/shared")
  local current_worm = shared.current_worm
  local held = shared.held
  local trunc = shared.trunc

  -- --------------------------------------------------------------- Swim Suit
  do
  --
  -- PX's swimsuit_SCRIPT (StepS; swim sprites by Team17) with fastswim_SCRIPT
  -- and swim_suit_diving_s (PyroMan), on WA's laser sight. Using it puts the
  -- suit on (or, out of the water, takes it off): WA's laser sight never
  -- switches on, as PX's FireFinal never calls super. A worm in the suit that
  -- falls into the water splashes and swims instead of drowning: the pack takes
  -- it (worm:take) and moves it by its own four keys (up to 2.5 pixels a frame
  -- times the swim speed, gliding to a stop when they are let go), stopping at
  -- land, turned by left and right unless Shift is held. Enter and weapons do
  -- nothing while it swims (Fast Walk aside). Out of the water it is released
  -- as from a jump. Too deep (180 pixels under the water, or the bottom of a
  -- cavern), knocked flying, or still in the water when the turn ends, the
  -- suit gives out and it drowns. Fast Walk switches the swim speed between 2
  -- and 6 for the turn. Missiles in the water can hit a swimming worm: they
  -- blow up on it (damage 100, blast 50).
  --
  -- A worm in the suit falling to the water dives (swim_suit_diving_s, by
  -- PyroMan): where WA would take its control (falling at 8 pixels a frame,
  -- WA's fall height, 0x50D370), the rest of its fall is traced frame by frame
  -- at WA's gravity (wa.land.trace, worm:fits); if it ends in the water, the
  -- pack takes the worm (worm:take) and carries it down that path to the
  -- splash, so it reaches the water in control. PX's looked straight down and
  -- held the worm in a state.
  --
  -- Drawn in the worm's place: the swim or, when still, the float animation,
  -- and a bubble around the worm while it wears the suit.
  --
  -- Not ported: PX's ghost jet and battyswim interplay (other libraries), the
  -- Ninja Rope workaround after leaving the water (the Jump is on the rope's
  -- slot here), inverted controls, and the team message on putting it on.

  local SWIM_CAP = 2.5          -- pixels a frame, times the swim speed
  local SWIM_PUSH = 0.1
  local SWIM_DRAG = 1.05
  local SWIM_STILL = 0.05
  local SWIM_FLOAT_STEP = 0.0099
  local SWIM_DEPTH = 180        -- how far under the water the suit holds
  local SWIM_SUIT_MASK = 134342 -- 0x20CC6: the worm's 0x420CC6 without SWIM_WATER
  -- Bit 22 of a collision mask: WA's water acts on what has it (0x4FDE20), and
  -- sinks or drowns it. The suit takes it off; a missile sinking in the water
  -- has only it.
  local SWIM_WATER = 0x400000
  local SWIM_MISSILE_MASK = 0x40007C -- a missile in the water that hits worms
  local SWIM_SPLASH = 57        -- WA's sound
  local SWIM_BODY_DEPTH = wa.depth.FRONT
  local SWIM_RING_DEPTH = wa.depth.FRONT + 1
  -- Ring sheet is 50×50; wa.draw.quad corners are centred on the worm like a:gfx.
  local SWIM_RING_HALF = 25
  -- The land a swimmer stops at: its body, 4 pixels either side, 6 above and below.
  local SWIM_HALF_W, SWIM_HALF_H = 4, 6

  -- The dive: WA takes a falling worm's control at 8 pixels a frame; taken
  -- a frame early.
  local DIVE_SPEED = 8
  local DIVE_FRAMES = 2000      -- the longest fall traced
  -- WA's states for a worm falling under its own control: jumping, its fall,
  -- falling (off a cliff, or let go).
  local FALLING = { [0x79] = true, [0x7A] = true, [0x7E] = true }

  local swim_speed = 2          -- fastswim: Fast Walk switches 2 and 6
  local swim_in_game = false    -- SwimInGame: someone has worn the suit
  local swimmers = {} -- worm id -> { suit, plopready, plopped, floating, plophase, flophase, fmult, keys, body, x, y, vx, vy, dive, dived }

  local function swimmer_of(worm)
    local s = swimmers[worm.id]
    if not s then
      s = { suit = false, plopready = false, plopped = false, floating = false,
        plophase = 0, flophase = 0, fmult = 5, keys = {} }
      swimmers[worm.id] = s
    end
    return s
  end

  local function swim_drop_art(worm, s)
    if s.body then s.body:despawn(); s.body = nil end
    worm.body_visible = true
  end

  -- The suit comes off, the water's bit back in its mask. `sink`: it gave out
  -- in the water, and the worm goes back to WA out of control, moving at
  -- (vx, vy), for WA to drown.
  local function suit_off(worm, s, sink, vx, vy)
    s.suit, s.plopready, s.plopped, s.floating = false, false, false, false
    swim_drop_art(worm, s)
    if sink then
      worm:release(vx, vy, { tumble = true })
    end
    worm.collision_mask = worm.collision_mask | SWIM_WATER
  end

  -- PX's icy oil drum takes a suited worm's Swim Suit off before it freezes
  -- it (icybarrel_logic.txt fires the Swim Suit, which toggles it).
  shared.swim_suit_off = function(worm)
    local s = swimmers[worm.id]
    if s and s.suit then suit_off(worm, s, false) end
  end

  local function swim_blocked(x, y)
    return wa.land.solid(x - SWIM_HALF_W, y) or wa.land.solid(x + SWIM_HALF_W, y)
      or wa.land.solid(x, y - SWIM_HALF_H) or wa.land.solid(x, y + SWIM_HALF_H)
  end

  -- One step towards the cap on a held key, as PX's: while under it, a push;
  -- past it, back to it.
  local function swim_push(v, dir, cap)
    if dir > 0 then
      if v < cap then return v + SWIM_PUSH * swim_speed end
      return cap
    end
    if v > -cap then return v - SWIM_PUSH * swim_speed end
    return -cap
  end

  -- WA's states for a worm knocked flying: tumbling, hit, blasted.
  local KNOCKED = { [0x7F] = true, [0x80] = true, [0x81] = true }

  -- One frame of a dive: gravity and wind as WA scales them for the worm, then
  -- the move, its centre traced through the land and the worm's shape tested
  -- where it ends (WA's own test, worm:fits). Returns the new speed and
  -- position, and whether land stops it, in which case the position is where
  -- it still was.
  local function dive_step(worm, x, y, vx, vy)
    vx = vx + wa.world.wind() * (worm.wind or 0)
    vy = vy + wa.world.gravity() * (worm.gravity or 1)
    local nx, ny = x + vx, y + vy
    if wa.land.trace(x, y, nx, ny) or not worm:fits(nx, ny) then
      return vx, vy, x, y, true
    end
    return vx, vy, nx, ny, false
  end

  -- Whether a fall from (x, y) at (vx, vy) reaches the water before land.
  local function dives_into_water(worm, x, y, vx, vy, water)
    for _ = 1, DIVE_FRAMES do
      local blocked
      vx, vy, x, y, blocked = dive_step(worm, x, y, vx, vy)
      if blocked then return false end
      if y >= water then return true end
    end
    return false
  end

  local function swim_frame(worm)
    local s = swimmers[worm.id]
    if not s or not s.suit then
      return
    end
    local water = wa.world.water()
    local cap = SWIM_CAP * swim_speed
    if s.dive and not worm.taken then
      -- The engine let go mid-dive: the turn ended, or WA knocked it flying.
      s.dive = nil
    end
    if not FALLING[worm.state_id] and not s.dive then
      s.dived = false -- landed, or out of its fall: the next fall is looked at
    end
    if s.plopready and not s.dive and not s.dived and worm.turn and FALLING[worm.state_id]
      and worm.y < water
      and worm.vy + 2 * wa.world.gravity() * (worm.gravity or 1) >= DIVE_SPEED then
      -- About to lose control: one look at where the fall ends.
      s.dived = true
      if dives_into_water(worm, worm.x, worm.y, worm.vx, worm.vy, water) then
        s.dive = { x = worm.x, y = worm.y, vx = worm.vx, vy = worm.vy }
        worm:take{ turn = "run" }
      end
    end
    local dive_into
    if s.dive then
      local d = s.dive
      local blocked
      d.vx, d.vy, d.x, d.y, blocked = dive_step(worm, d.x, d.y, d.vx, d.vy)
      if blocked then
        -- Land where the trace found none (it changed): WA's again, as it flies.
        s.dive = nil
        worm.x, worm.y = d.x, d.y
        worm:release(d.vx, d.vy)
        return
      end
      worm:carry(d.x, d.y)
      if d.y < water then
        return
      end
      s.dive, dive_into = nil, d
    end
    if worm.y >= water and s.plopready and KNOCKED[worm.state_id] then
      -- Knocked flying into the water: no swim, the suit gives out, and with
      -- the water's bit back WA's water takes it. Held in WA's hit state
      -- without the bit, it never settled and the next turn never came.
      suit_off(worm, s, false)
      return
    end
    if dive_into or worm.y >= water and s.plopready and worm.state ~= "teleporting" then
      -- Into the water: where a dive reached it, at the dive's speed.
      local d = dive_into or worm
      wa.sound.play(worm, SWIM_SPLASH)
      s.plopready, s.plopped = false, true
      s.x, s.y = d.x, d.y
      s.vx, s.vy = math.min(d.vx, cap), math.min(d.vy, cap)
      -- Swimming, it fires nothing but Fast Walk (its swim speed); the suit's
      -- own use is this pack's hook.
      worm:take{ turn = "run", fire = { "stock.fast_walk" } }
      s.plophase = 0
    end
    if s.plopped and not worm.taken then
      -- The engine let go: the turn ended, or WA knocked it flying. Still in
      -- the water, the suit gives out.
      suit_off(worm, s, true, worm.vx, worm.vy)
      return
    end
    if s.plopped then
      local vx, vy = math.min(s.vx, cap), math.min(s.vy, cap)
      local held = s.keys
      local still = math.abs(vx) <= SWIM_STILL * swim_speed and math.abs(vy) <= SWIM_STILL * swim_speed
      if still and not (held.left or held.up or held.down or held.right) then
        -- Floating: the float animation, back and forth.
        s.floating = true
        s.flophase = s.flophase + SWIM_FLOAT_STEP * s.fmult
        if s.flophase >= 0.99 and s.fmult == 5 then
          s.flophase, s.fmult = 0.99, -5
        elseif s.flophase <= 0 and s.fmult == -5 then
          s.flophase, s.fmult = 0, 5
        end
      elseif vx ~= 0 and vy ~= 0 then
        -- Swimming: the stroke follows the faster of the two directions.
        s.floating = false
        if math.abs(vx) >= math.abs(vy) then
          s.plophase = s.plophase + SWIM_FLOAT_STEP * vx * worm.facing
        else
          s.plophase = s.plophase - SWIM_FLOAT_STEP * vy
        end
      elseif vx ~= 0 then
        s.floating = false
        s.plophase = s.plophase + SWIM_FLOAT_STEP * vx
      elseif vy ~= 0 then
        s.floating = false
        s.plophase = s.plophase - SWIM_FLOAT_STEP * vy
      end
      if s.plophase >= 1 or s.plophase <= -1 then
        s.plophase = 0
      end
      local k = worm.keys
      local up, down, left, right = k.up, k.down, k.left, k.right
      if up == down then vy = vy / SWIM_DRAG end
      if left == right then vx = vx / SWIM_DRAG end
      if up then vy = swim_push(vy, -1, cap) end
      if down then vy = swim_push(vy, 1, cap) end
      local shift = wa.world.keys().shift
      if left then
        if not shift then worm.facing = -1 end
        vx = swim_push(vx, -1, cap)
      end
      if right then
        if not shift then worm.facing = 1 end
        vx = swim_push(vx, 1, cap)
      end
      s.keys = { up = up, down = down, left = left, right = right }
      -- The engine clears the keys after this hook. Move, stopping at land
      -- on each axis (unless it is already in land, so it can swim free).
      local stuck = swim_blocked(s.x, s.y)
      local nx = s.x + vx
      if not stuck and swim_blocked(nx, s.y) then vx = 0 else s.x = nx end
      local ny = s.y + vy
      if not stuck and swim_blocked(s.x, ny) then vy = 0 else s.y = ny end
      s.vx, s.vy = vx, vy
      -- Out of the water: on through the air, as from a jump.
      if s.y < water then
        s.floating = false
        s.plopready, s.plopped = true, false
        -- Where the swim took it: its last pin is still under the surface.
        worm.x, worm.y = s.x, s.y
        worm:release(vx, vy)
      else
        worm:carry(s.x, s.y)
        -- Too deep: the suit gives out.
        local y, w = s.y, water
        local deep
        if not wa.world.cavern() then
          deep = y > w + SWIM_DEPTH
        elseif w > 610 then
          deep = y > w + SWIM_DEPTH
        else
          deep = y > 768
        end
        if deep then
          suit_off(worm, s, true, vx, vy)
          return
        end
      end
    end
    -- Between turns, a worm out of the water takes the suit off.
    if not current_worm() and worm.y < water then
      suit_off(worm, s, false)
      return
    end
    -- RenderWorm: in the water, the swim or float animation in the worm's
    -- place (its art faces left). The bubble is drawn at render time below.
    local function art(sheet)
      return wa.actors.spawn({
        sprite = sheet, x = worm.x, y = worm.y, gravity = false,
        collide = false, owner = worm, visibility = worm, on = function() end,
      })
    end
    if s.plopped then
      local sheet = s.floating and "sprites/swim_suit/float.png" or "sprites/swim_suit/swim.png"
      if s.body and s.body_sheet ~= sheet then
        s.body:despawn()
        s.body = nil
      end
      s.body = s.body or art(sheet)
      s.body_sheet = sheet
      local phase = s.floating and s.flophase or s.plophase
      s.body.x, s.body.y, s.body.vx, s.body.vy = s.x, s.y, 0, 0
      s.body.facing = -worm.facing
      s.body:frame(math.floor((phase % 1) * 20) % 20)
      s.body:gfx({ depth = SWIM_BODY_DEPTH })
      worm.body_visible = false
    elseif s.body then
      s.body:despawn()
      s.body = nil
      worm.body_visible = true
    end
  end

  -- Bubble while the suit is worn: draw-only, from the live worm position each
  -- rendered frame (keeps the subpixel fraction). A follower LuaActor + a:gfx was
  -- pixel-snapped and could wobble when airborne.
  if wa.on.draw then
    wa.on.draw(function()
      for _, worm in ipairs(wa.worms.all()) do
        local s = swimmers[worm.id]
        if s and s.suit then
          local x, y, h = worm.x, worm.y, SWIM_RING_HALF
          wa.draw.quad({
            points = {
              { x - h, y - h }, { x + h, y - h }, { x + h, y + h }, { x - h, y + h },
            },
            sprite = "sprites/swim_suit/ring.png",
            visibility = worm,
            depth = SWIM_RING_DEPTH,
          })
        end
      end
    end)
  end

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FRAME_FINISH then
      swim_frame(worm)
    elseif msg == wa.msg.JUMP then
      -- M_ENTER: no jumping while it swims.
      local s = swimmers[worm.id]
      if s and s.plopped then
        return "eat"
      end
    elseif msg == wa.msg.FIRE_WEAPON then
      local s = swimmers[worm.id]
      if s and s.plopped and worm.weapon ~= "stock.fast_walk" then
        return "eat" -- no weapons while it swims
      end
      if worm.weapon == "stock.fast_walk" then
        swim_speed = swim_speed ~= 6 and 6 or 2
      elseif worm.weapon == "px.swim_suit" then
        -- FireFinal(Swim Suit), in place of WA's laser sight.
        local s = swimmer_of(worm)
        if not s.suit then
          wa.sound.play(worm, "sounds/swim_suit/putting_on_ssuit.wav")
          s.suit, s.plopready = true, true
          swim_in_game = true
          worm.collision_mask = SWIM_SUIT_MASK
        elseif worm.y < wa.world.water() then
          suit_off(worm, s, false)
        end
        worm:ammo("px.swim_suit", -1)
        return "eat"
      end
    end
  end, { msgs = { wa.msg.FRAME_FINISH, wa.msg.JUMP, wa.msg.FIRE_WEAPON } })

  -- fastswim: the swim speed is 2 again every turn.
  wa.on.turn_start(function()
    swim_speed = 2
  end)

  -- A missile in the water hits worms too, once anyone has worn the suit.
  wa.on.missile_frame(function(m)
    if swim_in_game and m.phase == "pre" and m.collision_mask == SWIM_WATER then
      m.collision_mask = SWIM_MISSILE_MASK
    end
  end)

  -- CMissile::Collide: such a missile blows up on a swimming worm, and is gone
  -- (sent below the water, where WA frees it).
  if wa.on.contact then
    wa.on.contact(function(worm, other)
      local s = swimmers[worm.id]
      if s and s.plopped and other.kind == "missile" then
        wa.actors.spawn({
          sprite = false, x = other.x, y = other.y, gravity = false, collide = false,
          owner = worm, explode = { damage = 100, id = 50, now = true },
        })
        other.y = wa.world.water() + 4096
      end
    end)
  end
  end
end

return weapon
