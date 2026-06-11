import React from 'react';
import dayjs from 'dayjs';
import { AlertTriangle, BookOpenText, CheckCircle2, ChevronLeft, ChevronRight, FileText, PanelRightClose, PanelRightOpen, Plus, Save, Send, Sparkles, Trash2, UsersRound } from 'lucide-react';
import useAuthStore from '../../store/useAuthStore';
import useBoardStore from '../../store/useBoardStore';
import useRecordStore from '../../store/useRecordStore';
import { useWbsStore } from '../../store/useWbsStore';
import { useMeetingModeExitGuard } from '../../hooks/useMeetingModeExitGuard';
import { getMeetingRecordActionState, type MeetingRecordWorkflowStage } from '../../utils/meetingRecordWorkflow';
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

const RECORD_SIDEBAR_WIDTH_STORAGE_KEY = 'projed-record-sidebar-width';
const DEFAULT_RECORD_SIDEBAR_WIDTH = 390;
const MIN_RECORD_SIDEBAR_WIDTH = 320;
const MAX_RECORD_SIDEBAR_WIDTH = 760;
const RECORD_SIDEBAR_MAIN_VIEW_MIN_WIDTH = 560;

const clampRecordSidebarWidth = (value: number) => {
  const viewportWidth = typeof window === 'undefined' ? 1365 : window.innerWidth;
  const viewportMaxWidth = Math.max(
    MIN_RECORD_SIDEBAR_WIDTH,
    Math.min(MAX_RECORD_SIDEBAR_WIDTH, viewportWidth - RECORD_SIDEBAR_MAIN_VIEW_MIN_WIDTH)
  );
  return Math.min(Math.max(value, MIN_RECORD_SIDEBAR_WIDTH), viewportMaxWidth);
};

const readRecordSidebarWidth = () => {
  if (typeof window === 'undefined') return DEFAULT_RECORD_SIDEBAR_WIDTH;
  try {
    const stored = Number(window.localStorage.getItem(RECORD_SIDEBAR_WIDTH_STORAGE_KEY));
    return Number.isFinite(stored) ? clampRecordSidebarWidth(stored) : DEFAULT_RECORD_SIDEBAR_WIDTH;
  } catch {
    return DEFAULT_RECORD_SIDEBAR_WIDTH;
  }
};

const persistRecordSidebarWidth = (width: number) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RECORD_SIDEBAR_WIDTH_STORAGE_KEY, String(Math.round(width)));
  } catch {
    // Ignore storage failures; resizing should still work during the current session.
  }
};

const visibilityLabel = (visibility: KnowledgeRecordVisibility) => {
  if (visibility === 'private') return '私人';
  if (visibility === 'tenant') return '工作區';
  return '專案';
};

const MEETING_TERMS = {
  stage: {
    capture: '速記',
    ai_suggestion: 'AI整理',
    review: '校稿',
    published: '發布',
  },
  action: {
    collapse: '收合',
    saveDraft: '存草稿',
    ai: 'AI整理',
    publish: '發布',
    exit: '離開',
  },
  state: {
    meeting: '會議中',
    unsaved: '未儲存',
    synced: '已同步',
  },
} as const;

const WORKFLOW_STEPS: Array<{ stage: MeetingRecordWorkflowStage; label: string }> = [
  { stage: 'capture', label: MEETING_TERMS.stage.capture },
  { stage: 'ai_suggestion', label: MEETING_TERMS.stage.ai_suggestion },
  { stage: 'review', label: MEETING_TERMS.stage.review },
  { stage: 'published', label: MEETING_TERMS.stage.published },
];

const workflowStepIndex = (stage: MeetingRecordWorkflowStage) =>
  WORKFLOW_STEPS.findIndex(step => step.stage === stage);

const MeetingWorkflowStepper: React.FC<{ stage: MeetingRecordWorkflowStage }> = ({ stage }) => {
  const activeIndex = workflowStepIndex(stage);

  return (
    <div className="grid grid-cols-4 gap-1.5" aria-label="會議紀錄流程">
      {WORKFLOW_STEPS.map((step, index) => {
        const isActive = step.stage === stage;
        const isComplete = index < activeIndex || stage === 'published';
        return (
          <div
            key={step.stage}
            className={`flex min-w-0 items-center justify-center rounded border px-0.5 py-0.5 text-[9px] font-semibold leading-4 ${
              isActive
                ? 'border-emerald-500 bg-emerald-600 text-white'
                : isComplete
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-white text-slate-500'
            }`}
          >
            <span className="whitespace-nowrap">{step.label}</span>
          </div>
        );
      })}
    </div>
  );
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
  const [sidebarWidth, setSidebarWidth] = React.useState(readRecordSidebarWidth);
  const [isResizing, setIsResizing] = React.useState(false);
  const sidebarWidthRef = React.useRef(sidebarWidth);
  const resizeCleanupRef = React.useRef<(() => void) | null>(null);
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
  const togglePanelCollapsed = useRecordStore(state => state.togglePanelCollapsed);
  const updateDraft = useRecordStore(state => state.updateDraft);
  const contentCursorOffset = useRecordStore(state => state.contentCursorOffset);
  const setContentCursorOffset = useRecordStore(state => state.setContentCursorOffset);
  const meetingActivities = useRecordStore(state => state.meetingActivities);
  const meetingSynthesisStatus = useRecordStore(state => state.meetingSynthesisStatus);
  const meetingSynthesisError = useRecordStore(state => state.meetingSynthesisError);
  const meetingSynthesisWarnings = useRecordStore(state => state.meetingSynthesisWarnings);
  const meetingSynthesisProvider = useRecordStore(state => state.meetingSynthesisProvider);
  const lastSaveFeedback = useRecordStore(state => state.lastSaveFeedback);
  const draftBaselineSignature = useRecordStore(state => state.draftBaselineSignature);
  const setDraftTaskRole = useRecordStore(state => state.setDraftTaskRole);
  const enterTaskSelectionMode = useRecordStore(state => state.enterTaskSelectionMode);
  const synthesizeMeetingDraft = useRecordStore(state => state.synthesizeMeetingDraft);
  const saveDraft = useRecordStore(state => state.saveDraft);
  const archiveRecord = useRecordStore(state => state.archiveRecord);
  const requestExitMeetingMode = useMeetingModeExitGuard();

  React.useEffect(() => {
    const handleOpenRecord = (event: Event) => {
      const detail = (event as CustomEvent<{ recordId?: string }>).detail;
      const record = records.find(item => item.id === detail?.recordId);
      if (record) openExistingRecord(record);
    };
    document.addEventListener('open-knowledge-record', handleOpenRecord);
    return () => document.removeEventListener('open-knowledge-record', handleOpenRecord);
  }, [openExistingRecord, records]);

  React.useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  React.useEffect(() => {
    const handleViewportResize = () => {
      setSidebarWidth(previousWidth => {
        const nextWidth = clampRecordSidebarWidth(previousWidth);
        sidebarWidthRef.current = nextWidth;
        persistRecordSidebarWidth(nextWidth);
        return nextWidth;
      });
    };

    window.addEventListener('resize', handleViewportResize);
    return () => window.removeEventListener('resize', handleViewportResize);
  }, []);

  React.useEffect(() => () => resizeCleanupRef.current?.(), []);

  if (!isPanelOpen) return null;

  const selectedLinks = draft?.taskLinks || [];
  const isSynthesizing = meetingSynthesisStatus === 'synthesizing';
  const isMeetingDraft = Boolean(isMeetingMode && draft?.type === 'meeting');
  const meetingActionState = getMeetingRecordActionState({
    draft,
    activeWorkspaceId,
    activeBoardId,
    saving,
    meetingSynthesisStatus,
    meetingSynthesisError,
    meetingActivityCount: meetingActivities.length,
    draftBaselineSignature,
    lastSaveFeedback,
  });
  const compactMeetingStatus = meetingActionState.isPublished
    ? '已發布'
    : meetingSynthesisStatus === 'synthesizing'
      ? 'AI整理中'
      : meetingActionState.hasAiDraft
        ? '校稿中'
        : meetingActionState.canPublish
          ? '可發布'
          : '速記中';
  const compactMeetingNext = meetingActionState.isPublished
    ? '可離開'
    : meetingActionState.hasAiDraft
      ? '校稿後發布'
      : meetingActionState.canPublish
        ? '可發布或AI整理'
        : '輸入後可發布';
  const compactMeetingRisk = meetingActivities.length > 0 && !meetingActionState.hasAiDraft && !meetingActionState.isPublished
    ? `任務變更 ${meetingActivities.length} 筆需整理`
    : meetingActionState.isDirty && !meetingActionState.isPublished
      ? '未儲存'
      : '已同步';
  const isPublished = isMeetingDraft
    ? meetingActionState.isPublished
    : Boolean(
      draft?.id &&
      lastSaveFeedback?.recordId === draft.id &&
      lastSaveFeedback.status === 'published'
    );
  const publishedAt = lastSaveFeedback?.savedAt ? dayjs(lastSaveFeedback.savedAt).format('HH:mm') : '';
  const canSave = isMeetingDraft
    ? meetingActionState.canSaveDraft
    : Boolean(activeWorkspaceId && activeBoardId && draft && draft.title.trim() && draft.content.trim());
  const canPublish = Boolean(
    isMeetingDraft
      ? meetingActionState.canPublish
      : activeWorkspaceId &&
        activeBoardId &&
        draft &&
        draft.title.trim() &&
        draft.content.trim() &&
        !isPublished
  );
  const publishLabel = isMeetingDraft
    ? isPublished
      ? '已發布'
      : '發布'
    : isPublished
      ? '已發布'
      : '發布';

  const handleSave = async (status: KnowledgeRecordStatus) => {
    updateDraft({ status });
    await saveDraft({ nodes });
  };

  const handleSynthesizeMeetingDraft = async () => {
    await synthesizeMeetingDraft(nodes);
  };

  const applySidebarWidth = (nextWidth: number, persist = false) => {
    const clampedWidth = clampRecordSidebarWidth(nextWidth);
    sidebarWidthRef.current = clampedWidth;
    setSidebarWidth(clampedWidth);
    if (persist) persistRecordSidebarWidth(clampedWidth);
  };

  const handleResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    resizeCleanupRef.current?.();

    const startX = event.clientX;
    const startWidth = sidebarWidthRef.current;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handlePointerMove = (moveEvent: PointerEvent) => {
      applySidebarWidth(startWidth + startX - moveEvent.clientX);
    };

    const cleanup = () => {
      setIsResizing(false);
      persistRecordSidebarWidth(sidebarWidthRef.current);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', cleanup);
      window.removeEventListener('pointercancel', cleanup);
      resizeCleanupRef.current = null;
    };

    resizeCleanupRef.current = cleanup;
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', cleanup);
    window.addEventListener('pointercancel', cleanup);
  };

  const handleResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    applySidebarWidth(sidebarWidth + (event.key === 'ArrowLeft' ? 24 : -24), true);
  };

  const sidebarResizeStyle = {
    '--record-sidebar-width': `${sidebarWidth}px`,
  } as React.CSSProperties;

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
    <aside
      className="fixed inset-x-0 bottom-0 z-30 flex max-h-[48vh] w-full shrink-0 flex-col border-t border-slate-200 bg-white shadow-2xl sm:relative sm:inset-auto sm:z-auto sm:max-h-none sm:w-[var(--record-sidebar-width)] sm:border-l sm:border-t-0 sm:shadow-sm"
      style={sidebarResizeStyle}
    >
      <div
        role="separator"
        aria-label="調整紀錄欄寬度"
        aria-orientation="vertical"
        aria-valuemin={MIN_RECORD_SIDEBAR_WIDTH}
        aria-valuemax={MAX_RECORD_SIDEBAR_WIDTH}
        aria-valuenow={sidebarWidth}
        tabIndex={0}
        onPointerDown={handleResizeStart}
        onKeyDown={handleResizeKeyDown}
        title="拖拉調整紀錄欄寬度；方向鍵也可微調"
        className={`record-sidebar-resize-handle absolute left-0 top-0 z-20 hidden h-full w-3 -translate-x-1/2 cursor-col-resize items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 sm:flex ${
          isResizing ? 'bg-blue-50/80' : 'hover:bg-blue-50/70'
        }`}
      >
        <span className={`h-12 w-0.5 rounded-full ${isResizing ? 'bg-blue-500' : 'bg-slate-300'}`} />
      </div>
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
            onClick={isMeetingMode ? () => void requestExitMeetingMode() : closePanel}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
            title={isMeetingMode ? '離開會議模式；未儲存時會先詢問是否存草稿' : '關閉紀錄欄'}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <section className="border-b border-slate-100 p-3">
          {draft ? (
            <div className="space-y-3">
              {isMeetingMode ? (
                <div data-meeting-workflow-card="compact" className="rounded-lg border border-emerald-200 bg-emerald-50 p-1.5">
                  <div className="flex min-w-0 flex-wrap items-center gap-1">
                      <span className="shrink-0 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {MEETING_TERMS.state.meeting}
                      </span>
                      <span className="rounded border border-emerald-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                        {draft.taskLinks.length} 任務
                      </span>
                      <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                        meetingActionState.isDirty
                          ? 'border-amber-200 bg-amber-50 text-amber-700'
                          : 'border-emerald-200 bg-white text-emerald-700'
                      }`}>
                        {meetingActionState.isDirty ? MEETING_TERMS.state.unsaved : MEETING_TERMS.state.synced}
                      </span>
                  </div>

                  <div className="mt-1">
                    <MeetingWorkflowStepper stage={meetingActionState.stage} />
                  </div>

                  <div
                    className="mt-1 rounded border border-emerald-200 bg-white px-1.5 py-0.5 text-[10px] leading-4 text-emerald-800"
                    title={`${meetingActionState.statusMessage} ${meetingActionState.nextActionMessage}${meetingActionState.riskMessage ? ` ${meetingActionState.riskMessage}` : ''}`}
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="inline-flex items-center gap-1 font-semibold">
                        {isPublished ? <CheckCircle2 size={12} className="shrink-0" /> : <Sparkles size={12} className="shrink-0" />}
                        {compactMeetingStatus}
                      </span>
                      <span className="text-emerald-700">{compactMeetingNext}</span>
                      <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${
                        meetingActionState.isDirty || meetingActionState.riskMessage
                          ? 'bg-amber-50 text-amber-800'
                          : 'bg-emerald-50 text-emerald-700'
                      }`}>
                        {meetingActionState.isDirty || meetingActionState.riskMessage ? <AlertTriangle size={11} /> : <CheckCircle2 size={11} />}
                        {compactMeetingRisk}
                      </span>
                    </div>
                  </div>

                  <div className="mt-1 grid grid-cols-5 gap-1">
                    <button
                      type="button"
                      onClick={togglePanelCollapsed}
                      title="收合會議速記欄"
                      className="inline-flex h-6 items-center justify-center gap-0.5 rounded border border-emerald-200 bg-white px-0.5 text-[9px] font-semibold text-emerald-700 hover:bg-emerald-100"
                    >
                      <PanelRightClose size={11} />
                      {MEETING_TERMS.action.collapse}
                    </button>
                    <button
                      type="button"
                      disabled={!meetingActionState.canSaveDraft}
                      onClick={() => handleSave('draft')}
                      title={meetingActionState.saveDraftDisabledReason ?? '保存目前編輯器內容為草稿，不會發布。'}
                      className="inline-flex h-6 items-center justify-center gap-0.5 rounded border border-emerald-200 bg-white px-0.5 text-[9px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:text-slate-300"
                    >
                      <Save size={11} />
                      {MEETING_TERMS.action.saveDraft}
                    </button>
                    <button
                      type="button"
                      disabled={!meetingActionState.canRunAi}
                      onClick={() => void handleSynthesizeMeetingDraft()}
                      title={meetingActionState.aiDisabledReason ?? '用 AI 將速記與任務變更整理成校稿內容。'}
                      className="inline-flex h-6 items-center justify-center gap-0.5 rounded border border-blue-200 bg-white px-0.5 text-[9px] font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-slate-300"
                    >
                      <Sparkles size={11} />
                      {MEETING_TERMS.action.ai}
                    </button>
                    <button
                      type="button"
                      disabled={!meetingActionState.canPublish}
                      onClick={() => handleSave('published')}
                      title={isPublished ? `已於 ${publishedAt} 發布成功。` : meetingActionState.publishDisabledReason ?? '直接發布目前編輯器內容，不會自動執行 AI整理。'}
                      className="inline-flex h-6 items-center justify-center gap-0.5 rounded bg-emerald-700 px-0.5 text-[9px] font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {isPublished ? <CheckCircle2 size={11} /> : <Send size={11} />}
                      {MEETING_TERMS.action.publish}
                    </button>
                    <button
                      type="button"
                      onClick={() => void requestExitMeetingMode()}
                      className="inline-flex h-6 items-center justify-center gap-0.5 rounded border border-slate-200 bg-white px-0.5 text-[9px] font-semibold text-slate-600 hover:bg-slate-50"
                      title="離開會議模式；未儲存時會先詢問是否存草稿"
                    >
                      {MEETING_TERMS.action.exit}
                    </button>
                  </div>
                </div>
              ) : (
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
                    <span className="text-xs font-semibold text-emerald-800">AI整理來源：任務變更</span>
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

              {isMeetingMode ? (
                <div className={`rounded-md border px-3 py-2 text-xs leading-5 ${
                  isPublished
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : meetingSynthesisStatus === 'error'
                    ? 'border-red-200 bg-red-50 text-red-700'
                    : meetingSynthesisStatus === 'ready'
                      ? 'border-blue-200 bg-blue-50 text-blue-700'
                      : 'border-amber-200 bg-amber-50 text-amber-800'
                }`}>
                  <div className="flex items-center gap-2 font-semibold">
                    {isPublished ? <CheckCircle2 size={14} /> : <Sparkles size={14} />}
                    {isPublished
                      ? `會議紀錄已發布 ${publishedAt}`
                      : meetingSynthesisStatus === 'synthesizing'
                        ? 'AI整理中'
                        : meetingSynthesisStatus === 'ready'
                          ? 'AI整理完成，請校稿後發布'
                        : meetingSynthesisStatus === 'error'
                          ? 'AI整理失敗，原草稿已保留'
                            : 'AI整理是建議動作，可跳過'}
                  </div>
                  <div className="mt-1">
                    {isPublished
                      ? '已儲存為正式紀錄，可在紀錄庫與任務相關紀錄中查找。'
                      : meetingSynthesisStatus === 'ready'
                        ? `草稿來源：${meetingSynthesisProvider || 'meeting synthesis'}。請確認結論、決議、待辦與阻塞。`
                      : meetingSynthesisStatus === 'error'
                          ? meetingSynthesisError
                          : '直接發布會保存目前編輯器內容；若要整理任務變更，請先按 AI整理或手動寫入內容。'}
                  </div>
                  {meetingSynthesisWarnings.length ? (
                    <ul className="mt-1 list-disc pl-4">
                      {meetingSynthesisWarnings.slice(0, 2).map(warning => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              <div className={`grid gap-2 ${isMeetingMode ? 'grid-cols-1' : 'grid-cols-2'}`}>
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
                {isMeetingMode ? (
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-500">
                    流程狀態：{meetingActionState.isPublished ? '已發布' : meetingActionState.hasAiDraft ? '校稿中' : '草稿'}
                  </div>
                ) : (
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
                )}
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

              {!isMeetingMode ? (
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
                      disabled={!canSave || saving || isSynthesizing}
                      onClick={() => handleSave('draft')}
                      title={!canSave ? '請先輸入標題。' : undefined}
                      className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                    >
                      <Save size={13} />
                      存草稿
                    </button>
                    <button
                      type="button"
                      disabled={!canPublish || saving || isSynthesizing}
                      onClick={() => handleSave('published')}
                      title={isPublished ? `已於 ${publishedAt} 發布成功。` : !canPublish ? '請先輸入標題與內容。' : '發布。'}
                      className="inline-flex h-9 items-center gap-1.5 rounded-md bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {isPublished ? <CheckCircle2 size={13} /> : <Send size={13} />}
                      {publishLabel}
                    </button>
                  </div>
                </div>
              ) : null}
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
