// Open / save a mod folder. DESKTOP ONLY, via the Tauri dialog + fs plugins.
//
// The browser paths that used to live here (File System Access API, the HTML5
// webkitdirectory input, an anchor-download write-back, and the Express
// /api/fs/* endpoints) are all gone. They could read a folder but never wrote
// back to the one the user picked, so "saved" work quietly landed in Downloads.
// An honest refusal is better than a save that goes somewhere else.

const TEXT_EXT = ['.lua', '.toml', '.md', '.txt', '.json', '.ini'];
const SKIP_DIRS = new Set(['.git', 'node_modules', 'target', 'dist', '.vscode']);
const MAX_FILES = 500;

export interface OpenedFolder {
  name: string;
  root: string;
  files: Record<string, string>;
}

export const isDesktop = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const isTextFile = (name: string) => TEXT_EXT.some((e) => name.toLowerCase().endsWith(e));
export const baseName = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;

/**
 * Normalizes input folder paths:
 * Strips wrapping double or single quotes, trims whitespace, removes trailing slashes.
 * e.g. '"D:\Worms Armageddon\Mods"' -> 'D:\Worms Armageddon\Mods'
 */
export function cleanFolderPath(p: string): string {
  if (!p) return '';
  return p.trim().replace(/^["']|["']$/g, '').trim().replace(/[\\/]+$/, '');
}

export async function pickFolder(): Promise<string | null> {
  if (!isDesktop()) return null;
  const { open } = await import('@tauri-apps/plugin-dialog');
  const picked = await open({ directory: true, multiple: false, recursive: true });
  if (!picked || Array.isArray(picked)) return null;
  return picked as string;
}

export async function openModFolder(): Promise<OpenedFolder | null> {
  if (!isDesktop()) {
    // Desktop-only, deliberately. The browser paths this replaces (File System
    // Access API, the HTML5 webkitdirectory input, the anchor-download write-back)
    // could read a folder but never reliably write back to the one the user
    // picked -- `saveModFile` in a browser silently downloaded to Downloads
    // instead. That asymmetry is worse than an honest refusal.
    throw new Error('Opening a mod folder is only available in the desktop app.');
  }
  return openDesktop();
}

/**
 * Loads a mod folder directly from a path string without opening a picker.
 * Used for auto-loading on startup and testing configured disk paths.
 */
export async function loadFolderFromPath(rawPath: string): Promise<OpenedFolder | null> {
  const clean = cleanFolderPath(rawPath);
  if (!clean) return null;

  if (!isDesktop()) {
    // The old /api/fs/scan-folder endpoint is gone (see server.ts). There is no
    // browser path left, so say so plainly -- returning null here used to look
    // like "that folder simply has no files", which silently broke startup
    // auto-open instead of reporting a real reason.
    throw new Error(
      'Opening a folder by path is only available in the desktop app. Use "Open Folder" there, or configure an Auto-Open path in the desktop build.'
    );
  }

  return loadDesktopPath(clean);
}

async function loadDesktopPath(cleanPath: string): Promise<OpenedFolder> {
  const { readDir, readTextFile } = await import('@tauri-apps/plugin-fs');
  const files: Record<string, string> = {};

  const isWin = cleanPath.includes('\\') || /^[a-zA-Z]:/.test(cleanPath);
  const sep = isWin ? '\\' : '/';
  const normalizedRoot = isWin
    ? cleanPath.replace(/\//g, '\\').replace(/\\+$/, '')
    : cleanPath.replace(/\\/g, '/').replace(/\/+$/, '');

  const walk = async (dir: string, rel: string) => {
    const entries = await readDir(dir);
    for (const e of entries) {
      if (Object.keys(files).length >= MAX_FILES) return;
      const relPath = rel ? `${rel}/${e.name}` : e.name;
      const full = `${dir}${sep}${e.name}`;
      if (e.isDirectory) {
        if (!SKIP_DIRS.has(e.name)) await walk(full, relPath);
      } else if (e.isFile && isTextFile(e.name)) {
        files[relPath] = await readTextFile(full);
      }
    }
  };

  await walk(normalizedRoot, '');
  return { name: baseName(normalizedRoot), root: normalizedRoot, files };
}

async function openDesktop(): Promise<OpenedFolder | null> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const { readDir, readTextFile } = await import('@tauri-apps/plugin-fs');

  const picked = await open({ directory: true, multiple: false, recursive: true });
  if (!picked || Array.isArray(picked)) return null;
  const root = picked as string;
  const files: Record<string, string> = {};

  const isWin = root.includes('\\') || /^[a-zA-Z]:/.test(root);
  const sep = isWin ? '\\' : '/';
  const normalizedRoot = isWin
    ? root.replace(/\//g, '\\').replace(/\\+$/, '')
    : root.replace(/\\/g, '/').replace(/\/+$/, '');

  const walk = async (dir: string, rel: string) => {
    const entries = await readDir(dir);
    for (const e of entries) {
      if (Object.keys(files).length >= MAX_FILES) return;
      const relPath = rel ? `${rel}/${e.name}` : e.name;
      const full = `${dir}${sep}${e.name}`;
      if (e.isDirectory) {
        if (!SKIP_DIRS.has(e.name)) await walk(full, relPath);
      } else if (e.isFile && isTextFile(e.name)) {
        files[relPath] = await readTextFile(full);
      }
    }
  };
  await walk(normalizedRoot, '');
  return { name: baseName(normalizedRoot), root: normalizedRoot, files };
}

export async function saveModFile(root: string, rel: string, content: string): Promise<void> {
  if (!isDesktop()) {
    // No browser fallback remains: /api/fs/save-file is gone (see server.ts), and
    // the FileSystem Access + download paths it replaced could not write back to
    // the folder the user picked anyway. Say so instead of silently doing nothing.
    throw new Error('Saving to disk is only available in the desktop app. Use "Save As" there.');
  }

  const { writeTextFile, mkdir } = await import('@tauri-apps/plugin-fs');
  const isWin = root.includes('\\') || /^[a-zA-Z]:/.test(root);
  const sep = isWin ? '\\' : '/';
  const normalizedRoot = isWin
    ? root.replace(/\//g, '\\').replace(/\\+$/, '')
    : root.replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = rel.split('/');
  if (parts.length > 1) {
    const sub = isWin ? parts.slice(0, -1).join('\\') : parts.slice(0, -1).join('/');
    const fullSub = `${normalizedRoot}${sep}${sub}`;
    try {
      await mkdir(fullSub, { recursive: true });
    } catch {}
  }
  const fullFile = isWin
    ? `${normalizedRoot}\\${parts.join('\\')}`
    : `${normalizedRoot}/${rel}`;
  await writeTextFile(fullFile, content);
}

// "Save As": native dialog, desktop only.
export async function saveFileAs(suggestedName: string, content: string): Promise<string | null> {
  if (!isDesktop()) {
    throw new Error('"Save As" is only available in the desktop app.');
  }
  const { save } = await import('@tauri-apps/plugin-dialog');
  const { writeTextFile } = await import('@tauri-apps/plugin-fs');
  const ext = suggestedName.includes('.') ? suggestedName.split('.').pop() : undefined;
  const path = await save({
    defaultPath: suggestedName,
    filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : undefined,
  });
  if (!path) return null; // user cancelled
  await writeTextFile(path, content);
  return path;
}

/**
 * Slugifies a human mod name into a safe folder name:
 * lowercase, spaces to underscores, strip anything outside [a-z0-9_].
 * Falls back to 'new_mod' if the input contains nothing usable.
 */
export function slugifyModName(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/^_+|_+$/g, '');
  return slug.length > 0 ? slug : 'new_mod';
}

/**
 * Creates a new mod folder under `rootPath` and returns its absolute path.
 *
 * Deliberately reuses saveModFile() rather than adding a second write path -
 * it already performs the recursive mkdir for nested relative paths.
 * Writes the full mod.toml skeleton the engine expects (id / version / author /
 * api_version / entry / debug_worm_state plus the [weapons] table), and names
 * the entry .lua after the `entry` field so the two agree. No icon file is
 * generated.
 */
/**
 * Writes the full manifest skeleton WormForge expects. Field order and the
 * `[weapons]` table mirror a real mod.toml; `entry` names the Lua file created
 * alongside it, so the two must stay in sync.
 */
function buildModManifest(id: string, author: string, entryLuaName: string): string {
  return `id = "${id}"
version = "1.0.0"
author = "${author}"
api_version = 1
entry = "${entryLuaName}"
debug_worm_state = false

[weapons]
register = []
replace = []
`;
}

export async function createModFolder(
  rootPath: string,
  modName: string,
  author: string
): Promise<string> {
  const clean = cleanFolderPath(rootPath);
  if (!clean) throw new Error('No mods folder configured.');

  const slug = slugifyModName(modName);
  // The manifest's `entry` field and the file on disk must agree, so the name
  // is defined once and used for both.
  const entryLuaName = 'mod.lua';

  const isWin = clean.includes('\\') || /^[a-zA-Z]:/.test(clean);
  const sep = isWin ? '\\' : '/';
  const normalizedRoot = isWin
    ? clean.replace(/\//g, '\\').replace(/\\+$/, '')
    : clean.replace(/\\/g, '/').replace(/\/+$/, '');

  const manifest = buildModManifest(slug, author, entryLuaName);

  const entryLua = `-- ${modName}
-- by ${author}
-- Entry file for this mod. Referenced by mod.toml as entry = "${entryLuaName}".

function onModLoad()
end
`;

  await saveModFile(normalizedRoot, `${slug}/mod.toml`, manifest);
  await saveModFile(normalizedRoot, `${slug}/${entryLuaName}`, entryLua);

  return `${normalizedRoot}${sep}${slug}`;
}

// ---------------------------------------------------------------------------
// Mods-list launch screen support.
//
// Additive only: nothing above is renamed or restructured. The existing
// loadFolderFromPath() walks a whole tree and returns every TEXT file, which
// cannot express "list the mod folders here" (it gives no directory boundary,
// no mtime, and cannot read a binary icon). So this adds the one thing the
// mods-list screen needs and nothing else.
//
// DESKTOP ONLY. The browser has no API for listing an arbitrary disk path
// without a user picker, so listModEntries() returns null there and callers
// must not offer the feature.
// ---------------------------------------------------------------------------

export interface ModListEntry {
  /** Folder name of the mod, e.g. "livehp". */
  folderName: string;
  /** Absolute path to the mod folder. */
  path: string;
  /** `id` from mod.toml, else the folder name. */
  id: string;
  author: string;
  version: string;
  /** data: URL for mod_icon.png, or null when absent/unreadable. */
  iconUrl: string | null;
  /** Folder mtime; null when the filesystem did not report one. */
  mtime: number | null;
}

/**
 * Best-effort read of the three fields we care about out of a mod.toml.
 * Intentionally tolerant: a missing or malformed field yields a placeholder
 * rather than throwing, so one bad manifest cannot break the whole grid.
 */
export function parseModManifest(toml: string): {
  id?: string;
  author?: string;
  version?: string;
  entry?: string;
} {
  const out: { id?: string; author?: string; version?: string; entry?: string } = {};
  // Matches `key = value`, `key="value"` and `[section]` headers alike.
  // `entry` is here because it is the field that decides WHICH FILE OPENS FIRST
  // (see pickStartupFile). First match wins throughout, so on a bundle -- whose
  // `[[components]]` blocks each carry their own `entry` -- this is the first
  // component's entry. That is still a real, engine-loaded Lua file, which beats
  // "whatever sorts first in the alphabet".
  const re = /^[ \t]*(id|author|author_name|version|entry)[ \t]*=[ \t]*(.+)$/gim;
  let m: RegExpExecArray | null;
  while ((m = re.exec(toml)) !== null) {
    const key = m[1].toLowerCase();
    let val = m[2].trim();
    // Strip trailing inline comment and surrounding quotes.
    const hash = val.indexOf('#');
    if (hash !== -1) val = val.slice(0, hash).trim();
    val = val.replace(/^["']/, '').replace(/["']$/, '').trim();
    if (!val) continue;
    if (key === 'id' && !out.id) out.id = val;
    else if ((key === 'author' || key === 'author_name') && !out.author) out.author = val;
    else if (key === 'version' && !out.version) out.version = val;
    else if (key === 'entry' && !out.entry) out.entry = val;
  }
  return out;
}

/**
 * The file `mod.toml` points at with `entry`, matched against the real file keys,
 * or null when there is no usable answer.
 *
 * Matching is layered because `entry` is written relative to the mod root and the
 * keys are relative paths with forward slashes, so the obvious shapes differ:
 *
 *   1. exact key           entry = "rules.lua"       -> "rules.lua"
 *   2. trailing path       entry = "lib/anim.lua"   -> "lib/anim.lua"
 *   3. basename anywhere   entry = "rules.lua"      -> "weapons/rules.lua"
 *
 * All three are case-insensitive and tolerate backslashes in the manifest.
 */
export function declaredEntryFile(files: Record<string, string>): string | null {
  const keys = Object.keys(files);
  const tomlKey = keys.find((k) => baseName(k).toLowerCase() === 'mod.toml');
  if (!tomlKey) return null;

  const entry = parseModManifest(files[tomlKey]).entry;
  if (!entry) return null;

  const want = entry.replace(/\\/g, '/').replace(/^\.\//, '').trim().toLowerCase();
  if (!want) return null;

  const norm = (k: string) => k.replace(/\\/g, '/').toLowerCase();

  const byKey = keys.find((k) => norm(k) === want);
  if (byKey) return byKey;

  const byPath = keys.find((k) => norm(k).endsWith(`/${want}`));
  if (byPath) return byPath;

  const base = baseName(want);
  return keys.find((k) => baseName(k).toLowerCase() === base) ?? null;
}

/**
 * Which file in a freshly-opened folder should be shown first.
 *
 * THE MANIFEST DECIDES, not the alphabet. `mod.toml` declares
 * `entry = "rules.lua"`, and that is the file the engine actually loads. The
 * previous behaviour -- "the first `.lua` in sorted order" -- opened whatever
 * happened to sort first, which in the user's highlander pack was a scratch file
 * (`highlander1asdasd.lua`) instead of `rules.lua`.
 *
 * Falls back, in order: the declared entry, then the first `.lua` in sorted order
 * (so a folder with no mod.toml still opens something sensible), then the first
 * file at all. Null only when the folder is empty.
 */
export function pickStartupFile(files: Record<string, string>): string | null {
  const names = Object.keys(files).sort();
  if (names.length === 0) return null;

  const declared = declaredEntryFile(files);
  if (declared) return declared;

  return names.find((n) => n.toLowerCase().endsWith('.lua')) ?? names[0];
}

/**
 * Lists the immediate subfolders of `rootPath` that look like mods (contain a
 * mod.toml). Does NOT recurse: a mod's own sprites/sounds subfolders are
 * ignored on purpose.
 *
 * Returns null when unsupported (browser) or when the path cannot be read.
 * Per-mod failures are skipped, not fatal, so a single unreadable mod does not
 * blank the screen.
 */
export async function listModEntries(rootPath: string): Promise<ModListEntry[] | null> {
  if (!isDesktop()) return null;
  const clean = cleanFolderPath(rootPath);
  if (!clean) return null;

  try {
    const { readDir, stat, readTextFile, readFile, exists } = await import('@tauri-apps/plugin-fs');

    const isWin = clean.includes('\\') || /^[a-zA-Z]:/.test(clean);
    const sep = isWin ? '\\' : '/';
    const normalizedRoot = isWin
      ? clean.replace(/\//g, '\\').replace(/\\+$/, '')
      : clean.replace(/\\/g, '/').replace(/\/+$/, '');

    const dirEntries = await readDir(normalizedRoot);
    const out: ModListEntry[] = [];

    for (const e of dirEntries) {
      if (!e.isDirectory) continue;
      const modPath = `${normalizedRoot}${sep}${e.name}`;

      try {
        // A mod must have mod.toml to count as one.
        const manifestPath = `${modPath}${sep}mod.toml`;
        if (!(await exists(manifestPath))) continue;

        let id = e.name;
        let author = 'Unknown';
        let version = 'Unknown';
        try {
          const parsed = parseModManifest(await readTextFile(manifestPath));
          if (parsed.id) id = parsed.id;
          if (parsed.author) author = parsed.author;
          if (parsed.version) version = parsed.version;
        } catch {
          // Keep placeholders; the mod is still listed.
        }

        let iconUrl: string | null = null;
        try {
          const iconPath = `${modPath}${sep}mod_icon.png`;
          if (await exists(iconPath)) {
            const bytes = await readFile(iconPath);
            // Cap icon size: a data URL for a huge PNG would bloat memory and
            // DOM. Anything larger simply falls back to the placeholder icon.
            if (bytes.byteLength > 0 && bytes.byteLength <= 4 * 1024 * 1024) {
              // Copy into a fresh ArrayBuffer: the Uint8Array view may sit in a
              // larger pooled buffer, which would encode garbage after the end.
              const buf = new ArrayBuffer(bytes.byteLength);
              const view = new Uint8Array(buf);
              view.set(bytes);
              // Chunked so a large icon cannot blow the argument limit of
              // String.fromCharCode(...spread).
              let bin = '';
              const CHUNK = 0x8000;
              for (let i = 0; i < view.length; i += CHUNK) {
                bin += String.fromCharCode(...view.subarray(i, i + CHUNK));
              }
              iconUrl = `data:image/png;base64,${btoa(bin)}`;
            }
          }
        } catch {
          iconUrl = null;
        }

        let mtime: number | null = null;
        try {
          const info = await stat(modPath);
          mtime = info.mtime ? new Date(info.mtime).getTime() : null;
        } catch {
          mtime = null;
        }

        out.push({ folderName: e.name, path: modPath, id, author, version, iconUrl, mtime });
      } catch {
        // Unreadable mod (permissions, vanished mid-scan) - skip it.
      }
    }

    return out;
  } catch {
    return null;
  }
}

