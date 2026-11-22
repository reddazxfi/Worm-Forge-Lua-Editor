-- Random Race: each round of turns races with one movement weapon, chosen at random.

return { install = function(ctx) require("scheme/random_race").install(ctx) end }
