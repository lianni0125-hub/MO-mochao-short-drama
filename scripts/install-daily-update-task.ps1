param([string]$At = '09:00')
$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node -ErrorAction Stop).Source
$job = Join-Path $projectDir 'src\jobs\update-sources.js'
$action = New-ScheduledTaskAction -Execute $node -Argument ('"' + $job + '"') -WorkingDirectory $projectDir
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries
Register-ScheduledTask -TaskName '墨潮AI短剧资料库更新' -Description '更新本地 Market / Reality 资料库' -Action $action -Trigger $trigger -Settings $settings -Force
Write-Host "已创建每日 $At 自动更新任务。电脑关机时会在下次可运行时补跑。"

