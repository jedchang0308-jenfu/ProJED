import { materializeCalendarBoardFilters } from '../src/features/calendarSubscriptions/filters';
import { matchesTaskFilters } from '../src/features/taskFilters';
import type { CalendarSubscriptionFilters } from '../src/services/supabase/database.types';

const boards = [
  { id: 'board-a', storageId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', workspaceId: 'workspace-a', storageWorkspaceId: '11111111-1111-4111-8111-111111111111' },
  { id: 'board-b', storageId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', workspaceId: 'workspace-a', storageWorkspaceId: '11111111-1111-4111-8111-111111111111' },
];

const results: Array<{ name: string; ok: boolean; details?: unknown }> = [];
const assert = (name: string, ok: boolean, details?: unknown) => results.push({ name, ok, details });

const fresh = materializeCalendarBoardFilters(boards, null, 'current-user');
assert('new draft includes every current board', Object.values(fresh).every(snapshot => snapshot.included));
assert('new draft defaults to current user', Object.values(fresh).every(snapshot => snapshot.filters.selectedAssigneeIds.join() === 'current-user'));
assert('new draft defaults every board to due date', Object.values(fresh).every(snapshot => snapshot.date_types.join() === 'due_date'));

const v1: CalendarSubscriptionFilters = {
  scope_type: 'workspace',
  workspace_ids: ['11111111-1111-4111-8111-111111111111'],
  assignee: { type: 'selected', user_ids: ['current-user'], include_unassigned: true },
  date_types: ['due_date'],
};
const fromV1 = materializeCalendarBoardFilters(boards, v1, 'current-user');
assert('v1 storage workspace alias materializes both boards', Object.values(fromV1).every(snapshot => snapshot.included));
assert('v1 conversion preserves completed output', Object.values(fromV1).every(snapshot => snapshot.filters.statusFilters.completed));
assert('v1 selected and unassigned assignees are preserved', Object.values(fromV1).every(snapshot =>
  snapshot.filters.selectedAssigneeIds.includes('current-user') && snapshot.filters.selectedAssigneeIds.includes('__unassigned__')));
assert('v1 shared event dates are copied into every board', Object.values(fromV1).every(snapshot => snapshot.date_types.join() === 'due_date'));

const v2: CalendarSubscriptionFilters = {
  version: 2,
  v2_scope_type: 'all_accessible_boards_snapshot',
  workspace_ids: ['workspace-a'],
  project_ids: ['board-a', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
  assignee: { type: 'me' },
  date_types: ['due_date'],
  global_filter: {
    statusFilters: { todo: true, in_progress: true, delayed: true, completed: false, unsure: true, onhold: true },
    dueWithinDays: null,
    selectedAssigneeIds: ['current-user'],
    selectedTagIds: [],
    keyword: 'global',
  },
  board_overrides: {
    'board-a': {
      enabled: true,
      statusFilters: { todo: true, in_progress: true, delayed: true, completed: false, unsure: true, onhold: true },
      dueWithinDays: 7,
      selectedAssigneeIds: ['current-user'],
      selectedTagIds: ['tag-a'],
      keyword: 'override',
    },
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb': { enabled: false },
  },
};
const fromV2 = materializeCalendarBoardFilters(boards, v2, 'current-user');
assert('v2 override becomes board A effective snapshot', fromV2['board-a'].filters.keyword === 'override' && fromV2['board-a'].filters.dueWithinDays === 7);
assert('v2 disabled board becomes excluded snapshot', fromV2['board-b'].included === false);
assert('v2 shared event dates are copied into every board', Object.values(fromV2).every(snapshot => snapshot.date_types.join() === 'due_date'));

const v3: CalendarSubscriptionFilters = {
  version: 3,
  v3_scope_type: 'per_board_filter_snapshot',
  workspace_ids: ['11111111-1111-4111-8111-111111111111'],
  project_ids: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
  board_filters: {
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa': { included: true, date_types: ['start_date'], filters: { ...fresh['board-a'].filters, keyword: 'alpha' } },
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb': { included: true, date_types: ['due_date'], filters: { ...fresh['board-b'].filters, keyword: 'beta' } },
  },
};
const fromV3 = materializeCalendarBoardFilters(boards, v3, 'current-user');
assert('v3 aliases map to app board drafts', fromV3['board-a'].filters.keyword === 'alpha' && fromV3['board-b'].filters.keyword === 'beta');
assert('v3 event dates remain independent per board', fromV3['board-a'].date_types.join() === 'start_date' && fromV3['board-b'].date_types.join() === 'due_date');

const fixtureTasks = [
  { id: 'a1', boardId: 'board-a', title: 'alpha launch', status: 'todo', assigneeId: 'current-user', tagIds: [], startDate: '2099-01-01' },
  { id: 'a2', boardId: 'board-a', title: 'beta wrong board', status: 'todo', assigneeId: 'current-user', tagIds: [], endDate: '2099-01-01' },
  { id: 'b1', boardId: 'board-b', title: 'beta rollout', status: 'todo', assigneeId: 'current-user', tagIds: [], endDate: '2099-01-01' },
];
const previewIds = fixtureTasks
  .filter(task => fromV3[task.boardId].included &&
    fromV3[task.boardId].date_types.some(type => type === 'start_date' ? Boolean(task.startDate) : Boolean(task.endDate)) &&
    matchesTaskFilters(task, fromV3[task.boardId].filters))
  .map(task => task.id);
assert('per-board fixture identity is deterministic', previewIds.join(',') === 'a1,b1', previewIds);

fromV3['board-b'].filters.keyword = 'changed';
assert('materialized snapshots are independent objects', fromV3['board-a'].filters.keyword === 'alpha');

const failed = results.filter(result => !result.ok);
console.log(JSON.stringify({ ok: failed.length === 0, summary: { pass: results.length - failed.length, fail: failed.length }, results }, null, 2));
if (failed.length > 0) process.exit(1);
