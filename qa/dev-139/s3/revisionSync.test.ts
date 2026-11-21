import assert from 'node:assert/strict';
import test from 'node:test';

import { createRevisionSnapshot, decideRevisionRefresh } from '../../../src/services/httpApi/revisionSync.js';

test('first revision read loads workspace index and active scope', () => {
  const next = createRevisionSnapshot([
    { workspaceId: 'ws-1', revision: '1', updatedAt: 1 },
    { workspaceId: 'ws-1', boardId: 'board-1', revision: '1', updatedAt: 1 },
  ]);
  assert.deepEqual(decideRevisionRefresh(null, next, 'ws-1', 'board-1'), {
    changed: true, refreshWorkspaces: true, refreshActiveScope: true,
  });
});

test('unchanged revisions avoid canonical body reloads', () => {
  const previous = createRevisionSnapshot([{ workspaceId: 'ws-1', revision: '1', updatedAt: 1 }]);
  const next = createRevisionSnapshot([{ workspaceId: 'ws-1', revision: '1', updatedAt: 2 }]);
  assert.deepEqual(decideRevisionRefresh(previous, next, 'ws-1', null), {
    changed: false, refreshWorkspaces: false, refreshActiveScope: false,
  });
});

test('active board revision and revoked visibility refresh the active scope', () => {
  const previous = createRevisionSnapshot([
    { workspaceId: 'ws-1', revision: '1', updatedAt: 1 },
    { workspaceId: 'ws-1', boardId: 'board-1', revision: '1', updatedAt: 1 },
  ]);
  const changed = createRevisionSnapshot([
    { workspaceId: 'ws-1', revision: '1', updatedAt: 1 },
    { workspaceId: 'ws-1', boardId: 'board-1', revision: '2', updatedAt: 2 },
  ]);
  assert.equal(decideRevisionRefresh(previous, changed, 'ws-1', 'board-1').refreshActiveScope, true);

  const revoked = createRevisionSnapshot([{ workspaceId: 'ws-1', revision: '1', updatedAt: 1 }]);
  assert.deepEqual(decideRevisionRefresh(changed, revoked, 'ws-1', 'board-1'), {
    changed: true, refreshWorkspaces: true, refreshActiveScope: true,
  });
});

test('inactive board changes update navigation without reloading active board data', () => {
  const previous = createRevisionSnapshot([
    { workspaceId: 'ws-1', boardId: 'board-1', revision: '1', updatedAt: 1 },
    { workspaceId: 'ws-1', boardId: 'board-2', revision: '1', updatedAt: 1 },
  ]);
  const next = createRevisionSnapshot([
    { workspaceId: 'ws-1', boardId: 'board-1', revision: '1', updatedAt: 1 },
    { workspaceId: 'ws-1', boardId: 'board-2', revision: '2', updatedAt: 2 },
  ]);
  assert.deepEqual(decideRevisionRefresh(previous, next, 'ws-1', 'board-1'), {
    changed: true, refreshWorkspaces: true, refreshActiveScope: false,
  });
});
