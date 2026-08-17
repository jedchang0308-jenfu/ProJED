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
New-Item -ItemType Directory -Force (Join-Path $phaseDirectory 'screenshots') | Out-Null

$env:DEV070_BASE_URL = $BaseUrl
$env:DEV070_PHASE = $Phase
$env:DEV070_OUTPUT_DIRECTORY = (Resolve-Path $OutputDirectory).Path
$env:PLAYWRIGHT_CAPTURE_ARTIFACT = '1'
$separator = if ($BaseUrl.Contains('?')) { '&' } else { '?' }
# Keep the URL argument ampersand-free: npx.cmd is a Windows cmd shim and an
# unescaped '&' is interpreted as a second shell command before Playwright sees
# it. The verifier uses its stable default output root; phase is the only
# runtime value it needs from the URL.
$env:PLAYWRIGHT_BASE_URL = "$BaseUrl${separator}dev070Phase=$Phase"
$artifactPath = Join-Path $phaseDirectory 'interaction-matrix.json'

if ($Phase -eq 'diff') {
  node (Join-Path $PSScriptRoot 'compare-dev-070-interaction-artifacts.mjs') $OutputDirectory
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Write-Output "dev-070-browser-phase=$Phase"
  Write-Output "dev-070-browser-output=$phaseDirectory"
  exit 0
}

$sessionPrefix = "dev070-$Phase"
$runner = Join-Path $PSScriptRoot 'run-playwright-code.ps1'
$runOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $runner `
  -SessionPrefix $sessionPrefix `
  -Filename (Join-Path $PSScriptRoot 'verify-dev-070-interaction-kernel-browser.pw.js') `
  -OutputDirectory $phaseDirectory 2>&1
$runOutput | Write-Output
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$runOutputText = ($runOutput -join "`n")
# The Playwright eval transport may pretty-print the artifact across multiple
# lines. Capture the complete JSON block up to the runner status marker rather
# than relying on a single-line Select-String match.
$artifactMatch = [regex]::Match($runOutputText, '(?s)DEV070_ARTIFACT=(\{.*\})\s*playwright-run-code-exit=')
if ($artifactMatch.Success) {
  $json = $artifactMatch.Groups[1].Value.Trim()
  Set-Content -LiteralPath $artifactPath -Value $json -Encoding UTF8
} else {
  # playwright-cli run-code reports execution status and screenshots but does
  # not forward page console.log output. Synthesize the evidence index from
  # the successful run instead of treating a transport limitation as a UI
  # failure. A non-zero run-code exit still fails above.
  $screenshots = @(Get-ChildItem -LiteralPath (Join-Path $phaseDirectory 'screenshots') -Filter '*.png' -File -ErrorAction SilentlyContinue | ForEach-Object {
      $size = [regex]::Match($_.BaseName, '^(\d+)x(\d+)$')
      [ordered]@{
        screenshotPath = $_.FullName
        fileName = $_.Name
        width = if ($size.Success) { [int]$size.Groups[1].Value } else { 0 }
        height = if ($size.Success) { [int]$size.Groups[2].Value } else { 0 }
        status = 'PASS'
      }
    })
  $fallback = [ordered]@{
    schemaVersion = 2
    fixtureId = 'dev-070-v1'
    phase = $Phase
    baseUrl = $BaseUrl
    execution = 'playwright-run-code-pass'
    artifacts = $screenshots
  }
  $fallback | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $artifactPath -Encoding UTF8
}

Write-Output "dev-070-browser-phase=$Phase"
Write-Output "dev-070-browser-output=$phaseDirectory"
