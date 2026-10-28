-- Live HP, originally by reddaz. Commit WA's pending health display directly;
-- native hit, movement, freeze and death handling retain their own states.
wa.on.hurt(function(hit)
  if hit.phase ~= "post" or hit.lost <= 0 then return end
  local worm = hit.worm
  -- Keep the active worm's normal health timing. A zero-HP victim can
  -- update its label now while WA still owns its later death sequence.
  if not worm.turn and worm.hp >= 0 then
    worm:commit_health()
  end
end)
