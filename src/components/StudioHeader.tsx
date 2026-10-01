import React, { useState } from 'react';
import {
  FileCode,
  Sparkles,
  Settings,
  ChevronDown,
  Layers,
  LayoutGrid,
} from 'lucide-react';

interface StudioHeaderProps {
  activeFile: string;
  onSelectFile: (file: string) => void;
  openFiles: string[];
  onCloseFile: (file: string) => void;
  onLoadTemplate: (templateId: string) => void;
  onOpenConfig: () => void;
  // Shown only when a mods root is configured. Lets the user get back to the
  // mods grid from the editor without opening Config.
  onOpenModsList?: () => void;
  isLight?: boolean;
}

export const StudioHeader: React.FC<StudioHeaderProps> = ({
  activeFile,
  onSelectFile,
  openFiles,
  onCloseFile,
  onLoadTemplate,
  onOpenConfig,
  onOpenModsList,
  isLight = false,
}) => {
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);

  return (
    <header
      className={`border-b text-xs select-none transition-colors ${
        isLight
          ? 'bg-slate-100 border-slate-300 text-slate-800'
          : 'bg-[#14171c] border-[#262c35] text-[#cfdbe8]'
      }`}
    >
      {/* Top Main Bar */}
      <div className="px-3 py-2 flex items-center justify-between gap-3">
        {/* Brand Zone */}
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-slate-950 font-bold shadow-md">
            W
          </div>
          <div>
            <h1 className="font-bold text-[13px] tracking-tight flex items-center gap-1.5">
              <span className={isLight ? 'text-slate-900 font-extrabold' : 'text-[#e4edf7]'}>
                WormForge Code Studio
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-500 font-mono border border-amber-500/30">
                v0.8.22 dev
              </span>
            </h1>
          </div>
        </div>

        {/* Center: Active Document Status Indicator */}
        <div className="hidden md:flex items-center gap-2">
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-mono ${
              isLight
                ? 'bg-white border-slate-200 text-slate-600'
                : 'bg-[#1b2028] border-[#2a3340] text-[#899cb2]'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            <span className="opacity-75">Active Mod File:</span>
            <span className="font-semibold text-amber-500">{activeFile}</span>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          {/* Quick Preset Selector */}
          <div className="relative">
            <button
              onClick={() => setIsTemplatesOpen(!isTemplatesOpen)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded border font-medium transition-colors shadow-xs ${
                isLight
                  ? 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
                  : 'bg-[#20252e] hover:bg-[#2a313d] text-[#c9d7e6] border-[#2e3745]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Load Mod / Script</span>
              <ChevronDown className="w-3 h-3 text-[#708094]" />
            </button>

            {isTemplatesOpen && (
              <div
                className={`absolute right-0 mt-1 w-68 rounded-md shadow-2xl py-1 z-50 text-xs max-h-96 overflow-y-auto border divide-y ${
                  isLight
                    ? 'bg-white border-slate-300 text-slate-800 divide-slate-100'
                    : 'bg-[#1a1e26] border-[#313a48] text-[#d4e0ed] divide-[#222834]'
                }`}
              >
                {/* 0.7 & 0.8.22 Gameplay & Rules Section */}
                <div
                  className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider flex items-center justify-between ${
                    isLight ? 'bg-amber-50 text-amber-800' : 'bg-[#212631] text-amber-400'
                  }`}
                >
                  <span>★ Rules &amp; Gameplay Packs</span>
                  <span className="text-[9px] px-1 bg-amber-500/20 text-amber-600 rounded">v0.8.22</span>
                </div>
                {[
                  { id: 'gameplay.highlander_full', name: 'Highlander (Full PX Scheme)', badge: '0rang3' },
                  { id: 'gameplay.highlander.verbs', name: 'Highlander (Verb-Based)', badge: 'Verbs' },
                  { id: 'gameplay.highlander.pure', name: 'Highlander (Pure Lua Ref)', badge: 'Pure' },
                  { id: 'gameplay.kill_the_king', name: 'Kill the King (KTK)', badge: 'KTK' },
                  { id: 'gameplay.ex_turn_side', name: 'ExTurnSide', badge: 'Facing' },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      onLoadTemplate(m.id);
                      setIsTemplatesOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 flex items-center justify-between transition-colors ${
                      isLight
                        ? 'hover:bg-amber-50/70 text-slate-800'
                        : 'hover:bg-[#252c38] text-amber-200/90 hover:text-white'
                    }`}
                  >
                    <span className="font-medium truncate">{m.name}</span>
                    <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-amber-500/20 text-amber-600 ml-1">
                      {m.badge}
                    </span>
                  </button>
                ))}

                {/* Weapons & Actor Mods Section */}
                <div
                  className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                    isLight ? 'bg-slate-50 text-slate-500' : 'bg-[#14171d] text-[#637488]'
                  }`}
                >
                  Weapons &amp; Actor Mods
                </div>
                {[
                  { id: 'example.bee', name: 'Keeper Bee (CBee Mine)', badge: 'PX Port' },
                  { id: 'example.saw', name: 'Saw (Proximity)' },
                  { id: 'example.sentry_gun', name: 'Sentry Gun' },
                  { id: 'example.worm_toss', name: 'Worm Toss' },
                  { id: 'example.pooz', name: 'POOZ Runner' },
                  { id: 'example.wormcraft', name: 'WormCraft' },
                  { id: 'example.turret', name: 'Turret' },
                  { id: 'example.hurt_lab', name: 'Ten (Hurt Lab)' },
                  { id: 'example.gif_donkey', name: 'Growth Hormones' },
                  { id: 'example.q_bazooka', name: 'Q Bazooka' },
                  { id: 'example.mine_emit', name: 'Echo Mine' },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      onLoadTemplate(m.id);
                      setIsTemplatesOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-1 flex items-center justify-between transition-colors ${
                      isLight
                        ? 'hover:bg-slate-100 text-slate-700 hover:text-slate-900'
                        : 'hover:bg-[#242b36] text-[#bccadb] hover:text-white'
                    }`}
                  >
                    <span className="truncate">{m.name}</span>
                    {m.badge && (
                      <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-amber-500/20 text-amber-500 ml-1">
                        {m.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Mods Grid Button - only when a mods root is configured, so it never
              appears for users who have not opted into the feature. */}
          {onOpenModsList && (
            <button
              onClick={onOpenModsList}
              title="Back to mods list"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded font-medium border transition-colors shadow-xs ${
                isLight
                  ? 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
                  : 'bg-[#20252e] hover:bg-[#2a313d] text-[#c9d7e6] border-[#2e3745]'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5 text-amber-500" />
              <span>Mods</span>
            </button>
          )}

          {/* Config / Settings Button */}
          <button
            onClick={onOpenConfig}
            title="Open Editor Settings (Font size, Spacing, Light Mode, Startup Folder)"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded font-medium border transition-colors shadow-xs ${
              isLight
                ? 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
                : 'bg-[#20252e] hover:bg-[#2a313d] text-[#c9d7e6] border-[#2e3745]'
            }`}
          >
            <Settings className="w-3.5 h-3.5 text-amber-500" />
            <span>Config</span>
          </button>
        </div>
      </div>

      {/* Editor Tabs Bar */}
      <div
        className={`px-2 flex items-center gap-1 overflow-x-auto border-t ${
          isLight ? 'bg-slate-200 border-slate-300' : 'bg-[#101317] border-[#1e232c]'
        }`}
      >
        {openFiles.map((file) => (
          <div
            key={file}
            onClick={() => onSelectFile(file)}
            className={`group flex items-center gap-1.5 px-3 py-1.5 border-r cursor-pointer text-xs font-mono transition-colors ${
              activeFile === file
                ? isLight
                  ? 'bg-white text-amber-700 font-bold border-t-2 border-t-amber-500 border-r-slate-300 shadow-xs'
                  : 'bg-[#111418] text-amber-300 font-semibold border-t-2 border-t-amber-400 border-r-[#1e232c]'
                : isLight
                ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 border-r-slate-300'
                : 'text-[#6c7d92] hover:text-[#a9bacd] hover:bg-[#15191f] border-r-[#1e232c]'
            }`}
          >
            <FileCode className="w-3.5 h-3.5 opacity-80" />
            <span>{file}</span>
            {openFiles.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseFile(file);
                }}
                className="opacity-0 group-hover:opacity-100 hover:text-rose-500 p-0.5 ml-1 transition-opacity"
              >
                &times;
              </button>
            )}
          </div>
        ))}
      </div>
    </header>
  );
};
