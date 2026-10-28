import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { buildCorpus, renderFiles, renderMod, HEADER, type CorpusFile } from './__gen_corpus';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src', 'data', 'existingMods.ts');

const mods = buildCorpus();

// Several menu entries share one source pack (the four px entry points, for
// example). Hoist each shared file array once and have the entries reference it,
// instead of embedding the same 100+ files four times.
const shared = new Map<string, CorpusFile[]>();
for (const m of mods) {
  if (m.filesKey && !shared.has(m.filesKey)) shared.set(m.filesKey, m.files);
}
const sharedSource = [...shared.entries()]
  .map(([key, files]) => `const ${key}: ModFolderInfo['files'] = [\n${renderFiles(files)}\n];\n`)
  .join('\n');

fs.writeFileSync(
  OUT,
  HEADER +
    sharedSource +
    '\nexport const EXISTING_MODS: ModFolderInfo[] = [\n' +
    mods.map(renderMod).join('\n') +
    '\n];\n',
  'utf8'
);

const files = mods.reduce((n, m) => n + m.files.length, 0);
console.log(`wrote ${mods.length} mods / ${files} files -> ${path.relative(process.cwd(), OUT)}`);
