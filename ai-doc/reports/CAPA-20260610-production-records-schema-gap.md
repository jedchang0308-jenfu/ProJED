# CAPA-20260610 Production Records Schema Gap

## Issue

On 2026-06-10, a user published a meeting record on the production site:

- Site: `https://projed-cc78d.web.app/`
- Account: `jedchang0308@jenfu.com.tw`
- Symptom: the UI workflow indicated publication, but the record did not appear in Records Library.

Production Supabase project `knodlkxqpcqyrtgwpdst` did not contain the required record tables:

- `public.knowledge_records`
- `public.record_task_links`

The deployed frontend contained the meeting/work record feature, but the production database schema was behind the application code.

## Impact

- The affected meeting record was not persisted and must be re-published.
- Records Library could not function in production for meeting/work records before the schema fix.
- The issue created a release confidence gap: frontend deployment was allowed without a production schema readiness gate.

## Containment

Completed on 2026-06-10:

- Applied production migration `meeting_work_records`.
- Applied production migration `record_rag_visibility_guard`.
- Applied production migration `record_rag_sync_jobs`.
- Verified production now has `public.knowledge_records` and `public.record_task_links`.
- Verified `knowledge_records` currently has `0` rows, meaning the user's earlier record was not recoverable from the new table.
- Ran `npm run build`; build passed with existing bundle-size warnings only.

## Root Cause Analysis

### Direct Cause

The production database schema did not include the record feature migrations while the production frontend already exposed the record publish workflow.

### 5 Why

1. Why did the published meeting record not appear?
   Because production had no `knowledge_records` table for the frontend record service to persist and later list records.

2. Why did production not have `knowledge_records`?
   Because the record feature migrations from 2026-06-04 were committed locally but not applied to the production Supabase project.

3. Why was this not detected during development?
   Because DEV and local verification checked file presence, browser workflow, and local/test behavior, but did not verify production migration parity before Firebase deployment.

4. Why did the release process allow code/schema drift?
   Because there was no mandatory release gate comparing repository migrations against production Supabase migration history.

5. Why was user-facing publish feedback insufficient?
   The UI save feedback depends on the store result, but the release validation did not include a production authenticated create/list smoke test for Records Library. Therefore the end-to-end failure was not caught before use.

## Corrective Actions

| ID | Action | Owner | Status |
|---|---|---|---|
| CA-1 | Apply missing production record migrations. | PM/RD | Done |
| CA-2 | Verify production tables exist and RLS is enabled. | QC | Done |
| CA-3 | Ask user to re-publish the lost meeting record. | PM | Open |
| CA-4 | Run an authenticated production smoke test: publish one meeting record, reload Records Library, confirm it appears, then archive/delete test data. | QC | Open |
| CA-5 | Review browser console/network behavior for failed record publish and ensure failures surface as visible errors. | RD | Open |

## Preventive Actions

| ID | Action | Owner | Due |
|---|---|---|---|
| PA-1 | Add a release gate script that compares local `supabase/migrations` with production `supabase_migrations.schema_migrations` before deploy. | RD | Next release |
| PA-2 | Add a production/staging smoke checklist for schema-backed features: create, list, reload, and role/RLS verification. | QA | Next release |
| PA-3 | Update `verify:source` or add `verify:release` so schema parity is checked before Firebase hosting deploy. | RD | Next release |
| PA-4 | Require every DB-backed DEV task to document "migration applied to target environment" as PM evidence. | PM | Immediate |
| PA-5 | Add UI error regression coverage for record publish failure when backend returns table/schema errors. | QA/RD | Next sprint |

## Verification Plan

1. Production schema verification:
   - Confirm `public.knowledge_records` exists.
   - Confirm `public.record_task_links` exists.
   - Confirm RLS is enabled on both tables.
   - Confirm production migration history includes the three record migrations.

2. Production functional verification:
   - Login as an authorized production user.
   - Create a meeting record with a unique title.
   - Publish it.
   - Open Records Library.
   - Confirm the same record appears after a page reload.
   - Confirm the record is scoped to the active workspace/project.

3. Negative verification:
   - Simulate or inspect backend failure path.
   - Confirm the UI displays an error and does not show misleading publish success.

## Release Gate Update

No future production deploy should be considered complete unless these pass:

- App build passes.
- Supabase production migration history is at or ahead of the commit being deployed.
- Authenticated production or staging smoke test passes for each newly released DB-backed feature.
- PM evidence includes DB target environment and verification timestamp.

## Current Risk

The immediate schema gap is fixed. The remaining risk is process-level: without a migration parity gate, future frontend deployments can again outrun production schema changes.
