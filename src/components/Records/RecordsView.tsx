import React from 'react';
import dayjs from 'dayjs';
import { BookOpenText, BriefcaseBusiness, CalendarClock, FileText, Plus } from 'lucide-react';
import useRecordStore from '../../store/useRecordStore';
import { renderRecordContentAsPlainText } from '../../utils/recordContentMentions';

const RecordsView: React.FC = () => {
  const records = useRecordStore(state => state.records);
  const loading = useRecordStore(state => state.loading);
  const openNewRecord = useRecordStore(state => state.openNewRecord);
  const openExistingRecord = useRecordStore(state => state.openExistingRecord);

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5">
        <div className="flex items-center gap-2">
          <BookOpenText size={18} className="text-blue-500" />
          <div>
            <h1 className="text-sm font-semibold text-slate-900">會議與工作紀錄</h1>
            <p className="text-xs text-slate-500">以任務 node 串接討論、個人進度與 AI 分析脈絡。</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openNewRecord('meeting')}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Plus size={14} />
            會議紀錄
          </button>
          <button
            type="button"
            onClick={() => openNewRecord('work_log')}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-700"
          >
            <Plus size={14} />
            工作紀錄
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-5">
        {loading ? (
          <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-500">載入紀錄中...</div>
        ) : records.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center">
            <FileText size={24} className="mx-auto mb-2 text-slate-300" />
            <div className="text-sm font-semibold text-slate-700">尚無紀錄</div>
            <div className="mt-1 text-xs text-slate-500">從右側欄或本頁新增第一筆會議/工作紀錄。</div>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {records.map(record => {
              const time = record.type === 'meeting'
                ? record.occurredAt
                : record.endedAt || record.startedAt;
              return (
                <button
                  key={record.id}
                  type="button"
                  onClick={() => openExistingRecord(record)}
                  className="rounded-md border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:bg-blue-50/30"
                >
                  <div className="mb-3 flex items-start gap-3">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-50 text-blue-500">
                      {record.type === 'meeting' ? <CalendarClock size={16} /> : <BriefcaseBusiness size={16} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900">{record.title}</span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {time ? dayjs(time).format('YYYY/MM/DD HH:mm') : '未填時間'}
                      </span>
                    </span>
                  </div>
                  <p className="line-clamp-3 min-h-[60px] text-xs leading-5 text-slate-600">
                    {renderRecordContentAsPlainText(record.content)}
                  </p>
                  <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500">
                    <span>{record.type === 'meeting' ? '會議紀錄' : '個人工作紀錄'}</span>
                    <span>{record.status === 'published' ? '已發布' : '草稿'}</span>
                    <span>{record.taskLinks.length} 任務</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default RecordsView;
