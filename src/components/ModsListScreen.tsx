import React, { useDeferredValue, useMemo, useState } from 'react';
import { AlertTriangle, Package, Plus, RefreshCw, FolderOpen, Search, Share2, X } from 'lucide-react';
import type { AppSurfaces } from '../services/appTheme';

export interface ModsListTile {
  folderName: string;
  path: string;
  /** True when this pack lives on the managed `wf-lib` shelf. */
  official?: boolean;
  id: string;
  author: string;
  version: string;
  iconUrl: string | null;
  mtime: number | null;
  /** Components declared by mod.toml, for resolving a profile's features. */
  components?: { id?: string; type?: string; entry?: string }[];
  /** Number of public modules declared in `[exports]`. */
  exportCount?: number;
  /** Stems of the `profiles/*.toml` this mod ships. */
  bundledProfiles?: string[];
}

interface ModsListScreenProps {
  mods: ModsListTile[];
  isLoading?: boolean;
  /**
   * Path of the mod currently being read from disk. A big pack (mods/px has
   * 3073 files) takes a visible moment to walk, and a tile that silently does
   * nothing for a second reads as a broken double-click.
   */
  openingPath?: string | null;
  error?: string | null;
  /** Tile art size in px. Defaults to the historical 64px. */
  iconSize?: number;
  isLight?: boolean;
  surface?: AppSurfaces;
  onOpenMod: (mod: ModsListTile) => void;
  onRefresh: () => void;
  onCreateNew: () => void;
  onOpenProfiles: () => void;
  onOpenConfig: () => void;
}

/** Historical tile art size, in px. Every tile uses the configured value. */
const DEFAULT_ICON_PX = 64;

export const ModsListScreen: React.FC<ModsListScreenProps> = ({
  mods,
  isLoading = false,
  openingPath = null,
  error = null,
  iconSize = DEFAULT_ICON_PX,
  isLight = false,
  surface,
  onOpenMod,
  onRefresh,
  onCreateNew,
  onOpenProfiles,
  onOpenConfig,
}) => {
  const [sortBy, setSortBy] = useState<'name' | 'date'>('name');
  const [searchTerm, setSearchTerm] = useState('');
  // Config import can hand us anything; keep the grid safe even before the
  // App-level normaliser has a chance to run.
  const artSize = Number.isFinite(iconSize)
    ? Math.max(32, Math.min(160, Math.round(iconSize)))
    : DEFAULT_ICON_PX;

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

  const deferredSearchTerm = useDeferredValue(searchTerm);
  const needle = deferredSearchTerm.trim().toLowerCase();
  const hasSearch = searchTerm.trim().length > 0;
  const filtered = useMemo(() => {
    if (!needle) return sorted;
    return sorted.filter((m) =>
      [m.id, m.folderName, m.author, m.version].some((value) =>
        value.toLowerCase().includes(needle)
      )
    );
  }, [sorted, needle]);

  const officialMods = useMemo(() => filtered.filter((m) => m.official), [filtered]);
  const localMods = useMemo(() => filtered.filter((m) => !m.official), [filtered]);
  const allOfficialCount = useMemo(() => sorted.filter((m) => m.official).length, [sorted]);

  const sectionLabel = (text: string) => (
    <h2
      className={`text-[11px] font-semibold uppercase tracking-wide mb-2 ${
        isLight ? 'text-slate-500' : 'text-[#7e8fa3]'
      }`}
    >
      {text}
    </h2>
  );

  const gridClass = 'grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3';

  const tile = (mod: ModsListTile) => (
    <button
      key={mod.path}
      onDoubleClick={() => onOpenMod(mod)}
      disabled={!!openingPath}
      title={
        mod.official
          ? `Open ${mod.id} (official wf-lib mod)`
          : `Open ${mod.id}`
      }
      className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors text-center ${
        openingPath === mod.path
          ? isLight
            ? 'bg-amber-50 border-amber-400'
            : 'bg-[#1d222b] border-amber-500/60'
          : isLight
          ? 'bg-white border-slate-300 hover:bg-slate-50'
          : 'bg-[#171b21] border-[#242b35] hover:bg-[#1d222b]'
      } ${openingPath && openingPath !== mod.path ? 'opacity-50' : ''}`}
    >
      <div
        className={`relative flex items-center justify-center rounded border overflow-hidden shrink-0 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0e1115] border-[#242b35]'
        }`}
        style={{ width: `${artSize}px`, height: `${artSize}px` }}
      >
        {mod.iconUrl ? (
          <img
            src={mod.iconUrl}
            alt=""
            // Manifest icons are usually 32x32; fit them into the configured
            // tile and keep the pixels crisp instead of blurring the upscale.
            className="w-full h-full object-contain"
            style={{ imageRendering: 'pixelated' }}
          />
        ) : (
          <Package
            className={`w-7 h-7 ${isLight ? 'text-slate-400' : 'text-[#4d5c6e]'}`}
          />
        )}
        {mod.official && (
          <span
            className="absolute top-0 left-0 px-1 py-0.5 bg-amber-500 text-slate-950 text-[8px] font-bold tracking-wide rounded-br"
            title="Official WormForge library mod"
          >
            WF
          </span>
        )}
        {(mod.exportCount ?? 0) > 0 && (
          <span
            className="absolute top-0 right-0 p-0.5 rounded-bl bg-sky-500/90"
            title={`Library: exports ${mod.exportCount} module${
              mod.exportCount === 1 ? '' : 's'
            }`}
          >
            <Share2 className="w-3 h-3 text-slate-950" />
          </span>
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
        {mod.official ? 'Official · ' : ''}
        {mod.author} &middot; {mod.version}
      </span>
    </button>
  );

  return (
    <div
      style={surface ? { backgroundColor: surface.app } : undefined}
      className={`h-full flex flex-col select-none transition-colors ${
        isLight ? 'bg-slate-100 text-slate-800' : 'bg-[#0e1115] text-[#cfdbe8]'
      }`}
    >
      {/* Header */}
      <div
        style={surface ? { backgroundColor: surface.header } : undefined}
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
            {openingPath
              ? `Reading ${mods.find((m) => m.path === openingPath)?.id ?? 'mod'}…`
              : isLoading
              ? 'Scanning mods folder...'
              : `${mods.length} mod${mods.length === 1 ? '' : 's'} found${
                  allOfficialCount > 0 ? ` · ${allOfficialCount} official` : ''
                }`}
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
            onClick={onOpenProfiles}
            title="Profiles saved in WormForge/Profiles"
            className={`px-2.5 py-1.5 rounded border text-[11px] font-medium transition-colors ${
              isLight
                ? 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
                : 'bg-[#202631] hover:bg-[#2b3341] text-[#cfdbe8] border-[#2e3745]'
            }`}
          >
            Profiles
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

        {!isLoading && mods.length === 0 && !error && !hasSearch && (
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

        <div className="relative max-w-xl mb-5">
          <Search
            className={`w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 ${
              isLight ? 'text-slate-400' : 'text-[#6c7889]'
            }`}
          />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search mods by id, folder, author or version..."
            spellCheck={false}
            className={`w-full pl-8 pr-8 py-1.5 rounded border text-[11px] outline-none transition-colors ${
              isLight
                ? 'bg-white border-slate-300 text-slate-800 placeholder:text-slate-400 focus:border-amber-500'
                : 'bg-[#11161c] border-[#2b3442] text-[#dce7f3] placeholder:text-[#5f7085] focus:border-amber-500'
            }`}
          />
          {hasSearch && (
            <button
              onClick={() => setSearchTerm('')}
              title="Clear search"
              className={`absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded ${
                isLight ? 'text-slate-400 hover:text-slate-700' : 'text-[#6c7889] hover:text-[#dce7f3]'
              }`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {hasSearch && filtered.length === 0 && (
          <div
            className={`rounded border px-4 py-6 text-center text-[11px] mb-5 ${
              isLight ? 'bg-white border-slate-300 text-slate-600' : 'bg-[#171b21] border-[#242b35] text-[#8b9cb0]'
            }`}
          >
            No mod matches <span className="font-mono">{searchTerm.trim()}</span>.
            <button onClick={() => setSearchTerm('')} className="ml-2 text-amber-500 hover:underline">
              Clear search
            </button>
          </div>
        )}

        {allOfficialCount > 0 && (
          <div
            className={`rounded border px-3 py-2.5 mb-5 flex items-start gap-2 ${
              isLight
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-100'
            }`}
          >
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="font-semibold text-[11px]">
                PSA: <span className="font-mono">wf-lib</span> is WormForge&apos;s shelf, not your
                scratchpad.
              </p>
              <p className={`text-[11px] mt-1 ${isLight ? 'text-amber-800' : 'text-amber-100/80'}`}>
                It gets wiped and reinstalled every update so the official files stay hash-identical.
                You can open and edit these packs; when you save a change, the editor will offer to
                move the whole mod into your normal <span className="font-mono">Mods</span> folder
                first. That copy is the one updates can&apos;t touch. Nothing moves without a second
                yes.
              </p>
            </div>
          </div>
        )}

        {officialMods.length > 0 && (
          <div className="mb-6">
            {sectionLabel(`WormForge official library (${officialMods.length})`)}
            <div className={gridClass}>{officialMods.map(tile)}</div>
          </div>
        )}

        {localMods.length > 0 && (
          <div>
            {allOfficialCount > 0 && sectionLabel(`Your mods (${localMods.length})`)}
            <div className={gridClass}>{localMods.map(tile)}</div>
          </div>
        )}
      </div>

      <div
        style={surface ? { backgroundColor: surface.header } : undefined}
        className={`px-4 py-2 border-t text-[10.5px] shrink-0 transition-colors ${
          isLight ? 'bg-white border-slate-300 text-slate-500' : 'bg-[#14171c] border-[#242932] text-[#63758b]'
        }`}
      >
        Double-click a mod to open it.
      </div>
    </div>
  );
};