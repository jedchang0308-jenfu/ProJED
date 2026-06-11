import React from 'react';
import useBoardStore from '../store/useBoardStore';
import useDialogStore from '../store/useDialogStore';
import useRecordStore from '../store/useRecordStore';
import { useWbsStore } from '../store/useWbsStore';
import { getMeetingRecordActionState } from '../utils/meetingRecordWorkflow';

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
  const exitMeetingMode = useRecordStore(state => state.exitMeetingMode);
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
      exitMeetingMode();
      return;
    }

    const choice = await showActionDialog({
      title: '離開會議模式？',
      message: actionState.exitWarning ?? '目前會議草稿有未儲存變更。',
      actions: [
        {
          id: 'save_and_exit',
          label: '存草稿後離開',
          description: '保存目前編輯器內容為草稿，不會發布。',
          variant: 'primary',
        },
        {
          id: 'exit_without_saving',
          label: '直接離開',
          description: '只離開會議模式，不保存新變更。',
          variant: 'danger',
        },
        {
          id: 'cancel',
          label: '取消',
          variant: 'secondary',
        },
      ],
    });

    if (choice === 'save_and_exit') {
      const saved = await saveDraft({ nodes });
      if (saved) exitMeetingMode();
      return;
    }

    if (choice === 'exit_without_saving') {
      exitMeetingMode();
    }
  }, [actionState.exitWarning, actionState.isDirty, exitMeetingMode, isMeetingMode, nodes, saveDraft, showActionDialog]);
};
