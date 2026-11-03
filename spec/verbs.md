# WormForge Lua verbs

Every `wa` function, handle method, event and data field a pack can use, by area. It replaces the capabilities page.

WormForge 0.9.53 · `api_version = 4` · updated 2026-10-30.

Lua speaks pixels: positions and sizes in pixels, speeds in pixels per frame, with fractions. The engine converts to WA's 16.16 once.

## Contents

- [Weapons](#weapons)
- [Weapon data](#weapon-data)
- [Worms](#worms)
- [Lua actors](#lua-actors)
- [Stock objects, crates and fire](#stock-objects-crates-and-fire)
- [World and land](#world-and-land)
- [Events](#events)
- [Drawing, HUD, sprites and sound](#drawing-hud-sprites-and-sound)
- [Fog of war](#fog-of-war)
- [Rules and utilities](#rules-and-utilities)

## Weapons

Give a placed weapon its record, art and behaviour, read it back, or fire one from a script. A weapon is named by its id (px.javelin, or `stock.bazooka` for WA's own), never by a slot.

### `wa.weapons.replace`

`wa.weapons.replace{ copy_from, name, missile, ... }`

In a weapon's install: gives the weapon the profile placed its record, art and behaviour (see [Claim fields](#claim-fields)). It names no slot; it claims the weapon's own.

### `wa.weapons.register`

`wa.weapons.register{ based_on, ... }`

The older form: claims a stock slot named by `based_on`. A bundle's weapon uses replace.

### `wa.weapons.launch`

`wa.weapons.launch{ weapon, owner, x, y, vx, vy, missile, clusters }`

Fires a real WA missile: a placed weapon as itself, else `stock.<name>` as WA's own. missile = { ... } and clusters = { ... } change that shot's record fields (fuse, sprite, explosion.power, burst, ...).

Units: position px · speed px/frame · fuse, countdown ms

### `wa.weapons.fire`

`wa.weapons.fire{ weapon, worm, x, y, vx, vy, ... }`

Runs a placed weapon's [`on_fire`](#claim-fields) from a script, by its id. Extra fields reach the handler. No wind-up, no ammo used.

Units: position px · speed px/frame

### `wa.weapons.click`

`wa.weapons.click{ weapon, worm, x, y, vx, vy }`

Runs a placed weapon's [`on_click`](#claim-fields) from a script, by its id.

Units: position px · speed px/frame

### `wa.weapons.fire_bullet`

`wa.weapons.fire_bullet{ weapon, owner, x, y, dx, dy, damage, ignore }`

Fires one native hitscan round from a point, as WA's shotgun, handgun, uzi or minigun (weapon = `stock.<name>`, a template). The owner must be a living worm.

Units: position px

### `wa.weapons.data`

`wa.weapons.data(weapon)`

A weapon's record as the claim's named tables, with fires.as naming its family: a placed weapon's as this round has it, WA's untouched one for a `stock.<name>` not on the panel.

### `wa.weapons.retarget`

`wa.weapons.retarget{ weapon, sprite, cluster }`

Swaps a placed weapon's flight sprite and cluster sprite (WA sprite names) at runtime.

### `wa.weapons.visual`

`wa.weapons.visual(weapon)`

A placed weapon's panel symbol { sprite, frame, width, height, kind }, for drawing.

### `wa.weapons.panel_icon`

`wa.weapons.panel_icon(weapon, n)`

Shows icon n in the weapon's panel tile: 0 its [`panel_icon`](#claim-fields), 1 and on its [`panel_icons`](#claim-fields). Only the panel changes, so any callback may call it.

### `wa.weapons.hold_sheet`

`wa.weapons.hold_sheet(weapon, n)`

Draws held sheet n over the worm's aim pose: 0 the hold's sheet, 1 and on its hold.sheets (same frames and placement). Draw only, per weapon, so any callback may call it; as Project X swaps a WormSprite's sprite (the Gravity Gun's claws opening).

Also: `hold.sheets`

### `wa.weapons.set_selectable`

`wa.weapons.set_selectable{ weapon, team, selectable }`

Whether a team (1 to 6) may select a placed weapon, for now: one it may not is greyed on the panel, can't be picked and is skipped by the F-keys, as WA's delayed weapons are, until it may again. Every round starts with all selectable. Simulation callbacks only. Since 0.9.1.

### `wa.panel.layout`

`wa.panel.layout() / wa.panel.set_layout{ [id] = { row, column } }`

Each placed weapon's panel position by id (rows F1..F12 and utility, columns 1..10), and moving them mid-round (simulation only). Only where a weapon shows changes: F-keys and clicks follow at once.

Also: `wa.panel.set_layout`

### `wa.weapons.notify_grant`

`wa.weapons.notify_grant{ worm, items, x, y }`

Reports weapons a script granted directly, as a `weapon_grant` event.

Units: position px

### Claim fields

Fields read by replace. Record: `copy_from` (`stock.<name>`) or wep (a .wep file), and the record as named tables: fires, handling, missile, clusters, mine, gun, strike, `jet_pack`; raw = { `[offset]` = value } for a field without a name. Behaviour: `on_fire`, `on_click`, `on_select`, `on_explode`, `on_place`, `on_proximity`, `eat_fire`, `click_finish`, `fire_repeat`, `stock_fire_choice`, airborne, actor, `is_weapon`. Art and sound: name, `panel_icon`, `panel_icons`, icon, sprites, `sprite_overrides`, sounds, hold, `worm_sprites`, `worm_sprites_animate`, `worm_sprites_toggle`, `worm_sprites_team_tint`, `mole_dig_rotation`; params for drawing (`gpu_prefix`, layer, depth, truecolor, `gpu_worm_sprites`).

Also: `wep`, `copy_from`, `fires`, `handling`, `missile`, `clusters`, `mine`, `gun`, `strike`, `jet_pack`, `raw`, `params`, `on_fire`, `on_click`, `on_select`, `on_explode`, `on_place`, `on_proximity`, `eat_fire`, `click_finish`, `fire_repeat`, `stock_fire_choice`, `airborne`, `is_weapon`, `name`, `panel_icon`, `panel_icons`, `sprite_overrides`, `truecolor`, `sounds`, `hold`, `worm_sprites`, `worm_sprites_animate`, `worm_sprites_toggle`, `worm_sprites_team_tint`, `gpu_worm_sprites`, `mole_dig_rotation`

### `missile.trail.sprite`

`missile = { trail = { sprite = "sprites/my_trail.png" } }`

A weapon's own native trail image, loaded with the claim and scoped to that weapon; it does not replace the stock trail sprite for anything else. An installation declaration, not something [`wa.weapons.launch`](#waweaponslaunch) loads mid-match.

Also: `trail.sprite`

### `on_fire` / `on_click` events

An [`on_fire`](#claim-fields) handler gets fire.x, fire.y, fire.vx, fire.vy, fire.weapon (its id), fire.worm, fire.power (charge 0 to 1) and fire.airborne. An [`on_click`](#claim-fields) handler gets click.x, click.y, click.sky, click.vx, click.vy, click.weapon and click.worm.

Units: position px · speed px/frame · power 0–1

Also: `fire.x`, `fire.y`, `fire.vx`, `fire.vy`, `fire.weapon`, `fire.worm`, `fire.power`, `fire.airborne`, `click.x`, `click.y`, `click.sky`, `click.vx`, `click.vy`, `click.weapon`, `click.worm`, `ev.vx`, `ev.vy`

## Weapon data

What a weapon declares in its defaults and a profile's `weapon_settings` override, field by field; the weapon's install reads it as ctx.data. WA's own weapons answer as WA does where a field is left out.

### `data.ammo`

`ammo = { round_start, turn_start = { amount, mode }, crate_collect, stockpiling }`

Ammo at round start, given each turn (add or replace), from a crate, and between rounds (off, on, anti). -1 is infinite.

Also: `ammo`, `round_start`, `turn_start`, `stockpiling`

### `data.delay`

`delay = n`

Turns before the weapon can be used.

Units: turns

Also: `delay`

### `data.crate`

`crate = { chance_pct, type }`

Its weight in WA's crate draw, and which crates it comes in (weapon, utility, super).

Also: `crate`, `chance_pct`

### `data.after_use`

`after_use = "end" | "retreat" | "continue"`

What the turn does once the weapon is used: ends at once (as WA's Teleport), ends after the retreat time, or goes on.

Also: `after_use`

### `data.shots`

`shots = n`

Shots per use, 1 to 9; mid-air each fire press fires the next. The Ninja Rope's are its own: 1 to 127 rope shots per use, or -1 unlimited.

Also: `shots`

### `data.rope_length`

`rope_length = 200`

The Ninja Rope's maximum length in pixels, up to 535. Unset, the rope's scheme power gives it, with its shots: power 0 one shot of 147 px, 1 two of 168, 2 two of 189, 3 four of 210, more unlimited of 231.

Units: px

Also: `rope_length`

### `data.mid_air`

`mid_air = true | false`

Whether it fires on the rope, bungee, parachute or jet pack.

Also: `mid_air`

### `data.airborne`

`airborne = true | false`

Whether it fires while the worm jumps or falls.

Also: `airborne`

### `data.auto_use`

`auto_use = true | false`

A utility: switched on by itself at turn start, or on a pickup while it is off, one unit at a time, the rest banked; false keeps it to use by hand. `on_collect = "use" | "keep"` is the older spelling, still read; weapon data in `ctx.data` carries both, and `auto_use` wins where a declaration gives both.

Also: `auto_use`, `on_collect`, `data.on_collect`

### `data.placement`

`placement = "girder" | "girder_pack"`

Placed as WA places its girders: the cursor shows the girder, the arrow keys turn it, a click places one where WA allows.

Also: `placement`

### `data.placement_range`

`placement_range = 300`

While the worm aims it, WA's cursor is held within this many pixels of the worm, as Project X's girder restrictor holds Highlander's girders. A weapon's own option may set it: an int option with data = true is the weapon data field of its key.

Units: px

Also: `placement_range`

### `data.cursor_sprite`

`cursor_sprite = "<WA sprite>"`

One of WA's sprites drawn at the cursor while aiming, as WA draws the worm where its Teleport would land.

Also: `cursor_sprite`

### `data.cursor`

`cursor = { flip = true, dy = 20 }`

WA's team cursor while the weapon aims: drawn upside down and dy pixels lower, for this weapon only, as Project X's Submarine Attack draws it.

Units: dy px

Also: `cursor`, `cursor.flip`, `cursor.dy`

### `data.aims_straight_up`

`aims_straight_up = true | false`

false keeps the aim a little short of straight up, as WA's Mortar.

Also: `aims_straight_up`

### `data.collects_crates`

`collects_crates = false`

Its missiles leave crates where they are. WA's missile picks up any crate it reaches for the firing team, whatever it collides with; with bounce.hits.crates in its record it bounces off them instead, as Project X's Burning Sheep Launcher does. Left out, WA's.

Also: `collects_crates`

### `data.ends_invisibility`

`ends_invisibility = true | false`

Whether using it ends Invisibility: the team's, and the firing worm's own worm.invisibility. Left out, WA's answer: its record creates a projectile (attacking weapons end it; the rope, Girder, Teleport, Prod, Freeze, Jet Pack and the utilities don't).

Also: `ends_invisibility`

## Worms

Read and move worms, change their ammo, and hand them between WA and the pack.

### `wa.worms.all`

`wa.worms.all()`

Every worm in the match.

### `wa.worms.nearest`

`wa.worms.nearest(from)`

The worm nearest a point or object.

### `wa.worms.spawn`

`wa.worms.spawn{ team, x, y, name, health }`

Adds a worm to a team, in the place of a dead worm first, standing at once.

Units: position px

### `worm.fields`

`Worm fields (read and write)`

x, y, vx, vy, facing, visible, `body_visible`, `collision_mask`, fuel, gravity, wind, windup, `shots_fired`, `shots_to_fire`, name (writes, from simulation callbacks, keep the first 16 printable ASCII bytes and change the native name and label; id and the saved team stay); invisibility (true: WA's Invisibility for this worm alone, as its team's would give it: hidden and not followed where WA wouldn't show an invisible team, ghosted where it would; a weapon that ends Invisibility ends it; writes from simulation callbacks).

Units: x, y px · vx, vy px/frame · gravity, wind factor (1 = normal) · fuel plain (0 = unlimited) · windup frames

Also: `worm.x`, `worm.y`, `worm.vx`, `worm.vy`, `worm.facing`, `worm.visible`, `worm.body_visible`, `worm.collision_mask`, `worm.fuel`, `worm.gravity`, `worm.wind`, `worm.windup`, `worm.shots_fired`, `worm.shots_to_fire`, `worm.name`, `worm.invisibility`

### `worm.readonly`

`Worm fields (read only)`

id, team, alliance, `ammo_group`, hp, kind, weapon (its id), turn, name, aim, aiming, drilling, state (standing, walking, ready, charging, prefiring, firing, fired, punching, drilling, teleporting, jetpacking, parachuting, sliding, roping, bungee, tumbling, frozen, kamikaze, `jump_prepare`, jumping, `jump_falling`, blasted, hit, and WA's own death: dying, drowning, dead; `nil` for any other WA state), `state_id`, `state_label`, keys, taken.

Units: aim 0 (down) to 1 (up)

Also: `worm.aim`, `worm.aiming`, `worm.alliance`, `worm.ammo_group`, `worm.drilling`, `worm.hp`, `worm.id`, `worm.keys`, `worm.kind`, `worm.state`, `worm.state_id`, `worm.state_label`, `worm.taken`, `worm.team`, `worm.turn`, `worm.weapon`

### `worm:ammo`

`worm:ammo(weapon, n) / worm:ammo(weapon, { set = n, keep_delay })`

Reads, adds or sets the team's ammo for a placed weapon, by its id. `keep_delay` = true changes ammo without clearing the weapon's delay.

Also: `keep_delay`

### `worm:delay`

`worm:delay(weapon) / worm:delay(weapon, turns)`

Reads or writes the team's cooldown for a weapon, preserving ammo and selection: 0 usable, a positive count goes down with WA's team-turn upkeep, -1 blocked until cleared. Uses the worm's ammo row, shared inventories included. Writes from simulation callbacks.

Units: turns -1..127

### `worm:poison`

`worm:poison(amount)`

A native gas exposure: WA checks immunity, adds the dose and takes its nonlethal health at turn boundaries. Returns whether the dose grew. Does not hurt the worm at once or change control. Simulation callbacks only.

Units: amount 1..1000

### `worm:reduce_health`

`worm:reduce_health(amount)`

Lowers HP directly: no hit reaction, no control or movement change, no hurt callbacks. False, changing nothing, for a dead worm or a cost that would leave less than 1 HP. Pending damage stays queued. Simulation callbacks only.

Units: HP 0..10000

### `worm:equip`

`worm:equip(weapon)`

Arms a placed weapon on the spot, by its id.

### `worm:hurt`

`worm:hurt(n) / worm:hurt{ amount, vx, vy, react }`

Damages the worm, optionally with knockback. react = false: the damage alone, without WA's hit (no flinch, push or landing damage).

Units: knock px/frame

### `worm:heal`

`worm:heal(n)`

Adds health.

### `worm:show_health`

`worm:show_health()`

Moves the health label to the worm's health now, keeping the damage WA still owes it.

### `worm:die`

`worm:die()`

Starts a zero-HP worm's death now, wherever it is; it flies on while it dies.

### `worm:freeze`

`worm:freeze()`

Puts the worm in WA's frozen state.

### `worm:take`

`worm:take{ hide, turn }`

Hands the worm to the pack: it stays where the pack puts it. Returns whether it did. Refused (false) for a worm in WA's death (dying, drowning, dead): WA keeps it still until it is gone.

### `worm:release`

`worm:release(vx, vy, { tumble })`

Gives the worm back to WA, flying or tumbling; on a worm never taken, a launch. Returns whether it did. Refused (false) for a worm in WA's death (dying, drowning, dead): WA keeps it still until it is gone. A zero-HP worm WA hasn't started killing still launches.

Units: px/frame

### `worm:jump`

`worm:jump("forward" | "back" | "up" | "backflip")`

WA's own jump take-off from wherever the worm is; none repeats its last jump.

### `worm:carry`

`worm:carry(x, y)`

Moves a held worm. Returns whether it did. Refused (false) for a worm in WA's death (dying, drowning, dead): WA keeps it still until it is gone.

Units: px

### `worm:drop`

`worm:drop()`

Lets a carried worm fall. One that has started dying is only let go.

### `worm:warp`

`worm:warp{ x, y, vx, vy, facing }`

Moves the worm at once.

Units: position px · speed px/frame

### `worm:fits`

`worm:fits(x, y)`

WA's collision test of the worm's shape at a place.

Units: px

### `worm:jetpack_steer`

`worm:jetpack_steer(on)`

The pack steers WA's jet pack; WA keeps collisions, fuel HUD and landing.

### `worm:air_fire`

`worm:air_fire(on)`

Lets a pack weapon fire in mid-air.

### `worm:clear_keys`

`worm:clear_keys()`

Consumes the worm's move keys before WA sees them.

### `worm:set_state`

`worm:set_state(name)`

Enters a WA state. Debugging only, opt-in per pack (`debug_worm_state`).

### `worm:input`

`worm:input{ fire, aim, fuse, bounce, click, key }`

Sends WA's own input messages for a worm: an offline diagnostic, opt-in per bundle (`debug_input`). Every call is logged; network rounds refuse it.

## Lua actors

Bodies the pack controls: spawn them, move them, draw them.

### `wa.actors.spawn`

`wa.actors.spawn{ sprite, x, y, ... }`

Creates a native WA actor. body = { shape, hits, `hit_by`, [`pushed_by`](#bodypushed_by) } chooses its outline, outgoing movement, incoming attackers and how hard what runs into it pushes it, independently. A body uses the oil-drum layer (17). shape is worm (default), missile, sprite (registered sprite frame zero), or a pack-relative image path; a bare image uses no sprite slot and works with sprite=false. hits defaults to {}; `hit_by` defaults to `"all"`. Legacy collide, `collide_terrain`, `collide_worms`, `as_object`, shape, solid and mask options are accepted only without body. Other keys: sprite, x, y, vx, vy, from, origin, owner, gravity, `damage_terrain`, `damage_worms`, drown, persist, visible, loop, [`on_explode`](#claim-fields), on = { frame, land, hit, contact, bump }.

Units: position px

Also: `as_object`

### `wa.actors.all`

`wa.actors.all()`

Every live actor.

### `wa.actors.kind`

`wa.actors.kind(name)`

The numeric kind for a pack's actor type name.

### `a.hits`

`a.hits = { land = true, objects = true }`

Outgoing movement layers: land, worms (all states), mines, crates, objects (drums and body actors), missiles (native missiles and plain Lua actors). Reads return a boolean table; writes require simulation callbacks. Water is controlled by drown and preserved by writes. WA handles native movement before on.frame.

Also: `body.hits`

### `a.hit_by`

`a.hit_by = "all" | { arrows = true, melee = true }`

Incoming categories: worms, missiles, arrows, mines, actors, bullets, melee, fire, `dragon_ball`, blasts. `"all"` allows every category; {} excludes them all. Read/write independently of hits; writes require simulation callbacks and leave the body active for its own physics. Filters narrow stock rules: Prod still cannot push objects and melee tests the target position. Bodies do not catch ninja ropes. Unknown keys are refused.

Also: `body.hit_by`, `body.shape`

### `body.pushed_by`

`body = { pushed_by = { mines = 0.2 } }`

How hard what runs into the actor pushes it. When a body WA moves runs into the actor, WA trades their speeds; the actor keeps this share (0 to 1) of the speed it was given, and the mover keeps the speed WA left it, so it slows against the actor instead of bouncing off. Keys: worms, missiles, arrows, mines (every WA mine, the level's as much as a laid one), actors; one left out keeps WA's whole push. Blasts, guns and other hits are not affected: they still reach the actor through `on.hit`. Set at spawn. A sprite-shaped actor with on.contact gets no push from WA to scale. The Electromagnet's "Mines push the magnet" option uses it.

Units: share 0..1

### `a.light`

`a.light = "projectile" | false | { kind, mode, circle, cone = { length, width, toward }, shadow_cast, seen_by, discover, strength }`

The actor's fog-of-war light. A visible world actor has its profile's projectile light by default; invisible (sprite = false), cursor and screen-space actors have none until given one. A preset string (worm, animal, projectile, crate) uses that kind's profile settings; false removes the light; a table replaces the whole spec, and omitted geometry and `shadow_cast` come from its kind. mode is light (default), dark (shades what its cast sees) or shadow (shades what is hidden from it within reach); darkness wins over light. cone.toward is velocity (default), angle (the [`a:gfx`](#agfx) rotation), facing or degrees. `seen_by` is owner (default: the owning worm's side, per `view_ownership`; public without an owning worm) or everyone. discover = true requires `seen_by` = owner; dark and shadow never record terrain memory. strength (0..255) is for dark and shadow only. Presentation only: any callback may set it. Reading returns the spec table, or false.

Units: px; degrees

Also: `light`, `actor.light`

### Actor fields

x, y, vx, vy and facing read and write; id, kind and owner read only.

Units: x, y px · vx, vy px/frame

Also: `a.x`, `a.y`, `a.vx`, `a.vy`, `a.facing`, `a.id`, `a.kind`, `a.owner`

### `a:gravity`

`a:gravity()`

Applies WA's gravity for one frame.

### `a:move`

`a:move{ terrain, worms }`

Adds its speed to its position once and reports land under its feet (terrain, land, left). It is not WA's sweep: it does not stop at land, bounce or meet worms, and produces no bumps.

### `a:warp`

`a:warp{ x, y, vx, vy, facing }`

Moves it at once.

Units: position px · speed px/frame

### `a:fits`

`a:fits(x, y)`

WA's collision test of its shape at a place.

Units: px

### `on.contact`

`on = { contact = function(a, ev) end }`

Something moving ran into this actor (WA's own movement): ev.other, ev.x, ev.y, ev.vx, ev.vy (its speed going in), ev.nx, ev.ny (the side), ev.frame. After physics, once per pair a frame; Lua decides the push.

Units: px, px/frame

### `on.bump`

`on = { bump = function(a, ev) end }`

This actor's own movement ran into something, stopped by WA's sweep: ev.other (`"land"` or the worm/object/actor), ev.nx, ev.ny (the side, pointing away), ev.`surface_nx`, ev.`surface_ny` (on a land floor only: its slope, from WA's own gradient), ev.vx, ev.vy (speed going in), ev.x, ev.y, ev.first (not touching it the frame before), ev.frame. After physics, in lifetime order; WA's stop or bounce is already in a.vx, a.vy, write them to steer. Needs an actor that collides with something.

Units: px, px/frame

Also: `bump`, `ev.surface_nx`, `ev.surface_ny`

### `on.hit`

`on = { hit = function(a, hit) end }`

WA's blasts and hits on the actor go here instead of to its speed: hit.kind (`"blast"` or `"hit"`), hit.`hit_kind`, hit.x, hit.y, hit.vx, hit.vy (the push WA would give), hit.damage (after distance falloff), hit.team. Blasts also give hit.`blast_damage`, the damage before falloff.

Units: px, px/frame

Also: `hit.kind`, `hit.hit_kind`, `hit.damage`, `hit.blast_damage`, `hit.team`

### `a:collision_ignore`

`a:collision_ignore(worm, on)`

Lets one worm pass through the actor's body and mask, or not (simulation only). Returns whether it could be set.

### `a:in_water`

`a:in_water()`

Whether it is in the water.

### `a:on_feet`

`a:on_feet()`

Whether it stands on land.

### `a:cut`

`a:cut{ shape, ... }`

Cuts the terrain where it is: [`wa.land.cut`](#walandcut) at the actor.

Units: px

### `a:explode`

`a:explode{ ... }`

Blows it up with WA's explosion.

### `a:despawn`

`a:despawn()`

Removes it without a blast.

### `a:spawn`

`a:spawn{ ... }`

Spawns a child actor.

### `a:sound`

`a:sound(name)`

Plays a sound at it.

### `a:look`

`a:look(sprite)`

Changes its sprite.

### `a:frame`

`a:frame(i)`

Holds one frame of its sheet.

### `a:advance`

`a:advance()`

Steps its sprite animation.

### `a:gfx`

`a:gfx{ angle, scale, tint, depth }`

Sets several drawing fields at once.

### `a:angle`

`a:angle(deg)`

Sets its drawing angle.

Units: degrees

### `a:scale`

`a:scale(f)`

Sets its drawing scale.

### `a:tint`

`a:tint(rgb)`

Sets its tint.

Units: 0xRRGGBB

### `a:blend`

`a:blend(mode)`

Sets its blend mode.

## Stock objects, crates and fire

WA's own missiles, mines, crates, oil drums, graves and arrows, and WA's fires.

### `wa.missiles.all`

`wa.missiles.all(), wa.mines.all(), wa.crates.all(), wa.oil.all(), wa.graves.all(), wa.arrows.all()`

WA's own objects of that kind.

Also: `wa.mines.all`, `wa.crates.all`, `wa.oil.all`, `wa.graves.all`, `wa.arrows.all`

### `wa.crates.spawn`

`wa.crates.spawn{ x, y, kind, health, drop }`

Builds one of WA's crates: weapon, utility or health, dropped by chute, teleport or none.

Units: position px

### `wa.mines.spawn`

`wa.mines.spawn{ owner, x, y, vx, vy, fuse, arm, damage, radius, dud_proof, triggered, terrain_keep_speed_pct, on_bump }`

Builds one of WA's mines, as Project X's new CMine: WA flies, arms, triggers and explodes it as its own. A worm owner's team lays it; an actor's mine is the map's. triggered = true starts it triggered (arming still runs first); `terrain_keep_speed_pct` (0..1000) is the speed it keeps along land until WA arms it. `on_bump` = function(mine, ev) hears what that mine's own movement ran into, as an actor's on.bump (Project X's CMine::Collide).

Units: position px · speed px/frame · fuse, arm ms · radius px

Also: `on_bump`, `terrain_keep_speed_pct`, `triggered`

### `wa.arrows.spawn`

`wa.arrows.spawn{ owner, x, y, vx, vy, damage, gravity_pct }`

Builds one of WA's arrows, as Project X's new CArrow; `nil` when WA makes none (its object pool full, or inside land).

Units: position px · speed px/frame

### `wa.oil.spawn`

`wa.oil.spawn{ x, y, snap = true }`

Builds one of WA's oil drums, as the level's hazardous objects are made. snap drops it until it lands; snap = false starts it where it is put.

Units: position px

Also: `wa.oil.all`

### `wa.fire.spawn`

`wa.fire.spawn{ owner, x, y, vx, vy, count, duration, damage, up_power, damage_scale, knock_scale, tint }`

Starts one of WA's fires.

Units: position px · speed px/frame · duration ms · up\_power native integer · scales factor · tint 0xRRGGBB

Also: `damage_scale`, `knock_scale`

### `wa.fire.repel`

`wa.fire.repel{ x, y, radius, power }`

Pushes the live flames in a circle away, as WA's own flame response to an explosion pushes them (its falloff with distance). Every field is required: radius above 0 and at most 8192, power a whole native strength 0..1000 (0 does nothing). No blast, fire, sound or hole, and nothing else is hurt or moved. Returns how many flames it pushed. Simulation callbacks only.

Units: position, radius px · power native integer

### `wa.cursor.spawn`

`wa.cursor.spawn{ ... }`

A cursor actor for click weapons.

### Object fields

x, y, vx, vy read and write; id, uid, kind, team, alliance read only; fuse on mines; gravity on mines, crates, oil drums, missiles, arrows and graves (read and write from simulation callbacks: 1 WA's normal, 0 none, Project X's GravityFactor); `worm_id` on graves; damage and `max_damage` on oil drums, and visible on drums and mines (false: WA stops drawing it, a mine's countdown included, so a pack can draw its own or hide it; WA still moves and explodes it).

Units: x, y px · vx, vy px/frame · fuse ms

Also: `object.x`, `object.y`, `object.vx`, `object.vy`, `object.id`, `object.uid`, `object.kind`, `object.team`, `object.alliance`, `mine.fuse`, `grave.worm_id`, `drum.damage`, `drum.max_damage`, `drum.visible`, `object.gravity`, `mine.visible`

### `object:hit`

`object:hit(damage, vx, vy)`

Hits a crate or oil drum.

Units: px/frame

### `object:impulse`

`object:impulse(dx, dy)`

Pushes a mine or missile.

Units: px/frame

### `object:remove`

`object:remove()`

Frees a missile, arrow, mine or oil drum without a blast: a drum goes with no fires and no [`wa.on.oil_explode.`](#waonoil_explode) Returns whether it did. Simulation callbacks only.

### `object:warp`

`object:warp{ x, y, vx, vy }`

Moves it at once.

Units: position px · speed px/frame

### `object:fits`

`object:fits(x, y)`

WA's collision test of its shape at a place.

Units: px

### `mine:arm`

`mine:arm(ms)`

Starts a mine's fuse.

Units: ms

### `grave:revive`

`grave:revive(worm_id, health)`

Rebuilds a dead worm at its grave.

## World and land

Queries about the map, the camera, the keys and the terrain, and terrain changes.

### `wa.world.size`

`wa.world.size()`

{ w, h }: the map's size.

Units: px

### `wa.world.view`

`wa.world.view()`

{ cx, cy, w, h, zoom }: the camera's centre in the world, the screen's size, and this machine's zoom (1 = none; the screen then shows w / zoom by h / zoom of the world, about the centre). The zoom is the player's own (mouse wheel) and differs between peers: use it for drawing, never for anything the simulation reads.

Units: px

### `wa.world.pointer`

`wa.world.pointer()`

The mouse in the world, and whether the button is down.

Units: px

### `wa.world.water`

`wa.world.water()`

The water's height.

Units: px

### `wa.world.sky`

The height WA drops things from.

Units: px

### `wa.world.cavern`

`wa.world.cavern()`

Whether the map is a cavern.

### `wa.world.gravity`

`wa.world.gravity() / wa.world.wind()`

WA's gravity and wind.

Units: px/frame²

Also: `wa.world.wind`

### `wa.world.set_gravity`

`wa.world.set_gravity(v) / wa.world.set_wind(v)`

Changes them (simulation only).

Units: px/frame²

Also: `wa.world.set_wind`

### `wa.world.retreat`

`wa.world.retreat() / wa.world.set_retreat(ms) / wa.world.turn_clock() / wa.world.set_turn_clock(ms)`

Retreat countdown and turn clock left; `set_retreat` changes a running retreat only and returns whether it applied, `set_turn_clock` sets the turn clock (simulation only).

Units: ms

Also: `wa.world.turn_clock`, `wa.world.set_turn_clock`, `wa.world.set_retreat`

### `wa.world.frame`

`wa.world.frame()`

The simulation frame (50 per second).

Units: frames

### `wa.world.keys`

`wa.world.keys()`

The synced keys: left, right, up, down, jump, shift (sprint is its old name), q, space, ctrl, `plus_key`, `minus_key`, alt, `pause_key`, digit.

### `wa.world.networked`

`wa.world.networked()`

Whether the match is online.

### `wa.world.is_local_alliance`

`wa.world.is_local_alliance(colour)`

Whether this screen belongs to that side. Draw and HUD only.

### `wa.world.trace`

`wa.world.trace{ x0, y0, x1, y1, radius, with, ignore }`

Sweeps a circle and returns the first hit, its normal and the object.

Units: px

### `wa.world.blast`

`wa.world.blast{ x, y, owner, damage, radius, push_pct, terrain_radius }`

A radial blast with no sound or visuals: every body in `radius` takes `damage` falling off linearly from its centre (rounded down) and a push in step with the damage reaching it (`damage / 5` px/frame at 100%); `terrain_radius` cuts a hole of its own. `damage` 0..10000, `radius` above 0 and at most 8192, `push_pct` 0..1000 (default 100), `terrain_radius` 0..200 (default 0, no hole). `owner` (a worm) takes the credit; leave it out for a neutral blast. WA's objects take their usual hits, actors get `on.hit` with the damage already scaled, and `hit_by.blasts` immunity holds. Returns how many it hit. Simulation callbacks only.

Units: position, radius px · push\_pct %

### `wa.world.collides`

`wa.world.collides{ x, y, radius, with, ignore }`

Whether a circle there overlaps anything.

Units: px

### `wa.world.electrical_trace`

`wa.world.electrical_trace(x0, y0, x1, y1)`

The nearest land or object an electric arc strikes.

Units: px

### `wa.world.electrical_nearby`

`wa.world.electrical_nearby(x, y, radius, graves)`

The objects an arc can strike within a radius.

Units: px

### `wa.magnetism.field`

`wa.magnetism.field{ source = actor, ... }`

Registers a match-wide magnetic field on an actor; fields sum across packs from one simulation-step snapshot and disappear with their source. Actors opt in with magnetic = 1.

Units: px

Also: `magnetic`

### `wa.magnetism.sample`

`wa.magnetism.sample(x, y [, actor])`

The fields' force at a point, for custom movement; with an actor, as that actor feels it. Point-only sampling is read-only.

Units: position px

### `wa.land.solid`

`wa.land.solid(x, y)`

Whether the land is solid there.

Units: px

### `wa.land.trace`

`wa.land.trace(x0, y0, x1, y1)`

Traces a line against the land, with the normal at the hit.

Units: px

### `wa.land.cut`

`wa.land.cut{ x, y, shape = "circle" | "drill" | "torch", radius, facing, angle }`

Cuts the land: a round hole (radius 1..200), WA's drill shape, or its blowtorch tunnel (facing ±1, angle −1..1). Simulation only.

Units: px

### `wa.land.stamp`

`wa.land.stamp{ sprite, frame, x, y }`

Draws a pack frame into the land.

Units: px

### `wa.math`

`wa.math.sin(r) / wa.math.cos(r) / wa.math.atan(y, x)`

Trig with the same bits on every machine (WA's table). Use it in simulation code instead of `math.sin` and friends.

Units: radians

Also: `wa.math.sin`, `wa.math.cos`, `wa.math.atan`

## Events

Hooks a pack registers with `wa.on`, and the stock message names.

### `wa.on.turn_start`

`wa.on.turn_start(fn)`

When a turn starts, and again with the new worm at a worm switch within it (Tab, Select Worm).

### `wa.on.turn_retreat`

`wa.on.turn_retreat(fn)`

When weapon use ends and retreat starts.

### `wa.on.turn_end`

`wa.on.turn_end(fn)`

When the turn ends (after the retreat), on the frame WA ends it, before WA waits for everything to settle. A turn whose worm is gone (a Kamikaze off the map) gets it then too, with no worm. A worm switch within the turn (Tab, Select Worm) doesn't end it.

### `wa.on.turn_cleanup`

`wa.on.turn_cleanup(fn)`

After WA clears the turn.

### `wa.on.death`

`wa.on.death(fn)`

Once per worm death, with the attacker when known and the weapon's id.

Also: `event.victim`, `event.attacker`, `event.attacker_team`, `event.weapon`

### `wa.on.hurt`

`wa.on.hurt(fn)`

On every damage message. It can change the amount or eat the hit; hit.`source_weapon` is the id of an arrow's weapon.

Also: `hit.source_weapon`

### `wa.on.worm_message`

`wa.on.worm_message(fn, { msgs })`

On WA's messages to worms. Name the messages you need in msgs: the engine skips Lua for the rest.

### `wa.on.missile_frame`

`wa.on.missile_frame(fn)`

For every WA missile, each frame.

### `wa.on.gravity_before`

`wa.on.gravity_before(fn) / wa.on.gravity_after(fn)`

Around WA's gravity step.

Also: `wa.on.gravity_after`

### `wa.on.contact`

`wa.on.contact(fn)`

When a worm touches another entity.

### `wa.on.body_move`

`wa.on.body_move(fn, { kinds })`

Before WA moves each body of those kinds, each frame.

### `wa.on.weapon_grant`

`wa.on.weapon_grant(fn)`

After a worm gets weapons (crate, inventory or script).

### `wa.on.oil_explode`

`wa.on.oil_explode(fn)`

When WA is about to blow up an oil drum, in the simulation. ev:replace() stands in for WA's blast, fires and sound, as Project X's COilDrum::Explosion; WA frees the drum either way.

Units: ev.x, ev.y px

Also: `ev.drum`, `ev.team`, `ev:replace`

### `wa.on.draw`

`wa.on.draw(fn)`

Each rendered frame, to draw. Read only.

### `wa.on.hud`

`wa.on.hud(fn)`

Each rendered frame, for HUD lines. Read only.

### `wa.msg`

Stock message names: `START_TURN` (also when Tab picks another worm), TURN\_STARTED (a real team-turn start, after the worm gains control), `FRAME_FINISH`, FIRE\_WEAPON, RELEASE\_WEAPON, WEAPON\_RELEASED (WA's launch notification, before an ordinary shot's final fire; not an after-fire hook for every weapon), JUMP, JUMP\_UP, HIT, EXPLOSION, IMPACT, NONLETHAL, POISON.

Also: `wa.msg.START_TURN`, `wa.msg.FRAME_FINISH`, `wa.msg.FIRE_WEAPON`, `wa.msg.RELEASE_WEAPON`, `wa.msg.JUMP`, `wa.msg.JUMP_UP`, `wa.msg.HIT`, `wa.msg.EXPLOSION`, `wa.msg.IMPACT`, `wa.msg.NONLETHAL`, `wa.msg.POISON`, `wa.msg.TURN_STARTED`, `wa.msg.WEAPON_RELEASED`

## Drawing, HUD, sprites and sound

Read-only drawing at render time, named draw depths, and a component's own art and sounds.

### `wa.draw.quad`

`wa.draw.quad{ points, color or colors, sprite, frame, blend, depth }`

Draws a textured quad; corners in the world. depth places it among the GPU sprites by [`wa.depth`](#wadepth)'s three bands (behind terrain, on the ground, in front of WA's world).

Units: px

### `wa.draw.ribbon`

`wa.draw.ribbon{ points, width, ... }`

Draws a textured strip through points (beams, arcs).

Units: px

### `wa.draw.random`

`wa.draw.random(...)`

A random number for looks only, never for the simulation.

### `wa.draw.fraction`

`wa.draw.fraction()`

How far this rendered frame is past the last simulation frame, 0 to 1: WA's own interpolation, the one worms and actors are drawn with. Draw a body you track yourself at `x + (x - previous_x) * wa.draw.fraction()` so it moves as smoothly as an actor. Inside `wa.on.draw` only; it differs on every machine, so never feed it to the simulation.

### `wa.depth`

`wa.depth.FRONT, EFFECTS, WORMS, OBJECTS, TERRAIN, BEHIND_TERRAIN`

Named draw depths; lower is nearer. Plain numbers, so `wa.depth.OBJECTS` - 1 sits just in front. Three bands: at or behind terrain (`0x180000`) terrain hides a GPU draw; from `0x100000` to `wa.depth.TERRAIN` - 1 it lies on the ground, in front of terrain but under whatever WA draws (worms, objects, effects, front water); nearer than `0x100000` only the HUD covers it.

### `wa.hud.line`

`wa.hud.line(text)`

Adds a line to the HUD.

### `wa.hud.message_top`

`wa.hud.message_top(text, { to, alliance })`

WA's top-centre banner, as selecting a weapon shows it: one line of at most 127 bytes. to is `"all"` (default), `"active"` (the player whose turn it is) or `"coalition"` (the active team's, or alliance 0-5). Call from simulation events.

Also: `message_top`

### `wa.hud.window`

`wa.hud.window{ text | lines, x, y, align, font, color, border, max_width, to, alliance, over_panel }`

A text window in WA's own fonts and box style, sized to its text, open until closed or the match ends; returns a handle. text takes \\n line breaks; lines = { `"a"`, { `"b"`, color = `"yellow"` } } colours lines. font: small, standard (the round timer's) or medium. color and border: white, grey, red, blue, green, yellow, purple, cyan; border `"none"`. `max_width` wraps at spaces. align names the box's and the screen's point x, y offset it from (`top_left` ... `bottom_right`, center). to / alliance as [`message_top`](#wahudmessage_top), taken when given. Fades out while the weapon panel is open unless `over_panel` = true. Drawn over WA's HUD on the GPU layer (`Direct3D` 9 shader). At most 32 open.

Units: px

Also: `hud.window`

### `window:set`

`window:set{ text, x, color, ... }`

Changes a window; omitted keys keep their values. False once it is closed.

### `window:close`

`window:close()`

Closes a window; false if it already was.

### `window:is_open`

`window:is_open()`

Whether the window is still open: the same on every machine.

### `wa.sprites.key`

`wa.sprites.key(name)`

Resolves a pack sprite name once, for reuse in draw calls.

### `wa.assets.load`

`wa.assets.load{ sprites, sounds, gpu_prefix }`

Loads a component's own sprites and sounds on no weapon, from its install: how an add-on draws and plays its own art.

### `wa.sound.play`

`wa.sound.play(target, sound)`

Plays a sound at a worm, actor or object.

### `wa.camera.follow`

`wa.camera.follow("all" | "owned" [, { public = false }])`, `wa.camera.follow()`

What WA's automatic camera may follow on each machine. `"owned"`: the other side's worms, team cursor, shots and Lua actors never move this player's camera, so it gives none of them away (Project X's fog rule). Crates, drums, fire and explosions still move it; `public = false` drops those too. Online a player's side is the teams their machine plays; offline and in replays it is the side whose turn it is; with fog on, what the fog shows them. `"all"` is WA's own, and every match starts with it. Returns the rule now in force and whether objects of no side still move the camera. Presentation only, from any callback. The fog add-on's `camera_follow` option sets it.

Also: `camera.follow`

### `wa.camera.look`

`wa.camera.look(x, y, { priority = 5, fixed = false, owner })`

Asks for the camera this frame, as a WA object does. WA forgets every request each frame, so call it every frame it should hold the camera, from a simulation callback. priority 0..13, lower is stronger (WA asks at 0 for the team's land cursor, 1..13 for worms and objects); `fixed = true` takes WA's fixed point, before any priority. With owner (a worm, actor or object) `wa.camera.follow` drops it as it would that owner's own requests; without, it counts as an object of no side.

Units: px

Also: `camera.look`

### `object.camera`

`worm.camera = nil | false | priority`, `object.camera = ...`

One worm's or stock object's own camera requests: nil is WA's, false never moves the camera, a priority 0..13 asks at that priority instead. `wa.camera.follow` still applies. Any callback; it goes with the object. Not on the `wa.on.missile_frame` table: take the missile from `wa.world`'s lists.

Also: `worm.camera`

## Fog of war

Configure the fog of war and place lights, darkness and shadows. The fog is presentation only: it never reaches the simulation, so these may be called from any callback, and each machine may see differently.

### `wa.fog.set`

`wa.fog.set{ circle_radius, cone_width, cone_length, shadow_cast, discover, view_ownership, fog_floor, ... }`

Replaces the live fog settings, starting from the current ones. Every key is validated first; a bad key or value raises an error naming its range and leaves the fog unchanged. `fog_floor` = 100 (a fully lit map) turns terrain memory off.

Units: px; degrees; percent

### `wa.fog.get`

`wa.fog.get("circle_radius")`

A fog setting's current value, or `nil` for an unknown name.

### `wa.fog.defaults`

`wa.fog.defaults()`

Every fog setting's default, as { name = value }.

### `wa.fog.enable`

`wa.fog.enable(true | false)`

Turns the fog on or off for the match. Only for packs that declare `[fog]` in mod.toml.

### `wa.fog.enabled`

`wa.fog.enabled()`

Whether the fog is on.

### `wa.fog.visible`

`wa.fog.visible(x, y)`

This machine's brightness at a point, 0..255, including the floor and shade. Draw and HUD callbacks only: local visibility must never steer the simulation.

Units: px

### `wa.fog.light`

`wa.fog.light{ x, y, kind, mode, circle, cone = { length, width, toward }, shadow_cast, seen_by, owner, discover, strength, fade }`

A light without an actor, returning a handle. Same keys as a.light, plus a place, an optional owner worm and fade (milliseconds: the circle closes like a blast's, then the light is removed). Seen by everyone unless owner is given. Its cone needs numeric toward degrees, since it has no heading. At most 64 free lights.

Units: px; degrees; ms

Also: `fog.light`

### `light:move`

`light:move(x, y)`

Moves a free light.

Units: px

### `light:set`

`light:set{ circle, mode, fade, ... }`

Changes a free light's settings; omitted keys keep their values. A new fade restarts its fade.

### `light:remove`

`light:remove()`

Removes a free light.

## Rules and utilities

Per-worm inventories, deterministic randomness and ordering, profiling and logging.

### `wa.inventory.create`

`wa.inventory.create{ id, slots }`

A pack's per-worm weapon store, above WA's team ammo.

### `inventory:get`

`inv:get / set / add / remove / clear / list`

Reads and changes one worm's store.

Also: `inventory:set`, `inventory:add`, `inventory:remove`, `inventory:clear`, `inventory:list`

### `inventory:deal`

`inv:deal(worm, pool, count)`

Deals random weapons through WA's random generator.

### `inventory:transfer`

`inv:transfer(from, to, opts)`

Moves or copies weapons between worms.

Units: x, y px

### `inventory:apply`

`inv:apply(worm, opts)`

Writes a store into WA's real ammo.

### `wa.random`

`wa.random(a, b)`

WA's own random number, the same on every machine. Simulation only; `math.random` is removed.

### `wa.sorted`

`wa.sorted(t)`

A table's keys in a fixed order, for deterministic loops.

### `wa.perf.enable`

`wa.perf.enable{ counter, profile, packs, spikes }`

FPS counter and profiler in wkLua.log.

### `wa.log`

`wa.log(text)`

Writes a line to wkLua.log, tagged with the pack.
