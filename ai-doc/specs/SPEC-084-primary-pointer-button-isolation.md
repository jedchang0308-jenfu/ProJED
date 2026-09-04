# SPEC-084：非主按鍵不得觸發主按鍵互動

日期：2026-08-22
狀態：Implemented / QA-QC PASS / 未 Release
父層 DEV：DEV-070；相容權威 DEV-028、DEV-053、DEV-077
原始需求：`USER-20260822-NON-PRIMARY-POINTER-ISOLATION`
風險：Medium（跨模式 UI 互動；錯誤路徑可能改動任務順序、日期、關係線或持久化面板寬度）
Spec Impact：`Compatible correction / raw-input isolation`。修正非主按鍵被錯誤解讀為主按鍵的實作漂移；既有左鍵、鍵盤、觸控、右鍵選單與心智圖中鍵平移契約維持。

## 1. 目的與成功結果

使用者以滑鼠中鍵或右鍵操作時，系統不得啟動任何只屬於左鍵／primary pointer 的拖曳、拉伸、選取、關閉或資料提交。現有合法行為必須同時保留：

- 左鍵仍可依各模式既有契約開啟明細、拖曳、拉伸、選取或關閉 backdrop。
- 右鍵仍只進入既有 context-menu／secondary action 流程，不得先啟動 primary action。
- 心智圖中鍵仍可在畫布與可穿透的關係線 hit target 上啟動既有 velocity pan。
- primary touch／pen 的既有 Pointer Event 操作不因滑鼠按鍵修正被關閉；multi-touch 的非 primary contact 不得取得 resize／drag owner。
- 鍵盤拖曳、separator 方向鍵、Escape、Tab、Enter 與 focus 行為不變。

使用思考習慣：#多層次分析、#風險導向、#可驗證性、#反事實檢查

## 2. 已確認問題與系統盤點

### 2.1 根因鏈

```text
Raw mouse/pointer event
  → scattered handler 或 dnd-kit MouseSensor activator
  → 未先確認 button === 0／isPrimary
  → 非主按鍵被正規化成 primary semantic action
  → drag／resize／select／dismiss 狀態成立
  → 部分路徑在 pointerup／mouseup 後提交資料或持久化 UI preference
```

`DEV-070 / ADR-043` 已定義 `Raw Input → Trigger Normalizer → ...`，但目前 `useTaskInteractionBinding.dispatch()` 接受的是已正規化的 semantic trigger；raw button isolation 仍散落在 sensor 與元件入口。這次不改 dispatch public API，而是在所有受影響 raw-input owner 前建立同一個 pure guard，補齊 Trigger Normalizer 的前置不變量。

### 2.2 已由原始碼盤點與真實瀏覽器重現的缺口

| 類別 | 現況與重現 | 影響面 | 風險 |
|---|---|---|---|
| 共用任務拖曳 sensor | `SmartMouseSensor` 只排除 interactive target，沒有自己的 primary-only guard；目前原始 activator雖另有right防護，但中鍵移動超過8px會建立dnd drag session，且wrapper不應依賴dependency的隱含button政策 | 看板欄位／卡片／checklist、清單 row、工作台未歸位 row、共用任務側欄 | P0 |
| 甘特日期拉伸 | 主 bar 已檢查左鍵，但左右 resize handle 在 `stopPropagation()` 後直接呼叫 `handleDragStart` | task start/end date、依賴與工期視覺 | P0 |
| 三個面板 resizer | Workspace Sidebar、Task Workbench、Record Sidebar 的 `onPointerDown` 接受任何 button | 即時寬度、local preference、cursor/user-select owner | P1 |
| 心智圖關係線 | path／label hit target 的 pointer/mouse down/up 會以任何 button 選取；endpoint pointerdown 會以任何 button 進入 drag | selection、relationship anchor／reconnect、既有中鍵 pan owner | P0 |
| Modal backdrop | Task Details、Board Share、Calendar subscription delete 以任意 `mousedown` 關閉 | 意外關閉、Task Details 自動儲存時機、刪除確認流程中斷 | P1 |

已重現的直接證據包括：看板／清單中鍵移動產生 dnd dropped announcement、甘特中鍵按住 resize handle 進入 drag state、Workspace Sidebar 中鍵拖曳寬度由 288px 改為 316px，以及 Task Details 中鍵按 backdrop 後關閉。這些證據只證明目前 defect，不得在 RD 完成前標記為修正通過。

### 2.3 已安全或有意保留的入口

- `useKanbanMousePan` 已限制 `button === 0`。
- `MindMapView` 的 left direct pan 已限制 `button === 0 && pointerType === 'mouse'`；middle velocity pan 明確限制 `button === 1`。
- 甘特主 bar 的 move 與 primary mouseup 已限制 `button === 0`。
- 原生 `onClick`／button keyboard activation 不因本 DEV 改寫。
- 通用 popover、picker、menu 的 outside-dismiss 是「終止 transient layer」而非 primary semantic action；只要不提交 domain mutation，本 DEV 不強制改成左鍵限定。

## 3. 按鍵與輸入正規化契約

| 原始輸入 | 是否可成為 primary activation | 必須保留的語意 |
|---|---:|---|
| mouse `button=0` | 是 | 依目前 host mode 執行 primary action |
| mouse `button=1` | 否 | 不得 drag／resize／select／dismiss；心智圖可由 canvas middle-pan owner 接管 |
| mouse `button=2` | 否 | 只允許既有 context menu／secondary action，不得先執行 primary action |
| primary touch／pen，`button=0` 且 `isPrimary !== false` | 是，僅限原本就支援 Pointer Event 的入口 | 保留現有 touch／pen resizer 或 gesture owner；不得側向開放 mouse-only sensor |
| non-primary touch／pen，`isPrimary=false`，或 barrel／eraser 非 0 button | 否 | 不得取得新的 drag／resize owner |
| keyboard | 不適用 button guard | 既有 keyboard sensor、separator 方向鍵與 dialog keyboard 契約維持 |

任何被 guard 拒絕的事件必須在 `preventDefault()`、`stopPropagation()`、pointer capture、React state、DOM cursor、local preference 或資料寫入之前返回。這可讓中鍵事件繼續冒泡給有意的 canvas middle-pan owner，也保留右鍵原生／產品 context-menu 路徑。

## 4. Pure API 與架構邊界

新增 `src/interactions/pointerActivation.ts`，不得依賴 React、DOM、store 或 I/O：

```ts
export type PointerActivationLike = Readonly<{
  button: number;
  isPrimary?: boolean;
}>;

export const isPrimaryPointerActivation = (
  event: PointerActivationLike,
): boolean => event.button === 0 && event.isPrimary !== false;
```

契約說明：

- React `MouseEvent`、native `MouseEvent`、React `PointerEvent` 與 native `PointerEvent` 都可用結構型別傳入。
- `isPrimary` 缺省時視為 mouse-compatible；明確為 `false` 時 fail closed。
- helper 只判斷 raw input 是否有資格進入 primary 流程，不決定 action、permission、鎖定、資料狀態或 host profile。
- `useTaskInteractionBinding.dispatch(trigger)` 與 `InteractionTrigger` 型別本輪不改；call site 必須先完成 raw-input isolation，才可傳入 `pointer.primary`。
- 不建立 global event bus、不攔截 document 所有 pointer event、不修改 dnd-kit dependency。

## 5. 逐檔實作契約

| 檔案 | RD 必做變更 | 不可改變 |
|---|---|---|
| `src/interactions/pointerActivation.ts` | 建立上述 pure helper 與型別 | 不得讀 React／DOM／store |
| `src/hooks/useDragSensors.ts` | `SmartMouseSensor` 在 interactive-target 判斷與原始 activator 前，先以 `nativeEvent` 驗證 primary；非 0 button 回 `false` | 8px distance、KeyboardSensor、interactive selector、mobile long-press owner 不變 |
| `src/components/Gantt/GanttTaskBar.tsx` | `handleDragStart` 第一行做 defense-in-depth primary guard；左右 handle 在 `stopPropagation()` 前先拒絕非 primary，primary locked handle 仍須 stop 防止冒泡成 bar move；加穩定 `data-gantt-task-resize-handle="start|end"` | 主 bar click/menu、鎖定、日期計算、dependency propagation 不變 |
| `src/components/Sidebar.tsx` | `handleResizeStart` 在任何 side effect 前檢查 helper | clamp、方向鍵、account preference key 不變 |
| `src/components/TaskWorkbenchPanel.tsx` | 同上 | placement／filter／panel preference 不變 |
| `src/components/Records/RecordSidebar.tsx` | 同上；加 `data-record-sidebar-resize-handle="true"` | resize 方向、clamp、record workflow 不變 |
| `src/components/MindMap/MindMapRelationshipInteractionLayer.tsx` | 將 relationship pointer/mouse selection handler 型別收斂為含 button 的事件並先 guard；被拒絕時不得 prevent/stop/select；endpoint 維持呼叫 View adapter | keyboard click、double-click label edit、hover、label editor 不變 |
| `src/components/MindMap/MindMapView.tsx` | `startRelationshipPointerDrag` 在 permission、preventDefault、stopPropagation、capture 與 state 前先 guard | middle pan、scene geometry、relationship storage contract 不變 |
| `src/components/TaskDetailsModal.tsx` | backdrop 只在 `target===currentTarget && primary` 時關閉 | X／Escape／pinch close、自動儲存契約不變 |
| `src/components/BoardMembersPanel.tsx` | 同上；加 `data-board-share-backdrop="true"` | dialog content、permission／member mutation 不變 |
| `src/components/CalendarSubscriptionsView.tsx` | delete backdrop 只接受 primary；加 `data-calendar-subscription-delete-backdrop="true"` | `isDeleting` guard、確認／取消與 subscription mutation 不變 |
| `scripts/verify-dev-084-primary-pointer-isolation.ts` | pure button matrix、source ownership、必需 selector／guard 與 package wiring verifier | 不修改產品狀態 |
| `scripts/verify-dev-084-primary-pointer-isolation-browser.pw.js` | 依 QA-DEV-084 執行真實 mouse／pointer 負向矩陣、正向回歸與 evidence artifact | 不以直接 store／DOM mutation 偽造通過 |
| `package.json` | 新增 DEV-084 static 與 browser scripts | production／release scripts 不變 |

## 6. RD 執行 slices

| Slice | Owner | 交付 | Slice gate |
|---|---|---|---|
| S0 Failure-first | RD | 建立 pure／static verifier 與 browser defect cases，保存修正前 fail 摘要；fixture 與 data snapshot 可重複 | 至少重現 dnd、Gantt、resizer、mindmap、modal 五類；測試不得寫 production |
| S1 Normalizer + sensor | RD | 新 pure helper、SmartMouseSensor guard、board/list/workbench/shared negative matrix | 中／右鍵移動不出現 drag overlay、announcement 或順序變更；左鍵／鍵盤 regression PASS |
| S2 Resize owners | RD | Gantt 與三個 panel resizer guard、test selectors | 非 primary 不進 transient state、不改日期／寬度／preference；既有左鍵與方向鍵 PASS |
| S3 Mindmap owner arbitration | RD | relationship selection／endpoint guard | middle event 可交給 canvas pan；關係線不選取、不移動；左鍵 relationship regression PASS |
| S4 Backdrop dismiss | RD | 三個 modal backdrop primary-only | middle／right 保持 dialog 開啟；左鍵、X、Escape 與確認流程 PASS |
| S5 Integration handoff | RD → QA → QC | targeted regression、rendered evidence、Spec Drift 與文件狀態更新 | 全 AC／QA matrix PASS，零 visible error；未通過不得標 Implemented／QC PASS |

S0～S5 順序固定；每個 slice 第一個有效失敗即停止該 slice，記錄 raw button、target、viewport、前後 snapshot 與 screenshot，回 RD 修正後重跑該 slice 及其直接回歸。

## 7. 驗收條件

- `AC-084-001`：pure matrix 對 mouse 0 回 true、mouse 1/2 回 false；pointer `button=0,isPrimary=true/undefined` 回 true，`isPrimary=false` 或非 0 button 回 false。
- `AC-084-002`：看板欄位／卡片／checklist、清單 row、工作台未歸位 row、共用任務側欄以中鍵或右鍵移動 `> 8px` 時，drag overlay、drop marker、drag announcement 與 task order／parent 全不變。
- `AC-084-003`：相同 task surfaces 的左鍵拖曳與 KeyboardSensor 仍可建立／取消合法 session；interactive target 仍不啟動 drag。
- `AC-084-004`：甘特左右 resize handle 以中鍵／右鍵按壓、移動、放開後，drag state、start/end date、bar geometry 與 dependency result不變；主 bar 左鍵／右鍵既有行為維持。
- `AC-084-005`：Workspace Sidebar、Task Workbench、Record Sidebar 以中鍵／右鍵拖曳後，`aria-valuenow`、rendered width、persisted preference 與 body cursor/user-select 不變；左鍵與方向鍵仍可調整並清理 lifecycle。
- `AC-084-006`：心智圖關係線 path／label／endpoint 的中鍵不選取、不進 endpoint drag、不改 relationship storage；同一次中鍵拖曳可由既有 canvas middle-pan owner 改變 viewport scroll。右鍵不得觸發 relationship primary action。
- `AC-084-007`：Task Details、Board Share、Calendar delete dialog 的 backdrop 在中鍵／右鍵 `mousedown` 後保持開啟；左鍵 backdrop 仍關閉，dialog 內容按壓不關閉，Escape／X／confirm contract 不變。
- `AC-084-008`：右鍵 task menu、心智圖中鍵 pan、通用 transient outside-dismiss、primary touch／pen 與鍵盤操作不因共用 helper 被錯誤禁止。
- `AC-084-009`：所有非 primary 負向案例的 task／relationship／date snapshot 與 persistence observable 前後一致；不得產生 activity、undo entry 或 silent commit。
- `AC-084-010`：1440x900、1024x768 的真實 rendered mouse matrix及 390x844 mobile negative boundary 無重疊、卡住的 cursor/overlay、document overflow或 visible runtime error；console/page/request failure 與非預期 HTTP 4xx/5xx 為 0。
- `AC-084-011`：所有新 guard 都在 `preventDefault()`、`stopPropagation()`、pointer capture 與 state mutation 之前；static verifier 可追蹤上述逐檔 owner，沒有複製不同判斷式。
- `AC-084-012`：不修改 schema、API、permission、task/relationship model、provider、dependency version 或 production configuration。

## 8. 驗證命令與 evidence contract

必要命令：

```powershell
npm.cmd run verify:dev-084-primary-pointer-isolation
npm.cmd run verify:dev-084-primary-pointer-isolation-browser
npm.cmd run verify:core-regression-static
npm.cmd run verify:dev-028-cross-mode-task-interactions
npm.cmd run verify:dev-028-cross-mode-task-interactions-browser
npm.cmd run verify:dev-029-mobile-pan-first-interactions
npm.cmd run verify:dev-029-mobile-pan-first-interactions-browser
npm.cmd run verify:dev-046-universal-task-surface-drag
npm.cmd run verify:dev-046-universal-task-surface-drag-browser
npm.cmd run verify:dev-053-task-drag-muscle-memory-consistency
npm.cmd run verify:dev-053-task-drag-muscle-memory-consistency-browser
npm.cmd run verify:dev-054-mobile-task-drag-precision
npm.cmd run verify:dev-054-mobile-task-drag-precision-browser
npm.cmd run verify:dev-070-interaction-kernel
npm.cmd run verify:dev-070-interaction-kernel-browser
npm.cmd run verify:dev-077-mindmap-relationship-redline-cleanup
npm.cmd run verify:dev-077-mindmap-relationship-redline-cleanup-browser
npm.cmd run verify:dev-017-record-sidebar-resize
npm.cmd run verify:resizable-navigation-panels-browser
npm.cmd exec tsc -- -b --pretty false
npm.cmd exec eslint -- src/interactions/pointerActivation.ts src/hooks/useDragSensors.ts src/components/Gantt/GanttTaskBar.tsx src/components/Sidebar.tsx src/components/TaskWorkbenchPanel.tsx src/components/Records/RecordSidebar.tsx src/components/MindMap/MindMapRelationshipInteractionLayer.tsx src/components/MindMap/MindMapView.tsx src/components/TaskDetailsModal.tsx src/components/BoardMembersPanel.tsx src/components/CalendarSubscriptionsView.tsx
npm.cmd run build:test
git diff --check
```

主 artifact 固定為 `output/playwright/dev-084-primary-pointer-isolation/result.json`，至少包含 runtime/base URL、commit/worktree metadata、fixture IDs、viewport、每一 case 的 button／target／movement、before/after snapshots、modal count、drag/resize/selection telemetry、console/page/request/HTTP/visible error arrays、screenshots 與 required command results。圖片放在相同目錄；generated evidence 不加入 Git。

## 9. Failure recovery、資料與 runtime 邊界

- Browser verifier 只使用 local-test fixture 與真實 UI 操作；不得連 production、不得直接呼叫 store action、API mutation、DOM `dispatchEvent` 或寫產品資料來製造通過狀態。
- 每個負向案例先保存 task order/parent、Gantt date/geometry、panel width、relationship path/storage observable 與 modal count；結束後必須相等。
- 正向左鍵回歸若會改 local preference 或 fixture，必須在 `finally` 以相同 UI 流程回到起始值，並在 artifact 記錄 restoration；若無法復原則停止，不得帶著污染資料繼續。
- 任何 pointer lifecycle 結束後，drag overlay、resize state、pointer capture、body cursor/user-select、temporary modal 與 browser session 都必須清理。
- 若 browser gate 啟動 local runtime，先記錄專案、目的、port 4000、owner process tree 與 cleanup condition；完成後只停止本任務啟動的 runtime並確認 port 釋放。若重用同專案既有 primary runtime，不得停止。
- Slice rollback 只撤除 DEV-084 新增的 helper wiring、test selector 與 verifier；不得用 `git reset --hard`、不得還原使用者或其他 DEV 的 working-tree 變更。

## 10. Stop conditions 與 out of scope

以下任一情況立即停止並回 RD／PM：非 primary 仍可提交任務／日期／relationship／preference、右鍵 menu 失效、中鍵 mindmap pan 失效、primary touch／pen或 keyboard 被阻擋、左鍵 drag/resize 失效、guard 在 side effect 後才執行、visible error、stuck owner、需要改 schema／permission／backend，或測試只能靠直接 store／API mutation通過。

本輪不包含：重寫完整 Interaction Kernel、改 `dispatch(trigger)` signature、統一所有 transient outside-dismiss、修改 dnd-kit、增加全域 pointer capture、重設 drag threshold、改 mobile long-press、改 modal 視覺、資料 migration、commit／push／PR／merge／deploy／production smoke／release。

Future re-entry capsule：若後續再次出現第三種 scattered raw-input 漂移，另評估 typed raw-event adapter 或 ESLint rule，禁止 primary semantic dispatch 未經 input guard；這不是 DEV-084 完成條件。

## 11. ADR 與 RD Readiness

不新增 ADR。此修正直接實作 ADR-043 已接受的 `Raw Input → Trigger Normalizer` 與 single semantic dispatch 邊界，沒有更換架構、provider、資料模型或 interaction profile 合併策略；共用 pure helper 只是相容 hardening。

## 12. Implementation and verification evidence（2026-08-24）

S0～S5 已完成本地實作與完整 handoff。新增 `src/interactions/pointerActivation.ts` pure helper，並在 SmartMouseSensor、Gantt 主／兩個 resize handle、Workspace／Workbench／Record resizer、Mindmap relationship selection／endpoint、Task Details／Board Share／Calendar backdrop 於第一個 side effect 前接入；rejected event 不會 prevent／stop／capture／state mutate，既有 middle-pan owner 保留。Calendar local-test 以 query-gated、可重置 fixture 驗證刪除確認層，production/Supabase mutation contract 未改變。

Evidence：`npm.cmd run verify:dev-084-primary-pointer-isolation` PASS 7/7；`npm.cmd run verify:dev-084-primary-pointer-isolation-browser` PASS 13/13，artifact `output/playwright/dev-084-primary-pointer-isolation/result.json`，1440x900／1024x768／390x844，console/page/request errors=0；TypeScript、targeted ESLint（0 errors）、`build:test`、`git diff --check` PASS。DEV-028／029／046／053／054／070／076／077 與 resizable-navigation／DEV-017 required static/rendered regressions PASS。

Execution boundary：physical iPhone Safari／Android Chrome 未執行，390x844 為 automated Chromium boundary；這不阻塞本 desktop raw-button 修正，但不得宣稱真機完整通過。所有 required local-test static/rendered gates 已通過；未執行 commit、push、PR、merge、deploy 或 release。

RD Readiness：`PASS`；Implementation：`COMPLETE`；QA-QC：`PASS`；Release：`NOT RELEASED`。真機 supplemental gate 仍由後續 device-capable QA 流程管理，不回寫為本地 desktop PASS。
