import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Box,
  ChevronDown,
  ChevronRight,
  Code2,
  FileCode,
  FileText,
  Folder,
  FolderOpen,
  Sliders,
  Zap,
} from 'lucide-react';
import {
  buildFileTree,
  filterFileTree,
  type WorkspaceFile,
  type WorkspaceModel,
  type WorkspaceNode,
} from '../services/workspaceTree';

interface WorkspaceTreeProps {
  model: WorkspaceModel;
  activeFile?: string;
  dirtyFiles?: string[];
  /** The sidebar's search box. Filtering never hides a match behind a collapsed folder. */
  searchTerm?: string;
  onOpenFile: (path: string) => void;
  isLight?: boolean;
}

type GroupKey = 'entries' | 'lua' | 'profiles' | 'docs';

/**
 * The opened mod, as a real directory tree.
 *
 * Replaces the old one-level grouping, which showed `lib/anim.lua` as a file in
 * a group called `lib` and could not go deeper. Entrypoints are marked on the
 * row that is the file, not in a second copy of the tree: the same file appears
 * once per section it belongs to, and every row is the same click target and the
 * same buffer key.
 */
export const WorkspaceTree: React.FC<WorkspaceTreeProps> = ({
  model,
  activeFile,
  dirtyFiles = [],
  searchTerm = '',
  onOpenFile,
  isLight = false,
}) => {
  const searching = searchTerm.trim().length > 0;

  // Collapsed by default. `mods/px` has 57 Lua files across four folders, and
  // opening a mod must not bury the API tree below a wall of file rows. The
  // group headers are the map; expanding a folder is the one click that shows
  // the Lua underneath it.
  //
  // Absent means collapsed; an explicit entry records the user's choice.
  const [openDirs, setOpenDirs] = useState<Record<string, boolean>>({});
  const [openGroups, setOpenGroups] = useState<Record<GroupKey, boolean>>({
    entries: true,
    lua: true,
    profiles: true,
    docs: false,
  });

  const isDirOpen = (path: string) => searching || (openDirs[path] ?? false);
  const toggleDir = (path: string) =>
    setOpenDirs((prev) => ({ ...prev, [path]: !(prev[path] ?? false) }));

  const isGroupOpen = (key: GroupKey) => searching || openGroups[key];
  const toggleGroup = (key: GroupKey) =>
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));

  const byPath = useMemo(() => {
    const map = new Map<string, WorkspaceFile>();
    for (const f of model.lua) map.set(f.path, f);
    for (const f of model.profiles) map.set(f.path, f);
    for (const f of model.docs) map.set(f.path, f);
    if (model.manifestFile) map.set(model.manifestFile.path, model.manifestFile);
    return map;
  }, [model]);

  const luaTree = useMemo(() => buildFileTree(model.lua.map((f) => f.path)), [model.lua]);
  const docTree = useMemo(() => buildFileTree(model.docs.map((f) => f.path)), [model.docs]);

  const fileIcon = (file: WorkspaceFile | undefined) => {
    switch (file?.kind) {
      case 'lua':
        return <Code2 className="w-3 h-3 text-emerald-400 shrink-0" />;
      case 'profile':
        return <Sliders className="w-3 h-3 text-amber-400 shrink-0" />;
      case 'manifest':
        return <FileCode className="w-3 h-3 text-sky-400 shrink-0" />;
      default:
        return <FileText className="w-3 h-3 text-slate-400 shrink-0" />;
    }
  };

  const rowClass = (isActive: boolean) =>
    `flex items-center justify-between gap-1 py-0.5 px-1.5 rounded cursor-pointer transition-colors ${
      isActive
        ? isLight
          ? 'bg-amber-100 text-amber-900 font-bold'
          : 'bg-[#29323f] text-emerald-300 font-semibold'
        : isLight
        ? 'text-slate-700 hover:bg-slate-200'
        : 'text-[#9fb0c3] hover:bg-[#232933] hover:text-[#d3e0f0]'
    }`;

  /**
   * `tools.hello`, or `tools.copy_bazooka +69` when many components share one file.
   *
   * The badge is one line in a 340px sidebar, and `mods/tools` really does point
   * 70 components at `audit/copy.lua` -- listing them all would push the filename
   * out of view. The full list stays in the tooltip.
   */
  const componentLabel = (ids: string[]) =>
    ids.length <= 2 ? ids.join(', ') : `${ids[0]} +${ids.length - 1}`;

  const componentTitle = (ids: string[]) =>
    ids.length <= 8 ? ids.join(', ') : `${ids.slice(0, 8).join(', ')}, and ${ids.length - 8} more`;

  /** One editable file. `label` is the tree segment, or the mod-relative path in the entry list. */
  const fileRow = (path: string, label: string) => {
    const file = byPath.get(path);
    const ids = file?.componentIds ?? [];
    const isEntry = ids.length > 0;
    const isDirty = dirtyFiles.includes(path);
    const isActive = activeFile === path;
    return (
      <div
        key={`ws_${path}`}
        onClick={() => onOpenFile(path)}
        title={isEntry ? `${path}\nEntrypoint for ${componentTitle(ids)}` : path}
        className={rowClass(isActive)}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {isEntry ? (
            <Zap className="w-3 h-3 text-amber-400 shrink-0" />
          ) : (
            fileIcon(file)
          )}
          <span className="truncate">{label}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isEntry && (
            <span
              className={`text-[9.5px] font-sans px-1 rounded border max-w-[8.5rem] truncate ${
                isLight
                  ? 'bg-amber-50 text-amber-700 border-amber-300'
                  : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
              }`}
            >
              {componentLabel(ids)}
            </span>
          )}
          {isDirty && <span className="text-amber-400 text-xs">●</span>}
        </div>
      </div>
    );
  };

  const renderNodes = (nodes: WorkspaceNode[]): React.ReactNode =>
    nodes.map((node) => {
      if (node.type === 'file') return fileRow(node.path, node.name);
      const open = isDirOpen(node.path);
      return (
        <div key={`wsdir_${node.path}`}>
          <div
            onClick={() => toggleDir(node.path)}
            title={open ? 'Collapse folder' : 'Expand folder'}
            className={`flex items-center justify-between py-0.5 px-1.5 rounded cursor-pointer transition-colors ${
              isLight
                ? 'text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                : 'text-[#8b9cb0] hover:bg-[#232933] hover:text-[#d3e0f0]'
            }`}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              {open ? (
                <ChevronDown className="w-3 h-3 text-[#67778b] shrink-0" />
              ) : (
                <ChevronRight className="w-3 h-3 text-[#67778b] shrink-0" />
              )}
              {open ? (
                <FolderOpen className="w-3 h-3 text-amber-500/80 shrink-0" />
              ) : (
                <Folder className="w-3 h-3 text-amber-500/80 shrink-0" />
              )}
              <span className="truncate font-medium">{node.name}</span>
            </div>
          </div>
          {open && (
            <div
              className={`pl-3 ml-1.5 border-l space-y-0.5 mt-0.5 ${
                isLight ? 'border-slate-300' : 'border-[#262c35]'
              }`}
            >
              {renderNodes(node.children)}
            </div>
          )}
        </div>
      );
    });

  const groupHeader = (key: GroupKey, label: string, count: number, icon: React.ReactNode) => {
    const open = isGroupOpen(key);
    return (
      <div
        onClick={() => toggleGroup(key)}
        title={open ? 'Collapse' : 'Expand'}
        className={`flex items-center gap-1.5 py-1 px-1.5 rounded cursor-pointer font-semibold transition-colors ${
          isLight
            ? 'hover:bg-slate-200 text-slate-700 hover:text-slate-900'
            : 'hover:bg-[#222730] text-[#8fa0b5] hover:text-[#d3e0f0]'
        }`}
      >
        {open ? (
          <ChevronDown className="w-3 h-3 text-[#67778b] shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-[#67778b] shrink-0" />
        )}
        {icon}
        <span className="truncate">{label}</span>
        <span className={`ml-auto text-[10px] font-sans ${isLight ? 'text-slate-500' : 'text-[#67778b]'}`}>
          {count}
        </span>
      </div>
    );
  };

  const indentClass = `pl-3 ml-1.5 border-l space-y-0.5 mt-0.5 ${
    isLight ? 'border-slate-300' : 'border-[#262c35]'
  }`;

  const filteredEntries = searching
    ? model.entryPoints.filter((e) => e.path.toLowerCase().includes(searchTerm.trim().toLowerCase()))
    : model.entryPoints;
  const filteredLuaTree = filterFileTree(luaTree, searchTerm);
  const filteredProfiles = searching
    ? model.profiles.filter((f) => f.path.toLowerCase().includes(searchTerm.trim().toLowerCase()))
    : model.profiles;
  const filteredDocTree = filterFileTree(docTree, searchTerm);

  const showEntries = filteredEntries.length > 0 || (!searching && model.unresolvedEntries.length > 0);

  return (
    <div className="space-y-0.5">
      {/* Entry points: what the engine actually STARTS. A shortcut view; the
          file below is the same click target, not a second copy. */}
      {showEntries && (
        <div>
          {groupHeader(
            'entries',
            'Entry points',
            filteredEntries.length,
            <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          )}
          {isGroupOpen('entries') && (
            <div className={indentClass}>
              {filteredEntries.map((e) => fileRow(e.path, e.path))}
              {/* A declared entry naming a file this folder does not contain is
                  reported, never guessed at: resolving it by basename would open
                  a DIFFERENT file and call it the entrypoint. */}
              {!searching &&
                model.unresolvedEntries.map((u) => (
                  <div
                    key={`ws_unresolved_${u.entry}`}
                    title={`mod.toml declares ${u.entry}${
                      u.componentIds.length ? ` for ${componentTitle(u.componentIds)}` : ''
                    }, but this folder has no such file.`}
                    className={`flex items-center justify-between gap-1 py-0.5 px-1.5 rounded text-rose-400 ${
                      isLight ? 'bg-rose-50' : 'bg-rose-500/5'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      <span className="truncate line-through">{u.entry}</span>
                    </div>
                    <span className="text-[9.5px] font-sans shrink-0">missing</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Every .lua file, including helpers reached only through require. */}
      <div>
        {groupHeader(
          'lua',
          'Lua files',
          model.lua.length,
          <Code2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
        )}
        {isGroupOpen('lua') && (
          <div className={indentClass}>
            {filteredLuaTree.length > 0 ? (
              renderNodes(filteredLuaTree)
            ) : (
              <div className={`px-1.5 py-0.5 ${isLight ? 'text-slate-500' : 'text-[#5f6f83]'}`}>
                {model.lua.length === 0 ? 'No .lua files in this folder.' : 'No Lua file matches.'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bundled profiles. Separate from Lua on purpose: they are data the
          installer copies into WormForge/Profiles, not code the engine loads. */}
      {model.profiles.length > 0 && (
        <div>
          {groupHeader(
            'profiles',
            'Bundled profiles',
            model.profiles.length,
            <Sliders className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          )}
          {isGroupOpen('profiles') && (
            <div className={indentClass}>
              {filteredProfiles.map((f) => fileRow(f.path, f.name))}
              {filteredProfiles.length === 0 && (
                <div className={`px-1.5 py-0.5 ${isLight ? 'text-slate-500' : 'text-[#5f6f83]'}`}>
                  No profile matches.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* The manifest itself, shown beside the code rather than buried in "Other". */}
      {model.manifestFile && (!searching || model.manifestFile.path.toLowerCase().includes(searchTerm.trim().toLowerCase())) && (
        <div className="pt-0.5">
          {fileRow(model.manifestFile.path, model.manifestFile.path)}
        </div>
      )}

      {model.docs.length > 0 && (
        <div>
          {groupHeader(
            'docs',
            'Other files',
            model.docs.length,
            <Box className="w-3.5 h-3.5 text-sky-500 shrink-0" />
          )}
          {isGroupOpen('docs') && (
            <div className={indentClass}>
              {filteredDocTree.length > 0 ? (
                renderNodes(filteredDocTree)
              ) : (
                <div className={`px-1.5 py-0.5 ${isLight ? 'text-slate-500' : 'text-[#5f6f83]'}`}>
                  No document matches.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
