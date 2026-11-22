-- Barrel Launcher: launches one of five special oil drums, chosen with keys 1-5.

local weapon = {}
local ID = "px.barrel_launcher"
local ART = "sprites/barrel_launcher/"
local TAZER = "sounds/barrel_launcher/tazsnd.wav"

local CHOICES = {
  { kind = "napalm", name = "Napalm Barrel", sound = 59 },
  { kind = "mine", name = "Mines Barrel", sound = 88 },
  { kind = "electric", name = "Electric Barrel", sound = TAZER },
  { kind = "icy", name = "Ice Barrel", sound = 24 },
  { kind = "teleport", name = "Teleport Barrel", sound = 67 },
}

weapon.requires = { "lib/electrical" }

local choice = 1

local function launch(fire)
  local worm = fire.worm
  if wa.world.collides({ x = fire.x, y = fire.y, radius = 9 }) then
    wa.sound.play(worm, 120)
    worm:ammo(ID, 1)
    require("lib/weapon_hint").notice(worm, "No space to launch!")
    return
  end
  require("lib/oil_drums").launch(CHOICES[choice].kind, fire.x, fire.y, fire.vx, fire.vy)
end

weapon.definition = {
  wep = "weps/barrel_launcher.wep",
  name = "Barrel Launcher",
  panel_icon = ART .. "bl_ico.png",
  worm_sprites = {
    weaponlnk = ART .. "aim.png", weaponlnku = ART .. "aimu.png", weaponlnkd = ART .. "aimd.png",
    wthrow = ART .. "draw.png", wthrowu = ART .. "drawu.png", wthrowd = ART .. "drawd.png",
  },
  sounds = { TAZER },
  on_fire = launch,
}

function weapon.setup()
  local drums = require("lib/oil_drums")
  drums.install({})
  drums.load_assets()
  wa.on.turn_start(function() choice = 1 end)
  wa.on.turn_end(function() choice = 1 end)
  local held = {}
  wa.on.worm_message(function(worm)
    local digit
    if worm.turn and worm.weapon == ID then digit = wa.world.keys().digit end
    local pressed = digit and digit >= 1 and digit <= #CHOICES and digit or nil
    if pressed and held[worm.id] ~= pressed then
      choice = pressed
      wa.sound.play(worm, CHOICES[pressed].sound)
    end
    held[worm.id] = pressed
  end, { msgs = { wa.msg.FRAME_FINISH } })
  require("lib/weapon_hint").hint(ID, function()
    return "Barrel Launcher: " .. CHOICES[choice].name .. "\n1-" .. #CHOICES .. ": choose a barrel"
  end)
end

return weapon
