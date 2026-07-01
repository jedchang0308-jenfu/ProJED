import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, SendHorizontal, StickyNote, Trash2 } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import useAuthStore from '../store/useAuthStore';
import useBoardStore from '../store/useBoardStore';
import useQuickCaptureStore, { isQuickMemoVisibleForUser } from '../store/useQuickCaptureStore';
import { toast } from '../store/useToastStore';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { TaskDragHandle } from './Wbs/TaskDragHandle';

const MAX_RECENT_ITEMS = 4;
type QuickMemoItem = ReturnType<typeof useQuickCaptureStore.getState>['items'][number];

type QuickCaptureShellProps = {
  enableDragToTask?: boolean;
  canCreateTask?: boolean;
};

const getMemoDisabledReason = (item: QuickMemoItem, canCreateTask: boolean) => {
  if (!canCreateTask) return '沒有建立任務權限';
  if (item.requiresOwnershipConfirmation) return '匯入目前帳號後才能轉任務';
  if (item.syncStatus !== 'synced') return '同步後才能轉任務';
  if (item.captureStatus !== 'untriaged') return '只有待整理備忘能轉任務';
  return null;
};

const QuickCaptureDraggableMemoItem: React.FC<{
  item: QuickMemoItem;
  canCreateTask: boolean;
  onComplete: (itemId: string) => void;
  onRemove: (itemId: string) => void;
}> = ({ item, canCreateTask, onComplete, onRemove }) => {
  const disabledReason = getMemoDisabledReason(item, canCreateTask);
  const disabled = Boolean(disabledReason);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `quick-memo-${item.id}`,
    disabled,
    data: {
      type: 'quick-capture-item',
      itemId: item.id,
      title: item.title,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex items-start gap-2 rounded-md border bg-slate-50 px-3 py-2 transition ${
        isDragging ? 'opacity-50 shadow-lg' : 'border-slate-200'
      }`}
      data-quick-capture-item
      data-memo-sync-status={item.syncStatus}
    >
      <TaskDragHandle
        attributes={attributes}
        listeners={listeners}
        disabled={disabled}
        title={disabledReason || '拖到看板位置轉成任務'}
        size="sm"
        className="-ml-1 mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-slate-800">{item.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          <span>
            {item.syncStatus === 'synced'
              ? '待整理'
              : item.syncStatus === 'failed'
                ? `同步失敗${item.lastSyncError ? ` · ${item.lastSyncError}` : ''}`
                : item.requiresOwnershipConfirmation
                  ? '本機備忘 · 待匯入'
                  : '待同步'}
          </span>
          {item.syncStatus === 'synced' ? <Badge variant="success">已同步</Badge> : null}
          {item.suggestedDueDate ? <Badge variant="info">建議日期 {item.suggestedDueDate}</Badge> : null}
        </div>
        {disabledReason ? <div className="mt-1 text-xs text-amber-600">{disabledReason}</div> : null}
      </div>
      <button
        type="button"
        onClick={() => onComplete(item.id)}
        className="rounded-md p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
        title="標記完成"
        aria-label="標記完成"
      >
        <Check size={15} />
      </button>
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
        title="刪除備忘"
        aria-label="刪除備忘"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
};

const QuickCapturePlainMemoItem: React.FC<{
  item: QuickMemoItem;
  onComplete: (itemId: string) => void;
  onRemove: (itemId: string) => void;
}> = ({ item, onComplete, onRemove }) => (
  <div
    className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
    data-quick-capture-item
  >
    <div className="min-w-0 flex-1">
      <div className="truncate text-sm font-semibold text-slate-800">{item.title}</div>
      <div className="mt-1 text-xs text-slate-500">
        {item.syncStatus === 'synced'
          ? '待整理 · 已同步'
          : item.syncStatus === 'failed'
            ? `同步失敗${item.lastSyncError ? ` · ${item.lastSyncError}` : ''}`
            : item.requiresOwnershipConfirmation
              ? '本機備忘 · 待匯入'
              : '待同步'}
      </div>
    </div>
    <button
      type="button"
      onClick={() => onComplete(item.id)}
      className="rounded-md p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
      title="標記完成"
      aria-label="標記完成"
    >
      <Check size={15} />
    </button>
    <button
      type="button"
      onClick={() => onRemove(item.id)}
      className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
      title="刪除備忘"
      aria-label="刪除備忘"
    >
      <Trash2 size={15} />
    </button>
  </div>
);

export const QuickCaptureShell: React.FC<QuickCaptureShellProps> = ({
  enableDragToTask = false,
  canCreateTask = false,
}) => {
  const user = useAuthStore((state) => state.user);
  const activeWorkspaceId = useBoardStore((state) => state.activeWorkspaceId);
  const activeBoardId = useBoardStore((state) => state.activeBoardId);
  const items = useQuickCaptureStore((state) => state.items);
  const isSyncing = useQuickCaptureStore((state) => state.isSyncing);
  const addItem = useQuickCaptureStore((state) => state.addItem);
  const syncWithCloud = useQuickCaptureStore((state) => state.syncWithCloud);
  const claimAnonymousItems = useQuickCaptureStore((state) => state.claimAnonymousItems);
  const markCompleted = useQuickCaptureStore((state) => state.markCompleted);
  const removeItem = useQuickCaptureStore((state) => state.removeItem);
  const [draft, setDraft] = useState('');
  const [isOpen, setIsOpen] = useState(() => (
    useQuickCaptureStore.getState().items.every(item => (
      item.captureStatus === 'completed' || item.captureStatus === 'archived' || item.captureStatus === 'promoted'
    ))
  ));

  useEffect(() => {
    if (!user?.uid) return;
    syncWithCloud(user.uid).catch(error => {
      console.warn('[quickMemo] cloud sync failed:', error);
    });
  }, [syncWithCloud, user?.uid]);

  const visibleItems = useMemo(
    () => items.filter(item => isQuickMemoVisibleForUser(item, user?.uid ?? null)),
    [items, user?.uid],
  );
  const pendingItems = useMemo(
    () => visibleItems.filter(item => item.captureStatus === 'untriaged'),
    [visibleItems],
  );
  const anonymousItems = useMemo(
    () => visibleItems.filter(item => item.requiresOwnershipConfirmation && !item.createdAuthUserId),
    [visibleItems],
  );
  const failedCount = pendingItems.filter(item => item.syncStatus === 'failed').length;
  const waitingSyncCount = pendingItems.filter(item => item.syncStatus === 'pending' || item.syncStatus === 'syncing').length;
  const recentItems = pendingItems.slice(0, enableDragToTask ? Math.max(MAX_RECENT_ITEMS, pendingItems.length) : MAX_RECENT_ITEMS);
  const draftLength = draft.trim().length;

  const handleSubmit = (event?: React.FormEvent) => {
    event?.preventDefault();
    const created = addItem({
      text: draft,
      createdBy: user?.uid ?? null,
      sourceWorkspaceId: activeWorkspaceId ?? null,
      sourceBoardId: activeBoardId ?? null,
    });
    if (!created) return;
    setDraft('');
    setIsOpen(false);
    if (user?.uid) {
      syncWithCloud(user.uid)
        .then(() => toast.success('已同步到備忘錄。'))
        .catch(() => toast.error('已先保存本機，稍後可重試同步。'));
    } else {
      toast.success('已保存本機，登入後可匯入備忘錄。');
    }
  };

  const handleClaimAnonymous = () => {
    if (!user?.uid) return;
    claimAnonymousItems(user.uid)
      .then(() => toast.success('已匯入目前帳號的備忘錄。'))
      .catch(() => toast.error('匯入失敗，請稍後重試。'));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      handleSubmit();
    }
  };

  const statusLabel = (() => {
    if (!user) return '可先記下，登入後匯入備忘錄';
    if (anonymousItems.length > 0) return `${anonymousItems.length} 筆本機備忘待匯入`;
    if (failedCount > 0) return `${failedCount} 筆同步失敗`;
    if (isSyncing || waitingSyncCount > 0) return '儲存中 / 待同步';
    return '已同步到雲端備忘錄';
  })();

  if (!isOpen) {
    return (
      <section
        className="fixed bottom-2 right-2 z-[9996] rounded-lg border border-slate-200 bg-white shadow-xl shadow-slate-900/15 sm:bottom-4 sm:right-4"
        data-quick-capture-shell
        aria-label="快速備忘"
      >
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 px-2.5 py-2 text-left"
          aria-expanded={false}
          data-quick-capture-toggle
        >
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <StickyNote size={17} />
          </span>
          <Badge variant={pendingItems.length > 0 ? 'warning' : 'success'} data-quick-capture-count>
            {pendingItems.length > 0 ? `${pendingItems.length} 待整理` : '快速備忘'}
          </Badge>
          <ChevronUp size={17} className="text-slate-400" />
        </button>
      </section>
    );
  }

  return (
    <section
      className="fixed inset-x-2 bottom-2 z-[9996] mx-auto max-w-2xl rounded-lg border border-slate-200 bg-white shadow-2xl shadow-slate-900/15 sm:inset-x-auto sm:right-4 sm:w-[420px]"
      data-quick-capture-shell
      aria-label="快速備忘"
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-2">
        <button
          type="button"
          onClick={() => setIsOpen(open => !open)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={isOpen}
          data-quick-capture-toggle
        >
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <StickyNote size={17} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-slate-900">快速備忘</span>
            <span className="block truncate text-xs text-slate-500">
              {enableDragToTask ? '先記下來，拖到看板轉成任務' : '先記下來，稍後整理成任務'}
            </span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={pendingItems.length > 0 ? 'warning' : 'success'} data-quick-capture-count>
            {pendingItems.length > 0 ? `${pendingItems.length} 待整理` : '已清空'}
          </Badge>
          <button
            type="button"
            onClick={() => setIsOpen(open => !open)}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label={isOpen ? '收合快速備忘' : '展開快速備忘'}
          >
            {isOpen ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
          </button>
        </div>
      </div>

      {isOpen ? (
        <div className="space-y-3 p-3">
          <form onSubmit={handleSubmit} className="space-y-2">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="先記下來..."
              rows={3}
              className="block max-h-36 min-h-20 w-full resize-y rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/15"
              data-quick-capture-input
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500" data-quick-capture-sync-status>
                {statusLabel}
              </span>
              <Button
                type="submit"
                size="sm"
                disabled={draftLength === 0}
                className="gap-1.5"
                data-quick-capture-save
              >
                <SendHorizontal size={14} />
                存入備忘錄
              </Button>
            </div>
          </form>

          {user?.uid && anonymousItems.length > 0 ? (
            <button
              type="button"
              onClick={handleClaimAnonymous}
              className="w-full rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs font-semibold text-amber-700 hover:bg-amber-100"
              data-quick-memo-claim-local
            >
              匯入 {anonymousItems.length} 筆本機備忘到目前帳號
            </button>
          ) : null}

          {recentItems.length > 0 ? (
            <div className={`space-y-2 ${enableDragToTask ? 'max-h-[45vh] overflow-y-auto pr-1' : ''}`} data-quick-capture-list>
              {enableDragToTask ? (
                <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
                  拖曳左側把手到看板位置，即可轉成正式任務。
                </div>
              ) : null}
              {recentItems.map(item => (
                enableDragToTask ? (
                  <QuickCaptureDraggableMemoItem
                    key={item.id}
                    item={item}
                    canCreateTask={canCreateTask}
                    onComplete={markCompleted}
                    onRemove={removeItem}
                  />
                ) : (
                  <QuickCapturePlainMemoItem
                    key={item.id}
                    item={item}
                    onComplete={markCompleted}
                    onRemove={removeItem}
                  />
                )
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};
