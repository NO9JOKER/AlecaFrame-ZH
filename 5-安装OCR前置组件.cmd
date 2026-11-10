@echo off
chcp 65001 >nul
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bin\AlecaFrame-ZH.ps1" -Action InstallOcr
echo.
pause
exit /b