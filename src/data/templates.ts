export const INITIAL_TEMPLATE = `-- WormForge component template
-- API 4 units are pixels: positions and speeds are plain pixels, with fractions.
-- Use pixel values directly; no manual coordinate conversion.
--
-- This file is a module. The engine reads what it returns and calls install(ctx)
-- when the profile selects this component. \`wa\` exists only inside install and
-- the callbacks it registers.
-- Lockstep: use wa.random (not math.random) and avoid unordered pairs().
--
-- This is the feature form. A weapon entry returns
-- { defaults = { ... }, install = ... } instead.
return function(ctx)
  wa.log("WormForge module initialized: " .. ctx.id)
end
`;

/**
 * The pre-pixel-units starter. Kept only so a session persisted before the
 * template change is migrated instead of restored forever.
 */
export const LEGACY_INITIAL_TEMPLATE = `-- WormForge mod template
-- Lockstep rules: no math.random (use wa.random), no floats, no unordered pairs().

local PX = 0x10000

local function onInit()
  wa.log("WormForge module initialized.")
end

onInit()
`;

const normalizeTemplate = (code: string): string => code.replace(/\r\n/g, '\n').trim();

/**
 * Replaces the old untouched starter in a restored session. An edited file is
 * left alone: only an exact legacy template match is migrated.
 */
export function migrateInitialTemplate(
  files: Record<string, string>
): Record<string, string> {
  const current = files['mod.lua'];
  if (current !== undefined && normalizeTemplate(current) === normalizeTemplate(LEGACY_INITIAL_TEMPLATE)) {
    return { ...files, 'mod.lua': INITIAL_TEMPLATE };
  }
  return files;
}
