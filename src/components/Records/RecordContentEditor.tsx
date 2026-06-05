import React from 'react';
import type { TaskNode } from '../../types';
import {
  parseRecordContentMentions,
  serializeTaskMention,
} from '../../utils/recordContentMentions';

interface RecordContentEditorProps {
  value: string;
  nodes: Record<string, TaskNode>;
  placeholder?: string;
  cursorOffset: number | null;
  onChange: (value: string) => void;
  onCursorOffsetChange: (offset: number) => void;
}

const isTaskMentionElement = (node: Node): node is HTMLElement =>
  node instanceof HTMLElement && node.dataset.recordTaskMention === 'true';

const textLengthForNode = (node: Node): number => {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.length ?? 0;
  if (node instanceof HTMLBRElement) return 1;
  if (isTaskMentionElement(node)) {
    return serializeTaskMention(node.dataset.nodeId || '', node.dataset.title || '').length;
  }
  return Array.from(node.childNodes).reduce((sum, child) => sum + textLengthForNode(child), 0);
};

const serializeNode = (node: Node): string => {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node instanceof HTMLBRElement) return '\n';
  if (isTaskMentionElement(node)) {
    return serializeTaskMention(node.dataset.nodeId || '', node.dataset.title || '');
  }
  return Array.from(node.childNodes).map(serializeNode).join('');
};

const serializeEditor = (root: HTMLElement) =>
  Array.from(root.childNodes).map(serializeNode).join('');

const createFileTextIcon = () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'shrink-0 text-blue-500');

  [
    'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z',
    'M14 2v4a2 2 0 0 0 2 2h4',
    'M10 9H8',
    'M16 13H8',
    'M16 17H8',
  ].forEach((pathData) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    svg.append(path);
  });

  return svg;
};

const renderEditorDom = (
  root: HTMLElement,
  value: string,
  nodes: Record<string, TaskNode>
) => {
  const children: Node[] = [];

  parseRecordContentMentions(value).forEach((segment) => {
    if (segment.type === 'text') {
      if (segment.text) children.push(document.createTextNode(segment.text));
      return;
    }

    const storedTitle = segment.title;
    const displayTitle = nodes[segment.nodeId]?.title || storedTitle;
    const mention = document.createElement('span');
    mention.contentEditable = 'false';
    mention.setAttribute('data-record-task-mention', 'true');
    mention.dataset.nodeId = segment.nodeId;
    mention.dataset.title = storedTitle;
    mention.className = 'mx-0.5 inline-flex max-w-full translate-y-[2px] items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700 shadow-sm';
    mention.title = displayTitle;

    const title = document.createElement('span');
    title.className = 'max-w-[220px] truncate';
    title.textContent = displayTitle;

    mention.append(createFileTextIcon(), title);
    children.push(mention);
  });

  root.replaceChildren(...children);
};

const offsetFromSelection = (root: HTMLElement, target: Node, targetOffset: number): number => {
  if (target === root) {
    return Array.from(root.childNodes)
      .slice(0, targetOffset)
      .reduce((sum, child) => sum + textLengthForNode(child), 0);
  }

  let offset = 0;
  let found = false;

  const walk = (node: Node): void => {
    if (found) return;

    if (node === target) {
      if (node.nodeType === Node.TEXT_NODE) {
        offset += targetOffset;
      } else {
        offset += Array.from(node.childNodes)
          .slice(0, targetOffset)
          .reduce((sum, child) => sum + textLengthForNode(child), 0);
      }
      found = true;
      return;
    }

    for (const child of Array.from(node.childNodes)) {
      if (child === target || child.contains(target)) {
        walk(child);
        return;
      }
      offset += textLengthForNode(child);
    }
  };

  walk(root);
  return offset;
};

const findPositionForOffset = (
  root: HTMLElement,
  desiredOffset: number
): { node: Node; offset: number } => {
  let remaining = Math.max(0, desiredOffset);

  const walk = (node: Node): { node: Node; offset: number } | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      return { node, offset: Math.min(remaining, node.textContent?.length ?? 0) };
    }

    const children = Array.from(node.childNodes);
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index];
      const length = textLengthForNode(child);

      if (remaining <= length) {
        if (isTaskMentionElement(child)) {
          return { node, offset: remaining < length ? index : index + 1 };
        }
        return walk(child) ?? { node, offset: index };
      }

      remaining -= length;
    }

    return { node, offset: children.length };
  };

  return walk(root) ?? { node: root, offset: root.childNodes.length };
};

const RecordContentEditor: React.FC<RecordContentEditorProps> = ({
  value,
  nodes,
  placeholder,
  cursorOffset,
  onChange,
  onCursorOffsetChange,
}) => {
  const editorRef = React.useRef<HTMLDivElement | null>(null);
  const isFocusedRef = React.useRef(false);

  const updateCursorOffset = React.useCallback(() => {
    const root = editorRef.current;
    const selection = window.getSelection();
    if (!root || !selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer) && range.startContainer !== root) return;
    onCursorOffsetChange(offsetFromSelection(root, range.startContainer, range.startOffset));
  }, [onCursorOffsetChange]);

  React.useEffect(() => {
    const handleSelectionChange = () => {
      if (!isFocusedRef.current) return;
      updateCursorOffset();
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [updateCursorOffset]);

  React.useLayoutEffect(() => {
    const root = editorRef.current;
    if (!root) return;

    if (serializeEditor(root) !== value) {
      renderEditorDom(root, value, nodes);
    }
  }, [value, nodes]);

  React.useLayoutEffect(() => {
    const root = editorRef.current;
    if (!root || !isFocusedRef.current || cursorOffset === null) return;

    const selection = window.getSelection();
    if (!selection) return;

    const position = findPositionForOffset(root, cursorOffset);
    const range = document.createRange();
    range.setStart(position.node, position.offset);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }, [value, cursorOffset]);

  const handleInput = () => {
    const root = editorRef.current;
    if (!root) return;

    const nextValue = serializeEditor(root);
    updateCursorOffset();
    onChange(nextValue);
  };

  return (
    <div className="relative mt-1">
      {!value ? (
        <div className="pointer-events-none absolute left-3 top-2 text-sm leading-6 text-slate-400">
          {placeholder}
        </div>
      ) : null}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onFocus={() => {
          isFocusedRef.current = true;
          window.setTimeout(updateCursorOffset, 0);
        }}
        onBlur={() => {
          updateCursorOffset();
          isFocusedRef.current = false;
        }}
        onKeyUp={updateCursorOffset}
        onMouseUp={updateCursorOffset}
        onPaste={(event) => {
          event.preventDefault();
          const text = event.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, text);
          window.setTimeout(handleInput, 0);
        }}
        className="min-h-[150px] w-full resize-y whitespace-pre-wrap rounded-md border border-slate-200 px-3 py-2 text-sm leading-6 text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
      />
    </div>
  );
};

export default RecordContentEditor;
