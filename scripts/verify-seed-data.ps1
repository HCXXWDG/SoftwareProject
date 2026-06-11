param(
    [string]$BaseUrl = "http://localhost:8080"
)

$ErrorActionPreference = "Stop"
$manifestPath = Join-Path (Split-Path -Parent $PSScriptRoot) "data/seed/manifest.json"
$manifest = Get-Content $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) {
        throw $Message
    }
    Write-Host "  OK  $Message" -ForegroundColor Green
}

Write-Host "=== Seed data verification ($BaseUrl) ===" -ForegroundColor Cyan

Write-Host "`n[Health]"
$health = Invoke-RestMethod "$BaseUrl/actuator/health"
Assert-True ($health.status -eq "UP") "actuator health is UP"

Write-Host "`n[Heatmap]"
$bbox = $manifest.heatmapFixture.bbox
$zoom = $manifest.heatmapFixture.zoom
$hours = $manifest.heatmapFixture.hours
$cells = Invoke-RestMethod "$BaseUrl/api/v1/heatmap?bbox=$bbox&zoom=$zoom&hours=$hours"
Assert-True ($cells.Count -ge $manifest.heatmapFixture.minimumCells) "heatmap returns at least $($manifest.heatmapFixture.minimumCells) cells (got $($cells.Count))"
Assert-True ($null -ne $cells[0].cellId -and $cells[0].cellId.Length -gt 0) "heatmap cell includes cellId"
Assert-True ($null -ne $cells[0].center.longitude) "heatmap cell includes center.longitude"

Write-Host "`n[Route compare fixture]"
$origin = $manifest.routeCompareFixture.origin
$destination = $manifest.routeCompareFixture.destination
$body = @{
    origin = @{ longitude = $origin.longitude; latitude = $origin.latitude }
    destination = @{ longitude = $destination.longitude; latitude = $destination.latitude }
} | ConvertTo-Json -Compress
$comparison = Invoke-RestMethod "$BaseUrl/api/v1/routes/compare" -Method Post -ContentType "application/json" -Body $body
Assert-True ($comparison.fastestRouteId -eq $manifest.routeCompareFixture.expectedFastestRouteId) "fastest route is $($manifest.routeCompareFixture.expectedFastestRouteId)"
Assert-True ($comparison.leastStressfulRouteId -eq $manifest.routeCompareFixture.expectedLeastStressfulRouteId) "least stressful route is $($manifest.routeCompareFixture.expectedLeastStressfulRouteId)"
Assert-True ($comparison.routes.Count -ge 2) "route compare returns multiple candidates"
Assert-True ($comparison.routes[0].polyline.Count -ge 2) "route polyline has at least two points"

Write-Host "`n[Trend demo device]"
$deviceId = $manifest.commuteTrendDemo.deviceId
$trends = Invoke-RestMethod "$BaseUrl/api/v1/commutes/trends?days=7&timezone=Asia/Shanghai" -Headers @{ "X-Device-Id" = $deviceId }
Assert-True ($trends.totalCommutes -ge 7) "demo-browser has seeded commute history (got $($trends.totalCommutes))"
Assert-True ($null -ne $trends.summary.direction -and $trends.summary.direction.Length -gt 0) "trend summary includes direction"
Assert-True ($trends.points.Count -eq 7) "trend window returns seven daily points"

Write-Host "`nSeed verification passed." -ForegroundColor Cyan
