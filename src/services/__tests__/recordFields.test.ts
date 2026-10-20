import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { RECORD_FIELDS, RECORD_ACTIONS } from '../../data/recordFields';

// The app must build without the engine tree, so `recordFields.ts` is checked in.
// This is the guard that keeps it equal to the engine's own field table: the same
// JSON its web weapon editor reads, written by `record::fields_json()` in
// crates/weapons/src/record.rs and kept current by a test there. Same pattern as
// wormKeys.test.ts -- skip loudly when the engine folder is absent rather than
// pretend to have checked.
const ROOT = resolve(__dirname, '../../../WormForge-main-source');
const JSON_PATH = join(ROOT, 'web/weapon-editor/record_fields.json');
const haveEngine = existsSync(JSON_PATH);

interface EngineRow {
  path: string;
  off: number;
  kind: 'int' | 'bool' | 'sprite' | { enum: Record<string, number> };
  families: string[];
  action: number | null;
  body: boolean;
}

function engineRows(): EngineRow[] {
  return JSON.parse(readFileSync(JSON_PATH, 'utf8')) as EngineRow[];
}

describe('recordFields.ts mirrors the engine field table', () => {
  it('has exactly the engine rows, in the engine order', () => {
    if (!haveEngine) {
      console.warn('[recordFields] engine source absent -- SKIPPED');
      return;
    }
    const expected = engineRows().map((r) => ({
      path: r.path,
      off: r.off,
      kind: typeof r.kind === 'string' ? r.kind : 'enum',
      values:
        typeof r.kind === 'string'
          ? undefined
          : Object.entries(r.kind.enum).map(([name, value]) => [name, value]),
      families: r.families,
      action: r.action,
      body: r.body,
    }));
    expect(RECORD_FIELDS).toEqual(expected);
  });

  it('keeps the enum names, not just "enum"', () => {
    const action = RECORD_FIELDS.find((r) => r.path === 'missile.action')!;
    expect(action.kind).toBe('enum');
    expect(action.values).toEqual([
      ['none', 0],
      ['homing', 1],
      ['bounce', 2],
      ['roam', 3],
      ['dig', 4],
    ]);
    expect(RECORD_ACTIONS[1]).toBe('homing');
    expect(RECORD_ACTIONS[2]).toBe('bounce');
  });

  it('covers the groups a weapon spec can write', () => {
    const groups = new Set(RECORD_FIELDS.map((r) => r.path.split('.')[0]));
    for (const g of ['fires', 'handling', 'missile', 'clusters', 'mine', 'gun', 'strike', 'jet_pack']) {
      expect(groups.has(g), g).toBe(true);
    }
  });

  it('the cluster bits are the same body, offset further on', () => {
    const bit = RECORD_FIELDS.find((r) => r.path === 'clusters.bit.explosion.power')!;
    const body = RECORD_FIELDS.find((r) => r.path === 'missile.explosion.power')!;
    expect(bit.families).toEqual(body.families);
    expect(bit.body).toBe(true);
  });
});
