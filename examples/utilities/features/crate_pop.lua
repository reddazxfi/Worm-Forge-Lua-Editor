-- Crate pop: crates from the turn drop and Crate Shower pop in, each at a
-- random height within the range, with the pop at a random pitch.

return function(ctx)
  if not wa.crates.set_drop then
    wa.log("Crate pop needs a newer WormForge: crates arrive as normal")
    return
  end
  local low, high = ctx.option("height_min"), ctx.option("height_max")
  wa.crates.set_drop("pop", {
    pitch = ctx.option("pitch"),
    height = { min = math.min(low, high), max = math.max(low, high) },
  })
end
