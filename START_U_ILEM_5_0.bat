@echo off
setlocal
cd /d "%~dp0"
title U Ilem 5.0 Launcher

echo ==========================================
echo              U ILEM 5.0
echo ==========================================
echo.

if not exist "%~dp0server.js" (
  echo ERROR: server.js was not found in this folder.
  goto failed
)

where.exe node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js was not found in PATH.
  echo Install Node.js or repair the PATH setting.
  goto failed
)

echo Node.js:
node.exe --version
if errorlevel 1 goto failed

echo.
echo Starting the game server in a separate window...
start "U Ilem 5.0 Server" "%ComSpec%" /k node.exe "%~dp0server.js"

echo.
echo Waiting 3 seconds, then opening the game page...
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:4175"

echo.
echo If the game does not open, read the server window for the error.
echo Keep the server window open while playing.
echo.
pause
endlocal
exit /b 0

:failed
echo.
echo LAUNCH FAILED. Read the error above.
echo.
pause
endlocal
exit /b 1
