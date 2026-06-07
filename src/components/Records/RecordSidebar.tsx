import React from 'react';
import dayjs from 'dayjs';
import { BookOpenText, ChevronLeft, ChevronRight, FileText, PanelRightClose, PanelRightOpen, Plus, Save, Send, Trash2, UsersRound } from 'lucide-react';
import useAuthStore from '../../store/useAuthStore';
import useBoardStore from '../../store/useBoardStore';
import useRecordStore from '../../store/useRecordStore';
import { useWbsStore } from '../../store/useWbsStore';
import RecordContentEditor from './RecordContentEditor';
import type { KnowledgeRecord, KnowledgeRecordStatus, KnowledgeRecordType, KnowledgeRecordVisibility, RecordTaskLinkRole } from '../../types';

const LINK_ROLE_OPTIONS: Array<{ value: RecordTaskLinkRole; label: string }> = [
  { value: 'main', label: '主任務' },
  { value: 'related', label: '相關' },
  { value: 'decision', label: '決議' },
  { value: 'blocker', label: '阻礙' },
  { value: 'follow_up', label: '追蹤' },
];

const toInputDateTime = (value?: number) =>
  value ? dayjs(value).format('YYYY-MM-DDTHH:mm') : '';

const fromInputDateTime = (value: string) =>
  value ? dayjs(value).valueOf() : undefined;

const recordTypeLabel = (type: KnowledgeRecordType) =>
  type === 'meeting' ? '會議紀錄' : '個人工作紀錄';

const statusLabel = (status: KnowledgeRecordStatus) =>
  status === 'published' ? '已發布' : status === 'archived' ? '已封存' : '草稿';

const visibilityLabel = (visibility: KnowledgeRecordVisibility) => {
  if (visibility === 'private') return '私人';
  if (visibility === 'tenant') return '工作區';
  return '專案';
};

const RecordListItem: React.FC<{ record: KnowledgeRecord; onOpen: () => void }> = ({ record, onOpen }) => (
  <button
    type="button"
    onClick={onOpen}
    className="block w-full rounded-md border border-slate-200 bg-white p-3 text-left transition hover:border-blue-300 hover:bg-blue-50/40"
  >
    <div className="mb-1 flex items-center justify-between gap-2">
      <span className="truncate text-sm font-semibold text-slate-800">{record.title}</span>
      <span className="shrink-0 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500">
        {statusLabel(record.status)}
      </span>
    </div>
    <div className="flex items-center gap-2 text-[11px] text-slate-500">
      <span>{recordTypeLabel(record.type)}</span>
      <span>{visibilityLabel(record.visibility)}</span>
      <span>{record.taskLinks.length} 任務</span>
    </div>
  </button>
);

const RecordSidebar: React.FC = () => {
  const user = useAuthStore(state => state.user);
  const nodes = useWbsStore(state => state.nodes);
  const { activeWorkspaceId, activeBoardId } = useBoardStore();
  const records = useRecordStore(state => state.records);
  const draft = useRecordStore(state => state.draft);
  const loading = useRecordStore(state => state.loading);
  const saving = useRecordStore(state => state.saving);
  const error = useRecordStore(state => state.error);
  const isPanelOpen = useRecordStore(state => state.isPanelOpen);
  const isPanelCollapsed = useRecordStore(state => state.isPanelCollapsed);
  const isMeetingMode = useRecordStore(state => state.isMeetingMode);
  const openNewRecord = useRecordStore(state => state.openNewRecord);
  const openExistingRecord = useRecordStore(state => state.openExistingRecord);
  const closePanel = useRecordStore(state => state.closePanel);
  const exitMeetingMode = useRecordStore(state => state.exitMeetingMode);
  const togglePanelCollapsed = useRecordStore(state => state.togglePanelCollapsed);
  const updateDraft = useRecordStore(state => state.updateDraft);
  const contentCursorOffset = useRecordStore(state => state.contentCursorOffset);
  const setContentCursorOffset = useRecordStore(state => state.setContentCursorOffset);
  const meetingActivities = useRecordStore(state => state.meetingActivities);
  const setDraftTaskRole = useRecordStore(state => state.setDraftTaskRole);
  const enterTaskSelectionMode = useRecordStore(state => state.enterTaskSelectionMode);
  const saveDraft = useRecordStore(state => state.saveDraft);
  const archiveRecord = useRecordStore(state => state.archiveRecord);

  React.useEffect(() => {
    const handleOpenRecord = (event: Event) => {
      const detail = (event as CustomEvent<{ recordId?: string }>).detail;
      const record = records.find(item => item.id === detail?.recordId);
      if (record) openExistingRecord(record);
    };
    document.addEventListener('open-knowledge-record', handleOpenRecord);
    return () => document.removeEventListener('open-knowledge-record', handleOpenRecord);
  }, [openExistingRecord, records]);

  if (!isPanelOpen) return null;

  const selectedLinks = draft?.taskLinks || [];
  const canSave = Boolean(activeWorkspaceId && activeBoardId && draft && draft.title.trim() && draft.content.trim());

  const handleSave = async (status: KnowledgeRecordStatus) => {
    updateDraft({ status });
    await saveDraft();
  };

  if (isPanelCollapsed) {
    return (
      <aside className="fixed inset-x-0 bottom-0 z-30 flex h-12 w-full shrink-0 flex-row items-center justify-between border-t border-slate-200 bg-white px-3 shadow-sm sm:relative sm:inset-auto sm:z-auto sm:h-auto sm:w-12 sm:flex-col sm:justify-start sm:border-l sm:border-t-0 sm:px-0 sm:py-3">
        <button
          type="button"
          onClick={togglePanelCollapsed}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
          title="展開紀錄欄"
        >
          <PanelRightOpen size={17} />
        </button>
        <div className="mt-0 flex text-[11px] font-medium text-slate-500 [writing-mode:horizontal-tb] sm:mt-3 sm:[writing-mode:vertical-rl]">
          {isMeetingMode ? '會議速記' : '紀錄'}
        </div>
        {selectedLinks.length ? (
          <div className="mt-0 rounded-md bg-blue-50 px-1.5 py-1 text-[11px] font-semibold text-blue-600 sm:mt-3">
            {selectedLinks.length}
          </div>
        ) : null}
      </aside>
    );
  }

  return (
    <aside className="fixed inset-x-0 bottom-0 z-30 flex max-h-[48vh] w-full shrink-0 flex-col border-t border-slate-200 bg-white shadow-2xl sm:relative sm:inset-auto sm:z-auto sm:max-h-none sm:w-[390px] sm:border-l sm:border-t-0 sm:shadow-sm">
      <div className="flex h-11 items-center justify-between border-b border-slate-200 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <BookOpenText size={16} className="text-blue-500" />
          <span className="truncate text-sm font-semibold text-slate-800">{isMeetingMode ? '會議速記' : '專案紀錄'}</span>
        </div>
        <div className="flex items-center gap-1">
          {!isMeetingMode ? (
            <>
              <button
                type="button"
                onClick={() => openNewRecord('meeting')}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs text-slate-700 hover:bg-slate-50"
              >
                <Plus size={13} />
                會議
              </button>
              <button
                type="button"
                onClick={() => openNewRecord('work_log')}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs text-slate-700 hover:bg-slate-50"
              >
                <Plus size={13} />
                工作
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={togglePanelCollapsed}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
            title="收合紀錄欄"
          >
            <PanelRightClose size={16} />
          </button>
          <button
            type="button"
            onClick={isMeetingMode ? exitMeetingMode : closePanel}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
            title={isMeetingMode ? '結束會議模式，保留目前草稿' : '關閉紀錄欄'}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <section className="border-b border-slate-100 p-3">
          {draft ? (
            <div className="space-y-3">
              {!isMeetingMode ? (
                <div className="grid grid-cols-2 gap-2">
                  {(['meeting', 'work_log'] as KnowledgeRecordType[]).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => updateDraft({ type })}
                      className={`h-9 rounded-md border text-xs font-medium ${
                        draft.type === type
                          ? 'border-blue-400 bg-blue-50 text-blue-700'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {recordTypeLabel(type)}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-700">
                  會議模式：主畫面維持一般看板編輯；任務狀態、移動與關鍵變更會在儲存時納入紀錄。
                </div>
              )}

              <label className="block text-xs font-medium text-slate-500">
                標題
                <input
                  value={draft.title}
                  onChange={event => updateDraft({ title: event.target.value })}
                  className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </label>

              {draft.type === 'meeting' ? (
                <>
                  <label className="block text-xs font-medium text-slate-500">
                    紀錄時間
                    <input
                      type="datetime-local"
                      value={toInputDateTime(draft.occurredAt)}
                      onChange={event => updateDraft({ occurredAt: fromInputDateTime(event.target.value) })}
                      className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                  <label className="block text-xs font-medium text-slate-500">
                    參與人員
                    <div className="mt-1 flex items-center gap-2">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-slate-50 text-slate-400">
                        <UsersRound size={15} />
                      </span>
                      <input
                        value={draft.participantsText || ''}
                        onChange={event => updateDraft({ participantsText: event.target.value })}
                        placeholder="例如：PM、RD、QA、供應商"
                        className="h-9 min-w-0 flex-1 rounded-md border border-slate-200 px-2 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                  </label>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs font-medium text-slate-500">
                    開始時間
                    <input
                      type="datetime-local"
                      value={toInputDateTime(draft.startedAt)}
                      onChange={event => updateDraft({ startedAt: fromInputDateTime(event.target.value) })}
                      className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                  <label className="block text-xs font-medium text-slate-500">
                    結束時間
                    <input
                      type="datetime-local"
                      value={toInputDateTime(draft.endedAt)}
                      onChange={event => updateDraft({ endedAt: fromInputDateTime(event.target.value) })}
                      className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                  <div className="col-span-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-500">
                    記錄人員：{user?.displayName || user?.email || user?.uid || '目前使用者'}
                  </div>
                </div>
              )}

              <label className="block text-xs font-medium text-slate-500">
                內容
                <RecordContentEditor
                  value={draft.content}
                  nodes={nodes}
                  cursorOffset={contentCursorOffset}
                  onChange={content => updateDraft({ content })}
                  onCursorOffsetChange={setContentCursorOffset}
                  placeholder="記錄討論、決議、進度、風險、待追蹤事項..."
                  editorClassName={isMeetingMode ? 'min-h-[220px]' : undefined}
                />
              </label>

              {isMeetingMode ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50">
                  <div className="flex items-center justify-between border-b border-emerald-100 px-3 py-2">
                    <span className="text-xs font-semibold text-emerald-800">本次會議變更</span>
                    <span className="rounded-md bg-white px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                      {meetingActivities.length}
                    </span>
                  </div>
                  <div className="max-h-32 overflow-auto p-2">
                    {meetingActivities.length ? (
                      meetingActivities.slice(-6).reverse().map(activity => (
                        <div key={`${activity.occurredAt}-${activity.nodeId}-${activity.summary}`} className="mb-1.5 rounded-md bg-white px-2 py-1.5 text-xs leading-5 text-emerald-900 shadow-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-semibold" title={activity.title}>{activity.title}</span>
                            <span className="shrink-0 text-[10px] text-emerald-500">{dayjs(activity.occurredAt).format('HH:mm')}</span>
                          </div>
                          <div className="truncate text-emerald-700" title={activity.summary}>{activity.summary}</div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-md border border-dashed border-emerald-200 bg-white/70 px-3 py-3 text-center text-xs text-emerald-500">
                        尚未偵測到任務變更
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-medium text-slate-500">
                  可見性
                  <select
                    value={draft.visibility}
                    onChange={event => updateDraft({ visibility: event.target.value as KnowledgeRecordVisibility })}
                    className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="private">私人</option>
                    <option value="project">專案</option>
                    <option value="tenant">工作區</option>
                  </select>
                </label>
                <label className="block text-xs font-medium text-slate-500">
                  狀態
                  <select
                    value={draft.status}
                    onChange={event => updateDraft({ status: event.target.value as KnowledgeRecordStatus })}
                    className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="draft">草稿</option>
                    <option value="published">已發布</option>
                  </select>
                </label>
              </div>

              <div className="rounded-md border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                  <span className="text-xs font-semibold text-slate-700">關聯任務</span>
                  <button
                    type="button"
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => enterTaskSelectionMode(isMeetingMode ? { collapsePanel: false, returnToPreviousView: false } : undefined)}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    <ChevronLeft size={13} />
                    {isMeetingMode ? '插入任務' : '從看板選取'}
                  </button>
                </div>
                <div className="max-h-40 overflow-auto p-2">
                  {selectedLinks.length ? selectedLinks.map(link => (
                    <div key={`${link.nodeId}-${link.role}`} className="mb-2 flex items-center gap-2 rounded-md bg-slate-50 p-2">
                      <FileText size={13} className="shrink-0 text-slate-400" />
                      <span className="min-w-0 flex-1 truncate text-xs text-slate-700" title={nodes[link.nodeId]?.title || link.nodeId}>
                        {nodes[link.nodeId]?.title || link.nodeId}
                      </span>
                      <select
                        value={link.role}
                        onChange={event => setDraftTaskRole(link.nodeId, event.target.value as RecordTaskLinkRole)}
                        className="h-7 rounded-md border border-slate-200 bg-white px-1 text-xs text-slate-700"
                      >
                        {LINK_ROLE_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                  )) : (
                    <div className="rounded-md border border-dashed border-slate-200 px-3 py-5 text-center text-xs text-slate-400">
                      尚未選取任務
                    </div>
                  )}
                </div>
              </div>

              {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div> : null}

              <div className="flex items-center justify-between gap-2">
                {draft.id ? (
                  <button
                    type="button"
                    onClick={() => draft.id && archiveRecord(draft.id)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md border border-red-200 px-3 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={13} />
                    封存
                  </button>
                ) : <span />}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!canSave || saving}
                    onClick={() => handleSave('draft')}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                  >
                    <Save size={13} />
                    存草稿
                  </button>
                  <button
                    type="button"
                    disabled={!canSave || saving}
                    onClick={() => handleSave('published')}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <Send size={13} />
                    發布
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-slate-200 px-3 py-6 text-center">
              <div className="text-sm font-semibold text-slate-700">新增或選取一筆紀錄</div>
              <div className="mt-1 text-xs text-slate-500">會議與個人工作紀錄都可以連到任務 node。</div>
            </div>
          )}
        </section>

        {!isMeetingMode ? (
          <section className="p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-600">最近紀錄</h3>
              {loading ? <span className="text-[11px] text-slate-400">載入中</span> : null}
            </div>
            <div className="space-y-2">
              {records.map(record => (
                <RecordListItem
                  key={record.id}
                  record={record}
                  onOpen={() => openExistingRecord(record)}
                />
              ))}
              {!loading && records.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-200 px-3 py-5 text-center text-xs text-slate-400">
                  尚無紀錄
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </aside>
  );
};

export default RecordSidebar;
