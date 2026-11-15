# WormForge Lua verbs

Every `wa` function, handle method, event and data field a pack can use, by area. It replaces the capabilities page.

WormForge 0.9.53 · `api_version = 4` · updated 2026-11-01.

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

Give a placed weapon its record, art and behaviour, read it back, or fire one from a script. A weapon is named by its id (px.javelin, or `stock.bazooka`).

### `wa.weapons.replace`

`wa.weapons.replace{ copy_from, name, missile, ... }`

In a weapon's install: gives the weapon its record, art and behaviour (see [Claim fields](#claim-fields)).

### `wa.weapons.launch`

`wa.weapons.launch{ weapon, owner, x, y, vx, vy, missile, clusters }`

Fires a real WA missile: a placed custom weapon or `stock.<name>`. missile = { ... } and clusters = { ... } change that shot's record fields (fuse, sprite, explosion.power, burst, ...). Since 0.9.8, also a weapon a component [`launches`](launches.md) that the profile doesn't place.

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

A weapon's record as the claim's named tables, with fires.as naming its family: a placed weapon's as this round has it, WA's untouched one for a `stock.<name>` not on the panel. Since 0.9.8, also the record of a weapon only [launched](launches.md).

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

Fields read by replace. Record: `copy_from` (`stock.<name>`) or wep (a .wep file), and the record as named tables: fires, handling, missile, clusters, mine, gun, strike, `jet_pack`; raw = { `[offset]` = value } for a field without a name. Behaviour: `on_fire`, `on_click`, `on_select`, `on_explode`, `on_place`, `on_proximity`, `eat_fire`, `click_finish`, click (since 0.9.9: "homing", the cursor on selection, the click marks the target and Space fires, whatever the record; the `on_fire` event gets target = { x, y }), `fire_repeat`, `stock_fire_choice`, airborne, actor, `is_weapon`. Art and sound: name, `panel_icon`, `panel_icons`, icon, sprites, `sprite_overrides`, sounds, hold, `worm_sprites`, `worm_sprites_animate`, `worm_sprites_toggle`, `worm_sprites_team_tint`, `mole_dig_rotation`; params for drawing (`gpu_prefix`, layer, depth, truecolor, `gpu_worm_sprites`, `worm_art`: the sheets of sprites a Lua actor draws in the worm's place, the worm in them, which glow with it, see [`a:gfx`](#agfx)).

Also: `wep`, `copy_from`, `fires`, `handling`, `missile`, `clusters`, `mine`, `gun`, `strike`, `jet_pack`, `raw`, `params`, `on_fire`, `on_click`, `on_select`, `on_explode`, `on_place`, `on_proximity`, `eat_fire`, `click_finish`, `click`, `fire_repeat`, `stock_fire_choice`, `airborne`, `is_weapon`, `name`, `panel_icon`, `panel_icons`, `sprite_overrides`, `truecolor`, `sounds`, `hold`, `worm_sprites`, `worm_sprites_animate`, `worm_sprites_toggle`, `worm_sprites_team_tint`, `gpu_worm_sprites`, `worm_art`, `mole_dig_rotation`

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

`rope_length = 400`

The Ninja Rope's maximum length in pixels, up to 1071: how far its shot reaches and how far it pays out while hanging. Unset, the rope's scheme power gives it, with its shots and angle: power 0 one shot of 294 px within 45°, 1 two of 336 within 45°, 2 two of 378 within 90°, 3 four of 420 within 90°, more unlimited of 462 within 90°. Up to 0.9.9 the length was read as half its pixels: double an older value.

Units: px

Also: `rope_length`

### `data.rope_angle`

`rope_angle = 45`

How far from straight up the Ninja Rope aims: `45`, `90` or `144` degrees. Unset, the rope's scheme power gives it (Intermediate's 90).

Units: degrees

Also: `rope_angle`

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

A utility: switched on by itself at turn start, or on a pickup while it is off, up to its `uses_per_turn`, the rest as its `extra_pickups` says; false keeps it to use by hand. `on_collect = "use" | "keep"` is the older spelling, still read; weapon data in `ctx.data` carries both, and `auto_use` wins where a declaration gives both.

Also: `auto_use`, `on_collect`, `data.on_collect`

### `data.uses_per_turn`

`uses_per_turn = 1 | ... | 255 | "unlimited"`

An instant utility that stacks: how many units one turn may use, by itself or by hand; a use past it is refused and the unit stays. WA's Double Time takes it as its stack limit. Declaring it makes the loader offer it (+N Seconds does). Since 0.9.82.

Also: `uses_per_turn`

### `data.extra_pickups`

`extra_pickups = "keep" | "discard"`

An instant utility with Auto-Use: what becomes of units past the turn's uses, banked for later turns or dropped. Units already held and infinite ammo are never dropped. WA's own four default to `discard`, as without Conserve Instant Utilities, which WormForge fixes. Since 0.9.82.

Also: `extra_pickups`

### `data.retreat_collect`

`retreat_collect = "activate" | "keep" | "discard"`

An instant utility with Auto-Use: a pickup during retreat is used at once, saved for the team's next turn, or dropped (`"nothing"` is the older name). A Lua utility handles it in its own `weapon_grant` callback, as +N Seconds does. Declaring it makes the loader treat the weapon as an instant utility and offer it with `extra_pickups`. WA's own four default to `activate`, as WA uses a pickup during the team's own retreat at once. Since 0.9.82.

Also: `retreat_collect`

### `data.placement_collect`

`placement_collect = "activate" | "keep"`

One of WA's four instant utilities with Auto-Use: a pickup during manual placement is used at once, through WA's own Expedite Instant Utilities step (a Crate Spy shows the crates to the worms still to be placed), or kept for the team's first turn. WA uses no instant utility before every worm is placed. Defaults to `keep`, as WA's Expedite off; a `.wsc` with Expedite on imports as `activate`. Since 0.9.82.

Also: `placement_collect`

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

### `data.remembered`

`remembered = true | false`

Whether WA remembers the weapon for the worm that selected it: after a use the worm gets it back while it has ammo, and its next turn starts with it. WA's own pick of a weapon (a worm with nothing to keep) only chooses remembered weapons. Left out, the weapon's record: WA remembers 18 of its own (the Bazooka, Grenade, Uzi, Ninja Rope and others, not the Parachute, Jet Pack or Bungee), and every one with RubberWorm's Remember Weapons. A profile's value wins over both. The loader shows it as **Remember Weapon**.

Also: `remembered`

## Worms

Read and move worms, change their ammo, and hand them between WA and the pack.

### `wa.worms.all`

`wa.worms.all()`, `wa.worms.all{ near = { x, y, r } }`

Every worm in the match; with `near`, only those within `r` pixels of (x, y), in the same order. `near` comes after 0.9.61.

### `wa.worms.nearest`

`wa.worms.nearest(from)`

The worm nearest a point or object.

### `wa.worms.spawn`

`wa.worms.spawn{ team, x, y, name, health }`

Adds a worm to a team, in the place of a dead worm first, standing at once. A worm that died this turn keeps its place until WA has counted the turn's damage (since 0.9.83): a full team is refused until then.

Units: position px

### `worm.fields`

`Worm fields (read and write)`

x, y, vx, vy, facing, visible, `body_visible`, `collision_mask`, fuel, gravity, wind, windup, `shots_fired`, `shots_to_fire`, name (writes, from simulation callbacks, keep the first 16 printable ASCII bytes and change the native name and label; id and the saved team stay); invisibility (true: WA's Invisibility for this worm alone, as its team's would give it: hidden and not followed where WA wouldn't show an invisible team, ghosted where it would; a weapon that ends Invisibility ends it; writes from simulation callbacks); selectable (false: WA's turn rotation and Tab pass over the worm, as Project X passes over its zombies; it keeps its health and place and still acts; if every living worm of its team is passed over, WA's pick stands; writes from simulation callbacks; every round starts selectable; since 0.9.8); tint (0xRRGGBB, { color, blend = "multiply" | "smooth_add", light = 0..1, glow = 0..1, `glow_color` } or nil: the body drawn with its colours multiplied by the colour, or Project X's smooth add of it, lit by it and glowing in it, as Project X's zombie; `glow_color` gives the glow a colour of its own, so a white color keeps WA's colours under a glow of any colour (Core utilities' Worm glow); drawing only, any callback; needs the shader renderer; since 0.9.8); `hide_hud` ({ labels, arrow, weapon, aim, from = "everyone" | "enemies" }, true or false: those parts of WA's HUD for the worm left undrawn, the body still drawn: its name, team, health and fuel labels; the arrow over it on its turn, the circling select arrows and the off-screen marker; the thought cloud while its player picks a weapon; its aim and crosshair; "enemies" hides them only from viewers who don't play its side; drawing only, any callback, may differ between machines; since 0.9.8); `time_scale` (0..8: the worm lives that many of its own frames each world frame, WA's step of its body and its frame repeated, a fraction carried to the next, so 2.5 is two then three; 1 is the world's pace, 0 stops its time; drawn smoothly, a frame of its own at a time; with [`wa.world.set_speed`](#waworldspeed), a worm at full speed in a slowed world (Core utilities' Bullet Time); writes from simulation callbacks; since 0.9.82).

Units: x, y px · vx, vy px/frame · gravity, wind factor (1 = normal) · fuel plain (0 = unlimited) · windup frames

Also: `worm.x`, `worm.y`, `worm.vx`, `worm.vy`, `worm.facing`, `worm.visible`, `worm.body_visible`, `worm.collision_mask`, `worm.fuel`, `worm.gravity`, `worm.wind`, `worm.windup`, `worm.shots_fired`, `worm.shots_to_fire`, `worm.name`, `worm.invisibility`, `worm.selectable`, `worm.tint`, `worm.body_scale`, `worm.hide_hud`, `worm.time_scale`

### `worm.readonly`

`Worm fields (read only)`

id, team, alliance, `ammo_group`, hp, kind, weapon (its id), turn, name, aim, `aim_target` (since 0.9.81: the aim the shot uses, which aim eases toward, in [`worm:input`](#worminput)'s degrees), aiming, click (since 0.9.9: the click the cursor is up for on this turn's worm, "girder", "strike", "teleport" or "homing"; `nil` with no cursor up), target (since 0.9.9: { x, y }, the point the worm's last click marked), drilling, state (standing, walking, ready, charging, prefiring, firing, fired, punching, drilling, teleporting, jetpacking, parachuting, sliding, roping, bungee, tumbling, frozen, kamikaze, `jump_prepare`, jumping, `jump_falling`, blasted, hit, and its death: dying, drowning, dead; `nil` for any other WA state), `state_id`, `state_label`, keys, taken.

Units: aim 0 (down) to 1 (up); `aim_target` degrees, -90 (down) to 90 (up), 0 level, relative to facing

Also: `worm.aim`, `worm.aim_target`, `worm.aiming`, `worm.alliance`, `worm.ammo_group`, `worm.click`, `worm.drilling`, `worm.hp`, `worm.id`, `worm.keys`, `worm.kind`, `worm.state`, `worm.state_id`, `worm.state_label`, `worm.taken`, `worm.target`, `worm.team`, `worm.turn`, `worm.weapon`

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

Selects a placed weapon, by its id, as the player's own selection does: WA's fire key then fires it, under WA's rules. With no ammo the team gets one shot, taken back at the end of the turn if it wasn't fired. Returns the ammo held, or 0 when WA refuses the selection (in the middle of a use). Since 0.9.82; before, it armed the weapon outside WA's rules.

### `worm:hurt`

`worm:hurt(n) / worm:hurt{ amount, vx, vy, react, kind }`

Damages the worm, optionally with knockback. react = false: the damage alone, without WA's hit (no flinch, push or landing damage). `kind` is the hit's kind (see [Hit kinds](#hit-kinds)), the Prod's when left out. Since 0.9.83.

Units: knock px/frame

### `worm:heal`

`worm:heal(n) / worm:heal(n, { from_zero })`

Adds health. A worm at 0 HP is refused, unless from_zero = true and WA hasn't started killing it (since 0.9.8): Project X's zombie, raised after a fall.

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

`worm:take{ hide, turn, fire, fire_as }`

Hands the worm to the pack: it stays where the pack puts it. Returns whether it did. Refused (false) for a worm in WA's death (dying, drowning, dead): WA keeps it still until it is gone. `fire` is what it may fire while held: nothing (the default), everything (`true`) or a list of weapon ids. `fire_as = "bungee"` has WA judge that fire as from its bungee, whatever state the worm is held in, so strikes, the Teleport and the Girder fire where a jump or fall refuses them. A held worm WA starts teleporting is let go, so the teleport ends where it was aimed.

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

### `worm:use`

`worm:use(weapon)`

WA's own action of a weapon, performed by the worm now without firing it: no ammo or delay, nothing to its team or the turn. A placed weapon, else `stock.<name>`; its record this round decides. So far the Fire Punch family and the Jet Pack family (an error for others). A jet pack puts the worm on WA's own jet pack with that record's fuel: unsteered it sinks slowly and lands unhurt, and stays on it until its fuel runs out, it is hit, or `worm:release` takes it off. False for a dying worm, one already using one or on a jet pack, or the worm whose turn it is. Simulation callbacks only. Since 0.9.8; the Jet Pack since 0.9.83.

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

Sends WA's own input messages for a worm, as its player's keys would: fire press or release, aim (degrees from level, -90 down to 90 up), fuse 1..5, bounce min or max, a click, or one key (left, right, up, down, face_left, face_right, jump, backflip, special, tab). Movement keys request one frame: send them each frame to hold. A worm without the turn walks too (Project X's zombies), and its keys never steer the team's released weapon. Simulation callbacks only. Up to 0.9.7 an offline diagnostic, opt-in per bundle (`debug_input`); since 0.9.8 any bundle, online too.

## Lua actors

Bodies the pack controls: spawn them, move them, draw them.

### `wa.actors.spawn`

`wa.actors.spawn{ sprite, x, y, ... }`

Creates a native WA actor. body = { shape, hits, `hit_by`, [`pushed_by`](#bodypushed_by) } chooses its outline, outgoing movement, incoming attackers and how hard what runs into it pushes it, independently. A body uses the oil-drum layer (17). shape is worm (default), missile, sprite (registered sprite frame zero), or a pack-relative image path; a bare image uses no sprite slot and works with sprite=false. hits defaults to {}; `hit_by` defaults to `"all"`. Legacy collide, `collide_terrain`, `collide_worms`, `as_object`, shape, solid and mask options are accepted only without body. Other keys: sprite, x, y, vx, vy, from, origin, owner, gravity, `damage_terrain`, `damage_worms`, drown, persist, visible, loop, [`on_explode`](#claim-fields), on = { frame, land, hit, contact, bump }. owner is a worm or actor; left out, a simulation callback's own worm or actor. `owner = "none"` spawns an actor of no team (Project X's team 0), as one whose owner WA freed: what it fires, launches, lays or blasts is no team's. Without either, the spawn errors; `owner = "none"` takes no cluster.

Units: position px

Also: `as_object`

### `wa.actors.all`

`wa.actors.all()`, `wa.actors.all{ near = { x, y, r } }`

Every live actor; with `near`, only those within `r` pixels of (x, y), in the same order. `near` comes after 0.9.61.

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

How hard what runs into the actor pushes it. When a body WA moves runs into the actor, WA trades their speeds; the actor keeps this share (0 to 1) of the speed it was given, and the mover keeps the speed WA left it, so it slows against the actor instead of bouncing off. Keys: worms, missiles, arrows, mines (every WA mine, the level's as much as a laid one), actors; one left out keeps WA's whole push. Blasts, guns and other hits are not affected: they still reach the actor through `on.hit`. Set at spawn. A sprite-shaped actor with on.contact gets no push from WA to scale. The Electromagnet sets mines and missiles to 0, so nothing its field drags can knock it away.

Units: share 0..1

### `a.light`

`a.light = "projectile" | false | { kind, mode, circle, cone = { length, width, toward }, shadow_cast, seen_by, discover, strength, owner_strength, reach, without_fog, into_terrain = { depth, falloff } }`

The actor's fog-of-war light. A visible world actor has its profile's projectile light by default; invisible (sprite = false), cursor and screen-space actors have none until given one. A preset string (worm, animal, projectile, crate) uses that kind's profile settings; false removes the light; a table replaces the whole spec, and omitted geometry and `shadow_cast` come from its kind. mode is light (default), dark (shades what its cast sees) or shadow (shades what is hidden from it within reach); darkness wins over light. cone.toward is velocity (default), angle (the [`a:gfx`](#agfx) rotation), facing or degrees. `seen_by` is owner (default: the owning worm's side, per `view_ownership`; public without an owning worm) or everyone. discover = true requires `seen_by` = owner; dark and shadow never record terrain memory. strength (0..255) is for dark and shadow only. Dark and shadow also take (since 0.9.8): without_fog = true, drawn in a match without fog too, as the fog draws darkness with a fully lit floor, covering the names of worms under it; reach (0..700), how far the cast reaches, with circle (no more than reach) how far the darkness spreads inside it; and owner_strength (0..255), what the owner's side sees instead of strength. Dark only: into_terrain = { depth, falloff } (0..32 px each), the darkness going on into the terrain its cast reaches, depth pixels at full, then fading over falloff more, solid pixels only. Changing circle inside reach, strength or owner_strength never casts again, so a darkness may spread or fade every frame. Presentation only: any callback may set it. Reading returns the spec table, or false.

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

WA's blasts and hits on the actor go here instead of to its speed: hit.kind (`"blast"`, or the hit's name: see [Hit kinds](#hit-kinds)), hit.x, hit.y, hit.vx, hit.vy (the push WA would give), hit.damage (after distance falloff), hit.team. Blasts, `wa.world.blast`'s among them, also give hit.`power` (older name hit.`blast_damage`), the damage before falloff. hit.`hit_kind` was removed in 0.9.83; reading it is an error.

Units: px, px/frame

Also: `hit.kind`, `hit.damage`, `hit.power`, `hit.blast_damage`, `hit.team`

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

### `a:hit`

`a:hit(damage, vx, vy, kind)`

Sends the actor WA's hit through its own handler, as a gun or a flame reaches it: `body.hit_by` filters it, and `on.hit` (or, without one, WA's push) takes it. Use it to hit an actor another pack spawned. `damage` 0..10000; `kind` (see [Hit kinds](#hit-kinds)) the Prod's when left out. Returns false when the actor is gone or refuses it. Simulation callbacks only. Since 0.9.83.

Units: push px/frame

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

`a:gfx{ angle, scale, tint, depth, glow_of, follow }`

Sets several drawing fields at once. glow_of = worm: the actor is drawn in that worm's place (a vehicle hiding its body), so it glows behind it as `worm.tint` makes the worm glow, in the tint's glow strength and colour; false ends it. It needs the glow the match made for the actor's sheet: list the sheet in the weapon's params.`worm_art`. follow = worm (since 0.9.83): art the pack puts at the worm every frame is drawn moved as the worm is drawn between frames, by WA's prediction or, for a worm on its own time (`worm.time_scale`), by its own frames, so a vehicle stays smooth under Bullet Time; false ends it. Drawing only.

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

`wa.missiles.all(), wa.mines.all(), wa.crates.all(), wa.oil.all(), wa.graves.all(), wa.arrows.all()`, each also `{ near = { x, y, r } }`

WA's own objects of that kind; with `near`, only those within `r` pixels of (x, y), in the same order. The distance is exact in WA's fixed point. `near` comes after 0.9.61.

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

`object:hit(damage, vx, vy, kind)`

Sends WA's hit to a stock mine, crate or oil drum (anything else: false). `kind` (see [Hit kinds](#hit-kinds)), the Prod's when left out: a drum adds a `"fire"` hit's damage towards its limit and goes off at once at any other; a crate goes into its blast state whatever the damage; a mine takes the push. The old `"direct"` and `"projectile"` are errors since 0.9.83 (they sent `"prod"` and `"bullet"`).

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

### `wa.world.speed`

`wa.world.speed() / wa.world.set_speed(f)`

The world's speed as a factor of the scheme's engine speed, 1/16..16 (0.5 is half speed), set as WA's replay viewer sets it: WA's sounds pitch with it, a pack's own WAVs don't. It changes how long a frame lasts in real time, never what happens in a frame, so it can't split an online match; WA's turn clock counts frames, so a slowed turn lasts longer. speed() is what the packs set (the replay viewer's speed keys change only the watching machine). set_speed from simulation callbacks only; each round starts at 1. Since 0.9.82.

Also: `wa.world.set_speed`

### `wa.world.retreat`

`wa.world.retreat() / wa.world.set_retreat(ms) / wa.world.turn_clock() / wa.world.set_turn_clock(ms)`

Retreat countdown and turn clock left; `set_retreat` changes a running retreat only and returns whether it applied, `set_turn_clock` sets the turn clock (simulation only).

Units: ms

Also: `wa.world.turn_clock`, `wa.world.set_turn_clock`, `wa.world.set_retreat`

### `wa.world.placing`

`wa.world.placing()`

True while worms are still being placed (manual placement). WA uses no instant utility until every worm is placed, so a utility of a pack's own can keep its pickups for the team's first turn, as +N Seconds does, the way WA's Double Time waits. Read-only. Since 0.9.82 (check `wa.world.placing` before calling it).

Also: `placing`

### `wa.world.frame`

`wa.world.frame()`

The simulation frame (50 per second).

Units: frames

### `wa.world.keys`

`wa.world.keys()`

The synced keys: left, right, up, down, jump, shift (sprint is its old name), q, space, ctrl, `plus_key`, `minus_key`, alt, `pause_key`, tab, digit. None is held while the chat box or the Esc menu is open, or WA isn't the window in front.

### `wa.world.networked`

`wa.world.networked()`

Whether the match is online.

### `wa.world.worm_selecting`

`wa.world.worm_selecting()`

Whether WA is picking worms now, so Tab switches worms (the scheme's worm select, until the worm moves; all turn under "worm select always"). Outside it, Tab is free for a pack.

### `wa.world.is_local_alliance`

`wa.world.is_local_alliance(colour)`

Whether this screen belongs to that side. Draw and HUD only.

### `wa.world.trace`

`wa.world.trace{ x0, y0, x1, y1, radius, with, ignore }`

Sweeps a circle and returns the first hit, its normal and the object.

Units: px

### `wa.world.blast`

`wa.world.blast{ x, y, owner, damage, radius, push_pct, terrain_radius, kind }`

A radial blast with no sound or visuals: every body in `radius` takes `damage` falling off linearly from its centre (rounded down) and a push in step with the damage reaching it (`damage / 5` px/frame at 100%); `terrain_radius` cuts a hole of its own. `damage` 0..10000, `radius` above 0 and at most 8192, `push_pct` 0..1000 (default 100), `terrain_radius` 0..200 (default 0, no hole). `owner` (a worm) takes the credit; leave it out for a neutral blast. WA's objects take their usual hits; actors (since 0.9.83) and worms' `wa.on.hurt` get it as a blast, `kind = "blast"` (or `kind`'s name, see [Hit kinds](#hit-kinds)), `power` its damage, `damage` already scaled; `hit_by.blasts` decides for actors. To WA it is a hit: one per worm per frame. Returns how many it hit. Simulation callbacks only.

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

Once per worm death, with the attacker when known, the weapon's id and the last hit's kind.

Also: `event.victim`, `event.attacker`, `event.attacker_team`, `event.weapon`, `event.kind`

### `wa.on.hurt`

`wa.on.hurt(fn)`

On every damage message that reaches the worm. hit.kind is `"blast"`, the hit's name (see [Hit kinds](#hit-kinds); `"hit"` was split into them in 0.9.83), `"nonlethal"` or `"poison"`. It can change the amount or eat the hit; hit.`source_weapon` is the id of an arrow's weapon. Read hit.phase (`"pre"` before WA's handler, `"post"` after it, with hit.`lost`, the health it took). A blast comes only to the worms it reaches, with hit.`power` (the explosion's power, its amount), hit.damage (what the falloff gives this worm), hit.x, hit.y (the centre) and hit.vx, hit.vy (the push WA gives it). Changing a blast's amount changes its power for this worm alone; setting its damage in `pre` sets what this worm takes from it, the push left as WA's. hit.`expected` (blasts, hits and fire) is what WA will take off the worm's health, worked out before WA's handler by WA's own rules: 0 when the scheme's Phased Worms (Allied or Enemy) is at "worms, weapons and damage", the worm is frozen, dying or drowning, or, for a hit, was hit already this frame; half a blast plus 1 under water; Double Damage; no more than its health. It is for the message as WA sent it, and `lost` is what it took. Poison comes to every worm at each turn's end, amount 0 for a worm not poisoned.

Units: px, px/frame

Also: `hit.kind`, `hit.source_weapon`, `hit.phase`, `hit.lost`, `hit.power`, `hit.damage`, `hit.expected`

### Hit kinds

A hit says what hit, by name; WA 3.8.1 sends each from one weapon: `"prod"`, `"fire"`, `"drill"`, `"bullet"`, `"kamikaze"`, `"dragon_ball"`, `"baseball_bat"`, `"blow_torch"`, `"fire_punch"`, `"arrow"`, `"percent"` (Prod, flames, Pneumatic Drill, Handgun/Uzi/Shotgun/Minigun, Kamikaze, Dragon Ball, Baseball Bat, Blow Torch, Fire Punch, Longbow arrows, Battle Axe: `amount` a percentage of health). Only worms tell most apart: prod, kamikaze, dragon_ball, baseball_bat and fire_punch arm landing damage, fire tumbles the worm. Scripted kinds WA never sees (it gets the Prod's kind): the shared `"taze"`, and a bundle's own `"<bundle id>.<name>"` (lowercase letters, digits, `_`), which only that bundle may send. Senders: `worm:hurt`, `object:hit`, `a:hit`, `wa.world.blast`. Since 0.9.83.

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

### `wa.draw.quads`

`wa.draw.quads{ quads, count, sprite, frame, blend, depth, visibility }`

Draws many quads of one sprite in one call: nine numbers each in `quads`, `x1, y1, x2, y2, x3, y3, x4, y4, color`, the corners as [`wa.draw.quad`](#wadrawquad)'s points. `count` (at most 4096) defaults to `#quads // 9`, so one list can be refilled each frame. For particles; much cheaper than a `wa.draw.quad` a quad. Since 0.9.83.

Units: px

### `wa.draw.ribbon`

`wa.draw.ribbon{ points, width, ... }`

Draws a textured strip through points (beams, arcs).

Units: px

### `wa.draw.trail`

`local t = wa.draw.trail{ sprite, width, glow, glow_width, color, max = 12, shed = 2, floor = 0.1, blend, depth }`, then `t:push(x, y)`, `t:finish()`, `t:remove()`, `t.points`

A ribbon the engine keeps and draws every frame, fed a point at a time from any callback: a trail behind a round. Point i of n (oldest first) is drawn at f = max(i / (n + 1), floor) of its width, u and colour; `glow` draws it again, wider. Finished, it sheds its oldest point every `shed` game frames. Since 0.9.62.

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

### `wa.hud.fps_counter`

`wa.hud.fps_counter()`

Turns on the FPS counter for the match: this machine's frame rate over the last second, at the top right. Every build; Lua cannot read the rate back. Since 0.9.8.

### `wa.hud.message_top`

`wa.hud.message_top(text, { to, alliance })`

WA's top-centre banner, as selecting a weapon shows it: one line of at most 127 bytes. to is `"all"` (default), `"active"` (the player whose turn it is) or `"coalition"` (the active team's, or alliance 0-5). Call from simulation events.

Also: `message_top`

### `wa.hud.tray`

`wa.hud.tray.add{ weapon, team, key, to, lit, progress }`

Puts a team's weapon in the HUD tray: cells at the top right in the weapon panel's look (icon, the team's ammo and delay), oldest at the right, each sliding in. `key` (up to 8 bytes) shows in a strip under the cell. Shown only on that team's turn, to `to` (coalition by default, active, all). Adding it again returns the same entry. The handle's `set{ key, lit, progress }` changes what it names; lit draws a yellow border and holds the entry, progress (0..1) a bar along its bottom. `remove()`, `is_open()`. Dropped once the team has none left, unless lit. Drawn over the fog and WA's HUD on the GPU layer (`Direct3D` 9 shader), never rippled or zoomed; the FPS counter sits under it. At most 32.

Units: px

Also: `hud.tray`

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

`wa.assets.load{ sprites, sounds, gpu_prefix, wa_sprites, worm_glow }`

Loads a component's own sprites and sounds on no weapon, from its install: how an add-on draws and plays its own art. wa_sprites (since 0.9.8) names WA's own sprites, by Gfx.dir name or the group "worm" (a worm's poses without a weapon), copied in full colour with the match, so what draws them in colour (`worm.tint`) has them from the start. `worm_glow` (since 0.9.8: true or { radius = 1..16, pad = 0..40, gain = 0.1..8 }) sets the shape of the match's worm glows (the silhouette blurred twice by radius, on cells pad larger each side, brightened by gain; left out: 3, twice the radius and one, 1.6) and makes glows with the match for the placed weapons' own worm poses, so a glowing worm aiming one keeps its glow, and for the sheets the placed weapons draw in the worm's place (params.`worm_art`), for [`a:gfx`](#agfx)'s glow_of.

### `wa.sound.play`

`wa.sound.play(target, sound)`

Plays a sound at a worm, actor or object.

A sound can be one line of one of WA's soundbanks, the same for every team whatever bank each picked: declare it in the component's `sounds` (or `wa.assets.load{ sounds }`) as `soundbank/<Bank>/<Line>`, then play it by that name.

```lua
sounds = { "soundbank/Kamikaze/Collect" },
-- ...
wa.sound.play(worm, "soundbank/Kamikaze/Collect")
```

The bank is a folder of `DATA\User\Speech` (WA's own banks, `Africaan` to `Wideboy`) or `User\Speech` (the player's own); the line is a file of it without `.wav` (`YesSir`, `Collect`, `Hmm`), case ignored. Only the lines a component declares are loaded. A bank a machine doesn't have (a custom bank, or one the digital releases leave out, such as `Jock`) is silent there and noted in `wkluaerror.txt`; the component still loads. Since 0.9.83 (an older DLL refuses the entry).

### `wa.music.set_pitch`

`wa.music.set_pitch(factor)`

Plays WA's soundtrack at `factor` times its rate, 1/16..2: pitch and tempo together, as a tape slowed down or sped up (0.5 is an octave lower and half as fast). It holds until set again, across tracks; every match starts at 1. WA's sound effects follow [`wa.world.set_speed`](#waworldspeed) instead, and the music doesn't, so a pack slowing the world sets both (Core utilities' Bullet Time).

Presentation only, from any callback: nothing about it can be read back, so a simulation callback may set it on every machine. Silent music, or none, leaves nothing to change. Since 0.9.83.

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

### `wa.view.ripple`

`wa.view.ripple{ x, y, amplitude = 6, wavelength = 48, speed = 200, duration_ms = 600, falloff = wavelength }`

Waves spreading from a world point through this machine's picture of the world: the land, water, worms, objects, actors, worm names and the crosshair ripple; the screen HUD (the timer, the wind bar, the weapon panel, chat, the Esc menu) does not. The leading wave travels `speed` pixels per second, the waves behind it halve every `falloff` pixels, and all of them fade out over `duration_ms`. `amplitude` is the largest push in pixels (0..64), `wavelength` the waves' length (8..4096). A falloff shorter than the wavelength leaves one ring, a shockwave; a longer one, a train of rings. Returns a handle: `r:stop()` ends it early. Up to 32 at once; another ends the oldest.

Presentation only, from any callback: an explosion's `on_explode` may start one, and every machine draws its own. Nothing about a ripple can be read back. It moves the fog's darkness too, so one in the fog shows where it is. Needs WA's Direct3D 9 (shader) renderer, as all GPU drawing does; elsewhere it isn't drawn. Clicks and `wa.world.pointer()` ignore it. A frame with a ripple costs what a zoomed one does. Since 0.9.83.

Units: px, px/s, ms

Also: `view.ripple`

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

### `wa.fog.shade`

`wa.fog.shade(x, y)`

This machine's darkness at a point, 0..255: the dark and shadow lights' shade, with fog or without (`without_fog`). Draw and HUD callbacks only. With `worm.hide_hud`, hide the HUD of worms in the dark. Since 0.9.8.

Units: px

### `wa.fog.light`

`wa.fog.light{ x, y, kind, mode, circle, cone = { length, width, toward }, shadow_cast, seen_by, owner, discover, strength, owner_strength, reach, without_fog, into_terrain, fade }`

A light without an actor, returning a handle. Same keys as a.light, plus a place, an optional owner worm and fade (milliseconds: the circle closes like a blast's, then the light is removed). Seen by everyone unless owner is given. Its cone needs numeric toward degrees, since it has no heading. With reach, fade closes the spread, not the cast. At most 64 free lights.

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

`wa.perf.enable{ profile, packs, spikes, natives }`

Profiler in wkLua.log. Diagnostics builds only; `natives` comes after 0.9.61. Up to 0.9.7 it also took `counter`, the FPS counter, now `wa.hud.fps_counter`.

### `wa.log`

`wa.log(text)`

Writes a line to wkLua.log, tagged with the pack.
