import React from 'react';
import type { MeetingTaskQuickNoteProjection } from '../../utils/meetingTaskQuickNotes';
import MeetingQuickNoteRows from './MeetingQuickNoteRows';
import TaskNoteContentSurface from './TaskNoteContentSurface';

interface TaskMeetingQuickNoteSectionProps {
  taskId: string;
  taskTitle: string;
  isMeetingMode: boolean;
  composerAvailable: boolean;
  availabilityMessage: string | null;
  canEdit: boolean;
  entries: MeetingTaskQuickNoteProjection[];
  loading: boolean;
  error: string | null;
  discussion: string;
  appendError: string | null;
  onDiscussionChange: (value: string) => void;
  onAppend: () => void;
  onRetry: () => void;
}

const TASK_MEETING_HISTORY_MAX_HEIGHT_PX = 200;

const TaskMeetingQuickNoteSection: React.FC<TaskMeetingQuickNoteSectionProps> = ({
  taskId,
  taskTitle,
  isMeetingMode,
  composerAvailable,
  availabilityMessage,
  canEdit,
  entries,
  loading,
  error,
  discussion,
  appendError,
  onDiscussionChange,
  onAppend,
  onRetry,
}) => {
  const [expanded, setExpanded] = React.useState(false);
  const visibleEntries = expanded ? entries : entries.slice(-3);
  const hiddenCount = Math.max(0, entries.length - visibleEntries.length);

  if (!isMeetingMode && entries.length === 0 && !error) return null;

  return (
    <section
      className="border-y border-slate-100 py-2"
      data-task-meeting-quick-notes="true"
      data-task-meeting-quick-notes-task-id={taskId}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700">會議紀錄</h3>
        {loading ? <span className="text-[11px] text-slate-400">載入中</span> : null}
      </div>

      {visibleEntries.length > 0 ? (
        <div className="space-y-0.5" data-task-meeting-quick-notes-list="true">
          <TaskNoteContentSurface
            className="max-h-[200px] pr-1"
            data-task-meeting-history-scroll="true"
            role="region"
            aria-label="會議紀錄歷程"
            tabIndex={0}
            style={{ maxHeight: `${TASK_MEETING_HISTORY_MAX_HEIGHT_PX}px` }}
          >
            <MeetingQuickNoteRows entries={visibleEntries} />
          </TaskNoteContentSurface>
          {entries.length > 3 ? (
            !expanded ? (
              <button
                type="button"
                className="mt-1 text-xs text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
                onClick={() => setExpanded(true)}
                aria-expanded={expanded}
                data-task-meeting-quick-notes-toggle="true"
              >
                {'其餘 ' + hiddenCount + ' 筆'}
              </button>
            ) : null
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="mt-1 flex items-center gap-2 text-xs text-rose-600" role="alert">
          <span>{error}</span>
          <button type="button" className="underline underline-offset-2" onClick={onRetry}>重試</button>
        </div>
      ) : null}

      {!error && isMeetingMode && availabilityMessage ? (
        <p className="mt-1 text-xs text-slate-500" data-task-meeting-quick-notes-availability="true">
          {availabilityMessage}
        </p>
      ) : null}

      {isMeetingMode && composerAvailable ? (
        <div className="mt-2 flex flex-col gap-1.5 sm:flex-row sm:items-end" data-task-meeting-quick-notes-composer="true">
          <textarea
            value={discussion}
            onChange={event => onDiscussionChange(event.target.value)}
            onKeyDown={event => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                onAppend();
              }
            }}
            disabled={!canEdit}
            className="min-h-9 min-w-0 flex-1 resize-y rounded border border-slate-200 bg-white px-2 py-1 text-sm leading-5 text-slate-800 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400"
            placeholder="輸入任務補記"
            aria-label={`新增${taskTitle}會議紀錄`}
          />
          <button
            type="button"
            onClick={onAppend}
            disabled={!canEdit || !discussion.trim()}
            className="h-8 shrink-0 rounded px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
          >
            加入
          </button>
        </div>
      ) : null}
      {appendError ? <p className="mt-1 text-xs text-rose-600" role="alert">{appendError}</p> : null}
    </section>
  );
};

export default TaskMeetingQuickNoteSection;
