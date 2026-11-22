-- Project X oil drums: Project X's special oil drums: skunk, cluster, icy and electric.

return {
  install = function(ctx)
    local loader = require("components/loader")
    loader.also("lib/electrical")
    loader.also("weapons/nuke_rocket")
    loader.load(loader.place(ctx))
    local drums = require("lib/oil_drums")
    drums.load_assets()
    drums.install({ deal = true })
  end,
}
