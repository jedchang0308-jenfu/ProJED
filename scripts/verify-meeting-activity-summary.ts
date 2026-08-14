import { summarizeTaskActivity } from '../src/utils/meetingActivitySummary';

const assertEqual = (label: string, actual: string, expected: string) => {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
};

const memberNameById = new Map([
  ['member-old', '王小明'],
  ['member-new', '李小華'],
]);
const tagNameById = new Map([
  ['tag-old', '一般'],
  ['tag-new', '高優先'],
]);

assertEqual(
  'assignee replacement uses before and after names',
  summarizeTaskActivity('task_assigned', {
    before: { assigneeIds: ['member-old'] },
    after: { assigneeIds: ['member-new'] },
  }, { memberNameById }),
  '負責人由「王小明」改為「李小華」。',
);

assertEqual(
  'assignee replacement preserves historical name snapshots',
  summarizeTaskActivity('task_assigned', {
    before: { assigneeIds: ['member-old'], assigneeNames: ['王小明'] },
    after: { assigneeIds: ['member-new'], assigneeNames: ['李小華'] },
  }),
  '負責人由「王小明」改為「李小華」。',
);

assertEqual(
  'clearing assignee states the target',
  summarizeTaskActivity('task_assigned', {
    before: { assigneeIds: ['member-old'], assigneeNames: ['王小明'] },
    after: { assigneeIds: [], assigneeNames: [] },
  }),
  '負責人由「王小明」改為「未指派」。',
);

assertEqual(
  'collaborator replacement uses before and after names',
  summarizeTaskActivity('task_collaborators_changed', {
    before: { collaboratorIds: ['member-old'] },
    after: { collaboratorIds: ['member-new'] },
  }, { memberNameById }),
  '協作者由「王小明」改為「李小華」。',
);

assertEqual(
  'tag replacement uses before and after names',
  summarizeTaskActivity('task_tags_changed', {
    before: { tagIds: ['tag-old'] },
    after: { tagIds: ['tag-new'] },
  }, { tagNameById }),
  '標籤由「一般」改為「高優先」。',
);

assertEqual(
  'status summary keeps existing before and after behavior',
  summarizeTaskActivity('task_status_changed', {
    before: { status: 'todo' },
    after: { status: 'in_progress' },
  }),
  '狀態由「待辦」改為「進行中」。',
);

console.log('Meeting activity summary verification passed: assignee, collaborator, tag, and status transitions checked.');
