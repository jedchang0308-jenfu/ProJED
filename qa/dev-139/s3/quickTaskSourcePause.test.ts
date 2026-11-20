import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyQuickSyncError, isQuickCaptureWritePaused, isQuickSourceWritePaused, QUICK_SOURCE_WRITE_PAUSED } from '../../../src/features/quickTaskCapture/model';

test('the exact source write fence keeps a Quick draft out of automatic retries', () => {
  const error = Object.assign(new Error('PROJED_SOURCE_WRITE_PAUSED'), { code: 'PT503', status: 503 });
  assert.equal(classifyQuickSyncError(error), 'failed_permanent');
});

test('an ordinary 503 or a different database error remains an unknown outcome', () => {
  for (const error of [
    Object.assign(new Error('Service unavailable'), { code: 'PT503', status: 503 }),
    Object.assign(new Error(QUICK_SOURCE_WRITE_PAUSED), { code: '503', status: 503 }),
    Object.assign(new Error(QUICK_SOURCE_WRITE_PAUSED), { code: 'P0001', status: 503 }),
    { code: 'PT503', message: `${QUICK_SOURCE_WRITE_PAUSED} extra`, status: 503 },
    { status: 503 },
  ]) {
    assert.equal(isQuickSourceWritePaused(error), false);
    assert.equal(classifyQuickSyncError(error), 'failed_retryable');
  }
});

test('raw PostgREST errors and durable pause records use the precise marker', () => {
  assert.equal(isQuickSourceWritePaused({ code: 'PT503', message: QUICK_SOURCE_WRITE_PAUSED }), true);
  assert.equal(isQuickCaptureWritePaused({ state: 'failed_permanent', lastErrorCode: QUICK_SOURCE_WRITE_PAUSED }), true);
  assert.equal(isQuickCaptureWritePaused({ state: 'failed_retryable', lastErrorCode: QUICK_SOURCE_WRITE_PAUSED }), false);
  assert.equal(isQuickCaptureWritePaused({ state: 'failed_permanent', lastErrorCode: 'PT503' }), false);
  assert.equal(classifyQuickSyncError(Object.assign(new Error('denied'), { code: '42501', status: 403 })), 'failed_permanent');
});
