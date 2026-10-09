// Tests for the sweep's count / position / severity comparison.
//
// WHY THESE TESTS TARGET THE COMPARISON RATHER THAN THE CHECKERS
//
// The sweep decides whether Rust can replace parser.ts. For most of this port it compared
// rule IDS as sets, and a set cannot represent:
//   - a second FALSE POSITIVE of a rule it already contains,
//   - two findings at one position versus one,
//   - a finding that moved a column,
//   - a finding whose severity changed.
// Every one of those is a way for the port to be wrong and still read as agreement. The
// comparison was rewritten as a multiset over (line, column, rule) and THESE tests pin that
// it actually sees those differences.
//
// Every test below is written so that a `Set`-based implementation would FAIL it. That is
// deliberate: the point is to guard a capability the previous implementation did not have.
import { describe, it, expect } from 'vitest';
import {
  normalise,
  compareFindings,
  countRuleless,
  findingId,
  type Finding,
} from '../../../scripts/__sweep_diff';
// Imported so the intent is obvious: the sweep's dedup must agree with the APP's, not merely
// with itself. Pinned against the real function, never a copy of it.
import { mergeDiagnostics } from '../diagnostics';
import type { SyntaxDiagnostic } from '../../types/wormforge';

/** The allowlists as configured for a file with no adjudicated rules. */
const NONE = { rustTodo: new Set<string>(), tsWeaker: new Set<string>() };

const f = (line: number, column: number, rule: string, severity = 'warning'): Finding => ({
  line,
  column,
  rule,
  severity,
});

describe('the count comparison sees what a set comparison cannot', () => {
  it('catches a same-rule extra finding hidden by a legitimate one', () => {
    // The exact failure the old gate was blind to. Both sides have `worm-api`, so the rule
    // SETS are equal and the old gate reported agreement. But Rust has found a SECOND
    // `worm-api` at L20 that TypeScript has no opinion about -- and a second finding of the
    // same rule is precisely the shape of a false positive. Under a Rust-only run that is a
    // warning shown to the user for a call that is perfectly valid.
    const ts = [f(10, 5, 'worm-api')];
    const rs = [f(10, 5, 'worm-api'), f(20, 5, 'worm-api')];

    const cmp = compareFindings(ts, rs, NONE);

    // The set view would have said "both sides have worm-api".
    expect(new Set(ts.map((x) => x.rule)).size).toBe(new Set(rs.map((x) => x.rule)).size);
    expect(cmp.extra).toHaveLength(1);
    expect(cmp.extra[0]).toMatchObject({ at: '20:5:worm-api', side: 'extra' });
    expect(cmp.missing).toHaveLength(0);
    // Counts are reported too, so the magnitude is visible without counting the lines.
    expect(cmp.rustCount - cmp.tsCount).toBe(1);
  });

  it('catches a missing duplicate at the same position', () => {
    // Two typos of the same rule on one line, separated by column:
    //     worm:hurtt(1) worm:hurtt(2)
    // `mergeDiagnostics` keeps BOTH -- its key includes the column precisely so real
    // duplicates are not collapsed. Rust finding only one means it silently dropped a real
    // typo, and a dropped typo is a missed warning, not a cosmetic difference.
    const ts = [f(10, 5, 'worm-api'), f(10, 20, 'worm-api')];
    const rs = [f(10, 5, 'worm-api')];

    const cmp = compareFindings(ts, rs, NONE);

    expect(cmp.missing).toHaveLength(1);
    expect(cmp.missing[0]).toMatchObject({ at: '10:20:worm-api', side: 'missing' });
    expect(cmp.extra).toHaveLength(0);
  });

  it('reports a count mismatch even when the rule sets are identical', () => {
    // Three findings, all the same rule, across three lines. Nothing here changes which
    // RULES fire, so the old gate was silent; the user would still see a different number
    // of console rows depending on which implementation ran.
    const ts = [f(1, 5, 'lockstep-rng'), f(2, 5, 'lockstep-rng'), f(3, 5, 'lockstep-rng')];
    const rs = [f(1, 5, 'lockstep-rng'), f(2, 5, 'lockstep-rng')];

    const cmp = compareFindings(ts, rs, NONE);

    expect(new Set(ts.map((x) => x.rule))).toEqual(new Set(rs.map((x) => x.rule)));
    expect(cmp.tsCount).toBe(3);
    expect(cmp.rustCount).toBe(2);
    expect(cmp.missing.map((d) => d.at)).toEqual(['3:5:lockstep-rng']);
  });

  it('catches a one-column shift as two deltas, not as agreement', () => {
    // §16 pinned the column convention: the TS baseline reports at the FIRST LETTER of the
    // method name, full_moon's MethodCall starts at its colon. If that anchor ever moves by
    // one, every finding in the corpus changes column while every rule still fires -- the
    // old gate could not see it, and the user would see a caret one character off.
    const ts = [f(10, 7, 'inventory-api')];
    const rs = [f(10, 6, 'inventory-api')];

    const cmp = compareFindings(ts, rs, NONE);

    expect(cmp.missing.map((d) => d.at)).toEqual(['10:7:inventory-api']);
    expect(cmp.extra.map((d) => d.at)).toEqual(['10:6:inventory-api']);
    // Equal counts and equal rule sets -- which is exactly why the old gate called this
    // agreement. Two deltas that cancel out must not hide the shift.
    expect(cmp.tsCount).toBe(cmp.rustCount);
  });
});

describe('severity is compared separately, never folded into the position key', () => {
  it('reports a severity change at a shared position without inventing a delta', () => {
    // `lockstep-pairs` was once `warning` in Rust and `info` in parser.ts. Because
    // mergeDiagnostics gives TS priority, the finding landed under a different console
    // filter depending on which side won the dedup -- so the same code was filed as an
    // info on one run and a warning on another.
    //
    // Severity is deliberately NOT part of the comparison key: if it were, this would
    // report as one MISSING plus one EXTRA and read like a lost finding. It gets its own
    // report so the real cause stays visible.
    const ts = [f(10, 5, 'lockstep-pairs', 'info')];
    const rs = [f(10, 5, 'lockstep-pairs', 'warning')];

    const cmp = compareFindings(ts, rs, NONE);

    expect(cmp.severityMismatch).toEqual([
      { at: '10:5:lockstep-pairs', rule: 'lockstep-pairs', ts: 'info', rs: 'warning' },
    ]);
    // Same position, so it is NOT reported as a positional delta at all.
    expect(cmp.missing).toHaveLength(0);
    expect(cmp.extra).toHaveLength(0);
  });

  it('reports no severity mismatch when both sides agree', () => {
    const a = [f(1, 1, 'lockstep-pairs', 'info'), f(2, 1, 'worm-api', 'warning')];
    expect(compareFindings(a, a, NONE).severityMismatch).toEqual([]);
  });

  it('finds nothing wrong when the two sides are identical', () => {
    const a = [f(1, 1, 'lockstep-pairs', 'info'), f(2, 5, 'worm-api', 'warning')];
    const cmp = compareFindings(a, a, NONE);
    expect(cmp.extra).toEqual([]);
    expect(cmp.missing).toEqual([]);
    expect(cmp.severityMismatch).toEqual([]);
  });
});

describe('the allowlists are applied after normalisation, never before', () => {
  it('labels an adjudicated Rust-only finding but still reports it', () => {
    // `undefined-global` on a table-constructor key is adjudicated: Rust is genuinely more
    // accurate there. An exemption must LABEL the delta, not erase it -- otherwise adding a
    // rule to TS_WEAKER would also hide a column regression in that same rule.
    const cmp = compareFindings([], [f(495, 25, 'undefined-global')], {
      rustTodo: new Set(),
      tsWeaker: new Set(['undefined-global']),
    });

    expect(cmp.extra).toHaveLength(1);
    expect(cmp.extra[0].adjudicated).toBe(true);
    expect(cmp.extra[0].at).toBe('495:25:undefined-global');
  });

  it('labels an adjudicated TS-only finding as missing', () => {
    // The four measured-redundant tokenizer rules live in RUST_TODO. Same duty: report the
    // delta, mark it adjudicated.
    const cmp = compareFindings([f(1, 1, 'invalid-arrow-operator')], [], {
      rustTodo: new Set(['invalid-arrow-operator']),
      tsWeaker: new Set(),
    });

    expect(cmp.missing).toHaveLength(1);
    expect(cmp.missing[0].adjudicated).toBe(true);
  });

  it('does not excuse a positional regression inside an adjudicated rule', () => {
    // THE POINT of applying the allowlists late. `undefined-global` is adjudicated as a
    // RULE, but that must not become a blanket pass for every finding of it: a column shift
    // here is a real regression. Both deltas are reported, and neither is adjudicated,
    // because the exemption covers the rule's absence, not its coordinates.
    const cmp = compareFindings(
      [f(10, 7, 'undefined-global')],
      [f(10, 6, 'undefined-global')],
      { rustTodo: new Set(), tsWeaker: new Set(['undefined-global']) }
    );

    expect(cmp.missing).toHaveLength(1);
    expect(cmp.extra).toHaveLength(1);
  });
});

describe('normalise reproduces what the app would display', () => {
  it('collapses the two undefined-name passes at one position', () => {
    // `parser.ts` runs a flat pass and a scope pass that deliberately share the
    // `undefined-global` rule id. Raw, TS emits this TWICE; a Rust-only run shows it once.
    // Comparing raw counts would report a phantom difference on every undefined global in
    // the corpus -- and would train whoever reads the output to ignore the section.
    const raw = [
      { line: 13, column: 1, rule: 'undefined-global', severity: 'warning' },
      { line: 13, column: 1, rule: 'undefined-global', severity: 'warning' },
    ];

    expect(normalise(raw)).toHaveLength(1);
  });

  it('keeps two findings of one rule that share a line but not a column', () => {
    // The mirror case: a `line|rule` key would collapse these, and `mergeDiagnostics`
    // keeps both because its key includes the column. Collapsing them here would hide a
    // real typo.
    const raw = [
      { line: 10, column: 5, rule: 'worm-api', severity: 'warning' },
      { line: 10, column: 20, rule: 'worm-api', severity: 'warning' },
    ];

    expect(normalise(raw)).toHaveLength(2);
  });

  it('dedups independently of input order', () => {
    // Whichever pass runs first, the surviving finding is chosen by position. Otherwise the
    // count could differ between the TS and Rust paths for no reason a user could see.
    const a = { line: 9, column: 1, rule: 'undefined-global', severity: 'warning' };
    const b = { line: 13, column: 1, rule: 'undefined-global', severity: 'warning' };

    expect(normalise([a, b, a])).toEqual(normalise([b, a, b]));
  });

  it('drops rule-less diagnostics but counts them rather than hiding them', () => {
    // Bare syntax notices (mismatched bracket, unclosed `do`) carry no rule id, so they
    // have nothing to compare on. Dropping them silently is the failure mode this whole
    // change exists to prevent, so the count is reported instead.
    const raw = [
      { line: 3, column: 7, severity: 'error' },
      { line: 1, column: 1, rule: 'lua-ast', severity: 'error' },
    ];

    expect(normalise(raw)).toHaveLength(1);
    expect(countRuleless(raw)).toBe(1);
  });

  it('agrees with mergeDiagnostics on the same input', () => {
    // The dedup key here MUST be the one `mergeDiagnostics` uses, or the sweep compares a
    // list the app would never produce. Asserted against the real function, not a copy.
    // `message` is required by SyntaxDiagnostic but ignored by the dedup, so every entry
    // carries the same one -- which is also the honest shape for this test, since only the
    // key is under test.
    const raw: SyntaxDiagnostic[] = [
      { line: 13, column: 1, rule: 'undefined-global', severity: 'warning', message: 'x' },
      { line: 13, column: 1, rule: 'undefined-global', severity: 'warning', message: 'x' },
      { line: 10, column: 5, rule: 'worm-api', severity: 'warning', message: 'x' },
      { line: 10, column: 20, rule: 'worm-api', severity: 'warning', message: 'x' },
    ];
    const merged = mergeDiagnostics(raw, []);

    expect(normalise(raw)).toHaveLength(merged.length);
    // `findingId` is typed for the sweep's normalised `Finding`, where `rule` is known to
    // be present (normalise drops the rest). `SyntaxDiagnostic.rule` is optional, hence the
    // explicit shape here -- the sweep's own diagnostics all carry a rule.
    const key = (d: { line: number; column: number; rule?: string }) =>
      `${d.line}:${d.column}:${d.rule}`;
    expect(normalise(raw).map(findingId).sort()).toEqual(merged.map(key).sort());
  });
});