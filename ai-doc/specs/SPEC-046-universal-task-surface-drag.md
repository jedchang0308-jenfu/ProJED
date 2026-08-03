# SPEC-046: 全任務表面拖曳一致化與拖曳把手退役

狀態: Implemented / Local Automated QA Passed / Manual Physical-Phone QC Not Executed / Production Not Authorized
對應 DEV: DEV-046
節點類型: 交付點
是否計入產品交付完成: 是，這是使用者可直接驗收的跨桌機/手機任務拖曳互動一致化
建立日期: 2026-07-07
最近更新: 2026-07-07

使用思考習慣: #批判思考、#可驗證性

## DEV-051 Rollback Addendum（2026-07-16）

- DEV-051 drop-intent／parent-lock 實作已撤回；本 SPEC 與 `main` 看板拖拉重新成為 active baseline。
- 下方 DEV-051 行為只保留歷史參考，不得作為目前 runtime 驗收契約。

## DEV-053 Workbench Placed Row Supersession Addendum（2026-07-17）

- 使用者已確認 Workbench `placed row` 不能拖；這是 DEV-046 whole-surface drag scope 的明確例外。
- 看板卡片、checklist row、WBS list row、task-backed column/header 與 Workbench `unplaced row` 的 whole-task surface drag 契約仍維持。
- Workbench `placed row` 應視為 read-only placement list entry：可保留點擊開詳情、右鍵與非 placement 操作，但不得作為 placement drag source，也不得拖回未歸位。
- 本文件中任何「全域任務平台已歸位 row 也要可拖」的舊描述，已由 `SPEC-053` 覆寫，只保留歷史脈絡。

## DEV-051 Historical Authoritative Addendum（Superseded）

- 本 SPEC 的 whole-task surface drag source、click guard、interactive-control exclusion、mobile pan-first compatibility 與 undo grouping 繼續有效。
- `SPEC-051` 已完成本機實作並取代看板 `wbs-card-drop`／`wbs-checklist-drop` 的跨父層隱性中央／下層 drop-intent：預設同父層即時排序；跨父層需停留 750ms 鎖定，且只以群組框與 before／after／append insertion line 呈現，不顯示 breadcrumb、Level、鎖定文字或 floating status。
- DEV-051 明確 child move 只透過拖曳期間出現的「下層空位」，不以卡片中央代表成為 child。
- DEV-051 static 33/33、browser 7-case matrix 與本 SPEC static/browser regression passed；production runtime 尚未部署。

## Human Decision Brief

來源:
- 使用者先指出全域任務平台中已歸位任務與未歸位任務拖曳觸發窗口不同。
- 後續使用者修正需求: 不只全域任務平台，手機與電腦的所有任務，不論已歸位或未歸位，不論列表、卡片、待辦清單，不論父任務、子任務、孫任務或更深階層，都應該整個任務可拖；拖曳把手可以直接刪除。

已確認決策:
- 電腦版與手機版都要支援「整個任務本體可作為拖曳起點」。
- 範圍包含已歸位任務與未歸位任務。
- 範圍包含所有階層的列表列、看板卡片、待辦清單列與全域任務平台任務列；任務階層深度不得成為只能用把手拖曳的理由。
- 拖曳把手不再是必要 UI，可以從任務 surface 移除。
- 既有任務詳情入口、右鍵選單、手機 compact action rail 與 pan-first 手勢不得因整面拖曳被破壞。

Rejected options:
- 不只修 `TaskWorkbenchPanel`；那只能處理全域任務平台，無法滿足列表、卡片、待辦清單。
- 不採「已歸位仍靠把手、未歸位整列可拖」；這正是使用者指出的不一致。
- 不靠調大/調小 dnd sensor distance 或 touch delay 掩蓋 hit area 差異；真正要改的是 event binding surface。
- 不新增第二套拖曳把手、工作台專用 menu 或 mobile-only duplicated drag UI。
- 不讓手機短滑直接變成拖曳；手機仍需遵守 DEV-029 pan-first，短滑優先捲動，長按整個任務才進入拖曳/操作模式。

AI assumptions:
- 「所有階層」指任何有效 `TaskNode` / task-backed item，只要目前 UI 允許該任務被拖曳排序、移動或調整父子階層，就必須由整個任務 surface 啟動；包含 Level 1 父任務、Level 2 子任務、Level 3+ 待辦/孫任務與更深階層。
- 「列表」第一階段涵蓋 WBS list row、看板 list/column task header 或等效 task-backed list row；若某個 list header 不是 `TaskNode`，只做不破壞處理，不強行轉成 task drag source。
- MindMap 與 Gantt 已有獨立拖曳語意；本 DEV 先處理使用者明確列出的列表、卡片、待辦清單與全域任務平台。若 RD 觸及 MindMap/Gantt，必須保留 DEV-027/DEV-028/Gantt schedule drag 語意並追加 regression。
- 拖曳把手刪除不代表移除鍵盤或無障礙拖曳能力；root task surface 必須承接等價的 focus/aria/keyboard drag affordance 或保留非視覺等價路徑。

Re-entry triggers:
- 要讓手機短滑也直接拖曳，而不是 long-press 後拖曳。
- 要把 MindMap/Gantt 的拖曳語意一起重做，而不是保留既有模式專屬拖曳。
- 要修改 `GlobalContextMenu` 選單內容、手機 compact action rail action set 或任務詳情 UI。
- 要新增資料模型、DB schema、RLS、RPC、migration、production deploy 或正式資料修復。

## Problem Statement

目前拖曳觸發窗口分裂:

- 全域任務平台的未歸位 row 已在 DEV-039 Phase 2A 收斂到 row root；已歸位 placed row 依 DEV-053 從 drag source scope 移出。
- 看板卡片、待辦清單列、看板 list/header 與 WBS list row 仍由 `TaskDragHandle` 承接 dnd-kit `attributes/listeners`。
- 手機長按與 pan-first 邏輯仍有 `data-task-drag-handle` 例外與 handle-only 註解。

結果是使用者在不同任務表面需要記住不同拖曳起點: 有些整列可拖，有些只能拖小把手。這違反 DEV-028 的跨模式肌肉記憶目標，也讓 DEV-039 工作台的整列拖曳手感無法延伸到主看板/列表/待辦。

## End-State Architecture

所有階層的 task-backed surface 採同一個互動模型:

1. Task root surface 是拖曳起點。
2. Interactive child target 仍保留自己的點擊/輸入語意，不啟動拖曳。
3. 電腦版: mouse/pointer 在任務 root 非互動區起手，超過既有 dnd activation threshold 後啟動拖曳。
4. 手機版: quick tap 開詳情，短滑 pan，長按任務 root 任一非互動區進入既有 mobile drag-action mode。
5. 拖曳把手不再出現在任務 row/card/checklist surface，也不再作為唯一 dnd listener host。

建議 RD 建立或整理共用 helper:

- `isTaskDragSuppressedTarget(target)` 或等效工具，排除 buttons、inputs、selects、links、contenteditable、date/dependency/status/assignee/tag controls、expand/collapse controls、modal/popover controls。
- `buildTaskDragSurfaceBindings(...)` 或 `useTaskDragSurface(...)`，集中輸出 root surface 需要的 desktop dnd bindings、mobile long-press bindings、click/right-click/touch arbitration 與 data attributes。
- 標準 selector:
  - `data-task-drag-surface="true"`
  - `data-task-drag-surface-kind="list-row|kanban-card|checklist-row|workbench-row|column-row"`
  - `data-task-id`

## Scope

In scope:
- `TaskWorkbenchPanel` 未歸位與所有任務排序 row alignment，包含所有階層的已歸位 task row。
- `KanbanCard` 卡片 root whole-surface drag，包含父卡片與任何以卡片形式呈現的下層任務。
- `KanbanChecklist` checklist row whole-surface drag，包含 Level 2、Level 3、Level 4+ 等所有可見待辦/子任務列。
- `KanbanColumn` 中 task-backed list/header row whole-surface drag，若該 surface 代表 TaskNode。
- `WbsNodeItem` WBS list row whole-surface drag，包含所有縮排階層。
- 移除上述 task surface 的 visible drag handle 與 handle-only dnd binding。
- 更新 `useDragSensors` / `useLongPress` / touch guard 註解與 guard，使其不再以 handle-only 為規格前提。
- 更新 DEV-028 / DEV-029 / DEV-039 regression verifier，或新增 DEV-046 verifier 後把它納入回歸鏈。

Out of scope:
- 不改任務資料模型、WBS move model、DB schema、migration、RLS、RPC。
- 不改 `GlobalContextMenu` 選單內容。
- 不新增第二套 context menu、第二套 mobile action rail 或新拖曳資料模型。
- 不重做 `TaskDetailsModal`。
- 不降低看板卡片資訊密度。
- 不重做 MindMap / Gantt 的模式專屬拖曳；若被實作觸及，只能做 regression-safe alignment。
- 不做 production deploy、merge plan、PR checklist、rollback plan 或 production smoke。

## Implementation Evidence - 2026-07-07

已實作:
- `KanbanCard`、`KanbanChecklist`、`KanbanColumn`、`WbsNodeItem`、`SharedTaskSidebar` 改由任務 root surface 承接 sortable drag bindings。
- `TaskWorkbenchPanel` 維持 DEV-039 row-root drag parity 與 shared task context menu。
- WBS / Kanban / checklist / shared sidebar 任務 UI 不再 import 或渲染 `TaskDragHandle`，未使用的 `src/components/Wbs/TaskDragHandle.tsx` 已刪除。
- `useDragSensors` 新增 mouse/touch/keyboard interactive target guard，整個任務可拖時仍保護 button、input、select、link、contenteditable、task interaction controls、popover/modal controls。
- DEV-029 verifier 已更新為 DEV-046-compatible contract: 原把手區已併入任務 surface，手機短滑仍 pan，長按仍進 compact action rail。
- 新增 `verify:dev-046-universal-task-surface-drag` 與 `verify:dev-046-universal-task-surface-drag-browser`。

本機自動化驗證已通過:
- `npm.cmd run verify:dev-046-universal-task-surface-drag`
- `npm.cmd run verify:dev-046-universal-task-surface-drag-browser`
- `npm.cmd run verify:dev-028-cross-mode-task-interactions`
- `npm.cmd run verify:dev-028-cross-mode-task-interactions-browser`
- `npm.cmd run verify:dev-029-mobile-pan-first-interactions`
- `npm.cmd run verify:dev-029-mobile-pan-first-interactions-browser`
- `npm.cmd run verify:dev-039-task-workbench-placement-lanes`
- `npm.cmd run verify:dev-039-task-workbench-placement-lanes-browser`
- `npm.cmd run verify:dev-044-undo-coverage`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run build:test`

尚未宣稱完成:
- 手機實機 physical-phone supplemental QC。
- production deploy、production smoke、merge/PR/release artifacts。
- MindMap / Gantt 模式專屬拖曳語意重設計。

## Implementation Contract

### Shared Interaction Rules

- Root task surface 承接 dnd-kit `setNodeRef`、`attributes`、`listeners` 或等效拖曳啟動能力。
- `TaskDragHandle` 不再接收或獨占 sortable `listeners/attributes`。
- 任務 root click 與 drag 必須互斥: 真正拖曳後不得 click-through 開啟 `TaskDetailsModal`。
- 任務 root right-click 必須維持既有 `GlobalContextMenu` task variant。
- 手機 root long press 必須進既有 DEV-029 compact action rail / drag-action mode，不開桌機完整 menu。
- 手機 root short pan 必須維持 DEV-029 pan-first，不顯示 action rail、drag preview 或 details modal。
- Interactive child target 不得啟動 drag；點擊該 control 只執行 control 本身。
- Viewer / no-edit permission 下，root surface 不得啟動 mutation drag；可保留詳情、右鍵可見但不可執行無權操作。
- Root surface 必須有足夠 focus/aria 或鍵盤替代，避免移除 button handle 後造成 keyboard accessibility regression。

### Touchpoints

| Area | File / component | Required change |
|---|---|---|
| Workbench row | `src/components/TaskWorkbenchPanel.tsx` | 保留 DEV-039 Phase 2A row-root drag，對齊共用 helper 與 new selector。 |
| Kanban card | `src/components/Wbs/KanbanCard.tsx` | 把 sortable bindings 從 `TaskDragHandle` 移到 card root；保留 click-to-details、right-click、mobile long press。 |
| Checklist row | `src/components/Wbs/KanbanChecklist.tsx` | 把 sortable bindings 從 `TaskDragHandle` 移到 checklist row root；保留 expand/status/date controls。 |
| Column/list row | `src/components/Wbs/KanbanColumn.tsx` | task-backed list/header root 可拖；不得讓 add-task input 或 column controls 觸發 drag。 |
| WBS list row | `src/components/Wbs/WbsNodeItem.tsx` | row root 可拖；展開箭頭、status、date、assignee、context buttons 不拖。 |
| Drag handle | `src/components/Wbs/TaskDragHandle.tsx` | 從上述 task surface 退役；若無其他用途可刪除，若仍被非任務 surface 使用則改名或限制用途。 |
| Sensors | `src/hooks/useDragSensors.ts` | 更新 handle-only 前提；不得用 sensor threshold workaround 取代 root binding。 |
| Long press | `src/hooks/useLongPress.ts` | 移除或改寫 `ignoreTaskDragHandle` 依賴；改以 task surface / interactive target guard 判斷。 |
| Tap guard | `src/hooks/useTouchTapGuard.ts` | 維持 pan-first click suppression；不可被 whole-surface drag 改壞。 |
| CSS | `src/index.css` and component styles | 移除 visible handle affordance；root surface hover/active/drag feedback 要穩定，mobile 不可 `touch-action: none` 破壞 pan。 |

## RD Handoff Contract

### Phase 0: Development Documentation

Document status: Authorized / Complete when this SPEC, QA plan, dev_task and documentation_map are updated.

Scope:
- 建立 DEV-046 規格、QA 真實操作驗證計畫與極限操作測試。
- 記錄與 DEV-028 / DEV-029 / DEV-039 的優先序。

Out of scope:
- Product code changes。
- Verifier implementation。
- Release artifacts。

Acceptance:
- 文件可讓 RD 直接接手，不需要再問使用者「到底哪些任務 surface 要改」。
- QA 計畫包含桌機、手機、真實操作、極限操作與回歸 gate。

Evidence:
- File diff。

### Phase 1: Desktop Whole-Surface Drag

Document status: RD Contract Ready / Not Authorized

Scope:
- Desktop 1440x900 / 1024x768 下，所有階層的 WBS list row、Kanban card、checklist row、workbench row、task-backed list/header root 都可從整個非互動 surface 拖曳。
- 移除上述 surface 的 visible drag handle。
- 保留 left click details、right-click context menu、interactive controls。

Out of scope:
- 手機 gesture 改動。
- MindMap/Gantt redesign。
- DB / production。

Entry condition:
- 使用者明確授權 RD 開發 DEV-046。

Acceptance:
- 每個階層的 task surface 左側縮排區、中段、右側非互動區都能啟動拖曳。
- 拖曳後不開詳情。
- 點擊不拖曳時仍開詳情。
- 右鍵仍開同一套 task context menu。
- DOM / screenshot 均看不到可見拖曳把手。

Evidence:
- `verify:dev-046-universal-task-surface-drag`
- `verify:dev-046-universal-task-surface-drag-browser`
- DEV-028 / DEV-039 regression。

### Phase 2: Mobile Whole-Task Long-Press Drag

Document status: RD Contract Ready / Not Authorized

Scope:
- 390x844 / 320x844 / 430x932 手機下，所有階層任務 root 任一非互動區可 long press 進入 mobile drag-action mode。
- quick tap 保留開詳情。
- short pan 保留捲動，不進 drag-action。
- 移除可見拖曳把手後，原把手位置也變成一般 task surface。

Out of scope:
- 不讓 short pan 直接拖曳。
- 不修改 compact action rail action set。

Entry condition:
- Phase 1 完成，且使用者授權手機 slice。

Acceptance:
- 任一階層的卡片、checklist row、workbench row、list row 任一非互動點 long press 都顯示同一 compact action rail 與 drag preview。
- 拖到任務位置可排序/移動。
- 拖到完成、新增同階、新增下層、刪除 target 行為符合 DEV-029；刪除只開確認。
- pan-first、quick tap、edge auto-scroll、touchcancel/blur/Escape/fail-safe timeout 不回歸。

Evidence:
- DEV-046 browser mobile matrix。
- DEV-029 browser regression。
- Manual physical phone supplemental if available。

### Phase 3: Drag Handle Retirement Cleanup

Document status: RD Contract Ready / Not Authorized

Scope:
- 移除或退役 `TaskDragHandle` 在 WBS task surfaces 的使用。
- 清理 `data-task-drag-handle` 依賴、文件與測試。
- 更新 package scripts 與 static gates，防止 handle-only regression。
- 補 accessibility replacement evidence。

Out of scope:
- 刪除仍被非 task surface 合法使用的 generic component，除非 RD 確認無引用。

Entry condition:
- Phase 1 + Phase 2 drag behavior 通過 automated browser gate。

Acceptance:
- 靜態 gate 證明 task surfaces 不再依賴 `TaskDragHandle`。
- Root surface 有清楚 hover/drag/focus feedback。
- Keyboard / screen-reader alternative 不低於刪除前。

Evidence:
- DEV-046 static gate。
- Accessibility / keyboard smoke。

### Phase 4: Future Mode Alignment

Document status: RD Contract Ready / Not Authorized

Scope:
- 若未來要把 MindMap / Gantt 也納入「全任務 surface drag」一致化，必須保留各自模式語意。
- MindMap: node whole-surface drag 可調整 hierarchy/order，但不得破壞 relationship edit、zoom/pan、keyboard navigation。
- Gantt: task bar drag 仍代表排程，不可被改成 WBS reorder；左側 list row 若是 task row 可採 Phase 1 規則。

Entry condition:
- 使用者明確要求 MindMap/Gantt 一起納入，或 RD 實作不可避免觸及。

Acceptance:
- DEV-027 / DEV-028 / Gantt schedule drag regression 通過。

Evidence:
- Mode-specific browser verifiers。

## Acceptance Criteria

- [ ] 桌機所有階層的列表任務列整列可拖，且沒有可見拖曳把手。
- [ ] 桌機所有階層的看板卡片整卡非互動區可拖，且沒有可見拖曳把手。
- [ ] 桌機所有階層的待辦清單列整列非互動區可拖，且沒有可見拖曳把手。
- [ ] 全域任務平台未歸位 row 維持 row-root drag surface；已歸位 placed row 不暴露 draggable root，且不可拖回未歸位。
- [ ] 手機 quick tap 任務仍開 `TaskDetailsModal`。
- [ ] 手機 short pan 任務 surface 仍捲動，不開詳情、不開 menu、不拖曳。
- [ ] 手機 long press 任一階層任務 surface 任一非互動區都進入 compact action rail / drag-action mode。
- [ ] 拖曳後不 click-through 開詳情。
- [ ] 右鍵桌機任務仍開 `GlobalContextMenu` task variant，選單內容不被本 DEV 改動。
- [ ] Interactive controls 不啟動 drag。
- [ ] Viewer / no-edit role 不能透過 whole-surface drag 產生 mutation。
- [ ] 刪除拖曳把手後，keyboard / accessibility path 仍可操作或有等價替代。
- [ ] 320x844、390x844、430x932、1024x768、1440x900 無水平 overflow、遮擋、裁切或 visible runtime error。

## QA / QC Gate Summary

詳細 QA 計畫見 `ai-doc/qa/QA-DEV-046-universal-task-surface-drag.md`。

Required automated gates:

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

Conditional gates:

```powershell
npm.cmd run verify:dev-027b-xmind-interaction-polish-browser
npm.cmd run verify:dev-027e-xmind-note-relationship-line-ux-parity-browser
```

Run conditional gates if RD touches MindMap, global keyboard routing, shared drag sensors beyond WBS/board/workbench, or root focus behavior used by MindMap.

## Stop Conditions

- 任一任務 surface 仍只能從拖曳把手啟動拖曳。
- 刪除拖曳把手後拖曳能力消失或只剩部分 dead zone 可拖。
- 手機 short pan 變成 drag，導致無法自然捲動。
- 手機 quick tap 不再開任務詳情。
- 拖曳後誤開詳情、右鍵選單、rename input 或 mobile action rail。
- Interactive control 被 whole-surface drag 攔截。
- 手機長按仍走完整桌機 context menu。
- 刪除 target 直接刪除任務而未確認。
- 任務拖曳造成重複、遺失、錯父層、cycle 或 undo command 拆散。
- Viewer / 無權限使用者可拖曳改資料。
- 需要 DB/schema/RLS/migration、production deploy 或 release authorization。

## Deferred Scope Audit

| Deferred / Out-of-scope item | Classification | Tracking target | Resume condition |
|---|---|---|---|
| Product implementation | Same Spec Phase | Phase 1-3 | 使用者明確授權 RD 開發 DEV-046 |
| MindMap / Gantt full alignment | Same Spec Phase | Phase 4 | 使用者要求或 RD 不可避免觸及 |
| Production deploy / release / production smoke | Blocked Human Re-entry / Release Authorization Required | deployment-release-gate | 使用者明確授權 release/deploy |
| DB / schema / RLS / migration | No Tracking | None | 本 DEV 為前端互動；若未來需要資料層改動需另開 DEV |
| Mobile compact action rail action set redesign | Blocked Human Re-entry | DEV-029 decision | 使用者明確要求改手機 action set |
| GlobalContextMenu content redesign | Blocked Human Re-entry | DEV-028 / context menu spec | 使用者明確要求改選單內容 |

## All-Phase Coverage Matrix

| Phase / DEV | Authorization | Document status | Scope | Out of scope | Entry condition | Acceptance | Evidence |
|---|---|---|---|---|---|---|---|
| DEV-046 Phase 0 | Authorized | Complete when docs updated | SPEC / QA / dev_task / documentation_map | Product code, verifier implementation, release artifacts | 使用者要求寫成開發文件 | RD 可直接接手；QA 包含真實操作與極限操作 | file diff |
| DEV-046 Phase 1 | Authorized / Complete | Implemented / Local Automated QA Passed | Desktop whole-surface drag for list/card/checklist/workbench/task-backed list header | DB, release | 使用者授權 RD | 桌機整個任務非互動區可拖；click/right-click/controls 不回歸；handle removed | DEV-046 static/browser, DEV-028/039, TS, build passed |
| DEV-046 Phase 2 | Authorized / Complete | Implemented / Local Automated QA Passed / Physical Phone Pending | Mobile whole-task long-press drag for the same surfaces | short pan as drag, action rail redesign | Phase 1 passed + 手機 slice 授權 | quick tap/details、short pan、long press drag-action 全通 | DEV-046 browser mobile, DEV-029 passed |
| DEV-046 Phase 3 | Authorized / Complete | Implemented / Local Automated QA Passed | Drag handle retirement cleanup, selector/test/doc cleanup, accessibility replacement | non-task generic component deletion unless proven unused | Phase 1/2 passed | no task surface handle dependency; keyboard/a11y smoke pass | static gate, browser passed |
| DEV-046 Phase 4 | Not Authorized | RD Contract Ready / Not Authorized | Future MindMap/Gantt alignment if required | changing mode semantics without re-entry | 使用者要求或 RD 觸及 | mode-specific drag semantics preserved | DEV-027/028/Gantt regression |
| Release Gate | Not Authorized | Blocked Human Re-entry / Release Authorization Required | merge/deploy/production smoke/rollback | 未授權 release artifacts | 使用者明確 release/deploy 授權 | deployment-release-gate pass | future release evidence |

## Related Documents

- QA: `ai-doc/qa/QA-DEV-046-universal-task-surface-drag.md`
- DEV-028 baseline: `ai-doc/specs/SPEC-028-cross-mode-trello-like-task-interactions.md`
- DEV-029 baseline: `ai-doc/specs/SPEC-029-mobile-pan-first-touch-interactions.md`
- DEV-039 baseline: `ai-doc/specs/SPEC-039-task-filter-core-and-workbench-profiles.md`
- DEV task board: `ai-doc/dev_task.md`
- Documentation map: `ai-doc/documentation_map.md`
