// A profile, read for display.
//
// Profiles are data, not code: `WormForge/Profiles/<Name>.toml` selects
// components and weapon placements and is resolved by the loader without running
// any Lua. Nothing here executes or validates a profile the way the engine does
// -- this is a SUMMARY for a human deciding what to open, and it says so
// wherever it can't account for something.
//
// WHY A HAND-WRITTEN READER, NOT A TOML LIBRARY
// --------------------------------------------
// No TOML parser is installed and none was approved for this project. The plan
// (docs/mod-workspace-navigation-plan.md, "Proposed technical shape" §3) says to
// keep parsing narrowly scoped and visibly mark unsupported constructs rather
// than half-support the format. So this reads the handful of keys a summary
// needs, and every section it does not understand is listed in
// `unknownSections` -- the profile card shows that, instead of implying the
// profile has nothing else in it.
//
// The one structural thing worth trusting: the ENGINE owns validation. A wrong
// or unsupported profile is rejected by the loader with a precise message; the
// editor must not pretend to be that authority.

export interface ProfileWeapon {
  /** Component id, e.g. `px.double_bazooka`. */
  id: string;
  /** Panel position, when the profile pins one. */
  row?: string;
  column?: number;
}

export interface ProfileSummary {
  description: string;
  /** Component ids the profile switches on, in file order. */
  features: string[];
  weapons: ProfileWeapon[];
  /** `[options.<component>]` values. */
  optionCount: number;
  /** `[weapon_options.<feature>.<weapon>]` values. */
  weaponOptionCount: number;
  /** `[weapon_settings.<component>]` overrides. */
  weaponSettingCount: number;
  /** The profile carries its own WA scheme settings. */
  hasScheme: boolean;
  /** Crate odds overridden. */
  hasCrates: boolean;
  /** Named utility crate weights, independent of weapon placement. */
  hasUtilityCrates: boolean;
  /**
   * Section headers this reader does not model. Non-empty means the card is
   * incomplete, and it says so rather than silently dropping them.
   */
  unknownSections: string[];
}

export const EMPTY_PROFILE: ProfileSummary = {
  description: '',
  features: [],
  weapons: [],
  optionCount: 0,
  weaponOptionCount: 0,
  weaponSettingCount: 0,
  hasScheme: false,
  hasCrates: false,
  hasUtilityCrates: false,
  unknownSections: [],
};

/** `key = value`, with `key` bare, `"quoted"` or `'quoted'`. */
const KEY_VALUE = /^(?:"([^"]*)"|'([^']*)'|([A-Za-z0-9_.-]+))\s*=\s*(.*)$/;
const TABLE_HEADER = /^\[\[?([^\]]+)\]\]?/;

/** Strips an unquoted trailing `# comment`. Quotes are respected so a `#` in a description survives. */
function stripComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === '#' && !inSingle && !inDouble) return line.slice(0, i);
  }
  return line;
}

function unquote(value: string): string {
  const t = value.trim();
  if (
    (t.startsWith('"') && t.endsWith('"') && t.length >= 2) ||
    (t.startsWith("'") && t.endsWith("'") && t.length >= 2)
  ) {
    return t.slice(1, -1);
  }
  return t;
}

/** `["a", "b"]` -> ['a', 'b']. Returns null when the brackets do not close on this text. */
function parseStringArray(value: string): string[] | null {
  const open = value.indexOf('[');
  const close = value.lastIndexOf(']');
  if (open === -1 || close <= open) return null;
  return value
    .slice(open + 1, close)
    .split(',')
    .map((part) => unquote(part))
    .filter((part) => part.length > 0);
}

function parseWeapon(id: string, raw: string): ProfileWeapon {
  const value = raw.trim();
  if (value === 'true' || value === 'false') return { id };
  const row = value.match(/row\s*=\s*(?:"([^"]*)"|'([^']*)')/);
  const column = value.match(/column\s*=\s*(-?\d+)/);
  const weapon: ProfileWeapon = { id };
  if (row) weapon.row = row[1] ?? row[2] ?? '';
  if (column) weapon.column = Number(column[1]);
  return weapon;
}

/**
 * Splits a table header on DOTS that are outside quotes.
 *
 * `weapons."px.javelin"` is two segments, not three: component ids contain dots
 * (`px.javelin`, `core.utilities`), so a naive `split('.')` turns every one of
 * them into a bogus nested table. Quotes are stripped from each part.
 */
function splitTablePath(raw: string): string[] {
  const parts: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  for (const c of raw) {
    if (quote) {
      if (c === quote) quote = null;
      else cur += c;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '.') {
      parts.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  parts.push(cur.trim());
  return parts;
}

type Section =
  | { kind: 'top' }
  | { kind: 'weapons' }
  /** `[weapons."<id>"]` -- the table form of one placement. */
  | { kind: 'weapon'; id: string }
  | { kind: 'scheme' }
  | { kind: 'crates' }
  | { kind: 'utility_crates' }
  | { kind: 'options' }
  | { kind: 'weapon_options' }
  | { kind: 'weapon_settings' };

function classify(header: string): Section | null {
  const path = splitTablePath(header);
  const first = (path[0] ?? '').toLowerCase();
  switch (first) {
    case 'weapons':
      // Both forms are real. `[weapons]` holds inline `"id" = { row, column }`
      // (or `= true`) lines; `[weapons."id"]` is the same placement written as
      // a table, which is what px/profiles/Funny.toml uses.
      if (path.length >= 2 && path[1]) return { kind: 'weapon', id: path[1] };
      return { kind: 'weapons' };
    case 'scheme':
      return { kind: 'scheme' };
    case 'crates':
      return { kind: 'crates' };
    case 'utility_crates':
      return { kind: 'utility_crates' };
    case 'options':
      return { kind: 'options' };
    case 'weapon_options':
      return { kind: 'weapon_options' };
    case 'weapon_settings':
      return { kind: 'weapon_settings' };
    default:
      // Anything the engine adds later.
      return null;
  }
}

export function parseProfile(toml: string): ProfileSummary {
  const out: ProfileSummary = {
    ...EMPTY_PROFILE,
    features: [],
    weapons: [],
    unknownSections: [],
  };

  let section: Section = { kind: 'top' };
  /** The placement a `[weapons."<id>"]` table is filling in, if that is the open section. */
  let openWeapon: ProfileWeapon | null = null;
  // A multi-line `features = [` array: legal TOML, and the one list whose
  // contents actually matter for the cross-links.
  let pendingFeatures: string | null = null;

  for (const rawLine of toml.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = stripComment(rawLine).trim();
    if (!line) continue;

    if (pendingFeatures !== null) {
      pendingFeatures += ` ${line}`;
      const parsed = parseStringArray(pendingFeatures);
      if (parsed) {
        out.features.push(...parsed);
        pendingFeatures = null;
      }
      continue;
    }

    const header = line.match(TABLE_HEADER);
    if (header) {
      // `[[table]]` is an array of tables; profiles have none. Say so.
      if (line.startsWith('[[')) {
        out.unknownSections.push(line);
        section = { kind: 'top' };
        continue;
      }
      const next = classify(header[1]);
      if (next) {
        section = next;
        openWeapon = null;
        if (next.kind === 'weapon') {
          openWeapon = { id: next.id };
          out.weapons.push(openWeapon);
        }
      } else {
        out.unknownSections.push(header[1].trim());
        section = { kind: 'top' };
        openWeapon = null;
      }
      continue;
    }

    const kv = line.match(KEY_VALUE);
    if (!kv) {
      // Not a key and not a header: leave a mark rather than skip silently.
      out.unknownSections.push(line.slice(0, 40));
      continue;
    }
    const key = kv[1] ?? kv[2] ?? kv[3] ?? '';
    const value = kv[4] ?? '';

    switch (section.kind) {
      case 'top':
        if (key === 'description') out.description = unquote(value);
        else if (key === 'features') {
          const parsed = parseStringArray(value);
          if (parsed) out.features.push(...parsed);
          else pendingFeatures = `features = ${value}`;
        }
        // `scheme`, `utility_crates`, `crates` written as inline tables.
        else if (key === 'scheme') out.hasScheme = true;
        else if (key === 'utility_crates') out.hasUtilityCrates = true;
        else if (key === 'crates') out.hasCrates = true;
        else if (key === 'weapons' || key === 'options' || key === 'weapon_options' || key === 'weapon_settings') {
          // Inline-table form of a whole section. Not modelled; flag it.
          out.unknownSections.push(`${key} (inline table)`);
        }
        break;
      case 'weapons':
        out.weapons.push(parseWeapon(key, value));
        break;
      case 'weapon': {
        // `row` and `column` are the whole placement (`panel.rs:36`). Any other
        // key would be rejected by the loader, not by us.
        if (!openWeapon) break;
        if (key === 'row') openWeapon.row = unquote(value);
        else if (key === 'column') {
          const column = Number(unquote(value));
          if (Number.isFinite(column)) openWeapon.column = column;
        }
        break;
      }
      case 'options':
        out.optionCount++;
        break;
      case 'weapon_options':
        out.weaponOptionCount++;
        break;
      case 'weapon_settings':
        out.weaponSettingCount++;
        break;
      case 'scheme':
        out.hasScheme = true;
        break;
      case 'crates':
        out.hasCrates = true;
        break;
      case 'utility_crates':
        out.hasUtilityCrates = true;
        break;
    }
  }

  // An unclosed `features = [` means the array never finished; mark it so a
  // half-read feature list is never shown as the whole one.
  if (pendingFeatures !== null) out.unknownSections.push('features (unterminated array)');

  return out;
}

/** A component declared by an installed mod, for turning a feature id into a file. */
export interface ComponentSource {
  /** The bundle's `id` from mod.toml. */
  modId: string;
  /** The folder name on disk. */
  modFolder: string;
  /** Component id, e.g. `tools.audit`. */
  componentId: string;
  /** Component type (`feature`, `weapon`). */
  type?: string;
  /** The component's declared entry, as written in mod.toml. */
  entry?: string;
}

export interface FeatureLink {
  id: string;
  /** Undefined when no installed mod declares this component. */
  source?: ComponentSource;
}

/**
 * Resolves a profile's `features` against the components the installed mods
 * declare.
 *
 * Unresolved ids are kept, with `source` undefined. The plan is explicit that
 * these are shown as warnings and never guessed: an id that names no installed
 * component is exactly what the loader reports as "not installed", and inventing
 * a link by matching a suffix would point the user at the wrong file.
 */
export function linkFeatures(features: string[], components: ComponentSource[]): FeatureLink[] {
  const byId = new Map<string, ComponentSource>();
  for (const c of components) if (!byId.has(c.componentId)) byId.set(c.componentId, c);
  return features.map((id) => ({ id, source: byId.get(id) }));
}

/**
 * Whether a mod bundles a profile of this name.
 *
 * Name-only, deliberately: a bundled `profiles/Highlander.toml` and an installed
 * `Profiles/Highlander.toml` are related, but the loader copies the first to the
 * second only when no file of that name exists yet (`adopt_profiles`), so their
 * CONTENTS may have diverged since. The UI says "shares a name", never "same
 * profile".
 */
export function bundledBy(
  profileName: string,
  mods: { id: string; folderName: string; bundledProfiles?: string[] }[]
): { id: string; folderName: string }[] {
  const wanted = profileName.trim().toLowerCase();
  return mods
    .filter((m) => (m.bundledProfiles ?? []).some((p) => p.toLowerCase() === wanted))
    .map((m) => ({ id: m.id, folderName: m.folderName }));
}
