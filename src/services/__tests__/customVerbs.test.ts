// Verbs: parse individually, merge at member level, round-trip over disk.
//
// These pin the exact failure the feature exists to fix: a verb registered on
// an EXISTING class (the only case that matters for engine additions) used to
// vanish at two name-level merges, while surviving on a brand-new class -- so
// the modal's "success" log was a lie. Storage is localStorage + JSON text
// here (vitest runs in node, where neither Tauri nor `localStorage` exists),
// while the real disk write lives behind the same serializer in the service.
import { describe, it, expect } from 'vitest';
import {
  parseVerbsFile,
  serializeVerbsFile,
  sanitizeVerb,
  verbToMember,
  mergeCustomClasses,
  verbsForRust,
  isValidIdent,
  isValidClass,
  VERBS_STORAGE_KEY,
} from '../customVerbs';
import { parseAndValidate } from '../parser';
import type { ClassDef, CustomVerb } from '../../types/wormforge';

const grapple = (): CustomVerb => ({
  class: 'WormEntity',
  name: 'grapple',
  kind: 'method',
  syntax: ':',
  returnType: 'void',
  parameters: [{ name: 'target', type: 'table' }],
  description: 'Fires the ninja rope',
  example: 'worm:grapple(target)',
});

const engineWorm = (): ClassDef => ({
  name: 'WormEntity',
  description: 'engine',
  members: [{ name: 'hurt', kind: 'method', description: 'x' }],
});

describe('sanitizeVerb', () => {
  it('accepts a full row', () => {
    expect(sanitizeVerb(grapple())).toEqual(grapple());
  });

  it('accepts a multi-segment wa namespace for a custom function', () => {
    expect(isValidClass('wa.one')).toBe(true);
    expect(sanitizeVerb({ ...grapple(), class: 'wa.one', name: 'two', syntax: '.', kind: 'method' }))
      .toMatchObject({ class: 'wa.one', name: 'two' });
  });

  it('rejects non-identifiers one row at a time', () => {
    expect(sanitizeVerb({ ...grapple(), name: 'grap ple' })).toBeNull();
    expect(sanitizeVerb({ ...grapple(), class: '1bad' })).toBeNull();
    expect(sanitizeVerb({ ...grapple(), kind: 'constant' })).toBeNull();
    expect(sanitizeVerb(null)).toBeNull();
    expect(sanitizeVerb('grapple')).toBeNull();
  });

  it('keeps valid params and drops nameless ones', () => {
    const v = sanitizeVerb({
      ...grapple(),
      parameters: [{ name: 'ok', type: 'int' }, { name: '' }, { name: 42 }],
    });
    expect(v?.parameters.map((p) => p.name)).toEqual(['ok']);
  });
});

describe('parseVerbsFile', () => {
  it('returns [] for empty, garbage, and non-array bodies', () => {
    expect(parseVerbsFile('')).toEqual([]);
    expect(parseVerbsFile('not json')).toEqual([]);
    expect(parseVerbsFile('{"class":"WormEntity"}')).toEqual([]);
  });

  it('drops bad rows individually, keeping the good ones', () => {
    const good = grapple();
    const back = parseVerbsFile(JSON.stringify([good, { class: '!!' }, { name: 'x' }]));
    expect(back).toEqual([good]);
  });

  it('dedupes repeat rows, first wins', () => {
    const back = parseVerbsFile(JSON.stringify([grapple(), grapple()]));
    expect(back).toHaveLength(1);
  });

  it('round-trips through the serializer', () => {
    expect(parseVerbsFile(serializeVerbsFile([grapple()]))).toEqual([grapple()]);
  });
});

describe('mergeCustomClasses', () => {
  it('lands a verb on an EXISTING class instead of dropping it', () => {
    const merged = mergeCustomClasses([engineWorm()], [grapple()]);
    expect(merged).toHaveLength(1);
    expect(merged[0].members.map((m) => m.name)).toEqual(['hurt', 'grapple']);
  });

  it('marks the added member custom so the badge paints', () => {
    const merged = mergeCustomClasses([engineWorm()], [grapple()]);
    expect(merged[0].members.find((m) => m.name === 'grapple')?.isCustom).toBe(true);
  });

  it('creates a missing class and leaves the engine tables unmutated', () => {
    const base = [engineWorm()];
    const before = JSON.stringify(base);
    const merged = mergeCustomClasses(base, [{ ...grapple(), class: 'MyHands' }]);
    expect(JSON.stringify(base)).toBe(before);
    expect(merged.map((c) => c.name)).toEqual(['WormEntity', 'MyHands']);
    expect(merged[1].isCustom).toBe(true);
  });

  it('does not add the same verb twice', () => {
    const merged = mergeCustomClasses(mergeCustomClasses([engineWorm()], [grapple()]), [grapple()]);
    expect(merged[0].members.filter((m) => m.name === 'grapple')).toHaveLength(1);
  });
});

describe('verbsForRust', () => {
  it('sends one pair per verb, names only', () => {
    expect(verbsForRust([grapple()])).toEqual([['WormEntity', 'grapple']]);
  });
});

describe('verb persistence contract', () => {
  it('uses a distinct localStorage key from the editor config', () => {
    expect(VERBS_STORAGE_KEY).not.toBe('wormforge_editor_config');
    expect(VERBS_STORAGE_KEY).toContain('verbs');
  });

  it('survives a full write/read cycle through the real serializers', () => {
    const store = new Map<string, string>();
    store.set(VERBS_STORAGE_KEY, serializeVerbsFile([grapple()]));
    expect(parseVerbsFile(store.get(VERBS_STORAGE_KEY) ?? '')).toEqual([grapple()]);
  });

  it('a corrupt mirror degrades to no verbs instead of throwing', () => {
    const store = new Map<string, string>([[VERBS_STORAGE_KEY, '[[[broken']]);
    expect(parseVerbsFile(store.get(VERBS_STORAGE_KEY) ?? '')).toEqual([]);
  });

  it('verbToMember falls back to generated text when description is blank', () => {
    const m = verbToMember({ ...grapple(), description: '', example: '' });
    expect(m.isCustom).toBe(true);
    expect(m.description).toContain('WormEntity:grapple');
    expect(m.example).toBe('WormEntity:grapple(...)');
  });
});

describe('isValidIdent', () => {
  it('accepts what sanitizeVerb accepts, rejects what it drops', () => {
    expect(isValidIdent('grapple')).toBe(true);
    expect(isValidIdent('_priv')).toBe(true);
    expect(isValidIdent('  grapple  ')).toBe(true); // trims first
    expect(isValidIdent('grap ple')).toBe(false);
    expect(isValidIdent('1bad')).toBe(false);
    expect(isValidIdent('')).toBe(false);
    expect(isValidIdent('worm!')).toBe(false);
  });
});

// ---- the checker overlay, end to end --------------------------------------
// parser.ts is the synchronous checker; these pin its half of the contract
// (checks.rs has the mirror-image tests under the same names). The console
// shows MERGED diagnostics, so a verdict here is a verdict the user sees.
describe('parseAndValidate with a user verb overlay', () => {
  const SRC = 'function M.onTick()\n  worm:grapple(10)\nend';

  it('flags worm:grapple without the overlay (the bug being fixed)', () => {
    const { diagnostics } = parseAndValidate(SRC);
    expect(diagnostics.some((d) => d.rule === 'worm-api')).toBe(true);
  });

  it('is silent once WormEntity:grapple is registered', () => {
    const { diagnostics } = parseAndValidate(SRC, [grapple()]);
    expect(diagnostics.some((d) => d.rule === 'worm-api')).toBe(false);
  });

  it('keeps the warning when the verb belongs to ANOTHER class', () => {
    // Membership is (class, member): OtherClass:grapple must not free worm.
    const { diagnostics } = parseAndValidate(SRC, [{ ...grapple(), class: 'OtherClass' }]);
    expect(diagnostics.some((d) => d.rule === 'worm-api')).toBe(true);
  });

  it('accepts a registered wa namespace function and still flags a different leaf', () => {
    const custom = { ...grapple(), class: 'wa.one', name: 'two', syntax: '.' as const };
    const accepted = parseAndValidate('wa.one.two()', [custom]).diagnostics;
    expect(accepted.some((d) => d.rule === 'wa-namespace-typo')).toBe(false);

    const typo = parseAndValidate('wa.one.three()', [custom]).diagnostics;
    expect(typo.some((d) => d.rule === 'wa-namespace-typo')).toBe(true);
  });

  it('an empty overlay is exactly the default call', () => {
    // run() == run_with_custom(vec![]) on the Rust side; the TS side takes
    // userVerbs = [] as default, so this pins that no path diverges.
    expect(parseAndValidate(SRC, []).diagnostics).toEqual(parseAndValidate(SRC).diagnostics);
  });

  it('a custom owner joins the handle-union notice text', () => {
    const src = 'if obj.kind == "worm" then\n  obj:hurt(10)\nend';
    const notice = (verbs: CustomVerb[]) =>
      parseAndValidate(src, verbs)
        .diagnostics.filter((d) => d.rule === 'handle-union')
        .map((d) => d.message);
    // Engine-only baseline: WormEntity is the only handle class owning hurt,
    // so the notice names it alone (no "and" -- there is no second owner).
    expect(notice([])).toHaveLength(1);
    expect(notice([])[0]).toContain('WormEntity');
    expect(notice([])[0]).not.toContain('GhostProxy');
    // The overlay appends GhostProxy -- same phrasing checks.rs emits.
    const withGhost = notice([{ ...grapple(), class: 'GhostProxy', name: 'hurt' }]);
    expect(withGhost).toHaveLength(1);
    expect(withGhost[0]).toContain('WormEntity and GhostProxy');
  });
});
