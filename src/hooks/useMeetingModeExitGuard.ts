import React from 'react';
import useBoardStore from '../store/useBoardStore';
import useDialogStore from '../store/useDialogStore';
import useRecordStore from '../store/useRecordStore';
import { useWbsStore } from '../store/useWbsStore';
import { getMeetingRecordActionState } from '../utils/meetingRecordWorkflow';
import { forceFlushMeetingDraft } from './useMeetingDraftRecovery';

export const useMeetingModeExitGuard = () => {
  const { activeWorkspaceId, activeBoardId } = useBoardStore();
  const nodes = useWbsStore(state => state.nodes);
  const draft = useRecordStore(state => state.draft);
  const saving = useRecordStore(state => state.saving);
  const isMeetingMode = useRecordStore(state => state.isMeetingMode);
  const meetingActivities = useRecordStore(state => state.meetingActivities);
  const meetingSynthesisStatus = useRecordStore(state => state.meetingSynthesisStatus);
  const meetingSynthesisError = useRecordStore(state => state.meetingSynthesisError);
  const draftBaselineSignature = useRecordStore(state => state.draftBaselineSignature);
  const lastSaveFeedback = useRecordStore(state => state.lastSaveFeedback);
  const saveDraft = useRecordStore(state => state.saveDraft);
  const closePanel = useRecordStore(state => state.closePanel);
  const showActionDialog = useDialogStore(state => state.showActionDialog);

  const actionState = getMeetingRecordActionState({
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

  return React.useCallback(async () => {
    if (!isMeetingMode) return;

    if (!actionState.isDirty) {
      closePanel();
      return;
    }

    if (await forceFlushMeetingDraft()) {
      closePanel();
      return;
    }

    const choice = await showActionDialog({
      title: '尚未完成本機保存',
      message: '目前內容尚未完成裝置保存，請先重試保護或存成草稿。',
      actions: [
        {
          id: 'retry_flush',
          label: '重試保護',
          description: '完成本機保存後離開，不會發布。',
          variant: 'primary',
        },
        {
          id: 'save_and_exit',
          label: '存草稿後離開',
          description: '以正式草稿保存目前內容後離開。',
          variant: 'secondary',
        },
        {
          id: 'cancel',
          label: '取消',
          variant: 'secondary',
        },
      ],
    });

    if (choice === 'retry_flush') {
      if (await forceFlushMeetingDraft()) closePanel();
      return;
    }

    if (choice === 'save_and_exit') {
      const saved = await saveDraft({ nodes });
      if (saved) closePanel();
    }
  }, [actionState.isDirty, closePanel, isMeetingMode, nodes, saveDraft, showActionDialog]);
};
