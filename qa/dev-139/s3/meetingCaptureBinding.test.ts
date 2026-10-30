import assert from 'node:assert/strict';
import test from 'node:test';

import {
  meetingAudioOutboxScopesEqual,
  meetingAudioSegmentOutboxKey,
  meetingPointerBatchOutboxKey,
  normalizeMeetingAudioOutboxScope,
} from '../../../src/features/meetingTaskResolution/meetingCaptureBinding';

const scope = (overrides: Partial<{
  accountId: string;
  tenantId: string;
  projectId: string;
  recordId: string;
  captureId: string;
  sourceVersion: number;
}> = {}) => ({
  accountId: 'account-a',
  tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  projectId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  recordId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  captureId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  sourceVersion: 7,
  ...overrides,
});

test('capture binding freezes a validated exact owner, record, capture, and source version', () => {
  const input = scope();
  const binding = normalizeMeetingAudioOutboxScope(input);

  assert.notEqual(binding, input);
  assert.equal(Object.isFrozen(binding), true);
  assert.equal(meetingAudioOutboxScopesEqual(binding, input), true);
  assert.equal(meetingAudioOutboxScopesEqual(binding, scope({ accountId: 'account-b' })), false);
  assert.equal(meetingAudioOutboxScopesEqual(binding, scope({ recordId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' })), false);
  assert.equal(meetingAudioOutboxScopesEqual(binding, scope({ sourceVersion: 8 })), false);
});

test('audio and pointer keys include every scope component and keep legacy keyspace separate', () => {
  const base = normalizeMeetingAudioOutboxScope(scope());
  const segmentKey = meetingAudioSegmentOutboxKey(base, 'segment:1');
  const pointerKey = meetingPointerBatchOutboxKey(base, 'capture:pointer:3');

  assert.match(segmentKey, /^meeting-audio-v2:/u);
  assert.match(pointerKey, /^meeting-audio-v2:/u);
  assert.match(segmentKey, /:v7:segment:/u);
  assert.match(pointerKey, /:v7:pointer:/u);
  assert.notEqual(meetingAudioSegmentOutboxKey(normalizeMeetingAudioOutboxScope(scope({ accountId: 'account-b' })), 'segment:1'), segmentKey);
  assert.notEqual(meetingAudioSegmentOutboxKey(normalizeMeetingAudioOutboxScope(scope({ sourceVersion: 8 })), 'segment:1'), segmentKey);
  assert.notEqual(meetingAudioSegmentOutboxKey(base, 'segment/1'), segmentKey);
  assert.equal(segmentKey.startsWith('capture:'), false);
});

test('capture binding rejects missing, malformed, unsafe, or out-of-range provenance', () => {
  const invalid = [
    scope({ accountId: ' ' }),
    scope({ accountId: 'account\nother' }),
    scope({ captureId: 'not-a-uuid' }),
    scope({ sourceVersion: 0 }),
    scope({ sourceVersion: 2_147_483_648 }),
    scope({ sourceVersion: Number.MAX_SAFE_INTEGER + 1 }),
  ];
  for (const value of invalid) {
    assert.throws(() => normalizeMeetingAudioOutboxScope(value));
  }
  assert.throws(() => meetingAudioSegmentOutboxKey(normalizeMeetingAudioOutboxScope(scope()), 'bad\u0000id'));
});
