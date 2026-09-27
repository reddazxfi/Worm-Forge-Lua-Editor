import React from 'react';
import { BookOpen, Copy, Check, Plus, Code2, ArrowRight, FolderOpen } from 'lucide-react';
import { ClassDef, EnumDef, FunctionDef, MemberDef, VariableDef } from '../types/wormforge';

interface DocPaneProps {
  selectedItem: any;
  onInsertCode: (snippet: string) => void;
  onLoadTemplate?: (templateId: string) => void;
  isLight?: boolean;
}

export const DocPane: React.FC<DocPaneProps> = ({ selectedItem, onInsertCode, onLoadTemplate, isLight = false }) => {
  const [copied, setCopied] = React.useState(false);

  if (!selectedItem) {
    return (
      <div className={`h-full flex flex-col items-center justify-center p-4 text-center border-b transition-colors ${
        isLight ? 'bg-slate-50 border-slate-300 text-slate-500' : 'bg-[#14171c] border-[#262b33] text-[#556275]'
      }`}>
        <BookOpen className="w-6 h-6 mb-1 opacity-50" />
        <p className="text-xs font-medium">Select any item from the Tree above or hover code</p>
        <span className="text-[11px] opacity-75 mt-1">Displays functions, parameters, classes, and verbs</span>
      </div>
    );
  }

  // Determine what type of item it is
  const isClass = 'members' in selectedItem;
  const isEnum = 'values' in selectedItem;
  const isFunc = 'parameters' in selectedItem && !isClass;
  const isVar = 'scope' in selectedItem || 'type' in selectedItem;
  const isMod = 'replacesSlot' in selectedItem;
  const isModItem = selectedItem.name && selectedItem.name.includes(':');

  const activeMember: MemberDef | undefined = selectedItem.activeMember;

  const getSignature = () => {
    if (activeMember) {
      if (activeMember.isCustom) {
        const sep = activeMember.kind === 'method' ? ':' : '.';
        const params = activeMember.parameters?.map((p) => p.name).join(', ') || '';
        return `${selectedItem.name}${sep}${activeMember.name}(${params})`;
      }
      const params = activeMember.parameters?.map((p) => p.name).join(', ') || '';
      return `${selectedItem.name === 'LuaActor' ? 'a' : 'worm'}:${activeMember.name}(${params})`;
    }
    if (isClass) {
      return (selectedItem as ClassDef).syntaxExample || `class ${selectedItem.name}`;
    }
    if (isFunc) {
      const f = selectedItem as FunctionDef;
      const params = f.parameters.map((p) => p.name).join(', ');
      return `${f.name}(${params})`;
    }
    if (isEnum) {
      return `${(selectedItem as EnumDef).name} (Enum with ${(selectedItem as EnumDef).values.length} values)`;
    }
    if (isVar) {
      return `${(selectedItem as VariableDef).name}: ${(selectedItem as VariableDef).type || 'any'}`;
    }
    if (isMod) {
      return `Mod: ${selectedItem.name} (${selectedItem.id})`;
    }
    return selectedItem.name || 'Symbol';
  };

  const signature = getSignature();
  const description =
    activeMember?.description ||
    selectedItem.description ||
    'WormForge engine component for Worms Armageddon modding.';
  const exampleCode =
    activeMember?.example ||
    selectedItem.example ||
    (isFunc ? `${signature}\n` : isVar ? `local val = ${selectedItem.name}\n` : `${signature}\n`);

  const handleCopy = () => {
    navigator.clipboard.writeText(exampleCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className={`h-full flex flex-col border-b text-xs overflow-y-auto transition-colors ${
        isLight
          ? 'bg-slate-50 border-slate-300 text-slate-800'
          : 'bg-[#14171c] border-[#262b33] text-[#cfd9e5]'
      }`}
    >
      {/* Title Bar */}
      <div
        className={`p-2.5 border-b flex items-center justify-between transition-colors ${
          isLight ? 'bg-slate-100 border-slate-200' : 'bg-[#171b21] border-[#242932]'
        }`}
      >
        <div className="flex items-center gap-1.5 truncate">
          <Code2 className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
          <span className={`font-semibold text-[13px] truncate ${isLight ? 'text-slate-900' : 'text-[#e3edf7]'}`}>
            {activeMember ? `${selectedItem.name}:${activeMember.name}` : selectedItem.name}
          </span>
          {activeMember?.isCustom && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 border border-amber-500/30">
              custom
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isMod && onLoadTemplate && (
            <button
              onClick={() => onLoadTemplate(selectedItem.id)}
              title="Open all mod files in the code editor"
              className="px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-600 border border-emerald-500/40 font-medium text-[11px] flex items-center gap-1 transition-colors mr-1"
            >
              <FolderOpen className="w-3 h-3" />
              <span>Open Mod</span>
            </button>
          )}
          <button
            onClick={handleCopy}
            title="Copy example code"
            className={`p-1 rounded transition-colors ${
              isLight ? 'bg-white hover:bg-slate-200 text-slate-600 border border-slate-300' : 'bg-[#212730] hover:bg-[#2c3340] text-[#93a4b8] hover:text-[#d3e0f0]'
            }`}
          >
            {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
          </button>
          <button
            onClick={() => onInsertCode(exampleCode)}
            title="Insert into code editor"
            className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-600 border border-amber-500/40 font-medium text-[11px] flex items-center gap-1 transition-colors"
          >
            <Plus className="w-3 h-3" />
            <span>Insert</span>
          </button>
        </div>
      </div>

      {/* Signature and Description Body */}
      <div className="p-3 space-y-2.5 overflow-y-auto flex-1">
        {/* Signature Box */}
        <div
          className={`border rounded p-2 font-mono text-[11.5px] break-all select-all transition-colors ${
            isLight
              ? 'bg-amber-50/70 border-amber-200 text-amber-900 font-semibold'
              : 'bg-[#1b2027] border-[#2b333e] text-amber-200/90'
          }`}
        >
          {signature}
        </div>

        {/* Description */}
        <p
          className={`text-[12px] leading-relaxed transition-colors ${
            isLight ? 'text-slate-600' : 'text-[#9ab0c8]'
          }`}
        >
          {description}
        </p>

        {/* Parameters Breakdown if method or function */}
        {((activeMember && activeMember.parameters && activeMember.parameters.length > 0) ||
          (isFunc && (selectedItem as FunctionDef).parameters.length > 0)) && (
          <div className="mt-2 space-y-1">
            <span
              className={`text-[10.5px] font-semibold tracking-wider uppercase ${
                isLight ? 'text-slate-500' : 'text-[#637488]'
              }`}
            >
              Parameters
            </span>
            <div
              className={`border rounded overflow-hidden ${
                isLight ? 'border-slate-200 bg-white' : 'border-[#262c35] bg-[#171a20]'
              }`}
            >
              {(activeMember ? activeMember.parameters : (selectedItem as FunctionDef).parameters)?.map(
                (p, pIdx) => (
                  <div
                    key={`${p.name}_${pIdx}`}
                    className={`grid grid-cols-12 gap-1 p-1.5 text-[11px] border-b last:border-0 ${
                      isLight
                        ? 'border-slate-100 bg-white hover:bg-slate-50'
                        : 'border-[#20252e] bg-[#171a20]'
                    }`}
                  >
                    <span
                      className={`col-span-4 font-mono font-medium truncate ${
                        isLight ? 'text-emerald-700' : 'text-emerald-400'
                      }`}
                    >
                      {p.name}
                    </span>
                    <span
                      className={`col-span-3 font-mono ${
                        isLight ? 'text-indigo-600' : 'text-purple-300'
                      }`}
                    >
                      {p.type}
                    </span>
                    <span
                      className={`col-span-5 text-[10.5px] truncate ${
                        isLight ? 'text-slate-500' : 'text-[#8899ac]'
                      }`}
                    >
                      {p.description || '-'}
                    </span>
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {/* Enum values if enum */}
        {isEnum && (
          <div className="mt-2 space-y-1">
            <span
              className={`text-[10.5px] font-semibold tracking-wider uppercase ${
                isLight ? 'text-slate-500' : 'text-[#637488]'
              }`}
            >
              Enumeration Values
            </span>
            <div
              className={`max-h-28 overflow-y-auto border rounded ${
                isLight ? 'border-slate-200 bg-white' : 'border-[#262c35] bg-[#171a20]'
              }`}
            >
              {(selectedItem as EnumDef).values.map((v, vIdx) => (
                <div
                  key={`${v.name}_${vIdx}`}
                  className={`flex items-center justify-between p-1.5 text-[11px] border-b last:border-0 font-mono ${
                    isLight ? 'border-slate-100 text-slate-800' : 'border-[#20252e]'
                  }`}
                >
                  <span className={isLight ? 'text-indigo-600 font-medium' : 'text-purple-300'}>
                    {v.name}
                  </span>
                  <span className={isLight ? 'text-slate-500' : 'text-[#647589]'}>
                    {String(v.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Code Example Preview */}
        {exampleCode && (
          <div className="mt-2 space-y-1">
            <span
              className={`text-[10.5px] font-semibold tracking-wider uppercase ${
                isLight ? 'text-slate-500' : 'text-[#637488]'
              }`}
            >
              Snippet / Usage
            </span>
            <pre
              className={`p-2 border rounded text-[11px] font-mono overflow-x-auto whitespace-pre ${
                isLight
                  ? 'bg-slate-50 border-slate-200 text-slate-800'
                  : 'bg-[#101317] border-[#232932] text-[#a5bad0]'
              }`}
            >
              {exampleCode}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
