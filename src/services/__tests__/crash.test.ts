import { describe, it, expect } from 'vitest';
import { CRASH_KEY, recordCrash, readCrash, clearCrash, type CrashStorage } from '../crash';

function memoryStorage(): CrashStorage & { dump(): Record<string, string> } {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
    dump: () => Object.fromEntries(map),
  };
}

describe('crash records', () => {
  it('round-trips an error with its stack', () => {
    const storage = memoryStorage();
    const error = new Error('boom');
    const record = recordCrash('react', error, '  in App', storage)!;
    expect(record.message).toBe('boom');
    expect(record.kind).toBe('react');
    expect(record.detail).toContain('in App');

    const read = readCrash(storage)!;
    expect(read.message).toBe('boom');
    expect(read.at).toBe(record.at);
    expect(read.detail).toContain('in App');
  });

  it('describes a non-Error rejection without throwing', () => {
    const storage = memoryStorage();
    recordCrash('unhandledrejection', 'plain string', undefined, storage);
    expect(readCrash(storage)?.message).toBe('plain string');

    recordCrash('error', { code: 42 }, undefined, storage);
    expect(readCrash(storage)?.message).toContain('42');
  });

  it('returns null when there is no record', () => {
    expect(readCrash(memoryStorage())).toBeNull();
  });

  it('ignores a malformed record instead of crashing the boot screen', () => {
    const storage = memoryStorage();
    storage.setItem(CRASH_KEY, '{not json');
    expect(readCrash(storage)).toBeNull();

    storage.setItem(CRASH_KEY, JSON.stringify({ at: 1, message: 2 }));
    expect(readCrash(storage)).toBeNull();
  });

  it('survives storage that throws on read, write and clear', () => {
    const broken: CrashStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    expect(() => recordCrash('error', new Error('x'), undefined, broken)).not.toThrow();
    expect(readCrash(broken)).toBeNull();
    expect(() => clearCrash(broken)).not.toThrow();
  });

  it('clears the record', () => {
    const storage = memoryStorage();
    recordCrash('error', new Error('x'), undefined, storage);
    clearCrash(storage);
    expect(readCrash(storage)).toBeNull();
  });
});
