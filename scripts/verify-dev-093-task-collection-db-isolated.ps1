$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$outputDirectory = Join-Path $projectRoot 'output\qa\dev-093'
$migrationPath = Join-Path $projectRoot 'supabase\migrations\20260828090000_dev_093_task_collection_assets.sql'
$bootstrapPath = Join-Path $projectRoot 'scripts\verify-dev-093-task-collection-db-bootstrap.sql'
$matrixPath = Join-Path $projectRoot 'scripts\verify-dev-093-task-collection-db-matrix.sql'
$artifactPath = Join-Path $outputDirectory 'db-isolated-result.json'
$postgresBin = Split-Path -Parent (Get-Command initdb.exe -ErrorAction Stop).Source
$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$runtimeRoot = [System.IO.Path]::GetFullPath((Join-Path $tempRoot ("projed-dev093-postgres-{0}" -f [guid]::NewGuid().ToString('N'))))
$dataPath = Join-Path $runtimeRoot 'data'
$logPath = Join-Path $runtimeRoot 'postgres.log'
$database = 'dev093_verify'
$started = $false
$result = $null

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
$listener.Stop()

Write-Output ("TEMP_RUNTIME project={0} purpose=DEV-093 isolated migration/RLS/RPC matrix port={1} owner=pg_ctl:{2} cleanup=after DB gate" -f $projectRoot, $port, $dataPath)

function Invoke-PgTool {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [switch]$Capture
  )
  $toolPath = Join-Path $postgresBin $Name
  if ($Capture) {
    $captured = (& $toolPath @Arguments 2>&1 | Out-String)
  } elseif ($Name -eq 'pg_ctl.exe') {
    # Do not pipe pg_ctl stdout: on Windows the child postgres process can
    # inherit that pipe and keep the caller waiting after startup succeeds.
    & $toolPath @Arguments
    $captured = ''
  } else {
    & $toolPath @Arguments | Out-Null
    $captured = ''
  }
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE`n$captured"
  }
  return $captured
}

try {
  if (-not (Test-Path -LiteralPath $migrationPath)) { throw 'DEV-093 migration file is missing' }
  if (-not (Test-Path -LiteralPath $bootstrapPath)) { throw 'DEV-093 bootstrap file is missing' }
  if (-not (Test-Path -LiteralPath $matrixPath)) { throw 'DEV-093 matrix file is missing' }

  Write-Output 'DB_STAGE=initdb'
  New-Item -ItemType Directory -Path $runtimeRoot | Out-Null
  Invoke-PgTool -Name 'initdb.exe' -Arguments @('-D', $dataPath, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--no-locale')
  Write-Output 'DB_STAGE=pg_ctl_start'
  Invoke-PgTool -Name 'pg_ctl.exe' -Arguments @('-D', $dataPath, '-l', $logPath, '-o', "-h 127.0.0.1 -p $port", '-w', 'start')
  $started = $true
  Write-Output 'DB_STAGE=createdb'
  Invoke-PgTool -Name 'createdb.exe' -Arguments @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', $database)
  Write-Output 'DB_STAGE=bootstrap'
  Invoke-PgTool -Name 'psql.exe' -Arguments @('-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $database, '-f', $bootstrapPath)
  Write-Output 'DB_STAGE=migration'
  Invoke-PgTool -Name 'psql.exe' -Arguments @('-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $database, '-f', $migrationPath)
  Write-Output 'DB_STAGE=matrix'
  $matrixOutput = Invoke-PgTool -Name 'psql.exe' -Capture -Arguments @('-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-v', "dev093_port=$port", '-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $database, '-f', $matrixPath)
  $marker = [regex]::Match($matrixOutput, '(?m)^DEV093_RESULT=(\{.*\})\s*$')
  if (-not $marker.Success) { throw "DEV-093 matrix completed without a result marker.`n$matrixOutput" }
  $result = $marker.Groups[1].Value | ConvertFrom-Json
  $canonicalOutput = (& npx tsx scripts/verify-dev-093-task-collection-canonical.ts 2>&1 | Out-String)
  $canonicalMarker = [regex]::Match($canonicalOutput, '(?m)^DEV093_CANONICAL=(\{.*\})\s*$')
  if (-not $canonicalMarker.Success) { throw "DEV-093 TypeScript canonical verifier completed without a result marker.`n$canonicalOutput" }
  $canonical = $canonicalMarker.Groups[1].Value | ConvertFrom-Json
  if ($result.canonicalSql -ne $canonical.canonical -or $result.canonicalSha256 -ne $canonical.sha256) {
    throw "DEV-093 SQL/TypeScript canonical parity mismatch. SQL=$($result.canonicalSql) TS=$($canonical.canonical) SQLHash=$($result.canonicalSha256) TSHash=$($canonical.sha256)"
  }
  $result.checks | Add-Member -NotePropertyName canonicalParity -NotePropertyValue $true
  $result.passed = [bool]$result.passed -and $true
  $result | Add-Member -NotePropertyName devId -NotePropertyValue 'DEV-093'
  $result | Add-Member -NotePropertyName sourceRevision -NotePropertyValue 'working-tree'
  $result | Add-Member -NotePropertyName environment -NotePropertyValue 'isolated-test'
  $result | Add-Member -NotePropertyName provider -NotePropertyValue 'postgresql-loopback'
  $result | Add-Member -NotePropertyName command -NotePropertyValue 'npm run verify:dev-093-task-collection-db-isolated'
  $result | Add-Member -NotePropertyName route -NotePropertyValue 'postgresql://127.0.0.1'
  $dbCases = @($result.checks.psobject.Properties | ForEach-Object {
    [pscustomobject]@{
      id = $_.Name
      status = if ([bool]$_.Value) { 'PASS' } else { 'FAIL' }
      expected = "$($_.Name) should pass"
      actual = if ([bool]$_.Value) { 'condition=true' } else { 'condition=false' }
      evidence = @('isolated PostgreSQL migration/RPC matrix')
    }
  })
  $result | Add-Member -NotePropertyName cases -NotePropertyValue $dbCases
  $result | Add-Member -NotePropertyName summary -NotePropertyValue ([pscustomobject]@{
    PASS = @($dbCases | Where-Object status -eq 'PASS').Count
    FAIL = @($dbCases | Where-Object status -eq 'FAIL').Count
    NOT_RUN = 0
    BLOCKED = 0
  })
  $result | Add-Member -NotePropertyName generatedAt -NotePropertyValue ([DateTime]::UtcNow.ToString('o'))
  $result | Add-Member -NotePropertyName runtimeCleanup -NotePropertyValue 'pending'
  Write-Output 'DEV-093 isolated PostgreSQL migration/RPC matrix passed.'
}
catch {
  $result = [ordered]@{
    dev = 'DEV-093'
    devId = 'DEV-093'
    sourceRevision = 'working-tree'
    environment = 'isolated-test'
    provider = 'postgresql-loopback'
    command = 'npm run verify:dev-093-task-collection-db-isolated'
    runtime = 'task-owned PostgreSQL 18 loopback; no remote Supabase touched'
    cases = @()
    summary = [ordered]@{ PASS = 0; FAIL = 0; NOT_RUN = 0; BLOCKED = 1 }
    status = 'failed'
    passed = $false
    migration = Split-Path -Leaf $migrationPath
    reason = $_.Exception.Message
    generatedAt = [DateTime]::UtcNow.ToString('o')
    runtimeCleanup = 'pending'
  }
  throw
}
finally {
  if ($started) {
    & (Join-Path $postgresBin 'pg_ctl.exe') -D $dataPath -m fast -w stop | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to stop DEV-093 PostgreSQL runtime on port $port" }
  }

  $listening = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($listening) { throw "DEV-093 PostgreSQL port $port is still listening after cleanup" }

  $resolvedRuntime = [System.IO.Path]::GetFullPath($runtimeRoot)
  if (-not $resolvedRuntime.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove runtime outside temp root: $resolvedRuntime"
  }
  $removed = $true
  if (Test-Path -LiteralPath $resolvedRuntime) {
    Remove-Item -LiteralPath $resolvedRuntime -Recurse -Force
    $removed = -not (Test-Path -LiteralPath $resolvedRuntime)
  }
  if ($null -ne $result) {
    $cleanupValue = if ($removed) { "port=$port released=true path_removed=true" } else { "port=$port released=true path_removed=false" }
    if ($result -is [System.Collections.IDictionary]) { $result['runtimeCleanup'] = $cleanupValue } else { $result.runtimeCleanup = $cleanupValue }
    $result | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $artifactPath -Encoding UTF8
  }
  Write-Output ("TEMP_RUNTIME_CLEANED port={0} released=true path_removed={1}" -f $port, $removed)
}

if ($result.status -ne 'passed' -or -not $result.passed) { exit 1 }
