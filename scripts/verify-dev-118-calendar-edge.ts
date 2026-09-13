import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { matchesTaskFilterQueryV5, normalizeTaskFilterQueryV5 } from '../supabase/functions/calendar-feed/taskFilterV4';

const source = readFileSync(resolve('supabase/functions/calendar-feed/index.ts'), 'utf8');
const task = {
  status: 'in_progress',
  end_date: '2026-09-12',
  assignee_id: 'user-b',
  assignee_ids: ['user-b'],
  collaborator_ids: ['user-a'],
  tagIds: ['tag-blue'],
  title: 'Beta integration',
};
const query = normalizeTaskFilterQueryV5({
  statuses: ['in_progress'],
  due: { includeOverdue: false, upcomingWithinDays: 1 },
  people: { ids: ['user-a'], includeUnassigned: false },
  tagIds: ['tag-blue'],
  keyword: 'integration',
});
assert.equal(matchesTaskFilterQueryV5(task, query, '2026-09-11'), true);
assert.equal(matchesTaskFilterQueryV5({ ...task, collaborator_ids: [] }, query, '2026-09-11'), false);
assert.equal(source.includes('taskFilterV4.ts'), true);
assert.equal(source.includes('filters.version === 4'), true);
assert.equal(source.includes('matchesTaskFilterQueryV5'), true);
assert.equal(source.includes('getEffectiveDateTypes'), true);
console.log(JSON.stringify({ ok: true, checks: 6 }));
