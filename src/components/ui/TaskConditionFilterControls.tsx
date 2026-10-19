import React from 'react';
import { Search } from 'lucide-react';
import {
  TASK_FILTER_DATE_BUCKETS,
  TASK_STATUS_OPTIONS,
  normalizeTaskFilters,
  normalizeTaskFiltersV5,
  type LegacyTaskFilterQueryV5,
  type TaskFilterDateBucket,
  type TaskFilterQuery,
} from '../../features/taskFilters';
import { getTaskFilterChoiceClass, taskFilterFieldClass } from './taskConditionFilterStyles';
import { getTaskStatusFilterChipClass } from './taskStatusStyles';
import { cn } from '../../utils/cn';

export type TaskConditionAssigneeOption = { id: string; label: string; disabled?: boolean; disabledReason?: string };
export type TaskConditionTagOption = { id: string; name: string };
type OptionsStatus = 'ready' | 'loading' | 'error';

type BaseProps = {
  assigneeOptions: TaskConditionAssigneeOption[];
  tags: TaskConditionTagOption[];
  unassignedDisabled?: boolean;
  unassignedDisabledReason?: string;
  onClearPeople?: () => void;
  onClearTags?: () => void;
  tagActions?: React.ReactNode;
  disabled?: boolean;
  peopleOptionsStatus?: OptionsStatus;
  tagOptionsStatus?: OptionsStatus;
};

type MatrixProps = BaseProps & {
  variant: 'matrix-v6';
  value: TaskFilterQuery;
  onChange: (value: TaskFilterQuery) => void;
};

type CalendarProps = BaseProps & {
  variant: 'calendar-v5';
  value: LegacyTaskFilterQueryV5;
  onChange: (value: LegacyTaskFilterQueryV5) => void;
  showOverdueFilter?: boolean;
};

type Props = MatrixProps | CalendarProps;

const compactChoiceClass = 'h-6 gap-1 px-1.5';
const compactFieldClass = cn(taskFilterFieldClass, 'h-7 px-1.5');
const getCompactChoiceClass = (active: boolean, disabled = false) => cn(getTaskFilterChoiceClass(active, disabled), compactChoiceClass);

const AllChoice: React.FC<{ selected: boolean; onClick: () => void; disabled?: boolean }> = ({ selected, onClick, disabled }) => (
  <button
    type="button"
    aria-pressed={selected}
    disabled={disabled}
    onClick={onClick}
    className={getCompactChoiceClass(selected, disabled)}
    data-task-filter-all="true"
  >
    全部
  </button>
);

const MatrixControls: React.FC<MatrixProps> = ({
  value: sourceValue,
  assigneeOptions,
  tags,
  onChange,
  onClearPeople,
  onClearTags,
  tagActions,
  disabled = false,
  peopleOptionsStatus = 'ready',
  tagOptionsStatus = 'ready',
}) => {
  const value = React.useMemo(() => normalizeTaskFilters(sourceValue), [sourceValue]);
  const [withinDaysInput, setWithinDaysInput] = React.useState(value.due.mode === 'legacy-v5' ? '8' : String(value.due.withinDays));
  const [daysError, setDaysError] = React.useState(false);
  const [keywordDraft, setKeywordDraft] = React.useState(value.keyword);
  const keywordInputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (value.due.mode !== 'legacy-v5') {
      setWithinDaysInput(String(value.due.withinDays));
      setDaysError(false);
    }
  }, [value.due]);
  React.useEffect(() => {
    if (document.activeElement !== keywordInputRef.current) setKeywordDraft(value.keyword);
  }, [value.keyword]);
  const change = (next: TaskFilterQuery) => { if (!disabled) onChange(normalizeTaskFilters(next)); };
  const peopleIds = Array.from(new Set([...assigneeOptions.map(option => option.id), ...value.people.ids])).sort();
  const tagIds = Array.from(new Set([...tags.map(tag => tag.id), ...value.tags.ids])).sort();

  const selectAll = (group: 'statuses' | 'due' | 'people' | 'tags') => {
    if (value[group].mode === 'all') return;
    if (group === 'statuses') change({ ...value, statuses: { mode: 'all', values: [] } });
    if (group === 'due') change({ ...value, due: { mode: 'all', buckets: [], withinDays: value.due.mode === 'legacy-v5' ? 8 : value.due.withinDays } });
    if (group === 'people') change({ ...value, people: { mode: 'all', ids: [], includeUnassigned: false } });
    if (group === 'tags') change({ ...value, tags: { mode: 'all', ids: [], includeUntagged: false } });
  };

  const toggleStatus = (status: TaskFilterQuery['statuses']['values'][number]) => {
    const selected = value.statuses.mode === 'all' ? TASK_STATUS_OPTIONS.map(option => option.key) : value.statuses.values;
    const next = selected.includes(status) ? selected.filter(item => item !== status) : [...selected, status];
    const mode = next.length === 0 || next.length === TASK_STATUS_OPTIONS.length ? 'all' : 'selected';
    change({ ...value, statuses: { mode, values: mode === 'selected' ? next : [] } });
  };

  const toggleDueBucket = (bucket: TaskFilterDateBucket) => {
    if (value.due.mode === 'legacy-v5') return;
    const selected = value.due.mode === 'all' ? TASK_FILTER_DATE_BUCKETS : value.due.buckets;
    const next = selected.includes(bucket) ? selected.filter(item => item !== bucket) : [...selected, bucket];
    const mode = next.length === 0 || next.length === TASK_FILTER_DATE_BUCKETS.length ? 'all' : 'selected';
    change({ ...value, due: { ...value.due, mode, buckets: mode === 'selected' ? next : [] } });
  };

  const togglePerson = (id: string | null) => {
    if (peopleOptionsStatus !== 'ready') return;
    const selectedIds = value.people.mode === 'all' ? peopleIds : value.people.ids;
    const includeUnassigned = value.people.mode === 'all' || value.people.includeUnassigned;
    const nextIds = id === null ? selectedIds : selectedIds.includes(id) ? selectedIds.filter(item => item !== id) : [...selectedIds, id];
    const nextUnassigned = id === null ? !includeUnassigned : includeUnassigned;
    const count = nextIds.length + Number(nextUnassigned);
    const mode = count === 0 ? 'all' : 'selected';
    change({ ...value, people: { mode, ids: mode === 'selected' ? nextIds : [], includeUnassigned: mode === 'selected' && nextUnassigned } });
  };

  const toggleTag = (id: string | null) => {
    if (tagOptionsStatus !== 'ready') return;
    const selectedIds = value.tags.mode === 'all' ? tagIds : value.tags.ids;
    const includeUntagged = value.tags.mode === 'all' || value.tags.includeUntagged;
    const nextIds = id === null ? selectedIds : selectedIds.includes(id) ? selectedIds.filter(item => item !== id) : [...selectedIds, id];
    const nextUntagged = id === null ? !includeUntagged : includeUntagged;
    const count = nextIds.length + Number(nextUntagged);
    const mode = count === 0 ? 'all' : 'selected';
    change({ ...value, tags: { mode, ids: mode === 'selected' ? nextIds : [], includeUntagged: mode === 'selected' && nextUntagged } });
  };

  const commitWithinDays = (input: string) => {
    setWithinDaysInput(input);
    if (!/^\d+$/.test(input)) { setDaysError(true); return; }
    const nextDays = Number(input);
    if (!Number.isInteger(nextDays) || nextDays < 0 || nextDays > 365) { setDaysError(true); return; }
    setDaysError(false);
    if (value.due.mode !== 'legacy-v5') change({ ...value, due: { ...value.due, withinDays: nextDays } });
  };

  const dateOptions: Array<{ key: TaskFilterDateBucket; label: string }> = [
    { key: 'unset', label: '未設定' },
    { key: 'before_today', label: '今天以前' },
  ];

  const ambiguousPeople = value.people.mode === 'selected' && value.people.ids.length === peopleIds.length && value.people.includeUnassigned;
  const ambiguousTags = value.tags.mode === 'selected' && value.tags.ids.length === tagIds.length && value.tags.includeUntagged;

  return (
    <div className="space-y-2" data-task-condition-filter-controls="true" data-task-filter-variant="matrix-v6">
      <section className="space-y-1.5" data-task-filter-group="status">
        <label className="block text-[11px] font-bold uppercase leading-4 text-slate-400">任務狀態</label>
        <div className="flex flex-wrap gap-1.5">
          <AllChoice selected={value.statuses.mode === 'all'} onClick={() => selectAll('statuses')} disabled={disabled} />
          {TASK_STATUS_OPTIONS.map(status => <button key={status.key} type="button" disabled={disabled} onClick={() => toggleStatus(status.key)} className={cn(getTaskStatusFilterChipClass(value.statuses.mode === 'all' || value.statuses.values.includes(status.key)), compactChoiceClass)} aria-pressed={value.statuses.mode === 'all' || value.statuses.values.includes(status.key)}>{status.label}</button>)}
        </div>
      </section>

      <section className="space-y-1.5" data-task-filter-group="due">
        <label className="block text-[11px] font-bold uppercase leading-4 text-slate-400">到期日</label>
        <div className="flex flex-wrap gap-1.5">
          <AllChoice selected={value.due.mode === 'all'} onClick={() => selectAll('due')} disabled={disabled} />
          {value.due.mode !== 'legacy-v5' && dateOptions.map(option => <button key={option.key} type="button" disabled={disabled} onClick={() => toggleDueBucket(option.key)} className={getCompactChoiceClass(value.due.mode === 'all' || (value.due.mode === 'selected' && value.due.buckets.includes(option.key)))} aria-pressed={value.due.mode === 'all' || (value.due.mode === 'selected' && value.due.buckets.includes(option.key))} data-task-filter-date-bucket={option.key}>{option.label}</button>)}
        </div>
        {value.due.mode === 'legacy-v5' ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800" data-task-filter-legacy-date="true">
            <p>沿用舊日期條件：{value.due.includeOverdue ? '逾期' : '不含逾期'}{value.due.upcomingWithinDays !== null ? `、今天～${value.due.upcomingWithinDays}天後` : ''}</p>
          </div>
        ) : (
          <>
            <label className="block text-xs font-semibold text-slate-600">
              天數 N（0～365）
              <input type="number" min={0} max={365} value={withinDaysInput} disabled={disabled} onChange={event => commitWithinDays(event.target.value)} onBlur={() => { setWithinDaysInput(String(value.due.mode === 'legacy-v5' ? 8 : value.due.withinDays)); setDaysError(false); }} aria-label="日期分類天數 N" aria-invalid={daysError} className={`${compactFieldClass} ml-1.5 w-16`} />
              {daysError ? <span className="ml-2 text-rose-600" role="alert">請輸入 0～365 的整數</span> : null}
            </label>
          </>
        )}
        <label className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-1.5"><Search size={14} className="shrink-0 text-slate-400" /><input ref={keywordInputRef} value={keywordDraft} disabled={disabled} onChange={event => { setKeywordDraft(event.target.value); change({ ...value, keyword: event.target.value }); }} onBlur={() => setKeywordDraft(value.keyword)} className="h-7 min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none" placeholder="搜尋任務名稱" aria-label="搜尋任務名稱" /></label>
      </section>

      <section className="space-y-1.5" data-task-filter-group="people">
        <div className="flex items-center justify-between gap-1.5"><label className="text-[11px] font-bold uppercase leading-4 text-slate-400">負責人/協作</label>{onClearPeople && value.people.mode !== 'all' ? <button type="button" onClick={onClearPeople} className="text-[10px] font-semibold text-slate-400 hover:text-slate-700">清除</button> : null}</div>
        <div className="flex flex-wrap gap-1.5">
          <AllChoice selected={value.people.mode === 'all'} onClick={() => selectAll('people')} disabled={disabled} />
          <button type="button" disabled={disabled || peopleOptionsStatus !== 'ready'} onClick={() => togglePerson(null)} className={getCompactChoiceClass(value.people.mode === 'all' || value.people.includeUnassigned, peopleOptionsStatus !== 'ready')} aria-pressed={value.people.mode === 'all' || value.people.includeUnassigned}>無負責人／協作者</button>
          {assigneeOptions.map(option => <button key={option.id} type="button" disabled={disabled || peopleOptionsStatus !== 'ready' || option.disabled} onClick={() => togglePerson(option.id)} className={getCompactChoiceClass(value.people.mode === 'all' || value.people.ids.includes(option.id), option.disabled || peopleOptionsStatus !== 'ready')} title={option.disabled ? option.disabledReason : undefined} aria-pressed={value.people.mode === 'all' || value.people.ids.includes(option.id)}><span className="max-w-[7rem] truncate">{option.label}</span></button>)}
        </div>
        {peopleOptionsStatus !== 'ready' ? <p className="text-[10px] text-amber-700">人員選項{peopleOptionsStatus === 'loading' ? '載入中' : '載入失敗'}；已保留目前選擇。</p> : ambiguousPeople ? <p className="text-[10px] text-slate-500">指定選項；新增項目不自動加入</p> : null}
      </section>

      <section className="space-y-1.5" data-task-filter-group="tags">
        <div className="flex items-center justify-between gap-1.5"><label className="text-[11px] font-bold uppercase leading-4 text-slate-400">標籤</label><div className="flex items-center gap-1.5">{tagActions}{onClearTags && value.tags.mode !== 'all' ? <button type="button" onClick={onClearTags} className="text-[10px] font-semibold text-slate-400 hover:text-slate-700">清除</button> : null}</div></div>
        <div className="flex flex-wrap gap-1.5">
          <AllChoice selected={value.tags.mode === 'all'} onClick={() => selectAll('tags')} disabled={disabled} />
          <button type="button" disabled={disabled || tagOptionsStatus !== 'ready'} onClick={() => toggleTag(null)} className={getCompactChoiceClass(value.tags.mode === 'all' || value.tags.includeUntagged, tagOptionsStatus !== 'ready')} aria-pressed={value.tags.mode === 'all' || value.tags.includeUntagged}>無標籤</button>
          {tags.map(tag => <button key={tag.id} type="button" disabled={disabled || tagOptionsStatus !== 'ready'} onClick={() => toggleTag(tag.id)} className={getCompactChoiceClass(value.tags.mode === 'all' || value.tags.ids.includes(tag.id), tagOptionsStatus !== 'ready')} aria-pressed={value.tags.mode === 'all' || value.tags.ids.includes(tag.id)}><span className="max-w-[9rem] truncate">{tag.name}</span></button>)}
        </div>
        {tagOptionsStatus !== 'ready' ? <p className="text-[10px] text-amber-700">標籤選項{tagOptionsStatus === 'loading' ? '載入中' : '載入失敗'}；已保留目前選擇。</p> : ambiguousTags ? <p className="text-[10px] text-slate-500">指定選項；新增項目不自動加入</p> : null}
      </section>
    </div>
  );
};

const CalendarControls: React.FC<CalendarProps> = ({ value, assigneeOptions, tags, onChange, unassignedDisabled = false, unassignedDisabledReason, showOverdueFilter = true, disabled = false }) => {
  const change = (next: LegacyTaskFilterQueryV5) => { if (!disabled) onChange(normalizeTaskFiltersV5(next)); };
  return (
    <div className="space-y-3" data-task-condition-filter-controls="true" data-task-filter-variant="calendar-v5">
      <section className="space-y-2"><label className="text-[11px] font-bold uppercase text-slate-400">任務狀態</label><div className="flex flex-wrap gap-2">{TASK_STATUS_OPTIONS.map(status => <button key={status.key} type="button" disabled={disabled} onClick={() => change({ ...value, statuses: value.statuses.includes(status.key) ? value.statuses.filter(item => item !== status.key) : [...value.statuses, status.key] })} className={getTaskStatusFilterChipClass(value.statuses.includes(status.key))} aria-pressed={value.statuses.includes(status.key)}>{status.label}</button>)}</div></section>
      <section className="space-y-2"><label className="text-[11px] font-bold uppercase text-slate-400">到期日與關鍵字</label><div className="flex flex-wrap gap-2">{showOverdueFilter ? <button type="button" disabled={disabled} onClick={() => change({ ...value, due: { ...value.due, includeOverdue: !value.due.includeOverdue } })} className={getTaskFilterChoiceClass(value.due.includeOverdue)} aria-pressed={value.due.includeOverdue} data-overdue-filter="true">逾期</button> : null}<button type="button" disabled={disabled} onClick={() => change({ ...value, due: { ...value.due, upcomingWithinDays: value.due.upcomingWithinDays === null ? 7 : null } })} className={getTaskFilterChoiceClass(value.due.upcomingWithinDays !== null)} aria-pressed={value.due.upcomingWithinDays !== null} data-upcoming-due-filter="true">到期</button><input type="number" min={0} max={365} disabled={disabled} value={value.due.upcomingWithinDays ?? ''} onChange={event => change({ ...value, due: { ...value.due, upcomingWithinDays: event.target.value === '' ? null : Number(event.target.value) } })} className={`${taskFilterFieldClass} w-16`} aria-label="到期天數" /></div><label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2"><Search size={14} className="text-slate-400" /><input value={value.keyword} onChange={event => change({ ...value, keyword: event.target.value })} className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="搜尋任務名稱" /></label></section>
      <section className="space-y-2"><label className="text-[11px] font-bold uppercase text-slate-400">負責人/協作</label><div className="flex flex-wrap gap-2"><button type="button" disabled={disabled || unassignedDisabled} title={unassignedDisabled ? unassignedDisabledReason : undefined} onClick={() => change({ ...value, people: { ...value.people, includeUnassigned: !value.people.includeUnassigned } })} className={getTaskFilterChoiceClass(value.people.includeUnassigned, unassignedDisabled)} aria-pressed={value.people.includeUnassigned}>未指派</button>{assigneeOptions.map(option => <button key={option.id} type="button" disabled={disabled || option.disabled} title={option.disabled ? option.disabledReason : undefined} onClick={() => change({ ...value, people: { ...value.people, ids: value.people.ids.includes(option.id) ? value.people.ids.filter(id => id !== option.id) : [...value.people.ids, option.id] } })} className={getTaskFilterChoiceClass(value.people.ids.includes(option.id), option.disabled)} aria-pressed={value.people.ids.includes(option.id)}>{option.label}</button>)}</div></section>
      <section className="space-y-2"><label className="text-[11px] font-bold uppercase text-slate-400">標籤</label><div className="flex flex-wrap gap-2">{tags.length === 0 ? <span className="text-xs text-slate-400">尚無標籤</span> : tags.map(tag => <button key={tag.id} type="button" disabled={disabled} onClick={() => change({ ...value, tagIds: value.tagIds.includes(tag.id) ? value.tagIds.filter(id => id !== tag.id) : [...value.tagIds, tag.id] })} className={getTaskFilterChoiceClass(value.tagIds.includes(tag.id))} aria-pressed={value.tagIds.includes(tag.id)}>{tag.name}</button>)}</div></section>
    </div>
  );
};

const TaskConditionFilterControls: React.FC<Props> = props => props.variant === 'calendar-v5' ? <CalendarControls {...props} /> : <MatrixControls {...props} />;
export default TaskConditionFilterControls;
