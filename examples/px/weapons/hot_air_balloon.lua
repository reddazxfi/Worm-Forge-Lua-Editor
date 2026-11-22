-- Hot Air Balloon: a balloon that carries the worm up and with the wind; Space pops it.

local weapon = {}

weapon.record = {
  fires = {
    subtype = 12,
  },
  handling = {
    retreat = -1,
  },
  parachute = {
    wind_pct = 100,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.bungee",
    name = "Hot Air Balloon",
    panel_icon = "sprites/balloon/balloon_icon.png",
    sprites = { "sprites/balloon/balloon.png", "sprites/balloon/basket.png" },
        sounds = {
          "sounds/balloon/inflate1.wav", "sounds/balloon/inflate2.wav", "sounds/balloon/inflate3.wav",
          "sounds/balloon/pop1.wav", "sounds/balloon/pop2.wav", "sounds/balloon/pop3.wav",
          "sounds/balloon/pop4.wav",
        },
    params = {
      gpu_prefix = "sprites/balloon/",
      worm_art = { "sprites/balloon/basket.png" },
    },
  })
end

function weapon.setup()
  local shared = require("lib/shared")
  local own_time = require("wf-lib/own_time")
  local parachute = require("lib/parachute")
  parachute.setup()
  shared.balloons = shared.balloons or {}
  local balloons = shared.balloons

  do

    local BALLOON_DAMP = 0.79998779296875 -- WA's parachute damping, 0.8
    local BALLOON_WIND = 100 -- the patched bungee's fire_method, in percent
    local BALLOON_DEPTH = wa.depth.FRONT + 1 -- behind the basket, in front of worms
    local BASKET_DEPTH = wa.depth.FRONT
    local TEAM_RGB = { 0xFF8080, 0x0096FF, 0x00D000, 0xFFFF40, 0xE800E8, 0x50FFFF }

    local function balloon_of(worm)
      local b = balloons[worm.id]
      if not b then
        b = { active = false, ticks = 0 }
        balloons[worm.id] = b
      end
      return b
    end

    local function balloon_sound(worm, name, n)
      wa.sound.play(worm, "sounds/balloon/" .. name .. wa.random(1, n) .. ".wav")
    end

    local BALLOON_UNSTAND = 3

    local function balloon_stop(worm, b, why, against_land)
      if not b.active then
        return
      end
      wa.log(string.format(
        "highlander: balloon of worm %d popped after %d frames: %s (turn clock %d ms)",
        worm.id, b.ticks, why, wa.world.turn_clock()
      ))
      b.active, b.ticks = false, 0
      if b.balloon then b.balloon:remove(); b.balloon = nil end
      if b.basket then b.basket:remove(); b.basket = nil end
      worm.body_visible = true
      balloon_sound(worm, "pop", 4)
      local vy = against_land and math.max(b.vy, 0) or b.vy
      if worm.taken then
        worm:release(b.vx, vy)
      end
      b.unstand = against_land and BALLOON_UNSTAND or nil
    end

    local function balloon_draw(worm, b)
      local f = worm.facing
      local function art(sheet)
        local a = wa.actors.spawn({
          sprite = sheet, x = b.x, y = b.y, owner = worm, visibility = worm, on = function() end,
        })
        a:gfx({ follow = worm })
        return a
      end
      b.balloon = b.balloon or art("sprites/balloon/balloon.png")
      if not b.basket then
        b.basket = art("sprites/balloon/basket.png")
        b.basket:gfx({ glow_of = worm })
      end
      local x = b.x + 6 * f
      b.balloon.x, b.balloon.y, b.balloon.vx, b.balloon.vy = x, b.y - 43, 0, 0
      b.balloon:frame((b.ticks % 200) * 30 // 200)
      b.balloon:gfx({ tint = 0xFF000000 | (TEAM_RGB[(worm.alliance or 0) + 1] or 0xFFFFFF),
        depth = BALLOON_DEPTH })
      b.basket.x, b.basket.y, b.basket.vx, b.basket.vy = x, b.y + 3, 0, 0
      b.basket.facing = -f
      b.basket:frame((b.ticks % 80) * 32 // 80)
      b.basket:gfx({ depth = BASKET_DEPTH })
      worm.body_visible = false
    end

    local function balloon_frame(worm)
      local b = balloon_of(worm)
      local state = worm.state
      local equipped = b.equipped_weapon
      local fired = parachute.fired(worm, "px.hot_air_balloon")
      if not b.active and (fired or state == "parachuting" and not b.was_parachuting
          and equipped == "px.hot_air_balloon") then
        b.active, b.ticks = true, 0
        b.x, b.y, b.vx, b.vy = worm.x, worm.y, worm.vx, worm.vy
        worm:take{ turn = "run", fire = true }
        balloon_sound(worm, "inflate", 3)
      end
      b.was_parachuting = state == "parachuting"
      if state ~= "parachuting" then b.equipped_weapon = worm.weapon end
      if b.unstand then
        if state == "standing" then
          worm:release(0, 0)
          b.unstand = nil
        else
          b.unstand = b.unstand > 1 and b.unstand - 1 or nil
        end
      end
      if not b.active then
        return
      end
      if not worm.taken then
        balloon_stop(worm, b, "the engine let go (turn over, knocked flying or teleporting)")
        return
      end
      if state ~= "parachuting" then
        balloon_stop(worm, b, "WA closed its parachute (" .. tostring(state) .. ")", true)
        return
      end
      local k = worm.keys or {}
      local left, right, up, down = k.left, k.right, k.up, k.down
      if left and right then left, right = false, false end
      if up and down then up, down = false, false end
      for i = 1, own_time.frames(worm) do
        local vx, vy = b.vx, b.vy
        local g = wa.world.gravity()
        local push = g / 2
        vx = vx + (right and push or 0) - (left and push or 0)
        vy = vy + (down and push or 0) - (up and push or 0)
        vy = vy - g * worm.gravity
        local side = wa.world.wind() >= 0 and 1 or -1
        if worm:fits(b.x + side, b.y) then
          vx = vx + wa.world.wind() * (BALLOON_WIND / 100)
        end
        vx, vy = vx * BALLOON_DAMP, vy * BALLOON_DAMP
        b.vx, b.vy = vx, vy
        local x, y = b.x + vx, b.y + vy
        if not worm:fits(x, y) then
          if vy > 0 and not worm:fits(b.x, y) then
            if i > 1 then worm.x, worm.y = b.x, b.y end
            balloon_stop(worm, b, "landed", true)
            return
          end
          if worm:fits(x, b.y) then
            y, vy = b.y, 0
          elseif worm:fits(b.x, y) then
            x, vx = b.x, 0
          else
            x, y, vx, vy = b.x, b.y, 0, 0
          end
          b.vx, b.vy = vx, vy
        end
        if y >= wa.world.water() then
          if i > 1 then worm.x, worm.y = b.x, b.y end
          balloon_stop(worm, b, "reached the water")
          return
        end
        b.x, b.y = x, y
        b.ticks = b.ticks + 1
      end
      worm:carry(b.x, b.y)
      balloon_draw(worm, b)
    end

    local BALLOON_KEY_MESSAGES = {
      [wa.msg.JUMP] = "jump", [wa.msg.JUMP_UP] = "backflip",
      [wa.msg.FIRE_WEAPON] = "fire", [wa.msg.RELEASE_WEAPON] = "release",
    }

    wa.on.worm_message(function(worm, msg)
      if msg == wa.msg.FRAME_FINISH then
        balloon_frame(worm)
        return
      end
      local b = balloons[worm.id]
      if not (b and b.active) then
        return
      end
      local key = BALLOON_KEY_MESSAGES[msg]
      if key then
        wa.log(string.format("highlander: balloon of worm %d got WA's %s message at flight frame %d",
          worm.id, key, b.ticks))
      end
      if msg == wa.msg.JUMP then
        balloon_stop(worm, b, "jump key (Space in flight)")
        return "eat"
      end
      if msg == wa.msg.FIRE_WEAPON and worm.weapon == "px.super_drill" then
        wa.sound.play(worm, 120) -- WA's can't-fire
        return "eat"
      end
    end, { msgs = { wa.msg.FRAME_FINISH, wa.msg.JUMP, wa.msg.JUMP_UP, wa.msg.FIRE_WEAPON, wa.msg.RELEASE_WEAPON } })

    wa.on.turn_start(function()
      for _, worm in ipairs(wa.worms.all()) do
        local b = balloons[worm.id]
        if b and b.active then
          balloon_stop(worm, b, "a new turn began")
        end
      end
    end)
  end
end

return weapon
