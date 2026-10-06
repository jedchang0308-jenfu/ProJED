import type { TaskNode } from '../../types';

export const TASK_WORKBENCH_UNPLACED_BOARD_ID = '__task_workbench_unplaced__';

export const normalizeTaskWorkbenchUnplacedTask = (task: TaskNode): TaskNode => ({
  ...task,
  boardId: TASK_WORKBENCH_UNPLACED_BOARD_ID,
  parentId: typeof task.parentId === 'string' && task.parentId.trim() ? task.parentId : null,
  nodeType: task.nodeType || 'task',
});
