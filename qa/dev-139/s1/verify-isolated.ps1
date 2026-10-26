param([string]$PostgresBin = '')

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
Set-Location -LiteralPath $projectRoot
$profilePath = 'config/dev-139/s1-disposable.profile.json'
$profile = Get-Content -LiteralPath $profilePath -Raw | ConvertFrom-Json

if (-not $PostgresBin) {
  $initdbCommand = Get-Command initdb.exe -ErrorAction Stop
  $PostgresBin = Split-Path -Parent $initdbCommand.Source
}
$pgConfig = Join-Path $PostgresBin 'pg_config.exe'
$versionText = (& $pgConfig --version) -join ''
if ($versionText -notmatch 'PostgreSQL\s+(\d+)') { throw "Cannot determine PostgreSQL version: $versionText" }
$postgresMajor = [int]$Matches[1]
if ($postgresMajor -notin @($profile.database.supportedPostgresMajors)) {
  throw "DEV-139 S1 supports PostgreSQL majors $($profile.database.supportedPostgresMajors -join ', '); found $postgresMajor."
}
$evidenceLevel = 'S1_LOCAL_ACCEPTANCE'

$nonce = ([guid]::NewGuid().ToString('N')).ToLowerInvariant()
$databaseName = "dev139_s1_$nonce"
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) "projed-dev139-s1-$nonce"
$dataPath = Join-Path $tempRoot 'data'
$logPath = Join-Path $tempRoot 'postgres.log'
$pwFile = Join-Path $tempRoot 'bootstrap.pw'
$bootstrapRuntime = Join-Path $tempRoot 'bootstrap-runtime.sql'
$bindingPath = Join-Path $tempRoot 'binding.json'
$started = $false

$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = ([Net.IPEndPoint]$listener.LocalEndpoint).Port
$listener.Stop()

$adminPassword = ([guid]::NewGuid().ToString('N'))
$migratorPassword = ([guid]::NewGuid().ToString('N'))
$runtimePassword = ([guid]::NewGuid().ToString('N'))

function Invoke-PgTool([string]$Name, [string[]]$Arguments) {
  $tool = Join-Path $PostgresBin $Name
  & $tool @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Name failed with exit code $LASTEXITCODE" }
}

function Test-PortOpen([int]$TargetPort) {
  $client = [Net.Sockets.TcpClient]::new()
  try {
    $connect = $client.ConnectAsync('127.0.0.1', $TargetPort)
    if (-not $connect.Wait(500)) { return $false }
    return $client.Connected
  }
  catch { return $false }
  finally { $client.Dispose() }
}

function Get-Sha256([string]$Path) {
  $stream = [IO.File]::OpenRead((Resolve-Path -LiteralPath $Path))
  try {
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $algorithm.Dispose() }
  }
  finally { $stream.Dispose() }
}

try {
  New-Item -ItemType Directory -Path $tempRoot -ErrorAction Stop | Out-Null
  [IO.File]::WriteAllText($pwFile, $adminPassword, [Text.UTF8Encoding]::new($false))
  $bootstrapSql = [IO.File]::ReadAllText((Join-Path $projectRoot 'qa/dev-139/s1/bootstrap.sql'))
  $bootstrapSql = $bootstrapSql.Replace('__MIGRATOR_PASSWORD__', $migratorPassword).Replace('__RUNTIME_PASSWORD__', $runtimePassword)
  [IO.File]::WriteAllText($bootstrapRuntime, $bootstrapSql, [Text.UTF8Encoding]::new($false))
  Invoke-PgTool 'initdb.exe' @('-D', $dataPath, '-U', 'postgres', '--auth-local=trust', '--auth-host=scram-sha-256', '--pwfile', $pwFile, '--encoding=UTF8', '--no-locale')
  Invoke-PgTool 'pg_ctl.exe' @('-D', $dataPath, '-l', $logPath, '-o', "-h 127.0.0.1 -p $port", '-w', 'start')
  $started = $true

  $env:PGPASSWORD = $adminPassword
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', $bootstrapRuntime)
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', "CREATE DATABASE $databaseName OWNER projed_owner_disposable")
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $databaseName, '-v', 'ON_ERROR_STOP=1', '-c', "REVOKE CREATE, TEMP ON DATABASE $databaseName FROM PUBLIC")
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $databaseName, '-v', 'ON_ERROR_STOP=1', '-c', "GRANT CONNECT ON DATABASE $databaseName TO projed_migrator_disposable, projed_runtime_disposable")

  $profileHash = Get-Sha256 -Path $profilePath
  $migrationHashes = [ordered]@{}
  foreach ($path in @('db/migrations/0001_runtime_boundary_v1.sql', 'db/migrations/0002_profile_actor_v1.sql')) {
    $migrationHashes[$path] = Get-Sha256 -Path $path
  }
  $staticHash = Get-Sha256 -Path 'qa/dev-139/s1/static/index.html'
  $binding = [ordered]@{
    databaseName = $databaseName
    databasePort = $port
    runtimeRole = 'projed_runtime_disposable'
    profileSha256 = $profileHash
    migrationSha256 = $migrationHashes
    staticFixtureSha256 = $staticHash
  }
  [IO.File]::WriteAllText($bindingPath, ($binding | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))

  $encodedMigrator = [Uri]::EscapeDataString($migratorPassword)
  $encodedRuntime = [Uri]::EscapeDataString($runtimePassword)
  $env:PROJED_SOURCE_PROFILE = $profilePath
  $env:PROJED_RUNTIME_BINDING_FILE = $bindingPath
  $env:PROJED_MIGRATOR_DATABASE_URL = "postgresql://projed_migrator_disposable:${encodedMigrator}@127.0.0.1:$port/$databaseName"
  npm.cmd run migrate:dev-139:s1:disposable
  if ($LASTEXITCODE -ne 0) { throw 'DEV-139 migration failed' }
  npm.cmd run migrate:dev-139:s1:disposable
  if ($LASTEXITCODE -ne 0) { throw 'DEV-139 migration idempotency check failed' }

  $env:PGPASSWORD = $adminPassword
  $seedSql = "INSERT INTO projed_core.profiles(id,email,display_name) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','a@example.invalid','A'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','b@example.invalid','B'); INSERT INTO projed_core.account_authorization_guards(local_user_id,active,revision) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,1),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true,1);"
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $databaseName, '-v', 'ON_ERROR_STOP=1', '-c', $seedSql)

  $env:PROJED_ENV = 'disposable'
  $env:PROJED_APP_ENTRY = 'main'
  $env:PROJED_DATABASE_URL = "postgresql://projed_runtime_disposable:${encodedRuntime}@127.0.0.1:$port/$databaseName"
  $env:PORT = '0'
  npx.cmd tsx qa/dev-139/s1/verify-pg.ts
  if ($LASTEXITCODE -ne 0) { throw 'DEV-139 PostgreSQL verifier failed' }

  $attempt = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ') + "-$($nonce.Substring(0,8))"
  $evidenceDir = Join-Path $projectRoot "output/qa/dev-139/s1/$attempt"
  New-Item -ItemType Directory -Path $evidenceDir -Force | Out-Null
  [ordered]@{
    status = 'PASS'
    evidenceLevel = $evidenceLevel
    postgres = $versionText
    node = (& node --version) -join ''
    databaseName = $databaseName
    port = $port
    profileSha256 = $profileHash
    migrationSha256 = $migrationHashes
    checks = @('migration-apply', 'migration-idempotent', 'runtime-boundary', 'actor-rls', 'http-fail-closed')
  } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $evidenceDir 'result.json') -Encoding utf8
  Write-Output ("DEV139_S1_RESULT=PASS evidenceLevel={0} output={1}" -f $evidenceLevel, $evidenceDir)
}
finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:PROJED_MIGRATOR_DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:PROJED_DATABASE_URL -ErrorAction SilentlyContinue
  $cleanupSafe = -not $started
  if ($started) {
    & (Join-Path $PostgresBin 'pg_ctl.exe') -D $dataPath -m fast -w stop | Out-Null
    $cleanupSafe = $LASTEXITCODE -eq 0 -and -not (Test-PortOpen -TargetPort $port)
  }
  Remove-Item -LiteralPath $pwFile -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $bootstrapRuntime -Force -ErrorAction SilentlyContinue
  $resolvedTempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  $resolvedTarget = [IO.Path]::GetFullPath($tempRoot)
  if ($cleanupSafe -and $resolvedTarget.StartsWith($resolvedTempBase, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $resolvedTarget) -like 'projed-dev139-s1-*') {
    Remove-Item -LiteralPath $resolvedTarget -Recurse -Force -ErrorAction SilentlyContinue
  } elseif (-not $cleanupSafe) {
    throw "DEV-139 cleanup blocked: task PostgreSQL or port $port is still active; preserved $resolvedTarget"
  } else {
    throw "DEV-139 cleanup refused unexpected temp path: $resolvedTarget"
  }
}
