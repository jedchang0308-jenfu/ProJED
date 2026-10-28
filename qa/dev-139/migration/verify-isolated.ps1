param([string]$PostgresBin = '')

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
Set-Location -LiteralPath $projectRoot
$profilePath = 'config/dev-139/s3-read-disposable.profile.json'
$profile = Get-Content -LiteralPath $profilePath -Raw | ConvertFrom-Json

$systemDrive = Get-PSDrive -Name ([IO.Path]::GetPathRoot($env:TEMP).TrimEnd('\').TrimEnd(':')) -ErrorAction Stop
if ($systemDrive.Free -lt 512MB) { throw 'DEV-139 migration rehearsal requires at least 512 MiB free on the temp drive.' }

if (-not $PostgresBin) {
  $initdbCommand = Get-Command initdb.exe -ErrorAction Stop
  $PostgresBin = Split-Path -Parent $initdbCommand.Source
}
$pgConfig = Join-Path $PostgresBin 'pg_config.exe'
$versionText = (& $pgConfig --version) -join ''
if ($versionText -notmatch 'PostgreSQL\s+(\d+)') { throw "Cannot determine PostgreSQL version: $versionText" }
$postgresMajor = [int]$Matches[1]
if ($postgresMajor -notin @($profile.database.supportedPostgresMajors)) {
  throw "DEV-139 migration rehearsal supports PostgreSQL majors $($profile.database.supportedPostgresMajors -join ', '); found $postgresMajor."
}

$nonce = ([guid]::NewGuid().ToString('N')).ToLowerInvariant()
$targetDatabase = "dev139_s3_$nonce"
$sourceDatabase = "dev139_source_$nonce"
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) "projed-dev139-migration-$nonce"
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

function Invoke-PgScalar([string]$Database, [string]$Sql) {
  $tool = Join-Path $PostgresBin 'psql.exe'
  $output = (& $tool -h 127.0.0.1 -p $port -U postgres -d $Database -v ON_ERROR_STOP=1 -Atc $Sql 2>&1) -join ''
  if ($LASTEXITCODE -ne 0) { throw "psql scalar failed with exit code $LASTEXITCODE" }
  return $output.Trim()
}

function Invoke-DataMode([string]$Mode, [int[]]$ExpectedExitCodes) {
  $previousErrorAction = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $lines = @(& npx.cmd tsx scripts/dev139-data-migration.ts $Mode 2>&1)
    $exitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousErrorAction
  }
  if ($exitCode -notin $ExpectedExitCodes) {
    throw "DEV-139 data $Mode returned $exitCode; expected $($ExpectedExitCodes -join ', '). Output: $($lines -join ' ')"
  }
  $jsonLine = $lines | Where-Object { $_.ToString().Trim().StartsWith('{') } | Select-Object -Last 1
  if (-not $jsonLine) { throw "DEV-139 data $Mode did not return a JSON result." }
  return ($jsonLine.ToString() | ConvertFrom-Json)
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
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', "CREATE DATABASE $targetDatabase OWNER projed_owner_disposable")
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', "CREATE DATABASE $sourceDatabase OWNER postgres")
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $targetDatabase, '-v', 'ON_ERROR_STOP=1', '-c', "REVOKE CREATE, TEMP ON DATABASE $targetDatabase FROM PUBLIC")
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $targetDatabase, '-v', 'ON_ERROR_STOP=1', '-c', "GRANT CONNECT ON DATABASE $targetDatabase TO projed_migrator_disposable, projed_importer_disposable, projed_runtime_disposable")

  $profileHash = Get-Sha256 -Path $profilePath
  $migrationHashes = [ordered]@{}
  foreach ($migration in @($profile.migrations)) {
    $migrationHashes[$migration.path] = Get-Sha256 -Path $migration.path
  }
  $binding = [ordered]@{
    databaseName = $targetDatabase
    databasePort = $port
    runtimeRole = 'projed_runtime_disposable'
    profileSha256 = $profileHash
    migrationSha256 = $migrationHashes
    staticFixtureSha256 = Get-Sha256 -Path 'qa/dev-139/s1/static/index.html'
  }
  [IO.File]::WriteAllText($bindingPath, ($binding | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))

  $encodedAdmin = [Uri]::EscapeDataString($adminPassword)
  $encodedMigrator = [Uri]::EscapeDataString($migratorPassword)
  $encodedImporter = [Uri]::EscapeDataString($importerPassword)
  $env:PROJED_SOURCE_PROFILE = $profilePath
  $env:PROJED_RUNTIME_BINDING_FILE = $bindingPath
  $env:PROJED_MIGRATOR_DATABASE_URL = "postgresql://projed_migrator_disposable:${encodedMigrator}@127.0.0.1:$port/$targetDatabase"
  npm.cmd run migrate:dev-139:s3:disposable
  if ($LASTEXITCODE -ne 0) { throw 'DEV-139 target schema migration failed.' }
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-f', 'qa/dev-139/migration/source-fixture.sql')

  $env:PROJED_MIGRATION_SOURCE_DATABASE_URL = "postgresql://postgres:${encodedAdmin}@127.0.0.1:$port/$sourceDatabase"
  $env:PROJED_MIGRATION_TARGET_DATABASE_URL = "postgresql://projed_importer_disposable:${encodedImporter}@127.0.0.1:$port/$targetDatabase"

  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', 'ALTER ROLE projed_importer_disposable CREATEDB')
  $createDatabaseRole = Invoke-DataMode -Mode 'plan' -ExpectedExitCodes @(1)
  if ($createDatabaseRole.status -ne 'FAIL' -or $createDatabaseRole.code -ne 'IMPORTER_IDENTITY_INVALID') {
    throw 'DEV-139 importer CREATEDB capability was not rejected.'
  }
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', 'ALTER ROLE projed_importer_disposable NOCREATEDB CREATEROLE')
  $createRole = Invoke-DataMode -Mode 'plan' -ExpectedExitCodes @(1)
  if ($createRole.status -ne 'FAIL' -or $createRole.code -ne 'IMPORTER_IDENTITY_INVALID') {
    throw 'DEV-139 importer CREATEROLE capability was not rejected.'
  }
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', 'ALTER ROLE projed_importer_disposable NOCREATEROLE; GRANT projed_owner_disposable TO projed_importer_disposable')
  $ownerMembership = Invoke-DataMode -Mode 'plan' -ExpectedExitCodes @(1)
  if ($ownerMembership.status -ne 'FAIL' -or $ownerMembership.code -ne 'IMPORTER_IDENTITY_INVALID') {
    throw 'DEV-139 importer owner-role membership was not rejected.'
  }
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', 'REVOKE projed_owner_disposable FROM projed_importer_disposable')

  $plan = Invoke-DataMode -Mode 'plan' -ExpectedExitCodes @(0)
  if ($plan.status -ne 'PASS' -or $plan.matches -ne $false -or $plan.tables.profiles.count -ne 2) {
    throw 'DEV-139 migration plan result was not the expected empty-target plan.'
  }

  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', 'CREATE TABLE public.dev139_unknown_empty_source (id uuid)')
  $unknownEmptyPlan = Invoke-DataMode -Mode 'plan' -ExpectedExitCodes @(2)
  $unknownEmptyDomain = 'UNKNOWN_SOURCE_RELATION "public"."dev139_unknown_empty_source"'
  $unknownEmptyBlocker = @($unknownEmptyPlan.blockers | Where-Object { $_.domain -eq $unknownEmptyDomain }) | Select-Object -First 1
  if ($unknownEmptyPlan.status -ne 'BLOCKED' -or -not $unknownEmptyBlocker -or $unknownEmptyBlocker.count -ne 0) {
    throw 'DEV-139 empty unknown app table was not reported as a zero-row source blocker.'
  }
  $unknownEmptyApply = Invoke-DataMode -Mode 'apply' -ExpectedExitCodes @(2)
  if ($unknownEmptyApply.status -ne 'BLOCKED' -or -not (@($unknownEmptyApply.blockers.domain) -contains $unknownEmptyDomain)) {
    throw 'DEV-139 apply did not stop at the read-only source catalog preflight for an empty unknown app table.'
  }
  $unknownEmptyTargetCount = Invoke-PgScalar -Database $targetDatabase -Sql 'SELECT (SELECT count(*) FROM projed_core.profiles) + (SELECT count(*) FROM projed_core.tenants)'
  if ($unknownEmptyTargetCount -ne '0') { throw 'DEV-139 unknown source relation preflight wrote target rows.' }
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', 'DROP TABLE public.dev139_unknown_empty_source')

  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', 'CREATE VIEW public.dev139_non_authority_view AS SELECT 1::integer AS id')
  $viewPlan = Invoke-DataMode -Mode 'plan' -ExpectedExitCodes @(0)
  if ($viewPlan.status -ne 'PASS') { throw 'DEV-139 plain derived view incorrectly blocked the source catalog plan.' }
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', 'DROP VIEW public.dev139_non_authority_view')

  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', 'CREATE TABLE public.dev139_unknown_partitioned_source (id integer) PARTITION BY RANGE (id); CREATE TABLE public.dev139_unknown_partitioned_source_0 PARTITION OF public.dev139_unknown_partitioned_source FOR VALUES FROM (0) TO (10); INSERT INTO public.dev139_unknown_partitioned_source VALUES (1)')
  $unknownPartitionPlan = Invoke-DataMode -Mode 'plan' -ExpectedExitCodes @(2)
  $unknownPartitionDomain = 'UNKNOWN_SOURCE_RELATION "public"."dev139_unknown_partitioned_source"'
  $unknownPartitionBlocker = @($unknownPartitionPlan.blockers | Where-Object { $_.domain -eq $unknownPartitionDomain }) | Select-Object -First 1
  $unknownPartitionChildDomain = 'UNKNOWN_SOURCE_RELATION "public"."dev139_unknown_partitioned_source_0"'
  if ($unknownPartitionPlan.status -ne 'BLOCKED' -or -not $unknownPartitionBlocker -or
      $unknownPartitionBlocker.count -ne 1 -or
      @($unknownPartitionPlan.blockers.domain) -contains $unknownPartitionChildDomain) {
    throw 'DEV-139 unknown partitioned source relation was missed or its child was counted as a separate authority.'
  }
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', 'DROP TABLE public.dev139_unknown_partitioned_source CASCADE')

  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', 'CREATE TABLE public.dev139_inherited_profiles (extra_data text) INHERITS (public.profiles)')
  $unknownInheritedPlan = Invoke-DataMode -Mode 'plan' -ExpectedExitCodes @(2)
  $unknownInheritedDomain = 'UNKNOWN_SOURCE_RELATION "public"."dev139_inherited_profiles"'
  $unknownInheritedBlocker = @($unknownInheritedPlan.blockers | Where-Object { $_.domain -eq $unknownInheritedDomain }) | Select-Object -First 1
  if ($unknownInheritedPlan.status -ne 'BLOCKED' -or -not $unknownInheritedBlocker -or $unknownInheritedBlocker.count -ne 0) {
    throw 'DEV-139 ordinary INHERITS child of a classified source table was not independently classified.'
  }
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', 'DROP TABLE public.dev139_inherited_profiles')

  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', 'CREATE MATERIALIZED VIEW public.dev139_unknown_materialized_source AS SELECT 1::integer AS id')
  $unknownMaterializedPlan = Invoke-DataMode -Mode 'plan' -ExpectedExitCodes @(2)
  if ($unknownMaterializedPlan.status -ne 'BLOCKED' -or
      'UNKNOWN_SOURCE_RELATION "public"."dev139_unknown_materialized_source"' -notin @($unknownMaterializedPlan.blockers.domain)) {
    throw 'DEV-139 unknown materialized view was not treated as stored source data.'
  }
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', 'DROP MATERIALIZED VIEW public.dev139_unknown_materialized_source')

  $plpgsqlInstalled = Invoke-PgScalar -Database $sourceDatabase -Sql "SELECT count(*) FROM pg_catalog.pg_extension WHERE extname = 'plpgsql'"
  if ($plpgsqlInstalled -ne '1') { throw 'DEV-139 extension-owned relation fixture requires the built-in plpgsql extension.' }
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', 'CREATE TABLE public.dev139_extension_owned_source (id integer)')
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', 'ALTER EXTENSION plpgsql ADD TABLE public.dev139_extension_owned_source')
  $extensionOwnedPlan = Invoke-DataMode -Mode 'plan' -ExpectedExitCodes @(0)
  if ($extensionOwnedPlan.status -ne 'PASS') { throw 'DEV-139 extension-owned source relation was incorrectly reported as an unknown app table.' }
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', 'ALTER EXTENSION plpgsql DROP TABLE public.dev139_extension_owned_source')
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', 'DROP TABLE public.dev139_extension_owned_source')

  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', "UPDATE public.task_tags SET color = 'invalid-color'")
  $rollback = Invoke-DataMode -Mode 'apply' -ExpectedExitCodes @(1)
  if ($rollback.status -ne 'FAIL') { throw 'DEV-139 injected apply failure was not rejected.' }
  $rollbackCount = Invoke-PgScalar -Database $targetDatabase -Sql 'SELECT (SELECT count(*) FROM projed_core.profiles) + (SELECT count(*) FROM projed_core.tenants)'
  if ($rollbackCount -ne '0') { throw 'DEV-139 failed import left partial target rows.' }
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', "UPDATE public.task_tags SET color = 'red'")

  $apply = Invoke-DataMode -Mode 'apply' -ExpectedExitCodes @(0)
  if ($apply.status -ne 'PASS' -or $apply.matches -ne $true) { throw 'DEV-139 migration apply did not reconcile before commit.' }
  $reconcile = Invoke-DataMode -Mode 'reconcile' -ExpectedExitCodes @(0)
  if ($reconcile.status -ne 'PASS' -or $reconcile.matches -ne $true -or $reconcile.snapshotId -ne $apply.snapshotId) {
    throw 'DEV-139 post-commit reconciliation failed.'
  }

  $secondApply = Invoke-DataMode -Mode 'apply' -ExpectedExitCodes @(2)
  if ($secondApply.status -ne 'BLOCKED' -or 'target:not_empty' -notin @($secondApply.blockers.domain)) {
    throw 'DEV-139 second apply did not fail closed on a non-empty target.'
  }

  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', "INSERT INTO public.inbox_items VALUES ('01234567-1234-4234-8234-123456789010')")
  $unsupported = Invoke-DataMode -Mode 'plan' -ExpectedExitCodes @(2)
  if ($unsupported.status -ne 'BLOCKED' -or 'public.inbox_items' -notin @($unsupported.blockers.domain)) {
    throw 'DEV-139 unsupported source domain was not reported as a blocker.'
  }
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', 'DELETE FROM public.inbox_items')

  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', "INSERT INTO public.llm_access_logs VALUES ('01234567-1234-4234-8234-123456789011', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', 'fixture', NULL, NULL, ARRAY[]::uuid[], '{}', '2026-01-02T00:00:00Z')")
  $llmLogs = Invoke-DataMode -Mode 'plan' -ExpectedExitCodes @(2)
  if ($llmLogs.status -ne 'BLOCKED' -or 'public.llm_access_logs' -notin @($llmLogs.blockers.domain)) {
    throw 'DEV-139 LLM access logs were not reported as an unsupported source domain.'
  }
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', 'DELETE FROM public.llm_access_logs')

  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', "INSERT INTO private.quick_task_oauth_clients VALUES ('quick-client', true, '2026-01-02T00:00:00Z')")
  $quickOauthClients = Invoke-DataMode -Mode 'plan' -ExpectedExitCodes @(2)
  if ($quickOauthClients.status -ne 'BLOCKED' -or 'private.quick_task_oauth_clients' -notin @($quickOauthClients.blockers.domain)) {
    throw 'DEV-139 quick-task OAuth clients were not reported as an unsupported source domain.'
  }
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', 'DELETE FROM private.quick_task_oauth_clients')

  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $targetDatabase, '-v', 'ON_ERROR_STOP=1', '-c', "UPDATE projed_core.profiles SET display_name = 'Drifted' WHERE id = '11111111-1111-4111-8111-111111111111'")
  $drift = Invoke-DataMode -Mode 'reconcile' -ExpectedExitCodes @(1)
  if ($drift.status -ne 'FAIL' -or $drift.code -ne 'RECONCILIATION_MISMATCH') {
    throw 'DEV-139 target drift was not rejected by reconciliation.'
  }
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $targetDatabase, '-v', 'ON_ERROR_STOP=1', '-c', "UPDATE projed_core.profiles SET display_name = 'Owner' WHERE id = '11111111-1111-4111-8111-111111111111'")
  $finalReconcile = Invoke-DataMode -Mode 'reconcile' -ExpectedExitCodes @(0)
  if ($finalReconcile.status -ne 'PASS' -or $finalReconcile.matches -ne $true) {
    throw 'DEV-139 reconciliation did not recover after the isolated drift was restored.'
  }

  $boundary = Invoke-PgScalar -Database $targetDatabase -Sql "SELECT (SELECT count(*) FROM projed_core.account_authorization_guards) || ':' || has_table_privilege('projed_importer_disposable', 'projed_core.profiles', 'SELECT') || ':' || has_table_privilege('projed_importer_disposable', 'projed_core.profiles', 'INSERT') || ':' || has_table_privilege('projed_importer_disposable', 'projed_core.profiles', 'UPDATE') || ':' || has_table_privilege('projed_importer_disposable', 'projed_core.profiles', 'DELETE')"
  if ($boundary -ne '0:true:true:false:false') { throw "DEV-139 importer or identity-guard boundary mismatch: $boundary" }

  $attempt = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ') + "-$($nonce.Substring(0,8))"
  $evidenceDir = Join-Path $projectRoot "output/qa/dev-139/migration/$attempt"
  New-Item -ItemType Directory -Path $evidenceDir -Force | Out-Null
  [ordered]@{
    status = 'PASS'
    evidenceLevel = 'DEV139_LOCAL_SNAPSHOT_MIGRATION_REHEARSAL'
    postgres = $versionText
    node = (& node --version) -join ''
    sourceDatabase = $sourceDatabase
    targetDatabase = $targetDatabase
    profileSha256 = $profileHash
    migrationSha256 = $migrationHashes
    snapshotId = $finalReconcile.snapshotId
    tables = $finalReconcile.tables
    checks = @(
      'empty-target-plan', 'single-transaction-rollback', 'full-snapshot-apply',
      'unknown-empty-relation-block', 'unknown-partitioned-relation-block',
      'ordinary-inheritance-child-block', 'plain-view-non-authority-skip',
      'materialized-view-source-block', 'extension-owned-relation-skip',
      'exact-digest-reconcile', 'non-empty-target-reject', 'unsupported-domain-reject',
      'importer-createdb-reject', 'importer-createrole-reject', 'importer-owner-membership-reject',
      'llm-access-log-reject', 'quick-oauth-client-reject',
      'target-drift-detect', 'identity-guards-not-imported', 'importer-select-insert-only'
    )
  } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $evidenceDir 'result.json') -Encoding utf8
  Write-Output ("DEV139_MIGRATION_RESULT=PASS evidenceLevel=DEV139_LOCAL_SNAPSHOT_MIGRATION_REHEARSAL output={0}" -f $evidenceDir)
}
finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:PROJED_MIGRATOR_DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:PROJED_MIGRATION_SOURCE_DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:PROJED_MIGRATION_TARGET_DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:PROJED_SOURCE_PROFILE -ErrorAction SilentlyContinue
  Remove-Item Env:PROJED_RUNTIME_BINDING_FILE -ErrorAction SilentlyContinue
  $cleanupSafe = -not $started
  if ($started) {
    & (Join-Path $PostgresBin 'pg_ctl.exe') -D $dataPath -m fast -w stop | Out-Null
    $cleanupSafe = $LASTEXITCODE -eq 0 -and -not (Test-PortOpen -TargetPort $port)
  }
  Remove-Item -LiteralPath $pwFile -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $bootstrapRuntime -Force -ErrorAction SilentlyContinue
  $resolvedTempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  $resolvedTarget = [IO.Path]::GetFullPath($tempRoot)
  if ($cleanupSafe -and $resolvedTarget.StartsWith($resolvedTempBase, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $resolvedTarget) -like 'projed-dev139-migration-*') {
    Remove-Item -LiteralPath $resolvedTarget -Recurse -Force -ErrorAction SilentlyContinue
  } elseif (-not $cleanupSafe) {
    throw "DEV-139 migration cleanup blocked: task PostgreSQL or port $port is still active; preserved $resolvedTarget"
  } else {
    throw "DEV-139 migration cleanup refused unexpected temp path: $resolvedTarget"
  }
}
