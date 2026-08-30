$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$outputDirectory = Join-Path $projectRoot 'output\qa\dev-093'
$artifactPath = Join-Path $outputDirectory 'db-local-result.json'
$debugPath = Join-Path $outputDirectory 'db-local-debug.txt'
$bootstrapPath = Join-Path $projectRoot 'scripts\verify-dev-093-task-collection-db-bootstrap.sql'
$migrationPath = Join-Path $projectRoot 'supabase\migrations\20260828090000_dev_093_task_collection_assets.sql'
$matrixPath = Join-Path $projectRoot 'scripts\verify-dev-093-task-collection-db-matrix.sql'
$port = 54322
$database = 'dev093_local_' + [guid]::NewGuid().ToString('N').Substring(0, 8)
$created = $false
$result = $null
$previousPassword = $env:PGPASSWORD
$dbPassword = if ($env:DEV093_LOCAL_DB_PASSWORD) { $env:DEV093_LOCAL_DB_PASSWORD } else { 'postgres' }

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

function Invoke-Psql {
  param(
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [switch]$Capture
  )
  $psql = (Get-Command psql.exe -ErrorAction Stop).Source
  if ($Capture) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { $captured = (& $psql @Arguments 2>&1 | Out-String) }
    finally { $ErrorActionPreference = $previous }
    $script:lastPsqlOutput = $captured
    if ($LASTEXITCODE -ne 0) { throw "psql failed with exit code $LASTEXITCODE`n$captured" }
    return $captured
  }
  & $psql @Arguments
  if ($LASTEXITCODE -ne 0) { throw "psql failed with exit code $LASTEXITCODE" }
}

function Invoke-DbTool {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )
  $tool = (Get-Command $Name -ErrorAction Stop).Source
  & $tool @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Name failed with exit code $LASTEXITCODE" }
}

try {
  foreach ($required in @($bootstrapPath, $migrationPath, $matrixPath)) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Missing verifier file: $required" }
  }
  if (-not (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)) {
    throw "Local Supabase database is not listening on port $port; no remote DB was touched."
  }
  $env:PGPASSWORD = $dbPassword
  $owner = 'supabase_admin'
  Write-Output ("TEMP_LOCAL_DB project={0} purpose=DEV-093 local-Supabase provider matrix port={1} owner=supabase_db_ProJED database={2} cleanup=DROP DATABASE after gate" -f $projectRoot, $port, $database)
  Invoke-DbTool -Name 'createdb.exe' -Arguments @('-h', '127.0.0.1', '-p', "$port", '-U', $owner, $database)
  $created = $true
  Write-Output 'DB_STAGE=bootstrap'
  Invoke-Psql -Arguments @('-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', "$port", '-U', $owner, '-d', $database, '-f', $bootstrapPath)
  Write-Output 'DB_STAGE=migration'
  Invoke-Psql -Arguments @('-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', "$port", '-U', $owner, '-d', $database, '-f', $migrationPath)
  Write-Output 'DB_STAGE=matrix-local-supabase'
  $conninfo = "host=localhost port=5432 user=$owner password=$dbPassword dbname=$database"
  $matrixOutput = Invoke-Psql -Capture -Arguments @('-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-v', "dev093_dblink_conninfo=$conninfo", '-h', '127.0.0.1', '-p', "$port", '-U', $owner, '-d', $database, '-f', $matrixPath)
  Set-Content -LiteralPath $debugPath -Value $matrixOutput -Encoding UTF8
  $marker = [regex]::Match($matrixOutput, '(?m)^DEV093_RESULT=(\{.*\})\s*$')
  if (-not $marker.Success) { throw "DEV-093 local matrix completed without a result marker.`n$matrixOutput" }
  $result = $marker.Groups[1].Value | ConvertFrom-Json
  $canonicalOutput = (& npx tsx scripts/verify-dev-093-task-collection-canonical.ts 2>&1 | Out-String)
  if ($LASTEXITCODE -ne 0) { throw "DEV-093 canonical verifier failed.`n$canonicalOutput" }
  $canonicalMarker = [regex]::Match($canonicalOutput, '(?m)^DEV093_CANONICAL=(\{.*\})\s*$')
  if (-not $canonicalMarker.Success) { throw "DEV-093 canonical verifier completed without a result marker.`n$canonicalOutput" }
  $canonical = $canonicalMarker.Groups[1].Value | ConvertFrom-Json
  if ($result.canonicalSql -ne $canonical.canonical -or $result.canonicalSha256 -ne $canonical.sha256) {
    throw "DEV-093 SQL/TypeScript canonical parity mismatch."
  }
  $result.checks | Add-Member -NotePropertyName canonicalParity -NotePropertyValue $true
  $result | Add-Member -NotePropertyName devId -NotePropertyValue 'DEV-093'
  $result | Add-Member -NotePropertyName sourceRevision -NotePropertyValue 'working-tree'
  $result | Add-Member -NotePropertyName environment -NotePropertyValue 'local-test'
  $result | Add-Member -NotePropertyName provider -NotePropertyValue 'supabase-local'
  $result | Add-Member -NotePropertyName command -NotePropertyValue 'npm run verify:dev-093-task-collection-db-local'
  $result | Add-Member -Force -NotePropertyName runtime -NotePropertyValue 'task-owned disposable database in existing Supabase local container; no remote Supabase touched'
  $result | Add-Member -NotePropertyName route -NotePropertyValue 'postgresql://127.0.0.1:54322'
  $result | Add-Member -NotePropertyName localDatabase -NotePropertyValue $database
  $dbCases = @($result.checks.psobject.Properties | ForEach-Object {
    [pscustomobject]@{
      id = $_.Name
      status = if ([bool]$_.Value) { 'PASS' } else { 'FAIL' }
      expected = "$($_.Name) should pass"
      actual = if ([bool]$_.Value) { 'condition=true' } else { 'condition=false' }
      evidence = @('Supabase local disposable database migration/RPC matrix')
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
  Write-Output 'DEV-093 local Supabase migration/RPC matrix passed.'
}
catch {
  $result = [ordered]@{
    dev = 'DEV-093'
    devId = 'DEV-093'
    sourceRevision = 'working-tree'
    environment = 'local-test'
    provider = 'supabase-local'
    command = 'npm run verify:dev-093-task-collection-db-local'
    runtime = 'task-owned disposable database in existing Supabase local container; no remote Supabase touched'
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
  if ($created) {
    try {
      Invoke-DbTool -Name 'dropdb.exe' -Arguments @('-h', '127.0.0.1', '-p', "$port", '-U', 'supabase_admin', '--if-exists', $database)
      $dropExit = 0
    }
    catch {
      $dropExit = $LASTEXITCODE
      if ($dropExit -eq 0) { $dropExit = 1 }
    }
    $exists = Invoke-Psql -Capture -Arguments @('-X', '-At', '-h', '127.0.0.1', '-p', "$port", '-U', 'supabase_admin', '-d', 'postgres', '-c', "select 1 from pg_database where datname='$database';")
    if ($exists.Trim()) { throw "Disposable DEV-093 database was not removed: $database" }
    if ($dropExit -ne 0) { throw "Failed to drop disposable DEV-093 database $database (exit=$dropExit)" }
    if ($null -ne $result) {
      $result.runtimeCleanup = "database=$database dropped=true drop_exit=$dropExit"
      $result | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $artifactPath -Encoding UTF8
    }
    Write-Output ("TEMP_LOCAL_DB_CLEANED database={0} dropped=true drop_exit={1}" -f $database, $dropExit)
  }
  if ($null -eq $previousPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue } else { $env:PGPASSWORD = $previousPassword }
}

if ($result.status -ne 'passed' -or -not $result.passed) { exit 1 }
