/**
 * Regenerates `src/data/existingMods.ts` from the curated `examples/` packs.
 *
 * WHY A GENERATOR AND NOT A HAND-MAINTAINED FILE
 * The corpus was 3209 lines of Lua pasted inline into TypeScript, and it had
 * already drifted: three entries carried a comment telling users "no require(),
 * because require/dofile are nil in sandbox", which stopped being true when
 * pack-scoped `require` landed (`modules.rs`, wired into `lib.rs:90`). Pasted
 * source is stale the moment the engine moves, and nothing here notices.
 *
 * So the corpus is derived, and `npm run gen:corpus` re-derives it. The packs
 * in `examples/` are the single source of truth; `existingMods.ts` is a cache
 * of them. Keeping the curated packs in this repository means the bundled set
 * does not silently grow every time the engine adds an example, and a fresh
 * clone can regenerate it without a separate engine checkout.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// `__dirname` does not exist in an ES module, and package.json sets
// "type": "module". import.meta.url is the ESM equivalent.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// The curated packs are committed in `examples/`. This used to point at the
// engine checkout's `mods/`; when that tree moved, `readLuaFiles` returned []
// for the missing directories and the generator quietly emitted whatever else it
// could still find. A generator that cannot fail is how a corpus rots. Keeping
// the selected packs here bounds the list and makes the source independent of
// the engine's examples, which change far more often than the editor ships.
const MODS = path.join(ROOT, 'examples');
const OUT = path.join(ROOT, 'src', 'data', 'existingMods.ts');

/**
 * Fails loudly when the examples folder is missing or empty.
 *
 * `readLuaFiles` returning `[]` for a path that does not exist is the correct
 * behaviour for a library function and exactly the wrong behaviour for the entry
 * point of a corpus generator: it turns "the engine moved" into "the corpus is
 * smaller", with nothing to notice.
 */
function assertExamples(): void {
  if (!fs.existsSync(MODS)) {
    throw new Error(
      `${MODS} does not exist. The bundled examples live in examples/, so there ` +
        `is nothing to derive. Restore the folder before running npm run gen:corpus.`
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
      `Bundled example: ${dirName}. Embedded verbatim from examples/${dirName}/.`,
    replacesSlot: slots[0],
    tags: opts.tags ?? ['example', opts.category],
    files,
  }];
}
// ---------------------------------------------------------------------------
// The pack list -- the curated folders under examples/.
//
// Kept EXPLICIT rather than discovered, so adding an example is a decision
// someone makes here instead of something that happens silently. The set is
// intentionally small: one pack per idea, because users who want breadth open
// the engine's real mods folder. The old 25-example engine tree grew without
// anyone deciding it should, and the PX packs in it change constantly.
// ---------------------------------------------------------------------------
const PACKS: { dir: string; category: string; name?: string; description?: string; tags?: string[] }[] = [
  { dir: 'agility', category: 'utility', name: 'Agility', description: 'Worm manipulation: nudge worm.vx / worm.vy from the synchronized keys while airborne. Small enough to read in one sitting.', tags: ['example', 'worm', 'movement'] },
  { dir: 'sentry', category: 'weapons', name: 'Sentry Gun', description: 'An object example: a placed sentry with its own state, target selection, aiming, firing and collision.', tags: ['example', 'weapon', 'object'] },
  { dir: 'bee', category: 'weapons', name: 'Spawn Bees', description: 'A flying object: the replaced Skunk spawns a bee that steers, roams, picks targets and animates in flight.', tags: ['example', 'weapon', 'actor'] },
  { dir: 'highlander', category: 'rules', name: 'Highlander Rules', description: 'A pure-Lua scheme: deal one weapon from each pool, track each worm\'s inventory, and take a killed worm\'s kit.', tags: ['example', 'rules', 'scheme'] },
  { dir: 'swimsuit', category: 'utility', name: 'Swim Suit', description: 'Worm manipulation: take a worm into water, swim under four-key control, dive, float and drown. Extracted from Project X.', tags: ['example', 'worm', 'water'] },
  { dir: 'pooz', category: 'weapons', name: 'POOZ', description: 'A weapon-as-actor: selecting POOZ turns the worm into a controllable runner and drops it back out on a weapon switch.' },
  { dir: 'kill_the_king', category: 'gameplay', name: 'Kill The King', description: 'A complete game mode as a component pack: destroy the defenders\' king before the round timer expires.' },
];

export function buildCorpus(): CorpusMod[] {
  assertExamples();
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
// Source of truth:   examples/
// Built by:          scripts/__gen_corpus.ts
//
// The previous hand-maintained version had already drifted: it told users that
// require() was nil in the sandbox, which stopped being true once pack-scoped
// require landed (crates/lua-host/src/modules.rs, wired into lib.rs:90). Every
// file below is read straight out of the curated examples/ folder instead, so it
// cannot go stale without the change showing up in git.
//
// The set is curated: one pack per idea, not the engine's full example tree.
// Users who want breadth open the engine's real mods folder. \`buildCorpus\`
// throws if examples/ is missing or empty instead of silently writing a smaller
// corpus.
export const EXISTING_MODS: ModFolderInfo[] = [
`;
