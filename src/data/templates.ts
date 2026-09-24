export const CUSTOM_CLASS_DEMO = `-- WormForge Custom Script Demo
-- Demonstrates customClass member access (. for functions/properties, : for methods)
-- and engine verbs without invalid arrow syntax.

local PX = 0x10000

-- 1. Custom Class & Engine Invocation
-- Note: Lua uses '.' for static/namespace calls and ':' for instance methods
customClass.customvariable(1, "test", 3.14)
customClass:initialize("TurretEngine", 64)
customClass:setHealth(150)

-- 2. WormForge Weapon Replacement
wa.weapons.replace({
  weapon = "bazooka",
  name = "Custom Beam Rocket",
  copy_from = "bazooka",
  params = {
    damage = 75,
    gravity_pct = 30,
    wind_pct = 150,
  },
  on_fire = function(fire)
    wa.log("Custom weapon fired at x=" .. tostring(fire.x // PX) .. " y=" .. tostring(fire.y // PX))

    -- Spawn a custom projectile actor with GPU presentation
    local a = wa.actors.spawn({
      sprite = "missile",
      x = fire.x,
      y = fire.y,
      vx = fire.vx,
      vy = fire.vy,
      origin = "center",
      owner = fire.worm,
      on = function(actor, ev)
        actor:gravity()
        local hit = actor:move({ terrain = true, worms = true })

        -- Rotate sprite along trajectory
        local angle = math.deg(math.atan(actor.vy, actor.vx))
        actor:angle(angle)

        if hit.land or hit.worm then
          actor:explode({ damage = 75, id = 100 })
          actor:despawn()
        end

        if actor:in_water() then
          actor:despawn()
        end
      end,
    })
  end,
})

-- 3. Lockstep Hurt & HUD Hooks
wa.on.hurt(function(hit)
  if hit.phase == "post" and hit.lost > 0 then
    wa.log(hit.kind .. " deal -" .. tostring(hit.lost) .. " HP")
    wa.hud.line("HIT: -" .. tostring(hit.lost) .. " HP", 20, 40)
  end
end)
`;

export const INITIAL_TEMPLATE = `
-- WormForge Method and Class Definition Script
-- Early stage module template with customClass and engine additions

local PX = 0x10000
local SENSOR_RADIUS = 360

-- Custom class operator invocation:
customClass.customvariable(int 1, string 2, float 3)

local function onInit()
  wa.log("WormForge module initialized.")
end

onInit()
`;
