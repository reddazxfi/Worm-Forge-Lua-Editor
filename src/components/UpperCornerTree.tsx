import React, { useState, useMemo } from 'react';
import {
  Folder,
  FolderOpen,
  Variable,
  Layers,
  Code2,
  Box,
  ChevronRight,
  ChevronDown,
  Plus,
  Search,
  FileCode,
  Sparkles,
  ArrowRight,
  BookOpen,
  Sliders,
  FileText,
} from 'lucide-react';
import {
  ClassDef,
  EnumDef,
  FunctionDef,
  ModFolderInfo,
  VariableDef,
} from '../types/wormforge';

interface UpperCornerTreeProps {
  variables: VariableDef[];
  enumerations: EnumDef[];
  functions: FunctionDef[];
  classes: ClassDef[];
  existingMods: ModFolderInfo[];
  workspaceName?: string;
  workspaceFiles?: string[];
  dirtyFiles?: string[];
  activeFile?: string;
  onOpenWorkspaceFile?: (file: string) => void;
  selectedItem: any;
  onSelectItem: (type: 'var' | 'enum' | 'func' | 'class' | 'mod' | 'mod_item', item: any) => void;
  onInsertCode: (snippet: string) => void;
  onOpenEngineModal: () => void;
  isLight?: boolean;
}

export const UpperCornerTree: React.FC<UpperCornerTreeProps> = ({
  variables,
  enumerations,
  functions,
  classes,
  existingMods,
  workspaceName,
  workspaceFiles,
  dirtyFiles = [] as string[],
  activeFile,
  onOpenWorkspaceFile,
  selectedItem,
  onSelectItem,
  onInsertCode,
  onOpenEngineModal,
  isLight = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [openNodes, setOpenNodes] = useState<Record<string, boolean>>({
    variables: true,
    enumerations: false,
    functions: true,
    classes: true,
    mods: true,
  });
  const [openSubNodes, setOpenSubNodes] = useState<Record<string, boolean>>({
    'class_LuaActor': false,
    'class_WormEntity': false,
  });
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});

  const toggleNode = (node: string) => {
    setOpenNodes((prev) => ({ ...prev, [node]: !prev[node] }));
  };

  const toggleSubNode = (node: string) => {
    setOpenSubNodes((prev) => ({ ...prev, [node]: !prev[node] }));
  };

  const toggleFolder = (folder: string) => {
    setOpenFolders((prev) => ({
      ...prev,
      [folder]: prev[folder] === undefined ? false : !prev[folder],
    }));
  };

  // Group workspace files by subfolder to prevent window bloat
  const groupedWorkspace = useMemo((): { folders: Record<string, string[]>; rootFiles: string[] } => {
    if (!workspaceFiles) return { folders: {}, rootFiles: [] };
    const folders: Record<string, string[]> = {};
    const rootFiles: string[] = [];

    for (const f of workspaceFiles) {
      const normalized = f.replace(/\\/g, '/');
      const idx = normalized.indexOf('/');
      if (idx !== -1) {
        const folder = normalized.slice(0, idx);
        if (!folders[folder]) folders[folder] = [];
        folders[folder].push(f);
      } else {
        rootFiles.push(f);
      }
    }

    return { folders, rootFiles };
  }, [workspaceFiles]);

  const renderFileIcon = (fileName: string) => {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.lua')) return <Code2 className="w-3 h-3 text-emerald-400 shrink-0" />;
    if (lower.endsWith('.toml')) return <Sliders className="w-3 h-3 text-amber-400 shrink-0" />;
    if (lower.endsWith('.md')) return <BookOpen className="w-3 h-3 text-sky-400 shrink-0" />;
    if (lower.endsWith('.json') || lower.endsWith('.ini')) return <FileText className="w-3 h-3 text-indigo-400 shrink-0" />;
    return <FileCode className="w-3 h-3 text-slate-400 shrink-0" />;
  };

  // Filter items if search is active
  const filteredVars = variables.filter((v) =>
    v.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const filteredEnums = enumerations.filter(
    (e) =>
      e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.values.some((v) => v.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );
  const filteredFuncs = functions.filter((f) =>
    f.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const filteredClasses = classes.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.members.some((m) => m.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );
  const filteredMods = existingMods.filter(
    (m) =>
      m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.declaredMethods.some((dm) => dm.toLowerCase().includes(searchTerm.toLowerCase())) ||
      m.declaredVariables.some((dv) => dv.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div
      className={`flex flex-col h-full border-b select-none text-xs transition-colors ${
        isLight
          ? 'bg-slate-50 border-slate-300 text-slate-800'
          : 'bg-[#181b20] border-[#2a2f38] text-[#cfd9e5]'
      }`}
    >
      {/* Header and Search */}
      <div
        className={`p-2 border-b flex items-center gap-2 transition-colors ${
          isLight ? 'bg-slate-100 border-slate-200' : 'bg-[#14161a] border-[#262b33]'
        }`}
      >
        <div className="relative flex-1">
          <Search className={`w-3.5 h-3.5 absolute left-2 top-2 ${isLight ? 'text-slate-400' : 'text-[#6c7889]'}`} />
          <input
            type="text"
            placeholder="Search API & Mods..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full pl-7 pr-2 py-1 rounded text-xs border focus:outline-none focus:border-amber-500 transition-colors ${
              isLight
                ? 'bg-white text-slate-900 border-slate-300 placeholder-slate-400'
                : 'bg-[#1f242c] text-[#e0e6ed] border-[#2e3540] placeholder-[#586271]'
            }`}
          />
        </div>
        <button
          onClick={onOpenEngineModal}
          title="Add New Custom Class / Method / Variable"
          className={`p-1 rounded font-medium flex items-center gap-1 px-2 border transition-colors ${
            isLight
              ? 'bg-white hover:bg-slate-50 text-amber-700 border-slate-300 shadow-xs'
              : 'bg-[#252c37] hover:bg-[#323b49] text-amber-400 border-amber-500/30'
          }`}
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline text-[11px]">+ New</span>
        </button>
      </div>

      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 font-mono text-[11.5px]">
        {/* Opened mod folder */}
        {workspaceFiles && workspaceFiles.length > 0 && (
          <div className="mb-2">
            <div className="flex items-center justify-between py-1 px-1.5 text-emerald-400 font-semibold border-b border-[#262c35] mb-1">
              <div className="flex items-center gap-1.5 truncate">
                <FolderOpen className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">{workspaceName || 'Workspace'} ({workspaceFiles.length})</span>
              </div>
              <span className="text-[10px] text-[#697c91] font-sans">
                {Object.keys(groupedWorkspace.folders).length} mod subfolder{Object.keys(groupedWorkspace.folders).length === 1 ? '' : 's'}
              </span>
            </div>

            {/* Subfolders (each mod in its own collapsible folder) */}
            <div className="space-y-0.5">
              {Object.entries(groupedWorkspace.folders).map(([folderName, folderFiles]) => {
                const isExpanded = openFolders[folderName] ?? false;
                const filteredFolderFiles = folderFiles.filter((f) =>
                  f.toLowerCase().includes(searchTerm.toLowerCase())
                );
                if (filteredFolderFiles.length === 0) return null;

                return (
                  <div key={`folder_${folderName}`} className="mb-1">
                    <div
                      onClick={() => toggleFolder(folderName)}
                      className={`flex items-center justify-between py-1 px-1.5 rounded cursor-pointer transition-colors ${
                        isLight
                          ? 'hover:bg-slate-200 text-slate-800 bg-slate-100 font-semibold'
                          : 'hover:bg-[#20252e] text-[#b9cadb] bg-[#181d24] font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        {isExpanded ? (
                          <ChevronDown className="w-3 h-3 text-[#67778b] shrink-0" />
                        ) : (
                          <ChevronRight className="w-3 h-3 text-[#67778b] shrink-0" />
                        )}
                        <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span className="truncate font-semibold">{folderName}</span>
                      </div>
                      <span className={`text-[10px] px-1 py-0.2 rounded font-sans border ${
                        isLight ? 'bg-white border-slate-300 text-slate-600' : 'bg-[#12151a] border-[#29303c] text-[#718296]'
                      }`}>
                        {folderFiles.length}
                      </span>
                    </div>

                    {isExpanded && (
                      <div className={`pl-3.5 ml-2 border-l space-y-0.5 mt-0.5 ${
                        isLight ? 'border-slate-300' : 'border-[#262c35]'
                      }`}>
                        {filteredFolderFiles.map((f) => {
                          const shortName = f.split(/[\\/]/).pop() || f;
                          return (
                            <div
                              key={`ws_${f}`}
                              onClick={() => onOpenWorkspaceFile?.(f)}
                              className={`flex items-center justify-between py-0.5 px-1.5 rounded hover:bg-[#232933] cursor-pointer transition-colors ${
                                activeFile === f
                                  ? isLight
                                    ? 'bg-amber-100 text-amber-900 font-bold'
                                    : 'bg-[#29323f] text-emerald-300 font-semibold'
                                  : isLight
                                  ? 'text-slate-700 hover:text-slate-900'
                                  : 'text-[#9fb0c3] hover:text-[#d3e0f0]'
                              }`}
                              title={f}
                            >
                              <div className="flex items-center gap-1.5 truncate">
                                {renderFileIcon(f)}
                                <span className="truncate">{shortName}</span>
                              </div>
                              {dirtyFiles?.includes(f) && <span className="text-amber-400 ml-1 text-xs">●</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Root / Uncategorized files */}
              {groupedWorkspace.rootFiles
                .filter((f) => f.toLowerCase().includes(searchTerm.toLowerCase()))
                .map((f) => (
                  <div
                    key={`ws_root_${f}`}
                    onClick={() => onOpenWorkspaceFile?.(f)}
                    className={`flex items-center justify-between py-0.5 px-1.5 rounded hover:bg-[#232933] cursor-pointer transition-colors ${
                      activeFile === f
                        ? isLight
                          ? 'bg-amber-100 text-amber-900 font-bold'
                          : 'bg-[#29323f] text-emerald-300 font-semibold'
                        : isLight
                        ? 'text-slate-700 hover:text-slate-900'
                        : 'text-[#9fb0c3] hover:text-[#d3e0f0]'
                    }`}
                    title={f}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      {renderFileIcon(f)}
                      <span className="truncate">{f}</span>
                    </div>
                    {dirtyFiles?.includes(f) && <span className="text-amber-400 ml-1 text-xs">●</span>}
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Mod Folders */}
        <div>
          <div
            onClick={() => toggleNode('mods')}
            className={`flex items-center gap-1.5 py-1 px-1.5 rounded cursor-pointer font-semibold transition-colors ${
              isLight
                ? 'hover:bg-slate-200 text-slate-700 hover:text-slate-900'
                : 'hover:bg-[#222730] text-[#8fa0b5] hover:text-[#d3e0f0]'
            }`}
          >
            {openNodes.mods ? (
              <ChevronDown className="w-3.5 h-3.5 text-[#67778b]" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-[#67778b]" />
            )}
            <FolderOpen className="w-3.5 h-3.5 text-amber-500" />
            <span>Existing Mods ({filteredMods.length})</span>
          </div>

          {openNodes.mods && (
            <div
              className={`pl-4 ml-1.5 border-l space-y-0.5 mt-0.5 ${
                isLight ? 'border-slate-200' : 'border-[#262c35]'
              }`}
            >
              {filteredMods.map((mod, modIdx) => (
                <div key={`mod_${mod.id}_${modIdx}`} className="group">
                  <div
                    onClick={() => onSelectItem('mod', mod)}
                    className={`flex items-center justify-between py-0.5 px-1.5 rounded cursor-pointer transition-colors ${
                      isLight
                        ? 'hover:bg-slate-200 text-slate-800'
                        : 'hover:bg-[#232933] text-[#bcc8d8]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <Folder className="w-3 h-3 text-amber-500/80" />
                      <span className="truncate">{mod.name}</span>
                    </div>
                    <span
                      className={`text-[10px] font-sans px-1 rounded border ${
                        isLight
                          ? 'bg-slate-100 text-slate-600 border-slate-300'
                          : 'bg-[#1a1e24] text-[#637285] border-[#2b323c]'
                      }`}
                    >
                      {mod.replacesSlot || 'mod'}
                    </span>
                  </div>

                  {/* Sub-items for mod (Methods & Variables inside this mod) */}
                  <div
                    className={`pl-3 ml-2 border-l my-0.5 space-y-0.5 hidden group-hover:block ${
                      isLight ? 'border-slate-200' : 'border-[#232832]'
                    }`}
                  >
                    {mod.declaredMethods.slice(0, 4).map((method, mIdx) => (
                      <div
                        key={`mod_${mod.id}_m_${method}_${mIdx}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectItem('mod_item', {
                            name: `${mod.id}:${method}`,
                            description: `Method defined in ${mod.name} (${mod.files[0]?.name})`,
                            example: `${method}()`,
                          });
                        }}
                        className={`flex items-center gap-1 text-[11px] cursor-pointer py-0.5 px-1 rounded transition-colors ${
                          isLight
                            ? 'text-slate-600 hover:text-emerald-700 hover:bg-slate-200'
                            : 'text-[#78889c] hover:text-emerald-400 hover:bg-[#20252e]'
                        }`}
                      >
                        <Code2 className="w-2.5 h-2.5 text-emerald-500" />
                        <span>{method}()</span>
                      </div>
                    ))}
                    {mod.declaredVariables.slice(0, 3).map((v, vIdx) => (
                      <div
                        key={`mod_${mod.id}_v_${v}_${vIdx}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectItem('mod_item', {
                            name: `${mod.id}:${v}`,
                            description: `Variable declared in ${mod.name}`,
                            example: v,
                          });
                        }}
                        className={`flex items-center gap-1 text-[11px] cursor-pointer py-0.5 px-1 rounded transition-colors ${
                          isLight
                            ? 'text-slate-600 hover:text-sky-700 hover:bg-slate-200'
                            : 'text-[#78889c] hover:text-sky-400 hover:bg-[#20252e]'
                        }`}
                      >
                        <Variable className="w-2.5 h-2.5 text-sky-500" />
                        <span>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Variables */}
        <div>
          <div
            onClick={() => toggleNode('variables')}
            className={`flex items-center gap-1.5 py-1 px-1.5 rounded cursor-pointer font-semibold transition-colors ${
              isLight
                ? 'hover:bg-slate-200 text-slate-700 hover:text-slate-900'
                : 'hover:bg-[#222730] text-[#8fa0b5] hover:text-[#d3e0f0]'
            }`}
          >
            {openNodes.variables ? (
              <ChevronDown className="w-3.5 h-3.5 text-[#67778b]" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-[#67778b]" />
            )}
            <Variable className="w-3.5 h-3.5 text-sky-500" />
            <span>Variables ({filteredVars.length})</span>
          </div>

          {openNodes.variables && (
            <div
              className={`pl-4 ml-1.5 border-l space-y-0.5 mt-0.5 ${
                isLight ? 'border-slate-200' : 'border-[#262c35]'
              }`}
            >
              {filteredVars.map((v, idx) => (
                <div
                  key={`var_${v.name}_${idx}`}
                  onClick={() => onSelectItem('var', v)}
                  className={`flex items-center justify-between py-0.5 px-1.5 rounded cursor-pointer transition-colors ${
                    selectedItem?.name === v.name
                      ? isLight
                        ? 'bg-sky-100 text-sky-800 font-semibold'
                        : 'bg-[#29323f] text-sky-300 font-semibold'
                      : isLight
                      ? 'text-slate-700 hover:bg-slate-200'
                      : 'text-[#a2b3c7] hover:bg-[#232933]'
                  }`}
                >
                  <span className="truncate">{v.name}</span>
                  <span className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-[#556475]'}`}>
                    {v.type.split(' ')[0]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Enumerations */}
        <div>
          <div
            onClick={() => toggleNode('enumerations')}
            className={`flex items-center gap-1.5 py-1 px-1.5 rounded cursor-pointer font-semibold transition-colors ${
              isLight
                ? 'hover:bg-slate-200 text-slate-700 hover:text-slate-900'
                : 'hover:bg-[#222730] text-[#8fa0b5] hover:text-[#d3e0f0]'
            }`}
          >
            {openNodes.enumerations ? (
              <ChevronDown className="w-3.5 h-3.5 text-[#67778b]" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-[#67778b]" />
            )}
            <Layers className="w-3.5 h-3.5 text-purple-500" />
            <span>Enumerations ({filteredEnums.length})</span>
          </div>

          {openNodes.enumerations && (
            <div
              className={`pl-4 ml-1.5 border-l space-y-0.5 mt-0.5 ${
                isLight ? 'border-slate-200' : 'border-[#262c35]'
              }`}
            >
              {filteredEnums.map((e, idx) => (
                <div
                  key={`enum_${e.name}_${idx}`}
                  onClick={() => onSelectItem('enum', e)}
                  className={`flex items-center justify-between py-0.5 px-1.5 rounded cursor-pointer transition-colors ${
                    selectedItem?.name === e.name
                      ? isLight
                        ? 'bg-purple-100 text-purple-800 font-semibold'
                        : 'bg-[#29323f] text-purple-300 font-semibold'
                      : isLight
                      ? 'text-slate-700 hover:bg-slate-200'
                      : 'text-[#a2b3c7] hover:bg-[#232933]'
                  }`}
                >
                  <span className="truncate">{e.name}</span>
                  <span className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-[#556475]'}`}>
                    {e.values.length} vals
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Functions */}
        <div>
          <div
            onClick={() => toggleNode('functions')}
            className={`flex items-center gap-1.5 py-1 px-1.5 rounded cursor-pointer font-semibold transition-colors ${
              isLight
                ? 'hover:bg-slate-200 text-slate-700 hover:text-slate-900'
                : 'hover:bg-[#222730] text-[#8fa0b5] hover:text-[#d3e0f0]'
            }`}
          >
            {openNodes.functions ? (
              <ChevronDown className="w-3.5 h-3.5 text-[#67778b]" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-[#67778b]" />
            )}
            <Code2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>Functions ({filteredFuncs.length})</span>
          </div>

          {openNodes.functions && (
            <div
              className={`pl-4 ml-1.5 border-l space-y-0.5 mt-0.5 ${
                isLight ? 'border-slate-200' : 'border-[#262c35]'
              }`}
            >
              {filteredFuncs.map((f, idx) => (
                <div
                  key={`func_${f.name}_${idx}`}
                  onClick={() => onSelectItem('func', f)}
                  className={`flex items-center justify-between py-0.5 px-1.5 rounded cursor-pointer transition-colors ${
                    selectedItem?.name === f.name
                      ? isLight
                        ? 'bg-emerald-100 text-emerald-800 font-semibold'
                        : 'bg-[#29323f] text-emerald-300 font-semibold'
                      : isLight
                      ? 'text-slate-700 hover:bg-slate-200'
                      : 'text-[#a2b3c7] hover:bg-[#232933]'
                  }`}
                >
                  <span className="truncate">{f.name}()</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Classes */}
        <div>
          <div
            onClick={() => toggleNode('classes')}
            className={`flex items-center gap-1.5 py-1 px-1.5 rounded cursor-pointer font-semibold transition-colors ${
              isLight
                ? 'hover:bg-slate-200 text-slate-700 hover:text-slate-900'
                : 'hover:bg-[#222730] text-[#8fa0b5] hover:text-[#d3e0f0]'
            }`}
          >
            {openNodes.classes ? (
              <ChevronDown className="w-3.5 h-3.5 text-[#67778b]" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-[#67778b]" />
            )}
            <Box className="w-3.5 h-3.5 text-amber-500" />
            <span>Classes ({filteredClasses.length})</span>
          </div>

          {openNodes.classes && (
            <div
              className={`pl-4 ml-1.5 border-l space-y-1 mt-0.5 ${
                isLight ? 'border-slate-200' : 'border-[#262c35]'
              }`}
            >
              {filteredClasses.map((cls, cIdx) => {
                const isSubOpen = openSubNodes[`class_${cls.name}`] ?? false;
                return (
                  <div key={`cls_${cls.name}_${cIdx}`} className="space-y-0.5">
                    <div
                      onClick={() => {
                        toggleSubNode(`class_${cls.name}`);
                        onSelectItem('class', cls);
                      }}
                      className={`flex items-center justify-between py-0.5 px-1.5 rounded cursor-pointer transition-colors ${
                        selectedItem?.name === cls.name
                          ? isLight
                            ? 'bg-amber-100 text-amber-800 font-semibold'
                            : 'bg-[#29323f] text-amber-300 font-semibold'
                          : isLight
                          ? 'text-slate-800 hover:bg-slate-200'
                          : 'text-[#bcc8d8] hover:bg-[#232933]'
                      }`}
                    >
                      <div className="flex items-center gap-1 truncate">
                        {isSubOpen ? (
                          <ChevronDown className="w-3 h-3 text-[#67778b]" />
                        ) : (
                          <ChevronRight className="w-3 h-3 text-[#67778b]" />
                        )}
                        <span
                          className={`truncate font-semibold ${
                            isLight ? 'text-amber-800' : 'text-amber-300/90'
                          }`}
                        >
                          {cls.name}
                        </span>
                        {cls.isCustom && (
                          <span
                            className={`text-[9px] px-1 rounded border ${
                              isLight
                                ? 'bg-amber-100 text-amber-700 border-amber-300'
                                : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            }`}
                          >
                            custom
                          </span>
                        )}
                      </div>
                      <span className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-[#556475]'}`}>
                        {cls.members.length}
                      </span>
                    </div>

                    {/* Sub members of class */}
                    {isSubOpen && (
                      <div
                        className={`pl-4 ml-1 border-l space-y-0.5 ${
                          isLight ? 'border-slate-200' : 'border-[#2d3440]'
                        }`}
                      >
                        {cls.members.map((member, mIdx) => (
                          <div
                            key={`cls_${cls.name}_m_${member.name}_${mIdx}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectItem('class', {
                                ...cls,
                                activeMember: member,
                              });
                            }}
                            className={`flex items-center justify-between py-0.5 px-1.5 rounded cursor-pointer transition-colors ${
                              isLight
                                ? 'text-slate-700 hover:text-slate-950 hover:bg-slate-200'
                                : 'text-[#91a0b5] hover:text-[#d3e0f0] hover:bg-[#20252e]'
                            }`}
                          >
                            <span className="truncate flex items-center gap-1">
                              {cls.isCustom ? (
                                <ArrowRight className="w-2.5 h-2.5 text-amber-500" />
                              ) : member.kind === 'method' ? (
                                <Code2 className="w-2.5 h-2.5 text-emerald-500" />
                              ) : (
                                <Variable className="w-2.5 h-2.5 text-sky-500" />
                              )}
                              <span>{member.name}</span>
                            </span>
                            <span className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-[#556475]'}`}>
                              {member.kind}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
