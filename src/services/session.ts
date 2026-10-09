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
 * `wormforge_saved_files` is listed for completeness even though it is deliberately
 * never written (see the `savedFiles` comment in App.tsx -- writing it is what
 * exhausted the localStorage quota). Clearing a key that was never set is a no-op.
 */
export const SESSION_STORAGE_KEYS: readonly string[] = [
  'wormforge_last_files',
  'wormforge_active_file',
  'wormforge_open_files',
  'wormforge_mod_folder',
  'wormforge_saved_files',
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