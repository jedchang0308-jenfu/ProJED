param(
  [switch]$IncludeConcurrent
)

$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$outputDirectory = Join-Path $projectRoot 'output\qa\dev-122'
$postgresBin = Split-Path -Parent (Get-Command initdb.exe -ErrorAction Stop).Source
$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$runtimeName = "projed-dev122-postgres-$([guid]::NewGuid().ToString('N'))"
$runtimeRoot = [System.IO.Path]::GetFullPath((Join-Path $tempRoot $runtimeName))
$dataPath = Join-Path $runtimeRoot 'data'
$logPath = Join-Path $runtimeRoot 'postgres.log'
$database = 'dev122_verify'
$bootstrapPath = Join-Path $projectRoot 'scripts\verify-dev-122-mobile-zero-data-quick-task-db-bootstrap.sql'
$migrationPath = Join-Path $projectRoot 'supabase\migrations\20260914120000_dev_122_quick_unplaced_task_rpc.sql'
$matrixPath = Join-Path $projectRoot 'scripts\verify-dev-122-mobile-zero-data-quick-task-db-matrix.sql'
$placementMigrationPath = Join-Path $projectRoot 'supabase\migrations\20260826083940_dev_089_scope_safe_task_placement_command.sql'
$concurrentPreludePath = Join-Path $projectRoot 'scripts\verify-dev-122-mobile-zero-data-quick-task-db-concurrent-prelude.sql'
$concurrentScriptPath = Join-Path $projectRoot 'scripts\verify-dev-122-mobile-zero-data-quick-task-db-concurrent.pgbench.sql'
$concurrentCheckPath = Join-Path $projectRoot 'scripts\verify-dev-122-mobile-zero-data-quick-task-db-concurrent-check.sql'
$mixedScriptPath = Join-Path $projectRoot 'scripts\verify-dev-122-mobile-zero-data-quick-task-db-concurrent-mixed.pgbench.sql'
$mixedCheckPath = Join-Path $projectRoot 'scripts\verify-dev-122-mobile-zero-data-quick-task-db-concurrent-mixed-check.sql'
$artifactPath = Join-Path $outputDirectory 'db-isolated-result.json'
$started = $false
$result = $null
$concurrentResult = $null

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
$listener.Stop()
Write-Output ("TEMP_RUNTIME project={0} purpose=DEV-122 isolated migration/RLS/RPC core matrix port={1} owner=pg_ctl:{2} cleanup=after DB gate" -f $projectRoot, $port, $dataPath)

function Invoke-PgTool {
  param([Parameter(Mandatory = $true)][string]$Name, [Parameter(Mandatory = $true)][string[]]$Arguments, [switch]$Capture)
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
  $script:lastPgOutput = $captured
  if ($LASTEXITCODE -ne 0) { throw "$Name failed with exit code $LASTEXITCODE`n$captured" }
  return $captured
}

function Get-Sha256Hex {
  param([Parameter(Mandatory = $true)][string]$Path)
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.IO.File]::ReadAllBytes($Path)
    return ([System.BitConverter]::ToString($sha256.ComputeHash($bytes))).Replace('-', '')
  }
  finally {
    $sha256.Dispose()
  }
}

try {
  $requiredFiles = @($bootstrapPath, $migrationPath, $placementMigrationPath, $matrixPath)
  if ($IncludeConcurrent) { $requiredFiles += @($concurrentPreludePath, $concurrentScriptPath, $concurrentCheckPath, $mixedScriptPath, $mixedCheckPath) }
  foreach ($required in $requiredFiles) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Missing verifier file: $required" }
  }
  New-Item -ItemType Directory -Path $runtimeRoot | Out-Null
  Invoke-PgTool initdb.exe @('-D', $dataPath, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--no-locale')
  Invoke-PgTool pg_ctl.exe @('-D', $dataPath, '-l', $logPath, '-o', "-h 127.0.0.1 -p $port", '-w', 'start')
  $started = $true
  Invoke-PgTool createdb.exe @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', $database)
  Invoke-PgTool psql.exe @('-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $database, '-f', $bootstrapPath)
  Invoke-PgTool psql.exe @('-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $database, '-f', $migrationPath)
  if ($IncludeConcurrent) {
    Invoke-PgTool psql.exe @('-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $database, '-f', $concurrentPreludePath)
    $concurrentOutput = Invoke-PgTool pgbench.exe -Capture @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $database, '-n', '-c', '20', '-j', '4', '-t', '1', '-f', $concurrentScriptPath)
    Set-Content -LiteralPath (Join-Path $outputDirectory 'db-concurrent-pgbench.txt') -Value $concurrentOutput -Encoding UTF8
    $concurrentCheckOutput = Invoke-PgTool psql.exe -Capture @('-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $database, '-f', $concurrentCheckPath)
    Set-Content -LiteralPath (Join-Path $outputDirectory 'db-concurrent-check.txt') -Value $concurrentCheckOutput -Encoding UTF8
    $concurrentMarker = [regex]::Match($concurrentCheckOutput, '(?m)^DEV122_CONCURRENT=(\{.*\})\s*$')
    if (-not $concurrentMarker.Success) { throw "DEV-122 concurrent check completed without result marker.`n$concurrentCheckOutput" }
    $concurrentResult = $concurrentMarker.Groups[1].Value | ConvertFrom-Json
    if (-not [bool]$concurrentResult.passed) { throw "DEV-122 concurrent transport check reported a failed case." }
    Invoke-PgTool psql.exe @('-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $database, '-f', $concurrentPreludePath)
    $mixedOutput = Invoke-PgTool pgbench.exe -Capture @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $database, '-n', '-c', '40', '-j', '8', '-t', '1', '-f', $mixedScriptPath)
    Set-Content -LiteralPath (Join-Path $outputDirectory 'db-concurrent-mixed-pgbench.txt') -Value $mixedOutput -Encoding UTF8
    $mixedCheckOutput = Invoke-PgTool psql.exe -Capture @('-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $database, '-f', $mixedCheckPath)
    Set-Content -LiteralPath (Join-Path $outputDirectory 'db-concurrent-mixed-check.txt') -Value $mixedCheckOutput -Encoding UTF8
    $mixedMarker = [regex]::Match($mixedCheckOutput, '(?m)^DEV122_MIXED=(\{.*\})\s*$')
    if (-not $mixedMarker.Success) { throw "DEV-122 mixed-writer check completed without result marker.`n$mixedCheckOutput" }
    $mixedResult = $mixedMarker.Groups[1].Value | ConvertFrom-Json
    if (-not [bool]$mixedResult.passed) { throw "DEV-122 mixed-writer compatible transport check reported a failed case." }
    $concurrentResult | Add-Member -NotePropertyName mixedWriter -NotePropertyValue $mixedResult
    Write-Output 'DEV-122 concurrent PostgreSQL pgbench transport check passed.'
  }
  $matrixOutput = Invoke-PgTool psql.exe -Capture @('-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $database, '-f', $matrixPath)
  Set-Content -LiteralPath (Join-Path $outputDirectory 'db-matrix.txt') -Value $matrixOutput -Encoding UTF8
  $marker = [regex]::Match($matrixOutput, '(?m)^DEV122_RESULT=(\{.*\})\s*$')
  if (-not $marker.Success) { throw "DEV-122 matrix completed without result marker.`n$matrixOutput" }
  $result = $marker.Groups[1].Value | ConvertFrom-Json
  $result | Add-Member -NotePropertyName devId -NotePropertyValue 'DEV-122'
  $result | Add-Member -NotePropertyName sourceRevision -NotePropertyValue 'working-tree'
  $result | Add-Member -NotePropertyName environment -NotePropertyValue 'isolated-test'
  $result | Add-Member -NotePropertyName provider -NotePropertyValue 'postgresql-loopback'
  $result | Add-Member -NotePropertyName command -NotePropertyValue 'npm run verify:dev-122-mobile-zero-data-quick-task-db-isolated'
  $result | Add-Member -NotePropertyName migration -NotePropertyValue (Split-Path -Leaf $migrationPath)
  $sourceHashes = [ordered]@{
      quickMigration = Get-Sha256Hex -Path $migrationPath
      placementMigration = Get-Sha256Hex -Path $placementMigrationPath
      matrix = Get-Sha256Hex -Path $matrixPath
    }
  if ($IncludeConcurrent) {
    $sourceHashes.concurrentPrelude = Get-Sha256Hex -Path $concurrentPreludePath
    $sourceHashes.concurrentScript = Get-Sha256Hex -Path $concurrentScriptPath
    $sourceHashes.concurrentCheck = Get-Sha256Hex -Path $concurrentCheckPath
    $sourceHashes.mixedScript = Get-Sha256Hex -Path $mixedScriptPath
    $sourceHashes.mixedCheck = Get-Sha256Hex -Path $mixedCheckPath
  }
  $result | Add-Member -NotePropertyName sourceHashes -NotePropertyValue $sourceHashes
  if ($IncludeConcurrent) { $result | Add-Member -NotePropertyName concurrentTransport -NotePropertyValue $concurrentResult }
  $result | Add-Member -NotePropertyName runtimeCleanup -NotePropertyValue 'pending'
  if (-not [bool]$result.passed) { throw "DEV-122 isolated matrix reported a failed case." }
  Write-Output 'DEV-122 isolated PostgreSQL migration/RLS/RPC core matrix passed.'
}
catch {
  $result = [ordered]@{
    devId = 'DEV-122'; sourceRevision = 'working-tree'; environment = 'isolated-test'; provider = 'postgresql-loopback'
    command = 'npm run verify:dev-122-mobile-zero-data-quick-task-db-isolated'; status = 'FAIL'; passed = $false
    reason = $_.Exception.Message; migration = Split-Path -Leaf $migrationPath; generatedAt = [DateTime]::UtcNow.ToString('o'); runtimeCleanup = 'pending'
  }
  throw
}
finally {
  if ($started) {
    & (Join-Path $postgresBin 'pg_ctl.exe') -D $dataPath -m fast -w stop | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to stop DEV-122 PostgreSQL runtime on port $port" }
  }
  $listening = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($listening) { throw "DEV-122 PostgreSQL port $port is still listening after cleanup" }
  $resolvedRuntime = [System.IO.Path]::GetFullPath($runtimeRoot)
  if (-not $resolvedRuntime.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) { throw "Refusing to remove runtime outside temp root: $resolvedRuntime" }
  $removed = $true
  if (Test-Path -LiteralPath $resolvedRuntime) { Remove-Item -LiteralPath $resolvedRuntime -Recurse -Force; $removed = -not (Test-Path -LiteralPath $resolvedRuntime) }
  if ($null -ne $result) {
    $result.runtimeCleanup = if ($removed) { "port=$port released=true path_removed=true" } else { "port=$port released=true path_removed=false" }
    if ($null -ne $result.PSObject.Properties['generatedAt']) {
      $result.generatedAt = [DateTime]::UtcNow.ToString('o')
    } else {
      $result | Add-Member -NotePropertyName generatedAt -NotePropertyValue ([DateTime]::UtcNow.ToString('o'))
    }
    $result | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $artifactPath -Encoding UTF8
  }
  Write-Output ("TEMP_RUNTIME_CLEANED port={0} released=true path_removed={1}" -f $port, $removed)
}

if ($null -eq $result -or -not [bool]$result.passed) { exit 1 }
