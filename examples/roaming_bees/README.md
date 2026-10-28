# Keeper Bee

reddaz's Project X bee (the report's §5 queue entry `bee.pxc` -> `bee_spawner.lua`),
ported from the API 1.0 script `bee.lua` to WormForge **API 4**.

| Component | What it is |
|---|---|
| `spawn.bees.keeper` | The launcher. Fires a bee: it spins out of the muzzle for half a second, then hunts the first worm that moves inside 235 px, stings it on contact (40 damage) and bursts. |
| `spawn.bees.swarm` | An add-on. Seeds the map with rogue bees on the first turn: one per map slice, on ground a worm can stand on. |

A bee that loses its target, drifts more than 420 px from where it hatched, or
hunts for more than 160 frames gives up, spins where it stands and looks again
a few seconds later. Bees die in water, and a spinning bee that runs out of
spins detonates.

- `mod.toml` -- the bundle: one weapon, one add-on, and the add-on's two options.
- `weapons/keeper_bee.lua`, `features/bee_swarm.lua` -- the entry points
  (`install(ctx)`, REPORT.md 11.11).
- `lib/bee.lua` -- the port: the AI, the spawner and both installs. The API 2
  original is kept at `porting-analysis/_superseded/random_bees/bee.lua`.
- `profiles/Keeper Bee.toml` -- a profile placing the weapon in F1 and the swarm
  on, infinite ammo.
- `sprites/`, `sounds/` -- PX's own bee art and buzzes, unchanged.
- Checked clean: `wfcheck API-4.0/random_bees --strict
  --exclude semantic_all_rules.lua` -> no errors or warnings (REPORT.md 20);
  `check_paths.py` -> every declared path resolves.

## The profile settings

Both settings the script had hard-coded are the add-on's options, so the
loader's Profile tab draws them and a profile owns them:

```toml
features = ["spawn.bees.swarm"]

[weapons]
"spawn.bees.keeper" = { row = "F1", column = 1 }

[weapon_settings."spawn.bees.keeper"]
ammo = -1

[options."spawn.bees.swarm"]
spawn_map_bees = true    # whether or not the map is seeded at all
bee_amount     = 22      # how many bees (1-60)
```

`bee_amount` is the API 2 file's `BEE_SPAWN_QUANTITY` (`:4`), and
`spawn_map_bees` replaces its once-only `spawnedMapBees` gate (`:7`, `:647`) --
turning it off leaves the launcher alone in the match. `ammo`/`delay`/`crate`
are the weapon's own profile settings, as every weapon's are (the original
handed the slot no ammo numbers at all).

The swarm is an **add-on, not part of the weapon**, because API 4 gives
declared options to features only (`crates/weapons/src/components.rs:160`,
"Features: their settings"; a weapon's own `defaults` may only carry the
weapon-data fields, `bundles.rs` `WEAPON_DATA`). Placing the weapon without the
add-on is a valid profile: the launcher works, the map stays clear.

## What the port changed

Every line below is the API 2 call and its API 4 replacement; the numbers are
the original `bee.lua`'s lines.

| Original | API 4 | Why |
|---|---|---|
| `math.cos`/`math.sin`/`math.atan` (`:68`, `:426`, `:461`) | `wa.math.cos`/`sin`/`atan` | Lua's go to each machine's C runtime and can differ in the last bit: a desync. The engine's are WA's sine table and a portable atan (`wfcheck` rule `lockstep-rng`). |
| `math.deg` (`:426`, `:461`) | `rad * (180 / math.pi)` | No engine twin; it is one multiply. (The original's loop variables also named `deg` are `angdeg` here, so they do not shadow it.) |
| `wa.random(-rangeX, rangeX)`, `wa.random(sliceStart, sliceEnd)` (`:212`, `:570`) | the same, floored first | `wa.random` takes whole numbers (`spawn.rs` `random_fn`); the original handed it floats (`ROAM_RANGE_X * scale`, `waterY`), which the engine refuses rather than rounds. |
| `wa.on.worm_message(...)`, `worm.id == 1*16+1`, `gameFrame > 2` (`:644-657`) | `wa.on.turn_start` | The API 2 file spawner. `turn_start` is the API 4 event that carries the turn's worm (`dispatch.rs` `turn_event`). |
| `wa.worms.active()` (`:487`) | `wa.worms.all()[1]` | API 4's `wa.worms` is `all` and `nearest` only (`spawn.rs` `bind_worms`). |
| `kind = "bee"` (`:499`) | dropped | No `kind` key in a spawn (`spawn.rs` `parse_spawn`); a Lua actor's `.kind` reads `"actor"`, a worm's `"worm"` (`actor.rs:1126`, `:1522`). |
| `size.width`, `size.height`, `waterY = size.h` (`:552-556`) | `wa.world.size().w`/`.h`, `wa.world.water()` | API 4's size table is `{ w, h }`; the real water line is `wa.world.water()`, with the map height as the no-water fallback. |
| `for currentSlice = 0, ...` (`:557`) | `local` | It leaked a global. |
| `playBuzz(worm or { x = fire.x, y = fire.y })` (`:626`) | `playBuzz(fire.worm)` | `wa.sound.play` takes a live handle; a plain `{x, y}` table is not one. |
| `wa.weapons.replace` with `may be wrong weapon    = "px.kbee"` and `Add icon here:sprites/beeico.png` (`:603-639`) | `wa.weapons.replace` in `install_weapon` | The two plain-text lines were markers, not code, and they are why the API 2 file does not compile at all (`:604`, `'}' expected ... near 'be'`): the first meant the key `weapon`, which names a *placed* weapon a `replace` aims at (`api.rs:1096-1103`) and is unnecessary here -- a component replaces its own placed slot -- and the second asks for the icon, which is `panel_icon` (the author's commented-out `--panel_icon = "sprites/beeico.png"` is still there at `:612`). |
| `is_weapon = true`, `copy_from = "bazooka"` (`:606-608`) | `is_weapon = true`, `copy_from = "stock.bazooka"` | `copy_from` names the stock weapon by its catalogue id (`api.rs` `weapon_ids::template`). |
| `params = { gpu_prefix = "sprites/bee_", sprite_columns = 4 }` (`:611`) | `params = { gpu_prefix = "sprites/" }` | `bee_flight.png` is 32x128: four 32x32 frames stacked, which the loader slices on its own (`gfx::load_strip_bytes`, the `h > w` branch), so `sprite_columns` has nothing to do. The prefix must cover the aim and throw GIFs too (`sprites/aim_*`, `sprites/draw_*`), and putting the sheets in the atlas is what PX's own bundles do. |
| `sprites = { SPRITE }`, `sounds = beeSOUNDS`, `worm_sprites = {...}` (`:610-622`) | the same | All three are API 4 spec keys already; `worm_sprites`' six names are WA's own slot names (`gfx.rs` `stock_worm_sprite_id`). |
| `on_fire = function(fire) ... end` (`:624-638`) | the same | An `on_fire` callback on a projectile weapon eats WA's own shell (`crates/engine/src/actor.rs` `try_lua_projectile`), so exactly one bee leaves the muzzle -- the API 2 behaviour. |
| `on = brain` (`:501`) | `on = { frame = brain, hit = hurt }` | An API 4 brain is a table of `frame`/`land`/`hit`/`contact` (`spawn.rs` `parse_brain`), and only a brain with a `hit` function is handed WA's blasts (`actor.rs` `actor_takes_hits`) -- otherwise the engine just shoves the body. `hurt` takes the damage into the bee's health and adds the knock the engine left for it, which is the original's `ev.damage` block (`:308-313`) with PX's push made explicit. |

## Known gaps

- **A round after the first gets no swarm.** API 4 has no round-start hook
  (`dispatch.rs` `turn_event`: `turn_start`, `turn_retreat`, `turn_end`,
  `turn_cleanup`), and the API 2 script was match-once too (`spawnedMapBees`
  never reset). The swarm now asks again on a later turn while the map gave it
  nowhere to stand, but a second round in the same match stays bare.
- `beespb.png` (28x28) and `flight_muitb55w.png` (32x32) are unused. The first
  is the sprite-builder's weapon-in-hand sheet -- the aim GIFs already draw the
  weapon in the worm's hands -- and the second is PX's missile flight sprite,
  which no longer exists: the shot is a Lua bee.
- `s.supercharged`, `s.freeMe`, `s.stopMe`, `s.bonkhome` and `s.ambientBuzzCD`
  are set (or read) by the original and never driven by it: they are hooks for
  code that never came. They are kept as the original left them.
- `mod_icon.png` is API 2's loader picture; API 4 takes the weapon's icon from
  the manifest's `icon`, which is PX's `sprites/beeico.png`.
- `semantic_all_rules.lua` in this folder is **not part of the mod**: it is the
  compiler's own regression fixture, a file written to trip every semantic rule
  on purpose. It is not an entry of any component, so the game never loads it;
  it is only why the check above passes `--exclude`.
- The bee's blast is PX's `id = 100` (`:249`), the same number the dev's own
  `Mods/labs/echo_mine.lua:38` uses for an actor's explosion.
