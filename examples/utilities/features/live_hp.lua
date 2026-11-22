-- Live HP, originally by reddaz.

local function can_show(worm)
  local ok, show = pcall(function() return worm.show_health end)
  return ok and show ~= nil
end

wa.on.hurt(function(hit)
  if hit.phase ~= "post" or hit.lost <= 0 then return end
  local worm = hit.worm
  if worm.turn or worm.hp < 0 then return end
  if worm.hp == 0 and can_show(worm) then
    worm:show_health()
  else
    worm:commit_health()
  end
end)
