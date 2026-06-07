import {
  $applyNodeReplacement,
  DecoratorNode,
  type DOMConversionMap,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalEditor,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical';
import { serializeTaskMention } from '../../utils/recordContentMentions';

export type SerializedTaskMentionNode = Spread<{
  nodeId: string;
  title: string;
}, SerializedLexicalNode>;

export class TaskMentionNode extends DecoratorNode<null> {
  __nodeId: string;
  __title: string;

  static getType(): string {
    return 'task-mention';
  }

  static clone(node: TaskMentionNode): TaskMentionNode {
    return new TaskMentionNode(node.__nodeId, node.__title, node.__key);
  }

  static importJSON(serializedNode: SerializedTaskMentionNode): TaskMentionNode {
    return $createTaskMentionNode(serializedNode.nodeId, serializedNode.title);
  }

  static importDOM(): DOMConversionMap | null {
    return {
      span: (domNode: HTMLElement) => {
        if (domNode.dataset.recordTaskMention !== 'true') return null;
        return {
          conversion: (element: HTMLElement) => ({
            node: $createTaskMentionNode(
              element.dataset.nodeId || '',
              element.dataset.title || element.textContent || 'Untitled task',
            ),
          }),
          priority: 4,
        };
      },
    };
  }

  constructor(nodeId: string, title: string, key?: NodeKey) {
    super(key);
    this.__nodeId = nodeId;
    this.__title = title;
  }

  exportJSON(): SerializedTaskMentionNode {
    return {
      ...super.exportJSON(),
      nodeId: this.__nodeId,
      title: this.__title,
      type: 'task-mention',
      version: 1,
    };
  }

  createDOM(_config: EditorConfig, _editor: LexicalEditor): HTMLElement {
    const span = document.createElement('span');
    span.contentEditable = 'false';
    span.setAttribute('data-record-task-mention', 'true');
    span.dataset.nodeId = this.__nodeId;
    span.dataset.title = this.__title;
    span.className = [
      'mx-0.5',
      'inline-flex',
      'max-w-full',
      'translate-y-[2px]',
      'select-all',
      'items-center',
      'gap-1',
      'rounded-md',
      'border',
      'border-blue-200',
      'bg-blue-50',
      'px-1.5',
      'py-0.5',
      'text-xs',
      'font-medium',
      'text-blue-700',
      'shadow-sm',
    ].join(' ');
    span.title = this.__title;
    span.textContent = this.__title;
    return span;
  }

  updateDOM(prevNode: TaskMentionNode, dom: HTMLElement): boolean {
    if (prevNode.__nodeId !== this.__nodeId || prevNode.__title !== this.__title) {
      dom.dataset.nodeId = this.__nodeId;
      dom.dataset.title = this.__title;
      dom.title = this.__title;
      dom.textContent = this.__title;
    }
    return false;
  }

  exportDOM(): DOMExportOutput {
    const span = document.createElement('span');
    span.setAttribute('data-record-task-mention', 'true');
    span.dataset.nodeId = this.__nodeId;
    span.dataset.title = this.__title;
    span.textContent = this.__title;
    return { element: span };
  }

  decorate(): null {
    return null;
  }

  getTextContent(): string {
    return serializeTaskMention(this.__nodeId, this.__title);
  }

  getTextContentSize(): number {
    return this.getTextContent().length;
  }

  isInline(): boolean {
    return true;
  }

  isKeyboardSelectable(): boolean {
    return true;
  }

  getNodeId(): string {
    return this.__nodeId;
  }

  getTitle(): string {
    return this.__title;
  }
}

export const $createTaskMentionNode = (nodeId: string, title: string): TaskMentionNode =>
  $applyNodeReplacement(new TaskMentionNode(nodeId, title));

export const $isTaskMentionNode = (node: unknown): node is TaskMentionNode =>
  node instanceof TaskMentionNode;

