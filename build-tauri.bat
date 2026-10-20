@echo off
setlocal
title WormForge Editor - Tauri EXE build
cd /d "%~dp0"

where node >nul 2>nul || (echo [ERROR] Node.js not found. Install from https://nodejs.org & pause & exit /b 1)
where cargo >nul 2>nul || (echo [ERROR] Rust not found. Run: winget install Rustlang.Rustup  ^(then reopen this terminal^) & pause & exit /b 1)

echo [1/4] Cleaning old install...
if exist node_modules rmdir /s /q node_modules
if exist dist rmdir /s /q dist

echo [2/4] Installing packages...
REM Keep package-lock.json. Deleting it re-resolved every dependency on every
REM build, which let the Tauri npm plugins drift past the minor versions pinned
REM in src-tauri/Cargo.toml. `tauri build` refuses that combination ("mismatched
REM Tauri packages"), and it only shows up on a machine doing a fresh install.
REM npm ci is the lockfile-exact install; the fallback keeps a first-ever build
REM working if the lockfile is genuinely missing.
if exist package-lock.json (
  call npm ci --legacy-peer-deps
) else (
  call npm install --legacy-peer-deps
)
if errorlevel 1 (echo [ERROR] npm install failed. Paste the error above. & pause & exit /b 1)

echo [3/4] Building frontend...
call npm run build
if errorlevel 1 (echo [ERROR] Vite build failed. & pause & exit /b 1)

echo [4/4] Building EXE with Tauri ^(first run downloads Rust crates, takes several minutes^)...
call npx tauri build
if errorlevel 1 (echo [ERROR] Tauri build failed. Read the error above - common causes: ^(1^) tauri.conf.json frontendDist ^("npm run build" must succeed first^), ^(2^) missing permissions in src-tauri\capabilities\default.json, ^(3^) missing Visual Studio Build Tools with "Desktop development with C++" for the Rust link step. & pause & exit /b 1)

echo.
echo DONE: %CD%\src-tauri\target\release\wormforge-code-editor.exe
explorer "src-tauri\target\release"
pause
