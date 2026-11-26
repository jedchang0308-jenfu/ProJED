import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldStartFreshLogin } from '../../../src/services/httpApi/loginRecovery.js';

test('stale or missing sessions start a fresh login', () => {
  assert.equal(shouldStartFreshLogin(401, 'IDENTITY_INVALID'), true);
  assert.equal(shouldStartFreshLogin(404, 'ENDPOINT_UNAVAILABLE'), true);
});

test('identity mapping conflict starts a fresh login instead of repeating the rejected session', () => {
  assert.equal(shouldStartFreshLogin(409, 'IDENTITY_MAPPING_CONFLICT'), true);
});

test('unrelated conflicts and disabled accounts remain visible refusals', () => {
  assert.equal(shouldStartFreshLogin(409, 'ACTOR_CHANGED'), false);
  assert.equal(shouldStartFreshLogin(403, 'ACCESS_DENIED'), false);
  assert.equal(shouldStartFreshLogin(500, 'INTERNAL_ERROR'), false);
});
