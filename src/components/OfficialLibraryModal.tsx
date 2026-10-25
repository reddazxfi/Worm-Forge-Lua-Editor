import React from 'react';
import { AlertTriangle, ArrowRight, Package } from 'lucide-react';

/**
 * The two moments the editor has to be honest about wf-lib:
 *
 *   - opening a pack from the managed shelf, before the user invests time in it
 *   - saving one, right before the whole mod folder moves to Mods/
 *
 * Both are the same visual language as UnsavedChangesModal, but the copy is
 * deliberately conversational. A dry "managed directory" sentence is easy to
 * click past; "this gets wiped on update" is not.
 */
export type OfficialLibraryPrompt =
  | {
      kind: 'open';
      folderName: string;
      modId: string;
    }
  | {
      kind: 'save';
      folderName: string;
      targetRoot: string;
      renamed: boolean;
    };

interface OfficialLibraryModalProps {
  prompt: OfficialLibraryPrompt | null;
  isLight?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const OfficialLibraryModal: React.FC<OfficialLibraryModalProps> = ({
  prompt,
  isLight = false,
  onConfirm,
  onCancel,
}) => {
  if (!prompt) return null;

  const isSave = prompt.kind === 'save';
  const codeClass = isLight
    ? 'bg-slate-100 border-slate-200 text-slate-800'
    : 'bg-[#12151a] border-[#2a3340] text-[#c9d8e8]';

  return (
    <div className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        className={`rounded-lg max-w-lg w-full shadow-2xl overflow-hidden text-xs border ${
          isLight
            ? 'bg-white border-amber-300 text-slate-800'
            : 'bg-[#171b21] border-amber-500/40 text-[#cfdbe8]'
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="official-library-title"
      >
        <div
          className={`p-3 border-b flex items-center gap-2 ${
            isLight ? 'bg-amber-50 border-amber-200' : 'bg-amber-500/10 border-amber-500/25'
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          <span
            id="official-library-title"
            className={`font-semibold text-sm ${isLight ? 'text-amber-900' : 'text-amber-200'}`}
          >
            {isSave ? 'This save would live on borrowed time' : 'Careful: this mod lives in wf-lib'}
          </span>
        </div>

        <div className="p-4 flex flex-col gap-3 leading-relaxed">
          <div className="flex items-center gap-2">
            <Package className={`w-4 h-4 shrink-0 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
            <span className={`font-mono text-[11px] break-all ${isLight ? 'text-slate-700' : 'text-[#b9cadb]'}`}>
              wf-lib/{prompt.folderName}
            </span>
          </div>

          {isSave ? (
            <>
              <p className={isLight ? 'text-slate-700' : 'text-[#c2d1e0]'}>
                <strong>WormForge owns <span className="font-mono">wf-lib</span>.</strong> The updater
                wipes and reinstalls that shelf to keep every official file hash-identical, so a save
                left there is basically a note to your future self that says “gone next update”.
              </p>
              <p className={isLight ? 'text-slate-700' : 'text-[#c2d1e0]'}>
                I&apos;ll move the whole <strong>{prompt.folderName}</strong> mod folder to your normal
                Mods folder, then save there. That copy is yours; updates won&apos;t touch it.
              </p>

              <div
                className={`flex items-center gap-2 rounded border px-2.5 py-2 font-mono text-[10.5px] break-all ${codeClass}`}
              >
                <span className="opacity-70">wf-lib/{prompt.folderName}</span>
                <ArrowRight className="w-3.5 h-3.5 shrink-0 opacity-60" />
                <span className="font-semibold">{prompt.targetRoot}</span>
              </div>

              {prompt.renamed && (
                <p
                  className={`rounded border px-2.5 py-2 text-[11px] ${
                    isLight
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-amber-500/10 border-amber-500/25 text-amber-200'
                  }`}
                >
                  Heads-up: <span className="font-mono">Mods/{prompt.folderName}</span> was already
                  taken, so I&apos;m using <span className="font-mono">{prompt.targetRoot}</span> instead
                  of stomping on your other copy. You can tidy up the names later.
                </p>
              )}
            </>
          ) : (
            <>
              <p className={isLight ? 'text-slate-700' : 'text-[#c2d1e0]'}>
                <strong><span className="font-mono">wf-lib</span> is WormForge&apos;s own shelf.</strong>{' '}
                The updater clears and reinstalls it on every release, so anything you save there has
                the lifespan of a mayfly.
              </p>
              <p className={isLight ? 'text-slate-700' : 'text-[#c2d1e0]'}>
                You can still browse and edit it. When you save a change, I&apos;ll ask before moving
                the whole <strong>{prompt.folderName}</strong> mod folder into your normal Mods
                folder, where official updates can&apos;t reach it. Nothing moves without your
                say-so.
              </p>
            </>
          )}
        </div>

        <div
          className={`p-3 border-t flex items-center justify-end gap-2 ${
            isLight ? 'bg-slate-100 border-slate-200' : 'bg-[#1d222b] border-[#2b3340]'
          }`}
        >
          <button
            onClick={onCancel}
            className={`px-3 py-1.5 rounded border font-medium transition-colors ${
              isLight
                ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                : 'bg-[#202631] hover:bg-[#2b3341] text-[#cfdbe8] border-[#2e3745]'
            }`}
          >
            {isSave ? 'Nope, cancel save' : 'Back to the mods'}
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-colors"
          >
            {isSave ? 'Move it, save it' : 'Open it anyway'}
          </button>
        </div>
      </div>
    </div>
  );
};
