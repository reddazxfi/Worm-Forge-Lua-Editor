import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { buildCorpus, renderMod, HEADER } from './__gen_corpus';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src', 'data', 'existingMods.ts');

const mods = buildCorpus();
fs.writeFileSync(OUT, HEADER + mods.map(renderMod).join('\n') + '\n];\n', 'utf8');

const files = mods.reduce((n, m) => n + m.files.length, 0);
console.log(`wrote ${mods.length} mods / ${files} files -> ${path.relative(process.cwd(), OUT)}`);