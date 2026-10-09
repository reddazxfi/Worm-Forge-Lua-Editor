// §34 -- the syntax palette became data (services/editorThemes.ts). These guard the
// two things that make that safe:
//
//   1. The colours Tailwind needs to exist really exist as literals. A colour built
//      at runtime is silently dropped by Tailwind's scanner and the span renders in
//      the inherited colour with no error anywhere.
//   2. Swapping a palette can never alter the user's TEXT. Highlighting is a
//      decorative layer, so a dropped character would present as a bug in the user's
//      Lua rather than as a display bug, and nothing else would catch it.
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  SYNTAX_PRESETS,
  SYNTAX_TOKENS,
  THEME_SWATCHES,
  getPreset,
  isValidSwatch,
  resolveTokenClasses,
  swatchLabel,
  themeSignature,
} from '../editorThemes';
import { highlightLuaLine, stripHighlightHtml } from '../editorHighlight';

/** Every token kind, in forms that exercise each branch of the scanner. */
const LINES = [
  'local tryX = wa.random(sliceStart // PX, sliceEnd // PX) * PX',
  'local hit = wa.land.trace(tryX, tryY, tryX, traceEndY)',
  'if hit and hit.hit then',
  'spawn_actor{',
  'local t = {}',
  'local s = string.format("a")',
  'function playBuzz(target)',
  'local snd = beeSOUNDS[wa.random(1, #beeSOUNDS)]',
  'return r < 360 and .5 or -70',
  '-- a comment with { brackets } and ( parens )',
  'local n: number = 0x1F + 1e-6',
  'for i = 1, 10 do print(i) end',
  'a.b.c:d()',
  "x = 'it\\'s' .. [[long]]",
  '',
];

describe('editorThemes', () => {
  it('every preset defines every token, in both modes', () => {
    for (const preset of SYNTAX_PRESETS) {
      for (const mode of ['dark', 'light'] as const) {
        for (const { key } of SYNTAX_TOKENS) {
          const cls = preset.palette[mode][key];
          expect(typeof cls, `${preset.id}/${mode}/${key}`).toBe('string');
          expect(cls.length, `${preset.id}/${mode}/${key}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('every preset colour is a swatch Tailwind is guaranteed to have generated', () => {
    for (const preset of SYNTAX_PRESETS) {
      for (const mode of ['dark', 'light'] as const) {
        for (const { key } of SYNTAX_TOKENS) {
          const [colour] = preset.palette[mode][key].split(' ');
          expect(
            isValidSwatch(colour),
            `${preset.id}/${mode}/${key} -> "${colour}" is not in THEME_SWATCHES`,
          ).toBe(true);
        }
      }
    }
  });

  it('rejects anything that is not a known swatch', () => {
    expect(isValidSwatch('text-rose-400')).toBe(true);
    // The ways a hand-edited config or a stale localStorage blob could try to inject
    // something into a class attribute.
    expect(isValidSwatch('#ff00ff')).toBe(false);
    expect(isValidSwatch('text-rose-400" onmouseover="x')).toBe(false);
    expect(isValidSwatch('text-${hue}-400')).toBe(false);
    expect(isValidSwatch(undefined)).toBe(false);
    expect(isValidSwatch(42)).toBe(false);
  });

  it('falls back to the default preset for an unknown id', () => {
    // A .ini exported by a newer build must not be able to break rendering.
    expect(getPreset('no-such-preset').id).toBe('classic');
    expect(getPreset(undefined).id).toBe('classic');
    expect(getPreset('calm').id).toBe('calm');
  });

  it('applies an override on top of the preset, for that mode only', () => {
    const dark = resolveTokenClasses(false, 'classic', { keyword: 'text-lime-200' });
    expect(dark.keyword).toBe('text-lime-200');
    expect(dark.string).toBe(getPreset('classic').palette.dark.string);
    // A colour that reads on #0e1115 is often unreadable on white, so the light
    // palette must be unaffected by a dark override.
    expect(resolveTokenClasses(true, 'classic', { keyword: 'text-lime-200' }).keyword).toBe(
      getPreset('classic').palette.light.keyword,
    );
  });

  it('ignores an override that is not a valid swatch', () => {
    const evil = { keyword: '"><script>alert(1)</script>' } as never;
    expect(resolveTokenClasses(false, 'classic', evil).keyword).toBe(
      getPreset('classic').palette.dark.keyword,
    );
  });

  it('classic is byte-identical to the pre-§34 inline ternaries', () => {
    // These are the literal values that were hardcoded in editorHighlight.ts. If
    // this fails, an existing user's editor has been silently restyled on upgrade.
    const dark = resolveTokenClasses(false, 'classic');
    expect(dark.comment).toBe('text-slate-500 italic font-normal');
    expect(dark.keyword).toBe('text-rose-400 font-medium');
    expect(dark.type).toBe('text-purple-400 font-medium');
    expect(dark.functionCall).toBe('text-cyan-300');
    expect(dark.member).toBe('text-cyan-200/80');
    expect(dark.method).toBe('text-emerald-400 font-medium');
    expect(dark.waHandle).toBe('text-cyan-400 font-semibold');
    expect(dark.declaration).toBe('text-sky-300 font-medium');
    expect(dark.global).toBe('text-teal-300');
    expect(dark.string).toBe('text-lime-300 font-mono');
    expect(dark.number).toBe('text-orange-400');
    expect(dark.operator).toBe('text-rose-300');
    expect(dark.bracket).toBe('text-slate-500');
    expect(dark.punctuation).toBe('text-slate-400');

    const light = resolveTokenClasses(true, 'classic');
    expect(light.keyword).toBe('text-purple-700 font-bold');
    expect(light.functionCall).toBe('text-cyan-700');
    expect(light.member).toBe('text-cyan-800');
    expect(light.bracket).toBe('text-slate-400');
  });

  // The bug this guards: cachedHighlightLuaLine() keys its cache by line text and
  // theme. If the signature did not move when the palette did, picking a new preset
  // would appear to do nothing until the file was closed and reopened.
  it('the cache signature changes when the preset or any override changes', () => {
    const base = themeSignature('classic');
    expect(themeSignature('calm')).not.toBe(base);
    expect(themeSignature('classic', { keyword: 'text-lime-200' })).not.toBe(base);
    expect(themeSignature('classic', { bracket: 'text-slate-300' })).not.toBe(base);
    // Both modes' maps are part of the key.
    expect(themeSignature('classic', undefined, { keyword: 'text-lime-200' })).not.toBe(base);
    // An INVALID override must NOT change it, because it is never rendered anyway --
    // otherwise a corrupt config would silently defeat the cache.
    expect(themeSignature('classic', { keyword: 'nope' })).toBe(base);
    // Stable across calls, or the cache would miss on every keystroke.
    expect(themeSignature('classic', { keyword: 'text-lime-200' })).toBe(
      themeSignature('classic', { keyword: 'text-lime-200' }),
    );
  });

  it('labels swatches for the dropdown', () => {
    expect(swatchLabel('text-rose-400')).toBe('rose-400');
    expect(swatchLabel('text-blue-300/70')).toBe('blue-300 / 70');
  });

  it('THEME_SWATCHES has no duplicates', () => {
    // A duplicate would render two identical options, and the React keys collide.
    expect(new Set(THEME_SWATCHES).size).toBe(THEME_SWATCHES.length);
  });

  it('THE §33 INTEGRITY PROPERTY, across every preset and both modes', () => {
    for (const preset of SYNTAX_PRESETS) {
      for (const isLight of [false, true]) {
        const palette = resolveTokenClasses(isLight, preset.id);
        for (const line of LINES) {
          expect(
            stripHighlightHtml(highlightLuaLine(line, isLight, palette)),
            `${preset.id}/${isLight}/${line}`,
          ).toBe(line);
        }
      }
    }
  });

  it('an override never changes the text either', () => {
    const palette = resolveTokenClasses(false, 'calm', {
      keyword: 'text-lime-200',
      string: 'text-cyan-400',
      bracket: 'text-slate-200',
    });
    const line = 'if x == "a" then print(1) end';
    expect(stripHighlightHtml(highlightLuaLine(line, false, palette))).toBe(line);
  });

  it('the palette actually reaches the rendered markup', () => {
    const calm = resolveTokenClasses(false, 'calm');
    expect(highlightLuaLine('local t = {}', false, calm)).toContain(calm.keyword);
    const overridden = resolveTokenClasses(false, 'calm', { keyword: 'text-amber-500' });
    expect(highlightLuaLine('local t = {}', false, overridden)).toContain('text-amber-500');
  });

  it('overriding every token still cannot alter the text', () => {
    // The pathological case: the user changes all 14 tokens at once.
    const all: Record<string, string> = {};
    for (const { key } of SYNTAX_TOKENS) all[key] = THEME_SWATCHES[0];
    const palette = resolveTokenClasses(true, 'contrast', all);
    for (const line of LINES) {
      expect(stripHighlightHtml(highlightLuaLine(line, true, palette)), line).toBe(line);
    }
  });

  // MEASURED OVER THE REAL CORPUS, not a sample. Same anti-corruption check §33
  // ran: highlighting is decorative, so a dropped character would present as a bug
  // in the user's Lua rather than as a display bug, and nobody would report it as a
  // highlighting problem. If the corpus is absent the check is skipped rather than
  // silently passing, so a green run still means "it really ran".
  it('alters no line of the real engine corpus, in any preset or mode', () => {
    // Plain path strings rather than file:// URLs: readdirSync returns Dirents, and
    // mixing those with URL juggling is where this first attempt went wrong.
    const root = resolve(__dirname, '../../../WormForge-main-source');
    const files: string[] = [];
    const walk = (dir: string) => {
      let entries: import('node:fs').Dirent[];
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        const child = join(dir, e.name);
        if (e.isDirectory()) walk(child);
        else if (e.name.endsWith('.lua')) files.push(child);
      }
    };
    walk(root);
    if (files.length === 0) {
      console.warn('[editorThemes] corpus not found -- corpus integrity check SKIPPED');
      return;
    }

    let lines = 0;
    let spans = 0;
    for (const file of files) {
      for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
        for (const preset of SYNTAX_PRESETS) {
          for (const isLight of [false, true]) {
            const palette = resolveTokenClasses(isLight, preset.id);
            const html = highlightLuaLine(line, isLight, palette);
            spans += (html.match(/<span/g) || []).length;
            if (stripHighlightHtml(html) !== line) {
              throw new Error(
                `TEXT ALTERED in ${file} (${preset.id}/${isLight}): ${JSON.stringify(line)}`,
              );
            }
          }
        }
        lines++;
      }
    }
    console.log(
      `[editorThemes] ${lines} lines x ${SYNTAX_PRESETS.length * 2} palettes: 0 altered, ${spans} spans`,
    );
    expect(lines).toBeGreaterThan(1000);
  });
});
