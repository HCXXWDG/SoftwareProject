param(
    [string]$BaseUrl = "http://localhost:8080",
    [string]$OutputPath = "docs/openapi.json"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$targetPath = Join-Path $projectRoot $OutputPath

Write-Host "Fetching OpenAPI document from $BaseUrl/v3/api-docs ..."
$response = Invoke-WebRequest -Uri "$BaseUrl/v3/api-docs" -UseBasicParsing
$document = $response.Content | ConvertFrom-Json
$formatted = $document | ConvertTo-Json -Depth 100
Set-Content -Path $targetPath -Value $formatted -Encoding utf8
Write-Host "Wrote OpenAPI snapshot to $targetPath"
