-- Gravity Control: 1 to 5 choose the gravity; firing holds it for the turn.

local weapon = {}

weapon.record = {
  handling = {
    retreat = -1,
  },
  utility = {
    effect = "scripted",
  },
}

weapon.defaults = { crate = { type = "utility" }, donor_card = true }

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.low_gravity",
    name = "Gravity Control",
    panel_icon = "sprites/gravity_control/gravity_control_ico.png",
    sounds = { "sounds/gravity_control/activate.wav", "sounds/gravity_control/error.wav" },
  })
end

weapon.requires = { "lib/turn_controls" }

function weapon.setup()
  local GRAVITY_FACTORS = { 0.3, 0.5, 1.0, 1.7, 2.4 }
  local GRAVITY_NAMES = { "Very Low Gravity", "Low Gravity", "Normal Gravity", "High Gravity", "Very High Gravity" }

  local gravity_choice -- TransformedGravity's index, until fired
  local gravity_initial -- InitialGravity: the match's
  local gravity_factor -- ModulatedGravity while Gravity Control is on
  local SETTLE_LIMIT = 500 -- frames (10 s) the turn clock may stand still
  local clock_seen = {}
  local retreating = false
  local settling = false -- the turn has ended with Gravity Control on
  local crate_floor = 0 -- the newest crate's id when the turn ended

  local function gravity_back()
    gravity_factor, clock_seen, settling = nil, {}, false
    wa.world.set_gravity(gravity_initial)
  end

  local function watch_clock(worm)
    if not gravity_factor or retreating then
      return
    end
    local clock = wa.world.turn_clock()
    local seen = clock_seen[worm.id]
    if not seen or seen.clock ~= clock then
      clock_seen[worm.id] = { clock = clock, frames = 0 }
      return
    end
    seen.frames = seen.frames + 1
    if seen.frames >= SETTLE_LIMIT then
      gravity_back()
    end
  end

  wa.on.turn_retreat(function() retreating = true end)

  wa.on.turn_start(function()
    if settling then gravity_back() end
  end)
  wa.on.body_move(function(crate)
    if settling and crate.id > crate_floor then gravity_back() end
  end, { kinds = { "crate" } })

  require("lib/turn_controls").register("px.gravity_control", {
    frame = function(worm)
      gravity_initial = gravity_initial or wa.world.gravity()
      watch_clock(worm)
    end,
    choose = function(worm, digit)
      if digit >= 1 and digit <= 5 then
        gravity_choice = digit
        wa.sound.play(worm, 92)
      end
    end,
    fire = function(worm)
      if not gravity_choice then
        wa.sound.play(worm, "sounds/gravity_control/error.wav")
        return "eat"
      end
      gravity_initial = gravity_initial or wa.world.gravity()
      gravity_factor, gravity_choice = GRAVITY_FACTORS[gravity_choice], nil
      clock_seen = {}
      wa.sound.play(worm, "sounds/gravity_control/activate.wav")
      wa.world.set_gravity(gravity_initial * gravity_factor)
    end,
    finish = function()
      retreating = false
      if gravity_factor and not settling then
        settling, clock_seen, crate_floor = true, {}, 0
        for _, crate in ipairs(wa.crates.all()) do
          crate_floor = math.max(crate_floor, crate.id)
        end
      end
      gravity_choice = nil
    end,
    hint = function()
      return "Gravity Control: " .. (gravity_choice and GRAVITY_NAMES[gravity_choice]
        or "choose one") .. "\n1-5: gravity, then Space"
    end,
  })
end

return weapon
