-- Floating damage and heal numbers, Worms Reloaded type shyt.
-- This script only reads DMG Done and draws it on screen.

local GLYPH_H = 12
-- 1 point -> 0.70, 80+ -> 1.20.
local MIN_SCALE = 0.80
local MAX_SCALE = 1.22
local MAX_SCALE_DAMAGE = 80
local GLYPH_GAP = 1.0
local DAMAGE_LIFE = 80
local DAMAGE_FADE = 24
local HEAL_LIFE = 64
local HEAL_FADE = 28
local DAMAGE_VY = -2.45
local DAMAGE_GRAVITY = 0.15
local SIDE_VX = 0.55
local HEAL_VY = -0.42
local HEAL_SIDE_VX = 0.18
local RED_AT = 40
local START_ABOVE = 18
local START_SIDE = 6
-- alternate: flip per worm; random: local LCG below.
local SIDE_MODES = { alternate = true, facing = true, random = true }

local ORANGE = { 255, 160, 32 }
local RED = { 255, 48, 16 }
local HEAL = { 80, 255, 112 }

-- Cropped widths; every glyph is GLYPH_H tall.
local WIDTH = {
  [0] = 11, [1] = 10, [2] = 11, [3] = 12, [4] = 12,
  [5] = 11, [6] = 12, [7] = 11, [8] = 11, [9] = 12,
}
-- 6px glyph + 1 blank column; a 6x12 image loads as two 6x6 frames.
local BANG_WIDTH = 7

local SPRITE = {
  [0] = "sprites/damage_numbers/d0.png",
  [1] = "sprites/damage_numbers/d1.png",
  [2] = "sprites/damage_numbers/d2.png",
  [3] = "sprites/damage_numbers/d3.png",
  [4] = "sprites/damage_numbers/d4.png",
  [5] = "sprites/damage_numbers/d5.png",
  [6] = "sprites/damage_numbers/d6.png",
  [7] = "sprites/damage_numbers/d7.png",
  [8] = "sprites/damage_numbers/d8.png",
  [9] = "sprites/damage_numbers/d9.png",
  bang = "sprites/damage_numbers/bang.png",
}
local SPRITE_PATHS = {
  SPRITE[0], SPRITE[1], SPRITE[2], SPRITE[3], SPRITE[4], SPRITE[5],
  SPRITE[6], SPRITE[7], SPRITE[8], SPRITE[9], SPRITE.bang,
}

local function rgb(r, g, b)
  return (r << 16) | (g << 8) | b
end

local ORANGE_RGB = rgb(ORANGE[1], ORANGE[2], ORANGE[3])
local RED_RGB = rgb(RED[1], RED[2], RED[3])
local HEAL_RGB = rgb(HEAL[1], HEAL[2], HEAL[3])

local function amount_scale(amount)
  local t = (amount - 1) / (MAX_SCALE_DAMAGE - 1)
  if t < 0 then t = 0 elseif t > 1 then t = 1 end
  return MIN_SCALE + (MAX_SCALE - MIN_SCALE) * t
end

local function damage_rgb(damage)
  local t = (damage - 5) / (RED_AT - 5)
  if t < 0 then t = 0 elseif t > 1 then t = 1 end
  return rgb(
    math.floor(ORANGE[1] + (RED[1] - ORANGE[1]) * t + 0.5),
    math.floor(ORANGE[2] + (RED[2] - ORANGE[2]) * t + 0.5),
    math.floor(ORANGE[3] + (RED[3] - ORANGE[3]) * t + 0.5))
end

local function text_glyphs(amount, kind, art)
  local text = tostring(amount)
  if kind == "damage" then
    if amount >= 75 then
      text = text .. "!!"
    elseif amount >= 55 then
      text = text .. "!"
    end
  end
  local glyphs = {}
  for i = 1, #text do
    local byte = text:byte(i)
    if byte == 33 then
      glyphs[#glyphs + 1] = art.bang
    else
      glyphs[#glyphs + 1] = art[byte - 48]
    end
  end
  return glyphs
end

-- wa.draw.quad copies its table, so one spec can be reused.
local QUAD = {
  points = { { 0, 0 }, { 0, 0 }, { 0, 0 }, { 0, 0 } },
  sprite = "", color = 0xFFFFFFFF, blend = "alpha", depth = wa.depth.FRONT,
}

local function draw_glyphs(glyphs, x, y, scale, alpha, colour)
  local width = -GLYPH_GAP
  for i = 1, #glyphs do
    width = width + glyphs[i].w + GLYPH_GAP
  end
  width = width * scale
  local left = x - width / 2
  local top = y - GLYPH_H * scale / 2
  local bottom = top + GLYPH_H * scale
  local points = QUAD.points
  for i = 1, #glyphs do
    local glyph = glyphs[i]
    local right = left + glyph.w * scale
    points[1][1], points[1][2] = left, top
    points[2][1], points[2][2] = right, top
    points[3][1], points[3][2] = right, bottom
    points[4][1], points[4][2] = left, bottom
    QUAD.sprite = glyph.sprite
    QUAD.color = (alpha << 24) | colour
    wa.draw.quad(QUAD)
    left = right + GLYPH_GAP * scale
  end
end

local function pop_scale(age, base)
  if age >= 4 then
    return base
  end
  local grow = base * (0.7 + 0.3 * age / 4)
  return grow < MIN_SCALE and MIN_SCALE or grow
end

local function draw_popup(popup, age)
  local damage = popup.kind == "damage"
  local life = damage and DAMAGE_LIFE or HEAL_LIFE
  local fade = damage and DAMAGE_FADE or HEAL_FADE
  local remaining = life - age
  local alpha = 255
  if remaining < fade then
    alpha = math.floor(255 * remaining / fade + 0.5)
    if alpha < 0 then alpha = 0 end
  end
  local x = popup.x + popup.vx * age
  local y
  if damage then
    y = popup.y + popup.vy * age + 0.5 * DAMAGE_GRAVITY * age * age
  else
    y = popup.y + popup.vy * age
  end
  draw_glyphs(popup.glyphs, x, y, pop_scale(age, popup.scale), alpha, popup.colour)
end

return function(cfg)
  local side_mode = cfg and cfg.side or "alternate"
  if not SIDE_MODES[side_mode] then
    side_mode = "alternate"
  end

  local art = {}
  for digit = 0, 9 do
    art[digit] = { sprite = wa.sprites.key(SPRITE[digit]), w = WIDTH[digit] }
  end
  art.bang = { sprite = wa.sprites.key(SPRITE.bang), w = BANG_WIDTH }

  wa.assets.load({
    sprites = SPRITE_PATHS,
    gpu_prefix = "sprites/damage_numbers/",
  })

  local last_hp = {}
  local pending_one = {}
  local last_side = {}
  local popups = {}
  local spawned = false
  local rng = 0x9E3779B9

  -- Local LCG: a cosmetic roll must not advance WA's shared RNG.
  local function next_rng()
    rng = (rng * 1103515245 + 12345) % 0x80000000
    return rng
  end

  local function side_for(worm, damage)
    local facing = (worm.facing and worm.facing < 0) and -1 or 1
    -- Heals don't use up an alternate turn or a random draw.
    if not damage or side_mode == "facing" then
      return facing
    end
    if side_mode == "random" then
      next_rng()
      return (rng % 2 == 0) and -1 or 1
    end
    local last = last_side[worm.id]
    local side = last and -last or facing
    last_side[worm.id] = side
    return side
  end

  local function add_popup(kind, amount, subject, frame)
    local damage = kind == "damage"
    local side = side_for(subject, damage)
    popups[#popups + 1] = {
      kind = kind,
      born = frame,
      x = subject.x + side * START_SIDE,
      y = subject.y - START_ABOVE,
      vx = side * (damage and SIDE_VX or HEAL_SIDE_VX),
      vy = damage and DAMAGE_VY or HEAL_VY,
      glyphs = text_glyphs(amount, kind, art),
      scale = amount_scale(amount),
      colour = damage and damage_rgb(amount) or HEAL_RGB,
    }
  end

  -- Diff at frame finish; a 1-point drop is held so Live HP's pulse nets out.
  local function observe()
    local frame = wa.world.frame()
    if not frame then return end
    for _, worm in ipairs(wa.worms.all()) do
      local hp = worm.hp
      local last = last_hp[worm.id]
      if last ~= nil then
        local diff = hp - last
        local held = pending_one[worm.id]
        if held then
          if diff == 1 then
            -- Pulse healed it back.
            pending_one[worm.id] = nil
            diff = 0
          else
            -- Real hit after all.
            add_popup("damage", 1, held, frame)
            pending_one[worm.id] = nil
          end
        end
        if diff < 0 then
          local amount = -diff
          if amount == 1 and hp > 0 then
            pending_one[worm.id] = {
              id = worm.id, x = worm.x, y = worm.y, facing = worm.facing,
            }
          else
            add_popup("damage", amount, worm, frame)
          end
        elseif diff > 0 then
          add_popup("heal", diff, worm, frame)
        end
      end
      -- A revive starts fresh, so it isn't printed as one big heal.
      last_hp[worm.id] = hp > 0 and hp or nil
    end
  end

  wa.on.worm_message(function(worm)
    if spawned then return end
    spawned = true
    wa.actors.spawn({
      sprite = false, x = 0, y = 0, gravity = false, collide = false,
      owner = worm,
      on = observe,
    })
  end, { msgs = { wa.msg.FRAME_FINISH } })

  wa.on.draw(function()
    local frame = wa.world.frame()
    if not frame then return end
    local live = {}
    for i = 1, #popups do
      local popup = popups[i]
      local age = frame - popup.born
      local life = popup.kind == "damage" and DAMAGE_LIFE or HEAL_LIFE
      if age >= 0 and age < life then
        live[#live + 1] = popup
        draw_popup(popup, age)
      end
    end
    popups = live
  end)

  wa.log("damage numbers: side " .. side_mode)
end
