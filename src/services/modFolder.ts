// Open / save a mod folder. Desktop app: Tauri dialog + fs plugins.
// Browser: File System Access API (Chromium/Edge only) or local server FS API.

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

export const canOpenFolders = (): boolean => true;

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

let browserRoot: any = null; // FileSystemDirectoryHandle in browser mode

export async function pickFolder(): Promise<string | null> {
  if (isDesktop()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const picked = await open({ directory: true, multiple: false, recursive: true });
    if (!picked || Array.isArray(picked)) return null;
    return picked as string;
  }
  return null;
}

export async function openModFolder(): Promise<OpenedFolder | null> {
  return isDesktop() ? openDesktop() : openBrowser();
}

/**
 * Fallback folder picker using standard HTML5 directory input.
 * Works across all browsers (Chrome, Firefox, Safari, Edge, WebViews, and inside iframes).
 */
function openViaDirectoryInput(): Promise<OpenedFolder | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    (input as any).webkitdirectory = true;
    (input as any).directory = true;
    input.multiple = true;
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.top = '-9999px';
    input.style.opacity = '0';

    let resolved = false;

    input.onchange = async () => {
      resolved = true;
      const fileList = input.files;
      if (!fileList || fileList.length === 0) {
        if (input.parentNode) input.parentNode.removeChild(input);
        resolve(null);
        return;
      }

      const files: Record<string, string> = {};
      let folderName = 'Mod Folder';

      for (let i = 0; i < fileList.length; i++) {
        if (Object.keys(files).length >= MAX_FILES) break;
        const file = fileList[i];
        const rel = file.webkitRelativePath || file.name;
        const parts = rel.split(/[\\/]/);
        if (parts.length > 1 && folderName === 'Mod Folder') {
          folderName = parts[0];
        }
        const innerPath = parts.length > 1 ? parts.slice(1).join('/') : rel;

        // Skip ignored directories
        if (parts.some((p, idx) => idx < parts.length - 1 && SKIP_DIRS.has(p))) {
          continue;
        }

        if (isTextFile(file.name)) {
          try {
            files[innerPath] = await file.text();
          } catch (err) {
            console.warn('Failed to read file:', rel, err);
          }
        }
      }

      if (input.parentNode) input.parentNode.removeChild(input);
      resolve({ name: folderName, root: folderName, files });
    };

    const onFocus = () => {
      window.removeEventListener('focus', onFocus);
      setTimeout(() => {
        if (!resolved) {
          if (input.parentNode) input.parentNode.removeChild(input);
          resolve(null);
        }
      }, 1000);
    };
    window.addEventListener('focus', onFocus);

    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Loads a mod folder directly from a path string without opening a picker.
 * Used for auto-loading on startup and testing configured disk paths.
 */
export async function loadFolderFromPath(rawPath: string): Promise<OpenedFolder | null> {
  const clean = cleanFolderPath(rawPath);
  if (!clean) return null;

  if (isDesktop()) {
    try {
      return await loadDesktopPath(clean);
    } catch (err: any) {
      // If dev server or local Node API is active alongside Tauri, try server fallback
      try {
        const res = await fetch(`/api/fs/scan-folder?path=${encodeURIComponent(clean)}`);
        const data = await res.json();
        if (res.ok && data.success) {
          return {
            name: data.name || baseName(clean),
            root: data.root || clean,
            files: data.files || {},
          };
        }
      } catch {}
      throw err;
    }
  }

  // Web / Server-side fallback: call backend /api/fs/scan-folder
  try {
    const res = await fetch(`/api/fs/scan-folder?path=${encodeURIComponent(clean)}`);
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || `Failed to read directory "${clean}"`);
    }
    return {
      name: data.name || baseName(clean),
      root: data.root || clean,
      files: data.files || {},
    };
  } catch (err: any) {
    throw new Error(err?.message || String(err));
  }
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

async function openBrowser(): Promise<OpenedFolder | null> {
  const w = window as any;
  if (typeof w.showDirectoryPicker === 'function') {
    try {
      const dir = await w.showDirectoryPicker({ mode: 'readwrite' });
      browserRoot = dir;
      const files: Record<string, string> = {};

      const walk = async (handle: any, rel: string) => {
        for await (const [name, child] of handle.entries()) {
          if (Object.keys(files).length >= MAX_FILES) return;
          const relPath = rel ? `${rel}/${name}` : name;
          if (child.kind === 'directory') {
            if (!SKIP_DIRS.has(name)) await walk(child, relPath);
          } else if (isTextFile(name)) {
            files[relPath] = await (await child.getFile()).text();
          }
        }
      };
      await walk(dir, '');
      return { name: dir.name, root: dir.name, files };
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return null; // user clicked cancel in directory picker
      }
      // SecurityError (e.g. cross-origin iframe in web preview) or unsupported: fall through to HTML5 directory input!
    }
  }

  // Cross-browser & iframe fallback using HTML5 webkitdirectory
  return openViaDirectoryInput();
}

export async function saveModFile(root: string, rel: string, content: string): Promise<void> {
  if (isDesktop()) {
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
    return;
  }
  if (browserRoot) {
    const parts = rel.split('/');
    let dir = browserRoot;
    for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p, { create: true });
    const fh = await dir.getFileHandle(parts[parts.length - 1], { create: true });
    const w = await fh.createWritable();
    await w.write(content);
    await w.close();
    return;
  }

  // Server-side FS fallback (for local server mode)
  try {
    const res = await fetch('/api/fs/save-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ root, relPath: rel, content }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.success) return;
    }
  } catch {}

  // Browser download fallback when opened via webkitdirectory input
  try {
    const fileName = rel.split(/[\\/]/).pop() || rel;
    await saveFileAs(fileName, content);
    return;
  } catch (err: any) {
    throw new Error(err?.message || 'Could not save file to disk.');
  }
}

// "Save As": native dialog on desktop, browser download fallback.
export async function saveFileAs(suggestedName: string, content: string): Promise<string | null> {
  if (isDesktop()) {
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
  // Browser fallback: blob download.
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = suggestedName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return suggestedName;
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
export function parseModManifest(toml: string): { id?: string; author?: string; version?: string } {
  const out: { id?: string; author?: string; version?: string } = {};
  // Matches `key = value`, `key="value"` and `[section]` headers alike.
  const re = /^[ \t]*(id|author|author_name|version)[ \t]*=[ \t]*(.+)$/gim;
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
  }
  return out;
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

