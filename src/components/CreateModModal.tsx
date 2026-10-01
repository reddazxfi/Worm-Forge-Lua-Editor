import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';

interface CreateModModalProps {
  isOpen: boolean;
  isLight?: boolean;
  isBusy?: boolean;
  error?: string | null;
  onClose: () => void;
  onCreate: (modName: string, author: string) => void;
}

/**
 * Two plain text fields, nothing more. The parent does the actual work.
 * Mirrors the existing KeycodeModal layout (fixed overlay, dark panel).
 */
export const CreateModModal: React.FC<CreateModModalProps> = ({
  isOpen,
  isLight = false,
  isBusy = false,
  error = null,
  onClose,
  onCreate,
}) => {
  const [modName, setModName] = useState('');
  const [author, setAuthor] = useState('');

  if (!isOpen) return null;

  const canSubmit = modName.trim().length > 0 && author.trim().length > 0 && !isBusy;

  const submit = () => {
    if (!canSubmit) return;
    onCreate(modName.trim(), author.trim());
  };

  const inputClass = `w-full px-2 py-1.5 rounded text-xs border focus:outline-none focus:border-amber-500 transition-colors ${
    isLight
      ? 'bg-white text-slate-900 border-slate-300'
      : 'bg-[#1f242c] text-[#e0e6ed] border-[#2e3540]'
  }`;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        className={`rounded-lg max-w-sm w-full shadow-2xl overflow-hidden text-xs border ${
          isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-[#171b21] border-[#2e3744] text-[#cfdbe8]'
        }`}
      >
        <div
          className={`p-3 border-b flex items-center justify-between ${
            isLight ? 'bg-slate-100 border-slate-200' : 'bg-[#1d222b] border-[#2b3340]'
          }`}
        >
          <span className="font-semibold text-sm">Create new mod</span>
          <button
            onClick={onClose}
            disabled={isBusy}
            className={`p-1 rounded transition-colors disabled:opacity-40 ${
              isLight ? 'hover:bg-slate-200' : 'hover:bg-[#2b3340]'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className={isLight ? 'text-slate-600' : 'text-[#93a6bd]'}>Mod name</span>
            <input
              type="text"
              autoFocus
              value={modName}
              onChange={(e) => setModName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="e.g. banana_jetpack"
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className={isLight ? 'text-slate-600' : 'text-[#93a6bd]'}>Author / user name</span>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="e.g. 0rang3"
              className={inputClass}
            />
          </label>

          <p className={`text-[10.5px] ${isLight ? 'text-slate-500' : 'text-[#63758b]'}`}>
            Creates a subfolder with a minimal mod.toml (version 0.1.0) and a
            placeholder .lua file, then opens it.
          </p>

          {error && (
            <div
              className={`rounded border px-2 py-1.5 text-[11px] ${
                isLight
                  ? 'bg-rose-50 border-rose-300 text-rose-700'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {error}
            </div>
          )}
        </div>

        <div
          className={`p-3 border-t flex items-center justify-end gap-2 ${
            isLight ? 'bg-slate-100 border-slate-200' : 'bg-[#1d222b] border-[#2b3340]'
          }`}
        >
          <button
            onClick={onClose}
            disabled={isBusy}
            className={`px-3 py-1.5 rounded border font-medium transition-colors disabled:opacity-40 ${
              isLight
                ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                : 'bg-[#202631] hover:bg-[#2b3341] text-[#cfdbe8] border-[#2e3745]'
            }`}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-colors disabled:opacity-40 flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isBusy ? 'Creating...' : 'Create'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};