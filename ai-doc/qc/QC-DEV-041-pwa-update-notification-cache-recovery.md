# QC-DEV-041: PWA 更新通知與快取恢復

狀態: Production Release Deployed / Local + Production QC Passed
關聯 DEV: DEV-041
關聯 SPEC: `ai-doc/specs/SPEC-041-pwa-update-notification-cache-recovery.md`
關聯 QA: `ai-doc/qa/QA-DEV-041-pwa-update-notification-cache-recovery.md`
執行日期: 2026-07-05

## Release Boundary

- Branch: `codex/任務台優化`
- Release commit: `4882dfc`
- Remote: `origin/codex/任務台優化`
- Release path: current branch direct deploy to Firebase Hosting production.
- Firebase project: `projed-cc78d`
- Production URL: `https://projed-cc78d.web.app/`
- Hosting public directory: `dist`
- Rollback target: Firebase Hosting previous release in project `projed-cc78d` console / hosting release history.

Included in release:
- DEV-041 PWA update prompt, update state service, cache recovery, chunk-load recovery guard, ErrorBoundary cache recovery.
- DEV-039 task workbench cross-board source, deletion effective visibility, dense task ordering UI, sticky section headers, compact collapsed rail.
- DEV-029 mobile pan-first gesture arbitration and tap-to-details compatibility.
- Related verifier scripts and PM/QA/QC documentation.

Excluded / not changed:
- Supabase schema, RLS, RPC, migration.
- Forced update / mandatory refresh policy.
- Release notes backend, version API, analytics, push/email notification.

## Local QC Evidence

| Gate | Result | Evidence |
|---|---|---|
| DEV-041 static verifier | Pass | `npm.cmd run verify:dev-041-pwa-update-notification-cache-recovery`, 21/21 |
| DEV-041 browser verifier | Pass | `npm.cmd run verify:dev-041-pwa-update-notification-cache-recovery-browser`; direct Playwright evidence verified mobile prompt visible/tappable, dismiss preserves queued update, update callback invoked, recovery prompt exposes cache action |
| TypeScript | Pass | `npm.cmd exec tsc -- --noEmit` |
| DEV-034 PWA install static | Pass | `npm.cmd run verify:dev-034-pwa-install-guidance`, 22/22 |
| DEV-034 PWA install browser | Pass | `npm.cmd run verify:dev-034-pwa-install-guidance-browser` |
| DEV-028 cross-mode static | Pass | `npm.cmd run verify:dev-028-cross-mode-task-interactions`, 35/35 |
| DEV-028 cross-mode browser | Pass | `npm.cmd run verify:dev-028-cross-mode-task-interactions-browser` |
| DEV-029 mobile pan static | Pass | `npm.cmd run verify:dev-029-mobile-pan-first-interactions`, 27/27 |
| DEV-029 mobile pan browser | Pass | `npm.cmd run verify:dev-029-mobile-pan-first-interactions-browser` |
| DEV-039 filter core static | Pass | `npm.cmd run verify:dev-039-task-filter-core`, 61/61 |
| DEV-039 filter core browser | Pass | `npm.cmd run verify:dev-039-task-filter-core-browser` after fixture update from `group` to `task` to match current group/list display policy |
| DEV-039 filter parity static | Pass | `npm.cmd run verify:dev-039-filter-result-parity`, 26/26 |
| DEV-039 filter parity browser | Pass | `npm.cmd run verify:dev-039-filter-result-parity-browser` |
| DEV-039 placement static | Pass | `npm.cmd run verify:dev-039-task-workbench-placement-lanes`, 22/22 |
| DEV-039 placement browser | Pass | `npm.cmd run verify:dev-039-task-workbench-placement-lanes-browser` |
| DEV-039 cross-board source static | Pass | `npm.cmd run verify:dev-039-task-workbench-cross-board-source`, 23/23 |
| DEV-039 cross-board source browser | Pass | `npm.cmd run verify:dev-039-task-workbench-cross-board-source-browser` |
| Test build | Pass | `npm.cmd run build:test`; generated `dist/sw.js` and `dist/workbox-6c1be909.js` |
| Diff check | Pass | `git diff --check`; CRLF warnings only |

## Build / Artifact Evidence

Production build:
- Command: `npm.cmd run build`
- Result: Pass
- Main JS: `dist/assets/index-C2sty1Hz.js`
- Main CSS: `dist/assets/index-Bz5Y4Esx.css`
- PWA files: `dist/sw.js`, `dist/workbox-6c1be909.js`, `dist/manifest.webmanifest`
- Vite PWA: `generateSW`, precache 38 entries, 2591.26 KiB
- Non-blocking warning: Browserslist data is 6 months old.

Production-like pre-deploy smoke:
- Preview URL: `http://127.0.0.1:4174/`
- HTTP entry: 200
- Preview HTML contained `/assets/index-C2sty1Hz.js`, `/assets/index-Bz5Y4Esx.css`, `/manifest.webmanifest`
- Browser smoke: app shell non-empty, login shell visible, service worker ready, script `http://127.0.0.1:4174/sw.js`, no critical console/pageerror/failed request.

## Deployment Evidence

Deploy command:

```powershell
npx.cmd firebase deploy --only hosting --project projed-cc78d --non-interactive
```

Result:
- Firebase Hosting found 33 files in `dist`.
- Uploaded new files: 18.
- Version finalized.
- Release complete.
- Hosting URL: `https://projed-cc78d.web.app`

## Post-Deploy Production Smoke

HTTP artifact checks:
- `https://projed-cc78d.web.app/`: HTTP 200, contains `/assets/index-C2sty1Hz.js`, `/assets/index-Bz5Y4Esx.css`, `/manifest.webmanifest`
- `https://projed-cc78d.firebaseapp.com/`: HTTP 200, contains `/assets/index-C2sty1Hz.js`, `/assets/index-Bz5Y4Esx.css`, `/manifest.webmanifest`

Browser smoke:
- URL: `https://projed-cc78d.web.app/`
- Title: `ProJED 3.0 | 專案管理系統`
- App shell: non-empty login shell visible.
- Loaded script: `/assets/index-C2sty1Hz.js`
- Loaded CSS: `/assets/index-Bz5Y4Esx.css`
- Service worker: supported and ready, script `https://projed-cc78d.web.app/sw.js`
- Critical console errors: none
- Page errors: none
- Critical failed requests: none

Authenticated production UI smoke:
- Command: `npm.cmd run verify:dev-040-production-auth-ui-smoke`
- Result: Pass
- Temporary Supabase user and tenant created, then cleaned up.
- App loaded after authenticated session injection.
- Project import resolved with 1 activity task.
- Task workbench unplaced task remained present after board switching: `unplacedAfterSwitch = 1`.
- Critical browser messages: none
- Page errors: none
- Failed requests: none

## DEV-041-Specific Judgment

Verified directly:
- `onNeedRefresh` emits observable `update-available` state and preserves queued callback.
- Visible global update prompt exists with stable DOM selectors.
- Mobile prompt is visible, tappable, and does not create horizontal overflow.
- Dismiss/later hides prompt without clearing queued update state.
- Update button invokes queued update callback and resets state in simulated browser test.
- Recoverable load failure shows recovery prompt and cache action.
- ErrorBoundary cache recovery no longer clears `localStorage` or `sessionStorage`.
- Production artifact loads new hashed bundle and service worker successfully.

Not fully simulatable on production without an older controlled client:
- A real in-production `onNeedRefresh` transition from an old active service worker to this new build.
- This is covered by deterministic test-mode browser verifier plus production artifact/SW smoke.

## Residual Risks

- Browser clients already holding very old service workers may still need one manual refresh; DEV-041 now gives them a visible update/recovery path once the app shell runs.
- Firebase CLI update-check warning appeared earlier due local config-store access; deploy itself completed successfully.
- Browserslist database warning is non-blocking and should be handled as routine dependency maintenance.

