-- Mines Gun: launches six mines with delayed fuses.

return {
  definition = {
    copy_from = "stock.uzi",
    name = "Mines Gun",
    panel_icon = "sprites/mines_gun/icon.png",
    handling = {remember_selection=false,ends_turn=false,retreat=3000},
    gun = {bullets=6,shot_interval_ms=-2},
    on_fire = function(shot)
      wa.mines.spawn{
        owner=shot.worm,x=shot.x,y=shot.y,
        vx=shot.vx*12,vy=shot.vy*12,
        arm=3000,fuse=3000,damage=30,radius=50,
        triggered=true,terrain_keep_speed_pct=60,
      }
    end,
  },
}
