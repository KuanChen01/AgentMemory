@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\bootstrap-second-machine.ps1" %*
exit /b %ERRORLEVEL%
