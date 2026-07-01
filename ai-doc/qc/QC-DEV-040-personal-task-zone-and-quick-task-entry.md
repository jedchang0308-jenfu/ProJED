# QC-DEV-040 - Personal Task Zone and Quick Task Entry

Date: 2026-07-01
Status: Production Released / Production Smoke Passed

## Scope

DEV-040 release gate for `任務專區`, including DEV-039 superseded quick memo workflow compatibility.

## Local Gates

- `npm run verify:dev-039-cloud-quick-capture-inbox`: Passed.
- `npm run verify:dev-040-personal-task-zone`: Passed.
- `npx tsc --noEmit`: Passed.
- `npm run build`: Passed.
- Build artifact evidence: `TaskZoneView-Db9aHybR.js`, `BoardView-WpxNL38B.js`, `index-C-FBBdhO.js`.
- Browser smoke `npm run verify:dev-039-cloud-quick-capture-inbox-browser`: Passed.
- Browser smoke `npm run verify:dev-040-personal-task-zone-browser`: Passed.

## Production Supabase Evidence

- Project: ProJED / `knodlkxqpcqyrtgwpdst`.
- Applied migration: `20260701005406 dev_040_personal_task_zone`.
- Applied hotfix migration: `fix_dev_040_personal_task_zone_conflict`.
- Function catalog confirmed:
  - `public.ensure_personal_task_zone()`
  - `public.create_personal_quick_task(text, text, text, date, jsonb)`
  - `public.place_personal_task_on_board(uuid, uuid, uuid, uuid, uuid, text)`
- Index catalog confirmed:
  - `tenants_personal_task_zone_owner_idx`
  - `projects_personal_task_zone_tenant_idx`
  - `wbs_items_personal_task_zone_client_mutation_idx`
- Grants confirmed: `authenticated` has execute; `anon` and `PUBLIC` are not granted.
- Anon REST RPC smoke: rejected as expected.
- DB-level authenticated flow QC:
  - Personal zone ensure idempotency verified.
  - Quick task create idempotency verified.
  - Task detail fields persisted: `detail_notes`, `description`, `status`, `start_date`, `end_date`.
  - Personal task placement to normal project verified.
  - QC task cleanup verified: remaining QC task count `0`.

## Defect Found and Fixed

Production QC found `ensure_personal_task_zone()` failed due PL/pgSQL output-column ambiguity: output columns `tenant_id` / `project_id` conflicted with `on conflict (tenant_id, user_id)`.

Fix:

- Updated original DEV-040 migration for future environments.
- Added hotfix migration `20260701010000_fix_dev_040_personal_task_zone_conflict.sql`.
- Replaced ambiguous conflict targets with `tenant_members_pkey` and `project_members_pkey`.

## Remaining Gate

- Firebase Hosting deploy.
- Post-deploy production smoke.

## Firebase Hosting release evidence

- Deploy command: `npx firebase deploy --only hosting --project projed-cc78d`
- Hosting URL: `https://projed-cc78d.web.app`
- Deploy result: success, 36 files found in `dist`, upload complete, version finalized, release complete.
- Static production smoke: HTTP 200, `#root` present, HTML references `assets/index-C-FBBdhO.js` and `assets/index-0G4QFJDB.css`.
- Browser production smoke: `https://projed-cc78d.web.app/` loads title `ProJED 3.0 | 專案管理系統`, root text length 58, expected login/app text visible, no `收件匣` / `Inbox` legacy label, no browser console error logs.
