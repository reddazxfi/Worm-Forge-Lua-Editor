-- Let each zero-HP victim die without waiting for the battlefield.

return function(mode)
  local in_flight = mode == "in_flight"
  wa.on.worm_message(function(worm)
    if not worm.turn and worm.hp == 0 then
      if not (in_flight and worm:die()) then
        worm:die{ settled = true }
      end
    end
  end, { msgs = { wa.msg.FRAME_FINISH } })
end
