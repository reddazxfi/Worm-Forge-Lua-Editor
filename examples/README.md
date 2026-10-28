# Bundled WormForge examples

New to the bundle/component/profile format? Read [`../MODDING.md`](../MODDING.md)
first. These packs are the reading material after that.

The examples now use the modern component versions from the live mods tree.
The old standalone `agility`, `sentry`, `bee`, `highlander`, `swimsuit`, `pooz`
and `kill_the_king` scripts have been replaced.

| Menu entry | Source | What it demonstrates |
|---|---|---|
| `Agility (Core Utilities)` | `utilities/features/agility.lua` | The agility switch in `core.utilities`: per-frame `worm.vx` / `worm.vy` nudges while airborne. |
| `Sentry Gun (PX)` | `px/weapons/sentry_gun.lua` | A placed sentry with its own state, targeting, firing and collision. |
| `Keeper Bee` | `roaming_bees/weapons/keeper_bee.lua` | A flying actor: steering, roaming, targets, sprites and sound, shared through `require("lib/bee")`. |
| `Highlander (PX)` | `px/components/highlander.lua` | A pure-Lua rule set as a feature: deal weapons, track inventory, take a killed worm's kit. |
| `Swim Suit (PX)` | `px/weapons/swim_suit.lua` | Take a worm into water, swim under four-key control, dive, float and drown. |
| `POOZ` | `pooz/weapons.lua` | A weapon that turns the worm into a controllable runner actor. |
| `Kill The King (PX)` | `px/components/kill_the_king.lua` | A complete game mode as a component pack: destroy the defenders' king before the timer expires. |
| `Ripper Star` | `ripper_star/weapons/ripper_star.lua` | A missile from `px_fire_seq`, with `require("lib/fire_seq")` and `require("wf-lib/effects/trail")`. |

The four `px` menu entries share the same `examples/px/` source pack. The
generator hoists that file array once (`PX_FILES`) and each entry opens a
different primary file, so you can read the whole `px.ports` require graph
without duplicating it in the generated corpus. `utilities` works the same way
with `UTILITY_FILES`.

`npm run gen:corpus` reads these folders and writes `src/data/existingMods.ts`.
It reads `mod.toml` for metadata and embeds the `.lua` files; sprites and sounds
stay with the full mods. The examples are reading material and editor templates,
not a replacement for the engine's own `mods/` folder.

The copied `px`, `utilities` and `roaming_bees` sources keep their real
`mod.toml` and profiles, but the editor corpus only embeds Lua. Their code still
references the original asset paths (`sprites/...`, `sounds/...`, `.wep`); copy
the full pack from the mods tree to run them with art and audio.

The Ripper Star example is a focused excerpt from `px_fire_seq`: the real
`weapons/ripper_star.lua`, its three bundle-local libraries, the `effects.sdk`
trail implementation, and the real profile. Install the full `px_fire_seq` pack
for the other three weapons and the assets.
