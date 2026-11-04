@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

rem Ищем Node.js по стандартному пути установки, затем через PATH.
set "NODE_EXE="
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE (
  for /f "delims=" %%I in ('where.exe node 2^>nul') do (
    if not defined NODE_EXE set "NODE_EXE=%%I"
  )
)

if not defined NODE_EXE (
  echo Не удалось найти Node.js.
  echo Проверьте установку Node.js и повторите запуск.
  echo.
  pause
  exit /b 1
)

echo Найден Node.js:
echo "%NODE_EXE%"
echo.
"%NODE_EXE%" --version
echo.

start "" /b cmd /c "ping 127.0.0.1 -n 2 >nul & start http://127.0.0.1:4175"
"%NODE_EXE%" server.js

echo.
echo Сервер остановлен.
pause
endlocal
