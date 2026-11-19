import type { TaskNode } from '../types';
import dayjs from 'dayjs';
import { getTaskAssigneeIds } from '../utils/taskAssignments';
import { arePersistedValuesEqual } from '../utils/taskPersistenceConvergence';
import { normalizeManualTaskStatus } from '../utils/taskStatus';

export const TASK_DETAILS_DRAFT_KEYS = [
  'title', 'startDate', 'endDate', 'status', 'isDurationLocked',
  'assigneeIds', 'collaboratorIds', 'tagIds',
] as const;
export type TaskDetailsDraftKey = typeof TASK_DETAILS_DRAFT_KEYS[number];
export type TaskDetailsFields = Pick<TaskNode, TaskDetailsDraftKey>;

/** Normalize legacy/optional values before comparing the user's field drafts. */
export const taskDetailsFieldsFromNode = (node?: TaskNode): TaskDetailsFields => ({
  title: node?.title ?? '',
  startDate: node?.startDate ?? '',
  endDate: node?.endDate ?? '',
  status: normalizeManualTaskStatus(node?.status),
  isDurationLocked: Boolean(node?.isDurationLocked),
  assigneeIds: getTaskAssigneeIds(node),
  collaboratorIds: node?.collaboratorIds ?? [],
  tagIds: node?.tagIds ?? [],
});

export const taskDetailsFieldEqual = (
  key: TaskDetailsDraftKey,
  left: unknown,
  right: unknown,
): boolean => {
  if (key === 'assigneeIds') {
    // The first primary assignee is also persisted as legacy assigneeId.
    return arePersistedValuesEqual(left ?? [], right ?? []);
  }
  if (key === 'collaboratorIds' || key === 'tagIds') {
    const normalize = (value: unknown) => Array.isArray(value) ? [...new Set(value)].sort() : [];
    return arePersistedValuesEqual(normalize(left), normalize(right));
  }
  return arePersistedValuesEqual(left, right);
};

export const taskDetailsDraftConflicts = (
  draft: Partial<TaskDetailsFields>,
  baseline: TaskDetailsFields,
  latest: TaskDetailsFields,
): TaskDetailsDraftKey[] => TASK_DETAILS_DRAFT_KEYS.filter(key => (
  Object.prototype.hasOwnProperty.call(draft, key)
  && !taskDetailsFieldEqual(key, baseline[key], latest[key])
  && !taskDetailsFieldEqual(key, draft[key], latest[key])
));

export const classifyTaskDetailsReadback = (
  submitted: Partial<TaskDetailsFields>,
  baseline: TaskDetailsFields,
  latest: TaskDetailsFields | null,
) => {
  const confirmed: TaskDetailsDraftKey[] = [];
  const unchanged: TaskDetailsDraftKey[] = [];
  const conflicts: TaskDetailsDraftKey[] = [];
  for (const key of TASK_DETAILS_DRAFT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(submitted, key)) continue;
    if (!latest) conflicts.push(key);
    else if (taskDetailsFieldEqual(key, submitted[key], latest[key])) confirmed.push(key);
    else if (taskDetailsFieldEqual(key, baseline[key], latest[key])) unchanged.push(key);
    else conflicts.push(key);
  }
  return { confirmed, unchanged, conflicts };
};

/** Validate the submitted dates against current values of untouched fields. */
export const isTaskDetailsDateDraftValid = (
  draft: Partial<TaskDetailsFields>,
  latest: TaskDetailsFields,
): boolean => {
  if (!['startDate', 'endDate', 'isDurationLocked'].some(key => Object.prototype.hasOwnProperty.call(draft, key))) return true;
  const merged = { ...latest, ...draft };
  if (merged.startDate && !dayjs(merged.startDate).isValid()) return false;
  if (merged.endDate && !dayjs(merged.endDate).isValid()) return false;
  if (merged.startDate && merged.endDate && merged.startDate > merged.endDate) return false;
  return !merged.isDurationLocked || Boolean(merged.startDate);
};
