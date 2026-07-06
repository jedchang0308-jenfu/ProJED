# QA-DEV-042: 手機左側欄收疊零佔寬與全域任務平台 Off-Canvas 驗證計畫

關聯 DEV：DEV-042
關聯 SPEC：`ai-doc/specs/SPEC-042-mobile-left-sidebar-offcanvas-collapse.md`
狀態：Production Release Deployed / Local + Production Smoke Passed / User-Reported Physical Phone Supplemental Passed
建立日期：2026-07-05

## 驗證目標

確認手機版左側導覽與全域任務平台在收疊狀態下不再保留 in-flow rail，不壓縮主看板內容；展開時以 overlay / drawer 顯示，關閉後回到完整主畫面。桌機版仍保留既有 compact rail 能力，且不得破壞 DEV-029 mobile pan-first 與 DEV-039 工作台行為。

使用思考習慣：#目的、#限制條件、#可驗證性

## Zero-Tolerance Failures

- `320px` 或 `390px` mobile viewport 收疊狀態仍可看到兩條左側垂直 rail。
- Mobile collapsed `Sidebar` 仍在 flex layout 中佔 `w-10` 或任何非零寬度。
- Mobile collapsed `TaskWorkbenchPanel` 仍在 BoardView flex layout 中佔 `w-6` 或任何非零寬度。
- TaskWorkbench 數字 badge 在 mobile collapsed state 外溢、裁切或貼在主內容邊界。
- 開啟 Sidebar / TaskWorkbench overlay 時，Board canvas 被重新縮窄，而不是被 overlay 暫時覆蓋。
- 關閉 overlay 後留下空白 gutter、垂直 border、focus trap 或不可點擊遮罩。
- 移除 mobile rails 後，使用者無法打開 Sidebar 或全域任務平台。
- 出現 horizontal overflow。
- DEV-029 手機短滑 pan、quick tap 開詳情、長按 action rail 失效。
- DEV-039 工作台 placement lanes、filter popover、cross-board source 行為失效。

## Static Verification

Recommended gate：

```powershell
npm.cmd run verify:dev-042-mobile-left-sidebar-offcanvas
```

| Case | 檢查項目 | 預期 |
|---|---|---|
| QA-042-S01 | `Sidebar.tsx` collapsed mobile branch | mobile / coarse pointer 下不使用 in-flow `w-10` rail |
| QA-042-S02 | `Sidebar.tsx` desktop branch | desktop collapsed rail 仍可存在，寬度不超過 `40px` |
| QA-042-S03 | `TaskWorkbenchPanel.tsx` narrow collapsed branch | `isNarrowViewport && !mobileOverlayOpen` 不回傳 in-flow `w-6` aside |
| QA-042-S04 | Workbench mobile entry | 若新增入口，使用 fixed / absolute button，不佔 flex layout width，且有 selector / aria-label |
| QA-042-S05 | Overlay dismissal | Sidebar / Workbench overlay 有 close button、backdrop click 或 Escape handling |
| QA-042-S06 | Focus safety | hidden mobile collapsed controls 不留可 tab focus 的 descendants |
| QA-042-S07 | Scope guard | 不修改 DB schema、RLS、RPC、migration、profile/save/copy 工作台功能 |
| QA-042-S08 | Regression selectors | 保留或替代 `data-sidebar-task-workbench-button`、`data-task-workbench-*` 主要 selectors |

## Browser Verification

Recommended gate：

```powershell
npm.cmd run verify:dev-042-mobile-left-sidebar-offcanvas-browser
```

| Case | Viewport | 操作 | 預期 |
|---|---|---|---|
| QA-042-B01 | 320x844 | 載入 BoardView，Sidebar closed，Workbench closed | 左側無 in-flow rail；主內容 left edge <= 4px；無 horizontal overflow |
| QA-042-B02 | 390x844 | 同上 | 不出現兩條垂直欄；看板任務可見寬度接近 full viewport |
| QA-042-B03 | 430x932 | 點 top nav menu 開 Sidebar | Sidebar 以 overlay drawer 顯示；main / board canvas computed width 不縮小 |
| QA-042-B04 | 430x932 | 關閉 Sidebar overlay | 回到零佔寬 collapsed state；無遮罩殘留 |
| QA-042-B05 | 390x844 | 開啟全域任務平台 | Workbench 以 overlay drawer 顯示；main / board canvas computed width 不縮小 |
| QA-042-B06 | 390x844 | 關閉全域任務平台 | 不留下 `w-6` rail、count badge 或左側 gutter |
| QA-042-B07 | 390x844 | 在 BoardView 短滑任務卡與空白處 | DEV-029 pan-first 不誤開詳情、不誤觸 overlay |
| QA-042-B08 | 390x844 | 長按任務 | DEV-029 mobile action rail 仍位於頂部且不被 Sidebar / Workbench entry 遮蔽 |
| QA-042-B09 | 768x1024 | 檢查 tablet narrow behavior | 依 RD breakpoint contract：若走 mobile branch，不佔寬；若走 desktop branch，rail 寬度受控且無 overflow |
| QA-042-B10 | 1440x900 | Sidebar / Workbench collapsed | desktop compact rails 可用：Sidebar <= 40px，Workbench <= 24px，count badge 不撐寬 |
| QA-042-B11 | 390x844 | Keyboard Escape / overlay click | overlay 可關閉，focus 回到合理入口 |
| QA-042-B12 | 390x844 | visible error sweep | 無 `.inline-error`、`[role=alert]`、visible 4xx/5xx、route error text |

## Regression Gate

```powershell
npm.cmd run verify:dev-039-task-workbench-placement-lanes-browser
npm.cmd run verify:dev-039-task-workbench-cross-board-source-browser
npm.cmd run verify:dev-029-mobile-pan-first-interactions-browser
npm.cmd run verify:dev-029-mobile-pan-first-interactions
npm.cmd exec tsc -- --noEmit
npm.cmd run build:test
```

## Local QC Evidence - 2026-07-05

- `npm.cmd run verify:dev-042-mobile-left-sidebar-offcanvas` passed，16/16。
- `npm.cmd run verify:dev-042-mobile-left-sidebar-offcanvas-browser` passed。
- `npm.cmd run verify:dev-039-task-workbench-placement-lanes-browser` passed；mobile section 已改為 no in-flow rail / Sidebar entry / Workbench overlay 契約。
- `npm.cmd run verify:dev-039-task-workbench-cross-board-source-browser` passed。
- `npm.cmd run verify:dev-029-mobile-pan-first-interactions-browser` passed；同時覆蓋手機工作台入口、row pan、long press action rail、桌機 click regression。
- `npm.cmd run verify:dev-029-mobile-pan-first-interactions` passed，32/32。
- `npm.cmd exec tsc -- --noEmit` passed。
- `git diff --check` passed；僅 LF/CRLF warning。
- `npm.cmd run build:test` passed；Vite 僅提示 Browserslist/caniuse-lite 資料偏舊。
- Screenshot evidence:
  - `output/playwright/dev-042-mobile-left-sidebar-offcanvas-1783263537691-mobile-closed.png`
  - `output/playwright/dev-042-mobile-left-sidebar-offcanvas-1783263537691-mobile-sidebar-overlay.png`
  - `output/playwright/dev-042-mobile-left-sidebar-offcanvas-1783263537691-mobile-workbench-overlay.png`
  - `output/playwright/dev-042-mobile-left-sidebar-offcanvas-1783263537691-desktop-collapsed-rails.png`

## Manual UX Review

- 5 秒內可理解手機目前是主看板畫面，不被側欄佔走主要版面。
- 開啟側欄的入口清楚，但不常駐吃掉內容寬度。
- 使用者可順利從 Sidebar 進入設定 / 工作區 / 全域任務平台。
- Workbench overlay 看起來是暫時工具，不像永久壓縮主畫面的第二欄。
- 關閉 overlay 後主畫面不跳動、不留下空白左欄。

## Visual FMEA

| Risk | Severity | Detection | Mitigation |
|---|---:|---|---|
| 移除 mobile rail 後入口不可發現 | P1 | QA-042-B03/B05 manual review | top nav menu / Sidebar 內保留工作台入口，或提供單一 fixed icon |
| Overlay 關閉後遮罩殘留 | P1 | QA-042-B04/B06/B11 | unmount backdrop; Escape / click outside reset state |
| Fixed entry 遮住任務拖曳區 | P2 | QA-042-B07/B08 | entry 避開 top mobile action rail 與 Board pan surface；必要時只放 top nav |
| Desktop compact rail 被誤刪 | P2 | QA-042-B10 | breakpoint 分支與 desktop regression screenshot |
| 320px 出現水平 overflow | P1 | QA-042-B01 | zero in-flow rails; overlay max-width; scrollWidth assertion |

## QC Handoff Evidence

QC 回報至少包含：

- DEV-042 static verifier 結果。
- DEV-042 browser verifier 結果。
- `320x844`, `390x844`, `430x932`, `768x1024`, `1440x900` 截圖。
- `main` / Board canvas / Sidebar / TaskWorkbench computed width before-after 表。
- DEV-029 mobile pan-first regression 結果。
- DEV-039 workbench placement / cross-board regression 結果。
- TypeScript 與 build:test 結果。
- 未執行項目與殘留風險。

## Deferred Verification Scope Audit

| Deferred verification | Classification | Covered by | Notes |
|---|---|---|---|
| Physical phone final hand-feel | Same Spec Phase / Complete | User-reported QC supplemental | 2026-07-06 使用者回報 DEV-042 真機驗證通過 |
| Production smoke | Passed | deployment-release-gate | 2026-07-06 Firebase Hosting production release passed artifact/browser/auth smoke |

## Production Release Evidence - 2026-07-06

| Gate | 結果 | 證據 |
|---|---|---|
| Release boundary | Pass | Branch `持續優化1`，release commit `b78540e`，Firebase project `projed-cc78d`，public directory `dist` |
| Production build | Pass | `npm.cmd run build`；main JS `dist/assets/index-BU14rK7W.js`，CSS `dist/assets/index-CYqvildz.css` |
| Production-like preview smoke | Pass | `http://127.0.0.1:4174/` 載入 expected bundle，root non-empty，service worker ready，無 critical console/pageerror/failed request |
| Firebase deploy | Pass | `node_modules\.bin\firebase.cmd deploy --only hosting --project projed-cc78d --non-interactive`；正式 URL `https://projed-cc78d.web.app` |
| Post-deploy production smoke | Pass | 正式站 HTTP artifact check 與 browser smoke 均載入 `index-BU14rK7W.js` / `index-CYqvildz.css`；authenticated production UI smoke passed |

## User-Reported Physical Phone Evidence - 2026-07-06

| Gate | 結果 | 證據 |
|---|---|---|
| Physical phone supplemental | Pass | 使用者回報「DEV-042 真機驗證 通過」；此 evidence 解除 DEV-042 physical-phone supplemental gate。 |

限制：production smoke 驗證正式 artifact 與登入後 app flow；真機 supplemental 為使用者回報通過，repo 內未附裝置錄影或瀏覽器裝置 log。

## Out of Scope / No Tracking

| Item | Classification | Covered by | Notes |
|---|---|---|---|
| RecordSidebar / RagSidebar mobile redesign | No Tracking | 無 | 非本 DEV scope；只做 regression sweep |
| DB / RLS / migration proof | No Tracking | 無 | 本 DEV 不碰資料層 |

## All-Phase QA Coverage Matrix

| Phase | QA status | Primary risk | Required verification | Stop / fail condition | Evidence owner |
|---|---|---|---|---|---|
| Phase 0 | Ready / Documentation Complete | RD 只修單一 rail，漏掉另一條 | SPEC / dev_task scope review | 文件未同時涵蓋 Sidebar 與 TaskWorkbench | PM |
| Phase 1 | Local Automated Browser QA Passed | Mobile closed state 仍佔寬 | Static + browser viewport matrix | 任一 mobile in-flow rail 非零寬 | RD / QC |
| Phase 2 | Local Automated Regression QA Passed | 手勢與工作台功能回歸 | DEV-029 / DEV-039 regression gates | pan-first、placement lane、cross-board source 任一失敗 | QA / QC |
| Phase 3 | Passed | production 與本機不一致 | deployment-release-gate | production artifact/browser/auth smoke 失敗 | release owner |
| Phase 4 | Passed | 真機手感與 browser viewport 不一致 | user-reported physical-phone supplemental | 使用者回報真機不通過 | User/QC |
