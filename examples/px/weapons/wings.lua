-- Wings: WA's parachute without gravity or wind, flown with the arrow keys.

local weapon = {}

weapon.definition = {
  wep = "weps/wings.wep",
  name = "Wings",
  panel_icon = "sprites/wings/icon.png",
  sprites = { "sprites/wings/fly.png", "sprites/wings/fold.png" },
  sounds = { "sounds/wings/flap.wav" },
  params = {
    gpu_prefix = "sprites/wings/",
    worm_art = { "sprites/wings/fly.png", "sprites/wings/fold.png" },
  },
}

function weapon.setup()
  local own_time = require("wf-lib/own_time")
  local parachute = require("lib/parachute")
  parachute.setup()

  local ID = "px.wings"
  local DEPTH = wa.depth.WORMS
  local FLY_FRAMES, FLY_FPS = 10, 40
  local FOLD_FRAMES, FOLD_FPS = 6, 24
  local LANDING = { jump_falling = true, standing = true }
  local flights = {}

  local function art(worm, sheet)
    local a = wa.actors.spawn({
      sprite = sheet, x = worm.x, y = worm.y, owner = worm, visibility = worm, on = function() end,
    })
    a:gfx({ glow_of = worm, follow = worm, depth = DEPTH })
    return a
  end

  local function drop_art(worm, w)
    if w.fly then w.fly:remove(); w.fly = nil end
    if w.fold then w.fold:remove(); w.fold = nil end
    worm.body_visible = true
  end

  local function begin_fold(worm, w)
    drop_art(worm, w)
    w.fold, w.fold_t, w.fold_x = art(worm, "sprites/wings/fold.png"), 0, worm.x
    w.fold.facing = -worm.facing -- its art faces left, as WA's worms do
    w.fold:frame(0)
    worm.body_visible = false
  end

  local function give_gravity_back(worm, w)
    if w.gravity then worm.gravity, w.gravity = w.gravity, nil end
  end

  local function wings_frame(worm)
    local opened = parachute.fired(worm, ID)
    local w = flights[worm.id]
    if not (opened or w) then
      return
    end
    if not w then
      w = {}
      flights[worm.id] = w
    end
    local state = worm.state
    if opened == "open" and not w.flying then
      drop_art(worm, w)
      w.flying, w.gravity, w.fly_t = true, worm.gravity, 0
      worm.gravity = 0
      wa.sound.play(worm, "sounds/wings/flap.wav")
      w.fly = art(worm, "sprites/wings/fly.png")
    elseif opened == "landed" then
      wa.sound.play(worm, "sounds/wings/flap.wav")
      begin_fold(worm, w)
    end
    if w.flying then
      if state == "parachuting" then
        local keys = worm.keys or {}
        if keys.right then worm.facing = 1 elseif keys.left then worm.facing = -1 end
        w.fly.x, w.fly.y, w.fly.vx, w.fly.vy = worm.x, worm.y, 0, 0
        w.fly.facing = -worm.facing
        w.fly:frame(w.fly_t * FLY_FPS // 50 % FLY_FRAMES)
        w.fly_t = w.fly_t + own_time.frames(worm)
        worm.body_visible = false
        return
      end
      w.flying = false
      give_gravity_back(worm, w)
      if LANDING[state] then begin_fold(worm, w) else drop_art(worm, w) end
    end
    if w.fold then
      local frame = w.fold_t * FOLD_FPS // 50
      local moving = state == "walking" or state == "jump_prepare" or state == "jumping"
        or math.abs(worm.x - w.fold_x) > 1
      if moving or not LANDING[state] or (frame >= FOLD_FRAMES and state ~= "jump_falling") then
        drop_art(worm, w)
      else
        w.fold.x, w.fold.y, w.fold.vx, w.fold.vy = worm.x, worm.y, 0, 0
        w.fold.facing = -worm.facing
        w.fold:frame(math.min(frame, FOLD_FRAMES - 1))
        worm.body_visible = false
        w.fold_t = w.fold_t + own_time.frames(worm)
      end
    end
  end

  wa.on.worm_message(function(worm)
    wings_frame(worm)
  end, { msgs = { wa.msg.FRAME_FINISH } })

  -- Out of the player's hands, the worm comes down under WA's parachute.
  wa.on.turn_end(function()
    for _, worm in ipairs(wa.worms.all()) do
      local w = flights[worm.id]
      if w then give_gravity_back(worm, w) end
    end
  end)
end

return weapon
