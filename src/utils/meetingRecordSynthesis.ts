import { serializeTaskMention, TASK_MENTION_PATTERN } from './recordContentMentions';
import { summarizeTaskActivity } from './meetingActivitySummary';

export type MeetingSynthesisTask = {
  id: string;
  title: string;
  parentId?: string | null;
  path?: Array<{ id: string; title: string }>;
  depth?: number;
  groupId?: string;
  groupTitle?: string;
  order?: number;
  status?: string;
  description?: string;
  detailNotesText?: string;
  startDate?: string;
  endDate?: string;
};

export type MeetingSynthesisActivity = {
  eventType: string;
  nodeId: string;
  title: string;
  occurredAt: number;
  summary: string;
  payload?: Record<string, unknown>;
};

export type MeetingSynthesisInput = {
  title: string;
  participantsText?: string;
  rawContent: string;
  taskLinks: Array<{ nodeId: string; role: string }>;
  tasks: MeetingSynthesisTask[];
  activities: MeetingSynthesisActivity[];
  occurredAt?: number;
  requiredContractVersion?: string;
};

export const MEETING_SYNTHESIS_CONTRACT_VERSION = 'meeting-synthesis-v2';
export const LOCAL_MEETING_SYNTHESIS_FUNCTION_VERSION = 'local-deterministic-2026-08-07-v3';

export type MeetingSynthesisNormalizationStats = {
  receivedActivityCount: number;
  acceptedActivityCount: number;
  droppedActivityCount: number;
};

export type MeetingSynthesisQualityReport = {
  passed: boolean;
  checks: string[];
  violations: string[];
};

export type MeetingSynthesisResponse = {
  content: string;
  warnings: string[];
  linkedTaskIds: string[];
  provider: string;
  model?: string;
  contractVersion: string;
  functionVersion: string;
  runId: string;
  generatedAt: string;
  normalization: MeetingSynthesisNormalizationStats;
  quality: MeetingSynthesisQualityReport;
};

const normalizeText = (value: string | undefined) =>
  (value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const truncate = (value: string, maxLength: number) => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
};

const unique = <T,>(items: T[]) => Array.from(new Set(items));

const createSynthesisRunId = () =>
  typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `meeting_synthesis_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

const ensureSentence = (value: string) => {
  const text = normalizeText(value);
  if (!text) return '';
  return /[。.!?！？]$/.test(text) ? text : `${text}。`;
};

const stripTaskMentions = (value: string) => {
  TASK_MENTION_PATTERN.lastIndex = 0;
  return value.replace(TASK_MENTION_PATTERN, '');
};

const LOW_VALUE_MEETING_ACTIVITY_PATTERNS = [
  /^(任務)?位置已調整[。.]?$/,
  /^(任務)?順序已調整[。.]?$/,
  /^(任務)?已移動[。.]?$/,
  /^(任務)?已重新排列[。.]?$/,
  /^區塊已更新[。.]?$/,
];

const meetingStatusLabels: Record<string, string> = {
  todo: '待辦',
  in_progress: '進行中',
  completed: '已完成',
  delayed: '延遲',
  unsure: '未確認',
  onhold: '暫停',
};

const getActivitySide = (
  activity: Pick<MeetingSynthesisActivity, 'payload'>,
  side: 'before' | 'after',
) => {
  const value = activity.payload?.[side];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
};

const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const getActivityComparableKeys = (eventType: string, before: Record<string, unknown>, after: Record<string, unknown>) => {
  const preferredKeys: Record<string, string[]> = {
    task_status_changed: ['status'],
    task_dates_changed: ['startDate', 'endDate'],
    task_assigned: ['assigneeIds', 'assigneeId'],
    task_collaborators_changed: ['collaboratorIds'],
    task_tags_changed: ['tagIds'],
    task_archived: ['isArchived'],
    task_restored: ['isArchived'],
  };
  const keys = preferredKeys[eventType] ?? Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  return keys.filter(key => key in before || key in after);
};

const hasComparablePayload = (activity: MeetingSynthesisActivity) => {
  const before = getActivitySide(activity, 'before');
  const after = getActivitySide(activity, 'after');
  return getActivityComparableKeys(activity.eventType, before, after).length > 0;
};

const hasMeaningfulPayloadChange = (activity: MeetingSynthesisActivity) => {
  const before = getActivitySide(activity, 'before');
  const after = getActivitySide(activity, 'after');
  const keys = getActivityComparableKeys(activity.eventType, before, after);
  return keys.length > 0 && keys.some(key => stableSerialize(before[key]) !== stableSerialize(after[key]));
};

const getActivityFingerprint = (activity: MeetingSynthesisActivity) => {
  const before = getActivitySide(activity, 'before');
  const after = getActivitySide(activity, 'after');
  const keys = getActivityComparableKeys(activity.eventType, before, after);
  if (keys.length > 0) {
    return [
      activity.eventType,
      activity.nodeId,
      ...keys.map(key => `${key}:${stableSerialize(before[key])}:${stableSerialize(after[key])}`),
    ].join('|');
  }

  return `${activity.eventType}|${activity.nodeId}|${normalizeText(stripTaskMentions(activity.summary))}`;
};

const formatDateValue = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : '未設定';

const formatDateRange = (value: Record<string, unknown>) =>
  `${formatDateValue(value.startDate)} 至 ${formatDateValue(value.endDate)}`;

const formatStatusValue = (value: unknown) =>
  typeof value === 'string' && value ? meetingStatusLabels[value] ?? value : '未設定';

const formatSingleDateChange = (label: string, before: unknown, after: unknown) => {
  const previous = formatDateValue(before);
  const next = formatDateValue(after);
  if (previous === next) return '';
  if (next === '未設定') return `${label}已取消（原為「${previous}」）。`;
  if (previous === '未設定') return `${label}設定為「${next}」。`;
  return `${label}由「${previous}」改為「${next}」。`;
};

const formatActivityNarrative = (activity: MeetingSynthesisActivity) => {
  if (isLowValueMeetingActivitySummary(activity.summary) || hasComparablePayload(activity) && !hasMeaningfulPayloadChange(activity)) {
    return '';
  }

  const before = getActivitySide(activity, 'before');
  const after = getActivitySide(activity, 'after');

  if (activity.eventType === 'task_status_changed' && hasMeaningfulPayloadChange(activity)) {
    return `狀態由「${formatStatusValue(before.status)}」改為「${formatStatusValue(after.status)}」。`;
  }

  if (activity.eventType === 'task_dates_changed' && hasMeaningfulPayloadChange(activity)) {
    const startChanged = stableSerialize(before.startDate) !== stableSerialize(after.startDate);
    const endChanged = stableSerialize(before.endDate) !== stableSerialize(after.endDate);
    if (startChanged && !endChanged) return formatSingleDateChange('開始日', before.startDate, after.startDate);
    if (!startChanged && endChanged) return formatSingleDateChange('到期日', before.endDate, after.endDate);
    return `日期由「${formatDateRange(before)}」改為「${formatDateRange(after)}」。`;
  }

  if (
    ['task_assigned', 'task_collaborators_changed', 'task_tags_changed'].includes(activity.eventType) &&
    hasMeaningfulPayloadChange(activity)
  ) {
    return summarizeTaskActivity(activity.eventType, activity.payload ?? {});
  }

  const fallback = normalizeText(stripTaskMentions(activity.summary));
  return fallback && !isLowValueMeetingActivitySummary(fallback) ? fallback : '';
};

export const isLowValueMeetingActivitySummary = (value: string | undefined) => {
  const normalized = normalizeText(
    stripTaskMentions(value ?? '')
      .replace(/^[-*]\s*/, '')
      .replace(/^\d+(?:\.\d+)*(?:\.)?\s+/, '')
      .replace(/^\d{1,2}:\d{2}\s*/, '')
      .replace(/^[：:，,、\s]+/, ''),
  );
  if (!normalized) return false;
  return LOW_VALUE_MEETING_ACTIVITY_PATTERNS.some(pattern => pattern.test(normalized));
};

export const isLowValueMeetingActivity = (
  activity: Pick<MeetingSynthesisActivity, 'eventType' | 'summary' | 'payload' | 'nodeId'>,
) =>
  activity.eventType === 'task_moved' ||
  isLowValueMeetingActivitySummary(activity.summary) ||
  hasComparablePayload(activity as MeetingSynthesisActivity) && !hasMeaningfulPayloadChange(activity as MeetingSynthesisActivity);

export const filterMeetingSynthesisActivities = (activities: MeetingSynthesisActivity[]) => {
  const seen = new Set<string>();
  return activities.filter(activity => {
    if (isLowValueMeetingActivity(activity)) return false;
    const fingerprint = getActivityFingerprint(activity);
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
};

const collectMentionedTaskIds = (content: string) => {
  const ids: string[] = [];
  TASK_MENTION_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TASK_MENTION_PATTERN.exec(content)) !== null) {
    if (!ids.includes(match[2])) ids.push(match[2]);
  }
  return ids;
};

const collectDirectMentionedTaskIds = (content: string) =>
  unique(
    content
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .flatMap(line => {
        TASK_MENTION_PATTERN.lastIndex = 0;
        const matches = Array.from(line.matchAll(TASK_MENTION_PATTERN));
        TASK_MENTION_PATTERN.lastIndex = 0;
        const ids = matches.map(match => match[2]);
        if (ids.length <= 1) return ids;

        const firstMatch = matches[0];
        const prefix = line.slice(0, firstMatch.index ?? 0)
          .replace(/^[-*]\s*/, '')
          .replace(/^\d+(?:\.\d+)*(?:\.)?\s+/, '')
          .replace(/^\d{1,2}:\d{2}\s*/, '')
          .trim();
        const separatorsArePath = matches.slice(0, -1).every((match, index) => {
          const nextMatch = matches[index + 1];
          const between = line.slice(
            (match.index ?? 0) + match[0].length,
            nextMatch.index ?? line.length,
          );
          return /^[\s／/]+$/.test(between);
        });
        return !prefix && separatorsArePath ? [ids[ids.length - 1]] : ids;
      }),
  );

const createTaskFallback = (nodeId: string, input: MeetingSynthesisInput): MeetingSynthesisTask => {
  const activity = input.activities.find(item => item.nodeId === nodeId);
  return {
    id: nodeId,
    title: activity?.title || nodeId,
  };
};

const isCleanDraftScaffoldLine = (line: string) => {
  const normalized = normalizeText(line.replace(/^[-*]\s*/, ''));
  return (
    normalized === '' ||
    /^#{1,6}\s+/.test(normalized) ||
    /^\d+(?:\.\d+)*(?:\.)?\s+/.test(normalized) ||
    normalized === '待 AI 統整。' ||
    normalized === '本次會議總結' ||
    normalized === '任務討論' ||
    normalized === '任務討論與結論' ||
    normalized === '其他' ||
    normalized === '待校稿項目'
  );
};

const cleanHumanMeetingLine = (line: string) => {
  const trimmed = line.trim();
  if (isCleanDraftScaffoldLine(trimmed)) return '';

  const cleaned = normalizeText(
    stripTaskMentions(trimmed)
      .replace(/^[-*]\s*/, '')
      .replace(/^\d{1,2}:\d{2}\s*/, '')
      .replace(/^[：:，,、／/>\s]+/, ''),
  );
  return isLowValueMeetingActivitySummary(cleaned) ? '' : cleaned;
};

const extractCleanHumanMeetingLines = (content: string) =>
  unique(
    content
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map(cleanHumanMeetingLine)
      .filter(Boolean),
  );

const extractCleanTaskParagraphs = (content: string, taskId: string) =>
  unique(
    content
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map(line => line.trim())
      .filter(line => collectDirectMentionedTaskIds(line).includes(taskId))
      .map(cleanHumanMeetingLine)
      .filter(Boolean),
  );

const summarizeCleanStatusChanges = (activities: MeetingSynthesisActivity[]) => {
  if (activities.length === 0) return '';

  const summaries = unique(
    filterMeetingSynthesisActivities(activities)
      .map(formatActivityNarrative)
      .filter(Boolean),
  );
  if (summaries.length === 0) return '任務有更新，但缺少可讀摘要。';
  return truncate(summaries.map(ensureSentence).filter(Boolean).join(' '), 220);
};

const extractCleanExplicitNextSteps = (notes: string[]) => {
  const actionPattern = /(需要|需|請|要|應|待|後續|會後|下次|接著|預計|明天|今天|本週|下週|月底|期限|以前|前完成|先|再|由.+負責|負責)/;
  const negatedPattern = /(不用|不需要|無需|不用再|不再|取消|不必)/;
  return notes
    .filter(note => actionPattern.test(note) && !negatedPattern.test(note))
    .map(note => truncate(note, 140))
    .slice(0, 3);
};

const summarizeCleanTaskDiscussion = (
  task: MeetingSynthesisTask,
  input: MeetingSynthesisInput,
  taskActivities: MeetingSynthesisActivity[],
) => {
  const notes = extractCleanTaskParagraphs(input.rawContent, task.id);
  const statusSummary = summarizeCleanStatusChanges(taskActivities);

  const narrativeParts = [
    notes.length ? truncate(notes.slice(-3).join(' '), 280) : '',
    statusSummary,
  ].filter(Boolean);

  return {
    hasMeetingEvidence: notes.length > 0 || taskActivities.length > 0,
    narrative: truncate(narrativeParts.join(' '), 360),
    nextSteps: extractCleanExplicitNextSteps(notes),
  };
};

const collectHumanSummaryLines = (input: MeetingSynthesisInput) =>
  extractCleanHumanMeetingLines(input.rawContent)
    .filter(line => !/^新增任務「.+」[。.]?$/.test(line))
    .filter(line => /(決議|結論|確認|風險|阻塞|負責|期限|需要|下一步|待辦|改為|完成)/.test(line))
    .map(line => truncate(line, 180))
    .slice(0, 2);

const getEvidenceTaskOrder = (input: MeetingSynthesisInput) =>
  unique([
    ...input.taskLinks.map(link => link.nodeId),
    ...collectDirectMentionedTaskIds(input.rawContent),
    ...input.activities.map(activity => activity.nodeId),
  ].filter(Boolean));

const getTaskPath = (task: MeetingSynthesisTask) =>
  task.path?.length ? task.path : [{ id: task.id, title: task.title }];

const getDisplayTaskPath = (task: MeetingSynthesisTask) => {
  const path = getTaskPath(task).filter(item => item.id && item.title);
  if (path.some(item => item.id === task.id)) return path;
  return [...path, { id: task.id, title: task.title }];
};

const formatTaskPathMentions = (task: MeetingSynthesisTask) =>
  getDisplayTaskPath(task)
    .map(pathItem => serializeTaskMention(pathItem.id, pathItem.title))
    .join('／');

type SynthesisTreeNode = {
  task: MeetingSynthesisTask;
  children: SynthesisTreeNode[];
  childIds: Set<string>;
  summary?: ReturnType<typeof summarizeCleanTaskDiscussion>;
  firstEvidenceIndex: number;
};

const createPathTask = (
  path: Array<{ id: string; title: string }>,
  pathIndex: number,
  sourceTask: MeetingSynthesisTask,
  taskById: Map<string, MeetingSynthesisTask>,
): MeetingSynthesisTask => {
  const pathItem = path[pathIndex];
  const knownTask = taskById.get(pathItem.id);
  if (knownTask) return knownTask;

  return {
    id: pathItem.id,
    title: pathItem.title || pathItem.id,
    parentId: pathIndex > 0 ? path[pathIndex - 1]?.id : null,
    path: path.slice(0, pathIndex + 1),
    depth: pathIndex,
    groupId: path[0]?.id || sourceTask.groupId,
    groupTitle: path[0]?.title || sourceTask.groupTitle,
  };
};

const getOrCreateTreeNode = (
  nodeMap: Map<string, SynthesisTreeNode>,
  task: MeetingSynthesisTask,
) => {
  const existing = nodeMap.get(task.id);
  if (existing) {
    existing.task = { ...existing.task, ...task };
    return existing;
  }

  const node: SynthesisTreeNode = {
    task,
    children: [],
    childIds: new Set<string>(),
    firstEvidenceIndex: Number.POSITIVE_INFINITY,
  };
  nodeMap.set(task.id, node);
  return node;
};

const compareTreeNodes = (left: SynthesisTreeNode, right: SynthesisTreeNode) => {
  const leftOrder = Number.isFinite(left.task.order) ? Number(left.task.order) : left.firstEvidenceIndex;
  const rightOrder = Number.isFinite(right.task.order) ? Number(right.task.order) : right.firstEvidenceIndex;
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  return left.task.title.localeCompare(right.task.title);
};

const quoteTitle = (title: string) => `「${title}」`;

const formatList = (items: string[]) => {
  const values = unique(items.map(item => item.trim()).filter(Boolean));
  if (values.length <= 1) return values[0] ?? '';
  if (values.length === 2) return `${values[0]}與${values[1]}`;
  return `${values.slice(0, -1).join('、')}與${values[values.length - 1]}`;
};

const formatQuotedList = (items: string[]) =>
  formatList(items.map(quoteTitle));

const treeNodeHasEvidence = (node: SynthesisTreeNode): boolean =>
  Boolean(node.summary?.hasMeetingEvidence) || node.children.some(treeNodeHasEvidence);

const getEvidenceChildren = (node: SynthesisTreeNode) =>
  node.children
    .filter(treeNodeHasEvidence)
    .sort(compareTreeNodes);

const collectEvidenceDescendantTitles = (node: SynthesisTreeNode, maxItems = 6) => {
  const titles: string[] = [];
  const visit = (current: SynthesisTreeNode) => {
    for (const child of getEvidenceChildren(current)) {
      if (titles.length >= maxItems) return;
      titles.push(child.task.title);
      visit(child);
    }
  };
  visit(node);
  return unique(titles).slice(0, maxItems);
};

const buildMainlineSummaryLines = (
  input: MeetingSynthesisInput,
  rootNodes: SynthesisTreeNode[],
) => {
  const lines = [...collectHumanSummaryLines(input)];
  const createdIds = new Set(
    input.activities
      .filter(activity => activity.eventType === 'task_created')
      .map(activity => activity.nodeId),
  );

  for (const root of rootNodes.filter(treeNodeHasEvidence).sort(compareTreeNodes)) {
    if (lines.length >= 5) break;

    const children = getEvidenceChildren(root);
    if (children.length > 0) {
      const childTitles = children.map(child => child.task.title);
      const verb = createdIds.size > 0 ? '建立' : '更新';
      lines.push(`本次${verb}${quoteTitle(root.task.title)}工作主線，拆成${formatQuotedList(childTitles)}等工作面。`);

      for (const child of children) {
        if (lines.length >= 5) break;
        const descendantTitles = collectEvidenceDescendantTitles(child);
        if (descendantTitles.length > 0) {
          lines.push(`${quoteTitle(child.task.title)}下展開${formatList(descendantTitles)}。`);
        }
      }
      continue;
    }

    if (createdIds.has(root.task.id) && rootNodes.length === 1) {
      lines.push(`新增任務${quoteTitle(root.task.title)}。`);
    } else {
      lines.push(`本次更新${quoteTitle(root.task.title)}。`);
    }
  }

  if (lines.length > 0) return unique(lines).slice(0, 5);
  return ['尚未記下明確的會中補記或任務變更。'];
};

const renderSynthesisEvidenceNode = (
  node: SynthesisTreeNode,
  sectionNumber: string,
  linkedTaskIds: string[],
): string[] => {
  getDisplayTaskPath(node.task).forEach(pathItem => linkedTaskIds.push(pathItem.id));
  const lines = [
    `${sectionNumber} ${formatTaskPathMentions(node.task)}`,
  ];

  if (node.summary?.hasMeetingEvidence) {
    lines.push(node.summary.narrative);
    if (node.summary.nextSteps.length > 0) {
      lines.push(
        '下一步：',
        ...node.summary.nextSteps.map(step => `- ${step}`),
      );
    }
  }

  return lines;
};

const collectEvidenceNodes = (nodes: SynthesisTreeNode[]) => {
  const evidenceNodes: SynthesisTreeNode[] = [];
  const visit = (node: SynthesisTreeNode) => {
    if (node.summary?.hasMeetingEvidence) evidenceNodes.push(node);
    node.children.sort(compareTreeNodes).forEach(visit);
  };
  nodes.sort(compareTreeNodes).forEach(visit);
  return evidenceNodes;
};

const collectOtherHumanLines = (input: MeetingSynthesisInput, summaryLines: string[]) =>
  input.rawContent
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter(line => {
      TASK_MENTION_PATTERN.lastIndex = 0;
      return !TASK_MENTION_PATTERN.test(line);
    })
    .map(cleanHumanMeetingLine)
    .filter(line => line && !summaryLines.includes(line))
    .slice(0, 3);

const QUALITY_CHECKS = [
  'non-empty-content',
  'numbered-section-structure',
  'no-markdown-heading',
  'task-heading-grounding',
  'complete-task-path',
  'non-empty-task-body',
  'no-low-value-system-text',
  'no-duplicate-narrative',
  'linked-task-integrity',
] as const;

const FORBIDDEN_SYNTHESIS_PHRASES = [
  '會中變更',
  '新任務：新增任務',
  '新增任務：新增任務',
  '目前任務狀態為',
  '任務背景是',
  '既有備註指出',
  '本次會議沒有留下完整討論內容',
  '請校稿者補上任務內容',
  '請校稿者確認這段紀要',
  '本任務',
  '子任務：',
  '所屬：',
];

const getDirectEvidenceTaskIds = (input: MeetingSynthesisInput) =>
  new Set([
    ...collectDirectMentionedTaskIds(input.rawContent),
    ...filterMeetingSynthesisActivities(input.activities).map(activity => activity.nodeId),
  ]);

const getTaskHeadingMatches = (content: string) =>
  Array.from(content.matchAll(/^2\.\d+(?:\.\d+)*\s+(.+)$/gm));

const getMeaningfulBodyLines = (body: string) =>
  body
    .split('\n')
    .map(line => line.trim())
    .filter(line => {
      if (!line || line === '下一步：' || /^3\.\s+其他$/.test(line)) return false;
      const withoutMentions = normalizeText(stripTaskMentions(line).replace(/^[-*]\s*/, ''));
      return !/^[／/>\s]*$/.test(withoutMentions);
    });

export const validateMeetingSynthesisOutput = (
  input: MeetingSynthesisInput,
  output: Pick<MeetingSynthesisResponse, 'content' | 'linkedTaskIds'>,
): MeetingSynthesisQualityReport => {
  const violations: string[] = [];
  const addViolation = (code: string) => {
    if (!violations.includes(code)) violations.push(code);
  };
  const content = output.content.replace(/\r\n?/g, '\n').trim();

  if (!content) addViolation('EMPTY_CONTENT');
  if (content && !content.startsWith('1. 本次會議總結')) addViolation('MISSING_SUMMARY_SECTION');
  if (/^#{1,6}\s+/m.test(content)) addViolation('MARKDOWN_HEADING_NOT_ALLOWED');
  if (FORBIDDEN_SYNTHESIS_PHRASES.some(phrase => content.includes(phrase))) {
    addViolation('FORBIDDEN_SYSTEM_OR_FILLER_TEXT');
  }
  if (['- 結論：', '- 決議：', '- 待辦：', '- 阻塞：', '- 狀態變更摘要：'].some(label => content.includes(label))) {
    addViolation('FIXED_FIELD_TEMPLATE_NOT_ALLOWED');
  }

  const directEvidenceTaskIds = getDirectEvidenceTaskIds(input);
  const taskById = new Map(input.tasks.map(task => [task.id, task]));
  const taskHeadingMatches = getTaskHeadingMatches(content);
  const seenHeadingTaskIds = new Set<string>();

  if (content.includes('2. 任務討論與結論') && taskHeadingMatches.length === 0) {
    addViolation('EMPTY_TASK_SECTION');
  }
  if (!content.includes('2. 任務討論與結論') && taskHeadingMatches.length > 0) {
    addViolation('ORPHAN_TASK_HEADING');
  }

  taskHeadingMatches.forEach((match, matchIndex) => {
    const heading = match[1] ?? '';
    const headingTaskIds = collectMentionedTaskIds(heading);
    const evidenceTaskId = headingTaskIds[headingTaskIds.length - 1];

    if (!evidenceTaskId) {
      addViolation('TASK_HEADING_WITHOUT_TASK_TAG');
      return;
    }
    if (!directEvidenceTaskIds.has(evidenceTaskId)) addViolation('STRUCTURAL_ONLY_TASK_HEADING');
    if (seenHeadingTaskIds.has(evidenceTaskId)) addViolation('DUPLICATE_TASK_HEADING');
    seenHeadingTaskIds.add(evidenceTaskId);

    const task = taskById.get(evidenceTaskId);
    if (task) {
      const expectedPathIds = getDisplayTaskPath(task).map(pathItem => pathItem.id);
      let previousIndex = -1;
      const hasOrderedCompletePath = expectedPathIds.every(pathId => {
        const pathIndex = headingTaskIds.indexOf(pathId);
        if (pathIndex <= previousIndex) return false;
        previousIndex = pathIndex;
        return true;
      });
      if (!hasOrderedCompletePath) addViolation('INCOMPLETE_TASK_PATH');
    }

    const bodyStart = (match.index ?? 0) + match[0].length;
    const nextTaskHeadingIndex = taskHeadingMatches[matchIndex + 1]?.index ?? content.length;
    const thirdSectionIndex = content.indexOf('\n3. 其他', bodyStart);
    const bodyEnd = thirdSectionIndex >= 0 && thirdSectionIndex < nextTaskHeadingIndex
      ? thirdSectionIndex
      : nextTaskHeadingIndex;
    if (getMeaningfulBodyLines(content.slice(bodyStart, bodyEnd)).length === 0) {
      addViolation('EMPTY_TASK_BODY');
    }
  });

  const otherSectionIndex = content.indexOf('\n3. 其他');
  if (otherSectionIndex >= 0) {
    const otherBody = content.slice(otherSectionIndex + '\n3. 其他'.length);
    if (getMeaningfulBodyLines(otherBody).length === 0) addViolation('EMPTY_OTHER_SECTION');
  }

  const narrativeFingerprints = new Set<string>();
  let insideNextSteps = false;
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (/^\d+(?:\.\d+)*\.?(?:\s+|$)/.test(trimmed)) insideNextSteps = false;
    if (trimmed === '下一步：') {
      insideNextSteps = true;
      continue;
    }
    if (!trimmed || insideNextSteps && /^[-*]\s+/.test(trimmed) || /^\d+(?:\.\d+)*\.?(?:\s+|$)/.test(trimmed)) continue;
    const fingerprint = normalizeText(stripTaskMentions(trimmed).replace(/^[-*]\s*/, ''));
    if (fingerprint.length < 16) continue;
    if (narrativeFingerprints.has(fingerprint)) addViolation('DUPLICATE_NARRATIVE');
    narrativeFingerprints.add(fingerprint);
  }

  for (const line of content.split('\n')) {
    const normalizedLine = normalizeText(
      stripTaskMentions(line)
        .replace(/^[-*]\s*/, '')
        .replace(/^\d+(?:\.\d+)*(?:\.)?\s+/, ''),
    );
    if (LOW_VALUE_MEETING_ACTIVITY_PATTERNS.some(pattern => pattern.test(normalizedLine))) {
      addViolation('LOW_VALUE_ACTIVITY_IN_CONTENT');
    }
  }

  const contentTaskIds = collectMentionedTaskIds(content);
  const linkedTaskIdSet = new Set(output.linkedTaskIds.filter(Boolean));
  if (contentTaskIds.some(taskId => !linkedTaskIdSet.has(taskId))) {
    addViolation('LINKED_TASK_IDS_INCOMPLETE');
  }

  return {
    passed: violations.length === 0,
    checks: [...QUALITY_CHECKS],
    violations,
  };
};

export const buildDeterministicMeetingSynthesis = (
  input: MeetingSynthesisInput,
): MeetingSynthesisResponse => {
  const receivedActivityCount = input.activities.length;
  const normalizedInput = {
    ...input,
    activities: filterMeetingSynthesisActivities(input.activities),
  };
  const taskById = new Map(normalizedInput.tasks.map(task => [task.id, task]));
  const evidenceTaskIds = getEvidenceTaskOrder(normalizedInput);
  const evidenceTasks = evidenceTaskIds.map(nodeId => taskById.get(nodeId) ?? createTaskFallback(nodeId, normalizedInput));
  const linkedTaskIds: string[] = [];
  const rootNodes: SynthesisTreeNode[] = [];
  const rootIds = new Set<string>();
  const nodeMap = new Map<string, SynthesisTreeNode>();

  for (const [evidenceIndex, task] of evidenceTasks.entries()) {
    const taskActivities = normalizedInput.activities.filter(activity => activity.nodeId === task.id);
    const summary = summarizeCleanTaskDiscussion(task, normalizedInput, taskActivities);
    if (!summary.hasMeetingEvidence) continue;

    const path = getTaskPath(task);
    let parentNode: SynthesisTreeNode | null = null;

    path.forEach((_pathItem, pathIndex) => {
      const pathTask = pathIndex === path.length - 1
        ? task
        : createPathTask(path, pathIndex, task, taskById);
      const treeNode = getOrCreateTreeNode(nodeMap, pathTask);
      treeNode.firstEvidenceIndex = Math.min(treeNode.firstEvidenceIndex, evidenceIndex);

      if (pathTask.id === task.id) {
        treeNode.summary = summary;
      }

      if (!parentNode) {
        if (!rootIds.has(treeNode.task.id)) {
          rootIds.add(treeNode.task.id);
          rootNodes.push(treeNode);
        }
      } else if (!parentNode.childIds.has(treeNode.task.id)) {
        parentNode.childIds.add(treeNode.task.id);
        parentNode.children.push(treeNode);
      }

      parentNode = treeNode;
    });
  }

  const sortedRootNodes = rootNodes.sort(compareTreeNodes);
  const sections = sortedRootNodes
    .flatMap(node => collectEvidenceNodes([node]))
    .map((node, nodeIndex) => renderSynthesisEvidenceNode(node, `2.${nodeIndex + 1}`, linkedTaskIds).join('\n'))
    .filter(Boolean);

  const generalSummaryLines = buildMainlineSummaryLines(normalizedInput, sortedRootNodes);
  const otherHumanLines = collectOtherHumanLines(normalizedInput, generalSummaryLines);

  const contentParts = [
    '1. 本次會議總結',
    ...generalSummaryLines.map(line => `- ${line}`),
    input.participantsText ? `- 參與人員：${normalizeText(input.participantsText)}` : '',
  ];

  if (sections.length > 0) {
    contentParts.push('', '2. 任務討論與結論', sections.join('\n\n'));
  }

  if (otherHumanLines.length > 0) {
    contentParts.push('', '3. 其他', ...otherHumanLines.map(line => `- ${line}`));
  }

  const content = contentParts.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  const response = {
    content,
    warnings: [
      '此草稿由本地 deterministic synthesis 產生，用於離線或測試環境；正式發布前仍需人工校稿。',
    ],
    linkedTaskIds: unique(linkedTaskIds),
    provider: 'deterministic-fallback',
    contractVersion: MEETING_SYNTHESIS_CONTRACT_VERSION,
    functionVersion: LOCAL_MEETING_SYNTHESIS_FUNCTION_VERSION,
    runId: createSynthesisRunId(),
    generatedAt: new Date().toISOString(),
    normalization: {
      receivedActivityCount,
      acceptedActivityCount: normalizedInput.activities.length,
      droppedActivityCount: receivedActivityCount - normalizedInput.activities.length,
    },
  };
  return {
    ...response,
    quality: validateMeetingSynthesisOutput(normalizedInput, response),
  };
};
