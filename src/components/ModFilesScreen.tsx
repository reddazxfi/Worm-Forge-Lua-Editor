import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Code2,
  FileCode,
  FileText,
  Folder,
  List,
  Package,
  Search,
  Share2,
  Sliders,
  X,
  Zap,
} from 'lucide-react';
import type { WorkspaceFile, WorkspaceModel } from '../services/workspaceTree';
import { listModFiles } from '../services/workspaceTree';
import type { AppSurfaces } from '../services/appTheme';

interface ModFilesScreenProps {
  /** Folder name on disk, e.g. `tools`. */
  folderName: string;
  /** Manifest `id`, shown when it differs from the folder name. */
  modId: string | null;
  /** The mod's own display name, for bundles that declare one. */
  modName: string | null;
  /** The manifest `mod_icon`, already read into a data URL. */
  iconUrl?: string | null;
  /** True when this pack lives on the managed wf-lib shelf. */
  official?: boolean;
  model: WorkspaceModel;
  isLight?: boolean;
  surface?: AppSurfaces;
  onOpenFile: (path: string) => void;
  onBack: () => void;
  onOpenConfig: () => void;
}

/** Fixed tile art size, matching ModsListScreen so the two views read as one window. */
const ICON_PX = 64;

type FileGroup = { key: string; label: string; files: WorkspaceFile[] };

/** Directory of a mod-relative path, or '' for the root. */
function parentDir(path: string): string {
  const norm = path.replace(/\\/g, '/');
  const slash = norm.lastIndexOf('/');
  return slash === -1 ? '' : norm.slice(0, slash);
}

/** Keeps the listing order inside each folder; root first, then A-Z. */
function groupByFolder(files: WorkspaceFile[]): FileGroup[] {
  const groups = new Map<string, WorkspaceFile[]>();
  for (const file of files) {
    const dir = parentDir(file.path);
    const bucket = groups.get(dir);
    if (bucket) bucket.push(file);
    else groups.set(dir, [file]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => {
      if (!a) return -1;
      if (!b) return 1;
      return a.toLowerCase().localeCompare(b.toLowerCase());
    })
    .map(([dir, grouped]) => ({
      key: dir || '__root',
      label: dir || 'Root',
      files: grouped,
    }));
}

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
  iconUrl = null,
  official = false,
  model,
  isLight = false,
  surface,
  onOpenFile,
  onBack,
  onOpenConfig,
}) => {
  const listing = useMemo(() => listModFiles(model), [model]);
  const [searchTerm, setSearchTerm] = useState('');
  // Big packs open grouped: the flat view is still one click away, but px.ports
  // should not greet the user with 100+ cards in one wall.
  const [groupBy, setGroupBy] = useState<'flat' | 'folder'>(() =>
    listing.lua.length > 30 ? 'folder' : 'flat'
  );

  useEffect(() => {
    setSearchTerm('');
    setGroupBy(listing.lua.length > 30 ? 'folder' : 'flat');
  }, [folderName, listing.lua.length]);

  // Keep the input responsive while React filters/renders a 100+ card grid.
  // The deferred value lets a keystroke paint before the result list catches up.
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const needle = deferredSearchTerm.trim().toLowerCase();
  const searching = searchTerm.trim().length > 0;

  const matches = (file: WorkspaceFile) => {
    if (!needle) return true;
    if (file.path.toLowerCase().includes(needle)) return true;
    if (file.componentIds.some((id) => id.toLowerCase().includes(needle))) return true;
    return file.exportNames.some((name) => name.toLowerCase().includes(needle));
  };

  const filteredLua = useMemo(() => listing.lua.filter(matches), [listing.lua, needle]);
  const filteredExtras = useMemo(() => listing.extras.filter(matches), [listing.extras, needle]);

  const luaGroups = useMemo(
    () => (groupBy === 'folder' ? groupByFolder(filteredLua) : []),
    [filteredLua, groupBy]
  );
  const extraGroups = useMemo(
    () => (groupBy === 'folder' ? groupByFolder(filteredExtras) : []),
    [filteredExtras, groupBy]
  );

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
    const isExport = file.exportNames.length > 0;
    const entryLabel =
      file.componentIds.length <= 2
        ? file.componentIds.join(', ')
        : `${file.componentIds[0]} +${file.componentIds.length - 1}`;
    const exportLabel =
      file.exportNames.length <= 2
        ? file.exportNames.join(', ')
        : `${file.exportNames[0]} +${file.exportNames.length - 1}`;
    const details = [
      file.path,
      isEntry ? `Entrypoint for ${file.componentIds.join(', ')}` : '',
      isExport ? `Exported as ${file.exportNames.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    return (
      <button
        key={file.path}
        onDoubleClick={() => onOpenFile(file.path)}
        title={details}
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
          {/* Exports sit in the opposite corner from the entrypoint bolt, so a
              file that is both can show both without one hiding the other. */}
          {isExport && (
            <span
              className="absolute top-0 left-0 p-0.5 rounded-br bg-sky-500/90"
              title={`Exported as ${file.exportNames.join(', ')}`}
            >
              <Share2 className="w-3 h-3 text-slate-950" />
            </span>
          )}
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
              : isExport
              ? isLight
                ? 'text-sky-700'
                : 'text-sky-300'
              : isLight
              ? 'text-slate-500'
              : 'text-[#7e8fa3]'
          }`}
          title={isEntry ? file.componentIds.join(', ') : isExport ? file.exportNames.join(', ') : undefined}
        >
          {isEntry
            ? entryLabel
            : isExport
            ? `export: ${exportLabel}`
            : file.kind === 'lua'
            ? 'module'
            : file.kind}
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

  const grid = (files: WorkspaceFile[]) => (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3 mb-6">
      {files.map(tile)}
    </div>
  );

  const groupedGrids = (groups: FileGroup[]) =>
    groups.map((group) => (
      <div key={group.key}>
        {sectionLabel(`${group.label} (${group.files.length})`)}
        {grid(group.files)}
      </div>
    ));

  const noMatches = searching && filteredLua.length === 0 && filteredExtras.length === 0;

  return (
    <div
      style={surface ? { backgroundColor: surface.app } : undefined}
      className={`h-full flex flex-col select-none transition-colors ${
        isLight ? 'bg-slate-100 text-slate-800' : 'bg-[#0e1115] text-[#cfdbe8]'
      }`}
    >
      {/* Header -- same bar as the mod grid, with a back step in front. */}
      <div
        style={surface ? { backgroundColor: surface.header } : undefined}
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

        {iconUrl ? (
          <img
            src={iconUrl}
            alt=""
            className="w-6 h-6 object-contain shrink-0"
            style={{ imageRendering: 'pixelated' }}
          />
        ) : (
          <Package className={`w-5 h-5 shrink-0 ${isLight ? 'text-amber-600' : 'text-amber-500'}`} />
        )}

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
            {model.exports.length > 0 &&
              ` · ${model.exports.length} export${model.exports.length === 1 ? '' : 's'}`}
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

      {/* Search and grouping live above the scroll area so they stay reachable
          in a pack with a hundred files. */}
      <div className={`px-5 pt-4 pb-2 border-b shrink-0 ${isLight ? 'border-slate-200' : 'border-[#1d232c]'}`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px] max-w-xl">
            <Search
              className={`w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 ${
                isLight ? 'text-slate-400' : 'text-[#6c7889]'
              }`}
            />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search files, folders, components, exports..."
              spellCheck={false}
              className={`w-full pl-8 pr-8 py-1.5 rounded border text-[11px] outline-none transition-colors ${
                isLight
                  ? 'bg-white border-slate-300 text-slate-800 placeholder:text-slate-400 focus:border-amber-500'
                  : 'bg-[#11161c] border-[#2b3442] text-[#dce7f3] placeholder:text-[#5f7085] focus:border-amber-500'
              }`}
            />
            {searching && (
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

          <div
            className={`flex items-center rounded border overflow-hidden transition-colors ${
              isLight ? 'border-slate-300 bg-slate-50' : 'border-[#2b3340] bg-[#1c222b]'
            }`}
            title="Group files by their subfolder"
          >
            {([
              { key: 'flat' as const, label: 'Flat', Icon: List },
              { key: 'folder' as const, label: 'Folders', Icon: Folder },
            ]).map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setGroupBy(key)}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                  groupBy === key
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : isLight
                    ? 'text-slate-600 hover:text-slate-900'
                    : 'text-[#8b9cb0] hover:text-[#dce7f3]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          <span className={`text-[10.5px] ${isLight ? 'text-slate-500' : 'text-[#6c7d91]'}`}>
            {searching
              ? `${filteredLua.length + filteredExtras.length} match${
                  filteredLua.length + filteredExtras.length === 1 ? '' : 'es'
                }`
              : groupBy === 'folder'
              ? `${luaGroups.length + extraGroups.length} folder${
                  luaGroups.length + extraGroups.length === 1 ? '' : 's'
                }`
              : `${listing.lua.length + listing.extras.length} files`}
          </span>
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

        {noMatches && (
          <div
            className={`rounded border px-4 py-6 text-center text-[11px] mb-6 ${
              isLight ? 'bg-white border-slate-300 text-slate-600' : 'bg-[#171b21] border-[#242b35] text-[#8b9cb0]'
            }`}
          >
            No file in this mod matches <span className="font-mono">{searchTerm.trim()}</span>.
            <button
              onClick={() => setSearchTerm('')}
              className="ml-2 text-amber-500 hover:underline"
            >
              Clear search
            </button>
          </div>
        )}

        {filteredLua.length > 0 && (
          <>
            {sectionLabel(
              `Lua files (${filteredLua.length}${searching ? ` of ${listing.lua.length}` : ''})`
            )}
            {groupBy === 'folder' ? groupedGrids(luaGroups) : grid(filteredLua)}
          </>
        )}

        {filteredExtras.length > 0 && (
          <>
            {sectionLabel(
              `Profiles, manifest & documents (${filteredExtras.length}${
                searching ? ` of ${listing.extras.length}` : ''
              })`
            )}
            {groupBy === 'folder' ? groupedGrids(extraGroups) : grid(filteredExtras)}
          </>
        )}

        {!searching && listing.lua.length === 0 && listing.extras.length === 0 && (
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
        style={surface ? { backgroundColor: surface.header } : undefined}
        className={`px-4 py-2 border-t text-[10.5px] shrink-0 transition-colors ${
          isLight ? 'bg-white border-slate-300 text-slate-500' : 'bg-[#14171c] border-[#242932] text-[#63758b]'
        }`}
      >
        Double-click a file to open it. A bolt marks a manifest entrypoint; a blue share icon marks a
        file exported in <span className="font-mono">[exports]</span>. The rest are modules the engine
        may reach through <span className="font-mono">require</span>.
      </div>
    </div>
  );
};
