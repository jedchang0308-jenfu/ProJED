# SPEC-041 - Task Zone Command Center and Direct Drag Placement

Status: RD Implementation Ready / Human Confirmed / Spec + QA Ready
Owner: PM / Product + RD
Date: 2026-07-01
Related:
- SPEC-002 - Whole-person Todo Platform
- SPEC-040 - Personal Task Zone and Quick Task Entry
- SPEC-028 - Cross-mode Trello-like Task Interactions
- DEV-040 - 任務專區與快速任務入口
- DEV-028 - 四模式一致的 Trello-like 任務操作契約

## 1. Human Decision Brief

Confirmed user intent:
- 使用者在 `任務專區` 看到 `待歸位` 任務時，不應需要猜「要怎麼歸位」。
- 之前快速備忘在看板內可以直接拖拉到任務位置；任務專區任務也應做到同一種歸位體驗。
- 任務專區卡片拖曳到看板時，定位框、插入線、浮動預覽與一般任務拖移必須一致。
- 不應再另外寫一套任務專區專用拖移動畫或半套歸位流程。
- 使用者的核心視線流是：左側找大方向與任務來源，中間處理看板 / 任務結構，右側看細節或編輯。
- `任務專區` 未來要升級成個人待辦任務中控台：跨工作區、跨看板、跨系統，把屬於自己的任務依時間與行動優先級集中呈現。
- `1C`: BoardView 左側任務專區 panel 採使用者可釘選模式；預設情境式展開，但使用者可釘選成固定第二左欄，系統記住上次狀態。
- `2C`: DEV-041 第一版直接加做 ProJED 內部 `我的任務` MVP，顯示跨工作區指派給我的任務；外部來源與完整動態牆仍延後。
- `3A`: 未來動態牆 / 外部任務採行動流優先；外部任務需先 `轉成 ProJED 任務` 才能拖進看板。
- RD readiness addendum:
  - `我的任務 MVP` 與訂閱月曆共用或延伸同一套 source-scope / filter 模組；差異是任務中控台可選工作區與看板。
  - `我的任務` 預設訂閱所有 `指派給我` 的項目，但使用者可控制訂閱範圍。
  - 左側 panel pin/collapse 狀態採本機裝置偏好，不做雲端同步。
  - `我的任務` 卡片第一版與一般任務卡片同功能；標題、日期、狀態、完成、刪除、拖曳等操作都應走 canonical task 行為與權限檢查。

Product decision:
- DEV-041 的核心不是新增一個 `歸位` 按鈕，而是把 `任務專區` 的未歸位任務納入正式任務拖移系統。
- `任務專區` 是跨工作區任務暫存池；開始拖曳後，它應被視為正式 task drag source。
- `任務專區` 的主要 UI 位置應屬於左側來源層，不應放在右側 detail area。
- Full-page `TaskZoneView` 仍可作為總整理 / 快速建立 / 跨工作區檢視入口；精準歸位時，必須讓左側任務來源與中間目標看板同時可見，並共用同一個 board DnD context。

AI-filled decisions for RD readiness:
- 最小可交付方式：在 BoardView 左側提供 integrated `任務專區` source panel，該面板不是第二個浮窗，而是同一個任務專區在看板內的來源層呈現。
- 左側 source panel 需支援 pin/unpin，並保存使用者偏好；從 `任務專區` 進入 placement mode 時可自動展開。
- `TaskZoneView` full page 上的卡片可以提供明確 `前往看板歸位` / `開啟歸位模式` 入口，但第一版不強制要求跨 route 拖曳不中斷，因為 route switch during drag 容易造成 DnD state 丟失與定位框不一致。
- 真正的精準歸位必須在看板可見時完成：使用者從左側任務專區 source panel 拖出卡片，直接放到中間看板欄位、卡片間、子任務區或空欄位。
- 若 RD 能安全支援從 full-page task-zone 拖到 sidebar board item 並自動開啟目標 board placement mode，可列為 enhancement；不得取代 board-visible 精準定位流程。
- `我的任務` MVP 應聚合 ProJED 內部、目前 authenticated user 可讀且符合訂閱 filter 的任務；預設 filter 為所有可存取 workspace / board 中 `指派給我` 的任務，不得繞過 workspace/project 權限。
- `我的任務` filter/panel layout 偏好採 localStorage 或等效 local device preference；不新增 DB migration 來保存 UI 偏好。

Re-entry triggers:
- 若產品要支援「從任務專區 full page 直接拖到不可見看板中的精確任務位置」，需回 PM 拆成更高風險的跨 route DnD / portal architecture。
- 若 RD 需要替換現有 dnd-kit / task drag primitives，需回 PM/RD 主管審查，避免破壞 DEV-028 與 DEV-040。
- 若需要新增資料表、改 task identity、或改 `place_personal_task_on_board` RPC 語意，需另補 ADR 或 DEV。

## 2. Problem Statement

DEV-040 已將快速輸入升級成 `任務專區`，並以 canonical task 儲存 `待歸位` 任務。但使用者在 full-page `任務專區` 看到任務時，仍缺少直覺歸位路徑：
- 目標看板不在同一畫面，無法直接看到可 drop 的欄位、任務間距或子任務位置。
- 如果只靠 `回到工作區總覽` 或進入看板後再找任務，使用者會失去「先記下來，之後拖進任務」的肌肉記憶。
- 若任務專區另寫一套拖移或只提供按鈕式歸位，會再次分裂成兩種任務移動體驗。

真正要解決的問題：
- 任務專區任務要能像正式任務一樣被拖曳。
- 使用者要在看得到目標位置的情境下直接 drop。
- DnD overlay、drop indicator、定位框、排序語意與 persistence 必須完全沿用正式任務拖移。
- 任務專區的位置要符合產品資訊流：左側是來源與中控，中央是任務結構，右側是細節。

Long-term product problem:
- 使用者的任務不只存在於目前看板。
- 未來會有跨 workspace / project 的 `我負責`、`我建立`、`即將到期`、`逾期`、`最近更新`。
- 未來也可能有外部系統來源，例如 Google Tasks、Jira、Notion、Email action items 或其他任務來源。
- 如果 DEV-041 只做成某個看板的局部浮窗，未來會變成必須拆掉的短期設計。

## 3. Goals

P0 goals:
- 在 board-visible context 的左側來源層提供 `任務專區` 待歸位任務來源。
- 使用者可直接拖曳任務專區卡片到看板任務位置。
- 拖曳 overlay、定位框、insert line、drop zone highlight 與一般任務拖移一致。
- drop 成功後呼叫既有 personal task placement service / RPC，保留同一 task id，並從 `待歸位` 移除。
- normal board task drag/drop 不得回歸或改變手感。
- 建立未來個人任務中控台的 UI 骨架：左側任務來源 panel 可擴充成跨工作區、跨看板與外部任務來源入口。
- 第一版納入 ProJED 內部 `我的任務` MVP，讓使用者能在任務專區看到符合訂閱 filter 的跨工作區任務；預設為 `指派給我`。
- `我的任務` 卡片第一版可執行與一般任務卡片一致的核心操作，並沿用既有 task permission guard。

P1 goals:
- Full-page `TaskZoneView` 應提供清楚的歸位入口，不讓使用者困在「我要如何歸位」。
- 若使用者目前有 active board，`TaskZoneView` 可提供 `回到目前看板並開啟歸位模式`。
- 若沒有 active board，先選 board / workspace，再進入 board placement mode。
- Full-page `TaskZoneView` 可逐步升級成個人任務中控台首頁，顯示待歸位、我的任務、近期、逾期與動態牆。

P2 goals, deferred:
- 從 full-page task-zone 卡片拖到 sidebar board item 後自動切換到 board placement mode。
- 跨 workspace / project 搜尋目標任務後直接定位。
- 批次歸位多筆任務。
- Mobile touch drag enhanced flow。
- 動態牆：依時間排序重要任務事件，但必須是 action-oriented feed，不做純流水帳。
- 外部任務來源 read-only aggregation 與轉成 ProJED 任務。

## 4. Non-goals

This DEV does not authorize:
- 新增第二套任務拖移 engine。
- 新增任務專區專用定位框或 overlay 視覺語言。
- 重做 `place_personal_task_on_board` 的資料語意。
- 新增 global task table、nullable `wbs_items.project_id` 或改 task identity。
- AI 自動判斷應放到哪個看板 / 任務。
- 批次整理、今日計畫、通知、行事曆或 reminder。
- Production deploy by itself。

## 5. UX Contract

### 5.1 User-facing model

使用者模型：
- `任務專區` 是還沒決定歸屬的任務池。
- `任務專區` 也是未來個人任務中控台，不只屬於某個看板。
- 歸位不是轉換，不是建立副本，而是把同一個任務拖到它應該存在的位置。
- 只要進入看板歸位模式，拖移手感就跟一般任務完全一樣。
- 資訊層級固定為：左側找來源，中間放入結構，右側看細節。

Recommended copy:
- Full page hint: `要放到看板？開啟看板歸位模式後，直接拖到任務位置。`
- Active board CTA: `到目前看板歸位`
- No active board CTA: `選擇看板歸位`
- Left source panel title: `任務專區`
- Left source panel subtitle: `從這裡拖到看板任務位置完成歸位`
- Future command center title: `個人任務中控台`

### 5.1.1 Visual placement rule

Required product layout:

```text
[Workspace Sidebar] [Task Zone Source Panel] [BoardView / Timeline / Task Flow] [Task Details Drawer]
```

Meaning:
- Workspace Sidebar: workspace / board navigation.
- Task Zone Source Panel: personal task command source, including `待歸位` and future task feeds.
- Center area: current board, list, timeline or task flow where work is structured.
- Right drawer/modal: details, notes, dates, assignees, records and editing.

Forbidden layout:
- Do not place task-zone source as the right-side primary dock, because right-side UI is reserved for details.
- Do not reintroduce two independent floating windows.
- Do not make the user drag from right to left as the default placement flow.

### 5.2 Required user flows

Flow A - active board exists:
1. User opens `任務專區`.
2. User sees unplaced tasks and a clear CTA: `到目前看板歸位`.
3. App opens the active BoardView.
4. App opens the left task-zone source panel beside the board.
5. User drags a task-zone card from the left source panel into a board column/card/subtask position.
6. Board shows the exact same positioning frame as normal task drag.
7. User drops.
8. Task is placed into target board position and removed from `待歸位`.

Flow B - no active board:
1. User opens `任務專區`.
2. User clicks `選擇看板歸位`.
3. App shows a lightweight board picker or routes through existing workspace/board navigation.
4. After target board opens, the left task-zone source panel is visible.
5. User drags and drops using the same board positioning behavior.

Flow C - already in BoardView:
1. User opens the left `任務專區` source panel.
2. User drags any `待歸位` task into the board.
3. Drop indicator and overlay match normal board task dragging.

Flow D - future personal task command center:
1. User opens full-page `任務專區`.
2. User sees `待歸位`, `我的任務`, `近期動態`, `逾期` or external-source items.
3. User filters to an action-oriented set, for example `需要我處理`.
4. User chooses an item and either opens details on the right or sends it into a board placement flow.
5. Native unplaced ProJED tasks can be dragged into boards; external read-only items may require `轉成 ProJED 任務` first.

### 5.3 What must not happen

- Do not show two independent task-zone windows.
- Do not make users click a separate conversion wizard before dragging.
- Do not show a different memo-like ghost card.
- Do not only allow placing at the end of a list if normal task drag supports exact insertion.
- Do not duplicate the task on failed placement.
- Do not remove the task from `待歸位` before backend placement succeeds.

## 6. End-State Architecture

End-state:
- `任務專區` has one data source and shared task-zone store.
- The same task-zone task card can render in a full page review surface and a board-integrated placement surface.
- Board-integrated placement surface is a left-side source panel and lives inside or under the same DnD provider as board tasks.
- Board drop targets treat task-zone cards as task drag sources with `sourceScope = personal_task_zone`.
- Existing task drag overlay and drop indicator primitives are reused.
- The task-zone source panel can later host cross-workspace task feeds and external task source sections without changing the board drop contract.

Architecture principle:
- Source differs; drag semantics do not.
- `personal-task-zone-item` is a source variant of task dragging, not a separate drag category with its own animation language.

### 6.1 Personal task command center roadmap

Phase 1 - Direct placement foundation:
- Left-side source panel with `待歸位`.
- Drag unplaced personal tasks into visible BoardView targets.
- Full-page task-zone entry can route to placement mode.
- Source panel supports pin/unpin and remembers the user's last preference.
- ProJED internal `我的任務` MVP uses the calendar-subscription source-scope/filter model where practical.
- Default `我的任務` subscription includes all tasks assigned to the current user across accessible workspaces / boards.
- Users can adjust subscription scope by workspace and board.
- `我的任務` cards support normal task-card operations under existing permissions.

Phase 2 - ProJED internal aggregation expansion:
- `我建立的`: tasks created by me.
- `今日`, `逾期`, `即將到期`.
- Workspace / board / status / time filters.
- Read permissions must strictly follow existing project membership / RLS.

Phase 3 - Action-oriented dynamic wall:
- Timeline sorted by task event time.
- Events must be grouped by action meaning, not pure log order.
- Example categories: `需要你處理`, `被指派給你`, `即將到期`, `有人回覆`, `狀態變更`, `待歸位`.
- Low-value noise such as every reorder or minor metadata update must be filtered or collapsed.

Phase 4 - External task sources:
- Read-only aggregation first.
- `轉成 ProJED 任務` before allowing placement into ProJED boards unless a source supports safe writeback.
- External source items must expose source, permission, sync state and whether they are writable.
- Two-way sync is deferred until source-specific conflict and permission models are designed.

## 7. Frontend Implementation Contract

Required components or equivalent:
- `TaskZoneView`: full-page review and quick-create destination.
- `TaskZoneSourcePanel` / `TaskZoneBoardSourcePanel`: left-side board-visible task-zone source inside BoardView DnD context.
- Shared `TaskZoneTaskCard` presentation where possible.
- Shared `TaskDragHandle`.
- Shared `TaskDragOverlayPreview`.
- Shared board drop indicator / drop target highlight primitives.

DnD source contract:

First-pass item behavior:
- `待歸位` personal tasks are direct drag sources and can be placed into the currently visible board.
- `我的任務` MVP items are canonical ProJED tasks rendered in command-center context.
- `我的任務` cards must support the same core operations as normal task cards: title, dates, status, complete/uncomplete, delete and drag, subject to the same permission guards.
- Dragging a placed `我的任務` item into the current board means move the same canonical task, not copy it, unless the user explicitly chooses a future copy action.
- Cross-board movement from `我的任務` must reuse normal task move contracts and must be disabled when target permission, source permission, dependency/subtree rules or project-scope constraints cannot be satisfied.
- External-source items are not direct drag sources in DEV-041. Future external items must be converted to ProJED tasks before board placement.

```ts
type TaskZoneDragItem = {
  type: 'personal-task-zone-item';
  taskId: string;
  sourceProjectId: string;
  sourceTenantId: string;
  sourceScope: 'personal_task_zone';
  title: string;
};
```

Drop target contract:
- Existing board column/card/subtask drop targets must accept both normal board task source and task-zone source where permission allows.
- Drop intent must produce the same target shape used by normal task movement:
  - `targetProjectId`
  - `targetParentId`
  - `insertBeforeId`
  - `insertAfterId`
  - order / position metadata if the current board contract uses explicit order.
- Visual state must not branch into a task-zone-specific indicator. It must reuse the existing task drop indicator.

Placement action:
- On drop, call existing task-zone placement service, for example `taskZoneService.placeTaskOnBoard(...)`.
- The service must call the existing `place_personal_task_on_board` RPC or equivalent.
- The local WBS store update must mirror normal task drop success behavior.
- On success:
  - Add / move task into target board state.
  - Remove from task-zone unplaced list.
  - Clear active drag state.
- On failure:
  - Keep task in `待歸位`.
  - Do not insert a ghost task into board state.
  - Show recoverable error.

Full-page `TaskZoneView` behavior:
- Full-page cards may be draggable only for local reordering or future sidebar drop enhancement if implemented safely.
- If precise board drop targets are not visible, the primary action must be `到目前看板歸位` or `選擇看板歸位`.
- Do not imply that the user can drop into an invisible board.
- Full-page task-zone may show command-center sections, but DEV-041 only implements the placement-ready skeleton and does not need to implement full aggregation.

Left source panel behavior:
- The panel appears between workspace sidebar and BoardView content.
- It can be collapsed to preserve board width.
- It can be pinned as a fixed second-left column.
- It remembers the user's last pin/collapse preference on the local device.
- It shows `待歸位` first.
- It also shows ProJED internal `我的任務` MVP in the first DEV-041 pass, with default `指派給我` subscription and workspace/board scope controls.
- It may reserve future section slots for `近期動態`, `外部來源`, but those sections are disabled / hidden unless implemented.
- Opening a task from the panel may open the right-side details drawer; the source panel itself must not become a detail editor.

## 8. Backend / Data Contract

No new task identity model is expected.

Must reuse DEV-040 backend contract:
- `ensure_personal_task_zone()`
- `create_personal_quick_task(...)`
- `place_personal_task_on_board(...)`

`我的任務` MVP data contract:
- Reuse or adapt the same source-scope/filter module used by calendar subscription.
- Required filters:
  - workspace scope: all accessible workspaces by default, user-selectable.
  - board/project scope: all accessible boards by default, user-selectable.
  - relation scope: default `assigned_to_me`; future options may include `created_by_me`, `watching`, `mentioned`.
- DEV-041 first pass default: all accessible workspace/board tasks assigned to the authenticated user.
- The query must only return tasks the authenticated user can read under existing workspace/project permission rules.
- The query must not return or infer inaccessible workspace names, board names, task titles or counts.
- The result should include enough source context for display and navigation: workspace name, board/project name, task id, title, status, date fields and source board id, only where the user can read those objects.
- If existing backend services cannot query across accessible boards safely, RD must add a scoped service/RPC or stop for PM/RD review; do not implement a client-side RLS bypass or broad table scan.

UI preference storage:
- Source panel pin/collapse state is local device preference.
- Use localStorage or existing local UI preference store.
- No DB migration is required for pin/collapse state in DEV-041.
- Cross-device consistency for this UI layout preference is explicitly out of scope.

Placement invariants:
- Preserve the same `wbs_items.id`.
- Move root task and supported descendants according to DEV-040 contract.
- Verify source task belongs to the user's personal task zone and is still `unplaced`.
- Verify target project permission.
- Reject placement back into personal task-zone project.
- Idempotent retry must not create duplicate tasks.

No schema change expected unless RD finds missing indexes or RPC contract mismatch. If schema/RPC change is required, it must be recorded as a migration and pass Supabase gates.

## 9. Permission Contract

- Owner can drag own personal-zone task into a target board where the owner has create/move permission.
- Viewer / read-only user cannot place into boards without write permission.
- User cannot drag another user's personal-zone task.
- Failed target permission must keep task visible in `待歸位`.
- Board-visible task-zone dock must only list the current user's own unplaced personal tasks.

## 10. RD Implementation Plan

Slice 1 - Inspect and consolidate existing DnD source:
- Find the existing board task drag source, drag overlay and drop indicator.
- Find current DEV-040 `personal-task-zone-item` source and ensure it is treated as a task-source variant.
- Remove or prevent any task-zone-only overlay divergence.

Slice 2 - Board-integrated placement surface:
- Add or refine left-side `TaskZoneSourcePanel` inside BoardView DnD provider.
- Ensure the panel uses the same task-zone store as full-page `TaskZoneView`.
- Ensure the panel can be opened from BoardView without creating a second floating window.
- Ensure right-side detail drawer remains reserved for task detail/editing.
- Add pin/unpin behavior and persist the user's panel preference locally.
- Add ProJED internal `我的任務` MVP list using the calendar-subscription style source-scope/filter model.
- Default `我的任務` filter is all accessible workspace/board tasks assigned to the current user.
- Add workspace and board scope controls for `我的任務`.

Slice 3 - Full-page placement entry:
- Add `到目前看板歸位` when active board exists.
- Add `選擇看板歸位` or equivalent when no active board exists.
- Route to BoardView with task-zone dock opened and, if possible, focus/highlight the selected task-zone card.

Slice 4 - Drop behavior parity:
- Ensure board column/card/subtask drop targets accept `personal-task-zone-item`.
- Ensure hover/drop visual state is the same as normal task drag.
- Ensure order intent and parent intent are identical to normal task movement.
- Ensure `我的任務` MVP cards use normal task drag/move semantics and never silently copy a placed task.

Slice 5 - Failure handling and cleanup:
- On placement success, remove from unplaced list after backend success.
- On placement failure, keep task and show visible error.
- Prevent duplicate placement on retry or double drop.

Slice 6 - Verifier and docs:
- Add static verifier for shared drag primitives, board dock presence and full-page placement entry.
- Add browser verifier for task-zone dock drag to board with visible drop indicator.
- Update DEV-041 evidence in `dev_task.md` after implementation.

## 11. Acceptance Criteria

Product acceptance:
- User can understand how to place `任務專區` tasks without asking.
- From `任務專區`, user has a clear path to board placement mode.
- In BoardView, user can open left task-zone source panel and drag a task-zone item into the board.
- User can pin/unpin the left source panel and the app remembers the preference.
- User can configure `我的任務` by workspace and board scope, with default subscription set to all assigned-to-me tasks.
- User can see ProJED internal `我的任務` across accessible workspaces / boards.
- `我的任務` cards support the same core operations as normal task cards under the same permission checks.
- Dragging a `我的任務` card to the current board moves the same canonical task when allowed; it does not duplicate by default.
- The drag overlay looks like a normal task drag overlay.
- The board positioning frame / drop indicator appears exactly like normal task drag.
- Drop between existing tasks places the task at that exact position.
- Drop into a supported subtask zone places the task as a child where normal task drag supports it.
- Successful placement removes the task from `待歸位`.
- UI follows source/structure/detail placement: left source panel, center board, right details.

Engineering acceptance:
- No second DnD engine is introduced.
- `TaskDragOverlayPreview` or equivalent shared overlay is used.
- Existing board drop indicator primitives are used.
- Normal board task drag/drop remains unchanged.
- Placement uses `place_personal_task_on_board` or equivalent DEV-040 placement service.
- No duplicate task is created on retry or failure.
- No schema change is made unless explicitly documented.

## 12. QA / QC Gate

Static gate:
- Verify BoardView contains a left-side task-zone source panel inside the DnD context.
- Verify task-zone drag source uses shared task drag handle and overlay.
- Verify board drop target highlight accepts task-zone source through the same visual path as normal task source.
- Verify full-page TaskZoneView exposes a clear board placement CTA.
- Verify no new memo-only drag module or task-zone-only overlay appears.
- Verify right-side detail drawer is not reused as the task source panel.

Browser gate:
- Create or use an existing unplaced task-zone task.
- Open BoardView with left task-zone source panel.
- Drag the task-zone card over:
  - empty column area,
  - between top-level tasks,
  - supported child/subtask area.
- Confirm the visible positioning affordance matches normal task drag.
- Drop and refresh.
- Confirm the task persists in target position and disappears from `待歸位`.
- Repeat normal board task drag/drop and confirm no regression.

Failure gate:
- Attempt placement into a read-only / inaccessible board if available.
- Confirm placement is rejected, task remains in `待歸位`, no ghost board task appears.

Required commands after RD implementation:
- `npm run verify:dev-041-task-zone-direct-drag-placement`
- `npm run verify:dev-041-task-zone-direct-drag-placement-browser`
- `npm run verify:dev-040-personal-task-zone`
- `npm run verify:dev-028-cross-mode-task-interactions`
- `npx tsc --noEmit`
- `npm run build`

## 13. Risks and Controls

Risk: Full-page task-zone drag across route becomes brittle.
Control: First deliver board-visible placement mode; route from full page into that mode instead of maintaining drag state across route transitions.

Risk: DnD visuals drift again.
Control: Forbid task-zone-only overlay and indicator; use shared primitives only.

Risk: User sees another window and feels the two-window problem returned.
Control: Left source panel is an integrated information layer tied to BoardView, not an independent floating triage drawer.

Risk: Left source panel grows into a noisy feed.
Control: Future dynamic wall must be action-oriented and filter low-value events; DEV-041 only establishes source panel and placement mechanics.

Risk: Normal board drag/drop regresses.
Control: DEV-028 and normal board drag regression are mandatory gates.

Risk: Failed placement loses task.
Control: Backend-success-first update; never remove from unplaced list before service success.

## 14. Stop Conditions

Stop and return to PM/RD lead if:
- Matching normal task drop indicator requires replacing the board DnD system.
- RD cannot keep task-zone source inside the same DnD context as board drop targets.
- Placement requires creating a duplicate task instead of moving the same canonical task.
- Task-zone source panel becomes a second independent floating window.
- Task-zone source is placed on the right-side detail area as the primary design.
- The implementation cannot preserve normal board task drag behavior.
- Schema/RPC change is required but not covered by migration and Supabase gate.

## 15. Spec Governance

Cross-spec consistency:
- This spec extends SPEC-040. It does not replace DEV-040 personal task-zone storage or quick task creation.
- This spec reinforces SPEC-028. Normal task drag/drop is the canonical interaction; task-zone placement must conform to it.
- This spec intentionally narrows the ambiguous DEV-040 phrase `進入看板後可用相同拖移體驗定位` into a concrete UX requirement: provide a left-side board-visible task-zone source panel so the user can drag directly into visible board targets.
- This spec also upgrades `任務專區` from a short-term unplaced-task pool toward a personal task command center architecture. DEV-041 implements only the left source panel and direct placement foundation; cross-workspace aggregation, dynamic wall and external tasks are phased follow-ups.

ADR decision:
- No ADR required for this spec if RD reuses existing task identity, existing DnD primitives and existing placement RPC.
- ADR required only if RD proposes cross-route drag architecture, new DnD engine, new task identity, or schema/RPC semantic changes.

Readiness:
- No P0/P1 blocker remains for RD.
- Human decision is confirmed by direct user request.
- Engineering details are AI-filled and bounded by DEV-040/DEV-028 contracts.

## 2026-07-01 補齊決策：個人任務中控台訂閱模型

### D-041-13：與「訂閱月曆」共用來源訂閱模組

任務專區 / 個人任務中控台的「我的任務」來源，不另建一套平行的來源篩選系統；必須沿用或抽象化既有「訂閱月曆」的來源訂閱模組。

差異點如下：

- 訂閱月曆：重點是將任務日期投射到月曆視角。
- 任務專區：重點是將個人相關任務投射到個人任務中控台，並支援後續拖入工作區 / 看板 / 任務層級歸位。

共用模組至少需抽象出下列能力：

- 訂閱來源類型：例如指派給我、我建立的、我追蹤的、未歸位、外部來源任務。
- 範圍控制：workspace scope、board/project scope。
- 預設訂閱：預設訂閱所有「指派給我」且使用者有權限存取的項目。
- 使用者可控：使用者可以克制 / 調整要訂閱的項目，而不是系統永久強制全部顯示。
- 視角分離：同一份訂閱來源可被月曆、任務專區、未來動態牆用不同 UI 呈現。

### D-041-14：任務專區新增工作區 + 看板範圍選擇

任務專區在沿用訂閱月曆來源模組時，必須額外支援工作區與看板的範圍選擇：

- 預設：全部可存取工作區 + 全部可存取看板中的「指派給我」。
- 使用者可切換：全部、指定工作區、指定看板。
- 若目前位於某一看板，左側任務專區可提供「目前看板」快捷篩選，但不得把資料範圍鎖死在目前看板。
- 被拖入目前看板的項目，必須走正常任務移動 / 歸位流程，不得建立重複副本。

### D-041-15：Phase 1 實作邊界

Phase 1 不直接實作完整外部系統串接或全功能動態牆，但資料模型與 UI 架構必須保留擴充位置。

Phase 1 必須交付：

- 左側來源面板：符合「左到右資訊越來越細」視線流。
- 我的任務 MVP：預設顯示所有指派給我的可存取任務。
- 範圍控制：至少支援全部 / 目前工作區 / 目前看板，並保留多工作區、多看板選擇擴充點。
- 拖移歸位：未歸位任務可直接拖入看板、欄位、任務間、子任務區。
- 一致 DnD：拖移預覽、定位框、drop indicator 必須共用既有任務拖移模組，不得另寫視覺行為不一致的拖移模組。

Phase 1 暫不承諾：

- 外部系統任務匯入。
- 完整動態牆排序規則。
- 跨 route 拖移中切頁仍保留 active drag state。
- 將個人任務另存成一張全新的全域 task table。

### D-041-16：Q2/Q3 決策紀錄

使用者已確認 Q2 = A、Q3 = C。若原問題語意涉及 UI 展開策略、資料同步策略或權限策略，RD 實作時需以本規格較高優先級原則解讀：

- UI 必須優先服務高頻使用，因此任務專區應在看板左側主視覺位置，而非低權重浮窗。
- 同步與權限必須沿用既有任務資料與訂閱來源能力，避免新增平行真相來源。
- 功能完整性以「能歸位、能篩選、能逐步擴充」為第一版驗收標準。

### D-041-17：2026-07-01 引導補齊決策

使用者已補充確認：

- `我的任務` 來源與「訂閱月曆」共用同一個來源訂閱模組。
- 使用者要能控制訂閱項目；任務專區差異在於同一來源模型上額外提供工作區 + 看板選擇。
- 預設訂閱所有「指派給我」且目前使用者有權限存取的項目。
- 第一版採 `2A` 決策：優先把任務專區做成可直接操作與歸位的個人任務來源，不先擴張成完整動態牆。
- 第一版採 `3C` 決策：保留後續擴充到動態牆 / 外部任務來源的架構位置，但不把外部串接列入本輪驗收。

RD 契約：

- `我的任務` 卡片若來自其他工作區 / 看板，詳情、改名、完成、封存等核心操作不得只更新目前看板 local store；必須使用 canonical task update service。
- 前端 local state 只能作為 UI cache，不得成為第二個任務真相來源。
- 自訂範圍採聯集語意：符合任一已選工作區或任一已選看板即可顯示；未選任何來源時顯示空清單。
- 與訂閱月曆共用的來源模型可以有不同 UI 呈現，但欄位語意、權限語意與預設來源不得互相衝突。

## 2026-07-02 補齊契約：任務卡層級定位框與我的任務拖移 evidence

### D-041-18：定位框驗收以任務卡層級為主

DEV-041 的「拖移體驗一致」不得只用欄位背景高亮證明。主要驗收情境必須包含：

- `待歸位` 任務從左側任務專區拖到既有看板任務卡附近時，顯示與一般任務拖移一致的任務卡層級定位框 / ring / insert affordance。
- `我的任務` 卡片從左側任務專區拖到目前看板時，在權限允許下也顯示同一套任務卡層級定位框。
- 欄位 drop indicator 可作為空欄位或 local-test 無任務卡資料時的 fallback evidence，但不得取代任務卡層級 evidence。

RD 契約：

- `data-kanban-card-drop-indicator-active` 是 task-card positioning-frame smoke 的穩定驗收錨點。
- `data-kanban-drop-indicator-active` 是 column fallback smoke 的穩定驗收錨點。
- `data-task-zone-my-task-id` 用於避免 `我的任務` smoke 把任務拖回自身卡片造成假陽性。
- Browser smoke 應優先拖到既有任務卡，沒有任務卡時才退回欄位層級驗收。
- 若 local-test 沒有 assigned-task 資料，`我的任務` 拖移 smoke 可以 skip，但 Supabase backend evidence 仍需補足 canonical assigned-task move。

此補充不改變資料語意；它只把使用者反覆指出的「拖過去時沒有定位框」收斂成可驗收的 UI/DnD evidence 契約。

### D-041-19：定位框 browser smoke 不得污染待歸位資料

DEV-041 的 browser smoke 目標是證明 UI/DnD evidence，不是建立或留下測試資料。非污染 smoke 契約如下：

- Browser smoke 應優先重用既有 `待歸位` source item；只有沒有可重用項目時才可建立 fallback smoke item。
- 若 browser smoke 建立 fallback `DEV-041 drag smoke ...` item，必須在取消拖曳與來源仍可見檢查後清理該 fallback item。
- Browser smoke 不得刪除既有使用者資料或既有 QA 資料；清理範圍只限 smoke 自己建立的 fallback item。
- `data-task-zone-remove` 是 fallback cleanup 的穩定測試錨點，只能用於清理 smoke 自己建立的 fallback item。
- Fallback cleanup 必須在建立後擷取該 item 的 `data-task-id`，並以 `[data-task-zone-item="true"][data-task-id="..."]` 重新定位目標；不得用動態 `.first()` 當成 cleanup/hidden wait 的目標，避免刪除後 locator 重新綁定到下一筆 `待歸位` 資料。

此決策對應 QA case `B-041-016 Non-polluting browser smoke for unplaced source items`。它不取代 D-041-18 的定位框驗收；它只約束驗證流程的資料副作用。
