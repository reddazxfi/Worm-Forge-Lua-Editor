-- Drilling Crew: a roaming drill followed by a bouncing worker.

local on_missile = require("lib/on_missile")
local holds = require("wf-lib/holds")
local weapon = {}
weapon.definition = {
  copy_from="stock.bazooka",
  name="Drilling Crew",
  panel_icon="sprites/drilling_crew/ico_drillingc.png",
  sprite="sprites/drilling_crew/driller.png",
  cluster_sprite = "sprites/drilling_crew/drillerc.png",
  worm_sprites=holds.PX_POSTURE,
  sprites={"sprites/drilling_crew/trail.png"},
  params={sprite_columns=1,gpu_prefix="sprites/drilling_crew/trail"},
  hold={sheet="sprites/drilling_crew/driller.png",frames=8,animate=true,anim_speed=1.1,
    hand=holds.PX_HANDS[1],hand_type=1,hand_scale=1.2,hand_radius=-13.2,
    hand_rotation=0,hand_radial_rotation=0,weap_radial_rotation=0,
    weap_rotation=0.5,weap_radius=-11,static={weap=0,hand=0.4}},
    fires = {
      launch_power_pct = 5,
      method = 2,
      subtype = 1,
      type = 2,
    },
    handling = {
      remember_selection = false,
      ends_turn = false,
      retreat = 3000,
    },
    missile = {
      action = "roam",
      alarm_worms = true,
      animation = 6,
      burst = "clusters",
      flight_sound = 65620,
      fuse = 5000,
      gravity_pct = 65,
      impact_particles = true,
      random_motion = 10,
      speed_pct = 99,
      wind_pct = 0,
      ends_on_contact = {
        objects = true,
        water = true,
      },
      explosion = {
        bias = 20,
        power = 35,
        push_pct = 105,
      },
      explosion_sound = {
        before = 350,
        sound = 175,
      },
      roam = {
        step_height = -80,
        edge_jump = {
          angle_deg = 40,
          speed = 2.4,
        },
        flight_hits = {
          crates = true,
          donor_cards = true,
          objects = true,
          water = true,
        },
        hits = {
          crates = true,
          donor_cards = true,
          land = true,
          mines = true,
          missiles = true,
          water = true,
          worms = true,
          worms_frozen = true,
        },
        jump = {
          angle_deg = 40,
          speed = 2.4,
        },
      },
      trail = {
        power = 0,
        speed = 0,
        sprite = 0,
      },
    },
    clusters = {
      count = 1,
      launch_power_pct = 60,
      power_variation_pct = 100,
      spread = 45,
      bit = {
        action = "bounce",
        animation = 1,
        flight_sound = 161,
        fuse = 1500,
        gravity_pct = 150,
        impact_particles = false,
        random_motion = 10,
        speed_pct = 100,
        sprite_count = 1,
        bounce = {
          bounciness = 30,
          max_bounces = 200,
          sound = 108,
          terrain_keep_speed_pct = 101,
          hits = {
            crates = true,
            donor_cards = true,
            land = true,
            objects = true,
            water = true,
            worms_acting = true,
            worms_frozen = true,
            worms_normal = true,
          },
        },
        ends_on_contact = {
          water = true,
        },
        explosion_sound = {
          before = 1,
          enabled = true,
          sound = 115,
        },
        trail = {
          power = 0,
          speed = 125,
          sprite = 0,
        },
      },
    },
}

function weapon.setup()
  local parent_sprite
  local seen = {}
  on_missile(function(m)
    if m.weapon ~= "px.drilling_crew" then seen[m.id]=nil; return end
    if not parent_sprite then
      parent_sprite=wa.weapons.data("px.drilling_crew").missile.sprite
    end
    local parent=m.sprite==parent_sprite
    seen[m.id]={worker=not parent,frame=wa.world.frame()}
    if m.phase~="pre" or not parent then return end
    wa.land.cut{x=m.x,y=m.y-7,shape="circle",radius=7}
    for _,worm in ipairs(wa.worms.all()) do
      if not worm.turn and worm.hp>0 then
        local dx,dy=worm.x-m.x,worm.y-m.y
        local rx,ry=math.max(0,math.abs(dx)-10),math.max(0,math.abs(dy)-10)
        local d=math.sqrt(dx*dx+dy*dy)
        if rx*rx+ry*ry<=36 and d>0 then
          local force=0.6*math.sqrt(15)
          worm:hit{amount=0,vx=force*dx/d,vy=force*dy/d}
        end
      end
    end
  end, { weapons = { "px.drilling_crew" } })
  local particles, emit, previous = {}, {}, nil
  local LIFE, LIMIT = 20, 256
  wa.on.draw(function()
    local frame=wa.world.frame()
    local dt=previous and frame-previous or 1
    if dt<0 or dt>10 then particles,emit={},{};dt=1 end
    previous=frame
    if dt>0 then
      for i=#particles,1,-1 do
        local p=particles[i];p.age=p.age+dt
        if p.age>=LIFE then table.remove(particles,i)
        else p.x,p.y=p.x+p.vx*dt,p.y+p.vy*dt end
      end
      local live={}
      for _,body in ipairs(wa.missiles.all()) do
        local source=seen[body.id]
        if source and source.worker and frame>=source.frame and frame-source.frame<=2 and body.y<wa.world.water() then
          local key=body.id
          live[key]=true
          local n=(emit[key] or 0)+0.8*dt -- source trail power 20 / 25 each frame
          local count=math.floor(n);emit[key]=n-count
          for _=1,count do
            if #particles>=LIMIT then table.remove(particles,1) end
            particles[#particles+1]={x=body.x,y=body.y,age=0,
              vx=wa.draw.random()-0.5,vy=wa.draw.random()-0.5}
          end
        end
      end
      for key in pairs(emit) do if not live[key] then emit[key]=nil end end
      for id,source in pairs(seen) do if frame<source.frame or frame-source.frame>2 then seen[id]=nil end end
    end
    for _,p in ipairs(particles) do
      local half=30*(1-p.age/LIFE)
      wa.draw.quad{sprite="sprites/drilling_crew/trail.png",frame=math.min(8,math.floor(p.age*9/LIFE)),
        depth=wa.depth.OBJECTS,blend="alpha",color=0xFFFFFFFF,
        points={{p.x-half,p.y-half},{p.x+half,p.y-half},{p.x+half,p.y+half},{p.x-half,p.y+half}}}
    end
  end)
end
return weapon
