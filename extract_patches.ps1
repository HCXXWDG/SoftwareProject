$content = Get-Content "d:\软件工程\SoftwareProject-main\SoftwareProject-main\pr12_files.json" -Raw
$files = $content | ConvertFrom-Json
$output = ""
foreach($f in $files) {
    $output += "=== FILE: $($f.filename) ===`n"
    $output += "$($f.patch)`n`n"
}
$output | Out-File -FilePath "d:\软件工程\SoftwareProject-main\SoftwareProject-main\pr12_patches.txt" -Encoding utf8
Write-Host "Done, total files: $($files.Count)"
