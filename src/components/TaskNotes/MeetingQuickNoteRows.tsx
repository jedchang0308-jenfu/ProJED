import React from 'react';
import dayjs from 'dayjs';
import type { MeetingTaskQuickNoteProjection } from '../../utils/meetingTaskQuickNotes';

export type MeetingQuickNoteRowsProps = Readonly<{
  entries: readonly MeetingTaskQuickNoteProjection[];
}>;

/**
 * Shared, read-only presentation for a task's dated meeting quick-note rows.
 * The surrounding surface owns scrolling, expansion, and editing controls.
 */
const MeetingQuickNoteRows: React.FC<MeetingQuickNoteRowsProps> = ({ entries }) => (
  <>
    {entries.map(entry => (
      <div
        key={`${entry.recordId}:${entry.id}`}
        className="flex min-w-0 gap-2 text-sm leading-5"
        data-task-meeting-quick-note-row="true"
        data-record-status={entry.recordStatus}
      >
        <time className="w-10 shrink-0 text-xs tabular-nums text-slate-400" dateTime={new Date(entry.occurredAt).toISOString().slice(0, 10)}>
          {dayjs(entry.occurredAt).format('MM/DD')}
        </time>
        <span className="min-w-0 break-words text-slate-700">{entry.text}</span>
      </div>
    ))}
  </>
);

export default MeetingQuickNoteRows;
