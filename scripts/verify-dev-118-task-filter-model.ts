import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ALL_ASSIGNEES_FILTER,
  TASK_FILTER_DATE_BUCKETS,
  compileLegacyTaskFilterV5,
  compileTaskFilter,
  countActiveTaskFilters,
  createDefaultTaskFilters,
  createDefaultTaskFiltersV5,
  migrateTaskFiltersV5ToV6,
  normalizeTaskFilters,
  type LegacyTaskFilterQueryV5,
  type TaskFilterQuery,
} from '../src/features/taskFilters/index';

type FixtureTask = {
  id: string;
  title: string;
  status: string;
  endDate: string | null;
  assigneeId?: string | null;
  assigneeIds?: string[];
  collaboratorIds?: string[];
  tagIds?: string[];
  isArchived?: boolean;
};

const v5Fixture = JSON.parse(readFileSync(resolve('scripts/fixtures/dev-118-task-filter-conformance.json'), 'utf8'));
const v6Fixture = JSON.parse(readFileSync(resolve('scripts/fixtures/dev-118-task-filter-v6-conformance.json'), 'utf8'));
const v5Tasks: FixtureTask[] = v5Fixture.tasks;
const v6Tasks: FixtureTask[] = v6Fixture.tasks;
const sorted = (values: string[]) => [...values].sort();
const v5Ids = (filters: LegacyTaskFilterQueryV5) => sorted(v5Tasks.filter(task => compileLegacyTaskFilterV5(filters, v5Fixture.today).matches(task as never)).map(task => task.id));
const v6Ids = (filters: TaskFilterQuery) => sorted(v6Tasks.filter(task => compileTaskFilter(filters, v6Fixture.today).matches(task as never)).map(task => task.id));
const results: Array<{ name: string; ok: boolean; details?: string }> = [];
const check = (name: string, run: () => void) => {
  try {
    run();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, details: error instanceof Error ? error.message : String(error) });
  }
};

check('V6 fixture is non-empty and pins Taipei date boundaries', () => {
  assert.equal(v6Fixture.schemaVersion, 6);
  assert.equal(v6Fixture.timezone, 'Asia/Taipei');
  assert.equal(v6Fixture.tasks.length, 9);
  for (const bucket of TASK_FILTER_DATE_BUCKETS) assert.ok(v6Fixture.expected.dateBucketsN8[bucket].length > 0, bucket);
});

check('V6 default is explicit dynamic all with N=8 and active count zero', () => {
  const defaults = createDefaultTaskFilters();
  assert.deepEqual(defaults, {
    version: 6,
    statuses: { mode: 'all', values: [] },
    due: { mode: 'all', buckets: [], withinDays: 8 },
    people: { mode: 'all', ids: [], includeUnassigned: false },
    tags: { mode: 'all', ids: [], includeUntagged: false },
    keyword: '',
  });
  assert.equal(countActiveTaskFilters(defaults), 0);
  assert.deepEqual(v6Ids(defaults), sorted(v6Tasks.map(task => task.id)));
});

check('V6 normalization is deterministic, idempotent and never infers all from option count', () => {
  const normalized = normalizeTaskFilters({
    version: 6,
    statuses: { mode: 'selected', values: ['completed', 'todo', 'todo', 'in_progress', 'onhold'] },
    due: { mode: 'selected', buckets: ['after_days', 'unset', 'unset'], withinDays: 8 },
    people: { mode: 'selected', ids: ['person-b', 'person-a', 'person-a'], includeUnassigned: true },
    tags: { mode: 'selected', ids: ['tag-b', 'tag-a', 'tag-a'], includeUntagged: true },
    keyword: '  採購  ',
  });
  assert.equal(normalized.statuses.mode, 'selected');
  assert.deepEqual(normalized.statuses.values, ['todo', 'in_progress', 'onhold', 'completed']);
  assert.deepEqual(normalized.due, { mode: 'selected', buckets: ['unset', 'after_days'], withinDays: 8 });
  assert.deepEqual(normalized.people, { mode: 'selected', ids: ['person-a', 'person-b'], includeUnassigned: true });
  assert.deepEqual(normalized.tags, { mode: 'selected', ids: ['tag-a', 'tag-b'], includeUntagged: true });
  assert.equal(normalized.keyword, '採購');
  assert.deepEqual(normalizeTaskFilters(normalized), normalized);
});

check('V6 selected-empty and legacy none canonicalize to unrestricted all', () => {
  const selectedEmpty = normalizeTaskFilters({
    ...createDefaultTaskFilters(),
    statuses: { mode: 'selected', values: [] },
    people: { mode: 'selected', ids: [], includeUnassigned: false },
    tags: { mode: 'selected', ids: [], includeUntagged: false },
  });
  assert.equal(selectedEmpty.statuses.mode, 'all');
  assert.equal(selectedEmpty.people.mode, 'all');
  assert.equal(selectedEmpty.tags.mode, 'all');
  assert.deepEqual(v6Ids({ ...createDefaultTaskFilters(), people: { mode: 'none', ids: [], includeUnassigned: false } }), sorted(v6Tasks.map(task => task.id)));
  assert.deepEqual(v6Ids({ ...createDefaultTaskFilters(), tags: { mode: 'none', ids: [], includeUntagged: false } }), sorted(v6Tasks.map(task => task.id)));
  const staleAll = normalizeTaskFilters({
    ...createDefaultTaskFilters(),
    statuses: { mode: 'all', values: ['todo'] },
    people: { mode: 'all', ids: ['person-a'], includeUnassigned: true },
    tags: { mode: 'none', ids: ['tag-a'], includeUntagged: true },
  });
  assert.deepEqual(staleAll.statuses, { mode: 'all', values: [] });
  assert.deepEqual(staleAll.people, { mode: 'all', ids: [], includeUnassigned: false });
  assert.deepEqual(staleAll.tags, { mode: 'all', ids: [], includeUntagged: false });
});

check('V6 active count ignores unrestricted all and legacy none groups', () => {
  const defaults = createDefaultTaskFilters();
  assert.equal(countActiveTaskFilters({ ...defaults, statuses: { mode: 'none', values: [] } }), 0);
  assert.equal(countActiveTaskFilters({ ...defaults, due: { mode: 'none', buckets: [], withinDays: 8 } }), 0);
  assert.equal(countActiveTaskFilters({ ...defaults, people: { mode: 'none', ids: [], includeUnassigned: false } }), 0);
  assert.equal(countActiveTaskFilters({ ...defaults, tags: { mode: 'none', ids: [], includeUntagged: false } }), 0);
  const allNone: TaskFilterQuery = {
    ...defaults,
    statuses: { mode: 'none', values: [] },
    due: { mode: 'none', buckets: [], withinDays: 8 },
    people: { mode: 'none', ids: [], includeUnassigned: false },
    tags: { mode: 'none', ids: [], includeUntagged: false },
  };
  assert.equal(countActiveTaskFilters(allNone), 0);
  assert.equal(countActiveTaskFilters({ ...allNone, keyword: '採購' }), 1);
  assert.deepEqual(v6Ids(allNone), sorted(v6Tasks.map(task => task.id)));
});

check('V6 status uses same-group OR and legacy none restores unrestricted all', () => {
  const selected = normalizeTaskFilters({ ...createDefaultTaskFilters(), statuses: { mode: 'selected', values: ['todo', 'in_progress'] } });
  assert.deepEqual(v6Ids(selected), sorted([
    'unset-todo-unassigned-untagged', 'invalid-in-progress-collaborator-tag-a', 'before-todo-midnight-minus',
    'today-in-progress-midnight', 'day-365-todo-owner-b-tag-b', 'day-366-todo-owner-c-untagged',
  ]));
  assert.deepEqual(v6Ids({ ...selected, statuses: { mode: 'none', values: [] } }), sorted(v6Tasks.map(task => task.id)));
});

check('V6 all 16 date-bucket subsets equal the union of their exact partitions', () => {
  const buckets = TASK_FILTER_DATE_BUCKETS;
  for (let mask = 0; mask < 16; mask += 1) {
    const selectedBuckets = buckets.filter((_, index) => (mask & (1 << index)) !== 0);
    const due: TaskFilterQuery['due'] = selectedBuckets.length === 0
      ? { mode: 'all', buckets: [], withinDays: 8 }
      : { mode: 'selected', buckets: selectedBuckets, withinDays: 8 };
    const expected = selectedBuckets.length === 0
      ? sorted(v6Tasks.map(task => task.id))
      : sorted(selectedBuckets.flatMap(bucket => v6Fixture.expected.dateBucketsN8[bucket]));
    assert.deepEqual(v6Ids({ ...createDefaultTaskFilters(), due }), expected, `mask=${mask}`);
  }
  const selectedAll = normalizeTaskFilters({
    ...createDefaultTaskFilters(),
    due: { mode: 'selected', buckets: [...buckets], withinDays: 8 },
  });
  assert.equal(selectedAll.due.mode, 'selected');
  assert.equal(countActiveTaskFilters(selectedAll), 1);
});

check('V6 N=0, N=8 and N=365 are inclusive Taipei calendar-day boundaries', () => {
  const within = (withinDays: number) => normalizeTaskFilters({
    ...createDefaultTaskFilters(), due: { mode: 'selected', buckets: ['within_days'], withinDays },
  });
  assert.deepEqual(v6Ids(within(0)), sorted(v6Fixture.expected.withinDaysN0));
  assert.deepEqual(v6Ids(within(8)), sorted(v6Fixture.expected.dateBucketsN8.within_days));
  assert.deepEqual(v6Ids(within(365)), sorted(v6Fixture.expected.withinDaysN365));
  const after365 = normalizeTaskFilters({
    ...createDefaultTaskFilters(), due: { mode: 'selected', buckets: ['after_days'], withinDays: 365 },
  });
  assert.deepEqual(v6Ids(after365), sorted(v6Fixture.expected.afterDaysN365));
});

check('V6 completed past is before_today and invalid date is unset', () => {
  const before = normalizeTaskFilters({ ...createDefaultTaskFilters(), due: { mode: 'selected', buckets: ['before_today'], withinDays: 8 } });
  const unset = normalizeTaskFilters({ ...createDefaultTaskFilters(), due: { mode: 'selected', buckets: ['unset'], withinDays: 8 } });
  assert.ok(v6Ids(before).includes('before-completed-owner-a-tag-b'));
  assert.deepEqual(v6Ids(unset), sorted(v6Fixture.expected.dateBucketsN8.unset));
});

check('V6 people includes primary and collaborators, and unassigned requires both to be empty', () => {
  const personB = normalizeTaskFilters({ ...createDefaultTaskFilters(), people: { mode: 'selected', ids: ['person-b'], includeUnassigned: false } });
  assert.deepEqual(v6Ids(personB), sorted([
    'invalid-in-progress-collaborator-tag-a', 'before-todo-midnight-minus', 'today-in-progress-midnight', 'day-365-todo-owner-b-tag-b',
  ]));
  const unassigned = normalizeTaskFilters({ ...createDefaultTaskFilters(), people: { mode: 'selected', ids: [], includeUnassigned: true } });
  assert.deepEqual(v6Ids(unassigned), sorted(v6Fixture.expected.unassigned));
});

check('V6 tag selection is OR and includeUntagged is explicit', () => {
  const selected = normalizeTaskFilters({ ...createDefaultTaskFilters(), tags: { mode: 'selected', ids: ['tag-a', 'tag-c'], includeUntagged: false } });
  assert.deepEqual(v6Ids(selected), sorted([
    'invalid-in-progress-collaborator-tag-a', 'before-todo-midnight-minus', 'today-in-progress-midnight', 'day-8-onhold-owner-c-tag-c',
  ]));
  const untagged = normalizeTaskFilters({ ...createDefaultTaskFilters(), tags: { mode: 'selected', ids: [], includeUntagged: true } });
  assert.deepEqual(v6Ids(untagged), sorted(v6Fixture.expected.untagged));
});

check('V6 dynamic all includes future IDs while a full current snapshot stays selected', () => {
  const all = createDefaultTaskFilters();
  const selectedCurrent = normalizeTaskFilters({
    ...all,
    people: { mode: 'selected', ids: [...v6Fixture.options.people], includeUnassigned: true },
    tags: { mode: 'selected', ids: [...v6Fixture.options.tags], includeUntagged: true },
  });
  assert.equal(selectedCurrent.people.mode, 'selected');
  assert.equal(selectedCurrent.tags.mode, 'selected');
  assert.ok(v6Ids(all).includes('day-9-completed-future-option'));
  assert.equal(v6Ids(selectedCurrent).includes('day-9-completed-future-option'), false);
});

check('V6 keyword is trimmed case-insensitive title-only and all five groups use AND', () => {
  const filters = normalizeTaskFilters({
    ...createDefaultTaskFilters(),
    statuses: { mode: 'selected', values: ['in_progress'] },
    due: { mode: 'selected', buckets: ['within_days'], withinDays: 8 },
    people: { mode: 'selected', ids: ['person-b'], includeUnassigned: false },
    tags: { mode: 'selected', ids: ['tag-c'], includeUntagged: false },
    keyword: '  採購  ',
  });
  assert.deepEqual(v6Ids(filters), ['today-in-progress-midnight']);
  assert.equal(countActiveTaskFilters(filters), 5);
  assert.deepEqual(v6Ids({ ...filters, keyword: 'integration' }), []);
});

check('V5 frozen fixture keeps its 10 historical positive-inclusion oracles', () => {
  const defaults = createDefaultTaskFiltersV5();
  assert.deepEqual(v5Ids(defaults), sorted(v5Tasks.map(task => task.id)));
  assert.deepEqual(v5Ids({ ...defaults, statuses: ['todo', 'in_progress'] }), sorted(['todo-owner', 'progress-collab', 'overdue-unassigned', 'invalid-date']));
  assert.deepEqual(v5Ids({ ...defaults, statuses: ['todo', 'in_progress'], people: { ids: ['user-a'], includeUnassigned: false } }), sorted(['todo-owner', 'progress-collab', 'invalid-date']));
  assert.deepEqual(v5Ids({ ...defaults, due: { includeOverdue: true, upcomingWithinDays: 0 } }), sorted(['todo-owner', 'overdue-unassigned']));
  assert.deepEqual(v5Ids({ ...defaults, people: { ids: [], includeUnassigned: true } }), ['overdue-unassigned']);
  assert.deepEqual(v5Ids({ ...defaults, people: { ids: ['user-a'], includeUnassigned: false } }), sorted(['todo-owner', 'progress-collab', 'invalid-date']));
  assert.deepEqual(v5Ids({ ...defaults, tagIds: ['tag-blue', 'tag-red'] }), sorted(['todo-owner', 'progress-collab', 'overdue-unassigned', 'invalid-date']));
  assert.deepEqual(v5Ids({ ...defaults, keyword: 'BETA' }), ['progress-collab']);
  assert.deepEqual(v5Ids({ ...defaults, statuses: ['todo', 'in_progress'], due: { includeOverdue: false, upcomingWithinDays: 1 }, people: { ids: ['user-a'], includeUnassigned: false }, tagIds: ['tag-blue', 'tag-red'], keyword: 'integration' }), ['progress-collab']);
  const compiled = compileLegacyTaskFilterV5({ ...defaults, statuses: ['completed'] }, v5Fixture.today);
  assert.equal(compiled.matches(v5Tasks[3] as never), true);
  assert.equal(compiled.matches(v5Tasks[0] as never), false);
});

check('V5 to V6 conversion is identity-equivalent for all four legacy date combinations', () => {
  const defaults = createDefaultTaskFiltersV5();
  const combinations: LegacyTaskFilterQueryV5['due'][] = [
    { includeOverdue: false, upcomingWithinDays: null },
    { includeOverdue: true, upcomingWithinDays: null },
    { includeOverdue: false, upcomingWithinDays: 8 },
    { includeOverdue: true, upcomingWithinDays: 8 },
  ];
  for (const due of combinations) {
    const v5 = { ...defaults, due };
    const v6 = migrateTaskFiltersV5ToV6(v5);
    const nativeIds = sorted(v6Tasks.filter(task => compileLegacyTaskFilterV5(v5, v6Fixture.today).matches(task as never)).map(task => task.id));
    assert.deepEqual(v6Ids(v6), nativeIds, JSON.stringify(due));
    assert.equal(v6.due.mode, due.includeOverdue || due.upcomingWithinDays !== null ? 'legacy-v5' : 'all');
  }
});

check('V5 explicit full snapshots stay selected and historical all-assignees sentinel becomes all', () => {
  const defaults = createDefaultTaskFiltersV5();
  const converted = migrateTaskFiltersV5ToV6({
    ...defaults,
    statuses: ['todo', 'in_progress', 'onhold', 'completed'],
    people: { ids: [...v6Fixture.options.people], includeUnassigned: true },
    tagIds: [...v6Fixture.options.tags],
  });
  assert.equal(converted.statuses.mode, 'selected');
  assert.equal(converted.people.mode, 'selected');
  assert.equal(converted.tags.mode, 'selected');
  const sentinel = migrateTaskFiltersV5ToV6({ ...defaults, people: { ids: [ALL_ASSIGNEES_FILTER], includeUnassigned: true } });
  assert.deepEqual(sentinel.people, { mode: 'all', ids: [], includeUnassigned: false });
});

check('compiled V6 predicate is reusable with a frozen query and today', () => {
  const query = normalizeTaskFilters({ ...createDefaultTaskFilters(), statuses: { mode: 'selected', values: ['completed'] } });
  const compiled = compileTaskFilter(query, v6Fixture.today);
  assert.equal(compiled.matches(v6Tasks[2] as never), true);
  assert.equal(compiled.matches(v6Tasks[0] as never), false);
  assert.deepEqual(compiled.query, query);
});

const failed = results.filter(result => !result.ok);
console.log(JSON.stringify({
  ok: failed.length === 0,
  fixture: { v5TaskCount: v5Tasks.length, v6TaskCount: v6Tasks.length, today: v6Fixture.today, timezone: v6Fixture.timezone },
  summary: { pass: results.length - failed.length, fail: failed.length },
  results,
}, null, 2));
if (failed.length > 0) process.exitCode = 1;
