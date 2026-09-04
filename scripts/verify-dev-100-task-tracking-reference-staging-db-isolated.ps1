$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$postgresBin = Split-Path -Parent (Get-Command initdb.exe -ErrorAction Stop).Source
$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$runtimeRoot = [System.IO.Path]::GetFullPath((Join-Path $tempRoot ("projed-dev100-postgres-{0}" -f [guid]::NewGuid().ToString('N'))))
$dataPath = Join-Path $runtimeRoot 'data'
$logPath = Join-Path $runtimeRoot 'postgres.log'
$database = 'dev100_verify'
$started = $false

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
$listener.Stop()

Write-Output ("TEMP_RUNTIME project={0} purpose=DEV-100 isolated staging migration/RPC matrix port={1} owner=pg_ctl:{2} cleanup=after DB gate" -f $projectRoot, $port, $dataPath)

function Invoke-PgTool {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [switch]$Capture
  )
  $toolPath = Join-Path $postgresBin $Name
  if ($Capture) {
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { $captured = (& $toolPath @Arguments 2>&1 | Out-String) }
    finally { $ErrorActionPreference = $previousErrorAction }
  } elseif ($Name -eq 'pg_ctl.exe') {
    & $toolPath @Arguments
    $captured = ''
  } else {
    & $toolPath @Arguments | Out-Null
    $captured = ''
  }
  if ($LASTEXITCODE -ne 0) { throw "$Name failed with exit code $LASTEXITCODE`n$captured" }
  return $captured
}

try {
  $sqlFiles = @(
    (Join-Path $projectRoot 'scripts\verify-dev-095-task-tracking-references-db-bootstrap.sql'),
    (Join-Path $projectRoot 'supabase\migrations\20260828100000_dev_095_task_tracking_references.sql'),
    (Join-Path $projectRoot 'supabase\migrations\20260902052843_stage_task_tracking_references_in_workbench.sql')
  )
  $matrixPath = Join-Path $projectRoot 'scripts\verify-dev-100-task-tracking-reference-staging-db-matrix.sql'
  foreach ($required in @($sqlFiles + $matrixPath)) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Missing verifier file: $required" }
  }

  New-Item -ItemType Directory -Path $runtimeRoot | Out-Null
  Invoke-PgTool initdb.exe @('-D', $dataPath, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--no-locale')
  Invoke-PgTool pg_ctl.exe @('-D', $dataPath, '-l', $logPath, '-o', "-h 127.0.0.1 -p $port", '-w', 'start')
  $started = $true
  Invoke-PgTool createdb.exe @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', $database)
  foreach ($sqlFile in $sqlFiles) {
    Invoke-PgTool psql.exe @('-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $database, '-f', $sqlFile)
  }
  $plpgsqlCheckAvailable = (Invoke-PgTool psql.exe -Capture @(
    '-X', '-A', '-t', '-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $database,
    '-c', "select exists (select 1 from pg_available_extensions where name = 'plpgsql_check');"
  )).Trim()
  if ($plpgsqlCheckAvailable -eq 't') {
    $previousPgSslMode = $env:PGSSLMODE
    try {
      $env:PGSSLMODE = 'disable'
      & npx.cmd --yes supabase@latest db lint --db-url "postgresql://postgres@127.0.0.1:$port/$database" --schema public --level warning --fail-on error
      if ($LASTEXITCODE -ne 0) { throw "Supabase DB lint failed with exit code $LASTEXITCODE" }
    }
    finally {
      if ($null -eq $previousPgSslMode) {
        Remove-Item Env:PGSSLMODE -ErrorAction SilentlyContinue
      } else {
        $env:PGSSLMODE = $previousPgSslMode
      }
    }
  } else {
    Write-Output 'SUPABASE_DB_LINT_SKIPPED reason=plpgsql_check_extension_unavailable'
  }
  $matrixOutput = Invoke-PgTool psql.exe -Capture @('-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $database, '-f', $matrixPath)
  if ($matrixOutput -notmatch '(?m)^DEV100_RESULT=\{.*"passed": true.*\}\s*$') {
    throw "DEV-100 matrix completed without a passing result marker.`n$matrixOutput"
  }
  Write-Output 'DEV-100 isolated PostgreSQL staging migration/RPC matrix passed.'
}
finally {
  if ($started) {
    & (Join-Path $postgresBin 'pg_ctl.exe') -D $dataPath -m fast -w stop | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to stop DEV-100 PostgreSQL runtime on port $port" }
  }
  $listening = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($listening) { throw "DEV-100 PostgreSQL port $port is still listening after cleanup" }
  $resolvedRuntime = [System.IO.Path]::GetFullPath($runtimeRoot)
  if (-not $resolvedRuntime.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove runtime outside temp root: $resolvedRuntime"
  }
  $removed = $true
  if (Test-Path -LiteralPath $resolvedRuntime) {
    Remove-Item -LiteralPath $resolvedRuntime -Recurse -Force
    $removed = -not (Test-Path -LiteralPath $resolvedRuntime)
  }
  Write-Output ("TEMP_RUNTIME_CLEANED port={0} released=true path_removed={1}" -f $port, $removed)
}
