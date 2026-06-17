import React from 'react';
import dayjs from 'dayjs';
import { BookOpenText, BriefcaseBusiness, CalendarClock, FileText, Plus } from 'lucide-react';
import useRecordStore from '../../store/useRecordStore';
import { useRecordDraftGuard } from '../../hooks/useRecordDraftGuard';
import { renderRecordContentAsPlainText } from '../../utils/recordContentMentions';

const formatRecordType = (type: string) => (type === 'meeting' ? '會議紀錄' : '個人工作紀錄');

const formatRecordStatus = (status: string) => (status === 'published' ? '已發布' : '草稿');

const RecordsView: React.FC = () => {
  const records = useRecordStore(state => state.records);
  const loading = useRecordStore(state => state.loading);
  const openNewRecord = useRecordStore(state => state.openNewRecord);
  const openExistingRecord = useRecordStore(state => state.openExistingRecord);
  const guardRecordDraft = useRecordDraftGuard();

  const handleNewMeetingRecord = () => {
    void guardRecordDraft(() => openNewRecord('meeting'), {
      title: '新增會後會議紀錄？',
      message: '新增會後會議紀錄會開啟新的草稿；若目前紀錄尚未儲存，請先決定是否存草稿。',
    });
  };

  const handleOpenRecord = (record: Parameters<typeof openExistingRecord>[0]) => {
    void guardRecordDraft(() => openExistingRecord(record), {
      title: '開啟另一筆紀錄？',
      message: '開啟另一筆紀錄會替換目前編輯中的草稿；若目前紀錄尚未儲存，請先決定是否存草稿。',
    });
  };

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5">
        <div className="flex items-center gap-2">
          <BookOpenText size={18} className="text-blue-500" />
          <div>
            <h1 className="text-sm font-semibold text-slate-900">紀錄庫</h1>
            <p className="text-xs text-slate-500">會後查閱與整理會議紀錄/個人工作紀錄；開會主畫面請使用看板上的新增會議記錄入口。</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleNewMeetingRecord}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
            title="補一筆會後會議紀錄；開會中請使用上方新增會議記錄。"
          >
            <Plus size={14} />
            補一筆會後紀錄
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
            <div className="mt-1 text-xs text-slate-500">本頁用於會後整理；開會時請回到看板啟動會議紀錄。</div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
            <div className="hidden grid-cols-[minmax(220px,1.05fr)_minmax(280px,2fr)_140px_84px] items-center gap-4 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-semibold text-slate-500 md:grid">
              <span>紀錄</span>
              <span>摘要</span>
              <span>狀態</span>
              <span className="text-right">任務</span>
            </div>
            <div className="divide-y divide-slate-100">
              {records.map(record => {
                const time = record.type === 'meeting'
                  ? record.occurredAt
                  : record.endedAt || record.startedAt;
                const previewText = renderRecordContentAsPlainText(record.content).trim() || '尚無內容摘要';
                return (
                  <button
                    key={record.id}
                    type="button"
                    onClick={() => handleOpenRecord(record)}
                    className="record-list-row grid w-full gap-3 px-4 py-3 text-left transition hover:bg-blue-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-500 md:grid-cols-[minmax(220px,1.05fr)_minmax(280px,2fr)_140px_84px] md:items-center md:gap-4"
                  >
                    <span className="flex min-w-0 items-start gap-3">
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-50 text-blue-500">
                        {record.type === 'meeting' ? <CalendarClock size={16} /> : <BriefcaseBusiness size={16} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-900">{record.title}</span>
                        <span className="mt-1 block text-xs text-slate-500">
                          {time ? dayjs(time).format('YYYY/MM/DD HH:mm') : '未填時間'}
                        </span>
                      </span>
                    </span>
                    <span className="line-clamp-2 text-xs leading-5 text-slate-600 md:text-sm">
                      {previewText}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      <span>{formatRecordType(record.type)}</span>
                      <span className={record.status === 'published' ? 'text-emerald-700' : 'text-amber-700'}>
                        {formatRecordStatus(record.status)}
                      </span>
                    </span>
                    <span className="text-xs font-medium text-slate-600 md:text-right">{record.taskLinks.length} 任務</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecordsView;
