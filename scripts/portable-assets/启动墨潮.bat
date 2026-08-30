@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist ".env" copy /Y ".env.example" ".env" >nul
start "" /B cmd /c "timeout /t 2 /nobreak >nul & start http://127.0.0.1:6008"
"%~dp0runtime\node.exe" "%~dp0src\server.js"
if errorlevel 1 (
  echo.
  echo 墨潮启动失败，请保留本窗口中的错误信息。
  pause
)
