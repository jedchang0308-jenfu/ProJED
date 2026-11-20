import assert from 'node:assert/strict';
import test from 'node:test';
import type { Board } from '../../../src/types';
import { reconcileCreatedBoard } from '../../../src/store/reconcileCreatedBoard';

test('board creation resolves its placeholder even when a workspace refresh races the acknowledgement', () => {
  const created: Board = { id: 'board-id', title: 'New board', dependencies: [] };
  const pending = { ...created, id: 'b_pending' };
  const other = { ...created, id: 'other' };
  const listed: Board = { ...created, title: 'Renamed after creation', sessionCapabilities: ['manage_board_members'] };
  assert.deepEqual(reconcileCreatedBoard([pending, other], pending.id, created), [created, other]);
  assert.deepEqual(reconcileCreatedBoard([other], pending.id, created), [other, created]);
  assert.deepEqual(reconcileCreatedBoard([other, listed], pending.id, created), [other, listed]);
  assert.deepEqual(reconcileCreatedBoard([pending, other, listed], pending.id, created), [other, listed]);
});
