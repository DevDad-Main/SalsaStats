$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$version = '2.3.1'
$expectedSha256 = $env:PRESENTMON_SHA256
$vendor = Join-Path $PSScriptRoot '..\vendor'
$target = Join-Path $vendor 'PresentMon.exe'

if (Test-Path $target) { Write-Host 'PresentMon.exe already present'; exit 0 }

New-Item -ItemType Directory -Force $vendor | Out-Null
$url = "https://github.com/GameTechDev/PresentMon/releases/download/v$version/PresentMon-$version-x64.exe"
Invoke-WebRequest -Uri $url -OutFile $target -UseBasicParsing

$hash = (Get-FileHash $target -Algorithm SHA256).Hash
Write-Host "PresentMon $version SHA256: $hash"
if ($expectedSha256 -and $hash -ne $expectedSha256.ToUpper()) {
  Remove-Item $target -Force
  throw 'PresentMon checksum mismatch'
}
