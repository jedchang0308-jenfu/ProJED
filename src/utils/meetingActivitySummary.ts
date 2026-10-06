export type ActivitySummaryResolvers = {
  memberNameById?: ReadonlyMap<string, string>;
  tagNameById?: ReadonlyMap<string, string>;
};

const statusLabels: Record<string, string> = {
  todo: '待辦',
  in_progress: '進行中',
  completed: '已完成',
  delayed: '延遲',
  unsure: '未確認',
  onhold: '暫停',
};

const getSidePayload = (payload: Record<string, unknown>, side: 'before' | 'after') => {
  const value = payload[side];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
};

const getIds = (side: Record<string, unknown>, pluralKey: string, singularKey?: string) => {
  const pluralValue = side[pluralKey];
  if (Array.isArray(pluralValue)) {
    return pluralValue.filter((value): value is string => typeof value === 'string' && value.length > 0);
  }

  const singularValue = singularKey ? side[singularKey] : undefined;
  return typeof singularValue === 'string' && singularValue ? [singularValue] : [];
};

const getSnapshotNames = (side: Record<string, unknown>, namesKey: string) => {
  const names = side[namesKey];
  return Array.isArray(names)
    ? names.map(value => typeof value === 'string' && value.trim() ? value.trim() : '')
    : [];
};

const formatEntityNames = (
  ids: string[],
  snapshotNames: string[],
  resolver: ReadonlyMap<string, string> | undefined,
  emptyLabel: string,
  unknownLabel: string,
) => {
  if (ids.length === 0) return emptyLabel;

  return ids.map((id, index) =>
    snapshotNames[index] || resolver?.get(id) || unknownLabel
  ).join('、');
};

const formatStatus = (status: unknown) =>
  typeof status === 'string' && status ? statusLabels[status] ?? status : '未設定';

const formatDateValue = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : '未設定';

const formatDateRange = (value: Record<string, unknown>) =>
  `${formatDateValue(value.startDate)} 至 ${formatDateValue(value.endDate)}`;

const formatDateChange = (before: Record<string, unknown>, after: Record<string, unknown>) => {
  const beforeStart = formatDateValue(before.startDate);
  const afterStart = formatDateValue(after.startDate);
  const beforeEnd = formatDateValue(before.endDate);
  const afterEnd = formatDateValue(after.endDate);
  const startChanged = beforeStart !== afterStart;
  const endChanged = beforeEnd !== afterEnd;

  if (!startChanged && !endChanged) return '';
  if (startChanged && !endChanged) {
    if (afterStart === '未設定') return `開始日已取消（原為「${beforeStart}」）。`;
    if (beforeStart === '未設定') return `開始日設定為「${afterStart}」。`;
    return `開始日由「${beforeStart}」改為「${afterStart}」。`;
  }
  if (!startChanged && endChanged) {
    if (afterEnd === '未設定') return `到期日已取消（原為「${beforeEnd}」）。`;
    if (beforeEnd === '未設定') return `到期日設定為「${afterEnd}」。`;
    return `到期日由「${beforeEnd}」改為「${afterEnd}」。`;
  }
  return `日期由「${formatDateRange(before)}」改為「${formatDateRange(after)}」。`;
};

const formatSetChange = (
  label: string,
  before: string,
  after: string,
) => `${label}由「${before}」改為「${after}」。`;

export const summarizeTaskActivity = (
  eventType: string,
  payload: Record<string, unknown> = {},
  resolvers: ActivitySummaryResolvers = {},
) => {
  if (eventType === 'task_created') return '新增任務。';

  const before = getSidePayload(payload, 'before');
  const after = getSidePayload(payload, 'after');

  if (eventType === 'task_status_changed') {
    return `狀態由「${formatStatus(before.status)}」改為「${formatStatus(after.status)}」。`;
  }

  if (eventType === 'task_dates_changed') return formatDateChange(before, after);

  if (eventType === 'task_assigned') {
    const beforeIds = getIds(before, 'assigneeIds', 'assigneeId');
    const afterIds = getIds(after, 'assigneeIds', 'assigneeId');
    return formatSetChange(
      '負責人',
      formatEntityNames(beforeIds, getSnapshotNames(before, 'assigneeNames'), resolvers.memberNameById, '未指派', '已離開成員'),
      formatEntityNames(afterIds, getSnapshotNames(after, 'assigneeNames'), resolvers.memberNameById, '未指派', '已離開成員'),
    );
  }

  if (eventType === 'task_collaborators_changed') {
    const beforeIds = getIds(before, 'collaboratorIds');
    const afterIds = getIds(after, 'collaboratorIds');
    return formatSetChange(
      '協作者',
      formatEntityNames(beforeIds, getSnapshotNames(before, 'collaboratorNames'), resolvers.memberNameById, '無', '已離開成員'),
      formatEntityNames(afterIds, getSnapshotNames(after, 'collaboratorNames'), resolvers.memberNameById, '無', '已離開成員'),
    );
  }

  if (eventType === 'task_tags_changed') {
    const beforeIds = getIds(before, 'tagIds');
    const afterIds = getIds(after, 'tagIds');
    return formatSetChange(
      '標籤',
      formatEntityNames(beforeIds, getSnapshotNames(before, 'tagNames'), resolvers.tagNameById, '無', '已刪除標籤'),
      formatEntityNames(afterIds, getSnapshotNames(after, 'tagNames'), resolvers.tagNameById, '無', '已刪除標籤'),
    );
  }

  if (eventType === 'task_moved') return '任務位置已調整。';
  if (eventType === 'task_archived') return '任務已封存。';
  if (eventType === 'task_restored') return '任務已還原。';
  return '任務已更新。';
};
