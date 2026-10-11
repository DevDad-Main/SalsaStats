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
  $url = 'https://www.nuget.org/api/v2/package/NvAPIWrapper.Net/0.8.1.101'
  $client = New-Object Net.WebClient
  $maxRetries = 3
  $retryDelaySec = 10
  for ($i = 1; $i -le $maxRetries; $i++) {
    try {
      Write-Host "Downloading NvAPIWrapper from NuGet (attempt $i of $maxRetries)..."
      $client.DownloadFile($url, $package)
      Write-Host "Download succeeded."
      break
    } catch {
      if ($i -eq $maxRetries) { throw $_ }
      Write-Warning "Download failed: $($_.Exception.Message). Retrying in $retryDelaySec seconds..."
      Start-Sleep -Seconds $retryDelaySec
    }
  }
}
$extract = Join-Path $cache 'nvapiwrapper'
if (-not (Test-Path $extract)) {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [IO.Compression.ZipFile]::ExtractToDirectory($package, $extract)
}

$library = Join-Path $extract 'lib\net45\NvAPIWrapper.dll'
Copy-Item $library $out -Force
& $csc /nologo /target:exe /platform:x64 /optimize+ "/out:$out\NvapiHelper.exe" "/reference:$library" (Join-Path $root 'nvapi-helper\NvapiHelper.cs')
if ($LASTEXITCODE -ne 0) { throw 'NvapiHelper build failed' }
Write-Host "Built $out\NvapiHelper.exe"
