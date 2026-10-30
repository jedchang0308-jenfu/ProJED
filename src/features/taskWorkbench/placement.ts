import type { InboxItem, TaskNode } from '../../types';
import { isHttpBackend, isSupabaseBackend } from '../../services/dataBackend';
import { httpSessionService, httpTaskWorkbenchService } from '../../services/httpApi/backend';
import type { HttpExpectedActor } from '../../services/httpApi/taskWorkbenchAdapter';
import { supabaseTaskWorkbenchUnplacedService } from '../../services/supabase/taskWorkbenchUnplacedService';
import { createBlankTaskNode } from '../taskCreation/createBlankTaskNode';
import {
  normalizeTaskWorkbenchUnplacedTask,
  TASK_WORKBENCH_UNPLACED_BOARD_ID,
} from './placementModel';
import {
  clearTaskWorkbenchUnplacedLocalCaches,
  indexLatestTaskWorkbenchTasks,
  readTaskWorkbenchUnplacedTasks,
  readUnboundTaskWorkbenchUnplacedTasks,
  removeTaskWorkbenchUnplacedTask,
  upsertTaskWorkbenchUnplacedTask,
  writeTaskWorkbenchUnplacedTasks,
} from './placementLocalStorage';

export { normalizeTaskWorkbenchUnplacedTask, TASK_WORKBENCH_UNPLACED_BOARD_ID } from './placementModel';
export {
  clearTaskWorkbenchUnplacedLocalCaches,
  indexLatestTaskWorkbenchTasks,
  readTaskWorkbenchUnplacedTasks,
  readUnboundTaskWorkbenchUnplacedTasks,
  removeTaskWorkbenchUnplacedTask,
  TASK_WORKBENCH_UNPLACED_ACCOUNT_STORAGE_KEY,
  TASK_WORKBENCH_UNPLACED_STORAGE_KEY,
  upsertTaskWorkbenchUnplacedTask,
  writeTaskWorkbenchUnplacedTasks,
} from './placementLocalStorage';

const UNPLACED_TASK_ID_PREFIX = 'task_workbench_unplaced_';

export const createTaskWorkbenchUnplacedTaskId = (sourceId?: string) =>
  `${UNPLACED_TASK_ID_PREFIX}${sourceId || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`}`;

export const isTaskWorkbenchUnplacedTaskId = (taskId: string | null | undefined) =>
  Boolean(taskId && taskId.startsWith(UNPLACED_TASK_ID_PREFIX));

export const isTaskWorkbenchUnplacedTask = (task: Pick<TaskNode, 'boardId'> | null | undefined) =>
  task?.boardId === TASK_WORKBENCH_UNPLACED_BOARD_ID;

export const persistTaskWorkbenchUnplacedTask = async (
  task: TaskNode,
  accountId: string | null | undefined,
): Promise<void> => {
  const normalized = {
    ...normalizeTaskWorkbenchUnplacedTask(task),
    updatedAt: Date.now(),
  };
  upsertTaskWorkbenchUnplacedTask(normalized, accountId);
  if (!accountId || (!isHttpBackend && !isSupabaseBackend)) return;
  try {
    if (isHttpBackend) await httpTaskWorkbenchService.upsert(normalized, await getHttpExpectedActor(accountId));
    else await supabaseTaskWorkbenchUnplacedService.upsert(normalized, accountId!);
  } catch (error) {
    console.warn('[taskWorkbench] Failed to persist unplaced task remotely; local fallback retained.', error);
  }
};

export const persistRemoveTaskWorkbenchUnplacedTask = async (
  taskId: string,
  accountId: string | null | undefined,
): Promise<void> => {
  const previousTasks = readTaskWorkbenchUnplacedTasks(accountId);
  removeTaskWorkbenchUnplacedTask(taskId, accountId);
  if (!accountId || (!isHttpBackend && !isSupabaseBackend)) return;
  try {
    if (isHttpBackend) await httpTaskWorkbenchService.remove(taskId, await getHttpExpectedActor(accountId));
    else await supabaseTaskWorkbenchUnplacedService.remove(taskId);
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

const getHttpExpectedActor = async (accountId: string): Promise<HttpExpectedActor> => {
  const session = await httpSessionService.getSession();
  if (session.entry !== 'main' || session.uid !== accountId) {
    throw new Error('TASK_WORKBENCH_ACTOR_CHANGED');
  }
  return { accountId: session.uid, contextId: session.authContextId };
};

export const claimUnboundTaskWorkbenchUnplacedTasks = async (accountId: string): Promise<TaskNode[]> => {
  const unboundTasks = readUnboundTaskWorkbenchUnplacedTasks();
  if (unboundTasks.length === 0) return loadTaskWorkbenchUnplacedTasks(accountId);

  const expectedActor = isHttpBackend ? await getHttpExpectedActor(accountId) : null;
  const remoteTasks = isHttpBackend
    ? await httpTaskWorkbenchService.list(expectedActor!)
    : isSupabaseBackend
      ? await supabaseTaskWorkbenchUnplacedService.list()
      : [];
  const merged = indexLatestTaskWorkbenchTasks(remoteTasks, readTaskWorkbenchUnplacedTasks(accountId));

  for (const task of unboundTasks) {
    const existing = merged.get(task.id);
    if (existing && getTaskTimestamp(existing) >= getTaskTimestamp(task)) continue;
    if (isHttpBackend) await httpTaskWorkbenchService.upsert(task, expectedActor!);
    else if (isSupabaseBackend) await supabaseTaskWorkbenchUnplacedService.upsert(task, accountId);
    merged.set(task.id, task);
  }

  const claimed = sortTaskWorkbenchUnplacedTasks(Array.from(merged.values()));
  writeTaskWorkbenchUnplacedTasks(claimed, accountId);
  clearTaskWorkbenchUnplacedLocalCaches(null);
  return claimed;
};

export const loadTaskWorkbenchUnplacedTasks = async (
  accountId: string | null | undefined,
): Promise<TaskNode[]> => {
  const localTasks = readTaskWorkbenchUnplacedTasks(accountId);
  if (!accountId || (!isHttpBackend && !isSupabaseBackend)) return sortTaskWorkbenchUnplacedTasks(localTasks);

  try {
    const expectedActor = isHttpBackend ? await getHttpExpectedActor(accountId) : null;
    const remoteTasks = isHttpBackend
      ? await httpTaskWorkbenchService.list(expectedActor!)
      : await supabaseTaskWorkbenchUnplacedService.list();
    const merged = new Map(remoteTasks.map(task => [task.id, task]));
    let migrationFailed = false;

    for (const localTask of localTasks) {
      if (localTask.isArchived) continue;
      const remoteTask = merged.get(localTask.id);
      if (!remoteTask || getTaskTimestamp(localTask) > getTaskTimestamp(remoteTask)) {
        try {
          if (isHttpBackend) await httpTaskWorkbenchService.upsert(localTask, expectedActor!);
          else await supabaseTaskWorkbenchUnplacedService.upsert(localTask, accountId!);
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
  return normalizeTaskWorkbenchUnplacedTask(createBlankTaskNode({
    id: createTaskWorkbenchUnplacedTaskId(),
    workspaceId,
    boardId: TASK_WORKBENCH_UNPLACED_BOARD_ID,
    parentId: null,
    title,
    nodeType: 'task',
    order,
  }));
};
