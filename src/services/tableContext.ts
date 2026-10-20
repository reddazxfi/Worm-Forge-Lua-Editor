// Which documented table the caret is inside, so the editor can offer its keys.
//
// THE QUESTION THIS ANSWERS
// `wa.weapons.launch({ missile = { fus| } })` is not a member expression: `fuse`
// belongs to a record group, and nothing in the scope model or the handle
// registry knows that. This resolves the brace stack back to the call that owns
// it, then to the doc for that call (src/data/tableDocs.ts), then to the level
// the caret is on.
//
// WHAT IT WILL NOT DO
// It only answers for an INLINE table literal passed to a documented call. A
// table built in a variable and passed later (`local s = {...}; launch(s)`) needs
// dataflow, and guessing there would offer keys for the wrong table -- so it
// declines and the normal identifier completion takes over.
//
// Strings and comments are skipped while scanning, because `print("{")` and a
// commented-out table are not open braces. The scan stops at the caret: what
// comes AFTER it cannot change which brace is open.

import {
  fieldsAtPath,
  tableDocForCallee,
  type TableDoc,
  type TableField,
} from '../data/tableDocs';

export interface TableContext {
  doc: TableDoc;
  /** Keys from the call down to this table, e.g. ['missile', 'explosion']. */
  path: string[];
  /** The keys valid at the caret. */
  fields: TableField[];
  /** The identifier already typed at the caret, '' when none. */
  prefix: string;
  /**
   * True when the popup should open now: a word is being typed, or the caret
   * sits just past `{`, `,` or `;` (with at most spaces after it).
   */
  trigger: boolean;
  /**
   * Set when the caret is writing the VALUE of a key with named values, e.g.
   * `action = bo`. `fields` still describes the level.
   */
  valueField?: TableField;
  /** True when the value already has its opening quote (`action = "bo`). */
  quoted?: boolean;
}

/** Index just past a long bracket (`[=[ ... ]=]`) at `at`, or -1 when this is not one. */
function longBracketEnd(src: string, at: number, end: number): number {
  const m = /^\[(=*)\[/.exec(src.slice(at, Math.min(end, at + 12)));
  if (!m) return -1;
  const close = `]${m[1]}]`;
  const idx = src.indexOf(close, at + m[0].length);
  return idx === -1 ? end : Math.min(idx + close.length, end);
}

/** Advances past a string, long string or comment starting at `i`. */
function skipNonCode(src: string, i: number, end: number): number {
  const c = src[i];
  if (c === '-' && src[i + 1] === '-') {
    // `--[[ ... ]]`, `--[==[ ... ]==]`, or a line comment. Long brackets carry
    // any number of `=`, and a brace inside one is text, not a table.
    if (src[i + 2] === '[') {
      const close = longBracketEnd(src, i + 2, end);
      if (close !== -1) return close;
    }
    const nl = src.indexOf('\n', i);
    return nl === -1 || nl > end ? end : nl;
  }
  if (c === '"' || c === "'") {
    let j = i + 1;
    while (j < end) {
      if (src[j] === '\\') {
        j += 2;
        continue;
      }
      if (src[j] === c) return j + 1;
      // An unterminated single-line string ends at the newline: stopping there
      // keeps a stray quote from swallowing the rest of the file.
      if (src[j] === '\n') return j;
      j++;
    }
    return end;
  }
  if (c === '[') {
    const close = longBracketEnd(src, i, end);
    if (close !== -1) return close;
  }
  return i;
}

/** Indices of the `{` braces still open at `end`, outermost first. */
function openBraces(src: string, end: number): number[] {
  const stack: number[] = [];
  let i = 0;
  while (i < end) {
    const skipped = skipNonCode(src, i, end);
    if (skipped > i) {
      i = skipped;
      continue;
    }
    const c = src[i];
    if (c === '{') stack.push(i);
    else if (c === '}' && stack.length > 0) stack.pop();
    i++;
  }
  return stack;
}

type Owner =
  | { kind: 'key'; name: string }
  | { kind: 'call'; callee: string }
  | null;

/** What the brace at `brace` belongs to: `key = {` or `callee{` / `callee({`. */
function ownerOf(src: string, brace: number): Owner {
  const before = src.slice(0, brace).replace(/\s+$/, '');
  if (before.length === 0) return null;
  const last = before[before.length - 1];

  if (last === '=') {
    // Not an assignment: `==`, `~=`, `<=`, `>=`.
    const prev = before[before.length - 2] ?? '';
    if (prev === '=' || prev === '~' || prev === '<' || prev === '>') return null;
    const key = before.slice(0, -1).replace(/\s+$/, '').match(/([A-Za-z_]\w*)$/);
    return key ? { kind: 'key', name: key[1] } : null;
  }

  if (last === '(') {
    const callee = before.slice(0, -1).replace(/\s+$/, '').match(/([A-Za-z_][\w.]*)$/);
    return callee ? { kind: 'call', callee: callee[1] } : null;
  }

  // Table-call sugar: `wa.fog.light{ ... }`.
  if (/[A-Za-z0-9_)\]]/.test(last)) {
    const callee = before.match(/([A-Za-z_][\w.]*)$/);
    return callee ? { kind: 'call', callee: callee[1] } : null;
  }

  return null;
}

/**
 * The start of the current entry inside the table opened at `brace`: just past
 * the last `{`, `,` or `;` at THIS table's depth (not one inside a nested table).
 */
function entryStartInside(src: string, brace: number, end: number): number {
  let depth = 0;
  let start = brace + 1;
  let i = brace + 1;
  while (i < end) {
    const skipped = skipNonCode(src, i, end);
    if (skipped > i) {
      i = skipped;
      continue;
    }
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (depth === 0 && (c === ',' || c === ';')) start = i + 1;
    i++;
  }
  return start;
}

/**
 * Resolves the table the caret is in, or null.
 *
 * `src` must be the source up to the caret, not the whole file.
 */
export function tableContextAt(src: string): TableContext | null {
  const end = src.length;
  const stack = openBraces(src, end);
  if (stack.length === 0) return null;

  const brace = stack[stack.length - 1];
  const entryStart = entryStartInside(src, brace, end);
  const entry = src.slice(entryStart, end);
  const trimmed = entry.trim();

  // Two positions are useful here:
  //   key position    `fus` or (empty, just after `{`/`,`)
  //   value position  `action = bo` or `action = "bo`, for keys with named values
  // Anything else -- a number, a call, a nested table -- is none of our business.
  let prefix = '';
  let keyPart: string | null = null;
  let quoted = false;
  if (trimmed.length > 0) {
    const eq = trimmed.indexOf('=');
    const isAssignment = eq > 0 && !'=~<>'.includes(trimmed[eq - 1] ?? '');
    if (isAssignment) {
      keyPart = trimmed.slice(0, eq).trim();
      const rawValue = trimmed.slice(eq + 1).trim();
      if (!/^[A-Za-z_]\w*$/.test(keyPart)) return null;
      if (!/^"?[A-Za-z_]*$/.test(rawValue)) return null;
      quoted = rawValue.startsWith('"');
      prefix = quoted ? rawValue.slice(1) : rawValue;
    } else if (/^[A-Za-z_]\w*$/.test(trimmed)) {
      prefix = trimmed;
    } else {
      return null;
    }
  }

  // Walk out to the call that owns this table, collecting the keys between.
  const keys: string[] = [];
  let doc: TableDoc | undefined;
  for (let i = stack.length - 1; i >= 0; i--) {
    const owner = ownerOf(src, stack[i]);
    if (!owner) return null;
    if (owner.kind === 'key') {
      keys.push(owner.name);
      continue;
    }
    doc = tableDocForCallee(owner.callee);
    if (!doc) return null;
    break;
  }
  if (!doc) return null;

  const path = keys.reverse();
  const fields = fieldsAtPath(doc, path);
  if (!fields) return null;

  let valueField: TableField | undefined;
  if (keyPart !== null) {
    const found = fields.find((f) => f.name === keyPart);
    // Only keys with named values get value completion; `fuse = ` is a number
    // and suggesting anything there would be noise.
    if (!found || !found.values?.length) return null;
    valueField = found;
  }

  const sep = src[entryStart - 1] ?? '';
  const spacesOnly = /^[ \t]*$/.test(entry);
  const trigger = valueField
    ? true
    : prefix.length > 0 || (spacesOnly && (sep === '{' || sep === ',' || sep === ';'));

  return { doc, path, fields, prefix, trigger, valueField, quoted };
}

/** One row the editor can insert for a table key. */
export interface TableKeySuggestion {
  name: string;
  /** The text to put at the caret, including the `=` and (for tables) braces. */
  insertText: string;
  /** Where the caret lands relative to the end of `insertText`. */
  cursorBack?: number;
  detail: string;
  documentation: string;
  nested: boolean;
}

/**
 * The completions for a table context, already filtered by the typed prefix.
 *
 * Building them here rather than inside the editor keeps the promise testable:
 * a key's insert text, its caret position and its caveat are data, and the
 * pointer handler should not be the only place they exist.
 */
export function tableKeySuggestions(context: TableContext): TableKeySuggestion[] {
  const query = context.prefix.toLowerCase();
  const out: TableKeySuggestion[] = [];
  for (const field of context.fields) {
    // A key the engine now rejects is documentation, not a suggestion. It stays
    // in the doc pane (struck through, with the replacement) but is never offered
    // for insertion: autocomplete must not write code the call will refuse.
    if (field.gone) continue;
    if (query && !field.name.toLowerCase().includes(query)) continue;
    const nested = field.kind === 'table' && !!field.children?.length;
    out.push({
      name: field.name,
      // `= {  }` keeps the table balanced and puts the caret between the braces,
      // so the next keystroke goes where the user expects.
      insertText: nested ? `${field.name} = {  }` : `${field.name} = `,
      cursorBack: nested ? 2 : undefined,
      detail: `${field.name} — ${fieldTypeLabel(field)}${field.required ? ' (required)' : ''}`,
      documentation: fieldDocText(field) || `${context.doc.id} key`,
      nested,
    });
  }
  return out;
}

/** The completions for a key's named values, already filtered by the prefix. */
export function tableValueSuggestions(context: TableContext): TableKeySuggestion[] {
  const field = context.valueField;
  if (!field?.values?.length) return [];
  const query = context.prefix.toLowerCase();
  const out: TableKeySuggestion[] = [];
  for (const [name, value] of field.values) {
    if (query && !name.toLowerCase().includes(query)) continue;
    out.push({
      name,
      // If the user already typed the opening quote, insert only the name: the
      // editor replaces the word at the caret, not the quote before it.
      insertText: context.quoted ? name : `"${name}"`,
      detail: `${name} = ${value}`,
      documentation: `${field.description ? `${field.description} ` : ''}${name} = ${value}.`,
      nested: false,
    });
  }
  return out;
}

/** A short type label for a field, for the tree, the doc pane and the popup. */
export function fieldTypeLabel(field: TableField): string {
  if (field.type) return field.type;
  switch (field.kind) {
    case 'bool':
      return 'true | false';
    case 'int':
      return 'int';
    case 'number':
      return 'number';
    case 'sprite':
      return 'sprite (name or id)';
    case 'string':
      return 'string';
    case 'enum':
      return field.values?.map(([name]) => String(name)).join(' | ') ?? 'enum';
    case 'table':
      return 'table';
    case 'handle':
      return 'handle';
    case 'function':
      return 'function';
    default:
      return 'any';
  }
}

/** One paragraph for the completion popup: what the key is, and its caveats. */
export function fieldDocText(field: TableField): string {
  const bits: string[] = [];
  if (field.description) bits.push(field.description);
  if (field.values?.length) {
    bits.push(`One of: ${field.values.map(([name, value]) => `${name} (${value})`).join(', ')}.`);
  }
  if (field.required) bits.push('Required.');
  if (field.action) bits.push(`Only with missile.action = "${field.action}".`);
  if (field.gone) bits.push(`Removed in Lua API 4 -- write ${field.gone}.`);
  if (field.families?.length && field.kind !== 'table') {
    bits.push(`Weapon families: ${field.families.join(', ')}.`);
  }
  return bits.join(' ');
}
