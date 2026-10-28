# Core utilities

WormForge's own add-ons and tools (`core.utilities`, `format_version = 2`):
**Utilities**, with the match settings the lobby scheme doesn't have and some
players' favourite mods as switches; **Fog of war**; the **+N Seconds**
utility; and the **Cursor** weapon. Fog of war and the Cursor were their own
packs (`core.fog`, `example.cursor_suite`) until 0.6.0; installing this pack
from the catalogue moves those to `WormForge/Backups/Packs`, since their
components are here now (`replaces` in `mod.toml`).

Utilities changes nothing until a profile selects it: tick "Utilities" on the mod loader's Profile tab and set it up
below the list, or write it by hand in a profile file in `WormForge/Profiles`:

```toml
features = ["core.utilities"]

[options."core.utilities"]
heal_per_turn = 10
live_hp = true
```

| Setting | Type | What it does |
|---|---|---|
| Heal at turn start | number, 0–50 | Health the worm whose turn starts gets. |
| ExTurnSide | switch | Left and right turn the worm during rope swings and other actions. By red. |
| Agility | switch | The arrow keys steer the worm a little in the air. By Zed and 0rang3, ported by red. |
| Parkour | switch | In the air, Enter kicks the worm off a wall within 20 pixels (wall jump) and Backspace hops it off the land within 30 pixels below (bunny hop). Project X's parkour script. |
| Live HP | switch | Non-active worms' health bars follow damage immediately, down to zero, preserving freeze and momentum. Originally by reddaz. |
| Instant Death | switch, off by default | Zero-HP non-active worms start their native death sequence once their own motion settles, without waiting for the rest of the battlefield. |
| Collect viewer | switch | What a crate gave pops up over it, for the team that took it. |

Gravity and wind belong to the profile's **Scheme** tab (`[scheme]`),
including `gravity`, `constant_wind` and `wind`.

Live HP requires a DLL providing `worm:commit_health()`. It commits actual
damage through WA's health-label handler, including for 1 HP survivors
and zero-HP worms awaiting their death animation,
without synthetic hits, healing pulses or changing the worm's state. Ice
Arrow can freeze its victim normally. Active worms retain WA's ordinary
health timing; death timing stays with WA for every worm. Nothing forces
worms to die in mid-flight.
Run its regression harness from the repository root with
`lua mods/utilities/test_live_hp.lua`.

Instant Death is independent of Live HP. Enable `instant_death = true` in
the same Utilities options table, or use the **Instant Death** switch in
the loader. It requires `worm:allow_death()` in the DLL. WA still owns each
worm's movement and landing, then its normal death animation, explosion and
grave. The active worm keeps its ordinary turn/death rules. Falls and direct
HP changes are covered by the next simulation frame too. Run
`lua mods/utilities/test_instant_death.lua` from the repository root
to check both switches independently and together.

## +N Seconds

An instant utility that adds configurable time. Its stable ID remains
`utilities.plus_ten`, so existing profiles keep their weapon and ammo settings.

| Option | Values | Default |
|---|---|---|
| Seconds added (`seconds`) | 1–500 | 10 |
| Time bonus mode (`bonus_mode`) | `stack`, `once_keep`, `once_discard` | `once_keep` |
| On collect during retreat (`retreat_collect`) | `activate`, `keep`, `nothing` | `keep` |

With **Auto-Use on**, pickups activate immediately during normal turn time.
`stack` gives a bonus for every activated unit and activates finite inventory
at turn start. Infinite inventory uses one unit at turn start, plus each newly
collected unit, without becoming finite. `once_keep` permits one bonus per turn
and keeps extra pickups for later. `once_discard` permits one bonus per turn
and discards surplus from that pickup and all later pickups during normal turn
time. Previously held inventory and infinite ammo are preserved; turn start
consumes just one held unit in either once mode.

During retreat, `activate` extends the retreat countdown; `keep` saves the
pickup for the next turn; `nothing` discards only the pickup. These choices
apply only with Auto-Use on. **Auto-Use off** always keeps pickups in inventory,
including during retreat, for manual use. The retreat collection setting takes
precedence over the bonus mode: `keep` banks the whole pickup even in
`once_discard`; `activate` follows the selected bonus mode. Manual use obeys
the per-turn limit too; a second use in either once mode refunds the unit.
Using this utility does not end the turn. Each countdown is capped at one hour.

```toml
[weapons]
"utilities.plus_ten" = { row = "utility", column = 6 }

[weapon_settings]
"utilities.plus_ten" = { crate = 60, on_collect = "use" }

[options."utilities.plus_ten"]
seconds = 15
bonus_mode = "stack"
retreat_collect = "keep"
```

The Lua lives in `weapons/plus_n.lua`; the icon is `sprites/plus_n.png`.
Run `lua mods/utilities/test_auto_use.lua` to check these rules.

A weapon's ammo, infinite included, is a weapon setting (the Weapons tab), not
a utility. The switches are those mods' own code, in `features/`, loaded only
when switched on.

Everything runs in simulation callbacks (`wa.on.turn_start`, and
`wa.on.worm_message` for the wind), so the settings are the same on every peer
and in replays: the selection, options included, is frozen with the bundles.

WA rolls a turn's wind after it starts the turn, so the wind is set at the
first frame after `turn_start` rather than in it.

## Fog of war

`core.fog`, an add-on: wkFOW's renderer with declared vision. Select it in a
profile to darken what no worm of yours can see; it needs WA's D3D9 shader
renderer. Its settings: worms' awareness circle and aim cone, terrain shadow
casting, terrain memory (off, stale, live or premapped), whose vision lights
the map (your alliance, the active worm or everyone), the same circle and cone
for animals and projectiles, light after explosions and around crates, the
whole map for spectators and during placement, and a minimum brightness.
The Lua lives in `features/fog.lua`; the pack's `[fog]` lets it drive the
renderer.

## Cursor

One **Cursor** weapon (`cursors.cursor`), with infinite ammo and no turn end
or teleport on click. Select it, then press **+** (top row or keypad) to cycle:

| Mode | Action |
|---|---|
| Light | Cast a 300 px terrain-blocked light, visible to its owner; requires fog for the lighting effect |
| Magnet attract | Attract magnetic objects within 300 px at fixed strength |
| Magnet repel | Repel magnetic objects within 300 px at fixed strength |
| Revive | Click near a linked gravestone to revive its original worm with 100 HP |
| Freeze | Click near a living worm to apply WA's native freeze |
| Fire | Hold the left mouse button to spray rainbow petrol flames at 25 flames/second |
| Hurt | Click near a living worm to deal 10 HP damage through `worm:hurt(10)` |

A native top banner names the mode for the worm's coalition when selected,
reselected or changed. Holding + advances once; release and press
again to advance another mode. Each worm starts in Light and remembers its
own mode across selections and turns. Number keys do not change magnet power.
Switching modes removes the previous light or magnetic field immediately.
Switching weapons, dying or ending the turn removes the cursor and its effect;
a remembered selection restores it next turn.

Revive, Freeze and Hurt choose the nearest eligible target within 24 px. Revive
leaves unlinked graves and any revival WA refuses alone. Freeze can target
either team, including the caster. WA owns revival placement, turn effects
and freeze/thaw behavior.

Hurt can target either team, including the caster, and can kill. Each click
sends one ordinary `worm:hurt(10)` with no knockback; health display, loss of
control and death timing follow the engine and the profile's settings.

Fire uses WA's fire physics and damage. Its rainbow petrol flames do not
spread into untinted fires, but still burn worms. On selection or entering
Fire mode, it waits 60 ms (three simulation frames, rounding up 50 ms) and
requires releasing any held click before a new press can spray. Leaving Fire
mode stops emission; existing flames burn out naturally. The rainbow tint
requires WA's D3D9 shader renderer. Simulation callbacks own mode changes
and actions, including the mode announcement.

The **0.9.3 demo profile** places Cursor and PX's Bowling Ball Strike, with
fog, Live HP and Instant Death enabled. Select Cursor and press + to try the
other modes. The demo needs the Utilities (Fog of war is in it) and Project X ports
bundles; the Cursor itself has no PX dependency.

The Lua lives in `weapons/cursor.lua` and `lib/cursor.lua`; the icon is
`sprites/cursor.png`. Run `lua mods/tests/utilities/test_cursor.lua` from the
repository root.
