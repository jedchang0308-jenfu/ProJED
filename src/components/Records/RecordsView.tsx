import React from 'react';
import dayjs from 'dayjs';
import { ArrowLeft, BookOpenText, BriefcaseBusiness, CalendarClock, Plus } from 'lucide-react';
import useBoardStore from '../../store/useBoardStore';
import useRecordStore from '../../store/useRecordStore';
import { useRecordDraftGuard } from '../../hooks/useRecordDraftGuard';
import { renderRecordContentAsPlainText } from '../../utils/recordContentMentions';
import { useMeetingRecordAvailability } from '../../utils/meetingRecordAvailability';
import useTaskCollectionStore from '../../store/useTaskCollectionStore';
import TaskCollectionDetail from './TaskCollectionDetail';
import type { EditableKnowledgeRecord, KnowledgeRecord } from '../../types';

const formatRecordType = (type: KnowledgeRecord['type']) => {
  switch (type) {
    case 'meeting': return '會議紀錄';
    case 'work_log': return '個人工作紀錄';
    case 'task_collection': return '典藏任務';
    default: return '未知紀錄';
  }
};

const formatRecordStatus = (status: string) => (status === 'published' ? '已發布' : '草稿');

const RecordTable: React.FC<{ records: EditableKnowledgeRecord[]; onOpen: (record: EditableKnowledgeRecord) => void }> = ({ records, onOpen }) => (
  <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
    <div className="hidden grid-cols-[minmax(220px,1.05fr)_minmax(280px,2fr)_140px_84px] items-center gap-4 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-semibold text-slate-500 md:grid"><span>紀錄</span><span>摘要</span><span>狀態</span><span className="text-right">任務</span></div>
    <div className="divide-y divide-slate-100">{records.map(record => { const time = record.type === 'meeting' ? record.occurredAt : record.endedAt || record.startedAt; const previewText = renderRecordContentAsPlainText(record.content).trim() || '尚無內容摘要'; return <button key={record.id} type="button" onClick={() => onOpen(record)} className="record-list-row grid w-full gap-3 px-4 py-3 text-left transition hover:bg-blue-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-500 md:grid-cols-[minmax(220px,1.05fr)_minmax(280px,2fr)_140px_84px] md:items-center md:gap-4"><span className="flex min-w-0 items-start gap-3"><span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-50 text-blue-500">{record.type === 'meeting' ? <CalendarClock size={16} /> : <BriefcaseBusiness size={16} />}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-900">{record.title}</span><span className="mt-1 block text-xs text-slate-500">{time ? dayjs(time).format('YYYY/MM/DD HH:mm') : '未填時間'}</span></span></span><span className="line-clamp-2 text-xs leading-5 text-slate-600 md:text-sm">{previewText}</span><span className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500"><span>{formatRecordType(record.type)}</span><span className={record.status === 'published' ? 'text-emerald-700' : 'text-amber-700'}>{formatRecordStatus(record.status)}</span></span><span className="text-xs font-medium text-slate-600 md:text-right">{record.taskLinks.length} 任務</span></button>; })}</div>
  </div>
);

const RecordsView: React.FC = () => {
  const [collectionQuery, setCollectionQuery] = React.useState('');
  const records = useRecordStore(state => state.records);
  const loading = useRecordStore(state => state.loading);
  const openNewRecord = useRecordStore(state => state.openNewRecord);
  const openExistingRecord = useRecordStore(state => state.openExistingRecord);
  const activeWorkspaceId = useBoardStore(state => state.activeWorkspaceId);
  const activeBoardId = useBoardStore(state => state.activeBoardId);
  const setView = useBoardStore(state => state.setView);
  const guardRecordDraft = useRecordDraftGuard();
  const { isMeetingRecordUnavailable } = useMeetingRecordAvailability();
  const collectionSummaries = useTaskCollectionStore(state => state.summaries);
  const activeCollectionSection = useTaskCollectionStore(state => state.activeSection);
  const setActiveCollectionSection = useTaskCollectionStore(state => state.setActiveSection);
  const collectionLoading = useTaskCollectionStore(state => state.loading);
  const selectedCollection = useTaskCollectionStore(state => state.selected);
  const loadCollections = useTaskCollectionStore(state => state.load);
  const openCollection = useTaskCollectionStore(state => state.open);
  const clearCollection = useTaskCollectionStore(state => state.clear);
  const sectionInitializedRef = React.useRef(false);
  React.useEffect(() => {
    if (sectionInitializedRef.current || selectedCollection) return;
    sectionInitializedRef.current = true;
    if (activeCollectionSection === 'task_collection') setActiveCollectionSection(isMeetingRecordUnavailable ? 'work_log' : 'meeting');
  }, [activeCollectionSection, isMeetingRecordUnavailable, selectedCollection, setActiveCollectionSection]);
  React.useEffect(() => {
    if (isMeetingRecordUnavailable && activeCollectionSection === 'meeting') setActiveCollectionSection('work_log');
  }, [activeCollectionSection, isMeetingRecordUnavailable, setActiveCollectionSection]);
  React.useEffect(() => {
    if (activeWorkspaceId && activeBoardId) void loadCollections(activeWorkspaceId, activeBoardId, collectionQuery.trim());
  }, [activeBoardId, activeWorkspaceId, collectionQuery, loadCollections]);
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
    { key: 'task_collection' as const, label: '典藏任務' },
    ...(!isMeetingRecordUnavailable ? [{ key: 'meeting' as const, label: '會議紀錄' }] : []),
    { key: 'work_log' as const, label: '個人工作紀錄' },
  ];

  if (selectedCollection) {
    return <TaskCollectionDetail record={selectedCollection} onBack={clearCollection} />;
  }

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
    <div className="flex h-full flex-col bg-slate-50" data-records-active-section={activeCollectionSection}>
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5">
        <div className="flex items-center gap-2">
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
          <BookOpenText size={18} className="text-blue-500" />
          <div>
            <h1 className="text-sm font-semibold text-slate-900">紀錄庫</h1>
            <p className="text-xs text-slate-500">{isMeetingRecordUnavailable ? '查閱與整理個人工作紀錄。' : '會後查閱與整理會議紀錄/個人工作紀錄；開會主畫面請使用看板上的新增會議記錄入口。'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isMeetingRecordUnavailable ? <button
            type="button"
            onClick={handleNewMeetingRecord}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
            title="補一筆會後會議紀錄；開會中請使用上方新增會議記錄。"
          >
            <Plus size={14} />
            補一筆會後紀錄
          </button> : null}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-5">
        <nav aria-label="紀錄庫分區" role="tablist" className="mb-5 flex flex-wrap gap-2 border-b border-slate-200 pb-3" data-record-section-controls="true">
          {sections.map(section => <button key={section.key} id={`record-section-tab-${section.key}`} type="button" role="tab" aria-selected={activeCollectionSection === section.key} aria-controls={`record-panel-${section.key}`} onClick={() => setActiveCollectionSection(section.key)} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${activeCollectionSection === section.key ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`} data-record-section-tab={section.key}>{section.label}</button>)}
        </nav>
        <section id="record-panel-task_collection" role="tabpanel" aria-labelledby="record-section-tab-task_collection" hidden={activeCollectionSection !== 'task_collection'} data-record-section="task-collections" className="mb-5">
          <div className="mb-2 flex flex-wrap items-end justify-between gap-2"><div><h2 className="text-sm font-semibold text-slate-800">典藏任務</h2><p className="text-xs text-slate-500">保留完整子任務樹與歷程，不出現在看板。</p></div><div className="flex items-center gap-2"><label className="sr-only" htmlFor="task-collection-search">搜尋典藏任務</label><input id="task-collection-search" value={collectionQuery} onChange={event => setCollectionQuery(event.target.value.slice(0, 100))} placeholder="搜尋典藏" className="h-8 w-36 rounded-md border border-slate-200 bg-white px-2 text-xs outline-none focus:border-blue-400" /><span className="text-xs text-slate-400">{collectionLoading ? '載入中…' : `${collectionSummaries.length} 筆`}</span></div></div>
          {collectionSummaries.length ? <div className="overflow-hidden rounded-md border border-blue-100 bg-white shadow-sm divide-y divide-slate-100">{collectionSummaries.map(summary => <button key={summary.recordId} type="button" data-task-collection-row-id={summary.recordId} onClick={() => activeWorkspaceId && activeBoardId && void openCollection(activeWorkspaceId, activeBoardId, summary.recordId)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-blue-50/40"><span><span className="block text-sm font-semibold text-slate-800">{summary.title}</span><span className="mt-1 block text-xs text-slate-500">{dayjs(summary.occurredAt).format('YYYY/MM/DD HH:mm')} · {summary.taskCount} 個任務</span></span><span className="text-xs text-blue-600">檢視</span></button>)}</div> : <div className="rounded-md border border-dashed border-slate-300 bg-white p-4 text-xs text-slate-500">尚無典藏任務。從看板任務選單選擇「典藏任務」即可建立資產。</div>}
        </section>
        {loading ? <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-500">載入紀錄中...</div> : recordGroups.map(group => <section key={group.key} id={`record-panel-${group.key}`} role="tabpanel" aria-labelledby={`record-section-heading-${group.key}`} hidden={activeCollectionSection !== group.key} data-record-section={group.key} className="mb-5"><div className="mb-2 flex items-center justify-between"><h2 id={`record-section-heading-${group.key}`} className="text-sm font-semibold text-slate-800">{group.label}</h2><span className="text-xs text-slate-400">{group.records.length} 筆</span></div>{group.records.length ? <RecordTable records={group.records} onOpen={handleOpenRecord} /> : <div className="rounded-md border border-dashed border-slate-300 bg-white p-4 text-xs text-slate-500">尚無{group.label}。</div>}</section>)}
      </div>
    </div>
  );
};

export default RecordsView;
