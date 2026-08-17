param(
  [ValidateSet('baseline', 'after', 'diff')]
  [string]$Phase = 'after',
  [string]$BaseUrl = 'http://127.0.0.1:4000/',
  [string]$OutputDirectory = 'output/playwright/dev-070'
)

$ErrorActionPreference = 'Stop'
if ($BaseUrl -notmatch '^https?://127\.0\.0\.1:\d+/') {
  throw 'DEV-070 browser verifier only accepts a loopback base URL.'
}
New-Item -ItemType Directory -Force $OutputDirectory | Out-Null
if ($Phase -eq 'baseline') {
  $phaseDirectory = Join-Path $OutputDirectory 'baseline'
} elseif ($Phase -eq 'after') {
  $phaseDirectory = Join-Path $OutputDirectory 'after'
} else {
  $phaseDirectory = Join-Path $OutputDirectory 'diff'
}
New-Item -ItemType Directory -Force $phaseDirectory | Out-Null

$env:DEV070_BASE_URL = $BaseUrl
$env:DEV070_PHASE = $Phase
$sessionPrefix = "dev070-$Phase"
$runner = Join-Path $PSScriptRoot 'run-playwright-code.ps1'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $runner `
  -SessionPrefix $sessionPrefix `
  -Filename (Join-Path $PSScriptRoot 'verify-dev-070-interaction-kernel-browser.pw.js') `
  -OutputDirectory $phaseDirectory
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Output "dev-070-browser-phase=$Phase"
Write-Output "dev-070-browser-output=$phaseDirectory"
