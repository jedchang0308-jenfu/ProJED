import React from 'react';
import dayjs from 'dayjs';
import { RotateCcw, X } from 'lucide-react';
import useRecordStore from '../../store/useRecordStore';

/**
 * Startup recovery is intentionally opt-in. This notice keeps the board as
 * the first view while giving the user a clear, reversible recovery action.
 */
const MeetingDraftRecoveryNotice: React.FC = () => {
  const pendingSnapshot = useRecordStore(state => state.meetingDraftRecovery.pendingSnapshot);
  const restoreMeetingDraftSnapshot = useRecordStore(state => state.restoreMeetingDraftSnapshot);
  const setMeetingDraftRecovery = useRecordStore(state => state.setMeetingDraftRecovery);

  if (!pendingSnapshot) return null;

  const savedDate = dayjs(pendingSnapshot.savedAt).format('MM/DD');
  const title = pendingSnapshot.draft.title?.trim() || '會議紀錄';

  return (
    <div
      role="status"
      aria-live="polite"
      data-meeting-draft-recovery-prompt
      className="pointer-events-auto fixed right-4 top-16 z-[10000] flex max-w-[min(420px,calc(100vw-2rem))] items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-lg"
    >
      <RotateCcw size={16} className="shrink-0 text-amber-600" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-slate-700">
        <span className="font-medium">有未完成的會議草稿</span>
        <span className="ml-1 truncate text-slate-500">{title} · {savedDate}</span>
      </p>
      <button
        type="button"
        onClick={() => restoreMeetingDraftSnapshot(pendingSnapshot)}
        className="shrink-0 rounded-md bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400"
        data-meeting-draft-recovery-restore
      >
        恢復
      </button>
      <button
        type="button"
        onClick={() => setMeetingDraftRecovery({ pendingSnapshot: null })}
        className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
        aria-label="稍後處理未完成的會議草稿"
        title="稍後處理"
        data-meeting-draft-recovery-dismiss
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
};

export default MeetingDraftRecoveryNotice;
