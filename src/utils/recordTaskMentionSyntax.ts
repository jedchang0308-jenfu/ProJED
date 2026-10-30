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
