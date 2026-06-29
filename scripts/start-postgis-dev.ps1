# PostGIS 生产式联调启动脚本
# 用法: powershell -ExecutionPolicy Bypass -File scripts/start-postgis-dev.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $Root ".env"

if (-not (Test-Path $EnvFile)) {
    Copy-Item (Join-Path $Root ".env.example") $EnvFile
    Write-Host "已创建 .env，请按需填写高德 Key。" -ForegroundColor Yellow
}

Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
        $name = $matches[1].Trim()
        $value = $matches[2].Trim()
        Set-Item -Path "Env:$name" -Value $value
    }
}

$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
            [System.Environment]::GetEnvironmentVariable("Path", "User")

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PostGIS 生产式联调" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/3] 检查 Docker..." -ForegroundColor Yellow
docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker 未运行，请先启动 Docker Desktop。" -ForegroundColor Red
    exit 1
}

Write-Host "[2/3] 启动 PostGIS + API (Compose)..." -ForegroundColor Yellow
docker compose -f (Join-Path $Root "infra/compose.yml") --env-file $EnvFile up --build -d
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Compose 启动失败，常见原因是 Docker Hub 网络/代理问题。" -ForegroundColor Red
    Write-Host "请尝试：" -ForegroundColor Yellow
    Write-Host "  1. Docker Desktop -> Settings -> Proxies -> 关闭 Manual proxy"
    Write-Host "  2. 开启 VPN 或更换网络后重试"
    Write-Host "  3. 在 Docker Desktop -> Settings -> Docker Engine 添加 registry-mirrors"
    Write-Host ""
    Write-Host "也可仅启动 PostGIS，本地运行后端：" -ForegroundColor Yellow
    Write-Host "  docker compose -f infra/compose.yml --env-file .env up postgres -d"
    Write-Host "  cd backend"
    Write-Host "  `$env:SPRING_PROFILES_ACTIVE='postgres'"
    Write-Host "  .\mvnw.cmd -s .mvn/settings-cn.xml spring-boot:run"
    exit 1
}

Write-Host "等待 API 就绪..." -ForegroundColor Yellow
$ready = $false
for ($i = 1; $i -le 30; $i++) {
    try {
        $health = Invoke-RestMethod "http://localhost:8080/actuator/health" -TimeoutSec 3
        if ($health.status -eq "UP") {
            $ready = $true
            break
        }
    } catch {
        Start-Sleep -Seconds 3
    }
}

if (-not $ready) {
    Write-Host "API 未在预期时间内就绪，请检查: docker compose -f infra/compose.yml logs api" -ForegroundColor Red
    exit 1
}

Write-Host "API 已就绪: http://localhost:8080/swagger-ui.html" -ForegroundColor Green

Write-Host ""
Write-Host "[3/3] 启动前端..." -ForegroundColor Yellow
Set-Location (Join-Path $Root "frontend")
if (-not (Test-Path "node_modules")) {
    npm install
}
Write-Host "前端地址: http://localhost:5173" -ForegroundColor Green
npm run dev
