@echo off
chcp 65001 >nul
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Export-Diagnostics.ps1"
if errorlevel 1 pause
exit /b
