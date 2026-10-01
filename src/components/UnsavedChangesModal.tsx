import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface UnsavedChangesModalProps {
  isOpen: boolean;
  fileNames: string[];
  isLight?: boolean;
  onSaveAndClose: () => void;
  onDiscardAndClose: () => void;
  onCancel: () => void;
}

export const UnsavedChangesModal: React.FC<UnsavedChangesModalProps> = ({
  isOpen,
  fileNames,
  isLight = false,
  onSaveAndClose,
  onDiscardAndClose,
  onCancel,
}) => {
  if (!isOpen) return null;

  const shown = fileNames.slice(0, 8);
  const extra = fileNames.length - shown.length;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        className={`rounded-lg max-w-md w-full shadow-2xl overflow-hidden text-xs border ${
          isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-[#171b21] border-[#2e3744] text-[#cfdbe8]'
        }`}
      >
        {/* Header */}
        <div
          className={`p-3 border-b flex items-center gap-2 ${
            isLight ? 'bg-slate-100 border-slate-200' : 'bg-[#1d222b] border-[#2b3340]'
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="font-semibold text-sm">You have unsaved changes</span>
        </div>

        {/* Body */}
        <div className="p-4 flex flex-col gap-2">
          <p className={isLight ? 'text-slate-600' : 'text-[#93a6bd]'}>
            {fileNames.length === 1
              ? 'This file has changes that are not written to disk yet:'
              : `${fileNames.length} files have changes that are not written to disk yet:`}
          </p>
          <ul
            className={`font-mono rounded border max-h-40 overflow-y-auto ${
              isLight
                ? 'bg-slate-50 border-slate-200 text-slate-700'
                : 'bg-[#12151a] border-[#242b36] text-[#a4b5c7]'
            }`}
          >
            {shown.map((name) => (
              <li key={name} className="px-2 py-1 truncate">
                {name}
              </li>
            ))}
            {extra > 0 && <li className="px-2 py-1 opacity-70">...and {extra} more</li>}
          </ul>
        </div>

        {/* Footer */}
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
            Cancel
          </button>
          <button
            onClick={onDiscardAndClose}
            className={`px-3 py-1.5 rounded border font-medium transition-colors ${
              isLight
                ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-300'
                : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border-rose-500/40'
            }`}
          >
            Close without saving
          </button>
          <button
            onClick={onSaveAndClose}
            className="px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-colors"
          >
            Save and close
          </button>
        </div>
      </div>
    </div>
  );
};