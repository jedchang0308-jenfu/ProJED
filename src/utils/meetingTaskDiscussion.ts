import dayjs from 'dayjs';
import { serializeTaskMention } from './recordContentMentions';

export const MEETING_TASK_DISCUSSION_HEADING = '## 任務討論';

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const normalizeMeetingTaskDiscussionText = (text: string) =>
  text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join(' / ');

export const appendLineToMarkdownSection = (content: string, heading: string, line: string) => {
  const trimmedContent = content.trim();
  if (!trimmedContent) return `${heading}\n${line}`;

  const headingPattern = new RegExp(`(^|\\n)${escapeRegExp(heading)}\\n`);
  const match = headingPattern.exec(trimmedContent);
  if (!match) return `${trimmedContent}\n\n${heading}\n${line}`;

  const insertSearchStart = match.index + match[0].length;
  const rest = trimmedContent.slice(insertSearchStart);
  const nextHeadingOffset = rest.search(/\n##\s+/);
  if (nextHeadingOffset === -1) return `${trimmedContent}\n${line}`;

  const insertAt = insertSearchStart + nextHeadingOffset;
  return `${trimmedContent.slice(0, insertAt)}\n${line}${trimmedContent.slice(insertAt)}`;
};

export const createMeetingTaskDiscussionLine = (
  nodeId: string,
  title: string,
  text: string,
  occurredAt = Date.now(),
) => {
  const normalizedText = normalizeMeetingTaskDiscussionText(text);
  if (!normalizedText) return '';
  const time = dayjs(occurredAt).format('HH:mm');
  return `- ${time} ${serializeTaskMention(nodeId, title)}：${normalizedText}`;
};

export const appendTaskDiscussionToRecordContent = (
  content: string,
  nodeId: string,
  title: string,
  text: string,
  occurredAt = Date.now(),
) => {
  const line = createMeetingTaskDiscussionLine(nodeId, title, text, occurredAt);
  if (!line) return null;
  return appendLineToMarkdownSection(content, MEETING_TASK_DISCUSSION_HEADING, line);
};
