param(
    [Parameter(Mandatory = $true)]
    [string]$Version
)

$ErrorActionPreference = "Stop"
$mvnDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$archive = Join-Path $mvnDir "apache-maven-$Version-bin.zip"
$target = Join-Path $mvnDir "apache-maven-$Version"
$url = "https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/$Version/apache-maven-$Version-bin.zip"

New-Item -ItemType Directory -Force -Path $mvnDir | Out-Null
Write-Host "Downloading Maven $Version..."
Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $archive
Expand-Archive -Path $archive -DestinationPath $mvnDir -Force
Remove-Item -LiteralPath $archive

if (-not (Test-Path (Join-Path $target "bin\mvn.cmd"))) {
    throw "Maven download did not create the expected executable."
}

