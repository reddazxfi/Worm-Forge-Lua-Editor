import React, { useMemo } from 'react';
import { AlertTriangle, ArrowLeft, Code2, FileCode, FileText, Package, Sliders, Zap } from 'lucide-react';
import type { WorkspaceFile, WorkspaceModel } from '../services/workspaceTree';
import { listModFiles } from '../services/workspaceTree';

interface ModFilesScreenProps {
  /** Folder name on disk, e.g. `tools`. */
  folderName: string;
  /** Manifest `id`, shown when it differs from the folder name. */
  modId: string | null;
  /** The mod's own display name, for bundles that declare one. */
  modName: string | null;
  /** True when this pack lives on the managed wf-lib shelf. */
  official?: boolean;
  model: WorkspaceModel;
  isLight?: boolean;
  onOpenFile: (path: string) => void;
  onBack: () => void;
  onOpenConfig: () => void;
}

/** Fixed tile art size, matching ModsListScreen so the two views read as one window. */
const ICON_PX = 64;

/**
 * The second level of the mods browser: one mod's files, in the same grid.
 *
 * ModsListScreen answers "which mod"; this answers "which file". It exists so
 * that opening a pack with 57 Lua files does not dump the user into an arbitrary
 * one and leave them hunting in the sidebar. Double-clicking a tile opens that
 * file in the editor; the sidebar tree is still there afterwards for everything
 * else.
 */
export const ModFilesScreen: React.FC<ModFilesScreenProps> = ({
  folderName,
  modId,
  modName,
  official = false,
  model,
  isLight = false,
  onOpenFile,
  onBack,
  onOpenConfig,
}) => {
  const listing = useMemo(() => listModFiles(model), [model]);

  const iconFor = (file: WorkspaceFile) => {
    switch (file.kind) {
      case 'profile':
        return <Sliders className={`w-6 h-6 ${isLight ? 'text-amber-600' : 'text-amber-500'}`} />;
      case 'manifest':
        return <FileCode className={`w-6 h-6 ${isLight ? 'text-sky-600' : 'text-sky-400'}`} />;
      case 'doc':
        return <FileText className={`w-6 h-6 ${isLight ? 'text-slate-500' : 'text-[#5f7085]'}`} />;
      default:
        return <Code2 className={`w-6 h-6 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`} />;
    }
  };

  const tile = (file: WorkspaceFile) => {
    const isEntry = file.componentIds.length > 0;
    const entryLabel =
      file.componentIds.length <= 2
        ? file.componentIds.join(', ')
        : `${file.componentIds[0]} +${file.componentIds.length - 1}`;
    return (
      <button
        key={file.path}
        onDoubleClick={() => onOpenFile(file.path)}
        title={
          isEntry
            ? `${file.path}\nEntrypoint for ${file.componentIds.join(', ')}`
            : file.path
        }
        className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors text-center ${
          isLight
            ? 'bg-white border-slate-300 hover:bg-slate-50'
            : 'bg-[#171b21] border-[#242b35] hover:bg-[#1d222b]'
        }`}
      >
        <div
          className={`relative flex items-center justify-center rounded border overflow-hidden shrink-0 ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0e1115] border-[#242b35]'
          }`}
          style={{ width: `${ICON_PX}px`, height: `${ICON_PX}px` }}
        >
          {iconFor(file)}
          {isEntry && (
            <span className="absolute top-0 right-0 p-0.5 rounded-bl bg-amber-500/90">
              <Zap className="w-3 h-3 text-slate-950" />
            </span>
          )}
        </div>

        {/* Full mod-relative path, because `lib/holds.lua` and `holds.lua` are
            different files and a flat list cannot rely on the folder column. */}
        <span
          className={`text-[10.5px] font-mono leading-tight break-all w-full ${
            isLight ? 'text-slate-900' : 'text-[#dce7f3]'
          }`}
        >
          {file.path}
        </span>

        <span
          className={`text-[10px] w-full truncate font-sans ${
            isEntry
              ? isLight
                ? 'text-amber-700'
                : 'text-amber-300'
              : isLight
              ? 'text-slate-500'
              : 'text-[#7e8fa3]'
          }`}
          title={isEntry ? file.componentIds.join(', ') : undefined}
        >
          {isEntry ? entryLabel : file.kind === 'lua' ? 'module' : file.kind}
        </span>
      </button>
    );
  };

  const sectionLabel = (text: string) => (
    <h2
      className={`text-[11px] font-semibold uppercase tracking-wide mb-2 ${
        isLight ? 'text-slate-500' : 'text-[#7e8fa3]'
      }`}
    >
      {text}
    </h2>
  );

  return (
    <div
      className={`h-full flex flex-col select-none transition-colors ${
        isLight ? 'bg-slate-100 text-slate-800' : 'bg-[#0e1115] text-[#cfdbe8]'
      }`}
    >
      {/* Header -- same bar as the mod grid, with a back step in front. */}
      <div
        className={`px-4 py-3 border-b flex items-center gap-3 shrink-0 transition-colors ${
          isLight ? 'bg-white border-slate-300' : 'bg-[#171b21] border-[#242b35]'
        }`}
      >
        <button
          onClick={onBack}
          title="Back to the mod list"
          className={`flex items-center gap-1 px-2 py-1.5 rounded border text-[11px] font-medium shrink-0 transition-colors ${
            isLight
              ? 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
              : 'bg-[#202631] hover:bg-[#2b3341] text-[#93a6bd] border-[#2e3745]'
          }`}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Mods</span>
        </button>

        <Package className={`w-5 h-5 shrink-0 ${isLight ? 'text-amber-600' : 'text-amber-500'}`} />

        <div className="min-w-0">
          <h1
            className={`font-bold text-sm truncate flex items-center gap-1.5 ${
              isLight ? 'text-slate-900' : 'text-[#e4edf7]'
            }`}
            title={modName ? `${folderName} — ${modName}` : folderName}
          >
            <span className="truncate">{modId || folderName}</span>
            {official && (
              <span className="shrink-0 rounded bg-amber-500 px-1 py-0.5 text-[8px] font-bold tracking-wide text-slate-950">
                WF-LIB
              </span>
            )}
          </h1>
          <p className={`text-[11px] truncate ${isLight ? 'text-slate-500' : 'text-[#7e8fa3]'}`}>
            {model.lua.length} Lua file{model.lua.length === 1 ? '' : 's'}
            {listing.entryCount > 0 &&
              ` · ${listing.entryCount} entrypoint${listing.entryCount === 1 ? '' : 's'}`}
            {` · ${model.fileCount} text file${model.fileCount === 1 ? '' : 's'}`}
            {modId && modId !== folderName ? ` · folder "${folderName}"` : ''}
          </p>
        </div>

        <div className="flex items-center gap-2 ml-auto shrink-0">
          <button
            onClick={onOpenConfig}
            className={`px-2.5 py-1.5 rounded border text-[11px] font-medium transition-colors ${
              isLight
                ? 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
                : 'bg-[#202631] hover:bg-[#2b3341] text-[#cfdbe8] border-[#2e3745]'
            }`}
          >
            Config
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5">
        {official && (
          <div
            className={`rounded border px-3 py-2 mb-4 flex items-start gap-2 text-[11px] ${
              isLight
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-100'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
            <p>
              This is an official <span className="font-mono">wf-lib</span> pack. Read and edit all
              you like — the first save with changes will offer to move the whole mod into your
              normal <span className="font-mono">Mods</span> folder before anything is written, so an
              update can&apos;t erase your work.
            </p>
          </div>
        )}

        {listing.lua.length > 0 && (
          <>
            {sectionLabel(`Lua files (${listing.lua.length})`)}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3 mb-6">
              {listing.lua.map(tile)}
            </div>
          </>
        )}

        {listing.extras.length > 0 && (
          <>
            {sectionLabel(`Profiles, manifest & documents (${listing.extras.length})`)}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
              {listing.extras.map(tile)}
            </div>
          </>
        )}

        {listing.lua.length === 0 && listing.extras.length === 0 && (
          <div
            className={`h-full flex flex-col items-center justify-center gap-2 text-center ${
              isLight ? 'text-slate-500' : 'text-[#5b6b7e]'
            }`}
          >
            <FileText className="w-8 h-8 opacity-50" />
            <p className="text-xs font-medium">This mod has no readable text files.</p>
          </div>
        )}
      </div>

      {/* Entry files are pulled to the front of the list and marked, because
          they are what the engine actually starts -- but the list still contains
          every Lua file, so a `require`d module is never hidden behind the
          manifest. */}
      <div
        className={`px-4 py-2 border-t text-[10.5px] shrink-0 transition-colors ${
          isLight ? 'bg-white border-slate-300 text-slate-500' : 'bg-[#14171c] border-[#242932] text-[#63758b]'
        }`}
      >
        Double-click a file to open it. Files marked with a bolt are entrypoints declared in{' '}
        <span className="font-mono">mod.toml</span>; the rest are modules the engine may reach through{' '}
        <span className="font-mono">require</span>.
      </div>
    </div>
  );
};
