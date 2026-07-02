# QA-DEV-041 - Task Zone Command Center and Direct Drag Placement

Status: Ready for QA after RD implementation
Date: 2026-07-01
Related:
- SPEC-041 - Task Zone Direct Drag Placement
- SPEC-040 - Personal Task Zone and Quick Task Entry
- SPEC-028 - Cross-mode Trello-like Task Interactions

## 1. QA Purpose

Validate that `任務專區` unplaced tasks can be placed into boards with the same drag-and-drop behavior as normal board tasks.

The critical acceptance point is visual and behavioral parity:
- Same drag handle language.
- Same drag overlay.
- Same board positioning frame / drop indicator.
- Same drop intent and persistence behavior.

## 2. Scope

In scope:
- Full-page `任務專區` placement entry.
- Board-integrated left-side task-zone source panel.
- Pin/unpin and remembered source-panel state.
- ProJED internal `我的任務` MVP using calendar-subscription style source-scope/filter controls.
- Default `我的任務` subscription includes all tasks assigned to the current user across accessible workspaces / boards.
- `我的任務` cards have the same core operations as normal task cards under existing permission guards.
- Dragging task-zone task into board columns, task gaps and supported subtask zones.
- Placement persistence through DEV-040 service / RPC.
- Failure recovery.
- Normal board task drag/drop regression.
- Source/structure/detail layout: left task source, center board, right task details.

Out of scope:
- AI-based placement suggestion.
- Batch placement.
- Cross-route drag that preserves active drag state while navigating.
- Mobile-specific advanced touch drag, unless RD implements it.
- New schema/RPC behavior beyond DEV-040.
- Full action-oriented dynamic wall.
- External system task connectors.
- Cloud sync for source-panel pin/collapse state.
- Copy semantics for `我的任務` placed tasks. DEV-041 default drag behavior is move, not copy.

## 3. Preconditions

Test data:
- One authenticated user with at least one active board.
- At least two existing board tasks in a visible column.
- At least one `任務專區` task in `待歸位`.
- Optional nested/subtask area if current board supports subtask drops.

Environment:
- DEV-040 migrations/RPCs available in target environment.
- Browser drag/drop support.
- App can open BoardView and `任務專區`.
- Local-test backend can smoke the left source panel, unplaced task creation and shared drag handles.
- Canonical `我的任務` cross-board move, assigned-task aggregation and RPC guard behavior require Supabase backend evidence.

## 4. Static Review Checklist

Architecture:
- BoardView renders a left-side task-zone source panel inside the board DnD provider or equivalent shared DnD context.
- Task-zone drag source uses shared task drag handle or equivalent existing task drag affordance.
- Task-zone drag overlay uses shared `TaskDragOverlayPreview` or the same normal task overlay path.
- Board drop indicator logic accepts task-zone source without introducing a task-zone-only visual branch.
- Full-page TaskZoneView provides a clear CTA to open board placement mode.
- No separate memo/triage floating window is introduced.
- No new DnD engine is introduced.
- Right-side detail drawer is not used as the primary task-zone source surface.
- Source panel has pin/unpin behavior and remembers user preference on the local device.
- `我的任務` MVP uses existing permission boundaries and does not leak inaccessible workspace/project/task data.
- `我的任務` MVP has workspace and board scope controls.
- `我的任務` cards use normal task-card operations and normal move semantics; dragging does not silently copy.

Data and service:
- Placement calls DEV-040 task-zone placement service / RPC.
- Task is removed from `待歸位` only after placement success.
- Failed placement keeps the task in `待歸位`.
- No duplicate task creation path is introduced.

## 5. Browser Functional Tests

### B-041-001 Full-page discoverability

Steps:
1. Open `任務專區`.
2. Confirm `待歸位` tasks are visible.
3. Confirm user-facing placement action is visible, such as `到目前看板歸位` or `選擇看板歸位`.
4. Activate the placement action.

Expected:
- User reaches BoardView or a board picker that leads to BoardView.
- BoardView opens with left-side task-zone source panel visible or immediately available.
- No second unrelated floating triage window appears.
- Full-page `任務專區` exposes a direct CTA to open the board left source panel for `待歸位`.
- Full-page `任務專區` exposes a direct CTA to open the board left source panel on `我的任務`.

### B-041-002 Left source panel drag to top-level position

Steps:
1. Open BoardView with left-side task-zone source panel visible.
2. Drag a `待歸位` task-zone card over a column with existing tasks.
3. Hover between two existing tasks.
4. Compare the visible indicator to normal task drag.
5. Drop.

Expected:
- Drag overlay matches normal task drag overlay.
- Positioning frame / insert indicator matches normal task drag.
- Task appears at intended location.
- Task disappears from `待歸位`.
- Refresh keeps the task in the target board position.

### B-041-003 Empty column / list placement

Steps:
1. Drag a task-zone card to an empty column or empty section if available.
2. Observe drop affordance.
3. Drop.

Expected:
- Empty drop zone highlight matches normal task drag.
- Task persists in target empty area.

### B-041-004 Subtask placement, if supported

Steps:
1. Open a task/card that supports child task drop.
2. Drag a task-zone card into the supported child/subtask drop zone.
3. Drop.

Expected:
- Subtask insertion affordance matches normal task drag.
- Task becomes a child/subtask according to the same semantics as normal task movement.
- If subtask placement is not supported for task-zone source, UI must not falsely show it as available.

### B-041-005 Failure recovery

Steps:
1. Attempt placement into a board where current user lacks write permission, if such board exists.
2. Drop or trigger placement.

Expected:
- Placement is rejected.
- User sees recoverable error.
- Task remains in `待歸位`.
- No ghost or duplicate task appears in target board.

### B-041-006 Normal board drag regression

Steps:
1. Drag an existing normal board task between two board tasks.
2. Observe overlay and drop indicator.
3. Drop and refresh.

Expected:
- Normal board drag remains unchanged.
- Normal board task order persists.
- DEV-041 changes do not degrade DEV-028 task interaction contract.

### B-041-007 Pin/unpin source panel

Steps:
1. Open BoardView and open the left task-zone source panel.
2. Pin the panel.
3. Navigate away and return to BoardView.
4. Unpin or collapse the panel.
5. Navigate away and return again.

Expected:
- Pinned state is remembered.
- Collapsed/unpinned state is remembered.
- Board content remains usable in both states.
- Preference is local-device behavior; cross-device sync is not expected.

### B-041-008 ProJED internal my tasks MVP

Steps:
1. Ensure current user has tasks assigned across at least two accessible boards/workspaces.
2. Open `任務專區` or the left source panel.
3. Open `我的任務`.
4. Confirm default filter shows assigned-to-me tasks.
5. Adjust workspace and board scope controls.
6. Click one item.
7. Edit title/date/status or complete/uncomplete using the same controls available on normal task cards.

Expected:
- Assigned tasks from accessible boards/workspaces are visible.
- Workspace/board scope controls limit the visible list.
- Inaccessible tasks are not visible and their counts/titles are not leaked.
- Clicking an item opens details or provides a clear path to its source board.
- Core card operations match normal task-card behavior under permission checks.
- Dragging a placed `我的任務` card uses move semantics and does not create a duplicate by default.
- While `我的任務` is loading, UI shows loading state without also showing the empty-state message.
- If current board movement is not allowed, card drag is disabled and the UI explains the permission limitation.
- If the task comes from another board, UI explains that both source and target board permissions are checked.

## 6. Visual QC Checklist

Desktop:
- Task-zone source panel is visually integrated on the left side of BoardView, not a second unrelated modal.
- Source panel does not cover the intended drop target area.
- Right-side area remains available for task details, not task source.
- Drag overlay has same spacing, border, elevation and typography as normal task drag overlay.
- Drop indicator is visible and not clipped.
- Full-page TaskZoneView explains the placement path clearly.

Narrow viewport:
- Placement CTA remains visible.
- Dock can be dismissed or collapsed.
- No horizontal overflow or hidden primary action.
- If drag is not supported on touch, fallback copy must be understandable.

## 7. Database / Persistence Checks

After successful placement:
- Source task id is preserved.
- Task metadata indicates placed state or equivalent DEV-040 state.
- Task no longer appears in `待歸位`.
- Task appears in target board after refresh.
- Retrying the same placement does not create duplicate rows.

After failed placement:
- Source task remains unplaced.
- No partial target board row persists.
- UI can retry.

## 8. Stop Conditions

Stop QA and return to RD if:
- Task-zone drag overlay differs from normal task overlay.
- Board drop indicator differs from normal task drag indicator.
- Placement only supports append-to-end while normal task drag supports exact insertion.
- Task disappears from `待歸位` before backend success.
- Failed placement creates a ghost task.
- Normal board drag/drop regresses.
- A second independent floating triage window is introduced.
- Task-zone source is placed on the right-side detail area as the primary design.
- `我的任務` leaks inaccessible task titles, counts, workspace names or project names.
- `我的任務` drag behavior copies existing placed tasks by default or moves them without permission checks.
- `我的任務` lacks workspace/board scope controls.
- RD adds schema/RPC changes without migration evidence.

## 9. Required Evidence

QA/QC should capture:
- Screenshot or video of full-page `任務專區` placement CTA.
- Screenshot or video of board-integrated left-side task-zone source panel.
- Screenshot or video of pin/unpin remembered state.
- Screenshot or video of `我的任務` MVP with default assigned-to-me scope and workspace/board filter controls.
- Screenshot or video showing `我的任務` card operations match normal task-card behavior.
- Screenshot or video of task-zone card hovering over board with visible normal positioning frame.
- Screenshot or video of successful drop and post-refresh persistence.
- Regression evidence for normal board task drag/drop.
- Failure recovery evidence if permission test board is available.

## 10. Automated Gate Entrypoints

Run when RD implementation is complete:
- `npm run verify:dev-041-task-zone-direct-drag-placement`
- `npm run verify:dev-041-task-zone-direct-drag-placement-browser`
- `npm run verify:dev-040-personal-task-zone`
- `npm run verify:dev-028-cross-mode-task-interactions`
- `npx tsc --noEmit`
- `npm run build`

## 11. Source Subscription / Command Center QA Addendum - 2026-07-01

Purpose:
- Validate that `任務專區 / 個人任務中控台` uses the same source-subscription concept as `訂閱月曆`, instead of becoming a second parallel filter system.
- Validate that the difference between calendar and task zone is presentation and action surface, not data truth.

### B-041-009 Shared source subscription contract

Steps:
1. Create or identify tasks assigned to the current user across multiple accessible workspaces and boards.
2. Open calendar subscription settings and confirm source scope can express workspace and board boundaries.
3. Open BoardView left `任務專區` panel and switch to `我的任務`.
4. Compare available scope concepts between calendar subscription and task-zone source panel.

Expected:
- Both surfaces use compatible source terms: assigned-to-me, workspace scope and board scope.
- Task zone may expose task-action-specific controls, but it must not define a conflicting source model.
- Default task-zone source is all accessible `指派給我` tasks.
- User can narrow the source scope instead of being forced to see every assigned task forever.

### B-041-010 Board-scope filtering

Steps:
1. Choose `全部` scope in `我的任務` and record visible assigned task count.
2. Choose `目前工作區` scope.
3. Choose `目前看板` scope.
4. If available, switch to a different board and repeat.

Expected:
- `全部` includes assigned tasks from all accessible workspaces / boards.
- `目前工作區` excludes assigned tasks outside the current workspace.
- `目前看板` excludes assigned tasks outside the current board.
- Scope changes affect only visibility; they do not mutate, archive or move tasks.
- Inaccessible workspace or board names are not leaked through counts, labels or errors.

### B-041-011 Canonical placed-task move from personal command center

Steps:
1. In `我的任務`, identify a placed canonical task from another board in the same workspace.
2. Drag it into the currently visible board target position.
3. Observe drag overlay and drop indicator.
4. Drop between existing tasks or into a supported child/subtask zone.
5. Refresh both source and target boards if test access is available.

Expected:
- The same task identity is moved; no duplicate task is created.
- Drag overlay and positioning frame are identical to normal board task drag.
- Source board no longer shows the task in the old location after successful move.
- Target board shows the task at the selected exact position.
- If move is rejected, the task remains in its original board and no ghost appears.

### B-041-012 Cross-workspace guarded move

Steps:
1. In `我的任務`, identify a task from another workspace.
2. Try moving a simple task without tags, dependencies or record links into the current board.
3. Try moving a task with tags, dependencies or record links if test data is available.

Expected:
- Simple cross-workspace move is either completed through the canonical guarded move service or rejected with a recoverable message.
- Tasks with tags, dependencies or record links are not silently moved by partial client-side updates.
- If controlled move is not implemented, UI must clearly explain that the task requires a controlled move flow.
- Rejection preserves original task position and all associations.

### B-041-012A Cross-board external dependency guard

Steps:
1. Identify or create a task that has a dependency to another task outside its own subtree.
2. Try moving that task from `我的任務` into another board.
3. Repeat with a task whose dependencies are fully inside the moved subtree if test data is available.

Expected:
- A task with dependency links outside the moved subtree is rejected with a controlled-move message.
- Internal subtree dependencies may move only when both linked tasks are moved together.
- Rejection preserves source board position and all dependency links.
- No dependency row is left pointing across the wrong board after a failed move.

### B-041-013 Command center layout regression

Steps:
1. Open BoardView on desktop width.
2. Open and pin `任務專區`.
3. Open a task detail drawer or modal.
4. Collapse `任務專區`.
5. Repeat on narrow viewport.

Expected:
- Information flow remains left-to-right: source on left, board structure in center, details in drawer/modal/right surface.
- `任務專區` is not implemented as a second floating window competing with task details.
- Board drop targets remain visible and usable while the source panel is open.
- Narrow viewport has a usable collapse or fallback path.

Additional stop conditions:
- Calendar subscription and task-zone source filters diverge into incompatible field names or meanings without an ADR.
- Task-zone `我的任務` can see tasks that calendar source permissions would not allow.
- Moving a canonical task is implemented by create-copy-delete without explicit controlled migration semantics.
- Cross-workspace move silently drops tags, dependencies, activity history, record links or assignee metadata.
- The command center becomes a notification feed before direct task placement and filtering are stable.

Required additional evidence:
- Screenshot/video of `我的任務` default all-assigned-to-me source.
- Screenshot/video of workspace and board scope changes.
- Screenshot/video comparing calendar subscription scope wording with task-zone source scope wording.
- Screenshot/video of same-workspace canonical task move from `我的任務` into current board.
- Screenshot/video or log evidence for guarded cross-workspace association rejection.

### B-041-014 Remote assigned-task operation persistence

Steps:
1. In `我的任務`, identify a task assigned to the current user that is not loaded in the currently visible board.
2. Open its detail panel from the task-zone left panel.
3. Update title, status, dates and note content.
4. Rename, complete / uncomplete and archive from the task card controls.
5. Navigate to the task's source board and refresh.

Expected:
- Detail panel opens for remote assigned tasks, not only for tasks already present in current board state.
- Each edit persists through the canonical task update service.
- The task-zone list updates as a UI cache after successful persistence.
- If update fails, the user sees a recoverable toast and the task is not silently marked as updated.
- No duplicate task is created.
- Inaccessible or unauthorized tasks remain inaccessible.

### B-041-015 Task-card positioning-frame parity for task-zone sources

Steps:
1. Open BoardView with the left `任務專區` source panel visible.
2. Create or identify one `待歸位` task-zone item.
3. Drag the item over an existing board task card, not only over empty column space.
4. Observe the active task-card positioning frame.
5. If local test data has an assigned `我的任務` card, repeat the same drag from `我的任務` into the visible board.

Expected:
- Dragging `待歸位` over a board task card shows the same task-card positioning frame / ring / insert affordance as normal task dragging.
- Dragging `我的任務` over a board task card shows the same task-card positioning frame when the move is permitted.
- If no board task card exists in local test data, QA may fallback to column-level drop indicator evidence, but this is weaker evidence and must be called out.
- The automated browser smoke should prefer task-card-level evidence and only fallback to column-level evidence when no task card is available.
- The static gate must preserve stable selectors for both `data-kanban-card-drop-indicator-active` and `data-kanban-drop-indicator-active`.
- The automated browser smoke should reuse an existing `待歸位` source item when one exists, instead of creating new local data on every run.
- If the automated browser smoke creates fallback `DEV-041 drag smoke ...` data, it must remove only that fallback item after cancelled-drag source-visibility checks pass.
- The static gate must preserve `data-task-zone-remove` as the fallback cleanup selector and must preserve evidence logs for reuse, fallback creation and fallback cleanup.
- The browser smoke must capture the fallback item's `data-task-id` and target cleanup with `[data-task-zone-item="true"][data-task-id="..."]`, not a dynamic `.first()` locator.

Required additional evidence:
- Screenshot/video or browser log showing `待歸位` drag activates the task-card positioning frame.
- Screenshot/video or browser log showing `我的任務` drag activates the task-card or column positioning frame when assigned-task data exists.
- Browser log showing `待歸位` smoke reused an existing source item or created then cleaned up a fallback item without removing existing user/QA data.
- Explicit skip note when local-test assigned-task data is unavailable.

### B-041-016 Non-polluting browser smoke for unplaced source items

Steps:
1. Open BoardView with the left `任務專區` source panel visible.
2. Run the browser smoke in a local-test state that already has at least one `待歸位` source item.
3. Confirm the smoke reuses the existing source item and does not create a new `DEV-041 drag smoke ...` item.
4. Run the same smoke in an empty local-test state where no `待歸位` source item exists.
5. Confirm the smoke creates one fallback `DEV-041 drag smoke ...` item only for the positioning-frame path.
6. Confirm the smoke cancels the drag, verifies source visibility, then removes only the fallback item through `data-task-zone-remove`.
7. Confirm fallback cleanup targets the exact fallback item's `data-task-id`, not the first visible `待歸位` card after DOM changes.

Expected:
- Existing `待歸位` user or QA data is never removed by the smoke.
- Fallback data is created only when no reusable source item exists.
- Fallback data is cleaned up after cancelled-drag visibility checks pass.
- Fallback cleanup is id-anchored through `data-task-id`, so hidden waits cannot rebind to another source item.
- The browser log includes reuse, fallback creation and fallback cleanup evidence.

Required additional evidence:
- Browser log showing `reused existing unplaced task-zone item for positioning smoke`.
- Browser log showing `created fallback unplaced smoke item because no reusable source item existed`.
- Browser log showing `cleaned up fallback unplaced smoke item`.
- Static verifier evidence that `data-task-zone-remove` remains available for cleanup.
- Static verifier evidence that `fallbackUnplacedTaskId` and `[data-task-zone-item="true"][data-task-id="${fallbackUnplacedTaskId}"]` remain in the browser smoke.
