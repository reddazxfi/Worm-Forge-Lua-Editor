# Spawn Bees

A flying-object example: the replaced Skunk spawns a bee actor with its own
steering, roaming, target selection, animation and sound.

Originally by reddaz (`keeperbee_spawn`). Updated for the bundled API 4 corpus:
the trigonometry uses `wa.math.sin` / `wa.math.cos` / `wa.math.atan` so every
peer computes the same flight path, and the spawned actor initialises its safe
position from `opts.x` / `opts.y` instead of undeclared globals.
