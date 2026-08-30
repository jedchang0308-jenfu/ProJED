import type { SerializedEditorState } from 'lexical';
import type { TaskDetailNote, TaskDetailNoteRichContent } from '../types';

export const TASK_NOTE_RICH_CONTENT_SCHEMA = 'task-note.lexical-v1' as const;

export type TaskNoteSerializedNode = Record<string, unknown> & {
  children?: TaskNoteSerializedNode[];
  format?: number | string;
  listType?: string;
  start?: number;
  tag?: string;
  text?: string;
  type?: string;
  url?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const normalizeChildren = (value: unknown): TaskNoteSerializedNode[] => (
  Array.isArray(value) ? value.filter(isRecord) as TaskNoteSerializedNode[] : []
);

const TASK_NOTE_NODE_ALLOWLIST = new Set([
  'root',
  'paragraph',
  'heading',
  'list',
  'listitem',
  'link',
  'text',
  'linebreak',
]);

const isAllowedSerializedNode = (value: unknown): value is TaskNoteSerializedNode => {
  if (!isRecord(value) || typeof value.type !== 'string' || !TASK_NOTE_NODE_ALLOWLIST.has(value.type)) {
    return false;
  }
  if (value.children !== undefined && !Array.isArray(value.children)) return false;
  return !Array.isArray(value.children) || value.children.every(isAllowedSerializedNode);
};

const createTextNode = (text: string): TaskNoteSerializedNode => ({
  detail: 0,
  format: 0,
  mode: 'normal',
  style: '',
  text,
  type: 'text',
  version: 1,
});

const createParagraphNode = (text: string): TaskNoteSerializedNode => ({
  children: text ? [createTextNode(text)] : [],
  direction: null,
  format: '',
  indent: 0,
  textFormat: 0,
  textStyle: '',
  type: 'paragraph',
  version: 1,
});

const createEditorState = (paragraphs: TaskNoteSerializedNode[]): SerializedEditorState => ({
  root: {
    children: paragraphs,
    direction: null,
    format: '',
    indent: 0,
    type: 'root',
    version: 1,
  },
}) as unknown as SerializedEditorState;

const toParagraphs = (content: string): TaskNoteSerializedNode[] => {
  const normalized = content.replace(/\r\n?/g, '\n');
  if (!normalized) return [createParagraphNode('')];
  return normalized.split('\n').map(createParagraphNode);
};

export const createPlainTaskNoteRichContent = (content: string): TaskDetailNoteRichContent => ({
  schema: TASK_NOTE_RICH_CONTENT_SCHEMA,
  editorState: createEditorState(toParagraphs(content)),
});

export const createTaskNoteRichContent = (editorState: SerializedEditorState): TaskDetailNoteRichContent => ({
  schema: TASK_NOTE_RICH_CONTENT_SCHEMA,
  editorState,
});

export const isTaskNoteRichContent = (value: unknown): value is TaskDetailNoteRichContent => {
  if (!isRecord(value) || value.schema !== TASK_NOTE_RICH_CONTENT_SCHEMA || !isRecord(value.editorState)) {
    return false;
  }
  return isAllowedSerializedNode(value.editorState.root) && value.editorState.root.type === 'root';
};

export const getTaskNoteSerializedRoot = (note: Pick<TaskDetailNote, 'richContent'>): TaskNoteSerializedNode | null => {
  if (!isTaskNoteRichContent(note.richContent)) return null;
  return note.richContent.editorState.root as unknown as TaskNoteSerializedNode;
};

export const getTaskNoteEditorStateJson = (note: Pick<TaskDetailNote, 'richContent'>): string | null => (
  isTaskNoteRichContent(note.richContent) ? JSON.stringify(note.richContent.editorState) : null
);

export const areTaskNoteRichContentsEqual = (
  left: TaskDetailNoteRichContent | undefined,
  right: TaskDetailNoteRichContent | undefined,
): boolean => {
  if (left === right) return true;
  if (!left || !right) return false;
  return JSON.stringify(left) === JSON.stringify(right);
};

export const sanitizeTaskNoteUrl = (url: string): string | null => {
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol) ? trimmed : null;
  } catch {
    return null;
  }
};

const textFormatBits = (node: TaskNoteSerializedNode): number => (
  typeof node.format === 'number' ? node.format : 0
);

const escapeMarkdownText = (value: string): string => value.replace(/([\\*{}[\]()#+.!_>~-])/g, '\\$1');

const serializeInlineMarkdown = (node: TaskNoteSerializedNode): string => {
  if (node.type === 'text') {
    let text = escapeMarkdownText(typeof node.text === 'string' ? node.text : '');
    const format = textFormatBits(node);
    if (!text) return '';
    if (format & 4) text = '~~' + text + '~~';
    if (format & 2) text = '*' + text + '*';
    if (format & 1) text = '**' + text + '**';
    if ((format & 8) && !(format & 1)) text = '**' + text + '**';
    return text;
  }
  if (node.type === 'linebreak') return '  \n';

  const children = normalizeChildren(node.children).map(serializeInlineMarkdown).join('');
  if (node.type === 'link') {
    const safeUrl = sanitizeTaskNoteUrl(typeof node.url === 'string' ? node.url : '');
    return safeUrl && children ? '[' + children + '](' + safeUrl + ')' : children;
  }
  return children;
};

const serializePlainBlock = (node: TaskNoteSerializedNode): string => {
  if (node.type === 'text') return typeof node.text === 'string' ? node.text : '';
  if (node.type === 'linebreak') return '\n';
  if (node.type === 'list') {
    return normalizeChildren(node.children).map(serializePlainBlock).filter(Boolean).join('\n');
  }
  if (node.type === 'listitem') {
    return normalizeChildren(node.children).map(serializePlainBlock).filter(Boolean).join('\n');
  }
  return normalizeChildren(node.children).map(serializePlainBlock).join('');
};

const serializeMarkdownList = (node: TaskNoteSerializedNode): string => {
  const ordered = node.listType === 'number';
  const start = typeof node.start === 'number' ? node.start : 1;
  return normalizeChildren(node.children)
    .map((item, index) => {
      const itemChildren = normalizeChildren(item.children);
      const inline = itemChildren
        .filter(child => child.type !== 'list')
        .map(serializeInlineMarkdown)
        .join('')
        .trim();
      const nested = itemChildren
        .filter(child => child.type === 'list')
        .map(serializeMarkdownList)
        .join('\n')
        .split('\n')
        .filter(Boolean)
        .map(line => '  ' + line)
        .join('\n');
      const marker = ordered ? String(start + index) + '.' : '-';
      return [marker + ' ' + inline, nested].filter(Boolean).join('\n').trimEnd();
    })
    .join('\n');
};

const serializeMarkdownBlock = (node: TaskNoteSerializedNode): string => {
  if (node.type === 'list') return serializeMarkdownList(node);
  if (node.type === 'heading') {
    const level = /^h[1-6]$/.test(String(node.tag)) ? Number(String(node.tag).slice(1)) : 3;
    return ('#'.repeat(level) + ' ' + normalizeChildren(node.children).map(serializeInlineMarkdown).join('').trim()).trim();
  }
  if (node.type === 'paragraph') {
    return normalizeChildren(node.children).map(serializeInlineMarkdown).join('').trimEnd();
  }
  return serializeInlineMarkdown(node).trimEnd();
};

export const taskNoteRichContentToPlainText = (richContent: TaskDetailNoteRichContent): string => {
  if (!isTaskNoteRichContent(richContent)) return '';
  const root = richContent.editorState.root as unknown as TaskNoteSerializedNode;
  return normalizeChildren(root.children)
    .map(serializePlainBlock)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

export const taskNoteRichContentToMarkdown = (richContent: TaskDetailNoteRichContent): string => {
  if (!isTaskNoteRichContent(richContent)) return '';
  const root = richContent.editorState.root as unknown as TaskNoteSerializedNode;
  return normalizeChildren(root.children)
    .map(serializeMarkdownBlock)
    .filter(block => block.trim().length > 0)
    .join('\n\n')
    .trim();
};

export const taskNoteToPlainText = (note: Pick<TaskDetailNote, 'content' | 'richContent'>): string => {
  if (!isTaskNoteRichContent(note.richContent)) return note.content;
  const projection = taskNoteRichContentToPlainText(note.richContent);
  return projection || note.content;
};

export const taskNoteToAiMarkdown = (note: Pick<TaskDetailNote, 'content' | 'richContent'>): string => {
  if (!isTaskNoteRichContent(note.richContent)) return note.content.trim();
  const projection = taskNoteRichContentToMarkdown(note.richContent);
  return projection || note.content.trim();
};
