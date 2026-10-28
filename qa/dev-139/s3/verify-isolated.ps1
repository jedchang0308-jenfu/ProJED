param([string]$PostgresBin = '', [switch]$DatabaseOnly)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
Set-Location -LiteralPath $projectRoot
$profilePath = 'config/dev-139/s3-read-disposable.profile.json'
$profile = Get-Content -LiteralPath $profilePath -Raw | ConvertFrom-Json

$systemDrive = Get-PSDrive -Name ([IO.Path]::GetPathRoot($env:TEMP).TrimEnd('\').TrimEnd(':')) -ErrorAction Stop
if ($systemDrive.Free -lt 512MB) { throw 'DEV-139 S3 requires at least 512 MiB free on the temp drive.' }

if (-not $PostgresBin) {
  $initdbCommand = Get-Command initdb.exe -ErrorAction Stop
  $PostgresBin = Split-Path -Parent $initdbCommand.Source
}
$pgConfig = Join-Path $PostgresBin 'pg_config.exe'
$versionText = (& $pgConfig --version) -join ''
if ($versionText -notmatch 'PostgreSQL\s+(\d+)') { throw "Cannot determine PostgreSQL version: $versionText" }
$postgresMajor = [int]$Matches[1]
if ($postgresMajor -notin @($profile.database.supportedPostgresMajors)) {
  throw "DEV-139 S3 supports PostgreSQL majors $($profile.database.supportedPostgresMajors -join ', '); found $postgresMajor."
}

$nonce = ([guid]::NewGuid().ToString('N')).ToLowerInvariant()
$databaseName = "dev139_s3_$nonce"
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) "projed-dev139-s3-$nonce"
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
$importerPassword = ([guid]::NewGuid().ToString('N'))
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
  $bootstrapSql = $bootstrapSql.Replace('__MIGRATOR_PASSWORD__', $migratorPassword).Replace('__IMPORTER_PASSWORD__', $importerPassword).Replace('__RUNTIME_PASSWORD__', $runtimePassword)
  [IO.File]::WriteAllText($bootstrapRuntime, $bootstrapSql, [Text.UTF8Encoding]::new($false))
  Invoke-PgTool 'initdb.exe' @('-D', $dataPath, '-U', 'postgres', '--auth-local=trust', '--auth-host=scram-sha-256', '--pwfile', $pwFile, '--encoding=UTF8', '--no-locale')
  Invoke-PgTool 'pg_ctl.exe' @('-D', $dataPath, '-l', $logPath, '-o', "-h 127.0.0.1 -p $port", '-w', 'start')
  $started = $true

  $env:PGPASSWORD = $adminPassword
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', $bootstrapRuntime)
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', "CREATE DATABASE $databaseName OWNER projed_owner_disposable")
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $databaseName, '-v', 'ON_ERROR_STOP=1', '-c', "REVOKE CREATE, TEMP ON DATABASE $databaseName FROM PUBLIC")
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $databaseName, '-v', 'ON_ERROR_STOP=1', '-c', "GRANT CONNECT ON DATABASE $databaseName TO projed_migrator_disposable, projed_importer_disposable, projed_runtime_disposable")

  $profileHash = Get-Sha256 -Path $profilePath
  $migrationHashes = [ordered]@{}
  foreach ($migration in @($profile.migrations)) {
    $migrationHashes[$migration.path] = Get-Sha256 -Path $migration.path
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

  if (-not $DatabaseOnly) {
    $env:PROJED_RELEASE_ID = "dev139-local-ui-$($nonce.Substring(0,8))"
    npm.cmd run build:dev-139:cloud-run
    if ($LASTEXITCODE -ne 0) { throw 'DEV-139 HTTP frontend candidate build failed' }
  }

  $encodedMigrator = [Uri]::EscapeDataString($migratorPassword)
  $encodedRuntime = [Uri]::EscapeDataString($runtimePassword)
  $env:PROJED_SOURCE_PROFILE = $profilePath
  $env:PROJED_RUNTIME_BINDING_FILE = $bindingPath
  $env:PROJED_MIGRATOR_DATABASE_URL = "postgresql://projed_migrator_disposable:${encodedMigrator}@127.0.0.1:$port/$databaseName"
  npm.cmd run migrate:dev-139:s3:disposable
  if ($LASTEXITCODE -ne 0) { throw 'DEV-139 S3 migration failed' }
  npm.cmd run migrate:dev-139:s3:disposable
  if ($LASTEXITCODE -ne 0) { throw 'DEV-139 S3 migration idempotency check failed' }

  $env:PGPASSWORD = $adminPassword
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $databaseName, '-v', 'ON_ERROR_STOP=1', '-f', 'qa/dev-139/s3/seed.sql')

  $env:PROJED_ENV = 'disposable'
  $env:PROJED_APP_ENTRY = 'main'
  $env:PROJED_DATABASE_URL = "postgresql://projed_runtime_disposable:${encodedRuntime}@127.0.0.1:$port/$databaseName"
  $env:PROJED_DEV139_BROWSER_SMOKE = if ($DatabaseOnly) { '0' } else { '1' }
  $env:PORT = '0'
  $verifierLines = @(& npx.cmd tsx qa/dev-139/s3/verify-pg.ts)
  $verifierExitCode = $LASTEXITCODE
  $verifierLines | ForEach-Object { Write-Output $_ }
  if ($verifierExitCode -ne 0) { throw 'DEV-139 S3 PostgreSQL verifier failed' }
  # The verifier owns its executed checks. Do not maintain a second case list
  # here: new product regressions otherwise disappear from the saved receipt.
  $verifierResult = $verifierLines[-1] | ConvertFrom-Json
  if ($verifierResult.status -cne 'PASS' -or $verifierResult.checks -isnot [array] -or
      @($verifierResult.checks).Count -eq 0) {
    throw 'DEV-139 S3 PostgreSQL verifier result is invalid'
  }

  $attempt = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ') + "-$($nonce.Substring(0,8))"
  $evidenceDir = Join-Path $projectRoot "output/qa/dev-139/s3/$attempt"
  New-Item -ItemType Directory -Path $evidenceDir -Force | Out-Null
  [ordered]@{
    status = 'PASS'
    evidenceLevel = if ($DatabaseOnly) { 'S3_DOMAIN_HTTP_DB_LOCAL_ACCEPTANCE' } else { 'S3_DOMAIN_CORE_LOCAL_ACCEPTANCE' }
    browserSmoke = if ($DatabaseOnly) { 'NOT_RUN' } else { 'PASS' }
    postgres = $versionText
    node = (& node --version) -join ''
    databaseName = $databaseName
    port = $port
    profileSha256 = $profileHash
    migrationSha256 = $migrationHashes
    checks = @('migration-apply', 'migration-idempotent') + @($verifierResult.checks)
  } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $evidenceDir 'result.json') -Encoding utf8
  Write-Output ("DEV139_S3_RESULT=PASS databaseOnly={0} output={1}" -f [bool]$DatabaseOnly, $evidenceDir)
}
finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:PROJED_MIGRATOR_DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:PROJED_DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:PROJED_DEV139_BROWSER_SMOKE -ErrorAction SilentlyContinue
  Remove-Item Env:PROJED_RELEASE_ID -ErrorAction SilentlyContinue
  $cleanupSafe = -not $started
  if ($started) {
    & (Join-Path $PostgresBin 'pg_ctl.exe') -D $dataPath -m fast -w stop | Out-Null
    $cleanupSafe = $LASTEXITCODE -eq 0 -and -not (Test-PortOpen -TargetPort $port)
  }
  Remove-Item -LiteralPath $pwFile -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $bootstrapRuntime -Force -ErrorAction SilentlyContinue
  $resolvedTempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  $resolvedTarget = [IO.Path]::GetFullPath($tempRoot)
  if ($cleanupSafe -and $resolvedTarget.StartsWith($resolvedTempBase, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $resolvedTarget) -like 'projed-dev139-s3-*') {
    Remove-Item -LiteralPath $resolvedTarget -Recurse -Force -ErrorAction SilentlyContinue
  } elseif (-not $cleanupSafe) {
    throw "DEV-139 S3 cleanup blocked: task PostgreSQL or port $port is still active; preserved $resolvedTarget"
  } else {
    throw "DEV-139 S3 cleanup refused unexpected temp path: $resolvedTarget"
  }
}
