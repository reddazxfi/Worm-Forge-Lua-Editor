-- Platform: a fixed platform with 40 health.

local weapon = {}
local platforms = {}
local ART = "sprites/platform/"
local COLOURS = {0xFFFF0000,0xFF0000FF,0xFF00FF00,0xFFFFFF00,0xFFFF00FF,0xFF00FFFF}

local function place(shot)
  local x,y = shot.worm.x,shot.worm.y+17
  local s = {x=x,y=y,health=40,alive=true,colour=COLOURS[shot.worm.alliance+1]}
  local function hit(a,event)
    if not s.alive then return end
    local damage=math.max(0,event.damage or 0)
    if event.kind=="blast" then
      local power=event.power
      local dx,dy=event.x-s.x,event.y-s.y
      damage=power>0 and math.max(0,math.floor((1-(dx*dx+dy*dy)/(power*power*4))*power)) or 0
    end
    s.health = s.health-damage
    if s.health<=0 then
      s.alive=false
      a:explode{damage=10,id=100}
      a:remove()
    end
  end
  s.actor = wa.actors.spawn{
    sprite=false,owner=shot.worm,x=x,y=y,origin="center",persist=true,
    body={shape=ART.."body.png",hits={},hit_by="all"},
    on={frame=function(a)
      a.x,a.y,a.vx,a.vy=s.x,s.y,0,0
    end,hit=hit},
  }
  platforms[#platforms+1]=s
  wa.sound.play(s.actor, 112)
end

weapon.definition = {
  copy_from="stock.double_turn_time",name="Platform",
  panel_icon=ART.."platform_icon.png",
  utility={effect="scripted"},on_fire=place,
  sprites={ART.."platform_sprite.png",ART.."platform_broken.png"},
  params={gpu_prefix=ART},
}

function weapon.setup()
  wa.on.draw(function()
    for _,s in ipairs(platforms) do
      if s.alive and s.actor.id~=0 then
        local x,y=s.actor.x,s.actor.y
        wa.draw.quad{sprite=ART..(s.health>20 and "platform_sprite.png" or "platform_broken.png"),
          frame=0,color=s.colour,depth=wa.depth.TERRAIN-1,
          points={{x-70,y-10},{x+70,y-10},{x+70,y+10},{x-70,y+10}}}
      end
    end
  end)
end
return weapon
