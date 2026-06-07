@echo off
setlocal EnableExtensions

set "SCRIPT=%~dp0scripts\start-workbench.ps1"
set "PS_EXE=pwsh"
where pwsh >nul 2>nul
if errorlevel 1 set "PS_EXE=powershell"

if "%~1"=="" (
  %PS_EXE% -ExecutionPolicy Bypass -File "%SCRIPT%" -Action menu
  exit /b %ERRORLEVEL%
)

set "ACTION=%~1"
shift

set "PS_ARGS=-Action %ACTION%"

if /I not "%ACTION%"=="menu" if /I not "%ACTION%"=="start" if /I not "%ACTION%"=="stop" if /I not "%ACTION%"=="restart" if /I not "%ACTION%"=="status" if /I not "%ACTION%"=="open-admin" (
  echo Unsupported action: %ACTION%
  echo Usage:
  echo   start-workbench.cmd
  echo   start-workbench.cmd start^|stop^|restart^|status^|open-admin^|menu [--port ^<number^>] [--no-open]
  exit /b 1
)

:parse_args
if "%~1"=="" goto run

if /I "%~1"=="--port" (
  if "%~2"=="" (
    echo Missing value for --port
    exit /b 1
  )
  set "PS_ARGS=%PS_ARGS% -Port %~2"
  shift
  shift
  goto parse_args
)

if /I "%~1"=="--no-open" (
  set "PS_ARGS=%PS_ARGS% -NoOpen"
  shift
  goto parse_args
)

if /I "%~1"=="--open-on-reuse" (
  set "PS_ARGS=%PS_ARGS% -OpenOnReuse"
  shift
  goto parse_args
)

echo Unsupported option: %~1
echo Usage:
echo   start-workbench.cmd
echo   start-workbench.cmd start^|stop^|restart^|status^|open-admin^|menu [--port ^<number^>] [--no-open]
exit /b 1

:run
%PS_EXE% -ExecutionPolicy Bypass -File "%SCRIPT%" %PS_ARGS%
exit /b %ERRORLEVEL%
