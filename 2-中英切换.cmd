@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bin\AlecaFrame-ZH.ps1" -Action Toggle
if errorlevel 1 pause
exit /b
