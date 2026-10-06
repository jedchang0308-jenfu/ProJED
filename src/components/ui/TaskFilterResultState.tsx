import React from 'react';
import type { TaskFilterResultProjection } from '../../features/taskFilters';
import { Button } from './Button';
import { cn } from '../../utils/cn';

export type TaskFilterResultStateKind = 'loading' | 'error' | 'true-empty' | 'filtered-zero' | 'results';

export const resolveTaskFilterResultState = ({
  loading,
  error,
  totalTaskCount,
  matchedTaskCount,
}: {
  loading: boolean;
  error: string | null;
  totalTaskCount: number;
  matchedTaskCount: number;
}): TaskFilterResultStateKind => {
  if (loading) return 'loading';
  if (error) return 'error';
  if (totalTaskCount === 0) return 'true-empty';
  if (matchedTaskCount === 0) return 'filtered-zero';
  return 'results';
};

type TaskFilterResultStateProps = {
  projection: TaskFilterResultProjection;
  loading?: boolean;
  error?: string | null;
  onReset: () => void;
  onCreate?: () => void;
  canCreate?: boolean;
  className?: string;
};

export const TaskFilterResultState: React.FC<TaskFilterResultStateProps> = ({
  projection,
  loading = false,
  error = null,
  onReset,
  onCreate,
  canCreate = false,
  className,
}) => {
  const state = resolveTaskFilterResultState({
    loading,
    error,
    totalTaskCount: projection.totalTaskCount,
    matchedTaskCount: projection.matchedTaskIds.size,
  });
  const hasTrueEmptyAction = state === 'true-empty' && canCreate && Boolean(onCreate);
  if (state === 'results' || (state === 'true-empty' && !hasTrueEmptyAction)) return null;

  return (
    <div
      className={cn('flex min-h-48 flex-col items-center justify-center gap-3 text-center text-sm text-slate-500', className)}
      data-task-filter-result-state={state}
      role={state === 'error' ? 'alert' : 'status'}
      aria-live={state === 'error' ? 'assertive' : 'polite'}
    >
      {state === 'loading' ? <p>載入任務中…</p> : null}
      {state === 'error' ? (
        <>
          <p>任務載入失敗</p>
          <Button variant="secondary" onClick={() => window.location.reload()}>重新載入</Button>
        </>
      ) : null}
      {state === 'true-empty' ? (
        <>
          {canCreate && onCreate ? <Button variant="secondary" onClick={onCreate}>新增第一個任務</Button> : null}
        </>
      ) : null}
      {state === 'filtered-zero' ? (
        <>
          <p>沒有符合目前篩選的任務</p>
          <Button variant="secondary" onClick={onReset} data-task-filter-empty-reset="true">清除篩選</Button>
        </>
      ) : null}
    </div>
  );
};

export default TaskFilterResultState;
