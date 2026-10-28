import { describe, expect, it } from 'vitest';
import {
  INITIAL_TEMPLATE,
  LEGACY_INITIAL_TEMPLATE,
  migrateInitialTemplate,
} from '../templates';

describe('initial editor template', () => {
  it('does not teach the retired 16.16 PX constant', () => {
    expect(INITIAL_TEMPLATE).not.toMatch(/\bPX\b/);
    expect(INITIAL_TEMPLATE).not.toContain('0x10000');
    expect(INITIAL_TEMPLATE).not.toContain('16.16');
  });

  it('uses the component install contract and pixel units', () => {
    expect(INITIAL_TEMPLATE).toContain('API 4 units are pixels');
    expect(INITIAL_TEMPLATE).toContain('return function(ctx)');
    expect(INITIAL_TEMPLATE).toContain('install(ctx)');
    expect(INITIAL_TEMPLATE).not.toContain('onInit');
  });
});

describe('migrateInitialTemplate', () => {
  it('replaces an untouched legacy starter in a restored session', () => {
    const files = {
      'mod.lua': LEGACY_INITIAL_TEMPLATE,
      'other.lua': 'return 1',
    };

    expect(migrateInitialTemplate(files)).toEqual({
      'mod.lua': INITIAL_TEMPLATE,
      'other.lua': 'return 1',
    });
  });

  it('tolerates CRLF and trailing whitespace in the legacy starter', () => {
    const files = {
      'mod.lua': `${LEGACY_INITIAL_TEMPLATE.replace(/\n/g, '\r\n')}\r\n`,
    };

    expect(migrateInitialTemplate(files)['mod.lua']).toBe(INITIAL_TEMPLATE);
  });

  it('leaves an edited starter alone', () => {
    const edited = `${LEGACY_INITIAL_TEMPLATE}\n-- my edit`;
    const files = { 'mod.lua': edited };

    expect(migrateInitialTemplate(files)['mod.lua']).toBe(edited);
  });
});

