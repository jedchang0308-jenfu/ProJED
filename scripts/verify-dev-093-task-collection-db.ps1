$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$outputDirectory = Join-Path $projectRoot 'output/qa/dev-093'
New-Item -ItemType Directory -Force $outputDirectory | Out-Null
$migration = Join-Path $projectRoot 'supabase/migrations/20260828090000_dev_093_task_collection_assets.sql'
$checks = @(
  @{ name = 'migration exists'; passed = Test-Path -LiteralPath $migration },
  @{ name = 'collection columns'; passed = ((Get-Content -Raw -LiteralPath $migration) -match 'collection_operation_id' -and (Get-Content -Raw -LiteralPath $migration) -match 'source_root_item_id') },
  @{ name = 'transaction settings'; passed = ((Get-Content -Raw -LiteralPath $migration) -match "lock_timeout = '3s'" -and (Get-Content -Raw -LiteralPath $migration) -match "statement_timeout = '15s'") },
  @{ name = 'RLS grants'; passed = ((Get-Content -Raw -LiteralPath $migration) -match 'grant execute on function public.collect_task_subtree') }
)
$status = 'not-run'
$reason = $null
$supabase = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $supabase) { $reason = 'npm CLI unavailable' }
else {
  try {
    $statusOutput = & npm.cmd exec --yes supabase@latest -- status 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) { $reason = 'Supabase local runtime is not available; no remote DB was touched.' }
    else { $reason = 'Local Supabase runtime detected; set DEV093_RUN_DB=1 to opt into the isolated reset harness.' }
  } catch { $reason = 'Supabase status probe failed; no remote DB was touched.' }
}
$preflightPassed = (($checks | Where-Object { -not $_.passed }).Count -eq 0)
$result = [ordered]@{ dev = 'DEV-093'; status = $status; passed = ($preflightPassed -and $status -eq 'passed'); preflightPassed = $preflightPassed; checks = $checks; reason = $reason; migration = (Split-Path -Leaf $migration); generatedAt = (Get-Date).ToUniversalTime().ToString('o') }
$result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $outputDirectory 'db-result.json') -Encoding UTF8
if (-not $preflightPassed) { exit 1 }
Write-Output "DEV-093 DB preflight checks passed; execution status: $status ($reason)"
