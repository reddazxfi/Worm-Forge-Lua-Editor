-- Spot Hider: Project X's zone launcher, ported to WormForge by reddaz.

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
    wa.log("Spot Hider: in no panel slot; nothing registered")
    return
  end

  local ART = "sprites/spot_hider/"
  local sb = require("lib/px_sprite_builder")
  local zone = require("lib/px_zone")

  local MASK_TURNS = 4 -- `SpotHiderParams->turns = 4`
  local MASK_SPRITE = 128 -- black_mask.png is a 128 pixel sprite
  local MASK_SCALE = 4 -- `SH_scale = 4`, `scale = SH_scale`
  local MASK_SIZE = MASK_SPRITE * MASK_SCALE
  local MASK_ALPHA = 100 -- `ARGB`: black at 100/255
  local MASK_DEPTH = wa.depth.EFFECTS -- `ZPlane = 4.95`, his nearest plane
  local FADE_FRAMES = 15 * 50 -- `duration = 15` seconds of 50 frames
  local MASK_SHEET = ART .. "mask.png"

  local PULSE_SHEET = ART .. "pulse.png"
  local PULSE_FRAMES = 10 -- `LoadSprite(f, 10, 0)`
  local PULSE_SPEED = 0.75 -- `anim_speed = 0.75`

  local option = function(key, default)
    local v = ctx.option and ctx.option(key)
    if v == nil then return default end
    return v
  end
  local shadow = option("look", "shadow") == "shadow"
  local enemies_only = option("hides_for", "everyone") == "enemies"
  local spread_frames = math.max(1, option("spread_seconds", 4) * 50)
  local OWN_SIDE = 128

  local function opacity(z)
    return 1 - math.min(1, (z.fade or 0) / FADE_FRAMES)
  end

  local REACH = option("radius", MASK_SIZE // 2)
  local INTO_TERRAIN = { depth = 8, falloff = 8 }
  local function shade(z)
    local circle = math.min(REACH, REACH * z.timer // spread_frames)
    local strength = math.floor(255 * opacity(z) + 0.5)
    if circle == z.circle and strength == z.strength then return end
    z.circle, z.strength = circle, strength
    z.actor.light = {
      mode = "dark", circle = circle, reach = REACH, cone = { length = 0 },
      shadow_cast = true, seen_by = "everyone", strength = strength,
      owner_strength = enemies_only and math.floor(OWN_SIDE * opacity(z) + 0.5) or nil,
      without_fog = true,
      into_terrain = INTO_TERRAIN,
      fill = true,
    }
  end

  local placed = {}
  if shadow then
    local HUD = { labels = true, arrow = true, weapon = true, aim = true }
    local BODY = { { 0, 0 }, { -5, 0 }, { 5, 0 }, { 0, -7 }, { 0, 7 } }
    local HALF = 128
    local hidden = {}
    wa.on.draw(function()
      for i = #placed, 1, -1 do
        if (placed[i].fade or 0) >= FADE_FRAMES then table.remove(placed, i) end
      end
      if #placed == 0 and next(hidden) == nil then return end
      local now = {}
      if #placed > 0 then
        for _, w in ipairs(wa.worms.all()) do
          for _, p in ipairs(BODY) do
            if wa.fog.shade(w.x + p[1], w.y + p[2]) > HALF then
              now[w.id] = w
              break
            end
          end
        end
      end
      for id, w in pairs(now) do
        if not hidden[id] then w.hide_hud = HUD end
      end
      for id, w in pairs(hidden) do
        if not now[id] then w.hide_hud = false end
      end
      hidden = now
    end)
  end

  local shooter
  wa.on.worm_message(function(worm)
    if worm.weapon == "px.spot_hider" then shooter = worm end
  end, { msgs = { wa.msg.FIRE_WEAPON } })

  local ZONES = zone.register({
    name = "Spot Hider",
    fade_frames = FADE_FRAMES,
    frame = shadow and shade or nil,
    draw = not shadow and function(z)
      local alpha = math.floor(MASK_ALPHA * opacity(z))
      zone.mark(MASK_SHEET, z.x, z.y, MASK_SIZE, 0,
        alpha << 24, "alpha", MASK_DEPTH, 0)
    end or nil,
  })

  sb.flight(ctx, {
    weapon = "px.spot_hider",
    sheet = PULSE_SHEET,
    anim = "track",
    cyclical = PULSE_FRAMES,
    anim_speed = PULSE_SPEED,
    z = wa.depth.OBJECTS - 1,
    mirror = true,
  })

  local hold = {
    sheet = PULSE_SHEET,
    hand = sb.PX_HANDS[1], -- hand_type 1: the lower hand
    hand_radius = 20.0,
    hand_rotation = 1.0,
    hand_radial_rotation = 1.0,
    hand_scale = 0.8,
    weap_radius = 10.0,
    weap_rotation = -3.0,
    weap_radial_rotation = 0.9,
    frames = 1,
    thrown = true,
    keep_while_firing = false,
  }

  local spec = {
    wep = "weps/spot_hider_wep.wep",
    panel_icon = ART .. "icon.png", -- PX's sh_ico.png
    missile = { sprite = 0 }, -- WA draws no round; the art spec draws it
    worm_sprites = sb.PX_POSTURE,
    hold = hold,
    sprites = shadow and { PULSE_SHEET } or { PULSE_SHEET, MASK_SHEET },
    params = { gpu_prefix = ART },
    on_explode = function(ev)
      local z = ZONES.place(ev.x, ev.y, { turns = MASK_TURNS, owner = shooter })
      if shadow then
        shade(z)
        placed[#placed + 1] = z
      end
    end,
  }
  spec.handling = { ends_turn = true }
  wa.weapons.replace(spec)
end

return M
