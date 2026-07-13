# Level 3 Firebase Preview + Supabase TEST Smoke Runbook

This runbook defines the reusable pre-production smoke path for ProJED.

Governance source: `ai-doc/decisions/ADR-037-fixed-test-environment-and-level3-release-gate.md`.

## Goal

Prove the production build runs through Firebase Hosting preview infrastructure while using the isolated Supabase `ProJED-TEST` backend.

This is Level 3 evidence only when all of these are true:

- The app is built with a staging env that points to Supabase `ProJED-TEST`.
- The built `dist/` is deployed to a Firebase Hosting preview channel, not served only by local Vite.
- The smoke opens the Firebase preview URL over HTTPS.
- Auth and at least one small read/write workflow are verified against `ProJED-TEST`.
- No production Supabase project or Firebase live channel is mutated.

## Automatic Applicability Rule

AI must automatically decide whether this Level 3 path is required whenever a task asks for release, deploy, production readiness, production smoke, Firebase Hosting validation, Supabase/Auth/DB/Edge validation, or a fix for a production-only/staging-only issue.

Default decision:

- Required before production deploy.
- Required for Supabase Auth, RLS, schema, migration, RPC, Edge Function, Storage, Realtime, public env, service worker/cache, routing, or data write-path changes.
- Required when the changed behavior depends on real hosted HTTPS, OAuth redirect, remote backend permissions, cache, or production artifact loading.
- Not required for docs-only changes, local-only PM/QA/QC records, or local verifier self-checks that do not affect runtime behavior; the skip reason must be recorded.

AI may run local/static gates and prepare this runbook automatically. AI must not production deploy, mutate `ProJED`, open/accept Supabase Branch cost, or run destructive `ProJED-TEST` tests without explicit user authorization and the required backup/cleanup evidence.

## Cost Policy

Default low-cost path:

- Firebase: use one preview channel named `level3-smoke` and deploy with `--expires 1d`.
- Supabase: use existing `ProJED-TEST` as the fixed staging/test/blast-zone project.
- Supabase Branch: default no. Use only when `ProJED-TEST` cannot safely isolate a migration/Edge/schema/destructive test, and only after user confirms cost, purpose, expected lifetime, delete condition, and rollback/cleanup plan.
- Test data: create one clearly named workspace per smoke run and delete it after verification.

`ProJED-TEST` must not contain real production customer data unless the data is sanitized and the user explicitly approves it.

## ProJED-TEST Blast-Zone Policy

`ProJED-TEST` is allowed to be a controlled blast zone.

Allowed without destructive-test approval:

- Read-only remote checks.
- Small staging smoke fixtures with clear prefixes.
- Auth, RLS, permission, read/write, reload persistence, and cleanup smoke.

Requires backup evidence before running:

- Schema or migration tests.
- Edge Function deployment tests that may change live test behavior.
- Bulk insert/update/delete.
- Destructive recovery, import overwrite, data repair, or irreversible workflow tests.

Backup evidence must record method, timestamp, scope, and restore/reset path. Database backups do not cover Storage object contents; if a test touches Storage, record separate Storage backup or state that Storage is out of scope.

If `ProJED-TEST` is inactive, Auth redirects do not allow the preview origin, the resolved staging environment is missing or points to production, the test account is unavailable, or the project is visibly polluted by previous runs, Level 3 is blocked until fixed. Do not downgrade the gate to local-only evidence.

## One-Time Setup

1. Run the staging environment verifier. It checks Vite's resolved `staging` mode rather than requiring one specific local filename.

```powershell
npm run verify:staging-env
```

2. If it passes, reuse the existing local environment. Do not recreate `.env.staging.local` for every release.
3. If it fails because values are missing, copy only the required overrides from `.env.staging.example` into the ignored `.env.staging.local`. Do not commit `.env.staging.local`.

```dotenv
VITE_DATA_BACKEND=supabase
VITE_SUPABASE_URL=https://YOUR_PROJED_TEST_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PROJED_TEST_ANON_KEY
VITE_ENABLE_SUPABASE_DIAGNOSTICS=false
```

`VITE_SUPABASE_AUTH_REDIRECT_URL` is optional because the app falls back to the current Firebase preview origin. `VITE_GOOGLE_CLIENT_ID` is required only when the release smoke includes Google Calendar API features; it is not required for Supabase Google OAuth.

3. In Supabase `ProJED-TEST`, allow Firebase preview redirects:

```text
https://projed-cc78d--level3-smoke-*.web.app/**
```

4. Confirm Supabase `ProJED-TEST` has Google Auth configured, or use the same auth mode intentionally used by staging.
5. Confirm `ProJED-TEST` is active/healthy before each release smoke.

## Every Release Run

Run these commands from `C:\VIBE CODING\ProJED\ProJED`.

```powershell
git status --short --branch
npm run verify:source
npm run verify:staging-env
npx vite build --mode staging
npx firebase-tools hosting:channel:deploy level3-smoke --project projed-cc78d --expires 1d
```

Copy the Firebase preview URL from the deploy output, then run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verify-level3-firebase-preview.ps1 -Url "PASTE_FIREBASE_PREVIEW_URL_HERE"
```

## Manual Auth/Data Smoke

1. Open the same Firebase preview URL in normal Chrome.
2. Sign in with the intended staging Google account.
3. Confirm the page loads without visible errors.
4. Create a workspace named `LEVEL3-SMOKE-YYYYMMDD-HHMM`.
5. Create one board under that workspace.
6. Create one task.
7. Rename the task.
8. Drag the task once.
9. Open task details and add a short note or record.
10. Refresh the page.
11. Confirm the workspace, board, task, and note still exist.
12. Delete the `LEVEL3-SMOKE-*` workspace.
13. Refresh again and confirm it is gone.

## Evidence To Record

- Branch and commit hash.
- `git status --short --branch`.
- `npm run verify:source` result.
- `npm run verify:staging-env` redacted result, including TEST and production project refs without keys.
- Staging build bundle names from `dist/index.html`.
- Firebase preview channel URL.
- `verify-level3-firebase-preview.ps1` output.
- Manual auth/data smoke result.
- Cleanup result.
- If destructive or schema/Edge/bulk testing was included: backup evidence and restore/reset readiness.

## Cleanup

If you want to remove the preview channel immediately:

```powershell
npx firebase-tools hosting:channel:delete level3-smoke --project projed-cc78d
```

If you do not delete it manually, the default runbook deploy command sets `--expires 1d`.
