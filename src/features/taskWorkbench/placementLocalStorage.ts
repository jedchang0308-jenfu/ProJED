import type { TaskNode } from '../../types';
import { normalizeTaskWorkbenchUnplacedTask } from './placementModel';

export const TASK_WORKBENCH_UNPLACED_STORAGE_KEY = 'projed-task-workbench-unplaced-tasks:v1';
export const TASK_WORKBENCH_UNPLACED_ACCOUNT_STORAGE_KEY = `${TASK_WORKBENCH_UNPLACED_STORAGE_KEY}:account`;

const taskTimestamp = (task: TaskNode) => task.updatedAt ?? task.createdAt ?? 0;

export const indexLatestTaskWorkbenchTasks = (...taskGroups: readonly TaskNode[][]): Map<string, TaskNode> => {
  const latest = new Map<string, TaskNode>();
  taskGroups.flat().forEach((task) => {
    const existing = latest.get(task.id);
    if (!existing || taskTimestamp(task) > taskTimestamp(existing)) latest.set(task.id, task);
  });
  return latest;
};

const parseStoredTasks = (stored: string | null): TaskNode[] => {
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is TaskNode => Boolean(item?.id && item?.workspaceId))
      .map(item => normalizeTaskWorkbenchUnplacedTask(item));
  } catch {
    return [];
  }
};

const getAccountStorageKey = (accountId: string | null | undefined) => (
  accountId ? `${TASK_WORKBENCH_UNPLACED_ACCOUNT_STORAGE_KEY}:${encodeURIComponent(accountId)}` : null
);

export const readTaskWorkbenchUnplacedTasks = (accountId?: string | null): TaskNode[] => {
  if (typeof window === 'undefined') return [];
  const accountKey = getAccountStorageKey(accountId);
  return parseStoredTasks(window.localStorage.getItem(accountKey ?? TASK_WORKBENCH_UNPLACED_STORAGE_KEY));
};

export const readUnboundTaskWorkbenchUnplacedTasks = (): TaskNode[] => (
  readTaskWorkbenchUnplacedTasks(null)
);

export const writeTaskWorkbenchUnplacedTasks = (tasks: TaskNode[], accountId?: string | null) => {
  if (typeof window === 'undefined') return;
  const normalized = tasks
    .filter(task => !task.isArchived)
    .map(task => normalizeTaskWorkbenchUnplacedTask(task))
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
  const storageKey = getAccountStorageKey(accountId) || TASK_WORKBENCH_UNPLACED_STORAGE_KEY;
  window.localStorage.setItem(storageKey, JSON.stringify(normalized));
};

export const clearTaskWorkbenchUnplacedLocalCaches = (accountId?: string | null) => {
  if (typeof window === 'undefined') return;
  const accountKey = getAccountStorageKey(accountId);
  window.localStorage.removeItem(accountKey ?? TASK_WORKBENCH_UNPLACED_STORAGE_KEY);
};

export const upsertTaskWorkbenchUnplacedTask = (task: TaskNode, accountId?: string | null) => {
  const normalized = {
    ...normalizeTaskWorkbenchUnplacedTask(task),
    updatedAt: Date.now(),
  };
  const current = readTaskWorkbenchUnplacedTasks(accountId);
  writeTaskWorkbenchUnplacedTasks([
    ...current.filter(item => item.id !== normalized.id),
    normalized,
  ], accountId);
};

export const removeTaskWorkbenchUnplacedTask = (taskId: string, accountId?: string | null) => {
  writeTaskWorkbenchUnplacedTasks(
    readTaskWorkbenchUnplacedTasks(accountId).filter(task => task.id !== taskId),
    accountId,
  );
};
