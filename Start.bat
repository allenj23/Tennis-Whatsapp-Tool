@echo off
setlocal
cd /d "%~dp0"

set "NODE_EXE=%~dp0runtime\node\node.exe"
if not exist "%NODE_EXE%" (
    where node >nul 2>&1
    if errorlevel 1 (
        echo Node.js not found. Run Install.bat first.
        pause
        exit /b 1
    )
    set "NODE_EXE=node"
)

if not exist "%~dp0node_modules\" (
    echo Dependencies missing. Run Install.bat first.
    pause
    exit /b 1
)

set HOST=127.0.0.1
set PORT=3000

echo Starting WhatsApp Campaign Tool...
echo Browser will open at http://127.0.0.1:%PORT%
echo Keep this window open while using the app. Press Ctrl+C to stop.
echo.

start "" "http://127.0.0.1:%PORT%"
"%NODE_EXE%" src\server.js

endlocal
