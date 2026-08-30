param([string]$OutputDirectory = "dist")
$ErrorActionPreference = 'Stop'
$projectDir = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$manifest = Get-Content -LiteralPath (Join-Path $projectDir 'version.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$version = [string]$manifest.version
$assetName = "MO-mochao-Windows-v$version.zip"
$outputDir = [IO.Path]::GetFullPath((Join-Path $projectDir $OutputDirectory))
$workDir = Join-Path $outputDir 'portable-build'
$payloadDir = Join-Path $workDir "MO-mochao-v$version"
if (Test-Path -LiteralPath $workDir) { Remove-Item -LiteralPath $workDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $payloadDir,(Join-Path $payloadDir 'runtime'),(Join-Path $payloadDir 'data\uploads'),(Join-Path $payloadDir 'data\exports') | Out-Null
$directories = @('src','public','scripts','node_modules')
foreach ($name in $directories) {
  $source = Join-Path $projectDir $name
  if (-not (Test-Path -LiteralPath $source)) { throw "Missing portable directory: $name" }
  Copy-Item -LiteralPath $source -Destination (Join-Path $payloadDir $name) -Recurse -Force
}
$files = @('package.json','package-lock.json','version.json','portable.json','.env.example','LICENSE','COMMERCIAL_LICENSE.md','README.md')
foreach ($name in $files) {
  $source = Join-Path $projectDir $name
  if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $payloadDir $name) -Force }
}
$nodePath = (Get-Command node -ErrorAction Stop).Source
Copy-Item -LiteralPath $nodePath -Destination (Join-Path $payloadDir 'runtime\node.exe') -Force
Set-Content -LiteralPath (Join-Path $payloadDir 'data\uploads\.gitkeep') -Value '' -Encoding UTF8
Set-Content -LiteralPath (Join-Path $payloadDir 'data\exports\.gitkeep') -Value '' -Encoding UTF8
Copy-Item -Path (Join-Path $projectDir 'scripts\portable-assets\*') -Destination $payloadDir -Force
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
$archive = Join-Path $outputDir $assetName
if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
Compress-Archive -Path $payloadDir -DestinationPath $archive -CompressionLevel Optimal
$hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath "$archive.sha256" -Value "$hash  $assetName" -Encoding ASCII
Remove-Item -LiteralPath $workDir -Recurse -Force
Write-Output $archive
