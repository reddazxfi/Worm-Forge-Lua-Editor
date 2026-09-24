@echo off
setlocal
title WormForge Editor - Tauri EXE build
cd /d "%~dp0"

where node >nul 2>nul || (echo [ERROR] Node.js not found. Install from https://nodejs.org & pause & exit /b 1)
where cargo >nul 2>nul || (echo [ERROR] Rust not found. Run: winget install Rustlang.Rustup  ^(then reopen this terminal^) & pause & exit /b 1)

echo [1/4] Cleaning old install...
if exist node_modules rmdir /s /q node_modules
if exist package-lock.json del /q package-lock.json
if exist dist rmdir /s /q dist

echo [2/4] Installing packages...
call npm install --legacy-peer-deps
if errorlevel 1 (echo [ERROR] npm install failed. Paste the error above. & pause & exit /b 1)

echo [3/4] Building frontend...
call npm run build
if errorlevel 1 (echo [ERROR] Vite build failed. & pause & exit /b 1)

echo [4/4] Building EXE with Tauri ^(first run downloads Rust crates, takes several minutes^)...
call npx tauri build
if errorlevel 1 (echo [ERROR] Tauri build failed. Need Visual Studio Build Tools with "Desktop development with C++". & pause & exit /b 1)

echo.
echo DONE: %CD%\src-tauri\target\release\wormforge-code-editor.exe
explorer "src-tauri\target\release"
pause
