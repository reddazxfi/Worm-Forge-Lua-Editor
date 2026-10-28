-- Shared claim mechanics. Settings and callbacks belong to each weapon module.
local shared = require("lib/shared")
local owned = {}
shared.owns = function(id) return id ~= nil and owned[id] == true end
local weapon = {}

-- Always return fresh nested tables: configuration must not mutate defaults.
function weapon.merge(base, overrides)
  local out = {}
  for k, v in pairs(base or {}) do
    out[k] = type(v) == "table" and weapon.merge(v, {}) or v
  end
  for k, v in pairs(overrides or {}) do
    out[k] = type(v) == "table" and weapon.merge(out[k], v) or v
  end
  return out
end

function weapon.claim(id, spec)
  owned[id] = true
  wa.weapons.replace(spec)
end
return weapon
