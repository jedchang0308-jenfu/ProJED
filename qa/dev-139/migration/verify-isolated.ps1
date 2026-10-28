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
$retentionFailures = @()

$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = ([Net.IPEndPoint]$listener.LocalEndpoint).Port
$listener.Stop()

$adminPassword = ([guid]::NewGuid().ToString('N'))
$migratorPassword = ([guid]::NewGuid().ToString('N'))
$importerPassword = ([guid]::NewGuid().ToString('N'))
$runtimePassword = ([guid]::NewGuid().ToString('N'))
$readerPassword = ([guid]::NewGuid().ToString('N'))

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

function Assert-RagPreflightBlocked([string]$MutationSql, [string]$RestoreSql, [string]$ExpectedDomainPrefix) {
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', $MutationSql)
  try {
    $result = Invoke-DataMode -Mode 'apply' -ExpectedExitCodes @(2)
    $matchingDomains = @($result.blockers.domain | Where-Object { $_.StartsWith($ExpectedDomainPrefix, [System.StringComparison]::Ordinal) })
    if ($result.status -ne 'BLOCKED' -or $matchingDomains.Count -eq 0) {
      throw "DEV-139 invalid RAG source state was not blocked: $ExpectedDomainPrefix"
    }
    $targetCount = Invoke-PgScalar -Database $targetDatabase -Sql 'SELECT (SELECT count(*) FROM projed_core.profiles) + (SELECT count(*) FROM projed_core.google_identity_proofs) + (SELECT count(*) FROM projed_core.account_authorization_guards) + (SELECT count(*) FROM projed_core.documents) + (SELECT count(*) FROM projed_core.knowledge_records) + (SELECT count(*) FROM projed_core.rag_sync_jobs)'
    if ($targetCount -ne '0') { throw 'DEV-139 invalid RAG source preflight wrote target rows.' }
  }
  finally {
    Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', $RestoreSql)
  }
}

function Assert-RagDisabledLegacyMirrorAllowed() {
  $mutationSql = @'
UPDATE public.knowledge_records
   SET rag_enabled = false
 WHERE id = '23456789-1234-4234-8234-123456789002';
UPDATE public.documents
   SET rag_enabled = false, visibility = 'private'
 WHERE id = 'd0000000-0000-4000-8000-000000000004';
'@
  try {
    Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', $mutationSql)
    $result = Invoke-DataMode -Mode 'plan' -ExpectedExitCodes @(0)
    if ($result.status -ne 'PASS') {
      throw 'DEV-139 disabled legacy mirror with stale visibility was incorrectly blocked.'
    }
  }
  finally {
    $restoreSql = @'
UPDATE public.knowledge_records
   SET rag_enabled = true
 WHERE id = '23456789-1234-4234-8234-123456789002';
UPDATE public.documents
   SET rag_enabled = true, visibility = 'project'
 WHERE id = 'd0000000-0000-4000-8000-000000000004';
'@
    Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', $restoreSql)
  }
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
  # The actual Supabase source uses 0; force distinct lossy defaults on both
  # disposable DBs so the driver must pin precise float text output itself.
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', "ALTER DATABASE $sourceDatabase SET extra_float_digits = 0")
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', "ALTER DATABASE $targetDatabase SET extra_float_digits = -1")
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
  $encodedRuntime = [Uri]::EscapeDataString($runtimePassword)
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

  # Keep one synthetic, fully linked published RAG record in the positive source
  # snapshot. Its mirror/latest version share the exact current source hash.
  $ragSourceSetupSql = @'
UPDATE public.knowledge_records
   SET rag_enabled = true
 WHERE id = '23456789-1234-4234-8234-123456789002';
UPDATE public.documents
   SET rag_enabled = true,
       content_hash = 'fixture-hash-mirror-v1',
       metadata = jsonb_build_object('kind','mirror','source_rag_enabled',true)
 WHERE id = 'd0000000-0000-4000-8000-000000000004';
UPDATE public.document_versions
   SET content_hash = 'fixture-hash-mirror-v1'
 WHERE id = 'd1000000-0000-4000-8000-000000000005';
'@
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', $ragSourceSetupSql)
  $sourceRagEligible = Invoke-PgScalar -Database $sourceDatabase -Sql "SELECT count(*) FROM public.knowledge_records record JOIN public.documents document ON document.id = record.source_document_id AND document.tenant_id = record.tenant_id AND document.project_id = record.project_id AND document.source_table = 'knowledge_records' AND document.source_id = record.id AND document.source_type = 'meeting_note' AND document.visibility = record.visibility AND document.rag_enabled = record.rag_enabled JOIN public.document_versions version ON version.tenant_id = document.tenant_id AND version.document_id = document.id AND version.content_hash = document.content_hash JOIN public.document_chunks chunk ON chunk.tenant_id = document.tenant_id AND chunk.document_id = document.id AND chunk.document_version_id = version.id WHERE record.id = '23456789-1234-4234-8234-123456789002' AND record.status = 'published' AND record.visibility <> 'private' AND record.rag_enabled AND document.rag_enabled AND version.id = (SELECT latest.id FROM public.document_versions latest WHERE latest.tenant_id = document.tenant_id AND latest.document_id = document.id ORDER BY latest.version DESC LIMIT 1)"
  if ($sourceRagEligible -ne '1') { throw 'DEV-139 valid published RAG source fixture was not fully linked.' }

  Assert-RagDisabledLegacyMirrorAllowed

  $plan = Invoke-DataMode -Mode 'plan' -ExpectedExitCodes @(0)
  if ($plan.status -ne 'PASS' -or $plan.matches -ne $false -or $plan.tables.profiles.count -ne 2 -or
      $plan.tables.google_identity_proofs.count -ne 1 -or $plan.tables.llm_access_logs.count -ne 5 -or
      $plan.tables.documents.count -ne 4 -or $plan.tables.knowledge_records.count -ne 1) {
    throw 'DEV-139 migration plan did not accept the valid linked published RAG source.'
  }

  foreach ($sourceDomain in @('documents', 'document_versions', 'document_chunks', 'document_embeddings', 'rag_sync_jobs', 'external_rag_objects')) {
    $condition = if ($sourceDomain -eq 'documents') { 'WHERE project_id IS NOT NULL' } elseif ($sourceDomain -eq 'rag_sync_jobs') { 'WHERE source_document_id IS NOT NULL' } else { '' }
    $scopeRowId = Invoke-PgScalar -Database $sourceDatabase -Sql "SELECT id::text FROM public.$sourceDomain $condition ORDER BY id LIMIT 1"
    if (-not $scopeRowId) { throw "DEV-139 document scope fixture missing: $sourceDomain" }
    $scopeTenant = Invoke-PgScalar -Database $sourceDatabase -Sql "SELECT tenant_id::text FROM public.$sourceDomain WHERE id = '$scopeRowId'::uuid"
    Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', "UPDATE public.$sourceDomain SET tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9' WHERE id = '$scopeRowId'::uuid")
    $scopeMismatch = Invoke-DataMode -Mode 'apply' -ExpectedExitCodes @(2)
    if ($scopeMismatch.status -ne 'BLOCKED' -or -not (@($scopeMismatch.blockers.domain) -like "public.$sourceDomain WHERE*")) {
      throw "DEV-139 source document scope mismatch was not blocked: $sourceDomain"
    }
    $scopeTargetCount = Invoke-PgScalar -Database $targetDatabase -Sql 'SELECT (SELECT count(*) FROM projed_core.profiles) + (SELECT count(*) FROM projed_core.google_identity_proofs) + (SELECT count(*) FROM projed_core.account_authorization_guards) + (SELECT count(*) FROM projed_core.documents)'
    if ($scopeTargetCount -ne '0') { throw 'DEV-139 document scope preflight wrote target rows.' }
    Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', "UPDATE public.$sourceDomain SET tenant_id = '$scopeTenant'::uuid WHERE id = '$scopeRowId'::uuid")
  }
  Assert-RagPreflightBlocked `
    -MutationSql "UPDATE public.knowledge_records SET status = 'draft' WHERE id = '23456789-1234-4234-8234-123456789002'" `
    -RestoreSql "UPDATE public.knowledge_records SET status = 'published' WHERE id = '23456789-1234-4234-8234-123456789002'" `
    -ExpectedDomainPrefix 'public.knowledge_records WHERE rag_enabled AND'
  Assert-RagPreflightBlocked `
    -MutationSql "UPDATE public.knowledge_records SET visibility = 'private' WHERE id = '23456789-1234-4234-8234-123456789002'" `
    -RestoreSql "UPDATE public.knowledge_records SET visibility = 'project' WHERE id = '23456789-1234-4234-8234-123456789002'" `
    -ExpectedDomainPrefix 'public.knowledge_records WHERE rag_enabled AND'
  Assert-RagPreflightBlocked `
    -MutationSql "UPDATE public.knowledge_records SET source_document_id = NULL WHERE id = '23456789-1234-4234-8234-123456789002'" `
    -RestoreSql "UPDATE public.knowledge_records SET source_document_id = 'd0000000-0000-4000-8000-000000000004' WHERE id = '23456789-1234-4234-8234-123456789002'" `
    -ExpectedDomainPrefix 'public.knowledge_records WHERE rag_enabled AND'
  Assert-RagPreflightBlocked `
    -MutationSql "UPDATE public.documents SET source_id = '23456789-1234-4234-8234-123456789099' WHERE id = 'd0000000-0000-4000-8000-000000000004'" `
    -RestoreSql "UPDATE public.documents SET source_id = '23456789-1234-4234-8234-123456789002' WHERE id = 'd0000000-0000-4000-8000-000000000004'" `
    -ExpectedDomainPrefix 'public.knowledge_records WHERE source_document_id IS NOT NULL'
  Assert-RagPreflightBlocked `
    -MutationSql "UPDATE public.documents SET rag_enabled = false WHERE id = 'd0000000-0000-4000-8000-000000000004'" `
    -RestoreSql "UPDATE public.documents SET rag_enabled = true WHERE id = 'd0000000-0000-4000-8000-000000000004'" `
    -ExpectedDomainPrefix 'public.knowledge_records WHERE source_document_id IS NOT NULL'

  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', "UPDATE public.tenants SET owner_id = '11111111-1111-4111-8111-111111111111' WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9'")
  $unconfirmedOwner = Invoke-DataMode -Mode 'apply' -ExpectedExitCodes @(2)
  if ($unconfirmedOwner.status -ne 'BLOCKED' -or -not (@($unconfirmedOwner.blockers.domain) -like 'public.tenants WHERE owner_id IS NOT NULL*')) {
    throw 'DEV-139 imported owner without active source membership was not blocked.'
  }
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', "UPDATE public.tenants SET owner_id = NULL WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9'")

  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', "INSERT INTO public.tenants VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'QA mismatch workspace', NULL, '11111111-1111-4111-8111-111111111111', now(), now()); UPDATE public.llm_access_logs SET tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2' WHERE id = '01234567-1234-4234-8234-123456789011'")
  $llmMismatch = Invoke-DataMode -Mode 'apply' -ExpectedExitCodes @(2)
  if ($llmMismatch.status -ne 'BLOCKED' -or -not (@($llmMismatch.blockers.domain) -like 'public.llm_access_logs WHERE*')) {
    throw 'DEV-139 mismatched LLM log workspace/project was not blocked before target writes.'
  }
  $llmMismatchTargetCount = Invoke-PgScalar -Database $targetDatabase -Sql 'SELECT (SELECT count(*) FROM projed_core.profiles) + (SELECT count(*) FROM projed_core.google_identity_proofs) + (SELECT count(*) FROM projed_core.account_authorization_guards)'
  if ($llmMismatchTargetCount -ne '0') { throw 'DEV-139 LLM scope preflight wrote target rows.' }
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', "UPDATE public.llm_access_logs SET tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' WHERE id = '01234567-1234-4234-8234-123456789011'; DELETE FROM public.tenants WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'")

  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', 'CREATE TABLE public.dev139_unknown_empty_source (id uuid)')
  $unknownEmptyPlan = Invoke-DataMode -Mode 'plan' -ExpectedExitCodes @(0)
  $unknownEmptyDomain = 'UNKNOWN_SOURCE_RELATION "public"."dev139_unknown_empty_source"'
  $unknownEmptyDiagnostic = @($unknownEmptyPlan.emptySourceRelations | Where-Object { $_.domain -eq $unknownEmptyDomain }) | Select-Object -First 1
  if ($unknownEmptyPlan.status -ne 'PASS' -or -not $unknownEmptyDiagnostic -or $unknownEmptyDiagnostic.count -ne 0) {
    throw 'DEV-139 truly empty unknown app table did not remain a non-blocking diagnostic.'
  }
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', "INSERT INTO public.dev139_unknown_empty_source VALUES ('01234567-1234-4234-8234-123456789099')")
  $unknownPopulatedPlan = Invoke-DataMode -Mode 'plan' -ExpectedExitCodes @(2)
  $unknownPopulatedBlocker = @($unknownPopulatedPlan.blockers | Where-Object { $_.domain -eq $unknownEmptyDomain }) | Select-Object -First 1
  if ($unknownPopulatedPlan.status -ne 'BLOCKED' -or -not $unknownPopulatedBlocker -or $unknownPopulatedBlocker.count -ne 1) {
    throw 'DEV-139 populated unknown table was not blocked on a fresh snapshot.'
  }
  $unknownPopulatedApply = Invoke-DataMode -Mode 'apply' -ExpectedExitCodes @(2)
  if ($unknownPopulatedApply.status -ne 'BLOCKED' -or $unknownEmptyDomain -notin @($unknownPopulatedApply.blockers.domain)) {
    throw 'DEV-139 apply did not reject unknown populated data before target writes.'
  }
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', "CREATE ROLE projed_source_reader_disposable LOGIN PASSWORD '$readerPassword'; GRANT CONNECT ON DATABASE $sourceDatabase TO projed_source_reader_disposable; GRANT USAGE ON SCHEMA public, private, auth TO projed_source_reader_disposable; GRANT SELECT ON ALL TABLES IN SCHEMA public, private TO projed_source_reader_disposable; GRANT SELECT ON auth.identities TO projed_source_reader_disposable; GRANT SELECT (id, banned_until, deleted_at) ON auth.users TO projed_source_reader_disposable; ALTER TABLE public.dev139_unknown_empty_source ENABLE ROW LEVEL SECURITY; CREATE POLICY hide_rows ON public.dev139_unknown_empty_source FOR SELECT USING (false)")
  $encodedReader = [Uri]::EscapeDataString($readerPassword)
  try {
    $env:PROJED_MIGRATION_SOURCE_DATABASE_URL = "postgresql://projed_source_reader_disposable:${encodedReader}@127.0.0.1:$port/$sourceDatabase"
    $hiddenRowsApply = Invoke-DataMode -Mode 'apply' -ExpectedExitCodes @(1)
    if ($hiddenRowsApply.status -ne 'FAIL' -or $hiddenRowsApply.code -ne '42501') {
      throw 'DEV-139 RLS-hidden populated relation was incorrectly accepted as empty.'
    }
  } finally {
    $env:PROJED_MIGRATION_SOURCE_DATABASE_URL = "postgresql://postgres:${encodedAdmin}@127.0.0.1:$port/$sourceDatabase"
  }
  $unknownEmptyTargetCount = Invoke-PgScalar -Database $targetDatabase -Sql 'SELECT (SELECT count(*) FROM projed_core.profiles) + (SELECT count(*) FROM projed_core.google_identity_proofs) + (SELECT count(*) FROM projed_core.account_authorization_guards) + (SELECT count(*) FROM projed_core.tenants)'
  if ($unknownEmptyTargetCount -ne '0') { throw 'DEV-139 unknown source relation preflight wrote target rows.' }
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', 'TRUNCATE TABLE public.dev139_unknown_empty_source; ALTER TABLE public.dev139_unknown_empty_source DISABLE ROW LEVEL SECURITY')

  $encodedReader = [Uri]::EscapeDataString($readerPassword)
  try {
    $env:PROJED_MIGRATION_SOURCE_DATABASE_URL = "postgresql://projed_source_reader_disposable:${encodedReader}@127.0.0.1:$port/$sourceDatabase"
    $identityPlan = Invoke-DataMode -Mode 'plan' -ExpectedExitCodes @(0)
    $identityPlanJson = $identityPlan | ConvertTo-Json -Depth 8 -Compress
    if ($identityPlan.status -ne 'PASS' -or $identityPlan.tables.google_identity_proofs.count -ne 1 -or
        $identityPlan.tables.account_authorization_guards.count -ne 1 -or
        $identityPlanJson.Contains('synthetic-google-subject-owner') -or
        $identityPlanJson.Contains('11111111-1111-4111-8111-111111111111')) {
      throw 'DEV-139 Google identity/account-guard projection count or privacy boundary mismatch.'
    }

    $guardUserStateCases = @(
      @{
        name = 'missing Google user'
        mutate = "DELETE FROM auth.users WHERE id = '11111111-1111-4111-8111-111111111111'"
        restore = "INSERT INTO auth.users VALUES ('11111111-1111-4111-8111-111111111111', NULL, NULL)"
      },
      @{
        name = 'banned Google user'
        mutate = "UPDATE auth.users SET banned_until = transaction_timestamp() + interval '1 hour' WHERE id = '11111111-1111-4111-8111-111111111111'"
        restore = "UPDATE auth.users SET banned_until = NULL WHERE id = '11111111-1111-4111-8111-111111111111'"
      },
      @{
        name = 'deleted Google user'
        mutate = "UPDATE auth.users SET deleted_at = transaction_timestamp() WHERE id = '11111111-1111-4111-8111-111111111111'"
        restore = "UPDATE auth.users SET deleted_at = NULL WHERE id = '11111111-1111-4111-8111-111111111111'"
      }
    )
    foreach ($guardUserStateCase in $guardUserStateCases) {
      Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', $guardUserStateCase.mutate)
      try {
        $guardUserStateBlocked = Invoke-DataMode -Mode 'apply' -ExpectedExitCodes @(2)
        $guardUserBlockers = @($guardUserStateBlocked.blockers | Where-Object { $_.domain -eq 'auth.users.google_identity_account_unavailable' })
        $guardUserStateJson = $guardUserStateBlocked | ConvertTo-Json -Depth 8 -Compress
        if ($guardUserStateBlocked.status -ne 'BLOCKED' -or $guardUserBlockers.Count -ne 1 -or $guardUserBlockers[0].count -ne 1 -or
            $guardUserStateJson.Contains('synthetic-google-subject-owner') -or
            $guardUserStateJson.Contains('11111111-1111-4111-8111-111111111111')) {
          throw "DEV-139 $($guardUserStateCase.name) was not blocked with domain/count-only diagnostics."
        }
        $guardUserTargetCount = Invoke-PgScalar -Database $targetDatabase -Sql 'SELECT (SELECT count(*) FROM projed_core.profiles) + (SELECT count(*) FROM projed_core.google_identity_proofs) + (SELECT count(*) FROM projed_core.account_authorization_guards)'
        if ($guardUserTargetCount -ne '0') { throw "DEV-139 $($guardUserStateCase.name) preflight wrote target rows." }
      } finally {
        Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', $guardUserStateCase.restore)
      }
    }

    try {
      Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', "UPDATE auth.identities SET identity_data = jsonb_build_object('sub', 'different-google-subject') WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'")
      $wrongSub = Invoke-DataMode -Mode 'apply' -ExpectedExitCodes @(1)
      if ($wrongSub.status -ne 'FAIL' -or $wrongSub.code -ne 'SOURCE_GOOGLE_IDENTITY_SUB_MISMATCH') {
        throw 'DEV-139 Google identity sub mismatch was not rejected.'
      }
    } finally {
      Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', "UPDATE auth.identities SET identity_data = jsonb_build_object('sub', 'synthetic-google-subject-owner') WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'")
    }

    try {
      Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', "INSERT INTO auth.identities VALUES ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3', 'google', '22222222-2222-4222-8222-222222222222', 'synthetic-google-subject-owner', jsonb_build_object('sub', 'synthetic-google-subject-owner'))")
      $ambiguousIdentity = Invoke-DataMode -Mode 'apply' -ExpectedExitCodes @(1)
      if ($ambiguousIdentity.status -ne 'FAIL' -or $ambiguousIdentity.code -ne 'SOURCE_GOOGLE_IDENTITY_AMBIGUOUS') {
        throw 'DEV-139 Google subject mapped to multiple profile UUIDs was not rejected.'
      }
    } finally {
      Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', "DELETE FROM auth.identities WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3'")
    }

    try {
      Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', "INSERT INTO auth.identities VALUES ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee4', 'google', '33333333-3333-4333-8333-333333333333', 'synthetic-orphan-subject', jsonb_build_object('sub', 'synthetic-orphan-subject'))")
      $orphanIdentity = Invoke-DataMode -Mode 'apply' -ExpectedExitCodes @(1)
      if ($orphanIdentity.status -ne 'FAIL' -or $orphanIdentity.code -ne 'SOURCE_GOOGLE_IDENTITY_ORPHAN') {
        throw 'DEV-139 orphan Google identity was not rejected.'
      }
    } finally {
      Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', "DELETE FROM auth.identities WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee4'")
    }

    Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', 'ALTER TABLE auth.identities RENAME TO identities_missing_probe')
    try {
      $missingIdentitySchema = Invoke-DataMode -Mode 'apply' -ExpectedExitCodes @(1)
      if ($missingIdentitySchema.status -ne 'FAIL' -or $missingIdentitySchema.code -ne 'SOURCE_GOOGLE_IDENTITY_SCHEMA_INVALID') {
        throw 'DEV-139 missing auth.identities schema was not rejected.'
      }
    } finally {
      Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', 'ALTER TABLE auth.identities_missing_probe RENAME TO identities')
    }

    Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', 'ALTER TABLE auth.users ALTER COLUMN deleted_at TYPE text USING NULL::text')
    try {
      $wrongAuthUserSchema = Invoke-DataMode -Mode 'apply' -ExpectedExitCodes @(1)
      if ($wrongAuthUserSchema.status -ne 'FAIL' -or $wrongAuthUserSchema.code -ne 'SOURCE_GOOGLE_USER_SCHEMA_INVALID') {
        throw 'DEV-139 wrong auth.users column type was not rejected.'
      }
    } finally {
      Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', 'ALTER TABLE auth.users ALTER COLUMN deleted_at TYPE timestamptz USING NULL::timestamptz')
    }

    Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', 'REVOKE SELECT (deleted_at) ON auth.users FROM projed_source_reader_disposable')
    try {
      $authUserPermission = Invoke-DataMode -Mode 'apply' -ExpectedExitCodes @(1)
      if ($authUserPermission.status -ne 'FAIL' -or $authUserPermission.code -ne 'SOURCE_GOOGLE_USER_PERMISSION_INVALID') {
        throw 'DEV-139 auth.users column permission failure was not rejected.'
      }
    } finally {
      Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', 'GRANT SELECT (deleted_at) ON auth.users TO projed_source_reader_disposable')
    }

    Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', 'REVOKE SELECT ON auth.identities FROM projed_source_reader_disposable')
    try {
      $identityPermission = Invoke-DataMode -Mode 'apply' -ExpectedExitCodes @(1)
      if ($identityPermission.status -ne 'FAIL' -or $identityPermission.code -ne '42501') {
        throw 'DEV-139 auth.identities permission failure did not retain generic PostgreSQL code 42501.'
      }
    } finally {
      Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', 'GRANT SELECT ON auth.identities TO projed_source_reader_disposable')
    }
  } finally {
    $env:PROJED_MIGRATION_SOURCE_DATABASE_URL = "postgresql://postgres:${encodedAdmin}@127.0.0.1:$port/$sourceDatabase"
  }
  $identityNegativeTargetCount = Invoke-PgScalar -Database $targetDatabase -Sql 'SELECT (SELECT count(*) FROM projed_core.profiles) + (SELECT count(*) FROM projed_core.google_identity_proofs) + (SELECT count(*) FROM projed_core.account_authorization_guards)'
  if ($identityNegativeTargetCount -ne '0') { throw 'DEV-139 invalid Google identity proofs wrote target rows.' }

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
  $unknownInheritedEmptyPlan = Invoke-DataMode -Mode 'plan' -ExpectedExitCodes @(0)
  if ($unknownInheritedEmptyPlan.status -ne 'PASS') { throw 'DEV-139 empty ordinary inheritance child incorrectly blocked migration.' }
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', "INSERT INTO public.dev139_inherited_profiles SELECT profiles.*, 'unclassified child data' FROM ONLY public.profiles LIMIT 1")
  $unknownInheritedPlan = Invoke-DataMode -Mode 'plan' -ExpectedExitCodes @(2)
  $unknownInheritedDomain = 'UNKNOWN_SOURCE_RELATION "public"."dev139_inherited_profiles"'
  $unknownInheritedBlocker = @($unknownInheritedPlan.blockers | Where-Object { $_.domain -eq $unknownInheritedDomain }) | Select-Object -First 1
  if ($unknownInheritedPlan.status -ne 'BLOCKED' -or -not $unknownInheritedBlocker -or $unknownInheritedBlocker.count -ne 1) {
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

  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', "UPDATE public.task_workbench_unplaced_items SET task = '[]'::jsonb")
  $rollback = Invoke-DataMode -Mode 'apply' -ExpectedExitCodes @(1)
  if ($rollback.status -ne 'FAIL') { throw 'DEV-139 injected apply failure was not rejected.' }
  $rollbackCount = Invoke-PgScalar -Database $targetDatabase -Sql 'SELECT (SELECT count(*) FROM projed_core.profiles) + (SELECT count(*) FROM projed_core.google_identity_proofs) + (SELECT count(*) FROM projed_core.account_authorization_guards) + (SELECT count(*) FROM projed_core.tenants) + (SELECT count(*) FROM projed_core.llm_access_logs)'
  if ($rollbackCount -ne '0') { throw 'DEV-139 failed import left partial target rows.' }
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $sourceDatabase, '-v', 'ON_ERROR_STOP=1', '-c', "UPDATE public.task_workbench_unplaced_items SET task = jsonb_build_object('id', 'unplaced-1', 'title', 'Unplaced')")

  $apply = Invoke-DataMode -Mode 'apply' -ExpectedExitCodes @(0)
  if ($apply.status -ne 'PASS' -or $apply.matches -ne $true -or
      $unknownEmptyDomain -notin @($apply.emptySourceRelations.domain)) {
    throw 'DEV-139 migration apply did not reconcile with the empty unknown relation retained as a diagnostic.'
  }
  $reconcile = Invoke-DataMode -Mode 'reconcile' -ExpectedExitCodes @(0)
  if ($reconcile.status -ne 'PASS' -or $reconcile.matches -ne $true -or $reconcile.snapshotId -ne $apply.snapshotId) {
    throw 'DEV-139 post-commit reconciliation failed.'
  }
  $targetRagEligible = Invoke-PgScalar -Database $targetDatabase -Sql "SELECT count(*) FROM projed_core.knowledge_records record JOIN projed_core.documents document ON document.id = record.source_document_id AND document.tenant_id = record.tenant_id AND document.project_id = record.project_id AND document.source_table = 'knowledge_records' AND document.source_id = record.id AND document.source_type = 'meeting_note' AND document.visibility = record.visibility AND document.rag_enabled = record.rag_enabled JOIN projed_core.document_versions version ON version.tenant_id = document.tenant_id AND version.document_id = document.id AND version.content_hash = document.content_hash JOIN projed_core.document_chunks chunk ON chunk.tenant_id = document.tenant_id AND chunk.document_id = document.id AND chunk.document_version_id = version.id WHERE record.id = '23456789-1234-4234-8234-123456789002' AND record.status = 'published' AND record.visibility <> 'private' AND record.rag_enabled AND document.rag_enabled AND version.id = (SELECT latest.id FROM projed_core.document_versions latest WHERE latest.tenant_id = document.tenant_id AND latest.document_id = document.id ORDER BY latest.version DESC LIMIT 1)"
  if ($targetRagEligible -ne '1') { throw 'DEV-139 apply/reconcile did not retain the valid published RAG source.' }
  $importedGuardBindings = Invoke-PgScalar -Database $targetDatabase -Sql "SELECT (SELECT count(*) FROM projed_core.account_authorization_guards) || ':' || (SELECT count(*) FROM projed_core.account_authorization_guards guard JOIN projed_core.google_identity_proofs proof USING (local_user_id) JOIN projed_core.profiles profile ON profile.id = guard.local_user_id WHERE guard.local_user_id = '11111111-1111-4111-8111-111111111111' AND guard.active AND guard.revision = 1 AND guard.updated_at = profile.updated_at) || ':' || (SELECT count(*) FROM projed_core.account_authorization_guards WHERE local_user_id = '22222222-2222-4222-8222-222222222222')"
  if ($importedGuardBindings -ne '1:1:0') { throw "DEV-139 source account guard projection mismatch: $importedGuardBindings" }
  foreach ($retentionCheck in @('llm-access-retention.sql', 'workspace-lifecycle.sql', 'document-retention.sql')) {
    try {
      # Each file owns a connection-local BEGIN/ROLLBACK; a failed psql closes
      # that transaction, so independent readback/negative cases remain safe.
      Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $targetDatabase, '-v', 'ON_ERROR_STOP=1', '-f', "qa/dev-139/migration/$retentionCheck")
    } catch {
      $retentionFailures += "${retentionCheck}: $($_.Exception.Message)"
      Write-Warning "DEV-139 retention check failed: $retentionCheck; collecting independent results."
    }
  }
  $env:PROJED_ENV = 'disposable'
  $env:PROJED_APP_ENTRY = 'main'
  $env:PROJED_DATABASE_URL = "postgresql://projed_runtime_disposable:${encodedRuntime}@127.0.0.1:$port/$targetDatabase"
  $env:PROJED_QA_TARGET_ADMIN_URL = "postgresql://postgres:${encodedAdmin}@127.0.0.1:$port/$targetDatabase"
  & npx.cmd tsx qa/dev-139/migration/workspace-transfer-retention.ts
  if ($LASTEXITCODE -ne 0) { $retentionFailures += 'workspace-transfer-retention.ts: product command verification failed' }

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
  # The two values below collapse under JS number/Date conversion. Reconcile
  # must still detect either change without adding a separate release gate.
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $targetDatabase, '-v', 'ON_ERROR_STOP=1', '-c', "UPDATE projed_core.llm_access_logs SET response_metadata = '9007199254740993.1234567890123456788'::jsonb WHERE id = '01234567-1234-4234-8234-123456789013'")
  $numericDrift = Invoke-DataMode -Mode 'reconcile' -ExpectedExitCodes @(1)
  if ($numericDrift.status -ne 'FAIL' -or $numericDrift.code -ne 'RECONCILIATION_MISMATCH') {
    throw 'DEV-139 arbitrary-precision JSON numeric drift was not rejected.'
  }
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $targetDatabase, '-v', 'ON_ERROR_STOP=1', '-c', "UPDATE projed_core.llm_access_logs SET response_metadata = '9007199254740993.1234567890123456789'::jsonb, created_at = '2026-01-04T00:00:00.123457Z'::timestamptz WHERE id = '01234567-1234-4234-8234-123456789013'")
  $microsecondDrift = Invoke-DataMode -Mode 'reconcile' -ExpectedExitCodes @(1)
  if ($microsecondDrift.status -ne 'FAIL' -or $microsecondDrift.code -ne 'RECONCILIATION_MISMATCH') {
    throw 'DEV-139 sub-millisecond timestamp drift was not rejected.'
  }
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $targetDatabase, '-v', 'ON_ERROR_STOP=1', '-c', "UPDATE projed_core.llm_access_logs SET created_at = '2026-01-04T00:00:00.123456Z'::timestamptz WHERE id = '01234567-1234-4234-8234-123456789013'")
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $targetDatabase, '-v', 'ON_ERROR_STOP=1', '-c', "UPDATE projed_core.document_embeddings SET embedding[3] = '3.1415925'::real WHERE id = 'd3000000-0000-4000-8000-000000000001'")
  $floatDrift = Invoke-DataMode -Mode 'reconcile' -ExpectedExitCodes @(1)
  if ($floatDrift.status -ne 'FAIL' -or $floatDrift.code -ne 'RECONCILIATION_MISMATCH') {
    throw 'DEV-139 float32 drift below rounded text precision was not rejected.'
  }
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $targetDatabase, '-v', 'ON_ERROR_STOP=1', '-c', "UPDATE projed_core.document_embeddings SET embedding[3] = '3.1415927'::real WHERE id = 'd3000000-0000-4000-8000-000000000001'")
  $finalReconcile = Invoke-DataMode -Mode 'reconcile' -ExpectedExitCodes @(0)
  if ($finalReconcile.status -ne 'PASS' -or $finalReconcile.matches -ne $true) {
    throw 'DEV-139 reconciliation did not recover after the isolated drift was restored.'
  }

  $guardWriteBoundary = Invoke-PgScalar -Database $targetDatabase -Sql "SELECT has_table_privilege('projed_importer_disposable', 'projed_core.account_authorization_guards', 'SELECT') || ':' || has_table_privilege('projed_importer_disposable', 'projed_core.account_authorization_guards', 'INSERT') || ':' || has_column_privilege('projed_importer_disposable', 'projed_core.account_authorization_guards', 'local_user_id', 'INSERT') || ':' || has_column_privilege('projed_importer_disposable', 'projed_core.account_authorization_guards', 'active', 'INSERT') || ':' || has_column_privilege('projed_importer_disposable', 'projed_core.account_authorization_guards', 'revision', 'INSERT') || ':' || has_column_privilege('projed_importer_disposable', 'projed_core.account_authorization_guards', 'updated_at', 'INSERT') || ':' || has_any_column_privilege('projed_importer_disposable', 'projed_core.account_authorization_guards', 'UPDATE') || ':' || has_table_privilege('projed_importer_disposable', 'projed_core.account_authorization_guards', 'DELETE')"
  if ($guardWriteBoundary -ne 'true:false:true:true:true:true:false:false') { throw "DEV-139 account-guard importer boundary mismatch: $guardWriteBoundary" }
  Invoke-PgTool 'psql.exe' @('-h', '127.0.0.1', '-p', "$port", '-U', 'postgres', '-d', $targetDatabase, '-v', 'ON_ERROR_STOP=1', '-c', "BEGIN; SET LOCAL ROLE projed_importer_disposable; DO `$`$ BEGIN BEGIN INSERT INTO projed_core.account_authorization_guards(local_user_id, active, revision, updated_at) VALUES ('22222222-2222-4222-8222-222222222222', true, 1, now()); RAISE EXCEPTION 'guard insert without Google proof unexpectedly succeeded'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; BEGIN INSERT INTO projed_core.account_authorization_guards(local_user_id, active, revision, updated_at) VALUES ('11111111-1111-4111-8111-111111111111', false, 1, now()); RAISE EXCEPTION 'inactive guard insert unexpectedly succeeded'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; BEGIN INSERT INTO projed_core.account_authorization_guards(local_user_id, active, revision, updated_at) VALUES ('11111111-1111-4111-8111-111111111111', true, 2, now()); RAISE EXCEPTION 'non-initial guard revision insert unexpectedly succeeded'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; INSERT INTO projed_core.google_identity_proofs(google_subject, local_user_id) VALUES ('qa-snapshot-guard-guest', '22222222-2222-4222-8222-222222222222'); INSERT INTO projed_core.account_authorization_guards(local_user_id, active, revision, updated_at) VALUES ('22222222-2222-4222-8222-222222222222', true, 1, now()); BEGIN UPDATE projed_core.account_authorization_guards SET active = false WHERE local_user_id = '22222222-2222-4222-8222-222222222222'; RAISE EXCEPTION 'guard UPDATE unexpectedly succeeded'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; BEGIN DELETE FROM projed_core.account_authorization_guards WHERE local_user_id = '22222222-2222-4222-8222-222222222222'; RAISE EXCEPTION 'guard DELETE unexpectedly succeeded'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END `$`$; ROLLBACK")
  $boundary = Invoke-PgScalar -Database $targetDatabase -Sql "SELECT (SELECT count(*) FROM projed_core.account_authorization_guards) || ':' || has_table_privilege('projed_importer_disposable', 'projed_core.profiles', 'SELECT') || ':' || has_table_privilege('projed_importer_disposable', 'projed_core.profiles', 'INSERT') || ':' || has_table_privilege('projed_importer_disposable', 'projed_core.profiles', 'UPDATE') || ':' || has_table_privilege('projed_importer_disposable', 'projed_core.profiles', 'DELETE') || ':' || has_table_privilege('projed_importer_disposable', 'projed_core.google_identity_proofs', 'SELECT') || ':' || has_table_privilege('projed_importer_disposable', 'projed_core.google_identity_proofs', 'INSERT') || ':' || has_table_privilege('projed_importer_disposable', 'projed_core.google_identity_proofs', 'UPDATE') || ':' || has_table_privilege('projed_importer_disposable', 'projed_core.google_identity_proofs', 'DELETE')"
  if ($boundary -ne '1:true:true:false:false:true:true:false:false') { throw "DEV-139 importer or identity-guard boundary mismatch: $boundary" }
  $profileBindings = Invoke-PgScalar -Database $targetDatabase -Sql "SELECT (SELECT count(*) FROM projed_core.profiles WHERE id = '11111111-1111-4111-8111-111111111111' AND external_auth_provider = 'legacy' AND external_auth_id = 'owner-1') || ':' || (SELECT count(*) FROM projed_core.profiles WHERE id = '22222222-2222-4222-8222-222222222222' AND external_auth_provider IS NULL AND external_auth_id IS NULL) || ':' || (SELECT count(*) FROM projed_core.google_identity_proofs WHERE google_subject = 'synthetic-google-subject-owner' AND local_user_id = '11111111-1111-4111-8111-111111111111')"
  if ($profileBindings -ne '1:1:1') { throw 'DEV-139 Google proof changed profile auth fields or failed to retain the UUID mapping.' }
  if ($retentionFailures.Count -gt 0) { throw "DEV-139 retention verification failed: $($retentionFailures -join '; ')" }

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
    emptySourceRelations = $finalReconcile.emptySourceRelations
    checks = @(
      'empty-target-plan', 'single-transaction-rollback', 'full-snapshot-apply',
      'unknown-empty-relation-diagnostic', 'unknown-populated-relation-block',
      'rls-hidden-source-reject', 'unknown-partitioned-relation-block',
      'empty-inheritance-child-diagnostic', 'ordinary-inheritance-child-block', 'plain-view-non-authority-skip',
      'materialized-view-source-block', 'extension-owned-relation-skip',
      'exact-digest-reconcile', 'non-empty-target-reject', 'unsupported-domain-reject',
      'google-proof-snapshot-projection', 'google-proof-output-hashes-only',
      'google-subject-conflict-prewrite-reject', 'google-proof-orphan-prewrite-reject',
      'google-proof-schema-and-permission-fail-closed', 'google-proof-preserves-profile-auth-state',
      'importer-createdb-reject', 'importer-createrole-reject', 'importer-owner-membership-reject',
      'llm-log-exact-retention', 'llm-log-scope-mismatch-reject',
      'llm-log-actor-rls', 'llm-log-immutable-runtime', 'llm-log-transfer-and-delete',
      'llm-json-scalar-and-json-null-preserved', 'normal-board-transfer-command',
      'json-numeric-precision-retained-and-drift-rejected',
      'timestamp-microseconds-retained-and-drift-rejected',
      'orphan-workspace-exact-retention', 'orphan-workspace-zero-access',
      'unconfirmed-source-owner-reject', 'workspace-owner-delete-set-null',
      'board-preferences-workspace-transfer',
      'document-corpus-and-sync-state-retention', 'document-private-and-board-rls',
      'document-scope-preflight-zero-write', 'float32-embedding-retention',
      'float-output-precision-pinned-and-drift-rejected',
      'record-rag-valid-published-snapshot-retention',
      'record-rag-invalid-state-and-provenance-prewrite-reject',
      'record-rag-disabled-legacy-visibility-compatible',
      'document-version-fk-detach-and-rollback',
      'quick-oauth-client-reject',
      'target-drift-detect', 'source-derived-active-account-guards',
      'disabled-deleted-missing-source-user-prewrite-reject',
      'account-guard-importer-insert-only-runtime-write-deny', 'importer-select-insert-only'
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
  Remove-Item Env:PROJED_ENV -ErrorAction SilentlyContinue
  Remove-Item Env:PROJED_APP_ENTRY -ErrorAction SilentlyContinue
  Remove-Item Env:PROJED_DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:PROJED_QA_TARGET_ADMIN_URL -ErrorAction SilentlyContinue
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
