$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = Join-Path $PSScriptRoot '..'
$out = Join-Path $root 'vendor\nvapi'
$cache = Join-Path $root 'vendor\.cache'
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'

New-Item -ItemType Directory -Force $out, $cache | Out-Null
$package = Join-Path $cache 'nvapiwrapper.zip'
if (-not (Test-Path $package)) {
  Invoke-WebRequest 'https://www.nuget.org/api/v2/package/NvAPIWrapper.Net/0.8.1.101' -OutFile $package -UseBasicParsing
}
$extract = Join-Path $cache 'nvapiwrapper'
if (-not (Test-Path $extract)) { Expand-Archive $package $extract -Force }

$library = Join-Path $extract 'lib\net45\NvAPIWrapper.dll'
Copy-Item $library $out -Force
& $csc /nologo /target:exe /platform:x64 /optimize+ "/out:$out\NvapiHelper.exe" "/reference:$library" (Join-Path $root 'nvapi-helper\NvapiHelper.cs')
if ($LASTEXITCODE -ne 0) { throw 'NvapiHelper build failed' }
Write-Host "Built $out\NvapiHelper.exe"
