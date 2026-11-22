-- Fast aim, from Project X: with Shift held, the aim keys move at another speed.

local own_time = require("wf-lib/own_time")

local STEP = 180 / 128 -- WA's aim step, degrees a frame (exact in binary)

return function(pct)
  local state = {}
  local supported -- this DLL has worm.aim_target

  wa.on.worm_message(function(worm)
    if not worm.turn then return end
    if supported == nil then
      local ok, v = pcall(function() return worm.aim_target end)
      supported = ok and type(v) == "number"
      if not supported then
        wa.log("fast aim: this WormForge has no worm.aim_target; fast aim is off")
      end
    end
    if not supported then return end

    local id = worm.id
    if not worm.aiming or not wa.world.keys().shift then
      state[id] = nil
      return
    end

    local t = worm.aim_target
    local scale = own_time.scale(worm)
    local s = state[id]
    if not s then
      state[id] = { last = t, dir = 0, acc = 0, scale = scale }
      return
    end

    local d = t - s.last
    local most = math.ceil(math.max(scale, s.scale))
    s.scale = scale
    local n = math.abs(d) / STEP
    if d == 0 or n ~= math.floor(n) or n > most then
      s.last, s.acc = t, 0
      if d ~= 0 then s.dir = 0 end
      return
    end
    local dir = d > 0 and STEP or -STEP
    if dir ~= s.dir then
      s.last, s.dir, s.acc = t, dir, 0
      return
    end

    s.acc = s.acc + pct * n
    local steps = s.acc // 100
    s.acc = s.acc % 100
    local want = math.max(-90, math.min(90, t + (steps - n) * dir))
    if want ~= t then worm:input{ aim = want } end
    s.last = want
  end, { msgs = { wa.msg.FRAME_FINISH } })
end
