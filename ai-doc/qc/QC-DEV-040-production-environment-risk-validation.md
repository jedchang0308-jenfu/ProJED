# QC-DEV-040: 正式環境同型 BUG 風險驗證紀錄

日期: 2026-07-03
狀態: Local Automated QC Passed / Production Smoke Not Run
關聯 DEV: DEV-040
參考文件:
- `ai-doc/specs/SPEC-040-production-environment-risk-hardening.md`
- `ai-doc/qa/QA-DEV-040-production-environment-risk-validation.md`

## 驗證結論

本輪 QC 判定為 local / source / browser automated gates 通過。

不得宣稱「正式環境已修復」：尚未取得 production deploy、正式環境登入、正式 DB count、正式 Network / Console 或 rollback readiness 證據。

## 本輪已驗證範圍

- 已發生 BUG 1：新增會議記錄 > 匯入 > 整理專案變化，本機 browser gate 通過，未觀察到卡住。
- 已發生 BUG 2：全域任務平台新增未歸位任務，切換看板後仍保留，本機 browser gate 通過。
- MindMap regression：DEV-027G browser gate 原先因 click-to-details modal 攔截而失敗；已改為驗證腳本在用 click 輔助選取時關閉合法開啟的詳情 modal，並保留產品 click-to-details 規格。
- Source-level release gate：`verify:source` 通過。

## 7 點覆蓋矩陣

| 風險點 | QA case | 本輪 evidence | 判定 |
|---|---|---|---|
| 備份匯入後 dependencies 消失 | QA-P0-001 / QA-P0-002 | `verify:source`、Supabase static gate；未執行 production-like 匯入 + DB count | Partially covered / production-like pending |
| RAG / 知識檢索 timeout 卡住 | QA-P0-003 / QA-P0-004 / QA-P0-005 | `verify:p9-edge-function` via `verify:source`；未執行 production-like timeout / 401 / 500 browser proof | Partially covered / timeout pending |
| 新增看板 temp id race | QA-P1-001 / QA-P1-002 / QA-P1-003 | `verify:source` core regression；未執行 rapid board create + backend failure injection | Partially covered / production-like pending |
| member stale response | QA-P1-004 / QA-P1-005 | 未觸及 member implementation；未執行 A/B board delayed response proof | Pending |
| tag stale response | QA-P1-006 / QA-P1-007 | 未觸及 tag implementation；未執行 workspace A/B delayed response proof | Pending |
| Google Calendar timeout | QA-P2-001 / QA-P2-002 / QA-P2-003 / QA-P2-004 | `verify:calendar-feed-ics` via `verify:source`；未執行 Google OAuth / REST timeout browser proof | Partially covered / external smoke pending |
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

## 截圖證據

- `output/playwright/dev-020-record-workflow-1440.png`
- `output/playwright/dev-020-record-workflow-1024.png`
- `output/playwright/dev-039-task-workbench-placement-lanes-mobile.png`
- `output/playwright/dev-027G-system-health-baseline.png`
- `output/playwright/dev-027G-system-health-wheel-zoom.png`
- `output/playwright/dev-027G-system-health-middle-pan.png`
- `output/playwright/dev-027D-mindmap-date-filter.png`

## 未驗證 / 不得宣稱

- 未部署 production。
- 未執行正式環境 smoke。
- 未驗證正式 Supabase DB count、RLS role matrix 或正式資料修復。
- 未驗證正式 Google OAuth / Calendar API timeout。
- 未驗證 production-like Supabase 慢查詢、RAG timeout、member stale response、tag stale response 的完整 7 點人工矩陣。
- 未執行 MindMap localStorage-only 語意的跨裝置 / 清快取產品決策驗證。

## QC 判定

- Local automated QC: Pass.
- Production QC: Not run / requires explicit authorization.
- Release readiness: Not approved for production release until deployment-release-gate and production smoke are complete.
