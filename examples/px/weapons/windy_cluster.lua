-- Windy Cluster: record, art and behaviour.
local weapon = {}

-- Native record settings. Edit this weapon here; imported records are review drafts.
weapon.record = {
  missile = {
    alarm_worms = false,
    wind_pct = 48,
  },
  clusters = {
    bit = {
      trail = {
        speed = 200,
        sprite = 615,
      },
      wind_pct = 50,
    },
    count = 8,
    launch_power_pct = 35,
    power_variation_pct = 25,
    spread = 40,
  },
}

function weapon.definition()
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.cluster_bomb",
    name = "Windy Cluster",
    panel_icon = "sprites/windy_cluster/ico_windyc.png",
    cluster = { sprite = "sprites/windy_cluster/cluster.png" },
  })
end

return weapon
