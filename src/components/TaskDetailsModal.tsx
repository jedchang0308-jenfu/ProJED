import React from 'react';
import dayjs from 'dayjs';
import { CalendarDays, CircleDot, Lock, Plus, Unlock, X } from 'lucide-react';
import { useWbsStore } from '../store/useWbsStore';
import type { TaskDetailNote, TaskStatus } from '../types';

interface TaskDetailsModalProps {
  nodeId: string;
  onClose: () => void;
}

const SIZE_STORAGE_KEY = 'projed.taskDetailsModal.size';
const DEFAULT_SIZE = { width: 760, height: 620 };

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

const readSavedSize = () => {
  if (typeof window === 'undefined') return DEFAULT_SIZE;

  try {
    const saved = window.localStorage.getItem(SIZE_STORAGE_KEY);
    if (!saved) return DEFAULT_SIZE;

    const parsed = JSON.parse(saved);
    return {
      width: Number(parsed.width) || DEFAULT_SIZE.width,
      height: Number(parsed.height) || DEFAULT_SIZE.height,
    };
  } catch {
    return DEFAULT_SIZE;
  }
};

export const TaskDetailsModal: React.FC<TaskDetailsModalProps> = ({ nodeId, onClose }) => {
  const node = useWbsStore((state) => state.nodes[nodeId]);
  const updateNode = useWbsStore((state) => state.updateNode);
  const dependencies = useWbsStore((state) => state.dependencies);
  const modalRef = React.useRef<HTMLDivElement | null>(null);
  const [size, setSize] = React.useState(readSavedSize);
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [notes, setNotes] = React.useState<TaskDetailNote[]>([]);
  const skipNextNotesSave = React.useRef(true);

  React.useEffect(() => {
    if (!node) return;

    setStartDate(node.startDate || '');
    setEndDate(node.endDate || '');
    setNotes(
      node.detailNotes?.length
        ? node.detailNotes
        : [{ id: 'note_default', title: '備註', content: node.description || '' }]
    );
    skipNextNotesSave.current = true;
  }, [node?.id]);

  React.useEffect(() => {
    const modal = modalRef.current;
    if (!modal || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(([entry]) => {
      const nextSize = {
        width: Math.round(entry.contentRect.width),
        height: Math.round(entry.contentRect.height),
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
      updateNode(node.id, {
        detailNotes: notes,
        description: notes[0]?.content || '',
      });
    }, 450);

    return () => window.clearTimeout(timer);
  }, [notes, node, updateNode]);

  if (!node) return null;

  const updateDate = (field: 'startDate' | 'endDate', value: string) => {
    const nextStart = field === 'startDate' ? value : startDate;
    const nextEnd = field === 'endDate' ? value : endDate;

    if (nextStart && nextEnd && nextStart > nextEnd) {
      window.alert('開始日期不能晚於結束日期。');
      return;
    }

    if (field === 'startDate') setStartDate(value);
    if (field === 'endDate') setEndDate(value);

    const updates = { [field]: value } as Partial<typeof node>;
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

  const updateNote = (noteId: string, updates: Partial<TaskDetailNote>) => {
    setNotes((current) =>
      current.map((note) => (note.id === noteId ? { ...note, ...updates } : note))
    );
  };

  const addNote = () => {
    setNotes((current) => [...current, createNote(current.length + 1)]);
  };

  const hasDependencyLock = (side: 'start' | 'end') =>
    dependencies.some(
      (dependency) =>
        (dependency.fromId === node.id && dependency.fromSide === side) ||
        (dependency.toId === node.id && dependency.toSide === side)
    );

  const startLocked = hasDependencyLock('start');
  const endLocked = hasDependencyLock('end');
  const currentStatus = node.status || 'todo';
  const isDueToday = currentStatus !== 'completed' && !!endDate && dayjs(endDate).isSame(dayjs(), 'day');

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        className="flex max-h-[90vh] max-w-[94vw] min-h-[420px] min-w-[360px] flex-col overflow-auto rounded-lg border border-slate-200 bg-white shadow-2xl"
        style={{
          width: size.width,
          height: size.height,
          resize: 'both',
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900" title={node.title}>
              {node.title}
            </p>
            <p className="text-xs text-slate-500">更多詳情選項</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            title="關閉"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-4 py-4">
          <section className="border-b border-slate-100 pb-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <CalendarDays size={16} className="text-blue-500" />
              <span>時間設定</span>
            </div>

            <div className="mb-3">
              <label className="text-xs font-medium text-slate-500">
                狀態
                <div className="mt-1 flex items-center gap-2">
                  <span className={`inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-status-${currentStatus}/15 text-slate-500`}>
                    <CircleDot size={15} />
                  </span>
                  <select
                    value={currentStatus}
                    onChange={(event) => updateNode(node.id, { status: event.target.value as TaskStatus })}
                    className="h-9 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
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

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-slate-500">
                開始日期
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => updateDate('startDate', event.target.value)}
                    className="h-9 min-w-0 flex-1 rounded-md border border-slate-200 px-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                  <span
                    className={`inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border ${
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
              <label className="text-xs font-medium text-slate-500">
                結束日期
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="date"
                    value={endDate}
                    onChange={(event) => updateDate('endDate', event.target.value)}
                    className={`h-9 min-w-0 flex-1 rounded-md border px-2 text-sm outline-none transition focus:ring-2 ${
                      isDueToday
                        ? 'border-orange-300 bg-orange-50 text-orange-700 shadow-[0_0_0_1px_rgba(251,146,60,0.25)] focus:border-orange-400 focus:ring-orange-100'
                        : 'border-slate-200 text-slate-700 focus:border-blue-400 focus:ring-blue-100'
                    }`}
                  />
                  <span
                    className={`inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border ${
                      endLocked
                        ? 'border-amber-200 bg-amber-50 text-amber-600'
                        : 'border-slate-200 bg-slate-50 text-slate-300'
                    }`}
                    title={endLocked ? '結束日期已有依賴關係鎖定' : '結束日期沒有依賴關係鎖定'}
                  >
                    {endLocked ? <Lock size={15} /> : <Unlock size={15} />}
                  </span>
                </div>
              </label>
            </div>
          </section>

          <section className="pt-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-700">備註欄</h2>
              <button
                type="button"
                onClick={addNote}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-900 px-3 text-xs font-medium text-white transition hover:bg-slate-700"
              >
                <Plus size={13} />
                新增備註欄
              </button>
            </div>

            <div className="grid gap-3">
              {notes.map((note) => (
                <div key={note.id} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                  <input
                    type="text"
                    value={note.title}
                    onChange={(event) => updateNote(note.id, { title: event.target.value })}
                    className="mb-2 h-8 w-full rounded-md border border-transparent bg-white px-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    placeholder="備註標題"
                  />
                  <textarea
                    value={note.content}
                    onChange={(event) => updateNote(note.id, { content: event.target.value })}
                    className="min-h-[120px] w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
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
