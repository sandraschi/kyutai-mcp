@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
if errorlevel 1 (
  echo [ERROR] kyutai-mcp webapp startup failed.
  exit /b 1
)
exit /b 0

