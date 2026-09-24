@echo off
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
echo   %CD%\src-tauri\target\release\wormforge-code-editor.exe
echo.
echo Installer Bundle (if enabled):
echo   %CD%\src-tauri\target\release\bundle\
echo.

if exist "src-tauri\target\release" (
    explorer "src-tauri\target\release"
)
pause
