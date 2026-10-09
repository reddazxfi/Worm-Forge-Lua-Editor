import React, { useState } from 'react';
import { X, Sparkles, Plus, Code2, Variable, Box, AlertTriangle } from 'lucide-react';
import { ClassDef, CustomVerb, ParameterDef } from '../types/wormforge';
import { isValidIdent, isValidClass } from '../services/customVerbs';

interface EngineAdditionModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Emits a FULL verb, not (class, member) halves. The consumer no longer has
   * to reconstruct `syntax` from `kind` -- `.` vs `:` is a separate choice in
   * this form -- and the same shape is what persists to custom_verbs.cfg and
   * what the checkers read, so there is one representation end to end.
   */
  onAddVerb: (verb: CustomVerb) => void;
  existingClasses: ClassDef[];
}

export const EngineAdditionModal: React.FC<EngineAdditionModalProps> = ({
  isOpen,
  onClose,
  onAddVerb,
  existingClasses,
}) => {
  const [targetClass, setTargetClass] = useState(existingClasses[0]?.name ?? 'wa');
  const [isNewClass, setIsNewClass] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [memberName, setMemberName] = useState('');
  const [memberKind, setMemberKind] = useState<'method' | 'variable'>('method');
  const [callSyntax, setCallSyntax] = useState<'.' | ':'>('.');
  const [returnType, setReturnType] = useState('any');
  const [description, setDescription] = useState('Custom engine function / method');
  const [paramsStr, setParamsStr] = useState('1, "test", 3.14');
  // Inline submit-time validation. A name that is not a Lua identifier would
  // be dropped by `sanitizeVerb` at load time anyway -- surfacing it HERE
  // (with the reason) instead of logging success for a verb that silently
  // vanishes on restart is the whole point of this state.
  const [formError, setFormError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const className = isNewClass ? newClassName.trim() : targetClass;
    const name = memberName.trim();
    // Both halves are checked, not just the new class: registering
    // `WormEntity:grap ple` on an EXISTING class would fail the same way at
    // load time, so it must fail the same way here.
    if (!className || !isValidClass(className)) {
      setFormError(
        isNewClass && className
          ? `"${className}" is not a valid class name. Classes may contain letters, digits, underscores and dots (namespace paths) -- the NAME AFTER the last dot must still be a plain identifier.`
          : 'Choose a target class first.'
      );
      return;
    }
    if (!name || !isValidIdent(name)) {
      setFormError(
        name
          ? `"${name}" is not a valid Lua identifier. Use letters, digits and underscores; must not start with a digit.`
          : 'Enter a method / variable name.'
      );
      return;
    }
    setFormError('');

    // Parse parameters e.g. "param1, param2" or "1, 2, 3"
    const parsedParams: ParameterDef[] = [];
    if (memberKind === 'method' && paramsStr.trim()) {
      const parts = paramsStr.split(',').map((p) => p.trim());
      for (const part of parts) {
        const segs = part.split(/\s+/);
        if (segs.length >= 2) {
          const type = segs[0].toLowerCase() as any;
          const pname = segs[1];
          if (isValidIdent(pname)) parsedParams.push({ name: pname, type });
        } else if (segs.length === 1 && segs[0] && isValidIdent(segs[0])) {
          parsedParams.push({ name: segs[0], type: 'any' });
        }
      }
    }

    const verb: CustomVerb = {
      class: className,
      name,
      kind: memberKind,
      syntax: callSyntax,
      returnType,
      parameters: parsedParams,
      description: description.trim(),
      example: `${className}${callSyntax}${name}(${paramsStr})`,
    };

    onAddVerb(verb);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#171b21] border border-[#2e3744] rounded-lg max-w-lg w-full flex flex-col shadow-2xl overflow-hidden text-xs">
        {/* Header */}
        <div className="p-3 bg-[#1d222b] border-b border-[#2b3340] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span className="font-semibold text-sm text-[#e4edf7]">Register New Engine Method / Variable</span>
          </div>
          <button onClick={onClose} className="p-1 rounded text-[#8192a6] hover:text-[#e4edf7] hover:bg-[#2b3340]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <p className="text-[11.5px] text-[#8ea1b8] leading-relaxed">
            Expand the WormForge parser and autocompletion with custom classes and verbs.
            In Lua, use <code className="text-emerald-300 font-mono">.</code> for functions/properties (e.g. <code className="text-emerald-300 font-mono">wa.log()</code>) or <code className="text-amber-300 font-mono">:</code> for methods with self (e.g. <code className="text-amber-300 font-mono">a:gfx()</code>). The arrow <code className="text-rose-400 font-mono">-&gt;</code> is from PX engine C++ internals, not valid Lua.
            {' '}For a custom namespaced function such as <code className="text-emerald-300 font-mono">wa.one.two()</code>, choose <code className="font-mono">+ New Class</code>, enter <code className="font-mono">wa.one</code> as the namespace and <code className="font-mono">two</code> as the member.
          </p>

          {/* Target Class */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-[#8fa1b5] uppercase">Target Class</label>
            <div className="flex gap-2 items-center">
              {!isNewClass ? (
                <select
                  value={targetClass}
                  onChange={(e) => setTargetClass(e.target.value)}
                  className="flex-1 bg-[#12151a] border border-[#2e3540] rounded px-2.5 py-1.5 text-xs text-[#dce7f3] font-mono"
                >
                  {existingClasses.map((c, idx) => (
                    <option key={`${c.name}_${idx}`} value={c.name}>
                      {c.name} {c.isCustom ? '(Custom)' : '(Engine)'}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder="e.g. wa.one (namespace prefix)"
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  className="flex-1 bg-[#12151a] border border-[#2e3540] rounded px-2.5 py-1.5 text-xs text-[#dce7f3] font-mono"
                  required
                />
              )}
              <button
                type="button"
                onClick={() => setIsNewClass(!isNewClass)}
                className="px-2 py-1.5 bg-[#252c38] text-amber-300 rounded border border-[#343e4f] text-[11px]"
              >
                {isNewClass ? 'Choose Existing' : '+ New Class'}
              </button>
            </div>
          </div>

          {/* Member Name and Kind */}
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1 col-span-1">
              <label className="text-[11px] font-semibold text-[#8fa1b5] uppercase">Call Syntax</label>
              <select
                value={callSyntax}
                onChange={(e) => {
                  const syn = e.target.value as '.' | ':';
                  setCallSyntax(syn);
                  if (syn === ':') setMemberKind('method');
                }}
                className="w-full bg-[#12151a] border border-[#2e3540] rounded px-2.5 py-1.5 text-xs text-amber-300 font-mono font-bold"
              >
                <option value=".">. (Function / Table)</option>
                <option value=":">: (Method with self)</option>
              </select>
            </div>
            <div className="space-y-1 col-span-1">
              <label className="text-[11px] font-semibold text-[#8fa1b5] uppercase">Member Name</label>
              <input
                type="text"
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                placeholder={isNewClass && newClassName.trim().startsWith('wa.') ? 'e.g. two' : 'e.g. my_verb'}
                className="w-full bg-[#12151a] border border-[#2e3540] rounded px-2.5 py-1.5 text-xs text-[#dce7f3] font-mono"
                required
              />
            </div>
            <div className="space-y-1 col-span-1">
              <label className="text-[11px] font-semibold text-[#8fa1b5] uppercase">Member Kind</label>
              <select
                value={memberKind}
                onChange={(e) => setMemberKind(e.target.value as any)}
                className="w-full bg-[#12151a] border border-[#2e3540] rounded px-2.5 py-1.5 text-xs text-[#dce7f3]"
              >
                <option value="method">Method (function)</option>
                <option value="variable">Variable / Field</option>
              </select>
            </div>
          </div>

          {/* Parameters for methods */}
          {memberKind === 'method' && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-[#8fa1b5] uppercase">
                  Parameters
                </label>
                <span className="text-[10px] text-[#657689] font-mono">Format: param1, param2</span>
              </div>
              <input
                type="text"
                value={paramsStr}
                onChange={(e) => setParamsStr(e.target.value)}
                placeholder="e.g. 1, 2, 3 or target, damage"
                className="w-full bg-[#12151a] border border-[#2e3540] rounded px-2.5 py-1.5 text-xs text-amber-200 font-mono"
              />
            </div>
          )}

          {/* Description */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-[#8fa1b5] uppercase">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this custom verb does..."
              className="w-full bg-[#12151a] border border-[#2e3540] rounded px-2.5 py-1.5 text-xs text-[#dce7f3]"
            />
          </div>

          {/* Preview Box */}
          <div className="p-2.5 rounded bg-[#101317] border border-[#262c35] space-y-1">
            <span className="text-[10px] uppercase font-bold text-[#657688] tracking-wider">
              Syntax Preview
            </span>
            <div className="font-mono text-amber-300 text-[11.5px]">
              {isNewClass ? newClassName || 'CustomClass' : targetClass}
              {callSyntax}
              {memberName || 'customMethod'}
              {memberKind === 'method' ? `(${paramsStr})` : ''}
            </div>
          </div>

          {/* Validation error: inline, specific, and it BLOCKS submit. A verb
              that fails sanitizeVerb later would be dropped from the cfg file
              silently -- better to refuse it here with the reason. */}
          {formError && (
            <div
              role="alert"
              className="p-2 rounded border flex items-start gap-1.5 text-[11px] bg-rose-500/10 border-rose-500/30 text-rose-400"
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded bg-[#212732] hover:bg-[#2b3341] text-[#93a4b8] font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Register Verb</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
