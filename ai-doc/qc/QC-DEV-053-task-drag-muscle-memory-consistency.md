# QC-DEV-053：任務拖拉肌肉記憶一致化

關聯 DEV：DEV-053  
關聯 SPEC：`ai-doc/specs/SPEC-053-task-drag-muscle-memory-consistency.md`  
關聯 QA：`ai-doc/qa/QA-DEV-053-task-drag-muscle-memory-consistency.md`  
狀態：Local Static + Browser + QA True Operation Gate Passed / Production Not Deployed  
執行日期：2026-07-17

## 1. QC 結論

DEV-053 本機開發與 QA True Operation Gate 通過。T01-T14 全數 Pass，Stop Ship finding 為 0。

- 電腦版保留使用者核准的既有拖拉 UI：card overlay 仍為 240px、既有 offset、border、shadow 與 drop flow；未新增 handle、lock text、progress、breadcrumb 或 desktop action rail。
- card、checklist、column header 的 click、right-click、desktop drag 與 mobile quick tap / short pan / long press 分流通過。
- Workbench `unplaced row` 可拖入 placed lane；`placed row` 不產生 drag source，桌機反拖 no-op，手機長按無 action rail / preview / persistence，quick tap 仍開正確 details。
- mobile reorder、action rail、edge auto-scroll、touch/pointer lifecycle 與 at-most-once commit 通過。
- `touchcancel`、`pointercancel`、Escape、blur、visibility hidden 均 0 write、完整 cleanup，且可立即重啟下一個 session。
- `1024x768`、`320x844`、`390x844`、`430x932` 無 document overflow、可見錯誤、console error 或 HTTP 4xx/5xx。

Physical phone supplemental not executed。未宣稱 iOS Safari / Android Chrome 真機手感已簽核。未執行 production deploy，未修改 DB/schema/API。

## 2. 執行環境

- Repo：`C:\VIBE CODING\ProJED\ProJED`
- Route：`http://127.0.0.1:4173/`；DEV-053 / DEV-029 fixture route 為 `http://127.0.0.1:4173/?qcReset=1&qcSize=72`
- Server：`npm.cmd run dev:test:status` = `RUNNING http://127.0.0.1:4173/`，listener PID `55864`
- 核心輸入：Playwright mouse down/move/up、right click、keyboard Escape、CDP `Input.dispatchTouchEvent`、PointerEvent / blur / visibility lifecycle
- Fixture：3+ columns、72-size task fixture、checklist descendants、Workbench unplaced inbox 與 placed task

## 3. Required Commands

| Gate | 結果 | 證據 |
|---|---|---|
| DEV-053 static | Pass | `npm.cmd run verify:dev-053-task-drag-muscle-memory-consistency`，30/30 |
| DEV-053 browser | Pass | `npm.cmd run verify:dev-053-task-drag-muscle-memory-consistency-browser`，10/10 |
| DEV-029 static / browser | Pass | static 37/37；browser 38 cases，exit 0 |
| DEV-046 static / browser | Pass | static 29/29；browser 5/5，含 desktop same-column / cross-column / checklist / column drag 與 mobile surfaces |
| DEV-039 placement static / browser | Pass | static 31/31；browser exit 0，含 unplaced -> placed 與 placed reverse attempt no-op |
| DEV-028 cross-mode static / browser | Pass | static 37/37；browser exit 0 |
| DEV-044 undo static | Pass | 26/26 |
| TypeScript | Pass | `npm.cmd exec tsc -- --noEmit` |
| Test build | Pass | `npm.cmd run build:test`；1968 modules transformed |

Build 只有既有 Browserslist `caniuse-lite` stale warning，無 compile/build failure。

## 4. QA True Operation Gate

| ID | 結果 | route / viewport / 實際操作與前後狀態 | 證據 |
|---|---|---|---|
| QA-053-T01 | Pass | fixture route，1440x900；實際點擊 `qc-card-1`、`qc-card-1-child-1`、`local-col-todo`，modal task id 分別完全相同，無 move | DEV-053 B02；`output/playwright/dev-053-task-drag-1784227318907-B02-desktop-click-details.png` |
| QA-053-T02 | Pass | 1440x900；mouse drag 顯示核准 240x38 overlay；DEV-046 D02 同欄 card order 改變一次，再把 `dev046-card-b` 從 column A 移到 B，A/B DOM parent 與 order 更新一次 | DEV-053 B01、DEV-046 D02；`output/playwright/dev-053-task-drag-1784227318907-B01-desktop-approved-overlay.png`、`output/playwright/dev-046-universal-task-surface-drag-1784226973924-desktop-board.png` |
| QA-053-T03 | Pass | DEV-046 fixture，1440x900；checklist whole-surface 由 `child-b` 拖到 `child-a` 前，before/after order 反轉；無 handle-only dead zone | DEV-046 D02；desktop board screenshot 同上 |
| QA-053-T04 | Pass | fixture route，1440x900；card/checklist/header 右鍵只開 task menu；900x720 空白 board mouse drag 使 scrollLeft 增加且 task drag 不成為 board pan | DEV-053 B03、DEV-046 D04；`output/playwright/dev-053-task-drag-1784227318907-B03-desktop-context-menu.png`、`output/playwright/dev-046-universal-task-surface-drag-1784226973924-desktop-board-mouse-pan.png` |
| QA-053-T05 | Pass | fixture route，390x844；CDP touch + compatibility click 依序點 card/checklist/header，modal id 與 source id 相同，rail/preview 均 0 | DEV-053 B05；`output/playwright/dev-053-task-drag-1784227318907-B05-mobile-quick-taps.png` |
| QA-053-T06 | Pass | fixture route，390x844；card/title/checklist/column/workbench surface 短滑，board/column scroll displacement > threshold；DEV-053 B06 before/after node storage 完全相同，details/rail/preview=0 | DEV-029 B01-B09、B06、F01；`output/playwright/dev-053-task-drag-1784227318907-B06-mobile-short-pan.png` |
| QA-053-T07 | Pass | fixture route，390x844；拖到 add-task 非 drop target 後 before/after node storage 完全相同、rail/preview/indicator=0；同一 card 下一個 long press 立即出現 rail/preview | DEV-053 B07；`output/playwright/dev-053-task-drag-1784227318907-B07-mobile-invalid-retry.png` |
| QA-053-T08 | Pass | fixture route，390x844；完成 action 僅切換 completed 樣式/status；新增下階產生不同的新 child id 並開 naming/details；刪除 action 只開 confirmation，確認前 source node count > 0 | DEV-029 C08/C07/C04；`output/playwright/dev-029-mobile-pan-operation-matrix-1784226512199-C01-mobile-action-rail-card.png` |
| QA-053-T09 | Pass | fixture route，390x844；before/after reorder、drop indicator、board 右緣 horizontal auto-scroll、column 底緣 vertical auto-scroll 均實際位移，只提交最後 target | DEV-029 C06/C12/C13；`output/playwright/dev-029-mobile-pan-operation-matrix-1784226512199-C02-mobile-action-rail-child.png` |
| QA-053-T10 | Pass | fixture route，390x844；touchcancel、pointercancel、Escape、blur、visibilitychange 各自 before/after node storage length 均 23637，rail/preview/indicator=0、bodyActive=false，五項 retry 均 Pass | DEV-053 B10；`output/playwright/dev-053-task-drag-1784227318907-B10-mobile-cancel-cleanup.png` |
| QA-053-T11 | Pass | base route，1440x900；Workbench unplaced row mouse drag 到 placed lane，只出現一份 placed task，workspace/board/parent/order 由 UI commit 更新，unplaced lane 移除 | DEV-039 placement browser；`output/playwright/dev-039-task-workbench-placement-lanes-mobile.png` 為同輪最終 viewport evidence |
| QA-053-T12 | Pass | desktop placed reverse drag 後仍在 placed lane、無 duplicate / unplaced persistence；390x844 placed long press rail=0、preview=0、drag attributes=null、storage null->null，quick tap modal id=`qc-card-1` | DEV-039 placement browser、DEV-053 B13；`output/playwright/dev-053-task-drag-1784227318907-B13-mobile-placed-readonly.png` |
| QA-053-T13 | Pass | 320x844、390x844、430x932；各 viewport 實際長按、移到另一 task，rail/preview/indicator 皆顯示且 rect 完全在 viewport 內；無水平 overflow | DEV-053 B14；`output/playwright/dev-053-task-drag-1784227318907-B14-320x844.png`、`output/playwright/dev-053-task-drag-1784227318907-B14-390x844.png`、`output/playwright/dev-053-task-drag-1784227318907-B14-430x932.png` |
| QA-053-T14 | Pass | 1024x768 與三個 mobile viewport：alerts=[]、visibleHttpError=false、horizontalOverflow=false；browser 結束 diagnostics=[]、networkFailures=[] | DEV-053 B14/B15；`output/playwright/dev-053-task-drag-1784227318907-B14-1024x768.png` |

## 5. 架構與停止條件稽核

- `BoardView.tsx` 不再持有 mobile global touch listener、target hit-test、auto-scroll 或 mobile commit；改由 shared session / presenter / committer 邊界負責。
- `TouchSensor` 已移除；mobile 由 500ms long press session 接管，short pan 由 pan broker 接管，tap 由 tap guard 分流。
- target priority 只有 `mobile-action -> task-position -> workbench-placed-lane -> none` 一份來源。
- committer release 前讀最新 `useWbsStore.getState()`，placement/reorder 使用 batch update 與 merge key。
- placed row component 不呼叫 `useDraggable`，`sourceKind:null`、`mobileActionEnabled:false`。
- session terminal guard 阻止同一 `sessionId` double-submit；browser cancel matrix 未發現殘留或 write。
- `git diff --check` 通過；未改 DB/schema/API，未進行 production release。

## 6. 最終判定

`QA True Operation Gate：通過`  
`DEV-053 completion gate：通過`  
`Stop Ship findings：0`  
`Physical phone supplemental not executed`  
`Production deployment：not executed`
