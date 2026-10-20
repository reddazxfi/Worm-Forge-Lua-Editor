// The last fatal error, persisted so a window that went blank can explain itself.
//
// WHY PERSIST IT
// A render error unmounts the React tree. If nothing catches it, the page is
// empty and the console is the only witness -- which a packaged app does not
// show. Writing the record BEFORE the crash screen renders means the boot
// watchdog in index.html (plain JS, no bundle) can display it even when the
// React bundle never mounts.
//
// Everything here is best-effort: recording a crash must never throw, because
// it runs while the app is already failing. Storage can be missing (SSR/tests),
// full, or disabled.

export const CRASH_KEY = 'wormforge_last_crash';

export type CrashKind = 'error' | 'unhandledrejection' | 'react' | 'boot';

export interface CrashRecord {
  /** ISO timestamp. */
  at: string;
  kind: CrashKind;
  message: string;
  /** Stack and, for React, the component stack. */
  detail?: string;
}

export interface CrashStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): CrashStorage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/** The message and detail of anything thrown. Never throws itself. */
function describe(error: unknown): { message: string; detail?: string } {
  if (error instanceof Error) {
    return { message: error.message || error.name, detail: error.stack };
  }
  if (typeof error === 'string') return { message: error };
  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: String(error) };
  }
}

/**
 * Records a crash and returns what was written (or null when storage is
 * unavailable). `extra` carries the React component stack.
 */
export function recordCrash(
  kind: CrashKind,
  error: unknown,
  extra?: string,
  storage: CrashStorage | null = defaultStorage()
): CrashRecord | null {
  if (!storage) return null;
  const { message, detail } = describe(error);
  const combined = [detail, extra].filter(Boolean).join('\n\n');
  const record: CrashRecord = {
    at: new Date().toISOString(),
    kind,
    message,
    ...(combined ? { detail: combined } : {}),
  };
  try {
    storage.setItem(CRASH_KEY, JSON.stringify(record));
  } catch {
    // A full or disabled storage must not turn a crash into a second crash.
  }
  return record;
}

/** The last record, or null when there is none or it is unreadable. */
export function readCrash(storage: CrashStorage | null = defaultStorage()): CrashRecord | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(CRASH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.message !== 'string' || typeof parsed.at !== 'string') {
      return null;
    }
    return {
      at: parsed.at,
      // An unknown kind is still worth showing; the message is the useful part.
      kind: typeof parsed.kind === 'string' ? parsed.kind : 'error',
      message: parsed.message,
      ...(typeof parsed.detail === 'string' ? { detail: parsed.detail } : {}),
    };
  } catch {
    return null;
  }
}

export function clearCrash(storage: CrashStorage | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(CRASH_KEY);
  } catch {}
}
