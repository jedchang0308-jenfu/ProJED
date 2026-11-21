import assert from 'node:assert/strict';
import test from 'node:test';
import { MeetingRecordingScopeFence, type MeetingRecordingScope } from '../../../src/features/meetingTaskResolution/meetingRecordingScope';

const scope = (): MeetingRecordingScope => ({
  accountId: 'account-a', authContextId: 'session-a', tenantId: 'workspace-a',
  projectId: 'board-a', recordId: 'record-a', captureId: null,
});

test('a scope change permanently invalidates its operation even after returning to the same draft', () => {
  for (const field of ['accountId', 'authContextId', 'tenantId', 'projectId', 'recordId', 'captureId'] as const) {
    const original = scope();
    let current = { ...original };
    const fence = new MeetingRecordingScopeFence(original, () => current);
    assert.equal(fence.isCurrent(), true);
    current = { ...original, [field]: 'different' };
    assert.equal(fence.isCurrent(), false, field);
    assert.equal(fence.signal.aborted, true);
    current = { ...original };
    assert.throws(fence.assertCurrent);
  }
});

test('begin may publish its own capture without accepting an identity change', () => {
  let current = scope();
  const fence = new MeetingRecordingScopeFence(current, () => current);
  fence.publishCapture('capture-a', () => { current = { ...current, captureId: 'capture-a' }; });
  assert.equal(fence.isCurrent(), true);
  assert.throws(() => fence.publishCapture('capture-b', () => {
    current = { ...current, captureId: 'capture-b', accountId: 'account-b' };
  }));
  assert.equal(fence.signal.aborted, true);
});
