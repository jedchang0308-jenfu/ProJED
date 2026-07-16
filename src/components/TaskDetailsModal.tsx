import React from 'react';
import dayjs from 'dayjs';
import { CircleDot, Lock, MessageSquareText, Plus, Send, Trash2, Unlock, X } from 'lucide-react';
import { useWbsStore } from '../store/useWbsStore';
import { useMemberStore } from '../store/useMemberStore';
import useRecordStore from '../store/useRecordStore';
import { TagPicker } from './Tags/TagPicker';
import TaskRecordTimeline from './Records/TaskRecordTimeline';
import type { TaskDetailNote, TaskNode, TaskStatus } from '../types';
import { useBoardPermissions } from '../hooks/useBoardPermissions';
import useBoardStore from '../store/useBoardStore';
import TaskAssignmentPicker from './TaskAssignmentPicker';

interface TaskDetailsModalProps {
  nodeId: string;
  onClose: () => void;
}

const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: 'todo', label: '待辦' },
  { value: 'in_progress', label: '進行中' },
  { value: 'delayed', label: '延遲' },
  { value: 'onhold', label: '暫停' },
  { value: 'completed', label: '完成' },
  { value: 'unsure', label: '未定' },
];

const createNote = (index: number): TaskDetailNote => ({
  id: `note_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
  title: `備註 ${index}`,
  content: '',
});

const SIZE_STORAGE_KEY = 'projed.taskDetailsModal.size.v2';

const readSavedSize = () => {
  const defaultWidth = typeof window !== 'undefined' ? Math.max(window.innerWidth * 0.5, 760) : 760;
  const defaultHeight = typeof window !== 'undefined' ? Math.max(window.innerHeight * 0.6, 620) : 620;
  const DEFAULT_SIZE = { width: defaultWidth, height: defaultHeight };

  if (typeof window === 'undefined') return DEFAULT_SIZE;

  try {
    const saved = window.localStorage.getItem(SIZE_STORAGE_KEY);
    if (!saved) return DEFAULT_SIZE;

    const parsed = JSON.parse(saved);
    // 如果因為之前的 bug 存到了過小的尺寸，就強制回歸預設值
    if (Number(parsed.width) < 500 || Number(parsed.height) < 500) {
        return DEFAULT_SIZE;
    }

    return {
      width: Number(parsed.width) || DEFAULT_SIZE.width,
      height: Number(parsed.height) || DEFAULT_SIZE.height,
    };
  } catch {
    return DEFAULT_SIZE;
  }
};

const buildAncestorPath = (
  node: TaskNode | undefined,
  nodes: Record<string, TaskNode>
): TaskNode[] => {
  if (!node?.parentId) return [];

  const ancestors: TaskNode[] = [];
  const seenAncestorIds = new Set<string>();
  let currentParentId: string | null = node.parentId;

  while (currentParentId) {
    if (seenAncestorIds.has(currentParentId)) break;
    seenAncestorIds.add(currentParentId);

    const parent: TaskNode | undefined = nodes[currentParentId];
    if (!parent || parent.isArchived) break;

    ancestors.unshift(parent);
    currentParentId = parent.parentId;
  }

  return ancestors;
};

export const TaskDetailsModal: React.FC<TaskDetailsModalProps> = ({ nodeId, onClose }) => {
  const node = useWbsStore((state) => state.nodes[nodeId]);
  const nodes = useWbsStore((state) => state.nodes);
  const updateNode = useWbsStore((state) => state.updateNode);
  const dependencies = useWbsStore((state) => state.dependencies);
  const getNodeLockStatus = useWbsStore((state) => state.getNodeLockStatus);
  const boardMembers = useMemberStore((state) => state.boardMembers);
  const membersLoading = useMemberStore((state) => state.loading);
  const modalRef = React.useRef<HTMLDivElement | null>(null);
  const titleInputRef = React.useRef<HTMLInputElement | null>(null);
  const { canEditTask, canAssignTask } = useBoardPermissions();
  const pendingTitleEditNodeId = useBoardStore((state) => state.pendingTitleEditNodeId);
  const pendingTitleEditInitialValue = useBoardStore((state) => state.pendingTitleEditInitialValue);
  const setPendingTitleEditNodeId = useBoardStore((state) => state.setPendingTitleEditNodeId);
  const [size, setSize] = React.useState(readSavedSize);
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [titleValue, setTitleValue] = React.useState('');
  const [notes, setNotes] = React.useState<TaskDetailNote[]>([]);
  const [meetingDiscussion, setMeetingDiscussion] = React.useState('');
  const isMeetingMode = useRecordStore((state) => state.isMeetingMode);
  const appendTaskDiscussionToMeetingDraft = useRecordStore((state) => state.appendTaskDiscussionToMeetingDraft);
  const skipNextNotesSave = React.useRef(true);
  const skipNextTitleBlurSave = React.useRef(false);
  const assigneeOptions = React.useMemo(
    () => boardMembers.map(member => ({
      id: member.userId,
      label: member.profile?.displayName || member.profile?.email || member.userId,
      role: member.role,
    })),
    [boardMembers]
  );
  const currentNodeId = node?.id;
  const currentNodeTitle = node?.title || '';
  const currentNodeStartDate = node?.startDate || '';
  const currentNodeEndDate = node?.endDate || '';
  const currentNodeDetailNotes = node?.detailNotes;
  const currentNodeDescription = node?.description || '';

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return;
      if (event.target instanceof Element && event.target.closest('[data-task-details-title-input="true"]')) return;
      const hasNestedOverlay = Boolean(document.querySelector('[data-tag-picker-panel], .global-dialog-content'));
      if (hasNestedOverlay) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onClose();
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [onClose]);

  React.useEffect(() => {
    if (!currentNodeId) return;

    setTitleValue(currentNodeTitle);
    setStartDate(currentNodeStartDate);
    setEndDate(currentNodeEndDate);
    setNotes(
      currentNodeDetailNotes?.length
        ? currentNodeDetailNotes
        : [{ id: 'note_default', title: '備註', content: currentNodeDescription }]
    );
    skipNextNotesSave.current = true;
  }, [
    currentNodeDescription,
    currentNodeDetailNotes,
    currentNodeEndDate,
    currentNodeId,
    currentNodeStartDate,
    currentNodeTitle,
  ]);

  React.useEffect(() => {
    if (!node || !canEditTask) return;
    if (pendingTitleEditNodeId !== node.id) return;

    const initialValue = pendingTitleEditInitialValue;
    if (initialValue !== null) setTitleValue(initialValue);
    setPendingTitleEditNodeId(null);

    window.requestAnimationFrame(() => {
      const input = titleInputRef.current;
      if (!input) return;
      input.focus();
      if (initialValue !== null) {
        input.setSelectionRange(initialValue.length, initialValue.length);
        return;
      }
      input.select();
    });
  }, [
    canEditTask,
    node,
    pendingTitleEditInitialValue,
    pendingTitleEditNodeId,
    setPendingTitleEditNodeId,
  ]);

  React.useEffect(() => {
    const modal = modalRef.current;
    if (!modal || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      // 避免使用 entry.contentRect.width (content-box) 導致無限縮小迴圈
      // 改用 offsetWidth / offsetHeight 以取得包含 border 的正確大小
      const nextSize = {
        width: Math.round(modal.offsetWidth),
        height: Math.round(modal.offsetHeight),
      };
      setSize(nextSize);
      window.localStorage.setItem(SIZE_STORAGE_KEY, JSON.stringify(nextSize));
    });

    observer.observe(modal);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (!node) return;

    if (skipNextNotesSave.current) {
      skipNextNotesSave.current = false;
      return;
    }

    const timer = window.setTimeout(() => {
      if (!canEditTask) return;
      updateNode(node.id, {
        detailNotes: notes,
        description: notes[0]?.content || '',
      });
    }, 450);

    return () => window.clearTimeout(timer);
  }, [canEditTask, notes, node, updateNode]);

  const ancestorPath = buildAncestorPath(node, nodes);

  if (!node) return null;

  const durationDays = (startDate && endDate && dayjs(startDate).isValid() && dayjs(endDate).isValid())
    ? dayjs(endDate).diff(dayjs(startDate), 'day')
    : '';

  const updateDate = (field: 'startDate' | 'endDate', value: string) => {
    if (!canEditTask) return;
    const nextStart = field === 'startDate' ? value : startDate;
    const nextEnd = field === 'endDate' ? value : endDate;

    if (nextStart && nextEnd && nextStart > nextEnd) {
      window.alert('開始日期不能晚於結束日期。');
      return;
    }

    const updates = { [field]: value } as Partial<typeof node>;

    if (field === 'startDate') {
      setStartDate(value);
      if (node.isDurationLocked && durationDays !== '') {
        const newEndDate = dayjs(value).add(durationDays as number, 'day').format('YYYY-MM-DD');
        setEndDate(newEndDate);
        updates.endDate = newEndDate;
        
        // 如果連動更新結束日期後，發現違反結束日期的邊界（例如結束日期跑到了昨天以前），依然要觸發 delayed 邏輯
        if (node.status !== 'completed' && node.status !== 'unsure' && dayjs(newEndDate).isValid() && dayjs(newEndDate).isBefore(dayjs(), 'day')) {
          updates.status = 'delayed';
        }
      }
    }
    
    if (field === 'endDate') {
      setEndDate(value);
    }
    const shouldAutoDelay =
      nextEnd &&
      node.status !== 'completed' &&
      node.status !== 'unsure' &&
      dayjs(nextEnd).isValid() &&
      dayjs(nextEnd).isBefore(dayjs(), 'day');

    if (shouldAutoDelay) {
      updates.status = 'delayed';
    }

    updateNode(node.id, updates);
  };

  const handleAssignmentChange = (primaryIds: string[], collaboratorIds: string[]) => {
    if (!canAssignTask) return;
    updateNode(node.id, {
      assigneeIds: primaryIds,
      collaboratorIds,
      updatedAt: Date.now(),
    });
  };

  const saveTitle = () => {
    if (skipNextTitleBlurSave.current) {
      skipNextTitleBlurSave.current = false;
      setTitleValue(node.title || '');
      return;
    }
    if (!canEditTask) {
      setTitleValue(node.title || '');
      return;
    }

    const trimmed = titleValue.trim();
    if (!trimmed) {
      setTitleValue(node.title || '');
      return;
    }
    if (trimmed !== node.title) {
      updateNode(node.id, { title: trimmed, updatedAt: Date.now() });
    }
    setTitleValue(trimmed);
  };

  const handleTitleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      saveTitle();
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      skipNextTitleBlurSave.current = true;
      setTitleValue(node.title || '');
      event.currentTarget.blur();
    }
  };

  const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEditTask) return;
    const strVal = e.target.value;
    if (strVal === '') return;
    const val = parseInt(strVal, 10);
    if (isNaN(val) || val < 0) return;

    if (!startDate) {
      alert('防呆機制：請先設定開始日期，才能計算工期');
      e.target.value = '';
      return;
    }

    const nextEnd = dayjs(startDate).add(val, 'day').format('YYYY-MM-DD');

    // 呼叫原本的更新邏輯
    updateDate('endDate', nextEnd);
  };

  const handleToggleDurationLock = () => {
    if (!canEditTask) return;
    updateNode(node.id, { isDurationLocked: !node.isDurationLocked });
  };

  const updateNote = (noteId: string, updates: Partial<TaskDetailNote>) => {
    if (!canEditTask) return;
    setNotes((current) =>
      current.map((note) => (note.id === noteId ? { ...note, ...updates } : note))
    );
  };

  const addNote = () => {
    if (!canEditTask) return;
    setNotes((current) => [...current, createNote(current.length + 1)]);
  };

  const deleteNote = (noteId: string) => {
    if (!canEditTask) return;
    const note = notes.find((item) => item.id === noteId);
    const noteLabel = note?.title?.trim() || '此備註欄';
    const isLastNote = notes.length <= 1;
    const confirmed = window.confirm(
      isLastNote
        ? `刪除「${noteLabel}」後會保留一個空白備註欄。確定刪除內容？`
        : `確定刪除「${noteLabel}」？`
    );
    if (!confirmed) return;

    setNotes((current) => {
      const nextNotes = current.filter((item) => item.id !== noteId);
      return nextNotes.length > 0 ? nextNotes : [createNote(1)];
    });
  };

  const handleAppendMeetingDiscussion = () => {
    if (!canEditTask) return;
    const didAppend = appendTaskDiscussionToMeetingDraft(node.id, node.title || node.id, meetingDiscussion);
    if (didAppend) setMeetingDiscussion('');
  };

  const { startLocked, endLocked } = getNodeLockStatus(node.id, dependencies);
  const currentStatus = node.status || 'todo';
  const isDueToday = currentStatus !== 'completed' && !!endDate && dayjs(endDate).isSame(dayjs(), 'day');
  const currentStatusLabel = STATUS_OPTIONS.find((option) => option.value === currentStatus)?.label || '未設定';
  const formatMetaDate = (value: string) => (
    value && dayjs(value).isValid() ? dayjs(value).format('YYYY/MM/DD') : '未設定'
  );
  const tagCount = node.tagIds?.length || 0;
  const primaryCount = node.assigneeIds?.length || (node.assigneeId ? 1 : 0);
  const collaboratorCount = node.collaboratorIds?.length || 0;
  const assignmentSummary = primaryCount > 0
    ? `主責 ${primaryCount} 人${collaboratorCount > 0 ? `・協作 ${collaboratorCount} 人` : ''}`
    : collaboratorCount > 0
      ? `協作 ${collaboratorCount} 人`
      : '未指派';
  const scheduleSummary = `${formatMetaDate(startDate)} → ${formatMetaDate(endDate)}`;

  return (
    <div
      data-task-details-modal="true"
      data-task-id={node.id}
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        data-task-details-dialog="true"
        className="flex max-h-[90vh] max-w-[94vw] min-h-[420px] min-w-0 flex-col overflow-auto rounded-lg border border-slate-200 bg-white shadow-2xl"
        style={{
          width: size.width,
          height: size.height,
          resize: 'both',
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div
          className="flex items-start gap-3 border-b border-slate-200 px-5 py-4"
          data-task-details-header="true"
        >
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-col gap-2">
              {canEditTask ? (
                <input
                  ref={titleInputRef}
                  type="text"
                  value={titleValue}
                  onChange={(event) => setTitleValue(event.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={handleTitleKeyDown}
                  data-task-details-title-input="true"
                  aria-label="編輯任務名稱"
                  className="h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50/80 px-3 text-base font-semibold text-slate-900 outline-none transition hover:border-blue-200 hover:bg-white focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                  title={node.title}
                />
              ) : (
                <p className="truncate text-sm font-semibold text-slate-900" title={node.title}>
                  {node.title}
                </p>
              )}
              {ancestorPath.length > 0 && (
                <nav
                  aria-label="任務完整位置"
                  data-task-details-parent-path="true"
                  className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs font-medium leading-5 text-slate-500"
                >
                  <span className="shrink-0 font-semibold text-slate-400">位置</span>
                  {ancestorPath.map((ancestor, index) => (
                    <React.Fragment key={ancestor.id}>
                      <span
                        data-task-details-parent-name="true"
                        className="inline-flex min-w-0 max-w-[min(13rem,42vw)] truncate rounded-md border border-slate-200/80 bg-slate-50 px-2 py-0.5 text-slate-600"
                        title={ancestor.title || '未命名任務'}
                      >
                        {ancestor.title || '未命名任務'}
                      </span>
                      {index < ancestorPath.length - 1 && (
                        <span className="shrink-0 text-slate-300" aria-hidden="true">
                          /
                        </span>
                      )}
                    </React.Fragment>
                  ))}
                </nav>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100"
            title="關閉"
            aria-label="關閉任務詳情"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-4 py-4">
          <section className="border-b border-slate-100 pb-3" data-task-details-meta-section="true">
            <div className="grid gap-y-3" data-task-details-meta-grid="true">
              <details
                className="group rounded-xl border border-slate-200 bg-slate-50/80 shadow-sm md:hidden"
                data-task-details-mobile-meta="true"
              >
                <summary
                  className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 outline-none [&::-webkit-details-marker]:hidden"
                  data-task-details-mobile-meta-summary="true"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap gap-1.5">
                      <span className="inline-flex max-w-full items-center rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold leading-5 text-slate-600 ring-1 ring-slate-200">
                        狀態 {currentStatusLabel}
                      </span>
                      <span
                        className="inline-flex max-w-full truncate rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold leading-5 text-slate-600 ring-1 ring-slate-200"
                        title={scheduleSummary}
                      >
                        {scheduleSummary}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-[11px] leading-5 text-slate-500">
                      標籤 {tagCount}・{assignmentSummary}
                    </div>
                  </div>
                  <span className="inline-flex h-7 shrink-0 items-center rounded-full border border-blue-100 bg-blue-50 px-2 text-[11px] font-semibold text-blue-600 group-open:hidden">
                    編輯
                  </span>
                  <span className="hidden h-7 shrink-0 items-center rounded-full border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-500 group-open:inline-flex">
                    收合
                  </span>
                </summary>

                <div
                  className="space-y-2 border-t border-slate-200 bg-white px-3 py-3"
                  data-task-details-mobile-meta-controls="true"
                >
                  <div className="grid grid-cols-2 gap-2" data-task-details-mobile-schedule-controls="true">
                    <label className="min-w-0 text-xs font-medium text-slate-500" data-task-details-meta-label="true">
                      <span data-task-details-meta-label-text="true">狀態</span>
                      <div className="mt-1 flex items-center gap-2" data-task-details-meta-control-row="true">
                        <select
                          value={currentStatus}
                          onChange={(event) => { if (canEditTask) updateNode(node.id, { status: event.target.value as TaskStatus }); }}
                          disabled={!canEditTask}
                          className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        >
                          {STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </label>

                    <div className="min-w-0 rounded-md border border-slate-100 bg-slate-50 px-2 py-1.5" data-task-details-mobile-duration="true">
                      <div className="text-[11px] font-semibold leading-4 text-slate-500">工期</div>
                      <div className="mt-1 flex min-w-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleToggleDurationLock}
                          disabled={!canEditTask}
                          className={`inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border transition-colors ${
                            node.isDurationLocked
                              ? 'border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100'
                              : 'border-slate-200 bg-white text-slate-400 hover:bg-slate-100'
                          }`}
                          title={node.isDurationLocked ? '鎖定工期：自動推算結束日期' : '非鎖定：日期獨立計算'}
                        >
                          {node.isDurationLocked ? <Lock size={14} /> : <Unlock size={14} />}
                        </button>
                        <input
                          type="number"
                          min="0"
                          value={durationDays}
                          onChange={handleDurationChange}
                          placeholder="-"
                          disabled={!canEditTask || !node.isDurationLocked}
                          aria-label="工期天數"
                          className={`h-8 min-w-0 flex-1 rounded-md border px-1.5 text-center text-sm outline-none transition ${
                            !node.isDurationLocked
                              ? 'border-transparent bg-white text-slate-400'
                              : 'border-slate-200 bg-white text-slate-700 focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
                          }`}
                        />
                        <span className="shrink-0 text-xs font-medium text-slate-400">天</span>
                      </div>
                    </div>

                    <label className="min-w-0 text-xs font-medium text-slate-500" data-task-details-meta-label="true">
                      <span className="flex min-w-0 items-center justify-between gap-1" data-task-details-meta-label-text="true">
                        <span>開始</span>
                        {startLocked ? (
                          <span
                            className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border border-amber-200 bg-amber-50 text-amber-600"
                            title="開始日期已有依賴關係鎖定"
                          >
                            <Lock size={10} />
                          </span>
                        ) : null}
                      </span>
                      <div className="mt-1 flex items-center gap-2" data-task-details-meta-control-row="true">
                        <input
                          type="date"
                          value={startDate}
                          onChange={(event) => updateDate('startDate', event.target.value)}
                          readOnly={!canEditTask || startLocked}
                          className={`h-8 min-w-0 flex-1 rounded-md px-2 text-sm outline-none transition focus:ring-2 ${
                            !canEditTask || startLocked
                              ? 'border border-dashed border-slate-300 bg-slate-50 text-slate-500 pointer-events-none'
                              : 'border border-slate-200 text-slate-700 focus:border-blue-400 focus:ring-blue-100'
                          }`}
                        />
                      </div>
                    </label>

                    <label className="min-w-0 text-xs font-medium text-slate-500" data-task-details-meta-label="true">
                      <span className="flex min-w-0 items-center justify-between gap-1" data-task-details-meta-label-text="true">
                        <span>結束</span>
                        {endLocked || node.isDurationLocked ? (
                          <span
                            className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border border-amber-200 bg-amber-50 text-amber-600"
                            title={endLocked ? '結束日期已有依賴關係鎖定' : '因工期鎖定，由開始日期推算'}
                          >
                            <Lock size={10} />
                          </span>
                        ) : null}
                      </span>
                      <div className="mt-1 flex items-center gap-2" data-task-details-meta-control-row="true">
                        <input
                          type="date"
                          value={endDate}
                          onChange={(event) => updateDate('endDate', event.target.value)}
                          readOnly={!canEditTask || endLocked || node.isDurationLocked}
                          className={`h-8 min-w-0 flex-1 rounded-md px-2 text-sm outline-none transition focus:ring-2 ${
                            !canEditTask || endLocked || node.isDurationLocked
                              ? 'border border-dashed border-slate-300 bg-slate-50 text-slate-500 pointer-events-none'
                              : isDueToday
                              ? 'border border-orange-300 bg-orange-50 text-orange-700 shadow-[0_0_0_1px_rgba(251,146,60,0.25)] focus:border-orange-400 focus:ring-orange-100'
                              : 'border border-slate-200 text-slate-700 focus:border-blue-400 focus:ring-blue-100'
                          }`}
                        />
                      </div>
                    </label>
                  </div>

                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-2" data-task-details-meta-field="tags">
                    <div className="text-xs font-medium text-slate-500">
                      <div data-task-details-tag-picker-wrap="true">
                        <TagPicker
                          workspaceId={node.workspaceId}
                          selectedTagIds={node.tagIds || []}
                          onChange={(tagIds) => updateNode(node.id, { tagIds, updatedAt: Date.now() })}
                          disabled={!canEditTask}
                          compact
                          compactLabel="標籤"
                        />
                      </div>
                    </div>
                  </div>

                  <label className="block text-xs font-medium text-slate-500" data-task-details-meta-field="assignment">
                    <span data-task-details-meta-label-text="true">主責／協作</span>
                    <div className="mt-1 flex items-center gap-2" data-task-details-meta-control-row="true">
                      <TaskAssignmentPicker
                        node={node}
                        options={assigneeOptions}
                        membersLoading={membersLoading}
                        disabled={!canAssignTask}
                        fullSummary
                        onChange={handleAssignmentChange}
                      />
                    </div>
                  </label>
                </div>
              </details>

              <div
                className="hidden gap-x-3 gap-y-2 md:grid md:grid-cols-[8.5rem_minmax(0,1fr)] md:items-start"
                data-task-details-date-grid="true"
                data-task-details-schedule-row="true"
              >
                <div className="min-w-0" data-task-details-meta-field="status">
                  <label className="block text-xs font-medium text-slate-500" data-task-details-meta-label="true">
                    <span data-task-details-meta-label-text="true">狀態</span>
                    <div className="mt-1 flex items-center gap-2" data-task-details-meta-control-row="true">
                      <span className={`hidden h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-status-${currentStatus}/15 text-slate-500`}>
                        <CircleDot size={15} />
                      </span>
                      <select
                        value={currentStatus}
                        onChange={(event) => { if (canEditTask) updateNode(node.id, { status: event.target.value as TaskStatus }); }}
                        disabled={!canEditTask}
                        className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </label>
                </div>

                <div
                  className="grid min-w-0 gap-x-2 gap-y-2 md:grid-cols-[9.25rem_16.75rem] md:items-start md:justify-start"
                  data-task-details-schedule-controls="true"
                >
                  <label className="block text-xs font-medium text-slate-500" data-task-details-meta-label="true">
                    <span data-task-details-meta-label-text="true">開始日期</span>
                    <div className="mt-1 flex items-center gap-2" data-task-details-meta-control-row="true">
                      <input
                        type="date"
                        value={startDate}
                        onChange={(event) => updateDate('startDate', event.target.value)}
                        readOnly={!canEditTask || startLocked}
                        className={`h-8 min-w-0 flex-1 rounded-md px-2 text-sm outline-none transition focus:ring-2 ${
                          !canEditTask || startLocked
                            ? 'border border-dashed border-slate-300 bg-slate-50 text-slate-500 pointer-events-none'
                            : 'border border-slate-200 text-slate-700 focus:border-blue-400 focus:ring-blue-100'
                        }`}
                      />
                      <span
                        className={`${startLocked ? 'inline-flex' : 'hidden'} h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border ${
                          startLocked
                            ? 'border-amber-200 bg-amber-50 text-amber-600'
                            : 'border-slate-200 bg-slate-50 text-slate-300'
                        }`}
                        title={startLocked ? '開始日期已有依賴關係鎖定' : '開始日期沒有依賴關係鎖定'}
                      >
                        {startLocked ? <Lock size={15} /> : <Unlock size={15} />}
                      </span>
                    </div>
                  </label>

                  <label className="block text-xs font-medium text-slate-500" data-task-details-meta-label="true">
                    <span data-task-details-meta-label-text="true">結束日期</span>
                    <div className="mt-1 flex items-center gap-2" data-task-details-meta-control-row="true">
                      <input
                        type="date"
                        value={endDate}
                        onChange={(event) => updateDate('endDate', event.target.value)}
                        readOnly={!canEditTask || endLocked || node.isDurationLocked}
                        className={`h-8 min-w-0 flex-1 rounded-md px-2 text-sm outline-none transition focus:ring-2 ${
                          !canEditTask || endLocked || node.isDurationLocked
                            ? 'border border-dashed border-slate-300 bg-slate-50 text-slate-500 pointer-events-none'
                            : isDueToday
                            ? 'border border-orange-300 bg-orange-50 text-orange-700 shadow-[0_0_0_1px_rgba(251,146,60,0.25)] focus:border-orange-400 focus:ring-orange-100'
                            : 'border border-slate-200 text-slate-700 focus:border-blue-400 focus:ring-blue-100'
                        }`}
                      />
                      <span
                        className={`${endLocked || node.isDurationLocked ? 'inline-flex' : 'hidden'} h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border ${
                          endLocked || node.isDurationLocked
                            ? 'border-amber-200 bg-amber-50 text-amber-600'
                            : 'border-slate-200 bg-slate-50 text-slate-300'
                        }`}
                        title={endLocked ? '結束日期已有依賴關係鎖定' : (node.isDurationLocked ? '因工期鎖定，由開始日期推算' : '結束日期未鎖定')}
                      >
                        {endLocked || node.isDurationLocked ? <Lock size={15} /> : <Unlock size={15} />}
                      </span>
                      <span className="ml-0 flex shrink-0 items-center gap-1" title="工期（天）" data-task-details-duration-inline="true">
                        <button
                          type="button"
                          onClick={handleToggleDurationLock}
                          disabled={!canEditTask}
                          className={`inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border transition-colors ${
                            node.isDurationLocked
                              ? 'border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100'
                              : 'border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100'
                          }`}
                          title={node.isDurationLocked ? '鎖定工期：自動推算結束日期' : '非鎖定：日期獨立計算'}
                        >
                          {node.isDurationLocked ? <Lock size={15} /> : <Unlock size={15} />}
                        </button>
                        <input
                          type="number"
                          min="0"
                          value={durationDays}
                          onChange={handleDurationChange}
                          placeholder="-"
                          disabled={!canEditTask || !node.isDurationLocked}
                          aria-label="工期天數"
                          className={`h-8 w-10 rounded-md border px-1.5 text-sm text-center outline-none transition ${
                            !node.isDurationLocked
                              ? 'border-transparent bg-slate-50 text-slate-400'
                              : 'border-slate-200 text-slate-700 focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
                          }`}
                        />
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              <div
                className="hidden gap-x-3 gap-y-2 md:grid md:grid-cols-[8.5rem_minmax(0,1fr)] md:items-start"
                data-task-details-assignment-row="true"
              >
                <div className="min-w-0" data-task-details-meta-field="tags">
                  <div className="text-xs font-medium text-slate-500">
                    <div data-task-details-tag-picker-wrap="true">
                      <TagPicker
                        workspaceId={node.workspaceId}
                        selectedTagIds={node.tagIds || []}
                        onChange={(tagIds) => updateNode(node.id, { tagIds, updatedAt: Date.now() })}
                        disabled={!canEditTask}
                        compact
                        compactLabel="標籤"
                      />
                    </div>
                  </div>
                </div>

                <div className="min-w-0" data-task-details-meta-field="assignment">
                  <label className="block text-xs font-medium text-slate-500" data-task-details-meta-label="true">
                    <span data-task-details-meta-label-text="true">主責／協作</span>
                    <div className="mt-1 flex items-center gap-2" data-task-details-meta-control-row="true">
                      <TaskAssignmentPicker
                        node={node}
                        options={assigneeOptions}
                        membersLoading={membersLoading}
                        disabled={!canAssignTask}
                        fullSummary
                        onChange={handleAssignmentChange}
                      />
                    </div>
                  </label>
                </div>
              </div>
            </div>
          </section>

          {isMeetingMode ? (
            <section className="border-b border-slate-100 py-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <MessageSquareText size={16} className="text-blue-500" />
                <span>本次會議</span>
              </div>
              <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-3">
                <textarea
                  value={meetingDiscussion}
                  onChange={(event) => setMeetingDiscussion(event.target.value)}
                  onKeyDown={(event) => {
                    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                      event.preventDefault();
                      handleAppendMeetingDiscussion();
                    }
                  }}
                  disabled={!canEditTask}
                  className="min-h-[88px] w-full resize-y rounded-md border border-blue-100 bg-white px-3 py-2 text-sm leading-6 text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400"
                  placeholder="輸入此任務剛剛討論的內容"
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={handleAppendMeetingDiscussion}
                    disabled={!canEditTask || !meetingDiscussion.trim()}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-xs font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <Send size={13} />
                    加入紀錄
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          <section className="pt-4" data-task-detail-notes-section="true">
            <div className="grid gap-3" data-task-detail-notes-grid="true">
              {notes.map((note, noteIndex) => (
                <div
                  key={note.id}
                  className="rounded-lg border border-slate-200 bg-slate-50/70 p-3"
                  data-task-detail-note-card="true"
                >
                  <div
                    className="mb-2 flex min-w-0 items-center gap-2"
                    data-task-detail-note-header="true"
                  >
                    <input
                      type="text"
                      value={note.title}
                      onChange={(event) => updateNote(note.id, { title: event.target.value })}
                      disabled={!canEditTask}
                      className="h-8 min-w-0 flex-1 rounded-md border border-transparent bg-white px-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400"
                      placeholder="備註標題"
                      data-task-detail-note-title-input="true"
                    />
                    {noteIndex === 0 ? (
                      <button
                        type="button"
                        onClick={addNote}
                        disabled={!canEditTask}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                        title="新增備註欄"
                        aria-label="新增備註欄"
                        data-task-detail-note-add="true"
                      >
                        <Plus size={14} />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => deleteNote(note.id)}
                      disabled={!canEditTask}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-transparent text-slate-400 transition-colors hover:border-red-100 hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                      title="刪除此備註欄"
                      aria-label={`刪除備註欄：${note.title || '未命名備註'}`}
                      data-task-detail-note-delete="true"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <textarea
                    value={note.content}
                    onChange={(event) => updateNote(note.id, { content: event.target.value })}
                    disabled={!canEditTask}
                    className="min-h-[120px] w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    placeholder="輸入備註內容"
                    data-task-detail-note-content-input="true"
                  />
                </div>
              ))}
            </div>
          </section>

          <TaskRecordTimeline nodeId={node.id} />
        </div>
      </div>
    </div>
  );
};
