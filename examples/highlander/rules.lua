-- Highlander, stock weapons only.
--
-- A port of the rules in Project X's `scheme_hl_0rang3` (Highlander 0rang3
-- 1.1), without its custom weapons. Every worm is dealt one weapon from each
-- of three pools at the start of the match. Only the worm whose turn it is
-- may use its weapons, one shot of each per turn. Kill a worm and you take
-- everything it carried.
--
-- The source (`highlander.txt`) does all of this with four calls:
-- SetWeaponEx(team, weapon, 1) to grant and SetWeaponEx(team, weapon, 0) to
-- take away. `worm:ammo(name, { set = n })` is the same absolute write. It has
-- to be absolute: a stock scheme gives some of these weapons infinite ammo,
-- and adding to infinite leaves it infinite.
--
-- Where this differs from the source, on purpose:
--
--   * No turn-end removal. PX removes a worm's weapons at M_TURNEND and again,
--     through CurW, at the next M_TURNBEGIN. The second alone is enough, so
--     this listens for one message instead of two.
--
--     START_TURN (0x34) reaches only the worm whose turn it is: WA's handler
--     marks the receiver turn-active and calls TeamArena::SetActiveWorm on it
--     unconditionally (OpenWA `msg_start_turn`), which would be nonsense sent
--     to every worm. So the worm it arrives on IS the active worm.
--
--   * Every pooled slot is zeroed for every team at each turn start, not
--     just the previous worm's. PX relied on its scheme having those slots at
--     zero. Here the scheme can say anything, so the pack enforces it itself.
--
--   * Wind Changer (x1) and Hot Air Balloon (x3) are PX weapons with no stock
--     equivalent, so nothing is granted in their place.
--
--   * The cavern rule bans strikes by NAME. PX did it by cutting the random
--     range short (RandomInt(0,20) instead of (0,28)), which only works
--     because its list happened to keep the strikes at the end.
--
-- Lockstep: every rule runs inside wa.on.worm_message, which is WA's own
-- simulation, and every random choice is wa.random(). Two peers, or a peer
-- and a replay, deal the same hands and make the same grants. Nothing here
-- reads local input or the clock.

-- ----------------------------------------------------------------- pools

-- Movement: exactly the seven the design names.
local MOVEMENT = {
  "ninja_rope", "girder", "girder_pack", "jet_pack", "low_gravity",
  "fast_walk", "parachute",
}

-- Second weapon: the F4 row, plus what is left of F7 once the girders have
-- gone to movement.
local SECOND = {
  "fire_punch", "dragon_ball", "kamikaze", "suicide_bomber", "prod",
  "blow_torch", "pneumatic_drill", "baseball_bat",
}

-- Offensive: every remaining weapon that does damage, super weapons included.
-- The non-attacks -- bungee, teleport, scales, select worm, freeze, the
-- utilities, skip go and surrender -- are not in any pool. Highlander never
-- touches them, so their ammo is whatever the scheme says.
local OFFENSIVE = {
  -- F1-F3
  "bazooka", "homing_missile", "mortar", "homing_pigeon", "sheep_launcher",
  "grenade", "cluster_bomb", "banana_bomb", "battle_axe", "earthquake",
  "shotgun", "handgun", "uzi", "minigun", "longbow",
  -- F5-F6
  "dynamite", "mine", "sheep", "super_sheep", "aqua_sheep", "mole_bomb",
  "air_strike", "napalm_strike", "mail_strike", "mine_strike", "mole_squadron",
  -- F9-F11
  "super_banana", "holy_grenade", "flame_thrower", "salvation_army", "mb_bomb",
  "petrol_bomb", "skunk", "ming_vase", "sheep_strike", "carpet_bomb",
  "mad_cow", "old_woman", "donkey", "nuclear_test", "armageddon",
  -- F12
  "magic_bullet",
}

-- Everything that arrives from the sky. PX keeps strikes out of caverns, where
-- they would hit the roof.
local CAVE_BANNED = {
  air_strike = true, napalm_strike = true, mail_strike = true,
  mine_strike = true, mole_squadron = true, sheep_strike = true,
  carpet_bomb = true, donkey = true, armageddon = true,
}

-- Every slot this pack owns, in a fixed order. Zeroing walks this list, so it
-- must not depend on pairs() order: Lua's string hashing is seeded per
-- process, and a different order on each peer is a different sequence of
-- writes.
local POOLED = {}
for _, pool in ipairs({ OFFENSIVE, SECOND, MOVEMENT }) do
  for _, name in ipairs(pool) do
    POOLED[#POOLED + 1] = name
  end
end

-- ----------------------------------------------------------------- state

-- Keyed by stable worm id (team * 16 + index), which is the same on every
-- peer and in a replay. Never by handle: a handle is an entity address, and a
-- dead worm's entity is freed while its id lives on in these tables.
local hands = {} -- [id] = { weapon names }, draw order first, then stolen
local dead = {} -- [id] = true once the worm has been seen at 0 hp
local active_id -- PX's CurW: the worm whose turn it is, or was

local function by_id(a, b)
  return a.id < b.id
end

-- The live worms, in id order. Called fresh every time rather than cached:
-- the list shrinks as worms die, and a cached handle to a freed worm would be
-- a read of freed memory.
local function worms()
  local list = wa.worms.all()
  table.sort(list, by_id)
  return list
end

local function find(id)
  for _, w in ipairs(worms()) do
    if w.id == id then
      return w
    end
  end
  return nil
end

local function describe(list)
  if not list or #list == 0 then
    return "(nothing)"
  end
  return table.concat(list, ", ")
end

-- ----------------------------------------------------------------- rules

local function draw(pool)
  return pool[wa.random(1, #pool)]
end

local function offensive_pool()
  if not wa.world.cavern() then
    return OFFENSIVE
  end
  local pool = {}
  for _, name in ipairs(OFFENSIVE) do
    if not CAVE_BANNED[name] then
      pool[#pool + 1] = name
    end
  end
  return pool
end

-- One from each pool, dealt to a worm on the first message it receives -- as
-- PX does on each worm's first M_FRAME. Dealing everyone at once on the very
-- first message would assume every worm already exists by then; this makes no
-- such assumption. Worms receive messages in WA's own entity order, which is
-- the same on every peer, so the draws still come out of WA's RNG in the same
-- sequence everywhere.
local function deal(worm)
  local cave = wa.world.cavern()
  hands[worm.id] = { draw(offensive_pool()), draw(SECOND), draw(MOVEMENT) }
  wa.log(string.format(
    "highlander: worm %d dealt %s (%s map)",
    worm.id, describe(hands[worm.id]), cave and "cavern" or "open"
  ))
end

local function set_all(worm, list, n)
  for _, name in ipairs(list) do
    worm:ammo(name, { set = n })
  end
end

-- Take every pooled weapon away from every team.
--
-- WA keeps ammo in separate physical rows (`worm.ammo_group`), which need not
-- match a team's visible coalition colour (`worm.alliance`).
-- Going through one worm of each team reaches every row without relying on
-- that mapping -- a row two allied teams share is simply written twice.
local function clear_pooled()
  local seen = {}
  for _, w in ipairs(worms()) do
    if not seen[w.team] then
      seen[w.team] = true
      set_all(w, POOLED, 0)
    end
  end
end

local function start_turn(worm)
  clear_pooled()
  active_id = worm.id
  set_all(worm, hands[worm.id] or {}, 1)
end

-- PX checks every worm on every frame for "0 hp and not yet marked dead".
local function check_death(worm)
  local id = worm.id
  if dead[id] or worm.hp > 0 then
    return
  end
  dead[id] = true
  local mine = hands[id] or {}

  if active_id == id then
    -- Died on its own turn: nothing to hand on, just take its weapons away.
    set_all(worm, mine, 0)
    wa.log(string.format("highlander: worm %d died on its own turn", id))
    return
  end

  -- Otherwise the worm whose turn it is gets everything -- whoever or
  -- whatever did the killing, friend or foe, exactly as in PX.
  if active_id == nil or dead[active_id] then
    return
  end
  local stealer = find(active_id)
  if not stealer then
    return
  end
  local theirs = hands[active_id]
  for _, name in ipairs(mine) do
    theirs[#theirs + 1] = name
  end
  -- Usable at once, this turn, not from the stealer's next turn.
  set_all(stealer, mine, 1)
  wa.log(string.format(
    "highlander: worm %d took %s from worm %d", active_id, describe(mine), id
  ))
end

wa.on.worm_message(function(worm, msg)
  if hands[worm.id] == nil then
    deal(worm)
  end
  if msg == wa.msg.START_TURN then
    start_turn(worm)
  elseif msg == wa.msg.FRAME_FINISH then
    check_death(worm)
  end
end)
