# SPEC-013 Task Tree Duplicate Context Menu

Status: Implemented / QC Passed
DEV: DEV-013
Date: 2026-06-08

## Summary

Add a task duplicate action to the global task context menu. The action duplicates the selected task and all non-archived descendants, preserving task information while creating new task ids and a new parent-child tree.

## User Decision

- Duplicate scope: copy the selected task subtree and copy only dependencies whose `fromId` and `toId` are both inside that subtree.
- Title handling: append `（副本）` only to the copied root task title. Descendant task titles remain unchanged.

## Functional Requirements

- The right-click task menu shows a `複製任務` action for users with `create_task`.
- The copied root is inserted as a sibling after the source task.
- Descendants keep their original relative hierarchy and order.
- Copied task nodes preserve:
  - `description`
  - `detailNotes`
  - `status`
  - `assigneeId`
  - `collaboratorIds`
  - `tagIds`
  - `startDate`
  - `endDate`
  - `isDurationLocked`
  - `nodeType`
  - `kanbanStageId`
- New copied nodes receive new ids, new `createdAt`, and new `updatedAt`.
- `detailNotes` are deep-copied and receive new note ids.
- Archived descendants are not copied.
- Internal dependencies are copied with new dependency ids and remapped endpoint ids.
- Dependencies that connect the copied subtree to outside tasks are not copied.

## Permission Rules

- Duplicating task nodes requires `create_task`.
- If the source subtree has internal dependencies, duplicating those dependencies requires `create_dependency`.
- If dependency permission is missing, the duplicate action must not partially copy; it should warn the user.

## Data And Persistence

- Implement the duplicate operation in `useWbsStore`, not in the context menu component.
- Persist copied nodes parent-first, then persist copied dependencies.
- This ordering is required for Supabase because child inserts resolve `parentId` to database ids.
- No database schema migration is required.

## Acceptance Criteria

- Right-clicking a task exposes `複製任務`.
- Duplicating a single task creates a sibling after the source with `（副本）`.
- Duplicating a multi-level task copies all visible descendants and preserves the hierarchy.
- Copied internal dependencies point only to copied task ids.
- External dependencies are ignored.
- Undo removes the copied subtree and copied dependencies as one command; redo restores them.
- Lint, TypeScript, build, and a DEV-013 verifier pass.
