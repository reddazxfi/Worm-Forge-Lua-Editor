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
// A junction/symlink that points back up the tree looks like an ordinary
// directory to readDir(), and it never adds a FILE, so MAX_FILES cannot stop
// it. The path would grow until the OS path limit threw, after a long walk.
// Real mods are a handful of levels deep; 32 is far past anything legitimate.
const MAX_DEPTH = 32;
// A mistyped auto-open path (`C:\` instead of `C:\...\Mods`) would otherwise
// walk every directory on the drive. The byte/file caps stop the READS, but a
// tree of empty directories still costs thousands of readDir calls. 5000 is
// far beyond any real mod folder.
const MAX_DIRS = 5000;
// Opening a folder reads every text file into memory and into React state.
// A stray multi-hundred-MB .txt (or a folder of them) would freeze the window
// before the file COUNT cap ever triggers. Lua mods are kilobytes; 8 MB for a
// single file and 32 MB for the whole folder are generous ceilings that only
// trip on something pathological.
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;

export interface OpenedFolder {
  name: string;
  root: string;
  files: Record<string, string>;
}

export const isDesktop = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const isTextFile = (name: string) => TEXT_EXT.some((e) => name.toLowerCase().endsWith(e));

/**
 * Whether the checker should run on this file.
 *
 * Deliberately an allow-list (`.lua`) rather than the old deny-list of known
 * non-Lua text extensions. The deny-list meant `notes.py`, `scheme.dat`, or any
 * extension added to TEXT_EXT later would be handed to the Lua 5.4 compiler and
 * to full_moon as though it were source, which reports a syntax error on the
 * first line of a perfectly valid non-Lua document. The engine only ever loads
 * `.lua`, so only `.lua` is checked.
 */
export const isLuaFile = (name: string) => name.toLowerCase().endsWith('.lua');
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
  const { readDir, readTextFile, stat } = await import('@tauri-apps/plugin-fs');
  const files: Record<string, string> = {};
  let totalBytes = 0;
  let dirsSeen = 0;

  const isWin = cleanPath.includes('\\') || /^[a-zA-Z]:/.test(cleanPath);
  const sep = isWin ? '\\' : '/';
  const normalizedRoot = isWin
    ? cleanPath.replace(/\//g, '\\').replace(/\\+$/, '')
    : cleanPath.replace(/\\/g, '/').replace(/\/+$/, '');

  const walk = async (dir: string, rel: string, depth: number) => {
    if (depth > MAX_DEPTH || dirsSeen >= MAX_DIRS) return;
    dirsSeen++;
    const entries = await readDir(dir);
    for (const e of entries) {
      if (Object.keys(files).length >= MAX_FILES) return;
      const relPath = rel ? `${rel}/${e.name}` : e.name;
      const full = `${dir}${sep}${e.name}`;
      if (e.isDirectory) {
        if (!SKIP_DIRS.has(e.name)) await walk(full, relPath, depth + 1);
      } else if (e.isFile && isTextFile(e.name)) {
        try {
          const info = await stat(full);
          const size = typeof info.size === 'number' ? info.size : 0;
          if (size > MAX_FILE_BYTES || totalBytes + size > MAX_TOTAL_BYTES) continue;
          const content = await readTextFile(full);
          totalBytes += size || content.length;
          files[relPath] = content;
        } catch {
          // One unreadable file (locked, permissions) must not sink the whole
          // folder open. The tree simply does not list it.
        }
      }
    }
  };

  await walk(normalizedRoot, '', 0);
  return { name: baseName(normalizedRoot), root: normalizedRoot, files };
}

async function openDesktop(): Promise<OpenedFolder | null> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const { readDir, readTextFile, stat } = await import('@tauri-apps/plugin-fs');

  const picked = await open({ directory: true, multiple: false, recursive: true });
  if (!picked || Array.isArray(picked)) return null;
  const root = picked as string;
  const files: Record<string, string> = {};
  let totalBytes = 0;
  let dirsSeen = 0;

  const isWin = root.includes('\\') || /^[a-zA-Z]:/.test(root);
  const sep = isWin ? '\\' : '/';
  const normalizedRoot = isWin
    ? root.replace(/\//g, '\\').replace(/\\+$/, '')
    : root.replace(/\\/g, '/').replace(/\/+$/, '');

  const walk = async (dir: string, rel: string, depth: number) => {
    if (depth > MAX_DEPTH || dirsSeen >= MAX_DIRS) return;
    dirsSeen++;
    const entries = await readDir(dir);
    for (const e of entries) {
      if (Object.keys(files).length >= MAX_FILES) return;
      const relPath = rel ? `${rel}/${e.name}` : e.name;
      const full = `${dir}${sep}${e.name}`;
      if (e.isDirectory) {
        if (!SKIP_DIRS.has(e.name)) await walk(full, relPath, depth + 1);
      } else if (e.isFile && isTextFile(e.name)) {
        try {
          const info = await stat(full);
          const size = typeof info.size === 'number' ? info.size : 0;
          if (size > MAX_FILE_BYTES || totalBytes + size > MAX_TOTAL_BYTES) continue;
          const content = await readTextFile(full);
          totalBytes += size || content.length;
          files[relPath] = content;
        } catch {
          // One unreadable file (locked, permissions) must not sink the whole
          // folder open. The tree simply does not list it.
        }
      }
    }
  };
  await walk(normalizedRoot, '', 0);
  return { name: baseName(normalizedRoot), root: normalizedRoot, files };
}

/**
 * True when `rel` names a file INSIDE the mod folder.
 *
 * The workspace tree only ever produces names like `lib/anim.lua`, but a
 * manifest's `entry` also reaches saveModFile: a declared-but-missing file is
 * listed and can be created by typing into it. A malformed
 * `entry = "../../evil.lua"` must not be able to write outside the folder the
 * user picked. Backslashes are accepted (and normalised by the caller);
 * absolute paths, drive letters, UNC prefixes and `..` segments are not.
 */
export function isSafeModRelativePath(rel: string): boolean {
  if (!rel || rel.startsWith('/') || rel.startsWith('\\')) return false;
  if (/^[a-zA-Z]:/.test(rel)) return false;
  const parts = rel.split(/[\\/]+/);
  return parts.every((p) => p !== '' && p !== '.' && p !== '..');
}

export async function saveModFile(root: string, rel: string, content: string): Promise<void> {
  if (!isDesktop()) {
    // No browser fallback remains: /api/fs/save-file is gone (see server.ts), and
    // the FileSystem Access + download paths it replaced could not write back to
    // the folder the user picked anyway. Say so instead of silently doing nothing.
    throw new Error('Saving to disk is only available in the desktop app. Use "Save As" there.');
  }
  if (!isSafeModRelativePath(rel)) {
    throw new Error(
      `Refusing to save "${rel}": the path must stay inside the mod folder (no "..", no absolute paths).`
    );
  }

  const { writeTextFile, mkdir } = await import('@tauri-apps/plugin-fs');
  const isWin = root.includes('\\') || /^[a-zA-Z]:/.test(root);
  const sep = isWin ? '\\' : '/';
  const normalizedRoot = isWin
    ? root.replace(/\//g, '\\').replace(/\\+$/, '')
    : root.replace(/\\/g, '/').replace(/\/+$/, '');
  // One split for both separators, so a Windows-authored manifest that writes
  // `lib\anim.lua` resolves to the same file the tree lists as `lib/anim.lua`.
  const parts = rel.split(/[\\/]+/);
  if (parts.length > 1) {
    const fullSub = `${normalizedRoot}${sep}${parts.slice(0, -1).join(sep)}`;
    try {
      await mkdir(fullSub, { recursive: true });
    } catch {}
  }
  const fullFile = `${normalizedRoot}${sep}${parts.join(sep)}`;
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
 * Writes THREE files, because a manifest alone is not a usable mod any more:
 *
 *   mod.toml              a format_version 2 bundle with one feature component
 *   mod.lua               that component's entry, returning its install function
 *   profiles/<Name>.toml  a bundled profile that selects the component
 *
 * Deliberately reuses saveModFile() rather than adding a second write path - it
 * already performs the recursive mkdir for nested relative paths. No icon file
 * is generated.
 */
/**
 * The profile filename for a new mod.
 *
 * The name is player-facing (it is what the profile list shows), so it keeps the
 * user's capitalisation and spaces -- `mods/tools` ships "Audit home.toml". It
 * is normalised only where the engine refuses it:
 * `crates/weapons/src/components.rs` `profile_name_problem` rejects `/\:*?"<>|`,
 * control characters, a trailing dot, and anything over 60 characters.
 *
 * Falls back to the slug when nothing usable is left, so a mod named "???"
 * still gets a profile rather than a `???.toml` the engine would skip.
 */
export function profileFileName(modName: string, fallback: string): string {
  const cleaned = modName
    .replace(/[\\/:*?"<>|]/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[.\s]+$/, '')
    .trim()
    .slice(0, 60)
    .trim();
  return cleaned || fallback;
}

/**
 * Quotes a value for TOML, escaping what would otherwise end the string early.
 *
 * `modName` and `author` are free text from the modal, so `0rang3 "the" mod` or
 * a backslash in a Windows author name used to produce a `mod.toml` that does
 * not parse -- a brand-new mod that the editor cannot even read back.
 */
export function tomlString(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
  return `"${escaped}"`;
}

/**
 * Writes the bundle manifest for a new mod.
 *
 * `format_version = 2` plus one `[[components]]` feature, because that is the
 * only shape a profile can select. A v1 manifest (`entry = "mod.lua"`) has no
 * component id, so a profile could not reference it and the "create a mod"
 * flow could not ship one.
 *
 * `api_version = 4` is not cosmetic: the engine rejects anything else
 * (`crates/weapons/src/components.rs:340`, "api_version {n} is not supported").
 *
 * No top-level `entry` and no `[weapons]` table: `BundleManifest` is
 * `#[serde(deny_unknown_fields)]`, so those v1 keys make the whole bundle fail
 * to parse rather than being ignored.
 *
 * Exported so the tests can pin the exact text a new mod gets.
 */
export function buildModManifest(
  id: string,
  name: string,
  author: string,
  entryLuaName: string
): string {
  const componentId = `${id}.main`;
  return `id = ${tomlString(id)}
name = ${tomlString(name)}
version = "0.1.0"
author = ${tomlString(author)}
api_version = 4
format_version = 2
debug_worm_state = false

[[components]]
id = "${componentId}"
type = "feature"
name = ${tomlString(name)}
description = ${tomlString(`${name} entry point.`)}
entry = "${entryLuaName}"
`;
}

/**
 * Writes the bundled profile that switches a new mod on.
 *
 * `features` names the component from `buildModManifest`; with no `[weapons]`
 * table the profile keeps the resolved scheme's own weapon panel, which is the
 * right default for an add-on. The engine copies this file into
 * `WormForge/Profiles/` when the pack is installed
 * (`adopt_profiles`, `crates/weapons/src/components.rs:1446`) and never
 * overwrites an existing profile of the same name.
 */
export function buildModProfile(name: string, componentId: string): string {
  return `description = ${tomlString(
    `${name}: ${componentId}, over the scheme's own weapons.`
  )}
features = ["${componentId}"]
`;
}

/** The install function every feature component's entry file must return. */
export function buildModEntryLua(name: string, author: string, componentId: string): string {
  // A newline in the mod name would end the `--` comment and turn the rest of
  // the name into Lua source, so both free-text fields are flattened to one line.
  const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').replace(/--/g, ' - ');
  return `-- ${oneLine(name)}
-- by ${oneLine(author)}
-- Entry file for this mod. mod.toml declares it as the ${componentId} feature,
-- and the bundled profile in profiles/ switches that feature on.
--
-- A feature's file is loaded with require() and MUST return its install
-- function, or a table { install = ... }. Nothing calls this by itself: the
-- engine calls it once per round when the profile selects the component.
return function(ctx)
  -- ctx.options holds this feature's values from the profile. Declare them in
  -- mod.toml under [[components.options]] to have the loader show a form for it.
  wa.log("${componentId} installed")
end
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
  const componentId = `${slug}.main`;

  const isWin = clean.includes('\\') || /^[a-zA-Z]:/.test(clean);
  const sep = isWin ? '\\' : '/';
  const normalizedRoot = isWin
    ? clean.replace(/\//g, '\\').replace(/\\+$/, '')
    : clean.replace(/\\/g, '/').replace(/\/+$/, '');

  const manifest = buildModManifest(slug, modName, author, entryLuaName);
  const entryLua = buildModEntryLua(modName, author, componentId);
  const profile = buildModProfile(modName, componentId);
  const profileRel = `profiles/${profileFileName(modName, slug)}.toml`;

  await saveModFile(normalizedRoot, `${slug}/mod.toml`, manifest);
  await saveModFile(normalizedRoot, `${slug}/${entryLuaName}`, entryLua);
  // The profile is what makes the component run; without it the bundle installs
  // and nothing is ever selected.
  await saveModFile(normalizedRoot, `${slug}/${profileRel}`, profile);

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
  /**
   * Components the manifest declares, read from the SAME parse that produced
   * `id`/`author` above -- so a profile's `features` can be resolved to a file
   * without scanning every mod a second time.
   */
  components: ComponentEntry[];
  /**
   * File stems of `profiles/*.toml` inside the mod, e.g. ["Highlander"].
   *
   * Only names, and only for comparing against the INSTALLED profile of the
   * same name. The loader copies a bundled profile into `WormForge/Profiles` at
   * install time and never overwrites one that exists, so the two may have
   * diverged; nothing here may present them as the same file.
   */
  bundledProfiles: string[];
}

/**
 * A single component declared inside a `[[components]]` block of a bundle
 * manifest. Multiple components may share the same Lua entry file.
 */
export interface ComponentEntry {
  /** Component id, e.g. `tools.hello`. May be absent on malformed manifests. */
  id?: string;
  /** Component type, e.g. `feature`, `audit`, `weapon`. */
  type?: string;
  /** Resolved mod-relative path to the component's Lua entrypoint. */
  entry?: string;
}

/**
 * Best-effort read of a mod.toml manifest.
 * Intentionally tolerant: a missing or malformed field yields a placeholder
 * rather than throwing, so one bad manifest cannot break the whole grid.
 *
 * The reader is section-aware: top-level `id`/`name`/`author`/`version`/`entry`
 * are read from outside any table, while `[[components]]` blocks each contribute
 * a component entry with its own `id`/`type`/`entry`. It does NOT handle nested
 * tables such as `[[components.weapon_options]]`; those sections are skipped
 * rather than misread, because this parse is only used for navigation metadata.
 */
export interface ModManifest {
  id?: string;
  /** Display name from a v2 bundle. v1 packs usually omit it. */
  name?: string;
  author?: string;
  version?: string;
  entry?: string;
  components: ComponentEntry[];
}

export function parseModManifest(toml: string): ModManifest {
  const out: ModManifest = {
    id: undefined,
    name: undefined,
    author: undefined,
    version: undefined,
    entry: undefined,
    components: [],
  };
  let current: ComponentEntry | null = null;
  // Inside a non-component table (e.g. [[components.options]]): ignore keys so
  // they are not misattributed to a component or to the top level.
  let skipping = false;

  for (const rawLine of toml.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;

    // [[components]] -- start a new component block. Any other [[table]] (including
    // [[components.options]]) is skipped so its keys are not misattributed.
    const arr = line.match(/^\[\[([^\]]+)\]\]\s*$/);
    if (arr) {
      if (arr[1].trim() === 'components') {
        current = { id: undefined, type: undefined, entry: undefined } as ComponentEntry;
        out.components.push(current);
        skipping = false;
      } else {
        current = null;
        skipping = true;
      }
      continue;
    }
    // [section] -- leave any component or skip block, back to top level.
    if (/^\[[^\]]+\]\s*$/.test(line)) {
      current = null;
      skipping = false;
      continue;
    }

    if (skipping) continue;

    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
    if (!kv) continue;
    const key = kv[1].toLowerCase();
    let val = kv[2].trim();
    // Strip trailing inline comment and surrounding quotes.
    const hash = val.indexOf('#');
    if (hash !== -1) val = val.slice(0, hash).trim();
    val = val.replace(/^["']/, '').replace(/["']$/, '').trim();
    if (!val) continue;

    if (current) {
      if (key === 'id' && current.id === undefined) current.id = val;
      else if (key === 'type' && current.type === undefined) current.type = val;
      else if (key === 'entry' && current.entry === undefined) current.entry = val;
    } else {
      if (key === 'id' && out.id === undefined) out.id = val;
      else if (key === 'name' && out.name === undefined) out.name = val;
      else if ((key === 'author' || key === 'author_name') && out.author === undefined) out.author = val;
      else if (key === 'version' && out.version === undefined) out.version = val;
      else if (key === 'entry' && out.entry === undefined) out.entry = val;
    }
  }

  // Back-compat: if there is no top-level `entry` but the bundle declares
  // components, expose the first component's entry as `entry`. Existing
  // callers (declaredEntryFile, pickStartupFile) read this field.
  if (out.entry === undefined) {
    for (const c of out.components) {
      if (c.entry) { out.entry = c.entry; break; }
    }
  }

  return out;
}

/**
 * Resolve a single manifest `entry` value to a real file key, using layered
 * matching (exact, trailing path, basename). Case-insensitive, backslash and
 * `./` prefix tolerant. Returns null when nothing matches.
 *
 * Exported because the workspace tree (services/workspaceTree.ts) has to apply
 * the SAME resolution the startup picker does. Two implementations of "which
 * file does this entry mean" would eventually disagree, and then the sidebar
 * would mark one file as the entrypoint while the editor opens another.
 */
export function matchEntryFile(files: Record<string, string>, want: string): string | null {
  const keys = Object.keys(files);
  const norm = (k: string) => k.replace(/\\/g, '/').toLowerCase();
  const wantNorm = want.replace(/\\/g, '/').replace(/^\.\//, '').trim().toLowerCase();
  if (!wantNorm) return null;

  const byKey = keys.find((k) => norm(k) === wantNorm);
  if (byKey) return byKey;

  const byPath = keys.find((k) => norm(k).endsWith(`/${wantNorm}`));
  if (byPath) return byPath;

  const base = baseName(wantNorm);
  return keys.find((k) => baseName(k).toLowerCase() === base) ?? null;
}

/**
 * The file `mod.toml` points at with `entry`, matched against the real file
 * keys, or null when there is no usable answer.
 *
 * Matching is layered because `entry` is written relative to the mod root and
 * the keys are relative paths with forward slashes, so the obvious shapes
 * differ:
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

  return matchEntryFile(files, entry);
}

/**
 * All distinct component entrypoints declared by the manifest, in manifest
 * order, with each entry resolved to a real file key. Multiple components that
 * share one Lua file appear only once. Components without a usable `entry` are
 * skipped. Returns [] when there is no manifest or no components.
 */
export function declaredComponentEntries(files: Record<string, string>): ComponentEntry[] {
  const keys = Object.keys(files);
  const tomlKey = keys.find((k) => baseName(k).toLowerCase() === 'mod.toml');
  if (!tomlKey) return [];

  const manifest = parseModManifest(files[tomlKey]);
  const out: ComponentEntry[] = [];
  const seen = new Set<string>();
  for (const c of manifest.components) {
    if (!c.entry) continue;
    const resolved = matchEntryFile(files, c.entry);
    if (!resolved || seen.has(resolved)) continue;
    seen.add(resolved);
    out.push({ id: c.id, type: c.type, entry: resolved });
  }
  return out;
}

/**
 * Whether the loaded files include a `profiles/` directory (bundled profiles
 * shipped inside the mod source folder). Pure: inspects relative file keys,
 * no disk access.
 */
export function hasProfilesDir(files: Record<string, string>): boolean {
  return Object.keys(files).some((k) => {
    const n = k.replace(/\\/g, '/').toLowerCase();
    return n === 'profiles' || n.startsWith('profiles/');
  });
}

export type StartupReason =
  | 'declared-single'   // exactly one distinct declared entry -> open it
  | 'declared-weapons'  // multiple distinct entries, weapons.lua among them
  | 'declared-multiple' // multiple distinct entries, no weapons.lua -> ambiguous
  | 'weapons-fallback'  // no declared entries, weapons.lua present
  | 'lua-fallback'      // no declared entries, no weapons.lua, first .lua
  | 'any-fallback'      // no declared entries, no .lua, first file
  | 'none';             // empty folder

export interface StartupSelection {
  file: string | null;          // best-effort file to open; null only when empty
  entries: string[];            // distinct resolved declared entries, manifest order
  ambiguous: boolean;           // true when the caller should prompt instead of guessing
  reason: StartupReason;
}

/**
 * Decides which file to open first when a mod folder becomes the workspace.
 *
 * Precedence:
 *   1. No declared entries at all: weapons.lua if present, else first .lua,
 *      else first file.
 *   2. Exactly one distinct declared entry: open it.
 *   3. Multiple distinct declared entries: weapons.lua wins if one is named
 *      weapons.lua (the conventional root); otherwise the result is ambiguous
 *      and the caller should prompt or show an entrypoint group instead of
 *      guessing silently.
 */
export function startupSelection(files: Record<string, string>): StartupSelection {
  const names = Object.keys(files).sort();
  if (names.length === 0) {
    return { file: null, entries: [], ambiguous: false, reason: 'none' };
  }

  const keys = Object.keys(files);
  const tomlKey = keys.find((k) => baseName(k).toLowerCase() === 'mod.toml');

  // Collect every distinct declared entry path, manifest order: top-level
  // `entry` first (v1), then each [[components]].entry (v2). Dedup keeps shared
  // entries appearing once. A bundle whose components all point at one file
  // yields a single entry; several distinct files yield ambiguity.
  const entries: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string | undefined) => {
    if (!raw) return;
    const resolved = matchEntryFile(files, raw);
    if (resolved && !seen.has(resolved)) {
      seen.add(resolved);
      entries.push(resolved);
    }
  };

  if (tomlKey) {
    const manifest = parseModManifest(files[tomlKey]);
    add(manifest.entry);
    for (const c of manifest.components) add(c.entry);
  }

  const isWeapons = (p: string) => baseName(p).toLowerCase() === 'weapons.lua';

  if (entries.length === 0) {
    // No manifest entries resolve: fall back to conventional names.
    const w = names.find(isWeapons);
    if (w) return { file: w, entries: [], ambiguous: false, reason: 'weapons-fallback' };
    const lua = names.find((n) => n.toLowerCase().endsWith('.lua'));
    if (lua) return { file: lua, entries: [], ambiguous: false, reason: 'lua-fallback' };
    return { file: names[0], entries: [], ambiguous: false, reason: 'any-fallback' };
  }

  if (entries.length === 1) {
    return { file: entries[0], entries, ambiguous: false, reason: 'declared-single' };
  }

  // Multiple distinct declared entries.
  const w = entries.find(isWeapons);
  if (w) return { file: w, entries, ambiguous: false, reason: 'declared-weapons' };
  return { file: entries[0], entries, ambiguous: true, reason: 'declared-multiple' };
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
 *
 * When several distinct component entries exist and none is `weapons.lua`, the
 * result is ambiguous; callers that can prompt should use `startupSelection`
 * and check `ambiguous` instead of relying on this best-effort guess.
 */
export function pickStartupFile(files: Record<string, string>): string | null {
  return startupSelection(files).file;
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
        let components: ComponentEntry[] = [];
        try {
          const parsed = parseModManifest(await readTextFile(manifestPath));
          if (parsed.id) id = parsed.id;
          if (parsed.author) author = parsed.author;
          if (parsed.version) version = parsed.version;
          components = parsed.components;
        } catch {
          // Keep placeholders; the mod is still listed.
        }

        // Names of the profiles this mod ships. One readDir, contents not read:
        // the only question asked of them is "does a profile with this name
        // already exist in WormForge/Profiles".
        let bundledProfiles: string[] = [];
        try {
          const profileEntries = await readDir(`${modPath}${sep}profiles`);
          bundledProfiles = profileEntries
            .filter((p) => p.isFile && p.name.toLowerCase().endsWith('.toml'))
            .map((p) => p.name.replace(/\.toml$/i, ''));
        } catch {
          // No profiles folder (or unreadable): not an error.
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

        out.push({
          folderName: e.name,
          path: modPath,
          id,
          author,
          version,
          iconUrl,
          mtime,
          components,
          bundledProfiles,
        });
      } catch {
        // Unreadable mod (permissions, vanished mid-scan) - skip it.
      }
    }

    return out;
  } catch {
    return null;
  }
}

