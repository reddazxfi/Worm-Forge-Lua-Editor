-- Rope counter, from Project X: how often each team has attached the Ninja Rope, above the turn timer.

local COLOURS = { "red", "blue", "green", "yellow", "purple", "cyan" }
local LEFT, BOTTOM, LINE = 6, 92, 20 -- pixels: the timer boxes sit 6 in, their top 74 above the bottom

local shots, states = {}, {} -- by team, by worm id

wa.on.worm_message(function(worm)
  local was = states[worm.id]
  states[worm.id] = worm.state
  if worm.turn and worm.state == "roping" and was ~= "roping" then
    shots[worm.team] = (shots[worm.team] or 0) + 1
  end
end, { msgs = { wa.msg.FRAME_FINISH } })

wa.on.hud(function()
  local names, colours = {}, {}
  for _, w in ipairs(wa.worms.all()) do
    if w.hp > 0 and not names[w.team] then
      names[w.team], colours[w.team] = w.name, COLOURS[w.alliance + 1]
    end
  end
  local _, h = wa.hud.size()
  local y = h - BOTTOM
  for team = 6, 1, -1 do
    if names[team] then
      wa.hud.text({ text = ("%s rope shots: %03d"):format(names[team], shots[team] or 0),
        x = LEFT, y = y, color = colours[team] })
      y = y - LINE
    end
  end
end)
