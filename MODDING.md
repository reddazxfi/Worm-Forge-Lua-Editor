# Making a WormForge mod

This guide is for someone who can write Lua but has never used WormForge.
It describes the format the loader actually reads, not an idealized version of
it.

If you have used Project X, the difference is one extra layer:

- **Project X:** the scheme selected a script, and the script ran.
- **WormForge:** a **profile** selects components from installed bundles, and
  each selected component's `install(ctx)` runs.

That is the whole extra concept. Everything else is ordinary Lua.

---

## The 30-second version

A mod is a folder:

```text
WormForge/Mods/hello/
  mod.toml
  code/hello.lua
  profiles/Hello.toml
```

The three files answer three different questions:

| File | Question it answers |
|---|---|
| `mod.toml` | What does this bundle contain? |
| `profiles/Hello.toml` | What is switched on, and with what values? |
| `code/hello.lua` | What happens when it is switched on? |

Nothing runs just because the folder exists. Nothing runs just because
`mod.toml` exists. **A profile has to select the component first.**

That is why a freshly created mod can look like it "does nothing": the
generated `install` function only writes a log line until you replace it.

---

## The four pieces

```text
bundle          = the folder with mod.toml
component       = one thing the bundle offers (a weapon, a feature, a rule)
profile         = the selection: which components are on, where, with what options
install(ctx)    = the setup function for one selected component
```

A bundle can contain many components. A profile can mix components from several
bundles. A component that is not selected never runs at all.

---

## Units: pixels, not 16.16

API 4 positions and speeds are **plain pixels**, with fractions allowed. Do not
define `local PX = 0x10000` and do not scale coordinates by hand. The engine
converts pixels to WA's internal fixed-point units once, internally.

If an older pack or bundled example still multiplies or divides by `0x10000`,
that is pre-API-4 code. Do not copy it into a new mod.

---

## Step 1: Make the folder

Put your own bundle directly under the game's `WormForge/Mods/` folder:

```text
WormForge/Mods/hello/
  mod.toml
  code/hello.lua
  profiles/Hello.toml
```

Do **not** edit `wf-lib/`. That folder is owned by the catalogue and can be
replaced by an update. Create a folder next to it.

The folder name does not have to match the bundle `id`, but keeping them the
same avoids confusion.

---

## Step 2: Declare the component in `mod.toml`

Here is a real weapon manifest, from the `holdable_uzi` example:

```toml
id = "holdable_uzi"
name = "Holdable Uzi"
version = "0.1.0"
author = "reddaz"
api_version = 4
format_version = 2

[[components]]
id = "holdable_uzi.weapon"
type = "weapon"
name = "Holdable Uzi"
description = "Holdable Uzi weapon entry point."
entry = "code/mod.lua"
default_position = { row = "F1", column = 1 }

[[components.options]]
key = "bullet_count"
type = "int"
default = 15
min = 1
max = 25
label = "Shots"
description = "Bullet count"
```

What each part means:

- `id` is the **bundle id**. It identifies the pack.
- `format_version = 2` means "component bundle". Use it.
- `api_version = 4` is the Lua API version this pack targets.
- `[[components]]` starts one component.
- `id` inside `[[components]]` is the **component id**. It must be globally
  unique; prefix it with the bundle id.
- `type` is `"weapon"` or `"feature"`.
- `entry` is the Lua file, relative to the bundle folder. No leading slash.
- `default_position` is for weapons only. A profile can override it.
- `[[components.options]]` declares a setting. It belongs to the most recent
  `[[components]]` block.

A feature manifest is the same shape, without a position:

```toml
[[components]]
id = "hello.main"
type = "feature"
name = "Hello"
entry = "code/hello.lua"
```

Useful optional component fields:

| Field | Use |
|---|---|
| `before_weapons = true` | Feature installs before weapons. Rules that deal or take weapons usually want this. |
| `requires = ["other.id"]` | This component must be selected with another component. |
| `conflicts = ["other.id"]` | This component cannot be selected with another component. |
| `icon = "bazooka"` | Weapon icon: a stock weapon name or a `.png` in the bundle. |

Bundle-level fields (outside `[[components]]`) include `dependencies = ["wf.sdk"]`
for another bundle whose exported modules/assets this pack uses, and
`replaces = ["old.bundle"]` when installing this pack should retire another one.

### Option types

`[[components.options]]` accepts three types:

```toml
# A checkbox
[[components.options]]
key = "enabled"
type = "bool"
default = true
label = "Enabled"

# A whole number
[[components.options]]
key = "shots"
type = "int"
default = 15
min = 1
max = 25
label = "Shots"

# One of a fixed list of strings
[[components.options]]
key = "mode"
type = "choice"
default = "normal"
choices = ["normal", "wild"]
label = "Mode"
```

If you do not need settings, omit the `[[components.options]]` blocks.

---

## Step 3: Select it in a profile

A profile is a plain TOML file. It is the on/off switch.

### Weapon profile

```toml
description = "Holdable Uzi"

features = []

[weapons]
"holdable_uzi.weapon" = { row = "F1", column = 1 }
"stock.grenade" = { row = "F2", column = 1 }
"stock.ninja_rope" = { row = "F8", column = 1 }

[options."holdable_uzi.weapon"]
bullet_count = 15
```

The `[weapons]` table both **selects** the weapon and **places** it. This is
important: a profile with `[weapons]` owns the whole weapon panel. Stock weapons
that are not listed are absent. If you want a normal kit beside your weapon,
list the stock weapons you want.

Stock weapons use the `stock.` prefix (`stock.grenade`, `stock.uzi`). A bare
`bazooka` is API 2 and is refused.

### Feature profile

```toml
description = "Hello"

features = ["hello.main"]
```

### Profile keys

| Key | Meaning |
|---|---|
| `features = ["id"]` | Turn on feature components. |
| `[weapons]` | Select and place weapon components. |
| `[options."component.id"]` | Values for that component's `[[components.options]]`. |
| `[weapon_settings."component.id"]` | Weapon data overrides such as `ammo`, `delay`, `crate`. |

The profile uses the **full component id**, not the bundle id. `hello.main`, not
`hello`.

Weapon data can be overridden separately from the component's options:

```toml
[weapon_settings."holdable_uzi.weapon"]
ammo = -1     # infinite at round start
delay = 1     # one turn before it can be used
```

Omit a field to inherit the weapon's `defaults`. `ammo`, `delay` and `crate` are
the common overrides; the loader's weapon panel exposes the same fields.

Bundled profiles live in `profiles/` and are copied into `WormForge/Profiles`
when the pack is installed. For local testing you can also put the profile
directly in `WormForge/Profiles/` and select it in the loader.

---

## Step 4: Write the Lua

The entry file is a Lua **module**. The engine loads it, reads the value it
returns, and later calls `install(ctx)` if the profile selected the component.
The file is not a script whose top-level code is supposed to do the work: the
top level is declaration, and `install` is runtime.

### The smallest complete feature

`code/hello.lua`:

```lua
return function(ctx)
  wa.log("Hello from " .. ctx.id)

  wa.on.hud(function()
    wa.hud.line("Hello, worms!", 14, 40)
  end)
end
```

This is a complete mod. The file returns a function. The engine calls it with
the component's context table. `wa` is available inside the function.

### A complete weapon

`code/moon_grenade.lua`:

```lua
return {
  defaults = {
    ammo = { round_start = 3 },
  },

  install = function(ctx)
    wa.weapons.replace{
      copy_from = "stock.grenade",
      name = "Moon Grenade",
      missile = { gravity_pct = 35 },

      on_explode = function(ev)
        if wa.random(4) == 1 then
          wa.land.cut{ x = ev.x, y = ev.y, shape = "circle", radius = 40 }
        end
      end,
    }
  end,
}
```

What is happening:

- `defaults` is **weapon data**, not behavior. The profile's
  `[weapon_settings]` is laid over it, field by field.
- `install(ctx)` runs when the round starts and this weapon is placed.
- `wa.weapons.replace` copies WA's Grenade and changes the parts you name.
- `on_explode` is the actual per-event behavior. It runs later, when a grenade
  explodes.

---

## Copy/paste first mod

If you want the shortest working example, use this feature.

`WormForge/Mods/hello/mod.toml`:

```toml
id = "hello"
name = "Hello"
version = "0.1.0"
author = "you"
api_version = 4
format_version = 2

[[components]]
id = "hello.main"
type = "feature"
name = "Hello"
entry = "code/hello.lua"
```

`WormForge/Mods/hello/profiles/Hello.toml`:

```toml
description = "Hello mod"

features = ["hello.main"]
```

`WormForge/Mods/hello/code/hello.lua`:

```lua
return function(ctx)
  wa.log("Hello from " .. ctx.id)

  wa.on.hud(function()
    wa.hud.line("Hello, worms!", 14, 40)
  end)
end
```

Then:

1. Put the folder under `WormForge/Mods/`.
2. Open the loader and find **Hello**.
3. Select the **Hello mod** profile.
4. Start a local match.
5. You should see the HUD line and a `[components] Hello from hello.main`
   log line.

If you see nothing, the profile is not selected or the component is not ticked.
That is the most common "my mod does nothing" cause.

---

## What `return M` means

You will see this pattern in real packs, for example
`px_fire_seq/weapons/megashark.lua`:

```lua
local M = {}

function M.install(ctx)
  -- ...
end

return M
```

That is exactly the same contract as:

```lua
return {
  install = function(ctx)
    -- ...
  end,
}
```

`M` is just a local table. `return M` returns the module's export table. It is
not a special command, not a macro, and not "return the mod". The engine reads
the `install` key from whatever table you returned.

The same pattern appears in library files such as
`effects_sdk/libs/custom_explosion.lua`. Those are ordinary Lua modules:
`require("libs/custom_explosion")` returns the table. The **entry file** is the
one named by `entry` in `mod.toml`; that is the one the component loader calls.

A feature can return either form:

```lua
-- A feature as a function
return function(ctx)
  -- ...
end
```

```lua
-- The same feature as a table
return {
  install = function(ctx)
    -- ...
  end,
}
```

`function(CTX)` is just an anonymous function. `CTX` is a parameter name, not a
global. Write `function(ctx)` for clarity; the engine passes one table argument.

---

## What `ctx` is

`ctx` is a table the engine builds for this component and passes to `install`.
It is not a file, not a global, and not a place to put your mod code. You read
from it.

| Field | Type | Meaning |
|---|---|---|
| `ctx.id` | string | This component's id, e.g. `holdable_uzi.weapon`. |
| `ctx.bundle` | string | The bundle id, e.g. `holdable_uzi`. |
| `ctx.type` | string | `"weapon"` or `"feature"`. |
| `ctx.selected(id)` | function | Is a component selected in this profile? |
| `ctx.weapons` | table | Every placed weapon: id -> `{ position, data }`. |
| `ctx.placed` | array | Placed weapons in slot order. Each has `id`, `position`, `data`. |
| `ctx.position` | table | Weapon only: `{ row = "F1", column = 1 }`. |
| `ctx.data` | table | Weapon only: merged weapon data (defaults + profile overrides). |
| `ctx.option(key)` | function | Read one component option. Errors if the key is not declared. |
| `ctx.options` | table | All component options for this component. |
| `ctx.weapon_options` | table | Feature only: per-weapon options, by weapon id. |

For a feature, each entry in `ctx.placed` also has an `options` table. That is
how a rule reads its own settings for each placed weapon.

`ctx.placed` is in slot order, so it is the safe list to walk with `ipairs` when
order matters. `ctx.weapons` is a map keyed by id; do not iterate it with
`pairs()` for gameplay state, because the order is not stable between peers.

`ctx` is per install. Do not use it as a global store. If you need state that
callbacks share, create a local table inside `install` and let the callbacks
close over it:

```lua
install = function(ctx)
  local hits = 0

  wa.on.hud(function()
    wa.hud.line("hits: " .. hits, 14, 40)
  end)

  -- ...
end
```

---

## `defaults`, `options`, and `ctx.data`

These are three different things, and mixing them up is the second most common
source of confusion.

| Thing | Where it lives | What it is |
|---|---|---|
| `defaults` | returned table | Weapon data fields: ammo, delay, crate, missile data, etc. |
| `[[components.options]]` | `mod.toml` | Settings the player can tune in the loader. |
| `ctx.data` | passed to `install` | The weapon's merged data: defaults plus profile `[weapon_settings]`. |
| `ctx.option("key")` | passed to `install` | One declared component option. |

Rules of thumb:

- Put **weapon numbers** in `defaults` if they are part of the weapon record.
- Put **player-facing knobs** in `[[components.options]]`.
- Read knobs with `ctx.option("key")`.
- Read the merged weapon data with `ctx.data`.
- Do not put behavior in `defaults`. It is data, and the engine validates it
  against the weapon data fields.

An `int` option can be marked `data = true` to also overlay a same-named weapon
data field. That is an advanced convenience; most mods do not need it.

`defaults` can also be a function of the weapon id when one entry file serves
many weapons:

```lua
defaults = function(id)
  local path = require("weapons/index")[id]
  return path and require(path).defaults
end
```

`wf-lib/px/components/weapon.lua` uses this shape to share one component entry
across PX's weapons.

---

## Where custom behavior goes

Use this split:

```lua
-- TOP OF FILE: pure Lua only.
-- Locals, helper functions, require() of modules that do not touch wa.
local helper = require("lib/helper")

local M = {}

-- INSTALL: setup. This is where wa exists and where you register behavior.
function M.install(ctx)
  local shots = ctx.option("shots")

  wa.weapons.replace{
    copy_from = "stock.uzi",
    name = "My Uzi",
    -- ...
    on_fire = function(ev)
      -- Per-event behavior. wa and `shots` are available here.
    end,
  }
end

return M
```

- **Top level:** declarations only. `wa` is deliberately unavailable while the
  component file is being read. A top-level `wa.log(...)` will fail.
- **`install(ctx)`:** setup. Read options, register hooks, build state, replace
  a weapon, add HUD callbacks.
- **Callbacks:** actual per-frame, per-click, per-explosion behavior. They can
  use `wa` and any locals captured from `install`.

This is also why some packs load a helper **inside** `install`:

```lua
install = function()
  -- This module reads wa when it loads, so it must wait until install.
  local zap = require("lib/electric_damage")
  -- ...
end
```

The engine's declaration phase is meant to be side-effect free. It has to know
the whole selection is valid before anything runs.

---

## Weapon or feature?

| | Weapon | Feature |
|---|---|---|
| Selected by | `[weapons]` in the profile | `features = [...]` in the profile |
| Appears on | The weapon panel | The feature list / rules |
| Has `defaults` | Usually | No |
| Gets `ctx.data` | Yes | No |
| Gets `ctx.position` | Yes | No |
| Typical use | A new weapon, a replacement, a projectile | Rules, HUD, tools, scheme changes |
| Install order | By panel slot | Before weapons if `before_weapons = true`, otherwise after |

A bundle can contain both. A profile can mix components from several bundles.

---

## What Create Mod writes

The **Create Mod** dialog writes exactly the shape above:

- `mod.toml` with one `[[components]]` and its `[[components.options]]`
- `code/mod.lua` with a starter `install`
- `profiles/<Name>.toml` that selects the component and stores the chosen values

For a weapon it writes a table with `defaults` and `install`. For a feature it
returns the install function directly.

The generated `TODO` log is not the mod. It is a placeholder. Replace it with
your behavior:

```lua
-- Generated
install = function(ctx)
  local opt_bullet_count = ctx.option("bullet_count")
  wa.log("holdable_uzi.weapon installed")
end
```

```lua
-- Actual behavior
install = function(ctx)
  local shots = ctx.option("bullet_count")

  wa.weapons.replace{
    copy_from = "stock.uzi",
    name = "Holdable Uzi",
    -- ...
    on_fire = function(ev)
      -- use `shots` here
    end,
  }
end
```

The dialog's parameters become the `[[components.options]]` in `mod.toml` and
the `[options."id"]` values in the profile. `ctx.option("key")` reads the
resolved value.

---

## Testing

1. Put the bundle under `WormForge/Mods/<name>/`.
2. Open the loader and find the bundle.
3. Install/refresh it if the loader offers that.
4. Select the profile in **Profiles**.
5. Check that the feature is ticked or the weapon is placed.
6. Start a local match.
7. Watch `wa.log` output.

The editor's **SYNTAX CHECK** only checks Lua. It does not validate `mod.toml`,
component ids, option declarations, or weapon defaults. A clean syntax check is
necessary, not sufficient.

For multiplayer, every peer needs the same bundle and profile. Use `wa.random`,
not `math.random`, and do not iterate gameplay state with `pairs()`; use stable
ids or `ipairs` where order matters.

---

## Common errors

| Symptom | Likely cause | Fix |
|---|---|---|
| `attempt to index a nil value (global 'wa')` at the top of the file | You used `wa` during declaration. | Move the code into `install(ctx)` or a callback. |
| The mod does nothing | No profile selects it, the bundle is not installed, or the feature is not ticked / weapon not placed. | Check the bundle, profile and loader's selection. |
| `component ... not found` | Component id typo, or the profile uses the bundle id. | Use the full component id, e.g. `hello.main`. |
| `has no option ...` | `ctx.option("key")` is not declared in `[[components.options]]`. | Add the option or fix the key spelling. |
| `unknown field ...` in `defaults` | You put behavior or an invented key in weapon data. | Keep `defaults` to weapon data fields; move behavior to `install`. |
| `module ... not found` | Wrong path, `.lua` extension included, or `..` used. | Use a pack-relative path without `.lua`, e.g. `require("lib/helper")`. |
| Works in the editor, fails in the loader | The editor only checked Lua syntax. | Validate the manifest, defaults and options against the loader's error. |
| Works alone, desyncs in multiplayer | `math.random`, unordered `pairs()`, or peer-specific state. | Use `wa.random`, stable order, and the same profile on every peer. |
| `ctx.option` returns the wrong value | Another profile is selected, or the key/id is wrong. | Check the active profile and the `[options."id"]` table. |

---

## Cheat sheet

```text
Bundle identity .............. mod.toml
What exists .................. [[components]]
Player-facing knobs .......... [[components.options]]
What is selected ............. profiles/*.toml
Weapon placement ............. [weapons]
Feature selection ............ features = [...]
Option values ................ [options."component.id"]
Weapon data overrides ........ [weapon_settings."component.id"]
Behavior ..................... entry .lua -> install(ctx)

Read an option ............... ctx.option("key")
Read all options ............. ctx.options
Read weapon data ............. ctx.data
Read weapon position ......... ctx.position.row / ctx.position.column
Check a component ............ ctx.selected("other.id")
List placed weapons .......... ctx.placed (slot order) / ctx.weapons (by id)
Log .......................... wa.log(...)
```

If you remember one thing:

> **The Lua file returns a declaration. `install(ctx)` is where the mod runs.**

---

## Examples worth reading

In your WormForge mods folder:

- `wf-lib/component_demo/` — the smallest weapon + feature + profile bundle.
- `holdable_uzi/` — the generated starter shape, with one weapon option.
- `px_electric/weapons/electric_mine.lua` — a helper loaded inside `install`
  because it reads `wa` at load time.
- `px_fire_seq/weapons/megashark.lua` — the `local M` / `M.install` pattern and
  callback-heavy behavior.
- `red_saw/weapons/saw_grenade.lua` — a compact table-literal weapon with
  `defaults`, `install`, and `ctx.option`.

In this repository:

- `examples/` contains the focused entry points (Agility, Sentry, Keeper Bee,
  Highlander, Swimsuit, POOZ, Kill the King, Ripper Star).
- `examples/px/` — the modern `px.ports` component bundle: Swim Suit, Sentry
  Gun, Highlander, Kill the King, and the shared weapon index/loader. The
  menu's `px.swim`, `px.sentry`, `px.highlander`, and `px.ktk` entries all load
  this source and open the relevant file.
- `examples/utilities/` — the modern `core.utilities` bundle. Agility is
  `features/agility.lua`, loaded by `features/utilities.lua` when the profile
  turns that option on.
- `examples/pooz/` — the modern POOZ component bundle.
- `examples/roaming_bees/` — the modern Keeper Bee launcher and map swarm.
- `examples/ripper_star/` — a focused `px_fire_seq` excerpt showing a missile
  and the `require("lib/fire_seq")` / `require("wf-lib/effects/trail")` pattern.

Read one small pack end to end, then change one line and reload. That is faster
than reading every API page first.
