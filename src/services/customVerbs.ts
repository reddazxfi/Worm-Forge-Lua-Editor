// User-registered engine verbs: parse, serialize, overlay.
//
// WHY THIS MODULE
// The "+ Custom Verb" modal used to write into `customClasses` React state and
// nowhere else. Two merges then dropped every verb on an existing class: they
// appended only when "no class with this name exists", so `WormEntity:grapple`
// vanished into a list that already had WormEntity. Verbs survived only when
// they invented a brand-new class, reached neither the checker nor the
// autocomplete, and were lost on restart. The modal logged success while doing
// nothing durable -- the worst kind of UI lie.
// A verb now travels: modal -> customVerbs state -> custom_verbs.cfg on disk
// (+ localStorage mirror) -> checker overlay + autocomplete suggestions. The
// allowlist lives OUTSIDE the repo so the user edits it without touching
// source, which is the entire "if I die" point: a friend inherits a readable
// text file, not a fork.
//
// FORMAT
// custom_verbs.cfg is JSON: one array of verb rows. JSON because a verb has
// nested parameters, and the engine tables are JSON-shaped too -- one format
// for both, no second parser dialect to learn or to break. A hand-editable
// file that rejects the whole file over one bad row is a trap; the parser
// validates row by row and DROPS bad ones individually.
//
// RUST
// checks.rs takes the same overlay through `run_with_custom()` (plain `run()`
// delegates with an empty overlay, so the sweep bin and its tests are
// untouched). The IPC arg is optional, so NEW front end + OLD exe degrades to
// "no custom verbs known" instead of an invoke error.

import type { ClassDef, CustomVerb, MemberDef } from '../types/wormforge';

/** A Lua identifier: letters, digits, underscore, not starting with a digit. */
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Is `value` a Lua identifier? Trims before testing, so `  grapple  ` is valid
 * and `grap ple` / `1st` / `worm!` are not. Shared by the modal (submit-time
 * validation, so a bad name gets an inline error instead of silently failing
 * `sanitizeVerb` later) and by anything else that needs the same rule as the
 * parser -- one regex, one verdict.
 */
export function isValidIdent(value: string): boolean {
  return IDENT.test(value.trim());
}

/**
 * A *class* name for a custom verb: letters, digits, underscore and dots.
 *
 * Dots are allowed here because the class is the namespace the verb lives in
 * (`WormEntity:grapple`, `wa.math.cos`). The MEMBER name stays a strict
 * identifier — `grab ple` is still rejected. Dots in the member would be
 * ambiguous for the checker (a dotted name is a receiver + member chain).
 */
export function isValidClass(value: string): boolean {
  return /^([A-Za-z_][A-Za-z0-9_]*)(\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(value.trim());
}

export const VERB_FILE_NAME = 'custom_verbs.cfg';
export const VERBS_STORAGE_KEY = 'wormforge_custom_verbs';

/** A verb row straight off disk: shapes match CustomVerb when valid. */
interface RawVerb {
  class?: unknown;
  name?: unknown;
  kind?: unknown;
  syntax?: unknown;
  returnType?: unknown;
  parameters?: unknown;
  description?: unknown;
  example?: unknown;
}

/** One row, or null when the row is not a verb. Exported for tests. */
export function sanitizeVerb(raw: unknown): CustomVerb | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as RawVerb;
  if (typeof r.class !== 'string' || !isValidClass(r.class.trim())) return null;
  if (typeof r.name !== 'string' || !IDENT.test(r.name.trim())) return null;
  const kind = r.kind === 'method' || r.kind === 'variable' ? r.kind : null;
  if (!kind) return null;
  const syntax: ':' | '.' = r.syntax === ':' ? ':' : '.';
  const parameters = Array.isArray(r.parameters)
    ? r.parameters
        .filter(
          (p): p is { name?: unknown; type?: unknown } =>
            !!p && typeof p === 'object' && typeof p.name === 'string' && IDENT.test(p.name.trim())
        )
        .map((p) => ({ name: (p.name as string).trim(), type: typeof p.type === 'string' ? p.type : 'any' }))
    : [];
  return {
    class: r.class.trim(),
    name: r.name.trim(),
    kind,
    syntax,
    returnType: typeof r.returnType === 'string' ? r.returnType : 'any',
    parameters,
    description: typeof r.description === 'string' ? r.description : '',
    example: typeof r.example === 'string' ? r.example : '',
  };
}

/**
 * Parses a custom_verbs.cfg body. Returns the valid rows; bad rows are
 * dropped, never fatal -- one hand-edit typo must not nuke the allowlist.
 */
export function parseVerbsFile(text: string): CustomVerb[] {
  if (!text || !text.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: CustomVerb[] = [];
  const seen = new Set<string>();
  for (const raw of parsed) {
    const v = sanitizeVerb(raw);
    if (!v) continue;
    // First row wins, same as every merge in this app: an engine entry beats
    // an extracted one, an earlier row beats a later one.
    const key = `${v.class.toLowerCase()}:${v.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

/** Serializes verbs for disk. The shape is exactly what parseVerbsFile reads. */
export function serializeVerbsFile(verbs: CustomVerb[]): string {
  return JSON.stringify(verbs, null, 2);
}

/**
 * A verb as the docs pane / autocomplete already render a member.
 * `isCustom` is what paints the amber "custom" badge.
 */
export function verbToMember(v: CustomVerb): MemberDef {
  return {
    name: v.name,
    kind: v.kind,
    returnType: v.returnType,
    parameters: v.parameters,
    description: v.description || `User-registered engine verb (${v.class}${v.syntax}${v.name})`,
    example: v.example || `${v.class}${v.syntax}${v.name}(...)`,
    isCustom: true,
  };
}

/**
 * Member-level overlay: verbs LAND on existing classes instead of bouncing
 * off them. This is the fix for the dropped-verb bug -- every caller that
 * used to "skip when the class exists" now merges member by member.
 */

export function mergeCustomClasses(base: ClassDef[], verbs: CustomVerb[]): ClassDef[] {
  const list = base.map((c) => ({ ...c, members: [...c.members] }));
  for (const v of verbs) {
    const member = verbToMember(v);
    const existing = list.find((c) => c.name === v.class);
    if (existing) {
      if (!existing.members.some((m) => m.name === v.name)) existing.members.push(member);
    } else {
      list.push({
        name: v.class,
        description: `User-registered engine class (${v.class}${v.syntax}${v.name})`,
        syntaxExample: `${v.class}${v.syntax}${v.name}(...)`,
        members: [member],
        isCustom: true,
      });
    }
  }
  return list;
}

/**
 * The plain list Rust's `run_with_custom()` takes over IPC: one
 * (class, member) pair per verb. Descriptions do not cross the wire --
 * Rust only needs to know the pair EXISTS to stay silent.
 */
export function verbsForRust(verbs: CustomVerb[]): [string, string][] {
  return verbs.map((v) => [v.class, v.name]);
}

// ---- persistence ---------------------------------------------------------
//
// AppConfig on desktop (survives reinstalls), localStorage mirror everywhere
// (so verbs work in the browser path and survive a first launch before disk
// is ever touched). Both are read and merged, disk first: the file is the
// durable truth, the mirror is the cache.

async function appConfigDirPath(): Promise<string | null> {
  try {
    const { isDesktop } = await import('./modFolder');
    if (!isDesktop()) return null;
    const { appConfigDir } = await import('@tauri-apps/api/path');
    return await appConfigDir();
  } catch {
    return null;
  }
}

async function verbFilePath(): Promise<string | null> {
  const dir = await appConfigDirPath();
  if (!dir) return null;
  const sep = dir.endsWith('/') || dir.endsWith('\\') ? '' : '/';
  return `${dir}${sep}${VERB_FILE_NAME}`;
}

/** Every verb known at startup: disk file first, localStorage mirror after. */
export async function loadCustomVerbs(): Promise<CustomVerb[]> {
  const out: CustomVerb[] = [];
  const seen = new Set<string>();
  const id = (v: CustomVerb) => `${v.class.toLowerCase()}:${v.name.toLowerCase()}`;
  const add = (vs: CustomVerb[]) => {
    for (const v of vs) {
      const k = id(v);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(v);
    }
  };
  const path = await verbFilePath();
  if (path) {
    try {
      const { readTextFile } = await import('@tauri-apps/plugin-fs');
      add(parseVerbsFile(await readTextFile(path)));
    } catch {}
  }
  try {
    add(parseVerbsFile(localStorage.getItem(VERBS_STORAGE_KEY) ?? ''));
  } catch {}
  return out;
}

/**
 * Persists verbs. The localStorage mirror always writes (bare catch, project
 * convention); the disk file writes on desktop and reports failure honestly
 * so the caller can say so instead of logging a success it did not earn.
 */
export async function saveCustomVerbs(verbs: CustomVerb[]): Promise<{ disk: boolean }> {
  try {
    localStorage.setItem(VERBS_STORAGE_KEY, serializeVerbsFile(verbs));
  } catch {}
  const path = await verbFilePath();
  if (!path) return { disk: false };
  try {
    const { writeTextFile, mkdir } = await import('@tauri-apps/plugin-fs');
    const parent = path.replace(/[/\\][^/\\]+$/, '');
    try {
      await mkdir(parent, { recursive: true });
    } catch {}
    await writeTextFile(path, serializeVerbsFile(verbs));
    return { disk: true };
  } catch {
    return { disk: false };
  }
}

/** Where the file lives, for the settings UI to say honestly. Null = no disk. */
export async function customVerbsFilePath(): Promise<string | null> {
  return verbFilePath();
}
