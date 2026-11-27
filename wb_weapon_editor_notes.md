# WormBench weapon editor — work log

## 2026-11-09 — session correction and scope lock

**Mistake logged:** roughly 30% of this session was wasted on the separate
`Worm-Forge-Lua-Editor` code editor (`src/services/parser.ts`,
`compiler-cli/src/scopes.rs`, `undefined-global`). That is **out of scope**
until the weapon editor is finished. The two edits made to the code editor
(`scope.ts`, `compiler-cli/src/scopes.rs`) were reverted with
`git checkout --` and the code editor is untouched again.

**Scope lock:** from now on, work only on the weapon editor application.

**Current location:** the weapon editor moved to
`C:\Users\lucia\Documents\GitHub\Worm-Forge-Lua-Editor\WormForgeWeaponEditor`.
The copies under the older engine checkouts are outdated and must not be used
as the source of truth.

## Completed tasks

1. **Sprite-builder missile animations** — fixed; see the `sb.flight` section.
2. **Separate collide / bounce masks** — fixed; `ends_on_contact` and
   `bounce.hits` are independent.
3. **API 4.0 ZIP output** — verified (subfolder, `mod.toml`, profile, hold art,
   custom icon, and the optional `weps/` copy).
4. **Typecheck / build / checker** — `tsc --noEmit`, `vite build` and
   `wbcheck --stdin` all pass for the generated bundles.

## Log

- 2026-11-09: scope correction above; notes file created before touching any
  weapon-editor code, per instruction.

## 2026-11-09 — weapon editor work resumed at the new location

The live app is `WormForgeWeaponEditor/` inside this workspace. Work log lives
in `WormForgeWeaponEditor/wf_weapon_editor_notes.md`.

Fixed in `src/utils/luaGenerator.ts`:

- Replaced the ignored `missile_sprite` table with a real
  `require("wf-lib/px_sprite_builder")` + `sb.flight(ctx, { ... })` call.
- Stopped mapping sprite-builder `anim` onto the record's native
  `missile.animation`; `spin` is now a number, not `true`; `cyclical` carries
  the frame count; the sheet is registered in `wa.weapons.replace`'s `sprites`.
- `dependencies = ["wf.sdk"]` is emitted for the flight builder as well as the
  hold.
- Split `missile.ends_on_contact` and `missile.bounce.hits` into separate
  collision grids and emit both named tables.
- Also emit `missile.speed_pct`, `missile.alarm_worms`, and
  `missile.ends_on_contact` (previously dropped).

Validation: `tsc --noEmit` clean, `vite build` succeeds, generated Lua passes
`wbcheck --stdin` with no findings.

## 2026-11-09 — .wep import fixed; optional "Use .wep weapon file"

The .wep importer was corrupting imported weapons: it read missile offsets for
every family (guns, mines, strikes and specials included), swapped damage and
push, used stale gravity/wind/bounce and cluster-bit offsets, and merged the
previous weapon's record overrides and custom Lua into the new project.

Added a `Use .wep weapon file` option (on by default in the import modal, also
in Weapon Settings). When enabled, the bundle copies the original file to
`weps/<name>.wep` and emits `wep = "weps/<name>.wep"` instead of `copy_from`.
The editor model is stored as a baseline, so only fields the user actually
changes are emitted as named overrides; untouched fields come from the .wep.

Also fixed the parser to be family-aware and to preserve zero values, and
stopped arrow/spray/special weapons from receiving invalid `missile` tables.

Validation: `tsc --noEmit` clean, `vite build` succeeds, all 43 `.wep` files in
`WormBench-mods` parse, generated Lua passes `wbcheck`, and Playwright confirmed
the import, the settings toggle, and a ZIP containing `weps/petrol_bomb.wep`.

## 2026-11-09 — clustlet behaviour and remaining .wep body values

Cluster submunitions now expose their own action (`impact` / `bounce` /
`homing`) instead of inheriting the parent. The bit has independent bounciness,
max bounces, bounce-explosion power, trail, sprite, sprite count, emission
angle, power variation and homing arm/time. The `.wep` parser decodes the
`+0xC4` child body for all of these.

A new **Advanced** sub-tab under Weapon Record exposes the remaining missile
body values: explosion bias/variation, random motion, collision shape,
pre-explosion sound, bounce contact sides/extra-reverse-chance/contact
explosion, and homing art/trail. The parser decodes them into the baseline, so
an imported `.wep` shows its real values and only user edits become overrides.

Validation: `tsc --noEmit` clean, `vite build` succeeds, and `wbcheck --stdin`
passes the cluster impact/bounce/homing cases, the edited Advanced fields, and
an imported `petrol_bomb.wep` with bit-bounce + random-motion edits.

The Gun / Mine Specifics tab also gained the rest of those families: gun shot
interval/burst size/burst spread/hits/impact explosion/impact effect, mine
arm/fuse/detects/explosion bias+push, and strike spacing/munition speed/plane
sound/munition type. The parser decodes the same offsets and only edits are
emitted. `wbcheck --stdin` passes edited `uzi.wep`, `freeze.wep` and
`napalm_strike.wep` records.

## 2026-11-10 - hold facing and full record action coverage

The hold preview now flips the native left-facing aim sheet inside the cell so
the worm faces the same way as the engine's right-facing composition, and the
default weapon radius is negative so the held art sits on the forward side.
The clustlet editor exposes the whole child missile body (trail, sounds,
countdown, explosion, contact mask, bounce group, homing group, and the full
roam/dig bodies) and the parser decodes only the active action group so
overlapping bytes cannot leak between actions. Roam gained edge-jump, jump, gas, collision masks and
`sheep.flight_1/2`; Dig gained `sprite_1..3`; `fuse` and `countdown` are now
independent fields and writes.

Validation: `tsc --noEmit`, `vite build`, all 50 `.wep` files parse, and
`wbcheck --stdin` passes the generated clustlet, roam, dig, bounce and
switched-homing bundles.

## 2026-11-10 - collision-mask overlap crash

The first in-game run of an exported weapon failed at install with
`missile.bounce.hits: overlapping worm selections; use worms or its individual
groups`. The record UI allowed `worms` (bits 0x3C) and its individual groups at
the same time; the engine rejects intersecting named targets. Fixed in the
weapon editor only: all mask grids share a toggle helper that expands/clears the
shortcut safely, and the Lua emitter expands `worms` instead of emitting an
overlap. The installed ringgrenade Lua was patched (redundant shortcut removed).

## 2026-11-10 - air strike munitions

Air strikes store their munition body 0x14 bytes past a missile's (`STRIKE_SHIFT`).
The importer and generator now decode/emit `strike.plane` plus the full
`missile.*` body and the `clusters.*`/`clusters.bit.*` child body, so a plane's
clustlet explosion/bounce/homing/roam/dig values are editable like any other
clustlet. Validated against `WormBench-engine/tools/record_fields.py` and 95 PX
strike records under `myre/`.
