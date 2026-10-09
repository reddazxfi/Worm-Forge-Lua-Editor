import React, { useEffect, useRef, useState } from 'react';
import {
  Settings,
  X,
  Sun,
  Moon,
  Type,
  FolderOpen,
  Sparkles,
  Download,
  Upload,
  RotateCcw,
  Sliders,
  Check,
  Search,
  Database,
  Palette,
} from 'lucide-react';
import { EditorConfig, DEFAULT_CONFIG, exportConfigAsIni, parseIniConfig } from '../services/config';
import {
  SYNTAX_PRESETS,
  SYNTAX_TOKENS,
  THEME_SWATCHES,
  getPreset,
  isValidSwatch,
  resolveTokenClasses,
  swatchLabel,
  type SyntaxOverrides,
  type SyntaxToken,
} from '../services/editorThemes';
import { cleanFolderPath, loadFolderFromPath, pickFolder, listModEntries, baseName } from '../services/modFolder';
import {
  VERB_FILE_NAME,
  customVerbsFilePath,
  parseVerbsFile,
  serializeVerbsFile,
} from '../services/customVerbs';
import { ModFolderInfo, CustomVerb } from '../types/wormforge';

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: EditorConfig;
  onUpdateConfig: (newConfig: EditorConfig) => void;
  existingMods: ModFolderInfo[];
  /**
   * The custom_verbs.cfg rows currently in memory, and the sink for an
   * import. The modal never writes the file itself -- App owns the list and
   * its debounced persist, so an import goes through exactly the same
   * save path as "+ Register Verb" (localStorage mirror + AppData cfg).
   */
  customVerbs: CustomVerb[];
  onImportVerbs: (verbs: CustomVerb[]) => void;
}

export const ConfigModal: React.FC<ConfigModalProps> = ({
  isOpen,
  onClose,
  config,
  onUpdateConfig,
  existingMods,
  customVerbs,
  onImportVerbs,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const verbFileInputRef = useRef<HTMLInputElement>(null);
  // Where custom_verbs.cfg actually lives (null = browser, no disk). Resolved
  // once when the dialog opens so the block can say the true path instead of
  // a guess the OS might not honour.
  const [verbFilePath, setVerbFilePath] = useState<string | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    // A status from the last open would otherwise still be on screen (and
    // stale) the next time the dialog is summoned.
    setVerbImportStatus(null);
    let cancelled = false;
    customVerbsFilePath().then((p) => {
      if (!cancelled) setVerbFilePath(p);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);
  // §35: "Edit Colors" is its own tab, not a section of the General tab. 14 token
  // rows plus presets and a preview made the settings dialog long enough that the
  // things people actually change (font size, folder) had scrolled off-screen.
  const [tab, setTab] = useState<'general' | 'colors'>('general');
  // §35: there is ONE folder path now, so there is ONE status box. The second
  // `testStatus` existed only so the two "Test" buttons would not overwrite each
  // other's messages; with one button there is nothing to collide with.
  const [modsTestStatus, setModsTestStatus] = useState<{ type: 'success' | 'error' | 'loading' | null; msg: string }>({ type: null, msg: '' });
  // Feedback for the custom_verbs.cfg import button (see handler below).
  const [verbImportStatus, setVerbImportStatus] = useState<string | null>(null);

  if (!isOpen) return null;

  const isLight = config.theme === 'light';

  // ---- §34 Syntax palette -------------------------------------------------
  // Overrides are kept per mode, so every edit below targets whichever mode is
  // currently selected in the dialog. Switching dark/light above therefore shows
  // that mode's own overrides rather than leaking one mode's colours into the
  // other.
  const activeOverrides: SyntaxOverrides = isLight
    ? config.syntaxOverridesLight
    : config.syntaxOverridesDark;

  const setOverride = (token: SyntaxToken, value: string) => {
    const next: SyntaxOverrides = { ...activeOverrides };
    // 'preset' is the sentinel for "stop overriding this token". Deleting the key
    // is what makes the token follow the preset again, so it must be a delete and
    // not an empty string.
    if (value === 'preset') delete next[token];
    else if (isValidSwatch(value)) next[token] = value;
    onUpdateConfig(
      isLight
        ? { ...config, syntaxOverridesLight: next }
        : { ...config, syntaxOverridesDark: next },
    );
  };

  const overrideCount = Object.keys(activeOverrides).filter((k) =>
    isValidSwatch((activeOverrides as Record<string, unknown>)[k]),
  ).length;

  // What each token resolves to RIGHT NOW, so the dropdown shows the effective
  // colour rather than the preset's default when an override is in play.
  const effective = resolveTokenClasses(
    isLight,
    config.syntaxPreset,
    config.syntaxOverridesDark,
    config.syntaxOverridesLight,
  );

  const clearAllOverrides = () =>
    onUpdateConfig(
      isLight
        ? { ...config, syntaxOverridesLight: {} }
        : { ...config, syntaxOverridesDark: {} },
    );

  // §35: the two old handlers (browse auto-load folder, browse mods folder) are
  // now ONE. Both set config.modsRootPath, and the test button reports BOTH facts
  // the user actually cares about -- how many mod subfolders were found, and
  // whether the named startup mod is among them -- in a single message.
  const handleBrowseModsFolder = async () => {
    try {
      const picked = await pickFolder();
      if (!picked) return;
      onUpdateConfig({ ...config, modsRootPath: picked });
      await testModsFolder(picked);
    } catch (err: any) {
      setModsTestStatus({ type: 'error', msg: err?.message || String(err) });
    }
  };

  const testModsFolder = async (rawPath: string) => {
    const clean = cleanFolderPath(rawPath);
    setModsTestStatus({ type: 'loading', msg: `Testing path "${clean}"...` });
    try {
      const entries = await listModEntries(clean);
      if (entries === null) {
        setModsTestStatus({ type: 'error', msg: 'Could not access folder.' });
        return;
      }
      // Report whether the startup mod resolves, because that used to be a second
      // independent path and silently failing is exactly the confusion the merge
      // removes. Naming the missing folder is the useful half of this message.
      const wanted = (config.startupModFolder || '').trim();
      const found = wanted
        ? entries.find((e) => (e.folderName || '').toLowerCase() === wanted.toLowerCase())
        : null;
      if (wanted && !found) {
        setModsTestStatus({
          type: 'error',
          msg: `Found ${entries.length} mod(s), but no subfolder named "${wanted}" -- it will not be opened on startup.`,
        });
        return;
      }
      setModsTestStatus({
        type: 'success',
        msg: `Success: Found ${entries.length} mod(s) in "${baseName(clean)}"!${
          found ? ` Startup mod "${wanted}" is present.` : ''
        }`,
      });
    } catch (err: any) {
      setModsTestStatus({ type: 'error', msg: err?.message || String(err) });
    }
  };

  const handleTestModsFolder = async () => {
    const raw = config.modsRootPath;
    if (!raw.trim()) {
      setModsTestStatus({ type: 'error', msg: 'Please enter a mods directory path first.' });
      return;
    }
    await testModsFolder(raw);
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wormforge.config.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportIni = () => {
    const iniContent = exportConfigAsIni(config);
    const blob = new Blob([iniContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wormforge.config.ini';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        if (file.name.endsWith('.json')) {
          const parsed = JSON.parse(text);
          onUpdateConfig({ ...config, ...parsed });
        } else {
          const parsed = parseIniConfig(text);
          onUpdateConfig({ ...config, ...parsed });
        }
      } catch (err) {
        alert('Invalid config file format.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleReset = () => {
    if (window.confirm('Reset all editor settings to defaults?')) {
      onUpdateConfig({ ...DEFAULT_CONFIG });
    }
  };

  // ---- custom_verbs.cfg export/import -------------------------------------
  //
  // Export downloads the CURRENT list (the same serializer the cfg file uses,
  // so a hand-diffable file and an exported file are byte-identical). Import
  // parses through parseVerbsFile -- bad rows drop individually, a bad file
  // imports nothing -- and hands the result to App, which merges and lets the
  // debounced persist write it. Nothing here touches disk directly.

  const handleExportVerbs = () => {
    const blob = new Blob([serializeVerbsFile(customVerbs)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = VERB_FILE_NAME;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportVerbsFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const parsed = parseVerbsFile(text);
        // An EMPTY parse of a non-empty file means JSON garbage or all-bad
        // rows -- refuse loudly, because "imported 0 verbs" as a success
        // message is the same class of UI lie this feature was built to end.
        if (parsed.length === 0 && text.trim().length > 0) {
          setVerbImportStatus(`No valid verb rows in "${file.name}". Expected a JSON array of verb objects.`);
        } else {
          onImportVerbs(parsed);
          setVerbImportStatus(`Imported ${parsed.length} verb(s) from "${file.name}".`);
        }
      } catch {
        setVerbImportStatus(`Could not read "${file.name}".`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        className={`w-full max-w-lg rounded-xl shadow-2xl border overflow-hidden flex flex-col max-h-[90vh] transition-colors ${
          isLight
            ? 'bg-white border-slate-300 text-slate-800'
            : 'bg-[#181b22] border-[#2e3745] text-[#d6e2ef]'
        }`}
      >
        {/* Header */}
        <div
          className={`px-5 py-3.5 border-b flex items-center justify-between ${
            isLight ? 'bg-slate-100 border-slate-200' : 'bg-[#13161c] border-[#252c37]'
          }`}
        >
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-amber-500" />
            <h2 className="font-bold text-sm tracking-tight">Editor Configuration</h2>
          </div>
          <button
            onClick={onClose}
            className={`p-1 rounded-md transition-colors ${
              isLight
                ? 'hover:bg-slate-200 text-slate-500'
                : 'hover:bg-[#252b36] text-[#7d8f9f] hover:text-[#d3e0f0]'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* §35 tab bar: General | Colors */}
        <div
          className={`px-5 flex items-center gap-1 border-b ${
            isLight ? 'bg-white border-slate-200' : 'bg-[#171b21] border-[#252c37]'
          }`}
        >
          {([
            { id: 'general' as const, label: 'General', icon: Sliders },
            { id: 'colors' as const, label: 'Edit Colors', icon: Palette },
          ]).map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-3 py-2 text-[11.5px] font-medium flex items-center gap-1.5 border-b-2 -mb-px transition-colors ${
                  active
                    ? 'border-amber-500 text-amber-500'
                    : isLight
                    ? 'border-transparent text-slate-500 hover:text-slate-800'
                    : 'border-transparent text-[#7d8f9f] hover:text-[#cfdbe8]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Settings Body */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1 text-xs">
          {/* §35: three gates rather than one big ternary. The colour block is
              physically in the middle of this file (it used to sit between Theme
              and Typography), so gating each contiguous run keeps the diff small
              and avoids moving 140 lines around. Only one is ever mounted, so the
              14 colour rows are not Tab-focusable while on General. */}
          {tab === 'general' && (
            <>
          {/* 1. Theme Selection */}
          <div className="space-y-2">
            <label className="font-semibold uppercase tracking-wider text-[11px] text-amber-500 flex items-center gap-1.5">
              <span>Theme &amp; Appearance</span>
              {/* Jumping straight to the colour tab from here -- "Edit Colors" is
                  a separate tab now, and this is where people look for it. */}
              <button
                type="button"
                onClick={() => setTab('colors')}
                className="ml-auto font-normal normal-case tracking-normal text-[10.5px] px-2 py-0.5 rounded border flex items-center gap-1 transition-colors hover:border-amber-500 hover:text-amber-400"
              >
                <Palette className="w-3 h-3" />
                <span>Edit Colors...</span>
              </button>
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => onUpdateConfig({ ...config, theme: 'dark' })}
                className={`py-2 px-3 rounded-lg border flex items-center justify-center gap-2 font-medium transition-all ${
                  config.theme === 'dark'
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-sm'
                    : isLight
                    ? 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-600'
                    : 'bg-[#20252e] border-[#2c3442] hover:bg-[#272e3a] text-[#8ea0b5]'
                }`}
              >
                <Moon className="w-4 h-4" />
                <span>Dark Theme</span>
                {config.theme === 'dark' && <Check className="w-3.5 h-3.5 ml-auto" />}
              </button>
              <button
                type="button"
                onClick={() => onUpdateConfig({ ...config, theme: 'light' })}
                className={`py-2 px-3 rounded-lg border flex items-center justify-center gap-2 font-medium transition-all ${
                  config.theme === 'light'
                    ? 'bg-amber-500/20 border-amber-500 text-amber-700 font-bold shadow-sm'
                    : isLight
                    ? 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-600'
                    : 'bg-[#20252e] border-[#2c3442] hover:bg-[#272e3a] text-[#8ea0b5]'
                }`}
              >
                <Sun className="w-4 h-4" />
                <span>Light Theme</span>
                {config.theme === 'light' && <Check className="w-3.5 h-3.5 ml-auto text-amber-600" />}
              </button>
            </div>
          </div>
            </>
          )}

          {/* ----- §34 Syntax palette: the "Edit Colors" tab ----- */}
          {tab === 'colors' && (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <label className="font-semibold uppercase tracking-wider text-[11px] text-amber-500 flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5" />
                <span>Syntax Colors</span>
              </label>
              <span className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-[#6c7d91]'}`}>
                editing the {isLight ? 'light' : 'dark'} theme
              </span>
            </div>

            {/* Preset row */}
            <div className="grid grid-cols-3 gap-2">
              {SYNTAX_PRESETS.map((preset) => {
                const selected = getPreset(config.syntaxPreset).id === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    title={preset.description}
                    onClick={() => onUpdateConfig({ ...config, syntaxPreset: preset.id })}
                    className={`py-1.5 px-2 rounded-lg border text-[11px] font-medium transition-all flex items-center justify-center gap-1.5 ${
                      selected
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-sm'
                        : isLight
                        ? 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-600'
                        : 'bg-[#20252e] border-[#2c3442] hover:bg-[#272e3a] text-[#8ea0b5]'
                    }`}
                  >
                    <span>{preset.name}</span>
                    {selected && <Check className="w-3.5 h-3.5" />}
                  </button>
                );
              })}
            </div>
            <p className={`text-[10px] leading-relaxed ${isLight ? 'text-slate-500' : 'text-[#6c7d91]'}`}>
              {getPreset(config.syntaxPreset).description}
            </p>
            {/* Live preview: one line of Lua coloured by the CURRENT resolved
                palette, so the effect is visible before opening a file. */}
            <div
              className={`rounded-lg border px-3 py-2 font-mono text-[11.5px] leading-relaxed overflow-x-auto ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#12161c] border-[#252d38]'
              }`}
            >
              <span className={effective.comment}>-- preview</span>{' '}
              <span className={effective.keyword}>local</span>{' '}
              <span className={effective.declaration}>t</span>{' '}
              <span className={effective.punctuation}>=</span>{' '}
              <span className={effective.bracket}>{'{'}</span>
              <span className={effective.number}>120</span>
              <span className={effective.punctuation}>,</span>{' '}
              <span className={effective.string}>&quot;RED&quot;</span>
              <span className={effective.punctuation}>,</span>{' '}
              <span className={effective.functionCall}>print</span>
              <span className={effective.bracket}>(</span>
              <span className={effective.global}>math</span>
              <span className={effective.punctuation}>.</span>
              <span className={effective.member}>max</span>
              <span className={effective.bracket}>(</span>
              <span className={effective.number}>1</span>
              <span className={effective.bracket}>)</span>
              <span className={effective.punctuation}>;</span>{' '}
              <span className={effective.keyword}>end</span>
            </div>

            {/* Per-token overrides */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-medium ${isLight ? 'text-slate-700' : 'text-[#a2b4c7]'}`}>
                  Custom colors{overrideCount > 0 ? ` (${overrideCount} changed)` : ''}:
                </span>
                {overrideCount > 0 && (
                  <button
                    type="button"
                    onClick={clearAllOverrides}
                    className={`text-[10.5px] px-2 py-0.5 rounded font-mono border flex items-center gap-1 transition-colors ${
                      isLight
                        ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                        : 'bg-[#252d3a] hover:bg-[#313b4c] border-[#384354] text-[#cfdbe8]'
                    }`}
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset all</span>
                  </button>
                )}
              </div>
              {SYNTAX_TOKENS.map(({ key, label, sample }) => {
                const override = activeOverrides[key];
                const isOverridden = isValidSwatch(override);
                return (
                  <div
                    key={key}
                    className={`flex items-center gap-2 px-2 py-1 rounded border ${
                      isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#171b22] border-[#28313e]'
                    }`}
                  >
                    <span
                      className={`text-[10.5px] w-28 shrink-0 truncate ${isLight ? 'text-slate-600' : 'text-[#8f9faf]'}`}
                      title={label}
                    >
                      {label}
                    </span>
                    <span className={`font-mono text-[11px] flex-1 truncate ${effective[key]}`}>
                      {sample}
                    </span>
                    <select
                      value={isOverridden ? override : 'preset'}
                      onChange={(e) => setOverride(key, e.target.value)}
                      className={`shrink-0 text-[10.5px] font-mono px-1.5 py-1 rounded border focus:outline-none focus:border-amber-500 transition-colors max-w-[104px] ${
                        isLight
                          ? 'bg-white border-slate-300 text-slate-800'
                          : 'bg-[#1f242c] border-[#2e3745] text-[#d6e3f0]'
                      }`}
                    >
                      <option value="preset">
                        {isOverridden ? 'Custom' : swatchLabel(effective[key].split(' ')[0])}
                      </option>
                      {THEME_SWATCHES.map((sw) => (
                        <option key={sw} value={sw}>
                          {swatchLabel(sw)}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
            <p className={`text-[10px] leading-relaxed ${isLight ? 'text-slate-500' : 'text-[#6c7d91]'}`}>
              Colors come from a fixed list, so every one of them is guaranteed to render. Dark and
              light overrides are stored separately, because a color that reads well on the dark
              editor is often unreadable on the light one.
            </p>
          </div>
          )}

          {tab === 'general' && (
            <>
          {/* 2. Font Size & Line Spacing */}
          <div className="space-y-3">
            <label className="font-semibold uppercase tracking-wider text-[11px] text-amber-500 flex items-center gap-1.5">
              <Type className="w-3.5 h-3.5" />
              <span>Typography &amp; Code Spacing</span>
            </label>

            {/* Font Size */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className={isLight ? 'text-slate-600' : 'text-[#8f9faf]'}>Editor Font Size:</span>
                <span className="font-mono font-bold text-amber-500">{config.fontSize}px</span>
              </div>
              <div className="flex items-center gap-1.5">
                {[11, 12, 13, 14, 16, 18, 20].map((size) => (
                  <button
                    key={size}
                    onClick={() => onUpdateConfig({ ...config, fontSize: size })}
                    className={`flex-1 py-1 rounded text-center font-mono text-[11px] transition-colors border ${
                      config.fontSize === size
                        ? 'bg-amber-500 text-slate-950 font-bold border-amber-600'
                        : isLight
                        ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                        : 'bg-[#20252e] hover:bg-[#2b3340] border-[#2d3542] text-[#9bb0c4]'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Line Height */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className={isLight ? 'text-slate-600' : 'text-[#8f9faf]'}>Line Spacing (Height):</span>
                <span className="font-mono font-bold text-amber-500">{config.lineHeight}x</span>
              </div>
              <div className="flex items-center gap-1.5">
                {[
                  { label: 'Compact', val: 1.25 },
                  { label: 'Normal', val: 1.5 },
                  { label: 'Relaxed', val: 1.75 },
                  { label: 'Double', val: 2.0 },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={() => onUpdateConfig({ ...config, lineHeight: item.val })}
                    className={`flex-1 py-1 px-1 rounded text-center text-[10.5px] transition-colors border ${
                      config.lineHeight === item.val
                        ? 'bg-amber-500 text-slate-950 font-bold border-amber-600'
                        : isLight
                        ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                        : 'bg-[#20252e] hover:bg-[#2b3340] border-[#2d3542] text-[#9bb0c4]'
                    }`}
                  >
                    {item.label} ({item.val})
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 3. Startup Auto-Load Configuration */}
          <div className="space-y-3">
            <label className="font-semibold uppercase tracking-wider text-[11px] text-amber-500 flex items-center gap-1.5">
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Startup &amp; Auto-Load Behavior</span>
            </label>

            {/* Auto-Load Example Mod on Startup */}
            <div className="space-y-1">
              <label className={`text-[11px] ${isLight ? 'text-slate-600' : 'text-[#8f9faf]'}`}>
                Auto-Load Script / Mod on Launch:
              </label>
              <select
                value={config.autoLoadModId}
                onChange={(e) => onUpdateConfig({ ...config, autoLoadModId: e.target.value })}
                className={`w-full py-1.5 px-2.5 rounded text-xs border focus:outline-none focus:border-amber-500 transition-colors ${
                  isLight
                    ? 'bg-slate-50 border-slate-300 text-slate-800'
                    : 'bg-[#1f242c] border-[#2e3745] text-[#d6e3f0]'
                }`}
              >
                <option value="">Default blank template (mod.lua)</option>
                {existingMods.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.id})
                  </option>
                ))}
              </select>
            </div>

            {/* §35: ONE folder for everything on disk.
                This block replaces two separate path fields ("Auto-Open Mod
                Directory" and "Mods Folder"), which described the same tree -- the
                first pointed at a mod, the second at its parent. There is now one
                path plus a plain mod NAME below it. */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className={`text-[11px] font-medium ${isLight ? 'text-slate-700' : 'text-[#a2b4c7]'}`}>
                  Mods Folder (one subfolder per mod):
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleBrowseModsFolder}
                    className={`text-[10.5px] px-2 py-0.5 rounded font-mono border flex items-center gap-1 transition-colors ${
                      isLight
                        ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                        : 'bg-[#252d3a] hover:bg-[#313b4c] border-[#384354] text-[#cfdbe8]'
                    }`}
                    title="Select the folder that contains your mod subfolders"
                  >
                    <FolderOpen className="w-3 h-3 text-amber-500" />
                    <span>Browse...</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleTestModsFolder}
                    className={`text-[10.5px] px-2 py-0.5 rounded font-mono border flex items-center gap-1 transition-colors ${
                      isLight
                        ? 'bg-amber-100 hover:bg-amber-200 border-amber-300 text-amber-900'
                        : 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/40 text-amber-300'
                    }`}
                  >
                    <Search className="w-3 h-3" />
                    <span>Test / Scan Path</span>
                  </button>
                </div>
              </div>

              <input
                type="text"
                placeholder="e.g. D:\Worms Armageddon\Mods"
                value={config.modsRootPath}
                onChange={(e) => {
                  onUpdateConfig({ ...config, modsRootPath: e.target.value });
                  if (modsTestStatus.type) setModsTestStatus({ type: null, msg: '' });
                }}
                className={`w-full py-1.5 px-2.5 rounded text-xs font-mono border focus:outline-none focus:border-amber-500 transition-colors ${
                  isLight
                    ? 'bg-slate-50 border-slate-300 text-slate-800 placeholder-slate-400'
                    : 'bg-[#1f242c] border-[#2e3745] text-[#d6e3f0] placeholder-[#576475]'
                }`}
              />

              {modsTestStatus.type && (
                <div
                  className={`p-2 rounded text-[11px] font-mono border ${
                    modsTestStatus.type === 'success'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : modsTestStatus.type === 'loading'
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                  }`}
                >
                  {modsTestStatus.msg}
                </div>
              )}

              {/* The startup mod is a NAME, resolved against the folder above. */}
              <div className="pt-1">
                <label className={`block text-[11px] font-medium ${isLight ? 'text-slate-700' : 'text-[#a2b4c7]'}`}>
                  Open on startup (mod subfolder name):
                </label>
                <input
                  type="text"
                  placeholder="e.g. bee  -- or leave empty to open nothing"
                  value={config.startupModFolder}
                  onChange={(e) => onUpdateConfig({ ...config, startupModFolder: e.target.value })}
                  className={`w-full mt-1 py-1.5 px-2.5 rounded text-xs font-mono border focus:outline-none focus:border-amber-500 transition-colors ${
                    isLight
                      ? 'bg-slate-50 border-slate-300 text-slate-800 placeholder-slate-400'
                      : 'bg-[#1f242c] border-[#2e3745] text-[#d6e3f0] placeholder-[#576475]'
                  }`}
                />
              </div>

              <p className={`text-[10px] leading-relaxed ${isLight ? 'text-slate-500' : 'text-[#6c7d91]'}`}>
                One path for everything: point this at the folder containing your mod
                subfolders, then name the one to open on launch. Paths with spaces are fine
                (e.g. <span className="font-mono text-amber-500">D:\Worms Armageddon\Mods</span>).
                Moving your mods folder will not break the startup setting.
              </p>
            </div>

            {/* ----- Mods-list launch screen ----- */}
            {/* §35: the folder path, Browse/Test and status box now live in the ONE
                block above. Only the launch-mode toggle remains here. */}
            <div className="space-y-1.5 pt-1">
              {/* Startup behaviour toggle */}
              <div className="pt-1 space-y-1.5">
                <label className={`block text-[11px] font-medium ${isLight ? 'text-slate-700' : 'text-[#a2b4c7]'}`}>
                  On Startup:
                </label>
                <div className="flex items-center gap-1.5">
                  {([
                    { value: 'lastFile', label: 'Resume last file' },
                    { value: 'modsList', label: 'Show mods list' },
                  ] as const).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => onUpdateConfig({ ...config, launchMode: opt.value })}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors ${
                        config.launchMode === opt.value
                          ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold border-amber-500'
                          : isLight
                          ? 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
                          : 'bg-[#252d3a] hover:bg-[#313b4c] text-[#a2b4c7] border-[#384354]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className={`text-[10px] leading-relaxed ${isLight ? 'text-slate-500' : 'text-[#6c7d91]'}`}>
                  "Show mods list" displays a grid of every subfolder containing a{' '}
                  <span className="font-mono text-amber-500">mod.toml</span>. Needs a Mods Folder above.
                </p>
              </div>
            </div>

            {/* Storage Location Info */}
            <div className={`p-2.5 rounded-lg border text-[11px] flex items-start gap-2 ${
              isLight ? 'bg-amber-50/80 border-amber-200/80 text-amber-900' : 'bg-[#151920] border-[#293240] text-[#9bb0c4]'
            }`}>
              <Database className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-semibold text-amber-500">Config Storage Location:</span>
                <p className="text-[10.5px] leading-normal opacity-90">
                  Settings are automatically saved to your system's persistent client storage (<span className="font-mono">localStorage</span>, located in <span className="font-mono">%LOCALAPPDATA%</span> on Windows WebView2 / Tauri desktop). You can also export or import <span className="font-mono">.ini</span> and <span className="font-mono">.json</span> files anytime below.
                </p>
              </div>
            </div>

            {/* Custom Verbs (custom_verbs.cfg) */}
            <div className={`p-2.5 rounded-lg border text-[11px] space-y-2 ${
              isLight ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-[#151920] border-[#293240] text-[#9bb0c4]'
            }`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Custom Verbs ({customVerbs.length})</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleExportVerbs}
                    title="Download the registered verb list as custom_verbs.cfg"
                    className={`px-2 py-1 rounded border flex items-center gap-1 text-[10.5px] font-medium transition-colors ${
                      isLight
                        ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-700'
                        : 'bg-[#20252e] hover:bg-[#2b3341] border-[#2e3745] text-[#b0c0d2]'
                    }`}
                  >
                    <Download className="w-3 h-3 text-amber-400" />
                    <span>Export .cfg</span>
                  </button>
                  <label
                    className={`px-2 py-1 rounded border flex items-center gap-1 text-[10.5px] font-medium cursor-pointer transition-colors ${
                      isLight
                        ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-700'
                        : 'bg-[#20252e] hover:bg-[#2b3341] border-[#2e3745] text-[#b0c0d2]'
                    }`}
                  >
                    <Upload className="w-3 h-3 text-emerald-400" />
                    <span>Import .cfg</span>
                    <input
                      ref={verbFileInputRef}
                      type="file"
                      accept=".cfg,.json,application/json"
                      onChange={handleImportVerbsFile}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
              <p className="text-[10.5px] leading-normal">
                Verbs registered with <span className="font-mono text-amber-500">+ Register Verb</span> live in{' '}
                <span className="font-mono text-amber-500">{VERB_FILE_NAME}</span>
                {verbFilePath ? (
                  <>
                    {' '}at <span className="font-mono break-all">{verbFilePath}</span>
                  </>
                ) : (
                  <> in this app's local storage (no disk path on this platform)</>
                )}
                . They feed the checker, the API tree and autocomplete. Export hands you the file to edit or share; Import merges a file into the list above.
              </p>
              {verbImportStatus && (
                <div
                  className={`p-1.5 rounded border text-[10.5px] ${
                    verbImportStatus.startsWith('Imported')
                      ? isLight
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : isLight
                      ? 'bg-rose-50 border-rose-200 text-rose-700'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                  }`}
                >
                  {verbImportStatus}
                </div>
              )}
            </div>
          </div>

          {/* 4. Layout Dimensions & Reset */}
          <div className="space-y-2">
            <label className="font-semibold uppercase tracking-wider text-[11px] text-amber-500 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5" />
                <span>Resizable Panes State</span>
              </span>
              <button
                type="button"
                onClick={handleReset}
                className="text-[10px] text-rose-400 hover:underline flex items-center gap-1"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                <span>Reset to Defaults</span>
              </button>
            </label>
            <div className={`p-2.5 rounded-lg border text-[11px] flex justify-between gap-4 ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#171b22] border-[#28313e]'
            }`}>
              <div>
                <span className={isLight ? 'text-slate-500' : 'text-[#697b8f]'}>Sidebar: </span>
                <span className="font-mono font-semibold">{config.sidebarWidth}px</span>
              </div>
              <div>
                <span className={isLight ? 'text-slate-500' : 'text-[#697b8f]'}>Tree Height: </span>
                <span className="font-mono font-semibold">{config.treeHeightPercent}%</span>
              </div>
              <div>
                <span className={isLight ? 'text-slate-500' : 'text-[#697b8f]'}>Console: </span>
                <span className="font-mono font-semibold">{config.consoleHeight}px</span>
              </div>
            </div>
          </div>
            </>
          )}
        </div>

        {/* Footer with Config Export/Import Actions */}
        <div
          className={`px-5 py-3 border-t flex items-center justify-between gap-2 text-xs ${
            isLight ? 'bg-slate-100 border-slate-200' : 'bg-[#13161c] border-[#252c37]'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleExportIni}
              title="Download config as .ini file"
              className={`px-2.5 py-1 rounded border flex items-center gap-1 text-[11px] font-medium transition-colors ${
                isLight
                  ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-700'
                  : 'bg-[#20252e] hover:bg-[#2b3341] border-[#2e3745] text-[#b0c0d2]'
              }`}
            >
              <Download className="w-3 h-3 text-amber-400" />
              <span>Export .ini</span>
            </button>
            <button
              onClick={handleExportJson}
              title="Download config as .json file"
              className={`px-2.5 py-1 rounded border flex items-center gap-1 text-[11px] font-medium transition-colors ${
                isLight
                  ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-700'
                  : 'bg-[#20252e] hover:bg-[#2b3341] border-[#2e3745] text-[#b0c0d2]'
              }`}
            >
              <Download className="w-3 h-3 text-sky-400" />
              <span>Export .json</span>
            </button>
            <label
              className={`px-2.5 py-1 rounded border flex items-center gap-1 text-[11px] font-medium cursor-pointer transition-colors ${
                isLight
                  ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-700'
                  : 'bg-[#20252e] hover:bg-[#2b3341] border-[#2e3745] text-[#b0c0d2]'
              }`}
            >
              <Upload className="w-3 h-3 text-emerald-400" />
              <span>Import Config</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".ini,.json"
                onChange={handleImportFile}
                className="hidden"
              />
            </label>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors shadow-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
