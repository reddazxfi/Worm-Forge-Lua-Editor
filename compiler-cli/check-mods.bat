@echo off
rem ---------------------------------------------------------------------------
rem  check-mods.bat -- check a folder of WormForge Lua mods.
rem
rem  Double-click it: it checks this folder and leaves the window open so you can
rem  read the result. From a terminal, pass a path:
rem
rem      check-mods.bat  C:\Games\Worms\Mods\mymod
rem      check-mods.bat  --strict  C:\...\Mods
rem      check-mods.bat  /nopause --format json  C:\...\Mods > out.json
rem
rem  Anything after /nopause is passed straight to wfcheck.exe. `wfcheck --help`
rem  is the real documentation; this file only finds the executable and decides
rem  whether to hold the window open.
rem ---------------------------------------------------------------------------
setlocal enabledelayedexpansion

rem --- find wfcheck.exe: beside this script first, then the cargo output dirs ---
set "HERE=%~dp0"
set "EXE=%HERE%wfcheck.exe"
if not exist "%EXE%" set "EXE=%HERE%target\release\wfcheck.exe"
if not exist "%EXE%" set "EXE=%HERE%target\debug\wfcheck.exe"

if not exist "%EXE%" (
    echo wfcheck.exe was not found.
    echo.
    echo   looked next to this script:  %HERE%
    echo   looked in the build folder:  target\release\wfcheck.exe
    echo.
    echo If someone sent you this file, ask them for wfcheck.exe and put the two
    echo files in the same folder. If you cloned the repository, build it with:
    echo.
    echo   cd compiler-cli
    echo   cargo build --release
    echo.
    pause
    exit /b 2
)

rem --- collect arguments, dropping /nopause and remembering whether to pause ---
rem  PAUSE starts at 1 because the common case is a double-click, which closes
rem  the window before anyone can read the result. /nopause clears it, and must
rem  also be dropped from ARGS or wfcheck would reject it as an unknown option.
set "PAUSE=1"
set "ARGS="
:collect
if "%~1"=="" goto collected
if /i "%~1"=="/nopause" (
    set "PAUSE=0"
    goto skip
)
set "ARGS=!ARGS! "%~1""
:skip
shift
goto collect
:collected

rem --- a bare double-click clears the window first, so a long run is readable ---
if "%ARGS%"=="" (
    "%EXE%" --clear .
) else (
    "%EXE%" !ARGS!
)
set "CODE=!errorlevel!"

echo.
if "!CODE!"=="0" (
    echo All good - nothing to fix.
) else (
    echo wfcheck finished with exit code !CODE!.
    echo   1 = it found something   2 = bad arguments   3 = the tool broke
)

if "!PAUSE!"=="1" pause
endlocal & exit /b %CODE%