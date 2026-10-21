# Bundled WormForge examples

These are the examples embedded in WormForge Code Studio. They are deliberately
small and focused: one idea per pack, so the code is readable rather than a tour
of every feature the engine has.

| Pack | What it demonstrates |
|---|---|
| `agility` | Worm manipulation: per-frame `worm.vx` / `worm.vy` nudges while airborne. |
| `sentry` | An object with its own state, targeting, firing and collision. |
| `bee` | A flying object: steering, roaming, targets, sprites and sound. |
| `highlander` | A pure-Lua scheme: deal weapons, track inventory, take a killed worm's kit. |
| `swimsuit` | Worm manipulation: take control of a worm in water, swim, dive and drown. |
| `pooz` | A weapon that turns the worm into a controllable runner actor. |
| `kill_the_king` | A complete game mode as a component pack. |

`npm run gen:corpus` reads these folders and writes `src/data/existingMods.ts`.
Only `mod.toml` and `.lua` files are embedded; sprites and sounds stay with the
full mods. The examples are reading material and editor templates, not a
replacement for the engine's own `mods/` folder.

The swimsuit example is an excerpt from Project X's component bundle. Its
original asset paths (`sounds/swim_suit/...`, `sprites/swim_suit/...`) are kept
in the code; copy the PX pack if you want to run it with its art and audio.
