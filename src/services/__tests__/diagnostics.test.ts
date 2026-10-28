import { describe, it, expect } from 'vitest';
import { mergeDiagnostics } from '../diagnostics';
import type { SyntaxDiagnostic } from '../../types/wormforge';

const d = (file: string | undefined, rule: string): SyntaxDiagnostic => ({
  line: 1,
  column: 1,
  message: rule,
  severity: 'error',
  rule,
  ...(file ? { file } : {}),
});

describe('mergeDiagnostics: full-mod file identity', () => {
  it('keeps the same line/column/rule in two different files', () => {
    const out = mergeDiagnostics([], [d('a.lua', 'require-missing-local'), d('b.lua', 'require-missing-local')]);
    expect(out).toHaveLength(2);
  });

  it('still dedups the same finding in the same file', () => {
    const out = mergeDiagnostics([], [d('a.lua', 'require-missing-local'), d('a.lua', 'require-missing-local')]);
    expect(out).toHaveLength(1);
  });

  it('keeps single-file findings without a file field deduping as before', () => {
    const out = mergeDiagnostics([], [d(undefined, 'unknown-method'), d(undefined, 'unknown-method')]);
    expect(out).toHaveLength(1);
  });
});
