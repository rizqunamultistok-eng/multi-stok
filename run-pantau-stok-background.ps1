param(
  [Parameter(Mandatory = $true)]
  [string]$NodePath
)

$ErrorActionPreference = 'Continue'
$logDirectory = Join-Path $PSScriptRoot 'logs'
$logPath = Join-Path $logDirectory 'server-service.log'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
Set-Location -LiteralPath $PSScriptRoot

& $NodePath (Join-Path $PSScriptRoot 'server.js') *>> $logPath
exit $LASTEXITCODE