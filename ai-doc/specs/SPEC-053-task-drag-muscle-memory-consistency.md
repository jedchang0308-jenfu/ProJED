# SPEC-053：任務拖拉肌肉記憶一致化

狀態：Implemented / Local Static + Browser + QA True Operation Gate Passed / Production Not Deployed
對應 DEV：DEV-053
節點類型：交付點
關聯 DEV：DEV-028、DEV-029、DEV-039、DEV-046、DEV-052（Archived / Historical）
文件成熟度：Implemented Contract
風險等級：Medium（核心任務拖拉、桌機 / 手機手勢、看板任務、checklist、工作台任務列與既有驗證契約）
是否計入產品交付完成：是
建立日期：2026-07-17
最近更新：2026-07-17

使用思考習慣：#系統描繪、#可驗證性、#使用者視角

## 1. 問題摘要

使用者指出拖拉任務功能在電腦版與手機版的體驗仍不一致，使用者無法形成肌肉記憶。

盤查結論：問題不只是單一拖拉熱區，而是「任務表面、手勢入口、mobile action mode、Workbench placed / unplaced 行為、文件契約與 browser 驗證」尚未收斂成同一套可驗證心智模型。

### 1.1 RD 前基線證據

- `npm.cmd run verify:dev-046-universal-task-surface-drag`：通過 `27/27`。
- `npm.cmd run verify:dev-029-mobile-pan-first-interactions`：通過 `32/32`。
- `npm.cmd run verify:dev-029-mobile-pan-first-interactions-browser`：失敗，mobile action rail、edge auto-scroll、delete confirm、add-child、complete toggle 等多項 browser case 未通過。
- `npm.cmd run verify:dev-046-universal-task-surface-drag-browser`：失敗，mobile checklist surface 未找到預期拖拉目標。
- 程式事實：`BoardView.tsx` 仍集中持有 mobile action session、target hover、auto-scroll、global listeners、drop commit 與 dnd end；`useDragSensors.ts` 仍保留 `TouchSensor`；`TaskWorkbenchPanel.tsx` 的 placed row 已不可 dnd draggable，但 mobile long press 仍可能進入 action rail。

### 1.2 完成證據 - 2026-07-17

- DEV-053 static 30/30、browser 10/10 通過。
- DEV-029 static 37/37 與 38-case browser matrix 通過；short pan、long press、actions、reorder、edge auto-scroll、cancel 與 Workbench 路徑均由實際輸入事件驗證。
- DEV-046 static 29/29 與 5-case browser matrix 通過；桌機 same-column / cross-column card、checklist、column、blank-canvas pan 與 mobile whole-surface drag 均通過。
- DEV-039 placement static 31/31 與 browser 通過；unplaced -> placed 成功，placed reverse drag no-op。
- DEV-028 static 37/37 + browser、DEV-044 26/26、TypeScript 與 `build:test` 通過。
- `QA-DEV-053` T01-T14 全數 Pass；完整 route、viewport、前後狀態與截圖見 `ai-doc/qc/QC-DEV-053-task-drag-muscle-memory-consistency.md`。
- Physical phone supplemental not executed；production deploy 未執行。

### 1.3 Post-completion product finding - 2026-07-17

使用者後續以實際手機操作指出：手機 task drag 的 target 定位仍不如桌機穩定精準。DEV-053 的架構、功能、cleanup、viewport 與指定 browser flow 完成證據維持有效，不回寫為失敗；但 T01-T14 未量測重複真機操作的 first-release accuracy、adjacent-target wrong commit、finger occlusion 或 target jitter。

此缺口另立 `DEV-054`，以 `ai-doc/specs/SPEC-054-mobile-task-drag-precision.md` 與 `ai-doc/qa/QA-DEV-054-mobile-task-drag-precision.md` 為執行來源。DEV-054 通過前，不得以 DEV-053 的 synthetic touch / browser pass 宣稱「手機定位精準度」或「完整真機肌肉記憶一致性」已簽核。

## 2. Human Decision Brief - 2026-07-17

### 2.1 已確認決策

使用者以 HCS 引導模式回覆 `1C 2A 3A`：

- `1C`：第一版採完整拖拉子系統重構，不只做表層修復。
- `2A`：Workbench `placed row` 手機長按不進 action rail；只能點擊開詳情，避免任何「可拖」暗示。
- `3A`：DEV-053 自動化門檻為 static + browser verifier 通過；physical iOS / Android 實機列 supplemental，不阻塞 DEV 完成。
- QA True Operation Gate：使用者於 2026-07-17 加碼確認，除自動化 gate 外，必須依 `QA-DEV-053` 的真實操作驗證計畫逐項操作並全部通過，才可宣稱 DEV-053 完成。真實操作必須使用實際渲染頁面與滑鼠／觸控事件路徑，不得只靠 static、DOM 存在性或直接改 store 代替。
- Desktop Drag UI Freeze：使用者已明確表示「現在電腦版的拖拉 UI 方式已經很滿意」。DEV-053 的完整重構不得被解讀為桌機拖拉 UI 重設計；RD 必須保留目前電腦版拖拉起手、拖曳中回饋、drop 行為、click / right-click 分流與整體手感。

既有決策：

- Workbench `placed row` 不能拖。
- 已歸位任務列不得作為 placement drag source，也不得透過拖拉回到未歸位。
- `unplaced row` 仍可作為拖拉來源，用於將未歸位任務放入已歸位看板 lane。
- `placed row` 可保留點擊開詳情、右鍵選單與非 placement 操作，但 UI、data attribute 與 mobile 手勢不得暗示它可拖移位置。
- 若 RD 發現為了架構重構必須改變任何桌機拖拉 UI / 視覺回饋 / 操作路徑，必須停止並 Human Re-entry；不得把 UI 改動包裝成內部重構。

### 2.2 覆寫範圍

本決策覆寫 DEV-039 舊版 Phase 1B / Phase 2A 中「未歸位與已歸位可雙向拖移」與「已歸位 row 也要共用 draggable root」的描述。DEV-039 既有 QA/QC 中相關案例保留為歷史證據，不再作為目前產品契約。

本決策也覆寫 DEV-046 中 Workbench placed row 納入 whole-surface drag 的舊描述。DEV-046 whole-surface drag 仍適用於 Kanban card、checklist row、WBS list row、task-backed column/header 與 Workbench `unplaced row`。

DEV-052 已封存為 historical reference；不得直接恢復或以 DEV-051 parent-lock baseline 作為本 DEV 基準。DEV-053 可吸收其分層思想，但必須以目前 `main` runtime 與本文件決策為唯一基準。

## 3. 使用者價值

- 使用者在桌機與手機只需記住同一套任務操作模型。
- 使用者已滿意的電腦版拖拉 UI 不被重構破壞；本 DEV 的價值是保留桌機手感、補齊手機與事件仲裁一致性。
- 平台可使用不同手勢，但同類任務表面的結果、限制與回饋必須一致。
- Workbench visually similar 的 row 不應一個可拖、一個看似可拖但實際被擋；若 placed row 不能拖，必須明確是 read-only placement list entry。
- 拖拉失敗不得造成重複、錯位、誤刪、殘留 overlay 或下一次操作卡死。

## 4. 目標心智模型

### 4.1 桌機

- 點擊任務：開啟任務詳情。
- 任務 surface 拖曳超過門檻：開始任務排序 / 移動。
- 右鍵任務：開啟完整任務選單。
- 空白看板拖曳：平移看板，不搶任務拖拉。
- Workbench `unplaced row`：可拖到已歸位看板 lane。
- Workbench `placed row`：不能拖；只作為已歸位任務列表項，可點擊 / 右鍵操作。
- 現有桌機拖拉 UI / 操作方式為 approved baseline；不得新增拖曳把手、鎖定文字、倒數、進度條、breadcrumb、額外狀態標籤或新的桌機 action rail。

### 4.2 手機

- 點一下任務：開啟任務詳情。
- 短滑：優先捲動畫面或看板。
- 長按可拖任務 surface：進入 mobile task action mode。
- 長按後若任務可拖，可移到有效落點或 action rail。
- 放到無效區：取消。
- 刪除：只開確認，不可直接刪。
- Workbench `placed row`：長按不進 action rail、不浮起、不進 placement drag，只維持 quick tap details。

## 5. Current Phase Scope

### 5.1 In Scope

- 建立完整任務拖拉子系統重構，以單一 session controller 統一桌機 dnd-kit 與手機 long-press action session。
- Characterize 並凍結目前電腦版拖拉 UI baseline；後續重構只能保留或修復，不得重新設計桌機拖拉體驗。
- 建立共用 task gesture surface contract，統一 Kanban card、Kanban checklist row、task-backed column/header、Workbench unplaced row 與後續 WBS list row 的 tap / pan / long-press / drag 入口。
- 手機 coarse pointer 下，禁止 dnd-kit `TouchSensor` 與自訂 mobile long-press session 同時競爭同一段 gesture。
- Workbench placed row 明確 read-only for placement：不掛 draggable root、不進 mobile action rail、不允許 placed -> unplaced persistence。
- 修復 DEV-029 / DEV-046 browser verifier 目前失敗項。
- 新增 DEV-053 static + browser verifier，並更新 package scripts。
- 執行 QA 真實操作驗證計畫，保存桌機／手機 viewport、操作步驟、前後狀態、截圖與 visible-error sweep 證據。
- 同步 DEV-039 / DEV-046 文件與 verifier，移除 placed-row draggable parity 的現行驗收。

### 5.2 Out of Scope

- 不復活 DEV-051。
- 不直接執行 archived DEV-052 Slice A-F；本 DEV 另立以目前 `main` runtime 為基準的新實作。
- 不新增跨父層 750ms lock、parent-lock UX、breadcrumb、Level、鎖定文字、progress bar 或新的 drop-intent 視覺語意。
- 不改變目前使用者已滿意的電腦版拖拉 UI / 視覺回饋 / 操作方式；任何桌機 UX 變更都需 Human Re-entry。
- 不改 DB schema、migration、RLS、RPC、正式資料或 production deploy。
- 不新增手機 action rail action set；仍維持完成 / 新增同階 / 新增下階 / 刪除確認。
- 不把 Workbench placed row 改成可拖。

## 6. Current Architecture Impact

### 6.1 受影響模組

- `src/components/BoardView.tsx`
- `src/components/Wbs/KanbanCard.tsx`
- `src/components/Wbs/KanbanChecklist.tsx`
- `src/components/Wbs/KanbanColumn.tsx`
- `src/components/Wbs/mobileTaskActionContext.ts`
- `src/components/TaskWorkbenchPanel.tsx`
- `src/hooks/useDragSensors.ts`
- `src/hooks/useLongPress.ts`
- `src/hooks/useTouchTapGuard.ts`
- `src/hooks/useMobilePanBroker.ts`
- `src/hooks/useKanbanMousePan.ts`
- `src/store/useWbsStore.ts`（只允許使用既有 `batchUpdateNodes` / undo contract；除非 verifier 證明現有 contract 不足，否則不改 store schema）
- `src/features/taskWorkbench/placement.ts`
- `src/features/taskWorkbench/source.ts`

### 6.2 新增模組建議

建立 `src/components/Wbs/taskDrag/`：

| 檔案 | 責任 |
|---|---|
| `taskDragTypes.ts` | 定義 input mode、source kind、target kind、session state、observation、presentation 與 commit result。 |
| `taskGesturePolicy.ts` | 定義桌機 / 手機 gesture policy、interactive target suppression、placed-row read-only rules。 |
| `useTaskGestureSurface.ts` | 統一 task surface bindings：click、right-click、touch tap guard、long press、data attributes、suppressed controls。 |
| `taskDragTargetAdapter.ts` | 將 dnd-kit over、point hit-test、mobile action rail、drop target DOM 轉成單一 normalized observation。 |
| `useTaskDragSession.ts` | 管理 session id、terminal guard、latest observation、auto-scroll、global cancel、failsafe、at-most-once commit。 |
| `taskDragCommit.ts` | 以最新 store snapshot revalidate，執行 move / workbench placement / mobile action，回傳 committed / no-op reason。 |
| `TaskDragPresenter.tsx` | 顯示唯一 preview、action rail、drop indicator；不做 hit-test、不寫 store。 |

### 6.3 BoardView Exit Gate

DEV-053 完成後，`BoardView.tsx` 不得直接持有：

- `mobileTaskAction` state/ref/failsafe/auto-scroll frame。
- `resolveMobileTaskHover`、`executeMobileTaskDrop`、`executeMobileTaskAction` 這類 session 內部目標與提交邏輯。
- `window.addEventListener('touchmove'/'touchend'/'touchcancel')` 的 mobile task session listener。
- action rail / drop target priority。
- Workbench placement commit 與 Kanban reorder/move commit 的混合 fallback。

`BoardView.tsx` 只保留：

- DndContext wiring。
- Store / permission callbacks 注入。
- Board canvas refs。
- `TaskDragPresenter` 渲染。

## 7. Implementation Contract

### 7.1 Normalized Source

```ts
type TaskDragInputMode = 'mouse' | 'keyboard' | 'touch';
type TaskDragSourceKind = 'kanban-card' | 'checklist-row' | 'column-header' | 'wbs-list-row' | 'workbench-unplaced-row';

interface TaskDragSource {
  nodeId: string;
  kind: TaskDragSourceKind;
  inputMode: TaskDragInputMode;
  originBoardId?: string | null;
  originWorkspaceId?: string | null;
}
```

Forbidden source：

- Workbench `placed row` 不得產生 `TaskDragSource`。
- viewer / no-move permission 不得產生 draggable source。
- interactive controls 不得產生 draggable source。

### 7.2 Normalized Target Observation

```ts
type TaskDragTargetKind =
  | 'task-position'
  | 'workbench-placed-lane'
  | 'mobile-action'
  | 'none';

interface TaskDragObservation {
  sessionId: string;
  sequence: number;
  inputMode: TaskDragInputMode;
  source: TaskDragSource;
  targetKind: TaskDragTargetKind;
  targetNodeId: string | null;
  action: MobileTaskAction | null;
  dropPosition: 'before' | 'after' | null;
  indicatorRect: { left: number; top: number; width: number } | null;
  pointer: { x: number; y: number } | null;
  observedAt: number;
}
```

Priority 固定：

1. mobile action rail。
2. valid task position drop。
3. workbench placed lane（只接受 unplaced source）。
4. none。

不得同一 release 同時提交 action 與 move。

### 7.3 Session Contract

- 每個 session 有唯一 `sessionId`。
- 每幀最多一個 latest observation。
- 每個 session 最多一次 terminal transition：`committed | cancelled | no-op`.
- terminal 後的 move / end / timer / stale callback 必須被忽略。
- Escape、blur、pagehide、visibility hidden、pointercancel、touchcancel、unmount 都走同一 cleanup。
- cleanup 後 preview、indicator、source hidden、hover action、auto-scroll RAF、failsafe timer 必須全清。
- Auto-scroll 只能更新 pointer 後重新建立 observation；不得直接提交舊 target。

### 7.4 Mobile Contract

- `useDragSensors` 在 mobile action mode / coarse pointer 下不得啟用 `TouchSensor` 處理 task drag。
- 手機 task drag 只由 `useTaskDragSession` 的 long-press session 管理。
- quick tap 仍開 details。
- short pan 超過 tolerance 時取消 long press，並交由 board / column / panel scroll。
- Workbench placed row 的 touchstart 只走 tap guard；不得註冊 mobile task action long press。
- action rail 不出現在 Workbench placed row 長按。
- delete action 只開 confirmation，不直接 delete。

### 7.5 Workbench Contract

- `unplaced row`：
  - desktop 可拖到 placed lane。
  - mobile 若進 action mode，只能對 unplaced task 操作。
  - 可點擊開詳情、右鍵開 task menu。
- `placed row`：
  - desktop 不掛 `useDraggable`、不暴露 `data-task-workbench-drag-surface`。
  - mobile 不進 action rail、不浮起、不觸發 drag preview。
  - 可點擊開詳情、右鍵開 task menu。
  - 嘗試拖回 unplaced 必須 no-op，且不得寫入 local unplaced storage。

### 7.6 Data / API / Permission Impact

- 不新增 DB schema、migration、RLS、RPC 或外部 API。
- 不改 `TaskNode` 型別。
- 不改 production data。
- Permission 使用既有 `useBoardPermissions()`：`canMoveTask` 控制 drag source，`canEditTask/canCreateTask/canDeleteTask` 控制 mobile action availability。
- Workbench unplaced persistence 使用既有 `TASK_WORKBENCH_UNPLACED_BOARD_ID` 與 placement helper；placed row 禁止寫入 unplaced local persistence。
- Store write 只透過既有 `batchUpdateNodes` / `addNode` / `removeNode` / `updateNode`，並維持 DEV-044 undo grouping。

## 8. RD Execution Slices

| Slice | Execution boundary | 輸出 | Gate | Stop condition |
|---|---|---|---|---|
| A Baseline characterization | 先執行 | 記錄使用者已滿意的 desktop drag UI baseline、DEV-029 / DEV-046 browser current failures，建立 DEV-053 verifier skeleton | desktop baseline screenshots / traces、failure list 與 logs 可追溯 | 無法重現目前 desktop baseline、failure 或 fixture 失效 |
| B Gesture policy + source contract | A 後 | `taskGesturePolicy`、`useTaskGestureSurface`、placed row no-source rule | static gate 能證明 source / suppression / placed-row rules | placed row 仍可產生 drag source |
| C Session controller + target adapter | B 後 | `useTaskDragSession`、normalized observation、terminal guard、auto-scroll coordination | pure / static tests 覆蓋 at-most-once、cleanup、target priority | action 與 move 可能 double-submit |
| D Presenter + mobile action | C 後 | `TaskDragPresenter`、action rail、preview、indicator | browser geometry / action rail tests | preview / indicator 殘留或 placed row 長按出現 rail |
| E Commit integration | D 後 | move / placement / action commit revalidation，BoardView exit gate | DEV-029 / DEV-046 / DEV-039 / DEV-044 regressions | store write bypass terminal guard |
| F QA hardening | E 後 | DEV-053 static + browser 全通過，更新 docs | required commands pass | browser failure 未修卻宣稱完成 |

每個 slice 必須移除被新 controller 取代的同類 runtime path；不得長期保留新舊兩套 session / commit 邏輯。

## 9. Required Files / Scripts

新增：

- `src/components/Wbs/taskDrag/taskDragTypes.ts`
- `src/components/Wbs/taskDrag/taskGesturePolicy.ts`
- `src/components/Wbs/taskDrag/useTaskGestureSurface.ts`
- `src/components/Wbs/taskDrag/taskDragTargetAdapter.ts`
- `src/components/Wbs/taskDrag/useTaskDragSession.ts`
- `src/components/Wbs/taskDrag/taskDragCommit.ts`
- `src/components/Wbs/taskDrag/TaskDragPresenter.tsx`
- `scripts/verify-dev-053-task-drag-muscle-memory-consistency.mjs`
- `scripts/verify-dev-053-task-drag-muscle-memory-consistency-browser.pw.js`
- package scripts:
  - `verify:dev-053-task-drag-muscle-memory-consistency`
  - `verify:dev-053-task-drag-muscle-memory-consistency-browser`

修改：

- `src/components/BoardView.tsx`
- `src/components/Wbs/KanbanCard.tsx`
- `src/components/Wbs/KanbanChecklist.tsx`
- `src/components/Wbs/KanbanColumn.tsx`
- `src/components/TaskWorkbenchPanel.tsx`
- `src/components/Wbs/mobileTaskActionContext.ts`
- `src/hooks/useDragSensors.ts`
- `src/hooks/useLongPress.ts`
- `ai-doc/specs/SPEC-039-task-filter-core-and-workbench-profiles.md`
- `ai-doc/specs/SPEC-046-universal-task-surface-drag.md`
- `ai-doc/qa/QA-DEV-039-task-filter-core-and-workbench-profiles.md`
- `ai-doc/qa/QA-DEV-046-universal-task-surface-drag.md`
- `ai-doc/qa/QA-DEV-053-task-drag-muscle-memory-consistency.md`
- `ai-doc/dev_task.md`
- `ai-doc/documentation_map.md`

不得修改：

- DB migration files。
- production release artifacts。
- archived DEV-052 作為 executable contract。

## 10. Acceptance Criteria

### 10.1 Product Behavior

- Desktop Kanban card、checklist row、task-backed column/header 可從 task surface 拖拉，click / drag / right-click 不互相誤觸。
- Desktop drag UI / visual feedback / operation path 與使用者已滿意 baseline 等價；不得新增拖曳把手、鎖定文字、倒數、進度條、breadcrumb 或桌機 action rail。
- Mobile quick tap 開詳情，short pan 捲動，long press 可拖 task surface 進 action mode。
- Mobile action rail 的完成、新增同階、新增下階、刪除確認、position drop、edge auto-scroll browser cases 通過。
- DEV-046 mobile checklist / child row whole-surface drag browser case 通過。
- Workbench unplaced row 可拖入 placed lane。
- Workbench placed row 不可拖回 unplaced，不可 reorder，不進 mobile action rail，不出現 drag preview，不寫 local unplaced persistence。
- Placed row UI / data attribute 不暴露 draggable root、drag handle 或 draggable parity 語意。
- 320px、390px、430px、1024px、1440px viewport 無 action rail 裁切、重疊、水平 overflow 或 visible runtime error。

### 10.2 Architecture

- `BoardView.tsx` 通過 Exit Gate。
- `useDragSensors.ts` 在 mobile action mode / coarse pointer 下不啟用 task TouchSensor。
- Surface binding 由 `useTaskGestureSurface` 或等效 helper 統一輸出。
- 一個 session 最多一次 commit。
- target priority 只有一份來源。
- Presenter 不做 hit-test、不寫 store。
- Committer release 前使用最新 store snapshot revalidate。
- Workbench placed row 不會產生 `TaskDragSource`。

### 10.3 Completion Gate

依使用者決策 `3A` 與 2026-07-17 QA 補充，DEV-053 完成需同時具備：

1. static verifier 全數通過。
2. browser verifier 與指定 regression browser commands 全數通過。
3. `QA-DEV-053` 的 QA True Operation Gate 全數通過，並留下 route、viewport、操作步驟、前後資料狀態、截圖／trace、visible-error sweep 與結論。

Physical iOS / Android 實機為 supplemental，不阻塞 DEV done；但未執行時不得宣稱「真機手感已簽核」。

## 11. Required Commands

新增並通過：

```powershell
npm.cmd run verify:dev-053-task-drag-muscle-memory-consistency
npm.cmd run verify:dev-053-task-drag-muscle-memory-consistency-browser
```

必跑回歸：

```powershell
npm.cmd run verify:dev-029-mobile-pan-first-interactions
npm.cmd run verify:dev-029-mobile-pan-first-interactions-browser
npm.cmd run verify:dev-046-universal-task-surface-drag
npm.cmd run verify:dev-046-universal-task-surface-drag-browser
npm.cmd run verify:dev-039-task-workbench-placement-lanes
npm.cmd run verify:dev-039-task-workbench-placement-lanes-browser
npm.cmd run verify:dev-028-cross-mode-task-interactions
npm.cmd run verify:dev-028-cross-mode-task-interactions-browser
npm.cmd run verify:dev-044-undo-coverage
npm.cmd exec tsc -- --noEmit
npm.cmd run build:test
```

若 command 更名，RD 必須在 evidence 中列出替代 command 與覆蓋對照，不得靜默略過。

## 12. Stop Conditions

下列任一項發生即停止，不得宣稱完成：

- Workbench placed row 被重新做成可拖，或 verifier 仍要求 placed -> unplaced drag。
- 電腦版拖拉 UI / 視覺回饋 / 操作路徑被改變，且沒有使用者新確認。
- Workbench placed row 手機長按進 action rail。
- mobile short pan 被 long-press / drag sensor 攔截，導致捲動或 quick tap 回歸。
- action rail target 與 task position drop 同時提交。
- cancel / pointercancel / touchcancel / blur / visibility hidden 後仍保留 preview、overlay、source hidden 或 pending target。
- 同一 session batch count > 1。
- Browser verifier 失敗但只以 static pass 宣稱完成。
- QA 真實操作驗證計畫尚未執行、任一必要案例失敗，或缺少可追溯操作證據卻宣稱完成。
- DEV-052 archived contract 被作為 executable source of truth。

## 13. Deferred Scope Audit

- Physical iOS Safari / Android Chrome：Supplemental；不阻塞 DEV-053 done，但若未執行，不得宣稱真機手感已簽核。
- Production release：Release Gate Required；收到 release 型指令後才建立 release artifacts。
- DEV-051 parent-lock / 750ms cross-parent lock：Out of scope；如需重啟需另立 DEV。
- 其他模式共用 drag engine（MindMap / Gantt）：Future Phase Captured / Not Requested。

## 14. Related Documents

- `ai-doc/specs/SPEC-029-mobile-pan-first-touch-interactions.md`
- `ai-doc/specs/SPEC-039-task-filter-core-and-workbench-profiles.md`
- `ai-doc/specs/SPEC-046-universal-task-surface-drag.md`
- `ai-doc/archived/SPEC-052-kanban-drag-subsystem-refactor.md`
- `ai-doc/qa/QA-DEV-029-mobile-pan-first-touch-interactions.md`
- `ai-doc/qa/QA-DEV-046-universal-task-surface-drag.md`
- `ai-doc/qa/QA-DEV-053-task-drag-muscle-memory-consistency.md`
