$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$outputDirectory = Join-Path $projectRoot 'output\qa\dev-095'
$migrationPath = Join-Path $projectRoot 'supabase\migrations\20260828100000_dev_095_task_tracking_references.sql'
$bootstrapPath = Join-Path $projectRoot 'scripts\verify-dev-095-task-tracking-references-db-bootstrap.sql'
$matrixPath = Join-Path $projectRoot 'scripts\verify-dev-095-task-tracking-references-db-matrix.sql'
$performancePath = Join-Path $projectRoot 'scripts\verify-dev-095-task-tracking-references-db-performance.sql'
$artifactPath = Join-Path $outputDirectory 'db-isolated-result.json'
$postgresBin = Split-Path -Parent (Get-Command initdb.exe -ErrorAction Stop).Source
$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$runtimeName = "projed-dev095-postgres-$([guid]::NewGuid().ToString('N'))"
$runtimeRoot = [System.IO.Path]::GetFullPath((Join-Path $tempRoot $runtimeName))
$dataPath = Join-Path $runtimeRoot 'data'
$logPath = Join-Path $runtimeRoot 'postgres.log'
$database = 'dev095_verify'
$started = $false
$result = $null

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
$listener.Stop()
Write-Output ("TEMP_RUNTIME project={0} purpose=DEV-095 isolated migration/RLS/RPC matrix port={1} owner=pg_ctl:{2} cleanup=after DB gate" -f $projectRoot, $port, $dataPath)

function Invoke-PgTool {
  param([Parameter(Mandatory = $true)][string]$Name, [Parameter(Mandatory = $true)][string[]]$Arguments, [switch]$Capture)
  $toolPath = Join-Path $postgresBin $Name
  if ($Capture) {
    # Native stderr is surfaced as a PowerShell ErrorRecord when Stop is active;
    # temporarily allow it through so the matrix output is retained for diagnosis.
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { $captured = (& $toolPath @Arguments 2>&1 | Out-String) }
    finally { $ErrorActionPreference = $previousErrorAction }
  }
  elseif ($Name -eq 'pg_ctl.exe') { & $toolPath @Arguments; $captured = '' }
  else { & $toolPath @Arguments | Out-Null; $captured = '' }
  $script:lastPgOutput = $captured
  if ($LASTEXITCODE -ne 0) { throw "$Name failed with exit code $LASTEXITCODE`n$captured" }
  return $captured
}

try {
  foreach ($required in @($migrationPath, $bootstrapPath, $matrixPath, $performancePath)) { if (-not (Test-Path -LiteralPath $required)) { throw "Missing verifier file: $required" } }
  New-Item -ItemType Directory -Path $runtimeRoot | Out-Null
  Write-Output 'DB_STAGE=initdb'
  Invoke-PgTool initdb.exe @('-D', $dataPath, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--no-locale')
  Write-Output 'DB_STAGE=pg_ctl_start'
  Invoke-PgTool pg_ctl.exe @('-D', $dataPath, '-l', $logPath, '-o', "-h 127.0.0.1 -p $port", '-w', 'start')
  $started = $true
  Write-Output 'DB_STAGE=createdb'
  Invoke-PgTool createdb.exe @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', $database)
  Write-Output 'DB_STAGE=bootstrap'
  Invoke-PgTool psql.exe @('-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $database, '-f', $bootstrapPath)
  Write-Output 'DB_STAGE=migration'
  Invoke-PgTool psql.exe @('-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $database, '-f', $migrationPath)
  Write-Output 'DB_STAGE=matrix'
  try { $matrixOutput = Invoke-PgTool psql.exe -Capture @('-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $database, '-f', $matrixPath) }
  catch { Set-Content -LiteralPath (Join-Path $outputDirectory 'db-debug.txt') -Value $script:lastPgOutput -Encoding UTF8; throw }
  Set-Content -LiteralPath (Join-Path $outputDirectory 'db-debug.txt') -Value $matrixOutput -Encoding UTF8
  $marker = [regex]::Match($matrixOutput, '(?m)^DEV095_RESULT=(\{.*\})\s*$')
  if (-not $marker.Success) { throw "DEV-095 matrix completed without result marker.`n$matrixOutput" }
  $result = $marker.Groups[1].Value | ConvertFrom-Json
  $result | Add-Member -NotePropertyName devId -NotePropertyValue 'DEV-095'
  $result | Add-Member -NotePropertyName sourceRevision -NotePropertyValue 'working-tree'
  $result | Add-Member -NotePropertyName environment -NotePropertyValue 'isolated-test'
  $result | Add-Member -NotePropertyName provider -NotePropertyValue 'postgresql-loopback'
  $result | Add-Member -NotePropertyName command -NotePropertyValue 'npm run verify:dev-095-task-tracking-references-db-isolated'
  Write-Output 'DB_STAGE=performance'
  try { $performanceOutput = Invoke-PgTool psql.exe -Capture @('-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $database, '-f', $performancePath) }
  catch { Set-Content -LiteralPath (Join-Path $outputDirectory 'db-performance.txt') -Value $script:lastPgOutput -Encoding UTF8; throw }
  Set-Content -LiteralPath (Join-Path $outputDirectory 'db-performance.txt') -Value $performanceOutput -Encoding UTF8
  $performanceMarker = [regex]::Match($performanceOutput, '(?m)^DEV095_PERF_RESULT=(\{.*\})\s*$')
  if (-not $performanceMarker.Success) { throw "DEV-095 performance script completed without result marker.`n$performanceOutput" }
  $performanceResult = $performanceMarker.Groups[1].Value | ConvertFrom-Json
  $placementSeqScan = [regex]::IsMatch($performanceOutput, '(?im)Seq Scan on (?:public\.)?wbs_item_placements')
  $canonicalTaskSeqScan = [regex]::IsMatch($performanceOutput, '(?im)Seq Scan on (?:public\.)?wbs_items')
  if ($placementSeqScan -or $canonicalTaskSeqScan) {
    throw "DEV-095 performance plan unexpectedly used a full scan on placement/task table (placementSeqScan=$placementSeqScan canonicalTaskSeqScan=$canonicalTaskSeqScan)."
  }
  $result | Add-Member -NotePropertyName performance -NotePropertyValue ([pscustomobject]@{
    fixture = $performanceResult
    explainArtifact = 'output/qa/dev-095/db-performance.txt'
    placementSeqScan = $placementSeqScan
    canonicalTaskSeqScan = $canonicalTaskSeqScan
    plans = @('projection', 'visibility', 'last-reference-revoke')
  })
  $result.checks | Add-Member -NotePropertyName performanceProjection -NotePropertyValue $true
  $result.checks | Add-Member -NotePropertyName performanceVisibility -NotePropertyValue $true
  $result.checks | Add-Member -NotePropertyName performanceLastReference -NotePropertyValue $true
  $result | Add-Member -NotePropertyName cases -NotePropertyValue @($result.checks.psobject.Properties | ForEach-Object { [pscustomobject]@{ id=$_.Name; status=if ([bool]$_.Value) {'PASS'} else {'FAIL'}; expected="$($_.Name) should pass"; actual=if ([bool]$_.Value) {'condition=true'} else {'condition=false'}; evidence=@('isolated PostgreSQL migration/RPC matrix') } })
  $result | Add-Member -NotePropertyName summary -NotePropertyValue ([pscustomobject]@{ PASS=@($result.cases | Where-Object status -eq 'PASS').Count; FAIL=@($result.cases | Where-Object status -eq 'FAIL').Count; NOT_RUN=0; BLOCKED=0 })
  $result | Add-Member -NotePropertyName generatedAt -NotePropertyValue ([DateTime]::UtcNow.ToString('o'))
  $result | Add-Member -NotePropertyName runtimeCleanup -NotePropertyValue 'pending'
  Write-Output 'DEV-095 isolated PostgreSQL migration/RLS/RPC matrix passed.'
}
catch {
  $result = [ordered]@{ dev='DEV-095'; devId='DEV-095'; sourceRevision='working-tree'; environment='isolated-test'; provider='postgresql-loopback'; command='npm run verify:dev-095-task-tracking-references-db-isolated'; runtime='task-owned PostgreSQL 18 loopback; no remote Supabase touched'; cases=@(); summary=[ordered]@{PASS=0;FAIL=0;NOT_RUN=0;BLOCKED=1}; status='failed'; passed=$false; migration=Split-Path -Leaf $migrationPath; reason=$_.Exception.Message; generatedAt=[DateTime]::UtcNow.ToString('o'); runtimeCleanup='pending' }
  throw
}
finally {
  if ($started) { & (Join-Path $postgresBin 'pg_ctl.exe') -D $dataPath -m fast -w stop | Out-Null; if ($LASTEXITCODE -ne 0) { throw "Failed to stop DEV-095 PostgreSQL runtime on port $port" } }
  $listening = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($listening) { throw "DEV-095 PostgreSQL port $port is still listening after cleanup" }
  $resolvedRuntime = [System.IO.Path]::GetFullPath($runtimeRoot)
  if (-not $resolvedRuntime.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) { throw "Refusing to remove runtime outside temp root: $resolvedRuntime" }
  $removed = $true
  if (Test-Path -LiteralPath $resolvedRuntime) { Remove-Item -LiteralPath $resolvedRuntime -Recurse -Force; $removed = -not (Test-Path -LiteralPath $resolvedRuntime) }
  if ($null -ne $result) { $result.runtimeCleanup = if ($removed) { "port=$port released=true path_removed=true" } else { "port=$port released=true path_removed=false" }; $result | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $artifactPath -Encoding UTF8 }
  Write-Output ("TEMP_RUNTIME_CLEANED port={0} released=true path_removed={1}" -f $port, $removed)
}
if ($result.status -ne 'passed' -or -not $result.passed) { exit 1 }
