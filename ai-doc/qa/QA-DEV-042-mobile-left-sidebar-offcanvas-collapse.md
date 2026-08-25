# QA-DEV-042: 手機左側欄收疊零佔寬與全域任務平台 Off-Canvas 驗證計畫

關聯 DEV：DEV-042
關聯 SPEC：`ai-doc/specs/SPEC-042-mobile-left-sidebar-offcanvas-collapse.md`
狀態：2026-08-24 Shared Inline Layout Rework Width Alignment Local QA Passed / Production Not Deployed / Physical Phone Supplemental Not Executed；舊 Off-Canvas 證據保留為歷史版本
建立日期：2026-07-05

## 驗證目標

確認手機與桌機共用 inline 元件：`Sidebar` 與 `TaskWorkbenchPanel` 開啟時都參與 flex 排列並縮小相鄰看板，不得存在 overlay 或 backdrop；收疊後不保留 rail。不得破壞 DEV-029 mobile pan-first、DEV-039 工作台行為或未歸位任務拖入看板流程。

使用思考習慣：#目的、#限制條件、#可驗證性

## 2026-08-24 Shared Inline Rework 驗證覆寫

本節為目前權威 QA；下方舊版中所有要求 mobile overlay、backdrop、234px、128px gutter 或預設強制開啟的案例只保留歷史，不得用來判定目前版本失敗。

目前零容忍失敗：

- 手機 Sidebar 或 TaskWorkbench 出現 `position: fixed`、overlay selector、dimming backdrop，或以 z-index 覆蓋 Board canvas。
- 手機開啟面板後，main／Board 寬度與開啟前相同，表示面板仍是覆蓋而非 inline reflow。
- 手機與桌機使用不同內容元件、重複狀態或新增 mobile-only Sidebar／Workbench 元件。
- inline 面板與 Board canvas 左右邊界不相接、彼此重疊、留下空白 gutter，或文件層出現水平 overflow。
- `320x844` 開啟單一面板後可見看板寬度小於 47px。
- 同一 mobile viewport 下 Sidebar 與 TaskWorkbench computed width 差距超過 `1px`，或兩者沒有共用同一 width helper／viewport clamp。
- 未歸位工作台任務長按後無法命中右側看板卡片／欄內空白區，或已歸位工作台列變成可拖來源。

目前 browser cases：

| ID | Viewport | 操作 | 通過標準 |
|---|---|---|---|
| QA-042-B01 | 390x844 | 開啟工作區與看板 | 同一 `Sidebar` inline，computed width `340px`；main 左移量與寬度差等於面板寬；overlay/backdrop=0 |
| QA-042-B02 | 390x844 | 開啟全域任務平台 | 同一 `TaskWorkbenchPanel` inline，computed width `340px`；Board 左界接在面板右界；overlay/backdrop=0 |
| QA-042-B03 | 390x844 | 依序切換兩面板 | 維持共用 inline 元件且 mobile 互斥，不產生第二套 overlay UI |
| QA-042-B04 | 390x844 | Escape 關閉兩面板 | 面板 unmount、看板寬度恢復、無 rail／backdrop 殘留 |
| QA-042-B05A | 320x844 | 分別開啟 Sidebar／工作台 | 兩者 computed width 同為 `272px`、共用 viewport clamp、看板至少 47px、無水平 overflow |
| QA-042-B10/B11 | 1440x900 | 單面板及雙面板 | 桌機 inline／resize／相鄰邊界契約不回歸 |
| QA-054-R15 | 390x844 | 未歸位任務長按拖到看板 | 看板落點可見並只提交一次；placed row 仍不可拖 |

目前執行結果：DEV-042 static `22/22`、browser `8/8`、DEV-054 static `45/45`、browser `15/15`、DEV-039 `31/31`、DEV-029 `39/39`、TypeScript、targeted ESLint、`build:test` 與 `git diff --check` 均通過。390x844 兩面板 computed width 均為 `340px`，320x844 均為 `272px`；實體 iOS／Android 補充驗證與 production release 未執行。

## 歷史 Zero-Tolerance Failures（已由上方 Shared Inline Rework 覆寫）

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
- `<= 767px` 重新載入 BoardView 時，全域任務平台未預設開啟，或被已儲存的 `open=false` 壓回關閉。
- `1440x900` 桌面版因本增補而忽略既有 `open=false` 偏好並強制開啟工作台。
- 手機 Workbench overlay 在 390px viewport 實測偏離 `234px ± 1px`，或在 320px viewport 未保留 `128px` 安全邊距。
- `320x844` 窄版 Workbench overlay 實測應為 `192px ± 1px`，並不得造成水平 overflow。
- 寬度調整後標題、過濾器、收合鍵、任務列或日期出現截斷、重疊或水平 overflow。

## 歷史 Static Verification（Off-Canvas 版本）

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
| QA-042-S09 | Mobile default-open initialization | `mobileOverlayOpen` 由窄版 viewport 初始化，帳號偏好 hydration 不得以 `open=false` 覆寫；桌面 `panelPrefs.open` 不變 |
| QA-042-S10 | Mobile overlay safe width | 窄版 `panelOverlayWidth` 使用 `min(234px, calc(100vw - 128px))`；桌面仍直接使用完整 `panelWidth` |

## 歷史 Browser Verification（Off-Canvas 版本）

Recommended gate：

```powershell
npm.cmd run verify:dev-042-mobile-left-sidebar-offcanvas-browser
```

| Case | Viewport | 操作 | 預期 |
|---|---|---|---|
| QA-042-B01 | 390x844 | 預先儲存 Workbench `open=false` 後重新載入 BoardView | Workbench 仍預設開啟且寬 `234px ± 1px`；Sidebar 不同時開啟；main / board 不被縮窄；無 horizontal overflow |
| QA-042-B02 | 390x844 | 關閉預設開啟的 Workbench | 不出現 in-flow rail 或左側 gutter；看板回到完整 viewport 寬度 |
| QA-042-B03 | 430x932 | 點 top nav menu 開 Sidebar | Sidebar 以 overlay drawer 顯示；main / board canvas computed width 不縮小 |
| QA-042-B04 | 430x932 | 關閉 Sidebar overlay | 回到零佔寬 collapsed state；無遮罩殘留 |
| QA-042-B05 | 390x844 | 開啟全域任務平台 | Workbench 以 234px overlay 顯示；main / board canvas computed width 不縮小 |
| QA-042-B06 | 390x844 | 關閉全域任務平台 | 不留下 `w-6` rail、count badge 或左側 gutter |
| QA-042-B07 | 390x844 | 在 BoardView 短滑任務卡與空白處 | DEV-029 pan-first 不誤開詳情、不誤觸 overlay |
| QA-042-B08 | 390x844 | 長按任務 | DEV-029 mobile action rail 仍位於頂部且不被 Sidebar / Workbench entry 遮蔽 |
| QA-042-B09 | 768x1024 | 檢查 tablet narrow behavior | 依 RD breakpoint contract：若走 mobile branch，不佔寬；若走 desktop branch，rail 寬度受控且無 overflow |
| QA-042-B10 | 1440x900 | Sidebar / Workbench collapsed | desktop compact rails 可用：Sidebar <= 40px，Workbench <= 24px，count badge 不撐寬 |
| QA-042-B11 | 390x844 | Keyboard Escape / overlay click | overlay 可關閉，focus 回到合理入口 |
| QA-042-B12 | 390x844 | visible error sweep | 無 `.inline-error`、`[role=alert]`、visible 4xx/5xx、route error text |
| QA-042-B13 | 1440x900 | 預先儲存 Workbench `open=false` 後重新載入 | Desktop Workbench 維持關閉，仍由既有偏好控制 |

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

## Mobile Default-Open + 234px Width Addendum Local QC Evidence - 2026-08-24

- `npm.cmd run verify:dev-042-mobile-left-sidebar-offcanvas`：Pass，20/20；包含手機窄版初始化不受已儲存 `open=false` 覆寫、mobile 234px 安全寬度與 desktop 原寬度靜態契約。
- `npm.cmd run verify:dev-042-mobile-left-sidebar-offcanvas-browser`：Pass，9/9；390×844 實測 overlay 寬 `234px`，320×844 實測安全縮為 `192px`；預設開啟、關閉零佔寬、Sidebar 互斥、top-nav toggle、Escape、visible-error sweep 與 1440×900 desktop inline regression 全部通過。
- `npm.cmd exec tsc -- --noEmit`：Pass。
- `npm.cmd exec eslint -- src/components/TaskWorkbenchPanel.tsx scripts/verify-dev-042-mobile-left-sidebar-offcanvas.mjs scripts/verify-dev-042-mobile-left-sidebar-offcanvas-browser.pw.js`：Pass。
- `npm.cmd run build:test`：Pass，Vite test artifact 建置完成。
- Screenshots：`output/playwright/dev-042-mobile-left-sidebar-offcanvas-1787564070988-mobile-default-open.png`、`output/playwright/dev-042-mobile-left-sidebar-offcanvas-1787564070988-mobile-320-safe-width.png`；390×844 首屏以 234px 顯示，320×844 保留 128px 安全邊距；標題、收合鍵、篩選、任務列與日期均可讀，無可見重疊、截斷或水平 overflow。
- Console：0 errors；2 warnings，visible-error gate 無 `.inline-error`、`[role=alert]`、HTTP 4xx/5xx 或 route error text。
- Production deploy 與 physical-phone supplemental 未執行；本證據只適用目前本機 source state 與 test runtime。

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
