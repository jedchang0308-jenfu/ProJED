$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$migrationPath = Join-Path $projectRoot 'supabase\migrations\20260826104321_dev_090_account_board_task_filter_preferences.sql'
$bootstrapPath = Join-Path $projectRoot 'scripts\verify-dev-090-task-filter-db-bootstrap.sql'
$matrixPath = Join-Path $projectRoot 'scripts\verify-dev-090-task-filter-db-matrix.sql'
$postgresBin = Split-Path -Parent (Get-Command initdb -ErrorAction Stop).Source
$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$runtimeRoot = [System.IO.Path]::GetFullPath((Join-Path $tempRoot ("projed-dev090-postgres-{0}" -f [guid]::NewGuid().ToString('N'))))
$dataPath = Join-Path $runtimeRoot 'data'
$logPath = Join-Path $runtimeRoot 'postgres.log'
$started = $false

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
$listener.Stop()

Write-Output ("TEMP_RUNTIME project={0} purpose=DEV-090 isolated migration/RLS matrix port={1} owner=pg_ctl:{2} cleanup=after DB gate" -f $projectRoot, $port, $dataPath)

function Invoke-PgTool {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )
  & (Join-Path $postgresBin $Name) @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE"
  }
}

try {
  New-Item -ItemType Directory -Path $runtimeRoot | Out-Null
  Invoke-PgTool -Name 'initdb.exe' -Arguments @('-D', $dataPath, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--no-locale')
  Invoke-PgTool -Name 'pg_ctl.exe' -Arguments @('-D', $dataPath, '-l', $logPath, '-o', "-h 127.0.0.1 -p $port", '-w', 'start')
  $started = $true

  Invoke-PgTool -Name 'createdb.exe' -Arguments @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', 'dev090_verify')
  Invoke-PgTool -Name 'psql.exe' -Arguments @('-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', 'dev090_verify', '-f', $bootstrapPath)
  Invoke-PgTool -Name 'psql.exe' -Arguments @('-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', 'dev090_verify', '-f', $migrationPath)
  Invoke-PgTool -Name 'psql.exe' -Arguments @('-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', 'dev090_verify', '-f', $matrixPath)
}
finally {
  if ($started) {
    & (Join-Path $postgresBin 'pg_ctl.exe') -D $dataPath -m fast -w stop | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to stop DEV-090 PostgreSQL runtime on port $port"
    }
  }

  $listening = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($listening) {
    throw "DEV-090 PostgreSQL port $port is still listening after cleanup"
  }

  $resolvedRuntime = [System.IO.Path]::GetFullPath($runtimeRoot)
  if (-not $resolvedRuntime.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove runtime outside temp root: $resolvedRuntime"
  }
  if (Test-Path -LiteralPath $resolvedRuntime) {
    Remove-Item -LiteralPath $resolvedRuntime -Recurse -Force
  }
  Write-Output ("TEMP_RUNTIME_CLEANED port={0} released=true path_removed={1}" -f $port, (-not (Test-Path -LiteralPath $resolvedRuntime)))
}
