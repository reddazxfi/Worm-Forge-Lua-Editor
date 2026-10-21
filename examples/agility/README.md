# Agility

A small worm-manipulation example: while the active worm is airborne, nudge
`worm.vx` and `worm.vy` from `worm.keys` once per frame. It is the Lua
equivalent of PX's `SpX` / `SpY` increments.

Ported from Zed's RPG Wars mod and edited by 0rang3; packaged as a standalone
example for the editor. The current form uses the API 4 writable velocity
fields and a `FRAME_FINISH` message filter.
