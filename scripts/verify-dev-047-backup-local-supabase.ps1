$ErrorActionPreference = 'Stop'

$container = 'supabase_db_ProJED'
$database = "dev047_verify_$PID"
$migration = 'supabase/migrations/20260714025203_dev_047_board_backup_package_v2.sql'
$recordLinksPrerequisite = 'supabase/migrations/20260604100000_meeting_work_records.sql'
$matrix = 'scripts/verify-dev-047-backup-transaction-local-supabase.sql'

function Assert-LastExit([string]$label) {
  if ($LASTEXITCODE -ne 0) { throw "$label failed with exit code $LASTEXITCODE" }
}

try {
  $running = docker ps --format '{{.Names}}' | Where-Object { $_ -eq $container }
  if (-not $running) { throw "Local Supabase database container $container is not running." }

  docker exec $container createdb -U postgres $database
  Assert-LastExit 'Create isolated database'

  $dump = docker exec $container pg_dump -U postgres -d postgres --schema-only --no-owner --no-privileges
  Assert-LastExit 'Read baseline schema'
  $dump |
    Where-Object { $_ -notmatch "^\s+SET log_min_messages TO 'fatal'$" } |
    docker exec -i $container psql -U postgres -d $database -X -v ON_ERROR_STOP=1 |
    Out-Null
  Assert-LastExit 'Clone baseline schema'

  $recordLinks = docker exec $container psql -U postgres -d $database -X -tAc "select to_regclass('public.record_task_links') is not null"
  Assert-LastExit 'Inspect record-link prerequisite'
  if ($recordLinks.Trim() -ne 't') {
    Get-Content -Raw $recordLinksPrerequisite |
      docker exec -i $container psql -U postgres -d $database -X -v ON_ERROR_STOP=1 |
      Out-Null
    Assert-LastExit 'Apply record-link prerequisite in isolated database'
  }

  Get-Content -Raw $migration |
    docker exec -i $container psql -U postgres -d $database -X -v ON_ERROR_STOP=1 |
    Out-Null
  Assert-LastExit 'Apply DEV-047 migration in isolated database'

  $security = docker exec $container psql -U postgres -d $database -X -tA -F '|' -c @'
select
  to_regprocedure('public.import_board_backup_v2(uuid,uuid,text,jsonb,text,uuid,text)') is not null,
  not has_function_privilege('anon', 'public.import_board_backup_v2(uuid,uuid,text,jsonb,text,uuid,text)', 'EXECUTE'),
  has_function_privilege('authenticated', 'public.import_board_backup_v2(uuid,uuid,text,jsonb,text,uuid,text)', 'EXECUTE'),
  procedure.prosecdef,
  coalesce(procedure.proconfig @> array['search_path=""'], false)
from pg_proc procedure
where procedure.oid = 'public.import_board_backup_v2(uuid,uuid,text,jsonb,text,uuid,text)'::regprocedure;
'@
  Assert-LastExit 'Verify DEV-047 RPC security contract'
  if ($security.Trim() -ne 't|t|t|t|t') {
    throw "DEV-047 RPC security contract mismatch: $($security.Trim())"
  }

  Get-Content -Raw $matrix |
    docker exec -i $container psql -U postgres -d $database -X -v ON_ERROR_STOP=1
  Assert-LastExit 'Run DEV-047 isolated Supabase transaction matrix'

  Write-Output 'DEV-047 isolated Supabase migration/RPC: passed'
}
finally {
  docker exec $container dropdb -U postgres --if-exists $database 2>$null | Out-Null
}
