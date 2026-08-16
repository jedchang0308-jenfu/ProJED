import React from 'react';
import dayjs from 'dayjs';
import { BookOpenText, CheckCircle2, Lock, MessageSquareText, Save, Send, Unlock, X } from 'lucide-react';
import { useWbsStore } from '../store/useWbsStore';
import { useMemberStore } from '../store/useMemberStore';
import useRecordStore from '../store/useRecordStore';
import { TagPicker } from './Tags/TagPicker';
import TaskRecordTimeline from './Records/TaskRecordTimeline';
import type { TaskDetailNote, TaskNode, TaskStatus } from '../types';
import { useBoardPermissions } from '../hooks/useBoardPermissions';
import useBoardStore from '../store/useBoardStore';
import TaskAssignmentPicker from './TaskAssignmentPicker';
import { MANUAL_TASK_STATUSES, normalizeManualTaskStatus, TASK_STATUS_LABELS } from '../utils/taskStatus';
import { buildAncestorPath } from '../utils/taskHierarchy';
import { getTaskStatusFieldClass } from './ui/taskStatusStyles';
import TaskDetailNoteField from './TaskNotes/TaskDetailNoteField';
import { areTaskNoteRichContentsEqual } from '../utils/taskNoteRichContent';
import { toast } from '../store/useToastStore';
import type { UpdateNodeOptions } from '../store/useWbsStore';

interface TaskDetailsModalProps {
  nodeId: string;
  onClose: () => void;
}

const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = MANUAL_TASK_STATUSES.map(value => ({
  value,
  label: TASK_STATUS_LABELS[value],
}));

const createNote = (index: number): TaskDetailNote => ({
  id: `note_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
  title: `備註 ${index}`,
  content: '',
});

const SIZE_STORAGE_KEY = 'projed.taskDetailsModal.size.v4';

const getDefaultModalSize = () => {
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1120;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 720;
  const maxWidth = viewportWidth * 0.94;
  const maxHeight = viewportHeight * 0.9;

  return {
    // 任務詳情需要同時容納日期、主責／協作與備註編輯；維持大型工作區，
    // 避免在桌面 viewport 只得到窄欄並產生水平捲軸。
    width: Math.min(Math.max(viewportWidth * 0.78, 1040), maxWidth),
    height: Math.min(Math.max(viewportHeight * 0.84, 680), maxHeight),
  };
};

const readSavedSize = () => {
  const defaultSize = getDefaultModalSize();

  if (typeof window === 'undefined') return defaultSize;

  try {
    const saved = window.localStorage.getItem(SIZE_STORAGE_KEY);
    if (!saved) return defaultSize;

    const parsed = JSON.parse(saved);
    const savedWidth = Number(parsed.width);
    const savedHeight = Number(parsed.height);
    // 不接受曾被縮到過小的尺寸，避免視窗在下一次開啟時持續變小。
    if (
      !Number.isFinite(savedWidth)
      || !Number.isFinite(savedHeight)
      || savedWidth < defaultSize.width
      || savedHeight < defaultSize.height
    ) {
      return defaultSize;
    }

    return {
      width: Math.min(savedWidth, window.innerWidth * 0.94),
      height: Math.min(savedHeight, window.innerHeight * 0.9),
    };
  } catch {
    return defaultSize;
  }
};

const getDisplayedDetailNotes = (node: TaskNode | undefined): TaskDetailNote[] => (
  node?.detailNotes?.length
    ? node.detailNotes
    : [{ id: 'note_default', title: '備註', content: node?.description || '' }]
);

const areDetailNotesEqual = (left: TaskDetailNote[], right: TaskDetailNote[]) => (
  left.length === right.length
  && left.every((note, index) => (
    note.id === right[index]?.id
    && note.title === right[index]?.title
    && note.content === right[index]?.content
    && areTaskNoteRichContentsEqual(note.richContent, right[index]?.richContent)
  ))
);

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
  const minimumModalSize = React.useMemo(() => getDefaultModalSize(), []);
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [durationDraft, setDurationDraft] = React.useState<string | null>(null);
  const [titleValue, setTitleValue] = React.useState('');
  const [notes, setNotes] = React.useState<TaskDetailNote[]>([]);
  const [meetingDiscussion, setMeetingDiscussion] = React.useState('');
  const [isTaskKnowledgeOpen, setIsTaskKnowledgeOpen] = React.useState(false);
  const isMeetingMode = useRecordStore((state) => state.isMeetingMode);
  const appendTaskDiscussionToMeetingDraft = useRecordStore((state) => state.appendTaskDiscussionToMeetingDraft);
  const skipNextNotesSave = React.useRef(true);
  const skipNextTitleBlurSave = React.useRef(false);
  const [saveFeedbackVisible, setSaveFeedbackVisible] = React.useState(false);
  const saveFeedbackTimerRef = React.useRef<number | null>(null);
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

  const clearSaveFeedback = React.useCallback(() => {
    if (saveFeedbackTimerRef.current !== null) {
      window.clearTimeout(saveFeedbackTimerRef.current);
      saveFeedbackTimerRef.current = null;
    }
    setSaveFeedbackVisible(false);
  }, []);

  const showSaveFeedback = React.useCallback(() => {
    if (saveFeedbackTimerRef.current !== null) {
      window.clearTimeout(saveFeedbackTimerRef.current);
    }
    setSaveFeedbackVisible(true);
    saveFeedbackTimerRef.current = window.setTimeout(() => {
      setSaveFeedbackVisible(false);
      saveFeedbackTimerRef.current = null;
    }, 1600);
  }, []);

  const savePendingTaskDetails = React.useCallback((options?: UpdateNodeOptions) => {
    if (!node || !canEditTask) return false;

    const updates: Partial<TaskNode> = {};
    const trimmedTitle = titleValue.trim();
    if (!trimmedTitle) {
      setTitleValue(node.title || '');
    } else {
      if (trimmedTitle !== titleValue) setTitleValue(trimmedTitle);
      if (trimmedTitle !== node.title) updates.title = trimmedTitle;
    }

    const displayedNotes = getDisplayedDetailNotes(node);
    const nextDescription = notes[0]?.content || '';
    if (!areDetailNotesEqual(notes, displayedNotes) || nextDescription !== (node.description || '')) {
      updates.detailNotes = notes;
      updates.description = nextDescription;
    }

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = Date.now();
      updateNode(node.id, updates, options);
      return true;
    }
    options?.onPersistSuccess?.();
    return false;
  }, [canEditTask, node, notes, titleValue, updateNode]);

  const handleSaveDetails = React.useCallback(() => {
    savePendingTaskDetails({
      onPersistSuccess: showSaveFeedback,
      onPersistError: () => toast.error('儲存失敗', { duration: 1000 }),
    });
  }, [savePendingTaskDetails, showSaveFeedback]);

  const handleClose = React.useCallback(() => {
    if (canEditTask) {
      savePendingTaskDetails({
        onPersistSuccess: () => toast.success('已儲存', { duration: 1000 }),
        onPersistError: () => toast.error('儲存失敗', { duration: 1000 }),
      });
    }
    onClose();
  }, [canEditTask, onClose, savePendingTaskDetails]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return;
      if (event.target instanceof Element && event.target.closest('[data-task-details-title-input="true"]')) return;
      const hasNestedOverlay = Boolean(document.querySelector(
        '[data-tag-picker-panel], .global-dialog-content, [data-task-note-toolbar-popover="true"]',
      ));
      if (hasNestedOverlay) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      handleClose();
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [handleClose]);

  React.useEffect(() => () => {
    if (saveFeedbackTimerRef.current !== null) {
      window.clearTimeout(saveFeedbackTimerRef.current);
    }
  }, []);

  React.useEffect(() => {
    if (!currentNodeId) return;

    setTitleValue(currentNodeTitle);
    setStartDate(currentNodeStartDate);
    setEndDate(currentNodeEndDate);
    setDurationDraft(null);
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
    setIsTaskKnowledgeOpen(false);
  }, [currentNodeId]);

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
  const durationInputValue = durationDraft ?? (durationDays === '' ? '' : String(durationDays));

  const updateDate = (field: 'startDate' | 'endDate', value: string, preserveDurationDraft = false) => {
    if (!canEditTask) return;
    if (!preserveDurationDraft) setDurationDraft(null);
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
        
      }
    }
    
    if (field === 'endDate') {
      setEndDate(value);
    }
    updateNode(node.id, updates);
  };

  const handleDateChange = (field: 'startDate' | 'endDate', event: React.ChangeEvent<HTMLInputElement>) => {
    // Chromium may emit a transient out-of-range value while navigating an
    // empty native date picker. Let the input constraints reject that value
    // without treating month navigation as a real date change.
    if (!event.currentTarget.validity.valid) {
      event.currentTarget.value = field === 'startDate' ? startDate : endDate;
      return;
    }
    updateDate(field, event.currentTarget.value);
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
    setDurationDraft(strVal);
    if (strVal === '') return;
    const val = Number(strVal);
    if (!Number.isInteger(val) || val < 0) return;

    if (!startDate) {
      alert('防呆機制：請先設定開始日期，才能計算工期');
      setDurationDraft(null);
      return;
    }

    const nextEnd = dayjs(startDate).add(val, 'day').format('YYYY-MM-DD');

    updateDate('endDate', nextEnd, true);
  };

  const handleDurationBlur = () => {
    if (durationDraft === null) return;
    if (durationDraft === '') {
      setDurationDraft(null);
      return;
    }
    setDurationDraft(null);
  };

  const handleToggleDurationLock = () => {
    if (!canEditTask) return;
    updateNode(node.id, { isDurationLocked: !node.isDurationLocked });
  };

  const updateNote = (noteId: string, updates: Partial<TaskDetailNote>) => {
    if (!canEditTask) return;
    clearSaveFeedback();
    setNotes((current) =>
      current.map((note) => (note.id === noteId ? { ...note, ...updates } : note))
    );
  };

  const addNote = () => {
    if (!canEditTask) return;
    clearSaveFeedback();
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

    clearSaveFeedback();
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
  const currentStatus = normalizeManualTaskStatus(node.status);
  const isDueToday = currentStatus !== 'completed' && !!endDate && dayjs(endDate).isSame(dayjs(), 'day');

  return (
    <div
      data-task-details-modal="true"
      data-task-id={node.id}
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <div
        ref={modalRef}
        data-task-details-dialog="true"
        className="flex max-h-[90vh] max-w-[94vw] min-h-[420px] min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl"
        style={{
          width: size.width,
          height: size.height,
          minWidth: minimumModalSize.width,
          minHeight: minimumModalSize.height,
          resize: 'both',
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div
          className="flex items-start gap-2 px-5 py-3"
          data-task-details-header="true"
        >
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-col gap-0.5">
              {canEditTask ? (
                <input
                  ref={titleInputRef}
                  type="text"
                  value={titleValue}
                  onChange={(event) => {
                    clearSaveFeedback();
                    setTitleValue(event.target.value);
                  }}
                  onBlur={saveTitle}
                  onKeyDown={handleTitleKeyDown}
                  data-task-details-title-input="true"
                  aria-label="編輯任務名稱"
                  className="h-9 w-full min-w-0 border-0 bg-transparent px-0 text-base font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 hover:bg-slate-50/80 focus:bg-white focus:ring-2 focus:ring-blue-100"
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
                  className="flex min-w-0 items-center gap-x-1 overflow-hidden whitespace-nowrap text-[11px] font-medium leading-4 text-slate-500"
                >
                  {ancestorPath.map((ancestor, index) => (
                    <React.Fragment key={ancestor.id}>
                      <span
                        data-task-details-parent-name="true"
                        className="min-w-0 max-w-[min(11rem,30vw)] truncate text-slate-600"
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
          {canEditTask ? (
            <button
              type="button"
              onClick={handleSaveDetails}
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-100 ${
                saveFeedbackVisible
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  : 'border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300 hover:bg-blue-100'
              }`}
              title="儲存目前任務內容"
              aria-label="儲存目前任務內容"
              data-task-details-save="true"
            >
              {saveFeedbackVisible ? <CheckCircle2 size={16} /> : <Save size={16} />}
              <span>{saveFeedbackVisible ? '已儲存' : '儲存'}</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100"
            title="關閉"
            aria-label="關閉任務詳情"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-4 py-4">
          <section className="pb-2" data-task-details-meta-section="true">
            <div
              className="grid gap-y-3 lg:grid-cols-[5.5rem_23.5rem_minmax(0,1fr)] lg:items-end lg:gap-x-2 lg:gap-y-2"
              data-task-details-meta-grid="true"
            >
              <div
                className="rounded-lg border border-slate-200 bg-slate-50/80 shadow-sm md:border-0 md:bg-transparent md:shadow-none lg:col-span-full"
                data-task-details-mobile-meta="true"
              >
                <div
                  className="space-y-1.5 bg-white px-2 py-2 md:grid md:grid-cols-[8.5rem_minmax(0,1fr)] md:items-start md:gap-x-3 md:gap-y-2 md:space-y-0 md:bg-transparent md:px-0 md:py-0 lg:grid lg:grid-cols-[5.5rem_23.5rem_minmax(0,1fr)] lg:items-end lg:gap-x-2 lg:gap-y-2"
                  data-task-details-mobile-meta-controls="true"
                >
              <div
                className="grid gap-x-1.5 gap-y-1.5 md:grid md:grid-cols-[8.5rem_minmax(0,1fr)] md:items-start lg:contents"
                data-task-details-date-grid="true"
                data-task-details-schedule-row="true"
              >
                <div
                  className="grid min-w-0 grid-cols-[minmax(0,1fr)_1rem_minmax(0,1fr)_auto] items-end gap-2 lg:col-start-2 lg:row-start-1"
                  data-task-details-schedule-controls="true"
                  data-task-details-mobile-schedule-controls="true"
                >
                  <span className="col-span-4 block text-xs font-medium text-slate-500" data-task-details-meta-label-text="true">
                    日期
                  </span>
                  <div className="contents">
                    <label
                      className="col-start-1 block min-w-0 text-xs font-medium text-slate-500"
                      data-task-details-meta-field="start"
                      data-task-details-meta-label="true"
                    >
                    <span className="hidden" data-task-details-meta-label-text="true">開始日期</span>
                    <div className="mt-1 flex items-center gap-2 lg:mt-0" data-task-details-meta-control-row="true">
                      <input
                        type="date"
                        value={startDate}
                        onChange={(event) => handleDateChange('startDate', event)}
                        max={!node.isDurationLocked ? (endDate || undefined) : undefined}
                        readOnly={!canEditTask || startLocked}
                        className={`h-8 min-w-0 flex-1 rounded-md px-2 text-sm outline-none transition focus:ring-2 lg:w-[8rem] lg:flex-none lg:min-w-0 ${
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

                    <span
                      className="col-start-2 flex h-8 w-4 shrink-0 items-center justify-center text-sm font-semibold text-slate-300"
                      aria-hidden="true"
                      data-task-details-date-range-arrow="true"
                    >
                      →
                    </span>

                    <label
                      className="col-start-3 block min-w-0 text-xs font-medium text-slate-500"
                      data-task-details-meta-field="end"
                      data-task-details-meta-label="true"
                    >
                    <span className="hidden" data-task-details-meta-label-text="true">結束日期</span>
                    <div className="mt-1 flex items-center gap-2 lg:mt-0" data-task-details-meta-control-row="true">
                      <input
                        type="date"
                        value={endDate}
                        onChange={(event) => handleDateChange('endDate', event)}
                        min={startDate || undefined}
                        readOnly={!canEditTask || endLocked || node.isDurationLocked}
                        className={`h-8 min-w-0 flex-1 rounded-md rounded-r-none border-r-0 px-2 text-sm outline-none transition focus:ring-2 lg:w-[8rem] lg:flex-none lg:min-w-0 ${
                          !canEditTask || endLocked || node.isDurationLocked
                            ? 'border border-dashed border-slate-300 bg-slate-50 text-slate-500 pointer-events-none'
                            : isDueToday
                            ? 'border border-orange-300 bg-orange-50 text-orange-700 shadow-[0_0_0_1px_rgba(251,146,60,0.25)] focus:border-orange-400 focus:ring-orange-100'
                            : 'border border-slate-200 text-slate-700 focus:border-blue-400 focus:ring-blue-100'
                        }`}
                      />
                      <span
                        className={`${endLocked ? 'inline-flex' : 'hidden'} h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-600`}
                        title="結束日期已有依賴關係鎖定"
                      >
                        <Lock size={15} />
                      </span>
                    </div>
                  </label>
                  </div>
                  <span
                    className={`col-start-4 -ml-2 inline-flex h-8 shrink-0 items-center overflow-hidden rounded-l-none rounded-r-md border ${
                      node.isDurationLocked
                        ? 'border-amber-200 bg-amber-50/70'
                        : 'border-slate-200 bg-slate-50'
                    }`}
                    title={node.isDurationLocked ? '鎖定工期：自動推算結束日期' : '未鎖定工期：日期獨立計算'}
                    data-task-details-duration-inline="true"
                    data-task-details-mobile-duration="true"
                  >
                    <button
                      type="button"
                      onClick={handleToggleDurationLock}
                      disabled={!canEditTask}
                      className={`inline-flex h-full w-8 flex-shrink-0 items-center justify-center border-r transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-100 ${
                        node.isDurationLocked
                          ? 'border-amber-200 text-amber-600 hover:bg-amber-100'
                          : 'border-slate-200 text-slate-400 hover:bg-slate-100'
                      }`}
                      title={node.isDurationLocked ? '鎖定工期：自動推算結束日期' : '非鎖定：日期獨立計算'}
                    >
                      {node.isDurationLocked ? <Lock size={15} /> : <Unlock size={15} />}
                    </button>
                    <input
                      type="number"
                      min="0"
                      value={durationInputValue}
                      onChange={handleDurationChange}
                      onBlur={handleDurationBlur}
                      placeholder="—"
                      disabled={!canEditTask || !node.isDurationLocked}
                      aria-label="工期天數"
                      className={`h-full w-12 border-0 bg-transparent px-1.5 text-sm text-center outline-none transition focus:ring-2 focus:ring-inset focus:ring-blue-100 ${
                        !node.isDurationLocked
                          ? 'text-slate-400'
                          : 'text-slate-700'
                      }`}
                    />
                  </span>
              </div>
              </div>

              <div
                className="grid gap-x-1.5 gap-y-1.5 md:grid md:grid-cols-[8.5rem_minmax(0,1fr)] md:items-start lg:contents"
                data-task-details-assignment-row="true"
                data-task-details-primary-row="true"
              >
                <div className="min-w-0 lg:col-start-1 lg:row-start-1" data-task-details-meta-field="status">
                  <label className="block text-xs font-medium text-slate-500" data-task-details-meta-label="true">
                    <span data-task-details-meta-label-text="true">狀態</span>
                    <div className="mt-1 flex items-center gap-2" data-task-details-meta-control-row="true">
                      <select
                        value={currentStatus}
                        onChange={(event) => { if (canEditTask) updateNode(node.id, { status: event.target.value as TaskStatus }); }}
                        disabled={!canEditTask}
                        className={getTaskStatusFieldClass(currentStatus)}
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
                  className="min-w-0 lg:col-start-3 lg:row-start-1"
                  data-task-details-meta-field="assignment"
                >
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

              <div
                className="grid gap-x-1.5 gap-y-1.5 md:grid md:grid-cols-[8.5rem_minmax(0,1fr)] md:items-start lg:contents"
                data-task-details-tags-row="true"
              >
                <div
                  className="min-w-0 lg:col-span-3 lg:col-start-1 lg:row-start-2"
                  data-task-details-meta-field="tags"
                >
                  <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-slate-500">
                    <span className="shrink-0" data-task-details-meta-label-text="true">標籤</span>
                    <div className="min-w-0 flex-1" data-task-details-tag-picker-wrap="true">
                      <TagPicker
                        workspaceId={node.workspaceId}
                        selectedTagIds={node.tagIds || []}
                        onChange={(tagIds) => updateNode(node.id, { tagIds, updatedAt: Date.now() })}
                        disabled={!canEditTask}
                        compact
                      />
                    </div>
                  </div>
                </div>
              </div>
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

          <section className="pt-2" data-task-detail-notes-section="true">
            <div className="grid gap-2" data-task-detail-notes-grid="true">
              {notes.map((note, noteIndex) => (
                <TaskDetailNoteField
                  key={note.id}
                  canEdit={canEditTask}
                  note={note}
                  noteIndex={noteIndex}
                  onAdd={addNote}
                  onDelete={() => deleteNote(note.id)}
                  onSave={handleSaveDetails}
                  onUpdate={updates => updateNote(note.id, updates)}
                />
              ))}
            </div>
          </section>

          <div className="flex justify-end pt-2" data-task-knowledge-trigger="true">
            <button
              type="button"
              onClick={() => setIsTaskKnowledgeOpen((current) => !current)}
              aria-expanded={isTaskKnowledgeOpen}
              aria-controls="task-knowledge-panel"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50/40 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
              data-task-knowledge-toggle="true"
            >
              <BookOpenText size={14} />
              <span>{isTaskKnowledgeOpen ? '收合歷史資訊' : '查看歷史資訊'}</span>
            </button>
          </div>
          {isTaskKnowledgeOpen ? (
            <div id="task-knowledge-panel" data-task-knowledge-panel="true">
              <TaskRecordTimeline nodeId={node.id} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
