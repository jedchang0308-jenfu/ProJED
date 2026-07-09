import React from 'react';
import dayjs from 'dayjs';
import { BookOpenText, CalendarClock, FileText, Plus, Search } from 'lucide-react';
import useRecordStore from '../../store/useRecordStore';
import { useWbsStore } from '../../store/useWbsStore';
import { useRecordDraftGuard } from '../../hooks/useRecordDraftGuard';
import {
  extractTaskRecordSnippets,
  taskKnowledgeMatchesQuery,
  type TaskKnowledgeSnippet,
} from '../../utils/taskKnowledgeSnippets';

interface TaskRecordTimelineProps {
  nodeId: string;
}

const getRecordTime = (record: { type: string; occurredAt?: number; endedAt?: number; startedAt?: number }) =>
  record.type === 'meeting'
    ? record.occurredAt
    : record.endedAt || record.startedAt;

const getSnippetLabel = (recordType: string, snippet: TaskKnowledgeSnippet) => {
  if (snippet.kind === 'linked_record') return '整篇關聯';
  if (/(狀態|位置|日期|負責人|協作者|標籤|封存|還原|新增任務|任務變更)/.test(snippet.text)) {
    return '任務變更';
  }
  return recordType === 'meeting' ? '會議片段' : '工作片段';
};

const TaskRecordTimeline: React.FC<TaskRecordTimelineProps> = ({ nodeId }) => {
  const node = useWbsStore(state => state.nodes[nodeId]);
  const records = useRecordStore(state => state.records);
  const openExistingRecord = useRecordStore(state => state.openExistingRecord);
  const openNewRecord = useRecordStore(state => state.openNewRecord);
  const guardRecordDraft = useRecordDraftGuard();
  const [query, setQuery] = React.useState('');
  const detailNotes = node?.detailNotes ?? [];
  const relatedRecords = React.useMemo(
    () => records
      .filter(record => record.taskLinks.some(link => link.nodeId === nodeId))
      .sort((a, b) => (getRecordTime(b) || b.updatedAt || 0) - (getRecordTime(a) || a.updatedAt || 0)),
    [nodeId, records]
  );
  const knowledgeRecords = React.useMemo(
    () => relatedRecords
      .map(record => {
        const snippets = extractTaskRecordSnippets(record.content, nodeId);
        return { record, snippets };
      })
      .filter(({ record, snippets }) =>
        taskKnowledgeMatchesQuery(query, [
          record.title,
          record.type === 'meeting' ? '會議' : '工作',
          ...snippets.map(snippet => snippet.text),
        ])
      ),
    [nodeId, query, relatedRecords]
  );
  const noteMatches = React.useMemo(
    () => {
      const normalizedQuery = query.trim();
      if (!normalizedQuery || !detailNotes.length) return [];
      return detailNotes.filter(note =>
        taskKnowledgeMatchesQuery(normalizedQuery, [note.title, note.content])
      );
    },
    [detailNotes, query]
  );
  const hasResults = knowledgeRecords.length > 0 || noteMatches.length > 0;
  const handleNewRecord = (type: 'meeting' | 'work_log') => {
    void guardRecordDraft(() => openNewRecord(type, nodeId), {
      title: type === 'meeting' ? '補會後紀錄到此任務？' : '補工作紀錄到此任務？',
      message: '補紀錄會自動關聯目前任務並開啟新的草稿；若目前紀錄尚未儲存，請先決定是否存草稿。',
    });
  };
  const handleOpenRecord = (record: Parameters<typeof openExistingRecord>[0]) => {
    void guardRecordDraft(() => openExistingRecord(record), {
      title: '開啟另一筆紀錄？',
      message: '開啟另一筆紀錄會替換目前編輯中的草稿；若目前紀錄尚未儲存，請先決定是否存草稿。',
    });
  };

  return (
    <section className="border-t border-slate-100 pt-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-700">
          <BookOpenText size={16} className="text-blue-500" />
          <span>任務知識</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleNewRecord('meeting')}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            title="補一筆會後紀錄，並自動關聯目前任務。"
          >
            <Plus size={13} />
            補會後紀錄
          </button>
          <button
            type="button"
            onClick={() => handleNewRecord('work_log')}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            title="補一筆個人工作紀錄，並自動關聯目前任務。"
          >
            <Plus size={13} />
            補工作紀錄
          </button>
        </div>
      </div>

      <label className="mb-3 flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-500 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
        <Search size={14} className="shrink-0 text-slate-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
          placeholder="搜尋此任務的會議細節、變更或備註"
        />
      </label>

      <div className="space-y-2">
        {noteMatches.length > 0 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-amber-800">
              <FileText size={14} />
              <span>備註命中</span>
            </div>
            <div className="space-y-2">
              {noteMatches.map(note => (
                <div key={note.id} className="rounded-md bg-white/80 p-2">
                  <div className="truncate text-xs font-semibold text-slate-800">{note.title}</div>
                  <div className="mt-1 line-clamp-3 text-xs leading-5 text-slate-600">{note.content}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {knowledgeRecords.map(({ record, snippets }) => {
          const time = getRecordTime(record);
          return (
            <button
              key={record.id}
              type="button"
              onClick={() => handleOpenRecord(record)}
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
                <span className="mt-2 block space-y-1.5">
                  {snippets.map(snippet => (
                    <span
                      key={snippet.id}
                      className="block rounded-md bg-slate-50 px-2 py-1.5 text-xs leading-5 text-slate-600 group-hover:bg-white/80"
                    >
                      <span className="mb-1 inline-flex rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                        {getSnippetLabel(record.type, snippet)}
                      </span>
                      <span className="line-clamp-3 block">{snippet.text}</span>
                    </span>
                  ))}
                </span>
              </span>
            </button>
          );
        })}
        {!hasResults ? (
          <div className="rounded-md border border-dashed border-slate-200 px-3 py-5 text-center text-xs text-slate-400">
            {query.trim() ? '沒有符合搜尋的任務知識' : '尚無關聯紀錄'}
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default TaskRecordTimeline;
