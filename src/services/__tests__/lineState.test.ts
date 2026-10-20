import { describe, it, expect } from 'vitest';
import { lineStateBeforeCaret } from '../lineState';

describe('lineStateBeforeCaret', () => {
  it('is plain code before any quote or comment', () => {
    expect(lineStateBeforeCaret('local x = wa.')).toEqual({ inComment: false, inString: false });
  });

  it('sees an open double-quoted string', () => {
    expect(lineStateBeforeCaret('print("wa.')).toEqual({ inComment: false, inString: true });
  });

  it('sees a closed string as code again', () => {
    expect(lineStateBeforeCaret('print("wa.") .. ')).toEqual({ inComment: false, inString: false });
  });

  it('handles single quotes and escapes', () => {
    expect(lineStateBeforeCaret("x = 'ab")).toEqual({ inComment: false, inString: true });
    expect(lineStateBeforeCaret('x = "a\\"b')).toEqual({ inComment: false, inString: true });
    expect(lineStateBeforeCaret('x = "a\\"b" .. ')).toEqual({ inComment: false, inString: false });
  });

  it('sees a line comment', () => {
    expect(lineStateBeforeCaret('-- see wa.')).toEqual({ inComment: true, inString: false });
  });

  it('does not treat -- inside a string as a comment', () => {
    expect(lineStateBeforeCaret('x = "a -- b')).toEqual({ inComment: false, inString: true });
  });

  it('does not treat a quote inside a comment as a string', () => {
    expect(lineStateBeforeCaret('-- x = "a')).toEqual({ inComment: true, inString: false });
  });

  it('tracks a long string on the line', () => {
    expect(lineStateBeforeCaret('x = [[ a')).toEqual({ inComment: false, inString: true });
    expect(lineStateBeforeCaret('x = [[ a ]] .. ')).toEqual({ inComment: false, inString: false });
  });
});
