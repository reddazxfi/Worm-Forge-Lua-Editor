-- Tazer: a chain-lightning shot that arcs between worms; it doesn't end the turn.

local weapon = {}
weapon.definition = {
  copy_from="stock.handgun",
  name="Tazer",
  panel_icon="sprites/tazer/ico_tazer.png",
  fires={subtype=8},
  handling={remember_selection=false,ends_turn=false,retreat=3000},
  gun={bullets=1,impact_effect=3,shot_interval_ms=0,spread_deg=25,
    explosion={bias=20,push_pct=100}},
  worm_sprites={
    weaponlnk="sprites/tazer/wtazer.png",weaponlnku="sprites/tazer/wtazeru.png",
    weaponlnkd="sprites/tazer/wtazerd.png",wthrow="sprites/tazer/wtazlnk.png",
    wthrowu="sprites/tazer/wtazlnku.png",wthrowd="sprites/tazer/wtazlnkd.png",
    weaponfire="sprites/tazer/wtazer.png",weaponfireu="sprites/tazer/wtazeru.png",
    weaponfired="sprites/tazer/wtazerd.png",
  },
  sprites={"wf-lib/px/sprites/lightning/beam.png","wf-lib/px/sprites/lightning/glow.png","wf-lib/px/sprites/lightning/cloud.png",
    "sprites/electric_grenade/explosion.png","sprites/electric_grenade/tazed1.png",
    "sprites/electric_grenade/tazed2.png"},
  sounds={"sounds/lightning/tazer_loop.wav"},
  params={gpu_prefix="sprites/"},
  on_fire=function(ev)
    local worm=ev.worm
    local angle=(1-worm.aim)*math.pi
    if worm.facing<0 then angle=2*math.pi-angle end
    local dx,dy=wa.math.sin(angle),-wa.math.cos(angle)
    require("lib/electrical").context().start_arc{
      x=worm.x+4*dx,y=worm.y+4*dy,dx=dx,dy=dy,worm=worm,ignore={worm},burst=false,
    }
  end,
}
weapon.requires={"lib/electrical"}
return weapon
