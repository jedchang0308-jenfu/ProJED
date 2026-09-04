import React from 'react';
import dayjs from 'dayjs';
import { ArrowLeft, BriefcaseBusiness, CalendarClock } from 'lucide-react';
import useBoardStore from '../../store/useBoardStore';
import useRecordStore from '../../store/useRecordStore';
import { useRecordDraftGuard } from '../../hooks/useRecordDraftGuard';
import { renderRecordContentAsPlainText } from '../../utils/recordContentMentions';
import { useMeetingRecordAvailability } from '../../utils/meetingRecordAvailability';
import type { EditableKnowledgeRecord } from '../../types';

const formatRecordStatus = (status: string) => (status === 'published' ? '已發布' : '草稿');

const RecordTable: React.FC<{ records: EditableKnowledgeRecord[]; onOpen: (record: EditableKnowledgeRecord) => void }> = ({ records, onOpen }) => (
  <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm" data-record-list="true">
    <div className="hidden grid-cols-[minmax(220px,1.05fr)_minmax(280px,2fr)_140px] items-center gap-4 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-semibold text-slate-500 md:grid"><span>紀錄</span><span>摘要</span><span>狀態</span></div>
    <div className="divide-y divide-slate-100">{records.map(record => { const time = record.type === 'meeting' ? record.occurredAt : record.endedAt || record.startedAt; const previewText = renderRecordContentAsPlainText(record.content).trim() || '尚無內容摘要'; return <button key={record.id} type="button" onClick={() => onOpen(record)} className="record-list-row grid w-full gap-3 px-4 py-3 text-left transition hover:bg-blue-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-500 md:grid-cols-[minmax(220px,1.05fr)_minmax(280px,2fr)_140px] md:items-center md:gap-4"><span className="flex min-w-0 items-start gap-3"><span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-50 text-blue-500">{record.type === 'meeting' ? <CalendarClock size={16} /> : <BriefcaseBusiness size={16} />}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-900">{record.title}</span><span className="mt-1 block text-xs text-slate-500">{time ? dayjs(time).format('YYYY/MM/DD HH:mm') : '未填時間'}</span></span></span><span className="line-clamp-2 text-xs leading-5 text-slate-600 md:text-sm">{previewText}</span><span className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500"><span className={record.status === 'published' ? 'text-emerald-700' : 'text-amber-700'}>{formatRecordStatus(record.status)}</span></span></button>; })}</div>
  </div>
);

const RecordsView: React.FC = () => {
  const [activeSection, setActiveSection] = React.useState<'meeting' | 'work_log'>('meeting');
  const records = useRecordStore(state => state.records);
  const loading = useRecordStore(state => state.loading);
  const openExistingRecord = useRecordStore(state => state.openExistingRecord);
  const activeWorkspaceId = useBoardStore(state => state.activeWorkspaceId);
  const activeBoardId = useBoardStore(state => state.activeBoardId);
  const setView = useBoardStore(state => state.setView);
  const guardRecordDraft = useRecordDraftGuard();
  const { isMeetingRecordUnavailable } = useMeetingRecordAvailability();
  React.useEffect(() => {
    if (isMeetingRecordUnavailable && activeSection === 'meeting') setActiveSection('work_log');
  }, [activeSection, isMeetingRecordUnavailable]);
  const visibleRecords = React.useMemo(
    () => records.filter(record => !isMeetingRecordUnavailable || record.type !== 'meeting'),
    [isMeetingRecordUnavailable, records],
  );
  const recordGroups = React.useMemo(() => [
    { key: 'meeting', label: '會議紀錄', records: visibleRecords.filter(record => record.type === 'meeting') },
    { key: 'work_log', label: '個人工作紀錄', records: visibleRecords.filter(record => record.type === 'work_log') },
  ], [visibleRecords]);
  const returnToBoard = () => setView(activeWorkspaceId && activeBoardId ? 'board' : 'home');
  const sections = [
    ...(!isMeetingRecordUnavailable ? [{ key: 'meeting' as const, label: '會議紀錄' }] : []),
    { key: 'work_log' as const, label: '個人工作紀錄' },
  ];

  const handleOpenRecord = (record: Parameters<typeof openExistingRecord>[0]) => {
    void guardRecordDraft(() => openExistingRecord(record), {
      title: '開啟另一筆紀錄？',
      message: '開啟另一筆紀錄會替換目前編輯中的草稿；若目前紀錄尚未儲存，請先決定是否存草稿。',
    });
  };

  return (
    <div className="flex h-full flex-col bg-slate-50" data-records-active-section={activeSection}>
      <div className="flex h-14 shrink-0 items-center border-b border-slate-200 bg-white px-5">
        <div>
          <button
            type="button"
            onClick={returnToBoard}
            className="mr-2 inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:border-primary/35 hover:bg-primary/5 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            title="回到目前看板；也可以按 Esc"
            data-system-page-return-button="true"
            data-records-return-button="true"
          >
            <ArrowLeft size={15} />
            回到看板
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">Esc</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-5">
        <h1 className="sr-only">紀錄庫</h1>
        <nav aria-label="紀錄庫分區" role="tablist" className="mb-5 flex flex-wrap gap-2 border-b border-slate-200 pb-3" data-record-section-controls="true">
          {sections.map(section => <button key={section.key} id={`record-section-tab-${section.key}`} type="button" role="tab" aria-selected={activeSection === section.key} aria-controls={`record-panel-${section.key}`} onClick={() => setActiveSection(section.key)} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${activeSection === section.key ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`} data-record-section-tab={section.key}>{section.label}</button>)}
        </nav>
        {loading ? <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-500">載入紀錄中...</div> : recordGroups.map(group => <section key={group.key} id={`record-panel-${group.key}`} role="tabpanel" aria-labelledby={`record-section-heading-${group.key}`} hidden={activeSection !== group.key} data-record-section={group.key} className="mb-5"><div className="mb-2 flex items-center justify-between"><h2 id={`record-section-heading-${group.key}`} className="text-sm font-semibold text-slate-800">{group.label}</h2><span className="text-xs text-slate-400">{group.records.length} 筆</span></div>{group.records.length ? <RecordTable records={group.records} onOpen={handleOpenRecord} /> : <div className="rounded-md border border-dashed border-slate-300 bg-white p-4 text-xs text-slate-500">尚無{group.label}。</div>}</section>)}
      </div>
    </div>
  );
};

export default RecordsView;
