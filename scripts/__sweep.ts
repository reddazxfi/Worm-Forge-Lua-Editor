
// Rust reports a file it could not OPEN as absent. Silence there would mean a
// path bug reads as "no findings", which is exactly the failure mode this sweep
// exists to catch -- so it is counted loudly instead.
// Differential sweep: Rust checks vs the TypeScript baseline, over the real corpus.
//
//   npx tsx scripts/__sweep.ts      Delete when B2 is signed off.
//
// THE POINT
// Deleting `parser.ts` is only safe if Rust produces the same findings. Comparing by
// hand is how regressions survive a port like this one, so this walks every .lua in
// the corpus, runs both implementations, and prints any rule that fires on one side
// only.
//
// Rules the Rust port does NOT implement yet are listed in RUST_TODO. Their
// disagreements are reported separately from real drift, otherwise the known gaps
// drown out the unknown ones.
import { readFileSync, readdirSync, statSync, writeFileSync, mkdtempSync } from 'fs';
import { join, resolve } from 'path';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';
import { parseAndValidate } from '../src/services/parser';
// The count / position / severity comparison lives in its own module so it can be
// unit-tested: __sweep.ts runs cargo and walks the corpus at import time, so a test that
// imported it would launch the entire sweep. See the header of __sweep_diff.ts.
import { normalise, compareFindings, countRuleless, type Finding } from './__sweep_diff';

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (e.endsWith('.lua')) out.push(p);
  }
  return out;
}

/**
 * Rules `parser.ts` implements that `checks.rs` does not yet.
 */
const RUST_TODO = new Set([
  // MEASURED AS REDUNDANT on 2026-03-10, not assumed. Each shape below is rejected by
  // BOTH the engine's own Lua 5.4 (mlua `into_function()`, the same front end
  // `compile_lua` uses) AND full_moon -- `lua54_accepts=false` on every one -- so the
  // desktop path already reports them as `lua-ast` syntax errors with a precise line.
  // They exist in `parser.ts` only because the hand-written TOKENIZER has to recover
  // from malformed input to keep tokenizing at all. Porting them would re-implement the
  // Lua parser. See the sweep in compacted-context.md, Step 0.
  'invalid-arrow-operator', // worm->hurt(10)
  'incomplete-member-expression', // wa.log.
  'invalid-member-name', // something:1
  'malformed-number-identifier', // 1abc
]);

/** One file's findings as the harness reports them. See `Finding` in sweep.rs. */
interface FileReport {
  rules: string[];
  findings: Finding[];
}

/**
 * Rules RUST implements that the TypeScript baseline does not, or does worse.
 *
 * This is the mirror of RUST_TODO and it exists for a different reason. A port is
 * expected to make Rust agree with TypeScript; a finding on this list is a candidate
 * regression and MUST be adjudicated against the real source before being dismissed --
 * "Rust is newer so it must be right" is exactly the reasoning that ships a false
 * positive into a checker people are told to trust.
 *
 * `undefined-global` is here because Rust is genuinely more accurate than the TS flat
 * pass in one specific way: `scanUndefinedGlobals` treats ANY identifier followed by
 * `=` as a binding, and a table-constructor key (`{ startX = opts.x }`) looks exactly
 * like that. So TS believes `startX` is defined and stays silent, while Rust -- where a
 * table key is a `TokenReference` and never a `Var` -- correctly reports the bare read.
 *
 * ADJUDICATED 2026-03-10: the one file this produces, `bee.lua`, has TWO findings at
 * L495 and L496, and both are VERIFIED TRUE POSITIVES and real latent bugs in the pack:
 *
 *     startX      = opts.x,   -- line 491, a table KEY, binds nothing
 *     lastSafeX   = startX,   -- line 495, a bare READ of an unbound global
 *     startY      = opts.y,   -- line 492, a table KEY, binds nothing
 *     lastSafeY   = startY,   -- line 496, a bare READ of an unbound global
 *
 * Neither name is bound anywhere in the corpus (checked: no `local ... startX/startY`,
 * no assignment outside those table keys), so lines 495-496 evaluate to nil.
 * `parser.ts` misses both because `scanUndefinedGlobals` treats ANY identifier followed
 * by `=` as a binding, and a table key looks exactly like that.
 *
 * USER VERDICT (2026-03-10): "they will not break the game, but they initialize as nil,
 * then gets updated at the bee's first frame." Benign by design, NOT a crash -- but the
 * finding is still correct and is deliberately NOT suppressed. See the project rule
 * that a check is never weakened to pass a gate, and the precedent of keeping the
 * `HIGHLANDER_BASELINE` true positive.
 */
const TS_WEAKER = new Set([
  'undefined-global',
  // Rust-only and adjudicated 2026-10-03: `worm:set_state` names are checked against
  // `settable_worm_state()` in the engine (crates/lua-host/src/actor.rs). parser.ts
  // has no such check, and the engine rejects an unknown name as a hard Lua error that
  // aborts every mod in the folder -- so Rust finding one is strictly more accurate,
  // not noise. Exercised by semantic_checks/semantic_all_rules.lua cases 13-14.
  'worm-state-typo',
]);

const ROOT = 'WormForge-main-source';

// Only the pack corpus. The engine's own Rust test fixtures are not user mods and
// deliberately exercise invalid Lua, so including them would make every file a false
// "drift" and bury the signal.
//
// `tools/` is engine build tooling (Python and PowerShell), not packs. Its `tools/tmp/`
// scratch directory held `hellish_patch.lua`, an 11-line FRAGMENT (`patch = { ... },`)
// that is not a complete chunk. Sweeping it made it the one file with "real drift" and
// the conclusion drawn from that was "full_moon is stricter than Lua 5.4" -- a bad
// fixture reading as a parser defect. A file the harness cannot parse is reported as
// `lua-ast`, so this class of noise looks exactly like a checker bug.
const SKIP = /[\\/]crates[\\/]|[\\/]target[\\/]|[\\/]node_modules[\\/]|[\\/]tools[\\/]/;

console.log('Building the sweep harness...');
execFileSync('cargo', ['build', '--quiet', '--bin', 'wasmforge-sweep'], {
  cwd: 'src-tauri',
  stdio: 'inherit',
});

// Absolute, deliberately. The harness runs with `cwd: 'src-tauri'`, so a relative
// path is resolved against the wrong directory, every open() fails, and the report
// comes back EMPTY -- which reads as "the Rust checker finds nothing" rather than
// "the harness was fed bad paths". `path.resolve` removes that whole class of
// false negative.
const files = walk(ROOT)
  .filter((f) => !SKIP.test(f))
  .map((f) => resolve(f));

const dir = mkdtempSync(join(tmpdir(), 'wfsweep-'));
const manifest = join(dir, 'files.json');
writeFileSync(manifest, JSON.stringify(files), 'utf8');

const out = execFileSync('cargo', ['run', '--quiet', '--bin', 'wasmforge-sweep', '--', manifest], {
  cwd: 'src-tauri',
  encoding: 'utf8',
  maxBuffer: 256 * 1024 * 1024,
});

const rustRaw: Record<string, FileReport> = JSON.parse(out);


// Keys must be normalised before comparison. Rust echoes back the paths it was GIVEN,
// which came out of JSON.stringify with Windows separators escaped, and PowerShell can
// hand back forward slashes for the same file. Comparing raw strings silently matched
// nothing -- which is why the first run reported `pairs` as missing from Rust on every
// file that actually had it. That failure mode looks exactly like a checker that does
// not work, so key handling is now part of what this script verifies.
const key = (p: string) => p.replace(/\\/g, '/').toLowerCase();

const rustByKey = new Map(
  Object.entries(rustRaw).map(([k, v]) => [key(k), v])
);

// A file Rust could not OPEN is absent from its report. Silence there would read as
// "no findings", so it is counted loudly instead.
const unread = files.filter((f) => !rustByKey.has(key(f)));
if (unread.length) {
  console.log(
    `\n!! ${unread.length} file(s) were NOT reported by Rust. Every rule below would be a ` +
      `false "missing" until this is fixed. First few:\n` +
      unread
        .slice(0, 3)
        .map((f) => `     ${f}`)
        .join('\n') +
      '\n'
  );
}

console.log(`Swept ${files.length} files (${unread.length} unread).`);

let drift = 0;
let todoGap = 0;
let aheadCount = 0;
let positionFiles = 0;
let sevFiles = 0;
let tsTotal = 0;
let rustTotal = 0;
let rulelessSkipped = 0;
const lines: string[] = [];
const posLines: string[] = [];
const sevLines: string[] = [];

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const tsDiags = parseAndValidate(src).diagnostics;
  const report = rustByKey.get(key(file));
  const ts = normalise(tsDiags);
  const rs = report ? report.findings : [];

  // ---- EXISTING GATE: rule-SET coverage. Unchanged, and still the pass/fail verdict. ----
  const tsSet = new Set(ts.map((f) => f.rule));
  const rsSet = new Set(report?.rules ?? []);

  const onlyTs = [...tsSet].filter((r) => !rsSet.has(r));
  const onlyRs = [...rsSet].filter((r) => !tsSet.has(r));

  const known = onlyTs.filter((r) => RUST_TODO.has(r));
  // Rust finding something TypeScript does not. Reported SEPARATELY from drift, because
  // the two mean opposite things: drift is Rust being wrong, this is Rust being ahead
  // (or newly noisy). It still needs a human to confirm which, so it is never folded
  // into the pass/fail counts.
  const ahead = onlyRs.filter((r) => TS_WEAKER.has(r));
  const unknown = [
    ...onlyTs.filter((r) => !RUST_TODO.has(r)),
    ...onlyRs.filter((r) => !TS_WEAKER.has(r)),
  ];

  // Strip the corpus ROOT as an ABSOLUTE prefix. The old
  // `.replace('WormForge-main-source/', '')` removed only the first occurrence of that
  // literal, so absolute paths leaked through as
  // `C:/Users/.../highlander_code/...` -- which reads as "the corpus is at the repo root"
  // rather than "the corpus is under WormForge-main-source/".
  const rel = file
    .replace(/\\/g, '/')
    .replace(resolve(ROOT).replace(/\\/g, '/') + '/', '');

  if (unknown.length) {
    drift++;
    lines.push(`  DRIFT  ${rel}`);
    lines.push(`     only TS:   ${onlyTs.filter((r) => !RUST_TODO.has(r)).join(', ') || '-'}`);
    lines.push(`     only Rust: ${onlyRs.filter((r) => !TS_WEAKER.has(r)).join(', ') || '-'}`);
  }
  if (ahead.length) {
    aheadCount++;
    lines.push(`  AHEAD  ${rel}  (Rust finds: ${ahead.join(', ')})`);
    lines.push('     adjudicated above -- see TS_WEAKER in this script before changing');
  }
  if (known.length) {
    todoGap++;
    lines.push(`  TODO   ${rel}  (TS only: ${known.join(', ')})`);
  }

  // ---- NEW: count / position / severity comparison. ----
  // The key is (line, column, rule) and NOT severity -- see compareFindings for why. The
  // allowlists are applied inside compareFindings, after normalisation, and adjudicated
  // deltas are still printed, merely labelled.
  const cmp = compareFindings(ts, rs, { rustTodo: RUST_TODO, tsWeaker: TS_WEAKER });

  tsTotal += cmp.tsCount;
  rustTotal += cmp.rustCount;
  rulelessSkipped += countRuleless(tsDiags);

  const label = (d: { at: string; rule: string; adjudicated: boolean; side: 'missing' | 'extra' }) =>
    `     ${d.side === 'missing' ? 'MISSING (TS only) ' : 'EXTRA   (Rust only)'} ${d.at}  ${d.rule}` +
    (d.adjudicated ? '   [adjudicated]' : '');

  if (cmp.extra.length || cmp.missing.length) {
    positionFiles++;
    posLines.push(`  POS    ${rel}   TS ${cmp.tsCount} / Rust ${cmp.rustCount}`);
    for (const d of cmp.missing) posLines.push(label(d));
    for (const d of cmp.extra) posLines.push(label(d));
  }
  if (cmp.severityMismatch.length) {
    sevFiles++;
    for (const m of cmp.severityMismatch) {
      sevLines.push(`  SEV    ${rel}  ${m.at}  ${m.rule}  TS=${m.ts} Rust=${m.rs}`);
    }
  }
}

console.log('\n' + (lines.join('\n') || '  (no differences)'));
console.log(
  `\nfiles with real drift:        ${drift}\n` +
    `files where Rust is ahead:     ${aheadCount}  (adjudicated, not suppressed)\n` +
    `files with a known TS-only gap: ${todoGap}\n` +
    `files agreeing exactly:        ${files.length - drift - todoGap - aheadCount}/${files.length}`
);

console.log('\n--- count / position comparison (NOT yet a gate) ---');
console.log(`total findings: TS ${tsTotal}, Rust ${rustTotal} (delta ${rustTotal - tsTotal})`);
console.log(`files differing in finding set: ${positionFiles}/${files.length}`);
if (rulelessSkipped) {
  // Not an error -- these are real diagnostics -- but they are outside the comparison, and
  // silently dropping them would be the same class of bug this sweep was built to catch.
  console.log(`NOTE: ${rulelessSkipped} TS diagnostic(s) skipped for having no rule id.`);
}
console.log(posLines.join('\n') || '  (every file agrees on both the count and every position)');

console.log('\n--- severity comparison (NOT yet a gate) ---');
console.log(sevLines.join('\n') || '  (severity agrees at every shared position)');
console.log('\nDelete this script once parser.ts is deleted.');
