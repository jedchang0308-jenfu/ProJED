import assert from 'node:assert/strict';
import test from 'node:test';

import type { QuickAuthSnapshot } from '../../../src/features/quickTaskCapture/contract';
import type { QuickAuthContext } from '../../../src/features/quickTaskCapture/model';
import { isQuickSyncAllowed } from '../../../src/features/quickTaskCapture/sync';

const auth: QuickAuthSnapshot = {
  accountId: 'local-user-a',
  accessToken: 'http:context-a',
  authEpoch: 3,
  contextRevision: 7,
  contextProjectRef: 'http:https://projed.invalid',
};
const context: QuickAuthContext = {
  key: 'current',
  projectRef: auth.contextProjectRef!,
  accountId: auth.accountId,
  displayLabel: null,
  verifiedAt: 1,
  bindingAllowed: true,
  revision: auth.contextRevision!,
  barrierAt: null,
  sessionId: auth.accessToken,
};

test('quick sync guard accepts the selected HTTP auth snapshot and matching binding', () => {
  assert.equal(isQuickSyncAllowed(auth, auth, context), true);
});

test('quick sync guard rejects another auth module cache, account or context revision', () => {
  assert.equal(isQuickSyncAllowed(null, auth, context), false);
  assert.equal(isQuickSyncAllowed({ ...auth, accountId: 'other' }, auth, context), false);
  assert.equal(isQuickSyncAllowed(auth, auth, { ...context, revision: context.revision + 1 }), false);
});
