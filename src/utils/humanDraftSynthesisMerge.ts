import { TASK_MENTION_PATTERN } from './recordContentMentions';
import {
  PROJECT_CHANGE_IMPORT_BLOCK_END,
  PROJECT_CHANGE_IMPORT_BLOCK_START,
  PROJECT_CHANGE_IMPORT_BLOCK_TITLE,
  mergeProjectChangeImportBlocks,
} from './projectChangeImport';

type HumanDraftEvidence = {
  text: string;
  fingerprint: string;
  placement: 'task' | 'other';
};

const normalizeText = (value: string) =>
  value
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const normalizeFingerprint = (value: string) =>
  {
    TASK_MENTION_PATTERN.lastIndex = 0;
    return normalizeText(value)
      .replace(TASK_MENTION_PATTERN, '$1')
      .replace(/[#[\]()`*_>~-]/g, ' ')
      .replace(/[：:，,。.!?！？、；;「」『』（）()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  };

const isMainMeetingHeading = (line: string) =>
  /^1\.\s+/.test(line) ||
  /^2\.\s+/.test(line) ||
  /^3\.\s+/.test(line);

const isDraftScaffoldLine = (line: string) => {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (trimmed === PROJECT_CHANGE_IMPORT_BLOCK_START) return true;
  if (trimmed === PROJECT_CHANGE_IMPORT_BLOCK_END) return true;
  if (trimmed === PROJECT_CHANGE_IMPORT_BLOCK_TITLE) return true;
  if (/受保護/.test(trimmed)) return true;
  if (/待 AI 統整|請確認上述整理是否符合會議實際發言與操作/.test(trimmed)) return true;
  if (isMainMeetingHeading(trimmed)) return true;
  return false;
};

const stripProjectChangeImportBlocks = (content: string) => {
  const normalized = content.replace(/\r\n?/g, '\n');
  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const markerPattern = new RegExp(
    `${escapeRegExp(PROJECT_CHANGE_IMPORT_BLOCK_START)}[\\s\\S]*?${escapeRegExp(PROJECT_CHANGE_IMPORT_BLOCK_END)}`,
    'g',
  );
  return normalized.replace(markerPattern, '\n');
};

const getPlacement = (text: string): HumanDraftEvidence['placement'] => {
  TASK_MENTION_PATTERN.lastIndex = 0;
  if (TASK_MENTION_PATTERN.test(text)) {
    TASK_MENTION_PATTERN.lastIndex = 0;
    return 'task';
  }
  TASK_MENTION_PATTERN.lastIndex = 0;
  if (/(任務|待辦|負責|期限|下一步|完成|進度|阻塞|風險|決議|結論)/.test(text)) return 'task';
  return 'other';
};

const extractHumanDraftEvidence = (content: string): HumanDraftEvidence[] => {
  const evidence: HumanDraftEvidence[] = [];
  const seen = new Set<string>();
  let currentHeading = '';

  stripProjectChangeImportBlocks(content)
    .split('\n')
    .map(line => line.trim())
    .forEach(line => {
      if (!line) return;
      if (/^#{1,6}\s+/.test(line)) {
        currentHeading = line.replace(/^#{1,6}\s+/, '').trim();
        return;
      }
      if (isDraftScaffoldLine(line)) return;

      const text = currentHeading ? `${currentHeading}：${line}` : line;
      const fingerprint = normalizeFingerprint(text);
      if (!fingerprint || seen.has(fingerprint)) return;
      seen.add(fingerprint);
      evidence.push({
        text,
        fingerprint,
        placement: getPlacement(text),
      });
    });

  return evidence;
};

const getNextTaskDiscussionNumber = (content: string) => {
  const matches = Array.from(content.matchAll(/^2\.(\d+)\s+/gm), match => Number(match[1]));
  const max = matches.length ? Math.max(...matches.filter(Number.isFinite)) : 0;
  return `2.${max + 1}`;
};

const insertBeforeOtherSection = (content: string, insertion: string) => {
  const otherMatch = /\n3\.\s+/.exec(content);
  if (!otherMatch) return normalizeText([content, insertion].join('\n\n'));
  return normalizeText([
    content.slice(0, otherMatch.index),
    insertion,
    content.slice(otherMatch.index),
  ].join('\n\n'));
};

const insertIntoOtherSection = (content: string, lines: string[]) => {
  if (lines.length === 0) return content;
  const insertion = [
    '手寫補充',
    ...lines.map(line => `- ${line}`),
  ].join('\n');
  const proofreadMatch = /\n-\s*請確認上述整理是否符合會議實際發言與操作/.exec(content);
  if (proofreadMatch) {
    return normalizeText([
      content.slice(0, proofreadMatch.index),
      insertion,
      content.slice(proofreadMatch.index),
    ].join('\n\n'));
  }
  return normalizeText([content, insertion].join('\n\n'));
};

const insertMissingHumanEvidence = (content: string, missingEvidence: HumanDraftEvidence[]) => {
  const taskEvidence = missingEvidence.filter(item => item.placement === 'task');
  const otherEvidence = missingEvidence.filter(item => item.placement === 'other');
  let nextContent = content;

  if (taskEvidence.length > 0) {
    nextContent = insertBeforeOtherSection(
      nextContent,
      [
        `${getNextTaskDiscussionNumber(nextContent)} 手寫補充`,
        ...taskEvidence.map(item => `- ${item.text}`),
      ].join('\n'),
    );
  }

  return insertIntoOtherSection(nextContent, otherEvidence.map(item => item.text));
};

export const mergeHumanDraftWithAiSynthesis = (
  aiContent: string,
  preservedDraftContent: string,
) => {
  const projectMergedContent = mergeProjectChangeImportBlocks(aiContent, preservedDraftContent);
  const mergedFingerprint = normalizeFingerprint(projectMergedContent);
  const missingEvidence = extractHumanDraftEvidence(preservedDraftContent)
    .filter(item => !mergedFingerprint.includes(item.fingerprint));

  if (missingEvidence.length === 0) return projectMergedContent;
  return insertMissingHumanEvidence(projectMergedContent, missingEvidence);
};
