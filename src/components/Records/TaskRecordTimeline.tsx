import React from 'react';
import dayjs from 'dayjs';
import { BookOpenText, CalendarClock, Plus } from 'lucide-react';
import useRecordStore from '../../store/useRecordStore';
import { renderRecordContentAsPlainText } from '../../utils/recordContentMentions';

interface TaskRecordTimelineProps {
  nodeId: string;
}

const TaskRecordTimeline: React.FC<TaskRecordTimelineProps> = ({ nodeId }) => {
  const records = useRecordStore(state => state.records);
  const openExistingRecord = useRecordStore(state => state.openExistingRecord);
  const openNewRecord = useRecordStore(state => state.openNewRecord);
  const relatedRecords = React.useMemo(
    () => records
      .filter(record => record.taskLinks.some(link => link.nodeId === nodeId))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    [nodeId, records]
  );

  return (
    <section className="border-t border-slate-100 pt-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <BookOpenText size={16} className="text-blue-500" />
          <span>關聯紀錄</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openNewRecord('meeting', nodeId)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Plus size={13} />
            會議
          </button>
          <button
            type="button"
            onClick={() => openNewRecord('work_log', nodeId)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Plus size={13} />
            工作
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {relatedRecords.map(record => {
          const time = record.type === 'meeting'
            ? record.occurredAt
            : record.endedAt || record.startedAt;
          return (
            <button
              key={record.id}
              type="button"
              onClick={() => openExistingRecord(record)}
              className="flex w-full items-start gap-3 rounded-md border border-slate-200 bg-white p-3 text-left transition hover:border-blue-300 hover:bg-blue-50/30"
            >
              <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-50 text-blue-500">
                <CalendarClock size={14} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-slate-800">{record.title}</span>
                  <span className="shrink-0 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500">
                    {record.type === 'meeting' ? '會議' : '工作'}
                  </span>
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  {time ? dayjs(time).format('YYYY/MM/DD HH:mm') : '未填時間'}
                </span>
                <span className="mt-1 line-clamp-2 block text-xs leading-5 text-slate-600">
                  {renderRecordContentAsPlainText(record.content)}
                </span>
              </span>
            </button>
          );
        })}
        {relatedRecords.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-200 px-3 py-5 text-center text-xs text-slate-400">
            尚無關聯紀錄
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default TaskRecordTimeline;
