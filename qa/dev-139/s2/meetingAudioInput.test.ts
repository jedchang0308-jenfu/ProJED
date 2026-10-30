import assert from 'node:assert/strict';
import test from 'node:test';

import { KernelError } from '../../../server/errors.js';
import {
  buildMeetingAudioObjectKey,
  normalizeMeetingAudioReservation,
} from '../../../server/meetingAudioInput.js';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const RECORD_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CAPTURE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function expectError(action: () => unknown, code: string, status: number): void {
  assert.throws(action, (error: unknown) => (
    error instanceof KernelError && error.code === code && error.httpStatus === status
  ));
}

function reservation(overrides: Record<string, unknown> = {}) {
  return normalizeMeetingAudioReservation(CAPTURE_ID, 7, { segmentIndex: 2, ...overrides });
}

test('reservation preserves legacy defaults and derives an end offset for an empty segment', () => {
  assert.deepEqual(reservation(), {
    captureId: CAPTURE_ID,
    sourceVersion: 7,
    segmentIndex: 2,
    epoch: 0,
    startOffsetMs: 0,
    endOffsetMs: 1,
    overlapMs: 0,
    gapBeforeMs: 0,
    mime: 'audio/webm',
    bytes: 0,
    reservationKey: `${CAPTURE_ID}:v7:segment:2`,
  });
});

test('reservation accepts legacy snake offset aliases and retains MIME base type and exact reservation key', () => {
  const result = reservation({
    epoch: '3',
    bytes: '1024',
    start_offset_ms: '125',
    end_offset_ms: '0',
    overlap_ms: 50,
    gap_before_ms: '10',
    mime: 'Audio/MP4; codecs=mp4a.40.2',
    reservationKey: '  caller-key-with-spaces  ',
    operation: 'reserve-segment',
    captureId: CAPTURE_ID.toUpperCase(),
    expectedSourceVersion: 7,
  });
  assert.deepEqual(result, {
    captureId: CAPTURE_ID,
    sourceVersion: 7,
    segmentIndex: 2,
    epoch: 3,
    startOffsetMs: 125,
    endOffsetMs: 126,
    overlapMs: 50,
    gapBeforeMs: 10,
    mime: 'audio/mp4',
    bytes: 1024,
    reservationKey: '  caller-key-with-spaces  ',
  });
});

test('reservation bounds allow segment endpoints, int32 source versions, and maximum audio bytes', () => {
  assert.equal(reservation({ segmentIndex: 0 }).segmentIndex, 0);
  assert.equal(normalizeMeetingAudioReservation(CAPTURE_ID, 2_147_483_647, {
    segmentIndex: 4095,
    bytes: 10 * 1024 * 1024,
    startOffsetMs: 10,
    endOffsetMs: 11,
  }).sourceVersion, 2_147_483_647);
});

test('reservation rejects unsafe, fractional, null, blank, boolean, and out-of-range integer inputs', () => {
  const invalidBodies: Array<Record<string, unknown>> = [
    { segmentIndex: true },
    { segmentIndex: null },
    { segmentIndex: '' },
    { segmentIndex: ' ' },
    { segmentIndex: 1.5 },
    { segmentIndex: Number.MAX_SAFE_INTEGER + 1 },
    { epoch: null },
    { bytes: null },
    { bytes: 10 * 1024 * 1024 + 1 },
    { startOffsetMs: null },
    { endOffsetMs: null },
    { overlapMs: true },
    { overlapMs: 501 },
    { gapBeforeMs: '' },
    { gapBeforeMs: Number.POSITIVE_INFINITY },
  ];
  for (const body of invalidBodies) {
    expectError(() => reservation(body), 'DOMAIN_DATA_INVALID', 400);
  }
  expectError(() => normalizeMeetingAudioReservation(CAPTURE_ID, 0, { segmentIndex: 0 }), 'DOMAIN_DATA_INVALID', 400);
  expectError(() => normalizeMeetingAudioReservation(CAPTURE_ID, 2_147_483_648, { segmentIndex: 0 }), 'DOMAIN_DATA_INVALID', 400);
  expectError(() => normalizeMeetingAudioReservation(CAPTURE_ID, 1.5, { segmentIndex: 0 }), 'DOMAIN_DATA_INVALID', 400);
  expectError(() => reservation({ startOffsetMs: Number.MAX_SAFE_INTEGER }), 'DOMAIN_DATA_INVALID', 400);
  expectError(() => reservation({ startOffsetMs: 10, endOffsetMs: 10 }), 'DOMAIN_DATA_INVALID', 400);
  expectError(() => reservation({ segmentIndex: 4096 }), 'DOMAIN_DATA_INVALID', 400);
});

test('reservation rejects stale source scope, capture mismatch, unknown fields, and invalid MIME or keys', () => {
  expectError(() => reservation({ expectedSourceVersion: 6 }), 'REVISION_CONFLICT', 409);
  expectError(() => reservation({ captureId: TENANT_ID }), 'DOMAIN_DATA_INVALID', 400);
  expectError(() => reservation({ uploadPath: 'tenant/project/record/file.webm' }), 'DOMAIN_DATA_INVALID', 400);
  expectError(() => reservation({ mime: 'application/octet-stream' }), 'DOMAIN_DATA_INVALID', 400);
  expectError(() => reservation({ reservationKey: null }), 'DOMAIN_DATA_INVALID', 400);
  expectError(() => reservation({ reservationKey: '' }), 'DOMAIN_DATA_INVALID', 400);
  expectError(() => reservation({ reservationKey: 'x'.repeat(181) }), 'DOMAIN_DATA_INVALID', 400);
  expectError(() => reservation({ reservationKey: 'bad\nkey' }), 'DOMAIN_DATA_INVALID', 400);
});

test('canonical object key is built only from UUID scope, source version, segment index, and MIME extension', () => {
  assert.equal(buildMeetingAudioObjectKey({
    tenantId: TENANT_ID.toUpperCase(),
    projectId: PROJECT_ID.toUpperCase(),
    recordId: RECORD_ID.toUpperCase(),
    captureId: CAPTURE_ID.toUpperCase(),
    sourceVersion: 7,
    segmentIndex: 12,
    mime: 'audio/mpeg; bitrate=128k',
  }), `${TENANT_ID}/${PROJECT_ID}/${RECORD_ID}/${CAPTURE_ID}/v7/12.mp3`);
  assert.equal(buildMeetingAudioObjectKey({
    tenantId: TENANT_ID,
    projectId: PROJECT_ID,
    recordId: RECORD_ID,
    captureId: CAPTURE_ID,
    sourceVersion: 1,
    segmentIndex: 0,
    mime: 'audio/ogg',
  }), `${TENANT_ID}/${PROJECT_ID}/${RECORD_ID}/${CAPTURE_ID}/v1/0.ogg`);
  expectError(() => buildMeetingAudioObjectKey({
    tenantId: '../tenant',
    projectId: PROJECT_ID,
    recordId: RECORD_ID,
    captureId: CAPTURE_ID,
    sourceVersion: 1,
    segmentIndex: 0,
    mime: 'audio/webm',
  }), 'DOMAIN_DATA_INVALID', 400);
  expectError(() => buildMeetingAudioObjectKey({
    tenantId: TENANT_ID,
    projectId: PROJECT_ID,
    recordId: RECORD_ID,
    captureId: CAPTURE_ID,
    sourceVersion: 1,
    segmentIndex: 4096,
    mime: 'audio/webm',
  }), 'DOMAIN_DATA_INVALID', 400);
});
