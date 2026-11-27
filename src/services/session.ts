// Session persistence: what survives a restart, and how to clear it.
//
// WHY THIS IS ITS OWN MODULE
// The keys were string literals inside App.tsx, and clearing them was not possible at
// all -- there was no way to make the next launch start clean. That is why the previous
// run's unsaved buffers came back on every start, briefly, before the folder reloaded
// over them.
//
// It is pure and takes its storage object as an argument so it can be tested without a
// DOM; vitest runs in node, where `localStorage` does not exist.
//
// Errors follow the project convention: a bare `catch {}` with no binding, because a
// full disk or a disabled-storage browser must not crash the editor on shutdown.

/**
 * Every key this app owns. Nothing else is touched -- wiping unrelated keys would be
 * rude to anything else sharing the origin.
 *
 * `wormbench_saved_files` is listed for completeness even though it is deliberately
 * never written (see the `savedFiles` comment in App.tsx -- writing it is what
 * exhausted the localStorage quota). Clearing a key that was never set is a no-op.
 */
export const SESSION_STORAGE_KEYS: readonly string[] = [
  'wormbench_last_files',
  'wormbench_active_file',
  'wormbench_open_files',
  'wormbench_mod_folder',
  'wormbench_saved_files',
];

/**
 * The crash key's old name. It is not a SESSION_STORAGE_KEYS entry -- crash.ts owns
 * it -- but the rename migration below covers it so a crash recorded under the old
 * name still explains the next start.
 */
export const CRASH_KEY_LEGACY = 'wormforge_last_crash';

/**
 * The keys the app wrote when it was called WormForge, mapped to their new names.
 *
 * The rename would otherwise cost an upgrading user their restored buffers, open
 * mod folder and open tabs once: the new keys read empty and the old ones sit
 * ignored. `migrateRenamedSessionKeys` copies each old value the first time it is
 * still there and the new key is not, then removes the old one. Nothing is
 * overwritten: a value already saved under a new name wins.
 */
export const RENAMED_SESSION_KEYS: readonly [legacy: string, current: string][] = [
  ['wormforge_last_files', 'wormbench_last_files'],
  ['wormforge_active_file', 'wormbench_active_file'],
  ['wormforge_open_files', 'wormbench_open_files'],
  ['wormforge_mod_folder', 'wormbench_mod_folder'],
  ['wormforge_saved_files', 'wormbench_saved_files'],
  [CRASH_KEY_LEGACY, 'wormbench_last_crash'],
];

/** The minimum shape this needs; `localStorage` satisfies it. */
export interface SessionStorage {
  removeItem(key: string): void;
}

/**
 * Removes every persisted key so the next launch starts from disk (or the template),
 * with no restored buffers and no leftover session state.
 *
 * Returns the keys that were actually present, so the caller can log it honestly
 * rather than claiming to have cleared something it did not.
 */
export function resetPersistedSession(
  storage: SessionStorage = localStorage
): string[] {
  const removed: string[] = [];
  for (const key of SESSION_STORAGE_KEYS) {
    try {
      storage.removeItem(key);
      removed.push(key);
    } catch {}
  }
  return removed;
}

/** Reading as well as removing: the migration moves values across. */
interface MigrationStorage extends SessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * One-time carry-over of session state written under the pre-rename names.
 *
 * Must run BEFORE App's state initializers: they read the current keys once, and
 * an empty `wormbench_last_files` would seed the template over an unsaved buffer
 * the old name still holds. Copies only when the current key is absent, so a
 * session already saved as WormBench is never regressed by an old leftover.
 *
 * Returns the current names that were populated from a legacy key, for the log.
 */
export function migrateRenamedSessionKeys(
  storage: MigrationStorage | null = safeStorage()
): string[] {
  if (!storage) return [];
  const migrated: string[] = [];
  for (const [legacy, current] of RENAMED_SESSION_KEYS) {
    try {
      if (storage.getItem(current) !== null) {
        // Already migrated (or written since): drop the legacy duplicate.
        storage.removeItem(legacy);
        continue;
      }
      const old = storage.getItem(legacy);
      if (old === null) continue;
      storage.setItem(current, old);
      storage.removeItem(legacy);
      migrated.push(current);
    } catch {}
  }
  return migrated;
}

function safeStorage(): MigrationStorage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}