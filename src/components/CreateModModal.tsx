import React, { useEffect, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import {
  validateNewModSpec,
  type NewModKind,
  type NewModOption,
  type NewModOptionType,
  type NewModSpec,
} from '../services/modFolder';

interface CreateModModalProps {
  isOpen: boolean;
  isLight?: boolean;
  isBusy?: boolean;
  error?: string | null;
  onClose: () => void;
  onCreate: (spec: NewModSpec) => void;
}

const TYPE_LABEL: Record<NewModOptionType, string> = {
  bool: 'Switch (bool)',
  int: 'Number (int)',
  choice: 'Choice',
};

/**
 * The create dialog. It writes the same shape the loader reads: a bundle with
 * one component and its `[[components.options]]`, plus a profile under
 * `profiles/` that selects the component and stores the chosen values.
 *
 * Behavior mods default to bool options (the loader shows them as checkmarks).
 * Weapon mods default to int options, because that is the common shape for
 * tuning values such as `ctx.option("bullets")` in PX's attack helicopter.
 */
export const CreateModModal: React.FC<CreateModModalProps> = ({
  isOpen,
  isLight = false,
  isBusy = false,
  error = null,
  onClose,
  onCreate,
}) => {
  const [modName, setModName] = useState('');
  const [author, setAuthor] = useState('');
  const [kind, setKind] = useState<NewModKind>('feature');
  const [options, setOptions] = useState<NewModOption[]>([]);

  // A new mod starts from a clean sheet. Without this, the previous name,
  // author and parameter rows reappear when the dialog is reopened.
  useEffect(() => {
    if (isOpen) {
      setModName('');
      setAuthor('');
      setKind('feature');
      setOptions([]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const spec: NewModSpec = {
    name: modName.trim(),
    author: author.trim(),
    kind,
    options,
  };
  const validation = validateNewModSpec(spec);
  const showValidation = modName.trim().length > 0 || author.trim().length > 0 || options.length > 0;
  const shownError = error || (showValidation ? validation : null);
  const canSubmit = !validation && !isBusy;

  const inputClass = `w-full px-2 py-1.5 rounded text-xs border focus:outline-none focus:border-amber-500 transition-colors ${
    isLight
      ? 'bg-white text-slate-900 border-slate-300'
      : 'bg-[#1f242c] text-[#e0e6ed] border-[#2e3540]'
  }`;

  const panelClass = isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#151920] border-[#242b35]';
  const muted = isLight ? 'text-slate-500' : 'text-[#7e8fa3]';
  const selectedMuted = isLight ? 'text-amber-800/80' : 'text-amber-100/75';

  const submit = () => {
    if (!canSubmit) return;
    onCreate(spec);
  };

  const updateOption = (index: number, patch: Partial<NewModOption>) => {
    setOptions((prev) => prev.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  };

  const addOption = (type: NewModOptionType) => {
    const used = new Set(options.map((o) => o.key));
    let n = options.length + 1;
    while (used.has(`option_${n}`)) n++;
    const base: NewModOption = {
      key: `option_${n}`,
      label:
        type === 'bool' ? `Switch ${n}` : type === 'int' ? `Number ${n}` : `Choice ${n}`,
      type,
      defaultValue: type === 'bool' ? false : type === 'int' ? 0 : 'a',
      description: '',
    };
    if (type === 'int') {
      base.min = 0;
      base.max = 100;
    }
    if (type === 'choice') {
      base.choices = ['a', 'b'];
    }
    setOptions((prev) => [...prev, base]);
  };

  const changeType = (index: number, type: NewModOptionType) => {
    if (type === 'bool') {
      updateOption(index, { type, defaultValue: false, min: undefined, max: undefined, choices: undefined });
    } else if (type === 'int') {
      updateOption(index, { type, defaultValue: 0, min: 0, max: 100, choices: undefined });
    } else {
      updateOption(index, { type, defaultValue: 'a', min: undefined, max: undefined, choices: ['a', 'b'] });
    }
  };

  const setChoices = (index: number, raw: string) => {
    const choices = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const current = options[index];
    const defaultValue =
      typeof current.defaultValue === 'string' && choices.includes(current.defaultValue)
        ? current.defaultValue
        : choices[0] ?? '';
    updateOption(index, { choices, defaultValue });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        className={`rounded-lg max-w-3xl w-full shadow-2xl overflow-hidden text-xs border ${
          isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-[#171b21] border-[#2e3744] text-[#cfdbe8]'
        }`}
      >
        <div
          className={`p-3 border-b flex items-center justify-between ${
            isLight ? 'bg-slate-100 border-slate-200' : 'bg-[#1d222b] border-[#2b3340]'
          }`}
        >
          <span className="font-semibold text-sm">Create new mod</span>
          <button
            onClick={onClose}
            disabled={isBusy}
            className={`p-1 rounded transition-colors disabled:opacity-40 ${
              isLight ? 'hover:bg-slate-200' : 'hover:bg-[#2b3340]'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3 max-h-[72vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className={muted}>Mod name</span>
              <input
                type="text"
                autoFocus
                value={modName}
                onChange={(e) => setModName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder="e.g. banana_jetpack"
                className={inputClass}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className={muted}>Author / user name</span>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder="e.g. 0rang3"
                className={inputClass}
              />
            </label>
          </div>

          <div className="flex flex-col gap-1">
            <span className={muted}>What are you making?</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setKind('feature')}
                className={`rounded border px-3 py-2 text-left transition-colors ${
                  kind === 'feature'
                    ? 'border-amber-500 bg-amber-500/10 text-amber-300'
                    : isLight
                      ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                      : 'bg-[#1f242c] border-[#2e3540] text-[#b9cadb] hover:bg-[#252c36]'
                }`}
              >
                <span className="block font-semibold text-[12px]">Behavior / add-on</span>
                <span className={`block text-[10.5px] ${kind === 'feature' ? selectedMuted : muted}`}>
                  Feature component. Bool options become checkmarks in the loader.
                </span>
              </button>
              <button
                type="button"
                onClick={() => setKind('weapon')}
                className={`rounded border px-3 py-2 text-left transition-colors ${
                  kind === 'weapon'
                    ? 'border-amber-500 bg-amber-500/10 text-amber-300'
                    : isLight
                      ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                      : 'bg-[#1f242c] border-[#2e3540] text-[#b9cadb] hover:bg-[#252c36]'
                }`}
              >
                <span className="block font-semibold text-[12px]">Weapon</span>
                <span className={`block text-[10.5px] ${kind === 'weapon' ? selectedMuted : muted}`}>
                  Weapon component. Parameters are shown in Weapons settings.
                </span>
              </button>
            </div>
          </div>

          <div className={`rounded border ${panelClass}`}>
            <div className="flex items-center justify-between gap-2 px-2.5 pt-2">
              <div>
                <div className="font-semibold text-[11.5px]">Parameters</div>
                <div className={`text-[10.5px] ${muted}`}>
                  Declared in <span className="font-mono">mod.toml</span> and read with{' '}
                  <span className="font-mono">ctx.option("key")</span>.
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => addOption('bool')}
                  className={`px-2 py-1 rounded border text-[10.5px] transition-colors ${isLight ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700' : 'bg-[#202631] hover:bg-[#2b3341] border-[#2e3745] text-[#b9cadb]'}`}
                >
                  + Switch
                </button>
                <button
                  type="button"
                  onClick={() => addOption('int')}
                  className={`px-2 py-1 rounded border text-[10.5px] transition-colors ${isLight ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700' : 'bg-[#202631] hover:bg-[#2b3341] border-[#2e3745] text-[#b9cadb]'}`}
                >
                  + Number
                </button>
                <button
                  type="button"
                  onClick={() => addOption('choice')}
                  className={`px-2 py-1 rounded border text-[10.5px] transition-colors ${isLight ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700' : 'bg-[#202631] hover:bg-[#2b3341] border-[#2e3745] text-[#b9cadb]'}`}
                >
                  + Choice
                </button>
              </div>
            </div>

            {options.length === 0 ? (
              <p className={`px-2.5 py-3 text-[10.5px] ${muted}`}>
                No parameters yet. Add a switch for behavior, or a number for a weapon value
                such as bullets.
              </p>
            ) : (
              <div className="p-2 flex flex-col gap-2">
                {options.map((o, i) => (
                  <div
                    key={i}
                    className={`rounded border p-2 flex flex-col gap-2 ${
                      isLight ? 'bg-white border-slate-200' : 'bg-[#1b2028] border-[#2b3340]'
                    }`}
                  >
                    <div className="grid grid-cols-[1fr_1fr_9rem_auto] gap-2 items-end">
                      <label className="flex flex-col gap-0.5">
                        <span className={`text-[10px] ${muted}`}>Key</span>
                        <input
                          type="text"
                          value={o.key}
                          onChange={(e) => updateOption(i, { key: e.target.value })}
                          placeholder="bullets"
                          className={inputClass}
                        />
                      </label>
                      <label className="flex flex-col gap-0.5">
                        <span className={`text-[10px] ${muted}`}>Label</span>
                        <input
                          type="text"
                          value={o.label}
                          onChange={(e) => updateOption(i, { label: e.target.value })}
                          placeholder="Bullets per strafe"
                          className={inputClass}
                        />
                      </label>
                      <label className="flex flex-col gap-0.5">
                        <span className={`text-[10px] ${muted}`}>Type</span>
                        <select
                          value={o.type}
                          onChange={(e) => changeType(i, e.target.value as NewModOptionType)}
                          className={inputClass}
                        >
                          {(['bool', 'int', 'choice'] as NewModOptionType[]).map((t) => (
                            <option key={t} value={t}>
                              {TYPE_LABEL[t]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                        title="Remove parameter"
                        className={`p-1.5 rounded border transition-colors ${isLight ? 'bg-white hover:bg-rose-50 border-slate-300 text-slate-500 hover:text-rose-600' : 'bg-[#202631] hover:bg-rose-500/10 border-[#2e3745] text-[#7e8fa3] hover:text-rose-300'}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-[1fr_auto] gap-2 items-start">
                      <label className="flex flex-col gap-0.5">
                        <span className={`text-[10px] ${muted}`}>Default</span>
                        {o.type === 'bool' ? (
                          <span className={`flex items-center gap-2 text-[11px] ${isLight ? 'text-slate-700' : 'text-[#b9cadb]'}`}>
                            <input
                              type="checkbox"
                              checked={o.defaultValue === true}
                              onChange={(e) => updateOption(i, { defaultValue: e.target.checked })}
                              className="accent-amber-500"
                            />
                            {o.defaultValue === true ? 'On by default' : 'Off by default'}
                          </span>
                        ) : o.type === 'int' ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={typeof o.defaultValue === 'number' ? o.defaultValue : 0}
                              onChange={(e) =>
                                updateOption(i, {
                                  defaultValue: Number.isFinite(Number(e.target.value))
                                    ? Number(e.target.value)
                                    : 0,
                                })
                              }
                              className={inputClass}
                            />
                            <span className={`text-[10px] shrink-0 ${muted}`}>min</span>
                            <input
                              type="number"
                              value={o.min ?? 0}
                              onChange={(e) =>
                                updateOption(i, {
                                  min: Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 0,
                                })
                              }
                              className={`${inputClass} w-20`}
                            />
                            <span className={`text-[10px] shrink-0 ${muted}`}>max</span>
                            <input
                              type="number"
                              value={o.max ?? 100}
                              onChange={(e) =>
                                updateOption(i, {
                                  max: Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 100,
                                })
                              }
                              className={`${inputClass} w-20`}
                            />
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={(o.choices ?? []).join(', ')}
                              onChange={(e) => setChoices(i, e.target.value)}
                              placeholder="alternate, facing, random"
                              className={inputClass}
                            />
                            <select
                              value={typeof o.defaultValue === 'string' ? o.defaultValue : ''}
                              onChange={(e) => updateOption(i, { defaultValue: e.target.value })}
                              className={`${inputClass} w-36 shrink-0`}
                            >
                              {(o.choices ?? []).length === 0 && <option value="">(add choices)</option>}
                              {(o.choices ?? []).map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </label>
                      {o.type !== 'bool' && (
                        <span className={`text-[10px] ${muted} pt-4`}>
                          {o.type === 'int' ? 'Whole number' : 'Default must match'}
                        </span>
                      )}
                    </div>

                    <label className="flex flex-col gap-0.5">
                      <span className={`text-[10px] ${muted}`}>Description (optional)</span>
                      <input
                        type="text"
                        value={o.description ?? ''}
                        onChange={(e) => updateOption(i, { description: e.target.value })}
                        placeholder="What this setting does"
                        className={inputClass}
                      />
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className={`text-[10.5px] leading-relaxed ${muted}`}>
            Creates <span className="font-mono">mod.toml</span>, Lua in{' '}
            <span className="font-mono">code/mod.lua</span>, and a profile in{' '}
            <span className="font-mono">profiles/&lt;name&gt;.toml</span>. The profile sets the
            chosen values and switches the component on.
            {kind === 'weapon' && (
              <>
                {' '}
                The starter profile places the weapon on F1 with a small stock kit; edit it to
                change the panel.
              </>
            )}
          </p>

          {shownError && (
            <div
              className={`rounded border px-2 py-1.5 text-[11px] ${
                isLight
                  ? 'bg-rose-50 border-rose-300 text-rose-700'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {shownError}
            </div>
          )}
        </div>

        <div
          className={`p-3 border-t flex items-center justify-end gap-2 ${
            isLight ? 'bg-slate-100 border-slate-200' : 'bg-[#1d222b] border-[#2b3340]'
          }`}
        >
          <button
            onClick={onClose}
            disabled={isBusy}
            className={`px-3 py-1.5 rounded border font-medium transition-colors disabled:opacity-40 ${
              isLight
                ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                : 'bg-[#202631] hover:bg-[#2b3341] text-[#cfdbe8] border-[#2e3745]'
            }`}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-colors disabled:opacity-40 flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isBusy ? 'Creating...' : 'Create'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
