// The last mile of the checker: everything that decides what the user actually SEES.
//
// WHY THIS IS ITS OWN MODULE
// `luaCompiler.ts` is about talking to Rust, and importing it pulls in the Tauri
// runtime through `modFolder`. The console does not need any of that -- it needs a
// merged list, three counts and a filter -- and none of those need to be tested against
// a Tauri mock to be trustworthy. Keeping them here means the display layer has no
// platform dependency and can be tested directly, which is the only reason the bug
// below is now caught by `npm test` rather than by a user opening the app.

import type { SyntaxDiagnostic, SyntaxSeverity } from '../types/wormforge';

/**
 * Combines the TypeScript and Rust diagnostic lists during the B2 migration.
 *
 * `parser.ts` is not finished being ported: it still owns the scope analysis and the
 * spec-key check, while Rust owns the desync checks, `wa.*` typos, handle methods,
 * A5 state keys and `undefined-global`. So the console shows BOTH, and one problem
 * must never reach the user twice.
 *
 * WHY THE KEY IS `line|COLUMN|rule`
 *
 * The dedup used to be `line|rule`, applied only to Rust entries, with the TypeScript
 * list copied through untouched. That missed the duplication users actually saw, and
 * the reason was not cross-engine at all: `parser.ts` runs TWO undefined-name passes
 * (`scanUndefinedGlobals`, then `scanUndefinedNamesInScope`) that deliberately share the
 * `undefined-global` rule id so the console's Warn filter catches both. Both fire on the
 * same name at the same position, so every undefined variable was listed twice with
 * near-identical wording -- and `line|rule` cannot separate them, because they ARE the
 * same finding. Deduping the WHOLE list is what fixes it; standardising the rule id,
 * which was already shared, could not.
 *
 * The column is load-bearing for the opposite reason. Two genuinely different findings
 * CAN share a line and a rule -- `worm:hurtt(1) worm:hurtt(2)` on one line is two
 * separate typos -- and `line|rule` collapsed them into one, losing a real finding.
 * Measured over the pack corpus: 53 findings shared a line and rule between the two
 * implementations, and all 53 agreed on the column exactly, with zero mismatches. So
 * `line|column|rule` separates real duplicates without inventing any.
 *
 * TypeScript findings are kept on a collision, not the Rust ones: while both
 * implementations exist, the TS wording is the one already reviewed against the pack
 * corpus.
 */
export function mergeDiagnostics(
  fromTs: SyntaxDiagnostic[],
  fromRust: SyntaxDiagnostic[]
): SyntaxDiagnostic[] {
  // A full-mod check can report the same line/column/rule in several files.
  // The file is part of the identity; a single-file check has no `file`, which
  // keeps its old dedup behaviour exactly.
  const key = (d: SyntaxDiagnostic) =>
    `${d.file ?? ''}|${d.line}|${d.column}|${d.rule}`;
  const seen = new Set<string>();
  const out: SyntaxDiagnostic[] = [];
  // TypeScript first, so its wording wins every collision -- see the note above.
  for (const d of [...fromTs, ...fromRust]) {
    const k = key(d);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(d);
  }
  // The console lists warnings in file order, and the two sources arrive in their own
  // orders. A stable sort keeps findings from the same implementation in their
  // original relative sequence.
  return out.sort((a, b) => a.line - b.line || a.column - b.column);
}

/**
 * How many findings there are, per severity.
 *
 * This exists to kill a whole CLASS of silent bug rather than one instance. The console
 * header, the verdict banner and the three filter pills each used to count with their
 * own inline `.filter(...).length`, over two different sources -- one derived inside the
 * check handler, one from React state. They agreed only because a single line happened
 * to write that state. Any new path, or any change to how the list is built, could make
 * a pill say `3` while the list beneath it shows `4`, and there is no gate that would
 * notice: a wrong count is not a crash.
 *
 * Counting in one place means they cannot disagree by construction.
 */
export interface SeverityCounts {
  error: number;
  warning: number;
  info: number;
  total: number;
}

export function countSeverities(diagnostics: SyntaxDiagnostic[]): SeverityCounts {
  let error = 0;
  let warning = 0;
  let info = 0;
  for (const d of diagnostics) {
    if (d.severity === 'error') error++;
    else if (d.severity === 'warning') warning++;
    else info++;
  }
  return { error, warning, info, total: diagnostics.length };
}

/** The console's filter pills. `all` is the default. */
export type DiagnosticFilter = 'errors' | 'warnings' | 'info' | 'all';

/**
 * Applies a filter pill to the merged list.
 *
 * `info` is its own pill rather than a catch-all: `info` is the severity the desync
 * advisories and the duck-typed handle-union notices use, so under `all` they bury the
 * warnings you actually want to read. Before this pill existed an info row was rendered
 * but was reachable ONLY through `All`, which made it look like those checks did not
 * exist.
 */
export function filterBySeverity(
  diagnostics: SyntaxDiagnostic[],
  filter: DiagnosticFilter
): SyntaxDiagnostic[] {
  if (filter === 'all') return diagnostics;
  const want: SyntaxSeverity = filter === 'errors' ? 'error' : filter === 'warnings' ? 'warning' : 'info';
  return diagnostics.filter((d) => d.severity === want);
}