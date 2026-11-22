# Project X ports

Project X's weapons, Highlander and Kill the King, ported to WormForge as the
mod **Project X ports** (`px.ports`). Every weapon is a component a profile
can place anywhere on the panel, and the loader credits each one to its
Project X authors. The porting notes for modders are in the
[mods repository](https://github.com/EdLud/WormForge-mods/blob/main/docs/px-porting.md); the art and sounds are credited in
[NOTICE.md](../NOTICE.md).

## For modders

- `weapons/<weapon>.lua`: one weapon's record, art and behaviour.
- `scheme/highland_rules.lua`: Highlander's dealing, turn ammo and loot.
- `components/`: the add-ons, and the entry every weapon shares.
- `mod.toml`: the components and their options.
- Tests: `lua mods/tests/px/test_match.lua` from the engine checkout, or
  `lua tests/px/test_match.lua` from the mods repository.

How each weapon was built and what differs from PX: [porting notes](https://github.com/EdLud/WormForge-mods/blob/main/docs/px-porting.md).
