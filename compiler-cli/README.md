# wfcheck — check WormForge mods without the game
# SUPPORTS 0.9.11 API 4.0 - LATER VERSIONS WILL WARN A LOT
Catch the mistakes that break a mod pack **before** you load it: syntax errors,
typos in engine calls, names that read as `nil`, and — the important ones — the
desync traps that make one player's game disagree with everyone else's.

It runs the **real Lua 5.4 compiler** (the same one the game uses) plus the
WormForge checker. It is a single executable. You do not need the editor app,
and you do not need to run a match.

```
C:\Games\Worms\Mods> check-mods.bat

mods\mymod\rules.lua:12:5: warning[wa-namespace-typo] wa.repalce is not an engine API.
    = `wa.repalce` does not exist in WormForge 0.9.11.

mods\mymod\rules.lua:44:1: error[lockstep-rng] math.random() is not lockstep-safe. It is
    seeded per-client, so each peer draws a different number and the match
    desyncs. Use wa.random(min, max) to draw from the shared lockstep RNG, or a
    counter seeded deterministically from the turn number.

checked 3 file(s): 1 error(s), 1 warning(s), 0 note(s) (WormForge 0.9.11)
```

---

## If someone sent you this

You need two files in the same folder:

| | |
|---|---|
| `wfcheck.exe` | the program (Windows) |
| `check-mods.bat` | the thing you double-click |

Double-click `check-mods.bat` and it checks that folder. The window stays open
so you can read the result; press any key to close it.

To check somewhere else, drag a folder onto `check-mods.bat`, or from a command
prompt:

```
check-mods.bat  C:\Games\Worms\Mods\mymod
```

**macOS or Linux?** Use `check-mods.sh` and the `wfcheck` binary instead:

```
chmod +x check-mods.sh      (only the first time)
./check-mods.sh
```

Nothing in your mods is ever executed. The checker **compiles** each file to
confirm it is valid Lua and then reads it; it does not run it. You can point it
at a folder from a stranger with no risk.

## What the colours mean

| | |
|---|---|
| **error** | Breaks the match, or will desync. Fix it. |
| **warning** | Almost certainly a mistake, but it may be intentional. |
| **note** | Advisory. The code runs; it is just not deterministic across players. |

Only **errors** fail the run. Notes never do, even with `--strict` — a pack full
of `pairs()` advice is still a pack worth playing.

## The desync ones worth knowing

| Rule | Why it matters |
|---|---|
| `lockstep-rng` | `math.random()` is seeded per client, and `math.cos()`/`math.sin()`/`math.atan()` can differ per machine. Either way the match falls apart. Use `wa.random(min, max)` and the deterministic `wa.math.cos`/`wa.math.sin`/`wa.math.atan`. |
| `lockstep-pairs` | `pairs()` hands keys back in no particular order, and that order can differ per peer. Iterate a sorted list, or use `ipairs()` on an array. |

These are the two that cost you a match rather than a feature.

## Exit codes

Useful if you want to run this from a script or a CI job:

| Code | Meaning |
|---|---|
| `0` | Nothing worth blocking |
| `1` | It found something |
| `2` | Bad arguments, or a path that does not exist |
| `3` | The tool itself broke |

```bat
check-mods.bat /nopause --quiet --strict C:\...\Mods || echo "mods have problems"
```

## Every option

Run `wfcheck --help`. The ones you are most likely to want:

| | |
|---|---|
| `wfcheck <folder>` | check a folder (and everything under it) |
| `wfcheck rules.lua` | check one file |
| `--only <rule>` | show just that rule, e.g. `--only lockstep-rng` |
| `--explain <rule>` | what that rule means |
| `--list-rules` | every rule it knows |
| `--strict` | warnings fail the run too |
| `--format json` | machine-readable output |
| `--exclude <glob>` | skip some folders |

## Known limits

- The engine API tables are pinned to **WormForge 0.9.11**. A newer engine may
  have calls this build does not know about; it will not invent them. The 0.9.11
  fog-of-war verbs (`wa.fog.*`, `a.light`, `light:*`, `worm:jump`) come from that
  release's verb list: the vendored engine source snapshot is still 0.9.1 and has
  no fog in it, so they could not be re-checked against the implementation.
- A **world object** (`mine:`, `drum:`, `crate:`, …) is really several classes
  told apart only at run time. Until you narrow it with a `.kind` test, this
  checker cannot prove a method exists and says so rather than guessing.
- It reads `.lua` files as UTF-8. A file in another encoding is reported as
  unreadable rather than silently mangled.