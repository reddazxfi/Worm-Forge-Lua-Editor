-- Specialists 2.3 (five worms), 0rang3's September 2026 build.

return {
  classes = {
    { name = "Soldier", hp = 150,
      weapons = { "stock.bazooka", "stock.grenade", "px.mines_gun", "px.tnt", "px.chilli_bomb" },
      survivor = { "px.parkour" } },
    { name = "Gunner", hp = 175,
      weapons = { "px.gatling_gun", "stock.prod", "px.swim_suit", "px.sentry_gun", "px.platform" },
      survivor = { "stock.banana_bomb" } },
    { name = "Engineer", hp = 150,
      weapons = { "px.gravity_gun", "stock.blow_torch", "stock.girder", "px.sentry_laser", "stock.mine", "px.electromagnet" },
      survivor = { "px.tele_arrow", "px.remote_roller" } },
    { name = "Ninja", hp = 150,
      weapons = { "px.jump", "stock.fire_punch", "px.ninja_star", "stock.petrol_bomb", "stock.ninja_rope" },
      survivor = {} },
    { name = "Medic", hp = 300,
      weapons = { "stock.parachute", "px.real_shotgun", "stock.teleport" },
      survivor = { "stock.holy_grenade" } },
  },
  delays = {
    ["stock.bazooka"] = 1, ["stock.grenade"] = 1, ["px.mines_gun"] = 2,
    ["px.tnt"] = 2, ["px.chilli_bomb"] = 2, ["px.parkour"] = 1,
    ["px.gatling_gun"] = 1, ["stock.prod"] = 1, ["px.sentry_gun"] = 3,
    ["px.platform"] = 1, ["stock.banana_bomb"] = 1, ["stock.blow_torch"] = 1,
    ["stock.girder"] = 2, ["px.sentry_laser"] = 3, ["stock.mine"] = 2,
    ["px.electromagnet"] = 3, ["px.tele_arrow"] = 2, ["px.remote_roller"] = 1,
    ["stock.fire_punch"] = 1, ["px.ninja_star"] = 1, ["stock.petrol_bomb"] = 2,
    ["px.real_shotgun"] = 1, ["stock.teleport"] = 5, ["stock.holy_grenade"] = 1,
  },
}
