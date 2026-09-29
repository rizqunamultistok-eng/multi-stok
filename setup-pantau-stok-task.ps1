param(
  [string]$ProjectPath,
  [string]$NodePath,
  [switch]$Remove
)

$ErrorActionPreference = 'Stop'
$taskName = 'PantauStokServer'
$isAdministrator = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdministrator) {
  throw 'Jalankan JALANKAN_SERVER_PANTAU_STOK_FINAL.bat dengan Run as administrator.'
}

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

if ($Remove) {
  if ($task) {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  }
  exit 0
}

if (-not $ProjectPath -or -not (Test-Path -LiteralPath $ProjectPath)) {
  throw 'Folder aplikasi tidak ditemukan.'
}
if (-not $NodePath -or -not (Test-Path -LiteralPath $NodePath)) {
  throw 'node.exe tidak ditemukan.'
}

$project = (Resolve-Path -LiteralPath $ProjectPath).Path.TrimEnd('\')
$runnerPath = Join-Path $project 'run-pantau-stok-background.ps1'
$powerShellPath = Join-Path $PSHOME 'powershell.exe'
$arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "{0}" -NodePath "{1}"' -f $runnerPath, $NodePath
$action = New-ScheduledTaskAction -Execute $powerShellPath -Argument $arguments -WorkingDirectory $project
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -Hidden
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description 'Pantau Stok LAN server, berjalan di background saat Windows startup.' `
  -Force | Out-Null

$listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  Write-Output 'Port 3000 sedang digunakan. Task akan berjalan otomatis pada Windows berikutnya.'
} else {
  Start-ScheduledTask -TaskName $taskName
  Write-Output 'Task didaftarkan dan server background mulai dijalankan.'
}