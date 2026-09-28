import React, { useRef, useState } from 'react';
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
} from 'lucide-react';
import { EditorConfig, DEFAULT_CONFIG, exportConfigAsIni, parseIniConfig } from '../services/config';
import { cleanFolderPath, loadFolderFromPath, pickFolder, isDesktop } from '../services/modFolder';
import { ModFolderInfo } from '../types/wormforge';

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: EditorConfig;
  onUpdateConfig: (newConfig: EditorConfig) => void;
  existingMods: ModFolderInfo[];
}

export const ConfigModal: React.FC<ConfigModalProps> = ({
  isOpen,
  onClose,
  config,
  onUpdateConfig,
  existingMods,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [testStatus, setTestStatus] = useState<{ type: 'success' | 'error' | 'loading' | null; msg: string }>({ type: null, msg: '' });

  if (!isOpen) return null;

  const isLight = config.theme === 'light';

  const handleBrowseFolder = async () => {
    try {
      const picked = await pickFolder();
      if (!picked) return;
      onUpdateConfig({ ...config, autoLoadFolder: picked });
      setTestStatus({ type: 'loading', msg: `Scanning "${picked}"...` });
      const res = await loadFolderFromPath(picked);
      if (!res) {
        setTestStatus({ type: 'error', msg: 'Could not access folder.' });
        return;
      }
      const count = Object.keys(res.files).length;
      setTestStatus({
        type: 'success',
        msg: `Found ${count} mod file(s) in "${res.name}"!`,
      });
    } catch (err: any) {
      setTestStatus({
        type: 'error',
        msg: err?.message || String(err),
      });
    }
  };

  const handleTestFolder = async () => {
    const raw = config.autoLoadFolder;
    if (!raw.trim()) {
      setTestStatus({ type: 'error', msg: 'Please enter a directory path first.' });
      return;
    }
    const clean = cleanFolderPath(raw);
    setTestStatus({ type: 'loading', msg: `Testing path "${clean}"...` });
    try {
      const res = await loadFolderFromPath(clean);
      if (!res) {
        setTestStatus({ type: 'error', msg: 'Could not access folder.' });
        return;
      }
      const count = Object.keys(res.files).length;
      setTestStatus({
        type: 'success',
        msg: `Success: Found ${count} mod file(s) in "${res.name}"!`,
      });
    } catch (err: any) {
      setTestStatus({
        type: 'error',
        msg: err?.message || String(err),
      });
    }
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

        {/* Settings Body */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1 text-xs">
          {/* 1. Theme Selection */}
          <div className="space-y-2">
            <label className="font-semibold uppercase tracking-wider text-[11px] text-amber-500 flex items-center gap-1.5">
              <span>Theme &amp; Appearance</span>
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

            {/* Custom Startup Directory Path */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className={`text-[11px] font-medium ${isLight ? 'text-slate-700' : 'text-[#a2b4c7]'}`}>
                  Auto-Open Mod Directory (Disk path):
                </label>
                <div className="flex items-center gap-1.5">
                  {isDesktop() && (
                    <button
                      type="button"
                      onClick={handleBrowseFolder}
                      className={`text-[10.5px] px-2 py-0.5 rounded font-mono border flex items-center gap-1 transition-colors ${
                        isLight
                          ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                          : 'bg-[#252d3a] hover:bg-[#313b4c] border-[#384354] text-[#cfdbe8]'
                      }`}
                      title="Select folder using native Windows picker"
                    >
                      <FolderOpen className="w-3 h-3 text-amber-500" />
                      <span>Browse...</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleTestFolder}
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

              <div className="relative">
                <input
                  type="text"
                  placeholder="e.g. D:\Worms Armageddon\Mods or /home/user/mods"
                  value={config.autoLoadFolder}
                  onChange={(e) => {
                    onUpdateConfig({ ...config, autoLoadFolder: e.target.value });
                    if (testStatus.type) setTestStatus({ type: null, msg: '' });
                  }}
                  className={`w-full py-1.5 px-2.5 rounded text-xs font-mono border focus:outline-none focus:border-amber-500 transition-colors ${
                    isLight
                      ? 'bg-slate-50 border-slate-300 text-slate-800 placeholder-slate-400'
                      : 'bg-[#1f242c] border-[#2e3745] text-[#d6e3f0] placeholder-[#576475]'
                  }`}
                />
              </div>

              {testStatus.type && (
                <div
                  className={`p-2 rounded text-[11px] font-mono border ${
                    testStatus.type === 'success'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : testStatus.type === 'loading'
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                  }`}
                >
                  {testStatus.msg}
                </div>
              )}

              <p className={`text-[10px] leading-relaxed ${isLight ? 'text-slate-500' : 'text-[#6c7d91]'}`}>
                Supports paths with spaces (e.g. <span className="font-mono text-amber-500">D:\Worms Armageddon\Mods</span>) and surrounding quotes. Automatically loads mod packages on launch when running locally.
              </p>
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
