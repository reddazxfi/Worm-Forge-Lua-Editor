export interface EditorConfig {
  theme: 'dark' | 'light';
  fontSize: number; // px, e.g. 11, 12, 13, 14, 16, 18
  lineHeight: number; // relative, e.g. 1.3, 1.5, 1.8
  autoLoadFolder: string; // custom directory path
  autoLoadModId: string; // mod id to load on startup (e.g. "gameplay.highlander_full", "gameplay.kill_the_king", "")
  // Folder containing one subfolder per mod, used by the mods-list launch screen.
  // Empty = feature off.
  modsRootPath: string;
  // What happens on startup. 'lastFile' is today's behaviour; 'modsList' shows
  // the mods grid instead of resuming. 'modsList' is desktop-only (see
  // listModEntries) and is hidden from the UI in the browser.
  launchMode: 'lastFile' | 'modsList';
  sidebarWidth: number; // px, e.g. 340
  treeHeightPercent: number; // %, e.g. 58
  consoleHeight: number; // px, e.g. 230
}

export const DEFAULT_CONFIG: EditorConfig = {
  theme: 'dark',
  fontSize: 13,
  lineHeight: 1.5,
  autoLoadFolder: '',
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
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(cfg: EditorConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch (e) {
    console.error('Failed to save WormForge config:', e);
  }
}

export function exportConfigAsIni(cfg: EditorConfig): string {
  return `; WormForge Code Editor Configuration
[Editor]
theme = ${cfg.theme}
font_size = ${cfg.fontSize}
line_height = ${cfg.lineHeight}

[Startup]
auto_load_mod = ${cfg.autoLoadModId || 'none'}
auto_load_folder = ${cfg.autoLoadFolder || ''}
launch_mode = ${cfg.launchMode}
mods_root_path = ${cfg.modsRootPath || ''}

[Layout]
sidebar_width = ${cfg.sidebarWidth}
tree_height_percent = ${cfg.treeHeightPercent}
console_height = ${cfg.consoleHeight}
`;
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
    } else if (cleanKey === 'font_size') {
      const n = parseInt(val, 10);
      if (!isNaN(n) && n >= 10 && n <= 28) result.fontSize = n;
    } else if (cleanKey === 'line_height') {
      const f = parseFloat(val);
      if (!isNaN(f) && f >= 1.0 && f <= 3.0) result.lineHeight = f;
    } else if (cleanKey === 'auto_load_mod') {
      result.autoLoadModId = val === 'none' ? '' : val;
    } else if (cleanKey === 'auto_load_folder') {
      result.autoLoadFolder = val;
    } else if (cleanKey === 'mods_root_path') {
      result.modsRootPath = val;
    } else if (cleanKey === 'launch_mode') {
      // Be lenient: an unknown value falls back to today's behaviour rather
      // than putting the app into a state it cannot recover from.
      if (val === 'modsList' || val === 'lastFile') result.launchMode = val;
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
