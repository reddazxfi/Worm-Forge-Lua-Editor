# Core utilities

WormForge's add-ons and tools, the mod **Core utilities** (`core.utilities`):
**Utilities**, with match settings the lobby scheme doesn't have and some
favourite mods as switches; **Fog of war**; **Worm glow**; **Crate pop**; the **+N Seconds**
and **Bullet Time** utilities; and the **Cursor** weapon.

```toml
features = ["core.utilities"]

[options."core.utilities"]
heal_per_turn = 10
live_hp = true
```

## Utilities

| Setting | Type | What it does |
|---|---|---|
| Heal at turn start | number, 0–50 | Heals the worm by the set amount at the start of its turn. |
| ExTurnSide | switch | Left and right turn the worm during jumps, flights and other actions. By reddaz. |
| Agility | switch | The arrow keys steer the worm a little in the air. By Zed and 0rang3, ported by reddaz. |
| Parkour | switch | In the air, Enter kicks the worm off a wall within 20 pixels and Backspace bunny-hops it off the land below. From Project X. |
| Fast aim | switch, and a speed, 1–400 % | Holding Shift makes the aim faster, at the speed set. Weapons that aim in coarse steps, like the Blow Torch, keep the normal aim. From Project X. |
| Live HP | switch | Subtracts health from damaged worms immediately. By reddaz. |
| Instant Death | off, settled, in flight | Settled: a worm at 0 HP dies as soon as it's still. In flight: it dies at once, wherever it is, and flies on while it dies, as in Project X. |
| Collect viewer | switch | A pop-up icon when a crate is collected. |
| Kill counter | switch | A badge behind each worm counts its kills, 1 to 9, then infinity. The worm whose turn it is gets the kill and the victim's count with it. From Project X; useful for Highlander. |
| Damage numbers | switch, and a side | Damage and healing float over the worm, Worms Reloaded style. By reddaz. |
| FPS counter | switch | Each player's frame rate at the top right of their screen. |
| Disable zoom | switch | Every player sees the match at 1x, whatever their zoom setting. |
| Panel highlight | switch | A green square marks each weapon on the panel that doesn't end the turn, and a key above the panel reads "= sdet". Both fade in as the panel opens. Leave it off when the scheme has Weapon Use Doesn't End Turn, where every weapon keeps the turn going. |
| Rope counter | switch | Each team's Ninja Rope shots, shown above the turn timer by the name of its first living worm. From Project X; useful for races. |
| Changing wind | switch | During turns the wind moves, over three seconds, to a new random strength every 10 to 20 seconds. By PyroMan, from Project X. |

## Crate pop

Crates from the turn drop and Crate Shower pop in just above the land and
fall the rest, with no parachute or teleport, and without the shotgun reload
sound of a weapon or utility crate.

| Setting | Type | What it does |
|---|---|---|
| Pitch range | number, 0–12 semitones | Each pop sounds a random pitch up to this far higher or lower. 3 by default. |
| Lowest height, Highest height | numbers, 0–100 pixels | Each crate pops in at a random height between the two, then falls. 30 and 50 by default. Land above the crate stops it lower. |

## Cursor

\+ switches the mode, and each worm keeps its own.

| Mode | What it does |
|---|---|
| Light | A light round the cursor, 300 pixels, blocked by terrain. |
| Magnet attract, Magnet repel | Pulls or pushes what is within 300 pixels. |
| Revive | Click a gravestone to revive its worm. |
| Freeze | Click a worm to freeze it. |
| Fire | Hold the left mouse button for rainbow fire. |
| Hurt | Click a worm to deal 10 HP damage. |

## Tests

From the repository root: `lua mods/utilities/test_live_hp.lua`,
`test_instant_death.lua`, `test_auto_use.lua`, `test_fast_aim.lua`,
`test_panel_highlight.lua` and
`lua mods/tests/utilities/test_bullet_time.lua`, `test_cursor.lua`.
