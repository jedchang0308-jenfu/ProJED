import type { InboxItem, TaskNode } from '../../types';

export const TASK_WORKBENCH_UNPLACED_BOARD_ID = '__task_workbench_unplaced__';
export const TASK_WORKBENCH_UNPLACED_STORAGE_KEY = 'projed-task-workbench-unplaced-tasks:v1';

const UNPLACED_TASK_ID_PREFIX = 'task_workbench_unplaced_';

export const createTaskWorkbenchUnplacedTaskId = (sourceId?: string) =>
  `${UNPLACED_TASK_ID_PREFIX}${sourceId || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`}`;

export const isTaskWorkbenchUnplacedTaskId = (taskId: string | null | undefined) =>
  Boolean(taskId && taskId.startsWith(UNPLACED_TASK_ID_PREFIX));

export const isTaskWorkbenchUnplacedTask = (task: Pick<TaskNode, 'boardId'> | null | undefined) =>
  task?.boardId === TASK_WORKBENCH_UNPLACED_BOARD_ID;

export const normalizeTaskWorkbenchUnplacedTask = (task: TaskNode): TaskNode => ({
  ...task,
  boardId: TASK_WORKBENCH_UNPLACED_BOARD_ID,
  parentId: null,
  nodeType: task.nodeType || 'task',
});

export const readTaskWorkbenchUnplacedTasks = (): TaskNode[] => {
  if (typeof window === 'undefined') return [];
  try {
    const stored = window.localStorage.getItem(TASK_WORKBENCH_UNPLACED_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is TaskNode => Boolean(item?.id && item?.workspaceId))
      .map(item => normalizeTaskWorkbenchUnplacedTask(item));
  } catch {
    return [];
  }
};

export const writeTaskWorkbenchUnplacedTasks = (tasks: TaskNode[]) => {
  if (typeof window === 'undefined') return;
  const normalized = tasks
    .filter(task => !task.isArchived)
    .map(task => normalizeTaskWorkbenchUnplacedTask(task))
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
  window.localStorage.setItem(TASK_WORKBENCH_UNPLACED_STORAGE_KEY, JSON.stringify(normalized));
};

export const upsertTaskWorkbenchUnplacedTask = (task: TaskNode) => {
  const normalized = normalizeTaskWorkbenchUnplacedTask(task);
  const current = readTaskWorkbenchUnplacedTasks();
  writeTaskWorkbenchUnplacedTasks([
    ...current.filter(item => item.id !== normalized.id),
    normalized,
  ]);
};

export const removeTaskWorkbenchUnplacedTask = (taskId: string) => {
  writeTaskWorkbenchUnplacedTasks(
    readTaskWorkbenchUnplacedTasks().filter(task => task.id !== taskId),
  );
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
