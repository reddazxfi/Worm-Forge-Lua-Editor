import React, { useState } from 'react';
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
  ArrowRight,
  BookOpen,
  Table2,
} from 'lucide-react';
import {
  ClassDef,
  EnumDef,
  FunctionDef,
  ModFolderInfo,
  VariableDef,
} from '../types/wormforge';
import { fieldPaths, type TableDoc } from '../data/tableDocs';
import { WorkspaceTree } from './WorkspaceTree';
import type { WorkspaceModel } from '../services/workspaceTree';
import type { AppSurfaces } from '../services/appTheme';

interface UpperCornerTreeProps {
  variables: VariableDef[];
  enumerations: EnumDef[];
  functions: FunctionDef[];
  classes: ClassDef[];
  existingMods: ModFolderInfo[];
  /** The documented spec tables: launch, spawn, weapon records, fog lights. */
  tableDocs?: TableDoc[];
  /** The opened mod folder, already classified. Undefined until a folder is open. */
  workspace?: WorkspaceModel | null;
  /** Folder name on disk. The manifest's display `name` is usually different. */
  workspaceName?: string;
  dirtyFiles?: string[];
  activeFile?: string;
  onOpenWorkspaceFile?: (file: string) => void;
  selectedItem: any;
  onSelectItem: (type: 'var' | 'enum' | 'func' | 'class' | 'mod' | 'mod_item' | 'table', item: any) => void;
  onInsertCode: (snippet: string) => void;
  onOpenEngineModal: () => void;
  isLight?: boolean;
  surface?: AppSurfaces;
}

export const UpperCornerTree: React.FC<UpperCornerTreeProps> = ({
  variables = [],
  enumerations = [],
  functions = [],
  classes = [],
  existingMods = [],
  tableDocs = [],
  workspace,
  workspaceName,
  dirtyFiles = [] as string[],
  activeFile,
  onOpenWorkspaceFile,
  selectedItem,
  onSelectItem,
  onInsertCode,
  onOpenEngineModal,
  isLight = false,
  surface,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Every section starts collapsed so a large mod folder does not bury the
  // editor behind a wall of API entries on init.
  const [openNodes, setOpenNodes] = useState<Record<string, boolean>>({
    workspace: false,
    variables: false,
    enumerations: false,
    tables: false,
    functions: false,
    classes: false,
    mods: false,
  });
  const [openSubNodes, setOpenSubNodes] = useState<Record<string, boolean>>({
    'class_LuaActor': false,
    'class_WormEntity': false,
  });

  // While searching, force sections open so matches are actually visible
  // instead of hiding behind collapsed parents.
  const isSearching = searchTerm.trim().length > 0;
  const isNodeOpen = (key: string) => isSearching || !!openNodes[key];
  const isSubNodeOpen = (key: string) => isSearching || !!openSubNodes[key];

  const toggleNode = (node: string) => {
    setOpenNodes((prev) => ({ ...prev, [node]: !prev[node] }));
  };

  const toggleSubNode = (node: string) => {
    setOpenSubNodes((prev) => ({ ...prev, [node]: !prev[node] }));
  };

  // Filter items if search is active
  const safeVars = variables || [];
  const safeEnums = enumerations || [];
  const safeFuncs = functions || [];
  const safeClasses = classes || [];
  const safeMods = existingMods || [];

  const filteredVars = safeVars.filter((v) =>
    v.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const filteredEnums = safeEnums.filter(
    (e) =>
      e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.values && e.values.some((v) => v.name.toLowerCase().includes(searchTerm.toLowerCase())))
  );
  const filteredFuncs = safeFuncs.filter((f) =>
    f.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const filteredClasses = safeClasses.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.members && c.members.some((m) => m.name.toLowerCase().includes(searchTerm.toLowerCase())))
  );
  // A table doc matches on its title, its call, or ANY key inside it, so
  // searching `explosion` finds the weapon spec as well as the launch table.
  const filteredTables = tableDocs.filter((t) => {
    const q = searchTerm.toLowerCase();
    if (!q) return true;
    return (
      t.title.toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q) ||
      t.usedBy.some((u) => u.toLowerCase().includes(q)) ||
      fieldPaths(t.fields).some((p) => p.toLowerCase().includes(q))
    );
  });
  const filteredMods = safeMods.filter(
    (m) =>
      m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.declaredMethods && m.declaredMethods.some((dm) => dm.toLowerCase().includes(searchTerm.toLowerCase()))) ||
      (m.declaredVariables && m.declaredVariables.some((dv) => dv.toLowerCase().includes(searchTerm.toLowerCase())))
  );

  return (
    <div
      style={surface ? { backgroundColor: surface.tree } : undefined}
      className={`flex flex-col h-full border-b select-none text-xs transition-colors ${
        isLight
          ? 'bg-slate-50 border-slate-300 text-slate-800'
          : 'bg-[#181b20] border-[#2a2f38] text-[#cfd9e5]'
      }`}
    >
      {/* Header and Search */}
      <div
        style={surface ? { backgroundColor: surface.header } : undefined}
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
        {workspace && workspace.fileCount > 0 && (
          <div className="mb-2">
            <div
              onClick={() => toggleNode('workspace')}
              title={isNodeOpen('workspace') ? 'Collapse folder' : 'Expand folder'}
              className={`flex items-center justify-between py-1 px-1.5 text-emerald-400 font-semibold border-b border-[#262c35] mb-1 rounded cursor-pointer transition-colors ${
                isLight ? 'hover:bg-slate-200' : 'hover:bg-[#1f242c]'
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                {isNodeOpen('workspace') ? (
                  <ChevronDown className="w-3.5 h-3.5 text-[#67778b] shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-[#67778b] shrink-0" />
                )}
                <FolderOpen className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">{workspaceName || 'Workspace'} ({workspace.fileCount})</span>
              </div>
              {workspace.id && (
                <span
                  className="text-[10px] text-[#697c91] font-sans shrink-0 truncate max-w-[45%]"
                  title={`mod.toml id = "${workspace.id}"${workspace.name ? ` (name: ${workspace.name})` : ''}`}
                >
                  {workspace.id}
                </span>
              )}
            </div>

            {isNodeOpen('workspace') && (
              <WorkspaceTree
                model={workspace}
                activeFile={activeFile}
                dirtyFiles={dirtyFiles}
                searchTerm={searchTerm}
                onOpenFile={(f) => onOpenWorkspaceFile?.(f)}
                isLight={isLight}
              />
            )}
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
            {isNodeOpen('mods') ? (
              <ChevronDown className="w-3.5 h-3.5 text-[#67778b]" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-[#67778b]" />
            )}
            <FolderOpen className="w-3.5 h-3.5 text-amber-500" />
            <span>Existing Mods ({filteredMods.length})</span>
          </div>

          {isNodeOpen('mods') && (
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

                  {/* No hover sub-items here, deliberately.
                      This block used to list `mod.declaredMethods` /
                      `mod.declaredVariables` on hover. Those are optional on
                      ModFolderInfo and the generated corpus never emits them, so
                      the list was empty for every mod -- and rendering it with a
                      bare `.slice()` on undefined is exactly what blanked this
                      sidebar (§24). Removed rather than merely guarded: the feature
                      was not wanted. Clicking a mod still opens its documentation in
                      the pane below. */}
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
            {isNodeOpen('variables') ? (
              <ChevronDown className="w-3.5 h-3.5 text-[#67778b]" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-[#67778b]" />
            )}
            <Variable className="w-3.5 h-3.5 text-sky-500" />
            <span>Variables ({filteredVars.length})</span>
          </div>

          {isNodeOpen('variables') && (
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
            {isNodeOpen('enumerations') ? (
              <ChevronDown className="w-3.5 h-3.5 text-[#67778b]" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-[#67778b]" />
            )}
            <Layers className="w-3.5 h-3.5 text-purple-500" />
            <span>Enumerations ({filteredEnums.length})</span>
          </div>

          {isNodeOpen('enumerations') && (
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

        {/* Tables: the shapes a spec table takes, which the enums cannot answer. */}
        <div>
          <div
            onClick={() => toggleNode('tables')}
            className={`flex items-center gap-1.5 py-1 px-1.5 rounded cursor-pointer font-semibold transition-colors ${
              isLight
                ? 'hover:bg-slate-200 text-slate-700 hover:text-slate-900'
                : 'hover:bg-[#222730] text-[#8fa0b5] hover:text-[#d3e0f0]'
            }`}
          >
            {isNodeOpen('tables') ? (
              <ChevronDown className="w-3.5 h-3.5 text-[#67778b]" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-[#67778b]" />
            )}
            <Table2 className="w-3.5 h-3.5 text-teal-500" />
            <span>Tables ({filteredTables.length})</span>
          </div>

          {isNodeOpen('tables') && (
            <div
              className={`pl-4 ml-1.5 border-l space-y-0.5 mt-0.5 ${
                isLight ? 'border-slate-200' : 'border-[#262c35]'
              }`}
            >
              {filteredTables.map((t, idx) => (
                <div
                  key={`table_${t.id}_${idx}`}
                  onClick={() => onSelectItem('table', t)}
                  title={t.summary}
                  className={`flex items-center justify-between py-0.5 px-1.5 rounded cursor-pointer transition-colors ${
                    selectedItem?.tableDoc && selectedItem?.id === t.id
                      ? isLight
                        ? 'bg-teal-100 text-teal-800 font-semibold'
                        : 'bg-[#29323f] text-teal-300 font-semibold'
                      : isLight
                      ? 'text-slate-700 hover:bg-slate-200'
                      : 'text-[#a2b3c7] hover:bg-[#232933]'
                  }`}
                >
                  <span className="truncate">{t.id}</span>
                  <span className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-[#556475]'}`}>
                    {t.fields.length} keys
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
            {isNodeOpen('functions') ? (
              <ChevronDown className="w-3.5 h-3.5 text-[#67778b]" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-[#67778b]" />
            )}
            <Code2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>Functions ({filteredFuncs.length})</span>
          </div>

          {isNodeOpen('functions') && (
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
            {isNodeOpen('classes') ? (
              <ChevronDown className="w-3.5 h-3.5 text-[#67778b]" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-[#67778b]" />
            )}
            <Box className="w-3.5 h-3.5 text-amber-500" />
            <span>Classes ({filteredClasses.length})</span>
          </div>

          {isNodeOpen('classes') && (
            <div
              className={`pl-4 ml-1.5 border-l space-y-1 mt-0.5 ${
                isLight ? 'border-slate-200' : 'border-[#262c35]'
              }`}
            >
              {filteredClasses.map((cls, cIdx) => {
                const isSubOpen = isSubNodeOpen(`class_${cls.name}`);
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
