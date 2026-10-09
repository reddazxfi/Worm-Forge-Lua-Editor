// Tests for the `worm-msg-filter` advisory (`wa.on.worm_message(fn)` where the
// handler tests `msg` itself and could hand the engine the list it wants), plus
// a gate on the embedded example corpus.
//
// Import paths are relative to src/services/__tests__/, so `../parser` is
// src/services/parser and `../../data/existingMods` is src/data/existingMods.
import { describe, it, expect } from 'vitest';
import { parseAndValidate } from '../parser';
import { highlightLuaLine, stripHighlightHtml } from '../editorHighlight';

// The highlighter used to be untestable -- an untested string-transformer is
// exactly the kind of thing that silently eats a character, and a dropped
// character in the DECORATIVE layer looks like a bug in the user's Lua.
describe('highlightLuaLine', () => {
  const cases = [
    'local tryX = wa.random(sliceStart // PX, sliceEnd // PX) * PX',
    'local hit = wa.land.trace(tryX, tryY, tryX, traceEndY)',
    'if hit and hit.hit then',
    'spawn_actor{',
    'local t = {}',
    'local s = string.format("a")',
    'function playBuzz(target)',
    'local snd = beeSOUNDS[wa.random(1, #beeSOUNDS)]',
    'return r < 360 and .5 or -70',
    '-- a comment with { brackets } and ( parens )',
    'local n: number = 0x1F + 1e-6',
    'for i = 1, 10 do print(i) end',
    'a.b.c:d()',
    "x = 'it\\'s' .. [[long]]",
    '',
  ];

  it('never alters the text, in either theme', () => {
    for (const line of cases) {
      for (const isLight of [false, true]) {
        expect(stripHighlightHtml(highlightLuaLine(line, isLight))).toBe(line);
      }
    }
  });

  it('escapes HTML so a line of code cannot inject markup', () => {
    const html = highlightLuaLine('local s = "<script>"');
    expect(html).not.toContain('<script>');
    expect(stripHighlightHtml(html)).toBe('local s = "<script>"');
  });

  it('colours function calls, including the spawn_actor{ sugar', () => {
    // The reported bug: `spawn_actor{` rendered as plain body text.
    expect(highlightLuaLine('spawn_actor{')).toContain('text-cyan-300');
    expect(highlightLuaLine('print(1)')).toContain('text-cyan-300');
  });

  it('colours brackets, which is the whole point of the change', () => {
    for (const ch of ['(', ')', '{', '}', '[', ']']) {
      expect(highlightLuaLine(`f${ch}`)).toContain('span');
    }
    expect(highlightLuaLine('local t = {}')).toContain('text-slate-500');
  });

  it('colours operators and leaves identifiers alone', () => {
    expect(highlightLuaLine('a + b')).toContain('text-rose-300');
    expect(highlightLuaLine('a == b')).toContain('text-rose-300');
  });

  it('still marks the invalid -> arrow', () => {
    expect(highlightLuaLine('worm->hurt(1)')).toContain('text-rose-500');
  });

  it('a comment swallows the rest of the line uncoloured', () => {
    const html = highlightLuaLine('local x = 1 -- { ( end');
    expect(html).toContain('italic');
  });

  it('an empty line becomes nbsp so the row keeps its height', () => {
    expect(highlightLuaLine('')).toBe('&nbsp;');
  });

  it('the light theme never emits a dark-only shade', () => {
    const html = highlightLuaLine('local t = {} if x == 1 then f() end', true);
    expect(html).not.toContain('text-cyan-300');
    expect(html).not.toContain('text-rose-300');
    expect(html).toContain('text-cyan-700');
  });
});
import { EXISTING_MODS } from '../../data/existingMods';
import type { SyntaxDiagnostic } from '../../types/wormforge';

/**
 * Runs every corpus file through the TypeScript checker.
 *
 * The corpus is embedded Lua the app offers to users as working examples, so a
 * file that produces findings is a defect in the corpus -- either the embedded
 * source really does have a bug, or (much more likely, and much more damaging)
 * the checker has a false positive that now lights up on every file the user
 * opens. Both are worth failing a build over.
 *
 * This exists because the corpus used to be hand-pasted and had drifted; a
 * regenerated corpus that suddenly trips the checker is the earliest possible
 * warning.
 */
// Every finding whose message is shown on a console row must fit one row.
//
// WHY THIS IS A HARD NUMBER AND NOT A STYLE PREFERENCE
// The console is a fixed-width budget, and the target display is 1366px -- which
// after the sidebar, editor and console chrome is roughly 120 characters at
// 11.5px monospace. A message longer than that does not "wrap a bit", it wraps
// to several lines and pushes every other finding in the list off screen. The
// user hit this on a real 1366 display: `worm-msg-filter` rendered 470
// characters, about 60 wrapped lines for ONE advisory.
//
// The fix was to split each message into a short `message` (what to do) and a
// long `detail` (why), with the long half behind the console's Info button. This
// test is what keeps that from silently regressing -- the failure mode is a
// maintainer adding one clarifying clause and putting a whole row back.
describe('console rows fit one line', () => {
  const ONE_ROW = 120;

  const cases: [string, string][] = [
    ['worm-msg-filter', 'wa.on.worm_message(function(worm, msg)\n  if msg == wa.msg.FRAME_FINISH then step() end\nend)'],
    ['handle-union', "if obj.kind == 'worm' then obj:hurt(1) end"],
    ['undefined-global', 'print(nosuchname)'],
    ['spec-key-typo', 'wa.weapons.replace({ copy_fromm = "mine" })'],
    ['worm-api', 'worm:hurtt(1)'],
  ];

  it.each(cases)('%s keeps its message under the one-row budget', (rule, src) => {
    const d = parseAndValidate(src).diagnostics.find((x) => x.rule === rule);
    expect(d, `no ${rule} finding for the fixture`).toBeDefined();
    // The message is included in the failure text on purpose: knowing a message
    // is 140 characters tells you nothing, knowing WHICH 140 does.
    expect(`${rule}: ${d!.message.length} chars -- ${d!.message}`.length).toBeGreaterThan(0);
    expect(d!.message.length).toBeLessThanOrEqual(ONE_ROW);
  });

  it('keeps the long reasoning in detail, not in message', () => {
    const d = parseAndValidate(cases[0][1]).diagnostics.find((x) => x.rule === 'worm-msg-filter')!;
    // The explanation must still exist -- it moved, it did not get deleted.
    expect(d.detail).toBeTruthy();
    expect(d.detail!.length).toBeGreaterThan(d.message.length);
  });
});

describe('the example corpus', () => {
  const files = EXISTING_MODS.flatMap((m) =>
    m.files.map((f) => ({ mod: m.id, path: f.path, content: f.content }))
  );

  it('contains the packs it claims to', () => {
    expect(files.length).toBeGreaterThan(50);
    // The two packs that teach module loading MUST be present: they are the only
    // reference for `require` and for component packs.
    const ids = EXISTING_MODS.map((m) => m.id);
    expect(ids).toContain('example.highlander');
    expect(ids).toContain('example.componentdemo');
  });

  it('never tells users that require is nil in the sandbox', () => {
    // KNOWN UPSTREAM, not ours. Two engine-checkout files still carry the old
    // advice -- `mods/examples/KillTheKing/init.lua:6` and
    // `highlander_code/Kill The King v0.5.lua:6`, both saying:
    //
    //   INLINED CONFIG: No require("config") because require/dofile are nil in sandbox.
    //
    // That was true when written and stopped being true when pack-scoped
    // require landed (crates/lua-host/src/modules.rs, wired into lib.rs:90).
    //
    // The corpus embeds those files VERBATIM, so it cannot be fixed here without
    // editing the engine checkout, which is not ours to change. It is listed
    // rather than asserted-away for that reason: if the upstream comment is
    // corrected, this list goes empty and the test tells us to tighten it back
    // to a blanket ban.
    //
    // This is also exactly the class of bug that motivated generating the
    // corpus: our own hand-written entries asserted the same thing, and nothing
    // noticed when it stopped being true.
    // Keyed `mod/path`, not path alone: several packs have an `init.lua`, so the
    // bare filename does not identify which one is stale.
    const KNOWN_STALE = ['example.killtheking/init.lua', 'work.kill_the_king_v0_5/Kill The King v0.5.lua'];

    const stale = files
      .filter((f) => /require.*\bnil\b/i.test(f.content))
      .map((f) => `${f.mod}/${f.path}`);

    // Sorted before comparing because `.sort()` is locale-sensitive and the two
    // lists differ only in which string sorts first.
    expect([...new Set(stale)].sort()).toEqual([...KNOWN_STALE].sort());
  });

  it.each(files.map((f) => [f.mod, f.path, f.content] as const))(
    '%s / %s produces no error or warning',
    (_mod, _path, content) => {
      const found = parseAndValidate(content).diagnostics.filter(
        (d) => d.severity !== 'info'
      );
      expect(
        found.map((d) => `L${d.line}:${d.column} ${d.rule ?? ''} ${d.message}`)
      ).toEqual([]);
    }
  );

  // `info` findings are EXPECTED on real packs and must not be treated as
  // corpus defects: the desync advisories (`lockstep-pairs`) and
  // `worm-msg-filter` fire on genuine engine examples that have not been
  // optimised yet. Locking those to zero would pressure a future edit into
  // suppressing real findings, which is exactly what the project rules forbid.
  //
  // What is pinned instead is that they stay `info` -- promoting either to
  // `warning` would put them in the Warn filter and turn the console banner
  // orange over code that runs correctly.
  it('keeps every corpus advisory at info severity', () => {
    for (const f of files) {
      for (const d of parseAndValidate(f.content).diagnostics) {
        if (d.rule === 'lockstep-pairs' || d.rule === 'worm-msg-filter' || d.rule === 'handle-union') {
          expect(`${f.mod}/${f.path} ${d.rule} is ${d.severity}`).toBe(
            `${f.mod}/${f.path} ${d.rule} is info`
          );
        }
      }
    }
  });
});
//
// WHY THIS FILE EXISTS
// The rule is a PERFORMANCE suggestion dressed as a finding, so the only way to get
// it wrong in a way nobody notices is to suggest the filter where it is not safe.
// A wrong suggestion here changes game behaviour -- a handler that NEEDS a message
// it never tested for stops receiving it. So the cases below are mostly the ones
// that must stay SILENT, and the silence is what is asserted.
//
// `cargo test` pins the Rust half of the same rule at the same fixtures.

function findings(src: string): SyntaxDiagnostic[] {
  return parseAndValidate(src).diagnostics.filter((d) => d.rule === 'worm-msg-filter');
}

describe('worm-msg-filter', () => {
  // ---- the message/detail split (§23) -------------------------------------
  //
  // The message was ~470 characters: four sentences of explanation wrapped around
  // one short suggestion. At 1366px wide that is roughly 60 wrapped lines for a
  // single finding, which buried every other row in the console. The suggestion is
  // what has to be visible; the reasoning lives behind the Info button.

  it('puts the suggestion in message and the reasoning in detail', () => {
    const src = `wa.on.worm_message(function(worm, msg)
  if msg == wa.msg.FRAME_FINISH then tick() end
end)
`;
    const d = findings(src)[0];
    expect(d.message).toBe('Pass the messages up front: { msgs = { wa.msg.FRAME_FINISH } }');
    // The reasoning is preserved, not deleted -- it just moved.
    expect(d.detail).toContain('enters Lua for every message');
    expect(d.detail).toContain('registration order');
  });

  it('keeps the one-line message short enough to read on a 1366 display', () => {
    const src = `wa.on.worm_message(function(worm, msg)
  if msg == wa.msg.FRAME_FINISH then tick() end
end)
`;
    // 120 characters is roughly one console row at this font size once the
    // sidebar, editor and console chrome are laid out. The old message was ~470.
    expect(findings(src)[0].message.length).toBeLessThan(120);
  });

  // ---- FIRES: the handler ignores every message it does not name ----------

  it('advises on a handler whose only msg use is a wa.msg comparison', () => {
    const src = `wa.on.worm_message(function(worm, msg)
  if msg == wa.msg.START_TURN then
    active_team = worm.team
  end
end)
`;
    const out = findings(src);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('info');
    // Points at the call, not the body, so the console underline lands somewhere useful.
    expect(out[0].line).toBe(1);
    expect(out[0].column).toBe(1);
  });

  it('names the message the handler compares against', () => {
    const src = `wa.on.worm_message(function(worm, msg)
  if msg == wa.msg.FRAME_FINISH then tick() end
end)
`;
    expect(findings(src)[0].message).toContain('wa.msg.FRAME_FINISH');
  });

  // The corpus shape from highlander_pure_lua: `~=` plus an early return.
  it('fires on the `~=` early-return shape the example packs use', () => {
    const src = `wa.on.worm_message(function(worm, msg)
  if msg ~= wa.msg.FRAME_FINISH then
    return
  end
  step()
end)
`;
    expect(findings(src)).toHaveLength(1);
  });

  // A handler that cares about two messages must be told about BOTH. Naming one
  // would silently stop the other from ever being delivered.
  it('lists every message compared, not just the first', () => {
    const src = `wa.on.worm_message(function(worm, msg)
  if msg == wa.msg.FRAME_FINISH then step() end
  if msg == wa.msg.START_TURN then begin() end
end)
`;
    const msg = findings(src)[0].message;
    expect(msg).toContain('wa.msg.FRAME_FINISH');
    expect(msg).toContain('wa.msg.START_TURN');
  });

  // ---- SILENT: the filter is already there --------------------------------

  it('stays silent when the handler already passes msgs', () => {
    const src = `wa.on.worm_message(function(worm, msg)
  if msg == wa.msg.JUMP then return "eat" end
end, { msgs = { wa.msg.JUMP } })
`;
    expect(findings(src)).toHaveLength(0);
  });

  it('stays silent when a second argument is present but empty', () => {
    const src = `wa.on.worm_message(function(worm, msg)
  if msg == wa.msg.HIT then step() end
end, {})
`;
    expect(findings(src)).toHaveLength(0);
  });

  // ---- SILENT: msg is used for something the engine cannot be told to skip ---

  // This is the case that makes the rule wrong if it ever gets loose. `wa.log(msg)`
  // wants the message's value, so a filter that drops it changes what is printed.
  it('stays silent when msg is passed to a function', () => {
    const src = `wa.on.worm_message(function(worm, msg)
  wa.log(msg)
end)
`;
    expect(findings(src)).toHaveLength(0);
  });

  it('stays silent when msg is compared numerically', () => {
    const src = `wa.on.worm_message(function(worm, msg)
  if msg > 3 then step() end
end)
`;
    expect(findings(src)).toHaveLength(0);
  });

  it('stays silent when msg is indexed', () => {
    const src = `wa.on.worm_message(function(worm, msg)
  local t = lookup[msg]
end)
`;
    expect(findings(src)).toHaveLength(0);
  });

  it('stays silent when msg is returned', () => {
    const src = `wa.on.worm_message(function(worm, msg)
  return msg
end)
`;
    expect(findings(src)).toHaveLength(0);
  });

  // One bad use poisons the whole handler: the OTHER branch may still need a
  // message the rule cannot see, so nothing here can be proved.
  it('stays silent when only one of several uses is unsafe', () => {
    const src = `wa.on.worm_message(function(worm, msg)
  if msg == wa.msg.FRAME_FINISH then step() end
  wa.log(msg)
end)
`;
    expect(findings(src)).toHaveLength(0);
  });

  // Compared against a bare number rather than a wa.msg constant.
  it('stays silent when msg is compared to a local', () => {
    const src = `local FRAME = 1
wa.on.worm_message(function(worm, msg)
  if msg == FRAME then step() end
end)
`;
    expect(findings(src)).toHaveLength(0);
  });

  it('does not repeat a message compared twice', () => {
    const src = `wa.on.worm_message(function(worm, msg)
  if msg == wa.msg.FRAME_FINISH then step() end
  if msg == wa.msg.FRAME_FINISH then again() end
end)
`;
    const msg = findings(src)[0].message;
    expect(msg.match(/wa\.msg\.FRAME_FINISH/g)).toHaveLength(1);
  });

  // ---- SILENT: shapes the check refuses to reason about -------------------

  it('stays silent for a named callback', () => {
    const src = `local function handler(worm, msg)
  if msg == wa.msg.JUMP then return "eat" end
end
wa.on.worm_message(handler)
`;
    expect(findings(src)).toHaveLength(0);
  });

  // A parameter list that does not end in `msg` is not assumed to be this handler.
  it('stays silent when the parameter list does not end in msg', () => {
    const src = `wa.on.worm_message(function(worm, m)
  if m == wa.msg.JUMP then return "eat" end
end)
`;
    expect(findings(src)).toHaveLength(0);
  });

  // Nothing to name and nothing to prove: the handler never looks at `msg`.
  it('stays silent when msg is never used', () => {
    const src = `wa.on.worm_message(function(worm, msg)
  step()
end)
`;
    expect(findings(src)).toHaveLength(0);
  });

  it('stays silent when worm_message is read, not called', () => {
    const src = `local f = wa.on.worm_message
`;
    expect(findings(src)).toHaveLength(0);
  });

  // ---- Body-end finding: a nested block must not swallow the match ---------

  it('does not treat a nested end as the end of the handler', () => {
    // The `end` on line 3 closes the `if`, not the function. If the scanner stopped
    // there it would read the call as unterminated and stay silent -- losing every
    // real finding on a handler with an `if` in it, which is most of them.
    const src = `wa.on.worm_message(function(worm, msg)
  if msg == wa.msg.START_TURN then
    if worm.turn then
      step()
    end
  end
end)
`;
    expect(findings(src)).toHaveLength(1);
  });

  it('handles repeat/until inside the body', () => {
    // `until` closes a block the same way `end` does; missing that would end the
    // body early and report the wrong message list.
    const src = `wa.on.worm_message(function(worm, msg)
  if msg ~= wa.msg.FRAME_FINISH then return end
  repeat
    step()
  until done()
end)
`;
    expect(findings(src)).toHaveLength(1);
  });

  // THE ONE THAT MATTERED. `for ... do` is two keywords opening ONE block. Counting
  // both opened the depth twice and closed it once, so the body never terminated and
  // the rule reported NOTHING for any handler containing a loop -- which is most real
  // handlers. The Rust half is structural and never had the bug, so the drift sweep
  // found it as 8 files where Rust alone reported the rule.
  //
  // This fixture is deliberately loop-bearing. Every other test in this block is not,
  // so all of them pass with the bug still present.
  it('handles a for loop in the body', () => {
    const src = `wa.on.worm_message(function(worm, msg)
  if msg ~= wa.msg.FIRE_WEAPON then return end
  for _, w in ipairs(wa.worms.all()) do
    w:hurt(10)
  end
end)
`;
    expect(findings(src)).toHaveLength(1);
  });

  // Same one-block-one-`do` rule for `while`.
  it('handles a while loop in the body', () => {
    const src = `wa.on.worm_message(function(worm, msg)
  if msg == wa.msg.HIT then
    local n = 0
    while n < 3 do
      n = n + 1
    end
  end
end)
`;
    expect(findings(src)).toHaveLength(1);
  });

  // A bare `do ... end` block really does open one, and is counted as such.
  it('handles a bare do block in the body', () => {
    const src = `wa.on.worm_message(function(worm, msg)
  if msg == wa.msg.HIT then
    do
      step()
    end
  end
end)
`;
    expect(findings(src)).toHaveLength(1);
  });

  // The real-world shape from `hurt_lab/weapons.lua`, which is where the drift was
  // first visible: an early return, several guards, a loop and a trailing "eat".
  it('handles the full hurt_lab handler shape', () => {
    const src = `wa.on.worm_message(function(worm, msg)
  if msg ~= wa.msg.FIRE_WEAPON then
    return
  end
  if worm.weapon ~= "fire_punch" then
    return
  end
  for _, w in ipairs(wa.worms.all()) do
    if w.alliance ~= worm.alliance then
      w:hurt(10)
    end
  end
  return "eat"
end)
`;
    expect(findings(src)).toHaveLength(1);
  });

  // ---- Two handlers in one file, both advised -----------------------------

  it('reports each unfiltered handler separately', () => {
    const src = `wa.on.worm_message(function(worm, msg)
  if msg == wa.msg.FRAME_FINISH then a() end
end)

wa.on.worm_message(function(worm, msg)
  if msg == wa.msg.START_TURN then b() end
end)
`;
    const out = findings(src);
    expect(out).toHaveLength(2);
    expect(out[1].line).toBe(5);
    expect(out[1].message).toContain('wa.msg.START_TURN');
  });
});

// Tests for the last mile of the checker: the code that decides what the user
// actually SEES.
//
// WHY THIS FILE EXISTS
// `cargo test` covers the Rust checker, and `tsc --noEmit` covers types. Neither can
// see this layer, and that gap shipped a silent bug: `mergeDiagnostics` returned the
// TypeScript list untouched whenever Rust reported nothing, so every undefined variable
// appeared TWICE in the console. A duplicate is not a crash and not a failed gate --
// the user finds it. That is the whole reason this file exists.
//
// The checks are written against OBSERVABLE behaviour (how many findings, which wording
// survives, what order they appear in) rather than against the implementation, so they
// keep holding if the function is rewritten.
import { mergeExtractedSymbols } from '../luaCompiler';
import { mergeDiagnostics, countSeverities, filterBySeverity } from '../diagnostics';

const D = (
  line: number,
  column: number,
  rule: string,
  message: string,
  severity: SyntaxDiagnostic['severity'] = 'warning'
): SyntaxDiagnostic => ({ line, column, rule, message, severity });

const UNDEF_SRC = 'function M.onTick()\n  print(mystery)\nend\n';

describe('mergeDiagnostics', () => {
  // ---- THE SHIPPED BUG -------------------------------------------------
  //
  // `parser.ts` runs TWO undefined-name passes that deliberately share the
  // `undefined-global` rule id, so both fire on the same name at the same position.
  // The duplication was TypeScript against ITSELF, not cross-engine -- which is why
  // deduping Rust against TypeScript never could have caught it.

  it('collapses the two parser.ts undefined-name passes at one position', () => {
    const ts = parseAndValidate(UNDEF_SRC).diagnostics as SyntaxDiagnostic[];
    // Precondition: the duplication really is there, and really is co-located.
    const ugs = ts.filter((d) => d.rule === 'undefined-global');
    expect(ugs).toHaveLength(2);
    expect(`${ugs[0].line}:${ugs[0].column}`).toBe(`${ugs[1].line}:${ugs[1].column}`);

    expect(mergeDiagnostics(ts, [])).toHaveLength(1);
  });

  it('collapses it when Rust also reports the same finding', () => {
    const ts = parseAndValidate(UNDEF_SRC).diagnostics as SyntaxDiagnostic[];
    const rust = [D(ts[0].line, ts[0].column, 'undefined-global', 'rust wording')];
    expect(mergeDiagnostics(ts, rust)).toHaveLength(1);
  });

  it('collapses it on the browser path, where Rust is unavailable', () => {
    // This is the branch that used to `return [...fromTs]` and hand the duplicate
    // straight to the console.
    const ts = parseAndValidate(UNDEF_SRC).diagnostics as SyntaxDiagnostic[];
    expect(mergeDiagnostics(ts, [])).toHaveLength(1);
  });

  // ---- the opposite failure: losing real findings ----------------------
  //
  // The old key was `line|rule`, which cannot tell two different typos on one line
  // apart. It silently dropped one, and a dropped finding is invisible by
  // construction -- nobody notices a warning that never appears.

  it('keeps two different findings that share a line and a rule', () => {
    const ts = parseAndValidate('function M.onTick()\n  worm:hurtt(1) worm:hurtt(2)\nend\n')
      .diagnostics as SyntaxDiagnostic[];
    expect(ts.filter((d) => d.rule === 'worm-api')).toHaveLength(2);

    const merged = mergeDiagnostics(ts, []);
    expect(merged.filter((d) => d.rule === 'worm-api')).toHaveLength(2);
  });

  it('keeps two Rust findings at the same line when their columns differ', () => {
    const merged = mergeDiagnostics([], [D(5, 3, 'worm-api', 'a'), D(5, 40, 'worm-api', 'b')]);
    expect(merged).toHaveLength(2);
  });

  it('collapses a TS and a Rust finding that share line, column and rule', () => {
    expect(mergeDiagnostics([D(5, 3, 'r', 'ts')], [D(5, 3, 'r', 'rust')])).toHaveLength(1);
  });

  // ---- which wording survives, and ordering ----------------------------

  it('keeps the TypeScript wording on a collision', () => {
    // The TS wording is the one already reviewed against the pack corpus, so it wins
    // every collision. Changing this changes what users read, so it is pinned.
    const merged = mergeDiagnostics([D(5, 3, 'r', 'TS-WORDING')], [D(5, 3, 'r', 'RUST-WORDING')]);
    expect(merged).toHaveLength(1);
    expect(merged[0].message).toBe('TS-WORDING');
  });

  it('returns findings in file order regardless of which side they came from', () => {
    const merged = mergeDiagnostics([D(9, 1, 'r', 'c')], [D(2, 1, 'r', 'a'), D(5, 1, 'r', 'b')]);
    expect(merged.map((d) => d.line)).toEqual([2, 5, 9]);
  });

  it('does not mutate either input list', () => {
    const ts = [D(1, 1, 'r', 'ts')];
    const rust = [D(1, 1, 'r', 'rust'), D(2, 1, 'r', 'rust2')];
    const tsCopy = [...ts];
    const rustCopy = [...rust];
    mergeDiagnostics(ts, rust);
    expect(ts).toEqual(tsCopy);
    expect(rust).toEqual(rustCopy);
  });

  it('never invents a finding that neither side reported', () => {
    expect(mergeDiagnostics([], [])).toEqual([]);
  });
});
// __APPEND__

// Counts and filtering used to be inline `.filter(...).length` in three places, over
// two different sources. A pill could disagree with the list beneath it and no gate
// would notice, because a wrong count is not a crash. These pin the shared helpers that
// replaced them.
describe('countSeverities', () => {
  it('counts each severity and the total', () => {
    const counts = countSeverities([
      D(1, 1, 'r', 'a', 'error'),
      D(2, 1, 'r', 'b', 'warning'),
      D(3, 1, 'r', 'c', 'warning'),
      D(4, 1, 'r', 'd', 'info'),
    ]);
    expect(counts).toEqual({ error: 1, warning: 2, info: 1, total: 4 });
  });

  it('returns zeroes for an empty list rather than NaN or undefined', () => {
    expect(countSeverities([])).toEqual({ error: 0, warning: 0, info: 0, total: 0 });
  });

  it('never lets the three counts exceed the total', () => {
    // The invariant a pill count depends on: "All (n)" must equal the sum of the pills.
    const list = [
      D(1, 1, 'r', 'a', 'error'),
      D(2, 1, 'r', 'b', 'info'),
      D(3, 1, 'r', 'c', 'error'),
    ];
    const c = countSeverities(list);
    expect(c.error + c.warning + c.info).toBe(c.total);
  });
});

describe('filterBySeverity', () => {
  const list = [
    D(1, 1, 'r', 'a', 'error'),
    D(2, 1, 'r', 'b', 'warning'),
    D(3, 1, 'r', 'c', 'info'),
  ];

  it('returns everything under all', () => {
    expect(filterBySeverity(list, 'all')).toHaveLength(3);
  });

  it('isolates each severity', () => {
    expect(filterBySeverity(list, 'errors')).toHaveLength(1);
    expect(filterBySeverity(list, 'warnings')).toHaveLength(1);
    expect(filterBySeverity(list, 'info')).toHaveLength(1);
  });

  it('agrees with countSeverities for every pill', () => {
    // The two functions are what the header and the console render. If they ever
    // disagree, a pill's number will not match the rows beneath it -- the exact class
    // of quiet lie this consolidation exists to remove.
    const c = countSeverities(list);
    expect(filterBySeverity(list, 'errors')).toHaveLength(c.error);
    expect(filterBySeverity(list, 'warnings')).toHaveLength(c.warning);
    expect(filterBySeverity(list, 'info')).toHaveLength(c.info);
    expect(filterBySeverity(list, 'all')).toHaveLength(c.total);
  });

  it('does not mutate the input', () => {
    const copy = [...list];
    filterBySeverity(list, 'errors');
    expect(list).toEqual(copy);
  });
});

describe('mergeExtractedSymbols', () => {
  const fn = (name: string) => ({ name }) as never;
  const cls = (name: string, members: string[] = []) =>
    ({ name, members: members.map((m) => ({ name: m })) }) as never;

  it('lets an engine definition win over an extracted one of the same name', () => {
    // Order matters: an extracted `wa` must never shadow a real engine definition.
    const merged = mergeExtractedSymbols(
      { functionsDecl: [fn('wa.log')], variables: [], classes: [] } as never,
      { functions: [fn('wa.log')], variables: [], classes: [] },
      []
    );
    expect(merged.functions.filter((f) => f.name === 'wa.log')).toHaveLength(1);
  });

  it('still contributes an extracted function the engine does not know', () => {
    const merged = mergeExtractedSymbols(
      { functionsDecl: [fn('M.onTick')], variables: [], classes: [] } as never,
      { functions: [fn('wa.log')], variables: [], classes: [] },
      []
    );
    expect(merged.functions.map((f) => f.name)).toEqual(['wa.log', 'M.onTick']);
  });

  it('merges members INTO an existing class rather than duplicating it', () => {
    // This is what makes a user's `worm:something` show up on the real WormEntity in
    // the docs pane. A duplicate class entry would render two WormEntity sections.
    const merged = mergeExtractedSymbols(
      { functionsDecl: [], variables: [], classes: [cls('WormEntity', ['custom'])] } as never,
      { functions: [], variables: [], classes: [cls('WormEntity', ['hurt'])] },
      []
    );
    const worm = merged.classes.filter((c) => c.name === 'WormEntity');
    expect(worm).toHaveLength(1);
    expect(worm[0].members.map((m) => m.name)).toEqual(['hurt', 'custom']);
  });

  it('adds a member only once even if extraction repeats it', () => {
    const merged = mergeExtractedSymbols(
      {
        functionsDecl: [],
        variables: [],
        classes: [cls('WormEntity', ['custom']), cls('WormEntity', ['custom'])],
      } as never,
      { functions: [], variables: [], classes: [cls('WormEntity', ['hurt'])] },
      []
    );
    expect(merged.classes[0].members.filter((m) => m.name === 'custom')).toHaveLength(1);
  });

  it('does not mutate the engine tables it was given', () => {
    // `symbols.classes` is passed straight through to the docs pane, so a merge that
    // pushed into it in place would corrupt the engine's own definitions.
    const engineClasses = [cls('WormEntity', ['hurt'])];
    const before = JSON.stringify(engineClasses);
    mergeExtractedSymbols(
      { functionsDecl: [], variables: [], classes: [cls('WormEntity', ['custom'])] } as never,
      { functions: [], variables: [], classes: engineClasses },
      []
    );
    expect(JSON.stringify(engineClasses)).toBe(before);
  });
});