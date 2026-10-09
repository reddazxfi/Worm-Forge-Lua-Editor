import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  RefreshCw,
  Play,
  CheckCircle,
  Keyboard,
  Plus,
  Download,
  Upload,
  FileCode,
  AlignLeft,
  Layers,
  Terminal,
  BookOpen,
  FolderOpen,
  Save,
  Settings,
} from 'lucide-react';
import { StudioHeader } from './components/StudioHeader';
import { UpperCornerTree } from './components/UpperCornerTree';
import { DocPane } from './components/DocPane';
import { CodeEditor, CodeEditorHandle } from './components/CodeEditor';
import { ConsoleOutput } from './components/ConsoleOutput';
import { KeyboardReference } from './components/KeyboardReference';
import { EngineAdditionModal } from './components/EngineAdditionModal';
import { ConfigModal } from './components/ConfigModal';
import { UnsavedChangesModal } from './components/UnsavedChangesModal';
import { ModsListScreen, ModsListTile } from './components/ModsListScreen';
import { CreateModModal } from './components/CreateModModal';

import {
  CustomVerb,
  SyntaxDiagnostic,
} from './types/wormforge';
import {
  BUILTIN_CLASSES,
  BUILTIN_ENUMERATIONS,
  BUILTIN_FUNCTIONS,
  BUILTIN_VARIABLES,
} from './data/wormforgeDefinitions';
import { EXISTING_MODS } from './data/existingMods';
import { INITIAL_TEMPLATE } from './data/templates';
import { parseAndValidate } from './services/parser';
import {
  loadCustomVerbs,
  saveCustomVerbs,
  mergeCustomClasses,
  verbsForRust,
  verbToMember,
  serializeVerbsFile,
} from './services/customVerbs';
import { formatLua } from './services/formatLua';
import { compileWithEngine, parseWithAst, mergeExtractedSymbols, CheckEngine } from './services/luaCompiler';
import { mergeDiagnostics, countSeverities } from './services/diagnostics';
import { openModFolder, saveModFile, saveFileAs, cleanFolderPath, loadFolderFromPath, isDesktop, baseName, listModEntries, createModFolder, pickStartupFile } from './services/modFolder';
import { EditorConfig, loadConfig, saveConfig } from './services/config';
import { resetPersistedSession } from './services/session';

export default function App() {
  // Configuration State
  const [config, setConfig] = useState<EditorConfig>(() => loadConfig());
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);

  // Storage Keys for remembering last edited script and state
  const STORAGE_FILES_KEY = 'wormforge_last_files';
  const STORAGE_ACTIVE_FILE_KEY = 'wormforge_active_file';
  const STORAGE_OPEN_FILES_KEY = 'wormforge_open_files';
  const STORAGE_MOD_FOLDER_KEY = 'wormforge_mod_folder';
  const STORAGE_SAVED_FILES_KEY = 'wormforge_saved_files';

  // Files State with auto-restore on init
  const [files, setFiles] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_FILES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          return parsed;
        }
      }
    } catch {}
    return { 'mod.lua': INITIAL_TEMPLATE };
  });

  const [activeFile, setActiveFile] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_ACTIVE_FILE_KEY);
      const rawFiles = localStorage.getItem(STORAGE_FILES_KEY);
      const parsedFiles = rawFiles ? JSON.parse(rawFiles) : null;
      if (saved && parsedFiles && parsedFiles[saved] !== undefined) {
        return saved;
      }
    } catch {}
    return 'mod.lua';
  });

  const [openFiles, setOpenFiles] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_OPEN_FILES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return ['mod.lua'];
  });

  // Opened mod folder
  const [modFolder, setModFolder] = useState<{ name: string; root: string } | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_MOD_FOLDER_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  });

  // `savedFiles` is deliberately NOT persisted.
//
// It used to be written to localStorage in full, which meant storing a SECOND
// complete copy of every buffer (`wormforge_saved_files` alongside
// `wormforge_last_files`). Two copies of a 165 KB rules.lua plus the rest of a
// pack exceed the ~5 MB localStorage quota, so `setItem` threw
// QuotaExceededError, the bare `catch {}` swallowed it, and the value never
// persisted. On the next launch `savedFiles` came back as `{}`, every file
// compared `files[f] !== undefined`, and the unsaved-changes prompt fired on
// close every single time -- with nothing actually unsaved. That made the window
// impossible to close without Task Manager.
//
// It only ever needed to live for one session: "what did we write to disk during
// THIS run". So it starts from the restored buffer contents below and is never
// written. Opening a mod folder still resets both from disk via
// applyOpenedFolder(), which is the authoritative source.
const [savedFiles, setSavedFiles] = useState<Record<string, string>>(() => {
  // Seed from the buffers being restored. Without this, a restored session has
  // savedFiles = {} while `files` is populated, so every file compares
  // `files[f] !== undefined` and the unsaved-changes prompt fires on close with
  // nothing unsaved -- the exact symptom this whole comment block is about.
  //
  // Opening a mod folder still resets BOTH from disk via applyOpenedFolder(),
  // which is authoritative. This seed only covers a session restored from
  // localStorage, where disk state is genuinely unknown and nagging the user
  // about it is worse than the (unlikely) case of unsaved work carried over.
  try {
    const saved = localStorage.getItem(STORAGE_FILES_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
        return { ...parsed };
      }
    }
  } catch {}
  return {};
});

  // Reclaim the quota the old duplicate copy was holding.
  useEffect(() => {
    try {
      localStorage.removeItem(STORAGE_SAVED_FILES_KEY);
    } catch {}
  }, []);

  // Jump to Diagnostic Target Line/Column
  const [jumpTarget, setJumpTarget] = useState<{ line: number; column: number; key: number } | null>(null);

  // Imperative handle on the editor, used to insert snippets at the caret
  const editorRef = useRef<CodeEditorHandle>(null);

  // False until the startup auto-load has resolved and disk is authoritative.
  //
  // WHY THIS EXISTS
  // `files` seeds from localStorage, so the first render paints the PREVIOUS session's
  // buffers -- including edits that were never written to disk. The folder scan is async,
  // so that stale content was visible for a beat before being replaced, and worse, the
  // startup effect ran `runSyntaxCheck` against it, painting red diagnostics for text the
  // user had already discarded.
  //
  // Nothing is shown, and nothing is checked, until this is true. The editor is covered by
  // a neutral panel rather than conditionally re-rendered, so no existing layout is
  // restructured -- the same approach the mods-list screen already uses.
  const [sessionReady, setSessionReady] = useState(false);
  // Mirrors `sessionReady` for the compiler/syntax checker, which is a
  // useCallback and so cannot read the state without being re-created on every
  // flip. False until the startup auto-load resolves; until then runSyntaxCheck
  // returns immediately (see its guard).
  const bootedRef = useRef(false);
  // Set when a close was blocked because of unsaved changes
  const [pendingClose, setPendingClose] = useState(false);

  // ----- Mods-list launch screen state -----
  // 'launchMode === modsList' + a configured root shows the grid instead of
  // the editor on startup. listModEntries() is itself desktop-only and returns
  // null elsewhere, so the gating moved there rather than being duplicated here.
  const modsRootConfigured = !!cleanFolderPath(config.modsRootPath);
  const modsListEnabled = config.launchMode === 'modsList' && !!cleanFolderPath(config.modsRootPath);
  const [showModsList, setShowModsList] = useState(false);
  const [mods, setMods] = useState<ModsListTile[]>([]);
  const [modsLoading, setModsLoading] = useState(false);
  const [modsError, setModsError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Active Code
  const activeCode = files[activeFile] || '';

  // Persist files and active script across browser sessions.
  //
  // DEBOUNCED. This used to fire on every `files` change, which is every
  // keystroke: JSON.stringify of every open buffer (169 KB for highlander) plus a
  // synchronous localStorage write, on the critical path of typing. On a big file
  // that is the single largest per-keystroke cost in the app, and localStorage is
  // synchronous by spec -- the write blocks the main thread.
  //
  // 400ms is short enough that a crash loses at most a fraction of a second, and
  // long enough that typing never triggers more than one write.
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_FILES_KEY, JSON.stringify(files));
      } catch {}
    }, 400);
    // Clear on unmount so a pending write cannot fire against a dead component.
    return () => clearTimeout(id);
  }, [files]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_ACTIVE_FILE_KEY, activeFile);
    } catch {}
  }, [activeFile]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_OPEN_FILES_KEY, JSON.stringify(openFiles));
    } catch {}
  }, [openFiles]);

  useEffect(() => {
    try {
      if (modFolder) {
        localStorage.setItem(STORAGE_MOD_FOLDER_KEY, JSON.stringify(modFolder));
      } else {
        localStorage.removeItem(STORAGE_MOD_FOLDER_KEY);
      }
    } catch {}
  }, [modFolder]);

  // NOTE: `savedFiles` has no persistence effect on purpose -- see the useState
// declaration. Writing it was what exhausted the localStorage quota.

  // Engine Custom Classes state.
  //
  // The SOURCE OF TRUTH is the verb list, not a ClassDef[]: a verb is what the
  // modal emits, what custom_verbs.cfg stores, what both checkers read. The
  // class-view merges are derived from it via mergeCustomClasses -- they used
  // to be a second copy that dropped every verb landing on an existing class
  // (the dropped-verb bug), so nothing writes ClassDef[] anymore.
  const [customVerbs, setCustomVerbs] = useState<CustomVerb[]>([]);
  // Guards the persist effect: hydration is async (disk read over IPC), and a
  // save before it completes would write [] over the real cfg file on launch.
  const verbsHydratedRef = useRef(false);
  // What we last wrote (or last read). The debounced save compares against it
  // so hydration itself never triggers a redundant disk write.
  const verbsPersistedRef = useRef<string | null>(null);

  // Hydrate the verb list once: custom_verbs.cfg on disk first, then the
  // localStorage mirror. The refs are set BEFORE the state update so the
  // persist effect below sees "hydrated, unchanged" on the very first run
  // instead of writing [] over the file it is about to read.
  useEffect(() => {
    let cancelled = false;
    loadCustomVerbs()
      .then((verbs) => {
        if (cancelled) return;
        verbsPersistedRef.current = serializeVerbsFile(verbs);
        verbsHydratedRef.current = true;
        // An empty load leaves state untouched: [] already IS the state, and
        // setting a fresh array would fire the re-check effect below for a
        // no-op change.
        if (verbs.length === 0) return;
        setCustomVerbs(verbs);
        setLogs((prev) => [
          ...prev,
          {
            time: new Date().toLocaleTimeString(),
            text: `[Custom Verbs]: loaded ${verbs.length} registered verb(s) from custom_verbs.cfg.`,
            type: 'info',
          },
        ]);
      })
      // loadCustomVerbs degrades to [] on any failure; this is belt-and-braces
      // so a future throw cannot leave the app with hydration permanently off.
      .catch(() => {
        if (!cancelled) verbsHydratedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced persist (400 ms): every verb edit lands in custom_verbs.cfg on
  // desktop (+ always the localStorage mirror). Skipped before hydration, and
  // skipped when the serialized list matches what is already on disk -- so
  // opening the app does not rewrite the user's file.
  useEffect(() => {
    if (!verbsHydratedRef.current) return;
    const body = serializeVerbsFile(customVerbs);
    if (body === verbsPersistedRef.current) return;
    const timer = setTimeout(async () => {
      const { disk } = await saveCustomVerbs(customVerbs);
      verbsPersistedRef.current = body;
      // On desktop a cfg path exists, so disk:false is a real write failure
      // (permissions, locked file) -- say so rather than let the user trust a
      // save that did not happen. In the browser there is no disk by design.
      if (!disk && isDesktop()) {
        setLogs((prev) => [
          ...prev,
          {
            time: new Date().toLocaleTimeString(),
            text: `[Custom Verbs]: could not write custom_verbs.cfg to AppData (localStorage mirror was updated). Check file permissions.`,
            type: 'warn',
          },
        ]);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [customVerbs]);

  // Selected symbol for DocPane
  const [selectedSymbolItem, setSelectedSymbolItem] = useState<any>(() => BUILTIN_CLASSES[0]);

  // Diagnostics and Symbols from Parser
  const [diagnostics, setDiagnostics] = useState<SyntaxDiagnostic[]>([]);
  const [symbols, setSymbols] = useState(() => parseAndValidate(INITIAL_TEMPLATE).symbols);
  const [hasRunCheck, setHasRunCheck] = useState<boolean>(true);
  // Which checker produced the diagnostics above. The console says so, because a
  // clean pass from the game compiler and a clean pass from the built-in parser
  // are not the same claim. null = nothing checked yet.
  const [checkEngine, setCheckEngine] = useState<CheckEngine | null>(null);

  // Console Logs
  const [logs, setLogs] = useState<
    { time: string; text: string; type: 'info' | 'success' | 'warn' | 'error' }[]
  >([
    {
      time: new Date().toLocaleTimeString(),
      text: 'WormForge Code Studio initialized. Lockstep AST engine active.',
      type: 'info',
    },
    {
      time: new Date().toLocaleTimeString(),
      text: 'Loaded WormForge API definitions (0.8.22 engine specifications).',
      type: 'success',
    },
  ]);

  // Modals
  const [isKeyboardRefOpen, setIsKeyboardRefOpen] = useState(false);
  const [isEngineModalOpen, setIsEngineModalOpen] = useState(false);

  // Layout View State (Mobile responsive tabs)
  const [mobileTab, setMobileTab] = useState<'editor' | 'tree' | 'docs' | 'console'>('editor');

  // Resizable Panes Dimensions State
  const [sidebarWidth, setSidebarWidth] = useState<number>(config.sidebarWidth);
  const [treeHeightPercent, setTreeHeightPercent] = useState<number>(config.treeHeightPercent);
  const [consoleHeight, setConsoleHeight] = useState<number>(config.consoleHeight);

  // Dragging state references
  const isDraggingSidebar = useRef(false);
  const isDraggingTree = useRef(false);
  const isDraggingConsole = useRef(false);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Save config when layout or settings change
  const handleUpdateConfig = (newConfig: EditorConfig) => {
    setConfig(newConfig);
    setSidebarWidth(newConfig.sidebarWidth);
    setTreeHeightPercent(newConfig.treeHeightPercent);
    setConsoleHeight(newConfig.consoleHeight);
    saveConfig(newConfig);
  };

  // Trigger AST Parsing and Validation
  const runSyntaxCheck = useCallback(
    async (codeToTest: string, fileName?: string) => {
      // Nothing is checked until the session has resolved.
      //
      // `files` seeds from localStorage, so a check during boot describes text
      // that is about to be replaced. Worse, on the desktop this is what fires
      // the Lua 5.4 compiler and the full_moon AST parser over IPC, and doing
      // that while the window is still initialising is the reported "crash if
      // you interact too early". Waiting for `sessionReady` means the checker
      // runs exactly once, on the content actually on screen -- the sessionReady
      // effect below performs that first check.
      if (!bootedRef.current) return;

      const file = fileName || activeFile;
      const lower = file.toLowerCase();

      // If document is not Lua (.toml, .md, .txt, .json, .ini), skip Lua AST errors
      if (lower.endsWith('.toml') || lower.endsWith('.md') || lower.endsWith('.txt') || lower.endsWith('.json') || lower.endsWith('.ini')) {
        setDiagnostics([]);
        setCheckEngine(null);
        setHasRunCheck(true);
        return;
      }

      const now = new Date().toLocaleTimeString();
      const chunkName = baseName(file);
      const outcome = await compileWithEngine(codeToTest, chunkName);

      // The game compiler is the authority on "does this load". If it says no,
      // stop there: a real syntax error plus token-pass noise is worse than the
      // error alone, and the token pass cannot contradict Lua 5.4.
      if (outcome.engine === 'game-compiler' && !outcome.ok && outcome.diagnostic) {
        const luaError = outcome.diagnostic;
        setCheckEngine('game-compiler');
        setDiagnostics([luaError]);
        setHasRunCheck(true);
        setLogs((prev) => [
          ...prev,
          {
            time: now,
            text: `[Syntax Check]: the game compiler rejected ${chunkName} - ${luaError.message}`,
            type: 'error',
          },
        ]);
        return;
      }

      const result = parseAndValidate(codeToTest, customVerbs);

      // B1: when the Rust parser produced a symbol tree, USE IT. This is the whole
      // point of the phase -- symbols now come from a real parse instead of the
      // hand-written tokenizer. parser.ts still runs and still produces the
      // diagnostics; only the symbol tree is taken from Rust.
      //
      // `parseAndValidate` stays the fallback for three cases, in this order:
      //   1. the AST was unavailable (an EXE predating the command)
      //   2. the parse FAILED -- there is no tree to read, so the tokenizer's
      //      partial extraction is better than nothing
      //   3. the AST succeeded
      const ast = await parseWithAst(codeToTest, verbsForRust(customVerbs));

      let symbolsOut = result.symbols;
      if (ast.available && ast.report?.ok) {
        symbolsOut = mergeExtractedSymbols(
          ast.report,
          { functions: BUILTIN_FUNCTIONS, variables: BUILTIN_VARIABLES, classes: BUILTIN_CLASSES },
          BUILTIN_ENUMERATIONS
        );
      }

      // Merge user custom verbs into the class view. mergeCustomClasses lands a
      // verb on an EXISTING class (WormEntity:grapple joins WormEntity) and only
      // invents a new class when the name is genuinely unknown -- the old
      // name-level push here dropped every verb on an existing class, which is
      // half of the dropped-verb bug.
      const mergedClasses = mergeCustomClasses(symbolsOut.classes, customVerbs);

      // B2: Rust diagnostics merged on top of the TypeScript ones, rather than
      // replacing them, because the port is NOT finished: `parser.ts` still owns
      // the scope analysis and the spec-key check. Replacing outright would
      // silently delete those warnings from the console. Once the sweep reports no
      // rule unique to TS, this can drop to Rust-only -- and only then.
      //
      // Deduplicated on (line, COLUMN, rule) because a finding both implementations
      // cover would otherwise appear twice, and a list you read line by line is not a
      // tally. The column is what keeps two genuinely different findings on the SAME
      // line apart -- `worm:hurtt(1) worm:hurtt(2)` is two typos, not one. See
      // `mergeDiagnostics` for the measurements behind the key, including why the old
      // (line, rule) key was dropping real findings as well as letting duplicates
      // through.
      const diagnosticsOut = mergeDiagnostics(result.diagnostics, ast.report?.ok ? ast.report.diagnostics : []);
      if (outcome.engine === 'builtin') {
        diagnosticsOut.unshift({
          line: 1,
          column: 1,
          message: `The game compiler could not be reached (${outcome.reason ?? 'no reason given'}). Checked with the built-in parser instead. If this EXE predates the compiler, rebuild it with "npx tauri build".`,
          severity: 'info',
          rule: 'compiler-unavailable',
        });
      }

      setCheckEngine(outcome.engine);
      setDiagnostics(diagnosticsOut);
      setSymbols({
        ...symbolsOut,
        classes: mergedClasses,
        diagnostics: diagnosticsOut,
      });
      setHasRunCheck(true);

      let astNote = '';
      if (!ast.available) {
        astNote = ` AST unavailable (${ast.reason ?? 'no reason given'}).`;
      } else if (ast.report && !ast.report.ok) {
        // full_moon rejected what Lua 5.4 accepted. That disagreement is the
        // whole point of the exercise, so it is stated rather than hidden.
        astNote = ` AST parser reported ${ast.report.diagnostics.length} issue(s) that Lua 5.4 accepted; the built-in results below are unaffected.`;
      } else if (ast.report) {
        astNote = ` AST: ${ast.report.locals.length} local binding(s), ${ast.report.functions.length} function(s) parsed. Symbols taken from the AST parser.`;
      }

      // Counted through the ONE shared helper rather than an inline filter. The console
      // header, this verdict banner and the three filter pills must never be able to
      // disagree about how many findings there are -- see `countSeverities`.
      const counts = countSeverities(diagnosticsOut);
      const errCount = counts.error;
      const warnCount = counts.warning;
      const via =
        outcome.engine === 'game-compiler' ? 'real game compiler (Lua 5.4)' : 'built-in parser (compiler unreachable)';

      if (errCount === 0 && warnCount === 0) {
        setLogs((prev) => [
          ...prev,
          {
            time: now,
            text: `[Syntax Check]: OK - 0 syntax errors or desync violations, via the ${via}.${astNote}`,
            type: 'success',
          },
        ]);
      } else {
        setLogs((prev) => [
          ...prev,
          {
            time: now,
            text: `[Syntax Check]: ${errCount} error(s), ${warnCount} warning(s) detected via the ${via}. Check diagnostic output.${astNote}`,
            type: errCount > 0 ? 'error' : 'warn',
          },
        ]);
      }
    },
    [customVerbs, activeFile]
  );

  // Re-check whenever the verb OVERLAY changes and the app has booted.
  // Two cases need this: (1) hydration resolving AFTER the sessionReady boot
  // check -- diagnostics on screen were computed without the cfg's verbs and
  // would keep flagging `worm:grapple()` until the next manual check; (2) the
  // user registering or importing a verb, who expects the warning it silences
  // to disappear without hunting for the Syntax Check button. The boot check
  // itself is skipped here (bootedRef false until sessionReady) so there is
  // never a double IPC check on startup.
  useEffect(() => {
    if (!bootedRef.current) return;
    runSyntaxCheck(files[activeFile] ?? '', activeFile);
    // Deliberately only on customVerbs: runSyntaxCheck identity also changes
    // with activeFile, and file switches already trigger their own check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customVerbs]);

  // Load Mod or Template
  const handleLoadTemplate = useCallback(
    (templateId: string) => {
      const mod = EXISTING_MODS.find((m) => m.id === templateId);
      if (mod && mod.files.length > 0) {
        const newFiles = { ...files };
        const prefix = mod.id.replace(/^(example|gameplay)\./, '').replace(/\./g, '_');
        let primaryFile = '';

        for (let i = 0; i < mod.files.length; i++) {
          const f = mod.files[i];
          const filePath = `${prefix}/${f.name}`;
          newFiles[filePath] = f.content;
          if (i === 0) {
            primaryFile = filePath;
          }
        }

        // QOL: Only open primary .lua file in tabs to prevent tab bar bloat.
        // Supporting files (.toml, .md) are neatly organized inside the mod subfolder in the tree!
        const newOpen = openFiles.includes(primaryFile) ? openFiles : [...openFiles, primaryFile];

        setFiles(newFiles);
        setOpenFiles(newOpen);
        setActiveFile(primaryFile);
        runSyntaxCheck(newFiles[primaryFile], primaryFile);

        setLogs((prev) => [
          ...prev,
          {
            time: new Date().toLocaleTimeString(),
            text: `Loaded mod package "${mod.name}" (${mod.files.length} files under subfolder "${prefix}/").`,
            type: 'success',
          },
        ]);
      }
    },
    [files, openFiles, runSyntaxCheck]
  );

  // Auto-Load on Startup Check
  //
  // `sessionReady` is set at EVERY exit, including after the async folder scan, because
  // it gates whether restored buffers are shown or checked. Miss one path and the editor
  // stays behind the boot panel forever, so the async branch uses `.finally()` rather
  // than repeating the call at the end of `.then()`.
  useEffect(() => {
    let cancelled = false;
    const finish = () => {
      if (!cancelled) setSessionReady(true);
    };

    // 0. Mods-list launch mode takes precedence: show the grid and do NOT
    //    auto-open anything behind it. Scoping the existing auto-load blocks
    //    behind `if (modsListEnabled)` leaves their behaviour untouched when
    //    the feature is off (launchMode defaults to 'lastFile').
    if (modsListEnabled) {
      setShowModsList(true);
      refreshMods();
      finish();
      return () => {
        cancelled = true;
      };
    }

    // 1. If an auto-load mod is specified in config, load it on startup
    if (config.autoLoadModId) {
      const found = EXISTING_MODS.find((m) => m.id === config.autoLoadModId);
      if (found) {
        handleLoadTemplate(config.autoLoadModId);
        setLogs((prev) => [
          ...prev,
          {
            time: new Date().toLocaleTimeString(),
            text: `[Auto-Load]: Automatically loaded configured startup mod "${found.name}".`,
            type: 'info',
          },
        ]);
      }
    }

    // 2. Open one mod from the configured mods folder, if the user named one.
    //
    // §35: this used to read a SECOND absolute path (config.autoLoadFolder). The
    // startup mod is now a subfolder NAME resolved against config.modsRootPath, so
    // both features are driven by the single folder the user configured. The old
    // field is not read here -- loadConfig() migrated it already.
    if (config.startupModFolder) {
      const modsRoot = cleanFolderPath(config.modsRootPath);
      if (!modsRoot) {
        setLogs((prev) => [
          ...prev,
          {
            time: new Date().toLocaleTimeString(),
            text: `[Startup]: No Mods Folder configured, so "${config.startupModFolder}" was not opened. Set one in Config.`,
            type: 'warn',
          },
        ]);
      } else {
        const sep = modsRoot.includes('\\') ? '\\' : '/';
        const targetDir = cleanFolderPath(modsRoot + sep + config.startupModFolder);
        if (targetDir) {
          loadFolderFromPath(targetDir)
          .then((res) => {
            if (!res) return;
            const names = Object.keys(res.files).sort();
            if (names.length === 0) {
              setLogs((prev) => [
                ...prev,
                {
                  time: new Date().toLocaleTimeString(),
                  text: `[Startup Folder]: "${res.name}" has no mod files (.lua/.toml/.md).`,
                  type: 'warn',
                },
              ]);
              return;
            }
            // The manifest decides, not the alphabet -- see pickStartupFile.
            // Without this a scratch file sorting first outranks `rules.lua`.
            const first = pickStartupFile(res.files);
            if (!first) return;
            // Reopen the file that was active last session, if it still exists
            // in the folder. Falling straight to `first` would silently drop it.
            let remembered: string | null = null;
            try {
              remembered = localStorage.getItem(STORAGE_ACTIVE_FILE_KEY);
            } catch {}
            const target =
              remembered && Object.prototype.hasOwnProperty.call(res.files, remembered)
                ? remembered
                : first;
            setModFolder({ name: res.name, root: res.root });
            setSavedFiles(res.files);
            setFiles(res.files);
            setOpenFiles([target]);
            setActiveFile(target);
            runSyntaxCheck(res.files[target] ?? '', target);
            setLogs((prev) => [
              ...prev,
              {
                time: new Date().toLocaleTimeString(),
                text: `[Startup Folder]: Automatically loaded "${res.name}" (${names.length} files from ${res.root}).`,
                type: 'success',
              },
            ]);
          })
          .catch((err) => {
            setLogs((prev) => [
              ...prev,
              {
                time: new Date().toLocaleTimeString(),
                text: `[Startup Folder]: ${err?.message || String(err)}`,
                type: 'warn',
              },
            ]);
          }).finally(finish);
          return;
        }
      }
    }

    finish();
    return () => {
      cancelled = true;
    };
  }, []);

  // The startup syntax check, gated on `sessionReady`.
  //
  // This used to be the FIRST line of the auto-load effect above, which meant it ran
  // against the restored localStorage buffer -- text from the previous session that was
  // about to be replaced a moment later by the folder scan. That is where the red
  // diagnostics on startup came from: findings about a file the user had already
  // discarded. Checking only after the load resolves means the check always describes
  // what is actually on screen.
  useEffect(() => {
    if (!sessionReady) return;
    // Only now may the compiler/AST IPC run: the session has resolved, so the
    // buffers on screen are the real ones. This also opens the gate for every
    // later user-initiated check.
    bootedRef.current = true;
    runSyntaxCheck(activeCode, activeFile);
  }, [sessionReady]);

  // Update Code Content for Active File
  const handleCodeChange = (newCode: string) => {
    setFiles((prev) => ({
      ...prev,
      [activeFile]: newCode,
    }));
  };

  const handleCursorChange = (line: number, column: number) => {
    // Local cursor tracking
  };

  // Insert Snippet into Code Editor
  // Inserts at the caret via the editor's imperative handle, so a snippet lands
  // where the user is working instead of at the bottom of the file.
  const handleInsertCode = (snippet: string) => {
    const next = editorRef.current?.insertSnippet(snippet) ?? null;
    if (next !== null) {
      runSyntaxCheck(next);
    }
    setLogs((prev) => [
      ...prev,
      {
        time: new Date().toLocaleTimeString(),
        text: `Inserted snippet into ${activeFile}.`,
        type: 'info',
      },
    ]);
  };

  // Format Code. The re-indent itself lives in services/formatLua.ts; this is
  // only the wiring. It used to be a regex closure inline here, which silently
  // corrupted files -- see the header of formatLua.ts and §32.
  const handleFormatCode = () => {
    const { code: formatted, suspect } = formatLua(activeCode);

    handleCodeChange(formatted);
    runSyntaxCheck(formatted);

    // An unbalanced chunk re-indents unpredictably, and the checker will say so
    // a moment later. Say it up front rather than letting the user wonder why
    // their indentation changed shape.
    addLog(
      suspect
        ? `Formatted ${activeFile}, but the block structure did not balance (missing or extra end). Check the indentation.`
        : `Cleaned and formatted ${activeFile}.`,
      suspect ? 'warn' : 'info'
    );
  };

  // ----- Mod folder: open / save -----
  const addLog = (text: string, type: 'info' | 'success' | 'warn' | 'error') =>
    setLogs((prev) => [...prev, { time: new Date().toLocaleTimeString(), text, type }]);

  const dirtyFiles = useMemo(
    () => (modFolder ? Object.keys(files).filter((f) => files[f] !== savedFiles[f]) : []),
    [files, savedFiles, modFolder]
  );

  const handleOpenFolder = async () => {
    if (dirtyFiles.length > 0 && !window.confirm('You have unsaved changes. Open another folder anyway?')) {
      return;
    }
    try {
      const res = await openModFolder();
      if (!res) return;
      const names = Object.keys(res.files).sort();
      if (names.length === 0) {
        addLog(`Folder "${res.name}" has no .lua/.toml/.md/.txt/.json files.`, 'warn');
        return;
      }
      // Which file opens is decided inside applyOpenedFolder, from the
      // manifest's `entry`, so there is nothing left to compute here.
      applyOpenedFolder(res);
      addLog(`Opened folder "${res.name}" (${names.length} file${names.length === 1 ? '' : 's'}).`, 'success');
    } catch (e: any) {
      addLog(`Failed to open folder: ${e?.message ?? String(e)}`, 'error');
    }
  };

  /**
   * Opens an already-resolved OpenedFolder into the editor. Shared by the
   * normal "Open Folder" button and the mods-list tiles so both go through
   * the exact same state transition (modFolder/savedFiles/files/openFiles/
   * activeFile) rather than a second, drifting copy of it.
   */
  const applyOpenedFolder = useCallback(
    (res: { name: string; root: string; files: Record<string, string> }) => {
      // THE MANIFEST DECIDES. `mod.toml`'s `entry` names the file the engine
      // actually loads, so that is what opens. The old behaviour -- "the first
      // `.lua` in sorted order" -- opened whatever happened to sort first, which
      // in a real pack is a scratch file (`highlander1asdasd.lua`) rather than
      // `rules.lua`. pickStartupFile falls back inside itself when there is no
      // manifest or no usable `entry`.
      const first = pickStartupFile(res.files);
      if (!first) return;
      setModFolder({ name: res.name, root: res.root });
      setSavedFiles(res.files);
      setFiles(res.files);
      setOpenFiles([first]);
      setActiveFile(first);
      runSyntaxCheck(res.files[first] ?? '', first);
    },
    [runSyntaxCheck]
  );

  // ----- Mods-list launch screen handlers -----
  const refreshMods = useCallback(async () => {
    const root = cleanFolderPath(config.modsRootPath);
    if (!root) {
      setMods([]);
      setModsError('No mods folder configured. Set one in Config.');
      return;
    }
    setModsLoading(true);
    setModsError(null);
    try {
      const entries = await listModEntries(root);
      if (entries === null) {
        setMods([]);
        setModsError('Could not read the mods folder. Check the path in Config.');
      } else {
        setMods(entries as ModsListTile[]);
      }
    } catch (e: any) {
      setMods([]);
      setModsError(e?.message ?? String(e));
    } finally {
      setModsLoading(false);
    }
  }, [config.modsRootPath]);

  // Show the grid and make sure it has fresh contents. Used by the header
  // "Mods" button and by the config toggle.
  const handleShowModsList = useCallback(() => {
    setShowModsList(true);
    refreshMods();
  }, [refreshMods]);

  // A mod tile is just a folder path, so reuse the existing path loader.
  const handleOpenModTile = useCallback(
    async (mod: ModsListTile) => {
      if (dirtyFiles.length > 0 && !window.confirm('You have unsaved changes. Open another mod anyway?')) {
        return;
      }
      try {
        const res = await loadFolderFromPath(mod.path);
        if (!res || Object.keys(res.files).length === 0) {
          addLog(`Mod "${mod.id}" has no readable .lua/.toml files.`, 'warn');
          return;
        }
        applyOpenedFolder(res);
        setShowModsList(false);
        addLog(`Opened mod "${mod.id}" from ${res.name} (${Object.keys(res.files).length} files).`, 'success');
      } catch (e: any) {
        addLog(`Failed to open mod "${mod.id}": ${e?.message ?? String(e)}`, 'error');
      }
    },
    [dirtyFiles, applyOpenedFolder]
  );

  const handleCreateMod = useCallback(
    async (modName: string, author: string) => {
      const root = cleanFolderPath(config.modsRootPath);
      if (!root) {
        setCreateError('No mods folder configured. Set one in Config.');
        return;
      }
      setIsCreating(true);
      setCreateError(null);
      try {
        const modPath = await createModFolder(root, modName, author);
        const res = await loadFolderFromPath(modPath);
        if (res && Object.keys(res.files).length > 0) {
          applyOpenedFolder(res);
        }
        setIsCreateOpen(false);
        setShowModsList(false);
        addLog(`Created mod "${modName}" in ${root}.`, 'success');
        await refreshMods();
      } catch (e: any) {
        setCreateError(e?.message ?? String(e));
      } finally {
        setIsCreating(false);
      }
    },
    [config.modsRootPath, applyOpenedFolder, refreshMods]
  );

  // React to the Config screen's "On Startup" toggle. The startup effect runs
  // only once, so without this the toggle appears to do nothing until restart.
  useEffect(() => {
    if (modsListEnabled) {
      handleShowModsList();
    } else {
      // Switching back to 'lastFile' must not strand the user on the grid.
      setShowModsList(false);
    }
  }, [modsListEnabled, handleShowModsList]);

  const handleOpenWorkspaceFile = (name: string) => {
    if (!openFiles.includes(name)) {
      setOpenFiles((prev) => [...prev, name]);
    }
    setActiveFile(name);
    runSyntaxCheck(files[name] ?? '');
  };

  // Writes each file to disk. Returns the names that FAILED, so callers such as
  // "Save and close" can refuse to close while data is still unsaved.
  const saveFiles = async (fileNames: string[]): Promise<string[]> => {
    if (!modFolder) return fileNames;
    const failed: string[] = [];
    let savedCount = 0;
    const nextSaved = { ...savedFiles };
    for (const name of fileNames) {
      const content = files[name];
      if (content === undefined) continue;
      try {
        await saveModFile(modFolder.root, name, content);
        nextSaved[name] = content;
        savedCount++;
      } catch (e: any) {
        failed.push(name);
        addLog(`Failed to save ${name}: ${e?.message ?? String(e)}`, 'error');
      }
    }
    setSavedFiles(nextSaved);
    if (savedCount > 0) {
      addLog(`Saved ${savedCount} file${savedCount === 1 ? '' : 's'} to "${modFolder.name}".`, 'success');
    }
    return failed;
  };

  // ----- Unsaved changes guard -----
  // Reuses `dirtyFiles` from above: a file counts as dirty when it differs from
  // what we last wrote to disk. Without an open mod folder there is nothing on
  // disk to compare against, so scratch files are never treated as unsaved.

  // Keep the latest dirty list readable from the window close handler without
  // re-subscribing on every keystroke.
  const unsavedFilesRef = useRef<string[]>(dirtyFiles);
  unsavedFilesRef.current = dirtyFiles;
  const forceCloseRef = useRef(false);

  const closeAppWindow = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().destroy();
    } catch {}
  };

  // Browser: beforeunload is the only hook that can intercept a tab close.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (unsavedFilesRef.current.length === 0) return;
      e.preventDefault();
      // Browsers ignore custom text here and show their own generic wording.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // Desktop: intercept the native window close so we can offer Save / Discard.
  useEffect(() => {
    if (!isDesktop()) return;
    let disposed = false;
    let unlisten: (() => void) | null = null;

    (async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const stop = await getCurrentWindow().onCloseRequested((event) => {
          if (forceCloseRef.current || unsavedFilesRef.current.length === 0) return;
          event.preventDefault();
          setPendingClose(true);
        });
        if (disposed) stop();
        else unlisten = stop;
      } catch {}
    })();

    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, []);

  const handleSaveAndClose = async () => {
    const failed = await saveFiles(unsavedFilesRef.current);
    if (failed.length > 0) {
      // Keep the window open so the user can retry or pick "Close without saving".
      setPendingClose(false);
      addLog(`Close cancelled: ${failed.length} file(s) could not be written to disk.`, 'error');
      return;
    }
    forceCloseRef.current = true;
    setPendingClose(false);
    await closeAppWindow();
  };

  const handleDiscardAndClose = async () => {
    forceCloseRef.current = true;
    setPendingClose(false);
    await closeAppWindow();
  };

  // Third close option: throw the session away entirely.
  //
  // "Close without saving" leaves the persisted buffers in localStorage, so the NEXT
  // launch restores the very edits the user just declined to save -- and, before the
  // boot gate, painted them on screen first. This clears them so the next launch starts
  // from disk (or the template) with nothing carried over.
  const handleResetAndClose = async () => {
    resetPersistedSession();
    forceCloseRef.current = true;
    setPendingClose(false);
    await closeAppWindow();
  };

  // Keyboard shortcut: Ctrl+S saves current file to disk
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (modFolder) {
          saveFiles([activeFile]);
        } else {
          handleExportFile();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Save As
  const handleExportFile = async () => {
    try {
      const saved = await saveFileAs(activeFile, activeCode);
      if (saved) addLog(`Saved "${activeFile}" as ${saved}.`, 'success');
    } catch (e: any) {
      addLog(`Save As failed: ${e?.message ?? String(e)}`, 'error');
    }
  };

  // Import local file (.lua, .toml, .md, .txt, .ini, .json)
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const fileName = file.name;
      setFiles((prev) => ({ ...prev, [fileName]: content }));
      if (!openFiles.includes(fileName)) setOpenFiles((prev) => [...prev, fileName]);
      setActiveFile(fileName);
      runSyntaxCheck(content, fileName);
      setLogs((prev) => [
        ...prev,
        {
          time: new Date().toLocaleTimeString(),
          text: `Imported file "${fileName}" (${content.length} bytes).`,
          type: 'success',
        },
      ]);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Register a Custom Verb from the Modal.
  //
  // The list is the source of truth: the ClassDef view (API tree, modal
  // dropdown) is derived from it through mergeCustomClasses, and the persist
  // effect above writes it to custom_verbs.cfg. Re-registering the same
  // class:name pair REPLACES the old row -- first-wins elsewhere is about
  // duplicate ROWS in a file, not about refusing an edit the user just made.
  const handleAddVerb = (verb: CustomVerb) => {
    setCustomVerbs((prev) => {
      const key = `${verb.class.toLowerCase()}:${verb.name.toLowerCase()}`;
      const idx = prev.findIndex((v) => `${v.class.toLowerCase()}:${v.name.toLowerCase()}` === key);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = verb;
        return next;
      }
      return [...prev, verb];
    });

    setSelectedSymbolItem({
      name: verb.class,
      isCustom: true,
      activeMember: verbToMember(verb),
    });

    setLogs((prev) => [
      ...prev,
      {
        time: new Date().toLocaleTimeString(),
        text: `Registered new engine verb: ${verb.class}${verb.syntax}${verb.name}(). Applying to autocomplete and both checkers; persisting to custom_verbs.cfg.`,
        type: 'success',
      },
    ]);
  };

  // Select Item from Upper Corner Tree
  const handleSelectTreeItem = (type: string, item: any) => {
    setSelectedSymbolItem(item);
    if (window.innerWidth < 1024) {
      setMobileTab('docs');
    }
  };

  // All combined classes (built-in + custom).
  // mergeCustomClasses again -- the SAME call runSyntaxCheck makes over the AST
  // symbols, so the API tree and the post-check symbols state can never drift
  // apart on where a verb landed.
  const combinedClasses = useMemo(
    () => mergeCustomClasses(symbols.classes, customVerbs),
    [symbols.classes, customVerbs]
  );

  // The SAME helper the verdict banner used, over the SAME list the console renders.
  // These were separate inline filters over two different sources, which agreed only
  // by accident of how the state is written.
  const counts = countSeverities(diagnostics);
  const errorCount = counts.error;
  const warnCount = counts.warning;
  const isLight = config.theme === 'light';

  // Mirror the theme onto <html> so index.css can theme the ::-webkit-scrollbar
  // pseudo-elements, which cannot be reached from a React className.
  useEffect(() => {
    document.documentElement.classList.toggle('light', isLight);
  }, [isLight]);

  // ----- Resizable GUI Mouse Handlers -----
  const handleStartSidebarResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingSidebar.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    let liveWidth = sidebarWidth;

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDraggingSidebar.current) return;
      liveWidth = Math.max(220, Math.min(650, ev.clientX));
      setSidebarWidth(liveWidth);
    };

    const onMouseUp = () => {
      isDraggingSidebar.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      setConfig((prev) => {
        const next = { ...prev, sidebarWidth: liveWidth };
        saveConfig(next);
        return next;
      });
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleStartTreeResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingTree.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const sidebarElem = sidebarRef.current;
    if (!sidebarElem) return;
    const sidebarTop = sidebarElem.getBoundingClientRect().top;
    const sidebarHeight = sidebarElem.getBoundingClientRect().height;

    let livePct = treeHeightPercent;

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDraggingTree.current) return;
      const relY = ev.clientY - sidebarTop;
      livePct = Math.max(20, Math.min(80, Math.round((relY / sidebarHeight) * 100)));
      setTreeHeightPercent(livePct);
    };

    const onMouseUp = () => {
      isDraggingTree.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      setConfig((prev) => {
        const next = { ...prev, treeHeightPercent: livePct };
        saveConfig(next);
        return next;
      });
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleStartConsoleResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingConsole.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    let liveHeight = consoleHeight;

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDraggingConsole.current) return;
      liveHeight = Math.max(80, Math.min(550, window.innerHeight - ev.clientY));
      setConsoleHeight(liveHeight);
    };

    const onMouseUp = () => {
      isDraggingConsole.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      setConfig((prev) => {
        const next = { ...prev, consoleHeight: liveHeight };
        saveConfig(next);
        return next;
      });
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div
      className={`relative flex flex-col h-screen w-screen overflow-hidden select-none transition-colors ${
        isLight ? 'bg-slate-100 text-slate-800' : 'bg-[#0e1115] text-[#cfdbe8]'
      }`}
    >
      {/* Top Header */}
      <StudioHeader
        activeFile={activeFile}
        onSelectFile={setActiveFile}
        openFiles={openFiles}
        onCloseFile={(f) => {
          if (openFiles.length <= 1) return;
          const nextOpen = openFiles.filter((item) => item !== f);
          setOpenFiles(nextOpen);
          if (activeFile === f) setActiveFile(nextOpen[0]);
        }}
        onLoadTemplate={handleLoadTemplate}
        onOpenConfig={() => setIsConfigModalOpen(true)}
        existingMods={EXISTING_MODS}
        onOpenModsList={modsRootConfigured ? handleShowModsList : undefined}
        isLight={isLight}
      />

      {/* Main Studio Action Toolbar */}
      <div
        className={`px-3 py-1.5 border-b flex items-center justify-between text-xs gap-2 shrink-0 transition-colors ${
          isLight ? 'bg-white border-slate-300' : 'bg-[#171b21] border-[#242b35]'
        }`}
      >
        <div className="flex items-center gap-2">
          {/* Primary SYNTAX CHECK Button */}
          <button
            onClick={() => runSyntaxCheck(activeCode)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-bold shadow-xs transition-all ${
              errorCount > 0
                ? 'bg-rose-500 hover:bg-rose-600 text-white'
                : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
            }`}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>SYNTAX CHECK</span>
            {errorCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-white/30 text-white text-[10px] font-mono">
                {errorCount} err
              </span>
            )}
            {errorCount === 0 && warnCount === 0 && (
              <CheckCircle className="w-3 h-3 text-slate-950" />
            )}
          </button>

          {/* Keyboard Reference. Renamed from "Keycode Tester" in §36: there are no
              keycodes. This lists the nine fields wa.world.keys() actually returns. */}
          <button
            onClick={() => setIsKeyboardRefOpen(true)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded border font-medium transition-colors ${
              isLight
                ? 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
                : 'bg-[#202631] hover:bg-[#2b3341] text-[#cfdbe8] border-[#2e3745]'
            }`}
            title="Which keys WormForge reads, and what each one does"
          >
            <Keyboard className="w-3.5 h-3.5 text-sky-500" />
            <span className="hidden sm:inline">Keys</span>
          </button>

          {/* Add Engine Verb Button */}
          <button
            onClick={() => setIsEngineModalOpen(true)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded border font-medium transition-colors ${
              isLight
                ? 'bg-amber-50 hover:bg-amber-100/80 text-amber-800 border-amber-300'
                : 'bg-[#202631] hover:bg-[#2b3341] text-amber-300 border-amber-500/30'
            }`}
            title="Register custom methods (:) and functions/properties (.)"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">+ Custom Verb</span>
          </button>

          {/* Format Code */}
          <button
            onClick={handleFormatCode}
            className={`hidden md:flex items-center gap-1 px-2 py-1.5 rounded border transition-colors ${
              isLight
                ? 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
                : 'bg-[#202631] hover:bg-[#2b3341] text-[#8e9eb2] hover:text-[#d3e0f0] border-[#2b3340]'
            }`}
            title="Clean whitespace and indent"
          >
            <AlignLeft className="w-3.5 h-3.5" />
            <span>Format</span>
          </button>
        </div>

        {/* Right Toolbar Actions */}
        <div className="flex items-center gap-1.5">
          {/* Open mod folder / Save */}
          <button
            onClick={handleOpenFolder}
            className={`flex items-center gap-1 px-2 py-1.5 rounded border transition-colors ${
              isLight
                ? 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
                : 'bg-[#202631] hover:bg-[#2b3341] text-[#93a6bd] hover:text-[#dce7f3] border-[#2b3340]'
            }`}
            title="Open a mod folder from disk"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Open Folder</span>
          </button>
          {modFolder && (
            <button
              onClick={() => saveFiles(dirtyFiles.length ? dirtyFiles : [activeFile])}
              className={`flex items-center gap-1 px-2 py-1.5 rounded border transition-colors ${
                isLight
                  ? 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
                  : 'bg-[#202631] hover:bg-[#2b3341] text-[#93a6bd] hover:text-[#dce7f3] border-[#2b3340]'
              }`}
              title="Save changed files to the folder (Ctrl+S saves current file)"
            >
              <Save className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                Save{dirtyFiles.length > 0 ? ` (${dirtyFiles.length})` : ''}
              </span>
            </button>
          )}

          {/* Quick Upload Local File (.lua, .toml, .md, .txt, .ini, .json) */}
          <label
            className={`flex items-center gap-1 px-2 py-1.5 rounded border cursor-pointer transition-colors ${
              isLight
                ? 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
                : 'bg-[#202631] hover:bg-[#2b3341] text-[#93a6bd] hover:text-[#dce7f3] border-[#2b3340]'
            }`}
            title="Import Local File (.lua, .toml, .md, .txt, .ini, .json)"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Import</span>
            <input
              type="file"
              accept=".lua,.toml,.md,.txt,.ini,.json"
              onChange={handleImportFile}
              className="hidden"
            />
          </label>

          {/* Export File */}
          <button
            onClick={handleExportFile}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded border transition-colors ${
              isLight
                ? 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
                : 'bg-[#202631] hover:bg-[#2b3341] text-[#93a6bd] hover:text-[#dce7f3] border-[#2b3340]'
            }`}
            title="Save As…"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Save As</span>
          </button>
        </div>
      </div>

      {/* Mobile Tab Switcher */}
      <div
        className={`lg:hidden flex items-center border-b text-xs font-semibold ${
          isLight ? 'bg-slate-200 border-slate-300' : 'bg-[#13161c] border-[#232932]'
        }`}
      >
        <button
          onClick={() => setMobileTab('editor')}
          className={`flex-1 py-1.5 text-center flex items-center justify-center gap-1 ${
            mobileTab === 'editor'
              ? isLight
                ? 'bg-white text-amber-700 border-b-2 border-amber-500 font-bold'
                : 'bg-[#1a1e26] text-amber-300 border-b-2 border-amber-400'
              : 'text-slate-500'
          }`}
        >
          <FileCode className="w-3 h-3" />
          <span>Editor</span>
        </button>
        <button
          onClick={() => setMobileTab('tree')}
          className={`flex-1 py-1.5 text-center flex items-center justify-center gap-1 ${
            mobileTab === 'tree'
              ? isLight
                ? 'bg-white text-amber-700 border-b-2 border-amber-500 font-bold'
                : 'bg-[#1a1e26] text-amber-300 border-b-2 border-amber-400'
              : 'text-slate-500'
          }`}
        >
          <Layers className="w-3 h-3" />
          <span>API Tree</span>
        </button>
        <button
          onClick={() => setMobileTab('docs')}
          className={`flex-1 py-1.5 text-center flex items-center justify-center gap-1 ${
            mobileTab === 'docs'
              ? isLight
                ? 'bg-white text-amber-700 border-b-2 border-amber-500 font-bold'
                : 'bg-[#1a1e26] text-amber-300 border-b-2 border-amber-400'
              : 'text-slate-500'
          }`}
        >
          <BookOpen className="w-3 h-3" />
          <span>Docs</span>
        </button>
        <button
          onClick={() => setMobileTab('console')}
          className={`flex-1 py-1.5 text-center flex items-center justify-center gap-1 ${
            mobileTab === 'console'
              ? isLight
                ? 'bg-white text-amber-700 border-b-2 border-amber-500 font-bold'
                : 'bg-[#1a1e26] text-amber-300 border-b-2 border-amber-400'
              : 'text-slate-500'
          }`}
        >
          <Terminal className="w-3 h-3" />
          <span>Console ({errorCount})</span>
        </button>
      </div>

      {/* Center Layout Workspace with Resizable Panes */}
      <div ref={workspaceRef} className="flex-1 flex overflow-hidden relative">
        {/* Left Column: Upper Corner Tree & Doc Pane */}
        <div
          ref={sidebarRef}
          style={{ width: `${sidebarWidth}px` }}
          className={`flex flex-col border-r shrink-0 transition-colors ${
            isLight ? 'bg-slate-50 border-slate-300' : 'bg-[#16191f] border-[#242b36]'
          } ${mobileTab === 'editor' || mobileTab === 'console' ? 'hidden lg:flex' : 'flex'}`}
        >
          {/* Upper Corner Tree: Variables, Enums, Functions, Classes, Existing Mods */}
          <div
            style={{ height: `${treeHeightPercent}%` }}
            className={`min-h-[140px] overflow-hidden flex flex-col ${
              mobileTab === 'docs' ? 'hidden lg:flex' : 'flex'
            }`}
          >
            <UpperCornerTree
              variables={symbols.variables || []}
              enumerations={symbols.enums || []}
              functions={symbols.functions || []}
              classes={combinedClasses}
              existingMods={EXISTING_MODS}
              workspaceName={modFolder?.name}
              workspaceFiles={modFolder ? Object.keys(files).sort() : undefined}
              dirtyFiles={dirtyFiles}
              activeFile={activeFile}
              onOpenWorkspaceFile={handleOpenWorkspaceFile}
              selectedItem={selectedSymbolItem}
              onSelectItem={handleSelectTreeItem}
              onInsertCode={handleInsertCode}
              onOpenEngineModal={() => setIsEngineModalOpen(true)}
              isLight={isLight}
            />
          </div>

          {/* Horizontal Splitter Drag Handle between Tree & Docs */}
          <div
            onMouseDown={handleStartTreeResize}
            title="Drag vertically to resize Tree & Documentation panes"
            className={`h-1.5 cursor-row-resize shrink-0 transition-colors flex items-center justify-center ${
              isLight
                ? 'bg-slate-200 hover:bg-amber-500/70 active:bg-amber-500'
                : 'bg-[#232933] hover:bg-amber-500/70 active:bg-amber-500'
            }`}
          >
            <div className="w-8 h-0.5 rounded-full bg-slate-400/40" />
          </div>

          {/* Lower Left: Doc Pane */}
          <div
            style={{ height: `${100 - treeHeightPercent}%` }}
            className={`min-h-[120px] overflow-hidden flex flex-col ${
              mobileTab === 'tree' ? 'hidden lg:flex' : 'flex'
            }`}
          >
            <DocPane
              selectedItem={selectedSymbolItem}
              onInsertCode={handleInsertCode}
              onLoadTemplate={handleLoadTemplate}
              isLight={isLight}
            />
          </div>
        </div>

        {/* Vertical Splitter Drag Handle between Sidebar and Editor */}
        <div
          onMouseDown={handleStartSidebarResize}
          title="Drag horizontally to resize Sidebar"
          className={`hidden lg:flex w-1.5 cursor-col-resize shrink-0 transition-colors items-center justify-center ${
            isLight
              ? 'bg-slate-200 hover:bg-amber-500/70 active:bg-amber-500'
              : 'bg-[#212732] hover:bg-amber-500/70 active:bg-amber-500'
          }`}
        >
          <div className="h-8 w-0.5 rounded-full bg-slate-400/40" />
        </div>

        {/* Center Column: Code Editor & Console Output */}
        <div
          className={`flex-1 flex flex-col overflow-hidden ${
            mobileTab === 'tree' || mobileTab === 'docs' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {/* Top Main Stage: Code Editor */}
          <div
            className={`flex-1 overflow-hidden relative ${
              mobileTab === 'console' ? 'hidden lg:block' : 'block'
            }`}
          >
            <CodeEditor
              key={activeFile}
              ref={editorRef}
              code={activeCode}
              onChange={handleCodeChange}
              diagnostics={diagnostics}
              onCursorChange={handleCursorChange}
              activeFile={activeFile}
              fontSize={config.fontSize}
              lineHeight={config.lineHeight}
              theme={config.theme}
              syntaxPreset={config.syntaxPreset}
              syntaxOverridesDark={config.syntaxOverridesDark}
              syntaxOverridesLight={config.syntaxOverridesLight}
              jumpTarget={jumpTarget}
              customVerbs={customVerbs}
            />
          </div>

          {/* Horizontal Splitter Drag Handle between Editor & Console */}
          <div
            onMouseDown={handleStartConsoleResize}
            title="Drag vertically to resize Console output"
            className={`h-1.5 cursor-row-resize shrink-0 transition-colors flex items-center justify-center ${
              isLight
                ? 'bg-slate-200 hover:bg-amber-500/70 active:bg-amber-500'
                : 'bg-[#232933] hover:bg-amber-500/70 active:bg-amber-500'
            }`}
          >
            <div className="w-8 h-0.5 rounded-full bg-slate-400/40" />
          </div>

          {/* Bottom Stage: Console & AST Output */}
          <div
            style={{ height: `${consoleHeight}px` }}
            className={`shrink-0 overflow-hidden ${
              mobileTab === 'editor' ? 'hidden lg:block' : 'block'
            }`}
          >
            <ConsoleOutput
              diagnostics={diagnostics}
              logs={logs}
              onSelectDiagnostic={(diag) => {
                // Bump `key` every click so re-clicking the same diagnostic
                // still re-triggers the jump inside the editor.
                setJumpTarget({ line: diag.line, column: diag.column, key: Date.now() });
                // On narrow screens the console hides the editor, so make the
                // destination visible before scrolling to it.
                if (window.innerWidth < 1024) setMobileTab('editor');
                setLogs((prev) => [
                  ...prev,
                  {
                    time: new Date().toLocaleTimeString(),
                    text: `Navigated to Line ${diag.line}:${diag.column} - ${diag.message}`,
                    type: diag.severity === 'error' ? 'error' : 'warn',
                  },
                ]);
              }}
              onClearLogs={() => setLogs([])}
              hasRunCheck={hasRunCheck}
              checkEngine={checkEngine}
              isLight={isLight}
            />
          </div>
        </div>
      </div>

      {/* Keyboard Reference Modal */}
      <KeyboardReference
        isOpen={isKeyboardRefOpen}
        onClose={() => setIsKeyboardRefOpen(false)}
        onInsertCode={handleInsertCode}
      />

      {/* Engine Verb & Custom Class Registration Modal */}
      <EngineAdditionModal
        isOpen={isEngineModalOpen}
        onClose={() => setIsEngineModalOpen(false)}
        onAddVerb={handleAddVerb}
        existingClasses={combinedClasses}
      />

      {/* Editor Configuration & Preferences Modal */}
      <ConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        config={config}
        customVerbs={customVerbs}
        onImportVerbs={(imported) => {
          // Merge, keeping EXISTING rows on collision (first-wins, same rule
          // loadCustomVerbs applies between disk and mirror): an import is a
          // contribution, never a silent overwrite of verbs the user just
          // registered in this session.
          setCustomVerbs((prev) => {
            const seen = new Set(prev.map((v) => `${v.class.toLowerCase()}:${v.name.toLowerCase()}`));
            const merged = [...prev];
            for (const v of imported) {
              const key = `${v.class.toLowerCase()}:${v.name.toLowerCase()}`;
              if (seen.has(key)) continue;
              seen.add(key);
              merged.push(v);
            }
            return merged;
          });
        }}
        onUpdateConfig={handleUpdateConfig}
        existingMods={EXISTING_MODS}
      />
      {/* Boot gate. Covers the studio while the startup folder scan resolves, so the
          previous session's buffers are never painted -- not even for a frame. This is
          an overlay rather than a conditional around the studio, matching the mods-list
          screen below, so no existing layout is restructured. */}
      {!sessionReady && (
        <div
          className={`absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 text-xs ${
            isLight ? 'bg-white text-slate-600' : 'bg-[#111418] text-[#93a6bd]'
          }`}
        >
          <RefreshCw className={`w-4 h-4 ${isLight ? 'text-slate-400' : 'text-[#5c6b80]'}`} />
          <span>Restoring session...</span>
        </div>
      )}

      {/* Unsaved changes prompt shown when a close is attempted with dirty files */}
      <UnsavedChangesModal
        isOpen={pendingClose}
        fileNames={dirtyFiles}
        isLight={isLight}
        onSaveAndClose={handleSaveAndClose}
        onDiscardAndClose={handleDiscardAndClose}
        onResetAndClose={handleResetAndClose}
        onCancel={() => setPendingClose(false)}
      />

      {/* Mods-list launch screen. Rendered as a sibling overlay rather than by
          wrapping the studio in a conditional, so no existing toolbar/tree/
          editor markup is restructured - it simply covers it while active.
          It covers the StudioHeader too and provides its own header bar
          (Config / Create / Refresh), so no fragile pixel offset is needed.
          The header's "Mods" button is what gets you FROM the editor back
          here. */}
      {showModsList && (
        <div className="absolute inset-0 z-40 flex flex-col">
          <ModsListScreen
            mods={mods}
            isLoading={modsLoading}
            error={modsError}
            isLight={isLight}
            onOpenMod={handleOpenModTile}
            onRefresh={refreshMods}
            onCreateNew={() => {
              setCreateError(null);
              setIsCreateOpen(true);
            }}
            onOpenConfig={() => setIsConfigModalOpen(true)}
          />
        </div>
      )}

      <CreateModModal
        isOpen={isCreateOpen}
        isLight={isLight}
        isBusy={isCreating}
        error={createError}
        onClose={() => setIsCreateOpen(false)}
        onCreate={handleCreateMod}
      />
    </div>
  );
}
