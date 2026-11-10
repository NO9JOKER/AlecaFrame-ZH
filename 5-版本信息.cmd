@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bin\AlecaFrame-ZH.ps1" -Action Status
pause
exit /b
