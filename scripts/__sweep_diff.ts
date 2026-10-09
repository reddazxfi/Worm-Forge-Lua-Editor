// The count / position / severity half of the differential sweep, as a PURE module.
//
// WHY IT IS NOT INSIDE __sweep.ts
//
// __sweep.ts runs the entire sweep at import time -- it shells out to cargo and walks the
// corpus -- so nothing can `import` it from a test without launching the whole thing. This
// module holds the comparison logic with no side effects, so the tests exercise the SAME
// function the sweep runs rather than a re-implementation of it. A copy that quietly
// drifts from the original is worse than no test at all.
//
// DELETE this and __sweep.ts when parser.ts goes. See __sweep.ts for the sweep itself.

/** One diagnostic, reduced to what the cross-implementation comparison reads. */
export interface Finding {
  line: number;
  column: number;
  rule: string;
  severity: string;
}

/** One position where the two sides disagree, with the reason classified. */
export interface Delta {
  at: string;
  rule: string;
  side: 'missing' | 'extra';
  adjudicated: boolean;
}

/** The full comparison of two normalised finding lists for one file. */
export interface FindingComparison {
  extra: Delta[];
  missing: Delta[];
  severityMismatch: { at: string; rule: string; ts: string; rs: string }[];
  tsCount: number;
  rustCount: number;
}

/** The comparison key, defined once so the sweep and its tests cannot disagree on it. */
export const findingId = (f: Finding): string => `${f.line}:${f.column}:${f.rule}`;

/**
 * Reduces one side's raw diagnostics to the findings a user would actually SEE.
 *
 * THE DEDUP IS THE POINT, not a convenience
 *
 * `parser.ts` runs two undefined-name passes (`scanUndefinedGlobals`, then
 * `scanUndefinedNamesInScope`) that deliberately SHARE the `undefined-global` rule id so
 * the console's Warn filter catches both. Both fire on the same name at the same position.
 * Measured on this corpus, TS emits FOUR raw `undefined-global` where Rust emits THREE --
 * and the old set gate called that agreement, because `undefined-global` was in both sets.
 *
 * The only thing reconciling that count is `mergeDiagnostics`, which is TypeScript: the
 * layer scheduled for deletion. Comparing raw output would therefore flag a difference no
 * user will ever see and -- worse -- train whoever reads the output to dismiss it. So each
 * side is normalised on the exact key `mergeDiagnostics` uses, `line|COLUMN|rule`, and what
 * gets compared is what a Rust-only run would print.
 *
 * Input is SORTED before deduping so the surviving entry of a colliding run is chosen
 * deterministically by position, not by whichever pass happened to run first.
 */
export function normalise(
  ds: { line: number; column: number; rule?: string; severity: string }[]
): Finding[] {
  const sorted = [...ds].sort(
    (a, b) =>
      a.line - b.line || a.column - b.column || (a.rule ?? '').localeCompare(b.rule ?? '')
  );
  const seen = new Map<string, Finding>();
  for (const d of sorted) {
    // A diagnostic with no rule id is a bare syntax notice (mismatched bracket, unclosed
    // `do`). It has no rule to compare by, and the old set gate skipped it with
    // `.filter(Boolean)`. Skipped here too -- but COUNTED in `rulelessSkipped` below, so
    // it can be reported rather than silently dropped, because hiding findings is exactly
    // the failure this change exists to prevent.
    if (!d.rule) continue;
    const k = `${d.line}|${d.column}|${d.rule}`;
    if (!seen.has(k)) {
      seen.set(k, { line: d.line, column: d.column, rule: d.rule, severity: d.severity });
    }
  }
  return [...seen.values()];
}

/**
 * Counts the diagnostics `normalise` has to skip for carrying no rule id.
 *
 * Kept separate rather than folded into `normalise`'s return value because callers read
 * the result as an array directly, and a counter in the tuple would make every one of them
 * destructure for a number they almost never want.
 */
export function countRuleless(ds: { rule?: string }[]): number {
  return ds.filter((d) => !d.rule).length;
}

/** The comparison key, defined once so the sweep and its tests cannot disagree on it. */
/**
 * Compares two implementations' findings as a MULTISET keyed on (line, column, rule).
 *
 * WHY THIS IS NOT THE SET COMPARISON
 *
 * The old gate asked only which rules fired. A `Set` cannot represent a second false
 * positive of a rule it already contains, cannot tell one finding from two at the same
 * place, and says nothing about position or count. Each of those is a way for the port to
 * be wrong and still read as agreement.
 *
 * WHY SEVERITY IS NOT IN THE KEY
 *
 * With severity in the key, one site disagreeing about severity would report as one
 * MISSING plus one EXTRA finding -- which reads like a lost warning and hides the real
 * cause. Excluding it makes that its own, correctly-labelled report. Severity is still
 * compared, just separately.
 *
 * WHY THE ALLOWLISTS ARE APPLIED HERE, AFTER NORMALISATION
 *
 * `rustTodo` / `tsWeaker` exempt RULES, not findings. Filtering before comparing would
 * silently excuse a count or column regression inside an exempt rule -- exactly the rule
 * the exemption exists to let us ignore. Adjudicated deltas are still REPORTED, merely
 * labelled, so an exemption can never make a finding vanish from the output.
 */
export function compareFindings(
  ts: Finding[],
  rs: Finding[],
  opts: { rustTodo: Set<string>; tsWeaker: Set<string> }
): FindingComparison {
  const tsById = new Map(ts.map((f) => [findingId(f), f]));
  const rsById = new Map(rs.map((f) => [findingId(f), f]));

  const delta = (f: Finding, side: 'missing' | 'extra'): Delta => ({
    at: findingId(f),
    rule: f.rule,
    side,
    // A TS-only finding is excused by RUST_TODO; a Rust-only one by TS_WEAKER.
    adjudicated: side === 'missing' ? opts.rustTodo.has(f.rule) : opts.tsWeaker.has(f.rule),
  });

  const severityMismatch = [...rsById.entries()]
    .filter(([k, rf]) => tsById.has(k) && tsById.get(k)!.severity !== rf.severity)
    .map(([k, rf]) => ({
      at: k,
      rule: rf.rule,
      ts: tsById.get(k)!.severity,
      rs: rf.severity,
    }));

  return {
    extra: rs.filter((f) => !tsById.has(findingId(f))).map((f) => delta(f, 'extra')),
    missing: ts.filter((f) => !rsById.has(findingId(f))).map((f) => delta(f, 'missing')),
    severityMismatch,
    tsCount: ts.length,
    rustCount: rs.length,
  };
}