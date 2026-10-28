-- Set up the selected weapons and their dependencies once, in the established
-- hook order. Modules keep pure declarations separate from runtime setup.
local shared = require("lib/shared")
local index = require("weapons/index")
local loader = {}
local loaded, placed_ids = false, nil
-- Modules an add-on needs set up whether or not their weapon is placed.
local also = {}

-- An add-on that installs before the weapons (before_weapons) asks for a
-- module's setup here, before anything loads.
function loader.also(path)
  assert(not loaded, "loader.also(" .. path .. "): the modules are already set up")
  also[#also + 1] = path
end

local ORDER = {
  "lib/holds",
  "weapons/old_woman_launcher",
  "weapons/super_drill",
  "weapons/fire_jump",
  "lib/anim",
  "weapons/sniper_rifle",
  "lib/missile_sprites",
  "weapons/double_bazooka",
  "weapons/chilli_bomb",
  "weapons/nuke_rocket",
  "weapons/helicopter",
  "weapons/hot_air_balloon",
  "weapons/hang_glider",
  "weapons/swim_suit",
  "weapons/wind_changer",
  "weapons/gravity_control",
  "lib/turn_controls",
  "weapons/jump",
  "weapons/laser_gun",
  "weapons/super_tele",
  "weapons/electric_grenade",
  "weapons/lightning_strike",
  "lib/electrical",
  "weapons/javelin",
  "weapons/ice_arrow",
  "weapons/valyrian_fire",
  "weapons/reinforcement",
  "weapons/bowling_ball",
  "weapons/ferret",
  "weapons/electromagnet",
  "weapons/crate_strike",
  "weapons/submarine_attack",
  "weapons/sentry_gun",
  "weapons/sentry_laser",
  "weapons/petrol_turret",
  "weapons/flame_turret",
  "weapons/mine_turret",
  "weapons/auto_ballista",
  "weapons/kamikaze_rocket",
  "weapons/weapon_crate",
  "weapons/portal_gun",
}

function loader.place(ctx)
  if placed_ids then return placed_ids end
  local ids = {}
  for id in pairs(ctx.weapons) do ids[#ids + 1] = id end
  table.sort(ids)
  placed_ids = ids
  return ids
end

function loader.load(ids)
  if loaded then return end
  loaded = true
  require("lib/weapon")
  shared.fires = {}
  shared.missile_sprites = {}
  local want = {}
  -- Require only pure declarations here. No hooks run until ORDER below.
  for id, path in pairs(index) do
    local definition = require(path)
    if definition.missile_sprite then shared.missile_sprites[id] = definition.missile_sprite end
  end
  local function need(path)
    if want[path] then return end
    want[path] = true
    local module = require(path)
    if type(module) == "table" then
      for _, dependency in ipairs(module.requires or {}) do need(dependency) end
    end
  end
  -- Common rendering hooks still install even for a record-only weapon.
  for _, path in ipairs({ "lib/holds", "weapons/old_woman_launcher", "lib/anim", "lib/missile_sprites" }) do
    -- These libraries have runtime side effects; load them only in ORDER.
    want[path] = true
  end
  for _, id in ipairs(ids) do
    if index[id] then need(index[id]) end
  end
  for _, path in ipairs(also) do need(path) end
  for _, path in ipairs(ORDER) do
    if want[path] then
      local module = require(path)
      if type(module) == "table" and module.setup then module.setup() end
    end
  end
end

function loader.install(ctx)
  loader.load(loader.place(ctx))
  local path = index[ctx.id]
  if not path then error(ctx.id .. ": not a Highlander weapon") end
  local weapon = require(path)
  -- Copy declarations before applying this profile's component options.
  -- Existing modules may still build their declaration in a function.
  local declaration = weapon.definition
  if type(declaration) == "function" then declaration = declaration() end
  local spec = require("lib/weapon").merge(declaration, {})
  if weapon.configure then weapon.configure(ctx, spec) end
  require("lib/weapon").claim(ctx.id, spec)
end
return loader
