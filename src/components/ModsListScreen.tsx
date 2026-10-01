import React, { useMemo, useState } from 'react';
import { Package, Plus, RefreshCw, FolderOpen } from 'lucide-react';

export interface ModsListTile {
  folderName: string;
  path: string;
  id: string;
  author: string;
  version: string;
  iconUrl: string | null;
  mtime: number | null;
}

interface ModsListScreenProps {
  mods: ModsListTile[];
  isLoading?: boolean;
  error?: string | null;
  isLight?: boolean;
  onOpenMod: (mod: ModsListTile) => void;
  onRefresh: () => void;
  onCreateNew: () => void;
  onOpenConfig: () => void;
}

/** Fixed tile art size, in px. Same for every tile by design. */
const ICON_PX = 64;

export const ModsListScreen: React.FC<ModsListScreenProps> = ({
  mods,
  isLoading = false,
  error = null,
  isLight = false,
  onOpenMod,
  onRefresh,
  onCreateNew,
  onOpenConfig,
}) => {
  const [sortBy, setSortBy] = useState<'name' | 'date'>('name');

  const sorted = useMemo(() => {
    const copy = [...mods];
    if (sortBy === 'name') {
      copy.sort((a, b) => a.id.toLowerCase().localeCompare(b.id.toLowerCase()));
    } else {
      // Newest first. Mods with no mtime sink to the bottom rather than
      // being treated as "most recently modified".
      copy.sort((a, b) => (b.mtime ?? -Infinity) - (a.mtime ?? -Infinity));
    }
    return copy;
  }, [mods, sortBy]);

  return (
    <div
      className={`h-full flex flex-col select-none transition-colors ${
        isLight ? 'bg-slate-100 text-slate-800' : 'bg-[#0e1115] text-[#cfdbe8]'
      }`}
    >
      {/* Header */}
      <div
        className={`px-4 py-3 border-b flex items-center gap-3 shrink-0 transition-colors ${
          isLight ? 'bg-white border-slate-300' : 'bg-[#171b21] border-[#242b35]'
        }`}
      >
        <Package className={`w-5 h-5 shrink-0 ${isLight ? 'text-amber-600' : 'text-amber-500'}`} />
        <div className="min-w-0">
          <h1 className={`font-bold text-sm truncate ${isLight ? 'text-slate-900' : 'text-[#e4edf7]'}`}>
            Select a Mod
          </h1>
          <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-[#7e8fa3]'}`}>
            {isLoading
              ? 'Scanning mods folder...'
              : `${mods.length} mod${mods.length === 1 ? '' : 's'} found`}
          </p>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {/* Sort toggle: Name / Date modified only. */}
          <div
            className={`flex items-center rounded border overflow-hidden transition-colors ${
              isLight ? 'border-slate-300 bg-slate-50' : 'border-[#2b3340] bg-[#1c222b]'
            }`}
          >
            {(['name', 'date'] as const).map((key) => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                title={key === 'name' ? 'Sort by name' : 'Sort by date modified'}
                className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  sortBy === key
                    ? isLight
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'bg-amber-500 text-slate-950 font-bold'
                    : isLight
                    ? 'text-slate-600 hover:text-slate-900'
                    : 'text-[#8b9cb0] hover:text-[#dce7f3]'
                }`}
              >
                {key === 'name' ? 'Name' : 'Date modified'}
              </button>
            ))}
          </div>

          <button
            onClick={onRefresh}
            title="Rescan mods folder"
            className={`p-1.5 rounded border transition-colors ${
              isLight
                ? 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
                : 'bg-[#202631] hover:bg-[#2b3341] text-[#93a6bd] border-[#2e3745]'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={onCreateNew}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded border text-[11px] font-medium transition-colors ${
              isLight
                ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300'
                : 'bg-[#202631] hover:bg-[#2b3341] text-amber-300 border-amber-500/30'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create new mod</span>
          </button>

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
      <div className={`flex-1 overflow-y-auto p-5 ${isLight ? '' : ''}`}>
        {error && (
          <div
            className={`rounded border px-3 py-2 text-[11px] mb-4 ${
              isLight
                ? 'bg-rose-50 border-rose-300 text-rose-700'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            {error}
          </div>
        )}

        {!isLoading && mods.length === 0 && !error && (
          <div className={`h-full flex flex-col items-center justify-center gap-2 text-center ${
            isLight ? 'text-slate-500' : 'text-[#5b6b7e]'
          }`}>
            <FolderOpen className="w-8 h-8 opacity-50" />
            <p className="text-xs font-medium">No mods found in this folder.</p>
            <p className="text-[11px] max-w-sm">
              Each mod must be a subfolder containing a <span className="font-mono">mod.toml</span>.
            </p>
            <button
              onClick={onCreateNew}
              className="mt-2 px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-bold transition-colors"
            >
              Create new mod
            </button>
          </div>
        )}

        {/* Flat icon grid: wraps to whatever fits the width. */}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
          {sorted.map((mod) => (
            <button
              key={mod.path}
              onDoubleClick={() => onOpenMod(mod)}
              title={`Open ${mod.id}`}
              className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors text-center ${
                isLight
                  ? 'bg-white border-slate-300 hover:bg-slate-50'
                  : 'bg-[#171b21] border-[#242b35] hover:bg-[#1d222b]'
              }`}
            >
              <div
                className={`flex items-center justify-center rounded border overflow-hidden shrink-0 ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0e1115] border-[#242b35]'
                }`}
                style={{ width: `${ICON_PX}px`, height: `${ICON_PX}px` }}
              >
                {mod.iconUrl ? (
                  <img
                    src={mod.iconUrl}
                    alt=""
                    // Fit, never upscale beyond the tile box.
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <Package
                    className={`w-7 h-7 ${isLight ? 'text-slate-400' : 'text-[#4d5c6e]'}`}
                  />
                )}
              </div>

              <span
                className={`text-[11px] font-semibold w-full truncate ${
                  isLight ? 'text-slate-900' : 'text-[#dce7f3]'
                }`}
              >
                {mod.id}
              </span>
              <span className={`text-[10px] w-full truncate ${isLight ? 'text-slate-500' : 'text-[#7e8fa3]'}`}>
                {mod.author} &middot; {mod.version}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div
        className={`px-4 py-2 border-t text-[10.5px] shrink-0 transition-colors ${
          isLight ? 'bg-white border-slate-300 text-slate-500' : 'bg-[#14171c] border-[#242932] text-[#63758b]'
        }`}
      >
        Double-click a mod to open it.
      </div>
    </div>
  );
};