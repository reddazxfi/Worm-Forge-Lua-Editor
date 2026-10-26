// The one canonical list of receiver -> handle-class mappings.
//
// Both the diagnostic checker (services/parser.ts) and the editor's
// autocomplete (components/CodeEditor.tsx) resolve receiver names through THIS
// file. Before it existed they each had their own hardcoded list, which is how
// two lists drift apart silently: one warns about a member the other happily
// suggests, or neither knows a verb the other knows.
//
// What actually exists in the engine (crates/lua-host/src/actor.rs):
//   WormHandle    -> editor class WormEntity
//   ActorHandle   -> editor class LuaActor
//   WorldHandle   -> editor class WorldHandle, discriminated at runtime by
//                    .kind = none|mine|missile|crate|worm|oil|grave|land|object
//                    (kind_name, actor.rs:1364) with methods arm/hit/revive
// There is no per-kind class: a mine, an oil drum, a crate and a grave are all
// the same WorldHandle. So mine/drum/oil/crate/grave resolve here for
// convenience and get the common object surface plus hit().
//
// Two entries are NOT handles:
//   MissileEntity   - the plain table wa.on.missile_frame passes
//                     (dispatch.rs:239, motion_to_table): msg, phase, weapon,
//                     sprite, collision_mask plus the motion fields.
//   InventoryStore  - wa.inventory is a plain Lua table (api.rs:342), not
//                     userdata. It has methods, but it is a namespace.

import { ClassDef, CustomVerb } from '../types/wormforge';
import { BUILTIN_CLASSES, BUILTIN_FUNCTIONS, BUILTIN_VARIABLES } from './wormforgeDefinitions';

export type HandleClassName =
  | 'WormEntity'
  | 'LuaActor'
  | 'WorldHandle'
  | 'MissileEntity'
  | 'InventoryStore'
  | 'LightHandle'
  | 'MagneticField'
  | 'WindowHandle';

/**
 * returnType strings in wormforgeDefinitions.ts use the ENGINE's vocabulary
 * ("WormHandle"), while BUILTIN_CLASSES uses the editor's ("WormEntity"). The
 * aliases live here so the call-site trace can compare them without either
 * side being rewritten -- the docs text reads correctly as it is.
 */
export const HANDLE_ALIASES: Record<string, HandleClassName> = {
  WormHandle: 'WormEntity',
  WormEntity: 'WormEntity',
  ActorHandle: 'LuaActor',
  LuaActor: 'LuaActor',
  WorldHandle: 'WorldHandle',
  MissileEntity: 'MissileEntity',
  MissileHandle: 'MissileEntity',
  InventoryStore: 'InventoryStore',
  LightHandle: 'LightHandle',
  MagneticField: 'MagneticField',
  FieldHandle: 'MagneticField',
  WindowHandle: 'WindowHandle',
};

/** Every class the union check may consult. */
export const ALL_HANDLE_CLASSES: HandleClassName[] = [
  'WormEntity',
  'LuaActor',
  'WorldHandle',
  'MissileEntity',
  'InventoryStore',
  'LightHandle',
  'MagneticField',
  'WindowHandle',
];

export interface ReceiverRow {
  /**
   * Every receiver name this row answers to. Used by the AUTOCOMPLETE, where a
   * loose guess is harmless -- offering an actor's members for a variable that
   * happens to be named `body` costs nothing if it is wrong.
   */
  prefixes: string[];
  /**
   * The subset the DIAGNOSTICS will warn on. Defaults to `prefixes`.
   *
   * A wrong guess on the checker is a false ERROR on valid code, which is the
   * disease this work exists to cure, so the checker only claims names it is
   * confident about. `self` is the case that forced this split: it is a
   * conventional actor name for suggestions, but in a test harness
   * `self:set(worm, name, n)` is an inventory mock, and warning about it was a
   * false positive (highlander/test_rules.lua).
   */
  diagnose?: string[];
  className: HandleClassName;
  /** Diagnostic rule id, kept stable so anything filtering on it still works. */
  rule: string;
  /** Extra text appended to the "unknown method" warning. */
  note?: string;
}

export const RECEIVER_REGISTRY: ReceiverRow[] = [
  {
    prefixes: ['worm', 'w', 'victim', 'target', 'attacker', 'owner', 'active'],
    diagnose: ['worm'],
    className: 'WormEntity',
    rule: 'worm-api',
  },
  {
    prefixes: ['a', 'actor', 'self', 'body', 'child', 'sentry', 'bullet', 'proj'],
    diagnose: ['a', 'actor'],
    className: 'LuaActor',
    rule: 'actor-api',
  },
  {
    // Note: `arsenal` (the name used by example.highlander) is deliberately NOT
    // listed here -- it is one pack's local name, not a convention. It resolves
    // through traceLocalTypes instead, from
    // `local arsenal = wa.inventory.create({...})`.
    prefixes: ['inv', 'store', 'inventory'],
    diagnose: ['inv', 'store', 'inventory'],
    className: 'InventoryStore',
    rule: 'inventory-api',
  },
  {
    // Mine, drum, oil, crate and grave are all one WorldHandle at runtime,
    // discriminated by .kind. They resolve here for convenience and get the
    // common object surface plus hit().
    prefixes: [
      'mine', 'drum', 'oil', 'oildrum', 'crate', 'grave', 'obj', 'object', 'land',
    ],
    diagnose: ['mine', 'drum', 'oil', 'oildrum', 'crate', 'grave', 'obj', 'object'],
    className: 'WorldHandle',
    rule: 'world-object-api',
  },
  {
    // The missile_frame payload table, not a handle.
    prefixes: ['m', 'missile', 'mis'],
    diagnose: ['m', 'missile'],
    className: 'MissileEntity',
    rule: 'missile-api',
    note: 'In-flight missile tables provide properties: id, weapon, sprite, collision_mask, x, y, vx, vy, damp, wind_scale, gravity_scale',
  },
  {
    // Free fog light (0.9.4): `local light = wa.fog.light{...}`.
    //
    // AUTOCOMPLETE ONLY. `light` is a natural local name for anything a pack
    // lights up, and the handle has just three methods, so diagnosing by name
    // would warn on every unrelated `light:something()`. The trace from
    // `wa.fog.light` is the confident path; the empty `diagnose` says so.
    prefixes: ['light'],
    diagnose: [],
    className: 'LightHandle',
    rule: 'light-api',
  },
  {
    // Magnetic field handle (0.9.11): `local field = wa.magnetism.field{...}`.
    // Same policy as LightHandle: the trace is confident, the local name is not.
    prefixes: ['field'],
    diagnose: [],
    className: 'MagneticField',
    rule: 'magnetic-api',
  },
  {
    // HUD text window (0.9.11): `local window = wa.hud.window{...}`.
    // Same policy as LightHandle: `window` is a common local name, so only the
    // trace from wa.hud.window is confident enough to diagnose.
    prefixes: ['window', 'hud_window'],
    diagnose: [],
    className: 'WindowHandle',
    rule: 'window-api',
  },
];

const BY_PREFIX: Map<string, ReceiverRow> = (() => {
  const map = new Map<string, ReceiverRow>();
  for (const row of RECEIVER_REGISTRY) {
    for (const p of row.prefixes) map.set(p.toLowerCase(), row);
  }
  return map;
})();

const BY_DIAGNOSE_PREFIX: Map<string, ReceiverRow> = (() => {
  const map = new Map<string, ReceiverRow>();
  for (const row of RECEIVER_REGISTRY) {
    for (const p of row.diagnose ?? row.prefixes) map.set(p.toLowerCase(), row);
  }
  return map;
})();

/**
 * The registry row for a receiver name, for AUTOCOMPLETE. Loose by design --
 * see ReceiverRow.diagnose for why the checker is not.
 */
export function resolveByName(name: string): ReceiverRow | null {
  return BY_PREFIX.get(name.toLowerCase()) ?? null;
}

/**
 * The registry row for a receiver name, for DIAGNOSTICS. Only names the row
 * lists in `diagnose` are claimed, so the checker never warns off a guess.
 */
export function resolveForCheck(name: string): ReceiverRow | null {
  return BY_DIAGNOSE_PREFIX.get(name.toLowerCase()) ?? null;
}

/** The handle class a receiver name resolves to, or null. */
export function resolveClass(name: string): HandleClassName | null {
  return resolveByName(name)?.className ?? null;
}

/**
 * Every receiver name the registry knows, for the identifier autocomplete popup.
 *
 * The scope model cannot supply these: they are CONVENTIONS, not declarations.
 * In a brand-new empty file there are no locals, so typing `obj` or `crate`
 * matched nothing and the popup stayed shut even though those names resolve to a
 * real handle the moment you type `:` or `.` after them.
 *
 * Exported rather than reconstructed in the component so the popup and the
 * checker keep reading one table. If this list and RECEIVER_REGISTRY ever drift,
 * the suggestion and the warning disagree again -- which is the exact failure
 * this file was created to prevent.
 */
export const ALL_RECEIVER_PREFIXES: string[] = (() => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of RECEIVER_REGISTRY) {
    for (const p of row.prefixes) {
      const k = p.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(p);
    }
  }
  return out;
})();

export function getClass(name: HandleClassName): ClassDef | undefined {
  return BUILTIN_CLASSES.find((c) => c.name === name);
}

/**
 * Custom-verb overlay for one class, for DIAGNOSTICS. A verb registered on a
 * handle class is as real as an engine member: `worm:grapple()` after
 * registering WormEntity:grapple must be silent, not a `worm-api` warning.
 * Reads from the caller's list, never from globals, so the TS path and the
 * autocomplete path can share it without a second source of truth.
 */
export function customMembersFor(className: string, verbs: CustomVerb[]): string[] {
  const out: string[] = [];
  for (const v of verbs) {
    if (v.class === className && !out.includes(v.name)) out.push(v.name);
  }
  return out;
}

/** The registry row that owns a class, for a type discovered by the trace. */
export function rowForClass(className: HandleClassName): ReceiverRow | null {
  return RECEIVER_REGISTRY.find((r) => r.className === className) ?? null;
}

// Assignments whose right-hand side is a call. The `(?<!\.)` sits directly in
// front of the variable name so it rejects `a.b = f()` -- where the name is
// `b` -- while still matching `local a = f()`. Earlier this was done by
// stripping whitespace off everything preceding the match and checking that
// for a dot, which was wrong: that text ends at `local`, and a preceding
// comment ending in a full stop (`...at turn start.`) rejected every real
// match in a 169 KB file, 147 matches down to 0.
const CALL_ASSIGNMENT =
  /(?<!\.)\b(?:local\s+)?([A-Za-z_]\w*)\s*=\s*([A-Za-z_][\w.]*)\s*\(/g;
const CALLABLE_NAMES: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const fn of BUILTIN_FUNCTIONS) map.set(fn.name, fn.returnType ?? '');
  for (const vb of BUILTIN_VARIABLES) map.set(vb.name, vb.type ?? '');
  return map;
})();

// `wa.X.all()` iterators yield engine objects, and the engine text names them:
// `wa.missiles.all` and `wa.arrows.all` return WorldHandle arrays (the same
// stock-missile / stock-arrow objects `object:impulse` pushes); `wa.worms.all`
// yields WormEntity; `wa.actors.all` yields LuaActor. `wa.mines.all`,
// `wa.crates.all`, `wa.oil.all` and `wa.graves.all` are WorldHandles too.
//
// WHY `wa.missiles.all()` IS NOT MissileEntity, measured at the engine:
// `spawn.rs` binds it with `bind_kind_list`, whose `all` calls `objects_table`,
// and `objects_table` fills the array with `WorldHandle::new(id)` -- userdata
// with `warp`/`fits`/`arm`/`impulse`/`remove` (actor.rs `add_methods`). The
// MissileEntity table is a DIFFERENT value: the plain table `wa.on.missile_frame`
// hands your callback, which has properties and no methods at all. A pack that
// writes `for _, missile in ipairs(wa.missiles.all()) do missile:impulse(dx, dy) end`
// is calling a real WorldHandle method, and calling it `missile` must not make the
// checker claim otherwise -- which is exactly what `px/weapons/electromagnet.lua:95`
// used to prove.
//
// EXPORTED because scripts/genEngineData.ts emits it into engine_data.rs. Rust had
// only the name table, so the same line raised `missile-api` in BOTH engines --
// and no test caught it, because every test asserted checker behaviour rather than
// the resolution input.
export const ITERATOR_ELEMENT: Record<string, HandleClassName> = {
  'wa.worms.all': 'WormEntity',
  'wa.actors.all': 'LuaActor',
  'wa.missiles.all': 'WorldHandle',
  'wa.mines.all': 'WorldHandle',
  'wa.crates.all': 'WorldHandle',
  'wa.oil.all': 'WorldHandle',
  'wa.graves.all': 'WorldHandle',
  'wa.arrows.all': 'WorldHandle',
};

// Loop headers whose iterator is a call: `for _, x in ipairs(wa.missiles.all())`.
// NO LONGER MATCHED HERE. There used to be a `traceLoopTypes` that regex-scanned the
// source for these and returned a flat `Map<name, class>`. It was never called -- which
// is why BOTH engines resolved the loop value by NAME and warned `missile:impulse() is
// not a MissileEntity method` on `px/weapons/electromagnet.lua:95`.
//
// Even wiring it up as written would have been wrong, and measurably so. A flat map
// makes a claim about the WHOLE FILE from one loop: `mods/tools/audit/audit.lua` loops
// `for _, w in ipairs(wa.worms.all())` at lines 107 and 112, and separately passes `w`
// as a callback parameter holding the audit harness's own MOCK worm at line 265. The map
// claims that mock, `w` stops resolving by name (`w` is not a confident registry prefix
// -- only `worm` is), and 46 false `worm-api` warnings appear.
//
// So the trace is built in parser.ts from the token stream, where each loop's own
// position range is available, and it only answers for a call inside that range. The
// DATA stays here; the resolution lives with the token walk.
export const LOOP_ITERATOR_WRAPPERS = ['ipairs', 'pairs'] as const;

/**
 * Resolution step 1: `local X = <call whose returnType names a handle>`.
 *
 * This is the "real, not guessed" tier. Your own pack is the case it earns its
 * keep on -- `local arsenal = wa.inventory.create({...})` resolves X to
 * InventoryStore from the call's own declared returnType, instead of the name
 * table having to guess because a variable happens to be called `arsenal`.
 *
 * Deliberately one hop: only a direct `local X = f(...)` assignment counts. It
 * does not try to follow a value through tables, returns or several
 * reassignments -- that is where a plausible-looking guess starts producing
 * wrong suggestions, which is worse than silence.
 */
export function traceLocalTypes(source: string): Map<string, HandleClassName> {
  const traced = new Map<string, HandleClassName>();
  CALL_ASSIGNMENT.lastIndex = 0;
  for (const m of source.matchAll(CALL_ASSIGNMENT)) {
    const [, varName, callName] = m;
    const declared = CALLABLE_NAMES.get(callName);
    const cls = normalizeReturnType(declared || undefined);
    if (cls) traced.set(varName, cls);
  }
  return traced;
}

/**
 * Maps a definitions `returnType` string to a handle class, e.g.
 * 'WormHandle | nil' -> WormEntity, 'ActorHandle' -> LuaActor.
 * Returns null when it names no handle, which is the common case.
 */
export function normalizeReturnType(returnType: string | undefined): HandleClassName | null {
  if (!returnType) return null;
  for (const part of returnType.split('|')) {
    const key = part.trim();
    if (HANDLE_ALIASES[key]) return HANDLE_ALIASES[key];
  }
  return null;
}