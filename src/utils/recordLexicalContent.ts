import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getCharacterOffsets,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  $isTextNode,
  type LexicalNode,
  type TextNode,
} from 'lexical';
import { $createTaskMentionNode, $isTaskMentionNode } from '../components/Records/TaskMentionNode';
import {
  parseRecordContentMentions,
  serializeTaskMention,
  TASK_MENTION_PATTERN,
} from './recordContentMentions';

export const normalizeRecordContentNewlines = (content: string) =>
  content.replace(/\r\n?/g, '\n');

const createLexicalNodesFromInlineContent = (content: string): LexicalNode[] => {
  const nodes: LexicalNode[] = [];

  parseRecordContentMentions(content).forEach(segment => {
    if (segment.type === 'text') {
      if (segment.text) nodes.push($createTextNode(segment.text));
      return;
    }
    nodes.push($createTaskMentionNode(segment.nodeId, segment.title));
  });

  return nodes;
};

export const $setEditorContentFromRecordString = (content: string) => {
  const root = $getRoot();
  root.clear();

  const normalized = normalizeRecordContentNewlines(content);
  const lines = normalized.split('\n');
  const safeLines = lines.length ? lines : [''];

  safeLines.forEach(line => {
    const paragraph = $createParagraphNode();
    paragraph.append(...createLexicalNodesFromInlineContent(line));
    root.append(paragraph);
  });

  root.selectEnd();
};

const $serializeNode = (node: LexicalNode): string => {
  if ($isTextNode(node)) return node.getTextContent();
  if ($isLineBreakNode(node)) return '\n';
  if ($isTaskMentionNode(node)) return serializeTaskMention(node.getNodeId(), node.getTitle());
  if ($isElementNode(node)) return node.getChildren().map($serializeNode).join('');
  return node.getTextContent();
};

export const $serializeEditorContentToRecordString = () => {
  const root = $getRoot();
  return normalizeRecordContentNewlines(
    root.getChildren().map($serializeNode).join('\n'),
  );
};

export const $getRecordCursorOffset = () => {
  const selection = $getSelection();
  if (!selection || !$isRangeSelection(selection)) return null;
  return $getCharacterOffsets(selection)[1] ?? null;
};

export const $replaceTextNodeTaskMentionTokens = (textNode: TextNode) => {
  const text = textNode.getTextContent();
  if (!TASK_MENTION_PATTERN.test(text)) {
    TASK_MENTION_PATTERN.lastIndex = 0;
    return;
  }

  TASK_MENTION_PATTERN.lastIndex = 0;
  const replacementNodes: LexicalNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TASK_MENTION_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      replacementNodes.push($createTextNode(text.slice(lastIndex, match.index)));
    }
    replacementNodes.push($createTaskMentionNode(match[2], match[1]));
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    replacementNodes.push($createTextNode(text.slice(lastIndex)));
  }

  if (replacementNodes.length === 0) return;

  const [firstNode, ...restNodes] = replacementNodes;
  textNode.replace(firstNode);

  let previous = firstNode;
  restNodes.forEach(node => {
    previous.insertAfter(node);
    previous = node;
  });
};

export const createRecordContentPlainTextWithTaskToken = (nodeId: string, title: string) =>
  serializeTaskMention(nodeId, title);

export const $createLexicalNodesFromPastedRecordText = (text: string): LexicalNode[] => {
  const normalized = normalizeRecordContentNewlines(text);
  const nodes: LexicalNode[] = [];
  normalized.split('\n').forEach((line, index) => {
    if (index > 0) nodes.push($createLineBreakNode());
    nodes.push(...createLexicalNodesFromInlineContent(line));
  });
  return nodes;
};

