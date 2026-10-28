local cursor = require("lib/cursor")
local MODES = {
  { name = "Light", hint = "terrain-blocked light" },
  { name = "Magnet attract", hint = "300 px range" },
  { name = "Magnet repel", hint = "300 px range" },
  { name = "Revive", hint = "click a gravestone" },
  { name = "Freeze", hint = "click a worm" },
  { name = "Fire", hint = "hold left mouse for rainbow fire" },
  { name = "Hurt", hint = "click a worm: 10 HP damage" },
}
local RAINBOW = { 0xFF2A2A, 0xFF8C1A, 0xFFE81A, 0x3CFF4A, 0x2E8CFF, 0x8A3CFF, 0xFF3CD2 }

return {
  defaults = { ammo = { round_start = -1 }, delay = 0 },
  install = function(ctx)
    local field
    local remembered = {} -- Stable worm IDs; each worm keeps its own mode.
    local mode, plus_held = 1, false
    local hint_dirty = false
    local next_fire, colour, ready_at, waiting_release = 0, 0, 0, true

    local function clear(a)
      if field then field:remove(); field = nil end
      if a then a.light = false end
    end
    local function apply(a)
      clear(a)
      if mode == 1 then
        a.light = {
          mode = "light", circle = 300, cone = { length = 0 },
          shadow_cast = true, seen_by = "owner", discover = false,
        }
      elseif mode == 2 or mode == 3 then
        field = wa.magnetism.field{
          source = a, range = 300, strength = 14000, max_force = 12,
          polarity = mode == 2 and "attract" or "repel",
          softening = mode == 2 and 10 or 5,
        }
      elseif mode == 6 then
        -- Round 50 ms up to 3 simulation frames. Also require releasing
        -- any click held while selecting the weapon or entering Fire mode.
        next_fire, ready_at, waiting_release = 0, wa.world.frame() + 3, true
      end
      hint_dirty = true
    end

    cursor.install(ctx, {
      name = "Cursor",
      icon = "sprites/cursor.png",
      start = function(a, worm)
        mode = remembered[worm.id] or 1
        plus_held = wa.world.keys().plus_key or false
        apply(a)
      end,
      stop = function(a)
        clear(a)
        hint_dirty = false
      end,
      frame = function(a, worm)
        local plus = wa.world.keys().plus_key or false
        if plus and not plus_held then
          mode = mode % #MODES + 1
          remembered[worm.id] = mode
          apply(a)
        end
        plus_held = plus
        if hint_dirty then
          wa.hud.message_top(("Cursor: %s | %s | + next mode"):format(MODES[mode].name, MODES[mode].hint),
            {to = "coalition", alliance = worm.alliance})
          hint_dirty = false
        end
        if mode ~= 6 then return end
        if not wa.world.pointer().down then
          next_fire, waiting_release = 0, false
          return
        end
        local now = wa.world.frame()
        if waiting_release or now < ready_at or now < next_fire then return end
        next_fire = now + 2 -- 25 flames/second, independent of rendering.
        colour = colour % #RAINBOW + 1
        wa.fire.spawn{
          owner = worm, x = a.x, y = a.y - 6,
          vx = (colour - 4) * 0.25, vy = -1.5,
          count = 0, duration = 4000, up_power = 100,
          damage = 0, tint = RAINBOW[colour],
        }
      end,
      click = function(ev)
        if mode == 4 then
          local grave = cursor.nearest(wa.graves.all(), ev.x, ev.y, function(g)
            return g.worm_id ~= 0
          end)
          if grave then grave:revive(grave.worm_id, 100) end
        elseif mode == 5 then
          local worm = cursor.nearest(wa.worms.all(), ev.x, ev.y, function(w)
            return w.hp > 0
          end)
          if worm then worm:freeze() end
        elseif mode == 7 then
          local worm = cursor.nearest(wa.worms.all(), ev.x, ev.y, function(w)
            return w.hp > 0
          end)
          if worm then worm:hurt(10) end
        end
      end,
    })
    -- WA's SelectWeapon message also fires when reselecting the same mode.
    wa.on.worm_message(function(worm)
      if worm.turn and worm.weapon == ctx.id then hint_dirty = true end
    end, {msgs = {51}})
  end,
}
