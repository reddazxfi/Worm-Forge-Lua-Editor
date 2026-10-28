import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Terminal,
  Trash2,
  Info,
  ExternalLink,
} from 'lucide-react';
import { SyntaxDiagnostic } from '../types/wormforge';
import { CheckEngine } from '../services/luaCompiler';
import { countSeverities, filterBySeverity, type DiagnosticFilter } from '../services/diagnostics';
import type { AppSurfaces } from '../services/appTheme';

interface ConsoleOutputProps {
  diagnostics: SyntaxDiagnostic[];
  logs: { time: string; text: string; type: 'info' | 'success' | 'warn' | 'error' }[];
  onSelectDiagnostic: (diag: SyntaxDiagnostic) => void;
  onClearLogs: () => void;
  hasRunCheck: boolean;
  checkEngine: CheckEngine | null;
  /** Which scope produced the visible list: one file or the whole mod graph. */
  checkScope?: 'file' | 'mod' | null;
  /** True when the full-mod report predates an edit. */
  fullCheckStale?: boolean;
  /** Used to omit the path on findings that belong to the open file. */
  activeFile?: string;
  isLight?: boolean;
  filter?: DiagnosticFilter;
  /** Optional custom app-surface palette; omitted = stock theme classes. */
  surface?: AppSurfaces;
}

export const ConsoleOutput: React.FC<ConsoleOutputProps> = ({
  diagnostics,
  logs,
  onSelectDiagnostic,
  onClearLogs,
  hasRunCheck,
  checkEngine,
  checkScope = null,
  fullCheckStale = false,
  activeFile,
  isLight = false,
  surface,
}) => {
  const [filter, setFilter] = React.useState<DiagnosticFilter>('all');
  const outputRef = React.useRef<HTMLDivElement>(null);

  // Which diagnostic rows have their long explanation expanded.
  //
  // A Set of stable keys rather than a boolean per row, so toggling one row does
  // not re-render the others' state and the list survives re-filtering: changing
  // the filter pill re-sorts the array, and an index-keyed approach would leave
  // every expanded row attached to the wrong finding.
  const [openRows, setOpenRows] = React.useState<Set<string>>(new Set());

  // Jump to the newest line whenever the check writes new output. The stream is
  // appended to over the course of a check (diagnostics first, then the summary
  // log line), so scrolling once per render would catch it mid-update and leave
  // the last line below the fold. requestAnimationFrame waits for that paint.
  React.useEffect(() => {
    const el = outputRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [diagnostics, logs, hasRunCheck, checkEngine, filter]);

  // Both the pill counts and the filtering go through the shared helpers in
  // services/diagnostics.ts. They used to be inline here, which made this a THIRD
  // independent count alongside App.tsx's two -- any drift between a pill's number and
  // the list beneath it was invisible, because a wrong count is not a crash.
  const counts = countSeverities(diagnostics);
  const errors = counts.error;
  const warnings = counts.warning;
  const infos = counts.info;
  const filteredDiagnostics = filterBySeverity(diagnostics, filter);
  const scopeLabel = checkScope === 'mod' ? 'Full Mod Check' : 'Syntax Check';

  return (
    <div
      style={surface ? { backgroundColor: surface.console } : undefined}
      className={`h-full flex flex-col text-xs font-mono select-text transition-colors ${
        isLight ? 'bg-white text-slate-800' : 'bg-[#14171c] text-[#e0e6ed]'
      }`}
    >
      {/* Console Top Toolbar */}
      <div
        style={surface ? { backgroundColor: surface.header } : undefined}
        className={`p-1.5 px-2 border-b flex items-center justify-between transition-colors ${
          isLight ? 'bg-slate-100 border-slate-200' : 'bg-[#171b21] border-[#242932]'
        }`}
      >
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center gap-1 font-sans font-semibold text-[11px] uppercase tracking-wider ${
              isLight ? 'text-slate-600' : 'text-[#8b9cb0]'
            }`}
          >
            <Terminal className="w-3.5 h-3.5 text-amber-500" />
            <span>{checkScope === 'mod' ? 'Mod & Require Output' : 'Syntax & Parser Output'}</span>
          </div>

          <div className="flex items-center gap-1 ml-2 font-sans text-[11px]">
            <button
              onClick={() => setFilter('all')}
              className={`px-1.5 py-0.5 rounded transition-colors ${
                filter === 'all'
                  ? isLight
                    ? 'bg-slate-200 text-slate-900 font-semibold'
                    : 'bg-[#29323f] text-[#e0e6ed] font-medium'
                  : isLight
                  ? 'text-slate-500 hover:text-slate-800'
                  : 'text-[#6f7e91] hover:text-[#9fb0c5]'
              }`}
            >
              All ({diagnostics.length + logs.length})
            </button>
            <button
              onClick={() => setFilter('errors')}
              className={`px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors ${
                filter === 'errors'
                  ? isLight
                    ? 'bg-rose-100 text-rose-800 font-semibold'
                    : 'bg-rose-500/20 text-rose-300 font-medium'
                  : isLight
                  ? 'text-slate-500 hover:text-rose-600'
                  : 'text-[#6f7e91] hover:text-rose-400'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
              Errors ({errors})
            </button>
            <button
              onClick={() => setFilter('warnings')}
              className={`px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors ${
                filter === 'warnings'
                  ? isLight
                    ? 'bg-amber-100 text-amber-800 font-semibold'
                    : 'bg-amber-500/20 text-amber-300 font-medium'
                  : isLight
                  ? 'text-slate-500 hover:text-amber-600'
                  : 'text-[#6f7e91] hover:text-amber-400'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              Warn ({warnings})
            </button>
            <button
              onClick={() => setFilter('info')}
              className={`px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors ${
                filter === 'info'
                  ? isLight
                    ? 'bg-sky-100 text-sky-800 font-semibold'
                    : 'bg-sky-500/20 text-sky-300 font-medium'
                  : isLight
                  ? 'text-slate-500 hover:text-sky-600'
                  : 'text-[#6f7e91] hover:text-sky-400'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
              Info ({infos})
            </button>
          </div>
        </div>

        <button
          onClick={onClearLogs}
          title="Clear console output"
          className={`p-1 rounded transition-colors ${
            isLight
              ? 'text-slate-400 hover:text-slate-800 hover:bg-slate-200'
              : 'text-[#6a798c] hover:text-[#cfdbe8] hover:bg-[#20252e]'
          }`}
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* Output Stream */}
      <div ref={outputRef} className="flex-1 overflow-y-auto p-2 space-y-1 text-[11.5px]">
        {/* Diagnostics list
         *
         * A row is ONE LINE by default: `truncate` on both the row and the text
         * means a long message cannot push the rest of the list off screen. That
         * matters because the console is narrow -- the target display is 1366px,
         * which is roughly 120 characters at this font size once the sidebar,
         * editor and console chrome are laid out. A 470-character message was
         * ~60 wrapped lines and buried every other finding underneath it.
         *
         * So `message` is the short half (what went wrong, and the suggestion) and
         * `detail` is the long half (why, and what it costs). The Info button only
         * renders when `detail` is present, so the ~90% of findings with nothing
         * extra to say are visually identical to how they always were.
         *
         * The button stops propagation: the row's own onClick jumps to the line in
         * the editor, and expanding must not also move the caret out from under
         * the text being read. */}
        {filteredDiagnostics.map((diag, index) => {
          const isError = diag.severity === 'error';
          const isWarning = diag.severity === 'warning';
          const rowKey = `${diag.file ?? ''}|${diag.line}|${diag.column}|${diag.rule ?? ''}|${index}`;
          const isOpen = openRows.has(rowKey);
          return (
            <div
              key={index}
              className={`p-1.5 rounded border transition-colors group ${
                // Row tint is theme-aware too: `bg-*-500/10` + `text-*-200`
                // were dark-theme pairs. On white, `text-rose-200` / `-amber-200`
                // / `-sky-200` are washed out to near-invisible, so light mode
                // uses the 800-weight shades which are readable on white. The
                // translucent 500/10 background works on both.
                isError
                  ? isLight
                    ? 'bg-rose-500/10 border-rose-500/30 hover:bg-rose-500/15 text-rose-800'
                    : 'bg-rose-500/10 border-rose-500/30 hover:bg-rose-500/15 text-rose-200'
                  : isWarning
                  ? isLight
                    ? 'bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/15 text-amber-800'
                    : 'bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/15 text-amber-200'
                  : isLight
                  ? 'bg-sky-500/10 border-sky-500/30 text-sky-800'
                  : 'bg-sky-500/10 border-sky-500/30 text-sky-200'
              }`}
            >
              <div
                onClick={() => {
                  onSelectDiagnostic(diag);
                  // Clicking the row ALSO expands the explanation.
                  //
                  // The `i` button was the only way to open a finding's detail,
                  // and at 10px it was both easy to miss and fiddly to hit. That
                  // hid the reasoning for exactly the findings that need it --
                  // the user asking "why is this flagged?" had nowhere to go, so
                  // they fell back on the row, which only moved the caret and
                  // gave no answer. Jump AND explain in one click.
                  //
                  // Toggled rather than only opened, so a second click on the
                  // same row collapses it again. Rows with no `detail` are
                  // unchanged: there is nothing to show.
                  if (diag.detail) {
                    setOpenRows((prev) => {
                      const next = new Set(prev);
                      if (next.has(rowKey)) next.delete(rowKey);
                      else next.add(rowKey);
                      return next;
                    });
                  }
                }}
                className="flex items-start justify-between gap-2 cursor-pointer"
              >
                <div className="flex items-start gap-1.5 min-w-0 flex-1">
                  {isError ? (
                    <AlertCircle
                      className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${isLight ? 'text-rose-600' : 'text-rose-400'}`}
                    />
                  ) : isWarning ? (
                    <AlertTriangle
                      className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${isLight ? 'text-amber-600' : 'text-amber-400'}`}
                    />
                  ) : (
                    <Info className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${isLight ? 'text-sky-600' : 'text-sky-400'}`} />
                  )}
                  <div className="min-w-0">
                    <div className="truncate">
                      <span className="font-semibold mr-1.5 underline decoration-dotted">
                        {diag.file && diag.file !== activeFile ? `${diag.file}:` : ''}
                        Line {diag.line}:{diag.column}
                        {diag.dependency ? ' (dependency)' : ''}
                      </span>
                      {/* Light-mode aware. These were hardcoded dark-theme greys
                       * (#d8e3ef / #a9bacd) on a row whose background is also
                       * hardcoded to a dark translucent tint, so in light mode
                       * the message body was near-white text on white -- the
                       * exact "too light against a white background" report.
                       * The severity TINT is handled one level up (row bg/border
                       * and the icon); this is only the body text. */}
                      <span className={isLight ? 'text-slate-800' : 'text-[#d8e3ef]'}>
                        {diag.message}
                      </span>
                    </div>
                    {isOpen && diag.detail && (
                      <div
                        className={`mt-1 pl-1 border-l border-current/20 text-[11px] leading-relaxed whitespace-pre-wrap break-words ${
                          isLight ? 'text-slate-600' : 'text-[#a9bacd]'
                        }`}
                      >
                        {diag.detail}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 mt-0.5">
                  {diag.detail && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenRows((prev) => {
                          const next = new Set(prev);
                          if (next.has(rowKey)) next.delete(rowKey);
                          else next.add(rowKey);
                          return next;
                        });
                      }}
                      title={isOpen ? 'Hide explanation' : 'Show explanation'}
                      aria-expanded={isOpen}
                      // A real, comfortable target: `p-1.5` on an `Info` icon at
                      // 12px, instead of a bare 10px letter. The old one was a
                      // ~12x14px hit area, which is below what a pointer reliably
                      // lands on -- especially in a dense list where rows are
                      // ~20px tall and you are aiming between them.
                      className={`shrink-0 p-1.5 -mr-1 rounded transition-colors ${
                        isLight
                          ? isOpen
                            ? 'bg-slate-300/60 text-slate-800'
                            : 'text-slate-500 hover:text-amber-600 hover:bg-amber-500/10'
                          : isOpen
                          ? 'bg-current/20 text-[#d8e3ef]'
                          : 'text-[#8497ab] hover:text-amber-400 hover:bg-amber-500/10'
                      }`}
                    >
                      <Info className="w-3 h-3" />
                    </button>
                  )}
                  <ExternalLink
                    className={`w-3 h-3 group-hover:text-amber-400 shrink-0 ${
                      isLight ? 'text-slate-400' : 'text-[#647488]'
                    }`}
                  />
                </div>
              </div>
            </div>
          );
        })}

        {/* General execution and debug logs */}
        {filter === 'all' &&
          logs.map((log, index) => (
            <div
              key={index}
              className={`flex items-start gap-2 py-0.5 text-[11px] ${
                isLight ? 'text-slate-600' : 'text-[#889cb0]'
              }`}
            >
              <span className={`font-mono select-none ${isLight ? 'text-slate-400' : 'text-[#516173]'}`}>
                {log.time}
              </span>
              <span
                className={
                  log.type === 'error'
                    ? isLight
                      ? 'text-rose-600'
                      : 'text-rose-400'
                    : log.type === 'warn'
                    ? isLight
                      ? 'text-amber-600'
                      : 'text-amber-400'
                    : log.type === 'success'
                    ? isLight
                      ? 'text-emerald-600'
                      : 'text-emerald-400'
                    : isLight
                    ? 'text-slate-600'
                    : 'text-[#889cb0]'
                }
              >
                {log.text}
              </span>
            </div>
          ))}

        {filteredDiagnostics.length === 0 && logs.length === 0 && (
          <div
            className={`h-full flex items-center justify-center text-[11px] font-sans ${
              isLight ? 'text-slate-400' : 'text-[#495464]'
            }`}
          >
            Ready. Click "SYNTAX CHECK" to parse code and check for errors.
          </div>
        )}

        {checkScope === 'mod' && fullCheckStale && (
          <div
            className={`p-2 rounded border text-[11px] ${
              isLight
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-800'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
            }`}
          >
            Full-mod results are stale: a buffer changed after the last check. Press
            SYNTAX CHECK to resolve the require graph again.
          </div>
        )}

        {/* Status banner -- LAST in the stream, not first.
         * The auto-scroll effect above pins this box to scrollHeight, so whatever
         * renders last is what you actually see. It used to render first, which put
         * the verdict permanently above the fold: you got the diagnostics and the
         * log lines but never the pass/fail conclusion they were about. Both states
         * are now at the bottom, verdict first when you scroll up into it. */}
        {hasRunCheck &&
          (errors > 0 ? (
            <div
              className={`flex items-center gap-2 p-2 rounded bg-rose-500/10 border border-rose-500/30 text-[11px] ${
                isLight ? 'text-rose-800' : 'text-rose-300'
              }`}
            >
              <AlertCircle className={`w-4 h-4 shrink-0 ${isLight ? 'text-rose-600' : 'text-rose-400'}`} />
              <div>
                <p className="font-semibold font-sans">{scopeLabel} Failed</p>
                <span className={`text-[10.5px] ${isLight ? 'text-rose-700' : 'text-rose-400/80'}`}>
                  {errors} error{errors === 1 ? '' : 's'}
                  {warnings > 0 && `, ${warnings} warning${warnings === 1 ? '' : 's'}`}
                  {infos > 0 && `, ${infos} info${infos === 1 ? '' : 's'}`}
                  . The full list is above.
                </span>
              </div>
            </div>
          ) : warnings > 0 ? (
            /* ORANGE, not green. Three states, not two.
             *
             * A run with no errors but one or more warnings is the COMMON case: the
             * file compiles, loads, and runs right up until the branch that trips a
             * warning. A green "Succeeded" banner sitting above a non-empty warning
             * list reads as "all clear", and that is the one thing this banner must
             * never do -- a name that resolves to nil mid-game takes every other mod
             * down with it, because run_mods aborts the whole load on first error.
             */
            <div
              className={`flex items-center gap-2 p-2 rounded bg-amber-500/10 border border-amber-500/30 text-[11px] ${
                isLight ? 'text-amber-800' : 'text-amber-300'
              }`}
            >
              <AlertTriangle className={`w-4 h-4 shrink-0 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
              <div>
                <p className="font-semibold font-sans">{scopeLabel} Passed With Warnings</p>
                <span className={`text-[10.5px] ${isLight ? 'text-amber-700' : 'text-amber-400/80'}`}>
                  0 errors, {warnings} warning{warnings === 1 ? '' : 's'}.{' '}
                  {checkScope === 'mod'
                    ? 'The open bundle and its dependency closure resolve, but the warnings above describe things that stop working mid-game.'
                    : 'This file compiles and will load, but the warnings above describe things that stop working mid-game.'}{' '}
                  Full list above.
                </span>
              </div>
            </div>
          ) : (
            <div
              className={`flex items-center gap-2 p-2 rounded bg-emerald-500/10 border border-emerald-500/30 text-[11px] ${
                isLight ? 'text-emerald-800' : 'text-emerald-300'
              }`}
            >
              <CheckCircle2 className={`w-4 h-4 shrink-0 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`} />
              <div>
                <p className="font-semibold font-sans">{scopeLabel} Succeeded</p>
                <span className={`text-[10.5px] ${isLight ? 'text-emerald-700' : 'text-emerald-400/80'}`}>
                  {checkScope === 'mod' ? (
                    <>0 errors, 0 warnings. Resolved the open bundle and its dependency closure.</>
                  ) : checkEngine === 'game-compiler' ? (
                    <>0 errors, 0 warnings. Checked with the real game compiler (Lua 5.4), then with the built-in verb checker.</>
                  ) : checkEngine === 'builtin' ? (
                    <>0 errors, 0 warnings. Checked with the built-in parser only - the game compiler was unreachable in this build.</>
                  ) : (
                    <>Not a Lua file, so no Lua check applies.</>
                  )}
                </span>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
};
