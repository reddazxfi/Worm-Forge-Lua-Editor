/**
 * Regenerates `src/data/existingMods.ts` from the engine's own example packs.
 *
 * WHY A GENERATOR AND NOT A HAND-MAINTAINED FILE
 * The corpus was 3209 lines of Lua pasted inline into TypeScript, and it had
 * already drifted: three entries carried a comment telling users "no require(),
 * because require/dofile are nil in sandbox", which stopped being true when
 * pack-scoped `require` landed (`modules.rs`, wired into `lib.rs:90`). Pasted
 * source is stale the moment the engine moves, and nothing here notices.
 *
 * So the corpus is derived, and `npm run gen:corpus` re-derives it. The engine
 * checkout is the single source of truth; `existingMods.ts` is a cache of it.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// `__dirname` does not exist in an ES module, and package.json sets
// "type": "module". import.meta.url is the ESM equivalent.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// The engine's packs live directly under `mods/` in WormForge 0.9.1. This pointed
// at `mods/examples/` and `highlander_code/`, both of which are GONE -- the examples
// were promoted to first-class mods and the user's working files moved into `mods/px`.
// Nothing failed when they vanished: `readLuaFiles` returns [] for a missing
// directory, so the generator quietly emitted a corpus of whatever else it could
// still find, and the stale entries already written into existingMods.ts were never
// re-derived. A generator that cannot fail is how a corpus rots.
const MODS = path.join(ROOT, 'WormForge-main-source', 'mods');
const OUT = path.join(ROOT, 'src', 'data', 'existingMods.ts');

/**
 * Fails loudly when the engine checkout is missing or empty.
 *
 * `readLuaFiles` returning `[]` for a path that does not exist is the correct
 * behaviour for a library function and exactly the wrong behaviour for the entry
 * point of a corpus generator: it turns "the engine moved" into "the corpus is
 * smaller", with nothing to notice.
 */
function assertEngineCheckout(): void {
  if (!fs.existsSync(MODS)) {
    throw new Error(
      `${MODS} does not exist. The corpus is derived from the engine checkout, so ` +
        `there is nothing to derive. Check the vendored engine is present before ` +
        `running npm run gen:corpus.`
    );
  }
  const packs = fs
    .readdirSync(MODS, { withFileTypes: true })
    .filter((e) => e.isDirectory());
  if (!packs.length) {
    throw new Error(`${MODS} contains no pack directories. Refusing to write an empty corpus.`);
  }
}

/** Past this, a file is unreadable in the editor pane anyway. */
const MAX_LINES = 900;

/** Backtick and ${ must be escaped for a TS template literal. */
function lit(s: string): string {
  return '`' + s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`';
}

/** A single-quoted TS string literal. */
function sq(s: string): string {
  return "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

export interface CorpusFile {
  rel: string;
  body: string;
}

export interface CorpusMod {
  id: string;
  name: string;
  author: string;
  version: string;
  category: string;
  description: string;
  replacesSlot?: string;
  tags: string[];
  files: CorpusFile[];
}

/** Every `wa.weapons.replace({ weapon = "x" })` slot in a pack, for the picker. */
export function replacedSlots(files: CorpusFile[]): string[] {
  const out: string[] = [];
  for (const f of files) {
    const re = /wa\.weapons\.replace\s*\(\s*\{[\s\S]{0,400}?\bweapon\s*=\s*["']([a-z_ ]+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(f.body)) !== null) if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

export function readLuaFiles(dir: string, prefix = ''): CorpusFile[] {
  if (!fs.existsSync(dir)) return [];
  const out: CorpusFile[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) {
      out.push(...readLuaFiles(p, rel));
    } else if (e.name.toLowerCase().endsWith('.lua')) {
      const body = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
      if (body.split('\n').length <= MAX_LINES) out.push({ rel, body });
    }
  }
  return out;
}
export function modsFromPack(
  dirName: string,
  opts: { category: string; name?: string; description?: string; tags?: string[] }
): CorpusMod[] {
  const dir = path.join(MODS, dirName);
  const files = readLuaFiles(dir);
  if (!files.length) {
    throw new Error(
      `mods/${dirName} has no readable .lua files. A pack that silently contributes ` +
        `nothing is a pack that vanishes from the corpus without anyone noticing.`
    );
  }

  const slots = replacedSlots(files);
  let author = 'WormForge Porting Engine';
  let version = '0.1.0';
  // The pack's OWN id, when mod.toml declares one -- `px.ports`, `core.utilities`,
  // `example.components`. That is the id the engine and the loader use, so the
  // corpus showing a different one would teach users a name that does not work.
  let manifestId: string | null = null;
  const toml = path.join(dir, 'mod.toml');
  if (fs.existsSync(toml)) {
    const t = fs.readFileSync(toml, 'utf8');
    // TOP-LEVEL keys only. `component_demo/mod.toml` puts its pack id at the top and
    // a `name` inside each `[[components]]` entry; a `^name\s*=` scan over the whole
    // file picks up the first COMPONENT's name and calls it the pack's.
    const topLevel = t.split(/^\s*\[/m)[0];
    const a = topLevel.match(/^author\s*=\s*"([^"]*)"/m);
    const v = topLevel.match(/^version\s*=\s*"([^"]*)"/m);
    const i = topLevel.match(/^id\s*=\s*"([^"]*)"/m);
    if (a) author = a[1];
    if (v) version = v[1];
    if (i) manifestId = i[1];
  }

  const slug = dirName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const isModulePack = files.some((f) => /(^|\W)require\s*\(/.test(f.body));

  return [{
    id: manifestId ?? `example.${slug}`,
    name: opts.name ?? dirName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    author,
    version,
    category: opts.category,
    description:
      opts.description ??
      `Engine pack: ${dirName}. Embedded verbatim from WormForge-main-source/mods/${dirName}/.`,
    replacesSlot: slots[0],
    tags: opts.tags ?? ['example', opts.category],
    files,
  }];
}
// ---------------------------------------------------------------------------
// The pack list -- every directory under WormForge-main-source/mods/.
//
// Kept EXPLICIT rather than discovered, so that adding a pack upstream is a
// decision someone makes here instead of something that happens silently. The
// previous list named eleven directories that no longer exist (`mods/examples/*`,
// `highlander_code/*`); `readLuaFiles` returned [] for each and the generator
// carried on, which is how fourteen corpus tests came to be asserting against
// sources from a tree that had been deleted.
//
//   px              the component bundle: scheme/, components/, lib/, weapons/.
//                    Project X's weapons plus Highlander's rules. The only corpus
//                    entry that exercises pack-scoped require, and the only
//                    MODULE-style pack (its rules.lua is require calls).
//   component_demo  a component bundle too, and the smallest one.
//   tools           the diagnostics harness. It calls `wa.audit.*`, which exists
//                    ONLY under the `diagnostics` cargo feature -- see the
//                    KNOWN_UPSTREAM list in luaCompiler.test.ts.
//   labs, utilities  feature/utility packs, several files each.
// ---------------------------------------------------------------------------
const PACKS: { dir: string; category: string; name?: string; description?: string; tags?: string[] }[] = [
  { dir: 'component_demo', category: 'utility', name: 'Component Demo', description: 'A component bundle (format_version 2): nothing runs until a profile selects its components. Scheme and feature components plus the weapons the scheme places. This is the shape bundles.rs drives.', tags: ['example', 'utility', 'components'] },
  { dir: 'px', category: 'rules', name: 'Project X Ports (Highlander)', description: 'Project X\'s weapons ported as a component bundle, plus Highlander\'s rules. rules.lua is only require() calls; the logic lives in lib/, scheme/, components/ and weapons/. Pack-scoped require works upstream but is still in beta, so do not treat the layout as settled.', tags: ['example', 'rules', 'require', 'modules', 'components'] },
  { dir: 'tools', category: 'utility', name: 'Engine Tools', description: 'The engine\'s own diagnostics harness: audit, perf, and a state logger. Uses `wa.audit.*`, which the engine only installs in a build with the `diagnostics` cargo feature.', tags: ['example', 'utility', 'diagnostics'] },
  { dir: 'labs', category: 'weapons', name: 'Labs', description: 'One weapon per file, each isolating a single mechanic -- cut, panel icon, record, shuffle. Small and readable; a good set of starting points.' },
  { dir: 'utilities', category: 'utility', name: 'Core Utilities', description: 'Feature components you can drop into a pack: agility, a collect viewer, live HP, turn-side examples.' },
  { dir: 'wormcraft', category: 'weapons', name: 'WormCraft' },
  { dir: 'turret', category: 'weapons', name: 'Turret' },
  { dir: 'pooz', category: 'weapons', name: 'Pooz' },
  { dir: 'KillTheKing', category: 'gameplay', name: 'Kill The King' },
  { dir: 'gif_donkey', category: 'weapons', name: 'GIF Donkey' },
  { dir: 'gravler_strike', category: 'weapons', name: 'Gravler Strike' },
];

export function buildCorpus(): CorpusMod[] {
  assertEngineCheckout();
  const mods: CorpusMod[] = [];
  for (const p of PACKS) mods.push(...modsFromPack(p.dir, p));
  return mods;
}

/** Renders one mod as a `ModFolderInfo` literal. */
export function renderMod(m: CorpusMod): string {
  const files = m.files
    .map((f) =>
      `      {\n` +
      `        path: ${sq(f.rel)},\n` +
      `        name: ${sq(f.rel)},\n` +
      `        language: 'lua',\n` +
      `        content: ${lit(f.body)}\n` +
      `      }`
    )
    .join(',\n');
  return [
    `  {`,
    `    id: ${sq(m.id)},`,
    `    name: ${sq(m.name)},`,
    `    version: ${sq(m.version)},`,
    `    author: ${sq(m.author)},`,
    `    category: ${sq(m.category)},`,
    m.replacesSlot ? `    replacesSlot: ${sq(m.replacesSlot)},` : '',
    `    description: ${sq(m.description)},`,
    `    tags: [${m.tags.map(sq).join(', ')}],`,
    `    files: [\n${files}\n    ],`,
    `  },`,
  ]
    .filter(Boolean)
    .join('\n');
}

export const HEADER = `import { ModFolderInfo } from '../types/wormforge';

// GENERATED FILE -- do not edit by hand.
//
// Regenerate with:  npm run gen:corpus
// Source of truth:   WormForge-main-source/mods/
// Built by:          scripts/__gen_corpus.ts
//
// The previous hand-maintained version had already drifted: it told users that
// require() was nil in the sandbox, which stopped being true once pack-scoped
// require landed (crates/lua-host/src/modules.rs, wired into lib.rs:90). Every
// file below is read straight out of the engine checkout instead, so it cannot
// go stale without the change showing up in git.
//
// It DID go stale anyway, twice, and the generator is what let it: it pointed at
// WormForge-main-source/mods/examples/ and WormForge-main-source/highlander_code/,
// both deleted when the examples were promoted to first-class packs under mods/.
// \`readLuaFiles\` returns [] for a directory that is not there, so the generator
// reported success while the corpus kept serving the old tree. \`buildCorpus\`
// now throws instead.
export const EXISTING_MODS: ModFolderInfo[] = [
`;
