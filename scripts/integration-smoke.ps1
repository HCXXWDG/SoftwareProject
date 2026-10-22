$ErrorActionPreference = "Stop"
$base = "http://localhost:8080"
$device = "integration-demo-device"
$bbox = "120.26067,31.47278,120.27946,31.49417"

function Test-Endpoint {
    param(
        [string]$Name,
        [scriptblock]$Action
    )
    Write-Host "=== $Name ==="
    & $Action
}

Test-Endpoint "Health" {
    $health = Invoke-RestMethod "$base/actuator/health"
    Write-Host "status: $($health.status)"
}

Test-Endpoint "Heatmap" {
    $cells = Invoke-RestMethod "$base/api/v1/heatmap?bbox=$bbox&zoom=16&hours=168"
    Write-Host "cells: $($cells.Count)"
}

Test-Endpoint "Report" {
    $body = @{
        location = @{ longitude = 120.273915; latitude = 31.479302 }
        stressLevel = 75
        tag = "CROWD"
    } | ConvertTo-Json -Compress
    try {
        $result = Invoke-RestMethod -Uri "$base/api/v1/reports" -Method POST `
            -Headers @{ "X-Device-Id" = $device } `
            -ContentType "application/json; charset=utf-8" `
            -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
        Write-Host "status: created $($result.status)"
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        Write-Host "status: $status (duplicate or validation is acceptable during smoke test)"
        if ($status -ne 409 -and $status -ne 429) {
            throw
        }
    }
}

Test-Endpoint "Route Compare" {
    $body = @{
        origin = @{ longitude = 120.2735103; latitude = 31.4753281 }
        destination = @{ longitude = 120.2743195; latitude = 31.4832753 }
    } | ConvertTo-Json -Compress
    $route = Invoke-RestMethod -Uri "$base/api/v1/routes/compare" -Method POST `
        -Headers @{ "X-Device-Id" = $device } `
        -ContentType "application/json" `
        -Body $body
    Write-Host "routes: $($route.routes.Count) recommend: $($route.recommendation)"
}

Test-Endpoint "Commute Complete" {
    $body = @{
        routeId = "route-fast"
        routeLabel = "最快路线 A"
        endStressLevel = 25
        durationMinutes = 28
        selectedScore = 52.1
        fastestScore = 48.0
        alternativeLabel = "少心累路线 B"
        alternativeScore = 41.5
        alternativeDurationRatio = 1.12
        confidence = 0.72
    } | ConvertTo-Json -Compress
    $commute = Invoke-RestMethod -Uri "$base/api/v1/commutes/complete" -Method POST `
        -Headers @{ "X-Device-Id" = $device } `
        -ContentType "application/json" `
        -Body $body
    Write-Host "commute id: $($commute.id)"
}

Test-Endpoint "Trends" {
    $trends = Invoke-RestMethod -Uri "$base/api/v1/commutes/trends?days=7&timezone=Asia/Shanghai" `
        -Headers @{ "X-Device-Id" = $device }
    Write-Host "total: $($trends.totalCommutes) direction: $($trends.summary.direction)"
}

foreach ($origin in @("http://localhost:5173", "http://127.0.0.1:5173", "http://localhost", "https://localhost")) {
    Test-Endpoint "CORS preflight ($origin)" {
        $headers = curl.exe -s -D - -o NUL -X OPTIONS "$base/api/v1/heatmap?bbox=$bbox&zoom=16" `
            -H "Origin: $origin" `
            -H "Access-Control-Request-Method: GET"
        $allowOrigin = ($headers | Select-String "Access-Control-Allow-Origin:").Line
        Write-Host $allowOrigin
    }
}

Write-Host "=== Integration smoke passed ==="
