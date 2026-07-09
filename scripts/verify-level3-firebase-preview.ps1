param(
  [Parameter(Mandatory = $true)]
  [string]$Url,

  [string]$SessionPrefix = "level3-firebase-preview",

  [string]$SmokeFile = "scripts/verify-release-browser-smoke.pw.js"
)

$ErrorActionPreference = "Stop"

if ($Url -notmatch '^https://') {
  throw "Level 3 Firebase preview smoke must target an https URL. Received: $Url"
}

if (-not (Test-Path $SmokeFile)) {
  throw "Smoke file not found: $SmokeFile"
}

$npx = Get-Command npx.cmd -ErrorAction SilentlyContinue
if (-not $npx) {
  $npx = Get-Command npx -ErrorAction SilentlyContinue
}
if (-not $npx) {
  throw "npx is not available. Install Node.js/npm before running this smoke."
}

$session = "$SessionPrefix-$([guid]::NewGuid().ToString('N'))"
$tempOutput = Join-Path $env:TEMP "$session-run-code.log"

try {
  npx.cmd --yes --package @playwright/cli playwright-cli -s $session open $Url
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }

  npx.cmd --yes --package @playwright/cli playwright-cli -s $session run-code --filename=$SmokeFile *> $tempOutput
  $exitCode = $LASTEXITCODE
  $output = if (Test-Path $tempOutput) { Get-Content -Raw $tempOutput } else { "" }
  if ($output) {
    Write-Output $output
  }

  $hasRunCodeError = $output -match "### Error"
  Write-Output "level3-preview-url=$Url"
  Write-Output "playwright-run-code-exit=$exitCode"
  Write-Output "playwright-run-code-has-error=$hasRunCodeError"

  if ($exitCode -ne 0 -or $hasRunCodeError) {
    exit 1
  }
} finally {
  npx.cmd --yes --package @playwright/cli playwright-cli -s $session close *> $null
}
