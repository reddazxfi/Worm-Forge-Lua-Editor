import { describe, it, expect } from 'vitest';
import {
  tableContextAt,
  tableKeySuggestions,
  tableValueSuggestions,
  fieldTypeLabel,
  fieldDocText,
} from '../tableContext';
import { TABLE_DOCS, findTableDoc, fieldPaths, fieldAt, fieldsAtPath } from '../../data/tableDocs';
import { BUILTIN_FUNCTIONS } from '../../data/wormforgeDefinitions';

/** The caret is at the end of the snippet. */
const at = (src: string) => tableContextAt(src);

describe('tableContextAt: the call it belongs to', () => {
  it('finds a launch table, with every top-level key', () => {
    const ctx = at('wa.weapons.launch({ ');
    expect(ctx?.doc.id).toBe('wa.weapons.launch');
    expect(ctx?.path).toEqual([]);
    expect(ctx?.fields.map((f) => f.name)).toEqual([
      'weapon',
      'owner',
      'x',
      'y',
      'vx',
      'vy',
      'missile',
      'clusters',
      'damage',
      'sprite',
      'fuse',
      'sound',
      'explode_into',
      'countdown',
      'explode_on_space',
      'terrain_keep_pct',
    ]);
    expect(ctx?.trigger).toBe(true);
  });

  it('accepts the table-call sugar form (no parens)', () => {
    const ctx = at('wa.fog.light{ ');
    expect(ctx?.doc.id).toBe('a.light');
    expect(ctx?.path).toEqual([]);
  });

  it('resolves wa.weapons.replace and wa.actors.spawn', () => {
    expect(at('wa.weapons.replace({ ')?.doc.id).toBe('wa.weapons.replace');
    expect(at('wa.actors.spawn({ ')?.doc.id).toBe('wa.actors.spawn');
  });

  it('declines a table that is not passed to a documented call', () => {
    expect(at('local t = { ')).toBeNull();
    expect(at('some_fn({ ')).toBeNull();
    expect(at('print({ ')).toBeNull();
  });
});

describe('tableContextAt: nested levels', () => {
  it('descends into missile', () => {
    const ctx = at('wa.weapons.launch({\n  missile = { ');
    expect(ctx?.path).toEqual(['missile']);
    const names = ctx!.fields.map((f) => f.name);
    expect(names).toContain('explosion');
    expect(names).toContain('fuse');
    expect(names).toContain('trail');
    expect(names).toContain('burst');
  });

  it('descends two levels into missile.explosion', () => {
    const ctx = at('wa.weapons.launch({\n  missile = { explosion = { ');
    expect(ctx?.path).toEqual(['missile', 'explosion']);
    expect(ctx?.fields.map((f) => f.name)).toEqual(['bias', 'push_pct', 'power', 'variation']);
  });

  it('descends into clusters.bit', () => {
    const ctx = at('wa.weapons.launch({\n  clusters = { bit = { ');
    expect(ctx?.path).toEqual(['clusters', 'bit']);
    expect(ctx?.fields.map((f) => f.name)).toContain('explosion');
  });

  it('starts a new entry after a comma at the same level', () => {
    const ctx = at('wa.weapons.launch({\n  missile = { fuse = 1600, ');
    expect(ctx?.path).toEqual(['missile']);
    expect(ctx?.prefix).toBe('');
    expect(ctx?.trigger).toBe(true);
  });

  it('ignores a comma inside a closed nested table', () => {
    const ctx = at(
      'wa.weapons.launch({\n  missile = { explosion = { power = 1, bias = 2 }, '
    );
    // Back at the MISSILE level, not inside explosion.
    expect(ctx?.path).toEqual(['missile']);
  });

  it('reads the word being typed as the prefix', () => {
    const ctx = at('wa.weapons.launch({\n  missile = { grav');
    expect(ctx?.path).toEqual(['missile']);
    expect(ctx?.prefix).toBe('grav');
    expect(ctx?.trigger).toBe(true);
  });
});

describe('tableContextAt: value positions are not key positions', () => {
  it('declines after `key =`', () => {
    expect(at('wa.weapons.launch({\n  missile = { fuse = ')).toBeNull();
  });

  it('declines after `key = wa.`', () => {
    expect(at('wa.weapons.launch({\n  weapon = wa.')).toBeNull();
  });

  it('declines on a bare line inside a table (a value, not a key)', () => {
    expect(at('wa.weapons.launch({\n  missile = { 12')).toBeNull();
  });

  it('declines after the table is closed', () => {
    expect(at('wa.weapons.launch({ missile = { fuse = 1 } })')).toBeNull();
  });
});

describe('tableContextAt: braces in strings and comments do not count', () => {
  it('ignores a brace inside a string', () => {
    expect(at('print("{")\nwa.weapons.launch({ ')).not.toBeNull();
  });

  it('ignores a commented-out table', () => {
    expect(at('-- wa.weapons.launch({\nlocal x = 1')).toBeNull();
  });

  it('ignores a brace inside a long comment', () => {
    expect(at('--[[ { ]]\nlocal x = 1')).toBeNull();
  });

  it('ignores a brace inside a long string', () => {
    expect(at('local s = [[ { ]]\nlocal x = 1')).toBeNull();
  });

  it('handles levelled long brackets', () => {
    expect(at('--[==[ { ]==]\nlocal x = 1')).toBeNull();
    expect(at('local s = [==[ { ]==]\nlocal x = 1')).toBeNull();
    // ...and still finds a real table after one.
    expect(at('local s = [==[ { ]==]\nwa.weapons.launch({ ')).not.toBeNull();
  });
});

describe('tableContextAt: trigger only where a key may start', () => {
  it('stays quiet on a fresh line after Enter', () => {
    const ctx = at('wa.weapons.launch({\n  ');
    expect(ctx).not.toBeNull();
    expect(ctx?.trigger).toBe(false);
  });

  it('opens right after the brace', () => {
    expect(at('wa.weapons.launch({')?.trigger).toBe(true);
  });

  it('stays open over spaces right after the brace', () => {
    expect(at('wa.weapons.launch({  ')?.trigger).toBe(true);
  });
});

describe('the docs themselves', () => {
  it('covers the verbs the engine actually takes a table for', () => {
    const ids = TABLE_DOCS.map((d) => d.id);
    for (const id of [
      'wa.weapons.launch',
      'wa.weapons.replace',
      'wa.weapons.data',
      'wa.actors.spawn',
      'a.light',
      'wa.fog.set',
      'wa.weapons.fire_bullet',
      'wa.assets.load',
    ]) {
      expect(ids).toContain(id);
    }
  });

  it('every doc has a source and at least one field', () => {
    for (const doc of TABLE_DOCS) {
      expect(doc.source.length, doc.id).toBeGreaterThan(0);
      expect(doc.fields.length, doc.id).toBeGreaterThan(0);
      expect(doc.usedBy.length, doc.id).toBeGreaterThan(0);
    }
  });

  it('every declared path resolves to fields', () => {
    for (const doc of TABLE_DOCS) {
      for (const path of fieldPaths(doc.fields)) {
        const parts = path.split('.');
        expect(fieldAt(doc, parts), `${doc.id}: ${path}`).not.toBeNull();
      }
    }
  });

  it('weapon groups carry the record fields, not a copy of them', () => {
    const launch = findTableDoc('wa.weapons.launch')!;
    const missile = launch.fields.find((f) => f.name === 'missile')!;
    const power = fieldAt(launch, ['missile', 'explosion', 'power']);
    expect(power?.kind).toBe('int');
    expect(missile.children?.length).toBeGreaterThan(15);
  });

  it('every accepted-by name exists in the API definitions', () => {
    const functions = new Set(BUILTIN_FUNCTIONS.map((f) => f.name));
    for (const doc of TABLE_DOCS) {
      for (const used of doc.usedBy) {
        // `a.light` is a property, and `cluster` / `on_explode` are keys of the
        // spawn table itself rather than calls.
        if (used === 'a.light' || !used.includes('.')) continue;
        expect(functions.has(used), `${doc.id} -> ${used}`).toBe(true);
      }
    }
  });

  it('wa.weapons.data reports fires.as, and the replace spec does not offer it', () => {
    const data = findTableDoc('wa.weapons.data')!;
    expect(fieldAt(data, ['fires', 'as'])?.kind).toBe('enum');
    const spec = findTableDoc('wa.weapons.replace')!;
    expect(fieldAt(spec, ['fires', 'as'])).toBeNull();
  });

  it('marks the API 4 removals with where they moved', () => {
    const launch = findTableDoc('wa.weapons.launch')!;
    const damage = launch.fields.find((f) => f.name === 'damage')!;
    expect(damage.gone).toBe('missile.explosion.power');
  });

  it('gates bounce and homing fields on the missile action', () => {
    const launch = findTableDoc('wa.weapons.launch')!;
    const missile = launch.fields.find((f) => f.name === 'missile')!;
    const bounce = missile.children!.find((f) => f.name === 'bounce')!;
    const bounciness = bounce.children!.find((f) => f.name === 'bounciness')!;
    expect(bounciness.action).toBe('bounce');
    const homing = missile.children!.find((f) => f.name === 'homing')!;
    expect(homing.children!.find((f) => f.name === 'time')!.action).toBe('homing');
  });
});

describe('tableKeySuggestions', () => {
  it('offers every live key at the level, unfiltered', () => {
    const items = tableKeySuggestions(at('wa.weapons.launch({ ')!);
    expect(items.map((i) => i.name)).toEqual([
      'weapon',
      'owner',
      'x',
      'y',
      'vx',
      'vy',
      'missile',
      'clusters',
    ]);
  });

  it('filters on the word being typed', () => {
    const items = tableKeySuggestions(at('wa.weapons.launch({\n  missile = { fus')!);
    expect(items.map((i) => i.name)).toEqual(['fuse']);
    expect(items[0].insertText).toBe('fuse = ');
  });

  it('puts the caret inside a nested table', () => {
    const items = tableKeySuggestions(at('wa.weapons.launch({\n  mis')!);
    const missile = items.find((i) => i.name === 'missile')!;
    expect(missile.nested).toBe(true);
    expect(missile.insertText).toBe('missile = {  }');
    expect(missile.cursorBack).toBe(2);
  });

  it('never suggests a key API 4 removed', () => {
    const items = tableKeySuggestions(at('wa.weapons.launch({\n  dam')!);
    expect(items.map((i) => i.name)).toEqual([]);
    // It is still documented, with where it went.
    const launch = findTableDoc('wa.weapons.launch')!;
    expect(fieldDocText(launch.fields.find((f) => f.name === 'damage')!)).toContain(
      'missile.explosion.power'
    );
  });

  it('answers nothing when the prefix matches no key', () => {
    expect(tableKeySuggestions(at('wa.weapons.launch({\n  zzz')!)).toEqual([]);
  });
});

describe('table value suggestions', () => {
  it('offers the names a known enum key accepts', () => {
    const ctx = at('wa.weapons.launch({\n  missile = { action = ')!;
    expect(ctx.valueField?.name).toBe('action');
    expect(ctx.trigger).toBe(true);
    expect(tableValueSuggestions(ctx).map((i) => i.name)).toEqual([
      'none',
      'homing',
      'bounce',
      'roam',
      'dig',
    ]);
  });

  it('filters on the typed prefix and inserts a quoted name', () => {
    const ctx = at('wa.weapons.launch({\n  missile = { action = bo')!;
    const items = tableValueSuggestions(ctx);
    expect(items.map((i) => i.name)).toEqual(['bounce']);
    expect(items[0].insertText).toBe('"bounce"');
  });

  it('does not double the quote the user already typed', () => {
    const ctx = at('wa.weapons.launch({\n  missile = { action = "bo')!;
    expect(ctx.quoted).toBe(true);
    expect(tableValueSuggestions(ctx)[0].insertText).toBe('bounce');
  });

  it('offers a spawn key its names', () => {
    const ctx = at('wa.actors.spawn({\n  from = ')!;
    expect(tableValueSuggestions(ctx).map((i) => i.name)).toEqual(['sky', 'cursor', 'owner']);
  });

  it('declines keys with no named values, and values that are not names', () => {
    expect(at('wa.weapons.launch({\n  missile = { fuse = ')).toBeNull();
    expect(at('wa.weapons.launch({\n  missile = { action = 2')).toBeNull();
    expect(at('wa.weapons.launch({\n  missile = { action = "bounce"')).toBeNull();
  });
});

describe('field presentation', () => {
  it('labels an enum with the names it accepts', () => {
    const launch = findTableDoc('wa.weapons.launch')!;
    const action = fieldAt(launch, ['missile', 'action'])!;
    expect(fieldTypeLabel(action)).toBe('none | homing | bounce | roam | dig');
  });

  it('says what a removed key should become', () => {
    const launch = findTableDoc('wa.weapons.launch')!;
    const text = fieldDocText(launch.fields.find((f) => f.name === 'damage')!);
    expect(text).toContain('missile.explosion.power');
  });
});
