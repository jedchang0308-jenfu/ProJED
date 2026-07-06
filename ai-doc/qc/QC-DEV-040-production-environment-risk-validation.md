# QC-DEV-040: 正式環境同型 BUG 風險驗證紀錄

日期: 2026-07-03
狀態: Production Release Deployed / Production Authenticated UI Smoke Passed for Original BUG Flows / P0 Local Addendum QC Passed / P0 Remote Read-only Preflight Executed / Extended 7-Point Matrix Partially Covered
關聯 DEV: DEV-040
參考文件:
- `ai-doc/specs/SPEC-040-production-environment-risk-hardening.md`
- `ai-doc/qa/QA-DEV-040-production-environment-risk-validation.md`

## 驗證結論

本輪 QC 判定為 local / source / browser automated gates 通過，且已完成 Firebase Hosting production deploy 與正式站 authenticated UI smoke。

可宣稱：使用者回報的 2 個原始正式環境 BUG，在正式站 `https://projed-cc78d.web.app/` 以臨時 Supabase 測試帳號完成 authenticated UI smoke，未重現卡住或任務消失。

不得過度宣稱：7 點延伸風險矩陣尚未全部以人工 / 自動化 production smoke 關閉，尤其 member stale、tag stale、Google Calendar REST timeout、MindMap 跨裝置語意仍需後續專項驗證。

## 本輪已驗證範圍

- 已發生 BUG 1：新增會議記錄 > 匯入 > 整理專案變化，本機 browser gate 與正式站 authenticated UI smoke 通過，正式站已整理 1 筆任務變化並產生預覽，未觀察到卡住。
- 已發生 BUG 2：全域任務平台新增未歸位任務，切換看板後仍保留，本機 browser gate 與正式站 authenticated UI smoke 通過。
- MindMap regression：DEV-027G browser gate 原先因 click-to-details modal 攔截而失敗；已改為驗證腳本在用 click 輔助選取時關閉合法開啟的詳情 modal，並保留產品 click-to-details 規格。
- Source-level release gate：`verify:source` 通過。
- Production release gate：Firebase Hosting deploy 成功，正式 URL 載入新 bundle `index-CZrWLuKx.js`，post-deploy browser smoke 無 console error、pageerror 或 failed request。

## Production Release Evidence - 2026-07-03

| Gate | Result | Evidence |
|---|---|---|
| Release commit | Pass | `42aa451d5ddaa4190bbd3216b60626d7195f67bd` / branch `codex/正式環境BUG修正` |
| Branch push | Pass | `origin/codex/正式環境BUG修正` |
| Build artifact | Pass | `dist/index.html` loads `/assets/index-CZrWLuKx.js` and `/assets/index-CwzdflxX.css` |
| Pre-deploy preview smoke | Pass | `http://127.0.0.1:4174/` app shell loaded `index-CZrWLuKx.js`; no console/pageerror/failed request |
| Supabase P5 CRUD/dependency smoke | Pass | Temporary user/tenant/project/WBS/dependency create/update/delete passed and cleaned |
| Supabase P6 readiness | Pass | Production Supabase host reachable; Google OAuth authorize URL generated with redirect `https://projed-cc78d.web.app/` |
| Firebase deploy | Pass | `npx firebase deploy --only hosting --project projed-cc78d --non-interactive`; Hosting URL `https://projed-cc78d.web.app` |
| Post-deploy HTTP artifact check | Pass | `https://projed-cc78d.web.app/` and `https://projed-cc78d.firebaseapp.com/` HTTP 200; `index-CZrWLuKx.js` present; old `index-BCr1zfI2.js` absent |
| Post-deploy browser smoke | Pass | Title `ProJED 3.0 | 專案管理系統`; root shell non-empty; no console/pageerror/failed request |
| OAuth start smoke | Pass | Google login redirects to Google account page via Supabase OAuth; no pageerror / failed request before credential entry |
| `npm run verify:dev-040-production-auth-ui-smoke` | Pass | Temporary Supabase test account + tenant + 2 boards + activity event; project import resolved with 1 activity preview; unplaced task remained after board switch; cleanup deleted tenant/user |

## 7 點覆蓋矩陣

| 風險點 | QA case | 本輪 evidence | 判定 |
|---|---|---|---|
| 備份匯入後 dependencies 消失 | QA-P0-001 / QA-P0-002 | `verify:source`、Supabase static gate、P5 production Supabase dependency CRUD smoke；未執行完整備份匯入 + DB count | Production DB dependency smoke passed / backup import pending |
| RAG / 知識檢索 timeout 卡住 | QA-P0-003 / QA-P0-004 / QA-P0-005 | `verify:p9-edge-function` via `verify:source`；未執行 production timeout / 401 / 500 browser injection | Partially covered / timeout injection pending |
| 新增看板 temp id race | QA-P1-001 / QA-P1-002 / QA-P1-003 | `verify:source` core regression；正式 authenticated UI smoke 覆蓋 board switch 後未歸位任務保留；未執行 rapid board create + backend failure injection | Partially covered / board-create race pending |
| member stale response | QA-P1-004 / QA-P1-005 | 未觸及 member implementation；未執行 A/B board delayed response proof | Pending |
| tag stale response | QA-P1-006 / QA-P1-007 | 未觸及 tag implementation；未執行 workspace A/B delayed response proof | Pending |
| Google Calendar timeout | QA-P2-001 / QA-P2-002 / QA-P2-003 / QA-P2-004 | `verify:calendar-feed-ics` via `verify:source`；OAuth start smoke passed；未執行 Google Calendar REST timeout browser proof | Partially covered / external REST timeout pending |
| MindMap localStorage-only 語意 | QA-P2-005 / QA-P2-006 | `verify:dev-027g-mindmap-system-health`、`verify:dev-027g-mindmap-system-health-browser`、`verify:dev-027d-mindmap-date-display-filter-browser`；未取得產品決策是否升級雲端同步 | Local regression passed / product decision pending |

## 指令證據

| Gate | Result | Evidence |
|---|---|---|
| `npx tsc --noEmit` | Pass | TypeScript 無錯誤 |
| `npm run lint` | Pass with warnings | 0 errors / 65 warnings，warnings 為既有 React hooks / unused 類警告 |
| `npm run build` | Pass | production build 成功，initial app chunk 367.74 kB |
| `npm run verify:source` | Pass | lint + tsc + build + production-auth + Supabase static + calendar ICS + core regression + P9 edge function |
| `npm run verify:dev-011-ai-meeting-synthesis` | Pass | AI meeting synthesis contract 通過 |
| `npm run verify:dev-020-record-workflow-redesign` | Pass | record workflow redesign static gate 通過 |
| `npm run verify:dev-020-project-change-import-browser` | Pass | project change import browser gate 通過 |
| `npm run verify:dev-039-task-workbench-placement-lanes` | Pass | 19/19 |
| `npm run verify:dev-039-task-workbench-placement-lanes-browser` | Pass | 未歸位 / 已歸位 placement lane browser gate 通過 |
| `npm run verify:dev-027g-mindmap-system-health` | Pass | 95/95 |
| `npm run verify:dev-027g-mindmap-system-health-browser` | Pass | baseline / wheel zoom / middle pan 截圖產生 |
| `npm run verify:dev-027g-mindmap-bundle-health` | Pass | 9/9 |
| `npm run verify:dev-027d-mindmap-date-display-filter-browser` | Pass | date/filter browser gate 通過 |
| `npm run verify:dev-028-cross-mode-task-interactions` | Pass | 35/35 |
| `npm run verify:dev-028-cross-mode-task-interactions-browser` | Pass | click-to-details / mode-aware keyboard browser gate 通過 |
| `npm run verify:dev-040-production-auth-ui-smoke` | Pass | 正式站 authenticated UI smoke 通過；臨時 Supabase tenant/user 已清理 |

## 截圖證據

- `output/playwright/dev-020-record-workflow-1440.png`
- `output/playwright/dev-020-record-workflow-1024.png`
- `output/playwright/dev-039-task-workbench-placement-lanes-mobile.png`
- `output/playwright/dev-027G-system-health-baseline.png`
- `output/playwright/dev-027G-system-health-wheel-zoom.png`
- `output/playwright/dev-027G-system-health-middle-pan.png`
- `output/playwright/dev-027D-mindmap-date-filter.png`

## 未驗證 / 不得宣稱

- 未執行正式資料修復；本輪也沒有需要修復的既有正式資料。
- 未執行完整備份匯入 + DB count。
- 未驗證正式 Google Calendar REST API timeout。
- 未驗證 production-like Supabase 慢查詢、RAG timeout、member stale response、tag stale response 的完整 7 點人工矩陣。
- 未執行 MindMap localStorage-only 語意的跨裝置 / 清快取產品決策驗證。

## QC 判定

- Local automated QC: Pass.
- P0 local addendum QC: Pass; 2026-07-07 remote read-only preflight executed; Edge deploy、production timeout injection 與完整 DB count smoke 尚未執行。
- Production release: Deployed.
- Production QC for original 2 BUG flows: Pass.
- Extended 7-point risk matrix: Partially covered; remaining items listed above require separate targeted validation.

## DEV-040 P0 addendum - 2026-07-06

本輪依使用者授權補強 Phase 1 P0 的本機 RD 範圍，未執行 production deploy、remote migration、正式資料修復或正式 timeout injection。

已完成：
- 備份匯入 dependencies persistence：`importData` 在替換 nodes 後會正規化匯入 dependencies，過濾不存在 endpoint 的 dependency，並逐筆呼叫 `dependencyService.set(currentWsId, currentBoardId, dependency)` 重建目前看板依賴；`replaceAllByProject` 失敗不再被 `.catch(console.error)` 吞掉後仍顯示成功。
- 匯入完成提示會顯示任務數與依賴數，避免 silent partial success。
- RAG client invoke 增加 `RAG_RETRIEVAL_TIMEOUT_MS`，timeout 轉成 `RAG_TIMEOUT / 504`。
- `match_project_knowledge` Edge Function source 增加 Gemini embedding、Gemini generation、database RPC、live snapshot timeout；embedding / RPC / snapshot timeout 會回傳 504，generation timeout 會走既有可見 fallback answer。
- 新增 static gate：`npm.cmd run verify:dev-040-p0-bounded-failure`。

本輪 gate：
- `npm.cmd run verify:dev-040-p0-bounded-failure`：Passed，15/15。
- `npm.cmd exec tsc -- --noEmit`：Passed。
- `npx.cmd eslint src/store/useWbsStore.ts src/services/rag/ragRetrievalService.ts`：0 errors；3 warnings 為既有 unused warnings。
- `npm.cmd run verify:p9-edge-function`：Passed。
- `npm.cmd run verify:supabase:static`：Passed。
- `npm.cmd run verify:dev-020-record-workflow-redesign`：Passed。
- `npm.cmd run verify:dev-020-project-change-import-browser`：Passed。
- `npm.cmd run build:test`：Passed。

未完成 / 不得宣稱：
- 未對 production Supabase 執行完整備份匯入 + `wbs_dependencies` DB count smoke。
- 未部署 `match_project_knowledge` Edge Function。
- 未做 production timeout / 401 / 500 browser injection。

## DEV-040 P0 remote read-only preflight - 2026-07-07

本輪只執行 read-only Supabase / Edge / advisor preflight，未套用 migration、未部署 Edge Function、未建立或搬移正式資料。

Production project / Edge facts:
- Supabase project `ProJED` / ref `knodlkxqpcqyrtgwpdst` status `ACTIVE_HEALTHY`，Postgres `17.6.1.121`。
- `ProJED_TEST` project `fhisnnufoeulxqrchldf` status `INACTIVE`，不能作為 Level 3 production-like staging。
- Edge Function `match_project_knowledge` is ACTIVE version 4, `verify_jwt=false`, sha `121f399ef1483eaf2ec08054e88082ab13451b8cc49fd8c774937b2766fdb82d`。
- Remote deployed source does not contain the local DEV-040 timeout guard constants / helpers: `GEMINI_EMBED_TIMEOUT_MS`, `GEMINI_GENERATE_TIMEOUT_MS`, `RAG_RPC_TIMEOUT_MS`, `LIVE_SNAPSHOT_TIMEOUT_MS`, `fetchWithTimeout`, `withTimeout`。

Production DB read-only facts:
- `public.wbs_dependencies` exists with RLS enabled.
- Key columns exist: `tenant_id`, `project_id`, `from_item_id`, `from_side`, `to_item_id`, `to_side`, `offset_days`, `legacy_dependency_id`.
- Constraints exist: PK, tenant/project/from/to FKs with cascade, no-self-loop check, unique `(tenant_id, project_id, legacy_dependency_id)`.
- Policies exist for authenticated board readers / writers / managers; row checks require project read/write/manage and endpoint items belonging to the same project.
- Indexes include primary key, `(tenant_id, project_id)` and legacy dependency unique index.
- Current production count from read-only SQL: `wbs_dependencies_count = 5`.
- `public.match_project_knowledge(target_tenant_id uuid, target_project_id uuid, query_embedding vector, match_threshold double precision, match_count integer)` exists; `anon_execute=false`, `authenticated_execute=true`, `service_role_execute=true`; source mentions tenant/project filters and similarity.

Advisor facts:
- Security advisors still report existing SECURITY DEFINER and search_path warnings. The DEV-040 read-only check did not add DDL and did not change these warnings.
- Performance advisors include existing unindexed FK warnings for `public.wbs_dependencies` on `from_item_id`, `project_id`, and `to_item_id`; this is a future DB hardening candidate, not a read-only preflight blocker.

QC判定:
- Production DB substrate for dependency persistence is present.
- DEV-040 P0 RAG timeout is not live-complete because remote Edge Function still runs the pre-addendum source.
- The next safe action is either a Level 3 production-like Edge smoke path followed by Edge deploy, or explicit risk acceptance for deploying without Level 3. After deploy, production timeout / 401 / 500 smoke remains required before closing RAG timeout.
