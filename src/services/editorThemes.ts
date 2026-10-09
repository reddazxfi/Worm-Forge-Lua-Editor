// The syntax palette: which colour each kind of Lua token gets.
//
// WHY A TABLE INSTEAD OF INLINE TERNARIES
// §33 rebuilt the highlighter with ~18 `isLight ? '...' : '...'` ternaries. That
// made the palette impossible to see as a whole and impossible to change without
// touching the scanning logic. The classes move here; the scanner keeps only the
// shape of the code. Everything here is DATA.
//
// THE TAILWIND TRAP -- READ BEFORE ADDING A COLOUR
// Tailwind v4 does not see class names built at runtime. Writing `text-${hue}-400`
// produces markup Tailwind never scans, so the class is not generated and the span
// renders in the inherited colour with no error anywhere. Every colour must exist
// as a COMPLETE LITERAL STRING somewhere in the source.
//
// That is the whole reason `THEME_SWATCHES` exists and why the UI offers a
// dropdown of swatches instead of a free colour picker. A user-chosen `#ff00ff`
// cannot become a Tailwind class, so it could not be honoured without either a
// purge bug or an unsafe inline-style escape hatch. Overrides are validated
// against the allowlist below: an unknown value is IGNORED, not rendered.

/** The token kinds a theme can colour. Also the user-facing vocabulary. */
export type SyntaxToken =
  | 'comment'
  | 'keyword'
  | 'type'
  | 'functionCall'
  | 'member'
  | 'method'
  | 'waHandle'
  | 'declaration'
  | 'global'
  | 'string'
  | 'number'
  | 'operator'
  | 'bracket'
  | 'punctuation';

/** A palette entry is a COMPLETE class string, weights included. */
export type TokenClasses = Record<SyntaxToken, string>;

export type SyntaxOverrides = Partial<Record<SyntaxToken, string>>;

export interface SyntaxPreset {
  id: string;
  name: string;
  description: string;
  palette: { dark: TokenClasses; light: TokenClasses };
}

export const DEFAULT_PRESET_ID = 'classic';

/**
 * Order matters: it is the order the rows appear in the settings UI, roughly from
 * "structure of the file" to "punctuation".
 */
export const SYNTAX_TOKENS: { key: SyntaxToken; label: string; sample: string }[] = [
  { key: 'comment', label: 'Comments', sample: '-- draw the timer' },
  { key: 'keyword', label: 'Keywords', sample: 'local if end then' },
  { key: 'type', label: 'Type annotations', sample: 'function f(x: number)' },
  { key: 'functionCall', label: 'Function calls', sample: 'print(1)' },
  { key: 'member', label: 'Members (dot)', sample: 'wa.log' },
  { key: 'method', label: 'Methods (colon)', sample: 'worm:gfx()' },
  { key: 'waHandle', label: 'The wa handle', sample: 'wa' },
  { key: 'declaration', label: 'Declared names', sample: 'local t = {}' },
  { key: 'global', label: 'Lua globals', sample: 'math ipairs' },
  { key: 'string', label: 'Strings', sample: '"RED TEAM"' },
  { key: 'number', label: 'Numbers & hex', sample: '0xFF 120' },
  { key: 'operator', label: 'Operators', sample: '+ - == ..' },
  { key: 'bracket', label: 'Brackets', sample: '( ) { } [ ]' },
  { key: 'punctuation', label: 'Punctuation', sample: ', . ; :' },
];

const CLASSIC_DARK: TokenClasses = {
  comment: 'text-slate-500 italic font-normal',
  keyword: 'text-rose-400 font-medium',
  type: 'text-purple-400 font-medium',
  functionCall: 'text-cyan-300',
  member: 'text-cyan-200/80',
  method: 'text-emerald-400 font-medium',
  waHandle: 'text-cyan-400 font-semibold',
  declaration: 'text-sky-300 font-medium',
  global: 'text-teal-300',
  string: 'text-lime-300 font-mono',
  number: 'text-orange-400',
  operator: 'text-rose-300',
  bracket: 'text-slate-500',
  punctuation: 'text-slate-400',
};

const CLASSIC_LIGHT: TokenClasses = {
  comment: 'text-slate-500 italic font-normal',
  keyword: 'text-purple-700 font-bold',
  type: 'text-indigo-600 font-semibold',
  functionCall: 'text-cyan-700',
  member: 'text-cyan-800',
  method: 'text-teal-700 font-bold',
  waHandle: 'text-blue-700 font-extrabold',
  declaration: 'text-blue-800 font-medium',
  global: 'text-teal-700',
  string: 'text-emerald-700 font-mono font-semibold',
  number: 'text-amber-700 font-semibold',
  operator: 'text-rose-600',
  bracket: 'text-slate-400',
  punctuation: 'text-slate-500',
};

/**
 * `calm` answers the "too many hues, it is tiring" complaint: four accents
 * (violet keywords, blue names, green strings, amber numbers) with operators and
 * brackets pushed to neutral slate, so punctuation recedes and the words carry
 * the colour.
 *
 * `contrast` is the opposite end of the scale, for bright rooms or dim screens.
 */
const CALM_DARK: TokenClasses = {
  comment: 'text-slate-500 italic font-normal',
  keyword: 'text-violet-400 font-medium',
  type: 'text-violet-300 font-normal',
  functionCall: 'text-blue-300',
  member: 'text-blue-300/70',
  method: 'text-blue-300',
  waHandle: 'text-blue-200 font-semibold',
  declaration: 'text-blue-200 font-medium',
  global: 'text-blue-300',
  string: 'text-emerald-300 font-mono',
  number: 'text-amber-300',
  operator: 'text-slate-400',
  bracket: 'text-slate-600',
  punctuation: 'text-slate-500',
};

const CALM_LIGHT: TokenClasses = {
  comment: 'text-slate-500 italic font-normal',
  keyword: 'text-violet-700 font-semibold',
  type: 'text-violet-600 font-normal',
  functionCall: 'text-blue-700',
  member: 'text-blue-700/70',
  method: 'text-blue-700',
  waHandle: 'text-blue-900 font-bold',
  declaration: 'text-blue-900 font-semibold',
  global: 'text-blue-700',
  string: 'text-emerald-700 font-mono',
  number: 'text-amber-700',
  operator: 'text-slate-500',
  bracket: 'text-slate-400',
  punctuation: 'text-slate-500',
};

const CONTRAST_DARK: TokenClasses = {
  comment: 'text-slate-400 italic font-normal',
  keyword: 'text-fuchsia-400 font-semibold',
  type: 'text-orange-300 font-medium',
  functionCall: 'text-yellow-200 font-semibold',
  member: 'text-yellow-200/70',
  method: 'text-yellow-300 font-semibold',
  waHandle: 'text-orange-400 font-bold',
  declaration: 'text-green-300 font-semibold',
  global: 'text-cyan-200',
  string: 'text-lime-200 font-mono',
  number: 'text-amber-300 font-semibold',
  operator: 'text-fuchsia-300',
  bracket: 'text-slate-400',
  punctuation: 'text-slate-500',
};

const CONTRAST_LIGHT: TokenClasses = {
  comment: 'text-slate-600 italic font-normal',
  keyword: 'text-fuchsia-700 font-bold',
  type: 'text-orange-700 font-semibold',
  functionCall: 'text-yellow-700 font-bold',
  member: 'text-yellow-700/70',
  method: 'text-yellow-800 font-bold',
  waHandle: 'text-orange-800 font-bold',
  declaration: 'text-green-800 font-bold',
  global: 'text-cyan-800',
  string: 'text-lime-800 font-mono',
  number: 'text-amber-800 font-bold',
  operator: 'text-fuchsia-700',
  bracket: 'text-slate-500',
  punctuation: 'text-slate-600',
};

/**
 * `classic` is a VERBATIM copy of the §33 palette and is the default, so anyone
 * upgrading sees exactly what they saw before. A theming feature must never
 * silently restyle the editor.
 */
export const SYNTAX_PRESETS: SyntaxPreset[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'The original WormForge palette from §33. Nine accents, VS Code-like.',
    palette: { dark: CLASSIC_DARK, light: CLASSIC_LIGHT },
  },
  {
    id: 'calm',
    name: 'Calm',
    description: 'Four accents only. Punctuation recedes so the names carry the colour.',
    palette: { dark: CALM_DARK, light: CALM_LIGHT },
  },
  {
    id: 'contrast',
    name: 'High Contrast',
    description: 'Brighter and more separated. For bright rooms or dim screens.',
    palette: { dark: CONTRAST_DARK, light: CONTRAST_LIGHT },
  },
];
/**
 * The colour allowlist. Every value is a complete literal class string, which is
 * exactly what makes it safe for Tailwind's scanner: the strings appear in this
 * file, so Tailwind generates them, and the UI can only ever hand back one.
 *
 * The list spans a wide lightness range per hue because dark and light
 * backgrounds need different steps -- `text-rose-300` is unreadable on white, and
 * `text-rose-800` is invisible on `#0e1115`.
 */
export const THEME_SWATCHES: string[] = [
  // neutrals
  'text-slate-200', 'text-slate-300', 'text-slate-400', 'text-slate-500',
  'text-slate-600', 'text-slate-700',
  'text-slate-300/70', 'text-slate-400/70', 'text-slate-500/70',
  'text-cyan-200/80', 'text-sky-300', 'text-rose-600',
  // warm
  'text-rose-300', 'text-rose-400', 'text-rose-500', 'text-rose-700', 'text-rose-800',
  'text-orange-300', 'text-orange-400', 'text-orange-700', 'text-orange-800',
  'text-amber-300', 'text-amber-400', 'text-amber-500', 'text-amber-700', 'text-amber-800',
  'text-yellow-200', 'text-yellow-300', 'text-yellow-700', 'text-yellow-800',
  // green
  'text-lime-200', 'text-lime-300', 'text-emerald-300', 'text-emerald-400',
  'text-emerald-700', 'text-emerald-800',
  'text-green-300', 'text-green-800', 'text-lime-800',
  // cool
  'text-teal-200', 'text-teal-300', 'text-teal-700', 'text-cyan-200',
  'text-cyan-300', 'text-cyan-400', 'text-cyan-700', 'text-cyan-800',
  'text-blue-200', 'text-blue-300', 'text-blue-400', 'text-blue-700',
  'text-blue-800', 'text-blue-900',
  'text-blue-300/70', 'text-blue-200/70', 'text-cyan-200/70', 'text-yellow-200/70',
  'text-blue-700/70', 'text-yellow-700/70',
  // violet
  'text-indigo-600', 'text-violet-300', 'text-violet-400', 'text-violet-600',
  'text-violet-700', 'text-purple-300', 'text-purple-400', 'text-purple-700',
  'text-fuchsia-300', 'text-fuchsia-400', 'text-fuchsia-700',
];

const SWATCH_SET = new Set(THEME_SWATCHES);

/** True only for a value Tailwind is guaranteed to have generated. */
export function isValidSwatch(value: unknown): value is string {
  return typeof value === 'string' && SWATCH_SET.has(value);
}

/**
 * Unknown preset ids fall back to the default rather than throwing, matching how
 * `parseIniConfig` treats an unrecognised `launch_mode`. A hand-edited or
 * out-of-date config must never put the editor into a state it cannot render.
 */
export function getPreset(id: string | undefined): SyntaxPreset {
  return SYNTAX_PRESETS.find((p) => p.id === id) ?? SYNTAX_PRESETS[0];
}

/**
 * Resolves the final class string per token for one mode: preset first, then user
 * overrides on top.
 *
 * Overrides are stored PER MODE, because a colour that reads well on `#0e1115`
 * does not read well on white. A dark override must not restyle the light editor.
 *
 * An override that is not a known swatch is discarded. That validation is also
 * what stops a hand-edited config from injecting arbitrary attributes: these
 * strings land in a `class` attribute on a span built from the user's own source.
 */
export function resolveTokenClasses(
  isLight: boolean,
  presetId?: string,
  darkOverrides?: SyntaxOverrides,
  lightOverrides?: SyntaxOverrides,
): TokenClasses {
  const base = getPreset(presetId).palette[isLight ? 'light' : 'dark'];
  const overrides = isLight ? lightOverrides : darkOverrides;
  const resolved = { ...base };
  if (!overrides) return resolved;
  for (const { key } of SYNTAX_TOKENS) {
    const candidate = overrides[key];
    if (isValidSwatch(candidate)) resolved[key] = candidate;
  }
  return resolved;
}

/**
 * A stable string for the highlight cache. The cache in CodeEditor.tsx is keyed by
 * line text and theme, so switching preset or toggling one override has to change
 * this or the editor keeps serving markup built for the old palette.
 */
export function themeSignature(
  presetId: string | undefined,
  darkOverrides?: SyntaxOverrides,
  lightOverrides?: SyntaxOverrides,
): string {
  const part = (o?: SyntaxOverrides) =>
    SYNTAX_TOKENS.map((t) => (o && isValidSwatch(o[t.key]) ? o[t.key] : '-')).join(',');
  return `${presetId ?? DEFAULT_PRESET_ID}|${part(darkOverrides)}|${part(lightOverrides)}`;
}

/** Human-readable swatch name for the settings dropdown, e.g. `rose-400`. */
export function swatchLabel(cls: string): string {
  return cls.replace(/^text-/, '').replace(/\//g, ' / ');
}
