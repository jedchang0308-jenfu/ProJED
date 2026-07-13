import React from 'react';
import { Filter, Search, UserRound } from 'lucide-react';
import {
  TASK_STATUS_OPTIONS,
  UNASSIGNED_ASSIGNEE_FILTER,
  type TaskFilterState,
} from '../../features/taskFilters';
import { taskFilterFieldClass } from './taskConditionFilterStyles';

export type TaskConditionAssigneeOption = {
  id: string;
  label: string;
  disabled?: boolean;
  disabledReason?: string;
};

export type TaskConditionTagOption = {
  id: string;
  name: string;
};

type Props = {
  filters: TaskFilterState;
  assigneeOptions: TaskConditionAssigneeOption[];
  tags: TaskConditionTagOption[];
  onChange: (updates: Partial<TaskFilterState>) => void;
  unassignedDisabled?: boolean;
  unassignedDisabledReason?: string;
};

const taskFilterChipClass = (active: boolean, disabled = false) =>
  `inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold transition ${
    active
      ? 'border-primary/40 bg-primary/10 text-primary ring-1 ring-primary/20'
      : 'border-slate-200 bg-white text-slate-600 hover:border-primary/25 hover:bg-primary/5 hover:text-primary'
  } ${disabled ? 'cursor-not-allowed opacity-45 hover:border-slate-200 hover:bg-white hover:text-slate-600' : ''}`;

const TaskConditionFilterControls: React.FC<Props> = ({
  filters,
  assigneeOptions,
  tags,
  onChange,
  unassignedDisabled = false,
  unassignedDisabledReason,
}) => {
  const toggleStatus = (status: keyof TaskFilterState['statusFilters']) => {
    onChange({
      statusFilters: {
        ...filters.statusFilters,
        [status]: !filters.statusFilters[status],
      },
    });
  };

  const toggleAssignee = (assigneeId: string) => {
    onChange({
      selectedAssigneeIds: filters.selectedAssigneeIds.includes(assigneeId)
        ? filters.selectedAssigneeIds.filter(id => id !== assigneeId)
        : [...filters.selectedAssigneeIds, assigneeId],
    });
  };

  const toggleTag = (tagId: string) => {
    onChange({
      selectedTagIds: filters.selectedTagIds.includes(tagId)
        ? filters.selectedTagIds.filter(id => id !== tagId)
        : [...filters.selectedTagIds, tagId],
    });
  };

  return (
    <div className="space-y-3" data-task-condition-filter-controls="true">
      <section className="space-y-2">
        <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-slate-400">
          <Filter size={13} />
          任務狀態
        </label>
        <div className="flex flex-wrap gap-2">
          {TASK_STATUS_OPTIONS.map(status => (
            <button
              key={status.key}
              type="button"
              onClick={() => toggleStatus(status.key)}
              className={taskFilterChipClass(filters.statusFilters[status.key])}
              aria-pressed={filters.statusFilters[status.key]}
            >
              <span className={`h-2 w-2 rounded-full ${status.color}`} />
              {status.label}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <label className="text-[11px] font-bold uppercase text-slate-400">到期日與關鍵字</label>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <input
            type="number"
            min={0}
            max={365}
            value={filters.dueWithinDays ?? ''}
            onChange={event => onChange({ dueWithinDays: event.target.value === '' ? null : Number(event.target.value) })}
            className={taskFilterFieldClass}
            placeholder="天數"
            aria-label="到期日天數"
          />
          <button
            type="button"
            onClick={() => onChange({ dueWithinDays: null })}
            className="btn-outline h-8 px-2 text-xs font-semibold"
          >
            清除
          </button>
        </div>
        <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2">
          <Search size={14} className="shrink-0 text-slate-400" />
          <input
            value={filters.keyword}
            onChange={event => onChange({ keyword: event.target.value })}
            className="h-8 min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none"
            placeholder="搜尋任務名稱"
          />
        </label>
      </section>

      <section className="space-y-2">
        <label className="text-[11px] font-bold uppercase text-slate-400">負責人</label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={unassignedDisabled}
            onClick={() => toggleAssignee(UNASSIGNED_ASSIGNEE_FILTER)}
            className={taskFilterChipClass(
              filters.selectedAssigneeIds.includes(UNASSIGNED_ASSIGNEE_FILTER),
              unassignedDisabled,
            )}
            title={unassignedDisabled ? unassignedDisabledReason : undefined}
            aria-pressed={filters.selectedAssigneeIds.includes(UNASSIGNED_ASSIGNEE_FILTER)}
          >
            <UserRound size={13} />
            未指派
          </button>
          {assigneeOptions.map(option => (
            <button
              key={option.id}
              type="button"
              disabled={option.disabled}
              onClick={() => toggleAssignee(option.id)}
              className={taskFilterChipClass(filters.selectedAssigneeIds.includes(option.id), option.disabled)}
              title={option.disabled ? option.disabledReason : undefined}
              aria-pressed={filters.selectedAssigneeIds.includes(option.id)}
            >
              <UserRound size={13} />
              <span className="max-w-[7rem] truncate">{option.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <label className="text-[11px] font-bold uppercase text-slate-400">標籤</label>
        <div className="flex flex-wrap gap-2">
          {tags.length === 0 ? (
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-400">
              尚無標籤
            </span>
          ) : tags.map(tag => (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggleTag(tag.id)}
              className={taskFilterChipClass(filters.selectedTagIds.includes(tag.id))}
              aria-pressed={filters.selectedTagIds.includes(tag.id)}
            >
              <span className="max-w-[9rem] truncate">{tag.name}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};

export default TaskConditionFilterControls;
