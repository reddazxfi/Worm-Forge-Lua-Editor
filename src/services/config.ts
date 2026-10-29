import { isValidSwatch, SYNTAX_TOKENS, type SyntaxOverrides } from './editorThemes';
import { sanitizeBackground } from './appTheme';

export interface EditorConfig {
  theme: 'dark' | 'light';
  // Per-theme app background. Empty means "use the stock theme background"; a
  // value is a validated #rrggbb hex that stays in the theme's luminance family.
  backgroundDark: string;
  backgroundLight: string;
  // Which side of the editor the tree/doc sidebar sits on. Dragging and the
  // splitter's border both follow this, rather than assuming left forever.
  sidebarSide: 'left' | 'right';
  // Which syntax palette the editor uses. An unknown id falls back to 'classic'
  // in editorThemes.getPreset(), so a stale config degrades instead of breaking.
  syntaxPreset: string;
  // Per-token colour overrides, stored SEPARATELY for dark and light: a colour
  // that reads well on #0e1115 does not read well on white, so one shared set
  // would be wrong half the time. Empty object = use the preset as-is.
  syntaxOverridesDark: SyntaxOverrides;
  syntaxOverridesLight: SyntaxOverrides;
  fontSize: number; // px, e.g. 11, 12, 13, 14, 16, 18
  lineHeight: number; // relative, e.g. 1.3, 1.5, 1.8
  // Mods-grid tile art size in px. Manifest icons are usually 32x32, so this
  // scales them up; 64 preserves the historical tile.
  modIconSize: number;
  // Offer the suggestion popup while typing. Off is a supported editor mode,
  // not a hidden flag: no popup opens, and Tab indents as usual.
  autocomplete: boolean;
  autoLoadModId: string; // mod id to load on startup (e.g. "gameplay.highlander_full", "gameplay.kill_the_king", "")
  // §35: ONE folder for everything on disk. This is the directory that CONTAINS
  // your mods (one subfolder per mod, each with its own mod.toml).
  modsRootPath: string;
  // Which subfolder of modsRootPath to open automatically on startup, by NAME
  // ("bee" opens <modsRootPath>\bee). Empty = open nothing.
  //
  // This replaces the old `autoLoadFolder` absolute path. Both fields existed and
  // were almost always the same tree -- one pointed at the parent, one at a child
  // of it -- so the user had to set two paths to describe one folder. Storing a
  // NAME instead of a second absolute path also means moving the mods folder on
  // disk does not break the startup setting.
  startupModFolder: string;
  // DEPRECATED, kept only so an existing saved config is not lost. On load,
  // loadConfig() folds this into modsRootPath + startupModFolder and stops using
  // it. Nothing new should read or write this.
  autoLoadFolder: string;
  // What happens on startup. 'lastFile' is today's behaviour; 'modsList' shows
  // the mods grid instead of resuming. Needs a real modsRootPath; listModEntries
  // returns null without one (or outside the desktop app).
  launchMode: 'lastFile' | 'modsList';
  sidebarWidth: number; // px, e.g. 340
  treeHeightPercent: number; // %, e.g. 58
  consoleHeight: number; // px, e.g. 230
}

export const MOD_ICON_MIN = 32;
export const MOD_ICON_MAX = 160;

/** Clamps a stored/imported mod icon size to the range the grid can render. */
export function normalizeModIconSize(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 64;
  return Math.max(MOD_ICON_MIN, Math.min(MOD_ICON_MAX, Math.round(n)));
}

export const DEFAULT_CONFIG: EditorConfig = {
  theme: 'dark',
  backgroundDark: '',
  backgroundLight: '',
  sidebarSide: 'left',
  syntaxPreset: 'classic',
  syntaxOverridesDark: {},
  syntaxOverridesLight: {},
  fontSize: 13,
  lineHeight: 1.5,
  modIconSize: 64,
  autocomplete: true,
  autoLoadFolder: '',
  startupModFolder: '',
  autoLoadModId: '',
  modsRootPath: '',
  launchMode: 'lastFile',
  sidebarWidth: 340,
  treeHeightPercent: 58,
  consoleHeight: 220,
};

const STORAGE_KEY = 'wormforge_editor_config';

export function loadConfig(): EditorConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw);
    const merged: EditorConfig = { ...DEFAULT_CONFIG, ...parsed };
    // The override maps are objects keyed by token name. A config written by an
    // older build has no such keys (fine -- defaults apply), but one edited by
    // hand could hold a string or an array here, and spreading that into a render
    // path would either throw or silently colour nothing. Normalise to a plain
    // object and let isValidSwatch() reject individual bad values later.
    merged.syntaxOverridesDark = sanitizeOverrides(parsed?.syntaxOverridesDark);
    merged.syntaxOverridesLight = sanitizeOverrides(parsed?.syntaxOverridesLight);
    if (typeof merged.syntaxPreset !== 'string') merged.syntaxPreset = DEFAULT_CONFIG.syntaxPreset;
    // A config written before this setting existed has no key, and a hand-edited
    // one may hold a string or NaN. Both fall back to the historical 64px tile.
    merged.modIconSize = normalizeModIconSize(parsed?.modIconSize);
    // A config saved before this option existed has no key at all (`undefined`
    // from the spread), and one edited by hand could hold a non-boolean. Only an
    // explicit `false` turns the popup off; everything else stays on.
    if (typeof merged.autocomplete !== 'boolean') merged.autocomplete = true;
    // New in the 1.0 appearance pass. Validate rather than trust localStorage:
    // the streaming inline styles below cannot tolerate an arbitrary string.
    merged.sidebarSide = parsed?.sidebarSide === 'right' ? 'right' : 'left';
    merged.backgroundDark = sanitizeBackground(parsed?.backgroundDark, 'dark');
    merged.backgroundLight = sanitizeBackground(parsed?.backgroundLight, 'light');
    return migrateStartupFolder(merged);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function sanitizeOverrides(value: unknown): SyntaxOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as SyntaxOverrides;
}

/**
 * Strips wrapping quotes, whitespace and trailing separators -- the SAME
 * normalisation `cleanFolderPath` in modFolder.ts does, duplicated here because
 * config.ts must not import the Tauri-backed module.
 *
 * The quote strip is not cosmetic. A user who pastes `"D:\Mods\bee\"` into the
 * path box gets a stored value with a leading and trailing quote, and splitting
 * that WITHOUT stripping first yields the folder name `bee"` -- which then looks
 * for a subfolder called `bee"`, finds nothing, and silently opens nothing. The
 * first draft of this migration had exactly that bug and a test caught it.
 */
function cleanPath(p: string): string {
  if (!p) return '';
  return p.trim().replace(/^["']|["']$/g, '').trim().replace(/[\\/]+$/, '');
}

/** `D:\Mods\bee\` -> `bee`. */
function folderName(p: string): string {
  const clean = cleanPath(p);
  return clean.split(/[\\/]/).pop() || clean;
}

/** `D:\Mods\bee` -> `D:\Mods`. Returns '' when there is no parent to speak of. */
function parentFolder(p: string): string {
  const clean = cleanPath(p);
  const idx = Math.max(clean.lastIndexOf('\\'), clean.lastIndexOf('/'));
  return idx > 0 ? clean.slice(0, idx) : '';
}

/**
 * §35 MIGRATION -- the one thing that must not go wrong.
 *
 * The old config had TWO paths: `autoLoadFolder` (one mod's folder, opened at
 * startup) and `modsRootPath` (the parent holding all mods). Users had to set
 * both to describe one folder. There are three real cases, and each has to end up
 * opening the SAME mod it opened before:
 *
 *   A. Only modsRootPath set  -> already migrated. startupModFolder stays as the
 *      user configured it (empty), nothing changes.
 *   B. Only autoLoadFolder set, no modsRootPath -> this is the common one. The
 *      old startup folder is a mod INSIDE the folder the user never configured.
 *      Derive the parent as modsRootPath and the folder name as the startup mod.
 *      Both features then work off the one path.
 *   C. Both set, and autoLoadFolder is NOT inside modsRootPath -> the two pointed
 *      at genuinely different trees. Keep the parent's explicit setting and record
 *      the startup mod by name only; a mod whose name does not exist under the new
 *      root simply will not be found, which refreshMods/loadModEntry surface as a
 *      clear "not found" rather than opening the wrong thing.
 *
 * `autoLoadFolder` is then cleared, so the migration runs exactly once and the
 * deprecated key persists as "". That means a user who DOWNGRADES to an older build
 * would come back with the legacy field empty. That is the intended trade: keeping
 * it would mean the field kept looking configured in the old build while actually
 * being ignored by this one, which is worse than an empty box the user can see.
 * The .ini export below still writes the real path so a downgrade can recover it.
 */
function migrateStartupFolder(cfg: EditorConfig): EditorConfig {
  // Normalise the startup NAME unconditionally, BEFORE any early return. It is
  // typed by hand into a text box, so it arrives with stray whitespace and quotes
  // for the same reason the path does. Doing this after the `if (!legacy)` return
  // would leave it un-normalised for every already-migrated config, which is
  // exactly the common case after the first launch. A test caught that too.
  cfg.startupModFolder = cfg.startupModFolder.trim().replace(/^["']|["']$/g, '').trim();
  cfg.modsRootPath = cleanPath(cfg.modsRootPath || '');

  const legacy = cleanPath(cfg.autoLoadFolder || '');
  if (!legacy) {
    cfg.autoLoadFolder = '';
    return cfg;
  }
  const root = cfg.modsRootPath;
  if (!root) {
    // Case B: derive the parent, then keep only the folder name.
    cfg.modsRootPath = parentFolder(legacy);
    if (!cfg.startupModFolder) cfg.startupModFolder = folderName(legacy);
  } else if (!cfg.startupModFolder) {
    // Case C. Note whether it was actually a child, purely for the log line below.
    const parent = parentFolder(legacy);
    if (parent && parent.toLowerCase() === root.toLowerCase()) {
      cfg.startupModFolder = folderName(legacy);
    } else {
      console.warn(
        `[config] autoLoadFolder "${legacy}" is not inside modsRootPath "${root}". ` +
          `Keeping "${root}" as the mods folder; startup mod set to "${folderName(legacy)}", ` +
          `which will only be found if a subfolder of that name exists there.`,
      );
      cfg.startupModFolder = folderName(legacy);
    }
  }
  cfg.autoLoadFolder = '';
  return cfg;
}

export function saveConfig(cfg: EditorConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch (e) {
    console.error('Failed to save WormForge config:', e);
  }
}

/**
 * One `key = token=swatch,token=swatch` line, or '' when there are no overrides.
 * Returning '' leaves a blank line in the .ini, which parseIniConfig already skips.
 */
function serializeOverrideIni(key: string, overrides: SyntaxOverrides): string {
  const entries = Object.entries(overrides || {})
    .filter(([, v]) => isValidSwatch(v))
    .map(([token, v]) => `${token}=${v}`);
  return entries.length ? `${key} = ${entries.join(',')}` : '';
}

export function exportConfigAsIni(cfg: EditorConfig): string {
  return `; WormForge Code Editor Configuration
[Editor]
theme = ${cfg.theme}
background_dark = ${cfg.backgroundDark || ''}
background_light = ${cfg.backgroundLight || ''}
syntax_preset = ${cfg.syntaxPreset}
${serializeOverrideIni('syntax_override_dark', cfg.syntaxOverridesDark)}
${serializeOverrideIni('syntax_override_light', cfg.syntaxOverridesLight)}
font_size = ${cfg.fontSize}
line_height = ${cfg.lineHeight}
autocomplete = ${cfg.autocomplete ? 'on' : 'off'}

[Startup]
auto_load_mod = ${cfg.autoLoadModId || 'none'}
auto_load_folder = ${cfg.autoLoadFolder || ''}
startup_mod_folder = ${cfg.startupModFolder || 'none'}
launch_mode = ${cfg.launchMode}
mods_root_path = ${cfg.modsRootPath || ''}

[Layout]
sidebar_side = ${cfg.sidebarSide}
mod_icon_size = ${cfg.modIconSize}
sidebar_width = ${cfg.sidebarWidth}
tree_height_percent = ${cfg.treeHeightPercent}
console_height = ${cfg.consoleHeight}
`;
}

const TOKEN_KEY_SET = new Set(SYNTAX_TOKENS.map((t) => t.key));

/**
 * Parses `token=swatch,token=swatch`. Both halves are validated: an unknown token
 * name is dropped so a typo cannot add junk keys to the override map, and an
 * unknown swatch is dropped so it can never reach a class attribute.
 */
function parseOverrideIni(val: string): SyntaxOverrides {
  const out: SyntaxOverrides = {};
  if (!val) return out;
  for (const pair of val.split(',')) {
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const token = pair.slice(0, eq).trim();
    const swatch = pair.slice(eq + 1).trim();
    if (TOKEN_KEY_SET.has(token as never) && isValidSwatch(swatch)) {
      out[token as keyof SyntaxOverrides] = swatch;
    }
  }
  return out;
}

export function parseIniConfig(iniText: string): Partial<EditorConfig> {
  const result: Partial<EditorConfig> = {};
  const lines = iniText.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#') || trimmed.startsWith('[')) continue;
    const [key, ...vals] = trimmed.split('=');
    const val = vals.join('=').trim();
    const cleanKey = key.trim().toLowerCase();

    if (cleanKey === 'theme' && (val === 'light' || val === 'dark')) {
      result.theme = val;
    } else if (cleanKey === 'background_dark' || cleanKey === 'background_light') {
      // Blank means "stock theme colour", which is a supported value, not an
      // error. A non-blank value still has to pass the same luminance gate as the
      // live picker; a bad hex is ignored and the current setting stays.
      const mode = cleanKey === 'background_dark' ? 'dark' : 'light';
      if (!val) {
        if (mode === 'dark') result.backgroundDark = '';
        else result.backgroundLight = '';
      } else {
        const safe = sanitizeBackground(val, mode);
        if (safe) {
          if (mode === 'dark') result.backgroundDark = safe;
          else result.backgroundLight = safe;
        }
      }
    } else if (cleanKey === 'sidebar_side') {
      if (val === 'left' || val === 'right') result.sidebarSide = val;
    } else if (cleanKey === 'syntax_preset') {
      // Not validated against SYNTAX_PRESETS here on purpose: getPreset() already
      // falls back to 'classic' at render time, so an .ini naming a preset from a
      // newer build is preserved on round-trip but still renders safely.
      if (val) result.syntaxPreset = val;
    } else if (cleanKey === 'syntax_override_dark' || cleanKey === 'syntax_override_light') {
      const parsedOverrides = parseOverrideIni(val);
      if (cleanKey === 'syntax_override_dark') result.syntaxOverridesDark = parsedOverrides;
      else result.syntaxOverridesLight = parsedOverrides;
    } else if (cleanKey === 'font_size') {
      const n = parseInt(val, 10);
      if (!isNaN(n) && n >= 10 && n <= 28) result.fontSize = n;
    } else if (cleanKey === 'line_height') {
      const f = parseFloat(val);
      if (!isNaN(f) && f >= 1.0 && f <= 3.0) result.lineHeight = f;
    } else if (cleanKey === 'autocomplete') {
      // `on`/`off` is what the exporter writes; true/false are accepted because
      // people hand-edit this file. Anything else is ignored rather than guessed.
      if (val === 'on' || val === 'true') result.autocomplete = true;
      else if (val === 'off' || val === 'false') result.autocomplete = false;
    } else if (cleanKey === 'auto_load_mod') {
      result.autoLoadModId = val === 'none' ? '' : val;
    } else if (cleanKey === 'auto_load_folder') {
      result.autoLoadFolder = val;
    } else if (cleanKey === 'startup_mod_folder') {
      // 'none' is how the exporter spells "empty", matching auto_load_mod.
      result.startupModFolder = val === 'none' ? '' : val;
    } else if (cleanKey === 'mods_root_path') {
      result.modsRootPath = val;
    } else if (cleanKey === 'launch_mode') {
      // Be lenient: an unknown value falls back to today's behaviour rather
      // than putting the app into a state it cannot recover from.
      if (val === 'modsList' || val === 'lastFile') result.launchMode = val;
    } else if (cleanKey === 'mod_icon_size') {
      const n = parseInt(val, 10);
      if (!isNaN(n)) result.modIconSize = normalizeModIconSize(n);
    } else if (cleanKey === 'sidebar_width') {
      const n = parseInt(val, 10);
      if (!isNaN(n) && n >= 200 && n <= 700) result.sidebarWidth = n;
    } else if (cleanKey === 'console_height') {
      const n = parseInt(val, 10);
      if (!isNaN(n) && n >= 80 && n <= 600) result.consoleHeight = n;
    }
  }
  return result;
}
