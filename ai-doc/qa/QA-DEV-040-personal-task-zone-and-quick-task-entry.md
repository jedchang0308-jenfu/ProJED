# QA-DEV-040 - Personal Task Zone and Quick Task Entry

Status: Draft / Ready for QA after RD implementation
Date: 2026-06-30
Related:
- SPEC-040 - Personal Task Zone and Quick Task Entry
- SPEC-028 - Cross-mode Trello-like Task Interactions
- SPEC-039 - Cloud Quick Capture Inbox Drag-to-Task

## 1. QA Purpose

Validate that the high-frequency quick memo workflow has become a first-class task workflow:
- Quick input creates canonical tasks immediately.
- The primary UI is `任務專區`, not a secondary memo drawer.
- Personal-zone tasks are private and synced.
- Dragging into a board uses the same task placement behavior as normal task dragging.
- Existing board task workflows do not regress.

## 2. Scope

In scope:
- Primary `任務專區` navigation and view.
- Quick task creation.
- `待歸位` personal task list.
- Edit, complete and delete behavior for personal-zone tasks.
- Drag placement from personal zone into board positions.
- Cloud sync and RLS privacy.
- Regression for normal board drag/drop.

Out of scope:
- AI task parsing.
- Shared team inbox.
- Full cross-workspace aggregation if not implemented in Phase 1.
- Calendar/reminder integration.
- Mobile-native app behavior unless separately implemented.

## 3. Preconditions

Test accounts:
- User A: owns a workspace/project/board.
- User B: separate authenticated user without access to User A personal zone.
- Anonymous session.

Test data:
- At least one board with multiple cards/tasks.
- At least one nested task or card with subtasks, if existing product supports it.
- One personal-zone task created by User A.
- Optional old DEV-039 memo/inbox item for compatibility smoke.

Environment:
- Local/staging Supabase or approved production migration environment.
- Browser with drag/drop support.
- Optional second browser/profile to simulate cross-device sync.

## 4. Static Review Checklist

Product and naming:
- `任務專區` appears as a primary destination.
- Main quick input copy says task-oriented language, not memo-only language.
- `收件夾` is not the main visible name for this workflow.
- Separate memo triage drawer is not the primary placement path.

Architecture:
- Quick input creates canonical task records.
- `inbox_items` is not expanded into a second full-featured task model.
- New quick input does not write new `inbox_items` records.
- Phase 1 uses hidden personal project + `wbs_items`; it does not introduce nullable `wbs_items.project_id` or a new global task table.
- Personal-zone task components reuse existing task UI/service primitives where practical.
- Drag overlay/drop indicator uses shared task drag primitives, not a memo-only duplicate.
- No AI/token-consuming parsing is added by default.

## 5. Database and RLS Tests

Personal zone creation:
- User A can call the personal-zone bootstrap operation.
- Repeating bootstrap returns the same zone or an equivalent idempotent result.
- User B cannot read or mutate User A personal zone.
- Anonymous user cannot read or mutate any personal zone.

Quick task creation:
- User A can create a quick task with a valid title.
- Empty or whitespace-only title is rejected.
- Repeating the same `client_mutation_id` does not create duplicates.
- Created task is stored as a canonical task.
- Created task has unplaced/personal-zone metadata or equivalent state.

Personal task privacy:
- User A can list own `待歸位` tasks.
- User B cannot list, infer count, read title or mutate User A personal tasks.
- Anonymous user cannot list, infer count, read title or mutate User A personal tasks.

Placement permission:
- User A can place a personal task into a board where User A has task-create/move permission.
- Placement fails when User A lacks target board permission.
- Failed placement keeps the task in `待歸位`.
- Repeating the same placement request does not create duplicates.

## 6. Browser Functional Tests

Primary access:
- Open the app as User A.
- Confirm `任務專區` is visible in a primary visual location.
- Open `任務專區`.
- Confirm quick-create input is immediately available.

Quick create:
- Type `快速任務 QA 001`.
- Submit.
- Confirm the input clears only after successful creation.
- Confirm the task appears in `待歸位`.
- Confirm pending/synced state is visible if implemented.

Task controls:
- Edit the task title.
- Complete the task.
- Uncomplete the task.
- Delete another test task.
- Confirm behavior matches normal task semantics and does not require a separate conversion step.
- If description is supported by the normal task details UI, confirm personal-zone task description can be edited.
- If due date is supported by the normal task details UI, confirm personal-zone task due date can be edited.
- If checklist/subtasks are supported outside board-specific assumptions, confirm they work for personal-zone tasks.
- If assignee/tags are unavailable before placement, confirm they are hidden, disabled with explanation, or explicitly deferred.

Cross-session sync:
- Open the same user in another browser/profile.
- Confirm the created personal task appears after sync.
- Update title or completion in one session.
- Confirm the other session receives the updated state.

Drag placement:
- Open a board with several existing tasks.
- Drag a `待歸位` task into the board.
- Confirm positioning frame/drop indicator matches normal task drag behavior.
- Drop between existing tasks.
- Confirm the task appears at the intended position.
- Confirm the task disappears from `待歸位`.
- Refresh.
- Confirm the placed task remains in the board and does not duplicate.

Permission failure:
- Attempt placement into a board where the user lacks permission, if such a test board exists.
- Confirm the error is recoverable.
- Confirm the task remains in `待歸位`.
- Confirm no duplicate appears in the target board.

## 7. Regression Tests

Normal board drag/drop:
- Drag a board task to another position in the same list/card.
- Confirm the same positioning frame appears.
- Drop and confirm order persists.

Nested task behavior:
- Drag a task into a nested/subtask position if supported.
- Confirm normal board behavior is unchanged.

Existing DEV-039 data:
- If old memo/inbox records exist, confirm they are not destructively deleted.
- Confirm new quick task creation does not create new `inbox_items`.
- Confirm old data is either visible inside `任務專區` as transitional legacy content or safely ignored according to RD release notes.
- Confirm old data is not shown through a second primary floating triage window.

Workspace/project navigation:
- Confirm personal-zone system project does not pollute normal workspace/project lists.
- Confirm normal workspace/project switching still works.

## 8. Visual QC Checklist

Desktop:
- `任務專區` has a clear primary visual hierarchy.
- Quick-create input does not fight with board content.
- `待歸位` count/badge is readable.
- Drag overlay does not jitter, clip or show a mismatched style.
- Drop frame/insert indicator matches normal task dragging.

Mobile or narrow viewport, if web responsive path exists:
- Primary task-zone access remains reachable.
- Quick-create input is usable.
- Personal task cards do not overflow horizontally.
- Drag fallback or non-drag placement path is understandable if touch drag is not supported.

## 9. Stop Conditions

Stop QA and return to RD if:
- Quick input creates memo/inbox records instead of task records.
- User B can see any User A personal task data.
- Drag/drop visual behavior differs from normal task dragging.
- Placement creates duplicate tasks.
- Failed placement loses the task.
- Personal-zone project appears as a normal workspace/project to other users.
- RD introduces nullable `wbs_items.project_id` or a new global task table without ADR.
- A board-supported core task feature silently disappears for personal-zone tasks without documented deferment.
- Any production migration was applied without migration evidence.

## 10. Release Evidence Required

QA should attach:
- Screenshot or video of `任務專區` primary access.
- Screenshot or video of quick task creation.
- Screenshot or video of drag placement with visible drop indicator.
- RLS test result for owner, another user and anonymous access.
- Regression result for normal board drag/drop.
- Confirmation that no AI/token-consuming feature was introduced.

## 11. Automated Gate Entrypoints

Run when verification is authorized:
- `npm run verify:dev-040-personal-task-zone`
- `npm run verify:dev-040-personal-task-zone-browser`
- `tsc --noEmit`
- `npm run build`

Database/RLS gate remains manual or Supabase-MCP based until the DEV-040 migration is applied to the target environment.

## 12. Release Evidence Checklist

DEV-040 cannot be accepted as complete until all of the following evidence exists in the release or QC record:

- Static verifier: `npm run verify:dev-040-personal-task-zone`.
- TypeScript gate: project-standard `tsc --noEmit` or equivalent.
- Build gate: project-standard production build command.
- Browser smoke: `npm run verify:dev-040-personal-task-zone-browser`.
- Task-zone details evidence: before placement, a personal task can open details and save title, status, start/end dates, and detail notes/description.
- Migration evidence: target DB contains the DEV-040 RPCs and PostgREST schema cache can resolve them.
- RLS evidence: owner can create/place; unrelated user cannot read or place another user's personal-zone task; anon cannot execute RPCs.
- Regression evidence: normal task drag/drop still shows the same positioning frame and still saves order.

## 13. Release Stop Conditions

- Stop if the DEV-040 migration has not been applied to the target environment.
- Stop if the app reports missing RPC functions or stale schema cache for personal task-zone RPCs.
- Stop if `任務專區` appears only as a secondary floating widget and not as a primary app destination.
- Stop if dragging a personal-zone item to board does not show the same positioning affordance as normal task drag.
- Stop if old `inbox_items` UI reappears as a second primary workflow.
- Stop if any failed RLS/security result is only handled client-side.
