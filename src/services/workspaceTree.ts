// The mod workspace model: what a mod folder contains, and which of those files
// the ENGINE actually loads.
//
// Pure and disk-free -- it takes the same `Record<relativePath, contents>` the
// folder loader produces and adds structure. That keeps every rule here testable
// in node, and means the sidebar can never disagree with the startup picker:
// both go through `matchEntryFile` in modFolder.ts.
//
// TWO THINGS THIS DELIBERATELY DOES NOT DO
//
// 1. It does not hide files that the manifest never mentions. `lib/anim.lua`
//    reached only through `require`, `test_*.lua`, and scratch files are all
//    listed, under `lua`, with an empty `componentIds`. The manifest says what
//    the engine STARTS; it does not say what the pack contains, and treating
//    "not an entry" as "not interesting" would make every helper module
//    unreachable from the sidebar.
//
// 2. It does not resolve `require`. That is Phase D in
//    docs/mod-workspace-navigation-plan.md, and guessing at it would put a
//    dependency graph on screen that the engine might disagree with. A file is
//    an entrypoint here for exactly one reason: a `[[components]].entry` (or a
//    v1 top-level `entry`) resolves to it.
//
// NO DISK ACCESS, NO SCANNING OF OTHER MODS. Only the mod the user opened is
// read, and only its text files -- see modFolder.loadDesktopPath. Nothing here
// needs every mod parsed at startup, which is what the earlier worry about
// init cost was really about.

import { baseName, matchEntryFile, parseModManifest } from './modFolder';

export type WorkspaceFileKind = 'lua' | 'profile' | 'manifest' | 'doc';

export interface WorkspaceFile {
  /**
   * The editor's buffer key, EXACTLY as it appears in `files`.
   *
   * Never re-normalised. This string is the tab key, the `openFiles` entry, the
   * `dirtyFiles` key and the argument to `saveModFile`, so rewriting its
   * separators here would silently split one file into two.
   */
  path: string;
  /** Last path segment, for display in a tree. */
  name: string;
  kind: WorkspaceFileKind;
  /** Component ids whose manifest `entry` resolves to this file. Usually empty. */
  componentIds: string[];
}

export interface WorkspaceEntryPoint {
  path: string;
  /**
   * Every component id pointing at this file, in manifest order. Two components
   * may share one Lua file (`tools.shared` / `tools.alias` in mods/tools), and
   * both are shown on the row.
   */
  componentIds: string[];
}

export interface WorkspaceUnresolvedEntry {
  /** The raw manifest value, e.g. `gone.lua`. */
  entry: string;
  componentIds: string[];
}

export interface WorkspaceModel {
  manifestPath: string | null;
  /** `id` from mod.toml, when there is one. */
  id: string | null;
  /** `name` from mod.toml. Bundles with a display name use it; v1 packs do not. */
  name: string | null;
  /** Files the engine loads, in manifest order, deduplicated by file. */
  entryPoints: WorkspaceEntryPoint[];
  /** Declared entries that name a file this folder does not contain. */
  unresolvedEntries: WorkspaceUnresolvedEntry[];
  /** Every `.lua`, including helpers the manifest never mentions. */
  lua: WorkspaceFile[];
  /** Bundled `profiles/*.toml`. */
  profiles: WorkspaceFile[];
  /** A root `mod.toml`, if present. */
  manifestFile: WorkspaceFile | null;
  /** Remaining text files: README.md, docs, JSON, stray TOML. */
  docs: WorkspaceFile[];
  /** Total files considered, matching `Object.keys(files).length`. */
  fileCount: number;
}

/** Forward-slash form used for CLASSIFICATION only -- never for buffer keys. */
function normalized(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

function hasProfilesSegment(p: string): boolean {
  // Bundled profiles live at `profiles/*.toml` in the mod root, but a deeper
  // `foo/profiles/x.toml` is the same concept. Any `profiles` DIRECTORY
  // segment counts; the file itself must not be one, so the last segment is
  // excluded from the check.
  const parts = normalized(p).toLowerCase().split('/');
  return parts.slice(0, -1).includes('profiles');
}

/**
 * Classifies every file in a loaded mod folder and resolves the manifest's
 * declared entrypoints against them.
 */
export function buildWorkspaceModel(files: Record<string, string>): WorkspaceModel {
  const paths = Object.keys(files).sort((a, b) =>
    normalized(a).toLowerCase().localeCompare(normalized(b).toLowerCase())
  );

  const manifestPath =
    paths.find((p) => normalized(p).toLowerCase() === 'mod.toml') ?? null;
  const manifest = manifestPath ? parseModManifest(files[manifestPath]) : null;

  const entryPoints: WorkspaceEntryPoint[] = [];
  const unresolvedEntries: WorkspaceUnresolvedEntry[] = [];

  const addEntry = (rawEntry: string, componentId: string | undefined) => {
    const resolved = matchEntryFile(files, rawEntry);
    const ids = componentId === undefined ? [] : [componentId];
    if (!resolved) {
      // One row per distinct missing path, not one per component that names it.
      const existing = unresolvedEntries.find((u) => u.entry === rawEntry);
      if (existing) {
        for (const id of ids) if (!existing.componentIds.includes(id)) existing.componentIds.push(id);
      } else {
        unresolvedEntries.push({ entry: rawEntry, componentIds: ids });
      }
      return;
    }
    const existing = entryPoints.find((e) => e.path === resolved);
    if (existing) {
      for (const id of ids) if (!existing.componentIds.includes(id)) existing.componentIds.push(id);
    } else {
      // v1 entries have no component id at all; an empty list is honest.
      entryPoints.push({ path: resolved, componentIds: ids });
    }
  };

  if (manifest) {
    for (const c of manifest.components) {
      if (!c.entry) continue;
      addEntry(c.entry, c.id);
    }
    // parseModManifest back-fills `entry` from the first component for
    // back-compat, so its `entry` is only an independent declaration when the
    // manifest has no components at all -- i.e. the v1 single-entry shape.
    if (manifest.components.length === 0 && manifest.entry) {
      addEntry(manifest.entry, undefined);
    }
  }

  const lua: WorkspaceFile[] = [];
  const profiles: WorkspaceFile[] = [];
  const docs: WorkspaceFile[] = [];
  let manifestFile: WorkspaceFile | null = null;

  for (const path of paths) {
    const lower = normalized(path).toLowerCase();
    const file: WorkspaceFile = {
      path,
      name: baseName(path),
      kind: 'doc',
      componentIds: entryPoints.find((e) => e.path === path)?.componentIds ?? [],
    };

    if (lower === 'mod.toml') {
      file.kind = 'manifest';
      manifestFile = file;
    } else if (lower.endsWith('.toml') && hasProfilesSegment(path)) {
      file.kind = 'profile';
      profiles.push(file);
    } else if (lower.endsWith('.lua')) {
      file.kind = 'lua';
      lua.push(file);
    } else {
      docs.push(file);
    }
  }

  return {
    manifestPath,
    id: manifest?.id ?? null,
    name: manifest?.name ?? null,
    entryPoints,
    unresolvedEntries,
    lua,
    profiles,
    manifestFile,
    docs,
    fileCount: paths.length,
  };
}

export interface ModFileListing {
  /**
   * Every `.lua` file, each exactly once: entrypoints first, in manifest order,
   * then everything else alphabetically by path.
   */
  lua: WorkspaceFile[];
  /** Bundled profiles, the manifest, and any other text documents. */
  extras: WorkspaceFile[];
  /** How many of `lua` are entrypoints (the leading run). */
  entryCount: number;
}

/**
 * The flat, ordered file list the mods screen's drill-down shows.
 *
 * Deliberately not the sidebar tree. That view answers "where is this file in
 * the folder"; this one answers "which file do I want to open", so it is one
 * unscrolling list of full mod-relative paths (`lib/holds.lua`), with the files
 * the engine actually starts pulled to the front.
 *
 * Sources every Lua file, not just the declared ones -- a pack whose logic lives
 * in `require`d modules would otherwise offer an empty or misleading list.
 */
export function listModFiles(model: WorkspaceModel): ModFileListing {
  const byPath = new Map(model.lua.map((f) => [f.path, f]));
  const lua: WorkspaceFile[] = [];
  const seen = new Set<string>();
  let entryCount = 0;

  for (const entry of model.entryPoints) {
    const file = byPath.get(entry.path);
    if (!file || seen.has(file.path)) continue;
    seen.add(file.path);
    lua.push(file);
    entryCount++;
  }

  const rest = model.lua
    .filter((f) => !seen.has(f.path))
    .sort((a, b) =>
      normalized(a.path).toLowerCase().localeCompare(normalized(b.path).toLowerCase())
    );

  return {
    lua: [...lua, ...rest],
    extras: [
      ...model.profiles,
      ...(model.manifestFile ? [model.manifestFile] : []),
      ...model.docs,
    ],
    entryCount,
  };
}

/**
 * Whether opening this mod should offer a file choice first.
 *
 * More than one Lua means there is a real decision, and guessing between them is
 * what `startupSelection`'s `ambiguous` flag already warns about. Exactly one
 * Lua (or none) means there is nothing to choose, so the editor opens directly.
 */
export function openMode(model: WorkspaceModel): 'browse' | 'editor' {
  return model.lua.length > 1 ? 'browse' : 'editor';
}

export interface WorkspaceDir {
  type: 'dir';
  name: string;
  /** Normalised path of the directory, used as the collapse-state key. */
  path: string;
  children: WorkspaceNode[];
}

export interface WorkspaceLeaf {
  type: 'file';
  name: string;
  /** The buffer key, unchanged from the input path. */
  path: string;
}

export type WorkspaceNode = WorkspaceDir | WorkspaceLeaf;

type MutableDir = { type: 'dir'; name: string; path: string; children: WorkspaceNode[] };

/** Directories first, then files; each alphabetical, case-insensitive. */
function sortTree(nodes: WorkspaceNode[]): void {
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    const byLower = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    return byLower !== 0 ? byLower : a.name.localeCompare(b.name);
  });
  for (const n of nodes) if (n.type === 'dir') sortTree(n.children);
}

/**
 * Builds a nested tree from buffer keys.
 *
 * Leaf `path` is the exact input string, so a key written with backslashes still
 * saves back to the right place; only the DIRECTORY keys are normalised, and
 * those are never used for disk access.
 */
export function buildFileTree(paths: string[]): WorkspaceNode[] {
  const root: MutableDir = { type: 'dir', name: '', path: '', children: [] };
  const dirs = new Map<string, MutableDir>([['', root]]);
  const seen = new Set<string>();

  for (const raw of paths) {
    const norm = normalized(raw);
    // `Object.keys` cannot repeat, but a caller passing a hand-built list can,
    // and one file must never become two rows.
    if (seen.has(norm)) continue;
    seen.add(norm);

    const parts = norm.split('/').filter(Boolean);
    if (parts.length === 0) continue;

    let prefix = '';
    let parent = root;
    for (let i = 0; i < parts.length; i++) {
      const nextPath = prefix ? `${prefix}/${parts[i]}` : parts[i];
      const isLeaf = i === parts.length - 1;
      if (isLeaf) {
        parent.children.push({ type: 'file', name: parts[i], path: raw });
      } else {
        let dir = dirs.get(nextPath);
        if (!dir) {
          dir = { type: 'dir', name: parts[i], path: nextPath, children: [] };
          dirs.set(nextPath, dir);
          parent.children.push(dir);
        }
        parent = dir;
      }
      prefix = nextPath;
    }
  }

  sortTree(root.children);
  return root.children;
}

/**
 * Keeps only the leaves whose path contains `term`, and the directories that
 * still have a surviving descendant. An empty term returns the tree unchanged.
 */
export function filterFileTree(nodes: WorkspaceNode[], term: string): WorkspaceNode[] {
  const needle = term.trim().toLowerCase();
  if (!needle) return nodes;
  const out: WorkspaceNode[] = [];
  for (const node of nodes) {
    if (node.type === 'file') {
      if (normalized(node.path).toLowerCase().includes(needle)) out.push(node);
    } else {
      const children = filterFileTree(node.children, needle);
      if (children.length > 0) out.push({ ...node, children });
    }
  }
  return out;
}
