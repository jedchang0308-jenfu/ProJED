import React from 'react';
import type { TaskDetailNote } from '../../types';
import {
  getTaskNoteSerializedRoot,
  sanitizeTaskNoteUrl,
  type TaskNoteSerializedNode,
} from '../../utils/taskNoteRichContent';

const TaskDetailNoteEditor = React.lazy(() => import('./TaskDetailNoteEditor'));

interface TaskDetailNoteFieldProps {
  canEdit: boolean;
  note: TaskDetailNote;
  noteIndex: number;
  onAdd: () => void;
  onDelete: () => void;
  onSave: () => void;
  onUpdate: (updates: Partial<TaskDetailNote>) => void;
}

const renderNodeChildren = (node: TaskNoteSerializedNode, keyPrefix: string): React.ReactNode[] => (
  (node.children ?? []).map((child, index) => renderRichNode(child, keyPrefix + '-' + index))
);

const renderRichNode = (node: TaskNoteSerializedNode, key: string): React.ReactNode => {
  const children = renderNodeChildren(node, key);
  if (node.type === 'text') {
    const format = typeof node.format === 'number' ? node.format : 0;
    return (
      <span
        key={key}
        className={[
          format & 1 ? 'font-semibold' : '',
          format & 2 ? 'italic' : '',
          format & 4 ? 'line-through' : '',
          format & 8 ? 'underline underline-offset-2' : '',
        ].filter(Boolean).join(' ')}
      >
        {typeof node.text === 'string' ? node.text : ''}
      </span>
    );
  }
  if (node.type === 'linebreak') return <br key={key} />;
  if (node.type === 'paragraph') {
    return <p key={key} className="min-h-6 whitespace-pre-wrap">{children}</p>;
  }
  if (node.type === 'heading') {
    return <h3 key={key} className="mb-1 mt-2 text-sm font-semibold leading-6 text-slate-900">{children}</h3>;
  }
  if (node.type === 'list') {
    return node.listType === 'number'
      ? <ol key={key} start={typeof node.start === 'number' ? node.start : undefined} className="ml-5 list-decimal">{children}</ol>
      : <ul key={key} className="ml-5 list-disc">{children}</ul>;
  }
  if (node.type === 'listitem') return <li key={key} className="pl-0.5">{children}</li>;
  if (node.type === 'link') {
    const safeUrl = sanitizeTaskNoteUrl(typeof node.url === 'string' ? node.url : '');
    return safeUrl ? (
      <a
        key={key}
        href={safeUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="break-all text-blue-600 underline decoration-blue-300 underline-offset-2"
      >
        {children}
      </a>
    ) : <React.Fragment key={key}>{children}</React.Fragment>;
  }
  return <React.Fragment key={key}>{children}</React.Fragment>;
};

export const TaskDetailNoteContent: React.FC<{ note: TaskDetailNote }> = ({ note }) => {
  const root = getTaskNoteSerializedRoot(note);
  if (root) {
    const children = renderNodeChildren(root, 'root');
    if (children.length > 0) {
      return <div className="break-words text-sm leading-6 text-slate-700">{children}</div>;
    }
  }
  if (note.content) {
    return (
      <div className="break-words text-sm leading-6 text-slate-700">
        {note.content.replace(/\r\n?/g, '\n').split('\n').map((line, index) => (
          <p key={String(index) + '-' + line.slice(0, 12)} className="min-h-6 whitespace-pre-wrap">{line}</p>
        ))}
      </div>
    );
  }
  return <p className="text-sm leading-6 text-slate-400">尚無備註內容</p>;
};

const EditorLoadingFallback: React.FC<{ note: TaskDetailNote }> = ({ note }) => (
  <div className="min-h-[96px] rounded-md border border-slate-200/70 bg-slate-50/70 px-2 py-1.5">
    <TaskDetailNoteContent note={note} />
  </div>
);

const TaskDetailNoteField: React.FC<TaskDetailNoteFieldProps> = props => (
  <React.Suspense fallback={<EditorLoadingFallback note={props.note} />}>
    <TaskDetailNoteEditor {...props} />
  </React.Suspense>
);

export default TaskDetailNoteField;
