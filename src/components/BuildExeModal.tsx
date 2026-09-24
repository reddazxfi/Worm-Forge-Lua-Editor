import React, { useState } from 'react';
import {
  Download,
  Copy,
  Check,
  Terminal,
  FileCode,
  Laptop,
  FolderOpen,
  CheckCircle2,
  X,
  Zap,
  ShieldCheck,
  Cpu,
  HardDrive,
  AlertTriangle,
} from 'lucide-react';

interface BuildExeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BuildExeModal: React.FC<BuildExeModalProps> = ({ isOpen, onClose }) => {
  const [targetFramework, setTargetFramework] = useState<'tauri' | 'electron'>('tauri');
  const [activeTab, setActiveTab] = useState<'steps' | 'bat' | 'ps1' | 'rust_setup'>('steps');
  const [copiedScript, setCopiedScript] = useState<string | null>(null);

  if (!isOpen) return null;

  // --- TAURI SCRIPTS ---
  const tauriBatScript = `@echo off
setlocal enabledelayedexpansion

title WormForge Editor - Lightweight Tauri .EXE Compiler
color 0B

echo =====================================================================
echo         WORMFORGE CODE EDITOR - LIGHTWEIGHT TAURI .EXE COMPILER
echo =====================================================================
echo.
echo  Tauri compiles a blazing fast, ultra-light standalone executable:
echo   - App size: ~6-10 MB (vs Electron's 150+ MB)
echo   - RAM usage: ~30 MB (vs Electron's 300+ MB)
echo   - Native Windows WebView2: zero installer errors!
echo =====================================================================
echo.

REM 1. Verify Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    color 0C
    echo [ERROR] Node.js is not found in your system PATH!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM 2. Verify Rust & Cargo are installed
where cargo >nul 2>nul
if %ERRORLEVEL% neq 0 (
    color 0E
    echo [INFO] Rust compiler is needed once to build the lightweight Tauri .exe.
    echo.
    echo You can install Rust in 1 minute using either:
    echo   1) Windows Terminal / PowerShell:
    echo      winget install --id Rustlang.Rustup
    echo   2) Or download the installer:
    echo      https://rustup.rs/
    echo.
    echo After installing Rust, restart this terminal and run build-tauri.bat again!
    echo.
    pause
    exit /b 1
)

echo [1/4] Installing / verifying Node.js packages...
call npm install

echo.
echo [2/4] Building React frontend with Vite...
call npm run build

echo.
echo [3/4] Compiling lightweight Windows native binary via Tauri...
call npx @tauri-apps/cli build

if %ERRORLEVEL% neq 0 (
    color 0C
    echo.
    echo [ERROR] Tauri build encountered an error!
    echo Check that C++ build tools or WebView2 are available on your system.
    pause
    exit /b 1
)

color 0A
echo.
echo =====================================================================
echo               SUCCESSFULLY COMPILED LIGHTWEIGHT .EXE!
echo =====================================================================
echo.
echo Direct Standalone Executable:
echo   %CD%\\src-tauri\\target\\release\\wormforge-code-editor.exe
echo.
echo Installer Bundle (if enabled):
echo   %CD%\\src-tauri\\target\\release\\bundle\\
echo.

if exist "src-tauri\\target\\release" (
    explorer "src-tauri\\target\\release"
)
pause
`;

  const tauriPs1Script = `# WormForge Code Editor - Lightweight Windows Tauri Executable Compiler
# Run via: powershell -ExecutionPolicy Bypass -File .\\build-tauri.ps1

Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "     WORMFORGE CODE EDITOR - LIGHTWEIGHT TAURI COMPILER (POWERSHELL)" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Benefits of Tauri over Electron:" -ForegroundColor Gray
Write-Host " - Lightweight: ~8 MB binary (vs 150+ MB Electron)" -ForegroundColor Green
Write-Host " - Memory: ~30 MB RAM (vs 300+ MB Electron)" -ForegroundColor Green
Write-Host " - Native Windows WebView2 integration without installer errors" -ForegroundColor Green
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js is not installed or not in PATH!" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Write-Host "[INFO] Rust compiler is required to build the Tauri native binary." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To install Rust automatically, run in PowerShell:" -ForegroundColor White
    Write-Host "    winget install --id Rustlang.Rustup" -ForegroundColor Cyan
    Write-Host "Or download from: https://rustup.rs/" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Restart your shell after installing Rust and rerun this script." -ForegroundColor Yellow
    exit 1
}

Write-Host "[1/4] Installing application dependencies..." -ForegroundColor Yellow
npm install

Write-Host "[2/4] Building Vite React distribution..." -ForegroundColor Yellow
npm run build

Write-Host "[3/4] Compiling Windows Standalone Native Executable via Tauri..." -ForegroundColor Yellow
npx @tauri-apps/cli build

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Tauri build failed. Check that C++ build tools are installed." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=====================================================================" -ForegroundColor Green
Write-Host "                  TAURI COMPILATION SUCCESSFUL!" -ForegroundColor Green
Write-Host "=====================================================================" -ForegroundColor Green
Write-Host "Standalone .EXE: $PSScriptRoot\\src-tauri\\target\\release\\wormforge-code-editor.exe" -ForegroundColor Cyan
Write-Host ""

if (Test-Path "$PSScriptRoot\\src-tauri\\target\\release") {
    Invoke-Item "$PSScriptRoot\\src-tauri\\target\\release"
}
`;

  // --- ELECTRON SCRIPTS (FALLBACK) ---
  const electronBatScript = `@echo off
setlocal enabledelayedexpansion

title WormForge Editor - Windows Electron .EXE Compiler
color 0B

echo [1/3] Checking dependencies...
call npm install
echo [2/3] Building React Vite client...
call npm run build
echo [3/3] Packaging Electron portable...
call npx electron-builder --win portable --x64
echo.
echo Executable located in: %CD%\\dist_exe\\WormForge-Editor-portable.exe
if exist "dist_exe" ( explorer dist_exe )
pause
`;

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedScript(id);
    setTimeout(() => setCopiedScript(null), 2000);
  };

  const handleDownload = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#12161f] border border-[#273142] rounded-xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-slate-200">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#232c3b] flex items-center justify-between bg-[#161b26]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                Compile to Windows .EXE
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700/60 font-semibold flex items-center gap-1">
                  <Zap className="w-3 h-3" /> Tauri ~8MB (Ultra-Light)
                </span>
              </h2>
              <p className="text-xs text-[#8292a5]">
                Native desktop build without Chromium bloat or installer crashes
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-[#202735] rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Framework Selector Bar */}
        <div className="flex items-center justify-between bg-[#0e1219] px-6 py-2.5 border-b border-[#1f2735]">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-[#6d7e93] uppercase tracking-wider">Framework:</span>
            <button
              onClick={() => {
                setTargetFramework('tauri');
                setActiveTab('steps');
              }}
              className={`px-3 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-all ${
                targetFramework === 'tauri'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-xs'
                  : 'bg-[#181f2b] text-[#7d8f9f] hover:text-slate-300 border border-[#263142]'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              <span>Tauri v2 (Recommended, ~8MB)</span>
            </button>
            <button
              onClick={() => {
                setTargetFramework('electron');
                setActiveTab('steps');
              }}
              className={`px-3 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-all ${
                targetFramework === 'electron'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                  : 'bg-[#181f2b] text-[#7d8f9f] hover:text-slate-300 border border-[#263142]'
              }`}
            >
              <Laptop className="w-3.5 h-3.5 text-amber-400" />
              <span>Electron (Fallback, ~160MB)</span>
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-3 text-[11px] text-[#778b9f]">
            <span className="flex items-center gap-1">
              <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
              {targetFramework === 'tauri' ? '~8 MB Size' : '~160 MB Size'}
            </span>
            <span className="flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5 text-sky-400" />
              {targetFramework === 'tauri' ? '~30 MB RAM' : '~350 MB RAM'}
            </span>
          </div>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex border-b border-[#202836] bg-[#10141d] px-6 gap-2 pt-2">
          <button
            onClick={() => setActiveTab('steps')}
            className={`px-3 py-2 text-xs font-medium border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'steps'
                ? 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-[#77889b] hover:text-slate-300'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            How to Compile (Quick Steps)
          </button>

          {targetFramework === 'tauri' ? (
            <>
              <button
                onClick={() => setActiveTab('bat')}
                className={`px-3 py-2 text-xs font-mono border-b-2 flex items-center gap-1.5 transition-colors ${
                  activeTab === 'bat'
                    ? 'border-emerald-400 text-emerald-300'
                    : 'border-transparent text-[#77889b] hover:text-slate-300'
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                build-tauri.bat (1-Click)
              </button>
              <button
                onClick={() => setActiveTab('ps1')}
                className={`px-3 py-2 text-xs font-mono border-b-2 flex items-center gap-1.5 transition-colors ${
                  activeTab === 'ps1'
                    ? 'border-emerald-400 text-emerald-300'
                    : 'border-transparent text-[#77889b] hover:text-slate-300'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                build-tauri.ps1 (PowerShell)
              </button>
              <button
                onClick={() => setActiveTab('rust_setup')}
                className={`px-3 py-2 text-xs border-b-2 flex items-center gap-1.5 transition-colors ${
                  activeTab === 'rust_setup'
                    ? 'border-emerald-400 text-emerald-300'
                    : 'border-transparent text-[#77889b] hover:text-slate-300'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Prerequisites (Rust 1-Min)
              </button>
            </>
          ) : (
            <button
              onClick={() => setActiveTab('bat')}
              className={`px-3 py-2 text-xs font-mono border-b-2 flex items-center gap-1.5 transition-colors ${
                activeTab === 'bat'
                  ? 'border-amber-400 text-amber-300'
                  : 'border-transparent text-[#77889b] hover:text-slate-300'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              build-exe.bat (Electron)
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-[#a4b5c8]">
          {/* STEP BY STEP GUIDE */}
          {activeTab === 'steps' && targetFramework === 'tauri' && (
            <div className="space-y-4">
              {/* Highlight Banner */}
              <div className="p-3.5 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-[#bfe2cc] leading-relaxed flex items-start gap-3">
                <Zap className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-emerald-300">Why Tauri is better than Electron:</span>
                  <p className="mt-1 text-slate-300">
                    Electron packages an entire Chromium browser and Node runtime, causing installer corruption, NSIS errors, and a bloated 160MB download. 
                    <strong className="text-emerald-300"> Tauri uses the native Windows WebView2</strong> (already included in Windows 10/11) with a lightweight Rust runner. The output is a tiny <strong className="text-white font-mono">~8MB standalone .exe</strong> with zero installer hassle.
                  </p>
                </div>
              </div>

              {/* Step 1: Rust requirement */}
              <div className="flex gap-3 items-start bg-[#161b25] p-3.5 rounded-lg border border-[#232c3d]">
                <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 font-bold flex items-center justify-center shrink-0 text-xs">
                  1
                </div>
                <div className="flex-1 space-y-1.5">
                  <div className="font-semibold text-slate-100 text-sm">One-Time Setup: Install Rust & Cargo</div>
                  <p>
                    Tauri compiles native Windows machine code using the Rust compiler. If you don't already have Rust, install it in seconds via PowerShell:
                  </p>
                  <div className="bg-[#0b0e14] border border-[#222938] rounded-md p-2 font-mono text-[11px] text-emerald-300 flex items-center justify-between">
                    <code>winget install --id Rustlang.Rustup</code>
                    <button
                      onClick={() => handleCopy('winget install --id Rustlang.Rustup', 'winget')}
                      className="text-slate-400 hover:text-white p-1"
                      title="Copy command"
                    >
                      {copiedScript === 'winget' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-[#718296]">
                    Or download the installer from <a href="https://rustup.rs" target="_blank" rel="noreferrer" className="text-sky-400 underline">https://rustup.rs</a>. (WebView2 is already built into modern Windows 10 & 11).
                  </p>
                </div>
              </div>

              {/* Step 2: Download build script */}
              <div className="flex gap-3 items-start bg-[#161b25] p-3.5 rounded-lg border border-[#232c3d]">
                <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 font-bold flex items-center justify-center shrink-0 text-xs">
                  2
                </div>
                <div className="flex-1 space-y-1.5">
                  <div className="font-semibold text-slate-100 text-sm">Get the 1-Click Builder Script</div>
                  <p>
                    Download <span className="font-mono text-emerald-300">build-tauri.bat</span> (already configured in the project root) or run it directly:
                  </p>
                  <div className="pt-1 flex items-center gap-2">
                    <button
                      onClick={() => handleDownload('build-tauri.bat', tauriBatScript)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-md transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download build-tauri.bat
                    </button>
                    <button
                      onClick={() => handleDownload('build-tauri.ps1', tauriPs1Script)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#222b3b] hover:bg-[#2c374b] text-slate-200 border border-[#37455c] text-xs transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download build-tauri.ps1
                    </button>
                  </div>
                </div>
              </div>

              {/* Step 3: Run and collect .exe */}
              <div className="flex gap-3 items-start bg-[#161b25] p-3.5 rounded-lg border border-[#232c3d]">
                <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 font-bold flex items-center justify-center shrink-0 text-xs">
                  3
                </div>
                <div className="flex-1 space-y-1.5">
                  <div className="font-semibold text-slate-100 text-sm">Run Script & Grab Your ~8MB Standalone .EXE</div>
                  <p>
                    Double-click <span className="font-mono text-emerald-300">build-tauri.bat</span> or execute in terminal:
                  </p>
                  <div className="bg-[#0b0e14] border border-[#222938] rounded-md p-2 font-mono text-[11px] text-amber-300 flex items-center justify-between">
                    <code>npm run build:tauri</code>
                    <button
                      onClick={() => handleCopy('npm run build:tauri', 'npm_tauri')}
                      className="text-slate-400 hover:text-white p-1"
                      title="Copy command"
                    >
                      {copiedScript === 'npm_tauri' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <p>Your executable will be immediately generated at:</p>
                  <div className="bg-[#0b0e14] border border-[#222938] rounded-md p-2 font-mono text-[11px] text-emerald-400 flex items-center gap-2">
                    <FolderOpen className="w-4 h-4 text-emerald-400" />
                    <span>src-tauri\target\release\wormforge-code-editor.exe</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP BY STEP GUIDE (ELECTRON FALLBACK) */}
          {activeTab === 'steps' && targetFramework === 'electron' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-lg bg-amber-950/30 border border-amber-500/30 text-[#e0cfbb] leading-relaxed flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-amber-300">Electron Note:</span>
                  <p className="mt-1 text-slate-300">
                    If electron-builder installer is erroring out on your machine, we strongly recommend switching to the <strong className="text-emerald-300">Tauri</strong> tab above. Electron bundles Chromium which frequently causes NSIS script timeouts or antivirus false positives.
                  </p>
                </div>
              </div>

              <div className="bg-[#161b25] p-3.5 rounded-lg border border-[#232c3d] space-y-2">
                <div className="font-semibold text-slate-100 text-sm">To build with Electron anyway:</div>
                <div className="bg-[#0b0e14] border border-[#222938] rounded-md p-2 font-mono text-[11px] text-amber-300 flex items-center justify-between">
                  <code>npm run build && npx electron-builder --win portable --x64</code>
                  <button
                    onClick={() => handleCopy('npm run build && npx electron-builder --win portable --x64', 'el_cmd')}
                    className="text-slate-400 hover:text-white p-1"
                  >
                    {copiedScript === 'el_cmd' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-[11px] text-[#718296]">Output: dist_exe\WormForge-Editor-portable.exe</p>
              </div>
            </div>
          )}

          {/* TAURI BAT TAB */}
          {activeTab === 'bat' && targetFramework === 'tauri' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  build-tauri.bat (1-Click Windows Compiler)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCopy(tauriBatScript, 'tauri_bat')}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#202735] hover:bg-[#2b3547] text-slate-200 border border-[#303c51] text-xs transition-colors"
                  >
                    {copiedScript === 'tauri_bat' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedScript === 'tauri_bat' ? 'Copied!' : 'Copy Script'}</span>
                  </button>
                  <button
                    onClick={() => handleDownload('build-tauri.bat', tauriBatScript)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs shadow transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .bat</span>
                  </button>
                </div>
              </div>

              <pre className="bg-[#090c12] border border-[#1e2532] rounded-lg p-3.5 font-mono text-[11px] text-[#b8c9dd] overflow-x-auto leading-relaxed max-h-72">
                {tauriBatScript}
              </pre>
            </div>
          )}

          {/* TAURI PS1 TAB */}
          {activeTab === 'ps1' && targetFramework === 'tauri' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <FileCode className="w-4 h-4 text-emerald-400" />
                  build-tauri.ps1 (PowerShell Script)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCopy(tauriPs1Script, 'tauri_ps1')}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#202735] hover:bg-[#2b3547] text-slate-200 border border-[#303c51] text-xs transition-colors"
                  >
                    {copiedScript === 'tauri_ps1' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedScript === 'tauri_ps1' ? 'Copied!' : 'Copy Script'}</span>
                  </button>
                  <button
                    onClick={() => handleDownload('build-tauri.ps1', tauriPs1Script)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs shadow transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .ps1</span>
                  </button>
                </div>
              </div>

              <pre className="bg-[#090c12] border border-[#1e2532] rounded-lg p-3.5 font-mono text-[11px] text-[#b8c9dd] overflow-x-auto leading-relaxed max-h-72">
                {tauriPs1Script}
              </pre>
            </div>
          )}

          {/* ELECTRON BAT TAB */}
          {activeTab === 'bat' && targetFramework === 'electron' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <Terminal className="w-4 h-4 text-amber-400" />
                  build-exe.bat (Electron Compiler)
                </span>
                <button
                  onClick={() => handleDownload('build-exe.bat', electronBatScript)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs shadow transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .bat</span>
                </button>
              </div>

              <pre className="bg-[#090c12] border border-[#1e2532] rounded-lg p-3.5 font-mono text-[11px] text-[#b8c9dd] overflow-x-auto leading-relaxed max-h-72">
                {electronBatScript}
              </pre>
            </div>
          )}

          {/* PREREQUISITES TAB */}
          {activeTab === 'rust_setup' && (
            <div className="space-y-3">
              <div className="font-semibold text-slate-200 text-sm flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Tauri Windows Prerequisites
              </div>
              <p>Tauri compiles directly to a native Windows PE executable. It only requires two things:</p>

              <div className="space-y-2.5 pt-1">
                <div className="p-3 bg-[#161b25] border border-[#232c3d] rounded-lg space-y-1">
                  <div className="font-medium text-slate-100 flex items-center gap-2">
                    <span className="text-emerald-400 font-bold">1. Rust & Cargo</span>
                    <span className="text-[10px] bg-[#222b3b] px-1.5 py-0.5 rounded text-[#91a3b8]">Required for compilation</span>
                  </div>
                  <p className="text-[11.5px] text-[#8ea0b5]">
                    Open PowerShell and run: <code className="bg-[#0b0e14] px-1.5 py-0.5 rounded text-emerald-300 font-mono">winget install --id Rustlang.Rustup</code>.
                    Follow the standard prompt (choose option 1). Takes ~1 minute.
                  </p>
                </div>

                <div className="p-3 bg-[#161b25] border border-[#232c3d] rounded-lg space-y-1">
                  <div className="font-medium text-slate-100 flex items-center gap-2">
                    <span className="text-emerald-400 font-bold">2. Microsoft Edge WebView2</span>
                    <span className="text-[10px] bg-emerald-950 text-emerald-300 px-1.5 py-0.5 rounded font-mono">Already Preinstalled</span>
                  </div>
                  <p className="text-[11.5px] text-[#8ea0b5]">
                    Already built into Windows 10 (version 1803+) and all Windows 11 installations. No installation needed!
                  </p>
                </div>

                <div className="p-3 bg-[#161b25] border border-[#232c3d] rounded-lg space-y-1">
                  <div className="font-medium text-slate-100 flex items-center gap-2">
                    <span className="text-emerald-400 font-bold">3. Visual Studio C++ Build Tools</span>
                    <span className="text-[10px] bg-[#222b3b] px-1.5 py-0.5 rounded text-[#91a3b8]">Standard for Windows Rust</span>
                  </div>
                  <p className="text-[11.5px] text-[#8ea0b5]">
                    Rustup will automatically prompt you to install the Visual Studio C++ build tools if they are not already detected.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-[#202836] bg-[#141822] flex items-center justify-between">
          <div className="text-[11px] text-[#697a8e] flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Tauri config ready at <code className="text-slate-300 font-mono">src-tauri/tauri.conf.json</code></span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-md bg-[#252f40] hover:bg-[#303d52] text-slate-200 font-medium text-xs transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
