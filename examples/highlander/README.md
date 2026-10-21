# Highlander (pure Lua reference)

This is the original educational implementation before `wa.inventory`, `wa.on.turn_start`, and `wa.on.death`. Do not enable it together with the verb-based `highlander` pack.

The gameplay rules of Project X's *Highlander 0rang3 1.1*, played with WA's
own weapons. There are no custom weapons yet. The point is to test the rules
on their own.

## Rules

- At the start of the match, every worm is dealt **one weapon from each
  pool**.
- On a worm's turn it can use **exactly its own weapons, one shot of each**.
  Nobody else holds any pooled weapon, whatever the scheme says.
- Next turn it gets them back. Firing doesn't use a weapon up for good.
- **When a worm dies, the worm whose turn it is takes everything the dead
  worm carried**, and can use it that same turn. That includes friendly and
  accidental kills, as in PX. A worm that dies on its own turn simply loses its
  weapons.
- **On cavern maps, nothing that falls from the sky is dealt.**

| Pool | Weapons |
|---|---|
| Movement (7) | ninja rope, girder, girder pack, jet pack, low gravity, fast walk, parachute |
| Second (8) | the F4 row (fire punch, dragon ball, kamikaze, suicide bomber, prod), plus blow torch, pneumatic drill, baseball bat |
| Offensive (42) | every other weapon that does damage, super weapons included |
| Not pooled (13) | bungee, teleport, scales of justice, select worm, freeze, skip go, surrender, and the utilities (laser sight, invisibility, damage x2, crate spy, double turn time, crate shower) |

Highlander never touches the **not pooled** slots. Their ammo is whatever
the scheme gives, so the scheme decides whether teleport or skip go is always
available.

Cavern maps drop air strike, napalm strike, mail strike, mine strike, mole
squadron, sheep strike, carpet bomb, donkey and armageddon from the offensive
pool.

## Playing it

1. Enable only this pack in the mod loader. Packs that replace a stock slot,
   such as `sentry_gun`, `pooz` or `worm_toss`, would put their weapon into the
   pool in place of the stock one.
2. Any scheme works. The pooled slots are overwritten every turn, including
   ones the scheme has at infinite.
3. `wkLua.log` records every hand dealt and every weapon taken:
   `highlander: worm 16 took ... from worm 32`.

## Differences from PX

These are deliberate, and each one is explained in `rules.lua`:

- Wind Changer and Hot Air Balloon are PX weapons with no stock equivalent,
  so nothing is granted in their place.
- There's no removal at turn end. The next turn start does the same job.
- Strikes are banned from caverns **by name**. PX did it by shortening its
  random range, which only worked because the strikes happened to be last in
  its list.
- Every pooled slot is zeroed at each turn start, not only the previous
  worm's. PX left that to its own scheme; here any scheme works.

## Lockstep

Every rule runs inside `wa.on.worm_message`, which is WA's own simulation.
Every random choice is `wa.random()`, which draws from WA's shared RNG, and
hands are dealt in worm-id order. Two peers, or a replay, deal the same
hands. Nothing reads local input or the clock.

## Engine features it needed

- `worm:ammo(name, { set = n })`: an absolute ammo write, WormForge's
  version of PX's `SetWeaponEx`. The older `worm:ammo(name, n)` adds to
  the current ammo and never changes infinite.
- `wa.world.cavern()`: WA's own cavern flag (`GameWorld+0x777C`).
- A fix: granting ammo used to move the weapon into the F1 panel row. It now
  stays in its own row.
- A fix: ammo **writes** went to the wrong row. The engine read a team's
  alliance from a different field than WA's own `GetAmmo` does, so every
  team's writes landed in the first team's row. Only that team ever played by
  Highlander rules.

## Tests

```sh
lua mods/examples/highlander_pure_lua/test_rules.lua     # from the repo root
```

These run `rules.lua` against a mocked WA. Ammo is stored per alliance, and
the mock scheme has an infinite bazooka. Which row a team's writes land in is
the engine's job, and the mock can't test it. They cover:
- pool coverage (57 pooled slots, and the 13 others never touched)
- deterministic dealing, including worms that appear late
- cavern hands
- per-turn ownership and taking weapons back
- a stolen hand usable the same turn and kept afterwards
- friendly kills
- no double transfer
- a worm dying on its own turn

**Not verified in game yet.**
