import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Inbox, SendHorizontal, Trash2 } from 'lucide-react';
import useAuthStore from '../store/useAuthStore';
import useQuickCaptureStore from '../store/useQuickCaptureStore';
import { toast } from '../store/useToastStore';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';

const MAX_RECENT_ITEMS = 4;

export const QuickCaptureShell: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const items = useQuickCaptureStore((state) => state.items);
  const addItem = useQuickCaptureStore((state) => state.addItem);
  const markCompleted = useQuickCaptureStore((state) => state.markCompleted);
  const removeItem = useQuickCaptureStore((state) => state.removeItem);
  const [draft, setDraft] = useState('');
  const [isOpen, setIsOpen] = useState(() => (
    useQuickCaptureStore.getState().items.every(item => (
      item.captureStatus === 'completed' || item.captureStatus === 'archived'
    ))
  ));

  const pendingItems = useMemo(
    () => items.filter(item => item.captureStatus !== 'completed' && item.captureStatus !== 'archived'),
    [items],
  );
  const recentItems = pendingItems.slice(0, MAX_RECENT_ITEMS);
  const draftLength = draft.trim().length;

  const handleSubmit = (event?: React.FormEvent) => {
    event?.preventDefault();
    const created = addItem({ text: draft, createdBy: user?.uid ?? null });
    if (!created) return;
    setDraft('');
    setIsOpen(false);
    toast.success('已存到本機收件匣。');
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      handleSubmit();
    }
  };

  if (!isOpen) {
    return (
      <section
        className="fixed bottom-2 right-2 z-[9996] rounded-lg border border-slate-200 bg-white shadow-xl shadow-slate-900/15 sm:bottom-4 sm:right-4"
        data-quick-capture-shell
        aria-label="快速記錄"
      >
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 px-2.5 py-2 text-left"
          aria-expanded={false}
          data-quick-capture-toggle
        >
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Inbox size={17} />
          </span>
          <Badge variant={pendingItems.length > 0 ? 'warning' : 'success'} data-quick-capture-count>
            {pendingItems.length > 0 ? `${pendingItems.length} 待整理` : '快速記錄'}
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
      aria-label="快速記錄"
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
            <Inbox size={17} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-slate-900">快速記錄</span>
            <span className="block truncate text-xs text-slate-500">先存本機，之後再整理</span>
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
            aria-label={isOpen ? '收合快速記錄' : '展開快速記錄'}
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
                {user ? '已登入，先存本機待整理' : '可先記下，登入後再整理'}
              </span>
              <Button
                type="submit"
                size="sm"
                disabled={draftLength === 0}
                className="gap-1.5"
                data-quick-capture-save
              >
                <SendHorizontal size={14} />
                存入收件匣
              </Button>
            </div>
          </form>

          {recentItems.length > 0 ? (
            <div className="space-y-2" data-quick-capture-list>
              {recentItems.map(item => (
                <div
                  key={item.id}
                  className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
                  data-quick-capture-item
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-800">{item.title}</div>
                    <div className="mt-1 text-xs text-slate-500">待整理 · 本機已保存</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => markCompleted(item.id)}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
                    title="標記完成"
                    aria-label="標記完成"
                  >
                    <Check size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    title="刪除快記"
                    aria-label="刪除快記"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};
