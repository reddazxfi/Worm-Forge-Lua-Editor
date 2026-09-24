@echo off
setlocal enabledelayedexpansion

title WormForge Editor - Windows .EXE Compiler
color 0B

echo =====================================================================
echo           WORMFORGE CODE EDITOR - WINDOWS .EXE COMPILER
echo =====================================================================
echo.

REM 1. Verify Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    color 0C
    echo [ERROR] Node.js is not found in your system PATH!
    echo.
    echo Please install Node.js (v18 or v20+ recommended) from:
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo [OK] Node.js detected: %NODE_VER%

REM 2. Check and install dependencies
echo.
echo [1/4] Checking and installing build dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    color 0C
    echo [ERROR] npm install failed. Please check network connection.
    pause
    exit /b 1
)

REM Ensure electron and electron-builder are present
echo.
echo [2/4] Ensuring Electron and electron-builder are installed...
call npm install --save-dev electron electron-builder
if %ERRORLEVEL% neq 0 (
    color 0C
    echo [ERROR] Failed to install electron / electron-builder.
    pause
    exit /b 1
)

REM 3. Build Vite production bundle
echo.
echo [3/4] Compiling React frontend with Vite...
call npm run build
if %ERRORLEVEL% neq 0 (
    color 0C
    echo [ERROR] Vite build failed!
    pause
    exit /b 1
)

REM 4. Package into Windows Executable
echo.
echo [4/4] Packaging into Windows Standalone Executable (.exe)...
echo Target: Windows x64 (Portable Executable)
echo.

call npx electron-builder --win portable --x64
if %ERRORLEVEL% neq 0 (
    color 0C
    echo [ERROR] electron-builder failed!
    pause
    exit /b 1
)

color 0A
echo.
echo =====================================================================
echo                     SUCCESSFULLY COMPILED TO .EXE!
echo =====================================================================
echo.
echo Your Windows executable is located in:
echo   %CD%\dist_exe\
echo.
echo You can run WormForge-Editor-portable.exe directly or copy it anywhere!
echo =====================================================================
echo.

REM Automatically open the output folder in Windows File Explorer
if exist "dist_exe" (
    explorer dist_exe
)

pause
