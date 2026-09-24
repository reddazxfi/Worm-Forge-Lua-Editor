# WormForge Code Editor - Lightweight Windows Tauri Executable Compiler
# Run via: powershell -ExecutionPolicy Bypass -File .\build-tauri.ps1

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
Write-Host "Standalone .EXE: $PSScriptRoot\src-tauri\target\release\wormforge-code-editor.exe" -ForegroundColor Cyan
Write-Host ""

if (Test-Path "$PSScriptRoot\src-tauri\target\release") {
    Invoke-Item "$PSScriptRoot\src-tauri\target\release"
}
