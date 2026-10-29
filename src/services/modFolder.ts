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

/**
 * The engine's managed library folder under Mods/.
 *
 * `libraries::pack_dirs()` treats a `wf-lib` folder without its own mod.toml as
 * a shelf: every immediate child is a bundle. The updater replaces that shelf,
 * which is why the editor moves a mod out before saving edits into it.
 */
export const OFFICIAL_LIBRARY_DIR = 'wf-lib';

/** Mirrors the engine's is_ignored_folder(): `_off` and `.hidden` are not packs. */
export function isIgnoredModFolder(name: string): boolean {
  return name.startsWith('_') || name.startsWith('.');
}

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

// ---------------------------------------------------------------------------
// The official library (wf-lib)
//
// WormForge replaces Mods/wf-lib on every update to keep its hashes identical.
// The editor still lets you read and edit those files, but a save must not land
// inside that managed shelf: it would be erased by the next update. Instead the
// whole mod folder is moved to its parent Mods/ folder -- the exact shape the
// engine already reads for ordinary user packs -- and then written there.
// ---------------------------------------------------------------------------

export interface OfficialModLocation {
  /** The mod folder inside wf-lib, e.g. `...\Mods\wf-lib\px`. */
  fromRoot: string;
  /** The managed shelf itself, e.g. `...\Mods\wf-lib`. */
  libraryRoot: string;
  /** The Mods folder that contains the shelf. */
  modsRoot: string;
  /** The mod's own folder name, e.g. `px`. */
  folderName: string;
  /** The preferred destination, e.g. `...\Mods\px`. */
  preferredRoot: string;
}

/**
 * Recognises a mod folder that sits directly inside a `wf-lib` shelf.
 *
 * Deliberately not recursive: the engine only treats immediate children as
 * packs, and moving a deeper folder would not produce a bundle. The match is
 * case-insensitive and honours both separators. `null` means this is an
 * ordinary folder, or the `wf-lib` shelf itself (which is not a mod).
 */
export function officialModLocation(rawRoot: string): OfficialModLocation | null {
  const root = (rawRoot || '').replace(/[\\/]+$/, '');
  if (!root) return null;
  const match = root.match(/^(.*?)[\\/](wf-lib)[\\/]([^\\/]+)$/i);
  if (!match) return null;

  const sep = root.includes('\\') ? '\\' : '/';
  const parent = match[1];
  const modsRoot = parent || sep;
  const join = (base: string, name: string) =>
    base.endsWith(sep) ? `${base}${name}` : `${base}${sep}${name}`;

  return {
    fromRoot: root,
    libraryRoot: join(modsRoot, match[2]),
    modsRoot,
    folderName: match[3],
    preferredRoot: join(modsRoot, match[3]),
  };
}

export interface OfficialMovePlan extends OfficialModLocation {
  /** Where the folder will actually go (may carry an `_edited` suffix). */
  targetRoot: string;
  /** True when preferredRoot was already occupied and the suffix was used. */
  renamed: boolean;
}

/**
 * Picks a destination for an official mod and reports whether the preferred
 * name was taken.
 *
 * A collision is handled with a suffix instead of overwriting. Clobbering an
 * existing `Mods/px` would destroy exactly the kind of work this feature is
 * meant to protect.
 */
export async function planOfficialMove(rawRoot: string): Promise<OfficialMovePlan | null> {
  const loc = officialModLocation(rawRoot);
  if (!loc) return null;

  const { exists } = await import('@tauri-apps/plugin-fs');
  const isTaken = async (path: string) => {
    try {
      return await exists(path);
    } catch {
      return false;
    }
  };

  const sep = loc.fromRoot.includes('\\') ? '\\' : '/';
  let targetRoot = loc.preferredRoot;
  let attempt = 0;
  while (await isTaken(targetRoot)) {
    attempt++;
    if (attempt > 99) {
      throw new Error(
        `Could not find a free folder name beside "${loc.folderName}". Rename or remove one of the existing copies first.`
      );
    }
    targetRoot = `${loc.modsRoot}${sep}${loc.folderName}_edited${attempt === 1 ? '' : `_${attempt}`}`;
  }

  return { ...loc, targetRoot, renamed: targetRoot !== loc.preferredRoot };
}

/**
 * Moves the whole mod folder out of wf-lib. Re-checks nothing here: the caller
 * has already shown the plan to the user, and `rename` refuses an occupied
 * destination rather than replacing it.
 */
export async function commitOfficialMove(plan: OfficialMovePlan): Promise<void> {
  if (!isDesktop()) {
    throw new Error('Moving a mod out of wf-lib is only available in the desktop app.');
  }
  const { rename } = await import('@tauri-apps/plugin-fs');
  await rename(plan.fromRoot, plan.targetRoot);
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

export type NewModKind = 'feature' | 'weapon';
export type NewModOptionType = 'bool' | 'int' | 'choice';

/**
 * One `[[components.options]]` declaration. The engine accepts these on both
 * feature and weapon components; the Lua reads them through `ctx.option(key)`.
 */
export interface NewModOption {
  key: string;
  label: string;
  type: NewModOptionType;
  defaultValue: boolean | number | string;
  description?: string;
  /** Inclusive bounds, for `int`. */
  min?: number;
  max?: number;
  /** Allowed values, for `choice`. The default must be one of them. */
  choices?: string[];
}

/** What the Create Mod dialog sends to the disk writer. */
export interface NewModSpec {
  name: string;
  author: string;
  kind: NewModKind;
  options: NewModOption[];
}

// The engine's valid_key(): lowercase ASCII letters, digits and underscore,
// up to 64 characters. It is stricter than a Lua identifier, so validate the
// engine's rule here rather than emitting a manifest it will refuse.
const OPTION_KEY = /^[a-z0-9_]{1,64}$/;

/**
 * Checks the dialog's values before anything is written.
 *
 * The engine validates manifests too, but a mod that the editor created and the
 * engine refuses is a bad first five seconds. This catches the mistakes the
 * dialog can actually make: an empty key, a duplicate key, a default outside an
 * int's bounds, or a choice whose default is not in its list.
 */
export function validateNewModSpec(spec: NewModSpec): string | null {
  if (!spec.name?.trim()) return 'Mod name is required.';
  if (!spec.author?.trim()) return 'Author is required.';
  if (spec.kind !== 'feature' && spec.kind !== 'weapon') return 'Pick behavior or weapon.';
  const slug = slugifyModName(spec.name);
  if (slug.length > 57) {
    return 'Mod name is too long; shorten it so the component id fits the engine\'s 64-character limit.';
  }
  const seen = new Set<string>();
  for (let i = 0; i < (spec.options ?? []).length; i++) {
    const o = spec.options[i];
    const where = `Parameter ${i + 1}`;
    if (!o.key?.trim()) return `${where}: key is required.`;
    if (!OPTION_KEY.test(o.key)) {
      return `${where}: key "${o.key}" must use lowercase letters, digits and _, up to 64 characters.`;
    }
    if (seen.has(o.key)) return `${where}: key "${o.key}" is used twice.`;
    seen.add(o.key);
    if (!o.label?.trim()) return `${where}: label is required.`;
    if (o.type === 'bool') {
      if (typeof o.defaultValue !== 'boolean') return `${where}: a switch default must be true or false.`;
    } else if (o.type === 'int') {
      if (!Number.isInteger(o.defaultValue)) return `${where}: the default must be a whole number.`;
      const min = o.min ?? 0;
      const max = o.max ?? 100;
      if (!Number.isInteger(min) || !Number.isInteger(max)) return `${where}: min and max must be whole numbers.`;
      if (min > max) return `${where}: min cannot be greater than max.`;
      if ((o.defaultValue as number) < min || (o.defaultValue as number) > max) {
        return `${where}: the default must be between ${min} and ${max}.`;
      }
    } else if (o.type === 'choice') {
      const choices = o.choices ?? [];
      if (choices.length === 0) return `${where}: add at least one choice.`;
      if (new Set(choices).size !== choices.length) return `${where}: choices must be unique.`;
      if (typeof o.defaultValue !== 'string' || !choices.includes(o.defaultValue)) {
        return `${where}: the default must be one of the choices.`;
      }
    } else {
      return `${where}: unsupported option type.`;
    }
  }
  return null;
}

function tomlValue(value: string | number | boolean): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '0';
  return tomlString(value);
}

function optionBlocks(options: NewModOption[]): string {
  return options
    .map((o) => {
      const lines = [
        '[[components.options]]',
        `key = ${tomlString(o.key)}`,
        `type = ${tomlString(o.type)}`,
        `default = ${tomlValue(o.defaultValue)}`,
      ];
      if (o.type === 'int') {
        lines.push(`min = ${o.min ?? 0}`);
        lines.push(`max = ${o.max ?? 100}`);
      }
      if (o.type === 'choice') {
        lines.push(`choices = [${(o.choices ?? []).map(tomlString).join(', ')}]`);
      }
      lines.push(`label = ${tomlString(o.label)}`);
      if (o.description?.trim()) lines.push(`description = ${tomlString(o.description.trim())}`);
      return `\n${lines.join('\n')}\n`;
    })
    .join('');
}

/**
 * Writes the bundle manifest for a new mod.
 *
 * `format_version = 2` plus one `[[components]]` component, because that is the
 * only shape a profile can select. A v1 manifest (top-level `entry`) has no
 * component id, so a profile could not reference it and the "create a mod" flow
 * could not ship one.
 *
 * `api_version = 4` is not cosmetic: the engine rejects anything else
 * (`crates/weapons/src/components.rs:340`, "api_version {n} is not supported").
 *
 * No top-level `entry` and no `[weapons]` table: `BundleManifest` is
 * `#[serde(deny_unknown_fields)]`, so those v1 keys make the whole bundle fail
 * to parse rather than being ignored.
 *
 * `[[components.options]]` is where the dialog's parameters become the form the
 * loader shows. On a weapon they appear in Weapons settings; on a feature they
 * appear under the add-on. `ctx.option(key)` reads the chosen value.
 *
 * Exported so the tests can pin the exact text a new mod gets.
 */
export function buildModManifest(
  id: string,
  name: string,
  author: string,
  entryLuaName: string,
  kind: NewModKind = 'feature',
  options: NewModOption[] = []
): string {
  const componentId = `${id}.${kind === 'weapon' ? 'weapon' : 'main'}`;
  const position = kind === 'weapon' ? '\ndefault_position = { row = "F1", column = 1 }' : '';
  return `id = ${tomlString(id)}
name = ${tomlString(name)}
version = "0.1.0"
author = ${tomlString(author)}
api_version = 4
format_version = 2
debug_worm_state = false

[[components]]
id = ${tomlString(componentId)}
type = ${tomlString(kind === 'weapon' ? 'weapon' : 'feature')}
name = ${tomlString(name)}
description = ${tomlString(
    kind === 'weapon' ? `${name} weapon entry point.` : `${name} behavior entry point.`
  )}
entry = ${tomlString(entryLuaName)}${position}
${optionBlocks(options)}`;
}

export interface BuildModProfileOptions {
  kind?: NewModKind;
  options?: NewModOption[];
}

/**
 * Writes the bundled profile that switches a new mod on.
 *
 * A feature uses `features = [...]`, so the profile keeps the resolved scheme's
 * own weapon panel. A weapon also needs a `[weapons]` table: a profile with a
 * weapon set owns the whole panel, so the starter profile places the new weapon
 * on F1 and adds a small stock kit instead of leaving every other slot empty.
 *
 * The chosen parameter values are written to `[options."<component id>"]`.
 * The engine copies this file into `WormForge/Profiles/` when the pack is
 * installed (`adopt_profiles`, `crates/weapons/src/components.rs:1446`) and
 * never overwrites an existing profile of the same name.
 */
export function buildModProfile(
  name: string,
  componentId: string,
  spec: BuildModProfileOptions = {}
): string {
  const kind = spec.kind ?? 'feature';
  const options = spec.options ?? [];
  const description =
    kind === 'weapon'
      ? `${name}: a weapon with a starter panel.`
      : `${name}: ${componentId}, over the scheme's own weapons.`;
  let out = `description = ${tomlString(description)}\n`;

  if (kind === 'weapon') {
    out += `features = []\n\n[weapons]\n`;
    out += `${tomlString(componentId)} = { row = "F1", column = 1 }\n`;
    out += `"stock.grenade" = { row = "F2", column = 1 }\n`;
    out += `"stock.shotgun" = { row = "F3", column = 1 }\n`;
    out += `"stock.ninja_rope" = { row = "F8", column = 1 }\n`;
    out += `"stock.teleport" = { row = "F8", column = 4 }\n`;
    out += `"stock.skip_go" = { row = "F12", column = 1 }\n`;
    out += `"stock.surrender" = { row = "F12", column = 2 }\n`;
  } else {
    out += `features = [${tomlString(componentId)}]\n`;
  }

  if (options.length > 0) {
    out += `\n[options.${tomlString(componentId)}]\n`;
    for (const o of options) out += `${o.key} = ${tomlValue(o.defaultValue)}\n`;
  }
  return out;
}

/** The install function every component entry file must return. */
export function buildModEntryLua(
  name: string,
  author: string,
  componentId: string,
  kind: NewModKind = 'feature',
  options: NewModOption[] = []
): string {
  // A newline in the mod name would end the `--` comment and turn the rest of
  // the name into Lua source, so both free-text fields are flattened to one line.
  const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').replace(/--/g, ' - ');
  const reads =
    options.length > 0
      ? `${options
          .map(
            (o) =>
              `    local opt_${o.key} = ctx.option(${JSON.stringify(o.key)})`
          )
          .join('\n')}\n`
      : '';
  const header = `-- ${oneLine(name)}
-- by ${oneLine(author)}
-- Entry file for this mod. mod.toml declares it as the ${componentId} component,
-- and the bundled profile in profiles/ switches that component on.
--
-- This file is a Lua module: the engine reads what it returns.
-- \`ctx\` is a table the engine passes in; it is not a global and not the mod.
-- \`wa\` exists only inside install and the callbacks it registers.
`;
  const values =
    options.length > 0
      ? `    -- Values from profiles/<name>.toml; defaults live in mod.toml's
    -- [[components.options]] blocks. Edit either, or change them in the loader.
${reads}`
      : '';

  if (kind === 'weapon') {
    return `${header}-- A weapon component returns a table with defaults and install.
-- The top level is declaration only: \`wa\` is not available here.
-- The engine calls install(ctx) once when the profile places this component.
return {
  defaults = {
    ammo = { round_start = -1 },
    delay = 0,
  },
  install = function(ctx)
${values}    -- TODO: this is the weapon's behavior. Read the parameters above and
    -- replace this log with the actual click/fire logic.
    wa.log("${componentId} installed")
  end,
}
`;
  }

  return `${header}-- A feature returns its install function, or a table { install = ... }.
-- The top level is declaration only: \`wa\` is not available here.
-- The engine calls install(ctx) once when the profile selects this component.
return function(ctx)
${values}    -- TODO: this is the behavior. Read the parameters above and replace this
    -- log with the actual behavior.
    wa.log("${componentId} installed")
end
`;
}

/** The fixed folder for a new mod's Lua. */
export const NEW_MOD_ENTRY = 'code/mod.lua';

export interface BuiltNewMod {
  slug: string;
  componentId: string;
  entry: string;
  profilePath: string;
  files: Record<string, string>;
}

/**
 * The pure half of "create mod": validate the dialog values and produce every
 * file, leaving the disk write to createModFolder(). Keeping this separate lets
 * tests pin the layout (`code/` and `profiles/`) without touching Tauri.
 */
export function buildNewMod(spec: NewModSpec): BuiltNewMod {
  const error = validateNewModSpec(spec);
  if (error) throw new Error(error);

  const name = spec.name.trim();
  const author = spec.author.trim();
  const slug = slugifyModName(name);
  const options = spec.options ?? [];
  const componentId = `${slug}.${spec.kind === 'weapon' ? 'weapon' : 'main'}`;
  const profilePath = `profiles/${profileFileName(name, slug)}.toml`;
  const files: Record<string, string> = {
    'mod.toml': buildModManifest(slug, name, author, NEW_MOD_ENTRY, spec.kind, options),
    [NEW_MOD_ENTRY]: buildModEntryLua(name, author, componentId, spec.kind, options),
    [profilePath]: buildModProfile(name, componentId, { kind: spec.kind, options }),
  };
  return { slug, componentId, entry: NEW_MOD_ENTRY, profilePath, files };
}

export async function createModFolder(
  rootPath: string,
  spec: NewModSpec | string,
  legacyAuthor = ''
): Promise<string> {
  const clean = cleanFolderPath(rootPath);
  if (!clean) throw new Error('No mods folder configured.');

  // Keep the old string call working for any caller that has not moved to the
  // dialog's spec object yet.
  const normalized: NewModSpec =
    typeof spec === 'string'
      ? { name: spec, author: legacyAuthor, kind: 'feature', options: [] }
      : spec;
  const built = buildNewMod(normalized);

  const isWin = clean.includes('\\') || /^[a-zA-Z]:/.test(clean);
  const sep = isWin ? '\\' : '/';
  const normalizedRoot = isWin
    ? clean.replace(/\//g, '\\').replace(/\\+$/, '')
    : clean.replace(/\\/g, '/').replace(/\/+$/, '');

  for (const [rel, content] of Object.entries(built.files)) {
    await saveModFile(normalizedRoot, `${built.slug}/${rel}`, content);
  }

  return `${normalizedRoot}${sep}${built.slug}`;
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
  /**
   * True when this pack lives on the managed `wf-lib` shelf.
   *
   * The editor still opens it, but the first save asks to move the whole folder
   * to Mods/ so the updater's wipe cannot take the user's edits with it.
   */
  official?: boolean;
  /** `id` from mod.toml, else the folder name. */
  id: string;
  author: string;
  version: string;
  /** data: URL for the first readable `mod_icon` candidate, or null. */
  iconUrl: string | null;
  /** Folder mtime; null when the filesystem did not report one. */
  mtime: number | null;
  /**
   * Components the manifest declares, read from the SAME parse that produced
   * `id`/`author` above -- so a profile's `features` can be resolved to a file
   * without scanning every mod a second time.
   */
  components: ComponentEntry[];
  /** Number of public modules declared in `[exports]`. */
  exportCount: number;
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
  /**
   * `mod_icon` candidates in declaration order. The engine accepts either a
   * string or an array and uses the first readable PNG. Empty when omitted;
   * callers may keep their legacy root `mod_icon.png` fallback.
   */
  modIcon: string[];
  /** `[exports]` public require name -> pack-relative Lua entry. */
  exports: Record<string, string>;
  components: ComponentEntry[];
}

type ManifestSection = 'top' | 'components' | 'exports' | 'other';

/** Strips a TOML inline comment without cutting a `#` inside a quoted value. */
function stripTomlComment(value: string): string {
  let quote: string | null = null;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (quote) {
      if (ch === quote && value[i - 1] !== '\\') quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '#') {
      return value.slice(0, i).trim();
    }
  }
  return value.trim();
}

function unquoteTomlString(value: string): string {
  const v = stripTomlComment(value);
  if (
    v.length >= 2 &&
    ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
  ) {
    return v.slice(1, -1).trim();
  }
  return v;
}

/**
 * Reads `mod_icon = "a.png"` or `mod_icon = ["a.png", "b.png"]`.
 *
 * A tiny scanner rather than a full TOML parser: the manifest reader has always
 * been deliberately tolerant, and this only needs the two shapes the engine
 * accepts. Multi-line arrays are rare enough that the first line's strings are
 * still useful; missing the rest degrades to a placeholder icon, not a crash.
 */
function parseTomlStringList(raw: string): string[] {
  const value = stripTomlComment(raw);
  if (!value) return [];
  if (!value.startsWith('[')) {
    const one = unquoteTomlString(value);
    return one ? [one] : [];
  }
  const out: string[] = [];
  const re = /"((?:\\.|[^"\\])*)"|'([^']*)'/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value))) {
    const item = (match[1] ?? match[2] ?? '').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    if (item) out.push(item);
  }
  return out;
}

export function parseModManifest(toml: string): ModManifest {
  const out: ModManifest = {
    id: undefined,
    name: undefined,
    author: undefined,
    version: undefined,
    entry: undefined,
    modIcon: [],
    exports: {},
    components: [],
  };
  let current: ComponentEntry | null = null;
  let section: ManifestSection = 'top';

  for (const rawLine of toml.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;

    // [[components]] -- start a new component block. Any other [[table]]
    // (including [[components.options]]) is skipped so its keys are not
    // misattributed to a component or to the top level.
    const arr = line.match(/^\[\[([^\]]+)\]\]\s*$/);
    if (arr) {
      if (arr[1].trim() === 'components') {
        current = { id: undefined, type: undefined, entry: undefined } as ComponentEntry;
        out.components.push(current);
        section = 'components';
      } else {
        current = null;
        section = 'other';
      }
      continue;
    }

    // [section] -- `[exports]` is data we need; every other table is skipped.
    const table = line.match(/^\[([^\]]+)\]\s*$/);
    if (table) {
      current = null;
      section = table[1].trim() === 'exports' ? 'exports' : 'other';
      continue;
    }

    if (section === 'other') continue;

    // Quoted keys are required for `[exports]` names; bare keys cover the
    // ordinary top-level and component fields.
    const kv = line.match(
      /^(?:"([^"]+)"|'([^']+)'|([A-Za-z_][A-Za-z0-9_.-]*))\s*=\s*(.+)$/
    );
    if (!kv) continue;
    const key = (kv[1] ?? kv[2] ?? kv[3]).trim();
    const rawVal = kv[4];
    const lowerKey = key.toLowerCase();

    if (section === 'exports') {
      const entry = unquoteTomlString(rawVal);
      if (entry) out.exports[key] = entry;
      continue;
    }

    if (section === 'components' && current) {
      const val = unquoteTomlString(rawVal);
      if (!val) continue;
      if (lowerKey === 'id' && current.id === undefined) current.id = val;
      else if (lowerKey === 'type' && current.type === undefined) current.type = val;
      else if (lowerKey === 'entry' && current.entry === undefined) current.entry = val;
      continue;
    }

    if (section !== 'top') continue;
    if (lowerKey === 'mod_icon') {
      if (out.modIcon.length === 0) out.modIcon = parseTomlStringList(rawVal);
      continue;
    }
    const val = unquoteTomlString(rawVal);
    if (!val) continue;
    if (lowerKey === 'id' && out.id === undefined) out.id = val;
    else if (lowerKey === 'name' && out.name === undefined) out.name = val;
    else if ((lowerKey === 'author' || lowerKey === 'author_name') && out.author === undefined)
      out.author = val;
    else if (lowerKey === 'version' && out.version === undefined) out.version = val;
    else if (lowerKey === 'entry' && out.entry === undefined) out.entry = val;
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

/** A data URL for a PNG, or null when the bytes are unusable/too large. */
function pngDataUrl(bytes: Uint8Array): string | null {
  // Cap icon size: a data URL for a huge PNG would bloat memory and DOM.
  if (bytes.byteLength === 0 || bytes.byteLength > 4 * 1024 * 1024) return null;
  // Copy into a fresh ArrayBuffer: the Uint8Array view may sit in a larger
  // pooled buffer, which would encode garbage after the end.
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
  return `data:image/png;base64,${btoa(bin)}`;
}

/**
 * Lists the mod folders directly under `rootPath`.
 *
 * Mirrors the engine's `libraries::pack_dirs()`: a `wf-lib` shelf without its
 * own manifest contributes its immediate child packs (marked `official`); any
 * other folder contributes itself. Does NOT recurse past that one shelf level:
 * a mod's own sprites/sounds subfolders are ignored on purpose.
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

    /** Reads one folder and returns its tile, or null when it is not a mod. */
    const readEntry = async (
      folderName: string,
      modPath: string,
      official: boolean
    ): Promise<ModListEntry | null> => {
      try {
        // A mod must have mod.toml to count as one.
        const manifestPath = `${modPath}${sep}mod.toml`;
        if (!(await exists(manifestPath))) return null;

        let id = folderName;
        let author = 'Unknown';
        let version = 'Unknown';
        let components: ComponentEntry[] = [];
        let modIcon: string[] = [];
        let exportCount = 0;
        try {
          const parsed = parseModManifest(await readTextFile(manifestPath));
          if (parsed.id) id = parsed.id;
          if (parsed.author) author = parsed.author;
          if (parsed.version) version = parsed.version;
          components = parsed.components;
          modIcon = parsed.modIcon;
          exportCount = Object.keys(parsed.exports).length;
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

        // `mod_icon` is a string or an array of candidates; the engine takes the
        // first readable PNG. Only fall back to the legacy root file when the
        // manifest says nothing, so a declared-but-missing icon stays visible as
        // "no icon" instead of silently using an unrelated file.
        let iconUrl: string | null = null;
        const iconCandidates = modIcon.length > 0 ? modIcon : ['mod_icon.png'];
        for (const candidate of iconCandidates) {
          if (!isSafeModRelativePath(candidate)) continue;
          const iconPath = `${modPath}${sep}${candidate.split(/[\\/]+/).join(sep)}`;
          try {
            if (!(await exists(iconPath))) continue;
            iconUrl = pngDataUrl(await readFile(iconPath));
            if (iconUrl) break;
          } catch {
            // Try the next candidate; a corrupt icon is not a broken mod.
          }
        }

        let mtime: number | null = null;
        try {
          const info = await stat(modPath);
          mtime = info.mtime ? new Date(info.mtime).getTime() : null;
        } catch {
          mtime = null;
        }

        return {
          folderName,
          path: modPath,
          official,
          id,
          author,
          version,
          iconUrl,
          mtime,
          components,
          exportCount,
          bundledProfiles,
        };
      } catch {
        // Unreadable mod (permissions, vanished mid-scan) - skip it.
        return null;
      }
    };

    for (const e of dirEntries) {
      if (!e.isDirectory || isIgnoredModFolder(e.name)) continue;
      const modPath = `${normalizedRoot}${sep}${e.name}`;

      // Mirror libs::pack_dirs(): a `wf-lib` WITHOUT its own manifest is a
      // shelf of immediate child bundles. A user pack that happens to be named
      // wf-lib and has a manifest stays a normal, single tile.
      const isShelf =
        e.name.toLowerCase() === OFFICIAL_LIBRARY_DIR &&
        !(await exists(`${modPath}${sep}mod.toml`).catch(() => false));
      if (isShelf) {
        let children: Awaited<ReturnType<typeof readDir>> = [];
        try {
          children = await readDir(modPath);
        } catch {
          continue;
        }
        for (const child of children) {
          if (!child.isDirectory || isIgnoredModFolder(child.name)) continue;
          const entry = await readEntry(
            child.name,
            `${modPath}${sep}${child.name}`,
            true
          );
          if (entry) out.push(entry);
        }
        continue;
      }

      const entry = await readEntry(e.name, modPath, false);
      if (entry) out.push(entry);
    }

    return out;
  } catch {
    return null;
  }
}

