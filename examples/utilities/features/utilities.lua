-- Utilities: a collection of features that could fit a diverse set of schemes

local PACKS = {
  { "ex_turn_side", "features/ex_turn_side" },
  { "agility", "features/agility" },
  { "parkour", "features/parkour" },
  { "live_hp", "features/live_hp" },
  { "instant_death", "features/instant_death", choice = true },
  { "collect_viewer", "features/collect_viewer" },
  { "kill_counter", "features/kill_counter" },
  { "panel_highlight", "features/panel_highlight", call = true },
  { "rope_counter", "features/rope_counter" },
  { "changing_wind", "features/changing_wind" },
}

return function(ctx)
  local heal = ctx.option("heal_per_turn")
  if heal > 0 then
    local healed = false
    wa.on.turn_start(function(ev)
      if healed then return end
      healed = true
      ev.worm:heal(heal)
    end)
    wa.on.turn_end(function() healed = false end)
  end

  local on = {}
  for _, pack in ipairs(PACKS) do
    local value = ctx.option(pack[1])
    if value and value ~= "off" then
      local pack_module = require(pack[2])
      if pack.choice then pack_module(value) end
      if pack.call then pack_module() end
      on[#on + 1] = pack[1]
    end
  end
  
  if ctx.option("fast_aim") then
    require("features/fast_aim")(ctx.option("fast_aim_speed"))
    on[#on + 1] = "fast_aim"
  end

  if ctx.option("damage_numbers") then
    require("features/damage_numbers")({
      side = ctx.option("damage_numbers_side"),
    })
    on[#on + 1] = "damage_numbers"
  end

  if ctx.option("fps_counter") and wa.hud.fps_counter then
    wa.hud.fps_counter()
    on[#on + 1] = "fps_counter"
  end

  if ctx.option("disable_zoom") and wa.view.disable_zoom then
    wa.view.disable_zoom()
    on[#on + 1] = "disable_zoom"
  end

  wa.log(("heal %d, packs %s"):format(
    heal, #on > 0 and table.concat(on, " ") or "none"))
end
