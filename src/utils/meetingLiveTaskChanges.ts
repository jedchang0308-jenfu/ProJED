import { serializeTaskMention } from './recordContentMentions';
import { taskNoteRichContentToPlainText } from './taskNoteRichContent';
import { getTaskAssigneeIds } from './taskAssignments';
import type {
  MeetingLiveAggregateValue,
  MeetingLiveContentValue,
  MeetingLiveCreatedValue,
  MeetingLiveDates,
  MeetingLiveFieldAggregate,
  MeetingLiveFieldKey,
  MeetingLiveTextFragment,
  TaskDetailNote,
  TaskNode,
} from '../types';

export type MeetingLiveFieldChange = {
  fieldKey: MeetingLiveFieldKey;
  before: unknown;
  after: unknown;
  beforeText?: string;
  afterText?: string;
};

const asText = (value: unknown): string => typeof value === 'string' ? value : '';

export const normalizeMeetingLiveText = (value: string): string => value
  .replace(/\r\n?/g, '\n')
  .replace(/\u00a0/g, ' ')
  .replace(/[ \t]+$/gm, '')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const canonicalIds = (value: unknown): string[] => Array.from(new Set(
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())) : [],
)).sort((left, right) => left.localeCompare(right));

const canonicalDates = (node: TaskNode): MeetingLiveDates => ({
  startDate: node.startDate ?? null,
  endDate: node.endDate ?? null,
  isDurationLocked: node.isDurationLocked ?? false,
});

const plainNote = (note: TaskDetailNote | undefined, fallback = '') => {
  if (!note) return normalizeMeetingLiveText(fallback);
  const richText = note.richContent ? taskNoteRichContentToPlainText(note.richContent) : '';
  return normalizeMeetingLiveText(richText || note.content || fallback);
};

const noteTextById = (node: TaskNode): Map<string, string> => {
  const notes = node.detailNotes?.length
    ? node.detailNotes
    : [{ id: 'note_default', title: '任務目的', content: node.description || '' }];
  return new Map(notes.map(note => [note.id, plainNote(note, note.id === 'note_default' ? node.description || '' : '')]));
};

const sameValue = (left: unknown, right: unknown): boolean => {
  if (Array.isArray(left) && Array.isArray(right)) {
    const a = canonicalIds(left);
    const b = canonicalIds(right);
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  return left === right;
};

const pushIfChanged = (
  changes: MeetingLiveFieldChange[],
  fieldKey: MeetingLiveFieldKey,
  before: unknown,
  after: unknown,
  beforeText?: string,
  afterText?: string,
) => {
  if (!sameValue(before, after)) changes.push({ fieldKey, before, after, beforeText, afterText });
};

/** Builds only allowlisted semantic deltas; placement/order/layout keys are intentionally ignored. */
export const getMeetingLiveFieldChanges = (
  before: TaskNode | null,
  after: TaskNode,
  changedKeys: Iterable<keyof TaskNode> = [],
): MeetingLiveFieldChange[] => {
  if (!before) {
    return [{ fieldKey: 'created', before: null, after: {
      title: normalizeMeetingLiveText(after.title),
      status: after.status,
      dates: canonicalDates(after),
      assigneeIds: getTaskAssigneeIds(after),
      collaboratorIds: canonicalIds(after.collaboratorIds),
      tagIds: canonicalIds(after.tagIds),
      isArchived: after.isArchived ?? false,
    } satisfies MeetingLiveCreatedValue }];
  }

  const keys = new Set(changedKeys);
  const changes: MeetingLiveFieldChange[] = [];
  if (keys.has('title')) pushIfChanged(changes, 'title', normalizeMeetingLiveText(before.title), normalizeMeetingLiveText(after.title));

  const notesChanged = keys.has('detailNotes');
  const descriptionChanged = keys.has('description');
  if (notesChanged) {
    const oldNotes = noteTextById(before);
    const newNotes = noteTextById(after);
    const noteIds = new Set([...oldNotes.keys(), ...newNotes.keys()]);
    noteIds.forEach(noteId => {
      const oldText = oldNotes.get(noteId) || '';
      const newText = newNotes.get(noteId) || '';
      pushIfChanged(changes, `detailNote:${noteId}`, oldText, newText, oldText, newText);
    });
  } else if (descriptionChanged) {
    const oldText = normalizeMeetingLiveText(before.description || '');
    const newText = normalizeMeetingLiveText(after.description || '');
    pushIfChanged(changes, 'description', oldText, newText, oldText, newText);
  }

  if (keys.has('status')) pushIfChanged(changes, 'status', before.status, after.status);
  if (keys.has('startDate') || keys.has('endDate') || keys.has('isDurationLocked')) {
    pushIfChanged(changes, 'dates', canonicalDates(before), canonicalDates(after));
  }
  if (keys.has('assigneeIds') || keys.has('assigneeId')) {
    pushIfChanged(changes, 'assignees', getTaskAssigneeIds(before), getTaskAssigneeIds(after));
  }
  if (keys.has('collaboratorIds')) {
    pushIfChanged(changes, 'collaborators', canonicalIds(before.collaboratorIds), canonicalIds(after.collaboratorIds));
  }
  if (keys.has('tagIds')) pushIfChanged(changes, 'tags', canonicalIds(before.tagIds), canonicalIds(after.tagIds));
  if (keys.has('isArchived')) pushIfChanged(changes, 'archived', before.isArchived ?? false, after.isArchived ?? false);
  return changes;
};

const getCrypto = () => {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle || typeof TextEncoder === 'undefined') {
    throw new Error('目前環境不支援 SHA-256 會議變更證據。');
  }
  return cryptoApi;
};

export const sha256Text = async (value: string): Promise<`sha256:${string}`> => {
  const digest = await getCrypto().subtle.digest('SHA-256', new TextEncoder().encode(value));
  const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return `sha256:${hex}`;
};

const boundedFragment = async (value: string): Promise<MeetingLiveTextFragment | null> => {
  const normalized = normalizeMeetingLiveText(value);
  if (!normalized) return null;
  const codePoints = Array.from(normalized);
  const truncated = codePoints.length > 120;
  const text = codePoints.slice(0, 120).join('');
  return {
    text,
    originalLength: codePoints.length,
    truncated,
    fingerprint: await sha256Text(normalized),
  };
};

const contentDiff = async (before: string, after: string): Promise<MeetingLiveContentValue> => {
  const oldText = normalizeMeetingLiveText(before);
  const newText = normalizeMeetingLiveText(after);
  const oldPoints = Array.from(oldText);
  const newPoints = Array.from(newText);
  let prefix = 0;
  while (prefix < oldPoints.length && prefix < newPoints.length && oldPoints[prefix] === newPoints[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < oldPoints.length - prefix
    && suffix < newPoints.length - prefix
    && oldPoints[oldPoints.length - suffix - 1] === newPoints[newPoints.length - suffix - 1]
  ) suffix += 1;
  const removed = oldPoints.slice(prefix, oldPoints.length - suffix).join('');
  const added = newPoints.slice(prefix, newPoints.length - suffix).join('');
  const [removedFragment, addedFragment] = await Promise.all([boundedFragment(removed), boundedFragment(added)]);
  return {
    kind: 'content_delta',
    baselineHash: await sha256Text(oldText),
    latestHash: await sha256Text(newText),
    addedFragments: addedFragment ? [addedFragment] : [],
    removedFragments: removedFragment ? [removedFragment] : [],
  };
};

export const buildMeetingLiveContentValue = (before: string, after: string) => contentDiff(before, after);

export const createMeetingLiveAggregateValue = async (
  change: MeetingLiveFieldChange,
  baselineText?: string,
): Promise<MeetingLiveAggregateValue> => {
  if (change.fieldKey === 'created') return { kind: 'created', latest: change.after as MeetingLiveCreatedValue };
  if (change.fieldKey === 'description' || change.fieldKey.startsWith('detailNote:')) {
    return buildMeetingLiveContentValue(baselineText ?? change.beforeText ?? asText(change.before), change.afterText ?? asText(change.after));
  }
  if (change.fieldKey === 'dates') return { kind: 'dates', baseline: change.before as MeetingLiveDates, latest: change.after as MeetingLiveDates };
  if (change.fieldKey === 'assignees' || change.fieldKey === 'collaborators' || change.fieldKey === 'tags') {
    return { kind: 'id_list', baseline: canonicalIds(change.before), latest: canonicalIds(change.after) };
  }
  return {
    kind: 'scalar',
    baseline: typeof change.before === 'string' || typeof change.before === 'boolean' ? change.before : change.before == null ? null : String(change.before),
    latest: typeof change.after === 'string' || typeof change.after === 'boolean' ? change.after : change.after == null ? null : String(change.after),
  };
};

const formatValue = (fieldKey: MeetingLiveFieldKey, value: unknown): string => {
  if (fieldKey === 'status') {
    const labels: Record<string, string> = { todo: '待辦', in_progress: '進行中', delayed: '延遲', completed: '已完成', unsure: '未確認', onhold: '暫停' };
    return labels[String(value)] ?? String(value);
  }
  if (fieldKey === 'archived') return value ? '已封存' : '未封存';
  if (fieldKey === 'dates' && value && typeof value === 'object') {
    const date = value as MeetingLiveDates;
    return `${date.startDate || '未設定'} 至 ${date.endDate || '未設定'}`;
  }
  if (Array.isArray(value)) return value.length ? value.join('、') : '未指派';
  return value == null || value === '' ? '未設定' : String(value);
};

const fieldLabel = (fieldKey: MeetingLiveFieldKey) => {
  if (fieldKey === 'title') return '名稱';
  if (fieldKey === 'description') return '任務目的';
  if (fieldKey.startsWith('detailNote:')) return '備註';
  if (fieldKey === 'status') return '狀態';
  if (fieldKey === 'dates') return '日期';
  if (fieldKey === 'assignees') return '主責';
  if (fieldKey === 'collaborators') return '協作';
  if (fieldKey === 'tags') return '標籤';
  if (fieldKey === 'archived') return '封存狀態';
  return '任務';
};

export const formatMeetingLiveAggregateLine = (aggregate: MeetingLiveFieldAggregate): string => {
  const mention = serializeTaskMention(aggregate.nodeId, aggregate.taskTitle || aggregate.nodeId);
  if (aggregate.fieldKey === 'created') return `- 會中變更｜${mention}：新增任務`;
  if (aggregate.value.kind === 'content_delta') {
    const added = aggregate.value.addedFragments.map(fragment => `新增「${fragment.text}${fragment.truncated ? '…' : ''}」`).join('；');
    const removed = aggregate.value.removedFragments.map(fragment => `移除「${fragment.text}${fragment.truncated ? '…' : ''}」`).join('；');
    const detail = [added, removed].filter(Boolean).join('；') || '內容已更新';
    return `- 會中變更｜${mention}：${fieldLabel(aggregate.fieldKey)}${detail}`;
  }
  const before = aggregate.value.kind === 'created' ? '未設定' : formatValue(aggregate.fieldKey, aggregate.value.baseline);
  const after = aggregate.value.kind === 'created' ? formatValue(aggregate.fieldKey, aggregate.value.latest) : formatValue(aggregate.fieldKey, aggregate.value.latest);
  return `- 會中變更｜${mention}：${fieldLabel(aggregate.fieldKey)}「${before}」→「${after}」`;
};

export const isMeetingLiveAggregateNoop = (aggregate: MeetingLiveFieldAggregate): boolean => {
  if (aggregate.value.kind === 'content_delta') return aggregate.value.baselineHash === aggregate.value.latestHash;
  if (aggregate.value.kind === 'created') return false;
  return JSON.stringify(aggregate.value.baseline) === JSON.stringify(aggregate.value.latest);
};

export const meetingLiveFingerprint = async (value: string) => sha256Text(value);

export const getMeetingLiveContentBaseline = (change: MeetingLiveFieldChange) =>
  normalizeMeetingLiveText(change.beforeText ?? asText(change.before));

export const isMeetingLiveContentField = (fieldKey: MeetingLiveFieldKey) =>
  fieldKey === 'description' || fieldKey.startsWith('detailNote:');
