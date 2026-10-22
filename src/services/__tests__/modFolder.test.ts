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
import {
  pickStartupFile,
  declaredEntryFile,
  parseModManifest,
  declaredComponentEntries,
  startupSelection,
  hasProfilesDir,
  isLuaFile,
  isTextFile,
  buildModManifest,
  buildModProfile,
  buildModEntryLua,
  buildNewMod,
  validateNewModSpec,
  NEW_MOD_ENTRY,
  profileFileName,
  isSafeModRelativePath,
  saveModFile,
  type NewModSpec,
} from '../modFolder';

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

describe('parseModManifest components', () => {
  const BUNDLE =
    'id = "tools.pack"\nformat_version = 2\n' +
    '[[components]]\nid = "tools.hello"\ntype = "feature"\nentry = "hello.lua"\n' +
    '[[components]]\nid = "tools.perf"\ntype = "audit"\nentry = "audit/audit.lua"\n' +
    '[[components]]\nid = "tools.shared"\ntype = "weapon"\nentry = "weapons.lua"\n' +
    '[[components]]\nid = "tools.alias"\ntype = "weapon"\nentry = "weapons.lua"\n';

  it('parses every [[components]] block with id, type and entry', () => {
    const m = parseModManifest(BUNDLE);
    expect(m.components).toEqual([
      { id: 'tools.hello', type: 'feature', entry: 'hello.lua' },
      { id: 'tools.perf', type: 'audit', entry: 'audit/audit.lua' },
      { id: 'tools.shared', type: 'weapon', entry: 'weapons.lua' },
      { id: 'tools.alias', type: 'weapon', entry: 'weapons.lua' },
    ]);
  });

  it('keeps top-level fields alongside components', () => {
    const m = parseModManifest('id = "x"\nauthor = "me"\nversion = "1.0"\n' + BUNDLE.split('\n').slice(1).join('\n'));
    expect(m.id).toBe('x');
    expect(m.author).toBe('me');
    expect(m.version).toBe('1.0');
    expect(m.components.length).toBe(4);
  });

  it('exposes the first component entry as `entry` for back-compat', () => {
    expect(parseModManifest(BUNDLE).entry).toBe('hello.lua');
  });

  it('skips keys inside non-components tables such as [[components.options]]', () => {
    const toml =
      '[[components]]\nid = "a"\nentry = "a.lua"\n' +
      '[[components.options]]\nentry = "not-an-entry.lua"\n' +
      '[[components]]\nid = "b"\nentry = "b.lua"\n';
    const m = parseModManifest(toml);
    expect(m.components).toHaveLength(2);
    expect(m.components.map((c) => c.id)).toEqual(['a', 'b']);
    expect(m.entry).toBe('a.lua');
  });

  it('tolerates a component with no id or entry', () => {
    const m = parseModManifest('[[components]]\ntype = "feature"\n[[components]]\nid = "ok"\nentry = "ok.lua"\n');
    expect(m.components).toHaveLength(2);
    expect(m.components[1]).toMatchObject({ id: 'ok', entry: 'ok.lua' });
    expect(m.entry).toBe('ok.lua');
  });
});

describe('declaredComponentEntries', () => {
  const FILES = {
    'mod.toml':
      'id = "bundle"\n' +
      '[[components]]\nid = "a"\nentry = "hello.lua"\n' +
      '[[components]]\nid = "b"\nentry = "weapons.lua"\n' +
      '[[components]]\nid = "c"\nentry = "weapons.lua"\n' +
      '[[components]]\nid = "d"\nentry = "audit/audit.lua"\n' +
      '[[components]]\nid = "e"\nentry = "missing.lua"\n',
    'hello.lua': 'print("a")',
    'weapons.lua': 'print("b")',
    'audit/audit.lua': 'print("c")',
  };

  it('resolves distinct entries in manifest order', () => {
    const entries = declaredComponentEntries(FILES);
    expect(entries.map((e) => e.entry)).toEqual(['hello.lua', 'weapons.lua', 'audit/audit.lua']);
    expect(entries.map((e) => e.id)).toEqual(['a', 'b', 'd']);
  });

  it('dedups shared entries so a file appears once', () => {
    const entries = declaredComponentEntries(FILES);
    const weapons = entries.find((e) => e.entry === 'weapons.lua');
    expect(weapons).toMatchObject({ id: 'b' });
    expect(entries.filter((e) => e.entry === 'weapons.lua')).toHaveLength(1);
  });

  it('skips entries whose file is not present', () => {
    const entries = declaredComponentEntries(FILES);
    expect(entries.find((e) => e.entry === 'missing.lua')).toBeUndefined();
  });

  it('resolves nested entry paths', () => {
    const entries = declaredComponentEntries(FILES);
    expect(entries.find((e) => e.entry === 'audit/audit.lua')).toMatchObject({ id: 'd' });
  });

  it('returns [] when there is no manifest', () => {
    expect(declaredComponentEntries({ 'hello.lua': 'x' })).toEqual([]);
  });

  it('returns [] when there are no components', () => {
    expect(declaredComponentEntries({ 'mod.toml': 'id = "x"\nentry = "hello.lua"\n', 'hello.lua': 'x' })).toEqual(
      []
    );
  });
});

describe('startupSelection', () => {
  it('opens the single declared entry', () => {
    const sel = startupSelection({
      'mod.toml': 'entry = "rules.lua"\n',
      'rules.lua': 'x',
      'zz.lua': 'y',
    });
    expect(sel.file).toBe('rules.lua');
    expect(sel.ambiguous).toBe(false);
    expect(sel.reason).toBe('declared-single');
  });

  it('prefers weapons.lua among multiple distinct declared entries', () => {
    const sel = startupSelection({
      'mod.toml':
        '[[components]]\nid = "a"\nentry = "perf.lua"\n' +
        '[[components]]\nid = "b"\nentry = "weapons.lua"\n' +
        '[[components]]\nid = "c"\nentry = "rules.lua"\n',
      'perf.lua': 'x',
      'weapons.lua': 'y',
      'rules.lua': 'z',
    });
    expect(sel.file).toBe('weapons.lua');
    expect(sel.ambiguous).toBe(false);
    expect(sel.reason).toBe('declared-weapons');
    expect(sel.entries).toEqual(['perf.lua', 'weapons.lua', 'rules.lua']);
  });

  it('flags ambiguity when several distinct entries have no weapons.lua', () => {
    const sel = startupSelection({
      'mod.toml':
        '[[components]]\nid = "a"\nentry = "perf.lua"\n' +
        '[[components]]\nid = "b"\nentry = "rules.lua"\n',
      'perf.lua': 'x',
      'rules.lua': 'y',
    });
    expect(sel.ambiguous).toBe(true);
    expect(sel.reason).toBe('declared-multiple');
    expect(sel.file).toBe('perf.lua');
    expect(sel.entries).toEqual(['perf.lua', 'rules.lua']);
  });

  it('falls back to weapons.lua when there is no manifest at all', () => {
    const sel = startupSelection({
      'highlander1asdasd.lua': 'a',
      'weapons.lua': 'b',
      'rules.lua': 'c',
    });
    expect(sel.file).toBe('weapons.lua');
    expect(sel.reason).toBe('weapons-fallback');
    expect(sel.ambiguous).toBe(false);
  });

  it('falls back to the first .lua when there is no manifest and no weapons.lua', () => {
    const sel = startupSelection({
      'highlander1asdasd.lua': 'a',
      'rules.lua': 'b',
    });
    expect(sel.file).toBe('highlander1asdasd.lua');
    expect(sel.reason).toBe('lua-fallback');
  });

  it('falls back to the first file of any kind when there are no .lua files', () => {
    const sel = startupSelection({ 'mod.toml': 'id = "x"\n', 'readme.md': 'x' });
    expect(sel.file).toBe('mod.toml');
    expect(sel.reason).toBe('any-fallback');
  });

  it('is null and reason none for an empty folder', () => {
    const sel = startupSelection({});
    expect(sel.file).toBeNull();
    expect(sel.reason).toBe('none');
    expect(sel.ambiguous).toBe(false);
  });
});

describe('isLuaFile', () => {
  it('is true for .lua only, case-insensitively', () => {
    expect(isLuaFile('rules.lua')).toBe(true);
    expect(isLuaFile('audit/AUDIT.LUA')).toBe(true);
  });

  it('is false for every other text document the workspace loads', () => {
    // This is the allow-list that replaced the old deny-list. `notes.py` and
    // extensionless files are the reason: the deny-list handed anything not
    // explicitly listed to the Lua 5.4 compiler, which reported a syntax error
    // on line 1 of a valid non-Lua document.
    for (const name of ['mod.toml', 'README.md', 'a.txt', 'x.json', 'w.ini', 'notes.py', 'Makefile', 'LICENSE']) {
      expect(isLuaFile(name), name).toBe(false);
      // ...while the folder loader still reads them, so they stay visible.
      if (name !== 'notes.py' && name !== 'Makefile' && name !== 'LICENSE') {
        expect(isTextFile(name), name).toBe(true);
      }
    }
  });
});

describe('a new mod is a bundle plus a profile', () => {
  it('writes api_version 4, because the engine rejects anything else', () => {
    // crates/weapons/src/components.rs:340:
    //   "api_version {n} is not supported (need 4)"
    // The skeleton used to say 1, so every mod created here looked complete in
    // the editor and could not be loaded by the game at all.
    const toml = buildModManifest('bee', 'Bee', 'me', 'mod.lua');
    expect(toml).toContain('api_version = 4');
  });

  it('is a format_version 2 bundle with exactly one feature component', () => {
    const toml = buildModManifest('bee', 'Bee', 'me', 'mod.lua');
    expect(toml).toContain('format_version = 2');
    expect(toml).toContain('[[components]]');
    expect(toml).toContain('id = "bee.main"');
    expect(toml).toContain('type = "feature"');
    expect(toml).toContain('entry = "mod.lua"');
    // A profile selects COMPONENTS, so a v1 TOP-LEVEL `entry` would leave the
    // bundled profile with nothing to name. The component's own `entry` key is
    // the only one allowed to exist.
    expect(toml.match(/^entry = /gm)).toHaveLength(1);
  });

  it('carries no v1 keys, which the bundle parser refuses rather than ignores', () => {
    // BundleManifest is #[serde(deny_unknown_fields)], and components.rs pins
    // that "a v1 field in a bundle is refused, not ignored".
    const toml = buildModManifest('bee', 'Bee', 'me', 'mod.lua');
    expect(toml).not.toContain('[weapons]');
    expect(toml).not.toContain('register');
  });

  it('round-trips through the manifest parser as one entrypoint', () => {
    const m = parseModManifest(buildModManifest('bee', 'Bee', 'me', 'mod.lua'));
    expect(m.id).toBe('bee');
    expect(m.name).toBe('Bee');
    expect(m.author).toBe('me');
    expect(m.version).toBe('0.1.0');
    expect(m.components).toEqual([
      { id: 'bee.main', type: 'feature', entry: 'mod.lua' },
    ]);
    // Back-filled from the single component, so the startup picker still opens it.
    expect(m.entry).toBe('mod.lua');
  });

  it('escapes quotes so free-text names cannot break the file', () => {
    // modName/author come from the modal. `0rang3 "the" mod` used to emit a
    // mod.toml whose `name = "0rang3 "the" mod"` does not parse, leaving a
    // brand-new mod the editor cannot read back.
    const toml = buildModManifest('bee', '0rang3 "the" mod', 'a\\b', 'mod.lua');
    expect(toml).toContain('name = "0rang3 \\"the\\" mod"');
    expect(toml).toContain('author = "a\\\\b"');
    // The parser strips quotes but must not lose the rest of the value.
    expect(parseModManifest(toml).id).toBe('bee');
  });

  it('the profile selects that component and nothing else', () => {
    // ProfileSpec is #[serde(deny_unknown_fields)] too, so every key emitted
    // here has to be one it declares.
    const profile = buildModProfile('Bee', 'bee.main');
    expect(profile).toContain('features = ["bee.main"]');
    expect(profile).toContain('description = ');
    // No [weapons] table: an add-on keeps the scheme's own panel.
    expect(profile).not.toContain('[weapons]');
  });

  it('the entry file returns its install function', () => {
    // The engine loads a component with require() and expects a function (or a
    // table { install = ... }) back. The old template declared
    // `function onModLoad() end`, which returns nothing and never runs.
    const lua = buildModEntryLua('Bee', 'me', 'bee.main');
    expect(lua).toContain('return function(ctx)');
    expect(lua).not.toContain('onModLoad');
  });

  it('flattens a multi-line name so it cannot escape the header comment', () => {
    // A newline in the mod name would end the `--` comment and make the rest of
    // the name executable Lua.
    const lua = buildModEntryLua('a\nos.exit()', 'b\r\nc', 'bee.main');
    expect(lua.split('\n')[0]).toBe('-- a os.exit()');
    expect(lua.split('\n')[1]).toBe('-- by b c');
  });
});

describe('new mod parameters and the code/ + profiles/ layout', () => {
  const featureSpec: NewModSpec = {
    name: 'Live HP',
    author: 'me',
    kind: 'feature',
    options: [
      {
        key: 'live_hp',
        label: 'Live HP',
        type: 'bool',
        defaultValue: true,
        description: 'Health bars follow damage immediately.',
      },
    ],
  };

  it('puts Lua in code/ and the profile in profiles/', () => {
    const built = buildNewMod(featureSpec);
    expect(NEW_MOD_ENTRY).toBe('code/mod.lua');
    expect(built.files['code/mod.lua']).toBeTruthy();
    expect(built.files['mod.lua']).toBeUndefined();
    expect(built.profilePath).toBe('profiles/Live HP.toml');
    expect(built.files['mod.toml']).toContain('entry = "code/mod.lua"');
    expect(built.files['profiles/Live HP.toml']).toContain('features = ["live_hp.main"]');
  });

  it('turns a behavior switch into components.options and a profile value', () => {
    const built = buildNewMod(featureSpec);
    expect(built.files['mod.toml']).toContain('[[components.options]]');
    expect(built.files['mod.toml']).toContain('key = "live_hp"');
    expect(built.files['mod.toml']).toContain('type = "bool"');
    expect(built.files['mod.toml']).toContain('default = true');
    expect(built.files['mod.toml']).toContain('label = "Live HP"');
    expect(built.files['profiles/Live HP.toml']).toContain('[options."live_hp.main"]');
    expect(built.files['profiles/Live HP.toml']).toContain('live_hp = true');
    expect(built.files['code/mod.lua']).toContain('ctx.option("live_hp")');
    expect(built.files['profiles/Live HP.toml']).not.toContain('[weapons]');
  });

  it('places a weapon and writes its numeric parameter into the starter profile', () => {
    const weaponSpec: NewModSpec = {
      name: 'Heli Test',
      author: 'me',
      kind: 'weapon',
      options: [
        {
          key: 'bullets',
          label: 'Bullets per strafe',
          type: 'int',
          defaultValue: 17,
          min: 1,
          max: 1000,
          description: 'How many rounds the helicopter fires.',
        },
      ],
    };
    const built = buildNewMod(weaponSpec);
    expect(built.componentId).toBe('heli_test.weapon');
    expect(built.files['mod.toml']).toContain('type = "weapon"');
    expect(built.files['mod.toml']).toContain('default_position = { row = "F1", column = 1 }');
    expect(built.files['mod.toml']).toContain('min = 1');
    expect(built.files['mod.toml']).toContain('max = 1000');
    expect(built.files['profiles/Heli Test.toml']).toContain('[weapons]');
    expect(built.files['profiles/Heli Test.toml']).toContain(
      '"heli_test.weapon" = { row = "F1", column = 1 }'
    );
    expect(built.files['profiles/Heli Test.toml']).toContain('[options."heli_test.weapon"]');
    expect(built.files['profiles/Heli Test.toml']).toContain('bullets = 17');
    expect(built.files['code/mod.lua']).toContain('install = function(ctx)');
    expect(built.files['code/mod.lua']).toContain('ctx.option("bullets")');
  });

  it('rejects keys the loader could not read back', () => {
    expect(validateNewModSpec(featureSpec)).toBeNull();
    expect(
      validateNewModSpec({
        ...featureSpec,
        options: [{ ...featureSpec.options[0], key: 'not a key' }],
      })
    ).toContain('lowercase');
    expect(
      validateNewModSpec({
        ...featureSpec,
        options: [featureSpec.options[0], { ...featureSpec.options[0] }],
      })
    ).toContain('used twice');
    expect(
      validateNewModSpec({
        ...featureSpec,
        options: [
          {
            key: 'bullets',
            label: 'Bullets',
            type: 'int',
            defaultValue: 99,
            min: 1,
            max: 10,
          },
        ],
      })
    ).toContain('between 1 and 10');
  });
});

describe('profileFileName', () => {
  it('keeps the player-facing name, spaces and capitals included', () => {
    // mods/tools ships "Audit home.toml"; profiles are read by humans.
    expect(profileFileName('Audit home', 'audit_home')).toBe('Audit home');
  });

  it('removes the characters the engine refuses', () => {
    // profile_name_problem rejects / \ : * ? " < > | and control characters.
    expect(profileFileName('a/b\\c:d*e?f"g<h>i|j', 'fallback')).toBe('a b c d e f g h i j');
  });

  it('drops a trailing dot, which is refused', () => {
    expect(profileFileName('Bee.', 'bee')).toBe('Bee');
  });

  it('caps the name at 60 characters', () => {
    expect(profileFileName('x'.repeat(100), 'bee').length).toBe(60);
  });

  it('falls back to the slug when nothing usable is left', () => {
    expect(profileFileName('???', 'new_mod')).toBe('new_mod');
    expect(profileFileName('   ', 'new_mod')).toBe('new_mod');
  });
});

describe('parseModManifest name', () => {
  it('reads the bundle display name without disturbing entry back-compat', () => {
    const m = parseModManifest(
      'id = "px.ports"\nname = "Project X ports"\nformat_version = 2\n' +
        '[[components]]\nid = "hl.rules"\nentry = "components/highlander.lua"\n'
    );
    expect(m.id).toBe('px.ports');
    expect(m.name).toBe('Project X ports');
    // Still back-filled from the first component, which pickStartupFile relies on.
    expect(m.entry).toBe('components/highlander.lua');
  });
});

describe('hasProfilesDir', () => {
  it('detects a profiles directory at the mod root', () => {
    expect(hasProfilesDir({ 'mod.toml': 'x', 'profiles': '', 'profiles/home.toml': 'y' })).toBe(true);
  });

  it('detects profiles in nested keys', () => {
    expect(hasProfilesDir({ 'mod.toml': 'x', 'profiles/Highlander.toml': 'y' })).toBe(true);
  });

  it('returns false when there is no profiles directory', () => {
    expect(hasProfilesDir({ 'mod.toml': 'x', 'hello.lua': 'y', 'profile.txt': 'z' })).toBe(false);
    expect(hasProfilesDir({})).toBe(false);
  });

  it('is case-insensitive and backslash tolerant', () => {
    expect(hasProfilesDir({ 'PROFILES/Home.toml': 'x' })).toBe(true);
    expect(hasProfilesDir({ 'profiles\\\\Home.toml': 'x' })).toBe(true);
  });
});
// A save must never escape the folder the user picked. The workspace tree only
// produces safe names, but a manifest `entry` reaches the same save path when a
// declared-but-missing file is created, and that string is mod author input.
describe('isSafeModRelativePath', () => {
  it('accepts the names the tree actually produces', () => {
    expect(isSafeModRelativePath('mod.toml')).toBe(true);
    expect(isSafeModRelativePath('rules.lua')).toBe(true);
    expect(isSafeModRelativePath('lib/anim.lua')).toBe(true);
    expect(isSafeModRelativePath('profiles/My Mod.toml')).toBe(true);
  });

  it('accepts backslashes for Windows-authored manifests', () => {
    expect(isSafeModRelativePath('lib\\anim.lua')).toBe(true);
  });

  it('rejects traversal, relative or absolute', () => {
    for (const bad of [
      '..',
      '.',
      '../evil.lua',
      'a/../../evil.lua',
      '..\\evil.lua',
      'a/..',
      'a/./b.lua',
      '',
    ]) {
      expect(isSafeModRelativePath(bad), bad).toBe(false);
    }
  });

  it('normalises duplicate separators instead of treating them as traversal', () => {
    expect(isSafeModRelativePath('a//b.lua')).toBe(true);
    expect(isSafeModRelativePath('a\\\\b.lua')).toBe(true);
  });

  it('rejects rooted paths, drives and UNC', () => {
    for (const bad of ['/etc/passwd', '\\\\server\\share\\x.lua', 'C:\\Windows\\x.lua', 'c:/x.lua']) {
      expect(isSafeModRelativePath(bad), bad).toBe(false);
    }
  });

  it('is enforced by saveModFile before any filesystem call', async () => {
    const g = globalThis as { window?: unknown };
    const previous = g.window;
    g.window = { __TAURI_INTERNALS__: {} };
    try {
      await expect(saveModFile('C:\\mods\\x', '../evil.lua', 'x')).rejects.toThrow(
        /must stay inside the mod folder/
      );
    } finally {
      g.window = previous;
    }
  });
});
