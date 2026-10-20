// Installed profiles, read from disk. DESKTOP ONLY, same as everything else that
// touches the filesystem.
//
// WHERE THEY LIVE: `WormForge/Profiles`, beside `WormForge/Mods` -- not inside
// the mods folder. That is the engine's own rule:
//
//     pub fn profiles_dir(mods_dir: &Path) -> PathBuf {
//         crate::wormforge_root(mods_dir).join(PROFILES_DIR)
//     }
//     // wormforge_root() = mods_dir.parent()
//     // crates/weapons/src/components.rs:1372-1378
//
// so it is DERIVED from the configured mods folder rather than being a second
// setting the user has to keep in sync. Genuinely separate roots (a mods folder
// on another drive) are a real case, but inventing a second path box before the
// common one works would be the same mistake the old `autoLoadFolder` made --
// see the §35 migration in services/config.ts.

import { cleanFolderPath, isDesktop } from './modFolder';
import { parseProfile, type ProfileSummary } from './profile';

export interface InstalledProfile {
  /** File stem, which is what the loader calls the profile. */
  name: string;
  fileName: string;
  path: string;
  mtime: number | null;
  summary: ProfileSummary;
  /** The file as-is, for the read-only viewer. */
  text: string;
}

/**
 * `<modsRoot>/../Profiles`, or '' when the mods root has no parent to derive
 * from (a bare relative path such as `Mods`).
 */
export function profilesDirFromModsRoot(modsRoot: string): string {
  const clean = cleanFolderPath(modsRoot);
  if (!clean) return '';
  const isWin = clean.includes('\\') || /^[a-zA-Z]:/.test(clean);
  const sep = isWin ? '\\' : '/';
  const normalized = isWin ? clean.replace(/\//g, '\\') : clean.replace(/\\/g, '/');
  const idx = Math.max(normalized.lastIndexOf('\\'), normalized.lastIndexOf('/'));
  if (idx === -1) return '';
  // `C:\Mods` -> `C:\` -> `C:\Profiles`, which is what Path::parent() gives the
  // engine too. slice(0, idx) keeps the drive colon.
  return `${normalized.slice(0, idx)}${sep}Profiles`;
}

/**
 * Reads every `*.toml` in the installed profiles folder.
 *
 * Returns null when it cannot be attempted at all (browser, or no derivable
 * path) and [] when the folder simply does not exist yet -- "you have no saved
 * profiles" and "I could not look" are different things and the screen says so.
 * A single unreadable file is skipped, never fatal.
 */
export async function listInstalledProfiles(
  modsRoot: string
): Promise<InstalledProfile[] | null> {
  if (!isDesktop()) return null;
  const dir = profilesDirFromModsRoot(modsRoot);
  if (!dir) return null;

  try {
    const { readDir, readTextFile, stat, exists } = await import('@tauri-apps/plugin-fs');
    if (!(await exists(dir))) return [];
    const sep = dir.includes('\\') ? '\\' : '/';
    const entries = await readDir(dir);
    const out: InstalledProfile[] = [];

    for (const e of entries) {
      if (!e.isFile || !e.name.toLowerCase().endsWith('.toml')) continue;
      const path = `${dir}${sep}${e.name}`;
      let text: string;
      try {
        text = await readTextFile(path);
      } catch {
        // Locked or unreadable: skip this one, keep the rest.
        continue;
      }
      let mtime: number | null = null;
      try {
        const info = await stat(path);
        mtime = info.mtime ? new Date(info.mtime).getTime() : null;
      } catch {
        mtime = null;
      }
      out.push({
        name: e.name.replace(/\.toml$/i, ''),
        fileName: e.name,
        path,
        mtime,
        summary: parseProfile(text),
        text,
      });
    }

    out.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    return out;
  } catch {
    return null;
  }
}
