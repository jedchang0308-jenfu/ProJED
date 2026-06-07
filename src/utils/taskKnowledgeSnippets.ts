import {
  TASK_MENTION_PATTERN,
  renderRecordContentAsPlainText,
} from './recordContentMentions';

export type TaskKnowledgeSnippet = {
  id: string;
  text: string;
  kind: 'mention' | 'linked_record';
};

const normalizePreviewText = (value: string) =>
  value
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const truncateText = (value: string, maxLength: number) => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
};

const paragraphHasTaskMention = (paragraph: string, nodeId: string) => {
  TASK_MENTION_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TASK_MENTION_PATTERN.exec(paragraph)) !== null) {
    if (match[2] === nodeId) return true;
  }
  return false;
};

export const extractTaskRecordSnippets = (
  content: string,
  nodeId: string,
  options: { maxSnippets?: number; maxLength?: number } = {},
): TaskKnowledgeSnippet[] => {
  const maxSnippets = options.maxSnippets ?? 3;
  const maxLength = options.maxLength ?? 260;
  const paragraphs = content
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean);
  const snippets: TaskKnowledgeSnippet[] = [];
  const seen = new Set<string>();

  paragraphs.forEach((paragraph, index) => {
    if (snippets.length >= maxSnippets) return;
    if (!paragraphHasTaskMention(paragraph, nodeId)) return;

    const text = truncateText(normalizePreviewText(renderRecordContentAsPlainText(paragraph)), maxLength);
    if (!text || seen.has(text)) return;
    seen.add(text);
    snippets.push({
      id: `mention-${index}`,
      text,
      kind: 'mention',
    });
  });

  if (snippets.length > 0) return snippets;

  const fallback = truncateText(normalizePreviewText(renderRecordContentAsPlainText(content)), maxLength);
  return fallback
    ? [{ id: 'linked-record', text: fallback, kind: 'linked_record' }]
    : [];
};

export const taskKnowledgeMatchesQuery = (query: string, values: string[]) => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  return values.some(value => value.toLowerCase().includes(normalizedQuery));
};
