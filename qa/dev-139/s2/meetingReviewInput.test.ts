import assert from 'node:assert/strict';
import test from 'node:test';

import { KernelError } from '../../../server/errors.js';
import {
  normalizeMeetingDecision,
  normalizeMeetingProjection,
  normalizeMeetingReview,
} from '../../../server/meetingReviewInput.js';

const CAPTURE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RECORD_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const RESOLUTION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TENANT_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PROJECT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const UPDATED_AT = '2026-10-29T09:08:07.123456Z';

function expectInvalid(action: () => unknown): void {
  assert.throws(action, (error: unknown) => (
    error instanceof KernelError && error.code === 'DOMAIN_DATA_INVALID' && error.httpStatus === 400
  ));
}

function decision(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    operation: 'decide-match',
    captureId: CAPTURE_ID,
    resolutionId: RESOLUTION_ID,
    expectedSourceVersion: 4,
    expectedResolutionRevision: 0,
    operations: [{ action: 'accept', taskId: 'legacy/task-reference-1' }],
    ...overrides,
  };
}

function projection(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    operation: 'save-projection',
    recordId: RECORD_ID,
    captureId: CAPTURE_ID,
    expectedSourceVersion: 4,
    expectedRecordUpdatedAt: UPDATED_AT,
    expectedReviewRevision: 0,
    requestKey: 'projection-request-1',
    userDraft: {
      title: 'Meeting title',
      content: 'Draft meeting content',
      status: 'draft',
      metadata: { meetingTaskResolution: { reviewRevision: 0, accepted: ['legacy-id'] } },
      oldEditorField: 'ignored',
    },
    taskLinks: [{ nodeId: 'legacy/task-reference-1', role: 'main' }],
    ...overrides,
  };
}

test('review accepts the optional source CAS and rejects unknown or out-of-range fields', () => {
  assert.deepEqual(normalizeMeetingReview({ operation: 'review', captureId: CAPTURE_ID }), {
    operation: 'review', captureId: CAPTURE_ID,
  });
  assert.deepEqual(normalizeMeetingReview({
    operation: 'review', captureId: CAPTURE_ID, expectedSourceVersion: '7',
  }), { operation: 'review', captureId: CAPTURE_ID, expectedSourceVersion: 7 });
  expectInvalid(() => normalizeMeetingReview({ operation: 'review', captureId: CAPTURE_ID, extra: true }));
  expectInvalid(() => normalizeMeetingReview({ operation: 'review', captureId: CAPTURE_ID, expectedSourceVersion: null }));
  expectInvalid(() => normalizeMeetingReview({ operation: 'review', captureId: CAPTURE_ID, expectedSourceVersion: 2_147_483_648 }));
});

test('decision requires safe CAS revisions and keeps multiple operations on the same task in input order', () => {
  const result = normalizeMeetingDecision(decision({
    operations: [
      { action: 'reject', taskId: 'legacy/task-reference-1' },
      { action: 'add', taskId: 'legacy/task-reference-1' },
      { action: 'clear-all' },
      { action: 'replace', taskId: 'task-2' },
    ],
  }));
  assert.equal(result.expectedResolutionRevision, 0);
  assert.deepEqual(result.operations, [
    { action: 'reject', taskId: 'legacy/task-reference-1' },
    { action: 'add', taskId: 'legacy/task-reference-1' },
    { action: 'clear-all' },
    { action: 'replace', taskId: 'task-2' },
  ]);
  assert.equal(normalizeMeetingDecision(decision({ expectedResolutionRevision: Number.MAX_SAFE_INTEGER })).expectedResolutionRevision,
    Number.MAX_SAFE_INTEGER);
});

test('decision rejects missing, null, negative, unsafe, or oversized revisions and malformed operations', () => {
  for (const revision of [undefined, null, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, '1']) {
    expectInvalid(() => normalizeMeetingDecision(decision({ expectedResolutionRevision: revision })));
  }
  expectInvalid(() => normalizeMeetingDecision(decision({ expectedSourceVersion: 0 })));
  expectInvalid(() => normalizeMeetingDecision(decision({ operations: [] })));
  expectInvalid(() => normalizeMeetingDecision(decision({
    operations: Array.from({ length: 101 }, () => ({ action: 'clear-all' })),
  })));
  expectInvalid(() => normalizeMeetingDecision(decision({ operations: [{ action: 'clear-all', taskId: 'not-allowed' }] })));
  expectInvalid(() => normalizeMeetingDecision(decision({ operations: [{ action: 'accept', taskId: 'task', extra: true }] })));
  expectInvalid(() => normalizeMeetingDecision(decision({ operations: [{ action: 'unknown' }] })));
});

test('projection preserves microsecond CAS text, metadata, whitespace, legacy refs, and link ordering', () => {
  const sourceMetadata = { meetingTaskResolution: { reviewRevision: 3, autoLinkSet: ['a', 'b'] } };
  const result = normalizeMeetingProjection(projection({
    tenantId: TENANT_ID,
    projectId: PROJECT_ID,
    userDraft: {
      title: '  exact title  ',
      content: '  first line\nsecond line  ',
      status: 'draft',
      metadata: sourceMetadata,
      legacyRecordType: 'ignored',
      legacyOccurredAt: 123,
    },
    taskLinks: [
      { nodeId: 'legacy/task-reference-1', role: 'main' },
      { itemId: 'legacy/task-reference-1', role: 'main' },
      { itemId: 'legacy/task-reference-1', role: 'related' },
      { nodeId: 'legacy/task-reference-2' },
    ],
  }));

  assert.equal(result.expectedRecordUpdatedAt, UPDATED_AT);
  assert.equal(result.userDraft.title, '  exact title  ');
  assert.equal(result.userDraft.content, '  first line\nsecond line  ');
  assert.deepEqual(result.userDraft.metadata, sourceMetadata);
  assert.notEqual(result.userDraft.metadata, sourceMetadata);
  assert.deepEqual(result.taskLinks, [
    { nodeId: 'legacy/task-reference-1', role: 'main' },
    { nodeId: 'legacy/task-reference-1', role: 'related' },
    { nodeId: 'legacy/task-reference-2', role: 'related' },
  ]);
  assert.equal(result.tenantId, TENANT_ID);
  assert.equal(result.projectId, PROJECT_ID);
});

test('projection validates real UTC timestamps and preserves accepted precision without reserialization', () => {
  const timestamps = [
    '2024-02-29T23:59:59Z',
    '2024-02-29T23:59:59.1Z',
    '2024-02-29T23:59:59.123456Z',
  ];
  for (const expectedRecordUpdatedAt of timestamps) {
    assert.equal(normalizeMeetingProjection(projection({ expectedRecordUpdatedAt })).expectedRecordUpdatedAt,
      expectedRecordUpdatedAt);
  }
  for (const expectedRecordUpdatedAt of [
    '2025-02-29T00:00:00Z',
    '2024-13-01T00:00:00Z',
    '2024-02-29T24:00:00Z',
    '2024-02-29T00:00:00+00:00',
    '2024-02-29T00:00:00.1234567Z',
    '2024-02-29T00:00:00.Z',
  ]) {
    expectInvalid(() => normalizeMeetingProjection(projection({ expectedRecordUpdatedAt })));
  }
});

test('projection requires CAS, validates hints and bounded request fields, and rejects unknown top-level data', () => {
  for (const expectedReviewRevision of [undefined, null, -1, Number.MAX_SAFE_INTEGER + 1]) {
    expectInvalid(() => normalizeMeetingProjection(projection({ expectedReviewRevision })));
  }
  expectInvalid(() => normalizeMeetingProjection(projection({ expectedSourceVersion: 2_147_483_648 })));
  expectInvalid(() => normalizeMeetingProjection(projection({ tenantId: 'not-a-uuid' })));
  expectInvalid(() => normalizeMeetingProjection(projection({ requestKey: '  ' })));
  expectInvalid(() => normalizeMeetingProjection(projection({ requestKey: 'x'.repeat(257) })));
  expectInvalid(() => normalizeMeetingProjection(projection({ unexpectedActorId: RECORD_ID })));
  expectInvalid(() => normalizeMeetingProjection(projection({ userDraft: { title: '', content: '', status: 'draft' } })));
  expectInvalid(() => normalizeMeetingProjection(projection({ taskLinks: [{ nodeId: 'a', role: 'main', actorId: RECORD_ID }] })));
  expectInvalid(() => normalizeMeetingProjection(projection({ taskLinks: [{ nodeId: 'a', itemId: 'b', role: 'main' }] })));
  expectInvalid(() => normalizeMeetingProjection(projection({ taskLinks: Array.from({ length: 501 }, () => ({ nodeId: 'a', role: 'main' })) })));
});

test('projection metadata follows the recordActivity JSON object and 64 KiB limit', () => {
  const nested = { root: { child: { label: 'kept' } } };
  assert.deepEqual(normalizeMeetingProjection(projection({
    userDraft: { title: '', content: '', status: 'archived', metadata: nested },
    taskLinks: [],
  })).userDraft.metadata, nested);
  expectInvalid(() => normalizeMeetingProjection(projection({
    userDraft: { title: '', content: '', status: 'draft', metadata: { large: 'x'.repeat(64 * 1024) } },
  })));
  expectInvalid(() => normalizeMeetingProjection(projection({
    userDraft: { title: '', content: '', status: 'draft', metadata: [] },
  })));
  expectInvalid(() => normalizeMeetingProjection(projection({
    userDraft: { title: '', content: '', status: 'draft', metadata: { invalid: 1n } },
  })));
});

test('projection preserves empty draft text and enforces title/content code-unit bounds', () => {
  const title = 't'.repeat(500);
  const content = 'c'.repeat(4 * 1024 * 1024);
  const result = normalizeMeetingProjection(projection({
    userDraft: { title, content, status: 'draft', metadata: {} },
    taskLinks: [],
  }));
  assert.equal(result.userDraft.title.length, 500);
  assert.equal(result.userDraft.content.length, 4 * 1024 * 1024);
  assert.equal(normalizeMeetingProjection(projection({
    userDraft: { title: '', content: '', status: 'draft', metadata: {} },
    taskLinks: [],
  })).userDraft.content, '');
  expectInvalid(() => normalizeMeetingProjection(projection({
    userDraft: { title: 't'.repeat(501), content: '', status: 'draft', metadata: {} },
  })));
  expectInvalid(() => normalizeMeetingProjection(projection({
    userDraft: { title: '', content: 'c'.repeat(4 * 1024 * 1024 + 1), status: 'draft', metadata: {} },
  })));
  expectInvalid(() => normalizeMeetingProjection(projection({
    userDraft: { title: '', content: '', status: 'cancelled', metadata: {} },
  })));
});
