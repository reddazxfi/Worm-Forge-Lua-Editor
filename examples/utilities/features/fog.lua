-- Fog of war: select this add-on in a profile to play with fog.

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
  "proj_ownership",
  "explosion_circle",
  "explosion_ownership",
  "explosion_shadow_cast",
  "crate_circle",
  "crate_shadow_cast",
  "spectator_mode",
  "placement_vision",
  "fog_floor",
  "hide_enemy_hud"
}

return function(ctx)
  local scheme = {}
  for _, key in ipairs(KEYS) do scheme[key] = ctx.option(key) end
  wa.fog.set(scheme)
  wa.fog.enable(true)
  local camera = ctx.option("camera_follow")
  if camera == "all but enemies" then
    wa.camera.follow("owned")
  elseif camera == "only my side" then
    wa.camera.follow("owned", { public = false })
  end
end
