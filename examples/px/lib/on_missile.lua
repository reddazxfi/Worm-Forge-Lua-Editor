-- On missile: wa.on.missile_frame for some weapons or one phase; a DLL without the options runs it for every missile.
return function(handler, filter)
  if not pcall(wa.on.missile_frame, handler, filter) then wa.on.missile_frame(handler) end
end
