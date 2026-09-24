export const INITIAL_TEMPLATE = `-- WormForge mod template
-- Lockstep rules: no math.random (use wa.random), no floats, no unordered pairs().

local PX = 0x10000

local function onInit()
  wa.log("WormForge module initialized.")
end

onInit()
`;
