import type {
  KnowledgeRecordStatus,
  KnowledgeRecordType,
  KnowledgeRecordVisibility,
  RecordTaskLinkRole,
} from '../types';

export type MeetingSynthesisWorkflowStatus = 'idle' | 'synthesizing' | 'ready' | 'error';

export type MeetingRecordWorkflowStage = 'capture' | 'ai_suggestion' | 'review' | 'published';

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
  const hasContent = Boolean(draft?.content.trim());
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
    : hasAiDraft
      ? 'review'
      : hasSourceForAi
        ? 'ai_suggestion'
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
              : '目前可直接發布編輯器內容，也可先用 AI整理成校稿。';

  const nextActionMessage = isPublished
    ? '下一步：可離開會議模式，或到紀錄庫查閱。'
    : hasAiDraft
      ? '下一步：人工校稿後按「發布」。'
      : !hasContent
        ? '下一步：輸入會議內容；有內容後即可發布。'
        : '下一步：直接發布，或先按「AI整理」。';

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
    hasContent,
    hasAiDraft,
    saveDraftDisabledReason,
    aiDisabledReason,
    publishDisabledReason,
  };
};
