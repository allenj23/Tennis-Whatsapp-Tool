@echo off
setlocal
cd /d "%~dp0"

echo WhatsApp Campaign Tool - Install
echo.

if exist "%~dp0runtime\node\node.exe" (
    echo Using bundled Node.js runtime.
    goto :deps
)

where node >nul 2>&1
if errorlevel 1 (
    echo Node.js is not installed and no bundled runtime was found.
    echo.
    echo Option A: Download the full release build ^(includes Node.js^).
    echo Option B: Install Node.js LTS from https://nodejs.org then run Install.bat again.
    pause
    exit /b 1
)
echo Using system Node.js.

:deps
if exist "%~dp0node_modules\" (
    echo Dependencies already installed.
    goto :done
)

echo Installing dependencies ^(first run may take several minutes^)...
if exist "%~dp0runtime\node\npm.cmd" (
    call "%~dp0runtime\node\npm.cmd" ci --omit=dev
    if errorlevel 1 call "%~dp0runtime\node\npm.cmd" install --omit=dev
) else (
    call npm.cmd ci --omit=dev
    if errorlevel 1 call npm.cmd install --omit=dev
)

if not exist "%~dp0node_modules\" (
    echo Install failed.
    pause
    exit /b 1
)

:done
echo.
echo Install complete. Double-click Start.bat to launch the app.
pause
endlocal
