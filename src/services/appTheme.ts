// App-surface colours live outside the syntax palette: the syntax palette styles
// tokens INSIDE the editor, while these colours paint the chrome around it.
//
// The user can choose one background per theme. We derive every other surface
// from that single colour, mixing toward white (dark theme) or toward white/black
// (light theme), so the sidebar, editor, console and toolbar stay related instead
// of turning into a patchwork of unrelated Tailwind shades.
//
// A chosen colour is only accepted when it belongs to the same luminance family
// as the active theme. Every component still switches its TEXT and BORDER classes
// on `isLight`; accepting a white background in dark mode would therefore leave
// light text on a light surface. Rejecting it at the picker is deliberate, and
// the preset list is pre-vetted so the common path cannot produce that state.

export type AppThemeMode = 'dark' | 'light';

export interface AppSurfaces {
  /** The outer window / main workspace. */
  app: string;
  /** Top header, toolbars, pane headers. */
  header: string;
  /** File-tab strip and the mobile tab bar. */
  tabs: string;
  /** The sidebar container. */
  sidebar: string;
  /** API tree surface (sits inside the sidebar). */
  tree: string;
  /** Documentation pane surface. */
  doc: string;
  /** Code-editor canvas. */
  editor: string;
  /** Line-number gutter. */
  gutter: string;
  /** Console output canvas. */
  console: string;
  /** Elevated editor toolbar / accent strip. */
  panel: string;
  /** Draggable splitters. */
  divider: string;
}

export const DEFAULT_APP_BACKGROUNDS: Record<AppThemeMode, string> = {
  dark: '#0e1115',
  light: '#f1f5f9',
};

export interface AppBackgroundPreset {
  name: string;
  dark: string;
  light: string;
}

/**
 * A small, curated list. Each pair has the same hue in both modes, so switching
 * dark/light keeps the user's choice recognisable rather than jumping to an
 * unrelated colour. Every value is checked by the tests against the luminance
 * gate below.
 */
export const APP_BACKGROUND_PRESETS: readonly AppBackgroundPreset[] = [
  { name: 'Default', dark: '#0e1115', light: '#f1f5f9' },
  { name: 'Midnight', dark: '#0b1220', light: '#eef4ff' },
  { name: 'Slate', dark: '#111827', light: '#f8fafc' },
  { name: 'Forest', dark: '#0c1a14', light: '#f0fdf4' },
  { name: 'Ocean', dark: '#071a1f', light: '#ecfeff' },
  { name: 'Plum', dark: '#1a1024', light: '#faf5ff' },
  { name: 'Ember', dark: '#1f1512', light: '#fff7ed' },
  { name: 'Graphite', dark: '#18181b', light: '#f4f4f5' },
];

/** Accepts `#rgb` or `#rrggbb`, with optional whitespace; returns lowercase. */
export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }
  if (/^#[0-9a-f]{6}$/.test(trimmed)) return trimmed;
  return null;
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const channel = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** Mix `from` toward `to` by `amount` (0..1). */
function mix(from: string, to: string, amount: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const t = Math.max(0, Math.min(1, amount));
  return rgbToHex(
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  );
}

function channelLuminance(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance, 0 (black) .. 1 (white). */
export function relativeLuminance(hex: string): number {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return 0;
  const [r, g, b] = hexToRgb(normalized);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/**
 * Keep the chosen surface in the same luminance family as the theme. The limits
 * are deliberately tight: `slate-700` (#334155) still reads well with the light
 * text, while `slate-600` starts to swallow the muted labels. On the light side,
 * `slate-300` (#cbd5e1) would leave the small grey labels too close, so the
 * editor asks for `slate-200` or lighter.
 */
export function isUsableBackground(value: unknown, mode: AppThemeMode): boolean {
  const hex = normalizeHexColor(value);
  if (!hex) return false;
  const luminance = relativeLuminance(hex);
  return mode === 'dark' ? luminance <= 0.08 : luminance >= 0.7;
}

/**
 * Normalised, theme-safe hex, or '' for "use the default". This is the single
 * gate used by both localStorage loading and .ini/.json import, so a hand-edited
 * value can never reach an inline style unchecked.
 */
export function sanitizeBackground(value: unknown, mode: AppThemeMode): string {
  const hex = normalizeHexColor(value);
  if (!hex) return '';
  return isUsableBackground(hex, mode) ? hex : '';
}

/**
 * Derive every surface from the chosen base. Invalid or absent values fall back
 * to the theme default, so a stale config still renders the stock theme.
 */
export function getAppSurfaces(mode: AppThemeMode, customBackground?: string): AppSurfaces {
  const base = sanitizeBackground(customBackground, mode) || DEFAULT_APP_BACKGROUNDS[mode];

  if (mode === 'dark') {
    return {
      app: base,
      header: mix(base, '#ffffff', 0.07),
      tabs: mix(base, '#ffffff', 0.02),
      sidebar: mix(base, '#ffffff', 0.1),
      tree: mix(base, '#ffffff', 0.12),
      doc: mix(base, '#ffffff', 0.08),
      editor: mix(base, '#ffffff', 0.03),
      gutter: mix(base, '#ffffff', 0.06),
      console: mix(base, '#ffffff', 0.07),
      panel: mix(base, '#ffffff', 0.14),
      divider: mix(base, '#ffffff', 0.18),
    };
  }

  return {
    app: base,
    header: mix(base, '#ffffff', 0.55),
    tabs: mix(base, '#000000', 0.06),
    sidebar: mix(base, '#ffffff', 0.45),
    tree: mix(base, '#ffffff', 0.45),
    doc: mix(base, '#ffffff', 0.52),
    editor: mix(base, '#ffffff', 0.85),
    gutter: mix(base, '#ffffff', 0.55),
    console: mix(base, '#ffffff', 0.85),
    panel: mix(base, '#ffffff', 0.65),
    divider: mix(base, '#000000', 0.1),
  };
}
