# LEVEL4 Production Deploy Evidence - 2026-07-09

## 結論

Firebase Hosting live deploy 已完成，Level 4 post-deploy production smoke 已通過。

此 release 是依使用者授權，從目前分支 `持續優化1` 的 local dirty worktree 直接 build/deploy。所有目前分支修改被視為本次 release scope；但此狀態尚未 commit/push 固化，後續應補齊 source-control provenance。

## Release Scope

- Release path: current branch direct deploy
- Branch: `持續優化1`
- Commit before deploy: `3a5ee67`
- Upstream: none shown by `git branch -vv`
- Worktree state: dirty
- Scope decision: user confirmed all current branch modifications are included in this release.
- Firebase project/site: `projed-cc78d`
- Production URL: `https://projed-cc78d.web.app`

## Production Supabase Check

- Production Supabase ref from `.env.production`: `knodlkxqpcqyrtgwpdst`
- Staging/TEST Supabase ref: `fhisnnufoeulxqrchldf`
- Production bundle check:
  - `knodlkxqpcqyrtgwpdst` found in `dist`
  - `fhisnnufoeulxqrchldf` not found in `dist`

Production `delete_workspace` RPC check:

- Request target: `https://knodlkxqpcqyrtgwpdst.supabase.co/rest/v1/rpc/delete_workspace`
- Probe method: POST with anon key and fake UUID
- Result:
  - HTTP status: `401`
  - Error code: `42501`
  - Message: `permission denied for function delete_workspace`

Interpretation:

- `public.delete_workspace(target_tenant_id uuid)` exists in production and is visible to PostgREST schema cache.
- `anon` does not have execute permission, which matches the migration's intended authorization boundary.
- The prior Level 3 error `Could not find the function public.delete_workspace(target_tenant_id) in the schema cache` was not reproduced on production.

## Build Gate

Production env probe:

- Command: `python -B C:\Users\user\.codex\skills\deployment-release-gate\scripts\env_probe.py --root . --environment production --env-file .env.production --require VITE_DATA_BACKEND --require VITE_SUPABASE_URL --require VITE_SUPABASE_ANON_KEY --require VITE_GOOGLE_CLIENT_ID`
- Result: passed
- Required keys missing: none

Verification command:

```powershell
npm run verify:source
```

Result:

- Exit code: `0`
- `eslint`: 0 errors, 69 warnings
- `tsc --noEmit`: passed
- `npm run build`: passed
- `verify:production-auth-mode`: passed
- `verify:supabase:static`: passed
- `verify:calendar-feed-ics`: passed
- `verify:core-regression-static`: passed
- `verify:p9-edge-function`: passed

Build artifact:

- Output directory: `dist`
- Main JS bundle: `assets/index-DQ5bab4j.js`
- Main CSS bundle: `assets/index-BrAYM5iH.css`
- PWA files generated:
  - `dist/sw.js`
  - `dist/workbox-6c1be909.js`

Non-blocking warning:

- Browserslist/caniuse-lite data is 6 months old.

## Deploy Gate

Command:

```powershell
.\node_modules\.bin\firebase.cmd deploy --only hosting --project projed-cc78d
```

Result:

- Exit code: `0`
- Files found in `dist`: `32`
- Hosting upload complete
- Version finalized
- New version released
- Hosting URL: `https://projed-cc78d.web.app`

Firebase channel confirmation:

- `live` URL: `https://projed-cc78d.web.app`
- `live` last release time: `2026-07-09 13:53:56`
- `level3-smoke` preview URL: `https://projed-cc78d--level3-smoke-5z1oahx6.web.app`
- `level3-smoke` expiry: `2026-07-10 12:24:17`

## Level 4 Production Smoke

Command:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\verify-level3-firebase-preview.ps1 -Url "https://projed-cc78d.web.app" -SessionPrefix "level4-production"
```

Result:

- Exit code: `0`
- `playwright-run-code-has-error`: `False`
- Page URL: `https://projed-cc78d.web.app/`
- Page title: `ProJED 3.0 | 專案管理系統`
- App shell: non-empty
- Body text includes login shell:
  - `ProJED`
  - `專案管理，從登入開始`
  - `使用 Google 帳號登入`
- Service worker:
  - supported: `true`
  - ready: `true`
  - scriptURL: `https://projed-cc78d.web.app/sw.js`
- Critical console errors: none
- Page errors: none
- Critical failed requests: none

Loaded production assets:

- JS: `/assets/index-DQ5bab4j.js`
- CSS: `/assets/index-BrAYM5iH.css`

HTTP entrypoint check:

- URL: `https://projed-cc78d.web.app/`
- Status: `200`
- HTML references:
  - `assets/index-DQ5bab4j.js`
  - `assets/index-BrAYM5iH.css`

## Authenticated Production Smoke

Codex did not complete a mutating authenticated production CRUD smoke because no reusable authenticated browser session or production-safe test account was available in the automated context.

Covered before production by Level 3:

- Firebase preview against Supabase `ProJED-TEST`
- Login
- Create workspace
- Create board
- Create task
- Rename task
- Drag task once
- Add note / record
- Refresh persistence check
- Delete smoke workspace
- Refresh deletion check

Recommended optional production manual smoke:

1. Log in at `https://projed-cc78d.web.app`.
2. Create workspace `LEVEL4-SMOKE-20260709`.
3. Create one board.
4. Create one task.
5. Rename the task.
6. Drag the task once.
7. Open task detail and add one note / record.
8. Refresh and confirm workspace, board, task, and note persist.
9. Delete workspace `LEVEL4-SMOKE-20260709`.
10. Refresh and confirm deletion.

## Known Follow-Ups

- Commit and push the release scope to preserve source-control provenance for the deployed artifact.
- Keep the Firebase Console Hosting release history as the rollback reference for this live deploy.
- Optional: set `VITE_PROJED_APP_URL=https://projed-cc78d.web.app` in production env for explicit board invite URL generation. Current code falls back to `window.location.origin + window.location.pathname`, so this is not blocking.
- Optional: update Browserslist/caniuse-lite data.
