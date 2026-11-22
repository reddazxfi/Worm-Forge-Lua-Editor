-- Crate Strike: drops three crates by parachute around the click.

local weapon = {}

weapon.record = {
  handling = {
    ends_turn = true,
  },
}

function weapon.definition()
  local shared = require("lib/shared")
  local fires = shared.fires
  return require("lib/weapon").merge(weapon.record, {
    wep = "weps/donkey.wep",
    panel_icon = "sprites/crate_strike/icon.png",
    on_select = { cursor = true },
    on_click = function(ev) fires.crate_strike(ev) end,
  })
end

function weapon.setup()
  local shared = require("lib/shared")
  local fires = shared.fires

  local KINDS = { "weapon", "utility", "health" }
  local DROPS = {
    { dx = 0, lo = 20, hi = 40 },
    { dx = -50, lo = 40, hi = 60 },
    { dx = 50, lo = 60, hi = 80 },
  }

  fires.crate_strike = function(ev)
    local x = ev.x
    for _, d in ipairs(DROPS) do
      local kind = KINDS[wa.random(1, 3)]
      local health = wa.random(d.lo, d.hi)
      local crate = { x = (x + d.dx), y = ev.sky, kind = kind, health = health, drop = "chute" }
      if not pcall(wa.crates.spawn, crate) then
        crate.kind = "health"
        wa.crates.spawn(crate)
      end
    end
  end
end

return weapon
