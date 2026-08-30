param(
  [Parameter(Mandatory=$true)][string]$InstallDir,
  [Parameter(Mandatory=$true)][string]$PayloadDir,
  [Parameter(Mandatory=$true)][string]$DataDir,
  [Parameter(Mandatory=$true)][int]$CurrentPid,
  [Parameter(Mandatory=$true)][string]$LogPath
)
$ErrorActionPreference = 'Stop'
$InstallDir = [IO.Path]::GetFullPath($InstallDir).TrimEnd('\')
$PayloadDir = [IO.Path]::GetFullPath($PayloadDir).TrimEnd('\')
$DataDir = [IO.Path]::GetFullPath($DataDir).TrimEnd('\')
$logParent = Split-Path -Parent $LogPath
New-Item -ItemType Directory -Force -Path $logParent | Out-Null
function Write-UpdateLog([string]$Message) { Add-Content -LiteralPath $LogPath -Encoding UTF8 -Value "$(Get-Date -Format o) $Message" }
if (-not (Test-Path -LiteralPath (Join-Path $PayloadDir 'portable.json'))) { throw 'Invalid Mochao portable payload' }
if ($DataDir -ne (Join-Path $InstallDir 'data')) { throw 'Portable data directory does not match the install directory' }
$deadline = (Get-Date).AddMinutes(2)
while (Get-Process -Id $CurrentPid -ErrorAction SilentlyContinue) {
  if ((Get-Date) -gt $deadline) { throw 'Timed out waiting for the old server to exit' }
  Start-Sleep -Milliseconds 500
}
$version = (Get-Content -LiteralPath (Join-Path $PayloadDir 'version.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
$rollback = Join-Path $DataDir "update-backups\before-v$version-$(Get-Date -Format yyyyMMdd-HHmmss)"
New-Item -ItemType Directory -Force -Path $rollback | Out-Null
$protected = @('.env','data')
$installed = New-Object System.Collections.Generic.List[string]
$backedUp = New-Object System.Collections.Generic.List[string]
try {
  Write-UpdateLog "Installing v$version"
  foreach ($item in Get-ChildItem -LiteralPath $PayloadDir -Force) {
    if ($protected -contains $item.Name) { continue }
    $target = Join-Path $InstallDir $item.Name
    $targetFull = [IO.Path]::GetFullPath($target)
    if (-not $targetFull.StartsWith($InstallDir + '\',[StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe update target: $($item.Name)" }
    if (Test-Path -LiteralPath $target) {
      Move-Item -LiteralPath $target -Destination (Join-Path $rollback $item.Name) -Force
      $backedUp.Add($item.Name)
    }
    Copy-Item -LiteralPath $item.FullName -Destination $target -Recurse -Force
    $installed.Add($item.Name)
  }
  $node = Join-Path $InstallDir 'runtime\node.exe'
  if (-not (Test-Path -LiteralPath $node)) { throw 'Portable Node.js runtime is missing after update' }
  Write-UpdateLog "Installed v$version; verifying restart"
  $newProcess = Start-Process -FilePath $node -ArgumentList 'src/server.js' -WorkingDirectory $InstallDir -WindowStyle Hidden -PassThru
  Start-Sleep -Seconds 2
  if ($newProcess.HasExited) { throw 'The updated server exited immediately' }
  Write-UpdateLog "v$version started successfully"
  try {
    $backupRoot = Join-Path $DataDir 'update-backups'
    Get-ChildItem -LiteralPath $backupRoot -Directory -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -Skip 1 | Remove-Item -Recurse -Force
    $updateWork = [IO.Path]::GetFullPath((Split-Path -Parent $LogPath)).TrimEnd('\')
    if ($updateWork -eq (Join-Path $DataDir 'system-update')) { Remove-Item -LiteralPath $updateWork -Recurse -Force }
  } catch {}
} catch {
  Write-UpdateLog "Install failed; rolling back: $($_.Exception.Message)"
  if ($newProcess -and -not $newProcess.HasExited) { Stop-Process -Id $newProcess.Id -Force -ErrorAction SilentlyContinue }
  foreach ($name in $installed) { $target=Join-Path $InstallDir $name; if(Test-Path -LiteralPath $target){Remove-Item -LiteralPath $target -Recurse -Force} }
  foreach ($name in $backedUp) { $source=Join-Path $rollback $name; if(Test-Path -LiteralPath $source){Move-Item -LiteralPath $source -Destination (Join-Path $InstallDir $name) -Force} }
  $oldNode = Join-Path $InstallDir 'runtime\node.exe'
  if (Test-Path -LiteralPath $oldNode) { Start-Process -FilePath $oldNode -ArgumentList 'src/server.js' -WorkingDirectory $InstallDir -WindowStyle Hidden }
  throw
}
