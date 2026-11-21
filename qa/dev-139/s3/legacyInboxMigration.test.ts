import assert from 'node:assert/strict';
import test from 'node:test';

import type { InboxItem } from '../../../src/types';
import { selectOwnedLegacyInboxItems } from '../../../src/features/taskWorkbench/legacyInboxMigration';

const ACCOUNT_A = 'account-a';
const ACCOUNT_B = 'account-b';

const item = (
  id: string,
  createdBy: string | null | undefined,
  captureStatus: InboxItem['captureStatus'] = 'untriaged',
  promotedTaskNodeId: string | null = null,
): InboxItem => ({
  id,
  title: id,
  note: id,
  itemType: 'todo',
  captureStatus,
  syncStatus: 'pending',
  ...(createdBy === undefined ? {} : { createdBy }),
  createdAt: 1,
  updatedAt: 1,
  promotedTaskNodeId,
});

test('legacy Inbox migration selects exact-owner untriaged items and leaves unknown data untouched across account switches', () => {
  const items = [
    item('owned-a', ACCOUNT_A),
    item('owned-b', ACCOUNT_B),
    item('unbound', null),
    item('missing-owner', undefined),
    item('completed', ACCOUNT_A, 'completed'),
    item('archived', ACCOUNT_A, 'archived'),
    item('already-promoted', ACCOUNT_A, 'untriaged', 'task_workbench_unplaced_old'),
  ];
  const original = JSON.parse(JSON.stringify(items)) as InboxItem[];

  assert.deepEqual(selectOwnedLegacyInboxItems(items, ACCOUNT_A).map(value => value.id), ['owned-a']);
  assert.deepEqual(items, original);

  assert.deepEqual(selectOwnedLegacyInboxItems(items, ACCOUNT_B).map(value => value.id), ['owned-b']);
  assert.deepEqual(items, original);

  assert.deepEqual(selectOwnedLegacyInboxItems(items, null), []);
  assert.deepEqual(items, original);
});
