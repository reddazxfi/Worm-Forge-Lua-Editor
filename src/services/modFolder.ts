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

export const canOpenFolders = (): boolean =>
  isDesktop() || (typeof window !== 'undefined' && 'showDirectoryPicker' in window);

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

export async function openModFolder(): Promise<OpenedFolder | null> {
  return isDesktop() ? openDesktop() : openBrowser();
}

/**
 * Loads a mod folder directly from a path string without opening a picker.
 * Used for auto-loading on startup and testing configured disk paths.
 */
export async function loadFolderFromPath(rawPath: string): Promise<OpenedFolder | null> {
  const clean = cleanFolderPath(rawPath);
  if (!clean) return null;

  if (isDesktop()) {
    return loadDesktopPath(clean);
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

  const walk = async (dir: string, rel: string) => {
    const entries = await readDir(dir);
    for (const e of entries) {
      if (Object.keys(files).length >= MAX_FILES) return;
      const relPath = rel ? `${rel}/${e.name}` : e.name;
      const full = `${dir}/${e.name}`;
      if (e.isDirectory) {
        if (!SKIP_DIRS.has(e.name)) await walk(full, relPath);
      } else if (e.isFile && isTextFile(e.name)) {
        files[relPath] = await readTextFile(full);
      }
    }
  };

  await walk(cleanPath, '');
  return { name: baseName(cleanPath), root: cleanPath, files };
}

async function openDesktop(): Promise<OpenedFolder | null> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const { readDir, readTextFile } = await import('@tauri-apps/plugin-fs');

  const picked = await open({ directory: true, multiple: false, recursive: true });
  if (!picked || Array.isArray(picked)) return null;
  const root = picked as string;
  const files: Record<string, string> = {};

  const walk = async (dir: string, rel: string) => {
    const entries = await readDir(dir);
    for (const e of entries) {
      if (Object.keys(files).length >= MAX_FILES) return;
      const relPath = rel ? `${rel}/${e.name}` : e.name;
      const full = `${dir}/${e.name}`;
      if (e.isDirectory) {
        if (!SKIP_DIRS.has(e.name)) await walk(full, relPath);
      } else if (e.isFile && isTextFile(e.name)) {
        files[relPath] = await readTextFile(full);
      }
    }
  };
  await walk(root, '');
  return { name: baseName(root), root, files };
}

async function openBrowser(): Promise<OpenedFolder | null> {
  const w = window as any;
  if (!w.showDirectoryPicker) {
    throw new Error('This browser cannot open folders. Use Chrome/Edge or the desktop app.');
  }
  let dir: any;
  try {
    dir = await w.showDirectoryPicker({ mode: 'readwrite' });
  } catch {
    return null; // user cancelled
  }
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
}

export async function saveModFile(root: string, rel: string, content: string): Promise<void> {
  if (isDesktop()) {
    const { writeTextFile, mkdir } = await import('@tauri-apps/plugin-fs');
    const parts = rel.split('/');
    if (parts.length > 1) {
      try {
        await mkdir(`${root}/${parts.slice(0, -1).join('/')}`, { recursive: true });
      } catch {}
    }
    await writeTextFile(`${root}/${rel}`, content);
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
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Server save failed');
    }
  } catch (err: any) {
    throw new Error(err?.message || 'No folder is open.');
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
