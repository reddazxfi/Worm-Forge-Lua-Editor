# WormBench 1.0 / Lua API 5: what changed

This is the migration note for packs written against **API 4** (WormBench
0.9.x). WormBench 1.0 is **Lua API 5**. The canonical verb list is
`spec/verbs.md`; this page is the short version of what moved, vanished or
started behaving differently.

The manifest value is now:

```toml
api_version = 5
```

A pack that still declares `4` is refused by the engine with a pointer to the
1.0 release notes. The editor, the checker data and both Rust checkers use the
same API 5 surface.

## Quick rename table

| API 4 | API 5 |
|---|---|
| `worm:hurt(...)` | `worm:hit(...)` |
| `a:despawn()` | `a:remove()` |
| `a:cut(...)` | `wa.land.cut(...)` |
| `a:spawn(...)` | `wa.actors.spawn(...)` |
| `a:sound(...)` | `wa.sound.play(a, ...)` |
| `a:angle`, `a:scale`, `a:tint`, `a:blend` | `a:gfx{ angle, scale, tint, blend }` |
| `a:gravity()` | `a.gravity` (a factor) |
| `a:advance()` | `a:frame(i)` with a pack-owned counter |
| `worm:drop()` | `worm:release(0, 0)` |
| `worm:air_fire(...)` | weapon data: `defaults = { airborne = true }` |
| `worm:allow_death()` | `worm:die{ settled = true }` |
| actor `on.bump` | actor `on.contact` |
| actor `on.contact` | actor `on.touched` |
| mine `on_bump` | mine `on_contact` |
| `keys().sprint` | `shift` |
| `worm:set_state("sinking")` | `worm:set_state("tumbling")` |
| `worm:set_state(... "sliding" ...)` | `worm:set_state(... "falling" ...)` |
| `wa.world.sky` (number) | `wa.world.sky()` (function) |
| `projectile.cluster` | `projectile.cluster_sprite` |
| `wa.weapons.retarget{ cluster = ... }` | `wa.weapons.retarget{ cluster_sprite = ... }` |
| `wa.draw.quads{...}` | `brush:boxes(list)` or `brush:quads(list)` |
| `object.uid` | `object.id`, or `a.id` on actors |

## Removed, with no alias

These are hard errors or silent removals in 1.0; do not keep a fallback in new
code.

- `wa.weapons.register`. Use `wa.weapons.replace`; a bundle's weapon always
  claims its slot through replace.
- `wa.on.gravity_before` and `wa.on.gravity_after`. There is no gravity-step
  hook replacement.
- `a:advance()`. Count frames yourself and call `a:frame(i)`.
- `wa.actors.kind`. An actor's kind is always `"actor"`; keep pack state by
  `a.id`.
- `worm.state_address`. Use `worm.state` names. `worm.state_id` and
  `worm.state_label` are diagnostics-build-only and are for logs, never for
  behaviour.
- `on_collect` and `hit.blast_damage` as weapon-data spellings. `auto_use` and
  `hit.power` are the current names.
- `mole_dig_rotation` from a weapon claim.
- `params.truecolor` and `params.gpu_worm_sprites` from a weapon claim.
- Spawn keys `kind`, `from`, `on_explode`, `collide*`, `as_object`, `screen`,
  `cluster`, top-level `shape`, `solid` and `mask*`.
- A claim's `actor` and `airborne`, and a declarative `spawn = { ... }` claim
  step. Claim steps are functions that spawn with `wa.actors.spawn`; a
  weapon's airborne setting is weapon data.

## Worms

### Taking and releasing

`worm:take` no longer takes `hide`:

```lua
worm:take{ turn = "run", fire = true, fire_as = "bungee" }
```

Hide the worm with `worm.visible = false` or `worm.body_visible = false`.
`worm:carry(x, y)` moves only a taken worm; a worm the pack never took is
refused. `worm:release(vx, vy)` gives it back, and `worm:drop()` is gone.

`worm:allow_death()` is gone. A worm that should die once it settles uses:

```lua
worm:die{ settled = true }
```

### States

`worm.state` names the readable states, including the states added or renamed in
1.0:

- `sliding` became `falling`.
- Added `rope_firing`, `torching`, `after_rope`, `getting_up` and `skimming`.
- `state` has 31 readable names in 1.0; the engine's debug label table has 32,
  and only `ledge` is still marked uncertain.
- `worm:set_state` accepts exactly five names: `standing`, `falling`, `bungee`,
  `tumbling` and `teleporting`.
- `worm:set_state` is an ordinary verb now: every build, any bundle, no
  `debug_worm_state` opt-in. It is still simulation-only, and a worm in WA's
  death is left alone.

`worm:commit_health()` and `worm:teleport_pose()` are available for pack
health-display and teleport-pose work.

### New worm fields

- `worm.mass`: WA's hit/blast push is divided by it, and it weighs the worm when
  bodies trade speed.
- `worm.shape`: `"worm"`, `"mine"` or `nil`.

### HUD and drawing

`wa.hud.line` now takes the GPU form:

```lua
wa.hud.line("Score", { font = "medium", color = "yellow" })
```

It draws on the GPU, handles newlines and wrapping, and has a 1023-byte limit.
`wa.hud.text` has a 255-byte limit and the same newline/wrapping rules.

New HUD/drawing surface in 1.0 includes `wa.hud.size`, `wa.hud.sprite`,
`wa.hud.rect`, `wa.hud.text`, `wa.draw.brush`, `wa.draw.tiles`,
`wa.draw.flakes` and `wa.draw.puffs`.

`wa.draw.brush` is the batch path: `wa.draw.quad` is unchanged, and a brush
replaces `wa.draw.quads`. A brush makes a sheet ready once, then `brush:box`,
`brush:boxes` and `brush:quads` draw many boxes or quads without allocating
tables each rendered frame:

```lua
local glow = wa.draw.brush{ sprite = "sprites/Glow.png", blend = "add" }

wa.on.draw(function()
  glow:box(x, y, 24, 24, angle)
  glow:boxes(puffs, #puffs // 7)
end)
```

`wa.on.skim(fn)` reports a worm skimming off the water, and
`wa.on.missile_frame` takes `{ weapons, phase }` to skip missiles it does not
need.

### Sound and view

- `wa.sound.ambient(...)` returns an ambient handle with `:set(...)` and
  `:stop(...)`.
- `wa.view.disable_zoom()` disables zoom for this machine.
- `wa.world.view()` is draw/HUD-only. It is refused in simulation callbacks,
  like `wa.fog.visible` and `wa.fog.shade`.

## Actors

`wa.actors.spawn` now takes collision and physics in a `body` table:

```lua
wa.actors.spawn{
  sprite = "sprites/thing.png",
  x = 100, y = 200,
  body = {
    physics = "mine",
    shape = "sprites/thing_mask.png",
    hits = { land = true, worms = true },
    hit_by = "all",
    pushed_by = { worms = 1 },
    layer = "object",
    mask = true,
  },
}
```

`gravity` is a plain factor (`1`, not `true`). A spawn with no `body` has no
collision and nothing hits it. The old legacy spawn keys listed above are hard
errors rather than a second accepted form.

Actor hooks follow the engine's meaning:

- `on.touched`: something ran into the actor.
- `on.contact`: the actor's own movement hit something.
- Mines use `on_contact`.

## Weapon claims and records

Cluster art is top-level now:

- `cluster_sprite`
- `cluster_homing_sprite`
- `cluster_homing` (`stock.homing_missile`, `stock.homing_pigeon`,
  `stock.magic_bullet`)

`projectile.cluster` is `projectile.cluster_sprite`. The old held-pose tricks
are replaced by `hold_as = "stock.<name>"`.

`wa.weapons.replace` accepts **64** spec keys in 1.0. The old `wa.weapons.register` form is gone; a bundle's weapon always uses `replace`, and its panel slot comes from the `slot` key.
The record groups are **17**; Armageddon's meteors are the new group:

```lua
wa.weapons.replace{
  copy_from = "stock.armageddon",
  armageddon = {
    meteor = {
      explosion = { power = 90 },
      sprite = 50,
      action = "homing",
      homing = { time = 3000 },
    },
  },
}
```

`armageddon.meteor.*` is a missile body four bytes early and applies only to
Armageddon behaviour (`fires.subtype = 24`).

`wa.weapons.retarget` uses `cluster_sprite` for the swapped cluster sprite.

## Crates and panels

### `wa.crates.set_drop`

```lua
wa.crates.set_drop("pop", { pitch = 3, height = { min = 30, max = 50 } })
wa.crates.set_drop(false) -- WA's own drops again
```

Makes WA's own crates (the turn drop and Crate Shower) pop in until changed
or the round ends; each round starts with the stock drops. `height` is pixels above the land, or a deterministic `{ min, max }`
range; `pitch` is 0 to 12 semitones. Call it from an install or a simulation
callback, never from `wa.on.draw` / `wa.on.hud`. Crates from
`wa.crates.spawn` and donor cards are unchanged.

`wa.crates.odds`, `set_odds`, `shares` and `set_shares` are the other crate
control verbs.

### `wa.panel.stock`

```lua
local panel = wa.panel.stock()
```

Returns WA's own panel on this machine's screen during `wa.on.hud`: `nil` while
it is shut, else `{ x, y, w, h, open, opened, cells }` in screen pixels. Each
cell is `{ weapon = id, x, y, size = 24 }`. It is presentation-only and nothing
is synchronized. The rest of the pack-owned panel surface is
`wa.panel.replace`, `mouse`, `capture` and `select`.

## Teams, objects and actors

- `wa.teams.surrender(team)` and `wa.teams.surrendered(team)` expose WA's own
  Surrender.
- `object.uid` is gone. `object.id` and `a.id` are the match-wide body id;
  actors, objects and missiles share it, starting at 256 past `worm.id`.
- The body id is the same in `wa.missiles.all()`, `wa.on.missile_frame`, an
  `on_explode` event's `missile` and what `wa.weapons.launch` returns.

## Added since the RC5 sync

These reached the engine between RC5 and the 1.0 release candidate and are now
in `spec/verbs.md`, the editor tables and both Rust checkers.

- `wa.on.frame(fn)` runs once per simulation frame, after WA's own frame, with
  no arguments. It is a simulation callback with no worm or actor of its own:
  spawns there name their owner (`owner = "none"` for no team).
- `wa.world.explode{ x, y, owner, damage = 50, id = 100, below = true }` makes
  WA's own explosion at a point. `owner` is required; `"none"` is no team's.
- `wa.magnetism.field` also accepts a point (`{ x, y }`), and `field:move(x, y)`
  moves such a field from the next simulation step. Fields on an actor move
  with it and cannot be moved.
- `wa.mines.spawn{ owner = "none", x, y }` lays the map's mine at the world
  root: its blasts and hits are no team's.
- `wa.hud.key(name)` reads this machine's keyboard inside `wa.on.hud`, and
  `wa.panel.close()` shuts WA's panel on this machine. Both are HUD-only and
  unsynchronized.
- `a:sleep(frames, { near = px })` skips an actor's frame calls until it wakes
  (0..3000 frames; land, water, a hit, a warp, damage or a nearby living worm);
  the waking call's `ev.slept` counts the skipped calls.
- `a.alive` and `object.alive` report whether a handle still lives. `a.grab`
  (true, false, `"worm"`, `"projectile"`) says what may pick an actor up.
- `worm.shots` is the selected weapon's shots per use (1..127, writable from
  simulation callbacks); `worm.shots_used` is read only.
- `mine.fuse` is writable from simulation callbacks (`-1` rolls it when the
  mine triggers, else 0..10000 ms).
- A claim's `hold.draw_hand = false` loads the hand sheet without drawing it,
  and `crosshair = false` keeps WA's aiming crosshair undrawn while that weapon
  is out (for a weapon that draws its own).
- `worm:jetpack_steer(on, { speed_limit = false })` lifts the scheme's Maximum
  Jet Pack Speed for that worm until the next call.
- `wa.world.trace` and `wa.world.collides` take `"actors"` and `"missiles"` in
  `with`, plus `grab = { "object", "worm", "projectile" }`.

## Generated contract in 1.0

The editor and both Rust checkers pin these values:

| Name | Count |
|---|---:|
| `WA_FUNCTIONS` | 141 |
| `HANDLE_CLASSES` | 14 |
| `RECEIVERS` | 16 |
| `LOOP_ELEMENT` | 8 |
| `KNOWN_GLOBALS` | 38 |
| `WORM_STATES` (debug labels) | 32 |
| `READABLE_WORM_STATES` | 31 |
| `SETTABLE_WORM_STATES` | 5 |
| `SPEC_KEYS` | 66 |
| `PROJECTILE_KEYS` | 8 |
| `RECORD_FIELDS` | 257 |

Regenerate and verify from the editor repo:

```sh
npx tsx scripts/genEngineData.ts
npx tsx scripts/genEngineData.ts --check
npx tsx scripts/genRecordFields.ts
npx tsx scripts/genRecordFields.ts --check
npx tsc --noEmit
npx vitest run
```

## Compatibility notes

- Bundled `examples/` were re-imported from the 1.0 mods tree (`35122c6`: PX
  0.20.86, Core Utilities 0.21.0, Keeper Bee 1.2.1) and now check clean at API
  5. `npm run gen:corpus` rebuilds the embedded corpus from `examples/`.
- A `wbcheck.exe` built before 1.0 does not know the 1.0 surface. Use it for
  syntax, path and lockstep checks, not as proof that a 1.0 verb is valid.
- The editor's generated data and both Rust checker trees must stay identical;
  run the generators and `cmp` after touching the definitions.
