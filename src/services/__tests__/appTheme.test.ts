import { describe, expect, it } from 'vitest';
import {
  APP_BACKGROUND_PRESETS,
  DEFAULT_APP_BACKGROUNDS,
  getAppSurfaces,
  isUsableBackground,
  normalizeHexColor,
  relativeLuminance,
  sanitizeBackground,
} from '../appTheme';

describe('appTheme', () => {
  it('normalises #rgb and #rrggbb, and rejects everything else', () => {
    expect(normalizeHexColor('#ABC')).toBe('#aabbcc');
    expect(normalizeHexColor('  #0E1115 ')).toBe('#0e1115');
    expect(normalizeHexColor('#12345')).toBeNull();
    expect(normalizeHexColor('0e1115')).toBeNull();
    expect(normalizeHexColor('red')).toBeNull();
    expect(normalizeHexColor(42)).toBeNull();
  });

  it('keeps every curated preset inside its theme luminance family', () => {
    for (const preset of APP_BACKGROUND_PRESETS) {
      expect(isUsableBackground(preset.dark, 'dark'), `${preset.name} dark`).toBe(true);
      expect(isUsableBackground(preset.light, 'light'), `${preset.name} light`).toBe(true);
    }
  });

  it('rejects a background that would invert the text contrast', () => {
    expect(isUsableBackground('#ffffff', 'dark')).toBe(false);
    expect(isUsableBackground('#000000', 'light')).toBe(false);
    expect(sanitizeBackground('#ffffff', 'dark')).toBe('');
    expect(sanitizeBackground('#000000', 'light')).toBe('');
    // The boundary is intentionally stricter than "dark/light": slate-700 is
    // usable in dark mode, but slate-600 is not; slate-200 is usable in light
    // mode, but slate-300 is not.
    expect(isUsableBackground('#334155', 'dark')).toBe(true);
    expect(isUsableBackground('#475569', 'dark')).toBe(false);
    expect(isUsableBackground('#e2e8f0', 'light')).toBe(true);
    expect(isUsableBackground('#cbd5e1', 'light')).toBe(false);
  });

  it('falls back to the stock surface when the custom value is absent or unsafe', () => {
    expect(getAppSurfaces('dark', '')).toEqual(
      getAppSurfaces('dark', DEFAULT_APP_BACKGROUNDS.dark),
    );
    expect(getAppSurfaces('light', '#000000')).toEqual(
      getAppSurfaces('light', DEFAULT_APP_BACKGROUNDS.light),
    );
  });

  it('derives lighter chrome from a dark base and near-white editor from a light base', () => {
    const dark = getAppSurfaces('dark', '#0b1220');
    expect(dark.app).toBe('#0b1220');
    expect(relativeLuminance(dark.header)).toBeGreaterThan(relativeLuminance(dark.app));
    expect(relativeLuminance(dark.sidebar)).toBeGreaterThan(relativeLuminance(dark.app));
    expect(relativeLuminance(dark.editor)).toBeGreaterThan(relativeLuminance(dark.app));

    const light = getAppSurfaces('light', '#eef4ff');
    expect(light.app).toBe('#eef4ff');
    expect(relativeLuminance(light.editor)).toBeGreaterThan(relativeLuminance(light.app));
    expect(relativeLuminance(light.divider)).toBeLessThan(relativeLuminance(light.app));
  });
});
