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
import {
  migrateRenamedSessionKeys,
  resetPersistedSession,
  RENAMED_SESSION_KEYS,
  SESSION_STORAGE_KEYS,
  type SessionStorage,
} from '../session';

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
    // The specific regression: `wormbench_last_files` is the restored editor content.
    const { storage, remaining } = fakeStorage([...SESSION_STORAGE_KEYS]);
    resetPersistedSession(storage);
    expect(remaining).not.toContain('wormbench_last_files');
    expect(remaining).not.toContain('wormbench_open_files');
    expect(remaining).not.toContain('wormbench_active_file');
    expect(remaining).not.toContain('wormbench_mod_folder');
  });

  it('touches nothing it does not own', () => {
    const { storage, remaining } = fakeStorage(['wormbench_last_files', 'someone-elses-key']);
    resetPersistedSession(storage);
    expect(remaining).toEqual(['someone-elses-key']);
  });

  it('does not throw when a key was never written', () => {
    // `wormbench_saved_files` is never written on purpose, and storage.removeItem on a
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
        if (key === 'wormbench_last_files') throw new Error('nope');
      },
    };
    resetPersistedSession(partial);
    expect(seen).toContain('wormbench_open_files');
    expect(seen).toHaveLength(SESSION_STORAGE_KEYS.length);
  });
});

/** The full in-memory stand-in the migration needs: read, write and remove. */
function fakeFullStorage(initial: Record<string, string>) {
  const data = { ...initial };
  const storage = {
    getItem(key: string) {
      return key in data ? data[key] : null;
    },
    setItem(key: string, value: string) {
      data[key] = value;
    },
    removeItem(key: string) {
      delete data[key];
    },
  };
  return { storage, data };
}

describe('migrateRenamedSessionKeys (WormForge -> WormBench)', () => {
  it('copies every legacy value to its new key and drops the legacy one', () => {
    const legacy: Record<string, string> = {};
    for (const [oldKey, newKey] of RENAMED_SESSION_KEYS) {
      legacy[oldKey] = `value-of-${newKey}`;
    }
    const { storage, data } = fakeFullStorage(legacy);
    const migrated = migrateRenamedSessionKeys(storage);
    expect(migrated.sort()).toEqual(RENAMED_SESSION_KEYS.map(([, n]) => n).sort());
    for (const [oldKey, newKey] of RENAMED_SESSION_KEYS) {
      expect(data[newKey]).toBe(`value-of-${newKey}`);
      expect(data[oldKey]).toBeUndefined();
    }
  });

  it('never overwrites a value already saved under the new name', () => {
    const { storage, data } = fakeFullStorage({
      wormforge_last_files: '{"old": true}',
      wormbench_last_files: '{"new": true}',
      wormbench_mod_folder: '{"name": "px"}',
      wormforge_mod_folder: '{"name": "stale"}',
    });
    migrateRenamedSessionKeys(storage);
    expect(data.wormbench_last_files).toBe('{"new": true}');
    // The stale legacy duplicate is still dropped, not left behind.
    expect(data.wormforge_last_files).toBeUndefined();
    expect(data.wormforge_mod_folder).toBeUndefined();
  });

  it('does nothing when there is no legacy data', () => {
    const { storage, data } = fakeFullStorage({ wormbench_active_file: 'mod.lua' });
    expect(migrateRenamedSessionKeys(storage)).toEqual([]);
    expect(data.wormbench_active_file).toBe('mod.lua');
  });

  it('covers the crash key, so an old crash still explains the next start', () => {
    const names = RENAMED_SESSION_KEYS.map(([o, n]) => `${o}=${n}`);
    expect(names).toContain('wormforge_last_crash=wormbench_last_crash');
  });

  it('survives storage throwing, per the project catch convention', () => {
    const hostile = {
      getItem() {
        throw new Error('SecurityError');
      },
      setItem() {
        throw new Error('SecurityError');
      },
      removeItem() {
        throw new Error('SecurityError');
      },
    };
    expect(() => migrateRenamedSessionKeys(hostile)).not.toThrow();
  });

  it('returns nothing when storage is missing', () => {
    expect(migrateRenamedSessionKeys(null)).toEqual([]);
  });
});