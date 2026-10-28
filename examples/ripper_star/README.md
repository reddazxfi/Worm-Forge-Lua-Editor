# Ripper Star

A focused excerpt from the modern `px_fire_seq` bundle, kept here to show a
missile weapon and the `require()` pattern it uses:

```lua
local seq = require("lib/fire_seq")
local sb = require("lib/px_sprite_builder")
local trail = require("wf-lib/effects/trail")
local hold_art = require("lib/px_hold_art")
```

- `weapons/ripper_star.lua` is the real component entry. It reads the worm's
  live aim on every shot, launches fifteen shurikens through `lib/fire_seq.lua`,
  draws the star with `lib/px_sprite_builder.lua`, and uses the shared effect
  trail.
- `lib/fire_seq.lua`, `lib/px_sprite_builder.lua` and `lib/px_hold_art.lua` are
  the bundle-local modules the entry requires.
- `wf-lib/effects/trail.lua` is a copy of the `effects.sdk` export so the
  `require("wf-lib/effects/trail")` line has its implementation beside it.
  The real pack gets it from `dependencies = ["effects.sdk"]`.
- `profiles/Ripper Star.toml` is the real profile: F10, infinite ammo, no delay.

The full `px_fire_seq` pack also contains the Megashark, the hold-to-fire
Megashark and the FAMAS, plus their sprites, sounds and `.wep` records. Those
assets stay with the full mod; this folder is reading material.
