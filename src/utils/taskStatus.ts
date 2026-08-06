import dayjs, { type Dayjs } from 'dayjs';
import type { TaskNode, TaskStatus } from '../types';

export const MANUAL_TASK_STATUSES = ['todo', 'in_progress', 'onhold', 'completed'] as const;

export type ManualTaskStatus = (typeof MANUAL_TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<ManualTaskStatus, string> = {
  todo: '待辦',
  in_progress: '進行中',
  onhold: '暫緩',
  completed: '完成',
};

const manualTaskStatusSet = new Set<TaskStatus>(MANUAL_TASK_STATUSES);

/**
 * delayed / unsure 是舊版可寫入狀態。新版只保留四種人工狀態，讀取舊資料時
 * 安全收斂為待辦；逾期改由截止日即時計算，不再回寫 status。
 */
export const normalizeManualTaskStatus = (
  status?: TaskStatus | string | null,
): ManualTaskStatus => (
  status && manualTaskStatusSet.has(status as TaskStatus)
    ? status as ManualTaskStatus
    : 'todo'
);

export const isTaskOverdue = (
  task: Pick<TaskNode, 'endDate' | 'isArchived' | 'status'> | null | undefined,
  now: Dayjs = dayjs(),
) => {
  if (!task || task.isArchived || normalizeManualTaskStatus(task.status) === 'completed' || !task.endDate) {
    return false;
  }

  const dueDate = dayjs(task.endDate);
  return dueDate.isValid() && dueDate.isBefore(now, 'day');
};
