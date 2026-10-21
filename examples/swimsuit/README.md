# Swim Suit

A worm-manipulation example: a worm that falls into water wears the suit,
swims under its own four-key control, dives, floats and drowns when it runs out
of depth or time. The logic is extracted from Project X's `px.swim_suit`
component (StepS, with diving by PyroMan).

The standalone version replaces the stock laser sight instead of registering a
PX weapon, so `worm.weapon` and `worm:ammo` use `stock.laser_sight`. The sprite
and sound paths are the PX ones; the editor's bundled corpus embeds only Lua.
Copy the PX pack's `sprites/swim_suit/` and `sounds/swim_suit/` beside this
mod if you want to run it with the original art and audio.
