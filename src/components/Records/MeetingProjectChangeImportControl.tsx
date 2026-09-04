import React from 'react';
import { ArrowLeft, CalendarRange, ChevronRight, Loader2, Sparkles, X } from 'lucide-react';

type ImportStatus = 'idle' | 'loading' | 'complete' | 'empty' | 'error';

type Props = {
  status: ImportStatus;
  message: string | null;
  disabled: boolean;
  onImport: () => void;
  onCustomImport: (startedAt: number, endedAt: number) => void;
};

const toDayStart = (value: string) => {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.valueOf();
};

const toDayEnd = (value: string) => {
  const parsed = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.valueOf();
};

const MeetingProjectChangeImportControl: React.FC<Props> = ({
  status,
  message,
  disabled,
  onImport,
  onCustomImport,
}) => {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [menuView, setMenuView] = React.useState<'options' | 'custom'>('options');
  const [startedAt, setStartedAt] = React.useState('');
  const [endedAt, setEndedAt] = React.useState('');
  const [dateError, setDateError] = React.useState<string | null>(null);
  const controlRef = React.useRef<HTMLDivElement>(null);

  const closeMenu = React.useCallback(() => {
    setMenuOpen(false);
    setMenuView('options');
    setDateError(null);
  }, []);

  React.useEffect(() => {
    if (!menuOpen) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (!controlRef.current?.contains(event.target as Node)) closeMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeMenu, menuOpen]);

  const handleOpenMenu = () => {
    if (menuOpen) {
      closeMenu();
      return;
    }
    setMenuView('options');
    setDateError(null);
    setMenuOpen(true);
  };

  const handleDefaultImport = () => {
    closeMenu();
    onImport();
  };

  const handleOpenCustomImport = () => {
    setDateError(null);
    setMenuView('custom');
  };

  const handleCustomImport = () => {
    const start = toDayStart(startedAt);
    const rawEnd = toDayEnd(endedAt);
    const now = Date.now();
    const end = rawEnd !== null && new Date(endedAt).toDateString() === new Date(now).toDateString()
      ? now
      : rawEnd;
    if (start === null || end === null || start > end || end > now) {
      setDateError('請確認自訂日期範圍。');
      return;
    }
    setDateError(null);
    closeMenu();
    onCustomImport(start, end);
  };

  return (
    <div ref={controlRef} data-meeting-project-change-import-control className="relative flex min-w-0 flex-1 items-center justify-end gap-1.5">
      <button
        type="button"
        data-meeting-import-trigger
        aria-expanded={menuOpen}
        aria-haspopup="dialog"
        disabled={disabled || status === 'loading'}
        onClick={handleOpenMenu}
        className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
        title="開啟匯入專案變化選項"
      >
        {status === 'loading' ? <Loader2 size={13} className="shrink-0 animate-spin" /> : <Sparkles size={13} className="shrink-0" />}
        <span className="truncate">匯入專案變化</span>
      </button>
      {menuOpen ? (
        <div
          data-meeting-import-menu
          role="dialog"
          aria-label="匯入專案變化選項"
          className="absolute right-0 top-full z-30 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-md border border-slate-200 bg-white p-1.5 shadow-lg"
        >
          <div className="flex items-center justify-end">
            <button
              type="button"
              data-meeting-import-menu-close
              aria-label="關閉匯入專案變化選項"
              onClick={closeMenu}
              className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-50 hover:text-slate-700"
            >
              <X size={14} />
            </button>
          </div>
          {menuView === 'options' ? (
            <div className="grid gap-1">
              <button
                type="button"
                data-meeting-import-default
                disabled={disabled || status === 'loading'}
                onClick={handleDefaultImport}
                className="flex min-w-0 items-center gap-2 rounded px-2 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                title="帶入同一看板上次已發布會議後的新變更"
              >
                <Sparkles size={14} className="shrink-0 text-blue-600" />
                <span className="min-w-0 truncate">帶入上次會議後變更</span>
              </button>
              <button
                type="button"
                data-meeting-import-custom-toggle
                onClick={handleOpenCustomImport}
                className="flex min-w-0 items-center gap-2 rounded px-2 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900"
              >
                <CalendarRange size={14} className="shrink-0 text-slate-500" />
                <span className="min-w-0 flex-1 truncate">自訂日期</span>
                <ChevronRight size={14} className="shrink-0 text-slate-400" />
              </button>
            </div>
          ) : (
            <div data-meeting-import-custom-panel>
              <div className="flex items-center gap-1 border-b border-slate-100 pb-1.5">
                <button
                  type="button"
                  data-meeting-import-custom-back
                  aria-label="返回匯入專案變化選項"
                  onClick={() => { setDateError(null); setMenuView('options'); }}
                  className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                >
                  <ArrowLeft size={14} />
                </button>
                <span className="text-xs font-semibold text-slate-700">自訂日期</span>
              </div>
              <div className="mt-2 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                <label className="min-w-0 text-[11px] font-medium text-slate-500">
                  開始
                  <input
                    aria-label="自訂匯入開始日期"
                    data-meeting-import-custom-start
                    type="date"
                    value={startedAt}
                    onChange={event => { setStartedAt(event.target.value); setDateError(null); }}
                    className="mt-1 h-8 w-full min-w-0 rounded border border-slate-200 px-1.5 text-xs text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
                <label className="min-w-0 text-[11px] font-medium text-slate-500">
                  結束
                  <input
                    aria-label="自訂匯入結束日期"
                    data-meeting-import-custom-end
                    type="date"
                    value={endedAt}
                    onChange={event => { setEndedAt(event.target.value); setDateError(null); }}
                    className="mt-1 h-8 w-full min-w-0 rounded border border-slate-200 px-1.5 text-xs text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
                <button
                  type="button"
                  data-meeting-import-custom-submit
                  disabled={disabled || status === 'loading'}
                  onClick={handleCustomImport}
                  className="h-8 rounded border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  帶入
                </button>
                {dateError ? <div role="alert" className="col-span-3 text-[11px] text-red-600">{dateError}</div> : null}
              </div>
            </div>
          )}
        </div>
      ) : null}
      {message && (status === 'loading' || status === 'error') ? (
        <span
          role={status === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          data-meeting-import-feedback
          className={`max-w-full shrink-0 truncate text-[11px] ${status === 'error' ? 'text-red-600' : 'text-slate-500'}`}
        >
          {message}
        </span>
      ) : null}
    </div>
  );
};

export default MeetingProjectChangeImportControl;
