import type {
  KnowledgeRecordStatus,
  KnowledgeRecordType,
  KnowledgeRecordVisibility,
  RecordTaskLinkRole,
} from '../types';
import { hasMeaningfulMeetingRecordContent } from './meetingRecordScaffold';

export type MeetingSynthesisWorkflowStatus = 'idle' | 'synthesizing' | 'ready' | 'error';

export type MeetingRecordWorkflowStage = 'capture' | 'ai_suggestion' | 'review' | 'published';

export type MeetingWorkflowStepCommand = 'saveDraft' | 'runAi' | 'publish';

export type MeetingWorkflowStepVisualState =
  | 'current'
  | 'available'
  | 'optional'
  | 'complete'
  | 'locked'
  | 'processing';

export type MeetingWorkflowStepTone = 'primary' | 'neutral' | 'optional';

export type MeetingWorkflowStepAction = {
  stage: MeetingRecordWorkflowStage;
  label: string;
  actionLabel: string;
  outcomeLabel: string;
  statusLabel: string;
  command: MeetingWorkflowStepCommand;
  visualState: MeetingWorkflowStepVisualState;
  tone: MeetingWorkflowStepTone;
  isOptional: boolean;
  ariaDescription: string;
  disabledReason: string | null;
  enabled: boolean;
  isComplete: boolean;
  isRecommended: boolean;
};

export type MeetingRecordDraftLike = {
  id?: string;
  type: KnowledgeRecordType;
  title: string;
  content: string;
  status: KnowledgeRecordStatus;
  visibility: KnowledgeRecordVisibility;
  participantsText?: string;
  occurredAt?: number;
  startedAt?: number;
  endedAt?: number;
  recordedBy?: string | null;
  taskLinks: Array<{ nodeId: string; role: RecordTaskLinkRole }>;
};

export type MeetingRecordSaveFeedbackLike = {
  recordId: string;
  status: KnowledgeRecordStatus;
  savedAt: number;
} | null;

export type MeetingRecordActionStateInput = {
  draft: MeetingRecordDraftLike | null;
  activeWorkspaceId?: string | null;
  activeBoardId?: string | null;
  saving: boolean;
  meetingSynthesisStatus: MeetingSynthesisWorkflowStatus;
  meetingSynthesisError?: string | null;
  meetingActivityCount: number;
  draftBaselineSignature: string | null;
  lastSaveFeedback: MeetingRecordSaveFeedbackLike;
};

export type MeetingRecordActionState = {
  stage: MeetingRecordWorkflowStage;
  statusMessage: string;
  nextActionMessage: string;
  riskMessage: string | null;
  exitWarning: string | null;
  canSaveDraft: boolean;
  canRunAi: boolean;
  canPublish: boolean;
  isDirty: boolean;
  isPublished: boolean;
  isSaving: boolean;
  isSynthesizing: boolean;
  hasContent: boolean;
  hasAiDraft: boolean;
  saveDraftDisabledReason: string | null;
  aiDisabledReason: string | null;
  publishDisabledReason: string | null;
};

const normalizeTaskLinks = (draft: MeetingRecordDraftLike) =>
  [...draft.taskLinks]
    .map(link => ({ nodeId: link.nodeId, role: link.role }))
    .sort((a, b) => `${a.nodeId}:${a.role}`.localeCompare(`${b.nodeId}:${b.role}`));

export const getRecordDraftSignature = (draft: MeetingRecordDraftLike | null) => {
  if (!draft) return null;

  return JSON.stringify({
    id: draft.id ?? null,
    type: draft.type,
    title: draft.title,
    content: draft.content,
    status: draft.status,
    visibility: draft.visibility,
    participantsText: draft.participantsText ?? '',
    occurredAt: draft.occurredAt ?? null,
    startedAt: draft.startedAt ?? null,
    endedAt: draft.endedAt ?? null,
    recordedBy: draft.recordedBy ?? null,
    taskLinks: normalizeTaskLinks(draft),
  });
};

export const getMeetingRecordActionState = ({
  draft,
  activeWorkspaceId,
  activeBoardId,
  saving,
  meetingSynthesisStatus,
  meetingSynthesisError,
  meetingActivityCount,
  draftBaselineSignature,
  lastSaveFeedback,
}: MeetingRecordActionStateInput): MeetingRecordActionState => {
  const hasWorkspace = Boolean(activeWorkspaceId && activeBoardId);
  const hasDraft = Boolean(draft && draft.type === 'meeting');
  const hasTitle = Boolean(draft?.title.trim());
  const hasContent = draft?.type === 'meeting'
    ? hasMeaningfulMeetingRecordContent(draft.content)
    : Boolean(draft?.content.trim());
  const hasSourceForAi = Boolean(hasContent || meetingActivityCount > 0);
  const isSynthesizing = meetingSynthesisStatus === 'synthesizing';
  const hasAiDraft = meetingSynthesisStatus === 'ready';
  const isPublished = Boolean(
    draft?.id &&
    lastSaveFeedback?.recordId === draft.id &&
    lastSaveFeedback.status === 'published'
  );
  const currentSignature = getRecordDraftSignature(draft);
  const hasUnresolvedActivities = meetingActivityCount > 0 && !hasAiDraft && !isPublished;
  const isDirty = Boolean(
    (currentSignature && currentSignature !== draftBaselineSignature) ||
    hasUnresolvedActivities
  );

  const saveDraftDisabledReason = !hasWorkspace
    ? '請先選擇工作區與看板。'
    : !hasDraft
      ? '目前沒有會議草稿。'
      : !hasTitle
        ? '請先輸入會議標題。'
        : saving || isSynthesizing
          ? '系統正在處理中，完成後才能存草稿。'
          : null;

  const aiDisabledReason = !hasWorkspace
    ? '請先選擇工作區與看板。'
    : !hasDraft
      ? '目前沒有會議草稿。'
      : !hasTitle
        ? '請先輸入會議標題。'
        : !hasSourceForAi
          ? '請先輸入速記內容或產生任務變更。'
          : saving || isSynthesizing
            ? 'AI 正在整理或系統正在儲存。'
            : null;

  const publishDisabledReason = !hasWorkspace
    ? '請先選擇工作區與看板。'
    : !hasDraft
      ? '目前沒有會議草稿。'
      : !hasTitle
        ? '請先輸入會議標題。'
        : !hasContent
          ? '請先輸入會議內容，發布會保存目前編輯器內容。'
          : isPublished
            ? '這筆會議紀錄已發布。'
            : saving || isSynthesizing
              ? '系統正在處理中，完成後才能發布。'
              : null;

  const stage: MeetingRecordWorkflowStage = isPublished
    ? 'published'
    : isSynthesizing
      ? 'ai_suggestion'
      : hasAiDraft
        ? 'review'
        : 'capture';

  const statusMessage = isPublished
    ? '會議紀錄已發布，可在紀錄庫與任務知識查找。'
    : saving
      ? '正在儲存會議紀錄。'
      : isSynthesizing
        ? 'AI 正在整理會議草稿，原始內容會保留到整理完成。'
        : hasAiDraft
          ? 'AI整理完成，請確認後存草稿或發布。'
          : meetingSynthesisStatus === 'error'
            ? `AI整理失敗，原草稿已保留：${meetingSynthesisError || '請重試。'}`
            : !hasContent
              ? '目前是速記階段，先輸入會議內容或從任務詳情加入補記。'
              : '目前仍在速記階段，可繼續撰寫、存草稿，或用 AI整理成校稿；發布只在定稿時使用。';

  const nextActionMessage = isPublished
    ? '下一步：可離開會議模式，或到紀錄庫查閱。'
    : hasAiDraft
      ? '下一步：人工校稿後按「發布」。'
      : !hasContent
        ? '下一步：輸入會議內容；可先存草稿。'
        : '下一步：繼續撰寫、存草稿，或按「AI整理」產生校稿；「發布」只在你決定定稿時使用。';

  const activityRisk = hasUnresolvedActivities
    ? `已偵測 ${meetingActivityCount} 筆任務變更。直接發布只保存目前編輯器內容；若要整理任務變更，請先按 AI整理或手動寫入內容。`
    : null;
  const dirtyRisk = isDirty && !isPublished ? '有未儲存變更，離開會議模式前會詢問是否存草稿。' : null;
  const riskMessage = activityRisk || dirtyRisk;
  const exitWarning = isDirty
    ? '目前會議草稿有未儲存變更。你可以先存草稿後離開，或直接離開但不保存新變更。'
    : null;

  return {
    stage,
    statusMessage,
    nextActionMessage,
    riskMessage,
    exitWarning,
    canSaveDraft: !saveDraftDisabledReason,
    canRunAi: !aiDisabledReason,
    canPublish: !publishDisabledReason,
    isDirty,
    isPublished,
    isSaving: saving,
    isSynthesizing,
    hasContent,
    hasAiDraft,
    saveDraftDisabledReason,
    aiDisabledReason,
    publishDisabledReason,
  };
};

const getMeetingWorkflowStepStatusLabel = (
  visualState: MeetingWorkflowStepVisualState,
  isRecommended: boolean,
) => {
  if (visualState === 'processing') return '處理中';
  if (visualState === 'complete') return '完成';
  if (visualState === 'optional') return '選用';
  if (isRecommended) return '目前';
  if (visualState === 'available') return '可執行';
  return '未開放';
};

const createMeetingWorkflowStepAction = (
  step: Omit<MeetingWorkflowStepAction, 'statusLabel'>,
): MeetingWorkflowStepAction => ({
  ...step,
  statusLabel: getMeetingWorkflowStepStatusLabel(step.visualState, step.isRecommended),
});

export const getMeetingWorkflowStepActions = (
  state: MeetingRecordActionState,
): MeetingWorkflowStepAction[] => {
  const captureComplete = Boolean(state.hasAiDraft || state.isPublished);
  const aiComplete = Boolean(state.hasAiDraft || state.isPublished);
  const reviewComplete = Boolean(state.isPublished);
  const publishComplete = Boolean(state.isPublished);
  const canUseActions = !state.isPublished && !state.isSynthesizing && !state.isSaving;

  const recommendedStage: MeetingRecordWorkflowStage = state.isPublished
    ? 'published'
    : state.isSynthesizing
      ? 'ai_suggestion'
      : state.hasAiDraft
        ? 'review'
        : 'capture';

  const captureVisualState: MeetingWorkflowStepVisualState = captureComplete
    ? 'complete'
    : recommendedStage === 'capture'
      ? 'current'
      : state.canSaveDraft
        ? 'available'
        : 'locked';

  const aiVisualState: MeetingWorkflowStepVisualState = state.isSynthesizing
    ? 'processing'
    : aiComplete
      ? 'complete'
      : state.canRunAi
        ? 'optional'
        : 'locked';

  const reviewVisualState: MeetingWorkflowStepVisualState = reviewComplete
    ? 'complete'
    : recommendedStage === 'review'
      ? state.canSaveDraft ? 'current' : 'locked'
      : state.hasAiDraft && state.canSaveDraft
        ? 'available'
        : 'locked';

  const publishVisualState: MeetingWorkflowStepVisualState = publishComplete
    ? 'complete'
    : recommendedStage === 'published' && state.canPublish
      ? 'current'
      : state.canPublish
        ? 'available'
        : 'locked';

  return [
    createMeetingWorkflowStepAction({
      stage: 'capture',
      label: '速記',
      actionLabel: state.hasAiDraft ? '存校稿' : '存草稿',
      outcomeLabel: state.hasAiDraft ? '確認後存草稿' : '存草稿，不發布',
      command: 'saveDraft',
      visualState: captureVisualState,
      tone: 'primary',
      isOptional: false,
      ariaDescription: '速記階段。按下後會保存草稿，不會發布。',
      disabledReason: state.saveDraftDisabledReason,
      enabled: canUseActions && state.canSaveDraft,
      isComplete: captureComplete,
      isRecommended: recommendedStage === 'capture' && !state.isPublished,
    }),
    createMeetingWorkflowStepAction({
      stage: 'ai_suggestion',
      label: 'AI整理',
      actionLabel: state.hasAiDraft ? '重新整理' : '整理',
      outcomeLabel: '選用：產生建議',
      command: 'runAi',
      visualState: aiVisualState,
      tone: 'optional',
      isOptional: true,
      ariaDescription: 'AI整理是選用動作。按下後會產生整理建議，不會自動發布。',
      disabledReason: state.aiDisabledReason,
      enabled: canUseActions && state.canRunAi,
      isComplete: aiComplete,
      isRecommended: state.isSynthesizing && !state.isPublished,
    }),
    createMeetingWorkflowStepAction({
      stage: 'review',
      label: '校稿',
      actionLabel: '存校稿',
      outcomeLabel: '確認後存草稿',
      command: 'saveDraft',
      visualState: reviewVisualState,
      tone: 'primary',
      isOptional: false,
      ariaDescription: '校稿階段。按下後會保存校稿草稿，不會發布。',
      disabledReason: state.hasAiDraft ? state.saveDraftDisabledReason : '請先完成 AI整理或手動整理內容。',
      enabled: canUseActions && state.hasAiDraft && state.canSaveDraft,
      isComplete: reviewComplete,
      isRecommended: recommendedStage === 'review' && !state.isPublished,
    }),
    createMeetingWorkflowStepAction({
      stage: 'published',
      label: '發布',
      actionLabel: state.hasAiDraft ? '發布校稿' : '發布目前內容',
      outcomeLabel: '發布目前內容',
      command: 'publish',
      visualState: publishVisualState,
      tone: 'primary',
      isOptional: false,
      ariaDescription: '發布階段。按下後會保存目前編輯器內容為正式紀錄。',
      disabledReason: state.publishDisabledReason,
      enabled: canUseActions && state.canPublish,
      isComplete: publishComplete,
      isRecommended: recommendedStage === 'published',
    }),
  ];
};
