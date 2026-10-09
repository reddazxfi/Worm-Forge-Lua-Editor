import { parseAndValidate } from '../src/services/parser';
import { EXISTING_MODS } from '../src/data/existingMods';

const files = EXISTING_MODS.flatMap((m) =>
  m.files.map((f) => ({ mod: m.id, path: f.path, content: f.content })),
);
for (const f of files) {
  const found = parseAndValidate(f.content).diagnostics.filter(
    (d) => d.severity !== 'info',
  );
  if (found.length > 0) {
    console.log(`=== ${f.mod} / ${f.path} (${found.length})`);
    for (const d of found) {
      console.log(`  L${d.line}:${d.column} ${d.rule ?? ''} ${d.message}`);
    }
  }
}
console.log(`done: ${files.length} files scanned`);
