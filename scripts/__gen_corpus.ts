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
const EXAMPLES = path.join(ROOT, 'WormForge-main-source', 'mods', 'examples');
const USER_CODE = path.join(ROOT, 'WormForge-main-source', 'highlander_code');
const OUT = path.join(ROOT, 'src', 'data', 'existingMods.ts');

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
  const dir = path.join(EXAMPLES, dirName);
  const files = readLuaFiles(dir);
  if (!files.length) return [];

  const slots = replacedSlots(files);
  let author = 'WormForge Porting Engine';
  let version = '0.1.0';
  const toml = path.join(dir, 'mod.toml');
  if (fs.existsSync(toml)) {
    const t = fs.readFileSync(toml, 'utf8');
    const a = t.match(/^author\s*=\s*"([^"]*)"/m);
    const v = t.match(/^version\s*=\s*"([^"]*)"/m);
    if (a) author = a[1];
    if (v) version = v[1];
  }

  return [{
    id: `example.${dirName.toLowerCase().replace(/_/g, '')}`,
    name: opts.name ?? dirName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    author,
    version,
    category: opts.category,
    description:
      opts.description ??
      `Engine example pack: ${dirName}. Embedded verbatim from WormForge-main-source/mods/examples/${dirName}.`,
    replacesSlot: slots[0],
    tags: opts.tags ?? ['example', opts.category],
    files,
  }];
}
// ---------------------------------------------------------------------------
// The pack list.
//
// `highlander` and `component_demo` are the two that teach something the rest
// cannot: the first is a MODULE pack (its rules.lua is only `require` calls),
// the second a COMPONENT pack (scheme and feature components returning tables).
// Both are load-bearing for the `require` work in flight, so both stay.
// ---------------------------------------------------------------------------
const PACKS: { dir: string; category: string; name?: string; description?: string; tags?: string[] }[] = [
  { dir: 'hello', category: 'utility', name: 'Hello (minimal pack)', description: 'The smallest pack that does something: one wa.on.hurt handler plus the three turn-phase hooks. Read this one first.' },
  { dir: 'component_demo', category: 'utility', name: 'Component Demo', description: 'A component pack: a scheme component overriding placed weapons, feature components returning install functions, and the weapons the scheme places. This is the shape bundles.rs drives.', tags: ['example', 'utility', 'components'] },
  { dir: 'highlander', category: 'rules', name: 'Highlander (module pack)', description: 'Highlander split across modules. rules.lua is only require() calls; the logic lives in lib/, scheme/ and weapons/. Pack-scoped require is functional upstream but still in beta, so do not treat the layout as settled.', tags: ['example', 'rules', 'require', 'modules'] },
  { dir: 'highlander_pure_lua', category: 'rules', name: 'Highlander (single file)', description: 'The same rules as the module pack in one rules.lua with no require. Use this when you want the behaviour without the module layout.' },
  { dir: 'sentry_gun', category: 'weapons', name: 'Sentry Gun' },
  { dir: 'wormcraft', category: 'weapons', name: 'Wormcraft' },
  { dir: 'turret', category: 'weapons', name: 'Turret' },
  { dir: 'worm_toss', category: 'weapons', name: 'Worm Toss' },
  { dir: 'pooz', category: 'weapons', name: 'Pooz' },
  { dir: 'KillTheKing', category: 'gameplay', name: 'Kill The King' },
  { dir: 'worm_state_logger', category: 'utility', name: 'Worm State Logger', description: 'Prints worm:set_state transitions. Small and readable; a good first template for the state API.' },
  { dir: 'utilities', category: 'utility', name: 'Utilities' },
  { dir: 'gif_donkey_lua', category: 'weapons', name: 'GIF Donkey (Lua)' },
  { dir: 'hellish_grenade', category: 'weapons', name: 'Hellish Grenade' },
  { dir: 'mine_emit', category: 'weapons', name: 'Mine Emit' },
  { dir: 'q_bazooka', category: 'weapons', name: 'Q Bazooka' },
  { dir: 'super_drill', category: 'weapons', name: 'Super Drill' },
  { dir: 'random_sprites', category: 'visual', name: 'Random Sprites' },
  { dir: 'panel_icon', category: 'hud', name: 'Panel Icon' },
  { dir: 'hurt_lab', category: 'weapons', name: 'Hurt Lab' },
  { dir: 'gravler_strike', category: 'weapons', name: 'Gravler Strike' },
];

/** The user's own working files, kept alongside the engine examples because these
 *  are the packs actually in use -- including Bee Spawner, whose real shape the
 *  old hand-written corpus entry got wrong. */
function workingFileMods(): CorpusMod[] {
  const out: CorpusMod[] = [];

  // Top-level loose .lua files: one mod each.
  //
  // NOT `readLuaFiles`, which recurses -- that would also pick up the
  // `highlander_require_chain/` tree and re-emit it a second time as thirty
  // loose mods alongside the real pack below. Only files sitting directly in
  // highlander_code/ count here.
  for (const e of fs.existsSync(USER_CODE) ? fs.readdirSync(USER_CODE, { withFileTypes: true }) : []) {
    if (!e.isFile() || !e.name.toLowerCase().endsWith('.lua')) continue;
    const body = fs.readFileSync(path.join(USER_CODE, e.name), 'utf8').replace(/\r\n/g, '\n');
    if (body.split('\n').length > MAX_LINES) continue;
    const f: CorpusFile = { rel: e.name, body };
    const base = e.name.replace(/\.lua$/i, '');
    const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const slot = replacedSlots([f])[0];
    out.push({
      id: `work.${slug}`,
      name: base,
      author: 'reddaz',
      version: '0.1.0',
      category: /bee|gun|laser|sentry|swim|drill|bazooka/i.test(base) ? 'weapons' : 'gameplay',
      description: `Working file from highlander_code/${e.name}.`,
      replacesSlot: slot,
      tags: ['working', 'highlander'],
      files: [f],
    });
  }

  // Subdirectories are PACKS, not loose files. Each becomes ONE mod keeping its
  // whole file tree.
  //
  // This matters most for `highlander_require_chain`, which is the only corpus
  // entry that actually exercises `require`. Flattened into 30 separate "mods"
  // it read as thirty unrelated scripts and lost the one thing worth learning:
  // rules.lua is only `require` calls, and the modules it pulls in live beside it.
  for (const e of fs.existsSync(USER_CODE) ? fs.readdirSync(USER_CODE, { withFileTypes: true }) : []) {
    if (!e.isDirectory()) continue;
    const files = readLuaFiles(path.join(USER_CODE, e.name));
    if (!files.length) continue;
    const slug = e.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const isModulePack = files.some((f) => /(^|\W)require\s*\(/.test(f.body));
    out.push({
      id: `work.${slug}`,
      name: e.name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      author: 'reddaz',
      version: '0.1.0',
      category: 'rules',
      description: isModulePack
        ? `Module pack from highlander_code/${e.name}: ${files.length} files, entry loaded by require(). Pack-scoped require works upstream but is still in beta.`
        : `Working pack from highlander_code/${e.name}. ${files.length} files.`,
      replacesSlot: replacedSlots(files)[0],
      tags: isModulePack ? ['working', 'require', 'modules'] : ['working'],
      files,
    });
  }

  return out;
}

export function buildCorpus(): CorpusMod[] {
  const mods: CorpusMod[] = [];
  for (const p of PACKS) mods.push(...modsFromPack(p.dir, p));
  mods.push(...workingFileMods());
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
// Source of truth:   WormForge-main-source/mods/examples/  and
//                    WormForge-main-source/highlander_code/
// Built by:          scripts/__gen_corpus.ts
//
// The previous hand-maintained version had already drifted: it told users that
// require() was nil in the sandbox, which stopped being true once pack-scoped
// require landed (crates/lua-host/src/modules.rs, wired into lib.rs:90). Every
// file below is read straight out of the engine checkout instead, so it cannot
// go stale without the change showing up in git.
export const EXISTING_MODS: ModFolderInfo[] = [
`;