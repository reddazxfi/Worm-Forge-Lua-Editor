import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Play,
  CheckCircle,
  AlertTriangle,
  Keyboard,
  Plus,
  Download,
  Upload,
  Sparkles,
  FileCode,
  AlignLeft,
  Share2,
  Layers,
  Terminal,
  BookOpen,
  FolderOpen,
  Save,
} from 'lucide-react';
import { CollabHeader } from './components/CollabHeader';
import { UpperCornerTree } from './components/UpperCornerTree';
import { DocPane } from './components/DocPane';
import { CodeEditor } from './components/CodeEditor';
import { ConsoleOutput } from './components/ConsoleOutput';
import { CollabChatDrawer } from './components/CollabChatDrawer';
import { KeycodeModal } from './components/KeycodeModal';
import { EngineAdditionModal } from './components/EngineAdditionModal';

import {
  ClassDef,
  CollabMessage,
  CollabUser,
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
import { collabService } from './services/collab';
import { openModFolder, saveModFile, canOpenFolders } from './services/modFolder';

export default function App() {
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
      text: 'Loaded WormForge API definitions and lockstep checks.',
      type: 'success',
    },
  ]);

  // Collaboration State
  const [room, setRoom] = useState<string>(() => collabService.getRoom());
  const [connectedUsers, setConnectedUsers] = useState<CollabUser[]>(() =>
    collabService.getConnectedUsers()
  );
  const [currentUser, setCurrentUser] = useState<CollabUser>(() =>
    collabService.getCurrentUser()
  );
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [unreadChatCount, setUnreadChatCount] = useState<number>(0);
  const [chatMessages, setChatMessages] = useState<
    NonNullable<CollabMessage['chatMsg']>[]
  >([]);

  // Modals
  const [isKeycodeModalOpen, setIsKeycodeModalOpen] = useState(false);
  const [isEngineModalOpen, setIsEngineModalOpen] = useState(false);

  // Layout View State (Mobile responsive tabs)
  const [mobileTab, setMobileTab] = useState<'editor' | 'tree' | 'docs' | 'console'>('editor');

  // Trigger AST Parsing and Validation
  const runSyntaxCheck = useCallback(
    (codeToTest: string) => {
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
    [customClasses]
  );

  // Initial validation
  useEffect(() => {
    runSyntaxCheck(activeCode);
  }, []);

  // Wire Collaboration Service
  useEffect(() => {
    collabService.onConnectionStatus = (connected) => {
      setIsConnected(connected);
      setLogs((prev) => [
        ...prev,
        {
          time: new Date().toLocaleTimeString(),
          text: connected
            ? `Connected to collaborative room "${collabService.getRoom()}".`
            : 'Disconnected from collaboration server. Using local BroadcastChannel.',
          type: connected ? 'success' : 'warn',
        },
      ]);
    };

    collabService.onUsersChanged = (users) => {
      setConnectedUsers(users);
    };

    collabService.onCodeReceived = (remoteCode, senderId, file) => {
      const targetFile = file || activeFile;
      setFiles((prev) => ({
        ...prev,
        [targetFile]: remoteCode,
      }));
      // Re-run validation on incoming changes
      runSyntaxCheck(remoteCode);
    };

    collabService.onChatMessage = (msg) => {
      setChatMessages((prev) => [...prev, msg]);
      if (!isChatOpen) {
        setUnreadChatCount((prev) => prev + 1);
      }
    };

    return () => {
      // Cleanup on unmount
    };
  }, [activeFile, isChatOpen, runSyntaxCheck]);

  // Handle local code edit
  const handleCodeChange = (newCode: string) => {
    setFiles((prev) => ({
      ...prev,
      [activeFile]: newCode,
    }));
    collabService.sendCodeChange(newCode, activeFile);

    // Continuous lightweight check
    const result = parseAndValidate(newCode);
    setDiagnostics(result.diagnostics);
  };

  // Cursor change for collaboration
  const handleCursorChange = (line: number, column: number) => {
    collabService.sendCursor(line, column, activeFile);
  };

  // Room change
  const handleRoomChange = (newRoom: string) => {
    collabService.setRoom(newRoom);
    setRoom(newRoom);
    setLogs((prev) => [
      ...prev,
      {
        time: new Date().toLocaleTimeString(),
        text: `Switched collaborative room to "${newRoom}".`,
        type: 'info',
      },
    ]);
  };

  // User name change
  const handleUpdateUserName = (newName: string) => {
    collabService.updateUserName(newName);
    setCurrentUser(collabService.getCurrentUser());
  };

  // Chat send
  const handleSendMessage = (text: string) => {
    collabService.sendChat(text);
  };

  // Insert code into editor at cursor
  const handleInsertCode = (snippet: string) => {
    const updated = activeCode + '\n' + snippet;
    handleCodeChange(updated);
    setLogs((prev) => [
      ...prev,
      {
        time: new Date().toLocaleTimeString(),
        text: `Inserted snippet into ${activeFile}.`,
        type: 'info',
      },
    ]);
  };

  // Format code
  const handleFormatCode = () => {
    const formatted = activeCode
      .split('\n')
      .map((line) => line.replace(/\t/g, '  ').trimEnd())
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

  // Load Mod or Template
  const handleLoadTemplate = (templateId: string) => {
    const mod = EXISTING_MODS.find((m) => m.id === templateId);
    if (mod && mod.files.length > 0) {
      const newFiles = { ...files };
      const newOpen = [...openFiles];
      const prefix = mod.id.replace('example.', '');
      let primaryFile = '';

      for (let i = 0; i < mod.files.length; i++) {
        const f = mod.files[i];
        const filePath = `${prefix}/${f.name}`;
        newFiles[filePath] = f.content;
        if (!newOpen.includes(filePath)) {
          newOpen.push(filePath);
        }
        if (i === 0) {
          primaryFile = filePath;
        }
      }

      setFiles(newFiles);
      setOpenFiles(newOpen);
      setActiveFile(primaryFile);
      runSyntaxCheck(newFiles[primaryFile]);

      setLogs((prev) => [
        ...prev,
        {
          time: new Date().toLocaleTimeString(),
          text: `Loaded mod package "${mod.name}" (${mod.files.length} files: ${mod.files.map((f) => `${prefix}/${f.name}`).join(', ')}).`,
          type: 'success',
        },
      ]);
    }
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
      runSyntaxCheck(res.files[first]);
      addLog(`Opened folder "${res.name}" (${names.length} files).`, 'success');
    } catch (e: any) {
      addLog(`Could not open folder: ${e?.message ?? String(e)}`, 'error');
    }
  };

  const saveFiles = async (names: string[]) => {
    if (!modFolder) return;
    try {
      const written: Record<string, string> = {};
      for (const n of names) {
        await saveModFile(modFolder.root, n, files[n]);
        written[n] = files[n];
      }
      setSavedFiles((prev) => ({ ...prev, ...written }));
      addLog(`Saved ${names.length} file${names.length === 1 ? '' : 's'} to "${modFolder.name}".`, 'success');
    } catch (e: any) {
      addLog(`Save failed: ${e?.message ?? String(e)}`, 'error');
    }
  };

  const handleOpenWorkspaceFile = (f: string) => {
    if (!openFiles.includes(f)) setOpenFiles((prev) => [...prev, f]);
    setActiveFile(f);
    runSyntaxCheck(files[f] ?? '');
  };

  // Ctrl+S: save active file into the open folder, or export it if no folder is open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (modFolder) saveFiles([activeFile]);
        else handleExportFile();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Export current file
  const handleExportFile = () => {
    const blob = new Blob([activeCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = activeFile;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Import local file
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
      runSyntaxCheck(content);
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

    // Also update current active selection in DocPane
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

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0e1115] text-[#cfdbe8] overflow-hidden select-none">
      {/* Top Collaboration Header */}
      <CollabHeader
        room={room}
        onRoomChange={handleRoomChange}
        connectedUsers={connectedUsers}
        currentUser={currentUser}
        onUpdateUserName={handleUpdateUserName}
        isConnected={isConnected}
        onToggleChat={() => {
          setIsChatOpen(!isChatOpen);
          if (!isChatOpen) setUnreadChatCount(0);
        }}
        isChatOpen={isChatOpen}
        unreadChatCount={unreadChatCount}
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
      />

      {/* Main Studio Action Toolbar */}
      <div className="px-3 py-1.5 bg-[#171b21] border-b border-[#242b35] flex items-center justify-between text-xs gap-2 shrink-0">
        <div className="flex items-center gap-2">
          {/* Primary SYNTAX CHECK Button */}
          <button
            onClick={() => runSyntaxCheck(activeCode)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-bold shadow-md transition-all ${
              errorCount > 0
                ? 'bg-rose-500 hover:bg-rose-400 text-white'
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
            className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-[#202631] hover:bg-[#2b3341] text-[#cfdbe8] border border-[#2e3745] font-medium"
            title="Inspect keycodes, hex values, and WormForge lockstep bitmasks"
          >
            <Keyboard className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">Keycode Tester</span>
          </button>

          {/* Add Engine Verb Button */}
          <button
            onClick={() => setIsEngineModalOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-[#202631] hover:bg-[#2b3341] text-amber-300 border border-amber-500/30 font-medium"
            title="Register custom methods (:) and functions/properties (.)"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">+ Custom Verb</span>
          </button>

          {/* Format Code */}
          <button
            onClick={handleFormatCode}
            className="hidden md:flex items-center gap-1 px-2 py-1.5 rounded bg-[#202631] hover:bg-[#2b3341] text-[#8e9eb2] hover:text-[#d3e0f0] border border-[#2b3340]"
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
              className="flex items-center gap-1 px-2 py-1.5 rounded bg-[#202631] hover:bg-[#2b3341] text-[#93a6bd] hover:text-[#dce7f3] border border-[#2b3340]"
              title="Open a mod folder"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Open Folder</span>
            </button>
          )}
          {modFolder && (
            <button
              onClick={() => saveFiles(dirtyFiles.length ? dirtyFiles : [activeFile])}
              className="flex items-center gap-1 px-2 py-1.5 rounded bg-[#202631] hover:bg-[#2b3341] text-[#93a6bd] hover:text-[#dce7f3] border border-[#2b3340]"
              title="Save changed files to the folder (Ctrl+S saves the current file)"
            >
              <Save className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Save{dirtyFiles.length > 0 ? ` (${dirtyFiles.length})` : ''}</span>
            </button>
          )}

          {/* Quick Upload Local Lua */}
          <label className="flex items-center gap-1 px-2 py-1.5 rounded bg-[#202631] hover:bg-[#2b3341] text-[#93a6bd] hover:text-[#dce7f3] border border-[#2b3340] cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Import</span>
            <input
              type="file"
              accept=".lua,.txt"
              onChange={handleImportFile}
              className="hidden"
            />
          </label>

          {/* Export File */}
          <button
            onClick={handleExportFile}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-[#202631] hover:bg-[#2b3341] text-[#93a6bd] hover:text-[#dce7f3] border border-[#2b3340]"
            title="Export current script"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {/* Mobile Tab Switcher */}
      <div className="lg:hidden flex items-center bg-[#13161c] border-b border-[#232932] text-xs font-semibold">
        <button
          onClick={() => setMobileTab('editor')}
          className={`flex-1 py-1.5 text-center flex items-center justify-center gap-1 ${
            mobileTab === 'editor'
              ? 'bg-[#1a1e26] text-amber-300 border-b-2 border-amber-400'
              : 'text-[#6f8095]'
          }`}
        >
          <FileCode className="w-3 h-3" />
          <span>Editor</span>
        </button>
        <button
          onClick={() => setMobileTab('tree')}
          className={`flex-1 py-1.5 text-center flex items-center justify-center gap-1 ${
            mobileTab === 'tree'
              ? 'bg-[#1a1e26] text-amber-300 border-b-2 border-amber-400'
              : 'text-[#6f8095]'
          }`}
        >
          <Layers className="w-3 h-3" />
          <span>API Tree</span>
        </button>
        <button
          onClick={() => setMobileTab('docs')}
          className={`flex-1 py-1.5 text-center flex items-center justify-center gap-1 ${
            mobileTab === 'docs'
              ? 'bg-[#1a1e26] text-amber-300 border-b-2 border-amber-400'
              : 'text-[#6f8095]'
          }`}
        >
          <BookOpen className="w-3 h-3" />
          <span>Docs</span>
        </button>
        <button
          onClick={() => setMobileTab('console')}
          className={`flex-1 py-1.5 text-center flex items-center justify-center gap-1 ${
            mobileTab === 'console'
              ? 'bg-[#1a1e26] text-amber-300 border-b-2 border-amber-400'
              : 'text-[#6f8095]'
          }`}
        >
          <Terminal className="w-3 h-3" />
          <span>Console ({errorCount})</span>
        </button>
      </div>

      {/* Center Layout Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Column: Upper Corner Tree & Doc Pane */}
        <div
          className={`w-full lg:w-80 xl:w-96 flex flex-col border-r border-[#242b36] shrink-0 bg-[#16191f] ${
            mobileTab === 'editor' || mobileTab === 'console' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {/* Upper Corner Tree: Variables, Enums, Functions, Classes, Existing Mods */}
          <div
            className={`h-3/5 min-h-[220px] overflow-hidden flex flex-col ${
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
            />
          </div>

          {/* Lower Left: Doc Pane */}
          <div
            className={`h-2/5 min-h-[160px] overflow-hidden flex flex-col border-t border-[#232932] ${
              mobileTab === 'tree' ? 'hidden lg:flex' : 'flex'
            }`}
          >
            <DocPane
              selectedItem={selectedSymbolItem}
              onInsertCode={handleInsertCode}
              onLoadTemplate={handleLoadTemplate}
            />
          </div>
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
              remoteUsers={connectedUsers.filter((u) => u.id !== currentUser.id)}
              activeFile={activeFile}
            />
          </div>

          {/* Bottom Stage: Console & AST Output */}
          <div
            className={`h-52 lg:h-60 border-t border-[#242b36] shrink-0 ${
              mobileTab === 'editor' ? 'hidden lg:block' : 'block'
            }`}
          >
            <ConsoleOutput
              diagnostics={diagnostics}
              logs={logs}
              onSelectDiagnostic={(diag) => {
                // Focus and log diagnostic info
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
            />
          </div>
        </div>

        {/* Right Collaboration Chat Drawer */}
        <CollabChatDrawer
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          messages={chatMessages}
          onSendMessage={handleSendMessage}
          currentUser={currentUser}
          connectedUsers={connectedUsers}
        />
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
    </div>
  );
}
