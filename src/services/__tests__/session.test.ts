// Tests for the session-reset helper.
//
// WHY THIS EXISTS
// There was no way to make the next launch start clean. "Close without saving" left the
// persisted buffers in localStorage, so the next run restored the very edits the user had
// just declined to save -- and, before the boot gate was added, PAINTED them on screen
// first. Clearing the keys was impossible because they were string literals inline in
// App.tsx.
//
// The storage object is injected so these run without a DOM: vitest runs in node, where
// `localStorage` does not exist.
import { describe, it, expect } from 'vitest';
import { resetPersistedSession, SESSION_STORAGE_KEYS, type SessionStorage } from '../session';

/** Minimal in-memory stand-in that records what was removed. */
function fakeStorage(present: string[]) {
  const removed: string[] = [];
  const storage: SessionStorage = {
    removeItem(key: string) {
      if (!present.includes(key)) throw new Error('not present');
      removed.push(key);
      present.splice(present.indexOf(key), 1);
    },
  };
  return { storage, removed, remaining: present };
}

describe('resetPersistedSession', () => {
  it('removes every key the app owns', () => {
    const { storage, removed } = fakeStorage([...SESSION_STORAGE_KEYS]);
    resetPersistedSession(storage);
    expect(removed.sort()).toEqual([...SESSION_STORAGE_KEYS].sort());
  });

  it('clears the buffers so the next launch cannot restore them', () => {
    // The specific regression: `wormforge_last_files` is the restored editor content.
    const { storage, remaining } = fakeStorage([...SESSION_STORAGE_KEYS]);
    resetPersistedSession(storage);
    expect(remaining).not.toContain('wormforge_last_files');
    expect(remaining).not.toContain('wormforge_open_files');
    expect(remaining).not.toContain('wormforge_active_file');
    expect(remaining).not.toContain('wormforge_mod_folder');
  });

  it('touches nothing it does not own', () => {
    const { storage, remaining } = fakeStorage(['wormforge_last_files', 'someone-elses-key']);
    resetPersistedSession(storage);
    expect(remaining).toEqual(['someone-elses-key']);
  });

  it('does not throw when a key was never written', () => {
    // `wormforge_saved_files` is never written on purpose, and storage.removeItem on a
    // missing key must not be an error -- closing the app must always work.
    const { storage } = fakeStorage([]);
    expect(() => resetPersistedSession(storage)).not.toThrow();
  });

  it('survives storage throwing, per the project catch convention', () => {
    // A full disk or disabled storage must not stop the window closing.
    const hostile: SessionStorage = {
      removeItem() {
        throw new Error('SecurityError');
      },
    };
    expect(() => resetPersistedSession(hostile)).not.toThrow();
  });

  it('keeps going after one key fails', () => {
    // One failure must not abandon the rest, or a single bad key leaves the buffers
    // behind and the next launch restores them -- the exact bug being fixed.
    const seen: string[] = [];
    const partial: SessionStorage = {
      removeItem(key: string) {
        seen.push(key);
        if (key === 'wormforge_last_files') throw new Error('nope');
      },
    };
    resetPersistedSession(partial);
    expect(seen).toContain('wormforge_open_files');
    expect(seen).toHaveLength(SESSION_STORAGE_KEYS.length);
  });
});