import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  normalizeTaskAssignmentSelection,
  normalizeTaskAssignmentUpdates,
} from '../src/utils/taskAssignments';

const baseNode = {
  id: 'task-1',
  workspaceId: 'workspace-1',
  boardId: 'board-1',
  parentId: null,
  title: '多人成員任務',
  status: 'in_progress' as const,
  nodeType: 'task' as const,
  order: 0,
  assigneeId: 'primary-1',
  assigneeIds: ['primary-1'],
  collaboratorIds: ['collaborator-1'],
};

assert.deepEqual(
  normalizeTaskAssignmentSelection(['primary-1', 'primary-1', 'primary-2'], ['primary-2', 'collaborator-1']),
  { primaryIds: ['primary-1', 'primary-2'], collaboratorIds: ['collaborator-1'] },
  'primary and collaborator roles must be unique and mutually exclusive',
);

assert.deepEqual(
  normalizeTaskAssignmentUpdates(baseNode, {
    assigneeIds: [],
    collaboratorIds: ['collaborator-2'],
  }),
  {
    assigneeIds: undefined,
    assigneeId: undefined,
    collaboratorIds: ['collaborator-2'],
  },
  'active tasks may be left without primary assignees when the user clears them',
);

assert.deepEqual(
  normalizeTaskAssignmentUpdates(baseNode, {
    assigneeIds: ['primary-1', 'primary-2'],
    collaboratorIds: ['primary-2', 'collaborator-2'],
  }),
  {
    assigneeIds: ['primary-1', 'primary-2'],
    assigneeId: 'primary-1',
    collaboratorIds: ['collaborator-2'],
  },
  'updates must persist the compatibility alias and remove duplicated roles',
);

const migration = fs.readFileSync('supabase/migrations/20260715143000_task_multi_person_assignment.sql', 'utf8');
const picker = fs.readFileSync('src/components/TaskAssignmentPicker.tsx', 'utf8');
const filter = fs.readFileSync('src/features/taskFilters/predicates.ts', 'utf8');
const store = fs.readFileSync('src/store/useWbsStore.ts', 'utf8');
assert.match(migration, /assignee_ids uuid\[\]/);
assert.match(migration, /wbs_items_assignment_roles_disjoint/);
assert.match(migration, /sync_wbs_item_assignment_roles/);
assert.match(migration, /with ordinality/);
assert.doesNotMatch(migration, /array_agg\(distinct id order by id\)/);
assert.match(picker, /主責成員（可複選）/);
assert.match(picker, /協作成員（可複選）/);
assert.match(picker, /共同主責較多/);
assert.doesNotMatch(picker, /至少要保留一位主責|requiresPrimaryAssignee/);
assert.doesNotMatch(store, /執行中的任務至少要設定一位主責|requiresPrimaryAssignee/);
assert.match(filter, /assigneeIds/);
assert.match(filter, /some\(assigneeId/);

console.log('DEV-048 multi-person assignment verification passed.');
