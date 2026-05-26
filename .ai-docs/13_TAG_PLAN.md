# ProJED Workspace Tag Feature Plan

Last updated: 2026-05-25

## Purpose

Implement a Trello-inspired tag feature for ProJED tasks. Users should be able to create labels, choose label colors, apply multiple labels to any task, remove labels from tasks, and use labels to visually classify and filter work.

This plan intentionally uses workspace-shared labels instead of Trello's board-only label scope, because the product decision is that one workspace should reuse the same label set across all boards.

Thinking habits used: #RightProblem, #SystemsThinking, #ConstraintSatisfaction, #DesignThinking, #RiskMitigation, #AudienceAware.

## Trello Reference Behavior

Reference: [Add a label to a card | Trello | Atlassian Support](https://support.atlassian.com/trello/docs/adding-labels-to-cards/)

Relevant behavior to adapt:

- Labels categorize cards/tasks.
- Each label has a color and can have a name.
- A single card/task can have multiple labels.
- Active labels are visible on the card/task surface and in the detail view.
- Users can add, remove, rename, recolor, and delete labels.
- Deleting a label removes it from all cards/tasks that use it.
- Board filtering can include labels. ProJED will adapt this to workspace-shared labels.

Out of scope for v1:

- Trello keyboard shortcuts for labels.
- Label suggestion automation.
- Colorblind-friendly pattern symbols.
- Trello's board-only label scope.

## Product Specification

Labels are scoped to a workspace:

- Every workspace owns one shared label list.
- All boards inside that workspace can use the same labels.
- Any `TaskNode` can store zero or more labels through `tagIds`.
- A deleted workspace label disappears from every task in that workspace.
- Task completion remains represented by existing `status === 'completed'`; no new `done` boolean is added.

The first implementation should prioritize:

- Create label.
- Rename label.
- Change label color.
- Delete label.
- Add or remove labels from any task.
- Show labels on Kanban cards, checklist items, list rows, and task details.
- Filter tasks by selected labels.

## Implementation Tasks

| ID | Task | Completion | Deliverable | Acceptance Check |
| --- | --- | --- | --- | --- |
| 1 | Data model design | Completed | Add `TaskTag` type and `tagIds?: string[]` on `TaskNode`. | TypeScript accepts tag-aware task data without breaking existing nodes. |
| 2 | Tag state management | Completed | Add a `useTagStore` for workspace tag list, selected tag filters, and tag CRUD actions. | UI can read tags and mutate tags through one store boundary. |
| 3 | Data backend abstraction | Completed | Add `tagService` to `src/services/dataBackend.ts`. | `local-test`, Firebase, and Supabase have the same tag service contract. |
| 4 | Local-test persistence | Completed | Store tags in localStorage and keep node `tagIds` persisted with existing node data. | Reloading local-test mode preserves labels and task assignments. |
| 5 | Firebase persistence | Completed | Store labels at `workspaces/{workspaceId}/tags`; keep task assignments on node `tagIds`. | Firebase mode can create tags and sync task tag assignments. |
| 6 | Supabase schema | Completed | Add migration for `task_tags` and `wbs_item_tags`, with tenant-aware RLS and cascade cleanup. | Supabase static checks and RLS policy review pass. |
| 7 | Supabase adapter and types | Completed | Update `database.types.ts` and `projedService.ts` to map workspace tags and task `tagIds`. | Supabase mode loads tasks with labels and writes label assignments correctly. |
| 8 | Shared UI components | Completed | Add `TagChip`, `TagPicker`, and `TagColorPalette`. | Components support display, search, create, select, rename, recolor, and delete flows. |
| 9 | Task detail integration | Completed | Add a Labels section to `TaskDetailsModal`. | Users can manage and apply labels from the task detail modal. |
| 10 | Kanban and list display | Completed | Show labels on `KanbanCard`, `KanbanChecklist`, and `WbsNodeItem`. | Labels remain readable without breaking dense task layout on desktop or mobile. |
| 11 | Label filtering | Completed | Add label filtering near the existing status filter UX. | Selecting one or more labels shows tasks matching any selected label. |
| 12 | Import, export, and RAG | Completed | Include workspace tags and task `tagIds` in export/import; add tag names to WBS RAG content. | Backups preserve labels and AI retrieval can reference task labels. |
| 13 | Verification | Completed | Run static checks and local-test manual QA. | Lint/typecheck/build pass, Supabase static verification passes, and core label create/apply/display/filter panel workflows pass in local-test mode. |

## Type And API Changes

Add these public app types:

```ts
export type TagColor =
  | 'green'
  | 'yellow'
  | 'orange'
  | 'red'
  | 'purple'
  | 'blue'
  | 'sky'
  | 'lime'
  | 'pink'
  | 'black'
  | 'gray';

export interface TaskTag {
  id: string;
  workspaceId: string;
  name: string;
  color: TagColor;
  order: number;
  createdAt?: number;
  updatedAt?: number;
}
```

Update `TaskNode`:

```ts
export interface TaskNode {
  tagIds?: string[];
}
```

Add a backend service contract:

```ts
export const tagService = {
  listByWorkspace: (workspaceId: string) => Promise<TaskTag[]>,
  create: (workspaceId: string, tag: TaskTag) => Promise<TaskTag>,
  update: (workspaceId: string, tagId: string, updates: Partial<TaskTag>) => Promise<void>,
  delete: (workspaceId: string, tagId: string) => Promise<void>,
  setNodeTags: (workspaceId: string, boardId: string, nodeId: string, tagIds: string[]) => Promise<void>,
};
```

Implementation default:

- Store task assignments as `TaskNode.tagIds`.
- Keep tag definitions separate from task nodes.
- Do not create a separate task completion boolean.

## Supabase Design

Add two tables:

- `task_tags`: workspace-level tag definitions.
- `wbs_item_tags`: many-to-many join table between `wbs_items` and `task_tags`.

Required behavior:

- `task_tags.tenant_id` maps to ProJED workspace/tenant.
- `wbs_item_tags.tenant_id` must match the tag and WBS item tenant.
- RLS follows current tenant membership helpers.
- Deleting a tag cascades to `wbs_item_tags`.
- Existing `wbs_items` rows stay valid without labels.

The Supabase adapter should:

- Load tags for the active workspace.
- Load task tag assignments for the active board.
- Map assignment rows into `TaskNode.tagIds`.
- Write node tag changes through the join table, not through free-form metadata.

## UI Design

Task detail modal:

- Add a compact Labels section near status/date controls.
- Show assigned labels as colored chips.
- Provide a label picker with search, checkbox selection, create label, edit label, recolor, and delete.

Kanban and checklist:

- Show labels above or below the task title, using compact colored chips or short color bars.
- Avoid increasing card height too much on mobile.
- Long label names truncate with a tooltip.

List view:

- Add a label chip area near title/status.
- Keep row height stable and avoid text overlap.

Filtering:

- Add label filters near the existing status filter bar.
- When no label is selected, show all tasks allowed by status filters.
- When labels are selected, show tasks that match any selected label.
- Status filters and label filters both apply.

## Test Plan

Static checks:

- `npm run lint`
- `tsc --noEmit`
- `npm run build`

Local-test manual QA:

- Create a workspace label.
- Rename the label.
- Change the label color.
- Apply one label to a task.
- Apply multiple labels to a task.
- Remove one label from a task.
- Delete a label and confirm it disappears from all tasks.
- Reload the app and confirm labels persist.
- Filter by one label.
- Filter by multiple labels.
- Confirm status filters and label filters combine correctly.

Backend QA:

- Firebase mode creates workspace tags and persists `TaskNode.tagIds`.
- Supabase migration creates required tables, policies, indexes, and cascade behavior.
- Supabase adapter loads and writes `tagIds` without breaking existing WBS nodes.

Regression checks:

- Existing WBS create/update/delete still works.
- Existing dependency scheduling still works.
- Existing task completion through `status === 'completed'` still works.
- Import/export remains backward compatible with files that do not contain tags.

## Assumptions

- The requested "completion field" is for this implementation task checklist, not a new task boolean in the app.
- Workspace-shared labels are the product decision for this feature.
- v1 should focus on core label management, task assignment, display, and filtering.
- Supabase remains supported but should not become the only backend path.
- Existing Firebase and local-test behavior must keep working.
