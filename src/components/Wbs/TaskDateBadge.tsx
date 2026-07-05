import React from 'react';
import dayjs from 'dayjs';
import { Calendar } from 'lucide-react';
import type { TaskStatus } from '../../types';
import { cn } from '../../utils/cn';
import { Badge } from '../ui/Badge';

type TaskDateBadgeSurface = 'kanban-card' | 'checklist' | 'workbench';

type TaskDateBadgeProps = {
  startDate?: string | null;
  endDate?: string | null;
  status?: TaskStatus | null;
  showStartDate: boolean;
  startLocked?: boolean;
  endLocked?: boolean;
  durationLocked?: boolean;
  surface?: TaskDateBadgeSurface;
  className?: string;
};

const formatTaskDate = (value?: string | null) => {
  if (!value) return '...';
  const date = dayjs(value);
  return date.year() !== dayjs().year() ? date.format('YY/MM/DD') : date.format('MM/DD');
};

export const hasVisibleTaskDate = (
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  showStartDate: boolean,
) => Boolean((showStartDate && startDate) || endDate);

export const TaskDateBadge: React.FC<TaskDateBadgeProps> = ({
  startDate,
  endDate,
  status,
  showStartDate,
  startLocked = false,
  endLocked = false,
  durationLocked = false,
  surface = 'kanban-card',
  className,
}) => {
  if (!hasVisibleTaskDate(startDate, endDate, showStartDate)) return null;

  const isDueToday = status !== 'completed' && Boolean(endDate) && dayjs(endDate).isSame(dayjs(), 'day');
  const isEndDateEffectivelyLocked = endLocked || durationLocked;
  const lockTitle = isEndDateEffectivelyLocked
    ? (durationLocked ? '因工期鎖定，由開始日期推算' : '此日期由依賴推算')
    : undefined;
  const endLockClass = isEndDateEffectivelyLocked
    ? 'underline decoration-dashed decoration-slate-400 underline-offset-[3px] opacity-70'
    : '';
  const startLockClass = startLocked
    ? 'underline decoration-dashed decoration-slate-400 underline-offset-[3px] opacity-70'
    : '';
  const content = (
    <>
      {showStartDate ? (
        <>
          <span className={startLockClass} title={startLocked ? '此日期由依賴推算' : undefined}>
            {formatTaskDate(startDate)}
          </span>
          <span className="opacity-50">→</span>
        </>
      ) : null}
      <span className={endLockClass} title={lockTitle}>
        {formatTaskDate(endDate)}
      </span>
    </>
  );

  if (surface === 'kanban-card') {
    return (
      <Badge
        variant={isDueToday ? 'warning' : 'default'}
        size="sm"
        icon={<Calendar size={10} />}
        className={className}
        data-task-date-badge="true"
        data-task-due-date={endDate || ''}
      >
        {content}
      </Badge>
    );
  }

  if (surface === 'checklist') {
    return (
      <span
        className={cn(
          'flex flex-shrink-0 items-center gap-0.5 rounded px-1 py-0 text-[9px]',
          isDueToday
            ? 'border border-orange-300 bg-orange-50 text-orange-600 shadow-[0_0_0_1px_rgba(251,146,60,0.25)]'
            : `border ${isEndDateEffectivelyLocked ? 'border-dashed border-slate-400 bg-slate-50 text-slate-500 opacity-80' : 'border-slate-200 bg-white text-slate-400'}`,
          className,
        )}
        title={lockTitle}
        data-task-date-badge="true"
        data-task-due-date={endDate || ''}
      >
        {content}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex h-5 flex-shrink-0 items-center gap-0.5 rounded border px-1 text-[10px] font-semibold leading-none',
        isDueToday
          ? 'border-orange-200 bg-orange-50 text-orange-600'
          : 'border-slate-200 bg-white/80 text-slate-500',
        className,
      )}
      title={lockTitle}
      data-task-date-badge="true"
      data-task-due-date={endDate || ''}
      data-task-date-surface="workbench"
    >
      {content}
    </span>
  );
};
