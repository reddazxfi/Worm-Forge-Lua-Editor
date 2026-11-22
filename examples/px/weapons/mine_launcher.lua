-- Mine Launcher: fires an instant, sticky or invisible mine, chosen with keys 1-3.

local weapon = {}
local ID = "px.mine_launcher"
local ART = "sprites/mine_launcher/"

local MODES = {
  { name = "Instant Mine, 0 SEC", arm = 400, fuse = 0, keep = 96 },
  { name = "Sticky Mine, 1.5 SEC", arm = 2000, fuse = 1500, sticky = true },
  { name = "Invisible Mine, 3 SEC", arm = 2000, fuse = 3000, keep = 96, hidden = true },
}
local SELECT_WEAPON = 51

local mode = 1
local sticky = {}

local function bump(mine, ev)
  local s = sticky[mine.id]
  if not s or s.released then return end
  if not s.stuck then
    mine.x, mine.y, mine.vx, mine.vy = ev.x, ev.y, 0, 0
    mine.gravity = 0
    wa.sound.play(mine, 107)
    wa.sound.play(mine, 56)
    s.stuck = true
  else
    mine.gravity = 1
    s.released = true
  end
end

local function launch(fire)
  local m = MODES[mode]
  local mine = wa.mines.spawn({
    owner = fire.worm, x = fire.worm.x, y = fire.worm.y, vx = fire.vx, vy = fire.vy,
    arm = m.arm, fuse = m.fuse, damage = 50, radius = 48,
    terrain_keep_speed_pct = m.keep,
    on_contact = m.sticky and bump or nil,
  })
  if not mine then return end
  if m.hidden then mine.visible = false end
  if m.sticky then sticky[mine.id] = { mine = mine } end
end

weapon.definition = {
  wep = "weps/mine_launcher.wep",
  name = "Mine Launcher",
  panel_icon = ART .. "minelauncher_ico.png",
  worm_sprites = {
    weaponlnk = ART .. "aim.png", weaponlnku = ART .. "aimu.png", weaponlnkd = ART .. "aimd.png",
    wthrow = ART .. "draw.png", wthrowu = ART .. "drawu.png", wthrowd = ART .. "drawd.png",
  },
  on_fire = launch,
}

function weapon.setup()
  wa.on.turn_start(function() mode = 1 end)
  wa.on.turn_end(function() mode = 1 end)
  local held, last = {}, nil
  wa.on.worm_message(function(worm, msg)
    if msg == SELECT_WEAPON then
      if worm.turn then mode = 1 end
      return
    end
    local frame = wa.world.frame()
    if frame ~= last then
      last = frame
      local live = {}
      for _, mine in ipairs(wa.mines.all()) do
        live[mine.id] = true
        local s = sticky[mine.id]
        if s and s.stuck and not s.released and (mine.vx ~= 0 or mine.vy ~= 0) then
          mine.gravity = 1
          s.released = true
        end
      end
      for id in pairs(sticky) do
        if not live[id] then sticky[id] = nil end
      end
    end
    local digit
    if worm.turn and worm.weapon == ID then digit = wa.world.keys().digit end
    local pressed = digit and digit >= 1 and digit <= #MODES and digit or nil
    if pressed and held[worm.id] ~= pressed then
      mode = pressed
      wa.sound.play(worm, 92)
    end
    held[worm.id] = pressed
  end, { msgs = { wa.msg.FRAME_FINISH, SELECT_WEAPON } })
  require("lib/weapon_hint").hint(ID, function()
    return "Mine Launcher: " .. MODES[mode].name .. "\n1-" .. #MODES .. ": choose a mine"
  end)
end

return weapon
