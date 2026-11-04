@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"
title У Илем 5.0 - запуск

set "LOG=%~dp0U_ILEM_5_0_LAUNCH_LOG.txt"
> "%LOG%" echo У Илем 5.0 - журнал запуска
>>"%LOG%" echo Дата: %DATE% %TIME%
>>"%LOG%" echo Папка проекта: %~dp0

echo ==========================================
echo              У ИЛЕМ 5.0
echo ==========================================
echo.
echo Журнал запуска: "%LOG%"
echo.

if not exist "%~dp0server.js" (
  echo ОШИБКА: рядом с BAT не найден server.js.
  >>"%LOG%" echo ERROR: server.js not found
  goto failed
)

set "NODE_EXE="
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE_EXE (
  for /f "delims=" %%I in ('where.exe node 2^>nul') do (
    if not defined NODE_EXE set "NODE_EXE=%%I"
  )
)

if not defined NODE_EXE (
  echo ОШИБКА: Node.js не найден.
  >>"%LOG%" echo ERROR: node.exe not found
  goto failed
)

echo Node.js: "%NODE_EXE%"
>>"%LOG%" echo Node.js: "%NODE_EXE%"
"%NODE_EXE%" --version >>"%LOG%" 2>&1
if errorlevel 1 (
  echo ОШИБКА: Node.js найден, но не запускается.
  goto failed
)
type "%LOG%" | findstr /C:"Node.js:" /C:"v" 
echo.

echo Запускаю сервер в отдельном окне...
>>"%LOG%" echo Starting server process
rem cmd /k оставляет окно сервера открытым даже при ошибке Node.js.
start "У Илем 5.0 - сервер" "%ComSpec%" /k ""%NODE_EXE%" "%~dp0server.js""

echo Проверяю сервер по адресу http://127.0.0.1:4175/api/health
>>"%LOG%" echo Waiting for health endpoint
set "READY="
for /L %%N in (1,1,20) do (
  powershell -NoProfile -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:4175/api/health' -TimeoutSec 2; if ($r.project -eq 'У Илем 5.0') { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
  if not errorlevel 1 set "READY=1"
  if defined READY goto server_ready
  timeout /t 1 /nobreak >nul
)

echo.
echo ОШИБКА: сервер не ответил за 20 секунд.
>>"%LOG%" echo ERROR: health endpoint timeout
echo Окно сервера оставлено открытым. Прочитай сообщение в нём.
echo Журнал запуска сохранён здесь:
echo "%LOG%"
goto finished_error

:server_ready
echo.
echo Сервер отвечает. Открываю игру...
>>"%LOG%" echo SUCCESS: health endpoint responded
start "" "http://127.0.0.1:4175"
echo.
echo Игра открыта в браузере.
echo Окно сервера должно оставаться открытым, пока работает игра.
echo Это окно запуска тоже останется открытым для контроля.
echo.
echo Нажми любую клавишу, чтобы закрыть только это окно запуска.
pause >nul
endlocal
exit /b 0

:failed
echo.
echo Запуск остановлен. Подробности записаны в журнал.
echo "%LOG%"
goto finished_error

:finished_error
echo.
echo Окно не будет закрыто автоматически.
echo После просмотра сообщения нажми любую клавишу.
pause >nul
endlocal
exit /b 1
