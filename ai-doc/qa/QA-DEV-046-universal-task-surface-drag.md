# QA-DEV-046: 全任務表面拖曳一致化真實操作驗證計畫

關聯 DEV: DEV-046
關聯 SPEC: `ai-doc/specs/SPEC-046-universal-task-surface-drag.md`
狀態: Automated QA Passed / Manual QC Not Executed / Physical-Phone Supplemental Not Executed / Production Not Authorized
建立日期: 2026-07-07
最近更新: 2026-07-07

使用思考習慣: #可驗證性、#證據基礎、#極限情境

## 驗證目標

確認電腦與手機上，所有明確納入的 task-backed surface 都從「拖曳把手限定」改為「整個任務本體可拖曳」。這裡的「所有任務」包含所有階層: 父任務、子任務、孫任務、Level 3+ checklist row、Level 4/5 deep row 與全域任務平台中的所有已歸位/未歸位 task row。驗證同時不得破壞:

- DEV-028 click-to-details 與 detail-only title edit。
- DEV-029 mobile pan-first、quick tap details、long-press compact action rail。
- DEV-039 workbench row-root drag parity。
- DEV-044 drag/reorder undo grouping。
- 桌機 `GlobalContextMenu` task variant。
- 權限、interactive controls、keyboard / accessibility。

## 測試環境

| 類型 | 要求 |
|---|---|
| Desktop viewport | 1440x900 |
| Laptop viewport | 1024x768 |
| Mobile viewport | 390x844, 320x844, 430x932 |
| Browser | Codex in-app browser or Chrome / Edge |
| Pointer | Desktop mouse, touchpad if available, mobile coarse pointer emulation |
| Test data | 至少一個 board，含未歸位任務、已歸位任務、WBS Level 1/2/3/4+ list rows、Kanban parent card、Level 2/3/4+ checklist rows、長標題任務、含日期/status/assignee/tag/child controls 的任務 |
| Evidence | screenshot / video / DOM selector / before-after order / command output / viewport metrics |

Visible error sweep 每個 viewport 都必須檢查:

- `.inline-error`
- `[role=alert]`
- `Not Found`
- `Internal Server Error`
- 可見 `/api/` 錯誤
- horizontal overflow
- console/runtime error if verifier can capture

## Automated Evidence - 2026-07-07

已完成本機自動化驗證:
- DEV-046 static: `npm.cmd run verify:dev-046-universal-task-surface-drag`
- DEV-046 browser: `npm.cmd run verify:dev-046-universal-task-surface-drag-browser`
- DEV-028 static/browser: click-to-details、detail-only title edit、右鍵選單與跨模式互動回歸。
- DEV-029 static/browser: mobile pan-first、quick tap、整個任務 surface 長按 action rail、原把手區退役後 pan/long-press 相容。
- DEV-039 static/browser: 全域任務平台未歸位/已歸位 row-root drag、右鍵 shared menu 與 placement lane 回歸。
- DEV-044 static: drag/reorder/move 仍使用 batch undo coverage。
- TypeScript/build: `npm.cmd exec tsc -- --noEmit`、`npm.cmd run build:test`。

自動化 browser 覆蓋:
- Desktop WBS list row: top-level、child、grandchild row root surface 取樣與排序拖曳。
- Desktop board: kanban card、checklist row、deep checklist row、task-backed column header root surface 取樣與排序拖曳。
- Desktop interactive controls: checklist toggle 不被整面拖曳攔截。
- Mobile coarse pointer: card/checklist/header 短滑不開詳情或 action rail，長按進 compact action rail / drag preview。

未完成:
- 人工真實操作矩陣 MAN-046。
- 手機實機 physical-phone supplemental。
- production smoke / release gate。

## Zero-Tolerance Failures

| ID | Fail condition | Detection |
|---|---|---|
| ZT-046-001 | 任一納入 surface 仍只能拖曳把手，不能從任務本體啟動拖曳 | multi-point drag hit-test |
| ZT-046-002 | 任務 surface 仍顯示拖曳把手 UI，或 `TaskDragHandle` 仍是 WBS task surface 的唯一 listener host | static + screenshot |
| ZT-046-003 | 拖曳後 click-through 開 `TaskDetailsModal` | browser drag trace |
| ZT-046-004 | quick tap 不再開詳情 | desktop/mobile tap trace |
| ZT-046-005 | 手機 short pan 觸發 drag/action rail/details/menu | mobile gesture trace |
| ZT-046-006 | 手機 long press 任務本體沒有進 compact action rail / drag-action mode | mobile long press trace |
| ZT-046-007 | 右鍵 task 不再開 `GlobalContextMenu` task variant，或選單內容被本 DEV 改動 | desktop context menu trace |
| ZT-046-008 | status/date/assignee/tag/input/button/expand 等 interactive controls 被 drag 攔截 | control click trace |
| ZT-046-009 | Viewer / no-edit role 可拖曳修改任務資料 | permission regression |
| ZT-046-010 | 拖曳造成任務重複、遺失、錯父層、cycle、錯排序或 undo 無法一次還原 | before-after data + undo check |
| ZT-046-011 | 320x844 / 390x844 / 430x932 出現水平 overflow、action rail 裁切、drag preview 卡住或 visible runtime error | screenshot + DOM metrics |
| ZT-046-012 | 移除 handle 後 keyboard / accessibility 沒有等價操作或 root focus 完全不可達 | keyboard/a11y smoke |

## Static Gate

Recommended command:

```powershell
npm.cmd run verify:dev-046-universal-task-surface-drag
```

Required checks:
- `KanbanCard` root 承接 sortable drag bindings，不再把唯一 `listeners/attributes` 傳給 `TaskDragHandle`。
- `KanbanChecklist` row root 承接 sortable drag bindings。
- `WbsNodeItem` row root 承接 sortable drag bindings。
- `TaskWorkbenchPanel` 維持未歸位與所有任務排序 row root drag surface。
- `KanbanColumn` task-backed list/header surface 若為 TaskNode，root 承接 drag bindings。
- WBS task surfaces 不再依賴 visible `TaskDragHandle`。
- `data-task-drag-handle` 不再作為 task drag 的唯一判斷來源。
- 存在 `data-task-drag-surface` 或等效穩定 selector。
- `useDragSensors` 註解不再宣稱「只有 explicit handle 可拖」。
- `useLongPress` 不再以 `ignoreTaskDragHandle` 作為主要規格前提，或已改寫成 backward-compatible guard。
- mobile pan-first guard 仍存在 movement threshold 與 compatibility click suppression。
- desktop `GlobalContextMenu` task variant 沒被新增/刪減為 DEV-046 專用 menu。
- package scripts 註冊 DEV-046 static/browser gate。

## Browser Automated Gate

Recommended command:

```powershell
npm.cmd run verify:dev-046-universal-task-surface-drag-browser
```

Automated browser gate 必須覆蓋下列可自動化案例；不能只做 DOM 存在檢查。

### Desktop Whole-Surface Matrix

| ID | Surface | Operation | Expected evidence |
|---|---|---|---|
| AUTO-046-D01 | WBS list row | 從 row 左側 15%、title 50%、右側 85% 三點拖曳排序 | 三點都可 drag；order changed；no details modal |
| AUTO-046-D02 | Kanban card | 從 card 左上、title body、中段、右側空白拖到同欄另一位置 | card reorder；no details modal；no handle required |
| AUTO-046-D03 | Kanban card cross-column | 從 card body 拖到另一欄 | column/status/parent semantics 按既有邏輯更新；no duplicate |
| AUTO-046-D04 | Checklist row | 從 row 左側縮排、title、右側空白拖曳 | row reorder / move；no details modal |
| AUTO-046-D05 | Workbench unplaced row | 從 row root 三點拖曳到 placement lane | placement works；no details modal |
| AUTO-046-D06 | Workbench all-task placed row | 從 row root 三點拖回 unplaced or reorder | placement/reorder works；no details modal |
| AUTO-046-D07 | Task-backed list/header | 若存在 task-backed list/header，從 root 拖曳 | drag works or verifier records not-applicable with reason |
| AUTO-046-D11 | Deep hierarchy rows | WBS Level 3/4+ row 與 checklist Level 3/4+ row 各從縮排區、title、右側空白拖曳 | all hierarchy levels drag from row root; no handle-only behavior; no wrong parent/cycle |
| AUTO-046-D08 | Right click after drag | 拖曳完成後右鍵同任務 | same task context menu appears |
| AUTO-046-D09 | Click without drag | 單擊 task body | opens correct `TaskDetailsModal` |
| AUTO-046-D10 | Interactive controls | 點 status/date/assignee/tag/expand/button/input | control works; no drag; no unintended modal |

### Mobile Gesture Matrix

| ID | Surface | Operation | Expected evidence |
|---|---|---|---|
| AUTO-046-M01 | Kanban card | quick tap body | opens correct details modal |
| AUTO-046-M02 | Kanban card | short pan from body/title/right area | scroll/pan or suppress click; no modal/menu/drag |
| AUTO-046-M03 | Kanban card | long press body/title/right area | compact action rail + drag preview |
| AUTO-046-M04 | Checklist row | quick tap | opens correct child details |
| AUTO-046-M05 | Checklist row | short pan | no modal/menu/drag; column or board scroll measurable when scrollable |
| AUTO-046-M06 | Checklist row | long press from left/title/right points | compact action rail + drag preview |
| AUTO-046-M07 | Workbench row | short pan | no modal/drag/filter; workbench remains usable |
| AUTO-046-M08 | Workbench row | long press | compact action rail + drag preview |
| AUTO-046-M09 | Former handle zone | touch where handle used to be | behaves like normal task surface; no special handle-only behavior |
| AUTO-046-M10 | Cancel paths | long press then `touchcancel`, `pointercancel`, `Escape`, blur/visibility hidden | exits action mode; no commit; no stuck overlay |
| AUTO-046-M11 | Mobile drop targets | drop lifted task to position, complete, add sibling, add child, delete | reorder/status/create/confirm behavior follows DEV-029; delete not direct |
| AUTO-046-M12 | Mobile deep hierarchy | long press Level 3/4+ checklist row and workbench deep row from indentation/title/right points | all hierarchy levels enter same drag-action mode; no dead zone by hierarchy depth |

## Manual Real-Operation Matrix

人工操作不能被 automated browser smoke 取代。QC 報告每項需記錄操作者、日期時間、瀏覽器、URL、viewport、操作步驟、預期、實際、證據與判定。

| ID | Viewport | Surface | Real operation | Expected | Evidence |
|---|---|---|---|---|---|
| MAN-046-001 | 1440x900 | WBS list row | 滑鼠從任務列左側空白按住拖曳 | 任務可拖曳排序，不需把手 | video/screenshot before-after |
| MAN-046-002 | 1440x900 | WBS list row | 滑鼠從任務列右側日期附近拖曳 | 同樣可拖，不因日期/右側空白形成 dead zone | video + hit point |
| MAN-046-003 | 1440x900 | Kanban card | 從卡片標題文字旁、卡片中段、右側空白拖曳 | 整卡可拖；drop 後不開詳情 | video |
| MAN-046-004 | 1440x900 | Kanban card | 單擊卡片不拖曳 | 開正確任務詳情 | modal screenshot |
| MAN-046-005 | 1440x900 | Kanban card | 右鍵卡片 | 開桌機 task context menu；內容不因 DEV-046 改動 | context menu screenshot |
| MAN-046-006 | 1440x900 | Checklist row | 從 row 左側縮排、title、右側空白拖曳 | 整列可拖；drop 後不開詳情 | video |
| MAN-046-007 | 1440x900 | Workbench unplaced | 從 row 左/中/右三處拖曳 | 未歸位 row 整列可拖 | video |
| MAN-046-008 | 1440x900 | Workbench placed/all-task | 從 hierarchy padding、title、日期附近拖曳 | 已歸位 row 整列可拖 | video |
| MAN-046-008A | 1440x900 | Deep hierarchy WBS/checklist | 分別選 Level 3、Level 4+ 任務，從縮排區、title、右側空白拖曳 | 所有階層都整列可拖，不因縮排或層級變成 handle-only | video + before-after hierarchy |
| MAN-046-009 | 1440x900 | All task surfaces | 視覺巡檢拖曳把手 | 不應看到舊拖曳把手 UI | screenshot |
| MAN-046-010 | 1440x900 | Interactive controls | 點日期/status/assignee/tag/input/button/expand | 控制項可用，不拖曳、不誤開詳情 | screenshots |
| MAN-046-011 | 1024x768 | Card/list/checklist | 重複主要 drag + click + right-click | laptop 高度下無遮擋/裁切 | screenshots |
| MAN-046-012 | 390x844 | Kanban card | quick tap | 開詳情 | mobile screenshot |
| MAN-046-013 | 390x844 | Kanban card | 從 card body/title/right area 短滑 | 可捲動或至少不觸發任務功能 | video |
| MAN-046-014 | 390x844 | Kanban card | 從 card body/title/right area 長按 | 進 compact action rail / drag-action mode | screenshot/video |
| MAN-046-015 | 390x844 | Checklist row | quick tap / short pan / long press | tap/details, pan/no action, long-press/action rail | video |
| MAN-046-015A | 390x844 | Deep hierarchy task | 對 Level 3/4+ checklist row 或 workbench deep row 執行 quick tap / short pan / long press | 所有階層同樣 tap/details、pan/no action、long-press/action rail | video |
| MAN-046-016 | 390x844 | Workbench row | quick tap / short pan / long press | tap/details, pan/no action, long-press/action rail | video |
| MAN-046-017 | 390x844 | Former handle area | 在原把手位置短滑與長按 | 與任務本體其他區域一致 | video |
| MAN-046-018 | 390x844 | Mobile action rail | 長按後拖到刪除 | 只開確認，不直接刪除 | confirmation screenshot |
| MAN-046-019 | 390x844 | Mobile action rail | 長按後拖到新增同階/新增下層 | 各只新增一次；命名走詳情 title edit | before-after + modal |
| MAN-046-020 | 1440x900 / 390x844 | Visible error sweep | 完成主要操作後掃描 | 無可視錯誤、無水平 overflow | DOM sweep + screenshot |

## Extreme Operation Tests

極限操作是 DEV-046 必要 QA，不能被一般 happy path 替代。

| ID | Category | Operation | Expected |
|---|---|---|---|
| EXT-046-001 | Small viewport | 320x844 下長按 card/checklist/workbench row | action rail 不裁切；drag preview 不卡住；無水平 overflow |
| EXT-046-002 | Large viewport | 1440x900 + 多欄寬看板，從最左欄拖到最右欄 | board auto-scroll or drag path works; no lost task |
| EXT-046-003 | Dense list | 30+ 任務密集清單中連續拖曳 5 次 | order correct, no duplicate, no details modal |
| EXT-046-004 | Deep hierarchy | Level 4/5 checklist or WBS row 從縮排區、title、右側空白分別拖曳 | 所有深層任務都可由整列拖曳；不可造成 cycle、錯父層或 handle-only dead zone |
| EXT-046-005 | Long title | 超長任務名稱 row/card 從 title 文字區拖曳 | text selection 不取代 drag；layout 不跳動 |
| EXT-046-006 | Micro movement | 桌機按住移動低於 threshold 後放開 | 不拖曳；依 click/tap 規則開詳情或不誤觸 |
| EXT-046-007 | Diagonal mobile pan | 手機在任務 body 斜向快速 flick | 不進 drag-action；不開詳情；可自然 pan |
| EXT-046-008 | Repeated cancel | 手機長按進 action mode 後連續 10 次 Escape/touchcancel/blur | overlay 每次都清乾淨，不提交 action |
| EXT-046-009 | Edge auto-scroll | mobile drag-action 拖到 board 左右邊緣與 column 上下邊緣 | auto-scroll 可用；drop target 仍正確 |
| EXT-046-010 | Modal/menu open | 任務詳情或 context menu 開著時嘗試拖曳背景 task | 背景不應拖曳；topmost UI priority 正確 |
| EXT-046-011 | Permission | viewer/no-edit 嘗試整面拖曳 | 無資料 mutation；提示/disabled 行為合理 |
| EXT-046-012 | Undo | 桌機與手機各完成一次 reorder 後按 undo | 一次 undo 還原相關 order/parent/status；不拆成多筆不一致 |
| EXT-046-013 | Rapid drag | 快速開始拖曳、放開、立刻再次拖同一任務 | 不遺失 active drag state；不重複 commit |
| EXT-046-014 | Context after drag | 拖曳完成立即右鍵同一任務 | menu 正確定位、正確 nodeId、Escape 可關閉 |
| EXT-046-015 | Keyboard accessibility | 移除 handle 後用 Tab/Enter/Space/keyboard drag equivalent 操作 | focus 不消失；可開詳情；有可用替代拖曳或明確限制 |

## Regression Gate

Required:

```powershell
npm.cmd run verify:dev-046-universal-task-surface-drag
npm.cmd run verify:dev-046-universal-task-surface-drag-browser
npm.cmd run verify:dev-028-cross-mode-task-interactions
npm.cmd run verify:dev-028-cross-mode-task-interactions-browser
npm.cmd run verify:dev-029-mobile-pan-first-interactions
npm.cmd run verify:dev-029-mobile-pan-first-interactions-browser
npm.cmd run verify:dev-039-task-workbench-placement-lanes
npm.cmd run verify:dev-039-task-workbench-placement-lanes-browser
npm.cmd run verify:dev-044-undo-coverage
npm.cmd exec tsc -- --noEmit
npm.cmd run build:test
```

Conditional:

```powershell
npm.cmd run verify:dev-027b-xmind-interaction-polish-browser
npm.cmd run verify:dev-027e-xmind-note-relationship-line-ux-parity-browser
```

Run conditional gates if RD touches MindMap, shared keyboard routing, shared drag sensors used by MindMap, or global node focus/selection behavior.

## QC Evidence Required

QC report must include:
- Static verifier pass/fail output。
- Browser verifier pass/fail output。
- Desktop 1440x900 screenshots/video for list/card/checklist/workbench whole-surface drag。
- Mobile 390x844 screenshots/video for quick tap, short pan, long press, action rail and drop targets。
- 320x844 extreme viewport screenshot。
- DOM evidence that visible drag handle is absent from WBS task surfaces。
- Before/after order or parent evidence for reorder/move。
- Undo evidence for at least one desktop and one mobile reorder。
- Right-click menu screenshot proving desktop context menu unchanged。
- Interactive control click evidence。
- Permission/no-edit evidence or explicit blocker if no fixture exists。
- Visible error sweep for desktop/laptop/mobile。
- A pass/fail table for all MAN-046 and EXT-046 items; skipped items must be `Not Executed` with reason, not blank。

## Stop Conditions

Stop and return to RD if:
- Any zero-tolerance failure occurs。
- Any task surface keeps handle-only drag behavior。
- Any mobile pan-first case regresses。
- Any drag operation causes duplicate/lost/wrong-parent task data。
- Accessibility/focus path is worse than before after deleting handle。
- Required verifier cannot distinguish real drag from static DOM presence。
- Product implementation requires DB/schema/RLS/migration or release authorization。
