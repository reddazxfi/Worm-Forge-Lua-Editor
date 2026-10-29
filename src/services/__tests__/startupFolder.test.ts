// §35 -- merging `autoLoadFolder` and `modsRootPath` into ONE folder plus a mod
// NAME. The migration is the risky part: it runs against the user's real saved
// config, once, with no undo, and a wrong result silently opens the wrong folder
// on launch. These cases mirror migrateStartupFolder()'s three documented cases.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_CONFIG,
  exportConfigAsIni,
  loadConfig,
  parseIniConfig,
  saveConfig,
  type EditorConfig,
} from '../config';

// A localStorage stand-in. The real one is provided by the WebView; vitest runs in
// node, so this is what makes loadConfig/saveConfig testable at all.
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
});
afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

/** Write a raw blob the way an OLD build would have. */
function seedStored(partial: Record<string, unknown>) {
  store.set(
    'wormforge_editor_config',
    JSON.stringify({ ...DEFAULT_CONFIG, ...partial }),
  );
}

describe('§35 startup-folder migration', () => {
  it('Case B: only autoLoadFolder set -> derives the parent as the mods folder', () => {
    // This is the common one: the user configured a mod but never a mods root.
    seedStored({ autoLoadFolder: 'D:\\Worms Armageddon\\Mods\\bee', modsRootPath: '' });
    const cfg = loadConfig();
    expect(cfg.modsRootPath).toBe('D:\\Worms Armageddon\\Mods');
    expect(cfg.startupModFolder).toBe('bee');
    // The legacy field must be cleared so the migration cannot run twice.
    expect(cfg.autoLoadFolder).toBe('');
  });

  it('Case B: tolerates a trailing separator and a trailing quote', () => {
    // A user pasting a path out of Explorer brings the quotes along. Splitting
    // without stripping them first yields the folder name `bee"` and the startup
    // mod then silently resolves to nothing.
    seedStored({ autoLoadFolder: '"D:\\Mods\\bee\\"', modsRootPath: '' });
    const cfg = loadConfig();
    expect(cfg.modsRootPath).toBe('D:\\Mods');
    expect(cfg.startupModFolder).toBe('bee');
  });

  it('normalises quotes and whitespace typed into the startup-mod box', () => {
    seedStored({ modsRootPath: 'D:\\Mods', startupModFolder: '  "bee"  ' });
    expect(loadConfig().startupModFolder).toBe('bee');
  });

  it('Case A: only modsRootPath set -> nothing moves', () => {
    seedStored({ autoLoadFolder: '', modsRootPath: 'D:\\Mods', startupModFolder: '' });
    const cfg = loadConfig();
    expect(cfg.modsRootPath).toBe('D:\\Mods');
    expect(cfg.startupModFolder).toBe('');
  });

  it('Case C: both set and the startup folder IS inside the root -> name derived', () => {
    seedStored({
      autoLoadFolder: 'D:\\Mods\\bee',
      modsRootPath: 'D:\\Mods',
      startupModFolder: '',
    });
    const cfg = loadConfig();
    expect(cfg.modsRootPath).toBe('D:\\Mods');
    expect(cfg.startupModFolder).toBe('bee');
  });

  it('Case C: both set but unrelated trees -> keeps the explicit root', () => {
    // The one case that cannot be migrated perfectly. The documented behaviour is:
    // keep the explicit modsRootPath, record the startup mod by name, and let it
    // fail visibly later rather than silently opening something else.
    seedStored({
      autoLoadFolder: 'E:\\Scratch\\wip',
      modsRootPath: 'D:\\Mods',
      startupModFolder: '',
    });
    const cfg = loadConfig();
    expect(cfg.modsRootPath).toBe('D:\\Mods');
    expect(cfg.startupModFolder).toBe('wip');
  });

  it('does not overwrite a startup mod the user already chose', () => {
    seedStored({ autoLoadFolder: 'D:\\Mods\\bee', modsRootPath: '', startupModFolder: 'highlander' });
    expect(loadConfig().startupModFolder).toBe('highlander');
  });

  it('is idempotent: a second load changes nothing', () => {
    seedStored({ autoLoadFolder: 'D:\\Mods\\bee', modsRootPath: '' });
    const first = loadConfig();
    store.set('wormforge_editor_config', JSON.stringify(first));
    const second = loadConfig();
    expect(second).toEqual(first);
  });

  it('a fresh install has no startup mod and no legacy value', () => {
    const cfg = loadConfig();
    expect(cfg.startupModFolder).toBe('');
    expect(cfg.modsRootPath).toBe('');
    expect(cfg.autoLoadFolder).toBe('');
  });

  it('survives a corrupt override map without losing the folder', () => {
    seedStored({
      autoLoadFolder: 'D:\\Mods\\bee',
      syntaxOverridesDark: 'not-an-object',
    });
    const cfg = loadConfig();
    expect(cfg.syntaxOverridesDark).toEqual({});
    expect(cfg.startupModFolder).toBe('bee');
  });
});

describe('§35 ini round-trip for the startup mod', () => {
  const base: EditorConfig = {
    ...DEFAULT_CONFIG,
    modsRootPath: 'D:\\Mods',
    startupModFolder: 'bee',
  };

  it('exports and re-imports the startup mod name', () => {
    const ini = exportConfigAsIni(base);
    expect(ini).toContain('startup_mod_folder = bee');
    const back = parseIniConfig(ini);
    expect(back.startupModFolder).toBe('bee');
    expect(back.modsRootPath).toBe('D:\\Mods');
  });

  it('spells "empty" as none, matching auto_load_mod', () => {
    const ini = exportConfigAsIni({ ...base, startupModFolder: '' });
    expect(ini).toContain('startup_mod_folder = none');
    expect(parseIniConfig(ini).startupModFolder).toBe('');
  });

  it('saveConfig then loadConfig preserves the new field', () => {
    saveConfig(base);
    expect(loadConfig().startupModFolder).toBe('bee');
  });
});
describe('mod icon size preference', () => {
  it('defaults to the historical 64px tile', () => {
    expect(loadConfig().modIconSize).toBe(64);
  });

  it('clamps a hand-edited or out-of-range value', () => {
    seedStored({ modIconSize: 400 });
    expect(loadConfig().modIconSize).toBe(160);
    seedStored({ modIconSize: 'huge' });
    expect(loadConfig().modIconSize).toBe(64);
  });
});

describe('autocomplete preference', () => {
  it('defaults to on', () => {
    expect(loadConfig().autocomplete).toBe(true);
  });

  it('keeps an explicit off', () => {
    seedStored({ autocomplete: false });
    expect(loadConfig().autocomplete).toBe(false);
  });

  it('turns a missing or corrupt value back on', () => {
    // A config written before the option existed has no key at all.
    const old = { ...DEFAULT_CONFIG } as Record<string, unknown>;
    delete old.autocomplete;
    store.set('wormforge_editor_config', JSON.stringify(old));
    expect(loadConfig().autocomplete).toBe(true);

    seedStored({ autocomplete: 'no' });
    expect(loadConfig().autocomplete).toBe(true);
  });

  it('round-trips through saveConfig', () => {
    saveConfig({ ...DEFAULT_CONFIG, autocomplete: false });
    expect(loadConfig().autocomplete).toBe(false);
  });

  it('round-trips through the .ini export', () => {
    const ini = exportConfigAsIni({ ...DEFAULT_CONFIG, autocomplete: false });
    expect(ini).toContain('autocomplete = off');
    expect(parseIniConfig(ini).autocomplete).toBe(false);

    const on = exportConfigAsIni({ ...DEFAULT_CONFIG, autocomplete: true });
    expect(on).toContain('autocomplete = on');
    expect(parseIniConfig(on).autocomplete).toBe(true);
  });

  it('accepts hand-written true/false in the .ini', () => {
    expect(parseIniConfig('[Editor]\nautocomplete = false\n').autocomplete).toBe(false);
    expect(parseIniConfig('[Editor]\nautocomplete = true\n').autocomplete).toBe(true);
  });
});
