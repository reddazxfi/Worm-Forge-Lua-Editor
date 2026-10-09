// Tests for the Format button's re-indent.
//
// Each case here is a bug that was REPRODUCED against the original regex
// implementation in App.tsx before it was replaced. The point of this file is
// that the formatter is reachable by one toolbar click on a 4,500-line file, so
// a wrong answer is silently expensive.
import { describe, it, expect } from 'vitest';
import { formatLua, maskLiterals } from '../formatLua';

const ind = (s: string) => formatLua(s).code;

describe('formatLua — the runaway indent (the bad one)', () => {
  it('a one-line table must not push the rest of the file right', () => {
    // `{ a = 1, b = 2 }` opened a level the old code never closed.
    const src = ['local q = 1', '{ a = 1, b = 2 }', 'local z = 3'].join('\n');
    const out = ind(src).split('\n');
    expect(out[2]).toBe('local z = 3');
  });

  it('a table spanning lines indents its contents and comes back', () => {
    const src = ['local t = {', 'a = 1,', '}', 'local y = 2'].join('\n');
    const out = ind(src).split('\n');
    expect(out[1]).toBe('  a = 1,');
    expect(out[3]).toBe('local y = 2');
  });

  it('everything after a function is unaffected by an earlier inline table', () => {
    const src = ['local cfg = {', 'x = 1', '}', 'function onStart()', "print('hi')", 'end'].join('\n');
    const out = ind(src).split('\n');
    expect(out[4]).toBe("  print('hi')");
    expect(out[5]).toBe('end');
  });
});

describe('formatLua — keywords inside strings and comments', () => {
  it('a string containing `end` does not change depth', () => {
    const src = ["local s = 'end of it'", 'local t = 2'].join('\n');
    const out = ind(src).split('\n');
    expect(out[1]).toBe('local t = 2');
  });

  it('a comment containing `end` does not change depth', () => {
    const src = ['-- this is an end to end thing', 'local t = 2'].join('\n');
    expect(ind(src).split('\n')[1]).toBe('local t = 2');
  });

  it('a string containing `until` does not close a block', () => {
    const src = ["local s = 'until then'", 'repeat', 'x = 1', 'until true'].join('\n');
    const out = ind(src).split('\n');
    expect(out[2]).toBe('  x = 1');
    expect(out[3]).toBe('until true');
  });

  it('maskLiterals blanks content but preserves length', () => {
    const line = "local s = 'end' -- end";
    const masked = maskLiterals(line);
    expect(masked).toHaveLength(line.length);
    expect(masked).toContain('local s =');
    expect(masked).not.toMatch(/end/);
  });
});

describe('formatLua — bracket continuation', () => {
  it('a multi-line call indents its arguments', () => {
    const src = ['wa.log(', "'hello'", ')', 'local x = 1'].join('\n');
    const out = ind(src).split('\n');
    expect(out[1]).toBe("  'hello'");
    expect(out[3]).toBe('local x = 1');
  });

  it('a nested call indents twice and unwinds fully', () => {
    const src = ['wa.log(', "wa.hud.line(", "'x', 1, 2", ')', ')', 'local x = 1'].join('\n');
    const out = ind(src).split('\n');
    expect(out[2]).toBe("    'x', 1, 2");
    expect(out[5]).toBe('local x = 1');
  });
});

describe('formatLua — block structure', () => {
  it('if / elseif / else / end nest correctly', () => {
    const src = ['if a then', 'print(1)', 'elseif b then', 'print(2)', 'else', 'print(3)', 'end'].join('\n');
    expect(ind(src).split('\n')).toEqual([
      'if a then',
      '  print(1)',
      'elseif b then',
      '  print(2)',
      'else',
      '  print(3)',
      'end',
    ]);
  });

  it('repeat / until', () => {
    const src = ['repeat', 'x = x + 1', 'until x > 3'].join('\n');
    expect(ind(src).split('\n')).toEqual(['repeat', '  x = x + 1', 'until x > 3']);
  });

  it('a one-line function does not leave a stray level', () => {
    const src = ['local f = function() end', 'local t = 2'].join('\n');
    const out = ind(src).split('\n');
    expect(out[1]).toBe('local t = 2');
  });

  it('a one-line if does not leave a stray level', () => {
    const src = ['if a then print(1) end', 'local t = 2'].join('\n');
    expect(ind(src).split('\n')[1]).toBe('local t = 2');
  });

  it('nested functions unwind fully', () => {
    const src = ['function a()', 'function b()', 'return 1', 'end', 'return 2', 'end', 'local x = 1'].join('\n');
    const out = ind(src).split('\n');
    // `b` is nested inside `a`, so its body really is two levels in.
    expect(out[2]).toBe('    return 1');
    expect(out[3]).toBe('  end');
    expect(out[4]).toBe('  return 2');
    expect(out[5]).toBe('end');
    expect(out[6]).toBe('local x = 1');
  });

  it('a line that both opens a block and balances its parens leaves no stray depth', () => {
    // The regression that made `function b()` leak: `function` opens a block AND
    // opens a paren. Balanced `()` nets to zero, so depth must return to the
    // block count alone -- with TWO ends, `local x` really is back at the top.
    const src = ['function a()', 'function b()', 'end', 'end', 'local x = 1'].join('\n');
    expect(ind(src).split('\n')[4]).toBe('local x = 1');
  });
});

describe('formatLua — safety properties', () => {
  it('is idempotent: formatting twice changes nothing the second time', () => {
    const src = [
      'function onStart()',
      'local t = { a = 1 }',
      "for k, v in pairs(t) do",
      "if v then print(k) end",
      'end',
      'end',
    ].join('\n');
    const once = ind(src);
    expect(ind(once)).toBe(once);
  });

  it('only changes leading whitespace and trailing whitespace, never interior', () => {
    const src = ['local a   =   1', '  local b = 2   ', 'function f( a,b )  return a+b  end'].join('\n');
    const out = ind(src).split('\n');
    // Interior spacing preserved exactly -- this is the part that would
    // corrupt code if it were "tidied".
    expect(out[0]).toBe('local a   =   1');
    expect(out[2]).toBe('function f( a,b )  return a+b  end');
    // Trailing whitespace and leading indentation are normalised.
    expect(out[1]).toBe('local b = 2');
  });

  it('preserves blank lines', () => {
    const src = ['local a = 1', '', '', 'local b = 2'].join('\n');
    expect(ind(src)).toBe('local a = 1\n\n\nlocal b = 2');
  });

  it('a for/while loop counts its own `do` once', () => {
    // The corpus-wide bug: `for i = 1, n do` matched BOTH the keyword and the
    // `do`, but one `end` closes it, so every loop leaked a level.
    const src = ['for i = 1, 3 do', 'print(i)', 'end', 'local x = 1'].join('\n');
    expect(ind(src).split('\n')[3]).toBe('local x = 1');
    expect(formatLua(src).suspect).toBe(false);
  });

  it('a while loop does the same', () => {
    const src = ['while r < 10 do', 'r = r + 1', 'end', 'local x = 1'].join('\n');
    expect(ind(src).split('\n')[3]).toBe('local x = 1');
    expect(formatLua(src).suspect).toBe(false);
  });

  it('a standalone `do` block still opens a level', () => {
    const src = ['do', 'local x = 1', 'end', 'local y = 2'].join('\n');
    expect(ind(src).split('\n')[1]).toBe('  local x = 1');
  });

  it('an inline callback that closes with `end)` is balanced', () => {
    // `wa.on.hud(function() ... end)` -- the shape that made 78 of 99 corpus
    // files report `suspect` before the carry was clamped at zero.
    const src = ['wa.on.hud(function()', 'wa.hud.line("x")', 'end)', 'local y = 2'].join('\n');
    expect(formatLua(src).suspect).toBe(false);
    expect(ind(src).split('\n')[3]).toBe('local y = 2');
  });

  it('`end,` as a table entry still closes a block', () => {
    // The lookahead missed the trailing comma, leaving phantom open blocks.
    const src = ['local handlers = {', 'function()', 'return 1', 'end,', '}', 'local z = 1'].join('\n');
    expect(ind(src).split('\n')[5]).toBe('local z = 1');
  });

  it('flags an unbalanced chunk as suspect', () => {
    expect(formatLua('function a()\n  return 1').suspect).toBe(true);
    expect(formatLua('function a()\n  return 1\nend').suspect).toBe(false);
  });

  it('never emits negative indent on a stray `end`', () => {
    const out = ind('end\nend\nlocal a = 1').split('\n');
    expect(out[2]).toBe('local a = 1');
  });
});