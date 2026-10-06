$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$outputDirectory = Join-Path $projectRoot 'output\qa\dev-123'
$postgresBin = Split-Path -Parent (Get-Command initdb.exe -ErrorAction Stop).Source
$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$runtimeName = "projed-dev123-control-$([guid]::NewGuid().ToString('N'))"
$runtimeRoot = [System.IO.Path]::GetFullPath((Join-Path $tempRoot $runtimeName))
$dataPath = Join-Path $runtimeRoot 'data'
$logPath = Join-Path $runtimeRoot 'postgres.log'
$database = 'dev123_verify'
$bootstrapPath = Join-Path $projectRoot 'scripts\verify-dev-123-meeting-task-resolution-db-bootstrap.sql'
$matrixPath = Join-Path $projectRoot 'scripts\verify-dev-123-meeting-task-resolution-db-matrix.sql'
$migrationPaths = @(
  (Join-Path $projectRoot 'supabase\migrations\20260914122616_dev_123_meeting_task_resolution.sql'),
  (Join-Path $projectRoot 'supabase\migrations\20260914130548_dev_123_review_decisions.sql'),
  (Join-Path $projectRoot 'supabase\migrations\20260914133819_dev_123_control_hardening.sql'),
  (Join-Path $projectRoot 'supabase\migrations\20260914154451_dev_123_retry_atomicity.sql'),
  (Join-Path $projectRoot 'supabase\migrations\20260914161741_dev_123_projection_task_scope.sql'),
  (Join-Path $projectRoot 'supabase\migrations\20260915103000_dev_123_projection_accepted_links.sql'),
  (Join-Path $projectRoot 'supabase\migrations\20260915133000_dev_123_manifest_timeline_integrity.sql'),
  (Join-Path $projectRoot 'supabase\migrations\20260915170000_dev_123_projection_request_idempotency.sql')
)
$artifactPath = Join-Path $outputDirectory 'db-isolated-result.json'
$started = $false
$result = $null

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
$listener.Stop()
Write-Output ("TEMP_RUNTIME project={0} purpose=DEV-123 isolated control-plane migration/RLS/RPC core port={1} owner=pg_ctl:{2} cleanup=after DB gate" -f $projectRoot, $port, $dataPath)

function Invoke-PgTool {
  param([Parameter(Mandatory = $true)][string]$Name, [Parameter(Mandatory = $true)][string[]]$Arguments, [switch]$Capture)
  $toolPath = Join-Path $postgresBin $Name
  if ($Capture) {
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { $captured = (& $toolPath @Arguments 2>&1 | Out-String) }
    finally { $ErrorActionPreference = $previousErrorAction }
  } else {
    & $toolPath @Arguments
    $captured = ''
  }
  $script:lastPgOutput = $captured
  if ($LASTEXITCODE -ne 0) { throw "$Name failed with exit code $LASTEXITCODE`n$captured" }
  if ($Capture) { return $captured }
}

try {
  foreach ($required in @($bootstrapPath, $matrixPath) + $migrationPaths) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Missing verifier file: $required" }
  }
  New-Item -ItemType Directory -Path $runtimeRoot | Out-Null
  Invoke-PgTool initdb.exe @('-D', $dataPath, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--no-locale')
  Invoke-PgTool pg_ctl.exe @('-D', $dataPath, '-l', $logPath, '-o', "-h 127.0.0.1 -p $port", '-w', 'start')
  $started = $true
  Invoke-PgTool createdb.exe @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', $database)
  Invoke-PgTool psql.exe @('-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $database, '-f', $bootstrapPath)
  foreach ($migrationPath in $migrationPaths) {
    Invoke-PgTool psql.exe @('-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $database, '-f', $migrationPath)
  }
  $matrixOutput = Invoke-PgTool psql.exe -Capture @('-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $database, '-f', $matrixPath)
  Set-Content -LiteralPath (Join-Path $outputDirectory 'db-matrix.txt') -Value $matrixOutput -Encoding UTF8
  $marker = [regex]::Match($matrixOutput, '(?m)^DEV123_RESULT=(\{.*\})\s*$')
  if (-not $marker.Success) { throw "DEV-123 matrix completed without result marker.`n$matrixOutput" }
  $result = $marker.Groups[1].Value | ConvertFrom-Json
  $result | Add-Member -NotePropertyName devId -NotePropertyValue 'DEV-123'
  $result | Add-Member -NotePropertyName sourceRevision -NotePropertyValue 'working-tree'
  $result | Add-Member -NotePropertyName environment -NotePropertyValue 'isolated-test'
  $result | Add-Member -NotePropertyName provider -NotePropertyValue 'postgresql-loopback'
  $result | Add-Member -NotePropertyName command -NotePropertyValue 'npm run verify:dev-123-meeting-task-resolution-db-isolated'
  $result | Add-Member -NotePropertyName migrations -NotePropertyValue ($migrationPaths | ForEach-Object { Split-Path -Leaf $_ })
  $result | Add-Member -NotePropertyName runtimeCleanup -NotePropertyValue 'pending'
  if (-not [bool]$result.passed) { throw 'DEV-123 isolated control-plane matrix reported a failed case.' }
  Write-Output 'DEV-123 isolated PostgreSQL control-plane core matrix passed.'
}
catch {
  $result = [ordered]@{
    devId = 'DEV-123'; sourceRevision = 'working-tree'; environment = 'isolated-test'; provider = 'postgresql-loopback'
    command = 'npm run verify:dev-123-meeting-task-resolution-db-isolated'; status = 'FAIL'; passed = $false
    reason = $_.Exception.Message; generatedAt = [DateTime]::UtcNow.ToString('o'); runtimeCleanup = 'pending'
  }
  throw
}
finally {
  if ($started) {
    & (Join-Path $postgresBin 'pg_ctl.exe') -D $dataPath -m fast -w stop | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to stop DEV-123 PostgreSQL runtime on port $port" }
  }
  $listening = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($listening) { throw "DEV-123 PostgreSQL port $port is still listening after cleanup" }
  $resolvedRuntime = [System.IO.Path]::GetFullPath($runtimeRoot)
  if (-not $resolvedRuntime.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) { throw "Refusing to remove runtime outside temp root: $resolvedRuntime" }
  $removed = $true
  if (Test-Path -LiteralPath $resolvedRuntime) { Remove-Item -LiteralPath $resolvedRuntime -Recurse -Force; $removed = -not (Test-Path -LiteralPath $resolvedRuntime) }
  if ($null -ne $result) {
    $result.runtimeCleanup = if ($removed) { "port=$port released=true path_removed=true" } else { "port=$port released=true path_removed=false" }
    if ($null -ne $result.PSObject.Properties['generatedAt']) { $result.generatedAt = [DateTime]::UtcNow.ToString('o') } else { $result | Add-Member -NotePropertyName generatedAt -NotePropertyValue ([DateTime]::UtcNow.ToString('o')) }
    $result | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $artifactPath -Encoding UTF8
  }
  Write-Output ("TEMP_RUNTIME_CLEANED port={0} released=true path_removed={1}" -f $port, $removed)
}

if ($null -eq $result -or -not [bool]$result.passed) { exit 1 }
