import { serializeTaskMention, TASK_MENTION_PATTERN } from './recordContentMentions';
import {
  MEETING_RECORD_OTHER_HEADING,
  MEETING_RECORD_SUMMARY_HEADING,
  MEETING_RECORD_TASKS_HEADING,
  isMeetingRecordScaffoldLine,
} from './meetingRecordScaffold';

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
};

export type MeetingSynthesisResponse = {
  content: string;
  warnings: string[];
  linkedTaskIds: string[];
  provider?: string;
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

const ensureSentence = (value: string) => {
  const text = normalizeText(value);
  if (!text) return '';
  return /[。.!?！？]$/.test(text) ? text : `${text}。`;
};

const stripTaskMentions = (value: string) => {
  TASK_MENTION_PATTERN.lastIndex = 0;
  return value.replace(TASK_MENTION_PATTERN, '');
};

const isMajorMeetingSectionHeading = (line: string) =>
  /^1\.\s+/.test(line.trim()) ||
  /^2\.\s+/.test(line.trim()) ||
  /^3\.\s+/.test(line.trim());

const collectMentionedTaskIds = (content: string) => {
  const ids: string[] = [];
  TASK_MENTION_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TASK_MENTION_PATTERN.exec(content)) !== null) {
    if (!ids.includes(match[2])) ids.push(match[2]);
  }
  return ids;
};

const createTaskFallback = (nodeId: string, input: MeetingSynthesisInput): MeetingSynthesisTask => {
  const activity = input.activities.find(item => item.nodeId === nodeId);
  return {
    id: nodeId,
    title: activity?.title || nodeId,
  };
};

const isCleanDraftScaffoldLine = (line: string) => {
  const normalized = normalizeText(line.replace(/^[-*]\s*/, ''));
  return isMeetingRecordScaffoldLine(normalized);
};

const cleanHumanMeetingLine = (line: string) => {
  const trimmed = line.trim();
  if (isCleanDraftScaffoldLine(trimmed)) return '';

  const cleaned = normalizeText(
    stripTaskMentions(trimmed)
      .replace(/^[-*]\s*/, '')
      .replace(/^\d{1,2}:\d{2}\s*/, '')
      .replace(/^\d+(?:\.\d+)+\.?\s*/, '')
      .replace(/^[：:，,、\s]+/, ''),
  );
  return isMeetingRecordScaffoldLine(cleaned) ? '' : cleaned;
};

const extractCleanUntaskedHumanMeetingLines = (content: string) => {
  const lines: string[] = [];
  let activeTaskIds: string[] = [];

  for (const rawLine of content.replace(/\r\n?/g, '\n').split('\n')) {
    const trimmed = rawLine.trim();
    if (isMajorMeetingSectionHeading(trimmed)) activeTaskIds = [];

    const mentionedTaskIds = collectMentionedTaskIds(rawLine);
    if (mentionedTaskIds.length > 0) {
      activeTaskIds = mentionedTaskIds;
      continue;
    }
    if (activeTaskIds.length > 0) continue;

    const line = cleanHumanMeetingLine(rawLine);
    if (line && !lines.includes(line)) lines.push(line);
  }

  return lines;
};

const extractCleanTaskParagraphs = (content: string, taskId: string) => {
  const lines: string[] = [];
  let activeTaskIds: string[] = [];

  for (const rawLine of content.replace(/\r\n?/g, '\n').split('\n')) {
    const trimmed = rawLine.trim();
    if (isMajorMeetingSectionHeading(trimmed)) activeTaskIds = [];

    const mentionedTaskIds = collectMentionedTaskIds(rawLine);
    if (mentionedTaskIds.length > 0) activeTaskIds = mentionedTaskIds;

    const line = cleanHumanMeetingLine(rawLine);
    if (!line) continue;
    if (!mentionedTaskIds.includes(taskId) && !activeTaskIds.includes(taskId)) continue;
    if (!lines.includes(line)) lines.push(line);
  }

  return lines;
};

const summarizeCleanStatusChanges = (activities: MeetingSynthesisActivity[]) => {
  if (activities.length === 0) return '';

  const summaries = unique(activities.map(activity => activity.summary).filter(Boolean));
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
  extractCleanUntaskedHumanMeetingLines(input.rawContent)
    .filter(line => !/^新增任務「.+」[。.]?$/.test(line))
    .filter(line => /(決議|結論|確認|風險|阻塞|負責|期限|需要|下一步|待辦|改為|完成)/.test(line))
    .slice(0, 2);

const collectHumanOtherLines = (
  input: MeetingSynthesisInput,
  summaryLines: string[],
) => {
  const summarySet = new Set(summaryLines);
  return extractCleanUntaskedHumanMeetingLines(input.rawContent)
    .filter(line => !summarySet.has(line))
    .filter(line => !/^新增任務「.+」[。.]?$/.test(line));
};

const getEvidenceTaskOrder = (input: MeetingSynthesisInput) =>
  unique([
    ...input.taskLinks.map(link => link.nodeId),
    ...collectMentionedTaskIds(input.rawContent),
    ...input.activities.map(activity => activity.nodeId),
  ].filter(Boolean));

const getTaskPath = (task: MeetingSynthesisTask) =>
  task.path?.length ? task.path : [{ id: task.id, title: task.title }];

const formatTaskHeadingMention = (task: MeetingSynthesisTask) =>
  serializeTaskMention(task.id, task.title);

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

const renderSynthesisTreeNode = (
  node: SynthesisTreeNode,
  sectionNumber: string,
  linkedTaskIds: string[],
): string[] => {
  linkedTaskIds.push(node.task.id);
  const lines = [
    `${sectionNumber} ${formatTaskHeadingMention(node.task)}`,
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

  node.children
    .sort(compareTreeNodes)
    .forEach((child, childIndex) => {
      lines.push(
        '',
        ...renderSynthesisTreeNode(child, `${sectionNumber}.${childIndex + 1}`, linkedTaskIds),
      );
    });

  return lines;
};

export const buildDeterministicMeetingSynthesis = (
  input: MeetingSynthesisInput,
): MeetingSynthesisResponse => {
  const taskById = new Map(input.tasks.map(task => [task.id, task]));
  const evidenceTaskIds = getEvidenceTaskOrder(input);
  const evidenceTasks = evidenceTaskIds.map(nodeId => taskById.get(nodeId) ?? createTaskFallback(nodeId, input));
  const linkedTaskIds: string[] = [];
  const rootNodes: SynthesisTreeNode[] = [];
  const rootIds = new Set<string>();
  const nodeMap = new Map<string, SynthesisTreeNode>();

  for (const [evidenceIndex, task] of evidenceTasks.entries()) {
    const taskActivities = input.activities.filter(activity => activity.nodeId === task.id);
    const summary = summarizeCleanTaskDiscussion(task, input, taskActivities);
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
    .map((node, nodeIndex) => renderSynthesisTreeNode(node, `2.${nodeIndex + 1}`, linkedTaskIds).join('\n'))
    .filter(Boolean);

  const generalSummaryLines = buildMainlineSummaryLines(input, sortedRootNodes);
  const otherHumanLines = collectHumanOtherLines(input, generalSummaryLines);
  const fallbackOtherLines = sections.length
    ? ['請確認上述整理是否符合會議實際發言與操作。']
    : ['請補上會中實際討論內容或任務變更後再發布。'];
  const otherLines = otherHumanLines.length ? otherHumanLines : fallbackOtherLines;

  const content = [
    MEETING_RECORD_SUMMARY_HEADING,
    ...generalSummaryLines.map(line => `- ${line}`),
    input.participantsText ? `- 參與人員：${normalizeText(input.participantsText)}` : '',
    '',
    MEETING_RECORD_TASKS_HEADING,
    sections.join('\n\n') || '- 尚無會中補記或任務變更可整理。',
    '',
    MEETING_RECORD_OTHER_HEADING,
    ...otherLines.map(line => `- ${line}`),
  ].join('\n').replace(/\n{3,}/g, '\n\n').trim();

  return {
    content,
    warnings: [
      '此草稿由本地 deterministic synthesis 產生，用於離線或測試環境；正式發布前仍需人工校稿。',
    ],
    linkedTaskIds: unique(linkedTaskIds),
    provider: 'deterministic-fallback',
  };
};
