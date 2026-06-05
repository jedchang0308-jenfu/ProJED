import type { RecordTaskLinkRole } from '../types';

export type RecordContentSegment =
  | { type: 'text'; text: string }
  | { type: 'task'; nodeId: string; title: string; raw: string };

export type DraftTaskLink = { nodeId: string; role: RecordTaskLinkRole };

export const TASK_MENTION_PATTERN = /@\[([^\]]+)\]\(task:([^)]+)\)/g;

const normalizeTitle = (title: string) =>
  title
    .replace(/[\r\n]/g, ' ')
    .replace(/\[/g, ' ')
    .replace(/]/g, ' ')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Untitled task';

export const serializeTaskMention = (nodeId: string, title: string) =>
  `@[${normalizeTitle(title)}](task:${nodeId})`;

export const parseRecordContentMentions = (content: string): RecordContentSegment[] => {
  const segments: RecordContentSegment[] = [];
  TASK_MENTION_PATTERN.lastIndex = 0;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TASK_MENTION_PATTERN.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', text: content.slice(lastIndex, match.index) });
    }

    segments.push({
      type: 'task',
      title: match[1],
      nodeId: match[2],
      raw: match[0],
    });

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    segments.push({ type: 'text', text: content.slice(lastIndex) });
  }

  return segments.length ? segments : [{ type: 'text', text: content }];
};

export const extractTaskMentionIds = (content: string): string[] => {
  const ids: string[] = [];

  parseRecordContentMentions(content).forEach(segment => {
    if (segment.type !== 'task') return;
    if (!ids.includes(segment.nodeId)) ids.push(segment.nodeId);
  });

  return ids;
};

export const insertTaskMention = (
  content: string,
  offset: number | null | undefined,
  nodeId: string,
  title: string
) => {
  const insertAt = Math.max(0, Math.min(offset ?? content.length, content.length));
  const token = serializeTaskMention(nodeId, title);
  const before = content.slice(0, insertAt);
  const after = content.slice(insertAt);
  const prefix = before.length > 0 && !/\s$/.test(before) ? ' ' : '';
  const suffix = after.length > 0 && !/^\s/.test(after) ? ' ' : '';
  const inserted = `${prefix}${token}${suffix}`;

  return {
    content: `${before}${inserted}${after}`,
    cursorOffset: before.length + prefix.length + token.length + suffix.length,
  };
};

export const uniqueRecordTaskLinks = (links: DraftTaskLink[]) => {
  const seen = new Set<string>();
  return links.filter(link => {
    if (seen.has(link.nodeId)) return false;
    seen.add(link.nodeId);
    return true;
  });
};

export const syncTaskLinksFromRecordContent = (
  content: string,
  currentLinks: DraftTaskLink[],
  legacyNodeIds: string[] = []
) => {
  const mentionIds = extractTaskMentionIds(content);
  const keepIds = new Set([...mentionIds, ...legacyNodeIds]);
  const nextLinks: DraftTaskLink[] = [];

  mentionIds.forEach((nodeId) => {
    const existing = currentLinks.find(link => link.nodeId === nodeId);
    nextLinks.push({
      nodeId,
      role: existing?.role ?? (nextLinks.length === 0 && legacyNodeIds.length === 0 ? 'main' : 'related'),
    });
  });

  legacyNodeIds.forEach((nodeId) => {
    if (nextLinks.some(link => link.nodeId === nodeId)) return;
    const existing = currentLinks.find(link => link.nodeId === nodeId);
    if (existing) nextLinks.push(existing);
  });

  currentLinks.forEach((link) => {
    if (!keepIds.has(link.nodeId)) return;
    if (nextLinks.some(item => item.nodeId === link.nodeId)) return;
    nextLinks.push(link);
  });

  return uniqueRecordTaskLinks(nextLinks);
};

export const renderRecordContentAsPlainText = (content: string) =>
  parseRecordContentMentions(content)
    .map(segment => segment.type === 'task' ? segment.title : segment.text)
    .join('');
