import React from 'react';
import dayjs from 'dayjs';
import { AlertTriangle, BookOpenText, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, FileCheck, FileText, Loader2, PanelRightClose, PanelRightOpen, PenLine, Plus, Save, Send, SendHorizontal, Sparkles, Trash2, UsersRound, X } from 'lucide-react';
import useAuthStore from '../../store/useAuthStore';
import useBoardStore from '../../store/useBoardStore';
import useRecordStore from '../../store/useRecordStore';
import { useWbsStore } from '../../store/useWbsStore';
import { useMeetingModeExitGuard } from '../../hooks/useMeetingModeExitGuard';
import { useRecordDraftGuard } from '../../hooks/useRecordDraftGuard';
import { eventLogService } from '../../services/dataBackend';
import { synthesizeMeetingRecord } from '../../services/meetingSynthesisService';
import { getMeetingRecordActionState, getMeetingWorkflowStepActions, getRecordDraftSignature, type MeetingWorkflowStepAction } from '../../utils/meetingRecordWorkflow';
import { PROJECT_CHANGE_EVENT_TYPES, createProjectChangeSynthesisInput, wrapProjectChangeImportContent, type ProjectChangeScope } from '../../utils/projectChangeImport';
import RecordContentEditor from './RecordContentEditor';
import type { KnowledgeRecord, KnowledgeRecordStatus, KnowledgeRecordType, KnowledgeRecordVisibility, RecordTaskLinkRole } from '../../types';

type ProjectChangeImportStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';
type ProjectChangeImportStepState = 'pending' | 'skipped' | 'inserted';

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
  if (visibility === 'tenant') return '目前工作區';
  return '專案';
};

const getMeetingWorkflowArrowClipPath = (index: number, total: number) => {
  const arrow = '12px';
  const first = index === 0;
  const last = index === total - 1;
  if (first && last) return 'polygon(0 0, 100% 0, 100% 100%, 0 100%)';
  if (first) return `polygon(0 0, calc(100% - ${arrow}) 0, 100% 50%, calc(100% - ${arrow}) 100%, 0 100%)`;
  if (last) return `polygon(0 0, 100% 0, 100% 100%, 0 100%, ${arrow} 50%)`;
  return `polygon(0 0, calc(100% - ${arrow}) 0, 100% 50%, calc(100% - ${arrow}) 100%, 0 100%, ${arrow} 50%)`;
};

type ProjectImportMeetingWorkflowStep = Omit<MeetingWorkflowStepAction, 'stage' | 'command'> & {
  stage: 'project_import';
  command: 'toggleProjectImport';
  importStatus: ProjectChangeImportStatus;
  importStepState: ProjectChangeImportStepState;
  isExpanded: boolean;
  eventCount: number;
};

type MeetingWorkflowArrowStepItem = MeetingWorkflowStepAction | ProjectImportMeetingWorkflowStep;

const getMeetingWorkflowArrowClass = (step: MeetingWorkflowArrowStepItem) => {
  if (
    step.stage === 'project_import' &&
    step.importStepState === 'pending' &&
    step.visualState === 'optional'
  ) {
    return 'border-emerald-700 bg-emerald-700 text-white shadow-sm hover:bg-emerald-800';
  }
  if (step.visualState === 'processing' || step.visualState === 'current') {
    return 'border-emerald-700 bg-emerald-700 text-white shadow-sm';
  }
  if (step.visualState === 'complete') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100';
  }
  if (step.visualState === 'optional') {
    return 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100';
  }
  if (step.visualState === 'available') {
    return 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50';
  }
  return 'border-slate-200 bg-slate-50 text-slate-400';
};

const getProjectImportStepHint = (
  status: ProjectChangeImportStatus,
  stepState: ProjectChangeImportStepState,
  isExpanded: boolean,
  eventCount: number,
) => {
  if (status === 'loading') return '整理中';
  if (stepState === 'inserted') return eventCount > 0 ? `${eventCount} 筆` : '已插入';
  if (stepState === 'skipped') return '已略過';
  if (status === 'ready') return '可插入';
  if (status === 'empty') return '無變化';
  if (status === 'error') return '需處理';
  return isExpanded ? '設定中' : '選用';
};

const getProjectImportStepTitle = (
  status: ProjectChangeImportStatus,
  stepState: ProjectChangeImportStepState,
  isExpanded: boolean,
  eventCount: number,
) => {
  if (status === 'loading') return '正在整理專案變化。';
  if (stepState === 'inserted') return eventCount > 0 ? `已插入 ${eventCount} 筆專案變化，可再次點擊調整或補匯入。` : '已插入專案變化，可再次點擊調整或補匯入。';
  if (stepState === 'skipped') return '已略過專案變化匯入，可再次點擊展開設定。';
  return isExpanded ? '收合專案變化匯入設定。' : '展開專案變化匯入設定。';
};

const getMeetingWorkflowStepIcon = (step: MeetingWorkflowArrowStepItem) => {
  if (step.visualState === 'complete') return <CheckCircle2 size={12} />;
  if (step.visualState === 'processing') return <Loader2 size={12} className="animate-spin" />;
  if (step.stage === 'project_import') return <FileText size={12} />;
  if (step.stage === 'capture') return <PenLine size={12} />;
  if (step.stage === 'ai_suggestion') return <Sparkles size={12} />;
  if (step.stage === 'review') return <FileCheck size={12} />;
  return <SendHorizontal size={12} />;
};

const getMeetingWorkflowStepHint = (step: MeetingWorkflowArrowStepItem) => {
  if (step.stage === 'project_import') return getProjectImportStepHint(step.importStatus, step.importStepState, step.isExpanded, step.eventCount);
  if (step.visualState === 'locked') return step.statusLabel;
  if (step.visualState === 'processing') return step.statusLabel;
  if (step.visualState === 'complete') return step.statusLabel;
  if (step.stage === 'capture') return '草稿不發布';
  if (step.stage === 'ai_suggestion') return '產生建議';
  if (step.stage === 'review') return '校稿草稿';
  return '發布內容';
};

const AI_MEETING_SYNTHESIS_TOOLTIP = 'AI整理會保留目前手寫內容，並將任務變更與手動紀錄統整成同一份草稿。';
const PROJECT_CHANGE_IMPORT_TIMEOUT_MS = 45000;

const withProjectChangeImportTimeout = async <T,>(
  promise: Promise<T>,
  timeoutMessage: string,
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_resolve, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), PROJECT_CHANGE_IMPORT_TIMEOUT_MS);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const getMeetingWorkflowStepTitle = (step: MeetingWorkflowArrowStepItem) => {
  if (step.stage === 'project_import') {
    return getProjectImportStepTitle(step.importStatus, step.importStepState, step.isExpanded, step.eventCount);
  }
  const baseTitle = step.enabled
    ? `${step.outcomeLabel}。${step.statusLabel}`
    : step.disabledReason ?? step.statusLabel;

  return step.stage === 'ai_suggestion'
    ? `${baseTitle}\n${AI_MEETING_SYNTHESIS_TOOLTIP}`
    : baseTitle;
};

const MeetingWorkflowArrowStepper: React.FC<{
  steps: MeetingWorkflowArrowStepItem[];
  onSaveDraft: () => void;
  onRunAi: () => void;
  onPublish: () => void;
  onToggleProjectImport: () => void;
}> = ({ steps, onSaveDraft, onRunAi, onPublish, onToggleProjectImport }) => {
  const handleStepClick = (step: MeetingWorkflowArrowStepItem) => {
    if (step.command === 'toggleProjectImport') onToggleProjectImport();
    if (step.command === 'saveDraft') onSaveDraft();
    if (step.command === 'runAi') onRunAi();
    if (step.command === 'publish') onPublish();
  };

  return (
    <div data-meeting-workflow-arrow-stepper className="flex min-w-0 items-stretch overflow-visible" aria-label="會議紀錄流程">
      {steps.map((step, index) => (
        <button
          key={step.stage}
          type="button"
          data-meeting-workflow-step={step.stage}
          data-meeting-workflow-step-state={step.visualState}
          data-meeting-workflow-step-tone={step.tone}
          data-meeting-workflow-step-optional={step.isOptional ? 'true' : 'false'}
          aria-current={step.isRecommended ? 'step' : undefined}
          aria-label={`${step.label}，${step.outcomeLabel}，${step.ariaDescription}`}
          disabled={!step.enabled}
          onClick={() => handleStepClick(step)}
          title={getMeetingWorkflowStepTitle(step)}
          className={`relative flex h-12 min-w-0 flex-1 flex-col items-center justify-center border text-center transition disabled:cursor-not-allowed ${index > 0 ? '-ml-2' : ''} ${getMeetingWorkflowArrowClass(step)}`}
          style={{
            clipPath: getMeetingWorkflowArrowClipPath(index, steps.length),
            paddingLeft: index === 0 ? '0.35rem' : '0.85rem',
            paddingRight: index === steps.length - 1 ? '0.35rem' : '0.85rem',
            zIndex: steps.length - index,
          }}
        >
          <span className="flex min-w-0 items-center justify-center gap-1 text-[10px] font-semibold leading-3">
            <span className="shrink-0">{getMeetingWorkflowStepIcon(step)}</span>
            <span className="truncate">{step.label}</span>
          </span>
          <span className="mt-0.5 flex min-w-0 max-w-full items-center justify-center text-[8px] font-semibold leading-3 opacity-90">
            <span className="truncate">{getMeetingWorkflowStepHint(step)}</span>
          </span>
        </button>
      ))}
    </div>
  );
};

type WorkLogWorkflowStep = {
  id: 'project_import' | 'write' | 'save' | 'publish';
  label: string;
  hint: string;
  enabled: boolean;
  complete: boolean;
  current: boolean;
  title: string;
  icon: React.ReactNode;
  onClick?: () => void;
  optional?: boolean;
};

const getWorkLogWorkflowStepClass = (step: WorkLogWorkflowStep) => {
  if (step.current) return 'border-blue-700 bg-blue-700 text-white shadow-sm';
  if (step.complete) return 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100';
  if (step.id === 'project_import' && step.optional && step.enabled) return 'border-blue-700 bg-blue-700 text-white shadow-sm hover:bg-blue-800';
  if (step.enabled) return 'border-blue-200 bg-white text-blue-700 hover:bg-blue-50';
  return 'border-slate-200 bg-slate-50 text-slate-400';
};

const WorkLogWorkflowCard: React.FC<{
  projectImportStep: WorkLogWorkflowStep;
  projectImportPanel: React.ReactNode;
  canSave: boolean;
  canPublish: boolean;
  saving: boolean;
  isSynthesizing: boolean;
  isPublished: boolean;
  hasSavedDraftRecord: boolean;
  draftIsDirty: boolean;
  onSaveDraft: () => void;
  onPublish: () => void;
}> = ({
  projectImportStep,
  projectImportPanel,
  canSave,
  canPublish,
  saving,
  isSynthesizing,
  isPublished,
  hasSavedDraftRecord,
  draftIsDirty,
  onSaveDraft,
  onPublish,
}) => {
  const isProcessing = saving || isSynthesizing;
  const draftSynced = hasSavedDraftRecord && !draftIsDirty;
  const steps: WorkLogWorkflowStep[] = [
    projectImportStep,
    {
      id: 'write',
      label: '撰寫',
      hint: isPublished ? '已完成' : draftSynced ? '可續寫' : '編輯中',
      enabled: false,
      complete: isPublished || draftSynced,
      current: !isPublished && !draftSynced,
      title: '填寫個人工作紀錄內容。',
      icon: <PenLine size={12} />,
    },
    {
      id: 'save',
      label: '存草稿',
      hint: draftSynced ? '已存草稿' : '保存草稿',
      enabled: canSave && !isProcessing && !isPublished,
      complete: isPublished || draftSynced,
      current: false,
      title: canSave ? '保存目前編輯器內容為草稿，不會發布。' : '請先輸入標題。',
      icon: draftSynced ? <CheckCircle2 size={12} /> : <Save size={12} />,
      onClick: onSaveDraft,
    },
    {
      id: 'publish',
      label: '發布',
      hint: isPublished ? '已發布' : '正式紀錄',
      enabled: canPublish && !isProcessing && !isPublished,
      complete: isPublished,
      current: false,
      title: isPublished ? '這筆工作紀錄已發布。' : canPublish ? '發布目前編輯器內容為正式工作紀錄。' : '請先輸入標題與內容。',
      icon: isPublished ? <CheckCircle2 size={12} /> : <SendHorizontal size={12} />,
      onClick: onPublish,
    },
  ];

  return (
    <div
      data-record-composer-workflow
      data-record-composer-actions
      data-record-workflow-kind="work-log"
      className="rounded-md border border-slate-200 bg-white p-2"
    >
      <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-slate-700">個人流程</div>
          <div className="truncate text-[10px] text-slate-500">匯入、撰寫、存草稿與發布在同一條流程上操作。</div>
        </div>
        <span className="shrink-0 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
          個人紀錄
        </span>
      </div>
      <div className="flex min-w-0 items-stretch overflow-visible" aria-label="個人工作紀錄流程">
        {steps.map((step, index) => (
          <button
            key={step.id}
            type="button"
            data-work-log-workflow-step={step.id}
            data-work-log-workflow-step-optional={step.optional ? 'true' : 'false'}
            data-work-log-workflow-step-state={step.current ? 'current' : step.complete ? 'complete' : step.enabled ? 'available' : 'locked'}
            disabled={!step.enabled}
            onClick={step.onClick}
            title={step.title}
            className={`relative flex h-12 min-w-0 flex-1 flex-col items-center justify-center border text-center transition disabled:cursor-not-allowed ${index > 0 ? '-ml-2' : ''} ${getWorkLogWorkflowStepClass(step)}`}
            style={{
              clipPath: getMeetingWorkflowArrowClipPath(index, steps.length),
              paddingLeft: index === 0 ? '0.35rem' : '0.85rem',
              paddingRight: index === steps.length - 1 ? '0.35rem' : '0.85rem',
              zIndex: steps.length - index,
            }}
          >
            <span className="flex min-w-0 items-center justify-center gap-1 text-[10px] font-semibold leading-3">
              <span className="shrink-0">{isProcessing && step.id !== 'write' && step.enabled ? <Loader2 size={12} className="animate-spin" /> : step.icon}</span>
              <span className="truncate">{step.label}</span>
            </span>
            <span className="mt-0.5 flex min-w-0 max-w-full items-center justify-center text-[8px] font-semibold leading-3 opacity-90">
              <span className="truncate">{step.hint}</span>
            </span>
          </button>
        ))}
      </div>
      {projectImportPanel ? (
        <div className="mt-2">
          {projectImportPanel}
        </div>
      ) : null}
    </div>
  );
};

const RecordContextSummary: React.FC<{
  draft: { id?: string; type: KnowledgeRecordType; status: KnowledgeRecordStatus; taskLinks: unknown[] };
  typeState?: 'draft-type-locked' | 'meeting-mode-locked';
}> = ({ draft, typeState = 'draft-type-locked' }) => {
  return (
    <div
      data-record-composer-summary
      data-record-context-summary
      data-record-type-state={typeState}
      data-record-summary-kind={draft.type}
      data-record-summary-status={draft.status}
      data-record-summary-task-count={draft.taskLinks.length}
      className="sr-only"
    >
      {recordTypeLabel(draft.type)}，{statusLabel(draft.status)}，已連結 {draft.taskLinks.length} 個任務
    </div>
  );
};

type ProjectChangeImportState = {
  scope: ProjectChangeScope;
  startedAt: string;
  endedAt: string;
  status: ProjectChangeImportStatus;
  stepState: ProjectChangeImportStepState;
  dismissedDraftId: string | null;
  previewContent: string;
  eventCount: number;
  message: string | null;
};

const createInitialProjectChangeImportState = (): ProjectChangeImportState => ({
  scope: 'board',
  startedAt: dayjs().subtract(7, 'day').startOf('day').format('YYYY-MM-DD'),
  endedAt: dayjs().endOf('day').format('YYYY-MM-DD'),
  status: 'idle',
  stepState: 'pending',
  dismissedDraftId: null,
  previewContent: '',
  eventCount: 0,
  message: null,
});

const RecordHelpDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onClose();
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [onClose]);

  return (
  <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/30 p-4">
    <div data-record-help-dialog className="max-h-[88vh] w-full max-w-2xl overflow-auto rounded-lg border border-slate-200 bg-white shadow-2xl">
      <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <CircleHelp size={16} className="text-blue-500" />
          <h3 className="text-sm font-semibold text-slate-800">紀錄功能說明</h3>
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="關閉功能說明">
          <X size={16} />
        </button>
      </div>
      <div className="space-y-4 p-4 text-xs leading-5 text-slate-600">
        <section>
          <h4 className="mb-2 text-sm font-semibold text-slate-800">使用流程</h4>
          <div className="grid gap-2 text-center text-[11px] font-semibold text-slate-700 sm:grid-cols-5">
            {['選擇紀錄類型', '匯入', '撰寫內容', '存草稿或 AI整理', '發布或離開'].map((label, index) => (
              <div key={label} className="rounded-md border border-blue-100 bg-blue-50 px-2 py-2">
                <div className="mb-1 text-blue-600">{index + 1}</div>
                {label}
              </div>
            ))}
          </div>
        </section>
        <section>
          <h4 className="mb-1 text-sm font-semibold text-slate-800">三種紀錄情境</h4>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-md border border-emerald-100 bg-emerald-50 p-2">
              <div className="font-semibold text-emerald-800">會議速記</div>
              <div>會議正在進行時使用，會進入會議模式與四階段流程。</div>
            </div>
            <div className="rounded-md border border-blue-100 bg-blue-50 p-2">
              <div className="font-semibold text-blue-800">會後會議紀錄</div>
              <div>會後補寫或整理，不進入會議模式，但可匯入專案變化。</div>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
              <div className="font-semibold text-slate-800">個人工作紀錄</div>
              <div>記錄自己的工作過程，可先匯入專案變化，也可直接撰寫、存草稿或發布。</div>
            </div>
          </div>
        </section>
        <section>
          <h4 className="mb-1 text-sm font-semibold text-slate-800">專案變化匯入</h4>
          <p>`匯入` 是紀錄流程的選用第一步。預設收合，點擊後可整理指定時間範圍內的任務變化；系統會先產生預覽，按「插入紀錄並開始撰寫」後才會寫入內容。</p>
        </section>
        <section className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800">
          <h4 className="mb-1 text-sm font-semibold">保存與離開風險</h4>
          <p>`存草稿` 不會發布；`發布` 會保存目前 editor 內容為正式紀錄；`離開` 不等於發布。有未儲存變更時，系統會詢問要存草稿、直接離開或取消。</p>
        </section>
      </div>
    </div>
  </div>
  );
};

const ProjectChangeImportPanel: React.FC<{
  state: ProjectChangeImportState;
  disabled: boolean;
  onChange: (updates: Partial<ProjectChangeImportState>) => void;
  onPreview: () => void;
  onInsert: () => void;
  onSkip: () => void;
}> = ({ state, disabled, onChange, onPreview, onInsert, onSkip }) => (
  <section data-project-change-import-panel className="rounded-md border border-blue-200 bg-blue-50 p-2">
    <div className="mb-2 flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="text-xs font-semibold text-blue-800">專案變化匯入</div>
        <div className="mt-0.5 text-[11px] leading-4 text-blue-700">
          預設整理一週前到今日的任務變更，先預覽，確認後才插入紀錄。
        </div>
      </div>
      <button type="button" onClick={onSkip} className="shrink-0 rounded border border-blue-200 bg-white px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100">
        跳過
      </button>
    </div>
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="text-[11px] font-semibold text-blue-800">
        起始日期
        <input
          type="date"
          value={state.startedAt}
          onChange={event => onChange({ startedAt: event.target.value })}
          className="mt-1 h-8 w-full rounded border border-blue-200 bg-white px-2 text-xs text-slate-800 outline-none focus:border-blue-400"
        />
      </label>
      <label className="text-[11px] font-semibold text-blue-800">
        結束日期
        <input
          type="date"
          value={state.endedAt}
          onChange={event => onChange({ endedAt: event.target.value })}
          className="mt-1 h-8 w-full rounded border border-blue-200 bg-white px-2 text-xs text-slate-800 outline-none focus:border-blue-400"
        />
      </label>
    </div>
    <div className="mt-2 grid grid-cols-2 gap-2">
      {([
        ['board', '整個看板'],
        ['workspace', '整個工作區'],
      ] as Array<[ProjectChangeScope, string]>).map(([scope, label]) => (
        <button
          key={scope}
          type="button"
          onClick={() => onChange({ scope })}
          className={`h-8 rounded border text-xs font-semibold ${
            state.scope === scope
              ? 'border-blue-400 bg-white text-blue-700 ring-2 ring-blue-100'
              : 'border-blue-100 bg-white/70 text-slate-600 hover:bg-white'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
    <div className="mt-2 flex items-center gap-2">
      <button
        type="button"
        disabled={disabled || state.status === 'loading'}
        onClick={onPreview}
        className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-200"
      >
        {state.status === 'loading' ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
        整理專案變化
      </button>
      {state.status === 'ready' ? (
        <button
          type="button"
          onClick={onInsert}
          className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-700"
        >
          <Plus size={13} />
          插入紀錄並開始撰寫
        </button>
      ) : null}
    </div>
    {state.message ? (
      <div className={`mt-2 rounded border px-2 py-1.5 text-[11px] leading-4 ${
        state.status === 'error'
          ? 'border-red-200 bg-red-50 text-red-700'
          : state.status === 'empty'
            ? 'border-slate-200 bg-white text-slate-500'
            : 'border-blue-100 bg-white text-blue-700'
      }`}>
        {state.message}
      </div>
    ) : null}
    {state.previewContent ? (
      <div className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap rounded border border-blue-100 bg-white p-2 text-[11px] leading-5 text-slate-700">
        {state.previewContent}
      </div>
    ) : null}
  </section>
);

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
  const guardRecordDraft = useRecordDraftGuard();
  const requestExitMeetingMode = useMeetingModeExitGuard();
  const [sidebarWidth, setSidebarWidth] = React.useState(readRecordSidebarWidth);
  const [isResizing, setIsResizing] = React.useState(false);
  const [isHelpOpen, setIsHelpOpen] = React.useState(false);
  const [isMeetingActivitySourceOpen, setIsMeetingActivitySourceOpen] = React.useState(false);
  const [isLinkedTasksOpen, setIsLinkedTasksOpen] = React.useState(false);
  const [isProjectImportExpanded, setIsProjectImportExpanded] = React.useState(false);
  const [projectChangeImport, setProjectChangeImport] = React.useState(createInitialProjectChangeImportState);
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

  React.useEffect(() => {
    const handleOpenRecord = (event: Event) => {
      const detail = (event as CustomEvent<{ recordId?: string }>).detail;
      const record = records.find(item => item.id === detail?.recordId);
      if (record) {
        void guardRecordDraft(() => openExistingRecord(record), {
          title: '開啟另一筆紀錄？',
          message: '開啟另一筆紀錄會替換目前編輯中的草稿；若目前紀錄尚未儲存，請先決定是否存草稿。',
        });
      }
    };
    document.addEventListener('open-knowledge-record', handleOpenRecord);
    return () => document.removeEventListener('open-knowledge-record', handleOpenRecord);
  }, [guardRecordDraft, openExistingRecord, records]);

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

  React.useEffect(() => {
    setProjectChangeImport(createInitialProjectChangeImportState());
    setIsProjectImportExpanded(false);
    setIsMeetingActivitySourceOpen(false);
    setIsLinkedTasksOpen(false);
  }, [draft?.id]);

  if (!isPanelOpen) return null;

  const selectedLinks = draft?.taskLinks || [];
  const isSynthesizing = meetingSynthesisStatus === 'synthesizing';
  const isMeetingDraft = Boolean(isMeetingMode && draft?.type === 'meeting');
  const draftIsDirty = Boolean(draft && getRecordDraftSignature(draft) !== draftBaselineSignature);
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
  const meetingWorkflowSteps = getMeetingWorkflowStepActions(meetingActionState);
  const compactMeetingRisk = meetingActivities.length > 0 && !meetingActionState.hasAiDraft && !meetingActionState.isPublished
    ? `任務變更 ${meetingActivities.length} 筆需整理`
    : meetingActionState.isDirty && !meetingActionState.isPublished
      ? '未儲存'
      : '已同步';
  const isPublished = isMeetingDraft
    ? meetingActionState.isPublished
    : Boolean(
      draft?.status === 'published' ||
      draft?.id &&
      lastSaveFeedback?.recordId === draft.id &&
      lastSaveFeedback.status === 'published'
    );
  const hasSavedDraftRecord = Boolean(
    draft?.id &&
    (records.some(record => record.id === draft.id) || lastSaveFeedback?.recordId === draft.id)
  );
  const publishedAt = lastSaveFeedback?.savedAt ? dayjs(lastSaveFeedback.savedAt).format('HH:mm') : '';
  const canSave = isMeetingDraft
    ? meetingActionState.canSaveDraft
    : Boolean(activeWorkspaceId && activeBoardId && draft && draft.title.trim());
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
      : '發布會議紀錄'
    : isPublished
      ? '已發布'
      : draft?.type === 'work_log'
        ? '發布工作紀錄'
        : '發布會議紀錄';
  const canUseProjectChangeImport = Boolean(draft && !isPublished);
  const shouldShowProjectChangeImport = Boolean(canUseProjectChangeImport && isProjectImportExpanded);
  const exitRecordButtonLabel = '離開紀錄';
  const exitRecordButtonTitle = isMeetingMode
    ? '離開紀錄；離開不等於發布，若有未儲存變更會先詢問是否存草稿。'
    : '離開紀錄；若有未儲存變更會先詢問是否存草稿。';
  const sidebarRecordTitle = draft ? recordTypeLabel(draft.type) : '紀錄';
  const projectImportVisualState = projectChangeImport.status === 'loading'
    ? 'processing'
    : projectChangeImport.stepState === 'inserted' || projectChangeImport.stepState === 'skipped'
      ? 'complete'
      : isProjectImportExpanded
        ? 'current'
        : 'optional';
  const projectImportStepEnabled = canUseProjectChangeImport && !saving && !isSynthesizing;
  const projectImportStatusLabel = getProjectImportStepHint(
    projectChangeImport.status,
    projectChangeImport.stepState,
    isProjectImportExpanded,
    projectChangeImport.eventCount,
  );
  const projectImportMeetingStep: ProjectImportMeetingWorkflowStep = {
    stage: 'project_import',
    label: '匯入',
    actionLabel: '設定匯入',
    outcomeLabel: projectChangeImport.stepState === 'inserted' ? '已插入專案變化' : '選用：匯入專案變化',
    statusLabel: projectImportStatusLabel,
    command: 'toggleProjectImport',
    visualState: projectImportVisualState,
    tone: 'optional',
    isOptional: true,
    ariaDescription: '匯入專案變化是選用步驟。按下後可展開日期、範圍、預覽、插入與跳過。',
    disabledReason: projectImportStepEnabled ? null : '已發布或系統處理中，不能調整專案變化匯入。',
    enabled: projectImportStepEnabled,
    isComplete: projectChangeImport.stepState === 'inserted',
    isRecommended: isProjectImportExpanded,
    importStatus: projectChangeImport.status,
    importStepState: projectChangeImport.stepState,
    isExpanded: isProjectImportExpanded,
    eventCount: projectChangeImport.eventCount,
  };
  const meetingWorkflowStepsWithImport: MeetingWorkflowArrowStepItem[] = [
    projectImportMeetingStep,
    ...meetingWorkflowSteps,
  ];
  const projectImportWorkLogStep: WorkLogWorkflowStep = {
    id: 'project_import',
    label: '匯入',
    hint: projectImportStatusLabel,
    enabled: projectImportStepEnabled,
    complete: projectChangeImport.stepState === 'inserted' || projectChangeImport.stepState === 'skipped',
    current: isProjectImportExpanded || projectChangeImport.status === 'loading',
    title: getProjectImportStepTitle(
      projectChangeImport.status,
      projectChangeImport.stepState,
      isProjectImportExpanded,
      projectChangeImport.eventCount,
    ),
    icon: projectChangeImport.status === 'loading'
      ? <Loader2 size={12} className="animate-spin" />
      : projectChangeImport.stepState === 'inserted'
        ? <CheckCircle2 size={12} />
        : <FileText size={12} />,
    onClick: () => setIsProjectImportExpanded(value => !value),
    optional: true,
  };

  const handleSave = async (status: KnowledgeRecordStatus) => {
    updateDraft({ status });
    await saveDraft({ nodes });
  };

  const handleSynthesizeMeetingDraft = async () => {
    await synthesizeMeetingDraft(nodes);
  };

  const handleGuardedNewMeetingRecord = () => {
    void guardRecordDraft(() => openNewRecord('meeting'), {
      title: '新增會後會議紀錄？',
      message: '新增會後會議紀錄會開啟新的草稿；若目前紀錄尚未儲存，請先決定是否存草稿。',
    });
  };

  const handleGuardedClosePanel = () => {
    void guardRecordDraft(() => closePanel(), {
      title: '離開紀錄？',
      message: '離開紀錄會關閉目前編輯中的紀錄；若尚未儲存，請先決定是否存草稿。',
    });
  };

  const handleGuardedOpenExistingRecord = (record: KnowledgeRecord) => {
    void guardRecordDraft(() => openExistingRecord(record), {
      title: '開啟另一筆紀錄？',
      message: '開啟另一筆紀錄會替換目前編輯中的草稿；若目前紀錄尚未儲存，請先決定是否存草稿。',
    });
  };

  const handleProjectChangePreview = async () => {
    if (!activeWorkspaceId || !draft) {
      setProjectChangeImport(state => ({
        ...state,
        status: 'error',
        message: '請先選擇工作區並建立紀錄。',
      }));
      return;
    }
    const startedAt = dayjs(projectChangeImport.startedAt).startOf('day').valueOf();
    const endedAt = dayjs(projectChangeImport.endedAt).endOf('day').valueOf();
    if (!dayjs(projectChangeImport.startedAt).isValid() || !dayjs(projectChangeImport.endedAt).isValid() || startedAt > endedAt) {
      setProjectChangeImport(state => ({
        ...state,
        status: 'error',
        message: '請確認時間範圍，起始日期不可晚於結束日期。',
      }));
      return;
    }

    setProjectChangeImport(state => ({
      ...state,
      status: 'loading',
      stepState: 'pending',
      previewContent: '',
      eventCount: 0,
      message: '正在整理指定範圍內的專案變化。',
    }));

    try {
      const events = await withProjectChangeImportTimeout(
        eventLogService.listActivity({
          workspaceId: activeWorkspaceId,
          boardId: activeBoardId,
          scope: projectChangeImport.scope,
          startedAt,
          endedAt,
          eventTypes: PROJECT_CHANGE_EVENT_TYPES,
        }),
        '讀取專案變化逾時，請確認正式環境連線後重試；也可以縮短日期範圍再整理。',
      );

      if (events.length === 0) {
        setProjectChangeImport(state => ({
          ...state,
          status: 'empty',
          previewContent: '',
          eventCount: 0,
          message: '這個時間範圍內沒有可匯入的任務變化。',
        }));
        return;
      }

      const result = await withProjectChangeImportTimeout(
        synthesizeMeetingRecord(createProjectChangeSynthesisInput(
          draft.title || '專案變化紀錄',
          events,
          nodes,
        )),
        '整理專案變化逾時，請稍後重試；也可以縮短日期範圍或先手動撰寫紀錄。',
      );
      setProjectChangeImport(state => ({
        ...state,
        status: 'ready',
        previewContent: result.content,
        eventCount: events.length,
        message: `已整理 ${events.length} 筆任務變化。確認後可插入紀錄內容。`,
      }));
    } catch (error) {
      setProjectChangeImport(state => ({
        ...state,
        status: 'error',
        previewContent: '',
        eventCount: 0,
        message: error instanceof Error ? error.message : String(error),
      }));
    }
  };

  const handleInsertProjectChanges = () => {
    if (!draft || !projectChangeImport.previewContent.trim()) return;
    const projectChangeBlock = wrapProjectChangeImportContent(projectChangeImport.previewContent);
    const nextContent = [draft.content.trim(), projectChangeBlock]
      .filter(Boolean)
      .join('\n\n');
    updateDraft({ content: nextContent });
    setContentCursorOffset(nextContent.length);
    setProjectChangeImport(state => ({
      ...state,
      dismissedDraftId: draft.id ?? null,
      status: 'ready',
      stepState: 'inserted',
      message: `已插入 ${state.eventCount} 筆專案變化整理，請繼續撰寫或校稿。`,
    }));
    setIsProjectImportExpanded(false);
  };

  const handleSkipProjectChanges = () => {
    setProjectChangeImport(state => ({
      ...state,
      dismissedDraftId: draft?.id ?? null,
      status: 'idle',
      stepState: 'skipped',
      previewContent: '',
      eventCount: 0,
      message: null,
    }));
    setIsProjectImportExpanded(false);
  };

  const projectChangeImportPanel = shouldShowProjectChangeImport ? (
    <ProjectChangeImportPanel
      state={projectChangeImport}
      disabled={!activeWorkspaceId || (projectChangeImport.scope === 'board' && !activeBoardId) || saving || isSynthesizing}
      onChange={updates => setProjectChangeImport(state => ({
        ...state,
        ...updates,
        status: 'idle',
        stepState: 'pending',
        previewContent: '',
        eventCount: 0,
        message: null,
      }))}
      onPreview={() => void handleProjectChangePreview()}
      onInsert={handleInsertProjectChanges}
      onSkip={handleSkipProjectChanges}
    />
  ) : null;

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
          {sidebarRecordTitle}
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
    <>
    <aside
      data-record-composer-shell
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
      <div data-record-sidebar-header data-record-composer-header className="flex h-11 items-center justify-between border-b border-slate-200 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <BookOpenText size={16} className="text-blue-500" />
          <span className="truncate text-sm font-semibold text-slate-800">{sidebarRecordTitle}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsHelpOpen(true)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
            title="功能說明"
            aria-label="紀錄功能說明"
          >
            <CircleHelp size={16} />
          </button>
          <button
            type="button"
            onClick={togglePanelCollapsed}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
            title={isMeetingMode ? '收合會議速記面板' : '收合紀錄面板'}
          >
            <PanelRightClose size={16} />
          </button>
          <button
            type="button"
            data-record-composer-close
            onClick={isMeetingMode ? () => void requestExitMeetingMode() : handleGuardedClosePanel}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
            title={exitRecordButtonTitle}
            aria-label={exitRecordButtonLabel}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <section className="border-b border-slate-100 p-3">
          {draft ? (
            <div className="space-y-3">
              <RecordContextSummary
                draft={draft}
                typeState={isMeetingMode ? 'meeting-mode-locked' : 'draft-type-locked'}
              />

              {isMeetingMode ? (
                <div
                  data-record-composer-workflow
                  data-record-composer-actions
                  data-record-workflow-kind="meeting"
                  data-meeting-workflow-card="compact"
                  data-project-change-import-expanded={isProjectImportExpanded ? 'true' : 'false'}
                  className="rounded-md border border-slate-200 bg-white p-2"
                >
                  <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-slate-700">會議流程</div>
                      <div className="truncate text-[10px] text-slate-500">速記、AI整理、校稿與發布在同一條流程上操作。</div>
                    </div>
                    <span className="shrink-0 rounded border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                      AI選用
                    </span>
                  </div>
                  <MeetingWorkflowArrowStepper
                    steps={meetingWorkflowStepsWithImport}
                    onSaveDraft={() => handleSave('draft')}
                    onRunAi={() => void handleSynthesizeMeetingDraft()}
                    onPublish={() => handleSave('published')}
                    onToggleProjectImport={() => setIsProjectImportExpanded(value => !value)}
                  />
                  {projectChangeImportPanel ? (
                    <div className="mt-2">
                      {projectChangeImportPanel}
                    </div>
                  ) : null}

                  {(meetingActionState.riskMessage || meetingActionState.isDirty) ? (
                    <div
                      className="mt-1.5 flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] leading-4 text-amber-800"
                      title={meetingActionState.riskMessage ?? meetingActionState.exitWarning ?? ''}
                    >
                      <AlertTriangle size={11} className="shrink-0" />
                      <span className="truncate">{compactMeetingRisk}</span>
                    </div>
                  ) : null}
                </div>
              ) : (
                <WorkLogWorkflowCard
                  projectImportStep={projectImportWorkLogStep}
                  projectImportPanel={projectChangeImportPanel}
                  canSave={canSave}
                  canPublish={canPublish}
                  saving={saving}
                  isSynthesizing={isSynthesizing}
                  isPublished={isPublished}
                  hasSavedDraftRecord={hasSavedDraftRecord}
                  draftIsDirty={draftIsDirty}
                  onSaveDraft={() => handleSave('draft')}
                  onPublish={() => handleSave('published')}
                />
              )}

              <div data-record-composer-meta className="space-y-3">
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
              </div>

              {isMeetingMode && meetingSynthesisStatus !== 'idle' ? (
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

              <div data-record-compact-controls className="rounded-md border border-slate-200 bg-white">
                <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-3">
                  <div data-record-status-summary className="min-w-0 bg-white px-2.5 py-2">
                    <div className="text-[10px] font-semibold leading-4 text-slate-400">目前狀態</div>
                    <div className="truncate text-xs font-semibold text-slate-700">
                      {isMeetingMode
                        ? meetingActionState.isPublished ? '已發布' : meetingActionState.hasAiDraft ? '校稿中' : '草稿'
                        : isPublished ? '已發布' : hasSavedDraftRecord && !draftIsDirty ? '已存草稿' : '撰寫中'}
                    </div>
                  </div>
                  <label data-record-visibility-control className="min-w-0 bg-white px-2.5 py-2">
                    <span className="block text-[10px] font-semibold leading-4 text-slate-400">紀錄分享範圍</span>
                    <select
                      value={draft.visibility}
                      onChange={event => updateDraft({ visibility: event.target.value as KnowledgeRecordVisibility })}
                      className="mt-0.5 h-7 w-full rounded-md border border-slate-200 bg-white px-1.5 text-xs text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      aria-label="紀錄分享範圍"
                    >
                      <option value="private">私人</option>
                      <option value="project">專案</option>
                      <option value="tenant">目前工作區</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    data-record-composer-linked-tasks
                    data-record-linked-tasks-toggle
                    aria-expanded={isLinkedTasksOpen}
                    onClick={() => setIsLinkedTasksOpen(value => !value)}
                    className="col-span-2 flex min-w-0 items-center justify-between gap-2 bg-white px-2.5 py-2 text-left hover:bg-slate-50 sm:col-span-1"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      {isLinkedTasksOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      <span className="truncate text-xs font-semibold text-slate-700">關聯任務</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                        {selectedLinks.length}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {selectedLinks.length ? '已關聯' : '未選取'}
                      </span>
                    </span>
                  </button>
                </div>
                {isLinkedTasksOpen ? (
                  <div data-record-linked-tasks-list className="border-t border-slate-100">
                    <div className="flex justify-end px-2 py-2">
                      <button
                        type="button"
                        title={isMeetingMode ? '選取任務並插入會議內容或建立關聯' : '從看板選取任務並建立紀錄關聯'}
                        onMouseDown={event => event.preventDefault()}
                        onClick={() => enterTaskSelectionMode(isMeetingMode ? { collapsePanel: false, returnToPreviousView: false } : undefined)}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        <Plus size={13} />
                        選取任務
                      </button>
                    </div>
                    <div className="max-h-40 overflow-auto px-2 pb-2">
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
                        <div className="rounded-md border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">
                          尚未選取任務
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
                {isMeetingMode ? (
                  <div className="border-t border-slate-100">
                    <button
                      type="button"
                      data-meeting-activity-source-toggle
                      aria-expanded={isMeetingActivitySourceOpen}
                      onClick={() => setIsMeetingActivitySourceOpen(value => !value)}
                      className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left hover:bg-slate-50"
                    >
                      <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-slate-700">
                        {isMeetingActivitySourceOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        <span className="truncate">AI整理來源：任務變更</span>
                      </span>
                      <span className="rounded-md border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-[11px] font-semibold text-blue-700">
                        {meetingActivities.length}
                      </span>
                    </button>
                    {isMeetingActivitySourceOpen ? (
                      <div data-meeting-activity-source-list className="max-h-32 overflow-auto border-t border-slate-100 p-2">
                        {meetingActivities.length ? (
                          meetingActivities.slice(-6).reverse().map(activity => (
                            <div key={`${activity.occurredAt}-${activity.nodeId}-${activity.summary}`} className="mb-1.5 rounded-md bg-slate-50 px-2 py-1.5 text-xs leading-5 text-slate-700">
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate font-semibold" title={activity.title}>{activity.title}</span>
                                <span className="shrink-0 text-[10px] text-slate-400">{dayjs(activity.occurredAt).format('HH:mm')}</span>
                              </div>
                              <div className="truncate text-slate-500" title={activity.summary}>{activity.summary}</div>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-center text-xs text-slate-400">
                            尚未偵測到任務變更
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : null}
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
              <div className="text-sm font-semibold text-slate-700">先選擇紀錄類型</div>
              <div className="mt-1 text-xs text-slate-500">這裡用來補一筆會後紀錄；個人工作紀錄請用上方全域入口建立。</div>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={handleGuardedNewMeetingRecord}
                  className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Plus size={13} />
                  補一筆會後紀錄
                </button>
              </div>
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
                  onOpen={() => handleGuardedOpenExistingRecord(record)}
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
    {isHelpOpen ? <RecordHelpDialog onClose={() => setIsHelpOpen(false)} /> : null}
    </>
  );
};

export default RecordSidebar;
