# Level 3 Firebase Preview + Supabase TEST Smoke Runbook

This runbook defines the reusable pre-production smoke path for ProJED.

Governance source: `ai-doc/decisions/ADR-037-fixed-test-environment-and-level3-release-gate.md`.

## Goal

Prove the production build runs through Firebase Hosting preview infrastructure while using the isolated Supabase `ProJED-TEST` backend.

This runbook applies only when the protected release path needs Level 3 evidence. Fast releases follow SPEC-083's `direct` contract and do not create a Level 3 receipt. This scope was amended with ADR-037 on 2026-09-21.

This is scoped Level 3 evidence only when all applicable checks are true:

- The app is built with a staging env that points to Supabase `ProJED-TEST`.
- The built `dist/` is deployed to a Firebase Hosting preview channel, not served only by local Vite.
- The smoke opens the Firebase preview URL over HTTPS.
- The changed behavior and its identified risks are exercised; auth/read/write/reload checks are required when affected. A shell-only check must describe that limited scope and cannot prove auth/data behavior.
- No production Supabase project or Firebase live channel is mutated.

## Automatic Applicability Rule

AI must automatically decide whether this Level 3 path is required whenever a task asks for release, deploy, production readiness, production smoke, Firebase Hosting validation, Supabase/Auth/DB/Edge validation, or a fix for a production-only/staging-only issue.

Choose by the consequences of the complete release diff, using ADR-037:

- Bounded, reversible changes with known quick recovery and no material data/security/irreversible-effect risk use fast release; production HTTPS and changed-feature verification happen after deployment.
- Protected releases use targeted Level 3 for data/security/irreversible-effect/recovery risks. Auth, RLS, migration, cache or routing names alone do not establish risk; inspect the changed behavior.
- Documentation/local-only work does not start a release. Record a fast-path reason in the existing receipt, not an artificial Level 3 PASS or an exception form.

AI may run local/static gates and prepare this runbook automatically. AI must not production deploy, mutate `ProJED`, open/accept Supabase Branch cost, or run destructive `ProJED-TEST` tests without explicit user authorization and the required backup/cleanup evidence.

## Cost Policy

Default low-cost path:

- Firebase: use one preview channel named `level3-smoke` and deploy with `--expires 1d`.
- Supabase: use existing `ProJED-TEST` as the fixed staging/test/blast-zone project.
- Supabase Branch: default no. Use only when `ProJED-TEST` cannot safely isolate a migration/Edge/schema/destructive test, and only after user confirms cost, purpose, expected lifetime, delete condition, and rollback/cleanup plan.
- Test data: when the changed behavior needs a write fixture, create one clearly named workspace and delete it after verification.

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

If a required Level 3 check depends on unavailable TEST service, preview Auth redirect, test account or clean fixtures, that check is blocked until fixed. Missing/wrong staging env blocks the staging artifact. Do not downgrade required remote checks to local-only evidence or require an account for a scoped unauthenticated asset check.

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
VITE_SUPABASE_AUTH_MODE=oauth-google
VITE_SUPABASE_TEST_EMAIL=
VITE_SUPABASE_TEST_PASSWORD=
VITE_SUPABASE_AUTO_TEST_LOGIN=false
VITE_ENABLE_SUPABASE_DIAGNOSTICS=false
```

`VITE_SUPABASE_AUTH_REDIRECT_URL` is optional because the app falls back to the current Firebase preview origin. `VITE_GOOGLE_CLIENT_ID` is required only when the release smoke includes Google Calendar API features; it is not required for Supabase Google OAuth.

3. In Supabase `ProJED-TEST`, allow Firebase preview redirects:

```text
https://projed-cc78d--level3-smoke-*.web.app/**
```

4. Confirm Supabase `ProJED-TEST` has Google Auth configured, or use the same auth mode intentionally used by staging.
5. Confirm `ProJED-TEST` is active/healthy before each release smoke.

## Every Required Level 3 Run

Run these commands from `C:\VIBE CODING\ProJED\ProJED`.

```powershell
git status --short --branch
# Reuse passed relevant source checks; do not invoke another production build here.
npm run verify:staging-env
npx vite build --mode staging
npm run verify:staging-artifact-secrets
npx firebase-tools hosting:channel:deploy level3-smoke --project projed-cc78d --expires 1d
```

Copy the Firebase preview URL from the deploy output, then run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verify-level3-firebase-preview.ps1 -Url "PASTE_FIREBASE_PREVIEW_URL_HERE"
```

## Auth/Data Smoke (only when required by the changed behavior)

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
- Relevant source check results (including reusable evidence).
- `npm run verify:staging-env` redacted result, including TEST and production project refs without keys.
- `npm run verify:staging-artifact-secrets` result proving local test email/password are absent from `dist`.
- Staging build bundle names from `dist/index.html`.
- Firebase preview channel URL.
- `verify-level3-firebase-preview.ps1` output.
- Auth/data smoke result when required; otherwise explicitly outside the evidence scope.
- Cleanup result when fixtures were created.
- If destructive or schema/Edge/bulk testing was included: backup evidence and restore/reset readiness.

## Cleanup

If you want to remove the preview channel immediately:

```powershell
npx firebase-tools hosting:channel:delete level3-smoke --project projed-cc78d
```

If you do not delete it manually, the default runbook deploy command sets `--expires 1d`.
