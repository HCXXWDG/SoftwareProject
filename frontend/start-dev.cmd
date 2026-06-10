@echo off
REM 城市通勤情绪地图 - 前端启动脚本
REM 双击此文件即可启动开发服务器

set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0"

echo.
echo ========================================
echo   城市通勤情绪地图 - 前端开发服务器
echo ========================================
echo.
echo   正在启动 Vite 开发服务器...
echo   打开浏览器访问 http://localhost:5173
echo.
echo   按 Ctrl+C 停止服务器
echo ========================================
echo.

call npm run dev
pause
