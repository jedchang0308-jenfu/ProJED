import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {
  buildMeetingLiveContentValue,
  formatMeetingLiveAggregateLine,
  getMeetingLiveFieldChanges,
  isMeetingLiveAggregateNoop,
  normalizeMeetingLiveText,
  sha256Text,
} from '../src/utils/meetingLiveTaskChanges';
import type { MeetingLiveFieldAggregate, TaskNode } from '../src/types';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

const fixture = (overrides: Partial<TaskNode> = {}): TaskNode => ({
  id: 'task-a',
  workspaceId: 'workspace-a',
  boardId: 'board-a',
  parentId: null,
  title: 'API 權限',
  description: '確認範圍',
  status: 'todo',
  order: 1,
  ...overrides,
});

const run = async () => {
  assert.equal(normalizeMeetingLiveText('  A\r\n\u00a0B\n\n\nC  '), 'A\n B\n\nC');
  assert.equal(await sha256Text('abc'), 'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');

  const before = fixture();
  const after = fixture({ title: 'API 權限整理', description: '補上權限矩陣', parentId: 'parent-b', order: 8 });
  const changes = getMeetingLiveFieldChanges(before, after, ['title', 'description', 'parentId', 'order']);
  assert.deepEqual(changes.map(change => change.fieldKey), ['title', 'description']);
  assert.deepEqual(getMeetingLiveFieldChanges(before, fixture({ parentId: 'parent-b', order: 8 }), ['parentId', 'order']), []);

  const aToB = await buildMeetingLiveContentValue('A', 'B');
  const aToC = await buildMeetingLiveContentValue('A', 'C');
  const aToA = await buildMeetingLiveContentValue('A', 'A');
  assert.equal(aToB.baselineHash, aToC.baselineHash);
  assert.notEqual(aToB.latestHash, aToC.latestHash);
  assert.equal(aToA.baselineHash, aToA.latestHash);

  const long = await buildMeetingLiveContentValue('', 'x'.repeat(240));
  assert.equal(long.addedFragments.length, 1);
  assert.equal(long.addedFragments[0].truncated, true);
  assert.equal(long.addedFragments[0].originalLength, 240);

  const aggregate: MeetingLiveFieldAggregate = {
    key: 'segment-a:task-a:title',
    segmentId: 'segment-a',
    nodeId: 'task-a',
    fieldKey: 'title',
    taskTitle: 'API 權限整理',
    value: { kind: 'scalar', baseline: 'API 權限', latest: 'API 權限整理' },
    firstConfirmedAt: 1,
    lastConfirmedAt: 2,
    lastCommitSequence: 1,
    appliedMutationIds: ['mutation-a'],
    projection: null,
  };
  assert.match(formatMeetingLiveAggregateLine(aggregate), /會中變更/);
  assert.match(formatMeetingLiveAggregateLine(aggregate), /API 權限整理/);
  assert.equal(isMeetingLiveAggregateNoop({ ...aggregate, value: { kind: 'scalar', baseline: 'A', latest: 'A' } }), true);

  console.log(JSON.stringify({
    status: 'PASS',
    cases: ['normalization', 'sha256', 'allowlist', 'placement-zero-capture', 'baseline-latest', 'net-noop', 'fragment-bound'],
  }, null, 2));
};

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
