# QC-DEV-042: 手機左側欄收疊零佔寬與全域任務平台 Off-Canvas 事實驗證

關聯 DEV: DEV-042
關聯 SPEC: `ai-doc/specs/SPEC-042-mobile-left-sidebar-offcanvas-collapse.md`
關聯 QA: `ai-doc/qa/QA-DEV-042-mobile-left-sidebar-offcanvas-collapse.md`
狀態: Local Automated Browser QC Passed / Physical Phone Supplemental Not Executed / Production Not Deployed
建立日期: 2026-07-05

## 驗證結論

- 判定：通過，本機 static + browser viewport matrix + regression gate 通過。
- 範圍：手機 closed Sidebar / TaskWorkbench zero-width off-canvas、手機 overlay 開啟/關閉、桌機 compact rail 保留、DEV-029 pan-first 與 DEV-039 workbench regression。
- 限制：未執行 physical-phone 手感驗證、production deploy、正式站 smoke、DB/RLS/migration/RPC 或正式資料修復。

## RD 修正事實

- `src/components/Sidebar.tsx`：mobile / coarse pointer closed state 不再回傳 in-flow collapsed rail；expanded state 改為 fixed overlay drawer，支援 backdrop click 與 `Escape`。
- `src/components/Sidebar.tsx`：expanded Sidebar 保留 `全域任務平台` 入口，避免移除 mobile collapsed rail 後失去工作台入口。
- `src/components/TaskWorkbenchPanel.tsx`：mobile closed state 不再渲染 in-flow `w-6` rail；expanded state 使用 overlay drawer；桌機 collapsed rail 保留。
- `src/components/MainLayout.tsx`：top nav menu button 補 `aria-label` 與 `data-main-sidebar-toggle="true"`；`main` 補 `data-app-main="true"` 供寬度驗證。
- `src/components/Wbs/TaskDragHandle.tsx`：drag disabled / mobile pass-through 模式加上 `touchAction: pan-x pan-y`，避免 DEV-029 手機拖曳把手短滑 pan 回歸。
- `scripts/verify-dev-039-task-workbench-placement-lanes-browser.pw.js`：mobile section 從舊 collapsed rail 契約更新為 DEV-042 no in-flow rail + Sidebar entry + Workbench overlay 契約。
- `scripts/verify-dev-029-mobile-pan-first-interactions-browser.pw.js`：mobile workbench 開啟入口改走 Sidebar overlay，並補 sidebar overlay cleanup，避免情境切換時 backdrop 攔截桌機 regression click。

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

## 未執行與殘留風險

- Physical-phone supplemental 未執行：不得宣稱 iOS Safari / Android Chrome 真機手感已簽核。
- Production deploy 未執行：不得宣稱正式站已修正。
- Production smoke 未執行：若要發布，需另走 `deployment-release-gate`。
- DB schema / migration / RLS / RPC 未涉及；本 DEV 為 layout/UI contract。
- RecordSidebar / RagSidebar mobile redesign 不在本 DEV scope。
