import React from 'react';
import { Plus, Send, Trash2 } from 'lucide-react';
import type { TaskDetailNote } from '../../types';
import {
  appendPlainTextToTaskNote,
  getTaskNoteSerializedRoot,
  sanitizeTaskNoteUrl,
  type TaskNoteSerializedNode,
} from '../../utils/taskNoteRichContent';

const TaskDetailNoteDesktopEditor = React.lazy(() => import('./TaskDetailNoteDesktopEditor'));

interface TaskDetailNoteFieldProps {
  canEdit: boolean;
  note: TaskDetailNote;
  noteIndex: number;
  onAdd: () => void;
  onDelete: () => void;
  onSave: () => void;
  onUpdate: (updates: Partial<TaskDetailNote>) => void;
}

const useDesktopNoteEditor = () => {
  const [isDesktop, setIsDesktop] = React.useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
  ));

  React.useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const handleChange = () => setIsDesktop(media.matches);
    handleChange();
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  return isDesktop;
};

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

const ReadonlyNoteContent: React.FC<{ note: TaskDetailNote }> = ({ note }) => {
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

const NoteHeader: React.FC<{
  canEdit: boolean;
  note: TaskDetailNote;
  noteIndex: number;
  onAdd: () => void;
  onDelete: () => void;
  onUpdate: (updates: Partial<TaskDetailNote>) => void;
}> = ({ canEdit, note, noteIndex, onAdd, onDelete, onUpdate }) => (
  <div className="mb-1 flex min-w-0 items-center gap-1" data-task-detail-note-header="true">
    <input
      type="text"
      value={note.title}
      onChange={event => onUpdate({ title: event.target.value })}
      disabled={!canEdit}
      className="h-7 min-w-0 flex-1 border-0 bg-transparent px-0 text-sm font-semibold text-slate-800 outline-none transition hover:bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-100 disabled:text-slate-400"
      placeholder="備註標題"
      data-task-detail-note-title-input="true"
    />
    {noteIndex === 0 ? (
      <button
        type="button"
        onClick={onAdd}
        disabled={!canEdit}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-0 bg-transparent text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
        title="新增備註欄"
        aria-label="新增備註欄"
        data-task-detail-note-add="true"
      >
        <Plus size={14} />
      </button>
    ) : null}
    <button
      type="button"
      onClick={onDelete}
      disabled={!canEdit}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-0 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-100 disabled:cursor-not-allowed disabled:opacity-40"
      title="刪除此備註欄"
      aria-label={'刪除備註欄：' + (note.title || '未命名備註')}
      data-task-detail-note-delete="true"
    >
      <Trash2 size={14} />
    </button>
  </div>
);

const TaskDetailNoteMobile: React.FC<TaskDetailNoteFieldProps> = ({
  canEdit,
  note,
  noteIndex,
  onAdd,
  onDelete,
  onUpdate,
}) => {
  const [appendDraft, setAppendDraft] = React.useState('');
  const [appendError, setAppendError] = React.useState('');

  const handleAppend = () => {
    if (!appendDraft.trim()) return;
    try {
      const nextNote = appendPlainTextToTaskNote(note, appendDraft);
      onUpdate({
        content: nextNote.content,
        richContent: nextNote.richContent,
      });
      setAppendDraft('');
      setAppendError('');
    } catch (error) {
      console.error('[TaskNote] mobile append failed', error);
      setAppendError('追加失敗，文字已保留，請再試一次。');
    }
  };

  return (
    <div className="min-w-0" data-task-detail-note-card="true" data-task-note-mobile-readonly="true">
      <NoteHeader
        canEdit={canEdit}
        note={note}
        noteIndex={noteIndex}
        onAdd={onAdd}
        onDelete={onDelete}
        onUpdate={onUpdate}
      />
      <div
        className="min-h-[72px] w-full rounded-md border border-slate-200/70 bg-slate-50/70 px-2 py-1.5"
        data-task-note-readonly-content="true"
      >
        <ReadonlyNoteContent note={note} />
      </div>
      {canEdit ? (
        <div className="mt-2 rounded-md border border-slate-200 bg-white p-2" data-task-note-mobile-append="true">
          <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={'task-note-append-' + note.id}>
            追加文字
          </label>
          <textarea
            id={'task-note-append-' + note.id}
            value={appendDraft}
            onChange={event => setAppendDraft(event.target.value)}
            onKeyDown={event => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                handleAppend();
              }
            }}
            className="min-h-16 w-full resize-y rounded-md border border-slate-200 px-2 py-1.5 text-sm leading-6 text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            placeholder="補上新內容，不會改動原有格式"
            data-task-note-mobile-append-input="true"
          />
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <p className="min-w-0 text-xs text-red-600" role={appendError ? 'alert' : undefined}>{appendError}</p>
            <button
              type="button"
              onClick={handleAppend}
              disabled={!appendDraft.trim()}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-xs font-medium text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-slate-300"
              data-task-note-mobile-append-submit="true"
            >
              <Send size={13} />
              追加
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

const DesktopLoadingFallback: React.FC<{ note: TaskDetailNote }> = ({ note }) => (
  <div className="min-h-[96px] rounded-md border border-slate-200/70 bg-slate-50/70 px-2 py-1.5">
    <ReadonlyNoteContent note={note} />
  </div>
);

const TaskDetailNoteField: React.FC<TaskDetailNoteFieldProps> = props => {
  const isDesktop = useDesktopNoteEditor();
  if (!isDesktop) return <TaskDetailNoteMobile {...props} />;

  return (
    <React.Suspense fallback={<DesktopLoadingFallback note={props.note} />}>
      <TaskDetailNoteDesktopEditor {...props} />
    </React.Suspense>
  );
};

export default TaskDetailNoteField;
