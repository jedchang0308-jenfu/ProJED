import assert from 'node:assert/strict';
import { createBoardAssigneeFilterOptions } from '../src/features/taskFilters/assigneeOptions';
import { createDefaultTaskFilters } from '../src/features/taskFilters/defaults';
import { matchesTaskFilters } from '../src/features/taskFilters/predicates';
import type { TaskFilterableNode } from '../src/features/taskFilters/types';

const createTask = (
  id: string,
  assigneeIds: string[] = [],
  collaboratorIds: string[] = [],
): TaskFilterableNode => ({
  id,
  title: id,
  status: 'todo',
  endDate: null,
  tagIds: [],
  assigneeIds,
  assigneeId: assigneeIds[0],
  collaboratorIds,
});

const filterBy = (...selectedAssigneeIds: string[]) => ({
  ...createDefaultTaskFilters(),
  selectedAssigneeIds,
});

const primaryAndCollaboratorTask = createTask('primary-and-collaborator', ['primary-a'], ['collaborator-b']);
const collaboratorOnlyTask = createTask('collaborator-only', [], ['collaborator-b']);
const unassignedTask = createTask('unassigned');
const unrelatedTask = createTask('unrelated', ['primary-c'], ['collaborator-d']);

assert.equal(
  matchesTaskFilters(primaryAndCollaboratorTask, filterBy('collaborator-b')),
  true,
  'a collaborator must match the assignee filter',
);
assert.equal(
  matchesTaskFilters(collaboratorOnlyTask, filterBy('collaborator-b')),
  true,
  'a collaborator-only task must match the collaborator filter',
);
assert.equal(
  matchesTaskFilters(primaryAndCollaboratorTask, filterBy('unrelated-member')),
  false,
  'an unrelated member must not match',
);
assert.equal(
  matchesTaskFilters(collaboratorOnlyTask, filterBy('__unassigned__')),
  true,
  'a task without a primary assignee remains unassigned even when it has collaborators',
);
assert.equal(
  matchesTaskFilters(unassignedTask, filterBy('__unassigned__')),
  true,
  'a task without primary or collaborator is unassigned',
);
assert.equal(
  matchesTaskFilters(unrelatedTask, filterBy('collaborator-b', 'collaborator-d')),
  true,
  'multiple selected people use OR semantics',
);

const options = createBoardAssigneeFilterOptions(
  'board-1',
  [],
  {
    [primaryAndCollaboratorTask.id]: { ...primaryAndCollaboratorTask, boardId: 'board-1', isArchived: false } as never,
    [collaboratorOnlyTask.id]: { ...collaboratorOnlyTask, boardId: 'board-1', isArchived: false } as never,
    archived: { ...createTask('archived', [], ['archived-collaborator']), boardId: 'board-1', isArchived: true } as never,
  },
);
const optionIds = options.map((option) => option.id);
assert.deepEqual(
  optionIds.sort(),
  ['collaborator-b', 'primary-a'].sort(),
  'filter options must include primary and collaborator IDs from active tasks only',
);

console.log(JSON.stringify({
  ok: true,
  checks: 7,
  optionIds,
}, null, 2));
