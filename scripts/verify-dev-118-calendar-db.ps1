$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$migration = Get-Content (Join-Path $root 'supabase/migrations/20260911120000_dev_118_task_filter_v5.sql') -Raw
$calendarMigration = Get-Content (Join-Path $root 'supabase/migrations/20260911121500_dev_118_calendar_v4_validator.sql') -Raw
$service = Get-Content (Join-Path $root 'src/services/supabase/taskFilterPreferenceService.ts') -Raw
if ($migration -notmatch 'default 5') { throw 'DEV-118 migration does not default new preferences to v5' }
if ($service -notmatch 'compareAndSet') { throw 'Preference service is missing CAS' }
if ($service -notmatch 'preference_version') { throw 'Preference service is missing version guard' }
if ($calendarMigration -notmatch 'calendar_subscription_v4_filter_allowed') { throw 'Calendar v4 validator is missing' }
if ($calendarMigration -notmatch "v4_scope_type.*per_board_filter_snapshot") { throw 'Calendar v4 marker is missing' }
[Console]::WriteLine((@{ ok = $true; checks = 5 } | ConvertTo-Json -Compress))
