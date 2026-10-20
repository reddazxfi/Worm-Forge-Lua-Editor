import { describe, it, expect } from 'vitest';
import {
  parseProfile,
  linkFeatures,
  bundledBy,
  type ComponentSource,
} from '../profile';
import { profilesDirFromModsRoot } from '../profilesFolder';

describe('parseProfile', () => {
  it('reads the demo profile the engine ships (inline crates, [weapons] placements)', () => {
    // Shaped from WormForge-main-source/mods/component_demo/profiles/Demo.toml.
    const toml = [
      '# The demo weapon set.',
      'description = "Big Bazooka plus a few stock weapons; nothing else on the panel."',
      'features = ["demo.turn_note"]',
      'crates = { weapon = 40, health = 10, utility = 20 }',
      '',
      '[weapons]',
      '"demo.big_bazooka" = { row = "F1", column = 1 }',
      '"stock.grenade" = { row = "F2", column = 1 }',
      '"stock.shotgun" = { row = "F3", column = 1 }',
      '',
      '[weapon_settings."demo.big_bazooka"]',
      'delay = 1',
      '',
      '[weapon_settings."stock.grenade"]',
      'ammo = -1',
    ].join('\r\n');

    const p = parseProfile(toml);
    expect(p.description).toBe('Big Bazooka plus a few stock weapons; nothing else on the panel.');
    expect(p.features).toEqual(['demo.turn_note']);
    expect(p.hasCrates).toBe(true);
    expect(p.hasScheme).toBe(false);
    expect(p.weapons).toEqual([
      { id: 'demo.big_bazooka', row: 'F1', column: 1 },
      { id: 'stock.grenade', row: 'F2', column: 1 },
      { id: 'stock.shotgun', row: 'F3', column: 1 },
    ]);
    expect(p.weaponSettingCount).toBe(2);
    expect(p.unknownSections).toEqual([]);
  });

  it('reads the table form `[weapons."px.javelin"]` and keeps dotted ids whole', () => {
    // px/profiles/Funny.toml writes every placement this way. A naive
    // `split('.')` would turn `px.javelin` into two segments.
    const toml = [
      'description = "Best of the Best"',
      'features = ["core.utilities"]',
      '',
      '[options."core.utilities"]',
      'agility = true',
      'collect_viewer = true',
      '',
      '[weapons."px.javelin"]',
      'column = 2',
      'row = "F1"',
      '',
      '[weapons."gif.flags"]',
      'column = 1',
      'row = "F1"',
    ].join('\n');

    const p = parseProfile(toml);
    expect(p.features).toEqual(['core.utilities']);
    expect(p.weapons).toEqual([
      { id: 'px.javelin', row: 'F1', column: 2 },
      { id: 'gif.flags', row: 'F1', column: 1 },
    ]);
    expect(p.optionCount).toBe(2);
    expect(p.unknownSections).toEqual([]);
  });

  it('accepts `= true` placements (gif_donkey growth Hormones style)', () => {
    const p = parseProfile('[weapons]\n"gif.flags" = true\n"gif.lua" = true\n');
    expect(p.weapons).toEqual([{ id: 'gif.flags' }, { id: 'gif.lua' }]);
  });

  it('reads a multi-line features array, which is legal TOML', () => {
    const p = parseProfile('features = [\n  "a.one",\n  "b.two",\n]\n');
    expect(p.features).toEqual(['a.one', 'b.two']);
  });

  it('marks a features array that never closes instead of showing half a list', () => {
    const p = parseProfile('features = ["a.one",\n');
    expect(p.features).toEqual([]);
    expect(p.unknownSections).toContain('features (unterminated array)');
  });

  it('counts options and weapon options per value', () => {
    const toml = [
      '[options."tools.audit"]',
      'trace = true',
      'strict = false',
      '',
      '[weapon_options."px.javelin"."px.rocket"]',
      'speed = 3',
      '',
      '[weapon_options."px.javelin"."px.other"]',
      'speed = 5',
    ].join('\n');
    const p = parseProfile(toml);
    expect(p.optionCount).toBe(2);
    expect(p.weaponOptionCount).toBe(2);
    expect(p.unknownSections).toEqual([]);
  });

  it('sees [scheme], inline scheme, and both forms of utility_crates', () => {
    expect(parseProfile('[scheme]\nwind = 2\n').hasScheme).toBe(true);
    expect(parseProfile('scheme = { wind = 2 }\n').hasScheme).toBe(true);
    expect(parseProfile('[utility_crates]\nhealth = 5\n').hasUtilityCrates).toBe(true);
    expect(parseProfile('utility_crates = { health = 5 }\n').hasUtilityCrates).toBe(true);
  });

  it('does not treat utility crate weights as scheme settings', () => {
    // These were conflated once: `utility_crates` set hasScheme, which made the
    // card claim the profile carried its own WA scheme.
    const p = parseProfile('[utility_crates]\nhealth = 5\n');
    expect(p.hasUtilityCrates).toBe(true);
    expect(p.hasScheme).toBe(false);
  });

  it('keeps a "#" inside a quoted description', () => {
    const p = parseProfile('description = "turns #3 and on" # a real comment\n');
    expect(p.description).toBe('turns #3 and on');
  });

  it('lists a section it does not model rather than dropping it silently', () => {
    const p = parseProfile('[something_new]\nkey = 1\n');
    expect(p.unknownSections).toEqual(['something_new']);
  });

  it('flags an array-of-tables, which profiles do not use', () => {
    const p = parseProfile('[[weapons]]\nid = "x"\n');
    expect(p.unknownSections).toContain('[[weapons]]');
  });

  it('returns an empty summary for empty input', () => {
    expect(parseProfile('')).toEqual({
      description: '',
      features: [],
      weapons: [],
      optionCount: 0,
      weaponOptionCount: 0,
      weaponSettingCount: 0,
      hasScheme: false,
      hasCrates: false,
      hasUtilityCrates: false,
      unknownSections: [],
    });
  });

  it('strips a UTF-8 BOM', () => {
    expect(parseProfile('\uFEFFdescription = "hi"\n').description).toBe('hi');
  });
});

describe('linkFeatures', () => {
  const components: ComponentSource[] = [
    { modId: 'tools', modFolder: 'tools', componentId: 'tools.audit', type: 'feature', entry: 'audit/audit.lua' },
    { modId: 'core', modFolder: 'core', componentId: 'core.utilities', type: 'feature', entry: 'utilities.lua' },
  ];

  it('resolves a feature to the mod and entry that declare it', () => {
    const [link] = linkFeatures(['tools.audit'], components);
    expect(link.id).toBe('tools.audit');
    expect(link.source).toMatchObject({ modId: 'tools', entry: 'audit/audit.lua' });
  });

  it('keeps an unknown id, with no source, instead of guessing a match', () => {
    // Deliberately NOT suffix-matched: `audit` is not `tools.audit`.
    const links = linkFeatures(['audit'], components);
    expect(links).toEqual([{ id: 'audit', source: undefined }]);
  });

  it('first declaration wins when two mods claim one id', () => {
    const doubled: ComponentSource[] = [
      ...components,
      { modId: 'other', modFolder: 'other', componentId: 'tools.audit' },
    ];
    const [link] = linkFeatures(['tools.audit'], doubled);
    expect(link.source?.modId).toBe('tools');
  });

  it('preserves profile order', () => {
    const links = linkFeatures(['core.utilities', 'nope', 'tools.audit'], components);
    expect(links.map((l) => l.id)).toEqual(['core.utilities', 'nope', 'tools.audit']);
  });
});

describe('bundledBy', () => {
  const mods = [
    { id: 'px', folderName: 'px', bundledProfiles: ['Funny', 'Highlander'] },
    { id: 'tools', folderName: 'tools', bundledProfiles: ['Audit banana'] },
    { id: 'plain', folderName: 'plain' },
  ];

  it('finds the mods that ship a profile of that name, case-insensitively', () => {
    expect(bundledBy('funny', mods)).toEqual([{ id: 'px', folderName: 'px' }]);
  });

  it('returns nothing for an installed-only profile', () => {
    expect(bundledBy('Mine', mods)).toEqual([]);
  });

  it('treats a missing bundledProfiles as none, not an error', () => {
    expect(bundledBy('Anything', mods)).toEqual([]);
  });
});

describe('profilesDirFromModsRoot', () => {
  // Mirrors the engine: profile_dir(mods) = wormforge_root(mods)/Profiles, and
  // wormforge_root(mods) = mods.parent() (components.rs:1372-1378).
  it('derives the sibling Profiles folder on Windows', () => {
    expect(profilesDirFromModsRoot('D:\\Worms\\WormForge\\Mods')).toBe('D:\\Worms\\WormForge\\Profiles');
  });

  it('derives it on POSIX', () => {
    expect(profilesDirFromModsRoot('/home/me/WormForge/Mods')).toBe('/home/me/WormForge/Profiles');
  });

  it('ignores trailing separators and mixed separators', () => {
    expect(profilesDirFromModsRoot('D:/Worms/WormForge/Mods///')).toBe('D:\\Worms\\WormForge\\Profiles');
  });

  it('gives the drive root the engine would give for a top-level Mods', () => {
    expect(profilesDirFromModsRoot('C:\\Mods')).toBe('C:\\Profiles');
  });

  it('declines a bare relative path, which has no parent to derive from', () => {
    expect(profilesDirFromModsRoot('Mods')).toBe('');
    expect(profilesDirFromModsRoot('')).toBe('');
  });
});
