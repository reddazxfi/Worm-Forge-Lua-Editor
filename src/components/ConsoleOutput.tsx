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

interface ConsoleOutputProps {
  diagnostics: SyntaxDiagnostic[];
  logs: { time: string; text: string; type: 'info' | 'success' | 'warn' | 'error' }[];
  onSelectDiagnostic: (diag: SyntaxDiagnostic) => void;
  onClearLogs: () => void;
  hasRunCheck: boolean;
}

export const ConsoleOutput: React.FC<ConsoleOutputProps> = ({
  diagnostics,
  logs,
  onSelectDiagnostic,
  onClearLogs,
  hasRunCheck,
}) => {
  const [filter, setFilter] = React.useState<'all' | 'errors' | 'warnings'>('all');

  const errors = diagnostics.filter((d) => d.severity === 'error');
  const warnings = diagnostics.filter((d) => d.severity === 'warning');

  const filteredDiagnostics = diagnostics.filter((d) => {
    if (filter === 'errors') return d.severity === 'error';
    if (filter === 'warnings') return d.severity === 'warning';
    return true;
  });

  return (
    <div className="h-full flex flex-col bg-[#14171c] text-xs font-mono select-text">
      {/* Console Top Toolbar */}
      <div className="p-1.5 px-2 bg-[#171b21] border-b border-[#242932] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-[#8b9cb0] font-sans font-semibold text-[11px] uppercase tracking-wider">
            <Terminal className="w-3.5 h-3.5 text-amber-400" />
            <span>Syntax &amp; Parser Output</span>
          </div>

          <div className="flex items-center gap-1 ml-2 font-sans text-[11px]">
            <button
              onClick={() => setFilter('all')}
              className={`px-1.5 py-0.5 rounded ${
                filter === 'all'
                  ? 'bg-[#29323f] text-[#e0e6ed] font-medium'
                  : 'text-[#6f7e91] hover:text-[#9fb0c5]'
              }`}
            >
              All ({diagnostics.length + logs.length})
            </button>
            <button
              onClick={() => setFilter('errors')}
              className={`px-1.5 py-0.5 rounded flex items-center gap-1 ${
                filter === 'errors'
                  ? 'bg-rose-500/20 text-rose-300 font-medium'
                  : 'text-[#6f7e91] hover:text-rose-400'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
              Errors ({errors.length})
            </button>
            <button
              onClick={() => setFilter('warnings')}
              className={`px-1.5 py-0.5 rounded flex items-center gap-1 ${
                filter === 'warnings'
                  ? 'bg-amber-500/20 text-amber-300 font-medium'
                  : 'text-[#6f7e91] hover:text-amber-400'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
              Warn ({warnings.length})
            </button>
          </div>
        </div>

        <button
          onClick={onClearLogs}
          title="Clear console output"
          className="p-1 rounded text-[#6a798c] hover:text-[#cfdbe8] hover:bg-[#20252e] transition-colors"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* Output Stream */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 text-[11.5px]">
        {/* Status banner when Syntax Check is clean */}
        {hasRunCheck && errors.length === 0 && (
          <div className="flex items-center gap-2 p-2 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px]">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <p className="font-semibold font-sans">Syntax Check Succeeded</p>
              <span className="text-[10.5px] text-emerald-400/80">
                0 errors detected. Code structure, brackets, and WormForge verbs are validated.
              </span>
            </div>
          </div>
        )}

        {/* Diagnostics list */}
        {filteredDiagnostics.map((diag, index) => {
          const isError = diag.severity === 'error';
          const isWarning = diag.severity === 'warning';
          return (
            <div
              key={index}
              onClick={() => onSelectDiagnostic(diag)}
              className={`p-1.5 rounded border transition-colors cursor-pointer group flex items-start justify-between gap-2 ${
                isError
                  ? 'bg-rose-500/10 border-rose-500/30 hover:bg-rose-500/15 text-rose-200'
                  : isWarning
                  ? 'bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/15 text-amber-200'
                  : 'bg-sky-500/10 border-sky-500/30 text-sky-200'
              }`}
            >
              <div className="flex items-start gap-1.5 truncate">
                {isError ? (
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400 mt-0.5 shrink-0" />
                ) : isWarning ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                ) : (
                  <Info className="w-3.5 h-3.5 text-sky-400 mt-0.5 shrink-0" />
                )}
                <div className="truncate">
                  <span className="font-semibold mr-1.5 underline decoration-dotted">
                    Line {diag.line}:{diag.column}
                  </span>
                  <span className="text-[#d8e3ef]">{diag.message}</span>
                </div>
              </div>
              <ExternalLink className="w-3 h-3 text-[#647488] group-hover:text-amber-400 shrink-0 mt-0.5" />
            </div>
          );
        })}

        {/* General execution and debug logs */}
        {filter === 'all' &&
          logs.map((log, index) => (
            <div key={index} className="flex items-start gap-2 py-0.5 text-[#889cb0] text-[11px]">
              <span className="text-[#516173] font-mono select-none">{log.time}</span>
              <span
                className={
                  log.type === 'error'
                    ? 'text-rose-400'
                    : log.type === 'warn'
                    ? 'text-amber-400'
                    : log.type === 'success'
                    ? 'text-emerald-400'
                    : 'text-[#889cb0]'
                }
              >
                {log.text}
              </span>
            </div>
          ))}

        {filteredDiagnostics.length === 0 && logs.length === 0 && (
          <div className="h-full flex items-center justify-center text-[#495464] text-[11px] font-sans">
            Ready. Click "SYNTAX CHECK" to parse code and check for errors.
          </div>
        )}
      </div>
    </div>
  );
};
