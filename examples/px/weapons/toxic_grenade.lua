-- Toxic Grenade: a grenade that releases a lingering poison cloud.

local holds = require("wf-lib/holds")
local weapon = {}
local clouds = {}
local ART = "sprites/toxic_grenade/"
local SMOKE = ART.."smoke.png"
local FINISH_TURN = 55
local poison = 2
local pending_end
local abs = math.abs

local function finish_candidate(worms,confirmed)
  local ending=pending_end
  pending_end=nil
  if not ending then return end
  if not confirmed then
    for _,w in ipairs(worms) do if w.turn then return end end
  end
  for _,s in ipairs(ending) do s.turns=s.turns-1 end
end
local looks = setmetatable({}, {__mode="k"})

local function random_signed()
  return wa.random(-10000,10000)/10000
end

local function puff(x,y)
  return {x=x,y=y,age=0,life=240+40*random_signed(),
    vx=3*random_signed(),vy=3*random_signed()}
end

local wx,wy,ww,wn={}, {}, {}, nil
local function gather(worms)
  wn=0
  for _,w in ipairs(worms) do
    if w.hp>0 then wn=wn+1;wx[wn],wy[wn],ww[wn]=w.x,w.y,w end
  end
end

local function move(p,worms,random,solid)
  local x,y,vx,vy=p.x,p.y,p.vx,p.vy
  local age=p.age+1
  p.age=age
  for _=1,128 do
    if not solid(x+vx,y+vy) then break end
    if random(0,1)==0 then
      vx=vy*-0.94;vy=vx*0.94
    else
      vx=vy*0.94;vy=vx*-0.94
    end
    if abs(vx)<0.1 and abs(vy)<0.1 then break end
  end
  if age%8==0 then
    if not wn then gather(worms) end
    for k=1,wn do
      if abs(wx[k]-x)<20 and abs(wy[k]-y)<20 then ww[k]:poison(poison) end
    end
  end
  p.x,p.y=x+vx,y+vy
  p.vx=vx*0.995+0.05*(random(-10000,10000)/10000)
  p.vy=(vy-0.02)*0.995+0.05*(random(-10000,10000)/10000)
end

local function detonate(event)
  local owner
  for _,w in ipairs(wa.worms.all()) do
    owner=owner or w
    if event.worm and w.id==event.worm.id then owner=w;break end
  end
  if not owner then return end
  local s={x=event.x,y=event.y,age=0,turns=4,puffs={}}
  local function step(a)
    local worms=wa.worms.all()
    finish_candidate(worms,false)
    local puffs,random,solid=s.puffs,wa.random,wa.land.solid
    local n,kept=#puffs,0
    wn=nil
    for i=1,n do
      local p=puffs[i]
      move(p,worms,random,solid)
      if p.age<=p.life then kept=kept+1;puffs[kept]=p end
    end
    for i=kept+1,n do puffs[i]=nil end
    if s.turns>=0 then
      if s.age%8==0 then
        for _=1,6 do puffs[#puffs+1]=puff(s.x,s.y) end
      end
      s.age=s.age+1
    elseif #puffs==0 then
      for i,c in ipairs(clouds) do if c==s then table.remove(clouds,i);break end end
      a:remove()
    end
  end
  s.actor=wa.actors.spawn{sprite=false,owner=owner,x=s.x,y=s.y,persist=true,light=false,on=step}
  clouds[#clouds+1]=s
end

weapon.definition = {
  copy_from="stock.grenade",name="Toxic Grenade",
  panel_icon=ART.."img_toxicgren.png",sprite="grenade",
  handling={remember_selection=false},
  missile={explosion={power=0,push_pct=0},burst="nothing"},on_explode=detonate,
  worm_sprites=holds.PX_POSTURE,
  sprites={ART.."poisongren.png",ART.."smoke.png"},params={gpu_prefix=ART},
  hold={sheet=ART.."poisongren.png",frames=1,hand_radius=18,hand_rotation=1,
    hand_radial_rotation=1.05,weap_radial_rotation=0.9,weap_rotation=0.5,
    weap_radius=10,hand_type=1,hand_scale=0.8,thrown=true},
}
weapon.missile_sprite={sheet=ART.."poisongren.png",frames=1,hide=true}

function weapon.configure(ctx)
  poison = ctx.option("poison") or 2
end

function weapon.setup()
  wa.on.worm_message(function(_,msg)
    if msg==wa.msg.TURN_STARTED then
      finish_candidate({},true)
    elseif not pending_end then
      pending_end={}
      for _,s in ipairs(clouds) do pending_end[#pending_end+1]=s end
    end
  end,{msgs={FINISH_TURN,wa.msg.TURN_STARTED}})
  local MAX=4096*9
  local buf={}
  local batch={sprite=SMOKE,frame=0,depth=0,quads=buf,count=0}
  local c1,c2,c3,c4={0,0},{0,0},{0,0},{0,0}
  local q={sprite=SMOKE,frame=0,color=0,depth=0,points={c1,c2,c3,c4}}
  wa.on.draw(function()
    if not clouds[1] then return end
    local quads,quad,cos,sin,floor=wa.draw.quads,wa.draw.quad,math.cos,math.sin,math.floor
    batch.depth=wa.depth.OBJECTS
    q.depth=batch.depth
    local n=0
    for _,s in ipairs(clouds) do
      if s.actor.id~=0 then
        local puffs=s.puffs
        for i=1,#puffs do
          local p=puffs[i]
          local v=looks[p]
          if not v then
            v={rotation=wa.draw.random()*6,size=0.75+0.1*(wa.draw.random()*2-1)}
            looks[p]=v
          end
          local age,size=p.age,v.size
          local t=age/p.life
          if t>1 then t=1 end
          local half=16*(size+(1.75-size)*t)
          local angle=v.rotation+age*0.05
          local c,sn=cos(angle)*half,sin(angle)*half
          local x,y=p.x,p.y
          local color=floor(255-220*t)*0x1000000+0x80DC80
          if quads then
            buf[n+1],buf[n+2],buf[n+3],buf[n+4]=x-c+sn,y-sn-c,x+c+sn,y+sn-c
            buf[n+5],buf[n+6],buf[n+7],buf[n+8]=x+c-sn,y+sn+c,x-c-sn,y-sn+c
            buf[n+9]=color
            n=n+9
            if n==MAX then batch.count=4096;quads(batch);n=0 end
          else
            c1[1],c1[2]=x-c+sn,y-sn-c
            c2[1],c2[2]=x+c+sn,y+sn-c
            c3[1],c3[2]=x+c-sn,y+sn+c
            c4[1],c4[2]=x-c-sn,y-sn+c
            q.color=color
            quad(q)
          end
        end
      end
    end
    if n>0 then batch.count=n//9;quads(batch) end
  end)
end
return weapon
