import type { TaskStatus } from '../../types';
import { normalizeManualTaskStatus, type ManualTaskStatus } from '../../utils/taskStatus';

/**
 * 四種人工狀態只使用深灰、藍、淺灰三個視覺角色；逾期另由截止日使用橘紅色。
 */
export const taskStatusTitleClass: Record<TaskStatus, string> = {
  todo: 'text-slate-800',
  in_progress: 'text-blue-700',
  completed: 'text-slate-400 line-through',
  delayed: 'text-slate-800',
  unsure: 'text-slate-800',
  onhold: 'text-slate-400',
};

const statusSelectClass: Record<ManualTaskStatus, string> = {
  todo: 'border-slate-500 bg-slate-700 text-white hover:bg-slate-800 focus:ring-slate-400',
  in_progress: 'border-blue-500 bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-400',
  completed: 'border-slate-300 bg-slate-100 text-slate-500 hover:bg-slate-200 focus:ring-slate-300',
  onhold: 'border-slate-300 bg-slate-100 text-slate-500 hover:bg-slate-200 focus:ring-slate-300',
};

export const getTaskStatusSelectClass = (status: TaskStatus) =>
  `w-20 appearance-none rounded-full border px-1.5 py-1 text-center text-[11px] font-semibold outline-none transition-colors shadow-[0_1px_1px_rgba(15,23,42,0.04)] focus:ring-1 ${statusSelectClass[normalizeManualTaskStatus(status)]}`;

export const getTaskStatusFieldClass = (status: TaskStatus) =>
  `h-8 min-w-0 flex-1 rounded-md border px-2 text-sm font-semibold outline-none transition-colors focus:ring-2 ${statusSelectClass[normalizeManualTaskStatus(status)]}`;

const activeStatusFilterClass: Record<ManualTaskStatus, string> = {
  todo: 'border-slate-700 bg-slate-700 text-white ring-slate-700/20',
  in_progress: 'border-blue-600 bg-blue-600 text-white ring-blue-600/20',
  onhold: 'border-slate-300 bg-slate-100 text-slate-500 ring-slate-300/30',
  completed: 'border-slate-300 bg-slate-100 text-slate-500 ring-slate-300/30',
};

const inactiveStatusFilterClass: Record<ManualTaskStatus, string> = {
  todo: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  in_progress: 'border-blue-200 bg-white text-blue-600 hover:bg-blue-50',
  onhold: 'border-slate-200 bg-white text-slate-400 hover:bg-slate-50',
  completed: 'border-slate-200 bg-white text-slate-400 hover:bg-slate-50',
};

export const getTaskStatusFilterChipClass = (status: ManualTaskStatus, active: boolean) =>
  `inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-semibold transition-colors ${
    active
      ? `${activeStatusFilterClass[status]} ring-1`
      : inactiveStatusFilterClass[status]
  }`;

export const getTaskProgressFillClass = (progress: number) => {
  if (progress >= 100) return 'bg-slate-300';
  if (progress > 0) return 'bg-primary';
  return 'bg-slate-200';
};
