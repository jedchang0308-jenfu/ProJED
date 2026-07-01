# SPEC-040 - Personal Task Zone and Quick Task Entry

Status: RD Implementation Ready / Human Confirmed / Spec + QA Ready
Owner: PM / Product + RD
Date: 2026-06-30
Related:
- SPEC-002 - Whole-person Todo Platform
- SPEC-028 - Cross-mode Trello-like Task Interactions
- SPEC-039 - Cloud Quick Capture Inbox Drag-to-Task
- DEV-028 - Trello-like Task Interaction
- DEV-039 - Cloud Quick Capture Inbox

## 1. Human Decision Brief

Confirmed user decisions:
- 1B+C: This feature is both a personal task control center and a cross-workspace/project task entry point.
- 2A: Quick input should immediately create a task. It should not first create a memo/inbox item that later needs conversion.
- 3A+C: The task zone must support a private personal task area and an aggregated view across all workspaces/projects the user can access.

Explicit user intent:
- The current bottom "快速備忘" window has very high usage and should move to a more primary visual position.
- The item should feel like a task from the beginning, not like a separate memo object.
- Dragging from this zone into boards should use the same movement model and visual behavior as normal task dragging.
- The existing two-window triage pattern is rejected. Conversion/placement must happen in the same primary workflow.

Rejected or deferred directions:
- Do not expand `InboxItem` into a second full-featured task model.
- Do not keep a separate floating triage drawer as the main conversion flow.
- Do not implement an AI parsing/token-consuming workflow by default.
- Do not build a separate drag/drop animation module for memo items.
- Do not change the canonical task identity without an ADR.

AI-filled decisions for RD readiness:
- Canonical record: use the existing task model (`TaskNode` / `wbs_items`) as the source of truth.
- Phase 1 scope: implement a private personal task zone and quick task creation. Cross-workspace aggregation is designed now but implemented in Phase 2 unless separately authorized.
- Locked Phase 1 DB landing: create or reuse exactly one hidden personal project per authenticated user, and store quick-created tasks as normal `wbs_items` rows under that project. Do not make `wbs_items.project_id` nullable and do not introduce a new global task table in Phase 1.
- Visual placement: add "任務專區" as a primary navigation destination and surface quick entry in the main work area. The old bottom quick memo can become secondary access, not the main workflow.

Re-entry triggers:
- If RD decides to introduce a new global task table or nullable `wbs_items.project_id`, create an ADR before implementation.
- If product wants shared/team memo zones, notification routing, AI parsing, recurring tasks, or mobile widgets in this release, return to PM for scope split.
- If production migration is required, run deployment-release-gate and Supabase production migration gates before deploy.

## 2. Problem Statement

The current "備忘錄 / 快速備忘" workflow still behaves like an auxiliary capture box. It can store quick text and can be dragged into a board, but the conceptual model remains split:
- Quick capture item
- Triage/placement UI
- Board task

For high-frequency use, this split creates friction:
- The user must think about whether an item is a memo or a task.
- The main task board and quick capture panel do not share the same mental model.
- Full task capabilities are unavailable until the item is converted or placed.
- Drag/drop feedback can drift from the canonical task dragging experience.

The target state is:
- "Write it down" creates a task immediately.
- Unplaced personal tasks live in a first-class task zone.
- The same task can later be placed into a workspace/project/board without losing identity.
- The user can eventually manage personal tasks and cross-workspace tasks from one command center.

## 3. Goals

P0 goals:
- Replace the current "memo first, task later" mental model with "quick task first".
- Add a primary "任務專區" view for high-frequency access.
- Create quick entries as canonical task records.
- Let personal-zone tasks support the same core task operations as board tasks.
- Preserve the same drag/drop positioning behavior and overlay visuals used by board tasks.
- Keep personal tasks private unless moved to a workspace/project the user has access to.

P1 goals:
- Allow dragging an unplaced personal task into a board/list/card position.
- Move the canonical task into the target project/board through a controlled operation.
- Provide a clear "待歸位" state for tasks that are not yet assigned to a project board.
- Keep cloud sync behavior. Phone and computer must see the same personal tasks after sync.

P2 goals, not in Phase 1 implementation:
- Cross-workspace aggregated task views, such as "我負責", "我建立", "近期", "逾期".
- Saved filters across all accessible workspaces/projects.
- Today planning, prioritization and review workflows.
- Mobile-specific quick capture surface.

## 4. Non-goals

This spec does not authorize:
- A second task system inside `inbox_items`.
- AI classification, summarization, auto-prioritization or token-consuming parsing.
- Shared team inboxes.
- Notification/reminder engine redesign.
- Calendar integration.
- Full recurring task support.
- A production migration or deployment by itself.

## 5. Naming and Product Language

Product-level name:
- Primary destination: `任務專區`
- Quick input label: `快速建立任務`
- Unplaced section: `待歸位`
- Optional secondary wording: `先記下來，直接成為任務`

Terminology changes:
- Avoid using `收件夾` as the main visible name.
- Avoid presenting this as pure `備忘錄` if the record is already a task.
- Existing "備忘錄" wording may remain only as transitional copy where needed, but should point to task creation.

Recommended UI copy:
- Header: `任務專區`
- Subtitle: `快速建立任務，之後拖到看板定位`
- Empty state: `先建立一個任務。還沒決定歸屬時，會留在待歸位。`
- Drag hint: `拖曳到看板位置，即可歸位成正式看板任務。`

## 6. End-State Architecture

End-state concept:
- A user has one private personal task zone.
- Quick entries are canonical tasks from creation.
- Tasks can exist in a personal/unplaced scope or in a workspace/project board scope.
- The task zone can also aggregate assigned/created tasks across all accessible workspaces.
- Task rendering, drag overlay, drop indicators and mutation semantics are shared with board tasks.

Core model:
- `TaskNode` remains the application-level task shape.
- `wbs_items` remains the database-level canonical task table.
- Personal-zone tasks are stored as `wbs_items` under a private system-created personal project.
- Board tasks are stored as `wbs_items` under normal user-visible workspace projects.
- Moving a task from personal zone to board changes its project/parent/order through an authorized transaction.

Why this architecture:
- It keeps one task identity and one feature surface.
- It avoids building and maintaining a duplicate task object under `inbox_items`.
- It preserves existing ordering, subtasks, checklists, due dates, completion and drag/drop infrastructure.
- It reduces migration risk by avoiding nullable `project_id` in Phase 1.
- It allows cross-device sync because data is cloud-backed from the beginning.

## 7. Current Phase Architecture

Phase 1 should implement the smallest stable version of the end-state:
- Add a primary `任務專區` app destination.
- Ensure every user has a private personal task zone project.
- Save quick input directly as a task in that personal zone.
- Show unplaced personal tasks in the task zone.
- Reuse existing task card/drag modules where possible.
- Allow placement into a currently visible board using the same drop targets as normal task dragging.

Phase 1 may defer:
- Full cross-workspace aggregation.
- Complex filters.
- Batch triage.
- AI parsing.
- Calendar/reminder integrations.
- Mobile-specific surfaces.

## 8. Data Contract

Phase 1 locked persistence decision:
- Each authenticated user has exactly one hidden personal task-zone project.
- The hidden personal project uses the existing tenant/project model and is identified by system metadata.
- Personal-zone tasks are regular `wbs_items` rows with non-null `project_id` pointing to the user's hidden personal project.
- RD must not make `wbs_items.project_id` nullable in Phase 1.
- RD must not introduce a new global task table in Phase 1.
- The personal project must be hidden from normal workspace/project navigation.
- If an existing personal project is found for the user, reuse it idempotently.
- If none exists, create it through `ensure_personal_task_zone()`.

Implementation note:
- If the current schema requires a `tenant_id`, the hidden personal project may be created under a hidden personal tenant or under an existing owner-scoped tenant, depending on current RLS compatibility.
- This implementation detail must not be visible as a normal workspace to the user.
- If RD cannot satisfy this without changing core task identity, stop and request ADR.

Recommended metadata:

```json
{
  "system_scope": "personal_task_zone",
  "visibility": "private",
  "owner_user_id": "<auth.users.id>"
}
```

Recommended task metadata for quick-created tasks:

```json
{
  "origin": "quick_task",
  "placement_status": "unplaced",
  "source": "task_zone",
  "client_mutation_id": "<uuid>"
}
```

When the task is placed into a board:
- Update `project_id` to the target project.
- Update `parent_id` according to target card/list/subtask position.
- Update ordering fields using the same ordering semantics as board tasks.
- Update metadata `placement_status` from `unplaced` to `placed`.
- Preserve the same task id if technically compatible.

If preserving the same id is not compatible with existing database constraints:
- RD must document why.
- RD must implement an idempotent convert/move operation.
- RD must preserve visible task data, checklist data and source trace.
- RD must return to PM if this creates user-visible duplication or history loss.

## 9. Backend / RPC Contract

Recommended RPCs or service operations:

```sql
ensure_personal_task_zone()
```

Purpose:
- Find or create the authenticated user's private personal task zone.
- Return `tenant_id`, `project_id` and metadata needed by the client.
- Must be idempotent.
- Must not expose another user's zone.

```sql
create_personal_quick_task(
  client_mutation_id uuid,
  title text,
  description text default null,
  suggested_due_date date default null,
  source_context jsonb default '{}'::jsonb
)
```

Purpose:
- Create a canonical task in the personal task zone.
- Must be idempotent by `client_mutation_id`.
- Must reject empty normalized title.
- Must return the created task as the standard task shape.

```sql
place_personal_task_on_board(
  task_id uuid,
  target_project_id uuid,
  target_parent_id uuid default null,
  insert_before_id uuid default null,
  insert_after_id uuid default null,
  placement_client_mutation_id uuid
)
```

Purpose:
- Move a personal-zone task into a board/project position.
- Must run in one transaction.
- Must verify the user owns or can mutate the source personal task.
- Must verify the user can create/move tasks in the target project.
- Must preserve task identity when possible.
- Must prevent duplicate placement on retry.

Client service contract:
- Existing task service should expose task-zone operations rather than memo-specific operations.
- Avoid naming new client APIs around `inbox` unless used only as a backwards-compatible adapter.

## 10. Permission and RLS Contract

Personal task zone:
- Only the owner can read, create, update, complete, delete and move personal tasks.
- Personal-zone tenant/project must not appear in other users' workspace lists.
- Personal-zone tasks must not be visible to board members unless moved to a board they can access.

Cross-workspace aggregation:
- Only include tasks from projects the user can read.
- Do not bypass project/workspace RLS.
- Aggregation must not leak workspace names, project names, task titles or counts from inaccessible projects.

Placement:
- Source permission: user must own the personal task or have valid mutation permission for its current project.
- Target permission: user must have task-create or task-move permission in the target project.
- If target permission fails, keep the task in `待歸位` and show a recoverable error.

Deletion:
- Deleting an unplaced personal task deletes or soft-deletes that task according to existing task deletion semantics.
- Deleting a placed task follows normal board task behavior.

## 11. Frontend Contract

Primary navigation:
- Add `任務專區` as a primary destination, not only a bottom floating widget.
- The navigation badge should show unplaced personal tasks count first.
- The old bottom quick capture can remain as a secondary shortcut if it does not compete with the primary destination.

Locked Phase 1 IA:
- Sidebar must include a first-level `任務專區` entry.
- Sidebar `任務專區` entry should show the `待歸位` count badge.
- Home or board-adjacent primary area should expose quick task creation or a direct entry to `任務專區`.
- The bottom floating quick memo must be demoted to a shortcut or removed from the main flow.
- No separate memo triage floating window is allowed in the primary flow.

Recommended app state:
- Add a dedicated view key, for example `task_zone`.
- Create a `TaskZoneView` or equivalent main-page component.
- Keep quick input local state minimal and persist through canonical task creation.

Task-zone layout:
- Top quick-create input.
- `待歸位` list for personal unplaced tasks.
- Optional current-board drop hint when a board is open.
- Future sections can include `今日`, `近期`, `我負責`, `我建立`.

Task behavior parity:
- A personal-zone task should support the same core controls as a board task where technically available.
- No silent half-task behavior is allowed. If a board-only capability cannot work before placement, it must be hidden, disabled with an explanation, or deferred explicitly.

Feature parity matrix:

| Capability | Phase 1 requirement | Notes |
|---|---|---|
| Create task | Must | Quick input creates canonical task immediately. |
| Edit title | Must | Same visible behavior as board task title editing. |
| Complete / uncomplete | Must | Use existing task completion semantics. |
| Delete | Must | Use existing task deletion or soft-delete semantics. |
| Cloud sync | Must | Same account sees the task across devices/sessions. |
| Drag handle | Must | Use shared task drag handle where possible. |
| Drag overlay | Must | Overlay must match normal task drag overlay. |
| Drop indicator / positioning frame | Must | Board drop target must show the same indicator as task dragging. |
| Place into board | Must | Move personal task into target board position through authorized transaction. |
| Description | Must if task details already support it | If details modal is reusable, personal tasks must support it. |
| Due date | Must if existing task details already support it | If blocked by board-only assumptions, document and defer. |
| Checklist / subtasks | Must if existing task card/details support it independent of board context | If parent/project assumptions block it, stop or mark as Phase 1 implementation risk. |
| Assignee / members | Board-scoped / defer until placed unless current model supports personal tasks | Do not expose workspace members in private personal zone unless permission model is explicit. |
| Tags / labels | Board-scoped / defer until placed unless current model supports personal tasks | Do not create global labels in Phase 1. |
| Cross-workspace filters | Phase 2 | End-state only, not first RD pass. |
| Today planning / prioritization | Phase 2 | End-state only, not first RD pass. |

Drag/drop:
- Use the shared task drag modules and visual primitives.
- Do not implement a memo-only drag overlay.
- Board drop targets should treat task-zone drags as task drags with a different source scope.
- The positioning frame, insert line, hover state and overlay should match normal task-to-task dragging.

Error states:
- If quick task creation fails, keep the user's typed text and show retry.
- If placement fails, keep the task in `待歸位`.
- If sync state is pending, show a non-blocking pending indicator.

## 12. Backward Compatibility

Existing `inbox_items`:
- Keep current records readable until migration or cleanup is planned.
- Do not add full task features to `inbox_items`.
- Provide a transitional adapter only if needed to show existing memo items.

Locked Phase 1 legacy decision:
- New quick input must not create new `inbox_items` records.
- New quick input must create personal-zone tasks only.
- Existing DEV-039 `inbox_items` must not be destructively migrated in Phase 1.
- If legacy memo records are surfaced, show them inside `任務專區` as a transitional `舊備忘` or equivalent section, not in a second floating window.
- Automatic migration from `inbox_items` to personal-zone tasks requires a separate DEV item.

Recommended handling:
- New quick input creates personal tasks only.
- Existing untriaged inbox items can be migrated later through a separate migration task.
- If shown in the UI, old inbox items should have a clear "轉成任務" action, but this is not required for Phase 1 unless product explicitly requests it.

DEV-039 compatibility:
- Cloud sync behavior remains valid, but the primary object changes from memo/inbox item to task.
- Any DEV-039 UI copy should be reviewed so it does not imply "local only" or "memo only".

DEV-028 compatibility:
- Existing Trello-like drag behavior is the canonical behavior.
- Any task-zone drag implementation must extend existing task drag source metadata rather than duplicating drag visuals.

## 13. Implementation Plan

Phase 1A - Data and service foundation:
- Add or reuse a way to identify a user's private personal task zone.
- Implement `ensure_personal_task_zone`.
- Implement `create_personal_quick_task`.
- Add RLS/policy coverage for private personal zone access.
- Add idempotency by client mutation id.

Phase 1B - Main task-zone UI:
- Add primary navigation entry `任務專區`.
- Add main `TaskZoneView`.
- Replace main quick memo language with quick task language.
- Load and display unplaced personal tasks.
- Support create, edit, complete and delete using existing task services where possible.

Phase 1C - Placement into boards:
- Implement `place_personal_task_on_board`.
- Extend drag source metadata to support `personal_task_zone` source.
- Reuse existing task drag overlay and board drop target visuals.
- On successful drop, move the task and remove it from `待歸位`.
- On failure, keep the task in `待歸位` and show recoverable error.

Phase 1D - Cleanup and transition:
- Remove or demote separate memo triage UI.
- Keep any remaining bottom shortcut as a quick access entry to task-zone creation.
- Update copy from `備忘錄` / `收件夾` to task-zone language.
- Keep old inbox data untouched unless a separate migration is authorized.

## 14. Acceptance Criteria

Product acceptance:
- User can open a primary `任務專區` view.
- User can type a title and create a task immediately.
- The created item appears in `待歸位` as a task, not as a memo.
- The task is visible on another device/session after sync.
- The task can be completed, edited and deleted using task-like controls.
- The task can be dragged into a board position.
- Dragging shows the same positioning frame/drop indicator as normal task dragging.
- After placement, the task appears in the target board and is removed from `待歸位`.
- If placement fails, there is no duplicate and the task remains recoverable.

Engineering acceptance:
- No second full-featured task model is created under `inbox_items`.
- Quick-created records are canonical task records.
- Personal-zone records are private by RLS.
- Target board placement checks target permissions.
- Repeated create/placement requests are idempotent.
- Existing board task drag/drop still works.
- Existing DEV-039 synced memo records are not broken or destructively deleted.

QA acceptance:
- QA-DEV-040 is created and executed before production deployment.
- Cross-device sync is manually verified or covered by a reproducible smoke path.
- RLS negative tests cover another authenticated user and anonymous access.
- UI regression checks cover board drag/drop and quick task creation.

## 15. Risks and Controls

Risk: Personal zone becomes a hidden workspace that confuses workspace lists.
Control: Mark it as system/private and hide it from normal workspace/project navigation.

Risk: Task-zone tasks diverge from board task features.
Control: Reuse task components and services. Do not add memo-specific task behavior.

Risk: Drag/drop visuals drift again.
Control: Treat task-zone dragging as a source variant of task dragging, not as a separate drag system.

Risk: Cross-workspace aggregation leaks data.
Control: Use existing read permissions and RLS; aggregate only after access checks.

Risk: Scope expands into a full personal productivity suite.
Control: Phase 1 is limited to quick task creation, private unplaced list and board placement.

Risk: Migration changes are production-sensitive.
Control: Any production migration must follow Supabase and deployment-release-gate procedures.

## 16. RD Stop Conditions

Stop and return to PM if:
- Existing schema cannot support personal-zone tasks without nullable `project_id` or a new task table.
- Placement cannot preserve task identity and would create duplicate user-visible tasks.
- RLS requires exposing personal tasks to workspace members.
- Cross-workspace aggregation is requested in the same implementation pass.
- The implementation requires production migration/deploy authorization not yet granted.

## 17. Evidence Required Before Release

RD evidence:
- List of changed files.
- Migration names, if any.
- Explanation of how personal-zone tasks are stored.
- Explanation of how drag/drop reuses existing task primitives.
- Confirmation that no AI/token-consuming workflow was added.

QA/QC evidence:
- QA-DEV-040 checklist result.
- Browser screenshots or video for quick create and drag placement.
- RLS test evidence for owner, another user and anonymous access.
- Cross-device/session smoke evidence.
- Regression evidence for normal board task drag/drop.

## 18. Release Handoff and Migration Contract

This section is the handoff contract for the next RD, QA, QC, or release-gate pass. Chat history is not required to continue DEV-040 safely.

### 18.1 Current implementation status

- Product scope: implemented in source as Phase 1 private personal task zone.
- UI status: `任務專區` is a primary destination, with Sidebar badge, Home quick entry, TaskZoneView, and board-adjacent placement panel.
- Data model status: implemented through hidden personal tenant/project plus canonical `wbs_items`; no nullable `wbs_items.project_id`; no separate global task table.
- Drag/drop status: board placement uses `personal-task-zone-item` and shared task drop-intent / overlay primitives so positioning should match normal task drag.
- Task details status: unplaced personal tasks expose a task-zone details panel for title, status, start/end dates, and detail notes/description. Board-context capabilities such as assignee, tags, records, and dependencies remain available after placement through the normal board task details flow.
- Legacy status: DEV-039 `inbox_items` is not auto-migrated in Phase 1 and must not reappear as a second primary floating workflow.
- Verification status: not passed until static verifier, TypeScript, build, browser smoke, and Supabase/RLS checks all have recorded evidence.
- Migration status: `supabase/migrations/20260630070000_dev_040_personal_task_zone.sql` exists but must be applied to the target DB before cloud-backed task-zone behavior can be accepted.

### 18.2 Required release sequence

1. Confirm Git boundary before release work starts.
2. Apply `supabase/migrations/20260630070000_dev_040_personal_task_zone.sql` to the target environment selected for verification.
3. Confirm PostgREST schema cache reload or equivalent RPC availability for:
   - `public.ensure_personal_task_zone()`
   - `public.create_personal_quick_task(...)`
   - `public.place_personal_task_on_board(...)`
4. Run static contract gate: `npm run verify:dev-040-personal-task-zone`.
5. Run TypeScript and production build gates used by the project release process.
6. Run browser smoke: `npm run verify:dev-040-personal-task-zone-browser`.
7. Run Supabase/RLS evidence checks with authenticated users covering owner, other user, viewer/non-member, and anon rejection.
8. Only after all evidence is recorded may DEV-040 move from `RD Implemented / Verification Pending / Migration Pending` to a passed release status.

### 18.3 Database verification evidence required

- `ensure_personal_task_zone()` creates exactly one personal hidden tenant/project per authenticated user and is idempotent on repeated calls.
- Hidden personal tenants/projects are not returned by normal workspace/project list APIs.
- `create_personal_quick_task()` creates a canonical root `wbs_items` task in the user's personal zone.
- `create_personal_quick_task()` is idempotent for the same `client_mutation_id`.
- `place_personal_task_on_board()` rejects placement into another user's inaccessible project.
- `place_personal_task_on_board()` rejects placement back into a personal task-zone project.
- `place_personal_task_on_board()` moves the root task and descendants together.
- Related dependencies and tag assignments are either moved safely or cleaned according to target-tenant constraints.
- Anon users cannot execute the personal task-zone RPCs.

### 18.4 Rollback and failure handling

- If the migration fails before functions are created, stop release and do not deploy app code that calls task-zone RPCs.
- If PostgREST cannot see the new RPCs after migration, reload schema cache or stop release; do not patch frontend fallbacks to mask missing production RPCs.
- If browser smoke fails because the task zone panel cannot load, check RPC availability before changing UI code.
- If RLS evidence fails, rollback or patch the migration/RPC security before release; do not loosen client-side checks as a substitute.
- If production must rollback after deployment, revert app code to the previous release artifact and drop/revoke the new RPCs only after confirming no accepted production data depends on personal task-zone records.

### 18.5 Stop conditions

- Do not mark DEV-040 complete without DB migration evidence.
- Do not mark DEV-040 complete without at least one authenticated browser smoke showing create and board-adjacent placement panel access.
- Do not deploy to production if the target DB lacks `ensure_personal_task_zone`, `create_personal_quick_task`, or `place_personal_task_on_board` in schema cache.
- Do not expand Phase 1 into AI parsing, shared team inbox, full cross-workspace filters, notifications, or calendar integration without a new authorization boundary.
