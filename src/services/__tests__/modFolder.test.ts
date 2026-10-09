// Which file opens when a mod folder is opened.
//
// THE MANIFEST DECIDES. `mod.toml` declares `entry = "rules.lua"`, and that is
// the file the engine actually loads. Picking "the first `.lua` in sorted order"
// instead opened whatever happened to sort first -- in a real highlander pack
// that was a scratch file (`highlander1asdasd.lua`) rather than `rules.lua`.
// This is the exact report these tests pin down.
//
// Pure functions, no DOM: modFolder.ts touches `window`/`document` only inside
// functions that are never called from here, so this runs in plain node.
import { describe, it, expect } from 'vitest';
import { pickStartupFile, declaredEntryFile, parseModManifest } from '../modFolder';

const MANIFEST =
  'id = "example.highlander"\napi_version = 1\nentry = "rules.lua"\n[weapons]\nregister = []\nreplace = []\n';

describe('parseModManifest', () => {
  it('reads entry alongside id/author/version', () => {
    expect(
      parseModManifest('id = "a"\nauthor = "b"\nversion = "1.2.3"\nentry = "rules.lua"\n')
    ).toMatchObject({ id: 'a', author: 'b', version: '1.2.3', entry: 'rules.lua' });
  });

  it('tolerates quotes, inline comments, CRLF and missing fields', () => {
    expect(parseModManifest('entry = "rules.lua"  # the main file\r\n').entry).toBe('rules.lua');
    expect(parseModManifest("entry = 'rules.lua'\n").entry).toBe('rules.lua');
    expect(parseModManifest('id = "a"\n').entry).toBeUndefined();
    expect(parseModManifest('').entry).toBeUndefined();
  });

  it('takes the FIRST entry, which on a bundle is the first component', () => {
    const bundle =
      'id = "b"\nformat_version = 2\n[[components]]\nid = "a"\ntype = "feature"\n' +
      'entry = "a.lua"\n[[components]]\nid = "b"\ntype = "scheme"\nentry = "b.lua"\n';
    expect(parseModManifest(bundle).entry).toBe('a.lua');
  });
});

describe('declaredEntryFile', () => {
  it('resolves an exact key', () => {
    expect(declaredEntryFile({ 'mod.toml': MANIFEST, 'rules.lua': 'x' })).toBe('rules.lua');
  });

  it('resolves a subfolder path', () => {
    expect(declaredEntryFile({ 'mod.toml': 'entry = "lib/anim.lua"\n', 'lib/anim.lua': 'x' })).toBe(
      'lib/anim.lua'
    );
  });

  it('resolves backslashes and a ./ prefix', () => {
    expect(declaredEntryFile({ 'mod.toml': 'entry = "lib\\anim.lua"\n', 'lib/anim.lua': 'x' })).toBe(
      'lib/anim.lua'
    );
    expect(declaredEntryFile({ 'mod.toml': 'entry = "./rules.lua"\n', 'rules.lua': 'x' })).toBe('rules.lua');
  });

  it('resolves by basename when the real key carries a folder', () => {
    expect(declaredEntryFile({ 'mod.toml': MANIFEST, 'weapons/rules.lua': 'x' })).toBe('weapons/rules.lua');
  });

  it('is case-insensitive', () => {
    expect(declaredEntryFile({ 'mod.toml': 'entry = "Rules.LUA"\n', 'rules.lua': 'x' })).toBe('rules.lua');
  });

  it('returns null when there is no manifest, no entry, or no match', () => {
    expect(declaredEntryFile({ 'rules.lua': 'x' })).toBeNull();
    expect(declaredEntryFile({ 'mod.toml': 'id = "a"\n', 'rules.lua': 'x' })).toBeNull();
    expect(declaredEntryFile({ 'mod.toml': 'entry = "gone.lua"\n', 'rules.lua': 'x' })).toBeNull();
  });
});

describe('pickStartupFile', () => {
  it('opens the declared entry even when a scratch file sorts first', () => {
    // The reported bug, verbatim: 'highlander1asdasd.lua' wins the alphabet.
    expect(
      pickStartupFile({
        'mod.toml': MANIFEST,
        'highlander1asdasd.lua': 'a',
        'aaa.lua': 'b',
        'rules.lua': 'c',
        'lib/anim.lua': 'd',
      })
    ).toBe('rules.lua');
  });

  it('falls back to the first .lua when the folder has no manifest', () => {
    expect(pickStartupFile({ 'highlander1asdasd.lua': 'a', 'rules.lua': 'b' })).toBe(
      'highlander1asdasd.lua'
    );
  });

  it('falls back when entry names a file that is not present', () => {
    expect(pickStartupFile({ 'mod.toml': 'entry = "gone.lua"\n', 'zz.lua': 'a', 'aa.lua': 'b' })).toBe(
      'aa.lua'
    );
  });

  it('falls back to the first file of any kind when there is no .lua', () => {
    expect(pickStartupFile({ 'mod.toml': MANIFEST })).toBe('mod.toml');
  });

  it('is null only for an empty folder', () => {
    expect(pickStartupFile({})).toBeNull();
  });
});