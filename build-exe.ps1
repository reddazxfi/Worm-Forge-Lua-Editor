# WormForge Code Editor - Windows PowerShell Executable Compiler
# Run via: powershell -ExecutionPolicy Bypass -File .\build-exe.ps1

Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "        WORMFORGE CODE EDITOR - WINDOWS .EXE COMPILER (POWERSHELL)" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js is not installed or not in PATH!" -ForegroundColor Red
    Write-Host "Please install Node.js v18 or v20+ from https://nodejs.org/" -ForegroundColor Yellow
    Read-Host "Press Enter to exit..."
    exit 1
}

$nodeVersion = node -v
Write-Host "[OK] Node.js version detected: $nodeVersion" -ForegroundColor Green

# 2. Install dependencies
Write-Host ""
Write-Host "[1/4] Installing application dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] npm install encountered an error." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[2/4] Ensuring Electron & electron-builder dev tools..." -ForegroundColor Yellow
npm install --save-dev electron electron-builder
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to install electron-builder." -ForegroundColor Red
    exit 1
}

# 3. Build Vite bundle
Write-Host ""
Write-Host "[3/4] Building Vite React distribution..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Vite build failed." -ForegroundColor Red
    exit 1
}

# 4. Compile with electron-builder
Write-Host ""
Write-Host "[4/4] Packaging Windows Standalone Portable Executable..." -ForegroundColor Yellow
npx electron-builder --win portable --x64
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] electron-builder compilation failed." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=====================================================================" -ForegroundColor Green
Write-Host "                 COMPILATION SUCCESSFUL!" -ForegroundColor Green
Write-Host "=====================================================================" -ForegroundColor Green
Write-Host "Executable output directory: $PSScriptRoot\dist_exe\" -ForegroundColor Cyan
Write-Host ""

if (Test-Path "$PSScriptRoot\dist_exe") {
    Invoke-Item "$PSScriptRoot\dist_exe"
}

Read-Host "Press Enter to exit..."
