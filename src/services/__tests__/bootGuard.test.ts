import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// index.html is the one file that can save the app when the bundle cannot run,
// so the properties that make it useful are pinned here:
//
//   1. The remote font stylesheet is NOT render-blocking. A blocking stylesheet
//      in <head> keeps the WHOLE document unpainted until it loads; on a cold
//      cache that was a white window with no error, and the next launch worked
//      from cache.
//   2. A plain (non-module) watchdog exists outside #root, with Reload and
//      Reset actions, so a failed bundle or an unmounted React tree is visible.
//   3. Its reset key list matches services/session.ts. Two copies of "what is
//      session state" would eventually disagree, and the recovery button would
//      silently stop fixing the thing it exists for.
const ROOT = resolve(__dirname, '../../..');
const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
const session = readFileSync(resolve(ROOT, 'src/services/session.ts'), 'utf8');

describe('index.html boot safety', () => {
  it('does not render-block on the Google Fonts stylesheet', () => {
    // The <noscript> copy is allowed to block; it only exists when JS is off,
    // and the app is a JS app.
    const withoutNoscript = html.replace(/<noscript>[\s\S]*?<\/noscript>/g, '');
    const fontLinks: string[] = withoutNoscript.match(/<link[^>]*fonts\.googleapis\.com[^>]*>/g) ?? [];
    const stylesheets = fontLinks.filter((tag) => tag.includes('rel="stylesheet"'));
    expect(stylesheets.length).toBeGreaterThan(0);
    for (const tag of stylesheets) {
      expect(tag, tag).toContain('media="print"');
      expect(tag, tag).toContain("this.media='all'");
    }
  });

  it('keeps the fallback outside #root and reachable without the bundle', () => {
    expect(html).toContain('id="wf-boot-fallback"');
    expect(html.indexOf('id="wf-boot-fallback"')).toBeGreaterThan(html.indexOf('id="root"'));
    expect(html).toContain('id="wf-boot-reload"');
    expect(html).toContain('id="wf-boot-reset"');
    // A module script would not run if the bundle failed; the watchdog is classic.
    const watchdog = html.slice(html.lastIndexOf('<script>'));
    expect(watchdog).toContain('setInterval');
    expect(watchdog).toContain('childElementCount');
  });

  it('resets exactly the session keys services/session.ts owns', () => {
    const htmlList = html.match(/var SESSION_KEYS = \[([\s\S]*?)\];/);
    expect(htmlList).not.toBeNull();
    const htmlKeys = [...htmlList![1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();

    const tsList = session.match(/SESSION_STORAGE_KEYS[^=]*=\s*\[([\s\S]*?)\];/);
    expect(tsList).not.toBeNull();
    const tsKeys = [...tsList![1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();

    expect(htmlKeys).toEqual(tsKeys);
  });

  it('does not reset settings or custom verbs', () => {
    expect(html).not.toContain('wormforge_editor_config');
    expect(html).not.toContain('wormforge_custom_verbs');
  });
});
