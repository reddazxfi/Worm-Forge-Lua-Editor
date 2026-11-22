-- Girder Launcher: fires four mini-girders that push what they strike or become terrain.

local on_missile = require("lib/on_missile")
local holds = require("wf-lib/holds")
local weapon = {}
local launch, impact
weapon.definition = {
  copy_from = "stock.bazooka",
  name = "Girder Launcher",
  panel_icon = "sprites/girder_launcher/ico_girderl.png",
  sprite = "bazooka",
  fires = {launch_power_pct=45},
  handling = {remember_selection=false,shots=4,ends_turn=false,retreat=3000},
  missile = {
    flight_sound=95,fuse=4200,gravity_pct=0,wind_pct=0,impact_particles=true,
    bounce = {
      bounciness=80,contact_sides=0,max_bounces=40,sound=110,terrain_keep_speed_pct=80,
      hits={crates=true,donor_cards=true,objects=true,water=true,worms_frozen=true},
    },
    ends_on_contact={land=true,mines=true,water=true,worms=true},
    explosion={power=0,push_pct=0},
    trail={power=25,speed=250,sprite="sprites/girder_launcher/trail.png"},
  },
  worm_sprites=holds.PX_POSTURE,
  sprites={"sprites/girder_launcher/mgirderspb.png","sprites/girder_launcher/mgirder.png",
    "sprites/girder_launcher/laser.png"},
  sounds={"sounds/girder_launcher/mgirder_impact.wav"},
  params={gpu_prefix="sprites/girder_launcher/"},
  hold={
    sheet="sprites/girder_launcher/spb_girderl.png",frames=8,draw_hand=false,
    animate=true,anim_speed=1,hand_radius=0,hand_rotation=0,hand_radial_rotation=0,
    weap_radial_rotation=1,weap_rotation=1,weap_radius=0,
  },
  on_fire=function(ev) launch(ev) end,
  on_explode=function(ev) impact(ev) end,
}
weapon.missile_sprite={sheet="sprites/girder_launcher/mgirderspb.png",hide=true,
  frames=8,animate=true,anim_speed=3}

local GIRDER = { half_length = 11, half_width = 4 }

local function pushed(x, y, shooter)
  for _, o in ipairs(wa.world.electrical_nearby(x, y, 29, false)) do
    if (o.kind == "worm" or o.kind == "mine" or o.kind == "crate" or o.kind == "oil")
      and not (o.kind == "worm" and o.id == shooter)
      and math.abs(o.x - x) < 20 and math.abs(o.y - y) < 20 then
      return o
    end
  end
end

function weapon.setup()
  local flights, launching = {}, nil
  local turrets = require("lib/turret")
  local stuck_stamp = require("lib/stuck_stamp")
  launch = function(ev)
    local flight={ev.vx,ev.vy,shooter=ev.worm.id}
    local previous=launching
    launching=flight
    local ok,id=pcall(wa.weapons.launch,{
      weapon="px.girder_launcher",owner=ev.worm,x=ev.x,y=ev.y,vx=ev.vx,vy=ev.vy,
    })
    launching=previous
    if not ok then error(id) end
    if id and not flight.exploded then flights[id]=flight end
  end
  on_missile(function(m)
    if m.weapon ~= "px.girder_launcher" then return end
    local flight=flights[m.id]
    if flight then flight[1],flight[2],flight.id=m.vx,m.vy,m.id end
  end, { weapons = { "px.girder_launcher" } })
  local function orientation(vx,vy)
    if vx==0 then return vy>0 and 16 or 0 end
    if vy==0 then return vx>0 and 8 or 24 end
    if vx>0 and vy<0 then return math.min(math.floor(3*vx/-vy),7) end
    if vx>0 then return math.min(math.floor(8+3*vy/vx),15) end
    if vy>0 then return math.min(math.floor(16+3*-vx/vy),23) end
    return math.min(math.floor(24+3*-vy/-vx),31)
  end
  impact = function(ev)
    local flight=(ev.missile and flights[ev.missile]) or launching
    if ev.missile then flights[ev.missile]=nil end
    if flight then flight.exploded=true end
    local vx,vy=flight and flight[1] or 0,flight and flight[2] or 0
    local o=pushed(ev.x,ev.y,flight and flight.shooter)
    if not o then
      local sentry=turrets.projectile_target(ev.x,ev.y)
      if sentry and turrets.projectile_hit(sentry,3,vx/4,vy/4,flight and flight.id) then return end
    end
    local frame=orientation(vx,vy)
    local x,y,deeper
    if not o then
      x,y,deeper=stuck_stamp.place(ev.x,ev.y,frame,GIRDER)
      if not x then
        o=y
        wa.log(string.format("Girder Launcher: no girder at (%.1f,%.1f) clears worm %d; it is hit",
          ev.x,ev.y,o.id))
      elseif deeper>0 then
        wa.log(string.format("Girder Launcher: laid %dpx deeper at (%.1f,%.1f) to clear the worms",deeper,ev.x,ev.y))
      end
    end
    if o then
      o.vx,o.vy=vx/4,vy/4
      if o.kind=="worm" then o:hit(3)
      else o:hit(3,vx/2,vy/2,"bullet") end
      return
    end
    wa.land.stamp{sprite="sprites/girder_launcher/mgirder.png",frame=frame,x=x,y=y}
    for _,worm in ipairs(wa.worms.all()) do
      if worm.turn then wa.sound.play(worm,"sounds/girder_launcher/mgirder_impact.wav"); break end
    end
  end
  wa.on.draw(function()
    for _,worm in ipairs(wa.worms.all()) do
      if worm.turn and worm.hp>0 and worm.aiming and worm.weapon=="px.girder_launcher" then
        local angle=(1-worm.aim)*math.pi
        if worm.facing<0 then angle=2*math.pi-angle end
        local dx,dy=math.sin(angle),-math.cos(angle)
        local x,y=worm.x+12*dx,worm.y+12*dy
        local x1,y1=x+15000*dx,y+15000*dy
        local hit=wa.world.trace{x0=x,y0=y,x1=x1,y1=y1,radius=1,with={"terrain"}}
        if hit and hit.hit then x1,y1=hit.x,hit.y end
        wa.draw.ribbon{sprite="sprites/girder_launcher/laser.png",visibility=worm,
          blend="add",depth=wa.depth.FRONT,points={
            {x=x,y=y,width=2,u=0,color=0xC0FF6060},
            {x=x1,y=y1,width=1,u=1,color=0xFFFF3030},
          }}
      end
    end
  end)
end
return weapon
