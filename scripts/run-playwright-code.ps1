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
$exitCode = 1
$hasRunCodeError = $true

try {
  $baseUrl = if ($env:PLAYWRIGHT_BASE_URL) { $env:PLAYWRIGHT_BASE_URL } else { "http://127.0.0.1:4000/" }
  npx.cmd --yes --package @playwright/cli playwright-cli -s $session open $baseUrl
  if ($LASTEXITCODE -ne 0) {
    $exitCode = $LASTEXITCODE
  } else {
    $tempOutput = Join-Path $env:TEMP "$session-run-code.log"
    npx.cmd --yes --package @playwright/cli playwright-cli -s $session run-code --filename=$Filename *> $tempOutput
    $exitCode = $LASTEXITCODE
    $output = if (Test-Path $tempOutput) { Get-Content -Raw $tempOutput } else { "" }
    if ($exitCode -eq 0 -and $env:PLAYWRIGHT_CAPTURE_ARTIFACT -eq '1') {
      $artifactEvalOutput = & npx.cmd --yes --package @playwright/cli playwright-cli -s $session eval "() => window.__DEV070_ARTIFACT" 2>&1
      $artifactEvalText = ($artifactEvalOutput -join "`n")
      $artifactMatch = [regex]::Match($artifactEvalText, '(?s)### Result\s*(\{.*\})\s*### Ran Playwright code')
      if ($artifactMatch.Success) {
        $output = "$output`nDEV070_ARTIFACT=$($artifactMatch.Groups[1].Value)"
      }
    }
    if ($output) { Write-Output $output }
    $hasRunCodeError = $output -match "### Error"
  }
} finally {
  npx.cmd --yes --package @playwright/cli playwright-cli -s $session close *> $null
}

Write-Output "playwright-run-code-exit=$exitCode"
Write-Output "playwright-run-code-has-error=$hasRunCodeError"

if ($exitCode -ne 0 -or $hasRunCodeError) {
  exit 1
}
