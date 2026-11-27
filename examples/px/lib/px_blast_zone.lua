-- Blast Zone: Project X's zone launcher, ported to WormBench.

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

  local TURNS_MIN, TURNS_MAX = 2, 6 -- the 1..5 keys give 2..6 turns
  local TURNS_DEFAULT = 3 -- `BlastTurns = 3`
  local FPS = 5 -- `fps = 5`: a tick every 0.1 s
  local RADIUS = 22.5 -- `CWZone(x, y, 45, 45, ...)`
  local PUSH, DAMAGE = 30, 30 -- `CBlast(number, x, y, 30, 30, ...)`
  local MINE_FUSE_MIN, MINE_FUSE_MAX = 1000, 4999

  local EXP_FRAMES = 10
  local EXP_SPEED = 35 -- normalized phase increment = speed/1000 per frame
  local EXP_SIZE = 75
  local ROTATIONS = { math.pi / 2, math.pi / 4, -math.pi / 4 }
  local EXP_DEPTH = wa.depth.WORMS + 1

  local TEAM_COLOURS = {
    [1] = 0x55D21400, [2] = 0x550014DC, [3] = 0x5500DC00,
    [4] = 0x55FADC00, [5] = 0x55DC00DC, [6] = 0x5500E6E6,
  }

  local turns = TURNS_DEFAULT
  local digit_held

  local shooter

  local function boom(z, obj)
    local b = wa.actors.spawn({
      sprite = false, x = z.x, y = z.y, owner = z.owner, on = function() end,
    })
    b:explode({ damage = DAMAGE, id = PUSH, below = false })
    if not b.dead then b:remove() end
    if obj.kind == "mine" then
      local fuse = obj.fuse
      if not fuse or fuse < 0 then fuse = wa.random(MINE_FUSE_MIN, MINE_FUSE_MAX) end
      obj:arm(fuse)
    end
  end

  local function animate(z)
    z.frame = fx.frame(z.timer, EXP_SPEED, EXP_FRAMES)
  end

  local EXP_SHEET = ART .. "exp.png"
  local ZONES = zone.register({
    name = "Blast Zone",
    fps = FPS,
    radius = RADIUS,
    half_height = RADIUS,
    kinds = { worm = true, oil = true, mine = true, crate = true, arrow = true, missile = true },
    one_shot = true,
    every_crate = DAMAGE,
    fade_frames = fx.FADE,
    frame = animate,
    tick = boom,
    draw = function(z)
      local colour = fx.faded(TEAM_COLOURS[(z.colour or 0) + 1] or TEAM_COLOURS[1], z)
      for _, angle in ipairs(ROTATIONS) do
        for _ = 1, 3 do
          zone.mark(EXP_SHEET, z.x, z.y, EXP_SIZE, angle, colour, "add", EXP_DEPTH, z.frame)
        end
      end
    end,
  })

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
    return "Blast Zone: explodes for " .. turns .. " turns\n1-5: turns"
  end)

  fx.flight("px.blast_zone")
  sb.flight(ctx, {
    weapon = "px.blast_zone",
    sheet = ART .. "bullet.png",
    anim = "track",
    z = wa.depth.OBJECTS - 1,
    mirror = true,
    owner = shooter,
  })

  local hold = {
    sheet = ART .. "hold.png",
    hand = sb.PX_HANDS[3], -- hand_type 3: the upper hand
    hand_radius = 4.0,
    hand_rotation = 0.5,
    hand_radial_rotation = 0.0,
    hand_scale = 0.8,
    frames = 1, -- one bomb, turned by the engine's hold to the aim
    thrown = true,
    keep_while_firing = false,
  }

  local spec = {
    wep = "weps/blast_zone_wep.wep",
    panel_icon = ART .. "icon.png", -- PX's bz_ico.png
    missile = { sprite = 0 }, -- WA draws no round; the art spec draws it
    worm_sprites = sb.PX_POSTURE,
    hold = hold,
    sprites = { ART .. "bullet.png", ART .. "exp.png" },
    params = { gpu_prefix = ART },
    on_explode = function(ev)
      ZONES.place(ev.x, ev.y, {
        turns = turns, owner = shooter,
        colour = shooter and shooter.alliance or 0,
        frame = 0,
      })
    end,
  }
  spec.handling = { ends_turn = true }
  wa.weapons.replace(spec)
end

return M
