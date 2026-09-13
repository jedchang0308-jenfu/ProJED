import React from 'react';
import { Search, UserRound } from 'lucide-react';
import {
  TASK_STATUS_OPTIONS,
  type TaskFilterQuery,
  normalizeTaskFilters,
} from '../../features/taskFilters';
import {
  getTaskFilterChoiceClass,
  taskFilterChoiceBaseClass,
  taskFilterChoiceGroupClass,
  taskFilterFieldClass,
} from './taskConditionFilterStyles';
import { getTaskStatusFilterChipClass } from './taskStatusStyles';

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
  value: TaskFilterQuery;
  assigneeOptions: TaskConditionAssigneeOption[];
  tags: TaskConditionTagOption[];
  onChange: (value: TaskFilterQuery) => void;
  unassignedDisabled?: boolean;
  unassignedDisabledReason?: string;
  showOverdueFilter?: boolean;
  onClearPeople?: () => void;
  onClearTags?: () => void;
  tagActions?: React.ReactNode;
  disabled?: boolean;
};

const TaskConditionFilterControls: React.FC<Props> = ({
  value,
  assigneeOptions,
  tags,
  onChange,
  unassignedDisabled = false,
  unassignedDisabledReason,
  showOverdueFilter = true,
  onClearPeople,
  onClearTags,
  tagActions,
  disabled = false,
}) => {
  const change = (next: TaskFilterQuery) => { if (!disabled) onChange(normalizeTaskFilters(next)); };

  const toggleStatus = (status: TaskFilterQuery['statuses'][number]) => {
    change({
      ...value,
      statuses: value.statuses.includes(status)
        ? value.statuses.filter(item => item !== status)
        : [...value.statuses, status],
    });
  };

  const toggleAssignee = (assigneeId: string) => {
    change({
      ...value,
      people: {
        ...value.people,
        ids: value.people.ids.includes(assigneeId)
          ? value.people.ids.filter(id => id !== assigneeId)
          : [...value.people.ids, assigneeId],
      },
    });
  };

  const toggleTag = (tagId: string) => {
    change({
      ...value,
      tagIds: value.tagIds.includes(tagId)
        ? value.tagIds.filter(id => id !== tagId)
        : [...value.tagIds, tagId],
    });
  };

  return (
    <div className="space-y-3" data-task-condition-filter-controls="true">
      <section className="space-y-2">
        <label className="text-[11px] font-bold uppercase text-slate-400">任務狀態</label>
        <div className="flex flex-wrap gap-2">
          {TASK_STATUS_OPTIONS.map(status => (
            <button
              key={status.key}
              type="button"
              disabled={disabled}
              onClick={() => toggleStatus(status.key)}
              className={getTaskStatusFilterChipClass(status.key, value.statuses.includes(status.key))}
              aria-pressed={value.statuses.includes(status.key)}
            >
              {status.label}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <label className="text-[11px] font-bold uppercase text-slate-400">到期日與關鍵字</label>
        {showOverdueFilter ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => change({ ...value, due: { ...value.due, includeOverdue: !value.due.includeOverdue } })}
            className={`${taskFilterChoiceBaseClass} ${
              value.due.includeOverdue
                ? 'border-orange-300 bg-orange-50 text-orange-700 ring-1 ring-orange-200'
                : 'border-orange-200 bg-white text-orange-600 hover:border-orange-300 hover:bg-orange-50'
            }`}
            aria-pressed={value.due.includeOverdue}
            data-overdue-filter="true"
          >
            逾期
          </button>
        ) : null}
        <div
          className={`${taskFilterChoiceGroupClass} ${
            value.due.upcomingWithinDays !== null
              ? 'border-primary/35 bg-primary/[0.04]'
              : 'border-slate-300'
          }`}
          data-upcoming-due-filter-group="true"
        >
          <button
            type="button"
            disabled={disabled}
            onClick={() => change({ ...value, due: { ...value.due, upcomingWithinDays: value.due.upcomingWithinDays === null ? 7 : null } })}
            className={`${taskFilterChoiceBaseClass} rounded-none border-0 border-r border-slate-200/80 px-2.5 ${value.due.upcomingWithinDays !== null ? 'bg-primary/10 text-primary' : 'text-slate-600 hover:bg-primary/5 hover:text-primary'}`}
            aria-pressed={value.due.upcomingWithinDays !== null}
            data-upcoming-due-filter="true"
          >
            到期
          </button>
          <label className="flex items-center gap-1.5 px-2 text-xs font-semibold text-slate-600">
            <input
              type="number"
              disabled={disabled}
              min={0}
              max={365}
              value={value.due.upcomingWithinDays ?? ''}
              onChange={event => change({
                ...value,
                due: {
                  includeOverdue: event.target.value === '' ? value.due.includeOverdue : true,
                  upcomingWithinDays: event.target.value === '' ? null : Number(event.target.value),
                },
              })}
              className={taskFilterFieldClass + ' h-7 w-12 rounded-none border-0 bg-transparent px-0 text-right focus:border-0 focus:ring-0'}
              placeholder="天數"
              aria-label="到期天數"
            />
            <span>天內</span>
          </label>
        </div>
        <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2">
          <Search size={14} className="shrink-0 text-slate-400" />
          <input
            value={value.keyword}
            onChange={event => change({ ...value, keyword: event.target.value })}
            className="h-8 min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none"
            placeholder="搜尋任務名稱"
          />
        </label>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label className="text-[11px] font-bold uppercase text-slate-400">負責人/協作</label>
          {onClearPeople && (value.people.ids.length > 0 || value.people.includeUnassigned) ? (
            <button type="button" onClick={onClearPeople} className="text-[10px] font-semibold text-slate-400 hover:text-slate-700">清除</button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled || unassignedDisabled}
            onClick={() => change({ ...value, people: { ...value.people, includeUnassigned: !value.people.includeUnassigned } })}
            className={getTaskFilterChoiceClass(
              value.people.includeUnassigned,
              unassignedDisabled,
            )}
            title={unassignedDisabled ? unassignedDisabledReason : undefined}
            aria-pressed={value.people.includeUnassigned}
          >
            <UserRound size={13} />
            未指派
          </button>
          {assigneeOptions.map(option => (
            <button
              key={option.id}
              type="button"
              disabled={disabled || option.disabled}
              onClick={() => toggleAssignee(option.id)}
              className={getTaskFilterChoiceClass(value.people.ids.includes(option.id), option.disabled)}
              title={option.disabled ? option.disabledReason : undefined}
              aria-pressed={value.people.ids.includes(option.id)}
            >
              <UserRound size={13} />
              <span className="max-w-[7rem] truncate">{option.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label className="text-[11px] font-bold uppercase text-slate-400">標籤</label>
          <div className="flex items-center gap-2">
            {tagActions}
            {onClearTags && value.tagIds.length > 0 ? (
              <button type="button" onClick={onClearTags} className="text-[10px] font-semibold text-slate-400 hover:text-slate-700">清除</button>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {tags.length === 0 ? (
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-400">
              尚無標籤
            </span>
          ) : tags.map(tag => (
            <button
              key={tag.id}
              type="button"
              disabled={disabled}
              onClick={() => toggleTag(tag.id)}
              className={getTaskFilterChoiceClass(value.tagIds.includes(tag.id))}
              aria-pressed={value.tagIds.includes(tag.id)}
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
