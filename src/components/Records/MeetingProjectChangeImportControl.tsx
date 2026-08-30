import React from 'react';
import { CalendarRange, Loader2, Sparkles } from 'lucide-react';

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
  const [customOpen, setCustomOpen] = React.useState(false);
  const [startedAt, setStartedAt] = React.useState('');
  const [endedAt, setEndedAt] = React.useState('');
  const [dateError, setDateError] = React.useState<string | null>(null);

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
    onCustomImport(start, end);
  };

  return (
    <div data-meeting-project-change-import-control className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        data-meeting-import-default
        disabled={disabled || status === 'loading'}
        onClick={onImport}
        className="inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
        title="帶入同一看板上次已發布會議後的新變更"
      >
        {status === 'loading' ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
        帶入上次會議後變更
      </button>
      <button
        type="button"
        data-meeting-import-custom-toggle
        aria-expanded={customOpen}
        onClick={() => setCustomOpen(value => !value)}
        className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700"
      >
        <CalendarRange size={13} />
        自訂日期
      </button>
      {customOpen ? (
        <div data-meeting-import-custom-panel className="grid w-full grid-cols-[1fr_1fr_auto] items-end gap-2 border-t border-slate-100 pt-2">
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
      ) : null}
      {message ? (
        <span
          role={status === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          data-meeting-import-feedback
          className={`w-full text-[11px] ${status === 'error' ? 'text-red-600' : status === 'complete' ? 'text-emerald-700' : 'text-slate-500'}`}
        >
          {message}
        </span>
      ) : null}
    </div>
  );
};

export default MeetingProjectChangeImportControl;
