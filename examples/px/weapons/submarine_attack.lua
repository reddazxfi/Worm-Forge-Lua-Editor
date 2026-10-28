-- Submarine Attack: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  handling = {
    ends_turn = true,
  },
}

-- PX draws the team's aiming cursor upside down and 20 pixels lower while
-- the weapon is selected (CDDQueue::AddSprite on sprites 32..37).
weapon.defaults = {
  cursor = { flip = true, dy = 20 },
}

local SHEET = "sprites/submarine_attack/submarine.png"
local SUB_SOUND = "sounds/submarine_attack/substrike.wav"
local BOMB_SOUND = "sounds/submarine_attack/substrikem.wav"

function weapon.definition()
  local shared = require("lib/shared")
  return require("lib/weapon").merge(weapon.record, {
    wep = "weps/mine_strike.wep",
    panel_icon = "sprites/submarine_attack/icon.png",
    sprites = { SHEET },
    sounds = { SUB_SOUND, BOMB_SOUND },
    -- Click-only dispatch keeps the strike's cursor, its arrow keys'
    -- direction and its turn handling.
    on_select = { cursor = true },
    on_click = function(ev) shared.submarine_click(ev) end,
  })
end

function weapon.setup()
  -- Highlander: Submarine Attack (PX weapon_substrike: substrike_s.txt, by
  -- rafa``2, on PX's PxAirstrike: pxairstrike/airstrikebase.txt).
  --
  -- A submarine rises out of the deep under the click and, after 120 frames,
  -- fires twenty missiles up out of the water at it, one every three frames.
  -- PX builds it on its airstrike: an invisible plane flies across the map at
  -- the water line, 10 pixels a frame, and the bombs fall due as it passes the
  -- click; the strike is over when the plane leaves the map. So is the
  -- submarine, which fades out from 70 frames into the attack.
  local shared = require("lib/shared")

  local NUM_BOMBS = 20
  local BOMB_DISTANCE = 30
  local FRAMES_BETWEEN = 3
  local PLANE_SPEED = BOMB_DISTANCE // FRAMES_BETWEEN
  local APPEAR_X = 16 -- PxAirstrikeParams.PlaneAppearXOffset
  local BOMB_VX, BOMB_VY = 10, -15 -- BombSpX = 10 * the strike's +-1, BombSpY
  local BEFORE_ATTACK, AFTER_ATTACK = 120, 70
  local SIZE = 104
  local FRAMES = 6
  -- PX's z 2.0: in front of the water, which the submarine rises through.
  local DEPTH = 0x20000
  -- SetColorMod(ARGB(255 - fade, 60, 60, 220), 6): modulation x2 under alpha.
  -- A quad modulates once, so the colour is doubled here (blue tops out).
  local TINT = 0x7878FF

  -- CSubMissile: PX's own missile, WA's air-strike missile with these values.
  -- Fired as WA's Bazooka, whose missile WA builds as PX's CMissile does; the
  -- Submarine Attack's own record is a strike, which builds none.
  local BOMB = {
    sprite = "airmisl", -- 60
    trail = { sprite = "hexhaust", power = 10, speed = 125 }, -- 131
    explosion = { power = 20, push_pct = 100, bias = 15, variation = 0 },
    gravity_pct = 100,
    wind_pct = 0,
    random_motion = 25,
    speed_pct = 100,
    fuse = 10000,
    countdown = 0,
    explode_on_space = false,
    flight_sound = 0, -- substrikem.wav instead
    -- explosion.flags 2+4+8+16+32+64+2048+4096+131072+4194304
    ends_on_contact = {
      land = true, worms = true, worms_frozen = true, crates = true,
      donor_cards = true, objects = true, water = true,
    },
  }

  local subs = {}

  local function sign(n)
    if n > 0 then return 1 elseif n < 0 then return -1 end
    return 0
  end

  -- PxAirstrike's constructor: where the invisible plane starts, and how many
  -- bomb slots it is from the first bomb (bombs fall while 0 < drop <= 20).
  local function plane_start(s, water, width)
    local x = s.tx
    -- Its speed compensation, by how far under the plane (the water) the
    -- click is; always 0 for a click above the water.
    local below = math.max(0, s.ty - water) // 1
    x = x - 3.0 * BOMB_VX * math.sqrt(below)
    local drop = NUM_BOMBS // 2
    x = x - s.dir * BOMB_DISTANCE / 2
    while drop > -10 and ((s.dir == 1 and x > -APPEAR_X) or (s.dir == -1 and x < width + APPEAR_X)) do
      x = x - s.dir * FRAMES_BETWEEN * BOMB_DISTANCE
      drop = drop - 1
    end
    s.plane_x, s.drop, s.counter = x, drop, 0
  end

  -- SubStrike::DropBomb.
  local function drop_bomb(s, a)
    local x = s.tx - 15 * s.dir + sign(wa.random(-10, 10)) * wa.random(0, 15)
    wa.weapons.launch({
      weapon = "stock.bazooka", owner = s.owner, x = x, y = wa.world.water() - 2,
      vx = BOMB_VX * s.dir, vy = BOMB_VY, missile = BOMB,
    })
    wa.sound.play(a, BOMB_SOUND)
  end

  -- PxAirstrike::Message, M_FRAME. False once the plane has left the map.
  local function plane_frame(s, a)
    s.counter = s.counter + 1
    if s.counter >= FRAMES_BETWEEN then
      s.counter = 0
      if s.drop > 0 and s.drop <= NUM_BOMBS then drop_bomb(s, a) end
      s.drop = s.drop + 1
    end
    s.plane_x = s.plane_x + s.dir * PLANE_SPEED
    local width = wa.world.size().w
    return not ((s.dir > 0 and s.plane_x > width + APPEAR_X)
      or (s.dir < 0 and s.plane_x < -APPEAR_X))
  end

  -- SubStrike::Message, M_FRAME, and the submarine's rise from its
  -- M_DRAWQUEUE (PX moves it there, from the frame count alone).
  local function sub_frame(s, a)
    s.tick = s.tick + 1
    if s.before <= 0 then
      if not plane_frame(s, a) then
        subs[s.id] = nil
        a:despawn()
        return
      end
      s.after = s.after - 1
      if s.after <= 0 then s.fade = math.min(255, s.fade + 2) end
    end
    s.before = s.before - 1
    if s.y >= s.water + 40 then
      s.x = s.x0 + s.tick * 0.6 * s.dir
      s.y = s.y0 - 15.0 * math.sqrt(s.tick * 1.25)
    end
  end

  shared.submarine_click = function(ev)
    local water = wa.world.water()
    -- From the left unless the strike's x speed, which WA's arrow keys set,
    -- is negative (PxAirstrike: Direction = Desc->SpX).
    local dir = (ev.vx or 0) < 0 and -1 or 1
    local s = { tx = ev.x, ty = ev.y, dir = dir, owner = ev.worm, water = water,
      tick = 0, before = BEFORE_ATTACK, after = AFTER_ATTACK, fade = 0 }
    s.x0, s.y0 = ev.x - 125 * dir, water + 220
    s.x, s.y = s.x0, s.y0
    plane_start(s, water, wa.world.size().w)
    local a = wa.actors.spawn({
      sprite = false, gravity = false, collide = false,
      owner = ev.worm, x = ev.x, y = ev.y, on = function(a) sub_frame(s, a) end,
    })
    s.id = a.id
    subs[s.id] = s
    wa.sound.play(a, SUB_SOUND)
  end

  local CORNERS = { { -1, -1 }, { 1, -1 }, { 1, 1 }, { -1, 1 } }
  -- AddSpriteEx(2.0, x, y, sprite, tick * 0.025, 0.75 * pi/4 * dir, 1.0):
  -- the sheet mirrored for a strike from the right (+0x40000), tilted toward
  -- where it is going, its 6 frames once every 40 frames.
  local ROT = math.pi / 4 * 0.75
  if wa.on.draw and wa.draw.quad then
    wa.on.draw(function()
      for _, s in pairs(subs) do
        local rot = ROT * s.dir
        local c, sn = math.cos(rot), math.sin(rot)
        local h = SIZE / 2
        local points = {}
        for i, p in ipairs(CORNERS) do
          local px, py = p[1] * s.dir, p[2]
          points[i] = { s.x + h * (px * c - py * sn), s.y + h * (px * sn + py * c) }
        end
        local phase = (s.tick * 0.025) % 1
        wa.draw.quad({ sprite = SHEET, points = points, frame = math.floor(phase * FRAMES),
          color = ((255 - s.fade) << 24) | TINT, depth = DEPTH, blend = "alpha" })
      end
    end)
  end
end

return weapon
