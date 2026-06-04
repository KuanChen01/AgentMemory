@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\start-workbench.ps1" %*
exit /b %ERRORLEVEL%
