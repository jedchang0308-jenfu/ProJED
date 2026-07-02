import { TASK_MENTION_PATTERN } from './recordContentMentions';
import {
  MEETING_RECORD_OTHER_HEADING,
  MEETING_RECORD_TASKS_HEADING,
  isMeetingRecordScaffoldLine,
} from './meetingRecordScaffold';
import { appendLineToMarkdownSection } from './meetingTaskDiscussion';

const PROJECT_CHANGE_IMPORT_BLOCK_START = '[專案變化匯入開始]';
const PROJECT_CHANGE_IMPORT_BLOCK_END = '[專案變化匯入結束]';

const normalizeText = (value: string) =>
  value
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const stripTaskMentions = (value: string) => {
  TASK_MENTION_PATTERN.lastIndex = 0;
  return value.replace(TASK_MENTION_PATTERN, '');
};

const hasTaskMention = (value: string) => {
  TASK_MENTION_PATTERN.lastIndex = 0;
  return TASK_MENTION_PATTERN.test(value);
};

const normalizeFingerprint = (value: string) =>
  normalizeText(stripTaskMentions(value))
    .replace(/^[-*]\s*/, '')
    .replace(/^\d{1,2}:\d{2}\s*/, '')
    .replace(/[：:，,、\s]+/g, ' ')
    .replace(/[。.!?！？]/g, '')
    .trim()
    .toLowerCase();

const cleanHumanDraftLine = (line: string) => {
  const trimmed = line.trim();
  if (!trimmed) return '';
  if (isMeetingRecordScaffoldLine(trimmed)) return '';
  if (trimmed === PROJECT_CHANGE_IMPORT_BLOCK_START || trimmed === PROJECT_CHANGE_IMPORT_BLOCK_END) return '';
  if (trimmed === '## 專案變化匯入' || trimmed === '受保護來源：AI整理需統整此區塊，不得刪除其任務證據。') return '';

  return normalizeText(
    trimmed
      .replace(/^[-*]\s*/, '')
      .replace(/^\d{1,2}:\d{2}\s*/, '')
      .replace(/^\d+(?:\.\d+)+\.?\s*/, '')
      .replace(/^[：:，,、\s]+/, ''),
  );
};

type HumanDraftEntry = {
  line: string;
  placement: 'task' | 'other';
};

const isTaskSectionHeading = (line: string) => line.trim() === MEETING_RECORD_TASKS_HEADING;
const isOtherSectionHeading = (line: string) => line.trim() === MEETING_RECORD_OTHER_HEADING || line.trim() === '3. 其他';

const extractHumanDraftEntries = (content: string) => {
  const entries: HumanDraftEntry[] = [];
  let insideProjectImportBlock = false;
  let currentPlacement: HumanDraftEntry['placement'] = 'other';
  let activeTaskContext = false;

  for (const rawLine of content.replace(/\r\n?/g, '\n').split('\n')) {
    const trimmed = rawLine.trim();
    if (trimmed === PROJECT_CHANGE_IMPORT_BLOCK_START) {
      insideProjectImportBlock = true;
      continue;
    }
    if (trimmed === PROJECT_CHANGE_IMPORT_BLOCK_END) {
      insideProjectImportBlock = false;
      continue;
    }
    if (insideProjectImportBlock) continue;

    if (isTaskSectionHeading(trimmed)) {
      currentPlacement = 'task';
      activeTaskContext = false;
      continue;
    }
    if (isOtherSectionHeading(trimmed) || /^1\.\s+/.test(trimmed)) {
      currentPlacement = 'other';
      activeTaskContext = false;
      continue;
    }

    if (hasTaskMention(rawLine)) activeTaskContext = true;

    const line = cleanHumanDraftLine(rawLine);
    if (!line) continue;

    const placement = currentPlacement === 'task' || activeTaskContext ? 'task' : 'other';
    if (!entries.some(entry => entry.line === line && entry.placement === placement)) {
      entries.push({ line, placement });
    }
  }

  return entries;
};

const findMissingHumanDraftEntries = (aiContent: string, preservedDraftContent: string) => {
  const aiFingerprint = normalizeFingerprint(aiContent);
  return extractHumanDraftEntries(preservedDraftContent).filter(entry => {
    const fingerprint = normalizeFingerprint(entry.line);
    return Boolean(fingerprint && !aiFingerprint.includes(fingerprint));
  });
};

const removeGenericProofreadPlaceholder = (content: string) =>
  content
    .split('\n')
    .filter(line => !/^-\s*請確認上述整理是否符合會議實際發言與操作。$/.test(line.trim()))
    .join('\n')
    .trim();

const insertLinesIntoOtherSection = (content: string, lines: string[]) => {
  const normalizedContent = normalizeText(content);
  const additions = lines.map(line => `- ${line}`).join('\n');
  if (!additions) return normalizedContent;

  const headingPattern = new RegExp(`(^|\\n)${MEETING_RECORD_OTHER_HEADING.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n?`);
  const match = headingPattern.exec(normalizedContent);
  if (!match) return normalizeText([normalizedContent, '', MEETING_RECORD_OTHER_HEADING, additions].join('\n'));

  const insertAt = match.index + match[0].length;
  const before = normalizedContent.slice(0, insertAt).trimEnd();
  const cleanedAfter = removeGenericProofreadPlaceholder(normalizedContent.slice(insertAt).trimStart());

  return normalizeText([
    before,
    additions,
    cleanedAfter,
  ].filter(Boolean).join('\n'));
};

const insertLinesIntoTaskSection = (content: string, lines: string[]) => {
  const additions = lines.map(line => `- ${line}`).join('\n');
  if (!additions) return normalizeText(content);
  return normalizeText(appendLineToMarkdownSection(removeGenericProofreadPlaceholder(content), MEETING_RECORD_TASKS_HEADING, additions));
};

export const mergeHumanDraftWithAiSynthesis = (
  aiContent: string,
  preservedDraftContent: string,
) => {
  const missingEntries = findMissingHumanDraftEntries(aiContent, preservedDraftContent);
  if (missingEntries.length === 0) return normalizeText(aiContent);

  const taskLines = missingEntries.filter(entry => entry.placement === 'task').map(entry => entry.line);
  const otherLines = missingEntries.filter(entry => entry.placement === 'other').map(entry => entry.line);
  const withTaskLines = taskLines.length ? insertLinesIntoTaskSection(aiContent, taskLines) : normalizeText(aiContent);
  return otherLines.length ? insertLinesIntoOtherSection(withTaskLines, otherLines) : withTaskLines;
};
