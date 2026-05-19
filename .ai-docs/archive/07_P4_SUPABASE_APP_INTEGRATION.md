# P4 Supabase App Integration

## Decision

P4 integrates Supabase behind a feature flag. It does not cut production traffic over to Supabase.

Runtime database validation from P3 is still required before production cutover:

- Migration apply against local/preview Supabase
- RLS cross-tenant tests
- `match_project_knowledge` runtime tests
- Firestore export/import rehearsal against disposable data

## Feature Flag

Set the data backend with:

```bash
VITE_DATA_BACKEND=firebase
VITE_DATA_BACKEND=supabase
```

Default is `firebase` so existing behavior remains the safe path.

## Implemented

- `src/services/dataBackend.ts`
  - Selects Firebase or Supabase services from `VITE_DATA_BACKEND`.
  - Keeps existing store call sites stable.
- `src/hooks/useDataSync.ts`
  - Runs the selected backend sync hook.
- `src/hooks/useSupabaseSync.ts`
  - Loads workspaces/projects and active-board WBS/dependencies from Supabase.
  - Subscribes to Supabase Realtime changes for refresh.
- `src/hooks/useFirestoreSync.ts`
  - Now supports `enabled` so it can be disabled when Supabase is selected.
- `src/services/supabase/projedService.ts`
  - Adds missing restore/delete/batch/update compatibility methods.
- `scripts/rehearse-supabase-import.mjs`
  - Imports a ProJED JSON export into Supabase with a service-role key for rehearsal.

## Supabase Mode Requirements

Supabase mode requires:

- `VITE_DATA_BACKEND=supabase`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- A valid Supabase Auth session compatible with RLS policies
- Applied P3 migration SQL

The current app still uses Firebase Auth in the UI. A production Supabase cutover therefore needs either:

- Supabase Auth migration, recommended; or
- a transitional backend auth bridge that maps Firebase users to Supabase-authenticated requests.

## Rehearsal Import

Use only against disposable local/preview Supabase databases:

```bash
$env:SUPABASE_URL="https://your-project-ref.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
npm.cmd run rehearse:supabase:import -- --input=./projed-export.json
```

The script prints imported row counts for tenants, projects, WBS items, and dependencies.

## Remaining Gate

P4 is complete when `npm.cmd run verify:source` passes. Production cutover remains blocked until `06_SUPABASE_RUNTIME_GATE.md` passes.
