@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

title У Илем 5.0 - запуск

echo ==========================================
echo          У ИЛЕМ 5.0
echo ==========================================
echo.

rem Проверяем наличие файла сервера.
if not exist "%~dp0server.js" (
  echo ОШИБКА: рядом с BAT не найден файл server.js.
  echo Распакуйте весь ZIP проекта в одну папку.
  echo.
  pause
  exit /b 1
)

rem Ищем Node.js по стандартным путям и через PATH.
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
  echo Установите Node.js версии 18 или новее.
  echo.
  pause
  exit /b 1
)

echo Найден Node.js:
echo "%NODE_EXE%"
"%NODE_EXE%" --version
if errorlevel 1 (
  echo.
  echo ОШИБКА: найденный node.exe не запускается.
  pause
  exit /b 1
)
echo.

rem Запускаем сервер в отдельном окне, чтобы его сообщения об ошибках были видны.
echo Запускаю локальный сервер...
start "У Илем 5.0 - сервер" "%NODE_EXE%" "%~dp0server.js"

rem Не открываем браузер, пока сервер не ответит на проверочный запрос.
echo Проверяю готовность сервера (до 20 секунд)...
for /L %%N in (1,1,20) do (
  powershell -NoProfile -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:4175/api/health' -TimeoutSec 2; if ($r.project -eq 'У Илем 5.0') { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
  if not errorlevel 1 goto server_ready
  timeout /t 1 /nobreak >nul
)

echo.
echo ОШИБКА: сервер не ответил за 20 секунд.
echo Посмотрите окно "У Илем 5.0 - сервер".
echo Там должна быть указана причина: например, занятый порт или ошибка Node.js.
echo.
echo Адрес проверки: http://127.0.0.1:4175/api/health
echo.
pause
exit /b 1

:server_ready
echo.
echo Сервер работает. Открываю игру в браузере...
start "" "http://127.0.0.1:4175"
echo.
echo Игра запущена. Не закрывайте окно сервера, пока играете.
echo Это окно запуска можно закрыть.
endlocal
