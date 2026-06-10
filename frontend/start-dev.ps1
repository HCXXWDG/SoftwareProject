# 城市通勤情绪地图 - 前端启动脚本 (PowerShell)
# 用法: .\start-dev.ps1
# 或在终端中执行: powershell -ExecutionPolicy Bypass -File start-dev.ps1

$env:Path = "C:\Program Files\nodejs;" + $env:Path
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  城市通勤情绪地图 - 前端开发服务器" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  正在启动 Vite 开发服务器..." -ForegroundColor Yellow
Write-Host "  打开浏览器访问 http://localhost:5173" -ForegroundColor Yellow
Write-Host ""
Write-Host "  按 Ctrl+C 停止服务器" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

& "C:\Program Files\nodejs\npm.cmd" run dev
