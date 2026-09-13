import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  compileTaskFilter,
  createDefaultTaskFilters,
  matchesTaskFilters,
  normalizeTaskFilters,
  type TaskFilterQuery,
} from '../src/features/taskFilters/index';

const fixture = JSON.parse(readFileSync(resolve('scripts/fixtures/dev-118-task-filter-conformance.json'), 'utf8'));
const tasks = fixture.tasks.map((task: any) => ({
  id: task.id,
  title: task.title,
  status: task.status,
  endDate: task.endDate,
  assigneeId: task.assigneeId,
  assigneeIds: task.assigneeIds,
  collaboratorIds: task.collaboratorIds,
  tagIds: task.tagIds,
  isArchived: task.isArchived,
}));
const query = (overrides: Partial<TaskFilterQuery>): TaskFilterQuery => normalizeTaskFilters({
  ...createDefaultTaskFilters(),
  ...overrides,
});
const ids = (filters: TaskFilterQuery) => tasks.filter((task: any) => matchesTaskFilters(task, filters, fixture.today)).map((task: any) => task.id);
const results: Array<{ name: string; ok: boolean; details?: string }> = [];
const check = (name: string, run: () => void) => {
  try {
    run();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, details: error instanceof Error ? error.message : String(error) });
  }
};

check('default query is unrestricted', () => assert.deepEqual(ids(query({})), fixture.tasks.map((task: any) => task.id)));
check('status selection is positive inclusion and same-group OR', () => {
  assert.deepEqual(ids(query({ statuses: ['todo', 'in_progress'] })), ['todo-owner', 'progress-collab', 'overdue-unassigned', 'invalid-date']);
});
check('cross-group conditions are AND', () => {
  assert.deepEqual(ids(query({
    statuses: ['todo', 'in_progress'],
    people: { ids: ['user-a'], includeUnassigned: false },
  })), ['todo-owner', 'progress-collab', 'invalid-date']);
});
check('due filter uses overdue OR today-through-N and rejects missing dates when enabled', () => {
  assert.deepEqual(ids(query({ due: { includeOverdue: true, upcomingWithinDays: 0 } })), ['todo-owner', 'overdue-unassigned']);
});
check('unassigned only matches empty primary assignee, not collaborator-only', () => {
  assert.deepEqual(ids(query({ people: { ids: [], includeUnassigned: true } })), ['overdue-unassigned']);
});
check('people group includes primary and collaborator matches', () => {
  assert.deepEqual(ids(query({ people: { ids: ['user-a'], includeUnassigned: false } })), ['todo-owner', 'progress-collab', 'invalid-date']);
});
check('tag group is OR', () => {
  assert.deepEqual(ids(query({ tagIds: ['tag-blue', 'tag-red'] })), ['todo-owner', 'progress-collab', 'overdue-unassigned', 'invalid-date']);
});
check('keyword is case-insensitive contains', () => {
  assert.deepEqual(ids(query({ keyword: 'BETA' })), ['progress-collab']);
});
check('all five groups compose with AND', () => {
  const compiled = compileTaskFilter(query({
    statuses: ['todo', 'in_progress'],
    due: { includeOverdue: false, upcomingWithinDays: 1 },
    people: { ids: ['user-a'], includeUnassigned: false },
    tagIds: ['tag-blue', 'tag-red'],
    keyword: 'integration',
  }), fixture.today);
  assert.deepEqual(tasks.filter((task: any) => compiled.matches(task)).map((task: any) => task.id), ['progress-collab']);
});
check('compiled predicate is reusable without per-task query normalization', () => {
  const compiled = compileTaskFilter(query({ statuses: ['completed'] }), fixture.today);
  assert.equal(compiled.matches(tasks[3]), true);
  assert.equal(compiled.matches(tasks[0]), false);
});

const failed = results.filter(result => !result.ok);
console.log(JSON.stringify({ ok: failed.length === 0, summary: { pass: results.length - failed.length, fail: failed.length }, results }, null, 2));
if (failed.length > 0) process.exitCode = 1;
