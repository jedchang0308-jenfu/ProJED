# QC-DEV-042: 手機左側欄收疊零佔寬與全域任務平台 Off-Canvas 事實驗證

關聯 DEV: DEV-042
關聯 SPEC: `ai-doc/specs/SPEC-042-mobile-left-sidebar-offcanvas-collapse.md`
關聯 QA: `ai-doc/qa/QA-DEV-042-mobile-left-sidebar-offcanvas-collapse.md`
狀態: Production Release Deployed / Local + Production + User-Reported Physical Phone QC Passed
建立日期: 2026-07-05

## 驗證結論

- 判定：通過，本機 static + browser viewport matrix + regression gate 通過；2026-07-06 使用者回報 DEV-042 真機驗證通過。
- 範圍：手機與桌機 closed Sidebar / TaskWorkbench zero-width off-canvas、overlay 開啟/關閉、DEV-029 pan-first 與 DEV-039 workbench regression。
- 限制：DB/RLS/migration/RPC 或正式資料修復未執行；production deploy 與正式站 smoke 已於 2026-07-06 完成；真機 supplemental 為使用者回報通過，repo 內未附裝置錄影或瀏覽器裝置 log。

## RD 修正事實

- `src/components/Sidebar.tsx`：mobile / coarse pointer closed state 不再回傳 in-flow collapsed rail；expanded state 改為 fixed overlay drawer，支援 backdrop click 與 `Escape`。
- `src/components/Sidebar.tsx`：expanded Sidebar 不再保留 `全域任務平台` 重複入口；底部僅保留 `紀錄庫` 與 `設定`。
- `src/components/TaskWorkbenchPanel.tsx`：closed state 不再渲染 in-flow `w-6` rail；expanded state 使用 overlay drawer。
- `src/components/MainLayout.tsx`：top nav menu button 補 `aria-label` 與 `data-main-sidebar-toggle="true"`；top nav `data-mobile-task-workbench-nav-entry="true"` 作為全域任務平台唯一入口；`main` 補 `data-app-main="true"` 供寬度驗證。
- `src/components/Wbs/TaskDragHandle.tsx`：drag disabled / mobile pass-through 模式加上 `touchAction: pan-x pan-y`，避免 DEV-029 手機拖曳把手短滑 pan 回歸。
- `scripts/verify-dev-039-task-workbench-placement-lanes-browser.pw.js`：mobile section 從舊 collapsed rail 契約更新為 DEV-042 no in-flow rail + top nav entry + Workbench overlay 契約。
- `scripts/verify-dev-029-mobile-pan-first-interactions-browser.pw.js`：mobile workbench 開啟入口改走 top nav entry，避免 Sidebar 內重複入口回流。

## 執行項目

| Gate | Result | Evidence |
|---|---|---|
| `npm.cmd run verify:dev-042-mobile-left-sidebar-offcanvas` | Pass, 16/16 | static gate 覆蓋 Sidebar / TaskWorkbench / MainLayout / package scripts / docs contract |
| `npm.cmd run verify:dev-042-mobile-left-sidebar-offcanvas-browser` | Pass | mobile closed、Sidebar overlay、Workbench overlay、desktop collapsed rails |
| `npm.cmd run verify:dev-039-task-workbench-placement-lanes-browser` | Pass | placement lanes browser regression，mobile contract 已更新 |
| `npm.cmd run verify:dev-039-task-workbench-cross-board-source-browser` | Pass | cross-board source browser regression |
| `npm.cmd run verify:dev-029-mobile-pan-first-interactions-browser` | Pass | mobile pan-first / workbench row / desktop click matrix |
| `npm.cmd run verify:dev-029-mobile-pan-first-interactions` | Pass, 32/32 | static mobile pan-first gate |
| `npm.cmd exec tsc -- --noEmit` | Pass | no TypeScript output, exit code 0 |
| `git diff --check` | Pass with LF/CRLF warnings only | no whitespace error |
| `npm.cmd run build:test` | Pass | Vite test build completed; Browserslist data warning only |

## Browser Evidence

Screenshots:

- `output/playwright/dev-042-mobile-left-sidebar-offcanvas-1783263537691-mobile-closed.png`
- `output/playwright/dev-042-mobile-left-sidebar-offcanvas-1783263537691-mobile-sidebar-overlay.png`
- `output/playwright/dev-042-mobile-left-sidebar-offcanvas-1783263537691-mobile-workbench-overlay.png`
- `output/playwright/dev-042-mobile-left-sidebar-offcanvas-1783263537691-desktop-collapsed-rails.png`
- `output/playwright/dev-039-task-workbench-placement-lanes-mobile.png`
- `output/playwright/dev-039-task-workbench-cross-board-source.png`

QC interpretation:

- Mobile closed state：未渲染 `[data-sidebar-panel="collapsed"]` 與 `[data-task-workbench-panel="collapsed"]`，主內容不再被兩條左側 rail 推擠。
- Mobile Sidebar open：`[data-mobile-sidebar-overlay="true"]` visible，drawer 覆蓋主內容而非改變 main / board canvas width。
- Mobile Workbench open：`[data-mobile-task-workbench-overlay="true"]` visible，工作台可從 Sidebar 入口開啟且 Sidebar overlay 會關閉。
- Desktop collapsed state：Sidebar compact rail 與 TaskWorkbench compact rail 仍保留，符合桌機操作語意。

## Physical Phone Supplemental Evidence - 2026-07-06

| Gate | Result | Evidence |
|---|---|---|
| Physical-phone supplemental | Pass | 使用者回報「DEV-042 真機驗證 通過」；DEV-042 physical-phone supplemental gate 解除。 |

## 未執行與殘留風險

- DB schema / migration / RLS / RPC 未涉及；本 DEV 為 layout/UI contract。
- RecordSidebar / RagSidebar mobile redesign 不在本 DEV scope。

## Production Release Evidence - 2026-07-06

| Gate | Result | Evidence |
|---|---|---|
| Release boundary | Pass | Branch `持續優化1`; release commit `b78540e`; Firebase Hosting project `projed-cc78d`; rollback target is previous Firebase Hosting release in project console. |
| Build | Pass | `npm.cmd run build`; generated `dist/assets/index-BU14rK7W.js` and `dist/assets/index-CYqvildz.css`; non-blocking Browserslist/caniuse-lite warning only. |
| Pre-deploy preview smoke | Pass | `http://127.0.0.1:4174/` loaded expected JS/CSS, root was non-empty, service worker ready, no critical console/pageerror/failed request. |
| Deploy | Pass | `node_modules\.bin\firebase.cmd deploy --only hosting --project projed-cc78d --non-interactive`; 32 files found in `dist`, 17 new uploads, version finalized and released. |
| Post-deploy HTTP artifact check | Pass | `https://projed-cc78d.web.app/` and `https://projed-cc78d.firebaseapp.com/` returned HTTP 200 and referenced `/assets/index-BU14rK7W.js` + `/assets/index-CYqvildz.css`; old `/assets/index-BXtRfIba.js` absent. |
| Post-deploy browser smoke | Pass | Production URL `https://projed-cc78d.web.app/`; app shell non-empty login shell; loaded `/assets/index-BU14rK7W.js`; no critical console/pageerror/failed request. |
| Authenticated production UI smoke | Pass | `npm.cmd run verify:dev-040-production-auth-ui-smoke`; temporary Supabase user/tenant created and cleaned; app loaded after authenticated session injection. |
