$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectDir
if (-not (Test-Path -LiteralPath '.\node_modules')) { npm install }
npm start

