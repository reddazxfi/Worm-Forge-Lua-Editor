-- Worm glow: a soft glow round every worm.

return function(ctx)
  local pad = ctx.option("pad")
  wa.assets.load({
    wa_sprites = { "worm" },
    worm_glow = {
      radius = ctx.option("radius"),
      pad = pad > 0 and pad or nil,
      gain = ctx.option("gain") / 100,
    },
  })
  local colour = ctx.option("red") * 65536 + ctx.option("green") * 256 + ctx.option("blue")
  local tint = { color = 0xFFFFFF, glow = ctx.option("strength") / 100, glow_color = colour }
  wa.on.draw(function()
    for _, worm in ipairs(wa.worms.all()) do
      if worm.tint == nil then worm.tint = tint end
    end
  end)
end
