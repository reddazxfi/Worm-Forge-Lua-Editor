-- Gravity Control: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  handling = {
    retreat = -1,
  },
  utility = {
    effect = "scripted",
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.low_gravity",
    name = "Gravity Control",
    panel_icon = "sprites/gravity_control/gravity_control_ico.png",
    sounds = { "sounds/gravity_control/activate.wav", "sounds/gravity_control/error.wav" },
  })
end

weapon.requires = { "weapons/helicopter", "weapons/wind_changer", "lib/turn_controls" }

function weapon.setup()
  local GRAVITY_FACTORS = { 0.3, 0.5, 1.0, 1.7, 2.4 }
  local GRAVITY_NAMES = { "Very Low Gravity", "Low Gravity", "Normal Gravity", "High Gravity", "Very High Gravity" }

  local gravity_choice          -- TransformedGravity's index, until fired
  local gravity_initial         -- InitialGravity: the match's
  local gravity_factor          -- ModulatedGravity while Gravity Control is on
  local SETTLE_LIMIT = 500      -- frames (10 s) the turn clock may stand still
  local clock_seen = {}         -- worm id -> { clock, frames }: each worm counts the frames itself

  local function gravity_back()
    gravity_factor, clock_seen = nil, {}
    wa.world.set_gravity(gravity_initial)
  end

  -- Every worm sees each frame once, so the first to count SETTLE_LIMIT frames
  -- with the clock where it was marks 10 s, whichever worms are still alive.
  local function watch_clock(worm)
    if not gravity_factor then
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

  -- Reset at turn end; delaying until the next turn can softlock settling.
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
      if gravity_factor then gravity_back() end
      gravity_choice = nil
    end,
    hint = function()
      return "Gravity Control: " .. (gravity_choice and GRAVITY_NAMES[gravity_choice]
        or "choose 1-5") .. ", then Space"
    end,
  })
end

return weapon
