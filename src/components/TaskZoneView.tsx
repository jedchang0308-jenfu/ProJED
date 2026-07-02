import React from 'react';
import { CalendarDays, Check, CircleDot, MessageSquareText, NotebookText, Pencil, Pin, PinOff, Plus, RefreshCw, SendHorizontal, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import useAuthStore from '../store/useAuthStore';
import useBoardStore from '../store/useBoardStore';
import { useWbsStore } from '../store/useWbsStore';
import useTaskZoneStore from '../store/useTaskZoneStore';
import { toast } from '../store/useToastStore';
import type { TaskDetailNote, TaskNode, TaskStatus } from '../types';
import { TaskDragHandle } from './Wbs/TaskDragHandle';
import { Badge } from './ui/Badge';
import { nodeService } from '../services/dataBackend';
import {
  createAssignedToMeTaskSource,
  describeTaskSubscriptionScope,
  taskMatchesSubscriptionSource,
  type TaskSubscriptionScope,
} from '../utils/taskSubscriptionSources';

const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: 'todo', label: '待辦' },
  { value: 'in_progress', label: '進行中' },
  { value: 'delayed', label: '延遲' },
  { value: 'onhold', label: '暫停' },
  { value: 'completed', label: '完成' },
  { value: 'unsure', label: '未定' },
];

type TaskZoneSourceTab = 'unplaced' | 'my_tasks';

interface TaskZoneSourcePanelPrefs {
  open: boolean;
  pinned: boolean;
  tab: TaskZoneSourceTab;
  scope: TaskSubscriptionScope;
  customWorkspaceIds: string[];
  customBoardIds: string[];
}

const TASK_ZONE_SOURCE_PANEL_PREFS_KEY = 'projed-task-zone-source-panel';

const getDefaultTaskZoneSourcePanelPrefs = (): TaskZoneSourcePanelPrefs => ({
  open: true,
  pinned: false,
  tab: 'unplaced',
  scope: 'all',
  customWorkspaceIds: [],
  customBoardIds: [],
});

const readTaskZoneSourcePanelPrefs = (): TaskZoneSourcePanelPrefs => {
  if (typeof window === 'undefined') return getDefaultTaskZoneSourcePanelPrefs();
  try {
    const stored = window.localStorage.getItem(TASK_ZONE_SOURCE_PANEL_PREFS_KEY);
    if (!stored) return getDefaultTaskZoneSourcePanelPrefs();
    return { ...getDefaultTaskZoneSourcePanelPrefs(), ...JSON.parse(stored) };
  } catch {
    return getDefaultTaskZoneSourcePanelPrefs();
  }
};

const writeTaskZoneSourcePanelPrefs = (prefs: TaskZoneSourcePanelPrefs) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TASK_ZONE_SOURCE_PANEL_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // local preference only; ignore storage failures.
  }
};

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
          data-task-zone-remove="true"
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

const DraggableAssignedTaskCard: React.FC<{
  task: TaskNode;
  locationLabel: string;
  canDragInCurrentBoard: boolean;
  canDragTask: boolean;
  isCrossWorkspace: boolean;
  onToggleComplete: (task: TaskNode) => void;
  onArchive: (task: TaskNode) => void;
  onRename: (task: TaskNode, title: string) => void;
  onOpenDetails: (task: TaskNode) => void;
  onOpenBoard: (task: TaskNode) => void;
}> = ({
  task,
  locationLabel,
  canDragInCurrentBoard,
  canDragTask,
  isCrossWorkspace,
  onToggleComplete,
  onArchive,
  onRename,
  onOpenDetails,
  onOpenBoard,
}) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [draftTitle, setDraftTitle] = React.useState(task.title || '');
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `task-zone-my-task-${task.id}`,
    disabled: !canDragTask,
    data: {
      type: 'wbs-card',
      source: 'task-zone-my-task',
      nodeId: task.id,
      columnId: task.parentId || task.boardId,
      sourceWorkspaceId: task.workspaceId,
      sourceBoardId: task.boardId,
      title: task.title,
    },
  });

  React.useEffect(() => {
    setDraftTitle(task.title || '');
  }, [task.id, task.title]);

  const commitRename = () => {
    const nextTitle = draftTitle.trim();
    if (!nextTitle) {
      setDraftTitle(task.title || '');
      setIsEditing(false);
      return;
    }
    if (nextTitle !== task.title) onRename(task, nextTitle);
    setIsEditing(false);
  };

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition ${isDragging ? 'opacity-40' : 'hover:border-primary/30 hover:shadow-md'}`}
      data-task-zone-my-task-card="true"
      data-task-zone-my-task-id={task.id}
    >
      <div className="flex items-start gap-2">
        <TaskDragHandle
          attributes={attributes}
          listeners={listeners}
          disabled={!canDragTask}
          title={canDragInCurrentBoard
            ? '使用一般任務拖移方式調整位置'
            : isCrossWorkspace
              ? '拖到目前看板；若含標籤、依賴或紀錄關聯，系統會要求受控移動'
              : '拖到目前看板位置歸位'}
          size="sm"
          className="-ml-1 mt-0.5"
        />
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <input
              value={draftTitle}
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
                  setDraftTitle(task.title || '');
                  setIsEditing(false);
                }
              }}
              className="w-full rounded-md border border-primary bg-white px-2 py-1 text-sm font-semibold text-slate-800 outline-none ring-2 ring-primary/20"
            />
          ) : (
            <div className="truncate text-sm font-semibold text-slate-800">{task.title || '未命名任務'}</div>
          )}
          <div className="mt-1 truncate text-xs text-slate-500">{locationLabel}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            <Badge variant={task.status === 'completed' ? 'success' : 'warning'}>
              {task.status === 'completed' ? '已完成' : '指派給我'}
            </Badge>
            {canDragInCurrentBoard ? (
              <span className="font-semibold text-blue-600">可直接拖移定位</span>
            ) : !canDragTask ? (
              <span className="font-semibold text-slate-500">目前看板沒有移動權限</span>
            ) : isCrossWorkspace ? (
              <span className="flex items-center gap-1.5">
                <span className="font-semibold text-amber-600">跨工作區，含關聯時需受控移動</span>
                <button
                  type="button"
                  onClick={() => onOpenBoard(task)}
                  className="font-semibold text-primary hover:underline"
                >
                  到所在看板
                </button>
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <span className="font-semibold text-blue-600">可拖入目前看板</span>
                <button
                  type="button"
                  onClick={() => onOpenBoard(task)}
                  className="font-semibold text-primary hover:underline"
                >
                  到所在看板
                </button>
              </span>
            )}
          </div>
          {isCrossWorkspace ? (
            <div className="mt-2 rounded-lg border border-amber-100 bg-amber-50 px-2 py-1 text-[11px] font-semibold leading-relaxed text-amber-700">
              可拖入目前看板；若含標籤、依賴、紀錄或歷史關聯，系統會要求改用受控搬移。
            </div>
          ) : canDragTask && !canDragInCurrentBoard ? (
            <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50 px-2 py-1 text-[11px] font-semibold leading-relaxed text-blue-700">
              拖入目前看板時會檢查來源與目標看板權限，成功後移動同一個任務，不建立副本。
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onOpenDetails(task)}
            className="rounded-md p-1.5 text-slate-400 hover:bg-blue-50 hover:text-primary"
            title="開啟詳情"
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
            onClick={() => onArchive(task)}
            className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
            title="封存"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </div>
  );
};

export const TaskZoneSourcePanel: React.FC<{ canCreateTask?: boolean; canMoveTask?: boolean }> = ({
  canCreateTask = false,
  canMoveTask = false,
}) => {
  const user = useAuthStore(state => state.user);
  const workspaces = useBoardStore(state => state.workspaces);
  const activeWorkspaceId = useBoardStore(state => state.activeWorkspaceId);
  const activeBoardId = useBoardStore(state => state.activeBoardId);
  const setView = useBoardStore(state => state.setView);
  const switchBoard = useBoardStore(state => state.switchBoard);
  const nodes = useWbsStore(state => state.nodes);
  const updateNode = useWbsStore(state => state.updateNode);
  const tasks = useTaskZoneStore(state => state.tasks);
  const remoteAssignedTasks = useTaskZoneStore(state => state.assignedTasks);
  const load = useTaskZoneStore(state => state.load);
  const loadAssignedTasks = useTaskZoneStore(state => state.loadAssignedTasks);
  const patchAssignedTask = useTaskZoneStore(state => state.patchAssignedTask);
  const updateTask = useTaskZoneStore(state => state.updateTask);
  const removeTask = useTaskZoneStore(state => state.removeTask);
  const isLoading = useTaskZoneStore(state => state.isLoading);
  const isAssignedLoading = useTaskZoneStore(state => state.isAssignedLoading);
  const [prefs, setPrefs] = React.useState<TaskZoneSourcePanelPrefs>(() => readTaskZoneSourcePanelPrefs());
  const [detailsTarget, setDetailsTarget] = React.useState<{ id: string; source: 'personal' | 'assigned' } | null>(null);
  const pendingTasks = tasks.filter(task => !task.isArchived && task.status !== 'completed');

  const activeWorkspace = workspaces.find(workspace => workspace.id === activeWorkspaceId);
  const activeBoard = activeWorkspace?.boards.find(board => board.id === activeBoardId);
  const customWorkspaceCount = prefs.customWorkspaceIds.length;
  const customBoardCount = prefs.customBoardIds.length;

  const patchPrefs = (updates: Partial<TaskZoneSourcePanelPrefs>) => {
    setPrefs(current => {
      const next = { ...current, ...updates };
      writeTaskZoneSourcePanelPrefs(next);
      return next;
    });
  };

  const toggleCustomWorkspace = (workspaceId: string) => {
    patchPrefs({
      scope: 'custom',
      customWorkspaceIds: prefs.customWorkspaceIds.includes(workspaceId)
        ? prefs.customWorkspaceIds.filter(id => id !== workspaceId)
        : [...prefs.customWorkspaceIds, workspaceId],
    });
  };

  const toggleCustomBoard = (boardId: string) => {
    patchPrefs({
      scope: 'custom',
      customBoardIds: prefs.customBoardIds.includes(boardId)
        ? prefs.customBoardIds.filter(id => id !== boardId)
        : [...prefs.customBoardIds, boardId],
    });
  };

  React.useEffect(() => {
    if (!user?.uid) return;
    load().catch(console.error);
  }, [load, user?.uid]);

  const assignedTaskSource = React.useMemo(() => createAssignedToMeTaskSource({
    scope: prefs.scope,
    workspaceId: activeWorkspaceId,
    boardId: activeBoardId,
    workspaceIds: prefs.customWorkspaceIds,
    boardIds: prefs.customBoardIds,
  }), [activeBoardId, activeWorkspaceId, prefs.customBoardIds, prefs.customWorkspaceIds, prefs.scope]);

  React.useEffect(() => {
    if (!user?.uid) return;
    loadAssignedTasks(assignedTaskSource, user.uid).catch(console.error);
  }, [assignedTaskSource, loadAssignedTasks, user?.uid]);

  const toggleComplete = (task: TaskNode) => {
    updateTask(task.id, { status: task.status === 'completed' ? 'todo' : 'completed' })
      .catch(error => toast.error(error instanceof Error ? error.message : '任務狀態更新失敗。'));
  };

  const rename = (task: TaskNode, title: string) => {
    updateTask(task.id, { title })
      .catch(error => toast.error(error instanceof Error ? error.message : '任務重新命名失敗。'));
  };

  const assignedTasks = React.useMemo(() => {
    if (!user?.uid) return [];
    const localAssignedTasks = Object.values(nodes)
      .filter((task): task is TaskNode => Boolean(task) && taskMatchesSubscriptionSource(task, assignedTaskSource, user.uid))
    const byId = new Map<string, TaskNode>();
    remoteAssignedTasks.forEach(task => {
      if (taskMatchesSubscriptionSource(task, assignedTaskSource, user.uid)) byId.set(task.id, task);
    });
    localAssignedTasks.forEach(task => byId.set(task.id, task));
    return Array.from(byId.values())
      .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  }, [assignedTaskSource, nodes, remoteAssignedTasks, user?.uid]);

  const detailsTask = detailsTarget?.source === 'personal'
    ? tasks.find(task => task.id === detailsTarget.id)
    : detailsTarget?.source === 'assigned'
      ? assignedTasks.find(task => task.id === detailsTarget.id)
      : null;

  const getTaskLocationLabel = React.useCallback((task: TaskNode) => {
    const workspace = workspaces.find(item => item.id === task.workspaceId);
    const board = workspace?.boards.find(item => item.id === task.boardId);
    return `${workspace?.title || '未知工作區'} / ${board?.title || '未知看板'}`;
  }, [workspaces]);

  const persistAssignedTask = React.useCallback(async (task: TaskNode, updates: Partial<TaskNode>) => {
    const finalUpdates = { ...updates, updatedAt: Date.now() };
    await nodeService.update(task.workspaceId, task.boardId, task.id, finalUpdates);
    patchAssignedTask(task.id, finalUpdates);
    if (nodes[task.id]) updateNode(task.id, finalUpdates);
  }, [nodes, patchAssignedTask, updateNode]);

  const updateAssignedTask = React.useCallback(async (taskId: string, updates: Partial<TaskNode>) => {
    const task = assignedTasks.find(item => item.id === taskId);
    if (!task) throw new Error('找不到指派任務，請重新載入任務專區。');
    await persistAssignedTask(task, updates);
  }, [assignedTasks, persistAssignedTask]);

  const toggleAssignedComplete = (task: TaskNode) => {
    persistAssignedTask(task, { status: task.status === 'completed' ? 'todo' : 'completed' })
      .catch(error => toast.error(error instanceof Error ? error.message : '任務狀態更新失敗。'));
  };

  const renameAssigned = (task: TaskNode, title: string) => {
    persistAssignedTask(task, { title })
      .catch(error => toast.error(error instanceof Error ? error.message : '任務重新命名失敗。'));
  };

  const archiveAssigned = (task: TaskNode) => {
    persistAssignedTask(task, { isArchived: true })
      .catch(error => toast.error(error instanceof Error ? error.message : '任務封存失敗。'));
  };

  const openTaskBoard = (task: TaskNode) => {
    if (!task.workspaceId || !task.boardId) return;
    switchBoard(task.workspaceId, task.boardId);
    setView('board');
  };

  if (!prefs.open && !prefs.pinned) {
    return (
      <aside
        className="flex w-12 shrink-0 flex-col items-center border-r border-slate-200 bg-white py-3"
        data-task-zone-source-panel="collapsed"
        aria-label="任務專區"
      >
        <button
          type="button"
          onClick={() => patchPrefs({ open: true })}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary hover:bg-primary/15"
          title="開啟任務專區"
        >
          <NotebookText size={18} />
        </button>
        <div className="mt-3 rounded-full bg-orange-50 px-2 py-1 text-xs font-bold text-orange-600">
          {pendingTasks.length}
        </div>
      </aside>
    );
  }

  return (
    <section
      className="flex w-[340px] max-w-[82vw] shrink-0 flex-col border-r border-slate-200 bg-white shadow-[8px_0_24px_rgba(15,23,42,0.06)]"
      data-task-zone-source-panel="true"
      data-task-zone-board-panel="true"
      aria-label="任務專區來源面板"
    >
      <div className="border-b border-slate-200 px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <NotebookText size={18} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-black text-slate-900">任務專區</span>
              <span className="block truncate text-xs text-slate-500">跨工作區的個人任務來源</span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => patchPrefs({ pinned: !prefs.pinned, open: true })}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-primary"
              title={prefs.pinned ? '取消釘選' : '釘選在左側'}
            >
              {prefs.pinned ? <PinOff size={15} /> : <Pin size={15} />}
            </button>
            <button
              type="button"
              onClick={() => patchPrefs({ open: false })}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="收合"
            >
              <X size={15} />
            </button>
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => patchPrefs({ tab: 'unplaced' })}
            className={`rounded-xl px-3 py-2 text-xs font-bold transition ${prefs.tab === 'unplaced' ? 'bg-primary text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            data-task-zone-source-tab="unplaced"
            data-task-zone-source-tab-active={prefs.tab === 'unplaced' ? 'true' : 'false'}
          >
            待歸位 {pendingTasks.length}
          </button>
          <button
            type="button"
            onClick={() => patchPrefs({ tab: 'my_tasks' })}
            className={`rounded-xl px-3 py-2 text-xs font-bold transition ${prefs.tab === 'my_tasks' ? 'bg-primary text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            data-task-zone-source-tab="my_tasks"
            data-task-zone-source-tab-active={prefs.tab === 'my_tasks' ? 'true' : 'false'}
          >
            我的任務 {assignedTasks.length}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {prefs.tab === 'unplaced' ? (
          <div className="space-y-3">
            <TaskZoneComposer compact />
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
              拖曳左側把手到看板任務、欄位或子任務區，會使用與一般任務相同的定位框。
            </div>
            <div className="space-y-2">
              {isLoading ? <div className="text-xs text-slate-500">載入任務專區...</div> : null}
              {pendingTasks.length === 0 && !isLoading ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs font-semibold text-slate-500">
                  目前沒有待歸位任務。
                </div>
              ) : null}
              {pendingTasks.map(task => (
                <DraggablePersonalTaskCard
                  key={task.id}
                  task={task}
                  canPlaceOnBoard={canCreateTask}
                  onToggleComplete={toggleComplete}
                  onRemove={(item) => removeTask(item.id).catch(error => toast.error(error instanceof Error ? error.message : '任務刪除失敗。'))}
                  onRename={rename}
                  onOpenDetails={(item) => setDetailsTarget({ id: item.id, source: 'personal' })}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-black text-slate-700">
                <SlidersHorizontal size={14} />
                訂閱範圍
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {([
                  ['all', describeTaskSubscriptionScope('all')],
                  ['workspace', describeTaskSubscriptionScope('workspace', activeWorkspace?.title)],
                  ['board', describeTaskSubscriptionScope('board', activeWorkspace?.title, activeBoard?.title)],
                  ['custom', describeTaskSubscriptionScope('custom')],
                ] as Array<[TaskSubscriptionScope, string]>).map(([scope, label]) => (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => patchPrefs({ scope })}
                    className={`truncate rounded-lg px-2 py-1.5 text-xs font-bold ${prefs.scope === scope ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}
                    title={label}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {prefs.scope === 'custom' ? (
                <div className="mt-3 space-y-2">
                  <div className="rounded-lg border border-blue-100 bg-blue-50 px-2 py-1.5 text-[11px] font-semibold leading-relaxed text-blue-700">
                    已選 {customWorkspaceCount} 個工作區、{customBoardCount} 個看板。勾工作區代表整個工作區；勾看板只代表該看板，兩者採聯集。
                  </div>
                  {workspaces.map(workspace => (
                    <div key={workspace.id} className="rounded-lg border border-slate-200 bg-white p-2">
                      <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-700">
                        <input
                          type="checkbox"
                          checked={prefs.customWorkspaceIds.includes(workspace.id)}
                          onChange={() => toggleCustomWorkspace(workspace.id)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-primary focus:ring-primary"
                        />
                        <span className="truncate">{workspace.title}</span>
                      </label>
                      <div className="mt-2 space-y-1 pl-5">
                        {workspace.boards.map(board => (
                          <label key={board.id} className="flex cursor-pointer items-center gap-2 text-[11px] font-semibold text-slate-500">
                            <input
                              type="checkbox"
                              checked={prefs.customBoardIds.includes(board.id)}
                              onChange={() => toggleCustomBoard(board.id)}
                              className="h-3 w-3 rounded border-slate-300 text-primary focus:ring-primary"
                            />
                            <span className="truncate">{board.title}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="mt-2 text-[11px] leading-4 text-slate-500">
                預設來源為所有可存取且指派給我的任務；自訂範圍採工作區與看板聯集，未勾選任何項目時不顯示任務。
              </div>
            </div>

            <div className="space-y-2">
              {isAssignedLoading ? (
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs font-semibold text-slate-500">
                  載入我的任務...
                </div>
              ) : null}
              {assignedTasks.length === 0 && !isAssignedLoading ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs font-semibold text-slate-500">
                  目前範圍內沒有指派給你的未完成任務。
                </div>
              ) : null}
              {assignedTasks.map(task => {
                const canDragInCurrentBoard = canMoveTask && task.workspaceId === activeWorkspaceId && task.boardId === activeBoardId;
                const isCrossWorkspace = task.workspaceId !== activeWorkspaceId;
                return (
                  <DraggableAssignedTaskCard
                    key={task.id}
                    task={task}
                    locationLabel={getTaskLocationLabel(task)}
                    canDragInCurrentBoard={canDragInCurrentBoard}
                    canDragTask={canMoveTask}
                    isCrossWorkspace={isCrossWorkspace}
                    onToggleComplete={toggleAssignedComplete}
                    onArchive={archiveAssigned}
                    onRename={renameAssigned}
                    onOpenDetails={(item) => setDetailsTarget({ id: item.id, source: 'assigned' })}
                    onOpenBoard={openTaskBoard}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      {detailsTask ? (
        <TaskZoneDetailsPanel
          task={detailsTask}
          onClose={() => setDetailsTarget(null)}
          onUpdate={detailsTarget?.source === 'assigned' ? updateAssignedTask : updateTask}
        />
      ) : null}
    </section>
  );
};

export const TaskZoneBoardPanel = TaskZoneSourcePanel;

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

  const openBoardTaskZone = (tab: TaskZoneSourceTab) => {
    writeTaskZoneSourcePanelPrefs({
      ...readTaskZoneSourcePanelPrefs(),
      open: true,
      tab,
    });
    setView(activeBoard ? 'board' : 'home');
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
              <div className="flex flex-col gap-2 sm:items-end">
                <button
                  type="button"
                  onClick={() => openBoardTaskZone('unplaced')}
                  className="rounded-xl bg-white px-4 py-2 text-sm font-black text-slate-900 shadow-sm transition hover:bg-blue-50"
                  data-task-zone-placement-cta="true"
                >
                  {activeBoard ? '到目前看板歸位' : '選擇看板歸位'}
                </button>
                <button
                  type="button"
                  onClick={() => openBoardTaskZone('my_tasks')}
                  className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/20"
                  data-task-zone-my-tasks-cta="true"
                >
                  {activeBoard ? '在看板查看我的任務' : '先選看板查看我的任務'}
                </button>
              </div>
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
              <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold leading-relaxed text-blue-700">
                我的任務與精準拖曳歸位會在看板左側任務專區面板操作，讓來源、看板結構與任務細節維持左到右資訊流。
              </div>
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
