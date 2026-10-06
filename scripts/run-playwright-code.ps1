param(
  [Parameter(Mandatory = $true)]
  [string]$SessionPrefix,

  [Parameter(Mandatory = $true)]
  [string]$Filename,

  [string]$OutputDirectory = "output/playwright",

  [string]$BaseUrl,

  [string]$ArtifactWindowKey,

  [string]$ArtifactPath
)

$ErrorActionPreference = "Continue"
New-Item -ItemType Directory -Force $OutputDirectory | Out-Null

$session = "$SessionPrefix-$([guid]::NewGuid().ToString('N'))"
$exitCode = 1
$hasRunCodeError = $true

try {
  $baseUrl = if ($BaseUrl) { $BaseUrl } elseif ($env:PLAYWRIGHT_BASE_URL) { $env:PLAYWRIGHT_BASE_URL } else { "http://localhost:4000/" }
  npx.cmd --yes --package @playwright/cli playwright-cli -s $session open $baseUrl
  if ($LASTEXITCODE -ne 0) {
    $exitCode = $LASTEXITCODE
  } else {
    $tempOutput = Join-Path $env:TEMP "$session-run-code.log"
    npx.cmd --yes --package @playwright/cli playwright-cli -s $session run-code --filename=$Filename *> $tempOutput
    $exitCode = $LASTEXITCODE
    $output = if (Test-Path $tempOutput) { Get-Content -Raw $tempOutput } else { "" }
    if ($exitCode -eq 0 -and ($ArtifactWindowKey -or $ArtifactPath)) {
      if (-not $ArtifactWindowKey -or -not $ArtifactPath) {
        throw 'ArtifactWindowKey and ArtifactPath must be provided together.'
      }
      if ($ArtifactWindowKey -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') {
        throw 'ArtifactWindowKey must be a valid window identifier.'
      }
      $artifactEvalOutput = & npx.cmd --yes --package @playwright/cli playwright-cli -s $session eval "() => window['$ArtifactWindowKey'] || JSON.parse(sessionStorage.getItem('$ArtifactWindowKey') || localStorage.getItem('$ArtifactWindowKey') || 'null')" 2>&1
      $artifactEvalText = ($artifactEvalOutput -join "`n")
      $artifactMatch = [regex]::Match($artifactEvalText, '(?s)### Result\s*(\{.*\})\s*### Ran Playwright code')
      if (-not $artifactMatch.Success) {
        $artifactPreview = if ($artifactEvalText.Length -gt 4000) { $artifactEvalText.Substring(0, 4000) } else { $artifactEvalText }
        throw "Playwright artifact '$ArtifactWindowKey' is missing or not an object. Eval output: $artifactPreview"
      }
      $artifactJson = $artifactMatch.Groups[1].Value.Trim()
      $artifact = $artifactJson | ConvertFrom-Json
      if ($null -eq $artifact -or $artifact -is [System.Array] -or $artifact -is [string] -or $artifact -is [int] -or $artifact -is [double] -or $artifact -is [bool]) {
        throw "Playwright artifact '$ArtifactWindowKey' must be a JSON object."
      }
      $artifactDirectory = Split-Path -Parent $ArtifactPath
      if ($artifactDirectory) { New-Item -ItemType Directory -Force $artifactDirectory | Out-Null }
      Set-Content -LiteralPath $ArtifactPath -Value $artifactJson -Encoding UTF8
      $output = "$output`nDEV074_ARTIFACT=$artifactJson"
    }
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
