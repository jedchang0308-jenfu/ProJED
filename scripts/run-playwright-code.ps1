param(
  [Parameter(Mandatory = $true)]
  [string]$SessionPrefix,

  [Parameter(Mandatory = $true)]
  [string]$Filename,

  [string]$OutputDirectory = "output/playwright"
)

$ErrorActionPreference = "Continue"
New-Item -ItemType Directory -Force $OutputDirectory | Out-Null

$session = "$SessionPrefix-$([guid]::NewGuid().ToString('N'))"

npx.cmd --yes --package @playwright/cli playwright-cli -s $session open http://127.0.0.1:4173/
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$tempOutput = Join-Path $env:TEMP "$session-run-code.log"
npx.cmd --yes --package @playwright/cli playwright-cli -s $session run-code --filename=$Filename *> $tempOutput
$exitCode = $LASTEXITCODE
$output = if (Test-Path $tempOutput) { Get-Content -Raw $tempOutput } else { "" }
if ($output) { Write-Output $output }
$hasRunCodeError = $output -match "### Error"
Write-Output "playwright-run-code-exit=$exitCode"
Write-Output "playwright-run-code-has-error=$hasRunCodeError"

if ($exitCode -ne 0 -or $hasRunCodeError) {
  exit 1
}
