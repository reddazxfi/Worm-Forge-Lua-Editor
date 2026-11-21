import { describe, it, expect } from 'vitest';
import { DOC_SNIPPETS, docSnippetFor } from '../../data/docSnippets';
import { BUILTIN_CLASSES, BUILTIN_FUNCTIONS } from '../../data/wormforgeDefinitions';
import { parseAndValidate } from '../parser';

/**
 * Methods the engine's shipped mods do not call directly. They keep their
 * one-line contract example, which is still insertable; every other method has
 * a full function from a real pack.
 */
const NO_SHIPPED_USAGE = new Set([
  'LuaActor:cut',
  'LuaActor:spawn',
  'WormEntity:clear_keys',
  'WormEntity:air_fire',
  'WormEntity:show_health',
  'WormEntity:die',
  'WormEntity:poison',
  'WormEntity:input',
  'WorldHandle:impulse',
  'LightHandle:move',
  'LightHandle:set',
  'LightHandle:remove',
  'InventoryStore:get',
  'InventoryStore:set',
  'InventoryStore:remove',
  'WindowHandle:set',
  'WindowHandle:close',
  'WindowHandle:is_open',
]);

describe('full documentation snippets', () => {
  it('covers every event hook', () => {
    const missing = BUILTIN_FUNCTIONS.filter(
      (f) => f.name.startsWith('wa.on.') && !docSnippetFor(f.name)
    ).map((f) => f.name);
    expect(missing).toEqual([]);
  });

  it('covers every method except the documented no-usage set', () => {
    const missing: string[] = [];
    for (const cls of BUILTIN_CLASSES) {
      for (const member of cls.members) {
        if (member.kind !== 'method') continue;
        const key = `${cls.name}:${member.name}`;
        if (NO_SHIPPED_USAGE.has(key)) continue;
        if (!docSnippetFor(key)) missing.push(key);
      }
    }
    expect(missing).toEqual([]);
  });

  it('only uses keys that exist in the docs', () => {
    const known = new Set<string>();
    for (const f of BUILTIN_FUNCTIONS) known.add(f.name);
    for (const c of BUILTIN_CLASSES) {
      known.add(c.name);
      for (const m of c.members) known.add(`${c.name}:${m.name}`);
    }
    const unknown = Object.keys(DOC_SNIPPETS).filter((key) => !known.has(key));
    expect(unknown).toEqual([]);
  });

  it('has a real source and a complete block, not a placeholder', () => {
    for (const [key, snippet] of Object.entries(DOC_SNIPPETS)) {
      expect(snippet.source, `${key} has no source`).toMatch(
        /^(WormForgeNew\/mods\/|WormForge API example)/
      );
      expect(snippet.code, `${key} still contains ...`).not.toContain('...');
      expect(snippet.code, `${key} is only one line`).toContain('\n');
      const tail = snippet.code.trim();
      expect(
        ['end', 'end)', 'end,', '})', ')'].some((suffix) => tail.endsWith(suffix)),
        `${key} does not end in a Lua block terminator`
      ).toBe(true);
    }
  });

  it('parses without syntax errors', () => {
    const broken = Object.entries(DOC_SNIPPETS)
      .map(([key, snippet]) => ({
        key,
        errors: parseAndValidate(snippet.code).diagnostics.filter(
          (d) => d.severity === 'error'
        ),
      }))
      .filter((entry) => entry.errors.length > 0);
    expect(broken).toEqual([]);
  });
});
