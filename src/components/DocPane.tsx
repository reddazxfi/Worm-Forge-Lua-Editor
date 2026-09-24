import React from 'react';
import { BookOpen, Copy, Check, Plus, Code2, ArrowRight, FolderOpen } from 'lucide-react';
import { ClassDef, EnumDef, FunctionDef, MemberDef, VariableDef } from '../types/wormforge';

interface DocPaneProps {
  selectedItem: any;
  onInsertCode: (snippet: string) => void;
  onLoadTemplate?: (templateId: string) => void;
}

export const DocPane: React.FC<DocPaneProps> = ({ selectedItem, onInsertCode, onLoadTemplate }) => {
  const [copied, setCopied] = React.useState(false);

  if (!selectedItem) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-4 text-center text-[#556275] bg-[#14171c] border-b border-[#262b33]">
        <BookOpen className="w-6 h-6 mb-1 text-[#3b4452]" />
        <p className="text-xs font-medium">Select any item from the Tree above or hover code</p>
        <span className="text-[11px] text-[#424d5d] mt-1">Displays functions, parameters, classes, and verbs</span>
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
      if (selectedItem.name === 'customClass' || activeMember.isCustom) {
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
    <div className="h-full flex flex-col bg-[#14171c] border-b border-[#262b33] text-xs text-[#cfd9e5] overflow-y-auto">
      {/* Title Bar */}
      <div className="p-2.5 bg-[#171b21] border-b border-[#242932] flex items-center justify-between">
        <div className="flex items-center gap-1.5 truncate">
          <Code2 className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
          <span className="font-semibold text-[13px] text-[#e3edf7] truncate">
            {activeMember ? `${selectedItem.name}:${activeMember.name}` : selectedItem.name}
          </span>
          {activeMember?.isCustom && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
              customClass-&gt;
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isMod && onLoadTemplate && (
            <button
              onClick={() => onLoadTemplate(selectedItem.id)}
              title="Open all mod files in the code editor"
              className="px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-medium text-[11px] flex items-center gap-1 transition-colors mr-1"
            >
              <FolderOpen className="w-3 h-3" />
              <span>Open Mod</span>
            </button>
          )}
          <button
            onClick={handleCopy}
            title="Copy example code"
            className="p-1 rounded bg-[#212730] hover:bg-[#2c3340] text-[#93a4b8] hover:text-[#d3e0f0] transition-colors"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          </button>
          <button
            onClick={() => onInsertCode(exampleCode)}
            title="Insert into code editor"
            className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-medium text-[11px] flex items-center gap-1 transition-colors"
          >
            <Plus className="w-3 h-3" />
            <span>Insert</span>
          </button>
        </div>
      </div>

      {/* Signature and Description Body */}
      <div className="p-3 space-y-2.5 overflow-y-auto flex-1">
        {/* Signature Box */}
        <div className="bg-[#1b2027] border border-[#2b333e] rounded p-2 font-mono text-[11.5px] text-amber-200/90 break-all select-all">
          {signature}
        </div>

        {/* Description */}
        <p className="text-[12px] leading-relaxed text-[#9ab0c8]">{description}</p>

        {/* Parameters Breakdown if method or function */}
        {((activeMember && activeMember.parameters && activeMember.parameters.length > 0) ||
          (isFunc && (selectedItem as FunctionDef).parameters.length > 0)) && (
          <div className="mt-2 space-y-1">
            <span className="text-[10.5px] font-semibold tracking-wider text-[#637488] uppercase">
              Parameters
            </span>
            <div className="border border-[#262c35] rounded overflow-hidden">
              {(activeMember ? activeMember.parameters : (selectedItem as FunctionDef).parameters)?.map(
                (p, pIdx) => (
                  <div
                    key={`${p.name}_${pIdx}`}
                    className="grid grid-cols-12 gap-1 p-1.5 text-[11px] border-b border-[#20252e] last:border-0 bg-[#171a20]"
                  >
                    <span className="col-span-4 font-mono font-medium text-emerald-400 truncate">
                      {p.name}
                    </span>
                    <span className="col-span-3 font-mono text-purple-300">{p.type}</span>
                    <span className="col-span-5 text-[#8899ac] text-[10.5px] truncate">
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
            <span className="text-[10.5px] font-semibold tracking-wider text-[#637488] uppercase">
              Enumeration Values
            </span>
            <div className="max-h-28 overflow-y-auto border border-[#262c35] rounded bg-[#171a20]">
              {(selectedItem as EnumDef).values.map((v, vIdx) => (
                <div
                  key={`${v.name}_${vIdx}`}
                  className="flex items-center justify-between p-1.5 text-[11px] border-b border-[#20252e] last:border-0 font-mono"
                >
                  <span className="text-purple-300">{v.name}</span>
                  <span className="text-[#647589]">{String(v.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Code Example Preview */}
        {exampleCode && (
          <div className="mt-2 space-y-1">
            <span className="text-[10.5px] font-semibold tracking-wider text-[#637488] uppercase">
              Snippet / Usage
            </span>
            <pre className="p-2 bg-[#101317] border border-[#232932] rounded text-[11px] font-mono text-[#a5bad0] overflow-x-auto whitespace-pre">
              {exampleCode}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
