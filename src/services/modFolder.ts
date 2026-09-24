// Open / save a mod folder. Desktop app: Tauri dialog + fs plugins.
// Browser: File System Access API (Chromium/Edge only).

const TEXT_EXT = ['.lua', '.toml', '.md', '.txt', '.json'];
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

const isTextFile = (name: string) => TEXT_EXT.some((e) => name.toLowerCase().endsWith(e));
const baseName = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;

let browserRoot: any = null; // FileSystemDirectoryHandle in browser mode

export async function openModFolder(): Promise<OpenedFolder | null> {
  return isDesktop() ? openDesktop() : openBrowser();
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
  if (!browserRoot) throw new Error('No folder is open.');
  const parts = rel.split('/');
  let dir = browserRoot;
  for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p, { create: true });
  const fh = await dir.getFileHandle(parts[parts.length - 1], { create: true });
  const w = await fh.createWritable();
  await w.write(content);
  await w.close();
}
