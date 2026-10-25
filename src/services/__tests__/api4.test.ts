import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseAndValidate } from '../parser';
import {
  BUILTIN_CLASSES,
  BUILTIN_ENUMERATIONS,
  BUILTIN_FUNCTIONS,
  BUILTIN_VARIABLES,
} from '../../data/wormforgeDefinitions';
import { WEAPON_SPEC_KEYS } from '../../data/specKeys';

/** All rule ids a fixture raised, in order. */
const rulesOf = (src: string): string[] =>
  parseAndValidate(src).diagnostics.map((d) => d.rule ?? '');

const typoFor = (src: string) =>
  parseAndValidate(src).diagnostics.find((d) => d.rule === 'wa-namespace-typo');

describe('Lua API 4 surface (WormForge 0.9.1/0.9.4)', () => {
  // Exact snippets the Rust checker pins (checks.rs: api4_* tests). Both engines
  // must agree or __sweep.ts reports drift on every API 4 file.
  const silent = [
    'local function f() local layout = wa.panel.layout() end',
    'wa.panel.set_layout({ ["px.ninja_star"] = { row = "F1", column = 1 } })',
    'local data = wa.weapons.data("stock.bazooka")',
    'wa.world.set_turn_clock(1000)',
    'wa.assets.load({ sprites = { "sprites/star.png" }, gpu_prefix = "sprites/" })',
    'local function f(worm) wa.weapons.fire_bullet({ weapon = "stock.shotgun", owner = worm, x = 1, y = 2, dx = 1, dy = 0, damage = 25 }) end',
    'wa.weapons.panel_icon("px.javelin", 1)',
    'wa.weapons.set_selectable({ weapon = "px.javelin", team = 2, selectable = false })',
    'local function f(worm) return wa.mines.spawn({ owner = worm, x = 1, y = 2 }) end',
    'local function f(worm) return wa.arrows.spawn({ owner = worm, x = 1, y = 2 }) end',
    'local drum = wa.oil.spawn({ x = 1, y = 2 })',
    'wa.world.set_retreat(1000)',
    'local function f(a) local field = wa.magnetism.field({ source = a }) field:remove() end',
    'local function f(a) local fx, fy, inside, waking = wa.magnetism.sample(1, 2, a) end',
    'wa.on.oil_explode(function(ev) ev:replace() end)',
  ];
  it.each(silent)('%s is real API and produces no finding', (src) => {
    expect(rulesOf(src)).toEqual([]);
  });

  it('keeps wa.audit as a typo (diagnostics builds only)', () => {
    expect(typoFor('wa.audit.begin(7)')).toBeTruthy();
  });

  it('reports the removed wa.land.dig', () => {
    const d = typoFor('wa.land.dig({ x = 1, y = 2, radius = 4 })');
    expect(d, 'wa.land.dig is nil in 0.9.1 and must be flagged').toBeTruthy();
    expect(d!.message).toContain('wa.land.dig');
  });

  it('still documents every callable wa.* verb from the release list', () => {
    // The drift guard: spec/verbs 9.11 api 4.0.txt is the release page for 0.9.4.
    // A wa.* key it lists that no TS table knows would be flagged by
    // wa-namespace-typo = a FALSE POSITIVE on valid code. Reading the file from
    // disk keeps the definitions honest against the source the user shipped.
    //
    // RESOLVED FROM __dirname, not from the process cwd. It was `join('Lua', ...)`,
    // which only resolves when the cwd happens to be the folder holding `Lua/` --
    // and the file had already moved to `spec/`. So this test threw ENOENT: the
    // guard that exists to stop the definitions drifting had itself been dead, and
    // a dead drift guard is worse than none because it looks green in review.
    const VERBS = resolve(__dirname, '../../..', 'spec', 'verbs 9.11 api 4.0.txt');
    const raw = readFileSync(VERBS, 'utf8');
    const doc = JSON.parse(raw.slice(raw.indexOf('{')));
    const known = new Set<string>([
      ...BUILTIN_FUNCTIONS.map((f) => f.name),
      ...BUILTIN_VARIABLES.map((v) => v.name),
      ...BUILTIN_ENUMERATIONS.flatMap((e) => e.values.map((v) => `${e.name}.${v.name}`)),
    ]);

    const missing: string[] = [];
    for (const section of doc.sections) {
      for (const verb of section.verbs) {
        for (const key of [verb.key, ...(verb.aliases ?? [])]) {
          if (!key.startsWith('wa.')) continue; // worm:/a:/object:/data.* live elsewhere
          if (!known.has(key)) missing.push(`${key} (${section.id})`);
        }
      }
    }
    expect(missing, 'wa.* verbs in the release list missing from src/data').toEqual([]);
  });
});

describe('Lua API 4 additions in 0.9.11 (fog of war)', () => {
  // Source: `spec/verbs 9.11 api 4.0.txt` (updated 2026-10-19). The vendored
  // WormForge-main snapshot is 0.9.1, so these are pinned to the release verb
  // list rather than to Rust source -- the same standing as
  // wa.weapons.set_selectable. A gap here is a false wa-namespace-typo on valid
  // 0.9.11 code, which is the failure this list exists to prevent.
  const silent = [
    'wa.fog.set({ circle_radius = 120, fog_floor = 40 })',
    'wa.fog.enable(true)',
    'local on = wa.fog.enabled()',
    'local r = wa.fog.get("circle_radius")',
    'local d = wa.fog.defaults()',
    'local b = wa.fog.visible(100, 200)',
    'local light = wa.fog.light({ x = 100, y = 200 })',
    'local light = wa.fog.light({ x = 100, y = 200 })\nlight:move(120, 210)\nlight:set({ mode = "dark" })\nlight:remove()',
    'local function f(worm) worm:jump("backflip") end',
    'local function f(a) a.light = "projectile" end',
    'local function f(a) a.light = { kind = "dark", circle = { radius = 120 } } end',
  ];

  it.each(silent)('%s is real 0.9.4 API and produces no finding', (src) => {
    expect(rulesOf(src)).toEqual([]);
  });

  it('a misspelled fog verb is still a typo', () => {
    expect(typoFor('wa.fog.visble(1, 2)')!.message).toContain('wa.fog.visble');
  });
});

describe('render-context math (mirror of checks.rs RenderScan)', () => {
  it('math.sin inside wa.on.draw(function literal) is silent', () => {
    const src = 'wa.on.draw(function()\n  local x = math.sin(1)\nend)';
    expect(rulesOf(src)).toEqual([]);
  });

  it('math.atan inside wa.on.draw is silent', () => {
    const src = 'wa.on.draw(function()\n  local a = math.atan(1, 2)\nend)';
    expect(rulesOf(src)).toEqual([]);
  });

  it('math.cos outside render context is an error', () => {
    expect(rulesOf('local x = math.cos(1)')).toEqual(['lockstep-rng']);
  });

  it('a named callback body is NOT render context (conservative)', () => {
    const src = 'local function handler()\n  local x = math.sin(1)\nend\nwa.on.draw(handler)';
    expect(rulesOf(src)).toEqual(['lockstep-rng']);
  });

  it('math.random is never muted, even inside wa.on.draw', () => {
    const src = 'wa.on.draw(function()\n  local x = math.random(1)\nend)';
    expect(rulesOf(src)).toEqual(['lockstep-rng']);
  });

  it('regions do not leak outward: trig before the draw registration still errors', () => {
    const src = 'local x = math.sin(1)\nwa.on.draw(function() end)';
    expect(rulesOf(src)).toEqual(['lockstep-rng']);
  });

  it('nested blocks inside the draw body end at the right `end`', () => {
    const src =
      'local cond = true\nwa.on.draw(function()\n  if cond then\n    for i = 1, 10 do\n      local x = math.cos(i)\n    end\n  end\nend)\nlocal y = math.cos(1)';
    // One inside (silent), one outside (error).
    expect(rulesOf(src)).toEqual(['lockstep-rng']);
  });

  it('math.sin/cos/atan read as a value, not called, is silent', () => {
    const src = 'local s = math.sin; local c = math.cos; local a = math.atan';
    expect(rulesOf(src)).toEqual([]);
  });

  it('math.random/math.randomseed read as a value are silent; only calls desync', () => {
    const src = 'local r = math.random; local seed = math.randomseed';
    expect(rulesOf(src)).toEqual([]);
  });

  // ---- the rules the ENGINE states, not ones we invented -------------------
  //
  // Every case below is anchored to a line in the engine's own source or its own
  // checker (`tools/check_sim_math.py`, which reports `passed` over all of
  // `WormForge-main-source/mods`). Any finding we raise on the engine's own packs
  // is ours, not the pack's. These mirror the same-named tests in checks.rs.

  it('wa.on.hud is render context too, not just wa.on.draw', () => {
    // spawn.rs:642: "wa.random: not inside wa.on.draw or wa.on.hud. They run at
    // render time." docs/lua-pixel-units.md:49: "Draw/HUD callbacks may use CRT
    // maths because their results stay local."
    const src = 'wa.on.hud(function()\n  local x = math.cos(1)\nend)';
    expect(rulesOf(src)).toEqual([]);
  });

  it('a local helper of a draw callback is render context', () => {
    // The false positive that started all of it: px/lib/turret.lua:573 declares
    // `local function sheet(...)` which rotates quad corners with math.cos and
    // math.sin at line 576, and calls it from the draw callback.
    const src =
      'local function sheet(angle)\n  return math.cos(angle), math.sin(angle)\nend\nwa.on.draw(function()\n  sheet(1)\nend)';
    expect(rulesOf(src)).toEqual([]);
  });

  it('render context closes transitively through helpers', () => {
    const src =
      'local function inner(a)\n  return math.atan(a, 1)\nend\nlocal function outer(a)\n  return inner(a)\nend\nwa.on.draw(function()\n  outer(1)\nend)';
    expect(rulesOf(src)).toEqual([]);
  });

  it('render context closes through a loop and an if', () => {
    const src =
      'local function helper(a)\n  return math.cos(a)\nend\nwa.on.draw(function()\n  for i = 1, 3 do\n    if i > 1 then helper(i) end\n  end\nend)';
    expect(rulesOf(src)).toEqual([]);
  });

  // The negative half matters more than the positives: following helpers must not
  // swallow helpers outside render reach, or the closure is a hole, not a rule.
  it('a helper only called from simulation is still an error', () => {
    const src =
      'local function helper(a)\n  return math.cos(a)\nend\nwa.on.contact(function()\n  helper(1)\nend)';
    expect(rulesOf(src)).toEqual(['lockstep-rng']);
  });

  it('a helper called from BOTH draw and simulation is render context', () => {
    // The engine's behaviour too (`reachable(render_roots)` is computed before
    // simulation). Matching the rule we implement beats being stricter in one
    // direction only, which would make the two checkers disagree on the same file.
    const src =
      'local function helper(a)\n  return math.cos(a)\nend\nwa.on.contact(function()\n  helper(1)\nend)\nwa.on.draw(function()\n  helper(1)\nend)';
    expect(rulesOf(src)).toEqual([]);
  });

  it('a function nested inside the draw body is render context', () => {
    const src =
      'wa.on.draw(function()\n  local function helper(a)\n    return math.sin(a)\n  end\n  helper(1)\nend)';
    expect(rulesOf(src)).toEqual([]);
  });

  it('math.random is never muted, even in the deepest render helper', () => {
    const src =
      'local function helper()\n  return math.random(1, 6)\nend\nwa.on.draw(function()\n  helper()\nend)';
    expect(rulesOf(src)).toEqual(['lockstep-rng']);
  });
});

describe('method definitions are not invocations (mirrors checks.rs call-only check)', () => {
  it('function m:remove() defines a method, it does not call one', () => {
    expect(rulesOf('local function m:remove() self.removed = true end')).toEqual([]);
  });

  it('function missile:impulse(...) is silent too', () => {
    const src =
      'function missile:impulse(dx, dy) self.dx, self.dy = dx, dy; return true end';
    expect(rulesOf(src)).toEqual([]);
  });

  it('m:remove() as a call still reports missile-api', () => {
    // `m` is bound as a local so only the unknown-method check fires.
    const src = 'local m = {}\nm:remove()';
    expect(rulesOf(src)).toEqual(['missile-api']);
  });
});

describe('class member updates (0.9.1)', () => {
  const cls = (name: string) => BUILTIN_CLASSES.find((c) => c.name === name)!;

  it('LuaActor lost a:dig and gained a:cut / a:collision_ignore', () => {
    const names = cls('LuaActor').members.map((m) => m.name);
    expect(names).not.toContain('dig');
    expect(names).toContain('cut');
    expect(names).toContain('collision_ignore');
  });

  it('WormEntity gained teleport_pose and kept warp/air_fire', () => {
    const names = cls('WormEntity').members.map((m) => m.name);
    expect(names).toContain('teleport_pose');
    expect(names).toContain('warp');
    expect(names).toContain('air_fire');
  });

  it('WorldHandle kept warp/fits/remove (the verb list has them)', () => {
    const names = cls('WorldHandle').members.map((m) => m.name);
    expect(names).toContain('warp');
    expect(names).toContain('fits');
    expect(names).toContain('remove');
  });

  it('no member or function doc still claims 16.16 units (API 4 speaks px)', () => {
    const offenders: string[] = [];
    for (const f of BUILTIN_FUNCTIONS) {
      const text = [f.description, f.example ?? '', ...(f.parameters ?? []).map((p) => p.description)].join(' ');
      if (text.includes('16.16')) offenders.push(f.name);
    }
    for (const c of BUILTIN_CLASSES) {
      for (const m of c.members) {
        const text = [m.description, m.example ?? '', ...(m.parameters ?? []).map((p) => p.description)].join(' ');
        if (text.includes('16.16')) offenders.push(`${c.name}.${m.name}`);
      }
    }
    expect(offenders, 'entries still describing 16.16 units').toEqual([]);
  });
});

describe('nil-guarded reads are info, not warnings (mirrors scopes.rs)', () => {
  const finding = (src: string) =>
    parseAndValidate(src).diagnostics.find((d) => d.rule === 'undefined-global');

  it('X or default is info', () => {
    // `mods/px/rules.lua:15` and siblings. HIGHLANDER_ROOT is injected only by the
    // engine's own `cargo test` harnesses (lib.rs:3650/:3658/:3793, all inside
    // `#[test]`) and nothing injects it at runtime.
    const d = finding('local root = HIGHLANDER_ROOT or "mods/px/"');
    expect(d!.severity).toBe('info');
    expect(d!.message).toContain('fallback handles it');
    expect(d!.message, 'this half was never true for a guarded read').not.toContain(
      'stops every mod loading'
    );
  });

  it('an unguarded read is still a warning', () => {
    // The change must not have cost the rule anything.
    expect(finding('print(HIGHLANDER_ROOT)')!.severity).toBe('warning');
  });

  it('`X and Y or Z` is guarded, because `and` binds tighter than `or`', () => {
    // Parses as `(X and Y) or Z`, so a nil X is absorbed. scopes.rs matches on
    // BinaryOperator/BinOp::Or and gets this by position; a next-token-only test
    // would call it a warning and drift from Rust on the same file.
    expect(finding('local v = MISSING and 1 or 2')!.severity).toBe('info');
  });

  it('`and` with no `or` is not a guard', () => {
    expect(finding('local v = MISSING and 1')!.severity).toBe('warning');
  });

  it('only the left operand of `or` is guarded', () => {
    expect(finding('local v = 1 or MISSING')!.severity).toBe('warning');
  });

  it('a `.` before the `or` means it is a different expression', () => {
    // Without this stop, `t.missing or 1` would mark `t` guarded, which has nothing
    // to do with `missing` being a field read.
    expect(finding('local v = t.missing or 1')!.severity).toBe('warning');
  });

  it('an `or` in a LATER statement does not reach back', () => {
    expect(finding('print(MISSING)\nlocal v = 1 or 2')!.severity).toBe('warning');
  });
});

describe('wa.audit is named, not called a typo (mirrors checks.rs)', () => {
  it('says which feature it needs instead of "not an engine API"', () => {
    const d = typoFor('wa.audit.begin(7)')!;
    expect(d.severity).toBe('warning');
    expect(d.message).toContain('diagnostics');
    expect(d.message, 'the API is real; calling it a typo is wrong').not.toContain(
      'is not an engine API'
    );
  });

  it('still names debug_input, the second gate', () => {
    expect(typoFor('wa.audit.finish(7)')!.detail).toContain('debug_input');
  });

  it('a real typo is unaffected', () => {
    // parser.ts words this differently from checks.rs on purpose -- it says
    // `Unknown wa.* function` where Rust says `is not an engine API`. The sweep
    // compares rule ids, not wording, and both wordings are here to stay.
    const d = typoFor('wa.weapons.repalce({})')!;
    expect(d.message).toContain('Unknown wa.* function');
    expect(d.message).toContain('Did you mean');
  });
});

describe('spec keys (API 4)', () => {
  it('has exactly the 49 keys the checker test pins', () => {
    // checks.rs: spec_key_data_survived_the_move_into_the_generator asserts 49.
    // If this fails, the two lists drifted -- fix src/data/specKeys.ts and keep
    // both numbers in step.
    expect(WEAPON_SPEC_KEYS.length).toBe(49);
  });

  it.each(['fires', 'handling', 'missile', 'clusters', 'gun', 'strike', 'jet_pack', 'raw', 'panel_icons', 'hold'])(
    'accepts the API 4 claim key %s without a spec-key-typo',
    (key) => {
      const src = `wa.weapons.replace({ ${key} = {} })`;
      expect(rulesOf(src)).toEqual([]);
    }
  );
});

describe('receiver resolution: wa.X.all() beats the name', () => {
  // `wa.missiles.all()` yields WorldHandle userdata, NOT the MissileEntity table.
  // spawn.rs binds it via `bind_kind_list` -> `objects_table` -> `WorldHandle::new`,
  // and WorldHandle HAS `impulse` (actor.rs `add_methods`). MissileEntity is the
  // plain table `wa.on.missile_frame` hands a callback: properties, no methods.
  // A receiver NAMED `missile` says nothing about which one it is.
  //
  // px/weapons/electromagnet.lua:93 does exactly this and used to draw a false
  // `missile-api` in both engines. Mirrored by the same-named tests in checks.rs.

  const cases: [string, string][] = [
    ['wa.missiles.all() yields WorldHandle', 'for _, missile in ipairs(wa.missiles.all()) do missile:impulse(1, 2) end'],
    ['the bare iterator, unwrapped', 'for _, m in wa.missiles.all() do m:remove() end'],
    ['wa.arrows.all() yields WorldHandle', 'for _, a in ipairs(wa.arrows.all()) do a:impulse(1, 2) end'],
    ['wa.mines.all() yields WorldHandle', 'for _, m in ipairs(wa.mines.all()) do m:remove() end'],
  ];
  it.each(cases)('%s', (_label, src) => {
    expect(rulesOf(src)).toEqual([]);
  });

  // THE NEGATIVE HALF. The trace must not paper over a real typo, and it must not
  // change the rule id: a misspelled WorldHandle method is `world-object-api`,
  // not `missile-api`.
  it('a misspelled method in the loop is still world-object-api, not missile-api', () => {
    const src = 'for _, missile in ipairs(wa.missiles.all()) do missile:impulses(1, 2) end';
    expect(rulesOf(src)).toEqual(['world-object-api']);
  });

  it('a misspelled method on a missile_frame table is still missile-api', () => {
    // The other value entirely, and the trace must not reach it.
    const src =
      'wa.on.missile_frame(function(missile)\n  missile:impulses(1, 2)\nend)';
    expect(rulesOf(src)).toEqual(['missile-api']);
  });

  // THE LEAK THIS WAS MEASURED AGAINST. `mods/tools/audit/audit.lua` loops
  // `for _, w in ipairs(wa.worms.all())` and ALSO passes `w` as a callback
  // parameter holding the harness's own mock worm. A file-global name->class map
  // claims that mock, `w` stops resolving by name, and 46 false `worm-api`
  // warnings appear. The trace is scoped to the loop body, so it does not.
  it('does not leak the loop binding past the loop body', () => {
    const src = [
      'for _, w in ipairs(wa.worms.all()) do',
      '  w:hurt(10)',
      'end',
      'local function setup(w)',
      '  w:input({ aim = 45 })',
      'end',
    ].join('\n');
    // `w` is not a confident registry prefix (only `worm` is), so the parameter
    // is not judged at all -- exactly as before the trace existed.
    expect(rulesOf(src)).toEqual([]);
  });

  it('a nested loop over the same name answers for the inner one', () => {
    const src = [
      'for _, v in ipairs(wa.missiles.all()) do',
      '  for _, v in ipairs(wa.worms.all()) do',
      '    v:hurt(10)',
      '  end',
      'end',
    ].join('\n');
    // Innermost wins, so this is a worm, and `hurt` is a worm method.
    expect(rulesOf(src)).toEqual([]);
  });

  it('an iterator that is merely a variable is declined, not guessed', () => {
    const src = 'local t = wa.missiles.all()\nfor _, m in ipairs(t) do m:impulse(1, 2) end';
    // `m` still falls back to the name table, which says MissileEntity -- so this
    // warns. That is the honest answer: we cannot see where `t` came from.
    expect(rulesOf(src)).toEqual(['missile-api']);
  });
});
