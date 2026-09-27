import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
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
import { CodeEditor } from './components/CodeEditor';
import { ConsoleOutput } from './components/ConsoleOutput';
import { KeycodeModal } from './components/KeycodeModal';
import { EngineAdditionModal } from './components/EngineAdditionModal';
import { ConfigModal } from './components/ConfigModal';

import {
  ClassDef,
  MemberDef,
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
import { openModFolder, saveModFile, saveFileAs, canOpenFolders, cleanFolderPath, loadFolderFromPath } from './services/modFolder';
import { EditorConfig, loadConfig, saveConfig } from './services/config';

export default function App() {
  // Configuration State
  const [config, setConfig] = useState<EditorConfig>(() => loadConfig());
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);

  // Files State
  const [files, setFiles] = useState<Record<string, string>>({
    'mod.lua': INITIAL_TEMPLATE,
  });
  const [openFiles, setOpenFiles] = useState<string[]>(['mod.lua']);
  const [activeFile, setActiveFile] = useState<string>('mod.lua');

  // Opened mod folder (desktop app or Chromium browser)
  const [modFolder, setModFolder] = useState<{ name: string; root: string } | null>(null);
  const [savedFiles, setSavedFiles] = useState<Record<string, string>>({});

  // Active Code
  const activeCode = files[activeFile] || '';

  // Engine Custom Classes state
  const [customClasses, setCustomClasses] = useState<ClassDef[]>([]);

  // Selected symbol for DocPane
  const [selectedSymbolItem, setSelectedSymbolItem] = useState<any>(() => BUILTIN_CLASSES[0]);

  // Diagnostics and Symbols from Parser
  const [diagnostics, setDiagnostics] = useState<SyntaxDiagnostic[]>([]);
  const [symbols, setSymbols] = useState(() => parseAndValidate(INITIAL_TEMPLATE).symbols);
  const [hasRunCheck, setHasRunCheck] = useState<boolean>(true);

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
      text: 'Loaded WormForge API definitions (0.7.1 engine specifications).',
      type: 'success',
    },
  ]);

  // Modals
  const [isKeycodeModalOpen, setIsKeycodeModalOpen] = useState(false);
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
    (codeToTest: string, fileName?: string) => {
      const file = fileName || activeFile;
      const lower = file.toLowerCase();

      // If document is not Lua (.toml, .md, .txt, .json, .ini), skip Lua AST errors
      if (lower.endsWith('.toml') || lower.endsWith('.md') || lower.endsWith('.txt') || lower.endsWith('.json') || lower.endsWith('.ini')) {
        setDiagnostics([]);
        setHasRunCheck(true);
        return;
      }

      const now = new Date().toLocaleTimeString();
      const result = parseAndValidate(codeToTest);

      // Merge user custom classes
      const mergedClasses = [...result.symbols.classes];
      for (const cc of customClasses) {
        if (!mergedClasses.some((c) => c.name === cc.name)) {
          mergedClasses.push(cc);
        }
      }

      setDiagnostics(result.diagnostics);
      setSymbols({
        ...result.symbols,
        classes: mergedClasses,
      });
      setHasRunCheck(true);

      const errCount = result.diagnostics.filter((d) => d.severity === 'error').length;
      const warnCount = result.diagnostics.filter((d) => d.severity === 'warning').length;

      if (errCount === 0 && warnCount === 0) {
        setLogs((prev) => [
          ...prev,
          {
            time: now,
            text: `[Syntax Check]: OK - 0 syntax errors or desync violations. WormForge verbs verified.`,
            type: 'success',
          },
        ]);
      } else {
        setLogs((prev) => [
          ...prev,
          {
            time: now,
            text: `[Syntax Check]: ${errCount} error(s), ${warnCount} warning(s) detected. Check diagnostic output.`,
            type: errCount > 0 ? 'error' : 'warn',
          },
        ]);
      }
    },
    [customClasses, activeFile]
  );

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
  useEffect(() => {
    runSyntaxCheck(activeCode, activeFile);

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

    // 2. If an auto-load disk directory is specified, automatically scan and open its files
    if (config.autoLoadFolder) {
      const targetDir = cleanFolderPath(config.autoLoadFolder);
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
            const first = names.find((n) => n.toLowerCase().endsWith('.lua')) ?? names[0];
            setModFolder({ name: res.name, root: res.root });
            setSavedFiles(res.files);
            setFiles(res.files);
            setOpenFiles([first]);
            setActiveFile(first);
            runSyntaxCheck(res.files[first] ?? '', first);
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
          });
      }
    }
  }, []);

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
  const handleInsertCode = (snippet: string) => {
    const updated = activeCode + (activeCode.endsWith('\n') ? '' : '\n') + snippet + '\n';
    handleCodeChange(updated);
    runSyntaxCheck(updated);
    setLogs((prev) => [
      ...prev,
      {
        time: new Date().toLocaleTimeString(),
        text: `Inserted snippet into ${activeFile}.`,
        type: 'info',
      },
    ]);
  };

  // Format Code Helper
  const handleFormatCode = () => {
    const lines = activeCode.split('\n');
    let indent = 0;
    const formatted = lines
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return '';
        if (trimmed.match(/^(end|else|elseif|until|\})/)) {
          indent = Math.max(0, indent - 1);
        }
        const indented = '  '.repeat(indent) + trimmed;
        if (
          trimmed.match(/^(function|if|for|while|repeat|\bdo\b|\{)/) &&
          !trimmed.match(/\bend\b/)
        ) {
          indent++;
        }
        return indented;
      })
      .join('\n');

    handleCodeChange(formatted);
    runSyntaxCheck(formatted);
    setLogs((prev) => [
      ...prev,
      {
        time: new Date().toLocaleTimeString(),
        text: `Cleaned and formatted ${activeFile}.`,
        type: 'info',
      },
    ]);
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
      const first = names.find((n) => n.toLowerCase().endsWith('.lua')) ?? names[0];
      setModFolder({ name: res.name, root: res.root });
      setSavedFiles(res.files);
      setFiles(res.files);
      setOpenFiles([first]);
      setActiveFile(first);
      runSyntaxCheck(res.files[first] ?? '');
      addLog(`Opened folder "${res.name}" (${names.length} file${names.length === 1 ? '' : 's'}).`, 'success');
    } catch (e: any) {
      addLog(`Failed to open folder: ${e?.message ?? String(e)}`, 'error');
    }
  };

  const handleOpenWorkspaceFile = (name: string) => {
    if (!openFiles.includes(name)) {
      setOpenFiles((prev) => [...prev, name]);
    }
    setActiveFile(name);
    runSyntaxCheck(files[name] ?? '');
  };

  const saveFiles = async (fileNames: string[]) => {
    if (!modFolder) return;
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
        addLog(`Failed to save ${name}: ${e?.message ?? String(e)}`, 'error');
      }
    }
    setSavedFiles(nextSaved);
    if (savedCount > 0) {
      addLog(`Saved ${savedCount} file${savedCount === 1 ? '' : 's'} to "${modFolder.name}".`, 'success');
    }
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

  // Register Custom Class or Member from Modal
  const handleAddClassOrMember = (clsName: string, member: MemberDef) => {
    setCustomClasses((prev) => {
      const existing = prev.find((c) => c.name === clsName);
      if (existing) {
        return prev.map((c) =>
          c.name === clsName
            ? { ...c, members: [...c.members.filter((m) => m.name !== member.name), member] }
            : c
        );
      }
      return [
        ...prev,
        {
          name: clsName,
          description: `User-registered engine class (${clsName}${member.kind === 'method' ? ':' : '.'}${member.name})`,
          isCustom: true,
          syntaxExample: `${clsName}${member.kind === 'method' ? ':' : '.'}${member.name}(...)`,
          members: [member],
        },
      ];
    });

    setSelectedSymbolItem({
      name: clsName,
      isCustom: true,
      activeMember: member,
    });

    setLogs((prev) => [
      ...prev,
      {
        time: new Date().toLocaleTimeString(),
        text: `Registered new engine verb: ${clsName}${member.kind === 'method' ? ':' : '.'}${member.name}()`,
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

  // All combined classes (built-in + custom)
  const combinedClasses = useMemo(() => {
    const list = [...symbols.classes];
    for (const cc of customClasses) {
      if (!list.some((c) => c.name === cc.name)) {
        list.push(cc);
      }
    }
    return list;
  }, [symbols.classes, customClasses]);

  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warnCount = diagnostics.filter((d) => d.severity === 'warning').length;
  const isLight = config.theme === 'light';

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
      className={`flex flex-col h-screen w-screen overflow-hidden select-none transition-colors ${
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

          {/* Keycode Reference Tester Button */}
          <button
            onClick={() => setIsKeycodeModalOpen(true)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded border font-medium transition-colors ${
              isLight
                ? 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
                : 'bg-[#202631] hover:bg-[#2b3341] text-[#cfdbe8] border-[#2e3745]'
            }`}
            title="Inspect keycodes, hex values, and WormForge lockstep bitmasks"
          >
            <Keyboard className="w-3.5 h-3.5 text-sky-500" />
            <span className="hidden sm:inline">Keycode Tester</span>
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
          {canOpenFolders() && (
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
          )}
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
              variables={symbols.variables}
              enumerations={symbols.enums}
              functions={symbols.functions}
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
              code={activeCode}
              onChange={handleCodeChange}
              diagnostics={diagnostics}
              onCursorChange={handleCursorChange}
              activeFile={activeFile}
              fontSize={config.fontSize}
              lineHeight={config.lineHeight}
              theme={config.theme}
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
              isLight={isLight}
            />
          </div>
        </div>
      </div>

      {/* Keycode Reference & Tester Modal */}
      <KeycodeModal
        isOpen={isKeycodeModalOpen}
        onClose={() => setIsKeycodeModalOpen(false)}
        onInsertCode={handleInsertCode}
      />

      {/* Engine Verb & Custom Class Registration Modal */}
      <EngineAdditionModal
        isOpen={isEngineModalOpen}
        onClose={() => setIsEngineModalOpen(false)}
        onAddClassOrMember={handleAddClassOrMember}
        existingClasses={combinedClasses}
      />

      {/* Editor Configuration & Preferences Modal */}
      <ConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        config={config}
        onUpdateConfig={handleUpdateConfig}
        existingMods={EXISTING_MODS}
      />
    </div>
  );
}
