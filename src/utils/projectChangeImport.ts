import type { ActivityEvent, ActivityEventType, TaskNode } from '../types';
import { extractTaskMentionIds } from './recordContentMentions';
import { MEETING_RECORD_TASKS_HEADING, isMeetingRecordScaffoldLine } from './meetingRecordScaffold';
import { appendLineToMarkdownSection } from './meetingTaskDiscussion';
import type { MeetingSynthesisActivity, MeetingSynthesisInput, MeetingSynthesisTask } from './meetingRecordSynthesis';

export type ProjectChangeScope = 'board' | 'workspace';

export const PROJECT_CHANGE_EVENT_TYPES: ActivityEventType[] = [
  'task_created',
  'task_assigned',
  'task_collaborators_changed',
  'task_status_changed',
  'task_moved',
  'task_dates_changed',
  'task_archived',
  'task_restored',
  'task_tags_changed',
];

const statusLabels: Record<string, string> = {
  todo: '待辦',
  in_progress: '進行中',
  completed: '已完成',
  delayed: '延遲',
  unsure: '未確認',
  onhold: '暫停',
};

const formatStatus = (status: unknown) =>
  typeof status === 'string' ? statusLabels[status] ?? status : '未設定';

const formatDateRange = (value: unknown) => {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const start = typeof record.startDate === 'string' && record.startDate ? record.startDate : '未設定';
  const end = typeof record.endDate === 'string' && record.endDate ? record.endDate : '未設定';
  return `${start} 至 ${end}`;
};

const getSidePayload = (payload: Record<string, unknown>, side: 'before' | 'after') =>
  payload[side] && typeof payload[side] === 'object'
    ? payload[side] as Record<string, unknown>
    : {};

export const getProjectChangeNodeId = (event: ActivityEvent) => {
  const taskId = event.payload.taskId;
  const legacyEntityId = event.payload.legacyEntityId;
  if (typeof taskId === 'string' && taskId) return taskId;
  if (typeof legacyEntityId === 'string' && legacyEntityId) return legacyEntityId;
  return event.entityId ?? event.id ?? 'unknown-task';
};

export const getProjectChangeTitle = (event: ActivityEvent, nodes: Record<string, TaskNode>) => {
  const nodeId = getProjectChangeNodeId(event);
  const taskTitle = event.payload.taskTitle;
  if (nodes[nodeId]?.title) return nodes[nodeId].title;
  if (typeof taskTitle === 'string' && taskTitle) return taskTitle;
  return nodeId;
};

export const summarizeProjectChangeEvent = (event: ActivityEvent) => {
  const payload = event.payload ?? {};
  if (event.eventType === 'task_created') return '新增任務。';
  if (event.eventType === 'task_status_changed') {
    const before = getSidePayload(payload, 'before');
    const after = getSidePayload(payload, 'after');
    return `狀態由「${formatStatus(before.status)}」改為「${formatStatus(after.status)}」。`;
  }
  if (event.eventType === 'task_dates_changed') {
    return `日期由「${formatDateRange(payload.before)}」改為「${formatDateRange(payload.after)}」。`;
  }
  if (event.eventType === 'task_assigned') return '負責人已更新。';
  if (event.eventType === 'task_collaborators_changed') return '協作者已更新。';
  if (event.eventType === 'task_moved') return '任務位置已調整。';
  if (event.eventType === 'task_tags_changed') return '標籤已更新。';
  if (event.eventType === 'task_archived') return '任務已封存。';
  if (event.eventType === 'task_restored') return '任務已還原。';
  return '任務已更新。';
};

const getTaskPath = (
  nodeId: string,
  nodes: Record<string, TaskNode>,
  fallbackTitle: string,
): Array<{ id: string; title: string }> => {
  const path: Array<{ id: string; title: string }> = [];
  const visited = new Set<string>();
  let current: TaskNode | undefined = nodes[nodeId];

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift({ id: current.id, title: current.title || current.id });
    current = current.parentId ? nodes[current.parentId] : undefined;
  }

  return path.length ? path : [{ id: nodeId, title: fallbackTitle }];
};

const createTask = (
  nodeId: string,
  nodes: Record<string, TaskNode>,
  fallbackTitle: string,
): MeetingSynthesisTask => {
  const node = nodes[nodeId];
  const title = node?.title || fallbackTitle || nodeId;
  const path = getTaskPath(nodeId, nodes, title);
  const group = path[0] || { id: nodeId, title };
  return {
    id: nodeId,
    title,
    parentId: node?.parentId ?? null,
    path,
    depth: Math.max(0, path.findIndex(item => item.id === nodeId)),
    groupId: group.id,
    groupTitle: group.title,
    order: typeof node?.order === 'number' ? node.order : undefined,
  };
};

export const createProjectChangeSynthesisInput = (
  title: string,
  events: ActivityEvent[],
  nodes: Record<string, TaskNode>,
): MeetingSynthesisInput => {
  const activities: MeetingSynthesisActivity[] = events.map(event => {
    const nodeId = getProjectChangeNodeId(event);
    return {
      eventType: event.eventType,
      nodeId,
      title: getProjectChangeTitle(event, nodes),
      occurredAt: event.createdAt ?? Date.now(),
      summary: summarizeProjectChangeEvent(event),
      payload: event.payload,
    };
  });
  const taskMap = new Map<string, MeetingSynthesisTask>();

  activities.forEach(activity => {
    const task = createTask(activity.nodeId, nodes, activity.title);
    taskMap.set(task.id, task);
    task.path?.forEach(pathItem => {
      if (!taskMap.has(pathItem.id)) {
        taskMap.set(pathItem.id, createTask(pathItem.id, nodes, pathItem.title));
      }
    });
  });

  return {
    title,
    rawContent: '',
    taskLinks: activities.map(activity => ({ nodeId: activity.nodeId, role: 'related' })),
    tasks: Array.from(taskMap.values()),
    activities,
    occurredAt: Date.now(),
  };
};

export const PROJECT_CHANGE_IMPORT_BLOCK_START = '[專案變化匯入開始]';
export const PROJECT_CHANGE_IMPORT_BLOCK_END = '[專案變化匯入結束]';
export const PROJECT_CHANGE_IMPORT_BLOCK_TITLE = '## 專案變化匯入';
const PROJECT_CHANGE_IMPORT_PROTECTED_NOTE = '受保護來源：AI整理需統整此區塊，不得刪除其任務證據。';
const PROJECT_CHANGE_IMPORT_FALLBACK_TITLE = '專案變化補充';

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeProjectChangeText = (value: string) =>
  value
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const extractSectionBody = (content: string, heading: string) => {
  const normalizedContent = content.replace(/\r\n?/g, '\n');
  const headingPattern = new RegExp(`(?:^|\\n)${escapeRegExp(heading)}\\n`);
  const match = headingPattern.exec(normalizedContent);
  if (!match) return '';

  const insertSearchStart = match.index + match[0].length;
  const rest = normalizedContent.slice(insertSearchStart);
  const nextHeadingOffset = rest.search(/\n(?:#{1,6}\s+|\d+\.\s+)/);
  const body = nextHeadingOffset === -1 ? rest : rest.slice(0, nextHeadingOffset);
  return normalizeProjectChangeText(body);
};

const normalizeProjectChangeFingerprint = (value: string) =>
  normalizeProjectChangeText(value)
    .replace(new RegExp(escapeRegExp(PROJECT_CHANGE_IMPORT_BLOCK_START), 'g'), '')
    .replace(new RegExp(escapeRegExp(PROJECT_CHANGE_IMPORT_BLOCK_END), 'g'), '')
    .replace(new RegExp(escapeRegExp(PROJECT_CHANGE_IMPORT_BLOCK_TITLE), 'g'), '')
    .replace(/受保護內容：AI整理不得刪除此區塊。/g, '')
    .replace(new RegExp(escapeRegExp(PROJECT_CHANGE_IMPORT_PROTECTED_NOTE), 'g'), '')
    .replace(/\s+/g, ' ')
    .trim();

const isMeetingSectionHeading = (line: string) =>
  /^1\.\s+/.test(line) ||
  /^2\.\s+/.test(line) ||
  /^3\.\s+/.test(line);

const isProofreadPlaceholder = (line: string) =>
  /請確認上述整理是否符合會議實際發言與操作/.test(line);

const normalizeRenderedMeetingLineAsEvidence = (line: string) => {
  const trimmed = line.trim();
  if (!trimmed) return '';
  if (trimmed === PROJECT_CHANGE_IMPORT_BLOCK_START) return '';
  if (trimmed === PROJECT_CHANGE_IMPORT_BLOCK_END) return '';
  if (trimmed === PROJECT_CHANGE_IMPORT_BLOCK_TITLE) return '';
  if (trimmed === PROJECT_CHANGE_IMPORT_PROTECTED_NOTE) return '';
  if (trimmed === '受保護內容：AI整理不得刪除此區塊。') return '';
  if (isProofreadPlaceholder(trimmed)) return '';
  if (isMeetingRecordScaffoldLine(trimmed)) return '';
  if (isMeetingSectionHeading(trimmed)) return '';
  return trimmed.replace(/^\d+(?:\.\d+)+\s+/, '- ');
};

export const normalizeProjectChangeImportEvidence = (content: string) =>
  normalizeProjectChangeText(
    content
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map(normalizeRenderedMeetingLineAsEvidence)
      .filter(Boolean)
      .join('\n'),
  );

export const extractProjectChangeImportTaskDiscussionBody = (content: string) =>
  extractSectionBody(content, MEETING_RECORD_TASKS_HEADING) || normalizeProjectChangeImportEvidence(content);

export const normalizeProjectChangeDraftContent = (content: string) => {
  const legacyBlocks = extractProjectChangeImportBlocks(content);
  if (legacyBlocks.length === 0) return content;

  const cleanedContent = stripProjectChangeImportBlocks(content);
  const legacyBodies = uniqueBlocks(legacyBlocks.map(block => normalizeProjectChangeImportEvidence(block)).filter(Boolean));
  if (legacyBodies.length === 0) return cleanedContent;

  const combinedBody = normalizeProjectChangeText(legacyBodies.join('\n\n'));
  const normalizedContent = cleanedContent.replace(/\s+/g, ' ').trim();
  const normalizedBody = combinedBody.replace(/\s+/g, ' ').trim();
  if (normalizedContent.includes(normalizedBody)) return cleanedContent;

  return appendLineToMarkdownSection(cleanedContent, MEETING_RECORD_TASKS_HEADING, combinedBody);
};

const uniqueBlocks = (blocks: string[]) => {
  const seen = new Set<string>();
  const nextBlocks: string[] = [];

  blocks.forEach(block => {
    const normalized = normalizeProjectChangeFingerprint(block);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    nextBlocks.push(normalizeProjectChangeText(block));
  });

  return nextBlocks;
};

export const wrapProjectChangeImportContent = (previewContent: string) => {
  const body = normalizeProjectChangeImportEvidence(previewContent);
  if (!body) return '';
  if (body.includes(PROJECT_CHANGE_IMPORT_BLOCK_START) && body.includes(PROJECT_CHANGE_IMPORT_BLOCK_END)) {
    return body;
  }

  return [
    PROJECT_CHANGE_IMPORT_BLOCK_START,
    PROJECT_CHANGE_IMPORT_BLOCK_TITLE,
    PROJECT_CHANGE_IMPORT_PROTECTED_NOTE,
    '',
    body,
    PROJECT_CHANGE_IMPORT_BLOCK_END,
  ].join('\n');
};

export const extractProjectChangeImportBlocks = (content: string) => {
  const normalizedContent = content.replace(/\r\n?/g, '\n');
  const markerPattern = new RegExp(
    `${escapeRegExp(PROJECT_CHANGE_IMPORT_BLOCK_START)}[\\s\\S]*?${escapeRegExp(PROJECT_CHANGE_IMPORT_BLOCK_END)}`,
    'g',
  );
  const markerBlocks = Array.from(normalizedContent.matchAll(markerPattern), match => match[0]);

  if (markerBlocks.length > 0) return uniqueBlocks(markerBlocks);

  const titlePattern = new RegExp(
    `(?:^|\\n)${escapeRegExp(PROJECT_CHANGE_IMPORT_BLOCK_TITLE)}[\\s\\S]*?(?=\\n##\\s+|\\n\\d+\\.\\s+|$)`,
    'g',
  );
  return uniqueBlocks(Array.from(normalizedContent.matchAll(titlePattern), match => match[0]));
};

export const extractProjectChangeImportEvidenceBlocks = (content: string) =>
  uniqueBlocks(
    extractProjectChangeImportBlocks(content)
      .map(normalizeProjectChangeImportEvidence)
      .filter(Boolean),
  );

export const stripProjectChangeImportBlocks = (content: string) => {
  const normalizedContent = content.replace(/\r\n?/g, '\n');
  const markerPattern = new RegExp(
    `\\n*${escapeRegExp(PROJECT_CHANGE_IMPORT_BLOCK_START)}[\\s\\S]*?${escapeRegExp(PROJECT_CHANGE_IMPORT_BLOCK_END)}\\n*`,
    'g',
  );
  return normalizeProjectChangeText(normalizedContent.replace(markerPattern, '\n\n'));
};

const getNextTaskDiscussionNumber = (content: string) => {
  const matches = Array.from(content.matchAll(/^2\.(\d+)\s+/gm), match => Number(match[1]));
  const max = matches.length ? Math.max(...matches.filter(Number.isFinite)) : 0;
  return `2.${max + 1}`;
};

const insertProjectChangeFallbackIntoSingleRecord = (
  content: string,
  fallbackEvidence: string[],
) => {
  const evidenceText = normalizeProjectChangeText(fallbackEvidence.join('\n'));
  if (!evidenceText) return content;

  const fallbackSection = [
    `${getNextTaskDiscussionNumber(content)} ${PROJECT_CHANGE_IMPORT_FALLBACK_TITLE}`,
    evidenceText,
  ].join('\n');
  const proofreadMatch = /\n3\.\s+/.exec(content);
  if (!proofreadMatch) return normalizeProjectChangeText([content, fallbackSection].join('\n\n'));

  return normalizeProjectChangeText([
    content.slice(0, proofreadMatch.index),
    fallbackSection,
    content.slice(proofreadMatch.index),
  ].join('\n\n'));
};

export const mergeProjectChangeImportBlocks = (
  aiContent: string,
  preservedContent: string,
) => {
  const preservedEvidenceBlocks = extractProjectChangeImportEvidenceBlocks(preservedContent);
  const strippedAiContent = stripProjectChangeImportBlocks(aiContent);
  const aiTaskMentionIds = new Set(extractTaskMentionIds(strippedAiContent));
  const aiFingerprint = normalizeProjectChangeFingerprint(strippedAiContent);
  const missingEvidence = preservedEvidenceBlocks.filter(block => {
    const blockTaskMentionIds = extractTaskMentionIds(block);
    if (blockTaskMentionIds.length > 0 && blockTaskMentionIds.every(nodeId => aiTaskMentionIds.has(nodeId))) {
      return false;
    }

    const blockFingerprint = normalizeProjectChangeFingerprint(block);
    return Boolean(blockFingerprint && !aiFingerprint.includes(blockFingerprint));
  });

  return insertProjectChangeFallbackIntoSingleRecord(strippedAiContent, missingEvidence);
};
