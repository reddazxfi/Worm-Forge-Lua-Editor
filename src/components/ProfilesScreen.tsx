import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  FileText,
  Package,
  RefreshCw,
  Sliders,
  Zap,
} from 'lucide-react';
import type { InstalledProfile } from '../services/profilesFolder';
import type { ModsListTile } from './ModsListScreen';
import { bundledBy, linkFeatures, type ComponentSource, type FeatureLink } from '../services/profile';
import type { AppSurfaces } from '../services/appTheme';

interface ProfilesScreenProps {
  /** `WormForge/Profiles`, derived from the mods folder. '' when it cannot be derived. */
  profilesRoot: string;
  profiles: InstalledProfile[];
  /** True once a scan has completed and `profiles` is authoritative. */
  loaded: boolean;
  error: string | null;
  /** Installed mods, for turning a feature id into a file. */
  mods: ModsListTile[];
  isLight?: boolean;
  surface?: AppSurfaces;
  onBack: () => void;
  onRefresh: () => void;
  onOpenConfig: () => void;
}

/**
 * Profiles installed under `WormForge/Profiles`.
 *
 * READ-ONLY, on purpose. A profile lives OUTSIDE the opened mod folder, and every
 * save path in the editor is rooted at that folder (`saveModFile(root, rel)`), so
 * making this editable without a second root would write a global profile inside
 * whatever mod happened to be open. That is the exact failure the plan warns
 * about, and it is worse than not editing: the user would think they edited the
 * copy the loader reads. Editing global profiles needs a root-aware buffer of its
 * own, which is a separate change; until then this screen shows the text, tells
 * you where it is, and leaves the file alone.
 */
export const ProfilesScreen: React.FC<ProfilesScreenProps> = ({
  profilesRoot,
  profiles,
  loaded,
  error,
  mods,
  isLight = false,
  surface,
  onBack,
  onRefresh,
  onOpenConfig,
}) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const components = useMemo<ComponentSource[]>(() => {
    const out: ComponentSource[] = [];
    for (const mod of mods) {
      for (const c of mod.components ?? []) {
        if (!c.id) continue;
        out.push({
          modId: mod.id,
          modFolder: mod.folderName,
          componentId: c.id,
          type: c.type,
          entry: c.entry,
        });
      }
    }
    return out;
  }, [mods]);

  const muted = isLight ? 'text-slate-500' : 'text-[#7e8fa3]';
  const chip = isLight
    ? 'bg-slate-100 text-slate-700 border-slate-300'
    : 'bg-[#202631] text-[#b9cadb] border-[#2e3745]';

  const featureRow = (link: FeatureLink) => {
    if (!link.source) {
      // The engine's own profile screen calls this "Not installed"; guessing a
      // file here would point at the wrong component.
      return (
        <div
          key={link.id}
          title={`No installed mod declares the component "${link.id}".`}
          className={`flex items-center gap-1.5 text-[11px] rounded px-1.5 py-0.5 ${
            isLight ? 'bg-rose-50 text-rose-700' : 'bg-rose-500/10 text-rose-300'
          }`}
        >
          <AlertTriangle className="w-3 h-3 shrink-0" />
          <span className="font-mono truncate">{link.id}</span>
          <span className="ml-auto shrink-0 text-[10px]">not installed</span>
        </div>
      );
    }
    return (
      <div
        key={link.id}
        title={`${link.source.componentId} is declared by ${link.source.modId}`}
        className={`flex items-center gap-1.5 text-[11px] rounded px-1.5 py-0.5 border ${chip}`}
      >
        <Zap className="w-3 h-3 shrink-0 text-amber-500" />
        <span className="font-mono truncate">{link.id}</span>
        <span className="ml-auto shrink-0 text-[10px] font-mono opacity-80 truncate max-w-[45%]">
          {link.source.modId}
          {link.source.entry ? ` · ${link.source.entry}` : ''}
        </span>
      </div>
    );
  };

  return (
    <div
      style={surface ? { backgroundColor: surface.app } : undefined}
      className={`h-full flex flex-col select-none transition-colors ${
        isLight ? 'bg-slate-100 text-slate-800' : 'bg-[#0e1115] text-[#cfdbe8]'
      }`}
    >
      <div
        style={surface ? { backgroundColor: surface.header } : undefined}
        className={`px-4 py-3 border-b flex items-center gap-3 shrink-0 transition-colors ${
          isLight ? 'bg-white border-slate-300' : 'bg-[#171b21] border-[#242b35]'
        }`}
      >
        <button
          onClick={onBack}
          title="Back to the mod list"
          className={`flex items-center gap-1 px-2 py-1.5 rounded border text-[11px] font-medium shrink-0 transition-colors ${
            isLight
              ? 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
              : 'bg-[#202631] hover:bg-[#2b3341] text-[#93a6bd] border-[#2e3745]'
          }`}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Mods</span>
        </button>

        <Sliders className={`w-5 h-5 shrink-0 ${isLight ? 'text-amber-600' : 'text-amber-500'}`} />

        <div className="min-w-0">
          <h1 className={`font-bold text-sm truncate ${isLight ? 'text-slate-900' : 'text-[#e4edf7]'}`}>
            Installed Profiles
          </h1>
          <p className={`text-[11px] truncate ${muted}`} title={profilesRoot}>
            {loaded ? `${profiles.length} profile${profiles.length === 1 ? '' : 's'}` : 'Reading…'}
            {profilesRoot ? ` · ${profilesRoot}` : ' · no profiles folder could be derived'}
          </p>
        </div>

        <div className="flex items-center gap-2 ml-auto shrink-0">
          <button
            onClick={onRefresh}
            title="Rescan WormForge/Profiles"
            className={`p-1.5 rounded border transition-colors ${
              isLight
                ? 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
                : 'bg-[#202631] hover:bg-[#2b3341] text-[#93a6bd] border-[#2e3745]'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onOpenConfig}
            className={`px-2.5 py-1.5 rounded border text-[11px] font-medium transition-colors ${
              isLight
                ? 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
                : 'bg-[#202631] hover:bg-[#2b3341] text-[#cfdbe8] border-[#2e3745]'
            }`}
          >
            Config
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {error && (
          <div
            className={`rounded border px-3 py-2 text-[11px] mb-4 ${
              isLight
                ? 'bg-rose-50 border-rose-300 text-rose-700'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            {error}
          </div>
        )}

        {loaded && profiles.length === 0 && !error && (
          <div
            className={`h-full flex flex-col items-center justify-center gap-2 text-center ${
              isLight ? 'text-slate-500' : 'text-[#5b6b7e]'
            }`}
          >
            <FileText className="w-8 h-8 opacity-50" />
            <p className="text-xs font-medium">No saved profiles.</p>
            <p className="text-[11px] max-w-md">
              Profiles ship inside a mod&apos;s <span className="font-mono">profiles/</span> folder and are
              copied here when the loader installs the pack. A mod that has none simply has no saved
              profile yet.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {profiles.map((p) => {
            const links = linkFeatures(p.summary.features, components);
            const bundled = bundledBy(p.name, mods);
            const isOpen = !!expanded[p.path];
            return (
              <div
                key={p.path}
                className={`rounded-lg border transition-colors ${
                  isLight ? 'bg-white border-slate-300' : 'bg-[#171b21] border-[#242b35]'
                }`}
              >
                <div className="p-3">
                  <div className="flex items-start gap-2">
                    <Sliders className={`w-4 h-4 mt-0.5 shrink-0 ${isLight ? 'text-amber-600' : 'text-amber-500'}`} />
                    <div className="min-w-0 flex-1">
                      <div className={`font-semibold text-[12.5px] truncate ${isLight ? 'text-slate-900' : 'text-[#e4edf7]'}`}>
                        {p.name}
                      </div>
                      <div className={`text-[10.5px] truncate ${muted}`} title={p.path}>
                        {p.path}
                      </div>
                    </div>
                    <button
                      onClick={() => setExpanded((prev) => ({ ...prev, [p.path]: !prev[p.path] }))}
                      className={`flex items-center gap-1 px-2 py-1 rounded border text-[10.5px] shrink-0 transition-colors ${chip}`}
                      title="Read-only: this file lives outside the opened mod folder"
                    >
                      {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      TOML
                    </button>
                  </div>

                  {p.summary.description && (
                    <p className={`mt-2 text-[11px] leading-snug ${isLight ? 'text-slate-600' : 'text-[#9fb0c3]'}`}>
                      {p.summary.description}
                    </p>
                  )}

                  <div className={`mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] ${muted}`}>
                    <span>
                      {p.summary.features.length} add-on{p.summary.features.length === 1 ? '' : 's'}
                    </span>
                    <span>{p.summary.weapons.length} weapon{p.summary.weapons.length === 1 ? '' : 's'}</span>
                    {p.summary.optionCount > 0 && <span>{p.summary.optionCount} option(s)</span>}
                    {p.summary.weaponSettingCount > 0 && (
                      <span>{p.summary.weaponSettingCount} weapon setting(s)</span>
                    )}
                    {p.summary.hasScheme && <span>own scheme</span>}
                    {p.summary.hasCrates && <span>crate odds</span>}
                    {p.summary.hasUtilityCrates && <span>utility crate weights</span>}
                  </div>

                  {links.length > 0 && <div className="mt-2 space-y-0.5">{links.map(featureRow)}</div>}

                  {/* Name-only link. The loader never overwrites an installed
                      profile, so the bundled copy and this one may have
                      diverged -- say "also bundled", never "same". */}
                  {bundled.length > 0 && (
                    <div className={`mt-2 flex items-start gap-1.5 text-[10.5px] ${muted}`}>
                      <Package className="w-3 h-3 mt-0.5 shrink-0" />
                      <span>
                        Also bundled by{' '}
                        {bundled.map((b, i) => (
                          <React.Fragment key={b.folderName}>
                            {i > 0 && ', '}
                            <span className={`font-mono ${isLight ? 'text-slate-700' : 'text-[#b9cadb]'}`}>
                              {b.id}
                            </span>
                          </React.Fragment>
                        ))}
                        . The installed copy is not necessarily the same contents.
                      </span>
                    </div>
                  )}

                  {p.summary.unknownSections.length > 0 && (
                    <div className={`mt-2 text-[10.5px] ${muted}`} title={p.summary.unknownSections.join('\n')}>
                      Not summarised: {p.summary.unknownSections.slice(0, 3).join(', ')}
                      {p.summary.unknownSections.length > 3
                        ? ` +${p.summary.unknownSections.length - 3} more`
                        : ''}
                      .
                    </div>
                  )}
                </div>

                {isOpen && (
                  <pre
                    className={`mx-3 mb-3 max-h-72 overflow-auto rounded border p-2 text-[10.5px] leading-snug font-mono whitespace-pre ${
                      isLight
                        ? 'bg-slate-50 border-slate-200 text-slate-700'
                        : 'bg-[#0e1115] border-[#242b35] text-[#9fb0c3]'
                    }`}
                  >
                    {p.text}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div
        style={surface ? { backgroundColor: surface.header } : undefined}
        className={`px-4 py-2 border-t text-[10.5px] shrink-0 transition-colors ${
          isLight ? 'bg-white border-slate-300 text-slate-500' : 'bg-[#14171c] border-[#242932] text-[#63758b]'
        }`}
      >
        Read-only. Edit a profile in-game, or edit the file directly at the path shown — profiles in{' '}
        <span className="font-mono">WormForge/Profiles</span> live outside the opened mod folder.
      </div>
    </div>
  );
};
