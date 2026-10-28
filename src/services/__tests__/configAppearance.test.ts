import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, exportConfigAsIni, parseIniConfig, type EditorConfig } from '../config';

describe('appearance config round-trip', () => {
  const configured: EditorConfig = {
    ...DEFAULT_CONFIG,
    backgroundDark: '#0b1220',
    backgroundLight: '#eef4ff',
    sidebarSide: 'right',
  };

  it('exports and parses backgrounds and the sidebar side', () => {
    const parsed = parseIniConfig(exportConfigAsIni(configured));
    expect(parsed.backgroundDark).toBe('#0b1220');
    expect(parsed.backgroundLight).toBe('#eef4ff');
    expect(parsed.sidebarSide).toBe('right');
  });

  it('treats a blank background as the stock theme colour', () => {
    const parsed = parseIniConfig('background_dark =\nbackground_light =');
    expect(parsed.backgroundDark).toBe('');
    expect(parsed.backgroundLight).toBe('');
  });

  it('ignores unsafe backgrounds and an unknown sidebar side', () => {
    const parsed = parseIniConfig(
      'background_dark = #ffffff\nbackground_light = #000000\nsidebar_side = middle',
    );
    expect(parsed.backgroundDark).toBeUndefined();
    expect(parsed.backgroundLight).toBeUndefined();
    expect(parsed.sidebarSide).toBeUndefined();
  });
});
