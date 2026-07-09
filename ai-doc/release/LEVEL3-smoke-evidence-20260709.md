# LEVEL3 Smoke Evidence - 2026-07-09

## 結論

Level 3 production-like pre-deploy smoke 已通過。

此證據只代表正式部署前的 Firebase Hosting preview / Supabase TEST production-like smoke 通過；正式環境尚未部署，仍需完成 release scope 確認、production deploy，以及 Level 4 post-deploy production smoke。

## Release Context

- Date: 2026-07-09
- Evidence level: Level 3 - production-like pre-deploy smoke
- Branch: `持續優化1`
- Commit: `3a5ee67`
- Worktree state: dirty; production release scope 尚未完成分類與確認
- Firebase project/site: `projed-cc78d`
- Firebase channel: `level3-smoke`
- Preview URL: `https://projed-cc78d--level3-smoke-5z1oahx6.web.app`
- Preview expiry: `2026-07-10 12:24:17`
- Production URL not deployed in this step: `https://projed-cc78d.web.app`

## Artifact Evidence

- Build output deployed by Firebase Hosting preview: `dist`
- Loaded JS bundle: `/assets/index-RbZf0A1S.js`
- Loaded CSS bundle: `/assets/index-BDAzO0Df.css`
- App title observed: `ProJED 3.0 | 專案管理系統`
- App shell result: non-empty
- Backend selected by deployed bundle: Supabase `ProJED-TEST`
- Supabase TEST project ref observed in bundle: `fhisnnufoeulxqrchldf`
- Firebase project id `projed-cc78d` was not embedded as backend config in the deployed bundle.

## Automated Smoke

Command:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\verify-level3-firebase-preview.ps1 -Url "https://projed-cc78d--level3-smoke-5z1oahx6.web.app"
```

Result:

- Exit code: `0`
- `playwright-run-code-has-error`: `False`
- Preview entrypoint loaded successfully.
- App shell was non-empty.
- No critical console, pageerror, module-load, or network failures were observed.
- Service worker readiness check passed.

## Manual Auth/Data Smoke

User-confirmed result: passed.

Manual smoke checklist completed on Firebase preview:

1. Logged in to preview.
2. Created workspace `LEVEL3-SMOKE-20260709`.
3. Created one board.
4. Created one task.
5. Renamed the task.
6. Dragged the task once.
7. Opened task detail.
8. Added one note / record.
9. Refreshed page and confirmed workspace, board, task, and note persisted.
10. Deleted workspace `LEVEL3-SMOKE-20260709`.
11. Refreshed page and confirmed workspace was deleted.

## Incident During Smoke

During the delete-workspace step, the preview initially showed:

```text
Could not find the function public.delete_workspace(target_tenant_id) in the schema cache
```

Diagnosis:

- Frontend calls `supabase.rpc('delete_workspace', { target_tenant_id })`.
- Local migration exists at `supabase/migrations/20260629113000_workspace_delete_rpc.sql`.
- Supabase `ProJED-TEST` was missing the `public.delete_workspace(uuid)` RPC or its PostgREST schema cache had not been refreshed.

Fix applied in Supabase `ProJED-TEST`:

- Created or replaced `public.delete_workspace(target_tenant_id uuid)`.
- Revoked default function execute access from `public` and `anon`.
- Granted execute to `authenticated` and `service_role`.
- Ran `notify pgrst, 'reload schema';`.

After this fix, the manual delete-workspace smoke passed.

## Remaining Gates Before Production

- Classify current dirty worktree changes into included release, excluded work, generated/local artifact, or unknown risk.
- Confirm exact production release path and artifact provenance.
- Rebuild from the confirmed release scope.
- Deploy to Firebase Hosting live only after release scope is confirmed.
- Run Level 4 post-deploy smoke directly against `https://projed-cc78d.web.app`.
- Optional hardening for future repeatability: add `VITE_SUPABASE_AUTH_REDIRECT_URL` to `.env.staging.local` for the fixed Firebase preview URL currently being tested.
