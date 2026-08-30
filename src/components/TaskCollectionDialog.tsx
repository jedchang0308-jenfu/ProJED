import React from 'react';
import { AlertCircle, Archive, CheckCircle2, LoaderCircle, X } from 'lucide-react';
import { taskCollectionService } from '../services/dataBackend';
import type { TaskCollectionPreview } from '../features/taskCollection/types';
import { useWbsStore } from '../store/useWbsStore';
import useRecordStore from '../store/useRecordStore';
import { toast } from '../store/useToastStore';
import useTaskCollectionStore from '../store/useTaskCollectionStore';
import useBoardStore from '../store/useBoardStore';

type TaskCollectionDialogProps = {
  workspaceId: string;
  boardId: string;
  rootItemId: string;
  rootTitle: string;
  onClose: () => void;
  onViewCollection?: () => void;
};

type DialogState = 'preview-loading' | 'confirmation' | 'committing' | 'recoverable-error' | 'success';

const newOperationId = () => globalThis.crypto?.randomUUID?.() ?? `collection_${Date.now()}_${Math.random().toString(36).slice(2)}`;

export const TaskCollectionDialog: React.FC<TaskCollectionDialogProps> = ({ workspaceId, boardId, rootItemId, rootTitle, onClose, onViewCollection }) => {
  const [state, setState] = React.useState<DialogState>('preview-loading');
  const [preview, setPreview] = React.useState<TaskCollectionPreview | null>(null);
  const [annotation, setAnnotation] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [lastRecordId, setLastRecordId] = React.useState<string | null>(null);
  const operationIdRef = React.useRef(newOperationId());
  const dialogRef = React.useRef<HTMLDivElement | null>(null);

  const loadPreview = React.useCallback(async () => {
    setState('preview-loading');
    setError(null);
    try {
      const result = await taskCollectionService.preview(workspaceId, boardId, rootItemId, operationIdRef.current);
      setPreview(result);
      setState('confirmation');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '無法建立典藏預覽。');
      setState('recoverable-error');
    }
  }, [boardId, rootItemId, workspaceId]);

  React.useEffect(() => { void loadPreview(); }, [loadPreview]);

  React.useEffect(() => {
    dialogRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && state !== 'committing') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') ?? [])
        .filter(element => element.offsetParent !== null);
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [onClose, state]);

  React.useEffect(() => {
    if (state === 'recoverable-error') document.querySelector<HTMLElement>('[data-task-collection-dialog] [role="alert"]')?.focus();
  }, [state]);

  const commit = async () => {
    if (!preview || state === 'committing') return;
    setState('committing');
    setError(null);
    const pendingTaskIds = preview.snapshot.nodes.map(node => node.id);
    pendingTaskIds.forEach(taskId => useTaskCollectionStore.getState().setPending(taskId, operationIdRef.current));
    try {
      const result = await taskCollectionService.collect(workspaceId, boardId, rootItemId, operationIdRef.current, preview.previewToken, annotation.trim() || null);
      setLastRecordId(result.record.id);
      useWbsStore.getState().applyCollectedTaskRoot({ taskId: rootItemId, updatedAt: result.sourceRootUpdatedAt ?? Date.now() });
      await useRecordStore.getState().loadRecords(workspaceId, boardId);
      setPreview({ ...preview, ...result.preview });
      setState('success');
      toast.success('任務已典藏，歷程已保留在紀錄庫。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '典藏任務失敗。');
      setState('recoverable-error');
    } finally {
      pendingTaskIds.forEach(taskId => useTaskCollectionStore.getState().clearPending(taskId));
    }
  };

  const title = state === 'success' ? '典藏完成' : state === 'recoverable-error' ? '典藏未完成' : '典藏任務';
  return (
    <div className="fixed inset-0 z-[11000] flex items-center justify-center bg-slate-950/35 px-4 py-6" role="presentation">
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-busy={state === 'committing'} aria-labelledby="task-collection-dialog-title" data-task-collection-dialog="true" data-task-collection-dialog-state={state} className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl outline-none dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-lg bg-blue-50 p-2 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300"><Archive size={18} /></span>
            <div><h2 id="task-collection-dialog-title" tabIndex={-1} className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2><p className="mt-1 text-xs text-slate-500">{rootTitle}</p></div>
          </div>
          {state !== 'committing' ? <button type="button" onClick={onClose} aria-label="關閉" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100"><X size={16} /></button> : null}
        </div>

        {state === 'preview-loading' ? <div className="flex items-center gap-2 py-8 text-sm text-slate-500"><LoaderCircle className="animate-spin" size={16} />正在整理子任務與歷程…</div> : null}
        {state === 'confirmation' && preview ? <div className="mt-5 space-y-4"><p className="text-sm leading-6 text-slate-700 dark:text-slate-200">將典藏根任務及完整子任務樹，並從看板隱藏根任務；原始歷程會保留在紀錄庫。</p><div className="grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800" data-task-collection-count="tasks"><div className="text-slate-500">任務</div><strong className="text-lg text-slate-900 dark:text-white">{preview.subtreeNodeCount}</strong></div><div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800" data-task-collection-count="history"><div className="text-slate-500">歷程／關聯紀錄</div><strong className="text-lg text-slate-900 dark:text-white">{preview.activityEventCount}／{preview.linkedRecordCount}</strong></div></div><label className="block text-xs font-medium text-slate-600 dark:text-slate-300">典藏註記（選填）<textarea data-task-collection-annotation="true" value={annotation} onChange={event => setAnnotation(event.target.value.slice(0, 500))} rows={3} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-800" placeholder="補充這次典藏的背景…" /><span className="mt-1 block text-right text-[11px] text-slate-400">{annotation.length}/500</span></label><div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600">取消</button><button type="button" onClick={() => void commit()} className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"><Archive size={15} />確認典藏</button></div></div> : null}
        {state === 'committing' ? <div className="flex items-center gap-2 py-8 text-sm text-slate-500"><LoaderCircle className="animate-spin" size={16} />正在保存典藏資產並更新看板…</div> : null}
        {state === 'recoverable-error' ? <div className="mt-5 space-y-4"><div role="alert" tabIndex={-1} className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><AlertCircle size={17} className="mt-0.5 shrink-0" /><span>{error || '可以重新建立預覽後再試。'}</span></div><div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600">關閉</button><button type="button" onClick={() => void loadPreview()} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white">重新整理預覽</button></div></div> : null}
        {state === 'success' ? <div className="mt-5 space-y-4"><div role="status" aria-live="polite" className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 size={18} />典藏資產已建立，根任務已從看板隱藏。</div><div className="flex justify-end gap-2"><button type="button" onClick={() => { if (lastRecordId) void useTaskCollectionStore.getState().open(workspaceId, boardId, lastRecordId); useBoardStore.getState().setView('records'); onClose(); onViewCollection?.(); }} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white">查看典藏</button><button type="button" onClick={onClose} className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600">留在目前畫面</button></div></div> : null}
      </div>
    </div>
  );
};

export default TaskCollectionDialog;
