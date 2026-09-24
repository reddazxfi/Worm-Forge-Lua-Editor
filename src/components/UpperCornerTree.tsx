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
  FileCode,
  Sparkles,
  ArrowRight,
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
  selectedItem: any;
  onSelectItem: (type: 'var' | 'enum' | 'func' | 'class' | 'mod' | 'mod_item', item: any) => void;
  onInsertCode: (snippet: string) => void;
  onOpenEngineModal: () => void;
}

export const UpperCornerTree: React.FC<UpperCornerTreeProps> = ({
  variables,
  enumerations,
  functions,
  classes,
  existingMods,
  selectedItem,
  onSelectItem,
  onInsertCode,
  onOpenEngineModal,
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
    'class_customClass': true,
  });

  const toggleNode = (node: string) => {
    setOpenNodes((prev) => ({ ...prev, [node]: !prev[node] }));
  };

  const toggleSubNode = (node: string) => {
    setOpenSubNodes((prev) => ({ ...prev, [node]: !prev[node] }));
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
    <div className="flex flex-col h-full bg-[#181b20] border-b border-[#2a2f38] select-none text-xs">
      {/* Header and Search */}
      <div className="p-2 border-b border-[#262b33] flex items-center gap-2 bg-[#14161a]">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-[#6c7889] absolute left-2 top-2" />
          <input
            type="text"
            placeholder="Search API & Mods..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#1f242c] text-[#e0e6ed] pl-7 pr-2 py-1 rounded text-xs border border-[#2e3540] focus:outline-none focus:border-amber-500/70 placeholder-[#586271]"
          />
        </div>
        <button
          onClick={onOpenEngineModal}
          title="Add New Custom Class / Method / Variable"
          className="p-1 rounded bg-[#252c37] hover:bg-[#323b49] text-amber-400 border border-amber-500/30 flex items-center gap-1 px-2 font-medium"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline text-[11px]">+ New</span>
        </button>
      </div>

      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 font-mono text-[11.5px]">
        {/* Mod Folders */}
        <div>
          <div
            onClick={() => toggleNode('mods')}
            className="flex items-center gap-1.5 py-1 px-1.5 rounded hover:bg-[#222730] cursor-pointer text-[#8fa0b5] hover:text-[#d3e0f0] font-semibold"
          >
            {openNodes.mods ? (
              <ChevronDown className="w-3.5 h-3.5 text-[#67778b]" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-[#67778b]" />
            )}
            <FolderOpen className="w-3.5 h-3.5 text-amber-400/90" />
            <span>Existing Mods ({filteredMods.length})</span>
          </div>

          {openNodes.mods && (
            <div className="pl-4 ml-1.5 border-l border-[#262c35] space-y-0.5 mt-0.5">
              {filteredMods.map((mod, modIdx) => (
                <div key={`mod_${mod.id}_${modIdx}`} className="group">
                  <div
                    onClick={() => onSelectItem('mod', mod)}
                    className="flex items-center justify-between py-0.5 px-1.5 rounded hover:bg-[#232933] cursor-pointer text-[#bcc8d8]"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <Folder className="w-3 h-3 text-amber-500/70" />
                      <span className="truncate">{mod.name}</span>
                    </div>
                    <span className="text-[10px] text-[#637285] font-sans px-1 bg-[#1a1e24] rounded border border-[#2b323c]">
                      {mod.replacesSlot || 'mod'}
                    </span>
                  </div>

                  {/* Sub-items for mod (Methods & Variables inside this mod) */}
                  <div className="pl-3 ml-2 border-l border-[#232832] my-0.5 space-y-0.5 hidden group-hover:block">
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
                        className="flex items-center gap-1 text-[11px] text-[#78889c] hover:text-emerald-400 cursor-pointer py-0.5 px-1 rounded hover:bg-[#20252e]"
                      >
                        <Code2 className="w-2.5 h-2.5 text-emerald-400/80" />
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
                        className="flex items-center gap-1 text-[11px] text-[#78889c] hover:text-sky-400 cursor-pointer py-0.5 px-1 rounded hover:bg-[#20252e]"
                      >
                        <Variable className="w-2.5 h-2.5 text-sky-400/80" />
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
            className="flex items-center gap-1.5 py-1 px-1.5 rounded hover:bg-[#222730] cursor-pointer text-[#8fa0b5] hover:text-[#d3e0f0] font-semibold"
          >
            {openNodes.variables ? (
              <ChevronDown className="w-3.5 h-3.5 text-[#67778b]" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-[#67778b]" />
            )}
            <Variable className="w-3.5 h-3.5 text-sky-400" />
            <span>Variables ({filteredVars.length})</span>
          </div>

          {openNodes.variables && (
            <div className="pl-4 ml-1.5 border-l border-[#262c35] space-y-0.5 mt-0.5">
              {filteredVars.map((v, idx) => (
                <div
                  key={`var_${v.name}_${idx}`}
                  onClick={() => onSelectItem('var', v)}
                  className={`flex items-center justify-between py-0.5 px-1.5 rounded hover:bg-[#232933] cursor-pointer ${
                    selectedItem?.name === v.name ? 'bg-[#29323f] text-sky-300 font-semibold' : 'text-[#a2b3c7]'
                  }`}
                >
                  <span className="truncate">{v.name}</span>
                  <span className="text-[10px] text-[#556475]">{v.type.split(' ')[0]}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Enumerations */}
        <div>
          <div
            onClick={() => toggleNode('enumerations')}
            className="flex items-center gap-1.5 py-1 px-1.5 rounded hover:bg-[#222730] cursor-pointer text-[#8fa0b5] hover:text-[#d3e0f0] font-semibold"
          >
            {openNodes.enumerations ? (
              <ChevronDown className="w-3.5 h-3.5 text-[#67778b]" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-[#67778b]" />
            )}
            <Layers className="w-3.5 h-3.5 text-purple-400" />
            <span>Enumerations ({filteredEnums.length})</span>
          </div>

          {openNodes.enumerations && (
            <div className="pl-4 ml-1.5 border-l border-[#262c35] space-y-0.5 mt-0.5">
              {filteredEnums.map((e, idx) => (
                <div
                  key={`enum_${e.name}_${idx}`}
                  onClick={() => onSelectItem('enum', e)}
                  className={`flex items-center justify-between py-0.5 px-1.5 rounded hover:bg-[#232933] cursor-pointer ${
                    selectedItem?.name === e.name ? 'bg-[#29323f] text-purple-300 font-semibold' : 'text-[#a2b3c7]'
                  }`}
                >
                  <span className="truncate">{e.name}</span>
                  <span className="text-[10px] text-[#556475]">{e.values.length} vals</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Functions */}
        <div>
          <div
            onClick={() => toggleNode('functions')}
            className="flex items-center gap-1.5 py-1 px-1.5 rounded hover:bg-[#222730] cursor-pointer text-[#8fa0b5] hover:text-[#d3e0f0] font-semibold"
          >
            {openNodes.functions ? (
              <ChevronDown className="w-3.5 h-3.5 text-[#67778b]" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-[#67778b]" />
            )}
            <Code2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Functions ({filteredFuncs.length})</span>
          </div>

          {openNodes.functions && (
            <div className="pl-4 ml-1.5 border-l border-[#262c35] space-y-0.5 mt-0.5">
              {filteredFuncs.map((f, idx) => (
                <div
                  key={`func_${f.name}_${idx}`}
                  onClick={() => onSelectItem('func', f)}
                  className={`flex items-center justify-between py-0.5 px-1.5 rounded hover:bg-[#232933] cursor-pointer ${
                    selectedItem?.name === f.name ? 'bg-[#29323f] text-emerald-300 font-semibold' : 'text-[#a2b3c7]'
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
            className="flex items-center gap-1.5 py-1 px-1.5 rounded hover:bg-[#222730] cursor-pointer text-[#8fa0b5] hover:text-[#d3e0f0] font-semibold"
          >
            {openNodes.classes ? (
              <ChevronDown className="w-3.5 h-3.5 text-[#67778b]" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-[#67778b]" />
            )}
            <Box className="w-3.5 h-3.5 text-amber-400" />
            <span>Classes ({filteredClasses.length})</span>
          </div>

          {openNodes.classes && (
            <div className="pl-4 ml-1.5 border-l border-[#262c35] space-y-1 mt-0.5">
              {filteredClasses.map((cls, cIdx) => {
                const isSubOpen = openSubNodes[`class_${cls.name}`] ?? false;
                return (
                  <div key={`cls_${cls.name}_${cIdx}`} className="space-y-0.5">
                    <div
                      onClick={() => {
                        toggleSubNode(`class_${cls.name}`);
                        onSelectItem('class', cls);
                      }}
                      className={`flex items-center justify-between py-0.5 px-1.5 rounded hover:bg-[#232933] cursor-pointer ${
                        selectedItem?.name === cls.name ? 'bg-[#29323f] text-amber-300 font-semibold' : 'text-[#bcc8d8]'
                      }`}
                    >
                      <div className="flex items-center gap-1 truncate">
                        {isSubOpen ? (
                          <ChevronDown className="w-3 h-3 text-[#67778b]" />
                        ) : (
                          <ChevronRight className="w-3 h-3 text-[#67778b]" />
                        )}
                        <span className="truncate font-semibold text-amber-300/90">{cls.name}</span>
                        {cls.isCustom && (
                          <span className="text-[9px] px-1 bg-amber-500/20 text-amber-300 rounded border border-amber-500/30">
                            custom
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-[#556475]">{cls.members.length}</span>
                    </div>

                    {/* Sub members of class */}
                    {isSubOpen && (
                      <div className="pl-4 ml-1 border-l border-[#2d3440] space-y-0.5">
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
                            className="flex items-center justify-between py-0.5 px-1.5 rounded hover:bg-[#20252e] cursor-pointer text-[#91a0b5] hover:text-[#d3e0f0]"
                          >
                            <span className="truncate flex items-center gap-1">
                              {cls.isCustom ? (
                                <ArrowRight className="w-2.5 h-2.5 text-amber-400" />
                              ) : member.kind === 'method' ? (
                                <Code2 className="w-2.5 h-2.5 text-emerald-400/80" />
                              ) : (
                                <Variable className="w-2.5 h-2.5 text-sky-400/80" />
                              )}
                              <span>{member.name}</span>
                            </span>
                            <span className="text-[10px] text-[#556475]">{member.kind}</span>
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
