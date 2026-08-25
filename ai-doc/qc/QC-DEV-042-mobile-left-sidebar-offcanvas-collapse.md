# QC-DEV-042: 手機與桌機共用左側 Inline 面板事實驗證

關聯 DEV: DEV-042
關聯 SPEC: `ai-doc/specs/SPEC-042-mobile-left-sidebar-offcanvas-collapse.md`
關聯 QA: `ai-doc/qa/QA-DEV-042-mobile-left-sidebar-offcanvas-collapse.md`
狀態: 2026-08-24 Shared Inline Layout Rework Width Alignment Local QC Passed / Production Not Deployed / Physical Phone Supplemental Not Executed；2026-07-06 Off-Canvas Production Evidence 僅為歷史版本
建立日期: 2026-07-05

## 驗證結論

- 判定：Local QC Passed。Shared Inline 實作確認手機與桌機共用 `Sidebar`、`TaskWorkbenchPanel`，且兩者在 390x844／320x844 的 computed width 分別一致為 340px／272px。
- Sidebar／Workbench 與 Board 邊界相接，面板開啟會縮小相鄰 main／Board；共同 width helper 與 viewport clamp 已由 static、browser 及 rendered screenshots 證實。
- 未歸位任務已用真實 touch lifecycle 從 inline Workbench 拖入右側看板，`boardId` 由 `__task_workbench_unplaced__` 變更為 `local-test-mobile-ui-board`，`terminal:complete` 只有 1 筆；已歸位列仍無 drag ownership。
- 限制：本輪未部署 production，未執行本增補後的實體 iOS／Android 補充驗證；2026-07-06 production／真機通過證據只代表已被取代的 Off-Canvas 版本。

## 2026-08-24 Shared Inline Rework Width Alignment 執行證據（目前權威）

| Gate | Result | Evidence |
|---|---|---|
| `npm.cmd run verify:dev-042-mobile-left-sidebar-offcanvas` | Pass, 22/22 | 同一元件、inline flow、無 overlay/backdrop、Sidebar／Workbench 共用 width helper 與 viewport clamp、文件契約 |
| `npm.cmd run verify:dev-042-mobile-left-sidebar-offcanvas-browser` | Pass, 8/8 | 390／320 mobile computed width 一致、1440 desktop、雙面板、Escape、visible-error；rendered screenshots 已更新 |
| `npm.cmd run verify:dev-054-mobile-task-drag-precision` | Pass, 45/45 | Workbench unplaced 允許 direct board target；column body 為 mobile drop target；placed row 仍 readonly |
| `npm.cmd run verify:dev-054-mobile-task-drag-precision-browser` | Pass, 15/15 | R15 跨 inline 分欄命中 `qc-card-1`、歸位至 active board、exactly-once；console/network error 0 |
| `npm.cmd run verify:dev-039-task-workbench-placement-lanes` | Pass, 31/31 | placement lane、shared context menu、inline closed/open 契約 |
| `npm.cmd run verify:dev-029-mobile-pan-first-interactions` | Pass, 39/39 | mobile pan-first 靜態回歸 |
| `npx.cmd tsc --noEmit --pretty false` | Pass | exit 0 |
| Targeted ESLint | Pass | exit 0，無輸出 |
| `npm.cmd run build:test` | Pass | Vite test build 完成；僅 caniuse-lite 時效 warning |
| `git diff --check` | Pass | 僅 LF/CRLF 通知，無 whitespace error |

關鍵 UI 證據：

- `output/playwright/dev-042-mobile-left-sidebar-offcanvas-1787572120319-mobile-sidebar-inline.png`
- `output/playwright/dev-042-mobile-left-sidebar-offcanvas-1787572120319-mobile-workbench-inline.png`
- `output/playwright/dev-042-mobile-left-sidebar-offcanvas-1787572120319-mobile-320-inline.png`
- `output/playwright/dev-042-mobile-left-sidebar-offcanvas-1787572120319-desktop-sidebar-workbench-inline-side-by-side.png`
- `output/playwright/dev-054-mobile-drag-1787572317649-R15-workbench-to-inline-board.png`

## RD 修正事實（2026-07 Off-Canvas 歷史版本）

- `src/components/Sidebar.tsx`：mobile / coarse pointer closed state 不再回傳 in-flow collapsed rail；expanded state 改為 fixed overlay drawer，支援 backdrop click 與 `Escape`。
- `src/components/Sidebar.tsx`：expanded Sidebar 不再保留 `全域任務平台` 重複入口；底部僅保留 `紀錄庫` 與 `設定`。
- `src/components/TaskWorkbenchPanel.tsx`：closed state 不再渲染 in-flow `w-6` rail；expanded state 使用 overlay drawer。
- `src/components/MainLayout.tsx`：top nav menu button 補 `aria-label` 與 `data-main-sidebar-toggle="true"`；top nav `data-mobile-task-workbench-nav-entry="true"` 作為全域任務平台唯一入口；`main` 補 `data-app-main="true"` 供寬度驗證。
- `src/components/Wbs/TaskDragHandle.tsx`：drag disabled / mobile pass-through 模式加上 `touchAction: pan-x pan-y`，避免 DEV-029 手機拖曳把手短滑 pan 回歸。
- `scripts/verify-dev-039-task-workbench-placement-lanes-browser.pw.js`：mobile section 從舊 collapsed rail 契約更新為 DEV-042 no in-flow rail + top nav entry + Workbench overlay 契約。
- `scripts/verify-dev-029-mobile-pan-first-interactions-browser.pw.js`：mobile workbench 開啟入口改走 top nav entry，避免 Sidebar 內重複入口回流。

## 2026-08-24 手機預設開啟與 234px 寬度增補事實（歷史契約，已被 Shared Inline 取代）

- `src/components/TaskWorkbenchPanel.tsx`：手機 `mobileOverlayOpen` 預設開啟契約維持；本輪將 mobile overlay 寬度調整為 `min(234px, calc(100vw - 128px))`，桌面仍使用 `panelPrefs.open` 與原 `panelWidth`。
- Static gate：`npm.cmd run verify:dev-042-mobile-left-sidebar-offcanvas`，Pass 20/20。
- Browser gate：`npm.cmd run verify:dev-042-mobile-left-sidebar-offcanvas-browser`，Pass 9/9；390×844 實測 `234px`，320×844 實測 `192px` 並保留 128px 安全邊距，1440×900 desktop regression 同步通過。
- TypeScript、targeted ESLint、`build:test`：Pass。
- UI evidence：`output/playwright/dev-042-mobile-left-sidebar-offcanvas-1787564070988-mobile-default-open.png`、`output/playwright/dev-042-mobile-left-sidebar-offcanvas-1787564070988-mobile-320-safe-width.png`；390×844 工作台以 234px overlay 首屏可見，320×844 安全縮為 192px；標題、收合鍵、篩選、任務列與日期均可讀，main / Board canvas 沒有被重新縮窄，無可見重疊、截斷或水平 overflow。
- Visible error sweep：0 console errors，無 `.inline-error`、`[role=alert]`、HTTP 4xx/5xx 或 route error text。
- Visible error sweep：0 console errors，無 `.inline-error`、`[role=alert]`、HTTP 4xx/5xx 或 route error text。
- 證據邊界：本輪未部署 production、未執行 physical-phone supplemental；既有 2026-07-06 production／真機證據不得代替本增補的正式環境驗證。

## 執行項目（2026-07／舊增補歷史證據）

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

## Browser Evidence（2026-07／舊增補歷史證據）

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
