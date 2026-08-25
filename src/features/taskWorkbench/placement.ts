import type { InboxItem, TaskNode } from '../../types';
import { isSupabaseBackend } from '../../services/dataBackend';
import { supabaseTaskWorkbenchUnplacedService } from '../../services/supabase/taskWorkbenchUnplacedService';
import {
  normalizeTaskWorkbenchUnplacedTask,
  TASK_WORKBENCH_UNPLACED_BOARD_ID,
} from './placementModel';

export { normalizeTaskWorkbenchUnplacedTask, TASK_WORKBENCH_UNPLACED_BOARD_ID } from './placementModel';
export const TASK_WORKBENCH_UNPLACED_STORAGE_KEY = 'projed-task-workbench-unplaced-tasks:v1';
export const TASK_WORKBENCH_UNPLACED_ACCOUNT_STORAGE_KEY = `${TASK_WORKBENCH_UNPLACED_STORAGE_KEY}:account`;

const UNPLACED_TASK_ID_PREFIX = 'task_workbench_unplaced_';

export const createTaskWorkbenchUnplacedTaskId = (sourceId?: string) =>
  `${UNPLACED_TASK_ID_PREFIX}${sourceId || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`}`;

export const isTaskWorkbenchUnplacedTaskId = (taskId: string | null | undefined) =>
  Boolean(taskId && taskId.startsWith(UNPLACED_TASK_ID_PREFIX));

export const isTaskWorkbenchUnplacedTask = (task: Pick<TaskNode, 'boardId'> | null | undefined) =>
  task?.boardId === TASK_WORKBENCH_UNPLACED_BOARD_ID;

const parseStoredTaskWorkbenchUnplacedTasks = (stored: string | null): TaskNode[] => {
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
  const merged = new Map<string, TaskNode>();
  parseStoredTaskWorkbenchUnplacedTasks(window.localStorage.getItem(TASK_WORKBENCH_UNPLACED_STORAGE_KEY))
    .forEach(task => merged.set(task.id, task));
  const accountKey = getAccountStorageKey(accountId);
  if (accountKey) {
    parseStoredTaskWorkbenchUnplacedTasks(window.localStorage.getItem(accountKey))
      .forEach(task => merged.set(task.id, task));
  }
  return Array.from(merged.values());
};

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
  window.localStorage.removeItem(TASK_WORKBENCH_UNPLACED_STORAGE_KEY);
  const accountKey = getAccountStorageKey(accountId);
  if (accountKey) window.localStorage.removeItem(accountKey);
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

export const persistTaskWorkbenchUnplacedTask = async (
  task: TaskNode,
  accountId: string | null | undefined,
): Promise<void> => {
  const normalized = {
    ...normalizeTaskWorkbenchUnplacedTask(task),
    updatedAt: Date.now(),
  };
  upsertTaskWorkbenchUnplacedTask(normalized, accountId);
  if (!isSupabaseBackend || !accountId) return;
  try {
    await supabaseTaskWorkbenchUnplacedService.upsert(normalized, accountId);
  } catch (error) {
    console.warn('[taskWorkbench] Failed to persist unplaced task remotely; local fallback retained.', error);
  }
};

export const removeTaskWorkbenchUnplacedTask = (taskId: string, accountId?: string | null) => {
  writeTaskWorkbenchUnplacedTasks(
    readTaskWorkbenchUnplacedTasks(accountId).filter(task => task.id !== taskId),
    accountId,
  );
};

export const persistRemoveTaskWorkbenchUnplacedTask = async (
  taskId: string,
  accountId: string | null | undefined,
): Promise<void> => {
  const previousTasks = readTaskWorkbenchUnplacedTasks(accountId);
  removeTaskWorkbenchUnplacedTask(taskId, accountId);
  if (!isSupabaseBackend || !accountId) return;
  try {
    await supabaseTaskWorkbenchUnplacedService.remove(taskId);
  } catch (error) {
    const previousTask = previousTasks.find(task => task.id === taskId);
    if (previousTask) upsertTaskWorkbenchUnplacedTask(previousTask, accountId);
    console.warn('[taskWorkbench] Failed to remove unplaced task remotely; local fallback retained.', error);
  }
};

const sortTaskWorkbenchUnplacedTasks = (tasks: TaskNode[]) => [...tasks]
  .filter(task => !task.isArchived)
  .sort((left, right) => {
    const orderDifference = (left.order ?? 0) - (right.order ?? 0);
    if (orderDifference !== 0) return orderDifference;
    return (left.updatedAt ?? left.createdAt ?? 0) - (right.updatedAt ?? right.createdAt ?? 0);
  });

const getTaskTimestamp = (task: TaskNode) => task.updatedAt ?? task.createdAt ?? 0;

export const loadTaskWorkbenchUnplacedTasks = async (
  accountId: string | null | undefined,
): Promise<TaskNode[]> => {
  const localTasks = readTaskWorkbenchUnplacedTasks(accountId);
  if (!isSupabaseBackend || !accountId) return sortTaskWorkbenchUnplacedTasks(localTasks);

  try {
    const remoteTasks = await supabaseTaskWorkbenchUnplacedService.list();
    const merged = new Map(remoteTasks.map(task => [task.id, task]));
    let migrationFailed = false;

    for (const localTask of localTasks) {
      if (localTask.isArchived) continue;
      const remoteTask = merged.get(localTask.id);
      if (!remoteTask || getTaskTimestamp(localTask) > getTaskTimestamp(remoteTask)) {
        try {
          await supabaseTaskWorkbenchUnplacedService.upsert(localTask, accountId);
          merged.set(localTask.id, localTask);
        } catch (error) {
          migrationFailed = true;
          merged.set(localTask.id, localTask);
          console.warn('[taskWorkbench] Failed to migrate a local unplaced task.', error);
        }
      }
    }

    if (!migrationFailed) clearTaskWorkbenchUnplacedLocalCaches(accountId);
    return sortTaskWorkbenchUnplacedTasks(Array.from(merged.values()));
  } catch (error) {
    console.warn('[taskWorkbench] Failed to load remote unplaced tasks; using local fallback.', error);
    return sortTaskWorkbenchUnplacedTasks(localTasks);
  }
};

export const createUnplacedTaskNodeFromInboxItem = (
  item: InboxItem,
  workspaceId: string,
  order: number,
): TaskNode => normalizeTaskWorkbenchUnplacedTask({
  id: item.promotedTaskNodeId || createTaskWorkbenchUnplacedTaskId(item.id),
  workspaceId,
  boardId: TASK_WORKBENCH_UNPLACED_BOARD_ID,
  parentId: null,
  title: item.title || '未命名任務',
  description: item.note || item.title || '',
  status: 'todo',
  endDate: item.confirmedDueDate || item.suggestedDueDate || undefined,
  nodeType: 'task',
  order,
  createdAt: item.createdAt || Date.now(),
  updatedAt: item.updatedAt || Date.now(),
});

export const createNewUnplacedTaskNode = (
  title: string,
  workspaceId: string,
  order: number,
): TaskNode => {
  const now = Date.now();
  const trimmedTitle = title.trim() || '新任務';
  return normalizeTaskWorkbenchUnplacedTask({
    id: createTaskWorkbenchUnplacedTaskId(),
    workspaceId,
    boardId: TASK_WORKBENCH_UNPLACED_BOARD_ID,
    parentId: null,
    title: trimmedTitle,
    description: trimmedTitle,
    status: 'todo',
    nodeType: 'task',
    order,
    createdAt: now,
    updatedAt: now,
  });
};
