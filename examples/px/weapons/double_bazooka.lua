-- Double Bazooka: a bazooka whose shell fires a second shell from where the first one explodes.

local weapon = {}

weapon.record = {
  missile = {
    bounce = {
      bounciness = 0,
    },
    explosion = {
      power = 20,
    },
    trail = {
      power = 20,
    },
  },
}

function weapon.definition()
  local shared = require("lib/shared")
  return require("lib/weapon").merge(weapon.record, {
    copy_from = "stock.bazooka",
    name = "Double Bazooka",
    panel_icon = "sprites/double_bazooka/double_bazooka_ico.png",
    on_explode = function(ev) shared.double_bazooka_explode(ev) end,
  })
end

function weapon.setup()
  local shared = require("lib/shared")

  do

  local DB_SECOND = { damage = 40, fuse = 5000 }
  local DB_HOLE = 50

  local db_second = {} -- missile id -> true: a second shell, which ends it
  local db_pending = {} -- second shells to launch once the blast is over
  local db_shooter -- the worm that fired it (PX's ClWT / ClWN)
  local db_launching = false -- a burst now is a second shell's, bursting as WA builds it

  shared.double_bazooka_explode = function(ev)
    local id = ev.missile
    if not id then
      return
    end
    if db_launching or db_second[id] then
      db_second[id] = nil
      return
    end
    wa.land.cut({ x = ev.x, y = ev.y, shape = "circle", radius = DB_HOLE })
    db_pending[#db_pending + 1] = { x = ev.x, y = ev.y, vx = ev.vx or 0, vy = ev.vy or 0 } -- point blank: its launch speed
  end

  wa.on.worm_message(function(worm, msg)
    if msg == wa.msg.FIRE_WEAPON and worm.weapon == "px.double_bazooka" then
      db_shooter = worm
    elseif msg == wa.msg.FRAME_FINISH and #db_pending > 0 then
      local owner = db_shooter or worm
      local pending = db_pending
      db_pending = {}
      db_launching = true
      for _, p in ipairs(pending) do
        local ok, id = pcall(wa.weapons.launch, {
          weapon = "px.double_bazooka", owner = owner, x = p.x, y = p.y, vx = p.vx, vy = p.vy,
          missile = { explosion = { power = DB_SECOND.damage }, fuse = DB_SECOND.fuse },
        })
        if ok and id then db_second[id] = true end
      end
      db_launching = false
    end
  end, { msgs = { wa.msg.FIRE_WEAPON, wa.msg.FRAME_FINISH } })
  end
end

return weapon
