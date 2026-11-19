import assert from 'node:assert/strict';
import {
  classifyTaskDetailsReadback,
  isTaskDetailsDateDraftValid,
  taskDetailsDraftConflicts,
  taskDetailsFieldsFromNode,
} from '../src/components/taskDetailsDraft';
import type { TaskNode } from '../src/types';

const baseline = taskDetailsFieldsFromNode({
  title: 'Original', startDate: '2026-11-10', endDate: '2026-11-20', status: 'todo',
} as TaskNode);
const submitted = { title: 'Draft', startDate: '2026-11-15', status: 'completed' as const };

assert.deepEqual(classifyTaskDetailsReadback(submitted, baseline, {
  ...baseline, title: 'Draft', status: 'in_progress',
}), { confirmed: ['title'], unchanged: ['startDate'], conflicts: ['status'] }, 'mixed readback distinguishes committed, safe-to-resend and third-party values');
assert.deepEqual(classifyTaskDetailsReadback(submitted, baseline, baseline), {
  confirmed: [], unchanged: ['title', 'startDate', 'status'], conflicts: [],
}, 'only a baseline match permits resending an unknown key');
assert.deepEqual(classifyTaskDetailsReadback(submitted, baseline, { ...baseline, ...submitted }), {
  confirmed: ['title', 'startDate', 'status'], unchanged: [], conflicts: [],
}, 'confirmed keys need no resend');
assert.deepEqual(classifyTaskDetailsReadback(submitted, baseline, null), {
  confirmed: [], unchanged: [], conflicts: ['title', 'startDate', 'status'],
}, 'missing provider task never permits resending');
assert.deepEqual(classifyTaskDetailsReadback({ tagIds: ['b', 'a'] }, baseline, { ...baseline, tagIds: ['a', 'b'] }), {
  confirmed: ['tagIds'], unchanged: [], conflicts: [],
}, 'readback uses tag membership rather than incidental order');
assert.deepEqual(classifyTaskDetailsReadback({ assigneeIds: ['b', 'a'] }, { ...baseline, assigneeIds: ['a', 'b'] }, { ...baseline, assigneeIds: ['a', 'b'] }), {
  confirmed: [], unchanged: ['assigneeIds'], conflicts: [],
}, 'primary assignee order matters because the first entry is mirrored as assigneeId');
assert.deepEqual(taskDetailsDraftConflicts({ title: 'Draft' }, baseline, { ...baseline, title: 'Other' }), ['title']);
assert.deepEqual(taskDetailsDraftConflicts({ title: 'Draft' }, baseline, { ...baseline, title: 'Draft' }), []);

assert.equal(isTaskDetailsDateDraftValid({ startDate: '2026-11-15' }, baseline), true);
assert.equal(isTaskDetailsDateDraftValid({ startDate: '2026-11-15' }, { ...baseline, endDate: '2026-11-12' }), false,
  'an untouched end date moving earlier invalidates the staged start date');
assert.equal(isTaskDetailsDateDraftValid({ endDate: '2026-11-15' }, { ...baseline, startDate: '2026-11-18' }), false,
  'an untouched start date moving later invalidates the staged end date');
assert.equal(isTaskDetailsDateDraftValid({ startDate: '2026-11-15', endDate: '2026-11-15' }, baseline), true);
assert.equal(isTaskDetailsDateDraftValid({ isDurationLocked: true }, { ...baseline, startDate: '' }), false);
assert.equal(isTaskDetailsDateDraftValid({ startDate: '', isDurationLocked: false }, baseline), true);
assert.equal(isTaskDetailsDateDraftValid({ startDate: 'invalid' }, baseline), false);
assert.equal(isTaskDetailsDateDraftValid({ title: 'Draft' }, { ...baseline, startDate: 'invalid' }), true,
  'an unrelated edit does not impose a new date cleanup requirement');

console.log('Task details draft verification passed: 16 assertions.');
