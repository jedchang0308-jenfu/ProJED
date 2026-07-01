import React from 'react';
import { CalendarDays, Check, CircleDot, MessageSquareText, NotebookText, Pencil, Plus, RefreshCw, SendHorizontal, Trash2, X } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import useAuthStore from '../store/useAuthStore';
import useBoardStore from '../store/useBoardStore';
import useTaskZoneStore from '../store/useTaskZoneStore';
import { toast } from '../store/useToastStore';
import type { TaskDetailNote, TaskNode, TaskStatus } from '../types';
import { TaskDragHandle } from './Wbs/TaskDragHandle';
import { Badge } from './ui/Badge';

const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: 'todo', label: '待辦' },
  { value: 'in_progress', label: '進行中' },
  { value: 'delayed', label: '延遲' },
  { value: 'onhold', label: '暫停' },
  { value: 'completed', label: '完成' },
  { value: 'unsure', label: '未定' },
];

const createTaskZoneNote = (index: number): TaskDetailNote => ({
  id: `task_zone_note_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
  title: `備註 ${index}`,
  content: '',
});

const formatTaskMeta = (task: TaskNode) => {
  const parts = [task.status === 'completed' ? '已完成' : '待歸位'];
  if (task.endDate) parts.push(`期限 ${task.endDate}`);
  return parts.join(' · ');
};

const TaskZoneDetailsPanel: React.FC<{
  task: TaskNode;
  onClose: () => void;
  onUpdate: (taskId: string, updates: Partial<TaskNode>) => Promise<void>;
}> = ({ task, onClose, onUpdate }) => {
  const [title, setTitle] = React.useState(task.title || '');
  const [startDate, setStartDate] = React.useState(task.startDate || '');
  const [endDate, setEndDate] = React.useState(task.endDate || '');
  const [notes, setNotes] = React.useState<TaskDetailNote[]>(
    task.detailNotes?.length
      ? task.detailNotes
      : [{ id: 'task_zone_note_default', title: '備註', content: task.description || '' }]
  );
  const notesDirty = React.useRef(false);

  React.useEffect(() => {
    setTitle(task.title || '');
    setStartDate(task.startDate || '');
    setEndDate(task.endDate || '');
    setNotes(
      task.detailNotes?.length
        ? task.detailNotes
        : [{ id: 'task_zone_note_default', title: '備註', content: task.description || '' }]
    );
    notesDirty.current = false;
  }, [task.id, task.title, task.startDate, task.endDate, task.description, task.detailNotes]);

  React.useEffect(() => {
    if (!notesDirty.current) return;

    const timer = window.setTimeout(() => {
      notesDirty.current = false;
      onUpdate(task.id, {
        detailNotes: notes,
        description: notes[0]?.content || '',
      }).catch(error => {
        notesDirty.current = true;
        toast.error(error instanceof Error ? error.message : '備註更新失敗。');
      });
    }, 450);

    return () => window.clearTimeout(timer);
  }, [notes, onUpdate, task.id]);

  const closeDetails = () => {
    if (notesDirty.current) {
      notesDirty.current = false;
      onUpdate(task.id, {
        detailNotes: notes,
        description: notes[0]?.content || '',
      }).catch(error => toast.error(error instanceof Error ? error.message : '備註更新失敗。'));
    }
    onClose();
  };

  const saveTitle = () => {
    const nextTitle = title.trim();
    if (!nextTitle) {
      setTitle(task.title || '');
      return;
    }
    if (nextTitle !== task.title) {
      onUpdate(task.id, { title: nextTitle })
        .catch(error => toast.error(error instanceof Error ? error.message : '任務名稱更新失敗。'));
    }
    setTitle(nextTitle);
  };

  const updateDate = (field: 'startDate' | 'endDate', value: string) => {
    const nextStart = field === 'startDate' ? value : startDate;
    const nextEnd = field === 'endDate' ? value : endDate;
    if (nextStart && nextEnd && nextStart > nextEnd) {
      toast.error('開始日期不能晚於結束日期。');
      return;
    }

    if (field === 'startDate') setStartDate(value);
    if (field === 'endDate') setEndDate(value);
    onUpdate(task.id, { [field]: value } as Partial<TaskNode>)
      .catch(error => toast.error(error instanceof Error ? error.message : '日期更新失敗。'));
  };

  const updateStatus = (status: TaskStatus) => {
    onUpdate(task.id, { status })
      .catch(error => toast.error(error instanceof Error ? error.message : '狀態更新失敗。'));
  };

  const updateNote = (noteId: string, updates: Partial<TaskDetailNote>) => {
    notesDirty.current = true;
    setNotes(current => current.map(note => note.id === noteId ? { ...note, ...updates } : note));
  };

  const addNote = () => {
    notesDirty.current = true;
    setNotes(current => [...current, createTaskZoneNote(current.length + 1)]);
  };

  return (
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeDetails();
      }}
      data-task-zone-details="true"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="min-w-0 flex-1 pr-3">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={saveTitle}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === 'Enter') {
                  event.preventDefault();
                  saveTitle();
                  event.currentTarget.blur();
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setTitle(task.title || '');
                  event.currentTarget.blur();
                }
              }}
              className="h-9 w-full rounded-lg border border-transparent bg-transparent px-2 text-sm font-bold text-slate-900 outline-none transition hover:border-slate-200 hover:bg-slate-50 focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/15"
              aria-label="編輯任務名稱"
              data-task-zone-details-title="true"
            />
            <p className="px-2 text-xs text-slate-500">個人任務詳情；歸位到看板後可使用指派、標籤、紀錄與依賴等看板功能。</p>
          </div>
          <button
            type="button"
            onClick={closeDetails}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            title="關閉"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <section className="border-b border-slate-100 pb-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700">
              <CalendarDays size={16} className="text-primary" />
              <span>任務屬性</span>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="text-xs font-semibold text-slate-500">
                狀態
                <div className="mt-1 flex items-center gap-2">
                  <CircleDot size={15} className="text-slate-400" />
                  <select
                    value={task.status || 'todo'}
                    onChange={(event) => updateStatus(event.target.value as TaskStatus)}
                    className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                  >
                    {STATUS_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </label>
              <label className="text-xs font-semibold text-slate-500">
                開始日期
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => updateDate('startDate', event.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm text-slate-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
              </label>
              <label className="text-xs font-semibold text-slate-500">
                結束日期
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => updateDate('endDate', event.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm text-slate-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
              </label>
            </div>
          </section>

          <section className="pt-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                <MessageSquareText size={16} className="text-primary" />
                <span>備註欄</span>
              </div>
              <button
                type="button"
                onClick={addNote}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white transition hover:bg-slate-700"
              >
                <Plus size={13} />
                新增備註欄
              </button>
            </div>
            <div className="grid gap-3">
              {notes.map(note => (
                <div key={note.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <input
                    value={note.title}
                    onChange={(event) => updateNote(note.id, { title: event.target.value })}
                    className="mb-2 h-8 w-full rounded-md border border-transparent bg-white px-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                    placeholder="備註標題"
                  />
                  <textarea
                    value={note.content}
                    onChange={(event) => updateNote(note.id, { content: event.target.value })}
                    className="min-h-[120px] w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                    placeholder="輸入備註內容"
                  />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

const PersonalTaskCardBody: React.FC<{
  task: TaskNode;
  dragHandle?: React.ReactNode;
  isDragging?: boolean;
  onToggleComplete: (task: TaskNode) => void;
  onRemove: (task: TaskNode) => void;
  onRename: (task: TaskNode, title: string) => void;
  onOpenDetails: (task: TaskNode) => void;
}> = ({ task, dragHandle = null, isDragging = false, onToggleComplete, onRemove, onRename, onOpenDetails }) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [draftTitle, setDraftTitle] = React.useState(task.title);

  React.useEffect(() => {
    setDraftTitle(task.title);
  }, [task.title]);

  const commitRename = () => {
    const nextTitle = draftTitle.trim();
    setIsEditing(false);
    if (!nextTitle || nextTitle === task.title) {
      setDraftTitle(task.title);
      return;
    }
    onRename(task, nextTitle);
  };

  return (
    <div
      className={`group flex items-start gap-2 rounded-xl border bg-white px-3 py-3 shadow-sm transition ${
        isDragging ? 'opacity-50 shadow-lg' : 'border-slate-200 hover:border-primary/25 hover:shadow-md'
      }`}
      data-task-zone-item="true"
      data-task-id={task.id}
    >
      {dragHandle}

      <div className="min-w-0 flex-1">
        {isEditing ? (
          <input
            value={draftTitle}
            autoFocus
            onChange={(event) => setDraftTitle(event.target.value)}
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === 'Enter') {
                event.preventDefault();
                event.currentTarget.blur();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                setDraftTitle(task.title);
                setIsEditing(false);
              }
            }}
            className="w-full rounded-md border border-primary bg-white px-2 py-1 text-sm font-semibold text-slate-800 outline-none ring-2 ring-primary/20"
          />
        ) : (
          <div className={`truncate text-sm font-semibold ${task.status === 'completed' ? 'text-emerald-600 line-through' : 'text-slate-800'}`}>
            {task.title || '未命名任務'}
          </div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          <span>{formatTaskMeta(task)}</span>
          <Badge variant="success">已同步</Badge>
        </div>
        {task.description ? (
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{task.description}</p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => onOpenDetails(task)}
          className="rounded-md p-1.5 text-slate-400 hover:bg-blue-50 hover:text-primary"
          title="開啟詳情"
          data-task-zone-open-details="true"
        >
          <NotebookText size={14} />
        </button>
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-primary"
          title="重新命名"
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          onClick={() => onToggleComplete(task)}
          className="rounded-md p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
          title={task.status === 'completed' ? '取消完成' : '標記完成'}
        >
          <Check size={15} />
        </button>
        <button
          type="button"
          onClick={() => onRemove(task)}
          className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
          title="刪除"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
};

const PersonalTaskCard: React.FC<{
  task: TaskNode;
  onToggleComplete: (task: TaskNode) => void;
  onRemove: (task: TaskNode) => void;
  onRename: (task: TaskNode, title: string) => void;
  onOpenDetails: (task: TaskNode) => void;
}> = (props) => <PersonalTaskCardBody {...props} />;

const DraggablePersonalTaskCard: React.FC<{
  task: TaskNode;
  canPlaceOnBoard?: boolean;
  onToggleComplete: (task: TaskNode) => void;
  onRemove: (task: TaskNode) => void;
  onRename: (task: TaskNode, title: string) => void;
  onOpenDetails: (task: TaskNode) => void;
}> = ({ task, canPlaceOnBoard = false, ...handlers }) => {
  const disabled = !canPlaceOnBoard;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `personal-task-zone-${task.id}`,
    disabled,
    data: {
      type: 'personal-task-zone-item',
      taskId: task.id,
      title: task.title,
    },
  });

  return (
    <div ref={setNodeRef}>
      <PersonalTaskCardBody
        {...handlers}
        task={task}
        isDragging={isDragging}
        dragHandle={(
          <TaskDragHandle
            attributes={attributes}
            listeners={listeners}
            disabled={disabled}
            title={disabled ? '目前看板沒有建立任務權限' : '拖到看板位置歸位'}
            size="sm"
            className="-ml-1 mt-0.5"
          />
        )}
      />
    </div>
  );
};

const TaskZoneComposer: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const createTask = useTaskZoneStore(state => state.createTask);
  const isMutating = useTaskZoneStore(state => state.isMutating);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    try {
      await createTask({ title: trimmedTitle, description: description.trim() || null });
      setTitle('');
      setDescription('');
      toast.success('已建立任務，留在待歸位。');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '快速建立任務失敗。');
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="快速建立任務..."
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/15"
        data-task-zone-title-input="true"
      />
      {!compact ? (
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="補充描述，可稍後再整理..."
          rows={3}
          className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/15"
          data-task-zone-description-input="true"
        />
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500">直接成為雲端任務，未歸位前只在個人任務專區。</span>
        <button
          type="submit"
          disabled={!title.trim() || isMutating}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-slate-300"
          data-task-zone-create="true"
        >
          <SendHorizontal size={15} />
          建立任務
        </button>
      </div>
    </form>
  );
};

export const TaskZoneBoardPanel: React.FC<{ canCreateTask?: boolean }> = ({ canCreateTask = false }) => {
  const user = useAuthStore(state => state.user);
  const tasks = useTaskZoneStore(state => state.tasks);
  const load = useTaskZoneStore(state => state.load);
  const updateTask = useTaskZoneStore(state => state.updateTask);
  const removeTask = useTaskZoneStore(state => state.removeTask);
  const isLoading = useTaskZoneStore(state => state.isLoading);
  const [isOpen, setIsOpen] = React.useState(true);
  const [detailsTaskId, setDetailsTaskId] = React.useState<string | null>(null);
  const pendingTasks = tasks.filter(task => !task.isArchived && task.status !== 'completed');
  const detailsTask = detailsTaskId ? tasks.find(task => task.id === detailsTaskId) : null;

  React.useEffect(() => {
    if (!user?.uid) return;
    load().catch(console.error);
  }, [load, user?.uid]);

  const toggleComplete = (task: TaskNode) => {
    updateTask(task.id, { status: task.status === 'completed' ? 'todo' : 'completed' })
      .catch(error => toast.error(error instanceof Error ? error.message : '任務狀態更新失敗。'));
  };

  const rename = (task: TaskNode, title: string) => {
    updateTask(task.id, { title })
      .catch(error => toast.error(error instanceof Error ? error.message : '任務重新命名失敗。'));
  };

  return (
    <section
      className="fixed inset-x-2 bottom-2 z-[9996] mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/15 sm:inset-x-auto sm:right-4 sm:w-[440px]"
      data-task-zone-board-panel="true"
      aria-label="任務專區"
    >
      <button
        type="button"
        onClick={() => setIsOpen(open => !open)}
        className="flex w-full items-center justify-between gap-3 border-b border-slate-200 px-3 py-2 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <NotebookText size={17} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-slate-900">任務專區</span>
            <span className="block truncate text-xs text-slate-500">快速建立任務，拖到看板定位</span>
          </span>
        </span>
        <Badge variant={pendingTasks.length > 0 ? 'warning' : 'success'}>
          {pendingTasks.length > 0 ? `${pendingTasks.length} 待歸位` : '已清空'}
        </Badge>
      </button>

      {isOpen ? (
        <div className="space-y-3 p-3">
          <TaskZoneComposer compact />
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
            拖曳左側把手到看板位置，即可歸位成正式看板任務。
          </div>
          <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
            {isLoading ? <div className="text-xs text-slate-500">載入任務專區...</div> : null}
            {pendingTasks.map(task => (
              <DraggablePersonalTaskCard
                key={task.id}
                task={task}
                canPlaceOnBoard={canCreateTask}
                onToggleComplete={toggleComplete}
                onRemove={(item) => removeTask(item.id).catch(error => toast.error(error instanceof Error ? error.message : '任務刪除失敗。'))}
                onRename={rename}
                onOpenDetails={(item) => setDetailsTaskId(item.id)}
              />
            ))}
          </div>
        </div>
      ) : null}
      {detailsTask ? (
        <TaskZoneDetailsPanel
          task={detailsTask}
          onClose={() => setDetailsTaskId(null)}
          onUpdate={updateTask}
        />
      ) : null}
    </section>
  );
};

const TaskZoneView = () => {
  const user = useAuthStore(state => state.user);
  const setView = useBoardStore(state => state.setView);
  const activeBoard = useBoardStore(state => state.getActiveBoard());
  const tasks = useTaskZoneStore(state => state.tasks);
  const load = useTaskZoneStore(state => state.load);
  const updateTask = useTaskZoneStore(state => state.updateTask);
  const removeTask = useTaskZoneStore(state => state.removeTask);
  const isLoading = useTaskZoneStore(state => state.isLoading);
  const error = useTaskZoneStore(state => state.error);
  const [detailsTaskId, setDetailsTaskId] = React.useState<string | null>(null);
  const pendingTasks = tasks.filter(task => !task.isArchived && task.status !== 'completed');
  const completedTasks = tasks.filter(task => !task.isArchived && task.status === 'completed');
  const detailsTask = detailsTaskId ? tasks.find(task => task.id === detailsTaskId) : null;

  React.useEffect(() => {
    if (!user?.uid) return;
    load().catch(console.error);
  }, [load, user?.uid]);

  const toggleComplete = (task: TaskNode) => {
    updateTask(task.id, { status: task.status === 'completed' ? 'todo' : 'completed' })
      .catch(error => toast.error(error instanceof Error ? error.message : '任務狀態更新失敗。'));
  };

  const rename = (task: TaskNode, title: string) => {
    updateTask(task.id, { title })
      .catch(error => toast.error(error instanceof Error ? error.message : '任務重新命名失敗。'));
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-8" data-task-zone-view="true">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-gradient-to-br from-slate-900 via-blue-900 to-emerald-800 px-5 py-6 text-white sm:px-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-blue-100">
                  <NotebookText size={14} />
                  個人任務控制中心
                </div>
                <h2 className="mt-3 text-3xl font-black tracking-tight">任務專區</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100">
                  快速輸入會直接建立任務。還沒決定屬於哪個看板時，先留在待歸位；進入看板後可用相同拖移體驗定位。
                </p>
              </div>
              <button
                type="button"
                onClick={() => activeBoard ? setView('board') : setView('home')}
                className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/20"
              >
                {activeBoard ? '回到目前看板' : '回到工作區總覽'}
              </button>
            </div>
          </div>

          <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:p-7">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="mb-3 text-sm font-bold text-slate-800">快速建立任務</h3>
              <TaskZoneComposer />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-bold text-slate-800">狀態</div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-orange-50 p-3">
                  <div className="text-2xl font-black text-orange-600">{pendingTasks.length}</div>
                  <div className="text-xs font-semibold text-orange-700">待歸位</div>
                </div>
                <div className="rounded-xl bg-emerald-50 p-3">
                  <div className="text-2xl font-black text-emerald-600">{completedTasks.length}</div>
                  <div className="text-xs font-semibold text-emerald-700">已完成</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => load().catch(console.error)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:border-primary hover:text-primary"
              >
                <RefreshCw size={13} />
                重新整理
              </button>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-black text-slate-900">待歸位</h3>
            <span className="text-xs font-semibold text-slate-500">{pendingTasks.length} 筆</span>
          </div>
          {isLoading ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">載入任務專區...</div>
          ) : pendingTasks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
              目前沒有待歸位任務。上方建立後會先出現在這裡。
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {pendingTasks.map(task => (
                <PersonalTaskCard
                  key={task.id}
                  task={task}
                  onToggleComplete={toggleComplete}
                  onRemove={(item) => removeTask(item.id).catch(error => toast.error(error instanceof Error ? error.message : '任務刪除失敗。'))}
                  onRename={rename}
                  onOpenDetails={(item) => setDetailsTaskId(item.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
      {detailsTask ? (
        <TaskZoneDetailsPanel
          task={detailsTask}
          onClose={() => setDetailsTaskId(null)}
          onUpdate={updateTask}
        />
      ) : null}
    </div>
  );
};

export default TaskZoneView;
