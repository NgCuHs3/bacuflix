$ErrorActionPreference = "Stop"

$tizen = "C:\tizen-studio\tools\ide\bin\tizen.bat"
$sdb = "C:\tizen-studio\tools\sdb.exe"
$project = (Get-Location).Path
$output = Join-Path $project "dist"

Write-Host "1. Building JS bundle..."
node scripts\build.js

Write-Host "2. Cleaning old build artifacts..."
& $tizen clean -- .

Write-Host "3. Building web project..."
& $tizen build-web --exclude README.md -- .
if (Test-Path ".buildResult\.git") {
    Remove-Item -Recurse -Force ".buildResult\.git"
}

Write-Host "4. Packaging WGT..."
& $tizen package --type wgt --sign bacuhomeTV --output $output -- .buildResult

Write-Host "5. Connecting to TV via SDB..."
& $sdb connect 192.168.1.3:26101

Write-Host "6. Installing BACUFlix.wgt to TV..."
$wgtPath = Join-Path $output "BACUFlix.wgt"
& $tizen install --name $wgtPath --serial 192.168.1.3:26101

Write-Host "7. Launching app on TV..."
& $tizen run --pkgid 1zl7846GwH.TVVideoPlayer --serial 192.168.1.3:26101

Write-Host "TV Deployment Complete!"
