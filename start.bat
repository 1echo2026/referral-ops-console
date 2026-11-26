@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   ==========================================
echo    转介绍数据看板 . 运营中台
echo    管理后台  http://localhost:5600/admin
echo    基地看板  http://localhost:5600/dashboard
echo    演示账号  admin / admin123
echo   ==========================================
echo.
start "" http://localhost:5600
node server.js
pause
