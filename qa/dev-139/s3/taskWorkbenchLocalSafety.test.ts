import assert from 'node:assert/strict';
import test from 'node:test';

import type { TaskNode } from '../../../src/types';
import {
  clearTaskWorkbenchUnplacedLocalCaches,
  indexLatestTaskWorkbenchTasks,
  readTaskWorkbenchUnplacedTasks,
  readUnboundTaskWorkbenchUnplacedTasks,
  TASK_WORKBENCH_UNPLACED_ACCOUNT_STORAGE_KEY,
  TASK_WORKBENCH_UNPLACED_STORAGE_KEY,
} from '../../../src/features/taskWorkbench/placementLocalStorage';
import {
  assertMoveTaskSubtreeCommand,
  MAX_TASKS_PER_PLACEMENT,
} from '../../../src/features/taskWorkbench/taskPlacementCommand';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const task = (id: string, parentId: string | null, order: number): TaskNode => ({
  id,
  workspaceId: 'ws-a',
  boardId: '__task_workbench_unplaced__',
  parentId,
  title: id,
  status: 'todo',
  nodeType: 'task',
  order,
  createdAt: 1,
  updatedAt: 1,
});

test('unbound workbench cache is retained and never merged into an account cache implicitly', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: storage },
  });
  try {
    const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const unbound = task('unbound-task', null, 0);
    const owned = task('owned-task', null, 0);
    storage.setItem(TASK_WORKBENCH_UNPLACED_STORAGE_KEY, JSON.stringify([unbound]));
    storage.setItem(
      `${TASK_WORKBENCH_UNPLACED_ACCOUNT_STORAGE_KEY}:${encodeURIComponent(accountId)}`,
      JSON.stringify([owned]),
    );

    assert.deepEqual(readUnboundTaskWorkbenchUnplacedTasks().map(item => item.id), [unbound.id]);
    assert.deepEqual(readTaskWorkbenchUnplacedTasks(accountId).map(item => item.id), [owned.id]);
    clearTaskWorkbenchUnplacedLocalCaches(accountId);
    assert.deepEqual(readUnboundTaskWorkbenchUnplacedTasks().map(item => item.id), [unbound.id]);
    assert.deepEqual(readTaskWorkbenchUnplacedTasks(accountId), []);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('client rejects a subtree larger than the server placement limit before sending it', () => {
  const nodes: Record<string, TaskNode> = {};
  const expectedSubtreeIds: string[] = [];
  for (let index = 0; index <= MAX_TASKS_PER_PLACEMENT; index += 1) {
    const id = `task-${index}`;
    expectedSubtreeIds.push(id);
    nodes[id] = {
      ...task(id, index === 0 ? null : `task-${index - 1}`, index),
      boardId: 'board-a',
    };
  }
  assert.throws(() => assertMoveTaskSubtreeCommand({
    commandVersion: 2,
    operationId: 'placement_v2_too_large',
    rootTaskId: expectedSubtreeIds[0]!,
    expectedSubtreeIds,
    source: { kind: 'board', workspaceId: 'ws-a', boardId: 'board-a' },
    destination: {
      ownership: { kind: 'account_unplaced' },
      parentId: null,
      anchorTaskId: null,
      position: 'append',
    },
    clientPlatform: 'desktop',
  }, nodes), /at most 200 tasks/u);
});

test('cache merge keeps a newer remote task over stale account and unbound copies', () => {
  const remote = { ...task('same-task', null, 0), title: 'remote-v30', updatedAt: 30 };
  const accountLocal = { ...remote, title: 'local-v10', updatedAt: 10 };
  const unbound = { ...remote, title: 'unbound-v20', updatedAt: 20 };
  const merged = indexLatestTaskWorkbenchTasks([remote], [accountLocal], [unbound]);
  assert.equal(merged.get(remote.id)?.title, remote.title);
});
