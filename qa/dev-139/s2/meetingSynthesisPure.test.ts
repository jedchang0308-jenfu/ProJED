import assert from 'node:assert/strict';
import test from 'node:test';

import { serializeTaskMention, TASK_MENTION_PATTERN } from '../../../src/utils/recordTaskMentionSyntax.js';

test('task mention syntax keeps existing title normalization and canonical wire shape', () => {
  assert.equal(serializeTaskMention('task-1', '  New\r\n[Task] (A)  '), '@[New Task A](task:task-1)');
  assert.equal(serializeTaskMention('task-2', '\r\n []()'), '@[Untitled task](task:task-2)');

  TASK_MENTION_PATTERN.lastIndex = 0;
  assert.deepEqual(
    Array.from('@[Task A](task:task-a) / @[Task B](task:task-b)'.matchAll(TASK_MENTION_PATTERN), match => match[2]),
    ['task-a', 'task-b'],
  );
  TASK_MENTION_PATTERN.lastIndex = 0;
});
