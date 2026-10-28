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
  /** File to open when this entry loads; defaults to the first file. */
  primaryFile?: string;
  /** Workspace folder shared by variants of one source pack (e.g. all px entries). */
  workspacePrefix?: string;
  /** Emit `files: <key>` and hoist the array once, instead of duplicating it. */
  filesKey?: string;
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
  opts: {
    category: string;
    name?: string;
    description?: string;
    tags?: string[];
    id?: string;
    primaryFile?: string;
    workspacePrefix?: string;
    filesKey?: string;
  },
  filesOverride?: CorpusFile[]
): CorpusMod[] {
  const dir = path.join(MODS, dirName);
  const files = filesOverride ?? readLuaFiles(dir);
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
    id: opts.id ?? manifestId ?? `example.${slug}`,
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
    primaryFile: opts.primaryFile,
    workspacePrefix: opts.workspacePrefix,
    filesKey: opts.filesKey,
  }];
}
// ---------------------------------------------------------------------------
// The pack list -- the curated folders under examples/.
//
// Kept EXPLICIT rather than discovered, so adding an example is a decision
// someone makes here instead of something that happens silently. The entries
// are the modern component versions of the old standalone scripts: the px
// entries all share the same px.ports source pack, and the Core Utilities
// entry shares that bundle's source. `filesKey` hoists the shared array once
// in the generated file instead of duplicating 100+ files per menu entry.
// ---------------------------------------------------------------------------
interface PackSpec {
  dir: string;
  category: string;
  name?: string;
  description?: string;
  tags?: string[];
  id?: string;
  primaryFile?: string;
  workspacePrefix?: string;
  filesKey?: string;
}

const PACKS: PackSpec[] = [
  {
    dir: 'px',
    category: 'rules',
    id: 'px.highlander',
    name: 'Highlander (PX)',
    description: 'Modern PX component: hl.rules. The full px.ports bundle loads so the weapon index and scheme modules are visible; this entry opens components/highlander.lua.',
    tags: ['example', 'rules', 'scheme', 'modern'],
    primaryFile: 'components/highlander.lua',
    filesKey: 'PX_FILES',
    workspacePrefix: 'px',
  },
  {
    dir: 'px',
    category: 'gameplay',
    id: 'px.ktk',
    name: 'Kill The King (PX)',
    description: 'Modern PX component: ktk.control. The full px.ports bundle loads so the feature and its dependencies are visible; this entry opens components/kill_the_king.lua.',
    tags: ['example', 'gameplay', 'modern'],
    primaryFile: 'components/kill_the_king.lua',
    filesKey: 'PX_FILES',
    workspacePrefix: 'px',
  },
  {
    dir: 'px',
    category: 'weapons',
    id: 'px.sentry',
    name: 'Sentry Gun (PX)',
    description: 'Modern PX component: px.sentry_gun. The full px.ports bundle loads so its require graph is visible; this entry opens weapons/sentry_gun.lua.',
    tags: ['example', 'weapon', 'object', 'modern'],
    primaryFile: 'weapons/sentry_gun.lua',
    filesKey: 'PX_FILES',
    workspacePrefix: 'px',
  },
  {
    dir: 'roaming_bees',
    category: 'weapons',
    name: 'Keeper Bee',
    description: 'Modern component bundle: the Keeper Bee launcher and the map swarm share lib/bee.lua through require. Replaces the old Spawn Bees script.',
    tags: ['example', 'weapon', 'actor', 'modern'],
    primaryFile: 'weapons/keeper_bee.lua',
    workspacePrefix: 'roaming_bees',
  },
  {
    dir: 'pooz',
    category: 'weapons',
    name: 'POOZ',
    description: 'Modern component bundle: selecting POOZ turns the worm into a controllable runner and drops it back out on a weapon switch.',
    tags: ['example', 'weapon', 'actor', 'modern'],
    primaryFile: 'weapons.lua',
    workspacePrefix: 'pooz',
  },
  {
    dir: 'ripper_star',
    category: 'weapons',
    name: 'Ripper Star',
    description: 'A missile example from px_fire_seq: fifteen shurikens on the worm\'s live aim, with require("lib/fire_seq") and require("wf-lib/effects/trail") visible.',
    tags: ['example', 'weapon', 'missile', 'require', 'modern'],
    primaryFile: 'weapons/ripper_star.lua',
    workspacePrefix: 'ripper_star',
  },
  {
    dir: 'px',
    category: 'utility',
    id: 'px.swim',
    name: 'Swim Suit (PX)',
    description: 'Modern PX component: px.swim_suit. The full px.ports bundle loads so its lib/shared and weapon dependencies are visible; this entry opens weapons/swim_suit.lua.',
    tags: ['example', 'worm', 'water', 'modern'],
    primaryFile: 'weapons/swim_suit.lua',
    filesKey: 'PX_FILES',
    workspacePrefix: 'px',
  },
  {
    dir: 'utilities',
    category: 'utility',
    id: 'utilities.agility',
    name: 'Agility (Core Utilities)',
    description: 'Modern component version: the agility switch in Core Utilities. Arrow keys nudge worm.vx / worm.vy while airborne; features/utilities.lua loads features/agility.lua when the profile turns it on.',
    tags: ['example', 'worm', 'movement', 'modern'],
    primaryFile: 'features/agility.lua',
    filesKey: 'UTILITY_FILES',
    workspacePrefix: 'utilities',
  },
];

export function buildCorpus(): CorpusMod[] {
  assertExamples();
  const mods: CorpusMod[] = [];
  const filesByDir = new Map<string, CorpusFile[]>();
  for (const p of PACKS) {
    let files = filesByDir.get(p.dir);
    if (!files) {
      files = readLuaFiles(path.join(MODS, p.dir));
      filesByDir.set(p.dir, files);
    }
    mods.push(...modsFromPack(p.dir, p, files));
  }
  return mods;
}

/** Renders a file array body, indented for a `ModFolderInfo['files']` literal. */
export function renderFiles(files: CorpusFile[]): string {
  return files
    .map((f) =>
      `      {\n` +
      `        path: ${sq(f.rel)},\n` +
      `        name: ${sq(f.rel)},\n` +
      `        language: 'lua',\n` +
      `        content: ${lit(f.body)}\n` +
      `      }`
    )
    .join(',\n');
}

/** Renders one mod as a `ModFolderInfo` literal. */
export function renderMod(m: CorpusMod): string {
  const files = m.filesKey ? m.filesKey : `[\n${renderFiles(m.files)}\n    ]`;
  return [
    `  {`,
    `    id: ${sq(m.id)},`,
    `    name: ${sq(m.name)},`,
    `    version: ${sq(m.version)},`,
    `    author: ${sq(m.author)},`,
    `    category: ${sq(m.category)},`,
    m.replacesSlot ? `    replacesSlot: ${sq(m.replacesSlot)},` : '',
    m.primaryFile ? `    primaryFile: ${sq(m.primaryFile)},` : '',
    m.workspacePrefix ? `    workspacePrefix: ${sq(m.workspacePrefix)},` : '',
    `    description: ${sq(m.description)},`,
    `    tags: [${m.tags.map(sq).join(', ')}],`,
    `    files: ${files},`,
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
// The set is curated: modern component entry points, not the engine's full
// example tree. Users who want breadth open the engine's real mods folder.
// \`buildCorpus\` throws if examples/ is missing or empty instead of silently
// writing a smaller corpus.
`;
