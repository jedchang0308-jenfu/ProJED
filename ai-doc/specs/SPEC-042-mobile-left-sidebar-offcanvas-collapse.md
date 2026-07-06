# SPEC-042: 手機左側欄收疊零佔寬與全域任務平台 Off-Canvas

關聯 DEV：DEV-042
狀態：Production Release Deployed / Local + Production Smoke Passed / User-Reported Physical Phone Supplemental Passed
建立日期：2026-07-05
任務類型：UI/UX RWD regression / mobile layout contract

## Human Decision Brief

決策來源：

- 使用者以手機截圖指出：左側欄收疊後仍然佔用太多版面，手機版特別明顯。
- PM / UI 判斷：目前不是單一欄寬問題，而是主工作區側欄與全域任務平台 collapsed rail 同時留在 flex layout flow，造成 mobile 可用寬度被兩條窄欄吃掉。

已確認決策：

- 手機版 collapsed 左側導覽不得保留 in-flow rail。
- 手機版 collapsed 全域任務平台不得保留 in-flow rail 或垂直邊線控制條。
- 手機版展開側欄 / 工作台時，採 overlay / drawer 覆蓋，不推擠主內容。
- 桌機版可以保留精簡 collapsed rail，但寬度需受控，且不得回到大圖示卡片。
- 任務主畫面與看板 canvas 的可用寬度優先於保留常駐左側 icon rail。

已拒絕或不可採用：

- 手機版收合狀態仍保留 `w-10` 主側欄。
- 手機版收合狀態仍保留 `w-6` 工作台 rail。
- 同時顯示兩條垂直窄欄、兩個 chevron 或被數字 badge 撐寬的 rail。
- 用縮小字體或壓縮任務卡來彌補左欄佔寬。

AI assumptions：

- 本輪已完成 local RD implementation、DEV-042 static/browser verifier、DEV-029 / DEV-039 regression verifier 相容更新、本機 automated QA、2026-07-06 Firebase Hosting production release，並於 2026-07-06 由使用者回報 DEV-042 真機驗證通過。
- 原始程式脈絡：`Sidebar` 在 collapsed 時使用 `w-10`，`TaskWorkbenchPanel` 在 collapsed 時使用 `w-6`；兩者都位於主 layout / BoardView flex flow 內。
- Mobile 判斷沿用既有慣例並收斂為 `max-width: 767px` 或 coarse pointer 的 narrow branch；未擴大到整站 RWD 重構。
- 不涉及 DB schema、migration、RLS、RPC、正式資料修復或資料刪除。

## Problem

截圖中的實際失敗訊號：

- 左側可見兩條細長 rail：主工作區側欄 collapsed rail 與全域任務平台 collapsed rail。
- 工作台數字 badge 在窄 rail 中外溢或貼近主內容，形成視覺干擾。
- 手機版主內容被固定左欄推擠，使用者看到的是「收疊了但仍被占用空間」。
- 這違反 DEV-039 既有手機契約「工作台預設 rail 不擠出看板卡片」的使用者感知結果；即使單一 rail 變窄，兩條 rail 仍造成主要內容過窄。

真正問題：

- Mobile collapsed state 不應被當成 desktop compact state。
- Mobile 的「收疊」語意是暫時離畫布，桌機的「收疊」語意才是保留 icon rail。

## UX Intent

使用者在手機上主要要完成：

- 查看與拖曳看板任務。
- 使用主導覽切換工作區 / 設定 / 全域任務平台。
- 在需要時展開左側導覽或全域任務平台，完成後回到完整主畫面。

成功狀態：

- 手機收疊狀態下，主內容可用寬度接近完整 viewport。
- 使用者仍能透過 top nav menu 或單一浮動入口開啟側欄 / 工作台。
- 展開後使用 overlay / drawer，不讓 main canvas 重新縮窄。
- 關閉後不殘留垂直 rail、邊線、空白 gutter 或 clipped badge。

使用思考習慣：#目的、#受眾、#可驗證性

## Scope

### Phase 1 授權候選：Mobile Zero-Width Collapsed Layout

RD implementation scope：

- `src/components/Sidebar.tsx`
  - 手機 / coarse pointer collapsed 狀態不得渲染 `w-10` in-flow aside。
  - 手機展開狀態改為 fixed overlay drawer，寬度建議 `min(288px, calc(100vw - 48px))` 或符合現有設計的等效值。
  - 手機關閉入口依賴 `MainLayout` top nav menu button；若 drawer 開啟，需提供 overlay 點擊 / Esc / 關閉按鈕。
  - 桌機 collapsed 可保留 `w-10`，但不得影響 mobile。

- `src/components/TaskWorkbenchPanel.tsx`
  - `isNarrowViewport && !mobileOverlayOpen` 時不得回傳 in-flow `<aside className="w-6 ...">`。
  - 若需要保留入口，使用固定定位的單一 icon button 或 top nav / Sidebar 內入口，不得佔用 flex layout 寬度。
  - 手機展開工作台時維持 fixed overlay，並保留既有 `width: min(340px, calc(100vw - 52px))` 或等效安全寬度。
  - collapsed task count 不得以 badge 撐寬 rail；如保留 count，需進入 tooltip、aria-label 或 overlay 內呈現。

- `src/components/MainLayout.tsx`
  - 確認 top nav menu 是手機開啟主側欄的主要入口。
  - 手機主內容 `main` 不因 Sidebar collapsed 而有 left margin / shrink。
  - 若新增工作台 floating entry，需避免遮住 BoardView 主要拖曳區、Record/RAG/Update prompt 與 mobile task action rail。

- `src/components/BoardView.tsx`
  - 確認 TaskWorkbenchPanel collapsed 不再作為 flex child 佔寬後，Board canvas 仍能完整 overflow-x pan。
  - 工作台 overlay 開啟時，Board canvas 不重新 layout 成更窄；只由 overlay 遮罩暫時覆蓋。

### Out of Scope

- 不重新設計整個 Sidebar IA。
- 不更改全域任務平台資料來源、過濾器、placement lane、跨看板資料契約。
- 不修改任務卡資訊密度、手機長按 action rail 或 DEV-029 pan-first 手勢契約。
- 不新增 DB schema、RLS、migration、RPC。
- production deploy 已於 2026-07-06 另走 `deployment-release-gate` 完成；本 SPEC 不包含 DB/RLS/migration 或正式資料修復。
- 不改 RecordSidebar / RagSidebar 的手機收合邏輯，除非 regression evidence 顯示被本 DEV 破壞。

## Implementation Contract

### Breakpoint Contract

| Surface | Mobile / narrow behavior | Desktop behavior |
|---|---|---|
| Main Sidebar collapsed | `0px` layout width; no in-flow rail | compact rail allowed, max `40px` |
| Main Sidebar expanded | fixed overlay drawer; main content not resized | in-flow `w-64` allowed |
| Task Workbench collapsed | no in-flow rail; optional fixed single icon entry only | compact rail allowed, max `24px` |
| Task Workbench expanded | fixed overlay drawer; main content not resized | in-flow panel `340px` allowed |

### Required Selectors / Evidence Hooks

Existing selectors should be preserved where possible:

- `data-mobile-task-workbench-nav-entry="true"`
- `data-task-workbench-panel="true"`
- `data-task-workbench-panel="collapsed"`
- `data-task-workbench-collapsed-toggle="true"`
- `data-task-workbench-collapsed-count="true"`
- `data-task-workbench-collapse-toggle="true"`

If mobile collapsed rail is removed and a new fixed button is introduced, add equivalent selectors:

- `data-mobile-sidebar-overlay="true"`
- `data-mobile-sidebar-backdrop="true"`
- `data-mobile-task-workbench-entry="true"`
- `data-mobile-task-workbench-overlay="true"`

### Accessibility Contract

- Top nav menu button must have accessible title / aria-label for opening the workspace menu.
- Overlay / drawer must be dismissible by visible close button, overlay click, and `Escape`.
- Keyboard focus must not remain trapped on hidden collapsed rails.
- Hidden mobile collapsed sidebars must not leave focusable descendants in tab order.

## RD Acceptance

- At `320x844`, `375x844`, `390x844`, and `430x932`, with Sidebar closed and TaskWorkbench closed:
  - no visible in-flow left rail from `Sidebar`;
  - no visible in-flow left rail from `TaskWorkbenchPanel`;
  - no double vertical borders at the left edge;
  - main board content starts at viewport left edge within 4px tolerance;
  - `document.documentElement.scrollWidth <= window.innerWidth + 1`.
- At mobile viewport, opening Sidebar shows overlay drawer and does not reduce `main` / Board canvas computed width.
- At mobile viewport, opening TaskWorkbench shows overlay drawer and does not reduce `main` / Board canvas computed width.
- Closing either overlay returns to zero-width collapsed state with no leftover gutter.
- Desktop `1440x900` still supports collapsed main Sidebar rail up to `40px` and TaskWorkbench rail up to `24px`.
- Desktop collapsed TaskWorkbench count badge does not overflow, clip into main content, or widen the rail beyond `24px`.
- Existing DEV-029 mobile pan-first gestures still work after removing mobile in-flow rails.
- Existing DEV-039 workbench placement lanes, filter popover and cross-board source behavior do not regress.

## QA / QC Gate

Recommended static gate:

```powershell
npm.cmd run verify:dev-042-mobile-left-sidebar-offcanvas
```

Recommended browser gate:

```powershell
npm.cmd run verify:dev-042-mobile-left-sidebar-offcanvas-browser
```

Regression gate:

```powershell
npm.cmd run verify:dev-039-task-workbench-placement-lanes-browser
npm.cmd run verify:dev-039-task-workbench-cross-board-source-browser
npm.cmd run verify:dev-029-mobile-pan-first-interactions-browser
npm.cmd run verify:dev-029-mobile-pan-first-interactions
npm.cmd exec tsc -- --noEmit
npm.cmd run build:test
```

Local QC evidence - 2026-07-05:

- `npm.cmd run verify:dev-042-mobile-left-sidebar-offcanvas` passed，16/16。
- `npm.cmd run verify:dev-042-mobile-left-sidebar-offcanvas-browser` passed。
- `npm.cmd run verify:dev-039-task-workbench-placement-lanes-browser` passed。
- `npm.cmd run verify:dev-039-task-workbench-cross-board-source-browser` passed。
- `npm.cmd run verify:dev-029-mobile-pan-first-interactions-browser` passed。
- `npm.cmd run verify:dev-029-mobile-pan-first-interactions` passed，32/32。
- `npm.cmd exec tsc -- --noEmit` passed。
- `git diff --check` passed；僅 LF/CRLF warning。
- `npm.cmd run build:test` passed；Vite 僅提示 Browserslist/caniuse-lite 資料偏舊。
- Screenshot evidence: `output/playwright/dev-042-mobile-left-sidebar-offcanvas-1783263537691-mobile-closed.png`、`output/playwright/dev-042-mobile-left-sidebar-offcanvas-1783263537691-mobile-sidebar-overlay.png`、`output/playwright/dev-042-mobile-left-sidebar-offcanvas-1783263537691-mobile-workbench-overlay.png`、`output/playwright/dev-042-mobile-left-sidebar-offcanvas-1783263537691-desktop-collapsed-rails.png`。

Manual QC evidence required:

- `320x844`, `390x844`, `430x932`, `768x1024`, `1440x900` screenshots.
- Before / after computed width evidence for `main`, Board canvas and any collapsed sidebar element.
- Visible error sweep: no `.inline-error`, `[role=alert]`, route error, or visible 4xx/5xx text.
- Keyboard / touch evidence for open / close / overlay dismissal.

## Stop Conditions

- Mobile closed state still contains an in-flow `Sidebar` rail with nonzero width.
- Mobile closed state still contains an in-flow `TaskWorkbenchPanel` rail with nonzero width.
- Removing rails makes Sidebar or TaskWorkbench unreachable.
- Overlay opens but cannot be dismissed by touch and keyboard.
- Board canvas width shrinks when mobile Sidebar / TaskWorkbench overlay opens.
- Horizontal overflow appears on `320px` or `390px` viewport.
- DEV-029 mobile pan-first or DEV-039 workbench placement lanes regress.
- RD discovers the fix requires production deploy, DB migration, RLS/RPC change, or formal data repair; stop and request authorization.

## Deferred Scope Audit

| Deferred / Out-of-scope item | Classification | Tracking target | Required resume condition |
|---|---|---|---|
| Product code implementation | Same Spec Phase / Complete | DEV-042 Phase 1 | 本輪已完成 local RD |
| Static/browser verifier implementation | Same Spec Phase / Complete | DEV-042 Phase 1 QA support | 本輪已完成 verifier 與 regression verifier 相容更新 |
| Manual mobile QC / physical-phone check | Same Spec Phase / Complete | DEV-042 Phase 2 | 2026-07-06 使用者回報 DEV-042 真機驗證通過 |
| Production deploy | Same Spec Phase / Complete | deployment-release-gate | 2026-07-06 已由使用者授權並完成 Firebase Hosting production release |
| DB schema / migration / RLS / RPC | No Tracking | 無 | 本 DEV 是 layout/UI contract，不需要資料層變更 |
| Full Sidebar IA redesign | New DEV Candidate | Backlog if requested | 使用者另行要求重整導覽資訊架構 |
| RecordSidebar / RagSidebar mobile redesign | No Tracking | 無 | 不屬於左側欄與工作台 collapsed rail 問題 |

## All-Phase Coverage Matrix

| Phase / DEV | Authorization | Document status | Scope | Out of scope | Entry condition | Acceptance | Evidence |
|---|---|---|---|---|---|---|---|
| Phase 0 PM/RD Contract | Authorized | Complete | 文件化手機零佔寬 collapsed contract、RD/QA gate、stop conditions | 產品程式碼、測試執行、部署 | 使用者要求寫成開發文件 | SPEC / QA / dev_task / documentation_map updated | Git diff / file links |
| Phase 1 Mobile Zero-Width Collapsed Layout | Authorized / Complete | Implemented | Sidebar mobile off-canvas、TaskWorkbench mobile no in-flow rail、overlay open/close、desktop rail regression | DB、production、資料修復、整站 IA 重構 | 使用者授權 RD 開發 | Mobile closed state no in-flow rails; overlays do not resize main; desktop rails preserved | static/browser verifier、TS、build:test、screenshots |
| Phase 2 QA/QC Verification | Authorized / Complete | Local + Production Smoke Passed + User-Reported Physical Phone Passed | viewport matrix、visible error sweep、touch/keyboard open-close、DEV-029/DEV-039 regression、production artifact/browser/auth smoke、physical-phone supplemental | 無 | Phase 1 implementation complete | automated viewport/regression evidence passed；production smoke passed；使用者回報真機驗證通過 | QA-DEV-042 / QC-DEV-042 |
| Phase 3 Production Release | Authorized / Complete | Production Release Deployed | Deploy and post-deploy smoke | DB/RLS/migration、正式資料修復 | 使用者明確部署授權 | production smoke passed and rollback target recorded | deployment-release-gate / QC-DEV-042 |
