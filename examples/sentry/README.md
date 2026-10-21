# Sentry Gun

Copy this folder into `Mods/` beside WA 3.8.1 and use a matching WormForge DLL.
Disable other donkey overlays: the first loaded pack wins.

Select the donkey slot, then press Space to place the sentry. Stock mine input,
ammo consumption and retreat timing are retained. The body gets a small placement
nudge (0.3px sideways, 0.15px upward plus half the worm velocity), independent of
aim and charge. It falls and plants on terrain.

The turret scans for visible moving enemies within 360px, waits 60 frames after
acquisition, finishes rotating, then shoots at most 20 rounds per turn. Each new
turn reloads it. `REQUIRE_MOTION` in `weapons.lua` can relax the original PX
movement gate when set to `false`.

The body has the PX weapon's 50 health. Blast damage disables it for the rest
of the turn; destroying it causes a 50-damage explosion. A later turn reloads
an intact disabled sentry.

The housing uses the owner's team colour. Rendering keeps base → barrel → housing
order, including both frames from `sentry_gun_firing.png` and the separate muzzle
flash on the first firing frame. Housing reflection happens before rotation, so
diagonal aim stays aligned. Each team gets 120 idle angles plus two firing poses,
chunked into 30-frame sheets (4 per pose, 12 per team) — a single sheet holding
every pose and angle is too large for WA's ProcessSprite. `a:frame(index)` holds
the strip; `index % 30` is the angle inside the current sheet. The actor keeps the
same feet when its pose changes. The ten-frame `wsgnlnk*` strips equip the gun and
`wsgnbak*` play on placement. Stock animation still controls slopes, direction and
timing.

## Engine additions

- `a:frame(index)` selects a zero-based frame and holds it until another `frame`
  or `look` call. Negative and overflowing indices wrap. Sheets support up to
  65,536 explicitly addressable frames.
- `worm.facing` reads -1 (left) or 1 (right): the side WA's own fire code
  shoots to, so a worm that turns and fires in one aim places to its new side.
- `worm_sprites = { weaponlnk = "sprites/equip", wthrow = "sprites/unequip", ... }`
  supplies custom-weapon equip and placement animations for flat/up/down slopes.
  These assets are installed automatically; do not duplicate them in `sprites`.
  A pose may instead list one sheet per team colour, red to cyan
  (`weaponlnk = { red, blue, green, yellow, magenta, cyan }`); each worm draws
  its own team's. This pack's are baked by `tools/bake_sentry_team_sprites.py`,
  so the housing a worm carries matches the turret it plants. PX's grey
  sheets stay in `sprites/equip*` and `sprites/unequip*` for a neutral
  sentry, one that fires on every team.
  Stock flags and phase remain.
- `copy_from = "mine"` with `on_fire` keeps stock placement but routes the body
  through the existing Lua spawn hook. The stock mine slot remains unchanged.

These additions retain `api_version = 1`; existing names and behavior remain.

## Rebuild and verify

The included assets are ready to use. The bake and DLL build helpers live on the
author's machine and are not part of this repository.

On Windows, run `cargo test --workspace`. Portable tests and the mocked Lua 5.4
sentry scenario can also run on macOS; existing tests that dereference 32-bit game
handles require the 32-bit target.

In a WA 3.8.1 match, verify flat/uphill/downhill equip in both directions; tap and
hold Space (one placed turret, no charge bar); left/right placement; diagonal
tracking and firing behind the housing; 20-shot exhaustion and next-turn reload;
and unchanged stock mines. Check `wkLua.log` and `wkluaerror.txt` beside `WA.exe`
for asset or callback errors. Native animation and input hooks still require this
in-game check.
