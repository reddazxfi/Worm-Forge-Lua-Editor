-- Selected profile options are the fog scheme; unselected, nothing runs.
local KEYS = {
  "circle_radius",
  "cone_width",
  "cone_length",
  "shadow_cast",
  "discover",
  "view_ownership",
  "animal_circle_radius",
  "animal_cone_length",
  "animal_cone_width",
  "proj_circle",
  "proj_cone_length",
  "proj_cone_width",
  "proj_shadow_cast",
  "explosion_circle",
  "crate_circle",
  "spectator_mode",
  "placement_vision",
  "fog_floor"
}

return function(ctx)
  local scheme = {}
  for _, key in ipairs(KEYS) do scheme[key] = ctx.option(key) end
  wa.fog.set(scheme)
  wa.fog.enable(true)
end
