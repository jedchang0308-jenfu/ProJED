# SPEC-055 電腦版任務拖拉落點清晰化與跨階層定位升級

狀態：Production Released / Automated QA-QC + User Desktop Acceptance + Level 4 Passed
關聯 DEV：DEV-055、DEV-053、DEV-054、DEV-046、DEV-051
QA 計畫：`ai-doc/qa/QA-DEV-055-desktop-task-drag-target-clarity.md`
風險等級：Medium-to-High（核心任務拖拉、跨階層 parent/order、桌機使用者已核准 baseline）
是否計入產品交付完成：是
來源：2026-07-17 使用者確認 DEV-054 手機 Rework 4 成功，且手機跨階層落點清楚度優於桌機，要求將成功經驗評估後寫成下一個桌機升級任務。後續 T01-T08 真實桌機操作回報未通過：同一格定位線會飄，且 L3+ 任務被定位線推開；本文件補入 RD Rework 1 契約與驗證。最新使用者 T01-T08 重驗已通過，且已完成 Firebase Hosting production release / Level 4 smoke。

## 1. 任務目標

DEV-055 要讓電腦版任務拖拉在跨欄、跨階層、卡片與 checklist 混合區域時，落點提示更穩定、單一、可預期，並確保畫面顯示的 before / after / append 與最後提交的 parent / order 完全一致。

本 DEV 不是重做桌機拖拉手感。使用者已滿意目前電腦版拖拉 UI，因此 RD 必須保留：

- 目前桌機 `DragOverlay` 外觀、滑鼠跟手感與 `dropAnimation={null}`。
- 目前桌機 drag start threshold、微小移動不誤拖、click / right-click 分流。
- 目前 `commitDesktopTaskDrag()` 對 task move、Workbench unplaced placement、undo merge key 的基本契約。
- Workbench placed row 不可拖，這是已確認產品決策。

## 2. 引導模式決策紀錄

以下採 `#引導模式` 將高影響產品/技術取捨寫入文件。使用者本輪未要求停下等待回答，且方向已由「手機成功經驗可否優化桌機」與「桌機現有 UI 很滿意」共同限定，因此採建議選項作為 RD contract；若使用者後續覆寫，回到本節更新。

1. 桌機升級策略

A. 桌機完全不動，只保留現狀
B. 直接移植手機 retain / hysteresis / action rail / touch lifecycle
C. 保留桌機輸入與 overlay，只吸收 canonical target、唯一落點 indicator、innermost ownership、bounded geometry

採用：C。原因：真正成功的是落點語意與目標歸屬清楚，不是手機觸控生命週期本身；C 可提高桌機清晰度，同時保護使用者已滿意的桌機肌肉記憶。
使用思考習慣：#差距分析、#系統描繪

2. 交付切片

A. 先做 Slice A 視覺落點一致化，通過後才做 Slice B collision geometry 精準化
B. 一次重寫 indicator、collision、commit 與所有 drag session
C. 只改 collision，不新增 live target indicator

採用：A。原因：桌機已可用，第一風險是越改越糟；先讓畫面只呈現一個 canonical live target，再動碰撞幾何，可把錯誤侷限在可回復切片。
使用思考習慣：#差距分析、#可驗證性

3. 視覺回饋原則

A. 全畫面只允許一個 live target insertion indicator，source placeholder 只能是中性佔位或明顯非 live target
B. 保留 source marker 與 target marker 同時顯示
C. 加文字 breadcrumb、倒數、鎖定提示或桌機 action rail

採用：A。原因：DEV-054 成功的關鍵之一是使用者能清楚判斷「現在會放到哪裡」；B 容易把來源佔位誤看成落點，C 會破壞桌機已核准的低干擾手感。
使用思考習慣：#可驗證性、#系統描繪

## 3. 目前架構事實

- `src/components/BoardView.tsx`
  - 桌機看板使用 dnd-kit `DndContext`、`DragOverlay`、`pointerWithin()` 與 `closestCorners()` 組合的 `collisionDetection`。
  - `DragOverlay` 目前位於 `BoardView.tsx`，使用 `data-kanban-drag-overlay="true"`，這是桌機核准 baseline 的核心之一。
  - `handleDragEnd` 目前透過 `commitDesktopTaskDrag()` 提交桌機拖放。
- `src/components/Wbs/taskDrag/taskDropIntent.ts`
  - `resolveTaskDropIntent()` 已是手機與桌機提交語意的 canonical resolver。
  - `desktopTargetTypeToSurfaceKind()` 已把 dnd-kit target type 映射到 `column-header`、`kanban-card`、`checklist-row`、`column-drop`、`checklist-drop`。
- `src/components/Wbs/taskDrag/taskDragCommit.ts`
  - `commitDesktopTaskDrag()` 已使用 `resolveTaskDropIntent()` 與 `isValidTaskDropIntent()`。
  - Workbench placed row no-drag guard 已存在：`activeData.source === 'task-workbench' && activeData.placement !== 'unplaced'` 回傳 no-op。
- `src/components/Wbs/KanbanCard.tsx`
  - 卡片 root 同時是 draggable 與 droppable，並有 `data-task-drop-surface-kind="kanban-card"`。
  - 手機 Rework 4 已用 `data-mobile-task-card-primary="true"` 限定卡片 primary geometry。
  - RD Rework 1 後，桌機 source placeholder 保持中性；card checklist append dropzone 改為 `data-desktop-dropzone-layout="overlay"`，不再以 inline marker 或高度動畫撐開內容。
  - 桌機任務拖曳期間，card / checklist sortable displacement 會凍結，target side 不再先替 indicator 讓位。
- `src/components/Wbs/KanbanChecklist.tsx`
  - checklist row 使用 `data-task-drop-surface-kind="checklist-row"`。
  - RD Rework 1 後，L3+ row 在桌機任務拖曳期間不接受 sortable transform 位移；落點只由 fixed overlay indicator 表達。
- `src/components/Wbs/KanbanColumn.tsx`
  - column header 使用 `data-task-drop-surface-kind="column-header"`。
  - column/card/checklist 的 nested droppable 仍可能造成 outer rect 與 inner target ownership 競爭。
- `src/components/Wbs/taskDrag/TaskDragPresenter.tsx`
  - 目前是 mobile drag-action presenter，不得直接擴成桌機 action rail。

## 4. Current Phase RD Handoff Contract

### 4.1 執行邊界

本 DEV 可由 RD 依序執行兩個切片：

- Slice A：桌機 canonical live target indicator 與 displayed intent / commit intent 一致化。
- Slice B：桌機 collision / geometry target ownership 精準化。

Slice A 通過 QA-055-A gate 前不得進 Slice B。Slice B 不得反向改動 Slice A 已通過的 overlay、source placeholder 與 single live target indicator 契約。

### 4.2 Scope

- 新增或抽出桌機 hover target preview helper，讓桌機拖曳中的 displayed target 也走 `resolveTaskDropIntent()`。
- 桌機 drag active 時，畫面任一時間只能渲染一個 live target insertion indicator。
- live target indicator 需標示 `data-desktop-drop-indicator="true"`、`data-desktop-drop-target`、`data-desktop-drop-position`、`data-desktop-drop-surface-kind`。
- live target indicator 必須是 fixed overlay，不得插入 card/checklist normal flow；定位線不得推開任何 L3+ sibling row。
- 同一 canonical target / position 內的微小 pointer movement 不得造成 indicator 視覺漂移；允許小幅 rect retain，但不得使用 stale target 提交。
- source placeholder 若保留，只能是中性佔位或明確標示為 source placeholder，不得使用與 live target 相同的 visual language。
- expanded card 的桌機幾何判定須使用 primary geometry，不得讓整張含 checklist 的 outer rect 搶走子任務落點。
- invalid ancestor blocking：若 innermost target 是來源本身、來源 descendant，或 resolver 判定 invalid，不得 fallback 到 ancestor card。
- before / after / append 的 indicator 位置必須與最後 `normalizeTaskMoveUpdates()` 後的 parent / order 可對應。
- 保留桌機 click-to-details、right-click context menu、dependency selection、record task selection、blank canvas mouse pan。

### 4.3 Out of Scope

- 不移植手機 retain、hysteresis、long-press、action rail、finger preview、edge scroll 或 touch lifecycle 到桌機。
- 不新增桌機 breadcrumb、倒數、鎖定文字、progress、教學文案或 action rail。
- 不改手機 DEV-054 的已通過行為。
- 不改資料庫 schema、Supabase function、RLS / RPC、task data model 或 migration。
- 不改任務詳情、命名流程、context menu action set、權限模型。
- 不重新啟用 DEV-052 或以重構名義重設計整套拖拉子系統。

### 4.4 Implementation Contract

1. Desktop drop preview helper

- 建議新增 `src/components/Wbs/taskDrag/desktopTaskDropPreview.ts`，或在 `taskDragTargetAdapter.ts` 中新增桌機專用 export。
- 輸入至少包含：`activeData`、candidate target data、latest `nodesRecord`、target DOM geometry。
- 輸出必須是單一 canonical preview descriptor：
  - `sourceNodeId`
  - `targetNodeId`
  - `targetSurfaceKind`
  - `displayPosition`
  - `intent`
  - `indicatorRect`
- helper 內部必須呼叫 `resolveTaskDropIntent()`；不得在 BoardView / component 內另寫一套 before / after / append 規則。
- 若 helper 無法產生 valid intent，必須回傳 `null`，並讓 UI 不顯示 live target indicator。

2. Desktop live indicator rendering

- 在 `BoardView.tsx` 新增桌機 drag preview state，於 `handleDragStart` 建立 session，`handleDragOver` 更新，`handleDragCancel` / `handleDragEnd` 清空。
- 新增桌機 indicator presenter，可直接在 `BoardView.tsx` render，也可抽成 `DesktopTaskDropIndicator`。
- indicator 使用 `KanbanInsertionMarker`，但 wrapper 必須具備 `data-desktop-drop-indicator="true"`。
- indicator wrapper 必須以 fixed overlay 呈現，並標記 `data-desktop-drop-indicator-layer="fixed-overlay"`；不得在 card 或 checklist normal flow 內插入可見 marker。
- indicator rect 預設以 target primary/title 左緣對齊；寬度不得小於 24px，且不得超出目前 target 所屬 column 的可視寬度。
- `append` 位置顯示在 target 可接收子任務區域底部；`before` / `after` 分別顯示在 target primary geometry top / bottom。
- 若下一次 preview 與上一個 preview 的 source / target / dndId / surfaceKind / displayPosition / parent / order / nodeType 完全一致，且 rect 差異在微小 retain 門檻內，可沿用前一個 rect 以避免同格視覺漂移。

3. Source placeholder rule

- 桌機拖曳時，source placeholder 不得渲染會被解讀為 live target 的 `KanbanInsertionMarker`。
- checklist append dropzone 若需擴大命中範圍，必須以 overlay hit area 實作，不得用 `h-6` / inline marker / height transition 推開任務。
- 允許做法：
  - source placeholder 保留原高度，內容透明或中性邊框。
  - source placeholder 若需要視覺提示，必須有 `data-kanban-drag-source-placeholder="true"` 且不得出現 `data-desktop-drop-indicator="true"`。
- 手機 `taskGesture.isActive` 下的 source placeholder 規則維持 DEV-054，不在本 DEV 擴張。

4. Desktop collision and ownership

- `BoardView.tsx` 的 `collisionDetection` 必須讓 nested task surface 採 innermost ownership：
  - checklist row 優先於 parent card。
  - explicit `wbs-checklist-drop` / `wbs-card-drop` 優先於 outer card 只有在 pointer 命中該 dropzone 時成立。
  - column header / column drop 不得搶走 card/checklist 的 direct hit。
- 對 expanded card，桌機需新增或沿用 generic primary marker：
  - `data-task-card-primary="true"` 作為桌機與手機共用語意。
  - 既有 `data-mobile-task-card-primary="true"` 可保留，避免 DEV-054 regression。
- 若 innermost target 對 `resolveTaskDropIntent()` invalid，collision list 不得 fallback 到 ancestor card 造成 wrong parent/order。

5. Commit equivalence

- `handleDragEnd` 的提交 target 必須與最後顯示的 canonical preview descriptor 同源。
- 若 drop 時 latest over / DOM / store state 已無法重新解析出與 indicator 相同的 target descriptor，必須 no-op，不得用 stale indicator 盲目提交。
- `commitDesktopTaskDrag()` 可保留現有 public shape，但若 RD 發現 `activeData + overData` 不足以保證 displayed/committed 一致，應新增 optional canonical target descriptor，並用同一個 helper 產生 intent。
- 所有提交仍必須經 `isValidTaskDropIntent()` 與最新 `useWbsStore.getState().nodes` revalidation。

## 5. Module / File Impact

預期修改：

- `src/components/BoardView.tsx`
  - desktop preview state、onDragOver indicator update、single indicator render、collisionDetection ownership refinement。
- `src/components/Wbs/KanbanCard.tsx`
  - 加上 `data-task-card-primary="true"`，調整桌機 source placeholder 不再渲染 live-target-like marker。
- `src/components/Wbs/KanbanChecklist.tsx`
  - 調整桌機 source placeholder 規則，保留 mobile DEV-054 behavior。
- `src/components/Wbs/KanbanColumn.tsx`
  - 必要時加上 column header/drop geometry metadata，避免 column 搶走 inner target。
- `src/components/Wbs/KanbanInsertionMarker.tsx`
  - 只在需要支援 desktop indicator wrapper class/data 時小幅調整；不得改變既有 marker 基本外觀。
- `src/components/Wbs/taskDrag/taskDropIntent.ts`
  - 若需要補 surface kind 或 helper type，可擴充；不得複製 resolver。
- `src/components/Wbs/taskDrag/taskDragCommit.ts`
  - 只在 displayed/committed equivalence 需要時擴充 canonical descriptor input。
- `src/components/Wbs/taskDrag/taskDragTargetAdapter.ts` 或新檔 `desktopTaskDropPreview.ts`
  - 放置桌機 target descriptor / indicator rect helper。
- `scripts/verify-dev-055-desktop-task-drag-target-clarity.mjs`
  - RD 新增 static verifier。
- `scripts/verify-dev-055-desktop-task-drag-target-clarity-browser.pw.js`
  - RD 新增 browser true-operation verifier。
- `package.json`
  - RD 新增對應 verify scripts。

預期不修改：

- DB schema、migration、Supabase backend、production deploy config。
- `TaskDragPresenter.tsx` 的 mobile action rail option set。
- 手機 DEV-054 的 long-press / action rail / finger preview lifecycle。

## 6. 驗收標準

- 桌機拖曳任務時，全畫面最多一個 `data-desktop-drop-indicator="true"`。
- 任一 visible live target indicator 的 `target / position / surfaceKind` 必須等於 drop 後實際 parent / order / nodeType 結果。
- checklist row 被 hover 時，parent card 不得搶走 target；若 checklist target invalid，不得 fallback 到 parent card。
- expanded card 的 outer rect 不得造成 pointer 在子任務區域時誤判為 card reorder。
- L3+ checklist row 作為 target 時，目標卡內所有 sibling row 的 `top` / `bottom` 不得因 indicator 顯示而位移。
- 同一 L3+ target 內連續微移時，indicator `target / position / surfaceKind` 不得變動，且 visible rect 不得漂移。
- card、checklist row、column header、column drop、checklist drop、Workbench unplaced placement 均維持可用。
- Workbench placed row 仍不可拖，且不可進入 mobile action rail 或 desktop drag session。
- 桌機 click 開詳情、right-click 開 context menu、微小移動 threshold、blank canvas mouse pan 不回歸。
- Undo 一次可還原一次 task move / placement，不拆成多筆不一致變更。
- DEV-046、DEV-053、DEV-054 指定回歸通過。
- 使用者以真實桌機操作同欄、跨欄、跨階層雙向拖拉後，主觀判定落點比 DEV-053 桌機 baseline 更清楚，且未覺得手感被重做。

## 7. Stop Conditions

RD 必須停止並回報，不得硬做完：

- 需要改變桌機 `DragOverlay` 外觀、位置偏移、dropAnimation、drag start threshold 或滑鼠跟手感。
- click / right-click / dependency selection / record task selection 任一桌機操作被 drag 改壞。
- 同一時間出現兩條以上 live target indicator，或 source marker 被使用者誤認為 live drop target。
- indicator 以 inline marker 或 height transition 推開 L3+ 任務。
- 同一 target / position 內，滑鼠微移造成定位線肉眼可見漂移。
- displayed indicator 與 final commit parent/order 任一案例不一致。
- invalid target fallback 到 ancestor，造成任務落到完全不相關位置。
- Workbench placed row 變成可拖。
- 手機 DEV-054 原成功路徑回歸。

## 8. QA / QC Evidence Required

完成 DEV-055 前至少需要：

- `npm.cmd run verify:dev-055-desktop-task-drag-target-clarity`
- `npm.cmd run verify:dev-055-desktop-task-drag-target-clarity-browser`
- `npm.cmd run verify:dev-053-task-drag-muscle-memory-consistency`
- `npm.cmd run verify:dev-053-task-drag-muscle-memory-consistency-browser`
- `npm.cmd run verify:dev-046-universal-task-surface-drag`
- `npm.cmd run verify:dev-046-universal-task-surface-drag-browser`
- `npm.cmd run verify:dev-054-mobile-task-drag-precision`
- `npm.cmd run verify:dev-054-mobile-task-drag-precision-browser`
- `npm.cmd run build`
- QA-055 桌機真實操作矩陣通過。

若 browser verifier 因環境因素無法執行，RD 可保留實作但不得標記 DEV-055 完成，需回報阻塞、失敗命令、第一個有效錯誤與人工替代證據。

## 9. Re-entry Triggers

需要使用者重新決策：

- 使用者要求改變桌機整體拖拉手感、overlay、drag threshold 或視覺樣式。
- RD 認為只有導入桌機 action rail、文字 breadcrumb、倒數或鎖定提示才能達成清晰度。
- Slice A 通過後，Slice B 仍需要重寫共用 drag session controller 或恢復 DEV-052 類大型重構。
- QA 真實操作發現新方案雖然自動化通過，但使用者覺得比原桌機手感差。

## 10. 變更紀錄

- 2026-07-17：依使用者正式部署指令，從 clean release worktree branch `codex/dev055-production-release-20260717-234436` artifact commit `e07ba4b` 發布 Firebase Hosting production。Level 2 local artifact smoke、Level 3 Firebase preview `level3-smoke`、Level 4 production `https://projed-cc78d.web.app` 均通過；正式站載入 `assets/index-DpRjvQu-.js` / `assets/index-B8eLAVHK.css`，線上 hash 與本機 production artifact 一致。
- 2026-07-17：使用者回報 RD Rework 1 後 T01-T08 測試通過，確認同格不飄、L3+ 不被定位線推開、桌機手感沒有被重做；DEV-055 completion gate 通過。
- 2026-07-17：RD Rework 1 完成。修正使用者 T01-T08 回報的兩項失敗：同一格定位線漂移、L3+ 任務被定位線推開。實作改為 overlay-only checklist append dropzone、桌機 task drag sortable displacement freeze、fixed overlay indicator rect micro-retain。DEV-055 static 27/27、browser B01-B16 16/16 通過；B15 證明 L3+ row top/bottom delta = 0、parentTransform = `none`、同格 indicator rect delta = 0。DEV-046/053/054 static/browser、TypeScript 與 build 亦通過。
- 2026-07-17：第一次 Slice A / B 自動化通過（已被後續 T01-T08 Attempt 1 失敗與 RD Rework 1 supersede）：DEV-055 static 25/25、browser 15/15、DEV-046/053/054 指定回歸、TypeScript 與 build 通過。當時 T01-T08 共 38 次使用者真實桌機操作與新版手感主觀確認仍為完成門檻。
- 2026-07-17：依使用者 `#引導模式` 要求，將 DEV-055 補為 RD Implementation Ready，建立桌機落點清晰化與跨階層定位升級契約。
