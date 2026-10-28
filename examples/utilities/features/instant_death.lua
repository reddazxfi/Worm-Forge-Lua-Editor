-- Let each zero-HP victim die once its own movement settles, without waiting
-- for the battlefield. Frame polling also covers falls and direct HP writes.
-- WA owns the death animation, explosion and grave; repeat requests are inert.
wa.on.worm_message(function(worm)
  if not worm.turn and worm.hp == 0 then
    worm:allow_death()
  end
end, { msgs = { wa.msg.FRAME_FINISH } })
