-- Thrown Dynamite: a charged throw of a heavier, low-bounce dynamite.

local holds = require("wf-lib/holds")
local weapon = {
  definition = {
    copy_from = "stock.grenade",
    name = "Thrown Dynamite",
    panel_icon = "sprites/thrown_dynamite/ico_tdynamite.png",
    hold_as = "stock.grenade",
    handling = { remember_selection = false },
    missile = {
      sprite = 0, -- WA draws no round; the art spec draws it
      animation = 0,
      countdown = 3000,
      flight_sound = 65602,
      fuse = 5000,
      gravity_pct = 125,
      bounce = { bounciness = 35, terrain_keep_speed_pct = 35 },
      ends_on_contact = { water = true },
      explosion = { bias = 50, power = 75 },
      explosion_sound = { before = 1, sound = 90 },
      trail = { power = 4, speed = 25, sprite = 130 },
    },
    worm_sprites = holds.PX_POSTURE,
    sprites = { "sprites/thrown_dynamite/tdynamite.png", "sprites/thrown_dynamite/spark.png" },
    params = { gpu_prefix = "sprites/thrown_dynamite/" },
    hold = {
      sheet = "sprites/thrown_dynamite/tdynamite.png", frames = 4,
      anim_speed = 1.7,
      hand = holds.PX_HANDS[1], hand_type = 1, hand_scale = 1.2,
      hand_radius = -9, hand_rotation = 0, hand_radial_rotation = 0,
      weap_radial_rotation = 0, weap_rotation = 0.5, weap_radius = -11.2,
      thrown = true,
    },
  },
  missile_sprite = {
    sheet = "sprites/thrown_dynamite/tdynamite.png", frames = 4,
    animate = true, anim_speed = 1.7, hide = true,
  },
}

function weapon.setup()
  local particles, driver, seed = {}, nil, 1733
  local function random()
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  end
  local function step(a)
    for i = #particles, 1, -1 do
      local p = particles[i]
      p.age = p.age + 1
      if p.age >= 55 then table.remove(particles, i)
      else
        p.x, p.y = p.x + p.vx, p.y + p.vy
        p.vx, p.vy = p.vx / 2, p.vy / 2 - 3 * wa.world.gravity()
      end
    end
    if #particles == 0 then driver = nil; a:remove() end
  end
  wa.on.worm_message(function(worm)
    if not worm.turn or worm.hp <= 0 or not worm.aiming or worm.weapon ~= "px.thrown_dynamite"
      or #particles >= 64 then return end
    local angle = worm.aim * math.pi * -worm.facing
    local x = worm.x + wa.math.sin(angle) * 13
    local y = worm.y - wa.math.cos(angle) * 23
    if y >= wa.world.water() then return end
    if not driver then
      driver = wa.actors.spawn{sprite=false,owner=worm,x=x,y=y,on=step}
    end
    local direction, speed = random() * math.pi * 2, 1 + random() * 4
    particles[#particles+1] = {x=x,y=y,age=0,
      vx=wa.math.cos(direction)*speed,vy=wa.math.sin(direction)*speed,owner=worm}
  end, {msgs={wa.msg.FRAME_FINISH}})
  wa.on.draw(function()
    for _, p in ipairs(particles) do
      local t = p.age / 55
      local half = 30 * (0.5 + (0.05 - 0.5) * t)
      local brightness = math.floor(160 * (1-t))
      wa.draw.quad{points={{p.x-half,p.y-half},{p.x+half,p.y-half},
        {p.x+half,p.y+half},{p.x-half,p.y+half}},
        sprite="sprites/thrown_dynamite/spark.png",frame=math.floor((p.age*0.015%1)*7),
        color=0xFF000000 | (brightness<<16) | (brightness<<8) | brightness,
        blend="add",depth=wa.depth.FRONT,visibility=p.owner}
    end
  end)
end

return weapon
